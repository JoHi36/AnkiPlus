# Fokus-Planer v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the Fokus-Planer from a deadline-based planning tool to a clean statusboard — Gesamt-Chart with full prediction complexity, compact focus rows with inline bars, and an improved activity section.

**Architecture:** Remove all deadline logic (date picker, prediction-at-deadline, layered lines). AggregatedPlanView becomes a three-zone view: Gesamt-Header with the existing TrajectoryChart fed by aggregated trajectory data, compact focus rows (dot + name + bar + % + pace + due + chevron), and an activity section (streak + heatmap + time-of-day side by side). useFocusManager computes the aggregate trajectory from per-focus data. StatistikView's Ebene 0 dock skips the date picker — "Fokus festlegen" creates immediately.

**Tech Stack:** React 18, existing TrajectoryChart + useTrajectoryModel, existing YearHeatmap + TimeOfDayChart, existing useFocusManager

**Spec:** `docs/superpowers/specs/2026-03-30-fokus-planer-v2-design.md`

---

## File Structure

```
Modified files:
  frontend/src/hooks/useFocusManager.js         — Remove deadline sorting, simplify createFocus, add aggregateTraj computation
  frontend/src/components/StatistikView.jsx      — Remove deadline state/UI, pass stats data to AggregatedPlanView, simplify dock
  frontend/src/components/AggregatedPlanView.jsx — Complete rewrite: Gesamt-Header + compact rows + activity section
  frontend/src/components/FocusDetailView.jsx    — Remove deadline display
```

---

### Task 1: Simplify useFocusManager — remove deadline, add aggregate trajectory

Remove deadline from createFocus, change sorting to mastery-based, and add aggregate trajectory computation.

**Files:**
- Modify: `frontend/src/hooks/useFocusManager.js`

- [ ] **Step 1: Update createFocus to drop deadline**

In `frontend/src/hooks/useFocusManager.js`, replace the `createFocus` callback:

```js
const createFocus = useCallback((deckCells) => {
  if (!window.ankiBridge) return;
  window.ankiBridge.addMessage('saveFocus', {
    deckIds: deckCells.map(c => c.id),
    deckNames: deckCells.map(c => c.name),
    deadline: '',
  });
}, []);
```

- [ ] **Step 2: Change sorting from deadline to mastery % descending**

Replace the `sortedFocuses` useMemo:

```js
const sortedFocuses = useMemo(() => {
  return [...focuses].sort((a, b) => {
    const aPct = trajectories[a.id]?.current_pct ?? -1;
    const bPct = trajectories[b.id]?.current_pct ?? -1;
    return bPct - aPct;
  });
}, [focuses, trajectories]);
```

- [ ] **Step 3: Add aggregateTrajectory computation**

Add a `useMemo` block after `sortedFocuses` that computes the weighted-average trajectory across all focuses:

```js
const aggregateTrajectory = useMemo(() => {
  const loaded = sortedFocuses
    .map(f => ({ focus: f, traj: trajectories[f.id] }))
    .filter(({ traj }) => traj?.days?.length > 0);

  if (loaded.length === 0) return null;

  // Use the longest days array as the template
  const maxLen = Math.max(...loaded.map(({ traj }) => traj.days.length));
  const template = loaded.find(({ traj }) => traj.days.length === maxLen);

  const totalWeight = loaded.reduce((s, { traj }) => s + (traj.total_cards || 1), 0);

  const days = template.traj.days.map((day, i) => {
    let weightedPct = 0;
    let weightedReview = 0;
    let weightedNew = 0;
    for (const { traj } of loaded) {
      const w = traj.total_cards || 1;
      const d = i < traj.days.length ? traj.days[i] : traj.days[traj.days.length - 1];
      weightedPct += (d.mature_pct ?? 0) * w;
      weightedReview += (d.review_count ?? 0);
      weightedNew += (d.new_count ?? 0);
    }
    return {
      date: day.date,
      mature_pct: Math.round((weightedPct / totalWeight) * 10) / 10,
      review_count: weightedReview,
      new_count: weightedNew,
    };
  });

  const currentPct = Math.round(
    loaded.reduce((s, { traj }) => s + (traj.current_pct || 0) * (traj.total_cards || 1), 0)
    / totalWeight * 10
  ) / 10;

  return {
    days,
    current_pct: currentPct,
    total_cards: loaded.reduce((s, { traj }) => s + (traj.total_cards || 0), 0),
    mature_cards: loaded.reduce((s, { traj }) => s + (traj.mature_cards || 0), 0),
    young_cards: loaded.reduce((s, { traj }) => s + (traj.young_cards || 0), 0),
    avg_new_7d: loaded.reduce((s, { traj }) => s + (traj.avg_new_7d || 0), 0),
  };
}, [sortedFocuses, trajectories]);
```

- [ ] **Step 4: Add aggregateTrajectory to return value**

Update the return statement to include `aggregateTrajectory`:

```js
return {
  focuses: sortedFocuses,
  hasFocuses,
  loading,
  activeFocusId,
  activeFocus,
  setActiveFocusId,
  createFocus,
  deleteFocus,
  getFocusColor,
  trajectories,
  suggestions,
  aggregateTrajectory,
};
```

- [ ] **Step 5: Verify build**

Run: `cd frontend && npm run build 2>&1 | tail -5`
Expected: `✓ built in` (no errors)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useFocusManager.js
git commit -m "refactor(focus): remove deadline sorting, add aggregate trajectory computation"
```

---

### Task 2: Remove deadline from StatistikView dock

Remove the date picker flow from Ebene 0. "Fokus festlegen" creates the focus immediately.

**Files:**
- Modify: `frontend/src/components/StatistikView.jsx`

- [ ] **Step 1: Remove deadline state variables**

Remove these lines from the top of the component:

```js
const [deadlineInput, setDeadlineInput] = useState('');
const [showDatePicker, setShowDatePicker] = useState(false);
```

- [ ] **Step 2: Simplify handleCreateFocus**

Replace with:

```js
const handleCreateFocus = useCallback(() => {
  if (!selectedCells.length) return;
  createFocus(selectedCells);
  setSelectedCells([]);
  setShowTreemap(false);
}, [selectedCells, createFocus]);
```

- [ ] **Step 3: Simplify the dock UI**

Replace the entire dock content (the `{showDatePicker ? ... : selectionSummary ? ... : ...}` ternary) with:

```jsx
{selectionSummary ? (
  <>
    <div style={DOCK_STATS_STYLE}>
      <div style={DOCK_STAT_STYLE}>
        <span style={DOCK_STAT_VALUE_STYLE}>{selectionSummary.dueReview}</span>
        <span style={DOCK_STAT_LABEL_STYLE}>Pflege</span>
      </div>
      <span style={DOCK_PLUS_STYLE}>+</span>
      <div style={DOCK_STAT_STYLE}>
        <span style={{ ...DOCK_STAT_VALUE_STYLE, color: 'var(--ds-green)' }}>
          {selectionSummary.dueNew}
        </span>
        <span style={DOCK_STAT_LABEL_STYLE}>Neue</span>
      </div>
      <span style={DOCK_EQUALS_STYLE}>=</span>
      <div style={DOCK_STAT_STYLE}>
        <span style={DOCK_TOTAL_VALUE_STYLE}>{selectionSummary.total}</span>
        <span style={DOCK_STAT_LABEL_STYLE}>Gesamt</span>
      </div>
    </div>
    <button onClick={handleCreateFocus} style={DOCK_BUTTON_STYLE}>
      Fokus festlegen
    </button>
  </>
) : (
  <span style={DOCK_HINT_STYLE}>Fokus wählen</span>
)}
```

- [ ] **Step 4: Remove unused style constants**

Delete `DATE_PICKER_ROW_STYLE` and `DATE_INPUT_STYLE`.

- [ ] **Step 5: Pass stats data + aggregateTrajectory to AggregatedPlanView**

Update the useFocusManager destructuring to include `aggregateTrajectory`:

```js
const {
  focuses, hasFocuses, loading: focusLoading,
  activeFocusId, activeFocus, setActiveFocusId,
  createFocus, deleteFocus,
  trajectories, suggestions,
  aggregateTrajectory,
} = useFocusManager();
```

Update the AggregatedPlanView render:

```jsx
<AggregatedPlanView
  focuses={focuses}
  onSelectFocus={handleSelectFocus}
  onAddFocus={() => setShowTreemap(true)}
  trajectories={trajectories}
  suggestions={suggestions}
  aggregateTrajectory={aggregateTrajectory}
  heatmapData={heatmapData}
  todData={todData}
/>
```

- [ ] **Step 6: Verify build**

Run: `cd frontend && npm run build 2>&1 | tail -5`
Expected: `✓ built in` (no errors)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/StatistikView.jsx
git commit -m "refactor(statistik): remove deadline date picker, pass stats to AggregatedPlanView"
```

---

### Task 3: Rewrite AggregatedPlanView — three-zone statusboard

Complete rewrite: Gesamt-Header with TrajectoryChart, compact focus rows, activity section.

**Files:**
- Rewrite: `frontend/src/components/AggregatedPlanView.jsx`

- [ ] **Step 1: Write the new component**

Replace the entire file with:

```jsx
import React from 'react';
import { getFocusColor } from '../hooks/useFocusManager';
import TrajectoryChart from './TrajectoryChart';
import YearHeatmap from './YearHeatmap';
import TimeOfDayChart from './TimeOfDayChart';

export default function AggregatedPlanView({
  focuses, onSelectFocus, onAddFocus,
  trajectories, suggestions, aggregateTrajectory,
  heatmapData, todData,
}) {
  const totalDue = focuses.reduce((s, f) => {
    const sugg = suggestions[f.id];
    return s + (sugg?.dueReview || 0) + (sugg?.recommendedNew || 0);
  }, 0);

  return (
    <div style={CONTAINER_STYLE}>

      {/* ── Zone 1: Gesamt-Header ─────────────────────────────── */}
      <div>
        <div style={GESAMT_ROW_STYLE}>
          <div style={GESAMT_PCT_STYLE}>
            {aggregateTrajectory?.current_pct ?? 0}
            <span style={GESAMT_UNIT_STYLE}>%</span>
          </div>
          <div style={GESAMT_PACE_STYLE}>
            +{aggregateTrajectory?.avg_new_7d ?? 0} neue / Tag
          </div>
        </div>
        <div style={GESAMT_LABEL_STYLE}>Abrufwahrscheinlichkeit</div>

        {aggregateTrajectory ? (
          <TrajectoryChart
            days={aggregateTrajectory.days || []}
            currentPct={aggregateTrajectory.current_pct || 0}
            totalCards={aggregateTrajectory.total_cards || 0}
            matureCards={aggregateTrajectory.mature_cards || 0}
            youngCards={aggregateTrajectory.young_cards || 0}
            avgNew7d={aggregateTrajectory.avg_new_7d || 0}
          />
        ) : (
          <div style={LOADING_STYLE}>
            <span style={{ color: 'var(--ds-text-muted)', fontSize: 13 }}>Lade Verlauf…</span>
          </div>
        )}

        <div style={GESAMT_ACTIONS_STYLE}>
          <span style={GESAMT_DUE_STYLE}>{totalDue} Karten heute</span>
          <button style={LEARN_BUTTON_STYLE}>Alles lernen</button>
        </div>
      </div>

      <div style={SEP_STYLE} />

      {/* ── Zone 2: Fokus-Zeilen ──────────────────────────────── */}
      <div>
        <div style={FOKUS_HEADER_STYLE}>
          <span style={FOKUS_LABEL_STYLE}>Fokus</span>
          <button onClick={onAddFocus} style={ADD_BTN_STYLE}>+ Fokus</button>
        </div>

        {focuses.map(f => {
          const traj = trajectories[f.id];
          const sugg = suggestions[f.id];
          const pct = traj?.current_pct ?? 0;
          const color = getFocusColor(f.colorIndex);
          const due = (sugg?.dueReview || 0) + (sugg?.recommendedNew || 0);

          // Compute pace from last 7 days
          const days7 = (traj?.days || []).slice(-7).map(d => d.mature_pct ?? 0);
          const pace = days7.length >= 2
            ? Math.max(0, (days7[days7.length - 1] - days7[0]) / (days7.length - 1))
            : 0;

          return (
            <button
              key={f.id}
              onClick={() => onSelectFocus(f.id)}
              style={FOCUS_ROW_STYLE}
            >
              <span style={{ ...F_DOT_STYLE, background: color }} />
              <span style={F_NAME_STYLE}>{(f.deckNames || []).join(', ')}</span>
              <span style={F_BAR_WRAP_STYLE}>
                <span style={{ ...F_BAR_STYLE, width: `${pct}%`, background: color }} />
              </span>
              <span style={F_PCT_STYLE}>{Math.round(pct)}%</span>
              <span style={{ ...F_PACE_STYLE, color }}>+{pace.toFixed(1)}%/d</span>
              <span style={F_DUE_STYLE}>{due} fällig</span>
              <span style={F_ARROW_STYLE}>›</span>
            </button>
          );
        })}
      </div>

      {/* ── Zone 3: Aktivität ─────────────────────────────────── */}
      <div>
        <div style={SEP_STYLE} />
        <div style={ACTIVITY_ROW_STYLE}>
          <div style={STREAK_STYLE}>
            <div style={STREAK_VAL_STYLE}>{heatmapData?.streak || 0}</div>
            <div style={STREAK_UNIT_STYLE}>Tage{'\n'}Streak</div>
            {(heatmapData?.best_streak || 0) > 0 && (
              <div style={STREAK_BEST_STYLE}>Best: {heatmapData.best_streak}</div>
            )}
          </div>
          <div style={HEATMAP_COL_STYLE}>
            <YearHeatmap
              levels={heatmapData?.levels || []}
              totalYear={heatmapData?.total_year || 0}
              streak={heatmapData?.streak || 0}
              bestStreak={heatmapData?.best_streak || 0}
              hideHeader
            />
          </div>
          <div style={TIME_COL_STYLE}>
            <TimeOfDayChart
              hours={todData?.hours || []}
              bestStart={todData?.best_start || 0}
              bestEnd={todData?.best_end || 0}
            />
          </div>
        </div>
        <div style={YEARLY_STYLE}>
          {heatmapData?.total_year || 0} Karten dieses Jahr
        </div>
      </div>

    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const CONTAINER_STYLE = {
  display: 'flex', flexDirection: 'column', gap: 0, width: '100%',
};

// Gesamt
const GESAMT_ROW_STYLE = {
  display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 2,
};
const GESAMT_PCT_STYLE = {
  fontSize: 44, fontWeight: 700, letterSpacing: -2, lineHeight: 1,
  color: 'var(--ds-text-primary)',
};
const GESAMT_UNIT_STYLE = {
  fontSize: 22, fontWeight: 400, color: 'var(--ds-text-secondary)',
};
const GESAMT_PACE_STYLE = {
  fontSize: 13, fontWeight: 600, color: 'var(--ds-accent)', paddingBottom: 6,
};
const GESAMT_LABEL_STYLE = {
  fontSize: 11, color: 'var(--ds-text-muted)', marginBottom: 10,
};
const GESAMT_ACTIONS_STYLE = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  marginTop: 12, marginBottom: 28,
};
const GESAMT_DUE_STYLE = { fontSize: 13, color: 'var(--ds-text-secondary)' };
const LEARN_BUTTON_STYLE = {
  padding: '8px 22px', borderRadius: 10,
  background: 'var(--ds-accent)', color: '#fff', border: 'none',
  fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
};
const LOADING_STYLE = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160,
};

// Separator
const SEP_STYLE = {
  height: 1, background: 'var(--ds-border-subtle)',
};

// Fokus header
const FOKUS_HEADER_STYLE = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '20px 0 14px',
};
const FOKUS_LABEL_STYLE = {
  fontSize: 10, fontWeight: 500, color: 'var(--ds-text-muted)',
  textTransform: 'uppercase', letterSpacing: 0.6,
};
const ADD_BTN_STYLE = {
  background: 'none', border: '1px solid var(--ds-border-subtle)',
  padding: '3px 10px', borderRadius: 7,
  color: 'var(--ds-text-muted)', fontSize: 10, fontWeight: 500,
  fontFamily: 'inherit', cursor: 'pointer',
};

// Focus row
const FOCUS_ROW_STYLE = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '11px 0', width: '100%',
  background: 'transparent', border: 'none',
  borderBottom: '1px solid var(--ds-border-subtle)',
  cursor: 'pointer', fontFamily: 'inherit',
  transition: 'opacity 0.15s', textAlign: 'left',
};
const F_DOT_STYLE = { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 };
const F_NAME_STYLE = { width: 96, fontSize: 13, fontWeight: 500, color: 'var(--ds-text-primary)' };
const F_BAR_WRAP_STYLE = {
  flex: 1, height: 5, background: 'var(--ds-hover-tint)',
  borderRadius: 3, overflow: 'hidden',
};
const F_BAR_STYLE = {
  height: '100%', borderRadius: 3, opacity: 0.55,
  transition: 'width 0.4s ease',
};
const F_PCT_STYLE = {
  fontSize: 14, fontWeight: 600, color: 'var(--ds-text-primary)',
  width: 40, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
};
const F_PACE_STYLE = {
  fontSize: 10, fontWeight: 500, width: 56, textAlign: 'right',
};
const F_DUE_STYLE = {
  fontSize: 10, color: 'var(--ds-text-muted)', width: 44, textAlign: 'right',
};
const F_ARROW_STYLE = {
  fontSize: 15, color: 'var(--ds-text-muted)', fontWeight: 300,
  width: 12, textAlign: 'center',
};

// Activity
const ACTIVITY_ROW_STYLE = {
  display: 'flex', gap: 20, alignItems: 'center', paddingTop: 16,
};
const STREAK_STYLE = {
  flex: '0 0 50px', display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center',
};
const STREAK_VAL_STYLE = {
  fontSize: 28, fontWeight: 200, color: 'var(--ds-text-primary)', lineHeight: 1,
};
const STREAK_UNIT_STYLE = {
  fontSize: 9, color: 'var(--ds-text-muted)', marginTop: 2, textAlign: 'center',
  whiteSpace: 'pre-line',
};
const STREAK_BEST_STYLE = {
  fontSize: 8, color: 'var(--ds-text-muted)', marginTop: 6, opacity: 0.5,
};
const HEATMAP_COL_STYLE = { flex: 1, minWidth: 0 };
const TIME_COL_STYLE = { flex: '0 0 100px' };
const YEARLY_STYLE = {
  fontSize: 10, color: 'var(--ds-text-muted)', marginTop: 10,
};
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npm run build 2>&1 | tail -5`
Expected: `✓ built in` (no errors)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/AggregatedPlanView.jsx
git commit -m "feat(fokus): rewrite AggregatedPlanView as three-zone statusboard"
```

---

### Task 4: Update FocusDetailView — remove deadline

**Files:**
- Modify: `frontend/src/components/FocusDetailView.jsx`

- [ ] **Step 1: Remove deadline display**

Replace the entire component with:

```jsx
import React from 'react';
import { getFocusColor } from '../hooks/useFocusManager';
import TrajectoryChart from './TrajectoryChart';
import SessionSuggestion from './SessionSuggestion';

export default function FocusDetailView({ focus, trajectory, suggestion, onBack }) {
  const color = getFocusColor(focus.colorIndex);

  return (
    <div style={CONTAINER_STYLE}>
      <div style={HEADER_STYLE}>
        <button onClick={onBack} style={BACK_STYLE}>← Alle Fokus</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ ...DOT_STYLE, background: color }} />
          <span style={FOCUS_NAME_STYLE}>{(focus.deckNames || []).join(', ')}</span>
        </div>
      </div>

      {trajectory ? (
        <TrajectoryChart
          days={trajectory.days || []}
          currentPct={trajectory.current_pct || 0}
          totalCards={trajectory.total_cards || 0}
          matureCards={trajectory.mature_cards || 0}
          youngCards={trajectory.young_cards || 0}
          avgNew7d={trajectory.avg_new_7d || 0}
        />
      ) : (
        <div style={LOADING_STYLE}>
          <span style={{ color: 'var(--ds-text-muted)', fontSize: 13 }}>Lade Verlauf…</span>
        </div>
      )}

      <SessionSuggestion suggestion={suggestion} />

      <button onClick={() => onBack('delete')} style={DELETE_STYLE}>
        Fokus entfernen
      </button>
    </div>
  );
}

const CONTAINER_STYLE = { display: 'flex', flexDirection: 'column', gap: 20, width: '100%' };
const HEADER_STYLE = { display: 'flex', flexDirection: 'column', gap: 8 };
const BACK_STYLE = {
  background: 'none', border: 'none', padding: '4px 0',
  color: 'var(--ds-accent)', fontSize: 13, fontWeight: 500,
  fontFamily: 'inherit', cursor: 'pointer', alignSelf: 'flex-start',
};
const DOT_STYLE = { width: 8, height: 8, borderRadius: '50%' };
const FOCUS_NAME_STYLE = { fontSize: 15, fontWeight: 500, color: 'var(--ds-text-primary)' };
const LOADING_STYLE = { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 };
const DELETE_STYLE = {
  background: 'none', border: 'none', padding: '8px 0',
  color: 'var(--ds-red)', fontSize: 12, fontWeight: 400,
  fontFamily: 'inherit', cursor: 'pointer', alignSelf: 'center', opacity: 0.6,
};
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npm run build 2>&1 | tail -5`
Expected: `✓ built in`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/FocusDetailView.jsx
git commit -m "refactor(fokus): remove deadline display from FocusDetailView"
```

---

### Task 5: Final build + test

**Files:**
- All modified files from Tasks 1–4

- [ ] **Step 1: Run frontend tests**

Run: `cd frontend && npm test 2>&1 | tail -10`
Expected: All tests pass

- [ ] **Step 2: Build for production**

Run: `cd frontend && npm run build 2>&1 | tail -5`
Expected: `✓ built in`

- [ ] **Step 3: Verify no unused imports**

Run: `cd frontend && grep -rn 'useDeckFocus\|FocusTabs\|deadlineInput\|showDatePicker' src/components/StatistikView.jsx src/components/AggregatedPlanView.jsx`
Expected: No matches

- [ ] **Step 4: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore(fokus): cleanup unused deadline references"
```
