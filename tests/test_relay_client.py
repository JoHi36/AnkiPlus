"""Tests for relay/client.py — thread-safe RelayClient."""

import sys
import types
import threading
import time

# ── Mock aqt before any import ──
if "aqt" not in sys.modules:
    aqt_mock = types.ModuleType("aqt")
    aqt_mock.mw = None
    sys.modules["aqt"] = aqt_mock

import urllib.error

import pytest
from unittest.mock import patch, MagicMock


# =========================================================================
# Init & properties
# =========================================================================

class TestRelayClientInit:
    """Test constructor defaults and basic properties."""

    def test_defaults(self):
        from relay.client import RelayClient
        c = RelayClient("https://relay.example.com/api", "secret123", uid="u1")
        assert c.relay_url == "https://relay.example.com/api"
        assert c.secret == "secret123"
        assert c.uid == "u1"
        assert c.pair_code is None
        assert c.session_token is None
        assert c.mode == "duo"
        assert not c.is_connected
        assert not c.is_peer_connected
        assert c._action_handler is None
        assert c._on_peer_change is None

    def test_default_uid_empty(self):
        from relay.client import RelayClient
        c = RelayClient("https://x.com/api", "s")
        assert c.uid == ""

    def test_set_mode(self):
        from relay.client import RelayClient
        c = RelayClient("https://x.com/api", "s")
        c.mode = "solo"
        assert c.mode == "solo"

    def test_set_action_handler(self):
        from relay.client import RelayClient
        c = RelayClient("https://x.com/api", "s")
        handler = lambda t, p: None
        c.set_action_handler(handler)
        assert c._action_handler is handler

    def test_set_peer_change_handler(self):
        from relay.client import RelayClient
        c = RelayClient("https://x.com/api", "s")
        handler = lambda connected: None
        c.set_peer_change_handler(handler)
        assert c._on_peer_change is handler


# =========================================================================
# create_pair
# =========================================================================

class TestCreatePair:
    """Test pair creation via relay."""

    @patch("relay.client._relay_post")
    def test_success(self, mock_post):
        from relay.client import RelayClient
        mock_post.return_value = {
            "ok": True,
            "pair_code": "ABC123",
            "session_token": "tok_xyz",
            "peer_connected": False,
        }
        c = RelayClient("https://x.com/api", "s", uid="u1")
        code = c.create_pair()

        assert code == "ABC123"
        assert c.pair_code == "ABC123"
        assert c.session_token == "tok_xyz"
        assert c.is_connected
        assert not c.is_peer_connected

        # Verify the POST payload
        mock_post.assert_called_once()
        payload = mock_post.call_args[0][1]
        assert payload["action"] == "create_pair"
        assert payload["secret"] == "s"
        assert payload["uid"] == "u1"

    @patch("relay.client._relay_post")
    def test_success_with_peer_connected(self, mock_post):
        from relay.client import RelayClient
        mock_post.return_value = {
            "ok": True,
            "pair_code": "XYZ",
            "session_token": "tok",
            "peer_connected": True,
        }
        c = RelayClient("https://x.com/api", "s")
        code = c.create_pair()
        assert code == "XYZ"
        assert c.is_peer_connected

    @patch("relay.client._relay_post")
    def test_failure_ok_false(self, mock_post):
        from relay.client import RelayClient
        mock_post.return_value = {"ok": False}
        c = RelayClient("https://x.com/api", "s")
        code = c.create_pair()
        assert code is None
        assert not c.is_connected

    @patch("relay.client._relay_post")
    def test_failure_network_error(self, mock_post):
        from relay.client import RelayClient
        mock_post.return_value = None
        c = RelayClient("https://x.com/api", "s")
        code = c.create_pair()
        assert code is None
        assert c.pair_code is None
        assert c.session_token is None
        assert not c.is_connected

    @patch("relay.client._relay_post")
    def test_failure_missing_pair_code(self, mock_post):
        from relay.client import RelayClient
        mock_post.return_value = {"ok": True, "session_token": "tok"}
        c = RelayClient("https://x.com/api", "s")
        code = c.create_pair()
        assert code is None

    @patch("relay.client._relay_post")
    def test_failure_missing_session_token(self, mock_post):
        from relay.client import RelayClient
        mock_post.return_value = {"ok": True, "pair_code": "ABC"}
        c = RelayClient("https://x.com/api", "s")
        code = c.create_pair()
        assert code is None


# =========================================================================
# reconnect
# =========================================================================

class TestReconnect:
    """Test session reconnection."""

    @patch("relay.client._relay_post")
    def test_success(self, mock_post):
        from relay.client import RelayClient
        mock_post.return_value = {"ok": True, "peer_connected": True}
        c = RelayClient("https://x.com/api", "s")
        result = c.reconnect("tok_abc")

        assert result is True
        assert c.session_token == "tok_abc"
        assert c.is_connected
        assert c.is_peer_connected

    @patch("relay.client._relay_post")
    def test_success_no_peer(self, mock_post):
        from relay.client import RelayClient
        mock_post.return_value = {"ok": True, "peer_connected": False}
        c = RelayClient("https://x.com/api", "s")
        result = c.reconnect("tok_abc")

        assert result is True
        assert not c.is_peer_connected

    @patch("relay.client._relay_post")
    def test_failure_clears_token(self, mock_post):
        from relay.client import RelayClient
        mock_post.return_value = {"ok": False}
        c = RelayClient("https://x.com/api", "s")
        c.session_token = "old_tok"
        result = c.reconnect("bad_tok")

        assert result is False
        assert c.session_token is None
        assert not c.is_connected

    @patch("relay.client._relay_post")
    def test_failure_network_error(self, mock_post):
        from relay.client import RelayClient
        mock_post.return_value = None
        c = RelayClient("https://x.com/api", "s")
        result = c.reconnect("tok")

        assert result is False
        assert c.session_token is None


# =========================================================================
# _handle_message
# =========================================================================

class TestHandleMessage:
    """Test message routing to callbacks.

    dispatch_on_main is patched to run immediately (no Qt needed).
    """

    def _make_client(self):
        from relay.client import RelayClient
        c = RelayClient("https://x.com/api", "s")
        # Bypass Qt dispatch — run callbacks synchronously
        c.dispatch_on_main = lambda fn: fn()
        return c

    def test_peer_connected_callback(self):
        c = self._make_client()
        events = []
        c.set_peer_change_handler(lambda connected: events.append(connected))
        c._handle_message({"type": "peer_connected"})
        assert events == [True]
        assert c.is_peer_connected

    def test_peer_disconnected_callback(self):
        c = self._make_client()
        c._peer_connected = True
        events = []
        c.set_peer_change_handler(lambda connected: events.append(connected))
        c._handle_message({"type": "peer_disconnected"})
        assert events == [False]
        assert not c.is_peer_connected

    def test_peer_connected_no_handler(self):
        """No handler set — should not crash."""
        c = self._make_client()
        c._handle_message({"type": "peer_connected"})
        assert c.is_peer_connected

    def test_peer_disconnected_no_handler(self):
        """No handler set — should not crash."""
        c = self._make_client()
        c._peer_connected = True
        c._handle_message({"type": "peer_disconnected"})
        assert not c.is_peer_connected

    def test_action_dispatched(self):
        c = self._make_client()
        actions = []
        c.set_action_handler(lambda t, p: actions.append((t, p)))
        c._handle_message({"type": "rate", "ease": 2})
        assert actions == [("rate", {"ease": 2})]

    def test_action_flip(self):
        c = self._make_client()
        actions = []
        c.set_action_handler(lambda t, p: actions.append((t, p)))
        c._handle_message({"type": "flip"})
        assert actions == [("flip", {})]

    def test_action_open_deck(self):
        c = self._make_client()
        actions = []
        c.set_action_handler(lambda t, p: actions.append((t, p)))
        c._handle_message({"type": "open_deck", "deck_id": 42})
        assert actions == [("open_deck", {"deck_id": 42})]

    def test_unknown_message_ignored(self):
        c = self._make_client()
        actions = []
        c.set_action_handler(lambda t, p: actions.append((t, p)))
        c._handle_message({"type": "totally_unknown_xyz"})
        assert actions == []

    def test_empty_type_ignored(self):
        c = self._make_client()
        actions = []
        c.set_action_handler(lambda t, p: actions.append((t, p)))
        c._handle_message({"type": ""})
        assert actions == []

    def test_no_action_handler_no_crash(self):
        """Action message with no handler set — should not crash."""
        c = self._make_client()
        c._handle_message({"type": "flip"})
        # No assertion needed — just verifying no exception

    def test_multiple_messages(self):
        """Multiple sequential messages all dispatched correctly."""
        c = self._make_client()
        actions = []
        c.set_action_handler(lambda t, p: actions.append((t, p)))
        c._handle_message({"type": "flip"})
        c._handle_message({"type": "rate", "ease": 3})
        c._handle_message({"type": "get_decks"})
        assert len(actions) == 3
        assert actions[0] == ("flip", {})
        assert actions[1] == ("rate", {"ease": 3})
        assert actions[2] == ("get_decks", {})


# =========================================================================
# send
# =========================================================================

class TestSend:
    """Test fire-and-forget message sending."""

    @patch("relay.client._relay_post")
    def test_send_when_connected(self, mock_post):
        from relay.client import RelayClient
        c = RelayClient("https://x.com/api", "s")
        c._connected = True
        c.session_token = "tok_abc"

        c.send({"type": "card_state", "phase": "question"})
        # The send spawns a daemon thread — give it time to run
        time.sleep(0.1)

        mock_post.assert_called_once()
        url, payload = mock_post.call_args[0]
        assert url == "https://x.com/api"
        assert payload["action"] == "send"
        assert payload["session_token"] == "tok_abc"
        assert payload["secret"] == "s"
        assert payload["message"] == {"type": "card_state", "phase": "question"}

    @patch("relay.client._relay_post")
    def test_send_when_disconnected_noop(self, mock_post):
        from relay.client import RelayClient
        c = RelayClient("https://x.com/api", "s")
        c._connected = False
        c.send({"type": "card_state"})
        time.sleep(0.05)
        mock_post.assert_not_called()

    @patch("relay.client._relay_post")
    def test_send_without_session_token_noop(self, mock_post):
        from relay.client import RelayClient
        c = RelayClient("https://x.com/api", "s")
        c._connected = True
        c.session_token = None
        c.send({"type": "card_state"})
        time.sleep(0.05)
        mock_post.assert_not_called()


# =========================================================================
# stop
# =========================================================================

class TestStop:
    """Test client shutdown."""

    @patch("relay.client._relay_post")
    def test_stop_sends_disconnect(self, mock_post):
        from relay.client import RelayClient
        c = RelayClient("https://x.com/api", "s")
        c._connected = True
        c.session_token = "tok"
        c.dispatch_on_main = lambda fn: fn()

        c.stop()

        assert not c.is_connected
        assert c.pair_code is None
        assert c.session_token is None
        mock_post.assert_called_once()
        payload = mock_post.call_args[0][1]
        assert payload["action"] == "disconnect"

    @patch("relay.client._relay_post")
    def test_stop_notifies_peer_disconnect(self, mock_post):
        from relay.client import RelayClient
        c = RelayClient("https://x.com/api", "s")
        c._connected = True
        c._peer_connected = True
        c.session_token = "tok"
        c.dispatch_on_main = lambda fn: fn()

        events = []
        c.set_peer_change_handler(lambda connected: events.append(connected))
        c.stop()

        assert events == [False]
        assert not c.is_peer_connected

    @patch("relay.client._relay_post")
    def test_stop_no_peer_no_notification(self, mock_post):
        from relay.client import RelayClient
        c = RelayClient("https://x.com/api", "s")
        c._connected = True
        c._peer_connected = False
        c.session_token = "tok"
        c.dispatch_on_main = lambda fn: fn()

        events = []
        c.set_peer_change_handler(lambda connected: events.append(connected))
        c.stop()

        assert events == []

    @patch("relay.client._relay_post")
    def test_stop_without_session_token(self, mock_post):
        """Stop when no session_token — should not POST disconnect."""
        from relay.client import RelayClient
        c = RelayClient("https://x.com/api", "s")
        c._connected = True
        c.session_token = None
        c.dispatch_on_main = lambda fn: fn()
        c.stop()
        mock_post.assert_not_called()


# =========================================================================
# dispatch_on_main fallback
# =========================================================================

class TestDispatchOnMain:
    """Test the QTimer fallback path."""

    def test_fallback_direct_call(self):
        """When QTimer.singleShot raises, dispatch_on_main falls back to direct call."""
        from relay.client import RelayClient
        results = []
        # Force the fallback path by making PyQt6 import fail
        with patch.dict(sys.modules, {"PyQt6": None, "PyQt6.QtCore": None}):
            RelayClient.dispatch_on_main(lambda: results.append(42))
        assert results == [42]


# =========================================================================
# _relay_post (module-level function)
# =========================================================================

class TestRelayPost:
    """Test the HTTP helper function."""

    @patch("relay.client.urllib.request.urlopen")
    def test_success(self, mock_urlopen):
        from relay.client import _relay_post
        mock_resp = MagicMock()
        mock_resp.read.return_value = b'{"ok": true}'
        mock_resp.__enter__ = lambda s: mock_resp
        mock_resp.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_resp

        result = _relay_post("https://x.com/api", {"action": "poll"})
        assert result == {"ok": True}

    @patch("relay.client.urllib.request.urlopen")
    def test_url_error(self, mock_urlopen):
        from relay.client import _relay_post
        mock_urlopen.side_effect = urllib.error.URLError("Connection refused")
        result = _relay_post("https://x.com/api", {"action": "poll"})
        assert result is None

    @patch("relay.client.urllib.request.urlopen")
    def test_timeout_error(self, mock_urlopen):
        from relay.client import _relay_post
        mock_urlopen.side_effect = TimeoutError("timed out")
        result = _relay_post("https://x.com/api", {"action": "poll"})
        assert result is None

    @patch("relay.client.urllib.request.urlopen")
    def test_unexpected_error(self, mock_urlopen):
        from relay.client import _relay_post
        mock_urlopen.side_effect = RuntimeError("boom")
        result = _relay_post("https://x.com/api", {"action": "poll"})
        assert result is None
