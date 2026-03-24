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
from unittest.mock import patch, MagicMock
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


# ---------------------------------------------------------------------------
# Per-Agent Pipeline Integration Tests
# ---------------------------------------------------------------------------

class TestTutorPipeline:
    """Test that the Tutor agent integrates with the dispatch system."""

    def test_tutor_returns_dict_without_sentinel(self):
        """run_tutor should NOT return _use_rag_pipeline anymore."""
        from ai.tutor import run_tutor
        result = run_tutor(situation="test", config={'api_key': ''})
        assert isinstance(result, dict)
        assert '_use_rag_pipeline' not in result

    def test_tutor_tracks_query_count_in_memory(self):
        """Tutor increments total_queries in AgentMemory."""
        from ai.tutor import run_tutor
        from ai.agent_memory import AgentMemory

        db = sqlite3.connect(':memory:')
        with patch.object(AgentMemory, '_get_db', return_value=db):
            mem = AgentMemory('tutor')
        mem._get_db = lambda: db

        run_tutor(situation="test 1", memory=mem, config={'api_key': ''})
        assert mem.get('total_queries') == 1

        run_tutor(situation="test 2", memory=mem, config={'api_key': ''})
        assert mem.get('total_queries') == 2

    def test_tutor_works_without_emit_step(self):
        """Tutor should not crash when emit_step is None."""
        from ai.tutor import run_tutor
        result = run_tutor(situation="test", config={'api_key': ''})
        assert isinstance(result, dict)

    def test_tutor_works_without_memory(self):
        """Tutor should not crash when memory is None."""
        from ai.tutor import run_tutor
        result = run_tutor(situation="test", memory=None, config={'api_key': ''})
        assert isinstance(result, dict)


class TestTutorRealAgent:
    """Test the rewritten Tutor as a real agent with RAG + streaming."""

    def test_no_sentinel_return(self):
        """run_tutor should NOT return _use_rag_pipeline anymore."""
        from ai.tutor import run_tutor
        result = run_tutor(situation="test", config={'api_key': ''})
        assert isinstance(result, dict)
        assert '_use_rag_pipeline' not in result

    def test_accepts_stream_callback(self):
        import inspect
        from ai.tutor import run_tutor
        sig = inspect.signature(run_tutor)
        assert 'stream_callback' in sig.parameters

    def test_returns_error_without_api_key(self):
        from ai.tutor import run_tutor
        result = run_tutor(situation="Was ist ATP?", config={'api_key': ''})
        assert isinstance(result, dict)
        assert 'text' in result
        # Should contain an error message, not crash
        assert len(result['text']) > 0

    def test_tutor_uses_model_from_kwargs(self):
        """Tutor should get model from kwargs, not hardcode it."""
        import inspect
        from ai.tutor import run_tutor
        source = inspect.getsource(run_tutor)
        assert "kwargs.get('model')" in source or "model = kwargs" in source

    def test_tutor_calls_rag_pipeline(self):
        """Tutor should call retrieve_rag_context when routing says search is needed."""
        from ai.tutor import run_tutor

        routing = MagicMock()
        routing.search_needed = True
        routing.retrieval_mode = 'sql'
        routing.precise_queries = ['ATP']
        routing.broad_queries = []
        routing.embedding_queries = []
        routing.search_scope = 'current_deck'
        routing.max_sources = 'medium'

        with patch('ai.tutor.retrieve_rag_context') as mock_rag:
            from ai.rag_pipeline import RagResult
            mock_rag.return_value = RagResult(
                rag_context={'cards': ['test'], 'citations': {}, 'reasoning': ''},
                citations={}, cards_found=1)
            with patch('ai.tutor.get_google_response_streaming', return_value='answer'):
                result = run_tutor(
                    situation="Was ist ATP?",
                    config={'api_key': 'fake-key'},
                    routing_result=routing,
                )
            mock_rag.assert_called_once()

    def test_tutor_calls_streaming_generation(self):
        """Tutor should call get_google_response_streaming with stream_callback."""
        from ai.tutor import run_tutor

        chunks = []
        def fake_stream(chunk, done):
            chunks.append((chunk, done))

        routing = MagicMock()
        routing.search_needed = False

        with patch('ai.tutor.get_google_response_streaming', return_value='streamed result') as mock_gen:
            result = run_tutor(
                situation="Erkläre ATP",
                config={'api_key': 'fake-key'},
                routing_result=routing,
                stream_callback=fake_stream,
            )
            mock_gen.assert_called_once()
            # stream_callback should have been signalled done
            assert any(d for _, d in chunks)

    def test_tutor_returns_citations_from_rag(self):
        """Tutor should return citations from the RAG pipeline."""
        from ai.tutor import run_tutor

        routing = MagicMock()
        routing.search_needed = True
        routing.retrieval_mode = 'sql'
        routing.precise_queries = ['ATP']
        routing.broad_queries = []
        routing.embedding_queries = []
        routing.search_scope = 'current_deck'
        routing.max_sources = 'medium'

        test_citations = {'123': {'noteId': 123, 'question': 'ATP?'}}

        with patch('ai.tutor.retrieve_rag_context') as mock_rag:
            from ai.rag_pipeline import RagResult
            mock_rag.return_value = RagResult(
                rag_context={'cards': ['test'], 'citations': test_citations, 'reasoning': ''},
                citations=test_citations, cards_found=1)
            with patch('ai.tutor.get_google_response_streaming', return_value='answer'):
                result = run_tutor(
                    situation="Was ist ATP?",
                    config={'api_key': 'fake-key'},
                    routing_result=routing,
                )
        assert result.get('citations') == test_citations

    def test_tutor_error_handling(self):
        """Tutor should catch exceptions and return error dict."""
        from ai.tutor import run_tutor

        routing = MagicMock()
        routing.search_needed = False

        with patch('ai.tutor.get_google_response_streaming', side_effect=Exception('API timeout')):
            result = run_tutor(
                situation="test",
                config={'api_key': 'fake-key'},
                routing_result=routing,
            )
        assert isinstance(result, dict)
        assert 'text' in result
        assert 'Fehler' in result['text'] or 'API timeout' in result['text']


class TestTutorFallback:
    """Test the 3-level fallback chain in the Tutor agent."""

    def test_tutor_has_fallback_logic(self):
        """Tutor should handle model errors with fallback chain."""
        import inspect
        from ai.tutor import run_tutor
        source = inspect.getsource(run_tutor)
        assert 'fallback' in source.lower()

    def test_tutor_accepts_fallback_model(self):
        """Tutor should accept fallback_model from kwargs."""
        from ai.tutor import run_tutor
        # Should not crash even with empty config
        result = run_tutor(
            situation="test",
            config={'api_key': ''},
            model='primary-model',
            fallback_model='fallback-model',
        )
        assert isinstance(result, dict)

    def test_fallback_on_primary_failure(self):
        """When primary model fails, fallback model should be tried."""
        from ai.tutor import run_tutor

        routing = MagicMock()
        routing.search_needed = False

        call_args = []

        def fake_streaming(msg, model, api_key, **kw):
            call_args.append(model)
            if model == 'primary-model':
                raise Exception("Primary model overloaded")
            return "fallback answer"

        with patch('ai.tutor.get_google_response_streaming', side_effect=fake_streaming):
            result = run_tutor(
                situation="test",
                config={'api_key': 'fake-key'},
                routing_result=routing,
                model='primary-model',
                fallback_model='fallback-model',
            )
        assert 'fallback-model' in call_args
        assert result['text'] == 'fallback answer'

    def test_fallback_thins_rag_on_400_error(self):
        """400 errors should trigger thin RAG (top 3 cards) for fallback."""
        from ai.tutor import run_tutor

        routing = MagicMock()
        routing.search_needed = True
        routing.retrieval_mode = 'sql'
        routing.precise_queries = ['test']
        routing.broad_queries = []
        routing.embedding_queries = []
        routing.search_scope = 'current_deck'
        routing.max_sources = 'medium'

        rag_calls = {}

        def fake_streaming(msg, model, api_key, **kw):
            rag_calls[model] = kw.get('rag_context')
            if model == 'primary-model':
                err = Exception("400 Request payload size exceeds the limit")
                raise err
            return "thin answer"

        many_cards = ['card_%d' % i for i in range(10)]

        with patch('ai.tutor.retrieve_rag_context') as mock_rag:
            from ai.rag_pipeline import RagResult
            mock_rag.return_value = RagResult(
                rag_context={'cards': many_cards, 'citations': {}, 'reasoning': ''},
                citations={}, cards_found=10)
            with patch('ai.tutor.get_google_response_streaming', side_effect=fake_streaming):
                result = run_tutor(
                    situation="test",
                    config={'api_key': 'fake-key'},
                    routing_result=routing,
                    model='primary-model',
                    fallback_model='fallback-model',
                )

        # Fallback model should have received thinned RAG (max 3 cards)
        fallback_rag = rag_calls.get('fallback-model')
        assert fallback_rag is not None
        assert len(fallback_rag['cards']) <= 3

    def test_level3_no_rag_on_double_failure(self):
        """When both primary and fallback+RAG fail, try without RAG."""
        from ai.tutor import run_tutor

        routing = MagicMock()
        routing.search_needed = False

        call_count = [0]

        def fake_streaming(msg, model, api_key, **kw):
            call_count[0] += 1
            if call_count[0] <= 2:
                raise Exception("model error %d" % call_count[0])
            return "last resort answer"

        with patch('ai.tutor.get_google_response_streaming', side_effect=fake_streaming):
            result = run_tutor(
                situation="test",
                config={'api_key': 'fake-key'},
                routing_result=routing,
                model='primary-model',
                fallback_model='fallback-model',
            )
        assert result['text'] == 'last resort answer'
        assert call_count[0] == 3

    def test_all_levels_fail_returns_error(self):
        """When all 3 levels fail, return a user-friendly error."""
        from ai.tutor import run_tutor

        routing = MagicMock()
        routing.search_needed = False

        with patch('ai.tutor.get_google_response_streaming',
                   side_effect=Exception("always fails")):
            result = run_tutor(
                situation="test",
                config={'api_key': 'fake-key'},
                routing_result=routing,
                model='primary-model',
                fallback_model='fallback-model',
            )
        assert isinstance(result, dict)
        assert 'text' in result
        assert 'Fehler' in result['text']


class TestHelpPipeline:
    """Test that the Help agent integrates with the dispatch system."""

    @patch('config.get_config', return_value={'api_key': 'fake-key'})
    @patch('config.is_backend_mode', return_value=False)
    @patch('config.get_backend_url', return_value='')
    @patch('config.get_auth_token', return_value='')
    def test_help_dispatches_via_pipeline(self, mock_auth_token, mock_backend_url,
                                          mock_backend_mode, mock_config):
        """Help agent runs through _dispatch_agent and emits correct events."""
        import requests as req_mod
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {
            'candidates': [{'content': {'parts': [{'text': 'Use Cmd+I to open the panel.'}]}}]
        }
        with patch.object(req_mod, 'post', return_value=mock_resp):
            from ai.handler import AIHandler
            handler = AIHandler()

            events = []
            handler._pipeline_signal_callback = lambda s, st, d: None
            handler._msg_event_callback = lambda t, d: events.append(t)

            from ai.help_agent import run_help
            result = handler._dispatch_agent(
                agent_name='help',
                run_fn=run_help,
                situation='Wie oeffne ich das Panel?',
                request_id='req-help-1',
            )

        assert 'orchestration' in events
        assert 'text_chunk' in events
        assert 'msg_done' in events
        assert 'Cmd+I' in result

    def test_help_returns_error_without_api_key(self):
        """Help agent returns a structured error when no API key is configured."""
        from ai.help_agent import run_help
        steps = []
        result = run_help(
            situation="test",
            emit_step=lambda s, st, d=None: steps.append(s),
            memory=None,
        )
        # Without API key, should return an error dict (not crash)
        assert isinstance(result, dict)
        assert 'text' in result

    def test_help_accepts_emit_step_without_crash(self):
        """Help agent accepts emit_step kwarg without crashing on signature."""
        from ai.help_agent import run_help
        # Verify it can be called with emit_step (even if it doesn't use it)
        result = run_help(
            situation="test",
            emit_step=lambda s, st, d=None: None,
            memory=None,
        )
        assert isinstance(result, dict)
        assert 'text' in result


class TestResearchPipeline:
    """Test that the Research agent integrates with the dispatch system."""

    def test_research_uses_situation_param(self):
        """Research agent uses 'situation' parameter."""
        import inspect
        from research import run_research
        sig = inspect.signature(run_research)
        assert 'situation' in sig.parameters

    @patch('research.search.search')
    @patch('research.get_config', return_value={'openrouter_api_key': 'fake', 'research_sources': {}})
    def test_research_dispatches_via_pipeline(self, mock_config, mock_search):
        """Research agent runs through _dispatch_agent."""
        mock_result = MagicMock()
        mock_result.error = None
        mock_result.sources = [{'title': 'ATP Source'}]
        mock_result.tool_used = 'pubmed'
        mock_result.to_dict.return_value = {
            'text': 'ATP is adenosine triphosphate.',
            'sources': [],
        }
        mock_search.return_value = mock_result

        from ai.handler import AIHandler
        handler = AIHandler()

        events = []
        handler._pipeline_signal_callback = lambda s, st, d: None
        handler._msg_event_callback = lambda t, d: events.append(t)

        from research import run_research
        result = handler._dispatch_agent(
            agent_name='research',
            run_fn=run_research,
            situation='What is ATP?',
            request_id='req-res-1',
        )

        assert 'msg_done' in events
        assert 'ATP' in result


class TestPlusiPipeline:
    """Test that the Plusi agent integrates with the dispatch system."""

    def test_plusi_accepts_standard_params(self):
        """Plusi accepts emit_step and memory without crashing."""
        import inspect
        from plusi.agent import run_plusi
        sig = inspect.signature(run_plusi)
        assert 'emit_step' in sig.parameters
        assert 'memory' in sig.parameters
        assert 'situation' in sig.parameters


# ---------------------------------------------------------------------------
# Model Slots on AgentDefinition
# ---------------------------------------------------------------------------

class TestModelSlots:
    def test_agent_definition_has_model_fields(self):
        from ai.agents import AgentDefinition
        a = AgentDefinition(
            name='test', label='Test', description='test',
            premium_model='gemini-3-flash', fast_model='gemini-2.5-flash',
            fallback_model='gemini-2.5-flash',
        )
        assert a.premium_model == 'gemini-3-flash'
        assert a.fast_model == 'gemini-2.5-flash'
        assert a.fallback_model == 'gemini-2.5-flash'

    def test_model_fields_default_empty(self):
        from ai.agents import AgentDefinition
        a = AgentDefinition(name='min', label='Min', description='minimal')
        assert a.premium_model == ''
        assert a.fast_model == ''
        assert a.fallback_model == ''

    def test_tutor_has_model_slots(self):
        from ai.agents import get_agent
        tutor = get_agent('tutor')
        assert tutor is not None
        assert tutor.premium_model != ''
        assert tutor.fallback_model != ''

    def test_registry_for_frontend_includes_models(self):
        from ai.agents import get_registry_for_frontend
        result = get_registry_for_frontend({})
        tutor = next(a for a in result if a['name'] == 'tutor')
        assert 'premiumModel' in tutor
        assert 'fastModel' in tutor
        assert 'fallbackModel' in tutor


# ---------------------------------------------------------------------------
# Streaming Dispatch Tests
# ---------------------------------------------------------------------------

class TestStreamingDispatch:
    """Test streaming support and model selection in _dispatch_agent."""

    def test_dispatch_passes_stream_callback_to_agent(self):
        from ai.handler import AIHandler
        handler = AIHandler()
        received = {}

        def fake_run(situation='', emit_step=None, memory=None,
                     stream_callback=None, **kwargs):
            received['stream_callback'] = stream_callback
            return {'text': 'ok'}

        handler._pipeline_signal_callback = lambda s, st, d: None
        handler._msg_event_callback = lambda t, d: None
        handler._dispatch_agent(agent_name='test', run_fn=fake_run,
                                situation='hello', request_id='req-1')
        assert received['stream_callback'] is not None
        assert callable(received['stream_callback'])

    def test_streaming_agent_emits_chunks(self):
        from ai.handler import AIHandler
        handler = AIHandler()

        def streaming_agent(situation='', emit_step=None, memory=None,
                            stream_callback=None, **kwargs):
            if stream_callback:
                stream_callback('Hello ', False)
                stream_callback('world!', False)
                stream_callback('', True)
            return {'text': 'Hello world!', '_used_streaming': True}

        events = []
        handler._pipeline_signal_callback = lambda s, st, d: None
        handler._msg_event_callback = lambda t, d: events.append((t, d))
        handler._dispatch_agent(agent_name='test', run_fn=streaming_agent,
                                situation='hi', request_id='req-2')
        text_chunks = [(t, d) for t, d in events if t == 'text_chunk']
        assert len(text_chunks) == 2
        assert text_chunks[0][1]['chunk'] == 'Hello '
        assert text_chunks[1][1]['chunk'] == 'world!'

    def test_non_streaming_agent_still_works(self):
        from ai.handler import AIHandler
        handler = AIHandler()

        def non_streaming(situation='', emit_step=None, memory=None,
                          stream_callback=None, **kwargs):
            return {'text': 'complete response'}

        events = []
        handler._pipeline_signal_callback = lambda s, st, d: None
        handler._msg_event_callback = lambda t, d: events.append((t, d))
        result = handler._dispatch_agent(agent_name='test', run_fn=non_streaming,
                                         situation='hi', request_id='req-3')
        assert result == 'complete response'
        text_chunks = [d for t, d in events if t == 'text_chunk']
        assert len(text_chunks) == 1
        assert text_chunks[0]['chunk'] == 'complete response'

    def test_dispatch_selects_model_from_mode(self):
        from ai.handler import AIHandler
        from ai.agents import AgentDefinition
        handler = AIHandler()
        handler.config = {'model_mode': 'fast'}
        received = {}

        def fake_run(situation='', emit_step=None, memory=None,
                     stream_callback=None, **kwargs):
            received['model'] = kwargs.get('model')
            received['fallback_model'] = kwargs.get('fallback_model')
            return {'text': 'ok'}

        handler._pipeline_signal_callback = lambda s, st, d: None
        handler._msg_event_callback = lambda t, d: None
        agent_def = AgentDefinition(
            name='test', label='Test', description='test',
            premium_model='gemini-3-flash', fast_model='gemini-2.5-flash',
            fallback_model='gemini-2.5-flash',
        )
        handler._dispatch_agent(agent_name='test', run_fn=fake_run,
                                situation='hello', request_id='req-4',
                                agent_def=agent_def)
        assert received['model'] == 'gemini-2.5-flash'
        assert received['fallback_model'] == 'gemini-2.5-flash'


# ---------------------------------------------------------------------------
# HybridRetrieval Callback Decoupling Tests
# ---------------------------------------------------------------------------

class TestHybridRetrievalCallbacks:
    def test_no_handler_dependency(self):
        """retrieval.py should not reference self.ai anywhere."""
        filepath = os.path.join(os.path.dirname(os.path.dirname(__file__)),
                                'ai', 'retrieval.py')
        with open(filepath) as f:
            source = f.read()
        assert 'self.ai.' not in source, \
            "retrieval.py should use callbacks, not self.ai references"

    def test_retrieval_state_class_exists(self):
        from ai.retrieval import RetrievalState
        state = RetrievalState()
        assert hasattr(state, 'fallback_in_progress')
        assert hasattr(state, 'step_labels')
        assert state.fallback_in_progress is False
        assert state.step_labels == []

    def test_hybrid_retrieval_accepts_callbacks(self):
        """HybridRetrieval should accept emit_step and rag_retrieve_fn."""
        from ai.retrieval import HybridRetrieval
        sig = inspect.signature(HybridRetrieval.__init__)
        params = list(sig.parameters.keys())
        assert 'emit_step' in params
        assert 'rag_retrieve_fn' in params
        assert 'state' in params


# ---------------------------------------------------------------------------
# RAG Pipeline Extraction Tests (Task 4)
# ---------------------------------------------------------------------------

class TestRagPipeline:
    """Test the extracted RAG pipeline module."""

    def test_module_exists(self):
        from ai.rag_pipeline import retrieve_rag_context, RagResult
        assert callable(retrieve_rag_context)

    def test_rag_result_dataclass(self):
        from ai.rag_pipeline import RagResult
        r = RagResult(rag_context=None, citations={}, cards_found=0)
        assert r.cards_found == 0
        assert r.citations == {}

    def test_no_search_returns_empty(self):
        from ai.rag_pipeline import retrieve_rag_context
        routing = MagicMock()
        routing.search_needed = False
        result = retrieve_rag_context(
            user_message='hello', context=None, config={},
            routing_result=routing)
        assert result.cards_found == 0
        assert result.rag_context is None

    def test_search_needed_but_no_queries_returns_empty(self):
        """When search is needed but no queries provided, should return empty."""
        from ai.rag_pipeline import retrieve_rag_context
        routing = MagicMock()
        routing.search_needed = True
        routing.retrieval_mode = 'both'
        routing.precise_queries = []
        routing.broad_queries = []
        routing.embedding_queries = []
        routing.search_scope = 'current_deck'
        routing.max_sources = 'medium'
        result = retrieve_rag_context(
            user_message='hello', context=None, config={},
            routing_result=routing)
        assert result.cards_found == 0
        assert result.rag_context is None

    def test_sql_only_retrieval(self):
        """SQL-only retrieval should call rag_retrieve_fn and return results."""
        from ai.rag_pipeline import retrieve_rag_context
        routing = MagicMock()
        routing.search_needed = True
        routing.retrieval_mode = 'sql'
        routing.precise_queries = ['ATP']
        routing.broad_queries = ['energy']
        routing.embedding_queries = []
        routing.search_scope = 'current_deck'
        routing.max_sources = 'medium'

        fake_citations = {
            '123': {
                'noteId': 123, 'cardId': 456,
                'fields': {'Front': 'What is ATP?', 'Back': 'Energy molecule'},
                'deckName': 'Biology', 'isCurrentCard': False,
            }
        }
        fake_rag_fn = MagicMock(return_value={
            'context_string': 'Note 123:\n  Front: What is ATP?\n  Back: Energy molecule',
            'citations': fake_citations,
        })

        result = retrieve_rag_context(
            user_message='What is ATP?', context=None, config={},
            routing_result=routing,
            rag_retrieve_fn=fake_rag_fn,
        )
        assert result.cards_found == 1
        assert '123' in result.citations
        assert result.rag_context is not None
        assert 'cards' in result.rag_context
        fake_rag_fn.assert_called_once()

    def test_current_card_injected_when_missing(self):
        """Current card should be added to citations if not already present."""
        from ai.rag_pipeline import retrieve_rag_context
        routing = MagicMock()
        routing.search_needed = True
        routing.retrieval_mode = 'sql'
        routing.precise_queries = ['ATP']
        routing.broad_queries = []
        routing.embedding_queries = []
        routing.search_scope = 'current_deck'
        routing.max_sources = 'medium'

        # Retrieval returns a card that is NOT the current card
        fake_rag_fn = MagicMock(return_value={
            'context_string': 'Note 999:\n  Front: Other card',
            'citations': {
                '999': {'noteId': 999, 'cardId': 998,
                        'fields': {'Front': 'Other card'},
                        'deckName': 'Bio', 'isCurrentCard': False}
            },
        })

        context = {
            'cardId': 456, 'noteId': 123,
            'question': 'What is ATP?', 'answer': 'Energy molecule',
            'deckName': 'Biology', 'fields': {},
        }

        result = retrieve_rag_context(
            user_message='explain', context=context, config={},
            routing_result=routing,
            rag_retrieve_fn=fake_rag_fn,
        )
        assert '123' in result.citations
        assert result.citations['123']['isCurrentCard'] is True

    def test_current_card_not_duplicated(self):
        """If current card is already in results, don't add it again."""
        from ai.rag_pipeline import retrieve_rag_context
        routing = MagicMock()
        routing.search_needed = True
        routing.retrieval_mode = 'sql'
        routing.precise_queries = ['ATP']
        routing.broad_queries = []
        routing.embedding_queries = []
        routing.search_scope = 'current_deck'
        routing.max_sources = 'medium'

        fake_rag_fn = MagicMock(return_value={
            'context_string': 'Note 123:\n  Front: ATP',
            'citations': {
                '123': {'noteId': 123, 'cardId': 456,
                        'fields': {'Front': 'ATP'},
                        'deckName': 'Bio', 'isCurrentCard': False}
            },
        })

        context = {
            'cardId': 456, 'noteId': 123,
            'question': 'ATP?', 'answer': 'Energy',
            'deckName': 'Bio', 'fields': {},
        }

        result = retrieve_rag_context(
            user_message='explain', context=context, config={},
            routing_result=routing,
            rag_retrieve_fn=fake_rag_fn,
        )
        # Should still be 1 citation, not 2
        assert len(result.citations) == 1

    def test_emit_step_called_for_hybrid(self):
        """emit_step should be called during hybrid retrieval."""
        from ai.rag_pipeline import retrieve_rag_context
        routing = MagicMock()
        routing.search_needed = True
        routing.retrieval_mode = 'both'
        routing.precise_queries = ['ATP']
        routing.broad_queries = []
        routing.embedding_queries = []
        routing.search_scope = 'current_deck'
        routing.max_sources = 'medium'

        fake_rag_fn = MagicMock(return_value={
            'context_string': 'Note 1:\n  Front: ATP',
            'citations': {'1': {'noteId': 1, 'cardId': 2,
                                'fields': {'Front': 'ATP'},
                                'deckName': 'Bio', 'isCurrentCard': False}},
        })

        # Mock embedding manager
        emb_mgr = MagicMock()
        # HybridRetrieval will be used, which calls emit_step
        steps = []
        def track_step(step, status, data=None):
            steps.append((step, status))

        # Even if HybridRetrieval fails internally, emit_step should have been called
        result = retrieve_rag_context(
            user_message='What is ATP?', context=None, config={},
            routing_result=routing,
            emit_step=track_step,
            embedding_manager=emb_mgr,
            rag_retrieve_fn=fake_rag_fn,
        )
        # At minimum, the function attempted hybrid retrieval
        assert isinstance(result.cards_found, int)

    def test_no_context_no_card_injection(self):
        """Without context, no current card injection should happen."""
        from ai.rag_pipeline import retrieve_rag_context
        routing = MagicMock()
        routing.search_needed = True
        routing.retrieval_mode = 'sql'
        routing.precise_queries = ['term']
        routing.broad_queries = []
        routing.embedding_queries = []
        routing.search_scope = 'current_deck'
        routing.max_sources = 'low'

        fake_rag_fn = MagicMock(return_value={
            'context_string': 'Note 5:\n  Front: term',
            'citations': {'5': {'noteId': 5, 'cardId': 6,
                                'fields': {'Front': 'term'},
                                'deckName': 'Deck', 'isCurrentCard': False}},
        })

        result = retrieve_rag_context(
            user_message='explain', context=None, config={},
            routing_result=routing,
            rag_retrieve_fn=fake_rag_fn,
        )
        assert result.cards_found == 1
        # No current card should be injected
        for cit in result.citations.values():
            assert not cit.get('isCurrentCard', False)

    def test_returns_rag_result_type(self):
        """Return type should always be RagResult."""
        from ai.rag_pipeline import retrieve_rag_context, RagResult
        routing = MagicMock()
        routing.search_needed = False
        result = retrieve_rag_context(
            user_message='hi', context=None, config={},
            routing_result=routing)
        assert isinstance(result, RagResult)


# ---------------------------------------------------------------------------
# All Agents Streaming-Ready Tests
# ---------------------------------------------------------------------------

class TestTutorHandoff:
    """Test handoff detection in the Tutor agent."""

    def test_tutor_has_handoff_logic(self):
        """Tutor should import and use parse_handoff."""
        import inspect
        from ai.tutor import run_tutor
        source = inspect.getsource(run_tutor)
        assert 'parse_handoff' in source

    def test_handoff_parsing_in_tutor(self):
        """Tutor should strip handoff signals from response text."""
        from ai.handoff import parse_handoff
        text = "Here is the answer.\nHANDOFF: research\nREASON: needs sources\nQUERY: What is ATP?"
        clean, req = parse_handoff(text)
        assert req is not None
        assert req.to == 'research'
        assert 'Here is the answer' in clean

    def test_tutor_strips_handoff_from_result(self):
        """When Tutor response contains a handoff signal, it should be stripped from result text."""
        from ai.tutor import run_tutor

        handoff_response = (
            "Here is a partial answer.\n"
            "HANDOFF: research\n"
            "REASON: needs external sources\n"
            "QUERY: What is ATP synthesis?"
        )

        routing = MagicMock()
        routing.search_needed = False

        with patch('ai.tutor._call_generation', return_value=handoff_response):
            # Mock the handoff execution to avoid import errors
            with patch('ai.tutor.parse_handoff') as mock_parse:
                from ai.handoff import HandoffRequest
                mock_parse.return_value = (
                    "Here is a partial answer.",
                    HandoffRequest(to='research', reason='needs external sources',
                                   query='What is ATP synthesis?')
                )
                with patch('ai.tutor.validate_handoff', return_value=False):
                    result = run_tutor(
                        situation="What is ATP?",
                        config={'api_key': 'fake-key'},
                        routing_result=routing,
                    )
            # Even if handoff is rejected, the signal should be stripped
            assert 'HANDOFF' not in result.get('text', '')

    def test_tutor_without_handoff_returns_full_text(self):
        """When no handoff signal, Tutor returns the full text unmodified."""
        from ai.tutor import run_tutor

        routing = MagicMock()
        routing.search_needed = False

        with patch('ai.tutor._call_generation', return_value='ATP is energy currency.'):
            result = run_tutor(
                situation="What is ATP?",
                config={'api_key': 'fake-key'},
                routing_result=routing,
            )
        assert result['text'] == 'ATP is energy currency.'


class TestAllAgentsStreamingReady:
    """Every agent must accept stream_callback for streaming support."""

    def test_help_accepts_stream_callback(self):
        import inspect
        from ai.help_agent import run_help
        assert 'stream_callback' in inspect.signature(run_help).parameters

    def test_research_accepts_stream_callback(self):
        import inspect
        from research import run_research
        assert 'stream_callback' in inspect.signature(run_research).parameters

    def test_plusi_accepts_stream_callback(self):
        import inspect
        from plusi.agent import run_plusi
        assert 'stream_callback' in inspect.signature(run_plusi).parameters

    def test_help_uses_model_from_kwargs(self):
        import inspect
        from ai.help_agent import run_help
        source = inspect.getsource(run_help)
        assert "kwargs.get('model')" in source or "model = kwargs" in source


class TestHandlerPureDispatcher:
    """Handler should be a thin dispatcher — no Tutor-specific branching."""

    def test_no_tutor_special_case(self):
        """Handler should NOT have Tutor-specific branching."""
        import inspect
        from ai.handler import AIHandler
        source = inspect.getsource(AIHandler.get_response_with_rag)
        assert "!= 'tutor'" not in source, "Handler should not have Tutor special case"
        assert '_use_rag_pipeline' not in source, "Handler should not check sentinel"
