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

## What This Is NOT

- Not a plugin system (that comes later, if needed)
- Not an abstraction layer over Anki (we still use Anki APIs directly in Python)
- Not a framework (it's three Maps/dicts with a naming convention)
- Not extra work (it's a structural decision, not a feature)
