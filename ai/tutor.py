"""
Tutor Agent — the default learning assistant.

Explains card content, searches decks, creates diagrams.
Handles the full pipeline: RAG retrieval -> system prompt -> streaming generation.

The Tutor is a REAL agent that:
1. Calls the RAG pipeline (ai/rag_pipeline.py) for card retrieval
2. Builds the system prompt (ai/system_prompt.py)
3. Generates a streaming response via Gemini (ai/gemini.py)
4. Detects HANDOFF signals and delegates to target agents (e.g. Research)
5. Tracks usage in AgentMemory

As of Task 6, handler.py is a pure dispatcher — ALL messages including
Tutor queries route through _dispatch_agent() which calls this module.
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

try:
    from .handoff import parse_handoff, validate_handoff
except ImportError:
    from handoff import parse_handoff, validate_handoff


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
    # 6. Generate with 3-level fallback chain
    # ------------------------------------------------------------------
    def _on_chunk(chunk, done, is_function_call=False):
        """Forward streaming chunks to both stream_callback and legacy callback."""
        if done:
            return  # We handle the done signal after the call
        if chunk and not is_function_call:
            if stream_callback:
                stream_callback(chunk, False)
            if callback:
                callback(chunk, False, False)

    result_text = _generate_with_fallback(
        situation=situation,
        primary_model=model,
        fallback_model=fallback_model,
        api_key=api_key,
        config=config,
        system_prompt=system_prompt,
        context=context,
        history=history,
        mode=mode,
        rag_context=rag_context,
        on_chunk=_on_chunk,
        emit_step=emit_step,
    )

    if result_text is None:
        # All 3 levels failed
        if emit_step:
            emit_step("generating", "error")
        error_msg = 'Es ist ein Fehler aufgetreten. Bitte versuche es erneut.'
        if stream_callback:
            stream_callback(error_msg, True)
        return {'text': error_msg, 'citations': {}}

    # Signal streaming done
    if stream_callback:
        stream_callback('', True)

    # ------------------------------------------------------------------
    # 7. Handoff detection
    # ------------------------------------------------------------------
    handoff_marker = None
    if result_text and isinstance(result_text, str):
        clean_text, handoff_req = parse_handoff(result_text)
        if handoff_req:
            # Determine allowed handoff targets from the agent registry
            can_handoff = ['tutor']
            try:
                try:
                    from .agents import get_agent
                except ImportError:
                    from agents import get_agent
                tutor_def = get_agent('tutor')
                if tutor_def:
                    can_handoff = tutor_def.can_handoff_to or can_handoff
            except Exception:
                pass

            if validate_handoff(handoff_req, 'tutor', can_handoff, config):
                logger.info("Tutor handoff: -> %s (query: %s)",
                            handoff_req.to, handoff_req.query[:50])
                try:
                    try:
                        from .agents import get_agent, lazy_load_run_fn
                    except ImportError:
                        from agents import get_agent, lazy_load_run_fn

                    target_def = get_agent(handoff_req.to)
                    if target_def:
                        run_fn = lazy_load_run_fn(target_def)
                        target_result = run_fn(
                            situation=handoff_req.query,
                            **target_def.extra_kwargs
                        )

                        # Extract text from target result
                        if isinstance(target_result, dict):
                            target_text = (target_result.get('text', '')
                                           or target_result.get('answer', ''))
                        else:
                            target_text = str(target_result)

                        # Build the agent_handoff tool marker for frontend rendering
                        if target_text:
                            import json as _json
                            handoff_marker = '[[TOOL:%s]]' % _json.dumps({
                                'name': 'agent_handoff',
                                'displayType': 'widget',
                                'result': {
                                    'agent': handoff_req.to,
                                    'text': target_text,
                                    'reason': handoff_req.reason,
                                    'sources': (target_result.get('sources', [])
                                                if isinstance(target_result, dict) else []),
                                }
                            }, ensure_ascii=False)

                        logger.info("Handoff complete: tutor -> %s", handoff_req.to)
                except Exception as e:
                    logger.warning("Handoff execution failed: %s", e)
            else:
                logger.info("Handoff rejected, returning original response")

            # Always strip the handoff signal from the visible response
            result_text = clean_text

    # ------------------------------------------------------------------
    # 8. Return result
    # ------------------------------------------------------------------
    final_text = result_text or ''
    if handoff_marker:
        final_text = final_text + '\n' + handoff_marker if final_text else handoff_marker

    return {
        'text': final_text,
        'citations': citations,
        '_used_streaming': stream_callback is not None,
        '_handoff_marker': handoff_marker,
    }


def _call_generation(situation, model, api_key, config, system_prompt,
                     context, history, mode, rag_context, on_chunk):
    """Call get_google_response_streaming with the given parameters.

    Returns the result text string. Raises on error.
    """
    return get_google_response_streaming(
        situation, model, api_key,
        context=context, history=history, mode=mode,
        callback=on_chunk,
        rag_context=rag_context,
        system_prompt_override=system_prompt,
        config=config,
    )


def _thin_rag_context(rag_context, max_cards=3):
    """Reduce RAG context to top N cards for fallback retry."""
    if not rag_context:
        return None
    if isinstance(rag_context, dict) and 'cards' in rag_context:
        thinned = dict(rag_context)
        thinned['cards'] = rag_context['cards'][:max_cards]
        return thinned
    return rag_context


def _is_size_error(err):
    """Check if an exception indicates a 400/payload-too-large error."""
    error_str = str(err).lower()
    status_code = None
    if hasattr(err, 'response') and err.response:
        status_code = getattr(err.response, 'status_code', None)
    if status_code == 400:
        return True
    if '400' in error_str or 'too large' in error_str:
        return True
    return False


def _generate_with_fallback(situation, primary_model, fallback_model,
                            api_key, config, system_prompt, context,
                            history, mode, rag_context, on_chunk,
                            emit_step=None):
    """3-level fallback chain for generation.

    Level 1: Primary model with full RAG context + full chat history.
    Level 2: Fallback model with thin RAG (top 3 cards) + no history.
              Triggered on 400/size errors from primary.
    Level 3: Fallback model without RAG at all.
              Triggered on any error from Level 2.

    Returns the result text on success, or None if all levels fail.
    """
    # ------------------------------------------------------------------
    # Level 1: Primary model — full RAG + full history
    # ------------------------------------------------------------------
    try:
        if emit_step:
            emit_step("generating", "active")
        result_text = _call_generation(
            situation, primary_model, api_key, config, system_prompt,
            context, history, mode, rag_context, on_chunk)
        if emit_step:
            emit_step("generating", "done")
        return result_text
    except Exception as primary_err:
        _primary_err = primary_err  # preserve before Python deletes it
        logger.warning("Primary model (%s) failed: %s, trying fallback",
                       primary_model, _primary_err)

    # ------------------------------------------------------------------
    # Level 2: Fallback model — thin RAG (top 3 cards), no history
    # ------------------------------------------------------------------
    # On 400/size errors, aggressively trim context; otherwise still trim
    # to reduce payload for the fallback attempt.
    if _is_size_error(_primary_err):
        logger.warning("400/size error -> trimming RAG context for fallback")
    fallback_rag = _thin_rag_context(rag_context, max_cards=3)
    fallback_history = []

    try:
        if emit_step:
            emit_step("generating", "active")
        result_text = _call_generation(
            situation, fallback_model, api_key, config, system_prompt,
            context, fallback_history, mode, fallback_rag, on_chunk)
        if emit_step:
            emit_step("generating", "done")
        return result_text
    except Exception as fallback_err:
        logger.warning("Fallback+RAG (%s) failed: %s, trying without RAG",
                       fallback_model, fallback_err)

    # ------------------------------------------------------------------
    # Level 3: Fallback model — no RAG, no history
    # ------------------------------------------------------------------
    try:
        if emit_step:
            emit_step("generating", "active")
        result_text = _call_generation(
            situation, fallback_model, api_key, config, system_prompt,
            context, [], mode, None, on_chunk)
        if emit_step:
            emit_step("generating", "done")
        return result_text
    except Exception as final_err:
        logger.exception("All models failed: %s", final_err)
        return None


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
