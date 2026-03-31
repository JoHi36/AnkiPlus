"""
plusi/budget.py — daily wake-up budget tracker for Plusi's autonomous actions.

Tracks how many times Plusi can autonomously "wake up" per day.
Budget resets automatically each calendar day via a per-date SQLite row.
"""

import os
import sqlite3
import datetime

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)

_DEFAULT_DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "plusi.db")


class PlusicBudget:
    """Daily wake-up budget for Plusi autonomous actions.

    Each calendar date gets its own row. When a new date is first accessed
    a fresh row is created with 0 used, giving a full cap automatically.
    Old date rows are left untouched (historical reference).
    """

    def __init__(self, db_path=None, default_cap=20):
        self._db_path = db_path if db_path is not None else _DEFAULT_DB_PATH
        self._default_cap = default_cap
        self._db = sqlite3.connect(self._db_path, check_same_thread=False)
        self._db.execute("PRAGMA journal_mode=WAL")
        self._init_schema()

    # ------------------------------------------------------------------
    # Schema
    # ------------------------------------------------------------------

    def _init_schema(self):
        self._db.execute("""
            CREATE TABLE IF NOT EXISTS plusi_budget (
                date    TEXT PRIMARY KEY,
                wake_ups INTEGER NOT NULL DEFAULT 0,
                cap      INTEGER NOT NULL DEFAULT 20
            )
        """)
        self._db.commit()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _today(self):
        return datetime.date.today().isoformat()

    def _ensure_today(self):
        """Guarantee a row for today exists; returns (wake_ups, cap)."""
        today = self._today()
        row = self._db.execute(
            "SELECT wake_ups, cap FROM plusi_budget WHERE date = ?", (today,)
        ).fetchone()
        if row is None:
            self._db.execute(
                "INSERT INTO plusi_budget (date, wake_ups, cap) VALUES (?, 0, ?)",
                (today, self._default_cap),
            )
            self._db.commit()
            return 0, self._default_cap
        return row[0], row[1]

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def remaining(self) -> int:
        """Return remaining wake-ups for today (cap - used). Resets each day."""
        used, cap = self._ensure_today()
        return max(0, cap - used)

    def can_wake(self) -> bool:
        """Return True if at least one wake-up remains for today."""
        return self.remaining() > 0

    def spend(self):
        """Consume one wake-up for today."""
        self._ensure_today()
        today = self._today()
        self._db.execute(
            "UPDATE plusi_budget SET wake_ups = wake_ups + 1 WHERE date = ?",
            (today,),
        )
        self._db.commit()
        logger.info("Plusi budget spent — %s remaining today", self.remaining())

    def status(self) -> dict:
        """Return a summary dict: used, cap, remaining, date."""
        used, cap = self._ensure_today()
        remaining = max(0, cap - used)
        return {
            "used": used,
            "cap": cap,
            "remaining": remaining,
            "date": self._today(),
        }
