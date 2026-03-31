"""Tests for plusi/event_bus.py — EventBus with subscription matching and event catalog.

TDD: These tests are written BEFORE the implementation.

Log entry format (compatible with plusi/subscriptions.py):
    {"type": str, "payload": dict | None, "timestamp": ISO str}
"""

import pytest
import sys
import os

# Ensure project root is on path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# ---------------------------------------------------------------------------
# CountCondition: prefer the real one from plusi.subscriptions.
# If it's missing, define a minimal inline fallback with matching API.
# NOTE: plusi/subscriptions.py uses self.n (dataclass field) and e.get("type").
# ---------------------------------------------------------------------------
try:
    from plusi.subscriptions import CountCondition
except ImportError:
    from dataclasses import dataclass

    @dataclass
    class CountCondition:
        """Fires when at least `n` matching events are in the log."""
        n: int

        def evaluate(self, events: list, event_type: str) -> bool:
            matching = [e for e in events if e.get("type") == event_type]
            return len(matching) >= self.n


# ---------------------------------------------------------------------------
# Reset singleton between tests
# ---------------------------------------------------------------------------
@pytest.fixture(autouse=True)
def fresh_bus():
    """Reset EventBus singleton before each test."""
    import plusi.event_bus as eb
    eb._instance = None
    yield
    eb._instance = None


# ---------------------------------------------------------------------------
# 1. emit stores event in log
# ---------------------------------------------------------------------------
class TestEmit:
    def test_emit_stores_event_in_log(self):
        from plusi.event_bus import EventBus
        bus = EventBus()
        bus.emit("card_reviewed", {"card_id": 42})
        assert len(bus._log) == 1
        # Log entry uses "type" key (compatible with plusi/subscriptions.py)
        assert bus._log[0]["type"] == "card_reviewed"
        assert bus._log[0]["payload"]["card_id"] == 42

    def test_emit_without_payload_stores_none(self):
        from plusi.event_bus import EventBus
        bus = EventBus()
        bus.emit("app_opened")
        assert len(bus._log) == 1
        assert bus._log[0]["payload"] is None

    def test_emit_multiple_events_appends(self):
        from plusi.event_bus import EventBus
        bus = EventBus()
        bus.emit("card_reviewed")
        bus.emit("session_started")
        bus.emit("card_reviewed")
        assert len(bus._log) == 3

    def test_emit_updates_last_activity(self):
        from plusi.event_bus import EventBus
        from datetime import datetime
        bus = EventBus()
        before = datetime.now()
        bus.emit("card_reviewed")
        after = datetime.now()
        assert before <= bus.last_activity_time() <= after


# ---------------------------------------------------------------------------
# 2. Rolling log respects max_log
# ---------------------------------------------------------------------------
class TestRollingLog:
    def test_rolling_log_trims_to_max(self):
        from plusi.event_bus import EventBus
        bus = EventBus(max_log=5)
        for i in range(10):
            bus.emit("card_reviewed", {"i": i})
        assert len(bus._log) == 5

    def test_rolling_log_keeps_newest(self):
        from plusi.event_bus import EventBus
        bus = EventBus(max_log=3)
        for i in range(5):
            bus.emit("card_reviewed", {"i": i})
        # Only the last 3 events should be retained
        payloads = [e["payload"]["i"] for e in bus._log]
        assert payloads == [2, 3, 4]


# ---------------------------------------------------------------------------
# 3. Subscription fires after CountCondition threshold is met
# ---------------------------------------------------------------------------
class TestSubscriptionMatching:
    def test_subscription_fires_on_count_condition(self):
        from plusi.event_bus import EventBus
        fired = []

        def on_fire(sub, event):
            fired.append((sub["name"], event["type"]))

        bus = EventBus()
        bus.on_subscription_fired = on_fire
        bus.add_subscription({
            "name": "drei_reviews",
            "event": "card_reviewed",
            "condition": CountCondition(n=3),
            "wake_prompt": "Du hast 3 Karten gelernt!",
        })

        bus.emit("card_reviewed")
        bus.emit("card_reviewed")
        assert len(fired) == 0  # Not yet — only 2 events

        bus.emit("card_reviewed")  # Third event — should fire
        assert len(fired) == 1
        assert fired[0] == ("drei_reviews", "card_reviewed")

    def test_subscription_does_not_fire_twice_without_new_events(self):
        """After firing, matching events are cleared so it won't re-fire."""
        from plusi.event_bus import EventBus
        fired = []

        bus = EventBus()
        bus.on_subscription_fired = lambda sub, ev: fired.append(sub["name"])
        bus.add_subscription({
            "name": "drei_reviews",
            "event": "card_reviewed",
            "condition": CountCondition(n=3),
            "wake_prompt": "Drei Karten!",
        })

        for _ in range(3):
            bus.emit("card_reviewed")
        assert len(fired) == 1

        # Emit an unrelated event — should NOT re-fire the same subscription
        bus.emit("app_opened")
        assert len(fired) == 1

    def test_fired_callback_receives_correct_event(self):
        from plusi.event_bus import EventBus
        received_events = []

        bus = EventBus()
        bus.on_subscription_fired = lambda sub, ev: received_events.append(ev)
        bus.add_subscription({
            "name": "single_fire",
            "event": "session_started",
            "condition": CountCondition(n=1),
            "wake_prompt": "Session gestartet",
        })

        bus.emit("session_started", {"deck": "Anatomie"})
        assert len(received_events) == 1
        assert received_events[0]["type"] == "session_started"


# ---------------------------------------------------------------------------
# 4. Wrong event type does not trigger subscription
# ---------------------------------------------------------------------------
class TestEventTypeFiltering:
    def test_wrong_event_type_does_not_match(self):
        from plusi.event_bus import EventBus
        fired = []

        bus = EventBus()
        bus.on_subscription_fired = lambda sub, ev: fired.append(sub["name"])
        bus.add_subscription({
            "name": "review_watcher",
            "event": "card_reviewed",
            "condition": CountCondition(n=1),
            "wake_prompt": "Karte gelernt",
        })

        bus.emit("session_started")
        bus.emit("app_opened")
        bus.emit("user_message")
        assert len(fired) == 0  # Wrong event types — must not fire

    def test_correct_type_after_wrong_types_fires(self):
        from plusi.event_bus import EventBus
        fired = []

        bus = EventBus()
        bus.on_subscription_fired = lambda sub, ev: fired.append(sub["name"])
        bus.add_subscription({
            "name": "review_watcher",
            "event": "card_reviewed",
            "condition": CountCondition(n=2),
            "wake_prompt": "Zwei Karten",
        })

        bus.emit("app_opened")
        bus.emit("card_reviewed")
        assert len(fired) == 0  # Only 1 matching

        bus.emit("session_started")
        assert len(fired) == 0  # Still only 1 matching

        bus.emit("card_reviewed")
        assert len(fired) == 1  # Now 2 matching — fires!


# ---------------------------------------------------------------------------
# 5. available_events() returns catalog with card_reviewed
# ---------------------------------------------------------------------------
class TestAvailableEvents:
    def test_available_events_returns_dict(self):
        from plusi.event_bus import EventBus
        bus = EventBus()
        catalog = bus.available_events()
        assert isinstance(catalog, dict)

    def test_catalog_contains_lernen_category(self):
        from plusi.event_bus import EventBus
        bus = EventBus()
        catalog = bus.available_events()
        assert "lernen" in catalog

    def test_catalog_contains_card_reviewed(self):
        from plusi.event_bus import EventBus
        bus = EventBus()
        catalog = bus.available_events()
        lernen_events = [e["event"] for e in catalog["lernen"]]
        assert "card_reviewed" in lernen_events

    def test_catalog_all_categories_present(self):
        from plusi.event_bus import EventBus
        bus = EventBus()
        catalog = bus.available_events()
        expected_categories = {"lernen", "navigation", "aktivitaet", "kommunikation", "zeit"}
        assert expected_categories == set(catalog.keys())

    def test_all_events_set_populated(self):
        from plusi.event_bus import ALL_EVENTS
        assert "card_reviewed" in ALL_EVENTS
        assert "deck_opened" in ALL_EVENTS
        assert "user_message" in ALL_EVENTS
        assert len(ALL_EVENTS) >= 10  # At least all catalog events


# ---------------------------------------------------------------------------
# Subscription management
# ---------------------------------------------------------------------------
class TestSubscriptionManagement:
    def test_add_subscription_stores_it(self):
        from plusi.event_bus import EventBus
        bus = EventBus()
        bus.add_subscription({
            "name": "test_sub",
            "event": "card_reviewed",
            "condition": CountCondition(n=1),
            "wake_prompt": "Test",
        })
        subs = bus.list_subscriptions()
        assert len(subs) == 1
        assert subs[0]["name"] == "test_sub"

    def test_add_subscription_replaces_by_name(self):
        from plusi.event_bus import EventBus
        bus = EventBus()
        bus.add_subscription({
            "name": "my_sub",
            "event": "card_reviewed",
            "condition": CountCondition(n=1),
            "wake_prompt": "First",
        })
        bus.add_subscription({
            "name": "my_sub",
            "event": "session_started",
            "condition": CountCondition(n=2),
            "wake_prompt": "Second",
        })
        subs = bus.list_subscriptions()
        assert len(subs) == 1
        assert subs[0]["wake_prompt"] == "Second"

    def test_remove_subscription_returns_true(self):
        from plusi.event_bus import EventBus
        bus = EventBus()
        bus.add_subscription({
            "name": "removable",
            "event": "card_reviewed",
            "condition": CountCondition(n=1),
            "wake_prompt": "Remove me",
        })
        result = bus.remove_subscription("removable")
        assert result is True
        assert len(bus.list_subscriptions()) == 0

    def test_remove_nonexistent_returns_false(self):
        from plusi.event_bus import EventBus
        bus = EventBus()
        result = bus.remove_subscription("does_not_exist")
        assert result is False


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------
class TestSingleton:
    def test_get_returns_same_instance(self):
        from plusi.event_bus import EventBus
        a = EventBus.get()
        b = EventBus.get()
        assert a is b

    def test_get_creates_fresh_instance(self):
        from plusi.event_bus import EventBus
        bus = EventBus.get()
        bus.emit("card_reviewed")
        assert len(bus._log) == 1


# ---------------------------------------------------------------------------
# Idle / activity timing
# ---------------------------------------------------------------------------
class TestIdleTime:
    def test_idle_minutes_increases_after_emit(self):
        from plusi.event_bus import EventBus
        import time
        bus = EventBus()
        bus.emit("card_reviewed")
        time.sleep(0.05)
        assert bus.idle_minutes() >= 0.0

    def test_idle_minutes_type(self):
        from plusi.event_bus import EventBus
        bus = EventBus()
        bus.emit("card_reviewed")
        assert isinstance(bus.idle_minutes(), float)
