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
