"""RAG Pipeline: Router, Retrieval, Query Analysis."""

import re
import json
import time
import requests

try:
    from ..config import get_config, is_backend_mode, get_backend_url, get_auth_token
except ImportError:
    from config import get_config, is_backend_mode, get_backend_url, get_auth_token

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

# Phase constants (moved from AIHandler class)
PHASE_SEARCH = "search"
PHASE_RETRIEVAL = "retrieval"


def extract_card_keywords(context):
    """Extract meaningful keywords from the current card for query building."""
    keywords = []
    if not context:
        return keywords

    for field in ['frontField', 'question', 'answer']:
        text = context.get(field, '')
        if text:
            # Strip HTML tags AND their content for style/script blocks
            clean = re.sub(r'<style[^>]*>.*?</style>', ' ', text, flags=re.DOTALL | re.IGNORECASE)
            clean = re.sub(r'<script[^>]*>.*?</script>', ' ', clean, flags=re.DOTALL | re.IGNORECASE)
            # Strip remaining HTML tags
            clean = re.sub(r'<[^>]+>', ' ', clean)
            # Strip Anki cloze markers, keep content
            clean = re.sub(r'\{\{c\d+::(.*?)(?:::.*?)?\}\}', r'\1', clean)
            clean = re.sub(r'\s+', ' ', clean).strip()
            # Filter: skip CSS/HTML artifacts and common stop words
            css_words = {'color', 'important', 'button', 'border', 'background', 'font',
                         'cursor', 'display', 'margin', 'padding', 'width', 'height',
                         'style', 'class', 'nightmode', 'none', 'solid', 'rgba', 'auto',
                         'text', 'align', 'left', 'right', 'center', 'bold', 'italic',
                         'pointer', 'block', 'inline', 'relative', 'absolute', 'hidden',
                         'overflow', 'transform', 'transition', 'opacity', 'inherit'}
            stop_words = {'und', 'oder', 'der', 'die', 'das', 'ein', 'eine', 'ist',
                          'sind', 'hat', 'haben', 'wird', 'werden', 'kann', 'können',
                          'bei', 'von', 'mit', 'auf', 'für', 'aus', 'nach', 'über',
                          'sich', 'dem', 'den', 'des', 'einer', 'einem', 'eines',
                          'nicht', 'auch', 'noch', 'aber', 'wenn', 'dass', 'wie',
                          'the', 'and', 'for', 'with', 'from', 'this', 'that', 'which'}
            skip = css_words | stop_words
            words = [w for w in clean.split()
                     if len(w) > 3 and w[0].isalpha()
                     and w.lower() not in skip
                     and not w.startswith('#')  # hex colors
                     and not re.match(r'^\d+[a-f]+$', w.lower())  # hex values like 363638
                     ]
            keywords.extend(words[:10])

    # Deduplicate while preserving order
    seen = set()
    unique = []
    for w in keywords:
        wl = w.lower()
        if wl not in seen:
            seen.add(wl)
            unique.append(w)
    return unique[:15]


def is_standalone_question(user_message, context):
    """Detect if a question is about a DIFFERENT topic than the current card.

    Logic is inverted: assume context-dependent by default when a card is open.
    Only return True (standalone) if the question contains domain-specific words
    that don't appear on the current card.
    """
    if not context:
        return True  # No card context — must be standalone

    msg = user_message.lower().strip()

    # Very short messages are always about the card
    if len(msg) < 40:
        return False

    # Extract words from user message (>3 chars, alpha)
    user_words = set(w.lower() for w in re.findall(r'[A-Za-zÄÖÜäöüß]{4,}', msg))

    # Common non-domain words that don't indicate a topic change
    generic = {'kannst', 'könntest', 'würdest', 'bitte', 'einmal', 'nochmal',
               'genauer', 'ausführlich', 'kurz', 'einfach', 'erkläre', 'erklär',
               'beschreibe', 'vergleiche', 'zeige', 'hilf', 'sagen', 'machen',
               'wissen', 'verstehe', 'verstehen', 'kapiere', 'check', 'lerne',
               'lernen', 'merken', 'einprägen', 'behalten', 'wiederholen',
               'zusammenfassen', 'überblick', 'übersicht', 'übung', 'beispiel',
               'wichtig', 'relevant', 'warum', 'wieso', 'weshalb', 'wofür',
               'denkst', 'meinst', 'findest', 'glaubst', 'gibt', 'gibt',
               'dieses', 'diese', 'dieser', 'damit', 'davon', 'darüber',
               'what', 'explain', 'describe', 'compare', 'help', 'think'}

    # Domain words = user words minus generic
    domain_words = user_words - generic

    if not domain_words:
        return False  # Only generic words — must be about the card

    # Check if any domain word appears in the card content
    card_keywords = set(kw.lower() for kw in extract_card_keywords(context))

    overlap = domain_words & card_keywords
    if overlap:
        return False  # Domain words overlap with card — context-dependent

    # Domain words present but DON'T overlap with card — likely standalone
    # But only if there are enough domain words to be confident
    if len(domain_words) >= 2:
        logger.debug("_is_standalone: domain_words=%s, card_keywords=%s -> STANDALONE", domain_words, list(card_keywords)[:5])
        return True

    # Single domain word — ambiguous, default to context-dependent
    return False


def fix_router_queries(router_result, user_message, context):
    """Post-process router result: if question is context-dependent but queries don't contain card keywords, fix them."""
    logger.debug("_fix_router_queries: router_result=%s, context=%s, search_needed=%s", bool(router_result), bool(context), router_result.get('search_needed') if router_result else None)
    if not router_result or not context:
        logger.debug("_fix_router_queries: Skipping (no router_result or no context)")
        return router_result
    if not router_result.get('search_needed', False):
        return router_result

    standalone = is_standalone_question(user_message, context)
    logger.debug("_fix_router_queries: is_standalone=%s for '%s'", standalone, user_message[:50])
    if standalone:
        return router_result  # Standalone question about a different topic — trust the router

    card_keywords = extract_card_keywords(context)
    logger.debug("_fix_router_queries: card_keywords=%s", card_keywords[:5])
    if not card_keywords:
        return router_result

    # Check if any card keyword appears in the queries
    all_queries = ' '.join(router_result.get('precise_queries', []) + router_result.get('broad_queries', []))
    card_kw_lower = {kw.lower() for kw in card_keywords}
    query_words = set(all_queries.lower().split())

    has_card_keywords = bool(card_kw_lower & query_words)
    if has_card_keywords:
        return router_result  # Router did its job correctly

    # Router failed — override queries with card keywords
    logger.warning("Router-Fix: Kontextbezogene Frage erkannt aber Router nutzt keine Karten-Keywords. Korrigiere Queries.")
    top_kw = card_keywords[:6]

    # Build AND queries from top keywords
    precise = []
    for i in range(0, min(len(top_kw), 6), 2):
        pair = top_kw[i:i+2]
        if len(pair) == 2:
            precise.append(f"{pair[0]} AND {pair[1]}")
        else:
            precise.append(pair[0])

    # Build OR queries
    broad = [' OR '.join(top_kw[:4])]
    if len(top_kw) > 4:
        broad.append(' OR '.join(top_kw[2:6]))

    router_result['precise_queries'] = precise[:3]
    router_result['broad_queries'] = broad[:3]
    # Build 2 embedding queries from different keyword subsets
    if len(top_kw) >= 4:
        router_result['embedding_queries'] = [' '.join(top_kw[:3]), ' '.join(top_kw[2:5])]
    else:
        router_result['embedding_queries'] = [' '.join(top_kw)]
    router_result['search_scope'] = 'current_deck'
    # Force hybrid retrieval since we're adding keyword queries
    router_result['retrieval_mode'] = 'both'

    logger.info("Router-Fix: precise=%s, broad=%s, embedding_queries=%s, mode=both", precise, broad, router_result['embedding_queries'])
    return router_result


def rag_router(user_message, context=None, config=None, emit_step=None):
    """DEPRECATED: Use unified_route() in router.py instead.
    Kept as fallback for Level 1/2 routing (lock/heuristic) where search
    strategy is not included in the routing result.

    Stage 1: Router - Analysiert die Anfrage und entscheidet ob und wie gesucht werden soll.

    Args:
        user_message: Die Benutzer-Nachricht
        context: Optionaler Kontext (z.B. aktuelle Karte)
        config: Config dict (if None, will be loaded via get_config)
        emit_step: Optional callback(step, status, data=None) for pipeline step emission

    Returns:
        Dict mit search_needed, retrieval_mode, embedding_query, precise_queries, broad_queries, search_scope
        Oder None bei Fehler (dann wird search_needed=False angenommen)
    """
    try:
        config = get_config(force_reload=True)

        # Prüfe ob Backend-Modus aktiv ist
        # Prefer direct API key when available
        api_key = config.get("api_key", "")
        use_backend = is_backend_mode() and get_auth_token() and not api_key
        if not use_backend and not api_key:
            return None

        # Router-Modell: gemini-2.5-flash (schnell, direkte API ~1s)
        # Fallback: gemini-3-flash-preview
        router_model = "gemini-2.5-flash"
        fallback_model = "gemini-3-flash-preview"

        # Subagent routing removed — handled by ai/router.py in Stage 0

        # Emit pipeline step
        if emit_step:
            emit_step("router", "active")

        # Fetch lastAssistantMessage from session storage
        last_assistant_message = ""
        try:
            try:
                from ..storage import card_sessions as card_sessions_storage
            except ImportError:
                from storage import card_sessions as card_sessions_storage
            if context and context.get('cardId'):
                session_data = card_sessions_storage.load_card_session(context['cardId'])
                messages = session_data.get('messages', [])
                for msg in reversed(messages):
                    if msg.get('sender') == 'bot':
                        last_assistant_message = (msg.get('text', '') or '')[:300]
                        break
        except (AttributeError, KeyError, TypeError) as e:
            logger.debug("router: last assistant message lookup error: %s", e)

        # Extrahiere Karteninhalt
        card_question = ""
        card_answer = ""
        deck_name = ""
        extra_fields = ""

        if context:
            question_raw = context.get('question') or context.get('frontField') or ""
            answer_raw = context.get('answer') or ""
            deck_name = context.get('deckName') or ""
            fields = context.get('fields', {})

            if question_raw:
                card_question = re.sub(r'<[^>]+>', ' ', question_raw)
                card_question = re.sub(r'\s+', ' ', card_question).strip()[:500]
            if answer_raw:
                card_answer = re.sub(r'<[^>]+>', ' ', answer_raw)
                card_answer = re.sub(r'\s+', ' ', card_answer).strip()[:500]

            # Wichtige Felder hinzufügen (falls vorhanden)
            if fields:
                extra_lines = []
                for field_name, field_value in list(fields.items())[:3]:
                    if field_value and field_name not in ['question', 'answer', 'Front', 'Back']:
                        field_clean = re.sub(r'<[^>]+>', ' ', str(field_value))
                        field_clean = re.sub(r'\s+', ' ', field_clean).strip()
                        if field_clean and len(field_clean) > 10:
                            extra_lines.append(f"- {field_name}: {field_clean[:200]}")
                if extra_lines:
                    extra_fields = "\n".join(extra_lines)

        # Extract card tags
        card_tags = []
        if context and context.get('tags'):
            card_tags = context['tags']
        elif context and context.get('cardId'):
            try:
                from aqt import mw
                card = mw.col.get_card(context['cardId'])
                note = card.note()
                card_tags = list(note.tags)
            except (AttributeError, KeyError) as e:
                logger.debug("router: card tags lookup error: %s", e)

        # Debug-Logging
        logger.debug("Router: user_message='%s', has_context=%s, deck=%s", user_message[:100], bool(context), deck_name)
        logger.debug("Router: card_question='%s', card_answer='%s'", card_question[:100] if card_question else 'LEER', card_answer[:80] if card_answer else 'LEER')
        logger.debug("Router: context keys=%s", list(context.keys()) if context else 'None')

        router_prompt = f"""You are a search router for a flashcard learning app. Decide whether and how to search the user's card collection.

User message: "{user_message}"
{f'Last assistant response: "{last_assistant_message[:200]}"' if last_assistant_message else ''}

Current card (the one the user is studying right now):
- Question: {card_question}
- Answer: {card_answer}
- Deck: {deck_name}
- Tags: {', '.join(card_tags) if card_tags else 'none'}
{extra_fields}

Respond with JSON ONLY:
{{
  "search_needed": true/false,
  "retrieval_mode": "sql" | "semantic" | "both",
  "response_length": "short" | "medium" | "long",
  "embedding_queries": ["semantic search text 1", "semantic search text 2"],
  "precise_queries": ["keyword1 AND keyword2", ...],
  "broad_queries": ["keyword1 OR keyword2", ...],
  "search_scope": "current_deck" | "collection",
  "max_sources": "low" | "medium" | "high"
}}

DECISION TREE (follow in order):
1. Is this small talk, thanks, greeting, or a meta-question about the app? → search_needed=false
2. Does the user ask a factual/learning question? → search_needed=true (continue below)
4. Can the current card ALONE fully answer the question? → search_needed=false (rare — only if the card text obviously contains the complete answer)

CONTEXT DETECTION (CRITICAL):
First determine: does the question refer to the current card/conversation, or is it a standalone topic?

Context-dependent signals: "what does that mean", "explain this", "I don't understand", pronouns ("this", "it", "that"), vague references, follow-up questions.
→ For context-dependent questions: Use card keywords + last response to create specific queries.
  embedding_queries MUST contain the card's key terms from DIFFERENT perspectives.
  Example: Card="K cells GIP", Question="I don't get it"
  → embedding_queries=["K cells GIP duodenum endocrine cells localization", "GIP insulin secretion gastric acid gastrointestinal hormones effect"]

Standalone signals: Contains domain-specific terms NOT on the current card.
→ For standalone questions: Ignore card context, create queries from the question itself.
  Example: Card="Nucleotide", Question="what is the volume of the heart?"
  → embedding_queries=["heart volume stroke volume cardiac output", "ejection fraction cardiac pump function"]

QUERY RULES:
- embedding_queries: 2-3 semantic search texts from DIFFERENT perspectives/aspects. NEVER copy the user's question verbatim. Always expand to domain-specific search terms.
- precise_queries: 2-3 AND-queries from relevant keywords (card OR question, depending on context)
- broad_queries: 2-3 OR-queries for broader search
- search_scope: "current_deck" by default, "collection" only for cross-subject questions
- retrieval_mode: "both" by default, "sql" for exact facts/names, "semantic" for conceptual questions
- max_sources: "low" (3-5, simple fact questions), "medium" (8-10, standard explanations), "high" (up to 15, comparisons/overviews)
- response_length: "short" for simple facts, "medium" for explanations, "long" for detailed comparisons"""

        # Backend-Modus: Router über Cloud Function (API-Key serverseitig)
        if use_backend:
            try:
                backend_url = get_backend_url()
                auth_token = get_auth_token()
                router_url = f"{backend_url}/router"
                router_headers = {
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {auth_token}"
                }
                card_context = None
                if context:
                    card_context = {
                        "question": context.get('question') or context.get('frontField') or "",
                        "answer": context.get('answer') or "",
                        "deckName": context.get('deckName') or "",
                        "tags": card_tags
                    }
                router_payload = {
                    "message": user_message,
                    "lastAssistantMessage": last_assistant_message
                }
                if card_context:
                    router_payload["cardContext"] = card_context

                logger.debug("Router: Backend-Aufruf an %s", router_url)
                response = requests.post(router_url, json=router_payload, headers=router_headers, timeout=15)
                response.raise_for_status()
                router_result = response.json()

                if router_result.get("search_needed") is not None:
                    logger.info("Router (Backend): search_needed=%s", router_result.get('search_needed'))
                    # Weiter zur Validierung unten (gleicher Code wie bei direkter API)
            except (OSError, ValueError, requests.exceptions.RequestException) as be:
                logger.warning("Router: Backend-Fehler: %s", be)
                return None

        # Validate backend result
        if 'router_result' in locals() and router_result and router_result.get("search_needed") is not None:
            # Validierung des Backend-Ergebnisses
            retrieval_mode = router_result.get('retrieval_mode', 'both')
            if retrieval_mode not in ('sql', 'semantic', 'both'):
                retrieval_mode = 'both'
            router_result['retrieval_mode'] = retrieval_mode

            precise_queries = router_result.get("precise_queries", [])
            broad_queries = router_result.get("broad_queries", [])
            if not isinstance(precise_queries, list):
                precise_queries = []
            if not isinstance(broad_queries, list):
                broad_queries = []
            while len(precise_queries) < 3:
                precise_queries.append("")
            while len(broad_queries) < 3:
                broad_queries.append("")
            router_result["precise_queries"] = precise_queries[:3]
            router_result["broad_queries"] = broad_queries[:3]

            scope_label = ""
            if deck_name:
                scope_label = deck_name.split("::")[-1]
            if emit_step:
                emit_step("router", "done", {
                    "search_needed": router_result.get("search_needed", True),
                    "retrieval_mode": retrieval_mode,
                    "scope": router_result.get("search_scope", "current_deck"),
                        "scope_label": scope_label,
                        "max_sources": router_result.get("max_sources", "medium"),
                        "response_length": router_result.get("response_length", "medium")
                    })

            logger.info("Router (Backend): search_needed=%s, retrieval_mode=%s", router_result.get('search_needed'), retrieval_mode)
            return fix_router_queries(router_result, user_message, context)

        # No backend result — return None (direct API fallback removed)
        logger.warning("Router: Backend did not return a result, returning None")
        return None

    except Exception as e:
        logger.exception("Router Fehler: %s", e)

        # Emit pipeline error
        if emit_step:
            emit_step("router", "error")

        # Fallback: Versuche Keywords aus Karteninhalt zu extrahieren
        fallback_precise = []
        fallback_broad = []
        fallback_embedding = ""
        if context:
            question = context.get('question') or context.get('frontField') or ""
            answer = context.get('answer') or ""

            if question or answer:
                from collections import Counter

                card_text = f"{question} {answer}".lower()
                card_text = re.sub(r'<[^>]+>', ' ', card_text)
                card_text = re.sub(r'[^\w\s]', ' ', card_text)
                card_words = card_text.split()

                stopwords = {'der', 'die', 'das', 'und', 'oder', 'ist', 'sind', 'wird', 'werden', 'auf', 'in', 'zu', 'für', 'mit', 'von', 'ein', 'eine', 'einer', 'einem', 'einen', 'mir', 'dir', 'uns', 'ihr', 'ihm', 'sie', 'er', 'es', 'diese', 'dieser', 'dieses', 'diesen', 'dem', 'den', 'des', 'wo', 'was', 'wie', 'wenn', 'dass', 'sich', 'nicht', 'kein', 'keine', 'keinen', 'gib', 'gibt', 'geben', 'hint', 'hinweis', 'antwort', 'verraten', 'verrate'}
                important_words = [w for w in card_words if len(w) > 3 and w not in stopwords]

                if important_words:
                    word_freq = Counter(important_words)
                    top_words = [word for word, count in word_freq.most_common(5)]

                    if top_words:
                        fallback_embedding = " ".join(top_words[:5])
                        fallback_precise = [
                            " AND ".join(top_words[:3]),
                            " AND ".join(top_words[1:4]) if len(top_words) >= 4 else " AND ".join(top_words[:3]),
                            " AND ".join(top_words[2:5]) if len(top_words) >= 5 else " AND ".join(top_words[:3])
                        ]
                        fallback_broad = [
                            " OR ".join(top_words[:5]),
                            " OR ".join(top_words[1:]) if len(top_words) >= 2 else " OR ".join(top_words),
                            " OR ".join(top_words)
                        ]
                        logger.info("Router Exception-Fallback: Keywords aus Karte extrahiert: %s", top_words[:5])

        if not fallback_precise:
            user_words = [w for w in user_message.lower().split() if len(w) > 3 and w not in {'hint', 'hinweis', 'antwort', 'verraten', 'verrate', 'gib', 'gibt', 'geben', 'mir', 'dir', 'uns', 'einen', 'eine', 'ohne', 'die', 'der', 'das'}]
            if user_words:
                fallback_embedding = " ".join(user_words[:5])
                fallback_precise = [
                    " AND ".join(user_words[:3]),
                    " AND ".join(user_words[1:4]) if len(user_words) >= 4 else " AND ".join(user_words[:3]),
                    " AND ".join(user_words[2:5]) if len(user_words) >= 5 else " AND ".join(user_words[:3])
                ]
                fallback_broad = [
                    " OR ".join(user_words[:5]),
                    " OR ".join(user_words[1:]) if len(user_words) >= 2 else " OR ".join(user_words),
                    " OR ".join(user_words)
                ]
                logger.warning("Router Exception-Fallback: Verwende minimale Keywords aus Nutzeranfrage: %s", user_words[:5])
            else:
                words = user_message.split()[:3]
                fallback_embedding = " ".join(words)
                fallback_precise = [" AND ".join(words)] * 3
                fallback_broad = [" OR ".join(words)] * 3
                logger.warning("Router Exception-Fallback: Letzter Fallback mit ersten Wörtern: %s", words)

        return {
            "search_needed": True,
            "retrieval_mode": "both",
            "embedding_queries": [fallback_embedding] if fallback_embedding else [],
            "precise_queries": fallback_precise[:3] if fallback_precise else ["", "", ""],
            "broad_queries": fallback_broad[:3] if fallback_broad else ["", "", ""],
            "search_scope": "current_deck"
        }


def rag_retrieve_cards(precise_queries=None, broad_queries=None, search_scope="current_deck", context=None, max_notes=10, emit_state=None, emit_event=None):
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
            """Konstruiere Anki-Suchquery mit korrekter Deck-Name-Quote-Behandlung"""
            if search_scope == "current_deck" and context and context.get('deckName'):
                deck_name_query = context.get('deckName')
                if 'deck:' in query.lower():
                    pattern = r'deck:(["\']?)([^"\'\s\)]+(?:\s+[^"\'\s\)]+)*)\1'
                    def replace_deck(match):
                        deck_val = match.group(2)
                        deck_val = deck_val.strip('"\'')
                        return f'deck:"{deck_val}"'
                    return re.sub(pattern, replace_deck, query, flags=re.IGNORECASE)
                else:
                    return f'deck:"{deck_name_query}" ({query})'
            else:
                return query

        # Helper function to execute query and aggregate results
        def execute_query(query, query_type, note_results):
            """Führt eine Query aus und aggregiert Ergebnisse in note_results"""
            anki_query = build_anki_query(query, search_scope, context)
            logger.debug("RAG Retrieval: %s Query: %s", query_type, anki_query)

            try:
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

        # Check if we have enough results (>= 5)
        if unique_notes >= 5:
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

                # Formatiere Note für Context-String
                note_parts = [f"Note {note_id} (found in {query_count} queries: {', '.join(queries_found)}):"]

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
                    "isCurrentCard": False  # Will be set to True for current card below
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
            citations[str(current_note_id)] = {
                "noteId": current_note_id,
                "cardId": current_card_id,
                "fields": citation_fields,
                "deckName": current_deck_name,
                "isCurrentCard": True  # WICHTIG: Flag für Frontend
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
