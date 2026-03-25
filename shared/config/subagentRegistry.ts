/**
 * Frontend subagent registry — mirror of Python ai/subagents.py.
 * Populated on app init via bridge.getSubagentRegistry().
 */

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
  canHandoffTo?: string[];
  // Agent Studio UI fields
  widgetType?: string;
  submenuLabel?: string;
  submenuComponent?: string;
  toolsConfigurable?: boolean;
  reasoningSteps?: Array<{ id: string; label: string; activeTitle?: string }>;
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
 * Build regex for @Name or @Label detection from enabled agents.
 * Returns null if no agents are enabled.
 */
export function getDirectCallPattern(): RegExp | null {
  const agents = [...registry.values()].filter(a => a.enabled);
  if (agents.length === 0) return null;
  const names = agents.map(a => a.name);
  const labels = agents.map(a => a.label);
  const allPatterns = [...new Set([...names, ...labels])];
  return new RegExp('^@(' + allPatterns.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'i');
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

/**
 * Return all enabled non-default agents (the ones that show badges).
 */
export function getNonDefaultAgents(): SubagentConfig[] {
  return [...registry.values()].filter(a => a.enabled && !(a as any).isDefault);
}
