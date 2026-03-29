# TrajectoryChart v2 — Adaptive Prediction with Confidence Band

**Date:** 2026-03-29
**Status:** Approved
**Scope:** `TrajectoryChart.jsx` (full rewrite), `useTrajectoryModel.js` (new hook), minor changes to `bridge_stats.py` and `useStatistikData.js`

---

## Summary

Rewrite the TrajectoryChart from a static synthetic curve into a data-driven, interactive chart with mathematically computed prediction, adaptive confidence band, and live hover interaction. The chart should feel "calculated, thoughtful, reliable" — every visual detail backed by real math.

## Visual Design

### Overall Style: Confidence Gradient

- **Past (left of today):** Solid accent-colored curve drawn from real daily data points (180 days). Subtle gradient fill underneath fading to transparent.
- **Today marker:** Vertical dashed line + accent dot with soft glow ring.
- **Future (right of today):** Fanning confidence band — starts narrow at today, widens toward the horizon. Two nested semi-transparent fills create depth (inner band = likely range, outer band = possible range).
- **Grid:** Minimal horizontal lines at 25/50/75% with `--ds-border-subtle`. No Y-axis labels. Month labels along X-axis.

### Prediction Line

The prediction line sits inside the confidence band. Its vertical position is **not centered** — it's weighted by the user's historical consistency.

**Adaptive Position (Consistency Score):**
- Computed from the last 30 days: how often did the user exceed vs. fall below their own rolling average growth rate?
- Result: a bias factor from 0.0 (always underperforms → line near bottom of band) to 1.0 (always overperforms → line near top of band). 0.5 = centered.
- Formula: `bias = days_above_average / total_active_days` (last 30 days)

**Curve Shape (Damped Holt):**
- The prediction is not a straight line. It follows a Damped Holt Exponential Smoothing model that naturally produces S-curve behavior:
  - **Low % (0-30%):** Curve bends upward — acceleration phase, many new cards available.
  - **Mid % (30-70%):** Nearly linear — peak growth velocity.
  - **High % (70-100%):** Curve flattens — saturation, approaching 100% ceiling asymptotically.
- Parameters: α = 0.3 (level smoothing), β = 0.1 (trend smoothing), φ = 0.85 (damping factor).
- The S-curve emerges from the math, not from a hardcoded shape.

**Visual Effects:**
1. **Living Pulse:** Subtle opacity animation (0.35 → 0.65 → 0.35, 3s cycle). The line "breathes," communicating that this is a live computation, not static.
2. **Gradient Fade:** The line's stroke opacity and width decrease from left to right — thicker/more opaque near today, thinner/more transparent toward the horizon. Communicates decreasing confidence.

### Confidence Band

- Width is computed from residual standard deviation: `band = ŷ ± z · σ_e · √(1 + h · c²)` where h = forecast steps and c is a scaling constant.
- Visually: two nested fills with decreasing opacity (outer ~4%, inner ~4%, total ~8% at overlap).
- **Key behavior:** An irregular learner (high σ_e) sees a wider band. A consistent learner sees a narrow band. This is mathematically honest — you see your own predictability.

### Hover Interaction: Header Value Swap

No tooltip. The header IS the display.

**Default state (no hover):**
```
Fortschritt                    42%
                          +0.3% / Tag
```

**Hover on past point:**
```
Fortschritt                  38.2%
                           14. Mär
```
- Header value swaps to the hovered date's percentage (white text).
- Subtitle shows the date.
- Vertical line + dot precisely on the curve.

**Hover on future point:**
```
Fortschritt                  51.4%
                      22. Apr (Prognose)
```
- Header value shows predicted percentage (accent-colored text to distinguish from real data).
- Subtitle shows date + "(Prognose)" label.
- Dot sits on the prediction line.

**Transitions:** Value changes use a 150ms ease for smooth number morphing. No jumpy swaps.

## Data Flow

### Backend (`bridge_stats.py`)

Already provides 180 days of daily data via `get_trajectory_data()`:
```python
{
  "days": [{"date": "2025-10-01", "review_count": 45, "new_count": 12}, ...],  # 180 entries
  "current_pct": 42.0,
  "avg_new_7d": 18.3,
  "total_cards": 2440,
  "mature_cards": 1240,
  "young_cards": 680
}
```

**New field needed:** Add `mature_pct` per day to the `days[]` array.

Implementation: query the revlog to reconstruct daily maturity snapshots. For each day, count cards that had `ivl >= 21` (mature) and `0 < ivl < 21` (young) at that point in time by looking at the last review interval before that date. Formula per day: `(mature + young * 0.5) / total * 100`. This is an approximation — Anki doesn't store daily card-state snapshots, so we reconstruct from the revlog's `lastIvl` column. Acceptable accuracy for a trend chart.

### Frontend Data Pipeline

```
bridge_stats.py → useStatistikData → useTrajectoryModel (NEW) → TrajectoryChart
```

**`useTrajectoryModel.js` (new hook):**

Input: `days[]` array (180 daily data points), `currentPct`, `totalCards`

Output:
```javascript
{
  pastCurve: [{x, y, pct, date}, ...],     // smoothed past points for SVG path
  predictionLine: [{x, y, pct, date}, ...], // damped Holt forecast points
  upperBand: [{x, y}, ...],                 // upper confidence boundary
  lowerBand: [{x, y}, ...],                 // lower confidence boundary
  consistencyBias: 0.72,                    // 0.0–1.0
  pacePerDay: 0.3,                          // current pace in %/day
  phase: 'peak',                            // 'ramp' | 'peak' | 'plateau'
}
```

**Damped Holt implementation** (runs in the hook, ~30 lines of math):
1. Convert daily `mature_pct` values to a time series.
2. Initialize level and trend from first two observations.
3. Iterate through all observations updating level/trend with smoothing.
4. Generate h-step forecast with damping: `ŷ_{t+h} = level + Σ(φ^i, i=1..h) · trend`
5. Compute residual σ for confidence band width.
6. Apply consistency bias to shift prediction within band.

**Past curve smoothing:**
- Use the real daily data points but apply a 7-day moving average to reduce noise.
- Draw the smoothed curve as a cubic Bézier SVG path (existing `buildCurve` helper works).

### SVG Rendering

The chart remains a pure SVG (no canvas, no charting library). Viewbox: `0 0 800 160`.

**Layers (bottom to top):**
1. Grid lines (25/50/75%)
2. Past gradient fill (under past curve)
3. Confidence band (two nested paths)
4. Past curve (solid stroke)
5. Prediction line (dashed stroke with gradient fade + pulse animation)
6. Today vertical line
7. Today dot (with glow ring)
8. Hover elements (vertical line + dot, hidden by default)
9. Month labels

**Hover hit detection:**
- Invisible rect covering the full chart area captures mousemove events.
- X position maps to a day index → look up the corresponding y-value from pastCurve or predictionLine.
- Dot is positioned at the exact (x, y) on the curve — no offset.

## Colors & Design System

All colors use `var(--ds-*)` tokens:
- Curve/dot/prediction: `var(--ds-accent)`
- Gradient fill: `var(--ds-accent)` at 12% → 0% opacity
- Confidence band: `var(--ds-accent)` at 4-5% opacity per layer
- Grid: `var(--ds-border-subtle)`
- Today line: `var(--ds-border-medium)`
- Header value: `var(--ds-text-primary)` (past hover), `var(--ds-accent)` (future hover)
- Month labels: `var(--ds-text-muted)`

No hardcoded hex values. Works in both dark and light mode.

## Component Structure

```
StatistikView.jsx
└── TrajectoryChart.jsx (rewritten)
    ├── useTrajectoryModel.js (new — all math lives here)
    └── SVG rendering + hover state (in component)
```

**Props (unchanged interface):**
```javascript
<TrajectoryChart
  days={trajectory.days}           // real daily data from bridge
  currentPct={trajectory.current_pct}
  totalCards={trajectory.total_cards}
  matureCards={trajectory.mature_cards}
  youngCards={trajectory.young_cards}
  avgNew7d={trajectory.avg_new_7d}
/>
```

## What's NOT Included

- **Phase colors** (purple/blue/green per phase): stays unified `--ds-accent`. The phase info exists in the model but is not visualized through color.
- **Goal markers** on the future line: removed from v2. The goal dock at the bottom of StatistikView handles goals separately.
- **Y-axis labels**: omitted for minimal look. Grid lines at 25/50/75% provide enough orientation.
- **Data scatter dots**: not shown (option B from brainstorming was rejected). The smoothed curve represents the past.
- **Touch/drag scrubbing**: hover only for v1. Touch could be added later for tablet use.

## Testing

- **Unit tests** for `useTrajectoryModel.js`: verify Damped Holt output against known inputs, consistency score calculation, band width behavior.
- **Visual testing**: Component Viewer entry with mock data at 25%, 50%, 80% to verify S-curve behavior across phases.
- **Dark + light mode**: verify all `var(--ds-*)` tokens render correctly in both themes.
- **Edge cases**: 0% (no cards learned), 100% (fully mature), <7 days of data (insufficient history for smoothing).

## Mockups

Interactive mockups from the brainstorming session are saved in:
`.superpowers/brainstorm/24974-1774810098/content/`
- `chart-style.html` — 4 style options (C selected: Confidence Gradient)
- `prediction-line.html` — adaptive bias scenarios + line effects (C selected: Living Pulse)
- `hover-interaction.html` — 3 hover variants (C selected: Header Value Swap)
- `s-curve-scenarios.html` — S-curve at 25/50/80% with Damped Holt formula
