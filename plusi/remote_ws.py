"""plusi/remote_ws.py — Polling relay client for PWA remote.

Connects to the Firebase relay endpoint so a PWA on the user's phone can
control Anki remotely. Uses pair-code auth: Anki creates a pair code, the
user scans a QR, the PWA joins using the code. Runs a polling loop in a
daemon thread.
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

    def __init__(self, relay_url, secret):
        self.relay_url = relay_url
        self.secret = secret
        self.pair_code = None
        self.session_token = None
        self.mode = "duo"
        self._connected = False
        self._peer_connected = False
        self._stop_event = threading.Event()
        self._thread = None
        self._action_handler = None
        self._on_peer_change = None
        self._on_pair_created = None

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

    def set_pair_created_handler(self, handler):
        """Set callback fired when a pair is created: handler(pair_code: str)."""
        self._on_pair_created = handler

    def _build_create_pair_payload(self):
        """Return the create_pair action payload."""
        return {"action": "create_pair", "secret": self.secret}

    def start(self):
        """Start the polling thread."""
        if self._thread and self._thread.is_alive():
            return True

        # Create pair with relay
        resp = _relay_post(self.relay_url, self._build_create_pair_payload())
        if not resp or not resp.get("ok"):
            logger.error("remote_ws: relay pair creation failed")
            return False

        self.pair_code = resp.get("pair_code")
        self.session_token = resp.get("session_token")

        if not self.pair_code or not self.session_token:
            logger.error("remote_ws: relay response missing pair_code or session_token")
            return False

        if self._on_pair_created:
            self._on_pair_created(self.pair_code)

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
        logger.info("remote_ws: started (pair_code=%s, peer_connected=%s)",
                    self.pair_code, self._peer_connected)
        return True

    def stop(self):
        """Stop polling and disconnect."""
        self._stop_event.set()
        self._connected = False

        _relay_post(self.relay_url, {
            "action": "disconnect",
            "session_token": self.session_token,
        })

        self.pair_code = None
        self.session_token = None

        if self._peer_connected:
            self._peer_connected = False
            if self._on_peer_change:
                self._on_peer_change(False)

        logger.info("remote_ws: stopped")

    def send(self, message):
        """Send a message to the PWA via relay."""
        if not self._connected:
            return
        _relay_post(self.relay_url, {
            "action": "send",
            "session_token": self.session_token,
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
                    "session_token": self.session_token,
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
        if not relay_url or not secret:
            return None
        _client = RelayClient(relay_url, secret)
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
