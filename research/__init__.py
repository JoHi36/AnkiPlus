"""Research Agent — unified pipeline, no card context.

Uses rag_pipeline.retrieve('research', ...) for high-quality retrieval,
then generates via backend /chat. No dependency on SearchCardsThread —
Canvas gets its cards separately, Research gets its own pipeline results.
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

    _RESEARCH_PROMPT_CACHE = (
        "Du bist ein Wissens-Agent. Beantworte Fragen präzise auf Basis des Lernmaterials. "
        "Inline-Referenzen [1], [2] für Fakten aus Karten. Sachlich, keine Floskeln."
    )
    return _RESEARCH_PROMPT_CACHE


def run_research(situation: str = '', emit_step=None, memory=None,
                 stream_callback=None, citation_builder=None, **kwargs) -> dict:
    """Research agent — unified pipeline, collection-wide, no card context.

    Pipeline:
    1. Unified RAG retrieval (KG + SQL + Semantic + RRF + Reranker)
    2. Generation via backend /chat with Research prompt

    Args:
        situation: User's search query.
        emit_step: Pipeline visualization callback.
        stream_callback: Streaming callback(chunk, done).
        citation_builder: CitationBuilder instance.
        **kwargs: config, history, model, embedding_manager, rag_retrieve_fn, etc.

    Returns:
        dict with 'text', 'citations', '_used_streaming'.
    """
    query = situation or kwargs.get('query', '')
    if not query:
        return {'text': '', 'citations': [], '_used_streaming': False}

    if citation_builder is None:
        citation_builder = CitationBuilder()

    config = kwargs.get('config') or get_config()
    model = kwargs.get('model', 'gemini-3-flash-preview')
    fallback_model = kwargs.get('fallback_model', 'gemini-2.5-flash')
    callback = kwargs.get('callback')
    embedding_manager = kwargs.get('embedding_manager')
    history = kwargs.get('history', [])

    # Get rag_retrieve_fn (SQL search)
    rag_retrieve_fn = kwargs.get('rag_retrieve_fn')
    if not rag_retrieve_fn:
        try:
            try:
                from ..ai.rag import rag_retrieve_cards
            except ImportError:
                from ai.rag import rag_retrieve_cards
            rag_retrieve_fn = rag_retrieve_cards
        except Exception:
            pass

    logger.info("Research Agent: query='%s'", query[:80])

    # ------------------------------------------------------------------
    # 1. Router + Unified RAG retrieval
    # ------------------------------------------------------------------
    rag_context = None
    rag_result = None

    try:
        try:
            from ..ai.rag_pipeline import retrieve as rag_retrieve
        except ImportError:
            from ai.rag_pipeline import retrieve as rag_retrieve

        # Router call — needed for resolved_intent + associated_terms
        # Without it, KG enrichment gets garbage terms from raw query
        routing = None
        try:
            try:
                from ..ai.rag_analyzer import analyze_query, RagAnalysis
            except ImportError:
                from ai.rag_analyzer import analyze_query, RagAnalysis

            if emit_step:
                emit_step("router", "running")
            routing = analyze_query(
                query, card_context=None,
                chat_history=history, config=config)
            # Research always searches, override router decision
            routing.search_needed = True
            routing.search_scope = 'collection'
            if emit_step:
                emit_step("router", "done", {
                    "search_needed": True,
                    "resolved_intent": routing.resolved_intent or query,
                    "retrieval_mode": routing.retrieval_mode,
                })
        except Exception as e:
            logger.warning("Research router failed, using query as intent: %s", e)
            routing = RagAnalysis(
                search_needed=True,
                resolved_intent=query,
                retrieval_mode='both',
                search_scope='collection',
            )

        rag_result = rag_retrieve(
            agent_name='research',
            user_message=query,
            context=None,
            config=config,
            routing_result=routing,
            emit_step=emit_step,
            embedding_manager=embedding_manager,
            rag_retrieve_fn=rag_retrieve_fn,
        )

        if rag_result and rag_result.rag_context:
            rag_context = rag_result.rag_context

            # Build citations from pipeline results
            if rag_result.citations:
                sorted_cits = sorted(
                    rag_result.citations.values(),
                    key=lambda c: c.get('index', 999))
                for cdata in sorted_cits:
                    if cdata.get('type') == 'web':
                        citation_builder.add_web(
                            url=cdata.get('url', ''),
                            title=cdata.get('title', ''),
                            domain=cdata.get('domain', ''))
                    else:
                        _fields = cdata.get('fields', {})
                        _fvals = list(_fields.values())
                        citation_builder.add_card(
                            card_id=int(cdata.get('cardId', cdata.get('noteId', 0))),
                            note_id=int(cdata.get('noteId', 0)),
                            deck_name=cdata.get('deckName', ''),
                            front=cdata.get('question', _fvals[0][:200] if _fvals else ''),
                            back=cdata.get('answer', _fvals[1][:200] if len(_fvals) > 1 else ''),
                            sources=cdata.get('sources', []))

            if emit_step:
                emit_step("sources_ready", "done", {"citations": citation_builder.build()})
            logger.info("Research RAG: %d citations", len(citation_builder.build()))
    except Exception as e:
        logger.warning("Research RAG failed: %s", e)

    # ------------------------------------------------------------------
    # 2. Generate with Research prompt
    # ------------------------------------------------------------------
    system_prompt = _get_research_prompt()

    # Build rag_context for backend (formatted string lines)
    rag_lines = rag_context.get('cards', []) if rag_context else []
    rag_for_backend = {"cards": rag_lines} if rag_lines else None

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
            history=history,
            mode='compact',
            callback=_stream_wrapper,
            rag_context=rag_for_backend,
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
                rag_context=rag_for_backend,
                system_prompt_override=system_prompt,
                config=config,
                agent='research',
            )
            return {'text': text, 'citations': citation_builder.build(), '_used_streaming': True}
        except Exception as e2:
            logger.error("Research fallback also failed: %s", e2)
            return {'text': '', 'citations': [], '_used_streaming': False, 'error': str(e2)}
