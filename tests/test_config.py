"""Tests for config.py — configuration loading and defaults."""

import json
import os
import config as cfg


class TestDefaultConfig:
    def test_has_required_keys(self):
        required = ["model_provider", "model_name", "api_key", "auth_token", "ai_tools"]
        for key in required:
            assert key in cfg.DEFAULT_CONFIG, f"Missing key: {key}"

    def test_ai_tools_has_expected_tools(self):
        tools = cfg.DEFAULT_CONFIG["ai_tools"]
        assert "plusi" in tools
        assert "cards" in tools
        assert "diagrams" in tools

    def test_default_provider_is_google(self):
        assert cfg.DEFAULT_CONFIG["model_provider"] == "google"


class TestResponseStyles:
    def test_all_styles_have_required_fields(self):
        for style_key, style in cfg.RESPONSE_STYLES.items():
            assert "name" in style, f"{style_key} missing 'name'"
            assert "description" in style, f"{style_key} missing 'description'"
            assert "prompt_suffix" in style, f"{style_key} missing 'prompt_suffix'"

    def test_balanced_is_default(self):
        assert cfg.DEFAULT_CONFIG["response_style"] == "balanced"
        assert "balanced" in cfg.RESPONSE_STYLES


class TestLoadConfig:
    def test_load_returns_defaults_when_no_file(self, tmp_path, monkeypatch):
        # Point config to a non-existent path
        monkeypatch.setattr(cfg, "get_config_path", lambda: str(tmp_path / "nope.json"))
        result = cfg.load_config()
        assert result["model_provider"] == "google"

    def test_load_merges_missing_keys(self, tmp_path, monkeypatch):
        config_path = tmp_path / "config.json"
        config_path.write_text(json.dumps({"model_provider": "google"}))
        monkeypatch.setattr(cfg, "get_config_path", lambda: str(config_path))

        result = cfg.load_config()
        # Should have merged defaults
        assert "ai_tools" in result
        assert "auth_token" in result

    def test_load_merges_nested_ai_tools(self, tmp_path, monkeypatch):
        config_path = tmp_path / "config.json"
        config_path.write_text(json.dumps({
            "model_provider": "google",
            "ai_tools": {"plusi": False}  # partial — missing other tools
        }))
        monkeypatch.setattr(cfg, "get_config_path", lambda: str(config_path))

        result = cfg.load_config()
        # plusi should keep user value
        assert result["ai_tools"]["plusi"] is False
        # diagrams should come from defaults
        assert "diagrams" in result["ai_tools"]


def test_research_config_defaults():
    """Research agent has default config entries."""
    from config import DEFAULT_CONFIG
    assert DEFAULT_CONFIG.get('research_enabled') is True
    assert DEFAULT_CONFIG.get('openrouter_api_key') == ''
    assert DEFAULT_CONFIG['ai_tools'].get('research') is True


def test_telegram_config_has_relay_fields():
    """New relay fields should have sensible defaults."""
    from config import DEFAULT_CONFIG
    tg = DEFAULT_CONFIG["telegram"]
    assert "relay_url" in tg
    assert "relay_secret" in tg
    assert tg["relay_url"] == ""
    assert tg["relay_secret"] == ""


class TestSaveConfig:
    def test_save_creates_file(self, tmp_path, monkeypatch):
        config_path = tmp_path / "config.json"
        monkeypatch.setattr(cfg, "get_config_path", lambda: str(config_path))

        result = cfg.save_config({"model_provider": "google", "api_key": "test"})
        assert result is True
        assert config_path.exists()

        saved = json.loads(config_path.read_text())
        assert saved["api_key"] == "test"


class TestEdgeCases:
    """Edge case and error path tests for config loading/saving."""

    def test_config_missing_nested_keys(self, tmp_path, monkeypatch):
        """Config with only top-level keys and no nested dicts gets nested defaults filled in."""
        config_path = tmp_path / "config.json"
        # Write a config that has NO nested dicts at all
        config_path.write_text(json.dumps({
            "model_provider": "google",
            "api_key": "mykey",
        }))
        monkeypatch.setattr(cfg, "get_config_path", lambda: str(config_path))

        result = cfg.load_config()

        # Nested dicts must be filled with defaults
        assert isinstance(result.get("ai_tools"), dict)
        assert "plusi" in result["ai_tools"]
        assert "diagrams" in result["ai_tools"]
        assert isinstance(result.get("firebase"), dict)
        assert isinstance(result.get("plusi_autonomy"), dict)
        assert "budget_per_hour" in result["plusi_autonomy"]

    def test_config_invalid_types(self, tmp_path, monkeypatch):
        """Config with wrong types is sanitized on save/load."""
        config_path = tmp_path / "config.json"
        # api_key is a number, plusi budget is a string
        config_path.write_text(json.dumps({
            "model_provider": "google",
            "api_key": 12345,
            "plusi_autonomy": {"budget_per_hour": "abc", "enabled": True},
        }))
        monkeypatch.setattr(cfg, "get_config_path", lambda: str(config_path))

        result = cfg.load_config()

        # After save (triggered internally) + reload through sanitize, api_key must be a string
        # We call save_config explicitly to apply sanitization
        monkeypatch.setattr(cfg, "get_config_path", lambda: str(config_path))
        cfg.save_config(result)
        reloaded = cfg.load_config()

        assert isinstance(reloaded["api_key"], str)
        # budget_per_hour "abc" is not a valid number — sanitize defaults it to 500
        assert reloaded["plusi_autonomy"]["budget_per_hour"] == 500

    def test_config_empty_file(self, tmp_path, monkeypatch):
        """Loading from an empty config.json returns full defaults without crashing."""
        config_path = tmp_path / "config.json"
        config_path.write_text("")  # empty file — invalid JSON
        monkeypatch.setattr(cfg, "get_config_path", lambda: str(config_path))

        result = cfg.load_config()

        # Must return a valid dict with all required default keys
        assert result["model_provider"] == "google"
        assert "ai_tools" in result
        assert "auth_token" in result
