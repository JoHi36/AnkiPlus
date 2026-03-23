"""
AI-Handler für das Anki Chatbot Addon
Orchestriert Google Gemini API-Integration, RAG-Pipeline und Model Management.

Heavy lifting is delegated to:
  - ai.gemini   (Gemini API requests, streaming, retry logic)
  - ai.rag      (RAG router, retrieval, keyword helpers)
  - ai.models   (section titles, model fetching)
"""

import json
import time
from ..config import (
    get_config, RESPONSE_STYLES, is_backend_mode, get_backend_url,
    get_auth_token, get_refresh_token, update_config
)
from .system_prompt import get_system_prompt

try:
    from .tools import registry as tool_registry
    from .agent_loop import run_agent_loop
except ImportError:
    from tools import registry as tool_registry
    from agent_loop import run_agent_loop

try:
    from .router import route_message
except ImportError:
    from router import route_message

try:
    from .handoff import parse_handoff, validate_handoff
except ImportError:
    from handoff import parse_handoff, validate_handoff

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

# --- Re-exports from extracted modules -------------------------------------------
from .gemini import (
    get_google_response, get_google_response_streaming, stream_response,
    retry_with_backoff, get_user_friendly_error, ERROR_MESSAGES
)
from .rag import (
    rag_router, rag_retrieve_cards, fix_router_queries,
    is_standalone_question, extract_card_keywords,
    PHASE_SEARCH, PHASE_RETRIEVAL
)
from .models import (
    get_section_title as _get_section_title,
    fetch_available_models as _fetch_available_models,
)

# Import Anki's main window for thread-safe UI access
try:
    from aqt import mw
except ImportError:
    mw = None

class AIHandler:
    """Handler für AI-Anfragen (nur Google Gemini)"""

    # Phase-Konstanten für strukturierte Status-Updates
    PHASE_INTENT = "intent"
    PHASE_SEARCH = PHASE_SEARCH
    PHASE_RETRIEVAL = PHASE_RETRIEVAL
    PHASE_GENERATING = "generating"
    PHASE_FINISHED = "finished"

    def __init__(self, widget=None):
        self.config = get_config() or {}
        self.widget = widget  # Widget reference for UI state emission
        self._current_request_steps = []  # Track steps for the current request
        self._current_request_id = None
        self._pipeline_signal_callback = None
        self._current_step_labels = []

    def _refresh_config(self):
        """Lädt die Config neu, um sicherzustellen dass API-Key aktuell ist"""
        self.config = get_config(force_reload=True) or {}

    def _get_auth_headers(self):
        """Delegiert an auth_manager Modul."""
        try:
            from .auth import get_auth_headers
        except ImportError:
            from auth import get_auth_headers
        return get_auth_headers()

    def _refresh_auth_token(self):
        """Delegiert an auth_manager Modul."""
        try:
            from .auth import refresh_auth_token
        except ImportError:
            from auth import refresh_auth_token
        result = refresh_auth_token()
        if result:
            self._refresh_config()
        return result

    def _ensure_valid_token(self):
        """Delegiert an auth_manager Modul."""
        try:
            from .auth import ensure_valid_token
        except ImportError:
            from auth import ensure_valid_token
        return ensure_valid_token()

    # ---- Thin delegation wrappers for extracted modules -------------------------

    def _get_google_response(self, user_message, model, api_key, context=None,
                             history=None, mode='compact', rag_context=None,
                             system_prompt_override=None):
        return get_google_response(
            user_message, model, api_key,
            context=context, history=history, mode=mode,
            rag_context=rag_context,
            system_prompt_override=system_prompt_override,
            config=self.config,
        )

    def _get_google_response_streaming(self, user_message, model, api_key,
                                       context=None, history=None, mode='compact',
                                       callback=None, rag_context=None,
                                       suppress_error_callback=False,
                                       system_prompt_override=None):
        return get_google_response_streaming(
            user_message, model, api_key,
            context=context, history=history, mode=mode,
            callback=callback, rag_context=rag_context,
            suppress_error_callback=suppress_error_callback,
            system_prompt_override=system_prompt_override,
            config=self.config,
        )

    def _stream_response(self, urls, data, callback=None, use_backend=False,
                         backend_data=None):
        return stream_response(
            urls, data,
            callback=callback, use_backend=use_backend,
            backend_data=backend_data,
        )

    def get_section_title(self, question, answer=""):
        return _get_section_title(question, answer, config=self.config)

    def fetch_available_models(self, provider, api_key):
        return _fetch_available_models(provider, api_key)

    def _rag_router(self, user_message, context=None):
        return rag_router(
            user_message, context=context,
            config=self.config,
            emit_step=self._emit_pipeline_step,
        )

    def _rag_retrieve_cards(self, precise_queries=None, broad_queries=None,
                            search_scope="current_deck", context=None,
                            max_notes=10, suppress_event=False):
        return rag_retrieve_cards(
            precise_queries=precise_queries,
            broad_queries=broad_queries,
            search_scope=search_scope,
            context=context,
            max_notes=max_notes,
            emit_state=self._emit_ai_state,
            emit_event=None if suppress_event else self._emit_ai_event,
        )

    def _fix_router_queries(self, router_result, user_message, context):
        return fix_router_queries(router_result, user_message, context)

    def _is_standalone_question(self, user_message, context):
        return is_standalone_question(user_message, context)

    def _extract_card_keywords(self, context):
        return extract_card_keywords(context)

    # ---- Core orchestration methods (kept in handler.py) ------------------------

    def get_response(self, user_message, context=None, history=None, mode='compact',
                     callback=None, system_prompt_override=None, model_override=None):
        """
        Generiert eine Antwort auf eine Benutzer-Nachricht mit optionalem Streaming.
        """
        self._refresh_config()

        if not self.is_configured():
            if is_backend_mode():
                error_msg = "Bitte verbinden Sie sich zuerst mit Ihrem Account in den Einstellungen."
            else:
                error_msg = "Bitte konfigurieren Sie zuerst den API-Schlüssel in den Einstellungen."
            if callback:
                callback(error_msg, True, False)
            return error_msg

        model = model_override or self.config.get("model_name", "")
        api_key = self.config.get("api_key", "")

        try:
            if callback:
                return self._get_google_response_streaming(
                    user_message, model, api_key,
                    context=context, history=history, mode=mode, callback=callback,
                    system_prompt_override=system_prompt_override,
                )
            else:
                return self._get_google_response(
                    user_message, model, api_key,
                    context=context, history=history, mode=mode,
                    system_prompt_override=system_prompt_override,
                )
        except Exception as e:
            error_msg = f"Fehler bei der API-Anfrage: {str(e)}"
            if callback:
                callback(error_msg, True, False)
            return error_msg

    def is_configured(self):
        """Prüft, ob die AI-Konfiguration vollständig ist"""
        if is_backend_mode():
            return True  # Backend-Modus = immer konfiguriert (unterstützt anonyme User)
        api_key = self.config.get("api_key", "")
        return bool(api_key.strip())

    def get_model_info(self):
        """Gibt Informationen über das konfigurierte Modell zurück"""
        return {
            "provider": "google",
            "model": self.config.get("model_name", "gemini-3-flash-preview"),
            "style": self.config.get("response_style", "balanced")
        }

    # ---- Emit helpers (access self.widget, must stay here) ----------------------

    def _emit_ai_state(self, message, phase=None, metadata=None):
        """
        Sendet AI-State-Updates an das Frontend und speichert sie für die Historie.
        Thread-safe via mw.taskman.run_on_main().
        """
        step = {
            "state": message,
            "timestamp": time.time() * 1000,
            "phase": phase,
            "metadata": metadata or {}
        }
        self._current_request_steps.append(step)

        req_id = getattr(self, '_current_request_id', None)
        if req_id:
            logger.debug("_emit_ai_state SUPPRESSED (pipeline active, reqId=%s): %s",
                         req_id[:8], message[:50])
            return
        else:
            logger.debug("_emit_ai_state SENDING (no pipeline): %s", message[:50])

        if not self.widget or not self.widget.web_view:
            return

        payload = {
            "type": "ai_state",
            "message": message,
            "phase": phase,
            "metadata": metadata or {}
        }
        js_payload = json.dumps(payload)

        if mw and mw.taskman:
            def emit_on_main():
                try:
                    self.widget.web_view.page().runJavaScript(
                        "window.ankiReceive(" + js_payload + ");"
                    )
                    logger.debug("RAG State: %s (phase: %s)", message, phase)
                    from aqt.qt import QApplication
                    app = QApplication.instance()
                    if app:
                        app.processEvents()
                except Exception as e:
                    logger.warning("Fehler beim Senden von AI-State: %s", e)
            mw.taskman.run_on_main(emit_on_main)
        else:
            try:
                self.widget.web_view.page().runJavaScript(
                    "window.ankiReceive(" + js_payload + ");"
                )
                logger.debug("RAG State: %s (phase: %s)", message, phase)
            except Exception as e:
                logger.warning("Fehler beim Senden von AI-State: %s", e)

    def _emit_pipeline_step(self, step, status, data=None):
        """Emit a pipeline_step event to the frontend via Qt signal."""
        if status == 'done':
            label = self._step_done_label(step, data)
            self._current_step_labels.append(label)

        if getattr(self, '_fallback_in_progress', False) and step not in ('router', 'orchestrating'):
            return

        callback = getattr(self, '_pipeline_signal_callback', None)
        if callback:
            try:
                callback(step, status, data)
            except Exception as e:
                logger.warning("_emit_pipeline_step error: %s", e)

    def _step_done_label(self, step, data):
        """Generate a human-readable label for a completed step."""
        data = data or {}
        mode_labels = {
            'both': 'Hybrid-Suche',
            'sql': 'Keyword-Suche',
            'semantic': 'Semantische Suche',
        }
        if step in ('router', 'orchestrating'):
            mode = mode_labels.get(data.get('retrieval_mode', ''),
                                   data.get('retrieval_mode', ''))
            scope = data.get('scope_label', '')
            if not data.get('search_needed', True):
                return 'Keine Suche nötig'
            return f"{mode} \u00b7 {scope}" if scope else mode or 'Anfrage analysiert'
        elif step == 'sql_search':
            return f"{data.get('total_hits', 0)} Keyword-Treffer"
        elif step == 'semantic_search':
            return f"{data.get('total_hits', 0)} semantische Treffer"
        elif step == 'merge':
            t = data.get('total', 0)
            return f"{t} Quelle{'n' if t != 1 else ''} kombiniert"
        elif step == 'generating':
            return "Antwort generiert"
        return step

    def _emit_ai_event(self, event_type, data):
        """Sendet ein strukturiertes Event an das Frontend."""
        if not self.widget or not self.widget.web_view:
            return

        payload_str = json.dumps({"type": event_type, "data": data})

        if mw and mw.taskman:
            def emit_on_main():
                try:
                    self.widget.web_view.page().runJavaScript(
                        "window.ankiReceive(" + payload_str + ");"
                    )
                    logger.debug("AI Event (%s) sent", event_type)
                except Exception as e:
                    logger.warning("Fehler beim Senden von AI-Event: %s", e)
            mw.taskman.run_on_main(emit_on_main)

    def _emit_msg_event(self, event_type, data):
        """Emit a structured message event to the frontend (v2 protocol)."""
        if not self.widget or not self.widget.web_view:
            return
        payload = {"type": event_type}
        payload.update(data)
        payload_str = json.dumps(payload)
        if mw and mw.taskman:
            def emit_on_main():
                try:
                    self.widget.web_view.page().runJavaScript(
                        "window.ankiReceive(" + payload_str + ");"
                    )
                except Exception as e:
                    logger.warning("msg_event emit error: %s", e)
            mw.taskman.run_on_main(emit_on_main)

    # ---- RAG orchestrator (stays here -- uses self.widget, self._emit_*) --------

    def get_response_with_rag(self, user_message, context=None, history=None,
                              mode='compact', callback=None, insights=None):
        """
        Hauptmethode für RAG-Pipeline: Orchestriert Router -> Retrieval -> Generator.
        """
        self._current_request_steps = []
        self._current_step_labels = []
        self._fallback_in_progress = False
        citations = {}

        # v2: Emit msg_start for structured message system
        request_id = getattr(self, '_current_request_id', None)
        self._emit_msg_event("msg_start", {"messageId": request_id or ''})

        try:
            # Stage 0: Agent Routing
            session_context = {
                'locked_agent': None,  # Will be passed from frontend later
                'mode': 'card_session' if context and context.get('cardId') else 'free_chat',
                'deck_name': (context or {}).get('deckName', ''),
                'has_card': bool(context and context.get('cardId')),
            }
            routing_result = route_message(user_message, session_context, self.config)
            logger.info("Router: agent=%s, method=%s", routing_result.agent, routing_result.method)

            # If routed to a non-tutor agent, dispatch and return
            if routing_result.agent != 'tutor':
                self._emit_pipeline_step("orchestrating", "done", {
                    'search_needed': False,
                    'retrieval_mode': 'agent:%s' % routing_result.agent,
                    'scope': 'none',
                    'scope_label': routing_result.agent,
                })

                # Load shared memory for context
                try:
                    from .memory import load_shared_memory
                    memory = load_shared_memory()
                    memory_context = memory.to_context_string()
                except Exception:
                    memory_context = ''

                # Dispatch to agent via widget's subagent handler
                # The widget will handle streaming and UI updates
                if self.widget:
                    try:
                        try:
                            from .agents import get_agent, lazy_load_run_fn, AGENT_REGISTRY
                        except ImportError:
                            from agents import get_agent, lazy_load_run_fn, AGENT_REGISTRY
                        agent_def = get_agent(routing_result.agent)
                        if agent_def:
                            clean_msg = routing_result.clean_message or user_message
                            run_fn = lazy_load_run_fn(agent_def)
                            agent_kwargs = dict(agent_def.extra_kwargs)
                            if memory_context:
                                agent_kwargs['memory_context'] = memory_context
                            result = run_fn(situation=clean_msg, **agent_kwargs)
                            # Format result for streaming callback
                            text = result.get('text', '') if isinstance(result, dict) else str(result)
                            if callback:
                                callback(text, True, False,
                                         steps=self._current_request_steps,
                                         citations={},
                                         step_labels=self._current_step_labels)
                            if agent_def.on_finished and self.widget:
                                agent_def.on_finished(self.widget, routing_result.agent, result)
                            return text
                    except Exception as e:
                        logger.warning("Agent dispatch failed for %s: %s, falling back to Tutor",
                                       routing_result.agent, e)
                        # Fall through to Tutor pipeline

            # Continue with Tutor pipeline (existing RAG flow)
            self._emit_pipeline_step("orchestrating", "done", {
                'agent': 'tutor',
                'retrieval_mode': 'agent:tutor',
                'method': routing_result.method,
                'search_needed': True,
            })

            # v2: Emit orchestration event
            self._emit_msg_event("orchestration", {
                "messageId": request_id or '',
                "agent": "tutor",
                "mode": routing_result.method if hasattr(routing_result, 'method') else 'default',
                "steps": [{"step": "orchestrating", "status": "done", "data": {
                    "retrieval_mode": "agent:tutor",
                    "agent": "tutor",
                }}],
            })

            # Stage 1: Router
            router_result = self._rag_router(user_message, context=context)

            rag_context = None
            if router_result and router_result.get("search_needed"):
                # Stage 2: Retrieval
                search_scope = router_result.get("search_scope", "current_deck")
                max_sources_level = router_result.get("max_sources", "medium")
                max_notes = {"low": 5, "medium": 10, "high": 15}.get(max_sources_level, 10)
                logger.debug("RAG: max_sources=%s -> max_notes=%s", max_sources_level, max_notes)

                precise_queries = [q for q in router_result.get("precise_queries", []) if q and q.strip()]
                broad_queries = [q for q in router_result.get("broad_queries", []) if q and q.strip()]

                if precise_queries or broad_queries:
                    _emb_mgr = None
                    try:
                        from .. import get_embedding_manager
                        _emb_mgr = get_embedding_manager()
                    except Exception:
                        pass

                    retrieval_mode = router_result.get('retrieval_mode', 'both')

                    if _emb_mgr and retrieval_mode in ('semantic', 'both'):
                        try:
                            try:
                                from .retrieval import HybridRetrieval
                            except ImportError:
                                from retrieval import HybridRetrieval
                            hybrid = HybridRetrieval(_emb_mgr, self)
                            retrieval_result = hybrid.retrieve(
                                user_message, router_result, context, max_notes=max_notes)
                        except Exception as e:
                            logger.debug("Hybrid retrieval failed, falling back to SQL: %s", e)
                            retrieval_result = self._rag_retrieve_cards(
                                precise_queries=precise_queries,
                                broad_queries=broad_queries,
                                search_scope=search_scope,
                                context=context,
                                max_notes=max_notes,
                            )
                    else:
                        retrieval_result = self._rag_retrieve_cards(
                            precise_queries=precise_queries,
                            broad_queries=broad_queries,
                            search_scope=search_scope,
                            context=context,
                            max_notes=max_notes,
                        )

                    if retrieval_result and retrieval_result.get("context_string"):
                        context_string = retrieval_result["context_string"]
                        citations = retrieval_result.get("citations", {})

                        if context and context.get('cardId'):
                            current_note_id = str(context.get('noteId', context['cardId']))
                            if current_note_id not in citations:
                                import re as _re
                                _q = context.get('question') or context.get('frontField') or ''
                                _a = context.get('answer') or ''
                                _q_clean = _re.sub(r'<[^>]+>', ' ', _q).strip()[:200]
                                _a_clean = _re.sub(r'<[^>]+>', ' ', _a).strip()[:200]
                                citations[current_note_id] = {
                                    'noteId': context.get('noteId', context['cardId']),
                                    'cardId': context['cardId'],
                                    'question': _q_clean,
                                    'answer': _a_clean,
                                    'fields': context.get('fields', {}),
                                    'deckName': context.get('deckName', ''),
                                    'isCurrentCard': True,
                                    'sources': ['current'],
                                }
                                context_string = (
                                    f"Note {current_note_id} (aktuelle Karte):\n"
                                    f"  Frage: {_q_clean}\n  Antwort: {_a_clean}\n"
                                    f"{context_string}"
                                )

                        formatted_cards = [line for line in context_string.split("\n") if line.strip()]
                        rag_context = {
                            "cards": formatted_cards,
                            "reasoning": router_result.get("reasoning", ""),
                            "citations": citations,
                        }
                        logger.debug("RAG: %s Karten fuer Kontext verwendet, %s Citations",
                                     len(formatted_cards), len(citations))
                        # Re-emit rag_sources with complete citations (including current card)
                        self._emit_ai_event("rag_sources", citations)

                        # v2: Fold citations into agent_cell update
                        self._emit_msg_event("agent_cell", {
                            "messageId": request_id or '',
                            "agent": "tutor",
                            "status": "thinking",
                            "data": {"citations": citations}
                        })
                    else:
                        logger.debug("RAG: Keine Karten gefunden")

            # Even without search, include current card as context for the AI
            if not rag_context and context and context.get('cardId'):
                import re as _re
                current_note_id = str(context.get('noteId', context['cardId']))
                _q = context.get('question') or context.get('frontField') or ''
                _a = context.get('answer') or ''
                _q_clean = _re.sub(r'<[^>]+>', ' ', _q).strip()[:200]
                _a_clean = _re.sub(r'<[^>]+>', ' ', _a).strip()[:200]
                if _q_clean or _a_clean:
                    rag_context = {
                        "cards": [
                            f"Note {current_note_id} (aktuelle Karte):\n"
                            f"  Frage: {_q_clean}\n  Antwort: {_a_clean}"
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
                    citations = rag_context["citations"]

            # Stage 3: Generator
            self._refresh_config()

            if not self.is_configured():
                error_msg = "Bitte konfigurieren Sie zuerst den API-Schlüssel in den Einstellungen."
                if callback:
                    callback(error_msg, True, False)
                return error_msg

            model = "gemini-3-flash-preview"
            fallback_model = "gemini-2.5-flash"
            api_key = self.config.get("api_key", "")

            ai_tools = self.config.get("ai_tools", {
                "images": True, "diagrams": True, "molecules": False})
            insights_system_prompt = get_system_prompt(
                mode=mode, tools=ai_tools, insights=insights)

            # v2: Tutor cell enters thinking state
            self._emit_msg_event("agent_cell", {
                "messageId": request_id or '',
                "agent": "tutor",
                "status": "thinking",
                "data": {}
            })

            self._emit_pipeline_step("generating", "active")

            _generating_done_emitted = False
            _buffered_done = [None]  # Buffer done signal for handoff check

            def enhanced_callback(chunk, done, is_function_call=False):
                nonlocal _generating_done_emitted
                if done:
                    if not _generating_done_emitted:
                        self._emit_pipeline_step("generating", "done")
                        _generating_done_emitted = True
                    # Buffer done signal — released after handoff check
                    _buffered_done[0] = chunk
                else:
                    if callback:
                        callback(chunk, done, is_function_call)
                    # v2: Emit text_chunk for structured messages
                    if chunk and not is_function_call:
                        self._emit_msg_event("text_chunk", {
                            "messageId": request_id or '',
                            "agent": "tutor",
                            "chunk": chunk,
                        })

            def _release_done(extra_text=None):
                """Release the buffered done signal, optionally appending extra text."""
                if _buffered_done[0] is not None or extra_text:
                    # Include marker IN the done chunk so React processes both atomically
                    final_chunk = _buffered_done[0] or ''
                    if extra_text:
                        final_chunk = ('\n' + extra_text) if not final_chunk else final_chunk
                    if callback:
                        callback(final_chunk, True, False,
                                 steps=self._current_request_steps,
                                 citations=citations,
                                 step_labels=getattr(self, '_current_step_labels', []))
                    # v2: Emit msg_done
                    self._emit_msg_event("msg_done", {"messageId": request_id or ''})

            try:
                if callback:
                    result = self._get_google_response_streaming(
                        user_message, model, api_key,
                        context=context, history=history, mode=mode,
                        callback=enhanced_callback,
                        rag_context=rag_context,
                        suppress_error_callback=True,
                        system_prompt_override=insights_system_prompt,
                    )
                else:
                    result = self._get_google_response(
                        user_message, model, api_key,
                        context=context, history=history, mode=mode,
                        rag_context=rag_context,
                        system_prompt_override=insights_system_prompt,
                    )

                # --- Handoff check ---
                # Parse the Tutor's response for a HANDOFF signal
                if result and isinstance(result, str):
                    clean_result, handoff_req = parse_handoff(result)
                    if handoff_req:
                        # Validate the handoff
                        if validate_handoff(handoff_req, 'tutor', ['tutor'], self.config):
                            logger.info("Executing handoff: tutor -> %s (query: %s)",
                                        handoff_req.to, handoff_req.query[:50])

                            marker = None
                            # Send loading indicator IMMEDIATELY before agent runs
                            import json as _json
                            loading_marker = '[[TOOL:%s]]' % _json.dumps({
                                'name': 'agent_handoff',
                                'displayType': 'loading',
                                'loadingHint': handoff_req.reason,
                            }, ensure_ascii=False)
                            # Send clean text + loading marker as a chunk so user sees it instantly
                            if callback:
                                callback('\n' + loading_marker, False, False)

                            # v2: Emit loading state for target agent
                            self._emit_msg_event("agent_cell", {
                                "messageId": request_id or '',
                                "agent": handoff_req.to,
                                "status": "loading",
                                "data": {"loadingHint": handoff_req.reason}
                            })

                            # Execute the target agent
                            try:
                                from .agents import get_agent, lazy_load_run_fn
                                target_def = get_agent(handoff_req.to)
                                if target_def:
                                    run_fn = lazy_load_run_fn(target_def)
                                    target_result = run_fn(
                                        situation=handoff_req.query,
                                        **target_def.extra_kwargs
                                    )

                                    if isinstance(target_result, dict):
                                        target_text = target_result.get('text', '') or target_result.get('answer', '')
                                    else:
                                        target_text = str(target_result)

                                    if target_text:
                                        import json as _json
                                        marker = '[[TOOL:%s]]' % _json.dumps({
                                            'name': 'agent_handoff',
                                            'displayType': 'widget',
                                            'result': {
                                                'agent': handoff_req.to,
                                                'text': target_text,
                                                'reason': handoff_req.reason,
                                                'sources': target_result.get('sources', []) if isinstance(target_result, dict) else [],
                                            }
                                        }, ensure_ascii=False)

                                        # v2: Emit target agent result
                                        self._emit_msg_event("agent_cell", {
                                            "messageId": request_id or '',
                                            "agent": handoff_req.to,
                                            "status": "done",
                                            "data": {
                                                "text": target_text,
                                                "sources": target_result.get('sources', []) if isinstance(target_result, dict) else [],
                                                "toolUsed": target_result.get('tool_used', '') if isinstance(target_result, dict) else '',
                                            }
                                        })

                                    # Run on_finished if defined
                                    if target_def.on_finished and self.widget:
                                        try:
                                            target_def.on_finished(
                                                self.widget, handoff_req.to,
                                                target_result if isinstance(target_result, dict) else {}
                                            )
                                        except Exception as e:
                                            logger.warning("Handoff on_finished error: %s", e)

                                    logger.info("Handoff complete: tutor -> %s", handoff_req.to)
                            except Exception as e:
                                logger.warning("Handoff execution failed: %s", e)

                            # Release done with handoff marker included
                            _release_done(marker)
                            return clean_result
                        else:
                            logger.info("Handoff rejected, returning original response")

                # No handoff — release buffered done signal
                _release_done()

                # v2: Emit msg_done for non-handoff responses
                self._emit_msg_event("msg_done", {"messageId": request_id or ''})

                # Memory extraction (rule-based, fast)
                try:
                    from .memory import extract_memory_signals, apply_memory_updates
                    mem_updates = extract_memory_signals(user_message)
                    if mem_updates:
                        apply_memory_updates(mem_updates)
                except Exception as mem_err:
                    logger.debug("Memory extraction skipped: %s", mem_err)

                return result

            except Exception as e:
                error_str = str(e).lower()
                status_code = None
                if hasattr(e, 'response') and e.response:
                    status_code = e.response.status_code

                logger.warning("Primary model error (%s): %s...",
                               status_code or 'unknown', str(e)[:100])

                fallback_rag_context = rag_context
                fallback_history = history

                if status_code == 400 or "400" in error_str or "too large" in error_str:
                    logger.warning("400/Size Error -> Massives Kuerzen fuer Fallback")
                    fallback_history = []
                    if rag_context and rag_context.get("cards"):
                        fallback_rag_context = dict(rag_context)
                        fallback_rag_context["cards"] = rag_context["cards"][:3]

                logger.info("Versuche Fallback mit gemini-2.5-flash (mit RAG)...")
                self._fallback_in_progress = True
                try:
                    if callback:
                        fallback_result = self._get_google_response_streaming(
                            user_message, fallback_model, api_key,
                            context=context, history=fallback_history, mode=mode,
                            callback=enhanced_callback,
                            rag_context=fallback_rag_context,
                            suppress_error_callback=True,
                            system_prompt_override=insights_system_prompt,
                        )
                    else:
                        fallback_result = self._get_google_response(
                            user_message, fallback_model, api_key,
                            context=context, history=fallback_history, mode=mode,
                            rag_context=fallback_rag_context,
                            system_prompt_override=insights_system_prompt,
                        )
                    # Check fallback result for handoff signal
                    fb_marker = None
                    if fallback_result and isinstance(fallback_result, str):
                        clean_fb, fb_handoff = parse_handoff(fallback_result)
                        if fb_handoff and validate_handoff(fb_handoff, 'tutor', ['tutor'], self.config):
                            logger.info("Fallback handoff: tutor -> %s", fb_handoff.to)
                            try:
                                from .agents import get_agent, lazy_load_run_fn
                                target_def = get_agent(fb_handoff.to)
                                if target_def:
                                    run_fn = lazy_load_run_fn(target_def)
                                    target_result = run_fn(
                                        situation=fb_handoff.query,
                                        **target_def.extra_kwargs
                                    )
                                    if isinstance(target_result, dict):
                                        target_text = target_result.get('text', '') or target_result.get('answer', '')
                                    else:
                                        target_text = str(target_result)
                                    if target_text:
                                        import json as _json
                                        fb_marker = '[[TOOL:%s]]' % _json.dumps({
                                            'name': 'agent_handoff',
                                            'displayType': 'widget',
                                            'result': {
                                                'agent': fb_handoff.to,
                                                'text': target_text,
                                                'reason': fb_handoff.reason,
                                                'sources': target_result.get('sources', []) if isinstance(target_result, dict) else [],
                                            }
                                        }, ensure_ascii=False)
                                    _release_done(fb_marker)
                                    return clean_fb
                            except Exception as he:
                                logger.warning("Fallback handoff failed: %s", he)
                    _release_done()
                    return fallback_result
                except Exception as fallback_e:
                    logger.warning("Fallback mit RAG gescheitert: %s", fallback_e)
                    logger.info("Letzter Versuch: Fallback OHNE RAG...")
                    if callback:
                        return self._get_google_response_streaming(
                            user_message, fallback_model, api_key,
                            context=context, history=None, mode=mode,
                            callback=enhanced_callback,
                            rag_context=None,
                            suppress_error_callback=False,
                            system_prompt_override=insights_system_prompt,
                        )
                    else:
                        raise fallback_e

        except Exception as e:
            error_msg = f"Fehler in RAG-Pipeline: {str(e)}"
            logger.exception("%s", error_msg)
            logger.info("Fallback auf normale Antwort ohne RAG (Endgueltig)...")
            return self.get_response(
                user_message, context=context, history=history, mode=mode,
                callback=enhanced_callback or callback)


# Globale Instanz
_ai_handler = None


def get_ai_handler(widget=None):
    """Gibt die globale AI-Handler-Instanz zurück"""
    global _ai_handler
    if _ai_handler is None:
        _ai_handler = AIHandler(widget=widget)
    elif widget and not _ai_handler.widget:
        _ai_handler.widget = widget
    return _ai_handler
