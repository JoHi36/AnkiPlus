"""
AI-Handler für das Anki Chatbot Addon — pure dispatcher.

Routes every message through the unified router, loads the target agent,
and dispatches via _dispatch_agent(). All agents (Tutor, Help, Research,
Plusi) go through the same path — no special cases.

Heavy lifting is delegated to:
  - ai.agents   (Agent registry, lazy loading)
  - ai.router   (Unified message routing)
  - ai.gemini   (Gemini API requests, streaming, retry logic)
  - ai.tutor    (Tutor agent: RAG + streaming + fallback + handoff)
  - ai.models   (section titles, model fetching)
"""

import json
import time
try:
    from ..config import (
        get_config, RESPONSE_STYLES, is_backend_mode, get_backend_url,
        get_auth_token, get_refresh_token, update_config
    )
except ImportError:
    from config import (
        get_config, RESPONSE_STYLES, is_backend_mode, get_backend_url,
        get_auth_token, get_refresh_token, update_config
    )

try:
    from .rag_analyzer import analyze_query
except ImportError:
    from rag_analyzer import analyze_query

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

# --- Re-exports from extracted modules -------------------------------------------
try:
    from .gemini import (
        get_google_response, get_google_response_streaming, stream_response,
        retry_with_backoff, get_user_friendly_error, ERROR_MESSAGES
    )
except ImportError:
    from gemini import (
        get_google_response, get_google_response_streaming, stream_response,
        retry_with_backoff, get_user_friendly_error, ERROR_MESSAGES
    )

try:
    from .rag import PHASE_SEARCH, PHASE_RETRIEVAL
except ImportError:
    from rag import PHASE_SEARCH, PHASE_RETRIEVAL

try:
    from .citation_builder import CitationBuilder
except ImportError:
    from citation_builder import CitationBuilder

try:
    from .models import (
        get_section_title as _get_section_title,
        fetch_available_models as _fetch_available_models,
    )
except ImportError:
    from models import (
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
        self._msg_event_callback = None
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
            pipeline_step_callback=getattr(self, '_pipeline_signal_callback', None),
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

    # ---- Core orchestration methods (kept in handler.py) ------------------------

    def get_response(self, user_message, context=None, history=None, mode='compact',
                     callback=None, system_prompt_override=None, model_override=None):
        """
        Generiert eine Antwort auf eine Benutzer-Nachricht mit optionalem Streaming.
        """
        self._refresh_config()

        if not self.is_configured():
            error_msg = "Bitte verbinden Sie sich zuerst mit Ihrem Account in den Einstellungen."
            if callback:
                callback(error_msg, True, False)
            return error_msg

        model = model_override or self.config.get("model_name", "")
        api_key = ""  # Legacy parameter — backend handles auth

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
        except (OSError, ValueError, RuntimeError) as e:
            error_msg = f"Fehler bei der API-Anfrage: {str(e)}"
            logger.exception("get_response error: %s", e)
            if callback:
                callback(error_msg, True, False)
            return error_msg

    def is_configured(self):
        """Prüft, ob die AI-Konfiguration vollständig ist"""
        return is_backend_mode()  # Backend-Modus = immer konfiguriert (unterstützt anonyme User)

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
                except (AttributeError, RuntimeError) as e:
                    logger.warning("Fehler beim Senden von AI-State: %s", e)
            mw.taskman.run_on_main(emit_on_main)
        else:
            try:
                self.widget.web_view.page().runJavaScript(
                    "window.ankiReceive(" + js_payload + ");"
                )
                logger.debug("RAG State: %s (phase: %s)", message, phase)
            except (AttributeError, RuntimeError) as e:
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
            except (AttributeError, TypeError, RuntimeError) as e:
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
        elif step == 'web_search':
            source_count = data.get('source_count', 0)
            tool_used = data.get('tool_used', 'web')
            tool_label = {'pubmed': 'PubMed', 'wikipedia': 'Wikipedia'}.get(tool_used, 'Web')
            return f"{source_count} {tool_label}-Quelle{'n' if source_count != 1 else ''}" if source_count else f"{tool_label}-Recherche"
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
                except (AttributeError, RuntimeError) as e:
                    logger.warning("Fehler beim Senden von AI-Event: %s", e)
            mw.taskman.run_on_main(emit_on_main)

    def _emit_msg_event(self, event_type, data):
        """Emit a structured message event to the frontend (v2 protocol).
        Uses Qt signal callback (set by AIRequestThread) for synchronous delivery,
        falling back to taskman for events emitted outside the thread context."""
        cb = getattr(self, '_msg_event_callback', None)
        if cb:
            cb(event_type, data)
            return
        # Fallback: direct JS injection via taskman (e.g., events outside AI thread)
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
                except (AttributeError, RuntimeError) as e:
                    logger.warning("msg_event emit error: %s", e)
            mw.taskman.run_on_main(emit_on_main)

    # ---- Consolidated agent dispatch (all agents) --------------------------------

    def _dispatch_agent(self, agent_name, run_fn, situation, request_id,
                        on_finished=None, extra_kwargs=None, callback=None,
                        agent_def=None):
        """Consolidated agent dispatch — used for ALL agents including Tutor.

        Creates AgentMemory, loads shared memory, emits v2 events,
        calls the agent's run function with standard interface, handles result.

        Args:
            agent_name: Agent identifier ('tutor', 'help', 'research', 'plusi', etc.)
            run_fn: The agent's run function (standard signature)
            situation: User message (cleaned of @mentions)
            request_id: Unique request ID for v2 event correlation
            on_finished: Optional lifecycle callback(widget, agent_name, result)
            extra_kwargs: Additional kwargs to pass to the agent
            callback: Optional v1 streaming callback
            agent_def: Optional AgentDefinition for model selection

        Returns:
            str: The agent's response text
        """
        extra_kwargs = extra_kwargs or {}

        # Orchestration — always show agent routing, never search details.
        # Search details (retrieval_mode, scope) are agent-internal pipeline steps.
        rag_analysis = extra_kwargs.get('routing_result')  # RagAnalysis or None
        response_length = 'medium'
        if rag_analysis:
            response_length = getattr(rag_analysis, 'response_length', 'medium')

        context = extra_kwargs.get('context')
        has_card = bool(context and context.get('cardId'))
        orch_data = {
            'search_needed': getattr(rag_analysis, 'search_needed', False) if rag_analysis else False,
            'retrieval_mode': 'agent:%s' % agent_name,
            'method': 'channel',
            'scope': getattr(rag_analysis, 'search_scope', 'none') if rag_analysis else 'none',
            'scope_label': agent_name,
            'response_length': response_length,
            'has_card': has_card,
        }
        self._emit_pipeline_step("orchestrating", "done", orch_data)

        # v2: Emit orchestration event
        self._emit_msg_event("orchestration", {
            "messageId": request_id or '',
            "agent": agent_name,
            "mode": "channel",
            "steps": [{"step": "orchestrating", "status": "done", "data": {
                "agent": agent_name,
                **orch_data,
            }}],
        })

        # v2: Update agent cell if agent changed from default (tutor → other)
        # The initial agent_cell was already sent in get_response_with_rag()
        if agent_name != 'tutor':
            self._emit_msg_event("agent_cell", {
                "messageId": request_id or '',
                "agent": agent_name,
                "status": "loading",
                "data": {}
            })

        # Load shared memory for context
        memory_context = ''
        try:
            from .memory import load_shared_memory
            shared_mem = load_shared_memory()
            memory_context = shared_mem.to_context_string()
        except (AttributeError, ImportError, OSError) as e:
            logger.debug("load_shared_memory error: %s", e)

        # Create agent-specific memory instance
        agent_memory = None
        try:
            from .agent_memory import AgentMemory
            agent_memory = AgentMemory(agent_name)
        except (AttributeError, ImportError, OSError) as e:
            logger.debug("AgentMemory init error: %s", e)

        # Build the agent's emit_step callback (routes through pipeline signal)
        def agent_emit_step(step, status, data=None):
            enriched = dict(data or {})
            enriched['agent'] = agent_name
            self._emit_pipeline_step(step, status, enriched)

        # Emit strategy step — always visible in the agent's reasoning area.
        search_needed = False
        resolved_intent = ''
        if rag_analysis:
            search_needed = getattr(rag_analysis, 'search_needed', False)
            resolved_intent = getattr(rag_analysis, 'resolved_intent', '') or ''
        agent_emit_step("strategy", "done", {
            'search_needed': search_needed,
            'resolved_intent': resolved_intent,
            'has_card': has_card,
        })

        # Build kwargs — always inject config so every agent has access
        agent_kwargs = dict(extra_kwargs)
        agent_kwargs.setdefault('config', self.config or {})
        if memory_context:
            agent_kwargs['memory_context'] = memory_context

        # Inject embedding_manager for agents that need semantic search
        if 'embedding_manager' not in agent_kwargs:
            try:
                # Access the global embedding manager without re-importing __init__
                import sys
                init_mod = sys.modules.get('AnkiPlus_main') or sys.modules.get('__init__')
                if init_mod and hasattr(init_mod, 'get_embedding_manager'):
                    emb = init_mod.get_embedding_manager()
                    if emb:
                        agent_kwargs['embedding_manager'] = emb
            except (AttributeError, ImportError) as e:
                logger.debug("embedding_manager inject error: %s", e)

        # Model selection from agent_def + global mode
        if agent_def:
            mode = (self.config or {}).get('model_mode', 'premium')
            if mode == 'fast':
                model = agent_def.fast_model or agent_def.premium_model
            else:
                model = agent_def.premium_model or agent_def.fast_model
            fallback = agent_def.fallback_model or model
            if model:
                agent_kwargs['model'] = model
            if fallback:
                agent_kwargs['fallback_model'] = fallback

        # Inject CitationBuilder — every agent gets one
        agent_kwargs['citation_builder'] = CitationBuilder()

        # Build streaming callback
        _used_streaming = []
        _chunk_count = [0]
        def _stream_callback(chunk, done):
            if done:
                return
            if chunk:
                _used_streaming.append(True)
                _chunk_count[0] += 1
                if _chunk_count[0] <= 3:
                    logger.info("[DEBUG] _stream_callback: emitting text_chunk #%d, agent=%s, len=%d",
                                _chunk_count[0], agent_name, len(chunk))
                self._emit_msg_event("text_chunk", {
                    "messageId": request_id or '',
                    "agent": agent_name,
                    "chunk": chunk,
                })

        # Call agent with standard interface
        result = run_fn(
            situation=situation,
            emit_step=agent_emit_step,
            memory=agent_memory,
            stream_callback=_stream_callback,
            **agent_kwargs,
        )

        # Extract text and citations from result
        text = result.get('text', '') if isinstance(result, dict) else str(result)
        # Support both new array format and legacy dict format
        raw_citations = result.get('citations', []) if isinstance(result, dict) else []
        if isinstance(raw_citations, dict):
            citations = list(raw_citations.values()) if raw_citations else []
        else:
            citations = raw_citations
        logger.info("[DEBUG] _dispatch_agent done: agent=%s, textLen=%d, chunks=%d, usedStreaming=%s, citations=%d (type=%s)",
                    agent_name, len(text), _chunk_count[0], bool(_used_streaming),
                    len(citations) if citations else 0,
                    type(citations).__name__)

        # Only emit full text if agent didn't stream
        used_streaming = result.get('_used_streaming', False) if isinstance(result, dict) else False
        if not _used_streaming and not used_streaming:
            self._emit_msg_event("text_chunk", {
                "messageId": request_id or '',
                "agent": agent_name,
                "chunk": text,
            })

        # v2: Mark agent cell done (include citations if available)
        cell_data = {}
        if citations:
            cell_data['citations'] = citations
        self._emit_msg_event("agent_cell", {
            "messageId": request_id or '',
            "agent": agent_name,
            "status": "done",
            "data": cell_data,
        })

        # v1 callback
        if callback:
            callback(text, True, False,
                     steps=self._current_request_steps,
                     citations=citations,
                     step_labels=self._current_step_labels)

        # Memory extraction (rule-based, fast)
        try:
            from .memory import extract_memory_signals, apply_memory_updates
            mem_updates = extract_memory_signals(situation)
            if mem_updates:
                apply_memory_updates(mem_updates)
        except (AttributeError, ImportError, KeyError) as mem_err:
            logger.debug("Memory extraction skipped: %s", mem_err)

        # v2: Done — include webSources if the tutor used web search tools
        msg_done_data = {"messageId": request_id or ''}
        web_sources = result.get('webSources') if isinstance(result, dict) else None
        if web_sources:
            msg_done_data['webSources'] = web_sources
        self._emit_msg_event("msg_done", msg_done_data)

        # Lifecycle: on_finished (main thread)
        if on_finished and self.widget:
            _widget = self.widget
            _result = result if isinstance(result, dict) else {}
            if mw and mw.taskman:
                mw.taskman.run_on_main(
                    lambda: on_finished(_widget, agent_name, _result))

        return text

    def dispatch_smart_search(self, query, cards_data, cluster_info, request_id=None):
        """Dispatch Research agent for Smart Search with pre-loaded card context.

        Skips routing — always uses Research. Cards are passed as pre-loaded RAG
        context so the Research agent skips its own retrieval pipeline.

        Args:
            query: The user's search query.
            cards_data: List of card dicts from SearchCardsThread (up to 50).
            cluster_info: Dict of cluster_id -> [card_question_snippets].
            request_id: Optional request ID for v2 event correlation.

        Returns:
            str: The Research agent's response text.
        """
        try:
            from .agents import get_agent, lazy_load_run_fn
        except ImportError:
            from agents import get_agent, lazy_load_run_fn

        agent_def = get_agent('research')
        run_fn = lazy_load_run_fn(agent_def)

        self._current_request_id = request_id

        # Build pre-loaded RAG context from search cards
        smart_search_context = {
            'query': query,
            'cards_data': cards_data[:50],
            'cluster_info': cluster_info,
        }

        return self._dispatch_agent(
            agent_name='research',
            run_fn=run_fn,
            situation=query,
            request_id=request_id,
            on_finished=agent_def.on_finished,
            extra_kwargs={
                'context': None,
                'history': [],
                'mode': 'compact',
                'smart_search_context': smart_search_context,
                **agent_def.extra_kwargs,
            },
            callback=None,
            agent_def=agent_def,
        )

    # ---- Pure dispatcher (all agents go through _dispatch_agent) ----------------

    def get_response_with_rag(self, user_message, context=None, history=None,
                              mode='compact', callback=None, insights=None,
                              agent_name=None):
        """Dispatch user message to the appropriate agent."""
        self._current_request_steps = []
        self._current_step_labels = []
        self._fallback_in_progress = False
        request_id = getattr(self, '_current_request_id', None)
        agent_name = agent_name or 'tutor'

        # v2: Start — emit agent cell with the known agent
        self._emit_msg_event("msg_start", {"messageId": request_id or ''})
        self._emit_msg_event("agent_cell", {
            "messageId": request_id or '',
            "agent": agent_name,
            "status": "loading",
            "data": {"loadingHint": "Kontext..."}
        })
        self._emit_pipeline_step("orchestrating", "active")

        try:
            # Load agent directly — no routing needed (agent-kanal-paradigma)
            try:
                from .agents import get_agent, get_default_agent, lazy_load_run_fn
            except ImportError:
                from agents import get_agent, get_default_agent, lazy_load_run_fn

            agent_def = get_agent(agent_name)
            if not agent_def:
                agent_def = get_default_agent()
                logger.info("Agent %s not found, using default", agent_name)

            try:
                run_fn = lazy_load_run_fn(agent_def)
            except (AttributeError, ImportError) as e:
                logger.warning("Agent %s load failed: %s, using default", agent_def.name, e)
                agent_def = get_default_agent()
                run_fn = lazy_load_run_fn(agent_def)

            # RAG analysis — only for agents that need it
            rag_analysis = None
            if agent_def.uses_rag:
                rag_analysis = analyze_query(
                    user_message, card_context=context, chat_history=history)
            logger.info("Agent: %s, uses_rag=%s, search_needed=%s",
                        agent_def.name, agent_def.uses_rag,
                        getattr(rag_analysis, 'search_needed', None))

            # Dispatch — same path for ALL agents
            return self._dispatch_agent(
                agent_name=agent_def.name,
                run_fn=run_fn,
                situation=user_message,
                request_id=request_id,
                on_finished=agent_def.on_finished,
                extra_kwargs={
                    'context': context,
                    'history': history,
                    'mode': mode,
                    'insights': insights,
                    'routing_result': rag_analysis,  # Keep kwarg name for agent compat
                    'callback': callback,
                    **agent_def.extra_kwargs,
                },
                callback=callback,
                agent_def=agent_def,
            )

        except Exception as e:
            logger.exception("get_response_with_rag error: %s", e)
            error_msg = "Ein Fehler ist aufgetreten. Bitte versuche es erneut."
            if callback:
                callback(error_msg, True, False)
            self._emit_msg_event("msg_done", {"messageId": request_id or ''})
            return error_msg


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
