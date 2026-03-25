# Global Shortcut Filter

**Date:** 2026-03-20
**Status:** Approved

## Problem

The addon has multiple QWebEngineViews (reviewer, chatbot panel, shop/Plusi panel). When the user clicks into a side panel, keyboard focus moves to that WebView and reviewer shortcuts (Space, Enter, arrow keys, 1-4, etc.) stop working. Focus is only restored on card transitions (`reviewer_did_show_question`/`reviewer_did_show_answer`), not after every interaction.

## Solution

A single `GlobalShortcutFilter` installed on `QApplication` that intercepts all `KeyPress` events and routes them based on context. This replaces per-widget QShortcuts and timer-based focus restoration. The existing JavaScript `onKeydown` listener in `interactions.js` is kept — it now receives synthetic events dispatched by the filter instead of native browser events.

## Architecture

### New File: `ui/shortcut_filter.py`

`GlobalShortcutFilter(QObject)` — installed via `QApplication.instance().installEventFilter(filter)`.

### Event Routing Logic

```
KeyPress received
  |
  +-- Cmd+K --> toggle_text_field_focus()            (always, no-op if no text field visible)
  |
  +-- Text field has focus?
  |     +-- Escape       --> clear text field + defocus (return focus to reviewer)
  |     +-- Enter        --> send chat message
  |     +-- Shift+Enter  --> new line (pass through)
  |     +-- All other    --> pass through (normal typing)
  |
  +-- No text field focused?
        +-- Forward as synthetic JS KeyboardEvent to reviewer webview
            (Space, Enter, Left/Right, 1-4, A-D, E, M, Z, R, etc.)
```

### Text Field Focus Tracking

Each WebView (chatbot, custom reviewer, overlays) reports text field focus state to Python:

**JavaScript side** (added to each WebView):
```javascript
document.addEventListener('focusin', (e) => {
  const tag = e.target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) {
    window.ankiBridge.addMessage('textFieldFocus', { focused: true });
  }
});
document.addEventListener('focusout', (e) => {
  const tag = e.target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) {
    window.ankiBridge.addMessage('textFieldFocus', { focused: false });
  }
});
```

**Python side** (`ui/shortcut_filter.py`):
- Maintains a synchronous boolean `_text_field_has_focus`
- Updated via the existing message queue polling (100ms)
- The event filter checks this flag on every KeyPress

### Synthetic Event Forwarding

When no text field is focused and the key matches a reviewer shortcut, the filter forwards it:

```python
js = (
    f"document.dispatchEvent(new KeyboardEvent('keydown', {{"
    f"  key: '{key}', code: '{code}',"
    f"  shiftKey: {shift}, ctrlKey: {ctrl}, metaKey: {meta}"
    f"}}));"
)
mw.reviewer.web.page().runJavaScript(js)
```

The existing `onKeydown` handler in `interactions.js` processes the synthetic event identically to a native one.

### Cmd+K Toggle Behavior

1. **No text field visible on screen** --> no-op
2. **Text field visible, not focused** --> focus it (set cursor in field)
3. **Text field visible, already focused** --> defocus (blur field, return focus to reviewer)

Detection of "text field visible" uses the same `_text_field_has_focus` flag plus a check for visible WebView panels.

## Shortcut Reference

| Shortcut | Context | Action |
|----------|---------|--------|
| Cmd+K | Global | Toggle text field focus (no-op if none visible) |
| Escape | In text field | Clear field + defocus |
| Enter | In text field | Send message |
| Shift+Enter | In text field | New line |
| Space | Not in text field | Reviewer action (show answer / rate) |
| Enter | Not in text field | Reviewer action (MC / follow-up) |
| Left/Right | Not in text field | Navigate cards |
| 1-4, A-D | Not in text field | Rate card / select MC option |
| E, M, Z, R | Not in text field | Edit, Mark, Undo, Replay |
| Cmd+Z | Not in text field | Undo card |

## Files Changed

### New
- `ui/shortcut_filter.py` — `GlobalShortcutFilter` class

### Modified
- `ui/setup.py` — Remove old `QShortcut("Ctrl+I")`, remove `QAction.setShortcut()`, remove `toggle_chatbot()` function entirely, install filter instead
- `ui/widget.py` — Handle `textFieldFocus` messages, expose `_text_field_has_focus` flag
- `ui/manager.py` — Simplify `focus_reviewer_webview()` (keep for scroll/mouse focus, remove keyboard-related calls)
- `__init__.py` — Remove `QTimer.singleShot` focus restoration in `on_reviewer_did_show_question` and `on_reviewer_did_show_answer` hooks
- `custom_reviewer/interactions.js` — **Keep** `document.addEventListener('keydown', onKeydown)` (receives synthetic events from filter). **Keep** modifier key guard (prevents native Cmd+E etc. from hitting the handlers dict when reviewer has direct focus). Add `focusin`/`focusout` reporter.
- `frontend/src/App.jsx` or `frontend/src/hooks/useAnki.js` — Add `focusin`/`focusout` reporter for chat input

### Removed Logic
- `QShortcut("Ctrl+I", mw)` in `ui/setup.py` — completely removed
- `QAction.setShortcut("Ctrl+I")` in menu setup — completely removed
- `toggle_chatbot()` function in `ui/setup.py` — completely removed (Cmd+I no longer exists)
- `setup_keyboard_shortcut()` function in `ui/setup.py` — completely removed
- `QTimer.singleShot(100, focus_reviewer_webview)` calls in `__init__.py`

### Kept (simplified)
- `focus_reviewer_webview()` in `ui/manager.py` — still needed for non-keyboard focus restoration (e.g. after card transitions for scroll/mouse interactions). Only the keyboard-shortcut-related calls are removed.

## Edge Cases

- **Reviewer not active** (deck browser, overview): Filter checks `mw.state == "review"` before forwarding to reviewer. Outside review, only Cmd+K is handled.
- **Floating dock**: If chatbot is undocked/floating, Cmd+K still targets the visible text field in that window.
- **Multiple text fields**: Only one can have focus at a time. The flag tracks whichever was last focused.
- **Polling latency**: The message queue polls at ~200ms. To avoid stale focus state, the filter uses a hybrid approach: first check `QApplication.focusWidget()` synchronously (if focus is on the reviewer webview, no text field can be active in it). The JS-reported flag is only consulted when focus is in a non-reviewer webview (chatbot, overlay).
- **Cmd+I completely removed**: No panel toggle shortcut. The chatbot panel is managed via UI buttons only. Cmd+K is the sole global shortcut.

## Testing

1. **In reviewer, no panel open**: Space/Enter/arrows/1-4 work normally
2. **In reviewer, panel open, click into panel (not text field)**: Space/Enter/arrows still control reviewer
3. **Cmd+K into text field**: Cursor appears, typing works, Space/Enter go to text field
4. **Cmd+K again or Escape**: Defocus, shortcuts back to reviewer
5. **Outside reviewer** (deck browser): Only Cmd+K responds, other keys pass through normally
