# Plusi Concept Redesign — Spec

## Overview

Plusi is a living companion character that exists in two places: as an inline widget in chat messages (spawned by the main AI or triggered via `@Plusi`), and as a persistent animated presence in the bottom-left dock. This spec defines the interaction model, visual design, and mood system.

## Two Trigger Paths

### 1. Main-AI spawns Plusi (Tool Call)

The tutor AI calls `spawn_plusi({situation: "..."})` as part of its response. Plusi appears as a PlusiWidget embedded within the tutor's message. The AI decides when Plusi adds value — encouragement, humor, emotional support, actions (navigate, toggle theme).

Multiple spawns per message are allowed. Each spawn can have a different mood and text. Multiple actions within one spawn are separated by a fade divider inside a single widget.

**Multi-spawn data model:** Each `spawn_plusi` tool call produces one `[[PLUSI_DATA: {...}]]` marker in the streaming response. Multiple markers = multiple PlusiWidgets rendered sequentially within one chat message. Each marker contains `{mood, text, meta}`.

### 2. `@Plusi` Direct Message

User types `@Plusi` in the chat input. This:
- Gets visually highlighted as a blue tag in the input field
- Bypasses the router and main AI entirely
- Goes directly to Plusi's backend agent (`plusi_agent.py::run_plusi()`)
- Plusi responds as a standalone PlusiWidget (rendered as a bot message of type `plusi_direct`)

**Routing mechanism:** Frontend detects `@Plusi` prefix in the message text before sending. Instead of the normal `sendMessage` bridge call, it sends a `plusiDirect` bridge message with the user text (minus the `@Plusi` prefix). Python handler calls `plusi_agent.py::run_plusi(situation=text)` and returns the result as a `plusi_direct` event. Frontend renders a PlusiWidget as a standalone chat message (no tutor wrapper).

**Single AI backend:** All Plusi AI calls go through `plusi_agent.py` (persistent SQLite history, relationship levels, full Markdown). The frontend `useCompanion.js` companion chat flow is removed — its bridge handler `companionChat` is replaced by `plusiDirect`.

"Plusi fragen" in the dock context menu inserts `@Plusi` into the input and focuses it.

## Chat Widget (PlusiWidget)

### Layout
- Rectangular, no border-radius, no border-left stripe
- Background: `rgba(10,132,255,.04)`
- Header bar: slightly darker `rgba(10,132,255,.06)`

### Header
- Left side: 24px animated Plusi character + "Plusi" name label
- Right side: mood text (e.g. "freut sich") + mood dot with glow
- Font: Space Grotesk, 12px weight 600 for name

### Content
- Below header, padding 7px 12px
- Font: Space Grotesk, 13px, color `rgba(232,232,232,.72)`
- Markdown rendering (ReactMarkdown)

### Multi-Action Divider
- When Plusi performs multiple actions in one spawn
- Fade line: `radial-gradient(ellipse at center, rgba(10,132,255,.25) 0%, transparent 80%)`
- 1px height, blue glow center fading to transparent edges

### States
- **Loading**: Shimmer animation + thinking character + "hmm, moment mal..."
- **Live**: Animated character (latest widget only), full opacity
- **Frozen**: Static character (no animation), opacity 0.55 — all widgets except the most recent

### Mood Dot Colors
- happy: #34d399
- empathy: #818cf8
- excited: #a78bfa
- neutral: #0a84ff
- thinking: #0a84ff
- sleepy: #6b7280
- surprised: #f59e0b
- blush: #f87171

## Dock Plusi (Bottom-Left)

### Character
- 48px animated Plusi, permanently visible
- Position: fixed, bottom-left of chat panel
- Always reflects the mood of the most recent live PlusiWidget in chat

### Context Menu (Click)
- Appears to the right of Plusi with slightly more gap than bubble
- Slim glass card: `rgba(18,18,18,.94)`, backdrop-blur, no visible border
- Left-side blue glow: `box-shadow: -4px 0 12px rgba(10,132,255,.06)`
- Floats in sync with Plusi's animation (both menu and Plusi share a parent container that has the animation, so they move together naturally via CSS inheritance)
- Plusi glows when menu is open
- Two items:
  - **Plusi fragen** (blue accent) — inserts `@Plusi` into chat input + focus
  - **Einstellungen** — opens settings dialog
- Fade separator between items (radial gradient)

### Event Reactions (Bubble)
- Compact bubble appears to the right of Plusi (same position as menu)
- Same glass-card aesthetic as menu, no border
- Left-side blue glow connecting visually to Plusi
- Floats in sync with Plusi's body animation (bounce-sync, droop-sync, float-sync)
- Auto-dismisses after ~4 seconds
- Purely local triggers, no AI call:
  - 5 cards correct: "Super, 5 richtig! 🔥" + happy bounce
  - Card wrong: "nächstes mal 💪" + empathy droop
  - 10 streak: "10er streak!! du bist on fire 🔥🔥" + excited bounce + glow
  - Other milestone events as needed
- **NOT used for AI responses** — those always go into the chat as PlusiWidget

## Mood System

### Three Priority Levels

1. **Chat-Mood** (highest): Set when a new PlusiWidget appears. Dock-Plusi mirrors this mood. Expires after ~30 seconds, then falls back to idle. Uses `useMascot.js::setAiMood()`.

2. **Event-Mood** (medium): Set by local events (card correct/wrong, streaks). Temporarily overrides chat-mood on the dock. Expires after ~4 seconds, then falls back to chat-mood (if still active) or idle. Uses `useMascot.js::setEventMood()`.

3. **Idle** (default): Neutral float animation with wandering pupils. Active when no chat-mood and no event-mood are active.

### Event Trigger Sources
Events originate from existing Python hooks via the bridge message queue:
- `reviewer_did_show_question` hook already tracks card answers in `card_tracker.py`
- Frontend receives card result events via `window.ankiReceive({type: 'cardResult', correct: true/false})`
- Streak counting is client-side: a simple counter in `App.jsx` that increments on correct, resets on wrong
- Event reactions are hardcoded text strings (no AI call), defined in a lookup table in `MascotShell.jsx`

### Freeze Rule
- Only the most recent PlusiWidget in chat is "live" (animated, full opacity)
- All previous PlusiWidgets are "frozen" (static, opacity 0.55)
- Parent component (`ChatMessage.jsx`) determines freeze state: compare widget index to total count, only last is live
- Dock-Plusi always mirrors the mood of the most recent live widget (or idle if none)

## `@Plusi` Tag in Input

When user types `@Plusi` in the chat input:
- The text gets highlighted as a styled tag (blue background, Space Grotesk font, rounded)
- Visual treatment: `background: rgba(10,132,255,.18)`, `color: #0a84ff`, `font-weight: 600`
- **Implementation approach:** Use an overlay `<div>` positioned behind the transparent `<textarea>` that renders the styled tag. The textarea itself stays plain text. This avoids contentEditable complexity while providing visual highlighting. Pattern: mirror the textarea content into the overlay div, replace `@Plusi` with a `<span>` styled element.
- Message is routed to `plusi_agent.py` via `plusiDirect` bridge message (no router, no main AI)
- Response appears as standalone PlusiWidget

## Existing Implementation (What's Already Built)

### Backend (mostly complete, one fix needed)
- `plusi_agent.py` — Gemini Flash calls, mood parsing, persistent history. **Fix needed:** System prompt references relationship levels by day count ("Tag 1-3", "Tag 4-14") but `plusi_storage.py` levels up by interaction count (10, 30, 100). Align system prompt to match code (interaction-based).
- `plusi_storage.py` — SQLite tables for history + categorized memory
- `tool_registry.py` — Central tool registry with `spawn_plusi` tool
- `agent_loop.py` — Multi-turn agent loop with Plusi widget injection
- `tool_executor.py` — Tool dispatch with frontend callback

### Frontend (needs updates per this spec)
- `PlusiWidget.jsx` — Needs redesign per this spec (rectangular, new header layout, fade divider)
- `MascotCharacter.jsx` — Complete, all 8 moods working
- `MascotShell.jsx` — Needs context menu + event bubble additions
- `CompanionCard.jsx` — Delete (replaced by event bubble in MascotShell). Note: `MascotShell.jsx` imports it, so update MascotShell first.
- `useCompanion.js` — Delete entirely. Replace with a simple `usePlusiDirect.js` hook that sends `plusiDirect` bridge message and handles the response. The companion chat flow (`companionChat` bridge message + handler) is removed.
- `useMascot.js` — Mood priority system already implemented, needs timeout tuning
- `App.jsx` — Integration mostly done, needs @Plusi input handling + event triggers

## Key Files to Modify

1. `PlusiWidget.jsx` — Redesign: rectangular, header with mood-right, fade divider, frozen state
2. `MascotShell.jsx` — Add context menu + event bubble (right of Plusi, synced float)
3. `CompanionCard.jsx` — Delete (after MascotShell is updated)
4. `useCompanion.js` — Delete, replace with `usePlusiDirect.js`
5. `useMascot.js` — Add event-mood timeout (~4s), chat-mood timeout (~30s)
6. `ChatInput` component — @Plusi tag detection and highlighting
7. `App.jsx` — Wire @Plusi routing, event triggers (card correct/wrong/streak), remove CompanionCard + useCompanion references
8. `bridge.py` / `widget.py` — Add `plusiDirect` bridge handler, remove `companionChat` handler
9. `plusi_agent.py` — Fix relationship level references in system prompt (days → interaction count)
