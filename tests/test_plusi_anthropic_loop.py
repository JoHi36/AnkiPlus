"""Tests for plusi/anthropic_loop.py — Anthropic Messages API agent loop.

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
# parse_mood_prefix tests
# ---------------------------------------------------------------------------

def test_parse_mood_simple():
    """~curious followed by text returns (curious, stripped text)."""
    from plusi.anthropic_loop import parse_mood_prefix
    mood, text = parse_mood_prefix("~curious\n\nHey")
    assert mood == "curious"
    assert text == "Hey"


def test_parse_mood_no_prefix():
    """Text without ~ prefix returns (neutral, original text)."""
    from plusi.anthropic_loop import parse_mood_prefix
    mood, text = parse_mood_prefix("Just text")
    assert mood == "neutral"
    assert text == "Just text"


def test_parse_mood_only():
    """~sleepy alone (no remaining text) returns (sleepy, empty string)."""
    from plusi.anthropic_loop import parse_mood_prefix
    mood, text = parse_mood_prefix("~sleepy")
    assert mood == "sleepy"
    assert text == ""


def test_parse_mood_invalid():
    """~invalidmood returns (neutral, original text unchanged)."""
    from plusi.anthropic_loop import parse_mood_prefix
    mood, text = parse_mood_prefix("~invalidmood\nHello")
    assert mood == "neutral"
    assert text == "~invalidmood\nHello"


# ---------------------------------------------------------------------------
# build_tool_definitions tests
# ---------------------------------------------------------------------------

def test_tool_definitions_format():
    """Each tool definition has required keys name, description, input_schema."""
    from plusi.anthropic_loop import build_tool_definitions
    tools = build_tool_definitions()
    assert isinstance(tools, list)
    for tool in tools:
        assert "name" in tool, f"Tool missing 'name': {tool}"
        assert "description" in tool, f"Tool missing 'description': {tool}"
        assert "input_schema" in tool, f"Tool missing 'input_schema': {tool}"
        schema = tool["input_schema"]
        assert schema.get("type") == "object", f"input_schema type must be 'object': {tool['name']}"
        assert "properties" in schema, f"input_schema missing 'properties': {tool['name']}"


def test_tool_definitions_count():
    """build_tool_definitions returns exactly 20 tools."""
    from plusi.anthropic_loop import build_tool_definitions
    tools = build_tool_definitions()
    assert len(tools) == 20, f"Expected 20 tools, got {len(tools)}"


def test_all_tool_names_unique():
    """No duplicate tool names."""
    from plusi.anthropic_loop import build_tool_definitions
    tools = build_tool_definitions()
    names = [t["name"] for t in tools]
    assert len(names) == len(set(names)), f"Duplicate tool names found: {names}"
