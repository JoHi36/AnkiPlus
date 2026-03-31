/**
 * ThinkingIndicator — unified reasoning display for all channels.
 * Shows 2-3 phases in SF Mono. Pulsing dot for active, muted for done.
 */

import React from 'react';
import { ThinkingPhase } from '../hooks/useThinkingPhases';

interface ThinkingIndicatorProps {
  phases: ThinkingPhase[] | null;
  collapsed?: boolean;
  agentLabel?: string;
}

const INDICATOR_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 7,
};

const STEP_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
  fontFamily: 'var(--ds-font-mono)',
  fontSize: 11.5,
  letterSpacing: '0.02em',
};

const DOT_BASE: React.CSSProperties = {
  width: 5,
  height: 5,
  borderRadius: '50%',
  flexShrink: 0,
  position: 'relative',
  top: -1,
};

const COLLAPSED_STYLE: React.CSSProperties = {
  fontFamily: 'var(--ds-font-mono)',
  fontSize: 10.5,
  letterSpacing: '0.03em',
  color: 'var(--ds-text-tertiary)',
  display: 'flex',
  gap: 6,
  alignItems: 'center',
};

const AGENT_LABEL_STYLE: React.CSSProperties = {
  textTransform: 'uppercase',
  fontWeight: 600,
  opacity: 0.7,
};

const SEPARATOR_STYLE: React.CSSProperties = { opacity: 0.3 };

function ThinkingIndicator({ phases, collapsed, agentLabel }: ThinkingIndicatorProps) {
  if (!phases || phases.length === 0) return null;

  if (collapsed) {
    const dataPoints = phases.filter(p => p.data && p.status === 'done').map(p => p.data);
    if (dataPoints.length === 0 && !agentLabel) return null;
    return (
      <div style={COLLAPSED_STYLE}>
        {agentLabel && (
          <span style={AGENT_LABEL_STYLE}>
            {agentLabel}
          </span>
        )}
        {dataPoints.map((d, i) => (
          <React.Fragment key={i}>
            <span style={SEPARATOR_STYLE}>·</span>
            <span>{d}</span>
          </React.Fragment>
        ))}
      </div>
    );
  }

  return (
    <div style={INDICATOR_STYLE}>
      {phases.map((phase, i) => {
        if (phase.status === 'pending') return null;
        const isDone = phase.status === 'done';
        const isActive = phase.status === 'active';
        return (
          <div
            key={i}
            style={{
              ...STEP_STYLE,
              color: isDone ? 'var(--ds-text-tertiary)' : 'var(--ds-text-secondary)',
            }}
          >
            <span
              className={isActive ? 'thinking-dot-pulse' : undefined}
              style={{
                ...DOT_BASE,
                background: isActive
                  ? (phase.color || 'var(--ds-accent)')
                  : 'var(--ds-text-tertiary)',
                opacity: isDone ? 0.5 : 1,
              }}
            />
            <span style={{ fontWeight: isActive ? 500 : 400 }}>
              {phase.name}
            </span>
            {phase.data && (
              <>
                <span style={SEPARATOR_STYLE}>·</span>
                <span style={{ opacity: isDone ? 0.6 : 0.8 }}>{phase.data}</span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default React.memo(ThinkingIndicator);
