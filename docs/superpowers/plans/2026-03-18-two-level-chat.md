# Two-Level Chat Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deck-level chronological chat view alongside the existing card-level chat, so users see their full learning conversation on the deck overview while keeping focused card-specific chats during review.

**Architecture:** The existing `messages` table gets three new columns (`deck_id`, `source`, nullable `card_id`). New Python storage functions handle deck-level queries. New bridge methods expose deck message loading/saving to the frontend. The frontend gets a deck-chat mode that shows all messages chronologically when on the deck overview, while card-chat remains unchanged during review. AI context switches automatically based on location.

**Tech Stack:** Python 3.9+, SQLite (existing `card_sessions.db`), React 18, existing bridge/message-queue system.

**Spec:** `docs/superpowers/specs/2026-03-18-plusi-unified-identity.md` — Section 2 (Two-Level Chat Architecture)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `card_sessions_storage.py` | **Modify** | Schema migration, new deck-level query/save functions |
| `bridge.py` | **Modify** | New bridge methods: `loadDeckMessages`, `saveDeckMessage` |
| `widget.py` | **Modify** | Handle new message types in `_handle_js_message` |
| `frontend/src/hooks/useChat.js` | **Modify** | Deck-chat mode: load/save deck messages, context switching |
| `frontend/src/hooks/useCardSession.js` | **Modify** | Populate `deck_id` when saving card messages |
| `frontend/src/App.jsx` | **Modify** | Pass deck-chat mode flag, wire deck message loading |

---

## Task 1: Schema Migration

**Files:**
- Modify: `card_sessions_storage.py`

The existing `messages` table has `card_id INTEGER NOT NULL` with a foreign key to `card_sessions(card_id)`. We need to:
1. Make `card_id` nullable (deck-level messages have no card)
2. Add `deck_id INTEGER` column (for deck-level queries)
3. Add `source TEXT DEFAULT 'tutor'` column (for distinguishing Plusi messages later)
4. Add index on `(deck_id, created_at)` for fast chronological queries

- [ ] **Step 1: Add migration function to card_sessions_storage.py**

Add this function after the existing `_init_db()`:

```python
def _migrate_schema(db):
    """Run schema migrations for two-level chat support."""
    cursor = db.cursor()

    # Check if migration is needed by looking for deck_id column
    cursor.execute("PRAGMA table_info(messages)")
    columns = [col[1] for col in cursor.fetchall()]

    if 'deck_id' not in columns:
        print("card_sessions_storage: Running two-level chat migration...")

        # SQLite doesn't support ALTER COLUMN or DROP CONSTRAINT,
        # so we recreate the table to make card_id nullable.
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS messages_new (
                id TEXT PRIMARY KEY,
                card_id INTEGER,
                section_id TEXT,
                text TEXT NOT NULL,
                sender TEXT NOT NULL,
                created_at TEXT NOT NULL,
                steps TEXT,
                citations TEXT,
                request_id TEXT,
                deck_id INTEGER,
                source TEXT DEFAULT 'tutor',
                FOREIGN KEY (card_id) REFERENCES card_sessions(card_id) ON DELETE CASCADE,
                FOREIGN KEY (section_id) REFERENCES review_sections(id) ON DELETE SET NULL
            )
        """)

        # Copy existing data, populating deck_id from card_sessions
        cursor.execute("""
            INSERT OR IGNORE INTO messages_new
                (id, card_id, section_id, text, sender, created_at, steps, citations, request_id, deck_id, source)
            SELECT
                m.id, m.card_id, m.section_id, m.text, m.sender, m.created_at,
                m.steps, m.citations, m.request_id,
                cs.deck_id,
                'tutor'
            FROM messages m
            LEFT JOIN card_sessions cs ON m.card_id = cs.card_id
        """)

        # Swap tables
        cursor.execute("DROP TABLE messages")
        cursor.execute("ALTER TABLE messages_new RENAME TO messages")

        # Recreate indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_messages_card ON messages(card_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_messages_deck_time ON messages(deck_id, created_at)")

        db.commit()
        print("card_sessions_storage: Migration complete")
```

- [ ] **Step 2: Call migration from _init_db()**

Find the `_init_db()` function. At the end, after all CREATE TABLE statements, add:

```python
    _migrate_schema(db)
```

- [ ] **Step 3: Add deck-level query functions**

Add these new functions:

```python
def load_deck_messages(deck_id, limit=50):
    """Load messages for a deck chronologically (all cards + deck-level)."""
    db = _get_db()
    cursor = db.cursor()
    cursor.execute("""
        SELECT m.id, m.card_id, m.section_id, m.text, m.sender, m.created_at,
               m.steps, m.citations, m.request_id, m.deck_id, m.source,
               cs.deck_name
        FROM messages m
        LEFT JOIN card_sessions cs ON m.card_id = cs.card_id
        WHERE m.deck_id = ?
        ORDER BY m.created_at DESC
        LIMIT ?
    """, (deck_id, limit))

    rows = cursor.fetchall()
    messages = []
    for row in rows:
        msg = {
            'id': row[0], 'card_id': row[1], 'section_id': row[2],
            'text': row[3], 'sender': row[4], 'created_at': row[5],
            'steps': row[6], 'citations': row[7], 'request_id': row[8],
            'deck_id': row[9], 'source': row[10],
            'deck_name': row[11],
        }
        messages.append(msg)

    # Return in chronological order (query was DESC for LIMIT)
    messages.reverse()
    return messages


def save_deck_message(deck_id, message):
    """Save a deck-level message (card_id = NULL)."""
    db = _get_db()
    cursor = db.cursor()

    msg_id = message.get('id', str(uuid.uuid4()))
    cursor.execute("""
        INSERT OR REPLACE INTO messages
            (id, card_id, section_id, text, sender, created_at, steps, citations, request_id, deck_id, source)
        VALUES (?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        msg_id,
        message.get('text', ''),
        message.get('sender', 'user'),
        message.get('created_at', datetime.now().isoformat()),
        message.get('steps'),
        message.get('citations'),
        message.get('request_id'),
        deck_id,
        message.get('source', 'tutor'),
    ))

    db.commit()
    return True
```

- [ ] **Step 4: Update save_message() to populate deck_id**

Find the existing `save_message(card_id, message)` function. When inserting a message, also populate `deck_id` from the card_sessions table. Add after the INSERT:

```python
    # Populate deck_id from card_sessions if not already set
    cursor.execute("""
        UPDATE messages SET deck_id = (
            SELECT deck_id FROM card_sessions WHERE card_id = ?
        ) WHERE id = ? AND deck_id IS NULL
    """, (card_id, msg_id))
```

- [ ] **Step 5: Add uuid import if not already present**

Check the imports at the top of the file. Add `import uuid` if not already imported.

- [ ] **Step 6: Verify syntax**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
python3 -m py_compile card_sessions_storage.py && echo "Syntax OK"
```

- [ ] **Step 7: Commit**

```bash
git add card_sessions_storage.py
git commit -m "feat(chat): schema migration for two-level chat — nullable card_id, deck_id, source columns"
```

---

## Task 2: Bridge Methods for Deck Messages

**Files:**
- Modify: `bridge.py`
- Modify: `widget.py`

- [ ] **Step 1: Add bridge methods to bridge.py**

Find the section with `loadCardSession` / `saveCardSession` methods (around line 679). Add nearby:

```python
@pyqtSlot(str, result=str)
def loadDeckMessages(self, deck_id_str):
    """Load chronological messages for a deck (all cards + deck-level)."""
    try:
        from .card_sessions_storage import load_deck_messages
    except ImportError:
        from card_sessions_storage import load_deck_messages

    try:
        deck_id = int(deck_id_str)
        messages = load_deck_messages(deck_id, limit=50)
        return json.dumps({"success": True, "messages": messages})
    except Exception as e:
        print(f"loadDeckMessages error: {e}")
        return json.dumps({"success": False, "messages": [], "error": str(e)})

@pyqtSlot(str, result=str)
def saveDeckMessage(self, data_json):
    """Save a deck-level message (no card association)."""
    try:
        from .card_sessions_storage import save_deck_message
    except ImportError:
        from card_sessions_storage import save_deck_message

    try:
        data = json.loads(data_json)
        deck_id = data.get('deckId')
        message = data.get('message', {})
        success = save_deck_message(deck_id, message)
        return json.dumps({"success": success})
    except Exception as e:
        print(f"saveDeckMessage error: {e}")
        return json.dumps({"success": False, "error": str(e)})
```

- [ ] **Step 2: Add message queue handlers in widget.py**

Find `_handle_js_message` in widget.py. Add handlers for the new message types alongside the existing `loadCardSession` handler:

```python
elif msg_type == 'loadDeckMessages':
    deck_id = data if isinstance(data, (int, str)) else data.get('deckId')
    try:
        from .card_sessions_storage import load_deck_messages
    except ImportError:
        from card_sessions_storage import load_deck_messages

    try:
        messages = load_deck_messages(int(deck_id), limit=50)
        payload = {"type": "deckMessagesLoaded", "deckId": int(deck_id), "messages": messages}
        self.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
    except Exception as e:
        print(f"loadDeckMessages error: {e}")

elif msg_type == 'saveDeckMessage':
    try:
        msg_data = json.loads(data) if isinstance(data, str) else data
        deck_id = msg_data.get('deckId')
        message = msg_data.get('message', {})
        from .card_sessions_storage import save_deck_message
    except ImportError:
        from card_sessions_storage import save_deck_message

    try:
        save_deck_message(int(deck_id), message)
    except Exception as e:
        print(f"saveDeckMessage error: {e}")
```

- [ ] **Step 3: Verify syntax**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
python3 -m py_compile bridge.py && python3 -m py_compile widget.py && echo "Syntax OK"
```

- [ ] **Step 4: Commit**

```bash
git add bridge.py widget.py
git commit -m "feat(chat): bridge methods for deck-level message loading and saving"
```

---

## Task 3: Frontend Deck-Chat Mode

**Files:**
- Modify: `frontend/src/hooks/useChat.js`
- Modify: `frontend/src/App.jsx`

This task adds the ability for the chat to show deck-level messages when on the deck overview, while keeping card-level messages during review.

- [ ] **Step 1: Add deck message handling to useChat.js**

Add a new state and functions for deck-level messages. Find the hook's state declarations and add:

```javascript
const [deckChatMode, setDeckChatMode] = useState(false);
const deckMessagesLoadedRef = useRef(false);
```

Add a function to load deck messages:

```javascript
const loadDeckMessages = useCallback((deckId) => {
    if (!deckId) return;
    window.ankiBridge?.addMessage('loadDeckMessages', String(deckId));
}, []);
```

Add a function to save a deck-level message:

```javascript
const saveDeckMessage = useCallback((deckId, message) => {
    if (!deckId) return;
    window.ankiBridge?.addMessage('saveDeckMessage', JSON.stringify({
        deckId,
        message: {
            id: message.id,
            text: message.text,
            sender: message.from || message.sender,
            created_at: message.createdAt || message.timestamp || new Date().toISOString(),
            steps: message.steps ? JSON.stringify(message.steps) : null,
            citations: message.citations ? JSON.stringify(message.citations) : null,
            request_id: message.requestId,
            source: message.source || 'tutor',
        },
    }));
}, []);
```

Export `deckChatMode`, `setDeckChatMode`, `loadDeckMessages`, and `saveDeckMessage` from the hook.

- [ ] **Step 2: Handle deckMessagesLoaded event in App.jsx**

In the `window.ankiReceive` handler in App.jsx, add alongside the existing `cardSessionLoaded` handler:

```javascript
if (payload.type === 'deckMessagesLoaded') {
    const msgs = (payload.messages || []).map(m => ({
        id: m.id,
        text: m.text,
        from: m.sender,
        cardId: m.card_id,
        deckId: m.deck_id,
        createdAt: m.created_at,
        source: m.source || 'tutor',
        steps: m.steps ? JSON.parse(m.steps) : null,
        citations: m.citations ? JSON.parse(m.citations) : null,
        requestId: m.request_id,
    }));
    chatHook.setMessages(msgs);
}
```

- [ ] **Step 3: Wire deck-chat mode to navigation**

When the user navigates to the deck overview (DeckBrowser), set deck-chat mode. When they enter a card review, clear it. Find the navigation logic and add:

When entering deck overview (search for `forceShowOverview` or `handleNavigateToOverview`):
```javascript
chatHook.setDeckChatMode(true);
// Load deck messages for current deck
if (sessionContext.currentSession?.deckId) {
    chatHook.loadDeckMessages(sessionContext.currentSession.deckId);
}
```

When entering card review (in the cardContext handler):
```javascript
chatHook.setDeckChatMode(false);
```

- [ ] **Step 4: Update handleSend for deck-chat mode**

In `handleSend` (in App.jsx or useChat.js), when `deckChatMode` is true, save messages as deck-level instead of card-level:

```javascript
if (chatHook.deckChatMode) {
    // Deck-level message — save without card association
    chatHook.saveDeckMessage(sessionContext.currentSession?.deckId, userMessage);
    // ... send to AI with deck context (no card content)
} else {
    // Card-level message — existing flow
    // ...
}
```

- [ ] **Step 5: Build and verify**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend"
npm run build 2>&1 | tail -5
```
Expected: `✓ built in X.XXs`

- [ ] **Step 6: Commit**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
git add frontend/src/hooks/useChat.js frontend/src/App.jsx
git commit -m "feat(chat): deck-chat mode — chronological messages on deck overview"
```

---

## Task 4: Context Switching for AI

**Files:**
- Modify: `frontend/src/App.jsx` or `frontend/src/hooks/useChat.js`

The AI should receive different context depending on location:
- **Card-level:** Card content (front/back) + card-specific chat history
- **Deck-level:** Last N messages chronologically, NO card content

- [ ] **Step 1: Modify the message sending to vary context by mode**

In the `handleSend` function, when building the AI request:

```javascript
if (chatHook.deckChatMode) {
    // Deck context: no card, use recent deck messages as history
    const history = chatHook.messages.slice(-10).map(m => ({
        role: m.from === 'user' ? 'user' : 'assistant',
        content: m.text,
    }));
    bridge.sendMessage(text, history, mode, requestId);
    // Note: no card context passed — AI uses search_cards tool if needed
} else {
    // Card context: existing flow (card content + card messages)
    // ... (keep existing code)
}
```

- [ ] **Step 2: Save AI responses in correct tier**

When the AI responds (in the streaming handler), save to the correct tier:

```javascript
// In the streaming done handler:
if (chatHook.deckChatMode) {
    chatHook.saveDeckMessage(deckId, botMessage);
} else {
    cardSessionHook.saveMessage(cardId, botMessage);
}
```

- [ ] **Step 3: Build and verify**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend"
npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
git add frontend/src/hooks/useChat.js frontend/src/App.jsx
git commit -m "feat(chat): context switching — card content for review, chronological for deck overview"
```

---

## Task 5: Update useCardSession to populate deck_id

**Files:**
- Modify: `frontend/src/hooks/useCardSession.js`

When saving card-level messages, include `deck_id` so they appear in the deck chronological view.

- [ ] **Step 1: Pass deckId through saveMessage**

Find the `saveMessage` function. When building the payload, include `deckId`:

```javascript
const payload = {
    cardId,
    message: {
        id: message.id,
        text: message.text,
        sender: message.from || message.sender || 'user',
        section_id: message.sectionId,
        created_at: message.createdAt || message.timestamp || new Date().toISOString(),
        steps: message.steps ? JSON.stringify(message.steps) : null,
        citations: message.citations ? JSON.stringify(message.citations) : null,
        request_id: message.requestId,
    },
    deckId: currentDeckId, // NEW — ensure messages get deck_id for chronological view
};
```

The `currentDeckId` needs to come from somewhere — either passed as a parameter, or available from context. Check if the hook has access to deck information.

- [ ] **Step 2: Build and verify**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend"
npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
git add frontend/src/hooks/useCardSession.js
git commit -m "feat(chat): pass deck_id when saving card messages for chronological view"
```

---

## Task 6: Integration Test

- [ ] **Step 1: Restart Anki, verify card-level chat still works**

Open a deck, review cards, send messages. Verify:
- Messages appear in sidebar chat
- Messages persist when switching cards and coming back
- No errors in console

- [ ] **Step 2: Verify deck-level chat**

Navigate to deck overview. The chat should show chronological messages from all cards in this deck. Send a message from the overview — it should appear in the stream but NOT in any card's specific chat.

- [ ] **Step 3: Verify one-way upstream flow**

Go back to card review, send a message. Navigate back to deck overview. The card message should appear in the chronological stream. Deck-level messages (sent from overview) should NOT appear in any card chat.

- [ ] **Step 4: Commit fixes if needed**

```bash
git add -p
git commit -m "fix(chat): integration fixes from two-level chat testing"
```
