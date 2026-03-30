"""Tests for retrieval probability calculations."""

import sys
import os
import types
import math

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

_aqt_stub = types.ModuleType("aqt")
_aqt_stub.mw = types.SimpleNamespace()
sys.modules.setdefault("aqt", _aqt_stub)

from ui.retrieval import estimate_retention_sm2, estimate_retention_fsrs, compute_deck_mastery


class TestEstimateRetentionSm2:
    def test_new_card_returns_zero(self):
        assert estimate_retention_sm2(ivl=0, days_since_review=0, queue=0) == 0.0

    def test_learning_card_returns_half(self):
        assert estimate_retention_sm2(ivl=0, days_since_review=0, queue=1) == 0.5

    def test_day_learn_card_returns_half(self):
        assert estimate_retention_sm2(ivl=0, days_since_review=0, queue=3) == 0.5

    def test_just_reviewed_short_interval(self):
        r = estimate_retention_sm2(ivl=1, days_since_review=0, queue=2)
        assert 0.95 <= r <= 1.0

    def test_due_card_short_interval(self):
        r = estimate_retention_sm2(ivl=1, days_since_review=1, queue=2)
        assert 0.83 <= r <= 0.88

    def test_not_due_long_interval(self):
        r = estimate_retention_sm2(ivl=30, days_since_review=10, queue=2)
        assert r >= 0.92

    def test_overdue_decays(self):
        r = estimate_retention_sm2(ivl=7, days_since_review=21, queue=2)
        assert r < 0.5

    def test_long_interval_base_retention_higher(self):
        r_short = estimate_retention_sm2(ivl=1, days_since_review=1, queue=2)
        r_long = estimate_retention_sm2(ivl=30, days_since_review=30, queue=2)
        assert r_long > r_short

    def test_suspended_with_interval_uses_interval(self):
        r = estimate_retention_sm2(ivl=30, days_since_review=10, queue=-1)
        assert r >= 0.90

    def test_suspended_no_interval_returns_zero(self):
        r = estimate_retention_sm2(ivl=0, days_since_review=0, queue=-1)
        assert r == 0.0

    def test_returns_between_zero_and_one(self):
        for ivl in [0, 1, 3, 7, 14, 21, 30, 60, 180]:
            for elapsed in [0, 1, 5, 10, 30, 90]:
                for q in [-2, -1, 0, 1, 2, 3]:
                    r = estimate_retention_sm2(ivl=ivl, days_since_review=elapsed, queue=q)
                    assert 0.0 <= r <= 1.0, f"ivl={ivl}, elapsed={elapsed}, q={q} -> {r}"


class TestEstimateRetentionFsrs:
    def test_just_reviewed(self):
        r = estimate_retention_fsrs(stability=10.0, elapsed_days=0)
        assert r > 0.99

    def test_at_stability(self):
        r = estimate_retention_fsrs(stability=10.0, elapsed_days=90)
        assert abs(r - 0.5) < 0.01

    def test_half_stability(self):
        r = estimate_retention_fsrs(stability=30.0, elapsed_days=15)
        assert r > 0.9

    def test_long_overdue(self):
        r = estimate_retention_fsrs(stability=5.0, elapsed_days=100)
        assert r < 0.35

    def test_zero_stability_returns_zero(self):
        r = estimate_retention_fsrs(stability=0.0, elapsed_days=5)
        assert r == 0.0

    def test_returns_between_zero_and_one(self):
        for s in [0.1, 1, 5, 10, 30, 100]:
            for e in [0, 1, 5, 10, 30, 90, 365]:
                r = estimate_retention_fsrs(stability=s, elapsed_days=e)
                assert 0.0 <= r <= 1.0


class TestComputeDeckMastery:
    def test_empty_deck(self):
        assert compute_deck_mastery([], today_day_number=1000) == 0.0

    def test_all_new_cards(self):
        cards = [(0, 1000, 0, None)] * 100
        assert compute_deck_mastery(cards, today_day_number=1000) == 0.0

    def test_all_recently_reviewed(self):
        cards = [(1, 1001, 2, None)] * 100
        m = compute_deck_mastery(cards, today_day_number=1000)
        assert m >= 90.0

    def test_mix_of_new_and_reviewed(self):
        cards = (
            [(0, 1000, 0, None)] * 50 +
            [(10, 1010, 2, None)] * 50
        )
        m = compute_deck_mastery(cards, today_day_number=1000)
        assert 40.0 <= m <= 50.0

    def test_overdue_cards_lower_mastery(self):
        on_time = [(7, 1007, 2, None)] * 50
        overdue = [(7, 990, 2, None)] * 50
        m_on_time = compute_deck_mastery(on_time, today_day_number=1000)
        m_mixed = compute_deck_mastery(on_time + overdue, today_day_number=1000)
        assert m_mixed < m_on_time

    def test_fsrs_mode_uses_stability(self):
        import json
        data = json.dumps({"s": 30.0, "d": 5.0})
        cards = [(30, 1030, 2, data)] * 10
        m = compute_deck_mastery(cards, today_day_number=1000, fsrs_enabled=True)
        assert m >= 90.0

    def test_fsrs_fallback_on_missing_data(self):
        cards = [(10, 1010, 2, None)] * 10
        m = compute_deck_mastery(cards, today_day_number=1000, fsrs_enabled=True)
        assert m > 0

    def test_result_between_0_and_100(self):
        cards = [
            (0, 1000, 0, None),
            (1, 1001, 2, None),
            (30, 1030, 2, None),
            (0, 1000, 1, None),
            (60, 900, 2, None),
        ]
        m = compute_deck_mastery(cards, today_day_number=1000)
        assert 0.0 <= m <= 100.0
