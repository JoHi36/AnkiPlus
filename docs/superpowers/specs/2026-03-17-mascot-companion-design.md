# Mascot Companion — Design Spec

**Date:** 2026-03-17
**Status:** Draft
**Feature flag:** Beta — toggleable via Settings

---

## Overview

A persistent animated mascot character lives in the bottom-left of the AnkiPlus panel. It reacts to learning events automatically and can be switched into "Companion Mode" where the user chats directly with it through the existing input field. The mascot has its own system prompt, its own conversation history, and its own mood state — fully separate from the main AI chat and card sessions.

---

## 1. Visual Design

### Character

A stylized Plus-sign with a face, built entirely from CSS/SVG (no external assets or Lottie dependency at launch). Design properties:

- **Shape:** Two overlapping rectangles forming a + sign, `border-radius: 3px` (intentionally sharp, not bubbly)
- **Color:** Apple Blue (`#007AFF`) as base
- **Eyes:** Small white ovals with dark blue pupils that animate per mood
- **Mouth:** Half-D shape (bottom half of a circle, dark `#003a80`) as default; changes per mood
- **No arms, no cheeks** in the default state; blush mood adds a subtle top-down red gradient
- **Shadow:** Subtle ellipse beneath that breathes with the float animation

### Replaceability

The character is wrapped in a `<MascotShell>` component that accepts either the CSS character or a future Lottie JSON source. Swapping to Lottie later requires changing only `MascotShell.jsx` — the mood prop interface stays identical.

### Size & Position

- Fixed position: **bottom-left** of the chat panel, above the input field
- Size: ~52×52px character + speech bubble space above
- Always visible when the feature is enabled (not only during review)

---

## 2. Mood System

### 8 Mood States

| Mood | JSON key | Body animation | Eyes | Mouth | Color |
|------|----------|---------------|------|-------|-------|
| Neutral | `neutral` | Gentle float, pupils wander slowly | Blink, wander | Half-D | Blue |
| Happy | `happy` | Fast bounce, higher amplitude | Fast blink, pupils up | Wide half-D | Blue |
| Blush | `blush` | Side-to-side wiggle | Pupils down, slightly squinted | Tiny oval | Red→Blue gradient top-down |
| Sleepy | `sleepy` | Slow sway | Thin lines (no pupils) | Tiny oval | Grey |
| Thinking | `thinking` | Slight tilt + float | Pupils dart left-right | Half-D | Blue |
| Surprised | `surprised` | Single pop on entry, then gentle drift | Wide oval, pupils expand briefly | Round O | Blue |
| Excited | `excited` | Fast spin-dance | Pupils orbit | Wide half-D | Purple (`#7c3aed`) |
| Empathy | `empathy` | Slow droop | Pupils down | Inverted D (frown) | Dark blue |

### Transitions

- Mood changes use a `0.3s opacity` cross-fade via CSS class swap
- The `thinking` state serves as the natural transition between all moods (user sends → thinking → new mood)
- After an AI-driven mood, if no new message arrives within 30s, the mascot falls back to the last event-driven mood. If no event-driven mood has been set yet in the session, falls back to `neutral`.

### Two Mood Sources

**1. Event-driven (automatic, no user input required)**

| App event | Mood triggered |
|-----------|---------------|
| Card answered correctly | `happy` |
| 3+ consecutive wrong answers | `empathy` |
| Streak of 5+ correct | `excited` |
| 10+ minutes idle | `sleepy` |
| New card appears | `thinking` (briefly), then `neutral` |
| User opens mascot chat | `happy` (greeting) |

**2. AI-driven (Companion Mode responses)**

The companion AI prefixes every response with a JSON mood token:

```
{"mood":"happy"}
Great job! You're really getting the hang of this topic...
```

The stream parser in `useCompanion.js` strips this prefix before rendering. The extracted mood is applied to the mascot immediately as streaming begins. Event-driven moods have lower priority and are overridden by AI moods during active conversation.

---

## 3. Companion Mode

### Activation

- User **clicks the mascot** → Companion Mode activates
- The chat input field changes to a distinct color (e.g., soft purple/indigo tint) to signal the mode
- A brief greeting speech bubble appears above the mascot
- Pressing **Escape** or clicking the mascot again deactivates → input returns to normal, mood resets toward current event-driven state

### Conversation Behavior

- Messages typed in Companion Mode go to the **Companion AI** (separate endpoint call with own system prompt and history)
- **No persistent chat log shown** — only a floating speech bubble that auto-dismisses after ~4s or when the next message arrives
- Companion history is kept in memory for the session (last 10 exchanges) for contextual continuity, but is **not saved to disk** and not shared with main chat sessions. When the 10-exchange limit is exceeded, the oldest exchange is dropped (no summarization).
- The mascot knows **only surface-level app signals** (e.g., "user just answered 3 cards wrong") injected as a brief context note in the system prompt — it does NOT receive card content, deck details, or main chat history

### Speech Bubble

- Appears above the mascot, positioned to avoid covering card content
- Max ~80 characters per bubble; longer responses are trimmed to a first sentence with a gentle indicator
- Fades in (0.2s) and auto-dismisses (0.3s fade-out) after a display time calculated from text length: `clamp(2.5s, charCount * 50ms, 6s)` — short messages vanish quickly, long ones get more time but never block the UI for more than 6s. Exact values to be tuned during testing.
- No scroll, no history view

---

## 4. AI Integration

### Companion System Prompt

The companion has a dedicated system prompt (separate from main chat) that defines:
- **Personality and tone:** To be specified in a dedicated personality design session (separate spec). Placeholder for implementation: emotionally supportive, warm, slightly playful, speaks informally in the user's language (German or English), never condescending. Full personality spec must be completed before the companion AI integration is implemented.
- Instruction to always prefix responses with `{"mood":"<key>"}`
- Awareness of surface app signals passed as context
- Response length constraint: short, conversational, max 2-3 sentences

### Mood JSON Format

```json
{"mood": "happy"}
```

Simple single-field prefix. Parser uses a regex to detect and strip `^{"mood":"[a-z]+"}` at stream start. Falls back to `neutral` if the prefix is missing or malformed.

### Context Injection (surface signals only)

Before each companion API call, a brief context string is prepended to the user message internally:

```
[Context: User has answered 4 cards correctly in a row. Current deck: Biochemistry.]
User: ich bin so müde heute
```

The companion never sees card front/back content.

---

## 5. Architecture

### New Files

| File | Purpose |
|------|---------|
| `frontend/src/components/MascotShell.jsx` | Wrapper — renders CSS mascot or future Lottie source |
| `frontend/src/components/MascotCharacter.jsx` | Pure CSS/SVG animated character, accepts `mood` prop |
| `frontend/src/components/SpeechBubble.jsx` | Auto-dismissing speech bubble |
| `frontend/src/hooks/useMascot.js` | Mood state, event listeners, transition logic |
| `frontend/src/hooks/useCompanion.js` | Companion AI call, history management, stream parsing |

### Modified Files

| File | Change |
|------|--------|
| `frontend/src/App.jsx` | Mount `<MascotShell>` + `<SpeechBubble>`, pass app events to `useMascot` |
| `frontend/src/components/ChatInput.jsx` | Accept `companionMode` prop, apply tint when active |
| `bridge.py` | Add `companionChat(systemPrompt: str, history: str, message: str) -> str` bridge method (streaming, same pattern as `sendMessage`) |
| `widget.py` | Handle `companionChat` message type, route to AI handler with companion system prompt |
| `frontend/src/components/SettingsModal.jsx` | Add beta toggle for mascot feature |
| `config.py` / `config.json` | Store `mascot_enabled` flag |

### State Flow

```
App event (card right/wrong/idle)
  → useMascot.setEventMood(mood)
  → MascotCharacter re-renders with new mood class

User clicks mascot
  → companionMode = true
  → ChatInput shows tint
  → useMascot.setMood("happy") [greeting]
  → SpeechBubble shows greeting

User types + submits in companion mode
  → useCompanion.send(text, surfaceContext)
  → bridge.companionChat(systemPrompt, history, text)
  → Python: AI call with companion system prompt
  → stream prefix {"mood":"..."} parsed → useMascot.setMood(aiMood)
  → remaining text → SpeechBubble
  → history updated in useCompanion
```

---

## 6. Settings & Beta Flag

- Toggle in **Settings Modal** under a "Beta Features" section: "Mascot Companion (Beta)"
- Stored as `mascot_enabled: bool` in `config.json`
- When disabled: mascot is not rendered at all, no API calls made
- Suitable as a future **Premium Feature** — flag can be gated behind auth check

---

## 7. Out of Scope (this iteration)

- Voice input integration (separate feature, can share the shortcut concept later)
- Persistent companion history across sessions
- Lottie animation replacement
- Mascot personality design (separate spec)
- Custom mascot skins or user-selectable characters
