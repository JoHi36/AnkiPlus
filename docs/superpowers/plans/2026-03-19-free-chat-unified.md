# Free Chat: Unified Chronological Chat View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Free Chat in the DeckBrowser show ALL messages chronologically — including card-session messages — with clickable card references and deck/session section dividers.

**Architecture:** The SQLite backend already stores all messages (card-level + deck-level) with `card_id` and `deck_id`. The frontend `useFreeChat` hook loads them via `loadDeckMessages(0)` but strips metadata and the DeckBrowser rendering uses `cardContext={null}`. The fix enriches the message format with card/deck info, adds a lightweight `CardRefChip` component, and inserts automatic section dividers when the deck context changes.

**Tech Stack:** React 18, SQLite (Python), Qt WebChannel message queue, Tailwind-style inline CSS

---

## File Structure

| File | Role | Action |
|------|------|--------|
| `card_sessions_storage.py` | SQL queries for loading deck messages | Modify: enrich message dicts with card front-text preview |
| `frontend/src/hooks/useFreeChat.js` | Free Chat hook — load, send, receive | Modify: preserve `card_id`, `deck_id`, `deck_name` from DB |
| `frontend/src/components/CardRefChip.jsx` | Clickable card reference pill on each message | **Create** |
| `frontend/src/components/DeckSectionDivider.jsx` | Visual divider when deck context changes | **Create** |
| `frontend/src/components/FreeChatView.jsx` | Full Free Chat overlay | Modify: render CardRefChip + DeckSectionDivider |
| `frontend/src/components/DeckBrowser.jsx` | DeckBrowser with inline Chat-Verlauf | Modify: render CardRefChip + DeckSectionDivider in history |

---

### Task 1: Enrich message metadata from Python

**Why:** `load_deck_messages()` already returns `card_id`, `deck_id`, `deck_name` from the DB, but `useFreeChat.handleDeckMessagesLoaded()` strips all of it. We need to keep this data so the frontend knows which card each message belongs to.

**Files:**
- Modify: `card_sessions_storage.py:372-418` — add card front-text snippet to query
- Modify: `frontend/src/hooks/useFreeChat.js:51-64` — preserve card/deck metadata

- [ ] **Step 1: Add card front-text to Python query**

In `card_sessions_storage.py`, the `load_deck_messages()` function already joins `card_sessions`. We need to also look up the card's front text from Anki's DB so the Free Chat can show a card preview. Add a helper that fetches card front text:

```python
# card_sessions_storage.py — add after load_deck_messages()

def _get_card_front_texts(card_ids):
    """Fetch front-text snippets for a list of card IDs from Anki's DB."""
    import re
    try:
        from aqt import mw
        if not mw or not mw.col:
            return {}
        result = {}
        for cid in card_ids:
            try:
                card = mw.col.get_card(cid)
                if card and card.note():
                    fields = card.note().fields
                    front = fields[0] if fields else ''
                    # Strip HTML, limit to 60 chars
                    front = re.sub(r'<[^>]+>', '', front).strip()
                    if len(front) > 60:
                        front = front[:57] + '…'
                    result[cid] = front
            except Exception:
                pass
        return result
    except Exception:
        return {}
```

Then enrich messages at the end of `load_deck_messages()`, replacing the current loop:

```python
    messages = []
    for r in rows:
        m = dict(r)
        for field in ('steps', 'citations'):
            if m.get(field):
                try:
                    m[field] = json.loads(m[field])
                except (json.JSONDecodeError, TypeError):
                    pass
        messages.append(m)

    # Reverse to get chronological (oldest first) order
    messages.reverse()

    # Enrich with card front-text snippets
    card_ids = [m['card_id'] for m in messages if m.get('card_id')]
    if card_ids:
        front_texts = _get_card_front_texts(list(set(card_ids)))
        for m in messages:
            cid = m.get('card_id')
            if cid and cid in front_texts:
                m['card_front'] = front_texts[cid]

    return messages
```

- [ ] **Step 2: Preserve metadata in useFreeChat.js**

In `useFreeChat.js`, update `handleDeckMessagesLoaded` to keep `card_id`, `deck_id`, `deck_name`, and `card_front`:

```javascript
const handleDeckMessagesLoaded = useCallback((payload) => {
  const raw = payload.messages || [];
  console.error('📦 FREE-CHAT handleDeckMessagesLoaded:', raw.length, 'messages from DB');
  const msgs = raw.map(m => ({
    id: m.id || `db-${Date.now()}-${Math.random()}`,
    text: m.text,
    from: m.sender === 'assistant' ? 'bot' : (m.sender || 'user'),
    createdAt: m.created_at,
    citations: m.citations ? (typeof m.citations === 'string' ? JSON.parse(m.citations) : m.citations) : {},
    steps: m.steps || null,
    // Card/deck metadata for Free Chat display
    cardId: m.card_id || null,
    deckId: m.deck_id || null,
    deckName: m.deck_name || null,
    cardFront: m.card_front || null,
  }));
  setMessages(msgs);
  messagesLoadedRef.current = true;
}, []);
```

- [ ] **Step 3: Build frontend and verify messages load with metadata**

```bash
cd frontend && npm run build
```

Restart Anki, open DeckBrowser, check browser console for:
`📦 FREE-CHAT handleDeckMessagesLoaded: N messages from DB`

Verify the messages array has `cardId`, `deckName`, `cardFront` populated.

- [ ] **Step 4: Commit**

```bash
git add card_sessions_storage.py frontend/src/hooks/useFreeChat.js
git commit -m "feat(chat): enrich Free Chat messages with card/deck metadata from DB"
```

---

### Task 2: Create CardRefChip component

**Why:** Each message from a card session needs a small, clickable pill showing which card it came from. Clicking it navigates to that card in the reviewer.

**Files:**
- Create: `frontend/src/components/CardRefChip.jsx`

- [ ] **Step 1: Create CardRefChip.jsx**

```jsx
// frontend/src/components/CardRefChip.jsx
import React from 'react';
import { FileText } from 'lucide-react';

/**
 * Small clickable pill showing which card a message belongs to.
 * Shows card front-text snippet. Clicking navigates to the card.
 *
 * Props:
 *   cardId (number) — Anki card ID
 *   cardFront (string) — front-text snippet (max ~60 chars)
 *   bridge — Anki bridge for navigation
 */
export default function CardRefChip({ cardId, cardFront, bridge }) {
  if (!cardId) return null;

  const label = cardFront || `Karte #${cardId}`;

  const handleClick = () => {
    if (bridge?.goToCard) {
      bridge.goToCard(String(cardId));
    }
  };

  return (
    <button
      onClick={handleClick}
      title={`Zur Karte navigieren: ${label}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        marginTop: 4,
        background: 'rgba(107, 140, 255, 0.1)',
        border: '1px solid rgba(107, 140, 255, 0.2)',
        borderRadius: 10,
        color: 'rgba(107, 140, 255, 0.7)',
        fontSize: 11,
        cursor: 'pointer',
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        transition: 'background 0.15s, color 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'rgba(107, 140, 255, 0.18)';
        e.currentTarget.style.color = 'rgba(107, 140, 255, 0.9)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'rgba(107, 140, 255, 0.1)';
        e.currentTarget.style.color = 'rgba(107, 140, 255, 0.7)';
      }}
    >
      <FileText size={10} />
      {label}
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/CardRefChip.jsx
git commit -m "feat(chat): add CardRefChip — clickable card reference pill"
```

---

### Task 3: Create DeckSectionDivider component

**Why:** When the deck context changes between messages (e.g., user learned in Deck A, then switched to Deck B), a visual divider should appear to mark the boundary.

**Files:**
- Create: `frontend/src/components/DeckSectionDivider.jsx`

- [ ] **Step 1: Create DeckSectionDivider.jsx**

```jsx
// frontend/src/components/DeckSectionDivider.jsx
import React from 'react';

/**
 * Visual divider inserted between messages when the deck context changes.
 *
 * Props:
 *   deckName (string) — name of the new deck section
 */
export default function DeckSectionDivider({ deckName }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '12px 16px 6px',
    }}>
      <div style={{
        flex: 1,
        height: 1,
        background: 'rgba(255,255,255,0.06)',
      }} />
      <span style={{
        fontSize: 10,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.25)',
        letterSpacing: '0.5px',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}>
        {deckName || 'Free Chat'}
      </span>
      <div style={{
        flex: 1,
        height: 1,
        background: 'rgba(255,255,255,0.06)',
      }} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/DeckSectionDivider.jsx
git commit -m "feat(chat): add DeckSectionDivider — visual deck context separator"
```

---

### Task 4: Wire CardRefChip + DeckSectionDivider into FreeChatView

**Why:** The Free Chat overlay needs to render the new components. For each message that has a `cardId`, show a CardRefChip below it. Between messages where `deckName` changes, insert a DeckSectionDivider.

**Files:**
- Modify: `frontend/src/components/FreeChatView.jsx`

- [ ] **Step 1: Add imports and rendering logic**

At the top of FreeChatView.jsx, add:

```javascript
import CardRefChip from './CardRefChip';
import DeckSectionDivider from './DeckSectionDivider';
```

Then replace the messages rendering section. The current code renders messages in a simple `.map()`. Replace with a version that:
1. Checks if `deckName` changed from the previous message → insert DeckSectionDivider
2. Renders CardRefChip below each message that has a `cardId`

The key rendering logic:

```jsx
{messages.map((msg, idx) => {
  const prevMsg = idx > 0 ? messages[idx - 1] : null;
  const deckChanged = msg.deckName && (!prevMsg || prevMsg.deckName !== msg.deckName);
  const showDivider = deckChanged || (idx === 0 && msg.deckName);

  return (
    <React.Fragment key={msg.id}>
      {showDivider && <DeckSectionDivider deckName={msg.deckName} />}
      <ChatMessage
        message={msg.text}
        from={msg.from}
        cardContext={null}
        citations={msg.citations || {}}
        bridge={bridge}
      />
      {msg.cardId && (
        <div style={{ padding: '0 16px' }}>
          <CardRefChip
            cardId={msg.cardId}
            cardFront={msg.cardFront}
            bridge={bridge}
          />
        </div>
      )}
    </React.Fragment>
  );
})}
```

- [ ] **Step 2: Build and verify**

```bash
cd frontend && npm run build
```

Restart Anki. Open DeckBrowser → double-tap search bar or type something. The Free Chat should now show:
- Deck section dividers when deck context changes
- Card reference pills below messages that came from card sessions
- Clicking a pill should navigate to that card

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/FreeChatView.jsx
git commit -m "feat(chat): render card references + deck dividers in FreeChatView"
```

---

### Task 5: Wire CardRefChip + DeckSectionDivider into DeckBrowser Chat-Verlauf

**Why:** The DeckBrowser inline "Chat-Verlauf" section (visible when Free Chat is closed) should also show card references and deck dividers, matching the FreeChatView rendering.

**Files:**
- Modify: `frontend/src/components/DeckBrowser.jsx:526-544`

- [ ] **Step 1: Add imports**

At the top of DeckBrowser.jsx, add:

```javascript
import CardRefChip from './CardRefChip';
import DeckSectionDivider from './DeckSectionDivider';
```

- [ ] **Step 2: Update Chat-Verlauf rendering**

Replace the current Chat-Verlauf block (around line 526-544) with:

```jsx
{/* ── Chat History (all messages across decks) ── */}
{!freeChatOpen && freeChatHook && freeChatHook.messages && freeChatHook.messages.length > 0 && (
  <div>
    <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '8px 16px' }} />
    <SectionLabel count={freeChatHook.messages.length}>Chat-Verlauf</SectionLabel>
    <div style={{ padding: '0 8px' }}>
      {freeChatHook.messages.map((msg, idx) => {
        const prevMsg = idx > 0 ? freeChatHook.messages[idx - 1] : null;
        const deckChanged = msg.deckName && (!prevMsg || prevMsg.deckName !== msg.deckName);
        const showDivider = deckChanged || (idx === 0 && msg.deckName);

        return (
          <React.Fragment key={msg.id}>
            {showDivider && <DeckSectionDivider deckName={msg.deckName} />}
            <ChatMessage
              message={msg.text}
              from={msg.from}
              cardContext={null}
              citations={msg.citations || {}}
              bridge={bridge}
            />
            {msg.cardId && (
              <div style={{ padding: '0 8px' }}>
                <CardRefChip
                  cardId={msg.cardId}
                  cardFront={msg.cardFront}
                  bridge={bridge}
                />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  </div>
)}
```

- [ ] **Step 3: Build and verify**

```bash
cd frontend && npm run build
```

Restart Anki. DeckBrowser should show the Chat-Verlauf section with deck dividers and card reference pills.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/DeckBrowser.jsx
git commit -m "feat(chat): render card references + deck dividers in DeckBrowser chat history"
```

---

### Task 6: Ensure card-session bot responses are saved with deck_id

**Why:** When the AI responds during a card session, the bot message must be saved with `deck_id` so it appears in the Free Chat. Currently `save_message()` in Python does set `deck_id` via `_get_deck_for_card()`, but we need to verify the frontend also passes `card_id` when saving bot responses.

**Files:**
- Modify: `frontend/src/hooks/useFreeChat.js` — ensure bot responses in free-chat mode are saved

- [ ] **Step 1: Verify bot-response saving in useFreeChat**

In `useFreeChat.js`, the `handleAnkiReceive` handler for `payload.type === 'bot'` already calls `_saveDeckMsg(botMsg)`. Verify this also preserves `citations` as a string (not double-encoded). The current code looks correct, but check that `_saveDeckMsg` doesn't double-stringify `citations`:

In `_saveDeckMsg`, if `message.citations` is already an object, it gets `JSON.stringify()`'d. If it comes from `handleDeckMessagesLoaded` where it was already parsed, re-saving would be fine. No change needed here if flow is correct.

- [ ] **Step 2: Verify card-session messages have deck_id in DB**

Open Anki, do a card review, ask a question in the side panel. Then check the DB:

```bash
sqlite3 card_sessions.db "SELECT id, card_id, deck_id, substr(text,1,40), sender FROM messages ORDER BY created_at DESC LIMIT 10;"
```

All card-session messages should have a non-NULL `deck_id`. If any are NULL, the `_get_deck_for_card()` function in `card_sessions_storage.py` needs debugging.

- [ ] **Step 3: Commit (only if changes were needed)**

```bash
git add -A && git commit -m "fix(chat): ensure all card-session messages have deck_id for Free Chat visibility"
```

---

### Task 7: End-to-end smoke test

**Why:** The whole chain must work: card session → message saved → Free Chat shows it with card reference.

- [ ] **Step 1: Build the frontend**

```bash
cd frontend && npm run build
```

- [ ] **Step 2: Test card-session → Free Chat flow**

1. Open Anki, start reviewing a deck
2. Ask a question in the side panel (card session)
3. Answer the card, move to next card
4. Ask another question
5. Exit the review (go back to DeckBrowser)
6. **Verify:** DeckBrowser "Chat-Verlauf" shows all messages from both cards
7. **Verify:** Each message has a CardRefChip pill showing the card front text
8. **Verify:** Clicking the pill navigates to that card
9. **Verify:** A DeckSectionDivider appears with the deck name at the top

- [ ] **Step 3: Test Free Chat standalone**

1. In DeckBrowser, type a question in the search bar → opens Free Chat
2. Ask something (no card context)
3. **Verify:** The message appears without a CardRefChip (no card associated)
4. Close Free Chat
5. **Verify:** The message appears in the Chat-Verlauf alongside card-session messages

- [ ] **Step 4: Test multiple decks**

1. Review Deck A, ask a question
2. Go back, review Deck B, ask a question
3. Go back to DeckBrowser
4. **Verify:** Chat-Verlauf shows both conversations with DeckSectionDividers between them
