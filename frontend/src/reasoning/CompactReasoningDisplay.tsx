import React from 'react';
import type { DisplayStep, StreamPhase } from './types';
import { getStepRenderer, getFallbackRenderer } from './stepRegistry';
import { reasoningLog } from './debugLog';

interface CompactProps {
  displaySteps: DisplayStep[];
  phase: StreamPhase;
  agentColor?: string;
  showCounter?: boolean;
}

/* ═══════════════════════════════════════════════════
   Static style constants (UPPER_SNAKE_CASE)
   ═══════════════════════════════════════════════════ */

const CONTAINER_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 0',
  userSelect: 'none',
};

const COUNTER_STYLE: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--ds-text-tertiary)',
  fontFamily: 'monospace',
  minWidth: 24,
};

const STEP_ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  animation: 'ts-phaseReveal 0.2s ease-out both',
};

const CHECKMARK_DONE_STYLE: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--ds-green-50)',
};

/* ═══════════════════════════════════════════════════
   CompactReasoningDisplay — single-line step view
   Shows one step at a time with crossfade. Title + dot
   only, no renderContent.
   ═══════════════════════════════════════════════════ */

export default function CompactReasoningDisplay({ displaySteps, phase, agentColor, showCounter = true }: CompactProps) {
  const currentStep = displaySteps[displaySteps.length - 1];
  const completedCount = displaySteps.filter(s => s.status === 'done').length;
  const totalCount = displaySteps.length;

  if (!currentStep) {
    reasoningLog('Compact: no currentStep → null');
    return null;
  }

  const renderer = getStepRenderer(currentStep.step) || getFallbackRenderer(currentStep.step);
  const isActive = currentStep.status === 'active';
  const title = isActive
    ? (typeof renderer.activeTitle === 'function' ? renderer.activeTitle(currentStep.data) : renderer.activeTitle)
    : renderer.doneLabel(currentStep.data, currentStep.status);

  reasoningLog(`Compact: step=${currentStep.step} status=${currentStep.status} title="${title}" ${completedCount}/${totalCount}`);

  // Dynamic styles (depend on props/state)
  const dotStyle: React.CSSProperties = {
    width: 6,
    height: 6,
    borderRadius: '50%',
    flexShrink: 0,
    background: isActive
      ? (agentColor || 'var(--ds-accent)')
      : (agentColor ? `${agentColor}80` : 'var(--ds-green-50)'),
    animation: isActive ? 'ts-dotPulse 1.5s ease-in-out infinite' : undefined,
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 500,
    color: isActive ? 'var(--ds-text-secondary)' : 'var(--ds-text-tertiary)',
  };

  const checkStyle: React.CSSProperties = agentColor
    ? { fontSize: 10, color: `${agentColor}80` }
    : CHECKMARK_DONE_STYLE;

  return (
    <div style={CONTAINER_STYLE}>
      {showCounter && <span style={COUNTER_STYLE}>{completedCount}/{totalCount}</span>}
      <div key={currentStep.step} style={STEP_ROW_STYLE}>
        <div style={dotStyle} />
        <span style={titleStyle}>{title}</span>
        {!isActive && currentStep.status !== 'error' && (
          <span style={checkStyle}>&#10003;</span>
        )}
      </div>
    </div>
  );
}
