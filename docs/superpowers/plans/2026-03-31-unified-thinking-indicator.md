# Unified Thinking Indicator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the messy multi-system reasoning display (ReasoningDots, CompactReasoningDisplay, FullReasoningDisplay, ActivityLine, DockLoading) with a single unified ThinkingIndicator that shows 2-3 phases in SF Mono for all channels.

**Architecture:** The backend emits 11+ raw pipeline_step events. A new `useThinkingPhases` hook maps them to exactly 3 human-readable phases (Kontextanalyse, Wissensabgleich, channel-specific). The `ThinkingIndicator` component renders these phases in SF Mono with pulsing dots. ReasoningStore stays as the data layer — only the display is replaced.

**Tech Stack:** React 18, TypeScript, CSS custom properties from design-system.css

**Design spec (Component Viewer):** `localhost:3000/?view=components` → scroll to "Thinking Indicator"

**Phase mapping:**
```
Backend raw steps              →  Phase 1: Kontextanalyse    →  Phase 2: Wissensabgleich  →  Phase 3: [channel]
orchestrating, router,            KG term count                  Card count from merge         Synthese / Strukturanalyse /
kg_enrichment                     (data.tier1+tier2 terms)       (data.total from merge)       Evaluation / MC-Synthese /
                                                                                                Reflexion
sql_search, semantic_search,
kg_search, merge

generating, web_search
```

---

## File Structure

### New files
- `frontend/src/components/ThinkingIndicator.tsx` — The unified visual component (~80 lines)
- `frontend/src/hooks/useThinkingPhases.ts` — Maps raw pipeline steps to 3 display phases (~100 lines)

### Modified files
- `frontend/src/components/ChatMessage.jsx` — Replace ReasoningDisplay + ActivityLine with ThinkingIndicator
- `frontend/src/hooks/useSmartSearch.js` — Pass streamId for ThinkingIndicator in Stapel
- `frontend/src/components/ReviewerDock.jsx` — Replace DockLoading with ThinkingIndicator
- `frontend/src/index.css` — Add `@keyframes thinking-pulse` animation
- `ui/widget.py:3899-3997` — Prüfer emits `pipeline_step` events instead of `reviewer.aiStep`

### Deleted files (Task 7)
- `frontend/src/reasoning/CompactReasoningDisplay.tsx`
- `frontend/src/reasoning/ReasoningDots.tsx`
- `frontend/src/reasoning/FullReasoningDisplay.tsx`
- `frontend/src/reasoning/defaultRenderers.ts` (step label generators — replaced by phase mapping)
- `frontend/src/components/ActivityLine.jsx`

### Kept (unchanged)
- `frontend/src/reasoning/store/` — ReasoningStore data layer
- `frontend/src/reasoning/useReasoningStream.ts` — pacing logic
- `frontend/src/hooks/useAgenticMessage.js` — event processing (still dispatches to store)

---

## Task 1: Create ThinkingIndicator component + useThinkingPhases hook

**Files:**
- Create: `frontend/src/components/ThinkingIndicator.tsx`
- Create: `frontend/src/hooks/useThinkingPhases.ts`
- Modify: `frontend/src/index.css` (add pulse animation)

- [ ] **Step 1: Add the pulse animation to index.css**

At the end of `frontend/src/index.css`, add:
```css
/* ThinkingIndicator pulse */
@keyframes thinking-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(0.8); }
}
.thinking-dot-pulse {
  animation: thinking-pulse 1.5s ease-in-out infinite;
}
```

- [ ] **Step 2: Create useThinkingPhases hook**

Create `frontend/src/hooks/useThinkingPhases.ts`:

```typescript
/**
 * useThinkingPhases — maps N raw pipeline steps to 2-3 display phases.
 *
 * Phase 1: Kontextanalyse (from: orchestrating, router, kg_enrichment)
 * Phase 2: Wissensabgleich (from: sql_search, semantic_search, kg_search, merge)
 * Phase 3: Channel-specific (from: generating, web_search, or custom)
 *
 * Optional: Web-Recherche inserted between Phase 2 and 3 when web_search step appears.
 */

import { useMemo } from 'react';
import { useReasoningStore } from '../reasoning/store';

export interface ThinkingPhase {
  name: string;
  status: 'pending' | 'active' | 'done';
  data?: string;       // e.g., "23 Begriffe", "14 Karten"
  color?: string;      // Agent color for the active dot
}

// Steps that belong to each phase
const PHASE1_STEPS = new Set(['orchestrating', 'router', 'kg_enrichment', 'strategy']);
const PHASE2_STEPS = new Set(['sql_search', 'semantic_search', 'kg_search', 'merge']);
const PHASE3_STEPS = new Set(['generating']);
const WEB_STEPS = new Set(['web_search']);

// Channel-specific Phase 3 names
const PHASE3_NAMES: Record<string, string> = {
  tutor: 'Synthese',
  research: 'Strukturanalyse',
  prufer: 'Evaluation',
  plusi: 'Reflexion',
};

function derivePhaseStatus(
  steps: Array<{ step: string; status: string }>,
  phaseSteps: Set<string>
): 'pending' | 'active' | 'done' {
  const matching = steps.filter(s => phaseSteps.has(s.step));
  if (matching.length === 0) return 'pending';
  if (matching.some(s => s.status === 'active')) return 'active';
  if (matching.every(s => s.status === 'done' || s.status === 'error')) return 'done';
  return 'active';
}

export function useThinkingPhases(
  streamId?: string,
  agentName?: string,
  agentColor?: string
): ThinkingPhase[] | null {
  const store = useReasoningStore();
  const stream = streamId ? store.streams[streamId] : undefined;

  return useMemo(() => {
    if (!stream || stream.steps.length === 0) return null;

    const steps = stream.steps;
    const agent = agentName || stream.agentName || 'tutor';
    const color = agentColor || stream.agentColor;

    // Derive phase statuses
    const p1Status = derivePhaseStatus(steps, PHASE1_STEPS);
    const p2Status = derivePhaseStatus(steps, PHASE2_STEPS);
    const p3Status = derivePhaseStatus(steps, PHASE3_STEPS);

    // If nothing has started yet, don't show
    if (p1Status === 'pending' && p2Status === 'pending' && p3Status === 'pending') return null;

    // Extract data from completed steps
    // Phase 1 data: KG term count from kg_enrichment done step
    let p1Data: string | undefined;
    const kgDone = steps.find(s => s.step === 'kg_enrichment' && s.status === 'done');
    if (kgDone && (kgDone as any).data) {
      const d = (kgDone as any).data;
      const termCount = (d.tier1_terms?.length || 0) + (d.tier2_terms?.length || 0) || d.total_hits || 0;
      if (termCount > 0) p1Data = `${termCount} Begriffe`;
    }

    // Phase 2 data: card count from merge done step
    let p2Data: string | undefined;
    const mergeDone = steps.find(s => s.step === 'merge' && s.status === 'done');
    if (mergeDone && (mergeDone as any).data) {
      const total = (mergeDone as any).data.total;
      if (total > 0) p2Data = `${total} Karten`;
    }

    // Build phases array — only include phases that have started or will start
    const phases: ThinkingPhase[] = [];

    // Phase 1: always show if anything is happening
    if (p1Status !== 'pending' || p2Status !== 'pending' || p3Status !== 'pending') {
      phases.push({ name: 'Kontextanalyse', status: p1Status, data: p1Data, color });
    }

    // Phase 2: show if started or Phase 1 is done
    if (p2Status !== 'pending' || p1Status === 'done') {
      phases.push({ name: 'Wissensabgleich', status: p2Status, data: p2Data, color });
    }

    // Optional: Web-Recherche (only if web_search step exists)
    const webStep = steps.find(s => WEB_STEPS.has(s.step));
    if (webStep) {
      const webData = (webStep as any).data;
      const sourceCount = webData?.source_count || webData?.total_hits || 0;
      phases.push({
        name: 'Web-Recherche',
        status: webStep.status === 'done' ? 'done' : 'active',
        data: sourceCount > 0 ? `${sourceCount} Quellen` : undefined,
        color,
      });
    }

    // Phase 3: channel-specific
    const phase3Name = PHASE3_NAMES[agent] || 'Synthese';
    // For MC generation in Prüfer
    const mcStep = steps.find(s => s.step === 'mc_generation');
    const actualP3Name = mcStep ? 'MC-Synthese' : phase3Name;

    if (p3Status !== 'pending' || p2Status === 'done') {
      phases.push({ name: actualP3Name, status: p3Status, color });
    }

    return phases.length > 0 ? phases : null;
  }, [stream, streamId, agentName, agentColor]);
}
```

- [ ] **Step 3: Create ThinkingIndicator component**

Create `frontend/src/components/ThinkingIndicator.tsx`:

```tsx
/**
 * ThinkingIndicator — unified reasoning display for all channels.
 *
 * Shows 2-3 phases in SF Mono. Pulsing dot for active step,
 * muted dot + data for completed steps. Same component everywhere.
 */

import React from 'react';
import { ThinkingPhase } from '../hooks/useThinkingPhases';

interface ThinkingIndicatorProps {
  phases: ThinkingPhase[] | null;
  collapsed?: boolean;          // Show single-line summary instead of step list
  agentLabel?: string;          // e.g., "Tutor" for collapsed mode
}

const INDICATOR_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
};

const STEP_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
  fontFamily: 'var(--ds-font-mono)',
  fontSize: 11.5,
  letterSpacing: '0.02em',
};

const DOT_BASE: React.CSSProperties = {
  width: 5,
  height: 5,
  borderRadius: '50%',
  flexShrink: 0,
  position: 'relative',
  top: -1,
};

const COLLAPSED_STYLE: React.CSSProperties = {
  fontFamily: 'var(--ds-font-mono)',
  fontSize: 10.5,
  letterSpacing: '0.03em',
  color: 'var(--ds-text-tertiary)',
  display: 'flex',
  gap: 6,
  alignItems: 'center',
};

function ThinkingIndicator({ phases, collapsed, agentLabel }: ThinkingIndicatorProps) {
  if (!phases || phases.length === 0) return null;

  // Collapsed mode: "TUTOR · 23 Begriffe · 14 Karten"
  if (collapsed) {
    const dataPoints = phases.filter(p => p.data && p.status === 'done').map(p => p.data);
    if (dataPoints.length === 0 && !agentLabel) return null;
    return (
      <div style={COLLAPSED_STYLE}>
        {agentLabel && (
          <span style={{ textTransform: 'uppercase', fontWeight: 600, opacity: 0.7 }}>
            {agentLabel}
          </span>
        )}
        {dataPoints.map((d, i) => (
          <React.Fragment key={i}>
            <span style={{ opacity: 0.3 }}>·</span>
            <span>{d}</span>
          </React.Fragment>
        ))}
      </div>
    );
  }

  // Expanded mode: vertical step list
  return (
    <div style={INDICATOR_STYLE}>
      {phases.map((phase, i) => {
        if (phase.status === 'pending') return null;

        const isDone = phase.status === 'done';
        const isActive = phase.status === 'active';

        return (
          <div
            key={i}
            style={{
              ...STEP_STYLE,
              color: isDone ? 'var(--ds-text-tertiary)' : 'var(--ds-text-secondary)',
            }}
          >
            {/* Dot */}
            <span
              className={isActive ? 'thinking-dot-pulse' : undefined}
              style={{
                ...DOT_BASE,
                background: isActive
                  ? (phase.color || 'var(--ds-accent)')
                  : 'var(--ds-text-tertiary)',
                opacity: isDone ? 0.5 : 1,
              }}
            />
            {/* Label */}
            <span style={{ fontWeight: isActive ? 500 : 400 }}>
              {phase.name}
            </span>
            {/* Data */}
            {phase.data && (
              <>
                <span style={{ opacity: 0.4 }}>·</span>
                <span style={{ opacity: isDone ? 0.6 : 0.8 }}>{phase.data}</span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default React.memo(ThinkingIndicator);
```

- [ ] **Step 4: Verify in Component Viewer**

The Component Viewer already has static mockups. The new component should match the visual spec shown there. Open `localhost:3000/?view=components` to compare.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ThinkingIndicator.tsx frontend/src/hooks/useThinkingPhases.ts frontend/src/index.css
git commit -m "feat: ThinkingIndicator component + useThinkingPhases hook"
```

---

## Task 2: Integrate ThinkingIndicator in ChatMessage (Tutor channel)

**Files:**
- Modify: `frontend/src/components/ChatMessage.jsx`

This is the most impactful change — replacing the current "tutor · 7 Schritte · •••••• · 31 Quellen" display.

- [ ] **Step 1: Add imports**

At the top of `ChatMessage.jsx`, add:
```javascript
import ThinkingIndicator from './ThinkingIndicator';
import { useThinkingPhases } from '../hooks/useThinkingPhases';
```

- [ ] **Step 2: Replace ReasoningDisplay + ActivityLine with ThinkingIndicator**

In the ChatMessage component body, find where `ReasoningDisplay` is used for tutor cells. There are two locations:

**During streaming** (around lines 1929-1957): Replace the `mode="dots"` and `mode="compact"` ReasoningDisplay instances with a single ThinkingIndicator:

Find the block that renders ReasoningDisplay (mode="dots") and ReasoningDisplay (mode="compact"). Replace both with:
```jsx
{/* ThinkingIndicator — replaces ReasoningDots + CompactReasoningDisplay */}
<ThinkingIndicatorLive
  requestId={requestId}
  agentName={cell?.agent || 'tutor'}
/>
```

Where `ThinkingIndicatorLive` is a small wrapper inside ChatMessage:
```jsx
function ThinkingIndicatorLive({ requestId, agentName }) {
  const streamId = requestId ? `${agentName}-${requestId}` : undefined;
  const phases = useThinkingPhases(streamId, agentName);
  if (!phases) return null;
  return <ThinkingIndicator phases={phases} />;
}
```

**After streaming** (around lines 1940-1946): Replace the `ActivityLine` component with the collapsed ThinkingIndicator:
```jsx
{/* Collapsed summary — replaces ActivityLine */}
<ThinkingIndicatorLive
  requestId={requestId}
  agentName={cell?.agent || 'tutor'}
  collapsed
  agentLabel={cell?.agent || 'tutor'}
/>
```

NOTE: This requires reading the actual ChatMessage code carefully. The exact replacement depends on where ReasoningDisplay and ActivityLine are rendered within the cell rendering logic. The engineer must:
1. Read ChatMessage.jsx fully
2. Find all ReasoningDisplay usages
3. Find the ActivityLine usage
4. Replace each with the appropriate ThinkingIndicator variant

- [ ] **Step 3: Remove unused imports**

Remove these imports from ChatMessage.jsx if no longer used:
```javascript
import ReasoningDisplay from '../reasoning/ReasoningDisplay';
import ActivityLine from './ActivityLine';
```

- [ ] **Step 4: Test in dev server**

Run: `cd frontend && npm run dev`
Open Session view, send a message to Tutor, verify:
- 3 phases appear (Kontextanalyse, Wissensabgleich, Synthese)
- Active step has pulsing blue dot
- Done steps show data (N Begriffe, N Karten)
- After response completes, collapses to "TUTOR · N Begriffe · N Karten"

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ChatMessage.jsx
git commit -m "feat: replace ReasoningDisplay with ThinkingIndicator in ChatMessage"
```

---

## Task 3: Integrate ThinkingIndicator in Stapel (Research channel)

**Files:**
- Modify: `frontend/src/components/SearchSidebar.jsx` or wherever the Stapel reasoning display lives

- [ ] **Step 1: Find where Stapel shows reasoning**

Read `SearchSidebar.jsx` and find where ReasoningDisplay is rendered. It likely uses a `streamId` from `useSmartSearch`.

- [ ] **Step 2: Replace with ThinkingIndicator**

Replace the ReasoningDisplay instance with:
```jsx
import ThinkingIndicator from './ThinkingIndicator';
import { useThinkingPhases } from '../hooks/useThinkingPhases';

// Inside component:
const phases = useThinkingPhases(searchStreamId, 'research');
// ...
{phases && <ThinkingIndicator phases={phases} />}
```

- [ ] **Step 3: Test in dev server**

Open Stapel view, search for something, verify:
- Kontextanalyse → Wissensabgleich → Strukturanalyse phases appear
- Green dot for active Research step
- Data shows real numbers

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/SearchSidebar.jsx
git commit -m "feat: ThinkingIndicator in Stapel search (Research channel)"
```

---

## Task 4: Unify Prüfer step emission to pipeline_step

**Files:**
- Modify: `ui/widget.py:3899-3997` (evaluation and MC handlers)

Currently the Prüfer emits `reviewer.aiStep` events which are a separate system. To use the unified ThinkingIndicator, the Prüfer needs to emit standard `pipeline_step` events that flow through ReasoningStore.

- [ ] **Step 1: Update `_msg_evaluate_answer` to emit pipeline_step events**

In `ui/widget.py`, find `_msg_evaluate_answer` (line 3899). Replace the `_send_reviewer_step` calls with standard pipeline step emissions:

```python
def _msg_evaluate_answer(self, data):
    """Evaluate user's text answer against correct answer via AI."""
    import threading
    import uuid
    try:
        parsed = json.loads(data) if isinstance(data, str) else data
        question = parsed.get('question', '')
        user_answer = parsed.get('userAnswer', '')
        correct_answer = parsed.get('correctAnswer', '')
        request_id = str(uuid.uuid4())

        def _run():
            try:
                # Emit unified pipeline steps (same as Tutor/Research)
                self._send_to_frontend_pipeline('prufer', request_id, 'orchestrating', 'active', {})
                self._send_to_frontend_pipeline('prufer', request_id, 'orchestrating', 'done', {'agent': 'prufer'})
                self._send_to_frontend_pipeline('prufer', request_id, 'generating', 'active', {})

                from ..ai.prufer import evaluate_answer
                result = evaluate_answer(question, user_answer, correct_answer)

                self._send_to_frontend_pipeline('prufer', request_id, 'generating', 'done', {})

                def _inject():
                    self._send_to_frontend('reviewer.evaluationResult', result)
                from aqt import mw
                mw.taskman.run_on_main(_inject)
            except Exception as e:
                logger.exception("evaluate_answer thread error: %s", e)
                def _error():
                    self._send_to_frontend('reviewer.evaluationResult', {
                        "score": 50, "feedback": "Fehler bei der Bewertung."
                    })
                from aqt import mw
                mw.taskman.run_on_main(_error)

        threading.Thread(target=_run, daemon=True).start()
    except Exception as e:
        logger.exception("_msg_evaluate_answer error: %s", e)
```

- [ ] **Step 2: Add `_send_to_frontend_pipeline` helper**

Add this helper method to the widget class (near `_send_reviewer_step`):

```python
def _send_to_frontend_pipeline(self, agent, request_id, step, status, data):
    """Emit a unified pipeline_step event for ThinkingIndicator."""
    payload = {
        'type': 'pipeline_step',
        'step': step,
        'status': status,
        'agent': agent,
        'requestId': request_id,
        'data': data or {},
    }
    from aqt import mw
    import json as _json
    js = "window.dispatchEvent(new CustomEvent('reviewer.pipeline_step', {detail: %s}));" % _json.dumps(payload)
    mw.taskman.run_on_main(lambda: self.web_view.page().runJavaScript(js))
```

- [ ] **Step 3: Update `_msg_generate_mc` similarly**

Same pattern: emit `orchestrating → generating → done` pipeline steps.

- [ ] **Step 4: Frontend: Listen for reviewer.pipeline_step events in useReviewerState**

In `useReviewerState.js`, add a listener for `reviewer.pipeline_step` that dispatches to ReasoningStore:

```javascript
useEffect(() => {
  const onPipeline = (e) => {
    const data = e.detail;
    const streamId = `prufer-${data.requestId}`;
    reasoningDispatch({ type: 'STEP', streamId, step: data.step, status: data.status, data: data.data || {} });
    reasoningDispatch({ type: 'AGENT_META', streamId, agentName: 'prufer' });
  };
  window.addEventListener('reviewer.pipeline_step', onPipeline);
  return () => window.removeEventListener('reviewer.pipeline_step', onPipeline);
}, [reasoningDispatch]);
```

- [ ] **Step 5: Commit**

```bash
git add ui/widget.py frontend/src/hooks/useReviewerState.js
git commit -m "feat: Prüfer emits unified pipeline_step events for ThinkingIndicator"
```

---

## Task 5: Integrate ThinkingIndicator in ReviewerDock (Prüfer channel)

**Files:**
- Modify: `frontend/src/components/ReviewerDock.jsx`

- [ ] **Step 1: Replace DockLoading with ThinkingIndicator**

Replace the current `DockLoading` component:

```jsx
// Old:
export function DockLoading({ steps }) {
  const last = steps[steps.length - 1];
  return (
    <div style={{ padding: '12px 16px', minHeight: 48, display: 'flex', alignItems: 'center', gap: 8 }}>
      <span className="loading loading-spinner loading-xs" />
      <span style={{ fontSize: 13 }}>{last?.label || 'KI bewertet...'}</span>
    </div>
  );
}
```

With:
```jsx
import ThinkingIndicator from './ThinkingIndicator';
import { useThinkingPhases } from '../hooks/useThinkingPhases';

export function DockLoading({ streamId }) {
  const phases = useThinkingPhases(streamId, 'prufer');
  return (
    <div style={{ padding: '12px 16px', minHeight: 48 }}>
      {phases ? (
        <ThinkingIndicator phases={phases} />
      ) : (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontFamily: 'var(--ds-font-mono)', fontSize: 11.5,
          letterSpacing: '0.02em', color: 'var(--ds-text-secondary)',
        }}>
          <span className="thinking-dot-pulse" style={{
            width: 5, height: 5, borderRadius: '50%',
            background: '#AF52DE', flexShrink: 0,
          }} />
          <span style={{ fontWeight: 500 }}>Evaluation</span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update DockLoading callers to pass streamId**

Find where `DockLoading` is rendered (likely in App.jsx or ReviewerView). It currently receives `steps` prop. Change to pass `streamId` instead. The streamId should be tracked in useReviewerState when pipeline events arrive.

- [ ] **Step 3: Test evaluation and MC generation**

Trigger answer evaluation and MC generation in the reviewer. Verify ThinkingIndicator appears with Prüfer purple dot.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ReviewerDock.jsx
git commit -m "feat: ThinkingIndicator in ReviewerDock (Prüfer channel)"
```

---

## Task 6: Delete old reasoning display components

**Files:**
- Delete: `frontend/src/reasoning/CompactReasoningDisplay.tsx`
- Delete: `frontend/src/reasoning/ReasoningDots.tsx`
- Delete: `frontend/src/reasoning/FullReasoningDisplay.tsx`
- Delete: `frontend/src/components/ActivityLine.jsx`
- Modify: `frontend/src/reasoning/ReasoningDisplay.tsx` — simplify or delete
- Modify: Any files that import deleted components

- [ ] **Step 1: Search for all imports of deleted components**

```bash
grep -r "CompactReasoningDisplay\|ReasoningDots\|FullReasoningDisplay\|ActivityLine" frontend/src/ --include='*.{js,jsx,ts,tsx}'
```

Remove all imports and usages.

- [ ] **Step 2: Delete the files**

```bash
rm frontend/src/reasoning/CompactReasoningDisplay.tsx
rm frontend/src/reasoning/ReasoningDots.tsx
rm frontend/src/reasoning/FullReasoningDisplay.tsx
rm frontend/src/components/ActivityLine.jsx
```

- [ ] **Step 3: Simplify or delete ReasoningDisplay.tsx**

If ReasoningDisplay.tsx is still imported anywhere, simplify it to delegate to ThinkingIndicator. If not imported anywhere, delete it.

- [ ] **Step 4: Run frontend tests**

```bash
cd frontend && npx vitest run --reporter=verbose 2>&1 | tail -20
```

Fix any import errors from deleted files.

- [ ] **Step 5: Build check**

```bash
cd frontend && npm run build 2>&1 | tail -10
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: delete old reasoning display components (replaced by ThinkingIndicator)"
```

---

## Verification Checklist

After completing all tasks:

- [ ] `cd frontend && npx vitest run` — all tests pass
- [ ] `cd frontend && npm run build` — builds without errors
- [ ] `python3 run_tests.py` — all Python tests pass (572+)
- [ ] Manual test: Tutor chat shows 3 phases in SF Mono (Kontextanalyse · N Begriffe → Wissensabgleich · N Karten → Synthese)
- [ ] Manual test: Tutor collapsed shows "TUTOR · N Begriffe · N Karten"
- [ ] Manual test: Stapel search shows same phases with green Research dot
- [ ] Manual test: Prüfer evaluation shows phases with purple dot
- [ ] Manual test: No old "tutor · 7 Schritte · •••••• · 31 Quellen" visible anywhere
- [ ] Component Viewer still renders ThinkingIndicator mockups correctly
