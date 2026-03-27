"""Settings sidebar — left-side QDockWidget loading React from web/index.html?view=sidebar."""

import os
import json
import platform
import webbrowser
import time

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

try:
    from ..config import get_config, save_config
except ImportError:
    from config import get_config, save_config

try:
    from ..ui.tokens_qt import get_tokens as _get_qt_tokens
except ImportError:
    try:
        from ui.tokens_qt import get_tokens as _get_qt_tokens
    except ImportError:
        def _get_qt_tokens(theme="dark"):
            return {"bg_deep": "#141416", "bg_canvas": "#1C1C1E"}

_QT_TOKENS = _get_qt_tokens("dark")

from aqt import mw
from PyQt6.QtWidgets import QDockWidget, QWidget, QVBoxLayout, QApplication
from PyQt6.QtWebEngineWidgets import QWebEngineView
from PyQt6.QtCore import Qt, QUrl, QTimer
from PyQt6.QtGui import QColor


# ---------------------------------------------------------------------------
# Module-level state
# ---------------------------------------------------------------------------

_sidebar_dock = None
_sidebar_webview = None
_sidebar_open = False
_message_timer = None

SIDEBAR_WIDTH = 240


# ---------------------------------------------------------------------------
# Message handlers (called by message queue polling)
# ---------------------------------------------------------------------------

def _handle_sidebar_message(msg_type, data):
    """Route sidebar messages from the React frontend."""
    handlers = {
        'sidebarGetStatus': _msg_get_status,
        'sidebarGetIndexingStatus': _msg_get_indexing_status,
        'sidebarSetTheme': _msg_set_theme,
        'sidebarOpenNativeSettings': _msg_open_native_settings,
        'sidebarCopyLogs': _msg_copy_logs,
        'sidebarOpenUpgrade': _msg_open_upgrade,
        'sidebarConnect': _msg_connect,
        'sidebarLogout': _msg_logout,
        'jsError': _msg_js_error,
    }
    handler = handlers.get(msg_type)
    if handler:
        try:
            handler(data)
        except Exception as e:
            logger.exception("Sidebar message handler error for %s: %s", msg_type, e)
        return True
    return False


def _send_to_sidebar(payload_type, data):
    """Send a message to the sidebar React frontend via ankiReceive."""
    global _sidebar_webview
    if not _sidebar_webview:
        return
    payload = json.dumps({"type": payload_type, "data": data}, ensure_ascii=False)
    _sidebar_webview.page().runJavaScript(
        f"window.ankiReceive && window.ankiReceive({payload});"
    )


def _msg_get_status(_data):
    """Return status to React: tier, theme, auth, tokens."""
    try:
        config = get_config()
        theme = config.get("theme", "dark")
        auth_token = config.get("auth_token", "")
        auth_validated = config.get("auth_validated", False)
        is_authenticated = bool(auth_token and auth_validated)
        tier = "free"
        token_used = 0
        token_limit = 0

        # Fetch quota from backend if authenticated
        if is_authenticated:
            try:
                from ..config import get_backend_url
            except ImportError:
                from config import get_backend_url
            backend_url = get_backend_url()
            if backend_url and auth_token:
                import requests as _requests
                try:
                    resp = _requests.get(
                        '%s/user/quota' % backend_url.rstrip('/'),
                        headers={'Authorization': 'Bearer %s' % auth_token.strip()},
                        timeout=5,
                    )
                    if resp.status_code == 200:
                        quota_data = resp.json()
                        tier = quota_data.get('tier', 'free')
                        # Backend format: { tier, tokens: { daily: { used, limit } } }
                        tokens = quota_data.get('tokens', {})
                        daily = tokens.get('daily', {})
                        token_used = daily.get('used', 0)
                        token_limit = daily.get('limit', 0)
                        # Cache tier in config for other handlers
                        try:
                            from ..config import update_config
                        except ImportError:
                            from config import update_config
                        update_config(tier=tier)
                except Exception as e:
                    logger.warning("_msg_get_status: quota fetch failed: %s", e)

        _send_to_sidebar("sidebarStatus", {
            "tier": tier,
            "theme": theme,
            "isAuthenticated": is_authenticated,
            "tokenUsed": token_used,
            "tokenLimit": token_limit,
        })
    except Exception:
        logger.exception("_msg_get_status failed")
        _send_to_sidebar("sidebarStatus", {
            "tier": "free",
            "theme": "dark",
            "isAuthenticated": False,
            "tokenUsed": 0,
            "tokenLimit": 0,
        })


def _msg_set_theme(theme):
    """Update theme everywhere instantly."""
    if not isinstance(theme, str):
        return

    try:
        from ..config import update_config
    except ImportError:
        from config import update_config
    update_config(theme=theme)
    logger.info("Theme changed to %s via sidebar", theme)

    # 1. Apply global Qt theme
    try:
        from ..ui.global_theme import apply_global_dark_theme
        apply_global_dark_theme()
    except Exception as e:
        logger.warning("Could not apply global theme: %s", e)

    # 2. Refresh MainViewWidget (deck browser / overview) to pick up theme change
    try:
        from ..ui.main_view import get_main_view
        view = get_main_view()
        if view and view.web_view:
            payload = json.dumps({"type": "themeChanged", "data": {"theme": theme}})
            view.web_view.page().runJavaScript(
                f"window.ankiReceive && window.ankiReceive({payload});"
            )
    except Exception as e:
        logger.warning("Could not refresh main view: %s", e)

    # 3. Update chat panel theme
    try:
        from ..ui.setup import get_chatbot_widget
        widget = get_chatbot_widget()
        if widget and widget.web_view:
            payload = json.dumps({"type": "themeChanged", "data": {"theme": theme}})
            widget.web_view.page().runJavaScript(
                f"window.ankiReceive && window.ankiReceive({payload});"
            )
    except Exception as e:
        logger.warning("Could not update chat theme: %s", e)

    # 4. Update sidebar dock stylesheet for Qt
    try:
        resolved = 'light' if theme == 'light' else 'dark'
        tokens = _get_qt_tokens(resolved)
        if _sidebar_dock:
            bg = tokens['bg_deep']
            _sidebar_dock.setStyleSheet(
                f"QDockWidget {{ background: {bg}; border: none; }}"
                f" QDockWidget > QWidget {{ background: {bg}; }}"
            )
    except Exception as e:
        logger.warning("Could not update sidebar dock stylesheet: %s", e)


def _msg_open_native_settings(_data):
    """Open Anki's native preferences dialog."""
    try:
        if mw:
            mw.onPrefs()
    except Exception:
        logger.exception("Error opening Anki preferences")


def _msg_open_upgrade(_data):
    """Open pricing or account management page."""
    config = get_config()
    auth_token = config.get("auth_token", "")
    is_authenticated = bool(auth_token and config.get("auth_validated", False))
    tier = config.get("tier", "free")

    if is_authenticated and tier != "free":
        # Paid user → account management
        webbrowser.open('https://anki-plus.vercel.app/account')
    else:
        # Free user → pricing page
        webbrowser.open('https://anki-plus.vercel.app/#pricing')


def _msg_connect(_data):
    """Start Link-Code auth flow — opens login page and polls for tokens."""
    try:
        from ..ui.bridge import WebBridge
    except ImportError:
        from ui.bridge import WebBridge

    # Find the active WebBridge instance and call startLinkAuth
    if mw and hasattr(mw, '_chatbot_widget') and mw._chatbot_widget:
        bridge = mw._chatbot_widget.bridge
        if bridge and hasattr(bridge, 'startLinkAuth'):
            bridge.startLinkAuth()
            return
    # Fallback: just open login page directly
    webbrowser.open('https://anki-plus.vercel.app/login')


def _msg_copy_logs(_data):
    """Copy recent logs + system info to clipboard."""
    try:
        from ..utils.logging import get_recent_logs
    except ImportError:
        from utils.logging import get_recent_logs

    try:
        config = get_config()
        header = (
            f"AnkiPlus Debug Report\n"
            f"Platform: {platform.platform()}\n"
            f"Python: {platform.python_version()}\n"
            f"Theme: {config.get('theme', 'dark')}\n"
            f"Tier: {config.get('tier', 'free')}\n"
            f"Auth: {config.get('auth_validated', False)}\n"
            f"{'=' * 60}\n"
        )
        logs = get_recent_logs(max_age_seconds=600)
        text = header + "\n".join(logs) if logs else header + "(keine Logs)"
        clipboard = QApplication.clipboard()
        if clipboard:
            clipboard.setText(text)
            logger.info("Logs copied to clipboard (%d lines)", len(logs))
        # Notify React
        _send_to_sidebar("sidebarLogsCopied", {})
    except Exception:
        logger.exception("_msg_copy_logs failed")


def _msg_get_indexing_status(_data):
    """Return embedding + KG term extraction status."""
    try:
        # KG terms status
        try:
            from ..storage.kg_store import get_graph_status
        except ImportError:
            from storage.kg_store import get_graph_status
        kg_status = get_graph_status()

        # Embedding status — count from card_sessions
        try:
            from ..storage.card_sessions import load_all_embeddings
        except ImportError:
            from storage.card_sessions import load_all_embeddings
        embedded_count = 0
        try:
            for _ in load_all_embeddings():
                embedded_count += 1
        except Exception:
            pass

        # Total cards from Anki
        total_cards = 0
        try:
            if mw and mw.col:
                total_cards = mw.col.card_count()
        except Exception:
            pass

        # KG term embeddings count (for fuzzy matching indicator)
        kg_total_terms = kg_status.get('totalTerms', 0)
        kg_embedded_terms = 0
        try:
            try:
                from ..storage.kg_store import get_unembedded_terms
            except ImportError:
                from storage.kg_store import get_unembedded_terms
            unembedded = len(get_unembedded_terms())
            kg_embedded_terms = max(0, kg_total_terms - unembedded)
        except Exception:
            pass

        _send_to_sidebar('indexingStatus', {
            'embeddings': {
                'total': total_cards,
                'done': embedded_count,
            },
            'kgTerms': {
                'total': total_cards,
                'done': kg_status.get('totalCards', 0),
                'totalTerms': kg_total_terms,
            },
            'kgTermEmbeddings': {
                'total': kg_total_terms,
                'done': kg_embedded_terms,
            },
        })
    except Exception:
        logger.exception("_msg_get_indexing_status failed")
        _send_to_sidebar('indexingStatus', {
            'embeddings': {'total': 0, 'done': 0},
            'kgTerms': {'total': 0, 'done': 0, 'totalTerms': 0},
            'kgTermEmbeddings': {'total': 0, 'done': 0},
        })


def _msg_js_error(data):
    """Log JavaScript errors from the sidebar React frontend."""
    if isinstance(data, dict):
        logger.error("Sidebar JS Error: %s\nStack: %s\nComponent: %s",
                      data.get('message', '?'), data.get('stack', ''), data.get('component', ''))
    else:
        logger.error("Sidebar JS Error: %s", data)


def _msg_logout(_data):
    """Clear auth tokens and hide sidebar."""
    try:
        config = get_config()
        config["auth_token"] = ""
        config["refresh_token"] = ""
        config["auth_validated"] = False
        save_config(config)
        logger.info("User logged out via sidebar")
        toggle_settings_sidebar()  # hide
    except Exception:
        logger.exception("_msg_logout failed")


# ---------------------------------------------------------------------------
# Message queue polling (same pattern as ChatbotWidget)
# ---------------------------------------------------------------------------

def _init_js_bridge():
    """Inject ankiBridge message queue into the sidebar QWebEngineView."""
    global _sidebar_webview, _message_timer
    if not _sidebar_webview:
        return

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
    console.log('ankiBridge initialisiert (Sidebar Message-Queue)');
    """
    _sidebar_webview.page().runJavaScript(js_code)
    logger.info("Sidebar JS bridge initialised (Message-Queue)")

    # Start polling
    _message_timer = QTimer()
    _message_timer.timeout.connect(_poll_messages)
    _message_timer.start(200)
    logger.info("Sidebar message polling started (200ms)")


def _poll_messages():
    """Poll the sidebar QWebEngineView for queued messages."""
    global _sidebar_webview
    if not _sidebar_webview:
        return

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
                _handle_sidebar_message(msg.get('type'), msg.get('data'))
        except Exception as e:
            logger.exception("Sidebar poll error: %s", e)

    _sidebar_webview.page().runJavaScript(js_code, handle_messages)


def _stop_polling():
    """Stop the message queue polling timer."""
    global _message_timer
    if _message_timer:
        _message_timer.stop()
        _message_timer = None


# ---------------------------------------------------------------------------
# QDockWidget creation & toggle
# ---------------------------------------------------------------------------

def _create_sidebar():
    """Create the settings sidebar QDockWidget (starts hidden)."""
    global _sidebar_dock, _sidebar_webview

    _sidebar_dock = QDockWidget("", mw)
    _sidebar_dock.setObjectName("settingsSidebarDock")
    _sidebar_dock.setTitleBarWidget(QWidget())  # hide title bar
    _sidebar_dock.setFeatures(
        QDockWidget.DockWidgetFeature.DockWidgetClosable
    )

    bg = _QT_TOKENS["bg_deep"]
    _sidebar_dock.setStyleSheet(f"""
        QDockWidget {{
            background: {bg};
            border: none;
        }}
        QDockWidget > QWidget {{
            background: {bg};
        }}
    """)

    container = QWidget()
    layout = QVBoxLayout(container)
    layout.setContentsMargins(0, 0, 0, 0)

    _sidebar_webview = QWebEngineView()
    _sidebar_webview.setStyleSheet(f"background: {bg};")
    _sidebar_webview.page().setBackgroundColor(QColor(bg))

    # Load React app with ?view=sidebar
    html_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)), "web", "index.html"
    )
    url = QUrl.fromLocalFile(html_path)
    url.setQuery(f"view=sidebar&v={int(time.time())}")
    _sidebar_webview.loadFinished.connect(_init_js_bridge)
    _sidebar_webview.load(url)

    layout.addWidget(_sidebar_webview)

    _sidebar_dock.setWidget(container)
    mw.addDockWidget(Qt.DockWidgetArea.LeftDockWidgetArea, _sidebar_dock)

    _sidebar_dock.setMinimumWidth(SIDEBAR_WIDTH)
    _sidebar_dock.setMaximumWidth(SIDEBAR_WIDTH)

    _sidebar_dock.hide()
    logger.info("Settings sidebar created (React)")


def toggle_settings_sidebar():
    """Toggle the settings sidebar — instant show/hide."""
    global _sidebar_dock, _sidebar_webview, _sidebar_open

    if _sidebar_dock is None:
        _create_sidebar()

    _sidebar_open = not _sidebar_open

    if _sidebar_open:
        _sidebar_dock.setMinimumWidth(SIDEBAR_WIDTH)
        _sidebar_dock.setMaximumWidth(SIDEBAR_WIDTH)
        # Reload to pick up fresh state on every open
        if _sidebar_webview:
            html_path = os.path.join(
                os.path.dirname(os.path.dirname(__file__)), "web", "index.html"
            )
            url = QUrl.fromLocalFile(html_path)
            url.setQuery(f"view=sidebar&v={int(time.time())}")
            _sidebar_webview.load(url)
        _sidebar_dock.show()
    else:
        _stop_polling()
        _sidebar_dock.hide()

    _rotate_toggle_button(_sidebar_open)


def _rotate_toggle_button(is_open):
    """Rotate the + button in the top-bar to indicate sidebar state."""
    try:
        deg = "45" if is_open else "0"
        js = (
            f"(function(){{ var el = document.getElementById('ap-sidebar-toggle');"
            f" if(el) el.style.transform = 'rotate({deg}deg)'; }})()"
        )
        if mw and mw.web:
            mw.web.page().runJavaScript(js)
    except (AttributeError, RuntimeError) as e:
        logger.debug("Could not rotate sidebar toggle button: %s", e)


def is_sidebar_visible():
    """Return True if the settings sidebar is currently visible."""
    return _sidebar_open
