# Chat System Redesign — Design Spec

## Problem Statement

The current chat system is broken across multiple layers: streaming has dead code and race conditions, error handling never reaches the frontend, per-card SQLite sessions exist but are never wired into the chat flow, and a legacy JSON session system coexists with the new SQLite approach. The retrieval pipeline (Router → SQL → Generator) works but lacks semantic search. The system needs a clean rebuild.

## Goals

1. Make the chat work reliably (streaming, errors, persistence)
2. Clean architecture: one session system (SQLite, per card), request-ID-based streaming
3. Hybrid retrieval: SQL queries + vector embeddings via Gemini
4. Two distinct chat modes: Reviewer Chat (per-card) and Freechat (ephemeral)

## Non-Goals

- Detailed card stats dashboard (future feature)
- Multi-provider support (everything runs on Gemini now)
- Freechat persistence or history

---

## Architecture

### Two Chat Modes

**1. Reviewer Chat (Side Panel)**
- DockWidget side panel, opens only when card is flipped (answer revealed)
- One SQLite session per card (`card_id` is the key)
- Sections grouped by review attempt
- Auto-closes on card change, session saved in background
- AI context = current card + retrieved relevant cards

**2. Freechat (Deck Browser Overlay)**
- Fullscreen overlay triggered from deck browser search bar
- Single global chat, not bound to any deck or card
- Ephemeral — no persistence, no history
- AI context = query-based retrieval only (no card context)
- One active chat at a time

### Session Model (SQLite)

```
card_sessions
├── card_id (PK — one session per card, matches Anki card ID)
├── deck_id
├── created_at
└── updated_at

review_sections
├── id (PK)
├── session_id (FK → card_sessions)
├── section_number (auto-increment per session)
├── review_type (flip | mc | text_input)
├── score (nullable — e.g., MC score, rating)
├── previous_score (nullable — for trend calculation)
├── created_at
└── metadata (JSON — flexible for future stats)

messages
├── id (PK)
├── section_id (FK → review_sections)
├── role (user | bot | system)
├── content (text)
├── request_id (UUID — links to streaming request)
├── citations (JSON — referenced cards)
├── steps (JSON — reasoning steps shown in UI)
├── created_at
└── metadata (JSON)
```

**Migration:** Legacy `sessions.json` and `useSessions.js` are removed entirely. No migration of old data — clean start.

### Request-ID System

Every AI request gets a UUID. All streaming chunks, steps, citations, and errors reference this ID.

```
Frontend                          Backend
   │                                 │
   ├─ sendMessage(text, requestId) ──►
   │                                 ├─ Start AIRequestThread(requestId)
   │                                 │
   ◄── streaming(requestId, chunk) ──┤
   ◄── streaming(requestId, chunk) ──┤
   ◄── ai_step(requestId, step) ─────┤
   ◄── rag_sources(requestId, cits) ─┤
   ◄── streaming(requestId, done) ───┤
   │                                 │
   │  OR on error:                   │
   ◄── error(requestId, message) ────┤
```

Benefits:
- No race conditions between concurrent requests (e.g., section title generation vs. chat)
- Frontend can match responses to requests
- Eliminates the 1.5s hardcoded delay for section titles
- Clean error attribution

### Streaming Flow (Rebuilt)

1. Frontend generates `requestId` (UUID), sends with message
2. Python creates `AIRequestThread(requestId, ...)`
3. Thread emits `chunk_signal(requestId, chunk, done, metadata)` — single signal, no duplicate functions
4. Widget receives signal on main thread, sends to frontend via `ankiReceive`
5. On `done=True`: metadata (steps, citations) included in final chunk payload
6. On error: `error_signal(requestId, error_message)` → frontend receives `{type: "error", requestId, message}`
7. Frontend `useChat` matches by `requestId`, updates correct message

**Dead code removed:** Only one `on_streaming_chunk` handler. No `_last_rag_metadata` shared state — metadata flows through the signal.

### Persistence Flow

```
User types message
  → INSERT message (role=user) immediately
  → Start AI request

AI streams response
  → Display in UI (StreamingChatMessage)
  → On done: INSERT message (role=bot) with steps/citations

Card changes
  → Chat closes (animation out)
  → Session already persisted (each message saved individually)
  → New card: load session from SQLite or create empty
```

### Error Handling

All errors flow through a single path:
1. `AIRequestThread` catches exception → emits `error_signal(requestId, error_message)`
2. Widget `on_error(requestId, message)` → sends `{type: "error", requestId, message}` to frontend
3. Frontend `useChat` matches `requestId` → shows error in chat as error-styled message
4. User can retry (re-sends with new `requestId`)

---

## Hybrid Retrieval

### Overview

```
User Question
     │
     ▼
Gemini Flash (Router)
     │
     ├─ "sql" ──────► SQL Query on Anki DB ──► Cards
     │                                            │
     ├─ "semantic" ──► Vector Search ────────► Cards ──► Merge + Rank
     │                                            │         │
     └─ "both" ──────► SQL + Vector ─────────► Cards ──────►│
                                                             ▼
                                                     Top-K Cards as Context
                                                             │
                                                             ▼
                                                   Gemini (Generator) + Current Card
                                                             │
                                                             ▼
                                                        Response
```

### Router Prompt (Gemini Flash)

The router receives the user's question and decides:
- `sql`: Generate SQL query (for structural queries — tags, decks, specific fields)
- `semantic`: Generate search terms (for meaning-based queries — "explain", "relate", "why")
- `both`: Generate SQL + search terms

Returns JSON: `{mode: "sql"|"semantic"|"both", sql_query?: string, search_terms?: string[]}`

### Vector Embeddings

**API:** Gemini Embedding API (`text-embedding-004` or latest)

**Storage:** `card_embeddings` table in same SQLite database:
```
card_embeddings
├── card_id (PK, matches Anki card ID)
├── embedding (BLOB — numpy array serialized)
├── content_hash (SHA256 of card text — for staleness detection)
├── model_version (string — embedding model used)
├── created_at
└── updated_at
```

**In-Memory Index:** On profile load, all embeddings are loaded into a numpy array. Cosine similarity search is a single matrix multiply — <10ms for 50k cards. Note: numpy must be bundled with the addon (or use a pure-Python fallback for environments where native extensions are problematic).

**Embedding Schedule (Lazy + Background):**
1. **Lazy:** When a card is shown in reviewer and has no embedding (or stale), embed immediately
2. **Background:** After profile opens, a QThread batch-embeds all un-embedded cards (50 per API call, with rate limiting and exponential backoff for API quota errors)
3. **Staleness:** On card edit, `content_hash` changes → embedding marked stale → re-embedded on next access or by background job

### Context Assembly

For Reviewer Chat:
```
context = {
  current_card: full card content (question + answer + tags + deck),
  retrieved_cards: top-K relevant cards from hybrid retrieval,
  chat_history: messages from current section (+ optionally summary of previous sections),
  review_data: current section's score/type
}
```

For Freechat:
```
context = {
  retrieved_cards: top-K relevant cards from hybrid retrieval,
  chat_history: current conversation (ephemeral)
}
```

---

## UI/UX

### Section Dividers

Created automatically when the user answers a card (flip rating, MC selection, text input). Contains:
- Review number (#1, #2, #3...)
- Date/time
- Review type (flip/MC/text)
- Score (if applicable)
- Trend indicator (from 2nd review onwards):
  - ↑ improved
  - ↓ declined
  - → same
  - Mini-sparkline when 5+ data points (future)

### Chat Open/Close

- **Opens:** Only when card is flipped. Button on the revealed card. Smooth slide-in animation.
- **Closes:** Automatically on card change. Smooth slide-out/fade animation. Session persisted.
- **Scrolling through answered cards:** Chat button available since cards are already flipped.
- **Cmd+I:** Kept as developer shortcut for testing.

### Freechat

- Triggered from deck browser search bar
- Opens as fullscreen overlay
- Single text input, streaming response
- No session switching, no history
- Closes back to deck browser

---

## Files to Remove (Legacy)

- `sessions.json.bak` — old session backup
- `useSessions.js` — legacy JSON session hook
- All `sessions.json` references in bridge.py, widget.py
- `loadSessions()` / `saveSessions()` bridge methods
- Legacy session logic in `SessionContext.jsx`
- Multi-provider settings UI (keep Gemini only)

## Files to Modify

- `widget.py` — remove duplicate `on_streaming_chunk`, add request-ID system, wire SQLite persistence
- `bridge.py` — remove legacy session methods, add new card session methods with request-ID
- `ai_handler.py` — add request-ID to all callbacks, implement hybrid retrieval, vector embedding
- `card_sessions_storage.py` — finalize schema, add embedding table, add message CRUD
- `card_tracker.py` — trigger section creation on card answer
- `App.jsx` — remove legacy session loading, wire SQLite sessions
- `useChat.js` — request-ID matching, remove hardcoded delays, proper error handling
- `useCardSession.js` — wire into chat flow (save messages on send/receive)
- `SessionContext.jsx` — simplify to only handle card session switching
- `SectionDivider.jsx` — add trend indicator
- `custom_reviewer/__init__.py` — ensure chat button only shows on flipped cards

## New Files

- `embedding_manager.py` — Gemini embedding API, in-memory index, background job
- `hybrid_retrieval.py` — Router + SQL + semantic search orchestration
- `frontend/src/hooks/useRequestId.js` — UUID generation and request tracking

---

## Phases

### Phase 1 — Chat Works Again
- Remove legacy JSON session system entirely
- Wire SQLite sessions into chat flow (per card, sections, messages)
- Fix streaming: remove dead code, add request-IDs, fix error handling
- Card change → chat closes, session saves
- Single `on_streaming_chunk`, metadata through signal (no shared state)
- Reviewer chat only (no freechat yet)

### Phase 2 — Hybrid Retrieval
- Gemini Embedding API integration
- `card_embeddings` table + in-memory numpy index
- Lazy + background embedding schedule
- Gemini Flash router (SQL vs. semantic vs. both)
- Context assembly with current card + retrieved cards

### Phase 3 — Polish
- SectionDivider trend indicator (↑↓→, later sparkline)
- Smooth chat open/close animations
- Freechat overlay from deck browser
- Remove old multi-provider settings UI
- Performance optimization (embedding batch size tuning, index warm-up)
