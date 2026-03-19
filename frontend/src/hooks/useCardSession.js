import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Hook für per-Card Session Management
 * Ersetzt das deck-basierte Session-System.
 *
 * Jede Karte hat ihre eigene persistente Session mit Review-Historie.
 * Sessions werden in SQLite gespeichert (via Python Bridge).
 *
 * State:
 * - currentCardId: Aktuell angezeigte Karte
 * - currentSession: { session, sections[], messages[] } oder null
 * - sessionCache: Map<cardId, SessionData> für In-Memory Caching
 *
 * Methoden:
 * - loadCardSession(cardId): Cache-Check → Bridge-Call
 * - saveMessage(cardId, msg): Einzelne Nachricht sofort speichern
 * - saveSection(cardId, section): Section erstellen/updaten
 * - clearCurrentSession(): Session-State zurücksetzen
 */
export function useCardSession(bridge) {
  const [currentCardId, setCurrentCardId] = useState(null);
  const [currentSession, setCurrentSession] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // In-Memory Cache für geladene Sessions
  const sessionCacheRef = useRef(new Map());
  const bridgeRef = useRef(bridge);
  const saveTimeoutRef = useRef(null);

  useEffect(() => {
    bridgeRef.current = bridge;
  }, [bridge]);

  /**
   * Lade eine Card Session (aus Cache oder via Bridge)
   */
  const loadCardSession = useCallback((cardId) => {
    if (!cardId) return;

    const numericCardId = Number(cardId);
    console.log('🗂️ useCardSession: Lade Session für Karte:', numericCardId);

    setCurrentCardId(numericCardId);

    // Cache-Check — dispatch synthetic cardSessionLoaded so App restores messages
    const cached = sessionCacheRef.current.get(numericCardId);
    if (cached) {
      console.log('🗂️ useCardSession: Cache-Hit für Karte:', numericCardId);
      setCurrentSession(cached);
      // Dispatch event so ankiReceive handler in App.jsx restores chat messages
      setTimeout(() => {
        const payload = { type: 'cardSessionLoaded', cardId: numericCardId, data: cached };
        if (typeof window.ankiReceive === 'function') {
          window.ankiReceive(payload);
        }
      }, 0);
      return;
    }

    // Via Bridge laden
    setIsLoading(true);
    if (window.ankiBridge) {
      window.ankiBridge.addMessage('loadCardSession', String(numericCardId));
    }
  }, []);

  /**
   * Handler für cardSessionLoaded Event von Python
   */
  const handleCardSessionLoaded = useCallback((data) => {
    const cardId = data?.cardId || data?.card_id;
    if (!cardId) {
      console.warn('🗂️ useCardSession: cardSessionLoaded ohne cardId');
      setIsLoading(false);
      return;
    }

    const numericCardId = Number(cardId);
    console.log('🗂️ useCardSession: Session geladen für Karte:', numericCardId,
      'Messages:', data?.messages?.length || 0,
      'Sections:', data?.sections?.length || 0);

    const sessionData = {
      session: data.session || null,
      sections: (data.sections || []).map(s => ({
        ...s,
        // Normalize field names (snake_case → camelCase)
        cardId: s.card_id || s.cardId || numericCardId,
        createdAt: s.created_at || s.createdAt,
        performanceType: s.performance_type || s.performanceType,
        performanceData: s.performance_data || s.performanceData,
      })),
      messages: (data.messages || []).map(m => ({
        ...m,
        // Normalize field names
        sectionId: m.section_id || m.sectionId,
        from: m.sender || m.from || 'user',
        createdAt: m.created_at || m.createdAt,
        timestamp: m.created_at || m.createdAt || m.timestamp,
      })),
    };

    // Cache aktualisieren
    sessionCacheRef.current.set(numericCardId, sessionData);

    // Nur setzen wenn es die aktuell angezeigte Karte ist
    if (numericCardId === currentCardId) {
      setCurrentSession(sessionData);
    }

    setIsLoading(false);

    // Notify useChat that the card session is ready
    window.dispatchEvent(new CustomEvent('cardSessionReady', {
      detail: { session: sessionData, cardId: numericCardId }
    }));
  }, [currentCardId]);

  /**
   * Einzelne Nachricht speichern (Echtzeit-Persistence)
   */
  const saveMessage = useCallback((cardId, message) => {
    if (!cardId || !message) return;

    const numericCardId = Number(cardId);

    // Lokalen Cache aktualisieren
    const cached = sessionCacheRef.current.get(numericCardId);
    if (cached) {
      const updatedMessages = [...(cached.messages || []), message];
      const updatedSession = { ...cached, messages: updatedMessages };
      sessionCacheRef.current.set(numericCardId, updatedSession);

      if (numericCardId === currentCardId) {
        setCurrentSession(updatedSession);
      }
    }

    // Via Bridge speichern
    if (window.ankiBridge) {
      const payload = {
        cardId: numericCardId,
        message: {
          id: message.id,
          text: message.text,
          sender: message.from || message.sender || 'user',
          section_id: message.sectionId || message.section_id,
          created_at: message.createdAt || message.timestamp || new Date().toISOString(),
          steps: message.steps,
          citations: message.citations,
        }
      };
      window.ankiBridge.addMessage('saveCardMessage', JSON.stringify(payload));
    }
  }, [currentCardId]);

  /**
   * Section erstellen oder aktualisieren
   */
  const saveSection = useCallback((cardId, section) => {
    if (!cardId || !section) return;

    const numericCardId = Number(cardId);

    // Lokalen Cache aktualisieren
    const cached = sessionCacheRef.current.get(numericCardId);
    if (cached) {
      const existingIdx = (cached.sections || []).findIndex(s => s.id === section.id);
      let updatedSections;
      if (existingIdx >= 0) {
        updatedSections = cached.sections.map(s => s.id === section.id ? { ...s, ...section } : s);
      } else {
        updatedSections = [...(cached.sections || []), section];
      }
      const updatedSession = { ...cached, sections: updatedSections };
      sessionCacheRef.current.set(numericCardId, updatedSession);

      if (numericCardId === currentCardId) {
        setCurrentSession(updatedSession);
      }
    }

    // Via Bridge speichern
    if (window.ankiBridge) {
      const payload = {
        cardId: numericCardId,
        section: {
          id: section.id,
          title: section.title,
          created_at: section.createdAt || new Date().toISOString(),
          performance_type: section.performanceType || section.performance_type,
          performance_data: section.performanceData || section.performance_data,
        }
      };
      window.ankiBridge.addMessage('saveCardSection', JSON.stringify(payload));
    }
  }, [currentCardId]);

  /**
   * Volle Session speichern (für Batch-Updates)
   */
  const saveFullSession = useCallback((cardId, sessionData) => {
    if (!cardId) return;

    const numericCardId = Number(cardId);

    // Cache aktualisieren
    sessionCacheRef.current.set(numericCardId, sessionData);
    if (numericCardId === currentCardId) {
      setCurrentSession(sessionData);
    }

    // Via Bridge speichern
    if (window.ankiBridge) {
      const payload = {
        cardId: numericCardId,
        session: sessionData.session || {},
        sections: (sessionData.sections || []).map(s => ({
          id: s.id,
          title: s.title,
          created_at: s.createdAt || s.created_at,
          performance_type: s.performanceType || s.performance_type,
          performance_data: s.performanceData || s.performance_data,
        })),
        messages: (sessionData.messages || []).map(m => ({
          id: m.id,
          text: m.text,
          sender: m.from || m.sender || 'user',
          section_id: m.sectionId || m.section_id,
          created_at: m.createdAt || m.created_at || m.timestamp,
          steps: m.steps,
          citations: m.citations,
        })),
      };
      window.ankiBridge.addMessage('saveCardSession', JSON.stringify(payload));
    }
  }, [currentCardId]);

  /**
   * Cache für eine Karte invalidieren
   */
  const invalidateCache = useCallback((cardId) => {
    if (cardId) {
      sessionCacheRef.current.delete(Number(cardId));
    }
  }, []);

  /**
   * Session-State zurücksetzen (z.B. bei Deck-Exit)
   */
  const clearCurrentSession = useCallback(() => {
    setCurrentCardId(null);
    setCurrentSession(null);
    setIsLoading(false);
  }, []);

  /**
   * Nachrichten im lokalen State aktualisieren (für Streaming/Chat)
   */
  const updateLocalMessages = useCallback((cardId, messages) => {
    const numericCardId = Number(cardId);
    const cached = sessionCacheRef.current.get(numericCardId);
    if (cached) {
      const updated = { ...cached, messages };
      sessionCacheRef.current.set(numericCardId, updated);
      if (numericCardId === currentCardId) {
        setCurrentSession(updated);
      }
    }
  }, [currentCardId]);

  /**
   * Sections im lokalen State aktualisieren
   */
  const updateLocalSections = useCallback((cardId, sections) => {
    const numericCardId = Number(cardId);
    const cached = sessionCacheRef.current.get(numericCardId);
    if (cached) {
      const updated = { ...cached, sections };
      sessionCacheRef.current.set(numericCardId, updated);
      if (numericCardId === currentCardId) {
        setCurrentSession(updated);
      }
    }
  }, [currentCardId]);

  /**
   * Handle ankiReceive events
   */
  const handleAnkiReceive = useCallback((payload) => {
    if (payload.type === 'cardSessionLoaded') {
      handleCardSessionLoaded(payload.data || payload);
    }
  }, [handleCardSessionLoaded]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    currentCardId,
    currentSession,
    isLoading,

    loadCardSession,
    saveMessage,
    saveSection,
    saveFullSession,
    invalidateCache,
    clearCurrentSession,
    updateLocalMessages,
    updateLocalSections,
    handleAnkiReceive,

    // Convenience getters
    messages: currentSession?.messages || [],
    sections: currentSession?.sections || [],
    hasSession: currentSession?.session != null,
  };
}
