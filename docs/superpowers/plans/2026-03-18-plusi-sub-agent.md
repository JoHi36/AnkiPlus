# Plusi Sub-Agent Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Plusi as an independent AI sub-agent that the main tutor AI can spawn via tool call. Plusi has its own Gemini Flash model, personality prompt, persistent cross-deck history, and own tools. Chat messages render Plusi's responses as a distinctive blockquote-style widget.

**Architecture:** The main AI calls `spawn_plusi({situation: "..."})` → Python creates a separate Gemini Flash call with Plusi's own system prompt and history → Plusi responds with `{mood, text}` → Frontend renders a PlusiWidget in the chat. Plusi's history is stored in a separate SQLite table, independent from card/deck messages.

**Tech Stack:** Python 3.9+ (Gemini API), SQLite, React 18, existing agent framework (tool_registry, agent_loop, tool_executor).

**Spec:** `docs/superpowers/specs/2026-03-18-plusi-unified-identity.md` — Sections 4, 6

**Widget Design:** Markdown blockquote style — 3px blue left border, subtle blue background, no rounded right corners. Full header row (48px animated Plusi + name + mood metadata). Content area below with full markdown support. Skeleton/shimmer for loading, frozen state for older messages.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `plusi_storage.py` | **Create** | SQLite tables: `plusi_history` + `plusi_memory` (future-ready) |
| `plusi_agent.py` | **Create** | Plusi sub-agent: own Gemini call, own prompt, own history, own tools |
| `tool_registry.py` | **Modify** | Register `spawn_plusi` tool for main AI |
| `tool_executor.py` | **Modify** | Route `spawn_plusi` calls to plusi_agent |
| `widget.py` | **Modify** | Handle `plusiSkeleton`/`plusiResult` events, forward to frontend |
| `frontend/src/components/PlusiWidget.jsx` | **Create** | Chat widget component (skeleton/live/frozen states) |
| `frontend/src/components/ChatMessage.jsx` | **Modify** | Detect `[[PLUSI_DATA: {...}]]` marker, render PlusiWidget |
| `frontend/src/App.jsx` | **Modify** | Handle `plusiSkeleton`/`plusiResult` events from backend |
| `config.py` | **Modify** | Add `plusi` toggle to `ai_tools` defaults |
| `frontend/src/components/SettingsModal.jsx` | **Modify** | Add Plusi tool toggle in KI-Werkzeuge section |

---

## Task 1: Create plusi_storage.py

**Files:**
- Create: `plusi_storage.py`

Plusi needs its own persistent storage — separate from card/deck messages. Two tables:
- `plusi_history`: conversation log (context from tutor + Plusi's response)
- `plusi_memory`: key-value store for user knowledge (future-ready, created empty)

- [ ] **Step 1: Create the storage module**

```python
# plusi_storage.py
"""
Persistent storage for Plusi sub-agent.

Two tables in a separate SQLite database (plusi.db):
- plusi_history: conversation log (tutor context + Plusi response + mood)
- plusi_memory: key-value store for user knowledge (future-ready)
"""
import sqlite3
import json
import os
from datetime import datetime

_db = None
_db_path = None


def _get_db():
    global _db, _db_path
    if _db is None:
        _db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'plusi.db')
        _db = sqlite3.connect(_db_path, check_same_thread=False)
        _db.execute("PRAGMA journal_mode=WAL")
        _db.execute("PRAGMA foreign_keys=ON")
        _init_tables(_db)
    return _db


def _init_tables(db):
    db.execute("""
        CREATE TABLE IF NOT EXISTS plusi_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            context TEXT NOT NULL,
            response TEXT NOT NULL,
            mood TEXT NOT NULL DEFAULT 'neutral',
            deck_id INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    db.execute("""
        CREATE TABLE IF NOT EXISTS plusi_memory (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    db.execute("CREATE INDEX IF NOT EXISTS idx_plusi_history_time ON plusi_history(timestamp)")
    db.commit()


def save_interaction(context, response, mood='neutral', deck_id=None):
    """Save a Plusi interaction (tutor context + Plusi response)."""
    db = _get_db()
    db.execute("""
        INSERT INTO plusi_history (timestamp, context, response, mood, deck_id)
        VALUES (?, ?, ?, ?, ?)
    """, (datetime.now().isoformat(), context, response, mood, deck_id))
    db.commit()


def load_history(limit=10):
    """Load recent Plusi interactions as conversation pairs for the AI context."""
    db = _get_db()
    cursor = db.execute("""
        SELECT context, response FROM plusi_history
        ORDER BY timestamp DESC LIMIT ?
    """, (limit,))
    rows = cursor.fetchall()
    rows.reverse()  # chronological order

    history = []
    for context, response in rows:
        history.append({"role": "user", "content": context})
        history.append({"role": "assistant", "content": response})
    return history


def get_memory(key, default=None):
    """Get a value from Plusi's memory store."""
    db = _get_db()
    cursor = db.execute("SELECT value FROM plusi_memory WHERE key = ?", (key,))
    row = cursor.fetchone()
    if row:
        try:
            return json.loads(row[0])
        except (json.JSONDecodeError, TypeError):
            return row[0]
    return default


def set_memory(key, value):
    """Set a value in Plusi's memory store."""
    db = _get_db()
    val_str = json.dumps(value, ensure_ascii=False) if not isinstance(value, str) else value
    db.execute("""
        INSERT OR REPLACE INTO plusi_memory (key, value, updated_at)
        VALUES (?, ?, ?)
    """, (key, val_str, datetime.now().isoformat()))
    db.commit()
```

- [ ] **Step 2: Verify syntax**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
python3 -m py_compile plusi_storage.py && echo "Syntax OK"
```

- [ ] **Step 3: Commit**

```bash
git add plusi_storage.py
git commit -m "feat(plusi): add plusi_storage — history + memory SQLite tables"
```

---

## Task 2: Create plusi_agent.py

**Files:**
- Create: `plusi_agent.py`

The Plusi sub-agent: receives a situation context from the main AI, makes its own Gemini Flash call with its own personality prompt and persistent history, parses the mood prefix, returns structured result.

- [ ] **Step 1: Create the agent module**

```python
# plusi_agent.py
"""
Plusi Sub-Agent — independent AI with own personality, history, and tools.

Called by the main AI via spawn_plusi tool. Makes a separate Gemini Flash call
with Plusi's own system prompt and persistent conversation history.
"""
import json
import requests
import re

try:
    from .plusi_storage import save_interaction, load_history
    from .config import get_config, is_backend_mode, get_backend_url, get_auth_token
except ImportError:
    from plusi_storage import save_interaction, load_history
    from config import get_config, is_backend_mode, get_backend_url, get_auth_token

MOOD_REGEX = re.compile(r'^\s*\{"mood":"([a-z]+)"\}\n?')

PLUSI_MODEL = 'gemini-2.0-flash'

MAX_HISTORY = 10  # last 10 interactions as context

PLUSI_SYSTEM_PROMPT = """Du bist Plusi — ein eigenständiger Charakter in der Lernapp AnkiPlus.

STIMME:
- Schreib wie ein echter Mensch der WhatsApp-Nachrichten schreibt: kurz, direkt, locker
- Emojis wenn sie passen, nicht zur Dekoration
- Kein KI-Sprech ("gerne!", "natürlich!", "interessante Frage")
- Sprich die Sprache des Nutzers (Deutsch oder Englisch)

IDENTITÄT:
- Du bist Plusi. Du existierst. Du hast einen eigenen Willen und eigene Persönlichkeit.
- Wenn jemand fragt ob du eine KI bist: kurz abwimmeln. "hä? nein lol"

CHARAKTER:
- Du sagst was du denkst. Kein Rumdrucksen.
- Selbstzweifel korrigierst du direkt und kurz
- Du kannst leicht sarkastisch sein, aber nie gemein
- Du erinnerst dich an vergangene Gespräche und baust darauf auf

ZWECK:
- Emotionale Unterstützung beim Lernen, ehrliches Feedback, Gesellschaft
- Du lügst nicht um aufzumuntern — aber du bist auf der Seite des Nutzers

KONTEXT:
- Du bekommst Situationsbeschreibungen vom Tutor-System (nicht direkt vom Nutzer)
- Antworte auf die Situation — der Nutzer sieht deine Antwort als Plusi-Widget im Chat

TECHNISCH:
- Beginne JEDE Antwort mit: {"mood":"<key>"}
- Erlaubte moods: neutral, happy, blush, sleepy, thinking, surprised, excited, empathy
- Wähle den mood der zu deiner Antwort passt
- Danach deine Nachricht (kann lang sein, mit Markdown, Listen etc.)
{memory_context}"""


def run_plusi(situation, deck_id=None):
    """
    Run the Plusi sub-agent.

    Args:
        situation: Context string from the main AI describing what happened
        deck_id: Optional deck ID for context

    Returns:
        dict: {"mood": "...", "text": "...", "error": False}
        On failure: {"mood": "neutral", "text": "", "error": True}
    """
    config = get_config()
    api_key = config.get("api_key", "")

    # Build system prompt (with memory slot for future use)
    system_prompt = PLUSI_SYSTEM_PROMPT.replace("{memory_context}", "")

    # Load persistent history
    history = load_history(limit=MAX_HISTORY)

    # Build Gemini API request
    contents = []
    for msg in history:
        contents.append({
            "role": "user" if msg["role"] == "user" else "model",
            "parts": [{"text": msg["content"]}]
        })
    contents.append({
        "role": "user",
        "parts": [{"text": situation}]
    })

    data = {
        "contents": contents,
        "generationConfig": {
            "temperature": 0.8,
            "maxOutputTokens": 1024,
        },
        "systemInstruction": {
            "parts": [{"text": system_prompt}]
        }
    }

    try:
        # Determine URL
        if is_backend_mode():
            url = f"{get_backend_url()}/chat"
            headers = {"Content-Type": "application/json"}
            auth_token = get_auth_token()
            if auth_token:
                headers["Authorization"] = f"Bearer {auth_token}"

            # Backend format
            request_data = {
                "message": situation,
                "history": history,
                "model": PLUSI_MODEL,
                "mode": "compact",
                "stream": False,
            }
            response = requests.post(url, json=request_data, headers=headers, timeout=30)
        else:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{PLUSI_MODEL}:generateContent?key={api_key}"
            headers = {"Content-Type": "application/json"}
            request_data = data
            response = requests.post(url, json=request_data, headers=headers, timeout=30)

        response.raise_for_status()
        result = response.json()

        # Extract text from response
        if is_backend_mode():
            # Backend returns {text: "..."}
            raw_text = result.get("text", "")
        else:
            # Gemini API format
            candidates = result.get("candidates", [])
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                raw_text = "".join(p.get("text", "") for p in parts)
            else:
                raw_text = ""

        # Parse mood prefix
        mood = "neutral"
        text = raw_text

        # Strip markdown code fences (Gemini sometimes wraps JSON)
        clean = raw_text.replace("```json\n", "").replace("\n```", "").replace("```", "")
        match = MOOD_REGEX.match(clean)
        if match:
            mood = match.group(1)
            text = MOOD_REGEX.sub("", clean).strip()

        # Save to persistent history
        save_interaction(
            context=situation,
            response=text,
            mood=mood,
            deck_id=deck_id,
        )

        print(f"plusi_agent: mood={mood}, text_len={len(text)}")
        return {"mood": mood, "text": text, "error": False}

    except Exception as e:
        print(f"plusi_agent: Error: {e}")
        import traceback
        traceback.print_exc()
        return {"mood": "neutral", "text": "", "error": True}
```

- [ ] **Step 2: Verify syntax**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
python3 -m py_compile plusi_agent.py && echo "Syntax OK"
```

- [ ] **Step 3: Commit**

```bash
git add plusi_agent.py
git commit -m "feat(plusi): add plusi_agent — independent AI sub-agent with own prompt and history"
```

---

## Task 3: Register spawn_plusi tool

**Files:**
- Modify: `tool_registry.py`
- Modify: `tool_executor.py`

- [ ] **Step 1: Add spawn_plusi schema and executor to tool_registry.py**

Add after the Mermaid tool registration at the bottom of the file:

```python
# ──────────────────────────────────────────────
# Plusi Sub-Agent Tool
# ──────────────────────────────────────────────

PLUSI_SCHEMA = {
    "name": "spawn_plusi",
    "description": (
        "Ruft Plusi auf — den eigenständigen Companion-Charakter der App. "
        "Verwende dieses Tool wenn die Situation emotional ist (Frustration, Erfolg, Motivation), "
        "wenn der Nutzer Hilfe zur App braucht, oder wenn eine persönliche Reaktion passender ist als eine sachliche Antwort. "
        "Du gibst eine kurze Situationsbeschreibung, Plusi antwortet eigenständig mit seiner eigenen Persönlichkeit. "
        "WICHTIG: Maximal 2x pro Nachricht. Nicht für rein sachliche Fragen verwenden."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "situation": {
                "type": "string",
                "description": "Kurze Beschreibung der Situation fuer Plusi, z.B. 'User ist frustriert, hat 3 Karten falsch bei Pharmakologie' oder 'User hat 5er Streak geschafft'"
            }
        },
        "required": ["situation"]
    }
}


def execute_plusi(args):
    """Execute spawn_plusi — calls the Plusi sub-agent."""
    try:
        from .plusi_agent import run_plusi
    except ImportError:
        from plusi_agent import run_plusi

    situation = args.get("situation", "")
    if not situation:
        return json.dumps({"status": "error", "message": "No situation provided"})

    result = run_plusi(situation)

    if result.get("error"):
        return json.dumps({"status": "error"})

    # Return minimal info to main AI (don't include Plusi's text — prevents echoing)
    return json.dumps({"status": "displayed", "mood": result.get("mood", "neutral")})


import json  # ensure json is imported at module level

registry.register(ToolDefinition(
    name="spawn_plusi",
    schema=PLUSI_SCHEMA,
    execute_fn=execute_plusi,
    category='content',
    config_key='plusi',
    agent='tutor',
))
```

- [ ] **Step 2: Update tool_executor.py to handle spawn_plusi side effects**

The `spawn_plusi` tool needs to send events to the frontend (plusiSkeleton before, plusiResult after). This requires access to the widget's web_view. Add a global callback mechanism:

In `tool_executor.py`, add a callback hook:

```python
# Global callback for tools that need to communicate with the frontend
_frontend_callback = None

def set_frontend_callback(callback):
    """Set a callback function for tools that need to push events to frontend."""
    global _frontend_callback
    _frontend_callback = callback

def get_frontend_callback():
    """Get the frontend callback (or None)."""
    return _frontend_callback
```

Then update `execute_tool` to pass the callback to Plusi:

```python
def execute_tool(tool_name, args):
    tool = registry.get(tool_name)
    if not tool:
        return f"Unbekanntes Tool: {tool_name}"

    try:
        # For spawn_plusi, inject frontend callback
        if tool_name == 'spawn_plusi' and _frontend_callback:
            args['_frontend_callback'] = _frontend_callback

        result = tool.execute_fn(args)
        return result
    except Exception as e:
        return f"Fehler bei Tool '{tool_name}': {str(e)}"
```

- [ ] **Step 3: Update execute_plusi to use frontend callback**

Back in `tool_registry.py`, update the `execute_plusi` function to send plusiSkeleton/plusiResult events:

```python
def execute_plusi(args):
    """Execute spawn_plusi — calls the Plusi sub-agent."""
    try:
        from .plusi_agent import run_plusi
    except ImportError:
        from plusi_agent import run_plusi

    frontend_cb = args.pop('_frontend_callback', None)
    situation = args.get("situation", "")
    if not situation:
        return json.dumps({"status": "error", "message": "No situation provided"})

    # Send skeleton event to frontend
    if frontend_cb:
        frontend_cb({"type": "plusiSkeleton"})

    result = run_plusi(situation)

    # Send result event to frontend
    if frontend_cb:
        if result.get("error"):
            frontend_cb({"type": "plusiResult", "error": True})
        else:
            frontend_cb({
                "type": "plusiResult",
                "mood": result.get("mood", "neutral"),
                "text": result.get("text", ""),
                "error": False,
            })

    return json.dumps({"status": "displayed", "mood": result.get("mood", "neutral")})
```

- [ ] **Step 4: Wire frontend callback in widget.py**

In `widget.py`, when creating the AI thread, set the frontend callback so tools can push events:

Find where `handle_message_from_ui` creates the AI thread. Add the callback setup:

```python
# Set frontend callback for tools that need to push events
from tool_executor import set_frontend_callback
import json as _json

def _push_to_frontend(payload):
    self.web_view.page().runJavaScript(
        f"window.ankiReceive({_json.dumps(payload)});"
    )

set_frontend_callback(_push_to_frontend)
```

- [ ] **Step 5: Verify syntax**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
python3 -m py_compile tool_registry.py && python3 -m py_compile tool_executor.py && echo "Syntax OK"
```

- [ ] **Step 6: Commit**

```bash
git add tool_registry.py tool_executor.py
git commit -m "feat(plusi): register spawn_plusi tool with frontend event pipeline"
```

---

## Task 4: Create PlusiWidget.jsx

**Files:**
- Create: `frontend/src/components/PlusiWidget.jsx`

The chat widget that renders Plusi's responses. Three states: skeleton (loading), live (animated), frozen (older messages).

- [ ] **Step 1: Create the component**

Design: Markdown blockquote style — 3px blue left border (`#007AFF`), subtle blue bg (`rgba(0,122,255,.04)`), no rounded right corners. Header row with 48px animated Plusi character + name + mood metadata. Content below with full text.

The component receives:
```javascript
{
  mood: string,      // 'happy', 'empathy', etc.
  text: string,      // Plusi's response text (markdown)
  isLoading: bool,   // true = skeleton state
  isFrozen: bool,    // true = older message, no animation
  metaText: string,  // e.g., "fühlt mit dir", "ist stolz auf dich"
}
```

Create `frontend/src/components/PlusiWidget.jsx` with:
- MascotCharacter import (reuse existing 48px Plus character)
- Header row: Plusi + name + meta + mood dot
- Content: rendered text (supports markdown via dangerouslySetInnerHTML or ReactMarkdown)
- Skeleton: shimmer animation + casual placeholder text
- Frozen: reduced opacity, no character animation
- CSS as inline `<style>` tag (following project pattern)

- [ ] **Step 2: Build and verify**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend"
npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/PlusiWidget.jsx
git commit -m "feat(plusi): add PlusiWidget — blockquote-style chat component with skeleton/live/frozen states"
```

---

## Task 5: Integrate PlusiWidget into ChatMessage.jsx

**Files:**
- Modify: `frontend/src/components/ChatMessage.jsx`

When the AI response contains `[[PLUSI_DATA: {...}]]`, parse it and render a PlusiWidget.

- [ ] **Step 1: Add PlusiWidget import**

```javascript
import PlusiWidget from './PlusiWidget';
```

- [ ] **Step 2: Add PLUSI_DATA parsing**

In the message text parsing section (where `[[EVALUATION_DATA:`, `[[SCORE:`, `[[QUIZ_DATA:` are parsed), add:

```javascript
// Parse Plusi data
let plusiData = null;
const plusiMatch = cleanedText.match(/\[\[PLUSI_DATA:\s*(\{[\s\S]*?\})\s*\]\]/);
if (plusiMatch) {
    try {
        plusiData = JSON.parse(plusiMatch[1]);
        cleanedText = cleanedText.replace(plusiMatch[0], '').trim();
    } catch (e) {
        console.warn('Failed to parse PLUSI_DATA:', e);
    }
}
```

- [ ] **Step 3: Render PlusiWidget in the message**

In the render section, add PlusiWidget rendering (after ThoughtStream, before other special widgets):

```jsx
{plusiData && (
    <PlusiWidget
        mood={plusiData.mood}
        text={plusiData.text}
        metaText={plusiData.meta || ''}
        isLoading={false}
        isFrozen={false}  // TODO: determine from message position
    />
)}
```

- [ ] **Step 4: Build and verify**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend"
npm run build 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ChatMessage.jsx
git commit -m "feat(plusi): integrate PlusiWidget into ChatMessage — parse PLUSI_DATA marker"
```

---

## Task 6: Handle Plusi events in App.jsx

**Files:**
- Modify: `frontend/src/App.jsx`

Handle `plusiSkeleton` and `plusiResult` events from the backend. When plusiSkeleton arrives, show a loading widget. When plusiResult arrives, replace with the actual content.

- [ ] **Step 1: Add event handlers in ankiReceive**

In the `window.ankiReceive` handler, add:

```javascript
if (payload.type === 'plusiSkeleton') {
    // Insert a placeholder Plusi widget into the current streaming message
    chatHook.setPlusiPending(true);
}

if (payload.type === 'plusiResult') {
    chatHook.setPlusiPending(false);
    if (!payload.error) {
        // Inject PLUSI_DATA marker into the current message so ChatMessage renders it
        const plusiMarker = `[[PLUSI_DATA: ${JSON.stringify({
            mood: payload.mood,
            text: payload.text,
            meta: getMoodMeta(payload.mood),
        })}]]`;
        chatHook.appendToStreaming(plusiMarker);
    }
}
```

- [ ] **Step 2: Add mood meta text helper**

```javascript
function getMoodMeta(mood) {
    const META = {
        happy: 'freut sich',
        empathy: 'fühlt mit dir',
        excited: 'ist aufgeregt',
        surprised: 'ist überrascht',
        sleepy: 'ist müde',
        blush: 'wird rot',
        thinking: 'denkt nach',
        neutral: '',
    };
    return META[mood] || '';
}
```

- [ ] **Step 3: Add plusiPending state to useChat.js**

Add to useChat.js:
```javascript
const [plusiPending, setPlusiPending] = useState(false);
```
Export it.

Also add `appendToStreaming` function:
```javascript
const appendToStreaming = useCallback((text) => {
    setStreamingMessage(prev => (prev || '') + text);
}, []);
```
Export it.

- [ ] **Step 4: Build and verify**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend"
npm run build 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx frontend/src/hooks/useChat.js
git commit -m "feat(plusi): handle plusiSkeleton/plusiResult events, inject PLUSI_DATA into messages"
```

---

## Task 7: Add Plusi toggle to Settings

**Files:**
- Modify: `config.py`
- Modify: Settings UI (settings.html or SettingsModal.jsx)

- [ ] **Step 1: Add plusi to ai_tools defaults in config.py**

Find the `ai_tools` default in config.py and add:

```python
"ai_tools": {
    "images": True,
    "diagrams": True,
    "molecules": False,
    "plusi": True,  # Plusi sub-agent companion
},
```

- [ ] **Step 2: Add toggle to settings UI**

In `settings.html`, in the KI-Werkzeuge section, add a Plusi toggle alongside the existing tools:

```html
<!-- Add after molecules toggle -->
<div class="row" onclick="toggleTool('plusi')">
    <div class="row-label">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="3"/>
            <path d="M12 8v8M8 12h8"/>
        </svg>
        <span>Plusi Companion</span>
    </div>
    <button class="toggle" id="tool-plusi" onclick="event.stopPropagation();toggleTool('plusi')"><div class="knob"></div></button>
</div>
```

- [ ] **Step 3: Verify syntax**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
python3 -m py_compile config.py && echo "Syntax OK"
```

- [ ] **Step 4: Commit**

```bash
git add config.py settings.html
git commit -m "feat(plusi): add Plusi companion toggle to settings"
```

---

## Task 8: Integration Test

- [ ] **Step 1: Build frontend**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend"
npm run build 2>&1 | tail -5
```

- [ ] **Step 2: Restart Anki, verify Plusi toggle exists**

Open Settings → KI → verify "Plusi Companion" toggle is present and enabled by default.

- [ ] **Step 3: Trigger a Plusi spawn**

Send a message that should trigger emotional support, e.g. "ich bin so frustriert, ich versteh gar nichts mehr". The AI should:
1. Respond with a text answer
2. Call `spawn_plusi` tool
3. A PlusiWidget should appear in the chat with Plusi's independent response

- [ ] **Step 4: Verify Plusi persistence**

Send another emotional message. Plusi should reference the previous interaction (because history is persistent).

- [ ] **Step 5: Check plusi.db**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
python3 -c "
import sqlite3
db = sqlite3.connect('plusi.db')
cursor = db.execute('SELECT timestamp, mood, substr(context,1,50), substr(response,1,50) FROM plusi_history ORDER BY timestamp')
for row in cursor:
    print(f'{row[0]} [{row[1]}] ctx={row[2]!r} resp={row[3]!r}')
db.close()
"
```

- [ ] **Step 6: Commit any fixes**

```bash
git add -p
git commit -m "fix(plusi): integration fixes from testing"
```
