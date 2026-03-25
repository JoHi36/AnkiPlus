/**
 * Event Bus — central event dispatcher.
 * All ankiReceive events flow through here before being processed.
 * Agents can subscribe to events via on()/off().
 *
 * Naming: domain.past (e.g., 'app.stateChanged', 'chat.responseCompleted')
 */

const listeners = new Map();

export function on(event, callback) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(callback);
}

export function off(event, callback) {
  listeners.get(event)?.delete(callback);
}

export function emit(event, data) {
  listeners.get(event)?.forEach(cb => {
    try { cb(data); } catch (e) { console.error('[EventBus]', event, e); }
  });
  listeners.get('*')?.forEach(cb => {
    try { cb({ event, data }); } catch (e) { console.error('[EventBus] wildcard', e); }
  });
}

export function getRegisteredEvents() {
  return [...listeners.keys()].filter(k => k !== '*');
}
