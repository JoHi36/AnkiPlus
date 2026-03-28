import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useReasoningStore } from './store';
import type { ReasoningStep, DisplayStep, StreamPhase } from './types';
import { STEP_MIN_VISIBILITY } from './types';

const EMPTY_STEPS: ReasoningStep[] = [];

interface UseReasoningStreamOptions {
  streamId?: string;
  steps?: ReasoningStep[];
  mode?: 'full' | 'compact';
  hasOutput?: boolean;
}

interface UseReasoningStreamResult {
  displaySteps: DisplayStep[];
  phase: StreamPhase;
  isCollapsed: boolean;
  toggleCollapse: () => void;
  agentName?: string;
  agentColor?: string;
  citations?: Record<string, any>;
  hasContent: boolean;
}

export function useReasoningStream(options: UseReasoningStreamOptions): UseReasoningStreamResult {
  const { streamId, steps: staticSteps, hasOutput = false } = options;
  const { state } = useReasoningStore();

  const stream = streamId ? state.streams[streamId] : undefined;
  const rawSteps = stream?.steps || staticSteps || EMPTY_STEPS;
  const isLive = Boolean(streamId && stream);
  const phase = stream?.phase || (staticSteps?.length ? 'complete' : 'accumulating');

  const displaySteps = useAdaptivePacing(rawSteps, isLive);

  // All paced steps have been revealed (queue is empty)
  const allRevealed = displaySteps.length >= rawSteps.length;

  const [isCollapsed, setIsCollapsed] = useState(false);
  const userExpandedRef = useRef(false);

  const isOrchestration = useMemo(() => {
    const steps = stream?.steps || staticSteps || EMPTY_STEPS;
    return steps.length > 0 && steps.every(s => s.step === 'orchestrating' || s.step === 'router');
  }, [stream?.steps, staticSteps]);

  useEffect(() => {
    if (userExpandedRef.current) return;
    if (isOrchestration) {
      if (phase === 'complete' && !isCollapsed) setIsCollapsed(true);
    } else {
      // Wait until all paced steps are visible before collapsing
      if (!allRevealed) return;
      if (hasOutput && !isCollapsed) setIsCollapsed(true);
      if (phase === 'generating' && !isCollapsed) setIsCollapsed(true);
    }
  }, [phase, hasOutput, isCollapsed, isOrchestration, allRevealed]);

  const prevPhaseRef = useRef(phase);
  useEffect(() => {
    if (phase === 'accumulating' && prevPhaseRef.current === 'complete') {
      setIsCollapsed(false);
      userExpandedRef.current = false;
    }
    prevPhaseRef.current = phase;
  }, [phase]);

  const toggleCollapse = useCallback(() => {
    setIsCollapsed(prev => {
      userExpandedRef.current = !prev === false;
      return !prev;
    });
  }, []);

  const hasContent = displaySteps.length > 0 || (isLive && phase === 'accumulating' && rawSteps.length > 0);

  return {
    displaySteps,
    phase,
    isCollapsed,
    toggleCollapse,
    agentName: stream?.agentName,
    agentColor: stream?.agentColor,
    citations: stream?.citations,
    hasContent,
  };
}

const EMPTY_DISPLAY: DisplayStep[] = [];

function useAdaptivePacing(rawSteps: ReasoningStep[], isLive: boolean): DisplayStep[] {
  const [displaySteps, setDisplaySteps] = useState<DisplayStep[]>(EMPTY_DISPLAY);
  const queueRef = useRef<ReasoningStep[]>([]);
  const lastShowRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const knownRef = useRef(new Set<string>());

  const flushQueue = useCallback(() => {
    if (queueRef.current.length === 0 || timerRef.current) return;
    const elapsed = Date.now() - lastShowRef.current;
    const delay = Math.max(0, STEP_MIN_VISIBILITY - elapsed);

    const showNext = () => {
      if (queueRef.current.length === 0) return;
      const next = queueRef.current.shift()!;
      lastShowRef.current = Date.now();
      setDisplaySteps(prev => [...prev, { ...next, visibleSince: Date.now() }]);
      if (queueRef.current.length > 0) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          showNext();
        }, STEP_MIN_VISIBILITY);
      }
    };

    if (delay === 0) showNext();
    else {
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        showNext();
      }, delay);
    }
  }, []);

  useEffect(() => {
    if (!isLive) {
      // Static mode: render all steps instantly. Avoid unnecessary state updates.
      if (rawSteps.length === 0) {
        setDisplaySteps(prev => prev.length === 0 ? prev : EMPTY_DISPLAY);
      } else {
        setDisplaySteps(rawSteps.map(s => ({ ...s, visibleSince: Date.now() })));
      }
      knownRef.current = new Set(rawSteps.map(s => s.step));
      return;
    }

    // Live mode: update existing steps in-place
    setDisplaySteps(prev => {
      let changed = false;
      const updated = prev.map(ds => {
        const source = rawSteps.find(s => s.step === ds.step);
        if (!source) return ds;
        if (source.status !== ds.status || JSON.stringify(source.data) !== JSON.stringify(ds.data)) {
          changed = true;
          return { ...ds, status: source.status, data: source.data || ds.data };
        }
        return ds;
      });
      return changed ? updated : prev;
    });

    // Queue new steps for paced reveal
    for (const s of rawSteps) {
      if (!knownRef.current.has(s.step)) {
        knownRef.current.add(s.step);
        queueRef.current.push(s);
      }
    }

    flushQueue();
  }, [rawSteps, isLive, flushQueue]);

  useEffect(() => {
    if (rawSteps.length === 0 && displaySteps.length > 0 && !isLive) {
      setDisplaySteps(EMPTY_DISPLAY);
      knownRef.current.clear();
      queueRef.current = [];
    }
  }, [rawSteps, isLive]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return displaySteps;
}
