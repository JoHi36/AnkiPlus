import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import SourcesCarousel from '../components/SourcesCarousel';
import { ReasoningStep, DisplayStep, MIN_STEP_INTERVAL } from './types';
import { getStepRenderer, getFallbackRenderer } from './stepRegistry';

/* ═══════════════════════════════════════════════════
   ReasoningStream — Registry-driven replacement for
   ThoughtStream. Uses pluggable StepRendererDefs
   instead of hardcoded step dispatch.
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

export interface ReasoningStreamProps {
  steps: ReasoningStep[];
  pipelineGeneration?: number;
  citations?: Record<string, any>;
  citationIndices?: Record<string, number>;
  isStreaming?: boolean;
  message?: string;
  agentColor?: string;
  variant?: 'router' | 'agent';
  bridge?: any;
  onPreviewCard?: (citation: any) => void;
}

/* ═══════════════════════════════════════════════════
   ACCUMULATING PIPELINE HOOK
   Ported VERBATIM from ThoughtStream.tsx v6
   ═══════════════════════════════════════════════════ */

function useAccumulatingPipeline(
  pipelineSteps: ReasoningStep[],
  generation: number = 0,
  instant: boolean = false
): { displaySteps: DisplayStep[]; isProcessing: boolean } {
  // CRITICAL: For saved messages (instant=true), initialize displaySteps directly
  // from props. This ensures hasContent is true on the FIRST render — no null flash.
  const initialSteps = instant && pipelineSteps.length > 0
    ? pipelineSteps.map(s => ({ ...s, visibleSince: Date.now() } as DisplayStep))
    : [];
  const initialKnown = instant
    ? new Set(pipelineSteps.map(s => s.step))
    : new Set<string>();

  const [displaySteps, setDisplaySteps] = useState<DisplayStep[]>(initialSteps);
  const [isProcessing, setIsProcessing] = useState(false);
  const queueRef = useRef<ReasoningStep[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastShowTimeRef = useRef(0);
  const prevGenerationRef = useRef(generation);
  const knownStepsRef = useRef<Set<string>>(initialKnown);

  // Reset on new generation
  useEffect(() => {
    if (generation !== prevGenerationRef.current) {
      prevGenerationRef.current = generation;
      setDisplaySteps([]);
      setIsProcessing(false);
      queueRef.current = [];
      knownStepsRef.current = new Set();
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      lastShowTimeRef.current = 0;
    }
  }, [generation]);

  const flushQueue = useCallback(() => {
    if (queueRef.current.length === 0 || timerRef.current) return;
    const elapsed = Date.now() - lastShowTimeRef.current;
    const delay = Math.max(0, MIN_STEP_INTERVAL - elapsed);

    const showNext = () => {
      if (queueRef.current.length === 0) return;
      const next = queueRef.current.shift()!;
      lastShowTimeRef.current = Date.now();
      setDisplaySteps(prev => [
        ...prev,
        { step: next.step, status: next.status, data: next.data || {}, visibleSince: Date.now(), timestamp: next.timestamp }
      ]);
      // Continue flushing if more queued
      if (queueRef.current.length > 0) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          showNext();
        }, MIN_STEP_INTERVAL);
      }
    };

    if (delay === 0) {
      showNext();
    } else {
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        showNext();
      }, delay);
    }
  }, []);

  // Process incoming pipeline steps
  useEffect(() => {
    if (!pipelineSteps || pipelineSteps.length === 0) return;
    setIsProcessing(true);

    // 1. Update existing displayed steps (status/data changes)
    setDisplaySteps(prev => {
      let changed = false;
      const updated = prev.map(ds => {
        const source = pipelineSteps.find(s => s.step === ds.step);
        if (!source) return ds;
        const statusChanged = source.status !== ds.status;
        const dataChanged = source.data && JSON.stringify(source.data) !== JSON.stringify(ds.data);
        if (statusChanged || dataChanged) {
          changed = true;
          return { ...ds, status: source.status, data: source.data || ds.data };
        }
        return ds;
      });
      return changed ? updated : prev;
    });

    // 2. Queue new steps (ref-only, no setState)
    for (const s of pipelineSteps) {
      if (!knownStepsRef.current.has(s.step)) {
        knownStepsRef.current.add(s.step);
        if (instant) {
          // Instant mode: show all steps immediately (saved messages)
          setDisplaySteps(prev => [
            ...prev,
            { step: s.step, status: s.status, data: s.data || {}, visibleSince: Date.now(), timestamp: s.timestamp }
          ]);
        } else {
          queueRef.current.push(s);
        }
      }
    }

    // 3. Flush queue (only needed in non-instant mode)
    if (!instant) flushQueue();
  }, [pipelineSteps, flushQueue]);

  // Detect processing end
  useEffect(() => {
    if (displaySteps.length > 0 &&
        queueRef.current.length === 0 &&
        !displaySteps.some(d => d.status === 'active')) {
      const t = setTimeout(() => setIsProcessing(false), 200);
      return () => clearTimeout(t);
    }
  }, [displaySteps]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { displaySteps, isProcessing };
}

/* ═══════════════════════════════════════════════════
   PHASE ROW — Registry-driven renderer
   ═══════════════════════════════════════════════════ */

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
      <span key={i} style={{ color: 'var(--ds-text-secondary)', fontWeight: 600, fontFamily: 'monospace' }}>{part}</span>
    ) : (
      <span key={i}>{part}</span>
    )
  );

  return (
    <div
      style={{
        padding: '6px 0',
        borderTop: isFirst ? 'none' : '1px solid var(--ds-hover-tint)',
        animation: (!animate || isActive) ? undefined : 'ts-phaseReveal 0.25s ease-out both',
      }}
    >
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Dot */}
        {isDone ? (
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: agentColor ? `${agentColor}80` : 'var(--ds-green-50)', flexShrink: 0, willChange: 'transform, opacity', contain: 'layout style' }} />
        ) : (
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: agentColor || 'var(--ds-accent)',
              flexShrink: 0,
              animation: animate ? 'ts-dotPulse 1.5s ease-in-out infinite' : undefined,
              willChange: 'transform, opacity',
              contain: 'layout style',
            }}
          />
        )}
        {/* Title */}
        <span style={{ fontSize: 12, fontWeight: 500, color: isDone ? 'var(--ds-text-tertiary)' : 'var(--ds-text-secondary)', flex: 1 }}>
          {renderedTitle}
        </span>
        {/* Checkmark */}
        {isDone && status !== 'error' && (
          <span style={{ fontSize: 10, color: agentColor ? `${agentColor}80` : 'var(--ds-green-50)' }}>&#10003;</span>
        )}
      </div>

      {/* Phase-specific content via renderer */}
      <div style={{ marginLeft: 14 }}>
        {renderer.renderContent?.({ data, isDone, animate, agentColor })}
      </div>
    </div>
  );
}

/* ── Extending Line ── */
function ExtendingLine() {
  return (
    <div
      style={{
        flex: 1,
        height: 1,
        marginLeft: 8,
        background: 'linear-gradient(90deg, var(--ds-text-secondary), transparent 85%)',
        opacity: 0.25,
      }}
    />
  );
}

/* ── Chevron SVGs ── */
function ChevronRight() {
  return (
    <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.25 }}>
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}
function ChevronDownIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.25 }}>
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════ */

export default function ReasoningStream({
  steps: pipelineSteps = [],
  pipelineGeneration = 0,
  agentColor,
  citations = {},
  citationIndices = {},
  isStreaming = false,
  bridge = null,
  onPreviewCard,
  message = '',
  variant = 'agent',
}: ReasoningStreamProps) {
  const isRouterVariant = variant === 'router';

  // Inject keyframes once
  useEffect(() => {
    if (typeof document !== 'undefined' && !document.getElementById('ts-keyframes-v6')) {
      const s = document.createElement('style');
      s.id = 'ts-keyframes-v6';
      s.textContent = KEYFRAMES;
      document.head.appendChild(s);
      // Remove old keyframes if present
      for (const oldId of ['ts-keyframes-v5', 'ts-keyframes-v4', 'ts-keyframes']) {
        const old = document.getElementById(oldId);
        if (old) old.remove();
      }
    }
  }, []);

  // Filter out merge step — it's an internal detail between search and sources_ready.
  // Keeping it would also block isProcessing (merge stays 'active'), preventing auto-collapse.
  const filteredPipelineSteps = useMemo(
    () => pipelineSteps.filter(s => s.step !== 'merge'),
    [pipelineSteps]
  );
  // Saved messages (not streaming): show all steps instantly, no 800ms queue delay
  const { displaySteps, isProcessing } = useAccumulatingPipeline(filteredPipelineSteps, pipelineGeneration, !isStreaming);
  const animate = isStreaming || isProcessing;

  // Filter hidden steps (e.g. 'generating')
  const visibleSteps = displaySteps.filter(ds => {
    const r = getStepRenderer(ds.step);
    return !r?.hidden;
  });

  // Collapse state
  const hasText = Boolean(message && message.trim().length > 0);
  const allStepsDone = displaySteps.length > 0 && displaySteps.every(ds => ds.status === 'done');

  // Initial state: saved messages (not streaming) start collapsed; live messages start expanded
  const [isCollapsed, setIsCollapsed] = useState(!isStreaming && hasText);
  // Track if user manually toggled — prevents auto-collapse from overriding user intent
  const userExpandedRef = useRef(false);

  // Auto-collapse rules:
  // - Router variant: collapse when all steps complete
  // - Agent variant: collapse when text starts streaming OR all display steps done + delay
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (userExpandedRef.current) return;
    if (isRouterVariant) {
      if (allStepsDone && !isCollapsed) setIsCollapsed(true);
    } else {
      // Agent: collapse when text arrives (text display takes over)
      if (hasText && !isCollapsed) {
        if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
        setIsCollapsed(true);
      }
      // Agent: collapse after MIN_STEP_INTERVAL when all displaySteps are done and no text yet.
      // No isProcessing guard — the queue already gave each step its 800ms display time.
      // 4 steps = 3200ms total, then collapse immediately after one more MIN_STEP_INTERVAL.
      if (allStepsDone && !hasText && !isCollapsed) {
        if (!collapseTimerRef.current) {
          collapseTimerRef.current = setTimeout(() => {
            collapseTimerRef.current = null;
            setIsCollapsed(true);
          }, MIN_STEP_INTERVAL);
        }
      }
    }
    return () => {
      if (collapseTimerRef.current && (hasText || !allStepsDone)) {
        clearTimeout(collapseTimerRef.current);
        collapseTimerRef.current = null;
      }
    };
  }, [isRouterVariant, allStepsDone, hasText, isCollapsed]);

  // Expand when new pipeline starts — reset user override
  useEffect(() => {
    if (isProcessing) {
      setIsCollapsed(false);
      userExpandedRef.current = false;
    }
  }, [isProcessing]);

  const hasCitations = Object.keys(citations).length > 0;
  const citationCount = Object.keys(citations).length;

  // Sources appear simultaneously with the sources_ready step.
  // The 800ms queue already handles timing — no extra delay needed.
  const sourcesReady = hasCitations && displaySteps.some(d => d.step === 'sources_ready');

  // Show when processing, has data, OR when streaming started but no events yet
  const showLoadingBox = isStreaming && !isProcessing && displaySteps.length === 0 && pipelineSteps.length === 0;
  // hasContent: true if we have anything to show (steps, loading, or raw data waiting for effect)
  const hasContent = isProcessing || displaySteps.length > 0 || pipelineSteps.length > 0 || showLoadingBox;
  const totalSteps = visibleSteps.filter(d => d.status !== 'active').length;

  if (!hasContent) return null;

  return (
    <div style={{
      marginTop: 12,
      marginBottom: 8,
      maxWidth: '100%',
      userSelect: 'none',
      // Only animate fade-in for live streaming, not saved messages (avoids flash on mount)
      animation: isStreaming ? 'ts-containerFadeIn 0.25s ease-out both' : undefined,
    }}>
      {/* ── Collapsed view ── */}
      {isCollapsed && !isProcessing && !showLoadingBox && !(isStreaming && pipelineSteps.length > 0 && displaySteps.length === 0) && (
        <>
          <button
            onClick={() => { userExpandedRef.current = true; setIsCollapsed(false); }}
            style={{
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
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.6'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.4'; }}
          >
            <ChevronRight />
            <span style={{ fontSize: 11, color: 'var(--ds-text-tertiary)' }}>
              {isRouterVariant ? 'Orchestrierung' : `${totalSteps} Schritt${totalSteps !== 1 ? 'e' : ''}`}
              {hasCitations ? ` · ${citationCount} Quellen` : ''}
            </span>
            <ExtendingLine />
          </button>
          {/* Text skeleton — shows after stream collapses, waiting for text */}
          {!hasText && isStreaming && !isRouterVariant && (
            <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[0.92, 0.76, 0.58].map((w, idx) => (
                <div key={idx} style={{ height: 12, borderRadius: 6, width: `${w * 100}%`, background: 'linear-gradient(90deg, var(--ds-hover-tint), var(--ds-active-tint), var(--ds-hover-tint))', backgroundSize: '200% 100%', animation: `ts-shimmerWave 2s ease-in-out infinite ${idx * 0.15}s` }} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Expanded view ── */}
      {/* isProcessing keeps expanded view visible during the gap between
          auto-collapse (hasText) and the 200ms isProcessing timeout,
          preventing both views from being hidden simultaneously. */}
      {(!isCollapsed || isProcessing || showLoadingBox || (isStreaming && pipelineSteps.length > 0 && displaySteps.length === 0)) && (
        <div style={{ animation: isStreaming ? 'ts-phaseReveal 0.2s ease-out both' : undefined }}>
          {/* Header row — always visible in expanded view */}
          {(() => {
            const isLoading = (isProcessing || showLoadingBox) && totalSteps === 0;
            const isLoadingGap = isStreaming && pipelineSteps.length > 0 && displaySteps.length === 0;

            if (isLoading || isLoadingGap) {
              // During loading: non-interactive header with extending line
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', marginBottom: 4, opacity: 0.5 }}>
                  <ChevronDownIcon />
                  <span style={{ fontSize: 11, color: 'var(--ds-text-tertiary)' }}>{isRouterVariant ? 'Orchestrierung' : 'Schritte'}</span>
                  <ExtendingLine />
                </div>
              );
            }
            if (totalSteps > 0) {
              // Done: clickable toggle to collapse
              return (
                <button
                  onClick={() => { userExpandedRef.current = false; setIsCollapsed(true); }}
                  style={{
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
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.7'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; }}
                >
                  <ChevronDownIcon />
                  <span style={{ fontSize: 11, color: 'var(--ds-text-tertiary)' }}>
                    {isRouterVariant ? 'Orchestrierung' : `${totalSteps} Schritt${totalSteps !== 1 ? 'e' : ''}`}
                  </span>
                  <ExtendingLine />
                </button>
              );
            }
            return null;
          })()}

          {/* Step rows — single flat list, hidden steps filtered */}
          <div style={{ marginLeft: 16 }}>
            {visibleSteps.map((ds, idx) => (
              <PhaseRow
                key={ds.step}
                step={ds.step}
                data={ds.data}
                status={ds.status}
                isActive={ds.status === 'active'}
                isFirst={idx === 0}
                animate={animate}
                agentColor={agentColor}
              />
            ))}

            {/* Source cards — 800ms after all steps done (streaming) or instant (saved) */}
            {sourcesReady && (
              <SourcesCarousel
                citations={citations}
                citationIndices={citationIndices}
                bridge={bridge}
                onPreviewCard={onPreviewCard}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
