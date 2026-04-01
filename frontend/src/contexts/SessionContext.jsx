import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { findSessionByDeck, createSession, updateSession } from '../utils/sessions';

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
  
  const bridgeRef = useRef(bridge);

  // Update bridge ref
  useEffect(() => {
    bridgeRef.current = bridge;
  }, [bridge]);
  
  // Legacy JSON session loading removed — per-card SQLite is now used instead.
  // Mark sessions as loaded immediately since there's nothing to load from JSON.
  useEffect(() => {
    setSessionsLoaded(true);
    setIsLoading(false);
  }, []);
  
  // Legacy JSON save functions removed — per-card SQLite handles persistence now.
  // These no-op stubs keep the internal API stable during migration.
  const debouncedSave = useCallback(() => {}, []);
  const immediateSave = useCallback(() => {}, []);
  
  /**
   * Handle deckSelected event from Anki
   * Implements the sync algorithm:
   * 1. Check if session with deckId exists
   * 2. If YES: Set currentSession = foundSession, isTemporary = false
   * 3. If NO: Create temp session, set currentSession = tempSession, isTemporary = true
   */
  const handleDeckSelected = useCallback((deckData) => {
    
    if (!deckData || !deckData.deckId) {
      return;
    }
    
    const { deckId, deckName, totalCards } = deckData;
    
    // Check if session exists
    const existingSession = findSessionByDeck(sessions, deckId);
    
    if (existingSession) {
      // Session exists - use it
      setCurrentSession(existingSession);
      setIsTemporary(false);
    } else {
      // No session - create temporary one
      
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
    
    // If temporary session exists and has no messages, discard it
    if (isTemporary && currentSession && (!currentSession.messages || currentSession.messages.length === 0)) {
    } else if (isTemporary && currentSession) {
      // Temporary session with messages - should have been persisted by handleFirstMessage
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
  
  // Listen for deckSelected and deckExited events via CustomEvents
  // NOTE: These events are dispatched by the main ankiReceive handler in App.jsx.
  // Do NOT wrap window.ankiReceive here — it destroys the handler chain
  // and breaks per-card session switching.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onDeckSelected = (event) => {
      handleDeckSelected(event.detail);
    };
    const onDeckExited = () => {
      handleDeckExited();
    };

    window.addEventListener('deckSelected', onDeckSelected);
    window.addEventListener('deckExited', onDeckExited);

    return () => {
      window.removeEventListener('deckSelected', onDeckSelected);
      window.removeEventListener('deckExited', onDeckExited);
    };
  }, [handleDeckSelected, handleDeckExited]);
  
  
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

