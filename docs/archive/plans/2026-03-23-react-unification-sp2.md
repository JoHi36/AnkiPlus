# SP2: Unified React Shell — Sidebar + Reviewer Migration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the QDockWidget sidebar (App.jsx) and custom reviewer into MainApp as a single permanent React shell across all Anki states.

**Architecture:** MainApp becomes permanent (never hides). Review state renders ReviewerView (left, card content) + SessionPanel (right, extracted from App.jsx). Bridge communication migrates from message-queue-with-cache-fallback to pure message queue via useAnkiCompat compatibility layer.

**Tech Stack:** React 18, Python/PyQt6, Vite, Tailwind CSS, SQLite

**Spec:** `docs/superpowers/specs/2026-03-23-react-unification-sp2-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `frontend/src/components/ReviewerView.jsx` | Card front/back rendering, flip, rate buttons, MC options |
| `frontend/src/components/SessionPanel.jsx` | Extracted App.jsx content: chat, Agent Studio, Plusi, Insights |
| `frontend/src/hooks/useAnkiCompat.js` | Bridge compat layer: same API as useAnki, routes via bridgeAction |
| `frontend/src/styles/reviewer.css` | Scoped custom reviewer styles for card content |

### Major Modifications

| File | Change |
|------|--------|
| `frontend/src/MainApp.jsx` | Add review state, render ReviewerView + SessionPanel, route ankiReceive |
| `ui/main_view.py` | Permanent visibility, card action handlers, all bridge method migrations |
| `__init__.py` | Reviewer hooks to MainViewWidget, remove old hook registrations |
| `ui/setup.py` | Remove QDockWidget, simplify state change handler |
| `frontend/src/main.jsx` | Remove App.jsx branch, only render MainApp |
| `custom_reviewer/__init__.py` | Route notifications to MainViewWidget |

### Files to Delete (Final Task)

| File | Reason |
|------|--------|
| `ui/widget.py` | Replaced by MainViewWidget |
| `frontend/src/App.jsx` | Content moved to SessionPanel.jsx |
| `frontend/src/hooks/useAnki.js` | Replaced by useAnkiCompat.js |

---

## Task 1: Make MainViewWidget Permanent

**Files:**
- Modify: `ui/main_view.py` - `show_for_state()` method
- Modify: `__init__.py` - state change hooks
- Modify: `frontend/src/MainApp.jsx` - handle review state

- [ ] **Step 1: Modify show_for_state to stop hiding on review**

In `ui/main_view.py`, change `show_for_state` to remove the early return for review state. Instead, call `self._show()` and send review data to React:

```python
def show_for_state(self, state):
    self._show()  # Always show
    if state == 'review':
        self._send_to_react({
            "type": "app.stateChanged",
            "state": "review",
            "data": {
                "deckId": mw.col.decks.get_current_id(),
                "deckName": mw.col.decks.name(mw.col.decks.get_current_id()),
            },
        })
    elif state == 'deckBrowser':
        # existing logic unchanged
    elif state == 'overview':
        # existing logic unchanged
```

- [ ] **Step 2: Update __init__.py to call show_main_view for review state**

Ensure `show_main_view(state)` is called for ALL states including review.

- [ ] **Step 3: Handle review state in MainApp.jsx ankiReceive**

Add review state handling and a placeholder view:

```javascript
const [reviewData, setReviewData] = useState(null);

// In ankiReceive handler, add:
} else if (state === 'review') {
  setAnkiState('review');
  setActiveView('review');
  setReviewData(data);
}

// In render, add placeholder:
{activeView === 'review' && (
  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--ds-text-muted)' }}>
    Review State placeholder
  </div>
)}
```

- [ ] **Step 4: Build and verify**

Run: `cd frontend && npm run build`

Restart Anki. Verify MainApp stays visible when entering review.

- [ ] **Step 5: Commit**

```
git add ui/main_view.py __init__.py frontend/src/MainApp.jsx
git commit -m "feat(sp2): make MainViewWidget permanent across all states"
```

---

## Task 2: Create useAnkiCompat Hook

**Files:**
- Create: `frontend/src/hooks/useAnkiCompat.js`

- [ ] **Step 1: Create compatibility hook**

Create `frontend/src/hooks/useAnkiCompat.js` — provides the same bridge API as useAnki but routes all calls through bridgeAction. Uses cache-fallback pattern for methods that currently return synchronous values (getCurrentConfig, getAuthStatus, getCurrentDeck).

Key methods:
- AI: sendMessage, cancelRequest, setModel, generateSectionTitle
- Config: getCurrentConfig (cache-fallback), saveSettings, getTheme, saveTheme, getAITools, saveAITools
- Deck: getCurrentDeck (cache-fallback), getAvailableDecks, getDeckStats
- Card: getCardDetails, goToCard, openPreview, advanceCard, showAnswer
- Session: loadCardSession, saveCardSession, saveCardMessage, saveCardSection, loadDeckMessages, saveDeckMessage
- Auth: authenticate, getAuthStatus (cache-fallback), getAuthToken, refreshAuth, logout, startLinkAuth
- Media: searchImage, fetchImage, openUrl
- Models: fetchModels
- Mascot: saveMascotEnabled

Returns `{ bridge, isReady: true }`.

- [ ] **Step 2: Build to verify**

Run: `cd frontend && npm run build`

- [ ] **Step 3: Commit**

```
git add frontend/src/hooks/useAnkiCompat.js
git commit -m "feat(sp2): create useAnkiCompat bridge compatibility layer"
```

---

## Task 3: Create ReviewerView Component

**Files:**
- Create: `frontend/src/components/ReviewerView.jsx`

- [ ] **Step 1: Create ReviewerView**

Create `frontend/src/components/ReviewerView.jsx` as a `forwardRef` component.

Props: `cardData`, `onInputFocus`, `onInputBlur`

State: `isAnswerShown`, `mcOptions`, `evaluationResult` — all reset when `cardData.cardId` changes.

Renders:
- Card front HTML in scoped `.reviewer-content` container (content is from Anki card templates, trusted internal data)
- Separator + back HTML when answer is shown
- Bottom action bar: "Antwort zeigen" button, or 4 rate buttons (Nochmal/Schwer/Gut/Leicht)
- All colors use `var(--ds-*)` tokens

Exposes `handleEvent(payload)` via `useImperativeHandle` for card.mcGenerated, card.evaluated, card.answerShown events.

Actions: `bridgeAction('card.flip')`, `bridgeAction('card.rate', {ease})`

- [ ] **Step 2: Build to verify**

Run: `cd frontend && npm run build`

- [ ] **Step 3: Commit**

```
git add frontend/src/components/ReviewerView.jsx
git commit -m "feat(sp2): create ReviewerView component"
```

---

## Task 4: Add Card Action Handlers to main_view.py

**Files:**
- Modify: `ui/main_view.py` - add `_send_card_data`, card action handlers
- Modify: `__init__.py` - register reviewer hooks

- [ ] **Step 1: Add _send_card_data method**

Sends card HTML + metadata to React. Rewrites media `src` attributes to absolute file:// paths using `mw.col.media.dir()`.

- [ ] **Step 2: Add card action handlers with web.eval swallowing**

Add `card.flip`, `card.rate`, `card.advance` to `_action_handlers`.

Each handler:
1. Gets `mw.reviewer` and `web`
2. Saves `_orig = web.eval`
3. Sets `web.eval = lambda js: None` (swallow)
4. Calls `rev._showAnswer()` or `rev._answerCard(ease)` in try/finally
5. Restores `web.eval = _orig`
6. Calls `QTimer.singleShot(150, ...)` for focus restoration
7. Sends card data to React via `_send_card_data`

- [ ] **Step 3: Register reviewer hooks in __init__.py**

Add `gui_hooks.reviewer_did_show_question` and `gui_hooks.reviewer_did_show_answer` handlers that call `get_main_view()._send_card_data(card, is_question)`.

- [ ] **Step 4: Build and verify**

Run: `cd frontend && npm run build`

Restart Anki. Enter review. Check console for card.shown events.

- [ ] **Step 5: Commit**

```
git add ui/main_view.py __init__.py
git commit -m "feat(sp2): add card action handlers with web.eval swallowing"
```

---

## Task 5: Wire ReviewerView into MainApp

**Files:**
- Modify: `frontend/src/MainApp.jsx` - import ReviewerView, handle card events, render

- [ ] **Step 1: Add card state and event routing**

Add `cardData` state and `reviewerRef`. Route `card.shown`, `card.answerShown`, `card.mcGenerated`, `card.evaluated` events in ankiReceive handler.

- [ ] **Step 2: Replace review placeholder with ReviewerView + sidebar placeholder**

```jsx
{activeView === 'review' && (
  <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
    <ReviewerView ref={reviewerRef} cardData={cardData} ... />
    <div style={{ width: 450, background: 'var(--ds-bg-deep)', ... }}>
      SessionPanel placeholder
    </div>
  </div>
)}
```

- [ ] **Step 3: Add review keyboard shortcuts**

Space for flip, 1-4 for rate (only when `activeView === 'review'` and not inputFocused).

- [ ] **Step 4: Build and test**

Run: `cd frontend && npm run build`

Restart Anki. Test card flipping, rating, keyboard shortcuts.

- [ ] **Step 5: Commit**

```
git add frontend/src/MainApp.jsx
git commit -m "feat(sp2): wire ReviewerView into MainApp review state"
```

---

## Task 6: Migrate Bridge Methods to main_view.py

**Files:**
- Modify: `ui/main_view.py` - add all remaining action handlers

- [ ] **Step 1: Add session storage handlers**

Port from `bridge.py`: `session.loadCard`, `session.saveCard`, `session.saveMessage`, `session.saveSection`. Each sends response via `_send_to_react`.

- [ ] **Step 2: Add config/theme/auth handlers**

Port from `bridge.py`: `config.get`, `config.save`, `theme.get`, `theme.save`, `tools.get`, `tools.save`, `style.get`, `style.save`, `auth.getStatus`, `auth.getToken`, `auth.authenticate`, `auth.refresh`, `auth.logout`, `auth.startLink`, `auth.handleDeepLink`.

Pattern: read implementation from bridge.py, send responses via `_send_to_react`.

- [ ] **Step 3: Add model/media/system handlers**

Port: `model.set`, `model.fetchAll`, `media.search`, `media.fetch`, `system.openUrl`, `system.openPrefs`, `plusi.setEnabled`, `embedding.getStatus`, `mc.save`, `mc.load`, `mc.has`.

- [ ] **Step 4: Update chat.send for session vs free chat**

Add `caller` field discrimination: `'session'` uses card context + card history, `'main'` uses deck-level history.

- [ ] **Step 5: Commit**

```
git add ui/main_view.py
git commit -m "feat(sp2): migrate all bridge methods to main_view.py action handlers"
```

---

## Task 7: Extract SessionPanel from App.jsx

**Files:**
- Create: `frontend/src/components/SessionPanel.jsx`
- Reference: `frontend/src/App.jsx`

- [ ] **Step 1: Create SessionPanel.jsx**

Copy `AppInner` from `App.jsx` into `SessionPanel.jsx` as a `forwardRef` component. Key changes:
1. Replace `useAnki()` with `useAnkiCompat()`
2. Accept `cardData`, `onClose`, `isVisible` as props
3. Expose `handleAnkiReceive(payload)` via `useImperativeHandle`
4. Move `SessionContextProvider` wrapper to MainApp
5. Remove `?view=sidebar` routing
6. Fix all relative import paths (`../` -> `../../` etc.)

- [ ] **Step 2: Fix imports and build**

Run: `cd frontend && npm run build 2>&1 | head -50`

Fix any import errors iteratively.

- [ ] **Step 3: Commit**

```
git add frontend/src/components/SessionPanel.jsx
git commit -m "feat(sp2): extract SessionPanel from App.jsx"
```

---

## Task 8: Integrate SessionPanel into MainApp

**Files:**
- Modify: `frontend/src/MainApp.jsx` - import SessionPanel, replace placeholder

- [ ] **Step 1: Import and render SessionPanel in review state**

Replace the sidebar placeholder with SessionPanel wrapped in SessionContextProvider. Add `sessionPanelRef` for ankiReceive delegation.

- [ ] **Step 2: Delegate ankiReceive to SessionPanel**

In MainApp's ankiReceive handler, forward review-related payloads to `sessionPanelRef.current.handleAnkiReceive(payload)`.

- [ ] **Step 3: Build and full test**

Run: `cd frontend && npm run build`

Restart Anki. Full test: DeckBrowser -> Overview -> Review with card + chat sidebar -> flip/rate -> chat about card -> back to DeckBrowser.

- [ ] **Step 4: Commit**

```
git add frontend/src/MainApp.jsx
git commit -m "feat(sp2): integrate SessionPanel into MainApp review state"
```

---

## Task 9: Rewire Python Hooks and Simplify setup.py

**Files:**
- Modify: `ui/setup.py` - remove QDockWidget
- Modify: `__init__.py` - clean up hook registration
- Modify: `custom_reviewer/__init__.py` - route to MainViewWidget
- Modify: `ui/shortcut_filter.py` - update Cmd+I routing

- [ ] **Step 1: Remove QDockWidget from setup.py**

Remove `_create_chatbot_dock`, `_chatbot_dock`, `_chatbot_widget` globals. Rewrite `ensure_chatbot_open` and `toggle_chatbot_panel` to send sidebar.open/sidebar.toggle to React. Simplify `on_state_did_change` to just call `show_main_view(new_state)`.

- [ ] **Step 2: Update custom_reviewer notifications**

Rewrite `_notify_frontend_preview` to use `get_main_view()._send_to_react()`. Update any other `_chatbot_widget` references.

- [ ] **Step 3: Update shortcut filter for Cmd+I**

Route Cmd+I to `toggle_chatbot_panel()` which now sends `sidebar.toggle` to React.

- [ ] **Step 4: Build and test**

Restart Anki. Verify no QDockWidget, sidebar in MainApp, Cmd+I toggles.

- [ ] **Step 5: Commit**

```
git add ui/setup.py __init__.py custom_reviewer/__init__.py ui/shortcut_filter.py
git commit -m "feat(sp2): remove QDockWidget, rewire hooks to MainViewWidget"
```

---

## Task 10: Cleanup Old Files

**Files:**
- Modify: `frontend/src/main.jsx` - only render MainApp
- Delete: `ui/widget.py`, `frontend/src/App.jsx`, `frontend/src/hooks/useAnki.js`

- [ ] **Step 1: Simplify main.jsx**

Remove the `mode` param check and App import. Always render MainApp.

- [ ] **Step 2: Delete old files**

```bash
rm ui/widget.py frontend/src/App.jsx frontend/src/hooks/useAnki.js
```

- [ ] **Step 3: Fix remaining references**

Search for and update any imports still referencing deleted files.

- [ ] **Step 4: Full integration test**

Build, restart Anki, test complete flow: DeckBrowser -> FreeChat -> Overview -> Review -> Chat -> DeckBrowser.

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "feat(sp2): cleanup — remove widget.py, App.jsx, useAnki.js"
```

---

## Task 11: Custom Reviewer CSS + Media

**Files:**
- Create: `frontend/src/styles/reviewer.css`
- Modify: `frontend/src/components/ReviewerView.jsx` - import CSS

- [ ] **Step 1: Create scoped reviewer CSS**

Read `custom_reviewer/styles.css` and create `frontend/src/styles/reviewer.css` with all selectors scoped under `.reviewer-content`.

- [ ] **Step 2: Import in ReviewerView and verify styling**

```jsx
import '../styles/reviewer.css';
```

Build and test card rendering with proper fonts, images, spacing.

- [ ] **Step 3: Commit**

```
git add frontend/src/styles/reviewer.css frontend/src/components/ReviewerView.jsx
git commit -m "feat(sp2): add scoped reviewer CSS"
```
