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

1. **Enter pressed** with non-empty text
2. `freeChatOpen = true` triggers CSS transition classes on the DeckBrowser container
3. **Deck list** (decks + sessions rows): `translateY(+60px)` + `opacity → 0` over 250ms (slides down and out)
4. **Search bar header** (AnkiPlus brand + pill input): `opacity → 0` over 200ms (fades out)
5. **Messages area**: fades in with `translateY(-12px → 0)` over 280ms — first user bubble (the typed question) is already present
6. **ChatInput dock**: fades in with `translateY(+8px → 0)` over 250ms, delayed 150ms after messages appear; auto-focuses textarea

Total transition duration: ~350ms.

### Reverse (Chat → DeckBrowser)

Triggered by: Schließen button, ESC key, or `⌘X` (Zurücksetzen keeps chat open but clears messages).

1. ChatInput dock fades out
2. Messages area fades out
3. Deck list and brand header fade back in and slide up to original position
4. `freeChatOpen = false` after animation completes

---

## Component Changes

### `FreeChatSearchBar.jsx`

No changes to the component itself. It fades out during the transition via the parent's CSS transition classes.

### `DeckBrowser.jsx`

- Add transition classes controlled by `freeChatOpen` prop
- When `freeChatOpen = false`: normal layout (search bar + deck list)
- When `freeChatOpen = true`:
  - Deck list and search bar header get exit animation classes
  - A new `FreeChatView` area renders in their place (messages + dock input)
- The outer container does not change height — the transformation is entirely within the existing panel space

### `FreeChatOverlay.jsx` → **deleted**

The standalone overlay component is removed. Its logic is absorbed into a new `FreeChatView` component that renders inline inside `DeckBrowser`.

### New: `FreeChatView.jsx`

Inline chat view rendered within DeckBrowser when `freeChatOpen = true`. Structure:

```
FreeChatView
├── Messages area (flex: 1, overflow-y: auto)
│   └── ChatMessage / StreamingChatMessage (reused from session)
└── ChatInput dock (bottom, flex-shrink: 0)
    ├── Textarea + send button
    └── Action row
        ├── Schließen  [ESC]
        └── Zurücksetzen  [⌘X]
```

No mode buttons. No header tabs. Full surface for chat.

### `ChatInput` (shared component)

The existing `ChatInput` component is reused as-is. The action row labels and shortcuts are passed as props:

```tsx
// Session usage (unchanged):
actionPrimary={{ label: 'Weiter', shortcut: 'SPACE', onClick: handleAdvance }}
actionSecondary={{ label: 'Übersicht', shortcut: '↵', onClick: handleOverview }}

// FreeChatView usage:
actionPrimary={{ label: 'Schließen', shortcut: 'ESC', onClick: handleClose }}
actionSecondary={{ label: 'Zurücksetzen', shortcut: '⌘X', onClick: handleReset }}
```

> Note: If the ChatInput action row labels are currently hardcoded, they need to be made configurable via props. This is a minimal change.

### `App.jsx`

- `handleFreeChatClose` reverses animation and resets state
- Keyboard shortcut `⌘X` wired to reset handler when free chat is open
- `freeChatOpen` passed down to `DeckBrowser`

### `custom_screens.py`

- Remove the `_open_free_chat` method call and the `freeChat` action handler from the polling loop
- The native Anki DeckBrowser (non-React) does not show the FreeChatSearchBar, so no replacement is needed there
- `startFreeChat` event from Python remains in case a future native integration is desired, but is no longer the primary flow

---

## State Management

No changes to `useFreeChat.js`. The hook continues to manage messages, streaming, and cancellation as before.

`freeChatOpen` in `App.jsx` controls:
- Whether `DeckBrowser` shows chat or deck content
- Whether `⌘X` shortcut is active
- Which animation phase is active (entering / entered / exiting / exited)

---

## Keyboard Shortcuts

| Key | Action | Context |
|-----|--------|---------|
| `Enter` | Submit question, open chat | FreeChatSearchBar focused |
| `ESC` | Close chat, back to deck browser | Free chat open |
| `⌘X` | Reset (clear messages, stay in chat) | Free chat open |
| `Enter` | Send follow-up message | ChatInput focused |

---

## What Does NOT Change

- `useFreeChat.js` hook (messages, streaming, cancellation logic)
- Python AI handling (`widget.py`, `bridge.py`, `ai_handler.py`)
- `ChatMessage` and `StreamingChatMessage` components
- The snake-border animation on FreeChatSearchBar
- Session chat (entirely separate code path)
