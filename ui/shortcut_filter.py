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
        """Cmd+K handler: focus the text field visible on the current screen."""
        if self._text_field_has_focus:
            self._defocus_text_field()
        elif self._has_visible_text_field():
            self._focus_text_field()
        else:
            # No chat panel visible — try focusing the search bar in the main webview
            # (e.g. deck browser's "Stelle eine Frage..." input)
            self._focus_main_webview_input()

    def _is_focus_in_main_webview(self):
        """Check if Qt focus is on the main Anki webview (deck browser, overview)."""
        try:
            focused = QApplication.focusWidget()
            if focused and mw and hasattr(mw, 'web') and mw.web:
                return focused is mw.web or mw.web.isAncestorOf(focused)
        except Exception:
            pass
        return False

    def _focus_main_webview_input(self):
        """Toggle focus on the search/input bar in the main Anki webview."""
        try:
            if not (mw and hasattr(mw, 'web') and mw.web):
                return
            if self._is_focus_in_main_webview():
                # Already focused in main webview — defocus (toggle off)
                mw.web.page().runJavaScript(
                    "document.activeElement?.blur(); document.body.focus();"
                )
                # Move Qt focus away from the webview
                mw.setFocus()
            else:
                # Focus the input field (toggle on)
                mw.web.setFocus()
                mw.web.page().runJavaScript(
                    "document.querySelector('input[type=text], input[type=search], "
                    "[data-chat-input], textarea')?.focus();"
                )
        except Exception as e:
            logger.warning("Could not toggle main webview input: %s", e)

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
            if self._focused_webview:
                self._focused_webview.page().runJavaScript(
                    "document.activeElement?.blur(); document.body.focus();"
                )
            from .setup import get_chatbot_widget
            widget = get_chatbot_widget()
            if widget and widget.web_view:
                widget.web_view.page().runJavaScript(
                    "document.activeElement?.blur(); document.body.focus();"
                )
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

        if len(key) == 1 and key.isalpha():
            if event.modifiers() & Qt.KeyboardModifier.ShiftModifier:
                key = key.upper()

        shift = 'true' if event.modifiers() & Qt.KeyboardModifier.ShiftModifier else 'false'
        ctrl = 'true' if event.modifiers() & Qt.KeyboardModifier.ControlModifier else 'false'
        meta = 'true' if event.modifiers() & Qt.KeyboardModifier.MetaModifier else 'false'

        js = (
            f"document.body.dispatchEvent(new KeyboardEvent('keydown', {{"
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
            return True

        # --- Cmd+Z: Always forward to reviewer (undo card) ---
        if (event.key() == Qt.Key.Key_Z and
                event.modifiers() & (Qt.KeyboardModifier.ControlModifier | Qt.KeyboardModifier.MetaModifier)):
            if not self._text_field_has_focus and self._is_reviewer_active():
                self._forward_to_reviewer(event)
                return True
            return super().eventFilter(obj, event)

        # --- Text field has focus: handle special keys, pass through rest ---
        text_field_active = self._text_field_has_focus
        if self._is_focus_in_reviewer():
            text_field_active = False

        if text_field_active:
            if event.key() == Qt.Key.Key_Escape:
                self._clear_and_defocus_text_field()
                return True

            if event.key() in (Qt.Key.Key_Return, Qt.Key.Key_Enter):
                if event.modifiers() & Qt.KeyboardModifier.ShiftModifier:
                    return super().eventFilter(obj, event)
                self._send_chat_message()
                return True

            return super().eventFilter(obj, event)

        # --- No text field focused: forward reviewer shortcuts ---
        if not self._is_reviewer_active():
            return super().eventFilter(obj, event)

        if event.modifiers() & (Qt.KeyboardModifier.ControlModifier | Qt.KeyboardModifier.MetaModifier | Qt.KeyboardModifier.AltModifier):
            return super().eventFilter(obj, event)

        qt_key = event.key()
        if qt_key in QT_KEY_TO_JS:
            if self._forward_to_reviewer(event):
                return True

        return super().eventFilter(obj, event)


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
