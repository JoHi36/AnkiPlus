"""Tests for ToolDefinition UI fields and ToolRegistry.get_tools_for_frontend()."""

import sys
import types

# Mock aqt before any addon imports
aqt_mock = types.ModuleType('aqt')
aqt_mock.mw = None
sys.modules['aqt'] = aqt_mock


def test_tool_definition_has_ui_fields():
    from ai.tools import ToolDefinition
    t = ToolDefinition(
        name='test_tool',
        schema={'name': 'test_tool', 'description': 'test'},
        execute_fn=lambda **kw: {},
        label='Test Tool', ui_description='A test tool',
        category='learning', default_enabled=True, configurable=False,
    )
    assert t.label == 'Test Tool'
    assert t.ui_description == 'A test tool'
    assert t.category == 'learning'
    assert t.configurable is False


def test_tool_definition_ui_defaults():
    from ai.tools import ToolDefinition
    t = ToolDefinition(
        name='minimal',
        schema={'name': 'minimal', 'description': 'min'},
        execute_fn=lambda **kw: {},
    )
    assert t.label == ''
    assert t.ui_description == ''
    assert t.category == ''
    assert t.default_enabled is True
    assert t.configurable is True


def test_get_tools_for_frontend_known_tool():
    from ai.tools import registry
    config = {'ai_tools': {'cards': True}}
    result = registry.get_tools_for_frontend(['search_deck'], config)
    assert len(result) == 1
    tool = result[0]
    assert tool['name'] == 'search_deck'
    assert tool['label'] == 'Kartensuche'
    assert tool['description'] == 'Karten aus dem Deck suchen'
    assert tool['category'] == 'learning'
    assert tool['configKey'] == 'cards'
    assert tool['enabled'] is True
    assert tool['configurable'] is True


def test_get_tools_for_frontend_disabled_via_config():
    from ai.tools import registry
    config = {'ai_tools': {'cards': False}}
    result = registry.get_tools_for_frontend(['search_deck'], config)
    assert result[0]['enabled'] is False


def test_get_tools_for_frontend_unknown_tool():
    from ai.tools import registry
    result = registry.get_tools_for_frontend(['nonexistent_tool'], {})
    assert len(result) == 1
    tool = result[0]
    assert tool['name'] == 'nonexistent_tool'
    assert tool['label'] == 'Nonexistent Tool'
    assert tool['configurable'] is False
    assert tool['enabled'] is True


def test_get_tools_for_frontend_spawn_plusi_not_configurable():
    from ai.tools import registry
    result = registry.get_tools_for_frontend(['spawn_plusi'], {})
    assert result[0]['configurable'] is False
    assert result[0]['label'] == 'Plusi rufen'
    assert result[0]['category'] == 'meta'


def test_get_tools_for_frontend_multiple_tools():
    from ai.tools import registry
    names = ['search_deck', 'get_learning_stats', 'create_mermaid_diagram']
    result = registry.get_tools_for_frontend(names, {})
    assert len(result) == 3
    result_by_name = {t['name']: t for t in result}
    assert result_by_name['search_deck']['label'] == 'Kartensuche'
    assert result_by_name['get_learning_stats']['label'] == 'Statistiken'
    assert result_by_name['create_mermaid_diagram']['label'] == 'Diagramme'


def test_label_fallback_auto_generated():
    from ai.tools import ToolDefinition, ToolRegistry
    reg = ToolRegistry()
    reg.register(ToolDefinition(
        name='some_cool_tool',
        schema={'name': 'some_cool_tool', 'description': 'x'},
        execute_fn=lambda **kw: {},
        label='',  # empty label → auto-generate
    ))
    result = reg.get_tools_for_frontend(['some_cool_tool'], {})
    assert result[0]['label'] == 'Some Cool Tool'
