import { useState, useRef, useCallback } from 'react';

export function useMascot() {
  const [mood, setMood] = useState('neutral');
  const eventMoodRef = useRef('neutral');
  const aiMoodRef = useRef(null);
  const aiTimerRef = useRef(null);
  const eventTimerRef = useRef(null);

  const resolveMood = useCallback(() => {
    if (aiMoodRef.current) return aiMoodRef.current;
    if (eventMoodRef.current && eventMoodRef.current !== 'neutral') return eventMoodRef.current;
    return 'neutral';
  }, []);

  const setEventMood = useCallback((newMood) => {
    eventMoodRef.current = newMood;
    setMood(resolveMood());

    // Auto-revert event mood after 4s
    clearTimeout(eventTimerRef.current);
    if (newMood !== 'neutral') {
      eventTimerRef.current = setTimeout(() => {
        eventMoodRef.current = 'neutral';
        setMood(resolveMood());
      }, 4000);
    }
  }, [resolveMood]);

  const setAiMood = useCallback((newMood) => {
    aiMoodRef.current = newMood;
    setMood(newMood);

    // Auto-revert AI mood after 30s
    clearTimeout(aiTimerRef.current);
    aiTimerRef.current = setTimeout(() => {
      aiMoodRef.current = null;
      setMood(resolveMood());
    }, 30000);
  }, [resolveMood]);

  const resetMood = useCallback(() => {
    clearTimeout(aiTimerRef.current);
    clearTimeout(eventTimerRef.current);
    aiMoodRef.current = null;
    eventMoodRef.current = 'neutral';
    setMood('neutral');
  }, []);

  return { mood, setEventMood, setAiMood, resetMood };
}
