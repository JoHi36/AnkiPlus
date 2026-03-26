/**
 * Pending performance data store.
 *
 * Bridges the gap between the card rating event (App.jsx) and section creation
 * (useCardContext.js). When a card is rated before its section exists, the
 * performance data is stored here keyed by cardId and consumed when the section
 * is eventually created.
 *
 * Replaces window._pendingPerformanceData.
 */

const store = new Map<string, Record<string, unknown>>();

/** Store performance data for a card until its section is created. */
export function setPendingPerformance(cardId: string, data: Record<string, unknown>): void {
  store.set(cardId, data);
}

/**
 * Consume and return pending performance data for a card.
 * Returns undefined if no data is pending. Entry is deleted after retrieval.
 */
export function consumePendingPerformance(cardId: string): Record<string, unknown> | undefined {
  const data = store.get(cardId);
  if (data !== undefined) {
    store.delete(cardId);
  }
  return data;
}

/** Check whether pending data exists for a card (without consuming it). */
export function hasPendingPerformance(cardId: string): boolean {
  return store.has(cardId);
}
