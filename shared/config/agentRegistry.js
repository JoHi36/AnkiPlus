/**
 * Frontend agent registry — mirror of Python ai/agents.py.
 * Populated on app init via bridge.getAgentRegistry().
 * Replaces subagentRegistry.js as the primary registry.
 */

let registry = new Map();

export function getRegistry() {
  return registry;
}

export function setRegistry(agents) {
  registry = new Map(agents.map(a => [a.name, a]));
  // Notify listeners (e.g. AgentStudio) that the registry has been updated
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('agentRegistryUpdated'));
  }
}

/**
 * Build regex for @Name detection from ALL enabled agents (including Tutor).
 * Returns null if no agents are enabled.
 */
export function getDirectCallPattern() {
  const names = [...registry.values()]
    .filter(a => a.enabled)
    .map(a => a.name);
  if (names.length === 0) return null;
  // Match @Name or @Label (e.g., @tutor, @Plusi, @Research Agent)
  const labels = [...registry.values()]
    .filter(a => a.enabled)
    .map(a => a.label);
  const allPatterns = [...new Set([...names, ...labels])];
  return new RegExp('^@(' + allPatterns.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'i');
}

/**
 * Look up agent by name (case-insensitive).
 */
export function findAgent(name) {
  return registry.get(name.toLowerCase());
}

/**
 * Return the default agent definition.
 */
export function getDefaultAgent() {
  for (const agent of registry.values()) {
    if (agent.isDefault) return agent;
  }
  return null;
}

/**
 * Return all enabled non-default agents (the ones that show badges).
 */
export function getNonDefaultAgents() {
  return [...registry.values()].filter(a => a.enabled && !a.isDefault);
}
