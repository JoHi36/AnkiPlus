import { useState, useCallback } from 'react';

export function usePlusiDirect() {
  const [isLoading, setIsLoading] = useState(false);

  const sendDirect = useCallback((text, deckId = null) => {
    if (!text?.trim() || !window.ankiBridge) return;
    setIsLoading(true);
    window.ankiBridge.addMessage('plusiDirect', JSON.stringify({
      text: text.trim(),
      deck_id: deckId,
    }));
  }, []);

  const handleResult = useCallback((data) => {
    setIsLoading(false);
    return {
      mood: data.mood || 'neutral',
      text: data.text || '',
      meta: data.meta || '',
      error: data.error || false,
    };
  }, []);

  return { sendDirect, handleResult, isLoading };
}
