"""
plusi/subscriptions.py — Template-based condition DSL parser for event subscriptions.

Each Condition class evaluates against a list of event dicts:
    {"type": str, "payload": dict, "timestamp": ISO str}

Usage:
    condition = parse_condition("count(5)")
    is_met = condition.evaluate(events, "card_reviewed")
"""

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from typing import List, Optional

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)


# ── Type alias ────────────────────────────────────────────────────────────────

Event = dict  # {"type": str, "payload": dict, "timestamp": str}


# ── Condition classes ─────────────────────────────────────────────────────────

@dataclass
class CountCondition:
    """True when N or more events of the matching type exist in the list."""

    n: int

    def evaluate(self, events: List[Event], event_type: str) -> bool:
        matching = [e for e in events if e.get("type") == event_type]
        return len(matching) >= self.n

    def to_json(self) -> str:
        return json.dumps({"type": "CountCondition", "n": self.n})


@dataclass
class CountWithinCondition:
    """True when N or more events of the matching type occurred within X minutes."""

    n: int
    minutes: int

    def evaluate(self, events: List[Event], event_type: str) -> bool:
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=self.minutes)
        matching = 0
        for e in events:
            if e.get("type") != event_type:
                continue
            try:
                ts = datetime.fromisoformat(e["timestamp"])
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
                if ts >= cutoff:
                    matching += 1
            except (KeyError, ValueError):
                logger.warning("CountWithinCondition: invalid timestamp in event %s", e)
        return matching >= self.n

    def to_json(self) -> str:
        return json.dumps({"type": "CountWithinCondition", "n": self.n, "minutes": self.minutes})


@dataclass
class StreakCondition:
    """True when the last N consecutive events are all of the matching type."""

    n: int

    def evaluate(self, events: List[Event], event_type: str) -> bool:
        if not events or self.n <= 0:
            return False
        streak = 0
        for e in reversed(events):
            if e.get("type") == event_type:
                streak += 1
            else:
                break
        return streak >= self.n

    def to_json(self) -> str:
        return json.dumps({"type": "StreakCondition", "n": self.n})


@dataclass
class AccuracyCondition:
    """True when the accuracy of the last 10 card_reviewed events is below threshold %."""

    threshold: int

    _WINDOW = 10

    def evaluate(self, events: List[Event], event_type: str) -> bool:
        reviewed = [e for e in events if e.get("type") == event_type]
        window = reviewed[-self._WINDOW:]
        if not window:
            return False
        correct = sum(1 for e in window if e.get("payload", {}).get("correct", False))
        accuracy_pct = (correct / len(window)) * 100
        return accuracy_pct < self.threshold

    def to_json(self) -> str:
        return json.dumps({"type": "AccuracyCondition", "threshold": self.threshold})


@dataclass
class IdleCondition:
    """True when the most recent event (any type) was X+ minutes ago."""

    minutes: int

    def evaluate(self, events: List[Event], event_type: str) -> bool:
        if not events:
            return False
        last_event = events[-1]
        try:
            ts = datetime.fromisoformat(last_event["timestamp"])
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            elapsed = (datetime.now(timezone.utc) - ts).total_seconds() / 60
            return elapsed >= self.minutes
        except (KeyError, ValueError):
            logger.warning("IdleCondition: invalid timestamp in last event %s", last_event)
            return False

    def to_json(self) -> str:
        return json.dumps({"type": "IdleCondition", "minutes": self.minutes})


@dataclass
class TimeCondition:
    """True when the current local time falls within the start–end window.

    Handles midnight wrapping (e.g. 22:00–06:00).
    """

    start: str  # "HH:MM"
    end: str    # "HH:MM"

    def _parse_hm(self, hm: str):
        """Return (hour, minute) from 'HH:MM'."""
        h, m = hm.split(":")
        return int(h), int(m)

    def _in_window(self, hour: int, minute: int) -> bool:
        sh, sm = self._parse_hm(self.start)
        eh, em = self._parse_hm(self.end)
        start_mins = sh * 60 + sm
        end_mins = eh * 60 + em
        now_mins = hour * 60 + minute

        if start_mins <= end_mins:
            # Normal window (e.g. 09:00–17:00)
            return start_mins <= now_mins < end_mins
        else:
            # Midnight-wrapping window (e.g. 22:00–06:00)
            return now_mins >= start_mins or now_mins < end_mins

    def evaluate(self, events: List[Event], event_type: str) -> bool:
        now = datetime.now()
        return self._in_window(now.hour, now.minute)

    def to_json(self) -> str:
        return json.dumps({"type": "TimeCondition", "start": self.start, "end": self.end})


@dataclass
class ContainsCondition:
    """True when any event's payload has a string value containing `text` (case-insensitive)."""

    text: str

    def evaluate_event(self, event: Event) -> bool:
        needle = self.text.lower()
        payload = event.get("payload", {})
        for value in payload.values():
            if isinstance(value, str) and needle in value.lower():
                return True
        return False

    def evaluate(self, events: List[Event], event_type: str) -> bool:
        return any(self.evaluate_event(e) for e in events)

    def to_json(self) -> str:
        return json.dumps({"type": "ContainsCondition", "text": self.text})


# ── Regex patterns (order matters: count-within before count) ─────────────────

_PATTERNS = [
    (re.compile(r"count\((\d+),\s*within=(\d+)m\)"),
     lambda m: CountWithinCondition(n=int(m.group(1)), minutes=int(m.group(2)))),
    (re.compile(r"count\((\d+)\)"),
     lambda m: CountCondition(n=int(m.group(1)))),
    (re.compile(r"streak\((\d+)\)"),
     lambda m: StreakCondition(n=int(m.group(1)))),
    (re.compile(r"accuracy_below\((\d+)\)"),
     lambda m: AccuracyCondition(threshold=int(m.group(1)))),
    (re.compile(r"idle\((\d+)\)"),
     lambda m: IdleCondition(minutes=int(m.group(1)))),
    (re.compile(r"time\((\d{2}:\d{2})-(\d{2}:\d{2})\)"),
     lambda m: TimeCondition(start=m.group(1), end=m.group(2))),
    (re.compile(r"contains\((.+)\)"),
     lambda m: ContainsCondition(text=m.group(1))),
]


def parse_condition(raw: str) -> Optional[object]:
    """Parse a condition template string and return the matching Condition object.

    Returns None if the input does not match any known pattern.
    """
    if not raw:
        return None
    for pattern, factory in _PATTERNS:
        m = pattern.fullmatch(raw.strip())
        if m:
            try:
                return factory(m)
            except (ValueError, IndexError) as exc:
                logger.warning("parse_condition: failed to build condition for %r: %s", raw, exc)
                return None
    logger.debug("parse_condition: no pattern matched for %r", raw)
    return None


# ── Available templates for UI / error feedback ───────────────────────────────

AVAILABLE_TEMPLATES = [
    "count(5)",
    "count(10, within=5m)",
    "streak(3)",
    "accuracy_below(40)",
    "idle(120)",
    "time(22:00-06:00)",
    "contains(Anatomie)",
]
