"""
plusi/memory.py
Unified storage module for the Plusi companion system.

Tables
------
plusi_memories    — Embedding-based long-term memory
plusi_diary       — Free-text diary entries
plusi_subscriptions — Event subscriptions (wake-up triggers)
plusi_budget      — Daily wake-up cap
plusi_history     — Chat interaction log
"""

from __future__ import annotations

import os
import sqlite3
from typing import Optional

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)

# Default DB path: <addon_root>/plusi/plusi.db
_DEFAULT_DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "plusi.db")

# Constants
MAX_HISTORY_ROWS = 500  # Hard cap on plusi_history to prevent unbounded growth


class PlusiMemory:
    """Unified persistent storage for the Plusi companion.

    Usage
    -----
        mem = PlusiMemory()                      # uses default path
        mem = PlusiMemory(db_path="/tmp/x.db")  # custom path (e.g. tests)

    All methods are synchronous and safe for single-threaded use.
    The underlying SQLite connection uses WAL mode for read concurrency.
    """

    def __init__(self, db_path: str = None):
        self._db_path = db_path or _DEFAULT_DB_PATH
        self._db = self._connect()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _connect(self) -> sqlite3.Connection:
        """Open SQLite connection and initialise schema."""
        db = sqlite3.connect(self._db_path, check_same_thread=False)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA foreign_keys=ON")
        self._init_schema(db)
        return db

    @staticmethod
    def _init_schema(db: sqlite3.Connection) -> None:
        """Create all tables if they don't exist (idempotent)."""
        db.executescript("""
            -- Long-term embedding memory
            CREATE TABLE IF NOT EXISTS plusi_memories (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                text         TEXT    NOT NULL,
                embedding    BLOB,
                created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
                accessed_at  TEXT,
                access_count INTEGER NOT NULL DEFAULT 0,
                mood         TEXT,
                source       TEXT    NOT NULL DEFAULT 'chat'
            );

            -- Free diary
            CREATE TABLE IF NOT EXISTS plusi_diary (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp  TEXT    NOT NULL DEFAULT (datetime('now')),
                entry_text TEXT    NOT NULL,
                mood       TEXT    NOT NULL DEFAULT 'neutral'
            );

            -- Event subscriptions (wake-up triggers)
            CREATE TABLE IF NOT EXISTS plusi_subscriptions (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                name             TEXT    NOT NULL UNIQUE,
                event            TEXT    NOT NULL,
                condition_raw    TEXT,
                condition_parsed TEXT,
                wake_prompt      TEXT,
                fire_count       INTEGER NOT NULL DEFAULT 0,
                last_fired_at    TEXT,
                active           INTEGER NOT NULL DEFAULT 1
            );

            -- Daily wake-up budget
            CREATE TABLE IF NOT EXISTS plusi_budget (
                date     TEXT    PRIMARY KEY,
                wake_ups INTEGER NOT NULL DEFAULT 0,
                cap      INTEGER NOT NULL DEFAULT 10
            );

            -- Interaction history
            CREATE TABLE IF NOT EXISTS plusi_history (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT    NOT NULL DEFAULT (datetime('now')),
                context   TEXT    NOT NULL,
                response  TEXT    NOT NULL,
                mood      TEXT    NOT NULL DEFAULT 'neutral'
            );

            CREATE INDEX IF NOT EXISTS idx_memories_created
                ON plusi_memories(created_at DESC);

            CREATE INDEX IF NOT EXISTS idx_diary_timestamp
                ON plusi_diary(timestamp DESC);

            CREATE INDEX IF NOT EXISTS idx_history_timestamp
                ON plusi_history(timestamp ASC);
        """)
        db.commit()

    # ------------------------------------------------------------------
    # plusi_memories API
    # ------------------------------------------------------------------

    def store(self, text: str, embedding: bytes, mood: str = None, source: str = "chat") -> int:
        """Store a new memory and return its row id.

        Parameters
        ----------
        text:      Plain-text content of the memory.
        embedding: Raw bytes of the embedding vector (BLOB).
        mood:      Plusi's mood at time of storage (optional).
        source:    Origin label — 'chat', 'diary', 'reflection', etc.

        Returns
        -------
        int: The auto-assigned primary key of the new row.
        """
        cursor = self._db.execute(
            """
            INSERT INTO plusi_memories (text, embedding, mood, source)
            VALUES (?, ?, ?, ?)
            """,
            (text, embedding, mood, source),
        )
        self._db.commit()
        logger.debug("plusi_memories: stored id=%s source=%s", cursor.lastrowid, source)
        return cursor.lastrowid

    def get(self, memory_id: int) -> dict | None:
        """Retrieve a memory by id. Returns dict or None if not found."""
        row = self._db.execute(
            "SELECT * FROM plusi_memories WHERE id = ?", (memory_id,)
        ).fetchone()
        if row is None:
            return None
        return dict(row)

    def forget(self, memory_id: int) -> None:
        """Delete a memory by id. No-op if id does not exist."""
        self._db.execute("DELETE FROM plusi_memories WHERE id = ?", (memory_id,))
        self._db.commit()
        logger.debug("plusi_memories: forgot id=%s", memory_id)

    def all_memories(self) -> list[dict]:
        """Return all memories ordered by creation date (newest first)."""
        rows = self._db.execute(
            "SELECT * FROM plusi_memories ORDER BY created_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]

    def update_access(self, memory_id: int) -> None:
        """Increment access_count and update accessed_at for a memory."""
        self._db.execute(
            """
            UPDATE plusi_memories
            SET access_count = access_count + 1,
                accessed_at  = datetime('now')
            WHERE id = ?
            """,
            (memory_id,),
        )
        self._db.commit()
        logger.debug("plusi_memories: updated access id=%s", memory_id)

    # ------------------------------------------------------------------
    # plusi_history API
    # ------------------------------------------------------------------

    def save_interaction(self, context: str, response: str, mood: str) -> None:
        """Persist one Plusi interaction (context + response + mood).

        Parameters
        ----------
        context:  The triggering context passed to Plusi (e.g. card info).
        response: Plusi's response text.
        mood:     Plusi's mood at response time.
        """
        self._db.execute(
            """
            INSERT INTO plusi_history (context, response, mood)
            VALUES (?, ?, ?)
            """,
            (context, response, mood),
        )
        self._db.commit()
        logger.debug("plusi_history: saved interaction mood=%s", mood)

    def load_history(self, limit: int = 10) -> list[dict]:
        """Return the most recent *limit* interactions as role/content dicts.

        Returned in chronological order (oldest first within the window).
        Format: [{"role": "assistant", "content": "<response text>"}, ...]
        """
        rows = self._db.execute(
            """
            SELECT response
            FROM plusi_history
            ORDER BY timestamp DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        # Reverse to get chronological order (oldest first)
        return [{"role": "assistant", "content": row[0]} for row in reversed(rows)]

    # ------------------------------------------------------------------
    # plusi_diary API
    # ------------------------------------------------------------------

    def save_diary(self, text: str, mood: str = "neutral") -> None:
        """Append an entry to the Plusi diary.

        Parameters
        ----------
        text: The diary entry text (Plusi's observation/thought).
        mood: Plusi's mood at the time of writing.
        """
        self._db.execute(
            """
            INSERT INTO plusi_diary (entry_text, mood)
            VALUES (?, ?)
            """,
            (text, mood),
        )
        self._db.commit()
        logger.debug("plusi_diary: saved entry mood=%s", mood)

    def load_diary(self, limit: int = 50) -> list[dict]:
        """Return the most recent *limit* diary entries (newest first).

        Returns
        -------
        list of dicts with keys: id, timestamp, entry_text, mood
        """
        rows = self._db.execute(
            """
            SELECT id, timestamp, entry_text, mood
            FROM plusi_diary
            ORDER BY timestamp DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [dict(r) for r in rows]
