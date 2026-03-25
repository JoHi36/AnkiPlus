import { useState, useRef, useCallback } from 'react';

/**
 * useAgenticMessage — builds a structured BotMessage from backend events.
 * Single source of truth for the current live message.
 *
 * CRITICAL DESIGN: Every handler updates BOTH React state (for rendering)
 * AND a synchronous ref (for finalize). This is necessary because Qt fires
 * multiple runJavaScript calls in rapid succession, React 18 batches them,
 * and finalize() needs the latest state synchronously before React renders.
 */
export default function useAgenticMessage() {
  const [currentMessage, setCurrentMessage] = useState(null);
  const [pipelineGeneration, setPipelineGeneration] = useState(0);
  // Synchronous mirror of currentMessage — updated in every handler
  const msgRef = useRef(null);

  const isLoading = currentMessage !== null;

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
    console.error('[v2] handleMsgStart:', payload.messageId);
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
    console.error('[v2] handleAgentCell:', payload.agent, payload.status);
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
          pipelineSteps: [],
          citations: {},
          sources: [],
          toolWidgets: [],
          loadingHint: payload.data?.loadingHint || '',
          ...payload.data,
        });
      }
      const newStatus = payload.status === 'loading' ? 'handoff' : prev.status;
      return { ...prev, agentCells: cells, status: newStatus };
    });
  }, [updateMsg]);

  const handlePipelineStep = useCallback((payload) => {
    const targetAgent = payload.agent || payload.data?.agent;
    updateMsg(prev => {
      if (!prev) return prev;
      const cells = prev.agentCells.map(c => {
        // Match by agent name if available, otherwise fall back to active cells
        if (targetAgent) {
          if (c.agent !== targetAgent) return c;
        } else {
          if (!['thinking', 'streaming', 'loading'].includes(c.status)) return c;
        }
        const steps = [...(c.pipelineSteps || [])];
        const idx = steps.findIndex(s => s.step === payload.step);
        if (idx >= 0) {
          steps[idx] = { ...steps[idx], status: payload.status, data: payload.data, timestamp: payload.timestamp || Date.now() };
        } else {
          steps.push({ step: payload.step, status: payload.status, data: payload.data || {}, timestamp: payload.timestamp || Date.now() });
        }
        // Transition loading → thinking so AgenticCell renders ThoughtStream instead of shimmer
        const newStatus = c.status === 'loading' ? 'thinking' : c.status;
        return { ...c, pipelineSteps: steps, status: newStatus };
      });
      return { ...prev, agentCells: cells };
    });
  }, [updateMsg]);

  const handleTextChunk = useCallback((payload) => {
    console.error('[v2] handleTextChunk CALLED: agent=' + payload.agent + ' chunkLen=' + (payload.chunk?.length || 0) + ' chunk=' + (payload.chunk?.substring(0, 40) || ''));
    updateMsg(prev => {
      if (!prev) { console.error('[v2] handleTextChunk: prev is NULL — text_chunk LOST!'); return prev; }
      const targetAgent = payload.agent;
      const cellCount = prev.agentCells.length;
      const matched = prev.agentCells.filter(c => c.agent === targetAgent).length;
      console.error(`[v2] handleTextChunk updater: agent=${targetAgent}, cells=${cellCount}, matched=${matched}, prevStatus=${prev.status}, cell0TextLen=${prev.agentCells[0]?.text?.length || 0}`);
      if (cellCount === 0) { console.error('[v2] handleTextChunk: NO CELLS! text_chunk arrived before agent_cell — chunk LOST!'); }
      const cells = prev.agentCells.map(c => {
        if (targetAgent && c.agent !== targetAgent) return c;
        if (!targetAgent && c !== prev.agentCells[prev.agentCells.length - 1]) return c;
        return { ...c, text: (c.text || '') + payload.chunk, status: 'streaming' };
      });
      const newTextLen = cells[0]?.text?.length || 0;
      console.error(`[v2] handleTextChunk result: newTextLen=${newTextLen}`);
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

  const finalize = useCallback(() => {
    // Read from synchronous ref — guaranteed to have latest state
    // even if React hasn't rendered pending updates yet.
    const prev = msgRef.current;
    if (!prev) { console.error('[v2] finalize: msgRef is NULL!'); return null; }
    const primaryText = prev.agentCells?.[0]?.text || '';
    const cellCount = prev.agentCells?.length || 0;
    console.error(`[v2] finalize: cells=${cellCount}, primaryTextLen=${primaryText.length}, status=${prev.status}, agents=[${prev.agentCells.map(c=>c.agent).join(',')}]`);
    if (primaryText.length === 0) { console.error('[v2] finalize: PRIMARY CELL HAS NO TEXT! All cells text:', prev.agentCells.map(c => c.text?.length || 0)); }
    const finalMsg = {
      ...prev,
      status: 'done',
      agentCells: prev.agentCells.map(c => ({ ...c, status: 'done' })),
    };
    // Clear both ref and state
    msgRef.current = null;
    setCurrentMessage(null);
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
