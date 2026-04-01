/**
 * Action Registry — central dispatch for all app actions.
 * Used by: UI buttons, keyboard shortcuts, agent tools, Python bridge.
 *
 * Naming: domain.verb (e.g., 'deck.study', 'chat.send', 'view.switch')
 */

const ACTION_REGISTRY = new Map();

export function registerAction(name, handler, meta = {}) {
  ACTION_REGISTRY.set(name, { handler, ...meta });
}

export function executeAction(name, data) {
  const action = ACTION_REGISTRY.get(name);
  if (action) {
    action.handler(data);
  } else {
  }
}

export function getAvailableActions() {
  return [...ACTION_REGISTRY.entries()].map(([name, { label, description }]) => ({
    name, label, description,
  }));
}

export function bridgeAction(name, data) {
  window.ankiBridge?.addMessage(name, typeof data === 'object' ? JSON.stringify(data) : (data || ''));
}
