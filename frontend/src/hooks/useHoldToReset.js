import { useState, useEffect, useRef, useCallback } from 'react';

const HOLD_DURATION = 1500; // 1.5 seconds

/**
 * useHoldToReset — tracks R key hold state for chat reset.
 * Returns { progress, isHolding } for visual feedback.
 *
 * @param {function} onReset - called when hold completes (1.5s)
 * @param {boolean} enabled - only active when true (chat is open, input not focused)
 */
export function useHoldToReset({ onReset, enabled = false }) {
  const [progress, setProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const startTimeRef = useRef(null);
  const rafRef = useRef(null);
  const completedRef = useRef(false);

  const tick = useCallback(() => {
    if (!startTimeRef.current) return;
    const elapsed = Date.now() - startTimeRef.current;
    const p = Math.min(elapsed / HOLD_DURATION, 1);
    setProgress(p);

    if (p >= 1 && !completedRef.current) {
      completedRef.current = true;
      setIsHolding(false);
      setProgress(0);
      startTimeRef.current = null;
      onReset?.();
      return;
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [onReset]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e) => {
      if (e.key === 'r' || e.key === 'R') {
        if (e.repeat) return;
        startTimeRef.current = Date.now();
        completedRef.current = false;
        setIsHolding(true);
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    const handleKeyUp = (e) => {
      if (e.key === 'r' || e.key === 'R') {
        startTimeRef.current = null;
        setIsHolding(false);
        setProgress(0);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [enabled, tick]);

  return { progress, isHolding };
}
