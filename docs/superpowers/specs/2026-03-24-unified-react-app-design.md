# Unified React App Design — Ansatz B

**Date:** 2026-03-24
**Status:** Draft
**Scope:** Merge two React apps and two Python backends into one of each

---

## Problem

Currently there are TWO React apps running in TWO QWebEngineViews (mini-browsers):

| App | Python Backend | Hosts |
|-----|---------------|-------|
| `MainApp.jsx` (389 lines) | `MainViewWidget` (`ui/main_view.py`) | DeckBrowser, Overview, FreeChat |
| `App.jsx` (~2600 lines) | `ChatbotWidget` (`ui/widget.py`) | Session Chat, Agent Studio, Plusi Menu, Insights |

This creates:

- **2 browsers** — two QWebEngineView instances, each loading `web/index.html` with different `?mode=` params
- **2 message queues** — each widget initializes its own `window.ankiBridge` with its own `messageQueue`
- **2 polling timers** — each widget runs a QTimer polling at 100ms
- **Duplicate components** — `ChatMessage`, `StreamingChatMessage`, `ChatInput`, `ErrorBoundary`, `ContextTags` all imported in both apps
- **No shared state** — DeckBrowser cannot see chat state; chat sidebar cannot see deck data; FreeChat exists in both but with different wiring
- **Double memory** — two full React runtimes, two Vite bundles, two DOM trees

## Solution

Merge `MainApp` INTO `App.jsx` (the smaller into the bigger). One React app, one browser, one message queue.

**Principle:** `App.jsx` is the survivor. `MainApp.jsx` is the donor. Every feature MainApp has gets absorbed into App's existing architecture.

- `App.jsx` gets new `activeView` states: `'deckBrowser'`, `'overview'` (from MainApp)
- `MainViewWidget` stops creating its own QWebEngineView
- `MainViewWidget` uses `ChatbotWidget`'s QWebEngineView for everything
- `ChatbotWidget` becomes the sole backend (already has bridge.py, useAnki, AI threading)
- `MainViewWidget` remains as a positioning shell (fullscreen or 450px sidebar)

---

## Implementation Steps

### Step 1: React Merge

Absorb MainApp's views and logic into App.jsx.

**Changes to `frontend/src/App.jsx`:**
- Import `DeckBrowserView`, `OverviewView`, `TopBar` from MainApp's component imports
- Add `'deckBrowser'` and `'overview'` to the `activeView` state options
- Add `deckBrowserData` and `overviewData` state variables
- Handle `app.stateChanged` events in App.jsx's `ankiReceive` handler (currently only in MainApp):
  ```javascript
  if (payload.type === 'app.stateChanged') {
    const { state, data, freeChatWasOpen } = payload;
    if (state === 'deckBrowser') {
      setDeckBrowserData(data);
      setActiveView(freeChatWasOpen ? 'freeChat' : 'deckBrowser');
    } else if (state === 'overview') {
      setOverviewData(data);
      setActiveView('overview');
    }
  }
  ```
- Add `TopBar` rendering when `activeView` is `'deckBrowser'`, `'overview'`, or `'freeChat'` (replaces MainApp's TopBar usage)
- Add `DeckBrowserView` and `OverviewView` rendering in the view switcher
- Port FreeChat transition logic (`freeChatTransition` state, `openFreeChat`/`closeFreeChat` callbacks) — MainApp's FreeChat becomes App.jsx's FreeChat
- Port keyboard shortcut logic (Space to open FreeChat in deckBrowser, Escape/Space to close)
- Port action registrations from MainApp's `useEffect` (deck.study, deck.select, view.navigate, etc.)

**Changes to `frontend/src/main.jsx`:**
- Remove the `mode` query parameter check
- Always render `<App />`
- Remove `MainApp` import
- The `_ankiReceiveQueue` pre-React buffer stays (still needed)

**Delete `frontend/src/MainApp.jsx`:**
- All content moved to App.jsx — file no longer needed

### Step 2: Single WebView

Make MainViewWidget use ChatbotWidget's QWebEngineView instead of creating its own.

**Changes to `ui/main_view.py`:**

`_setup_ui()` — completely rewritten:
- Do NOT create a `QWebEngineView`
- Instead, create a `ChatbotWidget` instance eagerly (not lazily like current `_ensure_sidebar`)
- Add ChatbotWidget as the sole child widget in the layout
- `self.web_view` becomes a reference to `self._chatbot.web_view` (for convenience)
- No `loadFinished` connection — ChatbotWidget handles its own initialization

```python
def _setup_ui(self):
    self.setStyleSheet("background: transparent;")
    layout = QVBoxLayout()
    layout.setContentsMargins(0, 0, 0, 0)
    layout.setSpacing(0)

    from .widget import ChatbotWidget
    self._chatbot = ChatbotWidget()
    layout.addWidget(self._chatbot)

    self.setLayout(layout)
    self.hide()
```

Remove from MainViewWidget:
- `self.web_view` (own QWebEngineView) — replaced by `self._chatbot.web_view`
- `_init_bridge()` — ChatbotWidget initializes its own ankiBridge
- `message_timer` — ChatbotWidget has its own polling timer
- `_poll_messages()` — handled by ChatbotWidget
- `_handle_messages()` — handled by ChatbotWidget
- `_route_message()` — messages now routed through ChatbotWidget
- `_bridge_initialized` flag — ChatbotWidget manages this

`_send_to_react()` — delegates to ChatbotWidget:
```python
def _send_to_react(self, payload):
    if self._chatbot and self._chatbot.web_view:
        js = "window.ankiReceive && window.ankiReceive(%s);" % json.dumps(payload)
        self._chatbot.web_view.page().runJavaScript(js)
```

`show_sidebar()` / `hide_sidebar()` — simplified:
- No longer toggle between own web_view and sidebar widget
- ChatbotWidget is always the child; MainViewWidget just repositions itself

`show_for_state()` — simplified:
- No mode switching between fullscreen/sidebar web_views
- Just repositions the widget and sends `app.stateChanged` to React
- In review mode: positions as 450px sidebar; in deckBrowser/overview: positions fullscreen

### Step 3: Merge Message Handlers

Move all of MainViewWidget's action handlers into ChatbotWidget's message handler dictionary.

**Handlers to move to `ui/widget.py` (ChatbotWidget):**

Deck actions:
- `deck.study` — `_handle_study_deck()`
- `deck.select` — `_handle_select_deck()`
- `deck.create` — `_handle_create_deck()`
- `deck.import` — `_handle_import_deck()`
- `deck.options` — `_handle_open_deck_options()`

View actions:
- `view.navigate` — `_handle_navigate()`

Chat actions (deck-level):
- `chat.load` — `_handle_load_deck_messages()` (loads from SQLite)
- `chat.save` — `_handle_save_deck_message()` (saves to SQLite)
- `chat.clear` — `_handle_clear_deck_messages()` (clears deck messages)
- `chat.stateChanged` — `_handle_freechat_state()` (tracks FreeChat open/close)

System:
- `stats.open` — `_handle_open_stats()`
- `settings.toggle` — `_handle_toggle_settings_sidebar()`
- `system.textFieldFocus` — already exists in ChatbotWidget, merge MainView's version

**Data gathering methods to move to `ui/widget.py`:**
- `_get_deck_browser_data()` — builds the full deck tree with due counts, card distribution, premium status
- `_get_overview_data()` — gets current deck name and due counts

**After migration, MainViewWidget:**
- Has ZERO message handlers
- Has ZERO polling logic
- Is purely a positioning shell: fullscreen vs. 450px sidebar
- Sends `app.stateChanged` events to React through ChatbotWidget's webview
- Handles Anki state change callbacks (`show_for_state`)

---

## Architecture After Migration

```
Python:
  MainViewWidget (positioning shell only)
    |-- Positions: fullscreen (deckBrowser/overview) or 450px right (review)
    |-- Handles Anki state changes (show_for_state)
    |-- Sends state data through ChatbotWidget's webview
    |-- eventFilter for resize tracking
    '-- Contains:
        ChatbotWidget (the sole backend)
          |-- QWebEngineView -> loads unified App.jsx
          |-- ankiBridge message queue (polls every 200ms)
          |-- 75+ message handlers (all from both widgets merged)
          |-- bridge.py (WebBridge with 50 @pyqtSlot methods — backward compat)
          |-- AIRequestThread (AI streaming)
          |-- SubagentThread, InsightExtractionThread
          |-- Card context tracking (CardTracker)
          '-- Sends/receives via window.ankiReceive

React:
  App.jsx (the ONE app)
    |-- activeView: 'deckBrowser' | 'overview' | 'freeChat' | 'chat' | 'agentStudio' | 'plusiMenu' | ...
    |-- Uses useAnki hook for all bridge communication
    |-- Handles app.stateChanged for ALL Anki states
    |-- TopBar (DeckBrowser/Overview header)
    |-- DeckBrowserView, OverviewView (absorbed from MainApp)
    |-- Chat, AgentStudio, PlusiMenu, Insights (existing)
    |-- FreeChat (unified — was in both apps, now one implementation)
    '-- SettingsSidebar, PaywallModal, etc. (existing)
```

### Widget Hierarchy (Qt)

```
mw (Anki Main Window)
  |-- MainViewWidget (QWidget, positioned over mw)
  |     '-- ChatbotWidget (QWidget, sole child)
  |           '-- QWebEngineView (loads unified App.jsx)
  |-- mw.web (Anki's native webview — visible in review mode behind MainViewWidget)
  '-- mw.toolbar.web (hidden when custom reviewer active)
```

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `frontend/src/App.jsx` | MODIFY | Add DeckBrowser/Overview/FreeChat views, handle `app.stateChanged`, add TopBar, port FreeChat transition logic, port action registrations |
| `frontend/src/main.jsx` | MODIFY | Always render `<App />`, remove `mode` query param routing, remove MainApp import |
| `frontend/src/MainApp.jsx` | DELETE | All content moved to App.jsx |
| `ui/main_view.py` | MODIFY | Remove own QWebEngineView, ankiBridge, polling timer, all message handlers; create ChatbotWidget as sole child; become positioning-only shell |
| `ui/widget.py` | MODIFY | Add deck/overview data gathering methods (`_get_deck_browser_data`, `_get_overview_data`), add deck/view/chat action handlers to message handler dict, add `chat.stateChanged` handler |

## Files NOT Changed

| File | Reason |
|------|--------|
| `ui/bridge.py` | Works as-is through ChatbotWidget — all 50 `@pyqtSlot` methods stay |
| `frontend/src/hooks/useAnki.js` | Works as-is (same `ankiBridge` message queue) |
| `frontend/src/hooks/*.js` (all hooks) | No changes needed — they communicate through useAnki which is unchanged |
| `frontend/src/components/*.jsx` (all 48+) | No changes needed — they receive props, render UI |
| `frontend/src/components/DeckBrowserView.jsx` | Already a standalone component, just imported from App.jsx now |
| `frontend/src/components/OverviewView.jsx` | Already a standalone component, just imported from App.jsx now |
| `frontend/src/components/TopBar.jsx` | Already a standalone component, just imported from App.jsx now |
| `custom_reviewer/*` | Completely separate system — untouched |
| `utils/card_tracker.py` | Still sends to ChatbotWidget |
| `ai/*` | AI modules unchanged — still called by ChatbotWidget's AIRequestThread |
| `storage/*` | Storage unchanged — ChatbotWidget already imports card_sessions |
| `ui/setup.py` | May need minor update if `get_main_view()` API changes, but MainViewWidget's external API stays the same |

---

## DO NOT TOUCH

Lessons from the previous failed SP2 attempt (reset to `2f118ff`):

- **`bridge.py`** — keep all 50 `@pyqtSlot` methods exactly as-is
- **`useAnki.js`** — keep the bridge wrapper hook exactly as-is
- **`custom_reviewer/*`** — completely separate system, do not modify
- **All existing hooks** — they work through useAnki which is unchanged
- **All existing components** — they receive props, no internal bridge dependency
- **`ai/handler.py`, `ai/gemini.py`, `ai/agent_loop.py`** — AI pipeline untouched
- **`storage/card_sessions.py`** — storage layer untouched

---

## Edge Cases

### State Transitions

When Anki changes state (deckBrowser -> review -> overview):

1. **Python:** `show_main_view(state)` called from Anki hooks
2. **Python:** `MainViewWidget.show_for_state(state)` repositions itself (fullscreen or sidebar)
3. **Python:** sends `app.stateChanged` to React via `self._send_to_react()` (through ChatbotWidget's webview)
4. **React:** `App.jsx`'s `ankiReceive` handler receives `app.stateChanged`, updates `activeView`
5. **React:** view renders — DeckBrowserView, OverviewView, or session chat

Key: the **same** QWebEngineView stays loaded throughout. No page reload on state change. React just switches which view component renders.

### FreeChat in DeckBrowser

FreeChat is currently in MainApp with its own message handling. After merge:

- `useFreeChat` hook stays — already used in App.jsx for the overlay
- `DeckBrowserView` shows FreeChat footer as before
- Messages route through the same `useAnki` bridge / `ankiBridge` message queue
- FreeChat open/close state tracked via `chat.stateChanged` handler in ChatbotWidget
- `freeChatWasOpen` flag sent in `app.stateChanged` payload to restore FreeChat after deckBrowser re-entry

### FreeChat Deduplication

Both MainApp and App.jsx currently use `useFreeChat`. After merge:
- One `useFreeChat` instance in App.jsx
- FreeChat renders inside `activeView === 'freeChat'` branch
- The same streaming/chunk/done events flow through the same `ankiReceive`
- No more `EVENT_NAME_MAP` translation needed — ChatbotWidget already sends the correct event types

### Sidebar in Review Mode

- `MainViewWidget` positions as 450px right sidebar (sets geometry)
- `_squeeze_main_content(True)` adds right margin to `mw.centralWidget` so custom reviewer doesn't render behind sidebar
- `ChatbotWidget` fills the sidebar space
- React shows session chat view (`activeView === 'chat'`) — existing App.jsx behavior
- Custom reviewer visible on the left (in `mw.web`)

### AI Request Routing

Currently:
- MainViewWidget has its own `_handle_send_message` that calls `get_request_manager()` for FreeChat
- ChatbotWidget has `AIRequestThread` for session chat

After merge:
- FreeChat messages go through ChatbotWidget's message handler
- ChatbotWidget decides whether to use `AIRequestThread` (session chat with full RAG) or `get_request_manager()` (FreeChat, simpler)
- The `caller_id` or `mode` field distinguishes the two paths

### Theme Consistency

- Only one `<html data-theme="...">` to manage (was two before)
- Theme events (`themeChanged`, `themeLoaded`) handled once in App.jsx
- No risk of one webview being dark while the other is light

### URL Loading

Currently:
- MainViewWidget loads `index.html?mode=main`
- ChatbotWidget loads `index.html` (no mode param)

After merge:
- ChatbotWidget loads `index.html` (no mode param, as before)
- MainViewWidget does not load any URL — it has no webview
- `main.jsx` always renders `<App />`

---

## Migration Safety

### Rollback Plan

Before starting, create a git tag:
```bash
git tag pre-ansatz-b
```

If anything breaks catastrophically, reset:
```bash
git reset --hard pre-ansatz-b
```

### Incremental Verification

Each step is independently testable:

**After Step 1 (React Merge):**
- Build with `npm run build`
- Load `index.html` in browser with mock bridge
- Verify DeckBrowserView renders
- Verify OverviewView renders
- Verify existing chat/AgentStudio/PlusiMenu still work
- MainViewWidget still works with `?mode=main` (MainApp.jsx deleted, but main.jsx now renders App for all modes)

**After Step 2 (Single WebView):**
- Anki starts without errors
- MainViewWidget shows ChatbotWidget's content
- No double webview in memory

**After Step 3 (Merge Message Handlers):**
- All deck actions work (study, select, create, import)
- FreeChat sends and receives messages
- State transitions are clean

---

## Testing Plan

After each step, verify:

1. Anki starts without errors (no Python exceptions in console)
2. DeckBrowser shows with full deck list, due counts, card distribution bars
3. Overview screen shows deck name, due counts, Study button works
4. Review: custom reviewer visible on left, chat sidebar on right (450px)
5. Chat: messages send and receive, streaming works, ThoughtStream shows
6. Cmd+I: sidebar toggles open/close in review mode
7. State transitions: deckBrowser -> overview -> review -> deckBrowser — no flash, no stale content, no old Anki UI visible
8. FreeChat in DeckBrowser: Space opens, Escape closes, messages persist, streaming works
9. Agent Studio, Plusi Menu accessible from chat view
10. Settings sidebar opens from both DeckBrowser (TopBar gear) and chat view
11. Theme switching: dark/light mode consistent across all views
12. Window resize: MainViewWidget repositions correctly (fullscreen and sidebar modes)
13. Multiple state transitions: rapid switching between states doesn't crash or leak

---

## Estimated Complexity

| Step | Effort | Risk |
|------|--------|------|
| Step 1: React Merge | Medium — mostly copy-paste + wiring | Low — App.jsx just gets more views |
| Step 2: Single WebView | Medium — rewire MainViewWidget internals | Medium — positioning/lifecycle changes |
| Step 3: Merge Message Handlers | Low — move handler methods between files | Low — handlers are self-contained functions |

**Total estimated effort:** 1 session (4-6 hours)

The key insight: MainApp.jsx is only 389 lines. App.jsx is ~2600 lines. We are absorbing a small app into a big one, not merging two equals. The big app's architecture (hooks, bridge, message handling) stays intact. The small app's views just become new `activeView` branches.
