import { useState, useRef, useCallback, useEffect } from 'react';
import { flushSync } from 'react-dom';

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
      orchestration: {
        agent: null,
        mode: null,
        steps: [{ step: 'orchestrating', status: 'active', data: {}, timestamp: Date.now() }],
      },
      agentCells: [],
    });
  }, []);

  const handleOrchestration = useCallback((payload) => {
    setCurrentMessage(prev => {
      if (!prev) return prev;
      // Merge incoming steps with the existing active orchestrating step (now done)
      const finalSteps = payload.steps || [];
      // Ensure the orchestrating step is marked done
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
    // flushSync forces React to process all pending state updates synchronously,
    // ensuring the updater runs immediately (not deferred by React 18 auto-batching).
    // This is critical because ankiReceive is a non-React context.
    let finalMsg = null;
    flushSync(() => {
      setCurrentMessage(prev => {
        if (!prev) return null;
        finalMsg = {
          ...prev,
          status: 'done',
          agentCells: prev.agentCells.map(c => ({ ...c, status: 'done' })),
        };
        return null;
      });
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
