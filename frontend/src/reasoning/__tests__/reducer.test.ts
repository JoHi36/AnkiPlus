import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reasoningReducer, createStream } from '../store/reducer';
import type { ReasoningStoreState } from '../store/types';

const EMPTY: ReasoningStoreState = { streams: {} };

describe('reasoningReducer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // --- STEP action ---
  describe('STEP', () => {
    it('creates a new stream on first step (phase = accumulating)', () => {
      const now = 1000;
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const next = reasoningReducer(EMPTY, {
        type: 'STEP',
        streamId: 's1',
        step: 'routing',
        status: 'active',
      });

      expect(next.streams['s1']).toBeDefined();
      expect(next.streams['s1'].phase).toBe('accumulating');
      expect(next.streams['s1'].steps).toHaveLength(1);
      expect(next.streams['s1'].steps[0]).toMatchObject({
        step: 'routing',
        status: 'active',
        data: {},
        timestamp: now,
      });
      expect(next.streams['s1'].createdAt).toBe(now);
    });

    it('updates existing step status in-place (same step name)', () => {
      const state: ReasoningStoreState = {
        streams: {
          s1: {
            streamId: 's1',
            phase: 'accumulating',
            steps: [{ step: 'routing', status: 'active', data: {}, timestamp: 100 }],
            createdAt: 100,
          },
        },
      };

      const next = reasoningReducer(state, {
        type: 'STEP',
        streamId: 's1',
        step: 'routing',
        status: 'done',
        data: { agent: 'tutor' },
      });

      expect(next.streams['s1'].steps).toHaveLength(1);
      expect(next.streams['s1'].steps[0].status).toBe('done');
      expect(next.streams['s1'].steps[0].data).toEqual({ agent: 'tutor' });
    });

    it('appends new step to existing stream', () => {
      const state: ReasoningStoreState = {
        streams: {
          s1: {
            streamId: 's1',
            phase: 'accumulating',
            steps: [{ step: 'routing', status: 'done', data: {}, timestamp: 100 }],
            createdAt: 100,
          },
        },
      };

      const next = reasoningReducer(state, {
        type: 'STEP',
        streamId: 's1',
        step: 'retrieval',
        status: 'active',
      });

      expect(next.streams['s1'].steps).toHaveLength(2);
      expect(next.streams['s1'].steps[1].step).toBe('retrieval');
    });

    it('auto-detects generating phase when step=generating + status=active', () => {
      const state: ReasoningStoreState = {
        streams: {
          s1: {
            streamId: 's1',
            phase: 'accumulating',
            steps: [{ step: 'routing', status: 'done', data: {}, timestamp: 100 }],
            createdAt: 100,
          },
        },
      };

      const next = reasoningReducer(state, {
        type: 'STEP',
        streamId: 's1',
        step: 'generating',
        status: 'active',
      });

      expect(next.streams['s1'].phase).toBe('generating');
    });

    it('auto-completes orchestration-only stream (only orchestrating/router steps, all done)', () => {
      const now = 2000;
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const state: ReasoningStoreState = {
        streams: {
          s1: {
            streamId: 's1',
            phase: 'accumulating',
            steps: [
              { step: 'orchestrating', status: 'active', data: {}, timestamp: 100 },
            ],
            createdAt: 100,
          },
        },
      };

      const next = reasoningReducer(state, {
        type: 'STEP',
        streamId: 's1',
        step: 'orchestrating',
        status: 'done',
      });

      expect(next.streams['s1'].phase).toBe('complete');
      expect(next.streams['s1'].completedAt).toBe(now);
    });

    it('does NOT auto-complete agent streams (non-orchestrating steps)', () => {
      // strategy step is done, but it's not orchestrating/router — should NOT auto-complete
      const state: ReasoningStoreState = {
        streams: {
          s1: {
            streamId: 's1',
            phase: 'accumulating',
            steps: [
              { step: 'strategy', status: 'active', data: {}, timestamp: 100 },
            ],
            createdAt: 100,
          },
        },
      };

      const next = reasoningReducer(state, {
        type: 'STEP',
        streamId: 's1',
        step: 'strategy',
        status: 'done',
      });

      // Should stay accumulating — agent streams need explicit PHASE dispatch
      expect(next.streams['s1'].phase).toBe('accumulating');
    });

    it('re-activates completed stream when new active step arrives', () => {
      const state: ReasoningStoreState = {
        streams: {
          s1: {
            streamId: 's1',
            phase: 'complete',
            steps: [
              { step: 'orchestrating', status: 'done', data: {}, timestamp: 100 },
            ],
            createdAt: 100,
            completedAt: 200,
          },
        },
      };

      const next = reasoningReducer(state, {
        type: 'STEP',
        streamId: 's1',
        step: 'sql_search',
        status: 'active',
      });

      expect(next.streams['s1'].phase).toBe('accumulating');
      expect(next.streams['s1'].completedAt).toBeUndefined();
    });

    it('uses provided timestamp when given, falls back to Date.now()', () => {
      const now = 5000;
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const withTimestamp = reasoningReducer(EMPTY, {
        type: 'STEP',
        streamId: 's1',
        step: 'routing',
        status: 'active',
        timestamp: 9999,
      });
      expect(withTimestamp.streams['s1'].steps[0].timestamp).toBe(9999);

      const withoutTimestamp = reasoningReducer(EMPTY, {
        type: 'STEP',
        streamId: 's2',
        step: 'routing',
        status: 'active',
      });
      expect(withoutTimestamp.streams['s2'].steps[0].timestamp).toBe(now);
    });
  });

  // --- PHASE action ---
  describe('PHASE', () => {
    it('updates phase and sets completedAt on complete', () => {
      const now = 3000;
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const state: ReasoningStoreState = {
        streams: {
          s1: {
            streamId: 's1',
            phase: 'generating',
            steps: [],
            createdAt: 100,
          },
        },
      };

      const next = reasoningReducer(state, {
        type: 'PHASE',
        streamId: 's1',
        phase: 'complete',
      });

      expect(next.streams['s1'].phase).toBe('complete');
      expect(next.streams['s1'].completedAt).toBe(now);
    });

    it('returns unchanged state for unknown streamId', () => {
      const state: ReasoningStoreState = {
        streams: {
          s1: {
            streamId: 's1',
            phase: 'accumulating',
            steps: [],
            createdAt: 100,
          },
        },
      };

      const next = reasoningReducer(state, {
        type: 'PHASE',
        streamId: 'unknown',
        phase: 'complete',
      });

      expect(next).toBe(state);
    });
  });

  // --- CITATIONS action ---
  describe('CITATIONS', () => {
    it('sets citations on stream', () => {
      const state: ReasoningStoreState = {
        streams: {
          s1: {
            streamId: 's1',
            phase: 'generating',
            steps: [],
            createdAt: 100,
          },
        },
      };

      const citations = { '1': { title: 'Source A', url: 'https://a.com' } };

      const next = reasoningReducer(state, {
        type: 'CITATIONS',
        streamId: 's1',
        citations,
      });

      expect(next.streams['s1'].citations).toBe(citations);
    });
  });

  // --- AGENT_META action ---
  describe('AGENT_META', () => {
    it('sets agentName and agentColor', () => {
      const state: ReasoningStoreState = {
        streams: {
          s1: {
            streamId: 's1',
            phase: 'accumulating',
            steps: [],
            createdAt: 100,
          },
        },
      };

      const next = reasoningReducer(state, {
        type: 'AGENT_META',
        streamId: 's1',
        agentName: 'Research',
        agentColor: '#FF6B6B',
      });

      expect(next.streams['s1'].agentName).toBe('Research');
      expect(next.streams['s1'].agentColor).toBe('#FF6B6B');
    });
  });

  // --- CLEANUP action ---
  describe('CLEANUP', () => {
    it('removes stream from state', () => {
      const state: ReasoningStoreState = {
        streams: {
          s1: {
            streamId: 's1',
            phase: 'complete',
            steps: [],
            createdAt: 100,
            completedAt: 200,
          },
          s2: {
            streamId: 's2',
            phase: 'accumulating',
            steps: [],
            createdAt: 150,
          },
        },
      };

      const next = reasoningReducer(state, {
        type: 'CLEANUP',
        streamId: 's1',
      });

      expect(next.streams['s1']).toBeUndefined();
      expect(next.streams['s2']).toBeDefined();
    });
  });

  // --- RESET action ---
  describe('RESET', () => {
    it('replaces stream with fresh state (phase=accumulating, steps=[])', () => {
      const now = 4000;
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const state: ReasoningStoreState = {
        streams: {
          s1: {
            streamId: 's1',
            phase: 'complete',
            steps: [{ step: 'routing', status: 'done', data: {}, timestamp: 100 }],
            createdAt: 100,
            completedAt: 200,
            agentName: 'Research',
            citations: { '1': {} },
          },
        },
      };

      const next = reasoningReducer(state, {
        type: 'RESET',
        streamId: 's1',
      });

      expect(next.streams['s1'].phase).toBe('accumulating');
      expect(next.streams['s1'].steps).toEqual([]);
      expect(next.streams['s1'].createdAt).toBe(now);
      expect(next.streams['s1'].completedAt).toBeUndefined();
      expect(next.streams['s1'].agentName).toBeUndefined();
      expect(next.streams['s1'].citations).toBeUndefined();
    });
  });

  // --- createStream helper ---
  describe('createStream', () => {
    it('returns a fresh stream state', () => {
      const now = 7000;
      vi.spyOn(Date, 'now').mockReturnValue(now);

      const stream = createStream('test-id');

      expect(stream).toEqual({
        streamId: 'test-id',
        phase: 'accumulating',
        steps: [],
        createdAt: now,
      });
    });
  });
});
