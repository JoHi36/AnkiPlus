# Agentic Learning Platform — Architecture Redesign

**Date:** 2026-03-22
**Status:** Design
**Scope:** Complete architectural redesign — from "tutor with sub-agents" to "router-orchestrated agent platform"
**Supersedes:** `2026-03-19-agentic-core-design.md` (tool system stays, orchestration changes), `2026-03-22-thoughtstream-v6-subagent-registry-design.md` (registry evolves)

---

## Problem

The current system has a structural flaw: the Tutor is simultaneously the conversational partner, the tool orchestrator, and the sub-agent dispatcher. This creates three concrete problems:

1. **Bloated Tutor prompt** — Tool descriptions, sub-agent router hints, main model hints, RAG context, card insights, and conversational instructions all live in one system prompt. Every new agent or tool makes it worse.
2. **Inconsistent hierarchy** — Sub-agents (Plusi, Research) are invoked as tools (`spawn_plusi`, `search_web`) but they ARE agents with their own AI calls, personalities, and tools. The tool/agent distinction is blurred.
3. **No separation of concerns** — The Tutor decides routing, generates queries, manages context, AND produces the response. Adding a new agent means modifying the Tutor's prompt, the RAG router, the tool registry, and the handler — four places for one addition.

## Solution

Three-layer architecture: **Memory → Router → Agents → Tools**.

- **Memory Layer**: Persistent user profile + per-agent state. All agents read, Router writes.
- **Router**: Decides which agent handles each request. Builds curated context per agent. Generates RAG queries when needed. Validates handoffs between agents.
- **Agents**: Independent specialists with their own system prompts, chat histories, tools, and (optionally) state. Each agent does ONE thing well.
- **Tools**: Deterministic operations owned by agents. No AI reasoning, no personality. Input → output.

```
┌─────────────────────────────────────────────────────┐
│                  Memory Layer                        │
│  ┌──────────────────┐  ┌─────────────────────────┐  │
│  │  Shared Memory    │  │  Agent State             │  │
│  │  (about the user) │  │  (per agent, optional)   │  │
│  │                   │  │                          │  │
│  │  Profile, prefs,  │  │  Plusi: self, diary,     │  │
│  │  learning patterns│  │  friendship, mood,       │  │
│  │                   │  │  user-view, thoughts     │  │
│  └──────────────────┘  └─────────────────────────┘  │
└──────────────────┬──────────────────────────────────┘
                   │ reads + writes (async, post-response)
┌──────────────────┴──────────────────────────────────┐
│                    Router                            │
│                                                      │
│  Per request:                                        │
│  1. Read Memory + Session Context                    │
│  2. Route: which agent? (3-level: explicit→state→LLM)│
│  3. Build: context summary for selected agent        │
│  4. Generate: RAG queries (if Tutor selected)        │
│  5. Post-response: validate handoffs, update memory  │
│                                                      │
└───────┬────────┬────────┬────────┬──────────────────┘
        │        │        │        │
        ▼        ▼        ▼        ▼
    ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
    │Tutor │ │Resrch│ │ Help │ │Plusi │
    │      │ │      │ │      │ │      │
    │Tools:│ │Tools:│ │Tools:│ │Tools:│
    │ RAG  │ │PubMed│ │theme │ │diary │
    │ diag │ │Wiki  │ │setngs│ │reflct│
    │ imgs │ │Perpl │ │navig │ │mood  │
    │ cards│ │      │ │docs  │ │      │
    │ molec│ │      │ │      │ │      │
    │ stats│ │      │ │      │ │      │
    └──────┘ └──────┘ └──────┘ └──────┘
    default   green    orange    blue
    no badge  badge    badge     badge
```

---

## Design Principles

1. **One hierarchy: Agents → Tools.** No mixed levels. Everything the user interacts with is an agent. Everything an agent uses internally is a tool. No exceptions.
2. **The Router is the brain, not the agents.** Agents are specialists. They do their job and signal when someone else should continue. The Router decides, not the agents.
3. **Every agent gets a lean prompt.** No agent carries context it doesn't need. The Router curates what each agent sees.
4. **The Tutor is invisible.** Default agent, no badge, no color glow. Other agents are "special moments" — visually distinct, infrequent.
5. **Uniform mechanisms.** Handoff, context delivery, tool execution, UI rendering — all agents use the same system. No special cases per agent.
6. **Memory is shared, state is private.** Facts about the user are shared (all agents read). Facts about an agent's inner life are private (only that agent reads).

---

## Part 1: Agent Definitions

### 1.1 AgentDefinition (replaces SubagentDefinition)

```python
@dataclass
class AgentDefinition:
    # Identity
    name: str                          # Unique ID: 'tutor', 'research', 'help', 'plusi'
    label: str                         # Display name: 'Tutor', 'Research Agent'
    description: str                   # One-line for UI/router

    # Visual
    color: str                         # Hex color for AgenticCell glow
    icon_type: str                     # 'svg', 'emote', 'none'
    icon_svg: str                      # SVG markup (or empty)
    badge_logo: str                    # Optional right-side logo ('anki', 'perplexity', '')

    # Configuration
    enabled_key: str                   # Config key: 'tutor_enabled' (always True for tutor)
    is_default: bool = False           # True only for Tutor — cannot be disabled

    # Execution
    run_module: str                    # Module path: 'ai.tutor', 'research', 'plusi.agent'
    run_function: str                  # Function name: 'run_tutor', 'run_research'

    # Tools
    tools: List[str] = field(default_factory=list)  # Tool names this agent owns

    # Context
    context_sources: List[str] = field(default_factory=list)
    # What context the Router should include for this agent:
    # 'card'       → current card front/back
    # 'card_review'→ review history (ease, lapses, interval)
    # 'insights'   → card insights (weaknesses, key concepts)
    # 'rag'        → RAG retrieval results
    # 'session'    → session messages (chronological)
    # 'deck_info'  → deck name, card count, due count
    # 'memory'     → shared memory snapshot
    # 'agent_state'→ this agent's private state

    # Routing
    router_hint: str = ''              # When Router should select this agent
    can_handoff_to: List[str] = field(default_factory=list)  # Allowed handoff targets

    # Lifecycle
    on_finished: Optional[Callable] = None  # Main-thread post-processing
    loading_hint_template: str = '{label} arbeitet...'

    # Limits
    max_history: int = 20              # Max messages from own chat history to include
```

### 1.2 Agent Registry

```python
# ai/agents.py (replaces ai/subagents.py)

AGENT_REGISTRY: dict[str, AgentDefinition] = {}

def register_agent(definition: AgentDefinition):
    """Register an agent. Tutor must be registered first."""
    AGENT_REGISTRY[definition.name] = definition

def get_agent(name: str) -> Optional[AgentDefinition]:
    return AGENT_REGISTRY.get(name)

def get_default_agent() -> AgentDefinition:
    for a in AGENT_REGISTRY.values():
        if a.is_default:
            return a
    raise RuntimeError("No default agent registered")

def get_enabled_agents(config: dict) -> List[AgentDefinition]:
    return [a for a in AGENT_REGISTRY.values()
            if a.is_default or config.get(a.enabled_key, False)]

def get_non_default_agents(config: dict) -> List[AgentDefinition]:
    """Agents that show badges (everything except Tutor)."""
    return [a for a in get_enabled_agents(config) if not a.is_default]

def get_registry_for_frontend(config: dict) -> List[dict]:
    """Serialize enabled agents for frontend."""
    return [{
        'name': a.name,
        'label': a.label,
        'description': a.description,
        'color': a.color,
        'iconType': a.icon_type,
        'iconSvg': a.icon_svg,
        'badgeLogo': a.badge_logo,
        'enabled': True,
        'isDefault': a.is_default,
        'tools': a.tools,
        'canHandoffTo': a.can_handoff_to,
        'loadingHintTemplate': a.loading_hint_template,
    } for a in get_enabled_agents(config)]
```

### 1.3 Registered Agents

#### Tutor (Default)

```python
register_agent(AgentDefinition(
    name='tutor',
    label='Tutor',
    description='Erklärt Lerninhalte basierend auf deinen Anki-Karten',
    color='transparent',             # No glow — default voice
    icon_type='none',                # No icon in header
    icon_svg='',
    badge_logo='anki',               # Anki logo top-right
    enabled_key='tutor_enabled',     # Always True, not toggleable
    is_default=True,
    run_module='ai.tutor',
    run_function='run_tutor',
    tools=['search_deck', 'show_card', 'show_card_media', 'search_image_local',
           'create_mermaid_diagram', 'get_learning_stats', 'compare_cards', 'compact'],
    context_sources=['card', 'card_review', 'insights', 'rag', 'session', 'deck_info', 'memory'],
    router_hint='',                  # Default — no hint needed
    can_handoff_to=['research'],     # Can request Research when no card match
    max_history=20,
    loading_hint_template='Suche in deinen Karten...',
))
```

**Tutor changes from current system:**
- No longer carries Research/Plusi tool definitions in its prompt
- No `spawn_plusi` or `search_web` tools — those belong to their agents
- System prompt becomes lean: only card-teaching instructions + own tool descriptions
- RAG queries are pre-generated by Router (no separate query generation in Tutor flow)

#### Research Agent

```python
register_agent(AgentDefinition(
    name='research',
    label='Research Agent',
    description='Recherchiert im Internet mit zitierten Quellen',
    color='#00D084',
    icon_type='svg',
    icon_svg=RADAR_ICON_SVG,
    badge_logo='',                   # Source-specific logo (perplexity/pubmed) set dynamically
    enabled_key='research_enabled',
    run_module='research',
    run_function='run_research',
    tools=['search_pubmed', 'search_wikipedia', 'search_perplexity', 'search_image_web'],
    context_sources=['session', 'deck_info', 'memory'],  # No RAG, no card — Research uses internet
    router_hint='Wenn der User explizit nach Quellen, Papers, oder aktuellen Informationen '
                'fragt, oder wenn der Tutor keine Kartenreferenz findet und einen Handoff '
                'signalisiert.',
    can_handoff_to=['tutor'],        # Can hand back to Tutor for summarization
    loading_hint_template='Durchsuche Quellen zu {query}...',
))
```

**Research changes:**
- `search_image_web` (internet images) moves from Tutor to Research
- `search_web` tool splits into `search_pubmed`, `search_wikipedia`, `search_perplexity` (internal tools of the Research agent, not exposed to other agents)
- Research still produces `ResearchResult` with sources array and citations

#### Help Agent (NEW)

```python
register_agent(AgentDefinition(
    name='help',
    label='Help',
    description='Erklärt die App, ändert Einstellungen, navigiert',
    color='#FF9500',                 # Orange (Apple HIG attention)
    icon_type='svg',
    icon_svg=HELP_ICON_SVG,          # Lifebuoy or compass icon
    badge_logo='',
    enabled_key='help_enabled',
    run_module='ai.help_agent',
    run_function='run_help',
    tools=['change_theme', 'change_setting', 'navigate_to', 'explain_feature'],
    context_sources=['memory'],      # Only needs user profile, no card context
    router_hint='Wenn der User nach App-Funktionen fragt, Einstellungen ändern möchte, '
                'oder Hilfe zur Bedienung braucht. Nicht für Lernfragen.',
    can_handoff_to=['tutor'],        # Can hand to Tutor if user switches to learning question
    loading_hint_template='Schaue nach...',
))
```

**Help Agent tools:**
- `change_theme(theme)`: Sets dark/light/system mode
- `change_setting(key, value)`: Modifies config values safely (whitelist of allowed keys)
- `navigate_to(target)`: Opens deck browser, stats, settings, specific deck
- `explain_feature(feature_name)`: Has a documentation context file with app feature descriptions

**Help Agent context:**
- System prompt includes a condensed app documentation file (`docs/help-agent-context.md`)
- Covers: what each agent does, how to navigate, keyboard shortcuts, settings, feature explanations

#### Plusi (Companion)

```python
register_agent(AgentDefinition(
    name='plusi',
    label='Plusi',
    description='Persönlicher Lernbegleiter mit eigenem Charakter',
    color='#0A84FF',
    icon_type='emote',               # Uses window.createPlusi(mood)
    icon_svg='',
    badge_logo='',                   # Mood label in meta slot instead
    enabled_key='mascot_enabled',
    run_module='plusi.agent',
    run_function='run_plusi',
    tools=['diary_write', 'reflect', 'mood_update'],
    context_sources=['memory', 'agent_state'],  # NO card context, NO RAG
    router_hint='Wenn der User @Plusi sagt, oder rein emotionalen/persönlichen Support '
                'braucht ohne Fachfrage.',
    can_handoff_to=['tutor'],        # Can hand to Tutor if factual question detected
    on_finished=_plusi_on_finished,
    loading_hint_template='Plusi denkt nach...',
    max_history=20,
))
```

**Plusi changes:**
- Plusi's `run_plusi()` function stays as-is (SOUL-style prompt, personality system)
- Context delivery changes: gets Router summary + own state instead of raw widget context
- Diary, friendship, mood systems unchanged

---

## Part 2: Router

### 2.1 Router Responsibilities

The Router is NOT a separate model. It is a **lightweight Gemini Flash call** that runs before every user message. It has five jobs:

1. **Route**: Decide which agent handles this message
2. **Summarize**: Build a curated context summary for the selected agent
3. **Query**: Generate RAG search queries (only when Tutor is selected)
4. **Validate**: Check handoff requests from agents (post-response)
5. **Remember**: Extract memory-worthy signals from agent outputs (async, post-response)

### 2.2 Three-Level Routing

Routing happens in three levels. Each level is tried in order. If a level produces a match, skip the rest.

```python
def route_message(user_message: str, session_context: dict, config: dict) -> RoutingResult:
    """
    Level 1: Explicit signals (0ms, no LLM)
    Level 2: State-based signals (0ms, no LLM)
    Level 3: LLM routing (Gemini Flash, ~300ms)
    """

    # Level 1: Explicit @mentions or Lock mode
    locked_agent = session_context.get('locked_agent')
    if locked_agent:
        return RoutingResult(agent=locked_agent, method='lock')

    mention = detect_agent_mention(user_message, config)
    if mention:
        return RoutingResult(agent=mention.agent, method='mention',
                             clean_message=mention.clean_text)

    # Level 2: State-based heuristics
    # (e.g., settings-related keywords → Help, emotional keywords → Plusi)
    heuristic = check_heuristics(user_message, session_context)
    if heuristic:
        return RoutingResult(agent=heuristic.agent, method='heuristic')

    # Level 3: LLM routing (only for ambiguous messages)
    return llm_route(user_message, session_context, config)
```

**Level 1 — Explicit (0ms):**
- `@Plusi hey` → Plusi
- `@Research CRISPR papers` → Research
- Lock mode active (user toggled to specific agent) → that agent
- Tab-selected agent → that agent

**Level 2 — State heuristics (0ms):**
- Message contains "dark mode", "Einstellungen", "wie komme ich" → Help
- Message is purely emoji/emotional with no factual content → Plusi (if enabled)
- In deck browser + meta-question about learning → default to Tutor

**Level 3 — LLM routing (~300ms):**
- Only when Level 1 and 2 don't match
- Uses Gemini Flash with a small prompt (~300 tokens)
- Returns agent name + reasoning

### 2.3 Router LLM Prompt

```python
ROUTER_PROMPT = """Du bist der Router eines agentischen Lernsystems.
Entscheide welcher Agent diese Nachricht bearbeiten soll.

Verfügbare Agenten:
{agent_descriptions}

Aktueller Kontext:
- Modus: {mode} (card_session / free_chat / deck_browser)
- Deck: {deck_name}
- Karte aktiv: {has_card}

Regeln:
1. Tutor ist der Default. Wähle einen anderen Agent NUR wenn klar ist,
   dass die Anfrage NICHT ins Lerngebiet fällt.
2. Research NUR wenn User explizit nach Quellen/Papers fragt oder
   der Tutor einen Handoff signalisiert hat.
3. Help NUR für App-Bedienung und Einstellungen.
4. Plusi NUR für persönliche/emotionale Interaktion ohne Fachfrage.

Antworte EXAKT in diesem Format (eine Zeile):
AGENT: <name>

Nachricht des Users:
{user_message}"""
```

**Router model:** `gemini-2.5-flash` (same model currently used for RAG routing — fast, cheap, sufficient for classification)

### 2.4 Context Building

After routing, the Router builds a context package for the selected agent. The context sources are defined in the agent's `context_sources` field.

```python
@dataclass
class AgentContext:
    """What an agent receives alongside the user message."""
    user_message: str              # Original, unmodified
    context_summary: str           # Router-built natural language summary
    agent_history: List[dict]      # This agent's own chat history (last N messages)
    memory_snapshot: dict          # Shared memory (user profile)
    agent_state: Optional[dict]    # Private agent state (only Plusi uses this)
    rag_results: Optional[dict]    # RAG retrieval results (only Tutor)
    rag_queries: Optional[dict]    # Pre-generated queries (only Tutor)
    card_context: Optional[dict]   # Current card data (front, back, review history)
    insights: Optional[dict]       # Card insights (weaknesses, key concepts)
    handoff_context: Optional[dict]# If chained: previous agent's output + reason
    session_mode: str              # 'card_session', 'free_chat', 'deck_browser'
```

**Context summary generation:**

The Router generates a 2-4 sentence natural language summary of the current situation. This is a lightweight extraction, NOT a full LLM call — it's part of the routing LLM call (same prompt, extra output field).

Extended router output format:
```
AGENT: tutor
SUMMARY: User lernt Pathologie (Deck: Pathologie Basics, 342 Karten). Reviewt gerade Karte zu Apoptose (3x falsch, Ease 1.8). Hat vorher mit dem Tutor über DNA-Reparatur gesprochen.
QUERIES: ["Apoptose Mechanismen", "programmierter Zelltod Caspase"]
```

The `QUERIES` line is only generated when `AGENT: tutor` is selected. For other agents, queries are omitted.

### 2.5 Session Context (Mode-Dependent)

The Router receives different raw context depending on the current UI mode:

```python
def build_session_context(mode: str, frontend_state: dict) -> dict:
    """Build raw session context from frontend state.
    Called before routing — provides input FOR the Router."""

    base = {
        'mode': mode,
        'deck_name': frontend_state.get('deck_name', ''),
        'deck_id': frontend_state.get('deck_id'),
    }

    if mode == 'card_session':
        base.update({
            'card_front': frontend_state.get('card_front', ''),
            'card_back': frontend_state.get('card_back', ''),
            'card_review': {
                'ease': frontend_state.get('ease'),
                'lapses': frontend_state.get('lapses'),
                'interval': frontend_state.get('interval'),
            },
            'insights': frontend_state.get('insights', []),
            'session_messages': frontend_state.get('recent_messages', []),
            # All messages in current card session — chronological
        })

    elif mode == 'free_chat':
        base.update({
            'session_messages': frontend_state.get('recent_messages', []),
            # Chronological session messages — no card context
        })

    elif mode == 'deck_browser':
        base.update({
            'deck_stats': frontend_state.get('deck_stats', {}),
            # Card count, due count, new count, etc.
        })

    return base
```

### 2.6 Router Output Structure

```python
@dataclass
class RoutingResult:
    agent: str                     # 'tutor', 'research', 'help', 'plusi'
    method: str                    # 'lock', 'mention', 'heuristic', 'llm'
    context_summary: str = ''      # Natural language summary for agent
    rag_queries: Optional[dict] = None  # Pre-generated queries (Tutor only)
    clean_message: Optional[str] = None # Message with @mention stripped
```

### 2.7 Integration with Existing RAG Router

The current `rag_router()` in `ai/rag.py` generates:
- `search_needed`, `retrieval_mode`, `embedding_queries`, `precise_queries`, `broad_queries`

The new Router absorbs this: when Tutor is selected, the Router also generates RAG queries. This merges two LLM calls (routing + query generation) into one.

```python
# Current flow (2 LLM calls):
# 1. rag_router() → decides search strategy + generates queries
# 2. Tutor model → generates response

# New flow (1 LLM call for routing, 1 for response):
# 1. Router → decides agent + generates queries (if Tutor) + builds context
# 2. Selected agent → generates response
```

The Router prompt includes the existing RAG routing instructions when Tutor is a candidate. The output format extends to include query fields:

```
AGENT: tutor
SUMMARY: User fragt nach Apoptose im Pathologie-Deck.
SEARCH_NEEDED: true
RETRIEVAL_MODE: both
PRECISE_QUERIES: ["Apoptose AND Zelltod", "Caspase AND Kaskade"]
BROAD_QUERIES: ["Apoptose OR Nekrose OR Zelltod"]
EMBEDDING_QUERIES: ["Apoptose programmierter Zelltod Mechanismen"]
SEARCH_SCOPE: current_deck
```

When `AGENT` is not `tutor`, query fields are omitted entirely.

---

## Part 3: Memory Layer

### 3.1 Shared Memory (About the User)

Persistent across sessions. All agents read. Only Router writes (async, post-response).

```python
@dataclass
class SharedMemory:
    """User profile built up over time."""
    profile: dict = field(default_factory=dict)
    # {
    #   'study_field': 'Medizin',
    #   'semester': '3. Semester',
    #   'university': 'Uni Heidelberg',
    #   'language': 'Deutsch',
    #   'exam_goal': 'Physikum August 2026',
    # }

    learning_patterns: dict = field(default_factory=dict)
    # {
    #   'strengths': ['Anatomie', 'Histologie'],
    #   'weaknesses': ['Biochemie', 'Enzymkinetik'],
    #   'preferred_style': 'Analogien und Diagramme',
    # }

    preferences: dict = field(default_factory=dict)
    # {
    #   'theme': 'dark',
    #   'response_style': 'balanced',
    #   'language': 'de',
    # }

    updated_at: str = ''  # ISO timestamp
```

**Storage:** SQLite table `shared_memory` or JSON file `memory.json` in addon data directory.

**When Memory updates:**
After each agent response completes, the Router runs a lightweight extraction (rule-based, not LLM) on the agent output to detect memory-worthy signals:

```python
def extract_memory_signals(agent_output: str, agent_name: str,
                           session_context: dict) -> List[MemoryUpdate]:
    """Rule-based extraction. Runs async post-response."""
    updates = []

    # Example rules:
    # If user mentioned their field of study and it's not in memory:
    if 'studiere' in session_context.get('user_message', '').lower():
        # Extract field via simple pattern matching
        ...

    # If agent detected repeated weakness pattern:
    if agent_name == 'tutor' and 'schwäche' in agent_output.lower():
        ...

    return updates
```

**Important:** Memory extraction is NOT an LLM call. It uses pattern matching and keyword detection. LLM-based memory extraction would add unacceptable latency and cost. Complex memory patterns emerge from accumulated simple signals over many sessions.

### 3.2 Agent State (Private)

Only the owning agent reads and writes. Currently only Plusi has meaningful state.

```python
@dataclass
class AgentState:
    """Per-agent private state. Generic container — agents define their own schema."""
    agent_name: str
    data: dict = field(default_factory=dict)
    updated_at: str = ''
```

**Plusi Agent State** (stored in `data` dict):
```python
{
    'self': {
        'mood': 'curious',
        'energy': 7,
        'interests': ['Zelluläre Signalwege', 'Musik'],
        'current_thought': 'Warum dauert Apoptose so lange?',
    },
    'user_view': {
        'name': 'Johannes',
        'relationship_notes': 'Hat Angst vor dem Physikum. Mag Analogien.',
        'shared_memories': ['Erste richtige Konversation über Mitose'],
    },
    'friendship': {
        'level': 3,           # 0-5
        'trust': 0.72,        # 0-1
        'interactions': 47,
    },
    'diary': [
        {'date': '2026-03-21', 'visible': 'Heute war ein guter Lerntag.',
         'encrypted': '||Johannes wirkte gestresst||'},
    ],
    'thoughts': ['Warum lernt er nie Biochemie?'],
    'dreams': ['Ein Wald aus Proteinen, die sich selbst falten'],
}
```

**Storage:** Existing `plusi/storage.py` system continues to work. The `AgentState.data` dict maps 1:1 to the existing Plusi storage schema. No migration needed — just a wrapper.

**Other agents:** Tutor, Research, and Help have no persistent state (empty dict). The mechanism exists for future use (e.g., Coach agent tracking long-term learning goals).

### 3.3 Memory Access Pattern

```
Request arrives:
  │
  ├── Router READS shared memory (sync, fast — SQLite/JSON read)
  ├── Router READS agent state for selected agent (sync, fast)
  │
  ├── Agent receives memory snapshot in AgentContext
  │
  ├── Response complete
  │
  └── Router WRITES memory updates (async, background)
      └── No latency impact on user
```

---

## Part 4: Handoff Protocol

### 4.1 Agent Output Structure

Every agent returns a structured output (not just text):

```python
@dataclass
class AgentOutput:
    response: str                  # The text response (streamed to user)
    handoff: Optional[HandoffRequest] = None  # Request to chain another agent
    memory_signals: List[dict] = field(default_factory=list)  # Detected patterns
    metadata: dict = field(default_factory=dict)  # Steps, citations, etc.

@dataclass
class HandoffRequest:
    to: str                        # Target agent name
    reason: str                    # Why (shown to user AND used as context)
    context: str                   # What to pass (query, summary, etc.)
```

### 4.2 Handoff Flow

```
Step 1: Agent A runs and signals handoff
────────────────────────────────────────
Tutor output:
{
  "response": "Apoptose ist der programmierte Zelltod...",
  "handoff": {
    "to": "research",
    "reason": "Ich konnte keine passende Karte in deinem Deck finden.",
    "context": "Apoptose Mechanismen Caspase-Kaskade"
  }
}

Step 2: System validates (code, no LLM)
────────────────────────────────────────
- Is 'research' in Tutor's can_handoff_to list? → Yes
- Is 'research' enabled? → Yes
- Chain depth < MAX_CHAIN_DEPTH? → Yes (depth=1, max=2)
- Is 'research' already in chain history? → No (no cycles)
→ Handoff approved.

Step 3: Build context for Agent B
────────────────────────────────────────
AgentContext for Research:
  user_message: "Was ist Apoptose?"           # Original
  context_summary: "Tutor hat Grundlagen erklärt, aber keine
                    Kartenreferenz gefunden."
  handoff_context: {
    from_agent: "tutor",
    reason: "Keine Kartenreferenz gefunden",
    previous_output: "Apoptose ist der programmierte Zelltod...",
    query: "Apoptose Mechanismen Caspase-Kaskade"
  }

Step 4: Agent B runs
────────────────────────────────────────
Research searches PubMed/Perplexity for "Apoptose Mechanismen".
Returns sources + cited summary.
No further handoff → chain complete.
```

### 4.3 Handoff Encoding in Agent Prompts

Each agent's system prompt includes a handoff instruction:

```
# Tutor prompt (excerpt):
Wenn du keine passende Karte im Deck findest, kannst du einen Handoff
an den Research Agent signalisieren. Schreibe dafür am Ende deiner
Antwort auf einer eigenen Zeile:

HANDOFF: research
REASON: Keine passende Karte gefunden
QUERY: <Suchbegriffe für die Recherche>

Der User sieht deinen Text UND die Research-Ergebnisse darunter.
Erkläre kurz, warum du recherchieren lässt.
```

The handoff is parsed from the agent's text output via regex, not via tool calls. This keeps it simple and visible to the user (the reason text is part of the response).

### 4.4 Handoff Validation

```python
MAX_CHAIN_DEPTH = 2  # Never more than 2 agents in one chain

def validate_handoff(request: HandoffRequest,
                     current_agent: str,
                     chain_history: List[str]) -> bool:
    """Validate handoff request. Returns True if approved."""
    agent_def = get_agent(current_agent)
    if not agent_def:
        return False

    # Check: target in allowed list
    if request.to not in agent_def.can_handoff_to:
        logger.warning("Handoff %s → %s not allowed", current_agent, request.to)
        return False

    # Check: target enabled
    target_def = get_agent(request.to)
    if not target_def:
        return False

    # Check: no cycles
    if request.to in chain_history:
        logger.warning("Handoff cycle detected: %s", chain_history + [request.to])
        return False

    # Check: depth limit
    if len(chain_history) >= MAX_CHAIN_DEPTH:
        logger.warning("Max chain depth reached: %d", MAX_CHAIN_DEPTH)
        return False

    return True
```

### 4.5 Allowed Handoff Paths

```
Tutor  → Research  (no card match → need internet sources)
Research → Tutor   (research done → Tutor contextualizes)
Help   → Tutor     (user switches to learning question)
Plusi  → Tutor     (factual question detected in casual chat)

NOT allowed:
Tutor → Plusi      (Tutor doesn't delegate emotional support)
Tutor → Help       (Tutor doesn't delegate app questions)
Research → Help    (no meaningful connection)
Research → Plusi   (no meaningful connection)
Help → Research    (no meaningful connection)
Help → Plusi       (no meaningful connection)
Plusi → Research   (no meaningful connection)
Plusi → Help       (no meaningful connection)
```

---

## Part 5: User Control — Interaction Modes

### 5.1 Three Modes

```
┌─────────────────────────────────────────────────┐
│                 Input Dock                       │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │ 🔀 Auto  ▾  │ Stelle eine Frage...       │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  Toggle dropdown (Tab or click):                 │
│  ┌─────────────────────────┐                    │
│  │ 🔀 Auto                 │  ← Router decides  │
│  │ ─────────────────────── │                    │
│  │ 📘 Tutor                │  ← Lock to Tutor   │
│  │ 🔍 Research Agent       │  ← Lock to Research│
│  │ ⚙️ Help                 │  ← Lock to Help    │
│  │ 💙 Plusi                │  ← Lock to Plusi   │
│  └─────────────────────────┘                    │
│                                                  │
│  Weiter SPACE           Agent Studio ↵          │
└─────────────────────────────────────────────────┘
```

**Mode 1: Auto (default)**
- Router runs on every message (3-level: explicit → state → LLM)
- Full context building including summary
- Best quality, slight latency for ambiguous messages

**Mode 2: Lock (Tab toggle)**
- User selects a specific agent
- All messages go directly to that agent
- Router still runs but ONLY for context building (no routing decision)
- Faster for sustained conversations with one agent
- Visual indicator: agent name + color in input dock
- Stays locked until user changes or switches to Auto

**Mode 3: @mention (one-shot)**
- User types `@Research CRISPR papers` in Auto mode
- This single message goes to Research
- Next message returns to Auto routing
- Level 1 routing catches this instantly (0ms)

### 5.2 Lock Mode Context

When locked, the Router doesn't need to route — but the agent still needs context:

```python
def build_lock_mode_context(agent_name: str, session_context: dict,
                            config: dict) -> AgentContext:
    """Build context without LLM routing call.
    Programmatic context assembly — faster than Auto mode."""

    agent_def = get_agent(agent_name)
    memory = load_shared_memory()
    agent_state = load_agent_state(agent_name) if 'agent_state' in agent_def.context_sources else None

    # Build context from session data (no LLM summary)
    context = AgentContext(
        user_message=session_context['user_message'],
        context_summary='',          # No LLM summary in lock mode
        agent_history=load_agent_history(agent_name, limit=agent_def.max_history),
        memory_snapshot=memory.to_dict() if 'memory' in agent_def.context_sources else {},
        agent_state=agent_state,
        rag_results=None,            # RAG handled separately if Tutor
        card_context=session_context.get('card') if 'card' in agent_def.context_sources else None,
        insights=session_context.get('insights') if 'insights' in agent_def.context_sources else None,
        handoff_context=None,
        session_mode=session_context.get('mode', 'free_chat'),
    )

    return context
```

**Trade-off:** Lock mode skips the LLM summary generation → faster, but agent gets raw context instead of curated summary. For the Tutor this barely matters (it gets the same card data either way). For Plusi it matters slightly (no "user has been studying for 2 hours" insight). Acceptable trade-off for direct user control.

### 5.3 Settings

```
Settings → Agents & Orchestrierung
├── Standard-Modus: Auto / Tutor / [Agent]
├── Router-Modell: Gemini 2.5 Flash (default) / Gemini 3 Flash
├── Agenten:
│   ├── Tutor: immer aktiv (nicht deaktivierbar)
│   ├── Research Agent: [an/aus]
│   │   └── Quellen: PubMed [✓], Wikipedia [✓], Perplexity [✓]
│   ├── Help: [an/aus]
│   └── Plusi: [an/aus]
│       └── Autonomie-Budget: [Slider]
└── Erweitert:
    ├── Max Chain-Tiefe: 2 (default)
    └── Kontext-Tiefe: Kompakt / Standard / Ausführlich
```

---

## Part 6: UI Design

### 6.1 Universal AgenticCell

Every agent response is wrapped in an AgenticCell. The existing component is extended:

```jsx
<AgenticCell
  agentName="tutor"           // Registry lookup for color, icon, etc.
  isLoading={false}
  loadingHint="Suche in deinen Karten..."
  headerMeta={null}           // Optional right-side content
  isChained={false}           // If true: no top margin (flush with previous cell)
  isConsecutive={false}       // If true: unified background gradient
>
  {/* ThoughtStream (steps, sources) */}
  <ThoughtStream ... />

  {/* Agent content */}
  <ChatMessage ... />

  {/* Footer (optional) */}
  <SourcesCarousel ... />
</AgenticCell>
```

### 6.2 Tutor Cell (Transparent)

The Tutor's AgenticCell has `color: 'transparent'`:
- No gradient glow background
- No colored header text
- No icon in header
- Only the Anki logo in the top-right meta slot
- ThoughtStream steps (keyword hits, semantic hits, sources) are INSIDE the cell
- Visually: looks like the current chat messages, but wrapped in the cell structure

```
┌─ Tutor ────────────────── [Anki Logo] ─┐
│                                          │   ← No glow, no border
│ ▸ 4 Schritte · 10 Quellen               │      (transparent bg)
│                                          │
│ Der M. popliteus hat im Kniegelenk       │
│ zwei Hauptfunktionen...                  │
│ [[1566144540615]]                        │
│                                          │
└──────────────────────────────────────────┘
```

### 6.3 Non-Default Agent Cells (Colored)

Research, Help, Plusi keep their colored AgenticCell (unchanged from current design):

```
┌─ 🔍 Research Agent ──── [perplexity] ─┐
│ ░░░░░░░░░░░░░ gradient glow ░░░░░░░░░│   ← Green (#00D084) glow
│                                        │
│ ▸ 1 Schritt                            │
│                                        │
│ Laut einer Übersicht in Nature...      │
│ [1] [2] [3]                            │
│                                        │
│ [PubMed] [Wikipedia] [Nature]          │
└────────────────────────────────────────┘
```

### 6.4 Chain Stacking (Flush Cells)

When two agents are chained, their cells stack with NO gap between them:

```
┌─ Tutor ────────────────── [Anki Logo] ─┐
│                                          │
│ ▸ 3 Schritte · 0 Quellen                │
│                                          │
│ Apoptose ist der programmierte           │
│ Zelltod...                               │
│                                          │
│ Keine passende Karte gefunden.           │
│ Ich hole den Research Agent dazu.        │
├──────────────────────────────────────────┤  ← Flush: no gap, shared border
│ 🔍 Research Agent ──── [perplexity]      │
│ ░░░░░░░░░░░ gradient glow ░░░░░░░░░░░░░│
│                                          │
│ ▸ 1 Schritt                              │
│                                          │
│ Laut PubMed...                           │
│ [1] [2] [3]                              │
│                                          │
│ [PubMed] [Wikipedia]                     │
└──────────────────────────────────────────┘
```

Implementation: `isChained={true}` on the second cell → `margin-top: 0`, shared `border-radius` only on outer corners.

### 6.5 Consecutive Same-Agent Messages

When multiple consecutive messages come from the same agent (e.g., sustained Tutor conversation), the cells share a unified background gradient instead of being separate boxes:

```
┌──────────────────────────────────────────┐
│ User: Was ist Apoptose?                  │
│                                          │
│ Tutor: Apoptose ist der                  │  ← Unified background
│ programmierte Zelltod...                 │     gradient across
│                                          │     all consecutive
│ User: Und Nekrose?                       │     Tutor messages
│                                          │
│ Tutor: Nekrose hingegen ist der          │
│ unkontrollierte Zelltod...               │
└──────────────────────────────────────────┘
```

For the Tutor (transparent), this means: no visible grouping (it's already transparent). For colored agents (e.g., sustained Plusi conversation), the gradient extends as one continuous zone rather than repeating per message.

Implementation: `isConsecutive={true}` on all but the first cell in a consecutive run → shared background, no repeated header.

### 6.6 Orchestrating Step

Every message gets an "Orchestrating" thought step at the top, before the agent cell:

```
▸ Orchestrating ─────────────────────
                                        ← Always present, collapsible
┌─ Tutor ──────────────── [Anki Logo] ─┐
│ ...                                    │
└────────────────────────────────────────┘
```

When expanded, "Orchestrating" shows what the Router decided:
- Which agent was selected
- Why (routing method: explicit, heuristic, or LLM reasoning)
- Context summary (if generated)
- RAG queries (if Tutor was selected)

This replaces the current "router" step in ThoughtStream. Same visual treatment, new label.

### 6.7 Loading States

```
▸ Orchestrating ●                       ← Pulsing dot during routing

┌─ 🔍 Research Agent ─────────────────┐
│ ░░░░░░░ gradient glow ░░░░░░░░░░░░░│
│                                      │
│ Durchsuche Quellen zu Apoptose... │  ← Loading hint from registry
│ ████████░░░░░░░░░░░░░ shimmer     │  ← Shimmer lines
│ ██████░░░░░░░░░░░░░░░             │
│                                      │
└──────────────────────────────────────┘
```

---

## Part 7: Agent Chat Histories

### 7.1 Per-Agent Storage

Each agent maintains its own message history, stored in SQLite:

```sql
-- New table (extends existing storage/card_sessions.py schema)
agent_messages (
    id          TEXT PRIMARY KEY,
    agent_name  TEXT NOT NULL,        -- 'tutor', 'research', 'plusi', 'help'
    card_id     INTEGER,              -- NULL for free chat
    deck_id     INTEGER,
    text        TEXT NOT NULL,
    sender      TEXT NOT NULL,         -- 'user' or 'agent'
    created_at  TEXT NOT NULL,
    request_id  TEXT,
    metadata    TEXT,                  -- JSON: steps, citations, pipeline_data

    -- Indexes
    INDEX idx_agent_card (agent_name, card_id, created_at),
    INDEX idx_agent_deck (agent_name, deck_id, created_at)
)
```

### 7.2 History Loading

```python
def load_agent_history(agent_name: str, card_id: int = None,
                       deck_id: int = None, limit: int = 20) -> List[dict]:
    """Load recent messages for a specific agent.

    In card_session mode: filter by card_id
    In free_chat mode: filter by deck_id (or all if no deck)
    """
    if card_id:
        query = "SELECT * FROM agent_messages WHERE agent_name=? AND card_id=? ORDER BY created_at DESC LIMIT ?"
        params = (agent_name, card_id, limit)
    elif deck_id:
        query = "SELECT * FROM agent_messages WHERE agent_name=? AND deck_id=? ORDER BY created_at DESC LIMIT ?"
        params = (agent_name, deck_id, limit)
    else:
        query = "SELECT * FROM agent_messages WHERE agent_name=? ORDER BY created_at DESC LIMIT ?"
        params = (agent_name, limit)

    rows = db.execute(query, params).fetchall()
    return [row_to_dict(r) for r in reversed(rows)]  # Chronological order
```

### 7.3 Migration from Current Storage

The existing `messages` table in `card_sessions.py` stores all messages without agent distinction. Migration strategy:

- Existing messages are attributed to `agent_name='tutor'` (they were all from the Tutor)
- New messages go to `agent_messages` table with proper agent attribution
- The existing `messages` table is kept for backward compatibility but not used for new messages
- `card_sessions` table stays unchanged (it stores card metadata, not agent-specific data)

---

## Part 8: Tool Ownership

### 8.1 Tool Assignment

Tools are assigned to agents via the `tools` field in `AgentDefinition`. The tool registry (`ai/tools.py`) continues to work as-is — the only change is that `agent` field now references the new agent names.

```
Tutor Agent tools:
├── search_deck          # SQL card search
├── show_card            # Display card details
├── show_card_media      # Show images FROM cards (local)
├── search_image_local   # RENAMED from search_image — only local/card media
├── create_mermaid_diagram
├── get_learning_stats
├── compare_cards        # NEW — side-by-side card comparison
└── compact              # Insight extraction

Research Agent tools:
├── search_pubmed        # PubMed API search
├── search_wikipedia     # Wikipedia API search
├── search_perplexity    # Perplexity/Sonar search
└── search_image_web     # NEW — internet image search (Wikimedia, PubChem)

Help Agent tools:
├── change_theme         # Set dark/light/system
├── change_setting       # Modify safe config values
├── navigate_to          # Open deck browser, stats, etc.
└── explain_feature      # Describe app features

Plusi Agent tools:
├── diary_write          # Write diary entry
├── reflect              # Trigger reflection
└── mood_update          # Update mood state
```

### 8.2 Image Tool Split

Current `search_image` tool combines local card media search and internet image search. This splits into two:

- **`search_image_local`** (Tutor): Searches card media files in Anki's media folder. Same logic as current `show_card_media`. No API call.
- **`search_image_web`** (Research): Searches Wikimedia Commons and PubChem. Uses current `image_search.py` logic. Requires internet.

The Tutor tries local first. If nothing found and Research is enabled → handoff to Research with image query. Research uses `search_image_web` to find internet images.

### 8.3 Tool Function Declarations

Each agent's Gemini function declarations only include its own tools:

```python
def get_agent_tools(agent_name: str, config: dict) -> List[dict]:
    """Get Gemini function declarations for a specific agent."""
    agent_def = get_agent(agent_name)
    if not agent_def:
        return []

    ai_tools_config = config.get('ai_tools', {})
    declarations = []

    for tool_name in agent_def.tools:
        tool_def = registry.get(tool_name)
        if not tool_def:
            continue
        # Check if tool is enabled in config
        if tool_def.config_key and not ai_tools_config.get(tool_def.config_key, True):
            continue
        declarations.append(tool_def.schema)

    return declarations
```

---

## Part 9: Execution Flow

### 9.1 Complete Request Lifecycle

```
User types "Was ist Apoptose?" in Auto mode
│
├── 1. Frontend: handleSend()
│   - Generate requestId
│   - Emit: {type: 'orchestrating', status: 'active'}
│   - Call: bridge.sendMessage(text, history, mode, requestId, sessionContext)
│
├── 2. Python: WebBridge.sendMessage()
│   - Parse sessionContext (mode, card, deck, recent messages)
│   - Call: router.route(text, sessionContext, config)
│
├── 3. Router: route_message()
│   - Level 1: No @mention, no lock → skip
│   - Level 2: No heuristic match → skip
│   - Level 3: LLM routing
│     - Prompt: ROUTER_PROMPT with agent descriptions
│     - Output: AGENT: tutor, SUMMARY: ..., QUERIES: ...
│   - Emit: {type: 'orchestrating', status: 'done', data: {agent: 'tutor'}}
│
├── 4. Context Building
│   - Load shared memory (sync read)
│   - Load Tutor's agent history for current card (sync read)
│   - Load card insights (sync read)
│   - Build AgentContext with summary, queries, card data
│
├── 5. RAG Retrieval (Tutor-specific)
│   - Use Router-generated queries (no separate query generation)
│   - SQL search → emit step
│   - Semantic search → emit step
│   - Merge → emit step
│   - Build context_string with citations
│
├── 6. Agent Execution
│   - Build Tutor system prompt (lean: only teaching + own tools)
│   - Inject: AgentContext (summary, card, insights, RAG results, memory)
│   - Inject: agent history (last 20 Tutor messages)
│   - Call: Gemini API with streaming
│   - Stream chunks to frontend via pipeline
│   - Agent loop: handle tool calls if any (diagrams, cards, stats)
│
├── 7. Response Complete
│   - Parse output for HANDOFF signal
│   - If handoff found:
│     │ - Validate (can_handoff_to, depth, cycles)
│     │ - Build context for target agent
│     │ - Execute target agent (steps 5-7 for new agent)
│     │ - Emit chained cell to frontend
│   - If no handoff: done
│
├── 8. Post-Response (async, background)
│   - Save messages to agent_messages table
│   - Extract memory signals from output
│   - Update shared memory if new signals found
│   - Run agent on_finished callback (Plusi: sync mood, etc.)
│
└── 9. Frontend: render
    - Orchestrating step (collapsed)
    - Tutor AgenticCell (transparent, ThoughtStream inside)
    - If chained: Research AgenticCell (green, flush with Tutor)
```

### 9.2 Lock Mode Lifecycle

```
User locks to Plusi, types "Ey was geht"
│
├── 1. Frontend: handleSend()
│   - Detect lock mode: locked_agent = 'plusi'
│   - Emit: {type: 'orchestrating', status: 'done', data: {agent: 'plusi', method: 'lock'}}
│   - Call: bridge.sendMessage(text, history, mode, requestId, sessionContext, lockedAgent='plusi')
│
├── 2. Python: route_message()
│   - Level 1: locked_agent = 'plusi' → immediate return
│   - No LLM routing call → fast
│
├── 3. Context Building (programmatic, no LLM)
│   - Load shared memory
│   - Load Plusi agent state (self, diary, friendship, mood)
│   - Load Plusi chat history
│   - Build AgentContext (no summary, no RAG, no card context)
│
├── 4. Agent Execution
│   - Build Plusi system prompt (SOUL-style personality)
│   - Inject: AgentContext (memory, agent_state, history)
│   - Call: Gemini API with streaming
│   - Stream response
│
├── 5. Post-Response (async)
│   - Save to agent_messages (agent_name='plusi')
│   - Run _plusi_on_finished (sync mood, diary, panel)
│   - Update shared memory if needed
│
└── 6. Frontend: render
    - Orchestrating step (instant, shows "Lock: Plusi")
    - Plusi AgenticCell (blue glow, mood label)
```

---

## Part 10: Migration Plan

### Phase 1: Agent Registry (Foundation)

**Goal:** Replace SubagentDefinition with AgentDefinition. Flat hierarchy.

**Changes:**
- `ai/subagents.py` → `ai/agents.py` (rename + extend)
- Add `AgentDefinition` dataclass with new fields (tools, context_sources, can_handoff_to, is_default)
- Register all 4 agents (Tutor, Research, Help, Plusi)
- Update `get_registry_for_frontend()` to include new fields
- Frontend `subagentRegistry.js` → `agentRegistry.js` (rename + extend)
- Tutor registered as agent (is_default=True)
- Backward compat: `get_enabled_subagents()` wraps `get_non_default_agents()`

**Files changed:**
| File | Change |
|------|--------|
| `ai/agents.py` | NEW — AgentDefinition, AGENT_REGISTRY, all registrations |
| `ai/subagents.py` | DEPRECATED — thin wrapper importing from agents.py |
| `shared/config/agentRegistry.js` | NEW — extended frontend registry |
| `shared/config/subagentRegistry.js` | DEPRECATED — re-exports from agentRegistry.js |
| `config.py` | ADD `help_enabled: True`, `tutor_enabled: True` to DEFAULT_CONFIG |

**No behavior change.** System works exactly as before, just with new data structures.

### Phase 2: Router Extraction

**Goal:** Extract routing logic from Tutor/RAG into standalone Router.

**Changes:**
- New `ai/router.py` with `route_message()`, 3-level routing
- Absorb query generation from `rag.py:rag_router()` into Router LLM call
- `ai/handler.py` calls Router first, then dispatches to agent
- RAG retrieval still runs in handler (Router just provides queries)
- Pipeline step renamed: "router" → "orchestrating"

**Files changed:**
| File | Change |
|------|--------|
| `ai/router.py` | NEW — route_message(), 3-level routing, context building |
| `ai/handler.py` | MODIFY — call Router before agent, dispatch based on result |
| `ai/rag.py` | MODIFY — rag_router() simplified (queries come from Router) |
| `ai/system_prompt.py` | MODIFY — remove subagent hints from Tutor prompt |

### Phase 3: Agent-Specific Prompts

**Goal:** Each agent gets its own lean system prompt.

**Changes:**
- Tutor prompt: only teaching + own tool descriptions (no Research/Plusi hints)
- Research prompt: only search + citation instructions
- Help prompt: app documentation context + setting change instructions
- Plusi prompt: unchanged (already has own SOUL-style prompt)
- `ai/tutor.py` NEW — `run_tutor()` function (extracted from handler)
- `ai/help_agent.py` NEW — `run_help()` function + documentation context

**Files changed:**
| File | Change |
|------|--------|
| `ai/tutor.py` | NEW — run_tutor(), Tutor-specific system prompt |
| `ai/help_agent.py` | NEW — run_help(), Help system prompt + tools |
| `docs/help-agent-context.md` | NEW — App documentation for Help agent |
| `ai/system_prompt.py` | MODIFY — split into per-agent prompt builders |
| `ai/tools.py` | MODIFY — reassign tools to correct agents |

### Phase 4: Context System + Memory

**Goal:** Agents receive curated context. Memory persists across sessions.

**Changes:**
- `AgentContext` dataclass for structured context delivery
- Shared memory (SQLite table or JSON file)
- Agent state wrapper for Plusi storage
- Per-agent message storage (`agent_messages` table)
- Router context building per mode (card_session, free_chat, deck_browser)
- Async memory updates post-response

**Files changed:**
| File | Change |
|------|--------|
| `ai/router.py` | MODIFY — add context building, memory reads |
| `ai/memory.py` | NEW — SharedMemory, AgentState, load/save |
| `storage/card_sessions.py` | MODIFY — add agent_messages table |
| `plusi/storage.py` | MODIFY — wrap in AgentState interface |

### Phase 5: Handoff Protocol

**Goal:** Agents can signal handoffs. System validates and chains.

**Changes:**
- Handoff parsing from agent output (regex for HANDOFF/REASON/QUERY)
- Handoff validation (can_handoff_to, depth, cycles)
- Chain execution (build context for target, run, render)
- Handoff instructions in agent system prompts

**Files changed:**
| File | Change |
|------|--------|
| `ai/handler.py` | MODIFY — handoff parsing, chain execution |
| `ai/router.py` | MODIFY — handoff validation |
| `ai/tutor.py` | MODIFY — add handoff instructions to prompt |
| `ai/system_prompt.py` | MODIFY — per-agent handoff instructions |

### Phase 6: UI Updates

**Goal:** Tutor in AgenticCell, chain stacking, consecutive merging, Orchestrating step.

**Changes:**
- Tutor responses wrapped in transparent AgenticCell
- ThoughtStream moves inside AgenticCell
- "Orchestrating" replaces "router" step label
- Chain stacking: `isChained` prop → flush cells
- Consecutive merging: `isConsecutive` prop → unified background
- Tab toggle for agent lock in input dock
- Agent selector dropdown

**Files changed:**
| File | Change |
|------|--------|
| `frontend/src/components/AgenticCell.jsx` | MODIFY — transparent variant, isChained, isConsecutive |
| `frontend/src/components/StreamingChatMessage.jsx` | MODIFY — wrap in AgenticCell |
| `frontend/src/components/ChatMessage.jsx` | MODIFY — wrap in AgenticCell |
| `frontend/src/components/ChatInput.jsx` | MODIFY — Tab toggle, agent selector |
| `frontend/src/hooks/useChat.js` | MODIFY — agent lock state, orchestrating step |
| `shared/components/ThoughtStream.tsx` | MODIFY — "Orchestrating" label |

---

## Part 11: Configuration Changes

### 11.1 New Config Keys

```python
# Added to DEFAULT_CONFIG in config.py:
{
    # Agent toggles (new)
    'tutor_enabled': True,           # Always True, not toggleable in UI
    'help_enabled': True,            # Help agent toggle

    # Orchestration (new)
    'default_interaction_mode': 'auto',  # 'auto', 'tutor', 'research', 'help', 'plusi'
    'router_model': 'gemini-2.5-flash',  # Router model selection
    'max_chain_depth': 2,                # Max agents in a chain

    # Existing keys unchanged:
    'mascot_enabled': False,         # Plusi toggle
    'research_enabled': True,        # Research toggle
    'ai_tools': { ... },             # Tool toggles (unchanged)
    'research_sources': { ... },     # Research source toggles (unchanged)
}
```

### 11.2 Backward Compatibility

- `mascot_enabled` and `research_enabled` continue to work (mapped to agent registry)
- `ai_tools` dict continues to work (tools check their config_key)
- Existing `config.json` files need no migration — new keys have defaults

---

## Out of Scope

- CardFactory agent (planned for Anki PluStudio, separate product)
- Coach agent (future addition — architecture supports it)
- Examiner agent (future addition — architecture supports it)
- LLM-based memory extraction (kept rule-based for now)
- Multi-model support per agent (all use Gemini for now)
- Cross-session memory sharing between agents (agents only see shared memory)
- Voice/audio input routing
- Agent marketplace / user-defined agents

## Dependencies

- Existing tool registry system (`ai/tools.py`) — unchanged, tools reassigned
- Existing AgenticCell component — extended, not rewritten
- Existing ThoughtStream — relabeled, not rewritten
- Existing Plusi system (`plusi/`) — wrapped in new interfaces, core unchanged
- Existing Research system (`research/`) — unchanged, registered as agent
- Existing card sessions storage — extended with `agent_messages` table
- Gemini 2.5 Flash — Router model (already used for RAG routing)
- Gemini 3 Flash — Agent model (already used for Tutor)

## Testing Strategy

### Unit Tests
- Router: Test 3-level routing with various inputs
- Handoff: Test validation (allowed paths, cycles, depth)
- Memory: Test read/write/update cycle
- Context: Test mode-dependent context building
- Agent registry: Test registration, lookup, frontend serialization

### Integration Tests
- Full flow: User message → Router → Agent → Response → Memory update
- Chain flow: Tutor → handoff → Research → response
- Lock flow: Locked agent receives messages directly
- Fallback: Router LLM fails → default to Tutor

### Manual Tests
- All 4 agents respond correctly in isolation
- Chain renders flush in UI (no gap)
- Orchestrating step appears and collapses
- Tab toggle works and persists
- Memory accumulates over multiple sessions
- Plusi retains state across conversations
- Settings changes via Help agent take effect immediately

## Risks

1. **Router latency**: Extra LLM call adds ~300ms. Mitigated by 3-level routing (80% resolved at Level 1/2 without LLM).
2. **Query quality regression**: Moving query generation from dedicated RAG router to combined Router prompt. Mitigated by keeping same prompt structure, testing query quality.
3. **Context truncation**: Router summary may lose important details. Mitigated by including raw card data alongside summary.
4. **Memory drift**: Rule-based memory extraction may accumulate incorrect patterns. Mitigated by keeping memory simple (profile fields, not free text) and allowing manual correction.
5. **Plusi regression**: Wrapping Plusi in new interfaces may break personality subtleties. Mitigated by keeping `run_plusi()` unchanged, only changing how context is delivered.
