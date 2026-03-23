# SP1: Fullscreen React Shell — DeckBrowser + Overview + FreeChat

## Problem

The main content area uses three separate rendering systems:
1. **custom_screens.py** (1474 lines) — Python HTML-string injection for DeckBrowser + Overview
2. **overlay_chat.py** — Separate QWebEngineView overlay for FreeChat
3. **custom_reviewer/** — HTML injection for card display (untouched in SP1)

This creates: no component reuse, no shared state, impossible smooth transitions, and triple maintenance burden.

## Solution

Replace custom_screens and overlay_chat with a single permanent `MainViewWidget` — a QWebEngineView covering `mw.web` that runs a new React root (`MainApp`). React renders DeckBrowser, Overview, and FreeChat based on Anki state changes communicated via bridge.

## Architecture

### Rendering Stack

```
mw (Anki Main Window)
├── mw.web (hidden behind MainViewWidget, still exists for Anki internals)
│   └── review state: custom_reviewer HTML (UNCHANGED in SP1)
│
├── MainViewWidget (NEW — permanent QWidget positioned over mw.web)
│   └── QWebEngineView (loads web/index.html?mode=main)
│       └── MainApp (NEW React root)
│           ├── TopBar (pixel-identical to current _top_bar)
│           ├── DeckBrowserView (deck tree, search bar, stats)
│           ├── OverviewView (study button, deck info, pills)
│           ├── FreeChatView (full chat with ContextTags, HoldToReset)
│           └── PlusiDock (bottom-left mascot)
│
├── QDockWidget (sidebar — UNCHANGED in SP1)
│   └── ChatbotWidget → App.jsx (session chat)
```

### State Management

Python `state_will_change` hook sends state + data to React:

```
state == 'deckBrowser' → MainViewWidget.show()
    ankiReceive({type:'stateChanged', state:'deckBrowser', data:{deckTree, dues}})

state == 'overview' → MainViewWidget.show()
    ankiReceive({type:'stateChanged', state:'overview', data:{deckName, dues, deckId}})

state == 'review' → MainViewWidget.hide()
    mw.web visible → custom_reviewer renders cards as before
```

### View Transitions (React-internal)

DeckBrowser ↔ FreeChat is a pure React state change:
- User types in search bar → `setActiveView('freeChat')` → CSS transition
- User presses Space → `setActiveView('deckBrowser')` → CSS transition back
- No Python involvement for this transition
- Background color animates: `--ds-bg-canvas` → `--ds-bg-deep`

DeckBrowser → Overview is triggered by Python:
- User clicks a deck → bridge message → Python selects deck + changes state
- Python sends `stateChanged` with overview data → React renders Overview

### Communication Flow

```
MainViewWidget (Python)
  ├── show/hide based on mw.state
  ├── message polling (100ms) — same pattern as ChatbotWidget
  ├── routes messages: sendMessage, cancelRequest, loadDeckMessages, etc.
  └── sends to React: stateChanged, deckMessagesLoaded, streaming, bot, etc.

MainApp (React)
  ├── receives ankiReceive payloads
  ├── manages view state internally (deckBrowser | overview | freeChat)
  ├── DeckBrowser → FreeChat transitions are CSS-only
  └── sends bridge messages: studyDeck, selectDeck, sendMessage, etc.
```

## Components

### Python: MainViewWidget (`ui/main_view.py`)

New file. Replaces both `overlay_chat.py` and `custom_screens.py`.

Key responsibilities:
- Create QWebEngineView loading `web/index.html?mode=main`
- Position permanently over `mw.web` (resize tracking via eventFilter)
- Initialize ankiBridge message queue
- Poll messages at 100ms
- Route messages to handlers (AI requests, deck navigation, storage, etc.)
- Listen to `state_will_change` hook and send state + data to React
- Hide during review state, show during deckBrowser/overview

Data gathering methods (moved from custom_screens):
- `_get_deck_tree_data()` — builds deck tree with due counts
- `_get_overview_data(deck_id)` — deck name, due counts for overview
- `_get_header_info()` — total due counts for header

AI request handling:
- Delegates to `AIRequestManager` (from `ai/request_manager.py`)
- Same streaming/cancel/error pattern as current overlay

### React: MainApp (`frontend/src/MainApp.jsx`)

New React root component. Entry point when `?mode=main`.

State:
```
activeView: 'deckBrowser' | 'overview' | 'freeChat'
ankiState: 'deckBrowser' | 'overview' | 'review'  // from Python
deckTreeData: { roots: [...], totalNew, totalLearn, totalReview }
overviewData: { deckName, dueNew, dueLearning, dueReview, deckId }
freeChatTransition: 'idle' | 'entering' | 'visible' | 'exiting'
```

### React: TopBar (`frontend/src/components/TopBar.jsx`)

Replaces both `_top_bar()` from custom_screens AND `OverlayHeader`. Single component, adapts based on `activeView` and `ankiState`.

Props:
- `activeTab` — which tab is highlighted (derived from ankiState)
- `activeView` — current view (affects left/right content)
- `messageCount` — for FreeChat mode
- `dueNew/dueLearning/dueReview/totalDue` — stats
- `deckName` — for overview mode
- `onTabClick` — navigation
- `holdToResetProps` — for FreeChat mode

Content switching:
- Stapel tab + deckBrowser view: "Heute: X Karten" | Neu/Fällig/Wieder legend
- Stapel tab + freeChat view: "N Nachrichten" | HoldToReset indicator
- Session tab: deck name | due numbers
- Tab clicks: Stapel/Session route through Python (state change), Statistik opens stats window

### React: DeckBrowserView (`frontend/src/components/DeckBrowserView.jsx`)

Replaces `_deck_browser_html()`, `_deck_card()`, `_child_row()`.

Sub-components:
- `DeckNode` — recursive, renders a deck with expand/collapse
- `DeckSearchBar` — search input with rotating placeholders, snake border animation
- `AccountBadge` — "AnkiPlus Free/Pro" badge (bottom-right)

Data: Receives `deckTreeData` from Python via `stateChanged` payload.

Expand state: localStorage, key `ap_expand`, same format as current.

Interactions:
- Click deck name → bridge message `studyDeck(deckId)` → Python selects deck + transitions to overview
- Click expand chevron → toggle localStorage + local state
- Search bar Enter → `setActiveView('freeChat')` with initial text (React-internal)
- Search bar double-click → `setActiveView('freeChat')` empty

### React: OverviewView (`frontend/src/components/OverviewView.jsx`)

Replaces `_overview_html()` (~296 lines).

Content:
- Deck name (hierarchical path display)
- Three pills: New / Learning / Review counts
- "Jetzt lernen" button → bridge message → Python starts study
- "Zurück" button → bridge message → Python goes to deckBrowser

Data: Receives `overviewData` from Python via `stateChanged` payload.

### React: FreeChatView

Reuses components from the current FreeChatApp:
- `useFreeChat` hook (already has clearMessages, messageCount)
- `useHoldToReset` hook
- `ContextTags` component
- `ChatMessage`, `StreamingChatMessage`, `ChatInput`

The key difference: it's no longer a separate React root. It's a view within MainApp, sharing the same DOM and state tree.

## Transition Animations

### DeckBrowser → FreeChat (Space or Enter in search bar)

```
Time  | Background           | Deck content          | Chat content
0ms   | --ds-bg-canvas       | opacity 1, y=0        | not mounted
16ms  | transition starts    | opacity→0, y→-20px    | mounted, opacity 0
350ms | --ds-bg-deep         | display none           | opacity→1, y→0
```

### FreeChat → DeckBrowser (Space or Schließen)

```
Time  | Background           | Chat content          | Deck content
0ms   | --ds-bg-deep         | opacity 1, y=0        | not mounted
16ms  | transition starts    | opacity→0, y→12px     | mounted, opacity 0
350ms | --ds-bg-canvas       | unmounted              | opacity→1, y→0
```

### DeckBrowser → Overview (click deck → Python state change)

No CSS transition needed — Python sends new state + data, React swaps view instantly. The deck tree slides out, overview slides in.

### Overview → Review (click "Jetzt lernen" → Python state change)

MainViewWidget hides. `mw.web` becomes visible with custom_reviewer.

### Review → DeckBrowser/Overview (press Escape or finish cards)

MainViewWidget shows. React renders based on the state Python sends.

## Shortcuts

| Shortcut | Context | Action |
|----------|---------|--------|
| Space | DeckBrowser, input not focused | Open FreeChat |
| Space | FreeChat, input not focused | Close FreeChat → DeckBrowser |
| Enter | DeckBrowser search bar | Open FreeChat with text |
| Escape | FreeChat | Close FreeChat → DeckBrowser |
| R (hold 1.5s) | FreeChat, input not focused | Clear chat |
| Cmd+K | Any | Focus search bar / input |

All shortcuts handled in React (MainApp's keydown listeners). The GlobalShortcutFilter passes through all keys when MainViewWidget is visible (not in review state).

## Bridge Methods

### Existing (reused as-is)
- `sendMessage`, `cancelRequest` — AI chat
- `loadDeckMessages`, `saveDeckMessage`, `clearDeckMessages` — storage
- `goToCard`, `openPreview` — card navigation
- `getCardDetails` — card preview

### New (added to main_view.py message routing)
- `studyDeck(deckId)` — select deck + start study
- `selectDeck(deckId)` — select deck + show overview
- `navigateTo(state)` — go to deckBrowser/overview
- `openStats()` — open stats window
- `openDeckOptions()` — open deck options
- `toggleSettingsSidebar()` — toggle settings panel

### Removed (from overlay_chat.py — deleted)
- `switchTab` — now React-internal
- `toggleSidebar` — renamed to `toggleSettingsSidebar`

## Data Model

No schema changes. Same SQLite tables, same message format.

FreeChat messages: `card_id=NULL`, `deck_id=0`
Card-context messages: `card_id=N`, `deck_id=M`

## Files to Create

| File | Purpose |
|------|---------|
| `ui/main_view.py` | MainViewWidget — permanent fullscreen QWebEngineView |
| `frontend/src/MainApp.jsx` | React root for main view |
| `frontend/src/components/TopBar.jsx` | Unified top bar (replaces OverlayHeader + _top_bar) |
| `frontend/src/components/DeckBrowserView.jsx` | Deck tree + search bar |
| `frontend/src/components/DeckNode.jsx` | Single deck card (recursive) |
| `frontend/src/components/DeckSearchBar.jsx` | Search input with animations |
| `frontend/src/components/OverviewView.jsx` | Study overview screen |
| `frontend/src/components/AccountBadge.jsx` | AnkiPlus Free/Pro badge |
| `frontend/src/hooks/useDeckTree.js` | Expand/collapse state management |

## Files to Delete

| File | Reason |
|------|--------|
| `ui/overlay_chat.py` | Replaced by MainViewWidget |
| `ui/custom_screens.py` | Replaced by React components |
| `frontend/src/FreeChatApp.jsx` | Integrated into MainApp |
| `frontend/src/components/OverlayHeader.jsx` | Replaced by TopBar |
| `frontend/src/components/FreeChatView.jsx` | Already deleted in earlier task |

## Files to Modify

| File | Change |
|------|--------|
| `__init__.py` | Register MainViewWidget instead of custom_screens hooks |
| `ui/setup.py` | Create MainViewWidget instead of/alongside dock |
| `ui/shortcut_filter.py` | Update overlay flags for MainViewWidget |
| `frontend/src/main.jsx` | Add `mode=main` routing to MainApp |
| `frontend/src/hooks/useFreeChat.js` | Minor: remove overlay-specific messaging |

## Edge Cases

### FreeChat active when Python forces state change

If the user is in FreeChat and Anki changes state (e.g., `overview` or `review`):
- React receives `stateChanged` payload
- If `state == 'review'`: MainViewWidget hides, FreeChat state is preserved in React memory. When returning to deckBrowser, FreeChat reopens automatically.
- If `state == 'overview'`: React switches to OverviewView. FreeChat state preserved. Returning to Stapel tab restores FreeChat if it was open.

### webview_will_set_content hook

The hook in `__init__.py` currently triggers `custom_screens._on_webview_content()` for deckBrowser and overview states. After migration:
- **Remove** the custom_screens hook entirely
- **Keep** the custom_reviewer hook (only fires for Reviewer context)
- The hook handler in `__init__.py` must check: `if isinstance(context, Reviewer)` only

### Plusi Dock

custom_screens renders the Plusi mascot at bottom-left via `_get_plusi_dock_html()`. In MainApp, add a `<PlusiDock />` component (can reuse the existing shared `plusi-renderer.js`). Positioned fixed bottom-left, same as current.

### Settings Sidebar

custom_screens triggers the settings sidebar via `toggle_settings_sidebar()`. MainApp sends a bridge message `toggleSettingsSidebar` which Python routes to the existing settings sidebar code. No change to the settings sidebar itself.

### Account Badge

The "AnkiPlus Free/Pro" badge currently rendered by `_account_widget()` (534 lines!) is replaced by a simple `<AccountBadge />` React component. Premium status is sent with the `stateChanged` payload.

## Out of Scope (SP1)

- Sidebar migration (SP2)
- Reviewer migration (SP3)
- Bridge consolidation (SP4)
- Light mode testing
