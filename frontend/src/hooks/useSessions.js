import { useState, useEffect, useCallback, useRef } from 'react';
import { createSession, updateSession, findSessionByDeck, deleteSession, saveSessions } from '../utils/sessions';

/**
 * Hook für Session-Management
 * Verwaltet Sessions, aktuelle Session und Session-Aktionen
 * 
 * WICHTIG: Sessions werden via Bridge aus Python geladen (nicht localStorage)
 */
export function useSessions(bridge, isReady) {
  const [sessions, setSessionsInternal] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [forceShowOverview, setForceShowOverview] = useState(false);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  
  // CRITICAL FIX: Prevent parallel empty array updates (race condition protection)
  const lastSetSessionsValue = useRef(null);
  
  const setSessions = useCallback((updater) => {
    setSessionsInternal((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      
      const details = {
        prevCount: prev.length,
        nextCount: next.length,
        prevIds: prev.map(s => s.id).slice(0, 2),
        nextIds: next.map(s => s.id).slice(0, 2),
        isFunction: typeof updater === 'function'
      };
      
      console.error('🔴 setSessions:', JSON.stringify(details, null, 2));
      
      // CRITICAL FIX: Reject updates that would reset sessions to empty array
      if (next.length === 0 && prev.length > 0) {
        console.error('⚠️⚠️⚠️ BLOCKED: setSessions trying to RESET from', prev.length, 'to 0!');
        console.error('This is a race condition - keeping previous value');
        return prev; // DON'T UPDATE - keep previous value
      }
      
      // ALSO block if last successful value had sessions but this one doesn't
      if (next.length === 0 && lastSetSessionsValue.current && lastSetSessionsValue.current.length > 0) {
        console.error('⚠️⚠️⚠️ BLOCKED: Empty array when last value had', lastSetSessionsValue.current.length, 'sessions!');
        return lastSetSessionsValue.current; // Return last known good value
      }
      
      // CRITICAL FIX: Block updates that would REDUCE session count (2 -> 1)
      // This happens when a new session is created but then immediately overwritten
      if (next.length < prev.length && prev.length > 0) {
        console.error('⚠️⚠️⚠️ BLOCKED: setSessions trying to REDUCE from', prev.length, 'to', next.length, '!');
        console.error('This is a race condition - keeping previous value');
        console.error('Previous IDs:', prev.map(s => s.id));
        console.error('Next IDs:', next.map(s => s.id));
        return prev; // DON'T UPDATE - keep previous value
      }
      
      // Track last successful value (only if non-empty)
      if (next.length > 0) {
        lastSetSessionsValue.current = next;
      }
      
      return next;
    });
  }, []);
  
  // Ref für Bridge, um in Callbacks Zugriff zu haben
  const bridgeRef = useRef(bridge);
  useEffect(() => {
    bridgeRef.current = bridge;
  }, [bridge]);
  
  // CRITICAL FIX: Track last saved state to prevent saving stale/empty arrays
  const lastSavedSessionsRef = useRef(null);
  
  // Registriere globale saveSessions Funktion für utils/sessions.js
  useEffect(() => {
    if (bridge && bridge.saveSessions) {
      window._bridgeSaveSessions = bridge.saveSessions;
    }
    return () => {
      window._bridgeSaveSessions = null;
    };
  }, [bridge]);
  
  // Initialisierung: Lade Sessions via Bridge
  useEffect(() => {
    console.log('🚀 useSessions: Initialisierung, isReady:', isReady, 'bridge:', !!bridge);
    if (isReady && bridge && bridge.loadSessions) {
      console.log('✅ useSessions: Bridge bereit, fordere Sessions an...');
      bridge.loadSessions();
    }
  }, [isReady, bridge]);
  
  // Listener für Sessions von Python
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleSessionsLoaded = (event) => {
      if (event.detail && event.detail.sessions) {
        console.log('📚 useSessions: Sessions via Event erhalten:', event.detail.sessions.length);
        
        // CRITICAL: Migrate all messages to have stable IDs (fix for legacy sessions)
        const migratedSessions = event.detail.sessions.map(session => {
          if (!session.messages || session.messages.length === 0) return session;
          
          const migratedMessages = session.messages.map((msg, idx) => {
            if (!msg.id || typeof msg.id === 'number') {
              // Old ID format or no ID - generate new stable ID
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
      }
    };
    
    window.addEventListener('sessionsLoaded', handleSessionsLoaded);
    
    // Auch über ankiReceive registrieren
    const originalAnkiReceive = window.ankiReceive;
    window.ankiReceive = (payload) => {
      if (payload.type === 'sessionsLoaded') {
        console.log('📚 useSessions: Sessions via ankiReceive erhalten:', payload.data?.length || 0);
        const loadedSessions = payload.data || [];
        
        // CRITICAL: Migrate all messages to have stable IDs (fix for legacy sessions)
        const migratedSessions = loadedSessions.map(session => {
          if (!session.messages || session.messages.length === 0) return session;
          
          const migratedMessages = session.messages.map((msg, idx) => {
            if (!msg.id || typeof msg.id === 'number') {
              // Old ID format or no ID - generate new stable ID
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
      }
      // Rufe Original-Handler auf
      if (originalAnkiReceive && typeof originalAnkiReceive === 'function') {
        originalAnkiReceive(payload);
      }
    };
    
    return () => {
      window.removeEventListener('sessionsLoaded', handleSessionsLoaded);
      // Restore nicht, da andere Handler ankiReceive überschrieben haben könnten
    };
  }, []);
  
  // Auto-Save: Speichere Sessions wenn sie sich ändern
  useEffect(() => {
    const details = {
      sessionsLoaded,
      sessionsCount: sessions.length,
      hasBridge: !!bridgeRef.current,
      lastSavedCount: lastSavedSessionsRef.current?.length || 0,
      sessionIds: sessions.map(s => s.id)
    };
    
    console.error('🔵 Auto-Save Effect:', JSON.stringify(details, null, 2));
    
    // Nur speichern wenn Sessions geladen wurden (nicht bei initialem leerem State)
    if (!sessionsLoaded || !bridgeRef.current || !bridgeRef.current.saveSessions) {
      console.error('🔵 SKIPPED (not ready):', { sessionsLoaded, hasBridge: !!bridgeRef.current });
      return;
    }
    
    // CRITICAL FIX: Prevent saving empty arrays if we previously had sessions
    // This prevents race conditions where stale closures try to save old state
    if (sessions.length === 0 && lastSavedSessionsRef.current && lastSavedSessionsRef.current.length > 0) {
      console.error('⚠️⚠️⚠️ PREVENTED SAVE: Empty array when', lastSavedSessionsRef.current.length, 'existed!');
      console.error('Last saved IDs:', lastSavedSessionsRef.current.map(s => s.id));
      return;
    }
    
    // Check if sessions actually changed (deep comparison of IDs and message counts)
    const currentSnapshot = sessions.map(s => ({ id: s.id, msgCount: s.messages?.length || 0 }));
    const lastSnapshot = lastSavedSessionsRef.current ? 
      lastSavedSessionsRef.current.map(s => ({ id: s.id, msgCount: s.messages?.length || 0 })) : 
      null;
    
    const hasChanged = !lastSnapshot || JSON.stringify(currentSnapshot) !== JSON.stringify(lastSnapshot);
    
    if (!hasChanged) {
      console.error('🔵 SKIPPED (no changes)');
      return;
    }
    
    console.error('💾 EXECUTING SAVE:', sessions.length, 'sessions, IDs:', sessions.map(s => s.id));
    
    // Save and update ref
    lastSavedSessionsRef.current = sessions;
    bridgeRef.current.saveSessions(sessions);
  }, [sessions, sessionsLoaded]);
  
  // Session wechseln (und Deck öffnen) - gibt Callbacks zurück
  const createHandleSelectSession = useCallback((bridge, setMessages, setSections, setCurrentSectionId) => {
    return (sessionId) => {
      const session = sessions.find((s) => s.id === sessionId);
      if (session) {
        // Öffne Deck, wenn Session ein Deck hat
        if (session.deckId && bridge && bridge.openDeck) {
          console.log('📚 useSessions: Öffne Deck für Session:', session.deckId);
          bridge.openDeck(session.deckId);
        }
        
        setCurrentSessionId(sessionId);
        const sessionMessages = session.messages || [];
        
        // Ensure all messages have unique IDs (fix for legacy messages without IDs)
        const messagesWithIds = sessionMessages.map((msg, idx) => {
          if (!msg.id) {
            return {
              ...msg,
              id: `msg-legacy-${msg.timestamp || Date.now()}-${idx}-${Math.random().toString(36).substr(2, 9)}`
            };
          }
          return msg;
        });
        
        setMessages(messagesWithIds);
        
        // Lade Sections direkt aus der Session (persistiert)
        // Fallback auf Rekonstruktion für alte Sessions ohne sections
        if (session.sections && session.sections.length > 0) {
          console.log('📚 useSessions: Lade Sections aus Session:', session.sections.length);
          setSections(session.sections);
        } else {
          // Rekonstruiere Sections aus Nachrichten (Legacy-Fallback)
          console.log('📚 useSessions: Rekonstruiere Sections aus Nachrichten (Legacy)');
          const messageSections = new Map();
          sessionMessages.forEach(msg => {
            if (msg.sectionId && !messageSections.has(msg.sectionId)) {
              messageSections.set(msg.sectionId, {
                id: msg.sectionId,
                cardId: null, // Können wir nicht rekonstruieren
                title: `Karte ${messageSections.size + 1}`,
                createdAt: msg.id
              });
            }
          });
          setSections(Array.from(messageSections.values()));
        }
        
        if (sessionMessages.length > 0 && sessionMessages[sessionMessages.length - 1].sectionId) {
          setCurrentSectionId(sessionMessages[sessionMessages.length - 1].sectionId);
        }
      }
    };
  }, [sessions, setCurrentSessionId]);
  
  // Session löschen - gibt Callback zurück
  const createHandleDeleteSession = useCallback((setMessages, setSections, setCurrentSectionId) => {
    return (sessionId) => {
      console.log('🗑️ useSessions: Lösche Session:', sessionId);
      const updated = deleteSession(sessions, sessionId, bridgeRef.current?.saveSessions);
      setSessions(updated);
      
      // Wenn die gelöschte Session die aktuelle war, setze auf null
      if (currentSessionId === sessionId) {
        setCurrentSessionId(null);
        setMessages([]);
        setSections([]);
        setCurrentSectionId(null);
      }
    };
  }, [sessions, currentSessionId, setSessions, setCurrentSessionId]);
  
  // Navigiere zur Session-Übersicht
  const createHandleNavigateToOverview = useCallback((bridge) => {
    return () => {
      setForceShowOverview(true);
      // Öffne auch die Stapelübersicht in Anki
      if (bridge && bridge.openDeckBrowser) {
        bridge.openDeckBrowser();
      }
    };
  }, []);
  
  // Chat zurücksetzen (komplett wie Session löschen) - gibt Callback zurück
  const createHandleResetChat = useCallback((setMessages, setSections, setCurrentSectionId) => {
    return () => {
      if (confirm('Möchtest du den Chat wirklich zurücksetzen? Alle Nachrichten und Abschnitte werden gelöscht.')) {
        // Setze alles zurück wie beim Löschen einer Session
        setMessages([]);
        setSections([]);
        setCurrentSectionId(null);
        
        // Auch in der Session speichern (leere Messages und Sections)
        if (currentSessionId) {
          setSessions(prevSessions => updateSession(
            prevSessions, 
            currentSessionId, 
            [], // leere Messages
            [] // leere Sections
          ));
        }
      }
    };
  }, [currentSessionId, setSessions]);
  
  return {
    sessions,
    setSessions,
    currentSessionId,
    setCurrentSessionId,
    forceShowOverview,
    setForceShowOverview,
    sessionsLoaded,
    createHandleSelectSession,
    createHandleDeleteSession,
    createHandleNavigateToOverview,
    createHandleResetChat
  };
}
