/**
 * Utility-Funktionen für Deck-Namen
 */

/**
 * Extrahiert den Haupttitel (letzten Teil) aus einem Deck-Namen
 * @param {string} deckName - Vollständiger Deck-Name (z.B. "Ankiphil Vorklinik::Biochemie::Blut")
 * @returns {string} - Haupttitel (z.B. "Blut")
 */
export function getDeckMainTitle(deckName) {
  if (!deckName || typeof deckName !== 'string') {
    return deckName || 'Unbekanntes Deck';
  }
  
  // Teile nach "::" auf und nimm den letzten Teil
  const parts = deckName.split('::');
  return parts[parts.length - 1] || deckName;
}

/**
 * Extrahiert den Pfad (alles außer dem letzten Teil) aus einem Deck-Namen
 * @param {string} deckName - Vollständiger Deck-Name
 * @returns {string|null} - Pfad oder null wenn kein Pfad vorhanden
 */
export function getDeckPath(deckName) {
  if (!deckName || typeof deckName !== 'string') {
    return null;
  }
  
  const parts = deckName.split('::');
  if (parts.length <= 1) {
    return null; // Kein Pfad, nur Haupttitel
  }
  
  return parts.slice(0, -1).join(' > ');
}

/**
 * Formatiert einen Deck-Namen mit Arrow-Pfeilen (→) statt :: Trennern
 * @param {string} deckName - Vollständiger Deck-Name (z.B. "Ankiphil Vorklinik::Biochemie::Blut")
 * @returns {string|null} - Formatierter Deck-Name mit Arrows oder null wenn ungültig
 */
export function formatDeckPathWithArrows(deckName) {
  if (!deckName || typeof deckName !== 'string') {
    return null;
  }
  // Ersetze :: durch → (Arrow)
  return deckName.replace(/::/g, ' → ');
}

