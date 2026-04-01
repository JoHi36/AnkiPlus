import { useState, useCallback, useEffect, useRef } from 'react';

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

  /* Auto-expand top-level roots that have never been explicitly toggled */
  const seededRef = useRef(new Set());
  const ensureRootsExpanded = useCallback((roots) => {
    if (!roots || roots.length === 0) return;
    const toExpand = {};
    for (const r of roots) {
      if (r.id && !(r.id in expanded) && !seededRef.current.has(r.id)) {
        toExpand[r.id] = true;
        seededRef.current.add(r.id);
      }
    }
    if (Object.keys(toExpand).length > 0) {
      setExpanded(prev => ({ ...toExpand, ...prev }));
    }
  }, [expanded]);

  const toggleExpanded = useCallback((deckId) => {
    setExpanded(prev => ({ ...prev, [deckId]: !prev[deckId] }));
  }, []);

  const isExpanded = useCallback((deckId) => {
    return !!expanded[deckId];
  }, [expanded]);

  return { isExpanded, toggleExpanded, ensureRootsExpanded };
}
