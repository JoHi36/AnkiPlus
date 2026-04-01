# Remote PWA Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the scattered Remote implementation (6 files, 3 duplicates, thread-unsafe) with a clean `relay/` Python package that owns all remote logic.

**Architecture:** New `relay/` package with 4 files: `__init__.py` (lifecycle), `client.py` (RelayClient), `actions.py` (card operations), `state.py` (hook-based broadcasting). PWA gets env-based config and auto-mode switching via `anki_state` messages.

**Tech Stack:** Python 3.9+, PyQt6 (QTimer for thread-safety), Firebase Cloud Functions (unchanged), React PWA (minor changes)

**Spec:** `docs/superpowers/specs/2026-04-01-remote-pwa-redesign.md`

**Note:** `remote/` directory is the PWA (Node.js). The Python package is `relay/` to avoid conflict.

---

### Task 1: Create `relay/actions.py` — Card Operations

Extract card operations from `plusi/telegram.py` into a standalone module with no Telegram dependency.

**Files:**
- Create: `relay/__init__.py` (empty, makes it a package)
- Create: `relay/actions.py`
- Create: `tests/test_relay_actions.py`

- [ ] **Step 1: Create package + empty actions module**

```python
# relay/__init__.py
"""AnkiPlus Remote Relay — clean PWA remote control package."""
```

```python
# relay/actions.py
"""Card operations for remote control. Thread-safe via _run_on_main()."""

import json
from threading import Event

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Main-thread execution helper
# ---------------------------------------------------------------------------

def _run_on_main(fn, timeout=10):
    """Execute fn on Anki's main thread and return result. Blocks until done."""
    result = [None]
    done = Event()

    def _wrapper():
        try:
            result[0] = fn()
        except Exception as exc:
            logger.error("relay.actions: main thread error: %s", exc)
            result[0] = {"error": str(exc)}
        finally:
            done.set()

    try:
        from aqt import mw
        if mw and hasattr(mw, 'taskman') and mw.taskman:
            mw.taskman.run_on_main(_wrapper)
        else:
            from PyQt6.QtCore import QMetaObject, Qt
            QMetaObject.invokeMethod(mw, _wrapper, Qt.ConnectionType.QueuedConnection)
        done.wait(timeout=timeout)
        if not done.is_set():
            logger.warning("relay.actions: _run_on_main timed out")
            return {"error": "timeout"}
        return result[0]
    except Exception as exc:
        logger.error("relay.actions: _run_on_main failed: %s", exc)
    return {"error": "Anki not available"}


# ---------------------------------------------------------------------------
# Message builders
# ---------------------------------------------------------------------------

def build_card_state(phase, front_html, back_html, deck, current, total,
                     card_id, mc_options=None):
    """Build a card_state message for the PWA."""
    msg = {
        "type": "card_state",
        "phase": phase,
        "front_html": front_html,
        "back_html": back_html,
        "deck": deck,
        "progress": {"current": current, "total": total},
        "card_id": card_id,
    }
    if mc_options:
        msg["mc_options"] = mc_options
    return msg


def parse_action(msg):
    """Parse incoming action from PWA. Returns (action_type, params) or None."""
    msg_type = msg.get("type")
    if not msg_type:
        return None
    known = {
        "flip": [],
        "rate": ["ease"],
        "mc_select": ["option_id"],
        "open_deck": ["deck_id"],
        "set_mode": ["mode"],
        "get_decks": [],
    }
    if msg_type not in known:
        return None
    params = {k: msg[k] for k in known[msg_type] if k in msg}
    return (msg_type, params)


# ---------------------------------------------------------------------------
# Card operations (all run on main thread)
# ---------------------------------------------------------------------------

def build_card_state_from_reviewer(phase="question"):
    """Build card_state from current Anki reviewer state. MUST run on main thread."""
    from aqt import mw
    if not mw or not mw.reviewer or not mw.reviewer.card:
        return build_card_state(
            phase="no_card", front_html="", back_html="",
            deck="", current=0, total=0, card_id=0,
        )

    card = mw.reviewer.card
    note = card.note()

    front_html = card.question()
    back_html = card.answer()
    deck_name = mw.col.decks.name(card.did)

    # Progress: reviewed today / (reviewed + remaining)
    import time as _time
    counts = mw.col.sched.counts()
    total_remaining = sum(counts)
    reviewed = 0
    try:
        reviewed = mw.col.db.scalar(
            "SELECT count() FROM revlog WHERE id > ?",
            int((_time.time() - 86400) * 1000))
    except Exception:
        pass

    return build_card_state(
        phase=phase,
        front_html=front_html,
        back_html=back_html,
        deck=deck_name,
        current=reviewed,
        total=reviewed + total_remaining,
        card_id=card.id,
    )


def flip(client):
    """Show answer + send state to PWA."""
    def _fn():
        from aqt import mw
        if not mw or not mw.reviewer:
            return
        mw.reviewer._showAnswer()
        client.send(build_card_state_from_reviewer(phase="answer"))
    _run_on_main(_fn)


def rate(client, ease):
    """Rate current card. Next-card state sent via Hook (state.py)."""
    def _fn():
        from aqt import mw
        if not mw or not mw.reviewer or not mw.reviewer.card:
            return
        mw.reviewer._answerCard(ease)
    _run_on_main(_fn)


def open_deck(client, deck_id):
    """Open deck and start review."""
    def _fn():
        from aqt import mw
        if not mw or not mw.col:
            return
        mw.col.decks.select(deck_id)
        mw.reset()
        mw.moveToState("review")
    _run_on_main(_fn)


def get_decks(client):
    """Send deck list to PWA."""
    def _fn():
        from aqt import mw
        if not mw or not mw.col:
            return []
        decks = []
        for d in mw.col.decks.all_names_and_ids():
            did = d.id
            deck = mw.col.decks.get(did)
            if not deck:
                continue
            tree = mw.col.sched.deck_due_tree()
            # Find counts for this deck
            new_count = learn_count = review_count = 0
            for node in _flatten_tree(tree):
                if node.deck_id == did:
                    new_count = node.new_count
                    learn_count = node.learn_count
                    review_count = node.review_count
                    break
            decks.append({
                "id": did,
                "name": d.name,
                "new": new_count,
                "learn": learn_count,
                "review": review_count,
            })
        return decks

    decks = _run_on_main(_fn) or []
    client.send({"type": "deck_list", "decks": decks})


def _flatten_tree(node):
    """Flatten DeckTreeNode into a list."""
    yield node
    for child in node.children:
        yield from _flatten_tree(child)


def handle_action(client, action_type, params):
    """Route an incoming PWA action to the correct handler."""
    if action_type == "flip":
        flip(client)
    elif action_type == "rate":
        rate(client, params.get("ease", 3))
    elif action_type == "open_deck":
        deck_id = params.get("deck_id")
        if deck_id:
            open_deck(client, int(deck_id))
    elif action_type == "set_mode":
        client.mode = params.get("mode", "duo")
        logger.info("relay: mode set to %s", client.mode)
    elif action_type == "get_decks":
        get_decks(client)
    elif action_type == "mc_select":
        # MC select is handled same as rate — triggers next card
        pass
    else:
        logger.warning("relay: unknown action %s", action_type)
```

- [ ] **Step 2: Write tests**

```python
# tests/test_relay_actions.py
"""Tests for relay/actions.py — message builders and action parsing."""

import sys
import types

# Mock aqt before import
if "aqt" not in sys.modules:
    aqt_mock = types.ModuleType("aqt")
    aqt_mock.mw = None
    sys.modules["aqt"] = aqt_mock

import pytest


class TestBuildCardState:
    def test_basic_message(self):
        from relay.actions import build_card_state
        msg = build_card_state(
            phase="question", front_html="<b>Q</b>", back_html="A",
            deck="Bio", current=5, total=20, card_id=42,
        )
        assert msg["type"] == "card_state"
        assert msg["phase"] == "question"
        assert msg["front_html"] == "<b>Q</b>"
        assert msg["deck"] == "Bio"
        assert msg["progress"] == {"current": 5, "total": 20}
        assert msg["card_id"] == 42
        assert "mc_options" not in msg

    def test_with_mc_options(self):
        from relay.actions import build_card_state
        mc = [{"id": "a", "text": "X"}, {"id": "b", "text": "Y"}]
        msg = build_card_state(
            phase="question", front_html="Q", back_html="A",
            deck="D", current=1, total=10, card_id=1, mc_options=mc,
        )
        assert msg["mc_options"] == mc

    def test_no_card_state(self):
        from relay.actions import build_card_state
        msg = build_card_state(
            phase="no_card", front_html="", back_html="",
            deck="", current=0, total=0, card_id=0,
        )
        assert msg["phase"] == "no_card"


class TestParseAction:
    def test_flip(self):
        from relay.actions import parse_action
        assert parse_action({"type": "flip"}) == ("flip", {})

    def test_rate_with_ease(self):
        from relay.actions import parse_action
        assert parse_action({"type": "rate", "ease": 3}) == ("rate", {"ease": 3})

    def test_open_deck(self):
        from relay.actions import parse_action
        assert parse_action({"type": "open_deck", "deck_id": 99}) == ("open_deck", {"deck_id": 99})

    def test_set_mode(self):
        from relay.actions import parse_action
        assert parse_action({"type": "set_mode", "mode": "solo"}) == ("set_mode", {"mode": "solo"})

    def test_mc_select(self):
        from relay.actions import parse_action
        assert parse_action({"type": "mc_select", "option_id": "a"}) == ("mc_select", {"option_id": "a"})

    def test_get_decks(self):
        from relay.actions import parse_action
        assert parse_action({"type": "get_decks"}) == ("get_decks", {})

    def test_unknown_returns_none(self):
        from relay.actions import parse_action
        assert parse_action({"type": "bogus"}) is None

    def test_missing_type_returns_none(self):
        from relay.actions import parse_action
        assert parse_action({}) is None


class TestHandleAction:
    def test_set_mode_updates_client(self):
        from relay.actions import handle_action

        class FakeClient:
            mode = "duo"
            def send(self, msg): pass

        client = FakeClient()
        handle_action(client, "set_mode", {"mode": "solo"})
        assert client.mode == "solo"

    def test_unknown_action_no_crash(self):
        from relay.actions import handle_action

        class FakeClient:
            mode = "duo"
            def send(self, msg): pass

        handle_action(FakeClient(), "nonexistent", {})
```

- [ ] **Step 3: Run tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -k test_relay_actions -v`

Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add relay/__init__.py relay/actions.py tests/test_relay_actions.py
git commit -m "feat(relay): add actions.py — card operations extracted from telegram.py"
```

---

### Task 2: Create `relay/client.py` — Thread-Safe RelayClient

New RelayClient with systematic thread-safety (all callbacks via `QTimer.singleShot`).

**Files:**
- Create: `relay/client.py`
- Create: `tests/test_relay_client.py`

- [ ] **Step 1: Write `relay/client.py`**

```python
# relay/client.py
"""Polling relay client for PWA remote control.

Connects to Firebase relay endpoint. Pair-code auth: Anki creates pair,
user scans QR, PWA joins. Runs polling loop in daemon thread.
All callbacks dispatched to Qt main thread via QTimer.singleShot.
"""

import json
import threading
import time
import urllib.request
import urllib.error

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)

POLL_INTERVAL = 0.5
RETRY_DELAY = 5
REQUEST_TIMEOUT = 10


def _relay_post(relay_url, payload):
    """POST JSON to relay endpoint. Returns parsed response or None."""
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            relay_url, data=data,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError) as exc:
        logger.debug("relay: post error: %s", exc)
        return None
    except Exception as exc:
        logger.error("relay: unexpected error: %s", exc)
        return None


class RelayClient:
    """Manages connection to Firebase relay for remote control."""

    def __init__(self, relay_url, secret, uid=""):
        self.relay_url = relay_url
        self.secret = secret
        self.uid = uid
        self.pair_code = None
        self.session_token = None
        self.mode = "duo"
        self._connected = False
        self._peer_connected = False
        self._stop_event = threading.Event()
        self._thread = None
        self._action_handler = None
        self._on_peer_change = None

    @property
    def is_connected(self):
        return self._connected

    @property
    def is_peer_connected(self):
        return self._peer_connected

    def set_action_handler(self, handler):
        """Set callback for incoming actions: handler(action_type, params).
        Called on Qt main thread."""
        self._action_handler = handler

    def set_peer_change_handler(self, handler):
        """Set callback for peer connect/disconnect: handler(connected: bool).
        Called on Qt main thread."""
        self._on_peer_change = handler

    @staticmethod
    def dispatch_on_main(fn):
        """Schedule fn on Qt main thread."""
        try:
            from PyQt6.QtCore import QTimer
            QTimer.singleShot(0, fn)
        except ImportError:
            # Fallback for testing without Qt
            fn()

    def create_pair(self):
        """Create a new pairing session with the relay. Returns pair_code or None."""
        resp = _relay_post(self.relay_url, {
            "action": "create_pair",
            "secret": self.secret,
            "uid": self.uid,
        })
        if not resp or not resp.get("ok"):
            logger.error("relay: pair creation failed")
            return None

        self.pair_code = resp.get("pair_code")
        self.session_token = resp.get("session_token")
        if not self.pair_code or not self.session_token:
            logger.error("relay: response missing pair_code or session_token")
            return None

        self._connected = True
        self._peer_connected = resp.get("peer_connected", False)
        logger.info("relay: pair created (code=%s)", self.pair_code)
        return self.pair_code

    def reconnect(self, session_token):
        """Reconnect with a stored session token. Returns True if successful."""
        self.session_token = session_token
        resp = _relay_post(self.relay_url, {
            "action": "reconnect",
            "session_token": session_token,
            "secret": self.secret,
        })
        if not resp or not resp.get("ok"):
            logger.info("relay: reconnect failed, token may be expired")
            self.session_token = None
            return False

        self._connected = True
        self._peer_connected = resp.get("peer_connected", False)
        logger.info("relay: reconnected (peer=%s)", self._peer_connected)
        return True

    def start_polling(self):
        """Start the polling thread. Call after create_pair() or reconnect()."""
        if self._thread and self._thread.is_alive():
            return
        if not self.session_token:
            logger.warning("relay: cannot poll without session_token")
            return

        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._poll_loop, daemon=True, name="AnkiRelay",
        )
        self._thread.start()
        logger.info("relay: polling started")

    def stop(self):
        """Stop polling and disconnect."""
        self._stop_event.set()
        self._connected = False

        if self.session_token:
            _relay_post(self.relay_url, {
                "action": "disconnect",
                "session_token": self.session_token,
                "secret": self.secret,
            })

        if self._peer_connected:
            self._peer_connected = False
            if self._on_peer_change:
                self.dispatch_on_main(lambda: self._on_peer_change(False))

        logger.info("relay: stopped")

    def send(self, message):
        """Send a message to the PWA via relay."""
        if not self._connected or not self.session_token:
            return
        # Run HTTP in background thread to never block Qt
        threading.Thread(
            target=_relay_post,
            args=(self.relay_url, {
                "action": "send",
                "session_token": self.session_token,
                "secret": self.secret,
                "message": message,
            }),
            daemon=True,
        ).start()

    def _poll_loop(self):
        """Polling loop — runs in daemon thread."""
        from .actions import parse_action

        while not self._stop_event.is_set():
            try:
                resp = _relay_post(self.relay_url, {
                    "action": "poll",
                    "session_token": self.session_token,
                    "secret": self.secret,
                })
                if resp and resp.get("ok"):
                    for msg in resp.get("messages", []):
                        self._handle_message(msg)
                elif resp and resp.get("error") == "Invalid session":
                    logger.warning("relay: session invalid, stopping")
                    self._connected = False
                    break
            except Exception as exc:
                logger.error("relay: poll error: %s", exc)
                if not self._stop_event.is_set():
                    self._stop_event.wait(RETRY_DELAY)
                    continue

            self._stop_event.wait(POLL_INTERVAL)

        logger.info("relay: poll loop exited")

    def _handle_message(self, msg):
        """Process a single message from the relay. Dispatches to main thread."""
        msg_type = msg.get("type", "")

        if msg_type == "peer_connected":
            self._peer_connected = True
            if self._on_peer_change:
                self.dispatch_on_main(lambda: self._on_peer_change(True))
            logger.info("relay: PWA connected")
            return

        if msg_type == "peer_disconnected":
            self._peer_connected = False
            if self._on_peer_change:
                self.dispatch_on_main(lambda: self._on_peer_change(False))
            logger.info("relay: PWA disconnected")
            return

        from .actions import parse_action
        parsed = parse_action(msg)
        if parsed and self._action_handler:
            at, p = parsed
            self.dispatch_on_main(lambda at=at, p=p: self._action_handler(at, p))
```

- [ ] **Step 2: Write tests**

```python
# tests/test_relay_client.py
"""Tests for relay/client.py — RelayClient lifecycle and message handling."""

import sys
import types

if "aqt" not in sys.modules:
    aqt_mock = types.ModuleType("aqt")
    aqt_mock.mw = None
    sys.modules["aqt"] = aqt_mock

import pytest
from unittest.mock import patch, MagicMock


class TestRelayClientInit:
    def test_defaults(self):
        from relay.client import RelayClient
        c = RelayClient("https://example.com/relay", "secret", uid="u1")
        assert c.relay_url == "https://example.com/relay"
        assert c.secret == "secret"
        assert c.uid == "u1"
        assert c.pair_code is None
        assert c.session_token is None
        assert c.mode == "duo"
        assert not c.is_connected
        assert not c.is_peer_connected

    def test_set_mode(self):
        from relay.client import RelayClient
        c = RelayClient("https://x.com/r", "s")
        c.mode = "solo"
        assert c.mode == "solo"


class TestCreatePair:
    @patch("relay.client._relay_post")
    def test_success(self, mock_post):
        from relay.client import RelayClient
        mock_post.return_value = {"ok": True, "pair_code": "ABC123", "session_token": "tok1"}
        c = RelayClient("https://x.com/r", "secret", uid="u1")
        code = c.create_pair()
        assert code == "ABC123"
        assert c.pair_code == "ABC123"
        assert c.session_token == "tok1"
        assert c.is_connected
        mock_post.assert_called_once_with("https://x.com/r", {
            "action": "create_pair", "secret": "secret", "uid": "u1",
        })

    @patch("relay.client._relay_post")
    def test_failure_returns_none(self, mock_post):
        from relay.client import RelayClient
        mock_post.return_value = {"ok": False}
        c = RelayClient("https://x.com/r", "s", uid="u")
        assert c.create_pair() is None
        assert not c.is_connected

    @patch("relay.client._relay_post")
    def test_network_error(self, mock_post):
        from relay.client import RelayClient
        mock_post.return_value = None
        c = RelayClient("https://x.com/r", "s", uid="u")
        assert c.create_pair() is None


class TestReconnect:
    @patch("relay.client._relay_post")
    def test_success(self, mock_post):
        from relay.client import RelayClient
        mock_post.return_value = {"ok": True, "peer_connected": True}
        c = RelayClient("https://x.com/r", "s")
        assert c.reconnect("saved_token") is True
        assert c.session_token == "saved_token"
        assert c.is_connected
        assert c.is_peer_connected

    @patch("relay.client._relay_post")
    def test_failure_clears_token(self, mock_post):
        from relay.client import RelayClient
        mock_post.return_value = None
        c = RelayClient("https://x.com/r", "s")
        assert c.reconnect("bad_token") is False
        assert c.session_token is None
        assert not c.is_connected


class TestHandleMessage:
    def test_peer_connected(self):
        from relay.client import RelayClient
        c = RelayClient("https://x.com/r", "s")
        # Patch dispatch_on_main to run immediately (no Qt in tests)
        c.dispatch_on_main = lambda fn: fn()
        events = []
        c.set_peer_change_handler(lambda connected: events.append(connected))
        c._handle_message({"type": "peer_connected"})
        assert c.is_peer_connected
        assert events == [True]

    def test_peer_disconnected(self):
        from relay.client import RelayClient
        c = RelayClient("https://x.com/r", "s")
        c.dispatch_on_main = lambda fn: fn()
        c._peer_connected = True
        events = []
        c.set_peer_change_handler(lambda connected: events.append(connected))
        c._handle_message({"type": "peer_disconnected"})
        assert not c.is_peer_connected
        assert events == [False]

    def test_action_dispatched(self):
        from relay.client import RelayClient
        c = RelayClient("https://x.com/r", "s")
        c.dispatch_on_main = lambda fn: fn()
        actions = []
        c.set_action_handler(lambda t, p: actions.append((t, p)))
        c._handle_message({"type": "rate", "ease": 2})
        assert actions == [("rate", {"ease": 2})]

    def test_unknown_message_ignored(self):
        from relay.client import RelayClient
        c = RelayClient("https://x.com/r", "s")
        c.dispatch_on_main = lambda fn: fn()
        actions = []
        c.set_action_handler(lambda t, p: actions.append((t, p)))
        c._handle_message({"type": "bogus"})
        assert actions == []


class TestSend:
    @patch("relay.client._relay_post")
    def test_send_when_connected(self, mock_post):
        from relay.client import RelayClient
        c = RelayClient("https://x.com/r", "secret")
        c._connected = True
        c.session_token = "tok"
        # send() fires a thread — we test that _relay_post would be called
        # by checking the thread is created (send is fire-and-forget)
        c.send({"type": "card_state", "phase": "question"})
        # Give thread a moment
        import time; time.sleep(0.1)
        mock_post.assert_called_once()
        call_args = mock_post.call_args[0]
        assert call_args[0] == "https://x.com/r"
        assert call_args[1]["action"] == "send"
        assert call_args[1]["message"]["type"] == "card_state"

    def test_send_when_disconnected_noop(self):
        from relay.client import RelayClient
        c = RelayClient("https://x.com/r", "s")
        c._connected = False
        # Should not raise
        c.send({"type": "test"})
```

- [ ] **Step 3: Run tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -k test_relay_client -v`

Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add relay/client.py tests/test_relay_client.py
git commit -m "feat(relay): add client.py — thread-safe RelayClient with QTimer dispatch"
```

---

### Task 3: Create `relay/state.py` — Hook-Based State Broadcasting

Hooks into Anki events to send `card_state` and `anki_state` to the PWA automatically — no `time.sleep()`.

**Files:**
- Create: `relay/state.py`

- [ ] **Step 1: Write `relay/state.py`**

```python
# relay/state.py
"""Hook-based state broadcasting to PWA.

Subscribes to Anki gui_hooks and sends card_state / anki_state
messages whenever the reviewer state changes. Replaces the old
time.sleep()-based approach.
"""

import json

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)


# Anki state string → simplified state for PWA
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
        """Register Anki hooks for state broadcasting."""
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
        """Remove Anki hooks."""
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
        """Anki shows new question → send card_state to PWA."""
        if not self.client.is_peer_connected:
            return
        try:
            from .actions import build_card_state_from_reviewer
            state = build_card_state_from_reviewer(phase="question")
            self.client.send(state)
        except Exception as exc:
            logger.error("relay.state: _on_show_question error: %s", exc)

    def _on_state_change(self, new_state, old_state):
        """Anki state changes → send anki_state to PWA for auto Duo/Solo."""
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
```

- [ ] **Step 2: Commit**

```bash
git add relay/state.py
git commit -m "feat(relay): add state.py — hook-based state broadcasting to PWA"
```

---

### Task 4: Create `relay/__init__.py` — Lifecycle + Config

Wire up the public API: `start()`, `stop()`, `get_client()`. Config migration from `telegram.*` to `remote.*`.

**Files:**
- Modify: `relay/__init__.py`
- Modify: `config.py:48-55`

- [ ] **Step 1: Write `relay/__init__.py`**

```python
# relay/__init__.py
"""AnkiPlus Remote Relay — clean PWA remote control package.

Public API:
    start()       — reconnect if previously paired, register hooks
    stop()        — disconnect, unregister hooks
    get_client()  — get the RelayClient singleton
    create_pair() — create new pairing (called from Settings)
"""

try:
    from ..utils.logging import get_logger
    from ..config import get_config, save_config
except ImportError:
    from utils.logging import get_logger
    from config import get_config, save_config

logger = get_logger(__name__)

_client = None
_state_reporter = None

DEFAULTS = {
    "relay_url": "https://europe-west1-ankiplus-b0ffb.cloudfunctions.net/api/relay",
    "relay_secret": "",
    "app_url": "https://ankiplus.app/remote",
    "session_token": None,
}


def _get_remote_config():
    """Get remote config, migrating from telegram.* if needed."""
    config = get_config()

    # Migrate telegram.* → remote.* (one-time)
    if "remote" not in config:
        tg = config.get("telegram", {})
        if tg.get("relay_url"):
            config["remote"] = {
                "relay_url": tg["relay_url"],
                "relay_secret": tg.get("relay_secret", ""),
                "app_url": tg.get("remote_app_url", DEFAULTS["app_url"]),
                "session_token": None,
            }
            save_config(config)
            logger.info("relay: migrated telegram.* config to remote.*")

    remote = config.get("remote", {})
    # Fill defaults for missing keys
    for k, v in DEFAULTS.items():
        if k not in remote:
            remote[k] = v
    return remote


def _save_session_token(token):
    """Persist session token to config for auto-reconnect."""
    config = get_config()
    if "remote" not in config:
        config["remote"] = dict(DEFAULTS)
    config["remote"]["session_token"] = token
    save_config(config)


def get_client():
    """Get the RelayClient singleton. Returns None if not configured."""
    return _client


def create_pair():
    """Create a new pairing session. Returns {pair_code, pair_url} or {error}.
    Called from SettingsSidebar when user clicks 'Remote verbinden'."""
    global _client, _state_reporter

    remote_cfg = _get_remote_config()
    relay_url = remote_cfg.get("relay_url", "").strip()
    relay_secret = remote_cfg.get("relay_secret", "").strip()
    app_url = remote_cfg.get("app_url", DEFAULTS["app_url"])

    if not relay_url:
        return {"error": "relay_url not configured"}

    try:
        from ..config import get_or_create_device_id
    except ImportError:
        from config import get_or_create_device_id

    uid = get_or_create_device_id()

    from .client import RelayClient
    _client = RelayClient(relay_url, relay_secret, uid=uid)

    pair_code = _client.create_pair()
    if not pair_code:
        return {"error": "Could not connect to relay"}

    # Save token for auto-reconnect
    _save_session_token(_client.session_token)

    # Wire up action handler and peer change
    from .actions import handle_action
    _client.set_action_handler(lambda t, p: handle_action(_client, t, p))

    from .state import AnkiStateReporter
    _state_reporter = AnkiStateReporter(_client)
    _state_reporter.register_hooks()
    _client.set_peer_change_handler(_on_peer_change)

    # Start polling
    _client.start_polling()

    pair_url = f"{app_url}?pair={pair_code}"
    return {"pair_code": pair_code, "pair_url": pair_url}


def start():
    """Start remote relay if previously paired (auto-reconnect).
    Called from on_profile_loaded()."""
    global _client, _state_reporter

    remote_cfg = _get_remote_config()
    relay_url = remote_cfg.get("relay_url", "").strip()
    relay_secret = remote_cfg.get("relay_secret", "").strip()
    session_token = remote_cfg.get("session_token")

    if not relay_url or not session_token:
        logger.debug("relay: no config or no saved token, skipping auto-start")
        return False

    try:
        from ..config import get_or_create_device_id
    except ImportError:
        from config import get_or_create_device_id

    uid = get_or_create_device_id()

    from .client import RelayClient
    _client = RelayClient(relay_url, relay_secret, uid=uid)

    if not _client.reconnect(session_token):
        logger.info("relay: auto-reconnect failed, token expired")
        _save_session_token(None)
        _client = None
        return False

    # Wire up
    from .actions import handle_action
    _client.set_action_handler(lambda t, p: handle_action(_client, t, p))

    from .state import AnkiStateReporter
    _state_reporter = AnkiStateReporter(_client)
    _state_reporter.register_hooks()
    _client.set_peer_change_handler(_on_peer_change)

    _client.start_polling()
    logger.info("relay: auto-reconnected successfully")
    return True


def stop():
    """Stop relay client and unregister hooks."""
    global _client, _state_reporter
    if _state_reporter:
        _state_reporter.unregister_hooks()
        _state_reporter = None
    if _client:
        _client.stop()
        _client = None
    logger.info("relay: stopped")


def _on_peer_change(connected):
    """Handle PWA connect/disconnect."""
    if _state_reporter:
        _state_reporter.notify_desktop(connected)
    if connected and _client:
        # Send current card state on connect
        try:
            from .actions import build_card_state_from_reviewer, _run_on_main
            def _fn():
                state = build_card_state_from_reviewer()
                _client.send(state)
            _run_on_main(_fn)
        except Exception as exc:
            logger.debug("relay: initial card state send error: %s", exc)
```

- [ ] **Step 2: Add `remote` defaults to `config.py`**

In `config.py`, add `remote` section after the `telegram` section (line ~55):

Add this after the closing `}` of `"telegram"`:

```python
    "remote": {
        "relay_url": "",
        "relay_secret": "",
        "app_url": "https://ankiplus.app/remote",
        "session_token": None,
    },
```

- [ ] **Step 3: Run all tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -v`

Expected: All pass (including old tests + new relay tests)

- [ ] **Step 4: Commit**

```bash
git add relay/__init__.py config.py
git commit -m "feat(relay): add __init__.py — lifecycle, config migration, auto-reconnect"
```

---

### Task 5: Wire `relay/` into `__init__.py` and Remove Old Code

Replace 130 lines of remote code in `__init__.py` with `relay.start()`.

**Files:**
- Modify: `__init__.py:396-530` (remove old remote functions)
- Modify: `__init__.py:622-624` (start relay)
- Modify: `__init__.py:886-892` (stop relay)

- [ ] **Step 1: Remove old remote functions (lines 396–530)**

Delete these 4 functions entirely from `__init__.py`:
- `_start_remote_relay()` (line 396)
- `_handle_remote_action()` (line 410)
- `_send_current_card_state()` (line 457)
- `_handle_peer_change()` (line 505)

- [ ] **Step 2: Replace startup wiring**

Find the commented-out line (around line 624):
```python
    # Start remote relay if configured
    # Remote relay is started on-demand when user clicks "Remote verbinden" in Settings
    # _start_remote_relay()
```

Replace with:
```python
    # Start remote relay if previously paired (auto-reconnect)
    try:
        from .relay import start as start_relay
        start_relay()
    except Exception as e:
        logger.error("Relay start failed: %s", e)
```

- [ ] **Step 3: Replace shutdown wiring**

Find (around line 886):
```python
        # Stop remote relay
        try:
            from .plusi.remote_ws import stop_remote
            stop_remote()
```

Replace with:
```python
        # Stop remote relay
        try:
            from .relay import stop as stop_relay
            stop_relay()
```

- [ ] **Step 4: Run all tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -v`

Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add __init__.py
git commit -m "refactor: wire relay/ package into __init__.py, remove 130 lines of old remote code"
```

---

### Task 6: Remove Duplicate Remote Methods from `bridge.py` and `widget.py`

Delete the 3 duplicate implementations of QR/status methods.

**Files:**
- Modify: `ui/bridge.py:1487-1562` (remove `getRemoteQR`, `getRemoteStatus`)
- Modify: `ui/widget.py:550-551` (remove handler registrations)
- Modify: `ui/widget.py:2145-2213` (remove `_msg_get_remote_qr`, `_msg_get_remote_status`)

- [ ] **Step 1: Remove from `bridge.py`**

Delete lines 1487–1562 (the `getRemoteQR` and `getRemoteStatus` methods and the blank line before them).

- [ ] **Step 2: Remove from `widget.py`**

Remove the handler registrations at lines 550-551:
```python
            'sidebarGetRemoteQR': self._msg_get_remote_qr,
            'sidebarGetRemoteStatus': self._msg_get_remote_status,
```

Delete the method implementations at lines 2145–2213 (`_msg_get_remote_qr` and `_msg_get_remote_status`).

- [ ] **Step 3: Run tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -v`

Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add ui/bridge.py ui/widget.py
git commit -m "refactor: remove duplicate remote QR/status methods from bridge.py and widget.py"
```

---

### Task 7: Rewrite `settings_sidebar.py` Remote Handlers

Replace the old QR generation with calls to `relay.create_pair()`.

**Files:**
- Modify: `ui/settings_sidebar.py:63-64` (handler registration)
- Modify: `ui/settings_sidebar.py:217-292` (rewrite `_msg_get_remote_qr`, `_msg_get_remote_status`)

- [ ] **Step 1: Rewrite `_msg_get_remote_qr`**

Replace lines 217–268 with:

```python
def _msg_get_remote_qr(_data):
    """Create pairing session and send QR data to sidebar."""
    try:
        try:
            from ..relay import create_pair
        except ImportError:
            from relay import create_pair

        result = create_pair()
        if "error" in result:
            _send_to_sidebar("sidebarRemoteQR", result)
            return

        _send_to_sidebar("sidebarRemoteQR", {
            "pair_code": result["pair_code"],
            "pair_url": result["pair_url"],
        })
    except Exception:
        logger.exception("_msg_get_remote_qr failed")
        _send_to_sidebar("sidebarRemoteQR", {"error": "Unbekannter Fehler"})
```

- [ ] **Step 2: Rewrite `_msg_get_remote_status`**

Replace lines 271–292 with:

```python
def _msg_get_remote_status(_data):
    """Get current remote connection status."""
    try:
        try:
            from ..relay import get_client
        except ImportError:
            from relay import get_client

        client = get_client()
        if not client:
            _send_to_sidebar("sidebarRemoteStatus", {"connected": False, "peer_connected": False})
            return

        _send_to_sidebar("sidebarRemoteStatus", {
            "connected": client.is_connected,
            "peer_connected": client.is_peer_connected,
            "pair_code": client.pair_code,
            "mode": client.mode,
        })
    except Exception:
        logger.exception("_msg_get_remote_status failed")
        _send_to_sidebar("sidebarRemoteStatus", {"connected": False, "peer_connected": False})
```

- [ ] **Step 3: Run tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -v`

Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add ui/settings_sidebar.py
git commit -m "refactor: settings_sidebar uses relay.create_pair() instead of direct remote_ws"
```

---

### Task 8: Delete `plusi/remote_ws.py` and Update Old Tests

Remove the old module and migrate tests.

**Files:**
- Delete: `plusi/remote_ws.py`
- Modify: `tests/test_remote_ws.py` → rename to `tests/test_relay_compat.py` or delete and rely on new tests

- [ ] **Step 1: Delete old module**

```bash
rm plusi/remote_ws.py
```

- [ ] **Step 2: Delete old tests (replaced by test_relay_actions.py + test_relay_client.py)**

```bash
rm tests/test_remote_ws.py
```

- [ ] **Step 3: Verify no remaining imports of `plusi.remote_ws`**

Run: `grep -rn "remote_ws\|plusi.remote_ws\|plusi\.remote_ws" --include="*.py" .`

Fix any remaining references to point to `relay.*` instead.

- [ ] **Step 4: Run all tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -v`

Expected: All pass, no import errors

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: delete plusi/remote_ws.py, replaced by relay/ package"
```

---

### Task 9: Fix PWA — Env-Based Config + Auto-Mode

Update the PWA to use environment variables and auto-switch Duo/Solo based on `anki_state`.

**Files:**
- Modify: `remote/src/App.jsx` (env var, auto-mode)
- Modify: `remote/src/hooks/useRemoteSocket.js` (handle `anki_state` message)
- Create: `remote/.env` (VITE_RELAY_URL)
- Modify: `remote/package.json` (remove `@twa-dev/sdk`)

- [ ] **Step 1: Create `remote/.env`**

```
VITE_RELAY_URL=https://europe-west1-ankiplus-b0ffb.cloudfunctions.net/api/relay
```

- [ ] **Step 2: Update `useRemoteSocket.js` — handle `anki_state`**

Add `ankiState` to the hook's state and return value. In the message loop inside `startPolling`, add:

```javascript
else if (msg.type === 'anki_state') setAnkiState(msg.state);
```

Full changes to `useRemoteSocket.js`:

Add state:
```javascript
const [ankiState, setAnkiState] = useState('idle');
```

In the polling loop, after the `peer_disconnected` handler:
```javascript
else if (msg.type === 'anki_state') setAnkiState(msg.state);
```

Add to return:
```javascript
return { connected, peerConnected, needsPairing, send, messages, consumeMessages, ankiState };
```

- [ ] **Step 3: Update `App.jsx` — env var + auto-mode**

Replace hardcoded URL:
```javascript
const RELAY_URL = import.meta.env.VITE_RELAY_URL || 'https://europe-west1-ankiplus-b0ffb.cloudfunctions.net/api/relay';
```

Add `ankiState` to destructuring:
```javascript
const { connected, peerConnected, needsPairing, send, messages, consumeMessages, ankiState } = useRemoteSocket(RELAY_URL);
```

Replace mode state with auto-mode:
```javascript
const [modeOverride, setModeOverride] = useState(null);
const effectiveMode = modeOverride || (ankiState === 'reviewing' ? 'duo' : 'solo');
```

Update mode toggle buttons to use `setModeOverride` and `effectiveMode`.

Remove the `useEffect` that sends `set_mode` on every mode change — instead only send when override changes:
```javascript
useEffect(() => {
    if (modeOverride) {
        localStorage.setItem('remote-mode', modeOverride);
        send({ type: 'set_mode', mode: modeOverride });
    }
}, [modeOverride, send]);
```

- [ ] **Step 4: Remove `@twa-dev/sdk` from `package.json`**

```bash
cd remote && npm uninstall @twa-dev/sdk
```

- [ ] **Step 5: Commit**

```bash
git add remote/.env remote/src/App.jsx remote/src/hooks/useRemoteSocket.js remote/package.json remote/package-lock.json
git commit -m "feat(remote-pwa): env-based relay URL, auto Duo/Solo via anki_state, remove Telegram SDK"
```

---

### Task 10: Fix `SettingsSidebar.jsx` — Remove Hardcoded URL

**Files:**
- Modify: `frontend/src/components/SettingsSidebar.jsx:78`

- [ ] **Step 1: Remove hardcoded fallback URL**

Find line 78:
```javascript
setPairUrl(prev => prev || `https://remote-beryl-five.vercel.app?pair=${d.pair_code}`);
```

Replace with:
```javascript
// pair_url comes from Python config — no hardcoded fallback
if (d.pair_url) setPairUrl(d.pair_url);
```

Also update the `sidebarRemoteQR` handler to use `pair_url`:
```javascript
if (payload.type === 'sidebarRemoteQR') {
    setLoading(false);
    const d = payload.data || {};
    if (d.error) {
        console.error('Remote QR error:', d.error);
        return;
    }
    if (d.pair_url) setPairUrl(d.pair_url);
}
```

- [ ] **Step 2: Fix QR code foreground color to use design token**

Find:
```javascript
fgColor="#e5e5e5"
```

This is a hardcoded color. Replace with a value that works for both themes. Since QRCodeSVG needs a hex value (not CSS var), use the design system's primary text color approximation:
```javascript
fgColor="currentColor"
```

(QRCodeSVG supports `currentColor` — it inherits from the parent's CSS `color` property which is already set via `var(--ds-text-primary)`.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/SettingsSidebar.jsx
git commit -m "fix(settings): remove hardcoded remote URL, use pair_url from config"
```

---

### Task 11: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -v
```

Expected: 0 failures

- [ ] **Step 2: Verify no dangling imports**

```bash
grep -rn "plusi.remote_ws\|plusi\.remote_ws\|from.*remote_ws" --include="*.py" .
grep -rn "from.*plusi.telegram.*import.*_rate_card\|_show_answer\|_open_deck\|_get_deck_list\|_get_current_card" --include="*.py" .
```

Expected: No matches (all moved to `relay/`)

- [ ] **Step 3: Verify relay package structure**

```bash
ls -la relay/
```

Expected:
```
__init__.py
actions.py
client.py
state.py
```

- [ ] **Step 4: Build PWA**

```bash
cd remote && npm run build
```

Expected: Build succeeds with no errors

- [ ] **Step 5: Build main frontend**

```bash
cd frontend && npm run build
```

Expected: Build succeeds

- [ ] **Step 6: Commit cleanup (if any fixes needed)**

```bash
git add -A
git commit -m "chore: final verification cleanup for relay/ migration"
```
