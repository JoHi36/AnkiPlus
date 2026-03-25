# SP2: Unified React Shell — Sidebar + Reviewer Migration

## Problem

After SP1, the app has two separate React roots running in two separate QWebEngineViews:

1. **MainApp** (`MainViewWidget` / `main_view.py`) — fullscreen React shell for DeckBrowser, Overview, FreeChat. Visible in `deckBrowser` and `overview` states. **Hides during review.**
2. **App.jsx** (`ChatbotWidget` / `widget.py`) — QDockWidget sidebar with session chat, Agent Studio, Plusi Menu, Insights, Settings. Visible **only during review.**

This creates a paradox: the sidebar is only needed during review, but MainApp hides during review. Integrating the sidebar into MainApp requires making MainApp permanent across all states, including review. This means the custom reviewer must also move into MainApp.

**SP2 therefore merges the originally planned SP2 (Sidebar) and SP3 (Reviewer) into a single migration.**

## Solution

MainApp becomes the **permanent, always-visible** React shell. It renders all four app states:

```
activeView: 'deckBrowser' | 'overview' | 'freeChat' | 'review'
```

In `review` state, MainApp renders:
- **Left panel**: `<ReviewerView />` — card content as React component
- **Right panel**: `<SessionPanel />` — everything from current App.jsx

`mw.web` stays hidden behind MainApp at all times. Anki still uses it internally for scheduling, but the user never sees it.

## Architecture

### Rendering Stack (After SP2)

```
mw (Anki Main Window)
├── mw.web (hidden, Anki uses internally for scheduling)
│
├── MainViewWidget (PERMANENT — covers entire window in ALL states)
│   └── QWebEngineView (loads web/index.html?mode=main)
│       └── MainApp (React root — the ONE AND ONLY UI)
│           │
│           ├── [deckBrowser state]
│           │   ├── TopBar
│           │   ├── DeckBrowserView
│           │   └── PlusiDock
│           │
│           ├── [overview state]
│           │   ├── TopBar
│           │   └── OverviewView
│           │
│           ├── [freeChat state]
│           │   ├── TopBar
│           │   ├── FreeChatMessages
│           │   └── ChatInput
│           │
│           └── [review state]
│               ├── ReviewerView (LEFT — card content)
│               │   ├── CardContent (front/back HTML rendered in scoped container)
│               │   ├── FlipButton / AnswerInput
│               │   └── MC Options (when generated)
│               │
│               └── SessionPanel (RIGHT — current App.jsx content)
│                   ├── ContextSurface (header)
│                   ├── Chat / AgentStudio / PlusiMenu / InsightsDashboard
│                   ├── ThoughtStream + AgenticCell
│                   └── ChatInput
│
├── QDockWidget — DELETED (no longer exists)
├── ChatbotWidget — DELETED
├── WebBridge — DELETED (Phase 2, after all methods migrated)
```

### State Management

Python `state_will_change` hook sends state + data to React for ALL states:

```
state == 'deckBrowser' → MainViewWidget stays visible
    ankiReceive({type:'app.stateChanged', state:'deckBrowser', data:{deckTree, dues}})

state == 'overview' → MainViewWidget stays visible
    ankiReceive({type:'app.stateChanged', state:'overview', data:{deckName, dues, deckId}})

state == 'review' → MainViewWidget stays visible (NEW — no longer hides)
    ankiReceive({type:'app.stateChanged', state:'review', data:{deckId, deckName}})
```

Card data is sent separately via reviewer hooks:

```
reviewer_did_show_question → ankiReceive({type:'card.shown', data:{
    cardId, frontHtml, backHtml, deckId, deckName, fields, tags,
    stats: {reps, lapses, ivl, ease, knowledgeScore},
    isQuestion: true
}})

reviewer_did_show_answer → ankiReceive({type:'card.answerShown', data:{
    cardId, backHtml, isQuestion: false
}})
```

## Components

### ReviewerView (`frontend/src/components/ReviewerView.jsx`)

Replaces the custom_reviewer HTML/CSS/JS system. Renders card content as React.

**Props:**
- `cardData` — `{cardId, frontHtml, backHtml, deckName, fields, tags, stats}`
- `isAnswerShown` — whether back is visible
- `mcOptions` — multiple choice options (when generated)
- `evaluationResult` — AI evaluation result `{score, feedback}`

**Rendering:**
- Card HTML rendered in a scoped container (content comes from Anki's own card templates — trusted internal data, not user-generated web content)
- Custom reviewer CSS (`custom_reviewer/styles.css`) imported as a stylesheet, scoped to `.reviewer-content`
- Flip animation handled in React (CSS transition)
- Answer input field (text evaluation) rendered as React component

**Actions (via bridgeAction):**
- `card.flip` — show answer
- `card.rate` `{ease}` — rate card (Again/Hard/Good/Easy mapped to Anki ease values)
- `card.requestMC` — request MC option generation
- `card.submitAnswer` `{answer}` — submit text answer for AI evaluation
- `card.advance` — go to next card

**Events received (via ankiReceive):**
- `card.shown` — new card data
- `card.answerShown` — back HTML
- `card.mcGenerated` — MC options from AI
- `card.evaluated` — evaluation result from AI

### SessionPanel (`frontend/src/components/SessionPanel.jsx`)

Extracts the content of App.jsx's `AppInner` into a standalone component. While conceptually a move-not-redesign, this is **significant refactoring work** due to the deeply entangled hook dependencies in AppInner (useChat receives 6 parameters, useDeckTracking receives 12, and the ankiReceive handler routes to 8+ hook refs).

**What moves into SessionPanel:**
- `ContextSurface` (header with pill, session navigation)
- Chat messages area (with SectionDivider, ThoughtStream, AgenticCell)
- `InsightsDashboard` (shown when no messages)
- `AgentStudio`, `PlusiMenu`, `ResearchMenu`, `StandardSubMenu`
- `ChatInput` (fixed bottom of the right panel)
- `ReviewTrailIndicator`
- `TokenBar`
- `PaywallModal`

**Hooks that move into SessionPanel:**
- `useChat` — session chat state
- `useCardContext` — card context tracking
- `useCardSession` — per-card SQLite session
- `useReviewTrail` — review trail navigation
- `useModels` — model management
- `useMascot` — mascot mood state
- `useInsights` — card insights
- `useDeckTracking` — deck state tracking
- `SessionContextProvider` wraps SessionPanel

**Props from MainApp:**
- `cardData` — current card context (from Python via ankiReceive)
- `bridge` — compatibility bridge object (useAnkiCompat)
- `isVisible` — whether the panel is shown (review state)

**Communication:**
SessionPanel receives card data as props from MainApp (which gets it from Python via ankiReceive). No more synchronous `bridge.getCurrentDeck()` calls for card context — the data flows down from the top.

### useAnkiCompat (`frontend/src/hooks/useAnkiCompat.js`)

Compatibility layer that provides the same `bridge` API as `useAnki`, but routes all calls through `bridgeAction` (message queue) instead of QWebChannel.

```javascript
export function useAnkiCompat() {
  const bridge = useRef({
    // AI & Messaging
    sendMessage: (data) => bridgeAction('chat.send', data),
    cancelRequest: () => bridgeAction('chat.cancel'),
    setModel: (model) => bridgeAction('model.set', model),
    generateSectionTitle: (data) => bridgeAction('chat.generateTitle', data),

    // Settings
    getCurrentConfig: () => bridgeAction('config.get'),
    saveSettings: (data) => bridgeAction('config.save', data),
    getTheme: () => bridgeAction('theme.get'),
    saveTheme: (data) => bridgeAction('theme.save', data),
    getAITools: () => bridgeAction('tools.get'),
    saveAITools: (data) => bridgeAction('tools.save', data),
    getResponseStyle: () => bridgeAction('style.get'),
    saveResponseStyle: (data) => bridgeAction('style.save', data),

    // Deck Management
    getCurrentDeck: () => bridgeAction('deck.getCurrent'),
    getAvailableDecks: () => bridgeAction('deck.getAll'),
    getDeckStats: (deckId) => bridgeAction('deck.getStats', deckId),

    // Card Operations
    getCardDetails: (cardId) => bridgeAction('card.getDetails', cardId),
    goToCard: (cardId) => bridgeAction('card.goTo', cardId),
    openPreview: (cardId) => bridgeAction('card.preview', { cardId }),
    advanceCard: () => bridgeAction('card.advance'),
    showAnswer: () => bridgeAction('card.flip'),
    hideAnswer: () => bridgeAction('card.hideAnswer'),

    // Sessions & Storage
    loadCardSession: (cardId) => bridgeAction('session.loadCard', cardId),
    saveCardSession: (data) => bridgeAction('session.saveCard', data),
    saveCardMessage: (data) => bridgeAction('session.saveMessage', data),
    saveCardSection: (data) => bridgeAction('session.saveSection', data),
    loadDeckMessages: (deckId) => bridgeAction('chat.load', deckId),
    saveDeckMessage: (data) => bridgeAction('chat.save', data),

    // Auth
    authenticate: (data) => bridgeAction('auth.authenticate', data),
    getAuthStatus: () => bridgeAction('auth.getStatus'),
    getAuthToken: () => bridgeAction('auth.getToken'),
    refreshAuth: () => bridgeAction('auth.refresh'),
    logout: () => bridgeAction('auth.logout'),

    // Media
    searchImage: (query) => bridgeAction('media.search', query),
    fetchImage: (url) => bridgeAction('media.fetch', url),
    openUrl: (url) => bridgeAction('system.openUrl', url),

    // Models
    fetchModels: () => bridgeAction('model.fetchAll'),

    // Mascot
    saveMascotEnabled: (enabled) => bridgeAction('plusi.setEnabled', enabled),
  }).current;

  return { bridge, isReady: true };
}
```

**Key difference from useAnki:** All calls are async (fire-and-forget via message queue). Hooks that currently rely on synchronous return values from `bridge.method()` need to be refactored to receive responses via ankiReceive callbacks instead.

**Synchronous → Async migration pattern:**
```javascript
// OLD (useAnki + QWebChannel): synchronous return
const config = JSON.parse(bridge.getCurrentConfig());

// NEW (useAnkiCompat + message queue): request + response
bridgeAction('config.get');
// Response arrives via ankiReceive({type: 'config.loaded', data: {...}})
```

This is the primary source of refactoring work in SessionPanel hooks.

## Python Changes

### main_view.py — Expanded

MainViewWidget no longer hides during review. New responsibilities:

**New action handlers (reviewer operations):**

```python
self._action_handlers.update({
    # Card review actions
    'card.flip':          self._handle_flip_card,
    'card.rate':          self._handle_rate_card,
    'card.advance':       self._handle_advance_card,
    'card.requestMC':     self._handle_request_mc,
    'card.submitAnswer':  self._handle_submit_answer,
    'card.hideAnswer':    self._handle_hide_answer,

    # Session storage (migrated from bridge.py)
    'session.loadCard':   self._handle_load_card_session,
    'session.saveCard':   self._handle_save_card_session,
    'session.saveMessage': self._handle_save_card_message,
    'session.saveSection': self._handle_save_card_section,

    # Config (migrated from bridge.py)
    'config.get':         self._handle_get_config,
    'config.save':        self._handle_save_config,
    'theme.get':          self._handle_get_theme,
    'theme.save':         self._handle_save_theme,
    'tools.get':          self._handle_get_tools,
    'tools.save':         self._handle_save_tools,
    'style.get':          self._handle_get_style,
    'style.save':         self._handle_save_style,

    # Auth (migrated from bridge.py)
    'auth.authenticate':  self._handle_authenticate,
    'auth.getStatus':     self._handle_get_auth_status,
    'auth.getToken':      self._handle_get_auth_token,
    'auth.refresh':       self._handle_refresh_auth,
    'auth.logout':        self._handle_logout,

    # Models (migrated from bridge.py)
    'model.set':          self._handle_set_model,
    'model.fetchAll':     self._handle_fetch_models,

    # Media
    'media.search':       self._handle_search_image,
    'media.fetch':        self._handle_fetch_image,
    'system.openUrl':     self._handle_open_url,

    # Plusi
    'plusi.setEnabled':   self._handle_set_mascot_enabled,
})
```

**Card data sending:**
```python
def _send_card_data(self, card, is_question=True):
    """Send card HTML + metadata to React."""
    note = card.note()
    fields = {name: note[name] for name in note.keys()}
    front_html = card.question()
    back_html = card.answer()

    self._send_to_react({
        "type": "card.shown" if is_question else "card.answerShown",
        "data": {
            "cardId": card.id,
            "frontHtml": front_html,
            "backHtml": back_html,
            "deckId": card.did,
            "deckName": mw.col.decks.name(card.did),
            "fields": fields,
            "tags": list(note.tags),
            "isQuestion": is_question,
            "stats": {
                "reps": card.reps,
                "lapses": card.lapses,
                "ivl": card.ivl,
                "ease": card.factor,
            },
        }
    })
```

**Review action handlers (with web.js-execution swallowing):**

Anki's `_showAnswer()` and `_answerCard(ease)` internally call `mw.reviewer.web`'s JS execution method to update `mw.web`'s DOM. Since `mw.web` is hidden and we render in React, these calls must be swallowed — the same pattern already proven in `custom_reviewer/__init__.py` (lines 601-613, 670-680). Note: `web.eval` here is Qt's `QWebEngineView` JS execution API, not Python's built-in — it is safe and necessary.

```python
def _handle_flip_card(self, data=None):
    """Show the answer side. Swallow web JS execution to prevent mw.web DOM writes."""
    rev = mw.reviewer
    if not rev or not rev.web:
        return
    web = rev.web
    _orig = web.eval
    web.eval = lambda js: None  # Swallow all JS executions
    try:
        rev._showAnswer()  # Note: _showAnswer triggers av_player internally for answer audio
    finally:
        web.eval = _orig
    # Restore focus to MainViewWidget's webview (Qt ops during _showAnswer can steal focus)
    QTimer.singleShot(150, lambda: self.web_view.setFocus() if self.web_view else None)
    # Send back HTML to React
    if rev.card:
        self._send_card_data(rev.card, is_question=False)

def _handle_rate_card(self, data):
    """Rate current card. Swallow web JS execution during _answerCard."""
    parsed = json.loads(data) if isinstance(data, str) else data
    ease = int(parsed.get('ease', 2))
    rev = mw.reviewer
    if not rev or not rev.web:
        return
    web = rev.web
    _orig = web.eval
    web.eval = lambda js: None  # Swallow: _answerCard -> nextCard -> _showQuestion -> web.eval
    try:
        rev._answerCard(ease)
    finally:
        web.eval = _orig
    # Restore focus (same pattern as _handle_flip_card)
    QTimer.singleShot(150, lambda: self.web_view.setFocus() if self.web_view else None)
    # After _answerCard, rev.card is now the NEXT card — send it to React
    # Note: Do NOT call _initWeb() — React renders the next card directly
    if rev.card:
        self._send_card_data(rev.card, is_question=True)

def _handle_advance_card(self, data=None):
    """Advance to next card (rate Good by default)."""
    self._handle_rate_card({'ease': 3})
```

**MC generation + AI evaluation:**
The `custom_reviewer/__init__.py` functions (`_generate_mc_async`, `_evaluate_answer_async`) are migrated to send results to MainApp via `_send_to_react` instead of `mw.reviewer.web.eval`. The actual AI logic stays the same.

```python
def _handle_request_mc(self, data):
    """Generate MC options for current card."""
    deck_answers = _get_deck_context_answers_sync()
    import threading
    threading.Thread(
        target=self._generate_mc_async,
        args=(data, deck_answers),
        daemon=True,
    ).start()

def _generate_mc_async(self, data, deck_answers):
    # Same logic as custom_reviewer._generate_mc_async
    # but sends result via _send_to_react instead of mw.reviewer.web.eval
    ...
    self._send_to_react({"type": "card.mcGenerated", "data": result})
```

### show_for_state — No longer hides

```python
def show_for_state(self, state):
    """Show widget and send state data — ALL states, including review."""
    self._show()  # Always show, never hide

    if state == 'review':
        self._send_to_react({
            "type": "app.stateChanged",
            "state": "review",
            "data": {"deckId": mw.col.decks.get_current_id(),
                     "deckName": mw.col.decks.name(mw.col.decks.get_current_id())},
        })
        # Card data sent separately via reviewer hooks
    elif state == 'deckBrowser':
        data = self._get_deck_browser_data()
        self._send_to_react({...})  # existing logic
    elif state == 'overview':
        data = self._get_overview_data()
        self._send_to_react({...})  # existing logic
```

### __init__.py — Hook changes

```python
# OLD: reviewer hooks send to ChatbotWidget
gui_hooks.reviewer_did_show_question.append(on_card_shown)
# on_card_shown -> card_tracker.send_card_context -> ChatbotWidget.web_view

# NEW: reviewer hooks send to MainViewWidget
def on_card_shown(card):
    main_view = get_main_view()
    main_view._send_card_data(card, is_question=True)

def on_answer_shown(card):
    main_view = get_main_view()
    main_view._send_card_data(card, is_question=False)

gui_hooks.reviewer_did_show_question.append(on_card_shown)
gui_hooks.reviewer_did_show_answer.append(on_answer_shown)
```

**webview_will_set_content hook:**
- Remove the custom_reviewer HTML injection — React renders cards now
- Keep the hook only if Anki internals require `mw.web` to have valid HTML
- If Anki's scheduler needs `mw.web` to contain the card for `_answerCard()` to work, we may need to let the default content render into `mw.web` (hidden) while React shows the pretty version. Investigation needed during implementation.

### setup.py — Simplified

```python
# REMOVE: _create_chatbot_dock(), QDockWidget, ChatbotWidget
# REMOVE: on_state_did_change (dock show/hide logic)
# KEEP: setup_menu(), setup_toolbar_button() (both now route to MainViewWidget)

def ensure_chatbot_open():
    """Open the session panel in MainApp."""
    show_main_view(mw.state)
    main_view = get_main_view()
    main_view._send_to_react({"type": "sidebar.open"})

def toggle_chatbot_panel():
    main_view = get_main_view()
    main_view._send_to_react({"type": "sidebar.toggle"})
```

### card_tracker.py — Simplified

CardTracker no longer needs a reference to ChatbotWidget. It sends card context to MainViewWidget.

```python
# OLD: CardTracker(widget) where widget = ChatbotWidget
# NEW: CardTracker sends to MainViewWidget singleton

def send_card_context(self, card, is_question=True):
    main_view = get_main_view()
    main_view._send_card_data(card, is_question)
```

Or, simpler: remove CardTracker entirely and use the reviewer hooks directly in `__init__.py`.

## Sidebar Panel Behavior

The session panel (right side) in review state:

- **Width**: 450px default, resizable via JS drag handle (min 350, max 800)
- **Slide-in**: CSS `transform: translateX(100%)` to `translateX(0)`, 300ms ease
- **Toggle**: Cmd+I or toolbar button
- **Auto-open**: Opens automatically when entering review state
- **Auto-close**: Closes when leaving review state
- **Width persistence**: Saved to localStorage

```css
.session-panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: var(--sidebar-width, 450px);
  background: var(--ds-bg-deep);
  border-left: 1px solid var(--ds-border-subtle);
  transform: translateX(0);
  transition: transform 300ms cubic-bezier(0.25, 0.1, 0.25, 1);
}

.session-panel.hidden {
  transform: translateX(100%);
}
```

## Bridge Migration Strategy

### Phase 1 (This SP): Compatibility Layer

1. Create `useAnkiCompat` hook — same API as `useAnki`, routes through `bridgeAction`
2. All SessionPanel hooks use `useAnkiCompat` instead of `useAnki`
3. Synchronous bridge calls refactored to async request/response pattern
4. All 50+ bridge method implementations move from `bridge.py` to `main_view.py` action handlers
5. `widget.py` (ChatbotWidget) and QWebChannel removed

### Phase 2 (Cleanup): Remove Compatibility Layer

1. Replace `useAnkiCompat` calls with direct `bridgeAction` + event listeners
2. Delete `useAnkiCompat.js`, `useAnki.js`
3. Delete `bridge.py`
4. All communication uses Action Registry + Event Bus exclusively

### Synchronous to Async Migration

`useAnki.js` already uses the message queue (not QWebChannel). The "synchronous" methods fire an async request AND return a cached/fallback value. This is important — the migration is less disruptive than it appears.

**Already fully async** (fire-and-forget, response via ankiReceive — no changes needed):
- `loadCardSession(cardId)` — fires request, response arrives as `cardSessionLoaded`
- `fetchModels()` — fires request, response arrives as `modelsLoaded`
- `getAuthToken()` — fires request, response arrives as `authTokenLoaded`
- `sendMessage()`, `cancelRequest()`, `setModel()` — fire-and-forget

**Cache-fallback pattern** (fire request + return stale cache — needs minor refactoring):
- `getCurrentConfig()` — returns `window._cachedConfig` or empty fallback
- `getAuthStatus()` — returns hardcoded fallback, actual status arrives via ankiReceive
- `getCurrentDeck()` — returns cached deck info

For the cache-fallback methods, `useAnkiCompat` keeps the same pattern: fire the request on mount, cache the response when it arrives via ankiReceive, return the cached value on subsequent calls. This means most hooks need **zero refactoring** — they already handle the async flow.

**The real migration work** is routing the ankiReceive responses. Currently `App.jsx`'s monolithic ankiReceive handler (hundreds of lines) routes responses to hook refs. In SessionPanel, the same handler structure is needed — it receives payloads from MainApp's ankiReceive and routes to its own hooks.

### Session Chat vs Free Chat Routing

`chat.send` needs different handling depending on context:

```python
def _handle_send_message(self, data):
    msg_data = json.loads(data) if isinstance(data, str) else data
    caller = msg_data.get('caller', 'main')  # 'main' (free chat) or 'session'

    if caller == 'session':
        # Session chat: use card context, card history, full RAG pipeline
        card_context = self._get_current_card_context()
        history = self._load_card_history(card_context.get('cardId'))
    else:
        # Free chat: no card context, deck-level history
        card_context = None
        history = self._load_deck_history(0)

    # Rest of AI request handling is the same
    ...
```

React-side: `useFreeChat` sends `{caller: 'main'}`, `useChat` sends `{caller: 'session'}`. Both use the same `bridgeAction('chat.send', data)` — Python disambiguates.

## Preview Mode

The preview system (`custom_reviewer/__init__.py`: `open_preview`, `close_preview`) currently injects cards into `mw.reviewer` and notifies `ChatbotWidget`. After migration:

1. `open_preview(card_id)` sends card data to React via `ankiReceive`
2. React renders the previewed card in ReviewerView
3. `close_preview()` sends the original card back
4. No more `_notify_frontend_preview` to ChatbotWidget — MainApp handles it

## Custom Reviewer CSS

The `custom_reviewer/styles.css` is currently injected into `mw.web`. After migration:

- Import as a scoped stylesheet in ReviewerView
- Wrap card content in `.reviewer-content` container
- All custom reviewer CSS selectors scoped under `.reviewer-content`
- MathJax / KaTeX rendering handled by React (already available via react-markdown)
- Image rendering: card images referenced via Anki's media folder path

## Files

### Create

| File | Purpose |
|------|---------|
| `frontend/src/components/ReviewerView.jsx` | Card display as React component |
| `frontend/src/components/SessionPanel.jsx` | App.jsx content extracted as component |
| `frontend/src/hooks/useAnkiCompat.js` | Bridge compatibility layer over bridgeAction |

### Modify

| File | Change |
|------|--------|
| `frontend/src/MainApp.jsx` | Add review state, ReviewerView + SessionPanel layout |
| `frontend/src/main.jsx` | Remove App.jsx rendering (only MainApp) |
| `ui/main_view.py` | Permanent visibility, all action handlers, card data sending |
| `__init__.py` | Reviewer hooks to MainViewWidget, remove custom_screens hooks |
| `ui/setup.py` | Remove QDockWidget, simplify to MainViewWidget only |
| `frontend/src/actions.js` | Add reviewer action registrations |
| `custom_reviewer/__init__.py` | Route MC/evaluation results to MainViewWidget |
| `utils/card_tracker.py` | Route to MainViewWidget (or remove entirely) |

### Delete

| File | Reason |
|------|--------|
| `ui/widget.py` | Replaced by MainViewWidget |
| `ui/bridge.py` | Phase 2 — after all methods migrated to action handlers |
| `frontend/src/App.jsx` | Content moved to SessionPanel.jsx |
| `frontend/src/hooks/useAnki.js` | Replaced by useAnkiCompat.js |

## Edge Cases

### mw.web and Anki's Scheduler (RESOLVED)

**Strategy: Let Anki render into mw.web (hidden), swallow web.eval on our calls.**

Anki's scheduler requires `mw.web` to have valid card HTML. The `_answerCard()` and `_showAnswer()` methods internally call `web.eval()` to update `mw.web`'s DOM. Our approach:

1. **Do NOT intercept** `webview_will_set_content` for reviewer context — let Anki render its default HTML into `mw.web` normally. This keeps the scheduler happy.
2. **Swallow `web.eval`** when WE trigger `_showAnswer()` or `_answerCard()` via our action handlers (see review action handlers above). This prevents Anki from writing JS to `mw.web` when we're driving the interaction.
3. **mw.web stays hidden** behind MainViewWidget. The user never sees it, but Anki's internals use it.
4. When Anki itself triggers card changes (e.g., timer-based card transition), the `reviewer_did_show_question` hook fires and sends the new card data to React.

This is the exact same pattern already proven in `custom_reviewer/__init__.py` (lines 601-613 for `_showAnswer`, lines 670-680 for `_answerCard`).

### Audio Playback

Cards with `[sound:filename.mp3]` tags trigger Anki's `av_player`, which is wired into `mw.web`'s reviewer HTML via pycmd calls. Since `mw.web` renders normally (hidden), audio playback continues to work through Anki's native system. The key: we do NOT suppress `webview_will_set_content` for the reviewer — Anki's full reviewer HTML (including audio triggers) loads into `mw.web`. React only provides the visual layer.

**Important:** `_showAnswer()` and `_answerCard()` already trigger `av_player` internally for card audio. Do NOT add explicit `av_player.play_tags()` calls in `_send_card_data` — this would cause double playback. If audio does not work because `mw.web` is hidden, add explicit playback ONLY for question audio on new cards (since `_answerCard` handles the transition audio already):

```python
def _send_card_data(self, card, is_question=True):
    # ... send data to React ...

    # Only trigger audio for question side if Anki's internal trigger didn't fire
    # (answer audio is handled by _showAnswer/_answerCard)
    if is_question and mw.reviewer:
        try:
            sounds = card.question_av_tags()
            if sounds:
                from anki.sound import av_player
                av_player.play_tags(sounds)
        except Exception:
            pass
```

### Card Media (Images)

Card HTML references images via `src="filename.jpg"` which resolves to Anki's media folder. In React's QWebEngineView, these paths need the same base URL. Since MainViewWidget loads from `web/index.html` (local file), relative media paths won't resolve. Solution: rewrite image `src` attributes to absolute paths (`file:///path/to/collection.media/filename.jpg`) before sending to React.

```python
import re
media_dir = mw.col.media.dir()
front_html = re.sub(r'src="([^":/]+)"', f'src="file://{media_dir}/\\1"', front_html)
```

### MathJax Rendering

Card HTML may contain MathJax delimiters. The custom_reviewer currently relies on Anki's MathJax injection. In React, use the existing KaTeX integration (already available via react-markdown). May need a MathJax to KaTeX conversion step, or include MathJax as a script in the webview.

### Keyboard Shortcut Routing

`Cmd+I` currently routes through `GlobalShortcutFilter` (`ui/shortcut_filter.py`) to `ensure_chatbot_open()`. After migration:

- `shortcut_filter.py`: `Cmd+I` calls `show_main_view(mw.state)` + sends `sidebar.toggle` to React
- `shortcut_filter.py`: `set_main_view_active(True)` is always true (MainApp is always visible)
- Review-mode shortcuts (Space for flip, 1-4 for rate) are handled in React's ReviewerView keydown listener, NOT in GlobalShortcutFilter

### Preview Mode

The preview system (`custom_reviewer/__init__.py`: `open_preview`, `close_preview`) currently injects cards into `mw.reviewer` and notifies `ChatbotWidget` via `_notify_frontend_preview`. After migration:

1. `open_preview(card_id)` — loads card, sends data to MainApp via `_send_to_react`
2. React sets `previewMode` state, ReviewerView shows the preview card
3. `close_preview()` — restores original card, sends via `_send_to_react`
4. `_notify_frontend_preview` rewritten to use `get_main_view()._send_to_react()` instead of `_chatbot_widget.web_view`

### Subagent Registry

Currently pushed from Python to App.jsx via ankiReceive. After migration, the same payload goes to MainApp, which passes it down to SessionPanel.

### Settings Sidebar

Currently rendered via `App.jsx` with `?view=sidebar`. After migration, `SettingsSidebar` is available in all states — imported directly in MainApp. The `settings.toggle` action shows/hides it as an overlay panel. No separate URL param needed.

### AIRequestThread Migration

`widget.py` contains `AIRequestThread` (QThread with streaming signals). This is already superseded by `ai/request_manager.py`'s `AIRequestManager` which `main_view.py` already uses for FreeChat. SessionPanel's chat uses the same `AIRequestManager` — no QThread migration needed. The `SubagentThread` class is also handled by `request_manager.py`.

### SessionPanel ankiReceive Handler

The monolithic `ankiReceive` handler in `App.jsx` (~200 lines) routes payloads to 8+ hook refs. In SessionPanel, this becomes a dedicated handler that MainApp's `ankiReceive` delegates to when in review state:

```javascript
// MainApp.jsx ankiReceive handler
if (activeViewRef.current === 'review' && sessionPanelRef.current) {
  sessionPanelRef.current.handleAnkiReceive(payload);
}
```

SessionPanel exposes `handleAnkiReceive` via `useImperativeHandle` or a forwarded ref.

## Out of Scope

- Bridge cleanup (Phase 2) — useAnkiCompat stays as compatibility layer
- Light mode testing — dark mode only for now
- Plugin system / third-party agents
- Event Store (persistent event log) — SP4
- Plusi dock in DeckBrowser view — already works from SP1
