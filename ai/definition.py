"""Definition Agent — generates term definitions from card content.

Formalizes the KGDefinitionThread (ui/widget.py:750-874) as a registered agent.
Uses CitationBuilder for card references and caches results in KG store.
Retrieval is composed from ai/pipeline_blocks.py — no inline embedding/lookup.
"""

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
        except ImportError:
            from storage.kg_store import (
                get_definition, get_term_card_ids,
                save_definition, get_connected_terms,
            )

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

        # ── 2. Embedding search via shared pipeline block ───────────────────
        try:
            from .pipeline_blocks import embed_search, fetch_card_snippets
        except ImportError:
            from ai.pipeline_blocks import embed_search, fetch_card_snippets

        if emit_step:
            emit_step({'id': 'semantic_search', 'label': 'Semantische Suche', 'status': 'running'})

        # Constrain search to cards that mention this term (KG-derived).
        card_ids_set = set(get_term_card_ids(term))
        if not card_ids_set:
            connected = get_connected_terms(term)
            return {
                'text': '',
                'citations': [],
                'error': 'Keine Karten zu diesem Begriff',
                'connectedTerms': connected,
                'sourceCount': 0,
            }

        top_cards = embed_search(
            query='Was ist %s? Definition' % term,
            top_k=8,
            card_id_filter=card_ids_set,
        )

        if len(top_cards) < 2:
            connected = get_connected_terms(term)
            return {
                'text': '',
                'citations': [],
                'error': 'Nicht genug Quellen',
                'connectedTerms': connected,
                'sourceCount': 0,
            }

        # ── 3. Fetch card texts via shared block ────────────────────────────
        snippets = fetch_card_snippets([cid for cid, _ in top_cards], max_field_len=2000)
        card_texts = [{'question': s['question'], 'answer': s['answer']} for s in snippets]

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
