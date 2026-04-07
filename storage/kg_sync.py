"""Event drain: flushes local KG event buffer to Cloud Function endpoint.

Called periodically via QTimer when kg_backend == "neo4j".
Processes one batch per call to avoid blocking Anki's UI thread.
On network failure, events stay in SQLite for the next drain cycle.
"""

import requests

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)

DRAIN_BATCH_SIZE = 100  # Max per Cloud Function request
DRAIN_TIMEOUT_S = 30


def drain_events():
    """Read one batch of pending events and POST to Cloud Function.

    Designed to be called from QTimer — processes one batch per call
    and returns quickly so it doesn't block Anki's UI thread.

    Returns:
        Number of events successfully synced in this batch, or 0 on failure.
    """
    try:
        from .kg_events import get_pending, mark_synced, delete_synced, pending_count
    except ImportError:
        from kg_events import get_pending, mark_synced, delete_synced, pending_count

    try:
        from ..ai.auth import get_auth_headers
        from ..config import get_backend_url
    except ImportError:
        from ai.auth import get_auth_headers
        from config import get_backend_url

    pending = get_pending(limit=DRAIN_BATCH_SIZE)
    if not pending:
        return 0

    backend_url = get_backend_url()
    if not backend_url:
        logger.warning("kg_sync: no backend_url configured, skipping drain")
        return 0

    endpoint = f"{backend_url}/kg/events"

    try:
        headers = get_auth_headers()
    except Exception as e:
        logger.warning("kg_sync: auth headers failed, skipping drain: %s", e)
        return 0

    # Build payload matching Cloud Function expected format
    events_payload = [
        {"id": ev["id"], "type": ev["event_type"], "payload": ev["payload"]}
        for ev in pending
    ]

    try:
        response = requests.post(
            endpoint,
            json={"events": events_payload},
            headers=headers,
            timeout=DRAIN_TIMEOUT_S,
        )

        if response.ok:
            synced_ids = [ev["id"] for ev in pending]
            mark_synced(synced_ids)
            delete_synced()
            remaining = pending_count()
            logger.info("kg_sync: drained %d events (%d remaining)",
                        len(synced_ids), remaining)
            return len(synced_ids)
        else:
            logger.warning(
                "kg_sync: drain failed HTTP %d: %s",
                response.status_code,
                response.text[:200],
            )
            return 0

    except Exception as e:
        err_name = type(e).__name__
        if err_name in ('ConnectionError', 'OSError'):
            logger.debug("kg_sync: offline, %d events buffered", len(pending))
        elif err_name == 'Timeout':
            logger.warning("kg_sync: timeout after %ds", DRAIN_TIMEOUT_S)
        else:
            logger.error("kg_sync: unexpected error: %s", e)
        return 0
