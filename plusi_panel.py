"""Plusi diary panel — left-side QDockWidget with inline HTML/CSS/JS."""

import json
from datetime import datetime

from aqt import mw
from PyQt6.QtWidgets import QDockWidget, QWidget, QVBoxLayout
from PyQt6.QtWebEngineWidgets import QWebEngineView
from PyQt6.QtCore import Qt, QUrl, QTimer
from PyQt6.QtGui import QColor


PANEL_CSS = """
body {
    margin: 0;
    padding: 0;
    background: #13131f;
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
    background: linear-gradient(to bottom, rgba(19,19,31,0.9) 0%, rgba(19,19,31,0.5) 50%, transparent 100%);
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
    background: linear-gradient(to top, rgba(19,19,31,0.9) 0%, rgba(19,19,31,0.5) 50%, transparent 100%);
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
    stroke: rgba(255,255,255,0.4);
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
    color: rgba(255,255,255,0.16);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 14px;
    margin-top: 4px;
}
.day-marker:not(:first-child) {
    margin-top: 22px;
    padding-top: 18px;
    border-top: 1px solid rgba(255,255,255,0.03);
}
.entry { margin-bottom: 16px; }
.entry-time {
    font-family: -apple-system, 'Inter', system-ui, sans-serif;
    font-size: 9.5px;
    color: rgba(255,255,255,0.18);
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
.entry-text {
    font-size: 13.5px;
    line-height: 1.65;
    color: rgba(255,255,255,0.55);
}
.cipher {
    color: rgba(255,255,255,0.08);
    font-size: 13.5px;
    word-break: break-all;
    user-select: none;
    cursor: default;
}
.plusi-bottom {
    position: fixed;
    bottom: 14px; left: 18px; right: 18px;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 12px;
    pointer-events: none;
}
.plusi-body {
    width: 40px; height: 40px;
    animation: plusi-float 3s ease-in-out infinite;
}
@keyframes plusi-float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-2px); }
}
.mood-dot {
    width: 5px; height: 5px;
    border-radius: 50%;
    animation: mood-pulse 2s ease-in-out infinite;
}
@keyframes mood-pulse {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 1; }
}
.mood-value {
    font-size: 11px;
    color: rgba(255,255,255,0.45);
    font-family: 'Varela Round', sans-serif;
}
.friendship-bar {
    display: flex;
    align-items: center;
    gap: 6px;
}
.friendship-label {
    font-family: -apple-system, 'Inter', system-ui, sans-serif;
    font-size: 9px;
    color: rgba(255,255,255,0.2);
    font-weight: 500;
    white-space: nowrap;
}
.friendship-track {
    flex: 1;
    height: 2.5px;
    background: rgba(255,255,255,0.04);
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
    color: rgba(255,255,255,0.2);
    font-size: 13px;
    margin-top: 40px;
}
"""

PANEL_HTML = """
<div class="glass-top"></div>
<div class="glass-bottom"></div>

<div class="btn-settings" onclick="window._panelSettings()">
    <svg viewBox="0 0 24 24">
        <line x1="4" y1="6" x2="20" y2="6"></line>
        <circle cx="8" cy="6" r="2"></circle>
        <line x1="4" y1="12" x2="20" y2="12"></line>
        <circle cx="16" cy="12" r="2"></circle>
        <line x1="4" y1="18" x2="20" y2="18"></line>
        <circle cx="11" cy="18" r="2"></circle>
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
    <div style="width:40px;height:40px;flex-shrink:0;">
        <svg class="plusi-body" viewBox="0 0 120 120" id="plusi-panel-svg">
            <rect x="35" y="10" width="50" height="100" rx="16" fill="#2563eb"/>
            <rect x="10" y="35" width="100" height="50" rx="16" fill="#2563eb"/>
            <g id="plusi-panel-face"></g>
        </svg>
    </div>
    <div style="flex:1;display:flex;flex-direction:column;gap:5px;">
        <div style="display:flex;align-items:center;gap:6px;">
            <div class="mood-dot" id="mood-dot"></div>
            <span class="mood-value" id="mood-label">neutral</span>
        </div>
        <div class="friendship-bar">
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
    neutral: '#818cf8', happy: '#6ee7b7', curious: '#fbbf24',
    annoyed: '#f87171', sleepy: '#9ca3af', excited: '#c084fc',
    surprised: '#fbbf24', blush: '#f87171', empathy: '#818cf8',
    thinking: '#60a5fa', reading: '#60a5fa'
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
        html += '</div>';
    });

    container.innerHTML = html;
    startCipherAnimations();
}

function updateMood(mood) {
    var dot = document.getElementById('mood-dot');
    var label = document.getElementById('mood-label');
    if (dot) dot.style.background = MOOD_COLORS[mood] || MOOD_COLORS.neutral;
    if (label) label.textContent = mood;
    var face = document.getElementById('plusi-panel-face');
    if (face && FACES[mood]) face.innerHTML = FACES[mood];
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
    if (payload.mood) updateMood(payload.mood);
    if (payload.friendship) updateFriendship(payload.friendship);
    if (payload.faces) FACES = payload.faces;
    if (payload.newEntry) {
        window._apAction = {type: 'loadDiary'};
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


def _get_panel_html():
    """Build complete HTML document for the panel webview."""
    from .plusi_dock import get_faces_dict
    faces_json = json.dumps(get_faces_dict())
    mood = _get_current_mood()
    friendship = _get_current_friendship()

    return f"""<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<style>{PANEL_CSS}</style>
</head><body>
{PANEL_HTML}
<script>
{PANEL_JS}
window.addEventListener('DOMContentLoaded', function() {{
    FACES = {faces_json};
    updateMood('{mood}');
    updateFriendship({json.dumps(friendship)});
}});
</script>
</body></html>"""


def _get_current_mood():
    try:
        from .plusi_storage import get_memory
        return get_memory('state', 'last_mood', 'neutral')
    except Exception:
        return 'neutral'


def _get_current_friendship():
    try:
        from .plusi_storage import get_friendship_data
        return get_friendship_data()
    except Exception:
        return {'level': 1, 'levelName': 'Fremde', 'points': 0, 'maxPoints': 15}


def _handle_panel_message(msg_type):
    if msg_type == 'loadDiary':
        _send_diary_data()
    elif msg_type == 'panelSettings':
        _open_settings()
    elif msg_type == 'panelClose':
        toggle_panel()


def _send_diary_data():
    global _panel_webview
    if not _panel_webview:
        return
    try:
        from .plusi_storage import load_diary, get_friendship_data, get_memory
        entries = load_diary(limit=50)
        mood = get_memory('state', 'last_mood', 'neutral')
        friendship = get_friendship_data()
        payload = {
            'entries': entries,
            'mood': mood,
            'friendship': friendship
        }
        _panel_webview.page().runJavaScript(
            f"window.diaryReceive({json.dumps(payload)});"
        )
    except Exception as e:
        print(f"[PlusiPanel] Error loading diary: {e}")


def _open_settings():
    try:
        from .settings_window import open_settings
        open_settings()
    except Exception:
        pass


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
            _handle_panel_message(data['type'])
    except Exception:
        pass


def toggle_panel():
    global _panel_dock, _panel_webview, _poll_timer

    if _panel_dock is not None:
        if _panel_dock.isVisible():
            _panel_dock.hide()
        else:
            _panel_dock.show()
            QTimer.singleShot(200, _send_diary_data)
        return

    _panel_dock = QDockWidget("", mw)
    _panel_dock.setObjectName("plusiPanelDock")
    _panel_dock.setTitleBarWidget(QWidget())
    _panel_dock.setFeatures(
        QDockWidget.DockWidgetFeature.DockWidgetClosable
    )

    _panel_dock.setStyleSheet("""
        QDockWidget {
            background: #13131f;
            border: none;
        }
        QDockWidget > QWidget {
            background: #13131f;
        }
    """)

    container = QWidget()
    layout = QVBoxLayout(container)
    layout.setContentsMargins(0, 0, 0, 0)

    _panel_webview = QWebEngineView()
    _panel_webview.setStyleSheet("background: #13131f;")
    _panel_webview.page().setBackgroundColor(QColor('#13131f'))
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
