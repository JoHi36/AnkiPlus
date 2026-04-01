import { describe, it, expect } from 'vitest';
import {
  dampedHoltForecast,
  computeConsistencyBias,
  computeDynamik,
  movingAverage,
} from '../useTrajectoryModel';

describe('dampedHoltForecast', () => {
  it('produces forecast points with correct length', () => {
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
    const earlyGrowth = result.forecast[9] - result.forecast[0];
    const lateGrowth = result.forecast[89] - result.forecast[80];
    expect(earlyGrowth).toBeGreaterThan(lateGrowth);
  });

  it('forecast never exceeds 100', () => {
    const series = Array.from({ length: 30 }, (_, i) => 85 + i * 0.3);
    const result = dampedHoltForecast(series, { steps: 90, alpha: 0.3, beta: 0.1, phi: 0.85 });
    for (const val of result.forecast) {
      expect(val).toBeLessThanOrEqual(100);
    }
  });

  it('handles flat series (zero trend)', () => {
    const series = Array.from({ length: 30 }, () => 50);
    const result = dampedHoltForecast(series, { steps: 90, alpha: 0.3, beta: 0.1, phi: 0.85 });
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

describe('computeConsistencyBias', () => {
  it('returns 0.5 for perfectly balanced performance', () => {
    const series = [10, 12, 10, 12, 10, 12, 10, 12, 10, 12];
    const bias = computeConsistencyBias(series);
    expect(bias).toBeCloseTo(0.5, 1);
  });

  it('returns > 0.5 for consistently above-average', () => {
    const series = Array.from({ length: 30 }, (_, i) => 10 + i);
    const bias = computeConsistencyBias(series);
    expect(bias).toBeGreaterThan(0.5);
  });

  it('returns < 0.5 for declining performance', () => {
    const series = Array.from({ length: 30 }, (_, i) => 50 - i);
    const bias = computeConsistencyBias(series);
    expect(bias).toBeLessThan(0.5);
  });

  it('returns 0.5 for empty or single-element series', () => {
    expect(computeConsistencyBias([])).toBe(0.5);
    expect(computeConsistencyBias([42])).toBe(0.5);
  });
});

describe('movingAverage', () => {
  it('smooths noisy data', () => {
    const data = [10, 20, 10, 20, 10, 20, 10];
    const smoothed = movingAverage(data, 3);
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

// ─── Dynamik ─────────────────────────────────────────────────────────────────

describe('computeDynamik', () => {
  it('returns high dynamik for consistent upward trend', () => {
    const daily = Array.from({ length: 30 }, (_, i) => 50 + i * 2);
    const { dynamik, momentum, konsistenz } = computeDynamik(daily);
    expect(dynamik).toBeGreaterThan(0.6);
    expect(momentum).toBeGreaterThan(0.5);
    expect(konsistenz).toBeGreaterThan(0.5);
  });

  it('returns low dynamik for erratic declining data', () => {
    const daily = Array.from({ length: 30 }, (_, i) => Math.max(0, 100 - i * 3 + (i % 2 === 0 ? 30 : -20)));
    const { dynamik } = computeDynamik(daily);
    expect(dynamik).toBeLessThan(0.5);
  });

  it('returns 0.5 for insufficient data', () => {
    const { dynamik } = computeDynamik([10, 20]);
    expect(dynamik).toBe(0.5);
  });

  it('all values between 0 and 1', () => {
    const daily = Array.from({ length: 30 }, () => Math.random() * 100);
    const { dynamik, momentum, konsistenz } = computeDynamik(daily);
    expect(dynamik).toBeGreaterThanOrEqual(0);
    expect(dynamik).toBeLessThanOrEqual(1);
    expect(momentum).toBeGreaterThanOrEqual(0);
    expect(momentum).toBeLessThanOrEqual(1);
    expect(konsistenz).toBeGreaterThanOrEqual(0);
    expect(konsistenz).toBeLessThanOrEqual(1);
  });
});
