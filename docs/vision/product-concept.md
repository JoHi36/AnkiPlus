# AnkiPlus — Product Concept

## What AnkiPlus Is

AnkiPlus is a learning platform built on top of Anki. It extends Anki with AI agents that help users find, learn, and plan — without ever forcing them to use AI. The platform replaces Anki's native UI with a modern fullscreen React app, but preserves the core Anki workflow: decks, cards, spaced repetition.

**The fundamental promise:** You can use AnkiPlus exactly like regular Anki. You never have to touch AI. But when you do, it feels like a natural extension — not a separate tool bolted on.

## The Three Cognitive Modes

AnkiPlus organizes learning into three modes, each with its own view. The tabs in the TopBar use Anki-familiar terminology (Stapel, Session, Statistik) so existing Anki users feel at home.

### Stapel → Finden (Find)

**Mental model:** "I want to discover something."

The Stapel view is the starting point. By default, it shows the familiar deck hierarchy — decks, due counts, progress bars. This IS Anki, just prettier.

**The search bar is the entry point to AI.** When the user types a query, the entire screen transforms into an agent-generated state: images on the canvas, structured content in the sidebar, interactive elements everywhere. Each query produces one complete state. A new query replaces it entirely — no history visible to the user.

**Key properties:**
- **State-based interaction.** One query = one result. The result is interactive (clickable terms, explorable perspectives, linked cards), but it's a single state, not a conversation. New query = new state.
- **Invisible context.** The router maintains the full history of queries behind the scenes. It uses this context to route follow-up queries intelligently (e.g., recognizing that "und die Klappen?" after a heart query is still cardiology, or that a personal question should go to Plusi). The user doesn't see or manage this history.
- **Canvas + Sidebar layout.** Left: visual, media-rich, interactive content (image grids, knowledge graphs, diagrams). Right: text-oriented, structured content (definitions, perspectives, term lists). The two sides are linked — clicking a perspective in the sidebar highlights related nodes on the canvas.
- **Agent-colored.** When an agent is active, the entire screen takes on the agent's color identity. Tutor = neutral/gray (default), Plusi = blue, Research = their color. Agent switches are communicated through color transitions, not labels or explanations.

**What it replaces:** The Stapel view replaces static textbook chapters. Instead of "Chapter 12: The Heart", the user asks "wie groß ist das Herz" and gets a dynamically generated, personalized exploration — images from their own cards, perspectives ranked by their learning gaps, terms they haven't mastered yet. This IS the chapter, but alive and personal.

### Session → Lernen (Learn)

**Mental model:** "I'm actively studying."

The Session view is where cards are reviewed. It shows the current card (question/answer), with the ability to open a chat sidebar for deeper engagement.

**Key properties:**
- **History-based interaction.** Unlike Stapel, the Session maintains a visible conversation history, because here the process of asking IS the learning. Questions build on each other, and the context of "I asked about this term, then this one" is itself valuable.
- **Card-bound.** Every conversation is anchored to a specific card. When you move to the next card, you get a fresh context. The previous conversation is summarized and stored as compact notes — more like study notes you'd throw away after the exam than a permanent archive.
- **One input field, one glass object.** The chat input is the single interactive glass element on screen. When the sidebar is closed, it's centered below the card. When opened, it slides to the right into the sidebar. Never two input fields simultaneously.
- **Agents enhance, not replace.** The Tutor agent can auto-evaluate answers, generate multiple choice questions, explain concepts. But the core loop — see question, think, see answer, rate — works without any AI at all.

**The dynamic session:** Through the Tutor agent, sessions are no longer limited to "pick a deck, review all cards." Users can study cards about a specific concept, cards related to an image, cards matching a knowledge graph cluster. The session becomes a flexible, agent-curated learning experience — but only if you want it. The regular "review due cards" flow works exactly as in vanilla Anki.

### Statistik → Planen (Plan)

**Mental model:** "Where am I, and where do I need to go?"

The Statistik view shows learning progress and helps set goals. It's the least developed view currently but has a clear direction.

**Planned components:**
- **Heatmap.** Visual overview of knowledge areas — what's strong (green), what's weak (red), what's untouched (gray). Currently lives on the Stapel start page; will migrate here.
- **Learning plans.** Goal-driven study planning: "I want to reach 80% mastery on this deck by June 15." The system calculates daily workload, suggests session structure (e.g., 50-card blocks with breaks), and tracks progress.
- **Agent integration.** A planning agent could create study plans (in the Stapel, state-based), which are then displayed and tracked here. The agent is available everywhere — in Stapel it creates plans, in Session it suggests the next block, in Statistik it shows progress.

**Open questions (intentionally unresolved):**
- Does the planning agent also live in Stapel (state-based plan creation) or only in Statistik?
- Does Statistik follow the Canvas + Sidebar schema, or is it more dashboard-like?
- How does "dynamic session creation" (from Stapel) interact with "planned sessions" (from Statistik)?

## Core Design Principles

### 1. Anki Without AI Is Complete

The user can use AnkiPlus with zero AI interaction and still get value: a better-looking UI, automatic answer evaluation based on time/card length, a cleaner reviewer. AI is additive, never mandatory. This is non-negotiable — it preserves trust and makes the product accessible to AI-skeptical users.

### 2. Complexity From Emergence

No feature should feel complex on its own. The complexity of the platform arises from how simple pieces interact — agents that observe and respond, a knowledge graph that connects cards, a search that generates interactive states. Each piece is simple; together they create something powerful. If a feature needs explanation, it's too complex.

### 3. One Glass Object

At any given moment, there is one primary interactive glass element (frosted glass material) on screen. This is the user's focal point for input — the search bar in Stapel, the chat input in Session. Exception: In Stapel with an active agent, two glass objects coexist (search bar = "new query" entry point at top, action dock = "enter session" at bottom), justified because they serve different phases of the flow (ask → act).

### 4. Every Agent Has a Channel

Each agent owns exactly one UI channel. The channel determines the agent — no routing needed, no @mentions, no agent-switching mid-conversation. The user interacts with the right agent by using the right part of the interface:

- **Research Agent → Stapel** (search bar → canvas + sidebar). State-based: one query = one result.
- **Tutor Agent → Session** (chat sidebar during card review). History-based: conversation builds over cards.
- **Plusi → Plusi bubble** (click Plusi icon → speech bubble). Compact: personality + app help.
- **Prüfungs-Agent → Reviewer input** (inline during card answer). Evaluates answers, generates MC.

Agents share capabilities (RAG, web search) but differ in prompt, context, and output format. The Tutor auto-triggers web search when card similarity is low (cos < 0.60); the Research Agent leads with web research and uses more cards as context references. Both use the same RAG pipeline — differentiated by orchestration, not by toolset.

### 5. The Interface Communicates Through Behavior

There is no onboarding, no tutorial, no labels explaining "this is state-based" vs "this is history-based." The difference is felt through:
- **Animation:** In Stapel, new states replace everything (full-screen transition). In Session, new messages scroll in (additive).
- **Color:** Agent switches change the entire screen's color identity. No explanation needed.
- **Input field behavior:** In Stapel, the input shows the last query (like a URL bar — click to replace). In Session, the input is empty (like a chat — type to add).

### 6. Anki Recognition

Tab names, deck terminology, card concepts — all use Anki vocabulary. The user should think "this is Anki, but better" not "this is a new app I need to learn." The extension should feel natural, not alien. This matters especially for the Anki community, where trust in the core tool is paramount.

## The Agent Model in Stapel (Detail)

The Stapel view is the **Research Agent's channel**. Every search query goes to Research — no routing decision needed.

```
1. DEFAULT STATE
   - Deck list visible (standard Anki hierarchy)
   - Search bar at top (frosted glass, centered)
   - Plusi in corner (optional, ambient)

2. USER TYPES QUERY → Search bar
   - Search bar slides up, becomes compact (shows last query)
   - Research Agent activates: canvas fills with visual content (left ~65%)
   - Sidebar appears with structured text (right ~35%)
   - Action dock slides in from bottom-right
   - Agent identity visible (Research green, icon in sidebar header)

3. USER TYPES FOLLOW-UP → Same search bar (now at top)
   - Research Agent processes with invisible history context
   - Canvas + sidebar update (state replacement)
   - No agent switching — always Research in this view

4. USER ACTS → Action dock (e.g., "100 Karten kreuzen")
   - Transitions to Session view (→ Tutor Agent takes over)
   - Or closes agent state, returns to deck list
```

The search bar is the universal entry point. After the first query, it doubles as the follow-up input. The dock is for actions, not text input. Transitioning from Stapel to Session is a natural channel switch — Research hands off context to Tutor by opening a prepared card set.

## Layout Architecture

```
┌─────────────────────────────────────────────────┐
│  TopBar: [+ Heute: N Karten]  [Stapel|Session|Statistik]  [Neu Fällig Wieder]  │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌─ Canvas (left ~65%) ──┐  ┌─ Sidebar (~35%) ─┐│
│  │                       │  │  Agent Header     ││
│  │  Visual / Interactive │  │  (name, icon)     ││
│  │  - Image grids        │  │                   ││
│  │  - Knowledge graph    │  │  Tab Bar          ││
│  │  - Diagrams           │  │  [Def|Persp|Begr] ││
│  │  - Agent-specific     │  │                   ││
│  │    content            │  │  Structured text  ││
│  │                       │  │  content          ││
│  │                       │  │                   ││
│  └───────────────────────┘  └───────────────────┘│
│                                                  │
│  [Search bar / Follow-up input]     [Action Dock]│
└──────────────────────────────────────────────────┘
```

Canvas and Sidebar are linked: interactions on one side affect the other. The specific content depends on the active agent and the current state.

## The Third Way: Why No Chapters

Traditional learning platforms (Amboss, Via Medici) are **top-down**: structured chapters, written by experts, consumed passively. Anki is **bottom-up**: individual cards, no structure, pure active recall.

AnkiPlus is neither. It generates structure dynamically from the user's own card collection, enhanced by AI agents. When a user searches "Herz", they don't get a pre-written chapter — they get:
- Their own card images, grouped by subtopic (Aufbau, Mechanik, Erregung)
- Perspectives ranked by their personal learning gaps
- Terms from their knowledge graph, colored by mastery level
- An agent that can explain connections between any of these

This IS the chapter — but it's personal, interactive, and alive. It changes as the user learns. It uses their own material. And it's generated in seconds, not written over months.

The content pipeline for this system comes from two sources:
1. **User-created decks** — the traditional Anki way
2. **Creator Studio** (future) — institutional content creation with built-in embeddings, knowledge graphs, and auto-updating formats

## What This Document Does NOT Cover

- **Agent technical architecture** → See `agentic-platform-architecture.md`
- **Agent definitions and routing** → See `AGENTS.md`
- **Design system and visual rules** → See `docs/reference/DESIGN.md`
- **Reviewer interaction model** → See `docs/handoff/reviewer-concept.md`
- **Creator Studio details** → Future document (B2B platform for institutional content creation)
