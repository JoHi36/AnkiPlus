"""
plusi/migrate.py
One-time migration script for the Plusi companion database.

Detects the old-format plusi.db (identified by the presence of the
`plusi_memory` table with category/key/value columns) and renames it to
`plusi_legacy.db` so the new PlusiMemory creates a fresh v2 database.

Call `migrate_if_needed()` BEFORE instantiating PlusiMemory.
"""

from __future__ import annotations

import os
import shutil
import sqlite3

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)

_PLUSI_DIR = os.path.dirname(os.path.abspath(__file__))
_MARKER_PATH = os.path.join(_PLUSI_DIR, ".plusi_v2_migrated")
_DB_PATH = os.path.join(_PLUSI_DIR, "plusi.db")
_LEGACY_DB_PATH = os.path.join(_PLUSI_DIR, "plusi_legacy.db")


def _has_old_format(db_path: str) -> bool:
    """Return True if *db_path* contains the old-format `plusi_memory` table."""
    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='plusi_memory'"
        )
        return cursor.fetchone() is not None
    finally:
        conn.close()


def migrate_if_needed() -> None:
    """Back up old Plusi DB to plusi_legacy.db if the old schema is detected.

    Safe to call multiple times — the marker file `.plusi_v2_migrated`
    prevents any work after the first successful run.
    """
    # Already migrated — nothing to do.
    if os.path.exists(_MARKER_PATH):
        logger.debug("plusi migrate: marker present, skipping")
        return

    try:
        if os.path.exists(_DB_PATH):
            if _has_old_format(_DB_PATH):
                logger.info(
                    "plusi migrate: old-format plusi.db detected — backing up to plusi_legacy.db"
                )
                shutil.move(_DB_PATH, _LEGACY_DB_PATH)
                logger.info("plusi migrate: moved plusi.db → plusi_legacy.db")

                # Move WAL / SHM sidecar files if present.
                for suffix in ("-wal", "-shm"):
                    src = _DB_PATH + suffix
                    if os.path.exists(src):
                        dst = _LEGACY_DB_PATH + suffix
                        shutil.move(src, dst)
                        logger.info("plusi migrate: moved plusi.db%s → plusi_legacy.db%s", suffix, suffix)
            else:
                logger.info(
                    "plusi migrate: plusi.db exists but is already v2 format — no backup needed"
                )
        else:
            logger.debug("plusi migrate: no plusi.db found — fresh install")

    except Exception:
        logger.exception("plusi migrate: error during migration check — skipping")

    # Always write marker so we never retry.
    try:
        with open(_MARKER_PATH, "w", encoding="utf-8") as fh:
            fh.write("v2")
        logger.info("plusi migrate: wrote marker .plusi_v2_migrated")
    except OSError:
        logger.exception("plusi migrate: could not write marker file")
