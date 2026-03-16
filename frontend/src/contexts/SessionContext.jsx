import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { findSessionByDeck, createSession, updateSession, saveSessions } from '../utils/sessions';

/**
 * SessionContext - Central State Machine for Session Management
 * 
 * Manages:
 * - Temporary sessions (RAM only, until first message)
 * - Persisted sessions (saved to disk)
 * - Session synchronization with Anki deck changes
 * 
 * State Structure:
 * - sessions: Array of all persisted sessions from disk
 * - currentSession: Active session object OR null
 * - isTemporary: Boolean flag (true = RAM only, false = persisted)
 * - isLoading: Loading state
 */
const SessionContext = createContext(null);

export function useSessionContext() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSessionContext must be used within SessionContextProvider');
  }
  return context;
}

export function SessionContextProvider({ children, bridge, isReady }) {
  const [sessions, setSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [isTemporary, setIsTemporary] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  
  // Refs for debouncing and preventing race conditions
  const saveTimeoutRef = useRef(null);
  const lastSavedSessionsRef = useRef(null);
  const bridgeRef = useRef(bridge);
  
  // Update bridge ref
  useEffect(() => {
    bridgeRef.current = bridge;
  }, [bridge]);
  
  // Register global saveSessions function for utils/sessions.js
  useEffect(() => {
    if (bridge && bridge.saveSessions) {
      window._bridgeSaveSessions = bridge.saveSessions;
    }
    return () => {
      window._bridgeSaveSessions = null;
    };
  }, [bridge]);
  
  // Load sessions from disk on mount
  useEffect(() => {
    if (isReady && bridge && bridge.loadSessions) {
      console.log('📚 SessionContext: Lade Sessions von Bridge...');
      bridge.loadSessions();
    } else {
    }
  }, [isReady, bridge]);
  
  // Listen for sessionsLoaded event from Python
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleSessionsLoaded = (event) => {
      const loadedSessions = event.detail?.sessions || event.detail || [];
      console.log('📚 SessionContext: Sessions geladen:', loadedSessions.length);
      
      // Migrate messages to have stable IDs
      const migratedSessions = loadedSessions.map(session => {
        if (!session.messages || session.messages.length === 0) return session;
        
        const migratedMessages = session.messages.map((msg, idx) => {
          if (!msg.id || typeof msg.id === 'number') {
            return {
              ...msg,
              id: `msg-legacy-${msg.timestamp || Date.now()}-${idx}-${Math.random().toString(36).substr(2, 9)}`
            };
          }
          return msg;
        });
        
        return {
          ...session,
          messages: migratedMessages
        };
      });
      
      setSessions(migratedSessions);
      setSessionsLoaded(true);
      setIsLoading(false);
      lastSavedSessionsRef.current = migratedSessions;
    };
    
    window.addEventListener('sessionsLoaded', handleSessionsLoaded);
    
    // Also listen via ankiReceive
    const originalAnkiReceive = window.ankiReceive;
    window.ankiReceive = (payload) => {
      if (payload.type === 'sessionsLoaded') {
        handleSessionsLoaded({ detail: { sessions: payload.data || [] } });
      }
      if (originalAnkiReceive) {
        originalAnkiReceive(payload);
      }
    };
    
    return () => {
      window.removeEventListener('sessionsLoaded', handleSessionsLoaded);
    };
  }, []);
  
  // Debounced save function
  const debouncedSave = useCallback((sessionsToSave) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      if (bridgeRef.current && bridgeRef.current.saveSessions) {
        console.log('💾 SessionContext: Speichere Sessions (debounced):', sessionsToSave.length);
        bridgeRef.current.saveSessions(JSON.stringify(sessionsToSave));
        lastSavedSessionsRef.current = sessionsToSave;
      }
    }, 5000); // 5 second debounce
  }, []);
  
  // Immediate save (for critical transitions)
  const immediateSave = useCallback((sessionsToSave) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    
    if (bridgeRef.current && bridgeRef.current.saveSessions) {
      console.log('💾 SessionContext: Speichere Sessions (sofort):', sessionsToSave.length);
      bridgeRef.current.saveSessions(JSON.stringify(sessionsToSave));
      lastSavedSessionsRef.current = sessionsToSave;
    } else {
    }
  }, []);
  
  /**
   * Handle deckSelected event from Anki
   * Implements the sync algorithm:
   * 1. Check if session with deckId exists
   * 2. If YES: Set currentSession = foundSession, isTemporary = false
   * 3. If NO: Create temp session, set currentSession = tempSession, isTemporary = true
   */
  const handleDeckSelected = useCallback((deckData) => {
    console.log('🔄 SessionContext: handleDeckSelected:', deckData);
    
    if (!deckData || !deckData.deckId) {
      console.warn('SessionContext: handleDeckSelected ohne deckId');
      return;
    }
    
    const { deckId, deckName, totalCards } = deckData;
    
    // CRITICAL FIX: If sessions are not loaded yet, reload them and retry
    if (!sessionsLoaded && bridgeRef.current && bridgeRef.current.loadSessions) {
      console.log('⏳ SessionContext: Sessions noch nicht geladen, lade sie jetzt...');
      bridgeRef.current.loadSessions();
      // Retry after a short delay to allow sessions to load
      setTimeout(() => {
        handleDeckSelected(deckData);
      }, 500);
      return;
    }
    
    // Check if session exists
    const existingSession = findSessionByDeck(sessions, deckId);
    
    if (existingSession) {
      // Session exists - use it
      console.log('📖 SessionContext: Session gefunden:', existingSession.id);
      setCurrentSession(existingSession);
      setIsTemporary(false);
    } else {
      // No session - create temporary one
      console.log('⏳ SessionContext: Erstelle temporäre Session für Deck:', deckName);
      
      // Create temp session object (not saved to disk yet)
      const tempSession = {
        id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: deckName || `Session ${sessions.length + 1}`,
        messages: [],
        sections: [],
        seenCardIds: [], // Will be populated as cards are shown
        createdAt: new Date().toISOString(),
        deckId: deckId,
        deckName: deckName,
        totalCards: totalCards || 0
      };
      
      setCurrentSession(tempSession);
      setIsTemporary(true);
    }
  }, [sessions, sessionsLoaded]);
  
  /**
   * Handle deckExited event from Anki
   * Clears current session and redirects to overview
   */
  const handleDeckExited = useCallback(() => {
    console.log('🚪 SessionContext: handleDeckExited');
    
    // If temporary session exists and has no messages, discard it
    if (isTemporary && currentSession && (!currentSession.messages || currentSession.messages.length === 0)) {
      console.log('🗑️ SessionContext: Verwerfe temporäre Session (keine Nachrichten)');
    } else if (isTemporary && currentSession) {
      // Temporary session with messages - should have been persisted by handleFirstMessage
      console.warn('⚠️ SessionContext: Temporäre Session mit Nachrichten sollte bereits persistiert sein');
    }
    
    setCurrentSession(null);
    setIsTemporary(false);
  }, [isTemporary, currentSession]);
  
  /**
   * Handle first message - transitions temp → persisted
   */
  const handleFirstMessage = useCallback(() => {
    if (!isTemporary || !currentSession) {
      return; // Not a temporary session or no session
    }
    
    console.log('💬 SessionContext: Erste Nachricht - persistiere Session');
    
    // Create persisted session from temp session
    const persistedSession = {
      ...currentSession,
      id: crypto.randomUUID ? crypto.randomUUID() : `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      updatedAt: new Date().toISOString()
    };
    
    // Add to sessions array
    const updatedSessions = [...sessions, persistedSession];
    setSessions(updatedSessions);
    setCurrentSession(persistedSession);
    setIsTemporary(false);
    
    // Save immediately (critical transition)
    immediateSave(updatedSessions);
  }, [isTemporary, currentSession, sessions, immediateSave]);
  
  /**
   * Handle card shown - updates seenCardIds
   * Uses debounced save to avoid performance issues
   */
  const handleCardShown = useCallback((cardId) => {
    if (!currentSession || !cardId) {
      return;
    }
    
    // Use Set to prevent duplicates
    const seenCardIdsSet = new Set(currentSession.seenCardIds || []);
    if (seenCardIdsSet.has(cardId)) {
      return; // Already seen
    }
    
    seenCardIdsSet.add(cardId);
    const updatedSeenCardIds = Array.from(seenCardIdsSet);
    
    console.log(`👁️ SessionContext: Karte gesehen: ${cardId} (Total: ${updatedSeenCardIds.length})`);
    
    // Update current session
    const updatedSession = {
      ...currentSession,
      seenCardIds: updatedSeenCardIds,
      updatedAt: new Date().toISOString()
    };
    
    setCurrentSession(updatedSession);
    
    // If persisted, update in sessions array and debounce save
    if (!isTemporary) {
      const updatedSessions = sessions.map(s => 
        s.id === updatedSession.id ? updatedSession : s
      );
      setSessions(updatedSessions);
      debouncedSave(updatedSessions);
    }
    // If temporary, just update state (will be saved when persisted)
  }, [currentSession, isTemporary, sessions, debouncedSave]);
  
  /**
   * Update session messages and sections
   */
  const updateSessionData = useCallback((sessionId, messages, sections = null) => {
    if (!sessionId) {
      console.warn('SessionContext: updateSessionData ohne sessionId');
      return;
    }
    
    const updatedSessions = updateSession(sessions, sessionId, messages, sections);
    setSessions(updatedSessions);
    
    // Update current session if it's the one being updated
    if (currentSession && currentSession.id === sessionId) {
      const updated = updatedSessions.find(s => s.id === sessionId);
      if (updated) {
        setCurrentSession(updated);
      }
    }
    
    // Save immediately (message updates are critical)
    immediateSave(updatedSessions);
  }, [sessions, currentSession, immediateSave]);
  
  /**
   * Delete a session
   */
  const deleteSessionById = useCallback((sessionId) => {
    const updatedSessions = sessions.filter(s => s.id !== sessionId);
    setSessions(updatedSessions);
    
    // If deleted session was current, clear it
    if (currentSession && currentSession.id === sessionId) {
      setCurrentSession(null);
      setIsTemporary(false);
    }
    
    immediateSave(updatedSessions);
  }, [sessions, currentSession, immediateSave]);
  
  // Listen for deckSelected and deckExited events
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const originalAnkiReceive = window.ankiReceive;
    window.ankiReceive = (payload) => {
      if (payload.type === 'deckSelected') {
        handleDeckSelected(payload.data);
      } else if (payload.type === 'deckExited') {
        handleDeckExited();
      }
      
      if (originalAnkiReceive) {
        originalAnkiReceive(payload);
      }
    };
    
    return () => {
      window.ankiReceive = originalAnkiReceive;
    };
  }, [handleDeckSelected, handleDeckExited]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);
  
  // PERFORMANCE: Memoize context value to prevent unnecessary re-renders
  const value = useMemo(() => ({
    // State
    sessions,
    currentSession,
    isTemporary,
    isLoading,
    sessionsLoaded,
    
    // Actions
    handleDeckSelected,
    handleDeckExited,
    handleFirstMessage,
    handleCardShown,
    updateSessionData,
    deleteSessionById,
    setCurrentSession,
    setSessions,
    setIsTemporary,
    
    // Helpers
    currentSessionId: currentSession?.id || null
  }), [
    sessions,
    currentSession,
    isTemporary,
    isLoading,
    sessionsLoaded,
    handleDeckSelected,
    handleDeckExited,
    handleFirstMessage,
    handleCardShown,
    updateSessionData,
    deleteSessionById,
    setCurrentSession,
    setSessions,
    setIsTemporary
  ]);
  
  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

