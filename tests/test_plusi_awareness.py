"""Tests for Plusi environmental awareness: card tracking, time perception, context injection."""

import pytest
import sqlite3
from datetime import datetime, timedelta
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


class TestCardReviewTracking:
    def test_record_single_review(self):
        mod.record_card_review('Pharmakologie', True)
        log = mod.get_memory('awareness', 'review_log', {})
        assert log['total'] == 1
        assert log['correct'] == 1
        assert log['wrong'] == 0
        assert 'Pharmakologie' in log['decks']

    def test_record_multiple_reviews(self):
        mod.record_card_review('Pharmakologie', True)
        mod.record_card_review('Pharmakologie', False)
        mod.record_card_review('Anatomie', True)
        log = mod.get_memory('awareness', 'review_log', {})
        assert log['total'] == 3
        assert log['correct'] == 2
        assert log['wrong'] == 1
        assert log['decks']['Pharmakologie'] == 2
        assert log['decks']['Anatomie'] == 1

    def test_tracks_first_and_last_activity(self):
        mod.record_card_review('Test', True)
        log = mod.get_memory('awareness', 'review_log', {})
        assert 'first_activity' in log
        assert 'last_activity' in log


class TestAwarenessContext:
    def test_no_reviews_returns_none(self):
        ctx = mod.build_awareness_context()
        assert ctx is None

    def test_builds_context_with_reviews(self):
        for i in range(10):
            mod.record_card_review('Biochemie', i % 3 != 0)  # ~67% correct
        ctx = mod.build_awareness_context()
        assert ctx is not None
        assert 'SEIT DU ZULETZT DA WARST' in ctx
        assert '10 Karten' in ctx
        assert 'Biochemie' in ctx

    def test_includes_accuracy(self):
        for _ in range(8):
            mod.record_card_review('Test', True)
        for _ in range(2):
            mod.record_card_review('Test', False)
        ctx = mod.build_awareness_context()
        assert '80% richtig' in ctx

    def test_includes_current_time(self):
        mod.record_card_review('Test', True)
        ctx = mod.build_awareness_context()
        current_hour = datetime.now().strftime('%H:')
        assert current_hour in ctx

    def test_includes_time_since_last_interaction(self):
        # Set last interaction 3 hours ago
        old = (datetime.now() - timedelta(hours=3)).isoformat()
        mod.set_memory('state', 'last_interaction_ts', old)
        mod.record_card_review('Test', True)
        ctx = mod.build_awareness_context()
        assert 'Stunden' in ctx or 'vergangen' in ctx

    def test_multiple_decks_shown(self):
        for _ in range(5):
            mod.record_card_review('Pharmakologie', True)
        for _ in range(3):
            mod.record_card_review('Anatomie', True)
        for _ in range(1):
            mod.record_card_review('Biochemie', True)
        ctx = mod.build_awareness_context()
        assert 'Pharmakologie' in ctx
        assert 'Anatomie' in ctx

    def test_max_three_decks(self):
        for i, deck in enumerate(['DeckAlpha', 'DeckBeta', 'DeckGamma', 'DeckDelta', 'DeckEpsilon']):
            for _ in range(5 - i):
                mod.record_card_review(deck, True)
        ctx = mod.build_awareness_context()
        # Top 3 decks shown, Delta and Epsilon should not appear
        assert 'DeckAlpha' in ctx
        assert 'DeckBeta' in ctx
        assert 'DeckGamma' in ctx
        assert 'DeckDelta' not in ctx
        assert 'DeckEpsilon' not in ctx


class TestAwarenessClear:
    def test_clear_resets_log(self):
        mod.record_card_review('Test', True)
        mod.clear_awareness_log()
        log = mod.get_memory('awareness', 'review_log', {})
        assert log.get('total', 0) == 0

    def test_context_is_none_after_clear(self):
        mod.record_card_review('Test', True)
        mod.clear_awareness_log()
        ctx = mod.build_awareness_context()
        assert ctx is None


class TestAwarenessInjection:
    def test_awareness_injected_in_internal_state(self):
        """Awareness should appear in build_internal_state_context."""
        mod.set_memory('state', 'energy', 5)
        for _ in range(5):
            mod.record_card_review('Neurologie', True)
        ctx = mod.build_internal_state_context()
        assert 'SEIT DU ZULETZT DA WARST' in ctx
        assert 'Neurologie' in ctx

    def test_awareness_cleared_after_injection(self):
        """Awareness is one-shot — cleared after injection."""
        mod.set_memory('state', 'energy', 5)
        mod.record_card_review('Test', True)
        mod.build_internal_state_context()
        # Second call should not have awareness
        ctx2 = mod.build_internal_state_context()
        assert 'SEIT DU ZULETZT DA WARST' not in ctx2

    def test_no_awareness_when_nothing_happened(self):
        mod.set_memory('state', 'energy', 5)
        ctx = mod.build_internal_state_context()
        assert 'SEIT DU ZULETZT DA WARST' not in ctx


class TestTimePerception:
    def test_recent_interaction_wording(self):
        mod.set_memory('state', 'last_interaction_ts',
                       (datetime.now() - timedelta(minutes=10)).isoformat())
        mod.record_card_review('Test', True)
        ctx = mod.build_awareness_context()
        assert 'gerade erst' in ctx

    def test_hours_ago_wording(self):
        mod.set_memory('state', 'last_interaction_ts',
                       (datetime.now() - timedelta(hours=5)).isoformat())
        mod.record_card_review('Test', True)
        ctx = mod.build_awareness_context()
        assert 'Stunden' in ctx

    def test_days_ago_wording(self):
        mod.set_memory('state', 'last_interaction_ts',
                       (datetime.now() - timedelta(days=2)).isoformat())
        mod.record_card_review('Test', True)
        ctx = mod.build_awareness_context()
        assert 'Tage' in ctx
