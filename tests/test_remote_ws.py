"""Tests for plusi/remote_ws.py — relay polling client."""
import sys
import types
import json
import threading

# ── Mock aqt before any import ──
_mock_mw = types.SimpleNamespace(
    state="review",
    reviewer=types.SimpleNamespace(
        card=types.SimpleNamespace(id=42),
        state="question",
    ),
    col=types.SimpleNamespace(
        decks=types.SimpleNamespace(current=lambda: {"name": "Anatomie"}),
        sched=types.SimpleNamespace(counts=lambda: (5, 3, 12)),
    ),
    taskman=types.SimpleNamespace(run_on_main=lambda fn: fn()),
)
if "aqt" not in sys.modules:
    aqt_mock = types.ModuleType("aqt")
    aqt_mock.mw = _mock_mw
    sys.modules["aqt"] = aqt_mock

import pytest


class TestRelayProtocol:
    """Test message building and parsing."""

    def test_build_card_state_message(self):
        from plusi.remote_ws import _build_card_state
        msg = _build_card_state(
            phase="question",
            front_html="<b>What is ATP?</b>",
            back_html="Adenosine triphosphate",
            deck="Biochemie",
            current=5,
            total=20,
            card_id=42,
        )
        assert msg["type"] == "card_state"
        assert msg["phase"] == "question"
        assert msg["front_html"] == "<b>What is ATP?</b>"
        assert msg["deck"] == "Biochemie"
        assert msg["progress"]["current"] == 5
        assert msg["progress"]["total"] == 20

    def test_build_card_state_with_mc(self):
        from plusi.remote_ws import _build_card_state
        mc = [{"id": "a", "text": "Mitochondrien"}, {"id": "b", "text": "Ribosomen"}]
        msg = _build_card_state(phase="question", front_html="X", back_html="Y",
                                deck="D", current=1, total=10, card_id=1, mc_options=mc)
        assert msg["mc_options"] == mc

    def test_parse_incoming_flip(self):
        from plusi.remote_ws import _parse_action
        action = _parse_action({"type": "flip"})
        assert action == ("flip", {})

    def test_parse_incoming_rate(self):
        from plusi.remote_ws import _parse_action
        action = _parse_action({"type": "rate", "ease": 3})
        assert action == ("rate", {"ease": 3})

    def test_parse_incoming_open_deck(self):
        from plusi.remote_ws import _parse_action
        action = _parse_action({"type": "open_deck", "deck_id": 1234})
        assert action == ("open_deck", {"deck_id": 1234})

    def test_parse_incoming_set_mode(self):
        from plusi.remote_ws import _parse_action
        action = _parse_action({"type": "set_mode", "mode": "duo"})
        assert action == ("set_mode", {"mode": "duo"})

    def test_parse_unknown_type_returns_none(self):
        from plusi.remote_ws import _parse_action
        action = _parse_action({"type": "bogus"})
        assert action is None

    def test_parse_missing_type_returns_none(self):
        from plusi.remote_ws import _parse_action
        action = _parse_action({})
        assert action is None


class TestRelayClient:
    """Test the RelayClient lifecycle."""

    def test_client_init_defaults(self):
        from plusi.remote_ws import RelayClient
        client = RelayClient(
            relay_url="https://example.com/api/relay",
            secret="test",
        )
        assert client.relay_url == "https://example.com/api/relay"
        assert client.pair_code is None
        assert client.session_token is None
        assert not client.is_connected
        assert client.mode == "duo"

    def test_client_set_mode(self):
        from plusi.remote_ws import RelayClient
        client = RelayClient("https://x.com/api/relay", "s")
        client.mode = "solo"
        assert client.mode == "solo"


class TestCreatePair:
    """Test _build_create_pair_payload."""

    def test_payload_action(self):
        from plusi.remote_ws import RelayClient
        client = RelayClient("https://x.com/api/relay", "mysecret")
        payload = client._build_create_pair_payload()
        assert payload["action"] == "create_pair"

    def test_payload_secret(self):
        from plusi.remote_ws import RelayClient
        client = RelayClient("https://x.com/api/relay", "mysecret")
        payload = client._build_create_pair_payload()
        assert payload["secret"] == "mysecret"

    def test_payload_no_extra_fields(self):
        from plusi.remote_ws import RelayClient
        client = RelayClient("https://x.com/api/relay", "s")
        payload = client._build_create_pair_payload()
        assert set(payload.keys()) == {"action", "secret"}


class TestActionHandler:
    """Test that _parse_action + handler wiring works for all Mini App actions."""

    def test_flip_action_parsed(self):
        from plusi.remote_ws import _parse_action
        assert _parse_action({"type": "flip"}) == ("flip", {})

    def test_rate_action_with_ease(self):
        from plusi.remote_ws import _parse_action
        assert _parse_action({"type": "rate", "ease": 4}) == ("rate", {"ease": 4})

    def test_open_deck_action(self):
        from plusi.remote_ws import _parse_action
        assert _parse_action({"type": "open_deck", "deck_id": 99}) == ("open_deck", {"deck_id": 99})

    def test_get_decks_action(self):
        from plusi.remote_ws import _parse_action
        assert _parse_action({"type": "get_decks"}) == ("get_decks", {})

    def test_set_mode_solo(self):
        from plusi.remote_ws import _parse_action
        assert _parse_action({"type": "set_mode", "mode": "solo"}) == ("set_mode", {"mode": "solo"})

    def test_mc_select_action(self):
        from plusi.remote_ws import _parse_action
        assert _parse_action({"type": "mc_select", "option_id": "a"}) == ("mc_select", {"option_id": "a"})


class TestRelayClientCallbacks:
    """Test that RelayClient routes messages to callbacks."""

    def test_peer_connected_callback(self):
        from plusi.remote_ws import RelayClient
        client = RelayClient("https://x.com/api/relay", "s")
        events = []
        client.set_peer_change_handler(lambda c: events.append(c))
        client._handle_message({"type": "peer_connected"})
        assert events == [True]
        assert client.is_peer_connected

    def test_peer_disconnected_callback(self):
        from plusi.remote_ws import RelayClient
        client = RelayClient("https://x.com/api/relay", "s")
        client._peer_connected = True
        events = []
        client.set_peer_change_handler(lambda c: events.append(c))
        client._handle_message({"type": "peer_disconnected"})
        assert events == [False]
        assert not client.is_peer_connected

    def test_action_callback(self):
        from plusi.remote_ws import RelayClient
        client = RelayClient("https://x.com/api/relay", "s")
        actions = []
        client.set_action_handler(lambda t, p: actions.append((t, p)))
        client._handle_message({"type": "rate", "ease": 2})
        assert actions == [("rate", {"ease": 2})]

    def test_unknown_message_no_callback(self):
        from plusi.remote_ws import RelayClient
        client = RelayClient("https://x.com/api/relay", "s")
        actions = []
        client.set_action_handler(lambda t, p: actions.append((t, p)))
        client._handle_message({"type": "bogus_xyz"})
        assert actions == []

    def test_pair_created_handler(self):
        from plusi.remote_ws import RelayClient
        client = RelayClient("https://x.com/api/relay", "s")
        codes = []
        client.set_pair_created_handler(lambda code: codes.append(code))
        # Simulate the callback being fired
        client._on_pair_created("ABC123")
        assert codes == ["ABC123"]
