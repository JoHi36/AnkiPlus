import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'ap_expand';

export function useDeckTree() {
  const [expanded, setExpanded] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch { return {}; }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expanded));
  }, [expanded]);

  const toggleExpanded = useCallback((deckId) => {
    setExpanded(prev => ({ ...prev, [deckId]: !prev[deckId] }));
  }, []);

  const isExpanded = useCallback((deckId) => {
    return !!expanded[deckId];
  }, [expanded]);

  return { isExpanded, toggleExpanded };
}
