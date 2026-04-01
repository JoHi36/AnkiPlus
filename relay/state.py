"""Hook-based state broadcasting to PWA.

Subscribes to Anki gui_hooks and sends card_state / anki_state
messages whenever the reviewer state changes.
"""

import json

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)

_STATE_MAP = {
    "review": "reviewing",
    "overview": "browsing",
    "deckBrowser": "browsing",
}


def _map_anki_state(state_str):
    """Map Anki state string to simplified PWA state."""
    return _STATE_MAP.get(state_str, "idle")


class AnkiStateReporter:
    """Subscribes to Anki hooks, broadcasts state changes to PWA."""

    def __init__(self, client):
        self.client = client
        self._hooks_registered = False

    def register_hooks(self):
        if self._hooks_registered:
            return
        try:
            from aqt import gui_hooks
            if hasattr(gui_hooks, 'reviewer_did_show_question'):
                gui_hooks.reviewer_did_show_question.append(self._on_show_question)
            if hasattr(gui_hooks, 'state_will_change'):
                gui_hooks.state_will_change.append(self._on_state_change)
            self._hooks_registered = True
            logger.info("relay.state: hooks registered")
        except Exception as exc:
            logger.error("relay.state: failed to register hooks: %s", exc)

    def unregister_hooks(self):
        if not self._hooks_registered:
            return
        try:
            from aqt import gui_hooks
            if hasattr(gui_hooks, 'reviewer_did_show_question'):
                try:
                    gui_hooks.reviewer_did_show_question.remove(self._on_show_question)
                except ValueError:
                    pass
            if hasattr(gui_hooks, 'state_will_change'):
                try:
                    gui_hooks.state_will_change.remove(self._on_state_change)
                except ValueError:
                    pass
            self._hooks_registered = False
            logger.info("relay.state: hooks unregistered")
        except Exception as exc:
            logger.error("relay.state: failed to unregister hooks: %s", exc)

    def _on_show_question(self, card):
        if not self.client.is_peer_connected:
            return
        try:
            from .actions import build_card_state_from_reviewer
            state = build_card_state_from_reviewer(phase="question")
            if state:
                self.client.send(state)
        except Exception as exc:
            logger.error("relay.state: _on_show_question error: %s", exc)

    def _on_state_change(self, new_state, old_state):
        if not self.client.is_peer_connected:
            return
        try:
            mapped = _map_anki_state(new_state)
            self.client.send({"type": "anki_state", "state": mapped})
            logger.debug("relay.state: anki_state=%s (was %s)", mapped, old_state)
        except Exception as exc:
            logger.error("relay.state: _on_state_change error: %s", exc)

    def notify_desktop(self, connected):
        """Send remoteConnected/remoteDisconnected to desktop React app."""
        try:
            from .actions import _run_on_main

            def _fn():
                try:
                    from ..ui.main_view import get_main_view
                except ImportError:
                    from ui.main_view import get_main_view
                view = get_main_view()
                if view and hasattr(view, '_chatbot') and view._chatbot:
                    wv = view._chatbot.web_view
                    if wv:
                        payload = json.dumps({
                            "type": "remoteConnected" if connected else "remoteDisconnected",
                            "data": {"connected": connected}
                        })
                        wv.page().runJavaScript(
                            f"window.ankiReceive && window.ankiReceive({payload});"
                        )
            _run_on_main(_fn)
        except Exception as exc:
            logger.debug("relay.state: notify_desktop error: %s", exc)
