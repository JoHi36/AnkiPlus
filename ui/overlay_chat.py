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
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

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
        self._streaming_text = ''
        self._visible = False
        self._chat_open = False
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
        self.message_timer.start(100)

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
            logger.error("OverlayChat: message parse error: %s", e)

    def _route_message(self, msg_type, data):
        """Route messages from React to appropriate handlers."""
        if msg_type == 'loadDeckMessages':
            deck_id = int(data) if isinstance(data, (int, str)) else 0
            try:
                messages = load_deck_messages(deck_id, limit=50)
                payload = {"type": "deckMessagesLoaded", "deckId": deck_id, "messages": messages}
                self._send_to_react(payload)
            except Exception as e:
                logger.error("OverlayChat: loadDeckMessages error: %s", e)

        elif msg_type == 'saveDeckMessage':
            try:
                msg_data = json.loads(data) if isinstance(data, str) else data
                save_deck_message(int(msg_data.get('deckId', 0)), msg_data.get('message', {}))
            except Exception as e:
                logger.error("OverlayChat: saveDeckMessage error: %s", e)

        elif msg_type == 'sendMessage':
            try:
                msg_data = json.loads(data) if isinstance(data, str) else data
                text = msg_data.get('text', '')
                if text.strip():
                    self._start_ai_request(text, msg_data)
            except Exception as e:
                logger.error("OverlayChat: sendMessage error: %s", e)

        elif msg_type == 'cancelRequest':
            try:
                from ..ai.request_manager import get_request_manager
            except ImportError:
                from ai.request_manager import get_request_manager
            get_request_manager().cancel()
            self._send_to_react({"type": "loading", "loading": False})

        elif msg_type == 'closeOverlay':
            self.hide_overlay()

        elif msg_type == 'clearDeckMessages':
            try:
                from ..storage.card_sessions import clear_deck_messages
            except ImportError:
                from storage.card_sessions import clear_deck_messages
            try:
                count = clear_deck_messages()
                self._send_to_react({"type": "deckMessagesCleared", "count": count})
            except Exception as e:
                logger.error("OverlayChat: clearDeckMessages error: %s", e)

        elif msg_type == 'switchTab':
            tab = data if isinstance(data, str) else ''
            self.hide_overlay()
            if tab == 'session':
                QTimer.singleShot(350, lambda: mw.onOverview() if hasattr(mw, 'onOverview') else None)
            elif tab == 'statistik':
                QTimer.singleShot(350, lambda: self._open_stats())

        elif msg_type == 'toggleSidebar':
            try:
                from .settings_sidebar import toggle_settings_sidebar
                toggle_settings_sidebar()
            except Exception as e:
                logger.warning("Could not toggle sidebar: %s", e)

        elif msg_type == 'textFieldFocus':
            try:
                from .shortcut_filter import get_shortcut_filter
                sf = get_shortcut_filter()
                if sf:
                    data_parsed = json.loads(data) if isinstance(data, str) else data
                    sf.set_text_field_focus(data_parsed.get('focused', False), self.web_view)
            except Exception as e:
                logger.warning("Could not set text field focus: %s", e)

    def _open_stats(self):
        """Open stats window."""
        try:
            from aqt.stats import NewDeckStats
            NewDeckStats(mw)
        except Exception:
            pass

    def _send_to_react(self, payload):
        """Send a payload to the React app via window.ankiReceive."""
        if self.web_view:
            js = f"window.ankiReceive && window.ankiReceive({json.dumps(payload)});"
            self.web_view.page().runJavaScript(js)

    def _start_ai_request(self, text, msg_data):
        """Start an AI request via shared AIRequestManager."""
        try:
            from ..ai.request_manager import get_request_manager
        except ImportError:
            from ai.request_manager import get_request_manager

        try:
            context = self._build_context()
        except Exception:
            context = "Du bist ein hilfreicher Lernassistent für Anki-Karteikarten."

        db_messages = load_deck_messages(0, limit=20)
        history = [
            {'role': 'assistant' if m.get('sender') == 'assistant' else 'user',
             'content': m.get('text', '')}
            for m in db_messages
        ]
        mode = msg_data.get('mode', 'compact') if isinstance(msg_data, dict) else 'compact'

        self._streaming_text = ''
        self._send_to_react({"type": "loading", "loading": True})

        manager = get_request_manager()
        manager.start_request(
            text=text, context=context, history=history, mode=mode,
            caller_id='overlay',
            callbacks={
                'on_chunk': self._on_chunk,
                'on_finished': self._on_ai_done,
                'on_error': self._on_ai_error,
            }
        )

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

    def _on_ai_error(self, request_id, error):
        self._send_to_react({"type": "error", "message": error})
        self._send_to_react({"type": "loading", "loading": False})
        self._streaming_text = ''

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
        self._chat_open = True

        if self._visible:
            if initial_text:
                self._send_to_react({"type": "initialText", "text": initial_text})
            return

        self._visible = True
        self._position_over_main()
        self.show()
        self.raise_()

        if hasattr(self, 'message_timer') and self.message_timer:
            self.message_timer.start(100)

        if self.parent():
            self.parent().installEventFilter(self)

        # Notify shortcut filter
        try:
            from .shortcut_filter import get_shortcut_filter
            sf = get_shortcut_filter()
            if sf and hasattr(sf, 'set_overlay_visible'):
                sf.set_overlay_visible(True)
        except Exception:
            pass

        header_info = self._get_header_info()

        QTimer.singleShot(50, lambda: self._send_to_react({
            "type": "overlayShow",
            "initialText": initial_text or '',
            "headerInfo": header_info,
        }))

    def _get_header_info(self):
        """Get deck stats for the overlay header."""
        try:
            if mw and mw.col:
                tree = mw.col.sched.deck_due_tree()
                total_new = sum(n.new_count for n in tree.children)
                total_lrn = sum(n.learn_count for n in tree.children)
                total_rev = sum(n.review_count for n in tree.children)
                return {
                    'totalDue': total_new + total_lrn + total_rev,
                    'dueNew': total_new,
                    'dueLearning': total_lrn,
                    'dueReview': total_rev,
                }
        except Exception as e:
            logger.warning("Could not get header info: %s", e)
        return {'totalDue': 0, 'dueNew': 0, 'dueLearning': 0, 'dueReview': 0}

    def hide_overlay(self):
        """Hide the overlay. User explicitly closed."""
        if not self._visible:
            return
        self._visible = False
        self._chat_open = False

        try:
            from ..ai.request_manager import get_request_manager
        except ImportError:
            from ai.request_manager import get_request_manager
        get_request_manager().cancel()

        # Notify shortcut filter
        try:
            from .shortcut_filter import get_shortcut_filter
            sf = get_shortcut_filter()
            if sf and hasattr(sf, 'set_overlay_visible'):
                sf.set_overlay_visible(False)
        except Exception:
            pass

        if hasattr(self, 'message_timer') and self.message_timer:
            self.message_timer.stop()
        self._send_to_react({"type": "overlayHide"})
        if self.parent():
            self.parent().removeEventFilter(self)
        QTimer.singleShot(300, self.hide)

    def hide_for_tab_switch(self):
        """Hide overlay temporarily (tab switch). Preserves _chat_open for restore."""
        if not self._visible:
            return
        self._visible = False

        try:
            from ..ai.request_manager import get_request_manager
        except ImportError:
            from ai.request_manager import get_request_manager
        get_request_manager().cancel()

        try:
            from .shortcut_filter import get_shortcut_filter
            sf = get_shortcut_filter()
            if sf and hasattr(sf, 'set_overlay_visible'):
                sf.set_overlay_visible(False)
        except Exception:
            pass

        if hasattr(self, 'message_timer') and self.message_timer:
            self.message_timer.stop()
        self._send_to_react({"type": "overlayHide"})
        if self.parent():
            self.parent().removeEventFilter(self)
        QTimer.singleShot(300, self.hide)

    def restore_if_open(self):
        """Called when returning to Stapel tab. Restore overlay if chat was open."""
        if self._chat_open:
            self.show_overlay()

    def _position_over_main(self):
        """Position this widget exactly over Anki's main webview (mw.web)."""
        try:
            web = mw.web if hasattr(mw, 'web') else None
            if web:
                pos = web.mapTo(mw, QPoint(0, 0))
                self.setGeometry(pos.x(), pos.y(), web.width(), web.height())
            else:
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
