# Spec: FreeChatOverlay Redesign — In-Place Transformation

**Date**: 2026-03-17
**Status**: Approved

---

## Problem

The current FreeChatOverlay opens the chatbot side panel via `custom_screens.py` when the user presses Enter in the deck browser search bar. This is architecturally wrong: the chat should happen **in-place** within the React panel that is already visible, not by toggling a separate Qt widget. The overlay also uses absolute positioning which causes layout issues, and includes mode buttons (Flash/Deep/Übersicht) that have since been removed from the session input design.

---

## Goal

When the user types a question in the FreeChatSearchBar and presses Enter, the DeckBrowser panel transforms **in-place** into a chat view with a smooth downward animation. The deck content slides out, chat messages unfold in, and the search bar input morphs into the session-style ChatInput dock at the bottom. ESC or the Schließen button reverses the animation and returns to the deck browser.

---

## Animation Sequence

### Forward (DeckBrowser → Chat)

1. **Enter pressed** with non-empty text → `freeChatOpen = true` in App.jsx
2. `animPhase` state transitions: `idle` → `entering` (immediately) → `entered` (after 350ms)
3. **Deck list** (decks + sessions rows): `translateY(+60px)` + `opacity → 0` over 250ms (slides down and out)
4. **Search bar header** (AnkiPlus brand + pill input): `opacity → 0` over 200ms (fades out)
5. **Messages area** (`FreeChatView`): fades in with `translateY(-12px → 0)` over 280ms — first user bubble (the typed question) is already present in the messages state
6. **ChatInput dock**: fades in with `translateY(+8px → 0)` over 250ms, delayed 150ms after messages; auto-focuses textarea

Total transition duration: ~350ms.

### Reverse (Chat → DeckBrowser)

Triggered by: Schließen button, ESC key. **Note: cancel-ack flow (see below) must complete before `freeChatOpen` is set to false.**

1. `animPhase` transitions: `entered` → `exiting` → `idle` (after 300ms)
2. ChatInput dock and messages area fade out
3. Deck list and search bar header fade back in and slide up to original position
4. After animation: `freeChatOpen = false`, `animPhase = 'idle'`

### Animation Phase State

`animPhase` is a separate state variable in `App.jsx` (not a derived value from `freeChatOpen`):

```javascript
// 'idle' | 'entering' | 'entered' | 'exiting'
const [animPhase, setAnimPhase] = useState('idle');
```

This is required to support the reverse animation: without it, setting `freeChatOpen = false` would unmount `FreeChatView` immediately before the exit animation can play. `DeckBrowser` uses both `freeChatOpen` (to know whether to render `FreeChatView`) and `animPhase` (to know which CSS transition classes to apply).

**Phase transitions:**
```
Enter pressed   → freeChatOpen=true, animPhase='entering'
                  → after 350ms: animPhase='entered'

Close triggered → animPhase='exiting'
                  → after 300ms: freeChatOpen=false, animPhase='idle'
```

---

## Component Changes

### `FreeChatSearchBar.jsx`

No changes to the component itself. The parent (`DeckBrowser`) controls its visibility via CSS transition classes based on `animPhase`.

### `DeckBrowser.jsx`

- Receives two new props: `freeChatOpen: boolean`, `animPhase: string`, `freeChatInitialText: string`, `freeChatHook: object`
- The `onFreeChatOpen` prop is **removed** — transition is handled internally: `FreeChatSearchBar.onOpen` → calls `props.onFreeChatOpen` which triggers the animation in `App.jsx`. Wait — `onFreeChatOpen` stays as a prop from `App.jsx` but is still called when the search bar submits. `DeckBrowser` does not manage animation state itself.
- When `animPhase === 'entering'` or `'entered'`: deck list and search bar header get exit animation CSS classes; `FreeChatView` renders
- When `animPhase === 'exiting'` or `'idle'`: reverse classes; `FreeChatView` unmounts after `exiting` → `idle` transition completes

### `FreeChatOverlay.jsx` → **deleted**

Removed entirely. Its logic is absorbed into `FreeChatView`.

### New: `FreeChatView.jsx`

Inline chat view rendered within DeckBrowser when `freeChatOpen = true`. Structure:

```
FreeChatView
├── Messages area (flex: 1, overflow-y: auto)
│   └── ChatMessage / StreamingChatMessage (reused from session)
└── ChatInput (shared component, see below)
```

**Initial text**: `FreeChatView` receives `initialText` as a prop (passed from `App.jsx` via `DeckBrowser`). On mount, it calls `freeChatHook.handleSend(initialText, 'compact')` via a one-shot `useEffect`. This replicates the behaviour currently in `FreeChatOverlay`.

**Cancel-ack pattern**: The Schließen button and ESC key in `FreeChatView` must replicate the cancel-ack flow from `FreeChatOverlay`:
- If `freeChatHook.isLoading`: call `freeChatHook.startCancel()` + `bridge.cancelRequest()`, then wait for cancel-ack (the `onCancelComplete` callback in `useFreeChat`) before triggering close
- If not loading: trigger close immediately
- **Do not call `setFreeChatOpen(false)` directly** — call `handleFreeChatClose()` in `App.jsx` via a prop, which manages the cancel-ack flow and then triggers the exit animation

**`onSend` bridge**: `ChatInput` calls `onSend(text, { mode: 'compact' })` (object second arg). `useFreeChat.handleSend` expects `(text, mode)` (string second arg). `FreeChatView` wraps this:
```javascript
onSend={(text, options) => freeChatHook.handleSend(text, options?.mode ?? 'compact')}
```
Mode is always 'compact' (no mode buttons), so this is effectively `onSend={(text) => freeChatHook.handleSend(text, 'compact')}`.

### `ChatInput.tsx` (shared component) — action row made configurable

The action row currently has hardcoded labels ("Weiter" / "Übersicht") and hardcoded handlers. These are extracted to props:

```typescript
interface ActionConfig {
  label: string;
  shortcut?: string;          // display string only, e.g. 'SPACE', 'ESC', '⌘X'
  onClick: () => void;
  disabled?: boolean;
  pulse?: boolean;            // replaces lowScorePulse, only used in session context
}

interface ChatInputProps {
  // ... existing props ...
  actionPrimary: ActionConfig;    // left button (was "Weiter")
  actionSecondary: ActionConfig;  // right button (was "Übersicht")
}
```

**Breaking change handling:**
- `lowScorePulse` prop is removed; callers use `actionSecondary.pulse` instead
- `onOverview` prop is removed; callers pass `actionSecondary.onClick`
- The global `Space` keydown listener stays in `ChatInput` but calls `actionPrimary.onClick` instead of the hardcoded `handleAdvance`
- ESC in `handleKeyDown` calls `onClose` (unchanged — maps to `handleFreeChatClose` in free chat context, to close-panel in session context)
- **`disabled` ownership**: `ChatInput` no longer auto-disables action buttons based on `isLoading`. Callers are fully responsible for passing `disabled: true` when appropriate. In session usage: `actionSecondary={{ ..., disabled: isLoading }}` (Übersicht disabled while loading). In FreeChatView usage: `actionPrimary` (Schließen) is never disabled — clicking it while loading triggers the cancel-ack flow.

**Session usage (updated call site in `App.jsx` or wherever `ChatInput` is rendered in session):**
```jsx
actionPrimary={{ label: 'Weiter', shortcut: 'SPACE', onClick: handleAdvance }}
actionSecondary={{ label: 'Übersicht', shortcut: '↵', onClick: handleOverview, pulse: lowScorePulse }}
```

**FreeChatView usage:**
```jsx
actionPrimary={{ label: 'Schließen', shortcut: 'ESC', onClick: handleClose }}
actionSecondary={{ label: 'Zurücksetzen', shortcut: '⌘X', onClick: handleReset }}
```

Where `handleClose` calls `handleFreeChatClose()` (with cancel-ack awareness) and `handleReset` clears the messages state and stays in chat mode.

### `App.jsx`

New/changed state:
```javascript
const [freeChatOpen, setFreeChatOpen] = useState(false);       // unchanged
const [freeChatInitialText, setFreeChatInitialText] = useState(''); // unchanged
const [animPhase, setAnimPhase] = useState('idle');             // NEW
```

`handleFreeChatOpen` (triggered by search bar submit):
```javascript
const handleFreeChatOpen = useCallback((text) => {
  setFreeChatInitialText(text);
  setTimeout(() => setFreeChatInitialText(''), 0);
  setFreeChatOpen(true);
  setAnimPhase('entering');
  setTimeout(() => setAnimPhase('entered'), 350);
  setActiveChat('free');
}, []);
```

`handleFreeChatClose` (with cancel-ack):
```javascript
const handleFreeChatClose = useCallback(() => {
  if (freeChatHookRef.current.isLoading) {
    freeChatHookRef.current.startCancel();
    bridge.cancelRequest();
    // onCancelComplete (see below) will trigger the exit animation
  } else {
    setAnimPhase('exiting');
    setTimeout(() => {
      setFreeChatOpen(false);
      setAnimPhase('idle');
      setActiveChat('session');
    }, 300);
  }
}, [bridge]);
```

`onCancelComplete` callback (passed to `useFreeChat`, updated from current implementation):
```javascript
onCancelComplete: () => {
  // Must animate out — do NOT set freeChatOpen=false directly
  setAnimPhase('exiting');
  setTimeout(() => {
    setFreeChatOpen(false);
    setAnimPhase('idle');
    setActiveChat('session');
  }, 300);
}
```

> **Note for implementer**: The current `onCancelComplete` in `App.jsx` (lines ~275–278) calls `setFreeChatOpen(false)` immediately without an exit animation. It must be updated to the pattern above.

`⌘X` keyboard shortcut (reset, stay in chat):
- Wired via global keydown listener when `freeChatOpen && animPhase === 'entered'`
- Calls `freeChatHook.resetMessages()` — a one-liner additive change to `useFreeChat.js`: add `resetMessages: () => setMessages([])` to the return object. This is the only permitted change to `useFreeChat.js`; all core logic (streaming, cancellation, `handleSend`, `handleAnkiReceive`) remains untouched.

### `custom_screens.py`

- Remove the `freeChat` action type handler from the polling loop
- Remove `_open_free_chat` method entirely
- Remove the `startFreeChat` receiver from `App.jsx` (line ~513) — it becomes dead code once the polling-loop dispatch is gone
- The `startFreeChat` payload type and its `App.jsx` handler are both removed

---

## Keyboard Shortcuts

| Key | Action | Context | Handler |
|-----|--------|---------|---------|
| `Enter` | Submit question, open chat | FreeChatSearchBar focused | `FreeChatSearchBar.handleKeyDown` |
| `ESC` | Close chat, back to deck browser | Free chat open | `ChatInput.handleKeyDown → onClose → handleFreeChatClose` |
| `⌘X` | Reset (clear messages, stay in chat) | Free chat open, `animPhase === 'entered'` | Global keydown in `App.jsx` |
| `Enter` | Send follow-up message | `ChatInput` textarea focused | `ChatInput.handleSubmit` |

---

## Props Summary

### DeckBrowser (new/changed props)

```typescript
freeChatOpen: boolean
animPhase: 'idle' | 'entering' | 'entered' | 'exiting'
freeChatInitialText: string
freeChatHook: ReturnType<typeof useFreeChat>
onFreeChatOpen: (text: string) => void  // unchanged
onFreeChatClose: () => void             // NEW — passed to FreeChatView
```

---

## What Does NOT Change

- `useFreeChat.js` core logic (streaming, cancellation, `handleSend`, `handleAnkiReceive`, `startCancel`, `isLoading`) — only `resetMessages` is added to the return object
- Python AI handling (`widget.py`, `bridge.py`, `ai_handler.py`)
- `ChatMessage` and `StreamingChatMessage` components
- The snake-border animation on `FreeChatSearchBar`
- Session chat (entirely separate code path)
- `FreeChatSearchBar.jsx` component internals
