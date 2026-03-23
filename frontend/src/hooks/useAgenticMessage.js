import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * useAgenticMessage — builds a structured BotMessage from backend events.
 * Single source of truth for the current live message.
 *
 * Message shape:
 * {
 *   id, from: 'bot', status,
 *   orchestration: { agent, mode, steps },
 *   agentCells: [{ agent, status, text, pipelineSteps, citations, sources, toolWidgets, loadingHint }]
 * }
 */
export default function useAgenticMessage() {
  const [currentMessage, setCurrentMessage] = useState(null);
  const [pipelineGeneration, setPipelineGeneration] = useState(0);
  const currentMessageRef = useRef(null);

  // Keep ref in sync for use in done handler
  useEffect(() => { currentMessageRef.current = currentMessage; }, [currentMessage]);

  const isLoading = currentMessage !== null;

  const handleMsgStart = useCallback((payload) => {
    setPipelineGeneration(g => g + 1);
    setCurrentMessage({
      id: payload.messageId || `msg-${Date.now()}`,
      from: 'bot',
      status: 'routing',
      orchestration: null,
      agentCells: [],
    });
  }, []);

  const handleOrchestration = useCallback((payload) => {
    setCurrentMessage(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        status: 'thinking',
        orchestration: {
          agent: payload.agent,
          mode: payload.mode || 'direkt',
          steps: payload.steps || [],
        },
      };
    });
  }, []);

  const handleAgentCell = useCallback((payload) => {
    setCurrentMessage(prev => {
      if (!prev) return prev;
      const cells = prev.agentCells.map(c =>
        c.agent === payload.agent
          ? { ...c, ...payload.data, status: payload.status }
          : c
      );
      // If agent not found, add new cell
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
  }, []);

  const handlePipelineStep = useCallback((payload) => {
    setCurrentMessage(prev => {
      if (!prev) return prev;
      const cells = prev.agentCells.map(c => {
        if (!['thinking', 'streaming'].includes(c.status)) return c;
        const steps = [...(c.pipelineSteps || [])];
        const idx = steps.findIndex(s => s.step === payload.step);
        if (idx >= 0) {
          steps[idx] = { ...steps[idx], status: payload.status, data: payload.data, timestamp: payload.timestamp || Date.now() };
        } else {
          steps.push({ step: payload.step, status: payload.status, data: payload.data || {}, timestamp: payload.timestamp || Date.now() });
        }
        return { ...c, pipelineSteps: steps };
      });
      return { ...prev, agentCells: cells };
    });
  }, []);

  const handleTextChunk = useCallback((payload) => {
    setCurrentMessage(prev => {
      if (!prev) return prev;
      const targetAgent = payload.agent;
      const cells = prev.agentCells.map(c => {
        if (targetAgent && c.agent !== targetAgent) return c;
        if (!targetAgent && c !== prev.agentCells[prev.agentCells.length - 1]) return c;
        return { ...c, text: (c.text || '') + payload.chunk, status: 'streaming' };
      });
      return { ...prev, agentCells: cells, status: 'streaming' };
    });
  }, []);

  const handleCitations = useCallback((payload) => {
    setCurrentMessage(prev => {
      if (!prev) return prev;
      const cells = prev.agentCells.map(c => {
        if (!['thinking', 'streaming'].includes(c.status)) return c;
        return { ...c, citations: { ...(c.citations || {}), ...payload.data } };
      });
      return { ...prev, agentCells: cells };
    });
  }, []);

  const finalize = useCallback(() => {
    // Use functional updater to get the LATEST pending state
    // (ref might be stale if agent_cell updates are batched with msg_done)
    let finalMsg = null;
    setCurrentMessage(prev => {
      if (!prev) return null;
      finalMsg = {
        ...prev,
        status: 'done',
        agentCells: prev.agentCells.map(c => ({ ...c, status: 'done' })),
      };
      return null; // Clear currentMessage
    });
    return finalMsg;
  }, []);

  const cancel = useCallback(() => {
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
