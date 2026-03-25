"""Tests for Plusi chain engine: budget, timer, sleep, chain actions."""
import pytest
import sqlite3
from datetime import datetime, timedelta
import plusi.storage as mod


@pytest.fixture(autouse=True)
def fresh_db(tmp_path):
    mod._db = None
    db_path = str(tmp_path / 'test_plusi.db')
    db = sqlite3.connect(db_path, check_same_thread=False)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA foreign_keys=ON")
    mod._init_tables(db)
    mod._db = db
    mod._db_path = db_path
    yield db
    mod._db = None


class TestBudgetManagement:
    def test_initial_budget(self):
        budget = mod.get_available_budget(2000, 0.7)
        assert budget == int(2000 * (0.4 + 0.6 * 0.7))

    def test_budget_at_floor_integrity(self):
        budget = mod.get_available_budget(2000, 0.3)
        assert budget == int(2000 * (0.4 + 0.6 * 0.3))

    def test_budget_at_max_integrity(self):
        budget = mod.get_available_budget(2000, 1.0)
        assert budget == 2000

    def test_spend_budget(self):
        mod.set_memory('autonomy', 'budget_remaining', 1000)
        mod.spend_budget(300)
        assert mod.get_memory('autonomy', 'budget_remaining') == 700

    def test_spend_budget_floors_at_zero(self):
        mod.set_memory('autonomy', 'budget_remaining', 100)
        mod.spend_budget(300)
        assert mod.get_memory('autonomy', 'budget_remaining') == 0

    def test_hourly_reset(self):
        mod.set_memory('autonomy', 'budget_remaining', 100)
        mod.set_memory('autonomy', 'budget_hour', -1)
        mod.check_hourly_budget_reset(2000, 0.7)
        expected = mod.get_available_budget(2000, 0.7)
        assert mod.get_memory('autonomy', 'budget_remaining') == expected


class TestSleepState:
    def test_default_not_sleeping(self):
        assert mod.get_memory('state', 'is_sleeping', False) is False

    def test_enter_sleep(self):
        wake = (datetime.now() + timedelta(minutes=30)).isoformat()
        mod.enter_sleep(wake)
        assert mod.get_memory('state', 'is_sleeping') is True
        assert mod.get_memory('state', 'next_wake') == wake

    def test_wake_up(self):
        wake = datetime.now().isoformat()
        mod.enter_sleep(wake)
        mod.wake_up()
        assert mod.get_memory('state', 'is_sleeping') is False

    def test_sleep_regenerates_budget(self):
        mod.set_memory('autonomy', 'budget_remaining', 500)
        mod.regenerate_budget(2000, minutes_slept=10, integrity=1.0)
        expected = min(2000, 500 + int(2000 * 0.2))
        assert mod.get_memory('autonomy', 'budget_remaining') == expected

    def test_regeneration_capped_at_available(self):
        mod.set_memory('autonomy', 'budget_remaining', 1900)
        mod.regenerate_budget(2000, minutes_slept=10, integrity=0.5)
        cap = mod.get_available_budget(2000, 0.5)
        assert mod.get_memory('autonomy', 'budget_remaining') <= cap


class TestNextWake:
    def test_clamp_too_soon(self):
        wake = (datetime.now() + timedelta(minutes=3)).isoformat()
        clamped = mod.clamp_next_wake(wake)
        delta = (datetime.fromisoformat(clamped) - datetime.now()).total_seconds() / 60
        assert 9 < delta < 11

    def test_clamp_too_far(self):
        wake = (datetime.now() + timedelta(minutes=200)).isoformat()
        clamped = mod.clamp_next_wake(wake)
        delta = (datetime.fromisoformat(clamped) - datetime.now()).total_seconds() / 60
        assert 119 < delta < 121

    def test_valid_wake_unchanged(self):
        wake = (datetime.now() + timedelta(minutes=30)).isoformat()
        clamped = mod.clamp_next_wake(wake)
        assert clamped == wake

    def test_invalid_format_defaults(self):
        clamped = mod.clamp_next_wake("not-a-date")
        delta = (datetime.fromisoformat(clamped) - datetime.now()).total_seconds() / 60
        assert 29 < delta < 31
