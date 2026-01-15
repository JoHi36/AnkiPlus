import { useState, useEffect, useCallback, useRef } from 'react';
import { updateSession, updateSessionSections, createSession, findSessionByDeck } from '../utils/sessions';

// REMOVED: Auto-scroll helper functions - no longer needed with Interaction Container approach

/**
 * Hook für Chat-Funktionalität
 * Verwaltet Messages, Streaming, Loading und Chat-Aktionen
 * 
 * WICHTIG: Dieser Hook implementiert atomare Operationen für Session-Erstellung
 * und Nachricht-Speicherung, um Race Conditions zu vermeiden.
 * 
 * Sections werden bei der ersten Nachricht zu einer neuen Karte erstellt,
 * nicht automatisch beim Öffnen der Karte.
 */
export function useChat(bridge, currentSessionId, setSessions, currentSectionId, cardContextHook = null) {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [currentSteps, setCurrentSteps] = useState([]);  // NEW: Track RAG steps during generation
  const [currentCitations, setCurrentCitations] = useState({});  // NEW: Track citations during generation
  const [error, setError] = useState(null);  // NEW: Error state
  const [connectionStatus, setConnectionStatus] = useState('connected');  // NEW: Connection status: 'connected', 'connecting', 'error', 'disconnected'
  const [lastFailedMessage, setLastFailedMessage] = useState(null);  // NEW: Store last failed message for retry
  
  // Refs to access latest state inside stable callbacks (handleAnkiReceive)
  const currentStepsRef = useRef([]);
  const currentCitationsRef = useRef({});
  
  // Wrapper functions that update both state and refs synchronously
  const updateCurrentSteps = useCallback((updater) => {
    if (typeof updater === 'function') {
      setCurrentSteps((prev) => {
        const newSteps = updater(prev);
        currentStepsRef.current = newSteps; // Synchron update
        return newSteps;
      });
    } else {
      currentStepsRef.current = updater; // Synchron update
      setCurrentSteps(updater);
    }
  }, []);
  
  const updateCurrentCitations = useCallback((updater) => {
    if (typeof updater === 'function') {
      setCurrentCitations((prev) => {
        const newCitations = updater(prev);
        currentCitationsRef.current = newCitations; // Synchron update
        return newCitations;
      });
    } else {
      currentCitationsRef.current = updater; // Synchron update
      setCurrentCitations(updater);
    }
  }, []);
  
  // Ref für appendMessage, damit es in window.ankiReceive verwendet werden kann
  const appendMessageRef = useRef(null);
  
  // Ref für die aktuelle Session-ID (wird für Bot-Antworten benötigt)
  const currentSessionIdRef = useRef(currentSessionId);
  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);
  
  // Ref für die aktuelle Section-ID (wird für Bot-Antworten benötigt)
  const currentSectionIdRef = useRef(currentSectionId);
  useEffect(() => {
    currentSectionIdRef.current = currentSectionId;
  }, [currentSectionId]);
  
  // Ref für pendende Section-Titel-Anfrage
  const pendingSectionTitleRef = useRef(null);
  
  // Nachricht hinzufügen (für Bot-Antworten)
  // Verwendet Refs um immer die aktuelle Session-ID und Section-ID zu haben
  const appendMessage = useCallback((text, from, steps = [], citations = {}) => {
    console.log(`💬 useChat: Füge Nachricht hinzu (${from}):`, text.substring(0, 50) + (text.length > 50 ? '...' : ''));
    const newMessage = { 
      text, 
      from, 
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // Unique stable ID
      sectionId: currentSectionIdRef.current,  // Verwende Ref statt Props
      steps: steps || [],  // NEW: Reasoning steps
      citations: citations || {}  // NEW: Citations map
    };
    
    setMessages((prev) => {
      const updated = [...prev, newMessage];
      
      // Speichere in Session - verwende Ref für aktuelle Session-ID
      const sessionId = currentSessionIdRef.current;
      if (sessionId) {
        setSessions((prevSessions) => {
          try {
            return updateSession(prevSessions, sessionId, updated);
          } catch (error) {
            console.error('Fehler beim Speichern der Nachricht:', error);
            return prevSessions;
          }
        });
      }
      return updated;
    });
    
    // DISABLED: Auto-Scroll während Generation
    // Die View bleibt am Top des Interaction Containers
  }, [currentSectionId, setSessions]);
  
  // Aktualisiere Ref bei jeder Änderung
  useEffect(() => {
    appendMessageRef.current = appendMessage;
  }, [appendMessage]);
  
  // DISABLED: Auto-Scroll beim Streaming
  // Die View bleibt am Top des Interaction Containers während der Generation
  
  /**
   * Nachricht senden - ATOMARE OPERATION
   * 
   * Diese Funktion führt alle Operationen in der korrekten Reihenfolge aus:
   * 1. Session erstellen (falls nötig) - atomar
   * 2. Section erstellen (falls nötig, bei neuer Karte) - neu!
   * 3. Nachricht zur Session hinzufügen - atomar
   * 4. An API senden
   * 
   * @param {string} text - Die Nachricht
   * @param {object} context - Kontext mit pendingDeckSession, setCurrentSessionId, etc. und mode
   */
  const handleSend = useCallback((text, context) => {
    console.log('📤 useChat: Nachricht gesendet:', text.substring(0, 50) + (text.length > 50 ? '...' : ''));
    
    const { 
      pendingDeckSession, 
      setCurrentSessionId, 
      setPendingDeckSession,
      currentMessages,
      mode = 'compact', // Standard: kompakt
      tempSeenCardIds = [] // NEU: Temporär gesehene Karten
    } = context || {};
    
    // Prüfe ob eine neue Section erstellt werden muss
    let effectiveSectionId = currentSectionId;
    let newlyCreatedSection = null;  // Speichere die neue Section für Persistenz
    
    if (cardContextHook && cardContextHook.cardContext && cardContextHook.cardContext.cardId) {
      const cardId = cardContextHook.cardContext.cardId;
      const existingSection = cardContextHook.getSectionForCard(cardId);
      
      if (!existingSection) {
        // Erstelle neue Section mit Platzhalter-Titel
        console.log('📤 useChat: Erstelle neue Section für Karte:', cardId);
        const sectionResult = cardContextHook.createSectionForCard(
          cardId, 
          cardContextHook.cardContext,
          "Lade Titel..."
        );
        
        // createSectionForCard gibt jetzt ein Objekt zurück: { sectionId, section }
        effectiveSectionId = sectionResult.sectionId || sectionResult;
        newlyCreatedSection = sectionResult.section || null;
        
        // Aktualisiere die Ref SOFORT, damit appendMessage die richtige sectionId hat
        currentSectionIdRef.current = effectiveSectionId;
        
        // Fordere KI-Titel an - VERZÖGERT um Race Condition mit Chat-Request zu vermeiden
        if (bridge && bridge.generateSectionTitle) {
          // Verwende frontField (reiner Text) statt question (HTML)
          // Fallback auf question falls frontField nicht vorhanden
          const questionText = cardContextHook.cardContext.frontField || cardContextHook.cardContext.question || '';
          const answerText = cardContextHook.cardContext.answer || '';
          const sectionIdForTitle = effectiveSectionId;
          pendingSectionTitleRef.current = sectionIdForTitle;
          
          console.log('📤 useChat: Fordere KI-Titel an für Section (verzögert):', sectionIdForTitle, 'Text:', questionText.substring(0, 50));
          
          // Verzögere Title-Request um 1.5 Sekunden, damit Chat-Request zuerst abgeschlossen wird
          // Der Titel wird über handleAnkiReceive (sectionTitleGenerated) empfangen und dort gespeichert
          setTimeout(() => {
            if (pendingSectionTitleRef.current === sectionIdForTitle) {
              bridge.generateSectionTitle(questionText, answerText, null);
            }
          }, 1500);
        }
      } else {
        effectiveSectionId = existingSection.id;
        // Aktualisiere die Ref auch für existierende Sections
        currentSectionIdRef.current = effectiveSectionId;
      }
    }
    
    // Erstelle die neue Nachricht mit der effektiven Section-ID
    const newMessage = { 
      text, 
      from: 'user', 
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // Unique stable ID
      sectionId: effectiveSectionId,
      steps: [],  // NEW: User messages don't have steps
      citations: {}  // NEW: User messages don't have citations
    };
    
    // ATOMARE OPERATION: Session-Erstellung + Nachricht-Speicherung
    // Alles passiert in EINEM setSessions-Aufruf
    setSessions((prevSessions) => {
      let targetSessionId = currentSessionIdRef.current;
      let updatedSessions = prevSessions;
      let needsNewSession = false;
      
      // Prüfe ob Session erstellt werden muss
      if (!targetSessionId && pendingDeckSession) {
        // Suche zuerst ob Session vielleicht schon existiert
        const existingSession = findSessionByDeck(prevSessions, pendingDeckSession.deckId);
        
        if (existingSession) {
          // Session existiert bereits - verwende sie
          console.log('📖 useChat: Session bereits vorhanden:', existingSession.id);
          targetSessionId = existingSession.id;
        } else {
          // Erstelle neue Session
          console.log('➕ useChat: Erstelle neue Session für Deck:', pendingDeckSession.deckName);
          try {
            const newSession = createSession(
              prevSessions, 
              pendingDeckSession.deckId, 
              pendingDeckSession.deckName, 
              tempSeenCardIds // Übergebe temporäre IDs
            );
            targetSessionId = newSession.id;
            updatedSessions = [...prevSessions, newSession];
            needsNewSession = true;
          } catch (error) {
            console.error('Fehler beim Erstellen der Session:', error);
            // Fallback: Sende Nachricht ohne Session
            targetSessionId = null;
          }
        }
        
        // Aktualisiere State (außerhalb des funktionalen Updates, aber synchron geplant)
        if (targetSessionId) {
          setCurrentSessionId(targetSessionId);
          currentSessionIdRef.current = targetSessionId;
        }
        setPendingDeckSession(null);
      }
      
      // Füge Nachricht zu Session hinzu
      if (targetSessionId) {
        const currentSession = updatedSessions.find(s => s.id === targetSessionId);
        const currentSessionMessages = needsNewSession 
          ? [] 
          : (currentSession?.messages || []);
        const updatedMessages = [...currentSessionMessages, newMessage];
        
        // Berechne aktualisierte Sections (mit neuer Section falls erstellt)
        let updatedSectionsArray = currentSession?.sections || [];
        if (newlyCreatedSection) {
          // Füge neue Section hinzu (nur die persistierbaren Felder)
          updatedSectionsArray = [...updatedSectionsArray, {
            id: newlyCreatedSection.id,
            cardId: newlyCreatedSection.cardId,
            title: newlyCreatedSection.title,
            createdAt: newlyCreatedSection.createdAt
          }];
        }
        
        try {
          updatedSessions = updateSession(updatedSessions, targetSessionId, updatedMessages, updatedSectionsArray);
        } catch (error) {
          console.error('Fehler beim Speichern der Nachricht:', error);
        }
      }
      return updatedSessions;
    });
    
    // Aktualisiere lokale Messages State
    setMessages((prev) => [...prev, newMessage]);
    
    // Sammle die letzten 10 Nachrichten für KI-Kontext
    const allMessages = [...(currentMessages || []), newMessage];
    const historyMessages = allMessages.slice(-10);
    
    // Konvertiere zu Format für KI
    const conversationHistory = historyMessages.map(msg => ({
      role: msg.from === 'user' ? 'user' : 'assistant',
      content: msg.text
    }));
    
    // DISABLED: Auto-Scroll während Generation
    // Die View bleibt am Top des Interaction Containers
    
    // Sende an API
    setIsLoading(true);
    setStreamingMessage('');
    setError(null);
    setConnectionStatus('connecting');
    updateCurrentSteps([]);  // Reset steps for new request
    updateCurrentCitations({});  // Reset citations for new request
    
    // Store message for potential retry
    setLastFailedMessage({ text, context });
    
    if (bridge && bridge.sendMessage) {
      console.log('📤 useChat: Sende an API mit Historie:', conversationHistory.length, 'Nachrichten, Modus:', mode);
      try {
        bridge.sendMessage(text, conversationHistory, mode);
        setConnectionStatus('connected');
      } catch (err) {
        console.error('❌ useChat: Error sending message:', err);
        setError(err.message || 'Fehler beim Senden der Nachricht');
        setConnectionStatus('error');
        setIsLoading(false);
      }
    } else {
      console.warn('⚠️ useChat: bridge.sendMessage nicht verfügbar');
      setError('Bridge nicht verfügbar');
      setConnectionStatus('error');
      setIsLoading(false);
    }
  }, [bridge, currentSectionId, setSessions, cardContextHook]);
  
  // Anfrage abbrechen
  const handleStopRequest = useCallback(() => {
    console.log('🛑 useChat: Anfrage abbrechen');
    setIsLoading(false);
    setStreamingMessage('');
    setError(null);
    if (bridge && bridge.cancelRequest) {
      console.log('🛑 useChat: Rufe bridge.cancelRequest auf');
      bridge.cancelRequest();
    } else {
      console.warn('⚠️ useChat: bridge.cancelRequest nicht verfügbar');
      if (appendMessageRef.current) {
        appendMessageRef.current('Anfrage abgebrochen.', 'bot');
      }
    }
  }, [bridge]);

  // NEW: Retry last failed message
  const handleRetry = useCallback(() => {
    if (lastFailedMessage) {
      console.log('🔄 useChat: Retry last failed message');
      setError(null);
      setConnectionStatus('connecting');
      handleSend(lastFailedMessage.text, lastFailedMessage.context);
    }
  }, [lastFailedMessage, handleSend]);

  // NEW: Clear error
  const clearError = useCallback(() => {
    setError(null);
    setConnectionStatus('connected');
  }, []);
  
  // Verarbeite ankiReceive Events für Chat
  const handleAnkiReceive = useCallback((payload) => {
    // #region agent log
    if (payload.type === 'ai_state') {
      const timestamp = Date.now();
      fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useChat.js:320',message:'handleAnkiReceive called with ai_state',data:{payloadType:payload.type,payloadMessage:payload.message,hasPayload:!!payload},timestamp:timestamp,sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    }
    // #endregion
    if (payload.type === 'loading') {
      console.log('⏳ useChat: Loading-Indikator aktiviert');
      setIsLoading(true);
      setStreamingMessage('');
      updateCurrentSteps([]);  // Reset steps
      updateCurrentCitations({});  // Reset citations
    } else if (payload.type === 'ai_state') {
      // #region agent log
      const timestamp_before = Date.now();
      fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useChat.js:327',message:'ai_state branch entered',data:{message:payload.message,currentStepsRefLength:currentStepsRef.current?.length||0},timestamp:timestamp_before,sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      // Track AI state events as steps
      const step = {
        state: payload.message,
        timestamp: Date.now(),
        phase: payload.phase || null,
        metadata: payload.metadata || {}
      };
      updateCurrentSteps((prev) => {
        // CRITICAL: Add step and sort by timestamp to ensure correct order
        // Steps may arrive out of order due to async events
        const newSteps = [...prev, step].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        // #region agent log
        const timestamp_update = Date.now();
        fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useChat.js:333',message:'updateCurrentSteps callback executed',data:{prevLength:prev.length,newLength:newSteps.length,stepState:step.state,refUpdated:true,wasSorted:prev.length>0&&newSteps[0]?.timestamp!==prev[0]?.timestamp},timestamp:timestamp_update,sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        return newSteps;
      });
      console.log('📊 useChat: AI State tracked:', payload.message);
    } else if (payload.type === 'rag_sources') {
      // NEW: Live citations from backend
      console.log('📚 useChat: Received live citations:', payload.data ? Object.keys(payload.data).length : 0);
      // #region agent log
      const timestamp_rag = Date.now();
      fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useChat.js:352',message:'rag_sources event received',data:{citationsCount:payload.data?Object.keys(payload.data).length:0,isLoading,hasStreamingMessage:!!streamingMessage},timestamp:timestamp_rag,sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
      // #endregion
      if (payload.data) {
        updateCurrentCitations(payload.data);
        
        // CRITICAL: If message was already saved (streaming done), update it with citations
        // This handles the case where rag_sources arrives after payload.done
        setMessages((prev) => {
          if (prev.length === 0) return prev;
          
          // Find the last bot message (most recent)
          const lastBotMessageIndex = prev.length - 1;
          const lastMessage = prev[lastBotMessageIndex];
          
          // Only update if it's a bot message and doesn't have citations yet OR has fewer citations
          const oldCitationsCount = Object.keys(lastMessage.citations || {}).length;
          const newCitationsCount = Object.keys(payload.data).length;
          const shouldUpdate = lastMessage.from === 'bot' && 
              (oldCitationsCount === 0 || newCitationsCount > oldCitationsCount);
              
          if (shouldUpdate) {
            console.log('💾 useChat: Updating last message with late-arriving citations');
            // #region agent log
            const timestamp_update = Date.now();
            fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useChat.js:370',message:'Updating message with citations',data:{messageId:lastMessage.id,oldCitationsCount,newCitationsCount,hasSteps:!!lastMessage.steps,stepsCount:lastMessage.steps?.length||0,refStepsCount:currentStepsRef.current.length},timestamp:timestamp_update,sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
            // #endregion
            const updated = [...prev];
            // Merge citations (don't overwrite, merge in case some were already there)
            const mergedCitations = { ...(lastMessage.citations || {}), ...payload.data };
            // Use steps from message if available, otherwise from ref
            const finalSteps = (lastMessage.steps && lastMessage.steps.length > 0) 
              ? lastMessage.steps 
              : (currentStepsRef.current.length > 0 ? currentStepsRef.current : []);
            
            updated[lastBotMessageIndex] = {
              ...lastMessage,
              citations: mergedCitations,
              steps: finalSteps
            };
            
            // #region agent log
            const timestamp_after = Date.now();
            fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useChat.js:395',message:'Message updated, saving to session',data:{messageId:updated[lastBotMessageIndex].id,finalCitationsCount:Object.keys(mergedCitations).length,finalStepsCount:finalSteps.length},timestamp:timestamp_after,sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
            // #endregion
            
            // Save to session
            const sessionId = currentSessionIdRef.current;
            if (sessionId) {
              setSessions((prevSessions) => {
                try {
                  const result = updateSession(prevSessions, sessionId, updated);
                  // #region agent log
                  const timestamp_saved = Date.now();
                  fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useChat.js:408',message:'Session updated with citations',data:{sessionId,success:true},timestamp:timestamp_saved,sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
                  // #endregion
                  return result;
                } catch (error) {
                  console.error('Fehler beim Aktualisieren der Nachricht mit Citations:', error);
                  // #region agent log
                  const timestamp_error = Date.now();
                  fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useChat.js:415',message:'Error updating session',data:{sessionId,error:error.message},timestamp:timestamp_error,sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
                  // #endregion
                  return prevSessions;
                }
              });
            }
            
            return updated;
          }
          
          return prev;
        });
      }
    } else if (payload.type === 'error') {
      // NEW: Handle error payloads
      console.error('❌ useChat: Error received:', payload.message);
      setIsLoading(false);
      setStreamingMessage('');
      setError(payload.message || 'Ein Fehler ist aufgetreten');
      setConnectionStatus('error');
      
      // Show error message to user
      if (appendMessageRef.current) {
        appendMessageRef.current(
          `Fehler: ${payload.message || 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.'}`,
          'bot'
        );
      }
    } else if (payload.type === 'bot' || payload.type === 'info') {
      console.log('🤖 useChat: Bot-Nachricht erhalten:', payload.message?.substring(0, 50) + '...');
      if (payload.message) {
        setIsLoading(false);
        setStreamingMessage('');
        setError(null);  // Clear error on success
        setConnectionStatus('connected');
        if (appendMessageRef.current) {
          appendMessageRef.current(payload.message, 'bot');
        }
      }
    } else if (payload.type === 'streaming') {
      console.log('📡 useChat: Streaming-Chunk erhalten:', payload.chunk?.substring(0, 30) + '...', 'done:', payload.done, 'isFunctionCall:', payload.isFunctionCall);
      
      // #region agent log
      const timestamp_received = Date.now();
      fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useChat.js:313',message:'handleAnkiReceive streaming',data:{chunk_len:payload.chunk?.length||0,done:payload.done,timestamp:timestamp_received},timestamp:timestamp_received,sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      
      // Zeige Function Call Indikator wenn nötig
      if (payload.isFunctionCall && !streamingMessage) {
        console.log('🔧 useChat: Function Call erkannt - zeige Indikator');
        setStreamingMessage('Erstelle Diagramm...');
        setIsLoading(true);
      }
      
      // Handle steps and citations from payload (when done=True or during streaming)
      if (payload.steps && payload.steps.length > 0) {
        console.log('📊 useChat: Updating steps from payload:', payload.steps.length);
        updateCurrentSteps(payload.steps);
      }
      if (payload.citations && Object.keys(payload.citations).length > 0) {
        console.log('📚 useChat: Updating citations from payload:', Object.keys(payload.citations).length);
        updateCurrentCitations(payload.citations);
      }
      
      if (payload.chunk) {
        // ... (logging omitted for brevity)
        setStreamingMessage((prev) => {
          // ... (logging omitted)
          const baseMessage = prev === 'Erstelle Diagramm...' ? '' : prev;
          const newMessage = baseMessage + payload.chunk;
          return newMessage;
        });
      }
      
      if (payload.done) {
        // CRITICAL: Don't set isLoading to false immediately - keep it true until message is saved
        // This ensures StreamingChatMessage continues to render with currentSteps/currentCitations
        // until the saved message is available with the same data
        setStreamingMessage((prev) => {
          if (prev && appendMessageRef.current) {
            // Ignoriere Function Call Indikator beim Speichern
            if (prev !== 'Erstelle Diagramm...') {
              // CRITICAL: Keep isLoading true during this callback to maintain StreamingChatMessage
              // It will be set to false after message is saved (see below)
              // Attach accumulated steps and citations to final message
              // Priority: 
              // 1. Payload from backend (final authoritative source)
              // 2. Local tracking (currentStepsRef/currentCitationsRef) - CRITICAL FALLBACK
              // Refs are now updated synchronously, so they should have the latest values
              
              const localSteps = (currentStepsRef.current && currentStepsRef.current.length > 0) 
                ? currentStepsRef.current 
                : (currentSteps.length > 0 ? currentSteps : []); // Backup: Use state if ref is empty
                
              const localCitations = currentCitationsRef.current || {};
              
              let finalSteps = (payload.steps && payload.steps.length > 0) 
                ? payload.steps 
                : (localSteps.length > 0 ? localSteps : []);
                
              const finalCitations = (payload.citations && Object.keys(payload.citations).length > 0) 
                ? payload.citations 
                : (Object.keys(localCitations).length > 0 ? localCitations : {});
              
              // ROBUST FALLBACK: If steps are missing but we have citations, generate synthetic steps NOW
              // This ensures the saved message has persisted steps and doesn't rely on UI-side fallback
              if (finalSteps.length === 0 && Object.keys(finalCitations).length > 0) {
                console.log('⚠️ useChat: Steps missing on done, generating synthetic steps from citations');
                finalSteps = [
                  {
                    state: 'Intent: Analyse',
                    timestamp: Date.now() - 2000
                  },
                  {
                    state: `Wissensabruf: ${Object.keys(finalCitations).length} relevante Karten gefunden`,
                    timestamp: Date.now() - 1000
                  }
                ];
              } else if (finalSteps.length === 0) {
                 // Even if no citations, add a generic "Finished" step if we have a message
                 // to prevent "Simplified Version" / empty box
                 console.log('⚠️ useChat: Steps missing completely, adding generic finished step');
                 finalSteps = [{
                    state: 'Antwort generiert',
                    timestamp: Date.now()
                 }];
              }
              
              // Enhanced logging for debugging
              console.log('💾 useChat: Saving final message', {
                messageLength: prev.length,
                stepsFromPayload: payload.steps?.length || 0,
                stepsFromRef: localSteps.length,
                finalStepsCount: finalSteps.length,
                citationsFromPayload: Object.keys(payload.citations || {}).length,
                citationsFromRef: Object.keys(localCitations).length,
                finalCitationsCount: Object.keys(finalCitations).length,
                refStepsSample: localSteps.slice(0, 2).map(s => s.state?.substring(0, 30)),
                refCitationsKeys: Object.keys(localCitations).slice(0, 5)
              });
              // #region agent log
              const timestamp_done = Date.now();
              fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useChat.js:409',message:'payload.done handler - before appendMessage',data:{stepsFromPayload:payload.steps?.length||0,stepsFromRef:localSteps.length,finalStepsCount:finalSteps.length,refStepsSample:localSteps.slice(0,3).map(s=>({state:s.state?.substring(0,50),timestamp:s.timestamp})),citationsFromRef:Object.keys(localCitations).length},timestamp:timestamp_done,sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
              // #endregion
              
              // CRITICAL: Always save steps and citations, even if empty, to maintain consistency
              // This ensures the ThoughtStream has the same data during streaming and after saving
              // #region agent log
              const timestamp_append = Date.now();
              fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useChat.js:431',message:'Calling appendMessage with steps/citations',data:{finalStepsCount:finalSteps.length,finalCitationsCount:Object.keys(finalCitations).length,appendMessageRefExists:!!appendMessageRef.current,stepsSample:finalSteps.slice(0,2).map(s=>({state:s.state?.substring(0,50)})),citationsSample:Object.keys(finalCitations).slice(0,5)},timestamp:timestamp_append,sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
              // #endregion
              appendMessageRef.current(prev, 'bot', finalSteps, finalCitations);
              
              // CRITICAL: Set isLoading to false AFTER message is saved
              // This ensures StreamingChatMessage continues to render until saved message is available
              setTimeout(() => {
                setIsLoading(false);
                // Reset tracking state after a delay to ensure message is saved
                updateCurrentSteps([]);
                updateCurrentCitations({});
                // CRITICAL: Clear streaming message AFTER isLoading is set to false
                // This prevents the "white screen gap" where text disappears before saved message appears
                setStreamingMessage('');
              }, 500); // Wait 500ms to ensure message is saved before switching to saved message
              
              // CRITICAL: Keep the text in state until timeout clears it
              // This prevents the text from disappearing before the saved message is rendered
              return prev; // Keep streaming message visible until timeout
            }
          }
          return '';
        });
      }
    } else if (payload.type === 'sectionTitleGenerated') {
      // Verarbeite KI-generierten Section-Titel
      console.log('🏷️ useChat: Section-Titel erhalten:', payload.data);
      
      if (!payload.data) {
        console.error('❌ useChat: sectionTitleGenerated ohne data:', payload);
        return;
      }
      
      if (payload.data.success === false) {
        // Fehler bei Titel-Generierung
        const error = payload.data.error || 'Unbekannter Fehler';
        console.error('❌ useChat: Section-Titel Generierung fehlgeschlagen:', error);
        console.error('  Section ID:', pendingSectionTitleRef.current);
        console.error('  Error Details:', payload.data);
        
        // Verwende Fallback-Titel
        const sectionId = pendingSectionTitleRef.current;
        if (sectionId && cardContextHook && cardContextHook.updateSectionTitle) {
          cardContextHook.updateSectionTitle(sectionId, 'Lernkarte');
          pendingSectionTitleRef.current = null;
        }
        return;
      }
      
      if (payload.data && payload.data.success && payload.data.title) {
        const sectionId = pendingSectionTitleRef.current;
        const title = payload.data.title;
        
        console.log('✅ useChat: Section-Titel erfolgreich generiert:', title);
        
        if (sectionId && cardContextHook && cardContextHook.updateSectionTitle) {
          // 1. Aktualisiere lokalen State
          cardContextHook.updateSectionTitle(sectionId, title);
          pendingSectionTitleRef.current = null;
          
          // 2. Speichere auch in der Session (für Persistenz)
          const sessionId = currentSessionIdRef.current;
          if (sessionId) {
            console.log('💾 useChat: Speichere Section-Titel in Session:', sectionId, '->', title);
            setSessions(prevSessions => {
              const currentSession = prevSessions.find(s => s.id === sessionId);
              if (!currentSession) {
                console.warn('⚠️ useChat: Session nicht gefunden für Titel-Update:', sessionId);
                return prevSessions;
              }
              
              // Aktualisiere Sections in der Session
              const updatedSections = (currentSession.sections || []).map(s =>
                s.id === sectionId ? { ...s, title } : s
              );
              
              return updateSessionSections(prevSessions, sessionId, updatedSections);
            });
          }
        } else {
          console.warn('⚠️ useChat: Section-ID oder cardContextHook nicht verfügbar für Titel-Update');
        }
      } else {
        console.warn('⚠️ useChat: sectionTitleGenerated mit unerwarteter Struktur:', payload.data);
      }
    }
  }, [cardContextHook]);
  
  return {
    messages,
    setMessages,
    isLoading,
    streamingMessage,
    currentSteps,  // NEW: Expose current steps for streaming
    currentCitations,  // NEW: Expose current citations for streaming
    error,  // NEW: Error state
    connectionStatus,  // NEW: Connection status
    appendMessage,
    appendMessageRef,
    handleSend,
    handleStopRequest,
    handleRetry,  // NEW: Retry function
    clearError,  // NEW: Clear error function
    handleAnkiReceive
  };
}
