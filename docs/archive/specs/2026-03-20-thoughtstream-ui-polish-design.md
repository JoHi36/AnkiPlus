# ThoughtStream UI Polish & Plusi Integration

## Overview

Polish the ThoughtStream component for visual consistency, better hierarchy, and Plusi integration. The ThoughtStream should always feel like a coherent thought process — whether a full RAG pipeline runs, no search is needed, or Plusi is addressed directly.

## 1. Layout-Hierarchie

### Problem

The current ThoughtStream has redundant visual separators:
- `borderTop` on the container (line between user question and "X Schritte")
- `borderTop` on every `PhaseRow` (line above each step, including the first)
- The "X Schritte" toggle row is indented (via chevron), but the steps themselves are not — inverted hierarchy

### Solution

**Remove**: Container `borderTop` (`1px solid rgba(255,255,255,0.06)` on the outer `<div>`).

**Add**: `marginTop: 12px` on the ThoughtStream container (replaces the 4px + borderTop, gives breathing room from the question).

**"X Schritte" row**: Not indented. Chevron + text + Extending Line — unchanged visually, but no extra border above or below.

**PhaseRow separator**: Only render `borderTop` on PhaseRows where `index > 0` (no line above the first step). Currently every PhaseRow has `borderTop: '1px solid rgba(255,255,255,0.04)'` — add a prop `isFirst` to suppress it.

**Step indentation**: Each PhaseRow gets `marginLeft: 16px` so steps are visually nested under the "X Schritte" header. The phase-specific content (tags, chunks, merge bar) stays indented further at `marginLeft: 14px` relative to the PhaseRow (unchanged).

**Resulting hierarchy:**
```
wie alt ist napoleon

▼ 4 Schritte ─────────────────────
   ● Hybrid-Suche                  ✓
      Strategie Hybrid  Scope Alle...
   ─────────────────────────────────
   ● 255 Keyword-Treffer           ✓
      🔍 Napoleon AND Alter... 0
   ─────────────────────────────────
   ● 5 semantische Treffer         ✓
      0.579  Fertilitätsziffer...
   ─────────────────────────────────
   ● 5 Quellen kombiniert          ✓
      2K ────●──── 3S
```

### Files to modify

- `shared/components/ThoughtStream.tsx`: Remove container `borderTop` and `paddingTop`. Change `marginBottom: 8` to `marginTop: 12`. Add `isFirst` prop to `PhaseRow`. Add `marginLeft: 16px` wrapper around step rows.

---

## 2. "Keine Suche"-Zustand aufwerten

### Problem

When the router returns `search_needed: false`, the ThoughtStream renders a bare 1px line. This feels empty and doesn't match the full pipeline experience.

### Solution

Show a single Router step with the standard shimmer loading animation (800ms minimum), then display three info tags on done:

**Active state**: Same as normal router — shimmer bar + pulsing dots + "Analysiere Anfrage..."

**Done state**: Three tags:
| Tag | Label | Value |
|-----|-------|-------|
| Strategie | Search type | `Direkte Antwort` |
| Kontext | Context needed | `Nicht benötigt` |
| Antwort | Response length | `Kurz` / `Mittel` / `Ausführlich` |

The tags use the same `RouterDetails` component with the same icon SVGs (crosshair, card, bar chart).

**Collapsed state**: `▶ 1 Schritt` + Extending Line (standard behavior, already works).

**Auto-collapse**: Same 800ms timer after text arrives (already implemented).

### Backend change

The v5 spec specified adding `response_length` to the router JSON schema, but this has not been implemented yet in the router prompt (`ai/rag.py`). This must be added as part of this work. The `retrieval.py` fallback already passes `response_length` through with a `"medium"` default. For `search_needed: false`, the backend must still emit a proper `router` pipeline step:

```python
_emit_pipeline_step("router", "active", {})
# ... router processes ...
_emit_pipeline_step("router", "done", {
    "search_needed": False,
    "retrieval_mode": "none",
    "response_length": "medium",  # from router decision
    "scope": "none",
    "scope_label": ""
})
```

### Frontend change

Remove the early-return shortcut in ThoughtStream that renders a bare 1px line for no-search queries (lines 782-787 in current code). Instead, let the normal pipeline flow handle it — the single router step will render through the standard `useSmartPipeline` → `PhaseRow` path.

Update `RouterDetails` to handle `retrieval_mode: "none"` or `search_needed: false`:
- Show "Direkte Antwort" instead of mode label
- Show "Nicht benötigt" for scope
- Show response_length mapping as before

### Files to modify

- `shared/components/ThoughtStream.tsx`: Remove `isNoSearch` early return. Update `RouterDetails` for no-search case.
- `ai/handler.py`: Ensure `_emit_pipeline_step("router", ...)` is called even when `search_needed: false`, with the full data payload.

---

## 3. `@Plusi` Direct Mode

### Problem

When the user types `@Plusi`, the message should go directly to the Plusi agent without calling the router or main model. But the ThoughtStream should still show a consistent loading experience.

### Solution

**Frontend detection** (in `useChat.js`):
- Match with `/^@plusi\b/i` (prefix match, case-insensitive, word boundary)
- If yes: immediately emit synthetic pipeline events to the ThoughtStream, then send the message to the backend with a flag `plusi_direct: true`

**Synthetic pipeline events**: The frontend generates the same events that the router would produce for a no-search query, using the existing `updatePipelineSteps` setter:

```javascript
// Immediately on send:
updatePipelineSteps(prev => [...prev, { step: 'router', status: 'active', data: {}, timestamp: Date.now() }]);

// After 600-800ms (simulated thinking):
updatePipelineSteps(prev => {
  const updated = prev.map(s => s.step === 'router' ? {
    ...s, status: 'done', data: {
      search_needed: false,
      retrieval_mode: 'none',
      response_length: 'short',
      scope: 'none',
      scope_label: ''
    }
  } : s);
  return updated;
});
```

This is visually identical to the "Keine Suche"-Zustand from section 2.

**Backend routing** (in `ui/widget.py`):
- When `plusi_direct: true` flag is present in the message payload, skip router call and main model entirely
- Strip `@Plusi` prefix from message text
- Call `run_plusi(situation=stripped_text, deck_id=current_deck_id)` from `plusi/agent.py` directly
- Stream the Plusi response back using the existing tool marker system: emit `[[TOOL:spawn_plusi:widget:{...}]]` into the streaming callback, same as when the agent loop calls spawn_plusi

**ThoughtStream behavior**: Identical to any no-search query. The user cannot tell whether the router ran or not.

### Files to modify

- `frontend/src/hooks/useChat.js`: Add `@Plusi` detection via `/^@plusi\b/i`, synthetic pipeline emission using `updatePipelineSteps()`, `plusi_direct` flag on message payload.
- `ui/widget.py`: Handle `plusi_direct` flag, skip router + main model, call `run_plusi()` directly, stream result via tool marker system.

---

## 4. Keine Animation bei gespeicherten Nachrichten

### Problem

When opening a conversation with saved messages, each ThoughtStream replays its animations (phase reveal, shimmer, dot pulse). This is distracting and unnecessary — animations should only play during live generation.

### Solution

Add a `isLive` prop (or derive it from existing props) to ThoughtStream:

- **Live** (`isStreaming=true` or pipeline steps are arriving): Full animations (phase reveal, dot pulse, shimmer, auto-collapse timer)
- **Saved** (rendered from `pipeline_data` on a stored message): No animations. Render in collapsed state immediately. On expand, show steps without `phaseReveal` animation.

### Implementation

`PhaseRow` gets a `animate` prop (default `true`). When `false`:
- Remove `animation: 'ts-phaseReveal ...'` from the phase container style
- Remove `animation: 'ts-pulseIn ...'` from SQL tags
- Remove `animation: 'ts-fadeBlurIn ...'` from semantic chunks
- Dots render as static (no `ts-dotPulse`)

ThoughtStream determines `animate` from: `isStreaming || isProcessing`. Saved messages have both as `false`.

### Files to modify

- `shared/components/ThoughtStream.tsx`: Add `animate` prop to `PhaseRow`, `SqlTags`, `SemanticChunks`. Derive from streaming/processing state.

---

## 5. Dot-Animation Ruckeln fixen

### Problem

When a new PhaseRow appears, existing dots (the blue pulsing indicator on active steps) briefly glitch/stutter. This breaks the smooth feel.

### Cause

New PhaseRow insertion causes a React re-render of the parent container. CSS animations on sibling elements restart because their containing elements are re-rendered with new keys or changed DOM structure.

### Solution

Use `will-change: transform, opacity` on dot elements to promote them to their own compositing layer. This isolates their animation from layout shifts caused by sibling insertions.

Additionally, ensure PhaseRow uses stable `key` props — currently using `entry.step` for done items and `active-${step}` for active, which is correct. The issue is likely the `doneStack` reversal creating new array references. Memoize `chronologicalDone` with `useMemo`.

```tsx
const chronologicalDone = useMemo(() => [...doneStack].reverse(), [doneStack]);
```

Add to all animated dot styles:
```css
will-change: transform, opacity;
contain: layout style;
```

### Files to modify

- `shared/components/ThoughtStream.tsx`: Add `will-change` and `contain` to dot styles. Memoize `chronologicalDone`.

---

## 6. Source Cards: Timing & Collapse

### Problems

Two related issues with source cards:

1. **Premature display**: Source cards appear as soon as citation data arrives from the backend, which can be before the pipeline visualization finishes (due to 800ms minimum phase duration). This breaks the step-by-step illusion.
2. **Visual clutter**: Source cards are always visible even when ThoughtStream is collapsed, creating "mentaler Müll".

### Solution

Move SourcesCarousel **inside** the ThoughtStream component. This solves both problems at once:

- **During live streaming**: SourcesCarousel only appears inside the expanded view, and only after `isProcessing` is `false` (all pipeline steps done). The backend can send citation data whenever it wants — the frontend stores it but doesn't render until the animation is complete.
- **When collapsed**: Sources are hidden. The summary text already shows the count: `▶ 4 Schritte · 5 Quellen`.
- **When expanded**: Sources appear below the last step.
- **Saved messages**: Show sources inside expanded view (no timing gate needed, but still inside collapse).

This revises the v5 spec which said "Sources always visible." The user has changed this preference based on real-world usage.

### Implementation

Move `SourcesCarousel` rendering from App.jsx/ChatMessage.jsx into the ThoughtStream component's expanded section. ThoughtStream already receives `citations`, `citationIndices`, `bridge`, and `onPreviewCard` as props — it just doesn't render the carousel currently.

Add SourcesCarousel after the last PhaseRow, inside the `(!isCollapsed || showLoadingBox)` conditional block. Gate on `!isProcessing` for live streaming (so sources don't appear before steps finish).

### Files to modify

- `shared/components/ThoughtStream.tsx`: Import and render `SourcesCarousel` inside expanded view, after the last step. Gate on `!isProcessing` during live streaming.
- `frontend/src/App.jsx`: Remove standalone SourcesCarousel rendering from the streaming chat section.
- `frontend/src/components/ChatMessage.jsx`: Remove standalone SourcesCarousel rendering from saved messages.

---

## Implementation Order

Sections 1, 4, and 5 are independent CSS/animation fixes — can be done in parallel or any order. Section 2 requires a backend change (router `response_length`). Section 6 depends on sections being rendered correctly. Section 3 is the most complex (frontend + backend + new flow) and should come last.

Recommended order: **1 → 4 → 5 → 2 → 6 → 3**

---

## Summary of Visual States

| Scenario | Router Called | ThoughtStream Shows | Source Cards |
|----------|--------------|--------------------|-|
| Full RAG (hybrid) | Yes | Router → SQL → Semantic → Merge (4 steps) | Inside collapse |
| Partial RAG (keyword only) | Yes | Router → SQL (2 steps) | Inside collapse |
| Partial RAG (semantic only) | Yes | Router → Semantic (2 steps) | Inside collapse |
| No search needed | Yes | Router with tags: Direkte Antwort / Nicht benötigt / Länge (1 step) | None |
| `@Plusi` direct | No (synthetic) | Same as "No search needed" — visually identical (1 step) | None |
| Plusi via spawn_plusi tool | Yes (full pipeline possible) | Normal pipeline + Plusi appears in output | Inside collapse |

## Files Modified (Complete List)

### Frontend
- `shared/components/ThoughtStream.tsx` — Layout hierarchy, no-search state, saved message animations, dot ruckeln, source cards inside collapse
- `frontend/src/App.jsx` — Remove standalone SourcesCarousel in streaming, source card timing gate
- `frontend/src/components/ChatMessage.jsx` — Remove standalone SourcesCarousel in saved messages
- `frontend/src/hooks/useChat.js` — `@Plusi` detection, synthetic pipeline events, `plusi_direct` flag

### Backend
- `ai/handler.py` — Ensure router emits pipeline steps for `search_needed: false`
- `ui/widget.py` — Handle `plusi_direct` flag, skip router, route to Plusi agent

### No changes needed
- `shared/components/SourceCard.tsx` — Unchanged
- `shared/components/SourcesCarousel.tsx` — Unchanged (just moved into ThoughtStream)
- `plusi/agent.py` — Unchanged (Plusi agent works as before)
