"""AnkiPlus Remote Relay — lifecycle, config migration, auto-reconnect.

Public API:
    get_client()   — Return the singleton RelayClient (or None).
    create_pair()  — Create a new pairing session, return {pair_code, pair_url} or {error}.
    start()        — Auto-reconnect if previously paired (saved session_token).
    stop()         — Stop client, unregister hooks, clear globals.
"""

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULTS = {
    "relay_url": "",
    "relay_secret": "",
    "app_url": "https://ankiplus.app/remote",
    "session_token": None,
}

# ---------------------------------------------------------------------------
# Module-level singletons
# ---------------------------------------------------------------------------

_client = None
_state_reporter = None

# ---------------------------------------------------------------------------
# Config helpers
# ---------------------------------------------------------------------------


def _get_remote_config():
    """Get remote config, migrate from telegram.* if needed (one-time)."""
    try:
        from ..config import get_config, save_config
    except ImportError:
        from config import get_config, save_config

    config = get_config()
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
            logger.info("relay: migrated config from telegram.* to remote.*")
    remote = config.get("remote", {})
    for k, v in DEFAULTS.items():
        if k not in remote:
            remote[k] = v
    return remote


def _save_session_token(token):
    """Persist session token for auto-reconnect."""
    try:
        from ..config import get_config, save_config
    except ImportError:
        from config import get_config, save_config

    config = get_config()
    if "remote" not in config:
        config["remote"] = dict(DEFAULTS)
    config["remote"]["session_token"] = token
    save_config(config)
    logger.debug("relay: session token saved (len=%d)", len(token) if token else 0)


# ---------------------------------------------------------------------------
# Peer change handler
# ---------------------------------------------------------------------------


def _on_peer_change(connected):
    """Handle PWA connect/disconnect: notify desktop + send initial card state."""
    global _state_reporter
    logger.info("relay: peer %s", "connected" if connected else "disconnected")

    # Notify desktop React app
    if _state_reporter:
        _state_reporter.notify_desktop(connected)

    # When PWA connects, send the current card state immediately
    if connected and _client:
        try:
            from .actions import build_card_state_from_reviewer
            state = build_card_state_from_reviewer(phase="question")
            if state:
                _client.send(state)
        except Exception as exc:
            logger.debug("relay: failed to send initial card_state: %s", exc)


# ---------------------------------------------------------------------------
# Internal wiring helper
# ---------------------------------------------------------------------------


def _wire_client(client):
    """Set up action handler, state reporter, and peer change handler."""
    global _state_reporter

    from .actions import handle_action
    client.set_action_handler(lambda t, p: handle_action(client, t, p))

    from .state import AnkiStateReporter
    _state_reporter = AnkiStateReporter(client)
    _state_reporter.register_hooks()
    client.set_peer_change_handler(_on_peer_change)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def get_client():
    """Return the singleton RelayClient, or None if not started."""
    return _client


def create_pair():
    """Create a new pairing session.

    Returns ``{"pair_code": ..., "pair_url": ...}`` on success,
    or ``{"error": ...}`` on failure.

    Called from SettingsSidebar when the user clicks "Remote verbinden".
    """
    global _client, _state_reporter

    # Stop any existing client first
    if _client:
        stop()

    remote = _get_remote_config()
    relay_url = remote.get("relay_url", "")
    relay_secret = remote.get("relay_secret", "")
    app_url = remote.get("app_url", DEFAULTS["app_url"])

    if not relay_url:
        return {"error": "relay_url not configured"}

    from .client import RelayClient
    _client = RelayClient(relay_url, relay_secret)

    pair_code = _client.create_pair()
    if not pair_code:
        _client = None
        return {"error": "create_pair failed"}

    # Persist session token for auto-reconnect
    _save_session_token(_client.session_token)

    # Wire up action handler, state reporter, peer handler
    _wire_client(_client)

    # Start polling
    _client.start_polling()

    pair_url = f"{app_url}?pair={pair_code}"
    logger.info("relay: pair created — code=%s url=%s", pair_code, pair_url)
    return {"pair_code": pair_code, "pair_url": pair_url}


def start():
    """Auto-reconnect if previously paired (saved session_token in config).

    Called from ``on_profile_loaded()``.
    Returns ``True`` if reconnected, ``False`` otherwise.
    If the token is expired/invalid, clears it and returns ``False``.
    """
    global _client

    remote = _get_remote_config()
    relay_url = remote.get("relay_url", "")
    relay_secret = remote.get("relay_secret", "")
    session_token = remote.get("session_token")

    if not relay_url or not session_token:
        return False

    from .client import RelayClient
    _client = RelayClient(relay_url, relay_secret)

    if not _client.reconnect(session_token):
        # Token expired — clear it so we don't retry every startup
        _save_session_token(None)
        _client = None
        logger.info("relay: auto-reconnect failed — token cleared")
        return False

    # Wire up action handler, state reporter, peer handler
    _wire_client(_client)

    # Start polling
    _client.start_polling()

    logger.info("relay: auto-reconnected successfully")
    return True


def stop():
    """Stop client, unregister hooks, clear globals."""
    global _client, _state_reporter

    if _state_reporter:
        _state_reporter.unregister_hooks()
        _state_reporter = None

    if _client:
        _client.stop()
        _client = None

    logger.info("relay: stopped")
