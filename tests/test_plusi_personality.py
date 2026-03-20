"""Tests for Plusi personality computation: energy log, personality position, snapshots."""

import pytest
import sqlite3
import plusi.storage as mod


@pytest.fixture(autouse=True)
def fresh_db(tmp_path):
    """Use a fresh temp DB for each test by pre-initializing _db."""
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


# ── Energy Log ──────────────────────────────────────────────────────────

class TestEnergyLog:
    def test_append_energy_log_creates_entry(self):
        mod._append_energy_log(7)
        log = mod.get_memory('state', 'energy_log', [])
        assert len(log) == 1
        assert log[0]['energy'] == 7

    def test_append_energy_log_multiple(self):
        for e in [3, 5, 8]:
            mod._append_energy_log(e)
        log = mod.get_memory('state', 'energy_log', [])
        assert len(log) == 3
        energies = [entry['energy'] for entry in log]
        assert energies == [3, 5, 8]

    def test_append_energy_log_has_timestamp(self):
        mod._append_energy_log(6)
        log = mod.get_memory('state', 'energy_log', [])
        assert 'ts' in log[0]

    def test_energy_log_rolling_limit(self):
        """Energy log should not grow beyond 100 entries."""
        for i in range(110):
            mod._append_energy_log(5)
        log = mod.get_memory('state', 'energy_log', [])
        assert len(log) == 100


# ── Personality Position ────────────────────────────────────────────────

class TestPersonalityPosition:
    def test_no_data_not_confident(self):
        pos = mod.compute_personality_position()
        assert pos['confident'] is False

    def test_not_confident_below_threshold(self):
        """Need at least 5 interactions AND 5 energy entries."""
        # 3 interactions, 3 energy entries — not enough
        for _ in range(3):
            mod.save_interaction('ctx', 'resp', 'neutral', None, 'chat')
            mod._append_energy_log(5)
        pos = mod.compute_personality_position()
        assert pos['confident'] is False

    def test_confident_with_enough_data(self):
        for _ in range(5):
            mod.save_interaction('ctx', 'resp', 'neutral', None, 'chat')
            mod._append_energy_log(5)
        pos = mod.compute_personality_position()
        assert pos['confident'] is True

    def test_all_chat_high_energy_is_entertainer(self):
        """All chat + high energy → top-right → Entertainer."""
        for _ in range(6):
            mod.save_interaction('ctx', 'resp', 'neutral', None, 'chat')
            mod._append_energy_log(10)
        pos = mod.compute_personality_position()
        assert pos['confident'] is True
        assert pos['x'] == pytest.approx(1.0)
        assert pos['y'] == pytest.approx(1.0)
        assert pos['quadrant_label'] == 'Entertainer'

    def test_all_reflect_low_energy_is_philosopher(self):
        """All reflect + low energy → bottom-left → Philosopher."""
        for _ in range(6):
            mod.save_interaction('ctx', 'resp', 'neutral', None, 'reflect')
            mod._append_energy_log(1)
        pos = mod.compute_personality_position()
        assert pos['confident'] is True
        assert pos['x'] == pytest.approx(0.0)
        assert pos['y'] == pytest.approx(0.0)
        assert pos['quadrant_label'] == 'Philosopher'

    def test_all_chat_low_energy_is_companion(self):
        """All chat + low energy → bottom-right → Companion."""
        for _ in range(6):
            mod.save_interaction('ctx', 'resp', 'neutral', None, 'chat')
            mod._append_energy_log(1)
        pos = mod.compute_personality_position()
        assert pos['x'] == pytest.approx(1.0)
        assert pos['y'] == pytest.approx(0.0)
        assert pos['quadrant_label'] == 'Companion'

    def test_all_silent_high_energy_is_mystic(self):
        """All silent + high energy → top-left → Mystic."""
        for _ in range(6):
            mod.save_interaction('ctx', 'resp', 'neutral', None, 'silent')
            mod._append_energy_log(10)
        pos = mod.compute_personality_position()
        assert pos['x'] == pytest.approx(0.0)
        assert pos['y'] == pytest.approx(1.0)
        assert pos['quadrant_label'] == 'Mystic'

    def test_mixed_interactions(self):
        """Mix of chat and reflect should give x between 0 and 1."""
        for _ in range(3):
            mod.save_interaction('ctx', 'resp', 'neutral', None, 'chat')
            mod._append_energy_log(5)
        for _ in range(3):
            mod.save_interaction('ctx', 'resp', 'neutral', None, 'reflect')
            mod._append_energy_log(5)
        pos = mod.compute_personality_position()
        assert pos['confident'] is True
        assert 0.0 < pos['x'] < 1.0  # mixed
        assert pos['y'] == pytest.approx((5.0 - 1) / 9.0)


# ── Personality Snapshot ────────────────────────────────────────────────

class TestPersonalitySnapshot:
    def test_save_snapshot(self):
        position = {
            'x': 0.7, 'y': 0.8,
            'quadrant_label': 'Entertainer',
            'confident': True,
        }
        mod._save_personality_snapshot(position)
        snapshots = mod.get_memory('self', 'personality_snapshots', [])
        assert len(snapshots) == 1
        assert snapshots[0]['x'] == 0.7
        assert snapshots[0]['quadrant_label'] == 'Entertainer'

    def test_snapshot_appends(self):
        for label in ['Philosopher', 'Mystic', 'Entertainer']:
            pos = {'x': 0.5, 'y': 0.5, 'quadrant_label': label, 'confident': True}
            mod._save_personality_snapshot(pos)
        snapshots = mod.get_memory('self', 'personality_snapshots', [])
        assert len(snapshots) == 3

    def test_snapshot_rolling_limit(self):
        """Snapshots should not grow beyond 50."""
        for i in range(60):
            pos = {'x': 0.5, 'y': 0.5, 'quadrant_label': 'Test', 'confident': True}
            mod._save_personality_snapshot(pos)
        snapshots = mod.get_memory('self', 'personality_snapshots', [])
        assert len(snapshots) == 50


# ── Integration: persist_internal_state triggers personality ────────────

class TestPersistIntegration:
    def test_persist_with_energy_appends_log(self):
        mod.persist_internal_state({'energy': 7})
        log = mod.get_memory('state', 'energy_log', [])
        assert len(log) == 1
        assert log[0]['energy'] == 7

    def test_persist_confident_saves_snapshot_and_tendency(self):
        # Seed enough data for confidence
        for _ in range(5):
            mod.save_interaction('ctx', 'resp', 'neutral', None, 'chat')
            mod._append_energy_log(8)
        # This persist call should trigger snapshot
        mod.persist_internal_state({'energy': 8})
        tendency = mod.get_memory('self', 'personality_tendency')
        assert tendency is not None
        snapshots = mod.get_memory('self', 'personality_snapshots', [])
        assert len(snapshots) >= 1

    def test_persist_not_confident_no_snapshot(self):
        mod.persist_internal_state({'energy': 5})
        snapshots = mod.get_memory('self', 'personality_snapshots', [])
        assert len(snapshots) == 0
