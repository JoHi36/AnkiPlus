# Reasoning Display Redesign

**Date:** 2026-03-29
**Status:** Approved
**Problem:** The current RAG reasoning display shows every pipeline step with expanded details (query tags, merge bars, semantic chunks, SQL strings). As the pipeline grows more complex, this creates visual chaos — constant expanding/collapsing, layout shifts, and "busy noise" that paradoxically makes the wait feel longer than a simple skeleton loader.

## Design Principles

1. **One position, three states** — the top-right badge area transitions through loading → done → idle without layout shifts
2. **Transparency through presence, not detail** — dots show "something is happening" without overwhelming with specifics
3. **Sources only on demand** — no mini-views, no carousels, no source lists. Peek directly at the source via hold gesture on inline refs
4. **Fixed height during loading** — no expanding, collapsing, or vertical growth. The message bubble stays stable.

## Three States

### State 1: Loading

**Position:** Top-right of the message bubble header (replaces "Anki" badge during loading)

**Visual:**
```
┌──────────────────────────────────────┐
│ 🎓 Tutor                    ●●●●○○  │
│                                      │
│ Kombiniere Quellen...                │
│                                      │
│ ████████████████████████             │
│ ██████████████████                   │
│ ████████████████                     │
└──────────────────────────────────────┘
```

**Behavior:**
- Row of small dots (one per pipeline step), each 5px diameter
- Done steps: solid green (50% opacity)
- Active step: blue, pulsing animation (1.5s ease-in-out infinite)
- Pending steps: dim (hover-tint color)
- Step label below header: single line, crossfades between steps (e.g. "Durchsuche Karten..." → "Kombiniere Quellen...")
- No "4/6 Schritte" counter text
- Skeleton shimmer lines below for the not-yet-loaded answer text
- Entire loading area has fixed height — no layout shifts

**Step label mapping** (reuse existing `activeTitle` strings from step registry):
- `router`/`orchestrating` → "Suchstrategie wird festgelegt..."
- `sql_search` → "Durchsuche Karten..."
- `semantic_search` → "Semantische Suche..."
- `kg_search` → "Durchsuche Knowledge Graph..."
- `merge` → "Kombiniere Quellen..."
- `web_search` → "Recherchiere im Web..."
- `sources_ready` → "Quellen werden geladen..."
- `generating` → hidden (triggers collapse to skeleton)

### State 2: Done

**Position:** Same top-right position

**Visual:**
```
┌──────────────────────────────────────┐
│ 🎓 Tutor                 ●●●○ 4 Quellen │
│                                          │
│ Bananen wachsen zunächst nach unten,     │
│ biegen sich dann durch negativen         │
│ Gravitropismus nach oben.[1][2]          │
│ Dieses Wachstumsmuster wird durch        │
│ Auxin-Verteilung gesteuert.[3]           │
└──────────────────────────────────────────┘
```

**Behavior:**
- Dots morph into source count: small colored dots (blue = Anki, green = Web) + "N Quellen" text
- Count shows only **actually cited** sources (not all retrieved sources)
- Loaded after generation completes (requires post-generation count)
- Purely informational — not clickable
- If no sources were cited: show "Anki" badge again (original state)

**Inline citation refs:**
- Appear in the response text as `[1]`, `[2]`, etc.
- Color-coded: blue background for Anki cards, green background for web sources
- Small (16px × 16px), superscript position, rounded (4px border-radius)

### State 3: Peek (Hold Gesture on Inline Ref)

**Anki card sources:**
- User holds (press and hold / long press) on an inline ref like `[1]`
- The referenced Anki card appears on the Canvas (main left area) immediately
- Release → Canvas returns to previous state
- This is a peek gesture — no navigation, no modal, no panel

**Web sources:**
- User holds on a green inline ref like `[3]`
- Shows: title + domain + link preview on the Canvas
- Click (instead of hold) opens the URL in the external browser
- No embedded web view

## What Gets Removed

The following components/features are **eliminated** from the reasoning display:

1. **FullReasoningDisplay** — the entire expandable step list with per-step details
2. **Step-specific renderers** — RouterDetails, SqlTags, SemanticChunks, KgTerms, MergeBar, WebSearchSources, RouterThinking
3. **SourcesCarousel** — the horizontal scrollable source cards at the bottom
4. **Collapse/expand toggle** — no collapsible sections anymore
5. **Step border separators** — no divider lines between steps
6. **Number highlighting in step titles** — no monospace-highlighted numbers
7. **Per-step content areas** — the `renderContent` blocks from the step registry

**Kept:**
- `ReasoningStore` + `ReasoningProvider` — still needed to track step lifecycle
- `stepRegistry` — still needed for step label strings (`activeTitle`)
- `useReasoningStream` hook — still needed for pacing (but simplified)
- `CompactReasoningDisplay` — can be adapted as the new default (it's already single-line)
- Inline citation rendering (already exists in message rendering)

## Component Changes

### New: `ReasoningDots` component
Replaces `FullReasoningDisplay`. Renders the dot row + step label. Props:
- `displaySteps: DisplayStep[]`
- `phase: StreamPhase`
- `agentColor?: string`

### Modified: `AgenticCell` / message header
- During loading: render `ReasoningDots` in the top-right badge position
- After loading: render source count badge with colored dots

### Modified: Message text rendering (inline refs)
- Inline refs get hold gesture handler
- Hold triggers peek on Canvas
- Color-coded by source type (blue/green)

### New: Source count badge
Small component in the header showing `●●●○ N Quellen` after generation. Counts only cited sources.

## Post-Generation Source Counting

After the LLM finishes generating, the system needs to:
1. Parse the response for inline citation markers (`[1]`, `[2]`, etc.)
2. Map each citation number to its source type (Anki card vs. web)
3. Count unique cited sources
4. Emit this count to the frontend (new reasoning event or separate message)

This replaces the current `sources_ready` step which counts all retrieved sources regardless of citation.

## Peek Gesture Implementation Notes

The hold-to-peek gesture needs:
- `pointerdown` / `pointerup` event handlers on inline ref elements
- A threshold (e.g., 300ms hold) before triggering peek
- Canvas communication to show/hide the card preview
- Touch support for potential mobile/tablet use
- Existing `useHoldToReset` hook can be referenced for the hold pattern

## Animation Budget

Only three animations in the entire system:
1. **Dot pulse** — active step dot pulses (existing `ts-dotPulse` keyframe)
2. **Step label crossfade** — text fades between steps (existing `ts-phaseReveal` or simple CSS transition)
3. **Skeleton shimmer** — loading text placeholder (existing `ts-shimmerWave` keyframe)

No expanding, collapsing, sliding, or layout-shifting animations.
