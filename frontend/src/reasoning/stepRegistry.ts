import { StepRendererDef } from './types';

const registry = new Map<string, StepRendererDef>();

export function registerStepRenderer(def: StepRendererDef): void {
  registry.set(def.id, def);
}

export function getStepRenderer(stepId: string): StepRendererDef | undefined {
  return registry.get(stepId);
}

export function getAllRenderers(): Map<string, StepRendererDef> {
  return registry;
}

export function getFallbackRenderer(stepId: string): StepRendererDef {
  return {
    id: stepId,
    label: stepId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    activeTitle: 'Verarbeite...',
    doneLabel: () => stepId.replace(/_/g, ' '),
    renderContent: undefined,
  };
}
