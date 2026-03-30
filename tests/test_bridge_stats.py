"""Tests for bridge_stats trajectory data — mature_pct reconstruction."""

import sys
import os
import types

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Stub aqt before importing
_aqt_stub = types.ModuleType("aqt")
_mw_stub = types.SimpleNamespace()
_aqt_stub.mw = _mw_stub
sys.modules.setdefault("aqt", _aqt_stub)

from ui.bridge_stats import _compute_daily_mature_pct


def test_compute_daily_mature_pct_basic():
    """Given review history, compute mastery per day (continuous weighting)."""
    revlog_rows = [
        (1, "2026-03-01", 25),  # 25/21 = 1.0 (capped)
        (2, "2026-03-01", 25),  # 1.0
        (3, "2026-03-01", 10),  # 10/21 = 0.476
        (4, "2026-03-01", 5),   # 5/21 = 0.238
        (5, "2026-03-01", 8),   # 8/21 = 0.381
        (6, "2026-03-01", 3),   # 3/21 = 0.143
        (7, "2026-03-02", 22),  # 1.0
        (3, "2026-03-02", 15),  # 15/21 = 0.714
        (8, "2026-03-03", 30),  # 1.0
        (5, "2026-03-03", 12),  # 12/21 = 0.571
    ]
    dates = ["2026-03-01", "2026-03-02", "2026-03-03"]
    total_cards = 10
    result = _compute_daily_mature_pct(revlog_rows, dates, total_cards)
    assert len(result) == 3
    # Day 1: (1.0+1.0+0.476+0.238+0.381+0.143)/10 = 32.4%
    assert 32.0 <= result[0] <= 33.0
    # Day 2: +card7(1.0), card3 updates to 0.714
    assert 44.0 <= result[1] <= 46.0
    # Day 3: +card8(1.0), card5 updates to 0.571
    assert 56.0 <= result[2] <= 58.0


def test_compute_daily_mature_pct_empty():
    """No reviews → all days 0%."""
    result = _compute_daily_mature_pct([], ["2026-03-01", "2026-03-02"], 100)
    assert result == [0.0, 0.0]


def test_compute_daily_mature_pct_zero_cards():
    """Zero total cards → all days 0%."""
    result = _compute_daily_mature_pct([], ["2026-03-01"], 0)
    assert result == [0.0]
