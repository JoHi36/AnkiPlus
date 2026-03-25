"""
Tests for ui/bridge.py — WebBridge critical methods.

Covers:
- getCurrentDeck: with/without collection
- getAvailableDecks: with/without collection
- saveSettings: valid args, side effects
- cancelRequest: idempotency
- getAITools: returns valid JSON with expected keys
- getResponseStyle: returns valid style string
- getCardDetails: no collection, invalid card_id
- getAuthStatus: reads config values correctly

Isolation strategy
------------------
bridge.py uses `from aqt import mw` inside each method body — NOT at module
level — so we can patch `aqt.mw` per test without affecting the import.

We DO need to stub a few modules that bridge.py imports at module level:
  requests, config (get_config / update_config / is_backend_mode / ...), utils.logging

These are installed temporarily, the module is imported, then they are
restored IMMEDIATELY (same pattern as test_gemini.py).
"""

import json
import sys
import types
from unittest.mock import MagicMock, patch, PropertyMock


# ---------------------------------------------------------------------------
# Step 1: install module-level stubs so bridge.py can be imported
# ---------------------------------------------------------------------------

def _make_config_stub(overrides=None):
    """Return a config stub whose get_config returns a usable dict."""
    base = {
        "api_key": "test-key",
        "model_name": "gemini-3-flash-preview",
        "model_provider": "google",
        "mascot_enabled": False,
        "response_style": "balanced",
        "theme": "dark",
        "auth_token": "tok123",
        "auth_validated": True,
        "backend_url": "https://example.com",
        "ai_tools": {"images": True, "diagrams": True, "molecules": False},
    }
    if overrides:
        base.update(overrides)

    stub = MagicMock()
    stub.get_config = MagicMock(return_value=dict(base))
    stub.update_config = MagicMock(return_value=True)
    stub.is_backend_mode = MagicMock(return_value=False)
    stub.get_backend_url = MagicMock(return_value="https://example.com")
    stub.get_auth_token = MagicMock(return_value="tok123")
    stub.get_refresh_token = MagicMock(return_value="ref456")
    stub.DEFAULT_BACKEND_URL = "https://example.com"
    return stub


_config_stub = _make_config_stub()

# Build a fake requests module (bridge.py does `import requests` at the top)
_fake_requests = types.ModuleType("requests")
_fake_requests.get = MagicMock()
_fake_exceptions_ns = types.SimpleNamespace(
    RequestException=Exception,
    Timeout=Exception,
)
_fake_requests.exceptions = _fake_exceptions_ns

# Save originals
_saved = {}
for _key in ("requests", "config", "ui.bridge", "bridge"):
    _saved[_key] = sys.modules.get(_key)

sys.modules["requests"] = _fake_requests
sys.modules["config"] = _config_stub

# Also install as relative path the bridge might see
for _alias in ("ui.bridge",):
    _saved[_alias] = sys.modules.pop(_alias, None)

# Remove any cached bridge module
for _k in [k for k in sys.modules if "bridge" in k and "test" not in k]:
    _saved[_k] = sys.modules.pop(_k)

# ---------------------------------------------------------------------------
# Step 2: import the module under test
# ---------------------------------------------------------------------------
import ui.bridge as _bridge_mod

WebBridge = _bridge_mod.WebBridge

# ---------------------------------------------------------------------------
# Step 3: restore originals IMMEDIATELY
# ---------------------------------------------------------------------------
for _key, _orig in _saved.items():
    if _orig is None:
        sys.modules.pop(_key, None)
    else:
        sys.modules[_key] = _orig
del _saved


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_widget():
    """Minimal widget mock that WebBridge.__init__ expects."""
    w = MagicMock()
    w.web_view = MagicMock()
    w.web_view.page.return_value.runJavaScript = MagicMock()
    w._ai_thread = None
    w.config = {}
    return w


def _make_bridge():
    """Instantiate WebBridge with a mock widget."""
    return WebBridge(_make_widget())


def _make_mw(col=True, state="deckBrowser", reviewer_card=None):
    """Build a mock mw object.

    Parameters
    ----------
    col:
        If True, mw.col is a MagicMock with typical methods.
        If False, mw.col is None.
    state:
        mw.state string.
    reviewer_card:
        If set, mw.reviewer.card = reviewer_card.
    """
    mw = MagicMock()
    mw.state = state
    if col:
        mw.col = MagicMock()
        mw.col.decks = MagicMock()
        mw.col.decks.selected = MagicMock(return_value=1)
        mw.col.decks.name = MagicMock(return_value="Test Deck")
        mw.col.decks.allNames = MagicMock(return_value=[(1, "Deck A"), (2, "Deck B")])
    else:
        mw.col = None

    mw.reviewer = MagicMock()
    if reviewer_card is not None:
        mw.reviewer.card = reviewer_card
    else:
        mw.reviewer.card = None

    return mw


# ---------------------------------------------------------------------------
# 1. getCurrentDeck — with collection
# ---------------------------------------------------------------------------

class TestGetCurrentDeck:

    def test_with_collection_returns_valid_json(self):
        """getCurrentDeck must return parseable JSON with expected keys."""
        bridge = _make_bridge()
        mw = _make_mw(col=True, state="deckBrowser")
        mw.col.decks.selected.return_value = 5
        mw.col.decks.name.return_value = "My Deck"

        with patch("aqt.mw", mw):
            result = bridge.getCurrentDeck()

        data = json.loads(result)
        assert "deckId" in data
        assert "deckName" in data
        assert "isInDeck" in data

    def test_no_collection_returns_null_deck(self):
        """When mw.col is None, getCurrentDeck must return deckId=None without crashing."""
        bridge = _make_bridge()
        mw = _make_mw(col=False)

        with patch("aqt.mw", mw):
            result = bridge.getCurrentDeck()

        data = json.loads(result)
        assert data["deckId"] is None
        assert data["deckName"] is None
        assert data["isInDeck"] is False

    def test_mw_none_returns_null_deck(self):
        """When mw itself is None, getCurrentDeck must return deckId=None without crashing."""
        bridge = _make_bridge()

        # Patch aqt module so that `from aqt import mw` yields None
        with patch.dict(sys.modules, {"aqt": MagicMock(mw=None)}):
            result = bridge.getCurrentDeck()

        data = json.loads(result)
        assert data["deckId"] is None

    def test_deck_browser_state_returns_no_active_deck(self):
        """In deckBrowser state with no selected deck name, isInDeck must be False."""
        bridge = _make_bridge()
        mw = _make_mw(col=True, state="deckBrowser")
        # allNames is set but selected() returns 0 (no selected deck)
        mw.col.decks.selected.return_value = 0

        with patch("aqt.mw", mw):
            result = bridge.getCurrentDeck()

        data = json.loads(result)
        assert data["isInDeck"] is False

    def test_review_state_marks_is_in_deck(self):
        """When state == 'review' and a reviewer card is available, isInDeck must be True."""
        bridge = _make_bridge()
        card = MagicMock()
        card.did = 7
        mw = _make_mw(col=True, state="review", reviewer_card=card)
        mw.col.decks.name.return_value = "Anatomy"

        with patch("aqt.mw", mw):
            result = bridge.getCurrentDeck()

        data = json.loads(result)
        assert data["isInDeck"] is True
        assert data["deckId"] == 7


# ---------------------------------------------------------------------------
# 2. getAvailableDecks — with and without collection
# ---------------------------------------------------------------------------

class TestGetAvailableDecks:

    def test_with_collection_returns_deck_list(self):
        """getAvailableDecks must return a JSON object with a 'decks' list."""
        bridge = _make_bridge()
        mw = _make_mw(col=True)
        mw.col.decks.allNames.return_value = [(1, "Deck A"), (2, "Deck B")]

        with patch("aqt.mw", mw):
            result = bridge.getAvailableDecks()

        data = json.loads(result)
        assert "decks" in data
        assert len(data["decks"]) == 2
        deck_names = [d["name"] for d in data["decks"]]
        assert "Deck A" in deck_names
        assert "Deck B" in deck_names

    def test_no_collection_returns_empty_list(self):
        """When mw.col is None, getAvailableDecks must return an empty decks list."""
        bridge = _make_bridge()
        mw = _make_mw(col=False)

        with patch("aqt.mw", mw):
            result = bridge.getAvailableDecks()

        data = json.loads(result)
        assert data["decks"] == []

    def test_each_deck_has_id_and_name(self):
        """Each entry in 'decks' must have 'id' and 'name' keys."""
        bridge = _make_bridge()
        mw = _make_mw(col=True)
        mw.col.decks.allNames.return_value = [(42, "Physiology")]

        with patch("aqt.mw", mw):
            result = bridge.getAvailableDecks()

        data = json.loads(result)
        deck = data["decks"][0]
        assert deck["id"] == 42
        assert deck["name"] == "Physiology"


# ---------------------------------------------------------------------------
# 3. saveSettings — valid arguments
# ---------------------------------------------------------------------------

class TestSaveSettings:

    @staticmethod
    def _inject_qtimer():
        """Inject a QTimer mock into aqt.qt so `from aqt.qt import QTimer` succeeds."""
        import types as _types
        qt_mod = sys.modules.get("aqt.qt")
        if qt_mod is None:
            qt_mod = _types.ModuleType("aqt.qt")
            sys.modules["aqt.qt"] = qt_mod
        if not hasattr(qt_mod, "QTimer"):
            qt_mod.QTimer = MagicMock()
        return qt_mod

    def test_save_settings_calls_update_config(self):
        """saveSettings must call update_config with the provided values."""
        bridge = _make_bridge()
        self._inject_qtimer()

        update_mock = MagicMock(return_value=True)
        # Return a dict so .get() works on self.widget.config
        config_mock = MagicMock(return_value={"api_key": "my-api-key", "model_name": "m"})

        with patch("ui.bridge.update_config", update_mock), \
             patch("ui.bridge.get_config", config_mock):
            bridge.saveSettings("my-api-key", "google", "gemini-3-flash")

        update_mock.assert_called_once_with(
            api_key="my-api-key",
            model_provider="google",
            model_name="gemini-3-flash",
        )

    def test_save_settings_empty_model_name_allowed(self):
        """saveSettings must not crash when model_name is an empty string."""
        bridge = _make_bridge()
        self._inject_qtimer()

        update_mock = MagicMock(return_value=True)
        config_mock = MagicMock(return_value={"api_key": "", "model_name": ""})

        with patch("ui.bridge.update_config", update_mock), \
             patch("ui.bridge.get_config", config_mock):
            # Must not raise
            bridge.saveSettings("key", "google", "")

        call_kwargs = update_mock.call_args[1]
        assert call_kwargs["model_name"] == ""


# ---------------------------------------------------------------------------
# 4. cancelRequest — idempotency
# ---------------------------------------------------------------------------

class TestCancelRequest:

    def test_cancel_with_no_pending_request_does_not_crash(self):
        """cancelRequest when current_request is None must be a no-op."""
        bridge = _make_bridge()
        bridge.current_request = None
        # Must not raise
        bridge.cancelRequest()
        assert bridge.current_request is None

    def test_cancel_twice_does_not_crash(self):
        """Calling cancelRequest twice must be idempotent and not raise."""
        bridge = _make_bridge()
        bridge.current_request = "some message"

        # First cancel clears the request and tries to send JS — mock web_view
        bridge.widget.web_view.page.return_value.runJavaScript = MagicMock()

        bridge.cancelRequest()
        # After first cancel, current_request should be None
        assert bridge.current_request is None

        # Second cancel — no request pending, must not crash
        bridge.cancelRequest()

    def test_cancel_clears_current_request(self):
        """After cancelRequest, current_request must be None."""
        bridge = _make_bridge()
        bridge.current_request = "pending question"

        bridge.cancelRequest()

        assert bridge.current_request is None


# ---------------------------------------------------------------------------
# 5. getAITools — returns valid JSON
# ---------------------------------------------------------------------------

class TestGetAITools:

    def test_returns_parseable_json(self):
        """getAITools must return a string that parses as JSON."""
        bridge = _make_bridge()
        config = {"ai_tools": {"images": True, "diagrams": False, "molecules": True}}

        with patch("ui.bridge.get_config", return_value=config):
            result = bridge.getAITools()

        data = json.loads(result)
        assert isinstance(data, dict)

    def test_returns_default_tools_when_config_has_none(self):
        """When config has no ai_tools key, getAITools must return a dict with image/diagram keys."""
        bridge = _make_bridge()

        with patch("ui.bridge.get_config", return_value={}):
            result = bridge.getAITools()

        data = json.loads(result)
        # Must have the three core keys from the in-code default
        assert "images" in data
        assert "diagrams" in data
        assert "molecules" in data

    def test_values_reflect_config(self):
        """getAITools must reflect the actual values from get_config."""
        bridge = _make_bridge()
        config = {"ai_tools": {"images": False, "diagrams": True, "molecules": True}}

        with patch("ui.bridge.get_config", return_value=config):
            result = bridge.getAITools()

        data = json.loads(result)
        assert data["images"] is False
        assert data["diagrams"] is True
        assert data["molecules"] is True


# ---------------------------------------------------------------------------
# 6. getResponseStyle — returns valid style string
# ---------------------------------------------------------------------------

class TestGetResponseStyle:

    def test_returns_string(self):
        """getResponseStyle must return a plain string (not JSON)."""
        bridge = _make_bridge()

        with patch("ui.bridge.get_config", return_value={"response_style": "concise"}):
            result = bridge.getResponseStyle()

        assert isinstance(result, str)
        assert result == "concise"

    def test_defaults_to_balanced_when_key_missing(self):
        """When response_style is absent from config, 'balanced' is the default."""
        bridge = _make_bridge()

        with patch("ui.bridge.get_config", return_value={}):
            result = bridge.getResponseStyle()

        assert result == "balanced"

    def test_valid_style_values_pass_through(self):
        """Each valid style name must be returned as-is."""
        bridge = _make_bridge()
        for style in ("concise", "balanced", "detailed"):
            with patch("ui.bridge.get_config", return_value={"response_style": style}):
                result = bridge.getResponseStyle()
            assert result == style, f"Expected '{style}', got '{result}'"


# ---------------------------------------------------------------------------
# 7. getCardDetails — no collection + invalid card_id
# ---------------------------------------------------------------------------

class TestGetCardDetails:

    def test_no_collection_returns_error_json(self):
        """When mw.col is None, getCardDetails must return JSON with an error key."""
        bridge = _make_bridge()
        mw = _make_mw(col=False)

        with patch("aqt.mw", mw):
            result = bridge.getCardDetails("999")

        data = json.loads(result)
        assert "error" in data

    def test_invalid_card_id_string_handled(self):
        """Non-integer card_id must return a JSON error rather than crash."""
        bridge = _make_bridge()
        mw = _make_mw(col=True)

        # get_card will raise because the id is garbage — simulate by raising
        mw.col.get_card.side_effect = Exception("not found")
        mw.col.get_note.side_effect = Exception("not found")

        with patch("aqt.mw", mw):
            result = bridge.getCardDetails("not-a-number")

        data = json.loads(result)
        assert "error" in data

    def test_card_not_found_returns_error_json(self):
        """When a valid int id is given but get_card raises, an error JSON is returned."""
        bridge = _make_bridge()
        mw = _make_mw(col=True)
        mw.col.get_card.side_effect = Exception("Card not found")
        mw.col.get_note.side_effect = Exception("Note not found")

        with patch("aqt.mw", mw):
            result = bridge.getCardDetails("12345")

        data = json.loads(result)
        assert "error" in data

    def test_found_card_returns_expected_keys(self):
        """When card is found, result must contain front, back, deckName, modelName."""
        bridge = _make_bridge()
        mw = _make_mw(col=True)

        # Build a realistic card mock
        card = MagicMock()
        card.q.return_value = "<p>Front</p>"
        card.a.return_value = "<p>Back</p>"
        card.did = 1
        card.odid = 0
        note = MagicMock()
        note.model.return_value = {"name": "Basic"}
        card.note.return_value = note

        mw.col.get_card.return_value = card
        deck = {"name": "Medicine"}
        mw.col.decks.get.return_value = deck

        with patch("aqt.mw", mw):
            result = bridge.getCardDetails("1001")

        data = json.loads(result)
        assert data["front"] == "<p>Front</p>"
        assert data["back"] == "<p>Back</p>"
        assert data["deckName"] == "Medicine"
        assert data["modelName"] == "Basic"


# ---------------------------------------------------------------------------
# 8. getAuthStatus — reads config correctly
# ---------------------------------------------------------------------------

class TestGetAuthStatus:

    def test_authenticated_when_token_and_validated(self):
        """getAuthStatus must report authenticated=True when both hasToken and auth_validated."""
        bridge = _make_bridge()
        config = {
            "auth_token": "valid-token",
            "auth_validated": True,
            "backend_url": "https://example.com",
        }

        with patch("ui.bridge.get_config", return_value=config), \
             patch("ui.bridge.is_backend_mode", return_value=True):
            result = bridge.getAuthStatus()

        data = json.loads(result)
        assert data["authenticated"] is True
        assert data["hasToken"] is True

    def test_not_authenticated_when_token_not_validated(self):
        """getAuthStatus must report authenticated=False when auth_validated is False."""
        bridge = _make_bridge()
        config = {
            "auth_token": "some-token",
            "auth_validated": False,
            "backend_url": "https://example.com",
        }

        with patch("ui.bridge.get_config", return_value=config), \
             patch("ui.bridge.is_backend_mode", return_value=False):
            result = bridge.getAuthStatus()

        data = json.loads(result)
        assert data["authenticated"] is False
        assert data["hasToken"] is True

    def test_not_authenticated_when_no_token(self):
        """getAuthStatus must report authenticated=False when auth_token is empty."""
        bridge = _make_bridge()
        config = {
            "auth_token": "",
            "auth_validated": False,
            "backend_url": "",
        }

        with patch("ui.bridge.get_config", return_value=config), \
             patch("ui.bridge.is_backend_mode", return_value=False):
            result = bridge.getAuthStatus()

        data = json.loads(result)
        assert data["authenticated"] is False
        assert data["hasToken"] is False

    def test_returns_valid_json_always(self):
        """getAuthStatus must always return parseable JSON, even on exception."""
        bridge = _make_bridge()

        with patch("ui.bridge.get_config", side_effect=RuntimeError("config broken")):
            result = bridge.getAuthStatus()

        # Must still be valid JSON
        data = json.loads(result)
        assert "authenticated" in data
        assert data["authenticated"] is False
