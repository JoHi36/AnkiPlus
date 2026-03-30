"""Research Agent — knowledge agent for the Stapel (stack) view.

Uses the same RAG pipeline as Tutor but with a cooler, factual prompt.
State-based: no conversation history, each query is independent.
"""
try:
    from ..utils.logging import get_logger
    from ..config import get_config
except ImportError:
    from utils.logging import get_logger
    from config import get_config

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
                 stream_callback=None, **kwargs) -> dict:
    """Research agent entry point — RAG pipeline with factual prompt.

    Same pipeline as Tutor but:
    - No conversation history (state-based)
    - Cooler, more factual prompt
    - Optimized for Stapel sidebar

    Returns:
        dict with 'text', 'citations', '_used_streaming'.
    """
    query = situation or kwargs.get('query', '')
    if not query:
        return {'text': '', 'citations': {}, '_used_streaming': False}

    config = kwargs.get('config') or get_config()
    context = kwargs.get('context')
    routing_result = kwargs.get('routing_result')
    model = kwargs.get('model', 'gemini-3-flash-preview')
    fallback_model = kwargs.get('fallback_model', 'gemini-2.5-flash')
    callback = kwargs.get('callback')
    rag_retrieve_fn = kwargs.get('rag_retrieve_fn')
    embedding_manager = kwargs.get('embedding_manager')

    logger.info("Research Agent: query='%s'", query[:80])

    # ------------------------------------------------------------------
    # 1. RAG Retrieval (same pipeline as Tutor)
    # ------------------------------------------------------------------
    rag_context = None
    citations = {}

    try:
        from ai.rag_pipeline import retrieve_rag_context, RagResult
    except ImportError:
        try:
            from ..ai.rag_pipeline import retrieve_rag_context, RagResult
        except ImportError:
            from rag_pipeline import retrieve_rag_context, RagResult

    if routing_result and (getattr(routing_result, 'search_needed', True) or
                           (isinstance(routing_result, dict) and routing_result.get('search_needed', True))):
        try:
            rag_result = retrieve_rag_context(
                user_message=query,
                routing_result=routing_result,
                context=context,
                emit_step=emit_step,
                rag_retrieve_fn=rag_retrieve_fn,
                embedding_manager=embedding_manager,
            )
            if rag_result and rag_result.rag_context:
                rag_context = rag_result.rag_context
            if rag_result and rag_result.citations:
                citations = rag_result.citations
            logger.info("Research RAG: %d citations", len(citations))
        except Exception as e:
            logger.warning("Research RAG failed: %s", e)

    # ------------------------------------------------------------------
    # 2. Build prompt with LERNMATERIAL
    # ------------------------------------------------------------------
    system_prompt = _get_research_prompt()

    if rag_context:
        system_prompt = system_prompt + '\n\n' + rag_context
    elif not citations:
        system_prompt = system_prompt + '\n\nLERNMATERIAL: (Keine relevanten Karten gefunden)'

    # ------------------------------------------------------------------
    # 3. Generate response (streaming)
    # ------------------------------------------------------------------
    try:
        try:
            from ..ai.gemini import get_google_response_streaming
        except ImportError:
            from ai.gemini import get_google_response_streaming

        # No history — state-based
        messages = [{'role': 'user', 'content': query}]

        text = ''
        used_streaming = False
        api_key = config.get('api_key', '') or config.get('google_api_key', '')

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
            api_key=api_key,
            context=None,
            history=[],  # No history — state-based
            mode='compact',
            callback=_stream_wrapper,
            rag_context=rag_context,
            system_prompt_override=system_prompt,
            config=config,
        )

        return {
            'text': text,
            'citations': citations,
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
                api_key=config.get('api_key', ''),
                callback=_fb,
                rag_context=rag_context,
                system_prompt_override=system_prompt,
                config=config,
            )
            return {'text': text, 'citations': citations, '_used_streaming': True}
        except Exception as e2:
            logger.error("Research fallback also failed: %s", e2)
            return {'text': '', 'citations': {}, '_used_streaming': False, 'error': str(e2)}
