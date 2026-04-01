# Smart Search → Agentic System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the standalone `QuickAnswerThread` → `generate_quick_answer()` path with the real agent pipeline (`handler._dispatch_agent()` with Tutor), so Smart Search uses the same system as session chat — enabling real Handoff, Pipeline-Steps, and Streaming.

**Architecture:** `SearchCardsThread` stays (handles search + clustering + graph edges — this is canvas/visualization logic, not agent logic). `QuickAnswerThread` is replaced by a new `SmartSearchAgentThread` that dispatches the Tutor via `handler._dispatch_agent()`. The Tutor receives the 100 searched cards as pre-loaded RAG context (skipping its own retrieval). Cluster-labeling runs in parallel using `concurrent.futures.ThreadPoolExecutor`. The frontend receives v2 events (`text_chunk`, `agent_cell`, `pipeline_step`) for the answer, and `graph.quickAnswer` for cluster labels only.

**Tech Stack:** Python/PyQt6 (backend thread), React hooks (frontend state)

---

## File Impact Summary

| File | Action | Responsibility |
|------|--------|---------------|
| `ui/widget.py` | Modify (lines 838-868, 3191-3206) | Replace `QuickAnswerThread` with `SmartSearchAgentThread` |
| `ai/handler.py` | Modify (after line 574) | Add `dispatch_smart_search()` public method wrapping `_dispatch_agent()` |
| `ai/tutor.py` | Modify (lines 82, 113-150) | Accept `smart_search_context` kwarg, skip RAG when provided |
| `ai/gemini.py` | Keep (lines 740-916) | `_parse_quick_answer_response()` + `generate_quick_answer()` stay for cluster labels |
| `frontend/src/App.jsx` | Modify (lines 824-831) | Filter `search_*` events from session ReasoningStore + dispatch `smart_search.msg_event` |
| `frontend/src/hooks/useSmartSearch.js` | Modify | Add v2 event listeners for streaming answer |

---

### Task 1: Add `dispatch_smart_search()` to AIHandler

**Files:**
- Modify: `ai/handler.py` (add after `_dispatch_agent()`, after line 574)

This is a thin public wrapper around `_dispatch_agent()` that skips routing and forces the Tutor agent. It accepts pre-loaded search context and passes it through to the Tutor.

- [ ] **Step 1: Add `dispatch_smart_search()` method to `AIHandler`**

Add after `_dispatch_agent()` (after line 574):

```python
    def dispatch_smart_search(self, query, cards_data, cluster_info, request_id=None):
        """Dispatch Tutor agent for Smart Search with pre-loaded card context.

        Skips routing — always uses Tutor. Cards are passed as pre-loaded RAG
        context so the Tutor skips its own retrieval pipeline.

        Args:
            query: The user's search query.
            cards_data: List of card dicts from SearchCardsThread (up to 50).
            cluster_info: Dict of cluster_id -> [card_question_snippets].
            request_id: Optional request ID for v2 event correlation.

        Returns:
            str: The Tutor's response text.
        """
        try:
            from .agents import get_agent, lazy_load_run_fn
        except ImportError:
            from agents import get_agent, lazy_load_run_fn

        agent_def = get_agent('tutor')
        run_fn = lazy_load_run_fn(agent_def)

        self._current_request_id = request_id

        # Build pre-loaded RAG context from search cards
        smart_search_context = {
            'query': query,
            'cards_data': cards_data[:50],
            'cluster_info': cluster_info,
        }

        return self._dispatch_agent(
            agent_name='tutor',
            run_fn=run_fn,
            situation=query,
            request_id=request_id,
            on_finished=agent_def.on_finished,
            extra_kwargs={
                'context': None,
                'history': [],
                'mode': 'compact',
                'smart_search_context': smart_search_context,
                **agent_def.extra_kwargs,
            },
            callback=None,
            agent_def=agent_def,
        )
```

- [ ] **Step 2: Verify handler.py has no syntax errors**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -c "import ast; ast.parse(open('ai/handler.py').read()); print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add ai/handler.py
git commit -m "feat: add dispatch_smart_search() to AIHandler for agentic search"
```

---

### Task 2: Teach Tutor to accept pre-loaded Smart Search context

**Files:**
- Modify: `ai/tutor.py:68-150`

When `smart_search_context` is in kwargs, the Tutor skips RAG retrieval and uses the pre-loaded cards as context instead. It still runs the full generation + handoff pipeline.

- [ ] **Step 1: Add `smart_search_context` extraction in run_tutor()**

In `run_tutor()`, after line 82 (where `embedding_manager` is extracted from kwargs), add:

```python
    smart_search_context = kwargs.get('smart_search_context')
```

- [ ] **Step 2: Replace RAG section (lines 113-150) with smart search branch**

Replace the RAG retrieval block (Section 4, lines 113-150) with:

```python
    # ------------------------------------------------------------------
    # 4. RAG retrieval (or pre-loaded smart search context)
    # ------------------------------------------------------------------
    rag_context = None
    citations = {}

    if smart_search_context:
        # Smart Search: cards already found by SearchCardsThread
        # Build RAG context string from pre-loaded cards
        cards = smart_search_context.get('cards_data', [])
        rag_lines = []
        for i, card in enumerate(cards[:50]):
            q = (card.get('question') or '')[:80]
            a = (card.get('answer') or card.get('deck') or '')[:80]
            rag_lines.append("[%d] %s | %s" % (i + 1, q, a))
        if rag_lines:
            rag_context = {"context_string": "\n".join(rag_lines)}
            # Build citations for card references
            for i, card in enumerate(cards[:50]):
                card_id = card.get('id') or card.get('card_id') or ''
                if card_id:
                    citations[str(card_id)] = {
                        'noteId': str(card_id),
                        'question': (card.get('question') or '')[:60],
                        'source': 'smart_search',
                    }
        if emit_step:
            emit_step("sources_ready", "done", {"citations": citations})
        logger.info("Tutor: using smart_search_context with %d cards", len(cards))
    else:
        # Normal path: RAG retrieval from routing result
        try:
            if routing_result is not None:
                _rag_fn = rag_retrieve_fn
                if _rag_fn is None:
                    _rag_fn = _make_default_rag_retrieve_fn()

                rag_result = retrieve_rag_context(
                    user_message=situation,
                    context=context,
                    config=config,
                    routing_result=routing_result,
                    emit_step=emit_step,
                    embedding_manager=embedding_manager,
                    rag_retrieve_fn=_rag_fn,
                )

                if rag_result.cards_found > 0:
                    rag_context = rag_result.rag_context
                    citations = rag_result.citations
                    logger.debug("Tutor RAG: %s citations", len(citations))
                    if emit_step and citations:
                        emit_step("sources_ready", "done", {"citations": citations})
        except Exception as e:
            logger.warning("Tutor RAG retrieval failed: %s", e)

        # Even without search results, include current card as context
        if not rag_context and context and context.get('cardId'):
            rag_context = _build_current_card_context(context)
            if rag_context:
                citations = rag_context.get('citations', {})
```

- [ ] **Step 3: Verify tutor.py has no syntax errors**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -c "import ast; ast.parse(open('ai/tutor.py').read()); print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add ai/tutor.py
git commit -m "feat: Tutor accepts smart_search_context to skip RAG retrieval"
```

---

### Task 3: Replace QuickAnswerThread with SmartSearchAgentThread

**Files:**
- Modify: `ui/widget.py:838-868` (replace QuickAnswerThread)
- Modify: `ui/widget.py:3191-3200` (update _start_quick_answer)

The new thread follows the same pattern as `AIRequestThread` — it gets an `ai_handler` ref, sets pipeline/msg_event callbacks, and calls `handler.dispatch_smart_search()`. Cluster-labeling runs **in parallel** with the Tutor using `concurrent.futures.ThreadPoolExecutor`.

**Important:** The previous thread is cancelled before starting a new one (prevents interleaved events from concurrent searches).

- [ ] **Step 1: Replace `QuickAnswerThread` class (lines 838-868)**

Replace the entire class with:

```python
class SmartSearchAgentThread(QThread):
    """Dispatch Tutor agent for Smart Search answer + parallel cluster labeling."""
    result_signal = pyqtSignal(str)  # JSON for graph.quickAnswer (cluster labels only)
    pipeline_signal = pyqtSignal(str, str, str, object)
    msg_event_signal = pyqtSignal(str, str, object)
    finished_signal = pyqtSignal(str)
    error_signal = pyqtSignal(str, str)

    def __init__(self, query, cards_data, cluster_info, ai_handler, widget_ref):
        super().__init__()
        self.query = query
        self.cards_data = cards_data
        self.cluster_info = cluster_info
        self._handler_ref = weakref.ref(ai_handler) if ai_handler is not None else None
        self._widget_ref = weakref.ref(widget_ref) if widget_ref is not None else None
        self._request_id = "search_%s" % id(self)
        self._cancelled = False

    def cancel(self):
        self._cancelled = True

    def _generate_cluster_labels(self):
        """Generate cluster labels via LLM (runs in parallel with Tutor)."""
        try:
            try:
                from ..ai.gemini import generate_quick_answer
            except ImportError:
                from ai.gemini import generate_quick_answer
            return generate_quick_answer(
                self.query, self.cards_data, cluster_labels=self.cluster_info
            )
        except Exception:
            logger.exception("Cluster labeling failed for: %s", self.query)
            return {"clusterLabels": {}, "clusterSummaries": {}, "cardRefs": {}}

    def run(self):
        handler = self._handler_ref() if self._handler_ref else None
        if handler is None:
            logger.warning("SmartSearchAgentThread: handler destroyed, aborting")
            return

        try:
            # Wire up pipeline/msg_event callbacks (same pattern as AIRequestThread)
            def pipeline_callback(step, status, data):
                if not self._cancelled:
                    self.pipeline_signal.emit(self._request_id, step, status, data or {})

            def msg_event_callback(event_type, data):
                if not self._cancelled:
                    self.msg_event_signal.emit(self._request_id, event_type, data or {})

            handler._pipeline_signal_callback = pipeline_callback
            handler._msg_event_callback = msg_event_callback

            # Run Tutor + cluster labeling in parallel
            from concurrent.futures import ThreadPoolExecutor, as_completed

            with ThreadPoolExecutor(max_workers=2) as pool:
                # 1. Tutor agent answer (blocking, streams via callbacks)
                tutor_future = pool.submit(
                    handler.dispatch_smart_search,
                    query=self.query,
                    cards_data=self.cards_data,
                    cluster_info=self.cluster_info,
                    request_id=self._request_id,
                )

                # 2. Cluster labels (parallel LLM call)
                label_future = None
                if self.cluster_info:
                    label_future = pool.submit(self._generate_cluster_labels)

                # Wait for both
                tutor_future.result()  # raises on error

                if label_future and not self._cancelled:
                    label_result = label_future.result()
                    self.result_signal.emit(json.dumps({
                        "type": "graph.quickAnswer",
                        "data": {
                            "clusterLabels": label_result.get("clusterLabels", {}),
                            "clusterSummaries": label_result.get("clusterSummaries", {}),
                            "cardRefs": label_result.get("cardRefs", {}),
                        }
                    }))

            if not self._cancelled:
                self.finished_signal.emit(self._request_id)

        except Exception as e:
            if not self._cancelled:
                logger.exception("SmartSearchAgentThread failed: %s", self.query)
                self.error_signal.emit(self._request_id, str(e))
                # Emit error to frontend so user sees feedback
                self.result_signal.emit(json.dumps({
                    "type": "graph.quickAnswer",
                    "data": {"answer": "", "answerable": False, "clusterLabels": {}}
                }))
        finally:
            if handler:
                handler._pipeline_signal_callback = None
                handler._msg_event_callback = None
```

- [ ] **Step 2: Update `_start_quick_answer()` (lines 3191-3200)**

Replace with:

```python
    def _start_quick_answer(self, query, cards_data, clusters):
        """Launch SmartSearchAgentThread after search completes (must be called on main thread)."""
        logger.info("Starting smart search agent for: %s (%d cards, %d clusters)", query, len(cards_data), len(clusters))

        # Cancel any in-flight search agent thread
        if hasattr(self, '_quick_answer_thread') and self._quick_answer_thread and self._quick_answer_thread.isRunning():
            self._quick_answer_thread.cancel()

        cluster_info = {}
        for c in clusters:
            cluster_info[c["id"]] = [card.get("question", "")[:40] for card in c.get("cards", [])[:3]]

        # Get AI handler
        try:
            from ..ai.handler import get_ai_handler
        except ImportError:
            from ai.handler import get_ai_handler
        ai_handler = get_ai_handler(self)

        # Ensure cards have an 'answer' field for Tutor context
        for card in cards_data:
            if 'answer' not in card:
                card['answer'] = card.get('deck', '')

        self._quick_answer_thread = SmartSearchAgentThread(
            query, cards_data, cluster_info, ai_handler, self
        )
        self._quick_answer_thread.result_signal.connect(self._on_quick_answer_result)
        self._quick_answer_thread.pipeline_signal.connect(self.on_pipeline_step)
        self._quick_answer_thread.msg_event_signal.connect(self.on_msg_event)
        self._quick_answer_thread.error_signal.connect(
            lambda req_id, err: logger.error("SmartSearch agent error: %s", err)
        )
        self._quick_answer_thread.start()
```

- [ ] **Step 3: Verify widget.py has no syntax errors**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -c "import ast; ast.parse(open('ui/widget.py').read()); print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add ui/widget.py
git commit -m "feat: replace QuickAnswerThread with SmartSearchAgentThread

Uses handler.dispatch_smart_search() for Tutor agent pipeline.
Cluster labeling runs in parallel via ThreadPoolExecutor.
Cancels in-flight threads on new search."
```

---

### Task 4: Frontend — filter search events from session ReasoningStore + dispatch for useSmartSearch

**Files:**
- Modify: `frontend/src/App.jsx:705-850`

The `SmartSearchAgentThread` emits `pipeline_step`, `text_chunk`, `agent_cell`, `msg_done` events with `search_*` request IDs. These flow through `ankiReceive` in `App.jsx` where three separate handlers would dispatch them into the session ReasoningStore:
1. `pipeline_step` handler at lines 705-732
2. `text_chunk`/`streaming` handler at lines 824-831
3. `msg_done`/`msg_error`/`msg_cancelled` handlers at lines 833-850

We need to intercept ALL of these for `search_*` IDs and redirect to a `smart_search.msg_event` CustomEvent.

- [ ] **Step 1: Add search event guard BEFORE the pipeline_step handler (line 705)**

Insert before `if (payload.type === 'pipeline_step')` at line 705:

```javascript
      // Smart Search events — route to useSmartSearch, NOT to session reasoning store
      const _ssReqId = payload.requestId || payload.messageId || '';
      if (_ssReqId.startsWith('search_') && [
        'pipeline_step', 'text_chunk', 'streaming', 'agent_cell',
        'orchestration', 'msg_start', 'msg_done', 'msg_error', 'msg_cancelled'
      ].includes(payload.type)) {
        window.dispatchEvent(new CustomEvent('smart_search.msg_event', { detail: payload }));
        return;  // Don't let search events pollute session reasoning store
      }
```

This single guard covers all three handler blocks because it `return`s early, preventing any of lines 705-850 from running for `search_*` events.

- [ ] **Step 2: Commit**

```bash
cd frontend && git add src/App.jsx
git commit -m "feat: route search_* v2 events to smart_search.msg_event, skip ReasoningStore"
```

---

### Task 5: Frontend — receive streaming answer via v2 events

**Files:**
- Modify: `frontend/src/hooks/useSmartSearch.js`

The Tutor's answer now arrives as `text_chunk` events (streamed) via `smart_search.msg_event` CustomEvents (dispatched by App.jsx in Task 4). The `graph.quickAnswer` event still comes but now only carries cluster labels/summaries (no answer text).

- [ ] **Step 1: Add streaming answer accumulation to useSmartSearch**

Add new state variables at the top of the hook (after `termDefinition`):

```javascript
  const [isAnswerStreaming, setIsAnswerStreaming] = useState(false);
  const answerChunksRef = useRef('');
```

Add a new event handler inside the `useEffect` block (after `onTermDefinition`, before event listener registrations):

```javascript
    const onSmartSearchMsgEvent = (e) => {
      const data = e.detail;
      if (!data) return;

      if (data.type === 'text_chunk' && data.chunk) {
        answerChunksRef.current += data.chunk;
        setAnswerText(answerChunksRef.current);
        setIsAnswerStreaming(true);
      }

      if (data.type === 'msg_done') {
        setIsAnswerStreaming(false);
      }
    };
```

Register the listener (alongside the existing ones):
```javascript
    window.addEventListener('smart_search.msg_event', onSmartSearchMsgEvent);
```

And in the cleanup:
```javascript
    window.removeEventListener('smart_search.msg_event', onSmartSearchMsgEvent);
```

- [ ] **Step 2: Reset streaming state on new search**

In the `search()` callback, add after the existing resets (after `setCardRefs(null)`):

```javascript
    answerChunksRef.current = '';
    setIsAnswerStreaming(false);
```

- [ ] **Step 3: Update `onQuickAnswer` to ignore answer field**

The `graph.quickAnswer` event now only carries cluster data. Update:

```javascript
    const onQuickAnswer = (e) => {
      const data = e.detail;
      // Answer now comes via text_chunk streaming — only use cluster data from here
      if (data?.clusterLabels && Object.keys(data.clusterLabels).length > 0) {
        setClusterLabels(data.clusterLabels);
      }
      if (data?.clusterSummaries && Object.keys(data.clusterSummaries).length > 0) {
        setClusterSummaries(data.clusterSummaries);
      }
      if (data?.cardRefs && Object.keys(data.cardRefs).length > 0) {
        setCardRefs(data.cardRefs);
      }
    };
```

- [ ] **Step 4: Export `isAnswerStreaming` and reset in `reset()`**

Add to the `reset()` callback:
```javascript
    answerChunksRef.current = '';
    setIsAnswerStreaming(false);
```

Add `isAnswerStreaming` to the return object.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/hooks/useSmartSearch.js
git commit -m "feat: useSmartSearch receives streaming answer via smart_search.msg_event"
```

---

### Task 6: Integration test — end-to-end verification

**Files:**
- No new files — build + test

- [ ] **Step 1: Build frontend**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Verify Python syntax**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -c "import ast; [ast.parse(open(f).read()) for f in ['ai/handler.py', 'ai/tutor.py', 'ui/widget.py']]; print('All OK')"`
Expected: `All OK`

- [ ] **Step 3: Run Python tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py`
Expected: All tests pass

- [ ] **Step 4: Run frontend tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm test`
Expected: All tests pass

- [ ] **Step 5: Manual test in Anki**

1. Restart Anki
2. Go to Stapel tab
3. Search "Cortisol" (or any topic with cards)
4. Verify:
   - Pipeline steps appear in sidebar (orchestrating → generating)
   - Answer streams progressively (not one-shot)
   - Cluster labels appear (may arrive before or after answer — parallel)
   - Cluster summaries populate when drilling down
   - Card reference badges [1][2] are clickable
   - KG subgraph loads in Begriffe tab
   - Starting a new search while previous is running doesn't cause errors
5. Test error case: search for nonsense query → should get empty/error response
6. Test concurrent safety: while smart search is running, switch to session tab and send a chat message — verify both work independently (no interleaved events)

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: Smart Search uses agentic Tutor pipeline for answers

Replaces standalone generate_quick_answer() with handler.dispatch_smart_search()
which routes through the full Tutor agent pipeline. Enables:
- Real streaming (text_chunk events)
- Pipeline-Steps visible in ReasoningDisplay
- Handoff capability (Tutor → Research)
- Agent Memory tracking

Cluster labeling runs in parallel via ThreadPoolExecutor.
SearchCardsThread unchanged (visualization logic).
search_* events filtered from session ReasoningStore."
```

---

## Known Limitations

- **Shared handler callback state:** `handler._pipeline_signal_callback` and `handler._msg_event_callback` are single slots on the AIHandler singleton. If a session chat `AIRequestThread` and a `SmartSearchAgentThread` run concurrently, callbacks will overwrite each other. This is a pre-existing pattern (same issue exists between any two `AIRequestThread` instances). Future fix: use a dict of callbacks keyed by request_id.

## What This Enables (Future Work)

After this plan is complete:
- **Handoff works automatically** — Tutor can signal `HANDOFF: research` when cards don't suffice
- **Other agents can handle searches** — Research agent could be dispatched for web-first queries
- **Pipeline steps are real** — no more simulated steps, same system as session chat
- **Streaming feels alive** — answer builds progressively, not one-shot after delay
