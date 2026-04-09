"""
Tutor Agent — the default learning assistant.

Explains card content, searches decks, creates diagrams.
Handles the full pipeline: RAG retrieval -> streaming generation.

The Tutor is a REAL agent that:
1. Calls the RAG pipeline (ai/rag_pipeline.py) for card retrieval
2. Generates a streaming response via the backend (ai/gemini.py proxies to backend)
4. Detects HANDOFF signals and delegates to target agents (e.g. Research)
5. Tracks usage in AgentMemory

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
    from .agents import TUTOR_RETRIEVAL
except ImportError:
    from rag_pipeline import retrieve_rag_context
    from agents import TUTOR_RETRIEVAL

try:
    from .gemini import get_google_response_streaming
except ImportError:
    from gemini import get_google_response_streaming

try:
    from .handoff import parse_handoff, validate_handoff
except ImportError:
    from handoff import parse_handoff, validate_handoff

try:
    from .citation_builder import CitationBuilder
except ImportError:
    from citation_builder import CitationBuilder


def run_tutor(situation, emit_step=None, memory=None,
              stream_callback=None, citation_builder=None, **kwargs):
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
            routing_result: RagAnalysis from rag_analyzer with search parameters.
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
    if citation_builder is None:
        citation_builder = CitationBuilder()

    # ------------------------------------------------------------------
    # 1. Extract parameters from kwargs
    # ------------------------------------------------------------------
    config = kwargs.get('config') or {}
    context = kwargs.get('context')
    history = kwargs.get('history', [])
    rag_analysis = kwargs.get('routing_result')  # RagAnalysis from rag_analyzer
    model = kwargs.get('model', 'gemini-3-flash-preview')
    fallback_model = kwargs.get('fallback_model', 'gemini-2.5-flash')
    mode = kwargs.get('mode', 'compact')
    insights = kwargs.get('insights')
    callback = kwargs.get('callback')  # v1 legacy streaming callback
    rag_retrieve_fn = kwargs.get('rag_retrieve_fn')
    embedding_manager = kwargs.get('embedding_manager')
    smart_search_context = kwargs.get('smart_search_context')

    # ── S7 tutor.entry — log every incoming parameter at a glance ─────
    try:
        from .rag_pipeline import _log_state as _log_state_rag
    except ImportError:
        from rag_pipeline import _log_state as _log_state_rag
    _log_state_rag(
        'S7 tutor.entry', 'ENTER',
        user_message=(situation or '')[:120],
        card_id=(context.get('cardId') if isinstance(context, dict) else None),
        deck=(context.get('deckName', '')[:60] if isinstance(context, dict) else ''),
        history_len=len(history or []),
        mode=mode,
        model=model,
        fallback_model=fallback_model,
        has_routing=rag_analysis is not None,
        routing_search_needed=(getattr(rag_analysis, 'search_needed', None) if rag_analysis else None),
        routing_scope=(getattr(rag_analysis, 'search_scope', None) if rag_analysis else None),
        routing_resolved_intent=(getattr(rag_analysis, 'resolved_intent', '') or '')[:120] if rag_analysis else '',
        has_embedding_manager=bool(embedding_manager),
        has_smart_search=smart_search_context is not None,
    )

    # ------------------------------------------------------------------
    # 2. Track memory
    # ------------------------------------------------------------------
    if memory:
        try:
            memory.set('total_queries', memory.get('total_queries', 0) + 1)
        except (AttributeError, KeyError):
            pass

    # ------------------------------------------------------------------
    # 3. Check backend mode
    # ------------------------------------------------------------------
    api_key = ''  # Legacy parameter — backend handles auth
    use_backend = False
    try:
        try:
            from ..config import is_backend_mode
        except ImportError:
            from config import is_backend_mode
        use_backend = is_backend_mode()
    except (ImportError, AttributeError):
        pass

    if not use_backend:
        msg = 'Backend nicht konfiguriert. Bitte verbinde dich in den Einstellungen.'
        if stream_callback:
            stream_callback(msg, True)
        return {'text': msg}

    # ------------------------------------------------------------------
    # 4. RAG retrieval (or pre-loaded smart search context)
    # ------------------------------------------------------------------
    rag_context = None
    rag_result = None  # Will be set by normal RAG path

    if smart_search_context:
        # Smart Search: cards already found by SearchCardsThread
        # Build RAG context string from pre-loaded cards
        cards = smart_search_context.get('cards_data', [])
        rag_lines = []
        for i, card in enumerate(cards[:50]):
            q = (card.get('question') or '')[:80]
            a = (card.get('answer') or card.get('deck') or '')[:80]
            rag_lines.append("[%d] %s | %s" % (i + 1, q, a))
        if rag_lines:
            rag_context = {"context_string": "\n".join(rag_lines)}

            # ── DEBUG: Log what cards the model will see as [N] (smart search path) ──
            logger.info("=== CITATION DEBUG (smart_search): query='%s', %d cards ===",
                        situation[:80], len(cards[:50]))
            for i, card in enumerate(cards[:50]):
                _q = (card.get('question') or '')[:100]
                _cid = card.get('id') or card.get('card_id') or '?'
                _deck = card.get('deck', '')
                logger.info("  [%s] cardId=%s deck='%s' front='%s'",
                            i + 1, _cid, _deck, _q)

            # Register citations via CitationBuilder
            for card in cards[:50]:
                card_id = card.get('id') or card.get('card_id') or 0
                if card_id:
                    citation_builder.add_card(
                        card_id=int(card_id),
                        note_id=int(card_id),
                        deck_name=card.get('deck', ''),
                        front=(card.get('question') or '')[:60],
                        back='',
                        sources=['smart_search'],
                    )
        if emit_step:
            emit_step("sources_ready", "done", {"citations": citation_builder.build()})
        logger.info("Tutor: using smart_search_context with %d cards", len(cards))
    else:
        # Normal path: RAG retrieval from routing result
        try:
            if rag_analysis is not None:
                # Force search_needed=True when card context exists
                # Router often says False for follow-up questions ("erkläre mehr")
                # but we still want card-based citations
                if context and context.get('cardId'):
                    _was_search_needed = getattr(rag_analysis, 'search_needed', False)
                    rag_analysis.search_needed = True
                    if not _was_search_needed:
                        _log_state_rag('S7 tutor.entry', 'BRANCH',
                                       reason='forcing_search_needed_for_card_context',
                                       router_said=_was_search_needed,
                                       card_id=context.get('cardId'))

                _rag_fn = rag_retrieve_fn
                if _rag_fn is None:
                    _rag_fn = _make_default_rag_retrieve_fn()

                rag_result = retrieve_rag_context(
                    user_message=situation,
                    context=context,
                    config=config,
                    routing_result=rag_analysis,
                    retrieval_config=TUTOR_RETRIEVAL,
                    emit_step=emit_step,
                    embedding_manager=embedding_manager,
                    rag_retrieve_fn=_rag_fn,
                )

                if rag_result.cards_found > 0:
                    rag_context = rag_result.rag_context
                    old_citations = rag_result.citations or {}
                    # Only keep citations that have an index (reranker removes
                    # index from filtered-out citations). Sort by index so
                    # CitationBuilder assigns [1],[2],[3] matching LERNMATERIAL.
                    # If NO citations have an index (no reranker ran), keep all.
                    _all_vals = list(old_citations.values())
                    indexed_citations = [c for c in _all_vals if c.get('index') is not None]
                    if not indexed_citations:
                        indexed_citations = _all_vals
                    sorted_citations = sorted(
                        indexed_citations,
                        key=lambda c: c.get('index', 999)
                    )

                    # ── DEBUG: Log what cards the model will see as [N] ──
                    logger.info("=== CITATION DEBUG: query='%s', %d sources ===",
                                situation[:80], len(sorted_citations))
                    for cdata in sorted_citations:
                        _idx = cdata.get('index', '?')
                        _cid = cdata.get('cardId', cdata.get('noteId', '?'))
                        _deck = cdata.get('deckName', '')
                        _fields = cdata.get('fields', {})
                        _front = ''
                        if _fields:
                            for _fval in _fields.values():
                                if _fval and _fval.strip():
                                    _front = _fval.strip()
                                    break
                        if not _front:
                            _front = cdata.get('question', cdata.get('front', ''))
                        logger.info("  [%s] cardId=%s deck='%s' front='%s'",
                                    _idx, _cid, _deck, str(_front)[:100])

                    _n_card = 0
                    _n_web = 0
                    for cdata in sorted_citations:
                        if cdata.get('type') == 'web':
                            citation_builder.add_web(
                                url=cdata.get('url', ''),
                                title=cdata.get('title', ''),
                                domain=cdata.get('domain', ''),
                            )
                            _n_web += 1
                        else:
                            citation_builder.add_card(
                                card_id=int(cdata.get('cardId', cdata.get('noteId', 0))),
                                note_id=int(cdata.get('noteId', 0)),
                                deck_name=cdata.get('deckName', ''),
                                front=cdata.get('question', cdata.get('front', '')),
                                back=cdata.get('answer', cdata.get('back', '')),
                                sources=cdata.get('sources', []),
                            )
                            _n_card += 1
                    _log_state_rag('S14 tutor.citation_build', 'OK',
                                   total_sorted=len(sorted_citations),
                                   card_added=_n_card,
                                   web_added=_n_web,
                                   raw_old_citations=len(old_citations))
                    if emit_step and old_citations:
                        emit_step("sources_ready", "done", {"citations": citation_builder.build()})
                else:
                    _log_state_rag('S14 tutor.citation_build', 'SKIP',
                                   reason='rag_result.cards_found==0',
                                   cards_found=rag_result.cards_found if rag_result else 0)
        except Exception as e:
            _log_state_rag('S14 tutor.citation_build', 'FAIL', error=str(e)[:200])
            logger.warning("Tutor RAG retrieval failed: %s", e)

        # Even without search results, include current card as context
        if not rag_context and context and context.get('cardId'):
            _log_state_rag('S14 tutor.citation_build', 'BRANCH',
                           reason='no_rag_context_but_have_current_card',
                           card_id=context.get('cardId'),
                           action='inject_current_card_as_sole_source')
            rag_context = _build_current_card_context(context)
            if rag_context:
                old_citations = rag_context.get('citations', {})
                for _note_id, cdata in old_citations.items():
                    citation_builder.add_card(
                        card_id=int(cdata.get('cardId', cdata.get('noteId', 0))),
                        note_id=int(cdata.get('noteId', 0)),
                        deck_name=cdata.get('deckName', ''),
                        front=cdata.get('question', cdata.get('front', '')),
                        back=cdata.get('answer', cdata.get('back', '')),
                        sources=cdata.get('sources', []),
                    )

    # ------------------------------------------------------------------
    # 5. Build system prompt — citation instructions
    # ------------------------------------------------------------------
    ai_tools = config.get('ai_tools', {
        'images': True, 'diagrams': True, 'molecules': False
    })

    system_prompt = None  # Backend builds the system prompt with citation instructions

    generation_situation = situation

    # ------------------------------------------------------------------
    # 6. Generate with 3-level fallback chain
    # ------------------------------------------------------------------

    def _on_chunk(chunk, done, is_function_call=False):
        """Forward streaming chunks to both stream_callback and legacy callback."""
        if done:
            return
        if not chunk:
            return
        if is_function_call:
            return  # Tool calls handled by agent_loop
        if stream_callback:
            stream_callback(chunk, False)
        if callback:
            callback(chunk, False, False)

    # ── S15 tutor.llm_dispatch — hand off to Gemini ────────────────────
    _rag_cards = (rag_context or {}).get('cards', []) if rag_context else []
    _rag_citations = (rag_context or {}).get('citations', {}) if rag_context else {}
    _log_state_rag(
        'S15 tutor.llm_dispatch', 'TRY',
        primary_model=model,
        fallback_model=fallback_model,
        mode=mode,
        history_len=len(history or []),
        rag_cards=len(_rag_cards),
        rag_citations=len(_rag_citations),
        rag_card_cites=sum(1 for c in _rag_citations.values() if c.get('type') != 'web'),
        rag_web_cites=sum(1 for c in _rag_citations.values() if c.get('type') == 'web'),
        ai_tools_enabled=[k for k, v in ai_tools.items() if v],
    )

    result_text = _generate_with_fallback(
        situation=generation_situation,
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
        _log_state_rag('S15 tutor.llm_dispatch', 'FAIL',
                       reason='all_3_fallback_levels_failed')
        # All 3 levels failed
        if emit_step:
            emit_step("generating", "error")
        error_msg = 'Es ist ein Fehler aufgetreten. Bitte versuche es erneut.'
        if stream_callback:
            stream_callback(error_msg, True)
        return {'text': error_msg, 'citations': []}

    _log_state_rag('S15 tutor.llm_dispatch', 'OK',
                   result_text_chars=len(result_text or ''),
                   next='S18 tutor.handoff_parse')

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

    result = {
        'text': final_text,
        'citations': citation_builder.build(),
        '_used_streaming': stream_callback is not None,
        '_handoff_marker': handoff_marker,
        '_rag_context': rag_context,  # For background citation validation
    }
    if rag_result and hasattr(rag_result, 'web_sources') and rag_result.web_sources:
        result['webSources'] = rag_result.web_sources

    # ── S19 tutor.return — final log before handing back to _dispatch_agent ──
    _built = citation_builder.build() or []
    _log_state_rag('S19 tutor.return', 'EXIT',
                   text_chars=len(final_text),
                   total_citations=len(_built),
                   card_citations=sum(1 for c in _built if c.get('type') == 'card'),
                   web_citations=sum(1 for c in _built if c.get('type') == 'web'),
                   has_handoff=bool(handoff_marker),
                   web_sources=len(result.get('webSources', [])))
    return result


def _call_generation(situation, model, api_key, config, system_prompt,
                     context, history, mode, rag_context, on_chunk,
                     pipeline_step_callback=None):
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
        pipeline_step_callback=pipeline_step_callback,
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
            context, history, mode, rag_context, on_chunk,
            pipeline_step_callback=emit_step)
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
            context, fallback_history, mode, fallback_rag, on_chunk,
            pipeline_step_callback=emit_step)
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
            context, [], mode, None, on_chunk,
            pipeline_step_callback=emit_step)
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
                     max_notes=30, **_kwargs):
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
                'index': 1,  # Stable index for [N] inline references
            }
        }
    }
