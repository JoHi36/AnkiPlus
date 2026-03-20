"""
Overlay Chat Widget
A QWebEngineView that overlays Anki's main content area,
running the React app in freechat mode.
"""

import os
import json
import time
from aqt import mw
from aqt.qt import *

try:
    from PyQt6.QtWebEngineWidgets import QWebEngineView
except ImportError:
    try:
        from PyQt5.QtWebEngineWidgets import QWebEngineView
    except ImportError:
        QWebEngineView = None

try:
    from ..storage.card_sessions import load_deck_messages, save_deck_message
    from ..config import get_config
except ImportError:
    from storage.card_sessions import load_deck_messages, save_deck_message
    from config import get_config


class OverlayChatWidget(QWidget):
    """React-based chat overlay that covers Anki's main content area."""

    def __init__(self, parent=None):
        super().__init__(parent or mw)
        self.web_view = None
        self.message_timer = None
        self._current_thread = None
        self._streaming_text = ''
        self._visible = False
        self._bridge_initialized = False
        self._setup_ui()

    def _setup_ui(self):
        if QWebEngineView is None:
            return

        self.setStyleSheet("background: transparent;")
        layout = QVBoxLayout()
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        self.web_view = QWebEngineView()
        self.web_view.setContextMenuPolicy(Qt.ContextMenuPolicy.NoContextMenu)
        self.web_view.page().setBackgroundColor(QColor(0, 0, 0, 0))

        html_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "web", "index.html")
        url = QUrl.fromLocalFile(html_path)
        url.setQuery(f"v={int(time.time())}&mode=freechat")
        self.web_view.loadFinished.connect(self._init_bridge)
        self.web_view.load(url)

        layout.addWidget(self.web_view)
        self.setLayout(layout)
        self.hide()

    def _init_bridge(self):
        """Initialize ankiBridge message queue in the overlay webview."""
        if self._bridge_initialized:
            return
        self._bridge_initialized = True
        js = """
        window.ankiBridge = {
            messageQueue: [],
            addMessage: function(type, data) {
                this.messageQueue.push({type: type, data: data, timestamp: Date.now()});
            },
            getMessages: function() {
                var msgs = this.messageQueue.slice();
                this.messageQueue = [];
                return msgs;
            }
        };
        console.log('overlay ankiBridge initialized');
        """
        self.web_view.page().runJavaScript(js)
        self.message_timer = QTimer()
        self.message_timer.timeout.connect(self._poll_messages)
        self.message_timer.start(200)

    def _poll_messages(self):
        """Poll for messages from React."""
        if not self.web_view or not self._visible:
            return
        js = """
        (function() {
            if (window.ankiBridge && window.ankiBridge.messageQueue.length > 0) {
                return JSON.stringify(window.ankiBridge.getMessages());
            }
            return null;
        })();
        """
        self.web_view.page().runJavaScript(js, self._handle_messages)

    def _handle_messages(self, result):
        if not result:
            return
        try:
            messages = json.loads(result)
            for msg in messages:
                self._route_message(msg.get('type'), msg.get('data'))
        except Exception as e:
            print(f"OverlayChat: message parse error: {e}")

    def _route_message(self, msg_type, data):
        """Route messages from React to appropriate handlers."""
        if msg_type == 'loadDeckMessages':
            deck_id = int(data) if isinstance(data, (int, str)) else 0
            try:
                messages = load_deck_messages(deck_id, limit=50)
                payload = {"type": "deckMessagesLoaded", "deckId": deck_id, "messages": messages}
                self._send_to_react(payload)
            except Exception as e:
                print(f"OverlayChat: loadDeckMessages error: {e}")

        elif msg_type == 'saveDeckMessage':
            try:
                msg_data = json.loads(data) if isinstance(data, str) else data
                save_deck_message(int(msg_data.get('deckId', 0)), msg_data.get('message', {}))
            except Exception as e:
                print(f"OverlayChat: saveDeckMessage error: {e}")

        elif msg_type == 'sendMessage':
            try:
                msg_data = json.loads(data) if isinstance(data, str) else data
                text = msg_data.get('text', '')
                if text.strip():
                    self._start_ai_request(text, msg_data)
            except Exception as e:
                print(f"OverlayChat: sendMessage error: {e}")

        elif msg_type == 'cancelRequest':
            if self._current_thread:
                try:
                    self._current_thread.cancel()
                except Exception:
                    pass
                self._current_thread = None
                self._send_to_react({"type": "loading", "loading": False})

        elif msg_type == 'closeOverlay':
            self.hide_overlay()

    def _send_to_react(self, payload):
        """Send a payload to the React app via window.ankiReceive."""
        if self.web_view:
            js = f"window.ankiReceive && window.ankiReceive({json.dumps(payload)});"
            self.web_view.page().runJavaScript(js)

    def _start_ai_request(self, text, msg_data):
        """Start an AI request using the same AIHandler as the main chat."""
        try:
            from ..ai.handler import get_ai_handler
        except ImportError:
            from ai.handler import get_ai_handler

        try:
            ai_handler = get_ai_handler()
            if not hasattr(ai_handler, 'get_response_with_rag'):
                self._send_to_react({"type": "error", "message": "AI handler does not support RAG responses"})
                self._send_to_react({"type": "loading", "loading": False})
                return

            try:
                context = self._build_context()
            except Exception as e:
                context = "Du bist ein hilfreicher Lernassistent für Anki-Karteikarten."

            self._streaming_text = ''
            self._send_to_react({"type": "loading", "loading": True})

            from aqt.qt import QThread

            class FreeChatThread(QThread):
                chunk_signal = pyqtSignal(str, str, bool, bool)
                finished_signal = pyqtSignal(str)
                error_signal = pyqtSignal(str, str)

                def __init__(self, handler, text, context, history, mode):
                    super().__init__()
                    self.handler = handler
                    self.text = text
                    self.context = context
                    self.history = history
                    self.mode = mode
                    self.request_id = f"fc-{int(time.time()*1000)}"
                    self._cancelled = False

                def cancel(self):
                    self._cancelled = True

                def run(self):
                    try:
                        def stream_callback(chunk, done, is_function_call=False, steps=None, citations=None, step_labels=None):
                            if self._cancelled:
                                return
                            self.chunk_signal.emit(self.request_id, chunk or "", done, is_function_call)

                        self.handler.get_response_with_rag(
                            self.text, context=self.context, history=self.history,
                            mode=self.mode, callback=stream_callback
                        )

                        if not self._cancelled:
                            self.finished_signal.emit(self.request_id)
                    except Exception as e:
                        if not self._cancelled:
                            self.error_signal.emit(self.request_id, str(e))
                    finally:
                        if hasattr(self.handler, '_pipeline_signal_callback'):
                            self.handler._pipeline_signal_callback = None

            db_messages = load_deck_messages(0, limit=20)
            history = [
                {'role': 'assistant' if m.get('sender') == 'assistant' else 'user',
                 'content': m.get('text', '')}
                for m in db_messages
            ]

            mode = msg_data.get('mode', 'compact') if isinstance(msg_data, dict) else 'compact'
            thread = FreeChatThread(ai_handler, text, context, history, mode)
            thread.chunk_signal.connect(self._on_chunk)
            thread.finished_signal.connect(self._on_ai_done)
            thread.error_signal.connect(self._on_ai_error)
            thread.finished.connect(thread.deleteLater)
            self._current_thread = thread
            thread.start()

        except Exception as e:
            self._send_to_react({"type": "error", "message": str(e)})
            self._send_to_react({"type": "loading", "loading": False})

    def _on_chunk(self, request_id, chunk, done, is_function_call):
        if chunk:
            self._streaming_text += chunk
            self._send_to_react({"type": "streaming", "chunk": chunk})

    def _on_ai_done(self, request_id):
        self._send_to_react({
            "type": "bot",
            "message": self._streaming_text,
            "citations": {}
        })
        self._send_to_react({"type": "loading", "loading": False})
        self._streaming_text = ''
        self._current_thread = None

    def _on_ai_error(self, request_id, error):
        self._send_to_react({"type": "error", "message": error})
        self._send_to_react({"type": "loading", "loading": False})
        self._streaming_text = ''
        self._current_thread = None

    def _build_context(self):
        """Build deck-level context (no card context)."""
        import datetime
        today = datetime.date.today().strftime('%A, %d. %B %Y')
        lines = [
            "Du bist ein hilfreicher Lernassistent für Anki-Karteikarten.",
            f"Heute ist {today}.",
        ]
        try:
            total = mw.col.card_count() if hasattr(mw.col, 'card_count') else 0
            lines.append(f"Der Nutzer hat {total} Karten in seiner Sammlung.")
        except Exception:
            pass
        return "\n".join(lines)

    # ── Show / Hide ──────────────────────────────────────────────────

    def show_overlay(self, initial_text=''):
        """Show the overlay with a fade-in animation."""
        if self._visible:
            if initial_text:
                self._send_to_react({"type": "initialText", "text": initial_text})
            return

        self._visible = True
        self._position_over_main()
        self.show()
        self.raise_()

        if hasattr(self, 'message_timer') and self.message_timer:
            self.message_timer.start(200)

        if self.parent():
            self.parent().installEventFilter(self)

        QTimer.singleShot(50, lambda: self._send_to_react({
            "type": "overlayShow",
            "initialText": initial_text or ''
        }))

    def hide_overlay(self):
        """Hide the overlay with a fade-out animation."""
        if not self._visible:
            return
        self._visible = False
        if hasattr(self, 'message_timer') and self.message_timer:
            self.message_timer.stop()
        self._send_to_react({"type": "overlayHide"})
        if self.parent():
            self.parent().removeEventFilter(self)
        QTimer.singleShot(300, self.hide)

    def _position_over_main(self):
        """Position this widget exactly over Anki's main content area."""
        try:
            main_widget = mw.centralWidget()
            if main_widget:
                pos = main_widget.mapTo(mw, QPoint(0, 0))
                self.setGeometry(pos.x(), pos.y(), main_widget.width(), main_widget.height())
            else:
                self.setGeometry(mw.rect())
        except Exception:
            self.setGeometry(mw.rect())

    def eventFilter(self, obj, event):
        """Reposition overlay when parent resizes."""
        if event.type() == event.Type.Resize and self._visible:
            self._position_over_main()
        return super().eventFilter(obj, event)


# ── Singleton access ─────────────────────────────────────────────────

_overlay_instance = None

def get_overlay():
    """Get or create the singleton overlay widget."""
    global _overlay_instance
    if _overlay_instance is None:
        _overlay_instance = OverlayChatWidget(mw)
    return _overlay_instance

def show_overlay_chat(initial_text=''):
    """Show the overlay chat, optionally with initial text."""
    overlay = get_overlay()
    overlay.show_overlay(initial_text)

def hide_overlay_chat():
    """Hide the overlay chat."""
    overlay = get_overlay()
    overlay.hide_overlay()
