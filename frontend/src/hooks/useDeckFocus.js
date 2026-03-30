import { useState, useEffect, useCallback, useRef } from 'react';

export default function useDeckFocus() {
  const [focusedDeckId, setFocusedDeckId] = useState(null);
  const [trajectory, setTrajectory] = useState(null);
  const [suggestion, setSuggestion] = useState(null);
  const [loading, setLoading] = useState(false);
  const cache = useRef({});

  // Listen for backend responses
  useEffect(() => {
    const handler = (event) => {
      const payload = event.detail || event;
      if (payload?.type === 'deckTrajectory' && payload.data) {
        const data = payload.data;
        if (!data.error) {
          cache.current[`traj_${focusedDeckId}`] = data;
          setTrajectory(data);
        }
      }
      if (payload?.type === 'deckSessionSuggestion' && payload.data) {
        const data = payload.data;
        if (!data.error) {
          cache.current[`sugg_${focusedDeckId}`] = data;
          setSuggestion(data);
          setLoading(false);
        }
      }
    };
    window.addEventListener('ankiReceive', handler);
    return () => window.removeEventListener('ankiReceive', handler);
  }, [focusedDeckId]);

  const focusDeck = useCallback((deckCell) => {
    if (!deckCell) {
      setFocusedDeckId(null);
      setTrajectory(null);
      setSuggestion(null);
      setLoading(false);
      return;
    }

    const id = deckCell.id;
    setFocusedDeckId(id);

    // Check cache
    const cachedTraj = cache.current[`traj_${id}`];
    const cachedSugg = cache.current[`sugg_${id}`];

    if (cachedTraj && cachedSugg) {
      setTrajectory(cachedTraj);
      setSuggestion(cachedSugg);
      setLoading(false);
      return;
    }

    setLoading(true);
    setTrajectory(cachedTraj || null);
    setSuggestion(cachedSugg || null);

    // Request from backend
    if (window.ankiBridge) {
      window.ankiBridge.addMessage('getDeckTrajectory', { deckId: id });
      window.ankiBridge.addMessage('getDeckSessionSuggestion', { deckId: id });
    }
  }, []);

  const goBack = useCallback(() => {
    setFocusedDeckId(null);
    setTrajectory(null);
    setSuggestion(null);
    setLoading(false);
  }, []);

  return {
    focusedDeckId,
    trajectory,
    suggestion,
    loading,
    focusDeck,
    goBack,
  };
}
