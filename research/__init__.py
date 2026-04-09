"""Research Agent — DEPRECATED as standalone chat agent.

In the Agent-Kanal-Paradigma, the Stapel channel (SearchCardsThread + Clustering
+ KG + Canvas + Quick Answer) IS the Research Agent. This run_research() function
was used for @Research mentions in chat, which no longer exist.

The Stapel pipeline lives in:
- ui/widget.py: SearchCardsThread (graph search, clustering)
- ui/widget.py: KGDefinitionThread (term definitions)
- ui/widget.py: QuickAnswerThread (LLM text generation)
- frontend/src/hooks/useSmartSearch.js (frontend orchestration)

This file is kept for backwards compatibility only.
"""
try:
    from ..utils.logging import get_logger
    from ..config import get_config
    from ..ai.citation_builder import CitationBuilder
except ImportError:
    from utils.logging import get_logger
    from config import get_config
    from ai.citation_builder import CitationBuilder

logger = get_logger(__name__)

# Research system prompt — loaded from TypeScript source or fallback
_RESEARCH_PROMPT_CACHE = None

def _get_research_prompt():
    """Load Research Agent prompt. Cached after first call."""
    global _RESEARCH_PROMPT_CACHE
    if _RESEARCH_PROMPT_CACHE:
        return _RESEARCH_PROMPT_CACHE

    # Try loading from TypeScript source
    import os, re
    prompt_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                               'functions', 'src', 'prompts', 'research.ts')
    try:
        with open(prompt_path, 'r', encoding='utf-8') as f:
            content = f.read()
        match = re.search(r'RESEARCH_PROMPT\s*=\s*`(.*?)`', content, re.DOTALL)
        if match:
            _RESEARCH_PROMPT_CACHE = match.group(1).replace('\\`', '`')
            return _RESEARCH_PROMPT_CACHE
    except (OSError, IOError):
        pass

    # Fallback
    _RESEARCH_PROMPT_CACHE = (
        "Du bist ein Wissens-Agent. Beantworte Fragen präzise auf Basis des Lernmaterials. "
        "Inline-Referenzen [1], [2] für Fakten aus Karten. Sachlich, keine Floskeln."
    )
    return _RESEARCH_PROMPT_CACHE


def run_research(situation: str = '', emit_step=None, memory=None,
                 stream_callback=None, citation_builder=None, **kwargs) -> dict:
    """Research agent entry point.

    Pipeline:
    1. Local: find cards via smart_search_context (pre-loaded) or RAG retrieval
    2. Transport: cards sent as rag_context={"cards": [...]} → backend "insights"
    3. Backend: generates answer with Research prompt + our cards

    Returns:
        dict with 'text', 'citations', '_used_streaming'.
    """
    query = situation or kwargs.get('query', '')
    if not query:
        return {'text': '', 'citations': [], '_used_streaming': False}

    if citation_builder is None:
        citation_builder = CitationBuilder()

    config = kwargs.get('config') or get_config()
    context = kwargs.get('context')
    routing_result = kwargs.get('routing_result')
    model = kwargs.get('model', 'gemini-3-flash-preview')
    fallback_model = kwargs.get('fallback_model', 'gemini-2.5-flash')
    callback = kwargs.get('callback')
    rag_retrieve_fn = kwargs.get('rag_retrieve_fn')
    embedding_manager = kwargs.get('embedding_manager')
    smart_search_context = kwargs.get('smart_search_context')

    logger.info("Research Agent: query='%s'", query[:80])

    # ------------------------------------------------------------------
    # 1. Find cards via the unified RAG pipeline
    # ------------------------------------------------------------------
    # Two paths into the pipeline:
    #   - Smart Search: cards pre-loaded by SearchCardsThread, passed via
    #     preloaded_cards (RESEARCH_RETRIEVAL has accept_preloaded_cards=True).
    #   - Normal: routing_result drives the full retrieval phase.
    # In both cases the unified pipeline runs the reranker and (optionally)
    # web fallback, so this file no longer duplicates that logic.
    try:
        from ai.rag_pipeline import retrieve_rag_context
        from ai.agents import RESEARCH_RETRIEVAL
    except ImportError:
        try:
            from ..ai.rag_pipeline import retrieve_rag_context
            from ..ai.agents import RESEARCH_RETRIEVAL
        except ImportError:
            from rag_pipeline import retrieve_rag_context
            from agents import RESEARCH_RETRIEVAL

    rag_result = None

    if smart_search_context:
        # Normalize Smart Search cards to the dict shape the pipeline expects.
        cards = smart_search_context.get('cards_data', []) or []
        preloaded = []
        for card in cards[:50]:
            card_id = card.get('id') or card.get('card_id') or card.get('cardId') or 0
            preloaded.append({
                'id': card_id,
                'question': (card.get('question') or '')[:200],
                'answer': (card.get('answer') or card.get('deck') or '')[:200],
                'deck': card.get('deck', ''),
            })
        logger.info("Research: %d cards from smart_search → unified pipeline", len(preloaded))
        try:
            rag_result = retrieve_rag_context(
                user_message=query,
                context=context,
                config=config,
                routing_result=None,
                retrieval_config=RESEARCH_RETRIEVAL,
                preloaded_cards=preloaded,
                emit_step=emit_step,
                embedding_manager=embedding_manager,
            )
        except Exception as e:
            logger.warning("Research smart_search pipeline failed: %s", e)
    else:
        # Normal path: routing_result drives retrieval
        if routing_result and (
            getattr(routing_result, 'search_needed', True)
            or (isinstance(routing_result, dict) and routing_result.get('search_needed', True))
        ):
            try:
                rag_result = retrieve_rag_context(
                    user_message=query,
                    context=context,
                    config=config,
                    routing_result=routing_result,
                    retrieval_config=RESEARCH_RETRIEVAL,
                    emit_step=emit_step,
                    rag_retrieve_fn=rag_retrieve_fn,
                    embedding_manager=embedding_manager,
                )
            except Exception as e:
                logger.warning("Research RAG failed: %s", e)

    # ------------------------------------------------------------------
    # 2. Extract reranked card lines + populate CitationBuilder from result
    # ------------------------------------------------------------------
    # The unified pipeline already reranked, renumbered, and (if needed)
    # added web sources. We translate its citations dict into the
    # CitationBuilder so the frontend gets the right [N] chips.
    cards_for_backend = []
    if rag_result and rag_result.rag_context:
        cards_for_backend = rag_result.rag_context.get('cards', []) or []

        if rag_result.citations:
            # Sort by [N] index for deterministic ordering
            sorted_cits = sorted(
                (c for c in rag_result.citations.values() if c.get('index')),
                key=lambda c: c.get('index', 0),
            )
            for cit in sorted_cits:
                if cit.get('type') == 'web':
                    citation_builder.add_web(
                        url=cit.get('url', ''),
                        title=cit.get('title', ''),
                        domain=cit.get('domain', ''),
                    )
                else:
                    card_id = cit.get('cardId') or cit.get('id') or cit.get('noteId') or 0
                    note_id = cit.get('noteId') or card_id
                    try:
                        card_id_int = int(card_id) if card_id else 0
                        note_id_int = int(note_id) if note_id else 0
                    except (ValueError, TypeError):
                        card_id_int = 0
                        note_id_int = 0
                    citation_builder.add_card(
                        card_id=card_id_int,
                        note_id=note_id_int,
                        deck_name=cit.get('deckName', ''),
                        front=(cit.get('question') or cit.get('front') or '')[:200],
                        back=(cit.get('answer') or cit.get('back') or '')[:200],
                        sources=cit.get('sources') or ['research'],
                    )

    if emit_step:
        emit_step("sources_ready", "done", {"citations": citation_builder.build()})

    # ------------------------------------------------------------------
    # 2. Send to backend: cards as insights + Research prompt
    # ------------------------------------------------------------------
    system_prompt = _get_research_prompt()

    # Transport cards via rag_context → _build_chat_payload extracts as "insights"
    rag_context = {"cards": cards_for_backend} if cards_for_backend else None

    try:
        try:
            from ..ai.gemini import get_google_response_streaming
        except ImportError:
            from ai.gemini import get_google_response_streaming

        text = ''
        used_streaming = False

        def _stream_wrapper(chunk, done, is_function_call=False, **_kw):
            nonlocal text, used_streaming
            if chunk:
                text += chunk
                used_streaming = True
            if stream_callback:
                stream_callback(chunk, done)
            if callback:
                callback(chunk, done, is_function_call)

        get_google_response_streaming(
            user_message=query,
            model=model,
            api_key='',
            context=None,
            history=[],
            mode='compact',
            callback=_stream_wrapper,
            rag_context=rag_context,
            system_prompt_override=system_prompt,
            config=config,
            agent='research',
        )

        return {
            'text': text,
            'citations': citation_builder.build(),
            '_used_streaming': used_streaming,
        }

    except Exception as e:
        logger.error("Research generation failed: %s", e)

        # Fallback with simpler model
        try:
            text = ''
            def _fb(chunk, done, is_fc=False, **_kw):
                nonlocal text
                if chunk:
                    text += chunk

            get_google_response_streaming(
                user_message=query,
                model=fallback_model,
                api_key='',
                callback=_fb,
                rag_context=rag_context,
                system_prompt_override=system_prompt,
                config=config,
                agent='research',
            )
            return {'text': text, 'citations': citation_builder.build(), '_used_streaming': True}
        except Exception as e2:
            logger.error("Research fallback also failed: %s", e2)
            return {'text': '', 'citations': [], '_used_streaming': False, 'error': str(e2)}
