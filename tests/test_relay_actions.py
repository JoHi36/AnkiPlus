"""Tests for relay/actions.py — card operations for PWA remote control."""

import sys
import types

# ── Mock aqt before any import ──
if "aqt" not in sys.modules:
    aqt_mock = types.ModuleType("aqt")
    aqt_mock.mw = None
    sys.modules["aqt"] = aqt_mock

import pytest


# =========================================================================
# build_card_state
# =========================================================================

class TestBuildCardState:
    """Test the card_state message builder."""

    def test_basic(self):
        from relay.actions import build_card_state
        msg = build_card_state(
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
        assert msg["back_html"] == "Adenosine triphosphate"
        assert msg["deck"] == "Biochemie"
        assert msg["progress"]["current"] == 5
        assert msg["progress"]["total"] == 20
        assert msg["card_id"] == 42
        assert "mc_options" not in msg

    def test_with_mc_options(self):
        from relay.actions import build_card_state
        mc = [{"id": "a", "text": "Mitochondrien"}, {"id": "b", "text": "Ribosomen"}]
        msg = build_card_state(
            phase="question", front_html="X", back_html="Y",
            deck="D", current=1, total=10, card_id=1, mc_options=mc,
        )
        assert msg["mc_options"] == mc
        assert len(msg["mc_options"]) == 2

    def test_no_card_zeroes(self):
        """Build card_state with zero progress (no cards reviewed)."""
        from relay.actions import build_card_state
        msg = build_card_state(
            phase="question", front_html="", back_html="",
            deck="Empty", current=0, total=0, card_id=0,
        )
        assert msg["progress"]["current"] == 0
        assert msg["progress"]["total"] == 0
        assert msg["card_id"] == 0
        assert msg["front_html"] == ""

    def test_answer_phase(self):
        from relay.actions import build_card_state
        msg = build_card_state(
            phase="answer", front_html="Q", back_html="A",
            deck="Test", current=3, total=7, card_id=99,
        )
        assert msg["phase"] == "answer"

    def test_empty_mc_options_not_included(self):
        """Empty list is falsy, so mc_options should NOT be in message."""
        from relay.actions import build_card_state
        msg = build_card_state(
            phase="question", front_html="Q", back_html="A",
            deck="D", current=0, total=0, card_id=1, mc_options=[],
        )
        assert "mc_options" not in msg

    def test_none_mc_options_not_included(self):
        from relay.actions import build_card_state
        msg = build_card_state(
            phase="question", front_html="Q", back_html="A",
            deck="D", current=0, total=0, card_id=1, mc_options=None,
        )
        assert "mc_options" not in msg


# =========================================================================
# parse_action
# =========================================================================

class TestParseAction:
    """Test incoming action message parsing."""

    def test_flip(self):
        from relay.actions import parse_action
        assert parse_action({"type": "flip"}) == ("flip", {})

    def test_rate(self):
        from relay.actions import parse_action
        assert parse_action({"type": "rate", "ease": 3}) == ("rate", {"ease": 3})

    def test_rate_ease_4(self):
        from relay.actions import parse_action
        assert parse_action({"type": "rate", "ease": 4}) == ("rate", {"ease": 4})

    def test_mc_select(self):
        from relay.actions import parse_action
        assert parse_action({"type": "mc_select", "option_id": "a"}) == (
            "mc_select", {"option_id": "a"},
        )

    def test_open_deck(self):
        from relay.actions import parse_action
        assert parse_action({"type": "open_deck", "deck_id": 1234}) == (
            "open_deck", {"deck_id": 1234},
        )

    def test_set_mode(self):
        from relay.actions import parse_action
        assert parse_action({"type": "set_mode", "mode": "solo"}) == (
            "set_mode", {"mode": "solo"},
        )

    def test_get_decks(self):
        from relay.actions import parse_action
        assert parse_action({"type": "get_decks"}) == ("get_decks", {})

    def test_unknown_type_returns_none(self):
        from relay.actions import parse_action
        assert parse_action({"type": "bogus"}) is None

    def test_missing_type_returns_none(self):
        from relay.actions import parse_action
        assert parse_action({}) is None

    def test_empty_string_type_returns_none(self):
        from relay.actions import parse_action
        assert parse_action({"type": ""}) is None

    def test_extra_keys_ignored(self):
        """Unknown extra keys in the message should be ignored."""
        from relay.actions import parse_action
        result = parse_action({"type": "flip", "extra": "junk", "foo": 42})
        assert result == ("flip", {})

    def test_missing_param_key_omitted(self):
        """If a known param key is missing from the message, it's just absent."""
        from relay.actions import parse_action
        result = parse_action({"type": "rate"})
        assert result == ("rate", {})


# =========================================================================
# handle_action
# =========================================================================

class TestHandleAction:
    """Test action routing (set_mode + unknown action — no Anki needed)."""

    def _make_client(self):
        """Create a minimal mock client with .send() and .mode."""
        sent = []
        client = types.SimpleNamespace(
            mode="duo",
            send=lambda msg: sent.append(msg),
        )
        return client, sent

    def test_set_mode_updates_client(self):
        from relay.actions import handle_action
        client, _sent = self._make_client()
        assert client.mode == "duo"
        result = handle_action(client, "set_mode", {"mode": "solo"})
        assert client.mode == "solo"
        assert result == {"mode": "solo"}

    def test_set_mode_default_duo(self):
        from relay.actions import handle_action
        client, _ = self._make_client()
        client.mode = "solo"
        handle_action(client, "set_mode", {})
        assert client.mode == "duo"

    def test_unknown_action_no_crash(self):
        from relay.actions import handle_action
        client, _ = self._make_client()
        result = handle_action(client, "totally_unknown", {})
        assert result is None

    def test_open_deck_missing_id_no_crash(self):
        from relay.actions import handle_action
        client, _ = self._make_client()
        result = handle_action(client, "open_deck", {})
        assert result is None


# =========================================================================
# _flatten_tree
# =========================================================================

class TestFlattenTree:
    """Test the DeckTreeNode flattening helper."""

    def test_single_node(self):
        from relay.actions import _flatten_tree
        node = types.SimpleNamespace(deck_id=1, name="Root", children=[])
        flat = _flatten_tree(node)
        assert len(flat) == 1
        assert flat[0].deck_id == 1

    def test_nested_tree(self):
        from relay.actions import _flatten_tree
        child1 = types.SimpleNamespace(deck_id=2, name="Child1", children=[])
        child2 = types.SimpleNamespace(deck_id=3, name="Child2", children=[])
        grandchild = types.SimpleNamespace(deck_id=4, name="GC", children=[])
        child1.children = [grandchild]
        root = types.SimpleNamespace(deck_id=1, name="Root", children=[child1, child2])
        flat = _flatten_tree(root)
        assert len(flat) == 4
        ids = [n.deck_id for n in flat]
        assert ids == [1, 2, 4, 3]

    def test_no_children_attr(self):
        """Node without children attribute should return just itself."""
        from relay.actions import _flatten_tree
        node = types.SimpleNamespace(deck_id=1, name="Leaf")
        flat = _flatten_tree(node)
        assert len(flat) == 1
