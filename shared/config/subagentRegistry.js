/**
 * Re-exports from subagentRegistry.ts for JS consumers.
 * The .ts file is the canonical source; Vite resolves it directly.
 */
export {
  getRegistry,
  setRegistry,
  getDirectCallPattern,
  findAgent,
  getDefaultAgent,
  getNonDefaultAgents,
  getToolRegistry,
  setToolRegistry,
} from './subagentRegistry.ts';
