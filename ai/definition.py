"""Definition Agent — generates term definitions from card content.

Formalizes the KGDefinitionThread (ui/widget.py:750-874) as a registered agent.
Uses CitationBuilder for card references and caches results in KG store.
"""

import threading

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)


def run_definition(situation, emit_step=None, memory=None,
                   stream_callback=None, citation_builder=None, **kwargs):
    """Generate a definition for a term from the current card corpus.

    Args:
        situation: The term to define (passed as 'situation' in agent interface).
        emit_step: Optional callback for ThoughtStream steps.
        memory: Optional memory context (unused for now).
        stream_callback: Optional streaming callback (unused — output is synchronous).
        citation_builder: CitationBuilder instance for card references.
        **kwargs: May include 'search_query' for the original search context.

    Returns:
        dict with keys: text, citations, connectedTerms, sourceCount, generatedBy.
        On error or empty input: {text: '', citations: [], error: '...'}.
    """
    term = (situation or '').strip()

    # Empty term — fast return
    if not term:
        return {'text': '', 'citations': [], 'connectedTerms': [], 'sourceCount': 0}

    if citation_builder is None:
        try:
            from .citation_builder import CitationBuilder
        except ImportError:
            from ai.citation_builder import CitationBuilder
        citation_builder = CitationBuilder()

    search_query = kwargs.get('search_query')

    try:
        try:
            from ..storage.kg_store import (
                get_definition, get_term_card_ids,
                save_definition, get_connected_terms,
            )
            from .. import get_embedding_manager
        except ImportError:
            from storage.kg_store import (
                get_definition, get_term_card_ids,
                save_definition, get_connected_terms,
            )
            from __init__ import get_embedding_manager

        # ── 1. Cache check ──────────────────────────────────────────────────
        cached = get_definition(term)
        if cached:
            connected = get_connected_terms(term)
            # Rebuild citations from cached cardRefs
            card_refs_raw = cached.get('cardRefs', {})
            for key in sorted(card_refs_raw.keys(), key=lambda k: int(k)):
                ref = card_refs_raw[key]
                try:
                    cid = int(ref.get('id', 0))
                except (ValueError, TypeError):
                    cid = 0
                citation_builder.add_card(
                    card_id=cid,
                    note_id=cid,
                    deck_name='',
                    front=ref.get('question', ''),
                )
            return {
                'text': cached.get('definition', ''),
                'citations': citation_builder.build(),
                'connectedTerms': connected,
                'sourceCount': cached.get('sourceCount', len(card_refs_raw)),
                'generatedBy': cached.get('generatedBy', 'cache'),
            }

        # ── 2. Embedding search ─────────────────────────────────────────────
        emb_mgr = get_embedding_manager()
        if emb_mgr is None:
            return {
                'text': '',
                'citations': [],
                'error': 'Embedding-Manager nicht verfuegbar',
                'connectedTerms': [],
                'sourceCount': 0,
            }

        if emit_step:
            emit_step({'id': 'semantic_search', 'label': 'Semantische Suche', 'status': 'running'})

        query = 'Was ist %s? Definition' % term
        query_emb = emb_mgr.embed_texts([query])
        if not query_emb:
            return {
                'text': '',
                'citations': [],
                'error': 'Embedding fehlgeschlagen',
                'connectedTerms': [],
                'sourceCount': 0,
            }

        card_ids_set = set(get_term_card_ids(term))
        all_results = emb_mgr.search(query_emb[0], top_k=50)
        top_cards = [(cid, score) for cid, score in all_results if cid in card_ids_set][:8]

        if len(top_cards) < 2:
            connected = get_connected_terms(term)
            return {
                'text': '',
                'citations': [],
                'error': 'Nicht genug Quellen',
                'connectedTerms': connected,
                'sourceCount': 0,
            }

        # ── 3. Fetch card texts on main thread ──────────────────────────────
        try:
            from ..utils.anki import run_on_main_thread
        except ImportError:
            from utils.anki import run_on_main_thread

        card_texts = []
        event = threading.Event()

        def _fetch_texts():
            try:
                from aqt import mw
                for cid, _ in top_cards:
                    try:
                        card = mw.col.get_card(cid)
                        note = card.note()
                        fields = note.fields
                        card_texts.append({
                            'question': fields[0] if fields else '',
                            'answer': fields[1] if len(fields) > 1 else '',
                        })
                    except Exception:
                        pass
            finally:
                event.set()

        run_on_main_thread(_fetch_texts)
        event.wait(timeout=10)

        # ── 4. Generate definition via Gemini ───────────────────────────────
        if emit_step:
            emit_step({'id': 'merge', 'label': 'Definition generieren', 'status': 'running'})

        try:
            from .gemini import generate_definition
        except ImportError:
            from ai.gemini import generate_definition

        definition = generate_definition(term, card_texts, search_query=search_query)

        # ── 5. Build citations ──────────────────────────────────────────────
        source_ids = [cid for cid, _ in top_cards]
        for i, (cid, _) in enumerate(top_cards):
            front = card_texts[i].get('question', '') if i < len(card_texts) else ''
            back = card_texts[i].get('answer', '') if i < len(card_texts) else ''
            citation_builder.add_card(
                card_id=cid,
                note_id=cid,
                deck_name='',
                front=front,
                back=back,
            )

        # ── 6. Cache result ─────────────────────────────────────────────────
        save_definition(term, definition, source_ids, 'llm')

        connected = get_connected_terms(term)

        return {
            'text': definition,
            'citations': citation_builder.build(),
            'connectedTerms': connected,
            'sourceCount': len(source_ids),
            'generatedBy': 'llm',
        }

    except Exception as e:
        logger.exception("Definition agent failed for term '%s'", term)
        return {
            'text': '',
            'citations': [],
            'error': str(e),
            'connectedTerms': [],
            'sourceCount': 0,
        }
