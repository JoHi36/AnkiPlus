import { ReactNode } from 'react';

/** A single pipeline step from the backend */
export interface ReasoningStep {
  step: string;
  status: 'active' | 'done' | 'error';
  data: Record<string, any>;
  timestamp: number;
}

/** Display step with visibility tracking (used by accumulating queue) */
export interface DisplayStep extends ReasoningStep {
  visibleSince: number;
}

/** How a step type renders itself */
export interface StepRendererDef {
  id: string;
  label: string;
  activeTitle: string | ((data: Record<string, any>) => string);
  doneLabel: (data: Record<string, any>, status: string) => string;
  renderContent?: (props: {
    data: Record<string, any>;
    isDone: boolean;
    animate: boolean;
    agentColor?: string;
  }) => ReactNode;
  hidden?: boolean;
}

export const MIN_STEP_INTERVAL = 800;

export type CollapseRule = 'auto' | 'never' | 'immediate';
