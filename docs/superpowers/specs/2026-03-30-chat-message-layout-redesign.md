# Chat Message Layout Redesign

**Date:** 2026-03-30
**Status:** Approved
**Problem:** The current chat layout looks like a generic chatbot — icon + "Tutor" label with gray background, user messages as small centered text, no visual hierarchy between question and answer. With the shift to one agent per medium (no more agent-switching), the UI needs to reflect this: cleaner, more premium, emphasizing the agentic work rather than a chatbot persona.

## Design Decisions (from brainstorming)

1. **Question as heading** (Option A) — user question rendered as large bold title
2. **Activity Line** (Option D) — agent shows what it did, not who it is
3. **Fade Line separator** (Option B) — subtle divider between Q&A blocks
4. **No icon, no background, no color-coding** per agent

## Layout Structure

A single Q&A block consists of three parts, top to bottom:

```
┌──────────────────────────────────────────────┐
│ Was ist Biotin?                    ← Question │
│                                               │
│ tutor · 7.908 Karten · 3 Quellen  ← Activity │
│                                               │
│ Biotin, auch bekannt als...        ← Answer   │
│ prosthetische Gruppe [1][2]...               │
└──────────────────────────────────────────────┘
── fade line ──────────────────────────────────
┌──────────────────────────────────────────────┐
│ Wie funktioniert Hämoglobin?                 │
│ ...                                          │
└──────────────────────────────────────────────┘
```

### 1. Question (User Message)

- **Font size:** 21px
- **Font weight:** 700 (bold)
- **Letter spacing:** -0.3px
- **Color:** `var(--ds-text-primary)`
- **Line height:** 1.3
- **Font family:** system font (SF Pro Display), NOT Space Grotesk
- **Margin bottom:** 14px to activity line
- **Alignment:** left (not centered as currently)
- No bubble, no background, no avatar, no "You" label

### 2. Activity Line (Agent Header)

Replaces the current `AgenticCell` header (icon + name + background).

**Format:** `{name} · {action} · {dots} {sources}`

**Example:** `tutor · durchsuchte 7.908 Karten · ●●● 3 Quellen`

**Styling:**
- **Agent name:** 11px, font-weight 600, `var(--ds-text-secondary)`
- **Separator dots (·):** opacity 0.3
- **Action text:** 11px, `var(--ds-text-tertiary)` — e.g. "durchsuchte 7.908 Karten"
- **Source dots:** 4px colored dots (blue = Anki, green = web) — same as `SourceCountBadge`
- **Source count:** 11px, `var(--ds-text-tertiary)` — e.g. "3 Quellen"
- **Margin bottom:** 8px to answer text

**Action text mapping:**
- When RAG pipeline ran: `durchsuchte {total_cards} Karten` (total_cards from deck stats)
- When no search needed: `direkte Antwort` (no dots, no source count)
- Optional additions: `· {step_count} Schritte` if step count > 3 (shows pipeline complexity)

**During loading state:**
- Activity line shows: `tutor · ` followed by the ReasoningDots (progress dots from the previous redesign)
- Below that: the CompactReasoningDisplay step label (as already implemented)
- After generation: dots morph to the full activity line with final counts

**When no sources cited:**
- Activity line shows: `tutor · direkte Antwort`
- No dots, no source count

### 3. Answer (Agent Response)

- **Font size:** 15px (`var(--ds-text-lg)`)
- **Line height:** 1.65
- **Color:** `var(--ds-text-primary)`
- **No container** — no background, no border, no padding around the answer
- Inline citations as colored badges (blue/green, already implemented)
- Markdown rendering unchanged (blockquotes, code blocks, lists, etc.)

### 4. Block Separator (Fade Line)

Between Q&A blocks:

- **Height:** 1px
- **Background:** `linear-gradient(90deg, transparent 0%, var(--ds-border) 20%, var(--ds-border) 80%, transparent 100%)`
- Alternatively with raw value: `linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 20%, rgba(255,255,255,0.08) 80%, transparent 100%)`
- **Margin:** 8px top + 24px bottom (more space before next question than after current answer)

## What Gets Removed

From the Tutor's `AgenticCell`:
1. **Agent icon** (graduation cap SVG) — removed
2. **Gray tinted background** (`color-mix(in srgb, ${color} 6%, transparent)`) — removed
3. **Glow effect** (`.agent-cell-glow`) — removed
4. **"Anki" badge** in top-right — replaced by source count in activity line
5. **Color-coded styling** (`--agent-rgb`, `--agent-color`) — removed for Tutor

From user messages:
1. **Center alignment** — changed to left
2. **Small text size** — changed to 21px heading

## What Stays

- The `AgenticCell` component still exists for other agents (Research, Plusi) — this redesign targets the Tutor rendering specifically
- Inline citation badges (blue/green, hold-to-peek) — unchanged
- ReasoningDots during loading — still rendered, but repositioned into the activity line area
- SourceCountBadge logic — reused for the activity line source count

## Component Changes

### Modified: User message rendering in ChatMessage.jsx
- User messages get heading styles instead of the current centered paragraph
- Left-aligned, 21px bold

### Modified: Tutor AgenticCell rendering in ChatMessage.jsx
- When `cell.agent === 'tutor'`: render ActivityLine + answer without AgenticCell wrapper
- Other agents keep their current AgenticCell rendering

### New: `ActivityLine` component
Small component rendering `{name} · {action} · {dots} {count}`.
Props: `agentName`, `cardCount` (searched), `stepCount`, `citedCount`, `cardSourceCount`

### Modified: Fade line separator
Add between consecutive Q&A blocks in the chat message list.

## Data Flow for Activity Line

The activity line needs:
1. **Agent name** — from `cell.agent` (already available)
2. **Card count** — total cards searched. Source: deck stats or from pipeline data. Fallback: omit action text.
3. **Step count** — number of pipeline steps. Source: `cell.pipelineSteps?.length` or from reasoning store.
4. **Cited source count + type split** — already computed (from previous reasoning redesign work).

## Scope

This spec covers ONLY the Tutor message layout in the Session view (chat sidebar). It does NOT cover:
- Other agents (Research, Plusi, Help)
- The Stapel/FreChat view
- The ReviewerView
- Settings or navigation
