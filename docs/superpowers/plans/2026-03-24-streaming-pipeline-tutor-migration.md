# Streaming Pipeline + Tutor Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all agents stream responses, migrate the Tutor from handler.py inline code to a real agent, and add model slots to the agent registry — resulting in a unified pipeline where every agent goes through `_dispatch_agent()`.

**Architecture:** Add `stream_callback` to the standard agent interface and make `_dispatch_agent()` streaming-aware. Extract the RAG pipeline from handler.py into `ai/rag_pipeline.py`. Rewrite `ai/tutor.py` as a real agent that calls the extracted RAG pipeline and streams via `stream_callback`. Slim handler.py's `get_response_with_rag()` from ~535 lines to ~50 (routing + dispatch). Add `premium_model`/`fast_model`/`fallback_model` fields to `AgentDefinition`.

**Tech Stack:** Python 3.9+, pytest, SQLite (in-memory for tests), mock aqt/PyQt6

**Spec:** `docs/superpowers/specs/2026-03-24-streaming-pipeline-tutor-migration-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `ai/agents.py` | Add 3 model fields to AgentDefinition, update registrations |
| Modify | `ai/handler.py` | Add streaming to `_dispatch_agent()`, then slim `get_response_with_rag()` to pure dispatcher |
| Modify | `ai/retrieval.py` | Refactor HybridRetrieval: accept `emit_step` callback instead of `ai_handler` |
| Create | `ai/rag_pipeline.py` | Extracted RAG retrieval logic (from handler.py lines 644-787) |
| Rewrite | `ai/tutor.py` | From sentinel wrapper to real agent with RAG + streaming + handoff |
| Modify | `ai/help_agent.py` | Accept `stream_callback`, use `model` from kwargs |
| Modify | `research/__init__.py` | Accept `stream_callback`, use `model` from kwargs |
| Modify | `plusi/agent.py` | Accept `stream_callback` |
| Modify | `tests/test_agent_pipeline.py` | Add streaming, model slots, RAG pipeline, Tutor migration tests |

---

### Task 1: Add model slots to AgentDefinition

**Files:**
- Modify: `ai/agents.py:22-72` — add 3 fields to dataclass
- Modify: `ai/agents.py:297-475` — update 4 agent registrations
- Modify: `ai/agents.py:113-139` — add model fields to `get_registry_for_frontend()`
- Test: `tests/test_agent_pipeline.py`

- [ ] **Step 1: Write test for model fields**

Add to `tests/test_agent_pipeline.py`:

```python
class TestModelSlots:
    """Test model slot fields on AgentDefinition."""

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
        assert tutor.premium_model != '', "Tutor should have premium_model set"
        assert tutor.fallback_model != '', "Tutor should have fallback_model set"

    def test_registry_for_frontend_includes_models(self):
        from ai.agents import get_registry_for_frontend
        result = get_registry_for_frontend({})
        tutor = next(a for a in result if a['name'] == 'tutor')
        assert 'premiumModel' in tutor
        assert 'fastModel' in tutor
        assert 'fallbackModel' in tutor
```

- [ ] **Step 2: Run tests — expect failure**

Run: `python3 run_tests.py -v -k "TestModelSlots"`

- [ ] **Step 3: Add model fields to AgentDefinition dataclass**

In `ai/agents.py`, add after the `max_history` field (~line 72):

```python
    # Model configuration
    premium_model: str = ''        # Model for premium mode
    fast_model: str = ''           # Model for fast mode
    fallback_model: str = ''       # Fallback when primary model fails
```

- [ ] **Step 4: Update 4 agent registrations with model values**

Tutor: `premium_model='gemini-3-flash-preview', fast_model='gemini-2.5-flash', fallback_model='gemini-2.5-flash'`
Research: all three empty (uses external APIs)
Help: all three `'gemini-2.5-flash'`
Plusi: `premium_model='claude-sonnet', fast_model='gemini-2.5-flash', fallback_model='gemini-2.5-flash'`

- [ ] **Step 5: Add model fields to `get_registry_for_frontend()`**

Add to the result dict: `'premiumModel': a.premium_model, 'fastModel': a.fast_model, 'fallbackModel': a.fallback_model`

- [ ] **Step 6: Run tests, verify pass, commit**

```
feat(agents): add premium_model/fast_model/fallback_model to AgentDefinition
```

---

### Task 2: Add streaming support to `_dispatch_agent()`

**Files:**
- Modify: `ai/handler.py:413-535` — add streaming + model selection
- Test: `tests/test_agent_pipeline.py`

- [ ] **Step 1: Write streaming dispatch tests**

Add to `tests/test_agent_pipeline.py`:

```python
class TestStreamingDispatch:
    """Test that _dispatch_agent supports streaming via stream_callback."""

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
```

- [ ] **Step 2: Run tests — expect failure**

- [ ] **Step 3: Implement streaming + model selection in `_dispatch_agent()`**

Add `agent_def=None` parameter. Before calling `run_fn`, add model selection and streaming callback:

```python
        # Model selection
        if agent_def:
            mode = (self.config or {}).get('model_mode', 'premium')
            if mode == 'fast':
                model = agent_def.fast_model or agent_def.premium_model
            else:
                model = agent_def.premium_model or agent_def.fast_model
            fallback = agent_def.fallback_model or model
            if model:
                agent_kwargs['model'] = model
            if fallback:
                agent_kwargs['fallback_model'] = fallback

        # Build streaming callback
        _used_streaming = []
        def _stream_callback(chunk, done):
            if done:
                return
            if chunk:
                _used_streaming.append(True)
                self._emit_msg_event("text_chunk", {
                    "messageId": request_id or '',
                    "agent": agent_name,
                    "chunk": chunk,
                })
```

Pass `stream_callback=_stream_callback` to `run_fn`. After agent returns, only emit full text if agent didn't stream.

Also update the non-tutor dispatch call site to pass `agent_def=_agent_def`.

- [ ] **Step 4: Run tests, verify pass, commit**

```
feat(pipeline): add streaming support and model selection to _dispatch_agent()
```

---

### Task 3: Refactor HybridRetrieval to accept callbacks

**Files:**
- Modify: `ai/retrieval.py:14-17` — change `__init__` signature
- Modify: `ai/retrieval.py` — replace all 15 `self.ai.*` references
- Modify: `ai/handler.py:686` — update construction site
- Test: `tests/test_agent_pipeline.py`

- [ ] **Step 1: Write test**

```python
class TestHybridRetrievalCallbacks:
    def test_no_handler_dependency(self):
        """retrieval.py should not reference self.ai anywhere."""
        import os
        filepath = os.path.join(os.path.dirname(os.path.dirname(__file__)),
                                'ai', 'retrieval.py')
        with open(filepath) as f:
            source = f.read()
        assert 'self.ai.' not in source, \
            "retrieval.py should use callbacks, not self.ai references"
```

- [ ] **Step 2: Run test — expect failure**

- [ ] **Step 3: Refactor HybridRetrieval**

Change `__init__` from `(self, embedding_manager, ai_handler)` to `(self, embedding_manager, emit_step=None, rag_retrieve_fn=None)`.

Replace all 15 `self.ai.*` references:
- `self.ai._emit_pipeline_step(...)` becomes `self.emit_step(...)`
- `self.ai._rag_retrieve_cards(...)` becomes `self.rag_retrieve_fn(...)`
- `self.ai._emit_ai_event(...)` — remove (caller handles rag_sources emission)
- `self.ai._current_step_labels` — remove (not needed in retrieval)
- `self.ai._fallback_in_progress` — remove (not needed in retrieval)
- `self.ai._current_request_steps` — remove (not needed in retrieval)

- [ ] **Step 4: Update handler.py construction**

Change `HybridRetrieval(_emb_mgr, self)` to:
```python
HybridRetrieval(_emb_mgr, emit_step=self._emit_pipeline_step,
                rag_retrieve_fn=self._rag_retrieve_cards)
```

- [ ] **Step 5: Run tests, verify pass, commit**

```
refactor(retrieval): HybridRetrieval accepts callbacks instead of handler
```

---

### Task 4: Extract RAG pipeline to `ai/rag_pipeline.py`

**Files:**
- Create: `ai/rag_pipeline.py`
- Modify: `ai/handler.py` — replace inline retrieval with function call
- Test: `tests/test_agent_pipeline.py`

- [ ] **Step 1: Write test**

```python
class TestRagPipeline:
    def test_module_exists(self):
        from ai.rag_pipeline import retrieve_rag_context, RagResult
        assert callable(retrieve_rag_context)

    def test_no_search_returns_empty(self):
        from ai.rag_pipeline import retrieve_rag_context
        from unittest.mock import MagicMock
        routing = MagicMock()
        routing.search_needed = False
        result = retrieve_rag_context(
            user_message='hello', context=None, config={},
            routing_result=routing)
        assert result.cards_found == 0
```

- [ ] **Step 2: Run test — expect failure**

- [ ] **Step 3: Create `ai/rag_pipeline.py`**

Extract handler.py lines 644-787 into `retrieve_rag_context()`. The function:
1. Parses search params from `routing_result`
2. Loads embedding manager if not provided
3. Calls `HybridRetrieval.retrieve()` (refactored in Task 3)
4. Falls back to SQL-only retrieval
5. Formats context string and citations
6. Injects current card if not in results
7. Returns `RagResult(rag_context, citations, cards_found)`

Uses `emit_step` callback for pipeline visualization. Does NOT emit v2 msg_events.

- [ ] **Step 4: Wire handler.py to call `retrieve_rag_context()`**

Replace handler.py lines 644-787 with call to new function. Handler still emits v2 events (rag_sources, agent_cell citations) based on the returned RagResult.

- [ ] **Step 5: Run tests, verify pass, commit**

```
refactor(rag): extract RAG pipeline to ai/rag_pipeline.py
```

---

### Task 5: Rewrite Tutor as real agent

**Files:**
- Rewrite: `ai/tutor.py`
- Test: `tests/test_agent_pipeline.py`

This is the largest task. Read handler.py lines 788-970 (generation + handoff + fallback) and move that logic into `run_tutor()`.

- [ ] **Step 1: Write tests**

```python
class TestTutorRealAgent:
    def test_no_sentinel_return(self):
        from ai.tutor import run_tutor
        result = run_tutor(situation="test", config={'api_key': ''})
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
```

- [ ] **Step 2: Run tests — expect failure**

- [ ] **Step 3: Rewrite `ai/tutor.py`**

New `run_tutor()` handles:
1. RAG retrieval via `retrieve_rag_context()`
2. System prompt construction via `get_system_prompt()`
3. Streaming generation via `get_google_response_streaming()` with `stream_callback` relay
4. Handoff detection via `parse_handoff()` + `validate_handoff()`
5. 3-level error fallback (primary model, fallback with thin RAG, fallback without RAG)
6. Memory tracking via AgentMemory

Gets `model`, `fallback_model`, `config`, `context`, `history`, `routing_result` from `**kwargs`.

- [ ] **Step 4: Run tests, verify pass, commit**

```
feat(tutor): migrate Tutor to real agent with RAG + streaming + handoff
```

---

### Task 6: Slim handler.py to pure dispatcher

**Files:**
- Modify: `ai/handler.py`
- Test: `tests/test_agent_pipeline.py`

- [ ] **Step 1: Write test**

```python
class TestHandlerPureDispatcher:
    def test_no_tutor_special_case(self):
        import inspect
        from ai.handler import AIHandler
        source = inspect.getsource(AIHandler.get_response_with_rag)
        assert "!= 'tutor'" not in source
        assert '_use_rag_pipeline' not in source
```

- [ ] **Step 2: Run test — expect failure**

- [ ] **Step 3: Replace `get_response_with_rag()` with ~50-line dispatcher**

Route message, load agent, call `_dispatch_agent()`. No if/else for Tutor. Pass `routing_result`, `context`, `history`, `mode`, `insights` as extra_kwargs.

Remove old Tutor inline code, `_rag_router()`, `_rag_retrieve_cards()` wrappers (keep them if still used by rag_pipeline.py, otherwise remove).

- [ ] **Step 4: Run tests, verify pass, commit**

```
refactor(handler): slim get_response_with_rag to pure dispatcher (~50 lines)
```

---

### Task 7: Update non-tutor agents for streaming and model

**Files:**
- Modify: `ai/help_agent.py`, `research/__init__.py`, `plusi/agent.py`
- Test: `tests/test_agent_pipeline.py`

- [ ] **Step 1: Write tests**

```python
class TestAllAgentsStreamingReady:
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
```

- [ ] **Step 2: Run tests — expect failure**

- [ ] **Step 3: Add `stream_callback=None` to all three agents**

Help: also change model selection to `model = kwargs.get('model') or HELP_MODEL`
Research and Plusi: just add the parameter, no other changes needed.

- [ ] **Step 4: Run tests, verify pass, commit**

```
feat(agents): add stream_callback to Help, Research, Plusi
```

---

### Task 8: Final verification and cleanup

- [ ] **Step 1: Run complete test suite**

Run: `python3 run_tests.py -v`

- [ ] **Step 2: Verify handler is slim**

Run: `wc -l ai/handler.py`

- [ ] **Step 3: Verify no Tutor inline code in handler**

Run: `grep -n "_use_rag_pipeline\|_rag_router\|_rag_retrieve" ai/handler.py`

- [ ] **Step 4: Verify all signatures**

Run: `python3 run_tests.py -v -k "Signature or StreamingReady or ModelSlots"`

- [ ] **Step 5: Commit if cleanup needed**
