# Telegram Mini App — AnkiPlus Remote — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Telegram Mini App that acts as a remote control for AnkiPlus, with Solo mode (cards on phone) and Duo mode (phone = remote, laptop = canvas).

**Architecture:** React Mini App (hosted on Vercel) ↔ Polling Relay (Firebase Cloud Function) ↔ Python Polling Client (in Anki). Telegram `initData` for zero-config auth. Existing `plusi/telegram.py` helpers reused for Anki control.

**Tech Stack:** React 18 + Vite + Tailwind + design-system.css (Mini App), Firebase Cloud Function (Relay), Python `urllib` polling (Anki client), Telegram Web App SDK.

**Spec:** `docs/superpowers/specs/2026-03-31-telegram-mini-app.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `remote/package.json` | Mini App dependencies |
| `remote/vite.config.js` | Vite build config for Mini App |
| `remote/tailwind.config.js` | Tailwind using shared preset |
| `remote/postcss.config.js` | PostCSS config |
| `remote/index.html` | Entry HTML |
| `remote/src/main.jsx` | React entry point |
| `remote/src/App.jsx` | Main app shell (mode switch, connection) |
| `remote/src/styles/index.css` | Imports design-system.css |
| `remote/src/hooks/useRemoteSocket.js` | Relay polling + reconnect + state |
| `remote/src/hooks/useCardState.js` | Card state derived from relay messages |
| `remote/src/components/ConnectingScreen.jsx` | "Verbinde mit Anki..." |
| `remote/src/components/DeckPicker.jsx` | Deck selection list |
| `remote/src/components/QuestionScreen.jsx` | Flip button (Duo) or Card+Flip (Solo) |
| `remote/src/components/AnswerScreen.jsx` | Rating buttons (Duo) or Card+Rating (Solo) |
| `remote/src/components/MCScreen.jsx` | Multiple choice options |
| `remote/src/components/RatingButtons.jsx` | 4 rating buttons (shared by Answer + MC) |
| `remote/src/components/ProgressBar.jsx` | Deck progress indicator |
| `remote/src/components/CardHTML.jsx` | Sanitized HTML card renderer (Solo mode) |
| `remote/src/components/RemotePill.jsx` | "Remote verbunden" pill badge |
| `backend/relay.js` | Firebase Cloud Function polling relay |
| `plusi/remote_ws.py` | Python polling client for relay |
| `tests/test_remote_ws.py` | Tests for remote_ws module |

### Modified Files

| File | Change |
|------|--------|
| `config.py:62-66` | Add `relay_url` and `relay_secret` to telegram config |
| `__init__.py:479-493` | Start remote client alongside telegram bot |
| `plusi/telegram.py:529-581` | `/remote` command opens Mini App link |
| `frontend/src/App.jsx:2903-2929` | Add `remoteConnected` state, slide-out animation |

---

## Task 1: Config Extension

**Files:**
- Modify: `config.py:62-66`
- Test: `tests/test_config.py`

- [ ] **Step 1: Write the failing test**

In `tests/test_config.py`, add a test that verifies the new telegram config fields exist with defaults:

```python
def test_telegram_config_has_relay_fields():
    """New relay fields should have sensible defaults."""
    from config import DEFAULT_CONFIG
    tg = DEFAULT_CONFIG["telegram"]
    assert "relay_url" in tg
    assert "relay_secret" in tg
    assert tg["relay_url"] == ""
    assert tg["relay_secret"] == ""
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 run_tests.py -k test_telegram_config_has_relay_fields -v`
Expected: FAIL — `KeyError: 'relay_url'`

- [ ] **Step 3: Add relay fields to DEFAULT_CONFIG**

In `config.py`, modify the telegram section (line 62-66):

```python
    "telegram": {
        "enabled": False,
        "bot_token": "",
        "keep_awake": False,          # caffeinate to prevent sleep
        "relay_url": "",              # Vercel relay WebSocket URL
        "relay_secret": "",           # Shared secret for relay auth
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 run_tests.py -k test_telegram_config_has_relay_fields -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add config.py tests/test_config.py
git commit -m "feat(config): add telegram relay_url and relay_secret fields"
```

---

## Task 2: Polling Relay (Firebase Cloud Function)

**Files:**
- Create: `backend/relay.js`

This is a Firebase Cloud Function that acts as a polling-based message relay. It matches Anki clients and Mini App clients by `chat_id`. Both sides POST messages and poll for pending messages.

- [ ] **Step 1: Create the relay endpoint**

Create `backend/relay.js`:

```javascript
/**
 * POST /api/relay
 * Polling-based message relay for AnkiPlus Remote.
 *
 * Both Anki (Python) and Mini App (React) poll this endpoint.
 *
 * POST body:
 *   { action: "register", chat_id: "123", client: "anki"|"miniapp", secret: "..." }
 *   { action: "send", chat_id: "123", client: "anki"|"miniapp", message: {...} }
 *   { action: "poll", chat_id: "123", client: "anki"|"miniapp" }
 *   { action: "disconnect", chat_id: "123", client: "anki"|"miniapp" }
 *
 * Response:
 *   { ok: true, messages: [...] }  (for poll)
 *   { ok: true }                   (for register/send/disconnect)
 */
const functions = require("firebase-functions");
const crypto = require("crypto");

// In-memory session store (resets on cold start — acceptable for relay)
const sessions = new Map();

// Session TTL: 10 minutes of inactivity
const SESSION_TTL_MS = 10 * 60 * 1000;
const MAX_QUEUE_SIZE = 50;

function getSession(chatId) {
  let s = sessions.get(chatId);
  if (!s) {
    s = {
      anki: { connected: false, queue: [], lastSeen: 0 },
      miniapp: { connected: false, queue: [], lastSeen: 0 },
    };
    sessions.set(chatId, s);
  }
  return s;
}

function cleanStaleSessions() {
  const now = Date.now();
  for (const [chatId, s] of sessions) {
    const ankiStale = now - s.anki.lastSeen > SESSION_TTL_MS;
    const miniStale = now - s.miniapp.lastSeen > SESSION_TTL_MS;
    if (ankiStale && miniStale) {
      sessions.delete(chatId);
    }
  }
}

function validateInitData(initDataStr, botToken) {
  if (!initDataStr || !botToken) return null;
  try {
    const params = new URLSearchParams(initDataStr);
    const hash = params.get("hash");
    params.delete("hash");
    const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
    const dataCheckString = sorted.map(([k, v]) => `${k}=${v}`).join("\n");
    const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
    const computedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
    if (computedHash !== hash) return null;
    const user = JSON.parse(params.get("user") || "{}");
    return String(user.id || "");
  } catch {
    return null;
  }
}

exports.relay = functions.region("europe-west1").https.onRequest(async (req, res) => {
  // CORS
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.status(204).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  cleanStaleSessions();

  const { action, chat_id, client, message, secret, init_data } = req.body || {};

  if (!action || !chat_id || !client) {
    res.status(400).json({ error: "Missing action, chat_id, or client" });
    return;
  }

  if (client !== "anki" && client !== "miniapp") {
    res.status(400).json({ error: "client must be 'anki' or 'miniapp'" });
    return;
  }

  // Auth: Anki uses shared secret, Mini App uses Telegram initData
  const botToken = functions.config().telegram?.bot_token || process.env.TELEGRAM_BOT_TOKEN || "";

  if (client === "anki") {
    const expectedSecret = functions.config().telegram?.relay_secret || process.env.RELAY_SECRET || "";
    if (!expectedSecret || secret !== expectedSecret) {
      res.status(401).json({ error: "Invalid secret" });
      return;
    }
  } else {
    const validatedChatId = validateInitData(init_data, botToken);
    if (!validatedChatId || validatedChatId !== String(chat_id)) {
      res.status(401).json({ error: "Invalid initData" });
      return;
    }
  }

  const session = getSession(String(chat_id));
  const self = session[client];
  const other = client === "anki" ? session.miniapp : session.anki;

  if (action === "register") {
    self.connected = true;
    self.lastSeen = Date.now();
    if (other.connected) {
      other.queue.push({ type: "peer_connected" });
    }
    res.json({ ok: true, peer_connected: other.connected });
    return;
  }

  if (action === "send") {
    self.lastSeen = Date.now();
    if (!message) { res.status(400).json({ error: "Missing message" }); return; }
    if (other.queue.length < MAX_QUEUE_SIZE) {
      other.queue.push(message);
    }
    res.json({ ok: true });
    return;
  }

  if (action === "poll") {
    self.lastSeen = Date.now();
    const messages = self.queue.splice(0);
    res.json({ ok: true, messages });
    return;
  }

  if (action === "disconnect") {
    self.connected = false;
    if (other.connected) {
      other.queue.push({ type: "peer_disconnected" });
    }
    res.json({ ok: true });
    return;
  }

  res.status(400).json({ error: "Unknown action" });
});
```

- [ ] **Step 2: Commit**

```bash
git add backend/relay.js
git commit -m "feat(backend): add polling-based relay for Telegram Mini App remote"
```

---

## Task 3: Python Relay Client — Core Module

**Files:**
- Create: `plusi/remote_ws.py`
- Create: `tests/test_remote_ws.py`

The Python client polls the relay, sends card state updates, and receives commands from the Mini App.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_remote_ws.py`:

```python
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
            chat_id="123",
            secret="test",
        )
        assert client.relay_url == "https://example.com/api/relay"
        assert client.chat_id == "123"
        assert not client.is_connected
        assert client.mode == "duo"

    def test_client_set_mode(self):
        from plusi.remote_ws import RelayClient
        client = RelayClient("https://x.com/api/relay", "1", "s")
        client.mode = "solo"
        assert client.mode == "solo"


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
        client = RelayClient("https://x.com/api/relay", "1", "s")
        events = []
        client.set_peer_change_handler(lambda c: events.append(c))
        client._handle_message({"type": "peer_connected"})
        assert events == [True]
        assert client.is_peer_connected

    def test_peer_disconnected_callback(self):
        from plusi.remote_ws import RelayClient
        client = RelayClient("https://x.com/api/relay", "1", "s")
        client._peer_connected = True
        events = []
        client.set_peer_change_handler(lambda c: events.append(c))
        client._handle_message({"type": "peer_disconnected"})
        assert events == [False]
        assert not client.is_peer_connected

    def test_action_callback(self):
        from plusi.remote_ws import RelayClient
        client = RelayClient("https://x.com/api/relay", "1", "s")
        actions = []
        client.set_action_handler(lambda t, p: actions.append((t, p)))
        client._handle_message({"type": "rate", "ease": 2})
        assert actions == [("rate", {"ease": 2})]

    def test_unknown_message_no_callback(self):
        from plusi.remote_ws import RelayClient
        client = RelayClient("https://x.com/api/relay", "1", "s")
        actions = []
        client.set_action_handler(lambda t, p: actions.append((t, p)))
        client._handle_message({"type": "bogus_xyz"})
        assert actions == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 run_tests.py -k test_remote_ws -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'plusi.remote_ws'`

- [ ] **Step 3: Implement the remote_ws module**

Create `plusi/remote_ws.py`:

```python
"""plusi/remote_ws.py — Polling relay client for Telegram Mini App remote.

Connects to the Firebase relay endpoint so a Telegram Mini App can control
Anki remotely. Runs a polling loop in a daemon thread.
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

try:
    from ..config import get_config
except ImportError:
    from config import get_config

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

POLL_INTERVAL = 0.5          # Seconds between polls
RETRY_DELAY = 5              # Seconds to wait after error
REQUEST_TIMEOUT = 10         # HTTP request timeout

# ---------------------------------------------------------------------------
# Message builders
# ---------------------------------------------------------------------------


def _build_card_state(phase, front_html, back_html, deck, current, total,
                      card_id, mc_options=None):
    """Build a card_state message for the Mini App."""
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


def _parse_action(msg):
    """Parse an incoming action message from the Mini App.

    Returns (action_type, params) tuple, or None if invalid.
    """
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
# HTTP helpers (stdlib only)
# ---------------------------------------------------------------------------


def _relay_post(relay_url, payload):
    """POST JSON to relay endpoint. Returns parsed response or None."""
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            relay_url,
            data=data,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError) as exc:
        logger.debug("remote_ws: relay post error: %s", exc)
        return None
    except Exception as exc:
        logger.error("remote_ws: unexpected relay error: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Relay Client
# ---------------------------------------------------------------------------


class RelayClient:
    """Manages connection to the Firebase relay for remote control."""

    def __init__(self, relay_url, chat_id, secret):
        self.relay_url = relay_url
        self.chat_id = str(chat_id)
        self.secret = secret
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
        """Set callback for incoming actions: handler(action_type, params)."""
        self._action_handler = handler

    def set_peer_change_handler(self, handler):
        """Set callback for peer connect/disconnect: handler(connected: bool)."""
        self._on_peer_change = handler

    def start(self):
        """Start the polling thread."""
        if self._thread and self._thread.is_alive():
            return True

        # Register with relay
        resp = _relay_post(self.relay_url, {
            "action": "register",
            "chat_id": self.chat_id,
            "client": "anki",
            "secret": self.secret,
        })
        if not resp or not resp.get("ok"):
            logger.error("remote_ws: relay registration failed")
            return False

        self._connected = True
        self._peer_connected = resp.get("peer_connected", False)

        if self._peer_connected and self._on_peer_change:
            self._on_peer_change(True)

        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._poll_loop,
            daemon=True,
            name="AnkiRemoteRelay",
        )
        self._thread.start()
        logger.info("remote_ws: started (peer_connected=%s)", self._peer_connected)
        return True

    def stop(self):
        """Stop polling and disconnect."""
        self._stop_event.set()
        self._connected = False

        _relay_post(self.relay_url, {
            "action": "disconnect",
            "chat_id": self.chat_id,
            "client": "anki",
            "secret": self.secret,
        })

        if self._peer_connected:
            self._peer_connected = False
            if self._on_peer_change:
                self._on_peer_change(False)

        logger.info("remote_ws: stopped")

    def send(self, message):
        """Send a message to the Mini App via relay."""
        if not self._connected:
            return
        _relay_post(self.relay_url, {
            "action": "send",
            "chat_id": self.chat_id,
            "client": "anki",
            "secret": self.secret,
            "message": message,
        })

    def send_card_state(self, phase, front_html, back_html, deck, current,
                        total, card_id, mc_options=None):
        """Convenience: send a card_state message."""
        msg = _build_card_state(phase, front_html, back_html, deck, current,
                                total, card_id, mc_options)
        self.send(msg)

    def _poll_loop(self):
        """Polling loop — runs in daemon thread."""
        while not self._stop_event.is_set():
            try:
                resp = _relay_post(self.relay_url, {
                    "action": "poll",
                    "chat_id": self.chat_id,
                    "client": "anki",
                    "secret": self.secret,
                })

                if resp and resp.get("ok"):
                    for msg in resp.get("messages", []):
                        self._handle_message(msg)

            except Exception as exc:
                logger.error("remote_ws: poll error: %s", exc)
                if not self._stop_event.is_set():
                    self._stop_event.wait(RETRY_DELAY)
                    continue

            self._stop_event.wait(POLL_INTERVAL)

        logger.info("remote_ws: poll loop exited")

    def _handle_message(self, msg):
        """Process a single message from the relay."""
        msg_type = msg.get("type", "")

        if msg_type == "peer_connected":
            self._peer_connected = True
            if self._on_peer_change:
                self._on_peer_change(True)
            logger.info("remote_ws: Mini App connected")
            return

        if msg_type == "peer_disconnected":
            self._peer_connected = False
            if self._on_peer_change:
                self._on_peer_change(False)
            logger.info("remote_ws: Mini App disconnected")
            return

        parsed = _parse_action(msg)
        if parsed and self._action_handler:
            action_type, params = parsed
            logger.info("remote_ws: action %s %s", action_type, params)
            self._action_handler(action_type, params)


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_client = None


def get_client():
    """Get or create the singleton RelayClient."""
    global _client
    if _client is None:
        config = get_config()
        tg = config.get("telegram", {})
        relay_url = tg.get("relay_url", "").strip()
        secret = tg.get("relay_secret", "").strip()
        chat_id = tg.get("chat_id", "")
        if not relay_url or not secret:
            return None
        _client = RelayClient(relay_url, chat_id, secret)
    return _client


def start_remote():
    """Start the remote relay client if configured."""
    client = get_client()
    if not client:
        logger.debug("remote_ws: not configured (no relay_url or relay_secret)")
        return False
    return client.start()


def stop_remote():
    """Stop the remote relay client."""
    if _client is not None:
        _client.stop()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 run_tests.py -k test_remote_ws -v`
Expected: All 20 tests PASS

- [ ] **Step 5: Commit**

```bash
git add plusi/remote_ws.py tests/test_remote_ws.py
git commit -m "feat(plusi): add relay polling client for Telegram Mini App remote"
```

---

## Task 4: Wire Remote Client into Anki Lifecycle

**Files:**
- Modify: `__init__.py:479-493`
- Modify: `plusi/telegram.py:529-581`

- [ ] **Step 1: Add remote start/stop and action handler to __init__.py**

After `_start_telegram_bot()` (line 486), add these functions and the call in `on_profile_loaded()`:

```python
def _start_remote_relay():
    """Start remote relay client if configured."""
    try:
        from .plusi.remote_ws import start_remote, get_client
        if start_remote():
            logger.info("Remote relay started")
            client = get_client()
            if client:
                client.set_action_handler(_handle_remote_action)
                client.set_peer_change_handler(_handle_peer_change)
    except Exception as e:
        logger.error("Remote relay start failed: %s", e)


def _handle_remote_action(action_type, params):
    """Handle incoming actions from the Mini App."""
    from .plusi.telegram import (
        _rate_card, _show_answer, _get_current_card, _open_deck,
        _get_deck_list, _get_anki_state, _run_on_main,
    )
    from .plusi.remote_ws import get_client
    client = get_client()
    if not client:
        return

    if action_type == "flip":
        _show_answer()
        import time
        time.sleep(0.3)
        _send_current_card_state(client, phase="answer")

    elif action_type == "rate":
        ease = params.get("ease", 3)
        _rate_card(ease)
        import time
        time.sleep(0.3)
        _send_current_card_state(client, phase="question")

    elif action_type == "open_deck":
        deck_id = params.get("deck_id")
        if deck_id:
            _open_deck(int(deck_id))
            import time
            time.sleep(0.5)
            _send_current_card_state(client, phase="question")

    elif action_type == "set_mode":
        mode = params.get("mode", "duo")
        client.mode = mode
        logger.info("remote: mode set to %s", mode)

    elif action_type == "get_decks":
        decks = _get_deck_list()
        client.send({"type": "deck_list", "decks": decks})


def _send_current_card_state(client, phase="question"):
    """Send current card state to the Mini App."""
    from .plusi.telegram import _get_current_card, _get_anki_state, _run_on_main

    state = _get_anki_state()
    if state == "review_answer":
        phase = "answer"
    elif state == "review_question":
        phase = "question"

    card = _get_current_card()
    if not card or "error" in card:
        client.send({"type": "card_state", "phase": "no_card",
                      "front_html": "", "back_html": "", "deck": "",
                      "progress": {"current": 0, "total": 0}, "card_id": 0})
        return

    def _get_counts():
        import time as _time
        from aqt import mw
        if not mw or not mw.col:
            return (0, 0)
        counts = mw.col.sched.counts()
        total = sum(counts)
        reviewed = 0
        try:
            reviewed = mw.col.db.scalar(
                "SELECT count() FROM revlog WHERE id > ?",
                int((_time.time() - 86400) * 1000))
        except Exception:
            pass
        return (reviewed, reviewed + total)

    counts = _run_on_main(_get_counts) or (0, 0)

    client.send_card_state(
        phase=phase,
        front_html=card.get("front", ""),
        back_html=card.get("back", ""),
        deck=card.get("deck", ""),
        current=counts[0],
        total=counts[1],
        card_id=card.get("card_id", 0),
    )


def _handle_peer_change(connected):
    """Handle Mini App connect/disconnect — notify React frontend."""
    try:
        from .ui.main_view import get_main_view
        import json as _json
        view = get_main_view()
        if view and hasattr(view, '_chatbot') and view._chatbot and view._chatbot.web_view:
            payload = _json.dumps({
                "type": "remoteConnected" if connected else "remoteDisconnected",
                "data": {"connected": connected}
            })
            view._chatbot.web_view.page().runJavaScript(
                f"window.ankiReceive && window.ankiReceive({payload});"
            )
        if connected:
            from .plusi.remote_ws import get_client
            client = get_client()
            if client:
                _send_current_card_state(client)
    except Exception as exc:
        logger.debug("remote: peer_change notify error: %s", exc)
```

Then add `_start_remote_relay()` call in `on_profile_loaded()` and `stop_remote()` in `cleanup_addon()`:

```python
def on_profile_loaded():
    """Wird aufgerufen, wenn das Profil geladen ist"""
    init_addon()
    _init_plusi_systems()
    _start_telegram_bot()
    _start_remote_relay()
```

In `cleanup_addon()`:
```python
    try:
        from .plusi.remote_ws import stop_remote
        stop_remote()
    except Exception:
        pass
```

- [ ] **Step 2: Update /remote command in telegram.py**

In `plusi/telegram.py`, modify the `/remote` command handler (around line 543) to open Mini App when configured:

```python
        elif cmd == "/remote":
            config = get_config()
            tg_config = config.get("telegram", {})
            relay_url = tg_config.get("relay_url", "").strip()
            if relay_url:
                app_url = relay_url.replace("/api/relay", "/remote")
                _send_message_kb(token, chat_id,
                    "AnkiPlus Remote",
                    [[{"text": "Remote öffnen",
                       "web_app": {"url": app_url}}]])
            else:
                self._send_remote(token, chat_id)
```

- [ ] **Step 3: Run all tests**

Run: `python3 run_tests.py -v`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add __init__.py plusi/telegram.py
git commit -m "feat: wire remote relay into Anki lifecycle and telegram /remote command"
```

---

## Task 5: Desktop React — Remote Connected State

**Files:**
- Create: `frontend/src/components/RemotePill.jsx`
- Modify: `frontend/src/App.jsx:2903-2929`

- [ ] **Step 1: Create RemotePill component**

Create `frontend/src/components/RemotePill.jsx`:

```jsx
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone } from 'lucide-react';

const PILL_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--ds-space-xs)',
  padding: 'var(--ds-space-xs) var(--ds-space-md)',
  fontSize: 'var(--ds-text-sm)',
  color: 'var(--ds-text-secondary)',
  borderRadius: 'var(--ds-radius-full)',
  background: 'var(--ds-bg-frosted)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid var(--ds-border)',
};

const DOT_STYLE = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: 'var(--ds-green)',
};

const RemotePill = ({ visible }) => (
  <AnimatePresence>
    {visible && (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ duration: 0.25 }}
        style={PILL_STYLE}
      >
        <span style={DOT_STYLE} />
        <Smartphone size={14} />
        <span>Remote verbunden</span>
      </motion.div>
    )}
  </AnimatePresence>
);

export default React.memo(RemotePill);
```

- [ ] **Step 2: Add remoteConnected state to App.jsx**

Add state declaration near the other useState calls:

```jsx
const [remoteConnected, setRemoteConnected] = useState(false);
```

In the message handler (where `window.ankiReceive` messages are processed), add cases:

```jsx
case 'remoteConnected':
  setRemoteConnected(true);
  break;
case 'remoteDisconnected':
  setRemoteConnected(false);
  break;
```

- [ ] **Step 3: Add slide-out animation to ChatInput wrapper**

Modify the ChatInput wrapper div (line ~2904). Add `transform` and `opacity` for the slide-out, and add the RemotePill after it:

In the wrapper `style` object, add these properties:

```jsx
transform: remoteConnected ? 'translateY(calc(100% + 40px))' : 'translateY(0)',
opacity: remoteConnected ? 0 : 1,
pointerEvents: remoteConnected ? 'none' : 'auto',
```

After the ChatInput wrapper closing `</div>`, add:

```jsx
<div style={{
  position: 'fixed', zIndex: 60,
  bottom: 'var(--ds-space-xl)',
  left: '50%',
  transform: 'translateX(-50%)',
}}>
  <RemotePill visible={remoteConnected} />
</div>
```

- [ ] **Step 4: Import RemotePill at top of App.jsx**

```jsx
import RemotePill from './components/RemotePill';
```

- [ ] **Step 5: Build and verify**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/RemotePill.jsx frontend/src/App.jsx
git commit -m "feat(frontend): add remote connected state with input slide-out animation"
```

---

## Task 6: Mini App — Project Setup

**Files:**
- Create: `remote/package.json`
- Create: `remote/vite.config.js`
- Create: `remote/tailwind.config.js`
- Create: `remote/postcss.config.js`
- Create: `remote/index.html`
- Create: `remote/src/main.jsx`
- Create: `remote/src/styles/index.css`

- [ ] **Step 1: Create package.json**

Create `remote/package.json`:

```json
{
  "name": "ankiplus-remote",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "framer-motion": "^11.0.0",
    "lucide-react": "^0.300.0",
    "@twa-dev/sdk": "^7.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.0",
    "vite": "^5.0.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0"
  }
}
```

- [ ] **Step 2: Create vite.config.js**

Create `remote/vite.config.js`:

```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: true,
  },
  base: '/remote/',
  server: {
    port: 3001,
  },
});
```

- [ ] **Step 3: Create tailwind.config.js**

Create `remote/tailwind.config.js`:

```javascript
import sharedPreset from '../shared/config/tailwind.preset.js';

export default {
  presets: [sharedPreset],
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    './index.html',
  ],
};
```

- [ ] **Step 4: Create postcss.config.js**

Create `remote/postcss.config.js`:

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 5: Create index.html**

Create `remote/index.html`:

```html
<!DOCTYPE html>
<html lang="de" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>AnkiPlus Remote</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
```

- [ ] **Step 6: Create main.jsx**

Create `remote/src/main.jsx`:

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 7: Create index.css**

Create `remote/src/styles/index.css`:

```css
@import '../../../shared/styles/design-system.css';
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  background: var(--ds-bg-deep);
  color: var(--ds-text-primary);
  font-family: var(--ds-font-body);
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
  height: 100vh;
  height: 100dvh;
}

#root {
  height: 100%;
}
```

- [ ] **Step 8: Install dependencies and verify build**

Run: `cd remote && npm install && npm run build`
Expected: Build succeeds

- [ ] **Step 9: Commit**

```bash
git add remote/
git commit -m "feat(remote): scaffold Telegram Mini App project"
```

---

## Task 7: Mini App — Hooks

**Files:**
- Create: `remote/src/hooks/useRemoteSocket.js`
- Create: `remote/src/hooks/useCardState.js`

- [ ] **Step 1: Create useRemoteSocket**

Create `remote/src/hooks/useRemoteSocket.js`:

```jsx
import { useState, useEffect, useRef, useCallback } from 'react';

const POLL_INTERVAL = 500;
const RECONNECT_DELAY = 3000;

export default function useRemoteSocket(relayUrl, chatId, initData) {
  const [connected, setConnected] = useState(false);
  const [peerConnected, setPeerConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const pollRef = useRef(null);

  const post = useCallback(async (payload) => {
    try {
      const resp = await fetch(relayUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, chat_id: chatId, client: 'miniapp', init_data: initData }),
      });
      return await resp.json();
    } catch {
      return null;
    }
  }, [relayUrl, chatId, initData]);

  useEffect(() => {
    if (!relayUrl || !chatId) return;
    let active = true;

    async function register() {
      const resp = await post({ action: 'register' });
      if (resp?.ok && active) {
        setConnected(true);
        setPeerConnected(resp.peer_connected || false);
        startPolling();
      } else if (active) {
        setTimeout(register, RECONNECT_DELAY);
      }
    }

    function startPolling() {
      pollRef.current = setInterval(async () => {
        if (!active) return;
        const resp = await post({ action: 'poll' });
        if (resp?.ok && resp.messages?.length) {
          for (const msg of resp.messages) {
            if (msg.type === 'peer_connected') setPeerConnected(true);
            else if (msg.type === 'peer_disconnected') setPeerConnected(false);
            else setMessages(prev => [...prev, msg]);
          }
        }
      }, POLL_INTERVAL);
    }

    register();

    return () => {
      active = false;
      if (pollRef.current) clearInterval(pollRef.current);
      post({ action: 'disconnect' });
      setConnected(false);
    };
  }, [relayUrl, chatId, post]);

  const consumeMessages = useCallback(() => {
    const current = [...messages];
    setMessages([]);
    return current;
  }, [messages]);

  const send = useCallback((message) => {
    post({ action: 'send', message });
  }, [post]);

  return { connected, peerConnected, send, messages, consumeMessages };
}
```

- [ ] **Step 2: Create useCardState**

Create `remote/src/hooks/useCardState.js`:

```jsx
import { useState, useEffect, useRef } from 'react';

export default function useCardState(messages, consumeMessages) {
  const [card, setCard] = useState(null);
  const [phase, setPhase] = useState('waiting');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [mcOptions, setMcOptions] = useState(null);
  const [deckList, setDeckList] = useState([]);
  const [cardKey, setCardKey] = useState(0);
  const prevCardId = useRef(null);

  useEffect(() => {
    if (!messages.length) return;
    const batch = consumeMessages();

    for (const msg of batch) {
      switch (msg.type) {
        case 'card_state': {
          const newCardId = msg.card_id;
          if (newCardId !== prevCardId.current) {
            setCardKey(k => k + 1);
            prevCardId.current = newCardId;
          }
          setCard({
            id: newCardId,
            frontHtml: msg.front_html,
            backHtml: msg.back_html,
            deck: msg.deck,
          });
          setPhase(msg.phase);
          setProgress(msg.progress || { current: 0, total: 0 });
          setMcOptions(msg.mc_options || null);
          break;
        }
        case 'mc_options':
          setMcOptions(msg.options);
          break;
        case 'mc_clear':
          setMcOptions(null);
          break;
        case 'deck_list':
          setDeckList(msg.decks || []);
          break;
        default:
          break;
      }
    }
  }, [messages, consumeMessages]);

  return { card, phase, progress, mcOptions, deckList, cardKey };
}
```

- [ ] **Step 3: Commit**

```bash
git add remote/src/hooks/
git commit -m "feat(remote): add useRemoteSocket and useCardState hooks"
```

---

## Task 8: Mini App — Core Components

**Files:**
- Create: `remote/src/components/ConnectingScreen.jsx`
- Create: `remote/src/components/ProgressBar.jsx`
- Create: `remote/src/components/RatingButtons.jsx`
- Create: `remote/src/components/DeckPicker.jsx`

- [ ] **Step 1: Create ConnectingScreen**

Create `remote/src/components/ConnectingScreen.jsx`:

```jsx
import React from 'react';
import { motion } from 'framer-motion';

const CONTAINER_STYLE = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  gap: 'var(--ds-space-lg)',
  color: 'var(--ds-text-secondary)',
};

const DOT_STYLE = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: 'var(--ds-accent)',
};

const ConnectingScreen = ({ peerConnected }) => (
  <div style={CONTAINER_STYLE}>
    <motion.div
      style={DOT_STYLE}
      animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 1.5, repeat: Infinity }}
    />
    <p style={{ fontSize: 'var(--ds-text-lg)' }}>
      {peerConnected ? 'Verbunden' : 'Verbinde mit Anki...'}
    </p>
    {!peerConnected && (
      <p style={{ fontSize: 'var(--ds-text-sm)', color: 'var(--ds-text-tertiary)' }}>
        Starte Anki auf deinem Computer
      </p>
    )}
  </div>
);

export default React.memo(ConnectingScreen);
```

- [ ] **Step 2: Create ProgressBar**

Create `remote/src/components/ProgressBar.jsx`:

```jsx
import React from 'react';

const BAR_STYLE = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: 'var(--ds-space-sm) var(--ds-space-lg)',
  fontSize: 'var(--ds-text-sm)',
  color: 'var(--ds-text-secondary)',
};

const DECK_STYLE = {
  fontWeight: 500,
  color: 'var(--ds-text-primary)',
};

const ProgressBar = ({ deck, current, total }) => (
  <div style={BAR_STYLE}>
    <span style={DECK_STYLE}>{deck}</span>
    <span>{current}/{total}</span>
  </div>
);

export default React.memo(ProgressBar);
```

- [ ] **Step 3: Create RatingButtons**

Create `remote/src/components/RatingButtons.jsx`:

```jsx
import React from 'react';
import { motion } from 'framer-motion';

const GRID_STYLE = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 'var(--ds-space-sm)',
  padding: 'var(--ds-space-md)',
};

const RATINGS = [
  { ease: 1, label: 'Nochmal', color: 'var(--ds-red)' },
  { ease: 2, label: 'Schwer', color: 'var(--ds-yellow)' },
  { ease: 3, label: 'Gut', color: 'var(--ds-green)' },
  { ease: 4, label: 'Leicht', color: 'var(--ds-accent)' },
];

const BUTTON_BASE = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 'var(--ds-space-lg) var(--ds-space-md)',
  borderRadius: 'var(--ds-radius-lg)',
  border: '1px solid var(--ds-border)',
  background: 'var(--ds-bg-frosted)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  cursor: 'pointer',
  minHeight: 72,
  gap: 'var(--ds-space-2xs)',
};

const RatingButton = React.memo(({ ease, label, color, onRate }) => (
  <motion.button
    style={BUTTON_BASE}
    whileTap={{ scale: 0.95 }}
    onClick={() => onRate(ease)}
  >
    <span style={{ fontSize: 'var(--ds-text-xl)', fontWeight: 600, color }}>{ease}</span>
    <span style={{ fontSize: 'var(--ds-text-sm)', color: 'var(--ds-text-secondary)' }}>{label}</span>
  </motion.button>
));

const RatingButtons = ({ onRate }) => (
  <div style={GRID_STYLE}>
    {RATINGS.map(r => (
      <RatingButton key={r.ease} {...r} onRate={onRate} />
    ))}
  </div>
);

export default React.memo(RatingButtons);
```

- [ ] **Step 4: Create DeckPicker**

Create `remote/src/components/DeckPicker.jsx`:

```jsx
import React from 'react';
import { motion } from 'framer-motion';

const LIST_STYLE = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--ds-space-xs)',
  padding: 'var(--ds-space-md)',
  overflowY: 'auto',
  flex: 1,
};

const ITEM_STYLE = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: 'var(--ds-space-md) var(--ds-space-lg)',
  borderRadius: 'var(--ds-radius-lg)',
  background: 'var(--ds-bg-canvas)',
  border: '1px solid var(--ds-border)',
  cursor: 'pointer',
};

const NAME_STYLE = {
  fontSize: 'var(--ds-text-md)',
  fontWeight: 500,
  color: 'var(--ds-text-primary)',
};

const COUNTS_STYLE = {
  fontSize: 'var(--ds-text-sm)',
  color: 'var(--ds-text-tertiary)',
};

const DeckItem = React.memo(({ deck, onOpen }) => {
  const shortName = deck.name.includes('::')
    ? deck.name.split('::').pop()
    : deck.name;

  return (
    <motion.div
      style={ITEM_STYLE}
      whileTap={{ scale: 0.98 }}
      onClick={() => onOpen(deck.id)}
    >
      <span style={NAME_STYLE}>{shortName}</span>
      <span style={COUNTS_STYLE}>
        {deck.new || 0} · {deck.learn || 0} · {deck.review || 0}
      </span>
    </motion.div>
  );
});

const HEADER_STYLE = {
  padding: 'var(--ds-space-lg) var(--ds-space-lg) var(--ds-space-sm)',
  fontSize: 'var(--ds-text-xl)',
  fontWeight: 600,
  color: 'var(--ds-text-primary)',
};

const DeckPicker = ({ decks, onOpenDeck }) => (
  <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <div style={HEADER_STYLE}>Stapel</div>
    <div style={LIST_STYLE}>
      {decks.filter(d => !d.name.includes('::')).map(deck => (
        <DeckItem key={deck.id} deck={deck} onOpen={onOpenDeck} />
      ))}
    </div>
  </div>
);

export default React.memo(DeckPicker);
```

- [ ] **Step 5: Commit**

```bash
git add remote/src/components/ConnectingScreen.jsx remote/src/components/ProgressBar.jsx remote/src/components/RatingButtons.jsx remote/src/components/DeckPicker.jsx
git commit -m "feat(remote): add ConnectingScreen, ProgressBar, RatingButtons, DeckPicker"
```

---

## Task 9: Mini App — Review Screens

**Files:**
- Create: `remote/src/components/CardHTML.jsx`
- Create: `remote/src/components/QuestionScreen.jsx`
- Create: `remote/src/components/AnswerScreen.jsx`
- Create: `remote/src/components/MCScreen.jsx`

- [ ] **Step 1: Create CardHTML (Solo mode card renderer)**

Create `remote/src/components/CardHTML.jsx`:

Note: Card HTML comes from Anki's own renderer (trusted content from user's own cards). We use a sandboxed iframe to isolate card styles from the app styles.

```jsx
import React, { useMemo } from 'react';

const FRAME_STYLE = {
  width: '100%',
  flex: 1,
  border: 'none',
  background: 'transparent',
};

const CardHTML = ({ html }) => {
  const srcDoc = useMemo(() => `
    <!DOCTYPE html>
    <html><head>
      <meta charset="UTF-8">
      <style>
        body { margin: 0; padding: 16px; font-family: system-ui; font-size: 16px;
               line-height: 1.6; color: #e5e5e5; background: transparent; }
        img { max-width: 100%; height: auto; }
      </style>
    </head><body>${html || ''}</body></html>
  `, [html]);

  return (
    <iframe
      srcDoc={srcDoc}
      sandbox="allow-same-origin"
      style={FRAME_STYLE}
      title="Card content"
    />
  );
};

export default React.memo(CardHTML);
```

- [ ] **Step 2: Create QuestionScreen**

Create `remote/src/components/QuestionScreen.jsx`:

```jsx
import React from 'react';
import { motion } from 'framer-motion';
import ProgressBar from './ProgressBar';
import CardHTML from './CardHTML';

const CONTAINER_STYLE = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
};

const CENTER_STYLE = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const FLIP_BUTTON_STYLE = {
  padding: 'var(--ds-space-lg) var(--ds-space-2xl)',
  borderRadius: 'var(--ds-radius-lg)',
  background: 'var(--ds-bg-frosted)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid var(--ds-border)',
  color: 'var(--ds-text-primary)',
  fontSize: 'var(--ds-text-lg)',
  fontWeight: 500,
  cursor: 'pointer',
  width: 'calc(100% - 2 * var(--ds-space-lg))',
  margin: 'var(--ds-space-md) var(--ds-space-lg)',
};

const QuestionScreen = ({ card, progress, mode, onFlip }) => (
  <div style={CONTAINER_STYLE}>
    <ProgressBar deck={card.deck} current={progress.current} total={progress.total} />

    {mode === 'solo' ? (
      <>
        <CardHTML html={card.frontHtml} />
        <motion.button
          style={FLIP_BUTTON_STYLE}
          whileTap={{ scale: 0.97 }}
          onClick={onFlip}
        >
          Antwort zeigen
        </motion.button>
      </>
    ) : (
      <div style={CENTER_STYLE}>
        <motion.button
          style={{ ...FLIP_BUTTON_STYLE, width: 'auto', padding: 'var(--ds-space-2xl) var(--ds-space-3xl)' }}
          whileTap={{ scale: 0.97 }}
          onClick={onFlip}
        >
          Antwort zeigen
        </motion.button>
      </div>
    )}
  </div>
);

export default React.memo(QuestionScreen);
```

- [ ] **Step 3: Create AnswerScreen**

Create `remote/src/components/AnswerScreen.jsx`:

```jsx
import React from 'react';
import ProgressBar from './ProgressBar';
import RatingButtons from './RatingButtons';
import CardHTML from './CardHTML';

const CONTAINER_STYLE = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
};

const DIVIDER_STYLE = {
  height: 1,
  background: 'var(--ds-border)',
  margin: '0 var(--ds-space-lg)',
};

const AnswerScreen = ({ card, progress, mode, onRate }) => (
  <div style={CONTAINER_STYLE}>
    <ProgressBar deck={card.deck} current={progress.current} total={progress.total} />

    {mode === 'solo' && (
      <>
        <CardHTML html={card.frontHtml} />
        <div style={DIVIDER_STYLE} />
        <CardHTML html={card.backHtml} />
      </>
    )}

    <div style={{ marginTop: 'auto' }}>
      <RatingButtons onRate={onRate} />
    </div>
  </div>
);

export default React.memo(AnswerScreen);
```

- [ ] **Step 4: Create MCScreen**

Create `remote/src/components/MCScreen.jsx`:

```jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import ProgressBar from './ProgressBar';
import RatingButtons from './RatingButtons';

const LIST_STYLE = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--ds-space-sm)',
  padding: 'var(--ds-space-md)',
  flex: 1,
};

const OPTION_BASE = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--ds-space-md)',
  padding: 'var(--ds-space-md) var(--ds-space-lg)',
  borderRadius: 'var(--ds-radius-lg)',
  border: '1px solid var(--ds-border)',
  background: 'var(--ds-bg-canvas)',
  cursor: 'pointer',
  fontSize: 'var(--ds-text-md)',
  color: 'var(--ds-text-primary)',
  textAlign: 'left',
  width: '100%',
};

const LETTER_STYLE = {
  fontFamily: 'var(--ds-font-mono)',
  fontWeight: 600,
  color: 'var(--ds-text-secondary)',
  minWidth: 24,
};

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

const MCScreen = ({ card, progress, mcOptions, onSelect, onRate }) => {
  const [selected, setSelected] = useState(null);
  const [showRating, setShowRating] = useState(false);

  const handleSelect = (option, index) => {
    if (selected !== null) return;
    setSelected(index);
    onSelect(option.id);
    setTimeout(() => setShowRating(true), 800);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ProgressBar deck={card.deck} current={progress.current} total={progress.total} />

      {!showRating ? (
        <div style={LIST_STYLE}>
          {mcOptions.map((opt, i) => (
            <motion.button
              key={opt.id}
              style={{
                ...OPTION_BASE,
                borderColor: selected === i ? 'var(--ds-accent)' : 'var(--ds-border)',
                background: selected === i ? 'var(--ds-accent-10)' : 'var(--ds-bg-canvas)',
              }}
              whileTap={selected === null ? { scale: 0.98 } : {}}
              onClick={() => handleSelect(opt, i)}
            >
              <span style={LETTER_STYLE}>{LETTERS[i]})</span>
              <span>{opt.text}</span>
            </motion.button>
          ))}
        </div>
      ) : (
        <div style={{ marginTop: 'auto' }}>
          <RatingButtons onRate={onRate} />
        </div>
      )}
    </div>
  );
};

export default React.memo(MCScreen);
```

- [ ] **Step 5: Commit**

```bash
git add remote/src/components/CardHTML.jsx remote/src/components/QuestionScreen.jsx remote/src/components/AnswerScreen.jsx remote/src/components/MCScreen.jsx
git commit -m "feat(remote): add review screens (Question, Answer, MC, CardHTML)"
```

---

## Task 10: Mini App — Main App Shell

**Files:**
- Create: `remote/src/App.jsx`

- [ ] **Step 1: Create App.jsx**

Create `remote/src/App.jsx`:

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import useRemoteSocket from './hooks/useRemoteSocket';
import useCardState from './hooks/useCardState';
import ConnectingScreen from './components/ConnectingScreen';
import DeckPicker from './components/DeckPicker';
import QuestionScreen from './components/QuestionScreen';
import AnswerScreen from './components/AnswerScreen';
import MCScreen from './components/MCScreen';

const tg = window.Telegram?.WebApp;

const INIT_DATA = tg?.initData || '';
const CHAT_ID = (() => {
  try {
    const user = tg?.initDataUnsafe?.user;
    return user?.id ? String(user.id) : '';
  } catch { return ''; }
})();

const RELAY_URL = window.location.origin + '/api/relay';

const SLIDE_VARIANTS = {
  enter: { x: '100%', opacity: 0 },
  center: { x: 0, opacity: 1 },
  exit: { x: '-100%', opacity: 0 },
};

const SLIDE_TRANSITION = { duration: 0.25, ease: [0.25, 1, 0.5, 1] };

const CONTAINER_STYLE = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',
  overflow: 'hidden',
};

const MODE_TOGGLE_STYLE = {
  display: 'flex',
  gap: 'var(--ds-space-xs)',
  padding: 'var(--ds-space-xs)',
  borderRadius: 'var(--ds-radius-full)',
  background: 'var(--ds-bg-canvas)',
  border: '1px solid var(--ds-border)',
  margin: 'var(--ds-space-sm) var(--ds-space-lg)',
};

const MODE_BTN = {
  flex: 1,
  padding: 'var(--ds-space-xs) var(--ds-space-md)',
  borderRadius: 'var(--ds-radius-full)',
  border: 'none',
  cursor: 'pointer',
  fontSize: 'var(--ds-text-sm)',
  fontWeight: 500,
  transition: 'all 0.2s',
};

export default function App() {
  const [mode, setMode] = useState(() => localStorage.getItem('remote-mode') || 'duo');
  const { connected, peerConnected, send, messages, consumeMessages } = useRemoteSocket(RELAY_URL, CHAT_ID, INIT_DATA);
  const { card, phase, progress, mcOptions, deckList, cardKey } = useCardState(messages, consumeMessages);
  const [view, setView] = useState('remote');

  useEffect(() => {
    if (tg) { tg.expand(); tg.ready(); }
  }, []);

  useEffect(() => {
    localStorage.setItem('remote-mode', mode);
    send({ type: 'set_mode', mode });
  }, [mode, send]);

  useEffect(() => {
    if (view === 'decks') send({ type: 'get_decks' });
  }, [view, send]);

  const handleFlip = useCallback(() => send({ type: 'flip' }), [send]);
  const handleRate = useCallback((ease) => send({ type: 'rate', ease }), [send]);
  const handleMCSelect = useCallback((optionId) => send({ type: 'mc_select', option_id: optionId }), [send]);
  const handleOpenDeck = useCallback((deckId) => {
    send({ type: 'open_deck', deck_id: deckId });
    setView('remote');
  }, [send]);

  if (!connected || !peerConnected || !card) {
    return (
      <div style={CONTAINER_STYLE}>
        <ConnectingScreen peerConnected={peerConnected} />
      </div>
    );
  }

  if (view === 'decks') {
    return (
      <div style={CONTAINER_STYLE}>
        <DeckPicker decks={deckList} onOpenDeck={handleOpenDeck} />
        <motion.button
          style={{ ...MODE_BTN, background: 'var(--ds-bg-canvas)', color: 'var(--ds-text-secondary)',
                   margin: 'var(--ds-space-md)', border: '1px solid var(--ds-border)' }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setView('remote')}
        >
          Zurück
        </motion.button>
      </div>
    );
  }

  return (
    <div style={CONTAINER_STYLE}>
      <div style={MODE_TOGGLE_STYLE}>
        {['duo', 'solo'].map(m => (
          <button key={m} style={{
            ...MODE_BTN,
            background: mode === m ? 'var(--ds-accent-10)' : 'transparent',
            color: mode === m ? 'var(--ds-accent)' : 'var(--ds-text-tertiary)',
          }} onClick={() => setMode(m)}>
            {m === 'duo' ? 'Duo' : 'Solo'}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={`${cardKey}-${phase}`}
            variants={SLIDE_VARIANTS}
            initial="enter"
            animate="center"
            exit="exit"
            transition={SLIDE_TRANSITION}
            style={{ position: 'absolute', inset: 0 }}
          >
            {mcOptions && phase === 'question' ? (
              <MCScreen card={card} progress={progress} mcOptions={mcOptions}
                        onSelect={handleMCSelect} onRate={handleRate} />
            ) : phase === 'question' ? (
              <QuestionScreen card={card} progress={progress} mode={mode} onFlip={handleFlip} />
            ) : phase === 'answer' ? (
              <AnswerScreen card={card} progress={progress} mode={mode} onRate={handleRate} />
            ) : (
              <ConnectingScreen peerConnected={false} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <motion.button
        style={{ ...MODE_BTN, background: 'transparent', color: 'var(--ds-text-tertiary)',
                 margin: 'var(--ds-space-xs) var(--ds-space-lg) var(--ds-space-md)',
                 border: 'none', fontSize: 'var(--ds-text-xs)' }}
        whileTap={{ scale: 0.97 }}
        onClick={() => setView('decks')}
      >
        Deck wechseln
      </motion.button>
    </div>
  );
}
```

- [ ] **Step 2: Build and verify**

Run: `cd remote && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add remote/src/App.jsx
git commit -m "feat(remote): add main App shell with mode toggle, slide transitions, deck picker"
```

---

## Task 11: Telegram Bot Menu Button

**Files:**
- Modify: `plusi/telegram.py:387-407` (in `TelegramBot.start()`)

- [ ] **Step 1: Register Mini App menu button on bot start**

In `plusi/telegram.py`, after the token verification succeeds (after line 407), add:

```python
            # Register Mini App menu button if relay is configured
            try:
                tg_config = config.get("telegram", {})
                relay_url = tg_config.get("relay_url", "").strip()
                if relay_url:
                    app_url = relay_url.replace("/api/relay", "/remote")
                    _api_call(token, "setChatMenuButton", {
                        "menu_button": {
                            "type": "web_app",
                            "text": "Remote",
                            "web_app": {"url": app_url},
                        }
                    })
                    logger.info("telegram: Mini App menu button set")
            except Exception as exc:
                logger.warning("telegram: setChatMenuButton failed: %s", exc)
```

- [ ] **Step 2: Run all tests**

Run: `python3 run_tests.py -v`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add plusi/telegram.py
git commit -m "feat(telegram): register Mini App menu button on bot start"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Config extension | `config.py`, `tests/test_config.py` |
| 2 | Relay endpoint | `backend/relay.js` |
| 3 | Python relay client + tests | `plusi/remote_ws.py`, `tests/test_remote_ws.py` |
| 4 | Anki lifecycle wiring | `__init__.py`, `plusi/telegram.py` |
| 5 | Desktop remote state | `RemotePill.jsx`, `App.jsx` |
| 6 | Mini App scaffold | `remote/` (project setup) |
| 7 | Mini App hooks | `useRemoteSocket.js`, `useCardState.js` |
| 8 | Core components | 4 components (Connecting, Progress, Rating, Deck) |
| 9 | Review screens | 4 components (CardHTML, Question, Answer, MC) |
| 10 | App shell | `remote/src/App.jsx` |
| 11 | Bot menu button | `plusi/telegram.py` |
