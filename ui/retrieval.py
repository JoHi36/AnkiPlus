"""Retrieval probability calculations for mastery metric.

Provides two estimation methods:
- FSRS (precise): uses per-card stability parameter
- SM-2 (fallback): approximates from interval + elapsed time
"""

import math

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)


def estimate_retention_sm2(ivl, days_since_review, queue):
    """Estimate retrieval probability from SM-2 card state.

    Args:
        ivl: Current interval in days (0 for new/learning cards).
        days_since_review: Days since the card was last reviewed.
        queue: Anki queue type (0=new, 1=learning, 2=review, 3=day-learn,
               -1=suspended, -2=buried).

    Returns:
        float between 0.0 and 1.0.
    """
    if queue == 0:
        return 0.0
    if queue in (1, 3):
        return 0.5
    if queue in (-1, -2) and ivl <= 0:
        return 0.0

    ivl = max(1, ivl)
    base_r = 0.85 + 0.10 * min(1.0, ivl / 30)

    if days_since_review <= ivl:
        progress = days_since_review / ivl
        return base_r + (1.0 - base_r) * (1.0 - progress)
    else:
        overdue_ratio = days_since_review / ivl
        return max(0.0, base_r * math.exp(-0.5 * (overdue_ratio - 1.0)))


def estimate_retention_fsrs(stability, elapsed_days):
    """Precise retrieval probability using FSRS formula.

    R = (1 + elapsed / (9 * S))^(-1)

    Args:
        stability: FSRS stability parameter (days until R drops to 90%).
        elapsed_days: Days since last review.

    Returns:
        float between 0.0 and 1.0.
    """
    if stability <= 0:
        return 0.0
    return (1.0 + elapsed_days / (9.0 * stability)) ** (-1.0)


def compute_deck_mastery(cards, today_day_number, fsrs_enabled=False):
    """Compute mastery score for a collection of cards.

    Args:
        cards: list of tuples (ivl, due, queue, data_json).
        today_day_number: Anki's day number for today.
        fsrs_enabled: whether the collection uses FSRS.

    Returns:
        float: mastery percentage (0-100).
    """
    if not cards:
        return 0.0

    import json

    total_r = 0.0
    count = 0

    for ivl, due, queue, data_json in cards:
        count += 1

        if fsrs_enabled and data_json and queue == 2:
            try:
                data = json.loads(data_json) if isinstance(data_json, str) else {}
                stability = data.get("s")
                if stability and stability > 0:
                    days_since = max(0, today_day_number - (due - ivl))
                    total_r += estimate_retention_fsrs(stability, days_since)
                    continue
            except (json.JSONDecodeError, TypeError, ValueError):
                pass

        if queue == 0:
            total_r += 0.0
        elif queue in (1, 3):
            total_r += 0.5
        elif ivl <= 0 and queue in (-1, -2):
            total_r += 0.0
        else:
            days_since = max(0, today_day_number - (due - max(1, ivl)))
            total_r += estimate_retention_sm2(ivl, days_since, queue)

    return round(total_r / count * 100, 1) if count > 0 else 0.0
