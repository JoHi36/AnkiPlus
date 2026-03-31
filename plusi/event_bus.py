"""plusi/event_bus.py — Central event bus with Plusi subscription matching.

Architecture:
- Emitting an event appends it to a rolling log (capped at max_log entries).
- Each log entry uses the same format as plusi/subscriptions.py expects:
  {"type": str, "payload": dict, "timestamp": ISO str}
- Subscriptions are matched in pure Python (L1, 0 tokens):
  each subscription's condition.evaluate(log, event_type) is called on every emit.
- When a subscription fires, its matching events are removed from the log to
  prevent immediate re-triggering.
- Singleton via EventBus.get() for cross-module access.
"""

from __future__ import annotations

import threading
from datetime import datetime
from typing import Callable, Dict, List, Optional

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Event catalog
# ---------------------------------------------------------------------------

EVENT_CATALOG: Dict[str, List[dict]] = {
    "lernen": [
        {
            "event": "card_reviewed",
            "description": "Eine Karte wurde bewertet (Again/Hard/Good/Easy).",
            "payload": ["card_id", "rating", "deck"],
        },
        {
            "event": "session_started",
            "description": "Eine Lernsession hat begonnen.",
            "payload": ["deck", "card_count"],
        },
        {
            "event": "session_ended",
            "description": "Eine Lernsession wurde beendet.",
            "payload": ["deck", "reviewed_count", "duration_seconds"],
        },
        {
            "event": "card_struggled",
            "description": "Eine Karte wurde als schwierig markiert (Again).",
            "payload": ["card_id", "deck"],
        },
    ],
    "navigation": [
        {
            "event": "deck_opened",
            "description": "Ein Stapel wurde geöffnet.",
            "payload": ["deck_name"],
        },
        {
            "event": "app_opened",
            "description": "Die App wurde gestartet.",
            "payload": [],
        },
        {
            "event": "state_changed",
            "description": "Der App-Zustand hat gewechselt (z.B. Reviewer → Overview).",
            "payload": ["from_state", "to_state"],
        },
    ],
    "aktivitaet": [
        {
            "event": "app_idle",
            "description": "Die App war für eine Weile inaktiv.",
            "payload": ["idle_minutes"],
        },
        {
            "event": "milestone",
            "description": "Ein Meilenstein wurde erreicht (z.B. 100 Karten).",
            "payload": ["milestone_type", "value"],
        },
    ],
    "kommunikation": [
        {
            "event": "user_message",
            "description": "Der Nutzer hat eine Nachricht an einen Agenten gesendet.",
            "payload": ["channel", "text_length"],
        },
    ],
    "zeit": [
        {
            "event": "time_trigger",
            "description": "Ein zeitbasiertes Ereignis (z.B. tägliche Erinnerung).",
            "payload": ["trigger_id", "scheduled_at"],
        },
    ],
}

# Flat set of all known event type strings
ALL_EVENTS: frozenset = frozenset(
    entry["event"]
    for entries in EVENT_CATALOG.values()
    for entry in entries
)

# ---------------------------------------------------------------------------
# Singleton state (module-level, reset in tests via `eb._instance = None`)
# ---------------------------------------------------------------------------
_instance: Optional["EventBus"] = None
_instance_lock = threading.Lock()


# ---------------------------------------------------------------------------
# EventBus
# ---------------------------------------------------------------------------

class EventBus:
    """Central pub/sub bus for Plusi event subscriptions.

    Log entry format (compatible with plusi/subscriptions.py):
        {"type": str, "payload": dict | None, "timestamp": ISO str}

    Usage::

        bus = EventBus.get()
        bus.on_subscription_fired = my_callback
        bus.add_subscription({
            "name": "drei_reviews",
            "event": "card_reviewed",
            "condition": CountCondition(n=3),
            "wake_prompt": "Du hast 3 Karten gelernt!",
        })
        bus.emit("card_reviewed", {"card_id": 42})
    """

    def __init__(self, max_log: int = 500) -> None:
        self._max_log = max_log
        self._log: List[dict] = []
        self._subscriptions: List[dict] = []
        self._last_activity: datetime = datetime.now()
        self._lock = threading.Lock()
        # Optional callback: (sub: dict, event: dict) -> None
        self.on_subscription_fired: Optional[Callable] = None

    # ------------------------------------------------------------------
    # Singleton
    # ------------------------------------------------------------------

    @classmethod
    def get(cls) -> "EventBus":
        """Return the global singleton EventBus instance."""
        global _instance, _instance_lock
        with _instance_lock:
            if _instance is None:
                _instance = cls()
        return _instance

    # ------------------------------------------------------------------
    # Core API
    # ------------------------------------------------------------------

    def emit(self, event_type: str, payload: Optional[dict] = None) -> None:
        """Append event to log, update last_activity, check subscriptions.

        Log entry uses the format expected by plusi/subscriptions.py:
        {"type": str, "payload": dict | None, "timestamp": ISO str}
        """
        entry = {
            "type": event_type,
            "payload": payload,
            "timestamp": datetime.now().isoformat(),
        }
        with self._lock:
            self._log.append(entry)
            # Trim to rolling max
            if len(self._log) > self._max_log:
                self._log = self._log[-self._max_log:]
            self._last_activity = datetime.now()
            subs_snapshot = list(self._subscriptions)
            log_snapshot = list(self._log)

        fired = []
        for sub in subs_snapshot:
            try:
                if sub["condition"].evaluate(log_snapshot, sub["event"]):
                    fired.append(sub)
            except Exception:
                logger.exception("Error evaluating condition for subscription %s", sub.get("name"))

        for sub in fired:
            with self._lock:
                # Clear matching events from log to prevent re-triggering
                self._log = [
                    e for e in self._log if e.get("type") != sub["event"]
                ]
            logger.info("Subscription fired: %s", sub["name"])
            if self.on_subscription_fired is not None:
                try:
                    self.on_subscription_fired(sub, entry)
                except Exception:
                    logger.exception("Error in on_subscription_fired for %s", sub.get("name"))

    def add_subscription(self, sub: dict) -> None:
        """Add or replace a subscription by name.

        Required keys: name, event, condition, wake_prompt.
        """
        name = sub["name"]
        with self._lock:
            self._subscriptions = [s for s in self._subscriptions if s["name"] != name]
            self._subscriptions.append(sub)
        logger.info("Subscription added: %s (event=%s)", name, sub.get("event"))

    def remove_subscription(self, name: str) -> bool:
        """Remove subscription by name. Returns True if found and removed."""
        with self._lock:
            before = len(self._subscriptions)
            self._subscriptions = [s for s in self._subscriptions if s["name"] != name]
            removed = len(self._subscriptions) < before
        if removed:
            logger.info("Subscription removed: %s", name)
        return removed

    def list_subscriptions(self) -> List[dict]:
        """Return a copy of all active subscriptions."""
        with self._lock:
            return list(self._subscriptions)

    # ------------------------------------------------------------------
    # Catalog
    # ------------------------------------------------------------------

    def available_events(self) -> Dict[str, List[dict]]:
        """Return the event catalog (category → list of event descriptors)."""
        return EVENT_CATALOG

    # ------------------------------------------------------------------
    # Activity / idle
    # ------------------------------------------------------------------

    def last_activity_time(self) -> datetime:
        """Return the datetime of the last emitted event."""
        return self._last_activity

    def idle_minutes(self) -> float:
        """Return minutes elapsed since the last emitted event."""
        delta = datetime.now() - self._last_activity
        return delta.total_seconds() / 60.0
