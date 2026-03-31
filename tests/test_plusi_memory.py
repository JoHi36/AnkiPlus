"""Tests for plusi/memory.py — unified Plusi memory and diary storage.

Tests use tempfile.TemporaryDirectory for isolation.
"""

import os
import sys
import sqlite3
import tempfile
import pytest

# Ensure project root is on path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Mock aqt before any project imports
if 'aqt' not in sys.modules:
    sys.modules['aqt'] = type(sys)('aqt')


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def tmp_memory(tmp_path):
    """Fresh PlusiMemory instance backed by a temp DB file."""
    from plusi.memory import PlusiMemory
    db_path = str(tmp_path / "plusi_test.db")
    mem = PlusiMemory(db_path=db_path)
    yield mem
    mem._db.close()


# ---------------------------------------------------------------------------
# 1. Table creation
# ---------------------------------------------------------------------------

class TestTableCreation:
    """All five tables must be created on init."""

    def test_all_tables_exist(self, tmp_memory):
        cursor = tmp_memory._db.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )
        tables = {row[0] for row in cursor.fetchall()}
        assert "plusi_memories" in tables
        assert "plusi_diary" in tables
        assert "plusi_subscriptions" in tables
        assert "plusi_budget" in tables
        assert "plusi_history" in tables

    def test_plusi_memories_columns(self, tmp_memory):
        cursor = tmp_memory._db.execute("PRAGMA table_info(plusi_memories)")
        cols = {row[1] for row in cursor.fetchall()}
        assert "id" in cols
        assert "text" in cols
        assert "embedding" in cols
        assert "created_at" in cols
        assert "accessed_at" in cols
        assert "access_count" in cols
        assert "mood" in cols
        assert "source" in cols

    def test_plusi_diary_columns(self, tmp_memory):
        cursor = tmp_memory._db.execute("PRAGMA table_info(plusi_diary)")
        cols = {row[1] for row in cursor.fetchall()}
        assert "id" in cols
        assert "timestamp" in cols
        assert "entry_text" in cols
        assert "mood" in cols

    def test_plusi_subscriptions_columns(self, tmp_memory):
        cursor = tmp_memory._db.execute("PRAGMA table_info(plusi_subscriptions)")
        cols = {row[1] for row in cursor.fetchall()}
        assert "id" in cols
        assert "name" in cols
        assert "event" in cols
        assert "condition_raw" in cols
        assert "condition_parsed" in cols
        assert "wake_prompt" in cols
        assert "fire_count" in cols
        assert "last_fired_at" in cols
        assert "active" in cols

    def test_plusi_budget_columns(self, tmp_memory):
        cursor = tmp_memory._db.execute("PRAGMA table_info(plusi_budget)")
        cols = {row[1] for row in cursor.fetchall()}
        assert "date" in cols
        assert "wake_ups" in cols
        assert "cap" in cols

    def test_plusi_history_columns(self, tmp_memory):
        cursor = tmp_memory._db.execute("PRAGMA table_info(plusi_history)")
        cols = {row[1] for row in cursor.fetchall()}
        assert "id" in cols
        assert "timestamp" in cols
        assert "context" in cols
        assert "response" in cols
        assert "mood" in cols


# ---------------------------------------------------------------------------
# 2. store() and get()
# ---------------------------------------------------------------------------

class TestStoreAndRetrieve:

    def test_store_returns_integer_id(self, tmp_memory):
        embedding = bytes([0] * 16)
        memory_id = tmp_memory.store("Der Mitochondrium erzeugt ATP", embedding)
        assert isinstance(memory_id, int)
        assert memory_id > 0

    def test_get_returns_correct_text(self, tmp_memory):
        embedding = bytes([1, 2, 3, 4])
        text = "Plusi ist neugierig."
        memory_id = tmp_memory.store(text, embedding)
        result = tmp_memory.get(memory_id)
        assert result is not None
        assert result["text"] == text

    def test_get_returns_embedding_blob(self, tmp_memory):
        embedding = bytes([10, 20, 30])
        memory_id = tmp_memory.store("test", embedding)
        result = tmp_memory.get(memory_id)
        assert result["embedding"] == embedding

    def test_store_with_mood_and_source(self, tmp_memory):
        embedding = bytes([0])
        memory_id = tmp_memory.store(
            "Interessante Idee", embedding, mood="neugierig", source="diary"
        )
        result = tmp_memory.get(memory_id)
        assert result["mood"] == "neugierig"
        assert result["source"] == "diary"

    def test_store_defaults_source_to_chat(self, tmp_memory):
        memory_id = tmp_memory.store("test", bytes([0]))
        result = tmp_memory.get(memory_id)
        assert result["source"] == "chat"

    def test_get_nonexistent_returns_none(self, tmp_memory):
        result = tmp_memory.get(99999)
        assert result is None

    def test_access_count_starts_at_zero(self, tmp_memory):
        memory_id = tmp_memory.store("test", bytes([0]))
        result = tmp_memory.get(memory_id)
        assert result["access_count"] == 0

    def test_multiple_stores_get_distinct_ids(self, tmp_memory):
        id1 = tmp_memory.store("first", bytes([1]))
        id2 = tmp_memory.store("second", bytes([2]))
        assert id1 != id2

    def test_all_memories_returns_all(self, tmp_memory):
        tmp_memory.store("a", bytes([0]))
        tmp_memory.store("b", bytes([1]))
        tmp_memory.store("c", bytes([2]))
        all_m = tmp_memory.all_memories()
        assert len(all_m) == 3

    def test_all_memories_empty_when_none(self, tmp_memory):
        assert tmp_memory.all_memories() == []


# ---------------------------------------------------------------------------
# 3. forget()
# ---------------------------------------------------------------------------

class TestForget:

    def test_forget_removes_memory(self, tmp_memory):
        memory_id = tmp_memory.store("Vergiss mich", bytes([0]))
        assert tmp_memory.get(memory_id) is not None
        tmp_memory.forget(memory_id)
        assert tmp_memory.get(memory_id) is None

    def test_forget_nonexistent_does_not_raise(self, tmp_memory):
        # Should be a no-op
        tmp_memory.forget(99999)

    def test_forget_only_removes_target(self, tmp_memory):
        id1 = tmp_memory.store("keep me", bytes([1]))
        id2 = tmp_memory.store("forget me", bytes([2]))
        tmp_memory.forget(id2)
        assert tmp_memory.get(id1) is not None
        assert tmp_memory.get(id2) is None


# ---------------------------------------------------------------------------
# 3b. update_access()
# ---------------------------------------------------------------------------

class TestUpdateAccess:

    def test_update_access_increments_count(self, tmp_memory):
        memory_id = tmp_memory.store("test", bytes([0]))
        tmp_memory.update_access(memory_id)
        result = tmp_memory.get(memory_id)
        assert result["access_count"] == 1

    def test_update_access_multiple_times(self, tmp_memory):
        memory_id = tmp_memory.store("test", bytes([0]))
        tmp_memory.update_access(memory_id)
        tmp_memory.update_access(memory_id)
        tmp_memory.update_access(memory_id)
        result = tmp_memory.get(memory_id)
        assert result["access_count"] == 3


# ---------------------------------------------------------------------------
# 4. save_interaction() + load_history()
# ---------------------------------------------------------------------------

class TestHistory:

    def test_save_and_load_single_interaction(self, tmp_memory):
        tmp_memory.save_interaction(
            context="Du hast gerade Pharmakologie gelernt.",
            response="Cool! Möchtest du weitermachen?",
            mood="motiviert"
        )
        history = tmp_memory.load_history()
        assert len(history) == 1
        entry = history[0]
        assert entry["role"] == "assistant"
        assert "Cool!" in entry["content"]

    def test_load_history_respects_limit(self, tmp_memory):
        for i in range(15):
            tmp_memory.save_interaction(
                context=f"Kontext {i}",
                response=f"Antwort {i}",
                mood="neutral"
            )
        history = tmp_memory.load_history(limit=5)
        assert len(history) == 5

    def test_load_history_chronological_order(self, tmp_memory):
        tmp_memory.save_interaction("ctx1", "first", "neutral")
        tmp_memory.save_interaction("ctx2", "second", "neutral")
        tmp_memory.save_interaction("ctx3", "third", "neutral")
        history = tmp_memory.load_history()
        responses = [e["content"] for e in history]
        assert responses == ["first", "second", "third"]

    def test_load_history_empty_when_none(self, tmp_memory):
        history = tmp_memory.load_history()
        assert history == []

    def test_load_history_default_limit_ten(self, tmp_memory):
        for i in range(12):
            tmp_memory.save_interaction(f"ctx{i}", f"resp{i}", "neutral")
        history = tmp_memory.load_history()
        assert len(history) == 10


# ---------------------------------------------------------------------------
# 5. save_diary() + load_diary()
# ---------------------------------------------------------------------------

class TestDiary:

    def test_save_and_load_diary_entry(self, tmp_memory):
        tmp_memory.save_diary("Heute war ein guter Tag.", mood="freudig")
        diary = tmp_memory.load_diary()
        assert len(diary) == 1
        assert "guter Tag" in diary[0]["entry_text"]
        assert diary[0]["mood"] == "freudig"

    def test_load_diary_respects_limit(self, tmp_memory):
        for i in range(60):
            tmp_memory.save_diary(f"Eintrag {i}", mood="neutral")
        diary = tmp_memory.load_diary(limit=10)
        assert len(diary) == 10

    def test_load_diary_default_limit_50(self, tmp_memory):
        for i in range(55):
            tmp_memory.save_diary(f"Eintrag {i}", mood="neutral")
        diary = tmp_memory.load_diary()
        assert len(diary) == 50

    def test_load_diary_empty_when_none(self, tmp_memory):
        assert tmp_memory.load_diary() == []

    def test_diary_has_timestamp(self, tmp_memory):
        tmp_memory.save_diary("test", mood="neutral")
        entry = tmp_memory.load_diary()[0]
        assert "timestamp" in entry
        assert entry["timestamp"] is not None

    def test_diary_default_mood_is_neutral(self, tmp_memory):
        # Save without specifying mood — should default to 'neutral'
        tmp_memory.save_diary("test")
        entry = tmp_memory.load_diary()[0]
        assert entry["mood"] == "neutral"

    def test_multiple_diary_entries_all_returned(self, tmp_memory):
        tmp_memory.save_diary("Montag", mood="müde")
        tmp_memory.save_diary("Dienstag", mood="wach")
        tmp_memory.save_diary("Mittwoch", mood="freudig")
        diary = tmp_memory.load_diary()
        assert len(diary) == 3

    def test_diary_entries_have_id(self, tmp_memory):
        tmp_memory.save_diary("test", mood="neutral")
        entry = tmp_memory.load_diary()[0]
        assert "id" in entry
        assert entry["id"] is not None


# ---------------------------------------------------------------------------
# 6. DB path defaults to plusi/ directory
# ---------------------------------------------------------------------------

class TestDefaultDbPath:

    def test_default_db_path_in_plusi_dir(self):
        """PlusiMemory() without db_path should use plusi/plusi.db."""
        from plusi.memory import PlusiMemory
        mem = PlusiMemory()
        expected_dir = os.path.join(PROJECT_ROOT, "plusi")
        assert mem._db_path.startswith(expected_dir)
        assert mem._db_path.endswith(".db")
        mem._db.close()
