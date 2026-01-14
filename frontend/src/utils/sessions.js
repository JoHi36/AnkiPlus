/**
 * Session-Management Utilities
 * Verwaltet Chat-Sessions
 * 
 * WICHTIG: Sessions werden über die Python-Bridge gespeichert (nicht localStorage)
 * da der Webview-localStorage beim Schließen des Panels verloren geht.
 * 
 * Die Funktionen hier sind Hilfsfunktionen für Session-Operationen im Speicher.
 * Das tatsächliche Laden/Speichern erfolgt über die Bridge in useSessions.js
 */

// Maximale Anzahl an Nachrichten pro Session
const MAX_MESSAGES_PER_SESSION = 100;

// Maximale Anzahl an Sessions
const MAX_SESSIONS = 50;

/**
 * Lädt Sessions (nur für Legacy-Kompatibilität, nutze bridge.loadSessions)
 * @returns {Array} Leeres Array - Sessions kommen jetzt via Bridge
 * @deprecated Nutze stattdessen bridge.loadSessions() in useSessions
 */
export function loadSessions() {
  console.warn('loadSessions: Diese Funktion ist deprecated. Sessions werden via Bridge geladen.');
  return [];
}

/**
 * Speichert Sessions via Bridge (muss von außen aufgerufen werden)
 * @param {Array} sessions - Sessions zum Speichern
 * @param {Function} bridgeSave - Optional: Bridge.saveSessions Funktion
 * @returns {boolean} Erfolg
 */
export function saveSessions(sessions, bridgeSave = null) {
  // #region agent log
  const timestamp = Date.now();
  fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sessions.js:34',message:'saveSessions called',data:{sessionsCount:sessions?.length||0,sessionsIsArray:Array.isArray(sessions),hasBridgeSave:!!bridgeSave,hasWindowBridgeSave:!!window._bridgeSaveSessions},timestamp:timestamp,sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  // Validierung
  if (!Array.isArray(sessions)) {
    console.error('saveSessions: Ungültige Daten (kein Array)');
    // #region agent log
    const timestamp2 = Date.now();
    fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sessions.js:37',message:'saveSessions validation failed',data:{sessionsType:typeof sessions},timestamp:timestamp2,sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    return false;
  }
  
  // Limitiere und bereinige Sessions
  const limitedSessions = sessions.slice(-MAX_SESSIONS);
  const cleanedSessions = limitedSessions.map(session => ({
    ...session,
    messages: (session.messages || []).slice(-MAX_MESSAGES_PER_SESSION)
  }));
  
  // Speichere via Bridge wenn verfügbar
  if (bridgeSave) {
    // #region agent log
    const timestamp3 = Date.now();
    fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sessions.js:50',message:'saveSessions calling bridgeSave',data:{cleanedSessionsCount:cleanedSessions.length},timestamp:timestamp3,sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    bridgeSave(cleanedSessions);
    return true;
  }
  
  // Fallback: Speichere via global bridgeSave wenn gesetzt
  if (window._bridgeSaveSessions) {
    // #region agent log
    const timestamp4 = Date.now();
    fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sessions.js:56',message:'saveSessions calling window._bridgeSaveSessions',data:{cleanedSessionsCount:cleanedSessions.length},timestamp:timestamp4,sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    window._bridgeSaveSessions(cleanedSessions);
    return true;
  }
  
  console.warn('saveSessions: Keine Bridge verfügbar, Sessions nicht persistent gespeichert');
  // #region agent log
  const timestamp5 = Date.now();
  fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'sessions.js:60',message:'saveSessions FAILED - no bridge available',data:{},timestamp:timestamp5,sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  return false;
}

/**
 * Erstellt eine neue Session
 * @param {Array} sessions - Bestehende Sessions
 * @param {string|number} deckId - Deck-ID (optional)
 * @param {string} deckName - Deck-Name (optional)
 * @param {Array} initialSeenCardIds - Initiale gesehene Karten (optional)
 * @returns {Object} Die neue Session
 */
export function createSession(sessions, deckId = null, deckName = null, initialSeenCardIds = []) {
  // Erstelle Session-Name basierend auf Deck oder Nummer
  const name = deckName || `Session ${sessions.length + 1}`;
  
  // Generiere ID (mit Fallback für ältere Browser)
  let id;
  try {
    id = crypto.randomUUID();
  } catch (e) {
    id = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  const session = {
    id,
    name,
    messages: [],
    sections: [],  // Initialisiere leeres Sections-Array
    seenCardIds: initialSeenCardIds || [], // Initialisiere Tracking mit temporären Daten
    createdAt: new Date().toISOString(),
    deckId: deckId,
    deckName: deckName,
  };
  
  const updated = [...sessions, session];
  const saved = saveSessions(updated);
  
  if (!saved) {
    console.warn('Session erstellt aber nicht persistent gespeichert');
  }
  
  return session;
}

/**
 * Findet eine Session nach Deck-ID
 * @param {Array} sessions - Sessions
 * @param {string|number} deckId - Deck-ID
 * @returns {Object|undefined} Die Session oder undefined
 */
export function findSessionByDeck(sessions, deckId) {
  if (!Array.isArray(sessions) || !deckId) return undefined;
  return sessions.find(s => s.deckId === deckId);
}

/**
 * Findet alle Sessions für ein Deck
 * @param {Array} sessions - Sessions
 * @param {string|number} deckId - Deck-ID
 * @returns {Array} Sessions für das Deck
 */
export function getSessionsForDeck(sessions, deckId) {
  if (!Array.isArray(sessions) || !deckId) return [];
  return sessions.filter(s => s.deckId === deckId);
}

/**
 * Aktualisiert die Nachrichten einer Session
 * @param {Array} sessions - Bestehende Sessions
 * @param {string} sessionId - Session-ID
 * @param {Array} messages - Neue Nachrichten
 * @param {Array} sections - Optionale Sections (Karten-Abschnitte)
 * @returns {Array} Aktualisierte Sessions
 */
export function updateSession(sessions, sessionId, messages, sections = null) {
  if (!Array.isArray(sessions) || !sessionId) {
    console.warn('updateSession: Ungültige Parameter');
    return sessions;
  }
  
  // Limitiere Nachrichten
  const limitedMessages = (messages || []).slice(-MAX_MESSAGES_PER_SESSION);
  
  const updated = sessions.map(s => {
    if (s.id !== sessionId) return s;
    
    const updatedSession = { 
      ...s, 
      messages: limitedMessages, 
      updatedAt: new Date().toISOString() 
    };
    
    // Sections nur aktualisieren wenn explizit übergeben
    if (sections !== null) {
      updatedSession.sections = sections;
    }
    
    return updatedSession;
  });
  
  saveSessions(updated);
  return updated;
}

/**
 * Aktualisiert nur die Sections einer Session (ohne Messages zu ändern)
 * @param {Array} sessions - Bestehende Sessions
 * @param {string} sessionId - Session-ID
 * @param {Array} sections - Neue Sections
 * @returns {Array} Aktualisierte Sessions
 */
export function updateSessionSections(sessions, sessionId, sections) {
  if (!Array.isArray(sessions) || !sessionId) {
    console.warn('updateSessionSections: Ungültige Parameter');
    return sessions;
  }
  
  const updated = sessions.map(s =>
    s.id === sessionId 
      ? { ...s, sections: sections || [], updatedAt: new Date().toISOString() } 
      : s
  );
  
  saveSessions(updated);
  return updated;
}

/**
 * Löscht eine Session
 * @param {Array} sessions - Bestehende Sessions
 * @param {string} sessionId - Session-ID
 * @param {Function} bridgeSave - Optional: Bridge.saveSessions Funktion
 * @returns {Array} Aktualisierte Sessions
 */
export function deleteSession(sessions, sessionId, bridgeSave = null) {
  if (!Array.isArray(sessions) || !sessionId) {
    console.warn('deleteSession: Ungültige Parameter');
    return sessions;
  }
  
  const updated = sessions.filter(s => s.id !== sessionId);
  saveSessions(updated, bridgeSave);
  return updated;
}

/**
 * Löscht alle Sessions
 * @param {Function} bridgeSave - Optional: Bridge.saveSessions Funktion
 * @returns {boolean} Erfolg
 */
export function clearAllSessions(bridgeSave = null) {
  return saveSessions([], bridgeSave);
}
