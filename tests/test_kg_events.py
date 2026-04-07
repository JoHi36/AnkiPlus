"""Tests for storage/kg_events.py — local KG event buffer."""

import json
import os
import sqlite3
import sys
import unittest

# Ensure project root is on path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestKgEvents(unittest.TestCase):
    """Test the KG event buffer using an in-memory SQLite database."""

    def setUp(self):
        """Create an in-memory DB and initialize schema."""
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS kg_events (
                id          TEXT PRIMARY KEY,
                event_type  TEXT NOT NULL,
                payload     TEXT NOT NULL,
                created_at  TEXT DEFAULT (datetime('now')),
                synced      INTEGER DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_kg_events_pending
                ON kg_events(synced, created_at);
        """)
        self.db.commit()

        # Patch _get_db to return our in-memory DB
        import storage.kg_events as mod
        self._orig_get_db = mod._get_db
        mod._get_db = lambda: self.db

    def tearDown(self):
        import storage.kg_events as mod
        mod._get_db = self._orig_get_db
        self.db.close()

    def test_queue_event_creates_row(self):
        from storage.kg_events import queue_event, get_pending

        event_id = queue_event("card_embedded", {"card_id": 42, "hash": "abc123"})
        self.assertIsNotNone(event_id)

        pending = get_pending()
        self.assertEqual(len(pending), 1)
        self.assertEqual(pending[0]["event_type"], "card_embedded")
        self.assertEqual(pending[0]["payload"]["card_id"], 42)

    def test_get_pending_respects_limit(self):
        from storage.kg_events import queue_event, get_pending

        for i in range(10):
            queue_event("test", {"i": i})

        pending = get_pending(limit=3)
        self.assertEqual(len(pending), 3)

    def test_mark_synced(self):
        from storage.kg_events import queue_event, get_pending, mark_synced

        ids = []
        for i in range(5):
            eid = queue_event("test", {"i": i})
            ids.append(eid)

        # Mark first 3 as synced
        mark_synced(ids[:3])

        pending = get_pending()
        self.assertEqual(len(pending), 2)

    def test_delete_synced(self):
        from storage.kg_events import queue_event, mark_synced, delete_synced

        ids = []
        for i in range(5):
            eid = queue_event("test", {"i": i})
            ids.append(eid)

        mark_synced(ids[:3])
        deleted = delete_synced()
        self.assertEqual(deleted, 3)

        # Verify only 2 rows remain
        row = self.db.execute("SELECT COUNT(*) FROM kg_events").fetchone()
        self.assertEqual(row[0], 2)

    def test_pending_count(self):
        from storage.kg_events import queue_event, mark_synced, pending_count

        for i in range(4):
            queue_event("test", {"i": i})

        self.assertEqual(pending_count(), 4)

        pending = self.db.execute("SELECT id FROM kg_events LIMIT 2").fetchall()
        mark_synced([r["id"] for r in pending])

        self.assertEqual(pending_count(), 2)

    def test_payload_json_roundtrip(self):
        from storage.kg_events import queue_event, get_pending

        payload = {"card_id": 99, "embedding": [0.1, 0.2, 0.3], "text": "Hallo Welt"}
        queue_event("card_embedded", payload)

        pending = get_pending()
        self.assertEqual(pending[0]["payload"]["embedding"], [0.1, 0.2, 0.3])
        self.assertEqual(pending[0]["payload"]["text"], "Hallo Welt")

    def test_empty_pending(self):
        from storage.kg_events import get_pending
        self.assertEqual(get_pending(), [])

    def test_mark_synced_empty_list(self):
        from storage.kg_events import mark_synced
        # Should not raise
        mark_synced([])


if __name__ == "__main__":
    unittest.main()
