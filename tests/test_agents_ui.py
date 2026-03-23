"""Tests for Agent Studio UI fields on AgentDefinition and get_registry_for_frontend."""
import sys
import types

aqt_mock = types.ModuleType('aqt')
aqt_mock.mw = None
sys.modules['aqt'] = aqt_mock


def test_agent_definition_has_ui_fields():
    from ai.agents import AgentDefinition
    a = AgentDefinition(
        name='test', label='Test', description='test agent',
        widget_type='embeddings',
        submenu_label='Test konfigurieren',
        submenu_component='TestMenu',
        tools_configurable=False,
    )
    assert a.widget_type == 'embeddings'
    assert a.submenu_label == 'Test konfigurieren'
    assert a.submenu_component == 'TestMenu'
    assert a.tools_configurable is False


def test_agent_definition_ui_defaults():
    from ai.agents import AgentDefinition
    a = AgentDefinition(name='min', label='Min', description='minimal')
    assert a.widget_type == ''
    assert a.submenu_label == ''
    assert a.submenu_component == ''
    assert a.tools_configurable is True


def test_get_registry_returns_all_agents():
    from ai.agents import get_registry_for_frontend
    config = {}  # empty config — disabled agents should still appear
    result = get_registry_for_frontend(config)
    names = [a['name'] for a in result]
    assert 'tutor' in names
    # With empty config, non-default agents should have enabled=False
    for agent in result:
        assert 'enabled' in agent
        assert 'widgetType' in agent
        assert 'submenuLabel' in agent
        assert 'submenuComponent' in agent
        assert 'toolsConfigurable' in agent
    # Tutor should always be enabled (is_default)
    tutor = next(a for a in result if a['name'] == 'tutor')
    assert tutor['enabled'] is True
    # Plusi without mascot_enabled in config should be disabled
    plusi = next(a for a in result if a['name'] == 'plusi')
    assert plusi['enabled'] is False
    assert plusi['submenuLabel'] == 'Persönlichkeit & Tagebuch'


def test_submenu_label_auto_generated():
    from ai.agents import get_registry_for_frontend
    result = get_registry_for_frontend({})
    help_agent = next(a for a in result if a['name'] == 'help')
    # Help agent has explicit submenu_label='Help konfigurieren', so it returns that
    assert help_agent['submenuLabel'] == 'Help konfigurieren'


def test_tutor_has_search_image_tool():
    from ai.agents import get_agent
    tutor = get_agent('tutor')
    assert tutor is not None
    assert 'search_image' in tutor.tools


def test_all_agents_have_new_fields():
    from ai.agents import AGENT_REGISTRY
    for name, agent in AGENT_REGISTRY.items():
        assert hasattr(agent, 'widget_type'), f"{name} missing widget_type"
        assert hasattr(agent, 'submenu_label'), f"{name} missing submenu_label"
        assert hasattr(agent, 'submenu_component'), f"{name} missing submenu_component"
        assert hasattr(agent, 'tools_configurable'), f"{name} missing tools_configurable"


def test_plusi_tools_not_configurable():
    from ai.agents import get_agent
    plusi = get_agent('plusi')
    assert plusi is not None
    assert plusi.tools_configurable is False
    assert plusi.widget_type == 'budget'
    assert plusi.submenu_component == 'plusiMenu'


def test_research_submenu_component():
    from ai.agents import get_agent
    research = get_agent('research')
    assert research is not None
    assert research.submenu_component == 'researchMenu'
    assert research.submenu_label == 'Quellen konfigurieren'
    assert research.tools_configurable is True
