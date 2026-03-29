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
except ImportError:
    try:
        from PyQt5.QtWebEngineWidgets import QWebEngineView
    except ImportError:
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
        self._main_view_active = False
        self._voice_recording = False

    def set_main_view_active(self, active):
        """Called by MainViewWidget on show/hide."""
        self._main_view_active = active

    def set_text_field_focus(self, focused, webview=None):
        """Called by widget.py when a textFieldFocus message is received."""
        self._text_field_has_focus = focused
        self._focused_webview = webview if focused else None

    def _is_reviewer_active(self):
        """Check if we're in review state."""
        try:
            return (mw and hasattr(mw, 'state') and mw.state == 'review'
                    and mw.reviewer and mw.reviewer.web)
        except (AttributeError, RuntimeError):
            return False

    def _get_reviewer_web(self):
        """Get the reviewer's QWebEngineView."""
        try:
            if self._is_reviewer_active():
                return mw.reviewer.web
        except (AttributeError, RuntimeError):
            pass
        return None

    def _is_focus_in_reviewer(self):
        """Check if Qt focus is on the reviewer webview (synchronous, no polling lag)."""
        try:
            focused = QApplication.focusWidget()
            reviewer_web = self._get_reviewer_web()
            if focused and reviewer_web:
                return focused is reviewer_web or reviewer_web.isAncestorOf(focused)
        except (AttributeError, RuntimeError):
            pass
        return False

    def _has_visible_text_field(self):
        """Check if any panel with a text field is visible on screen."""
        try:
            from .setup import get_chatbot_widget
            widget = get_chatbot_widget()
            if widget and widget.isVisible():
                return True
        except (ImportError, AttributeError, RuntimeError):
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
        except (AttributeError, RuntimeError):
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
        except (AttributeError, RuntimeError) as e:
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
        except (AttributeError, RuntimeError) as e:
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
        except (AttributeError, RuntimeError) as e:
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
        except (AttributeError, RuntimeError) as e:
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
        except (AttributeError, RuntimeError) as e:
            logger.warning("Could not send chat message: %s", e)

    def _forward_to_reviewer(self, event):
        """Forward a key event as a synthetic JS KeyboardEvent to the reviewer."""
        reviewer_web = self._get_reviewer_web()
        if not reviewer_web:
            logger.debug("FORWARD: no reviewer_web")
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

        js = f"if(window.handleKey) window.handleKey('{key}', '{code}');"
        reviewer_web.page().runJavaScript(js)
        return True

    def _dispatch_voice_event(self, event_name):
        """Dispatch a voice event to the React webview."""
        try:
            from .main_view import get_main_view
            mv = get_main_view()
            if mv._chatbot and mv._chatbot.web_view:
                js = f"window.dispatchEvent(new CustomEvent('{event_name}'));"
                mv._chatbot.web_view.page().runJavaScript(js)
        except (ImportError, AttributeError, RuntimeError) as e:
            logger.warning("Could not dispatch voice event %s: %s", event_name, e)

    def eventFilter(self, obj, event):
        """Main event filter -- intercepts all KeyPress events."""
        # --- Option key (Alt): hold-to-record for Plusi voice ---
        if event.type() == QEvent.Type.KeyRelease and event.key() == Qt.Key.Key_Alt:
            if self._voice_recording:
                self._voice_recording = False
                self._dispatch_voice_event('plusiVoiceStop')
                return True
            return super().eventFilter(obj, event)

        if event.type() != QEvent.Type.KeyPress:
            return super().eventFilter(obj, event)

        # --- Option (Alt) key alone: start Plusi voice recording ---
        if (event.key() == Qt.Key.Key_Alt and
                not event.modifiers() & (Qt.KeyboardModifier.ControlModifier | Qt.KeyboardModifier.MetaModifier) and
                not self._text_field_has_focus and
                not self._voice_recording and
                not event.isAutoRepeat()):
            self._voice_recording = True
            self._dispatch_voice_event('plusiVoiceStart')
            return True

        # --- Cmd+K: Always handle (toggle text field focus) ---
        if (event.key() == Qt.Key.Key_K and
                event.modifiers() & (Qt.KeyboardModifier.ControlModifier | Qt.KeyboardModifier.MetaModifier)):
            self._toggle_text_field_focus()
            return True

        # --- Cmd+I: Toggle AnkiPlus ON/OFF (show/hide MainViewWidget overlay) ---
        if (event.key() == Qt.Key.Key_I and
                event.modifiers() & (Qt.KeyboardModifier.ControlModifier | Qt.KeyboardModifier.MetaModifier)):
            try:
                from .main_view import get_main_view
                mv = get_main_view()
                if mv._visible:
                    mv._hide()
                    logger.info("AnkiPlus OFF (Cmd+I)")
                else:
                    from aqt import mw
                    state = mw.state if mw else 'deckBrowser'
                    mv.show_for_state(state)
                    logger.info("AnkiPlus ON (Cmd+I)")
            except (ImportError, AttributeError, RuntimeError) as e:
                logger.warning("Could not toggle AnkiPlus: %s", e)
            return True

        # When MainViewWidget is active, forward keys directly to React webview
        # (Qt focus might be on mw.web, so we can't rely on normal event dispatch)
        if self._main_view_active:
            qt_key = event.key()
            mapping = QT_KEY_TO_JS.get(qt_key)
            if mapping and not self._text_field_has_focus:
                code, key = mapping
                try:
                    from .main_view import get_main_view
                    mv = get_main_view()
                    if mv._chatbot and mv._chatbot.web_view:
                        js = "window.dispatchEvent(new KeyboardEvent('keydown', {key: '%s', code: '%s', bubbles: true}));" % (key, code)
                        mv._chatbot.web_view.page().runJavaScript(js)
                        return True  # Consume event — don't let mw.web see it
                except (ImportError, AttributeError, RuntimeError):
                    pass
            return super().eventFilter(obj, event)

        # --- Cmd+Z: Always forward to reviewer (undo card) ---
        if (event.key() == Qt.Key.Key_Z and
                event.modifiers() & (Qt.KeyboardModifier.ControlModifier | Qt.KeyboardModifier.MetaModifier)):
            if not self._text_field_has_focus and self._is_reviewer_active():
                self._forward_to_reviewer(event)
                return True
            return super().eventFilter(obj, event)

        # --- Text field has focus: handle special keys, pass through rest ---
        text_field_active = self._text_field_has_focus
        focus_in_reviewer = self._is_focus_in_reviewer()
        if focus_in_reviewer:
            text_field_active = False

        # In review state: arrow keys and number keys always go to the reviewer,
        # even if a chat text field has focus (these aren't needed for typing).
        # Space and Enter stay with the text field (space = type, enter = send).
        # User presses Escape to exit text field, then Space/Enter go to reviewer.
        if text_field_active and self._is_reviewer_active():
            always_reviewer_keys = {
                Qt.Key.Key_Left, Qt.Key.Key_Right,
                Qt.Key.Key_1, Qt.Key.Key_2, Qt.Key.Key_3, Qt.Key.Key_4, Qt.Key.Key_5,
            }
            if event.key() in always_reviewer_keys:
                text_field_active = False

        # DEBUG: Log shortcut routing for Space/Enter/Escape (temporary)
        if event.key() in (Qt.Key.Key_Space, Qt.Key.Key_Return, Qt.Key.Key_Enter, Qt.Key.Key_Escape):
            focused_widget = QApplication.focusWidget()
            logger.debug(
                "SHORTCUT key=%s text_field_flag=%s text_field_active=%s "
                "focus_in_reviewer=%s reviewer_active=%s focused_widget=%s",
                event.key(), self._text_field_has_focus, text_field_active,
                focus_in_reviewer, self._is_reviewer_active(),
                type(focused_widget).__name__ if focused_widget else 'None'
            )

        if text_field_active:
            if event.key() == Qt.Key.Key_Escape:
                self._clear_and_defocus_text_field()
                return True

            if event.key() in (Qt.Key.Key_Return, Qt.Key.Key_Enter):
                if event.modifiers() & Qt.KeyboardModifier.ShiftModifier:
                    return super().eventFilter(obj, event)
                self._send_chat_message()
                return True

            # Tab: pass through to WebView for ghost autocomplete
            if event.key() == Qt.Key.Key_Tab:
                return False  # Let the event propagate to the WebView

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
