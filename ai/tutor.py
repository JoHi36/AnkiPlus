"""
Tutor Agent — the default learning assistant.

Explains card content, searches decks, creates diagrams.
Handles the full pipeline: RAG retrieval -> system prompt -> streaming generation.

The Tutor is a REAL agent that:
1. Calls the RAG pipeline (ai/rag_pipeline.py) for card retrieval
2. Builds the system prompt (ai/system_prompt.py)
3. Generates a streaming response via Gemini (ai/gemini.py)
4. Tracks usage in AgentMemory

NOTE: This agent does NOT handle handoff detection (Task 5b) or
fallback chains (Task 5c) yet. Those will be added in subsequent tasks.
The old Tutor path in handler.py still exists and is still active —
this new agent won't be wired in until Task 6.
"""
import re

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

# Lazy imports — resolved at call time to avoid circular dependencies
# and to work in both addon and standalone contexts.

try:
    from .rag_pipeline import retrieve_rag_context
except ImportError:
    from rag_pipeline import retrieve_rag_context

try:
    from .system_prompt import get_system_prompt
except ImportError:
    from system_prompt import get_system_prompt

try:
    from .gemini import get_google_response_streaming
except ImportError:
    from gemini import get_google_response_streaming


def run_tutor(situation, emit_step=None, memory=None,
              stream_callback=None, **kwargs):
    """
    Tutor agent entry point — full RAG + streaming pipeline.

    Args:
        situation: The user's message text.
        emit_step: Callback(step_name, status, data=None) for pipeline visualization.
        memory: AgentMemory instance for persistent state.
        stream_callback: Callback(chunk, done) for streaming text to the UI.
        **kwargs: Additional parameters:
            config (dict): Application config (api_key, ai_tools, ...).
            context (dict): Current card context (cardId, noteId, question, answer, ...).
            history (list): Conversation history.
            routing_result: Routing result with search parameters.
            model (str): Primary model name.
            fallback_model (str): Fallback model name.
            mode (str): Response mode ('compact', etc.).
            insights (dict): Card insights for prompt injection.
            callback: Legacy v1 streaming callback(chunk, done, is_function_call).
            rag_retrieve_fn: Optional callable for SQL keyword retrieval.
            embedding_manager: Optional embedding manager for semantic search.

    Returns:
        dict with 'text', 'citations', '_used_streaming'.
    """
    if emit_step:
        emit_step("Verarbeite Anfrage...", "active")

    # ------------------------------------------------------------------
    # 1. Extract parameters from kwargs
    # ------------------------------------------------------------------
    config = kwargs.get('config') or {}
    context = kwargs.get('context')
    history = kwargs.get('history', [])
    routing_result = kwargs.get('routing_result')
    model = kwargs.get('model', 'gemini-3-flash-preview')
    fallback_model = kwargs.get('fallback_model', 'gemini-2.5-flash')
    mode = kwargs.get('mode', 'compact')
    insights = kwargs.get('insights')
    callback = kwargs.get('callback')  # v1 legacy streaming callback
    rag_retrieve_fn = kwargs.get('rag_retrieve_fn')
    embedding_manager = kwargs.get('embedding_manager')

    # ------------------------------------------------------------------
    # 2. Track memory
    # ------------------------------------------------------------------
    if memory:
        try:
            memory.set('total_queries', memory.get('total_queries', 0) + 1)
        except Exception:
            pass

    # ------------------------------------------------------------------
    # 3. Check API key / backend mode
    # ------------------------------------------------------------------
    api_key = config.get('api_key', '')
    use_backend = False
    if not api_key:
        try:
            try:
                from ..config import is_backend_mode, get_auth_token
            except ImportError:
                from config import is_backend_mode, get_auth_token
            if is_backend_mode() and get_auth_token():
                use_backend = True
        except Exception:
            pass

    if not api_key and not use_backend:
        msg = 'Bitte konfiguriere zuerst den API-Schlüssel in den Einstellungen.'
        if stream_callback:
            stream_callback(msg, True)
        return {'text': msg}

    # ------------------------------------------------------------------
    # 4. RAG retrieval
    # ------------------------------------------------------------------
    rag_context = None
    citations = {}

    try:
        if routing_result is not None:
            # If no rag_retrieve_fn was provided, try to build one from ai/rag.py
            _rag_fn = rag_retrieve_fn
            if _rag_fn is None:
                _rag_fn = _make_default_rag_retrieve_fn()

            rag_result = retrieve_rag_context(
                user_message=situation,
                context=context,
                config=config,
                routing_result=routing_result,
                emit_step=emit_step,
                embedding_manager=embedding_manager,
                rag_retrieve_fn=_rag_fn,
            )

            if rag_result.cards_found > 0:
                rag_context = rag_result.rag_context
                citations = rag_result.citations
                logger.debug("Tutor RAG: %s citations", len(citations))
    except Exception as e:
        logger.warning("Tutor RAG retrieval failed: %s", e)

    # Even without search results, include current card as context
    if not rag_context and context and context.get('cardId'):
        rag_context = _build_current_card_context(context)
        if rag_context:
            citations = rag_context.get('citations', {})

    # ------------------------------------------------------------------
    # 5. Build system prompt
    # ------------------------------------------------------------------
    ai_tools = config.get('ai_tools', {
        'images': True, 'diagrams': True, 'molecules': False
    })
    system_prompt = get_system_prompt(mode=mode, tools=ai_tools, insights=insights)

    # ------------------------------------------------------------------
    # 6. Generate with streaming
    # ------------------------------------------------------------------
    if emit_step:
        emit_step("generating", "active")

    try:
        def _on_chunk(chunk, done, is_function_call=False):
            """Forward streaming chunks to both stream_callback and legacy callback."""
            if done:
                return  # We handle the done signal after the call
            if chunk and not is_function_call:
                if stream_callback:
                    stream_callback(chunk, False)
                if callback:
                    callback(chunk, False, False)

        result_text = get_google_response_streaming(
            situation, model, api_key,
            context=context, history=history, mode=mode,
            callback=_on_chunk,
            rag_context=rag_context,
            system_prompt_override=system_prompt,
            config=config,
        )

        if emit_step:
            emit_step("generating", "done")

        # Signal streaming done
        if stream_callback:
            stream_callback('', True)

    except Exception as e:
        logger.exception("Tutor generation failed: %s", e)
        if emit_step:
            emit_step("generating", "error")
        error_msg = 'Ein Fehler ist aufgetreten: %s' % str(e)
        if stream_callback:
            stream_callback(error_msg, True)
        return {'text': error_msg}

    # ------------------------------------------------------------------
    # 7. Return result
    # ------------------------------------------------------------------
    return {
        'text': result_text or '',
        'citations': citations,
        '_used_streaming': stream_callback is not None,
    }


def _make_default_rag_retrieve_fn():
    """Build a default rag_retrieve_fn from ai/rag.py's rag_retrieve_cards.

    Returns None if ai/rag.py is not importable (e.g. in tests without aqt).
    """
    try:
        try:
            from .rag import rag_retrieve_cards
        except ImportError:
            from rag import rag_retrieve_cards

        def _rag_fn(precise_queries=None, broad_queries=None,
                     search_scope="current_deck", context=None,
                     max_notes=10, **_kwargs):
            return rag_retrieve_cards(
                precise_queries=precise_queries,
                broad_queries=broad_queries,
                search_scope=search_scope,
                context=context,
                max_notes=max_notes,
            )
        return _rag_fn
    except Exception:
        return None


def _build_current_card_context(context):
    """Build a minimal RAG context from just the current card."""
    current_note_id = str(context.get('noteId', context['cardId']))
    _q = context.get('question') or context.get('frontField') or ''
    _a = context.get('answer') or ''
    _q_clean = re.sub(r'<[^>]+>', ' ', _q).strip()[:200]
    _a_clean = re.sub(r'<[^>]+>', ' ', _a).strip()[:200]
    if not _q_clean and not _a_clean:
        return None
    return {
        "cards": [
            "Note %s (aktuelle Karte):\n  Frage: %s\n  Antwort: %s"
            % (current_note_id, _q_clean, _a_clean)
        ],
        "citations": {
            current_note_id: {
                'noteId': context.get('noteId', context['cardId']),
                'cardId': context['cardId'],
                'question': _q_clean,
                'answer': _a_clean,
                'fields': context.get('fields', {}),
                'deckName': context.get('deckName', ''),
                'isCurrentCard': True,
                'sources': ['current'],
            }
        }
    }
