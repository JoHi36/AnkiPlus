# Card Preview Mode — Design Spec

## Problem

When a user sees a card reference in the chat (or anywhere else in the app), clicking it currently opens Anki's Browser — a disruptive context switch that breaks the learning flow. The user needs a way to quickly glance at a card without losing their current state, and optionally dive deeper into the card's chat history.

## Solution: Two-Stage Preview

A universal `bridge.openPreview(cardId)` call that works from anywhere in the app. The preview has two stages:

### Stage 1 — "Peek" (Quick Preview)

- Card renders in the Custom Reviewer (back side, revealed)
- **Chat stays where it was** — current context is preserved
- Action bar shows: "Chat öffnen (Enter)" | "Schließen (Space)"
- Session progress counters are hidden
- No rating buttons, no navigation trail

### Stage 2 — "Card Chat" (Full Preview)

- Triggered by Enter or by typing a message + sending it (auto-transitions to Stage 2, message goes to the preview card's chat)
- Chat fades over to this card's chat history (`loadCardSession(cardId)`)
- Full chat interaction — new messages are saved with a "Preview" section marker
- Action bar shows: "Chat schließen (Enter)" | "Schließen (Space)"

### Exit

- **Space** from either stage: closes preview, returns to previous state
- **Tab switch** (manual navigation): auto-closes preview (non-persistent)
- Previous state is fully restored: Anki state, card, chat tab, scroll position

## Architecture: State Layer (Ansatz A)

Preview lives as a state layer on top of the existing Custom Reviewer. No new WebView or widget. One rendering path for all cases.

### Python: PreviewState

Central state object in `custom_reviewer/__init__.py`:

```python
_preview_state = {
    'active': False,
    'stage': None,            # 'peek' | 'card_chat'
    'card_id': None,          # the preview card
    'previous_state': None,   # 'review' | 'overview' | 'deckBrowser'
    'previous_card_id': None, # active session card (if in review)
    'previous_chat_tab': None,# which chat tab was open
    '_transitioning': False   # guard flag to prevent state_will_change re-entrancy
}
```

### Entry Flow: `bridge.openPreview(card_id)`

1. If preview already active → close current preview first (no stacking)
2. Save current state to `_preview_state` (Anki state via `mw.state`, current card, chat tab)
3. If not in review state:
   - Set `_preview_state['_transitioning'] = True`
   - Call `mw.moveToState("review")` to load Custom Reviewer
   - Set `_transitioning = False` after transition completes
4. **Inject preview card into reviewer**: Set `mw.reviewer.card = mw.col.get_card(card_id)`, set `card.timer_started = time.time()` (prevents crash if rating is accidentally triggered), and call `mw.reviewer._initWeb()` via `QTimer.singleShot(0, ...)` (deferred to avoid Qt re-entrancy SEGFAULT when called from pycmd context). This triggers the `webview_will_set_content` hook which renders via Custom Reviewer. Same pattern as the existing `navigate:{cardId}` handler in `handle_custom_pycmd`.
5. Custom Reviewer detects `_preview_state['active']` and renders with `data-state="preview"` instead of `data-state="answer"`. This avoids HISTORY mode — preview gets its own state constant `S.PREVIEW` in `interactions.js`.
6. Send `previewMode: {stage: 'peek', cardId}` to frontend via `window.ankiReceive()`

### Stage Transition: Peek → Card Chat

1. `_preview_state['stage']` → `'card_chat'`
2. Send `previewMode: {stage: 'card_chat', cardId}` to frontend
3. Frontend fades to card-specific chat, loads card session

### Exit Flow

1. Set `_preview_state['_transitioning'] = True` (guard against `state_will_change` re-entrancy)
2. If `previous_state` was `'review'`:
   - Re-inject session card: `mw.reviewer.card = mw.col.get_card(previous_card_id)`
   - Call `mw.reviewer._initWeb()` to re-render
3. If `previous_state` was `'overview'` → `mw.moveToState('overview')`
4. If `previous_state` was `'deckBrowser'` → `mw.moveToState('deckBrowser')`
5. Set `_transitioning = False`
6. Reset `_preview_state`
7. Send `previewMode: null` to frontend → chat restores previous state

### Auto-Close on State Change

The `state_will_change` hook checks: if `_preview_state['active']` and NOT `_preview_state['_transitioning']`, then the user manually navigated away. In this case:
- Reset `_preview_state` (no back-navigation needed, user already left)
- Send `previewMode: null` to frontend
- Do NOT call `mw.moveToState()` (user is already changing state)
- Do NOT close/reopen chat panel (let existing hook logic handle it normally)

### Interaction with Existing `on_state_will_change` Hook

The existing hook in `__init__.py` closes the chat panel when leaving review state (line ~653). This will fire when preview exits back to deckBrowser/overview. To prevent the chat panel from being force-closed during preview exit:
- Check `_preview_state['_transitioning']` in the existing hook
- If transitioning, skip the chat-panel-close logic and let the preview exit flow handle restoration

## Custom Reviewer Changes

### Template: `data-state="preview"`

- Card rendered with back side visible — but NOT via `show_answered=True` (which triggers HISTORY mode). Instead, the Custom Reviewer builds the HTML with both question and answer visible, and sets `data-state="preview"` directly.
- Action area replaces rating buttons with preview actions:
  - Left: "Chat öffnen" with "ENTER" hint (or "Chat schließen" in Stage 2)
  - Right: "Schließen" with "SPACE" hint
- Header shows deck name but hides session progress counters
- No navigation trail arrows

### Keyboard Handling (`interactions.js`)

New state constant `S.PREVIEW` added to the state machine:

| Key | Action |
|-----|--------|
| Space | `pycmd('preview:close')` |
| Enter | `pycmd('preview:toggle_chat')` |
| Escape | `pycmd('preview:close')` (alias) |
| 1-4 | Disabled (no-op) |
| Arrow keys | Disabled (no navigation in preview) |

The `onKeydown` handler checks for `S.PREVIEW` state FIRST, before any other state checks, to ensure preview bindings take priority.

### `handle_custom_pycmd` Extensions

- `preview:close` → triggers exit flow
- `preview:toggle_chat` → toggles between Stage 1 and Stage 2, updates action bar label via JS injection

## Frontend Changes

### Event: `previewMode`

Received via `window.ankiReceive()` from Python:

```javascript
// In App.jsx's ankiReceive handler, add case for type 'previewMode':
{stage: 'peek', cardId: 123}       → Stage 1
{stage: 'card_chat', cardId: 123}  → Stage 2
null                                 → Preview ended
```

### App.jsx State

```javascript
const [previewMode, setPreviewMode] = useState(null);
// null | {stage, cardId, previousChatState}
```

`previousChatState` captures: `{activeTab, sessionId, cardId, scrollTop}`

### Stage 1 (Peek) Behavior

- Chat panel unchanged — user sees whatever chat they were in
- No card context switch in the chat

### Stage 2 (Card Chat) Behavior

- Save `previousChatState` snapshot before switching
- Load card session via `loadCardSession(cardId)`
- Fade transition (CSS transition, ~200ms) to card-specific chat
- New messages saved with a **"Preview" section marker**: `section.type = 'preview'` field in the card session data. Requires adding a `type TEXT DEFAULT 'review'` column to the `review_sections` table in `card_sessions_storage.py` (schema migration on addon load). The `save_section` API is extended to accept the `type` field.
- When user types + sends during Stage 1: auto-transition to Stage 2 first, then send message to preview card's chat

### Preview Exit Behavior

- Restore `previousChatState` (tab, session, scroll position)
- Fade transition back (~200ms)

## Bridge API

### New Method

```python
@pyqtSlot(str, result=str)
def openPreview(self, card_id_str):
    """Universal entry point for card preview from anywhere.

    Can be called from any Anki state (review, overview, deckBrowser).
    Saves current state and renders the target card in preview mode.
    """
```

### Callers

- `CardRefChip.jsx` → `bridge.openPreview(cardId)` (replaces current `goToCard` behavior)
- Any future card reference component → same call
- `CardPreviewModal` can be deprecated once preview mode is stable

### Frontend Bridge Addition

In `useAnki.js`, add:
```javascript
openPreview: (cardId) => {
    window.ankiBridge.addMessage('openPreview', { cardId });
}
```

## From Deck Overview (Stapelübersicht)

When preview is triggered from outside review state:

1. `openPreview` saves `previous_state = 'overview'`
2. Sets `_transitioning = True`, calls `mw.moveToState("review")`
3. Card is injected into reviewer via `rev.card = card; rev._initWeb()`
4. Custom Reviewer renders in preview mode
5. Chat panel opens beside it (session-like layout)
6. Enter → switches to Session tab with card-specific chat (Stage 2)
7. Space → sets `_transitioning = True`, calls `mw.moveToState('overview')`, restores chat

## Edge Cases

- **Preview while already in preview**: Close current preview first, then open new one (no stacking)
- **AI response streaming when closing**: Let response complete in background (messages already saved to card session)
- **Card doesn't exist**: Return error from `openPreview`, no state change
- **Review queue empty when returning**: If `previous_state` was `'review'` but `previous_card_id` is None or card no longer exists, return to overview instead
- **`mw.moveToState("review")` fails** (no deck selected, empty collection): Return error, no state change
- **User clicks another card ref during preview**: Close current preview, open new one (sequential, not stacked)
