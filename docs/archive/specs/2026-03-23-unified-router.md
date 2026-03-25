# Unified Router — Single LLM Call for Agent Selection + Search Strategy

**Date:** 2026-03-23
**Status:** Draft
**Branch:** feature/agent-studio

## Problem

Two sequential LLM calls happen for every Tutor message:

1. **Agent Router** (`router.py`): "Which agent?" → ~1s, returns only agent name
2. **RAG Router** (`rag.py`): "What search strategy?" → ~1-4s, returns queries + flags

Both use `gemini-2.5-flash`. The second call only runs when agent=tutor, but that's ~90% of messages. Total overhead: **2-5 seconds** before retrieval even starts.

## Solution

Merge both into a **single Unified Router** LLM call that receives the complete situation and returns agent selection + search strategy in one JSON response.

```
BEFORE:  User → Agent Router (1s) → RAG Router (1-4s) → Retrieval → Stream
AFTER:   User → Unified Router (2-3s) → Retrieval → Stream
```

Savings: ~1-2 seconds per message, 1 fewer API call.

## Design

### Input: Complete Situation

The Unified Router receives everything needed to make both decisions:

| Field | Source | Purpose |
|-------|--------|---------|
| `user_message` | Frontend | The question to route |
| `chat_history` | SQLite / session state | Last N messages for conversational context |
| `card_context` | Current reviewer state | Question, answer, deck, tags, extra fields |
| `session_mode` | Frontend | `card_session` or `free_chat` |
| `available_agents` | Agent registry | Names + descriptions of enabled agents |

**Chat history is context-dependent:**
- `card_session`: Per-card history from `load_card_session(card_id)` — messages tied to the current card
- `free_chat`: Chronological session history — all recent messages regardless of card

### Output: Single JSON Response

```json
{
  "agent": "tutor",
  "reasoning": "Lernfrage zum Thema Botanik",
  "search_needed": true,
  "retrieval_mode": "both",
  "response_length": "medium",
  "max_sources": "medium",
  "search_scope": "collection",
  "precise_queries": ["banane AND krumm AND ursache", "banane AND geotropismus", "banane AND wachstum AND form"],
  "broad_queries": ["banane OR krumm OR wachstum", "banane OR form OR grund", "banane OR kruemmung"],
  "embedding_queries": ["bananenwachstum geotropismus negativer", "pflanzenhormone fruchtentwicklung kruemmung", "warum bananen gebogen form"]
}
```

**When agent != "tutor":** Search fields are omitted. Handler dispatches directly to the target agent.

```json
{
  "agent": "plusi",
  "reasoning": "Persoenliche Ansprache an Plusi"
}
```

### Prompt Structure

The unified prompt has three sections:

1. **Role + Decision Framework**: "You are the router. Decide agent AND (if tutor) search strategy."
2. **Complete Situation**: User message, card context, chat history, session mode
3. **Agent Descriptions**: All enabled agents with routing hints
4. **Search Strategy Rules** (conditional on tutor): Context detection, query rules, retrieval modes — taken from current RAG router prompt
5. **Output Format**: JSON schema with examples

### Routing Priority (unchanged)

The three-level routing stays intact. The LLM is only Level 3:

1. **Level 1 — Explicit signals (0ms)**: @mentions, lock mode → bypass LLM entirely
2. **Level 2 — Keyword heuristics (0ms)**: "plusi ...", help keywords → bypass LLM
3. **Level 3 — Unified Router LLM (~2-3s)**: Agent + search strategy in one call

### Model Configuration

- Model: `gemini-2.5-flash` (same as both current routers)
- Temperature: 0.1 (slight creativity for query generation)
- Max output tokens: 1024 (same as current RAG router)
- Response format: `application/json`
- Timeout: 10 seconds

## Changes by File

### `ai/router.py` — Major rewrite

**Remove:** `_llm_route()` (the old agent-only LLM call)

**Add:** `unified_route(user_message, session_context, config, card_context, chat_history)` that:
- Builds the combined prompt (agent selection + search strategy)
- Makes one LLM call
- Parses JSON response
- Returns `UnifiedRoutingResult` containing both agent decision and search parameters

**Keep:**
- `_check_lock_mode()` — Level 1
- `_detect_agent_mention()` — Level 1
- `_check_heuristics()` — Level 2
- `route_message()` — orchestrates levels 1→2→3, but Level 3 now calls `unified_route()`

**New return type:**
```python
@dataclass
class UnifiedRoutingResult:
    agent: str                          # 'tutor', 'research', 'help', 'plusi'
    method: str                         # 'lock', 'mention', 'heuristic', 'llm', 'default'
    clean_message: Optional[str]        # Message with @mention stripped
    reasoning: str                      # Why this agent was chosen
    # Search strategy (only populated when agent='tutor' and LLM-routed)
    search_needed: Optional[bool]       # Whether to search cards
    retrieval_mode: Optional[str]       # 'sql', 'semantic', 'both'
    response_length: Optional[str]      # 'short', 'medium', 'long'
    max_sources: Optional[str]          # 'low', 'medium', 'high'
    search_scope: Optional[str]         # 'current_deck', 'collection'
    precise_queries: Optional[list]     # AND queries
    broad_queries: Optional[list]       # OR queries
    embedding_queries: Optional[list]   # Semantic search queries
```

### `ai/rag.py` — Remove `_rag_router()`

The `_rag_router()` method and its prompt are absorbed into the unified router.

**Keep:**
- Query validation logic (`_validate_queries()`, `_fix_router_queries()`) — moved to `router.py` or called after unified routing
- `extract_card_keywords()` fallback — used when LLM fails
- All retrieval logic (`_rag_retrieve_cards()`, `hybrid_retrieve()`)

### `ai/handler.py` — Simplify orchestration

**Before (two calls):**
```python
routing_result = route_message(user_message, session_context, self.config)  # Call 1
if routing_result.agent == 'tutor':
    router_result = self._rag_router(user_message, context=context)        # Call 2
    # ... use router_result for retrieval
```

**After (one call):**
```python
routing_result = route_message(user_message, session_context, self.config,
                               card_context=context, chat_history=history)  # Single call
if routing_result.agent == 'tutor':
    if routing_result.search_needed:
        # Queries already in routing_result — go straight to retrieval
        # ... use routing_result.precise_queries, etc.
```

`route_message()` signature changes to accept `card_context` and `chat_history` as optional parameters (for Level 3 LLM routing). Levels 1 and 2 ignore them.

### Frontend — No changes

The v2 event system stays identical. The frontend doesn't know or care whether routing happened in one or two calls.

## Query Validation

The current RAG router has post-processing that validates queries (checks for verbatim user message, empty queries, etc.). This validation stays but moves:

- `_validate_queries()` runs on the unified response before returning
- `_fix_router_queries()` runs in handler.py as before
- `extract_card_keywords()` fallback if the unified router LLM fails entirely

## Fallback Behavior

| Failure | Behavior |
|---------|----------|
| LLM returns no agent | Default to `tutor` with `search_needed=true`, fallback queries from card keywords |
| LLM returns agent but no queries | Agent dispatches normally (non-tutor) or fallback queries (tutor) |
| LLM call fails entirely | Default to `tutor`, generate queries from `extract_card_keywords()` |
| Level 1/2 matches | LLM never called, no search strategy (non-tutor agents don't need it) |
| Level 1/2 matches tutor (future) | Could add heuristic search strategy, but not in scope now |

## Pipeline Event Timing

With the unified router, the pipeline step `orchestrating` covers both agent selection and search strategy:

```
msg_start → orchestrating:active → [Unified Router LLM call] → orchestrating:done
         → agent_cell tutor:thinking → retrieval steps → generating → msg_done
```

The `orchestrating:done` event now includes richer data (agent + search strategy summary).

## Out of Scope

- Changing the number of queries (stays at 3/3/3)
- Changing retrieval logic (SQL + embedding stays the same)
- Tuning content strategy (how many cards, how broad) — future optimization
- Changing the streaming/handoff pipeline
