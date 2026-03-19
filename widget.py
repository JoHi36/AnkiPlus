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
    from .config import get_config, update_config, AVAILABLE_MODELS
except ImportError:
    from config import get_config, update_config, AVAILABLE_MODELS

# Bridge-Import
try:
    from .bridge import WebBridge
except ImportError:
    from bridge import WebBridge

# Card-Tracker-Import
try:
    from .card_tracker import CardTracker
except ImportError:
    from card_tracker import CardTracker

# NOTE: Legacy sessions_storage (JSON) removed — per-card SQLite is now used instead.


class AIRequestThread(QThread):
    """Thread for asynchronous AI API requests with request-ID based streaming."""
    chunk_signal = pyqtSignal(str, str, bool, bool)  # requestId, chunk, done, is_function_call
    error_signal = pyqtSignal(str, str)  # requestId, error_message
    finished_signal = pyqtSignal(str)  # requestId
    metadata_signal = pyqtSignal(str, object, object, object)  # requestId, steps, citations, step_labels
    pipeline_signal = pyqtSignal(str, str, str, object)  # requestId, step, status, data

    def __init__(self, ai_handler, text, widget_ref, history=None, mode='compact', request_id=None):
        super().__init__()
        self.ai_handler = ai_handler
        self.text = text
        self.widget_ref = widget_ref
        self.history = history
        self.mode = mode
        self.request_id = request_id or str(uuid.uuid4())
        self._cancelled = False

    def cancel(self):
        """Cancel the request."""
        self._cancelled = True

    def run(self):
        try:
            context = self.widget_ref.current_card_context if self.widget_ref else None
            print(f"🔍 AIRequestThread.run: context={'has cardId=' + str(context.get('cardId')) if context else 'None'}, question='{(context.get('frontField') or context.get('question') or '')[:60]}'" if context else "🔍 AIRequestThread.run: context=None")

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
                self.text, context=context, history=self.history,
                mode=self.mode, callback=stream_callback
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

        html_path = os.path.join(os.path.dirname(__file__), "web", "index.html")
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
        self.message_timer.start(100)  # Alle 100ms prüfen
        print("Message-Polling gestartet (100ms Intervall)")

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

    def _handle_js_message(self, msg_type, data):
        """Verarbeitet Nachrichten von JavaScript"""
        print(f"_handle_js_message: Typ={msg_type}, Data={str(data)[:50] if data else None}")
        
        if msg_type == 'sendMessage':
            # Unterstütze sowohl String (alt) als auch Dict (neu mit Historie und Modus)
            if isinstance(data, str):
                # Altes Format: nur Nachricht
                self.current_request = data
                self.handle_message_from_ui(data, history=None, mode='compact')
            elif isinstance(data, dict):
                # Neues Format: Nachricht + Historie + Modus + requestId
                message = data.get('message', '')
                history = data.get('history', None)
                mode = data.get('mode', 'compact')
                request_id = data.get('requestId', None)
                self.current_request = message
                print(f"_handle_js_message: Nachricht mit Historie erhalten ({len(history) if history else 0} Nachrichten), Modus: {mode}, requestId: {request_id}")
                self.handle_message_from_ui(message, history=history, mode=mode, request_id=request_id)
            else:
                print(f"_handle_js_message: Ungültiges Format für sendMessage: {type(data)}")
        elif msg_type == 'closePanel':
            self.close_panel()
            # Tell reviewer JS that chat is now closed
            try:
                from aqt import mw
                if mw and mw.reviewer and mw.reviewer.web:
                    mw.reviewer.web.eval('if(window.setChatOpen) setChatOpen(false);')
            except Exception:
                pass
        elif msg_type == 'advanceCard':
            # Close panel, reset reviewer chat state, and advance to next card
            self.close_panel()
            try:
                from aqt import mw
                if mw and mw.reviewer and mw.reviewer.web:
                    # Reset chatOpen flag, then rate the card
                    mw.reviewer.web.eval(
                        'if(window.setChatOpen) setChatOpen(false);'
                        'if(window.rateCard) rateCard(window.autoRateEase || 3);'
                    )
            except Exception as e:
                print(f"advanceCard error: {e}")
        elif msg_type == 'setModel':
            if isinstance(data, str):
                self.set_model_from_ui(data)
        elif msg_type == 'openSettings':
            # Settings werden nur über React-Dialog geöffnet, keine Aktion nötig
            pass
        elif msg_type == 'previewCard':
            # Preview Card in Anki Previewer
            if data:
                card_id = str(data)
                print(f"_handle_js_message: previewCard für CID {card_id}")
                if self.bridge and hasattr(self.bridge, 'previewCard'):
                    self.bridge.previewCard(card_id)
        elif msg_type == 'cancelRequest':
            if self.current_request:
                cancelled_msg = self.current_request
                self.current_request = None
                
                # Breche Thread ab, falls vorhanden
                if hasattr(self, '_ai_thread') and self._ai_thread:
                    print(f"cancelRequest: Breche Thread ab...")
                    if hasattr(self._ai_thread, 'cancel'):
                        self._ai_thread.cancel()
                    self._ai_thread.quit()
                    self._ai_thread.wait(1000)
                    self._ai_thread = None
                
                # Sende Abbruch-Nachricht an UI
                payload = {"type": "bot", "message": "Anfrage abgebrochen."}
                self.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
                print(f"Anfrage '{cancelled_msg[:50]}...' wurde abgebrochen")
        elif msg_type == 'saveSettings':
            print(f"_handle_js_message: saveSettings erhalten, data type: {type(data)}")
            if isinstance(data, dict):
                api_key = data.get('api_key', '')
                provider = data.get('provider', 'google')
                model_name = data.get('model_name', '')
                print(f"_handle_js_message: saveSettings - API-Key Länge: {len(api_key)}, Provider: {provider}")
                self._save_settings(api_key, provider, model_name)
            else:
                print(f"_handle_js_message: saveSettings - FEHLER: data ist kein dict: {data}")
        elif msg_type == 'getCurrentDeck':
            # Sende aktuelles Deck zurück
            deck_info = self.bridge.getCurrentDeck()
            payload = {"type": "currentDeck", "data": json.loads(deck_info)}
            self.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
        elif msg_type == 'getAvailableDecks':
            # Sende verfügbare Decks zurück
            decks_info = self.bridge.getAvailableDecks()
            payload = {"type": "availableDecks", "data": json.loads(decks_info)}
            self.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
        elif msg_type == 'openDeck':
            # Öffne Deck
            if isinstance(data, (int, float)):
                self.bridge.openDeck(int(data))
        elif msg_type == 'openDeckBrowser':
            # Öffne Stapelübersicht
            self.bridge.openDeckBrowser()
        elif msg_type == 'getDeckStats':
            # Hole Deck-Statistiken
            if isinstance(data, (int, float)):
                deck_id = int(data)
                result = self.bridge.getDeckStats(deck_id)
                # Sende Ergebnis direkt zurück (synchroner Aufruf)
                # Da wir ein Message-Queue-System verwenden, müssen wir das Ergebnis anders zurückgeben
                # Verwende ein Callback-System über window.ankiReceive
                payload = {"type": "deckStats", "data": json.loads(result), "deckId": deck_id}
                self.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
        elif msg_type == 'generateSectionTitle':
            # Generiere einen Titel für einen Chat-Abschnitt
            if isinstance(data, dict):
                question = data.get('question', '')
                answer = data.get('answer', '')
                result = self.bridge.generateSectionTitle(question, answer)
                # Sende Ergebnis an JavaScript über Callback
                payload = {"type": "sectionTitleGenerated", "data": json.loads(result)}
                self.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
        elif msg_type == 'getCardDetails':
            # Hole Karten-Details für Preview-Modal
            if isinstance(data, dict):
                card_id = data.get('cardId')
                callback_id = data.get('callbackId')
                if card_id:
                    result = self.bridge.getCardDetails(str(card_id))
                    # Sende Ergebnis über ankiReceive zurück
                    payload = {"type": "cardDetails", "data": json.loads(result), "callbackId": callback_id}
                    self.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
        elif msg_type == 'saveMultipleChoice':
            # Speichere Multiple-Choice-Daten in Card
            if isinstance(data, dict):
                card_id = data.get('cardId')
                quiz_data_json = data.get('quizDataJson')
                callback_id = data.get('callbackId')
                if card_id and quiz_data_json:
                    result = self.bridge.saveMultipleChoice(int(card_id), quiz_data_json)
                    # Sende Ergebnis über ankiReceive zurück
                    payload = {"type": "saveMultipleChoiceResult", "data": json.loads(result), "callbackId": callback_id}
                    self.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
        elif msg_type == 'loadMultipleChoice':
            # Lade Multiple-Choice-Daten aus Card
            if isinstance(data, dict):
                card_id = data.get('cardId')
                callback_id = data.get('callbackId')
                if card_id:
                    result = self.bridge.loadMultipleChoice(int(card_id))
                    # Sende Ergebnis über ankiReceive zurück
                    payload = {"type": "loadMultipleChoiceResult", "data": json.loads(result), "callbackId": callback_id}
                    self.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
        elif msg_type == 'hasMultipleChoice':
            # Prüfe ob Multiple-Choice-Daten vorhanden
            if isinstance(data, dict):
                card_id = data.get('cardId')
                callback_id = data.get('callbackId')
                if card_id:
                    result = self.bridge.hasMultipleChoice(int(card_id))
                    # Sende Ergebnis über ankiReceive zurück
                    payload = {"type": "hasMultipleChoiceResult", "data": json.loads(result), "callbackId": callback_id}
                    self.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
        elif msg_type == 'goToCard':
            # Springe zu einer bestimmten Lernkarte
            if data:
                self._go_to_card(int(data))
        elif msg_type == 'showAnswer':
            # Zeige die Antwort der aktuellen Karte
            self.bridge.showAnswer()
        elif msg_type == 'hideAnswer':
            # Verstecke die Antwort (lade Karte neu)
            self.bridge.hideAnswer()
        elif msg_type == 'loadCardSession':
            # Load per-card session from SQLite
            try:
                from .card_sessions_storage import load_card_session
                card_id = int(data) if isinstance(data, (int, str)) else data.get('cardId', 0)
                result = load_card_session(card_id)
                payload = {"type": "cardSessionLoaded", "cardId": card_id, "data": result}
                payload_json = json.dumps(payload, ensure_ascii=False)
                # Use BOTH ankiReceive AND CustomEvent for reliability
                js = f"""(function() {{
                    var p = {payload_json};
                    if (typeof window.ankiReceive === 'function') window.ankiReceive(p);
                    window.dispatchEvent(new CustomEvent('ankiCardSessionLoaded', {{detail: p}}));
                }})();"""
                self.web_view.page().runJavaScript(js)
                print(f"_handle_js_message: cardSessionLoaded sent for card {card_id}, messages={len(result.get('messages', []))}")
            except Exception as e:
                print(f"_handle_js_message: loadCardSession error: {e}")

        elif msg_type == 'saveCardSession':
            # Save per-card session to SQLite
            try:
                from .card_sessions_storage import save_card_session
                if isinstance(data, str):
                    data = json.loads(data)
                card_id = data.get('cardId') or data.get('card_id')
                if card_id:
                    save_card_session(int(card_id), data)
            except Exception as e:
                print(f"_handle_js_message: saveCardSession error: {e}")

        elif msg_type == 'saveCardMessage':
            # Append a single message to a card's session
            try:
                from .card_sessions_storage import save_message
                if isinstance(data, str):
                    data = json.loads(data)
                card_id = data.get('cardId') or data.get('card_id')
                message = data.get('message', data)
                if card_id:
                    save_message(int(card_id), message)
            except Exception as e:
                print(f"_handle_js_message: saveCardMessage error: {e}")

        elif msg_type == 'saveCardSection':
            # Create or update a review section for a card
            try:
                from .card_sessions_storage import save_section
                if isinstance(data, str):
                    data = json.loads(data)
                card_id = data.get('cardId') or data.get('card_id')
                section = data.get('section', data)
                if card_id:
                    save_section(int(card_id), section)
            except Exception as e:
                print(f"_handle_js_message: saveCardSection error: {e}")

        elif msg_type == 'loadDeckMessages':
            deck_id = data if isinstance(data, (int, str)) else data.get('deckId')
            try:
                from .card_sessions_storage import load_deck_messages
            except ImportError:
                from card_sessions_storage import load_deck_messages
            try:
                messages = load_deck_messages(int(deck_id), limit=50)
                payload = {"type": "deckMessagesLoaded", "deckId": int(deck_id), "messages": messages}
                self.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
            except Exception as e:
                print(f"loadDeckMessages error: {e}")

        elif msg_type == 'saveDeckMessage':
            try:
                msg_data = json.loads(data) if isinstance(data, str) else data
                deck_id = msg_data.get('deckId')
                message = msg_data.get('message', {})
                try:
                    from .card_sessions_storage import save_deck_message
                except ImportError:
                    from card_sessions_storage import save_deck_message
                save_deck_message(int(deck_id), message)
            except Exception as e:
                print(f"saveDeckMessage error: {e}")

        elif msg_type == 'navigateToCard':
            # Navigate reviewer to a specific card or direction (prev/next)
            try:
                # Support both directions ('prev'/'next') and specific card IDs
                if isinstance(data, str) and data in ('prev', 'next'):
                    if mw and mw.reviewer and hasattr(mw.reviewer, 'web'):
                        mw.reviewer.web.eval(f"pycmd('navigate:{data}');")
                else:
                    card_id = int(data) if isinstance(data, (int, str)) else data.get('cardId', 0)
                    if card_id and mw and mw.reviewer:
                        mw.reviewer.web.eval(f"pycmd('navigate:{card_id}');")
            except Exception as e:
                print(f"_handle_js_message: navigateToCard error: {e}")

        elif msg_type == 'fetchImage':
            # Lade Bild über Python-Proxy und sende als Base64 zurück
            if isinstance(data, str):
                url = data
                result = self.bridge.fetchImage(url)
                # Sende Ergebnis mit Original-URL für Callback-Zuordnung
                payload = {"type": "imageLoaded", "url": url, "data": json.loads(result)}
                self.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
        elif msg_type == 'getCurrentConfig':
            # Sende aktuelle Config an Frontend
            config = get_config(force_reload=True)
            api_key = config.get("api_key", "").strip()  # Trimme Whitespace
            print(f"_handle_js_message: getCurrentConfig - API-Key vorhanden: {'Ja' if api_key else 'Nein'} (Länge: {len(api_key)})")
            if len(api_key) > 50:
                print(f"⚠️ WARNUNG: API-Key ist sehr lang ({len(api_key)} Zeichen). Erste 20 Zeichen: {api_key[:20]}...")
            payload = {
                "type": "configLoaded",
                "data": {
                    "api_key": api_key,
                    "provider": "google",
                    "model": config.get("model_name", ""),
                    "mascot_enabled": config.get("mascot_enabled", False),
                }
            }
            self.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
        elif msg_type == 'fetchModels':
            # Rufe Modelle ab und sende an Frontend
            if isinstance(data, dict):
                provider = data.get('provider', 'google')
                api_key = data.get('api_key', '').strip()  # Trimme API-Key
                print(f"_handle_js_message: fetchModels - Provider: {provider}, API-Key Länge: {len(api_key)}")
                
                # Warnung wenn API-Key zu lang ist
                if len(api_key) > 50:
                    print(f"⚠️ WARNUNG: API-Key ist sehr lang ({len(api_key)} Zeichen)!")
                    print(f"   Erste 30 Zeichen: {api_key[:30]}...")
                    print(f"   Normalerweise sind Google API-Keys ~39 Zeichen lang")
                
                try:
                    from .ai_handler import get_ai_handler
                except ImportError:
                    from ai_handler import get_ai_handler
                
                try:
                    ai = get_ai_handler()
                    models = ai.fetch_available_models(provider, api_key)
                    print(f"_handle_js_message: fetchModels - {len(models) if models else 0} Modelle geladen")
                    if not models:
                        print(f"⚠️ Keine Modelle zurückgegeben - möglicherweise API-Key-Problem")
                    payload = {
                        "type": "modelsLoaded",
                        "data": {
                            "success": True,
                            "models": models if models else [],
                            "error": None if models else "Keine Modelle gefunden. Bitte API-Key prüfen."
                        }
                    }
                except Exception as e:
                    import traceback
                    error_msg = str(e)
                    print(f"_handle_js_message: fetchModels - Fehler: {error_msg}")
                    print(traceback.format_exc())
                    payload = {
                        "type": "modelsLoaded",
                        "data": {
                            "success": False,
                            "models": [],
                            "error": error_msg
                        }
                    }
                self.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
        elif msg_type == 'getAITools':
            # Sende aktuelle AI-Tool-Einstellungen an Frontend
            tools_json = self.bridge.getAITools()
            tools = json.loads(tools_json)
            payload = {
                "type": "aiToolsLoaded",
                "data": tools
            }
            self.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
            # Cache für synchrone Aufrufe
            window_code = f"window._cachedAITools = {json.dumps(tools)};"
            self.web_view.page().runJavaScript(window_code)
        elif msg_type == 'authenticate':
            # Speichere Auth-Tokens
            if isinstance(data, dict):
                token = data.get('token', '')
                refreshToken = data.get('refreshToken', '')
                print(f"_handle_js_message: authenticate - Token Länge: {len(token)}, Refresh-Token Länge: {len(refreshToken)}")
                result = self.bridge.authenticate(token, refreshToken)
                result_data = json.loads(result)
                if result_data.get('success'):
                    payload = {"type": "auth_success", "message": "Authentifizierung erfolgreich"}
                    self.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
        elif msg_type == 'getAuthStatus':
            # Sende Auth-Status an Frontend
            status_json = self.bridge.getAuthStatus()
            status = json.loads(status_json)
            payload = {
                "type": "authStatusLoaded",
                "data": status
            }
            self.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
        elif msg_type == 'getAuthToken':
            # Hole Auth-Token für API-Calls
            result = self.bridge.getAuthToken()
            token_data = json.loads(result)
            payload = {
                "type": "authTokenLoaded",
                "data": token_data
            }
            self.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
        elif msg_type == 'refreshAuth':
            # Rufe Token-Refresh auf
            result = self.bridge.refreshAuth()
            result_data = json.loads(result)
            payload = {
                "type": "authRefreshResult",
                "data": result_data
            }
            self.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
        elif msg_type == 'logout':
            # Abmelden
            self.bridge.logout()
        elif msg_type == 'openUrl':
            # Öffne URL im Standard-Browser
            if isinstance(data, str):
                result = self.bridge.openUrl(data)
                # openUrl öffnet die URL direkt, keine Antwort nötig
        elif msg_type == 'startLinkAuth':
            # Starte Link-Code Auth Flow (automatische Verbindung über Backend)
            self.bridge.startLinkAuth()
        elif msg_type == 'handleAuthDeepLink':
            # Verarbeite Deep Link für Auth
            if isinstance(data, str):
                result = self.bridge.handleAuthDeepLink(data)
                result_data = json.loads(result)
                if result_data.get('success'):
                    payload = {"type": "auth_success", "message": "Authentifizierung erfolgreich"}
                    self.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
        elif msg_type == 'saveAITools':
            # Speichere AI-Tool-Einstellungen
            if isinstance(data, str):
                try:
                    result = self.bridge.saveAITools(data)
                    result_data = json.loads(result)
                    print(f"_handle_js_message: AI Tools gespeichert, Erfolg: {result_data.get('success')}")
                    # Cache für synchrone Aufrufe
                    tools = json.loads(data)
                    window_code = f"window._cachedAITools = {json.dumps(tools)};"
                    self.web_view.page().runJavaScript(window_code)
                except json.JSONDecodeError as e:
                    print(f"_handle_js_message: JSON-Fehler beim Parsen von AI Tools: {e}")
        elif msg_type == 'saveMascotEnabled':
            enabled = bool(data)
            update_config(mascot_enabled=enabled)
            self.config = get_config(force_reload=True)
            payload = {"type": "mascotEnabledSaved", "data": {"enabled": enabled}}
            self.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
        elif msg_type == 'debugLog':
            # Debug-Logs vom Frontend in Log-Datei schreiben
            import os
            log_path = os.path.join(os.path.dirname(__file__), '.cursor', 'debug.log')
            try:
                os.makedirs(os.path.dirname(log_path), exist_ok=True)
                with open(log_path, 'a', encoding='utf-8') as f:
                    f.write(data + '\n')
            except Exception as e:
                print(f"_handle_js_message: Fehler beim Schreiben von Debug-Log: {e}")
        elif msg_type == 'plusiDirect':
            msg_data = data if isinstance(data, dict) else json.loads(data) if isinstance(data, str) else {}
            text = msg_data.get('text', '')
            deck_id = msg_data.get('deck_id', None)
            if text:
                self._handle_plusi_direct(text, deck_id)

    def _handle_plusi_direct(self, text, deck_id=None):
        """Route @Plusi messages directly to plusi_agent.py"""
        try:
            try:
                from .plusi_agent import run_plusi
            except ImportError:
                from plusi_agent import run_plusi

            result = run_plusi(situation=text, deck_id=deck_id)
            mood = result.get('mood', 'neutral')
            payload = {
                'type': 'plusi_direct_result',
                'mood': mood,
                'text': result.get('text', ''),
                'meta': result.get('meta', ''),
                'error': result.get('error', False)
            }
            self.web_view.page().runJavaScript(
                f"window.ankiReceive({json.dumps(payload)});"
            )
            # Sync mood to main window Plusi dock
            try:
                from plusi_dock import set_mood
                from aqt import mw
                if mw and mw.reviewer and mw.reviewer.web:
                    set_mood(mw.reviewer.web, mood)
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
                from .ai_handler import get_ai_handler
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
                from .ai_handler import get_ai_handler
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
            from .tool_executor import set_frontend_callback
        except ImportError:
            from tool_executor import set_frontend_callback

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
                    from plusi_dock import set_mood
                    from aqt import mw
                    if mw and mw.reviewer and mw.reviewer.web:
                        QTimer.singleShot(0, lambda: set_mood(mw.reviewer.web, mood))
                except Exception:
                    pass

        set_frontend_callback(_push_to_frontend)

        try:
            from .ai_handler import get_ai_handler
        except ImportError:
            from ai_handler import get_ai_handler

        ai = get_ai_handler(widget=self)  # Pass widget reference for UI state emission
        ai._current_request_id = request_id  # Store for pipeline_step events
        if not ai.is_configured():
            # Unterschiedliche Fehlermeldungen je nach Modus
            from .config import is_backend_mode
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
            
            # Override history with card-specific messages from SQLite
            # This prevents cross-card history contamination
            card_history = history  # Default to frontend-provided history
            if self.current_card_context and self.current_card_context.get('cardId'):
                try:
                    try:
                        from .card_sessions_storage import load_card_session
                    except ImportError:
                        from card_sessions_storage import load_card_session
                    card_id = self.current_card_context['cardId']
                    session_data = load_card_session(card_id)
                    db_messages = session_data.get('messages', [])
                    if db_messages:
                        # Use last 10 messages from THIS card only
                        recent = db_messages[-10:]
                        card_history = [
                            {'role': 'user' if m.get('sender') == 'user' else 'assistant',
                             'content': m.get('text', '')}
                            for m in recent if m.get('text')
                        ]
                        print(f"📋 Widget: Using card-specific history ({len(card_history)} msgs from card {card_id})")
                    else:
                        card_history = []
                        print(f"📋 Widget: No card history for card {card_id}, starting fresh")
                except Exception as e:
                    print(f"⚠️ Widget: Failed to load card history: {e}, using frontend history")

            # Start AI request thread with request-ID based streaming
            self._ai_thread = AIRequestThread(ai, text, self, history=card_history, mode=mode, request_id=request_id)
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
            from .ui_setup import close_chatbot_panel
            close_chatbot_panel()
        except ImportError:
            from ui_setup import close_chatbot_panel
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

