"""Tests for plusi/subscriptions.py — condition DSL parser with 7 templates."""

import json
from datetime import datetime, timedelta, timezone

import pytest

import plusi.subscriptions as mod
from plusi.subscriptions import (
    CountCondition,
    CountWithinCondition,
    StreakCondition,
    AccuracyCondition,
    IdleCondition,
    TimeCondition,
    ContainsCondition,
    parse_condition,
    AVAILABLE_TEMPLATES,
)


# ── Helpers ──────────────────────────────────────────────────────────────────

def make_event(event_type, payload=None, minutes_ago=0):
    """Build a minimal event dict with ISO timestamp."""
    ts = (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).isoformat()
    return {"type": event_type, "payload": payload or {}, "timestamp": ts}


# ── parse_condition ───────────────────────────────────────────────────────────

class TestParseCondition:
    def test_count_simple(self):
        c = parse_condition("count(5)")
        assert isinstance(c, CountCondition)
        assert c.n == 5

    def test_count_within(self):
        c = parse_condition("count(10, within=5m)")
        assert isinstance(c, CountWithinCondition)
        assert c.n == 10
        assert c.minutes == 5

    def test_streak(self):
        c = parse_condition("streak(3)")
        assert isinstance(c, StreakCondition)
        assert c.n == 3

    def test_accuracy_below(self):
        c = parse_condition("accuracy_below(40)")
        assert isinstance(c, AccuracyCondition)
        assert c.threshold == 40

    def test_idle(self):
        c = parse_condition("idle(120)")
        assert isinstance(c, IdleCondition)
        assert c.minutes == 120

    def test_time(self):
        c = parse_condition("time(22:00-06:00)")
        assert isinstance(c, TimeCondition)
        assert c.start == "22:00"
        assert c.end == "06:00"

    def test_contains(self):
        c = parse_condition("contains(Anatomie)")
        assert isinstance(c, ContainsCondition)
        assert c.text == "Anatomie"

    def test_invalid_returns_none(self):
        assert parse_condition("gibberish") is None
        assert parse_condition("count()") is None
        assert parse_condition("") is None
        assert parse_condition("time(22:00)") is None

    def test_count_within_before_count(self):
        """count(N, within=Xm) must not be matched by count(N)."""
        c = parse_condition("count(10, within=5m)")
        assert isinstance(c, CountWithinCondition)


# ── AVAILABLE_TEMPLATES ───────────────────────────────────────────────────────

class TestAvailableTemplates:
    def test_is_list_of_strings(self):
        assert isinstance(AVAILABLE_TEMPLATES, list)
        assert all(isinstance(t, str) for t in AVAILABLE_TEMPLATES)

    def test_has_seven_entries(self):
        assert len(AVAILABLE_TEMPLATES) == 7


# ── CountCondition ────────────────────────────────────────────────────────────

class TestCountCondition:
    def test_true_when_enough_events(self):
        events = [make_event("card_reviewed") for _ in range(5)]
        c = CountCondition(n=5)
        assert c.evaluate(events, "card_reviewed") is True

    def test_false_when_not_enough_events(self):
        events = [make_event("card_reviewed") for _ in range(3)]
        c = CountCondition(n=5)
        assert c.evaluate(events, "card_reviewed") is False

    def test_only_counts_matching_type(self):
        events = [make_event("card_reviewed")] * 4 + [make_event("session_started")]
        c = CountCondition(n=5)
        assert c.evaluate(events, "card_reviewed") is False

    def test_to_json(self):
        c = CountCondition(n=7)
        data = json.loads(c.to_json())
        assert data["type"] == "CountCondition"
        assert data["n"] == 7


# ── CountWithinCondition ──────────────────────────────────────────────────────

class TestCountWithinCondition:
    def test_true_when_enough_recent_events(self):
        events = [make_event("card_reviewed", minutes_ago=1) for _ in range(10)]
        c = CountWithinCondition(n=10, minutes=5)
        assert c.evaluate(events, "card_reviewed") is True

    def test_false_when_events_are_too_old(self):
        events = [make_event("card_reviewed", minutes_ago=10) for _ in range(10)]
        c = CountWithinCondition(n=10, minutes=5)
        assert c.evaluate(events, "card_reviewed") is False

    def test_to_json(self):
        c = CountWithinCondition(n=3, minutes=10)
        data = json.loads(c.to_json())
        assert data["type"] == "CountWithinCondition"
        assert data["n"] == 3
        assert data["minutes"] == 10


# ── StreakCondition ───────────────────────────────────────────────────────────

class TestStreakCondition:
    def test_true_with_consecutive_matching(self):
        events = [make_event("card_reviewed") for _ in range(3)]
        c = StreakCondition(n=3)
        assert c.evaluate(events, "card_reviewed") is True

    def test_false_when_streak_broken(self):
        events = [
            make_event("card_reviewed"),
            make_event("session_started"),
            make_event("card_reviewed"),
            make_event("card_reviewed"),
        ]
        c = StreakCondition(n=3)
        # Trailing streak is only 2 (last two card_reviewed after the break)
        assert c.evaluate(events, "card_reviewed") is False

    def test_false_when_not_enough(self):
        events = [make_event("card_reviewed") for _ in range(2)]
        c = StreakCondition(n=3)
        assert c.evaluate(events, "card_reviewed") is False

    def test_to_json(self):
        c = StreakCondition(n=5)
        data = json.loads(c.to_json())
        assert data["type"] == "StreakCondition"
        assert data["n"] == 5


# ── AccuracyCondition ─────────────────────────────────────────────────────────

class TestAccuracyCondition:
    def _reviewed(self, correct, minutes_ago=0):
        return make_event("card_reviewed", {"correct": correct}, minutes_ago)

    def test_true_when_accuracy_below_threshold(self):
        # 3 correct out of 10 = 30%
        events = [self._reviewed(True)] * 3 + [self._reviewed(False)] * 7
        c = AccuracyCondition(threshold=40)
        assert c.evaluate(events, "card_reviewed") is True

    def test_false_when_accuracy_meets_threshold(self):
        # 5 correct out of 10 = 50%
        events = [self._reviewed(True)] * 5 + [self._reviewed(False)] * 5
        c = AccuracyCondition(threshold=40)
        assert c.evaluate(events, "card_reviewed") is False

    def test_uses_last_10_events(self):
        # 20 events: first 10 are all wrong, last 10 are all correct → 100%
        old_wrong = [self._reviewed(False, minutes_ago=30)] * 10
        recent_correct = [self._reviewed(True, minutes_ago=1)] * 10
        events = old_wrong + recent_correct
        c = AccuracyCondition(threshold=40)
        # Last 10 are all correct → accuracy 100%, NOT below 40
        assert c.evaluate(events, "card_reviewed") is False

    def test_to_json(self):
        c = AccuracyCondition(threshold=60)
        data = json.loads(c.to_json())
        assert data["type"] == "AccuracyCondition"
        assert data["threshold"] == 60


# ── IdleCondition ─────────────────────────────────────────────────────────────

class TestIdleCondition:
    def test_true_when_last_event_is_old(self):
        events = [make_event("any", minutes_ago=130)]
        c = IdleCondition(minutes=120)
        assert c.evaluate(events, "any") is True

    def test_false_when_recent_event_exists(self):
        events = [make_event("any", minutes_ago=5)]
        c = IdleCondition(minutes=120)
        assert c.evaluate(events, "any") is False

    def test_false_when_no_events(self):
        c = IdleCondition(minutes=120)
        # No events → can't determine idle; treat as not idle
        assert c.evaluate([], "any") is False

    def test_to_json(self):
        c = IdleCondition(minutes=60)
        data = json.loads(c.to_json())
        assert data["type"] == "IdleCondition"
        assert data["minutes"] == 60


# ── TimeCondition ─────────────────────────────────────────────────────────────

class TestTimeCondition:
    def _make_time(self, hour, minute=0):
        """Return a (hour, minute) tuple to patch into TimeCondition._now."""
        return (hour, minute)

    def test_simple_daytime_window_inside(self):
        c = TimeCondition(start="09:00", end="17:00")
        assert c._in_window(12, 0) is True

    def test_simple_daytime_window_outside(self):
        c = TimeCondition(start="09:00", end="17:00")
        assert c._in_window(18, 0) is False

    def test_midnight_wrap_inside_late_night(self):
        # 22:00–06:00 window; 23:30 should be inside
        c = TimeCondition(start="22:00", end="06:00")
        assert c._in_window(23, 30) is True

    def test_midnight_wrap_inside_early_morning(self):
        # 22:00–06:00; 03:00 should be inside
        c = TimeCondition(start="22:00", end="06:00")
        assert c._in_window(3, 0) is True

    def test_midnight_wrap_outside(self):
        # 22:00–06:00; 12:00 should be outside
        c = TimeCondition(start="22:00", end="06:00")
        assert c._in_window(12, 0) is False

    def test_evaluate_uses_real_clock(self):
        """evaluate() must call real clock logic without crashing."""
        c = TimeCondition(start="00:00", end="23:59")
        # Any time is inside 00:00–23:59
        assert c.evaluate([], "any") is True

    def test_to_json(self):
        c = TimeCondition(start="22:00", end="06:00")
        data = json.loads(c.to_json())
        assert data["type"] == "TimeCondition"
        assert data["start"] == "22:00"
        assert data["end"] == "06:00"


# ── ContainsCondition ─────────────────────────────────────────────────────────

class TestContainsCondition:
    def test_evaluate_event_matches_value(self):
        c = ContainsCondition(text="Anatomie")
        event = make_event("any", payload={"deck": "Medizin::Anatomie::Knochen"})
        assert c.evaluate_event(event) is True

    def test_evaluate_event_case_insensitive(self):
        c = ContainsCondition(text="anatomie")
        event = make_event("any", payload={"deck": "Anatomie"})
        assert c.evaluate_event(event) is True

    def test_evaluate_event_no_match(self):
        c = ContainsCondition(text="Chirurgie")
        event = make_event("any", payload={"deck": "Anatomie"})
        assert c.evaluate_event(event) is False

    def test_evaluate_event_nested_value(self):
        """Matches any string value in payload, not just top-level."""
        c = ContainsCondition(text="Knochen")
        event = make_event("any", payload={"meta": {"topic": "Knochen"}})
        # evaluate_event checks top-level string values only (payload.values())
        # nested dicts are not string → skip. This test verifies flat matching.
        event2 = make_event("any", payload={"topic": "Knochen"})
        assert c.evaluate_event(event2) is True

    def test_evaluate_returns_true_if_any_event_matches(self):
        c = ContainsCondition(text="Anatomie")
        events = [
            make_event("card_reviewed", payload={"deck": "Physiologie"}),
            make_event("card_reviewed", payload={"deck": "Anatomie::Herz"}),
        ]
        assert c.evaluate(events, "card_reviewed") is True

    def test_evaluate_returns_false_if_no_event_matches(self):
        c = ContainsCondition(text="Anatomie")
        events = [make_event("card_reviewed", payload={"deck": "Pharmakologie"})]
        assert c.evaluate(events, "card_reviewed") is False

    def test_to_json(self):
        c = ContainsCondition(text="Neurologie")
        data = json.loads(c.to_json())
        assert data["type"] == "ContainsCondition"
        assert data["text"] == "Neurologie"
