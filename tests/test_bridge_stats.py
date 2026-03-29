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
    """Given review history, compute mature_pct per day."""
    revlog_rows = [
        (1, "2026-03-01", 25),  # mature
        (2, "2026-03-01", 25),  # mature
        (3, "2026-03-01", 10),  # young
        (4, "2026-03-01", 5),   # young
        (5, "2026-03-01", 8),   # young
        (6, "2026-03-01", 3),   # young
        (7, "2026-03-02", 22),  # became mature
        (3, "2026-03-02", 15),  # still young
        (8, "2026-03-03", 30),  # became mature
        (5, "2026-03-03", 12),  # still young
    ]
    dates = ["2026-03-01", "2026-03-02", "2026-03-03"]
    total_cards = 10
    result = _compute_daily_mature_pct(revlog_rows, dates, total_cards)
    assert len(result) == 3
    assert result[0] == 40.0
    assert result[1] == 50.0
    assert result[2] == 60.0


def test_compute_daily_mature_pct_empty():
    """No reviews → all days 0%."""
    result = _compute_daily_mature_pct([], ["2026-03-01", "2026-03-02"], 100)
    assert result == [0.0, 0.0]


def test_compute_daily_mature_pct_zero_cards():
    """Zero total cards → all days 0%."""
    result = _compute_daily_mature_pct([], ["2026-03-01"], 0)
    assert result == [0.0]
