# Plusi als einheitliche AI-Identität — Design Spec

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this spec.

**Goal:** Transform Plusi from a decorative mascot into a unified AI identity — a sub-agent with its own personality, memory, tools, and persistent history — integrated cleanly into a professional UI without compromising quality.

**Core Principle:** Plusi is not a chat partner you address directly. Plusi is a **living UI element** that the main AI can spawn via tool call. Plusi has its own AI model, its own conversation history, and its own tools. The user writes in one chat — the AI decides when Plusi appears.

---

## 1. Architecture Overview

### Three Layers

```
┌─────────────────────────────────────────────────┐
│  MAIN AI (Tutor)                                │
│  - Gemini Flash (full model)                    │
│  - Tutor system prompt                          │
│  - Tools: diagrams, images, RAG, spawn_plusi    │
│  - Context: depends on location (see §2)        │
└──────────────────┬──────────────────────────────┘
                   │ spawn_plusi({situation: "..."})
                   ↓
┌─────────────────────────────────────────────────┐
│  PLUSI SUB-AGENT                                │
│  - Gemini Flash (lightweight)                   │
│  - Plusi personality prompt (85 char max)        │
│  - Own persistent history (cross-deck)           │
│  - Own tools: app config, theme, navigation      │
│  - Input: situation context from main AI         │
│  - Output: {mood, text, action?}                 │
└──────────────────┬──────────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────────┐
│  COMPANION DOCK (passive, read-only)            │
│  - Bottom-left, 48px animated character          │
│  - Mood reflects last Plusi interaction           │
│  - Rule-based reactions (no AI call)             │
│  - Not addressable by user                       │
└─────────────────────────────────────────────────┘
```

### Role Separation

| | Main AI (Tutor) | Plusi (Sub-Agent) |
|---|---|---|
| **Focus** | Knowledge, learning, explaining | App control, emotion, orientation |
| **Tools** | Diagrams, images, RAG, spawn_plusi | App config, theme, navigation, help |
| **Prompt** | Long tutor system prompt | Short personality prompt |
| **Model** | Gemini Flash (full) | Gemini Flash (light, fast) |
| **Output** | Text + content widgets | Mood + short text (≤85 chars) + optional action |
| **History** | Per-card or per-deck (see §2) | Own persistent history, cross-deck |
| **Context** | Card content + card chat OR deck chat | Situation from tutor + own history |

---

## 2. Two-Level Chat Architecture

### Card-Level (during review)

- Sidebar chat shows only messages associated with this card
- AI context: **card content (front/back) + card-specific chat history**
- Messages stored with `card_id` set
- When user switches cards → chat switches (as it works now)

### Deck-Level (stack overview)

- Same chat area, but shows ALL messages chronologically
- AI context: **last N messages chronologically (cross-card), no card content**
- AI uses `search_cards` tool if it needs card data
- Messages written here have `card_id = NULL`

### Data Flow — One-Way Upstream

- **Card-Chat → Deck-Chat:** Messages appear in both views (card messages have both `card_id` and `deck_id`)
- **Deck-Chat → Card-Chat:** Messages stay ONLY in deck chat (`card_id = NULL`, never appears in card view)

### Data Model

Every message has:
```
deck_id     — which deck (required)
card_id     — which card (nullable; NULL = deck-level message)
timestamp   — when written (for chronological ordering)
role        — 'user' | 'assistant'
content     — message text
source      — 'tutor' | 'plusi' | 'user' (for filtering Plusi messages)
```

- **Card view query:** `WHERE card_id = X ORDER BY timestamp`
- **Deck view query:** `WHERE deck_id = X ORDER BY timestamp`
- **Plusi history extraction:** `WHERE source = 'plusi' ORDER BY timestamp` (cross-deck)

---

## 3. Agent Framework

### New Files (replace current inline tool logic)

**`tool_registry.py`** — Central tool definitions

- All tool schemas in one place (Gemini `functionDeclarations` format)
- Each tool has: name, schema, execute function, category (content/action), enabled flag
- Plugin-style: new tools added by registering, no other code changes needed

**`agent_loop.py`** — Multi-turn agent loop

- Replaces current single-turn call in `_get_google_response_streaming()`
- While loop: call Gemini → check for tool calls → execute → send result back → repeat
- Max 5 iterations per request
- Streams text parts immediately to frontend
- Shows progress during tool execution ("Plusi sucht Karten...")

**`tool_executor.py`** — Tool call router

- Dispatches tool calls to the correct handler function
- Handles errors gracefully (returns error message to AI for retry)
- Logs tool usage for debugging

### Tools V1

**Content Tools (appear in chat):**

| Tool | Description | Status |
|---|---|---|
| `spawn_plusi` | Trigger Plusi sub-agent with situation context | New |
| `create_diagram` | Mermaid diagram rendering | Migrate from existing |
| `search_image` | Image search | Migrate from existing |
| `show_card_preview` | Inline Anki card preview in chat | New |

**Action Tools (do something in the app):**

| Tool | Description | Status |
|---|---|---|
| `search_cards` | RAG search through user's cards | New |
| `open_deck` | Navigate to a specific deck | New |
| `get_statistics` | Fetch learning progress | New |
| `toggle_theme` | Switch dark/light mode | New |

**Each tool is individually toggleable in Settings** — extending the existing ai_tools config pattern.

### Context-Dependent Tool Availability

- Card chat: All tools available, card content provided automatically in system prompt
- Deck chat: All tools available, card content only via `search_cards` tool call

---

## 4. Plusi Sub-Agent

### Trigger Flow

1. Main AI processes user message
2. Main AI decides Plusi is needed → calls `spawn_plusi({situation: "..."})`
3. Frontend immediately renders **skeleton widget** in chat (outline + thinking dots)
4. Backend makes separate Gemini Flash call with:
   - **System prompt:** Plusi personality (short, 85-char constraint)
   - **History:** Plusi's own persistent conversation history (last N entries)
   - **User input:** The situation context string from the main AI
5. Plusi responds: `{"mood":"empathy","text":"ey, Pharma ist hart..."}`
6. Frontend replaces skeleton with **live Plusi widget** (animated mood + text)
7. Plusi's response stored in `plusi_history`

### Plusi's Own Tools

Plusi has a separate, smaller set of tools for app interaction:

| Tool | Description |
|---|---|
| `read_app_config` | Read app config/docs for "how does X work?" questions |
| `toggle_theme` | Switch dark/light mode |
| `open_deck` | Navigate to a deck |
| `show_help` | Display help/onboarding widget |

These are Plusi's own `functionDeclarations` passed to Plusi's Gemini call — not the main AI's tools.

### Plusi History Structure

Stored in a separate SQLite table (`plusi_history`):

```
id          — auto-increment
timestamp   — when the interaction happened
context     — the situation string from the main AI (stored as "user" role)
response    — Plusi's response text (stored as "assistant" role)
mood        — the mood Plusi chose
deck_id     — which deck this happened in (nullable, for context)
```

This is **cross-deck** — Plusi remembers across all decks. The AI call receives the last N entries as history, giving Plusi continuity.

### Plusi System Prompt

The existing companion prompt (from `useCompanion.js`) becomes the Plusi sub-agent prompt, with adjustments:
- Same personality (direct, honest, short, WhatsApp-style)
- Same mood prefix requirement
- Same 85-char constraint
- Added: awareness that input comes from the tutor (situation descriptions), not directly from user
- Added: tool usage instructions for Plusi's own tools

---

## 5. Companion Dock (Review Mode)

### What It Is

Passive, read-only widget. Bottom-left of screen during review. 48px animated Plusi character + Apple Glass card for short text.

### What Changes From Current Implementation

| Current | New |
|---|---|
| Click to toggle companion mode | No toggle — always visible during review |
| Own AI call on user click | No own AI call — mood comes from spawn_plusi tool results |
| User writes to Plusi via chat input intercept | No chat intercept — user writes to tutor, Plusi spawns when needed |
| Greeting on activate | No activation — Plusi just reacts |

### Rule-Based Reactions (No AI Call)

| Event | Dock Reaction |
|---|---|
| Card correct | Brief smile animation |
| 3x correct in a row | Happy bounce + "läuft!" in glass card |
| Card wrong | Empathy mood |
| 5 min idle | Sleepy mood |
| Session start | Neutral float |
| Streak milestone | Excited + celebration text |

### Mood Sync

When the main AI spawns Plusi in the chat (via tool call), the dock's mood updates to match. This creates visual coherence — Plusi in the chat and Plusi in the dock feel like the same entity.

---

## 6. Chat Widget Rendering

### Plusi Widget in Chat Messages

When `spawn_plusi` returns, the chat renders a special widget block:

**Skeleton State** (while Plusi AI is loading):
- Widget outline with thinking animation (dots or pulse)
- Appears inline as part of the streamed message

**Live State** (when Plusi responds):
- Plusi character with current mood (animated — only the LAST widget animates, older ones freeze)
- Short text next to or below character
- Optional action confirmation (e.g., "Dark Mode aktiviert ✓")
- Blue accent framing to distinguish from regular text

**Frozen State** (older widgets in chat history):
- Static Plusi with the mood from that message
- No animation
- Text visible

**Exact visual design TBD** — needs to be tested natively in the app. Options range from full animated character to minimal (Plus icon + blue text). Will be determined during implementation with visual testing.

---

## 7. Start Page Integration

### DeckBrowser Changes

- The existing search/input field at the top of the DeckBrowser gets the **Plus icon** (not the animated character — just the brand mark) replacing the current icon
- Typing and pressing Enter transitions from DeckBrowser to the **Deck Chat** view (chronological stream)
- This is the same mechanism as the current Free Chat, but now showing the deck's chronological message stream
- Plusi tools are available here — the AI can spawn Plusi widgets in responses

### No Animated Plusi on Start Page

The animated Plusi character (with face, eyes, mouth) lives **only** in:
1. The Companion Dock during review
2. Plusi widgets spawned in chat messages

The start page stays clean and professional. Plusi's presence is the Plus icon in the input and the personality in responses.

---

## 8. Future-Ready Architecture (Not in V1 Scope)

These features are NOT implemented in V1 but the architecture must support them without refactoring:

### Plusi Memory System

**Requirement:** `plusi_memory` table (key-value store) alongside `plusi_history`.

```
key         — e.g., "user_name", "strong_subjects", "weak_subjects", "preferences"
value       — JSON blob
updated_at  — timestamp
```

Plusi's system prompt can include relevant memory entries as context. Memory is populated by Plusi over time (via a future `update_memory` tool).

**Architecture support needed now:**
- `plusi_memory` table created (empty)
- Plusi's system prompt template has a `{memory_context}` slot
- Memory tool slot reserved in Plusi's tool registry

### Onboarding / Tutorial

**Requirement:** When certain events fire for the first time (first app launch, first deck, first review), Plusi can be triggered with an onboarding context.

**Architecture support needed now:**
- Event system (`plusi_events`) that can detect first-time events
- `spawn_plusi` can be triggered by events, not just by the main AI
- Plusi's tool set includes `show_onboarding` (placeholder)

### Extended Plusi Tools

The tool registry is plugin-style — new Plusi tools can be added by:
1. Defining the schema in `tool_registry.py`
2. Adding the execute function in `tool_executor.py`
3. Adding a toggle in Settings

No architectural changes needed for new tools.

---

## 9. Sub-Projects & Implementation Order

| # | Sub-Project | Dependencies | Scope |
|---|---|---|---|
| 1 | **Agent Framework** | None | `tool_registry.py`, `agent_loop.py`, `tool_executor.py`, migrate existing Mermaid/Image tools |
| 2 | **Two-Level Chat** | None | Data model update, deck-chat view (chronological), card-chat filter, context switching |
| 3 | **Plusi Sub-Agent** | Agent Framework | `spawn_plusi` tool, separate AI call, Plusi history table, Plusi system prompt, chat widget rendering |
| 4 | **Plusi Tools** | Plusi Sub-Agent | `read_app_config`, `toggle_theme`, `open_deck`, `show_help` |
| 5 | **Action Tools** | Agent Framework | `search_cards`, `open_deck`, `get_statistics`, `show_card_preview` |
| 6 | **Companion Dock Refactor** | Plusi Sub-Agent | Remove companion mode, rule-based reactions, mood sync from tool calls |
| 7 | **Future Foundations** | Plusi Sub-Agent | `plusi_memory` table, event system stubs, onboarding placeholders |

Each sub-project gets its own plan → implementation cycle.

---

## 10. File Summary

| File | Action |
|---|---|
| `tool_registry.py` | **New** — Central tool definitions, plugin-style registration |
| `agent_loop.py` | **New** — Multi-turn agent loop replacing single-turn calls |
| `tool_executor.py` | **New** — Tool call router/dispatcher |
| `plusi_agent.py` | **New** — Plusi sub-agent: own AI call, own history, own tools |
| `plusi_storage.py` | **New** — Plusi history + memory SQLite tables |
| `ai_handler.py` | **Modify** — Integrate agent loop, remove inline tool handling |
| `widget.py` | **Modify** — Route spawn_plusi results, update streaming payload |
| `bridge.py` | **Modify** — New bridge methods for action tools |
| `config.py` | **Modify** — Add Plusi tool toggle, plusi_memory defaults |
| `system_prompt.py` | **Modify** — Update tool descriptions, add Plusi tool docs |
| `frontend/src/components/PlusiWidget.jsx` | **New** — Chat widget (skeleton/live/frozen states) |
| `frontend/src/components/ChatMessage.jsx` | **Modify** — Render PlusiWidget for spawn_plusi results |
| `frontend/src/components/MascotShell.jsx` | **Modify** — Remove companion mode toggle, add mood sync |
| `frontend/src/components/SettingsModal.jsx` | **Modify** — Add Plusi tool toggle |
| `frontend/src/hooks/useCompanion.js` | **Delete** — Replaced by plusi_agent.py backend |
| `frontend/src/App.jsx` | **Modify** — Remove companion mode state, update chat context logic |
| `card_sessions_storage.py` | **Modify** — Add source field, deck-level queries |
