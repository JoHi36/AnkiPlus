# Global Shortcut Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route all keyboard shortcuts through a single application-level event filter so they work regardless of which QWebEngineView has focus.

**Architecture:** A `GlobalShortcutFilter(QObject)` installed on `QApplication` intercepts KeyPress events. It checks a `_text_field_has_focus` flag (reported by JS via the message queue) and either passes events through to text fields or forwards them as synthetic KeyboardEvents to the reviewer webview. Cmd+K toggles text field focus globally.

**Tech Stack:** PyQt6 (QObject event filter), JavaScript (focusin/focusout reporters, synthetic KeyboardEvent dispatch)

**Spec:** `docs/superpowers/specs/2026-03-20-global-shortcut-filter.md`

---

### Task 1: Create `ui/shortcut_filter.py` — the GlobalShortcutFilter

**Files:**
- Create: `ui/shortcut_filter.py`

- [ ] **Step 1: Create the file with the GlobalShortcutFilter class**

```python
"""
Global Shortcut Filter
Intercepts all KeyPress events at the QApplication level and routes them
based on whether a text field has focus.
"""

import sys
from aqt import mw
from aqt.qt import *

try:
    from PyQt6.QtWebEngineWidgets import QWebEngineView
except Exception:
    try:
        from PyQt5.QtWebEngineWidgets import QWebEngineView
    except Exception:
        QWebEngineView = None

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)


# Mapping from Qt key codes to JS key names
QT_KEY_TO_JS = {
    Qt.Key.Key_Space: ('Space', ' '),
    Qt.Key.Key_Return: ('Enter', 'Enter'),
    Qt.Key.Key_Enter: ('Enter', 'Enter'),
    Qt.Key.Key_Left: ('ArrowLeft', 'ArrowLeft'),
    Qt.Key.Key_Right: ('ArrowRight', 'ArrowRight'),
    Qt.Key.Key_1: ('Digit1', '1'),
    Qt.Key.Key_2: ('Digit2', '2'),
    Qt.Key.Key_3: ('Digit3', '3'),
    Qt.Key.Key_4: ('Digit4', '4'),
    Qt.Key.Key_5: ('Digit5', '5'),
    Qt.Key.Key_A: ('KeyA', 'a'),
    Qt.Key.Key_B: ('KeyB', 'b'),
    Qt.Key.Key_C: ('KeyC', 'c'),
    Qt.Key.Key_D: ('KeyD', 'd'),
    Qt.Key.Key_E: ('KeyE', 'e'),
    Qt.Key.Key_M: ('KeyM', 'm'),
    Qt.Key.Key_Z: ('KeyZ', 'z'),
    Qt.Key.Key_R: ('KeyR', 'r'),
    Qt.Key.Key_Minus: ('Minus', '-'),
    Qt.Key.Key_Equal: ('Equal', '='),
    Qt.Key.Key_Escape: ('Escape', 'Escape'),
    Qt.Key.Key_F5: ('F5', 'F5'),
}


class GlobalShortcutFilter(QObject):
    """Application-level event filter that routes keyboard shortcuts globally."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self._text_field_has_focus = False
        # Track which webview reported the text field focus
        self._focused_webview = None

    def set_text_field_focus(self, focused, webview=None):
        """Called by widget.py when a textFieldFocus message is received."""
        self._text_field_has_focus = focused
        self._focused_webview = webview if focused else None

    def _is_reviewer_active(self):
        """Check if we're in review state."""
        try:
            return (mw and hasattr(mw, 'state') and mw.state == 'review'
                    and mw.reviewer and mw.reviewer.web)
        except Exception:
            return False

    def _get_reviewer_web(self):
        """Get the reviewer's QWebEngineView."""
        try:
            if self._is_reviewer_active():
                return mw.reviewer.web
        except Exception:
            pass
        return None

    def _is_focus_in_reviewer(self):
        """Check if Qt focus is on the reviewer webview (synchronous, no polling lag)."""
        try:
            focused = QApplication.focusWidget()
            reviewer_web = self._get_reviewer_web()
            if focused and reviewer_web:
                return focused is reviewer_web or reviewer_web.isAncestorOf(focused)
        except Exception:
            pass
        return False

    def _has_visible_text_field(self):
        """Check if any panel with a text field is visible on screen."""
        try:
            from .setup import get_chatbot_widget
            widget = get_chatbot_widget()
            if widget and widget.isVisible():
                return True
        except Exception:
            pass
        return False

    def _toggle_text_field_focus(self):
        """Cmd+K handler: toggle focus on the visible text field."""
        if self._text_field_has_focus:
            # Defocus: blur the text field, return focus to reviewer
            self._defocus_text_field()
        elif self._has_visible_text_field():
            # Focus: set cursor in the chat input
            self._focus_text_field()

    def _focus_text_field(self):
        """Focus the chat input in the visible panel."""
        try:
            from .setup import get_chatbot_widget
            widget = get_chatbot_widget()
            if widget and widget.web_view:
                widget.web_view.setFocus()
                widget.web_view.page().runJavaScript(
                    "document.querySelector('[data-chat-input]')?.focus();"
                )
        except Exception as e:
            logger.warning("Could not focus text field: %s", e)

    def _defocus_text_field(self):
        """Blur any focused text field and return focus to reviewer."""
        try:
            # Blur in whichever webview has the focused text field
            if self._focused_webview:
                self._focused_webview.page().runJavaScript(
                    "document.activeElement?.blur(); document.body.focus();"
                )
            # Also try the chatbot widget
            from .setup import get_chatbot_widget
            widget = get_chatbot_widget()
            if widget and widget.web_view:
                widget.web_view.page().runJavaScript(
                    "document.activeElement?.blur(); document.body.focus();"
                )
            # Return Qt focus to reviewer
            reviewer_web = self._get_reviewer_web()
            if reviewer_web:
                reviewer_web.setFocus()
        except Exception as e:
            logger.warning("Could not defocus text field: %s", e)

    def _clear_and_defocus_text_field(self):
        """Escape handler: dispatch ankiClearAndBlur event so React handles clearing via state."""
        try:
            js = "window.dispatchEvent(new CustomEvent('ankiClearAndBlur'));"
            if self._focused_webview:
                self._focused_webview.page().runJavaScript(js)
            else:
                from .setup import get_chatbot_widget
                widget = get_chatbot_widget()
                if widget and widget.web_view:
                    widget.web_view.page().runJavaScript(js)
            # Return Qt focus to reviewer
            reviewer_web = self._get_reviewer_web()
            if reviewer_web:
                reviewer_web.setFocus()
        except Exception as e:
            logger.warning("Could not clear text field: %s", e)
        self._text_field_has_focus = False
        self._focused_webview = None

    def _send_chat_message(self):
        """Enter handler when in text field: dispatch ankiSendMessage so React handles it."""
        try:
            js = "window.dispatchEvent(new CustomEvent('ankiSendMessage'));"
            if self._focused_webview:
                self._focused_webview.page().runJavaScript(js)
            else:
                from .setup import get_chatbot_widget
                widget = get_chatbot_widget()
                if widget and widget.web_view:
                    widget.web_view.page().runJavaScript(js)
        except Exception as e:
            logger.warning("Could not send chat message: %s", e)

    def _forward_to_reviewer(self, event):
        """Forward a key event as a synthetic JS KeyboardEvent to the reviewer."""
        reviewer_web = self._get_reviewer_web()
        if not reviewer_web:
            return False

        qt_key = event.key()
        mapping = QT_KEY_TO_JS.get(qt_key)
        if not mapping:
            return False

        code, key = mapping

        # Preserve case for letter keys
        if len(key) == 1 and key.isalpha():
            if event.modifiers() & Qt.KeyboardModifier.ShiftModifier:
                key = key.upper()

        shift = 'true' if event.modifiers() & Qt.KeyboardModifier.ShiftModifier else 'false'
        ctrl = 'true' if event.modifiers() & Qt.KeyboardModifier.ControlModifier else 'false'
        meta = 'true' if event.modifiers() & Qt.KeyboardModifier.MetaModifier else 'false'

        js = (
            f"document.dispatchEvent(new KeyboardEvent('keydown', {{"
            f"  key: '{key}', code: '{code}',"
            f"  shiftKey: {shift}, ctrlKey: {ctrl}, metaKey: {meta},"
            f"  bubbles: true, cancelable: true"
            f"}}));"
        )
        reviewer_web.page().runJavaScript(js)
        return True

    def eventFilter(self, obj, event):
        """Main event filter -- intercepts all KeyPress events."""
        if event.type() != QEvent.Type.KeyPress:
            return super().eventFilter(obj, event)

        # --- Cmd+K: Always handle (toggle text field focus) ---
        if (event.key() == Qt.Key.Key_K and
                event.modifiers() & (Qt.KeyboardModifier.ControlModifier | Qt.KeyboardModifier.MetaModifier)):
            self._toggle_text_field_focus()
            return True  # Consumed

        # --- Cmd+Z: Always forward to reviewer (undo card) ---
        if (event.key() == Qt.Key.Key_Z and
                event.modifiers() & (Qt.KeyboardModifier.ControlModifier | Qt.KeyboardModifier.MetaModifier)):
            if not self._text_field_has_focus and self._is_reviewer_active():
                self._forward_to_reviewer(event)
                return True
            return super().eventFilter(obj, event)

        # --- Text field has focus: handle special keys, pass through rest ---
        # Use hybrid check: synchronous Qt check first, then JS-reported flag
        text_field_active = self._text_field_has_focus
        if self._is_focus_in_reviewer():
            # If Qt focus is on the reviewer, no text field can be active there
            text_field_active = False

        if text_field_active:
            if event.key() == Qt.Key.Key_Escape:
                self._clear_and_defocus_text_field()
                return True

            if event.key() in (Qt.Key.Key_Return, Qt.Key.Key_Enter):
                if event.modifiers() & Qt.KeyboardModifier.ShiftModifier:
                    return super().eventFilter(obj, event)  # Shift+Enter: new line
                self._send_chat_message()
                return True

            # All other keys: pass through to text field
            return super().eventFilter(obj, event)

        # --- No text field focused: forward reviewer shortcuts ---
        if not self._is_reviewer_active():
            return super().eventFilter(obj, event)

        # Skip modifier-only combos (except Cmd+Z handled above)
        if event.modifiers() & (Qt.KeyboardModifier.ControlModifier | Qt.KeyboardModifier.MetaModifier | Qt.KeyboardModifier.AltModifier):
            return super().eventFilter(obj, event)

        qt_key = event.key()
        if qt_key in QT_KEY_TO_JS:
            if self._forward_to_reviewer(event):
                return True  # Consumed -- don't let Qt process it

        return super().eventFilter(obj, event)


# --- Module-level singleton ---
_filter_instance = None


def install_shortcut_filter():
    """Install the global shortcut filter on QApplication. Call once at startup."""
    global _filter_instance
    if _filter_instance is not None:
        return _filter_instance

    app = QApplication.instance()
    if not app:
        logger.error("QApplication not available -- cannot install shortcut filter")
        return None

    _filter_instance = GlobalShortcutFilter(app)
    app.installEventFilter(_filter_instance)
    logger.info("Global shortcut filter installed")
    return _filter_instance


def get_shortcut_filter():
    """Return the singleton filter instance."""
    return _filter_instance
```

- [ ] **Step 2: Commit**

```bash
git add ui/shortcut_filter.py
git commit -m "feat: add GlobalShortcutFilter for universal keyboard shortcuts"
```

---

### Task 2: Wire up the filter — install in `setup.py`, remove old shortcuts

**Files:**
- Modify: `ui/setup.py:66-69` (remove `_shortcut` global)
- Modify: `ui/setup.py:82-221` (remove `toggle_chatbot()`)
- Modify: `ui/setup.py:248-254` (remove `setup_keyboard_shortcut()`)
- Modify: `ui/setup.py:349-357` (update `setup_ui()`)
- Modify: `ui/setup.py:403-409` (remove Cmd+I from menu)

- [ ] **Step 1: Remove `_shortcut` global variable**

In `ui/setup.py`, delete line 69:
```python
# Delete this line:
_shortcut = None
```

- [ ] **Step 2: Remove `toggle_chatbot()` function and extract dock creation**

Delete the entire `toggle_chatbot()` function (lines 82-220). Replace with a `_create_chatbot_dock()` that contains just the dock creation logic:

```python
def _create_chatbot_dock():
    """Creates the chatbot dock widget (called on first use)."""
    global _chatbot_dock, _chatbot_widget
    if _chatbot_dock is not None:
        return

    _chatbot_dock = QDockWidget("", mw)
    _chatbot_dock.setObjectName("chatbotDock")
    _chatbot_dock.setTitleBarWidget(QWidget())

    _chatbot_dock.setStyleSheet(get_dock_widget_style())

    chatbot_widget = ChatbotWidget()
    _chatbot_widget = chatbot_widget
    _chatbot_dock.setWidget(chatbot_widget)

    mw.addDockWidget(Qt.DockWidgetArea.RightDockWidgetArea, _chatbot_dock)

    DOCK_MIN_WIDTH = 350
    DOCK_MAX_WIDTH = 800
    DOCK_DEFAULT_WIDTH = 450
    _chatbot_dock.setMinimumWidth(DOCK_MIN_WIDTH)
    _chatbot_dock.setMaximumWidth(DOCK_MAX_WIDTH)
    _chatbot_dock.resize(DOCK_DEFAULT_WIDTH, mw.height())

    try:
        from .theme import get_resolved_theme
    except ImportError:
        from ui.theme import get_resolved_theme
    _resolved = get_resolved_theme()
    _sep_tokens = get_tokens(_resolved)
    mw.setStyleSheet(mw.styleSheet() + f"""
        QMainWindow::separator {{
            background: {_sep_tokens['border_subtle']};
            width: 1px !important;
            margin: 0px;
            padding: 0px;
        }}
        QMainWindow::separator:hover {{
            background: {_sep_tokens['border_medium']};
            width: 1px !important;
        }}
        QSplitter::handle {{
            background: {_sep_tokens['border_subtle']};
            width: 1px !important;
            margin: 0px;
            padding: 0px;
        }}
        QSplitter::handle:hover {{
            background: {_sep_tokens['border_medium']};
            width: 1px !important;
        }}
    """)

    _chatbot_dock.setFeatures(
        QDockWidget.DockWidgetFeature.DockWidgetClosable |
        QDockWidget.DockWidgetFeature.DockWidgetMovable |
        QDockWidget.DockWidgetFeature.DockWidgetFloatable
    )
```

- [ ] **Step 3: Update `ensure_chatbot_open()` to use `_create_chatbot_dock()`**

```python
def ensure_chatbot_open():
    """Öffnet das Chatbot-Panel falls es noch nicht sichtbar ist. Gibt das Widget zurück."""
    global _chatbot_dock
    if _chatbot_dock is None:
        _create_chatbot_dock()
    if _chatbot_dock and not _chatbot_dock.isVisible():
        _chatbot_dock.show()
        _notify_reviewer_chat_state(True)
        # Trigger slide-in animation in React
        try:
            widget = get_chatbot_widget()
            if widget and widget.web_view:
                widget.web_view.page().runJavaScript(
                    "window.ankiReceive && window.ankiReceive({type:'panelOpened'});"
                )
        except Exception:
            pass
        # Send current deck info after short delay (WebView needs to be ready)
        def check_and_send_deck():
            try:
                widget = get_chatbot_widget()
                if widget and widget.bridge and widget.web_view:
                    deck_info = widget.bridge.getCurrentDeck()
                    deck_data = json.loads(deck_info)
                    if deck_data.get("deckId") and deck_data.get("isInDeck"):
                        deck_id = deck_data["deckId"]
                        deck_name = deck_data["deckName"]
                        stats = widget.bridge._get_deck_stats(deck_id)
                        total_cards = stats.get("totalCards", 0) if stats else 0
                        is_sub_deck = "::" in deck_name if deck_name else False
                        payload = {
                            "type": "deckSelected",
                            "data": {
                                "deckId": deck_id,
                                "deckName": deck_name,
                                "totalCards": total_cards,
                                "isSubDeck": is_sub_deck
                            }
                        }
                        widget.web_view.page().runJavaScript(
                            f"window.ankiReceive({json.dumps(payload)});"
                        )
            except Exception as e:
                logger.exception("Fehler beim Senden von deckSelected: %s", e)
        QTimer.singleShot(100, check_and_send_deck)
    return get_chatbot_widget()
```

- [ ] **Step 4: Remove `setup_keyboard_shortcut()` function**

Delete the entire function (lines 248-254).

- [ ] **Step 5: Update `setup_ui()` to install the filter instead**

```python
def setup_ui():
    """Initialisiert die Chatbot-UI mit globalem Shortcut-Filter"""
    # Install global shortcut filter (replaces per-widget QShortcuts)
    try:
        from .shortcut_filter import install_shortcut_filter
    except ImportError:
        from ui.shortcut_filter import install_shortcut_filter
    install_shortcut_filter()

    # Toolbar-Button hinzufügen
    setup_toolbar_button()

    # State-Change Hook registrieren
    gui_hooks.state_did_change.append(on_state_did_change)
```

- [ ] **Step 6: Remove Cmd+I from `setup_menu()` and `setup_toolbar_button()`**

In `setup_menu()`, remove the chatbot toggle action (lines 405-409). Keep the custom reviewer toggle.

In `setup_toolbar_button()`, remove `shortcut_text` references and update the tooltip. Change `toggle_chatbot` to `ensure_chatbot_open`:
```python
action = QAction("AnKI+", mw)
action.setToolTip("AnKI+ öffnen")
action.triggered.connect(ensure_chatbot_open)
```

- [ ] **Step 7: Commit**

```bash
git add ui/setup.py
git commit -m "refactor: remove Cmd+I shortcut, wire up GlobalShortcutFilter in setup_ui"
```

---

### Task 3: Add text field focus tracking to `ui/widget.py`

**Files:**
- Modify: `ui/widget.py:391-450` (add handler to message handler map)

- [ ] **Step 1: Add `textFieldFocus` to the message handler map**

In `_get_message_handler()`, add to the handlers dict:

```python
# Shortcut filter
'textFieldFocus': self._msg_text_field_focus,
```

- [ ] **Step 2: Implement the handler method**

Add to `ChatbotWidget`:

```python
def _msg_text_field_focus(self, data):
    """Handle text field focus state changes from JavaScript."""
    try:
        from .shortcut_filter import get_shortcut_filter
    except ImportError:
        from ui.shortcut_filter import get_shortcut_filter
    filt = get_shortcut_filter()
    if filt:
        focused = data.get('focused', False) if isinstance(data, dict) else False
        filt.set_text_field_focus(focused, self.web_view)
```

- [ ] **Step 3: Commit**

```bash
git add ui/widget.py
git commit -m "feat: add textFieldFocus message handler for shortcut filter"
```

---

### Task 4: Add focus reporters to `custom_reviewer/interactions.js`

**Files:**
- Modify: `custom_reviewer/interactions.js:960-969` (add focus reporters in init)

**Note:** The modifier key guard on line 893 (`if (e.ctrlKey || e.altKey || e.metaKey) return;`) is intentionally **kept**. The filter only sends synthetic events without modifier flags, so this guard is safe. Removing it would expose native modifier+key combos (e.g. Cmd+E) to the handlers dict when the reviewer has direct focus.

- [ ] **Step 2: Add focusin/focusout reporters in `init()`**

After the existing event listeners in `init()` (around line 966), add:

```javascript
// Report text field focus state to Python for global shortcut routing
document.addEventListener('focusin', function(e) {
    var tag = e.target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) {
        if (window.ankiBridge) window.ankiBridge.addMessage('textFieldFocus', { focused: true });
    }
});
document.addEventListener('focusout', function(e) {
    var tag = e.target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) {
        if (window.ankiBridge) window.ankiBridge.addMessage('textFieldFocus', { focused: false });
    }
});
```

Note: If `ankiBridge` is not injected into the reviewer webview, this reporter is a no-op (safe).

- [ ] **Step 3: Commit**

```bash
git add custom_reviewer/interactions.js
git commit -m "refactor: remove modifier key guard, add focus state reporters"
```

---

### Task 5: Add focus reporters and event handlers to React frontend

**Files:**
- Modify: `frontend/src/App.jsx` (add focus reporters, remove conflicting handlers)
- Modify: `shared/components/ChatInput.tsx` (add `data-chat-input` attr, handle `ankiSendMessage` + `ankiClearAndBlur`, remove auto-focus, remove global Space listener)

- [ ] **Step 1: Add focusin/focusout reporter as a useEffect in App.jsx**

Add near the other keyboard effects (around line 1700):

```javascript
// Report text field focus state to Python for global shortcut routing
useEffect(() => {
    const onFocusIn = (e) => {
        const tag = e.target.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) {
            window.ankiBridge?.addMessage('textFieldFocus', { focused: true });
        }
    };
    const onFocusOut = (e) => {
        const tag = e.target.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) {
            window.ankiBridge?.addMessage('textFieldFocus', { focused: false });
        }
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
        document.removeEventListener('focusin', onFocusIn);
        document.removeEventListener('focusout', onFocusOut);
    };
}, []);
```

- [ ] **Step 2: Remove conflicting bare ArrowLeft/Right handlers in App.jsx**

In the `handleKeyDown` effect at line 1588, remove the bare ArrowLeft/Right handling (lines 1591-1603). These are now routed via the filter to the reviewer's `interactions.js`. **Keep** the Cmd+ArrowUp/Down part. Note: This is a behavioral change — arrow keys will no longer navigate cards while typing in a text field (improvement: cursor movement works naturally in text fields now).

```javascript
const handleKeyDown = (e) => {
    // Skip all shortcuts if in input/textarea
    const tag = e.target.tagName.toLowerCase();
    if (tag === 'textarea' || tag === 'input' || e.target.isContentEditable) return;

    // ESC closes the chat panel
    if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
        return;
    }

    // Cmd+ArrowUp/Down: scroll between user messages
    if ((e.metaKey || e.ctrlKey) && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        // ... keep existing scroll logic unchanged ...
    }
};
```

- [ ] **Step 3: Update ChatInput.tsx — add `data-chat-input` attribute**

Add `data-chat-input` to the textarea element so `_focus_text_field()` can find it with a specific selector:
```tsx
<textarea
    ref={textareaRef}
    data-chat-input="true"
    // ... rest of props
/>
```

- [ ] **Step 4: Update ChatInput.tsx — add `ankiSendMessage` and `ankiClearAndBlur` listeners**

These events are dispatched by the Python filter. ChatInput handles them using React state (not raw DOM mutation):

```tsx
// Listen for global shortcut filter events
useEffect(() => {
    const handleSend = () => {
        if (input.trim()) {
            handleSubmit();
        }
    };
    const handleClearAndBlur = () => {
        setInput('');
        textareaRef.current?.blur();
    };
    window.addEventListener('ankiSendMessage', handleSend);
    window.addEventListener('ankiClearAndBlur', handleClearAndBlur);
    return () => {
        window.removeEventListener('ankiSendMessage', handleSend);
        window.removeEventListener('ankiClearAndBlur', handleClearAndBlur);
    };
}, [input, handleSubmit]);
```

- [ ] **Step 5: Update ChatInput.tsx — remove auto-focus on mount**

The auto-focus on mount (the `useEffect` with `textareaRef.current.focus()` and 200ms timer) would immediately set `_text_field_has_focus = True` and disable reviewer shortcuts. Remove it — the user uses Cmd+K to explicitly focus when they want to type.

- [ ] **Step 6: Update ChatInput.tsx — remove global Space keydown listener**

ChatInput has a global `keydown` listener that intercepts Space (when textarea is not focused) to call `actionPrimary.onClick()`. This conflicts with the filter which also forwards Space to the reviewer. Remove this global listener — the filter handles Space routing.

- [ ] **Step 7: Remove ChatInput.tsx's own Enter and Escape handlers from the textarea's onKeyDown**

Since the filter intercepts Enter and Escape at the Qt level before they reach the webview, ChatInput's own `onKeyDown` handler for these keys will never fire. **Keep** the handlers as a fallback (they're harmless and work when running in dev mode without Anki), but note that in production, Enter and Escape are handled by the filter dispatching `ankiSendMessage` and `ankiClearAndBlur` respectively.

- [ ] **Step 8: Build the frontend**

```bash
cd frontend && npm run build
```

- [ ] **Step 9: Commit**

```bash
git add frontend/src/App.jsx shared/components/ChatInput.tsx
git commit -m "feat: add focus reporters, shortcut event handlers, remove conflicting listeners"
```

---

### Task 6: Clean up `__init__.py` — remove old focus restoration hooks

**Files:**
- Modify: `__init__.py:521-524` (remove focus_reviewer_webview call)
- Modify: `__init__.py:730-737` (remove on_reviewer_did_show_answer focus hook)
- Modify: `__init__.py:172,180` (potentially remove import)

- [ ] **Step 1: Remove focus restoration from `on_reviewer_did_show_question`**

At line 521-524, change:
```python
# Before:
if config.get("use_custom_reviewer", True):
    hide_native_bottom_bar()
    # Force focus to webview so keyboard shortcuts work
    QTimer.singleShot(100, focus_reviewer_webview)

# After:
if config.get("use_custom_reviewer", True):
    hide_native_bottom_bar()
```

- [ ] **Step 2: Remove the `on_reviewer_did_show_answer` focus hook**

At lines 730-737, delete the entire block:
```python
# DELETE:
if hasattr(gui_hooks, 'reviewer_did_show_answer'):
    def on_reviewer_did_show_answer(card):
        config = mw.addonManager.getConfig(__name__) or {}
        if config.get("use_custom_reviewer", True):
            QTimer.singleShot(50, focus_reviewer_webview)
    gui_hooks.reviewer_did_show_answer.append(on_reviewer_did_show_answer)
    logger.info("... Hook: reviewer_did_show_answer registriert (refocus)")
```

- [ ] **Step 3: Check if `focus_reviewer_webview` is still used elsewhere**

If no other call sites remain in `__init__.py`, remove it from the import statement at lines 172/180. If it's still imported for use in other modules, keep the import.

- [ ] **Step 4: Commit**

```bash
git add __init__.py
git commit -m "refactor: remove timer-based focus restoration hooks (handled by shortcut filter)"
```

---

### Task 7: Simplify `ui/manager.py` — update docstring

**Files:**
- Modify: `ui/manager.py:200-209`

- [ ] **Step 1: Update the docstring of `focus_reviewer_webview()`**

```python
def focus_reviewer_webview():
    """Focus the reviewer webview for scroll and mouse interactions.

    Note: Keyboard shortcut routing is handled by GlobalShortcutFilter
    (ui/shortcut_filter.py). This function is only needed for non-keyboard
    focus scenarios (e.g. ensuring scroll wheel targets the reviewer).
    """
    try:
        if mw and hasattr(mw, 'reviewer') and mw.reviewer and hasattr(mw.reviewer, 'web'):
            web = mw.reviewer.web
            if web and hasattr(web, 'setFocus'):
                web.setFocus()
                web.page().runJavaScript('document.body.focus(); window.focus();')
    except Exception as e:
        logger.warning("Could not focus reviewer webview: %s", e)
```

- [ ] **Step 2: Commit**

```bash
git add ui/manager.py
git commit -m "docs: update focus_reviewer_webview docstring (shortcuts now handled by filter)"
```

---

### Task 8: Integration test — build and verify

- [ ] **Step 1: Build the frontend**

```bash
cd frontend && npm run build
```

- [ ] **Step 2: Run existing unit tests**

```bash
python3 run_tests.py -v
```

Expected: All existing tests pass.

- [ ] **Step 3: Manual testing checklist**

Test in Anki:

1. Open reviewer with a card
2. Verify Space shows answer, 1-4 rates, arrows navigate -- all without clicking the reviewer
3. Click into the chatbot panel (not on the text input) -- verify Space/Enter still control the reviewer
4. Press Cmd+K -- verify cursor appears in chat input
5. Type a message, press Enter -- verify message sends
6. Press Shift+Enter -- verify new line is inserted
7. Press Escape -- verify text field clears and shortcuts return to reviewer
8. Press Cmd+K again -- verify it toggles back to text field
9. Go to deck browser -- verify normal typing works, Cmd+K still toggles
10. Verify no double-firing of any shortcut

- [ ] **Step 4: Final commit with build output**

```bash
git add -A web/
git commit -m "build: rebuild frontend with focus state reporters"
```
