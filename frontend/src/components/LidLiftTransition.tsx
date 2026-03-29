import React, { useEffect } from 'react';
import CockpitBar from './CockpitBar';
import SparkBurst from './SparkBurst';

interface LidLiftTransitionProps {
  state: 'idle' | 'animating' | 'open' | 'reversing';
  onAnimationComplete: () => void;
  deckName?: string | null;
  cardCount?: number;
  onStartLearning?: () => void;
  onClose?: () => void;
}

export default function LidLiftTransition({
  state,
  onAnimationComplete,
  deckName,
  cardCount,
  onStartLearning,
  onClose,
}: LidLiftTransitionProps) {
  useEffect(() => {
    if (state === 'animating' || state === 'reversing') {
      const timer = setTimeout(onAnimationComplete, 450);
      return () => clearTimeout(timer);
    }
  }, [state, onAnimationComplete]);

  const cockpitState =
    state === 'idle' ? 'hidden' as const :
    state === 'animating' ? 'emerging' as const :
    state === 'reversing' ? 'reversing' as const :
    'visible' as const;

  return (
    <>
      <SparkBurst active={state === 'animating'} />
      <CockpitBar
        animationState={cockpitState}
        deckName={deckName}
        cardCount={cardCount}
        onStartLearning={onStartLearning}
        onClose={onClose}
      />
    </>
  );
}
