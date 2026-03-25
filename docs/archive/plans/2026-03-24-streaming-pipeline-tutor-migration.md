# Streaming Pipeline + Tutor Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all agents stream responses, migrate the Tutor from handler.py inline code to a real agent, and add model slots to the agent registry — resulting in a unified pipeline where every agent goes through `_dispatch_agent()`.

**Architecture:** Add `stream_callback` to the standard agent interface and make `_dispatch_agent()` streaming-aware. Extract the RAG pipeline from handler.py into `ai/rag_pipeline.py`. Rewrite `ai/tutor.py` as a real agent that calls the extracted RAG pipeline and streams via `stream_callback`. Slim handler.py's `get_response_with_rag()` from ~535 lines to ~50 (routing + dispatch). Add `premium_model`/`fast_model`/`fallback_model` fields to `AgentDefinition`.

**Tech Stack:** Python 3.9+, pytest, SQLite (in-memory for tests), mock aqt/PyQt6

**Spec:** `docs/superpowers/specs/2026-03-24-streaming-pipeline-tutor-migration-design.md`

**Safety:** Git tag `pre-tutor-migration` before Task 6. If anything breaks: `git reset --hard pre-tutor-migration`.

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `ai/agents.py` | Add 3 model fields to AgentDefinition, update registrations |
| Modify | `ai/handler.py` | Add streaming to `_dispatch_agent()`, then slim `get_response_with_rag()` to pure dispatcher |
| Modify | `ai/retrieval.py` | Refactor HybridRetrieval: accept callbacks + RetrievalState instead of handler |
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

- [ ] **Step 4: Update 4 agent registrations**

Tutor: `premium_model='gemini-3-flash-preview', fast_model='gemini-2.5-flash', fallback_model='gemini-2.5-flash'`
Research: all three empty (uses external APIs)
Help: all three `'gemini-2.5-flash'`
Plusi: `premium_model='claude-sonnet', fast_model='gemini-2.5-flash', fallback_model='gemini-2.5-flash'`

- [ ] **Step 5: Add model fields to `get_registry_for_frontend()`**

Add to the result dict: `'premiumModel': a.premium_model, 'fastModel': a.fast_model, 'fallbackModel': a.fallback_model`

- [ ] **Step 6: Run tests, verify pass, run full suite, commit**

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

Add `agent_def=None` parameter to `_dispatch_agent()`.

Before calling `run_fn`, add:

```python
        # Model selection from agent_def + global mode
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

Pass `stream_callback=_stream_callback` to `run_fn`. After return, only emit full text if not streamed:

```python
        used_streaming = result.get('_used_streaming', False) if isinstance(result, dict) else False
        if not _used_streaming and not used_streaming:
            self._emit_msg_event("text_chunk", {
                "messageId": request_id or '',
                "agent": agent_name,
                "chunk": text,
            })
```

Also update the non-tutor dispatch call site (~line 588) to pass `agent_def=_agent_def`.

- [ ] **Step 4: Run tests, verify pass, run full suite, commit**

```
feat(pipeline): add streaming support and model selection to _dispatch_agent()
```

---

### Task 3: Refactor HybridRetrieval to accept callbacks + RetrievalState

**Files:**
- Modify: `ai/retrieval.py:14-17` — change `__init__` signature
- Modify: `ai/retrieval.py` — replace all 15 `self.ai.*` references
- Modify: `ai/handler.py:686` — update construction site
- Test: `tests/test_agent_pipeline.py`

**Critical context:** HybridRetrieval currently modifies two handler state variables:
- `self.ai._fallback_in_progress` (set True/False during collection-retry fallback) — handler's `_emit_pipeline_step` checks this to suppress duplicate UI events
- `self.ai._current_step_labels` (truncated to `[:1]` before retry) — handler sends this to frontend

These MUST be preserved. Solution: a shared `RetrievalState` object.

- [ ] **Step 1: Write tests**

```python
class TestHybridRetrievalCallbacks:
    """Test that HybridRetrieval uses callbacks + state object instead of handler."""

    def test_no_handler_dependency(self):
        """retrieval.py should not reference self.ai anywhere."""
        import os
        filepath = os.path.join(os.path.dirname(os.path.dirname(__file__)),
                                'ai', 'retrieval.py')
        with open(filepath) as f:
            source = f.read()
        assert 'self.ai.' not in source, \
            "retrieval.py should use callbacks, not self.ai references"

    def test_retrieval_state_class_exists(self):
        """RetrievalState should be importable."""
        from ai.retrieval import RetrievalState
        state = RetrievalState()
        assert hasattr(state, 'fallback_in_progress')
        assert hasattr(state, 'step_labels')
        assert state.fallback_in_progress is False
        assert state.step_labels == []

    def test_hybrid_retrieval_modifies_state(self):
        """HybridRetrieval should write fallback_in_progress on the state object."""
        from ai.retrieval import RetrievalState
        state = RetrievalState()
        # Verify state is mutable
        state.fallback_in_progress = True
        assert state.fallback_in_progress is True
        state.step_labels = ['router label']
        assert state.step_labels == ['router label']
```

- [ ] **Step 2: Run tests — expect failure**

- [ ] **Step 3: Add `RetrievalState` class to retrieval.py**

Add at the top of `ai/retrieval.py`:

```python
class RetrievalState:
    """Shared mutable state between retrieval and pipeline.

    HybridRetrieval modifies these during execution:
    - fallback_in_progress: suppresses duplicate pipeline events during retry
    - step_labels: accumulates step labels, truncated before retry
    """
    def __init__(self):
        self.fallback_in_progress = False
        self.step_labels = []
```

- [ ] **Step 4: Refactor HybridRetrieval constructor**

Change from:
```python
class HybridRetrieval:
    def __init__(self, embedding_manager, ai_handler):
        self.emb = embedding_manager
        self.ai = ai_handler
```

To:
```python
class HybridRetrieval:
    def __init__(self, embedding_manager, emit_step=None, rag_retrieve_fn=None, state=None):
        self.emb = embedding_manager
        self.emit_step = emit_step or (lambda step, status, data=None: None)
        self.rag_retrieve_fn = rag_retrieve_fn
        self.state = state or RetrievalState()
```

- [ ] **Step 5: Replace all `self.ai.*` references**

| Old | New |
|-----|-----|
| `self.ai._emit_pipeline_step(step, status, data)` | `self.emit_step(step, status, data)` |
| `self.ai._rag_retrieve_cards(...)` | `self.rag_retrieve_fn(...)` |
| `self.ai._current_step_labels = ...` | `self.state.step_labels = ...` |
| `self.ai._current_step_labels[:1]` | `self.state.step_labels[:1]` |
| `self.ai._fallback_in_progress = True` | `self.state.fallback_in_progress = True` |
| `self.ai._fallback_in_progress = False` | `self.state.fallback_in_progress = False` |
| `self.ai._emit_ai_event("rag_sources", merged)` | Remove — caller handles this |
| `for step in self.ai._current_request_steps:` | `for step in self.state.step_labels:` (or remove if only reading step metadata that's not available) |

**Important:** Read each reference carefully. Some read, some write. Check lines 48, 51, 65, 75, 81, 95, 134, 141, 145, 155, 158, 161, 165, 181, 190.

- [ ] **Step 6: Update handler.py construction**

Change `HybridRetrieval(_emb_mgr, self)` to:

```python
_retrieval_state = RetrievalState()
_retrieval_state.step_labels = self._current_step_labels

hybrid = HybridRetrieval(
    _emb_mgr,
    emit_step=self._emit_pipeline_step,
    rag_retrieve_fn=self._rag_retrieve_cards,
    state=_retrieval_state,
)

retrieval_result = hybrid.retrieve(...)

# Sync state back
self._current_step_labels = _retrieval_state.step_labels
self._fallback_in_progress = _retrieval_state.fallback_in_progress
```

- [ ] **Step 7: Run tests, verify pass, run full suite, commit**

```
refactor(retrieval): HybridRetrieval accepts callbacks + RetrievalState

Removes dependency on AIHandler. Uses emit_step callback, rag_retrieve_fn,
and shared RetrievalState for fallback_in_progress and step_labels.
```

---

### Task 4: Extract RAG pipeline to `ai/rag_pipeline.py`

**Files:**
- Create: `ai/rag_pipeline.py`
- Modify: `ai/handler.py` — replace inline retrieval with function call
- Test: `tests/test_agent_pipeline.py`

- [ ] **Step 1: Write tests**

```python
class TestRagPipeline:
    """Test the extracted RAG pipeline module."""

    def test_module_exists(self):
        from ai.rag_pipeline import retrieve_rag_context, RagResult
        assert callable(retrieve_rag_context)

    def test_rag_result_dataclass(self):
        from ai.rag_pipeline import RagResult
        r = RagResult(rag_context=None, citations={}, cards_found=0)
        assert r.cards_found == 0

    def test_no_search_returns_empty(self):
        from ai.rag_pipeline import retrieve_rag_context
        from unittest.mock import MagicMock
        routing = MagicMock()
        routing.search_needed = False
        result = retrieve_rag_context(
            user_message='hello', context=None, config={},
            routing_result=routing)
        assert result.cards_found == 0
        assert result.rag_context is None
```

- [ ] **Step 2: Run tests — expect failure**

- [ ] **Step 3: Create `ai/rag_pipeline.py`**

Extract handler.py lines ~644-787 into `retrieve_rag_context()`.

```python
"""RAG Pipeline — Tutor's card retrieval orchestration.

Extracts and ranks Anki cards for the Tutor agent's context.
This is the Tutor's internal reasoning process, extracted
because it's too large for tutor.py.
"""
from dataclasses import dataclass
from typing import Optional

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)


@dataclass
class RagResult:
    """Result from RAG retrieval."""
    rag_context: Optional[dict]   # {cards, citations, reasoning} or None
    citations: dict               # noteId -> card info
    cards_found: int


def retrieve_rag_context(user_message, context, config, routing_result,
                         emit_step=None, embedding_manager=None) -> RagResult:
    """Orchestrate card retrieval based on router decision.

    Handles: query preparation, HybridRetrieval or SQL-only fallback,
    context formatting, current card injection.

    Does NOT emit v2 msg_events (agent_cell, rag_sources).
    The caller handles those based on the returned RagResult.
    """
    emit = emit_step or (lambda step, status, data=None: None)

    if not getattr(routing_result, 'search_needed', None):
        return RagResult(rag_context=None, citations={}, cards_found=0)

    # ... Extract the logic from handler.py lines 644-787
    # The implementer must:
    # 1. Read handler.py lines 644-787 carefully
    # 2. Move query preparation (precise_queries, broad_queries)
    # 3. Move HybridRetrieval call (using refactored API from Task 3)
    # 4. Move SQL-only fallback (_rag_retrieve_cards equivalent)
    # 5. Move context formatting (context_string, citations)
    # 6. Move current card injection (lines 760-787)
    # 7. Return RagResult instead of modifying handler state
```

- [ ] **Step 4: Wire handler.py to use `retrieve_rag_context()`**

Replace handler.py lines ~644-787 with a call to the new function. Handler still emits v2 events (rag_sources, agent_cell) based on the returned RagResult.

- [ ] **Step 5: Run tests, verify pass, run full suite, commit**

```
refactor(rag): extract RAG pipeline to ai/rag_pipeline.py
```

---

### Task 5a: Rewrite Tutor — basic RAG + streaming (no handoff, no fallback)

**Files:**
- Rewrite: `ai/tutor.py` — basic agent with RAG + generation + streaming
- Test: `tests/test_agent_pipeline.py`

This is step 1 of 3 for the Tutor migration. Only the happy path: RAG retrieval, system prompt, streaming generation. Returns error string on any failure.

- [ ] **Step 1: Write tests**

```python
class TestTutorRealAgent:
    """Test the migrated Tutor as a real agent."""

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

    def test_accepts_model_from_kwargs(self):
        """Tutor should accept model from kwargs, not hardcode it."""
        import inspect
        from ai.tutor import run_tutor
        source = inspect.getsource(run_tutor)
        # Should get model from kwargs
        assert "kwargs" in source
```

- [ ] **Step 2: Run tests — expect failure (sentinel still returned)**

- [ ] **Step 3: Rewrite `ai/tutor.py` — basic path only**

New `run_tutor()`:
1. Extract params from kwargs (config, context, history, routing_result, model, mode, insights)
2. Call `retrieve_rag_context()` from `ai/rag_pipeline.py`
3. Call `get_system_prompt()` from `ai/system_prompt.py`
4. Call `get_google_response_streaming()` from `ai/gemini.py`, relaying chunks through `stream_callback`
5. Track memory
6. Return `{'text': response, 'citations': ..., '_used_streaming': True}`
7. On ANY error: return `{'text': error_message}`

**NO handoff detection. NO fallback chain.** Those come in 5b and 5c.

- [ ] **Step 4: Run tests, verify pass, run full suite, commit**

```
feat(tutor): basic Tutor agent with RAG + streaming (no handoff/fallback yet)
```

---

### Task 5b: Add handoff detection to Tutor

**Files:**
- Modify: `ai/tutor.py` — add handoff parsing after generation
- Test: `tests/test_agent_pipeline.py`

- [ ] **Step 1: Write test**

```python
class TestTutorHandoff:
    def test_tutor_imports_handoff(self):
        """Tutor should use parse_handoff and validate_handoff."""
        import inspect
        from ai.tutor import run_tutor
        source = inspect.getsource(run_tutor)
        assert 'parse_handoff' in source
```

- [ ] **Step 2: Run test — expect failure**

- [ ] **Step 3: Add handoff logic to `run_tutor()`**

After streaming generation completes, add:

```python
    # Handoff check
    try:
        from .handoff import parse_handoff, validate_handoff
    except ImportError:
        from handoff import parse_handoff, validate_handoff

    if response_text and isinstance(response_text, str):
        clean_text, handoff_req = parse_handoff(response_text)
        if handoff_req and validate_handoff(handoff_req, 'tutor', ['tutor'], config):
            # Load and execute target agent
            try:
                from .agents import get_agent, lazy_load_run_fn
            except ImportError:
                from agents import get_agent, lazy_load_run_fn

            target_def = get_agent(handoff_req.to)
            if target_def:
                target_fn = lazy_load_run_fn(target_def)
                target_result = target_fn(
                    situation=handoff_req.query,
                    **target_def.extra_kwargs
                )
                # Build handoff marker for frontend
                # (extract from handler.py lines 870-914)
                ...
            response_text = clean_text
```

Move the handoff marker building from handler.py (lines ~870-914).

- [ ] **Step 4: Run tests, verify pass, commit**

```
feat(tutor): add handoff detection (Tutor -> Research delegation)
```

---

### Task 5c: Add 3-level fallback chain to Tutor

**Files:**
- Modify: `ai/tutor.py` — wrap generation in try/except with fallback
- Test: `tests/test_agent_pipeline.py`

- [ ] **Step 1: Write test**

```python
class TestTutorFallback:
    def test_tutor_has_fallback_logic(self):
        """Tutor should handle model errors with fallback chain."""
        import inspect
        from ai.tutor import run_tutor
        source = inspect.getsource(run_tutor)
        assert 'fallback' in source.lower()
```

- [ ] **Step 2: Run test — expect failure**

- [ ] **Step 3: Add fallback chain**

Wrap the generation call in a 3-level try/except:

```python
    # Level 1: Primary model with full RAG
    try:
        response_text = _generate_streaming(...)
    except Exception as e:
        logger.warning("Primary model failed: %s, trying fallback", e)
        # Level 2: Fallback model with thin RAG (top 3 cards, no history)
        try:
            response_text = _generate_streaming(
                ..., model=fallback_model, history=[], rag_context=thin_rag)
        except Exception as e2:
            logger.warning("Fallback with RAG failed: %s, trying without RAG", e2)
            # Level 3: Fallback model without RAG
            try:
                response_text = _generate_streaming(
                    ..., model=fallback_model, rag_context=None)
            except Exception as e3:
                logger.exception("All models failed: %s", e3)
                return {'text': 'Es ist ein Fehler aufgetreten. Bitte versuche es erneut.'}
```

Extract from handler.py lines ~975-1072.

- [ ] **Step 4: Run tests, verify pass, run full suite, commit**

```
feat(tutor): add 3-level fallback chain (primary -> fallback+RAG -> fallback-only)
```

---

### Task 6: Slim handler.py to pure dispatcher

**SAFETY:** Before starting this task:
```bash
git tag pre-tutor-migration
```
If anything breaks after this task: `git reset --hard pre-tutor-migration`

**Files:**
- Modify: `ai/handler.py`
- Test: `tests/test_agent_pipeline.py`

- [ ] **Step 1: Create safety tag**

```bash
git tag pre-tutor-migration
```

- [ ] **Step 2: Write test**

```python
class TestHandlerPureDispatcher:
    def test_no_tutor_special_case(self):
        """Handler should NOT have Tutor-specific branching."""
        import inspect
        from ai.handler import AIHandler
        source = inspect.getsource(AIHandler.get_response_with_rag)
        assert "!= 'tutor'" not in source
        assert '_use_rag_pipeline' not in source
```

- [ ] **Step 3: Run test — expect failure**

- [ ] **Step 4: Replace `get_response_with_rag()` with ~50-line dispatcher**

```python
    def get_response_with_rag(self, user_message, context=None, history=None,
                              mode='compact', callback=None, insights=None):
        """Dispatch user message to the appropriate agent."""
        self._current_request_steps = []
        self._current_step_labels = []
        request_id = getattr(self, '_current_request_id', None)

        self._emit_msg_event("msg_start", {"messageId": request_id or ''})
        self._emit_pipeline_step("orchestrating", "active")

        try:
            session_context = {
                'locked_agent': None,
                'mode': 'card_session' if context and context.get('cardId') else 'free_chat',
                'deck_name': (context or {}).get('deckName', ''),
                'has_card': bool(context and context.get('cardId')),
            }
            routing_result = route_message(user_message, session_context, self.config,
                                            card_context=context, chat_history=history)
            logger.info("Router: agent=%s, method=%s", routing_result.agent, routing_result.method)

            try:
                from .agents import get_agent, get_default_agent, lazy_load_run_fn
            except ImportError:
                from agents import get_agent, get_default_agent, lazy_load_run_fn

            agent_def = get_agent(routing_result.agent)
            if not agent_def:
                agent_def = get_default_agent()
                logger.info("Agent %s not found, using default", routing_result.agent)

            run_fn = lazy_load_run_fn(agent_def)
            clean_msg = routing_result.clean_message or user_message

            return self._dispatch_agent(
                agent_name=agent_def.name,
                run_fn=run_fn,
                situation=clean_msg,
                request_id=request_id,
                on_finished=agent_def.on_finished,
                extra_kwargs={
                    'context': context,
                    'history': history,
                    'mode': mode,
                    'insights': insights,
                    'routing_result': routing_result,
                    'callback': callback,
                    **agent_def.extra_kwargs,
                },
                callback=callback,
                agent_def=agent_def,
            )

        except Exception as e:
            logger.exception("get_response_with_rag error: %s", e)
            error_msg = "Ein Fehler ist aufgetreten. Bitte versuche es erneut."
            if callback:
                callback(error_msg, True, False)
            self._emit_msg_event("msg_done", {"messageId": request_id or ''})
            return error_msg
```

Remove old inline Tutor code (~lines 605-970+), `_rag_router()` wrapper, and any other methods only used by the old Tutor path. Keep: `_emit_pipeline_step`, `_emit_msg_event`, `_emit_ai_event`, `_dispatch_agent`, `is_configured`, `_refresh_config`, `_get_auth_headers`, `_get_google_response_streaming` (needed by tutor.py), `_get_google_response`.

- [ ] **Step 5: Update `_dispatch_agent()` orchestration to handle Tutor routing data**

```python
        routing_result = extra_kwargs.get('routing_result')
        if routing_result and hasattr(routing_result, 'search_needed') and routing_result.search_needed is not None:
            orch_data = {
                'search_needed': routing_result.search_needed,
                'retrieval_mode': routing_result.retrieval_mode or 'agent:%s' % agent_name,
                'scope': 'none',
                'scope_label': routing_result.search_scope or agent_name,
            }
        else:
            orch_data = {
                'search_needed': False,
                'retrieval_mode': 'agent:%s' % agent_name,
                'scope': 'none',
                'scope_label': agent_name,
            }
        self._emit_pipeline_step("orchestrating", "done", orch_data)
```

- [ ] **Step 6: Run tests, verify pass, run full suite, commit**

```
refactor(handler): slim get_response_with_rag to pure dispatcher

Removes ~480 lines of Tutor-specific inline code. All agents including
Tutor now go through _dispatch_agent(). Safety tag: pre-tutor-migration.
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

- [ ] **Step 3: Add `stream_callback=None` to all three agents + model from kwargs for Help**

- [ ] **Step 4: Run tests, verify pass, run full suite, commit**

```
feat(agents): add stream_callback to Help, Research, Plusi
```

---

### Task 8: Final verification

- [ ] **Step 1: Run complete test suite**

Run: `python3 run_tests.py -v`

- [ ] **Step 2: Verify handler is slim**

Run: `wc -l ai/handler.py`

- [ ] **Step 3: Verify no Tutor inline code in handler**

Run: `grep -n "_use_rag_pipeline\|_rag_router\|_rag_retrieve" ai/handler.py`

- [ ] **Step 4: Verify all signatures**

Run: `python3 run_tests.py -v -k "Signature or StreamingReady or ModelSlots"`

- [ ] **Step 5: Remove safety tag if everything works**

```bash
git tag -d pre-tutor-migration
```
