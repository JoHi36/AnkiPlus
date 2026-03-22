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
}

/**
 * Build regex for @Name detection from enabled NON-DEFAULT agents.
 * Returns null if no matchable agents are enabled.
 * Default agent (Tutor) is excluded — users don't @mention the default.
 */
export function getDirectCallPattern() {
  const names = [...registry.values()]
    .filter(a => a.enabled && !a.isDefault)
    .map(a => a.name);
  if (names.length === 0) return null;
  // Match @Name or @Label (e.g., @plusi, @Plusi, @Research Agent)
  const labels = [...registry.values()]
    .filter(a => a.enabled && !a.isDefault)
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
