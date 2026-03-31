/**
 * ThinkingIndicator — unified agent status bar for all channels.
 *
 * Layout: AGENT ─────────── ● Step · data
 * A persistent bar with agent name left, divider line, current step right.
 * Below: optional skeleton lines while content loads.
 */

import React from 'react';
import { ThinkingPhase } from '../hooks/useThinkingPhases';

interface ThinkingIndicatorProps {
  phases: ThinkingPhase[] | null;
  agentLabel?: string;             // "Tutor", "Research", "Prüfer"
  showSkeleton?: boolean;          // Show skeleton lines below bar
}

/* ── Bar layout ── */
const BAR_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 0,
  fontFamily: 'var(--ds-font-mono)',
  fontSize: 10.5,
  letterSpacing: '0.04em',
  minHeight: 20,
};

const LABEL_STYLE: React.CSSProperties = {
  textTransform: 'uppercase',
  fontWeight: 600,
  color: 'var(--ds-text-tertiary)',
  flexShrink: 0,
  whiteSpace: 'nowrap',
};

const LINE_STYLE: React.CSSProperties = {
  flex: 1,
  height: 1,
  background: 'var(--ds-border-subtle)',
  margin: '0 10px',
  minWidth: 20,
};

const RIGHT_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexShrink: 0,
  whiteSpace: 'nowrap',
};

const DOT_STYLE: React.CSSProperties = {
  width: 5,
  height: 5,
  borderRadius: '50%',
  flexShrink: 0,
};

/* ── Skeleton ── */
const SKELETON_WRAP: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  marginTop: 14,
};

const SKELETON_LINE: React.CSSProperties = {
  height: 12,
  borderRadius: 6,
  background: 'var(--ds-hover-tint)',
};

const SKELETON_WIDTHS = ['92%', '78%', '65%', '85%'];

function ThinkingIndicator({ phases, agentLabel, showSkeleton }: ThinkingIndicatorProps) {
  // Determine what to show on the right side of the bar
  const activePhase = phases?.find(p => p.status === 'active');
  const allDone = phases && phases.length > 0 && phases.every(p => p.status === 'done' || p.status === 'pending');
  const dataPoints = phases?.filter(p => p.data && p.status === 'done').map(p => p.data) || [];

  // Don't render if no agent label and no phases
  if (!agentLabel && (!phases || phases.length === 0)) return null;

  return (
    <div>
      {/* ── Status bar ── */}
      <div style={BAR_STYLE}>
        {/* Left: Agent name */}
        <span style={LABEL_STYLE}>{agentLabel || 'Agent'}</span>

        {/* Middle: Line */}
        <span style={LINE_STYLE} />

        {/* Right: Active step OR summary */}
        <div style={RIGHT_STYLE}>
          {activePhase ? (
            <>
              <span
                className="thinking-dot-pulse"
                style={{
                  ...DOT_STYLE,
                  background: activePhase.color || 'var(--ds-accent)',
                }}
              />
              <span style={{ color: 'var(--ds-text-secondary)', fontWeight: 500 }}>
                {activePhase.name}
              </span>
              {activePhase.data && (
                <>
                  <span style={{ color: 'var(--ds-text-tertiary)', opacity: 0.4 }}>·</span>
                  <span style={{ color: 'var(--ds-text-tertiary)' }}>{activePhase.data}</span>
                </>
              )}
            </>
          ) : allDone && dataPoints.length > 0 ? (
            <span style={{ color: 'var(--ds-text-tertiary)' }}>
              {dataPoints.join(' · ')}
            </span>
          ) : null}
        </div>
      </div>

      {/* ── Skeleton lines ── */}
      {showSkeleton && (
        <div style={SKELETON_WRAP}>
          {SKELETON_WIDTHS.map((w, i) => (
            <div
              key={i}
              className="thinking-skeleton-shimmer"
              style={{ ...SKELETON_LINE, width: w, animationDelay: `${i * 0.12}s` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default React.memo(ThinkingIndicator);
