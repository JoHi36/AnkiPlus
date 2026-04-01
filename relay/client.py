"""relay/client.py — Thread-safe relay client for PWA remote control.

Connects to the Firebase relay endpoint so a PWA on the user's phone can
control Anki remotely.  Uses pair-code auth: Anki creates a pair code, the
user enters it in the PWA, the PWA joins using the code.

All callbacks are dispatched to the Qt main thread via QTimer.singleShot
to guarantee thread safety.  The polling loop and send() run in daemon
threads so they never block the UI.
"""

import json
import threading
import urllib.request
import urllib.error

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

POLL_INTERVAL = 0.5          # Seconds between polls
RETRY_DELAY = 5              # Seconds to wait after error
REQUEST_TIMEOUT = 10         # HTTP request timeout

# ---------------------------------------------------------------------------
# HTTP helper (stdlib only)
# ---------------------------------------------------------------------------


def _relay_post(relay_url, payload):
    """POST JSON to relay endpoint.  Returns parsed response or None."""
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
        logger.debug("relay.client: post error: %s", exc)
        return None
    except Exception as exc:
        logger.error("relay.client: unexpected post error: %s", exc)
        return None


# ---------------------------------------------------------------------------
# RelayClient
# ---------------------------------------------------------------------------


class RelayClient:
    """Manages connection to the Firebase relay for PWA remote control.

    Thread-safety contract:
    - ``start_polling`` / ``_poll_loop`` run in a daemon thread.
    - ``send`` fires an HTTP POST in a new daemon thread (never blocks Qt).
    - All user-facing callbacks are dispatched to the Qt main thread via
      ``dispatch_on_main``.
    """

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

    # -- Properties ---------------------------------------------------------

    @property
    def is_connected(self):
        return self._connected

    @property
    def is_peer_connected(self):
        return self._peer_connected

    # -- Callback setters ---------------------------------------------------

    def set_action_handler(self, handler):
        """Set callback for incoming actions: ``handler(action_type, params)``.

        Called on the Qt main thread.
        """
        self._action_handler = handler

    def set_peer_change_handler(self, handler):
        """Set callback for peer connect/disconnect: ``handler(connected: bool)``.

        Called on the Qt main thread.
        """
        self._on_peer_change = handler

    # -- Thread-safety ------------------------------------------------------

    @staticmethod
    def dispatch_on_main(fn):
        """Run *fn* on the Qt main thread via ``QTimer.singleShot(0, fn)``.

        Falls back to a direct call if Qt is not available (e.g. in tests).
        """
        try:
            from PyQt6.QtCore import QTimer
            QTimer.singleShot(0, fn)
        except Exception:
            # No Qt available — run directly (test environment)
            fn()

    # -- Pairing ------------------------------------------------------------

    def create_pair(self):
        """Create a new pair code with the relay.

        Returns the pair code string on success, or ``None`` on failure.
        Stores ``pair_code`` and ``session_token`` on the instance.
        """
        resp = _relay_post(self.relay_url, {
            "action": "create_pair",
            "secret": self.secret,
            "uid": self.uid,
        })

        if not resp or not resp.get("ok"):
            logger.error("relay.client: create_pair failed: %s", resp)
            return None

        self.pair_code = resp.get("pair_code")
        self.session_token = resp.get("session_token")

        if not self.pair_code or not self.session_token:
            logger.error("relay.client: create_pair response missing pair_code or session_token")
            return None

        self._connected = True
        self._peer_connected = resp.get("peer_connected", False)

        logger.info("relay.client: pair created (code=%s, peer=%s)",
                     self.pair_code, self._peer_connected)
        return self.pair_code

    def reconnect(self, session_token):
        """Reconnect to an existing session.

        Returns ``True`` if the relay accepted the token, ``False`` otherwise.
        On failure the stored ``session_token`` is cleared.
        """
        resp = _relay_post(self.relay_url, {
            "action": "reconnect",
            "session_token": session_token,
            "secret": self.secret,
        })

        if not resp or not resp.get("ok"):
            logger.warning("relay.client: reconnect failed — clearing session")
            self.session_token = None
            return False

        self.session_token = session_token
        self._connected = True
        self._peer_connected = resp.get("peer_connected", False)

        logger.info("relay.client: reconnected (peer=%s)", self._peer_connected)
        return True

    # -- Polling ------------------------------------------------------------

    def start_polling(self):
        """Start the background polling thread.

        Safe to call multiple times — if the thread is already running this
        is a no-op.
        """
        if self._thread and self._thread.is_alive():
            return

        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._poll_loop,
            daemon=True,
            name="RelayClientPoll",
        )
        self._thread.start()
        logger.info("relay.client: polling started")

    def _poll_loop(self):
        """Polling loop — runs in a daemon thread."""
        while not self._stop_event.is_set():
            try:
                resp = _relay_post(self.relay_url, {
                    "action": "poll",
                    "session_token": self.session_token,
                    "secret": self.secret,
                })

                if resp:
                    # Handle "Invalid session" — relay rejected our token
                    if resp.get("error") == "Invalid session":
                        logger.warning("relay.client: session invalidated by relay")
                        self._connected = False
                        self._stop_event.set()
                        break

                    if resp.get("ok"):
                        for msg in resp.get("messages", []):
                            self._handle_message(msg)

            except Exception as exc:
                logger.error("relay.client: poll error: %s", exc)
                if not self._stop_event.is_set():
                    self._stop_event.wait(RETRY_DELAY)
                    continue

            self._stop_event.wait(POLL_INTERVAL)

        logger.info("relay.client: poll loop exited")

    def _handle_message(self, msg):
        """Process a single message from the relay.

        Peer status changes and action callbacks are dispatched to the Qt
        main thread via ``dispatch_on_main``.  Lambda default-arg capture
        is used to avoid closure bugs in the loop.
        """
        msg_type = msg.get("type", "")

        if msg_type == "peer_connected":
            self._peer_connected = True
            if self._on_peer_change:
                handler = self._on_peer_change
                self.dispatch_on_main(lambda handler=handler: handler(True))
            logger.info("relay.client: peer connected")
            return

        if msg_type == "peer_disconnected":
            self._peer_connected = False
            if self._on_peer_change:
                handler = self._on_peer_change
                self.dispatch_on_main(lambda handler=handler: handler(False))
            logger.info("relay.client: peer disconnected")
            return

        # Try to parse as a known action
        try:
            from .actions import parse_action
        except ImportError:
            from relay.actions import parse_action

        parsed = parse_action(msg)
        if parsed and self._action_handler:
            at, p = parsed
            handler = self._action_handler
            self.dispatch_on_main(lambda at=at, p=p, handler=handler: handler(at, p))
            logger.info("relay.client: dispatched action %s %s", at, p)

    # -- Lifecycle ----------------------------------------------------------

    def stop(self):
        """Stop polling and disconnect from the relay.

        Sends a disconnect message, clears state, and notifies the peer
        change handler.
        """
        self._stop_event.set()
        self._connected = False

        # Best-effort disconnect notification
        if self.session_token:
            _relay_post(self.relay_url, {
                "action": "disconnect",
                "session_token": self.session_token,
                "secret": self.secret,
            })

        self.pair_code = None
        self.session_token = None

        if self._peer_connected:
            self._peer_connected = False
            if self._on_peer_change:
                handler = self._on_peer_change
                self.dispatch_on_main(lambda handler=handler: handler(False))

        logger.info("relay.client: stopped")

    # -- Send ---------------------------------------------------------------

    def send(self, message):
        """Send a message to the PWA via relay.

        Fires the HTTP POST in a new daemon thread so it never blocks the
        Qt main thread.  Silently returns if not connected.
        """
        if not self._connected or not self.session_token:
            return

        payload = {
            "action": "send",
            "session_token": self.session_token,
            "secret": self.secret,
            "message": message,
        }

        t = threading.Thread(
            target=_relay_post,
            args=(self.relay_url, payload),
            daemon=True,
            name="RelayClientSend",
        )
        t.start()
