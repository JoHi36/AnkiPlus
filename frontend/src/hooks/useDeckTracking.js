import { useState, useEffect, useCallback, useRef } from 'react';
import { findSessionByDeck, updateSession } from '../utils/sessions';

/**
 * Hook für Deck-Tracking
 * Verwaltet Deck-Status, Polling und Deck-Änderungen
 * 
 * WICHTIG: Dieser Hook ist NUR für das Tracking des aktuellen Decks zuständig.
 * Die Session-Erstellung passiert in useChat.handleSend (atomare Operation).
 */
export function useDeckTracking(bridge, isReady, sessions, forceShowOverview, currentSessionId, messages, setCurrentSessionId, setMessages, setSessions, setSections, setCurrentSectionId, setForceShowOverview) {
  const [currentDeck, setCurrentDeck] = useState(null);
  const [pendingDeckSession, setPendingDeckSession] = useState(null);
  const [tempSeenCardIds, setTempSeenCardIds] = useState([]); // Temporäres Tracking für neue Sessions
  
  // Refs um stale closure Probleme zu vermeiden
  const currentSessionIdRef = useRef(currentSessionId);
  const messagesRef = useRef(messages);
  const currentDeckRef = useRef(currentDeck);
  const pendingDeckSessionRef = useRef(pendingDeckSession);
  
  // Aktualisiere Refs
  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);
  
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  
  useEffect(() => {
    currentDeckRef.current = currentDeck;
  }, [currentDeck]);
  
  useEffect(() => {
    pendingDeckSessionRef.current = pendingDeckSession;
  }, [pendingDeckSession]);
  
  // DEPRECATED: Polling removed - now using event-driven architecture
  // Deck changes are handled via deckSelected/deckExited events from Python hooks
  // This hook is kept for backward compatibility but will be phased out in favor of SessionContext
  
  // Get initial deck state on mount (one-time, no polling)
  useEffect(() => {
    if (!isReady || !bridge || !bridge.getCurrentDeck) {
      return;
    }

    // One-time fetch on mount - events will handle subsequent changes
    bridge.getCurrentDeck();
  }, [isReady, bridge]);

  // DEPRECATED: Card tracking moved to SessionContext
  // This hook now just forwards cardContext events to SessionContext
  // The actual seenCardIds management happens in SessionContext.handleCardShown()
  
  // Note: This hook is kept for backward compatibility during migration
  // Eventually, cardContext events should be handled directly in App.jsx via SessionContext 
  
  /**
   * Deck-Änderung behandeln
   */
  const handleDeckChange = useCallback((deckInfo) => {
    console.log('🔄 useDeckTracking: handleDeckChange aufgerufen:', deckInfo);
    
    // Reset Temporary Tracking wenn Deck gewechselt wird
    // (User verlässt das Deck -> gesehene Karten verfallen, wenn keine Session gestartet wurde)
    setTempSeenCardIds([]);
    
    // Kein Deck oder unbekannt
    if (!deckInfo || !deckInfo.deckId) {
      console.log('📋 useDeckTracking: Kein aktives Deck erkannt, Session bleibt erhalten');
      setCurrentDeck(null);
      return;
    }
    
    // ... (rest of logic remains same)
    
    const previousDeckId = currentDeckRef.current?.deckId;
    const newDeckId = deckInfo.deckId;
    
    // SCHUTZ: Wenn gleiches Deck und aktive Session mit Nachrichten existiert
    if (previousDeckId === newDeckId) {
       // ... existing protection logic ...
       const hasActiveSessionWithMessages = currentSessionIdRef.current && messagesRef.current.length > 0;
       if (hasActiveSessionWithMessages) {
          setCurrentDeck(deckInfo);
          if (setForceShowOverview) setForceShowOverview(false);
          return;
       }
       
       if (currentSessionIdRef.current) {
          setCurrentDeck(deckInfo);
          if (setForceShowOverview) setForceShowOverview(false);
          return;
       }
    }
    
    // ATOMARE OPERATION: Suche/Setze Session
    setSessions((prevSessions) => {
      const existingSession = findSessionByDeck(prevSessions, deckInfo.deckId);
      
      if (existingSession) {
        // Session für dieses Deck existiert bereits
        // ... (existing logic for switching session)
        
        if (existingSession.id !== currentSessionIdRef.current) {
           // ... (existing logic)
           setCurrentSessionId(existingSession.id);
           
           // LOAD SESSION DATA
           const sessionMessages = existingSession.messages || [];
           // Migrate messages...
           const migratedMessages = sessionMessages.map((msg, idx) => {
            if (!msg.id || typeof msg.id === 'number') {
              return {
                ...msg,
                id: `msg-legacy-${msg.timestamp || Date.now()}-${idx}-${Math.random().toString(36).substr(2, 9)}`
              };
            }
            return msg;
          });
           setMessages(migratedMessages);
           
           // Sections loading logic...
           if (existingSession.sections && existingSession.sections.length > 0) {
             setSections(existingSession.sections);
             // Set current section
             if (migratedMessages.length > 0) {
               const lastMsg = migratedMessages[migratedMessages.length-1];
               if(lastMsg.sectionId) setCurrentSectionId(lastMsg.sectionId);
             }
           } else {
             // Legacy fallback logic...
             setSections([]); // Simplify for brevity in this replace block, full logic is in original
             // Actually I should preserve the full logic to not break it.
             // But since I'm replacing the whole function, I need to be careful.
             // I will use the "original" logic pattern but rewritten cleanly.
             
             // RE-IMPLEMENTATION OF SECTIONS LOADING (to avoid breaking changes)
             const messageSections = new Map();
             migratedMessages.forEach(msg => {
                if (msg.sectionId && !messageSections.has(msg.sectionId)) {
                    messageSections.set(msg.sectionId, {
                        id: msg.sectionId,
                        title: `Karte ${messageSections.size + 1}`,
                        createdAt: msg.id
                    });
                }
             });
             setSections(Array.from(messageSections.values()));
           }
           
           if (setForceShowOverview) setForceShowOverview(false);
        } else {
            // Same session logic
             if (existingSession.sections && existingSession.sections.length > 0) {
                setSections(existingSession.sections);
              }
             if (setForceShowOverview) setForceShowOverview(false);
        }
        
        setPendingDeckSession(null);
      } else {
        // Keine Session - New Session Logic
        console.log('⏳ useDeckTracking: Keine Session für Deck, wird bei erster Nachricht erstellt');
        
        // Reset old session data if we switched decks completely
        const shouldClearMessages = !currentSessionIdRef.current || 
          (messagesRef.current.length === 0 && previousDeckId !== newDeckId);
          
        if (shouldClearMessages) {
          setCurrentSessionId(null);
          setMessages([]);
          if (setSections) setSections([]);
          if (setCurrentSectionId) setCurrentSectionId(null);
        }
        
        if (!pendingDeckSessionRef.current || pendingDeckSessionRef.current.deckId !== deckInfo.deckId) {
          setPendingDeckSession({
            deckId: deckInfo.deckId,
            deckName: deckInfo.deckName
          });
        }
        
        // Overview handling logic
        if (setForceShowOverview && deckInfo.isInDeck) {
          setForceShowOverview(false);
        }
      }
      
      return prevSessions;
    });
    
    setCurrentDeck(deckInfo);
  }, [setCurrentSessionId, setMessages, setSessions, setSections, setCurrentSectionId, setForceShowOverview]);
  
  return {
    currentDeck,
    setCurrentDeck,
    pendingDeckSession,
    setPendingDeckSession,
    tempSeenCardIds, // EXPORTIEREN für useChat
    setTempSeenCardIds,
    handleDeckChange
  };
}
