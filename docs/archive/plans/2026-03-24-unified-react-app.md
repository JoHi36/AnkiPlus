# Unified React App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge two React apps (MainApp.jsx + App.jsx) and two Python backends (MainViewWidget + ChatbotWidget) into one of each — one React app, one browser, one message queue.

**Architecture:** App.jsx absorbs MainApp.jsx's views (DeckBrowser, Overview, FreeChat). MainViewWidget becomes a positioning-only shell. ChatbotWidget becomes the sole backend with all message handlers.

**Tech Stack:** React 18, PyQt6, QWebEngineView, ankiBridge message queue

**Spec:** `docs/superpowers/specs/2026-03-24-unified-react-app-design.md`

**Testing:** Manual in Anki (Qt + WebEngine cannot be unit tested). Each task has a verification checklist.

**Safety:** Run `git tag pre-unified-app` before starting. Reset with `git reset --hard pre-unified-app` if needed.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/App.jsx` | MODIFY | Add DeckBrowser/Overview/FreeChat views, handle `app.stateChanged` |
| `frontend/src/main.jsx` | MODIFY | Always render App, remove mode routing |
| `frontend/src/MainApp.jsx` | DELETE | Content moved to App.jsx |
| `ui/main_view.py` | REWRITE | Remove own WebView/bridge/polling, create ChatbotWidget as sole child, positioning only |
| `ui/widget.py` | MODIFY | Add deck/overview data handlers, add `app.stateChanged` sending |
| `ui/setup.py` | MODIFY | Minor — adapt to new MainViewWidget API |

**DO NOT TOUCH:** `ui/bridge.py`, `frontend/src/hooks/useAnki.js`, `custom_reviewer/*`, all hooks, all components, `ai/*`, `storage/*`

---

### Task 1: Add DeckBrowser/Overview/FreeChat views to App.jsx

**Files:**
- Modify: `frontend/src/App.jsx`

This is the biggest task. We add MainApp's views to App.jsx as new `activeView` branches.

- [ ] **Step 1: Add imports from MainApp**

At the top of App.jsx, add:
```javascript
import TopBar from './components/TopBar';
import DeckBrowserView from './components/DeckBrowserView';
import OverviewView from './components/OverviewView';
import { registerAction, executeAction, bridgeAction } from './actions';
import { emit } from './eventBus';
import { useHoldToReset } from './hooks/useHoldToReset';
```

Note: Some of these may already be imported (ChatInput, ChatMessage, useFreeChat, ErrorBoundary). Don't duplicate.

- [ ] **Step 2: Add state variables in AppInner**

After existing state declarations in `AppInner()`, add:
```javascript
// MainApp states (deck browser / overview / free chat)
const [ankiState, setAnkiState] = useState('deckBrowser');
const [deckBrowserData, setDeckBrowserData] = useState(null);
const [overviewData, setOverviewData] = useState(null);
const [freeChatTransition, setFreeChatTransition] = useState('idle');
const [inputFocused, setInputFocused] = useState(false);
```

Extend existing `activeView` state to include new values: `'deckBrowser'`, `'overview'`, `'freeChat'`.

- [ ] **Step 3: Add `app.stateChanged` handler in ankiReceive**

In the existing ankiReceive handler (the big `useEffect` that sets up `window.ankiReceive`), add handling for `app.stateChanged` BEFORE the existing payload routing:

```javascript
if (payload.type === 'app.stateChanged' || payload.type === 'stateChanged') {
  const { state, data, freeChatWasOpen } = payload;
  setAnkiState(state);
  if (state === 'deckBrowser') {
    setDeckBrowserData(data);
    if (freeChatWasOpen) {
      setActiveView('freeChat');
      setFreeChatTransition('visible');
    } else {
      if (activeViewRef.current === 'freeChat') {
        setFreeChatTransition('idle');
      }
      setActiveView('deckBrowser');
    }
  } else if (state === 'overview') {
    if (activeViewRef.current === 'freeChat') {
      setFreeChatTransition('idle');
      bridgeAction('chat.stateChanged', { open: false });
    }
    setOverviewData(data);
    setActiveView('overview');
  } else if (state === 'review') {
    setActiveView('chat'); // existing session chat view
  }
  return;
}
```

- [ ] **Step 4: Add FreeChat open/close callbacks**

Port from MainApp — add inside AppInner:
```javascript
const openFreeChat = useCallback((initialText) => {
  loadForDeck(0); // from useFreeChat
  setFreeChatTransition('mounting');
  setTimeout(() => {
    setFreeChatTransition('entering');
    setTimeout(() => setFreeChatTransition('visible'), 400);
  }, 50);
  setActiveView('freeChat');
  bridgeAction('chat.stateChanged', { open: true });
  if (initialText?.trim()) {
    setTimeout(() => freeChatHook.handleSend(initialText, 'compact'), 600);
  }
}, [freeChatHook.loadForDeck, freeChatHook.handleSend]);

const closeFreeChat = useCallback(() => {
  if (freeChatHook.isLoading) bridge.cancelRequest();
  setFreeChatTransition('exiting');
  bridgeAction('chat.stateChanged', { open: false });
  setTimeout(() => {
    setActiveView('deckBrowser');
    setFreeChatTransition('idle');
  }, 350);
}, [freeChatHook.isLoading, bridge]);
```

Note: `freeChatHook` is the existing `useFreeChat` instance already in App.jsx. `loadForDeck` is from that hook.

- [ ] **Step 5: Add action registrations**

In the existing `useEffect` for action registration, add:
```javascript
registerAction('chat.open', (data) => openFreeChat(data?.text || ''));
registerAction('chat.close', () => closeFreeChat());
registerAction('deck.study', (data) => bridgeAction('deck.study', data));
registerAction('deck.select', (data) => bridgeAction('deck.select', data));
registerAction('view.navigate', (data) => bridgeAction('view.navigate', data));
```

- [ ] **Step 6: Add keyboard shortcuts for FreeChat**

Add useEffect for FreeChat keyboard shortcuts:
```javascript
useEffect(() => {
  const handler = (e) => {
    if (inputFocused) return;
    if (activeView === 'freeChat') {
      if (e.key === 'Escape' || e.key === ' ') {
        e.preventDefault();
        executeAction('chat.close');
      }
    } else if (activeView === 'deckBrowser') {
      if (e.key === ' ') {
        e.preventDefault();
        executeAction('chat.open');
      }
    }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, [activeView, inputFocused]);
```

- [ ] **Step 7: Add view rendering in JSX**

In App.jsx's render function, add conditional rendering for the new views. When `activeView` is `'deckBrowser'`, `'overview'`, or `'freeChat'`, render the fullscreen MainApp-style layout instead of the sidebar chat layout:

```jsx
// At the top of the render, before existing chat view:
if (activeView === 'deckBrowser' || activeView === 'overview' || activeView === 'freeChat') {
  const isFreeChatAnimatingIn = freeChatTransition === 'entering' || freeChatTransition === 'visible';
  const showFreeChat = activeView === 'freeChat' && freeChatTransition !== 'idle';

  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', flexDirection: 'column',
      background: showFreeChat && isFreeChatAnimatingIn ? 'var(--ds-bg-deep)' : 'var(--ds-bg-canvas)',
      transition: 'background-color 400ms cubic-bezier(0.25, 0.1, 0.25, 1)',
    }}>
      <TopBar
        activeView={activeView}
        ankiState={ankiState}
        messageCount={freeChatHook.messageCount}
        totalDue={deckBrowserData?.totalDue || 0}
        deckName={overviewData?.deckName || ''}
        dueNew={ankiState === 'overview' ? (overviewData?.dueNew || 0) : (deckBrowserData?.totalNew || 0)}
        dueLearning={ankiState === 'overview' ? (overviewData?.dueLearning || 0) : (deckBrowserData?.totalLearn || 0)}
        dueReview={ankiState === 'overview' ? (overviewData?.dueReview || 0) : (deckBrowserData?.totalReview || 0)}
        onTabClick={handleTabClick}
        onSidebarToggle={() => executeAction('settings.toggle')}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {activeView === 'deckBrowser' && <DeckBrowserView data={deckBrowserData} isPremium={isPremium} />}
        {activeView === 'overview' && (
          <OverviewView
            data={overviewData}
            onStudy={() => executeAction('deck.study', { deckId: overviewData?.deckId })}
            onBack={() => executeAction('view.navigate', 'deckBrowser')}
            onOptions={() => bridgeAction('deck.options')}
          />
        )}
        {showFreeChat && (
          /* Port FreeChat JSX from MainApp — the messages area + ChatInput */
          /* See MainApp.jsx lines 281-384 for exact JSX */
        )}
      </div>
    </div>
  );
}
// ... existing chat/agentStudio/plusiMenu rendering continues below
```

The FreeChat JSX (messages, streaming, input) is copied verbatim from MainApp.jsx lines 281-384.

- [ ] **Step 8: Add handleTabClick callback**

```javascript
const handleTabClick = useCallback((tab) => {
  if (tab === 'stapel') {
    if (activeView === 'freeChat') {
      executeAction('chat.close');
    } else {
      executeAction('view.navigate', 'deckBrowser');
    }
  } else if (tab === 'session') {
    executeAction('view.navigate', 'overview');
  } else if (tab === 'statistik') {
    executeAction('stats.open');
  }
}, [activeView]);
```

- [ ] **Step 9: Commit**

---

### Task 2: Update main.jsx — always render App

**Files:**
- Modify: `frontend/src/main.jsx`

- [ ] **Step 1: Remove mode routing**

Replace the mode-based routing with always rendering App:

```javascript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import 'katex/dist/katex.min.css';

if (typeof window !== 'undefined') {
  document.documentElement.setAttribute('data-theme', 'dark');
  if (!window.ankiReceive) {
    window._ankiReceiveQueue = [];
    window.ankiReceive = (payload) => {
      if (!payload || typeof payload !== 'object') return;
      if ((payload.type === 'init' || payload.type === 'themeChanged' || payload.type === 'themeLoaded') && payload.resolvedTheme) {
        document.documentElement.setAttribute('data-theme', payload.resolvedTheme);
      }
      if (window._ankiReceiveQueue) {
        window._ankiReceiveQueue.push(payload);
      }
    };
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 2: Commit**

---

### Task 3: Delete MainApp.jsx

**Files:**
- Delete: `frontend/src/MainApp.jsx`

- [ ] **Step 1: Delete the file**

```bash
rm frontend/src/MainApp.jsx
```

- [ ] **Step 2: Build frontend and verify no import errors**

```bash
cd frontend && npm run build
```

Expected: Build succeeds. No "Cannot find module MainApp" errors.

- [ ] **Step 3: Commit**

---

### Task 4: Add deck/overview handlers to ChatbotWidget

**Files:**
- Modify: `ui/widget.py`

Move MainViewWidget's data gathering and action handlers to ChatbotWidget so it can serve ALL views.

- [ ] **Step 1: Add data gathering methods**

Copy `_get_deck_browser_data()` and `_get_overview_data()` from `ui/main_view.py` into `ui/widget.py` (inside the ChatbotWidget class). These are self-contained methods that only use `mw.col`.

- [ ] **Step 2: Add deck/view action handlers to message handler dict**

In ChatbotWidget's `_get_message_handler()`, add new handlers:

```python
# Deck actions (from MainViewWidget)
'deck.study': self._msg_study_deck,
'deck.select': self._msg_select_deck,
'deck.create': self._msg_create_deck,
'deck.import': self._msg_import_deck,
'deck.options': self._msg_open_deck_options,
# View actions
'view.navigate': self._msg_navigate,
# Deck-level chat (FreeChat)
'chat.load': self._msg_load_deck_messages,
'chat.save': self._msg_save_deck_message,
'chat.clear': self._msg_clear_deck_messages,
'chat.stateChanged': self._msg_freechat_state,
```

- [ ] **Step 3: Implement the handler methods**

Copy the handler implementations from `ui/main_view.py` (they are simple methods that call `mw.col` or `mw.onOverview()` etc.). Adapt `self._send_to_react()` calls to `self._send_to_frontend()` (ChatbotWidget's equivalent).

Key handlers to port:
- `_msg_study_deck(data)` — `mw.col.decks.select(did); mw.onOverview(); mw.overview._linkHandler('study')`
- `_msg_select_deck(data)` — `mw.col.decks.select(did); mw.onOverview()`
- `_msg_navigate(data)` — `mw.moveToState('deckBrowser')` or `mw.onOverview()`
- `_msg_load_deck_messages(data)` — loads from SQLite, sends `chat.messagesLoaded`
- `_msg_save_deck_message(data)` — saves to SQLite
- `_msg_clear_deck_messages(data)` — clears SQLite, sends `chat.messagesCleared`
- `_msg_freechat_state(data)` — tracks FreeChat open/close (for state persistence)

- [ ] **Step 4: Add FreeChat AI request handler**

ChatbotWidget needs to handle FreeChat messages differently from session chat (no card context, no RAG). Add logic in the existing `sendMessage` handler or create a separate path:

```python
def _msg_send_message(self, data):
    caller = data.get('caller', 'session')
    if caller == 'main':
        # FreeChat: use AIRequestManager (simpler, no card context)
        self._handle_freechat_message(data)
    else:
        # Session chat: existing logic with AIRequestThread + RAG
        self.handle_message_from_ui(data.get('message', ''), ...)
```

- [ ] **Step 5: Verify syntax**

```bash
python3 -c "import ast; ast.parse(open('ui/widget.py').read()); print('OK')"
```

- [ ] **Step 6: Commit**

---

### Task 5: Rewrite MainViewWidget as positioning shell

**Files:**
- Modify: `ui/main_view.py`

Strip MainViewWidget down to ONLY positioning logic. It creates ChatbotWidget eagerly, sends state data through ChatbotWidget's webview, and handles resize/position.

- [ ] **Step 1: Rewrite _setup_ui() — use ChatbotWidget, no own WebView**

```python
def _setup_ui(self):
    self.setStyleSheet("background: transparent;")
    layout = QVBoxLayout()
    layout.setContentsMargins(0, 0, 0, 0)
    layout.setSpacing(0)

    try:
        from .widget import ChatbotWidget
    except ImportError:
        from ui.widget import ChatbotWidget

    self._chatbot = ChatbotWidget()
    layout.addWidget(self._chatbot)
    self.setLayout(layout)
    self.hide()
```

- [ ] **Step 2: Rewrite _send_to_react() — delegate to ChatbotWidget**

```python
def _send_to_react(self, payload):
    if self._chatbot and self._chatbot.web_view:
        js = "window.ankiReceive && window.ankiReceive(%s);" % json.dumps(payload)
        self._chatbot.web_view.page().runJavaScript(js)
```

- [ ] **Step 3: Simplify show_for_state() — send state data, position widget**

```python
def show_for_state(self, state):
    if state == 'review':
        self._current_mode = 'sidebar'
        self._squeeze_main_content(True)
        self._show()
        self._send_to_react({
            "type": "app.stateChanged",
            "state": "review",
            "data": {},
        })
        return

    self._current_mode = 'fullscreen'
    self._squeeze_main_content(False)
    self._show()

    if state == 'deckBrowser':
        data = self._get_deck_browser_data()
        self._send_to_react({
            "type": "app.stateChanged",
            "state": "deckBrowser",
            "data": data,
            "freeChatWasOpen": self._freechat_was_open,
        })
    elif state == 'overview':
        data = self._get_overview_data()
        self._send_to_react({
            "type": "app.stateChanged",
            "state": "overview",
            "data": data,
        })
```

Note: `_get_deck_browser_data()` and `_get_overview_data()` stay in MainViewWidget for now (they just gather data, don't handle messages). They can be moved to ChatbotWidget in Task 4 or kept here — either works.

- [ ] **Step 4: Remove all message handling code**

Delete from MainViewWidget:
- `_init_bridge()` — ChatbotWidget handles its own bridge
- `message_timer` — ChatbotWidget has its own
- `_poll_messages()`, `_handle_messages()` — ChatbotWidget handles
- `_route_message()` — no longer needed
- `_init_action_handlers()`, `_init_state_getters()` — no longer needed
- All `_handle_*` methods (study, select, send, cancel, etc.)
- All AI callback methods (`_on_chunk`, `_on_ai_done`, `_on_ai_error`)
- `_build_chat_context()` — unused

Keep:
- `__init__()` (simplified)
- `_setup_ui()` (rewritten)
- `_send_to_react()` (delegates to ChatbotWidget)
- `show_for_state()`, `_send_state_data()` (simplified)
- `_show()`, `_hide()`, `show_sidebar()`, `hide_sidebar()`, `toggle_sidebar()`
- `_position_over_main()`, `_squeeze_main_content()`
- `get_sidebar_widget()` → renamed to `get_chatbot_widget()` returning `self._chatbot`
- `eventFilter()`
- `_get_deck_browser_data()`, `_get_overview_data()` (data gathering)
- Singleton functions (`get_main_view`, `show_main_view`)

- [ ] **Step 5: Update get_sidebar_widget / get_chatbot_widget**

```python
def get_sidebar_widget(self):
    """Return the ChatbotWidget instance."""
    return self._chatbot

# Alias for backward compatibility
get_chatbot_widget = get_sidebar_widget
```

- [ ] **Step 6: Remove _ensure_sidebar() — ChatbotWidget is created eagerly**

Delete `_ensure_sidebar()` entirely. `self._chatbot` is always available after `__init__`.

- [ ] **Step 7: Simplify show_sidebar / hide_sidebar**

These no longer need to toggle between web_views. They just reposition MainViewWidget:

```python
def show_sidebar(self):
    self._current_mode = 'sidebar'
    self._sidebar_visible = True
    self._squeeze_main_content(True)
    self._position_over_main()
    self._visible = True
    self.show()
    self.raise_()
    if self.parent():
        self.parent().installEventFilter(self)

def hide_sidebar(self):
    self._sidebar_visible = False
    self._squeeze_main_content(False)
    if self._current_mode == 'sidebar':
        self._visible = False
        if self.parent():
            self.parent().removeEventFilter(self)
        self.hide()
```

- [ ] **Step 8: Verify syntax**

```bash
python3 -c "import ast; ast.parse(open('ui/main_view.py').read()); print('OK')"
```

- [ ] **Step 9: Commit**

---

### Task 6: Update setup.py and __init__.py references

**Files:**
- Modify: `ui/setup.py`
- Modify: `__init__.py`

- [ ] **Step 1: Update setup.py get_chatbot_widget()**

```python
def get_chatbot_widget():
    mv = _get_main_view()
    return mv.get_chatbot_widget()  # was get_sidebar_widget()
```

- [ ] **Step 2: Verify __init__.py imports still work**

Check that `get_chatbot_widget`, `ensure_chatbot_open`, `close_chatbot_panel` still work. These all delegate through setup.py → MainViewWidget → ChatbotWidget.

- [ ] **Step 3: Commit**

---

### Task 7: Build, test, verify

- [ ] **Step 1: Build frontend**

```bash
cd frontend && npm run build
```

Expected: Build succeeds without errors.

- [ ] **Step 2: Test in Anki — full checklist**

1. Anki starts without errors
2. DeckBrowser shows with deck list
3. Overview screen works
4. Review: custom reviewer left, chat sidebar right
5. Chat: messages send and receive
6. Cmd+I: sidebar toggles
7. State transitions: deckBrowser → overview → review → deckBrowser — no flash
8. FreeChat in DeckBrowser works (Space opens, Escape closes)
9. Agent Studio, Plusi Menu accessible

- [ ] **Step 3: Fix any issues found**

- [ ] **Step 4: Final commit**
