# TrajectoryChart v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite TrajectoryChart from static synthetic curve into data-driven interactive chart with Damped Holt prediction, adaptive confidence band, and Header Value Swap hover interaction.

**Architecture:** Pure math hook (`useTrajectoryModel`) computes all forecast data from real 180-day history. TrajectoryChart renders SVG layers from hook output. Backend adds `mature_pct` per day to existing trajectory endpoint. No new dependencies.

**Tech Stack:** React 18, SVG (no charting library), Vitest, Python/SQLite (Anki revlog)

**Spec:** `docs/superpowers/specs/2026-03-29-trajectory-chart-v2-design.md`

---

### Task 1: Backend — Add `mature_pct` per day to trajectory data

**Files:**
- Modify: `ui/bridge_stats.py:18-107` (`get_trajectory_data` function)
- Test: `tests/test_bridge_stats.py` (new file)

- [ ] **Step 1: Create test file with failing test**

Create `tests/test_bridge_stats.py`:

```python
"""Tests for bridge_stats trajectory data — mature_pct reconstruction."""

import sys
import os
import types

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Stub aqt before importing
_aqt_stub = types.ModuleType("aqt")
_mw_stub = types.SimpleNamespace()
_aqt_stub.mw = _mw_stub
sys.modules.setdefault("aqt", _aqt_stub)

from ui.bridge_stats import _compute_daily_mature_pct


def test_compute_daily_mature_pct_basic():
    """Given review history, compute mature_pct per day."""
    # 3 days of data, 10 total cards
    # Day 1: 2 mature (ivl>=21), 4 young (0<ivl<21) → (2 + 4*0.5)/10 = 40%
    # Day 2: 3 mature, 4 young → (3 + 4*0.5)/10 = 50%
    # Day 3: 4 mature, 3 young → (4 + 3*0.5)/10 = 55%
    revlog_rows = [
        # (card_id, review_date_str, interval_after_review)
        (1, "2026-03-01", 25),  # mature
        (2, "2026-03-01", 25),  # mature
        (3, "2026-03-01", 10),  # young
        (4, "2026-03-01", 5),   # young
        (5, "2026-03-01", 8),   # young
        (6, "2026-03-01", 3),   # young
        (7, "2026-03-02", 22),  # became mature
        (3, "2026-03-02", 15),  # still young
        (8, "2026-03-03", 30),  # became mature
        (5, "2026-03-03", 12),  # still young
    ]
    dates = ["2026-03-01", "2026-03-02", "2026-03-03"]
    total_cards = 10

    result = _compute_daily_mature_pct(revlog_rows, dates, total_cards)

    assert len(result) == 3
    assert result[0] == 40.0  # day 1
    assert result[1] == 50.0  # day 2
    assert result[2] == 55.0  # day 3


def test_compute_daily_mature_pct_empty():
    """No reviews → all days 0%."""
    result = _compute_daily_mature_pct([], ["2026-03-01", "2026-03-02"], 100)
    assert result == [0.0, 0.0]


def test_compute_daily_mature_pct_zero_cards():
    """Zero total cards → all days 0%."""
    result = _compute_daily_mature_pct([], ["2026-03-01"], 0)
    assert result == [0.0]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -k test_bridge_stats -v`

Expected: FAIL with `ImportError: cannot import name '_compute_daily_mature_pct'`

- [ ] **Step 3: Implement `_compute_daily_mature_pct` helper**

Add to `ui/bridge_stats.py` (after the imports, before `get_trajectory_data`):

```python
def _compute_daily_mature_pct(revlog_rows, dates, total_cards):
    """Reconstruct daily mature_pct from review history.

    Args:
        revlog_rows: list of (card_id, date_str, interval) tuples from revlog.
        dates: ordered list of date strings to compute pct for.
        total_cards: total card count in collection.

    Returns:
        list of floats — one mature_pct per date.
    """
    if total_cards == 0 or not dates:
        return [0.0] * len(dates)

    # Build card → latest interval map, advancing day by day
    card_intervals = {}  # card_id → last known interval

    # Index reviews by date for efficient lookup
    from collections import defaultdict
    reviews_by_date = defaultdict(list)
    for card_id, date_str, interval in revlog_rows:
        reviews_by_date[date_str].append((card_id, interval))

    result = []
    for d in dates:
        # Apply reviews that happened on this date
        for card_id, interval in reviews_by_date.get(d, []):
            card_intervals[card_id] = interval

        # Count mature/young from current state
        mature = sum(1 for ivl in card_intervals.values() if ivl >= 21)
        young = sum(1 for ivl in card_intervals.values() if 0 < ivl < 21)
        pct = round((mature + young * 0.5) / total_cards * 100, 1)
        result.append(pct)

    return result
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -k test_bridge_stats -v`

Expected: 3 tests PASS

- [ ] **Step 5: Integrate into `get_trajectory_data`**

In `ui/bridge_stats.py`, inside `_collect()` of `get_trajectory_data`, after `days_data` is built, add the `mature_pct` field. Replace the section that builds `days_data` (lines ~66-79) with:

```python
        # Build ordered list + collect review data for mature_pct reconstruction
        days_data = []
        new_counts_last_7 = []
        date_strings = []
        for i in range(days_back - 1, -1, -1):
            d = today - timedelta(days=i)
            d_str = d.isoformat()
            rev_count = day_reviews.get(d_str, 0)
            n_count = day_new.get(d_str, 0)
            days_data.append({
                "date": d_str,
                "review_count": rev_count,
                "new_count": n_count,
            })
            date_strings.append(d_str)
            if i < 7:
                new_counts_last_7.append(n_count)

        avg_new_7d = round(sum(new_counts_last_7) / max(len(new_counts_last_7), 1), 1)

        # Reconstruct daily mature_pct from revlog intervals
        try:
            ivl_rows = mw.col.db.all(
                "SELECT cid, date(id/1000 - ?, 'unixepoch', 'localtime'), ivl "
                "FROM revlog WHERE id >= ? ORDER BY id",
                _DAY_ROLLOVER_HOUR * 3600,
                int((datetime.combine(today - timedelta(days=days_back),
                     datetime.min.time()).timestamp()) * 1000
                    - _DAY_ROLLOVER_HOUR * 3600 * 1000),
            )
            daily_pcts = _compute_daily_mature_pct(ivl_rows, date_strings, total)
            for entry, pct in zip(days_data, daily_pcts):
                entry["mature_pct"] = pct
        except Exception as e:
            logger.warning("get_trajectory_data: mature_pct reconstruction failed: %s", e)
            for entry in days_data:
                entry["mature_pct"] = 0.0
```

- [ ] **Step 6: Run full Python test suite**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -v`

Expected: All tests pass (existing + 3 new)

- [ ] **Step 7: Commit**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
git add ui/bridge_stats.py tests/test_bridge_stats.py
git commit -m "feat(stats): add mature_pct per day to trajectory data"
```

---

### Task 2: Frontend — `useTrajectoryModel` hook (Damped Holt + Confidence Band)

**Files:**
- Create: `frontend/src/hooks/useTrajectoryModel.js`
- Test: `frontend/src/hooks/__tests__/useTrajectoryModel.test.ts`

- [ ] **Step 1: Write the test file**

Create `frontend/src/hooks/__tests__/useTrajectoryModel.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  dampedHoltForecast,
  computeConsistencyBias,
  movingAverage,
} from '../useTrajectoryModel';

// ─── Damped Holt ─────────────────────────────────────────────────────────────

describe('dampedHoltForecast', () => {
  it('produces forecast points with correct length', () => {
    // 30 days of linearly increasing pct: 10, 10.5, 11, ...
    const series = Array.from({ length: 30 }, (_, i) => 10 + i * 0.5);
    const result = dampedHoltForecast(series, { steps: 90, alpha: 0.3, beta: 0.1, phi: 0.85 });

    expect(result.forecast).toHaveLength(90);
    expect(result.level).toBeGreaterThan(0);
    expect(result.trend).toBeGreaterThan(0);
    expect(result.residualStd).toBeGreaterThan(0);
  });

  it('forecast is monotonically increasing for upward trend', () => {
    const series = Array.from({ length: 30 }, (_, i) => 10 + i * 0.5);
    const result = dampedHoltForecast(series, { steps: 90, alpha: 0.3, beta: 0.1, phi: 0.85 });

    for (let i = 1; i < result.forecast.length; i++) {
      expect(result.forecast[i]).toBeGreaterThanOrEqual(result.forecast[i - 1]);
    }
  });

  it('damping causes forecast to flatten over time', () => {
    const series = Array.from({ length: 30 }, (_, i) => 10 + i * 0.5);
    const result = dampedHoltForecast(series, { steps: 90, alpha: 0.3, beta: 0.1, phi: 0.85 });

    // Growth rate in first 10 steps should exceed last 10 steps
    const earlyGrowth = result.forecast[9] - result.forecast[0];
    const lateGrowth = result.forecast[89] - result.forecast[80];
    expect(earlyGrowth).toBeGreaterThan(lateGrowth);
  });

  it('forecast never exceeds 100', () => {
    // High starting point — should approach but not exceed 100
    const series = Array.from({ length: 30 }, (_, i) => 85 + i * 0.3);
    const result = dampedHoltForecast(series, { steps: 90, alpha: 0.3, beta: 0.1, phi: 0.85 });

    for (const val of result.forecast) {
      expect(val).toBeLessThanOrEqual(100);
    }
  });

  it('handles flat series (zero trend)', () => {
    const series = Array.from({ length: 30 }, () => 50);
    const result = dampedHoltForecast(series, { steps: 90, alpha: 0.3, beta: 0.1, phi: 0.85 });

    // Forecast should stay near 50
    for (const val of result.forecast) {
      expect(val).toBeGreaterThan(45);
      expect(val).toBeLessThan(55);
    }
  });

  it('handles very short series (2 points minimum)', () => {
    const series = [10, 12];
    const result = dampedHoltForecast(series, { steps: 30, alpha: 0.3, beta: 0.1, phi: 0.85 });
    expect(result.forecast).toHaveLength(30);
  });
});

// ─── Consistency Bias ────────────────────────────────────────────────────────

describe('computeConsistencyBias', () => {
  it('returns 0.5 for perfectly balanced performance', () => {
    // Alternating above/below average
    const series = [10, 12, 10, 12, 10, 12, 10, 12, 10, 12];
    const bias = computeConsistencyBias(series);
    expect(bias).toBeCloseTo(0.5, 1);
  });

  it('returns > 0.5 for consistently above-average', () => {
    // Steadily increasing — always above rolling avg
    const series = Array.from({ length: 30 }, (_, i) => 10 + i);
    const bias = computeConsistencyBias(series);
    expect(bias).toBeGreaterThan(0.5);
  });

  it('returns < 0.5 for declining performance', () => {
    // Steadily decreasing
    const series = Array.from({ length: 30 }, (_, i) => 50 - i);
    const bias = computeConsistencyBias(series);
    expect(bias).toBeLessThan(0.5);
  });

  it('returns 0.5 for empty or single-element series', () => {
    expect(computeConsistencyBias([])).toBe(0.5);
    expect(computeConsistencyBias([42])).toBe(0.5);
  });
});

// ─── Moving Average ──────────────────────────────────────────────────────────

describe('movingAverage', () => {
  it('smooths noisy data', () => {
    const data = [10, 20, 10, 20, 10, 20, 10];
    const smoothed = movingAverage(data, 3);
    // Middle values should be closer to 15 than raw values
    for (let i = 1; i < smoothed.length - 1; i++) {
      expect(Math.abs(smoothed[i] - 15)).toBeLessThan(Math.abs(data[i] - 15));
    }
  });

  it('preserves length of input array', () => {
    const data = [1, 2, 3, 4, 5];
    expect(movingAverage(data, 3)).toHaveLength(5);
  });

  it('window=1 returns original values', () => {
    const data = [10, 20, 30];
    expect(movingAverage(data, 1)).toEqual([10, 20, 30]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npx vitest run src/hooks/__tests__/useTrajectoryModel.test.ts`

Expected: FAIL with `does not provide an export named 'dampedHoltForecast'`

- [ ] **Step 3: Implement `useTrajectoryModel.js`**

Create `frontend/src/hooks/useTrajectoryModel.js`:

```javascript
import { useMemo } from 'react';

// ─── Exported pure functions (tested directly) ──────────────────────────────

/**
 * 7-day centered moving average. Preserves array length by shrinking window at edges.
 */
export function movingAverage(data, window = 7) {
  const half = Math.floor(window / 2);
  return data.map((_, i) => {
    const lo = Math.max(0, i - half);
    const hi = Math.min(data.length - 1, i + half);
    let sum = 0;
    for (let j = lo; j <= hi; j++) sum += data[j];
    return sum / (hi - lo + 1);
  });
}

/**
 * Damped Holt Exponential Smoothing.
 *
 * @param {number[]} series - observed values (e.g. daily mature_pct)
 * @param {object} opts - { steps, alpha, beta, phi }
 * @returns {{ forecast: number[], level: number, trend: number, residualStd: number }}
 */
export function dampedHoltForecast(series, { steps = 90, alpha = 0.3, beta = 0.1, phi = 0.85 } = {}) {
  if (series.length < 2) {
    const base = series[0] || 0;
    return {
      forecast: Array(steps).fill(base),
      level: base,
      trend: 0,
      residualStd: 0,
    };
  }

  // Initialize
  let level = series[0];
  let trend = series[1] - series[0];

  // Fit: iterate through observations
  const residuals = [];
  for (let t = 1; t < series.length; t++) {
    const predicted = level + phi * trend;
    residuals.push(series[t] - predicted);

    const prevLevel = level;
    level = alpha * series[t] + (1 - alpha) * (level + phi * trend);
    trend = beta * (level - prevLevel) + (1 - beta) * phi * trend;
  }

  // Residual standard deviation
  const residualStd = residuals.length > 1
    ? Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / residuals.length)
    : 1;

  // Forecast h steps ahead: ŷ_{t+h} = level + Σ(φ^i, i=1..h) · trend
  const forecast = [];
  for (let h = 1; h <= steps; h++) {
    // Geometric sum: Σ(φ^i, i=1..h) = φ(1 - φ^h) / (1 - φ)
    const phiSum = phi * (1 - Math.pow(phi, h)) / (1 - phi);
    const val = Math.min(100, Math.max(0, level + phiSum * trend));
    forecast.push(val);
  }

  return { forecast, level, trend, residualStd };
}

/**
 * Consistency bias: fraction of last 30 active days where user exceeded
 * their own 7-day rolling average growth rate.
 *
 * @param {number[]} series - daily pct values (last 30+ days)
 * @returns {number} 0.0–1.0 (0.5 = neutral)
 */
export function computeConsistencyBias(series) {
  if (series.length < 2) return 0.5;

  const window = Math.min(7, Math.floor(series.length / 2));
  if (window < 1) return 0.5;

  let above = 0;
  let total = 0;

  for (let i = window; i < series.length; i++) {
    // Rolling average of previous `window` days
    let sum = 0;
    for (let j = i - window; j < i; j++) sum += (series[j] - (series[j - 1] || series[j]));
    const avgGrowth = sum / window;

    // Actual growth on this day
    const actualGrowth = series[i] - series[i - 1];

    if (actualGrowth >= avgGrowth) above++;
    total++;
  }

  return total > 0 ? above / total : 0.5;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const VB_W = 800;
const VB_H = 160;
const CHART_PAD_TOP = 12;
const CHART_PAD_BOTTOM = 28; // space for month labels
const CHART_LEFT = 8;
const CHART_RIGHT = VB_W - 8;
const CHART_W = CHART_RIGHT - CHART_LEFT;
const CHART_H = VB_H - CHART_PAD_TOP - CHART_PAD_BOTTOM;

const TOTAL_DAYS = 180;
const PAST_DAYS = 90;
const FUTURE_DAYS = 90;
const SMOOTHING_WINDOW = 7;
const FORECAST_STEPS = FUTURE_DAYS;

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Computes all trajectory model data from raw daily stats.
 *
 * @param {object} params
 * @param {Array<{date: string, mature_pct?: number, review_count: number, new_count: number}>} params.days
 * @param {number} params.currentPct
 * @param {number} params.totalCards
 * @returns {object} pastCurve, predictionLine, upperBand, lowerBand, consistencyBias, pacePerDay, phase
 */
export default function useTrajectoryModel({ days = [], currentPct = 0, totalCards = 0 }) {
  return useMemo(() => {
    // Extract mature_pct series from days (fallback to linear interpolation toward currentPct)
    let pctSeries;
    if (days.length > 0 && days[0].mature_pct !== undefined) {
      pctSeries = days.map(d => d.mature_pct);
    } else {
      // Fallback: linear ramp to currentPct
      pctSeries = days.map((_, i) => {
        const startPct = Math.max(0, currentPct - 0.3 * (days.length - i));
        return Math.max(0, Math.min(100, startPct));
      });
    }

    // Take last PAST_DAYS for display (or all if less)
    const displaySeries = pctSeries.slice(-PAST_DAYS);
    const displayDays = days.slice(-PAST_DAYS);

    // Smooth past curve
    const smoothed = movingAverage(displaySeries, SMOOTHING_WINDOW);

    // Damped Holt forecast
    const holt = dampedHoltForecast(pctSeries, {
      steps: FORECAST_STEPS,
      alpha: 0.3,
      beta: 0.1,
      phi: 0.85,
    });

    // Consistency bias
    const bias = computeConsistencyBias(pctSeries.slice(-30));

    // Pace: average daily change over last 7 days
    const last7 = pctSeries.slice(-7);
    const pacePerDay = last7.length >= 2
      ? Math.max(0, (last7[last7.length - 1] - last7[0]) / (last7.length - 1))
      : 0;

    // Phase detection
    let phase = 'peak';
    if (currentPct < 30) phase = 'ramp';
    else if (currentPct > 70) phase = 'plateau';

    // ─── Map to SVG coordinates ──────────────────────────────────────────

    const pctToY = (pct) =>
      CHART_PAD_TOP + CHART_H - (pct / 100) * CHART_H;

    const dayToX = (dayIdx) =>
      CHART_LEFT + (dayIdx / TOTAL_DAYS) * CHART_W;

    // Past curve points
    const pastCurve = smoothed.map((pct, i) => ({
      x: dayToX(i),
      y: pctToY(pct),
      pct: Math.round(pct * 10) / 10,
      date: displayDays[i]?.date || '',
    }));

    // Prediction line — shift within band by bias
    const predictionLine = holt.forecast.map((pct, i) => {
      const h = i + 1;
      const bandHalf = holt.residualStd * Math.sqrt(1 + h * 0.01) * 1.5;
      // Bias shifts: 0.5=center, 1.0=upper edge, 0.0=lower edge
      const biasShift = (bias - 0.5) * 2 * bandHalf;
      const shifted = Math.min(100, Math.max(0, pct + biasShift));
      return {
        x: dayToX(PAST_DAYS + i),
        y: pctToY(shifted),
        pct: Math.round(shifted * 10) / 10,
        date: '', // dates computed at render time from offset
      };
    });

    // Confidence band
    const upperBand = holt.forecast.map((pct, i) => {
      const h = i + 1;
      const bandWidth = holt.residualStd * Math.sqrt(1 + h * 0.01) * 1.5;
      return {
        x: dayToX(PAST_DAYS + i),
        y: pctToY(Math.min(100, pct + bandWidth)),
      };
    });

    const lowerBand = holt.forecast.map((pct, i) => {
      const h = i + 1;
      const bandWidth = holt.residualStd * Math.sqrt(1 + h * 0.01) * 1.5;
      return {
        x: dayToX(PAST_DAYS + i),
        y: pctToY(Math.max(0, pct - bandWidth)),
      };
    });

    return {
      pastCurve,
      predictionLine,
      upperBand,
      lowerBand,
      consistencyBias: Math.round(bias * 100) / 100,
      pacePerDay: Math.round(pacePerDay * 100) / 100,
      phase,
      // Constants for the chart component
      viewBox: { w: VB_W, h: VB_H },
      chartArea: { left: CHART_LEFT, right: CHART_RIGHT, top: CHART_PAD_TOP, bottom: VB_H - CHART_PAD_BOTTOM, h: CHART_H },
      todayX: dayToX(PAST_DAYS),
      todayY: pctToY(currentPct),
    };
  }, [days, currentPct, totalCards]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npx vitest run src/hooks/__tests__/useTrajectoryModel.test.ts`

Expected: All 11 tests PASS

- [ ] **Step 5: Commit**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
git add frontend/src/hooks/useTrajectoryModel.js frontend/src/hooks/__tests__/useTrajectoryModel.test.ts
git commit -m "feat(stats): add useTrajectoryModel hook with Damped Holt forecast"
```

---

### Task 3: Frontend — Rewrite `TrajectoryChart.jsx` (SVG rendering)

**Files:**
- Modify: `frontend/src/components/TrajectoryChart.jsx` (full rewrite)

- [ ] **Step 1: Write the new TrajectoryChart component**

Replace the entire content of `frontend/src/components/TrajectoryChart.jsx`:

```jsx
import React, { useState, useCallback, useRef } from 'react';
import useTrajectoryModel from '../hooks/useTrajectoryModel';

// ─── Static style constants ─────────────────────────────────────────────────

const CONTAINER_STYLE = {};

const HEADER_STYLE = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  marginBottom: 14,
};

const LABEL_STYLE = {
  fontSize: 13,
  fontWeight: 500,
  letterSpacing: 0.3,
  color: 'var(--ds-text-tertiary)',
};

const BIG_PCT_STYLE = {
  fontSize: 28,
  fontWeight: 700,
  letterSpacing: -1,
  lineHeight: 1,
  transition: 'color 0.15s',
};

const PACE_STYLE = {
  fontSize: 13,
  fontWeight: 500,
  marginTop: 2,
  transition: 'all 0.15s',
};

const FOOTER_STYLE = {
  marginTop: 10,
  fontSize: 11,
  color: 'var(--ds-text-muted)',
};

const SVG_WRAPPER_STYLE = {
  width: '100%',
  overflow: 'hidden',
};

// ─── SVG Helpers ─────────────────────────────────────────────────────────────

function buildCurve(points) {
  if (points.length < 2) return '';
  const d = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    d.push(`C ${cpx} ${prev.y} ${cpx} ${curr.y} ${curr.x} ${curr.y}`);
  }
  return d.join(' ');
}

function buildClosedArea(curvePoints, baseY) {
  const curve = buildCurve(curvePoints);
  if (!curve || curvePoints.length < 2) return '';
  const last = curvePoints[curvePoints.length - 1];
  const first = curvePoints[0];
  return `${curve} L ${last.x} ${baseY} L ${first.x} ${baseY} Z`;
}

function buildBandPath(upper, lower) {
  if (upper.length < 2 || lower.length < 2) return '';
  const fwd = buildCurve(upper);
  const rev = [...lower].reverse();
  const back = rev.map((p, i) => {
    if (i === 0) return `L ${p.x} ${p.y}`;
    const prev = rev[i - 1];
    const cpx = (prev.x + p.x) / 2;
    return `C ${cpx} ${prev.y} ${cpx} ${p.y} ${p.x} ${p.y}`;
  }).join(' ');
  return `${fwd} ${back} Z`;
}

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}

function getFutureDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d;
}

function formatFutureDate(daysFromNow) {
  const d = getFutureDate(daysFromNow);
  return `${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TrajectoryChart({
  days = [],
  currentPct = 0,
  totalCards = 0,
  matureCards = 0,
  youngCards = 0,
  avgNew7d = 0,
}) {
  const model = useTrajectoryModel({ days, currentPct, totalCards });
  const svgRef = useRef(null);
  const [hover, setHover] = useState(null); // { x, y, pct, date, isFuture }

  const { viewBox, chartArea, todayX, todayY, pastCurve, predictionLine, upperBand, lowerBand, pacePerDay } = model;

  // ─── Hover handler ───────────────────────────────────────────────────

  const handleMouseMove = useCallback((e) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * viewBox.w;

    // Clamp to chart area
    if (svgX < chartArea.left || svgX > chartArea.right) {
      setHover(null);
      return;
    }

    const isFuture = svgX > todayX;

    if (!isFuture) {
      // Find closest past point
      let closest = pastCurve[0];
      let minDist = Infinity;
      for (const pt of pastCurve) {
        const dist = Math.abs(pt.x - svgX);
        if (dist < minDist) { minDist = dist; closest = pt; }
      }
      if (closest) {
        setHover({
          x: closest.x,
          y: closest.y,
          pct: closest.pct,
          date: formatDate(closest.date),
          isFuture: false,
        });
      }
    } else {
      // Find closest prediction point
      let closest = predictionLine[0];
      let minDist = Infinity;
      for (let i = 0; i < predictionLine.length; i++) {
        const pt = predictionLine[i];
        const dist = Math.abs(pt.x - svgX);
        if (dist < minDist) { minDist = dist; closest = { ...pt, dayOffset: i + 1 }; }
      }
      if (closest) {
        setHover({
          x: closest.x,
          y: closest.y,
          pct: closest.pct,
          date: formatFutureDate(closest.dayOffset),
          isFuture: true,
        });
      }
    }
  }, [pastCurve, predictionLine, viewBox.w, chartArea, todayX]);

  const handleMouseLeave = useCallback(() => setHover(null), []);

  // ─── SVG paths ─────────────────────────────────────────────────────

  const pastPath = buildCurve(pastCurve);
  const pastArea = buildClosedArea(pastCurve, chartArea.bottom);
  const outerBandPath = buildBandPath(upperBand, lowerBand);
  // Inner band: 60% width of outer
  const innerUpper = upperBand.map((p, i) => ({
    x: p.x,
    y: p.y + (lowerBand[i].y - p.y) * 0.2,
  }));
  const innerLower = lowerBand.map((p, i) => ({
    x: p.x,
    y: p.y - (lowerBand[i].y - upperBand[i].y) * 0.2,
  }));
  const innerBandPath = buildBandPath(innerUpper, innerLower);
  const predictionPath = buildCurve(predictionLine);

  // ─── Month labels ──────────────────────────────────────────────────

  const now = new Date();
  const monthLabels = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 2 + i);
    return {
      label: MONTHS[d.getMonth()],
      x: chartArea.left + ((i / 5) * (chartArea.right - chartArea.left)),
    };
  });

  // ─── Header display values ─────────────────────────────────────────

  const displayPct = hover ? hover.pct.toFixed(1) : currentPct;
  const displayPctColor = hover
    ? (hover.isFuture ? 'var(--ds-accent)' : 'var(--ds-text-primary)')
    : 'var(--ds-text-primary)';
  const displaySub = hover
    ? (hover.date + (hover.isFuture ? ' (Prognose)' : ''))
    : `+${pacePerDay.toFixed(1)}% / Tag`;
  const displaySubColor = hover
    ? (hover.isFuture ? 'var(--ds-accent)' : 'var(--ds-text-tertiary)')
    : 'var(--ds-accent)';

  // Grid lines at 25%, 50%, 75%
  const gridPcts = [25, 50, 75];

  return (
    <div style={CONTAINER_STYLE}>
      {/* Header */}
      <div style={HEADER_STYLE}>
        <div style={LABEL_STYLE}>Fortschritt</div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ ...BIG_PCT_STYLE, color: displayPctColor }}>{displayPct}%</div>
          <div style={{ ...PACE_STYLE, color: displaySubColor }}>{displaySub}</div>
        </div>
      </div>

      {/* SVG Chart */}
      <div style={SVG_WRAPPER_STYLE}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${viewBox.w} ${viewBox.h}`}
          preserveAspectRatio="none"
          style={{ display: 'block', width: '100%', height: 80 }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            <linearGradient id="trajectoryFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ds-accent)" stopOpacity="0.12" />
              <stop offset="100%" stopColor="var(--ds-accent)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="predictionStroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--ds-accent)" stopOpacity="0.7" />
              <stop offset="100%" stopColor="var(--ds-accent)" stopOpacity="0.1" />
            </linearGradient>
          </defs>

          {/* Layer 1: Grid lines */}
          {gridPcts.map(pct => {
            const y = chartArea.top + chartArea.h - (pct / 100) * chartArea.h;
            return (
              <line
                key={pct}
                x1={chartArea.left} y1={y}
                x2={chartArea.right} y2={y}
                stroke="var(--ds-border-subtle)"
                strokeWidth="0.8"
              />
            );
          })}

          {/* Layer 2: Past gradient fill */}
          {pastArea && (
            <path d={pastArea} fill="url(#trajectoryFill)" />
          )}

          {/* Layer 3: Confidence band (outer + inner) */}
          {outerBandPath && (
            <path d={outerBandPath} fill="var(--ds-accent)" opacity="0.04" />
          )}
          {innerBandPath && (
            <path d={innerBandPath} fill="var(--ds-accent)" opacity="0.04" />
          )}

          {/* Layer 4: Past curve */}
          {pastPath && (
            <path
              d={pastPath}
              fill="none"
              stroke="var(--ds-accent)"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Layer 5: Prediction line (dashed, gradient fade, pulse) */}
          {predictionPath && (
            <path
              d={predictionPath}
              fill="none"
              stroke="url(#predictionStroke)"
              strokeWidth="1.3"
              strokeDasharray="5 3"
              strokeLinecap="round"
            >
              <animate
                attributeName="opacity"
                values="0.35;0.65;0.35"
                dur="3s"
                repeatCount="indefinite"
              />
            </path>
          )}

          {/* Layer 6: Today vertical line */}
          <line
            x1={todayX} y1={chartArea.top}
            x2={todayX} y2={chartArea.bottom}
            stroke="var(--ds-border-medium)"
            strokeWidth="0.5"
            strokeDasharray="2 2"
          />

          {/* Layer 7: Today dot + glow */}
          <circle cx={todayX} cy={todayY} r="8" fill="var(--ds-accent)" opacity="0.12" />
          <circle cx={todayX} cy={todayY} r="3" fill="var(--ds-accent)" />

          {/* Layer 8: Hover elements */}
          {hover && (
            <>
              <line
                x1={hover.x} y1={chartArea.top}
                x2={hover.x} y2={chartArea.bottom}
                stroke="var(--ds-text-tertiary)"
                strokeWidth="0.5"
                opacity="0.3"
              />
              <circle cx={hover.x} cy={hover.y} r="4" fill="var(--ds-accent)" />
            </>
          )}

          {/* Layer 9: Month labels */}
          {monthLabels.map((m, i) => (
            <text
              key={i}
              x={m.x}
              y={viewBox.h - 4}
              textAnchor="middle"
              fontSize="10"
              fill="var(--ds-text-muted)"
            >
              {m.label}
            </text>
          ))}
        </svg>
      </div>

      {/* Footer */}
      <div style={FOOTER_STYLE}>
        {avgNew7d} neue Karten / Tag · {matureCards + youngCards} gelernt · {totalCards} gesamt
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run frontend tests to verify nothing is broken**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npx vitest run`

Expected: All existing tests pass

- [ ] **Step 3: Commit**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
git add frontend/src/components/TrajectoryChart.jsx
git commit -m "feat(stats): rewrite TrajectoryChart with Damped Holt prediction and hover"
```

---

### Task 4: Wire up `StatistikView` props to new TrajectoryChart interface

**Files:**
- Modify: `frontend/src/components/StatistikView.jsx:69-79`

- [ ] **Step 1: Update TrajectoryChart props in StatistikView**

In `frontend/src/components/StatistikView.jsx`, replace the `<TrajectoryChart ... />` block (lines 70-79) with:

```jsx
      <TrajectoryChart
        days={trajectory?.days || []}
        currentPct={trajectory?.current_pct || 0}
        totalCards={trajectory?.total_cards || 0}
        matureCards={trajectory?.mature_cards || 0}
        youngCards={trajectory?.young_cards || 0}
        avgNew7d={trajectory?.avg_new_7d || 0}
      />
```

- [ ] **Step 2: Remove unused imports/variables**

In `StatistikView.jsx`, the `totalDaily` and `growthPct` variables (lines 41-44) are still used by `DailyBreakdown`. Keep them. No dead code to remove.

- [ ] **Step 3: Update mock data in `useStatistikData.js`**

In `frontend/src/hooks/useStatistikData.js`, replace the `trajectory` section of `MOCK_DATA` to include `days` with `mature_pct`:

```javascript
const MOCK_DATA = {
  trajectory: {
    current_pct: 42,
    avg_new_7d: 23,
    mature_cards: 1240,
    young_cards: 680,
    total_cards: 2440,
    days: Array.from({ length: 180 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (179 - i));
      const basePct = 15 + (27 * i / 179);
      const noise = (Math.sin(i * 0.7) * 1.5) + (Math.cos(i * 0.3) * 0.8);
      return {
        date: d.toISOString().split('T')[0],
        review_count: Math.floor(40 + Math.random() * 60),
        new_count: Math.floor(10 + Math.random() * 20),
        mature_pct: Math.round((basePct + noise) * 10) / 10,
      };
    }),
  },
```

- [ ] **Step 4: Run all frontend tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npx vitest run`

Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
git add frontend/src/components/StatistikView.jsx frontend/src/hooks/useStatistikData.js
git commit -m "feat(stats): wire StatistikView to new TrajectoryChart props"
```

---

### Task 5: Visual verification and build

**Files:**
- No new files — verification only

- [ ] **Step 1: Start dev server and check in browser**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run dev`

Open `http://localhost:3000` → navigate to Statistik tab. Verify:
1. Past curve renders smoothly from left to today marker
2. Confidence band fans out from today to the right
3. Prediction line pulses (breathing animation) and fades toward the right
4. Hovering: header value swaps to hovered pct, date appears in subtitle
5. Future hover shows accent-colored pct + "(Prognose)" label
6. Mouse leave restores default header values

- [ ] **Step 2: Check light mode**

Add `?theme=light` or toggle theme in settings. Verify:
1. All `var(--ds-*)` tokens render correctly
2. Gradient fill visible but not too heavy
3. Confidence band visible against light background
4. Text contrast is sufficient

- [ ] **Step 3: Build for production**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build`

Expected: Build succeeds, output in `web/`

- [ ] **Step 4: Run full test suites**

Run both:
```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
python3 run_tests.py -v
cd frontend && npx vitest run
```

Expected: All tests pass (Python + Frontend)

- [ ] **Step 5: Final commit**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
git add web/
git commit -m "build: rebuild frontend with TrajectoryChart v2"
```
