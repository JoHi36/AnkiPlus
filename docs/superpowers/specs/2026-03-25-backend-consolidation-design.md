# Backend Consolidation: All API Calls Through Backend via OpenRouter

**Date:** 2026-03-25
**Status:** Approved
**Goal:** Move all paid API calls to the Firebase backend, use OpenRouter as the single AI provider, protect system prompts as server-side IP.

---

## Context

The AnkiPlus addon currently makes 38 external HTTP calls from the Python client. 13 of these go directly to Google Gemini with an API key stored in the client config. Additionally, OpenRouter and Perplexity are called directly for research and insight extraction. System prompts (~680 lines) are shipped with the addon, exposing proprietary IP.

The backend (Firebase Cloud Functions) already has `/chat`, `/router`, `/embed`, `/models` endpoints but the client uses them only optionally, falling back to direct API calls when auth fails.

## Design Decisions

1. **Production:** Client has zero API keys. All paid LLM calls go through the backend with auth token.
2. **Dev-only:** A local `dev_openrouter_key` in config.json for developer testing. Not exposed in UI, not a feature.
3. **System prompts:** Built entirely in the backend. Client sends card context + metadata, backend assembles the full prompt. Prompts never leave the server.
4. **Router stays as endpoint:** Client calls `/router` for agent selection, then `/chat` for the LLM call. Agent loop remains client-side.
5. **Free APIs stay direct:** PubMed, Wikipedia, PubChem, Wikimedia — no keys, no cost, no IP to protect. Direct from client.
6. **OpenRouter as single backend provider:** One API key, one endpoint, access to all models (Gemini, Perplexity Sonar, etc.)

## Architecture

```
Client (Anki Addon)                         Backend (Firebase Functions)
+-----------------------+                   +----------------------------+
|                       |                   |                            |
|  Message + CardContext |--- /router ----->|  Agent routing decision     |
|                       |<-- agent+queries  |  (OpenRouter LLM call)     |
|                       |                   |                            |
|  Agent Loop           |--- /chat ------->|  Build system prompt        |
|  (tool calls,         |<-- SSE stream    |  + OpenRouter chat call     |
|   multi-turn)         |                   |                            |
|                       |--- /embed ------>|  Embeddings                 |
|                       |<-- vectors       |  (OpenRouter / Gemini emb)  |
|                       |                   |                            |
|                       |--- /research --->|  Perplexity Sonar call      |
|                       |<-- answer+cites  |  (via OpenRouter)           |
|                       |                   |                            |
|                       |--- /insights --->|  Insight extraction         |
|                       |<-- insights      |  (via OpenRouter)           |
|                       |                   |                            |
|  Free APIs (direct):  |                   |                            |
|  PubMed, Wikipedia,   |                   |                            |
|  PubChem, Wikimedia   |                   |                            |
|                       |                   |                            |
|  DEV ONLY:            |                   |                            |
|  dev_openrouter_key --+---> OpenRouter    |                            |
+-----------------------+                   +----------------------------+
```

## Phase 1: Backend Expansion

Expand the Firebase backend to handle all LLM workloads via OpenRouter. Existing functionality remains working throughout.

### 1.1 OpenRouter Integration in Backend

**File:** `functions/src/utils/openrouter.ts` (new)

- Single OpenRouter client module
- `OPENROUTER_API_KEY` as Firebase environment secret
- Model mapping: translate internal model names to OpenRouter model IDs
  - `gemini-3-flash-preview` -> `google/gemini-2.5-flash`
  - `perplexity-sonar` -> `perplexity/sonar`
  - (extensible mapping object)
- Streaming support (SSE passthrough)
- Retry logic (429, 500, 502, 503 — up to 3 retries with backoff)

### 1.2 System Prompt in Backend

**File:** `functions/src/utils/systemPrompt.ts` (new)

- Move full system prompt logic from `ai/system_prompt.py` to TypeScript
- Function: `buildSystemPrompt(params)` accepts:
  - `cardContext`: { question, answer, deckName, tags, stats }
  - `insights`: string[] (card-level learning insights)
  - `mode`: "review" | "free_chat"
  - `agent`: "tutor" | "research" | "help" | "plusi"
  - `responseStyle`: "compact" | "detailed"
  - `tools`: enabled tool list
- Returns: complete system prompt string
- Agent-specific prompt sections (tutor, plusi, help, research) each in own file under `functions/src/prompts/`

### 1.3 Expand /chat Endpoint

**File:** `functions/src/handlers/chat.ts` (modify)

Current: Accepts message + history, forwards to Gemini with basic context.
New: Accepts richer payload, builds system prompt server-side.

New request body:
```json
{
  "message": "string",
  "history": [{ "role": "user|assistant", "content": "string" }],
  "cardContext": {
    "question": "string",
    "answer": "string",
    "deckName": "string",
    "tags": ["string"],
    "stats": { "knowledgeScore": 0, "reps": 0, "lapses": 0, "interval": 0 }
  },
  "insights": ["string"],
  "agent": "tutor|research|help|plusi",
  "mode": "review|free_chat",
  "responseStyle": "compact|detailed",
  "tools": ["images", "diagrams", "molecules"],
  "model": "string",
  "stream": true,
  "temperature": 0.7,
  "maxOutputTokens": 8192
}
```

Backend flow:
1. Validate auth + check quota
2. Build system prompt via `buildSystemPrompt()`
3. Call OpenRouter with system prompt + history + message
4. Stream response back to client (SSE)
5. Debit tokens

### 1.4 Expand /router Endpoint

**File:** `functions/src/handlers/router.ts` (modify)

Current: Uses Gemini for routing decision.
New: Uses OpenRouter (cheap/fast model like Gemini Flash).

- Move router prompt from `ai/router.py` to backend
- Accept same parameters, return same response shape
- Use OpenRouter instead of direct Gemini

### 1.5 New /research Endpoint

**File:** `functions/src/handlers/research.ts` (new)

- Proxies research queries to Perplexity Sonar via OpenRouter
- Auth required, quota tracked
- Request: `{ query: string, model?: string }`
- Response: `{ answer: string, citations: [{ title, url, snippet }] }`

### 1.6 New /insights/extract Endpoint

**File:** `functions/src/handlers/insights.ts` (new)

- Extracts learning insights from chat history via OpenRouter
- Auth required, quota tracked
- Request: `{ messages: [{ role, content }], cardContext: {...} }`
- Response: `{ insights: [{ type: "learned"|"weakness", text: string }] }`

### 1.7 Expand /embed Endpoint

**File:** `functions/src/handlers/embed.ts` (modify)

Current: Uses Gemini embedding API directly.
New: Check if OpenRouter supports embeddings; if not, keep direct Gemini embedding API call in backend (this is fine — the key stays server-side).

## Phase 2: Client Migration

Remove all direct API calls from the client. Replace with backend-only calls.

### 2.1 Simplify ai/gemini.py

- Remove ALL direct Gemini API calls (13+ call sites)
- Keep only backend HTTP client logic:
  - `send_request()` → calls `/chat`
  - `send_streaming_request()` → calls `/chat` with `stream: true`
- Remove: URL construction, API key usage, retry logic (backend handles retries)
- Remove: `_get_api_url()`, `_build_gemini_url()`, all `generativelanguage.googleapis.com` references

### 2.2 Simplify ai/router.py

- Remove direct Gemini LLM call for routing
- `unified_route()` → calls backend `/router` endpoint only
- Remove: router prompt (now in backend), JSON recovery logic, direct API retry
- Keep: heuristic pre-routing (Level 1/2 — no LLM needed)

### 2.3 Remove research/openrouter.py Direct Calls

- Replace direct OpenRouter call with backend `/research` endpoint call
- Same interface to caller, different transport

### 2.4 Remove storage/insights.py Direct Calls

- Replace direct OpenRouter call with backend `/insights/extract` endpoint call

### 2.5 Remove research/perplexity.py Direct Calls

- Remove direct Perplexity API call
- Research goes through backend `/research` endpoint (which uses OpenRouter → Perplexity Sonar)

### 2.6 Simplify ai/embeddings.py

- Remove direct Gemini embedding API fallback
- Only call backend `/embed` endpoint
- Remove: API key usage, direct URL construction

### 2.7 Simplify ai/models.py

- Remove direct Gemini model list call
- Only call backend `/models` endpoint
- Remove: section title generation via direct API (use `/chat` endpoint)

### 2.8 Remove ai/system_prompt.py

- Delete file entirely (prompt logic now lives in backend)
- Or: keep as empty stub that returns "" for backward compatibility during transition

### 2.9 Update ai/handler.py

- Remove system prompt assembly
- Pass card context + agent info to backend instead
- Agent loop continues to work but calls backend for each LLM turn

### 2.10 Dev-Only Bypass

**File:** `ai/gemini.py` or new `ai/dev_client.py`

- If `config.get('dev_openrouter_key')` is set → bypass backend, call OpenRouter directly
- Only used during development
- Simple, minimal implementation
- Not connected to any UI

### 2.11 Config Cleanup

**File:** `config.py`

- Remove `api_key` from defaults
- Remove `openrouter_api_key` from defaults
- Add `dev_openrouter_key` (empty string default, not in UI)
- `backend_url` remains (already exists)

## Phase 3: Cleanup

### 3.1 Remove Dead Code

- Delete or empty `ai/system_prompt.py`
- Remove all Gemini URL constants
- Remove API key validation/display in settings
- Remove `openrouter_api_key` from SettingsSidebar.jsx (if shown)

### 3.2 Remove Fallback Paths

- `ai/gemini.py`: Remove all "if no auth, call direct" fallbacks
- `ai/embeddings.py`: Remove direct API fallback
- `ai/models.py`: Remove direct API fallback
- `ai/help_agent.py`: Remove direct API fallback

### 3.3 Error Handling Update

- When backend returns error → show user-friendly message
- No silent fallback to direct API
- Specific handling for: quota exceeded, auth expired, backend down

### 3.4 Security Verification

- Grep entire codebase for `generativelanguage.googleapis.com` → must be zero
- Grep for `openrouter.ai/api` in non-dev code → must be zero
- Grep for `api.perplexity.ai` → must be zero
- Verify `config.json` template has no API keys

## Known Exceptions

### Embeddings Stay on Gemini
OpenRouter does not support embedding endpoints. The backend keeps the direct Gemini embedding API call in `handlers/embed.ts` — this is acceptable because the API key stays server-side.

### Streaming Format Change
Gemini uses native JSON array streaming; OpenRouter uses OpenAI-compatible SSE (`data: {"choices": [{"delta": {"content": "..."}}]}`). The backend must translate OpenRouter's SSE format to the existing client-expected format. The client stream consumer does not change.

### Agent Loop Tool/Function-Calling Format
OpenRouter uses OpenAI-compatible function-calling format, not Gemini-native. The backend `/chat` endpoint must translate between formats:
- Client sends tool definitions in Gemini format → backend translates to OpenAI format for OpenRouter
- OpenRouter returns function calls in OpenAI format → backend translates back to Gemini format for client
This keeps the agent loop (`ai/agent_loop.py`) unchanged.

## Files Changed Summary

### Backend (functions/src/)
| File | Action |
|------|--------|
| `utils/openrouter.ts` | **NEW** — OpenRouter client |
| `utils/systemPrompt.ts` | **NEW** — System prompt builder |
| `utils/geminiClient.ts` | **DEPRECATE** — Keep during transition, remove after Phase 3 |
| `utils/tokenPricing.ts` | **MODIFY** — Update model rates for OpenRouter model IDs |
| `prompts/tutor.ts` | **NEW** — Tutor prompt |
| `prompts/plusi.ts` | **NEW** — Plusi multi-prompt (chat, browse, card digest modes) |
| `prompts/help.ts` | **NEW** — Help agent prompt |
| `prompts/research.ts` | **NEW** — Research prompt |
| `handlers/chat.ts` | **MAJOR REWRITE** — System prompt assembly + OpenRouter + format translation |
| `handlers/router.ts` | **REWRITE** — OpenRouter + moved router prompt |
| `handlers/embed.ts` | **KEEP** — Stays on direct Gemini embedding API (server-side key) |
| `handlers/research.ts` | **NEW** — Research endpoint (Perplexity Sonar via OpenRouter) |
| `handlers/insights.ts` | **NEW** — Insight extraction endpoint |
| `index.ts` | **MODIFY** — Register new endpoints |

### Client (Python addon)
| File | Action |
|------|--------|
| `ai/gemini.py` | **MAJOR REWRITE** — Backend-only calls |
| `ai/router.py` | **SIMPLIFY** — Backend /router only (migrate before gemini.py) |
| `ai/rag.py` | **MODIFY** — Remove direct Gemini calls (lines 426-427) |
| `ai/handler.py` | **MODIFY** — Remove prompt assembly |
| `ai/system_prompt.py` | **DELETE** — Moved to backend |
| `ai/embeddings.py` | **SIMPLIFY** — Backend /embed only |
| `ai/models.py` | **SIMPLIFY** — Backend /models only |
| `ai/help_agent.py` | **SIMPLIFY** — Remove direct fallback |
| `plusi/agent.py` | **MODIFY** — Remove 2 direct Gemini calls, route through backend /chat |
| `research/openrouter.py` | **REWRITE** — Backend /research |
| `research/perplexity.py` | **DELETE** — Replaced by backend |
| `research/search.py` | **MODIFY** — Remove direct Gemini call (line 139) |
| `storage/insights.py` | **MODIFY** — Backend /insights/extract |
| `config.py` | **MODIFY** — Remove API keys, add dev key |
| `frontend/src/components/SettingsSidebar.jsx` | **MODIFY** — Remove API key input fields |

## What Does NOT Change
- Agent loop (`ai/agent_loop.py`) — stays client-side, format translation handled by backend
- Free APIs (`research/pubmed.py`, `research/wikipedia.py`, `ai/tools.py` PubChem/Wikimedia)
- Auth flow (Firebase tokens, link-code)
- Stripe billing
- Quota system
- React frontend (except settings panel API key removal)
- Bridge methods

## Latency Considerations

Every LLM call gains an extra network hop (client → Firebase → OpenRouter → LLM → back). Mitigation:
- **Firebase Functions min-instances:** Set to 1 to avoid cold-start penalty (2-5s)
- **Router caching:** Cache identical routing decisions for same message patterns (short TTL)
- **Acceptable trade-off:** Security and billing control outweigh ~100-200ms additional latency for warm instances

## Risk Mitigation

- **Phase 1 is additive:** Backend gets new capabilities without breaking existing functionality
- **Phase 2 can be tested per-file:** Each client file can be migrated independently. Migrate router (2.2) before gemini.py (2.1) for cleaner intermediate states.
- **Dev bypass ensures testability:** Developer can always test with local key
- **Rollback:** Git tags before each phase. Backend keeps `geminiClient.ts` during transition as fallback.
- **Dev key guardrail:** `dev_openrouter_key` is not documented, not in UI, and logs a warning when active

## Testing Strategy

- **Phase 1:** Test each new backend endpoint independently (curl/Postman). Verify quota deduction, streaming, error handling.
- **Phase 2:** After each file migration, run `python3 run_tests.py` to verify no regressions. Manual E2E test in Anki after each major file.
- **Phase 3:** Final grep verification (zero direct API URLs in codebase). Full E2E test of all flows.
