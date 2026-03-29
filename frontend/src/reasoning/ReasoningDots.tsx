import React, { useMemo } from 'react';
import type { DisplayStep, StreamPhase } from './types';
import { getStepRenderer, getFallbackRenderer } from './stepRegistry';

interface ReasoningDotsProps {
  displaySteps: DisplayStep[];
  phase: StreamPhase;
  agentColor?: string;
}

const CONTAINER_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  alignItems: 'flex-end',
};

const DOTS_ROW_STYLE: React.CSSProperties = {
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

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--ds-text-secondary)',
  textAlign: 'right' as const,
  animation: 'ts-phaseReveal 0.4s ease-out both',
  whiteSpace: 'nowrap' as const,
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

  const activeStep = [...visibleSteps].reverse().find(s => s.status === 'active');
  const lastStep = activeStep || visibleSteps[visibleSteps.length - 1];
  const renderer = getStepRenderer(lastStep.step) || getFallbackRenderer(lastStep.step);
  const isActive = lastStep.status === 'active';
  const label = isActive
    ? (typeof renderer.activeTitle === 'function' ? renderer.activeTitle(lastStep.data) : renderer.activeTitle)
    : renderer.doneLabel(lastStep.data, lastStep.status);

  return (
    <div style={CONTAINER_STYLE}>
      <div style={DOTS_ROW_STYLE}>
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
      <div style={LABEL_STYLE}>{label}</div>
    </div>
  );
}
