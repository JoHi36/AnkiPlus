import { useMemo } from 'react';

// ─── Exported pure functions (tested directly) ──────────────────────────────

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

export function dampedHoltForecast(series, { steps = 90, alpha = 0.3, beta = 0.1, phi = 0.85 } = {}) {
  if (series.length < 2) {
    const base = series[0] || 0;
    return { forecast: Array(steps).fill(base), level: base, trend: 0, residualStd: 0 };
  }

  let level = series[0];
  let trend = series[1] - series[0];
  const residuals = [];

  for (let t = 1; t < series.length; t++) {
    const predicted = level + phi * trend;
    residuals.push(series[t] - predicted);
    const prevLevel = level;
    level = alpha * series[t] + (1 - alpha) * (level + phi * trend);
    trend = beta * (level - prevLevel) + (1 - beta) * phi * trend;
  }

  const residualStd = residuals.length > 1
    ? Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / residuals.length)
    : 1;

  const forecast = [];
  for (let h = 1; h <= steps; h++) {
    const phiSum = phi * (1 - Math.pow(phi, h)) / (1 - phi);
    const val = Math.min(100, Math.max(0, level + phiSum * trend));
    forecast.push(val);
  }

  return { forecast, level, trend, residualStd };
}

export function computeConsistencyBias(series) {
  if (series.length < 2) return 0.5;
  const mid = Math.floor(series.length / 2);
  let sumFirst = 0;
  for (let i = 0; i < mid; i++) sumFirst += series[i];
  let sumSecond = 0;
  for (let i = mid; i < series.length; i++) sumSecond += series[i];
  const firstMean = sumFirst / mid;
  const secondMean = sumSecond / (series.length - mid);
  const total = firstMean + secondMean;
  if (total === 0) return 0.5;
  return secondMean / total;
}

/**
 * Dynamik = Momentum × Konsistenz, normalized to 0–1.
 *
 * Momentum: slope of daily values over last 14 days (positive = accelerating).
 * Konsistenz: 1 - coefficient of variation (low variance = high consistency).
 *
 * @param {number[]} dailyValues - daily review counts or pct values (last 30+ days)
 * @returns {{ dynamik: number, momentum: number, konsistenz: number }}
 */
export function computeDynamik(dailyValues) {
  if (dailyValues.length < 4) return { dynamik: 0.5, momentum: 0.5, konsistenz: 0.5 };

  const recent = dailyValues.slice(-14);
  const n = recent.length;

  // Momentum: linear regression slope, normalized to 0–1
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += recent[i];
    sumXY += i * recent[i];
    sumX2 += i * i;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const meanY = sumY / n;
  // Normalize: slope relative to mean, clamped to -1..1, then mapped to 0..1
  const relSlope = meanY > 0 ? slope / meanY : 0;
  const momentum = Math.max(0, Math.min(1, 0.5 + relSlope * 5));

  // Konsistenz: 1 - coefficient of variation (σ/μ), clamped to 0..1
  const mean = sumY / n;
  if (mean === 0) return { dynamik: 0.5, momentum, konsistenz: 0.5 };
  let variance = 0;
  for (let i = 0; i < n; i++) variance += (recent[i] - mean) ** 2;
  const cv = Math.sqrt(variance / n) / mean; // 0 = perfect consistency
  const konsistenz = Math.max(0, Math.min(1, 1 - cv));

  // Dynamik: geometric mean of momentum and konsistenz
  const dynamik = Math.sqrt(momentum * konsistenz);

  return {
    dynamik: Math.round(dynamik * 100) / 100,
    momentum: Math.round(momentum * 100) / 100,
    konsistenz: Math.round(konsistenz * 100) / 100,
  };
}

// ─── Constants ───────────────────────────────────────────────────────────────

const VB_W = 800;
const VB_H = 160;
const CHART_PAD_TOP = 12;
const CHART_PAD_BOTTOM = 28;
const CHART_LEFT = 8;
const CHART_RIGHT = VB_W - 36;
const CHART_W = CHART_RIGHT - CHART_LEFT;
const CHART_H = VB_H - CHART_PAD_TOP - CHART_PAD_BOTTOM;

export const RANGE_PRESETS = {
  W: { pastDays: 7, futureDays: 7, smoothing: 3, bandScale: 0.8, label: 'W' },
  M: { pastDays: 30, futureDays: 30, smoothing: 10, bandScale: 1.2, label: 'M' },
  J: { pastDays: 90, futureDays: 90, smoothing: 21, bandScale: 2.0, label: 'J' },
};

// ─── Hook ────────────────────────────────────────────────────────────────────

export default function useTrajectoryModel({ days = [], currentPct = 0, totalCards = 0, range = 'M' }) {
  return useMemo(() => {
    const preset = RANGE_PRESETS[range] || RANGE_PRESETS.M;
    const { pastDays, futureDays, smoothing, bandScale } = preset;
    const totalDays = pastDays + futureDays;

    let pctSeries;
    if (days.length > 0 && days[0].mature_pct !== undefined) {
      pctSeries = days.map(d => d.mature_pct);
    } else {
      pctSeries = days.map((_, i) => {
        const startPct = Math.max(0, currentPct - 0.3 * (days.length - i));
        return Math.max(0, Math.min(100, startPct));
      });
    }

    const displaySeries = pctSeries.slice(-pastDays);
    const displayDays = days.slice(-pastDays);
    // Double-pass smoothing for extra clean curves
    const smoothed = movingAverage(movingAverage(displaySeries, smoothing), Math.ceil(smoothing / 2));

    const holt = dampedHoltForecast(pctSeries, {
      steps: futureDays,
      alpha: 0.3, beta: 0.1, phi: 0.85,
    });

    // Dynamik: combines Momentum + Konsistenz into one score
    const reviewCounts = days.slice(-30).map(d => d.review_count || 0);
    const { dynamik, momentum, konsistenz } = computeDynamik(reviewCounts);

    // Dynamik drives prediction position (replaces old consistency bias)
    const bias = 0.3 + dynamik * 0.4; // maps 0–1 → 0.3–0.7 (never extreme)

    // Prediction = pure Damped Holt. No decay modifier on the prediction line.
    // Holt already learned the trend from historical data (which includes real lapses).
    // Adding explicit decay would double-count.
    const forecastClean = holt.forecast;

    // Decay lives ONLY in the lower band edge (see band calculation below).
    // "What if you slow down?" → lower band bends down with Anki decay physics.
    // Half-life ~60 days: if you stop completely, ~50% of mature cards lapse in 60 days.
    const DECAY_HALF_LIFE = 60;

    const last7 = pctSeries.slice(-7);
    const pacePerDay = last7.length >= 2
      ? Math.max(0, (last7[last7.length - 1] - last7[0]) / (last7.length - 1))
      : 0;

    let phase = 'peak';
    if (currentPct < 30) phase = 'ramp';
    else if (currentPct > 70) phase = 'plateau';

    // Prediction line opacity: 0.3 (low dynamik) to 0.8 (high dynamik)
    const predictionOpacity = 0.3 + dynamik * 0.5;

    // Auto-scale Y-axis to visible data range with padding
    const bandWidthFn = (h) => h === 0 ? 0 : holt.residualStd * Math.sqrt(h / futureDays) * bandScale;
    const allVisiblePcts = [
      ...smoothed,
      ...forecastClean,
      ...forecastClean.map((p, i) => p + bandWidthFn(i + 1)),
      ...forecastClean.map((p, i) => {
        const h = i + 1;
        const decay = Math.exp(-Math.log(2) / DECAY_HALF_LIFE * h * (1 - dynamik));
        return p * decay - bandWidthFn(h);
      }),
    ];
    const dataMin = Math.min(...allVisiblePcts);
    const dataMax = Math.max(...allVisiblePcts);
    const dataRange = Math.max(dataMax - dataMin, 2); // at least 2% range
    const padding = dataRange * 0.2;
    const yMin = Math.max(0, Math.floor(dataMin - padding));
    const yMax = Math.min(100, Math.ceil(dataMax + padding));

    const pctToY = (pct) => CHART_PAD_TOP + CHART_H - ((pct - yMin) / (yMax - yMin)) * CHART_H;
    const dayToX = (dayIdx) => CHART_LEFT + (dayIdx / totalDays) * CHART_W;

    // Subsample for smoother Bézier curves (fewer, longer segments)
    const maxPastPoints = range === 'W' ? 7 : range === 'M' ? 12 : 15;
    const step = Math.max(1, Math.floor(smoothed.length / maxPastPoints));
    const sampledIndices = [];
    for (let i = 0; i < smoothed.length - 1; i += step) sampledIndices.push(i);
    sampledIndices.push(smoothed.length - 1); // always include last point

    // Past points: map so last point lands exactly on todayX (dayToX(pastDays))
    const pastCurve = sampledIndices.map(idx => ({
      x: dayToX(idx + 1),
      y: pctToY(smoothed[idx]),
      pct: Math.round(smoothed[idx] * 10) / 10,
      date: displayDays[idx]?.date || '',
    }));

    // All past points kept for hover lookup (not for rendering)
    const pastLookup = smoothed.map((pct, i) => ({
      x: dayToX(i + 1),
      y: pctToY(pct),
      pct: Math.round(pct * 10) / 10,
      date: displayDays[i]?.date || '',
    }));

    // Prediction starts at the last past curve point (no gap)
    const lastPastPct = smoothed[smoothed.length - 1] || currentPct;
    const predAll = [
      { pct: lastPastPct, h: 0 },
      ...forecastClean.map((pct, i) => ({ pct, h: i + 1 })),
    ];
    const maxPredPoints = range === 'W' ? 7 : range === 'M' ? 10 : 12;
    const predStep = Math.max(1, Math.floor(predAll.length / maxPredPoints));
    const predSampled = [];
    for (let i = 0; i < predAll.length - 1; i += predStep) predSampled.push(predAll[i]);
    predSampled.push(predAll[predAll.length - 1]);

    const bandWidth = (h) => h === 0 ? 0 : holt.residualStd * Math.sqrt(h / futureDays) * bandScale;

    const predictionLine = predSampled.map(({ pct, h }) => {
      const bandHalf = bandWidth(h);
      const biasShift = (bias - 0.5) * 2 * bandHalf;
      const shifted = Math.min(100, Math.max(0, pct + biasShift));
      return {
        x: dayToX(pastDays + h),
        y: pctToY(shifted),
        pct: Math.round(shifted * 10) / 10,
        date: '',
        dayOffset: h,
      };
    });

    // Prediction lookup (all points for hover)
    const predLookup = forecastClean.map((pct, i) => {
      const h = i + 1;
      const bh = bandWidth(h);
      const biasShift = (bias - 0.5) * 2 * bh;
      const shifted = Math.min(100, Math.max(0, pct + biasShift));
      return {
        x: dayToX(pastDays + h),
        y: pctToY(shifted),
        pct: Math.round(shifted * 10) / 10,
        dayOffset: h,
      };
    });

    // Band: upper = statistical uncertainty, lower = statistical + decay physics
    const upperBand = predAll.map(({ pct, h }) => {
      return { x: dayToX(pastDays + h), y: pctToY(Math.min(100, pct + bandWidth(h))) };
    });

    const lowerBand = predAll.map(({ pct, h }) => {
      // Lower band includes exponential decay: "what if you slow down?"
      // Decay multiplier: fraction of knowledge retained after h days of reduced activity
      // At full dynamik (1.0): no decay, band is symmetric
      // At zero dynamik (0.0): full decay with half-life ~60 days
      const decayFactor = h === 0 ? 1 : Math.exp(-Math.log(2) / DECAY_HALF_LIFE * h * (1 - dynamik));
      const decayedPct = pct * decayFactor;
      return { x: dayToX(pastDays + h), y: pctToY(Math.max(0, decayedPct - bandWidth(h))) };
    });

    return {
      pastCurve, pastLookup, predictionLine, predLookup, upperBand, lowerBand,
      dynamik, momentum, konsistenz, predictionOpacity,
      pacePerDay: Math.round(pacePerDay * 100) / 100,
      phase,
      yMin, yMax,
      viewBox: { w: VB_W, h: VB_H },
      chartArea: { left: CHART_LEFT, right: CHART_RIGHT, top: CHART_PAD_TOP, bottom: VB_H - CHART_PAD_BOTTOM, h: CHART_H },
      todayX: dayToX(pastDays),
      todayY: pastCurve.length > 0 ? pastCurve[pastCurve.length - 1].y : pctToY(currentPct),
    };
  }, [days, currentPct, totalCards, range]);
}
