"""Local event buffer for Knowledge Graph ingestion.

Thin SQLite buffer for offline resilience. Events are drained periodically
to the Cloud Function endpoint, which writes them to Firestore.
The real queue is Firestore onCreate triggers — this is just a write-ahead buffer.
"""

import json
import uuid

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)


def _get_db():
    """Return the shared card_sessions SQLite connection."""
    try:
        from .card_sessions import _get_db as get_sessions_db
    except ImportError:
        from card_sessions import _get_db as get_sessions_db
    return get_sessions_db()


def queue_event(event_type, payload_dict):
    """Insert an event into the local buffer.

    Args:
        event_type: Event type string (e.g. 'card_embedded', 'card_reviewed').
        payload_dict: Dict payload to be JSON-serialized.

    Returns:
        The generated event ID string.
    """
    db = _get_db()
    event_id = str(uuid.uuid4())
    try:
        db.execute(
            "INSERT INTO kg_events (id, event_type, payload) VALUES (?, ?, ?)",
            (event_id, event_type, json.dumps(payload_dict, ensure_ascii=False)),
        )
        db.commit()
        logger.debug("kg_events: queued %s (%s)", event_type, event_id[:8])
        return event_id
    except Exception as e:
        logger.error("kg_events: failed to queue %s: %s", event_type, e)
        db.rollback()
        return None


def get_pending(limit=50):
    """Return up to `limit` pending (unsynced) events.

    Returns:
        List of dicts with keys: id, event_type, payload (parsed JSON).
    """
    db = _get_db()
    rows = db.execute(
        "SELECT id, event_type, payload FROM kg_events "
        "WHERE synced = 0 ORDER BY created_at LIMIT ?",
        (limit,),
    ).fetchall()
    results = []
    for r in rows:
        try:
            payload = json.loads(r["payload"])
        except (json.JSONDecodeError, TypeError):
            payload = {}
        results.append({
            "id": r["id"],
            "event_type": r["event_type"],
            "payload": payload,
        })
    return results


def mark_synced(ids):
    """Mark events as synced by their IDs.

    Args:
        ids: List of event ID strings.
    """
    if not ids:
        return
    db = _get_db()
    placeholders = ",".join("?" for _ in ids)
    try:
        db.execute(
            f"UPDATE kg_events SET synced = 1 WHERE id IN ({placeholders})",
            ids,
        )
        db.commit()
        logger.debug("kg_events: marked %d events synced", len(ids))
    except Exception as e:
        logger.error("kg_events: mark_synced failed: %s", e)
        db.rollback()


def delete_synced():
    """Delete all events that have been synced."""
    db = _get_db()
    try:
        cursor = db.execute("DELETE FROM kg_events WHERE synced = 1")
        db.commit()
        deleted = cursor.rowcount
        if deleted > 0:
            logger.debug("kg_events: deleted %d synced events", deleted)
        return deleted
    except Exception as e:
        logger.error("kg_events: delete_synced failed: %s", e)
        db.rollback()
        return 0


def pending_count():
    """Return count of unsynced events."""
    db = _get_db()
    row = db.execute("SELECT COUNT(*) FROM kg_events WHERE synced = 0").fetchone()
    return row[0] if row else 0
