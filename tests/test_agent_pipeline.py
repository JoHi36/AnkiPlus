"""Tests for the standardized agent pipeline.

Every agent MUST:
1. Accept (situation, emit_step=None, memory=None, **kwargs)
2. Return a dict with at least a 'text' key
3. Call emit_step() if provided (optional — tested per-agent)
4. Use memory if provided (optional — tested per-agent)

NOTE: aqt/PyQt mocking is handled by run_tests.py — do NOT add manual mocks here.
"""
import sys
import os
import inspect
import pytest
from unittest.mock import patch
import sqlite3

STANDARD_PARAMS = {'situation', 'emit_step', 'memory'}


class TestAgentSignatureConformance:
    """Every agent's run function must accept the standard parameters."""

    def test_tutor_accepts_standard_params(self):
        from ai.tutor import run_tutor
        sig = inspect.signature(run_tutor)
        for param in STANDARD_PARAMS:
            assert param in sig.parameters, f"run_tutor missing param: {param}"
        assert sig.parameters['emit_step'].default is None
        assert sig.parameters['memory'].default is None

    def test_help_accepts_standard_params(self):
        from ai.help_agent import run_help
        sig = inspect.signature(run_help)
        for param in STANDARD_PARAMS:
            assert param in sig.parameters, f"run_help missing param: {param}"
        assert sig.parameters['emit_step'].default is None
        assert sig.parameters['memory'].default is None

    def test_research_accepts_standard_params(self):
        from research import run_research
        sig = inspect.signature(run_research)
        for param in STANDARD_PARAMS:
            assert param in sig.parameters, f"run_research missing param: {param}"
        assert sig.parameters['emit_step'].default is None
        assert sig.parameters['memory'].default is None

    def test_plusi_accepts_standard_params(self):
        from plusi.agent import run_plusi
        sig = inspect.signature(run_plusi)
        for param in STANDARD_PARAMS:
            assert param in sig.parameters, f"run_plusi missing param: {param}"
        assert sig.parameters['emit_step'].default is None
        assert sig.parameters['memory'].default is None

    def test_all_agents_accept_kwargs(self):
        """Every agent must accept **kwargs for forward-compat."""
        from ai.tutor import run_tutor
        from ai.help_agent import run_help
        from research import run_research
        from plusi.agent import run_plusi
        fns = {
            'tutor': run_tutor,
            'help': run_help,
            'research': run_research,
            'plusi': run_plusi,
        }
        for name, fn in fns.items():
            sig = inspect.signature(fn)
            has_var_keyword = any(
                p.kind == inspect.Parameter.VAR_KEYWORD
                for p in sig.parameters.values()
            )
            assert has_var_keyword, f"{name} run function missing **kwargs"


class TestAgentReturnContract:
    """Every agent must return a dict with 'text' key."""

    def test_tutor_returns_dict_with_text(self):
        from ai.tutor import run_tutor
        result = run_tutor(situation="test")
        assert isinstance(result, dict)
        assert 'text' in result


class TestDispatchPipeline:
    """Test the consolidated dispatch pipeline in handler.py."""

    def test_dispatch_method_exists(self):
        """_dispatch_agent should exist on AIHandler."""
        from ai.handler import AIHandler
        handler = AIHandler()
        assert hasattr(handler, '_dispatch_agent'), "_dispatch_agent method missing"

    def test_dispatch_passes_emit_step_to_agent(self):
        """Agents should receive an emit_step callback from the dispatch pipeline."""
        from ai.handler import AIHandler
        handler = AIHandler()

        received_kwargs = {}
        def fake_run(situation='', emit_step=None, memory=None, **kwargs):
            received_kwargs['emit_step'] = emit_step
            received_kwargs['memory'] = memory
            return {'text': 'test response'}

        steps = []
        handler._pipeline_signal_callback = lambda s, st, d: steps.append((s, st, d))
        handler._msg_event_callback = lambda t, d: None

        handler._dispatch_agent(
            agent_name='test',
            run_fn=fake_run,
            situation='hello',
            request_id='req-1',
        )
        assert received_kwargs['emit_step'] is not None, "emit_step not passed to agent"
        assert callable(received_kwargs['emit_step'])

    def test_dispatch_passes_agent_memory(self):
        """Agents should receive an AgentMemory instance."""
        from ai.handler import AIHandler
        from ai.agent_memory import AgentMemory
        handler = AIHandler()

        received_kwargs = {}
        def fake_run(situation='', emit_step=None, memory=None, **kwargs):
            received_kwargs['memory'] = memory
            return {'text': 'ok'}

        handler._pipeline_signal_callback = lambda s, st, d: None
        handler._msg_event_callback = lambda t, d: None

        # Mock _get_db to use in-memory SQLite (avoids aqt.mw dependency)
        test_db = sqlite3.connect(':memory:')
        with patch.object(AgentMemory, '_get_db', return_value=test_db):
            handler._dispatch_agent(
                agent_name='test',
                run_fn=fake_run,
                situation='hello',
                request_id='req-1',
            )
        assert isinstance(received_kwargs['memory'], AgentMemory)
        assert received_kwargs['memory'].agent_name == 'test'
        test_db.close()

    def test_dispatch_emits_v2_events(self):
        """Dispatch should emit orchestration -> agent_cell -> text_chunk -> msg_done."""
        from ai.handler import AIHandler
        handler = AIHandler()

        def fake_run(situation='', emit_step=None, memory=None, **kwargs):
            return {'text': 'response text'}

        events = []
        handler._pipeline_signal_callback = lambda s, st, d: None
        handler._msg_event_callback = lambda t, d: events.append(t)

        handler._dispatch_agent(
            agent_name='help',
            run_fn=fake_run,
            situation='how do I use this?',
            request_id='req-2',
        )
        assert 'orchestration' in events
        assert 'agent_cell' in events
        assert 'text_chunk' in events
        assert 'msg_done' in events

    def test_dispatch_collects_pipeline_steps_from_agent(self):
        """When agent calls emit_step, those steps should appear in pipeline."""
        from ai.handler import AIHandler
        handler = AIHandler()

        def fake_run(situation='', emit_step=None, memory=None, **kwargs):
            if emit_step:
                emit_step("custom_step", "active", {"detail": "working"})
                emit_step("custom_step", "done", {"detail": "finished"})
            return {'text': 'done'}

        steps = []
        handler._pipeline_signal_callback = lambda s, st, d: steps.append((s, st))
        handler._msg_event_callback = lambda t, d: None

        handler._dispatch_agent(
            agent_name='test',
            run_fn=fake_run,
            situation='test',
            request_id='req-3',
        )
        step_names = [s[0] for s in steps]
        assert 'custom_step' in step_names

    def test_dispatch_returns_text(self):
        """Dispatch should return the text from the agent's result."""
        from ai.handler import AIHandler
        handler = AIHandler()

        def fake_run(situation='', emit_step=None, memory=None, **kwargs):
            return {'text': 'the answer is 42'}

        handler._pipeline_signal_callback = lambda s, st, d: None
        handler._msg_event_callback = lambda t, d: None

        result = handler._dispatch_agent(
            agent_name='test',
            run_fn=fake_run,
            situation='question',
            request_id='req-4',
        )
        assert result == 'the answer is 42'

    def test_dispatch_on_finished_not_called_without_widget(self):
        """on_finished should NOT fire when widget is None."""
        from ai.handler import AIHandler
        handler = AIHandler()
        handler.widget = None

        finished_calls = []
        def on_finished(widget, agent_name, result):
            finished_calls.append((agent_name, result))

        def fake_run(situation='', emit_step=None, memory=None, **kwargs):
            return {'text': 'ok', 'mood': 'happy'}

        handler._pipeline_signal_callback = lambda s, st, d: None
        handler._msg_event_callback = lambda t, d: None

        handler._dispatch_agent(
            agent_name='plusi',
            run_fn=fake_run,
            situation='hey',
            request_id='req-5',
            on_finished=on_finished,
        )
        assert len(finished_calls) == 0


class TestAgentMemory:
    """Test AgentMemory persistent key-value storage."""

    def _make_memory(self, agent_name='test_agent', db=None):
        """Create an AgentMemory backed by a temporary in-memory DB."""
        from ai.agent_memory import AgentMemory

        if db is None:
            db = sqlite3.connect(':memory:')
        self._test_db = db

        with patch.object(AgentMemory, '_get_db', return_value=db):
            memory = AgentMemory(agent_name)
        memory._get_db = lambda: db
        return memory

    def test_set_and_get(self):
        mem = self._make_memory()
        mem.set('key1', 'value1')
        assert mem.get('key1') == 'value1'

    def test_get_default(self):
        mem = self._make_memory()
        assert mem.get('missing') is None
        assert mem.get('missing', 'fallback') == 'fallback'

    def test_set_overwrites(self):
        mem = self._make_memory()
        mem.set('k', 'old')
        mem.set('k', 'new')
        assert mem.get('k') == 'new'

    def test_delete(self):
        mem = self._make_memory()
        mem.set('k', 'v')
        mem.delete('k')
        assert mem.get('k') is None

    def test_get_all(self):
        mem = self._make_memory()
        mem.set('a', 1)
        mem.set('b', 2)
        all_data = mem.get_all()
        assert all_data == {'a': 1, 'b': 2}

    def test_clear(self):
        mem = self._make_memory()
        mem.set('a', 1)
        mem.set('b', 2)
        mem.clear()
        assert mem.get_all() == {}

    def test_isolation_between_agents(self):
        """Different agent names have independent storage."""
        db = sqlite3.connect(':memory:')
        mem_a = self._make_memory('agent_a', db=db)
        mem_b = self._make_memory('agent_b', db=db)

        mem_a.set('shared_key', 'value_a')
        mem_b.set('shared_key', 'value_b')

        assert mem_a.get('shared_key') == 'value_a'
        assert mem_b.get('shared_key') == 'value_b'

    def test_json_serialization(self):
        """Complex types (lists, dicts, nested) round-trip correctly."""
        mem = self._make_memory()
        mem.set('list', [1, 2, 3])
        mem.set('dict', {'nested': {'deep': True}})
        mem.set('bool', False)
        mem.set('null', None)

        assert mem.get('list') == [1, 2, 3]
        assert mem.get('dict') == {'nested': {'deep': True}}
        assert mem.get('bool') is False
        assert mem.get('null') is None
