"""Tests for ai/subagents.py — subagent registry."""
import pytest
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestSubagentRegistry:
    def setup_method(self):
        """Clear registry before each test."""
        from ai.subagents import SUBAGENT_REGISTRY
        SUBAGENT_REGISTRY.clear()

    def _make_agent(self, name='test', enabled_key='test_on', **kwargs):
        from ai.subagents import SubagentDefinition
        defaults = dict(
            name=name, label=name.title(), description='Test agent',
            color='#FF0000', enabled_key=enabled_key, pipeline_label=name.title(),
            run_module='json', run_function='dumps', router_hint='For testing.',
        )
        defaults.update(kwargs)
        return SubagentDefinition(**defaults)

    def test_register_and_lookup(self):
        from ai.subagents import SUBAGENT_REGISTRY, register_subagent
        agent = self._make_agent('alpha')
        register_subagent(agent)
        assert 'alpha' in SUBAGENT_REGISTRY
        assert SUBAGENT_REGISTRY['alpha'].label == 'Alpha'

    def test_get_enabled_subagents_filters(self):
        from ai.subagents import register_subagent, get_enabled_subagents
        register_subagent(self._make_agent('a', enabled_key='a_on'))
        register_subagent(self._make_agent('b', enabled_key='b_on'))
        enabled = get_enabled_subagents({'a_on': True, 'b_on': False})
        assert len(enabled) == 1
        assert enabled[0].name == 'a'

    def test_get_enabled_subagents_empty(self):
        from ai.subagents import get_enabled_subagents
        assert get_enabled_subagents({}) == []

    def test_router_prompt_includes_agent(self):
        from ai.subagents import register_subagent, get_router_subagent_prompt
        register_subagent(self._make_agent('plusi', enabled_key='mascot_enabled',
                                            router_hint='Use for casual chat.'))
        prompt = get_router_subagent_prompt({'mascot_enabled': True})
        assert 'subagent:plusi' in prompt
        assert 'Plusi' in prompt
        assert 'Use for casual chat.' in prompt

    def test_router_prompt_empty_when_disabled(self):
        from ai.subagents import register_subagent, get_router_subagent_prompt
        register_subagent(self._make_agent('plusi', enabled_key='mascot_enabled'))
        assert get_router_subagent_prompt({'mascot_enabled': False}) == ""
        assert get_router_subagent_prompt({}) == ""

    def test_lazy_load_run_fn(self):
        from ai.subagents import lazy_load_run_fn
        agent = self._make_agent(run_module='json', run_function='dumps')
        fn = lazy_load_run_fn(agent)
        import json
        assert fn is json.dumps

    def test_get_registry_for_frontend(self):
        from ai.subagents import register_subagent, get_registry_for_frontend
        register_subagent(self._make_agent('plusi', enabled_key='on', color='#A78BFA',
                                            pipeline_label='Plusi'))
        result = get_registry_for_frontend({'on': True})
        assert len(result) == 1
        assert result[0]['name'] == 'plusi'
        assert result[0]['color'] == '#A78BFA'
        assert result[0]['pipelineLabel'] == 'Plusi'
        assert result[0]['enabled'] is True

    def test_on_finished_callback_stored(self):
        from ai.subagents import register_subagent, SUBAGENT_REGISTRY
        def my_callback(widget, name, result): pass
        register_subagent(self._make_agent('x', on_finished=my_callback))
        assert SUBAGENT_REGISTRY['x'].on_finished is my_callback

    def test_router_prompt_uses_router_hint_not_description(self):
        from ai.subagents import register_subagent, get_router_subagent_prompt
        register_subagent(self._make_agent('web', enabled_key='web_on',
                                            description='Searches the internet',
                                            router_hint='Only when user explicitly asks for web search.'))
        prompt = get_router_subagent_prompt({'web_on': True})
        assert 'Only when user explicitly asks for web search' in prompt
        assert 'Searches the internet' not in prompt  # description NOT in router prompt

    def test_main_model_prompt_uses_main_model_hint(self):
        from ai.subagents import register_subagent, get_main_model_subagent_prompt
        register_subagent(self._make_agent('plusi', enabled_key='on',
                                            main_model_hint='Use spawn_plusi for personal chat.'))
        prompt = get_main_model_subagent_prompt({'on': True})
        assert 'spawn_plusi' in prompt
        assert 'Plusi' in prompt

    def test_main_model_prompt_empty_without_hint(self):
        from ai.subagents import register_subagent, get_main_model_subagent_prompt
        register_subagent(self._make_agent('x', enabled_key='on'))  # no main_model_hint
        prompt = get_main_model_subagent_prompt({'on': True})
        assert prompt == ""

    def test_subagent_definition_new_fields(self):
        from ai.subagents import SubagentDefinition
        d = SubagentDefinition(
            name='test', label='Test', description='desc', color='#FF0000',
            enabled_key='test_enabled', pipeline_label='Test',
            run_module='test', run_function='run_test', router_hint='hint'
        )
        assert d.icon_type == 'svg'
        assert d.icon_svg == ''
        assert d.loading_hint_template == ''

    def test_registry_for_frontend_includes_new_fields(self):
        from ai.subagents import SubagentDefinition, register_subagent, get_registry_for_frontend, SUBAGENT_REGISTRY
        SUBAGENT_REGISTRY.clear()
        register_subagent(SubagentDefinition(
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
