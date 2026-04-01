import React, { useState, useEffect, useRef, useCallback } from 'react';
import SourcesCarousel from './SourcesCarousel';

/* ═══════════════════════════════════════════════════
   ThoughtStream v6 — Accumulating Pipeline + Phase Animations
   - Steps accumulate in a flat list
   - Each step updates status inline (active → done)
   - New steps throttled by MIN_STEP_INTERVAL
   - No promotion queue, no Active Box
   ═══════════════════════════════════════════════════ */

const MIN_STEP_INTERVAL = 800;

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

/* ── Types ── */

interface PipelineStep {
  step: string;
  status: 'active' | 'done' | 'error';
  data: Record<string, any>;
  timestamp: number;
}

interface DisplayStep {
  step: string;
  status: 'active' | 'done' | 'error';
  data: Record<string, any>;
  visibleSince: number;
}

export interface ThoughtStreamProps {
  pipelineSteps?: PipelineStep[];
  pipelineGeneration?: number;
  agentColor?: string;
  citations?: Record<string, any>;
  citationIndices?: Record<string, number>;
  isStreaming?: boolean;
  bridge?: any;
  onPreviewCard?: (citation: any) => void;
  message?: string;
  steps?: any[];
  intent?: string | null;
  /** 'router' = orchestrating section, 'agent' = agent-internal tools (default) */
  variant?: 'router' | 'agent';
}

/* ── Constants ── */

const MODE_LABELS: Record<string, string> = {
  both: 'Hybrid-Suche',
  sql: 'Keyword-Suche',
  semantic: 'Semantische Suche',
};

const STEP_NAMES: Record<string, string> = {
  router: 'Analyse',
  orchestrating: 'Routing',
  sql_search: 'Keyword-Suche',
  semantic_search: 'Semantische Suche',
  merge: 'Zusammenführung',
  generating: 'Generierung',
};

const ACTIVE_TITLES: Record<string, string> = {
  router: 'Suchstrategie wird festgelegt...',
  orchestrating: 'Agent wird ausgewählt...',
  sql_search: 'Durchsuche Karten...',
  semantic_search: 'Semantische Suche...',
  merge: 'Kombiniere Quellen...',
  generating: 'Generiere Antwort...',
};

function getDoneLabel(step: string, data: Record<string, any>, status: string): string {
  if (status === 'error') return `${STEP_NAMES[step] || step} fehlgeschlagen`;
  switch (step) {
    case 'router':
    case 'orchestrating': {
      const rm = data.retrieval_mode || '';
      if (rm.startsWith('subagent:') || rm.startsWith('agent:')) {
        return 'Aufgabe zugewiesen';
      }
      const mode = MODE_LABELS[rm] || rm || '';
      const scope = data.scope_label || '';
      if (rm === 'plusi') return 'Plusi';
      if (!data.search_needed) return 'Direkte Antwort';
      return scope ? `${mode} · ${scope}` : mode || 'Anfrage analysiert';
    }
    case 'sql_search':
      return `${data.total_hits || 0} Keyword-Treffer`;
    case 'semantic_search':
      return `${data.total_hits || 0} semantische Treffer`;
    case 'merge': {
      const t = data.total || 0;
      const k = data.keyword_count || 0;
      const s = data.semantic_count || 0;
      return `${t} Quelle${t !== 1 ? 'n' : ''} kombiniert` + (k + s > 0 ? ` (${k}K + ${s}S)` : '');
    }
    case 'generating':
      return 'Antwort generiert';
    default:
      return step;
  }
}

/* ═══════════════════════════════════════════════════
   ACCUMULATING PIPELINE HOOK (v6)
   - Steps accumulate in a flat list
   - Each step updates status inline (active → done)
   - New steps throttled by MIN_STEP_INTERVAL
   - No promotion queue, no Active Box
   ═══════════════════════════════════════════════════ */

function useAccumulatingPipeline(
  pipelineSteps: PipelineStep[],
  generation: number = 0
): { displaySteps: DisplayStep[]; isProcessing: boolean } {
  const [displaySteps, setDisplaySteps] = useState<DisplayStep[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const queueRef = useRef<PipelineStep[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastShowTimeRef = useRef(0);
  const prevGenerationRef = useRef(generation);
  const knownStepsRef = useRef<Set<string>>(new Set());

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
        { step: next.step, status: next.status, data: next.data || {}, visibleSince: Date.now() }
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
        queueRef.current.push(s);
      }
    }

    // 3. Flush queue
    flushQueue();
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
   PHASE-SPECIFIC CONTENT COMPONENTS (v5)
   ═══════════════════════════════════════════════════ */

/* ── Router Details (done state) ── */
function RouterDetails({ data, agentColor }: { data: Record<string, any>; agentColor?: string }) {
  const RESPONSE_LENGTH_LABELS: Record<string, string> = {
    short: 'Kurz',
    medium: 'Mittel',
    long: 'Ausführlich',
  };

  const retrievalMode = data.retrieval_mode || '';
  const isAgentRoute = retrievalMode.startsWith('subagent:') || retrievalMode.startsWith('agent:');
  const agentId = isAgentRoute ? retrievalMode.split(':')[1] : '';

  // Agent routing — show agent-specific tags with distinct icons
  if (isAgentRoute) {
    const agentLabel = agentId.charAt(0).toUpperCase() + agentId.slice(1);
    const isDirect = data.scope === 'none' || !data.scope;

    // SVG icon paths (16x16 viewBox)
    // Routing: split-path / decision tree
    const routingIcon = 'M3 3v10M3 8h4l3-5h3M3 8h4l3 5h3';
    // Agent: connected nodes — autonomous units in a network
    const agentIcon = 'M4 4L12 4M4 4L8 12M12 4L8 12M4 4a1.5 1.5 0 1 0 0-.01M12 4a1.5 1.5 0 1 0 0-.01M8 12a1.5 1.5 0 1 0 0-.01';
    // Modus: direct bolt vs routed arrows
    const modusIcon = isDirect ? 'M8 2l-3 6h6l-3 6' : 'M2 4h5l3 4-3 4h5';

    const tags = [
      { label: 'Routing', value: 'Agent', icon: routingIcon, color: undefined as string | undefined },
      { label: 'Agent', value: agentLabel, icon: agentIcon, color: agentColor },
      { label: 'Modus', value: isDirect ? 'Direkt' : 'Router', icon: modusIcon, color: undefined as string | undefined },
    ];

    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
        {tags.map((tag) => (
          <div
            key={tag.label}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11,
              padding: '3px 8px',
              borderRadius: 5,
              background: tag.color ? `${tag.color}18` : 'var(--ds-hover-tint)',
              border: tag.color ? `1px solid ${tag.color}35` : 'none',
            }}
          >
            <svg width={10} height={10} viewBox="0 0 16 16" fill={tag.label === 'Agent' && tag.color ? tag.color : 'none'} stroke={tag.color || 'currentColor'} strokeWidth={tag.label === 'Agent' ? 1 : 1.2} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: tag.color ? 0.8 : 0.25 }}>
              <path d={tag.icon} />
            </svg>
            <span style={{ color: 'var(--ds-text-muted)' }}>{tag.label}</span>
            <span style={{ color: tag.color || 'var(--ds-text-tertiary)', fontWeight: 500 }}>{tag.value}</span>
          </div>
        ))}
      </div>
    );
  }

  const isPlusi = retrievalMode === 'plusi';
  const tags = data.search_needed === false
    ? (isPlusi
      ? [
          { label: 'Modus', value: 'Plusi', icon: 'M8 2v12M2 8h12' },
          { label: 'Kontext', value: 'Nicht benötigt', icon: 'M2 3h12v10H2zM2 6h12' },
        ]
      : [
          { label: 'Strategie', value: 'Direkte Antwort', icon: 'M8 2v12M2 8h12' },
          { label: 'Kontext', value: 'Nicht benötigt', icon: 'M2 3h12v10H2zM2 6h12' },
          { label: 'Antwort', value: RESPONSE_LENGTH_LABELS[data.response_length] || 'Mittel', icon: 'M3 13V5h3v8M7 13V3h3v10M11 13V7h3v6' },
        ]
    )
    : [
        {
          label: 'Strategie',
          value: MODE_LABELS[data.retrieval_mode] || data.retrieval_mode || '—',
          icon: 'M8 2v12M2 8h12',
        },
        {
          label: 'Scope',
          value: data.scope_label || (data.scope === 'current' ? 'Aktueller Stapel' : 'Alle Stapel'),
          icon: 'M2 3h12v10H2zM2 6h12',
        },
        {
          label: 'Quellen',
          value: ({ low: 'Wenig (5)', medium: 'Mittel (10)', high: 'Viel (15)' } as Record<string, string>)[data.max_sources] || 'Mittel (10)',
          icon: 'M3 13V5h3v8M7 13V3h3v10M11 13V7h3v6',
        },
      ];

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
      {tags.map((tag) => (
        <div
          key={tag.label}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 11,
            padding: '3px 8px',
            borderRadius: 5,
            background: 'var(--ds-hover-tint)',
          }}
        >
          <svg width={10} height={10} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" style={{ opacity: 0.2 }}>
            <path d={tag.icon} />
          </svg>
          <span style={{ color: 'var(--ds-text-muted)' }}>{tag.label}</span>
          <span style={{ color: 'var(--ds-text-tertiary)', fontWeight: 500 }}>{tag.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Router Thinking (active state) — Skeleton tags matching done layout ── */
function RouterThinking() {
  const skeletonTags = [
    { label: 'Routing', width: 52, icon: 'M3 3v10M3 8h4l3-5h3M3 8h4l3 5h3' },
    { label: 'Agent', width: 64, icon: 'M4 4L12 4M4 4L8 12M12 4L8 12M4 4a1.5 1.5 0 1 0 0-.01M12 4a1.5 1.5 0 1 0 0-.01M8 12a1.5 1.5 0 1 0 0-.01' },
    { label: 'Modus', width: 48, icon: 'M8 2l-3 6h6l-3 6' },
  ];

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
      {skeletonTags.map((tag) => (
        <div
          key={tag.label}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 11,
            padding: '3px 8px',
            borderRadius: 5,
            background: 'var(--ds-hover-tint)',
          }}
        >
          <svg width={10} height={10} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" style={{ opacity: 0.2 }}>
            <path d={tag.icon} />
          </svg>
          <span style={{ color: 'var(--ds-text-muted)' }}>{tag.label}</span>
          {/* Shimmer placeholder for value */}
          <div
            style={{
              width: tag.width,
              height: 10,
              borderRadius: 3,
              background: 'linear-gradient(90deg, var(--ds-hover-tint), var(--ds-active-tint), var(--ds-hover-tint))',
              backgroundSize: '200% 100%',
              animation: 'ts-shimmerWave 2s ease-in-out infinite',
            }}
          />
        </div>
      ))}
    </div>
  );
}

/* ── SQL Tags ── */
function SqlTags({ data, isDone, animate = true }: { data: Record<string, any>; isDone: boolean; animate?: boolean }) {
  const queries = data.queries || [];
  if (queries.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
      {queries.map((q: any, i: number) => (
        <div
          key={i}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 11,
            padding: '3px 8px',
            borderRadius: 5,
            background: 'var(--ds-hover-tint)',
            color: 'var(--ds-text-secondary)',
            animation: animate ? `ts-pulseIn 0.3s ease-out ${i * 0.15}s both` : undefined,
          }}
        >
          <svg width={10} height={10} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" style={{ opacity: 0.3 }}>
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5L14 14" />
          </svg>
          <span>{q.text || q}</span>
          {isDone && typeof q.hits === 'number' && (
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: 10,
                color: q.hits > 0 ? 'color-mix(in srgb, var(--ds-green) 60%, transparent)' : 'var(--ds-text-muted)',
              }}
            >
              {q.hits}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Semantic Chunks ── */
function SemanticChunks({ data, isDone, animate = true }: { data: Record<string, any>; isDone: boolean; animate?: boolean }) {
  const chunks = data.chunks || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, marginTop: 6 }}>
      {chunks.slice(0, 3).map((chunk: any, i: number) => (
        <div
          key={i}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '5px 8px',
            borderRadius: 6,
            background: 'var(--ds-hover-tint)',
            position: 'relative',
            overflow: 'hidden',
            maxWidth: '100%',
          }}
        >
          {/* Scan glow overlay when active */}
          {!isDone && animate && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                height: '100%',
                width: '40%',
                left: '-40%',
                background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--ds-accent) 8%, transparent), transparent)',
                animation: 'ts-scanGlow 2s ease-in-out infinite',
                pointerEvents: 'none',
              }}
            />
          )}
          <span
            style={{
              fontSize: 11,
              fontFamily: 'monospace',
              color: 'var(--ds-accent)',
              opacity: 0.7,
              minWidth: 36,
              flexShrink: 0,
            }}
          >
            {typeof chunk.score === 'number' ? chunk.score.toFixed(3) : '—'}
          </span>
          <span
            style={{
              fontSize: 11,
              color: 'var(--ds-text-secondary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              animation: animate ? `ts-fadeBlurIn 0.8s ease-out ${i * 0.3}s both` : undefined,
            }}
          >
            {chunk.snippet || chunk.text || ''}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Merge Bar ── */
function MergeBar({ data }: { data: Record<string, any> }) {
  const kw = data.keyword_count || 0;
  const sem = data.semantic_count || 0;
  const total = kw + sem;
  // Weight position: 0 = all keyword, 1 = all semantic
  const wp = typeof data.weight_position === 'number'
    ? data.weight_position
    : (total > 0 ? sem / total : 0.5);
  const wpPct = `${Math.round(wp * 100)}%`;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
      <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'color-mix(in srgb, var(--ds-accent) 60%, transparent)', fontWeight: 600 }}>
        {kw}K
      </span>
      {/* Track */}
      <div style={{ flex: 1, position: 'relative', height: 5, display: 'flex', alignItems: 'center' }}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: 1.5,
            borderRadius: 1,
            background: `linear-gradient(90deg, color-mix(in srgb, var(--ds-accent) 30%, transparent) 0%, color-mix(in srgb, var(--ds-accent) 40%, transparent) ${wpPct}, color-mix(in srgb, var(--ds-green) 40%, transparent) ${wpPct}, var(--ds-green-30) 100%)`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: wpPct,
            transform: 'translateX(-50%)',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--ds-accent)',
            boxShadow: '0 0 6px color-mix(in srgb, var(--ds-accent) 40%, transparent)',
          }}
        />
      </div>
      <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'color-mix(in srgb, var(--ds-green) 60%, transparent)', fontWeight: 600 }}>
        {sem}S
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   PHASE ROW — Unified renderer for active + done
   ═══════════════════════════════════════════════════ */

function PhaseRow({ step, data, status, isActive, isFirst = false, animate = true, agentColor }: { step: string; data: Record<string, any>; status: string; isActive: boolean; isFirst?: boolean; animate?: boolean; agentColor?: string }) {
  const isDone = !isActive;

  // Title logic
  let title: string;
  if (isActive) {
    title = ACTIVE_TITLES[step] || 'Verarbeite...';
  } else if (step === 'router' || step === 'orchestrating') {
    const rm = data.retrieval_mode || '';
    if (rm.startsWith('subagent:') || rm.startsWith('agent:')) {
      title = 'Aufgabe zugewiesen';
    } else if (rm === 'plusi') {
      title = 'Plusi';
    } else if (!data.search_needed) {
      title = 'Direkte Antwort';
    } else {
      const mode = MODE_LABELS[rm] || rm || '';
      const scope = data.scope_label || '';
      title = scope ? `${mode} · ${scope}` : mode || 'Anfrage analysiert';
    }
  } else {
    title = getDoneLabel(step, data, status);
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
          <span style={{ fontSize: 10, color: agentColor ? `color-mix(in srgb, ${agentColor} 50%, transparent)` : 'var(--ds-green-50)' }}>&#10003;</span>
        )}
      </div>

      {/* Phase-specific content */}
      <div style={{ marginLeft: 14 }}>
        {(step === 'router' || step === 'orchestrating') && isActive && animate && <RouterThinking />}
        {(step === 'router' || step === 'orchestrating') && isDone && <RouterDetails data={data} agentColor={agentColor} />}
        {step === 'sql_search' && <SqlTags data={data} isDone={isDone} animate={animate} />}
        {step === 'semantic_search' && <SemanticChunks data={data} isDone={isDone} animate={animate} />}
        {step === 'merge' && isDone && <MergeBar data={data} />}
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

/* ── Legacy fallback (old step format) ── */

function LegacyDoneStep({ label, isError }: { label: string; isError: boolean }) {
  return (
    <div className="flex items-center gap-2 py-[5px]" style={{ borderTop: '1px solid var(--ds-hover-tint)' }}>
      <div className={`w-[5px] h-[5px] rounded-full flex-shrink-0 ${isError ? 'bg-error/40' : ''}`}
        style={isError ? {} : { background: 'var(--ds-text-muted)' }}
      />
      <span className={`text-[11px] flex-1 ${isError ? 'text-error/50' : ''}`}
        style={isError ? {} : { color: 'var(--ds-text-placeholder)' }}
      >
        {label}
      </span>
      {!isError && (
        <span className="text-[10px]" style={{ color: 'var(--ds-green-50)' }}>&#10003;</span>
      )}
    </div>
  );
}

function LegacyThoughtStream({ steps, citations, citationIndices, bridge, onPreviewCard }: any) {
  const hasCitations = Object.keys(citations || {}).length > 0;
  const labels: string[] = Array.isArray(steps)
    ? steps.map((s: any) => (typeof s === 'string' ? s : s.state || s.label || '')).filter(Boolean)
    : [];
  if (labels.length === 0 && !hasCitations) return null;

  const [collapsed, setCollapsed] = useState(true);

  return (
    <div className="mb-2 max-w-full select-none">
      {collapsed ? (
        <>
          <button
            onClick={() => setCollapsed(false)}
            className="flex items-center gap-1.5 w-full text-left py-1 opacity-40 hover:opacity-60 transition-opacity cursor-pointer"
          >
            <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.25 }}>
              <path d="M6 4l4 4-4 4" />
            </svg>
            <span className="text-[11px] text-base-content/35">
              {labels.length} Schritt{labels.length !== 1 ? 'e' : ''}
              {hasCitations ? ` · ${Object.keys(citations).length} Quellen` : ''}
            </span>
          </button>
        </>
      ) : (
        <>
          <button
            onClick={() => setCollapsed(true)}
            className="flex items-center gap-1.5 w-full text-left py-1 mb-1 opacity-50 hover:opacity-70 transition-opacity cursor-pointer"
          >
            <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.25 }}>
              <path d="M4 6l4 4 4-4" />
            </svg>
            <span className="text-[11px] text-base-content/40">
              {labels.length} Schritt{labels.length !== 1 ? 'e' : ''}
            </span>
          </button>
          <div>
            {labels.map((label, i) => (
              <LegacyDoneStep key={i} label={label} isError={false} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT (v6)
   ═══════════════════════════════════════════════════ */

export default function ThoughtStream({
  pipelineSteps = [],
  pipelineGeneration = 0,
  agentColor,
  citations = {},
  citationIndices = {},
  isStreaming = false,
  bridge = null,
  onPreviewCard,
  message = '',
  steps = [],
  intent = null,
  variant = 'agent',
}: ThoughtStreamProps) {
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

  const isLegacy = pipelineSteps.length === 0 && steps.length > 0;
  const { displaySteps, isProcessing } = useAccumulatingPipeline(pipelineSteps, pipelineGeneration);
  const animate = isStreaming || isProcessing;

  // Collapse state
  const hasText = Boolean(message && message.trim().length > 0);
  const allStepsDone = displaySteps.length > 0 && displaySteps.every(ds => ds.status === 'done');

  // Initial state: saved messages (not streaming) start collapsed; live messages start expanded
  const [isCollapsed, setIsCollapsed] = useState(!isStreaming && hasText);
  // Track if user manually toggled — prevents auto-collapse from overriding user intent
  const userExpandedRef = useRef(false);

  // Auto-collapse rules:
  // - Router variant: collapse when orchestrating step completes
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
      // Agent: collapse after MIN_STEP_INTERVAL when all displaySteps are done and no text yet
      // This ensures the last step is visible for at least 800ms before collapsing
      if (allStepsDone && !hasText && !isCollapsed && !isProcessing) {
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
  }, [isRouterVariant, allStepsDone, hasText, isCollapsed, isProcessing]);

  // Expand when new pipeline starts — reset user override
  useEffect(() => {
    if (isProcessing) {
      setIsCollapsed(false);
      userExpandedRef.current = false;
    }
  }, [isProcessing]);

  const hasCitations = Object.keys(citations).length > 0;
  const citationCount = Object.keys(citations).length;
  // Show when processing, has data, OR when streaming started but no events yet
  const showLoadingBox = isStreaming && !isProcessing && displaySteps.length === 0 && pipelineSteps.length === 0 && !isLegacy;
  // Include pipelineSteps.length > 0 to prevent flash: steps arrive before hook effect runs
  const hasContent = isProcessing || displaySteps.length > 0 || isLegacy || showLoadingBox || (isStreaming && pipelineSteps.length > 0);
  const totalSteps = displaySteps.filter(d => d.status !== 'active').length;

  if (!hasContent) return null;
  if (isLegacy) return <LegacyThoughtStream steps={steps} citations={citations} citationIndices={citationIndices} bridge={bridge} onPreviewCard={onPreviewCard} />;

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
          {/* Text skeleton — shows after ThoughtStream collapses, waiting for text */}
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
      {(!isCollapsed || showLoadingBox || (isStreaming && pipelineSteps.length > 0 && displaySteps.length === 0)) && (
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

          {/* Step rows — single flat list */}
          <div style={{ marginLeft: 16 }}>
            {displaySteps.map((ds, idx) => (
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

            {/* Source cards — show after all pipeline steps done */}
            {hasCitations && !displaySteps.some(d => d.status === 'active') && (
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
