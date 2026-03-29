# Reasoning Display Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the noisy, expanding/collapsing RAG pipeline display with a calm dot-row progress indicator during loading, and source-count badge + peek-on-hold inline refs after generation.

**Architecture:** The current `FullReasoningDisplay` (step list with per-step detail renderers) is replaced by a new `ReasoningDots` component that renders in the `AgenticCell` header's top-right slot. After generation, dots morph to a "N Quellen" badge. Inline `CitationBadge` gets a hold-to-peek gesture that shows the card on the Canvas. No source carousels, no collapsible step lists, no mini-views.

**Tech Stack:** React 18, TypeScript, CSS custom properties (design system tokens), pointer events API for hold gesture.

**Spec:** `docs/superpowers/specs/2026-03-29-reasoning-display-redesign.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `frontend/src/reasoning/ReasoningDots.tsx` | Dot-row progress indicator + step label (loading state) |
| Create | `frontend/src/reasoning/SourceCountBadge.tsx` | "●●●○ 4 Quellen" badge (done state) |
| Create | `frontend/src/hooks/useHoldToPeek.ts` | Hold gesture hook (pointerdown/up with threshold) |
| Create | `frontend/src/reasoning/__tests__/ReasoningDots.test.tsx` | Tests for dot rendering + step label |
| Create | `frontend/src/hooks/__tests__/useHoldToPeek.test.ts` | Tests for hold gesture timing |
| Modify | `frontend/src/components/ChatMessage.jsx:1862-1880` | Wire ReasoningDots into AgenticCell headerMeta |
| Modify | `frontend/src/components/AgenticCell.jsx:62-79` | Support dynamic headerMeta switching (dots → badge) |
| Modify | `frontend/src/components/CitationBadge.jsx` | Add hold-to-peek gesture, color-code by type |
| Modify | `frontend/src/reasoning/ReasoningDisplay.tsx` | New mode `'dots'` that renders ReasoningDots |
| Remove usage | `frontend/src/reasoning/FullReasoningDisplay.tsx` | No longer imported from ChatMessage (keep file for now) |

---

### Task 1: Create `ReasoningDots` Component

**Files:**
- Create: `frontend/src/reasoning/__tests__/ReasoningDots.test.tsx`
- Create: `frontend/src/reasoning/ReasoningDots.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// frontend/src/reasoning/__tests__/ReasoningDots.test.tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import ReasoningDots from '../ReasoningDots';
import type { DisplayStep } from '../types';

const makeStep = (step: string, status: 'active' | 'done' | 'error'): DisplayStep => ({
  step,
  status,
  data: {},
  timestamp: Date.now(),
  visibleSince: Date.now(),
});

describe('ReasoningDots', () => {
  it('renders one dot per step', () => {
    const steps: DisplayStep[] = [
      makeStep('router', 'done'),
      makeStep('sql_search', 'done'),
      makeStep('semantic_search', 'active'),
      makeStep('merge', 'active'),
    ];
    const { container } = render(
      <ReasoningDots displaySteps={steps} phase="accumulating" />
    );
    const dots = container.querySelectorAll('[data-testid="reasoning-dot"]');
    expect(dots).toHaveLength(4);
  });

  it('shows active step label from registry', () => {
    const steps: DisplayStep[] = [
      makeStep('router', 'done'),
      makeStep('sql_search', 'active'),
    ];
    render(<ReasoningDots displaySteps={steps} phase="accumulating" />);
    expect(screen.getByText('Durchsuche Karten...')).toBeTruthy();
  });

  it('returns null when no steps', () => {
    const { container } = render(
      <ReasoningDots displaySteps={[]} phase="accumulating" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('hides generating step from dot count', () => {
    const steps: DisplayStep[] = [
      makeStep('router', 'done'),
      makeStep('sql_search', 'done'),
      makeStep('generating', 'active'),
    ];
    const { container } = render(
      <ReasoningDots displaySteps={steps} phase="generating" />
    );
    // 'generating' is hidden — only 2 dots
    const dots = container.querySelectorAll('[data-testid="reasoning-dot"]');
    expect(dots).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/reasoning/__tests__/ReasoningDots.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ReasoningDots**

```tsx
// frontend/src/reasoning/ReasoningDots.tsx
import React, { useMemo } from 'react';
import type { DisplayStep, StreamPhase } from './types';
import { getStepRenderer, getFallbackRenderer } from './stepRegistry';

interface ReasoningDotsProps {
  displaySteps: DisplayStep[];
  phase: StreamPhase;
  agentColor?: string;
}

/* ── Static style constants ── */

const CONTAINER_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  alignItems: 'flex-end',
};

const DOTS_ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
};

const DOT_BASE: React.CSSProperties = {
  width: 5,
  height: 5,
  borderRadius: '50%',
  flexShrink: 0,
  transition: 'background 0.3s ease, opacity 0.3s ease',
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--ds-text-secondary)',
  textAlign: 'right',
  animation: 'ts-phaseReveal 0.4s ease-out both',
  whiteSpace: 'nowrap',
};

export default function ReasoningDots({ displaySteps, phase, agentColor }: ReasoningDotsProps) {
  // Filter out hidden steps (e.g. 'generating')
  const visibleSteps = useMemo(
    () => displaySteps.filter(ds => {
      const r = getStepRenderer(ds.step);
      return !r?.hidden;
    }),
    [displaySteps]
  );

  if (visibleSteps.length === 0) return null;

  // Find the last active step for the label
  const activeStep = [...visibleSteps].reverse().find(s => s.status === 'active');
  const lastStep = activeStep || visibleSteps[visibleSteps.length - 1];
  const renderer = getStepRenderer(lastStep.step) || getFallbackRenderer(lastStep.step);
  const isActive = lastStep.status === 'active';
  const label = isActive
    ? (typeof renderer.activeTitle === 'function' ? renderer.activeTitle(lastStep.data) : renderer.activeTitle)
    : renderer.doneLabel(lastStep.data, lastStep.status);

  return (
    <div style={CONTAINER_STYLE}>
      <div style={DOTS_ROW_STYLE}>
        {visibleSteps.map((ds) => {
          const isDone = ds.status === 'done';
          const isCurrent = ds.status === 'active';
          const dotStyle: React.CSSProperties = {
            ...DOT_BASE,
            background: isDone
              ? (agentColor ? `color-mix(in srgb, ${agentColor} 50%, transparent)` : 'var(--ds-green-50)')
              : isCurrent
                ? (agentColor || 'var(--ds-accent)')
                : 'var(--ds-hover-tint)',
            animation: isCurrent ? 'ts-dotPulse 1.5s ease-in-out infinite' : undefined,
          };
          return <div key={ds.step} data-testid="reasoning-dot" style={dotStyle} />;
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/reasoning/__tests__/ReasoningDots.test.tsx`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/reasoning/ReasoningDots.tsx frontend/src/reasoning/__tests__/ReasoningDots.test.tsx
git commit -m "feat(reasoning): add ReasoningDots component — dot-row progress indicator"
```

---

### Task 2: Create `SourceCountBadge` Component

**Files:**
- Create: `frontend/src/reasoning/SourceCountBadge.tsx`

- [ ] **Step 1: Implement SourceCountBadge**

```tsx
// frontend/src/reasoning/SourceCountBadge.tsx
import React from 'react';

interface SourceCountBadgeProps {
  /** Total number of cited sources */
  count: number;
  /** Number of Anki card sources (rest are web) */
  cardCount: number;
}

const BADGE_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '2px 0',
};

const DOTS_STYLE: React.CSSProperties = {
  display: 'flex',
  gap: 2,
  alignItems: 'center',
};

const DOT_STYLE: React.CSSProperties = {
  width: 4,
  height: 4,
  borderRadius: '50%',
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: 'var(--ds-text-tertiary)',
  letterSpacing: '0.2px',
};

export default function SourceCountBadge({ count, cardCount }: SourceCountBadgeProps) {
  if (count === 0) return null;

  const webCount = count - cardCount;
  const dots: Array<'card' | 'web'> = [
    ...Array(Math.min(cardCount, 6)).fill('card' as const),
    ...Array(Math.min(webCount, 4)).fill('web' as const),
  ];

  return (
    <div style={BADGE_STYLE}>
      <div style={DOTS_STYLE}>
        {dots.map((type, i) => (
          <div
            key={i}
            style={{
              ...DOT_STYLE,
              background: type === 'card'
                ? 'color-mix(in srgb, var(--ds-accent) 50%, transparent)'
                : 'color-mix(in srgb, var(--ds-green) 50%, transparent)',
            }}
          />
        ))}
      </div>
      <span style={LABEL_STYLE}>
        {count} Quelle{count !== 1 ? 'n' : ''}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/reasoning/SourceCountBadge.tsx
git commit -m "feat(reasoning): add SourceCountBadge — cited source count display"
```

---

### Task 3: Wire ReasoningDots into AgenticCell via ChatMessage

This is the core integration — replacing `ReasoningDisplay mode="full"` inside AgenticCell's children with dots in the `headerMeta` slot.

**Files:**
- Modify: `frontend/src/components/ChatMessage.jsx:1862-1880`
- Modify: `frontend/src/reasoning/ReasoningDisplay.tsx`

- [ ] **Step 1: Add `'dots'` mode to ReasoningDisplay**

In `frontend/src/reasoning/ReasoningDisplay.tsx`, add a new mode that returns `ReasoningDots` for use as `headerMeta`:

```tsx
// frontend/src/reasoning/ReasoningDisplay.tsx
import React from 'react';
import { useReasoningStream } from './useReasoningStream';
import FullReasoningDisplay from './FullReasoningDisplay';
import CompactReasoningDisplay from './CompactReasoningDisplay';
import ReasoningDots from './ReasoningDots';
import type { ReasoningStep } from './types';

export interface ReasoningDisplayProps {
  streamId?: string;
  steps?: ReasoningStep[];
  mode?: 'full' | 'compact' | 'dots';
  hasOutput?: boolean;
  agentColor?: string;
  label?: string;
  citations?: Record<string, any>;
  bridge?: any;
  onPreviewCard?: (citation: any) => void;
}

export default function ReasoningDisplay({
  streamId,
  steps: staticSteps,
  mode = 'full',
  hasOutput = false,
  agentColor: colorOverride,
  label,
  citations: citationsProp,
  bridge,
  onPreviewCard,
}: ReasoningDisplayProps) {
  const {
    displaySteps,
    phase,
    isCollapsed,
    toggleCollapse,
    agentName,
    agentColor: storeColor,
    citations: storeCitations,
    hasContent,
  } = useReasoningStream({ streamId, steps: staticSteps, mode, hasOutput });

  const agentColor = colorOverride || storeColor;
  const citations = (citationsProp && Object.keys(citationsProp).length > 0) ? citationsProp : storeCitations;

  if (!hasContent) return null;

  if (mode === 'dots') {
    return (
      <ReasoningDots
        displaySteps={displaySteps}
        phase={phase}
        agentColor={agentColor}
      />
    );
  }

  if (mode === 'compact') {
    return (
      <CompactReasoningDisplay
        displaySteps={displaySteps}
        phase={phase}
        agentColor={agentColor}
      />
    );
  }

  return (
    <FullReasoningDisplay
      displaySteps={displaySteps}
      phase={phase}
      isCollapsed={isCollapsed}
      toggleCollapse={toggleCollapse}
      agentColor={agentColor}
      label={label}
      citations={citations}
      hasOutput={hasOutput}
      isStreaming={Boolean(streamId && phase !== 'complete')}
      bridge={bridge}
      onPreviewCard={onPreviewCard}
    />
  );
}
```

- [ ] **Step 2: Move reasoning from AgenticCell children to headerMeta in ChatMessage**

In `frontend/src/components/ChatMessage.jsx`, change the AgenticCell rendering (around line 1862). The reasoning display moves from inside `<AgenticCell>` children to the `headerMeta` prop. After generation, show `SourceCountBadge` instead.

Find this block (approximately lines 1862-1880):
```jsx
{(message_prop.agentCells || []).map((cell, i) => (
  <AgenticCell
    key={`${cell.agent}-${i}`}
    agentName={cell.agent}
    isLoading={cell.status === 'loading'}
    loadingHint={cell.loadingHint || ''}
  >
    {/* Agent reasoning steps — streamId for live pacing, steps for saved */}
    {((isStreaming && requestId) || cell.pipelineSteps?.length > 0 || agentSteps.length > 0) && (
      <ReasoningDisplay
        streamId={isStreaming && requestId ? `${cell.agent}-${requestId}` : undefined}
        steps={isStreaming && requestId ? undefined : (cell.pipelineSteps?.length > 0 ? cell.pipelineSteps : agentSteps)}
        mode="full"
        hasOutput={Boolean(cell.text)}
        citations={cell.citations || citations}
        bridge={bridge}
        onPreviewCard={onPreviewCard}
      />
    )}
```

Replace with:
```jsx
{(message_prop.agentCells || []).map((cell, i) => {
  // Determine headerMeta: dots while streaming, source count when done
  const hasReasoningData = (isStreaming && requestId) || cell.pipelineSteps?.length > 0 || agentSteps.length > 0;
  const cellIsStreaming = isStreaming && cell.status !== 'done' && cell.status !== 'error';
  const cellCitations = cell.citations || citations;
  const citedCount = cellCitations ? Object.keys(cellCitations).length : 0;

  // Count card vs web sources
  const cardSourceCount = cellCitations
    ? Object.values(cellCitations).filter((c) => c && !c.url && !c.web_url).length
    : 0;

  let headerMeta = null;
  if (cellIsStreaming && hasReasoningData) {
    headerMeta = (
      <ReasoningDisplay
        streamId={requestId ? `${cell.agent}-${requestId}` : undefined}
        steps={undefined}
        mode="dots"
        agentColor={'var(--ds-text-muted)'}
      />
    );
  } else if (!cellIsStreaming && citedCount > 0) {
    headerMeta = (
      <SourceCountBadge count={citedCount} cardCount={cardSourceCount} />
    );
  }

  return (
    <AgenticCell
      key={`${cell.agent}-${i}`}
      agentName={cell.agent}
      isLoading={cell.status === 'loading'}
      loadingHint={cell.loadingHint || ''}
      headerMeta={headerMeta}
    >
```

Note: The `ReasoningDisplay` that was previously inside AgenticCell's children is now removed — dots render in `headerMeta` instead.

- [ ] **Step 3: Add imports at top of ChatMessage.jsx**

Add the `SourceCountBadge` import near the other reasoning imports (around line 16):

```jsx
import SourceCountBadge from '../reasoning/SourceCountBadge';
```

- [ ] **Step 4: Also handle saved/non-streaming messages**

For messages loaded from history (not streaming), the reasoning data comes from `cell.pipelineSteps`. Update the `headerMeta` logic to also show `SourceCountBadge` for saved messages with citations:

The logic from Step 2 already handles this: when `cellIsStreaming` is false and `citedCount > 0`, it shows the badge. For saved messages, `isStreaming` is false, so `cellIsStreaming` is false, and the badge renders if citations exist.

- [ ] **Step 5: Test manually in browser dev mode**

Run: `cd frontend && npm run dev`
Open: `http://localhost:3000`
Verify: Send a message → dots appear top-right of Tutor cell → after response, source count badge appears.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/reasoning/ReasoningDisplay.tsx frontend/src/components/ChatMessage.jsx
git commit -m "feat(reasoning): wire dots into AgenticCell headerMeta, replace FullReasoningDisplay"
```

---

### Task 4: Add Step Label Below Header During Loading

The dots show progress in the top-right, but we also need the step label text ("Kombiniere Quellen...") below the header. This replaces the old loading hint.

**Files:**
- Modify: `frontend/src/components/AgenticCell.jsx:121-132`

- [ ] **Step 1: Pass step label as loadingHint from ChatMessage**

In `frontend/src/components/ChatMessage.jsx`, extract the current step label from the reasoning store and pass it as `loadingHint` to `AgenticCell`.

We need a small helper. Add this inside the `agentCells.map()` block (before the `return`), after the `headerMeta` logic from Task 3:

```jsx
  // Extract current step label for the loading hint
  // (the ReasoningDots component reads from the store, but we also need the label text)
  let stepLabel = cell.loadingHint || '';
  if (cellIsStreaming && !stepLabel) {
    // Default — will be overridden by ReasoningStepLabel if wired
    stepLabel = '';
  }
```

AgenticCell already renders `loadingHint` when `isLoading` is true (line 125). The existing shimmer lines also render. This is sufficient for the loading state — the step label will come from the `loadingHint` prop that's already passed through.

However, the step label needs to update as steps progress. The cleanest approach: add a small `ReasoningStepLabel` export from `ReasoningDots.tsx` that can be used as `loadingHint`.

- [ ] **Step 2: Add ReasoningStepLabel component to ReasoningDots.tsx**

Append to `frontend/src/reasoning/ReasoningDots.tsx`:

```tsx
/** Standalone step label — renders just the text of the current active step */
export function ReasoningStepLabel({ streamId, agentColor }: { streamId?: string; agentColor?: string }) {
  // This component needs the reasoning stream data
  // Since it's used in the AgenticCell content area (not headerMeta),
  // we use the store directly
  const { useReasoningStream } = require('./useReasoningStream');
  const { displaySteps } = useReasoningStream({ streamId, steps: undefined, mode: 'dots', hasOutput: false });

  const visibleSteps = displaySteps.filter((ds: DisplayStep) => {
    const r = getStepRenderer(ds.step);
    return !r?.hidden;
  });

  if (visibleSteps.length === 0) return null;

  const activeStep = [...visibleSteps].reverse().find((s: DisplayStep) => s.status === 'active');
  if (!activeStep) return null;

  const renderer = getStepRenderer(activeStep.step) || getFallbackRenderer(activeStep.step);
  const label = typeof renderer.activeTitle === 'function'
    ? renderer.activeTitle(activeStep.data)
    : renderer.activeTitle;

  return (
    <div key={activeStep.step} style={LABEL_STYLE}>{label}</div>
  );
}
```

Wait — this creates a circular dependency issue and uses `require` in a React component. Let's use a simpler approach instead.

- [ ] **Step 2 (revised): Use AgenticCell's existing loadingHint with a wrapper component**

Instead of a separate label component, render the step label as part of the AgenticCell content when streaming. In `ChatMessage.jsx`, within the `AgenticCell` children:

```jsx
    >
      {/* Step label during streaming (replaces old ReasoningDisplay) */}
      {cellIsStreaming && hasReasoningData && (
        <ReasoningDisplay
          streamId={requestId ? `${cell.agent}-${requestId}` : undefined}
          mode="compact"
          agentColor={'var(--ds-text-muted)'}
        />
      )}
```

Actually — the CompactReasoningDisplay already shows a single-line step label with the counter. But we don't want the counter. The simplest solution: render only the label in a minimal custom element.

Create a tiny inline component in ChatMessage.jsx or — better — modify `CompactReasoningDisplay` to accept a `showCounter` prop.

- [ ] **Step 2 (final approach): Add `showCounter` prop to CompactReasoningDisplay**

In `frontend/src/reasoning/CompactReasoningDisplay.tsx`, add an optional `showCounter` prop:

Find:
```tsx
interface CompactProps {
  displaySteps: DisplayStep[];
  phase: StreamPhase;
  agentColor?: string;
}
```

Replace with:
```tsx
interface CompactProps {
  displaySteps: DisplayStep[];
  phase: StreamPhase;
  agentColor?: string;
  showCounter?: boolean;
}
```

Find:
```tsx
export default function CompactReasoningDisplay({ displaySteps, phase, agentColor }: CompactProps) {
```

Replace with:
```tsx
export default function CompactReasoningDisplay({ displaySteps, phase, agentColor, showCounter = true }: CompactProps) {
```

Find:
```tsx
      <span style={COUNTER_STYLE}>{completedCount}/{totalCount}</span>
```

Replace with:
```tsx
      {showCounter && <span style={COUNTER_STYLE}>{completedCount}/{totalCount}</span>}
```

- [ ] **Step 3: Use CompactReasoningDisplay (no counter) as step label in AgenticCell**

In `ChatMessage.jsx`, add the step label inside AgenticCell children (after the `headerMeta` is set, inside the JSX return):

```jsx
      {/* Step label during streaming */}
      {cellIsStreaming && hasReasoningData && (
        <ReasoningDisplay
          streamId={requestId ? `${cell.agent}-${requestId}` : undefined}
          mode="compact"
          hasOutput={Boolean(cell.text)}
          agentColor={'var(--ds-text-muted)'}
        />
      )}
```

And in `ReasoningDisplay.tsx`, pass `showCounter={false}` when mode is dots... Actually, we're using `'compact'` mode here, and we want the counter hidden. Let's add a `hideCounter` prop to `ReasoningDisplayProps` and thread it through:

In `ReasoningDisplay.tsx`:
- Add `hideCounter?: boolean` to `ReasoningDisplayProps`
- Pass to CompactReasoningDisplay: `<CompactReasoningDisplay ... showCounter={!hideCounter} />`

Then in ChatMessage.jsx:
```jsx
        <ReasoningDisplay
          streamId={requestId ? `${cell.agent}-${requestId}` : undefined}
          mode="compact"
          hideCounter
          hasOutput={Boolean(cell.text)}
          agentColor={'var(--ds-text-muted)'}
        />
```

- [ ] **Step 4: Test in browser**

Run: `cd frontend && npm run dev`
Verify: During streaming, Tutor cell shows dots in top-right + step label below header (no "3/6" counter), then answer text streams in.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/reasoning/CompactReasoningDisplay.tsx frontend/src/reasoning/ReasoningDisplay.tsx frontend/src/components/ChatMessage.jsx
git commit -m "feat(reasoning): step label below header during loading, no counter"
```

---

### Task 5: Color-Code CitationBadge by Source Type

Currently CitationBadge has a generic gray style. Make it blue for Anki cards, green for web sources.

**Files:**
- Modify: `frontend/src/components/CitationBadge.jsx`

- [ ] **Step 1: Add `sourceType` prop and color styles**

In `frontend/src/components/CitationBadge.jsx`, replace the entire file:

```jsx
import React, { useState } from 'react';
import SourceCard from './SourceCard';

const BADGE_BASE = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '1.25rem',
  height: '1rem',
  padding: '0 4px',
  borderRadius: 4,
  fontSize: 9,
  fontWeight: 700,
  verticalAlign: 'super',
  cursor: 'pointer',
  margin: '0 1px',
  transition: 'all 0.15s',
  border: 'none',
  lineHeight: 1,
  transform: 'translateY(-1px)',
};

const CARD_STYLE = {
  ...BADGE_BASE,
  background: 'color-mix(in srgb, var(--ds-accent) 15%, transparent)',
  color: 'var(--ds-accent)',
};

const WEB_STYLE = {
  ...BADGE_BASE,
  background: 'color-mix(in srgb, var(--ds-green) 15%, transparent)',
  color: 'var(--ds-green)',
};

const CARD_HOVER = { background: 'color-mix(in srgb, var(--ds-accent) 30%, transparent)' };
const WEB_HOVER = { background: 'color-mix(in srgb, var(--ds-green) 30%, transparent)' };

const TOOLTIP_CONTAINER = { width: 192 };

export default function CitationBadge({ cardId, citation, onClick, index }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [hovered, setHovered] = useState(false);

  const isWeb = citation && (citation.url || citation.web_url);
  const baseStyle = isWeb ? WEB_STYLE : CARD_STYLE;
  const hoverStyle = isWeb ? WEB_HOVER : CARD_HOVER;

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onClick) onClick(cardId, citation);
  };

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={handleClick}
        onMouseEnter={() => { setShowTooltip(true); setHovered(true); }}
        onMouseLeave={() => { setShowTooltip(false); setHovered(false); }}
        style={hovered ? { ...baseStyle, ...hoverStyle } : baseStyle}
      >
        {index !== undefined ? index : cardId}
      </button>

      {showTooltip && citation && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: 12,
            zIndex: 50,
            ...TOOLTIP_CONTAINER,
          }}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <SourceCard
            citation={citation}
            index={index}
            onClick={onClick ? () => onClick(cardId, citation) : null}
          />
        </div>
      )}
    </span>
  );
}
```

- [ ] **Step 2: Test in browser**

Run: `cd frontend && npm run dev`
Verify: Citation badges in message text show blue for Anki cards, green for web sources.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/CitationBadge.jsx
git commit -m "feat(citations): color-code badges blue (Anki) / green (web)"
```

---

### Task 6: Hold-to-Peek Gesture on CitationBadge

Add a press-and-hold gesture that shows the card on the Canvas while held.

**Files:**
- Create: `frontend/src/hooks/__tests__/useHoldToPeek.test.ts`
- Create: `frontend/src/hooks/useHoldToPeek.ts`
- Modify: `frontend/src/components/CitationBadge.jsx`

- [ ] **Step 1: Write failing tests for the hook**

```ts
// frontend/src/hooks/__tests__/useHoldToPeek.test.ts
import { renderHook, act } from '@testing-library/react';
import { useHoldToPeek } from '../useHoldToPeek';

describe('useHoldToPeek', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('calls onPeekStart after hold threshold', () => {
    const onPeekStart = vi.fn();
    const onPeekEnd = vi.fn();
    const { result } = renderHook(() => useHoldToPeek({ onPeekStart, onPeekEnd, threshold: 300 }));

    act(() => { result.current.handlers.onPointerDown({ preventDefault: vi.fn() } as any); });
    expect(onPeekStart).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(300); });
    expect(onPeekStart).toHaveBeenCalledTimes(1);
  });

  it('does not call onPeekStart if released before threshold', () => {
    const onPeekStart = vi.fn();
    const onPeekEnd = vi.fn();
    const { result } = renderHook(() => useHoldToPeek({ onPeekStart, onPeekEnd, threshold: 300 }));

    act(() => { result.current.handlers.onPointerDown({ preventDefault: vi.fn() } as any); });
    act(() => { vi.advanceTimersByTime(100); });
    act(() => { result.current.handlers.onPointerUp(); });
    act(() => { vi.advanceTimersByTime(300); });

    expect(onPeekStart).not.toHaveBeenCalled();
  });

  it('calls onPeekEnd when pointer released after peek started', () => {
    const onPeekStart = vi.fn();
    const onPeekEnd = vi.fn();
    const { result } = renderHook(() => useHoldToPeek({ onPeekStart, onPeekEnd, threshold: 300 }));

    act(() => { result.current.handlers.onPointerDown({ preventDefault: vi.fn() } as any); });
    act(() => { vi.advanceTimersByTime(300); });
    act(() => { result.current.handlers.onPointerUp(); });

    expect(onPeekEnd).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/hooks/__tests__/useHoldToPeek.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement useHoldToPeek hook**

```ts
// frontend/src/hooks/useHoldToPeek.ts
import { useRef, useCallback, useEffect } from 'react';

interface UseHoldToPeekOptions {
  onPeekStart: () => void;
  onPeekEnd: () => void;
  threshold?: number; // ms before peek triggers (default 300)
}

export function useHoldToPeek({ onPeekStart, onPeekEnd, threshold = 300 }: UseHoldToPeekOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peekingRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    clear();
    peekingRef.current = false;
    timerRef.current = setTimeout(() => {
      peekingRef.current = true;
      onPeekStart();
    }, threshold);
  }, [onPeekStart, threshold, clear]);

  const onPointerUp = useCallback(() => {
    clear();
    if (peekingRef.current) {
      peekingRef.current = false;
      onPeekEnd();
    }
  }, [onPeekEnd, clear]);

  // Cleanup on unmount
  useEffect(() => clear, [clear]);

  return {
    handlers: { onPointerDown, onPointerUp, onPointerCancel: onPointerUp },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/hooks/__tests__/useHoldToPeek.test.ts`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Wire useHoldToPeek into CitationBadge**

In `frontend/src/components/CitationBadge.jsx`, add the hold gesture. The peek callback communicates with the Canvas via bridge.

Add import at top:
```jsx
import { useHoldToPeek } from '../hooks/useHoldToPeek';
```

Add props: `bridge` to the component signature:
```jsx
export default function CitationBadge({ cardId, citation, onClick, index, bridge }) {
```

Add the hook inside the component:
```jsx
  const isWeb = citation && (citation.url || citation.web_url);

  const { handlers: holdHandlers } = useHoldToPeek({
    onPeekStart: () => {
      if (!isWeb && cardId && bridge) {
        bridge.previewCard(cardId);
      }
    },
    onPeekEnd: () => {
      if (!isWeb && bridge) {
        bridge.dismissPreview();
      }
    },
    threshold: 300,
  });
```

Add to the button element (merge with existing event handlers):
```jsx
      <button
        onClick={handleClick}
        onMouseEnter={() => { setShowTooltip(true); setHovered(true); }}
        onMouseLeave={() => { setShowTooltip(false); setHovered(false); }}
        onPointerDown={holdHandlers.onPointerDown}
        onPointerUp={holdHandlers.onPointerUp}
        onPointerCancel={holdHandlers.onPointerCancel}
        style={hovered ? { ...baseStyle, ...hoverStyle } : baseStyle}
      >
```

Note: `bridge.previewCard()` and `bridge.dismissPreview()` are the Canvas communication methods. If `dismissPreview` doesn't exist yet, it will need to be added to the bridge — but that's a separate backend task. For now, the frontend gesture is complete.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useHoldToPeek.ts frontend/src/hooks/__tests__/useHoldToPeek.test.ts frontend/src/components/CitationBadge.jsx
git commit -m "feat(citations): hold-to-peek gesture on citation badges"
```

---

### Task 7: Remove SourcesCarousel from Reasoning Flow

The SourcesCarousel is no longer rendered after reasoning. Remove its usage from the reasoning display path.

**Files:**
- Modify: `frontend/src/reasoning/FullReasoningDisplay.tsx`

- [ ] **Step 1: Remove SourcesCarousel import and usage**

In `frontend/src/reasoning/FullReasoningDisplay.tsx`:

Find and remove line 2:
```tsx
import SourcesCarousel from '../components/SourcesCarousel';
```

Find and remove the SourcesCarousel rendering block (around lines 430-437):
```tsx
          {/* Sources carousel — inside collapsible area, collapses with steps */}
          {sourcesReady && (
            <SourcesCarousel
              citations={citations}
              bridge={bridge}
              onPreviewCard={onPreviewCard}
            />
          )}
```

Also remove the `sourcesReady` variable (around line 320):
```tsx
  const sourcesReady = hasCitations && displaySteps.some(d => d.step === 'sources_ready');
```

And the unused variables that only served the carousel:
```tsx
  const hasCitations = Object.keys(citations).length > 0;
  const citationCount = Object.keys(citations).length;
```

Note: Don't delete the `FullReasoningDisplay.tsx` file itself — it may still be referenced by other code paths (e.g. the router orchestration display at line 1854 of ChatMessage). But SourcesCarousel is no longer part of the reasoning flow.

- [ ] **Step 2: Verify no other reasoning-path imports of SourcesCarousel**

Run: `cd frontend && grep -r "SourcesCarousel" src/reasoning/`
Expected: No matches after the edit.

- [ ] **Step 3: Run all frontend tests**

Run: `cd frontend && npm test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/reasoning/FullReasoningDisplay.tsx
git commit -m "refactor(reasoning): remove SourcesCarousel from reasoning display"
```

---

### Task 8: Build and Verify

**Files:**
- None (verification only)

- [ ] **Step 1: Run all frontend tests**

Run: `cd frontend && npm test`
Expected: All tests pass (107+ existing + new tests from Tasks 1, 6).

- [ ] **Step 2: Build for production**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Check for TypeScript/lint errors**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors related to the changed files.

- [ ] **Step 4: Commit build output**

```bash
git add web/
git commit -m "build: production build with reasoning dots redesign"
```
