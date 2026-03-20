"""Tests for ai/system_prompt.py — prompt construction."""

from ai.system_prompt import get_system_prompt, SYSTEM_PROMPT


class TestGetSystemPrompt:
    def test_returns_base_prompt_without_insights(self):
        result = get_system_prompt()
        assert result == SYSTEM_PROMPT

    def test_base_prompt_contains_key_instructions(self):
        prompt = get_system_prompt()
        assert "Lern-Assistent" in prompt
        assert "Anki" in prompt

    def test_appends_insights_when_provided(self):
        insights = {
            "insights": [
                {"type": "strength", "text": "Gut in Anatomie"},
                {"type": "weakness", "text": "Schwach bei Pharmakologie"},
            ]
        }
        result = get_system_prompt(insights=insights)
        assert "Gut in Anatomie" in result
        assert "Schwach bei Pharmakologie" in result
        assert "BISHERIGE ERKENNTNISSE" in result

    def test_weakness_marked_with_exclamation(self):
        insights = {
            "insights": [
                {"type": "weakness", "text": "Schwachstelle"},
            ]
        }
        result = get_system_prompt(insights=insights)
        assert "[!] Schwachstelle" in result

    def test_strength_not_marked(self):
        insights = {
            "insights": [
                {"type": "strength", "text": "Stärke"},
            ]
        }
        result = get_system_prompt(insights=insights)
        assert "- Stärke" in result
        # Strength items should NOT have the [!] prefix
        assert "[!] Stärke" not in result

    def test_empty_insights_list_ignored(self):
        result = get_system_prompt(insights={"insights": []})
        assert result == SYSTEM_PROMPT

    def test_none_insights_ignored(self):
        result = get_system_prompt(insights=None)
        assert result == SYSTEM_PROMPT

    def test_legacy_params_accepted(self):
        # mode and tools are legacy but should not crash
        result = get_system_prompt(mode="detailed", tools=["something"])
        assert isinstance(result, str)
