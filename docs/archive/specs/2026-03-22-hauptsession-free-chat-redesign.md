# Hauptsession / Free Chat Redesign

## Problem

The Free Chat (continuous, card-independent chat) exists in two half-finished implementations:
1. **FreeChatView** — embedded in DeckBrowser (custom_screens HTML injection), limited to vanilla JS
2. **OverlayChatWidget** — separate Python QWidget with its own QWebEngineView, loads React app with `?mode=freechat`

Neither works well. The overlay has no header/tabs, no smooth transition, no context tags, and duplicates AI thread logic. The DeckBrowser's FreeChatView can't use React components because custom_screens is pure HTML injection into Anki's native webview.

## Solution

Redesign the overlay as a pixel-identical extension of the Stapel view. The overlay renders the same header (tabs, info) in React, positions itself exactly over the custom_screens content, and provides a smooth animated transition. The user perceives one continuous view — the header never "jumps."

This is a deliberate stepping stone: when custom_screens is eventually migrated to React, these overlay components integrate directly with zero rewrite.

## Architecture

### Rendering Stack

```
mw (Anki Main Window)
├── mw.web (Anki's native QWebEngineView)
│   └── custom_screens injects HTML (Stapel/Session/Statistik tabs, deck list, search bar)
│
├── OverlayChatWidget (QWidget, positioned exactly over mw.web)
│   └── QWebEngineView (loads web/index.html?mode=freechat)
│       └── FreeChatApp (React)
│           ├── Header (pixel-identical replica of custom_screens header)
│           ├── Chat area (ChatMessage, StreamingChatMessage, context tags)
│           └── ChatInput dock (bottom-fixed, frosted glass)
│
├── QDockWidget (right sidebar — session chat, unchanged)
│   └── ChatbotWidget → React App (App.jsx)
```

### State Ownership

| State | Owner | Persistence |
|-------|-------|------------|
| Chat open/closed | OverlayChatWidget (`_chat_open` flag) | In-memory, survives tab switches |
| Message history | SQLite (`messages` table, `card_id=NULL`) | Persistent |
| Streaming state | FreeChatApp React state | Transient |
| Tab state (Stapel/Session/Statistik) | custom_screens | HTML-level, managed by Anki |

### Communication Flow

```
User types in search bar (custom_screens HTML)
  → JS sets: window._apAction = {type:'freeChat', text:'...'}
  → Python polls _apAction (100ms timer in custom_screens)
  → Python calls: overlay.show_overlay(text)
  → OverlayChatWidget positions over mw.web, sends overlayShow to React
  → FreeChatApp animates in, sends message to AI

User presses Space (close)
  → React sends closeOverlay message
  → Python calls overlay.hide_overlay()
  → OverlayChatWidget animates out (300ms), then hides
  → custom_screens is visible again underneath
```

## Components

### 1. OverlayChatWidget (Python) — `ui/overlay_chat.py`

Refactor the existing overlay. Changes:

- **Position tracking**: `_position_over_main()` must match `mw.web` exactly (not `mw.centralWidget`), accounting for any toolbar space
- **Polling interval**: 100ms (changed from current 200ms to match sidebar consistency)
- **Two-flag state model**: `_chat_open` (intent: user wants chat open) vs `_visible` (physical: widget is currently shown). On tab switch away from Stapel: set `_visible = False`, hide widget, but keep `_chat_open = True`. On return to Stapel: if `_chat_open`, call `show_overlay()` to restore. If a streaming request is active during tab switch, cancel it — the user left the context
- **Remove duplicate AI logic**: Delete the inline `FreeChatThread` class. Instead, delegate to the main `ChatbotWidget`'s AI pipeline via a shared signal or direct call to `ai/handler.py`. The overlay's message queue routes `sendMessage` to the same handler the sidebar uses
- **Bridge consolidation**: Instead of a separate minimal `ankiBridge`, reuse the same bridge methods. The overlay's `_route_message()` should handle the same message types as `widget.py`'s `_handle_js_message()`

Key methods:
```python
def show_overlay(self, initial_text=''):
    """Show overlay, restore chat state if previously open."""
    self._chat_open = True
    self._position_over_main()
    self.show()
    self.raise_()
    # Send overlayShow with initial_text to React

def hide_overlay(self):
    """Hide overlay but keep chat state."""
    self._chat_open = False
    # Send overlayHide to React, hide after 300ms animation

def restore_if_open(self):
    """Called from custom_screens when Stapel tab becomes active (via state_will_change hook
    or custom_screens _on_webview_content when state=='deckBrowser')."""
    if self._chat_open:
        self.show_overlay()
```

### 2. FreeChatApp (React) — `frontend/src/FreeChatApp.jsx`

Complete rewrite of the current minimal component. New structure:

```
FreeChatApp
├── OverlayHeader (pixel-identical to custom_screens header)
│   ├── Left: ✦ icon + "{N} Nachrichten" count
│   ├── Center: Tab bar (Stapel active, Session, Statistik) — visual only, clicks route to Python
│   └── Right: Hold-to-reset indicator ("R gedrückt halten" + progress bar)
├── ChatArea (scrollable, flex: 1)
│   ├── Empty state: "Stelle eine Frage..." centered
│   └── Messages list
│       ├── UserMessage + ContextTags (deck + card or "Freie Frage")
│       ├── BotMessage (ChatMessage component, reused from session)
│       └── StreamingChatMessage (reused from session)
└── ChatInputDock (bottom-fixed, frosted glass)
    ├── Input field
    ├── Left action: "Schließen ␣"
    └── Right action: "Senden →"
```

### 3. ContextTags (React) — new component

Displayed directly below each user message. Two variants:

**Card-context message:**
```
[📚 Anatomie] → [🃏 An welcher knöchernen Str...]
```
- Deck tag: immediate deck name only (not full path). Clickable → opens deck
- Arrow separator
- Card tag: card front text, truncated. Clickable → opens card preview

**Free-chat message (no card context):**
```
[Freie Frage]
```
- Muted color (not blue), subtler appearance

Implementation:
- Deck name: `msg.deckName` (already stored in messages table, extracted as last segment of `::` path)
- Card front: `msg.cardFront` (already stored)
- Both tags use `var(--ds-accent)` background at 12% opacity for card-context, `var(--ds-border-subtle)` for free-chat

### 4. HoldToReset (React) — new component

Top-right header element. Behavior:

1. Shows `R` in a subtle key badge
2. On keydown `R` (not in input): starts filling a progress bar (left to right, 1.5s duration)
3. On keyup before complete: progress bar resets, nothing happens
4. On completion: progress bar flashes, chat is cleared
5. Clear = delete all deck-level messages from DB (`card_id=NULL` for current deck or global) + clear React state

Visual: thin horizontal line that grows from left to right, color transitions from `var(--ds-text-muted)` to `var(--ds-red)` as it fills.

## Transition Animation

### Opening (Stapel → Chat)

Trigger: User types in search bar + Enter, or presses Space/double-tap.

Timeline (total ~400ms):

| Time | Element | Property | From | To |
|------|---------|----------|------|----|
| 0ms | Overlay | opacity | 0 | 0 |
| 0ms | Overlay | display | none | flex |
| 16ms | Overlay background | background-color | transparent | `var(--ds-bg-deep)` |
| 16ms | Header | opacity | 1 | 1 (no change — already pixel-identical) |
| 0-350ms | Background | background-color | `var(--ds-bg-canvas)` | `var(--ds-bg-deep)` |
| 0-300ms | Content area | opacity | 0 → 1 |
| 0-300ms | Content area | transform | translateY(-12px) → translateY(0) |
| 50-350ms | Input dock | opacity | 0 → 1 |
| 50-350ms | Input dock | transform | translateY(8px) → translateY(0) |
| 200-400ms | Messages (if any) | opacity | 0 → 1 (staggered per message, 30ms delay each) |

Easing: `cubic-bezier(0.25, 0.1, 0.25, 1)` (ease-out feel)

### Closing (Chat → Stapel)

Trigger: Space bar or "Schließen" button.

Timeline (total ~300ms):

| Time | Element | Property | From | To |
|------|---------|----------|------|----|
| 0-250ms | Content area | opacity | 1 → 0 |
| 0-250ms | Content area | transform | translateY(0) → translateY(12px) |
| 0-200ms | Input dock | opacity | 1 → 0 |
| 50-300ms | Background | background-color | `var(--ds-bg-deep)` → transparent |
| 300ms | Overlay | display | flex → none |

### Key Principle

The header in the overlay is pre-rendered to match custom_screens pixel-for-pixel. When the overlay appears, the header is already in place — there is no visible "swap." The only animated elements are the content area and background color.

## AI Integration

### Context

The free chat uses the same AI handler as the session chat:
- Same tools (images, diagrams, molecules, subagents)
- Same RAG pipeline
- Same streaming infrastructure
- Difference: `cardContext = null` (no active card)

### System Prompt

Use the existing system prompt from `ai/system_prompt.py` but without card-specific context. The free chat context includes:
- Date, collection size
- No card front/back (no card is "open")
- No insights injection (no specific card)

### History

Last 20 messages from the chronological free chat (deck-level messages, `card_id=NULL`), sent as conversation history. Messages from card sessions that were pushed to the free chat timeline are included — they provide continuity.

### Bridge Consolidation

The overlay currently duplicates AI thread logic (inline `FreeChatThread` class). Refactor to eliminate duplication.

**Approach: Extract `AIRequestManager`** from `widget.py` into a shared class that both sidebar and overlay use. Each caller provides its own `send_to_react` callback for streaming chunks. The manager handles:
- Thread lifecycle (start, cancel, cleanup)
- Mutual exclusion: only one active request at a time across all callers. If the sidebar has an active request and the overlay sends a new one (or vice versa), the previous request is cancelled first. This matches user expectation — you can't talk to the AI in two places simultaneously.
- Signal routing: `chunk_signal` → caller's `send_to_react`, `finished_signal` → caller's completion handler

```python
class AIRequestManager:
    """Shared AI request handler for sidebar and overlay."""
    _current_thread = None
    _current_caller = None  # 'sidebar' or 'overlay'

    def start_request(self, text, context, history, mode, callbacks, caller_id):
        """Start AI request, cancelling any active request first."""
        if self._current_thread:
            self._current_thread.cancel()
        self._current_caller = caller_id
        # ... create thread, wire callbacks, start
```

No duplicate `FreeChatThread` class in overlay_chat.py.

## Shortcuts

| Shortcut | Context | Action |
|----------|---------|--------|
| Space | Stapel view, input not focused | Open chat overlay |
| Space | Chat overlay, input not focused | Close chat overlay |
| Enter | Chat overlay, input not focused | Open Agent Menu |
| Enter | Chat overlay, input focused | Send message |
| R (hold 1.5s) | Chat overlay, input not focused | Reset/clear chat |
| Escape | Chat overlay | Close chat overlay |
| ⌘K | Stapel view | Focus search bar (existing) |

### Shortcut Routing

All shortcuts route through `GlobalShortcutFilter` (`ui/shortcut_filter.py`). Key considerations:

**Space key**: Only active as chat open/close when Anki state is `deckBrowser` (Stapel view). In reviewer state, Space remains Anki's native "show answer." The GlobalShortcutFilter checks `mw.state` before intercepting.

**R key (hold-to-reset)**: Handled at the **React level** within the overlay's QWebEngineView. The GlobalShortcutFilter must pass through `R` keydown/keyup events to the overlay when it is visible. Add an `_overlay_visible` flag to the filter that the overlay sets on show/hide. When true, the filter forwards R events instead of consuming them.

**Input focus tracking**: The overlay's React sends `focusin`/`focusout` messages through its own message queue (same pattern as the sidebar). The GlobalShortcutFilter's `_text_field_has_focus` flag works across both webviews — whichever sends the most recent focus message wins.

**Tab clicks in overlay header**: Route to Python via the overlay's message queue (`window.ankiBridge.addMessage('switchTab', 'session')`). Python handler closes the overlay and triggers the appropriate custom_screens navigation.

## Data Model

### Schema Dependency

The messages table requires the `deck_id` migration (added in `_migrate_schema()`). The original schema has `card_id INTEGER NOT NULL`; the migration recreates the table as `messages_new` with `card_id INTEGER` (nullable) and `deck_id INTEGER`. This migration runs automatically on DB open. Fresh installs after the migration code was added get the new schema via the migration path, not `_init_schema` — this is correct and tested.

### Message Types

```sql
-- Card-context message (from session, has both card_id and deck_id)
INSERT INTO messages (card_id, deck_id, text, sender, ...)
VALUES (12345, 67, 'Explain meniscus', 'user', ...)

-- Free-chat message (no card, deck_id=0 for global)
INSERT INTO messages (card_id, deck_id, text, sender, ...)
VALUES (NULL, 0, 'General question', 'user', ...)
```

### Display vs AI History

`load_deck_messages(deck_id=0)` loads ALL messages across all decks — both card-context and free-chat. This is intentional: the chronological timeline shows everything. The AI history also receives all messages (last 20) for continuity.

### Reset Operation

Reset clears **only** free-chat messages (those without card association). Card-context messages that appear in the timeline remain in the DB and will reappear when the chat is reopened.

```sql
-- Clear free-chat messages only
DELETE FROM messages WHERE card_id IS NULL
```

This is the correct semantic: the user's card-session conversations are their learning history and should not be deletable from the free chat view. After reset, the timeline shows only card-context messages (if any).

### Context Tag Data

Available at read time (not stored as columns):
- `deck_name` → joined from `card_sessions` table in `load_deck_messages()` query. Extract last `::` segment for display
- `card_front` → enriched by `_get_card_front_texts()` after query (reads from Anki's note DB, not stored in messages table)
- `card_id` → stored in messages table, used for click-to-open behavior

## Migration Path

This design deliberately supports incremental migration to full-React custom_screens:

1. **Now**: Overlay with pixel-identical header, React chat components
2. **Later**: Convert custom_screens deck list to React (DeckBrowser component)
3. **Final**: Remove overlay layer, embed everything in one React QWebEngineView

Components built now (OverlayHeader, ContextTags, HoldToReset, ChatArea) are directly reusable in step 2-3.

## Files to Modify

| File | Change |
|------|--------|
| `ui/overlay_chat.py` | Refactor: state persistence, position tracking, remove duplicate AI thread, bridge consolidation |
| `frontend/src/FreeChatApp.jsx` | Rewrite: add header, context tags, hold-to-reset, animation system |
| `frontend/src/components/ContextTags.jsx` | New: deck + card tags under user messages |
| `frontend/src/components/HoldToReset.jsx` | New: hold-R-to-clear interaction |
| `frontend/src/components/OverlayHeader.jsx` | New: pixel-identical header replica |
| `frontend/src/hooks/useFreeChat.js` | Extend: reset/clear method, message count |
| `ui/custom_screens.py` | Minor: ensure `freeChat` action triggers overlay correctly, pass deck context |
| `ui/shortcut_filter.py` | Add: Space/R shortcuts when overlay is visible |
| `storage/card_sessions.py` | Add: `clear_deck_messages()` function for reset |
| `frontend/src/hooks/useFreeChat.js` | Add: `clearMessages()` method that calls bridge + clears local state |

## Header Measurements (for pixel-matching)

Reference: `custom_screens.py` `_top_bar()` function. The overlay header must match these values:

| Property | Value |
|----------|-------|
| Header height | 48px (padding: 12px 16px) |
| Plus icon | 14px, color `var(--ds-accent)` |
| Left info text | 12px, color `var(--ds-text-muted)`, font-weight 400 |
| Tab bar | centered, gap 4px between tabs |
| Active tab | background `var(--ds-border-subtle)`, border-radius 8px, padding 4px 12px, font-size 12px, font-weight 600, color `var(--ds-text-primary)` |
| Inactive tab | no background, font-size 12px, color `var(--ds-text-muted)` |
| Right info | font-size 10px, colored dots (Neu/Fällig/Wieder) |
| Border bottom | 1px solid `var(--ds-border-subtle)` |

In chat mode, these change:
- Left: "✦ {N} Nachrichten" (same font specs as "Heute: X Karten")
- Right: HoldToReset component replaces Neu/Fällig/Wieder

## Out of Scope

- Card preview within the free chat (future feature)
- Session tab content changes
- Statistik tab changes
- Full custom_screens-to-React migration
