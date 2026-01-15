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
        self.web_view.load(QUrl.fromLocalFile(html_path))
        self.web_view.loadFinished.connect(self._init_js_bridge)
        self.web_view.loadFinished.connect(self.push_initial_state)

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
            # #region agent log
            import os
            log_path = os.path.join(os.path.dirname(__file__), '.cursor', 'debug.log')
            try:
                os.makedirs(os.path.dirname(log_path), exist_ok=True)
                with open(log_path, 'a', encoding='utf-8') as f:
                    import json as json_module
                    import time
                    log_entry = {"location": "widget.py:267", "message": "loadSessions called", "data": {}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "A"}
                    f.write(json_module.dumps(log_entry) + "\n")
            except Exception as e:
                pass
            # #endregion
            sessions = load_sessions()
            # #region agent log
            try:
                with open(log_path, 'a', encoding='utf-8') as f:
                    import json as json_module
                    import time
                    log_entry = {"location": "widget.py:270", "message": "Sessions loaded from file", "data": {"sessionsCount": len(sessions), "sessionsIsArray": isinstance(sessions, list)}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}
                    f.write(json_module.dumps(log_entry) + "\n")
            except Exception as e:
                pass
            # #endregion
            payload = {"type": "sessionsLoaded", "data": sessions}
            # #region agent log
            try:
                with open(log_path, 'a', encoding='utf-8') as f:
                    import json as json_module
                    import time
                    log_entry = {"location": "widget.py:272", "message": "Sending sessionsLoaded event to frontend", "data": {"payloadDataLength": len(sessions) if isinstance(sessions, list) else 0, "payloadDataIsArray": isinstance(sessions, list)}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "B"}
                    f.write(json_module.dumps(log_entry) + "\n")
            except Exception as e:
                pass
            # #endregion
            self.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
        elif msg_type == 'saveSessions':
            # Speichere Sessions in Datei
            # #region agent log
            import os
            log_path = os.path.join(os.path.dirname(__file__), '.cursor', 'debug.log')
            try:
                os.makedirs(os.path.dirname(log_path), exist_ok=True)
                with open(log_path, 'a', encoding='utf-8') as f:
                    import json as json_module
                    import time
                    log_entry = {"location": "widget.py:271", "message": "saveSessions called", "data": {"dataType": type(data).__name__, "dataIsString": isinstance(data, str), "dataIsList": isinstance(data, list), "dataLength": len(data) if (isinstance(data, str) or isinstance(data, list)) else 0}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}
                    f.write(json_module.dumps(log_entry) + "\n")
            except Exception as e:
                pass
            # #endregion
            sessions = None
            try:
                # Handle both string (JSON) and list (direct array) formats
                if isinstance(data, str):
                    # #region agent log
                    try:
                        with open(log_path, 'a', encoding='utf-8') as f:
                            import json as json_module
                            import time
                            log_entry = {"location": "widget.py:285", "message": "Parsing JSON string", "data": {"dataLength": len(data), "dataPreview": data[:100] if len(data) > 100 else data}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}
                            f.write(json_module.dumps(log_entry) + "\n")
                    except Exception as e:
                        pass
                    # #endregion
                    # Parse JSON string - may need double parsing if string was double-escaped
                    try:
                        sessions = json.loads(data)
                        # #region agent log
                        try:
                            with open(log_path, 'a', encoding='utf-8') as f:
                                import json as json_module
                                import time
                                log_entry = {"location": "widget.py:292", "message": "First JSON parse result", "data": {"sessionsType": type(sessions).__name__, "sessionsIsArray": isinstance(sessions, list), "sessionsIsDict": isinstance(sessions, dict), "sessionsIsString": isinstance(sessions, str), "sessionsCount": len(sessions) if isinstance(sessions, (list, dict, str)) else 0}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}
                                f.write(json_module.dumps(log_entry) + "\n")
                        except Exception as e:
                            pass
                        # #endregion
                        # If result is still a string, it was double-escaped - parse again
                        if isinstance(sessions, str):
                            # #region agent log
                            try:
                                with open(log_path, 'a', encoding='utf-8') as f:
                                    import json as json_module
                                    import time
                                    log_entry = {"location": "widget.py:301", "message": "Result is still string, parsing again", "data": {"stringLength": len(sessions), "stringPreview": sessions[:100] if len(sessions) > 100 else sessions}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}
                                    f.write(json_module.dumps(log_entry) + "\n")
                            except Exception as e:
                                pass
                            # #endregion
                            sessions = json.loads(sessions)
                            # #region agent log
                            try:
                                with open(log_path, 'a', encoding='utf-8') as f:
                                    import json as json_module
                                    import time
                                    log_entry = {"location": "widget.py:307", "message": "Second JSON parse result", "data": {"sessionsType": type(sessions).__name__, "sessionsIsArray": isinstance(sessions, list), "sessionsIsDict": isinstance(sessions, dict), "sessionsCount": len(sessions) if isinstance(sessions, (list, dict)) else 0}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}
                                    f.write(json_module.dumps(log_entry) + "\n")
                            except Exception as e:
                                pass
                            # #endregion
                    except json.JSONDecodeError as e:
                        print(f"_handle_js_message: JSON-Fehler beim Parsen: {e}")
                        # #region agent log
                        try:
                            with open(log_path, 'a', encoding='utf-8') as f:
                                import json as json_module
                                import time
                                log_entry = {"location": "widget.py:315", "message": "JSON decode error", "data": {"error": str(e)}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}
                                f.write(json_module.dumps(log_entry) + "\n")
                        except Exception as e2:
                            pass
                        # #endregion
                        return
                elif isinstance(data, list):
                    sessions = data
                else:
                    print(f"_handle_js_message: saveSessions - Ungültiger Datentyp: {type(data)}")
                    # #region agent log
                    try:
                        with open(log_path, 'a', encoding='utf-8') as f:
                            import json as json_module
                            import time
                            log_entry = {"location": "widget.py:323", "message": "saveSessions FAILED - invalid data type", "data": {"dataType": type(data).__name__}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}
                            f.write(json_module.dumps(log_entry) + "\n")
                    except Exception as e:
                        pass
                    # #endregion
                    return
                
                # If parsed result is a dict (not array), try to extract sessions array
                if isinstance(sessions, dict):
                    # #region agent log
                    try:
                        with open(log_path, 'a', encoding='utf-8') as f:
                            import json as json_module
                            import time
                            log_entry = {"location": "widget.py:333", "message": "Parsed result is dict, trying to extract sessions", "data": {"dictKeys": list(sessions.keys())}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}
                            f.write(json_module.dumps(log_entry) + "\n")
                    except Exception as e:
                        pass
                    # #endregion
                    # Try common keys that might contain the sessions array
                    if 'sessions' in sessions:
                        sessions = sessions['sessions']
                    elif 'data' in sessions:
                        sessions = sessions['data']
                    else:
                        print(f"_handle_js_message: saveSessions - Parsed dict but no 'sessions' or 'data' key found. Keys: {list(sessions.keys())}")
                        # #region agent log
                        try:
                            with open(log_path, 'a', encoding='utf-8') as f:
                                import json as json_module
                                import time
                                log_entry = {"location": "widget.py:343", "message": "Dict has no sessions/data key", "data": {"dictKeys": list(sessions.keys())}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}
                                f.write(json_module.dumps(log_entry) + "\n")
                        except Exception as e:
                            pass
                        # #endregion
                        return
                
                # #region agent log
                try:
                    with open(log_path, 'a', encoding='utf-8') as f:
                        import json as json_module
                        import time
                        log_entry = {"location": "widget.py:325", "message": "Sessions parsed/prepared", "data": {"sessionsCount": len(sessions) if isinstance(sessions, list) else 0, "sessionsIsArray": isinstance(sessions, list)}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}
                        f.write(json_module.dumps(log_entry) + "\n")
                except Exception as e:
                    pass
                # #endregion
                
                if sessions is not None:
                    success = save_sessions(sessions)
                    # #region agent log
                    try:
                        with open(log_path, 'a', encoding='utf-8') as f:
                            import json as json_module
                            import time
                            log_entry = {"location": "widget.py:295", "message": "save_sessions completed", "data": {"success": success, "sessionsCount": len(sessions) if isinstance(sessions, list) else 0}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}
                            f.write(json_module.dumps(log_entry) + "\n")
                    except Exception as e:
                        pass
                    # #endregion
                    print(f"_handle_js_message: Sessions gespeichert, Erfolg: {success}")
            except json.JSONDecodeError as e:
                print(f"_handle_js_message: JSON-Fehler beim Parsen von Sessions: {e}")
                # #region agent log
                try:
                    with open(log_path, 'a', encoding='utf-8') as f:
                        import json as json_module
                        import time
                        log_entry = {"location": "widget.py:300", "message": "JSON decode error in saveSessions", "data": {"error": str(e)}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}
                        f.write(json_module.dumps(log_entry) + "\n")
                except Exception as e2:
                    pass
                # #endregion
            except Exception as e:
                print(f"_handle_js_message: Fehler beim Speichern von Sessions: {e}")
                import traceback
                traceback.print_exc()
                # #region agent log
                try:
                    with open(log_path, 'a', encoding='utf-8') as f:
                        import json as json_module
                        import time
                        log_entry = {"location": "widget.py:308", "message": "Exception in saveSessions", "data": {"error": str(e)}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "C"}
                        f.write(json_module.dumps(log_entry) + "\n")
                except Exception as e2:
                    pass
                # #endregion
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
        elif msg_type == 'refreshAuth':
            # Rufe Token-Refresh auf
            result = self.bridge.refreshAuth()
            result_data = json.loads(result)
            payload = {
                "type": "authRefreshResult",
                "data": result_data
            }
            self.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
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
                
                # #region agent log
                log_data = {"sessionId": "debug-session", "runId": "run1", "hypothesisId": "A", "location": "widget.py:562", "message": "Before runJavaScript", "data": {"chunk_len": len(chunk) if chunk else 0, "done": done, "timestamp": timestamp_before}, "timestamp": timestamp_before}
                with open("/Users/johanneshinkel/Library/Application Support/Anki2/addons21/anki-chatbot-addon/.cursor/debug.log", "a") as f:
                    f.write(json.dumps(log_data) + "\n")
                # #endregion
                
                # Markiere dass Streaming verwendet wurde
                if done:
                    self._streaming_sent_message = True
                
                # Sende an Frontend
                js_code = f"window.ankiReceive({json.dumps(payload)});"
                self.web_view.page().runJavaScript(js_code)
                
                # #region agent log
                timestamp_after = time.time() * 1000
                log_data = {"sessionId": "debug-session", "runId": "run1", "hypothesisId": "A", "location": "widget.py:570", "message": "After runJavaScript", "data": {"chunk_len": len(chunk) if chunk else 0, "done": done, "timestamp": timestamp_after, "delay_ms": timestamp_after - timestamp_before}, "timestamp": timestamp_after}
                with open("/Users/johanneshinkel/Library/Application Support/Anki2/addons21/anki-chatbot-addon/.cursor/debug.log", "a") as f:
                    f.write(json.dumps(log_data) + "\n")
                # #endregion
            
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

