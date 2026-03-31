"""Tests for plusi/budget.py — daily wake-up budget tracker.

TDD: tests written before implementation.
Uses tempfile.TemporaryDirectory for isolated DB paths.
"""

import os
import sqlite3
import tempfile

import pytest


class TestPlusicBudget:
    """Test PlusicBudget daily wake-up budget logic."""

    def _make_budget(self, tmp_path, default_cap=20):
        from plusi.budget import PlusicBudget
        db_path = os.path.join(tmp_path, "test_plusi.db")
        return PlusicBudget(db_path=db_path, default_cap=default_cap)

    def test_initial_budget_is_default_cap(self):
        """Fresh budget has remaining() == default_cap (20)."""
        with tempfile.TemporaryDirectory() as tmp:
            b = self._make_budget(tmp)
            assert b.remaining() == 20

    def test_spend_decrements_remaining(self):
        """spend() reduces remaining by 1 each call."""
        with tempfile.TemporaryDirectory() as tmp:
            b = self._make_budget(tmp, default_cap=5)
            b.spend()
            assert b.remaining() == 4
            b.spend()
            assert b.remaining() == 3

    def test_budget_exhaustion(self):
        """can_wake() returns False once cap is reached."""
        with tempfile.TemporaryDirectory() as tmp:
            b = self._make_budget(tmp, default_cap=3)
            assert b.can_wake() is True
            b.spend()
            b.spend()
            b.spend()
            assert b.remaining() == 0
            assert b.can_wake() is False

    def test_daily_reset(self):
        """Budget resets for a new date (old row stays untouched, new row created)."""
        with tempfile.TemporaryDirectory() as tmp:
            db_path = os.path.join(tmp, "test_plusi.db")
            from plusi.budget import PlusicBudget

            b = PlusicBudget(db_path=db_path, default_cap=10)
            b.spend()
            b.spend()
            assert b.remaining() == 8

            # Simulate date change by moving today's row to yesterday
            con = sqlite3.connect(db_path)
            con.execute("UPDATE plusi_budget SET date = '2000-01-01'")
            con.commit()
            con.close()

            # New PlusicBudget instance reads today's date — sees no row → creates fresh
            b2 = PlusicBudget(db_path=db_path, default_cap=10)
            assert b2.remaining() == 10
            assert b2.can_wake() is True

    def test_status_returns_correct_dict(self):
        """status() returns dict with used, cap, remaining, date."""
        import datetime
        with tempfile.TemporaryDirectory() as tmp:
            b = self._make_budget(tmp, default_cap=15)
            b.spend()
            b.spend()
            b.spend()

            s = b.status()
            assert s["used"] == 3
            assert s["cap"] == 15
            assert s["remaining"] == 12
            assert s["date"] == datetime.date.today().isoformat()
