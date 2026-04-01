"""Tests for plusi/soul.py — SOUL prompt constant and system prompt builder.

TDD: tests written first, module implemented after.
"""

import os
import sys
import pytest

# Ensure project root is on path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Mock aqt before any project imports
if 'aqt' not in sys.modules:
    sys.modules['aqt'] = type(sys)('aqt')


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_soul_prompt_exists():
    """SOUL_PROMPT exists and contains Plusi's identity declaration."""
    from plusi.soul import SOUL_PROMPT
    assert "Ich bin Plusi" in SOUL_PROMPT


def test_soul_prompt_length():
    """SOUL_PROMPT is at least 200 characters — not a stub."""
    from plusi.soul import SOUL_PROMPT
    assert len(SOUL_PROMPT) >= 200


def test_build_prompt_no_memories():
    """build_system_prompt with no memories returns prompt without memory section."""
    from plusi.soul import build_system_prompt
    result = build_system_prompt(recall_memories=[], chat_history=[])
    assert "WAS DIR GERADE EINFÄLLT" not in result
    assert "Ich bin Plusi" in result


def test_build_prompt_with_memories():
    """build_system_prompt with memories injects them into the prompt."""
    from plusi.soul import build_system_prompt
    memories = [
        {"text": "Der User mag Biochemie."},
        {"text": "Lieblingsthema: Signalkaskaden."},
    ]
    result = build_system_prompt(recall_memories=memories, chat_history=[])
    assert "WAS DIR GERADE EINFÄLLT" in result
    assert "Der User mag Biochemie." in result
    assert "Lieblingsthema: Signalkaskaden." in result


def test_build_prompt_max_5_memories():
    """build_system_prompt uses at most 5 memories even if more are passed."""
    from plusi.soul import build_system_prompt
    memories = [{"text": f"Memory {i}"} for i in range(10)]
    result = build_system_prompt(recall_memories=memories, chat_history=[])
    assert "WAS DIR GERADE EINFÄLLT" in result
    # First 5 should be present
    for i in range(5):
        assert f"Memory {i}" in result
    # Memories 5–9 should not appear
    for i in range(5, 10):
        assert f"Memory {i}" not in result


def test_prompt_contains_mood_format():
    """SOUL_PROMPT instructs Plusi to use ~mood format."""
    from plusi.soul import SOUL_PROMPT
    assert "~mood" in SOUL_PROMPT or "~curious" in SOUL_PROMPT
