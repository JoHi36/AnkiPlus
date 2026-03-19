import { useState, useCallback, useRef } from 'react';

/**
 * Hook für Review Trail Navigation
 * Verwaltet die geordnete Liste gesehener Karten während einer Review-Session.
 * Ermöglicht Pfeil-Navigation zwischen Karten (Chat + Reviewer synchron).
 *
 * State:
 * - reviewTrail: cardId[] — Reihenfolge der gesehenen Karten
 * - trailIndex: number — Aktuelle Position im Trail
 * - isViewingHistory: boolean — true wenn nicht am Ende (historische Karte)
 *
 * Nicht persistent — wird bei Reviewer-Exit zurückgesetzt.
 */
export function useReviewTrail() {
  const [reviewTrail, setReviewTrail] = useState([]);
  const [trailIndex, setTrailIndex] = useState(-1);

  // Ref for latest trail (for use in callbacks)
  const trailRef = useRef([]);
  const indexRef = useRef(-1);

  const updateTrail = useCallback((trail) => {
    trailRef.current = trail;
    setReviewTrail(trail);
  }, []);

  const updateIndex = useCallback((idx) => {
    indexRef.current = idx;
    setTrailIndex(idx);
  }, []);

  /**
   * Karte dem Trail hinzufügen (wenn neue Karte gezeigt wird)
   * Wird bei jedem cardContext-Event aufgerufen.
   * Wenn wir in der Historie sind und eine neue Karte kommt, wird die Position
   * nicht geändert (die neue Karte wird nicht hinzugefügt, da es sich um
   * eine Navigation handelt, nicht um eine neue Karte vom Scheduler).
   */
  const addCard = useCallback((cardId) => {
    if (!cardId) return;
    const numericId = Number(cardId);
    const trail = trailRef.current;
    const idx = indexRef.current;

    // If current index points to this card, we navigated TO it — just update index, don't add
    if (idx >= 0 && idx < trail.length && trail[idx] === numericId) {
      return;
    }

    // If navigating in the middle of the trail, don't append
    if (idx >= 0 && idx < trail.length - 1) {
      return;
    }

    // Don't add if already the last card
    if (trail.length > 0 && trail[trail.length - 1] === numericId) {
      return;
    }

    const newTrail = [...trail, numericId];
    updateTrail(newTrail);
    updateIndex(newTrail.length - 1);
  }, [updateTrail, updateIndex]);

  /**
   * Navigation nach links (vorherige Karte)
   * Gibt die cardId zurück, zu der navigiert werden soll, oder null.
   */
  const navigateLeft = useCallback(() => {
    const trail = trailRef.current;
    const idx = indexRef.current;

    if (trail.length === 0 || idx <= 0) {
      return null;
    }

    const newIndex = idx - 1;
    updateIndex(newIndex);
    return trail[newIndex];
  }, [updateIndex]);

  /**
   * Navigation nach rechts (nächste Karte)
   * Gibt die cardId zurück, zu der navigiert werden soll, oder null.
   */
  const navigateRight = useCallback(() => {
    const trail = trailRef.current;
    const idx = indexRef.current;

    if (trail.length === 0 || idx >= trail.length - 1) {
      return null; // Schon am Ende
    }

    const newIndex = idx + 1;
    updateIndex(newIndex);
    return trail[newIndex];
  }, [updateIndex]);

  /**
   * Trail zurücksetzen (bei Deck-Exit)
   */
  const resetTrail = useCallback(() => {
    updateTrail([]);
    updateIndex(-1);
  }, [updateTrail, updateIndex]);

  /**
   * Navigation zu bestimmter Position im Trail
   */
  const navigateTo = useCallback((index) => {
    const trail = trailRef.current;
    if (index < 0 || index >= trail.length) return null;
    updateIndex(index);
    return trail[index];
  }, [updateIndex]);

  const isViewingHistory = trailIndex >= 0 && trailIndex < reviewTrail.length - 1;
  const canGoLeft = trailIndex > 0;
  const canGoRight = trailIndex < reviewTrail.length - 1;
  const currentPosition = trailIndex + 1; // 1-based
  const totalCards = reviewTrail.length;

  return {
    reviewTrail,
    trailIndex,
    isViewingHistory,
    canGoLeft,
    canGoRight,
    currentPosition,
    totalCards,

    addCard,
    navigateLeft,
    navigateRight,
    navigateTo,
    resetTrail,
  };
}
