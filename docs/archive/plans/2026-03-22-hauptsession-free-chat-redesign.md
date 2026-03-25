# Hauptsession / Free Chat Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the overlay chat as a seamless extension of the Stapel view with pixel-identical header, smooth animated transition, context tags on messages, and hold-to-reset functionality.

**Architecture:** The overlay (OverlayChatWidget) renders a React app over Anki's native webview. Its header replicates custom_screens' top bar exactly. An extracted AIRequestManager eliminates duplicate AI thread logic. Shortcuts route through the existing GlobalShortcutFilter.

**Tech Stack:** Python/PyQt6 (overlay widget), React 18 (FreeChatApp rewrite), Tailwind CSS + design tokens, SQLite (message storage)

**Spec:** `docs/superpowers/specs/2026-03-22-hauptsession-free-chat-redesign.md`

---

### Task 1: Add `clear_deck_messages()` to storage layer

**Files:**
- Modify: `storage/card_sessions.py` (after `save_deck_message` at line 521)
- Modify: `tests/test_card_sessions.py`

- [ ] **Step 1: Write the failing test**

In `tests/test_card_sessions.py`, add:

```python
def test_clear_deck_messages(self):
    """clear_deck_messages deletes only card_id=NULL messages."""
    from storage.card_sessions import save_deck_message, load_deck_messages, clear_deck_messages, save_message

    # Save a free-chat message (card_id=NULL)
    save_deck_message(0, {'id': 'free-1', 'text': 'free question', 'sender': 'user'})
    save_deck_message(0, {'id': 'free-2', 'text': 'free answer', 'sender': 'assistant'})

    # Save a card-context message (card_id != NULL)
    save_message(12345, {'id': 'card-1', 'text': 'card question', 'sender': 'user', 'section_id': None})

    # Verify all exist
    msgs = load_deck_messages(0, limit=100)
    assert len(msgs) >= 3

    # Clear free-chat messages
    count = clear_deck_messages()

    # Free-chat messages gone, card message remains
    msgs_after = load_deck_messages(0, limit=100)
    card_msgs = [m for m in msgs_after if m.get('card_id')]
    free_msgs = [m for m in msgs_after if not m.get('card_id')]
    assert len(free_msgs) == 0
    assert len(card_msgs) >= 1
    assert count == 2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -k test_clear_deck_messages -v`
Expected: FAIL — `clear_deck_messages` not defined

- [ ] **Step 3: Write implementation**

In `storage/card_sessions.py`, after `save_deck_message()` (line 521), add:

```python
def clear_deck_messages():
    """Delete all free-chat messages (card_id IS NULL). Returns count of deleted rows."""
    db = _get_db()
    try:
        cursor = db.execute("DELETE FROM messages WHERE card_id IS NULL")
        db.commit()
        count = cursor.rowcount
        logger.info("Cleared %s free-chat messages", count)
        return count
    except sqlite3.Error as e:
        logger.error("Failed to clear deck messages: %s", e)
        db.rollback()
        return 0
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -k test_clear_deck_messages -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add storage/card_sessions.py tests/test_card_sessions.py
git commit -m "feat(storage): add clear_deck_messages for free chat reset"
```

---

### Task 2: Add `clearDeckMessages` bridge method

**Files:**
- Modify: `ui/bridge.py` (add new `@pyqtSlot` method)
- Modify: `ui/overlay_chat.py` (add route for `clearDeckMessages` message type)

- [ ] **Step 1: Add bridge slot in `ui/bridge.py`**

Find the `saveDeckMessage` method and add after it:

```python
@pyqtSlot(result=str)
def clearDeckMessages(self):
    """Clear all free-chat messages (card_id IS NULL)."""
    try:
        from ..storage.card_sessions import clear_deck_messages
    except ImportError:
        from storage.card_sessions import clear_deck_messages
    try:
        count = clear_deck_messages()
        return json.dumps({"success": True, "count": count})
    except Exception as e:
        logger.exception("clearDeckMessages error")
        return json.dumps({"success": False, "error": str(e)})
```

- [ ] **Step 2: Add message route in `ui/overlay_chat.py`**

In `_route_message()` (after the `closeOverlay` handler at line 156), add:

```python
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
```

- [ ] **Step 3: Verify Anki loads without errors**

Build frontend and restart Anki. Check log for import errors.

- [ ] **Step 4: Commit**

```bash
git add ui/bridge.py ui/overlay_chat.py
git commit -m "feat(bridge): add clearDeckMessages slot and overlay route"
```

---

### Task 3: Extend `useFreeChat` hook with `clearMessages` and message count

**Files:**
- Modify: `frontend/src/hooks/useFreeChat.js`

- [ ] **Step 1: Add `clearMessages` method and `messageCount`**

In `useFreeChat.js`, add a `clearMessages` callback (before the return statement at line 143):

```javascript
const clearMessages = useCallback(() => {
  window.ankiBridge?.addMessage('clearDeckMessages', '');
  setMessages([]);
  setStreamingMessage('');
  messagesLoadedRef.current = false;
}, []);
```

- [ ] **Step 2: Handle `deckMessagesCleared` in `handleAnkiReceive`**

In `handleAnkiReceive`, add at the top (after the `sectionTitleGenerated` check at line 96):

```javascript
if (payload.type === 'deckMessagesCleared') return; // already handled optimistically
```

- [ ] **Step 3: Update the return object**

Add `clearMessages` and `messageCount` to the return:

```javascript
return {
  messages,
  streamingMessage,
  isLoading,
  handleSend,
  handleAnkiReceive,
  handleDeckMessagesLoaded,
  startCancel,
  loadForDeck,
  setMessages,
  clearMessages,
  messageCount: messages.length,
  resetMessages: useCallback(() => { setMessages([]); messagesLoadedRef.current = false; }, []),
};
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useFreeChat.js
git commit -m "feat(hooks): add clearMessages and messageCount to useFreeChat"
```

---

### Task 4: Create `OverlayHeader` component

**Files:**
- Create: `frontend/src/components/OverlayHeader.jsx`

This component replicates the custom_screens `_top_bar()` pixel-for-pixel. Reference: `ui/custom_screens.py` lines 360-437.

- [ ] **Step 1: Create the component**

```jsx
import React from 'react';

/**
 * OverlayHeader — pixel-identical replica of custom_screens _top_bar().
 * Matches: height 56px, padding 0 20px, tabs centered, info left/right.
 *
 * When chatOpen=false, shows Stapel header (Heute: X Karten, Neu/Fällig/Wieder).
 * When chatOpen=true, shows Chat header (N Nachrichten, HoldToReset).
 */
export default function OverlayHeader({
  chatOpen = false,
  messageCount = 0,
  totalDue = 0,
  dueNew = 0,
  dueLearning = 0,
  dueReview = 0,
  onTabClick,
  onSidebarToggle,
  holdToResetProps = {},
}) {
  // Plus button (settings sidebar toggle)
  const plusButton = (
    <button
      onClick={onSidebarToggle}
      style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: 4, marginRight: 8,
        transition: 'transform 0.2s ease, opacity 0.15s ease',
        display: 'flex', alignItems: 'center', outline: 'none',
      }}
      onMouseEnter={e => { e.currentTarget.style.opacity = '0.6'; }}
      onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="5" y="0" width="4" height="14" rx="2" fill="var(--ds-accent)" opacity="0.6"/>
        <rect x="0" y="5" width="14" height="4" rx="2" fill="var(--ds-accent)" opacity="0.6"/>
      </svg>
    </button>
  );

  // Left side content
  const leftContent = chatOpen ? (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {plusButton}
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ds-text-tertiary)' }}>
        {messageCount} {messageCount === 1 ? 'Nachricht' : 'Nachrichten'}
      </span>
    </div>
  ) : (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {plusButton}
      {totalDue > 0 && (
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ds-text-tertiary)' }}>
          Heute: {totalDue} Karten
        </span>
      )}
    </div>
  );

  // Right side content
  const rightContent = chatOpen ? (
    <HoldToResetIndicator {...holdToResetProps} />
  ) : (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {[
        { color: 'var(--ds-stat-new)', label: 'Neu' },
        { color: 'var(--ds-stat-learning)', label: 'Fällig' },
        { color: 'var(--ds-stat-review)', label: 'Wieder' },
      ].map(({ color, label }) => (
        <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
          <span style={{ fontSize: 10, fontWeight: 500, color }}>{label}</span>
        </span>
      ))}
    </div>
  );

  // Tab bar (active = stapel always, visual only in overlay)
  const tabs = ['Stapel', 'Session', 'Statistik'];
  const tabBar = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 2, padding: 3, borderRadius: 8,
      background: 'var(--ds-hover-tint)',
    }}>
      {tabs.map(tab => {
        const isActive = tab === 'Stapel';
        return (
          <button
            key={tab}
            onClick={() => onTabClick?.(tab.toLowerCase())}
            style={{
              padding: '5px 16px', fontSize: 12, borderRadius: 6,
              border: 'none', cursor: isActive ? 'default' : 'pointer',
              fontWeight: isActive ? 600 : 500,
              background: isActive ? 'var(--ds-border-subtle)' : 'transparent',
              color: isActive ? 'var(--ds-text-primary)' : 'var(--ds-text-muted)',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {tab}
          </button>
        );
      })}
    </div>
  );

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 20px', height: 56, paddingTop: 4, flexShrink: 0,
      background: 'transparent',
    }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>{leftContent}</div>
      {tabBar}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>{rightContent}</div>
    </div>
  );
}

/**
 * HoldToResetIndicator — inline sub-component for the header right side.
 * Shows "R" key badge. Full HoldToReset logic is wired in Task 5.
 */
function HoldToResetIndicator({ progress = 0, isHolding = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}>
      <span style={{
        fontSize: 10, fontWeight: 500, color: 'var(--ds-text-muted)',
        opacity: isHolding ? 1 : 0.6, transition: 'opacity 0.15s',
      }}>
        Zurücksetzen
      </span>
      <span style={{
        background: 'var(--ds-border-subtle)', padding: '2px 6px', borderRadius: 4,
        fontSize: 10, fontWeight: 600, color: 'var(--ds-text-secondary)',
        position: 'relative', overflow: 'hidden', minWidth: 18, textAlign: 'center',
      }}>
        R
        {/* Progress fill bar */}
        <span style={{
          position: 'absolute', left: 0, bottom: 0, height: 2,
          width: `${progress * 100}%`,
          background: progress > 0.8 ? 'var(--ds-red)' : 'var(--ds-text-muted)',
          transition: isHolding ? 'none' : 'width 0.15s ease',
          borderRadius: 1,
        }} />
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/OverlayHeader.jsx
git commit -m "feat(ui): add OverlayHeader component with pixel-identical header replica"
```

---

### Task 5: Create `HoldToReset` hook

**Files:**
- Create: `frontend/src/hooks/useHoldToReset.js`

- [ ] **Step 1: Create the hook**

```javascript
import { useState, useEffect, useRef, useCallback } from 'react';

const HOLD_DURATION = 1500; // 1.5 seconds
const TICK_INTERVAL = 16;   // ~60fps

/**
 * useHoldToReset — tracks R key hold state for chat reset.
 * Returns { progress, isHolding } for visual feedback.
 *
 * @param {function} onReset - called when hold completes (1.5s)
 * @param {boolean} enabled - only active when true (chat is open, input not focused)
 */
export function useHoldToReset({ onReset, enabled = false }) {
  const [progress, setProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const startTimeRef = useRef(null);
  const rafRef = useRef(null);
  const completedRef = useRef(false);

  const tick = useCallback(() => {
    if (!startTimeRef.current) return;
    const elapsed = Date.now() - startTimeRef.current;
    const p = Math.min(elapsed / HOLD_DURATION, 1);
    setProgress(p);

    if (p >= 1 && !completedRef.current) {
      completedRef.current = true;
      setIsHolding(false);
      setProgress(0);
      startTimeRef.current = null;
      onReset?.();
      return;
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [onReset]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e) => {
      if (e.key === 'r' || e.key === 'R') {
        if (e.repeat) return; // ignore key repeat
        startTimeRef.current = Date.now();
        completedRef.current = false;
        setIsHolding(true);
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    const handleKeyUp = (e) => {
      if (e.key === 'r' || e.key === 'R') {
        startTimeRef.current = null;
        setIsHolding(false);
        setProgress(0);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [enabled, tick]);

  return { progress, isHolding };
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useHoldToReset.js
git commit -m "feat(hooks): add useHoldToReset for hold-R-to-clear interaction"
```

---

### Task 6: Create `ContextTags` component

**Files:**
- Create: `frontend/src/components/ContextTags.jsx`

- [ ] **Step 1: Create the component**

```jsx
import React from 'react';

/**
 * ContextTags — shows [Deck] → [Card] or [Freie Frage] below user messages.
 *
 * @param {string|null} deckName - immediate deck name (last segment of :: path)
 * @param {string|null} cardFront - card front text (truncated)
 * @param {number|null} cardId - card ID for click-to-open
 * @param {object} bridge - for goToCard / openPreview
 */
export default function ContextTags({ deckName, cardFront, cardId, bridge }) {
  // Extract last segment of deck path
  const shortDeck = deckName ? deckName.split('::').pop() : null;

  if (!cardId && !shortDeck) {
    // Free chat message — no card context
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, marginBottom: 12 }}>
        <span style={{
          background: 'var(--ds-border-subtle)',
          color: 'var(--ds-text-muted)',
          fontSize: 10, padding: '3px 8px', borderRadius: 6,
          display: 'inline-flex', alignItems: 'center',
        }}>
          Freie Frage
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, marginBottom: 12 }}>
      {shortDeck && (
        <span
          onClick={() => bridge?.goToCard?.(cardId)}
          style={{
            background: 'color-mix(in srgb, var(--ds-accent) 12%, transparent)',
            color: 'var(--ds-accent)',
            fontSize: 10, padding: '3px 8px', borderRadius: 6, cursor: cardId ? 'pointer' : 'default',
            display: 'inline-flex', alignItems: 'center', gap: 3,
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.7'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
        >
          {shortDeck}
        </span>
      )}
      {shortDeck && cardFront && (
        <span style={{ color: 'var(--ds-text-muted)', fontSize: 10, opacity: 0.4 }}>→</span>
      )}
      {cardFront && (
        <span
          onClick={() => cardId && bridge?.openPreview?.(cardId)}
          style={{
            background: 'color-mix(in srgb, var(--ds-accent) 12%, transparent)',
            color: 'var(--ds-accent)',
            fontSize: 10, padding: '3px 8px', borderRadius: 6,
            cursor: cardId ? 'pointer' : 'default',
            display: 'inline-flex', alignItems: 'center', gap: 3,
            maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.7'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
        >
          {cardFront}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ContextTags.jsx
git commit -m "feat(ui): add ContextTags component for deck/card badges on messages"
```

---

### Task 7: Add `onFocus`/`onBlur` forwarding to ChatInput

**Files:**
- Modify: `frontend/src/components/ChatInput.jsx`

**Dependency:** Must be done before Task 8 (FreeChatApp rewrite) which passes `onFocus`/`onBlur` props to ChatInput.

- [ ] **Step 1: Check ChatInput for existing focus handling**

Read `frontend/src/components/ChatInput.jsx` and find the textarea/input element.

- [ ] **Step 2: Add onFocus/onBlur prop forwarding**

In the textarea element, add the forwarding calls:
```jsx
onFocus={(e) => { /* keep any existing focus logic */ props.onFocus?.(); }}
onBlur={(e) => { /* keep any existing blur logic */ props.onBlur?.(); }}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ChatInput.jsx
git commit -m "feat(ChatInput): forward onFocus/onBlur props to textarea"
```

---

### Task 8: Rewrite `FreeChatApp.jsx` with header, animations, and context tags

**Files:**
- Modify: `frontend/src/FreeChatApp.jsx` (full rewrite)

**Dependencies:** Task 3 (clearMessages, messageCount), Task 4 (OverlayHeader), Task 5 (useHoldToReset), Task 6 (ContextTags), Task 7 (ChatInput onFocus/onBlur).

This is the core task. The component gets the OverlayHeader, smooth transition animations, ContextTags on messages, and the HoldToReset integration.

- [ ] **Step 1: Rewrite FreeChatApp.jsx**

```jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ChatMessage from './components/ChatMessage';
import StreamingChatMessage from './components/StreamingChatMessage';
import ChatInput from './components/ChatInput';
import ErrorBoundary from './components/ErrorBoundary';
import ContextTags from './components/ContextTags';
import OverlayHeader from './components/OverlayHeader';
import { useFreeChat } from './hooks/useFreeChat';
import { useHoldToReset } from './hooks/useHoldToReset';

/**
 * FreeChatApp — standalone React app for the overlay chat.
 * Renders a pixel-identical header, smooth transitions, and full chat.
 * Loaded when URL has ?mode=freechat
 */
export default function FreeChatApp() {
  const [animState, setAnimState] = useState('hidden'); // hidden | entering | visible | exiting
  const [inputFocused, setInputFocused] = useState(false);
  const [headerInfo, setHeaderInfo] = useState({ totalDue: 0, dueNew: 0, dueLearning: 0, dueReview: 0 });
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);

  const bridge = useRef({
    sendMessage: (data) => window.ankiBridge?.addMessage('sendMessage', data),
    cancelRequest: () => window.ankiBridge?.addMessage('cancelRequest', ''),
    goToCard: (cardId) => window.ankiBridge?.addMessage('goToCard', cardId),
    openPreview: (cardId) => window.ankiBridge?.addMessage('openPreview', { cardId: String(cardId) }),
  }).current;

  const freeChatHook = useFreeChat({
    bridge,
    onLoadingChange: () => {},
    onCancelComplete: () => {},
  });

  const {
    messages, streamingMessage, isLoading, handleSend,
    handleDeckMessagesLoaded, handleAnkiReceive, loadForDeck,
    clearMessages, messageCount,
  } = freeChatHook;

  // Hold-to-reset
  const chatOpen = animState === 'visible' || animState === 'entering';
  const holdToReset = useHoldToReset({
    onReset: clearMessages,
    enabled: chatOpen && !inputFocused && !isLoading,
  });

  // Stable refs for ankiReceive
  const handleDeckMessagesLoadedRef = useRef(handleDeckMessagesLoaded);
  const handleAnkiReceiveRef = useRef(handleAnkiReceive);
  const handleSendRef = useRef(handleSend);
  const loadForDeckRef = useRef(loadForDeck);

  useEffect(() => { handleDeckMessagesLoadedRef.current = handleDeckMessagesLoaded; }, [handleDeckMessagesLoaded]);
  useEffect(() => { handleAnkiReceiveRef.current = handleAnkiReceive; }, [handleAnkiReceive]);
  useEffect(() => { handleSendRef.current = handleSend; }, [handleSend]);
  useEffect(() => { loadForDeckRef.current = loadForDeck; }, [loadForDeck]);

  // Set up window.ankiReceive ONCE
  useEffect(() => {
    const queued = window._ankiReceiveQueue?.splice(0) || [];

    window.ankiReceive = (payload) => {
      if (!payload || !payload.type) return;

      if (payload.type === 'deckMessagesLoaded') {
        handleDeckMessagesLoadedRef.current(payload);
        return;
      }

      if (payload.type === 'overlayShow') {
        // Receive header info from Python
        if (payload.headerInfo) setHeaderInfo(payload.headerInfo);
        setAnimState('entering');
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setAnimState('visible'));
        });
        loadForDeckRef.current(0);
        if (payload.initialText?.trim()) {
          setTimeout(() => handleSendRef.current(payload.initialText), 400);
        }
        return;
      }

      if (payload.type === 'overlayHide') {
        setAnimState('exiting');
        setTimeout(() => setAnimState('hidden'), 300);
        return;
      }

      if (payload.type === 'initialText' && payload.text) {
        handleSendRef.current(payload.text);
        return;
      }

      handleAnkiReceiveRef.current(payload);
    };

    queued.forEach(p => window.ankiReceive(p));
    loadForDeckRef.current(0);
    return () => { window.ankiReceive = null; };
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage]);

  // Close handler
  const handleClose = useCallback(() => {
    if (isLoading) bridge.cancelRequest();
    window.ankiBridge?.addMessage('closeOverlay', '');
  }, [isLoading, bridge]);

  // Keyboard: Escape and Space to close
  useEffect(() => {
    const handler = (e) => {
      if (inputFocused) return; // don't intercept when typing
      if (e.key === 'Escape' || e.key === ' ') {
        e.preventDefault();
        handleClose();
      }
    };
    if (chatOpen) {
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }
  }, [handleClose, chatOpen, inputFocused]);

  // Focus tracking for input
  const handleInputFocus = useCallback(() => {
    setInputFocused(true);
    window.ankiBridge?.addMessage('textFieldFocus', JSON.stringify({ focused: true }));
  }, []);
  const handleInputBlur = useCallback(() => {
    setInputFocused(false);
    window.ankiBridge?.addMessage('textFieldFocus', JSON.stringify({ focused: false }));
  }, []);

  const handleSendMessage = useCallback((text) => {
    handleSend(text, 'compact');
  }, [handleSend]);

  // Tab click handler — route to Python to switch views
  const handleTabClick = useCallback((tab) => {
    if (tab === 'stapel') {
      handleClose(); // close overlay, return to Stapel
    } else {
      // Close overlay and navigate
      window.ankiBridge?.addMessage('closeOverlay', '');
      window.ankiBridge?.addMessage('switchTab', tab);
    }
  }, [handleClose]);

  const isVisible = animState === 'visible' || animState === 'entering';
  const isHidden = animState === 'hidden';

  if (isHidden) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', flexDirection: 'column',
      background: isVisible ? 'var(--ds-bg-deep)' : 'transparent',
      transition: 'background-color 350ms cubic-bezier(0.25, 0.1, 0.25, 1)',
    }}>
      {/* Header — always visible, pixel-identical to custom_screens */}
      <OverlayHeader
        chatOpen={true}
        messageCount={messageCount}
        totalDue={headerInfo.totalDue}
        dueNew={headerInfo.dueNew}
        dueLearning={headerInfo.dueLearning}
        dueReview={headerInfo.dueReview}
        onTabClick={handleTabClick}
        onSidebarToggle={() => window.ankiBridge?.addMessage('toggleSidebar', '')}
        holdToResetProps={holdToReset}
      />

      {/* Content area — animates in/out */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(-12px)',
        transition: 'opacity 300ms cubic-bezier(0.25, 0.1, 0.25, 1), transform 300ms cubic-bezier(0.25, 0.1, 0.25, 1)',
      }}>
        {/* Messages area */}
        <div
          ref={messagesContainerRef}
          style={{
            flex: 1, overflowY: 'auto', padding: '20px 16px 120px',
            maxWidth: 720, width: '100%', margin: '0 auto',
          }}
        >
          {messages.length === 0 && !isLoading && !streamingMessage && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: '100%', color: 'var(--ds-text-muted)', fontSize: 13,
            }}>
              Stelle eine Frage...
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={msg.id} style={{
              opacity: isVisible ? 1 : 0,
              transform: isVisible ? 'translateY(0)' : 'translateY(-8px)',
              transition: `opacity 250ms ease ${200 + Math.min(idx, 10) * 30}ms, transform 250ms ease ${200 + Math.min(idx, 10) * 30}ms`,
            }}>
              {msg.from === 'user' && (
                <>
                  <div className="mb-1">
                    <ErrorBoundary>
                      <ChatMessage
                        message={msg.text} from={msg.from} cardContext={null}
                        steps={[]} citations={{}} pipelineSteps={[]}
                        bridge={bridge} isLastMessage={false}
                      />
                    </ErrorBoundary>
                  </div>
                  <ContextTags
                    deckName={msg.deckName} cardFront={msg.cardFront}
                    cardId={msg.cardId} bridge={bridge}
                  />
                </>
              )}
              {msg.from === 'bot' && (
                <div className="mb-6">
                  <ErrorBoundary>
                    <ChatMessage
                      message={msg.text} from={msg.from} cardContext={null}
                      steps={msg.steps || []} citations={msg.citations || {}}
                      pipelineSteps={[]} bridge={bridge}
                      isLastMessage={idx === messages.length - 1}
                    />
                  </ErrorBoundary>
                </div>
              )}
            </div>
          ))}

          {/* Streaming */}
          {(isLoading || streamingMessage) && (
            <div className="w-full flex-none">
              <StreamingChatMessage
                message={streamingMessage || ''} isStreaming={isLoading}
                cardContext={null} steps={[]} citations={{}}
                pipelineSteps={[]} bridge={bridge}
              />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input dock — animates up from bottom */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        padding: '0 16px 16px', maxWidth: 720, margin: '0 auto', width: '100%',
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 250ms ease 150ms, transform 250ms ease 150ms',
      }}>
        <ChatInput
          onSend={handleSendMessage}
          isLoading={isLoading}
          onStop={() => bridge.cancelRequest()}
          cardContext={null}
          isPremium={true}
          onClose={handleClose}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          actionPrimary={{
            label: 'Schließen',
            shortcut: '␣',
            onClick: handleClose,
          }}
          actionSecondary={{
            label: 'Senden',
            shortcut: '↵',
            onClick: () => {},
            disabled: isLoading,
          }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build and test in browser**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run dev
```

Open `http://localhost:3000?mode=freechat` in browser. Verify:
- Header renders with correct layout
- ContextTags appear under user messages
- Animation states work (may need to manually trigger via console)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/FreeChatApp.jsx
git commit -m "feat(ui): rewrite FreeChatApp with header, animations, context tags, hold-to-reset"
```

---

### Task 9: Refactor `overlay_chat.py` — state persistence, position, polling

**Files:**
- Modify: `ui/overlay_chat.py`

- [ ] **Step 1: Add two-flag state model and header info**

Replace the `__init__` method (lines 38-46):

```python
def __init__(self, parent=None):
    super().__init__(parent or mw)
    self.web_view = None
    self.message_timer = None
    self._current_thread = None
    self._streaming_text = ''
    self._visible = False       # physical: widget is currently shown
    self._chat_open = False     # intent: user wants chat open (survives tab switches)
    self._bridge_initialized = False
    self._setup_ui()
```

- [ ] **Step 2: Change polling to 100ms**

In `_init_bridge()` (line 93), change:
```python
self.message_timer.start(200)
```
to:
```python
self.message_timer.start(100)
```

Also in `show_overlay()` (line 298), change `200` to `100`.

- [ ] **Step 3: Fix position tracking to use `mw.web`**

Replace `_position_over_main()` (lines 320-330):

```python
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
```

- [ ] **Step 4: Update `show_overlay` with state persistence and header info**

Replace `show_overlay()` (lines 285-306):

```python
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

    # Gather header info from Anki
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
```

- [ ] **Step 5: Update `hide_overlay` with state separation**

Replace `hide_overlay()` (lines 308-318):

```python
def hide_overlay(self):
    """Hide the overlay. Keeps _chat_open intact for restore."""
    if not self._visible:
        return
    self._visible = False
    self._chat_open = False  # user explicitly closed

    # Cancel any active AI request
    if self._current_thread:
        try:
            self._current_thread.cancel()
        except Exception:
            pass
        self._current_thread = None

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
    # Do NOT reset _chat_open — we want to restore on return
    if self._current_thread:
        try:
            self._current_thread.cancel()
        except Exception:
            pass
        self._current_thread = None
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
```

- [ ] **Step 6: Add `switchTab` message route**

In `_route_message()`, add after the `closeOverlay` handler:

```python
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
```

And add the `_open_stats` helper:

```python
def _open_stats(self):
    """Open stats window."""
    try:
        from aqt.stats import NewDeckStats
        NewDeckStats(mw)
    except Exception:
        pass
```

- [ ] **Step 7: Commit**

```bash
git add ui/overlay_chat.py
git commit -m "refactor(overlay): state persistence, position fix, polling 100ms, tab switching"
```

---

### Task 10: Wire Space shortcut in `GlobalShortcutFilter`

**Files:**
- Modify: `ui/shortcut_filter.py`

- [ ] **Step 1: Add overlay awareness to the filter**

Add an `_overlay_visible` flag and methods (after `set_text_field_focus` at line 64):

```python
self._overlay_visible = False

def set_overlay_visible(self, visible):
    """Called by overlay_chat.py when overlay shows/hides."""
    self._overlay_visible = visible
```

- [ ] **Step 2: Add Space shortcut for overlay open/close**

In `eventFilter()`, after `text_field_active` is computed (after the `focus_in_reviewer` adjustment), and before the `if text_field_active:` block, add:

```python
# --- Space in deckBrowser (no text field, no reviewer): toggle overlay ---
if (event.key() == Qt.Key.Key_Space and
        not text_field_active and
        not self._is_reviewer_active() and
        hasattr(mw, 'state') and mw.state == 'deckBrowser'):
    try:
        if self._overlay_visible:
            from .overlay_chat import hide_overlay_chat
            hide_overlay_chat()
        else:
            from .overlay_chat import show_overlay_chat
            show_overlay_chat()
    except Exception as e:
        logger.warning("Could not toggle overlay: %s", e)
    return True
```

- [ ] **Step 3: Update overlay to set filter flag**

In `ui/overlay_chat.py`, update `show_overlay` and `hide_overlay` to notify the filter:

```python
# In show_overlay, after self._visible = True:
try:
    from .shortcut_filter import get_shortcut_filter
    sf = get_shortcut_filter()
    if sf:
        sf.set_overlay_visible(True)
except Exception:
    pass

# In hide_overlay and hide_for_tab_switch, after self._visible = False:
try:
    from .shortcut_filter import get_shortcut_filter
    sf = get_shortcut_filter()
    if sf:
        sf.set_overlay_visible(False)
except Exception:
    pass
```

- [ ] **Step 4: Forward R key events when overlay is visible**

In the filter's `eventFilter()`, before the reviewer-only shortcut block (line 311), add:

```python
# --- Overlay visible: pass R key through to overlay webview (for HoldToReset) ---
if self._overlay_visible and event.key() == Qt.Key.Key_R and not text_field_active:
    return super().eventFilter(obj, event)  # let Qt deliver to overlay's webview
```

- [ ] **Step 5: Commit**

```bash
git add ui/shortcut_filter.py ui/overlay_chat.py
git commit -m "feat(shortcuts): add Space toggle and R passthrough for overlay"
```

---

### Task 11: Build and integration test

**Files:**
- Potentially: various files for fixes

- [ ] **Step 1: Build frontend**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Test in Anki**

Restart Anki. Test the full flow:
1. Open Stapel view → search bar visible
2. Type a question → overlay appears with smooth transition
3. Header matches custom_screens (tabs, info)
4. Chat messages appear with ContextTags
5. Space bar closes overlay
6. Space bar reopens overlay (state restored)
7. Hold R for 1.5s → chat cleared
8. Click Session tab → overlay closes, Session view opens

- [ ] **Step 4: Fix any issues found during testing**

Address visual mismatches, animation timing, or shortcut conflicts.

- [ ] **Step 5: Commit final fixes**

Stage only the specific files that were fixed, then commit:
```bash
git commit -m "fix(overlay): integration fixes from manual testing"
```

---

### Task 12: Remove deprecated `FreeChatView` from DeckBrowser

**Files:**
- Modify: `frontend/src/components/DeckBrowser.jsx` (remove FreeChatView usage)
- Potentially: `frontend/src/components/FreeChatView.jsx` (delete if no other references)

- [ ] **Step 1: Check all references to FreeChatView**

Search for all imports and usages of `FreeChatView` across the codebase.

- [ ] **Step 2: Remove FreeChatView from DeckBrowser**

In `DeckBrowser.jsx`, remove the `FreeChatView` import, the `freeChatOpen` state management, and the inline rendering of `FreeChatView`. The DeckBrowser should no longer handle free chat — that's the overlay's job.

Keep the `FreeChatSearchBar` — it still triggers the overlay via `onFreeChatOpen`.

- [ ] **Step 3: Clean up App.jsx free chat state if applicable**

Remove `freeChatOpen`, `animPhase`, `freeChatInitialText` state from `App.jsx` if they were only used for the DeckBrowser-embedded FreeChatView. The overlay is managed by Python, not React state in App.jsx.

- [ ] **Step 4: Build and verify**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DeckBrowser.jsx frontend/src/App.jsx
git commit -m "refactor(ui): remove deprecated FreeChatView from DeckBrowser"
```

---

### Task 13: Extract `AIRequestManager` and remove duplicate AI thread logic

**Files:**
- Create: `ai/request_manager.py`
- Modify: `ui/widget.py` (use AIRequestManager instead of direct thread creation)
- Modify: `ui/overlay_chat.py` (delete inline FreeChatThread, use AIRequestManager)

This is the architectural improvement: eliminate the duplicate `FreeChatThread` in `overlay_chat.py` by extracting a shared AI request manager.

- [ ] **Step 1: Create `ai/request_manager.py`**

```python
"""
Shared AI Request Manager
Handles AI request lifecycle for both sidebar and overlay.
Only one active request at a time (mutual exclusion).
"""

import time
import json

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

from aqt.qt import QThread, pyqtSignal


class AIRequestThread(QThread):
    """Thread for AI API requests with streaming."""
    chunk_signal = pyqtSignal(str, str, bool, bool)    # requestId, chunk, done, is_function_call
    finished_signal = pyqtSignal(str)                   # requestId
    error_signal = pyqtSignal(str, str)                 # requestId, error_message
    metadata_signal = pyqtSignal(str, object, object, object)  # requestId, steps, citations, step_labels
    pipeline_signal = pyqtSignal(str, str, str, object)  # requestId, step, status, data

    def __init__(self, ai_handler, text, context, history, mode, request_id, insights=None):
        super().__init__()
        self.ai_handler = ai_handler
        self.text = text
        self.context = context
        self.history = history
        self.mode = mode
        self.request_id = request_id
        self.insights = insights
        self._cancelled = False

    def cancel(self):
        self._cancelled = True

    def run(self):
        try:
            def pipeline_callback(step, status, data):
                if self._cancelled:
                    return
                self.pipeline_signal.emit(self.request_id, step, status, data or {})

            self.ai_handler._pipeline_signal_callback = pipeline_callback

            def stream_callback(chunk, done, is_function_call=False, steps=None, citations=None, step_labels=None):
                if self._cancelled:
                    return
                self.chunk_signal.emit(self.request_id, chunk or "", done, is_function_call)
                if done and (steps or citations or step_labels):
                    self.metadata_signal.emit(self.request_id, steps or [], citations or [], step_labels or [])

            self.ai_handler.get_response_with_rag(
                self.text, context=self.context, history=self.history,
                mode=self.mode, callback=stream_callback,
                insights=self.insights
            )

            if not self._cancelled:
                self.finished_signal.emit(self.request_id)
        except Exception as e:
            if not self._cancelled:
                logger.exception("AIRequestThread: Exception: %s", str(e))
                self.error_signal.emit(self.request_id, str(e))
        finally:
            self.ai_handler._pipeline_signal_callback = None


class AIRequestManager:
    """Shared AI request handler. Only one active request at a time."""

    def __init__(self):
        self._current_thread = None
        self._current_caller = None  # 'sidebar' or 'overlay'

    def start_request(self, text, context, history, mode, callbacks, caller_id, insights=None):
        """Start an AI request, cancelling any active request first.

        callbacks dict keys:
          - on_chunk(request_id, chunk, done, is_function_call)
          - on_finished(request_id)
          - on_error(request_id, error)
          - on_metadata(request_id, steps, citations, step_labels) [optional]
          - on_pipeline(request_id, step, status, data) [optional]
        """
        # Cancel any active request
        if self._current_thread:
            try:
                self._current_thread.cancel()
            except Exception:
                pass
            self._current_thread = None

        try:
            from ..ai.handler import get_ai_handler
        except ImportError:
            from ai.handler import get_ai_handler

        ai_handler = get_ai_handler()
        if not hasattr(ai_handler, 'get_response_with_rag'):
            if callbacks.get('on_error'):
                callbacks['on_error']('', 'AI handler does not support RAG')
            return

        request_id = f"{caller_id}-{int(time.time()*1000)}"
        thread = AIRequestThread(ai_handler, text, context, history, mode, request_id, insights)

        thread.chunk_signal.connect(callbacks['on_chunk'])
        thread.finished_signal.connect(callbacks['on_finished'])
        thread.error_signal.connect(callbacks['on_error'])
        if callbacks.get('on_metadata'):
            thread.metadata_signal.connect(callbacks['on_metadata'])
        if callbacks.get('on_pipeline'):
            thread.pipeline_signal.connect(callbacks['on_pipeline'])
        thread.finished.connect(thread.deleteLater)

        self._current_thread = thread
        self._current_caller = caller_id
        thread.start()

    def cancel(self):
        """Cancel the current request."""
        if self._current_thread:
            try:
                self._current_thread.cancel()
            except Exception:
                pass
            self._current_thread = None
            self._current_caller = None

    @property
    def is_busy(self):
        return self._current_thread is not None


# Singleton
_manager_instance = None

def get_request_manager():
    global _manager_instance
    if _manager_instance is None:
        _manager_instance = AIRequestManager()
    return _manager_instance
```

- [ ] **Step 2: Refactor `overlay_chat.py` to use AIRequestManager**

Delete the entire `_start_ai_request` method (lines 164-241), `_on_chunk`, `_on_ai_done`, `_on_ai_error`, and `_build_context` methods. Replace with:

```python
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

    try:
        from ..storage.card_sessions import load_deck_messages
    except ImportError:
        from storage.card_sessions import load_deck_messages

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
```

Also remove `self._current_thread` from `__init__` and all direct thread references. Use `get_request_manager().cancel()` instead.

- [ ] **Step 3: Update `cancelRequest` handler in overlay**

Replace the cancelRequest handler:

```python
elif msg_type == 'cancelRequest':
    try:
        from ..ai.request_manager import get_request_manager
    except ImportError:
        from ai.request_manager import get_request_manager
    get_request_manager().cancel()
    self._send_to_react({"type": "loading", "loading": False})
```

- [ ] **Step 4: Run existing tests**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -v
```

Expected: All tests pass (no test changes needed — AIRequestManager is tested via integration).

- [ ] **Step 5: Commit**

```bash
git add ai/request_manager.py ui/overlay_chat.py
git commit -m "refactor(ai): extract AIRequestManager, remove duplicate FreeChatThread from overlay"
```

---

### Task 14: Wire `restore_if_open` into state change hooks

**Files:**
- Modify: `ui/custom_screens.py` (call `restore_if_open` when Stapel tab becomes active)

- [ ] **Step 1: Add restore call in custom_screens**

In `custom_screens.py`, find the `_on_webview_content` method (the hook handler for `webview_will_set_content`). When the state is `deckBrowser` (Stapel tab), call `restore_if_open()` on the overlay:

```python
# At the beginning of the deckBrowser content generation (after setting up the HTML):
try:
    from .overlay_chat import get_overlay
    overlay = get_overlay()
    if hasattr(overlay, 'restore_if_open'):
        QTimer.singleShot(200, overlay.restore_if_open)
except Exception:
    pass
```

- [ ] **Step 2: Add hide_for_tab_switch when leaving Stapel**

When custom_screens generates content for a non-deckBrowser state (overview, etc.), hide the overlay:

```python
# When state is NOT deckBrowser (e.g., overview):
try:
    from .overlay_chat import get_overlay
    overlay = get_overlay()
    if hasattr(overlay, 'hide_for_tab_switch'):
        overlay.hide_for_tab_switch()
except Exception:
    pass
```

- [ ] **Step 3: Test tab switching**

1. Open Stapel → open chat overlay
2. Click Session tab → overlay hides
3. Click Stapel tab → overlay restores with previous state

- [ ] **Step 4: Commit**

```bash
git add ui/custom_screens.py
git commit -m "feat(custom_screens): wire restore_if_open for overlay state persistence"
```
