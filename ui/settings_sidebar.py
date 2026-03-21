"""Settings sidebar — left-side QDockWidget with inline HTML/CSS/JS."""

import json
import platform

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
from PyQt6.QtWebChannel import QWebChannel
from PyQt6.QtCore import Qt, QUrl, QObject, pyqtSlot
from PyQt6.QtGui import QColor


# ---------------------------------------------------------------------------
# SidebarBridge — QWebChannel bridge
# ---------------------------------------------------------------------------

class SidebarBridge(QObject):
    """Bridge between sidebar JS and Python backend."""

    @pyqtSlot(result=str)
    def getStatus(self):
        """Return JSON with tier, theme, planName, price, isAuthenticated."""
        try:
            config = get_config()
            theme = config.get("theme", "dark")
            auth_token = config.get("auth_token", "")
            auth_validated = config.get("auth_validated", False)
            is_authenticated = bool(auth_token and auth_validated)

            if is_authenticated:
                tier = config.get("tier", "free")
            else:
                tier = "free"

            plan_map = {
                "free": ("Starter", "Kostenlos"),
                "tier1": ("Student", "4,99\u20ac / Monat"),
                "tier2": ("Exam Pro", "14,99\u20ac / Monat"),
            }
            plan_name, price = plan_map.get(tier, plan_map["free"])

            return json.dumps({
                "tier": tier,
                "theme": theme,
                "planName": plan_name,
                "price": price,
                "isAuthenticated": is_authenticated,
            })
        except Exception:
            logger.exception("SidebarBridge.getStatus failed")
            return json.dumps({
                "tier": "free",
                "theme": "dark",
                "planName": "Starter",
                "price": "Kostenlos",
                "isAuthenticated": False,
            })

    @pyqtSlot(str)
    def setTheme(self, theme):
        """Update theme everywhere instantly."""
        try:
            from ..config import update_config
        except ImportError:
            from config import update_config
        update_config(theme=theme)
        logger.info("Theme changed to %s", theme)

        # 1. Apply global Qt theme
        try:
            from ..ui.global_theme import apply_global_dark_theme
            apply_global_dark_theme()
        except Exception as e:
            logger.warning("Could not apply global theme: %s", e)

        # 2. Refresh custom screens (deck browser / overview)
        try:
            from ..ui.custom_screens import refresh_current_screen
            refresh_current_screen()
        except Exception as e:
            logger.warning("Could not refresh custom screens: %s", e)

        # 3. Update sidebar's own data-theme attribute
        try:
            global _sidebar_dock
            if _sidebar_dock and _sidebar_dock.widget():
                web = _sidebar_dock.widget().findChild(QWebEngineView)
                if web:
                    attr = 'light' if theme == 'light' else 'dark'
                    web.page().runJavaScript(
                        f"document.documentElement.setAttribute('data-theme','{attr}');"
                    )
        except Exception as e:
            logger.warning("Could not update sidebar theme: %s", e)

        # 4. Update chat panel theme
        try:
            from ..ui.setup import get_chatbot_widget
            widget = get_chatbot_widget()
            if widget and widget.web_view:
                import json as _json
                payload = _json.dumps({"type": "themeChanged", "data": {"theme": theme}})
                widget.web_view.page().runJavaScript(
                    f"window.ankiReceive && window.ankiReceive({payload});"
                )
        except Exception as e:
            logger.warning("Could not update chat theme: %s", e)

        # 5. Update sidebar dock stylesheet for Qt
        try:
            from ..ui.theme import get_resolved_theme
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

    @pyqtSlot()
    def openNativeSettings(self):
        """Open Anki's native preferences dialog."""
        try:
            from aqt import mw
            if mw:
                mw.onPrefs()
        except Exception as e:
            logger.exception("Error opening Anki preferences: %s", e)

    @pyqtSlot()
    def openUpgradePage(self):
        """Open the landing page pricing section in the default browser."""
        import webbrowser
        webbrowser.open('https://anki-plus.vercel.app/#pricing')

    @pyqtSlot()
    def copyLogs(self):
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
            logs = get_recent_logs(max_age_seconds=600)  # Last 10 minutes
            text = header + "\n".join(logs) if logs else header + "(keine Logs)"
            clipboard = QApplication.clipboard()
            if clipboard:
                clipboard.setText(text)
                logger.info("Logs copied to clipboard (%d lines)", len(logs))
        except Exception:
            logger.exception("SidebarBridge.copyLogs failed")

    @pyqtSlot()
    def logout(self):
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
            logger.exception("SidebarBridge.logout failed")

    @pyqtSlot()
    def closeSidebar(self):
        """Hide the sidebar."""
        toggle_settings_sidebar()


# ---------------------------------------------------------------------------
# HTML builder
# ---------------------------------------------------------------------------

def _build_sidebar_html():
    """Build complete inline HTML document for the settings sidebar."""
    return """<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<style>
:root {
  --ds-bg-deep:          #141416;
  --ds-bg-canvas:        #1C1C1E;
  --ds-text-primary:     rgba(255,255,255,0.92);
  --ds-text-secondary:   rgba(255,255,255,0.55);
  --ds-text-tertiary:    rgba(255,255,255,0.35);
  --ds-text-muted:       rgba(255,255,255,0.18);
  --ds-border-subtle:    rgba(255,255,255,0.06);
  --ds-accent:           #0A84FF;
  --ds-hover-tint:       rgba(255,255,255,0.04);
  --ds-active-tint:      rgba(255,255,255,0.08);
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: var(--ds-bg-deep);
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  color: var(--ds-text-primary);
  overflow-y: auto;
  overflow-x: hidden;
  height: 100vh;
  padding: 16px 14px;
}

body::-webkit-scrollbar { width: 0; }

/* --- Status Card --- */
.status-card {
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 20px;
}
.status-card.tier-free {
  background: linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%);
  border: 1px solid rgba(255,255,255,0.06);
}
.status-card.tier-tier1 {
  background: linear-gradient(135deg, rgba(10,132,255,0.07) 0%, rgba(10,132,255,0.03) 100%);
  border: 1px solid rgba(10,132,255,0.12);
}
.status-card.tier-tier2 {
  background: linear-gradient(135deg, rgba(168,85,247,0.07) 0%, rgba(168,85,247,0.03) 100%);
  border: 1px solid rgba(168,85,247,0.12);
}

.plan-label {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ds-text-tertiary);
  margin-bottom: 4px;
}

.plan-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 10px;
}

.plan-name {
  font-size: 18px;
  font-weight: 700;
  color: var(--ds-text-primary);
}

.plan-price {
  font-size: 11px;
  color: var(--ds-text-tertiary);
}

.token-bar-track {
  width: 100%;
  height: 3px;
  background: rgba(255,255,255,0.06);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 6px;
}

.token-bar-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--ds-accent);
  transition: width 0.4s ease;
}

.token-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.token-pct {
  font-size: 10px;
  color: var(--ds-text-tertiary);
}

.upgrade-link {
  font-size: 11px;
  font-weight: 600;
  color: var(--ds-accent);
  cursor: pointer;
  text-decoration: none;
  transition: opacity 0.15s;
}
.upgrade-link:hover { opacity: 0.8; }

/* --- Sections --- */
.section-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ds-text-muted);
  margin-bottom: 10px;
}

/* --- Theme Toggle --- */
.theme-toggle {
  display: flex;
  background: rgba(255,255,255,0.04);
  border-radius: 8px;
  padding: 3px;
  margin-bottom: 20px;
}

.theme-btn {
  flex: 1;
  text-align: center;
  font-size: 11px;
  font-weight: 500;
  color: var(--ds-text-tertiary);
  padding: 6px 0;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;
  background: transparent;
  font-family: inherit;
}

.theme-btn:hover {
  color: var(--ds-text-secondary);
}

.theme-btn.active {
  background: rgba(255,255,255,0.08);
  color: var(--ds-text-primary);
}

/* --- Divider --- */
.divider {
  height: 1px;
  background: var(--ds-border-subtle);
  margin-bottom: 16px;
}

/* --- Action Rows --- */
.action-row {
  display: flex;
  align-items: center;
  padding: 8px 6px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
  margin-bottom: 4px;
}
.action-row:hover {
  background: var(--ds-hover-tint);
}

.action-icon {
  width: 16px;
  height: 16px;
  margin-right: 10px;
  flex-shrink: 0;
}
.action-icon svg {
  width: 16px;
  height: 16px;
  stroke: var(--ds-text-tertiary);
  fill: none;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.action-text {
  flex: 1;
  font-size: 13px;
  color: var(--ds-text-secondary);
}

.action-sub {
  font-size: 10px;
  color: var(--ds-text-muted);
}

.action-chevron svg {
  width: 14px;
  height: 14px;
  stroke: var(--ds-text-muted);
  fill: none;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* --- Logout --- */
.logout-btn {
  display: none;
  width: 100%;
  text-align: center;
  font-size: 13px;
  font-weight: 500;
  color: rgba(255,59,48,0.6);
  padding: 10px 0;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  border: none;
  background: transparent;
  font-family: inherit;
  margin-top: 4px;
}
.logout-btn:hover {
  background: rgba(255,59,48,0.06);
  color: rgba(255,59,48,0.8);
}
.logout-btn.visible { display: block; }

/* --- Light Mode --- */
html[data-theme="light"] {
  --ds-bg-deep:          #ECECF0;
  --ds-bg-canvas:        #FFFFFF;
  --ds-text-primary:     rgba(0,0,0,0.88);
  --ds-text-secondary:   rgba(0,0,0,0.55);
  --ds-text-tertiary:    rgba(0,0,0,0.35);
  --ds-text-muted:       rgba(0,0,0,0.18);
  --ds-border-subtle:    rgba(0,0,0,0.06);
  --ds-accent:           #007AFF;
  --ds-hover-tint:       rgba(0,0,0,0.03);
  --ds-active-tint:      rgba(0,0,0,0.06);
}

html[data-theme="light"] .status-card.tier-free {
  background: linear-gradient(135deg, rgba(0,0,0,0.03), rgba(0,0,0,0.01));
  border-color: rgba(0,0,0,0.06);
}
html[data-theme="light"] .status-card.tier-tier1 {
  background: linear-gradient(135deg, rgba(0,122,255,0.06), rgba(0,122,255,0.02));
  border-color: rgba(0,122,255,0.1);
}
html[data-theme="light"] .status-card.tier-tier2 {
  background: linear-gradient(135deg, rgba(168,85,247,0.06), rgba(168,85,247,0.02));
  border-color: rgba(168,85,247,0.1);
}
html[data-theme="light"] .plan-label { color: rgba(0,0,0,0.25); }
html[data-theme="light"] .plan-name { color: rgba(0,0,0,0.85); }
html[data-theme="light"] .plan-price { color: rgba(0,0,0,0.35); }
html[data-theme="light"] .token-bar-track { background: rgba(0,0,0,0.06); }
html[data-theme="light"] .token-pct { color: rgba(0,0,0,0.3); }
html[data-theme="light"] .section-label { color: rgba(0,0,0,0.2); }
html[data-theme="light"] .theme-toggle { background: rgba(0,0,0,0.04); }
html[data-theme="light"] .theme-btn { color: rgba(0,0,0,0.35); }
html[data-theme="light"] .theme-btn.active { color: rgba(0,0,0,0.85); background: rgba(0,0,0,0.06); }
html[data-theme="light"] .action-text { color: rgba(0,0,0,0.55); }
html[data-theme="light"] .action-icon svg { stroke: rgba(0,0,0,0.35); }
html[data-theme="light"] .action-sub { color: rgba(0,0,0,0.15); }
html[data-theme="light"] .action-chevron svg { stroke: rgba(0,0,0,0.15); }
html[data-theme="light"] .logout-btn { color: rgba(255,59,48,0.7); }
html[data-theme="light"] .logout-btn:hover { background: rgba(255,59,48,0.06); color: rgba(255,59,48,0.9); }

</style>
</head>
<body>

<!-- Status Card -->
<div class="status-card tier-free" id="status-card">
  <div class="plan-label">DEIN PLAN</div>
  <div class="plan-row">
    <span class="plan-name" id="plan-name">Starter</span>
    <span class="plan-price" id="plan-price">Kostenlos</span>
  </div>
  <div class="token-bar-track">
    <div class="token-bar-fill" id="token-bar-fill" style="width:0%"></div>
  </div>
  <div class="token-info">
    <span class="token-pct" id="token-pct">0%</span>
    <span class="upgrade-link" id="upgrade-link" onclick="handleUpgrade()">Upgrade &rarr;</span>
  </div>
</div>

<!-- Theme -->
<div class="section-label">Erscheinungsbild</div>
<div class="theme-toggle" id="theme-toggle">
  <button class="theme-btn" data-theme="system" onclick="setTheme('system')">System</button>
  <button class="theme-btn" data-theme="dark" onclick="setTheme('dark')">Dunkel</button>
  <button class="theme-btn" data-theme="light" onclick="setTheme('light')">Hell</button>
</div>

<div class="divider"></div>

<!-- Actions -->
<div class="action-row" onclick="bridge.openNativeSettings()">
  <div class="action-icon">
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="3"></circle>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
    </svg>
  </div>
  <span class="action-text">Anki-Einstellungen</span>
  <div class="action-chevron">
    <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>
  </div>
</div>

<div class="action-row" onclick="bridge.copyLogs()">
  <div class="action-icon">
    <svg viewBox="0 0 24 24">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
  </div>
  <span class="action-text">Logs kopieren</span>
  <span class="action-sub">Debug-Info</span>
</div>

<div class="divider" style="margin-top:12px"></div>

<button class="logout-btn" id="logout-btn" onclick="bridge.logout()">Abmelden</button>

<script src="qrc:///qtwebchannel/qwebchannel.js"></script>
<script>
var bridge = null;

function loadStatus() {
    if (!bridge) return;
    bridge.getStatus(function(raw) {
        try {
            var s = JSON.parse(raw);

            // Status card tier class
            var card = document.getElementById('status-card');
            card.className = 'status-card tier-' + s.tier;

            // Plan info
            document.getElementById('plan-name').textContent = s.planName;
            document.getElementById('plan-price').textContent = s.price;

            // Upgrade link text
            var link = document.getElementById('upgrade-link');
            link.textContent = (s.tier === 'free') ? 'Upgrade \\u2192' : 'Abo verwalten \\u2192';

            // Theme buttons + data-theme attribute
            var btns = document.querySelectorAll('.theme-btn');
            btns.forEach(function(b) {
                b.classList.toggle('active', b.getAttribute('data-theme') === s.theme);
            });
            document.documentElement.setAttribute('data-theme', s.theme === 'light' ? 'light' : 'dark');

            // Logout visibility
            var logoutBtn = document.getElementById('logout-btn');
            logoutBtn.classList.toggle('visible', s.isAuthenticated);
        } catch(e) {
            console.error('loadStatus parse error', e);
        }
    });
}

function setTheme(theme) {
    var btns = document.querySelectorAll('.theme-btn');
    btns.forEach(function(b) {
        b.classList.toggle('active', b.getAttribute('data-theme') === theme);
    });
    document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
    if (bridge) bridge.setTheme(theme);
}

function updateTokens(used, limit) {
    var pct = limit > 0 ? Math.round((used / limit) * 100) : 0;
    var fill = document.getElementById('token-bar-fill');
    if (fill) fill.style.width = pct + '%';
    var text = document.getElementById('token-pct');
    if (text) text.textContent = pct + '%';
}

function handleUpgrade() {
    if (bridge) bridge.openUpgradePage();
}

// Init QWebChannel
new QWebChannel(qt.webChannelTransport, function(channel) {
    bridge = channel.objects.sidebarBridge;
    loadStatus();
});
</script>
</body></html>"""


# ---------------------------------------------------------------------------
# Module-level state
# ---------------------------------------------------------------------------

_sidebar_dock = None
_sidebar_webview = None
_sidebar_bridge = None
_sidebar_channel = None
_sidebar_open = False

SIDEBAR_WIDTH = 240


def _create_sidebar():
    """Create the settings sidebar QDockWidget (starts hidden)."""
    global _sidebar_dock, _sidebar_webview, _sidebar_bridge, _sidebar_channel

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

    # Set up QWebChannel
    _sidebar_bridge = SidebarBridge()
    _sidebar_channel = QWebChannel()
    _sidebar_channel.registerObject("sidebarBridge", _sidebar_bridge)
    _sidebar_webview.page().setWebChannel(_sidebar_channel)

    _sidebar_webview.setHtml(_build_sidebar_html(), QUrl("file:///"))
    layout.addWidget(_sidebar_webview)

    _sidebar_dock.setWidget(container)
    mw.addDockWidget(Qt.DockWidgetArea.LeftDockWidgetArea, _sidebar_dock)

    _sidebar_dock.setMinimumWidth(SIDEBAR_WIDTH)
    _sidebar_dock.setMaximumWidth(SIDEBAR_WIDTH)

    _sidebar_dock.hide()
    logger.info("Settings sidebar created")


def toggle_settings_sidebar():
    """Toggle the settings sidebar — instant show/hide, no Qt width animation."""
    global _sidebar_dock, _sidebar_webview, _sidebar_open

    if _sidebar_dock is None:
        _create_sidebar()

    _sidebar_open = not _sidebar_open

    if _sidebar_open:
        _sidebar_dock.setMinimumWidth(SIDEBAR_WIDTH)
        _sidebar_dock.setMaximumWidth(SIDEBAR_WIDTH)
        _sidebar_dock.show()
        # Refresh status on open
        try:
            if _sidebar_webview:
                _sidebar_webview.page().runJavaScript(
                    "if(typeof loadStatus==='function') loadStatus();"
                )
        except Exception:
            pass
    else:
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
    except Exception:
        pass


def is_sidebar_visible():
    """Return True if the settings sidebar is currently visible."""
    return _sidebar_open
