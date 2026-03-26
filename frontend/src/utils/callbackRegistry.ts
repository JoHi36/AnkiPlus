/**
 * Centralized callback registry — replaces scattered window._ globals.
 * Used by useAnki.js for bridge response callbacks.
 */

type Callback = (...args: any[]) => void;

const channels = new Map<string, Map<string, Callback>>();

/** Register a callback on a channel. Returns unregister function. */
export function registerCallback(channel: string, id: string, fn: Callback): () => void {
  if (!channels.has(channel)) channels.set(channel, new Map());
  channels.get(channel)!.set(id, fn);
  return () => channels.get(channel)?.delete(id);
}

/** Invoke all callbacks on a channel with given args. */
export function invokeCallbacks(channel: string, ...args: any[]): void {
  channels.get(channel)?.forEach(fn => {
    try { fn(...args); } catch (_) { /* silently handled */ }
  });
}

/** Invoke a specific callback by channel + id, then remove it (one-shot). */
export function invokeAndRemove(channel: string, id: string, ...args: any[]): boolean {
  const cb = channels.get(channel)?.get(id);
  if (cb) {
    channels.get(channel)!.delete(id);
    try { cb(...args); } catch (_) { /* silently handled */ }
    return true;
  }
  return false;
}

/** Get current count for a channel (useful for debugging). */
export function getCallbackCount(channel: string): number {
  return channels.get(channel)?.size ?? 0;
}

/** Clear all callbacks (useful for testing). */
export function clearAll(): void {
  channels.clear();
}
