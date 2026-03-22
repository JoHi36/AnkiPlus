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
}

let registry: Map<string, SubagentConfig> = new Map();

export function getRegistry(): Map<string, SubagentConfig> {
  return registry;
}

export function setRegistry(agents: SubagentConfig[]): void {
  registry = new Map(agents.map(a => [a.name, a]));
}

/**
 * Build regex for @Name detection from enabled agents.
 * Returns null if no agents are enabled.
 */
export function getDirectCallPattern(): RegExp | null {
  const names = [...registry.values()]
    .filter(a => a.enabled)
    .map(a => a.name);
  if (names.length === 0) return null;
  return new RegExp('^@(' + names.join('|') + ')\\b', 'i');
}

/**
 * Look up agent by name (case-insensitive).
 */
export function findAgent(name: string): SubagentConfig | undefined {
  return registry.get(name.toLowerCase());
}
