import { useRef, useCallback, useEffect } from 'react';

interface UseHoldToPeekOptions {
  onPeekStart: () => void;
  onPeekEnd: () => void;
  threshold?: number;
}

export function useHoldToPeek({ onPeekStart, onPeekEnd, threshold = 300 }: UseHoldToPeekOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peekingRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    clear();
    peekingRef.current = false;
    timerRef.current = setTimeout(() => {
      peekingRef.current = true;
      onPeekStart();
    }, threshold);
  }, [onPeekStart, threshold, clear]);

  const onPointerUp = useCallback(() => {
    clear();
    if (peekingRef.current) {
      peekingRef.current = false;
      onPeekEnd();
    }
  }, [onPeekEnd, clear]);

  useEffect(() => clear, [clear]);

  return {
    handlers: { onPointerDown, onPointerUp, onPointerCancel: onPointerUp },
  };
}
