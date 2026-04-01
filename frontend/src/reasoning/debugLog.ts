/**
 * Debug logger that survives esbuild's console.* stripping.
 * Enable in browser: window.__REASONING_DEBUG__ = true
 */
const _log = Function.prototype.bind.call(
  // eslint-disable-next-line no-console
  typeof globalThis !== 'undefined' && globalThis.console ? globalThis.console.log : () => {},
  typeof globalThis !== 'undefined' && globalThis.console ? globalThis.console : {}
);

export function reasoningLog(...args: unknown[]): void {
  if (typeof window !== 'undefined' && (window as any).__REASONING_DEBUG__) {
    _log('[REASONING]', new Date().toISOString().slice(11, 23), ...args);
  }
}
