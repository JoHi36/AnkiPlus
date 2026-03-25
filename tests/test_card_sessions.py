"""Tests for storage/card_sessions.py — SQLite storage layer.

These tests use a real temporary SQLite database (not mocks).
"""

import json
import storage.card_sessions as cs


class TestCardSessionsCRUD:
    """Test basic create/read/update/delete operations."""

    def _fresh_db(self):
        """Create a fresh in-memory DB with full schema."""
        import sqlite3
        cs._db = sqlite3.connect(":memory:")
        cs._db.row_factory = sqlite3.Row
        cs._db.execute("PRAGMA foreign_keys=ON")
        cs._init_schema(cs._db)
        cs._migrate_schema(cs._db)
        # Ensure all columns exist (migrate adds pipeline_data only if
        # the messages table was created without it, but _init_schema
        # creates it without pipeline_data in the initial CREATE TABLE)
        cols = {row[1] for row in cs._db.execute("PRAGMA table_info(messages)").fetchall()}
        for col in ("pipeline_data", "deck_id", "source"):
            if col not in cols:
                default = "'tutor'" if col == "source" else "NULL"
                cs._db.execute(f"ALTER TABLE messages ADD COLUMN {col} TEXT DEFAULT {default}")
        cs._db.commit()

    def setup_method(self):
        self._fresh_db()

    def teardown_method(self):
        if cs._db:
            cs._db.close()
            cs._db = None

    def test_save_and_load_session(self):
        data = {
            "session": {"note_id": 1, "deck_id": 10, "deck_name": "TestDeck"},
            "sections": [],
            "messages": [],
        }
        assert cs.save_card_session(100, data) is True

        result = cs.load_card_session(100)
        assert result["session"] is not None
        assert result["session"]["deck_name"] == "TestDeck"

    def test_load_nonexistent_session(self):
        result = cs.load_card_session(999)
        assert result["session"] is None
        assert result["sections"] == []
        assert result["messages"] == []

    def test_save_and_load_message(self):
        # save_message auto-creates session
        msg = {"text": "Hallo", "sender": "user"}
        assert cs.save_message(100, msg) is True

        result = cs.load_card_session(100)
        assert len(result["messages"]) == 1
        assert result["messages"][0]["text"] == "Hallo"
        assert result["messages"][0]["sender"] == "user"

    def test_save_message_with_steps_and_citations(self):
        msg = {
            "text": "Antwort",
            "sender": "ai",
            "steps": [{"title": "Schritt 1"}],
            "citations": [{"source": "Karte 5"}],
        }
        cs.save_message(100, msg)

        result = cs.load_card_session(100)
        m = result["messages"][0]
        assert m["steps"] == [{"title": "Schritt 1"}]
        assert m["citations"] == [{"source": "Karte 5"}]

    def test_save_section(self):
        section = {
            "id": "sec-1",
            "title": "Review 1",
            "performance_type": "good",
            "performance_data": {"score": 0.8},
        }
        assert cs.save_section(200, section) is True

        result = cs.load_card_session(200)
        assert len(result["sections"]) == 1
        assert result["sections"][0]["title"] == "Review 1"
        assert result["sections"][0]["performance_data"] == {"score": 0.8}

    def test_delete_session_cascades(self):
        cs.save_message(300, {"text": "Msg", "sender": "user"})
        cs.save_section(300, {"id": "sec-x", "title": "Section"})

        assert cs.delete_card_session(300) is True
        result = cs.load_card_session(300)
        assert result["session"] is None
        assert result["messages"] == []
        assert result["sections"] == []

    def test_update_summary(self):
        cs.save_message(400, {"text": "Init", "sender": "user"})
        cs.update_summary(400, "Zusammenfassung")

        result = cs.load_card_session(400)
        assert result["session"]["summary"] == "Zusammenfassung"

    def test_message_limit_enforced(self):
        original_limit = cs.MAX_MESSAGES_PER_CARD
        cs.MAX_MESSAGES_PER_CARD = 5

        for i in range(10):
            cs.save_message(500, {"text": f"Msg {i}", "sender": "user"})

        result = cs.load_card_session(500)
        assert len(result["messages"]) == 5

        cs.MAX_MESSAGES_PER_CARD = original_limit

    def test_get_card_ids_with_sessions(self):
        cs.save_message(100, {"text": "A", "sender": "user"})
        cs.save_message(200, {"text": "B", "sender": "user"})

        ids = cs.get_card_ids_with_sessions()
        assert 100 in ids
        assert 200 in ids

    def test_clear_deck_messages(self):
        """clear_deck_messages deletes only card_id=NULL messages."""
        from storage.card_sessions import save_deck_message, load_deck_messages, clear_deck_messages, save_message

        # Save a free-chat message (card_id=NULL)
        save_deck_message(0, {'id': 'free-1', 'text': 'free question', 'sender': 'user'})
        save_deck_message(0, {'id': 'free-2', 'text': 'free answer', 'sender': 'assistant'})

        # Save a card-context message (card_id != NULL)
        save_message(12345, {'id': 'card-1', 'text': 'card question', 'sender': 'user', 'section_id': None})

        # Verify all exist
        msgs = load_deck_messages(0, limit=100)
        assert len(msgs) >= 3

        # Clear free-chat messages
        count = clear_deck_messages()

        # Free-chat messages gone, card message remains
        msgs_after = load_deck_messages(0, limit=100)
        card_msgs = [m for m in msgs_after if m.get('card_id')]
        free_msgs = [m for m in msgs_after if not m.get('card_id')]
        assert len(free_msgs) == 0
        assert len(card_msgs) >= 1
        assert count == 2


class TestInsights:
    """Test insight storage (stored as JSON in summary column)."""

    def setup_method(self):
        TestCardSessionsCRUD._fresh_db(self)

    def teardown_method(self):
        if cs._db:
            cs._db.close()
            cs._db = None

    def test_save_and_load_insights(self):
        insights = {"version": 1, "insights": [{"type": "weakness", "text": "Pharma"}]}
        cs.save_insights(100, insights)

        result = cs.load_insights(100)
        assert result["insights"][0]["text"] == "Pharma"

    def test_load_empty_insights(self):
        result = cs.load_insights(999)
        assert result == {"version": 1, "insights": []}

    def test_overwrite_insights(self):
        cs.save_insights(100, {"version": 1, "insights": [{"type": "strength", "text": "Alt"}]})
        cs.save_insights(100, {"version": 1, "insights": [{"type": "weakness", "text": "Neu"}]})

        result = cs.load_insights(100)
        assert len(result["insights"]) == 1
        assert result["insights"][0]["text"] == "Neu"


class TestEmbeddings:
    """Test card embedding storage."""

    def setup_method(self):
        TestCardSessionsCRUD._fresh_db(self)

    def teardown_method(self):
        if cs._db:
            cs._db.close()
            cs._db = None

    def test_save_and_load_embedding(self):
        cs.save_embedding(100, b"\x01\x02\x03", "hash123", "v1")
        result = cs.load_embedding(100)
        assert result is not None
        assert result["content_hash"] == "hash123"
        assert result["embedding"] == b"\x01\x02\x03"

    def test_load_nonexistent_embedding(self):
        assert cs.load_embedding(999) is None

    def test_count_embeddings(self):
        assert cs.count_embeddings() == 0
        cs.save_embedding(1, b"\x00", "h1", "v1")
        cs.save_embedding(2, b"\x00", "h2", "v1")
        assert cs.count_embeddings() == 2

    def test_stale_detection(self):
        cs.save_embedding(1, b"\x00", "hash_old", "v1")
        stale = cs.get_stale_card_ids({1: "hash_new", 2: "hash_any"})
        assert 1 in stale  # hash changed
        assert 2 in stale  # missing

    def test_delete_embedding(self):
        cs.save_embedding(1, b"\x00", "h1", "v1")
        cs.delete_embedding(1)
        assert cs.load_embedding(1) is None


class TestEdgeCases:
    """Edge case and error path tests."""

    def setup_method(self):
        TestCardSessionsCRUD._fresh_db(self)

    def teardown_method(self):
        if cs._db:
            cs._db.close()
            cs._db = None

    def test_save_session_empty_card_id(self):
        """Saving a session with card_id=None should not crash — returns False or raises cleanly."""
        data = {
            "session": {"deck_name": "TestDeck"},
            "sections": [],
            "messages": [],
        }
        # int(None) raises TypeError; the function should handle it gracefully
        try:
            result = cs.save_card_session(None, data)
            # If it returns instead of raising, it must signal failure
            assert result is False
        except (TypeError, ValueError):
            pass  # Acceptable: explicit exception is also graceful

    def test_max_messages_per_card_limit(self):
        """After exceeding MAX_MESSAGES_PER_CARD, oldest messages are pruned."""
        original_limit = cs.MAX_MESSAGES_PER_CARD
        cs.MAX_MESSAGES_PER_CARD = 10

        try:
            for i in range(15):
                cs.save_message(600, {"text": f"Msg {i:02d}", "sender": "user"})

            result = cs.load_card_session(600)
            assert len(result["messages"]) == 10

            # The remaining messages should be the most recent ones
            texts = [m["text"] for m in result["messages"]]
            assert "Msg 14" in texts   # newest preserved
            assert "Msg 00" not in texts  # oldest pruned
        finally:
            cs.MAX_MESSAGES_PER_CARD = original_limit

    def test_load_session_corrupted_json_fields(self):
        """Loading a session whose steps/citations columns hold invalid JSON does not crash."""
        import sqlite3

        card_id = 700
        now = "2024-01-01T00:00:00"

        # Directly insert a session and a message with invalid JSON in steps/citations
        cs._db.execute(
            "INSERT INTO card_sessions (card_id, created_at, updated_at) VALUES (?, ?, ?)",
            (card_id, now, now),
        )
        cs._db.execute(
            "INSERT INTO messages (id, card_id, text, sender, created_at, steps, citations)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("msg-bad-json", card_id, "test", "ai", now, "NOT_VALID_JSON{{{", "[unclosed"),
        )
        cs._db.commit()

        result = cs.load_card_session(card_id)
        assert result["session"] is not None
        assert len(result["messages"]) == 1
        msg = result["messages"][0]
        # Should not raise; bad JSON is returned as-is (raw string passthrough)
        assert msg["text"] == "test"
        # steps and citations are present — either raw string or parsed; crucially no exception
        assert "steps" in msg
        assert "citations" in msg
