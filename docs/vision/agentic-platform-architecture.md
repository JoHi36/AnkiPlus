# AnkiPlus — Agentic Platform Architecture Vision

## Core Principle

AnkiPlus is not a chatbot attached to a flashcard app. It is an **agentic learning platform** where AI agents can observe, understand, and act — with the same capabilities as the user.

Every UI action is a tool. Every state change is an event. Every piece of context is queryable. Agents are first-class citizens, not afterthoughts.

## Three Infrastructure Pillars

### 1. Action Registry — Agents Can Act

Every action in the app (flip card, open deck, send message, switch view) is registered in a central registry. The same action can be triggered by:

- A button click (user)
- A tool call (agent)
- A keyboard shortcut (user)
- Another agent (handoff)

```
domain.verb pattern:
  card.flip       card.rate        card.preview
  deck.study      deck.select      deck.create
  chat.send       chat.clear       chat.open
  view.switch     settings.toggle  stats.open
```

**Why it matters:** Without this, agents can only talk. With this, agents can DO things — open decks, show cards, navigate the UI, start study sessions. The platform becomes a workspace the agent operates in, not just a chat window.

### 2. Event Bus — Agents Can Observe

Every significant event (card answered, deck opened, review started, message sent) is broadcast through a central event bus. Agents subscribe to the events they care about.

```
domain.past pattern:
  card.answered    card.flipped     card.previewed
  deck.opened      deck.studied     deck.created
  review.started   review.completed review.streakBroken
  chat.opened      chat.messageSent chat.cleared
  session.started  session.ended
```

**Why it matters:** This is what makes agents AUTONOMOUS. Instead of being called, they can watch and react. The Tutor agent notices 3 wrong answers in a row and intervenes. The Plusi agent detects a long study session and suggests a break. The Research agent sees a difficult card and pre-fetches relevant sources.

**How it works:**
- Python emits events through `ankiReceive` with `domain.past` naming
- React has a central `EventBus` that dispatches to subscribers
- Agents register interest in specific event patterns
- Events carry structured data (cardId, ease, elapsed time, etc.)

### 3. State Queries — Agents Can Understand Context

Agents can query the current state of the app at any time. What deck is open? How many cards are due? Is the user in review mode? What was the last message?

```
domain.noun pattern:
  deck.current     deck.dueCount    deck.tree
  card.current     card.history
  review.active    review.progress  review.streak
  chat.history     chat.messageCount
  user.premium     user.preferences
```

**Why it matters:** Without context, agents make generic responses. With state queries, agents understand exactly where the user is and what they're doing. The Tutor agent knows "this is the 4th time the user sees this card and they got it wrong every time" — not because we hardcoded that check, but because it can query `card.history`.

## How The Three Pillars Work Together

```
Agent Loop:
  1. OBSERVE: Subscribe to events     → "card.answered with ease=1"
  2. UNDERSTAND: Query state           → "3rd wrong answer, deck Anatomie, 20 min in session"
  3. DECIDE: Agent reasoning           → "User struggles, I should help"
  4. ACT: Execute actions              → chat.open("Lass mich dir den Meniskus erklären")
```

This is the fundamental loop of any autonomous agent. The three registries make it possible without any custom wiring per agent.

## Implementation Phases

### SP1: Foundation (Fullscreen React Shell)
- Create Action Registry (Python dict + React Map)
- Use `domain.verb` naming for all bridge messages
- Use `domain.past` naming for all events from Python
- State getters in MainViewWidget with `domain.noun` naming
- No agent subscriptions yet — just the naming and structure

### SP2: Sidebar Migration
- Sidebar actions registered in same Action Registry
- Session events (`session.started`, `session.ended`) formalized
- State queries for sidebar context (`session.current`, `chat.history`)

### SP3: Reviewer Migration
- Reviewer actions registered (`card.flip`, `card.rate`, `mc.start`)
- Review events formalized (`card.answered`, `review.started`, `review.completed`)
- This is where it gets powerful: agents can observe and intervene in review sessions

### SP4: Agent Integration
- Event Bus subscription API formalized
- Agents auto-discover available actions as tools
- State queries available as tool parameters
- Agent-to-agent communication via Action Registry (one agent triggers actions for another)

### Beyond SP4: Plugin System
- Third-party agents register their own actions, views, and event handlers
- Agent marketplace: install an agent, it registers itself
- Custom tools: community-built actions that extend the platform

## Design Principles

1. **Convention over configuration** — `domain.verb`, `domain.past`, `domain.noun` naming makes everything discoverable without documentation
2. **Same interface for everyone** — Users, agents, shortcuts, and other agents all use the same Action Registry. No special "agent API" vs "user API"
3. **Central over scattered** — One event bus, one action registry, one state query system. Not per-component, not per-agent
4. **Discoverable** — An agent can call `getAvailableActions()` and `getAvailableEvents()` to understand what it can do. No hardcoding of capabilities
5. **Incremental** — Each phase adds to the registry without changing existing entries. New actions, events, and queries are additive

## Event System Deep Dive

### Core Rule: Every Action Emits an Event

When `executeAction('card.flip', data)` runs, two things happen automatically:
1. The action handler executes (card flips)
2. An event is emitted (`card.flipped`, with data)

No action without an event. This means the event bus is comprehensive by default — everything that happens in the app is observable.

### Two Event Layers

**Layer 1: Raw Events** — factual, objective, always emitted

These are 1:1 with actions. Every UI interaction, every state change produces a raw event.

| Domain | Raw Events | Data |
|--------|-----------|------|
| **card** | `card.shown`, `card.flipped`, `card.answered`, `card.skipped` | cardId, deckId, ease, timeMs, timestamp |
| **deck** | `deck.opened`, `deck.selected`, `deck.created` | deckId, deckName |
| **review** | `review.started`, `review.cardCompleted`, `review.ended` | deckId, totalCards, totalTimeMs, count, remaining |
| **chat** | `chat.opened`, `chat.closed`, `chat.messageSent`, `chat.responseCompleted` | text, hasCardContext, tokens, source |
| **view** | `view.switched`, `view.navigated` | from, to |
| **session** | `session.started`, `session.idle`, `session.resumed` | timestamp, idleDurationMs |
| **settings** | `settings.changed` | key, oldValue, newValue |

Raw events are cheap. Emit everything. An agent or interpreter can always ignore what it doesn't need.

**Layer 2: Interpreted Events** — derived, stateful, meaningful

Interpreters watch raw events, maintain state, and emit higher-level events when patterns are detected.

| Interpreted Event | Derived From | Rule |
|-------------------|-------------|------|
| `card.struggled` | `card.answered` | Same card, ease=1, 3+ times |
| `card.mastered` | `card.answered` | Same card, ease>=3, 3+ times in a row |
| `card.guessed` | `card.flipped` + `card.answered` | Flip time <2s but ease>=3 (too fast to have known) |
| `card.tooSlow` | `card.answered` | timeMs > 2x running average |
| `review.fatigue` | `card.answered` (rolling window) | Accuracy drops >20% over last 10 cards |
| `review.streakBroken` | `card.answered` | 5+ correct, then incorrect |
| `review.flowState` | `card.answered` (rolling window) | 10+ correct in a row, avg time <5s |
| `review.milestone` | `review.cardCompleted` | count reaches 50, 100, 200 |
| `deck.completed` | `review.ended` + state query | All due cards = 0 for this deck |
| `deck.neglected` | `session.started` + state query | Deck not opened in >7 days, has due cards |
| `chat.deepDive` | `chat.messageSent` | 5+ messages on same topic |

### Interpreter Architecture

Each interpreter is a self-contained module with a standard interface:

```javascript
// interpreters/cardStruggle.js
export default {
  name: 'card.struggled',
  description: 'Emits when a card is answered wrong 3+ times',
  subscribesTo: ['card.answered'],

  // Internal state (per interpreter instance)
  state: {},

  // Called for each matching raw event
  evaluate(event) {
    const { cardId, ease } = event.data;

    // Reset on correct answer
    if (ease > 1) {
      this.state[cardId] = 0;
      return null;  // no interpreted event
    }

    // Track wrong answers
    this.state[cardId] = (this.state[cardId] || 0) + 1;

    // Emit interpreted event after 3 wrong
    if (this.state[cardId] >= 3) {
      return {
        type: 'card.struggled',
        data: { cardId, wrongCount: this.state[cardId] }
      };
    }

    return null;  // not yet
  },

  // Reset state (e.g., on new session)
  reset() {
    this.state = {};
  }
}
```

Interpreters are registered in a central registry:

```javascript
// interpreterRegistry.js
import cardStruggle from './interpreters/cardStruggle';
import reviewFatigue from './interpreters/reviewFatigue';
import flowState from './interpreters/flowState';
import deckCompleted from './interpreters/deckCompleted';

const INTERPRETERS = [
  cardStruggle,
  reviewFatigue,
  flowState,
  deckCompleted,
  // ... add new interpreters here
];

export function initInterpreters(eventBus) {
  for (const interpreter of INTERPRETERS) {
    for (const eventType of interpreter.subscribesTo) {
      eventBus.on(eventType, (event) => {
        const result = interpreter.evaluate(event);
        if (result) {
          eventBus.emit(result.type, result.data);
        }
      });
    }
  }
}
```

Adding a new interpreter = adding one file + one line in the registry. No core changes.

### Agent Subscription

Agents subscribe to raw or interpreted events — their choice:

```javascript
// A simple agent that reacts to interpreted events (easy):
eventBus.on('card.struggled', (event) => {
  executeAction('chat.open', { text: `Du tust dich schwer mit dieser Karte...` });
});

// A sophisticated agent that interprets raw events itself (flexible):
eventBus.on('card.answered', (event) => {
  // Agent maintains its own model of user performance
  // and decides when/how to intervene
});
```

### Event Data Contract

Every event carries a standardized payload:

```javascript
{
  type: 'card.answered',          // domain.past name
  timestamp: 1711234567890,       // when it happened
  data: {                         // domain-specific payload
    cardId: 12345,
    deckId: 67,
    ease: 1,
    timeMs: 4200,
  },
  source: 'user',                 // 'user' | 'agent' | 'system'
  layer: 'raw',                   // 'raw' | 'interpreted'
}
```

The `source` field is important: when an agent executes `card.rate`, the resulting `card.answered` event has `source: 'agent'`. This prevents infinite loops (agent reacts to its own action) and lets other agents distinguish user behavior from agent behavior.

The `layer` field distinguishes raw from interpreted events, so an agent can filter for only one layer.

## Event Store — Persistent Memory

### Why Needed

Interpreters need history. "3x wrong in a row" needs the last few minutes. "Optimal study time" needs 30 days of data. "Deck neglected" needs to know when a deck was last opened. Without persistent storage, all intelligence resets when Anki closes.

### Two Layers of Memory

**Short-term (in-process):** Ring buffer of last ~200 events. Lives in JavaScript memory. Used by fast interpreters (streak detection, fatigue, flow state). Resets on app restart — that's fine, these patterns are session-scoped.

**Long-term (SQLite):** Every event persisted to disk. Used by analytical interpreters (optimal time, accuracy trends, deck neglect). Survives restarts. Cleaned up after 90 days.

### Schema

```sql
-- Raw event log
CREATE TABLE event_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    type        TEXT NOT NULL,           -- 'card.answered'
    layer       TEXT NOT NULL,           -- 'raw' | 'interpreted'
    source      TEXT NOT NULL,           -- 'user' | 'agent' | 'interpreter'
    source_id   TEXT,                    -- which agent or interpreter
    data        TEXT NOT NULL,           -- JSON payload
    timestamp   INTEGER NOT NULL,        -- Unix ms
    session_id  TEXT                     -- groups events per Anki session
);

CREATE INDEX idx_event_type ON event_log(type);
CREATE INDEX idx_event_time ON event_log(timestamp);
CREATE INDEX idx_event_session ON event_log(session_id);

-- Pre-computed aggregates for fast interpreter queries
CREATE TABLE event_aggregates (
    key         TEXT PRIMARY KEY,        -- 'card:12345:wrongCount'
    value       TEXT NOT NULL,           -- JSON
    updated_at  INTEGER NOT NULL
);
```

### Query Patterns

Interpreters query the event store through a standard API:

```javascript
// "How many times was this card answered wrong?"
eventStore.aggregate('card:12345:wrongCount')  // → 7 (instant, from cache)

// "Average accuracy by hour of day, last 30 days"
eventStore.query({
  type: 'card.answered',
  timeRange: { days: 30 },
  groupBy: 'hourOfDay',
  metric: 'avgEase'
})

// "When was deck Anatomie last studied?"
eventStore.query({
  type: 'deck.studied',
  filter: { deckId: 67 },
  orderBy: 'timestamp DESC',
  limit: 1
})
```

### Aggregate Updates

When a raw event is stored, relevant aggregates are updated automatically:

```
Event: card.answered {cardId: 123, ease: 1}
  → UPDATE event_aggregates SET value = value + 1
    WHERE key = 'card:123:wrongCount'
  → UPDATE event_aggregates SET value = json(...)
    WHERE key = 'card:123:recentEases'  -- rolling window of last 10
  → UPDATE event_aggregates SET value = json(...)
    WHERE key = 'review:session:accuracy'  -- running session accuracy
```

This means interpreters never scan the raw event log during normal operation. They read pre-computed aggregates. The raw log exists for historical analysis and debugging.

### Cleanup

A periodic job (on Anki startup or daily) prunes old events:

```sql
DELETE FROM event_log WHERE timestamp < (now - 90 days)
-- Keep aggregates indefinitely (they're small)
```

### Implementation Phase

The event store is **not needed for SP1-SP3**. During those phases, interpreters use in-memory state only (sufficient for session-scoped patterns). The persistent event store is built in **SP4** when the full agent integration happens. The interpreter interface stays the same — only the data source changes from in-memory to SQLite.

## Emergent Agent Cooperation

The three pillars (Actions, Events, Queries) enable agents to cooperate without knowing about each other:

```
User answers card wrong (3rd time)
  → Raw event: card.answered {ease: 1, cardId: 123}
  → Interpreter: card.struggled {cardId: 123, wrongCount: 3}

Tutor-Agent (subscribes to card.struggled):
  → query('card.current') → gets card content
  → execute('chat.open', "Let me explain this differently...")
  → Raw event: chat.opened {source: 'agent', sourceAgent: 'tutor'}

Research-Agent (subscribes to chat.opened where source='agent'):
  → query('card.current') → same card
  → Searches knowledge base
  → execute('chat.send', "Here's a relevant source: ...")

Plusi-Agent (subscribes to card.struggled):
  → execute('plusi.react', {mood: 'encouraging'})
```

Three agents, zero coordination code. Each subscribes to events, queries context, and executes actions. The behavior emerges from the architecture.

### Source Tracking Prevents Loops

Every event carries `source` and `sourceId`:

```javascript
{
  type: 'card.previewed',
  source: 'agent',           // not 'user'
  sourceId: 'tutor',         // which agent
  data: { cardId: 456 }
}
```

Agents can filter: "Only react to user actions, not other agents" or "React to any source except myself." This prevents:
- Agent A triggers action → emits event → Agent A reacts → triggers action → infinite loop
- Two agents ping-ponging actions back and forth

Convention: Agents should default to `source !== self.name` unless they explicitly want to react to their own effects.

## User Knowledge System — Four Memory Layers

The event system generates data. But raw events are not knowledge. The platform needs layered memory that transforms events into understanding.

### Layer 1: Event Log (Facts)
What happened. Raw, objective, massive. Already designed above.

### Layer 2: Agent Memory (Experiences)
What each agent did, and whether it helped. Agents track their own interventions and outcomes. Already designed above.

### Layer 3: Learner Profile (Subject Understanding)
Per-topic knowledge: what the user understands, what they confuse, what teaching approaches work. Updated by specialized interpreters after significant pattern changes.

```
topics:
  'Anatomie::Knie':
    understanding: 0.65
    weakPoints: ['Meniskus vs Kreuzband', 'Innervation']
    confusions: [{confuses: 'Innenmeniskus', with: 'Innenband', frequency: 4}]
    effectiveApproaches: ['images', 'comparisons']
    ineffectiveApproaches: ['text definitions']
    retentionRate: 0.72
    masteredCards: 31 / 47
```

This layer is **dynamic** — it changes with every session as the user improves or encounters new difficulties.

### Layer 4: User Identity (Who Is This Person)
The overarching profile. Hard facts + psychological/learning profile. Emerges over weeks/months from the layers below.

**Hard Facts** (stated or observed):
- Study field, semester, daily card count, streak, Anki since when

**Psychological / Learning Type** (derived from behavior patterns):
- Preferred modality: visual | textual | mixed (from which explanations work)
- Pace: quick | balanced | deep (from answer times and chat depth)
- Motivation type: intrinsic | streak-driven | exam-driven (from usage patterns)
- Feedback preference: encouraging | direct | minimal (from reactions to agent interventions)
- Optimal session length, optimal time of day (from fatigue/accuracy patterns)
- Concentration pattern: sprinter | marathoner (from accuracy curve over session)

**Agent Observations** (free-text notes from agents):
- "User understands concepts better through analogies than definitions" — Tutor
- "Responds positively to humor, gets impatient with too much encouragement" — Plusi

The exact profile structure needs further design. The key principle: the profile is not a static form the user fills out. It **emerges** from observed behavior and is continuously refined.

### Who Writes Where

| Layer | Writer | Frequency |
|-------|--------|-----------|
| Event Log | System (automatic) | Every action |
| Agent Memory | Each agent | After each intervention |
| Learner Profile | Specialized interpreters | After significant pattern changes |
| User Identity | "Profiler" interpreter + user manual input | Periodically (per session or daily) |

### Storage

```sql
-- Layer 3: Learner Profile
CREATE TABLE learner_topics (
    topic_key    TEXT PRIMARY KEY,     -- 'Anatomie::Knie'
    data         TEXT NOT NULL,        -- JSON
    updated_at   INTEGER NOT NULL
);

-- Layer 4: User Identity
CREATE TABLE user_profile (
    key          TEXT PRIMARY KEY,     -- 'facts', 'learningStyle', 'goals'
    data         TEXT NOT NULL,        -- JSON
    updated_at   INTEGER NOT NULL
);
```

## Intervention System — Protecting the Flow

### The Core Problem

Agents observe events and want to act. But if every trigger leads to a chat message, the user gets spammed. The learning flow is sacred — interruptions must be rare and valuable.

### Intervention Pyramid

```
           /\
          /  \         5% — Direct Intervention
         / !! \        Agent interrupts flow (chat message)
        /------\       Only for critical moments
       /        \
      /  subtle  \     15% — Subtle Hint
     /    hint    \    Small UI change, no text
    /--------------\   (badge, color, Plusi mood, icon)
   /                \
  /   silent note    \ 30% — Silent Note
 /                    \ Agent remembers, shows nothing now
/______________________\ Becomes relevant later
        50%
  Agent observes, stores in profile, no UI feedback at all
```

### Intervention Channels

Not everything goes through the chat. Multiple feedback channels exist:

| Channel | Interrupts Flow? | Example |
|---------|-----------------|---------|
| **silent** | No | Agent stores observation in profile, no UI |
| **subtle** | No | Plusi mood changes, small badge appears, color shifts |
| **inline** | Minimal | Small hint below card answer, dismissable |
| **toast** | Light | Brief notification, disappears after 3s |
| **queue** | No (now), Yes (later) | Saved, shown in post-session summary |
| **chat** | Yes | Full chat message — only for truly important interventions |

### Intervention Gatekeeper

A central gatekeeper evaluates all agent intervention requests before they reach the UI:

```
Agent requests intervention:
  { agent: 'tutor', urgency: 0.7, channel: 'chat', content: '...' }

Gatekeeper evaluates:
  - Is user in flow state? (10+ correct in a row) → queue for later
  - Did another agent intervene recently? (<60s ago) → downgrade to silent
  - Is urgency below threshold? (<0.5) → downgrade to subtle
  - Is this the same insight as last time? → suppress (don't repeat)
  - All clear → allow on requested channel
```

The gatekeeper prevents: spam, redundant messages, flow interruption, agent conflicts. It is the single chokepoint between agent intelligence and user experience.

### Post-Session Summary

Most insights are more valuable AFTER the session than during it. Instead of interrupting with individual observations, agents contribute to a session summary that is shown when the user finishes:

```
Session Summary (30 min, 45 cards, 78% correct)

  Weak spots detected:
    - Meniskus vs Kreuzband (4x wrong)
    - Enzyme inhibition types (3x wrong)

  Suggestion: Focus session on Knee anatomy?
    [Start focused review]  [Later]

  Your best study time: 09:00-11:00
    (today at 22:30 — accuracy 20% lower than usual)
```

This is not a chat message. It is a dedicated view — a dashboard that appears when the session ends. All agents contribute observations, but the user sees a curated summary, not 15 individual messages.

### Intelligence Lives in the Agent, Not in a Filter

There is no central "Intervention Gatekeeper" that filters agent output. If an agent decides to write to the chat, it writes to the chat. The intelligence is in the agent itself — its system prompt defines how active or reserved it is. A Tutor agent writes to chat when it has something valuable. An Observer agent writes only to memory. This is configured per agent in the Creator Studio, not enforced by infrastructure.

The variety of available actions (not just chat) naturally distributes agent output across channels. An agent with access to `memory.write`, `ui.showHint`, `silent.observe`, AND `chat.send` will use chat less often than one that only has `chat.send`.

## Agent Architecture

### Agent = Container of Tools

An agent is not a single function. It is a container with:
- **Role Prompt** (overarching personality and instructions)
- **Available Actions** (which actions this agent can use)
- **Tools** (multiple, each with a trigger and logic)
- **Memory** (persistent, private to this agent)
- **Visual Identity** (color, icon — for UI display)

### Tool = Trigger + Logic + Action(s)

Each tool within an agent has:
- **Trigger** (which event activates it)
- **Logic** (one of three types — see below)
- **Tool Prompt** (optional, specific instructions for this tool)

### Three Connection Types

**Type 1: Trigger → Action (direct, no AI)**

Simplest case. Event fires, action executes. Deterministic, no AI call needed.

```
TRIGGER: card.answered {ease: 1}
  → ACTION: memory.write({cardId, weakness: true})
```

Use for: Logging, counting, simple state updates. Runs instantly, no cost.

**Type 2: Trigger → Agent → Action (agent fills a specific action)**

Agent receives trigger data as input and generates the CONTENT for a predetermined action. The agent decides HOW, not WHAT.

```
TRIGGER: card.struggled {cardId, wrongCount: 3}
  → AGENT receives: trigger data + learner profile + agent memory
  → AGENT generates: explanation text
  → OUTPUT goes to: chat.send(generated text)
```

Use for: Content generation where the output channel is known. The tool prompt can say "Explain in 2 sentences using an analogy."

**Type 3: Trigger → Agent → Action Selection (agent chooses + fills)**

Agent receives trigger data AND a list of available actions. Agent decides WHAT to do and fills the chosen action.

```
TRIGGER: review.fatigue {accuracy: 0.45, duration: 40min}
  → AGENT receives: trigger data + available actions
    [chat.send, ui.showHint, memory.write, silent.observe]
  → AGENT decides: ui.showHint("Kurze Pause?")
  → OR: silent.observe() (decides it's not worth interrupting)
```

Use for: Complex situations where the right response depends on context. The agent's role prompt guides the decision.

### Prompt Hierarchy

```
Agent Role Prompt (always active):
  "Du bist ein Anatomie-Tutor. Visueller Stil, direkte Sprache.
   Bevorzuge Bilder und Vergleiche. Schreibe nur in den Chat
   wenn du wirklich etwas Wertvolles beizutragen hast."

Tool-specific Prompt (optional, per tool):
  Tool 2: "Erkläre das Konzept in max 2 Sätzen mit einer Analogie."
  Tool 3: "Entscheide basierend auf der Tageszeit und Konzentration."
```

The role prompt is the agent's personality. Tool prompts are task-specific instructions. Both are sent to the AI model when the agent makes decisions (Type 2 and Type 3).

### Example: Complete Agent Definition

```
AGENT: "Anatomie-Coach"
  Role Prompt: "Du bist ein Anatomie-Tutor..."
  Color: #0A84FF
  Icon: stethoscope
  Available Actions: [chat.send, memory.write, ui.showHint,
                      card.addNote, profile.update, silent.observe]

  TOOL 1: "Schwäche tracken" (Type 1 — direct)
    Trigger: card.answered {ease ≤ 1}
    → memory.write({cardId, topic, ease, timestamp})

  TOOL 2: "Erklärung geben" (Type 2 — agent fills action)
    Trigger: card.struggled {wrongCount ≥ 3}
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

## Creator Studio Vision

The Creator Studio is the visual builder for agents. It serves three purposes:
1. **Build** — Create and configure agents with a visual interface
2. **Monitor** — See live what agents are doing (events, decisions, actions)
3. **Debug** — Understand why an agent made a specific decision

### Builder Interface

```
┌─ Creator Studio ─────────────────────────────────────┐
│                                                       │
│  ┌─ Agent ──────────────────────────────────────────┐│
│  │  Name: [Anatomie-Coach      ]  Color: [●]  Icon: ││
│  │                                                   ││
│  │  Role Prompt:                                     ││
│  │  [Du bist ein Anatomie-Tutor. Visueller Stil,   ]││
│  │  [direkte Sprache. Bevorzuge Bilder...          ]││
│  │                                                   ││
│  │  Available Actions:                               ││
│  │  ☑ chat.send    ☑ memory.write   ☑ ui.showHint   ││
│  │  ☐ card.rate    ☑ profile.update ☑ silent.observe ││
│  └───────────────────────────────────────────────────┘│
│                                                       │
│  ┌─ Tools ───────────────────────────────────────────┐│
│  │                                                    ││
│  │  ┌─ Tool 1 ─────────────────────────────────────┐ ││
│  │  │ "Schwäche tracken"              [Type 1: ▼]  │ ││
│  │  │ Trigger: [card.answered     ▼] wenn ease ≤ 1 │ ││
│  │  │ → Action: [memory.write     ▼]               │ ││
│  │  │   Data: {cardId, topic, ease, timestamp}      │ ││
│  │  └───────────────────────────────────────────────┘ ││
│  │                                                    ││
│  │  ┌─ Tool 2 ─────────────────────────────────────┐ ││
│  │  │ "Erklärung geben"              [Type 2: ▼]  │ ││
│  │  │ Trigger: [card.struggled   ▼] wrongCount ≥ 3 │ ││
│  │  │ Tool Prompt: [Erkläre in 2 Sätzen...]        │ ││
│  │  │ → Agent fills → [chat.send  ▼]               │ ││
│  │  └───────────────────────────────────────────────┘ ││
│  │                                                    ││
│  │  [+ Tool hinzufügen]                              ││
│  └────────────────────────────────────────────────────┘│
│                                                       │
│  ┌─ Live Monitor ────────────────────────────────────┐│
│  │  12:31:05  card.answered {ease:1}                  ││
│  │    → Tool 1 triggered → memory.write ✓             ││
│  │  12:33:22  card.struggled {wrongCount:3}           ││
│  │    → Tool 2 triggered → Agent thinking...          ││
│  │    → chat.send ✓ "Der Meniskus ist..."             ││
│  │  12:45:00  review.fatigue {accuracy:0.45}          ││
│  │    → Tool 3 triggered → Agent chose: silent.observe││
│  └────────────────────────────────────────────────────┘│
│                                                       │
│  [Agent testen]  [Speichern]  [Aktivieren]            │
└───────────────────────────────────────────────────────┘
```

### Vibe Coding Mode

Within the Creator Studio, a conversational AI assistant helps build agents:

```
User: "Ich möchte, dass wenn der Nutzer frustriert ist,
       ein ermutigender Hinweis kommt"

Assistant suggests 3 trigger options:
  A) card.struggled (3x wrong on same card)
     → Concrete frustration with a specific card
  B) review.fatigue (accuracy drops >20%)
     → General concentration decline
  C) Composite: card.struggled + review.fatigue within 5 min
     → Both signals together = high confidence frustration

User picks C, assistant generates:
  Tool "Frustrations-Erkennung" (Type 3)
  Trigger: composite(card.struggled, review.fatigue, window: 5min)
  Actions: [chat.send, ui.showHint, plusi.react]
  Tool Prompt: "Der Nutzer ist frustriert. Reagiere ermutigend
               aber nicht herablassend. Kurz halten."
```

The Vibe Coding mode makes the event catalog and action registry accessible to non-technical users. Instead of knowing that `card.struggled` exists, you describe what you want in natural language and the assistant maps it to the right triggers and actions.

### Dashboard View

The Creator Studio also serves as an overview of the entire agent ecosystem:

```
┌─ Agent Dashboard ────────────────────────────────────┐
│                                                       │
│  Active Agents                                        │
│                                                       │
│  ● Tutor          4 tools   23 triggers today   [▸]  │
│  ● Plusi          2 tools    8 triggers today   [▸]  │
│  ● Research       1 tool     0 triggers today   [▸]  │
│  ○ Exam-Coach     3 tools   (inactive)          [▸]  │
│                                                       │
│  Event Flow (last hour)                               │
│  ████████████████░░░░  card.answered (142)            │
│  ███░░░░░░░░░░░░░░░░  card.struggled (12)            │
│  █░░░░░░░░░░░░░░░░░░  chat.sent (4)                  │
│  █░░░░░░░░░░░░░░░░░░  review.fatigue (1)             │
│                                                       │
│  [+ Neuen Agent erstellen]                            │
└───────────────────────────────────────────────────────┘
```

This view answers: What agents exist? What are they doing? How active are they? It is the control center for the agentic platform.

## What This Is NOT

- Not a plugin system (that comes later, if needed)
- Not an abstraction layer over Anki (we still use Anki APIs directly in Python)
- Not a framework (it's three Maps/dicts with a naming convention)
- Not extra work (it's a structural decision, not a feature)
- The Creator Studio is a future UI project — the underlying architecture (registries, event bus, agent definition format) comes first
