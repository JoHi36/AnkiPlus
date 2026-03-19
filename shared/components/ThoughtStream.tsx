import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import SourcesCarousel from './SourcesCarousel';
import type { Citation } from './SourceCard';

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
@keyframes ts-shimmerWave {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes ts-dotPulse {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.3); }
}
@keyframes ts-fadeBlurIn {
  0% { filter: blur(4px); opacity: 0.3; }
  100% { filter: blur(0); opacity: 1; }
}
@keyframes ts-pulseIn {
  0% { opacity: 0; transform: scale(0.95); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes ts-scanGlow {
  0% { left: -30%; }
  100% { left: 100%; }
}
@keyframes ts-numberSlide {
  0% { transform: translateY(100%); opacity: 0; }
  100% { transform: translateY(0); opacity: 1; }
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
   PHASE-SPECIFIC CONTENT COMPONENTS
   ═══════════════════════════════════════════════════ */

/* ── Router Phase ── */
function RouterContent({ data, isDone }: { data: Record<string, any>; isDone: boolean }) {
  if (!isDone) return null;
  const mode = MODE_LABELS[data.retrieval_mode] || data.retrieval_mode || '';
  const scope = data.scope_label || '';
  if (!data.search_needed) {
    return (
      <div className="mt-2 text-[11px] text-base-content/40">
        Keine Suche nötig — direkte Antwort
      </div>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
      <span className="text-base-content/30">Suche <span className="text-base-content/50">{mode}</span></span>
      {scope && <span className="text-base-content/30">Scope <span className="text-base-content/50">{scope}</span></span>}
    </div>
  );
}

/* ── SQL Search Phase ── */
function SqlContent({ data, isDone }: { data: Record<string, any>; isDone: boolean }) {
  const queries = data.queries || [];
  if (queries.length === 0 && !isDone) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {queries.map((q: any, i: number) => (
        <div
          key={i}
          className="inline-flex items-center gap-1.5 text-[11px] py-1 px-2.5 rounded-md"
          style={{
            background: 'rgba(255,255,255,0.05)',
            color: 'rgba(232,232,232,0.5)',
            animation: `ts-pulseIn 0.3s ease-out ${i * 0.15}s both`,
          }}
        >
          <Search size={10} style={{ opacity: 0.3 }} />
          <span>{q.text || q}</span>
          {isDone && typeof q.hits === 'number' && (
            <span
              className="font-mono text-[10px]"
              style={{ color: q.hits > 0 ? 'rgba(20,184,166,0.6)' : 'rgba(232,232,232,0.2)' }}
            >
              {q.hits}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Semantic Search Phase ── */
function SemanticContent({ data, isDone }: { data: Record<string, any>; isDone: boolean }) {
  const chunks = data.chunks || [];
  if (chunks.length === 0) return null;

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {chunks.slice(0, 3).map((chunk: any, i: number) => (
        <div
          key={i}
          className="flex items-center gap-2.5 py-2 px-2.5 rounded-lg relative overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.02)' }}
        >
          {/* Glow scan overlay */}
          {!isDone && (
            <div
              className="absolute top-0 h-full pointer-events-none"
              style={{
                width: '30%',
                left: '-30%',
                background: 'linear-gradient(90deg, transparent, rgba(10,132,255,0.08), transparent)',
                animation: 'ts-scanGlow 2s ease-in-out infinite',
              }}
            />
          )}
          <span
            className="text-[11px] font-mono flex-shrink-0"
            style={{ color: '#0a84ff', opacity: 0.7, minWidth: 36 }}
          >
            {typeof chunk.score === 'number' ? chunk.score.toFixed(3) : '—'}
          </span>
          <span
            className="text-[11px] truncate"
            style={{
              color: 'rgba(232,232,232,0.5)',
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

/* ── Merge Phase ── */
function MergeContent({ data, isDone }: { data: Record<string, any>; isDone: boolean }) {
  const kw = data.keyword_count || 0;
  const sem = data.semantic_count || 0;
  const total = data.total || 0;
  const wp = typeof data.weight_position === 'number' ? data.weight_position : 0.5;
  const wpPct = `${Math.round(wp * 100)}%`;

  if (!isDone && kw === 0 && sem === 0) return null;

  return (
    <div className="mt-2">
      {/* Labels row */}
      <div className="flex justify-between items-center px-0.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] uppercase tracking-wider" style={{ color: 'rgba(232,232,232,0.2)' }}>Keyword</span>
          <span className="text-[13px] font-semibold font-mono" style={{ color: 'rgba(10,132,255,0.6)' }}>{kw}</span>
        </div>
        <div className="flex flex-col gap-0.5 text-right">
          <span className="text-[9px] uppercase tracking-wider" style={{ color: 'rgba(232,232,232,0.2)' }}>Semantic</span>
          <span className="text-[13px] font-semibold font-mono" style={{ color: 'rgba(20,184,166,0.6)' }}>{sem}</span>
        </div>
      </div>
      {/* Track with glow dot */}
      <div className="relative h-8 my-2">
        <div
          className="absolute top-1/2 left-0 right-0 h-[2px] -translate-y-1/2 rounded-sm"
          style={{
            background: `linear-gradient(90deg, rgba(10,132,255,0.25) 0%, rgba(10,132,255,0.4) ${wpPct}, rgba(20,184,166,0.4) ${wpPct}, rgba(20,184,166,0.25) 100%)`,
          }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full"
          style={{
            left: wpPct,
            background: '#0a84ff',
            boxShadow: '0 0 8px rgba(10,132,255,0.5), 0 0 20px rgba(10,132,255,0.2)',
            transition: 'left 0.6s cubic-bezier(0.25, 0.1, 0.25, 1)',
          }}
        />
      </div>
      {/* Total */}
      {isDone && total > 0 && (
        <div className="text-center">
          <div
            className="text-[20px] font-semibold"
            style={{
              color: 'rgba(232,232,232,0.8)',
              animation: 'ts-numberSlide 0.4s ease-out both',
              overflow: 'hidden',
            }}
          >
            {total}
          </div>
          <div className="text-[11px]" style={{ color: 'rgba(232,232,232,0.25)' }}>Quellen kombiniert</div>
        </div>
      )}
    </div>
  );
}

/* ── Generating Phase (Shimmer) ── */
function GeneratingContent() {
  return (
    <div
      className="mt-2 h-[3px] rounded-sm overflow-hidden"
      style={{
        background: 'linear-gradient(90deg, transparent 0%, rgba(10,132,255,0.05) 20%, rgba(10,132,255,0.3) 50%, rgba(10,132,255,0.05) 80%, transparent 100%)',
        backgroundSize: '200% 100%',
        animation: 'ts-shimmerWave 2s ease-in-out infinite',
      }}
    />
  );
}

/* ═══════════════════════════════════════════════════
   ACTIVE BOX — Shows current step with phase content
   ═══════════════════════════════════════════════════ */

function ActiveBox({ entry }: { entry: ActiveEntry }) {
  const title = entry.status === 'active'
    ? (ACTIVE_TITLES[entry.step] || 'Verarbeite...')
    : getDoneLabel(entry.step, entry.data, entry.status);
  const isDone = entry.status !== 'active';

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4, height: 0, marginBottom: 0, padding: 0 }}
      transition={{ duration: 0.25, exit: { duration: 0.2 } }}
      className="bg-[#1e1e1e] rounded-xl p-3 mb-1.5 border border-white/[0.04]"
    >
      {/* Title row */}
      <div className="flex items-center gap-2">
        {isDone ? (
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgba(20,184,166,0.5)' }} />
        ) : (
          <div
            className="w-1.5 h-1.5 rounded-full bg-[#0a84ff]"
            style={{ animation: 'ts-dotPulse 1.5s ease-in-out infinite' }}
          />
        )}
        <span className={`text-[12px] font-medium ${isDone ? 'text-base-content/50' : 'text-base-content/55'}`}>
          {title}
        </span>
        {isDone && entry.status !== 'error' && (
          <span className="ml-auto text-[10px]" style={{ color: 'rgba(20,184,166,0.5)' }}>&#10003;</span>
        )}
      </div>

      {/* Phase-specific content */}
      {entry.step === 'router' && <RouterContent data={entry.data} isDone={isDone} />}
      {entry.step === 'sql_search' && <SqlContent data={entry.data} isDone={isDone} />}
      {entry.step === 'semantic_search' && <SemanticContent data={entry.data} isDone={isDone} />}
      {entry.step === 'merge' && <MergeContent data={entry.data} isDone={isDone} />}
      {entry.step === 'generating' && !isDone && <GeneratingContent />}
    </motion.div>
  );
}

/* ── Loading Box (before any steps arrive) ── */

function LoadingBox() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="bg-[#1e1e1e] rounded-xl p-3 mb-1.5 border border-white/[0.04]"
    >
      <div className="flex items-center gap-2">
        <div
          className="w-1.5 h-1.5 rounded-full bg-[#0a84ff]"
          style={{ animation: 'ts-dotPulse 1.5s ease-in-out infinite' }}
        />
        <span className="text-[12px] text-base-content/45">Analysiere Anfrage...</span>
      </div>
    </motion.div>
  );
}

/* ── Done Step (timeline entry) ── */

function DoneStep({ label, isError, isLast }: { label: string; isError: boolean; isLast: boolean }) {
  return (
    <div className="flex items-center gap-2 py-[5px]" style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
      <div className={`w-[5px] h-[5px] rounded-full flex-shrink-0 ${isError ? 'bg-error/40' : ''}`}
        style={isError ? {} : { background: 'rgba(232,232,232,0.15)' }}
      />
      <span className={`text-[11px] flex-1 ${isError ? 'text-error/50' : ''}`}
        style={isError ? {} : { color: 'rgba(232,232,232,0.3)' }}
      >
        {label}
      </span>
      {!isError && (
        <span className="text-[10px]" style={{ color: 'rgba(20,184,166,0.5)' }}>&#10003;</span>
      )}
    </div>
  );
}

/* ── Legacy fallback (old step format) ── */

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
            <ChevronDown className="w-3 h-3 text-base-content/25 -rotate-90" />
            <span className="text-[11px] text-base-content/35">
              {labels.length} Schritt{labels.length !== 1 ? 'e' : ''}
              {hasCitations ? ` · ${Object.keys(citations).length} Quellen` : ''}
            </span>
          </button>
          {hasCitations && (
            <div className="mt-1 max-w-full overflow-hidden">
              <SourcesCarousel citations={citations} citationIndices={citationIndices} bridge={bridge} onPreviewCard={onPreviewCard} />
            </div>
          )}
        </>
      ) : (
        <>
          <button
            onClick={() => setCollapsed(true)}
            className="flex items-center gap-1.5 w-full text-left py-1 mb-1 opacity-50 hover:opacity-70 transition-opacity cursor-pointer"
          >
            <ChevronDown className="w-3 h-3 text-base-content/25" />
            <span className="text-[11px] text-base-content/40">
              {labels.length} Schritt{labels.length !== 1 ? 'e' : ''}
            </span>
          </button>
          <div>
            {labels.map((label, i) => (
              <DoneStep key={i} label={label} isError={false} isLast={i === labels.length - 1 && !hasCitations} />
            ))}
          </div>
          {hasCitations && (
            <div className="mt-1 max-w-full overflow-hidden">
              <SourcesCarousel citations={citations} citationIndices={citationIndices} bridge={bridge} onPreviewCard={onPreviewCard} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
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
    if (typeof document !== 'undefined' && !document.getElementById('ts-keyframes-v4')) {
      const s = document.createElement('style');
      s.id = 'ts-keyframes-v4';
      s.textContent = KEYFRAMES;
      document.head.appendChild(s);
      // Remove old keyframes if present
      const old = document.getElementById('ts-keyframes');
      if (old) old.remove();
    }
  }, []);

  const isLegacy = pipelineSteps.length === 0 && steps.length > 0;
  const { activeEntry, doneStack, isProcessing } = useSmartPipeline(pipelineSteps);

  // Collapse state
  const [isCollapsed, setIsCollapsed] = useState(false);
  const hasText = Boolean(message && message.trim().length > 0);

  // Auto-collapse when streaming text arrives and pipeline is done
  useEffect(() => {
    if (hasText && !isCollapsed && !isProcessing && !activeEntry) {
      const t = setTimeout(() => setIsCollapsed(true), 800);
      return () => clearTimeout(t);
    }
  }, [hasText, isCollapsed, isProcessing, activeEntry]);

  // Expand when new pipeline starts
  useEffect(() => {
    if (isProcessing) setIsCollapsed(false);
  }, [isProcessing]);

  const hasCitations = Object.keys(citations).length > 0;
  // Show when processing, has data, OR when streaming started but no events yet (LoadingBox)
  const showLoadingBox = isStreaming && !isProcessing && !activeEntry && doneStack.length === 0 && pipelineSteps.length === 0 && !isLegacy;
  const hasContent = isProcessing || activeEntry !== null || doneStack.length > 0 || isLegacy || showLoadingBox;
  const totalSteps = doneStack.length;

  if (!hasContent) return null;
  if (isLegacy) return <LegacyThoughtStream steps={steps} citations={citations} citationIndices={citationIndices} bridge={bridge} onPreviewCard={onPreviewCard} />;

  return (
    <div className="mb-2 max-w-full select-none">
      {/* ── Collapsed view ── */}
      {isCollapsed && !isProcessing && !showLoadingBox && (
        <>
          <button
            onClick={() => setIsCollapsed(false)}
            className="flex items-center gap-1.5 w-full text-left py-1 opacity-40 hover:opacity-60 transition-opacity cursor-pointer"
          >
            <ChevronDown className="w-3 h-3 text-base-content/25 -rotate-90" />
            <span className="text-[11px] text-base-content/35">
              {totalSteps} Schritt{totalSteps !== 1 ? 'e' : ''}
              {hasCitations ? ` · ${Object.keys(citations).length} Quellen` : ''}
            </span>
          </button>
          {hasCitations && (
            <div className="mt-1 mb-1 max-w-full overflow-hidden">
              <SourcesCarousel citations={citations} citationIndices={citationIndices} bridge={bridge} onPreviewCard={onPreviewCard} />
            </div>
          )}
        </>
      )}

      {/* ── Expanded view ── */}
      {(!isCollapsed || showLoadingBox) && (
        <div>
          {/* Collapse button (when pipeline is done and has steps) */}
          {!isProcessing && totalSteps > 0 && (
            <button
              onClick={() => setIsCollapsed(true)}
              className="flex items-center gap-1.5 w-full text-left py-1 mb-1 opacity-50 hover:opacity-70 transition-opacity cursor-pointer"
            >
              <ChevronDown className="w-3 h-3 text-base-content/25" />
              <span className="text-[11px] text-base-content/40">
                {totalSteps} Schritt{totalSteps !== 1 ? 'e' : ''}
              </span>
            </button>
          )}

          {/* Active Box */}
          <AnimatePresence mode="wait">
            {activeEntry ? (
              <ActiveBox key={activeEntry.step} entry={activeEntry} />
            ) : (isProcessing || showLoadingBox) && doneStack.length === 0 ? (
              <LoadingBox key="loading" />
            ) : null}
          </AnimatePresence>

          {/* Done stack */}
          {doneStack.length > 0 && (
            <div className="ml-0.5">
              {doneStack.map((entry, i) => (
                <DoneStep
                  key={entry.step}
                  label={entry.label}
                  isError={entry.isError}
                  isLast={i === doneStack.length - 1 && !hasCitations}
                />
              ))}
            </div>
          )}

          {/* Sources carousel */}
          {hasCitations && (
            <div className="mt-1 max-w-full overflow-hidden">
              <SourcesCarousel citations={citations} citationIndices={citationIndices} bridge={bridge} onPreviewCard={onPreviewCard} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
