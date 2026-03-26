import React, { useEffect, useMemo } from 'react';
import SourcesCarousel from '../components/SourcesCarousel';
import type { DisplayStep, StreamPhase } from './types';
import { getStepRenderer, getFallbackRenderer } from './stepRegistry';

/* ═══════════════════════════════════════════════════
   Keyframes — injected once into <head>
   ═══════════════════════════════════════════════════ */

const KEYFRAMES = `
@keyframes ts-phaseReveal {
  from { opacity: 0; transform: translateY(-3px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes ts-containerFadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes ts-dotPulse {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.3); }
}
@keyframes ts-pulseIn {
  0% { opacity: 0; transform: scale(0.95); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes ts-fadeBlurIn {
  0% { filter: blur(3px); opacity: 0.2; }
  100% { filter: blur(0); opacity: 1; }
}
@keyframes ts-scanGlow {
  0% { left: -40%; }
  100% { left: 100%; }
}
@keyframes ts-shimmerWave {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
`;

/* ═══════════════════════════════════════════════════
   Props
   ═══════════════════════════════════════════════════ */

interface FullReasoningDisplayProps {
  displaySteps: DisplayStep[];
  phase: StreamPhase;
  isCollapsed: boolean;
  toggleCollapse: () => void;
  agentColor?: string;
  label?: string;
  citations?: Record<string, any>;
  hasOutput?: boolean;
  isStreaming?: boolean;
  bridge?: any;
  onPreviewCard?: (citation: any) => void;
}

/* ═══════════════════════════════════════════════════
   Static style constants (UPPER_SNAKE_CASE)
   ═══════════════════════════════════════════════════ */

const CONTAINER_OUTER_STYLE: React.CSSProperties = {
  marginTop: 12,
  marginBottom: 8,
  maxWidth: '100%',
  userSelect: 'none',
};

const COLLAPSED_BUTTON_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  width: '100%',
  textAlign: 'left',
  padding: '4px 0',
  opacity: 0.4,
  background: 'none',
  border: 'none',
  color: 'inherit',
  cursor: 'pointer',
  transition: 'opacity 0.2s',
};

const COLLAPSED_LABEL_STYLE: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--ds-text-tertiary)',
};

const SKELETON_CONTAINER_STYLE: React.CSSProperties = {
  padding: '8px 0',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const EXPANDED_HEADER_LOADING_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 0',
  marginBottom: 4,
  opacity: 0.5,
};

const EXPANDED_HEADER_LABEL_STYLE: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--ds-text-tertiary)',
};

const EXPANDED_HEADER_BUTTON_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  width: '100%',
  textAlign: 'left',
  padding: '4px 0',
  marginBottom: 4,
  opacity: 0.5,
  background: 'none',
  border: 'none',
  color: 'inherit',
  cursor: 'pointer',
  transition: 'opacity 0.2s',
};

const STEP_LIST_STYLE: React.CSSProperties = {
  marginLeft: 16,
};

const PHASE_ROW_TITLE_ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const PHASE_ROW_CONTENT_STYLE: React.CSSProperties = {
  marginLeft: 14,
};

const NUMBER_HIGHLIGHT_STYLE: React.CSSProperties = {
  color: 'var(--ds-text-secondary)',
  fontWeight: 600,
  fontFamily: 'monospace',
};

const DOT_BASE_STYLE: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  flexShrink: 0,
  willChange: 'transform, opacity',
  contain: 'layout style',
};

const EXTENDING_LINE_STYLE: React.CSSProperties = {
  flex: 1,
  height: 1,
  marginLeft: 8,
  background: 'linear-gradient(90deg, var(--ds-text-secondary), transparent 85%)',
  opacity: 0.25,
};

const CHEVRON_STYLE: React.CSSProperties = { opacity: 0.25 };

const SHIMMER_WIDTHS = [0.92, 0.76, 0.58];

/* ═══════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════ */

function ExtendingLine() {
  return <div style={EXTENDING_LINE_STYLE} />;
}

function ChevronRight() {
  return (
    <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={CHEVRON_STYLE}>
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={CHEVRON_STYLE}>
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

/* ── PhaseRow — Registry-driven step renderer ── */

function PhaseRow({
  step,
  data,
  status,
  isActive,
  isFirst = false,
  animate = true,
  agentColor,
}: {
  step: string;
  data: Record<string, any>;
  status: string;
  isActive: boolean;
  isFirst?: boolean;
  animate?: boolean;
  agentColor?: string;
}) {
  const isDone = !isActive;
  const renderer = getStepRenderer(step) || getFallbackRenderer(step);

  // Title logic — use renderer
  let title: string;
  if (isActive) {
    title = typeof renderer.activeTitle === 'function'
      ? renderer.activeTitle(data)
      : renderer.activeTitle;
  } else {
    title = renderer.doneLabel(data, status);
  }

  // Highlight numbers in title
  const titleParts = title.split(/(\d+)/);
  const renderedTitle = titleParts.map((part, i) =>
    /^\d+$/.test(part) ? (
      <span key={i} style={NUMBER_HIGHLIGHT_STYLE}>{part}</span>
    ) : (
      <span key={i}>{part}</span>
    )
  );

  // Dynamic styles (depend on props)
  const rowStyle: React.CSSProperties = {
    padding: '6px 0',
    borderTop: isFirst ? 'none' : '1px solid var(--ds-hover-tint)',
    animation: (!animate || isActive) ? undefined : 'ts-phaseReveal 0.25s ease-out both',
  };

  const dotStyle: React.CSSProperties = isDone
    ? { ...DOT_BASE_STYLE, background: agentColor ? `${agentColor}80` : 'var(--ds-green-50)' }
    : { ...DOT_BASE_STYLE, background: agentColor || 'var(--ds-accent)', animation: animate ? 'ts-dotPulse 1.5s ease-in-out infinite' : undefined };

  const titleStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 500,
    color: isDone ? 'var(--ds-text-tertiary)' : 'var(--ds-text-secondary)',
    flex: 1,
  };

  const checkStyle: React.CSSProperties = {
    fontSize: 10,
    color: agentColor ? `${agentColor}80` : 'var(--ds-green-50)',
  };

  return (
    <div style={rowStyle}>
      {/* Title row */}
      <div style={PHASE_ROW_TITLE_ROW_STYLE}>
        <div style={dotStyle} />
        <span style={titleStyle}>{renderedTitle}</span>
        {isDone && status !== 'error' && (
          <span style={checkStyle}>&#10003;</span>
        )}
      </div>

      {/* Phase-specific content via renderer */}
      <div style={PHASE_ROW_CONTENT_STYLE}>
        {renderer.renderContent?.({ data, isDone, animate, agentColor })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════ */

export default function FullReasoningDisplay({
  displaySteps,
  phase,
  isCollapsed,
  toggleCollapse,
  agentColor,
  label,
  citations = {},
  hasOutput = false,
  isStreaming = false,
  bridge,
  onPreviewCard,
}: FullReasoningDisplayProps) {
  // Inject keyframes once
  useEffect(() => {
    if (typeof document !== 'undefined' && !document.getElementById('ts-keyframes-v6')) {
      const s = document.createElement('style');
      s.id = 'ts-keyframes-v6';
      s.textContent = KEYFRAMES;
      document.head.appendChild(s);
      for (const oldId of ['ts-keyframes-v5', 'ts-keyframes-v4', 'ts-keyframes']) {
        const old = document.getElementById(oldId);
        if (old) old.remove();
      }
    }
  }, []);

  // Filter hidden steps (e.g. 'generating') and merge
  const visibleSteps = useMemo(
    () => displaySteps.filter(ds => {
      if (ds.step === 'merge') return false;
      const r = getStepRenderer(ds.step);
      return !r?.hidden;
    }),
    [displaySteps]
  );

  const hasCitations = Object.keys(citations).length > 0;
  const citationCount = Object.keys(citations).length;

  // Sources appear simultaneously with the sources_ready step
  const sourcesReady = hasCitations && displaySteps.some(d => d.step === 'sources_ready');

  const isAccumulating = phase === 'accumulating';
  const isComplete = phase === 'complete';
  const isProcessingLive = isStreaming && !isComplete;

  // Show initial loading shimmer when streaming started but no steps yet
  const showLoadingBox = isStreaming && displaySteps.length === 0;

  const totalSteps = visibleSteps.filter(d => d.status !== 'active').length;

  // Determine if text skeleton should show
  const showTextSkeleton = isCollapsed && isStreaming && !hasOutput && !isComplete;

  // Determine the header label
  const headerLabel = label || (totalSteps > 0
    ? `${totalSteps} Schritt${totalSteps !== 1 ? 'e' : ''}${hasCitations ? ` \u00b7 ${citationCount} Quellen` : ''}`
    : 'Schritte');

  // Dynamic outer container style
  const outerStyle: React.CSSProperties = {
    ...CONTAINER_OUTER_STYLE,
    animation: isStreaming ? 'ts-containerFadeIn 0.25s ease-out both' : undefined,
  };

  return (
    <div style={outerStyle}>
      {/* Collapsed view */}
      {isCollapsed && !showLoadingBox && (
        <button
          onClick={toggleCollapse}
          style={COLLAPSED_BUTTON_STYLE}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.6'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.4'; }}
        >
          <ChevronRight />
          <span style={COLLAPSED_LABEL_STYLE}>{headerLabel}</span>
          <ExtendingLine />
        </button>
      )}

      {/* Text skeleton — shows after collapse, waiting for text */}
      {showTextSkeleton && (
        <div style={SKELETON_CONTAINER_STYLE}>
          {SHIMMER_WIDTHS.map((w, idx) => (
            <div
              key={idx}
              style={{
                height: 12,
                borderRadius: 6,
                width: `${w * 100}%`,
                background: 'linear-gradient(90deg, var(--ds-hover-tint), var(--ds-active-tint), var(--ds-hover-tint))',
                backgroundSize: '200% 100%',
                animation: `ts-shimmerWave 2s ease-in-out infinite ${idx * 0.15}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* Expanded view */}
      {(!isCollapsed || showLoadingBox) && (
        <div style={{ animation: isStreaming ? 'ts-phaseReveal 0.2s ease-out both' : undefined }}>
          {/* Header row */}
          {(() => {
            const isLoading = showLoadingBox || (isProcessingLive && totalSteps === 0);

            if (isLoading) {
              return (
                <div style={EXPANDED_HEADER_LOADING_STYLE}>
                  <ChevronDownIcon />
                  <span style={EXPANDED_HEADER_LABEL_STYLE}>{label || 'Schritte'}</span>
                  <ExtendingLine />
                </div>
              );
            }
            if (totalSteps > 0) {
              return (
                <button
                  onClick={toggleCollapse}
                  style={EXPANDED_HEADER_BUTTON_STYLE}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.7'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; }}
                >
                  <ChevronDownIcon />
                  <span style={EXPANDED_HEADER_LABEL_STYLE}>{headerLabel}</span>
                  <ExtendingLine />
                </button>
              );
            }
            return null;
          })()}

          {/* Step rows */}
          <div style={STEP_LIST_STYLE}>
            {visibleSteps.map((ds, idx) => (
              <PhaseRow
                key={ds.step}
                step={ds.step}
                data={ds.data}
                status={ds.status}
                isActive={ds.status === 'active'}
                isFirst={idx === 0}
                animate={isStreaming || !isComplete}
                agentColor={agentColor}
              />
            ))}
          </div>
        </div>
      )}

      {/* Sources carousel — ALWAYS visible below collapsible area */}
      {sourcesReady && (
        <SourcesCarousel
          citations={citations}
          bridge={bridge}
          onPreviewCard={onPreviewCard}
        />
      )}
    </div>
  );
}
