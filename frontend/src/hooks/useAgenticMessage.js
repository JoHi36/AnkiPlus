import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * useAgenticMessage — builds a structured BotMessage from backend events.
 * Single source of truth for the current live message.
 *
 * CRITICAL DESIGN: Every handler updates BOTH React state (for rendering)
 * AND a synchronous ref (for finalize). This is necessary because Qt fires
 * multiple runJavaScript calls in rapid succession, React 18 batches them,
 * and finalize() needs the latest state synchronously before React renders.
 *
 * TRANSITION DESIGN: finalize() does NOT clear currentMessage to null.
 * Instead it marks status='done' and keeps the data alive for one more render.
 * A cleanup useEffect clears it afterward. This guarantees there is never a
 * frame where both currentMessage and the saved message in messages[] are
 * absent — eliminating the flicker on live→saved transition.
 */
export default function useAgenticMessage() {
  const [currentMessage, setCurrentMessage] = useState(null);
  const [pipelineGeneration, setPipelineGeneration] = useState(0);
  // Synchronous mirror of currentMessage — updated in every handler
  const msgRef = useRef(null);

  // 'done' messages are kept alive briefly for smooth transition — not "loading"
  const isLoading = currentMessage !== null && currentMessage.status !== 'done';

  // Helper: update both state and ref SYNCHRONOUSLY.
  // msgRef.current is the single source of truth — updated immediately so
  // finalize() always sees the latest state, even when React 18 batches
  // multiple runJavaScript → ankiReceive calls into one render cycle.
  const updateMsg = useCallback((updater) => {
    const prev = msgRef.current;
    const next = typeof updater === 'function' ? updater(prev) : updater;
    msgRef.current = next;
    setCurrentMessage(next);
  }, []);

  const handleMsgStart = useCallback((payload) => {
    setPipelineGeneration(g => g + 1);
    const msg = {
      id: payload.messageId || `msg-${Date.now()}`,
      from: 'bot',
      status: 'routing',
      orchestration: {
        agent: null,
        mode: null,
        steps: [{ step: 'orchestrating', status: 'active', data: {}, timestamp: Date.now() }],
      },
      agentCells: [],
    };
    msgRef.current = msg;
    setCurrentMessage(msg);
  }, []);

  const handleOrchestration = useCallback((payload) => {
    updateMsg(prev => {
      if (!prev) return prev;
      const finalSteps = payload.steps || [];
      if (!finalSteps.some(s => s.step === 'orchestrating')) {
        finalSteps.unshift({ step: 'orchestrating', status: 'done', data: payload.steps?.[0]?.data || {}, timestamp: Date.now() });
      }
      return {
        ...prev,
        status: 'thinking',
        orchestration: {
          agent: payload.agent,
          mode: payload.mode || 'direkt',
          steps: finalSteps,
        },
      };
    });
  }, [updateMsg]);

  const handleAgentCell = useCallback((payload) => {
    updateMsg(prev => {
      if (!prev) return prev;
      const cells = prev.agentCells.map(c =>
        c.agent === payload.agent
          ? { ...c, ...payload.data, status: payload.status }
          : c
      );
      if (!cells.some(c => c.agent === payload.agent)) {
        cells.push({
          agent: payload.agent,
          status: payload.status,
          text: '',
          citations: {},
          sources: [],
          toolWidgets: [],
          pipelineSteps: [],
          loadingHint: payload.data?.loadingHint || '',
          ...payload.data,
        });
      }
      const newStatus = payload.status === 'loading' ? 'handoff' : prev.status;
      return { ...prev, agentCells: cells, status: newStatus };
    });
  }, [updateMsg]);

  // Pipeline step handler — accumulates steps on cells for persistence (finalize reads cell.pipelineSteps).
  // Also maintains cell status transitions, loading hint, and early citation extraction.
  const handlePipelineStep = useCallback((payload) => {
    const targetAgent = payload.agent || payload.data?.agent;
    // Skip orchestrating/router steps — those are handled separately
    const isAgentStep = payload.step !== 'orchestrating' && payload.step !== 'router';

    // 3 user-facing phases mapped from pipeline steps:
    //   Kontext      ← orchestrating, router, kg_enrichment
    //   Quellensuche ← sql_search, semantic_search, merge
    //   Synthese     ← generating, web_search
    // Results accumulate: "8 Begriffe · Quellensuche..." → "8 Begriffe · 12 Quellen · Synthese..."
    const step = payload.step;
    const pStatus = payload.status;
    const data = payload.data || {};

    updateMsg(prev => {
      if (!prev) return prev;
      const cells = prev.agentCells.map(c => {
        // Match by agent name if available, otherwise fall back to active cells
        if (targetAgent) {
          if (c.agent !== targetAgent) return c;
        } else {
          if (!['thinking', 'streaming', 'loading'].includes(c.status)) return c;
        }
        // Transition loading → thinking so AgenticCell renders content instead of shimmer
        const newStatus = c.status === 'loading' ? 'thinking' : c.status;

        // Accumulate phase results on the cell
        const results = c._phaseResults || [];
        let newResults = results;
        let newHint = c.loadingHint;

        // Phase 1: Kontext
        if (step === 'orchestrating' || step === 'router' || step === 'kg_enrichment') {
          if (pStatus === 'active' && !results.length) {
            newHint = 'Kontext...';
          } else if (pStatus === 'done' && step === 'kg_enrichment') {
            const n = (data.terms && data.terms.length) || (data.tier1_terms && data.tier1_terms.length) || 0;
            if (n > 0 && !results.some(r => r.phase === 'kontext')) {
              newResults = [...results, { phase: 'kontext', label: `${n} Begriffe` }];
            }
          }
        }
        // Phase 2: Quellensuche
        else if (step === 'sql_search' || step === 'semantic_search' || step === 'merge') {
          if (pStatus === 'active' && step === 'sql_search') {
            const prefix = newResults.map(r => r.label).join(' \u00b7 ');
            newHint = prefix ? `${prefix} \u00b7 Quellensuche...` : 'Quellensuche...';
          } else if (pStatus === 'done' && step === 'merge') {
            const total = data.total || 0;
            if (total > 0 && !newResults.some(r => r.phase === 'quellen')) {
              newResults = [...newResults, { phase: 'quellen', label: `${total} Quellen` }];
            }
          }
        }
        // Phase 3: Synthese
        else if (step === 'generating' || step === 'web_search') {
          if (pStatus === 'active') {
            const prefix = newResults.map(r => r.label).join(' \u00b7 ');
            const verb = step === 'web_search' ? 'Web-Recherche...' : 'Synthese...';
            newHint = prefix ? `${prefix} \u00b7 ${verb}` : verb;
          }
        }

        // If results changed, rebuild hint with accumulated labels
        if (newResults !== results && newResults.length > results.length) {
          const prefix = newResults.map(r => r.label).join(' \u00b7 ');
          newHint = prefix;
        }
        // Extract early citations from sources_ready step
        const newCitations = payload.step === 'sources_ready' && payload.data?.citations
          ? { ...(c.citations || {}), ...payload.data.citations }
          : c.citations;
        // Accumulate pipeline steps on cell for persistence
        let newPipelineSteps = c.pipelineSteps || [];
        if (isAgentStep) {
          const stepObj = { step: payload.step, status: payload.status, data: payload.data || {}, timestamp: Date.now() };
          const existing = newPipelineSteps.findIndex(s => s.step === payload.step);
          if (existing >= 0) {
            newPipelineSteps = newPipelineSteps.map((s, i) => i === existing ? stepObj : s);
          } else {
            newPipelineSteps = [...newPipelineSteps, stepObj];
          }
        }
        return { ...c, status: newStatus, loadingHint: newHint, _phaseResults: newResults, citations: newCitations, pipelineSteps: newPipelineSteps };
      });
      return { ...prev, agentCells: cells };
    });
  }, [updateMsg]);

  const handleTextChunk = useCallback((payload) => {
    updateMsg(prev => {
      if (!prev) return prev;
      const targetAgent = payload.agent;
      const cells = prev.agentCells.map(c => {
        if (targetAgent && c.agent !== targetAgent) return c;
        if (!targetAgent && c !== prev.agentCells[prev.agentCells.length - 1]) return c;
        return { ...c, text: (c.text || '') + payload.chunk, status: 'streaming' };
      });
      return { ...prev, agentCells: cells, status: 'streaming' };
    });
  }, [updateMsg]);

  const handleCitations = useCallback((payload) => {
    updateMsg(prev => {
      if (!prev) return prev;
      const cells = prev.agentCells.map(c => {
        if (!['thinking', 'streaming'].includes(c.status)) return c;
        return { ...c, citations: { ...(c.citations || {}), ...payload.data } };
      });
      return { ...prev, agentCells: cells };
    });
  }, [updateMsg]);

  // Cleanup: after finalize marks currentMessage as 'done', clear it on the
  // next render. This guarantees the render cycle ALWAYS has data — either
  // currentMessage (done) or the saved message in messages[].
  // The functional updater ensures a racing msg_start is never clobbered.
  useEffect(() => {
    if (currentMessage?.status === 'done') {
      setCurrentMessage(prev => prev?.status === 'done' ? null : prev);
    }
  }, [currentMessage?.status]);

  const finalize = useCallback(() => {
    // Read from synchronous ref — guaranteed to have latest state
    // even if React hasn't rendered pending updates yet.
    const prev = msgRef.current;
    if (!prev) return null;
    const finalMsg = {
      ...prev,
      status: 'done',
      agentCells: prev.agentCells.map(c => ({ ...c, status: 'done' })),
    };
    // Clear ref immediately (for subsequent event handlers)
    msgRef.current = null;
    // DON'T clear currentMessage to null — keep the done version alive for
    // one more render to bridge the live→saved transition without flicker.
    // The cleanup useEffect above will clear it on the next cycle.
    setCurrentMessage(finalMsg);
    return finalMsg;
  }, []);

  const cancel = useCallback(() => {
    msgRef.current = null;
    setCurrentMessage(null);
  }, []);

  return {
    currentMessage,
    isLoading,
    pipelineGeneration,
    handleMsgStart,
    handleOrchestration,
    handleAgentCell,
    handlePipelineStep,
    handleTextChunk,
    handleCitations,
    finalize,
    cancel,
  };
}
