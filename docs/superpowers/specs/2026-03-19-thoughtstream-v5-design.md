# ThoughtStream v5 — Clean Pipeline UI Redesign

## Overview

Redesign the ThoughtStream component to be clean, subtle, and high-quality — Apple-style if Apple was an AI company. The ThoughtStream is one of the most frequently seen UI elements in the app. It must feel premium but never loud.

## Core Design Principles

1. **No box backgrounds** — remove the dark `#1e1e1e` Active Box card. Phases stand on their own.
2. **ThoughtStream lives in the divider** — the collapsed state IS the line between user question and AI answer.
3. **User question as section header** — no bubble, no background. The question is a heading, not a chat message.
4. **Sources always visible** — never hidden behind collapse. They're functional (clickable), not just decorative.
5. **Adaptive to query type** — full pipeline for hybrid search, minimal for keyword-only, simple line for no-search.

## Chat Layout Structure

Each Q&A pair follows this hierarchy:

```
┌─ User Question (heading, 14.5px, font-weight 500) ─────────────┐
│                                                                   │
│  [▶ 4 Schritte · 7 Quellen ────────────────────────]  ← divider │
│                                                                   │
│  [Source] [Source★] [Source] [Source]              ← always visible│
│                                                                   │
│  Bot answer text...                                               │
└───────────────────────────────────────────────────────────────────┘
```

### No-Search Path

When `search_needed: false`, the divider is a simple 1px line (`rgba(255,255,255,0.06)`, margin 8px 0) with no text, no chevron, no interaction. The router step is not shown. There is nothing to collapse/expand — the auto-collapse logic skips entirely when there are zero pipeline steps. No sources are displayed.

## Collapsed State

A single clickable row:

```
▶  4 Schritte · 7 Quellen  ──────────────────────
```

- Chevron (10px, rotated -90°) + summary text + extending line
- Text: step count + source count, emphasized numbers
- Opacity: 0.5, hover: 0.7
- Font: 10.5px, `rgba(255,255,255,0.2)`, numbers at `rgba(255,255,255,0.3)`

## Expanded State

Clicking the collapsed row expands to show all phases:

```
▼  4 Schritte  ──────────────────────
  · Hybrid-Suche · Anatomie                    ✓
      Strategie Hybrid  Scope Aktueller Stapel  Antwort Ausführlich
  · 5 Keyword-Treffer                           ✓
      🔍 biceps AND flexion  3   🔍 oberarm AND muskel  2
  · 3 semantische Treffer                       ✓
      0.847  M. biceps brachii — zweiköpfiger...
      0.812  Flexion im Ellenbogengelenk...
      0.783  Obere Extremität — Muskeln...
  · 7 Quellen kombiniert                        ✓
      5K ──────●────────── 3S
                                               ← no closing line
[Source★] [Source★] [Source] [Source]
Bot answer text...
```

### Phase Rendering

Each phase is separated by a 1px border (`rgba(255,255,255,0.025)`). No box backgrounds.

**Phase header:**
- Tiny dot (3.5px, `rgba(100,210,180,0.35)`) + title (10.5px) + checkmark (9px, teal)
- Active phase: dot pulses blue with `box-shadow`

**Phase content** is indented 10.5px from the dot.

### No Closing Line

After the last phase (typically "Quellen kombiniert"), there is NO closing line. The source cards below serve as natural visual separation.

## Phase-Specific Content

### Router Phase (Enhanced)

**Active state:**
- Shimmer bar (80px, blue-to-purple gradient sweep, 2.5s loop)
- Three pulsing dots (3px, blue, staggered float animation)

**Done state:**
Three inline tags showing the router's decisions:

| Tag | Label | Values |
|-----|-------|--------|
| Strategie | Search type chosen | Hybrid / Keyword / Semantisch |
| Scope | Search scope | Aktueller Stapel / Alle Stapel |
| Antwort | Response length | Kurz / Mittel / Ausführlich |

Each tag: icon (10px SVG, 0.2 opacity) + label (`rgba(255,255,255,0.13)`) + value (`rgba(255,255,255,0.35)`, weight 500).

Icons (inline SVGs, not Lucide — keep bundle small):
- Strategie: crosshair/plus icon (`M8 2v12M2 8h12`)
- Scope: card/deck icon (`rect 2,3 12x10 rx1.5` + `M2 6h12`)
- Antwort: bar chart icon (`M3 13V5h3v8 M7 13V3h3v10 M11 13V7h3v6`)

**Backend change required:** The router must return a `response_length` field (short/medium/long) based on query complexity. Add to router JSON schema:

```json
"response_length": { "type": "string", "enum": ["short", "medium", "long"] }
```

Mapping to German labels: `short` → "Kurz", `medium` → "Mittel", `long` → "Ausführlich". Fallback if field missing: "Mittel".

Add to the router prompt instruction: "Estimate response length needed: 'short' for simple facts, 'medium' for explanations, 'long' for detailed comparisons or multi-part questions."

The `_emit_pipeline_step("router", "done", data)` payload gains `response_length` alongside existing `search_needed`, `retrieval_mode`, `scope`, `scope_label`.

Note: Only the local router in `ai_handler.py` needs updating. The cloud function router (`functions/src/handlers/router.ts`) is a separate concern and not part of this spec.

### SQL Search Phase

Query tags with hit counts (unchanged from current):
- Tags: `rgba(255,255,255,0.025)` background, 4px border-radius
- Search icon (8px, 0.18 opacity) + query text + hit count (mono, teal)

### Semantic Search Phase

Top 3 chunks with similarity scores (unchanged from current):
- Score: SF Mono, 9px, `rgba(10,132,255,0.45)`
- Text: 10px, `rgba(255,255,255,0.25)`, truncated with ellipsis

### Merge Phase

Compact merge bar:
- "5K" label (blue) — track with glow dot — "3S" label (teal)
- Track: 1.5px height, blue-to-teal gradient
- Dot: 5px, `#0a84ff`, subtle box-shadow

### Generating Phase

The frontend filters out `generating` steps from the `useSmartPipeline` hook entirely — they never appear in `activeEntry` or `doneStack`. The backend continues to emit `generating` active/done events (needed for internal tracking and `_generating_done_emitted` guard), but the ThoughtStream component ignores them. During live streaming, the ThoughtStream simply stays in its current state (last real step in done stack) while text streams below it.

### Merge Phase — Compact Redesign

The current `MergeContent` component (large number, "Keyword"/"Semantic" labels, full-width track) is replaced with a compact single-row bar. Remove: the large 20px total number, the uppercase labels row, and the 8px-height track. Replace with: "5K" (blue, mono 9px) — 1.5px track with glow dot — "3S" (teal, mono 9px). Total count appears only in the phase title ("7 Quellen kombiniert").

## Source Cards

### Always Visible

Source cards appear below the ThoughtStream divider, above the bot text. They are never hidden by collapse.

### Badge System

- **Star badge** (gold, 14px circle positioned top-right -3px/-3px) on cards found by BOTH keyword and semantic search — indicates high relevance. This replaces the existing `isCurrentCard` star badge in `SourceCard.tsx`. The old current-card star is removed.
- Cards found by only one search type show a subtle label in the deck line: "keyword" (blue, 8px) or "semantic" (teal, 8px)
- **Current card is NOT shown** as a source — it's context, not a search result. Remove the `isCurrentCard` prop and related rendering from `SourceCard.tsx`.

**Frontend data:** The `sources` field (e.g. `['keyword']`, `['semantic']`, or `['keyword', 'semantic']`) is already present in the merged citation data from `hybrid_retrieval.py`. The frontend `Citation` type in `SourceCard.tsx` needs to add `sources?: string[]` and use it for badge rendering. No backend change needed.

### Card Style

- 130px width (reduced from current 192px/`w-48` — intentional, titles truncate with ellipsis at smaller size), 7px border-radius
- Background: `rgba(255,255,255,0.025)`, border: `rgba(255,255,255,0.035)`
- Hover: border lightens to `rgba(255,255,255,0.08)`
- Title: 10px, weight 500; Deck: 9px, dimmed

## Adaptive Pipeline Behavior

| Query Type | Router Says | Steps Shown | Sources |
|-----------|------------|-------------|---------|
| Complex topic | `both` | Router → SQL → Semantic → Merge | Yes, with badges |
| Simple lookup | `sql` | Router → SQL | Yes |
| Semantic only | `semantic` | Router → Semantic | Yes |
| Conversational | `search_needed: false` | None (simple line) | No |

## Animations

### Phase Reveal (on expand)

```css
@keyframes phaseReveal {
  from { opacity: 0; transform: translateY(-3px); }
  to { opacity: 1; transform: translateY(0); }
}
```
- Duration: 250ms, ease-out
- Stagger: 30ms between phases (via `animation-delay` on nth-child)

### Router Thinking

- Shimmer bar: 80px, `linear-gradient(90deg, blue 0.05 → blue 0.25 → purple 0.2 → blue 0.05)`
- Background-size 200%, animated position sweep 2.5s
- Three dots: 3px circles, blue, staggered float animation (translateX 0→3px, opacity 0.4→0.8)

### Collapse/Expand

- Auto-collapse: 800ms after streaming text starts AND pipeline is done
- Auto-expand: when new pipeline starts (`isProcessing` becomes true)
- Manual toggle: click chevron row

## Timing System (unchanged)

```
MIN_PHASE_DURATION = 800ms
DONE_GRACE = 300ms
```

Queue-based: only one step shows as active at a time. Minimum visibility guaranteed. Already implemented in `useSmartPipeline` hook.

## Bug Fixes Required

### Scope Fallback Duplicate Steps

**Problem:** When `current_deck` returns <2 results, `hybrid_retrieval.py` retries with `collection` scope. This re-calls `retrieve()` which re-emits all pipeline steps, causing "Keyword-Suche" to appear twice.

**Fix (chosen approach):** In `hybrid_retrieval.py`, before the fallback `retrieve()` call, set `self.ai._fallback_in_progress = True`. Inside `_emit_pipeline_step()`, check this flag: if true, skip emission for steps already in `_current_step_labels` (they were already sent to the frontend). After the fallback completes, emit a single `scope_update` event: `_emit_pipeline_step("router", "done", {... scope: "collection", scope_label: "Alle Stapel"})` which the frontend handles as an update to the existing router step (matched by step name). Reset the flag after fallback.

## Files to Modify

### Frontend
- `shared/components/ThoughtStream.tsx` — Complete rewrite following this spec. Keep `useSmartPipeline` hook logic, rewrite all rendering.
- `shared/components/SourceCard.tsx` — Add `sources?: string[]` to Citation type, add star badge for dual-source cards, remove `isCurrentCard` star.
- `frontend/src/App.jsx` — Adjust chat layout: user message renders as heading (no bubble), ThoughtStream renders as divider between question and answer.
- `frontend/src/components/ChatMessage.jsx` — Remove user bubble styling for user messages. User messages become section headings (14.5px, weight 500, `rgba(255,255,255,0.85)`, no background, no border-radius). This applies to ALL user messages in the chat, including conversational ones where `search_needed: false`.

### Backend
- `ai_handler.py` — Add `response_length` to router JSON schema and prompt instruction. Include in `_emit_pipeline_step("router", "done", data)` payload. Add `_fallback_in_progress` flag check in `_emit_pipeline_step()`.
- `hybrid_retrieval.py` — Fix scope fallback: set `_fallback_in_progress` flag, skip re-emission of already-sent steps, emit scope update after fallback.

### No Backend Change Needed
- Source card `sources` field already present in citation data from `hybrid_retrieval.py` merge. Frontend just needs to read it.

## Language

All user-facing labels are in German (consistent with existing codebase). This spec uses English for technical descriptions and German for UI strings. All `STEP_NAMES`, `ACTIVE_TITLES`, `MODE_LABELS` and other label constants remain German.

## Legacy Compatibility

Old messages with the previous `steps` format (array of objects with `phase` field) fall back to the existing `LegacyThoughtStream` renderer — a flat done-list. No changes needed there.
