"""RAG Pipeline: Router, Retrieval, Query Analysis."""

import re

try:
    from ..config import get_config
except ImportError:
    from config import get_config

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

# Phase constants (moved from AIHandler class)
PHASE_SEARCH = "search"
PHASE_RETRIEVAL = "retrieval"



# ── Deprecated functions removed (2026-04-03) ──────────────────────────────
# extract_card_keywords, is_standalone_question, fix_router_queries, rag_router
# All replaced by: rag_analyzer.py (Backend /router) + kg_enrichment.py


def rag_retrieve_cards(precise_queries=None, broad_queries=None, search_scope="current_deck", context=None, max_notes=30, emit_state=None, emit_event=None, suppress_event=False):
    """
    Stage 2: Multi-Query Cascade Retrieval Engine - Führt präzise und breite Queries in Cascade aus

    Args:
        precise_queries: Liste von 3 präzisen Suchanfragen (AND-Verknüpfung)
        broad_queries: Liste von 3 breiten Suchanfragen (OR-Verknüpfung)
        search_scope: "current_deck" oder "collection"
        context: Optionaler Kontext (für Deck-Name und aktuelle Karte)
        max_notes: Maximale Anzahl Notizen (default: 10)
        emit_state: Optional callback(message, phase=None, metadata=None) for AI state emission
        emit_event: Optional callback(event_type, data) for AI event emission

    Returns:
        Dict mit strukturierten Daten:
        {
            "context_string": "Note 123 (found in 2 queries): Field Front: ... Field Back: ...",
            "citations": {
                "12345": {
                    "noteId": 12345,
                    "fields": {"Front": "...", "Back": "..."},
                    "deckName": "Biologie::Pflanzen",
                    "isCurrentCard": False
                }
            }
        }
    """
    try:
        from aqt import mw
        if not mw or not mw.col:
            logger.warning("RAG Retrieval: Keine Anki-Collection verfügbar")
            return {"context_string": "", "citations": {}}

        # Normalize inputs
        precise_queries = precise_queries or []
        broad_queries = broad_queries or []
        # Filter out empty queries
        precise_queries = [q for q in precise_queries if q and q.strip()]
        broad_queries = [q for q in broad_queries if q and q.strip()]

        if not precise_queries and not broad_queries:
            logger.warning("RAG Retrieval: Keine Queries vorhanden")
            return {"context_string": "", "citations": {}}

        try:
            from ..utils.text import clean_html_with_images as clean_html
        except ImportError:
            from utils.text import clean_html_with_images as clean_html

        # Extrahiere Deck-Name für Citations
        deck_name = None
        if context and context.get('deckName'):
            deck_name = context.get('deckName')
        elif search_scope == "current_deck" and context:
            deck_name = context.get('deckName', "Collection")
        else:
            deck_name = "Collection"

        # Dictionary für Note-Aggregation: note_id -> {note_data, query_count, queries_found_in}
        note_results = {}

        # Helper function to build Anki query with deck restriction
        def build_anki_query(query, search_scope, context):
            """Return query as-is. Always searches entire collection."""
            return query

        # Helper function to execute query and aggregate results
        def execute_query(query, query_type, note_results):
            """Führt eine Query aus und aggregiert Ergebnisse in note_results"""
            anki_query = build_anki_query(query, search_scope, context)
            logger.debug("RAG Retrieval: %s Query: %s", query_type, anki_query)

            try:
                logger.info("SQL: mw.col=%s, query='%s'", type(mw.col).__name__ if mw.col else 'None', anki_query[:60])
                card_ids = mw.col.find_cards(anki_query)

                if card_ids:
                    logger.info("%s Query: %s Karten gefunden", query_type, len(card_ids))
                    if emit_state:
                        emit_state(f"Ergebnis: {len(card_ids)} Treffer für '{query[:50]}...'", phase=PHASE_SEARCH)

                    for card_id in card_ids:
                        try:
                            card = mw.col.get_card(card_id)
                            if not card:
                                continue

                            note = card.note()
                            note_id = note.id

                            if note_id not in note_results:
                                note_results[note_id] = {
                                    'note': note,
                                    'card_ids': [],
                                    'query_count': 0,
                                    'queries_found_in': []
                                }

                            if query_type not in note_results[note_id]['queries_found_in']:
                                note_results[note_id]['queries_found_in'].append(query_type)
                                note_results[note_id]['query_count'] += 1

                            if card_id not in note_results[note_id]['card_ids']:
                                note_results[note_id]['card_ids'].append(card_id)

                        except (AttributeError, KeyError, IndexError, ValueError) as e:
                            logger.warning("RAG Retrieval: Fehler bei Karte %s: %s", card_id, e)
                            continue
                    return len(card_ids)
                else:
                    logger.warning("%s Query: Keine Karten gefunden", query_type)
                    if emit_state:
                        emit_state(f"Ergebnis: 0 Treffer für '{query[:50]}...'", phase=PHASE_SEARCH)
                    return 0

            except (AttributeError, RuntimeError, OSError) as e:
                logger.warning("RAG Retrieval: Fehler bei %s Query: %s", query_type, e)
                return 0

        # CASCADE LOGIC: Phase 1 - Precise Queries
        # CRITICAL: Deduplicate queries before processing
        normalized_precise = [q.strip().lower() for q in precise_queries if q and q.strip()]
        unique_precise = list(dict.fromkeys(normalized_precise))  # Preserves order, removes duplicates
        # Map back to original queries (case-sensitive) but deduplicated
        seen_normalized = set()
        deduplicated_precise = []
        for q in precise_queries:
            if not q or not q.strip():
                continue
            normalized = q.strip().lower()
            if normalized not in seen_normalized:
                seen_normalized.add(normalized)
                deduplicated_precise.append(q)

        if emit_state:
            emit_state("Präzise Suche...", phase=PHASE_SEARCH)
        precise_results_count = 0
        for i, query in enumerate(deduplicated_precise):
            if emit_state:
                emit_state(f"Suche: {query[:50]}...", phase=PHASE_SEARCH)
            count = execute_query(query, f"precise_{i+1}", note_results)
            precise_results_count += count

        # Count unique notes after precise queries
        unique_notes = len(note_results)
        logger.debug("RAG Retrieval: Präzise Suche abgeschlossen: %s eindeutige Notizen gefunden", unique_notes)

        # Check if we have enough results (>= 3, was 5 — OR queries add too much noise)
        if unique_notes >= 3:
            if emit_state:
                emit_state(f"Präzise Suche: {unique_notes} Treffer (ausreichend)", phase=PHASE_SEARCH)
            logger.info("RAG Retrieval: Genug Ergebnisse (%s), stoppe Suche", unique_notes)
        else:
            # CASCADE LOGIC: Phase 2 - Broad Queries (wenn nicht genug Ergebnisse)
            if emit_state:
                emit_state(f"Präzise Suche: {unique_notes} Treffer (zu wenig, erweitere Suche...)", phase=PHASE_SEARCH)

            if broad_queries:
                # CRITICAL: Deduplicate broad queries before processing
                seen_normalized_broad = set()
                deduplicated_broad = []
                for q in broad_queries:
                    if not q or not q.strip():
                        continue
                    normalized = q.strip().lower()
                    if normalized not in seen_normalized_broad:
                        seen_normalized_broad.add(normalized)
                        deduplicated_broad.append(q)

                if emit_state:
                    emit_state("Erweiterte Suche...", phase=PHASE_SEARCH)
                broad_results_count = 0
                for i, query in enumerate(deduplicated_broad):
                    if emit_state:
                        emit_state(f"Suche: {query[:50]}...", phase=PHASE_SEARCH)
                    count = execute_query(query, f"broad_{i+1}", note_results)
                    broad_results_count += count

                # Update unique count after broad queries
                unique_notes = len(note_results)
                logger.debug("RAG Retrieval: Erweiterte Suche abgeschlossen: %s eindeutige Notizen gefunden (Gesamt)", unique_notes)
                # Count how many new notes were added by broad queries
                broad_notes_count = len([n for n in note_results.values() if any('broad' in str(q) for q in n.get('queries_found_in', []))])
                precise_notes_count = unique_notes - broad_notes_count
                if emit_state:
                    emit_state(f"Erweiterte Suche: +{broad_notes_count} Treffer (Gesamt: {unique_notes})", phase=PHASE_SEARCH)
            else:
                logger.warning("RAG Retrieval: Keine broad_queries verfügbar für Erweiterung")

        # Ranking: Sortiere nach query_count (absteigend), dann nach note_id
        ranked_notes = sorted(
            note_results.items(),
            key=lambda x: (x[1]['query_count'], x[0]),
            reverse=True
        )

        # Limit auf top max_notes
        ranked_notes = ranked_notes[:max_notes]

        # Fallback: Pure Keyword Search (ohne Deck-Restriction) wenn keine Ergebnisse
        if len(ranked_notes) == 0:
            logger.warning("RAG Retrieval: Keine Notizen gefunden, versuche Fallback: Pure Keyword Search")
            if emit_state:
                emit_state("Fallback: Reine Keyword-Suche...", phase=PHASE_SEARCH)

            # Extrahiere Haupt-Keywords aus der ersten precise query
            fallback_query = ""
            if precise_queries and len(precise_queries) > 0:
                fallback_query = precise_queries[0]
            elif broad_queries and len(broad_queries) > 0:
                fallback_query = broad_queries[0]

            # Entferne deck: und tag: Restrictions, behalte nur Keywords
            # Entferne deck: und tag: Präfixe
            fallback_query = re.sub(r'(deck|tag):["\']?[^"\'\s\)]+["\']?\s*', '', fallback_query, flags=re.IGNORECASE)
            # Entferne überflüssige Klammern und Whitespace
            fallback_query = re.sub(r'[\(\)]', ' ', fallback_query)
            fallback_query = ' '.join(fallback_query.split())

            if fallback_query:
                try:
                    logger.debug("RAG Retrieval: Fallback-Query (ohne Deck-Restriction): %s", fallback_query)
                    card_ids = mw.col.find_cards(fallback_query)

                    if card_ids:
                        logger.info("Fallback: %s Karten gefunden", len(card_ids))

                        # Aggregiere Notizen
                        for card_id in card_ids[:max_notes * 2]:  # Mehr Karten für Fallback
                            try:
                                card = mw.col.get_card(card_id)
                                if not card:
                                    continue

                                note = card.note()
                                note_id = note.id

                                if note_id not in note_results:
                                    note_results[note_id] = {
                                        'note': note,
                                        'card_ids': [card_id],
                                        'query_count': 1,
                                        'queries_found_in': ['fallback']
                                    }

                            except (AttributeError, KeyError, IndexError, ValueError) as e:
                                logger.warning("RAG Retrieval: Fehler bei Fallback-Karte %s: %s", card_id, e)
                                continue

                    # Neu sortieren nach Fallback-Ergebnissen (nach der Schleife)
                    ranked_notes = sorted(
                        note_results.items(),
                        key=lambda x: (x[1]['query_count'], x[0]),
                        reverse=True
                    )[:max_notes]

                except (AttributeError, RuntimeError, OSError) as e:
                    logger.warning("RAG Retrieval: Fallback-Fehler: %s", e)

        if len(ranked_notes) == 0:
            logger.warning("RAG Retrieval: Keine Notizen gefunden (auch nicht im Fallback)")
            return {"context_string": "", "citations": {}}

        logger.info("RAG Retrieval: %s Notizen nach Ranking (Top %s)", len(ranked_notes), max_notes)

        # Note Expansion: Iteriere über alle Felder für jede Note
        formatted_notes = []
        citations = {}

        for note_id, note_data in ranked_notes:
            try:
                note = note_data['note']
                query_count = note_data['query_count']
                queries_found = note_data['queries_found_in']
                first_card_id = note_data['card_ids'][0] if note_data.get('card_ids') else note_id

                # Iteriere über ALLE Felder der Note
                note_fields = {}
                all_images = []

                for field_name, field_value in note.items():
                    if field_value and field_value.strip():
                        # Bereinige HTML und extrahiere Bilder
                        field_clean, field_images = clean_html(field_value, max_len=1000)
                        note_fields[field_name] = field_clean
                        all_images.extend(field_images)

                # Entferne Duplikate bei Bildern
                seen_images = set()
                unique_images = []
                for img in all_images:
                    if img not in seen_images:
                        seen_images.add(img)
                        unique_images.append(img)

                # Formatiere Note für Context-String — [index] statt Note-ID
                index = len(formatted_notes) + 1  # 1-based index
                note_parts = [f"[{index}] (found in {query_count} queries: {', '.join(queries_found)}):"]

                for field_name, field_clean in note_fields.items():
                    note_parts.append(f"Field {field_name}: {field_clean}")

                if unique_images:
                    images_str = ", ".join(unique_images)
                    note_parts.append(f"Available Images: {images_str}")

                note_str = "\n".join(note_parts)
                formatted_notes.append(note_str)

                # Erstelle Citation-Objekt mit allen Feldern
                citation_fields = {}
                for field_name, field_clean in note_fields.items():
                    # Erste 100 Zeichen pro Feld für Citation
                    citation_fields[field_name] = field_clean[:100] if field_clean else ""

                citations[str(note_id)] = {
                    "noteId": note_id,
                    "cardId": first_card_id,  # Erste Card-ID
                    "fields": citation_fields,
                    "deckName": deck_name,
                    "isCurrentCard": False,  # Will be set to True for current card below
                    "index": index  # Stable index for [N] inline references
                }

            except (AttributeError, KeyError, IndexError, ValueError) as e:
                logger.warning("RAG Retrieval: Fehler bei Note %s: %s", note_id, e)
                continue

        # BEREICH 2: Füge aktuelle Karte zu Citations hinzu
        if context and context.get('noteId'):
            current_note_id = context.get('noteId')
            current_card_id = context.get('cardId')
            current_fields = context.get('fields', {})
            current_deck_name = context.get('deckName', deck_name)

            # Erstelle Citation für aktuelle Karte
            citation_fields = {}
            for field_name, field_value in current_fields.items():
                if field_value:
                    # Bereinige HTML
                    field_clean = re.sub(r'<[^>]+>', ' ', str(field_value))
                    field_clean = re.sub(r'\s+', ' ', field_clean).strip()
                    citation_fields[field_name] = field_clean[:100] if field_clean else ""

            # Füge aktuelle Karte hinzu (überschreibt falls bereits vorhanden)
            # Index: use existing index if card was already retrieved, else next available
            _existing = citations.get(str(current_note_id), {})
            _current_index = _existing.get("index") or (len(citations) + 1)
            citations[str(current_note_id)] = {
                "noteId": current_note_id,
                "cardId": current_card_id,
                "fields": citation_fields,
                "deckName": current_deck_name,
                "isCurrentCard": True,  # WICHTIG: Flag für Frontend
                "index": _current_index,  # Stable index for [N] inline references
            }
            logger.info("RAG Retrieval: Aktuelle Karte (Note %s) zu Citations hinzugefügt", current_note_id)

        # Erstelle Context-String aus formatierten Notizen
        context_string = "\n\n".join(formatted_notes)

        # Emit sources count to frontend
        if len(citations) > 0:
            if emit_state:
                emit_state(f"Gefunden: {len(citations)} Module", phase=PHASE_RETRIEVAL, metadata={"sourceCount": len(citations)})
            # CRITICAL: Emit full citation data to frontend for live display
            if emit_event:
                emit_event("rag_sources", citations)

        logger.info("RAG Retrieval: %s Notizen formatiert, %s Citations erstellt", len(formatted_notes), len(citations))
        return {
            "context_string": context_string,
            "citations": citations
        }

    except Exception as e:
        logger.exception("RAG Retrieval Fehler: %s", e)
        return {"context_string": "", "citations": {}}
