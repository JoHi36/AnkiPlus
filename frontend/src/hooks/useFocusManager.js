import { useState, useEffect, useCallback } from 'react';

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
    };
    window.addEventListener('ankiReceive', handler);

    if (window.ankiBridge) {
      window.ankiBridge.addMessage('getFocuses', {});
    } else {
      setFocuses([]);
      setLoading(false);
    }

    return () => window.removeEventListener('ankiReceive', handler);
  }, []);

  const createFocus = useCallback((deckCells, deadline) => {
    if (!window.ankiBridge) return;
    window.ankiBridge.addMessage('saveFocus', {
      deckIds: deckCells.map(c => c.id),
      deckNames: deckCells.map(c => c.name),
      deadline: deadline,
    });
  }, []);

  const deleteFocus = useCallback((focusId) => {
    if (!window.ankiBridge) return;
    window.ankiBridge.addMessage('deleteFocus', { focusId });
    setActiveFocusId(null);
  }, []);

  const hasFocuses = focuses.length > 0;

  const sortedFocuses = [...focuses].sort((a, b) => {
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return a.deadline.localeCompare(b.deadline);
  });

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
  };
}
