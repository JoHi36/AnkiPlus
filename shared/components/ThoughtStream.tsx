import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, ChevronDown, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import SourcesCarousel from './SourcesCarousel';
import type { Citation } from './SourceCard';

/* ═══════════════════════════════════════════════════
   ThoughtStream v2 — Active Box + Done Stack
   Queue-based: done steps are shown one at a time
   with minimum display duration per step.
   ═══════════════════════════════════════════════════ */

const MIN_PHASE_DURATION = 800;

const KEYFRAMES = `
@keyframes scanGlow {
  0% { background-position: -30% 0; }
  100% { background-position: 130% 0; }
}
@keyframes shimmerWave {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes dotPulse {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.3); }
}
`;

/* ── Types ── */

interface PipelineStep {
  step: string;
  status: 'active' | 'done' | 'error';
  data: Record<string, any>;
  timestamp: number;
}

interface DoneEntry {
  step: string;
  label: string;
  data: Record<string, any>;
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

/* ── Queue-based pipeline display ──
   Instead of reacting to active/done status directly,
   we queue done steps and show them one at a time
   with MIN_PHASE_DURATION between transitions. */

function useQueuedPipeline(pipelineSteps: PipelineStep[]) {
  const [currentDisplay, setCurrentDisplay] = useState<DoneEntry | null>(null);
  const [completedStack, setCompletedStack] = useState<DoneEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const queueRef = useRef<DoneEntry[]>([]);
  const processedStepsRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect new done steps and add to queue
  useEffect(() => {
    if (!pipelineSteps || pipelineSteps.length === 0) {
      // Reset everything
      queueRef.current = [];
      processedStepsRef.current = new Set();
      setCurrentDisplay(null);
      setCompletedStack([]);
      setIsProcessing(false);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const doneSteps = pipelineSteps.filter(
      s => s.status === 'done' || s.status === 'error'
    );

    for (const s of doneSteps) {
      const entry = {
        step: s.step,
        label: getDoneLabel(s),
        data: s.data || {},
        isError: s.status === 'error',
      };

      if (processedStepsRef.current.has(s.step)) {
        // Step already processed — update label in completedStack if data changed
        setCompletedStack(prev => prev.map(e => e.step === s.step ? entry : e));
        continue;
      }

      processedStepsRef.current.add(s.step);
      queueRef.current.push(entry);
    }

    // Check if there's an active step (for loading indicator)
    const hasActive = pipelineSteps.some(s => s.status === 'active');
    if (hasActive && !currentDisplay && queueRef.current.length === 0) {
      setIsProcessing(true);
    }
  }, [pipelineSteps]);

  // Process queue: show one item at a time with min duration
  useEffect(() => {
    if (currentDisplay !== null) return; // Already showing something
    if (queueRef.current.length === 0) {
      // Nothing to show — check if pipeline is still active
      const hasActive = pipelineSteps?.some(s => s.status === 'active') || false;
      if (!hasActive && processedStepsRef.current.size > 0) {
        setIsProcessing(false);
      }
      return;
    }

    setIsProcessing(true);
    const next = queueRef.current.shift()!;
    setCurrentDisplay(next);

    timerRef.current = setTimeout(() => {
      setCompletedStack(prev => [next, ...prev]); // Newest first
      setCurrentDisplay(null);
      timerRef.current = null;
    }, MIN_PHASE_DURATION);
  }, [currentDisplay, pipelineSteps]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { currentDisplay, completedStack, isProcessing };
}

/* ── Done label generator ── */

function getDoneLabel(step: PipelineStep): string {
  const d = step.data || {};
  if (step.status === 'error') return `${getStepName(step.step)} — Fehler`;
  switch (step.step) {
    case 'router': {
      const mode = d.retrieval_mode || '';
      const scope = d.scope_label || '';
      return scope
        ? `Anfrage analysiert — ${mode.charAt(0).toUpperCase() + mode.slice(1)}, ${scope}`
        : `Anfrage analysiert — ${mode.charAt(0).toUpperCase() + mode.slice(1)}`;
    }
    case 'sql_search':
      return `Keyword-Suche — ${d.total_hits || 0} Treffer`;
    case 'semantic_search':
      return `Semantische Suche — ${d.total_hits || 0} Treffer`;
    case 'merge': {
      const t = d.total || 0, k = d.keyword_count || 0, s = d.semantic_count || 0;
      return `Quellen kombiniert — ${t} (${k}K + ${s}S)`;
    }
    case 'generating':
      return 'Antwort generiert';
    default:
      return step.step;
  }
}

function getStepName(step: string): string {
  const names: Record<string, string> = {
    router: 'Analyse', sql_search: 'Keyword-Suche',
    semantic_search: 'Semantische Suche', merge: 'Merge', generating: 'Generierung',
  };
  return names[step] || step;
}

function getActiveTitle(step?: string): string {
  const titles: Record<string, string> = {
    router: 'Analysiere Anfrage...', sql_search: 'Keyword-Suche...',
    semantic_search: 'Semantische Suche...', merge: 'Quellen kombinieren...',
    generating: 'Generiere Antwort...',
  };
  return titles[step || ''] || 'Verarbeite...';
}

/* ═══════════════════════════════════════════════════
   Phase-specific Active Box content renderers
   ═══════════════════════════════════════════════════ */

function RouterActiveContent({ data }: { data: Record<string, any> }) {
  if (!data.retrieval_mode) return null;
  return (
    <div className="flex gap-3 items-center px-1 py-1 text-[11px]">
      <span className="text-base-content/35">Suche →</span>
      <span className="text-[#0a84ff]/70 font-medium">
        {(data.retrieval_mode || 'Hybrid').charAt(0).toUpperCase() + (data.retrieval_mode || 'hybrid').slice(1)}
      </span>
      <span className="text-base-content/20">|</span>
      <span className="text-base-content/35">Scope →</span>
      <span className="text-base-content/50">{data.scope_label || data.scope || ''}</span>
    </div>
  );
}

function SqlActiveContent({ data }: { data: Record<string, any> }) {
  const queries = data.queries || [];
  if (queries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {queries.map((q: any, i: number) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.15, duration: 0.3 }}
          className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-md
            ${q.hits > 0 ? 'bg-base-content/[0.05] text-base-content/50' : 'bg-base-content/[0.03] text-base-content/25'}`}
        >
          <Search className="w-2.5 h-2.5 opacity-40" />
          <span className={q.hits === 0 ? 'line-through decoration-base-content/15' : ''}>{q.text}</span>
          {q.hits !== undefined && (
            <span className={`text-[10px] font-mono ${q.hits > 0 ? 'text-success/60' : 'text-base-content/20'}`}>
              {q.hits > 0 ? `✓${q.hits}` : '0'}
            </span>
          )}
        </motion.span>
      ))}
    </div>
  );
}

function SemanticActiveContent({ data }: { data: Record<string, any> }) {
  const chunks = data.chunks || [];
  if (chunks.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {chunks.map((c: any, i: number) => (
        <motion.div
          key={i}
          initial={{ filter: 'blur(4px)', opacity: 0.3 }}
          animate={{ filter: 'blur(0px)', opacity: 1 }}
          transition={{ delay: i * 0.3, duration: 0.8 }}
          className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-white/[0.02] relative overflow-hidden"
        >
          <div className="absolute inset-0 pointer-events-none"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(10,132,255,0.08), transparent)',
              backgroundSize: '30% 100%',
              animation: 'scanGlow 2s ease-in-out infinite',
            }}
          />
          <span className="text-[11px] font-mono text-[#0a84ff]/70 flex-shrink-0 min-w-[36px] relative z-10">
            {c.score?.toFixed(3)}
          </span>
          <span className="text-[11px] text-base-content/50 truncate relative z-10">{c.snippet}</span>
        </motion.div>
      ))}
    </div>
  );
}

function MergeActiveContent({ data }: { data: Record<string, any> }) {
  const k = data.keyword_count || 0;
  const s = data.semantic_count || 0;
  const total = data.total || 0;
  const weight = data.weight_position || 0.5;
  const weightPercent = `${Math.round(weight * 100)}%`;
  if (!total) return null;

  return (
    <div className="py-1">
      <div className="flex justify-between px-0.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] uppercase tracking-wider text-base-content/20">Keyword</span>
          <span className="text-[13px] font-semibold font-mono text-[#0a84ff]/60">{k}</span>
        </div>
        <div className="flex flex-col gap-0.5 text-right">
          <span className="text-[9px] uppercase tracking-wider text-base-content/20">Semantic</span>
          <span className="text-[13px] font-semibold font-mono text-success/60">{s}</span>
        </div>
      </div>
      <div className="relative h-8 my-2">
        <div className="absolute top-1/2 left-0 right-0 h-[2px] -translate-y-1/2 rounded-sm"
          style={{
            background: `linear-gradient(90deg, rgba(10,132,255,0.25) 0%, rgba(10,132,255,0.4) ${weightPercent}, rgba(20,184,166,0.4) ${weightPercent}, rgba(20,184,166,0.25) 100%)`,
          }}
        />
        <div className="absolute top-1/2 w-2.5 h-2.5 rounded-full bg-[#0a84ff] z-10"
          style={{
            left: weightPercent,
            transform: 'translate(-50%, -50%)',
            boxShadow: '0 0 8px rgba(10,132,255,0.5), 0 0 20px rgba(10,132,255,0.2)',
          }}
        />
      </div>
      <div className="text-center">
        <motion.div initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.4 }}
          className="text-[20px] font-semibold text-base-content/80">{total}</motion.div>
        <div className="text-[11px] text-base-content/25">Quellen kombiniert</div>
      </div>
    </div>
  );
}

function GeneratingActiveContent() {
  return (
    <div className="h-[3px] rounded-sm overflow-hidden"
      style={{
        background: 'linear-gradient(90deg, transparent 0%, rgba(10,132,255,0.05) 20%, rgba(10,132,255,0.3) 50%, rgba(10,132,255,0.05) 80%, transparent 100%)',
        backgroundSize: '200% 100%',
        animation: 'shimmerWave 2s ease-in-out infinite',
      }}
    />
  );
}

function ActiveContent({ step, data }: { step: string; data: Record<string, any> }) {
  switch (step) {
    case 'router': return <RouterActiveContent data={data} />;
    case 'sql_search': return <SqlActiveContent data={data} />;
    case 'semantic_search': return <SemanticActiveContent data={data} />;
    case 'merge': return <MergeActiveContent data={data} />;
    case 'generating': return <GeneratingActiveContent />;
    default: return null;
  }
}

/* ── Auto-collapse hook ── */

function useAutoCollapse(isStreaming: boolean, message: string, isProcessing: boolean) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [hasAutoCollapsed, setHasAutoCollapsed] = useState(false);
  const hasText = Boolean(message && message.trim().length > 0);

  useEffect(() => {
    if ((isStreaming || isProcessing) && !hasAutoCollapsed) setIsExpanded(true);
  }, [isStreaming, isProcessing, hasAutoCollapsed]);

  useEffect(() => {
    if (hasText && !hasAutoCollapsed) {
      const t = setTimeout(() => {
        setIsExpanded(false);
        setHasAutoCollapsed(true);
      }, 500);
      return () => clearTimeout(t);
    }
  }, [hasText, hasAutoCollapsed]);

  return { isExpanded, setIsExpanded, hasAutoCollapsed };
}

/* ── Legacy fallback ── */

function LegacyThoughtStream({ steps, citations, citationIndices, bridge, onPreviewCard }: any) {
  const hasCitations = Object.keys(citations || {}).length > 0;
  const labels: string[] = Array.isArray(steps)
    ? steps.map((s: any) => (typeof s === 'string' ? s : s.state || s.label || '')).filter(Boolean)
    : [];
  if (labels.length === 0 && !hasCitations) return null;

  return (
    <div className="mb-2 max-w-full select-none">
      {labels.length > 0 && (
        <div className="flex flex-col gap-0">
          {labels.map((label: string, i: number) => (
            <div key={i} className="flex items-center gap-2 py-1.5 border-t border-white/[0.03] first:border-t-0">
              <div className="w-[5px] h-[5px] rounded-full bg-base-content/15 flex-shrink-0" />
              <span className="text-[11px] text-base-content/30 flex-1">{label}</span>
              <span className="text-[10px] text-success/50">&#x2713;</span>
            </div>
          ))}
        </div>
      )}
      {hasCitations && (
        <div className="mt-2 max-w-full overflow-hidden">
          <SourcesCarousel citations={citations} citationIndices={citationIndices} bridge={bridge} onPreviewCard={onPreviewCard} />
        </div>
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
  useEffect(() => {
    if (typeof document !== 'undefined' && !document.getElementById('thoughtstream-keyframes')) {
      const style = document.createElement('style');
      style.id = 'thoughtstream-keyframes';
      style.textContent = KEYFRAMES;
      document.head.appendChild(style);
    }
  }, []);

  const isLegacy = pipelineSteps.length === 0 && steps.length > 0;
  const { currentDisplay, completedStack, isProcessing } = useQueuedPipeline(pipelineSteps);
  const { isExpanded, setIsExpanded } = useAutoCollapse(isStreaming, message, isProcessing);

  const hasCitations = Object.keys(citations).length > 0;
  const hasContent = isProcessing || currentDisplay !== null || completedStack.length > 0 || isLegacy;
  const stepCount = completedStack.length;
  const citationCount = Object.keys(citations).length;

  if (!hasContent) return null;

  if (isLegacy) {
    return <LegacyThoughtStream steps={steps} citations={citations} citationIndices={citationIndices} bridge={bridge} onPreviewCard={onPreviewCard} />;
  }

  const handleToggle = () => {
    if (currentDisplay || isProcessing) return;
    setIsExpanded(v => !v);
  };

  const showingActive = currentDisplay !== null || isProcessing;

  return (
    <div className="mb-2 max-w-full select-none">
      {/* Collapsed header */}
      {!isExpanded && !showingActive && stepCount > 0 && (
        <button onClick={handleToggle}
          className="group flex items-center gap-1.5 w-full text-left py-1 opacity-40 hover:opacity-60 transition-opacity cursor-pointer">
          <ChevronDown className="w-3 h-3 text-base-content/30 -rotate-90 transition-transform" />
          <span className="text-[12px] text-base-content/35">
            {stepCount} Schritt{stepCount !== 1 ? 'e' : ''} · {citationCount} Quellen
          </span>
        </button>
      )}

      {/* Sources carousel when collapsed */}
      {!isExpanded && !showingActive && hasCitations && (
        <div className="mt-1 mb-1 max-w-full overflow-hidden">
          <SourcesCarousel citations={citations} citationIndices={citationIndices} bridge={bridge} onPreviewCard={onPreviewCard} />
        </div>
      )}

      {/* Expanded / Active content */}
      <AnimatePresence initial={false}>
        {(isExpanded || showingActive) && (
          <motion.div key="pipeline"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ height: { duration: 0.2 }, opacity: { duration: 0.15 } }}
            className="overflow-hidden">

            {/* Collapse toggle when expanded */}
            {!showingActive && stepCount > 0 && (
              <button onClick={handleToggle}
                className="group flex items-center gap-1.5 w-full text-left py-1 opacity-60 hover:opacity-80 transition-opacity cursor-pointer">
                <ChevronDown className="w-3 h-3 text-base-content/30 transition-transform" />
                <span className="text-[12px] text-base-content/45">
                  {stepCount} Schritt{stepCount !== 1 ? 'e' : ''} · {citationCount} Quellen
                </span>
              </button>
            )}

            {/* Active Box — shows current step being displayed */}
            <AnimatePresence mode="wait">
              {currentDisplay && (
                <motion.div key={currentDisplay.step}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, height: 0, padding: 0, margin: 0 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="bg-[#1e1e1e] rounded-xl p-4 mb-2 border border-white/[0.04]">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#0a84ff]"
                      style={{ animation: 'dotPulse 1.5s ease-in-out infinite' }} />
                    <span className="text-[12px] text-base-content/60 font-medium">
                      {getActiveTitle(currentDisplay.step)}
                    </span>
                  </div>
                  <ActiveContent step={currentDisplay.step} data={currentDisplay.data} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Loading indicator when pipeline is processing but no step to show yet */}
            {isProcessing && !currentDisplay && completedStack.length === 0 && (
              <div className="flex items-center gap-2 py-2">
                <Loader2 className="w-3 h-3 animate-spin text-base-content/30" />
                <span className="text-[12px] text-base-content/40">Analysiere Anfrage...</span>
              </div>
            )}

            {/* Done Stack (newest first) */}
            <AnimatePresence>
              {completedStack.map((entry) => (
                <motion.div key={entry.step}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  transition={{ duration: 0.25 }}
                  className="flex items-center gap-2 py-1.5 border-t border-white/[0.03] first:border-t-0">
                  <div className="w-[5px] h-[5px] rounded-full bg-base-content/15 flex-shrink-0" />
                  <span className={`text-[11px] flex-1 ${entry.isError ? 'text-error/40' : 'text-base-content/30'}`}>
                    {entry.label}
                  </span>
                  {!entry.isError && <span className="text-[10px] text-success/50">&#x2713;</span>}
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Sources carousel */}
            {hasCitations && (
              <div className="mt-2 max-w-full overflow-hidden">
                <SourcesCarousel citations={citations} citationIndices={citationIndices} bridge={bridge} onPreviewCard={onPreviewCard} />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
