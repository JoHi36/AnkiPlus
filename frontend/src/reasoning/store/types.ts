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
