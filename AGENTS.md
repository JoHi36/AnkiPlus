# Agent Architecture

## Overview

AnkiPlus uses a router-orchestrated agent platform with four agents: **Tutor** (default), **Research**, **Help**, and **Plusi**. Every user message is routed through a three-level router that selects the appropriate agent. Each agent has a defined run function, a tool list, and context sources. All agents are dispatched through a single `_dispatch_agent()` path in `AIHandler`. The handoff protocol allows agents to delegate to other agents mid-response.

Defined in: `ai/agents.py`, `ai/router.py`, `ai/handler.py`

---

## Agents

### Tutor (default)

**Purpose**: The primary learning assistant. Explains card content, answers learning questions, creates diagrams, and searches decks.

**Pipeline**: RAG retrieval (`ai/rag_pipeline.py`) -> system prompt construction (`ai/system_prompt.py`) -> streaming response via Gemini (`ai/gemini.py`) -> handoff detection.

**Context sources**: `card`, `card_review`, `insights`, `rag`, `session`, `deck_info`, `memory`

**Tools**: `search_deck`, `show_card`, `show_card_media`, `search_image`, `create_mermaid_diagram`, `get_learning_stats`, `compact`, `spawn_plusi`, `search_web`

**Models**: premium `gemini-3-flash-preview`, fast/fallback `gemini-2.5-flash`

**Can hand off to**: `research`

Defined in: `ai/agents.py:306`, run function: `ai/tutor.py:run_tutor`

---

### Research

**Purpose**: Searches the internet for cited, high-quality sources. Activated when the user explicitly requests internet research or asks about current information that cannot exist in flashcards.

**Sources**: PubMed (medical/clinical queries), Wikipedia (definition/overview queries), Perplexity (general web search). Query classification (`research/search.py`) routes to the appropriate source based on keyword patterns.

**Tools**: `search_pubmed`, `search_wikipedia`, `search_perplexity`

**Context sources**: `session`, `deck_info`, `memory`

**Can hand off to**: `tutor`

**Routing hint**: Delegates only for explicit internet/source requests or clearly time-sensitive information. Not activated for questions answerable from flashcards.

Defined in: `ai/agents.py:356`, run function: `research/search.py:run_research`

---

### Help

**Purpose**: Answers questions about app features, settings, and navigation. Has an inline documentation context (`HELP_CONTEXT`) covering agents, keyboard shortcuts, settings locations, and feature descriptions.

**Tools**: `change_theme`, `change_setting`, `navigate_to`, `explain_feature` (declared in agent definition; not yet registered in `ToolRegistry` as of current codebase)

**Context sources**: `memory`

**Routing hint**: Triggered by app/settings keywords (dark mode, einstellung, theme, navigation questions). Not for learning questions.

**Can hand off to**: `tutor`

**Models**: `gemini-2.5-flash` for all tiers

Defined in: `ai/agents.py:402`, run function: `ai/help_agent.py:run_help`

---

### Plusi

**Purpose**: Personal learning companion with its own character, persistent memory, mood system, and diary. Not a factual assistant — handles emotional/personal interactions and casual conversation.

**Character**: Defined by `PLUSI_SYSTEM_PROMPT` in `plusi/agent.py`. Has autonomy over its interests, an internal `thoughts` scratchpad (private, shown next turn), a `self/user/moments` memory store, and optional dream/reflect cycles. Uses Ich-Perspektive throughout.

**Mood and friendship**: After each run, `_plusi_on_finished` callback (defined in `ai/agents.py:253`) syncs mood to the dock, notifies the diary panel, and triggers reflect checks. Friendship data is tracked and updated.

**Tools**: `diary_write`, `reflect`, `mood_update` (declared in agent definition)

**Context sources**: `memory`, `agent_state`

**Routing hint**: Only activated when user explicitly mentions "Plusi" or "@Plusi", or when the message is purely emotional with no factual component. Not activated for learning questions even if the user is frustrated.

**Special**: `tools_configurable=False` — tools cannot be toggled in the UI. `widget_type='budget'` — token budget widget shown in Agent Studio. Uses `on_finished=_plusi_on_finished` lifecycle callback.

**Models**: premium `claude-sonnet`, fast/fallback `gemini-2.5-flash`

**Can hand off to**: `tutor`

Defined in: `ai/agents.py:444`, run function: `plusi/agent.py:run_plusi`

---

## Routing

### Three-Level Router

`route_message()` in `ai/router.py:332` runs three levels in order, returning on the first match:

**Level 1 — Explicit signals (0ms, no LLM)**

1. **Lock mode**: If `session_context['locked_agent']` is set, route there unconditionally. Method: `'lock'`. Defined in `ai/router.py:57`.
2. **@mention detection**: Scans the start of the message for `@<name>` or `@<label>` patterns against all enabled agents. Strips the mention from the message (`clean_message`). Method: `'mention'`. Defined in `ai/router.py:65`.

**Level 2 — Heuristics (0ms, no LLM)**

Keyword pattern matching for clear-cut cases. Currently handles:
- Help agent keywords: `dark mode`, `light mode`, `einstellung`, `settings`, `theme ändern`, etc.
- Plusi: message starts with `plusi` or `hey plusi` (case-insensitive)

Method: `'heuristic'`. Defined in `ai/router.py:102`.

**Level 3 — Unified LLM routing (~300ms)**

Calls Gemini Flash (`router_model` config key, default `gemini-2.5-flash`) with a compact prompt containing the user message, current card hint, and agent descriptions built from `router_hint` fields. Returns JSON with agent selection and search strategy (queries, retrieval mode, response length, search scope). Defined in `ai/router.py:161`.

Falls back to `method='default'` (Tutor with `search_needed=True`) on API error, timeout, or missing API key.

If no non-default agents are enabled, Level 3 is skipped and the default Tutor result is returned directly.

### UnifiedRoutingResult

`@dataclass` returned by `route_message()`. Defined in `ai/router.py:33`.

Key fields:
- `agent` (str): agent name (`'tutor'`, `'research'`, `'help'`, `'plusi'`)
- `method` (str): how routing was decided (`'lock'`, `'mention'`, `'heuristic'`, `'llm'`, `'default'`)
- `clean_message` (Optional[str]): message with @mention stripped
- `search_needed` (Optional[bool]): whether RAG retrieval should run (Tutor only)
- `retrieval_mode` (Optional[str]): `'sql'`, `'semantic'`, or `'both'`
- `precise_queries`, `broad_queries`, `embedding_queries` (Optional[list]): search queries generated by the LLM router

`handler.py` consumes the result via `get_response_with_rag()`, which passes `routing_result` into `extra_kwargs` so the Tutor's RAG pipeline can use the pre-generated queries.

---

## Tools

### Tool Registry

`ToolRegistry` in `ai/tools.py:119`. A single global instance `registry` is instantiated at module level. Tools register at import time via `registry.register(ToolDefinition(...))`.

`ToolDefinition` fields (defined in `ai/tools.py:82`):
- `name`: unique tool name matching `schema['name']`
- `schema`: Gemini-format function declaration dict
- `execute_fn`: callable receiving args dict, returning result
- `category`: logical group (`'content'`, `'learning'`, `'research'`, `'meta'`)
- `config_key`: key in `ai_tools` config dict that toggles this tool; `None` = always enabled
- `agent`: which agent owns this tool (filters `get_function_declarations()`)
- `disabled_modes`: mode strings in which the tool is suppressed (e.g. `['compact']`)
- `display_type`: `'markdown'` | `'widget'` | `'silent'`
- `timeout_seconds`: per-tool execution timeout
- `label`, `ui_description`, `configurable`: Agent Studio UI fields

`get_function_declarations(agent, ai_tools_config, mode)` returns only declarations for the given agent that pass config and mode filters. Used by agents when building Gemini API requests.

### Registered Tools

All tools are registered in `ai/tools.py`:

| Tool | Agent | Display | Config key | Purpose |
|---|---|---|---|---|
| `create_mermaid_diagram` | tutor | markdown | `diagrams` | Create Mermaid diagrams; disabled in compact mode |
| `spawn_plusi` | tutor | widget | `plusi` | Invoke Plusi sub-agent for emotional/personal responses |
| `show_card` | tutor | widget | `cards` | Show a specific Anki card widget from LERNMATERIAL note_id |
| `search_deck` | tutor | widget | (none shown) | Browse/list cards across the deck; not for knowledge lookup |
| `get_learning_stats` | tutor | widget | `stats` | Show streak, heatmap, deck overview |
| `show_card_media` | tutor | widget | (none shown) | Display images embedded in Anki card fields |
| `search_image` | tutor | widget | (none shown) | Internet image search (fallback when no card images exist) |
| `search_web` | tutor | widget | `research` | Web search via Perplexity/OpenRouter |
| `compact` | tutor | widget | `compact` | Signal to user to summarize and extract insights |

Research-specific tools (`search_pubmed`, `search_wikipedia`, `search_perplexity`) and Plusi tools (`diary_write`, `reflect`, `mood_update`) are declared in the agent definitions but executed inside the respective agent's run function, not via the central `ToolRegistry`.

---

## Agent Loop

`run_agent_loop()` in `ai/agent_loop.py:113` handles multi-turn tool use for the Tutor agent.

**Constants** (defined at `ai/agent_loop.py:23`):
- `MAX_ITERATIONS = 5` — maximum tool-call cycles per agent run
- `MAX_CONTEXT_CHARS = 100_000` — ~25k tokens, prune threshold

**Cycle**:
1. Stream from Gemini; accumulate text and detect `functionCall`
2. If no tool call, return accumulated text
3. Emit a `[[TOOL:{...}]]` loading marker (for widget tools) before execution
4. Execute tool via `execute_tool(name, args)` with per-tool timeout (`threading.Event` + daemon thread)
5. Handle result: `widget` -> emit widget marker and return `{"status": "displayed_to_user"}`; `markdown` -> stream result text; `silent` -> feed back to model only; `error` -> emit error marker
6. Append `functionCall` + `functionResponse` to `contents`
7. Run `_prune_contents()` to stay within budget: keeps first entry and last 4, drops oldest middle entries
8. Loop (max `MAX_ITERATIONS`)

**Terminal tools**: If a widget tool returns `{"type": "compact"}`, the loop stops immediately after execution without another LLM call.

---

## Handoff Protocol

Agents signal continuation to another agent by emitting a structured text block at the end of their response. Defined in `ai/handoff.py`.

**Signal format** (in agent output text):
```
HANDOFF: research
REASON: <brief reason>
QUERY: <search terms>
```

**`parse_handoff(agent_output)`** (`ai/handoff.py:32`): detects the pattern via regex, strips it from the visible output, and returns `(clean_text, HandoffRequest)`.

**`validate_handoff(request, current_agent, chain_history, config)`** (`ai/handoff.py:60`): checks:
- Current agent is registered
- Target is in `can_handoff_to` for the current agent
- Target agent exists and is enabled in config
- No cycles (target not already in `chain_history`)
- Chain depth does not exceed `config['max_chain_depth']` (default: 2)

**Current wiring**: The Tutor (`ai/tutor.py`) calls `parse_handoff` and `validate_handoff` on its generated output. If valid, it dispatches the handoff query to the target agent. Other agents do not currently implement handoff initiation.

**Allowed handoff paths**:
- `tutor` -> `research`
- `research` -> `tutor`
- `help` -> `tutor`
- `plusi` -> `tutor`

---

## System Prompts

`get_system_prompt(mode, tools, insights)` in `ai/system_prompt.py:93` returns the base system prompt (`SYSTEM_PROMPT`) used by the Tutor. The base prompt instructs the model on knowledge source priority (user's cards first), tool usage priority, quiz format, formatting conventions, and language.

`HANDOFF_SECTION` (appended conditionally) provides the Tutor with explicit instructions for when and how to emit the handoff signal.

**Per-agent prompt construction**:
- **Tutor**: `get_system_prompt()` + card context + RAG results injected as `LERNMATERIAL` block + optional insights block
- **Plusi**: `PLUSI_SYSTEM_PROMPT` defined inline in `plusi/agent.py:43` — a first-person character prompt with autonomy, silence, thoughts/memory, and dream instructions
- **Help**: `HELP_SYSTEM_PROMPT` defined inline in `ai/help_agent.py:53` — references `HELP_CONTEXT` with app documentation
- **Research**: Prompt constructed inside `research/search.py` with source-specific instructions

Router prompt sections for the LLM router are auto-generated from `AgentDefinition.router_hint` fields via `get_router_subagent_prompt(config)` in `ai/agents.py:165`.
