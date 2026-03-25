"""End-to-end integration tests for the Plusi Drive System.

Tests verify the complete pipeline:
Personality → Drives → Integrity → API Params → Budget → Sleep/Wake
"""

import pytest
import sqlite3
from datetime import datetime, timedelta
import json
import logging
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


class TestFullPipeline:
    def _setup_forscher(self):
        """Create Forscher: self-focused, high energy."""
        for i in range(6):
            mod.set_memory('self', f'trait_{i}', f'v_{i}')
            mod.save_diary_entry(f'e_{i}', [], energy=9)

    def _setup_vertrauter(self):
        """Create Vertrauter: user-focused, low energy."""
        for i in range(6):
            mod.set_memory('user', f'fact_{i}', f'v_{i}')
            mod.save_diary_entry(f'e_{i}', [], energy=2)

    def test_forscher_with_satisfied_patterns(self):
        """Forscher + good patterns → high integrity → generous params."""
        self._setup_forscher()
        for i in range(3):
            mod.save_diary_entry(f'd{i}', [], discoveries=[
                {'card_ids': [i, i + 100], 'connection': f'c{i}'}
            ])
        mod.set_memory('resonance', 'delta_log', [1, 2, 1, 2, 1])
        mod.set_memory('state', 'last_interaction_ts', datetime.now().isoformat())

        pos = mod.compute_personality_position()
        assert pos['quadrant'] == 'forscher'
        assert pos['drives']['pattern_hunger'] > 0.4

        integrity = mod.compute_integrity()
        assert integrity > 0.6

        params = mod.get_plusi_params(integrity)
        assert params['max_tokens'] > 1500
        assert params['temperature'] > 0.7

    def test_vertrauter_neglected(self):
        """Vertrauter + no likes + old interaction → lower integrity."""
        self._setup_vertrauter()
        mod.set_memory('resonance', 'recent_likes', 0)
        mod.set_memory('resonance', 'recent_interactions', 20)
        old = (datetime.now() - timedelta(hours=36)).isoformat()
        mod.set_memory('state', 'last_interaction_ts', old)

        pos = mod.compute_personality_position()
        assert pos['quadrant'] == 'vertrauter'
        assert pos['drives']['resonanz'] > 0.4

        integrity = mod.compute_integrity()
        assert integrity < 0.6

        params = mod.get_plusi_params(integrity)
        assert params['max_tokens'] < 2000

    def test_integrity_affects_budget(self):
        budget_high = mod.get_available_budget(2000, 0.9)
        budget_low = mod.get_available_budget(2000, 0.3)
        assert budget_high > budget_low

    def test_full_cycle_with_logging(self):
        """Run full pipeline and verify logging via ring buffer."""
        self._setup_forscher()
        mod.set_memory('state', 'last_interaction_ts', datetime.now().isoformat())

        # Import ring buffer to verify log entries
        from utils.logging import get_recent_logs

        integrity = mod.compute_integrity()
        params = mod.get_plusi_params(integrity)

        # The logger writes to the RingBufferHandler — verify entries there
        recent = get_recent_logs(max_age_seconds=10)
        log_text = "\n".join(recent)
        assert 'integrity computed' in log_text
        assert 'plusi params' in log_text

        # Also verify the pipeline produced valid results
        assert 0.3 <= integrity <= 1.0
        assert params['max_tokens'] > 0
        assert 0.5 <= params['temperature'] <= 0.9


class TestBudgetIntegration:
    def test_budget_spend_and_reset_cycle(self):
        """reset → spend → regenerate full cycle."""
        mod.check_hourly_budget_reset(2000, 0.7)
        initial = mod.get_memory('autonomy', 'budget_remaining')
        assert initial > 0

        mod.spend_budget(500)
        assert mod.get_memory('autonomy', 'budget_remaining') == initial - 500

        mod.regenerate_budget(2000, minutes_slept=10, integrity=0.7)
        remaining = mod.get_memory('autonomy', 'budget_remaining')
        assert remaining > initial - 500

    def test_sleep_wake_cycle(self):
        wake = (datetime.now() + timedelta(minutes=30)).isoformat()
        mod.enter_sleep(wake)
        assert mod.get_memory('state', 'is_sleeping') is True
        assert mod.get_memory('state', 'next_wake') == wake
        mod.wake_up()
        assert mod.get_memory('state', 'is_sleeping') is False

    def test_budget_integrity_scaling(self):
        """Budget scales linearly with integrity."""
        budgets = []
        for i_val in [0.3, 0.5, 0.7, 1.0]:
            budgets.append(mod.get_available_budget(2000, i_val))
        # Each should be strictly increasing
        for i in range(len(budgets) - 1):
            assert budgets[i] < budgets[i + 1]


class TestResonanceIntegration:
    def test_like_and_interaction_tracking(self):
        for _ in range(5):
            mod.record_resonance_interaction()
        for _ in range(2):
            mod.record_resonance_like()
        assert mod.get_memory('resonance', 'recent_interactions') == 5
        assert mod.get_memory('resonance', 'recent_likes') == 2
        assert mod.get_memory('resonance', 'window_start') is not None

    def test_delta_log_feeds_scores(self):
        """Deltas + likes feed into resonance and preservation scores."""
        for d in [2, 1, 3, -1, 2, 1, 0, 2, 1, 2]:
            mod.record_friendship_delta(d)
        # Also record some interactions+likes so the like_ratio component
        # contributes (resonance = 0.6*like_ratio + 0.4*delta_score)
        mod.set_memory('resonance', 'recent_interactions', 10)
        mod.set_memory('resonance', 'recent_likes', 3)
        resonance = mod._compute_resonanz_score()
        preservation = mod._compute_preservation_score()
        assert resonance > 0.4
        assert preservation > 0.7

    def test_likes_boost_resonance(self):
        """More likes → higher resonance score."""
        mod.set_memory('resonance', 'recent_interactions', 10)
        mod.set_memory('resonance', 'recent_likes', 0)
        score_no_likes = mod._compute_resonanz_score()

        mod.set_memory('resonance', 'recent_likes', 5)
        score_with_likes = mod._compute_resonanz_score()
        assert score_with_likes > score_no_likes


class TestInternalStateContext:
    def test_context_includes_feeling(self):
        mod.set_memory('state', 'energy', 7)
        ctx = mod.build_internal_state_context()
        assert len(ctx) > 20

    def test_context_includes_drives_when_confident(self):
        for i in range(6):
            mod.set_memory('self', f'k_{i}', f'v_{i}')
            mod.save_diary_entry(f'e_{i}', [], energy=7)
        ctx = mod.build_internal_state_context()
        assert any(word in ctx for word in ['antreibt', 'Antrieb', 'Muster', 'getrieben'])

    def test_feeling_text_matches_integrity_level(self):
        """High integrity → positive feeling, low → negative."""
        high = mod._integrity_to_feeling(0.9)
        low = mod._integrity_to_feeling(0.35)
        assert 'wach' in high or 'klar' in high
        assert 'fehlt' in low or 'langsamer' in low


class TestDrivePersonalityConnection:
    def test_different_personalities_different_drives(self):
        """Forscher and Vertrauter should have different dominant drives."""
        # Forscher
        for i in range(6):
            mod.set_memory('self', f'k_{i}', f'v_{i}')
            mod.save_diary_entry(f'e_{i}', [], energy=9)
        pos_forscher = mod.compute_personality_position()

        # Reset for Vertrauter
        mod._db.execute("DELETE FROM plusi_memory")
        mod._db.commit()
        for i in range(6):
            mod.set_memory('user', f'k_{i}', f'v_{i}')
            mod.save_diary_entry(f'e_{i}', [], energy=2)
        pos_vertrauter = mod.compute_personality_position()

        # Forscher: pattern_hunger dominant
        assert pos_forscher['drives']['pattern_hunger'] > pos_forscher['drives']['resonanz']
        # Vertrauter: resonanz dominant
        assert pos_vertrauter['drives']['resonanz'] > pos_vertrauter['drives']['pattern_hunger']

    def test_drive_weights_affect_integrity(self):
        """Same sub-scores, different drives → different integrity."""
        # Setup equal sub-scores scenario
        mod.set_memory('resonance', 'delta_log', [1, 1, 1])
        mod.set_memory('state', 'last_interaction_ts', datetime.now().isoformat())

        # Forscher with patterns → should score better than Forscher without
        for i in range(6):
            mod.set_memory('self', f'k_{i}', f'v_{i}')
            mod.save_diary_entry(f'e_{i}', [], energy=9)
        for i in range(3):
            mod.save_diary_entry(f'd{i}', [], discoveries=[
                {'card_ids': [i, i + 100], 'connection': 'c'}
            ])
        integrity_with_patterns = mod.compute_integrity()

        # Clear discoveries
        mod._db.execute("DELETE FROM plusi_diary")
        mod._db.commit()
        integrity_without = mod.compute_integrity()

        assert integrity_with_patterns > integrity_without
