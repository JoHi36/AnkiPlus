// frontend/src/hooks/useMascot.js
import { useState, useRef, useCallback } from 'react';

export function useMascot() {
  const [mood, setMoodState] = useState('neutral');
  const eventMoodRef = useRef('neutral');
  const fallbackTimerRef = useRef(null);

  // Set an event-driven mood (lower priority — overridden by AI mood)
  const setEventMood = useCallback((newMood) => {
    eventMoodRef.current = newMood;
    setMoodState(newMood);
  }, []);

  // Set an AI-driven mood (higher priority — falls back after 30s)
  const setAiMood = useCallback((newMood) => {
    setMoodState(newMood);
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    fallbackTimerRef.current = setTimeout(() => {
      setMoodState(eventMoodRef.current || 'neutral');
    }, 30000);
  }, []);

  // Reset to current event mood (e.g., when companion mode exits)
  const resetMood = useCallback(() => {
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    setMoodState(eventMoodRef.current || 'neutral');
  }, []);

  return { mood, setEventMood, setAiMood, resetMood };
}
