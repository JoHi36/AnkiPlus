# Agent Chip System — Design Spec

**Date:** 2026-03-24
**Status:** Approved (brainstorming session)

## Overview

Replace the current colorful @-mention popup with an inline ghost-autocomplete system. Agents appear as a single chip at the start of the prompt. The chip is "sticky" — it persists across messages until explicitly deleted.

## Design Principles

- **Invisible Addiction** — zero extra UI elements. The text IS the UI.
- **Terminal autocomplete** — ghost text + Tab = power user pattern, universally understood.
- **One element** — no popup, no separate container, no second glass panel. Everything happens inside the existing input dock.

## System States

### State 1: Empty Input (focused)

```
┌─────────────────────────────────────────────┐
│  Frage stellen...                    [Tab]  │
├─────────────────────────────────────────────┤
│  Show Answer  SPACE    │    Übersicht       │
└─────────────────────────────────────────────┘
```

- Placeholder text visible
- **Right side: `Tab` kbd badge** — only visible when input is focused AND empty (no text, no chip)
- Pressing Tab inserts `@` and starts ghost autocomplete (→ State 3)

### State 2: Typing (no agent)

```
┌─────────────────────────────────────────────┐
│  Was ist ein Aktionspotential?|             │
├─────────────────────────────────────────────┤
│  Schließen  ESC        │    Übersicht       │
└─────────────────────────────────────────────┘
```

- Normal text input, no chip, Auto mode
- User can type `@` anywhere in text to trigger ghost autocomplete

### State 3: Ghost Autocomplete active

```
┌─────────────────────────────────────────────┐
│  @|Tutor                             [↑↓]  │
├─────────────────────────────────────────────┤
│  Schließen  ESC        │    Übersicht       │
└─────────────────────────────────────────────┘
```

- `@` typed (or Tab pressed in empty input)
- First matching agent appears as **ghost text** (muted color, no extra opacity) after cursor
- Right side shows `↑↓` hint for cycling
- **Tab** = accept ghost → creates chip (→ State 4)
- **↑↓** = cycle through agents (ghost changes)
- **Typing letters** = filter (e.g. `@Res|earch` shows only Research)
- **Escape** or **Backspace** past `@` = cancel, remove `@`
- **"Agenten anpassen"** is an entry in the autocomplete list, filterable via `@agen`
  - Selecting it opens the Agent Studio instead of creating a chip

### State 4: Chip active

```
┌─────────────────────────────────────────────┐
│  [Research] |                               │
├─────────────────────────────────────────────┤
│  Schließen  ESC        │    Übersicht       │
└─────────────────────────────────────────────┘
```

- Agent chip renders inline as first element in the textarea
- Chip style: `background: var(--ds-accent)`, `color: white`, rounded, small padding
- Cursor sits after chip, ready to type
- **Backspace** when cursor is directly right of chip → deletes entire chip → State 2 (Auto)
- Chip behaves like a single atomic character (one backspace = gone)

### State 5: Sticky after send

```
Message sent → new empty input:

┌─────────────────────────────────────────────┐
│  [Research] Frage stellen...                │
├─────────────────────────────────────────────┤
│  Schließen  ESC        │    Übersicht       │
└─────────────────────────────────────────────┘
```

- After sending a message, the chip **persists** in the new empty input
- Placeholder appears after chip
- User types directly, chip stays
- Chip remains sticky across unlimited messages until explicitly deleted

### State 6: Back to Auto

- User presses Backspace at chip → chip deleted
- Input returns to Auto mode (no chip, no agent)
- Chip does **not** reappear automatically. Only comes back via `@` or Tab.

## Agent Switching

- User can type `@NewAgent` anywhere in the text while a chip exists
- Ghost autocomplete appears for the new agent
- **During ghost phase:** existing chip remains unchanged, ghost shows the candidate
- **On Tab:** chip at front **switches** to new agent, `@NewAgent` text removed from prompt
- **On Escape:** ghost cancelled, `@NewAgent` text removed, old chip restored unchanged
- **No match:** if typed text matches no agent, `@text` remains as literal text (no chip change)
- Only one chip at a time

## Ghost Autocomplete Order

1. Agenten anpassen (meta action — opens Agent Studio, `name: 'agenten-anpassen'`)
2. Tutor
3. Research
4. Help
5. Plusi
6. (any future agents from registry)

Order is: settings entry first, then registry agents sorted by name.
Filter uses substring match against `name` and `label` fields.

## Tab Badge Behavior

The `Tab` kbd badge in the textarea:
- **Visible** when: input is focused AND input is empty (no text, no chip)
- **Hidden** when: any text typed, chip present, or input blurred
- **Position:** right-aligned inside the textarea area
- **Style:** same as other kbd badges: `fontSize: 10`, `background: var(--ds-bg-overlay)`, `borderRadius: 4`, `color: var(--ds-text-muted)`

## Visual Specs

### Chip
- `background: var(--ds-accent)`
- `color: white` (matches `.ds-send-btn` precedent in design-system.css)
- `font-size: 13px`
- `font-weight: 600`
- `padding: 1px 8px`
- `border-radius: 6px`
- `line-height: 20px`
- `margin-right: 5px`
- Vertically aligned with surrounding text baseline

### Ghost Text
- Same font as input text (`font-size: 15px`)
- `color: var(--ds-text-placeholder)` (0.30 alpha — visible but clearly non-interactive)
- `user-select: none`
- `pointer-events: none`
- Renders directly after cursor, no gap

### Tab Badge (empty state)
- `font-size: 10px`
- `color: var(--ds-text-muted)`
- `background: var(--ds-bg-overlay)`
- `border-radius: 4px`
- `padding: 1px 5px`
- Right-aligned, vertically centered in textarea row

## Implementation Notes

### ChatInput.tsx Changes
- Remove current mention popup (lines 340-417)
- Remove mention overlay highlight (lines 425-455)
- Add ghost autocomplete state: `ghostAgent`, `ghostIndex`, `ghostVisible`
- Add Tab handler: empty input + Tab → insert `@` + show ghost
- Chip rendered as a non-editable `<span>` before the `<textarea>`
- Ghost rendered as an absolutely positioned overlay after the cursor

### New prop on ChatInputProps
- `stickyAgent?: { name: string; label: string }` — passed from parent, used to render chip on mount and after send-reset
- `onStickyAgentChange?: (agent: { name: string; label: string } | null) => void` — called when chip is created, switched, or deleted
- ChatInput initializes internal chip state from `stickyAgent` prop
- After `handleSubmit` clears input text, chip re-renders from `stickyAgent` prop

### Parent (App.jsx / useChat.js) Changes
- New state: `stickyAgent` — persists the selected agent across message sends
- On send: pass `stickyAgent.name` to the message handler, keep it in state
- On `onStickyAgentChange(null)`: clear stickyAgent
- On `onStickyAgentChange(agent)`: update stickyAgent

### GlobalShortcutFilter Coordination
- Verify that `shortcut_filter.py` passes `Tab` through when `_text_field_has_focus` is true
- If Tab is currently consumed by Qt focus traversal, add it to the pass-through list
- Add a test case for Tab reaching the textarea

### "Agenten anpassen" Entry
- Registered with `name: 'agenten-anpassen'`, `label: 'Agenten anpassen'`
- Included in the autocomplete cycle as the first entry
- Filterable like agents (e.g. `@agen` matches via substring)
- On Tab/select: instead of creating a chip, calls `executeAction('agentStudio.open')` or equivalent
- No chip created for this entry

## What This Replaces

- Current @-mention popup with colored agent names and descriptions
- `MentionAgentIcon` component (no longer needed)
- Agent color rendering in the mention overlay
- The entire mention menu rendering block in ChatInput.tsx

## What Stays

- `subagentRegistry.ts` — still the source of truth for available agents
- `findAgent()` / `getRegistry()` — still used for lookup
- `getDirectCallPattern()` — still used for backend routing detection
