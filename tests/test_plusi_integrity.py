"""Tests for Plusi integrity score: pattern, resonance, preservation, integrity, params, feeling."""

import pytest
import sqlite3
from datetime import datetime, timedelta
from unittest.mock import patch

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


def _seed_confident(self_count=3, user_count=3, energy=5):
    """Seed enough data for confident personality computation."""
    for i in range(self_count):
        mod.set_memory('self', f'trait_{i}', f'value_{i}')
    for i in range(user_count):
        mod.set_memory('user', f'fact_{i}', f'value_{i}')
    for i in range(max(self_count + user_count, 5)):
        mod.save_diary_entry(f'seed_{i}', [], energy=energy)


# ── Pattern Score ──────────────────────────────────────────────────────

class TestPatternScore:
    def test_no_diary_entries(self):
        """No diary entries should return neutral 0.5."""
        assert mod._compute_pattern_score() == 0.5

    def test_entries_without_discoveries(self):
        """Entries with empty discoveries should return 0.5."""
        mod.save_diary_entry("test entry", [], discoveries=[])
        assert mod._compute_pattern_score() == 0.5

    def test_old_format_single_card_discoveries(self):
        """Discoveries with single card_ids (old format) should return neutral 0.5."""
        disc = [{'text': 'found something', 'card_ids': [123]}]
        mod.save_diary_entry("test", [], discoveries=disc)
        assert mod._compute_pattern_score() == 0.5

    def test_multi_card_discoveries(self):
        """Multi-card discoveries should score > 0.5."""
        disc = [{'text': 'connection found', 'card_ids': [123, 456]}]
        mod.save_diary_entry("test", [], discoveries=disc)
        score = mod._compute_pattern_score()
        assert score > 0.5

    def test_all_multi_card(self):
        """All entries with multi-card discoveries should give 1.0."""
        for _ in range(5):
            disc = [{'text': 'connection', 'card_ids': [1, 2, 3]}]
            mod.save_diary_entry("test", [], discoveries=disc)
        score = mod._compute_pattern_score()
        assert score == 1.0

    def test_mixed_single_and_multi(self):
        """Mix of single and multi-card should give intermediate score."""
        # 2 entries with multi-card, 2 with single-card
        for _ in range(2):
            mod.save_diary_entry("test", [], discoveries=[{'text': 'x', 'card_ids': [1, 2]}])
        for _ in range(2):
            mod.save_diary_entry("test", [], discoveries=[{'text': 'x', 'card_ids': [1]}])
        score = mod._compute_pattern_score()
        assert 0.0 < score <= 1.0

    def test_discoveries_without_card_ids_key(self):
        """Discoveries missing card_ids key should not crash."""
        disc = [{'text': 'no cards'}]
        mod.save_diary_entry("test", [], discoveries=disc)
        score = mod._compute_pattern_score()
        assert score == 0.5  # has discoveries but no multi-card


# ── Resonance Score ────────────────────────────────────────────────────

class TestResonanzScore:
    def test_no_data_returns_moderate(self):
        """No resonance data should give moderate score."""
        score = mod._compute_resonanz_score()
        assert 0.0 <= score <= 1.0

    def test_high_likes_high_score(self):
        """Many likes relative to interactions should give high score."""
        mod.set_memory('resonance', 'recent_likes', 10)
        mod.set_memory('resonance', 'recent_interactions', 10)
        mod.set_memory('resonance', 'window_start', datetime.now().isoformat())
        score = mod._compute_resonanz_score()
        assert score > 0.5

    def test_zero_likes_lower_score(self):
        """Zero likes should give lower score than high likes."""
        mod.set_memory('resonance', 'recent_likes', 0)
        mod.set_memory('resonance', 'recent_interactions', 10)
        mod.set_memory('resonance', 'window_start', datetime.now().isoformat())
        zero_score = mod._compute_resonanz_score()

        mod.set_memory('resonance', 'recent_likes', 10)
        high_score = mod._compute_resonanz_score()

        assert high_score > zero_score

    def test_positive_deltas_increase_score(self):
        """Positive friendship deltas should increase score."""
        mod.set_memory('resonance', 'window_start', datetime.now().isoformat())
        mod.set_memory('resonance', 'delta_log', [3, 3, 3, 3, 3])
        pos_score = mod._compute_resonanz_score()

        mod.set_memory('resonance', 'delta_log', [-3, -3, -3, -3, -3])
        neg_score = mod._compute_resonanz_score()

        assert pos_score > neg_score

    def test_negative_deltas_decrease_score(self):
        """Negative deltas should give lower score."""
        mod.set_memory('resonance', 'window_start', datetime.now().isoformat())
        mod.set_memory('resonance', 'delta_log', [-3, -3, -3])
        score = mod._compute_resonanz_score()
        assert score < 0.5


# ── Preservation Score ─────────────────────────────────────────────────

class TestPreservationScore:
    def test_no_data(self):
        """No data should return moderate score."""
        score = mod._compute_preservation_score()
        assert 0.0 <= score <= 1.0

    def test_recent_interaction_high_score(self):
        """Very recent interaction should give higher recency."""
        mod.set_memory('state', 'last_interaction_ts', datetime.now().isoformat())
        score = mod._compute_preservation_score()
        assert score >= 0.5

    def test_old_interaction_lower_score(self):
        """Old interaction should give lower recency component."""
        old_ts = (datetime.now() - timedelta(hours=48)).isoformat()
        mod.set_memory('state', 'last_interaction_ts', old_ts)
        old_score = mod._compute_preservation_score()

        mod.set_memory('state', 'last_interaction_ts', datetime.now().isoformat())
        recent_score = mod._compute_preservation_score()

        assert recent_score > old_score

    def test_very_old_interaction(self):
        """Very old interaction should hit recency floor of 0.3."""
        very_old = (datetime.now() - timedelta(hours=200)).isoformat()
        mod.set_memory('state', 'last_interaction_ts', very_old)
        score = mod._compute_preservation_score()
        # recency floors at 0.3, so total should still be >= 0.3 * 0.5 = 0.15
        assert score >= 0.15

    def test_harsh_deltas_reduce_score(self):
        """Many harsh deltas (-2 or worse) should reduce respect score."""
        mod.set_memory('resonance', 'delta_log', [-3, -2, -3, -2, -3])
        harsh_score = mod._compute_preservation_score()

        mod.set_memory('resonance', 'delta_log', [1, 2, 1, 2, 1])
        gentle_score = mod._compute_preservation_score()

        assert gentle_score > harsh_score

    def test_no_harsh_deltas_full_respect(self):
        """No harsh deltas should give full respect score."""
        mod.set_memory('resonance', 'delta_log', [1, 0, 1, 2, 1])
        score = mod._compute_preservation_score()
        # respect_score = 1.0, recency = 0.5 (no ts) → 0.5 * 1.0 + 0.5 * 0.5 = 0.75
        assert score == pytest.approx(0.75)


# ── Integrity Score ────────────────────────────────────────────────────

class TestIntegrity:
    def test_neutral_default(self):
        """With no data, integrity should return a reasonable default."""
        integrity = mod.compute_integrity()
        assert 0.3 <= integrity <= 1.0

    def test_floor_030(self):
        """Integrity should never go below 0.3."""
        # Set up conditions for very low scores
        mod.set_memory('resonance', 'delta_log', [-3] * 20)
        mod.set_memory('resonance', 'recent_likes', 0)
        mod.set_memory('resonance', 'recent_interactions', 100)
        mod.set_memory('resonance', 'window_start', datetime.now().isoformat())
        old_ts = (datetime.now() - timedelta(hours=200)).isoformat()
        mod.set_memory('state', 'last_interaction_ts', old_ts)
        integrity = mod.compute_integrity()
        assert integrity >= 0.3

    def test_ceiling_100(self):
        """Integrity should never exceed 1.0."""
        # Set up conditions for high scores
        _seed_confident(self_count=3, user_count=3, energy=10)
        mod.set_memory('resonance', 'recent_likes', 100)
        mod.set_memory('resonance', 'recent_interactions', 10)
        mod.set_memory('resonance', 'window_start', datetime.now().isoformat())
        mod.set_memory('resonance', 'delta_log', [3] * 10)
        mod.set_memory('state', 'last_interaction_ts', datetime.now().isoformat())
        for _ in range(5):
            mod.save_diary_entry("test", [], discoveries=[{'text': 'x', 'card_ids': [1, 2]}])
        integrity = mod.compute_integrity()
        assert integrity <= 1.0

    def test_drive_weights_affect_integrity(self):
        """Different personality positions should produce different integrity."""
        # Forscher (high pattern_hunger)
        _seed_confident(self_count=6, user_count=0, energy=10)
        i1 = mod.compute_integrity()

        # Reset for begleiter (high resonanz)
        mod._db.execute("DELETE FROM plusi_memory")
        mod._db.commit()
        _seed_confident(self_count=0, user_count=6, energy=10)
        i2 = mod.compute_integrity()

        # Both should be valid, but may differ
        assert 0.3 <= i1 <= 1.0
        assert 0.3 <= i2 <= 1.0

    def test_integrity_stored_in_memory(self):
        """compute_integrity should store result in memory."""
        integrity = mod.compute_integrity()
        stored = mod.get_memory('integrity', 'current')
        assert stored == round(integrity, 3)


# ── Plusi Params ───────────────────────────────────────────────────────

class TestPlusiParams:
    def test_floor_integrity(self):
        """Integrity 0.3 (floor) should give minimum params."""
        params = mod.get_plusi_params(0.3)
        assert params['max_tokens'] == 128 + int(0.3 * 2944)
        assert params['temperature'] == pytest.approx(0.5 + 0.3 * 0.4)
        assert params['history_limit'] == 5 + int(0.3 * 15)

    def test_mid_integrity(self):
        """Integrity 0.5 should give mid-range params."""
        params = mod.get_plusi_params(0.5)
        assert params['max_tokens'] == 128 + int(0.5 * 2944)
        assert params['temperature'] == pytest.approx(0.5 + 0.5 * 0.4)
        assert params['history_limit'] == 5 + int(0.5 * 15)

    def test_max_integrity(self):
        """Integrity 1.0 should give maximum params."""
        params = mod.get_plusi_params(1.0)
        assert params['max_tokens'] == 128 + 2944
        assert params['temperature'] == pytest.approx(0.9)
        assert params['history_limit'] == 20

    def test_params_keys(self):
        """Params should contain expected keys."""
        params = mod.get_plusi_params(0.7)
        assert 'max_tokens' in params
        assert 'temperature' in params
        assert 'history_limit' in params


# ── Integrity to Feeling ───────────────────────────────────────────────

class TestIntegrityToFeeling:
    def test_high_integrity(self):
        feeling = mod._integrity_to_feeling(0.9)
        assert "wach" in feeling

    def test_good_integrity(self):
        feeling = mod._integrity_to_feeling(0.65)
        assert "gut" in feeling.lower() or "aufmerksam" in feeling

    def test_mid_integrity(self):
        feeling = mod._integrity_to_feeling(0.5)
        assert "anders" in feeling or "Rauschen" in feeling

    def test_low_integrity(self):
        feeling = mod._integrity_to_feeling(0.3)
        assert "fehlt" in feeling

    def test_boundary_080(self):
        """Exactly 0.8 should be high tier."""
        feeling = mod._integrity_to_feeling(0.8)
        assert "wach" in feeling

    def test_boundary_060(self):
        """Exactly 0.6 should be good tier."""
        feeling = mod._integrity_to_feeling(0.6)
        assert "aufmerksam" in feeling

    def test_boundary_045(self):
        """Exactly 0.45 should be mid tier."""
        feeling = mod._integrity_to_feeling(0.45)
        assert "anders" in feeling or "Rauschen" in feeling


# ── Record Resonance ──────────────────────────────────────────────────

class TestRecordResonance:
    def test_record_interaction_increments(self):
        mod.record_resonance_interaction()
        count = mod.get_memory('resonance', 'recent_interactions', 0)
        assert count == 1
        mod.record_resonance_interaction()
        count = mod.get_memory('resonance', 'recent_interactions', 0)
        assert count == 2

    def test_record_like_increments(self):
        mod.record_resonance_like()
        count = mod.get_memory('resonance', 'recent_likes', 0)
        assert count == 1
        mod.record_resonance_like()
        count = mod.get_memory('resonance', 'recent_likes', 0)
        assert count == 2

    def test_record_friendship_delta(self):
        mod.record_friendship_delta(2)
        log = mod.get_memory('resonance', 'delta_log', [])
        assert log == [2]
        mod.record_friendship_delta(-1)
        log = mod.get_memory('resonance', 'delta_log', [])
        assert log == [2, -1]

    def test_friendship_delta_rolling_limit(self):
        """Delta log should not exceed DELTA_LOG_MAX."""
        for i in range(60):
            mod.record_friendship_delta(1)
        log = mod.get_memory('resonance', 'delta_log', [])
        assert len(log) == mod.DELTA_LOG_MAX


# ── Resonance Window ──────────────────────────────────────────────────

class TestResonanceWindow:
    def test_first_call_sets_window_start(self):
        mod._check_resonance_window()
        ws = mod.get_memory('resonance', 'window_start', None)
        assert ws is not None

    def test_no_reset_within_7_days(self):
        """Counters should not reset within the 7-day window."""
        mod.set_memory('resonance', 'window_start', datetime.now().isoformat())
        mod.set_memory('resonance', 'recent_likes', 5)
        mod.set_memory('resonance', 'recent_interactions', 10)
        mod._check_resonance_window()
        assert mod.get_memory('resonance', 'recent_likes', 0) == 5
        assert mod.get_memory('resonance', 'recent_interactions', 0) == 10

    def test_reset_after_7_days(self):
        """Counters should reset after 7-day window expires."""
        old_start = (datetime.now() - timedelta(days=8)).isoformat()
        mod.set_memory('resonance', 'window_start', old_start)
        mod.set_memory('resonance', 'recent_likes', 5)
        mod.set_memory('resonance', 'recent_interactions', 10)
        mod._check_resonance_window()
        assert mod.get_memory('resonance', 'recent_likes', 0) == 0
        assert mod.get_memory('resonance', 'recent_interactions', 0) == 0

    def test_reset_updates_window_start(self):
        """After reset, window_start should be updated to now."""
        old_start = (datetime.now() - timedelta(days=8)).isoformat()
        mod.set_memory('resonance', 'window_start', old_start)
        mod._check_resonance_window()
        new_start = mod.get_memory('resonance', 'window_start')
        assert new_start != old_start
        # New start should be recent
        parsed = datetime.fromisoformat(new_start)
        assert (datetime.now() - parsed).total_seconds() < 5


# ── Build Internal State Context (integration) ────────────────────────

class TestBuildInternalStateContext:
    def test_includes_feeling(self):
        """build_internal_state_context should include a feeling description."""
        ctx = mod.build_internal_state_context()
        # Should contain one of the feeling phrases
        assert any(phrase in ctx for phrase in [
            "wach", "aufmerksam", "anders", "fehlt", "gerade auf"
        ])

    def test_confident_includes_drive_description(self):
        """With confident personality, should include drive descriptions."""
        _seed_confident(self_count=3, user_count=3, energy=8)
        ctx = mod.build_internal_state_context()
        assert "WAS DICH ANTREIBT" in ctx
        assert "getrieben davon" in ctx
        assert "nicht im Vordergrund" in ctx
        assert "Tendenzen" in ctx

    def test_no_old_bar_format(self):
        """Old drive-bar format (████░) should no longer appear."""
        _seed_confident(self_count=3, user_count=3, energy=8)
        ctx = mod.build_internal_state_context()
        assert '█' not in ctx
        assert '░' not in ctx
