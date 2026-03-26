# Unified Reasoning Display — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the scattered pipeline state management and ReasoningStream component with a centralized ReasoningStore, useReasoningStream hook, and drop-in ReasoningDisplay component.

**Architecture:** Three layers — ReasoningStore (Context+Reducer for all streams), useReasoningStream (adaptive pacing + collapse), ReasoningDisplay (drop-in component with full/compact modes). Existing step renderers and registry stay unchanged.

**Tech Stack:** React 18 (Context + useReducer), TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-03-26-unified-reasoning-display-design.md`

---

## File Structure

### New Files

```
frontend/src/reasoning/
├── store/
│   ├── types.ts              # StreamPhase, ReasoningStreamState, ReasoningStoreState, ReasoningAction
│   ├── reducer.ts            # reasoningReducer + createStream helper
│   └── ReasoningProvider.tsx  # Context, Provider, useReasoningStore, useReasoningDispatch
├── useReasoningStream.ts      # Hook: store subscription, adaptive pacing, collapse
├── ReasoningDisplay.tsx       # Drop-in component (router to Full/Compact)
├── FullReasoningDisplay.tsx   # Full mode (step list, collapse toggle, skeleton, sources)
├── CompactReasoningDisplay.tsx # Compact mode (one-at-a-time crossfade)
└── __tests__/
    ├── reducer.test.ts        # Reducer unit tests
    ├── useReasoningStream.test.ts # Hook pacing + collapse tests
    └── ReasoningDisplay.test.tsx  # Component rendering tests
```

### Modified Files

```
frontend/src/App.jsx                           # Wrap in ReasoningProvider, replace pipeline dispatch
frontend/src/hooks/useChat.js                  # Remove pipelineSteps, pipelineGeneration, currentSteps
frontend/src/hooks/useAgenticMessage.js        # Remove handlePipelineStep, remove cell.pipelineSteps
frontend/src/hooks/useSmartSearch.js           # Remove pipelineSteps, pipelineGeneration, event listener
frontend/src/components/ChatMessage.jsx        # Replace ReasoningStream with ReasoningDisplay
frontend/src/components/SearchSidebar.jsx      # Replace ReasoningStream with ReasoningDisplay
frontend/src/reasoning/types.ts                # Add StreamPhase, STEP_MIN_VISIBILITY (keep existing types)
```

### Deleted Files (after migration)

```
frontend/src/reasoning/ReasoningStream.tsx     # Fully replaced by ReasoningDisplay
```

---

## Task 1: Store Types & Reducer

**Files:**
- Create: `frontend/src/reasoning/store/types.ts`
- Create: `frontend/src/reasoning/store/reducer.ts`
- Modify: `frontend/src/reasoning/types.ts` (add `StreamPhase`, `STEP_MIN_VISIBILITY`)
- Test: `frontend/src/reasoning/__tests__/reducer.test.ts`

**Note:** The spec lists `store/actions.ts` as a separate file. This plan co-locates `ReasoningAction` in `store/types.ts` for simplicity since the type union is small.

- [ ] **Step 1: Update existing types.ts**

In `frontend/src/reasoning/types.ts`, add new types and replace the old constant:

```typescript
// Add at end of file:
export type StreamPhase = 'accumulating' | 'generating' | 'complete';
export const STEP_MIN_VISIBILITY = 200;
```

Remove the now-obsolete constant and type (will be dead code after ReasoningStream.tsx is deleted):

```typescript
// DELETE these lines:
export const MIN_STEP_INTERVAL = 800;
export type CollapseRule = 'auto' | 'never' | 'immediate';
```

- [ ] **Step 2: Create store types**

Create `frontend/src/reasoning/store/types.ts`:

```typescript
import { ReasoningStep, StreamPhase } from '../types';

export interface ReasoningStreamState {
  streamId: string;
  phase: StreamPhase;
  steps: ReasoningStep[];
  agentName?: string;
  agentColor?: string;
  citations?: Record<string, any>;
  createdAt: number;
  completedAt?: number;
}

export interface ReasoningStoreState {
  streams: Record<string, ReasoningStreamState>;
}

export type ReasoningAction =
  | { type: 'STEP'; streamId: string; step: string; status: 'active' | 'done' | 'error'; data?: Record<string, any>; timestamp?: number }
  | { type: 'PHASE'; streamId: string; phase: StreamPhase }
  | { type: 'CITATIONS'; streamId: string; citations: Record<string, any> }
  | { type: 'AGENT_META'; streamId: string; agentName?: string; agentColor?: string }
  | { type: 'CLEANUP'; streamId: string }
  | { type: 'RESET'; streamId: string };
```

- [ ] **Step 3: Write failing reducer tests**

Create `frontend/src/reasoning/__tests__/reducer.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { reasoningReducer, createStream } from '../store/reducer';
import type { ReasoningStoreState } from '../store/types';

const emptyState: ReasoningStoreState = { streams: {} };

describe('reasoningReducer', () => {
  describe('STEP action', () => {
    it('creates a new stream on first step', () => {
      const result = reasoningReducer(emptyState, {
        type: 'STEP', streamId: 's1', step: 'sql_search', status: 'active',
      });
      expect(result.streams['s1']).toBeDefined();
      expect(result.streams['s1'].steps).toHaveLength(1);
      expect(result.streams['s1'].phase).toBe('accumulating');
    });

    it('updates existing step status in-place', () => {
      const withStep = reasoningReducer(emptyState, {
        type: 'STEP', streamId: 's1', step: 'sql_search', status: 'active',
      });
      const result = reasoningReducer(withStep, {
        type: 'STEP', streamId: 's1', step: 'sql_search', status: 'done', data: { total_hits: 5 },
      });
      expect(result.streams['s1'].steps).toHaveLength(1);
      expect(result.streams['s1'].steps[0].status).toBe('done');
      expect(result.streams['s1'].steps[0].data.total_hits).toBe(5);
    });

    it('appends new step to existing stream', () => {
      const withOne = reasoningReducer(emptyState, {
        type: 'STEP', streamId: 's1', step: 'sql_search', status: 'done',
      });
      const result = reasoningReducer(withOne, {
        type: 'STEP', streamId: 's1', step: 'semantic_search', status: 'active',
      });
      expect(result.streams['s1'].steps).toHaveLength(2);
    });

    it('auto-detects generating phase', () => {
      const result = reasoningReducer(emptyState, {
        type: 'STEP', streamId: 's1', step: 'generating', status: 'active',
      });
      expect(result.streams['s1'].phase).toBe('generating');
    });

    it('auto-completes orchestration stream when all steps done', () => {
      const withActive = reasoningReducer(emptyState, {
        type: 'STEP', streamId: 's1', step: 'orchestrating', status: 'active',
      });
      const result = reasoningReducer(withActive, {
        type: 'STEP', streamId: 's1', step: 'orchestrating', status: 'done',
      });
      expect(result.streams['s1'].phase).toBe('complete');
      expect(result.streams['s1'].completedAt).toBeDefined();
    });

    it('does NOT auto-complete when generating step exists', () => {
      let state = reasoningReducer(emptyState, {
        type: 'STEP', streamId: 's1', step: 'sql_search', status: 'done',
      });
      state = reasoningReducer(state, {
        type: 'STEP', streamId: 's1', step: 'generating', status: 'active',
      });
      // generating is active, not done — but even if all non-generating are done,
      // the presence of 'generating' step prevents auto-complete
      expect(state.streams['s1'].phase).toBe('generating');
    });

    it('uses provided timestamp when given', () => {
      const result = reasoningReducer(emptyState, {
        type: 'STEP', streamId: 's1', step: 'sql_search', status: 'active', timestamp: 12345,
      });
      expect(result.streams['s1'].steps[0].timestamp).toBe(12345);
    });
  });

  describe('PHASE action', () => {
    it('updates phase and sets completedAt on complete', () => {
      const withStream = reasoningReducer(emptyState, {
        type: 'STEP', streamId: 's1', step: 'sql_search', status: 'active',
      });
      const result = reasoningReducer(withStream, {
        type: 'PHASE', streamId: 's1', phase: 'complete',
      });
      expect(result.streams['s1'].phase).toBe('complete');
      expect(result.streams['s1'].completedAt).toBeDefined();
    });

    it('ignores unknown streamId', () => {
      const result = reasoningReducer(emptyState, {
        type: 'PHASE', streamId: 'unknown', phase: 'complete',
      });
      expect(result).toBe(emptyState);
    });
  });

  describe('CITATIONS action', () => {
    it('sets citations on stream', () => {
      const withStream = reasoningReducer(emptyState, {
        type: 'STEP', streamId: 's1', step: 'sql_search', status: 'active',
      });
      const result = reasoningReducer(withStream, {
        type: 'CITATIONS', streamId: 's1', citations: { c1: { text: 'hello' } },
      });
      expect(result.streams['s1'].citations).toEqual({ c1: { text: 'hello' } });
    });
  });

  describe('AGENT_META action', () => {
    it('sets agent name and color', () => {
      const withStream = reasoningReducer(emptyState, {
        type: 'STEP', streamId: 's1', step: 'sql_search', status: 'active',
      });
      const result = reasoningReducer(withStream, {
        type: 'AGENT_META', streamId: 's1', agentName: 'tutor', agentColor: '#0A84FF',
      });
      expect(result.streams['s1'].agentName).toBe('tutor');
      expect(result.streams['s1'].agentColor).toBe('#0A84FF');
    });
  });

  describe('CLEANUP action', () => {
    it('removes stream from state', () => {
      const withStream = reasoningReducer(emptyState, {
        type: 'STEP', streamId: 's1', step: 'sql_search', status: 'active',
      });
      const result = reasoningReducer(withStream, {
        type: 'CLEANUP', streamId: 's1',
      });
      expect(result.streams['s1']).toBeUndefined();
    });
  });

  describe('RESET action', () => {
    it('replaces stream with fresh state', () => {
      let state = reasoningReducer(emptyState, {
        type: 'STEP', streamId: 's1', step: 'sql_search', status: 'done',
      });
      state = reasoningReducer(state, {
        type: 'PHASE', streamId: 's1', phase: 'complete',
      });
      const result = reasoningReducer(state, {
        type: 'RESET', streamId: 's1',
      });
      expect(result.streams['s1'].phase).toBe('accumulating');
      expect(result.streams['s1'].steps).toHaveLength(0);
    });
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/reasoning/__tests__/reducer.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 5: Implement reducer**

Create `frontend/src/reasoning/store/reducer.ts`:

```typescript
import type { ReasoningStep } from '../types';
import type { ReasoningStreamState, ReasoningStoreState, ReasoningAction } from './types';

export function createStream(streamId: string): ReasoningStreamState {
  return { streamId, phase: 'accumulating', steps: [], createdAt: Date.now() };
}

export function reasoningReducer(state: ReasoningStoreState, action: ReasoningAction): ReasoningStoreState {
  switch (action.type) {
    case 'STEP': {
      const stream = state.streams[action.streamId] || createStream(action.streamId);
      const existingIdx = stream.steps.findIndex(s => s.step === action.step);
      const newStep: ReasoningStep = {
        step: action.step,
        status: action.status,
        data: action.data || {},
        timestamp: action.timestamp || Date.now(),
      };

      const updatedSteps = existingIdx >= 0
        ? stream.steps.map((s, i) => i === existingIdx ? { ...s, status: newStep.status, data: newStep.data } : s)
        : [...stream.steps, newStep];

      let phase = stream.phase;
      let completedAt = stream.completedAt;

      if (action.step === 'generating' && action.status === 'active') {
        phase = 'generating';
      }
      if (updatedSteps.length > 0 &&
          updatedSteps.every(s => s.status === 'done') &&
          !updatedSteps.some(s => s.step === 'generating')) {
        phase = 'complete';
        completedAt = Date.now();
      }

      return {
        streams: { ...state.streams, [action.streamId]: { ...stream, steps: updatedSteps, phase, completedAt } },
      };
    }

    case 'PHASE': {
      const stream = state.streams[action.streamId];
      if (!stream) return state;
      const completedAt = action.phase === 'complete' ? Date.now() : stream.completedAt;
      return {
        streams: { ...state.streams, [action.streamId]: { ...stream, phase: action.phase, completedAt } },
      };
    }

    case 'CITATIONS': {
      const stream = state.streams[action.streamId];
      if (!stream) return state;
      return {
        streams: { ...state.streams, [action.streamId]: { ...stream, citations: action.citations } },
      };
    }

    case 'AGENT_META': {
      const stream = state.streams[action.streamId];
      if (!stream) return state;
      return {
        streams: {
          ...state.streams,
          [action.streamId]: { ...stream, agentName: action.agentName, agentColor: action.agentColor },
        },
      };
    }

    case 'CLEANUP': {
      const { [action.streamId]: _, ...rest } = state.streams;
      return { streams: rest };
    }

    case 'RESET': {
      return {
        streams: { ...state.streams, [action.streamId]: createStream(action.streamId) },
      };
    }
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/reasoning/__tests__/reducer.test.ts`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/reasoning/store/ frontend/src/reasoning/types.ts frontend/src/reasoning/__tests__/reducer.test.ts
git commit -m "feat(reasoning): add ReasoningStore types and reducer with tests"
```

---

## Task 2: ReasoningProvider (Context + Cleanup)

**Files:**
- Create: `frontend/src/reasoning/store/ReasoningProvider.tsx`

- [ ] **Step 1: Create ReasoningProvider**

Create `frontend/src/reasoning/store/ReasoningProvider.tsx`:

```typescript
import React, { createContext, useContext, useReducer, useEffect, useRef, type ReactNode } from 'react';
import { reasoningReducer } from './reducer';
import type { ReasoningStoreState, ReasoningAction } from './types';

const CLEANUP_INTERVAL = 5000;
const COMPLETED_TTL = 10_000;

interface ReasoningContextValue {
  state: ReasoningStoreState;
  dispatch: React.Dispatch<ReasoningAction>;
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

export function ReasoningProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reasoningReducer, { streams: {} });
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      for (const [id, stream] of Object.entries(stateRef.current.streams)) {
        if (stream.phase === 'complete' && stream.completedAt && now - stream.completedAt > COMPLETED_TTL) {
          dispatch({ type: 'CLEANUP', streamId: id });
        }
      }
    }, CLEANUP_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  return (
    <ReasoningContext.Provider value={{ state, dispatch }}>
      {children}
    </ReasoningContext.Provider>
  );
}

export function useReasoningStore(): ReasoningContextValue {
  const ctx = useContext(ReasoningContext);
  if (!ctx) throw new Error('useReasoningStore must be used within ReasoningProvider');
  return ctx;
}

export function useReasoningDispatch(): React.Dispatch<ReasoningAction> {
  return useReasoningStore().dispatch;
}
```

- [ ] **Step 2: Create barrel export**

Create `frontend/src/reasoning/store/index.ts`:

```typescript
export { ReasoningProvider, useReasoningStore, useReasoningDispatch } from './ReasoningProvider';
export { reasoningReducer, createStream } from './reducer';
export type { ReasoningStreamState, ReasoningStoreState, ReasoningAction } from './types';
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/reasoning/store/
git commit -m "feat(reasoning): add ReasoningProvider context with auto-cleanup"
```

---

## Task 3: useReasoningStream Hook

**Files:**
- Create: `frontend/src/reasoning/useReasoningStream.ts`
- Test: `frontend/src/reasoning/__tests__/useReasoningStream.test.ts`

- [ ] **Step 1: Write failing hook tests**

Create `frontend/src/reasoning/__tests__/useReasoningStream.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { useReasoningStream } from '../useReasoningStream';
import { ReasoningProvider } from '../store/ReasoningProvider';
import { useReasoningDispatch } from '../store';
import type { ReasoningStep } from '../types';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(ReasoningProvider, null, children);

const step = (s: string, status: 'active' | 'done' = 'active', data = {}): ReasoningStep => ({
  step: s, status, data, timestamp: Date.now(),
});

describe('useReasoningStream', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  describe('static mode (steps prop)', () => {
    it('renders all steps instantly', () => {
      const steps = [step('sql_search', 'done'), step('semantic_search', 'done')];
      const { result } = renderHook(() => useReasoningStream({ steps }), { wrapper });
      expect(result.current.displaySteps).toHaveLength(2);
      expect(result.current.hasContent).toBe(true);
    });

    it('returns empty when no steps', () => {
      const { result } = renderHook(() => useReasoningStream({ steps: [] }), { wrapper });
      expect(result.current.hasContent).toBe(false);
    });
  });

  describe('live mode (streamId)', () => {
    it('returns hasContent=false before any steps', () => {
      const { result } = renderHook(() => useReasoningStream({ streamId: 'test-1' }), { wrapper });
      expect(result.current.hasContent).toBe(false);
    });

    it('shows steps after dispatch with 200ms pacing', () => {
      const { result } = renderHook(() => {
        const dispatch = useReasoningDispatch();
        const stream = useReasoningStream({ streamId: 'test-1' });
        return { dispatch, stream };
      }, { wrapper });

      act(() => {
        result.current.dispatch({ type: 'STEP', streamId: 'test-1', step: 'sql_search', status: 'active' });
      });
      act(() => { vi.advanceTimersByTime(0); });
      expect(result.current.stream.displaySteps).toHaveLength(1);

      act(() => {
        result.current.dispatch({ type: 'STEP', streamId: 'test-1', step: 'semantic_search', status: 'active' });
      });
      // Before 200ms — second step not visible yet
      act(() => { vi.advanceTimersByTime(100); });
      expect(result.current.stream.displaySteps).toHaveLength(1);

      // After 200ms — second step appears
      act(() => { vi.advanceTimersByTime(100); });
      expect(result.current.stream.displaySteps).toHaveLength(2);
    });
  });

  describe('collapse logic', () => {
    it('orchestration auto-collapses on complete', () => {
      const { result } = renderHook(() => {
        const dispatch = useReasoningDispatch();
        const stream = useReasoningStream({ streamId: 'orch-1' });
        return { dispatch, stream };
      }, { wrapper });

      act(() => {
        result.current.dispatch({ type: 'STEP', streamId: 'orch-1', step: 'orchestrating', status: 'active' });
      });
      expect(result.current.stream.isCollapsed).toBe(false);

      act(() => {
        result.current.dispatch({ type: 'STEP', streamId: 'orch-1', step: 'orchestrating', status: 'done' });
      });
      // auto-complete triggers, phase → complete → auto-collapse
      expect(result.current.stream.isCollapsed).toBe(true);
    });

    it('agent collapses when hasOutput=true', () => {
      const steps = [step('sql_search', 'done'), step('semantic_search', 'done')];
      const { result, rerender } = renderHook(
        ({ hasOutput }) => useReasoningStream({ steps, hasOutput }),
        { wrapper, initialProps: { hasOutput: false } },
      );
      expect(result.current.isCollapsed).toBe(false);

      rerender({ hasOutput: true });
      expect(result.current.isCollapsed).toBe(true);
    });

    it('user toggle prevents auto-collapse', () => {
      const { result } = renderHook(() => {
        const dispatch = useReasoningDispatch();
        const stream = useReasoningStream({ streamId: 'orch-2' });
        return { dispatch, stream };
      }, { wrapper });

      act(() => {
        result.current.dispatch({ type: 'STEP', streamId: 'orch-2', step: 'orchestrating', status: 'active' });
      });
      // User expands
      act(() => { result.current.stream.toggleCollapse(); });

      act(() => {
        result.current.dispatch({ type: 'STEP', streamId: 'orch-2', step: 'orchestrating', status: 'done' });
      });
      // Should NOT auto-collapse because user expanded
      expect(result.current.stream.isCollapsed).toBe(false);
    });
  });

  describe('phase tracking', () => {
    it('reflects store phase', () => {
      const { result } = renderHook(() => {
        const dispatch = useReasoningDispatch();
        const stream = useReasoningStream({ streamId: 'phase-1' });
        return { dispatch, stream };
      }, { wrapper });

      act(() => {
        result.current.dispatch({ type: 'STEP', streamId: 'phase-1', step: 'generating', status: 'active' });
      });
      expect(result.current.stream.phase).toBe('generating');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/reasoning/__tests__/useReasoningStream.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement useReasoningStream**

Create `frontend/src/reasoning/useReasoningStream.ts`:

```typescript
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useReasoningStore } from './store';
import type { ReasoningStep, DisplayStep, StreamPhase } from './types';
import { STEP_MIN_VISIBILITY } from './types';

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

  // Data source: store (live) or props (static)
  const stream = streamId ? state.streams[streamId] : undefined;
  const rawSteps = stream?.steps || staticSteps || [];
  const isLive = Boolean(streamId && stream);
  const phase = stream?.phase || (staticSteps?.length ? 'complete' : 'accumulating');

  // Adaptive pacing
  const displaySteps = useAdaptivePacing(rawSteps, isLive);

  // Collapse state
  const [isCollapsed, setIsCollapsed] = useState(false);
  const userExpandedRef = useRef(false);

  const isOrchestration = useMemo(() => {
    const steps = stream?.steps || staticSteps || [];
    return steps.length > 0 && steps.every(s => s.step === 'orchestrating' || s.step === 'router');
  }, [stream?.steps, staticSteps]);

  // Auto-collapse rules
  useEffect(() => {
    if (userExpandedRef.current) return;
    if (isOrchestration) {
      if (phase === 'complete' && !isCollapsed) setIsCollapsed(true);
    } else {
      if (hasOutput && !isCollapsed) setIsCollapsed(true);
      if (phase === 'generating' && !isCollapsed) setIsCollapsed(true);
    }
  }, [phase, hasOutput, isCollapsed, isOrchestration]);

  // Reset on new stream
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
      userExpandedRef.current = !prev === false; // expanding = true
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

// --- Adaptive Pacing (internal) ---

function useAdaptivePacing(rawSteps: ReasoningStep[], isLive: boolean): DisplayStep[] {
  const [displaySteps, setDisplaySteps] = useState<DisplayStep[]>([]);
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
        timerRef.current = setTimeout(() => { timerRef.current = null; showNext(); }, STEP_MIN_VISIBILITY);
      }
    };

    if (delay === 0) showNext();
    else {
      timerRef.current = setTimeout(() => { timerRef.current = null; showNext(); }, delay);
    }
  }, []);

  useEffect(() => {
    if (!isLive) {
      setDisplaySteps(rawSteps.map(s => ({ ...s, visibleSince: Date.now() })));
      knownRef.current = new Set(rawSteps.map(s => s.step));
      return;
    }

    // Update existing steps (status/data changes)
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

    // Queue new steps
    for (const s of rawSteps) {
      if (!knownRef.current.has(s.step)) {
        knownRef.current.add(s.step);
        queueRef.current.push(s);
      }
    }

    flushQueue();
  }, [rawSteps, isLive, flushQueue]);

  // Reset when going from static to empty (or stream reset)
  useEffect(() => {
    if (rawSteps.length === 0 && displaySteps.length > 0 && !isLive) {
      setDisplaySteps([]);
      knownRef.current.clear();
      queueRef.current = [];
    }
  }, [rawSteps, isLive]);

  // Cleanup timers on unmount
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return displaySteps;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/reasoning/__tests__/useReasoningStream.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/reasoning/useReasoningStream.ts frontend/src/reasoning/__tests__/useReasoningStream.test.ts
git commit -m "feat(reasoning): add useReasoningStream hook with adaptive pacing"
```

---

## Task 4: ReasoningDisplay Components

**Files:**
- Create: `frontend/src/reasoning/ReasoningDisplay.tsx`
- Create: `frontend/src/reasoning/FullReasoningDisplay.tsx`
- Create: `frontend/src/reasoning/CompactReasoningDisplay.tsx`

This task extracts visual elements from `ReasoningStream.tsx` into the new components. No tests for rendering specifics — the existing visual behavior is preserved, tested via manual inspection.

- [ ] **Step 1: Create ReasoningDisplay (router component)**

Create `frontend/src/reasoning/ReasoningDisplay.tsx`:

```typescript
import React from 'react';
import { useReasoningStream } from './useReasoningStream';
import FullReasoningDisplay from './FullReasoningDisplay';
import CompactReasoningDisplay from './CompactReasoningDisplay';
import type { ReasoningStep } from './types';

export interface ReasoningDisplayProps {
  streamId?: string;
  steps?: ReasoningStep[];
  mode?: 'full' | 'compact';
  hasOutput?: boolean;
  agentColor?: string;
  label?: string;
  bridge?: any;
  onPreviewCard?: (citation: any) => void;
}

export default function ReasoningDisplay({
  streamId,
  steps: staticSteps,
  mode = 'full',
  hasOutput = false,
  agentColor: colorOverride,
  label,
  bridge,
  onPreviewCard,
}: ReasoningDisplayProps) {
  const {
    displaySteps,
    phase,
    isCollapsed,
    toggleCollapse,
    agentName,
    agentColor: storeColor,
    citations,
    hasContent,
  } = useReasoningStream({ streamId, steps: staticSteps, mode, hasOutput });

  const agentColor = colorOverride || storeColor;

  if (!hasContent) return null;

  if (mode === 'compact') {
    return (
      <CompactReasoningDisplay
        displaySteps={displaySteps}
        phase={phase}
        agentColor={agentColor}
      />
    );
  }

  return (
    <FullReasoningDisplay
      displaySteps={displaySteps}
      phase={phase}
      isCollapsed={isCollapsed}
      toggleCollapse={toggleCollapse}
      agentColor={agentColor}
      label={label}
      citations={citations}
      hasOutput={hasOutput}
      isStreaming={Boolean(streamId && phase !== 'complete')}
      bridge={bridge}
      onPreviewCard={onPreviewCard}
    />
  );
}
```

- [ ] **Step 2: Create FullReasoningDisplay**

Create `frontend/src/reasoning/FullReasoningDisplay.tsx`. Extract from `ReasoningStream.tsx`:
- `PhaseRow` component (lines 199-282)
- `ExtendingLine` (lines 284-297)
- `ChevronRight`, `ChevronDownIcon` (lines 299-313)
- Collapsed view (lines 440-477)
- Expanded view (lines 483-553)
- Text skeleton (lines 469-475)
- Keyframes injection (lines 334-346)
- Hidden step filtering (using `getStepRenderer(step)?.hidden`)
- `merge` step filtering

**Key change:** SourcesCarousel renders BELOW the collapsible step list, not inside it. Layout skeleton:

```tsx
return (
  <div>
    {/* Collapsed view — clickable summary */}
    {isCollapsed && <CollapsedSummary ... />}

    {/* Expanded view — step list */}
    {!isCollapsed && <ExpandedStepList ... />}

    {/* SourcesCarousel — OUTSIDE collapse boundary, always visible */}
    {sourcesReady && citations && (
      <SourcesCarousel citations={citations} bridge={bridge} onPreviewCard={onPreviewCard} />
    )}

    {/* Text skeleton — shows during generating phase before output */}
    {phase === 'generating' && !hasOutput && <TextSkeleton />}
  </div>
);
```

Hidden step filtering before rendering (same as current ReasoningStream.tsx lines 348-362):

```typescript
const visibleSteps = displaySteps.filter(ds => {
  const r = getStepRenderer(ds.step);
  return !r?.hidden && ds.step !== 'merge';
});
```

The component receives display-ready data from props (no store access, no pacing logic).

- [ ] **Step 3: Create CompactReasoningDisplay**

Create `frontend/src/reasoning/CompactReasoningDisplay.tsx`:

```typescript
import React from 'react';
import type { DisplayStep, StreamPhase } from './types';
import { getStepRenderer, getFallbackRenderer } from './stepRegistry';

interface CompactProps {
  displaySteps: DisplayStep[];
  phase: StreamPhase;
  agentColor?: string;
}

export default function CompactReasoningDisplay({ displaySteps, phase, agentColor }: CompactProps) {
  const currentStep = displaySteps[displaySteps.length - 1];
  const completedCount = displaySteps.filter(s => s.status === 'done').length;
  const totalCount = displaySteps.length;

  if (!currentStep) return null;

  const renderer = getStepRenderer(currentStep.step) || getFallbackRenderer(currentStep.step);
  const isActive = currentStep.status === 'active';
  const title = isActive
    ? (typeof renderer.activeTitle === 'function' ? renderer.activeTitle(currentStep.data) : renderer.activeTitle)
    : renderer.doneLabel(currentStep.data, currentStep.status);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', userSelect: 'none' }}>
      <span style={{ fontSize: 11, color: 'var(--ds-text-tertiary)', fontFamily: 'monospace', minWidth: 24 }}>
        {completedCount}/{totalCount}
      </span>
      <div key={currentStep.step} style={{ display: 'flex', alignItems: 'center', gap: 6, animation: 'ts-phaseReveal 0.2s ease-out both' }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
          background: isActive ? (agentColor || 'var(--ds-accent)') : (agentColor ? `${agentColor}80` : 'var(--ds-green-50)'),
          animation: isActive ? 'ts-dotPulse 1.5s ease-in-out infinite' : undefined,
        }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: isActive ? 'var(--ds-text-secondary)' : 'var(--ds-text-tertiary)' }}>
          {title}
        </span>
        {!isActive && currentStep.status !== 'error' && (
          <span style={{ fontSize: 10, color: agentColor ? `${agentColor}80` : 'var(--ds-green-50)' }}>&#10003;</span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify build compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/reasoning/ReasoningDisplay.tsx frontend/src/reasoning/FullReasoningDisplay.tsx frontend/src/reasoning/CompactReasoningDisplay.tsx
git commit -m "feat(reasoning): add ReasoningDisplay with full and compact modes"
```

---

## Task 5: Wire ReasoningProvider into App

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Add ReasoningProvider wrapper**

In `App.jsx`, import `ReasoningProvider` and wrap the app's JSX tree (at the same level as `SessionContextProvider`):

```jsx
import { ReasoningProvider } from './reasoning/store';
```

Wrap the existing return JSX:

```jsx
<ReasoningProvider>
  <SessionContextProvider ...>
    {/* existing app content */}
  </SessionContextProvider>
</ReasoningProvider>
```

- [ ] **Step 2: Replace pipeline_step dispatch**

Find the `pipeline_step` handler in `App.jsx` (around lines 785-804). Replace the current scattered dispatch with a single store dispatch. Import `useReasoningDispatch`:

```jsx
const reasoningDispatch = useReasoningDispatch();
```

Replace the handler body with the routing logic from the spec (lines 302-323):

```javascript
if (payload.type === 'pipeline_step') {
  const agentPrefix = payload.data?.agent || payload.agent || '';
  const requestId = payload.requestId;

  if (payload.step === 'orchestrating' || payload.step === 'router') {
    reasoningDispatch({ type: 'STEP', streamId: `router-${requestId}`, step: payload.step, status: payload.status, data: payload.data });
    // Auto-detect agent metadata
    if (payload.data?.retrieval_mode) {
      const rm = payload.data.retrieval_mode;
      if (rm.startsWith('agent:') || rm.startsWith('subagent:')) {
        reasoningDispatch({ type: 'AGENT_META', streamId: `router-${requestId}`, agentName: rm.split(':')[1] });
      }
    }
  } else {
    const streamId = agentPrefix ? `${agentPrefix}-${requestId}` : requestId;
    reasoningDispatch({ type: 'STEP', streamId, step: payload.step, status: payload.status, data: payload.data });
  }

  if (payload.step === 'sources_ready' && payload.data?.citations) {
    const agentStreamId = agentPrefix ? `${agentPrefix}-${requestId}` : requestId;
    reasoningDispatch({ type: 'CITATIONS', streamId: agentStreamId, citations: payload.data.citations });
  }
}
```

Remove the `window.dispatchEvent(new CustomEvent('graph.pipelineStep', ...))` dispatch.

- [ ] **Step 3: Add PHASE dispatches on text events**

In the `text_chunk` handler, dispatch `generating` on first chunk:

```javascript
// On first text_chunk for a request:
reasoningDispatch({ type: 'PHASE', streamId: agentStreamId, phase: 'generating' });
```

In the `stream_end` / `msg_done` handler:

```javascript
reasoningDispatch({ type: 'PHASE', streamId: agentStreamId, phase: 'complete' });
```

- [ ] **Step 4: Verify Anki loads without errors**

Run: `cd frontend && npm run build`
Restart Anki, open a chat, send a message. Check browser console for errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(reasoning): wire ReasoningProvider and central dispatch in App"
```

---

## Task 6: Replace ReasoningStream in ChatMessage

**Files:**
- Modify: `frontend/src/components/ChatMessage.jsx`

- [ ] **Step 1: Replace import**

Replace `import ReasoningStream from '../reasoning/ReasoningStream';` with:

```jsx
import ReasoningDisplay from '../reasoning/ReasoningDisplay';
```

- [ ] **Step 2: Replace v2 live rendering (around lines 2930-2975)**

Find the two ReasoningStream instances for live streaming messages. Replace:

```jsx
{/* Orchestration */}
<ReasoningDisplay
  streamId={`router-${requestId}`}
  mode="full"
/>

{/* Agent reasoning (inside AgenticCell) */}
<ReasoningDisplay
  streamId={`${agentName}-${requestId}`}
  mode="full"
  hasOutput={Boolean(cell.text)}
  bridge={bridge}
  onPreviewCard={onPreviewCard}
/>
```

- [ ] **Step 3: Replace saved message rendering (around lines 1830-1870)**

For saved messages, use the `steps` prop:

```jsx
{/* Saved orchestration */}
{msg.orchestration_steps && (
  <ReasoningDisplay steps={msg.orchestration_steps} mode="full" />
)}

{/* Saved agent reasoning (inside saved AgenticCell) */}
{cell.pipeline_data && (
  <ReasoningDisplay
    steps={cell.pipeline_data}
    mode="full"
    bridge={bridge}
    onPreviewCard={onPreviewCard}
  />
)}
```

- [ ] **Step 4: Test in Anki**

Build and restart Anki. Send a chat message. Verify:
- Orchestration chips appear and collapse
- Agent reasoning steps appear with adaptive pacing
- Steps collapse when text arrives
- Saved messages show reasoning when expanded

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ChatMessage.jsx
git commit -m "refactor(reasoning): replace ReasoningStream with ReasoningDisplay in ChatMessage"
```

---

## Task 7: Replace ReasoningStream in SearchSidebar

**Files:**
- Modify: `frontend/src/components/SearchSidebar.jsx`
- Modify: `frontend/src/hooks/useSmartSearch.js`

- [ ] **Step 1: Remove pipeline state from useSmartSearch**

In `frontend/src/hooks/useSmartSearch.js`, remove:
- `pipelineSteps` state variable (line ~23)
- `pipelineGeneration` state variable (line ~24)
- `graph.pipelineStep` event listener (lines ~86-115)
- Any returned pipeline state from the hook

The store now handles all pipeline state. `SearchSidebar` will read from the store via `streamId`.

- [ ] **Step 2: Replace ReasoningStream in SearchSidebar**

In `frontend/src/components/SearchSidebar.jsx`, replace the two ReasoningStream instances (lines ~212-244):

```jsx
import ReasoningDisplay from '../reasoning/ReasoningDisplay';

{/* Orchestration */}
<ReasoningDisplay
  streamId={`router-${searchRequestId}`}
  mode="full"
/>

{/* Agent reasoning */}
<ReasoningDisplay
  streamId={searchRequestId}
  mode="full"
  hasOutput={Boolean(answer)}
  bridge={bridge}
  onPreviewCard={onPreviewCard}
/>
```

Remove old imports of ReasoningStream.

- [ ] **Step 3: Test Smart Search**

Build and restart Anki. Open Smart Search, run a query. Verify:
- Orchestration appears and collapses
- Agent steps show with adaptive pacing
- Answer text triggers collapse

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/SearchSidebar.jsx frontend/src/hooks/useSmartSearch.js
git commit -m "refactor(reasoning): replace ReasoningStream with ReasoningDisplay in SearchSidebar"
```

---

## Task 8: Remove Pipeline State from useChat & useAgenticMessage

**Files:**
- Modify: `frontend/src/hooks/useChat.js`
- Modify: `frontend/src/hooks/useAgenticMessage.js`

- [ ] **Step 1: Clean up useChat.js**

Remove from `frontend/src/hooks/useChat.js`:
- `pipelineSteps` state (line ~61)
- `pipelineGeneration` state (line ~62)
- `currentSteps` / `currentCitations` state and refs (lines ~63-69)
- `updatePipelineSteps()` wrapper function (lines ~71-77)
- Pipeline step handling in `handleAnkiReceive` (lines ~536-557)
- `pipelineGeneration` increment in `handleSend` (line ~288)
- Remove these from the hook's return value

**Critical:** The `currentStepsRef` is currently used during message finalization to save `pipeline_data` to the message. When removing it, add a store read to preserve this data. In the finalize/save flow, read from the store:

```javascript
// Where pipeline_data was previously read from currentStepsRef:
import { useReasoningStore } from '../reasoning/store';

// In the hook:
const { state: reasoningState } = useReasoningStore();

// During finalize (where msg.pipeline_data was set):
const agentStreamId = `${agentName}-${requestId}`;
const stream = reasoningState.streams[agentStreamId];
const routerStream = reasoningState.streams[`router-${requestId}`];
// Save to message:
msg.pipeline_data = stream?.steps || [];
msg.orchestration_steps = routerStream?.steps || [];
```

Keep everything else (messages, streaming, sections, etc.).

- [ ] **Step 2: Clean up useAgenticMessage.js**

Remove from `frontend/src/hooks/useAgenticMessage.js`:
- `handlePipelineStep` function (lines ~100-128)
- `pipelineSteps` initialization in cell creation (line ~87)
- Remove `handlePipelineStep` from the hook's return value

The cell data structure no longer includes `pipelineSteps`. For the `finalize()` function, ensure `pipeline_data` is saved from the store (or omitted — it's already saved via the message save flow).

- [ ] **Step 3: Update App.jsx references**

In `App.jsx`, remove any remaining references to `chatHook.pipelineSteps`, `chatHook.pipelineGeneration`, `agenticMsg.handlePipelineStep`.

- [ ] **Step 4: Run all frontend tests**

Run: `cd frontend && npm test`
Expected: ALL PASS (existing tests may need minor updates for removed props)

- [ ] **Step 5: Test in Anki**

Build and restart Anki. Full test cycle:
- Send a chat message — reasoning appears, collapses, text streams
- Open Smart Search — reasoning appears
- Open a saved session — saved reasoning displays correctly
- Check for console errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useChat.js frontend/src/hooks/useAgenticMessage.js frontend/src/App.jsx
git commit -m "refactor(reasoning): remove scattered pipeline state from useChat and useAgenticMessage"
```

---

## Task 9: Delete ReasoningStream & Final Cleanup

**Files:**
- Delete: `frontend/src/reasoning/ReasoningStream.tsx`
- Verify: No remaining imports of ReasoningStream

- [ ] **Step 1: Search for remaining ReasoningStream imports**

Run: `grep -r "ReasoningStream" frontend/src/ --include="*.tsx" --include="*.jsx" --include="*.ts"`

Remove or replace any remaining imports.

- [ ] **Step 2: Delete ReasoningStream.tsx**

```bash
rm frontend/src/reasoning/ReasoningStream.tsx
```

- [ ] **Step 3: Run all tests**

Run: `cd frontend && npm test`
Expected: ALL PASS

- [ ] **Step 4: Full build verification**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Final Anki test**

Restart Anki. Test all reasoning display paths:
- Chat message with reasoning steps
- Smart Search with reasoning
- Saved sessions with stored reasoning
- Multiple rapid messages (verify no step leakage between streams)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(reasoning): delete ReasoningStream, migration complete"
```

---

## Task Summary

| # | Task | Files | Purpose |
|---|------|-------|---------|
| 1 | Store Types & Reducer | `store/types.ts`, `store/reducer.ts`, tests | Core state management |
| 2 | ReasoningProvider | `store/ReasoningProvider.tsx` | Context + auto-cleanup |
| 3 | useReasoningStream Hook | `useReasoningStream.ts`, tests | Adaptive pacing + collapse |
| 4 | ReasoningDisplay Components | `ReasoningDisplay.tsx`, `Full*`, `Compact*` | Drop-in UI components |
| 5 | Wire Provider into App | `App.jsx` | Central event dispatch |
| 6 | ChatMessage Migration | `ChatMessage.jsx` | Replace ReasoningStream usage |
| 7 | SearchSidebar Migration | `SearchSidebar.jsx`, `useSmartSearch.js` | Replace ReasoningStream usage |
| 8 | Remove Old State | `useChat.js`, `useAgenticMessage.js` | Delete scattered pipeline state |
| 9 | Delete & Cleanup | Remove `ReasoningStream.tsx` | Final cleanup |
