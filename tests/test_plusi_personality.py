"""Tests for Plusi personality computation: energy log, personality position, drive weights, snapshots."""

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
        log = mod.get_memory('personality', 'energy_log', [])
        assert len(log) == 1
        assert log[0]['energy'] == 7

    def test_append_energy_log_multiple(self):
        for e in [3, 5, 8]:
            mod._append_energy_log(e)
        log = mod.get_memory('personality', 'energy_log', [])
        assert len(log) == 3
        energies = [entry['energy'] for entry in log]
        assert energies == [3, 5, 8]

    def test_append_energy_log_has_timestamp(self):
        mod._append_energy_log(6)
        log = mod.get_memory('personality', 'energy_log', [])
        assert 'ts' in log[0]

    def test_energy_log_rolling_limit(self):
        """Energy log should not grow beyond 100 entries."""
        for i in range(110):
            mod._append_energy_log(5)
        log = mod.get_memory('personality', 'energy_log', [])
        assert len(log) == 100


# ── Personality Position ────────────────────────────────────────────────

def _seed_confident(self_count=3, user_count=3, energy=5):
    """Seed enough data for confident personality computation.

    X-axis is now based on self-memories vs user-memories ratio.
    Y-axis uses diary energy entries (long-term).
    Confidence requires >= 5 total memories AND >= 5 diary energy entries.
    """
    for i in range(self_count):
        mod.set_memory('self', f'trait_{i}', f'value_{i}')
    for i in range(user_count):
        mod.set_memory('user', f'fact_{i}', f'value_{i}')
    for i in range(max(self_count + user_count, 5)):
        mod.save_diary_entry(f'entry_{i}', [], energy=energy)


class TestPersonalityPosition:
    def test_no_data_not_confident(self):
        pos = mod.compute_personality_position()
        assert pos['confident'] is False

    def test_not_confident_returns_unknown_quadrant(self):
        pos = mod.compute_personality_position()
        assert pos['quadrant'] == 'unknown'
        assert pos['quadrant_label'] == 'Noch zu wenig Daten'

    def test_not_confident_below_threshold(self):
        """Need at least 5 total memories AND 5 energy entries."""
        # 2 self + 1 user = 3 total memories — not enough
        for i in range(2):
            mod.set_memory('self', f'trait_{i}', f'value_{i}')
        mod.set_memory('user', 'fact_0', 'value_0')
        for _ in range(3):
            mod._append_energy_log(5)
        pos = mod.compute_personality_position()
        assert pos['confident'] is False

    def test_confident_with_enough_data(self):
        _seed_confident(self_count=3, user_count=3, energy=5)
        pos = mod.compute_personality_position()
        assert pos['confident'] is True

    def test_all_user_memories_high_energy_is_begleiter(self):
        """All user memories (x=1.0) + high energy (y=1.0) → top-right → Begleiter."""
        _seed_confident(self_count=0, user_count=6, energy=10)
        pos = mod.compute_personality_position()
        assert pos['confident'] is True
        assert pos['x'] == pytest.approx(1.0)
        assert pos['y'] == pytest.approx(1.0)
        assert pos['quadrant'] == 'begleiter'
        assert pos['quadrant_label'] == 'Begleiter — aktiv · empathisch'

    def test_all_self_memories_low_energy_is_denker(self):
        """All self memories (x=0.0) + low energy (y=0.0) → bottom-left → Denker."""
        _seed_confident(self_count=6, user_count=0, energy=1)
        pos = mod.compute_personality_position()
        assert pos['confident'] is True
        assert pos['x'] == pytest.approx(0.0)
        assert pos['y'] == pytest.approx(0.0)
        assert pos['quadrant'] == 'denker'
        assert pos['quadrant_label'] == 'Denker — still · selbstreflektiert'

    def test_all_user_memories_low_energy_is_vertrauter(self):
        """All user memories (x=1.0) + low energy (y=0.0) → bottom-right → Vertrauter."""
        _seed_confident(self_count=0, user_count=6, energy=1)
        pos = mod.compute_personality_position()
        assert pos['x'] == pytest.approx(1.0)
        assert pos['y'] == pytest.approx(0.0)
        assert pos['quadrant'] == 'vertrauter'
        assert pos['quadrant_label'] == 'Vertrauter — still · empathisch'

    def test_all_self_memories_high_energy_is_forscher(self):
        """All self memories (x=0.0) + high energy (y=1.0) → top-left → Forscher."""
        _seed_confident(self_count=6, user_count=0, energy=10)
        pos = mod.compute_personality_position()
        assert pos['x'] == pytest.approx(0.0)
        assert pos['y'] == pytest.approx(1.0)
        assert pos['quadrant'] == 'forscher'
        assert pos['quadrant_label'] == 'Forscher — aktiv · selbstreflektiert'

    def test_mixed_memories(self):
        """Mix of self and user memories should give x between 0 and 1."""
        _seed_confident(self_count=3, user_count=3, energy=5)
        pos = mod.compute_personality_position()
        assert pos['confident'] is True
        assert 0.0 < pos['x'] < 1.0  # mixed
        assert pos['x'] == pytest.approx(0.5)
        assert pos['y'] == pytest.approx((5.0 - 1) / 9.0)

    def test_return_dict_has_both_quadrant_keys(self):
        """Confident result must contain both 'quadrant' and 'quadrant_label'."""
        _seed_confident(self_count=3, user_count=3, energy=8)
        pos = mod.compute_personality_position()
        assert 'quadrant' in pos
        assert 'quadrant_label' in pos

    def test_return_dict_has_drives(self):
        """Confident result must contain 'drives' that sum to ~1.0."""
        _seed_confident(self_count=3, user_count=3, energy=5)
        pos = mod.compute_personality_position()
        assert 'drives' in pos
        drives = pos['drives']
        assert 'pattern_hunger' in drives
        assert 'resonanz' in drives
        assert 'self_preservation' in drives
        assert abs(sum(drives.values()) - 1.0) < 0.01


# ── Drive Weights ─────────────────────────────────────────────────────

class TestDriveWeights:
    def test_forscher_has_highest_pattern_hunger(self):
        d = mod._compute_drive_weights(0.0, 1.0)
        assert d['pattern_hunger'] > d['resonanz']
        assert d['pattern_hunger'] > d['self_preservation']

    def test_begleiter_has_highest_resonanz(self):
        d = mod._compute_drive_weights(1.0, 1.0)
        assert d['resonanz'] > d['pattern_hunger']

    def test_denker_has_highest_self_preservation(self):
        d = mod._compute_drive_weights(0.0, 0.0)
        assert d['self_preservation'] > d['resonanz']

    def test_center_is_balanced(self):
        d = mod._compute_drive_weights(0.5, 0.5)
        assert abs(d['pattern_hunger'] - d['resonanz']) < 0.05
        assert abs(d['resonanz'] - d['self_preservation']) < 0.05

    def test_drives_sum_to_one(self):
        for x, y in [(0, 0), (0.5, 0.5), (1, 1), (0.3, 0.8), (0.9, 0.1)]:
            d = mod._compute_drive_weights(x, y)
            assert abs(sum(d.values()) - 1.0) < 0.02


# ── Personality Snapshot ────────────────────────────────────────────────

class TestPersonalitySnapshot:
    def test_save_snapshot(self):
        position = {
            'x': 0.7, 'y': 0.8,
            'quadrant': 'begleiter',
            'quadrant_label': 'Begleiter — aktiv · empathisch',
            'confident': True,
        }
        mod._save_personality_snapshot(position)
        snapshots = mod.get_memory('personality', 'trail', [])
        assert len(snapshots) == 1
        assert snapshots[0]['x'] == 0.7
        assert snapshots[0]['quadrant'] == 'begleiter'
        assert snapshots[0]['quadrant_label'] == 'Begleiter — aktiv · empathisch'

    def test_snapshot_appends(self):
        for quadrant, label in [
            ('denker', 'Denker — still · selbstreflektiert'),
            ('forscher', 'Forscher — aktiv · selbstreflektiert'),
            ('begleiter', 'Begleiter — aktiv · empathisch'),
        ]:
            pos = {
                'x': 0.5, 'y': 0.5,
                'quadrant': quadrant,
                'quadrant_label': label,
                'confident': True,
            }
            mod._save_personality_snapshot(pos)
        snapshots = mod.get_memory('personality', 'trail', [])
        assert len(snapshots) == 3

    def test_snapshot_rolling_limit(self):
        """Snapshots should not grow beyond 20."""
        for i in range(25):
            pos = {
                'x': 0.5, 'y': 0.5,
                'quadrant': 'denker',
                'quadrant_label': 'Denker — still · selbstreflektiert',
                'confident': True,
            }
            mod._save_personality_snapshot(pos)
        snapshots = mod.get_memory('personality', 'trail', [])
        assert len(snapshots) == 20


# ── Integration: persist_internal_state triggers personality ────────────

class TestPersistIntegration:
    def test_persist_with_energy_appends_log(self):
        mod.persist_internal_state({'energy': 7})
        log = mod.get_memory('personality', 'energy_log', [])
        assert len(log) == 1
        assert log[0]['energy'] == 7

    def test_persist_confident_saves_snapshot_and_tendency(self):
        # Seed enough data for confidence via memories
        _seed_confident(self_count=3, user_count=3, energy=8)
        # This persist call should trigger snapshot
        mod.persist_internal_state({'energy': 8})
        tendency = mod.get_memory('self', 'personality_tendency')
        assert tendency is not None
        snapshots = mod.get_memory('personality', 'trail', [])
        assert len(snapshots) >= 1

    def test_persist_not_confident_no_snapshot(self):
        mod.persist_internal_state({'energy': 5})
        snapshots = mod.get_memory('personality', 'trail', [])
        assert len(snapshots) == 0
