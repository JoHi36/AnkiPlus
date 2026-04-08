# Auto Web-Search (Perplexity) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the RAG pipeline's confidence is `'low'` (RRF top score < 0.012), automatically call Perplexity Sonar via the `/research` backend endpoint and inject the web results into the LLM context. No LLM tool — the decision is mathematical.

**Architecture:** The RAG pipeline (`rag_pipeline.py`) already receives a `confidence` field from retrieval. Currently it's ignored. We add a check: if `confidence === 'low'`, call the backend `/research` endpoint (Perplexity Sonar), format the results, and append them to the `rag_context` string. The LLM sees both card results AND web results. The `search_web`, `search_pubmed`, `search_wikipedia` tools are removed from the Tutor agent — web search is pipeline behavior, not a tool.

**Tech Stack:** Python (requests), Backend (Perplexity Sonar via OpenRouter)

**Scope:** Applies to the entire RAG pipeline — all channels that use RAG (Tutor, Prüfer) get automatic Perplexity fallback. Only Perplexity Sonar, no other web source.

---

## File Structure

### Modified files
- `ai/rag_pipeline.py` — Add Perplexity call when confidence is low
- `ai/agents.py` — Remove `search_web`, `search_pubmed`, `search_wikipedia` from Tutor tools
- `ai/tutor.py` — Remove web tool marker collection logic (no longer needed)

### Kept (unchanged)
- `ai/rrf.py` — Confidence thresholds already correct (CONFIDENCE_LOW = 0.012)
- `ai/retrieval.py` — Already returns `confidence` in result dict
- `functions/src/handlers/research.ts` — Backend endpoint stays as-is

---

## Task 1: Add Perplexity auto-call to rag_pipeline.py

**Files:**
- Modify: `ai/rag_pipeline.py`

- [ ] **Step 1: Read current rag_pipeline.py to understand the flow**

Find `retrieve_rag_context()` — the main function. It calls the retrieval function and returns `RagResult`. The retrieval result dict has a `confidence` field that we need to check.

- [ ] **Step 2: Add Perplexity call function**

Add a helper function that calls the backend `/research` endpoint:

```python
def _call_perplexity(query, auth_token=None, backend_url=None):
    """Call Perplexity Sonar via backend /research endpoint.
    
    Returns: dict with 'text' (answer with [N] citations) and 'sources' list,
             or None on failure.
    """
    try:
        import requests as _requests
    except ImportError:
        return None
    
    try:
        from ..config import get_backend_url, get_auth_token
    except ImportError:
        from config import get_backend_url, get_auth_token
    
    _url = backend_url or get_backend_url()
    _token = auth_token or get_auth_token()
    if not _url or not _token:
        return None
    
    try:
        response = _requests.post(
            '%s/research' % _url.rstrip('/'),
            json={'message': query[:500]},
            headers={
                'Content-Type': 'application/json',
                'Authorization': 'Bearer %s' % _token,
            },
            timeout=15,
        )
        response.raise_for_status()
        data = response.json()
        return {
            'text': data.get('text', ''),
            'sources': data.get('sources', []),
            'tokens': data.get('tokens', {}),
        }
    except Exception as e:
        logger.warning("Perplexity auto-search failed: %s", e)
        return None
```

- [ ] **Step 3: Add confidence check + Perplexity call after retrieval**

In `retrieve_rag_context()`, after the retrieval result is received, check confidence:

```python
# After: result = retriever.retrieve(...)
confidence = result.get('confidence', 'medium')

# Auto web search when card results are weak
web_context = None
if confidence == 'low' and emit_step:
    emit_step('web_search', 'active', {'query': user_message})
    web_result = _call_perplexity(user_message)
    if web_result and web_result.get('text'):
        web_context = web_result
        emit_step('web_search', 'done', {
            'source_count': len(web_result.get('sources', [])),
        })
    else:
        emit_step('web_search', 'done', {'source_count': 0})
```

- [ ] **Step 4: Inject web context into rag_context string**

If `web_context` is not None, append it to the `rag_context` string:

```python
if web_context:
    rag_context += '\n\n--- WEB-RECHERCHE (Perplexity) ---\n'
    rag_context += web_context['text']
    if web_context.get('sources'):
        rag_context += '\n\nWeb-Quellen:\n'
        for i, src in enumerate(web_context['sources'], 1):
            url = src.get('url', '')
            title = src.get('title', url)
            rag_context += '[[WEB:%d]] %s (%s)\n' % (i, title, url)
```

- [ ] **Step 5: Pass web sources through to result**

Make sure the web sources are included in the `RagResult` (or however the pipeline returns data) so they can be displayed in the frontend:

```python
rag_result.web_sources = web_context.get('sources', []) if web_context else []
```

- [ ] **Step 6: Run tests**

```bash
cd "/path/to/AnkiPlus_main" && python3 run_tests.py 2>&1 | tail -5
```

- [ ] **Step 7: Commit**

```bash
git add ai/rag_pipeline.py
git commit -m "feat: auto Perplexity web search when RAG confidence is low"
```

---

## Task 2: Remove web search tools from Tutor agent

**Files:**
- Modify: `ai/agents.py`

- [ ] **Step 1: Remove web tools from Tutor tools list**

In the Tutor agent registration, find:
```python
tools=[
    'search_deck', 'show_card', 'show_card_media',
    'search_image', 'create_mermaid_diagram',
    'get_learning_stats', 'compact',
    'search_web', 'search_pubmed', 'search_wikipedia',
],
```

Remove the last three:
```python
tools=[
    'search_deck', 'show_card', 'show_card_media',
    'search_image', 'create_mermaid_diagram',
    'get_learning_stats', 'compact',
],
```

- [ ] **Step 2: Remove web tool Slots from Tutor workflows**

In the `explain` workflow's tools list, remove:
```python
Slot(ref='search_web', mode='on'),
Slot(ref='search_pubmed', mode='on'),
Slot(ref='search_wikipedia', mode='on'),
```

- [ ] **Step 3: Remove the main_model_hint from Research agent**

The `main_model_hint` on the Research agent told the LLM when to use `search_web`. Since there's no search_web tool anymore, remove it:

```python
main_model_hint='',  # No longer needed — web search is automatic pipeline behavior
```

- [ ] **Step 4: Run tests**

```bash
python3 run_tests.py 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add ai/agents.py
git commit -m "refactor: remove web search tools from Tutor — web search is now automatic pipeline behavior"
```

---

## Task 3: Clean up Tutor web tool marker logic

**Files:**
- Modify: `ai/tutor.py`

- [ ] **Step 1: Remove web tool marker collection**

In `run_tutor()`, find and remove:
```python
_web_tool_markers = []  # Collect search_web/pubmed/wikipedia tool results
```

And the chunk collection:
```python
if isinstance(chunk, str) and '[[TOOL:' in chunk and 'search_web' in chunk:
    _web_tool_markers.append(chunk)
```

And the webSources extraction at the end:
```python
for marker in _web_tool_markers:
    # ... parse web sources from tool markers
```

Since web search results now come from the pipeline (not from LLM tool calls), this code is dead.

- [ ] **Step 2: Instead, pass web_sources from RAG result**

If the RAG result includes `web_sources` (from Task 1), include them in the tutor's return dict:

```python
result = {
    'text': final_text,
    'citations': citations,
    '_used_streaming': stream_callback is not None,
}
if rag_result and hasattr(rag_result, 'web_sources') and rag_result.web_sources:
    result['webSources'] = rag_result.web_sources
```

- [ ] **Step 3: Run tests**

```bash
python3 run_tests.py 2>&1 | tail -5
```

- [ ] **Step 4: Build frontend**

```bash
cd frontend && npm run build 2>&1 | tail -3
```

- [ ] **Step 5: Commit**

```bash
git add ai/tutor.py
git commit -m "refactor: remove web tool marker logic from tutor — web results come from pipeline"
```

---

## Task 4: ThinkingIndicator — Web-Recherche phase

**Files:**
- Modify: `frontend/src/hooks/useThinkingPhases.ts`

The ThinkingIndicator already handles a `web_search` step in the phase mapping. Verify it works:

- [ ] **Step 1: Check that web_search step is handled**

In `useThinkingPhases.ts`, verify that the `WEB_STEPS` set includes `'web_search'` and that the optional Web-Recherche phase is correctly inserted between Wissensabgleich and the channel-specific step.

The existing code should already handle this. Just verify.

- [ ] **Step 2: Test with a query that triggers low confidence**

Ask something completely off-topic from the user's cards (e.g., "warum ist die banane krumm" with a medical card deck). Verify:
1. RAG finds cards with low confidence
2. Perplexity is automatically called
3. ThinkingIndicator shows: `Kontextanalyse → Wissensabgleich → Web-Recherche · N Quellen → Synthese`
4. Answer includes web-sourced information

- [ ] **Step 3: Commit (if changes needed)**

```bash
git add frontend/src/hooks/useThinkingPhases.ts
git commit -m "feat: ThinkingIndicator shows Web-Recherche phase for auto Perplexity"
```

---

## Verification Checklist

- [ ] `python3 run_tests.py` — all Python tests pass
- [ ] `cd frontend && npm run build` — builds without errors
- [ ] Manual test: Medical question on medical deck → NO web search (confidence high)
- [ ] Manual test: Off-topic question (e.g., "banane krumm") → Web search triggered (confidence low)
- [ ] Manual test: ThinkingIndicator shows Web-Recherche step when triggered
- [ ] Manual test: Answer includes Perplexity-sourced information with web citations
- [ ] Verify: Tutor has NO search_web/search_pubmed/search_wikipedia tools
- [ ] Verify: No `[[TOOL:search_web]]` markers in responses
