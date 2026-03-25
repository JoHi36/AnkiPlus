# Live Pipeline Redesign — Hybrid Retrieval + Reasoning UI

## Overview

Redesign of the RAG (Retrieval-Augmented Generation) pipeline, covering three areas:
1. **Router simplification** — remove intent system, add query synthesis
2. **Backend event granularity** — richer, per-step events for live UI
3. **ThoughtStream UI** — complete rebuild with phase-specific animations

## 1. Router Redesign

### Current State
The router classifies user messages into intents (EXPLANATION, FACT_CHECK, MNEMONIC, QUIZ, CHAT) and generates SQL queries. This intent system is outdated — quiz and mnemonic generation moved to the main card UI.

### New Router Contract

The router receives enriched context and returns a simplified decision:

**Input:**
```json
{
  "message": "Was ist das?",
  "lastAssistantMessage": "Die Karte zeigt den M. biceps brachii...",
  "cardContext": {
    "question": "Welcher Muskel ist der wichtigste Flexor?",
    "answer": "M. biceps brachii",
    "fields": { "Extra": "Oberarm, Flexion" },
    "deckName": "Medizin::Anatomie::Obere Extremität",
    "tags": ["Anatomie", "Muskeln", "Arm"]
  }
}
```

**Output:**
```json
{
  "search_needed": true,
  "retrieval_mode": "both",
  "embedding_query": "Biceps brachii Oberarm Flexor Muskel Funktion",
  "precise_queries": ["Biceps AND Flexion", "Oberarm AND Muskel"],
  "broad_queries": ["Biceps OR Flexor OR Oberarm"],
  "search_scope": "current_deck"
}
```

**Key changes:**
- No `intent` field. Only `search_needed: true/false`.
- New `embedding_query` field: Router synthesizes a semantically rich search text from card context + user question + conversation context. The user's raw question (e.g., "Was ist das?") is never used directly as embedding input.
- `lastAssistantMessage` included so the router understands conversational references. The backend retrieves this from the current session's message history (last bot message in `card_sessions_storage`), not sent by the frontend.
- Card `tags` and `deckName` included for scope decisions and query generation.

### Scope Decision Logic
- Default: `current_deck`
- Router can choose `collection` when the question is cross-disciplinary or the deck name doesn't match the topic
- **Fallback**: If `current_deck` returns <2 results, automatically re-run on `collection`

### Router Model
- Primary: `gemini-2.5-flash` (fast, ~500ms)
- Fallback: `gemini-2.0-flash`
- Temperature: 0.1 (deterministic)

## 2. Backend Event System

### Current State
Backend emits `ai_state` events with phase + metadata. Events are coarse — one per phase transition.

### New Event Protocol

Each pipeline step emits granular events that the UI renders in real-time. All events include a `requestId` for correlation.

### requestId Plumbing

The frontend generates a UUID v4 `requestId` for each message and includes it in the `sendMessage` bridge call payload. The backend receives it in `widget._handle_js_message()` and passes it to `ai_handler.get_response_with_rag()`. The handler stores it as `self._current_request_id` for the duration of the request. Every `_emit_pipeline_step()` call reads from this instance variable. Stale requests are filtered on the frontend: `if (payload.requestId !== activeRequestIdRef.current) return`.

#### Event: `pipeline_step`
Replaces `ai_state`. One event per meaningful state change.

```json
{
  "type": "pipeline_step",
  "requestId": "uuid",
  "step": "router",
  "status": "done",
  "data": {
    "search_needed": true,
    "retrieval_mode": "both",
    "scope": "current_deck",
    "scope_label": "Anatomie"
  }
}
```

**Steps and their `data` payloads:**

| step | status | data |
|------|--------|------|
| `router` | `active` → `done` | `{ search_needed, retrieval_mode, scope, scope_label }` |
| `sql_search` | `active` → `done` | `{ queries: [{ text, hits }], total_hits }` |
| `semantic_search` | `active` → `done` | `{ chunks: [{ score, snippet }], total_hits }` |
| `merge` | `active` → `done` | `{ keyword_count, semantic_count, total, weight_position }` |
| `generating` | `active` → `done` | `{}` (shimmer bar phase) |

Note: Step is named `router` (not `intent`) since the intent system has been removed.

**`semantic_search` chunk previews:** When semantic search completes, the top 3 results are sent with truncated text snippets (first 60 chars of the card's primary field) and similarity scores. These are real data from the embedding search. Snippet loading uses `_load_card_data()` for the top 3 card_ids returned by the embedding search, done as part of the `semantic_search` step before emitting the `done` event.

**`merge` weight_position:** A float 0.0–1.0 representing the balance. Calculated as `semantic_count / (keyword_count + semantic_count)`. The UI renders the glow dot at this position on the merge bar.

#### Event: `rag_sources`
Sent immediately after the `merge` done event (same callback sequence). Contains full citation data for the SourcesCarousel.

#### Event: `streaming` (unchanged)
Text chunks for the AI response. Existing protocol stays the same.

### Partial Pipelines

The `retrieval_mode` from the router determines which steps are emitted:
- `"both"`: router → sql_search → semantic_search → merge → generating
- `"sql"`: router → sql_search → generating (no semantic, no merge)
- `"semantic"`: router → semantic_search → generating (no sql, no merge)

The frontend uses `retrieval_mode` from the router `done` data to know which phases to expect. Unexpected step events are ignored.

### No-Search Path

When `search_needed: false`:
```
router done (search_needed: false) → generating active → streaming begins
```
The frontend sees `search_needed: false` in the router done data and skips directly to the generating phase. No sql_search, semantic_search, or merge events are emitted.

### Error Handling

If any step fails, the backend emits:
```json
{
  "type": "pipeline_step",
  "requestId": "uuid",
  "step": "semantic_search",
  "status": "error",
  "data": { "message": "Embedding model unavailable" }
}
```
The UI shows the step as failed (gray text, no checkmark) and the pipeline continues with available results. If both search steps fail, the response is generated without RAG context.

### Removed from persistence
- SQL query texts
- Embedding chunks/scores
- Router decision details

Only persisted per message:
- Step labels as string array (for collapsed expand view): `["Anfrage analysiert", "Keyword-Suche — 4 Treffer", "Semantische Suche — 3 Treffer", "Quellen kombiniert — 5"]`
- Citations (card references)
- Step count (integer, for "X Schritte" display): count of steps that reached `done` status

**Backward compatibility:** Old messages with the previous `steps` format (array of `{phase, state, timestamp, metadata}` objects) are detected by checking if `steps[0]` has a `phase` field. If so, the ThoughtStream falls back to rendering them as a flat done-list with labels extracted from `state`.

## 3. ThoughtStream UI Redesign

### Architecture

Replace existing `ThoughtStream.tsx` with a new component that follows the "Active Box + Done Stack" pattern.

### Layout Structure

```
┌─────────────────────────────────────┐
│ ACTIVE BOX                          │  ← Current step, full animation
│  ● [Step title]...                  │
│  [Phase-specific content/animation] │
└─────────────────────────────────────┘
  ✓ [Most recent done step]           ← Newest first
  ✓ [Previous done step]
  ✓ [First done step]
```

- **Active Box**: Dark card (`#1e1e1e`, rounded-12, 1px border `rgba(255,255,255,0.04)`) with pulsing blue dot and phase-specific animation inside.
- **Done Stack**: Flat list of single-line entries, newest on top. Each has a small gray dot + label + checkmark. Separated by subtle 1px borders.
- **Reverse order**: When a step completes, it shrink-animates into the top position of the done stack. The next step opens as a new active box above.

### Phase Animations

#### Phase 1: Router Analysis
- Title: "Analysiere Anfrage..."
- Content: Shows decision as inline key-value pairs: `Suche notwendig → Hybrid | Scope → [Deck-Name]`
- Duration: min 800ms
- On complete: Shrinks to "Anfrage analysiert — Hybrid, [Deck]"

#### Phase 2: SQL Search
- Title: "Keyword-Suche..."
- Content: Query tags appear with staggered animation (150ms delay between each). Each tag shows:
  - Search icon (10px)
  - Query text (e.g., "Biceps AND Flexion")
  - Hit count appears after search completes (green if >0, gray if 0)
- Tags use: `bg-base-content/[0.05]`, `rounded-md`, `text-[11px]`
- On complete: Shrinks to "Keyword-Suche — X Treffer"

#### Phase 3: Semantic Search
- Title: "Semantische Suche..."
- Content: Top 3 embedding results as rows. Each row:
  - Similarity score in mono font, blue (`#0a84ff`, opacity 0.7)
  - Text snippet that transitions from `blur(4px) + opacity(0.3)` to `blur(0) + opacity(1)` over 800ms
  - Staggered: 0ms, 300ms, 600ms delay per row
  - Horizontal glow-scan overlay: 30% width light band sweeps left to right (2s loop)
- Row style: `rounded-8`, `bg-white/[0.02]`, `padding 8px 10px`
- On complete: Shrinks to "Semantische Suche — X Treffer"

#### Phase 4: Merge
- Title: "Quellen kombinieren..."
- Content:
  - Top row: "Keyword" label + count (left, blue) and "Semantic" label + count (right, teal)
  - Horizontal track (2px height) with gradient: blue left → teal right, split at weight position
  - **Solid Glow Dot** at weight position: 10px circle, `#0a84ff`, `box-shadow: 0 0 8px rgba(10,132,255,0.5), 0 0 20px rgba(10,132,255,0.2)`
  - Below: Large number (20px font) with "Quellen kombiniert" label
  - Number enters with slide-up animation (translateY 100% → 0)
- On complete: Shrinks to "Quellen kombiniert — X (YK + ZS)"

#### Phase 5: Generate Answer (variable buffer)
- Title: "Generiere Antwort..."
- Content: **Shimmer Bar** — 3px height, rounded, with animated gradient:
  ```css
  background: linear-gradient(90deg,
    transparent 0%, rgba(10,132,255,0.05) 20%,
    rgba(10,132,255,0.3) 50%, rgba(10,132,255,0.05) 80%,
    transparent 100%);
  background-size: 200% 100%;
  animation: shimmerWave 2s ease-in-out infinite;
  ```
- **Variable timing**: This phase only appears if the AI response hasn't started streaming yet after all previous steps complete. It fills remaining wait time. Skipped entirely if response is already streaming.
- On response start: Active box dissolves, streaming text begins below the done stack.

### Shrink Animation

When a step transitions from active to done:
1. Active box padding reduces: 16px → 5px 0
2. Background fades: `#1e1e1e` → transparent
3. Border-radius reduces: 12px → 0
4. Border fades out
5. Font size reduces: 12px → 11px
6. Text color dims: `rgba(232,232,232,0.6)` → `rgba(232,232,232,0.3)`
7. Blue pulsing dot becomes small gray static dot
8. Phase-specific content (tags, chunks, merge visualization) fades out
9. Duration: 300ms, ease-out

Implemented with framer-motion `layout` animations for smooth position transitions.

### Collapsed State (after response complete)

When the streaming response begins:
1. Active box (if "Generiere Antwort") dissolves
2. All done steps remain visible during streaming
3. When streaming completes (after 500ms delay): entire ThoughtStream collapses

**Collapsed view:**
- Single clickable line: chevron (rotated -90°) + "X Schritte · Y Quellen" (X = count of steps that reached `done` status, Y = citation count)
- Font: 12px, `rgba(232,232,232,0.35)`
- Opacity: 0.4, hover: 0.6
- SourcesCarousel always visible below (never hidden)

**Expanded view (on click):**
- Chevron rotates to 0°
- Done stack appears (all steps, newest first, labels only — no animations replay)
- SourcesCarousel below

### Timing System

```
MIN_PHASE_DURATION = 800ms  (adjustable)

for each phase:
  show_start = max(previous_phase_end, now)
  backend_event_time = when backend sends "done" for this phase
  visible_until = max(show_start + MIN_PHASE_DURATION, backend_event_time)
  shrink_animation_start = visible_until
```

- If backend is faster than MIN_PHASE_DURATION: phase stays visible until minimum met
- If backend is slower: phase stays visible until backend event arrives (real time, no fake delay)
- "Generiere Antwort" phase: no minimum, appears only if there's remaining wait time after all other phases, disappears immediately when streaming starts

## 4. Data Flow

```
User sends message
  │
  ├─ Frontend: generates requestId, sends via bridge
  ├─ Frontend: shows ThoughtStream with intent phase (active)
  │
  ▼
Backend: _rag_router()
  ├─ Emits: pipeline_step { step: "router", status: "active" }
  ├─ Calls router API with enriched context (card + deck + tags + last message)
  ├─ Emits: pipeline_step { step: "router", status: "done", data: { search_needed, ... } }
  │
  ├─ If search_needed == false:
  │   ├─ Emits: pipeline_step { step: "generating", status: "active" }
  │   └─ Skip directly to streaming (no search/merge steps emitted)
  │
  ▼
Backend: hybrid_retrieval.retrieve(embedding_query=router_result['embedding_query'])
  ├─ Emits: pipeline_step { step: "sql_search", status: "active" }
  ├─ Runs precise queries, then broad if needed
  ├─ Emits: pipeline_step { step: "sql_search", status: "done", data: { queries, total_hits } }
  │
  ├─ Emits: pipeline_step { step: "semantic_search", status: "active" }
  ├─ Generates embedding for router's embedding_query (NOT user_message)
  ├─ Searches vector index, loads card data for top 3 snippets
  ├─ Emits: pipeline_step { step: "semantic_search", status: "done", data: { chunks, total_hits } }
  │
  ├─ Emits: pipeline_step { step: "merge", status: "active" }
  ├─ Merges results, calculates weight_position
  ├─ Emits: pipeline_step { step: "merge", status: "done", data: { keyword_count, semantic_count, total, weight_position } }
  ├─ Emits: rag_sources { citations } (immediately after merge done)
  │
  ▼
Backend: _get_response_streaming()
  ├─ Emits: pipeline_step { step: "generating", status: "active" }
  ├─ Streams response chunks
  ├─ First chunk arrives → Frontend hides "generating" phase, starts rendering text
  └─ Done → Emits metadata with step_labels + citations for persistence
```

## 5. Files to Modify

### Backend (Python)
- `ai_handler.py` — Router prompt rewrite, new `pipeline_step` emission, `embedding_query` field, remove intent system
- `hybrid_retrieval.py` — Change `retrieve()` to use `router_result['embedding_query']` for semantic search instead of `user_message`. Emit granular events per search type, include chunk previews (top 3 card snippets) in semantic results
- `bridge.py` — No changes expected (events flow through existing streaming callback)

### Backend (Cloud Functions)
- `functions/src/handlers/router.ts` — Update router prompt and response schema, remove intent field

### Frontend
- `shared/components/ThoughtStream.tsx` — Complete rewrite with new Active Box + Done Stack pattern
- `frontend/src/hooks/useChat.js` — Handle new `pipeline_step` event type, replace `ai_state` handling
- `frontend/src/App.jsx` — Route new event types to chat hook

### Unchanged
- `shared/components/SourcesCarousel.tsx` — Kept as-is
- `shared/components/SourceCard.tsx` — Kept as-is
- `embedding_manager.py` — No changes (already returns scores + card_ids)
- `card_sessions_storage.py` — No schema changes, just different data stored in `steps` column
