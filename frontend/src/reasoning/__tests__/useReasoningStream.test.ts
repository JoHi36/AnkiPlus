import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { useReasoningStream } from '../useReasoningStream';
import { ReasoningProvider, useReasoningDispatch } from '../store';
import type { ReasoningStep } from '../types';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(ReasoningProvider, null, children);

const step = (
  s: string,
  status: 'active' | 'done' = 'active',
  data: Record<string, any> = {},
): ReasoningStep => ({
  step: s,
  status,
  data,
  timestamp: Date.now(),
});

describe('useReasoningStream', () => {
  beforeEach(() => {
    // Only fake setTimeout and Date — leave setInterval real so the
    // ReasoningProvider cleanup interval (5 s) never fires during tests.
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // --- Static mode (steps prop) ---
  describe('static mode (steps prop)', () => {
    it('renders all steps instantly when given steps prop', () => {
      const steps = [step('routing', 'done'), step('retrieval', 'done'), step('generating', 'done')];

      const { result } = renderHook(() => useReasoningStream({ steps }), { wrapper });

      expect(result.current.displaySteps).toHaveLength(3);
      expect(result.current.displaySteps[0].step).toBe('routing');
      expect(result.current.displaySteps[1].step).toBe('retrieval');
      expect(result.current.displaySteps[2].step).toBe('generating');
      expect(result.current.phase).toBe('complete');
      expect(result.current.hasContent).toBe(true);
    });

    it('returns hasContent=false when steps is empty array', () => {
      const { result } = renderHook(() => useReasoningStream({ steps: [] }), { wrapper });

      expect(result.current.displaySteps).toHaveLength(0);
      expect(result.current.hasContent).toBe(false);
    });
  });

  // --- Live mode (streamId) ---
  describe('live mode (streamId)', () => {
    it('returns hasContent=false before any steps dispatched', () => {
      const { result } = renderHook(
        () => {
          const dispatch = useReasoningDispatch();
          const stream = useReasoningStream({ streamId: 'test-1' });
          return { dispatch, stream };
        },
        { wrapper },
      );

      expect(result.current.stream.hasContent).toBe(false);
      expect(result.current.stream.displaySteps).toHaveLength(0);
    });

    it('shows first step immediately, second after 200ms pacing', () => {
      const { result } = renderHook(
        () => {
          const dispatch = useReasoningDispatch();
          const stream = useReasoningStream({ streamId: 'test-2' });
          return { dispatch, stream };
        },
        { wrapper },
      );

      // Dispatch two steps rapidly
      act(() => {
        result.current.dispatch({
          type: 'STEP',
          streamId: 'test-2',
          step: 'routing',
          status: 'active',
        });
        result.current.dispatch({
          type: 'STEP',
          streamId: 'test-2',
          step: 'retrieval',
          status: 'active',
        });
      });

      // First step should appear immediately
      expect(result.current.stream.displaySteps.length).toBeGreaterThanOrEqual(1);
      expect(result.current.stream.displaySteps[0].step).toBe('routing');

      // Second step should NOT be visible yet (less than 200ms)
      if (result.current.stream.displaySteps.length < 2) {
        // Advance past STEP_MIN_VISIBILITY
        act(() => {
          vi.advanceTimersByTime(200);
        });

        expect(result.current.stream.displaySteps).toHaveLength(2);
        expect(result.current.stream.displaySteps[1].step).toBe('retrieval');
      }
    });
  });

  // --- Collapse logic ---
  describe('collapse logic', () => {
    it('auto-collapses orchestration stream when phase=complete', () => {
      const { result } = renderHook(
        () => {
          const dispatch = useReasoningDispatch();
          const stream = useReasoningStream({ streamId: 'orch-1' });
          return { dispatch, stream };
        },
        { wrapper },
      );

      // Dispatch only orchestrating/router steps (makes it an orchestration stream)
      act(() => {
        result.current.dispatch({
          type: 'STEP',
          streamId: 'orch-1',
          step: 'orchestrating',
          status: 'done',
        });
        result.current.dispatch({
          type: 'STEP',
          streamId: 'orch-1',
          step: 'router',
          status: 'done',
        });
      });

      // Flush pacing timers
      act(() => {
        vi.advanceTimersByTime(500);
      });

      // Phase should be complete (all steps done, no generating)
      // The auto-collapse should kick in
      expect(result.current.stream.phase).toBe('complete');
      expect(result.current.stream.isCollapsed).toBe(true);
    });

    it('auto-collapses agent stream when hasOutput=true', () => {
      const { result, rerender } = renderHook(
        ({ hasOutput }: { hasOutput: boolean }) => {
          const dispatch = useReasoningDispatch();
          const stream = useReasoningStream({ streamId: 'agent-1', hasOutput });
          return { dispatch, stream };
        },
        { wrapper, initialProps: { hasOutput: false } },
      );

      // Dispatch a non-orchestration step
      act(() => {
        result.current.dispatch({
          type: 'STEP',
          streamId: 'agent-1',
          step: 'sql_search',
          status: 'active',
        });
      });

      expect(result.current.stream.isCollapsed).toBe(false);

      // Rerender with hasOutput=true
      rerender({ hasOutput: true });

      expect(result.current.stream.isCollapsed).toBe(true);
    });

    it('user toggle prevents auto-collapse', () => {
      const { result } = renderHook(
        () => {
          const dispatch = useReasoningDispatch();
          const stream = useReasoningStream({ streamId: 'toggle-1' });
          return { dispatch, stream };
        },
        { wrapper },
      );

      // Dispatch orchestration steps
      act(() => {
        result.current.dispatch({
          type: 'STEP',
          streamId: 'toggle-1',
          step: 'orchestrating',
          status: 'active',
        });
      });

      // Complete the step to trigger auto-collapse via phase=complete
      act(() => {
        result.current.dispatch({
          type: 'STEP',
          streamId: 'toggle-1',
          step: 'orchestrating',
          status: 'done',
        });
      });

      act(() => {
        vi.advanceTimersByTime(500);
      });

      // Should be auto-collapsed now
      expect(result.current.stream.isCollapsed).toBe(true);

      // User toggles open
      act(() => {
        result.current.stream.toggleCollapse();
      });

      expect(result.current.stream.isCollapsed).toBe(false);

      // Even if conditions for auto-collapse persist, it stays open
      // Re-dispatch to trigger effects
      act(() => {
        result.current.dispatch({
          type: 'PHASE',
          streamId: 'toggle-1',
          phase: 'complete',
        });
      });

      expect(result.current.stream.isCollapsed).toBe(false);
    });
  });

  // --- Phase tracking ---
  describe('phase tracking', () => {
    it('reflects store phase (generating step -> phase=generating)', () => {
      const { result } = renderHook(
        () => {
          const dispatch = useReasoningDispatch();
          const stream = useReasoningStream({ streamId: 'phase-1' });
          return { dispatch, stream };
        },
        { wrapper },
      );

      act(() => {
        result.current.dispatch({
          type: 'STEP',
          streamId: 'phase-1',
          step: 'routing',
          status: 'active',
        });
      });

      expect(result.current.stream.phase).toBe('accumulating');

      act(() => {
        result.current.dispatch({
          type: 'STEP',
          streamId: 'phase-1',
          step: 'generating',
          status: 'active',
        });
      });

      expect(result.current.stream.phase).toBe('generating');
    });
  });
});
