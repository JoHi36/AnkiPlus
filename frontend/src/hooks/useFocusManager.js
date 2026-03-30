import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

const FOCUS_COLORS = [
  [74, 222, 128],
  [96, 165, 250],
  [251, 191, 36],
  [168, 85, 247],
  [248, 113, 113],
];

export function getFocusColor(colorIndex, opacity = 1) {
  const [r, g, b] = FOCUS_COLORS[colorIndex % FOCUS_COLORS.length];
  return opacity < 1 ? `rgba(${r},${g},${b},${opacity})` : `rgb(${r},${g},${b})`;
}

export default function useFocusManager() {
  const [focuses, setFocuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFocusId, setActiveFocusId] = useState(null);
  const [trajectories, setTrajectories] = useState({});
  const [suggestions, setSuggestions] = useState({});

  // Sequential trajectory loading queue
  const loadQueueRef = useRef([]);
  const currentLoadRef = useRef(null);
  const trajReceivedRef = useRef(false);
  const suggReceivedRef = useRef(false);
  const loadedFocusIdsRef = useRef(new Set());

  const processQueue = useCallback(() => {
    if (loadQueueRef.current.length === 0 || !window.ankiBridge) {
      currentLoadRef.current = null;
      return;
    }
    const next = loadQueueRef.current.shift();
    currentLoadRef.current = next.focusId;
    trajReceivedRef.current = false;
    suggReceivedRef.current = false;
    window.ankiBridge.addMessage('getDeckTrajectory', { deckId: next.deckId });
    window.ankiBridge.addMessage('getDeckSessionSuggestion', { deckId: next.deckId });
  }, []);

  useEffect(() => {
    const handler = (event) => {
      const payload = event.detail || event;

      if (payload?.type === 'focusList') {
        const list = Array.isArray(payload.data) ? payload.data : [];
        setFocuses(list);
        setLoading(false);
      }
      if (payload?.type === 'focusSaved' && payload.data && !payload.data.error) {
        if (window.ankiBridge) {
          window.ankiBridge.addMessage('getFocuses', {});
        }
      }
      // Multi-trajectory loading: track both responses independently, advance when both arrive
      if (payload?.type === 'deckTrajectory' && payload.data && !payload.data.error) {
        const focusId = currentLoadRef.current;
        if (focusId) {
          setTrajectories(prev => ({ ...prev, [focusId]: payload.data }));
          trajReceivedRef.current = true;
        }
      }
      if (payload?.type === 'deckSessionSuggestion' && payload.data && !payload.data.error) {
        const focusId = currentLoadRef.current;
        if (focusId) {
          setSuggestions(prev => ({ ...prev, [focusId]: payload.data }));
          suggReceivedRef.current = true;
        }
      }
      // Advance queue only when both responses received (order-independent)
      if (currentLoadRef.current && trajReceivedRef.current && suggReceivedRef.current) {
        currentLoadRef.current = null;
        processQueue();
      }
    };

    window.addEventListener('ankiReceive', handler);

    if (window.ankiBridge) {
      window.ankiBridge.addMessage('getFocuses', {});
    } else {
      setFocuses([]);
      setLoading(false);
    }

    return () => window.removeEventListener('ankiReceive', handler);
  }, [processQueue]);

  // Load trajectories when focuses arrive (only for new ones)
  useEffect(() => {
    if (focuses.length === 0 || !window.ankiBridge) return;

    const toLoad = focuses
      .filter(f => f.deckIds?.[0] && !loadedFocusIdsRef.current.has(f.id))
      .map(f => ({ focusId: f.id, deckId: f.deckIds[0] }));

    if (toLoad.length === 0) return;

    for (const item of toLoad) {
      loadedFocusIdsRef.current.add(item.focusId);
    }
    loadQueueRef.current.push(...toLoad);

    if (!currentLoadRef.current) {
      processQueue();
    }
  }, [focuses, processQueue]);

  const createFocus = useCallback((deckCells) => {
    if (!window.ankiBridge) return;
    window.ankiBridge.addMessage('saveFocus', {
      deckIds: deckCells.map(c => c.id),
      deckNames: deckCells.map(c => c.name),
      deadline: '',
    });
  }, []);

  const deleteFocus = useCallback((focusId) => {
    if (!window.ankiBridge) return;
    window.ankiBridge.addMessage('deleteFocus', { focusId });
    setActiveFocusId(null);
    // Clean up loaded data
    loadedFocusIdsRef.current.delete(focusId);
    setTrajectories(prev => {
      const next = { ...prev };
      delete next[focusId];
      return next;
    });
    setSuggestions(prev => {
      const next = { ...prev };
      delete next[focusId];
      return next;
    });
  }, []);

  const hasFocuses = focuses.length > 0;

  const sortedFocuses = useMemo(() => {
    return [...focuses].sort((a, b) => {
      const aPct = trajectories[a.id]?.current_pct ?? -1;
      const bPct = trajectories[b.id]?.current_pct ?? -1;
      return bPct - aPct;
    });
  }, [focuses, trajectories]);

  const aggregateTrajectory = useMemo(() => {
    const loaded = sortedFocuses
      .map(f => ({ focus: f, traj: trajectories[f.id] }))
      .filter(({ traj }) => traj?.days?.length > 0);

    if (loaded.length === 0) return null;

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

  const activeFocus = activeFocusId
    ? sortedFocuses.find(f => f.id === activeFocusId) || null
    : null;

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
}
