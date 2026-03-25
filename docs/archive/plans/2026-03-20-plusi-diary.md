# Plusi Diary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a diary system where Plusi writes personal journal entries (with encrypted sections) visible in a new left-side panel.

**Architecture:** Extend Plusi's JSON response prefix with a `diary` field. Parse `||..||` markers into visible/encrypted parts. Store in new SQLite table. Display in a new QDockWidget (left side) with inline HTML/CSS/JS injection. Plusi dock icon switches from context-menu to single-click=panel, double-click=chat.

**Tech Stack:** Python/PyQt6, SQLite, inline HTML/CSS/JS (same pattern as plusi_dock.py), Gemini Flash API

**Spec:** `docs/superpowers/specs/2026-03-20-plusi-diary-design.md`

---

### Task 1: Add `plusi_diary` table to storage

**Files:**
- Modify: `plusi_storage.py:29-51` (add table in `_init_tables()`)
- Modify: `plusi_storage.py` (add new functions at end of file)

- [ ] **Step 1: Add table creation in `_init_tables()`**

After the existing `plusi_memory` table creation (line 48), add:

```python
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS plusi_diary (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                entry_text TEXT NOT NULL,
                cipher_text TEXT DEFAULT '[]',
                category TEXT NOT NULL DEFAULT 'gemerkt',
                mood TEXT NOT NULL DEFAULT 'neutral'
            )
        ''')
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_plusi_diary_time
            ON plusi_diary(timestamp DESC)
        ''')
```

- [ ] **Step 2: Add `save_diary_entry()` function**

Append to end of `plusi_storage.py`:

```python
def save_diary_entry(entry_text, cipher_parts, category='gemerkt', mood='neutral'):
    """Save a parsed diary entry. cipher_parts is a list of encrypted strings."""
    db = _get_db()
    db.execute(
        'INSERT INTO plusi_diary (timestamp, entry_text, cipher_text, category, mood) VALUES (?, ?, ?, ?, ?)',
        (datetime.now().isoformat(), entry_text, json.dumps(cipher_parts), category, mood)
    )
    db.commit()
```

- [ ] **Step 3: Add `load_diary()` function**

```python
def load_diary(limit=50, offset=0):
    """Load diary entries, newest first. Returns list of dicts."""
    db = _get_db()
    rows = db.execute(
        'SELECT id, timestamp, entry_text, cipher_text, category, mood FROM plusi_diary ORDER BY timestamp DESC LIMIT ? OFFSET ?',
        (limit, offset)
    ).fetchall()
    entries = []
    for row in rows:
        entries.append({
            'id': row[0],
            'timestamp': row[1],
            'entry_text': row[2],
            'cipher_parts': json.loads(row[3]),
            'category': row[4],
            'mood': row[5]
        })
    return entries
```

- [ ] **Step 4: Verify `json` and `datetime` imports exist**

Check top of `plusi_storage.py` — `json` is already imported (used in get_memory/set_memory). `datetime` is already imported (used in save_interaction). No new imports needed.

- [ ] **Step 5: Commit**

```bash
git add plusi_storage.py
git commit -m "feat(plusi): add plusi_diary table and storage functions"
```

---

### Task 2: Extend `parse_plusi_response()` to extract diary

**Files:**
- Modify: `plusi_agent.py:364-408` (`parse_plusi_response()`)

- [ ] **Step 1: Update return tuple to include diary**

Currently (line 364) the function returns `(mood, text, internal_state, friendship_delta)`. Change the function to also extract and return `diary`.

After line 388 where `data` dict is available from JSON parsing, add extraction:

```python
    diary_raw = data.get('diary', None)
```

- [ ] **Step 2: Add diary parsing helper**

Add above `parse_plusi_response()`:

```python
def _parse_diary_text(raw):
    """Split diary text at ||..|| markers. Returns (visible_text, cipher_parts).
    Odd segments (between ||) are encrypted, even segments are visible."""
    if not raw:
        return None, []
    parts = raw.split('||')
    visible = ''
    cipher_parts = []
    for i, part in enumerate(parts):
        if i % 2 == 1:  # encrypted
            cipher_parts.append(part)
            visible += '{{CIPHER}}'  # placeholder for frontend
        else:
            visible += part
    return visible.strip(), cipher_parts
```

- [ ] **Step 3: Update all return statements**

The function has multiple return paths:

1. **Happy path** (after `raw_decode`, ~line 388): Add `diary_raw` extraction, return 5-tuple:
```python
    return mood, text, internal, delta, diary_raw
```

2. **Regex fallback** (~line 394-407): `diary_raw` not available from regex, return `None`:
```python
    return mood, text, None, delta, None
```

3. **Complete failure** (default return): Currently returns `('neutral', raw_text, None, 0)`. Change to:
```python
    return 'neutral', raw_text, None, 0, None
```

- [ ] **Step 4: Update all callers of `parse_plusi_response()`**

In `run_plusi()` (line 483):
```python
    # Was: mood, response_text, internal, delta = parse_plusi_response(raw_text)
    mood, response_text, internal, delta, diary_raw = parse_plusi_response(raw_text)
```

In `self_reflect()` (line 352):
```python
    # Was: mood, text, internal, delta = parse_plusi_response(raw_step2)
    mood, text, internal, delta, diary_raw = parse_plusi_response(raw_step2)
```

- [ ] **Step 5: Save diary entry in `run_plusi()`**

After `persist_internal_state()` call (line 487), add diary saving:

```python
    if diary_raw:
        from .plusi_storage import save_diary_entry
        visible, cipher_parts = _parse_diary_text(diary_raw)
        if visible:
            save_diary_entry(visible, cipher_parts, category='gemerkt', mood=mood)
```

- [ ] **Step 6: Save diary entry in `self_reflect()`**

After `persist_internal_state()` call in self_reflect (~line 354), add:

```python
    if diary_raw:
        from .plusi_storage import save_diary_entry
        visible, cipher_parts = _parse_diary_text(diary_raw)
        if visible:
            save_diary_entry(visible, cipher_parts, category='reflektiert', mood=mood)
```

- [ ] **Step 7: Include diary in `run_plusi()` return dict**

Update the return dict (~line 501) to include diary info:

```python
    result = {
        'mood': mood,
        'text': response_text,
        'friendship': friendship_data,
        'diary': diary_raw is not None,  # flag for frontend/panel
        'error': False
    }
```

- [ ] **Step 8: Commit**

```bash
git add plusi_agent.py
git commit -m "feat(plusi): extract diary field from response, parse cipher markers"
```

---

### Task 3: Update Plusi's system prompt

**Files:**
- Modify: `plusi_agent.py:26-157` (`PLUSI_SYSTEM_PROMPT`)

- [ ] **Step 1: Add DEIN TAGEBUCH section**

Insert after the PRIVATSPHÄRE section (find `PRIVATSPHÄRE` in the prompt, add after its content):

```python
DEIN TAGEBUCH
Du führst ein Tagebuch. Der Nutzer kann es lesen — es ist ein Fenster
in deine innere Welt. Aber du entscheidest, was sichtbar ist und was
verschlüsselt bleibt.

Regeln:
- Alles was du in "internal" einträgst, MUSS im Tagebuch reflektiert werden
- Du kannst Teile mit ||...|| markieren — diese werden dem Nutzer als
  verschlüsselte Zeichen angezeigt. Er sieht DASS da was steht, aber
  nicht WAS.
- Der sichtbare Teil soll trotzdem Sinn ergeben
- Schreib wie in ein echtes Tagebuch: kurz, persönlich, deine Stimme
- Wenn nichts Neues passiert ist (internal ist leer), setz diary auf null
```

- [ ] **Step 2: Update TECHNISCH section — JSON format**

Find the existing JSON format instruction in the TECHNISCH section. Update to include `diary` as last field:

```
{"mood":"<key>", "friendship_delta":<-3..+3>, "internal":{...optional...}, "diary":"...oder null"}
```

- [ ] **Step 3: Increase token limit**

Change line 454 in `run_plusi()`:
```python
    # Was: "maxOutputTokens": 2048
    "maxOutputTokens": 3072
```

Also update `self_reflect()` step 2 max_tokens (line 348) from 512 to 768 to accommodate diary in reflections.

- [ ] **Step 4: Commit**

```bash
git add plusi_agent.py
git commit -m "feat(plusi): add diary section to system prompt, increase token limit"
```

---

### Task 4: Create `plusi_panel.py` — Panel HTML/CSS/JS

**Files:**
- Create: `plusi_panel.py`

- [ ] **Step 1: Create file with CSS**

Create `plusi_panel.py` following the exact pattern of `plusi_dock.py` (triple-quoted string constants for CSS/HTML/JS).

```python
"""Plusi diary panel — left-side QDockWidget with inline HTML/CSS/JS."""

import json
from datetime import datetime

PANEL_CSS = """
/* Panel base */
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

/* Glass fades */
.glass-top {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
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
    bottom: 0;
    left: 0;
    right: 0;
    height: 100px;
    z-index: 5;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    mask-image: linear-gradient(to top, black 0%, black 40%, transparent 100%);
    -webkit-mask-image: linear-gradient(to top, black 0%, black 40%, transparent 100%);
    background: linear-gradient(to top, rgba(19,19,31,0.9) 0%, rgba(19,19,31,0.5) 50%, transparent 100%);
    pointer-events: none;
}

/* Naked control buttons */
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
    width: 16px;
    height: 16px;
    stroke: rgba(255,255,255,0.4);
    fill: none;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
}

/* Diary scroll area */
.diary-scroll {
    position: absolute;
    inset: 0;
    overflow-y: auto;
    padding: 60px 20px 110px;
    scrollbar-width: none;
}
.diary-scroll::-webkit-scrollbar { display: none; }

/* Date markers */
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

/* Entries */
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

/* Plusi footer */
.plusi-bottom {
    position: fixed;
    bottom: 14px;
    left: 18px;
    right: 18px;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 12px;
    pointer-events: none;
}
.plusi-body {
    width: 40px;
    height: 40px;
    animation: plusi-float 3s ease-in-out infinite;
}
@keyframes plusi-float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-2px); }
}
.mood-dot {
    width: 5px;
    height: 5px;
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
```

- [ ] **Step 2: Add panel JavaScript**

```python
PANEL_JS = """
var CIPHER_CHARS = '⠿⠾⠽⠻⠷⠯⠟⠾⠼⠺⠹⠳⠧';
var cipherIntervals = [];

var MOOD_COLORS = {
    neutral: '#818cf8', happy: '#6ee7b7', curious: '#fbbf24',
    annoyed: '#f87171', sleepy: '#9ca3af', excited: '#c084fc',
    surprised: '#fbbf24', blush: '#f87171', empathy: '#818cf8',
    thinking: '#60a5fa', reading: '#60a5fa'
};

/* Import face definitions from plusi_dock — will be injected dynamically */
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
    var months = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
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

        /* Build entry text with cipher placeholders replaced */
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
    /* Update face if FACES loaded */
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

/* Receive data from Python */
window.diaryReceive = function(payload) {
    if (payload.entries) renderEntries(payload.entries);
    if (payload.mood) updateMood(payload.mood);
    if (payload.friendship) updateFriendship(payload.friendship);
    if (payload.faces) FACES = payload.faces;
    if (payload.newEntry) {
        /* Prepend single new entry without full reload */
        window._apAction = {type: 'loadDiary'};
    }
};

/* Actions → Python */
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

/* Request initial data on load */
window.addEventListener('DOMContentLoaded', function() {
    window._apAction = {type: 'loadDiary'};
});
"""
```

- [ ] **Step 3: Add Python panel functions**

```python
from aqt import mw
from PyQt6.QtWidgets import QDockWidget, QWidget
from PyQt6.QtWebEngineWidgets import QWebEngineView
from PyQt6.QtCore import Qt, QUrl, QTimer
import json

_panel_dock = None
_panel_webview = None
_poll_timer = None


def _get_panel_html():
    """Build complete HTML document for the panel webview."""
        # FACES is defined in JS inside plusi_dock.py, not as a Python export.
    # We duplicate the face data here as a Python dict to inject into panel JS.
    from .plusi_dock import get_faces_dict  # Python-level face SVG definitions
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
/* Initialize with current state */
window.addEventListener('DOMContentLoaded', function() {{
    FACES = {faces_json};
    updateMood('{mood}');
    updateFriendship({json.dumps(friendship)});
}});
</script>
</body></html>"""


def _get_current_mood():
    """Get Plusi's current mood from storage."""
    try:
        from .plusi_storage import get_memory
        return get_memory('state', 'last_mood', 'neutral')
    except Exception:
        return 'neutral'


def _get_current_friendship():
    """Get friendship data for display."""
    try:
        from .plusi_storage import get_friendship_data
        return get_friendship_data()
    except Exception:
        return {'level': 1, 'levelName': 'Fremde', 'points': 0, 'maxPoints': 15}


def _handle_panel_message(msg_type):
    """Handle messages from panel JS."""
    if msg_type == 'loadDiary':
        _send_diary_data()
    elif msg_type == 'panelSettings':
        _open_settings()
    elif msg_type == 'panelClose':
        toggle_panel()


def _send_diary_data():
    """Load diary entries and push to panel webview."""
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
    """Open AnkiPlus settings."""
    try:
        from .settings_window import open_settings
        open_settings()
    except Exception:
        pass


def _poll_panel_messages():
    """Poll for JS messages (same pattern as widget.py)."""
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
    """Callback for poll result."""
    if not result:
        return
    try:
        data = json.loads(result) if isinstance(result, str) else result
        if data and 'type' in data:
            _handle_panel_message(data['type'])
    except Exception:
        pass


def toggle_panel():
    """Toggle the Plusi panel dock widget."""
    global _panel_dock, _panel_webview, _poll_timer

    if _panel_dock is not None:
        if _panel_dock.isVisible():
            _panel_dock.hide()
        else:
            _panel_dock.show()
            QTimer.singleShot(200, _send_diary_data)
        return

    # Create dock
    _panel_dock = QDockWidget("", mw)
    _panel_dock.setObjectName("plusiPanelDock")
    _panel_dock.setTitleBarWidget(QWidget())  # Remove title bar
    _panel_dock.setFeatures(
        QDockWidget.DockWidgetFeature.DockWidgetClosable
    )

    # Style
    _panel_dock.setStyleSheet("""
        QDockWidget {
            background: #13131f;
            border: none;
        }
        QDockWidget > QWidget {
            background: #13131f;
        }
    """)

    # WebView
    container = QWidget()
    from PyQt6.QtWidgets import QVBoxLayout
    layout = QVBoxLayout(container)
    layout.setContentsMargins(0, 0, 0, 0)

    _panel_webview = QWebEngineView()
    _panel_webview.setStyleSheet("background: #13131f;")
    _panel_webview.page().setBackgroundColor(
        __import__('PyQt6.QtGui', fromlist=['QColor']).QColor('#13131f')
    )
    _panel_webview.setHtml(_get_panel_html(), QUrl("file:///"))
    layout.addWidget(_panel_webview)

    _panel_dock.setWidget(container)
    mw.addDockWidget(Qt.DockWidgetArea.LeftDockWidgetArea, _panel_dock)

    # Fixed width
    _panel_dock.setMinimumWidth(260)
    _panel_dock.setMaximumWidth(280)

    # Start polling
    _poll_timer = QTimer()
    _poll_timer.timeout.connect(_poll_panel_messages)
    _poll_timer.start(100)

    # Load data after webview is ready
    QTimer.singleShot(500, _send_diary_data)


def notify_new_diary_entry():
    """Called after a diary entry is saved to refresh the panel if open."""
    global _panel_dock
    if _panel_dock and _panel_dock.isVisible():
        QTimer.singleShot(100, _send_diary_data)


def update_panel_mood(mood):
    """Update mood display in panel if open."""
    global _panel_webview, _panel_dock
    if _panel_dock and _panel_dock.isVisible() and _panel_webview:
        _panel_webview.page().runJavaScript(
            f"if(window.updateMood) updateMood('{mood}');"
        )


def update_panel_friendship(data):
    """Update friendship display in panel if open."""
    global _panel_webview, _panel_dock
    if _panel_dock and _panel_dock.isVisible() and _panel_webview:
        _panel_webview.page().runJavaScript(
            f"if(window.updateFriendship) updateFriendship({json.dumps(data)});"
        )


def is_panel_visible():
    """Check if panel is currently open."""
    global _panel_dock
    return _panel_dock is not None and _panel_dock.isVisible()
```

- [ ] **Step 4: Commit**

```bash
git add plusi_panel.py
git commit -m "feat(plusi): create diary panel with glass-fade UI and cipher animations"
```

---

### Task 5: Update dock interaction — single-click/double-click

**Files:**
- Modify: `plusi_dock.py:252-293` (JS click handlers)
- Modify: `plusi_dock.py:138-174` (HTML — remove context menu)
- Modify: `plusi_dock.py` (add Python-level `get_faces_dict()`)

- [ ] **Step 0: Extract FACES as Python dict**

The `FACES` object currently lives only in JS inside `PLUSI_JS`. The panel needs this data to render Plusi's face. Add a Python-level function that returns the same face SVG data as a dict. Add near the top of `plusi_dock.py`:

```python
def get_faces_dict():
    """Return face SVG definitions as a Python dict (for panel injection).
    Must stay in sync with the FACES object in PLUSI_JS."""
    return {
        'neutral': '<circle cx="45" cy="55" r="4" fill="white" opacity="0.9"/>...',  # copy from PLUSI_JS FACES
        'happy': '...',
        # ... all 11 moods
    }
```

Copy the exact SVG strings from the `FACES` JS object (lines 187-199 of `plusi_dock.py`) into this Python dict. They must match.

- [ ] **Step 1: Replace `_plusiToggleMenu()` with click/double-click detection**

Replace the JS click handler section (starting at `window._plusiToggleMenu`) with:

```javascript
var _clickTimer = null;
var _clickCount = 0;

window._plusiClick = function() {
    _clickCount++;
    if (_clickCount === 1) {
        _clickTimer = setTimeout(function() {
            /* Single click — toggle panel */
            _clickCount = 0;
            if (typeof pycmd === 'function') {
                pycmd('plusi:panel');
            } else {
                window._apAction = {type: 'plusiPanel'};
            }
        }, 300);
    } else if (_clickCount === 2) {
        /* Double click — open chat */
        clearTimeout(_clickTimer);
        _clickCount = 0;
        if (typeof pycmd === 'function') {
            pycmd('plusi:ask');
        } else {
            window._apAction = {type: 'plusiAsk'};
        }
    }
};
```

- [ ] **Step 2: Remove old menu functions**

Remove `window._plusiAsk()` and `window._plusiSettings()` functions (they were menu-specific). Remove the `_plusiToggleMenu()` function. Remove the outside-click close listener for the menu.

- [ ] **Step 3: Update HTML — remove context menu, update onclick**

In `PLUSI_HTML`, change the onclick on `#plusi-dock-char`:
```html
<!-- Was: onclick="window._plusiToggleMenu()" -->
<div id="plusi-dock-char" onclick="window._plusiClick()">
```

Remove the entire `#plusi-menu` div (the context menu HTML with "Plusi fragen" and "Einstellungen").

- [ ] **Step 4: Clean up CSS**

Remove `.plusi-dock-menu`, `.plusi-menu-item`, `.plusi-menu-sep`, `.plusi-menu-accent` styles from `PLUSI_CSS` since the menu no longer exists.

- [ ] **Step 5: Update `setMood()` in JS**

Remove the `menuOpen` glow logic from `setMood()` since there's no menu anymore. Glow can be triggered when panel is open instead (future enhancement).

- [ ] **Step 6: Commit**

```bash
git add plusi_dock.py
git commit -m "feat(plusi): single-click=panel, double-click=chat, remove context menu"
```

---

### Task 6: Wire panel into `__init__.py` and `widget.py`

**Files:**
- Modify: `__init__.py` (pycmd handler section, ~lines 476+)
- Modify: `widget.py` (message handler, ~lines 859+)

- [ ] **Step 1: Handle `plusi:panel` pycmd in reviewer**

Find the section in `__init__.py` where `plusi:ask` and `plusi:settings` pycmd commands are handled. Add:

```python
    elif cmd == 'plusi:panel':
        from .plusi_panel import toggle_panel
        toggle_panel()
        return True
    elif cmd == 'plusi:panelClose':
        from .plusi_panel import toggle_panel
        toggle_panel()  # toggle will hide if visible
        return True
```

- [ ] **Step 2: Handle `plusiPanel` message in widget.py**

In `_handle_js_message()`, add handler for the `plusiPanel` action from deck browser/overview:

```python
    elif msg_type == 'plusiPanel':
        from .plusi_panel import toggle_panel
        toggle_panel()
```

- [ ] **Step 3: Notify panel after Plusi interactions**

In `widget.py`, `_handle_plusi_direct()` (~line 889), after mood sync, add panel notification:

```python
    # After sync_mood call
    from .plusi_panel import notify_new_diary_entry, update_panel_mood, update_panel_friendship
    if result.get('diary'):
        notify_new_diary_entry()
    update_panel_mood(mood)
    if friendship:
        update_panel_friendship(friendship)
```

- [ ] **Step 4: Notify panel after self_reflect**

In `__init__.py`, `_plusi_reflect_once()` (~line 486-498), after self_reflect completes:

```python
    # After self_reflect() returns successfully
    try:
        from .plusi_panel import notify_new_diary_entry
        notify_new_diary_entry()
    except Exception:
        pass
```

- [ ] **Step 5: Commit**

```bash
git add __init__.py widget.py
git commit -m "feat(plusi): wire panel toggle and diary notifications into main app"
```

---

### Task 7: Integration test in Anki

**Files:** None (manual testing)

- [ ] **Step 1: Build frontend**

```bash
cd frontend && npm run build
```

- [ ] **Step 2: Restart Anki and verify**

1. Open Anki → Plusi dock icon should appear
2. **Single-click** Plusi → left panel should slide in (empty diary initially)
3. **Single-click** again → panel should close
4. **Double-click** Plusi → chat should open with @Plusi
5. Panel should show glass fades, naked buttons, Plusi at bottom with mood/friendship

- [ ] **Step 3: Generate diary entries**

1. Chat with Plusi about something memorable
2. Check panel — new diary entry should appear with category "Gemerkt"
3. Verify cipher sections animate (Braille characters shifting every 200ms)
4. Check that visible text makes sense without the encrypted parts

- [ ] **Step 4: Verify self_reflect diary**

1. Restart Anki (triggers `self_reflect()`)
2. Check panel — entry with category "Reflektiert" should appear

- [ ] **Step 5: Test panel controls**

1. Click settings icon (top-left) → settings window should open
2. Click X (top-right) → panel should close
3. Scroll diary entries → glass fades should blur scrolling content

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix(plusi): diary panel integration fixes"
```
