# Card Preview Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Universal two-stage card preview (Peek + Card Chat) that works from any Anki state without breaking the current learning flow.

**Architecture:** State layer on top of existing Custom Reviewer. A `_preview_state` dict tracks preview context. Cards are injected into the reviewer via `rev.card = card; rev._initWeb()` (same pattern as existing navigate handler). Frontend receives `previewMode` events and manages chat switching with fade transitions.

**Tech Stack:** Python/PyQt6 (backend state + bridge), Custom Reviewer HTML/CSS/JS (card rendering), React (frontend chat switching)

**Spec:** `docs/superpowers/specs/2026-03-19-card-preview-mode-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `custom_reviewer/__init__.py` | Modify | Preview state management, card injection, pycmd routing, HTML rendering with `data-state="preview"` |
| `custom_reviewer/interactions.js` | Modify | New `S.PREVIEW` state constant, keyboard handling (Space=close, Enter=toggle_chat), `setPreviewMode()` function |
| `custom_reviewer/template.html` | Modify | Preview action bar markup (placeholder for dynamic preview buttons) |
| `bridge.py` | Modify | New `openPreview(card_id)` bridge method |
| `__init__.py` | Modify | Guard `on_state_will_change` against preview transitions |
| `widget.py` | Modify | Handle `openPreview` message in `_handle_js_message()` |
| `card_sessions_storage.py` | Modify | Add `type` column to `review_sections` table |
| `frontend/src/hooks/useAnki.js` | Modify | Add `openPreview` bridge wrapper |
| `frontend/src/App.jsx` | Modify | Handle `previewMode` event, manage preview state + chat switching |
| `frontend/src/components/CardRefChip.jsx` | Modify | Change click handler from `goToCard` to `openPreview` |

---

## Task 1: Add `S.PREVIEW` State to interactions.js

**Files:**
- Modify: `custom_reviewer/interactions.js:15-24` (state constants)
- Modify: `custom_reviewer/interactions.js:90-187` (`setState` function)
- Modify: `custom_reviewer/interactions.js:832-887` (`onKeydown` handler)

- [ ] **Step 1: Add `S.PREVIEW` state constant**

In `custom_reviewer/interactions.js` at line 23 (after `HISTORY: 'history'`), add:

```javascript
PREVIEW:    'preview',
```

- [ ] **Step 2: Add preview case to `setState` function**

In `custom_reviewer/interactions.js` inside `setState()` (after the HISTORY case around line 172-185), add a new case:

```javascript
case S.PREVIEW:
    // Answer visible, no rating buttons
    answerEl.style.display = '';
    if (dockActions) {
        dockActions.innerHTML = `
            <div class="flex items-center justify-between w-full px-6 py-3">
                <button onclick="pycmd('preview:toggle_chat')" class="flex items-center gap-2 text-white/60 hover:text-white transition-colors">
                    <span>Chat öffnen</span>
                    <span class="text-xs text-white/30">ENTER</span>
                </button>
                <button onclick="pycmd('preview:close')" class="flex items-center gap-2 text-white/60 hover:text-white transition-colors">
                    <span>Schließen</span>
                    <span class="text-xs text-white/30">SPACE</span>
                </button>
            </div>
        `;
    }
    // Hide session progress
    const progressEl = document.querySelector('.session-progress');
    if (progressEl) progressEl.style.display = 'none';
    // Hide navigation arrows
    const navArrows = document.querySelectorAll('.nav-arrow');
    navArrows.forEach(el => el.style.display = 'none');
    break;
```

- [ ] **Step 3: Add `setPreviewMode` global function**

After the `setHistoryMode` function (line 719), add:

```javascript
window.setPreviewMode = function() {
    setState(S.PREVIEW);
};

window.updatePreviewChatLabel = function(isOpen) {
    const btn = document.querySelector('#dock-actions button:first-child span:first-child');
    if (btn) btn.textContent = isOpen ? 'Chat schließen' : 'Chat öffnen';
};
```

- [ ] **Step 4: Add preview keyboard handling to `onKeydown`**

In `custom_reviewer/interactions.js` inside `onKeydown` (line 852), add BEFORE the existing state checks:

```javascript
if (current === S.PREVIEW) {
    if (e.code === 'Space') { e.preventDefault(); pycmd('preview:close'); return; }
    if (e.code === 'Enter') { e.preventDefault(); pycmd('preview:toggle_chat'); return; }
    if (e.code === 'Escape') { e.preventDefault(); pycmd('preview:close'); return; }
    return; // All other keys disabled in preview
}
```

- [ ] **Step 5: Commit**

```bash
git add custom_reviewer/interactions.js
git commit -m "feat(preview): add S.PREVIEW state to interactions.js"
```

---

## Task 2: Preview State Management in Custom Reviewer

**Files:**
- Modify: `custom_reviewer/__init__.py:447-931` (handle_custom_pycmd)
- Modify: `custom_reviewer/__init__.py:1177-1325` (_build_reviewer_html)

- [ ] **Step 1: Add preview state dict**

At module level in `custom_reviewer/__init__.py` (near the top, after imports), add:

```python
import time as _time

_preview_state = {
    'active': False,
    'stage': None,            # 'peek' | 'card_chat'
    'card_id': None,
    'previous_state': None,   # 'review' | 'overview' | 'deckBrowser'
    'previous_card_id': None,
    'previous_chat_tab': None,
    '_transitioning': False,
}
```

- [ ] **Step 2: Add `open_preview` function**

Add a new function after the `_preview_state` dict:

```python
def open_preview(card_id):
    """Open a card in preview mode from any Anki state."""
    from aqt import mw

    # Close existing preview first (no stacking)
    if _preview_state['active']:
        close_preview(notify_frontend=False)

    try:
        card = mw.col.get_card(card_id)
    except Exception:
        return {"success": False, "error": "Card not found"}

    # Save current state
    _preview_state['active'] = True
    _preview_state['stage'] = 'peek'
    _preview_state['card_id'] = card_id
    _preview_state['previous_state'] = mw.state
    _preview_state['previous_card_id'] = (
        mw.reviewer.card.id if mw.state == "review" and mw.reviewer and mw.reviewer.card else None
    )

    def _inject_preview():
        """Inject card into reviewer after state transition."""
        rev = mw.reviewer
        if not rev:
            return
        rev.card = card
        card.timer_started = _time.time()
        # Mark as navigating to prevent trail tracking
        handle_custom_pycmd._is_navigating = True
        from PyQt6.QtCore import QTimer
        QTimer.singleShot(0, lambda: _do_init_preview(rev))

    def _do_init_preview(rev):
        handle_custom_pycmd._is_navigating = False
        rev._initWeb()
        # Notify frontend
        _notify_frontend_preview('peek', card_id)

    if mw.state == "review":
        _inject_preview()
    else:
        # Transition to review state first.
        # Keep _transitioning True until injection completes to prevent
        # state_will_change from interfering AND to prevent the reviewer
        # from rendering its normal question card before we inject ours.
        _preview_state['_transitioning'] = True
        from PyQt6.QtCore import QTimer

        def _on_review_ready():
            """Called after reviewer is initialized — inject our card."""
            _preview_state['_transitioning'] = False
            _inject_preview()

        mw.moveToState("review")
        # Delay injection to let reviewer fully initialize
        QTimer.singleShot(100, _on_review_ready)

    return {"success": True}
```

- [ ] **Step 3: Add `close_preview` function**

```python
def close_preview(notify_frontend=True):
    """Close preview and restore previous state."""
    from aqt import mw

    if not _preview_state['active']:
        return

    prev_state = _preview_state['previous_state']
    prev_card_id = _preview_state['previous_card_id']

    # Reset state
    _preview_state['active'] = False
    _preview_state['stage'] = None
    _preview_state['card_id'] = None
    _preview_state['previous_state'] = None
    _preview_state['previous_card_id'] = None
    _preview_state['previous_chat_tab'] = None

    if notify_frontend:
        _notify_frontend_preview(None, None)

    def _do_restore():
        """Run state restoration after _transitioning flag is properly set."""
        _preview_state['_transitioning'] = False

    if prev_state == "review" and prev_card_id:
        # Re-inject the session card
        try:
            card = mw.col.get_card(prev_card_id)
            rev = mw.reviewer
            if rev:
                rev.card = card
                card.timer_started = _time.time()
                from PyQt6.QtCore import QTimer
                QTimer.singleShot(0, rev._initWeb)
                return  # No state transition needed, _transitioning stays False
        except Exception:
            pass
        # Fallback: go to overview
        _preview_state['_transitioning'] = True
        mw.moveToState("overview")
        _preview_state['_transitioning'] = False
    elif prev_state in ("overview", "deckBrowser"):
        _preview_state['_transitioning'] = True
        mw.moveToState(prev_state)
        _preview_state['_transitioning'] = False
    else:
        # Unknown previous state, go to overview
        _preview_state['_transitioning'] = True
        mw.moveToState("overview")
        _preview_state['_transitioning'] = False


def _notify_frontend_preview(stage, card_id):
    """Send previewMode event to frontend."""
    from aqt import mw
    import json
    from .. import ui_setup

    widget = getattr(ui_setup, '_chatbot_widget', None)
    if widget and widget.web_view:
        if stage is None:
            payload = json.dumps({"type": "previewMode", "data": None})
        else:
            payload = json.dumps({
                "type": "previewMode",
                "data": {"stage": stage, "cardId": card_id}
            })
        widget.web_view.page().runJavaScript(
            f"window.ankiReceive({payload});"
        )
```

- [ ] **Step 4: Add preview toggle in `handle_custom_pycmd`**

In `handle_custom_pycmd` (around line 816, before the navigate handler), add:

```python
elif message == "preview:close":
    close_preview()
    return (True, None)

elif message == "preview:toggle_chat":
    if _preview_state['active']:
        if _preview_state['stage'] == 'peek':
            _preview_state['stage'] = 'card_chat'
            _notify_frontend_preview('card_chat', _preview_state['card_id'])
            # Update button label via JS
            if mw.reviewer and mw.reviewer.web:
                mw.reviewer.web.eval("window.updatePreviewChatLabel(true);")
        else:
            _preview_state['stage'] = 'peek'
            _notify_frontend_preview('peek', _preview_state['card_id'])
            if mw.reviewer and mw.reviewer.web:
                mw.reviewer.web.eval("window.updatePreviewChatLabel(false);")
    return (True, None)
```

- [ ] **Step 5: Modify `_build_reviewer_html` to detect preview mode**

In `_build_reviewer_html` (around line 1287, where `show_answered` is handled), add a check BEFORE the `show_answered` block. Important: do NOT `return html` early — let the rest of the function run (Plusi dock injection, override CSS, etc.). Instead, set a flag so the `show_answered` block is skipped:

```python
# Check if we're in preview mode — inject preview JS instead of history mode
_is_preview = _preview_state.get('active', False)
if _is_preview:
    auto_answer_js = """
    <script>
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(function() {
            var ansEl = document.getElementById('answer-content');
            if (ansEl) ansEl.style.display = '';
            document.body.setAttribute('data-state', 'preview');
            if (window.setPreviewMode) window.setPreviewMode();
        }, 50);
    });
    </script>
    """
    html = html.replace('</body>', auto_answer_js + '</body>')
```

Then wrap the existing `show_answered` block with:

```python
if not _is_preview:
    # existing show_answered / history mode logic here
    ...
```

This ensures preview cards get the `data-state="preview"` attribute (used by CSS), call `setPreviewMode()` (not `setHistoryMode()`), and still receive all other HTML injections (Plusi dock, override CSS, etc.).

- [ ] **Step 6: Commit**

```bash
git add custom_reviewer/__init__.py
git commit -m "feat(preview): add preview state management and open/close logic"
```

---

## Task 3: Bridge Method + Message Routing

**Files:**
- Modify: `bridge.py` (add `openPreview` slot, ~line 346)
- Modify: `widget.py` (handle `openPreview` in `_handle_js_message`)

- [ ] **Step 1: Add `openPreview` to bridge.py**

After the existing `previewCard` method (around line 386), add:

```python
@pyqtSlot(str, result=str)
def openPreview(self, card_id_str):
    """Open card in two-stage preview mode. Works from any Anki state."""
    try:
        card_id = int(card_id_str)
        from .custom_reviewer import open_preview
        result = open_preview(card_id)
        return json.dumps(result)
    except Exception as e:
        return json.dumps({"success": False, "error": str(e)})
```

- [ ] **Step 2: Handle `openPreview` message in widget.py**

In `widget.py`'s `_handle_js_message` method, add a case for the `openPreview` message type:

```python
elif msg_type == 'openPreview':
    card_id = data.get('cardId') if isinstance(data, dict) else data
    from .custom_reviewer import open_preview
    open_preview(int(card_id))
```

- [ ] **Step 3: Commit**

```bash
git add bridge.py widget.py
git commit -m "feat(preview): add openPreview bridge method and message handler"
```

---

## Task 4: Guard `on_state_will_change` Hook

**Files:**
- Modify: `__init__.py:600-714` (on_state_will_change)

- [ ] **Step 1: Add transitioning guard**

Two changes in `on_state_will_change`:

**Change A:** At the top of the function (line ~602), add auto-close for manual navigation:

```python
from .custom_reviewer import _preview_state

# Auto-close preview if user manually navigates away (not our own transition)
if _preview_state.get('active', False) and not _preview_state.get('_transitioning', False):
    from .custom_reviewer import close_preview
    close_preview(notify_frontend=True)
    # Don't return — let normal state_will_change logic run
```

**Change B:** Around the chat panel close block (line ~651-656), wrap it with a transitioning guard:

```python
if new_state != "review":
    # Skip chat panel close if we're in a preview transition
    # (preview exit flow handles its own restoration)
    if not _preview_state.get('_transitioning', False):
        try:
            from .ui_setup import close_chatbot_panel
            close_chatbot_panel()
        except Exception:
            pass
```

This ensures the transitioning guard only skips the chat-panel-close logic, NOT toolbar management and other critical hooks.

- [ ] **Step 2: Commit**

```bash
git add __init__.py
git commit -m "feat(preview): guard state_will_change against preview transitions"
```

---

## Task 5: Schema Migration for Section Type

**Files:**
- Modify: `card_sessions_storage.py:47-56` (table schema)
- Modify: `card_sessions_storage.py:511-555` (save_section)

- [ ] **Step 1: Add `type` column to schema**

In `card_sessions_storage.py`, in the `review_sections` CREATE TABLE statement (line ~55, before `FOREIGN KEY`), add:

```sql
type            TEXT DEFAULT 'review',
```

- [ ] **Step 2: Add migration for existing databases**

After the CREATE TABLE statements (around line 60), add an ALTER TABLE migration wrapped in try/except:

```python
try:
    cursor.execute("ALTER TABLE review_sections ADD COLUMN type TEXT DEFAULT 'review'")
    conn.commit()
except Exception:
    pass  # Column already exists
```

- [ ] **Step 3: Update `save_section` to accept type**

In the `save_section` function (line ~530), modify the INSERT statement to include the `type` field:

```python
section_type = section.get('type', 'review')
```

Add `type` to the INSERT column list, values, and ON CONFLICT clause:

```python
cursor.execute("""
    INSERT INTO review_sections (id, card_id, title, created_at, performance_type, performance_data, previous_score, type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        performance_type = excluded.performance_type,
        performance_data = excluded.performance_data,
        previous_score = excluded.previous_score,
        type = excluded.type
""", (section_id, card_id, title, created_at, perf_type, perf_data_str, previous_score, section_type))
```

- [ ] **Step 4: Commit**

```bash
git add card_sessions_storage.py
git commit -m "feat(preview): add type column to review_sections for preview marker"
```

---

## Task 6: Frontend — useAnki Bridge + App.jsx Event Handling

**Files:**
- Modify: `frontend/src/hooks/useAnki.js:60-65` (add openPreview)
- Modify: `frontend/src/App.jsx:513-1006` (ankiReceive handler)

- [ ] **Step 1: Add `openPreview` to useAnki.js**

After the existing `previewCard` method (around line 65), add:

```javascript
openPreview: (cardId) => {
    console.log('Bridge: openPreview aufgerufen für Card:', cardId);
    if (window.ankiBridge) {
        window.ankiBridge.addMessage('openPreview', { cardId: String(cardId) });
    }
},
```

- [ ] **Step 2: Add `previewMode` state to App.jsx**

Near the existing state declarations (around line 215), add:

```javascript
const [previewMode, setPreviewMode] = useState(null);
// null | {stage: 'peek'|'card_chat', cardId: number, previousChatState: object}
```

- [ ] **Step 3: Handle `previewMode` event in ankiReceive**

In the `ankiReceive` handler (around line 565, in the event routing section), add:

```javascript
case 'previewMode':
    if (payload.data === null) {
        // Preview closed — restore previous chat state
        if (previewMode?.previousChatState) {
            // Restore previous tab, session, scroll
            setActiveTab(previewMode.previousChatState.activeTab);
            // Additional restoration logic as needed
        }
        setPreviewMode(null);
    } else {
        const { stage, cardId } = payload.data;
        if (stage === 'peek') {
            setPreviewMode({
                stage: 'peek',
                cardId,
                previousChatState: {
                    activeTab: activeTab,
                    // Capture current state for restoration
                }
            });
        } else if (stage === 'card_chat') {
            setPreviewMode(prev => ({
                ...prev,
                stage: 'card_chat',
                cardId
            }));
            // Switch to card-specific chat and explicitly load card session
            setActiveTab('session');
            if (bridge?.loadCardSession) {
                bridge.loadCardSession(String(cardId));
            }
        }
    }
    break;
```

- [ ] **Step 4: Add auto-transition on message send during Peek**

In the message send handler (wherever `sendMessage` is called in App.jsx), add a check:

```javascript
// Before sending a message, auto-transition to Card Chat if in Peek mode
if (previewMode?.stage === 'peek') {
    // Transition to card_chat: save previous state, switch tab, load card session
    setPreviewMode(prev => ({ ...prev, stage: 'card_chat' }));
    setActiveTab('session');
    if (bridge?.loadCardSession) {
        bridge.loadCardSession(String(previewMode.cardId));
    }
    // Notify Python to update button labels
    if (window.ankiBridge) {
        window.ankiBridge.addMessage('previewToggleChat', {});
    }
}
```

- [ ] **Step 5: Add fade transition CSS**

In the chat container component, add a CSS transition class that activates during preview mode switches:

```css
.preview-fade-enter { opacity: 0; }
.preview-fade-enter-active { opacity: 1; transition: opacity 200ms ease-in; }
.preview-fade-exit { opacity: 1; }
.preview-fade-exit-active { opacity: 0; transition: opacity 200ms ease-out; }
```

Apply this transition when `previewMode.stage` changes between `'peek'` and `'card_chat'`, and when preview is exited.

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/hooks/useAnki.js src/App.jsx
git commit -m "feat(preview): add frontend previewMode state and event handling"
```

---

## Task 7: Update CardRefChip to Use Preview

**Files:**
- Modify: `frontend/src/components/CardRefChip.jsx:13-17`

- [ ] **Step 1: Change click handler**

Replace the existing `handleClick` in `CardRefChip.jsx` (lines 13-17):

```javascript
const handleClick = () => {
    if (bridge?.openPreview) {
        bridge.openPreview(String(cardId));
    }
};
```

- [ ] **Step 2: Commit**

```bash
cd frontend && git add src/components/CardRefChip.jsx
git commit -m "feat(preview): CardRefChip opens preview instead of browser"
```

---

## Task 8: Integration Testing & Polish

- [ ] **Step 1: Build frontend**

```bash
cd frontend && npm run build
```

- [ ] **Step 2: Test from review state**

1. Start a review session in Anki
2. Open chat, get a card reference
3. Click card reference → verify Peek mode (card shows, chat unchanged)
4. Press Enter → verify Card Chat mode (chat fades to card's history)
5. Press Space → verify return to previous card + chat state

- [ ] **Step 3: Test from deck overview**

1. Go to deck overview
2. Click a card reference in chat
3. Verify reviewer loads with preview card
4. Press Space → verify return to overview

- [ ] **Step 4: Test auto-close on tab switch**

1. Open preview from review
2. Manually click "Stapel" tab
3. Verify preview auto-closes

- [ ] **Step 5: Test direct typing in Peek mode**

1. Open preview (Peek stage)
2. Type a message and send
3. Verify auto-transition to Card Chat + message sent to preview card's chat

- [ ] **Step 6: Final commit**

```bash
git add web/
git commit -m "feat(preview): build frontend with preview mode support"
```
