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
    from bridge import WebBridge

# Card-Tracker-Import
try:
    from ..utils.card_tracker import CardTracker
except ImportError:
    from utils.card_tracker import CardTracker

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
            print(f"🔍 AIRequestThread.run: context={'has cardId=' + str(context.get('cardId')) if context else 'None'}, question='{(context.get('frontField') or context.get('question') or '')[:60]}'" if context else "🔍 AIRequestThread.run: context=None")

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
                        print(f"📋 AIThread: Card history loaded ({len(card_history)} msgs from card {card_id})")
                    else:
                        card_history = []
                except Exception as e:
                    print(f"⚠️ AIThread: Failed to load card history: {e}")

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
                import traceback
                print(f"AIRequestThread: Exception: {str(e)}")
                print(traceback.format_exc())
                self.error_signal.emit(self.request_id, str(e))
        finally:
            self.ai_handler._pipeline_signal_callback = None


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
            print(f"🟢 InsightExtractionThread: Starting extraction for card {self.card_id}, prompt length={len(prompt)}")
            response = self.ai_handler.get_response(
                user_message=prompt,
                context=None,
                history=[],
                mode='compact',
            )

            if self._cancelled:
                return

            print(f"🟢 InsightExtractionThread: Response received, length={len(response) if response else 0}")
            if not response:
                self.error_signal.emit(self.card_id, "Empty response from AI")
                return

            result = parse_extraction_response(response)

            if result is None:
                print(f"🟡 InsightExtractionThread: Parse failed, retrying...")
                # Retry once
                response = self.ai_handler.get_response(
                    user_message=prompt,
                    context=None,
                    history=[],
                    mode='compact',
                )
                if self._cancelled:
                    return
                result = parse_extraction_response(response) if response else None

            if result is None:
                self.error_signal.emit(self.card_id, "Failed to parse extraction response after retry")
                return

            # Save to storage
            from ..storage.card_sessions import save_insights
            save_insights(self.card_id, result)

            self.finished_signal.emit(self.card_id, json.dumps(result, ensure_ascii=False))

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
        self.setup_ui()
        # Card-Tracking wird nach UI-Setup initialisiert
        if self.web_view:
            self.card_tracker = CardTracker(self)
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
        print("JavaScript Bridge initialisiert (Message-Queue System)")
        
        # Starte Polling für Nachrichten
        self.message_timer = QTimer()
        self.message_timer.timeout.connect(self._poll_messages)
        self.message_timer.start(200)  # Alle 200ms prüfen
        print("Message-Polling gestartet (200ms Intervall)")

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
                print(f"Fehler beim Verarbeiten von Nachrichten: {e}")
                import traceback
                traceback.print_exc()
        
        self.web_view.page().runJavaScript(js_code, handle_messages)

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
                print(f"_handle_js_message: Fehler bei {msg_type}: {e}")
                import traceback
                traceback.print_exc()
        else:
            print(f"_handle_js_message: Unbekannter Typ: {msg_type}")

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
            'loadDeckMessages': self._msg_load_deck_messages,
            'saveDeckMessage': self._msg_save_deck_message,
            # Config & Settings
            'saveSettings': self._msg_save_settings,
            'getCurrentConfig': self._msg_get_current_config,
            'getAITools': self._msg_get_ai_tools,
            'saveAITools': self._msg_save_ai_tools,
            'saveMascotEnabled': self._msg_save_mascot_enabled,
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
            'openUrl': lambda d: self.bridge.openUrl(d) if isinstance(d, str) else None,
            'debugLog': self._msg_debug_log,
            'plusiPanel': lambda d: __import__('importlib').import_module('.plusi_panel', __package__).toggle_panel(),
            'plusiDirect': self._msg_plusi_direct,
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
            print(f"advanceCard error: {e}")

    def _msg_preview_card(self, data):
        if data and self.bridge and hasattr(self.bridge, 'previewCard'):
            self.bridge.previewCard(str(data))

    def _msg_open_preview(self, data):
        card_id = data.get('cardId') if isinstance(data, dict) else data
        from ..custom_reviewer import open_preview
        open_preview(int(card_id))

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

    def _msg_load_deck_messages(self, data):
        deck_id = data if isinstance(data, (int, str)) else data.get('deckId')
        try:
            from ..storage.card_sessions import load_deck_messages
        except ImportError:
            from storage.card_sessions import load_deck_messages
        messages = load_deck_messages(int(deck_id), limit=50)
        self._send_to_frontend("deckMessagesLoaded", None, {"type": "deckMessagesLoaded", "deckId": int(deck_id), "messages": messages})

    def _msg_save_deck_message(self, data):
        msg_data = json.loads(data) if isinstance(data, str) else data
        try:
            from ..storage.card_sessions import save_deck_message
        except ImportError:
            from storage.card_sessions import save_deck_message
        save_deck_message(int(msg_data.get('deckId')), msg_data.get('message', {}))

    def _msg_save_settings(self, data):
        if isinstance(data, dict):
            self._save_settings(data.get('api_key', ''), data.get('provider', 'google'), data.get('model_name', ''))

    def _msg_get_current_config(self, data):
        config = get_config(force_reload=True)
        self._send_to_frontend("configLoaded", {
            "api_key": config.get("api_key", "").strip(),
            "provider": "google",
            "model": config.get("model_name", ""),
            "mascot_enabled": config.get("mascot_enabled", False),
        })

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
        self._send_to_frontend("aiToolsLoaded", tools)
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

    def _msg_plusi_direct(self, data):
        msg_data = data if isinstance(data, dict) else json.loads(data) if isinstance(data, str) else {}
        text = msg_data.get('text', '')
        if text:
            self._handle_plusi_direct(text, msg_data.get('deck_id'))

    def _handle_plusi_direct(self, text, deck_id=None):
        """Route @Plusi messages directly to plusi_agent.py"""
        try:
            try:
                from ..plusi.agent import run_plusi
            except ImportError:
                from plusi.agent import run_plusi

            result = run_plusi(situation=text, deck_id=deck_id)
            mood = result.get('mood', 'neutral')
            friendship = result.get('friendship', {})
            is_silent = result.get('silent', False)
            payload = {
                'type': 'plusi_direct_result',
                'mood': mood,
                'text': result.get('text', ''),
                'meta': result.get('meta', ''),
                'friendship': friendship,
                'silent': is_silent,
                'error': result.get('error', False)
            }
            self.web_view.page().runJavaScript(
                f"window.ankiReceive({json.dumps(payload)});"
            )
            # Sync mood to main window Plusi dock
            try:
                try:
                    from ..plusi.dock import sync_mood
                except ImportError:
                    from plusi.dock import sync_mood
                sync_mood(mood)
            except Exception as e:
                print(f"plusi dock sync error: {e}")
            # Notify panel of diary entry and state changes
            try:
                from ..plusi.panel import notify_new_diary_entry, update_panel_mood, update_panel_friendship
                if result.get('diary'):
                    notify_new_diary_entry()
                update_panel_mood(mood)
                if friendship:
                    update_panel_friendship(friendship)
            except Exception as e:
                print(f"plusi panel notify error: {e}")
            # Check if a reflect window is open — trigger after interaction
            try:
                from .. import check_and_trigger_reflect
                check_and_trigger_reflect()
            except Exception:
                pass
        except Exception as e:
            print(f"plusiDirect error: {e}")
            payload = {
                'type': 'plusi_direct_result',
                'mood': 'neutral',
                'text': '',
                'error': True
            }
            self.web_view.page().runJavaScript(
                f"window.ankiReceive({json.dumps(payload)});"
            )

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
                print(f"Fehler beim Laden der Modelle: {e}")
                models = self._build_model_list()  # Fallback
        else:
            models = self._build_model_list()  # Fallback wenn kein API-Key
        
        # Hole aktuelles Deck-Info
        try:
            deck_info = self.bridge.getCurrentDeck()
            deck_data = json.loads(deck_info)
        except Exception as e:
            print(f"Fehler beim Abrufen des Decks: {e}")
            deck_data = {"deckId": None, "deckName": None, "isInDeck": False}
        
        payload = {
            "type": "init",
            "models": models,
            "currentModel": self.config.get("model_name", ""),
            "provider": provider,
            "hasApiKey": bool(api_key.strip()),
            "message": "Hallo! Ich bin der Anki Chatbot. Wie kann ich Ihnen helfen?",
            "currentDeck": deck_data
        }
        js = f"window.ankiReceive({json.dumps(payload)});"
        self.web_view.page().runJavaScript(js)
    
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
                print(f"push_updated_models: {len(models) if models else 0} Modelle geladen")
                # Wenn keine Modelle zurückgegeben wurden, verwende Fallback
                if not models:
                    print("push_updated_models: Keine Modelle, verwende Fallback")
                    models = self._build_model_list()
            except Exception as e:
                error_msg = str(e)
                print(f"Fehler beim Laden der Modelle in push_updated_models: {error_msg}")
                import traceback
                traceback.print_exc()
                error = error_msg
                models = self._build_model_list()  # Fallback
        else:
            print("push_updated_models: Kein API-Key, verwende Fallback")
            models = self._build_model_list()  # Fallback wenn kein API-Key
        
        payload = {
            "type": "models_updated",
            "models": models,
            "currentModel": self.config.get("model_name", ""),
            "provider": provider,
            "hasApiKey": bool(api_key.strip()),
            "error": error
        }
        print(f"push_updated_models: Sende {len(models)} Modelle an Frontend")
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
                    print(f"⚠️ Failed to load insights for card context: {e}")

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
        if hasattr(self, '_ai_thread'):
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
        print(f"=" * 50)
        print(f"_save_settings AUFGERUFEN:")
        print(f"  - api_key Länge: {len(api_key) if api_key else 0}")
        print(f"  - api_key erste 10 Zeichen: {api_key[:10] if api_key and len(api_key) >= 10 else api_key}")
        print(f"  - provider: {provider}")
        print(f"  - model_name: {model_name}")
        print(f"=" * 50)
        
        success = update_config(api_key=api_key, model_provider=provider, model_name=model_name or "")
        if success:
            print(f"_save_settings: ✓ Config erfolgreich gespeichert")
            self.config = get_config(force_reload=True)
            print(f"_save_settings: Config neu geladen, API-Key Länge: {len(self.config.get('api_key', ''))}")
            # Warte kurz, damit Config gespeichert ist, dann lade Modelle
            QTimer.singleShot(100, self.push_updated_models)
        else:
            print(f"_save_settings: ✗ FEHLER beim Speichern der Config!")
    
    def _go_to_card(self, card_id):
        """Springt zu einer bestimmten Lernkarte - öffnet sie im Vorschau-Modus"""
        try:
            from aqt import mw
            from aqt.previewer import Previewer
            
            if mw is None or mw.col is None:
                print(f"_go_to_card: mw oder mw.col ist None")
                return
            
            # Suche die Karte
            card = mw.col.get_card(card_id)
            if not card:
                print(f"_go_to_card: Karte {card_id} nicht gefunden")
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
                print(f"_go_to_card: Karte {card_id} im SingleCardPreviewer geöffnet")
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
                print(f"_go_to_card: Karte {card_id} im Browser mit Vorschau geöffnet")
                
        except Exception as e:
            import traceback
            print(f"Fehler in _go_to_card: {e}")
            print(traceback.format_exc())

