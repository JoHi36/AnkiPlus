import { useState, useEffect, useCallback } from 'react';

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
    // Always use mock data for now — bridge integration comes in next iteration
    // TODO: wire up bridge once getStatistikData handler is verified
    setData(MOCK_DATA);
    setLoading(false);
  }, []);

  useEffect(() => {
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
