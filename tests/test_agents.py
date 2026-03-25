"""Tests for ai/agents.py — agent registry."""
import pytest
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestAgentRegistry:
    def setup_method(self):
        """Clear registry before each test, saving a snapshot for restore."""
        from ai.agents import AGENT_REGISTRY
        self._saved_registry = dict(AGENT_REGISTRY)
        AGENT_REGISTRY.clear()

    def teardown_method(self):
        """Restore registry to its pre-test state so downstream tests see the full registry."""
        from ai.agents import AGENT_REGISTRY
        AGENT_REGISTRY.clear()
        AGENT_REGISTRY.update(self._saved_registry)

    def _make_agent(self, name='test', enabled_key='test_on', **kwargs):
        from ai.agents import AgentDefinition
        defaults = dict(
            name=name, label=name.title(), description='Test agent',
            color='#FF0000', enabled_key=enabled_key, pipeline_label=name.title(),
            run_module='json', run_function='dumps', router_hint='For testing.',
        )
        defaults.update(kwargs)
        return AgentDefinition(**defaults)

    def test_register_and_lookup(self):
        from ai.agents import AGENT_REGISTRY, register_agent
        agent = self._make_agent('alpha')
        register_agent(agent)
        assert 'alpha' in AGENT_REGISTRY
        assert AGENT_REGISTRY['alpha'].label == 'Alpha'

    def test_get_non_default_agents_filters(self):
        from ai.agents import register_agent, get_non_default_agents
        register_agent(self._make_agent('a', enabled_key='a_on'))
        register_agent(self._make_agent('b', enabled_key='b_on'))
        enabled = get_non_default_agents({'a_on': True, 'b_on': False})
        assert len(enabled) == 1
        assert enabled[0].name == 'a'

    def test_get_non_default_agents_empty(self):
        from ai.agents import get_non_default_agents
        assert get_non_default_agents({}) == []

    def test_router_prompt_includes_agent(self):
        from ai.agents import register_agent, get_router_subagent_prompt
        register_agent(self._make_agent('plusi', enabled_key='mascot_enabled',
                                            router_hint='Use for casual chat.'))
        prompt = get_router_subagent_prompt({'mascot_enabled': True})
        assert 'subagent:plusi' in prompt
        assert 'Plusi' in prompt
        assert 'Use for casual chat.' in prompt

    def test_router_prompt_empty_when_disabled(self):
        from ai.agents import register_agent, get_router_subagent_prompt
        register_agent(self._make_agent('plusi', enabled_key='mascot_enabled'))
        assert get_router_subagent_prompt({'mascot_enabled': False}) == ""
        assert get_router_subagent_prompt({}) == ""

    def test_lazy_load_run_fn(self):
        from ai.agents import lazy_load_run_fn
        agent = self._make_agent(run_module='json', run_function='dumps')
        fn = lazy_load_run_fn(agent)
        import json
        assert fn is json.dumps

    def test_get_registry_for_frontend(self):
        from ai.agents import register_agent, get_registry_for_frontend
        register_agent(self._make_agent('plusi', enabled_key='on', color='#A78BFA',
                                            pipeline_label='Plusi'))
        result = get_registry_for_frontend({'on': True})
        assert len(result) == 1
        assert result[0]['name'] == 'plusi'
        assert result[0]['color'] == '#A78BFA'
        assert result[0]['pipelineLabel'] == 'Plusi'
        assert result[0]['enabled'] is True

    def test_on_finished_callback_stored(self):
        from ai.agents import register_agent, AGENT_REGISTRY
        def my_callback(widget, name, result): pass
        register_agent(self._make_agent('x', on_finished=my_callback))
        assert AGENT_REGISTRY['x'].on_finished is my_callback

    def test_router_prompt_uses_router_hint_not_description(self):
        from ai.agents import register_agent, get_router_subagent_prompt
        register_agent(self._make_agent('web', enabled_key='web_on',
                                            description='Searches the internet',
                                            router_hint='Only when user explicitly asks for web search.'))
        prompt = get_router_subagent_prompt({'web_on': True})
        assert 'Only when user explicitly asks for web search' in prompt
        assert 'Searches the internet' not in prompt  # description NOT in router prompt

    def test_main_model_prompt_uses_main_model_hint(self):
        from ai.agents import register_agent, get_main_model_subagent_prompt
        register_agent(self._make_agent('plusi', enabled_key='on',
                                            main_model_hint='Use spawn_plusi for personal chat.'))
        prompt = get_main_model_subagent_prompt({'on': True})
        assert 'spawn_plusi' in prompt
        assert 'Plusi' in prompt

    def test_main_model_prompt_empty_without_hint(self):
        from ai.agents import register_agent, get_main_model_subagent_prompt
        register_agent(self._make_agent('x', enabled_key='on'))  # no main_model_hint
        prompt = get_main_model_subagent_prompt({'on': True})
        assert prompt == ""

    def test_agent_definition_new_fields(self):
        from ai.agents import AgentDefinition
        d = AgentDefinition(
            name='test', label='Test', description='desc', color='#FF0000',
            enabled_key='test_enabled', pipeline_label='Test',
            run_module='test', run_function='run_test', router_hint='hint'
        )
        assert d.icon_type == 'svg'
        assert d.icon_svg == ''
        assert d.loading_hint_template == '{label} arbeitet...'

    def test_registry_for_frontend_includes_new_fields(self):
        from ai.agents import AgentDefinition, register_agent, get_registry_for_frontend, AGENT_REGISTRY
        AGENT_REGISTRY.clear()
        register_agent(AgentDefinition(
            name='test', label='Test Agent', description='d', color='#00FF00',
            enabled_key='test_on', pipeline_label='Test',
            run_module='test', run_function='run', router_hint='h',
            icon_type='svg', icon_svg='<svg>radar</svg>',
            loading_hint_template='Searching {query}...'
        ))
        result = get_registry_for_frontend({'test_on': True})
        assert len(result) == 1
        assert result[0]['iconType'] == 'svg'
        assert result[0]['iconSvg'] == '<svg>radar</svg>'
        assert result[0]['loadingHintTemplate'] == 'Searching {query}...'
