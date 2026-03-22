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


class TestSaveConfig:
    def test_save_creates_file(self, tmp_path, monkeypatch):
        config_path = tmp_path / "config.json"
        monkeypatch.setattr(cfg, "get_config_path", lambda: str(config_path))

        result = cfg.save_config({"model_provider": "google", "api_key": "test"})
        assert result is True
        assert config_path.exists()

        saved = json.loads(config_path.read_text())
        assert saved["api_key"] == "test"
