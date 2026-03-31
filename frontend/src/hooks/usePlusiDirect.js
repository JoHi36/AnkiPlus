import { useState, useCallback } from 'react';

export function usePlusiDirect() {
  const [isLoading, setIsLoading] = useState(false);

  const sendDirect = useCallback((text, deckId = null) => {
    if (!text?.trim() || !window.ankiBridge) return;
    setIsLoading(true);
    window.ankiBridge.addMessage('subagentDirect', {
      agent_name: 'plusi',
      text: text.trim(),
    });
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
