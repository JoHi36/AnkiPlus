# Statistik Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Statistik tab with trajectory chart, daily breakdown, knowledge treemap, 365-day heatmap, time-of-day chart, and goal input dock.

**Architecture:** Replace the empty `StatistikView` placeholder with a composition of 5 new widget components + reused `KnowledgeHeatmap`. Remove the Stapel↔Heatmap toggle from `GraphView`. All widgets are standalone React components usable both on the Statistik page and in chat via tools. Data comes from a new `useStatistikData` hook that queries Anki's `revlog` via bridge.

**Tech Stack:** React 18, CSS variables (design-system.css), SVG for charts, existing bridge/message-queue system.

**Spec:** `docs/superpowers/specs/2026-03-29-statistik-page-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `frontend/src/components/TrajectoryChart.jsx` | SVG trajectory curve (past + projected future + goal markers) |
| Create | `frontend/src/components/DailyBreakdown.jsx` | Today's cards split: Wachstum/Festigung/Pflege |
| Create | `frontend/src/components/YearHeatmap.jsx` | 365-day GitHub-style activity heatmap + streak badge |
| Create | `frontend/src/components/TimeOfDayChart.jsx` | 24h activity bar chart |
| Create | `frontend/src/hooks/useStatistikData.js` | Hook that fetches all stats data via bridge |
| Modify | `frontend/src/components/StatistikView.jsx` | Replace placeholder → compose all widgets |
| Modify | `frontend/src/components/GraphView.jsx` | Remove Heatmap toggle + KnowledgeHeatmap usage |
| Modify | `frontend/src/App.jsx:2293-2296` | Pass `deckData` and `bridge` props to StatistikView |
| Modify | `frontend/src/ComponentViewer.jsx` | Add "Statistik" section with all new widgets |
| Create | `ui/bridge_stats.py` | Bridge methods for stats data (revlog queries) |
| Modify | `ui/bridge.py` | Import and register stats bridge methods |

---

### Task 1: Remove Heatmap Toggle from GraphView

**Files:**
- Modify: `frontend/src/components/GraphView.jsx`

- [ ] **Step 1: Remove KnowledgeHeatmap import (line 5)**

Delete this line:
```javascript
import KnowledgeHeatmap from './KnowledgeHeatmap';
```

- [ ] **Step 2: Remove heatmap-related state (lines 49, 51-52)**

Remove these lines:
```javascript
  const heatmapRef = useRef(null);
```
```javascript
  const [heatmapDeck, setHeatmapDeck] = useState(null);
  const [contentMode, setContentMode] = useState('decks'); // 'decks' | 'heatmap'
```

- [ ] **Step 3: Remove the content mode toggle (lines 702-734)**

Replace the entire `{contentMode === 'decks' ? (` ... `) : (` ... `)}` block (lines 702-734) with just the deck list content (no conditional):

```jsx
              {(deckData?.roots || []).map((node, idx) => (
                <DeckNode
                  key={node.id}
                  node={node}
                  depth={0}
                  isExpanded={isExpanded}
                  onToggle={toggleExpanded}
                  onStudy={(deckId) => executeAction('deck.study', { deckId })}
                  onSelect={(deckId) => executeAction('deck.select', { deckId })}
                  index={idx}
                />
              ))}
              {(!deckData?.roots || deckData.roots.length === 0) && (
                <div style={{
                  textAlign: 'center', padding: '40px 0',
                  color: 'var(--ds-text-muted)', fontSize: 13,
                }}>
                  Keine Stapel vorhanden
                </div>
              )}
```

- [ ] **Step 4: Remove the toggle buttons from the bottom dock (lines 753-778)**

Delete the entire toggle div (the one containing the `['decks', 'heatmap'].map(mode => ...)` block). Also remove the heatmapDeck conditional section (lines 780-813) since `heatmapDeck` state no longer exists. Replace the dock content with just the search bar context or remove the dock entirely if only the toggle lived there.

The dock should keep any remaining non-heatmap content (like the "Wähle einen Stapel" text or study button if connected to regular deck selection). If the dock ONLY existed for the heatmap toggle, remove the entire dock div (lines 737-815).

After editing, scan for any remaining references to `heatmapRef`, `heatmapDeck`, `setHeatmapDeck`, `contentMode`, `setContentMode`, `isWeak` and remove them.

- [ ] **Step 5: Verify build**

Run: `cd frontend && npm run build`
Expected: Clean build, no errors. The Stapel tab should show only the deck list, no toggle.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/GraphView.jsx
git commit -m "refactor: remove Heatmap toggle from Stapel — heatmap moves to Statistik"
```

---

### Task 2: Create Python Bridge Stats Methods

**Files:**
- Create: `ui/bridge_stats.py`
- Modify: `ui/bridge.py`

- [ ] **Step 1: Create `ui/bridge_stats.py`**

This module provides the data-fetching functions that the bridge will call. All queries run on the main thread via `run_on_main_thread`.

```python
"""Bridge helper: statistics data for the Statistik tab."""

import time
import json
from datetime import datetime, timedelta

try:
    from ..utils.anki import run_on_main_thread
    from ..utils.logging import get_logger
except ImportError:
    from utils.anki import run_on_main_thread
    from utils.logging import get_logger

logger = get_logger(__name__)

# Day boundary: Anki uses rollover hour (default 4am).
# revlog.id is millisecond timestamp.

def _day_start_ms(days_ago=0):
    """Return ms timestamp for start of day (4am cutoff)."""
    now = datetime.now()
    day = now - timedelta(days=days_ago)
    day_start = day.replace(hour=4, minute=0, second=0, microsecond=0)
    if now.hour < 4:
        day_start -= timedelta(days=1)
    return int(day_start.timestamp() * 1000)


def get_trajectory_data():
    """Return daily progress snapshots for the last 180 days."""
    try:
        from aqt import mw
    except ImportError:
        return {"error": "Anki not available"}

    def _collect():
        if not mw or not mw.col:
            return {"error": "No collection"}
        col = mw.col
        total_cards = col.cardCount()
        if total_cards == 0:
            return {"days": [], "total": 0, "current_pct": 0}

        # Get daily review counts for last 180 days
        cutoff = _day_start_ms(180)
        rows = col.db.all(
            "SELECT id, type FROM revlog WHERE id >= ?", cutoff
        )

        # Group reviews by day
        day_map = {}
        for rid, rtype in rows:
            day = datetime.fromtimestamp(rid / 1000).strftime('%Y-%m-%d')
            if day not in day_map:
                day_map[day] = {"new": 0, "young": 0, "mature": 0}
            if rtype == 0:
                day_map[day]["new"] += 1
            elif rtype == 1:
                day_map[day]["young"] += 1
            else:
                day_map[day]["mature"] += 1

        # Current knowledge state
        mature = len(col.find_cards("prop:ivl>=21"))
        young = len(col.find_cards("prop:ivl>0 prop:ivl<21"))
        new_cards = len(col.find_cards("is:new"))
        current_pct = round((mature + young * 0.5) / total_cards * 100, 1) if total_cards > 0 else 0

        # 7-day average new cards
        last_7_days = []
        for i in range(7):
            day = (datetime.now() - timedelta(days=i)).strftime('%Y-%m-%d')
            last_7_days.append(day_map.get(day, {}).get("new", 0))
        avg_new_per_day = round(sum(last_7_days) / max(len(last_7_days), 1), 1)

        return {
            "days": day_map,
            "total": total_cards,
            "mature": mature,
            "young": young,
            "new": new_cards,
            "current_pct": current_pct,
            "avg_new_per_day": avg_new_per_day,
        }

    return run_on_main_thread(_collect, timeout=9)


def get_daily_breakdown():
    """Return today's review breakdown: new/young/mature."""
    try:
        from aqt import mw
    except ImportError:
        return {"error": "Anki not available"}

    def _collect():
        if not mw or not mw.col:
            return {"error": "No collection"}
        col = mw.col
        today_start = _day_start_ms(0)
        rows = col.db.all(
            "SELECT type FROM revlog WHERE id >= ?", today_start
        )
        new_count = sum(1 for _, in rows if _ == 0)
        young_count = sum(1 for _, in rows if _ == 1)
        mature_count = sum(1 for _, in rows if _ >= 2)

        total_due = col.sched.totalCount()
        total_reviewed = len(rows)

        return {
            "new": new_count,
            "young": young_count,
            "mature": mature_count,
            "total_reviewed": total_reviewed,
            "total_due_remaining": total_due,
        }

    return run_on_main_thread(_collect, timeout=5)


def get_year_heatmap():
    """Return 365 days of review counts + streak info."""
    try:
        from aqt import mw
    except ImportError:
        return {"error": "Anki not available"}

    def _collect():
        if not mw or not mw.col:
            return {"error": "No collection"}
        col = mw.col
        cutoff = _day_start_ms(365)
        rows = col.db.all(
            "SELECT id FROM revlog WHERE id >= ?", cutoff
        )

        # Count reviews per day
        day_counts = {}
        for (rid,) in rows:
            day = datetime.fromtimestamp(rid / 1000).strftime('%Y-%m-%d')
            day_counts[day] = day_counts.get(day, 0) + 1

        # Build 365-day array (oldest first)
        days = []
        total_year = 0
        for i in range(364, -1, -1):
            day = (datetime.now() - timedelta(days=i)).strftime('%Y-%m-%d')
            count = day_counts.get(day, 0)
            total_year += count
            days.append(count)

        # Quantile-based levels (0-4)
        nonzero = sorted([d for d in days if d > 0])
        if len(nonzero) >= 4:
            q1 = nonzero[len(nonzero) // 4]
            q2 = nonzero[len(nonzero) // 2]
            q3 = nonzero[3 * len(nonzero) // 4]
        else:
            q1, q2, q3 = 1, 5, 15

        levels = []
        for d in days:
            if d == 0:
                levels.append(0)
            elif d <= q1:
                levels.append(1)
            elif d <= q2:
                levels.append(2)
            elif d <= q3:
                levels.append(3)
            else:
                levels.append(4)

        # Streak: consecutive days with reviews from today backward
        streak = 0
        for i in range(365):
            day = (datetime.now() - timedelta(days=i)).strftime('%Y-%m-%d')
            if day_counts.get(day, 0) > 0:
                streak += 1
            else:
                break

        # Best streak
        best_streak = 0
        current = 0
        for i in range(364, -1, -1):
            day = (datetime.now() - timedelta(days=i)).strftime('%Y-%m-%d')
            if day_counts.get(day, 0) > 0:
                current += 1
                best_streak = max(best_streak, current)
            else:
                current = 0

        return {
            "levels": levels,
            "total_year": total_year,
            "streak": streak,
            "best_streak": best_streak,
        }

    return run_on_main_thread(_collect, timeout=9)


def get_time_of_day():
    """Return review activity by hour of day (last 30 days)."""
    try:
        from aqt import mw
    except ImportError:
        return {"error": "Anki not available"}

    def _collect():
        if not mw or not mw.col:
            return {"error": "No collection"}
        col = mw.col
        cutoff = _day_start_ms(30)
        rows = col.db.all(
            "SELECT id FROM revlog WHERE id >= ?", cutoff
        )

        hours = [0] * 24
        for (rid,) in rows:
            h = datetime.fromtimestamp(rid / 1000).hour
            hours[h] += 1

        max_h = max(hours) if max(hours) > 0 else 1
        normalized = [round(h / max_h, 2) for h in hours]

        # Best window (2-hour block)
        best_start = 0
        best_sum = 0
        for i in range(23):
            s = hours[i] + hours[i + 1]
            if s > best_sum:
                best_sum = s
                best_start = i

        return {
            "hours": normalized,
            "raw_hours": hours,
            "best_start": best_start,
            "best_end": best_start + 2,
        }

    return run_on_main_thread(_collect, timeout=5)
```

- [ ] **Step 2: Add bridge methods to `ui/bridge.py`**

Add a new `@pyqtSlot` method that returns all stats data at once. Find the existing stats-related methods in `bridge.py` and add nearby:

```python
@pyqtSlot(result=str)
def getStatistikData(self):
    """Return all data for the Statistik page."""
    try:
        from .bridge_stats import (
            get_trajectory_data,
            get_daily_breakdown,
            get_year_heatmap,
            get_time_of_day,
        )
        result = {
            "trajectory": get_trajectory_data(),
            "daily": get_daily_breakdown(),
            "heatmap": get_year_heatmap(),
            "timeOfDay": get_time_of_day(),
        }
        return json.dumps(result)
    except Exception:
        logger.exception("Failed to get statistik data")
        return json.dumps({"error": "Failed to load statistics"})
```

- [ ] **Step 3: Add message handler in `ui/widget.py`**

In `_handle_js_message()`, add a handler for the `getStatistikData` message type. Find the existing message handlers and add:

```python
elif msg_type == 'getStatistikData':
    result = self._bridge.getStatistikData()
    self._send_to_js('statistikData', json.loads(result))
```

- [ ] **Step 4: Commit**

```bash
git add ui/bridge_stats.py ui/bridge.py ui/widget.py
git commit -m "feat(stats): add Python bridge methods for Statistik page data"
```

---

### Task 3: Create useStatistikData Hook

**Files:**
- Create: `frontend/src/hooks/useStatistikData.js`

- [ ] **Step 1: Create the hook**

```javascript
import { useState, useEffect, useCallback } from 'react';

/**
 * Hook that fetches statistics data from the Anki bridge.
 * Returns trajectory, daily breakdown, heatmap, and time-of-day data.
 * In dev mode (no bridge), returns mock data for preview.
 */

const MOCK_DATA = {
  trajectory: {
    current_pct: 42,
    avg_new_per_day: 23,
    mature: 1240,
    young: 680,
    new: 520,
    total: 2440,
    days: {},
  },
  daily: {
    new: 23,
    young: 25,
    mature: 25,
    total_reviewed: 73,
    total_due_remaining: 47,
  },
  heatmap: {
    levels: Array.from({ length: 365 }, () => Math.floor(Math.random() * 5)),
    total_year: 2847,
    streak: 12,
    best_streak: 34,
  },
  timeOfDay: {
    hours: [0.08,0.04,0.02,0.01,0,0,0.12,0.45,0.82,0.88,0.68,0.52,0.28,0.22,0.32,0.48,0.42,0.58,0.65,0.50,0.35,0.25,0.15,0.08],
    best_start: 8,
    best_end: 10,
  },
};

export default function useStatistikData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(() => {
    if (!window.ankiBridge) {
      // Dev mode — use mock data
      setData(MOCK_DATA);
      setLoading(false);
      return;
    }
    window.ankiBridge.addMessage('getStatistikData', {});
  }, []);

  useEffect(() => {
    // Listen for response
    const handler = (event) => {
      const payload = event.detail || event;
      if (payload?.type === 'statistikData') {
        setData(payload.data || payload);
        setLoading(false);
      }
    };
    window.addEventListener('ankiReceive', handler);
    fetch();
    return () => window.removeEventListener('ankiReceive', handler);
  }, [fetch]);

  return { data, loading, refresh: fetch };
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useStatistikData.js
git commit -m "feat(stats): add useStatistikData hook with mock data for dev"
```

---

### Task 4: Create TrajectoryChart Widget

**Files:**
- Create: `frontend/src/components/TrajectoryChart.jsx`

- [ ] **Step 1: Create the component**

```jsx
import React, { useMemo } from 'react';

const CHART_W = 800;
const CHART_H = 160;
const MARGIN = { left: 32, right: 10, top: 10, bottom: 18 };

const GRID_STYLE = { stroke: 'var(--ds-border-subtle)', strokeWidth: 0.8 };
const LABEL_STYLE = { fill: 'var(--ds-text-muted)', fontSize: 10, fontFamily: 'inherit' };
const MONTH_STYLE = { fill: 'var(--ds-text-muted)', fontSize: 9, fontFamily: 'inherit' };

/**
 * TrajectoryChart — SVG progress curve with past line, future projection, and goal markers.
 *
 * Props:
 *   currentPct   — current overall % (e.g. 42)
 *   avgPerDay    — average new cards per day (for footer)
 *   dailyPflege  — maintenance reviews per day (for footer)
 *   dailyTotal   — total cards per day (for footer)
 *   pacePerDay   — % growth per day (e.g. 1.2)
 *   goals        — [{ pct: 60, label: '~ 8. Mai' }, ...]  (optional)
 */
export default function TrajectoryChart({
  currentPct = 42,
  avgPerDay = 23,
  dailyPflege = 50,
  dailyTotal = 73,
  pacePerDay = 1.2,
  goals = [],
}) {
  // Generate past trajectory: 6 months, rising to currentPct
  const pastPoints = useMemo(() => {
    const points = [];
    const months = 6;
    const totalDays = months * 30;
    const startPct = Math.max(currentPct - pacePerDay * totalDays, 2);
    const xStart = MARGIN.left;
    const xEnd = MARGIN.left + (CHART_W - MARGIN.left - MARGIN.right) * 0.65; // "today" at ~65%
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const pct = startPct + (currentPct - startPct) * (t * t * 0.3 + t * 0.7); // slight curve
      const x = xStart + (xEnd - xStart) * t;
      const y = pctToY(pct);
      points.push(`${x},${y}`);
    }
    return points.join(' ');
  }, [currentPct, pacePerDay]);

  // Future projection: 3 months
  const futurePoints = useMemo(() => {
    const todayX = MARGIN.left + (CHART_W - MARGIN.left - MARGIN.right) * 0.65;
    const endX = CHART_W - MARGIN.right;
    const futurePct = Math.min(currentPct + pacePerDay * 90, 98);
    const points = [`${todayX},${pctToY(currentPct)}`];
    for (let i = 1; i <= 10; i++) {
      const t = i / 10;
      const pct = currentPct + (futurePct - currentPct) * t;
      const x = todayX + (endX - todayX) * t;
      points.push(`${x},${pctToY(pct)}`);
    }
    return points.join(' ');
  }, [currentPct, pacePerDay]);

  const todayX = MARGIN.left + (CHART_W - MARGIN.left - MARGIN.right) * 0.65;
  const todayY = pctToY(currentPct);

  // Month labels
  const monthLabels = useMemo(() => {
    const now = new Date();
    const labels = [];
    const totalMonths = 9; // 6 back + 3 forward
    const xStart = MARGIN.left;
    const xEnd = CHART_W - MARGIN.right;
    for (let i = 0; i < totalMonths; i++) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 6 + i);
      const name = d.toLocaleDateString('de-DE', { month: 'short' });
      const x = xStart + (xEnd - xStart) * (i / (totalMonths - 1));
      labels.push({ name, x });
    }
    return labels;
  }, []);

  // Goal markers
  const goalMarkers = useMemo(() => {
    if (!goals.length) return [];
    const endX = CHART_W - MARGIN.right;
    return goals.map((g, i) => {
      // Place proportionally in future zone
      const t = (i + 1) / (goals.length + 0.5);
      const x = todayX + (endX - todayX) * t;
      const y = pctToY(g.pct);
      return { ...g, x, y };
    });
  }, [goals, todayX]);

  return (
    <div style={{ padding: '0 4px' }}>
      <div style={HEADER_STYLE}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <span style={TITLE_STYLE}>Fortschritt</span>
          <span style={PCT_STYLE}>{currentPct}%</span>
          <span style={PCT_SUB_STYLE}>gesamt</span>
        </div>
        <span style={PACE_STYLE}>+{pacePerDay}% / Tag</span>
      </div>

      <div style={{ height: 170, margin: '0 -8px' }}>
        <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
          <defs>
            <linearGradient id="trajBandGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ds-accent)" stopOpacity="0.08" />
              <stop offset="100%" stopColor="var(--ds-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[25, 50, 75].map(pct => (
            <React.Fragment key={pct}>
              <line x1={MARGIN.left} y1={pctToY(pct)} x2={CHART_W - MARGIN.right} y2={pctToY(pct)} style={GRID_STYLE} />
              <text x={4} y={pctToY(pct) + 4} style={LABEL_STYLE}>{pct}%</text>
            </React.Fragment>
          ))}

          {/* Month labels */}
          {monthLabels.map(m => (
            <text key={m.name} x={m.x} y={CHART_H - 2} style={MONTH_STYLE}>{m.name}</text>
          ))}

          {/* Past trajectory */}
          <polyline points={pastPoints} fill="none" stroke="var(--ds-accent)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 6px rgba(10,132,255,0.25))' }} />

          {/* Today */}
          <line x1={todayX} y1={MARGIN.top} x2={todayX} y2={CHART_H - MARGIN.bottom} stroke="var(--ds-border-subtle)" strokeWidth={0.8} strokeDasharray="2 3" />
          <circle cx={todayX} cy={todayY} r={4.5} fill="var(--ds-accent)" style={{ filter: 'drop-shadow(0 0 4px rgba(10,132,255,0.4))' }} />
          <text x={todayX} y={MARGIN.top - 1} textAnchor="middle" style={{ ...LABEL_STYLE, fontSize: 8, letterSpacing: 0.5 }}>HEUTE</text>

          {/* Future projection */}
          <polyline points={futurePoints} fill="none" stroke="var(--ds-accent)" strokeWidth={1.8} strokeDasharray="5 4" opacity={0.4} />

          {/* Goal markers */}
          {goalMarkers.map((g, i) => (
            <g key={i} transform={`translate(${g.x},${g.y})`}>
              <rect x={-18} y={-16} width={36} height={14} rx={4} fill={i === 0 ? 'rgba(10,132,255,0.12)' : 'rgba(94,92,230,0.12)'} stroke={i === 0 ? 'rgba(10,132,255,0.25)' : 'rgba(94,92,230,0.25)'} strokeWidth={0.8} />
              <text x={0} y={-6} textAnchor="middle" style={{ fontSize: 9, fontWeight: 600, fontFamily: 'inherit', fill: i === 0 ? 'var(--ds-accent)' : '#5E5CE6' }}>{g.pct}%</text>
              <circle r={3} fill={i === 0 ? 'var(--ds-accent)' : '#5E5CE6'} opacity={0.5} />
            </g>
          ))}
        </svg>
      </div>

      <div style={FOOTER_STYLE}>
        <strong>{avgPerDay} neue Karten / Tag</strong> Wachstum · {dailyPflege} Pflege-Reviews · {dailyTotal} Karten gesamt
      </div>
    </div>
  );
}

function pctToY(pct) {
  // Map 0-100% to chart area (inverted Y)
  const usableH = CHART_H - MARGIN.top - MARGIN.bottom;
  return MARGIN.top + usableH * (1 - pct / 100);
}

const HEADER_STYLE = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  marginBottom: 18,
};
const TITLE_STYLE = {
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--ds-text-tertiary)',
  letterSpacing: 0.3,
};
const PCT_STYLE = {
  fontSize: 32,
  fontWeight: 700,
  color: 'var(--ds-accent)',
  letterSpacing: -0.5,
};
const PCT_SUB_STYLE = {
  fontSize: 13,
  color: 'var(--ds-text-muted)',
  marginLeft: 3,
};
const PACE_STYLE = {
  fontSize: 12,
  color: 'rgba(48,209,88,0.75)',
  fontWeight: 500,
};
const FOOTER_STYLE = {
  marginTop: 10,
  fontSize: 11,
  color: 'var(--ds-text-muted)',
  letterSpacing: 0.2,
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/TrajectoryChart.jsx
git commit -m "feat(stats): add TrajectoryChart SVG widget"
```

---

### Task 5: Create DailyBreakdown Widget

**Files:**
- Create: `frontend/src/components/DailyBreakdown.jsx`

- [ ] **Step 1: Create the component**

```jsx
import React from 'react';

/**
 * DailyBreakdown — Today's cards split into Wachstum/Festigung/Pflege.
 *
 * Props:
 *   newCount     — new cards learned today (Wachstum)
 *   youngCount   — young card reviews today (Festigung)
 *   matureCount  — mature card reviews today (Pflege)
 *   totalDue     — remaining due cards
 *   growthPct    — percentage growth today (e.g. 1.8)
 */

const CATEGORIES = [
  { key: 'new', label: 'Wachstum', desc: 'Neue Karten lernen', color: '#5E5CE6' },
  { key: 'young', label: 'Festigung', desc: 'Junge Karten wiederholen', color: 'var(--ds-accent)' },
  { key: 'mature', label: 'Pflege', desc: 'Reife Karten erhalten', color: 'var(--ds-border-medium)' },
];

export default function DailyBreakdown({
  newCount = 0,
  youngCount = 0,
  matureCount = 0,
  growthPct = 0,
}) {
  const total = newCount + youngCount + matureCount;
  const counts = { new: newCount, young: youngCount, mature: matureCount };

  return (
    <div>
      <div style={HEADER_STYLE}>
        <span style={TITLE_STYLE}>Dein Tag</span>
        <span style={TOTAL_STYLE}>Heute: <strong style={{ color: 'var(--ds-text-secondary)', fontWeight: 600 }}>{total} Karten</strong></span>
      </div>

      {/* Segmented bar */}
      <div style={BAR_STYLE}>
        {CATEGORIES.map(cat => (
          counts[cat.key] > 0 && (
            <div key={cat.key} style={{ flex: counts[cat.key], background: cat.color, borderRadius: 2 }} />
          )
        ))}
      </div>

      {/* Items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {CATEGORIES.map(cat => (
          <div key={cat.key} style={ITEM_STYLE}>
            <div style={{ ...DOT_STYLE, background: cat.color }} />
            <div style={{ flex: 1 }}>
              <div style={LABEL_STYLE}>{cat.label}</div>
              <div style={DESC_STYLE}>{cat.desc}</div>
            </div>
            <div style={VAL_STYLE}>{counts[cat.key]}</div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={FOOTER_STYLE}>
        Davon echtes Wachstum: <strong style={{ color: '#5E5CE6', fontWeight: 500 }}>{newCount} neue Karten (+{growthPct}%)</strong>
      </div>
    </div>
  );
}

const HEADER_STYLE = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
  marginBottom: 10,
};
const TITLE_STYLE = { fontSize: 13, fontWeight: 500, color: 'var(--ds-text-tertiary)', letterSpacing: 0.3 };
const TOTAL_STYLE = { fontSize: 11, color: 'var(--ds-text-muted)' };
const BAR_STYLE = {
  display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', gap: 2, marginBottom: 16,
};
const ITEM_STYLE = { display: 'flex', alignItems: 'center', gap: 10 };
const DOT_STYLE = { width: 6, height: 6, borderRadius: '50%', flexShrink: 0 };
const LABEL_STYLE = { fontSize: 12, color: 'var(--ds-text-secondary)', fontWeight: 500 };
const DESC_STYLE = { fontSize: 10, color: 'var(--ds-text-muted)' };
const VAL_STYLE = { fontSize: 16, fontWeight: 600, color: 'var(--ds-text-secondary)', fontVariantNumeric: 'tabular-nums' };
const FOOTER_STYLE = {
  marginTop: 14, paddingTop: 12,
  borderTop: '1px solid var(--ds-border-subtle)',
  fontSize: 11, color: 'var(--ds-text-muted)',
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/DailyBreakdown.jsx
git commit -m "feat(stats): add DailyBreakdown widget"
```

---

### Task 6: Create YearHeatmap Widget

**Files:**
- Create: `frontend/src/components/YearHeatmap.jsx`

- [ ] **Step 1: Create the component**

```jsx
import React, { useMemo } from 'react';

const LEVEL_COLORS = [
  'rgba(255,255,255,0.025)',
  'rgba(10,132,255,0.15)',
  'rgba(10,132,255,0.32)',
  'rgba(10,132,255,0.55)',
  'rgba(10,132,255,0.85)',
];

/**
 * YearHeatmap — 365-day GitHub-style activity grid with streak badge.
 *
 * Props:
 *   levels      — array of 365 integers (0-4), oldest first
 *   totalYear   — total reviews this year
 *   streak      — current streak in days
 *   bestStreak  — best streak ever
 */
export default function YearHeatmap({
  levels = [],
  totalYear = 0,
  streak = 0,
  bestStreak = 0,
}) {
  const months = useMemo(() => {
    const now = new Date();
    const labels = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - i);
      labels.push(d.toLocaleDateString('de-DE', { month: 'short' }));
    }
    return labels;
  }, []);

  return (
    <div>
      <div style={HEADER_STYLE}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={TITLE_STYLE}>Aktivität</span>
          <div style={STREAK_BADGE_STYLE}>
            <span style={{ fontSize: 9 }}>🔥</span>
            <span style={STREAK_NUM_STYLE}>{streak}</span>
            <span style={STREAK_TXT_STYLE}>Tage</span>
          </div>
        </div>
        <span style={META_STYLE}><strong style={{ color: 'rgba(10,132,255,0.6)', fontWeight: 600 }}>{totalYear.toLocaleString('de-DE')}</strong> dieses Jahr</span>
      </div>

      {/* Month labels */}
      <div style={MONTHS_STYLE}>
        {months.map((m, i) => <span key={i} style={MONTH_LABEL_STYLE}>{m}</span>)}
      </div>

      {/* Grid */}
      <div style={GRID_STYLE}>
        {levels.map((lvl, i) => (
          <div key={i} style={{ background: LEVEL_COLORS[lvl] || LEVEL_COLORS[0], borderRadius: 2, minWidth: 0 }} />
        ))}
      </div>

      {/* Legend */}
      <div style={LEGEND_STYLE}>
        <span style={LEGEND_TEXT_STYLE}>Weniger</span>
        {LEVEL_COLORS.map((c, i) => (
          <div key={i} style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
        ))}
        <span style={LEGEND_TEXT_STYLE}>Mehr</span>
      </div>
    </div>
  );
}

const HEADER_STYLE = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
};
const TITLE_STYLE = { fontSize: 13, fontWeight: 500, color: 'var(--ds-text-tertiary)', letterSpacing: 0.3 };
const STREAK_BADGE_STYLE = {
  display: 'inline-flex', alignItems: 'center', gap: 3,
  padding: '2px 7px', background: 'rgba(255,149,0,0.08)', borderRadius: 5,
};
const STREAK_NUM_STYLE = { fontSize: 10, fontWeight: 700, color: '#FF9F0A' };
const STREAK_TXT_STYLE = { fontSize: 8, color: 'rgba(255,149,0,0.4)' };
const META_STYLE = { fontSize: 10, color: 'var(--ds-text-muted)' };
const MONTHS_STYLE = { display: 'flex', justifyContent: 'space-between', marginBottom: 3 };
const MONTH_LABEL_STYLE = { fontSize: 8, color: 'var(--ds-text-muted)' };
const GRID_STYLE = {
  display: 'grid',
  gridTemplateColumns: 'repeat(52, 1fr)',
  gridTemplateRows: 'repeat(7, 1fr)',
  gap: 2,
};
const LEGEND_STYLE = {
  display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 5,
};
const LEGEND_TEXT_STYLE = { fontSize: 8, color: 'var(--ds-text-muted)' };
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/YearHeatmap.jsx
git commit -m "feat(stats): add YearHeatmap 365-day widget"
```

---

### Task 7: Create TimeOfDayChart Widget

**Files:**
- Create: `frontend/src/components/TimeOfDayChart.jsx`

- [ ] **Step 1: Create the component**

```jsx
import React from 'react';

/**
 * TimeOfDayChart — 24h activity bar chart.
 *
 * Props:
 *   hours     — array of 24 normalized values (0-1)
 *   bestStart — hour where best 2h window starts
 *   bestEnd   — hour where best 2h window ends
 */
export default function TimeOfDayChart({
  hours = [],
  bestStart = 8,
  bestEnd = 10,
}) {
  return (
    <div>
      <div style={HEADER_STYLE}>
        <span style={TITLE_STYLE}>Tageszeit</span>
        <span style={SUB_STYLE}>Aktivität</span>
      </div>

      <div style={CHART_STYLE}>
        {hours.map((h, i) => (
          <div key={i} style={WRAP_STYLE}>
            <div style={{
              width: '100%',
              height: `${Math.max(h * 100, 1)}%`,
              borderRadius: '2px 2px 0 0',
              background: h >= 0.7
                ? 'linear-gradient(180deg, var(--ds-green), rgba(48,209,88,0.12))'
                : h >= 0.3
                  ? 'linear-gradient(180deg, rgba(10,132,255,0.7), rgba(10,132,255,0.1))'
                  : 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.01))',
              minHeight: 1,
            }} />
            {i % 6 === 0 && <div style={HOUR_LABEL_STYLE}>{i}</div>}
          </div>
        ))}
      </div>

      <div style={BEST_ROW_STYLE}>
        <div style={BEST_DOT_STYLE} />
        <span style={BEST_TEXT_STYLE}>Am besten: <strong style={{ color: 'rgba(48,209,88,0.7)', fontWeight: 600 }}>{bestStart}–{bestEnd} Uhr</strong></span>
      </div>
    </div>
  );
}

const HEADER_STYLE = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 };
const TITLE_STYLE = { fontSize: 13, fontWeight: 500, color: 'var(--ds-text-tertiary)', letterSpacing: 0.3 };
const SUB_STYLE = { fontSize: 9, color: 'var(--ds-text-muted)' };
const CHART_STYLE = { display: 'flex', alignItems: 'flex-end', gap: 2, height: 90 };
const WRAP_STYLE = {
  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
  height: '100%', justifyContent: 'flex-end', gap: 2,
};
const HOUR_LABEL_STYLE = { fontSize: 7, color: 'var(--ds-text-muted)' };
const BEST_ROW_STYLE = { marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 };
const BEST_DOT_STYLE = { width: 4, height: 4, borderRadius: '50%', background: 'var(--ds-green)' };
const BEST_TEXT_STYLE = { fontSize: 10, color: 'var(--ds-text-muted)' };
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/TimeOfDayChart.jsx
git commit -m "feat(stats): add TimeOfDayChart 24h widget"
```

---

### Task 8: Compose StatistikView

**Files:**
- Modify: `frontend/src/components/StatistikView.jsx`
- Modify: `frontend/src/App.jsx:2293-2296`

- [ ] **Step 1: Rewrite StatistikView**

```jsx
import React from 'react';
import useStatistikData from '../hooks/useStatistikData';
import TrajectoryChart from './TrajectoryChart';
import DailyBreakdown from './DailyBreakdown';
import KnowledgeHeatmap from './KnowledgeHeatmap';
import YearHeatmap from './YearHeatmap';
import TimeOfDayChart from './TimeOfDayChart';

export default function StatistikView({ deckData }) {
  const { data, loading } = useStatistikData();

  if (loading || !data) {
    return (
      <div style={LOADING_STYLE}>
        <span style={{ color: 'var(--ds-text-muted)', fontSize: 13 }}>Statistik wird geladen…</span>
      </div>
    );
  }

  const { trajectory, daily, heatmap, timeOfDay } = data;
  const totalDaily = (daily?.new || 0) + (daily?.young || 0) + (daily?.mature || 0);
  const growthPct = trajectory?.total > 0
    ? ((daily?.new || 0) / trajectory.total * 100).toFixed(1)
    : '0';

  return (
    <div style={PAGE_STYLE}>
      {/* Trajectory Hero */}
      <TrajectoryChart
        currentPct={trajectory?.current_pct || 0}
        avgPerDay={trajectory?.avg_new_per_day || 0}
        dailyPflege={(daily?.young || 0) + (daily?.mature || 0)}
        dailyTotal={totalDaily}
        pacePerDay={trajectory?.total > 0
          ? +((trajectory?.avg_new_per_day || 0) / trajectory.total * 100).toFixed(1)
          : 0}
        goals={[{ pct: 60, label: '~ Mai' }, { pct: 80, label: '~ Jun' }]}
      />

      <div style={DIVIDER_STYLE} />

      {/* Mid row: Dein Tag + Wissensstand */}
      <div style={MID_ROW_STYLE}>
        <div style={{ flex: '0 0 260px' }}>
          <DailyBreakdown
            newCount={daily?.new || 0}
            youngCount={daily?.young || 0}
            matureCount={daily?.mature || 0}
            growthPct={growthPct}
          />
        </div>
        <div style={{ flex: 1 }}>
          <div style={SECTION_HEADER_STYLE}>
            <span style={SECTION_TITLE_STYLE}>Wissensstand</span>
            <span style={SECTION_HINT_STYLE}>Tippe für Ziel</span>
          </div>
          <div style={{ height: 120 }}>
            <KnowledgeHeatmap
              deckData={deckData}
              onSelectDeck={() => {}}
              selectedDeckId={null}
            />
          </div>
        </div>
      </div>

      <div style={DIVIDER_STYLE} />

      {/* Bottom row: Heatmap + Tageszeit */}
      <div style={BOTTOM_ROW_STYLE}>
        <div style={{ flex: 1 }}>
          <YearHeatmap
            levels={heatmap?.levels || []}
            totalYear={heatmap?.total_year || 0}
            streak={heatmap?.streak || 0}
            bestStreak={heatmap?.best_streak || 0}
          />
        </div>
        <div style={{ flex: '0 0 170px' }}>
          <TimeOfDayChart
            hours={timeOfDay?.hours || []}
            bestStart={timeOfDay?.best_start || 0}
            bestEnd={timeOfDay?.best_end || 0}
          />
        </div>
      </div>

      {/* Goal Input Dock */}
      <div style={GOAL_WRAP_STYLE}>
        <div className="ds-frosted" style={GOAL_INPUT_STYLE}>
          <span style={{ fontSize: 13, color: 'var(--ds-text-muted)' }}>◎</span>
          <span style={{ flex: 1, fontSize: 13, color: 'var(--ds-text-muted)' }}>Was willst du bis wann schaffen?</span>
          <span style={KBD_STYLE}>⌘K</span>
        </div>
      </div>
    </div>
  );
}

const LOADING_STYLE = {
  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const PAGE_STYLE = {
  flex: 1, display: 'flex', flexDirection: 'column', gap: 28,
  maxWidth: 900, margin: '0 auto', width: '100%',
  padding: '24px 36px 80px',
  overflowY: 'auto', scrollbarWidth: 'none',
};
const DIVIDER_STYLE = {
  height: 1, background: 'var(--ds-border-subtle)', margin: '0 4px',
};
const MID_ROW_STYLE = { display: 'flex', gap: 28, padding: '0 4px' };
const BOTTOM_ROW_STYLE = { display: 'flex', gap: 28, padding: '0 4px' };
const SECTION_HEADER_STYLE = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10,
};
const SECTION_TITLE_STYLE = {
  fontSize: 13, fontWeight: 500, color: 'var(--ds-text-tertiary)', letterSpacing: 0.3,
};
const SECTION_HINT_STYLE = { fontSize: 10, color: 'var(--ds-text-muted)' };
const GOAL_WRAP_STYLE = {
  position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', zIndex: 100,
};
const GOAL_INPUT_STYLE = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '10px 20px', borderRadius: 14, minWidth: 360,
  border: '1px solid var(--ds-border-subtle)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
};
const KBD_STYLE = {
  fontSize: 9, color: 'var(--ds-text-muted)',
  padding: '2px 5px', border: '1px solid var(--ds-border-subtle)', borderRadius: 4,
};
```

- [ ] **Step 2: Pass deckData to StatistikView in App.jsx**

In `App.jsx` around line 2295, change:

```jsx
<StatistikView />
```

to:

```jsx
<StatistikView deckData={deckBrowserData} />
```

Where `deckBrowserData` is already available in that scope (used by GraphView).

- [ ] **Step 3: Verify build**

Run: `cd frontend && npm run build`
Expected: Clean build. Opening the Statistik tab should show the full page with all widgets (mock data in dev, real data in Anki).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/StatistikView.jsx frontend/src/App.jsx
git commit -m "feat(stats): compose StatistikView with all widgets"
```

---

### Task 9: Add Widgets to Component Viewer

**Files:**
- Modify: `frontend/src/ComponentViewer.jsx`

- [ ] **Step 1: Add Statistik section to ComponentViewer**

Add imports at the top:
```javascript
import TrajectoryChart from './components/TrajectoryChart';
import DailyBreakdown from './components/DailyBreakdown';
import YearHeatmap from './components/YearHeatmap';
import TimeOfDayChart from './components/TimeOfDayChart';
```

Find the last section in the viewer and add a new "Statistik" section after it. Use the existing `Showcase` and section patterns:

```jsx
{/* ─── Statistik Widgets ─── */}
<SectionHeader id="statistik" refs={sectionRefs}>Statistik</SectionHeader>

<Showcase label="Trajectory Chart">
  <div style={{ maxWidth: 800, background: 'var(--ds-bg-deep)', padding: 20, borderRadius: 12 }}>
    <TrajectoryChart
      currentPct={42}
      avgPerDay={23}
      dailyPflege={50}
      dailyTotal={73}
      pacePerDay={1.2}
      goals={[{ pct: 60, label: '~ Mai' }, { pct: 80, label: '~ Jun' }]}
    />
  </div>
</Showcase>

<Showcase label="Daily Breakdown">
  <div style={{ maxWidth: 260, background: 'var(--ds-bg-deep)', padding: 20, borderRadius: 12 }}>
    <DailyBreakdown newCount={23} youngCount={25} matureCount={25} growthPct={1.8} />
  </div>
</Showcase>

<Showcase label="Year Heatmap">
  <div style={{ maxWidth: 700, background: 'var(--ds-bg-deep)', padding: 20, borderRadius: 12 }}>
    <YearHeatmap
      levels={Array.from({ length: 365 }, () => Math.floor(Math.random() * 5))}
      totalYear={2847}
      streak={12}
      bestStreak={34}
    />
  </div>
</Showcase>

<Showcase label="Time of Day Chart">
  <div style={{ maxWidth: 200, background: 'var(--ds-bg-deep)', padding: 20, borderRadius: 12 }}>
    <TimeOfDayChart
      hours={[0.08,0.04,0.02,0.01,0,0,0.12,0.45,0.82,0.88,0.68,0.52,0.28,0.22,0.32,0.48,0.42,0.58,0.65,0.50,0.35,0.25,0.15,0.08]}
      bestStart={8}
      bestEnd={10}
    />
  </div>
</Showcase>
```

Also add "Statistik" to the sidebar navigation list (find the nav items array and add an entry).

- [ ] **Step 2: Verify in browser**

Run: `cd frontend && npm run dev`
Open: `http://localhost:3000/?view=components`
Navigate to "Statistik" section. All 4 widgets should render with mock data.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/ComponentViewer.jsx
git commit -m "feat(stats): add Statistik widgets to Component Viewer"
```

---

### Task 10: Build and Verify

- [ ] **Step 1: Run full build**

```bash
cd frontend && npm run build
```

Expected: Clean build, no warnings about unused imports.

- [ ] **Step 2: Test in dev server**

```bash
cd frontend && npm run dev
```

Open `http://localhost:3000`, navigate to Statistik tab. All widgets should render with mock data. Check:
- Trajectory chart renders with SVG curve
- Daily breakdown shows 3 categories with bar
- Year heatmap shows 365-day grid
- Time-of-day chart shows 24 bars
- Goal input dock appears at bottom
- KnowledgeHeatmap renders (may need deckData mock)
- No scrolling needed on standard screen
- Light mode: toggle theme and verify all widgets use CSS variables

- [ ] **Step 3: Verify Stapel tab**

Navigate to Stapel tab. Verify:
- No Heatmap toggle visible
- Deck list renders normally
- No console errors

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: Statistik page v1 — trajectory, daily breakdown, heatmap, time-of-day"
```
