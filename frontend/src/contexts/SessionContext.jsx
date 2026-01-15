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
    // #region agent log
    const timestamp = Date.now();
    fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SessionContext.jsx:57',message:'loadSessions useEffect triggered',data:{isReady:isReady,hasBridge:!!bridge,hasLoadSessions:!!bridge?.loadSessions},timestamp:timestamp,sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    if (isReady && bridge && bridge.loadSessions) {
      console.log('📚 SessionContext: Lade Sessions von Bridge...');
      // #region agent log
      const timestamp2 = Date.now();
      fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SessionContext.jsx:60',message:'Calling bridge.loadSessions',data:{},timestamp:timestamp2,sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      bridge.loadSessions();
    } else {
      // #region agent log
      const timestamp3 = Date.now();
      fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SessionContext.jsx:65',message:'loadSessions NOT called - conditions not met',data:{isReady:isReady,hasBridge:!!bridge,hasLoadSessions:!!bridge?.loadSessions},timestamp:timestamp3,sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
    }
  }, [isReady, bridge]);
  
  // Listen for sessionsLoaded event from Python
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleSessionsLoaded = (event) => {
      // #region agent log
      const timestamp = Date.now();
      fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SessionContext.jsx:67',message:'handleSessionsLoaded called',data:{hasEventDetail:!!event.detail,hasEventDetailSessions:!!event.detail?.sessions,eventDetailType:typeof event.detail,eventDetailIsArray:Array.isArray(event.detail)},timestamp:timestamp,sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      const loadedSessions = event.detail?.sessions || event.detail || [];
      // #region agent log
      const timestamp2 = Date.now();
      fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SessionContext.jsx:69',message:'Sessions extracted from event',data:{loadedSessionsCount:loadedSessions.length,loadedSessionsIsArray:Array.isArray(loadedSessions)},timestamp:timestamp2,sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
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
      
      // #region agent log
      const timestamp3 = Date.now();
      fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SessionContext.jsx:91',message:'Setting sessions state',data:{migratedSessionsCount:migratedSessions.length},timestamp:timestamp3,sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      setSessions(migratedSessions);
      setSessionsLoaded(true);
      setIsLoading(false);
      lastSavedSessionsRef.current = migratedSessions;
    };
    
    window.addEventListener('sessionsLoaded', handleSessionsLoaded);
    
    // Also listen via ankiReceive
    const originalAnkiReceive = window.ankiReceive;
    window.ankiReceive = (payload) => {
      // #region agent log
      const timestamp = Date.now();
      console.error('🔵 DEBUG SessionContext: window.ankiReceive called', {
        payloadType: payload?.type,
        hasPayloadData: !!payload?.data,
        payloadDataType: typeof payload?.data,
        payloadDataIsArray: Array.isArray(payload?.data),
        payloadDataLength: Array.isArray(payload?.data) ? payload.data.length : null
      });
      fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SessionContext.jsx:101',message:'window.ankiReceive called',data:{payloadType:payload?.type,hasPayloadData:!!payload?.data,payloadDataType:typeof payload?.data,payloadDataIsArray:Array.isArray(payload?.data),payloadDataLength:Array.isArray(payload?.data)?payload.data.length:null},timestamp:timestamp,sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      if (payload.type === 'sessionsLoaded') {
        // #region agent log
        const timestamp2 = Date.now();
        console.error('🔵 DEBUG SessionContext: sessionsLoaded event detected, calling handleSessionsLoaded', {
          payloadDataLength: Array.isArray(payload.data) ? payload.data.length : null
        });
        fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SessionContext.jsx:103',message:'sessionsLoaded event detected, calling handleSessionsLoaded',data:{payloadDataLength:Array.isArray(payload.data)?payload.data.length:null},timestamp:timestamp2,sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
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
    // #region agent log
    const timestamp = Date.now();
    fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SessionContext.jsx:164',message:'immediateSave called',data:{sessionsToSaveCount:sessionsToSave?.length||0,hasBridge:!!bridgeRef.current,hasSaveSessions:!!bridgeRef.current?.saveSessions},timestamp:timestamp,sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    
    if (bridgeRef.current && bridgeRef.current.saveSessions) {
      console.log('💾 SessionContext: Speichere Sessions (sofort):', sessionsToSave.length);
      // #region agent log
      const timestamp2 = Date.now();
      fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SessionContext.jsx:172',message:'immediateSave calling bridge.saveSessions',data:{sessionsToSaveCount:sessionsToSave.length},timestamp:timestamp2,sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      bridgeRef.current.saveSessions(JSON.stringify(sessionsToSave));
      lastSavedSessionsRef.current = sessionsToSave;
    } else {
      // #region agent log
      const timestamp3 = Date.now();
      fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SessionContext.jsx:175',message:'immediateSave FAILED - no bridge',data:{hasBridge:!!bridgeRef.current,hasSaveSessions:!!bridgeRef.current?.saveSessions},timestamp:timestamp3,sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
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
    // #region agent log
    console.error('🔵 DEBUG SessionContext: handleDeckSelected called', {
      hasDeckData: !!deckData,
      deckId: deckData?.deckId,
      deckName: deckData?.deckName,
      sessionsCount: sessions.length,
      sessionsLoaded: sessionsLoaded
    });
    fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SessionContext.jsx:197',message:'handleDeckSelected called',data:{hasDeckData:!!deckData,deckId:deckData?.deckId,deckName:deckData?.deckName,sessionsCount:sessions.length,sessionsLoaded:sessionsLoaded},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    console.log('🔄 SessionContext: handleDeckSelected:', deckData);
    
    if (!deckData || !deckData.deckId) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SessionContext.jsx:201',message:'handleDeckSelected: missing deckId',data:{hasDeckData:!!deckData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      console.warn('SessionContext: handleDeckSelected ohne deckId');
      return;
    }
    
    const { deckId, deckName, totalCards } = deckData;
    
    // CRITICAL FIX: If sessions are not loaded yet, reload them and retry
    if (!sessionsLoaded && bridgeRef.current && bridgeRef.current.loadSessions) {
      console.log('⏳ SessionContext: Sessions noch nicht geladen, lade sie jetzt...');
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SessionContext.jsx:207',message:'handleDeckSelected: sessions not loaded, reloading',data:{deckId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      bridgeRef.current.loadSessions();
      // Retry after a short delay to allow sessions to load
      setTimeout(() => {
        handleDeckSelected(deckData);
      }, 500);
      return;
    }
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SessionContext.jsx:211',message:'handleDeckSelected: searching for session',data:{deckId,sessionsCount:sessions.length,sessionsLoaded:sessionsLoaded,sessionIds:sessions.map(s=>s.id),sessionDeckIds:sessions.map(s=>s.deckId)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    // Check if session exists
    const existingSession = findSessionByDeck(sessions, deckId);
    
    if (existingSession) {
      // Session exists - use it
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SessionContext.jsx:212',message:'handleDeckSelected: existing session found',data:{sessionId:existingSession.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      console.log('📖 SessionContext: Session gefunden:', existingSession.id);
      setCurrentSession(existingSession);
      setIsTemporary(false);
    } else {
      // No session - create temporary one
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SessionContext.jsx:217',message:'handleDeckSelected: creating temp session',data:{deckName},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
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
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SessionContext.jsx:233',message:'handleDeckSelected: temp session set',data:{tempSessionId:tempSession.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
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
      // #region agent log
      if (payload.type === 'deckSelected' || payload.type === 'deckExited') {
        fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'SessionContext.jsx:368',message:'deckSelected/deckExited event received',data:{type:payload.type,hasData:!!payload.data,deckId:payload.data?.deckId,deckName:payload.data?.deckName},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      }
      // #endregion
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

