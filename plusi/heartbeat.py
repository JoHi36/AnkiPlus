"""
plusi/heartbeat.py — Periodic Plusi check-in with L1/L2 wake logic.

A QTimer fires run_heartbeat() every HEARTBEAT_INTERVAL_MS.
Before waking Plusi, two lightweight L1 checks (0 tokens) gate the call:
  1. Active hours (08:00–23:00)
  2. Daily budget available
  3. App has been idle for at least MIN_IDLE_FOR_CHECKIN_HOURS hours

Only if all three pass does the heartbeat spend a budget slot and wake the agent.
"""

from __future__ import annotations

import datetime

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

HEARTBEAT_INTERVAL_MS = 30 * 60 * 1000  # 30 minutes
ACTIVE_HOURS_START = 8   # 08:00
ACTIVE_HOURS_END = 23    # 23:00
MIN_IDLE_FOR_CHECKIN_HOURS = 2


# ---------------------------------------------------------------------------
# L1 gate — pure Python, 0 tokens
# ---------------------------------------------------------------------------

def should_heartbeat_l2() -> tuple[bool, str]:
    """L1 gate: determine whether Plusi should wake up for a heartbeat check-in.

    Returns (should_wake, reason) where reason is a short lowercase string
    suitable for debug logs. All checks are pure Python with no AI calls.

    Check order:
      1. Active hours (08:00–23:00)
      2. Daily budget available
      3. App has been idle >= MIN_IDLE_FOR_CHECKIN_HOURS
    """
    # 1. Active hours
    current_hour = datetime.datetime.now().hour
    if current_hour < ACTIVE_HOURS_START or current_hour >= ACTIVE_HOURS_END:
        return False, "outside_hours"

    # 2. Budget
    try:
        from .budget import PlusicBudget
    except ImportError:
        from budget import PlusicBudget

    budget = PlusicBudget()
    if not budget.can_wake():
        return False, "budget_exhausted"

    # 3. Idle check
    try:
        from .event_bus import EventBus
    except ImportError:
        from event_bus import EventBus

    bus = EventBus.get()
    if bus.idle_minutes() < MIN_IDLE_FOR_CHECKIN_HOURS * 60:
        return False, "not_idle"

    return True, "idle_checkin"


# ---------------------------------------------------------------------------
# Heartbeat runner — called by QTimer
# ---------------------------------------------------------------------------

def run_heartbeat() -> None:
    """Called by QTimer every HEARTBEAT_INTERVAL_MS.

    Runs the L1 gate and, if it passes, spends a budget slot and wakes Plusi.
    """
    should_wake, reason = should_heartbeat_l2()

    if not should_wake:
        logger.debug("Heartbeat skipped: %s", reason)
        return

    logger.info("Heartbeat firing: %s — waking Plusi", reason)

    # Spend budget before waking to avoid double-spend on re-entry
    try:
        from .budget import PlusicBudget
    except ImportError:
        from budget import PlusicBudget

    PlusicBudget().spend()

    # Wake the agent
    try:
        from .agent import wake_plusi
        wake_plusi(
            prompt="Heartbeat. Schau ob es einen Grund gibt aktiv zu werden.",
            source="heartbeat",
        )
    except Exception as e:
        logger.error("heartbeat wake failed: %s", e)
