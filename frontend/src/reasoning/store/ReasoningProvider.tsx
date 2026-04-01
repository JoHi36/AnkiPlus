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
