"""Plusi diary panel — left-side QDockWidget with inline HTML/CSS/JS."""

import json
from datetime import datetime

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

try:
    from ..ui.tokens_qt import get_tokens as _get_qt_tokens
except ImportError:
    try:
        from ui.tokens_qt import get_tokens as _get_qt_tokens
    except ImportError:
        def _get_qt_tokens(theme="dark"):
            return {"bg_canvas": "#1C1C1E"}

_QT_TOKENS = _get_qt_tokens("dark")

from aqt import mw
from PyQt6.QtWidgets import QDockWidget, QWidget, QVBoxLayout
from PyQt6.QtWebEngineWidgets import QWebEngineView
from PyQt6.QtCore import Qt, QUrl, QTimer
from PyQt6.QtGui import QColor


PANEL_CSS_VARS = """
:root {
  --ds-bg-deep:          #141416;
  --ds-bg-canvas:        #1C1C1E;
  --ds-bg-frosted:       #161618;
  --ds-bg-overlay:       #3A3A3C;
  --ds-text-primary:     rgba(255, 255, 255, 0.92);
  --ds-text-secondary:   rgba(255, 255, 255, 0.55);
  --ds-text-tertiary:    rgba(255, 255, 255, 0.35);
  --ds-text-placeholder: rgba(255, 255, 255, 0.30);
  --ds-text-muted:       rgba(255, 255, 255, 0.18);
  --ds-border-subtle:    rgba(255, 255, 255, 0.06);
  --ds-border-medium:    rgba(255, 255, 255, 0.12);
  --ds-accent:           #0A84FF;
  --ds-hover-tint:       rgba(255, 255, 255, 0.04);
  --ds-active-tint:      rgba(255, 255, 255, 0.08);
}
"""

PANEL_CSS = """
body {
    margin: 0;
    padding: 0;
    background: var(--ds-bg-canvas);
    font-family: 'Varela Round', sans-serif;
    -webkit-font-smoothing: antialiased;
    overflow: hidden;
    height: 100vh;
    position: relative;
}
.glass-top {
    position: fixed;
    top: 0; left: 0; right: 0;
    height: 70px;
    z-index: 5;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    mask-image: linear-gradient(to bottom, black 0%, black 40%, transparent 100%);
    -webkit-mask-image: linear-gradient(to bottom, black 0%, black 40%, transparent 100%);
    background: linear-gradient(to bottom, rgba(26,26,26,0.9) 0%, rgba(26,26,26,0.5) 50%, transparent 100%);
    pointer-events: none;
}
.glass-bottom {
    position: fixed;
    bottom: 0; left: 0; right: 0;
    height: 100px;
    z-index: 5;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    mask-image: linear-gradient(to top, black 0%, black 40%, transparent 100%);
    -webkit-mask-image: linear-gradient(to top, black 0%, black 40%, transparent 100%);
    background: linear-gradient(to top, rgba(26,26,26,0.9) 0%, rgba(26,26,26,0.5) 50%, transparent 100%);
    pointer-events: none;
}
.btn-settings, .btn-close {
    position: fixed;
    z-index: 10;
    cursor: pointer;
    transition: opacity 0.2s;
    opacity: 0.7;
}
.btn-settings:hover, .btn-close:hover { opacity: 1; }
.btn-settings { top: 16px; left: 18px; }
.btn-close { top: 16px; right: 18px; }
.btn-settings svg, .btn-close svg {
    width: 16px; height: 16px;
    stroke: var(--ds-text-tertiary);
    fill: none;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
}
.diary-scroll {
    position: absolute;
    inset: 0;
    overflow-y: auto;
    padding: 60px 20px 110px;
    scrollbar-width: none;
}
.diary-scroll::-webkit-scrollbar { display: none; }
.day-marker {
    font-family: -apple-system, 'Inter', system-ui, sans-serif;
    font-size: 10px;
    font-weight: 600;
    color: var(--ds-text-muted);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 14px;
    margin-top: 4px;
}
.day-marker:not(:first-child) {
    margin-top: 22px;
    padding-top: 18px;
    border-top: 1px solid var(--ds-border-subtle);
}
.entry { margin-bottom: 16px; }
.entry-time {
    font-family: -apple-system, 'Inter', system-ui, sans-serif;
    font-size: 9.5px;
    color: var(--ds-text-muted);
    font-weight: 500;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 6px;
}
.entry-tag {
    font-family: -apple-system, 'Inter', system-ui, sans-serif;
    font-size: 8px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    padding: 1px 5px;
    border-radius: 3px;
}
.tag-gemerkt { color: #6ee7b7; background: rgba(52,211,153,0.08); }
.tag-reflektiert { color: #a78bfa; background: rgba(167,139,250,0.08); }
.tag-forscht { color: #fbbf24; background: rgba(251,191,36,0.08); }
.tag-entdeckt { color: #fbbf24; background: rgba(251,191,36,0.08); }
.tag-geträumt { color: #60a5fa; background: rgba(96,165,250,0.08); }
.entry-text {
    font-size: 13.5px;
    line-height: 1.65;
    color: var(--ds-text-secondary);
}
.cipher {
    color: rgba(255,255,255,0.08);
    font-size: 13.5px;
    word-break: break-all;
    user-select: none;
    cursor: default;
}
.discoveries {
    margin-top: 6px;
    padding-left: 8px;
    border-left: 2px solid rgba(251,191,36,0.15);
}
.discovery {
    font-size: 12px;
    color: var(--ds-text-tertiary);
    padding: 3px 0;
    cursor: pointer;
    transition: color 0.15s;
}
.discovery:hover {
    color: rgba(251,191,36,0.7);
}
.discovery-icon {
    font-size: 10px;
}
.plusi-bottom {
    position: fixed;
    bottom: 14px; left: 18px; right: 18px;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 14px;
}
.plusi-char {
    cursor: pointer;
    flex-shrink: 0;
}
.plusi-body {
    width: 40px; height: 40px;
    animation: plusi-float 3s ease-in-out infinite;
    transition: transform 0.2s, opacity 0.2s;
}
.plusi-char:active .plusi-body {
    transform: scale(0.92);
}
@keyframes plusi-float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-2px); }
}
.plusi-stats {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
/* Energy + Mood row */
.energy-mood {
    display: flex;
    align-items: center;
    gap: 8px;
}
.energy-bar {
    flex: 1;
    height: 3px;
    background: var(--ds-hover-tint);
    border-radius: 2px;
    overflow: hidden;
}
.energy-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.5s ease, background 0.5s ease;
}
.mood-label {
    font-family: -apple-system, 'Inter', system-ui, sans-serif;
    font-size: 9px;
    color: var(--ds-text-placeholder);
    font-weight: 500;
    white-space: nowrap;
    min-width: 0;
}
/* Friendship row */
.friendship-row {
    display: flex;
    align-items: center;
    gap: 6px;
}
.friendship-label {
    font-family: -apple-system, 'Inter', system-ui, sans-serif;
    font-size: 9px;
    color: var(--ds-text-muted);
    font-weight: 500;
    white-space: nowrap;
}
.friendship-track {
    flex: 1;
    height: 2.5px;
    background: var(--ds-hover-tint);
    border-radius: 2px;
    overflow: hidden;
}
.friendship-fill {
    height: 100%;
    border-radius: 2px;
    background: linear-gradient(90deg, #818cf8, #a78bfa);
    transition: width 0.5s ease;
}
.friendship-level {
    font-family: -apple-system, 'Inter', system-ui, sans-serif;
    font-size: 9px;
    color: rgba(129,140,248,0.5);
    font-weight: 600;
    white-space: nowrap;
}
.empty-state {
    text-align: center;
    color: var(--ds-text-muted);
    font-size: 13px;
    margin-top: 40px;
}
"""

PANEL_HTML = """
<div class="glass-top"></div>
<div class="glass-bottom"></div>

<div class="btn-settings" onclick="window._panelSettings()">
    <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
    </svg>
</div>
<div class="btn-close" onclick="window._panelClose()">
    <svg viewBox="0 0 24 24">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
</div>

<div class="diary-scroll" id="diary-scroll">
    <div id="diary-entries"></div>
    <div class="empty-state" id="empty-state">Noch keine Einträge...</div>
</div>

<div class="plusi-bottom">
    <div class="plusi-char" id="plusi-panel-char" ondblclick="window._panelPlusiChat()">
        <svg class="plusi-body" viewBox="0 0 120 120" width="40" height="40" id="plusi-panel-svg">
            <rect x="40" y="5" width="40" height="110" rx="8" fill="#0a84ff"/>
            <rect x="5" y="35" width="110" height="40" rx="8" fill="#0a84ff"/>
            <rect x="40" y="35" width="40" height="40" fill="#0a84ff"/>
            <g id="plusi-panel-face"></g>
        </svg>
    </div>
    <div class="plusi-stats">
        <div class="energy-mood">
            <div class="energy-bar">
                <div class="energy-fill" id="energy-fill" style="width:50%;background:#818cf8;"></div>
            </div>
            <span class="mood-label" id="mood-label">neutral</span>
        </div>
        <div class="friendship-row">
            <span class="friendship-label" id="friendship-name">Fremde</span>
            <div class="friendship-track">
                <div class="friendship-fill" id="friendship-fill" style="width:0%"></div>
            </div>
            <span class="friendship-level" id="friendship-level">Lv 1</span>
        </div>
    </div>
</div>
"""

PANEL_JS = """
var CIPHER_CHARS = '\u283f\u283e\u283d\u283b\u2837\u282f\u281f\u283e\u283c\u283a\u2839\u2833\u2827';
var cipherIntervals = [];

var MOOD_COLORS = {
    neutral: '#0a84ff', curious: '#f59e0b', thinking: '#0a84ff',
    annoyed: '#f87171', empathy: '#818cf8', happy: '#34d399',
    excited: '#a78bfa', surprised: '#f59e0b', flustered: '#f87171',
    proud: '#34d399', sleepy: '#6b7280', sleeping: '#6b7280',
    reflecting: '#818cf8', reading: '#0a84ff'
};

var FACES = {};

function fillCipher(len) {
    var s = '';
    for (var i = 0; i < len; i++) s += CIPHER_CHARS[Math.floor(Math.random() * CIPHER_CHARS.length)];
    return s;
}

function startCipherAnimations() {
    cipherIntervals.forEach(function(id) { clearInterval(id); });
    cipherIntervals = [];
    document.querySelectorAll('.cipher').forEach(function(el) {
        var len = el.textContent.length;
        el.textContent = fillCipher(len);
        var id = setInterval(function() {
            var arr = el.textContent.split('');
            for (var i = 0; i < 4; i++) {
                var pos = Math.floor(Math.random() * arr.length);
                arr[pos] = CIPHER_CHARS[Math.floor(Math.random() * CIPHER_CHARS.length)];
            }
            el.textContent = arr.join('');
        }, 200);
        cipherIntervals.push(id);
    });
}

function formatDate(isoStr) {
    var d = new Date(isoStr);
    var months = ['Jan', 'Feb', 'M\\u00e4r', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
    return d.getDate() + '. ' + months[d.getMonth()] + ' ' + d.getFullYear();
}

function formatTime(isoStr) {
    var d = new Date(isoStr);
    return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}

function renderEntries(entries) {
    var container = document.getElementById('diary-entries');
    var empty = document.getElementById('empty-state');
    if (!entries || entries.length === 0) {
        container.innerHTML = '';
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';

    var html = '';
    var lastDate = '';
    entries.forEach(function(e) {
        var date = formatDate(e.timestamp);
        if (date !== lastDate) {
            html += '<div class="day-marker">' + date + '</div>';
            lastDate = date;
        }
        var tagClass = 'tag-' + e.category;
        var tagLabel = e.category.charAt(0).toUpperCase() + e.category.slice(1);

        var text = e.entry_text;
        var cipherIdx = 0;
        text = text.replace(/\\{\\{CIPHER\\}\\}/g, function() {
            var cPart = (e.cipher_parts && e.cipher_parts[cipherIdx]) ? e.cipher_parts[cipherIdx] : '???';
            cipherIdx++;
            return '<span class="cipher">' + fillCipher(cPart.length) + '</span>';
        });

        html += '<div class="entry">';
        html += '<div class="entry-time">' + formatTime(e.timestamp) + ' <span class="entry-tag ' + tagClass + '">' + tagLabel + '</span></div>';
        html += '<div class="entry-text">' + text + '</div>';
        if (e.discoveries && e.discoveries.length > 0) {
            html += '<div class="discoveries">';
            e.discoveries.forEach(function(d) {
                var cardId = d.card_id || (d.card_ids && d.card_ids[0]) || 0;
                var label = d.why || d.connection || '?';
                html += '<div class="discovery" onclick="window._apAction={type:\'goToCard\',cardId:' + cardId + '}">';
                html += '<span class="discovery-icon">🔍</span> ';
                html += '<span class="discovery-why">' + label + '</span>';
                html += '</div>';
            });
            html += '</div>';
        }
        html += '</div>';
    });

    container.innerHTML = html;
    startCipherAnimations();
}

function updateMood(mood, energy, integrity) {
    var label = document.getElementById('mood-label');
    if (label) label.textContent = mood;
    var face = document.getElementById('plusi-panel-face');
    if (face && FACES[mood]) face.innerHTML = FACES[mood];
    /* Energy bar — color matches mood */
    var eFill = document.getElementById('energy-fill');
    if (eFill) {
        var e = (typeof energy === 'number') ? energy : 5;
        eFill.style.width = (e * 10) + '%';
        eFill.style.background = MOOD_COLORS[mood] || MOOD_COLORS.neutral;
    }
    /* Integrity-based glow on panel SVG */
    var svg = document.getElementById('plusi-panel-svg');
    if (svg && typeof integrity === 'number') {
        svg.style.opacity = (0.6 + integrity * 0.4).toFixed(2);
        svg.style.filter = 'drop-shadow(0 0 ' + (integrity * 6) + 'px rgba(10,132,255,' + integrity + '))';
    }
}

function updateFriendship(data) {
    if (!data) return;
    var fill = document.getElementById('friendship-fill');
    var name = document.getElementById('friendship-name');
    var level = document.getElementById('friendship-level');
    if (fill) fill.style.width = Math.min(100, (data.points / data.maxPoints) * 100) + '%';
    if (name) name.textContent = data.levelName;
    if (level) level.textContent = 'Lv ' + data.level;
}

window.diaryReceive = function(payload) {
    if (payload.entries) renderEntries(payload.entries);
    if (payload.mood) updateMood(payload.mood, payload.energy, payload.integrity);
    if (payload.friendship) updateFriendship(payload.friendship);
    if (payload.faces) FACES = payload.faces;
    if (payload.newEntry) {
        window._apAction = {type: 'loadDiary'};
    }
};

/* Double-click panel Plusi → open chat */
window._panelPlusiChat = function() {
    if (typeof pycmd === 'function') {
        pycmd('plusi:ask');
    } else {
        window._apAction = {type: 'plusiAsk'};
    }
};

window._panelSettings = function() {
    if (typeof pycmd === 'function') {
        pycmd('plusi:settings');
    } else {
        window._apAction = {type: 'panelSettings'};
    }
};

window._panelClose = function() {
    if (typeof pycmd === 'function') {
        pycmd('plusi:panelClose');
    } else {
        window._apAction = {type: 'panelClose'};
    }
};

window.addEventListener('DOMContentLoaded', function() {
    window._apAction = {type: 'loadDiary'};
});
"""


# --- Python panel management ---

_panel_dock = None
_panel_webview = None
_poll_timer = None
_settings_mode = False
_settings_bridge = None
_settings_channel = None


def _get_panel_html():
    """Build complete HTML document for the panel webview."""
    mood = _get_current_mood()
    energy = _get_current_energy()
    friendship = _get_current_friendship()

    return f"""<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<style>{PANEL_CSS_VARS}{PANEL_CSS}</style>
</head><body>
{PANEL_HTML}
<script>
{PANEL_JS}
window.addEventListener('DOMContentLoaded', function() {{
    updateMood('{mood}', {energy});
    updateFriendship({json.dumps(friendship)});
}});
</script>
</body></html>"""


def _get_current_mood():
    try:
        from .storage import get_memory
        return get_memory('state', 'last_mood', 'neutral')
    except Exception:
        return 'neutral'


def _get_current_energy():
    try:
        from .storage import get_memory
        val = get_memory('state', 'energy', 5)
        return int(val)
    except (Exception, ValueError, TypeError):
        return 5


def _get_current_friendship():
    try:
        from .storage import get_friendship_data
        return get_friendship_data()
    except Exception:
        return {'level': 1, 'levelName': 'Fremde', 'points': 0, 'maxPoints': 15}


def _handle_panel_message(msg_type, msg_data=None):
    if msg_type == 'loadDiary':
        _send_diary_data()
    elif msg_type == 'panelSettings':
        _open_settings()
    elif msg_type == 'panelClose':
        toggle_panel()
    elif msg_type == 'panelBack':
        _back_to_diary()
    elif msg_type == 'goToCard':
        card_id = msg_data.get('cardId') if msg_data else None
        if card_id:
            try:
                from aqt import mw
                from aqt.browser import Browser
                browser = Browser(mw)
                browser.search_for(f"cid:{card_id}")
                browser.show()
            except Exception as e:
                logger.error(f"plusi panel goToCard error: {e}")


def _send_diary_data():
    global _panel_webview
    if not _panel_webview:
        return
    try:
        from .storage import load_diary, get_friendship_data, get_memory, compute_integrity
        entries = load_diary(limit=50)
        mood = get_memory('state', 'last_mood', 'neutral')
        energy = get_memory('state', 'energy', 5)
        try:
            energy = int(energy)
        except (ValueError, TypeError):
            energy = 5
        friendship = get_friendship_data()
        integrity = compute_integrity()
        payload = {
            'entries': entries,
            'mood': mood,
            'energy': energy,
            'friendship': friendship,
            'integrity': integrity
        }
        _panel_webview.page().runJavaScript(
            f"window.diaryReceive({json.dumps(payload)});"
        )
    except Exception as e:
        logger.error(f"[PlusiPanel] Error loading diary: {e}")


def _open_settings():
    """Open Anki's native preferences dialog."""
    try:
        from aqt import mw
        if mw:
            mw.onPrefs()
    except Exception as e:
        try:
            from ..utils.logging import get_logger
            get_logger(__name__).error("Could not open Anki preferences: %s", e)
        except Exception:
            pass


def _back_to_diary():
    """Switch panel back from settings to diary view."""
    global _panel_webview, _settings_mode, _settings_bridge, _settings_channel, _poll_timer
    if not _panel_webview:
        return

    _settings_mode = False

    # Remove QWebChannel (diary uses polling, not channel)
    _panel_webview.page().setWebChannel(None)
    _settings_bridge = None
    _settings_channel = None

    # Reload diary HTML
    _panel_webview.setHtml(_get_panel_html(), QUrl("file:///"))

    # Restart polling
    if _poll_timer:
        _poll_timer.start(100)

    # Load diary data after webview ready
    QTimer.singleShot(500, _send_diary_data)


def _poll_panel_messages():
    global _panel_webview
    if not _panel_webview or not _panel_webview.isVisible():
        return
    _panel_webview.page().runJavaScript(
        """
        (function() {
            var action = window._apAction;
            window._apAction = null;
            return action ? JSON.stringify(action) : null;
        })()
        """,
        _on_panel_poll_result
    )


def _on_panel_poll_result(result):
    if not result:
        return
    try:
        data = json.loads(result) if isinstance(result, str) else result
        if data and 'type' in data:
            _handle_panel_message(data['type'], data)
    except Exception:
        pass


def toggle_panel():
    global _panel_dock, _panel_webview, _poll_timer

    if _panel_dock is not None:
        if _panel_dock.isVisible():
            _panel_dock.hide()
            _set_dock_plusi_visible(True)
        else:
            _panel_dock.show()
            _set_dock_plusi_visible(False)
            QTimer.singleShot(200, _send_diary_data)
        return

    _panel_dock = QDockWidget("", mw)
    _panel_dock.setObjectName("plusiPanelDock")
    _panel_dock.setTitleBarWidget(QWidget())
    _panel_dock.setFeatures(
        QDockWidget.DockWidgetFeature.DockWidgetClosable
    )

    _panel_dock.setStyleSheet(f"""
        QDockWidget {{
            background: {_QT_TOKENS['bg_canvas']};
            border: none;
        }}
        QDockWidget > QWidget {{
            background: {_QT_TOKENS['bg_canvas']};
        }}
    """)

    container = QWidget()
    layout = QVBoxLayout(container)
    layout.setContentsMargins(0, 0, 0, 0)

    _panel_webview = QWebEngineView()
    _panel_webview.setStyleSheet(f"background: {_QT_TOKENS['bg_canvas']};")
    _panel_webview.page().setBackgroundColor(QColor(_QT_TOKENS['bg_canvas']))
    _panel_webview.setHtml(_get_panel_html(), QUrl("file:///"))
    layout.addWidget(_panel_webview)

    _panel_dock.setWidget(container)
    mw.addDockWidget(Qt.DockWidgetArea.LeftDockWidgetArea, _panel_dock)

    _panel_dock.setMinimumWidth(260)
    _panel_dock.setMaximumWidth(280)

    _poll_timer = QTimer()
    _poll_timer.timeout.connect(_poll_panel_messages)
    _poll_timer.start(100)

    QTimer.singleShot(500, _send_diary_data)
    _set_dock_plusi_visible(False)


def _set_dock_plusi_visible(visible):
    """Show/hide the dock Plusi character via JS injection."""
    try:
        from .dock import _get_active_webview
        web = _get_active_webview()
        if web:
            display = 'flex' if visible else 'none'
            web.page().runJavaScript(
                f"var d=document.getElementById('plusi-dock'); if(d) d.style.display='{display}';"
            )
    except Exception:
        pass


def notify_new_diary_entry():
    global _panel_dock
    if _panel_dock and _panel_dock.isVisible():
        QTimer.singleShot(100, _send_diary_data)


def update_panel_mood(mood):
    global _panel_webview, _panel_dock
    if _panel_dock and _panel_dock.isVisible() and _panel_webview:
        _panel_webview.page().runJavaScript(
            f"if(window.updateMood) updateMood('{mood}');"
        )


def update_panel_friendship(data):
    global _panel_webview, _panel_dock
    if _panel_dock and _panel_dock.isVisible() and _panel_webview:
        _panel_webview.page().runJavaScript(
            f"if(window.updateFriendship) updateFriendship({json.dumps(data)});"
        )


def is_panel_visible():
    global _panel_dock
    return _panel_dock is not None and _panel_dock.isVisible()
