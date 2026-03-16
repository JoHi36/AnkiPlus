import React, { useState, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import SourcesCarousel from './SourcesCarousel';

/* ═══════════════════════════════════════════════════════════════
   ThoughtStream — Clean AI pipeline visualizer
   ═══════════════════════════════════════════════════════════════
   Dots connected by a precise thin line. Line ends at last dot.
   Search queries split into Präzise / Erweitert.
   ═══════════════════════════════════════════════════════════════ */


/* ── Query tag (slightly rounded, not full-pill) ── */

function QueryTag({ query, count, status }) {
  const isEmpty = status === 'empty';
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] leading-none px-2.5 py-1.5 rounded-md transition-colors
      ${isEmpty
        ? 'bg-base-content/[0.04] text-base-content/25'
        : 'bg-base-content/[0.07] text-base-content/50'}`}
    >
      <Search className={`w-2.5 h-2.5 flex-shrink-0 ${isEmpty ? 'opacity-25' : 'opacity-40'}`} />
      <span className={isEmpty ? 'line-through decoration-base-content/15' : ''}>
        {query}
      </span>
      {count !== null && count !== undefined && (
        <span className={`text-[10px] tabular-nums ${isEmpty ? 'text-base-content/20' : 'text-base-content/35'}`}>
          {count}
        </span>
      )}
    </span>
  );
}


/* ── Step processing hook ── */

function useProcessedSteps(steps, citations, intent) {
  return useMemo(() => {
    const result = [];
    if (!steps || steps.length === 0) {
      if (Object.keys(citations).length > 0) {
        result.push({ id: 'intent', label: 'Anfrage analysiert', status: 'done' });
        result.push({ id: 'retrieval', label: 'Relevanzanalyse', status: 'done', hasSources: true });
        return result;
      }
      if (intent) {
        result.push({ id: 'intent', label: 'Intentionsanalyse', detail: intent, status: 'loading' });
      }
      return result;
    }

    const sorted = [...steps].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    const lastPhase = sorted[sorted.length - 1]?.phase;

    // ── 1. Intent ──
    const intentStep = sorted.find(s => s.phase === 'intent');
    if (intentStep || intent) {
      const intentText = intent || intentStep?.metadata?.intent || intentStep?.state?.match(/Intent:\s*(\w+)/)?.[1] || null;
      result.push({
        id: 'intent',
        label: intentText
          ? `Interpreting the query as "${intentText.toLowerCase()}".`
          : 'Anfrage analysiert.',
        status: 'done',
      });
    }

    // ── 2. Search (Kontextstrategie) ──
    const searchSteps = sorted.filter(s => s.phase === 'search');
    if (searchSteps.length > 0) {
      const precise = [];
      const broad = [];
      const seen = new Set();
      let phase = 'precise';

      for (const s of sorted) {
        const st = s.state || '';
        if (st.includes('Präzise Suche')) { phase = 'precise'; continue; }
        if (st.includes('Erweiterte Suche')) { phase = 'broad'; continue; }

        const parseQuery = (text) => {
          const resMatch = text.match(/Ergebnis:\s*(\d+)\s*Treffer\s*für\s*'(.*?)'/);
          if (resMatch) return { query: resMatch[2], count: parseInt(resMatch[1]), status: parseInt(resMatch[1]) > 0 ? 'success' : 'empty' };
          const sMatch = text.match(/Suche:\s*(.+)/);
          if (sMatch) return { query: sMatch[1].trim(), count: null, status: 'pending' };
          return null;
        };

        if (st.includes('Suche:') || st.includes('Ergebnis:')) {
          const parsed = parseQuery(st);
          if (parsed) {
            const key = parsed.query?.toLowerCase().trim();
            if (key && !seen.has(key)) {
              seen.add(key);
              (phase === 'precise' ? precise : broad).push(parsed);
            } else if (key && seen.has(key)) {
              const target = [...precise, ...broad].find(q => q.query?.toLowerCase().trim() === key);
              if (target && parsed.count !== null) {
                target.count = parsed.count;
                target.status = parsed.status;
              }
            }
          }
        }
      }

      // Determine scope
      const scopeStep = searchSteps.find(s => s.metadata?.scope || s.state?.includes('Suchraum:'));
      let rawScope = scopeStep?.metadata?.scope || null;
      if (!rawScope && scopeStep?.state?.includes('Suchraum:')) {
        const label = scopeStep.state.replace('Suchraum:', '').trim();
        const map = { 'Stapel': 'current_deck', 'Global': 'collection', 'Sammlung': 'collection', 'Karte': 'current_card' };
        rawScope = map[label] || label.toLowerCase().replace(/\s+/g, '_');
      }

      result.push({
        id: 'search',
        label: 'Suche',
        status: lastPhase === 'search' ? 'loading' : 'done',
        queries: rawScope !== 'current_card' ? { precise, broad } : null,
        rawScope,
      });
    }

    // ── 3. Retrieval ──
    const retrieval = sorted.find(s => s.phase === 'retrieval');
    const genStep = sorted.find(s => s.phase === 'generating' || s.phase === 'finished');
    const citCount = Object.keys(citations).length;

    if (retrieval || citCount > 0) {
      const sourceCount = genStep?.metadata?.sourceCount || citCount;
      const isDone = citCount > 0 || lastPhase === 'generating' || lastPhase === 'finished';

      result.push({
        id: 'retrieval',
        label: isDone ? `${sourceCount} Quellen analysiert` : 'Analysiere Quellen…',
        status: isDone ? 'done' : 'loading',
        hasSources: citCount > 0,
      });
    }

    // ── 4. Synthesis ──
    if (genStep) {
      const mode = genStep.metadata?.mode || 'compact';
      result.push({
        id: 'synthesis',
        label: 'Synthese',
        detail: mode === 'detailed' ? 'PRO' : 'FLASH',
        status: lastPhase === 'generating' ? 'loading' : 'done',
      });
    }

    return result;
  }, [steps, citations, intent]);
}


/* ── Auto-collapse hook ── */

function useAutoCollapse(isStreaming, message) {
  const [isExpanded, setIsExpanded] = useState(isStreaming);
  const [hasAutoCollapsed, setHasAutoCollapsed] = useState(false);
  const hasText = message && message.trim().length > 0;

  useEffect(() => {
    if (isStreaming && !hasAutoCollapsed) setIsExpanded(true);
  }, [isStreaming, hasAutoCollapsed]);

  useEffect(() => {
    if (hasText && !hasAutoCollapsed && isExpanded) {
      const t = setTimeout(() => {
        setIsExpanded(false);
        setHasAutoCollapsed(true);
      }, 100);
      return () => clearTimeout(t);
    }
  }, [hasText, hasAutoCollapsed, isExpanded]);

  return { isExpanded, setIsExpanded, hasAutoCollapsed };
}


/* ── Status text helper ── */

function getStatusText(steps, citations, isStreaming, intent) {
  if (!steps || steps.length === 0) {
    return intent ? 'Analysiere Anfrage…' : 'Bereit';
  }
  const last = steps[steps.length - 1];
  const phase = last?.phase;
  if (phase === 'intent') return 'Analysiere Anfrage…';
  if (phase === 'search') return 'Durchsuche Wissensdatenbank…';
  if (phase === 'retrieval') return 'Analysiere Quellen…';
  if (phase === 'generating') return 'Formuliere Antwort…';
  if (phase === 'finished') {
    const n = steps.length;
    return `${n} Schritt${n !== 1 ? 'e' : ''} abgeschlossen`;
  }
  return 'Verarbeite…';
}


/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */

export default function ThoughtStream({
  steps = [],
  citations = {},
  citationIndices = {},
  isStreaming = false,
  bridge = null,
  intent = null,
  onPreviewCard,
  message = '',
}) {
  const displaySteps = useProcessedSteps(steps, citations, intent);
  const { isExpanded, setIsExpanded } = useAutoCollapse(isStreaming, message);

  const lastPhase = steps.length > 0 ? steps[steps.length - 1]?.phase : null;
  const isThinking = isStreaming && lastPhase !== 'generating' && lastPhase !== 'finished';
  const hasCitations = Object.keys(citations).length > 0;
  const hasContent = displaySteps.length > 0 || hasCitations || !!intent || isThinking;
  const statusText = getStatusText(steps, citations, isStreaming, intent);

  if (!hasContent) return null;

  const handleToggle = () => {
    if (isThinking) return;
    setIsExpanded(v => !v);
  };

  return (
    <div className="mb-2 max-w-full select-none">

      {/* ── Collapsed header ── */}
      <button
        onClick={handleToggle}
        disabled={isThinking}
        className={`group flex items-center gap-1.5 w-full text-left py-1 transition-all duration-200
          ${isThinking ? 'cursor-default' : 'cursor-pointer'}
          ${!isThinking && !isExpanded ? 'opacity-40 hover:opacity-60' : 'opacity-60'}`}
      >
        {isThinking ? (
          <Loader2 className="w-3 h-3 animate-spin text-base-content/40 flex-shrink-0" />
        ) : (
          <ChevronDown className={`w-3 h-3 text-base-content/30 flex-shrink-0 transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`} />
        )}
        <span className="text-[12px] text-base-content/45 truncate">
          {statusText}
        </span>
      </button>

      {/* ── Expanded content ── */}
      <AnimatePresence initial={false}>
        {isExpanded && (displaySteps.length > 0 || isThinking) && (
          <motion.div
            key="stream-content"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{
              height: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] },
              opacity: { duration: 0.15 },
            }}
            className="overflow-hidden"
          >
            <div className="pt-1 pb-2">

              {/* Thinking placeholder */}
              {displaySteps.length === 0 && isThinking && (
                <div className="flex items-center gap-2 pl-1">
                  <Loader2 className="w-3 h-3 animate-spin text-base-content/25" />
                  <span className="text-[12px] text-base-content/30">Initialisiere…</span>
                </div>
              )}

              {/* Steps with connecting line */}
              <AnimatePresence mode="popLayout">
                {displaySteps.map((step, idx) => {
                  const isLast = idx === displaySteps.length - 1;

                  return (
                    <motion.div
                      key={step.id}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.25, delay: idx * 0.06 }}
                      className="flex"
                    >
                      {/* Left column: dot + connecting line */}
                      <div className="flex flex-col items-center flex-shrink-0 w-5">
                        {/* Dot */}
                        <div className="flex items-center justify-center h-5">
                          {step.status === 'loading' ? (
                            <Loader2 className="w-3 h-3 animate-spin text-base-content/30" />
                          ) : (
                            <div className="w-[5px] h-[5px] rounded-full bg-base-content/20" />
                          )}
                        </div>
                        {/* Connecting line (only if not last) */}
                        {!isLast && (
                          <div className="flex-1 w-px bg-base-content/[0.08]" />
                        )}
                      </div>

                      {/* Right column: content */}
                      <div className={`flex-1 min-w-0 ${!isLast ? 'pb-3' : ''}`}>
                        {/* Step label row */}
                        <div className="flex items-center gap-2 h-5">
                          <span className="text-[13px] text-base-content/50">{step.label}</span>
                          {step.detail && (
                            <span className="text-[10px] font-mono font-medium text-base-content/25 uppercase tracking-wider">{step.detail}</span>
                          )}
                        </div>

                        {/* Search queries — split into Präzise / Erweitert */}
                        {step.queries && (
                          <div className="flex flex-col gap-2 mt-2 ml-0.5">
                            {step.queries.precise?.length > 0 && (
                              <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-medium text-base-content/25 uppercase tracking-wider">Präzise</span>
                                <div className="flex flex-wrap gap-1">
                                  {step.queries.precise.map((q, i) => (
                                    <QueryTag key={`p-${i}`} query={q.query} count={q.count} status={q.status} />
                                  ))}
                                </div>
                              </div>
                            )}
                            {step.queries.broad?.length > 0 && (
                              <div className="flex flex-col gap-1">
                                <span className="text-[9px] font-medium text-base-content/25 uppercase tracking-wider">Erweitert</span>
                                <div className="flex flex-wrap gap-1">
                                  {step.queries.broad.map((q, i) => (
                                    <QueryTag key={`b-${i}`} query={q.query} count={q.count} status={q.status} />
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Sources carousel */}
                        {step.hasSources && hasCitations && (
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
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
