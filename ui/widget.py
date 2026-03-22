"""
ChatbotWidget Modul
Verwaltet das Web-basierte Chat-UI über QWebEngineView
"""

import os
import json
import uuid
from aqt.qt import *
from aqt.utils import showInfo

# WebEngine / WebChannel
try:
    from PyQt6.QtWebEngineWidgets import QWebEngineView
    from PyQt6.QtWebChannel import QWebChannel
except Exception:
    try:
        from PyQt5.QtWebEngineWidgets import QWebEngineView
        from PyQt5.QtWebChannel import QWebChannel
    except Exception:
        QWebEngineView = None
        QWebChannel = None

# Stelle sicher, dass QObject, pyqtSlot und pyqtSignal verfügbar sind
try:
    from PyQt6.QtCore import QObject, pyqtSlot, pyqtSignal, QThread
except ImportError:
    try:
        from PyQt5.QtCore import QObject, pyqtSlot, pyqtSignal, QThread
    except ImportError:
        QObject = object
        QThread = object
        def pyqtSlot(*args, **kwargs):
            def decorator(func):
                return func
            return decorator
        def pyqtSignal(*args, **kwargs):
            class FakeSignal:
                def connect(self, *args):
                    pass
                def emit(self, *args):
                    pass
            return FakeSignal()

# Config-Import
try:
    from ..config import get_config, update_config, AVAILABLE_MODELS
except ImportError:
    from config import get_config, update_config, AVAILABLE_MODELS

# Bridge-Import
try:
    from .bridge import WebBridge
except ImportError:
    from ui.bridge import WebBridge

# Card-Tracker-Import
try:
    from ..utils.card_tracker import CardTracker
except ImportError:
    from utils.card_tracker import CardTracker

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

# NOTE: Legacy sessions_storage (JSON) removed — per-card SQLite is now used instead.


class AIRequestThread(QThread):
    """Thread for asynchronous AI API requests with request-ID based streaming."""
    chunk_signal = pyqtSignal(str, str, bool, bool)  # requestId, chunk, done, is_function_call
    error_signal = pyqtSignal(str, str)  # requestId, error_message
    finished_signal = pyqtSignal(str)  # requestId
    metadata_signal = pyqtSignal(str, object, object, object)  # requestId, steps, citations, step_labels
    pipeline_signal = pyqtSignal(str, str, str, object)  # requestId, step, status, data

    def __init__(self, ai_handler, text, widget_ref, history=None, mode='compact', request_id=None, insights=None):
        super().__init__()
        self.ai_handler = ai_handler
        self.text = text
        self.widget_ref = widget_ref
        self.history = history
        self.mode = mode
        self.request_id = request_id or str(uuid.uuid4())
        self._cancelled = False
        self.insights = insights

    def cancel(self):
        """Cancel the request."""
        self._cancelled = True

    def run(self):
        try:
            context = self.widget_ref.current_card_context if self.widget_ref else None
            if context:
                logger.debug("🔍 AIRequestThread.run: context=has cardId=%s, question='%s'", context.get('cardId'), (context.get('frontField') or context.get('question') or '')[:60])
            else:
                logger.debug("🔍 AIRequestThread.run: context=None")

            # Load card-specific history from SQLite (moved here from main thread)
            card_history = self.history
            card_ctx = getattr(self, '_card_context_for_history', None)
            if card_ctx and card_ctx.get('cardId'):
                try:
                    try:
                        from ..storage.card_sessions import load_card_session
                    except ImportError:
                        from storage.card_sessions import load_card_session
                    card_id = card_ctx['cardId']
                    session_data = load_card_session(card_id)
                    db_messages = session_data.get('messages', [])
                    if db_messages:
                        recent = db_messages[-10:]
                        card_history = [
                            {'role': 'user' if m.get('sender') == 'user' else 'assistant',
                             'content': m.get('text', '')}
                            for m in recent if m.get('text')
                        ]
                        logger.debug("📋 AIThread: Card history loaded (%s msgs from card %s)", len(card_history), card_id)
                    else:
                        card_history = []
                except Exception as e:
                    logger.error("⚠️ AIThread: Failed to load card history: %s", e)

            # Give the AI handler a callback to emit pipeline events via Qt signal
            def pipeline_callback(step, status, data):
                if self._cancelled:
                    return
                self.pipeline_signal.emit(self.request_id, step, status, data or {})

            self.ai_handler._pipeline_signal_callback = pipeline_callback

            def stream_callback(chunk, done, is_function_call=False, steps=None, citations=None, step_labels=None):
                if self._cancelled:
                    return
                self.chunk_signal.emit(self.request_id, chunk or "", done, is_function_call)
                if done and (steps or citations or step_labels):
                    self.metadata_signal.emit(self.request_id, steps or [], citations or [], step_labels or [])

            bot_msg = self.ai_handler.get_response_with_rag(
                self.text, context=context, history=card_history,
                mode=self.mode, callback=stream_callback,
                insights=self.insights
            )

            if not self._cancelled:
                self.finished_signal.emit(self.request_id)
        except Exception as e:
            if not self._cancelled:
                logger.exception("AIRequestThread: Exception: %s", str(e))
                self.error_signal.emit(self.request_id, str(e))
        finally:
            self.ai_handler._pipeline_signal_callback = None


class SubagentThread(QThread):
    """Generic thread for any subagent — keeps UI responsive."""
    finished_signal = pyqtSignal(str, object)   # agent_name, result dict
    error_signal = pyqtSignal(str, str)         # agent_name, error message

    def __init__(self, agent_name, run_fn, text, **kwargs):
        super().__init__()
        self.agent_name = agent_name
        self.run_fn = run_fn
        self.text = text
        self.kwargs = kwargs

    def run(self):
        try:
            result = self.run_fn(situation=self.text, **self.kwargs)
            self.finished_signal.emit(self.agent_name, result)
        except Exception as e:
            logger.exception("SubagentThread[%s] error: %s", self.agent_name, e)
            self.error_signal.emit(self.agent_name, str(e))


class InsightExtractionThread(QThread):
    """Background thread for insight extraction."""
    finished_signal = pyqtSignal(int, str)  # card_id, insights_json
    error_signal = pyqtSignal(int, str)     # card_id, error_message

    def __init__(self, card_id, card_context, messages, existing_insights, performance_data, ai_handler):
        super().__init__()
        self.card_id = card_id
        self.card_context = card_context
        self.messages = messages
        self.existing_insights = existing_insights
        self.performance_data = performance_data
        self.ai_handler = ai_handler
        self._cancelled = False

    def cancel(self):
        self._cancelled = True

    def run(self):
        if self._cancelled:
            return
        try:
            from ..storage.insights import build_extraction_prompt, parse_extraction_response

            prompt = build_extraction_prompt(
                self.card_context, self.messages,
                self.existing_insights, self.performance_data
            )

            # Use non-streaming AI request — context=None to avoid doubling the card data
            # (card content is already embedded in the extraction prompt)
            logger.debug("🟢 InsightExtractionThread: Starting extraction for card %s, prompt length=%s", self.card_id, len(prompt))
            import threading
            result_container = [None, None]  # [response, error]

            def _call_api():
                try:
                    result_container[0] = self.ai_handler.get_response(
                        user_message=prompt,
                        context=None,
                        history=[],
                        mode='compact',
                    )
                except Exception as e:
                    result_container[1] = e

            api_thread = threading.Thread(target=_call_api, daemon=True)
            api_thread.start()
            api_thread.join(timeout=30)

            if api_thread.is_alive():
                logger.warning("InsightExtractionThread: API request timed out after 30s")
                self.error_signal.emit(self.card_id, "Timeout: Extraktion dauerte zu lange")
                return

            if result_container[1]:
                raise result_container[1]
            response = result_container[0]

            if self._cancelled:
                return

            logger.debug("🟢 InsightExtractionThread: Response received, length=%s", len(response) if response else 0)
            if response:
                logger.debug("🟢 InsightExtractionThread: Response text: %s", response[:200])
            if not response:
                self.error_signal.emit(self.card_id, "Empty response from AI")
                return

            result = parse_extraction_response(response)

            if result is None:
                logger.debug("🟡 InsightExtractionThread: Parse failed, retrying...")
                # Retry once with timeout
                result_container2 = [None, None]

                def _retry_api():
                    try:
                        result_container2[0] = self.ai_handler.get_response(
                            user_message=prompt,
                            context=None,
                            history=[],
                            mode='compact',
                        )
                    except Exception as e:
                        result_container2[1] = e

                retry_thread = threading.Thread(target=_retry_api, daemon=True)
                retry_thread.start()
                retry_thread.join(timeout=30)

                if retry_thread.is_alive() or self._cancelled:
                    self.error_signal.emit(self.card_id, "Retry timed out")
                    return
                if result_container2[1]:
                    raise result_container2[1]
                response = result_container2[0]
                if response:
                    logger.debug("🟡 InsightExtractionThread: Retry response: %s", response[:200])
                result = parse_extraction_response(response) if response else None

            if result is None:
                self.error_signal.emit(self.card_id, "Failed to parse extraction response after retry")
                return

            # Compute new_indices before saving
            from ..storage.insights import compute_new_indices, insight_hash
            from ..storage.card_sessions import load_insights, save_insights

            # Load existing seen_hashes
            existing = load_insights(self.card_id)
            seen_hashes = existing.get('seen_hashes', [])

            new_indices = compute_new_indices(result.get('insights', []), seen_hashes)

            # Preserve seen_hashes in saved data
            result['seen_hashes'] = seen_hashes

            save_insights(self.card_id, result)

            # Embed new_indices in the emitted JSON (not persisted, just for frontend)
            emit_data = dict(result)
            emit_data.pop('seen_hashes', None)  # Don't send to frontend
            emit_data['new_indices'] = new_indices
            self.finished_signal.emit(self.card_id, json.dumps(emit_data, ensure_ascii=False))

        except Exception as e:
            if not self._cancelled:
                self.error_signal.emit(self.card_id, str(e))


class ChatbotWidget(QWidget):
    """Web-basierte Chat-UI über QWebEngineView"""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.config = get_config()
        self.web_view = None
        self.current_request = None  # Für Cancel-Funktionalität
        self.message_timer = None  # Timer für Message-Polling
        self.bridge = WebBridge(self)  # Bridge-Instanz für Deck-Zugriff
        self.card_tracker = None  # Card-Tracker wird später initialisiert
        self.current_card_context = None  # Aktueller Karten-Kontext
        self._active_subagent_thread = None
        self.setup_ui()
        # Card-Tracking wird nach UI-Setup initialisiert
        if self.web_view:
            self.card_tracker = CardTracker(self)

        # Plusi autonomous wake timer — checks every minute
        self._plusi_wake_timer = QTimer()
        self._plusi_wake_timer.timeout.connect(self._check_plusi_wake)
        self._plusi_wake_timer.start(60000)  # check every minute
    def setup_ui(self):
        layout = QVBoxLayout()
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        if QWebEngineView is None:
            fallback = QLabel("QWebEngineView nicht verfügbar. Bitte installieren Sie QtWebEngine.")
            layout.addWidget(fallback)
            self.setLayout(layout)
            return

        self.web_view = QWebEngineView()
        self.web_view.setContextMenuPolicy(Qt.ContextMenuPolicy.NoContextMenu)

        html_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "web", "index.html")
        import time
        url = QUrl.fromLocalFile(html_path)
        url.setQuery(f"v={int(time.time())}")
        self.web_view.loadFinished.connect(self._init_js_bridge)
        self.web_view.loadFinished.connect(self.push_initial_state)
        self.web_view.load(url)

        layout.addWidget(self.web_view)
        self.setLayout(layout)
    
    def _init_js_bridge(self):
        """Initialisiert die JavaScript-Bridge mit Message-Queue System"""
        # Erstelle globales JavaScript-Objekt für Message-Queue
        js_code = """
        window.ankiBridge = {
            messageQueue: [],
            addMessage: function(type, data) {
                this.messageQueue.push({type: type, data: data, timestamp: Date.now()});
            },
            getMessages: function() {
                const messages = this.messageQueue.slice();
                this.messageQueue = [];
                return messages;
            }
        };
        console.log('ankiBridge initialisiert (Message-Queue System)');
        """
        self.web_view.page().runJavaScript(js_code)
        logger.info("JavaScript Bridge initialisiert (Message-Queue System)")
        
        # Starte Polling für Nachrichten
        self.message_timer = QTimer()
        self.message_timer.timeout.connect(self._poll_messages)
        self.message_timer.start(200)  # Alle 200ms prüfen
        logger.info("Message-Polling gestartet (200ms Intervall)")

    def _poll_messages(self):
        """Pollt JavaScript nach neuen Nachrichten"""
        js_code = """
        (function() {
            if (window.ankiBridge && window.ankiBridge.getMessages) {
                return JSON.stringify(window.ankiBridge.getMessages());
            }
            return '[]';
        })();
        """
        
        def handle_messages(result):
            try:
                messages = json.loads(result) if result else []
                for msg in messages:
                    self._handle_js_message(msg.get('type'), msg.get('data'))
            except Exception as e:
                logger.exception("Fehler beim Verarbeiten von Nachrichten: %s", e)
        
        self.web_view.page().runJavaScript(js_code, handle_messages)

    def _check_plusi_wake(self):
        """Check if Plusi should wake up for autonomous action."""
        try:
            from ..plusi.storage import get_memory
            is_sleeping = get_memory('state', 'is_sleeping', False)
            next_wake = get_memory('state', 'next_wake', None)

            if not is_sleeping or not next_wake:
                return

            from datetime import datetime
            wake_time = datetime.fromisoformat(next_wake)
            if datetime.now() >= wake_time:
                logger.info("plusi wake timer: triggering autonomous chain")
                from ..plusi.agent import run_autonomous_chain
                import threading
                t = threading.Thread(target=run_autonomous_chain, daemon=True)
                t.start()
        except Exception as e:
            logger.exception("plusi wake timer error: %s", e)

    def _send_to_frontend(self, payload_type, data, extra=None):
        """Helper: Sendet Payload an das React-Frontend via ankiReceive."""
        payload = {"type": payload_type, "data": data}
        if extra:
            payload.update(extra)
        self.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")

    def _send_to_frontend_with_event(self, payload_type, payload_dict, event_name):
        """Helper: Sendet via ankiReceive UND CustomEvent (für Reliability)."""
        payload_json = json.dumps(payload_dict, ensure_ascii=False)
        js = f"""(function() {{
            var p = {payload_json};
            if (typeof window.ankiReceive === 'function') window.ankiReceive(p);
            window.dispatchEvent(new CustomEvent('{event_name}', {{detail: p}}));
        }})();"""
        self.web_view.page().runJavaScript(js)

    def _handle_js_message(self, msg_type, data):
        """Verarbeitet Nachrichten von JavaScript — dispatcht an Handler-Methoden."""
        handler = self._get_message_handler(msg_type)
        if handler:
            try:
                handler(data)
            except Exception as e:
                logger.exception("_handle_js_message: Fehler bei %s: %s", msg_type, e)
        else:
            logger.debug("_handle_js_message: Unbekannter Typ: %s", msg_type)

    def _get_message_handler(self, msg_type):
        """Gibt den Handler für einen Message-Typ zurück."""
        handlers = {
            # AI & Chat
            'sendMessage': self._msg_send_message,
            'cancelRequest': self._msg_cancel_request,
            'extractInsights': self._msg_extract_insights,
            'fetchModels': self._msg_fetch_models,
            # Panel & Navigation
            'closePanel': self._msg_close_panel,
            'advanceCard': self._msg_advance_card,
            'openSettings': lambda d: None,
            'setModel': lambda d: self.set_model_from_ui(d) if isinstance(d, str) else None,
            # Card Operations
            'previewCard': self._msg_preview_card,
            'openPreview': self._msg_open_preview,
            'goToCard': lambda d: self._go_to_card(int(d)) if d else None,
            'showAnswer': lambda d: self.bridge.showAnswer(),
            'hideAnswer': lambda d: self.bridge.hideAnswer(),
            'navigateToCard': self._msg_navigate_to_card,
            'getCardDetails': self._msg_get_card_details,
            # Multiple Choice
            'saveMultipleChoice': self._msg_save_multiple_choice,
            'loadMultipleChoice': self._msg_load_multiple_choice,
            'hasMultipleChoice': self._msg_has_multiple_choice,
            # Deck Operations
            'getCurrentDeck': lambda d: self._send_to_frontend("currentDeck", json.loads(self.bridge.getCurrentDeck())),
            'getAvailableDecks': lambda d: self._send_to_frontend("availableDecks", json.loads(self.bridge.getAvailableDecks())),
            'openDeck': lambda d: self.bridge.openDeck(int(d)) if isinstance(d, (int, float)) else None,
            'openDeckBrowser': lambda d: self.bridge.openDeckBrowser(),
            'getDeckStats': self._msg_get_deck_stats,
            'generateSectionTitle': self._msg_generate_section_title,
            # Card Sessions (SQLite)
            'loadCardSession': self._msg_load_card_session,
            'saveCardSession': self._msg_save_card_session,
            'saveCardMessage': self._msg_save_card_message,
            'saveCardSection': self._msg_save_card_section,
            'getCardInsights': self._msg_get_card_insights,
            'saveCardInsights': self._msg_save_card_insights,
            'getCardRevlog': self._msg_get_card_revlog,
            'markInsightsSeen': self._msg_mark_insights_seen,
            'loadDeckMessages': self._msg_load_deck_messages,
            'saveDeckMessage': self._msg_save_deck_message,
            # Config & Settings
            'saveSettings': self._msg_save_settings,
            'getCurrentConfig': self._msg_get_current_config,
            'getAITools': self._msg_get_ai_tools,
            'saveAITools': self._msg_save_ai_tools,
            'saveMascotEnabled': self._msg_save_mascot_enabled,
            'saveSubagentEnabled': self._msg_save_subagent_enabled,
            'getEmbeddingStatus': self._msg_get_embedding_status,
            'getPlusiMenuData': self._msg_get_plusi_menu_data,
            'savePlusiAutonomy': self._msg_save_plusi_autonomy,
            'saveTheme': self._msg_save_theme,
            'getTheme': self._msg_get_theme,
            # Auth
            'authenticate': self._msg_authenticate,
            'getAuthStatus': lambda d: self._send_to_frontend("authStatusLoaded", json.loads(self.bridge.getAuthStatus())),
            'getAuthToken': lambda d: self._send_to_frontend("authTokenLoaded", json.loads(self.bridge.getAuthToken())),
            'refreshAuth': lambda d: self._send_to_frontend("authRefreshResult", json.loads(self.bridge.refreshAuth())),
            'logout': lambda d: self.bridge.logout(),
            'startLinkAuth': lambda d: self.bridge.startLinkAuth(),
            'handleAuthDeepLink': self._msg_handle_auth_deep_link,
            # Media
            'fetchImage': self._msg_fetch_image,
            # Utilities
            'openUrl': lambda d: self.bridge.openUrl(d.get('url', '') if isinstance(d, dict) else d),
            'debugLog': self._msg_debug_log,
            'plusiPanel': self._msg_plusi_settings,
            'plusiSettings': self._msg_plusi_settings,
            'subagentDirect': self._msg_subagent_direct,
            'plusiLike': self._msg_plusi_like,
            'resetPlusi': self._msg_reset_plusi,
            'textFieldFocus': self._msg_text_field_focus,
            'jsError': self._msg_js_error,
        }
        return handlers.get(msg_type)

    # --- Message Handler Methods ---

    def _msg_send_message(self, data):
        if isinstance(data, str):
            self.current_request = data
            self.handle_message_from_ui(data, history=None, mode='compact')
        elif isinstance(data, dict):
            message = data.get('message', '')
            self.current_request = message
            self.handle_message_from_ui(
                message, history=data.get('history'), mode=data.get('mode', 'compact'),
                request_id=data.get('requestId'))

    def _msg_cancel_request(self, data):
        if not self.current_request:
            return
        self.current_request = None
        if hasattr(self, '_ai_thread') and self._ai_thread:
            if hasattr(self._ai_thread, 'cancel'):
                self._ai_thread.cancel()
            self._ai_thread.quit()
            self._ai_thread.wait(1000)
            self._ai_thread = None
        self._send_to_frontend("bot", None, {"message": "Anfrage abgebrochen.", "type": "bot"})

    def _msg_close_panel(self, data):
        self.close_panel()
        try:
            from aqt import mw
            if mw and mw.reviewer and mw.reviewer.web:
                mw.reviewer.web.eval('if(window.setChatOpen) setChatOpen(false);')
        except Exception:
            pass

    def _msg_advance_card(self, data):
        self.close_panel()
        try:
            from aqt import mw
            if mw and mw.reviewer and mw.reviewer.web:
                mw.reviewer.web.eval(
                    'if(window.setChatOpen) setChatOpen(false);'
                    'if(window.rateCard) rateCard(window.autoRateEase || 3);')
        except Exception as e:
            logger.error("advanceCard error: %s", e)

    def _msg_preview_card(self, data):
        if data and self.bridge and hasattr(self.bridge, 'previewCard'):
            self.bridge.previewCard(str(data))

    def _msg_open_preview(self, data):
        card_id = data.get('cardId') if isinstance(data, dict) else data
        try:
            card_id = int(card_id)
        except (ValueError, TypeError):
            logger.warning("_msg_open_preview: Ungültige card_id: %s", card_id)
            return
        from ..custom_reviewer import open_preview
        open_preview(card_id)

    def _msg_navigate_to_card(self, data):
        if isinstance(data, str) and data in ('prev', 'next'):
            if mw and mw.reviewer and hasattr(mw.reviewer, 'web'):
                mw.reviewer.web.eval(f"pycmd('navigate:{data}');")
        else:
            card_id = int(data) if isinstance(data, (int, str)) else data.get('cardId', 0)
            if card_id and mw and mw.reviewer:
                mw.reviewer.web.eval(f"pycmd('navigate:{card_id}');")

    def _msg_get_card_details(self, data):
        if isinstance(data, dict) and data.get('cardId'):
            result = self.bridge.getCardDetails(str(data['cardId']))
            self._send_to_frontend("cardDetails", json.loads(result), {"callbackId": data.get('callbackId')})

    def _msg_save_multiple_choice(self, data):
        if isinstance(data, dict) and data.get('cardId') and data.get('quizDataJson'):
            result = self.bridge.saveMultipleChoice(int(data['cardId']), data['quizDataJson'])
            self._send_to_frontend("saveMultipleChoiceResult", json.loads(result), {"callbackId": data.get('callbackId')})

    def _msg_load_multiple_choice(self, data):
        if isinstance(data, dict) and data.get('cardId'):
            result = self.bridge.loadMultipleChoice(int(data['cardId']))
            self._send_to_frontend("loadMultipleChoiceResult", json.loads(result), {"callbackId": data.get('callbackId')})

    def _msg_has_multiple_choice(self, data):
        if isinstance(data, dict) and data.get('cardId'):
            result = self.bridge.hasMultipleChoice(int(data['cardId']))
            self._send_to_frontend("hasMultipleChoiceResult", json.loads(result), {"callbackId": data.get('callbackId')})

    def _msg_get_deck_stats(self, data):
        if isinstance(data, (int, float)):
            deck_id = int(data)
            result = self.bridge.getDeckStats(deck_id)
            self._send_to_frontend("deckStats", json.loads(result), {"deckId": deck_id})

    def _msg_generate_section_title(self, data):
        if isinstance(data, dict):
            result = self.bridge.generateSectionTitle(data.get('question', ''), data.get('answer', ''))
            self._send_to_frontend("sectionTitleGenerated", json.loads(result))

    def _msg_load_card_session(self, data):
        from ..storage.card_sessions import load_card_session
        card_id = int(data) if isinstance(data, (int, str)) else data.get('cardId', 0)
        result = load_card_session(card_id)
        payload = {"type": "cardSessionLoaded", "cardId": card_id, "data": result}
        self._send_to_frontend_with_event("cardSessionLoaded", payload, "ankiCardSessionLoaded")

    def _msg_save_card_session(self, data):
        from ..storage.card_sessions import save_card_session
        if isinstance(data, str):
            data = json.loads(data)
        card_id = data.get('cardId') or data.get('card_id')
        if card_id:
            save_card_session(int(card_id), data)

    def _msg_save_card_message(self, data):
        from ..storage.card_sessions import save_message
        if isinstance(data, str):
            data = json.loads(data)
        card_id = data.get('cardId') or data.get('card_id')
        if card_id:
            save_message(int(card_id), data.get('message', data))

    def _msg_save_card_section(self, data):
        from ..storage.card_sessions import save_section
        if isinstance(data, str):
            data = json.loads(data)
        card_id = data.get('cardId') or data.get('card_id')
        if card_id:
            save_section(int(card_id), data.get('section', data))

    def _msg_get_card_insights(self, data):
        from ..storage.card_sessions import load_insights
        card_id = int(data) if isinstance(data, (int, str)) else data.get('cardId', 0)
        result = load_insights(card_id)
        payload = {"type": "cardInsightsLoaded", "cardId": card_id, "success": True, "data": result}
        self._send_to_frontend_with_event("cardInsightsLoaded", payload, "ankiCardInsightsLoaded")

    def _msg_save_card_insights(self, data):
        from ..storage.card_sessions import save_insights
        card_id = data.get('cardId')
        insights_data = data.get('insights')
        if card_id and insights_data:
            save_insights(int(card_id), insights_data)

    def _msg_get_card_revlog(self, data):
        from ..storage.card_sessions import get_card_revlog
        card_id = int(data) if isinstance(data, (int, str)) else data.get('cardId', 0)
        result = get_card_revlog(card_id)
        payload = {"type": "cardRevlogLoaded", "cardId": card_id, "success": True, "data": result}
        self._send_to_frontend_with_event("cardRevlogLoaded", payload, "ankiCardRevlogLoaded")

    def _msg_extract_insights(self, data):
        card_id = data.get('cardId')
        card_context = data.get('cardContext', {})
        messages = data.get('messages', [])
        existing_insights = data.get('existingInsights', {"version": 1, "insights": []})
        performance_data = data.get('performanceData')

        if hasattr(self, '_extraction_thread') and self._extraction_thread and self._extraction_thread.isRunning():
            if self._extraction_thread.card_id == card_id:
                self._extraction_thread.cancel()
                self._extraction_thread.wait(1000)

        def _on_done(cid, result_json):
            payload = {"type": "insightExtractionComplete", "cardId": cid, "success": True, "insights": json.loads(result_json)}
            self._send_to_frontend_with_event("insightExtractionComplete", payload, "ankiInsightExtractionComplete")

        def _on_error(cid, err):
            payload = {"type": "insightExtractionComplete", "cardId": cid, "success": False, "error": err}
            self._send_to_frontend_with_event("insightExtractionComplete", payload, "ankiInsightExtractionComplete")

        try:
            from ..ai.handler import get_ai_handler
        except ImportError:
            from ai.handler import get_ai_handler

        self._extraction_thread = InsightExtractionThread(
            card_id, card_context, messages, existing_insights, performance_data, get_ai_handler())
        self._extraction_thread.finished_signal.connect(_on_done)
        self._extraction_thread.error_signal.connect(_on_error)
        self._extraction_thread.start()

    def _msg_mark_insights_seen(self, data):
        """Mark all current insights as seen (update seen_hashes)."""
        from ..storage.card_sessions import load_insights, save_insights
        from ..storage.insights import insight_hash
        card_id = data.get('cardId') if isinstance(data, dict) else int(data)
        if not card_id:
            return
        current = load_insights(int(card_id))
        hashes = [insight_hash(ins.get('text', '')) for ins in current.get('insights', [])]
        current['seen_hashes'] = hashes
        save_insights(int(card_id), current)

    def _msg_load_deck_messages(self, data):
        deck_id = data if isinstance(data, (int, str)) else data.get('deckId')
        try:
            deck_id = int(deck_id)
        except (ValueError, TypeError):
            logger.warning("_msg_load_deck_messages: Ungültige deckId: %s", deck_id)
            return
        try:
            from ..storage.card_sessions import load_deck_messages
        except ImportError:
            from storage.card_sessions import load_deck_messages
        messages = load_deck_messages(deck_id, limit=50)
        self._send_to_frontend("deckMessagesLoaded", None, {"type": "deckMessagesLoaded", "deckId": deck_id, "messages": messages})

    def _msg_save_deck_message(self, data):
        msg_data = json.loads(data) if isinstance(data, str) else data
        deck_id = msg_data.get('deckId')
        if deck_id is None:
            logger.warning("_msg_save_deck_message: Missing deckId")
            return
        try:
            deck_id = int(deck_id)
        except (ValueError, TypeError):
            logger.warning("_msg_save_deck_message: Ungültige deckId: %s", deck_id)
            return
        try:
            from ..storage.card_sessions import save_deck_message
        except ImportError:
            from storage.card_sessions import save_deck_message
        save_deck_message(deck_id, msg_data.get('message', {}))

    def _msg_save_settings(self, data):
        if isinstance(data, dict):
            self._save_settings(data.get('api_key', ''), data.get('provider', 'google'), data.get('model_name', ''))

    def _msg_get_current_config(self, data):
        config = get_config(force_reload=True)
        try:
            from .theme import get_resolved_theme
        except ImportError:
            from ui.theme import get_resolved_theme
        config_data = {
            "api_key": config.get("api_key", "").strip(),
            "provider": "google",
            "model": config.get("model_name", ""),
            "mascot_enabled": config.get("mascot_enabled", False),
            "ai_tools": config.get("ai_tools", {
                "images": True, "diagrams": True, "card_search": True,
                "statistics": True, "molecules": False, "compact": True,
            }),
            "theme": config.get("theme", "dark"),
            "resolvedTheme": get_resolved_theme(),
        }
        self._send_to_frontend_with_event(
            "configLoaded", {"type": "configLoaded", "data": config_data},
            "ankiConfigLoaded")

        # Also push subagent registry (frontend is guaranteed ready at this point)
        try:
            try:
                from ..ai.subagents import get_registry_for_frontend
            except ImportError:
                from ai.subagents import get_registry_for_frontend
            registry_payload = {
                'type': 'subagent_registry',
                'agents': get_registry_for_frontend(config)
            }
            self.web_view.page().runJavaScript(
                f"window.ankiReceive({json.dumps(registry_payload)});"
            )
        except Exception as e:
            logger.error("Failed to push subagent registry on config: %s", e)

    def _msg_fetch_models(self, data):
        if not isinstance(data, dict):
            return
        provider = data.get('provider', 'google')
        api_key = data.get('api_key', '').strip()
        try:
            from ..ai.handler import get_ai_handler
        except ImportError:
            from ai.handler import get_ai_handler
        try:
            models = get_ai_handler().fetch_available_models(provider, api_key)
            self._send_to_frontend("modelsLoaded", {
                "success": True, "models": models or [],
                "error": None if models else "Keine Modelle gefunden. Bitte API-Key prüfen."})
        except Exception as e:
            self._send_to_frontend("modelsLoaded", {"success": False, "models": [], "error": str(e)})

    def _msg_get_ai_tools(self, data):
        tools = json.loads(self.bridge.getAITools())
        self._send_to_frontend_with_event(
            "aiToolsLoaded", {"type": "aiToolsLoaded", "data": tools},
            "ankiAiToolsLoaded")
        self.web_view.page().runJavaScript(f"window._cachedAITools = {json.dumps(tools)};")

    def _msg_save_ai_tools(self, data):
        if isinstance(data, str):
            self.bridge.saveAITools(data)
            try:
                tools = json.loads(data)
                self.web_view.page().runJavaScript(f"window._cachedAITools = {json.dumps(tools)};")
            except json.JSONDecodeError:
                pass

    def _msg_save_mascot_enabled(self, data):
        enabled = bool(data)
        update_config(mascot_enabled=enabled)
        self.config = get_config(force_reload=True)
        self._send_to_frontend("mascotEnabledSaved", {"enabled": enabled})
        # Dynamically hide/show the native Plusi dock in reviewer/deckBrowser webviews
        try:
            try:
                from ..plusi.dock import hide_dock, get_plusi_dock_injection, _get_active_webview
            except ImportError:
                from plusi.dock import hide_dock, get_plusi_dock_injection, _get_active_webview
            if not enabled:
                hide_dock()
            else:
                # Re-inject dock into active webview when Plusi is turned back on
                web = _get_active_webview()
                if web:
                    injection = get_plusi_dock_injection()
                    if injection:
                        # Check if dock already exists before injecting
                        js = (
                            "if(!document.getElementById('plusi-dock')){"
                            "var _r=document.createRange();"
                            "var _f=_r.createContextualFragment(%s);"
                            "document.body.appendChild(_f);}"
                        ) % json.dumps(injection)
                        web.page().runJavaScript(js)
        except Exception as e:
            logger.warning("Failed to toggle Plusi dock: %s", e)

    def _msg_save_subagent_enabled(self, data):
        """Toggle any subagent on/off by its enabled_key."""
        try:
            name = data.get('name', '') if isinstance(data, dict) else ''
            enabled = bool(data.get('enabled', False)) if isinstance(data, dict) else False
            # Map subagent name to its config enabled_key
            try:
                from ..ai.subagents import SUBAGENT_REGISTRY
            except ImportError:
                from ai.subagents import SUBAGENT_REGISTRY
            agent = SUBAGENT_REGISTRY.get(name)
            if agent:
                update_config(**{agent.enabled_key: enabled})
                self.config = get_config(force_reload=True)
                logger.info("Subagent %s %s", name, "enabled" if enabled else "disabled")
            else:
                logger.warning("Unknown subagent: %s", name)
        except Exception as e:
            logger.exception("saveSubagentEnabled error: %s", e)

    def _msg_get_embedding_status(self, data):
        """Return embedding indexing progress to frontend."""
        try:
            try:
                from ..storage.card_sessions import count_embeddings
            except ImportError:
                from storage.card_sessions import count_embeddings

            embedded = count_embeddings()

            total = 0
            try:
                from aqt import mw as _mw
                if _mw and _mw.col:
                    total = len(_mw.col.find_cards(""))
            except Exception:
                pass

            is_running = False
            try:
                try:
                    from .. import get_embedding_manager
                except ImportError:
                    from __init__ import get_embedding_manager
                mgr = get_embedding_manager()
                if mgr and mgr._background_thread and mgr._background_thread.isRunning():
                    is_running = True
            except Exception:
                pass

            result = {"totalCards": total, "embeddedCards": embedded, "isRunning": is_running}
            self._send_to_frontend_with_event(
                "embeddingStatusLoaded", {"type": "embeddingStatusLoaded", "data": result},
                "ankiEmbeddingStatusLoaded")
        except Exception as e:
            logger.exception("_msg_get_embedding_status error: %s", e)
            result = {"totalCards": 0, "embeddedCards": 0, "isRunning": False}
            self._send_to_frontend_with_event(
                "embeddingStatusLoaded", {"type": "embeddingStatusLoaded", "data": result},
                "ankiEmbeddingStatusLoaded")

    def _msg_get_plusi_menu_data(self, data=None):
        """Return all data needed for the Plusi Menu view."""
        try:
            try:
                from ..plusi.storage import (
                    compute_personality_position, get_memory,
                    get_friendship_data, load_diary, get_category
                )
                from ..config import get_config
            except ImportError:
                from plusi.storage import (
                    compute_personality_position, get_memory,
                    get_friendship_data, load_diary, get_category
                )
                from config import get_config

            # Personality
            position = compute_personality_position()
            trail = get_memory('personality', 'trail', default=[])

            # Current state — mood from most recent diary entry
            state_data = get_category('state')
            last_mood = 'neutral'
            try:
                diary_entries = load_diary(limit=1)
                if diary_entries:
                    last_mood = diary_entries[0].get('mood', 'neutral')
            except Exception:
                pass

            state = {
                'energy': state_data.get('energy', 5),
                'mood': last_mood,
                'obsession': state_data.get('obsession', None),
            }

            # Friendship
            friendship = get_friendship_data()

            # Diary (full list)
            diary = load_diary(limit=50)

            # Autonomy config
            config = get_config()
            autonomy = config.get('plusi_autonomy', {})

            result = {
                'personality': {
                    'position': {'x': position['x'], 'y': position['y']},
                    'quadrant': position['quadrant'],
                    'quadrant_label': position['quadrant_label'],
                    'confident': position['confident'],
                    'trail': trail,
                },
                'state': state,
                'friendship': friendship,
                'diary': diary,
                'autonomy': autonomy,
            }

            self._send_to_frontend_with_event(
                'plusiMenuData', result, 'ankiPlusiMenuDataLoaded'
            )
        except Exception:
            logger.exception("Failed to load Plusi menu data")
            self._send_to_frontend_with_event(
                'plusiMenuData', {}, 'ankiPlusiMenuDataLoaded'
            )

    def _msg_save_plusi_autonomy(self, data):
        """Save Plusi autonomy config (token budget, capabilities)."""
        try:
            try:
                from ..config import update_config
            except ImportError:
                from config import update_config
            if isinstance(data, dict):
                update_config(plusi_autonomy=data)
        except Exception:
            logger.exception("Failed to save Plusi autonomy config")

    def _msg_save_theme(self, data):
        """Save theme setting and push it back to all web views."""
        if isinstance(data, dict):
            theme = data.get("theme", data.get("value", str(data)))
        else:
            theme = str(data) if data else "dark"
        theme = theme.strip().lower()
        if theme not in ("dark", "light", "system"):
            logger.warning("Invalid theme value: %s, falling back to dark", theme)
            theme = "dark"
        logger.info("Saving theme: %s", theme)
        update_config(theme=theme)
        self.config = get_config(force_reload=True)
        self._apply_theme_to_webview()

    def _msg_get_theme(self, data):
        """Return current (resolved) theme to the frontend."""
        try:
            from .theme import get_resolved_theme
        except ImportError:
            from ui.theme import get_resolved_theme
        resolved = get_resolved_theme()
        config = get_config(force_reload=True)
        stored = config.get("theme", "dark")
        self._send_to_frontend("themeLoaded", {"theme": stored, "resolvedTheme": resolved})

    def _apply_theme_to_webview(self):
        """Push the current theme to ALL active webviews and refresh Qt stylesheet."""
        try:
            from .theme import get_resolved_theme
        except ImportError:
            from ui.theme import get_resolved_theme
        config = get_config(force_reload=True)
        stored_theme = config.get("theme", "dark")
        resolved = get_resolved_theme()

        # JS to set data-theme attribute on any webview + force CSS repaint
        set_theme_js = f"""(function() {{
            document.documentElement.setAttribute('data-theme', '{resolved}');
            document.documentElement.style.colorScheme = '{resolved}';
            document.body && (document.body.style.transition = 'none');
            void document.body?.offsetHeight;
        }})();"""

        # JS for the chat panel (also notifies React)
        chat_js = f"""
        (function() {{
            document.documentElement.setAttribute('data-theme', '{resolved}');
            if (typeof window.ankiReceive === 'function') {{
                window.ankiReceive({{
                    type: 'themeChanged',
                    data: {{ theme: '{stored_theme}', resolvedTheme: '{resolved}' }}
                }});
            }}
        }})();
        """

        # 1. Chat panel webview
        if self.web_view:
            self.web_view.page().runJavaScript(chat_js)

        # 2-4. Push theme to all Anki webviews (reviewer, deck browser, overview)
        # NOTE: AnkiWebView.eval() is Anki's built-in JS execution method (not Python eval).
        try:
            from aqt import mw as _mw
            if _mw:
                for wv_source in [
                    lambda: _mw.reviewer.web if _mw.reviewer else None,
                    lambda: _mw.deckBrowser.web if hasattr(_mw, 'deckBrowser') and _mw.deckBrowser else None,
                    lambda: _mw.overview.web if hasattr(_mw, 'overview') and _mw.overview else None,
                ]:
                    try:
                        wv = wv_source()
                        if wv:
                            wv.page().runJavaScript(set_theme_js)
                    except Exception:
                        pass
        except Exception:
            pass

        # 5. Plusi panel webview
        try:
            from ..plusi import panel as plusi_panel
            if hasattr(plusi_panel, '_panel_widget') and plusi_panel._panel_widget:
                pw = plusi_panel._panel_widget
                if hasattr(pw, 'web_view') and pw.web_view:
                    pw.web_view.page().runJavaScript(set_theme_js)
        except Exception:
            pass

        # 6. Re-apply Qt global theme stylesheet with new token colors
        try:
            from .global_theme import apply_global_dark_theme, _app_initialized
            if _app_initialized:
                apply_global_dark_theme()
        except Exception:
            pass

        # 7. Re-apply QDockWidget stylesheet for sidebar
        try:
            from .setup import _chatbot_dock, get_dock_widget_style
            if _chatbot_dock:
                _chatbot_dock.setStyleSheet(get_dock_widget_style())
        except Exception:
            pass

    def _msg_authenticate(self, data):
        if isinstance(data, dict):
            result = self.bridge.authenticate(data.get('token', ''), data.get('refreshToken', ''))
            if json.loads(result).get('success'):
                self._send_to_frontend("auth_success", None, {"type": "auth_success", "message": "Authentifizierung erfolgreich"})

    def _msg_handle_auth_deep_link(self, data):
        if isinstance(data, str):
            result = self.bridge.handleAuthDeepLink(data)
            if json.loads(result).get('success'):
                self._send_to_frontend("auth_success", None, {"type": "auth_success", "message": "Authentifizierung erfolgreich"})

    def _msg_fetch_image(self, data):
        if isinstance(data, str):
            result = self.bridge.fetchImage(data)
            payload = {"type": "imageLoaded", "url": data, "data": json.loads(result)}
            self.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")

    def _msg_debug_log(self, data):
        import os
        log_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.cursor', 'debug.log')
        try:
            os.makedirs(os.path.dirname(log_path), exist_ok=True)
            with open(log_path, 'a', encoding='utf-8') as f:
                f.write(data + '\n')
        except Exception:
            pass

    def _msg_plusi_panel(self, data):
        """Legacy: redirects to settings."""
        self._msg_plusi_settings(data)

    def _msg_plusi_settings(self, data):
        try:
            from aqt import mw
            if mw:
                mw.onPrefs()
        except Exception as e:
            logger.warning("Could not open Anki preferences: %s", e)

    def _msg_plusi_like(self, data):
        """Handle like on Plusi message."""
        try:
            try:
                from ..plusi.storage import record_resonance_like
            except ImportError:
                from plusi.storage import record_resonance_like
            record_resonance_like()
            logger.info("plusi like recorded from UI")
        except Exception as e:
            logger.exception("plusi like error: %s", e)

    def _msg_reset_plusi(self, data):
        """Reset Plusi — clear all memories, diary, and history."""
        try:
            try:
                from ..plusi.storage import _get_db
            except ImportError:
                from plusi.storage import _get_db
            db = _get_db()
            db.execute("DELETE FROM plusi_memory")
            db.execute("DELETE FROM plusi_diary")
            db.execute("DELETE FROM plusi_history")
            db.commit()
            logger.info("plusi RESET: all memories, diary, and history cleared")
        except Exception as e:
            logger.exception("plusi reset error: %s", e)

    def _msg_subagent_direct(self, data):
        """Handle @Name subagent direct call from frontend."""
        msg_data = data if isinstance(data, dict) else json.loads(data) if isinstance(data, str) else {}
        agent_name = msg_data.get('agent_name', '')
        text = msg_data.get('text', '')
        extra = {k: v for k, v in msg_data.items() if k not in ('agent_name', 'text')}
        if agent_name and text:
            self._handle_subagent_direct(agent_name, text, extra)

    def _handle_subagent_direct(self, agent_name, text, extra=None):
        """Route @Name messages to the appropriate subagent in a background thread."""
        try:
            from ..ai.subagents import SUBAGENT_REGISTRY, lazy_load_run_fn
        except ImportError:
            from ai.subagents import SUBAGENT_REGISTRY, lazy_load_run_fn
        agent = SUBAGENT_REGISTRY.get(agent_name)
        if not agent:
            logger.warning("Unknown subagent: %s", agent_name)
            return
        if not self.config.get(agent.enabled_key, False):
            logger.info("Subagent %s is disabled", agent_name)
            return
        run_fn = lazy_load_run_fn(agent)
        kwargs = {**agent.extra_kwargs, **(extra or {})}
        thread = SubagentThread(agent_name, run_fn, text, **kwargs)
        thread.finished_signal.connect(self._on_subagent_finished)
        thread.error_signal.connect(self._on_subagent_error)
        self._active_subagent_thread = thread
        thread.start()

    def _on_subagent_finished(self, agent_name, result):
        """Handle subagent result on main thread — emit to JS + run agent-specific side effects."""
        try:
            payload = {
                'type': 'subagent_result',
                'agent_name': agent_name,
                'result': result,  # Pass full result dict — agent-specific
                # Legacy Plusi fields for backwards compatibility
                'text': result.get('text', ''),
                'mood': result.get('mood', 'neutral'),
                'meta': result.get('meta', ''),
                'friendship': result.get('friendship', {}),
                'silent': result.get('silent', False),
                'error': result.get('error', False),
            }
            self.web_view.page().runJavaScript(
                f"window.ankiReceive({json.dumps(payload)});"
            )
            # Run agent-specific post-processing (mood sync, panel notify, etc.)
            try:
                from ..ai.subagents import SUBAGENT_REGISTRY
            except ImportError:
                from ai.subagents import SUBAGENT_REGISTRY
            agent = SUBAGENT_REGISTRY.get(agent_name)
            if agent and agent.on_finished:
                try:
                    agent.on_finished(self, agent_name, result)
                except Exception as e:
                    logger.error("Subagent[%s] on_finished error: %s", agent_name, e)
        except Exception as e:
            logger.error("Subagent[%s] finished handler error: %s", agent_name, e)

    def _on_subagent_error(self, agent_name, error_msg):
        """Handle subagent error on main thread."""
        logger.error("Subagent[%s] error: %s", agent_name, error_msg)
        payload = {
            'type': 'subagent_result',
            'agent_name': agent_name,
            'text': '',
            'error': True,
        }
        self.web_view.page().runJavaScript(
            f"window.ankiReceive({json.dumps(payload)});"
        )

    def _sync_plusi_integrity(self):
        """Sync integrity glow and sleep state to dock."""
        try:
            try:
                from ..plusi.storage import compute_integrity, get_memory
            except ImportError:
                from plusi.storage import compute_integrity, get_memory
            try:
                from ..plusi.dock import _get_active_webview
            except ImportError:
                from plusi.dock import _get_active_webview
            integrity = compute_integrity()
            is_sleeping = get_memory('state', 'is_sleeping', False)

            web = _get_active_webview()
            if web:
                web.page().runJavaScript(
                    f"if(window._plusiSetIntegrity) window._plusiSetIntegrity({integrity});"
                )
                sleeping_str = 'true' if is_sleeping else 'false'
                web.page().runJavaScript(
                    f"if(window._plusiSetSleeping) window._plusiSetSleeping({sleeping_str});"
                )
        except Exception as e:
            logger.exception("plusi integrity sync error: %s", e)

    def _msg_js_error(self, data):
        """Log JavaScript errors from the React frontend."""
        if isinstance(data, dict):
            logger.error("Frontend JS Error: %s\nStack: %s\nComponent: %s",
                          data.get('message', '?'), data.get('stack', ''), data.get('component', ''))
        else:
            logger.error("Frontend JS Error: %s", data)

    def _msg_text_field_focus(self, data):
        """Handle text field focus state changes from JavaScript."""
        try:
            from .shortcut_filter import get_shortcut_filter
        except ImportError:
            from ui.shortcut_filter import get_shortcut_filter
        filt = get_shortcut_filter()
        if filt:
            focused = data.get('focused', False) if isinstance(data, dict) else False
            filt.set_text_field_focus(focused, self.web_view)

    def push_initial_state(self):
        """Sendet Start-Config an die Web-UI"""
        api_key = self.config.get("api_key", "")
        provider = "google"  # Immer Google

        # Lade Modelle live wenn API-Key vorhanden
        models = []
        if api_key.strip():
            try:
                from ..ai.handler import get_ai_handler
                ai = get_ai_handler()
                models = ai.fetch_available_models(provider, api_key)
            except Exception as e:
                logger.error("Fehler beim Laden der Modelle: %s", e)
                models = self._build_model_list()  # Fallback
        else:
            models = self._build_model_list()  # Fallback wenn kein API-Key

        # Hole aktuelles Deck-Info
        try:
            deck_info = self.bridge.getCurrentDeck()
            deck_data = json.loads(deck_info)
        except Exception as e:
            logger.error("Fehler beim Abrufen des Decks: %s", e)
            deck_data = {"deckId": None, "deckName": None, "isInDeck": False}

        # Resolve current theme
        try:
            from .theme import get_resolved_theme
        except ImportError:
            from ui.theme import get_resolved_theme
        stored_theme = self.config.get("theme", "dark")
        resolved_theme = get_resolved_theme()

        payload = {
            "type": "init",
            "models": models,
            "currentModel": self.config.get("model_name", ""),
            "provider": provider,
            "hasApiKey": bool(api_key.strip()),
            "message": "Hallo! Ich bin der Anki Chatbot. Wie kann ich Ihnen helfen?",
            "currentDeck": deck_data,
            "theme": stored_theme,
            "resolvedTheme": resolved_theme,
        }
        js = f"window.ankiReceive({json.dumps(payload)});"
        self.web_view.page().runJavaScript(js)
        # Also apply data-theme attribute immediately
        self._apply_theme_to_webview()

        # Push subagent registry to frontend
        try:
            try:
                from ..ai.subagents import get_registry_for_frontend
            except ImportError:
                from ai.subagents import get_registry_for_frontend
            registry_payload = {
                'type': 'subagent_registry',
                'agents': get_registry_for_frontend(self.config)
            }
            self.web_view.page().runJavaScript(
                f"window.ankiReceive({json.dumps(registry_payload)});"
            )
        except Exception as e:
            logger.error("Failed to push subagent registry: %s", e)
    
    def push_updated_models(self):
        """Sendet aktualisierte Model-Liste an die Web-UI"""
        api_key = self.config.get("api_key", "")
        provider = "google"  # Immer Google
        
        # Lade Modelle live wenn API-Key vorhanden
        models = []
        error = None
        if api_key.strip():
            try:
                from ..ai.handler import get_ai_handler
                ai = get_ai_handler()
                models = ai.fetch_available_models(provider, api_key)
                logger.info("push_updated_models: %s Modelle geladen", len(models) if models else 0)
                # Wenn keine Modelle zurückgegeben wurden, verwende Fallback
                if not models:
                    logger.debug("push_updated_models: Keine Modelle, verwende Fallback")
                    models = self._build_model_list()
            except Exception as e:
                error_msg = str(e)
                logger.exception("Fehler beim Laden der Modelle in push_updated_models: %s", error_msg)
                error = error_msg
                models = self._build_model_list()  # Fallback
        else:
            logger.debug("push_updated_models: Kein API-Key, verwende Fallback")
            models = self._build_model_list()  # Fallback wenn kein API-Key
        
        payload = {
            "type": "models_updated",
            "models": models,
            "currentModel": self.config.get("model_name", ""),
            "provider": provider,
            "hasApiKey": bool(api_key.strip()),
            "error": error
        }
        logger.debug("push_updated_models: Sende %s Modelle an Frontend", len(models))
        js = f"window.ankiReceive({json.dumps(payload)});"
        self.web_view.page().runJavaScript(js)

    def _build_model_list(self):
        """Baut Model-Liste aus statischen Daten (Fallback)"""
        items = []
        for m in AVAILABLE_MODELS.get("google", []):
            items.append({"name": m["name"], "label": m["label"]})
        return items

    def handle_message_from_ui(self, message: str, history=None, mode='compact', request_id=None):
        """
        Verarbeitet Nachrichten von der UI

        Args:
            message: Die Nachricht des Benutzers
            history: Optional - Liste von vorherigen Nachrichten [{role: 'user'|'assistant', content: 'text'}]
            mode: Optional - 'compact' oder 'detailed' (Standard: 'compact')
            request_id: Optional - UUID for tracking this request
        """
        text = message.strip()
        if not text:
            return

        # Set frontend callback for tools that need to push events (e.g. spawn_plusi)
        try:
            from ..ai.tool_executor import set_frontend_callback
        except ImportError:
            from ai.tool_executor import set_frontend_callback

        import json as _json
        from PyQt6.QtCore import QTimer

        def _push_to_frontend(payload):
            # Must run on main Qt thread — tool executor runs in AI thread
            js_code = f"window.ankiReceive({_json.dumps(payload)});"
            QTimer.singleShot(0, lambda: self.web_view.page().runJavaScript(js_code))

            # Sync Plusi mood to main window dock
            if payload.get('type') == 'plusiResult' or (isinstance(payload.get('mood'), str)):
                mood = payload.get('mood', 'neutral')
                try:
                    from plusi.dock import sync_mood
                    QTimer.singleShot(0, lambda: sync_mood(mood))
                except Exception:
                    pass
                QTimer.singleShot(0, lambda: self._sync_plusi_integrity())

        set_frontend_callback(_push_to_frontend)

        try:
            from ..ai.handler import get_ai_handler
        except ImportError:
            from ai.handler import get_ai_handler

        ai = get_ai_handler(widget=self)  # Pass widget reference for UI state emission
        ai._current_request_id = request_id  # Store for pipeline_step events
        if not ai.is_configured():
            # Unterschiedliche Fehlermeldungen je nach Modus
            from ..config import is_backend_mode
            if is_backend_mode():
                bot_msg = "Bitte verbinden Sie sich zuerst mit Ihrem Account in den Einstellungen."
            else:
                bot_msg = "Bitte konfigurieren Sie zuerst den API-Schlüssel in den Einstellungen."
            payload = {"type": "bot", "message": bot_msg}
            self.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
            # Lösche Referenz nach Fehler
            if self.current_request == message:
                self.current_request = None
        else:
            # Sende Loading-Indikator sofort (vor der API-Anfrage)
            loading_payload = {"type": "loading"}
            self.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(loading_payload)});")

            # Load insights for the current card (if any) to inject into system prompt
            card_insights = None
            if self.current_card_context and self.current_card_context.get('cardId'):
                try:
                    try:
                        from ..storage.card_sessions import load_insights
                    except ImportError:
                        from storage.card_sessions import load_insights
                    card_id = self.current_card_context['cardId']
                    card_insights = load_insights(int(card_id))
                except Exception as e:
                    logger.error("⚠️ Failed to load insights for card context: %s", e)

            # Start AI request thread immediately — card history loading happens inside the thread
            # to avoid blocking the main Qt thread
            self._ai_thread = AIRequestThread(ai, text, self, history=history, mode=mode, request_id=request_id, insights=card_insights)
            self._ai_thread._card_context_for_history = self.current_card_context
            self._ai_thread.chunk_signal.connect(self.on_streaming_chunk)
            self._ai_thread.finished_signal.connect(self.on_streaming_finished)
            self._ai_thread.error_signal.connect(self.on_streaming_error)
            self._ai_thread.metadata_signal.connect(self.on_streaming_metadata)
            self._ai_thread.pipeline_signal.connect(self.on_pipeline_step)
            self._ai_thread.start()

    def _send_to_js(self, payload):
        """Send a JSON payload to the frontend via ankiReceive."""
        js_code = f"window.ankiReceive({json.dumps(payload)});"
        self.web_view.page().runJavaScript(js_code)

    def on_pipeline_step(self, request_id, step, status, data):
        """Handle pipeline step events from the AI thread — delivered via Qt signal for real-time UI."""
        payload = {
            "type": "pipeline_step",
            "requestId": request_id,
            "step": step,
            "status": status,
            "data": data if isinstance(data, dict) else {}
        }
        self._send_to_js(payload)

    def on_streaming_chunk(self, request_id, chunk, done, is_function_call):
        payload = {
            "type": "streaming",
            "requestId": request_id,
            "chunk": chunk,
            "done": done,
            "isFunctionCall": is_function_call
        }
        self._send_to_js(payload)

    def on_streaming_error(self, request_id, error_message):
        payload = {
            "type": "error",
            "requestId": request_id,
            "message": error_message
        }
        self._send_to_js(payload)
        self.current_request = None
        if hasattr(self, '_ai_thread'):
            self._ai_thread = None

    def on_streaming_metadata(self, request_id, steps, citations, step_labels):
        payload = {
            "type": "metadata",
            "requestId": request_id,
            "steps": steps,
            "citations": [c if isinstance(c, dict) else c for c in (citations or [])],
            "stepLabels": step_labels or []
        }
        self._send_to_js(payload)

    def on_streaming_finished(self, request_id):
        self.current_request = None
        if hasattr(self, '_ai_thread') and self._ai_thread is not None:
            self._ai_thread.quit()
            self._ai_thread.wait(1000)
            self._ai_thread = None

    def set_model_from_ui(self, model_name: str):
        if not model_name:
            return
        self.config["model_name"] = model_name
        update_config(model_name=model_name)

    def close_panel(self):
        """Schließt das Dock-Widget"""
        # Wird von ui_setup.py verwaltet
        try:
            from .setup import close_chatbot_panel
            close_chatbot_panel()
        except ImportError:
            from setup import close_chatbot_panel
            close_chatbot_panel()

    def open_settings_dialog(self):
        """Wird nicht mehr verwendet - Settings werden nur über React-Dialog geöffnet"""
        pass

    def _save_settings(self, api_key, provider, model_name):
        """Speichert Einstellungen (wird von JavaScript aufgerufen)"""
        logger.debug("_save_settings AUFGERUFEN:")
        logger.debug("  - api_key Länge: %s", len(api_key) if api_key else 0)
        logger.debug("  - api_key erste 10 Zeichen: %s", api_key[:10] if api_key and len(api_key) >= 10 else api_key)
        logger.debug("  - provider: %s", provider)
        logger.debug("  - model_name: %s", model_name)
        
        success = update_config(api_key=api_key, model_provider=provider, model_name=model_name or "")
        if success:
            logger.info("_save_settings: ✓ Config erfolgreich gespeichert")
            self.config = get_config(force_reload=True)
            logger.info("_save_settings: Config neu geladen, API-Key Länge: %s", len(self.config.get('api_key', '')))
            # Warte kurz, damit Config gespeichert ist, dann lade Modelle
            QTimer.singleShot(100, self.push_updated_models)
        else:
            logger.error("_save_settings: ✗ FEHLER beim Speichern der Config!")
    
    def _go_to_card(self, card_id):
        """Springt zu einer bestimmten Lernkarte - öffnet sie im Vorschau-Modus"""
        try:
            from aqt import mw
            from aqt.previewer import Previewer
            
            if mw is None or mw.col is None:
                logger.debug("_go_to_card: mw oder mw.col ist None")
                return
            
            # Suche die Karte
            card = mw.col.get_card(card_id)
            if not card:
                logger.debug("_go_to_card: Karte %s nicht gefunden", card_id)
                return
            
            # Erstelle eine einfache Previewer-Funktion
            def get_cards():
                return [card_id]
            
            def get_card(idx):
                return mw.col.get_card(card_id)
            
            # Öffne den Previewer
            # Der Previewer benötigt einen Parent und Callback-Funktionen
            class CardProvider:
                def __init__(self, card_id, col):
                    self._card_id = card_id
                    self._col = col
                    self._card = col.get_card(card_id)
                
                def card(self, idx=0):
                    return self._card
                
                def card_changed(self):
                    return False
            
            provider = CardProvider(card_id, mw.col)
            
            # Versuche den Single Card Previewer zu erstellen
            try:
                from aqt.previewer import SingleCardPreviewer
                previewer = SingleCardPreviewer(
                    parent=mw,
                    mw=mw,
                    on_close=lambda: None
                )
                previewer.card = lambda: provider.card()
                previewer.open()
                logger.info("_go_to_card: Karte %s im SingleCardPreviewer geöffnet", card_id)
            except ImportError:
                # Fallback: Öffne im Browser mit Vorschau
                from aqt.browser import Browser
                browser = Browser(mw)
                browser.show()
                browser.search_for(f"cid:{card_id}")
                if browser.table.len():
                    browser.table.select_single(0)
                    # Öffne Vorschau-Fenster
                    browser.onTogglePreview()
                logger.info("_go_to_card: Karte %s im Browser mit Vorschau geöffnet", card_id)
                
        except Exception as e:
            logger.exception("Fehler in _go_to_card: %s", e)

