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
  const window = Math.min(7, Math.floor(series.length / 2));
  if (window < 1) return 0.5;

  // Compare the mean of the second half to the mean of the first half.
  // bias = secondMean / (firstMean + secondMean)
  // Rising: second > first → bias > 0.5
  // Declining: second < first → bias < 0.5
  // Balanced oscillating: second ≈ first → bias ≈ 0.5
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

// ─── Constants ───────────────────────────────────────────────────────────────

const VB_W = 800;
const VB_H = 160;
const CHART_PAD_TOP = 12;
const CHART_PAD_BOTTOM = 28;
const CHART_LEFT = 8;
const CHART_RIGHT = VB_W - 8;
const CHART_W = CHART_RIGHT - CHART_LEFT;
const CHART_H = VB_H - CHART_PAD_TOP - CHART_PAD_BOTTOM;
const PAST_DAYS = 90;
const FUTURE_DAYS = 90;
const TOTAL_DAYS = PAST_DAYS + FUTURE_DAYS;
const SMOOTHING_WINDOW = 7;

// ─── Hook ────────────────────────────────────────────────────────────────────

export default function useTrajectoryModel({ days = [], currentPct = 0, totalCards = 0 }) {
  return useMemo(() => {
    let pctSeries;
    if (days.length > 0 && days[0].mature_pct !== undefined) {
      pctSeries = days.map(d => d.mature_pct);
    } else {
      pctSeries = days.map((_, i) => {
        const startPct = Math.max(0, currentPct - 0.3 * (days.length - i));
        return Math.max(0, Math.min(100, startPct));
      });
    }

    const displaySeries = pctSeries.slice(-PAST_DAYS);
    const displayDays = days.slice(-PAST_DAYS);
    const smoothed = movingAverage(displaySeries, SMOOTHING_WINDOW);

    const holt = dampedHoltForecast(pctSeries, {
      steps: FUTURE_DAYS,
      alpha: 0.3, beta: 0.1, phi: 0.85,
    });

    const bias = computeConsistencyBias(pctSeries.slice(-30));

    const last7 = pctSeries.slice(-7);
    const pacePerDay = last7.length >= 2
      ? Math.max(0, (last7[last7.length - 1] - last7[0]) / (last7.length - 1))
      : 0;

    let phase = 'peak';
    if (currentPct < 30) phase = 'ramp';
    else if (currentPct > 70) phase = 'plateau';

    const pctToY = (pct) => CHART_PAD_TOP + CHART_H - (pct / 100) * CHART_H;
    const dayToX = (dayIdx) => CHART_LEFT + (dayIdx / TOTAL_DAYS) * CHART_W;

    const pastCurve = smoothed.map((pct, i) => ({
      x: dayToX(i),
      y: pctToY(pct),
      pct: Math.round(pct * 10) / 10,
      date: displayDays[i]?.date || '',
    }));

    const predictionLine = holt.forecast.map((pct, i) => {
      const h = i + 1;
      const bandHalf = holt.residualStd * Math.sqrt(1 + h * 0.01) * 1.5;
      const biasShift = (bias - 0.5) * 2 * bandHalf;
      const shifted = Math.min(100, Math.max(0, pct + biasShift));
      return {
        x: dayToX(PAST_DAYS + i),
        y: pctToY(shifted),
        pct: Math.round(shifted * 10) / 10,
        date: '',
      };
    });

    const upperBand = holt.forecast.map((pct, i) => {
      const h = i + 1;
      const bandWidth = holt.residualStd * Math.sqrt(1 + h * 0.01) * 1.5;
      return { x: dayToX(PAST_DAYS + i), y: pctToY(Math.min(100, pct + bandWidth)) };
    });

    const lowerBand = holt.forecast.map((pct, i) => {
      const h = i + 1;
      const bandWidth = holt.residualStd * Math.sqrt(1 + h * 0.01) * 1.5;
      return { x: dayToX(PAST_DAYS + i), y: pctToY(Math.max(0, pct - bandWidth)) };
    });

    return {
      pastCurve, predictionLine, upperBand, lowerBand,
      consistencyBias: Math.round(bias * 100) / 100,
      pacePerDay: Math.round(pacePerDay * 100) / 100,
      phase,
      viewBox: { w: VB_W, h: VB_H },
      chartArea: { left: CHART_LEFT, right: CHART_RIGHT, top: CHART_PAD_TOP, bottom: VB_H - CHART_PAD_BOTTOM, h: CHART_H },
      todayX: dayToX(PAST_DAYS),
      todayY: pctToY(currentPct),
    };
  }, [days, currentPct, totalCards]);
}
