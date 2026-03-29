import React, { useMemo } from 'react';
import type { DisplayStep, StreamPhase } from './types';
import { getStepRenderer } from './stepRegistry';

interface ReasoningDotsProps {
  displaySteps: DisplayStep[];
  phase: StreamPhase;
  agentColor?: string;
}

const CONTAINER_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
};

const DOT_BASE: React.CSSProperties = {
  width: 5,
  height: 5,
  borderRadius: '50%',
  flexShrink: 0,
  transition: 'background 0.3s ease, opacity 0.3s ease',
};


export default function ReasoningDots({ displaySteps, phase, agentColor }: ReasoningDotsProps) {
  const visibleSteps = useMemo(
    () => displaySteps.filter(ds => {
      const r = getStepRenderer(ds.step);
      return !r?.hidden;
    }),
    [displaySteps]
  );

  if (visibleSteps.length === 0) return null;

  return (
    <div style={CONTAINER_STYLE}>
      {visibleSteps.map((ds) => {
        const isDone = ds.status === 'done';
        const isCurrent = ds.status === 'active';
        const dotStyle: React.CSSProperties = {
          ...DOT_BASE,
          background: isDone
            ? (agentColor ? `color-mix(in srgb, ${agentColor} 50%, transparent)` : 'var(--ds-green-50)')
            : isCurrent
              ? (agentColor || 'var(--ds-accent)')
              : 'var(--ds-hover-tint)',
          animation: isCurrent ? 'ts-dotPulse 1.5s ease-in-out infinite' : undefined,
        };
        return <div key={ds.step} data-testid="reasoning-dot" style={dotStyle} />;
      })}
    </div>
  );
}
