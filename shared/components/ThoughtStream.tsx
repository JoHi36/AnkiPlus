import React, { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import SourcesCarousel from './SourcesCarousel';
import type { Citation } from './SourceCard';

/* ═══════════════════════════════════════════════════
   ThoughtStream v3 — Vertical Timeline + Collapse
   - Vertical line connecting steps (Perplexity-style)
   - Collapsible after completion
   - Active Box with phase animations
   - Queue-based display with min duration
   ═══════════════════════════════════════════════════ */

const MIN_PHASE_DURATION = 600;

const KEYFRAMES = `
@keyframes shimmerWave {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes dotPulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}
`;

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

/* ── Human-readable labels ── */

const MODE_LABELS: Record<string, string> = {
  both: 'Hybrid-Suche',
  sql: 'Keyword-Suche',
  semantic: 'Semantische Suche',
};

function getDoneLabel(step: PipelineStep): string {
  const d = step.data || {};
  if (step.status === 'error') return `${STEP_NAMES[step.step] || step.step} fehlgeschlagen`;
  switch (step.step) {
    case 'router': {
      const mode = MODE_LABELS[d.retrieval_mode] || d.retrieval_mode || '';
      const scope = d.scope_label || '';
      if (!d.search_needed) return 'Keine Suche nötig';
      return scope ? `${mode} · ${scope}` : mode || 'Anfrage analysiert';
    }
    case 'sql_search':
      return `${d.total_hits || 0} Keyword-Treffer`;
    case 'semantic_search':
      return `${d.total_hits || 0} semantische Treffer`;
    case 'merge': {
      const t = d.total || 0;
      return `${t} Quelle${t !== 1 ? 'n' : ''} kombiniert`;
    }
    case 'generating':
      return 'Antwort generiert';
    default:
      return step.step;
  }
}

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

/* ── Queue hook ── */

function useQueuedPipeline(pipelineSteps: PipelineStep[]) {
  const [currentDisplay, setCurrentDisplay] = useState<DoneEntry | null>(null);
  const [completedStack, setCompletedStack] = useState<DoneEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const queueRef = useRef<DoneEntry[]>([]);
  const processedRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!pipelineSteps || pipelineSteps.length === 0) {
      queueRef.current = [];
      processedRef.current = new Set();
      setCurrentDisplay(null);
      setCompletedStack([]);
      setIsProcessing(false);
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      return;
    }

    // Any step arriving means we're processing
    setIsProcessing(true);

    for (const s of pipelineSteps) {
      if (s.status !== 'done' && s.status !== 'error') continue;
      const entry: DoneEntry = {
        step: s.step,
        label: getDoneLabel(s),
        data: s.data || {},
        isError: s.status === 'error',
      };
      if (processedRef.current.has(s.step)) {
        // Update existing
        setCompletedStack(prev => prev.map(e => e.step === s.step ? entry : e));
      } else {
        processedRef.current.add(s.step);
        queueRef.current.push(entry);
      }
    }
  }, [pipelineSteps]);

  // Process queue one at a time
  useEffect(() => {
    if (currentDisplay !== null) return;
    if (queueRef.current.length === 0) {
      if (!pipelineSteps?.some(s => s.status === 'active') && processedRef.current.size > 0) {
        setIsProcessing(false);
      }
      return;
    }
    const next = queueRef.current.shift()!;
    setCurrentDisplay(next);
    timerRef.current = setTimeout(() => {
      setCompletedStack(prev => [next, ...prev]);
      setCurrentDisplay(null);
      timerRef.current = null;
    }, MIN_PHASE_DURATION);
  }, [currentDisplay, pipelineSteps]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return { currentDisplay, completedStack, isProcessing };
}

/* ── Timeline Step (with vertical line) ── */

function TimelineStep({ label, isError, isLast }: { label: string; isError: boolean; isLast: boolean }) {
  return (
    <div className="flex">
      {/* Left: dot + line */}
      <div className="flex flex-col items-center flex-shrink-0 w-5">
        <div className="flex items-center justify-center h-5">
          <div className={`w-[5px] h-[5px] rounded-full ${isError ? 'bg-error/40' : 'bg-base-content/20'}`} />
        </div>
        {!isLast && <div className="flex-1 w-px bg-base-content/[0.08]" />}
      </div>
      {/* Right: label */}
      <div className={`flex items-center h-5 ${!isLast ? 'pb-1' : ''}`}>
        <span className={`text-[11px] ${isError ? 'text-error/50' : 'text-base-content/35'}`}>{label}</span>
      </div>
    </div>
  );
}

/* ── Active Box (loading state with phase content) ── */

function ActiveBox({ step, data }: { step: string; data: Record<string, any> }) {
  const title = ACTIVE_TITLES[step] || 'Verarbeite...';

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25 }}
      className="bg-[#1e1e1e] rounded-xl p-3 mb-1.5 border border-white/[0.04]"
    >
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-[#0a84ff]" style={{ animation: 'dotPulse 1.5s ease-in-out infinite' }} />
        <span className="text-[12px] text-base-content/55 font-medium">{title}</span>
      </div>
      {/* Shimmer bar for generating */}
      {step === 'generating' && (
        <div className="mt-2 h-[3px] rounded-sm overflow-hidden"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(10,132,255,0.05) 20%, rgba(10,132,255,0.3) 50%, rgba(10,132,255,0.05) 80%, transparent 100%)',
            backgroundSize: '200% 100%',
            animation: 'shimmerWave 2s ease-in-out infinite',
          }}
        />
      )}
    </motion.div>
  );
}

/* ── Loading Box (initial state before any steps) ── */

function LoadingBox() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="bg-[#1e1e1e] rounded-xl p-3 mb-1.5 border border-white/[0.04]"
    >
      <div className="flex items-center gap-2">
        <Loader2 className="w-3 h-3 animate-spin text-[#0a84ff]/60" />
        <span className="text-[12px] text-base-content/45">Analysiere Anfrage...</span>
      </div>
    </motion.div>
  );
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
      {labels.map((label, i) => (
        <TimelineStep key={i} label={label} isError={false} isLast={i === labels.length - 1 && !hasCitations} />
      ))}
      {hasCitations && (
        <div className="mt-1 max-w-full overflow-hidden">
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
  // Inject keyframes
  useEffect(() => {
    if (typeof document !== 'undefined' && !document.getElementById('ts-keyframes')) {
      const s = document.createElement('style');
      s.id = 'ts-keyframes';
      s.textContent = KEYFRAMES;
      document.head.appendChild(s);
    }
  }, []);

  const isLegacy = pipelineSteps.length === 0 && steps.length > 0;
  const { currentDisplay, completedStack, isProcessing } = useQueuedPipeline(pipelineSteps);

  // Collapse state
  const [isCollapsed, setIsCollapsed] = useState(false);
  const hasText = Boolean(message && message.trim().length > 0);

  // Auto-collapse when text arrives
  useEffect(() => {
    if (hasText && !isCollapsed && !isProcessing && !currentDisplay) {
      const t = setTimeout(() => setIsCollapsed(true), 800);
      return () => clearTimeout(t);
    }
  }, [hasText, isCollapsed, isProcessing, currentDisplay]);

  // Expand when new pipeline starts
  useEffect(() => {
    if (isProcessing) setIsCollapsed(false);
  }, [isProcessing]);

  const hasCitations = Object.keys(citations).length > 0;
  const hasContent = isProcessing || currentDisplay !== null || completedStack.length > 0 || isLegacy;
  const totalSteps = completedStack.length;

  if (!hasContent) return null;
  if (isLegacy) return <LegacyThoughtStream steps={steps} citations={citations} citationIndices={citationIndices} bridge={bridge} onPreviewCard={onPreviewCard} />;

  return (
    <div className="mb-2 max-w-full select-none">
      {/* Collapsed: clickable summary */}
      {isCollapsed && !isProcessing && (
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

      {/* Expanded: full pipeline view */}
      {!isCollapsed && (
        <div>
          {/* Collapse button (when not processing) */}
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

          {/* Active Box (current step being processed) */}
          <AnimatePresence mode="wait">
            {currentDisplay ? (
              <ActiveBox key={currentDisplay.step} step={currentDisplay.step} data={currentDisplay.data} />
            ) : isProcessing && completedStack.length === 0 ? (
              <LoadingBox key="loading" />
            ) : null}
          </AnimatePresence>

          {/* Completed steps as vertical timeline */}
          {completedStack.length > 0 && (
            <div className="ml-0.5">
              {completedStack.map((entry, i) => (
                <TimelineStep
                  key={entry.step}
                  label={entry.label}
                  isError={entry.isError}
                  isLast={i === completedStack.length - 1 && !hasCitations}
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
