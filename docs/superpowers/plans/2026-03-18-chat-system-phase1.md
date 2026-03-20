# Chat System Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the chat work reliably with per-card SQLite sessions, request-ID-based streaming, and proper error handling. Remove the legacy JSON session system entirely.

**Architecture:** Single session system (SQLite per card) with request-ID-based streaming. Every AI request gets a UUID. All streaming chunks, steps, citations, and errors reference this ID. Legacy JSON sessions removed. Frontend generates requestId, backend passes it through all signals.

**Tech Stack:** Python 3.9+ (PyQt6, SQLite), React 18 (Vite), Gemini API

**Spec:** `docs/superpowers/specs/2026-03-18-chat-system-redesign.md`

---

### Task 1: Add request_id column to SQLite schema

**Files:**
- Modify: `card_sessions_storage.py:55-65` (messages table schema)
- Modify: `card_sessions_storage.py:222-265` (save_message function)
- Modify: `card_sessions_storage.py:78-127` (load_card_session function)

- [ ] **Step 1: Add `request_id` column to messages table**

In `_init_schema()` (line 55-65), add `request_id TEXT` column to messages table:

Note: The existing schema uses `TEXT` primary keys (not INTEGER AUTOINCREMENT). Preserve this convention. Add `request_id TEXT` after the `citations` column:

```python
CREATE TABLE IF NOT EXISTS messages (
    id         TEXT PRIMARY KEY,
    card_id    INTEGER NOT NULL,
    section_id TEXT,
    text       TEXT NOT NULL,
    sender     TEXT NOT NULL,
    created_at TEXT,
    steps      TEXT,
    citations  TEXT,
    request_id TEXT,
    FOREIGN KEY (card_id) REFERENCES card_sessions(card_id) ON DELETE CASCADE
)
```

- [ ] **Step 2: Add `previous_score` column to review_sections table**

In `_init_schema()` (line 45-53), add `previous_score` column:

Note: Existing schema uses `TEXT` primary key. Add `previous_score REAL` after `performance_data`:

```python
CREATE TABLE IF NOT EXISTS review_sections (
    id              TEXT PRIMARY KEY,
    card_id         INTEGER NOT NULL,
    title           TEXT,
    created_at      TEXT,
    performance_type TEXT,
    performance_data TEXT,
    previous_score  REAL,
    FOREIGN KEY (card_id) REFERENCES card_sessions(card_id) ON DELETE CASCADE
)
```

- [ ] **Step 3: Update `save_message()` to accept and persist request_id**

In `save_message()` (line 222-265):

```python
def save_message(card_id, text, sender, section_id=None, steps=None, citations=None, request_id=None):
    db = _get_db()
    cursor = db.execute(
        """INSERT INTO messages (card_id, section_id, text, sender, steps, citations, request_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (card_id, section_id, text, sender,
         json.dumps(steps) if steps else None,
         json.dumps(citations) if citations else None,
         request_id)
    )
    db.commit()
    _enforce_message_limit(card_id)
    return cursor.lastrowid
```

- [ ] **Step 4: Update `load_card_session()` to return request_id in messages**

In `load_card_session()` (line 78-127), ensure the SELECT query includes `request_id` and the message dict includes it.

- [ ] **Step 5: Handle schema migration for existing databases**

Add migration logic after `_init_schema()` to add missing columns to existing tables:

```python
def _migrate_schema():
    db = _get_db()
    # Add request_id to messages if missing
    try:
        db.execute("SELECT request_id FROM messages LIMIT 1")
    except Exception:
        db.execute("ALTER TABLE messages ADD COLUMN request_id TEXT")
    # Add previous_score to review_sections if missing
    try:
        db.execute("SELECT previous_score FROM review_sections LIMIT 1")
    except Exception:
        db.execute("ALTER TABLE review_sections ADD COLUMN previous_score REAL")
    db.commit()
```

Call `_migrate_schema()` after `_init_schema()` in `_get_db()`.

- [ ] **Step 6: Commit**

```bash
git add card_sessions_storage.py
git commit -m "feat(chat): add request_id to messages schema and previous_score to sections"
```

---

### Task 2: Add request-ID to AIRequestThread signals

**Files:**
- Modify: `widget.py:826-881` (AIRequestThread class)
- Modify: `widget.py:883-909` (first on_streaming_chunk — DELETE)
- Modify: `widget.py:941-982` (second on_streaming_chunk + on_error — KEEP and refactor)

- [ ] **Step 1: Update AIRequestThread signal definitions**

At lines 827-829, change signals to include requestId:

```python
class AIRequestThread(QThread):
    chunk_signal = pyqtSignal(str, str, bool, bool)  # requestId, chunk, done, is_function_call
    error_signal = pyqtSignal(str, str)  # requestId, error_message
    finished_signal = pyqtSignal(str)  # requestId
    metadata_signal = pyqtSignal(str, object, object)  # requestId, steps, citations (use `object` not `list` — PyQt requires it)
```

- [ ] **Step 2: Update AIRequestThread.__init__() to accept requestId**

```python
def __init__(self, ai, message, mode="chat", request_id=None, card_context=None):
    super().__init__()
    self.ai = ai
    self.message = message
    self.mode = mode
    self.request_id = request_id or str(uuid.uuid4())
    self.card_context = card_context
    self._cancelled = False
```

- [ ] **Step 3: Update AIRequestThread.run() to emit requestId with all signals**

In the `run()` method, the streaming callback should emit requestId:

```python
def run(self):
    try:
        def callback(chunk, done, is_function_call=False, steps=None, citations=None):
            if self._cancelled:
                return
            self.chunk_signal.emit(self.request_id, chunk, done, is_function_call)
            if done and (steps or citations):
                self.metadata_signal.emit(self.request_id, steps or [], citations or [])

        response = self.ai.get_response_with_rag(
            self.message, callback=callback, mode=self.mode, card_context=self.card_context
        )
        self.finished_signal.emit(self.request_id)
    except Exception as e:
        self.error_signal.emit(self.request_id, str(e))
```

- [ ] **Step 4: Delete the first (dead) on_streaming_chunk at lines 883-909**

This is the companion chat copy that is unreachable due to the second definition. Remove entirely.

- [ ] **Step 5: Refactor streaming handlers to widget methods**

**IMPORTANT:** The current `on_streaming_chunk` and `on_error` are nested closures inside `handle_message_from_ui()` (not widget methods). They capture variables like `message` from the outer scope. Refactor them into proper widget methods that receive `request_id` via the signal:

```python
# Add these as methods on ChatbotWidget class:

def on_streaming_chunk(self, request_id, chunk, done, is_function_call):
    payload = {
        "type": "streaming",
        "requestId": request_id,
        "chunk": chunk,
        "done": done,
        "isFunctionCall": is_function_call
    }
    self._send_to_js(payload)

def on_error(self, request_id, error_message):
    payload = {
        "type": "error",
        "requestId": request_id,
        "message": error_message
    }
    self._send_to_js(payload)

def on_metadata(self, request_id, steps, citations):
    payload = {
        "type": "metadata",
        "requestId": request_id,
        "steps": steps,
        "citations": [c if isinstance(c, dict) else c for c in citations]
    }
    self._send_to_js(payload)
```

Remove both nested closure copies of `on_streaming_chunk` and `on_error` from `handle_message_from_ui()`.

- [ ] **Step 6: Update signal connections in handle_message_from_ui()**

Replace the closure-based signal connections with widget method connections:

```python
thread.chunk_signal.connect(self.on_streaming_chunk)
thread.error_signal.connect(self.on_error)
thread.metadata_signal.connect(self.on_metadata)
```

- [ ] **Step 7: Add `import uuid` to widget.py**

At the top of widget.py, add `import uuid` if not already present.

- [ ] **Step 9: Commit**

```bash
git add widget.py
git commit -m "feat(chat): add request-ID to AIRequestThread signals, remove dead streaming handler"
```

---

### Task 3: Update ai_handler.py to pass metadata through callback

**Files:**
- Modify: `ai_handler.py:161-176` (AIHandler.__init__ — remove _last_rag_metadata)
- Modify: `ai_handler.py:3258-3274` (enhanced_callback)
- Modify: `ai_handler.py:1992-2054` (_emit_ai_state)

- [ ] **Step 1: Remove `_last_rag_metadata` from __init__**

At line 174, remove:
```python
# DELETE: self._last_rag_metadata = None
```

- [ ] **Step 2: Update enhanced_callback to pass metadata through callback args**

At lines 3258-3274, change enhanced_callback to pass steps/citations on done:

```python
def enhanced_callback(chunk, done, is_function_call=False):
    if done:
        self._emit_ai_state("Fertiggestellt", phase=self.PHASE_FINISHED)
        if callback:
            callback(chunk, done, is_function_call,
                     steps=self._current_request_steps,
                     citations=citations)
    else:
        if callback:
            callback(chunk, done, is_function_call)
```

- [ ] **Step 3: Remove all reads of `_last_rag_metadata` in widget.py**

Search widget.py for `_last_rag_metadata` references and remove them. The metadata now flows through the callback/signal, not through shared state.

- [ ] **Step 4: Commit**

```bash
git add ai_handler.py widget.py
git commit -m "fix(chat): pass RAG metadata through callback instead of shared state"
```

---

### Task 4: Remove legacy JSON session system

**Files:**
- Delete references in: `widget.py:329-391` (loadSessions/saveSessions handlers)
- Delete references in: `bridge.py:~679-697` (loadSessions/saveSessions slots)
- Delete file: `frontend/src/hooks/useSessions.js`
- Modify: `frontend/src/App.jsx` (remove useSessions import and usage)
- Modify: `frontend/src/contexts/SessionContext.jsx` (remove loadSessions call)

- [ ] **Step 1: Remove loadSessions/saveSessions from widget.py _handle_js_message()**

Delete the case handlers for `loadSessions` and `saveSessions` (lines 329-391).

- [ ] **Step 2: Remove loadSessions/saveSessions from bridge.py**

Delete the `@pyqtSlot` methods `loadSessions()` and `saveSessions()`.

- [ ] **Step 3: Delete useSessions.js**

```bash
rm frontend/src/hooks/useSessions.js
```

- [ ] **Step 4: Remove useSessions import and usage from App.jsx**

Find and remove:
- Import: `import { useSessions } from './hooks/useSessions'`
- Hook call: `const { sessions, setSessions, ... } = useSessions(bridge)`
- Any props passing sessions/setSessions to child components

Replace session data source with useCardSession where needed.

- [ ] **Step 5: Remove legacy loadSessions call from SessionContext.jsx**

Remove the `bridge.loadSessions()` call and the `sessionsLoaded` event listener (lines 56-106). Sessions are now loaded per-card via useCardSession.

- [ ] **Step 6: Clean up any remaining sessions.json references**

Search codebase for `sessions.json`, `loadSessions`, `saveSessions` and remove remaining references.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(chat): remove legacy JSON session system entirely"
```

---

### Task 5: Wire SQLite sessions into the chat flow

**Files:**
- Modify: `frontend/src/hooks/useChat.js:141-350` (handleSend)
- Modify: `frontend/src/hooks/useChat.js:83-119` (appendMessage)
- Modify: `frontend/src/hooks/useCardSession.js:118-151` (saveMessage)
- Modify: `frontend/src/App.jsx` (ankiReceive handler)

- [ ] **Step 1: Add requestId generation to useChat.handleSend()**

At the beginning of `handleSend()` (line 141), generate a requestId:

```javascript
const requestId = crypto.randomUUID?.() ||
                  `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
```

Pass it with the message to the bridge:

```javascript
bridge.sendMessage(JSON.stringify({
  message: text,
  requestId: requestId,
  history: history,
  mode: mode
}));
```

- [ ] **Step 2: Save user message to SQLite immediately**

After sending to bridge, persist the user message immediately via useCardSession:

```javascript
if (cardSessionHookRef.current && currentCardId) {
  cardSessionHookRef.current.saveMessage(currentCardId, {
    text: text,
    sender: 'user',
    section_id: currentSectionId,
    request_id: requestId
  });
}
```

- [ ] **Step 3: Update streaming handler to match by requestId**

In the ankiReceive handler (in useChat or App.jsx), match streaming chunks by requestId:

```javascript
if (payload.type === 'streaming' && payload.requestId) {
  // Update streaming state for this specific request
  if (payload.done) {
    // Finalize: save bot message to SQLite
    const botMessage = {
      text: accumulatedText,
      sender: 'bot',
      section_id: currentSectionId,
      request_id: payload.requestId,
      steps: currentSteps,
      citations: currentCitations
    };
    if (cardSessionHookRef.current && currentCardId) {
      cardSessionHookRef.current.saveMessage(currentCardId, botMessage);
    }
  } else {
    // Accumulate streaming text
    setStreamingMessage(prev => (prev || '') + payload.chunk);
  }
}
```

- [ ] **Step 4: Handle metadata signal**

```javascript
if (payload.type === 'metadata' && payload.requestId) {
  setCurrentSteps(payload.steps || []);
  setCurrentCitations(payload.citations || []);
}
```

- [ ] **Step 5: Handle error signal**

**Note:** The old code sent errors as `{type: "bot"}` messages. The new system sends `{type: "error", requestId, message}`. Remove any existing frontend code that handles errors via `type: "bot"` messages (check for error-like text patterns in bot message handlers) and replace with the clean error path:

```javascript
if (payload.type === 'error' && payload.requestId) {
  setIsLoading(false);
  setStreamingMessage(null);
  // Add error message to chat with 'error' sender for distinct styling
  appendMessage({
    text: payload.message,
    sender: 'error',
    request_id: payload.requestId
  });
}
```

- [ ] **Step 6: Remove the 1500ms hardcoded delay for section titles**

In handleSend() (lines 188-194), remove the `setTimeout` with 1500ms delay. With requestId, section title generation can happen immediately without race conditions:

```javascript
// Generate section title immediately (requestId prevents collision)
bridge.generateSectionTitle(questionText, answerText, sectionId);
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/hooks/useChat.js frontend/src/hooks/useCardSession.js frontend/src/App.jsx
git commit -m "feat(chat): wire SQLite sessions into chat flow with requestId-based streaming"
```

---

### Task 6: Handle card switching (chat close + session save)

**Files:**
- Modify: `frontend/src/App.jsx` (cardContext handler)
- Modify: `frontend/src/hooks/useCardSession.js` (loadCardSession)
- Modify: `widget.py` (sendMessage handler — accept requestId from frontend)

- [ ] **Step 1: Update cardContext handler in App.jsx**

When `cardContext` event arrives (card changed):

```javascript
if (payload.type === 'cardContext') {
  const newCardId = payload.data.cardId;
  const isQuestion = payload.data.isQuestion;

  // Chat auto-closes on new card (isQuestion=true means card not yet flipped)
  if (isQuestion) {
    // Close chat panel
    setChatOpen(false);
  }

  // Update card context
  cardContextHookRef.current?.setCardContext(payload.data);

  // Load session for new card
  cardSessionHookRef.current?.loadCardSession(newCardId);
}
```

- [ ] **Step 2: Load messages from SQLite when card session is loaded**

In useCardSession `handleCardSessionLoaded()`, populate chat messages:

```javascript
function handleCardSessionLoaded(payload) {
  const session = payload.data;
  setCurrentSession(session);
  setCurrentCardId(session.card_id);

  // Cache the session
  sessionCacheRef.current.set(session.card_id, session);

  // Emit event so useChat can load messages
  window.dispatchEvent(new CustomEvent('cardSessionReady', {
    detail: { session }
  }));
}
```

- [ ] **Step 3: useChat listens for cardSessionReady**

In useChat, listen for the session ready event:

```javascript
useEffect(() => {
  const handler = (e) => {
    const { session } = e.detail;
    if (session && session.messages) {
      setMessages(session.messages);
    } else {
      setMessages([]);
    }
    setIsLoading(false);
  };
  window.addEventListener('cardSessionReady', handler);
  return () => window.removeEventListener('cardSessionReady', handler);
}, []);
```

- [ ] **Step 4: Update widget.py to pass requestId through the message flow**

The `sendMessage` case in `_handle_js_message()` (lines 163-176) calls `handle_message_from_ui()`. Update `handle_message_from_ui()` (line 784) to:
1. Accept `request_id` parameter
2. Parse it from the incoming message data
3. Pass it to `AIRequestThread`

In `_handle_js_message()` sendMessage handler, parse requestId and pass it:

```python
elif msg_type == 'sendMessage':
    data = json.loads(msg_data) if isinstance(msg_data, str) else msg_data
    message = data.get('message', '')
    request_id = data.get('requestId', str(uuid.uuid4()))
    history = data.get('history', [])
    mode = data.get('mode', 'chat')
    self.handle_message_from_ui(message, history=history, mode=mode, request_id=request_id)
```

In `handle_message_from_ui()` signature, add `request_id=None` parameter and pass to thread:

```python
def handle_message_from_ui(self, message, history=None, mode='compact', request_id=None):
    request_id = request_id or str(uuid.uuid4())
    # ... existing setup ...
    thread = AIRequestThread(self.ai, message, mode=mode, request_id=request_id)
    thread.chunk_signal.connect(self.on_streaming_chunk)
    thread.error_signal.connect(self.on_error)
    thread.metadata_signal.connect(self.on_metadata)
    self._current_thread = thread
    thread.start()
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx frontend/src/hooks/useCardSession.js frontend/src/hooks/useChat.js widget.py
git commit -m "feat(chat): handle card switching with session load/save and chat close"
```

---

### Task 7: Clean up and verify end-to-end flow

**Files:**
- All modified files from Tasks 1-6
- Verify: `card_tracker.py` (no changes needed, but verify cardContext emission)
- Verify: `custom_reviewer/__init__.py` (chat button only on flipped cards)

- [ ] **Step 1: Verify no remaining references to legacy session system**

Search for and remove any remaining references:
- `sessions.json` in Python files
- `loadSessions` / `saveSessions` in JS files
- `useSessions` imports anywhere
- `sessionsLoaded` event listeners

- [ ] **Step 2: Verify card_tracker.py sends isQuestion flag correctly**

Read `card_tracker.py:143-161` and confirm `isQuestion` is sent in cardContext payload. No changes needed if already present.

- [ ] **Step 3: Verify custom_reviewer shows chat button only when flipped**

Read `custom_reviewer/template.html` and `custom_reviewer/interactions.js` to confirm chat open button is only visible when `isQuestion === false`.

- [ ] **Step 4: Test the complete flow mentally / via code review**

Verify the signal chain:
1. User flips card → `cardContext(isQuestion=false)` sent
2. User opens chat → loads session from SQLite (or empty)
3. User types message → `requestId` generated → message saved to SQLite → sent to backend
4. Backend streams → `streaming(requestId, chunk)` → frontend accumulates
5. Stream done → `metadata(requestId, steps, citations)` → bot message saved to SQLite
6. Error → `error(requestId, message)` → shown in chat
7. Next card → chat closes → session already persisted

- [ ] **Step 5: Build frontend**

```bash
cd frontend && npm run build
```

- [ ] **Step 6: Commit final cleanup**

```bash
git add -A
git commit -m "chore(chat): clean up legacy references, verify end-to-end chat flow"
```

---

## Summary

| Task | Description | Files | Estimated Complexity |
|------|-------------|-------|---------------------|
| 1 | SQLite schema updates | card_sessions_storage.py | Simple |
| 2 | Request-ID signals in AIRequestThread | widget.py | Medium |
| 3 | Metadata through callback (not shared state) | ai_handler.py, widget.py | Medium |
| 4 | Remove legacy JSON sessions | widget.py, bridge.py, useSessions.js, App.jsx, SessionContext.jsx | Medium |
| 5 | Wire SQLite into chat flow | useChat.js, useCardSession.js, App.jsx | Complex |
| 6 | Card switching (close + load) | App.jsx, useCardSession.js, useChat.js, widget.py | Medium |
| 7 | Cleanup and verification | All files | Simple |
