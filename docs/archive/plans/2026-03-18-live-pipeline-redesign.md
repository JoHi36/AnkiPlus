# Live Pipeline Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the intent-based RAG pipeline with a simplified router + hybrid retrieval system, and rebuild the ThoughtStream UI with phase-specific animations.

**Architecture:** Backend emits granular `pipeline_step` events (replacing `ai_state`) as each phase completes. Frontend renders an "Active Box + Done Stack" UI where the current step animates on top, and completed steps shrink into a reverse-chronological list below. The router no longer classifies intents — it only decides search_needed, retrieval_mode, and synthesizes an embedding query.

**Tech Stack:** Python/PyQt6 (backend), React 18 + TypeScript + framer-motion + Tailwind/DaisyUI (frontend), Firebase Cloud Functions (router endpoint), Gemini API (router model + embeddings)

**Spec:** `docs/superpowers/specs/2026-03-18-live-pipeline-redesign.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `ai_handler.py` | Modify | New `_emit_pipeline_step()`, rewrite `_rag_router()` prompt, pass `embedding_query` to retrieval, store `_current_request_id` |
| `hybrid_retrieval.py` | Modify | Use `embedding_query` instead of `user_message`, emit per-step `pipeline_step` events, add chunk previews for semantic results |
| `widget.py` | Modify (minor) | Pass `request_id` into `ai_handler`, no structural changes |
| `functions/src/handlers/router.ts` | Modify | New prompt without intent, add `embedding_query` + `lastAssistantMessage` to schema |
| `shared/components/ThoughtStream.tsx` | Rewrite | Active Box + Done Stack with phase-specific animations |
| `frontend/src/hooks/useChat.js` | Modify | Handle `pipeline_step` event type, replace `ai_state` handling |
| `frontend/src/App.jsx` | Modify (minor) | Route `pipeline_step` events to chat hook |

---

## Task 1: Backend — New `_emit_pipeline_step` method

**Files:**
- Modify: `ai_handler.py:2026-2088` (current `_emit_ai_state`)

This task adds the new event emitter alongside the existing one. We keep `_emit_ai_state` temporarily for backward compat — it will be removed when all callers are migrated.

- [ ] **Step 1: Add `_emit_pipeline_step` method to AIHandler**

Add this method directly after `_emit_ai_state` (after line ~2088 in `ai_handler.py`):

```python
def _emit_pipeline_step(self, step, status, data=None):
    """Emit a pipeline_step event to the frontend.

    Args:
        step: Step name ('router', 'sql_search', 'semantic_search', 'merge', 'generating')
        status: 'active', 'done', or 'error'
        data: Optional dict with step-specific data
    """
    request_id = getattr(self, '_current_request_id', None)
    payload = {
        "type": "pipeline_step",
        "requestId": request_id,
        "step": step,
        "status": status,
        "data": data or {}
    }

    # Record step label for persistence (only on 'done')
    if status == 'done':
        label = self._step_done_label(step, data)
        if not hasattr(self, '_current_step_labels'):
            self._current_step_labels = []
        self._current_step_labels.append(label)

    try:
        from aqt import mw
        if mw and hasattr(mw, 'taskman'):
            import json
            js = f"window.ankiReceive({json.dumps(payload)});"
            mw.taskman.run_on_main(lambda: self.widget.web_view.page().runJavaScript(js) if self.widget and self.widget.web_view else None)
    except Exception as e:
        print(f"⚠️ _emit_pipeline_step error: {e}")

def _step_done_label(self, step, data):
    """Generate a human-readable label for a completed step."""
    data = data or {}
    if step == 'router':
        mode = data.get('retrieval_mode', '')
        scope = data.get('scope_label', '')
        return f"Anfrage analysiert — {mode.capitalize()}, {scope}" if scope else f"Anfrage analysiert — {mode.capitalize()}"
    elif step == 'sql_search':
        return f"Keyword-Suche — {data.get('total_hits', 0)} Treffer"
    elif step == 'semantic_search':
        return f"Semantische Suche — {data.get('total_hits', 0)} Treffer"
    elif step == 'merge':
        t = data.get('total', 0)
        k = data.get('keyword_count', 0)
        s = data.get('semantic_count', 0)
        return f"Quellen kombiniert — {t} ({k}K + {s}S)"
    elif step == 'generating':
        return "Antwort generiert"
    return step
```

- [ ] **Step 2: Initialize `_current_request_id` in `AIHandler.__init__` and `get_response_with_rag`**

In `AIHandler.__init__` (line ~174, where `_current_request_steps = []` is initialized), add:

```python
self._current_request_id = None
self._current_step_labels = []
```

At `ai_handler.py` line ~3198 (where `_current_request_steps = []` is reset at start of `get_response_with_rag`), add:

```python
self._current_request_steps = []
self._current_step_labels = []
# _current_request_id is set by widget before calling this method
```

Also remove the duplicate `_emit_ai_state("Analysiere Anfrage...", phase=PHASE_INTENT)` call at line ~3203 in `get_response_with_rag` (this is now handled by `_emit_pipeline_step("router", "active")` inside `_rag_router`).

And in the `enhanced_callback` (line ~3298), pass `step_labels` alongside `steps`:

```python
def enhanced_callback(chunk, done, is_function_call=False):
    if done:
        self._emit_pipeline_step("generating", "done")
        if callback:
            callback(chunk, done, is_function_call,
                     steps=self._current_request_steps,
                     citations=citations,
                     step_labels=getattr(self, '_current_step_labels', []))
    else:
        if callback:
            callback(chunk, done, is_function_call)
```

- [ ] **Step 3: Update `AIRequestThread.stream_callback` signature in `widget.py`**

At `widget.py` line 91, update to accept `step_labels`:

```python
def stream_callback(chunk, done, is_function_call=False, steps=None, citations=None, step_labels=None):
    if self._cancelled:
        return
    self.chunk_signal.emit(self.request_id, chunk or "", done, is_function_call)
    if done and (steps or citations):
        self.metadata_signal.emit(self.request_id, steps or [], citations or [], step_labels or [])
```

Update `metadata_signal` signature at line 71:
```python
metadata_signal = pyqtSignal(str, object, object, object)  # requestId, steps, citations, step_labels
```

Update `on_streaming_metadata` at line 838:
```python
def on_streaming_metadata(self, request_id, steps, citations, step_labels):
    payload = {
        "type": "metadata",
        "requestId": request_id,
        "steps": steps,
        "citations": [c if isinstance(c, dict) else c for c in (citations or [])],
        "stepLabels": step_labels or []
    }
    self._send_to_js(payload)
```

- [ ] **Step 4: Store request_id on ai_handler instance**

In `widget.py` `handle_message_from_ui` (line ~786), after getting the ai_handler, set the request_id:

```python
ai = get_ai_handler(widget=self)
ai._current_request_id = request_id  # Store for pipeline_step events
```

- [ ] **Step 5: Verify the pipeline_step events can be emitted**

Start Anki, send a message. Check the console/terminal for `_emit_pipeline_step` calls (they won't be called yet since no caller uses them, but ensure no import errors).

- [ ] **Step 6: Commit**

```bash
git add ai_handler.py widget.py
git commit -m "feat(pipeline): add _emit_pipeline_step event emitter and request_id plumbing"
```

---

## Task 2: Backend — Rewrite Router Prompt

**Files:**
- Modify: `ai_handler.py:2090-2758` (current `_rag_router`)
- Modify: `functions/src/handlers/router.ts`

- [ ] **Step 1: Rewrite the direct-API router prompt in `_rag_router`**

Replace the router prompt section (lines ~2163-2236 in `ai_handler.py`) with the new simplified prompt. The new prompt:
- Removes all intent classification
- Adds `embedding_query` field to output
- Includes `lastAssistantMessage` in context
- Includes card `tags`

```python
router_prompt = f"""Du bist ein Such-Router für eine Lernkarten-App. Entscheide ob und wie gesucht werden soll.

Benutzer-Nachricht: "{user_message}"
{f'Letzte Antwort: "{last_assistant_message[:200]}"' if last_assistant_message else ''}

Karten-Kontext:
- Frage: {card_question}
- Antwort: {card_answer}
- Deck: {deck_name}
- Tags: {', '.join(card_tags) if card_tags else 'keine'}
{extra_fields}

Antworte NUR mit JSON:
{{
  "search_needed": true/false,
  "retrieval_mode": "sql" | "semantic" | "both",
  "embedding_query": "semantisch reicher Suchtext aus Kartenkontext + Frage synthetisiert",
  "precise_queries": ["keyword1 AND keyword2", ...],
  "broad_queries": ["keyword1 OR keyword2", ...],
  "search_scope": "current_deck" | "collection"
}}

REGELN:
- search_needed=false bei Smalltalk, Danke, Meta-Fragen
- embedding_query: Synthese aus Karteninhalt + Benutzerfrage. NIEMALS die Benutzerfrage wörtlich verwenden.
  Beispiel: Frage="Was ist das?", Karte="Mitochondrium" → embedding_query="Mitochondrium Zellatmung Organell Funktion"
- precise_queries: 2-3 AND-Queries aus Karten-Keywords (nicht aus Benutzerfrage)
- broad_queries: 2-3 OR-Queries für breitere Suche
- search_scope: "current_deck" als Default, "collection" nur bei fächerübergreifenden Fragen
- retrieval_mode: "both" als Default, "sql" für exakte Fakten, "semantic" für konzeptuelle Fragen"""
```

- [ ] **Step 2: Fetch `lastAssistantMessage` from session storage**

At the start of `_rag_router`, before building the prompt, retrieve the last bot message:

```python
last_assistant_message = ""
try:
    try:
        from . import card_sessions_storage
    except ImportError:
        import card_sessions_storage
    if context and context.get('cardId'):
        session_data = card_sessions_storage.load_card_session(context['cardId'])
        messages = session_data.get('messages', [])
        for msg in reversed(messages):
            if msg.get('sender') == 'bot':
                last_assistant_message = (msg.get('text', '') or '')[:300]
                break
except Exception:
    pass
```

- [ ] **Step 3: Extract card tags from context**

After card content extraction (line ~2156), add:

```python
card_tags = []
if context and context.get('tags'):
    card_tags = context['tags']
elif context and context.get('cardId'):
    try:
        from aqt import mw
        card = mw.col.get_card(context['cardId'])
        note = card.note()
        card_tags = list(note.tags)
    except Exception:
        pass
```

- [ ] **Step 4: Emit `pipeline_step` events in `_rag_router`**

Replace `_emit_ai_state("Analysiere Anfrage...", phase=PHASE_INTENT)` (line ~2120) with:

```python
self._emit_pipeline_step("router", "active")
```

After successful router parse, before returning:

```python
scope_label = ""
if deck_name:
    scope_label = deck_name.split("::")[-1]  # Last segment of deck path

self._emit_pipeline_step("router", "done", {
    "search_needed": router_result.get("search_needed", True),
    "retrieval_mode": router_result.get("retrieval_mode", "both"),
    "scope": router_result.get("search_scope", "current_deck"),
    "scope_label": scope_label
})
```

- [ ] **Step 4b: Include `lastAssistantMessage` in backend-mode router payload**

In `_rag_router`, in the backend mode path (lines ~2239-2302), where the `router_payload` is built for the Cloud Function POST, add `lastAssistantMessage`:

```python
router_payload = {
    "message": user_message,
    "cardContext": {
        "question": card_question,
        "answer": card_answer,
        "deckName": deck_name,
        "tags": card_tags
    },
    "lastAssistantMessage": last_assistant_message
}
```

- [ ] **Step 5: Update router output parsing to handle new schema**

Update the JSON parsing section to handle the new fields. The router no longer returns `intent` — remove any validation/fallback that expects it. Add `embedding_query` to the extracted fields:

```python
result = {
    "search_needed": parsed.get("search_needed", True),
    "retrieval_mode": parsed.get("retrieval_mode", "both"),
    "embedding_query": parsed.get("embedding_query", ""),
    "precise_queries": parsed.get("precise_queries", []),
    "broad_queries": parsed.get("broad_queries", []),
    "search_scope": parsed.get("search_scope", "current_deck"),
}
```

- [ ] **Step 6: Update Cloud Function router.ts**

Replace the prompt and response handling in `functions/src/handlers/router.ts`:

```typescript
const { message, cardContext, lastAssistantMessage } = req.body;

let contextInfo = '';
if (cardContext) {
  contextInfo = `\nKarten-Kontext:\n- Frage: ${cardContext.question || ''}\n- Antwort: ${cardContext.answer || ''}\n- Deck: ${cardContext.deckName || ''}\n- Tags: ${(cardContext.tags || []).join(', ')}`;
}
if (lastAssistantMessage) {
  contextInfo += `\nLetzte Antwort: "${lastAssistantMessage.substring(0, 200)}"`;
}

const prompt = `Du bist ein Such-Router für eine Lernkarten-App. Entscheide ob und wie gesucht werden soll.

Benutzer-Nachricht: "${message}"${contextInfo}

Antworte NUR mit JSON:
{
  "search_needed": true/false,
  "retrieval_mode": "sql|semantic|both",
  "embedding_query": "semantisch reicher Suchtext",
  "precise_queries": ["keyword1 AND keyword2", ...],
  "broad_queries": ["keyword1 OR keyword2", ...],
  "search_scope": "current_deck|collection"
}

REGELN:
- search_needed=false bei Smalltalk, Danke, Meta-Fragen
- embedding_query: Synthese aus Karteninhalt + Benutzerfrage. NIEMALS Benutzerfrage wörtlich verwenden.
- precise_queries: 2-3 AND-Queries aus Karten-Keywords
- broad_queries: 2-3 OR-Queries für breitere Suche
- search_scope: "current_deck" als Default
- retrieval_mode: "both" als Default`;
```

- [ ] **Step 7: Commit**

```bash
git add ai_handler.py functions/src/handlers/router.ts
git commit -m "feat(router): simplify to search_needed + embedding_query, remove intent system"
```

---

## Task 3: Backend — Granular Pipeline Events in Hybrid Retrieval

**Files:**
- Modify: `hybrid_retrieval.py` (full file)
- Modify: `ai_handler.py:3180-3399` (`get_response_with_rag`)

- [ ] **Step 1: Update `retrieve()` to use `embedding_query` and emit pipeline_step events**

Rewrite `hybrid_retrieval.py` `retrieve()` method:

```python
def retrieve(self, user_message, router_result, context=None, max_notes=10):
    if not router_result.get('search_needed', False):
        return {"context_string": "", "citations": {}}

    mode = router_result.get('retrieval_mode', 'both')
    sql_citations = {}
    semantic_results = []
    sql_total = 0
    semantic_total = 0

    # SQL retrieval
    if mode in ('sql', 'both'):
        try:
            self.ai._emit_pipeline_step("sql_search", "active")
            sql_data = self.ai._rag_retrieve_cards(
                precise_queries=router_result.get('precise_queries'),
                broad_queries=router_result.get('broad_queries'),
                search_scope=router_result.get('search_scope', 'current_deck'),
                context=context,
                max_notes=max_notes
            )
            sql_citations = sql_data.get('citations', {})
            sql_total = len(sql_citations)

            # Build query result data for UI
            query_data = []
            # Parse from _current_request_steps to extract query results
            for step in self.ai._current_request_steps:
                state = step.get('state', '')
                if 'Ergebnis:' in state:
                    import re
                    m = re.match(r'Ergebnis:\s*(\d+)\s*Treffer\s*für\s*\'(.*?)\'', state)
                    if m:
                        query_data.append({"text": m.group(2), "hits": int(m.group(1))})

            self.ai._emit_pipeline_step("sql_search", "done", {
                "queries": query_data,
                "total_hits": sql_total
            })
        except Exception as e:
            print(f"⚠️ HybridRetrieval: SQL retrieval failed: {e}")
            self.ai._emit_pipeline_step("sql_search", "error", {"message": str(e)})

    # Semantic retrieval — use embedding_query from router
    if mode in ('semantic', 'both') and self.emb:
        try:
            self.ai._emit_pipeline_step("semantic_search", "active")
            embedding_query = router_result.get('embedding_query', user_message)
            query_embeddings = self.emb.embed_texts([embedding_query])
            if query_embeddings:
                exclude = []
                if context and context.get('cardId'):
                    exclude.append(context['cardId'])
                semantic_results = self.emb.search(
                    query_embeddings[0],
                    top_k=max_notes,
                    exclude_card_ids=exclude
                )
                semantic_total = len(semantic_results)

                # Build chunk previews for top 3
                chunks = []
                for card_id, score in semantic_results[:3]:
                    card_data = self._load_card_data(card_id)
                    snippet = ""
                    if card_data and card_data.get('fields'):
                        first_field = next(iter(card_data['fields'].values()), "")
                        snippet = first_field[:60]
                    chunks.append({"score": round(score, 3), "snippet": snippet})

                self.ai._emit_pipeline_step("semantic_search", "done", {
                    "chunks": chunks,
                    "total_hits": semantic_total
                })
        except Exception as e:
            print(f"⚠️ HybridRetrieval: Semantic retrieval failed: {e}")
            self.ai._emit_pipeline_step("semantic_search", "error", {"message": str(e)})

    # Merge results
    if mode == 'both' and (sql_citations or semantic_results):
        self.ai._emit_pipeline_step("merge", "active")

    merged = self._merge_results(sql_citations, semantic_results, context, max_notes)

    context_string = self._build_context_string(merged)

    if mode == 'both' and merged:
        keyword_count = sum(1 for d in merged.values() if 'keyword' in d.get('sources', []))
        semantic_count = sum(1 for d in merged.values() if 'semantic' in d.get('sources', []))
        total = len(merged)
        weight = semantic_count / (keyword_count + semantic_count) if (keyword_count + semantic_count) > 0 else 0.5

        self.ai._emit_pipeline_step("merge", "done", {
            "keyword_count": keyword_count,
            "semantic_count": semantic_count,
            "total": total,
            "weight_position": round(weight, 2)
        })

    # Emit sources for SourcesCarousel
    if merged:
        self.ai._emit_ai_event("rag_sources", merged)

    return {"context_string": context_string, "citations": merged}
```

- [ ] **Step 2: Update `get_response_with_rag` to emit generating step**

In `ai_handler.py` `get_response_with_rag()`, after retrieval and before calling the generator (line ~3278):

```python
self._emit_pipeline_step("generating", "active")
```

- [ ] **Step 3: Handle no-search path**

In `get_response_with_rag()`, after the router call, if `search_needed == false`:

```python
router_result = self._rag_router(user_message, context=context)

if not router_result.get('search_needed', True):
    # Skip search, go directly to generating
    self._emit_pipeline_step("generating", "active")
    # ... proceed to generator without RAG context
```

- [ ] **Step 4: Handle scope fallback**

In `hybrid_retrieval.py` `retrieve()`, after initial retrieval, if total results <2 and scope was `current_deck`:

```python
total_results = len(merged)
if total_results < 2 and router_result.get('search_scope') == 'current_deck' and not router_result.get('_fallback_used'):
    # Fallback: re-run on collection (once only)
    fallback_router = {**router_result, 'search_scope': 'collection', '_fallback_used': True}
    return self.retrieve(user_message, fallback_router, context, max_notes)
```

Add this check before the final return, but after the merge. The `_fallback_used` flag prevents infinite recursion.

- [ ] **Step 5: Remove old `_emit_ai_state` calls from hybrid_retrieval.py**

Replace all `self.ai._emit_ai_state(...)` calls with the new `_emit_pipeline_step` calls (already done in step 1). Remove the old `PHASE_RETRIEVAL` emission at the end.

- [ ] **Step 6: Commit**

```bash
git add hybrid_retrieval.py ai_handler.py
git commit -m "feat(retrieval): granular pipeline_step events, embedding_query, scope fallback"
```

---

## Task 4: Frontend — Handle `pipeline_step` Events in useChat

**Files:**
- Modify: `frontend/src/hooks/useChat.js:405-725` (`handleAnkiReceive`)
- Modify: `frontend/src/App.jsx:843-853` (`ai_state` routing)

- [ ] **Step 1: Add pipeline step state to useChat**

Add new state variables after the existing ones (line ~28 in `useChat.js`):

```javascript
const [pipelineSteps, setPipelineSteps] = useState([]);
// Each: { step: 'router'|'sql_search'|..., status: 'active'|'done'|'error', data: {}, timestamp: number }
const pipelineStepsRef = useRef([]);

const updatePipelineSteps = (updater) => {
  setPipelineSteps(prev => {
    const next = typeof updater === 'function' ? updater(prev) : updater;
    pipelineStepsRef.current = next;
    return next;
  });
};
```

- [ ] **Step 2: Handle `pipeline_step` event in `handleAnkiReceive`**

Add a new case after the `ai_state` handler (line ~426):

```javascript
if (payload.type === 'pipeline_step') {
  if (payload.requestId && payload.requestId !== activeRequestIdRef.current) return;

  updatePipelineSteps(prev => {
    // Replace existing step with same name, or append
    const existing = prev.findIndex(s => s.step === payload.step);
    const newStep = {
      step: payload.step,
      status: payload.status,
      data: payload.data || {},
      timestamp: Date.now()
    };
    if (existing >= 0) {
      const updated = [...prev];
      updated[existing] = newStep;
      return updated;
    }
    return [...prev, newStep];
  });
  return;
}
```

- [ ] **Step 3: Reset pipeline steps on new request**

In the `loading` handler (line ~406):

```javascript
if (payload.type === 'loading') {
  updatePipelineSteps([]);  // Reset pipeline
  updateCurrentSteps([]);
  updateCurrentCitations({});
  setIsLoading(true);
  // ...
}
```

- [ ] **Step 4: Pass `stepLabels` from metadata to message persistence**

In the `streaming` done handler (line ~565), capture `stepLabels`:

```javascript
const finalStepLabels = payload.stepLabels || [];
```

And pass to `appendMessage`:

```javascript
appendMessageRef.current(prev, 'bot', finalSteps, finalCitations, requestId, finalStepLabels);
```

Update `appendMessage` to accept and store `stepLabels`:

```javascript
const appendMessage = useCallback((text, from, steps = [], citations = {}, requestId = null, stepLabels = []) => {
  const newMsg = {
    text,
    from,
    id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    sectionId: currentSectionIdRef.current,
    steps: stepLabels.length > 0 ? stepLabels : steps,  // Prefer labels for persistence
    citations,
    request_id: requestId
  };
  // ... rest unchanged
```

- [ ] **Step 5: Export pipelineSteps from useChat**

Add to the return object (line ~727):

```javascript
return {
  // ... existing
  pipelineSteps,       // NEW: for ThoughtStream
  // ... rest
};
```

- [ ] **Step 6: Verify `pipeline_step` routing in App.jsx**

In `App.jsx` `ankiReceive` handler (lines 598-603), ALL payloads are forwarded unconditionally to the active chat hook — there is no type-based filter. So `pipeline_step` events will be routed automatically without code changes. Just verify this by checking that the generic `_chat.handleAnkiReceive(payload)` call at line ~599 does not have a type check that would exclude new event types.

Note: The `ai_state` handler at line 843 is duplicative dead code (the payload already went to the chat hook at line 599). Do not add another special case for `pipeline_step` — it flows through the generic path.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/hooks/useChat.js frontend/src/App.jsx
git commit -m "feat(frontend): handle pipeline_step events in useChat hook"
```

---

## Task 5: Frontend — Rebuild ThoughtStream Component

**Files:**
- Rewrite: `shared/components/ThoughtStream.tsx`

This is the largest task. The new component implements Active Box + Done Stack with phase-specific animations.

- [ ] **Step 1: Write the new ThoughtStream component shell**

Replace `shared/components/ThoughtStream.tsx` with the new structure. Start with types, state management, and the outer layout:

```tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, ChevronDown, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import SourcesCarousel from './SourcesCarousel';
import type { Citation } from './SourceCard';

/* ═══════════════════════════════════════════════════
   ThoughtStream v2 — Active Box + Done Stack
   ═══════════════════════════════════════════════════ */

const MIN_PHASE_DURATION = 800; // ms

interface PipelineStep {
  step: string;
  status: 'active' | 'done' | 'error';
  data: Record<string, any>;
  timestamp: number;
}

interface DoneEntry {
  step: string;
  label: string;
  timestamp: number;
}

export interface ThoughtStreamProps {
  pipelineSteps?: PipelineStep[];
  citations?: Record<string, any>;
  citationIndices?: Record<string, number>;
  isStreaming?: boolean;
  bridge?: any;
  onPreviewCard?: (citation: Citation) => void;
  message?: string;
  // Legacy support
  steps?: any[];
  intent?: string | null;
}
```

- [ ] **Step 2: Implement the timing system hook**

```tsx
function useTimedPipeline(pipelineSteps: PipelineStep[]) {
  const [visibleActive, setVisibleActive] = useState<PipelineStep | null>(null);
  const [doneStack, setDoneStack] = useState<DoneEntry[]>([]);
  const lastTransitionRef = React.useRef(0);

  useEffect(() => {
    if (!pipelineSteps || pipelineSteps.length === 0) {
      setVisibleActive(null);
      setDoneStack([]);
      return;
    }

    const activeStep = pipelineSteps.find(s => s.status === 'active');
    const doneSteps = pipelineSteps.filter(s => s.status === 'done' || s.status === 'error');

    // Show active step immediately
    if (activeStep) {
      setVisibleActive(activeStep);
    }

    // For done steps: ensure minimum display duration
    const now = Date.now();
    const timeSinceLastTransition = now - lastTransitionRef.current;

    if (timeSinceLastTransition >= MIN_PHASE_DURATION) {
      // Can transition immediately
      const entries = doneSteps.map(s => ({
        step: s.step,
        label: getDoneLabel(s),
        timestamp: s.timestamp
      }));
      setDoneStack(entries.reverse()); // Newest first
      lastTransitionRef.current = now;

      // If active step just became done, clear it
      if (!activeStep && doneSteps.length > 0) {
        setVisibleActive(null);
      }
    } else {
      // Delay transition to meet minimum duration
      const delay = MIN_PHASE_DURATION - timeSinceLastTransition;
      const timer = setTimeout(() => {
        const entries = doneSteps.map(s => ({
          step: s.step,
          label: getDoneLabel(s),
          timestamp: s.timestamp
        }));
        setDoneStack(entries.reverse());
        lastTransitionRef.current = Date.now();
        if (!pipelineSteps.find(s => s.status === 'active')) {
          setVisibleActive(null);
        }
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [pipelineSteps]);

  return { visibleActive, doneStack };
}

function getDoneLabel(step: PipelineStep): string {
  const d = step.data || {};
  switch (step.step) {
    case 'router': {
      const mode = d.retrieval_mode || '';
      const scope = d.scope_label || '';
      return scope ? `Anfrage analysiert — ${mode}, ${scope}` : `Anfrage analysiert — ${mode}`;
    }
    case 'sql_search':
      return `Keyword-Suche — ${d.total_hits || 0} Treffer`;
    case 'semantic_search':
      return `Semantische Suche — ${d.total_hits || 0} Treffer`;
    case 'merge': {
      const t = d.total || 0, k = d.keyword_count || 0, s = d.semantic_count || 0;
      return `Quellen kombiniert — ${t} (${k}K + ${s}S)`;
    }
    case 'generating':
      return 'Antwort generiert';
    default:
      return step.step;
  }
}
```

- [ ] **Step 3: Implement phase-specific Active Box renderers**

```tsx
/* ── Phase: Router Analysis ── */
function RouterActiveContent({ data }: { data: Record<string, any> }) {
  return (
    <div className="flex gap-3 items-center px-1 py-1 text-[11px]">
      <span className="text-base-content/35">Suche →</span>
      <span className="text-[#0a84ff]/70 font-medium">{(data.retrieval_mode || 'Hybrid').charAt(0).toUpperCase() + (data.retrieval_mode || 'hybrid').slice(1)}</span>
      <span className="text-base-content/20">|</span>
      <span className="text-base-content/35">Scope →</span>
      <span className="text-base-content/50">{data.scope_label || data.scope || ''}</span>
    </div>
  );
}

/* ── Phase: SQL Search ── */
function SqlActiveContent({ data }: { data: Record<string, any> }) {
  const queries = data.queries || [];
  return (
    <div className="flex flex-wrap gap-1.5">
      {queries.map((q: any, i: number) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.15, duration: 0.3 }}
          className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-md
            ${q.hits > 0 ? 'bg-base-content/[0.05] text-base-content/50' : 'bg-base-content/[0.03] text-base-content/25'}`}
        >
          <Search className="w-2.5 h-2.5 opacity-40" />
          <span className={q.hits === 0 ? 'line-through decoration-base-content/15' : ''}>
            {q.text}
          </span>
          {q.hits !== undefined && (
            <span className={`text-[10px] font-mono ${q.hits > 0 ? 'text-success/60' : 'text-base-content/20'}`}>
              {q.hits > 0 ? `✓${q.hits}` : '0'}
            </span>
          )}
        </motion.span>
      ))}
    </div>
  );
}

/* ── Phase: Semantic Search ── */
function SemanticActiveContent({ data }: { data: Record<string, any> }) {
  const chunks = data.chunks || [];
  return (
    <div className="flex flex-col gap-1.5">
      {chunks.map((c: any, i: number) => (
        <motion.div
          key={i}
          initial={{ filter: 'blur(4px)', opacity: 0.3 }}
          animate={{ filter: 'blur(0px)', opacity: 1 }}
          transition={{ delay: i * 0.3, duration: 0.8 }}
          className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-white/[0.02] relative overflow-hidden"
        >
          {/* Glow scan overlay */}
          <div className="absolute inset-0 pointer-events-none"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(10,132,255,0.08), transparent)',
              backgroundSize: '30% 100%',
              animation: 'scanGlow 2s ease-in-out infinite',
            }}
          />
          <span className="text-[11px] font-mono text-[#0a84ff]/70 flex-shrink-0 min-w-[36px] relative z-10">
            {c.score?.toFixed(3)}
          </span>
          <span className="text-[11px] text-base-content/50 truncate relative z-10">
            {c.snippet}
          </span>
        </motion.div>
      ))}
    </div>
  );
}

/* ── Phase: Merge ── */
function MergeActiveContent({ data }: { data: Record<string, any> }) {
  const k = data.keyword_count || 0;
  const s = data.semantic_count || 0;
  const total = data.total || 0;
  const weight = data.weight_position || 0.5;
  const weightPercent = `${Math.round(weight * 100)}%`;

  return (
    <div className="py-1">
      {/* Labels */}
      <div className="flex justify-between px-0.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] uppercase tracking-wider text-base-content/20">Keyword</span>
          <span className="text-[13px] font-semibold font-mono text-[#0a84ff]/60">{k}</span>
        </div>
        <div className="flex flex-col gap-0.5 text-right">
          <span className="text-[9px] uppercase tracking-wider text-base-content/20">Semantic</span>
          <span className="text-[13px] font-semibold font-mono text-success/60">{s}</span>
        </div>
      </div>
      {/* Track with glow dot */}
      <div className="relative h-8 my-2">
        <div className="absolute top-1/2 left-0 right-0 h-[2px] -translate-y-1/2 rounded-sm"
          style={{
            background: `linear-gradient(90deg, rgba(10,132,255,0.25) 0%, rgba(10,132,255,0.4) ${weightPercent}, rgba(20,184,166,0.4) ${weightPercent}, rgba(20,184,166,0.25) 100%)`
          }}
        />
        <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-[#0a84ff] z-10"
          style={{
            left: weightPercent,
            transform: 'translate(-50%, -50%)',
            boxShadow: '0 0 8px rgba(10,132,255,0.5), 0 0 20px rgba(10,132,255,0.2)'
          }}
        />
      </div>
      {/* Total */}
      <div className="text-center">
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="text-[20px] font-semibold text-base-content/80"
        >
          {total}
        </motion.div>
        <div className="text-[11px] text-base-content/25">Quellen kombiniert</div>
      </div>
    </div>
  );
}

/* ── Phase: Generating (Shimmer Bar) ── */
function GeneratingActiveContent() {
  return (
    <div className="h-[3px] rounded-sm overflow-hidden"
      style={{
        background: 'linear-gradient(90deg, transparent 0%, rgba(10,132,255,0.05) 20%, rgba(10,132,255,0.3) 50%, rgba(10,132,255,0.05) 80%, transparent 100%)',
        backgroundSize: '200% 100%',
        animation: 'shimmerWave 2s ease-in-out infinite',
      }}
    />
  );
}
```

- [ ] **Step 4: Add CSS keyframes**

Add a `<style>` injection or global CSS for the animations:

```tsx
// At the top of the file, add a style element for keyframes
const KEYFRAMES = `
@keyframes scanGlow {
  0% { background-position: -30% 0; }
  100% { background-position: 130% 0; }
}
@keyframes shimmerWave {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes dotPulse {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.3); }
}
`;

// Inject once via useEffect in the main component
useEffect(() => {
  if (typeof document !== 'undefined' && !document.getElementById('thoughtstream-keyframes')) {
    const style = document.createElement('style');
    style.id = 'thoughtstream-keyframes';
    style.textContent = KEYFRAMES;
    document.head.appendChild(style);
  }
}, []);
```

- [ ] **Step 5: Implement the main ThoughtStream component**

```tsx
export default function ThoughtStream({
  pipelineSteps = [],
  citations = {},
  citationIndices = {},
  isStreaming = false,
  bridge = null,
  onPreviewCard,
  message = '',
  // Legacy
  steps = [],
  intent = null,
}: ThoughtStreamProps) {
  // Legacy detection: if old-format steps exist, render flat done list
  const isLegacy = steps.length > 0 && steps[0]?.phase;

  const { visibleActive, doneStack } = useTimedPipeline(pipelineSteps);
  const { isExpanded, setIsExpanded } = useAutoCollapse(isStreaming, message);

  const hasCitations = Object.keys(citations).length > 0;
  const hasContent = pipelineSteps.length > 0 || doneStack.length > 0 || visibleActive || isLegacy;
  const stepCount = doneStack.length;
  const citationCount = Object.keys(citations).length;

  if (!hasContent) return null;

  // Legacy rendering
  if (isLegacy) {
    return <LegacyThoughtStream steps={steps} citations={citations} citationIndices={citationIndices} bridge={bridge} onPreviewCard={onPreviewCard} />;
  }

  const handleToggle = () => {
    if (visibleActive) return; // Don't collapse while processing
    setIsExpanded(v => !v);
  };

  const activeTitle = getActiveTitle(visibleActive?.step);
  const activeContent = visibleActive ? getActiveContent(visibleActive) : null;

  return (
    <div className="mb-2 max-w-full select-none">
      {/* Collapsed header (shown when collapsed) */}
      {!isExpanded && !visibleActive && (
        <button
          onClick={handleToggle}
          className="group flex items-center gap-1.5 w-full text-left py-1 opacity-40 hover:opacity-60 transition-opacity"
        >
          <ChevronDown className="w-3 h-3 text-base-content/30 -rotate-90 transition-transform" />
          <span className="text-[12px] text-base-content/35">
            {stepCount} Schritt{stepCount !== 1 ? 'e' : ''} · {citationCount} Quellen
          </span>
        </button>
      )}

      {/* Sources carousel — always visible */}
      {!isExpanded && hasCitations && (
        <div className="mt-1 mb-1 max-w-full overflow-hidden">
          <SourcesCarousel citations={citations} citationIndices={citationIndices} bridge={bridge} onPreviewCard={onPreviewCard} />
        </div>
      )}

      {/* Expanded content */}
      <AnimatePresence initial={false}>
        {(isExpanded || visibleActive) && (
          <motion.div
            key="pipeline"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ height: { duration: 0.2 }, opacity: { duration: 0.15 } }}
            className="overflow-hidden"
          >
            {/* Active Box */}
            <AnimatePresence mode="wait">
              {visibleActive && (
                <motion.div
                  key={visibleActive.step}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, height: 0, padding: 0, margin: 0 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="bg-[#1e1e1e] rounded-xl p-4 mb-2 border border-white/[0.04]"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#0a84ff]" style={{ animation: 'dotPulse 1.5s ease-in-out infinite' }} />
                    <span className="text-[12px] text-base-content/60 font-medium">{activeTitle}</span>
                  </div>
                  {activeContent}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Done Stack (newest first) */}
            <AnimatePresence>
              {doneStack.map((entry, idx) => (
                <motion.div
                  key={entry.step}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  transition={{ duration: 0.25, delay: idx === 0 ? 0.1 : 0 }}
                  className="flex items-center gap-2 py-1.5 border-t border-white/[0.03] first:border-t-0"
                >
                  <div className="w-[5px] h-[5px] rounded-full bg-base-content/15 flex-shrink-0" />
                  <span className="text-[11px] text-base-content/30 flex-1">{entry.label}</span>
                  <span className="text-[10px] text-success/50">✓</span>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Sources carousel in expanded mode */}
            {hasCitations && (
              <div className="mt-2 max-w-full overflow-hidden">
                <SourcesCarousel citations={citations} citationIndices={citationIndices} bridge={bridge} onPreviewCard={onPreviewCard} />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 6: Add helper functions and legacy fallback**

```tsx
function getActiveTitle(step?: string): string {
  switch (step) {
    case 'router': return 'Analysiere Anfrage...';
    case 'sql_search': return 'Keyword-Suche...';
    case 'semantic_search': return 'Semantische Suche...';
    case 'merge': return 'Quellen kombinieren...';
    case 'generating': return 'Generiere Antwort...';
    default: return 'Verarbeite...';
  }
}

function getActiveContent(step: PipelineStep): React.ReactNode {
  if (step.status !== 'active' && step.status !== 'done') return null;

  switch (step.step) {
    case 'router': return <RouterActiveContent data={step.data} />;
    case 'sql_search': return step.data.queries ? <SqlActiveContent data={step.data} /> : null;
    case 'semantic_search': return step.data.chunks ? <SemanticActiveContent data={step.data} /> : null;
    case 'merge': return step.data.total ? <MergeActiveContent data={step.data} /> : null;
    case 'generating': return <GeneratingActiveContent />;
    default: return null;
  }
}

function useAutoCollapse(isStreaming: boolean, message: string) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [hasAutoCollapsed, setHasAutoCollapsed] = useState(false);
  const hasText = message && message.trim().length > 0;

  useEffect(() => {
    if (isStreaming && !hasAutoCollapsed) setIsExpanded(true);
  }, [isStreaming, hasAutoCollapsed]);

  useEffect(() => {
    if (hasText && !hasAutoCollapsed) {
      const t = setTimeout(() => {
        setIsExpanded(false);
        setHasAutoCollapsed(true);
      }, 500);
      return () => clearTimeout(t);
    }
  }, [hasText, hasAutoCollapsed]);

  return { isExpanded, setIsExpanded, hasAutoCollapsed };
}

/* Legacy support for old message format */
function LegacyThoughtStream({ steps, citations, citationIndices, bridge, onPreviewCard }: any) {
  const hasCitations = Object.keys(citations || {}).length > 0;
  const labels = steps.map((s: any) => s.state || s.label || '').filter(Boolean);

  return (
    <div className="mb-2 max-w-full select-none">
      <div className="flex flex-col gap-0">
        {labels.map((label: string, i: number) => (
          <div key={i} className="flex items-center gap-2 py-1.5 border-t border-white/[0.03] first:border-t-0">
            <div className="w-[5px] h-[5px] rounded-full bg-base-content/15 flex-shrink-0" />
            <span className="text-[11px] text-base-content/30 flex-1">{label}</span>
            <span className="text-[10px] text-success/50">✓</span>
          </div>
        ))}
      </div>
      {hasCitations && (
        <div className="mt-2 max-w-full overflow-hidden">
          <SourcesCarousel citations={citations} citationIndices={citationIndices} bridge={bridge} onPreviewCard={onPreviewCard} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Build frontend and verify**

```bash
cd frontend && npm run build
```

Restart Anki, send a message, verify ThoughtStream renders (even if still receiving old `ai_state` events — legacy fallback should handle it).

- [ ] **Step 8: Commit**

```bash
git add shared/components/ThoughtStream.tsx
git commit -m "feat(ui): rebuild ThoughtStream with Active Box + Done Stack + phase animations"
```

---

## Task 6: Frontend — Wire ThoughtStream to Chat Components

**Files:**
- Modify: `frontend/src/App.jsx` — Pass `pipelineSteps` to ThoughtStream
- Modify: `frontend/src/components/ChatMessage.jsx` or wherever ThoughtStream is rendered

- [ ] **Step 1: Find where ThoughtStream is currently rendered**

Search for `<ThoughtStream` in the codebase. It's likely rendered inside `ChatMessage.jsx` or `StreamingChatMessage.jsx` or directly in `App.jsx`. Pass the new `pipelineSteps` prop.

- [ ] **Step 2: Pass `pipelineSteps` from useChat to the streaming message ThoughtStream**

The streaming/active ThoughtStream needs the live `pipelineSteps` state. For persisted messages, it should use the stored `stepLabels` (old format for legacy, new format for new messages).

```jsx
{/* Streaming message — uses live pipeline state */}
<ThoughtStream
  pipelineSteps={chatHook.pipelineSteps}
  citations={chatHook.currentCitations}
  isStreaming={true}
  bridge={bridge}
  message={chatHook.streamingMessage}
/>

{/* Persisted message — uses stored steps (legacy or labels) */}
<ThoughtStream
  steps={msg.steps}  // Legacy: array of {phase, state, ...}. New: array of label strings
  citations={msg.citations}
  isStreaming={false}
  bridge={bridge}
  message={msg.text}
/>
```

- [ ] **Step 3: Build and test in Anki**

```bash
cd frontend && npm run build
```

Restart Anki, test:
1. Send a message that triggers search — verify Active Box phases appear
2. Verify done stack builds in reverse order (newest first)
3. Verify shimmer bar appears when generating
4. Verify collapse after response
5. Verify click to expand shows done steps
6. Verify old messages still render correctly (legacy fallback)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/ChatMessage.jsx frontend/src/components/StreamingChatMessage.jsx
git commit -m "feat(ui): wire ThoughtStream v2 to chat components"
```

---

## Task 7: Integration Test & Cleanup

**Files:**
- Modify: `ai_handler.py` — Remove old `_emit_ai_state` calls from router/retrieval path (keep method for other callers)
- Modify: `hybrid_retrieval.py` — Remove any remaining `_emit_ai_state` calls

- [ ] **Step 1: End-to-end test in Anki**

Test these scenarios:
1. **Full hybrid search**: Send a question about a card with many related cards → should see all 5 phases
2. **No search needed**: Send "Hallo" or "Danke" → should skip to generating
3. **SQL only**: If router decides sql mode → no semantic phase
4. **Scope fallback**: Test with a narrow deck that has <2 matching cards
5. **Error handling**: Disconnect internet, send message → verify error state
6. **Old messages**: Scroll to old messages → verify legacy ThoughtStream renders

- [ ] **Step 2: Remove old ai_state emissions from router/retrieval path**

In `ai_handler.py` `_rag_router()`, remove the old `_emit_ai_state("Analysiere Anfrage...", phase=PHASE_INTENT)` call (now replaced by `_emit_pipeline_step`).

In `hybrid_retrieval.py`, remove all remaining `_emit_ai_state` calls (replaced by `_emit_pipeline_step`).

Keep `_emit_ai_state` method itself — it may be used by other callers outside the RAG pipeline.

- [ ] **Step 3: Remove intent-related code in ai_handler.py**

Remove/simplify the intent classification validation blocks (lines ~2477-2581 that check for EXPLANATION/FACT_CHECK etc). The router no longer returns intents.

- [ ] **Step 4: Final build and verify**

```bash
cd frontend && npm run build
```

Restart Anki, run through all test scenarios again.

- [ ] **Step 5: Commit**

```bash
git add ai_handler.py hybrid_retrieval.py
git commit -m "refactor: remove old ai_state emissions and intent system remnants"
```
