"""
ChatbotWidget Modul
Verwaltet das Web-basierte Chat-UI über QWebEngineView
"""

import os
import json
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

# Sessions-Storage-Import
try:
    from .sessions_storage import load_sessions, save_sessions
except ImportError:
    from sessions_storage import load_sessions, save_sessions


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
                # Neues Format: Nachricht + Historie + Modus
                message = data.get('message', '')
                history = data.get('history', None)
                mode = data.get('mode', 'compact')
                self.current_request = message
                print(f"_handle_js_message: Nachricht mit Historie erhalten ({len(history) if history else 0} Nachrichten), Modus: {mode}")
                self.handle_message_from_ui(message, history=history, mode=mode)
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
        elif msg_type == 'loadSessions':
            # Lade Sessions aus Datei und sende an Frontend
            sessions = load_sessions()
            payload = {"type": "sessionsLoaded", "data": sessions}
            js_code = f"window.ankiReceive({json.dumps(payload)});"
            # Add check if window.ankiReceive exists before calling
            js_code_with_check = f"""
            (function() {{
              console.error('🔵 DEBUG widget.py: Attempting to call window.ankiReceive', typeof window !== 'undefined', typeof window.ankiReceive !== 'undefined');
              if (typeof window !== 'undefined' && typeof window.ankiReceive === 'function') {{
                try {{
                  window.ankiReceive({json.dumps(payload)});
                  console.error('🔵 DEBUG widget.py: window.ankiReceive called successfully');
                }} catch (e) {{
                  console.error('🔵 DEBUG widget.py: Error calling window.ankiReceive', e);
                }}
              }} else {{
                console.error('🔵 DEBUG widget.py: window.ankiReceive not available', typeof window, typeof window?.ankiReceive);
              }}
            }})();
            """
            self.web_view.page().runJavaScript(js_code_with_check)
        elif msg_type == 'saveSessions':
            # Speichere Sessions in Datei
            sessions = None
            try:
                # Handle both string (JSON) and list (direct array) formats
                if isinstance(data, str):
                    # Parse JSON string - may need double parsing if string was double-escaped
                    try:
                        sessions = json.loads(data)
                        # If result is still a string, it was double-escaped - parse again
                        if isinstance(sessions, str):
                            sessions = json.loads(sessions)
                    except json.JSONDecodeError as e:
                        print(f"_handle_js_message: JSON-Fehler beim Parsen: {e}")
                        return
                elif isinstance(data, list):
                    sessions = data
                else:
                    print(f"_handle_js_message: saveSessions - Ungültiger Datentyp: {type(data)}")
                    return
                
                # If parsed result is a dict (not array), try to extract sessions array
                if isinstance(sessions, dict):
                    # Try common keys that might contain the sessions array
                    if 'sessions' in sessions:
                        sessions = sessions['sessions']
                    elif 'data' in sessions:
                        sessions = sessions['data']
                    else:
                        print(f"_handle_js_message: saveSessions - Parsed dict but no 'sessions' or 'data' key found. Keys: {list(sessions.keys())}")
                        return
                
                if sessions is not None:
                    success = save_sessions(sessions)
                    print(f"_handle_js_message: Sessions gespeichert, Erfolg: {success}")
            except json.JSONDecodeError as e:
                print(f"_handle_js_message: JSON-Fehler beim Parsen von Sessions: {e}")
            except Exception as e:
                print(f"_handle_js_message: Fehler beim Speichern von Sessions: {e}")
                import traceback
                traceback.print_exc()
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
                    "model": config.get("model_name", "")
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
        elif msg_type == 'openUrl':
            # Öffne URL im Standard-Browser
            if isinstance(data, str):
                result = self.bridge.openUrl(data)
                # openUrl öffnet die URL direkt, keine Antwort nötig
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
        elif msg_type == 'companionChat':
            if isinstance(data, dict):
                system_prompt = data.get('systemPrompt', '')
                history = data.get('history', [])
                message = data.get('message', '')
                self._handle_companion_chat(system_prompt, history, message)

    def _handle_companion_chat(self, system_prompt: str, history: list, message: str):
        """Runs companion AI call in a background thread, streams companionChunk events to JS."""
        try:
            from .ai_handler import get_ai_handler
        except ImportError:
            from ai_handler import get_ai_handler

        ai = get_ai_handler(widget=self)
        if not ai.is_configured():
            payload = {"type": "companionChunk", "chunk": "Ich kann gerade nicht antworten.", "done": True}
            self.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
            return

        widget_ref = self

        class CompanionThread(QThread):
            chunk_signal = pyqtSignal(str, bool)

            def __init__(self, ai_handler, system_prompt, prior_history, message):
                super().__init__()
                self.ai_handler = ai_handler
                self.system_prompt = system_prompt
                self.prior_history = prior_history or []
                self.message = message
                self._cancelled = False

            def cancel(self):
                self._cancelled = True

            def run(self):
                try:
                    # Build history with system prompt injected as first entry
                    full_history = []
                    if self.system_prompt:
                        full_history.append({"role": "system", "content": self.system_prompt})
                    full_history.extend(self.prior_history)

                    def on_chunk(chunk, done, is_function_call=False):
                        if not self._cancelled:
                            self.chunk_signal.emit(chunk or "", bool(done))

                    self.ai_handler.get_response(
                        self.message,
                        context=None,
                        history=full_history,
                        mode='compact',
                        callback=on_chunk,
                    )
                except Exception as e:
                    if not self._cancelled:
                        self.chunk_signal.emit(f"Fehler: {e}", True)

        thread = CompanionThread(ai, system_prompt, history, message)

        def on_chunk(chunk, done):
            payload = {"type": "companionChunk", "chunk": chunk, "done": done}
            widget_ref.web_view.page().runJavaScript(
                f"window.ankiReceive({json.dumps(payload)});"
            )

        thread.chunk_signal.connect(on_chunk)
        self._companion_thread = thread
        thread.start()

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

    def handle_message_from_ui(self, message: str, history=None, mode='compact'):
        """
        Verarbeitet Nachrichten von der UI
        
        Args:
            message: Die Nachricht des Benutzers
            history: Optional - Liste von vorherigen Nachrichten [{role: 'user'|'assistant', content: 'text'}]
            mode: Optional - 'compact' oder 'detailed' (Standard: 'compact')
        """
        text = message.strip()
        if not text:
            return
        
        try:
            from .ai_handler import get_ai_handler
        except ImportError:
            from ai_handler import get_ai_handler

        ai = get_ai_handler(widget=self)  # Pass widget reference for UI state emission
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
            
            # Track ob Streaming bereits die Nachricht gesendet hat (verhindert doppelte Antworten)
            self._streaming_sent_message = False
            
            # Verwende QThread für echte asynchrone Verarbeitung
            # Dies verhindert, dass die UI blockiert wird
            # Erstelle Thread mit Modus
            class AIRequestThread(QThread):
                finished_signal = pyqtSignal(str, str)  # message, response
                error_signal = pyqtSignal(str, str)  # message, error
                streaming_signal = pyqtSignal(str, bool, bool)  # chunk, done, is_function_call
                
                def __init__(self, ai_handler, text, message_ref, widget_ref, history=None, mode='compact'):
                    super().__init__()
                    self.ai_handler = ai_handler
                    self.text = text
                    self.message_ref = message_ref
                    self.widget_ref = widget_ref
                    self.history = history  # Chat-Historie
                    self.mode = mode  # Kompakt oder Ausführlich
                    self._cancelled = False  # Flag für Abbruch
                
                def cancel(self):
                    """Bricht die Anfrage ab"""
                    self._cancelled = True
                
                def run(self):
                    try:
                        print(f"AIRequestThread: Sende Nachricht an AI: {self.text[:50]}... (Modus: {self.mode})")
                        if self.history:
                            print(f"AIRequestThread: Verwende Chat-Historie ({len(self.history)} Nachrichten)")
                        # Hole aktuellen Karten-Kontext
                        context = self.widget_ref.current_card_context if self.widget_ref else None
                        if context:
                            print(f"AIRequestThread: Verwende Karten-Kontext (Card ID: {context.get('cardId')})")
                        
                        # Streaming-Callback
                        def stream_callback(chunk, done, is_function_call=False):
                            if self._cancelled:
                                return
                            
                            # Sende Chunk an Widget
                            self.streaming_signal.emit(chunk or "", done, is_function_call)
                        
                        # Übergebe Historie, Modus und Callback an AI-Handler mit RAG-Pipeline
                        bot_msg = self.ai_handler.get_response_with_rag(
                            self.text, 
                            context=context, 
                            history=self.history, 
                            mode=self.mode,
                            callback=stream_callback
                        )
                        
                        if not self._cancelled:
                            print(f"AIRequestThread: Antwort erhalten (Länge: {len(bot_msg) if bot_msg else 0})")
                            self.finished_signal.emit(self.message_ref, bot_msg or "")
                    except Exception as e:
                        if not self._cancelled:
                            import traceback
                            error_msg = f"Fehler bei der API-Anfrage: {str(e)}"
                            print(f"AIRequestThread: Exception: {error_msg}")
                            print(traceback.format_exc())
                            self.error_signal.emit(self.message_ref, error_msg)
            
            def on_streaming_chunk(chunk, done, is_function_call):
                # Prüfe ob Anfrage abgebrochen wurde
                if not self.current_request or self.current_request != message:
                    return  # Anfrage wurde abgebrochen
                
                payload = {
                    "type": "streaming", 
                    "chunk": chunk, 
                    "done": done,
                    "isFunctionCall": is_function_call
                }
                
                # DEBUG: Zeige was gesendet wird
                import time
                timestamp_before = time.time() * 1000
                print(f"📤 widget.py: Sende Streaming-Chunk an Frontend (Länge: {len(chunk) if chunk else 0}, done: {done})")
                
                # Markiere dass Streaming verwendet wurde
                if done:
                    self._streaming_sent_message = True
                
                # Sende an Frontend
                js_code = f"window.ankiReceive({json.dumps(payload)});"
                self.web_view.page().runJavaScript(js_code)
            
            # Track ob Streaming bereits die Nachricht gesendet hat
            self._streaming_sent_message = False
            
            def on_finished(message_ref, bot_msg):
                # Prüfe ob Anfrage abgebrochen wurde
                if not self.current_request or self.current_request != message_ref:
                    print(f"handle_message_from_ui: Anfrage wurde während der Verarbeitung abgebrochen")
                    return
                
                # Wenn Streaming bereits die Nachricht gesendet hat (done=True), 
                # müssen wir hier nichts mehr tun, außer aufzuräumen
                if self._streaming_sent_message:
                    print(f"handle_message_from_ui: Nachricht wurde bereits über Streaming gesendet, überspringe on_finished")
                elif bot_msg:
                    # Nur senden wenn Streaming NICHT verwendet wurde
                    payload = {"type": "bot", "message": bot_msg}
                    self.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
                else:
                    error_msg = "Keine Antwort von der API erhalten."
                    payload = {"type": "bot", "message": error_msg}
                    self.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
                
                # Lösche Referenz nach Verarbeitung
                if self.current_request == message_ref:
                    self.current_request = None
                    self._streaming_sent_message = False
                
                # Thread aufräumen
                if hasattr(self, '_ai_thread'):
                    self._ai_thread.quit()
                    self._ai_thread.wait(1000)  # Warte max. 1 Sekunde
                    self._ai_thread = None
            
            def on_streaming_chunk(chunk, done, is_function_call):
                # Prüfe ob Anfrage abgebrochen wurde
                if not self.current_request or self.current_request != message:
                    return  # Anfrage wurde abgebrochen
                
                payload = {
                    "type": "streaming", 
                    "chunk": chunk, 
                    "done": done,
                    "isFunctionCall": is_function_call
                }
                
                # Include steps and citations metadata when done
                if done:
                    has_metadata = hasattr(ai, '_last_rag_metadata') and ai._last_rag_metadata
                    if has_metadata:
                        metadata = ai._last_rag_metadata
                        steps = metadata.get("steps", [])
                        citations = metadata.get("citations", {})
                        payload["steps"] = steps
                        payload["citations"] = citations
                        print(f"📦 widget.py: Metadaten an Frontend gesendet: {len(steps)} Steps, {len(citations)} Citations")
                        # Clear metadata after sending
                        ai._last_rag_metadata = None
                    else:
                        print(f"⚠️ widget.py: Keine Metadaten in ai._last_rag_metadata gefunden")
                
                self.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
                
                # Markiere dass Streaming verwendet wurde
                if done:
                    self._streaming_sent_message = True
            
            def on_error(message_ref, error_msg):
                # Prüfe ob Anfrage abgebrochen wurde
                if self.current_request == message_ref:
                    payload = {"type": "bot", "message": error_msg}
                    self.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
                    self.current_request = None
                
                # Thread aufräumen
                if hasattr(self, '_ai_thread'):
                    self._ai_thread.quit()
                    self._ai_thread.wait(1000)  # Warte max. 1 Sekunde
                    self._ai_thread = None
            
            # Starte Thread für asynchrone Verarbeitung mit Historie
            self._ai_thread = AIRequestThread(ai, text, message, self, history=history, mode=mode)
            self._ai_thread.streaming_signal.connect(on_streaming_chunk)
            self._ai_thread.finished_signal.connect(on_finished)
            self._ai_thread.error_signal.connect(on_error)
            self._ai_thread.start()

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

