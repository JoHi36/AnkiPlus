import React, { useState, useEffect, useRef, useCallback } from 'react';

/* ═══════════════════════════════════════════════════
   ThoughtStream v4 — Smart Pipeline + Phase Animations
   - Guaranteed visibility queue (800ms min per step)
   - Phase-specific Active Box content (SQL tags, Embedding glow, Merge bar, Shimmer)
   - Two states per step: active (loading) → done (results) inside same box
   - Clean collapse/expand for saved messages
   ═══════════════════════════════════════════════════ */

const MIN_PHASE_DURATION = 800;
const DONE_GRACE = 300; // Extra ms to show results after done

const KEYFRAMES = `
@keyframes ts-phaseReveal {
  from { opacity: 0; transform: translateY(-3px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes ts-dotPulse {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.3); }
}
@keyframes ts-routerScan {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
@keyframes ts-routerDotFloat {
  0%, 100% { transform: translateX(0); opacity: 0.4; }
  50% { transform: translateX(3px); opacity: 0.8; }
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

interface ActiveEntry {
  step: string;
  status: 'active' | 'done' | 'error';
  data: Record<string, any>;
  label: string;
}

interface DoneEntry {
  step: string;
  label: string;
  isError: boolean;
}

export interface ThoughtStreamProps {
  pipelineSteps?: PipelineStep[];
  citations?: Record<string, any>;
  citationIndices?: Record<string, number>;
  isStreaming?: boolean;
  bridge?: any;
  onPreviewCard?: (citation: Citation) => void;
  message?: string;
  steps?: any[];
  intent?: string | null;
}

/* ── Constants ── */

const MODE_LABELS: Record<string, string> = {
  both: 'Hybrid-Suche',
  sql: 'Keyword-Suche',
  semantic: 'Semantische Suche',
};

const STEP_NAMES: Record<string, string> = {
  router: 'Analyse',
  sql_search: 'Keyword-Suche',
  semantic_search: 'Semantische Suche',
  merge: 'Zusammenführung',
  generating: 'Generierung',
};

const ACTIVE_TITLES: Record<string, string> = {
  router: 'Analysiere Anfrage...',
  sql_search: 'Durchsuche Karten...',
  semantic_search: 'Semantische Suche...',
  merge: 'Kombiniere Quellen...',
  generating: 'Generiere Antwort...',
};

function getDoneLabel(step: string, data: Record<string, any>, status: string): string {
  if (status === 'error') return `${STEP_NAMES[step] || step} fehlgeschlagen`;
  switch (step) {
    case 'router': {
      const mode = MODE_LABELS[data.retrieval_mode] || data.retrieval_mode || '';
      const scope = data.scope_label || '';
      if (!data.search_needed) return 'Keine Suche nötig';
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
   SMART PIPELINE HOOK
   - Tracks activeEntry (what's in the Active Box)
   - Guarantees MIN_PHASE_DURATION visibility per step
   - Shows active→done transition in the same box
   - Uses polling interval to drive promotions (no recursive setTimeout chains)
   ═══════════════════════════════════════════════════ */

function useSmartPipeline(pipelineSteps: PipelineStep[]) {
  const [activeEntry, setActiveEntry] = useState<ActiveEntry | null>(null);
  const [doneStack, setDoneStack] = useState<DoneEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const pendingRef = useRef<ActiveEntry[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const activeRef = useRef<ActiveEntry | null>(null);
  const showStartRef = useRef<number>(0);
  // Track if a promotion is already scheduled
  const promotionScheduledRef = useRef(false);

  // Promote: move active → done stack, show next from queue
  const promote = useCallback(() => {
    promotionScheduledRef.current = false;
    const current = activeRef.current;
    if (current) {
      const label = getDoneLabel(current.step, current.data, current.status);
      setDoneStack(prev => [{ step: current.step, label, isError: current.status === 'error' }, ...prev]);
    }
    // Show next
    const next = pendingRef.current.shift();
    if (next) {
      activeRef.current = next;
      setActiveEntry({ ...next });
      showStartRef.current = Date.now();
      // If already done, schedule promotion after min time + grace
      if (next.status !== 'active') {
        schedulePromotion(MIN_PHASE_DURATION + DONE_GRACE);
      }
    } else {
      activeRef.current = null;
      setActiveEntry(null);
    }
  }, []);

  const schedulePromotion = useCallback((delay: number) => {
    if (promotionScheduledRef.current) return; // already scheduled
    promotionScheduledRef.current = true;
    setTimeout(() => promote(), delay);
  }, [promote]);

  // Ingest pipeline steps
  useEffect(() => {
    if (!pipelineSteps || pipelineSteps.length === 0) {
      pendingRef.current = [];
      seenRef.current = new Set();
      activeRef.current = null;
      promotionScheduledRef.current = false;
      setActiveEntry(null);
      setDoneStack([]);
      setIsProcessing(false);
      return;
    }

    setIsProcessing(true);

    for (const s of pipelineSteps) {
      const entry: ActiveEntry = {
        step: s.step,
        status: s.status,
        data: s.data || {},
        label: getDoneLabel(s.step, s.data || {}, s.status),
      };

      // Currently showing in Active Box?
      if (activeRef.current && activeRef.current.step === s.step) {
        activeRef.current = entry;
        setActiveEntry({ ...entry });

        // If it went done and no promotion scheduled yet, check timing
        if (s.status !== 'active' && !promotionScheduledRef.current) {
          const elapsed = Date.now() - showStartRef.current;
          const remaining = Math.max(0, MIN_PHASE_DURATION - elapsed) + DONE_GRACE;
          schedulePromotion(remaining);
        }
        continue;
      }

      // Already seen?
      if (seenRef.current.has(s.step)) {
        // In pending queue?
        const pendingIdx = pendingRef.current.findIndex(p => p.step === s.step);
        if (pendingIdx >= 0) {
          pendingRef.current[pendingIdx] = entry;
          continue;
        }
        // In done stack — update label
        if (s.status !== 'active') {
          const label = getDoneLabel(s.step, s.data || {}, s.status);
          setDoneStack(prev => prev.map(d => d.step === s.step ? { ...d, label, isError: s.status === 'error' } : d));
        }
        continue;
      }

      // New step
      seenRef.current.add(s.step);

      if (!activeRef.current) {
        // Show immediately
        activeRef.current = entry;
        setActiveEntry({ ...entry });
        showStartRef.current = Date.now();

        // If arrives already done, schedule promotion
        if (s.status !== 'active') {
          schedulePromotion(MIN_PHASE_DURATION + DONE_GRACE);
        }
      } else {
        pendingRef.current.push(entry);
      }
    }
  }, [pipelineSteps, schedulePromotion]);

  // Detect when processing is truly done
  useEffect(() => {
    if (!activeEntry && pendingRef.current.length === 0 && seenRef.current.size > 0 &&
        !pipelineSteps?.some(s => s.status === 'active')) {
      const t = setTimeout(() => setIsProcessing(false), 100);
      return () => clearTimeout(t);
    }
  }, [activeEntry, pipelineSteps]);

  return { activeEntry, doneStack, isProcessing };
}

/* ═══════════════════════════════════════════════════
   PHASE-SPECIFIC CONTENT COMPONENTS (v5)
   ═══════════════════════════════════════════════════ */

/* ── Router Details (done state) ── */
function RouterDetails({ data }: { data: Record<string, any> }) {
  if (!data.search_needed) {
    return (
      <div style={{ marginTop: 4, fontSize: 11, color: 'var(--ds-text-placeholder)' }}>
        Keine Suche nötig — direkte Antwort
      </div>
    );
  }

  const MAX_SOURCES_LABELS: Record<string, string> = {
    low: 'Wenig (5)',
    medium: 'Mittel (10)',
    high: 'Viel (15)',
  };

  const tags = [
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
      value: MAX_SOURCES_LABELS[data.max_sources] || 'Mittel (10)',
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

/* ── Router Thinking (active state) ── */
function RouterThinking() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
      <div
        style={{
          width: 80,
          height: 3,
          borderRadius: 2,
          background: 'linear-gradient(90deg, rgba(10,132,255,0.1), rgba(168,85,247,0.2), rgba(10,132,255,0.1))',
          backgroundSize: '200% 100%',
          animation: 'ts-shimmerWave 2s ease-in-out infinite',
        }}
      />
      <div style={{ display: 'flex', gap: 3 }}>
        {[0, 0.2, 0.4].map((delay, i) => (
          <div
            key={i}
            style={{
              width: 3,
              height: 3,
              borderRadius: '50%',
              background: 'rgba(10,132,255,0.5)',
              animation: `ts-dotPulse 1.5s ease-in-out ${delay}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* ── SQL Tags ── */
function SqlTags({ data, isDone }: { data: Record<string, any>; isDone: boolean }) {
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
            animation: `ts-pulseIn 0.3s ease-out ${i * 0.15}s both`,
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
                color: q.hits > 0 ? 'rgba(20,184,166,0.6)' : 'var(--ds-text-muted)',
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
function SemanticChunks({ data, isDone }: { data: Record<string, any>; isDone: boolean }) {
  const chunks = data.chunks || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
      {chunks.slice(0, 3).map((chunk: any, i: number) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '5px 8px',
            borderRadius: 6,
            background: 'var(--ds-hover-tint)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Scan glow overlay when active */}
          {!isDone && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                height: '100%',
                width: '40%',
                left: '-40%',
                background: 'linear-gradient(90deg, transparent, rgba(10,132,255,0.08), transparent)',
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
              animation: `ts-fadeBlurIn 0.8s ease-out ${i * 0.3}s both`,
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
      <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(10,132,255,0.6)', fontWeight: 600 }}>
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
            background: `linear-gradient(90deg, rgba(10,132,255,0.3) 0%, rgba(10,132,255,0.4) ${wpPct}, rgba(20,184,166,0.4) ${wpPct}, rgba(20,184,166,0.3) 100%)`,
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
            boxShadow: '0 0 6px rgba(10,132,255,0.4)',
          }}
        />
      </div>
      <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(20,184,166,0.6)', fontWeight: 600 }}>
        {sem}S
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   PHASE ROW — Unified renderer for active + done
   ═══════════════════════════════════════════════════ */

function PhaseRow({ step, data, status, isActive }: { step: string; data: Record<string, any>; status: string; isActive: boolean }) {
  const isDone = !isActive;

  // Title logic
  let title: string;
  if (isActive) {
    title = ACTIVE_TITLES[step] || 'Verarbeite...';
  } else if (step === 'router') {
    // Router done: show mode + scope instead of getDoneLabel
    const mode = MODE_LABELS[data.retrieval_mode] || data.retrieval_mode || '';
    const scope = data.scope_label || '';
    title = scope ? `${mode} · ${scope}` : mode || 'Anfrage analysiert';
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
        borderTop: '1px solid var(--ds-hover-tint)',
        animation: isActive ? undefined : 'ts-phaseReveal 0.25s ease-out both',
      }}
    >
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Dot */}
        {isDone ? (
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(20,184,166,0.5)', flexShrink: 0 }} />
        ) : (
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--ds-accent)',
              flexShrink: 0,
              animation: 'ts-dotPulse 1.5s ease-in-out infinite',
            }}
          />
        )}
        {/* Title */}
        <span style={{ fontSize: 12, fontWeight: 500, color: isDone ? 'var(--ds-text-tertiary)' : 'var(--ds-text-secondary)', flex: 1 }}>
          {renderedTitle}
        </span>
        {/* Checkmark */}
        {isDone && status !== 'error' && (
          <span style={{ fontSize: 10, color: 'rgba(20,184,166,0.5)' }}>&#10003;</span>
        )}
      </div>

      {/* Phase-specific content */}
      <div style={{ marginLeft: 14 }}>
        {step === 'router' && isActive && <RouterThinking />}
        {step === 'router' && isDone && <RouterDetails data={data} />}
        {step === 'sql_search' && <SqlTags data={data} isDone={isDone} />}
        {step === 'semantic_search' && <SemanticChunks data={data} isDone={isDone} />}
        {step === 'merge' && isDone && <MergeBar data={data} />}
        {step === 'generating' && isActive && (
          <div
            style={{
              marginTop: 4,
              height: 3,
              borderRadius: 2,
              background: 'linear-gradient(90deg, transparent 0%, rgba(10,132,255,0.05) 20%, rgba(10,132,255,0.3) 50%, rgba(10,132,255,0.05) 80%, transparent 100%)',
              backgroundSize: '200% 100%',
              animation: 'ts-shimmerWave 2s ease-in-out infinite',
            }}
          />
        )}
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
        background: 'linear-gradient(90deg, var(--ds-border-subtle), transparent)',
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
        <span className="text-[10px]" style={{ color: 'rgba(20,184,166,0.5)' }}>&#10003;</span>
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
   MAIN COMPONENT (v5)
   ═══════════════════════════════════════════════════ */

export default function ThoughtStream({
  pipelineSteps = [],
  citations = {},
  citationIndices = {},
  isStreaming = false,
  bridge = null,
  onPreviewCard,
  message = '',
  steps = [],
  intent = null,
}: ThoughtStreamProps) {
  // Inject keyframes once
  useEffect(() => {
    if (typeof document !== 'undefined' && !document.getElementById('ts-keyframes-v5')) {
      const s = document.createElement('style');
      s.id = 'ts-keyframes-v5';
      s.textContent = KEYFRAMES;
      document.head.appendChild(s);
      // Remove old keyframes if present
      const oldV4 = document.getElementById('ts-keyframes-v4');
      if (oldV4) oldV4.remove();
      const old = document.getElementById('ts-keyframes');
      if (old) old.remove();
    }
  }, []);

  const isLegacy = pipelineSteps.length === 0 && steps.length > 0;
  const { activeEntry, doneStack, isProcessing } = useSmartPipeline(pipelineSteps);

  // Reverse doneStack for chronological display (doneStack is newest-first)
  const chronologicalDone = [...doneStack].reverse();

  // Collapse state
  const hasText = Boolean(message && message.trim().length > 0);
  // Saved messages (not streaming) start collapsed; live messages start expanded
  const [isCollapsed, setIsCollapsed] = useState(!isStreaming && hasText);
  // Track if user manually expanded — prevents auto-collapse from overriding user intent
  const userExpandedRef = useRef(false);

  // Auto-collapse: when streaming message text appears, collapse the pipeline
  // Two conditions: (a) text arrived, (b) user hasn't manually re-expanded
  // This fires regardless of isProcessing/activeEntry — text arriving = time to collapse
  useEffect(() => {
    if (hasText && !isCollapsed && !userExpandedRef.current) {
      const t = setTimeout(() => setIsCollapsed(true), 800);
      return () => clearTimeout(t);
    }
  }, [hasText, isCollapsed]);

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
  const showLoadingBox = isStreaming && !isProcessing && !activeEntry && doneStack.length === 0 && pipelineSteps.length === 0 && !isLegacy;
  const hasContent = isProcessing || activeEntry !== null || doneStack.length > 0 || isLegacy || showLoadingBox;
  const totalSteps = doneStack.length;

  if (!hasContent) return null;
  if (isLegacy) return <LegacyThoughtStream steps={steps} citations={citations} citationIndices={citationIndices} bridge={bridge} onPreviewCard={onPreviewCard} />;

  // No-search shortcut: if only step is router with search_needed=false, just show a simple line
  const isNoSearch = !isProcessing && !activeEntry && doneStack.length > 0 &&
    doneStack.every(d => d.step === 'router') &&
    pipelineSteps.some(s => s.step === 'router' && s.data?.search_needed === false);
  if (isNoSearch) {
    return <div style={{ height: 1, margin: '8px 0', background: 'var(--ds-border-subtle)' }} />;
  }

  return (
    <div style={{ marginBottom: 8, maxWidth: '100%', userSelect: 'none', borderTop: '1px solid var(--ds-border-subtle)', paddingTop: 4 }}>
      {/* ── Collapsed view ── */}
      {isCollapsed && !isProcessing && !showLoadingBox && (
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
            {totalSteps} Schritt{totalSteps !== 1 ? 'e' : ''}
            {hasCitations ? ` · ${citationCount} Quellen` : ''}
          </span>
          <ExtendingLine />
        </button>
      )}

      {/* ── Expanded view ── */}
      {(!isCollapsed || showLoadingBox) && (
        <div>
          {/* Toggle row (when pipeline is done and has steps) */}
          {!isProcessing && totalSteps > 0 && (
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
                {totalSteps} Schritt{totalSteps !== 1 ? 'e' : ''}
              </span>
              <ExtendingLine />
            </button>
          )}

          {/* Loading state (before any steps arrive) */}
          {(isProcessing || showLoadingBox) && doneStack.length === 0 && !activeEntry && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--ds-accent)',
                  flexShrink: 0,
                  animation: 'ts-dotPulse 1.5s ease-in-out infinite',
                }}
              />
              <span style={{ fontSize: 12, color: 'var(--ds-text-tertiary)' }}>Analysiere...</span>
              <ExtendingLine />
            </div>
          )}

          {/* Chronological done phases */}
          {chronologicalDone.map((entry) => (
            <PhaseRow
              key={entry.step}
              step={entry.step}
              data={pipelineSteps.find(s => s.step === entry.step)?.data || {}}
              status={entry.isError ? 'error' : 'done'}
              isActive={false}
            />
          ))}

          {/* Active phase */}
          {activeEntry && (
            <PhaseRow
              key={`active-${activeEntry.step}`}
              step={activeEntry.step}
              data={activeEntry.data}
              status={activeEntry.status}
              isActive={activeEntry.status === 'active'}
            />
          )}
        </div>
      )}
    </div>
  );
}
