import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, ChevronDown, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import SourcesCarousel from './SourcesCarousel';
import type { Citation } from './SourceCard';

/* ═══════════════════════════════════════════════════
   ThoughtStream v2 — Active Box + Done Stack
   Phase-specific animations for each pipeline step.
   ═══════════════════════════════════════════════════ */

const MIN_PHASE_DURATION = 800; // ms — minimum time each phase is visible

/* ── Keyframes (injected once) ── */

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
  // Legacy support
  steps?: any[];
  intent?: string | null;
}

/* ── Timing hook ── */

function useTimedPipeline(pipelineSteps: PipelineStep[]) {
  const [visibleActive, setVisibleActive] = useState<PipelineStep | null>(null);
  const [doneStack, setDoneStack] = useState<DoneEntry[]>([]);
  const lastTransitionRef = useRef(0);

  useEffect(() => {
    if (!pipelineSteps || pipelineSteps.length === 0) {
      setVisibleActive(null);
      setDoneStack([]);
      return;
    }

    const latestActive = [...pipelineSteps].reverse().find(s => s.status === 'active') || null;
    const doneSteps = pipelineSteps.filter(s => s.status === 'done' || s.status === 'error');

    // Show active immediately
    if (latestActive) {
      setVisibleActive(latestActive);
    }

    const now = Date.now();
    const elapsed = now - lastTransitionRef.current;
    const entries = doneSteps.map(s => ({
      step: s.step,
      label: getDoneLabel(s),
      isError: s.status === 'error',
    })).reverse(); // Newest first

    if (elapsed >= MIN_PHASE_DURATION) {
      setDoneStack(entries);
      lastTransitionRef.current = now;
      if (!latestActive) setVisibleActive(null);
    } else {
      const delay = MIN_PHASE_DURATION - elapsed;
      const timer = setTimeout(() => {
        setDoneStack(entries);
        lastTransitionRef.current = Date.now();
        if (!pipelineSteps.find(s => s.status === 'active')) {
          setVisibleActive(null);
        }
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [pipelineSteps]);

  return { visibleActive, doneStack };
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
  switch (step) {
    case 'router': return 'Analyse';
    case 'sql_search': return 'Keyword-Suche';
    case 'semantic_search': return 'Semantische Suche';
    case 'merge': return 'Merge';
    case 'generating': return 'Generierung';
    default: return step;
  }
}

/* ── Active title ── */

function getActiveTitle(step?: string): string {
  switch (step) {
    case 'router': return 'Analysiere Anfrage...';
    case 'sql_search': return 'Keyword-Suche...';
    case 'semantic_search': return 'Semantische Suche...';
    case 'merge': return 'Quellen kombinieren...';
    case 'generating': return 'Generiere Antwort...';
    default: return 'Verarbeite...';
  }
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
          <span className={q.hits === 0 ? 'line-through decoration-base-content/15' : ''}>
            {q.text}
          </span>
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
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(10,132,255,0.08), transparent)',
              backgroundSize: '30% 100%',
              animation: 'scanGlow 2s ease-in-out infinite',
            }}
          />
          <span className="text-[11px] font-mono text-[#0a84ff]/70 flex-shrink-0 min-w-[36px] relative z-10">
            {c.score?.toFixed(3)}
          </span>
          <span className="text-[11px] text-base-content/50 truncate relative z-10">
            {c.snippet}
          </span>
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
        <div
          className="absolute top-1/2 left-0 right-0 h-[2px] -translate-y-1/2 rounded-sm"
          style={{
            background: `linear-gradient(90deg, rgba(10,132,255,0.25) 0%, rgba(10,132,255,0.4) ${weightPercent}, rgba(20,184,166,0.4) ${weightPercent}, rgba(20,184,166,0.25) 100%)`,
          }}
        />
        <div
          className="absolute top-1/2 w-2.5 h-2.5 rounded-full bg-[#0a84ff] z-10"
          style={{
            left: weightPercent,
            transform: 'translate(-50%, -50%)',
            boxShadow: '0 0 8px rgba(10,132,255,0.5), 0 0 20px rgba(10,132,255,0.2)',
          }}
        />
      </div>
      <div className="text-center">
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="text-[20px] font-semibold text-base-content/80"
        >
          {total}
        </motion.div>
        <div className="text-[11px] text-base-content/25">Quellen kombiniert</div>
      </div>
    </div>
  );
}

function GeneratingActiveContent() {
  return (
    <div
      className="h-[3px] rounded-sm overflow-hidden"
      style={{
        background:
          'linear-gradient(90deg, transparent 0%, rgba(10,132,255,0.05) 20%, rgba(10,132,255,0.3) 50%, rgba(10,132,255,0.05) 80%, transparent 100%)',
        backgroundSize: '200% 100%',
        animation: 'shimmerWave 2s ease-in-out infinite',
      }}
    />
  );
}

/* ── Active content dispatcher ── */

function ActiveContent({ step }: { step: PipelineStep }) {
  switch (step.step) {
    case 'router': return <RouterActiveContent data={step.data} />;
    case 'sql_search': return <SqlActiveContent data={step.data} />;
    case 'semantic_search': return <SemanticActiveContent data={step.data} />;
    case 'merge': return <MergeActiveContent data={step.data} />;
    case 'generating': return <GeneratingActiveContent />;
    default: return null;
  }
}

/* ── Auto-collapse hook ── */

function useAutoCollapse(isStreaming: boolean, message: string, hasActive: boolean) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [hasAutoCollapsed, setHasAutoCollapsed] = useState(false);
  const hasText = Boolean(message && message.trim().length > 0);

  useEffect(() => {
    if (isStreaming && !hasAutoCollapsed) setIsExpanded(true);
  }, [isStreaming, hasAutoCollapsed]);

  // Auto-expand when pipeline starts
  useEffect(() => {
    if (hasActive && !hasAutoCollapsed) setIsExpanded(true);
  }, [hasActive, hasAutoCollapsed]);

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

/* ── Legacy fallback for old message format ── */

function LegacyThoughtStream({
  steps,
  citations,
  citationIndices,
  bridge,
  onPreviewCard,
}: {
  steps: any[];
  citations: Record<string, any>;
  citationIndices: Record<string, number>;
  bridge: any;
  onPreviewCard?: (citation: Citation) => void;
}) {
  const hasCitations = Object.keys(citations || {}).length > 0;

  // Extract labels: new format = string[], old format = {state, phase, ...}[]
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
          <SourcesCarousel
            citations={citations}
            citationIndices={citationIndices}
            bridge={bridge}
            onPreviewCard={onPreviewCard}
          />
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
  // Inject keyframes once
  useEffect(() => {
    if (typeof document !== 'undefined' && !document.getElementById('thoughtstream-keyframes')) {
      const style = document.createElement('style');
      style.id = 'thoughtstream-keyframes';
      style.textContent = KEYFRAMES;
      document.head.appendChild(style);
    }
  }, []);

  // Legacy detection: old-format steps (array of objects with phase field) or string array labels
  const isLegacy = pipelineSteps.length === 0 && steps.length > 0;

  const { visibleActive, doneStack } = useTimedPipeline(pipelineSteps);
  const { isExpanded, setIsExpanded } = useAutoCollapse(isStreaming, message, !!visibleActive);

  const hasCitations = Object.keys(citations).length > 0;
  const hasContent = pipelineSteps.length > 0 || doneStack.length > 0 || visibleActive !== null || isLegacy;
  const stepCount = doneStack.length;
  const citationCount = Object.keys(citations).length;

  if (!hasContent) return null;

  // Legacy rendering for old messages
  if (isLegacy) {
    return (
      <LegacyThoughtStream
        steps={steps}
        citations={citations}
        citationIndices={citationIndices}
        bridge={bridge}
        onPreviewCard={onPreviewCard}
      />
    );
  }

  const handleToggle = () => {
    if (visibleActive) return; // Don't collapse while processing
    setIsExpanded(v => !v);
  };

  return (
    <div className="mb-2 max-w-full select-none">
      {/* Collapsed header (shown when collapsed and no active step) */}
      {!isExpanded && !visibleActive && stepCount > 0 && (
        <button
          onClick={handleToggle}
          className="group flex items-center gap-1.5 w-full text-left py-1 opacity-40 hover:opacity-60 transition-opacity cursor-pointer"
        >
          <ChevronDown className="w-3 h-3 text-base-content/30 -rotate-90 transition-transform" />
          <span className="text-[12px] text-base-content/35">
            {stepCount} Schritt{stepCount !== 1 ? 'e' : ''} · {citationCount} Quellen
          </span>
        </button>
      )}

      {/* Sources carousel — always visible when collapsed */}
      {!isExpanded && !visibleActive && hasCitations && (
        <div className="mt-1 mb-1 max-w-full overflow-hidden">
          <SourcesCarousel
            citations={citations}
            citationIndices={citationIndices}
            bridge={bridge}
            onPreviewCard={onPreviewCard}
          />
        </div>
      )}

      {/* Expanded content (or forced open when active) */}
      <AnimatePresence initial={false}>
        {(isExpanded || visibleActive) && (
          <motion.div
            key="pipeline"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ height: { duration: 0.2 }, opacity: { duration: 0.15 } }}
            className="overflow-hidden"
          >
            {/* Collapse toggle when expanded and no active step */}
            {!visibleActive && stepCount > 0 && (
              <button
                onClick={handleToggle}
                className="group flex items-center gap-1.5 w-full text-left py-1 opacity-60 hover:opacity-80 transition-opacity cursor-pointer"
              >
                <ChevronDown className="w-3 h-3 text-base-content/30 transition-transform" />
                <span className="text-[12px] text-base-content/45">
                  {stepCount} Schritt{stepCount !== 1 ? 'e' : ''} · {citationCount} Quellen
                </span>
              </button>
            )}

            {/* Active Box */}
            <AnimatePresence mode="wait">
              {visibleActive && (
                <motion.div
                  key={visibleActive.step}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, height: 0, padding: 0, margin: 0 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="bg-[#1e1e1e] rounded-xl p-4 mb-2 border border-white/[0.04]"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div
                      className="w-1.5 h-1.5 rounded-full bg-[#0a84ff]"
                      style={{ animation: 'dotPulse 1.5s ease-in-out infinite' }}
                    />
                    <span className="text-[12px] text-base-content/60 font-medium">
                      {getActiveTitle(visibleActive.step)}
                    </span>
                  </div>
                  <ActiveContent step={visibleActive} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Done Stack (newest first) */}
            <AnimatePresence>
              {doneStack.map((entry) => (
                <motion.div
                  key={entry.step}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  transition={{ duration: 0.25 }}
                  className="flex items-center gap-2 py-1.5 border-t border-white/[0.03] first:border-t-0"
                >
                  <div className="w-[5px] h-[5px] rounded-full bg-base-content/15 flex-shrink-0" />
                  <span className={`text-[11px] flex-1 ${entry.isError ? 'text-error/40' : 'text-base-content/30'}`}>
                    {entry.label}
                  </span>
                  {!entry.isError && <span className="text-[10px] text-success/50">&#x2713;</span>}
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Sources carousel in expanded mode */}
            {hasCitations && (
              <div className="mt-2 max-w-full overflow-hidden">
                <SourcesCarousel
                  citations={citations}
                  citationIndices={citationIndices}
                  bridge={bridge}
                  onPreviewCard={onPreviewCard}
                />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
