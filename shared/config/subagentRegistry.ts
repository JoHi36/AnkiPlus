/**
 * Frontend subagent registry — mirror of Python ai/subagents.py.
 * Populated on app init via bridge.getSubagentRegistry().
 */

export interface Slot {
  ref: string;
  mode: 'locked' | 'on' | 'off';
  label?: string;
  description?: string;
}

export interface WorkflowDefinition {
  name: string;
  label: string;
  description: string;
  triggers: Slot[];
  tools: Slot[];
  outputs: Slot[];
  mode: 'locked' | 'on' | 'off';
  status: 'active' | 'soon';
  contextPrompt?: string;
}

export interface SubagentConfig {
  name: string;
  label: string;
  color: string;
  enabled: boolean;
  pipelineLabel: string;
  iconType?: 'svg' | 'emote';
  iconSvg?: string;
  loadingHintTemplate?: string;
  isDefault?: boolean;
  description?: string;
  tools?: string[];
  channel?: string;  // 'stapel', 'session', 'plusi', 'reviewer-inline'
  // Agent Studio UI fields
  widgetType?: string;
  submenuLabel?: string;
  submenuComponent?: string;
  toolsConfigurable?: boolean;
  reasoningSteps?: Array<{ id: string; label: string; activeTitle?: string }>;
  workflows?: WorkflowDefinition[];
}

export interface ToolConfig {
  name: string;
  label: string;
  description: string;
  category: string;
  configurable: boolean;
  configKey: string;
  enabled: boolean;
}

let registry: Map<string, SubagentConfig> = new Map();
let toolRegistry: Map<string, ToolConfig> = new Map();

export function getRegistry(): Map<string, SubagentConfig> {
  return registry;
}

export function setRegistry(agents: SubagentConfig[]): void {
  registry = new Map(agents.map(a => [a.name, a]));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('agentRegistryUpdated'));
  }
}

export function getToolRegistry(): Map<string, ToolConfig> {
  return toolRegistry;
}

export function setToolRegistry(tools: ToolConfig[]): void {
  toolRegistry = new Map(tools.map(t => [t.name, t]));
}


/**
 * Look up agent by name (case-insensitive).
 */
export function findAgent(name: string): SubagentConfig | undefined {
  return registry.get(name.toLowerCase());
}

/**
 * Return the default agent definition.
 */
export function getDefaultAgent(): SubagentConfig | undefined {
  for (const agent of registry.values()) {
    if ((agent as any).isDefault) return agent;
  }
  return undefined;
}

