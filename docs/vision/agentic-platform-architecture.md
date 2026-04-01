# AnkiPlus — Agentic Platform Architecture Vision

## Core Principle

AnkiPlus is not a chatbot attached to a flashcard app. It is an **agentic learning platform** where AI agents can observe, understand, and act — with the same capabilities as the user.

Every UI action is a tool. Every state change is an event. Every piece of context is queryable. Agents are first-class citizens, not afterthoughts.

## Product Concept (Summary)

For the full product concept (three cognitive modes, interaction model, design principles), see `product-concept.md`. Key points that shape the architecture:

- **Agents are view-agnostic.** An agent operates across all three views (Stapel/Session/Statistik), adapting its output format to the view context. The agent registry, routing, and tool system must not assume a specific view.
- **Stapel is state-based.** Agent interactions in Stapel produce a single state (Canvas + Sidebar), not a conversation. The router maintains invisible history for context, but the UI replaces state on each new query. This means the agent loop must support "single-shot with context" mode, not just streaming chat.
- **Session is history-based.** Agent interactions in Session produce conversation turns anchored to a card. This is the traditional streaming chat mode.
- **The router decides the agent.** Users don't always explicitly choose an agent. The router uses invisible history + heuristics to decide which agent handles a query. This requires the router to be context-aware across views.

## Three Infrastructure Pillars

### 1. Action Registry — Agents Can Act

Every action in the app (flip card, open deck, send message, switch view) is registered in a central registry. The same action can be triggered by a button click (user), a tool call (agent), a keyboard shortcut, or another agent (handoff).

```
domain.verb pattern:
  card.flip       card.rate        card.preview
  deck.study      deck.select      deck.create
  chat.send       chat.clear       chat.open
  view.switch     settings.toggle  stats.open
```

Every registered action automatically emits an event when executed — no action without an event.

### 2. Event Bus — Agents Can Observe

Every action emits an event. Agents subscribe to the events they care about and react autonomously.

```
domain.past pattern:
  card.answered    card.flipped     card.previewed
  deck.opened      deck.studied     deck.created
  review.started   review.completed
  chat.opened      chat.messageSent chat.cleared
  session.started  session.ended
```

Events flow through a central bus. Python emits via `ankiReceive` with `domain.past` naming. React dispatches to subscribers. Events carry structured data (cardId, ease, elapsed time, etc.) and source tracking (user/agent/system).

### 3. State Queries — Agents Can Understand Context

Agents can query the current state at any time.

```
domain.noun pattern:
  deck.current     deck.dueCount    deck.tree
  card.current     card.history
  review.active    review.progress  review.streak
  chat.history     chat.messageCount
  user.premium     user.preferences
```

## How The Three Pillars Work Together

```
Agent Loop:
  1. OBSERVE: Subscribe to events     → "card.answered with ease=1"
  2. UNDERSTAND: Query state           → "3rd wrong answer, deck Anatomie, 20 min in session"
  3. DECIDE: Agent reasoning           → "User struggles, I should help"
  4. ACT: Execute actions              → chat.open("Lass mich dir den Meniskus erklären")
```

## Event System

### Two Event Layers

**Layer 1: Raw Events** — factual, emitted automatically with every action.

| Domain | Raw Events | Data |
|--------|-----------|------|
| **card** | `card.shown`, `card.flipped`, `card.answered`, `card.skipped` | cardId, deckId, ease, timeMs, timestamp |
| **deck** | `deck.opened`, `deck.selected`, `deck.created` | deckId, deckName |
| **review** | `review.started`, `review.cardCompleted`, `review.ended` | deckId, totalCards, totalTimeMs |
| **chat** | `chat.opened`, `chat.closed`, `chat.messageSent`, `chat.responseCompleted` | text, hasCardContext, tokens, source |
| **view** | `view.switched`, `view.navigated` | from, to |
| **session** | `session.started`, `session.idle`, `session.resumed` | timestamp, idleDurationMs |
| **settings** | `settings.changed` | key, oldValue, newValue |

Raw events are cheap. Emit everything.

**Layer 2: Interpreted Events** — derived from raw events by interpreters.

| Interpreted Event | Rule |
|-------------------|------|
| `card.struggled` | Same card, ease=1, 3+ times |
| `card.mastered` | Same card, ease>=3, 3+ times in a row |
| `card.guessed` | Flip time <2s but ease>=3 |
| `card.tooSlow` | timeMs > 2x running average |
| `review.fatigue` | Accuracy drops >20% over last 10 cards |
| `review.streakBroken` | 5+ correct, then incorrect |
| `review.flowState` | 10+ correct in a row, avg time <5s |
| `review.milestone` | Count reaches 50, 100, 200 |
| `deck.completed` | All due cards = 0 |
| `deck.neglected` | Not opened in >7 days, has due cards |

### Interpreter Architecture

Each interpreter is a self-contained module:

```javascript
export default {
  name: 'card.struggled',
  subscribesTo: ['card.answered'],
  state: {},

  evaluate(event) {
    const { cardId, ease } = event.data;
    if (ease > 1) { this.state[cardId] = 0; return null; }
    this.state[cardId] = (this.state[cardId] || 0) + 1;
    if (this.state[cardId] >= 3) {
      return { type: 'card.struggled', data: { cardId, wrongCount: this.state[cardId] } };
    }
    return null;
  },

  reset() { this.state = {}; }
}
```

Adding a new interpreter = one file + one line in the registry. No core changes.

### Event Data Contract

```javascript
{
  type: 'card.answered',
  timestamp: 1711234567890,
  data: { cardId: 12345, deckId: 67, ease: 1, timeMs: 4200 },
  source: 'user',           // 'user' | 'agent' | 'interpreter'
  sourceId: null,            // which agent/interpreter, if applicable
  layer: 'raw',              // 'raw' | 'interpreted'
}
```

Source tracking prevents infinite loops: agents default to ignoring events from themselves.

## Event Store — Persistent Memory

**Short-term (in-process):** Ring buffer of ~200 events. For fast interpreters (streak, fatigue). Resets on restart.

**Long-term (SQLite):** All events persisted. For analytical interpreters (optimal time, accuracy trends). Cleaned up after 90 days.

```sql
CREATE TABLE event_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    type        TEXT NOT NULL,
    layer       TEXT NOT NULL,
    source      TEXT NOT NULL,
    source_id   TEXT,
    data        TEXT NOT NULL,
    timestamp   INTEGER NOT NULL,
    session_id  TEXT
);

CREATE TABLE event_aggregates (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  INTEGER NOT NULL
);
```

Interpreters read pre-computed aggregates, not raw logs. Aggregates update automatically on each new event.

**Implementation:** Event store is built in SP4. During SP1-SP3, interpreters use in-memory state only.

## Agent Architecture

### Agent = Container of Tools

An agent is a container with:
- **Role Prompt** — overarching personality and instructions
- **Available Actions** — which actions this agent can use
- **Tools** — multiple, each with a trigger and logic
- **Memory** — persistent, private to this agent
- **Visual Identity** — color, icon, for UI display

### Tool = Trigger + Logic + Action(s)

Each tool has a trigger (which event activates it) and one of three logic types:

**Type 1: Trigger → Action (direct, no AI)**

Event fires, action executes. Deterministic, instant, free.

```
TRIGGER: card.answered {ease: 1}
  → ACTION: memory.write({cardId, weakness: true})
```

**Type 2: Trigger → Agent → Action (agent fills a specific action)**

Agent receives trigger data and generates CONTENT for a predetermined action. Agent decides HOW, not WHAT.

```
TRIGGER: card.struggled {wrongCount: 3}
  → AGENT generates: explanation text
  → OUTPUT goes to: chat.send(generated text)
```

**Type 3: Trigger → Agent → Action Selection (agent chooses + fills)**

Agent receives trigger data AND available actions. Agent decides WHAT to do and fills the chosen action.

```
TRIGGER: review.fatigue {accuracy: 0.45}
  → AGENT chooses from: [chat.send, ui.showHint, memory.write, silent.observe]
  → AGENT decides: ui.showHint("Kurze Pause?")
```

### Prompt Hierarchy

- **Role Prompt** (always active): Agent's personality, style, general instructions
- **Tool Prompt** (optional, per tool): Task-specific instructions for that tool

Both are sent to the AI model when the agent makes decisions (Type 2 and Type 3).

### Intelligence Lives in the Agent

There is no central filter or gatekeeper that controls agent output. If an agent decides to write to the chat, it writes to the chat. The intelligence is in the agent's prompt and the variety of available actions. An agent with access to `memory.write`, `ui.showHint`, AND `chat.send` will naturally use chat less often — its prompt guides it to choose the right channel for each situation.

### Example: Complete Agent Definition

```
AGENT: "Anatomie-Coach"
  Role Prompt: "Du bist ein Anatomie-Tutor..."
  Color: #0A84FF
  Icon: stethoscope
  Available Actions: [chat.send, memory.write, ui.showHint,
                      card.addNote, profile.update, silent.observe]

  TOOL 1: "Schwäche tracken" (Type 1 — direct)
    Trigger: card.answered {ease <= 1}
    → memory.write({cardId, topic, ease, timestamp})

  TOOL 2: "Erklärung geben" (Type 2 — agent fills action)
    Trigger: card.struggled {wrongCount >= 3}
    Tool Prompt: "Erkläre in 2 Sätzen mit Analogie"
    → Agent generates → chat.send(generated)

  TOOL 3: "Lern-Coaching" (Type 3 — agent chooses)
    Trigger: review.fatigue
    → Agent sees: [chat.send, ui.showHint, silent.observe]
    → Agent decides based on context

  TOOL 4: "Session-Zusammenfassung" (Type 1 — chain)
    Trigger: review.ended
    → memory.write(sessionStats)
    → profile.update(accuracyTrend)
```

## User Knowledge System — Four Memory Layers

### Layer 1: Event Log (Facts)
What happened. Raw, objective, massive. Designed above.

### Layer 2: Agent Memory (Experiences)
What each agent did, and whether it helped. Agents track their own interventions and outcomes.

### Layer 3: Learner Profile (Subject Understanding)
Per-topic knowledge: what the user understands, what they confuse, what teaching approaches work. Dynamic, changes with every session.

```
topics:
  'Anatomie::Knie':
    understanding: 0.65
    weakPoints: ['Meniskus vs Kreuzband', 'Innervation']
    confusions: [{confuses: 'Innenmeniskus', with: 'Innenband', frequency: 4}]
    effectiveApproaches: ['images', 'comparisons']
    retentionRate: 0.72
    masteredCards: 31 / 47
```

### Layer 4: User Identity (Who Is This Person)
Overarching profile. Emerges over weeks/months.

**Hard Facts:** Study field, semester, daily card count, streak, experience level.

**Learning Type (derived from behavior):**
- Preferred modality: visual | textual | mixed
- Pace: quick | balanced | deep
- Motivation: intrinsic | streak-driven | exam-driven
- Feedback preference: encouraging | direct | minimal
- Optimal session length and time of day
- Concentration pattern: sprinter | marathoner

**Agent Observations:** Free-text notes from agents about what works for this user.

### Who Writes Where

| Layer | Writer | Frequency |
|-------|--------|-----------|
| Event Log | System (automatic) | Every action |
| Agent Memory | Each agent | After each intervention |
| Learner Profile | Specialized interpreters | After significant pattern changes |
| User Identity | Profiler interpreter + user input | Periodically |

### Storage

```sql
CREATE TABLE learner_topics (
    topic_key    TEXT PRIMARY KEY,
    data         TEXT NOT NULL,
    updated_at   INTEGER NOT NULL
);

CREATE TABLE user_profile (
    key          TEXT PRIMARY KEY,
    data         TEXT NOT NULL,
    updated_at   INTEGER NOT NULL
);
```

## Emergent Agent Cooperation

Agents cooperate without knowing about each other:

```
User answers card wrong (3rd time)
  → card.struggled {cardId: 123, wrongCount: 3}

Tutor (subscribes to card.struggled):
  → query('card.current'), execute('chat.open', "Erklärung...")

Research (subscribes to chat.opened where source='agent'):
  → query('card.current'), execute('chat.send', "Quelle: ...")

Plusi (subscribes to card.struggled):
  → execute('plusi.react', {mood: 'encouraging'})
```

Three agents, zero coordination code. Behavior emerges from the architecture.

## Creator Studio (Future)

A visual builder for agents — currently parked as a future project. The underlying architecture (registries, event bus, agent definition format) comes first.

When built, it will serve as:
1. **Builder** — Create/configure agents visually (triggers, tools, prompts, actions)
2. **Monitor** — Live event flow and agent decision log
3. **Vibe Coding** — Describe desired behavior in natural language, assistant maps it to triggers and actions

## Implementation Phases

### SP1: Foundation (Fullscreen React Shell)
- Action Registry (Python dict + React Map) with `domain.verb` naming
- Event naming with `domain.past` for all Python → React messages
- State getters with `domain.noun` pattern
- No agent subscriptions yet — structure only

### SP2: Sidebar Migration
- Sidebar actions in same Action Registry
- Session events formalized

### SP3: Reviewer Migration
- Reviewer actions registered (`card.flip`, `card.rate`, `mc.start`)
- Review events formalized — agents can observe review sessions

### SP4: Agent Integration
- Event Bus subscription API
- Interpreter system (in-memory state)
- Event Store (SQLite persistence)
- Agents auto-discover actions as tools
- Agent-to-agent communication via Action Registry

### Beyond SP4
- Persistent learner profile + user identity
- Plugin system for third-party agents
- Creator Studio UI

## Design Principles

1. **Convention over configuration** — Naming patterns make everything discoverable
2. **Same interface for everyone** — Users, agents, shortcuts use the same Action Registry
3. **Central over scattered** — One event bus, one action registry, one state query system
4. **Discoverable** — Agents call `getAvailableActions()` to understand capabilities
5. **Incremental** — Each phase adds to registries without changing existing entries
6. **Intelligence in the agent** — No central filters; agent prompts and action variety control behavior
