import { useState, useCallback } from 'react';

type LidLiftState = 'idle' | 'animating' | 'open' | 'reversing';

export function useLidLift() {
  const [state, setState] = useState<LidLiftState>('idle');

  const trigger = useCallback(() => {
    setState(prev => {
      if (prev !== 'idle') return prev;
      return 'animating';
    });
  }, []);

  const close = useCallback((hasMessages: boolean) => {
    setState(prev => {
      if (prev !== 'open') return prev;
      return hasMessages ? 'idle' : 'reversing';
    });
  }, []);

  const onAnimationComplete = useCallback(() => {
    setState(prev => {
      if (prev === 'animating') return 'open';
      if (prev === 'reversing') return 'idle';
      return prev;
    });
  }, []);

  return {
    state,
    isOpen: state === 'open',
    isAnimating: state === 'animating' || state === 'reversing',
    isReversing: state === 'reversing',
    trigger,
    close,
    onAnimationComplete,
  };
}
