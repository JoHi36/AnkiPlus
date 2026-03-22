import { useState, useEffect, useCallback, useRef, startTransition } from 'react';
import { updateSession, updateSessionSections, createSession, findSessionByDeck } from '../utils/sessions';
import { getDirectCallPattern, findAgent } from '@shared/config/subagentRegistry';

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
export function useChat(bridge, currentSessionId, setSessions, currentSectionId, cardContextHook = null, cardSessionHook = null) {
  const [messages, setMessages] = useState([]);
  const freeChatPushRef = useRef(null); // set by App.jsx to push messages to Free Chat
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [currentSteps, setCurrentSteps] = useState([]);  // NEW: Track RAG steps during generation
  const [currentCitations, setCurrentCitations] = useState({});  // NEW: Track citations during generation
  const [error, setError] = useState(null);  // NEW: Error state
  const [connectionStatus, setConnectionStatus] = useState('connected');  // NEW: Connection status: 'connected', 'connecting', 'error', 'disconnected'
  const [lastFailedMessage, setLastFailedMessage] = useState(null);  // NEW: Store last failed message for retry
  const [tokenInfo, setTokenInfo] = useState(null);  // Token usage info from backend
  
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
  
  const [pipelineSteps, setPipelineSteps] = useState([]);
  // Each: { step: 'router'|'sql_search'|..., status: 'active'|'done'|'error', data: {}, timestamp: number }
  const pipelineStepsRef = useRef([]);
  // Generation counter — increments on each new pipeline to signal ThoughtStream to reset refs
  const [pipelineGeneration, setPipelineGeneration] = useState(0);

  const updatePipelineSteps = useCallback((updater) => {
    setPipelineSteps(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      pipelineStepsRef.current = next;
      return next;
    });
  }, []);

  // Ref für cardSessionHook (per-card persistence)
  const cardSessionHookRef = useRef(cardSessionHook);
  useEffect(() => {
    cardSessionHookRef.current = cardSessionHook;
  }, [cardSessionHook]);

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

  // Listen for cardSessionReady events from useCardSession
  // This ensures chat messages are populated when a card session loads
  useEffect(() => {
    const handler = (e) => {
      const { session } = e.detail;
      if (session && session.messages && session.messages.length > 0) {
        setMessages(session.messages);
      } else {
        setMessages([]);
      }
      setIsLoading(false);
      setStreamingMessage('');
    };
    window.addEventListener('cardSessionReady', handler);
    return () => window.removeEventListener('cardSessionReady', handler);
  }, []);

  // Ref for active request ID (used to match streaming/error/metadata responses)
  const activeRequestIdRef = useRef(null);
  
  // Nachricht hinzufügen (für Bot-Antworten)
  // Verwendet Refs um immer die aktuelle Session-ID und Section-ID zu haben
  const appendMessage = useCallback((text, from, steps = [], citations = {}, requestId = null, stepLabels = [], pipelineData = null) => {
    console.log(`💬 useChat: Füge Nachricht hinzu (${from}):`, text.substring(0, 50) + (text.length > 50 ? '...' : ''));
    const newMessage = {
      text,
      from,
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // Unique stable ID
      sectionId: currentSectionIdRef.current,  // Verwende Ref statt Props
      steps: stepLabels && stepLabels.length > 0 ? stepLabels : (steps || []),  // NEW: Reasoning steps (prefer stepLabels)
      citations: citations || {},  // NEW: Citations map
      request_id: requestId || activeRequestIdRef.current,  // Link to request
      pipeline_data: pipelineData,  // Full pipeline step data for persistent ThoughtStream
    };
    
    // CRITICAL PATH: Update messages immediately
    setMessages((prev) => [...prev, newMessage]);

    // LOW PRIORITY: Session persistence deferred to avoid blocking render
    startTransition(() => {
      const sessionId = currentSessionIdRef.current;
      if (sessionId) {
        setSessions((prevSessions) => {
          try {
            // Use functional updater to get latest messages
            return updateSession(prevSessions, sessionId, [...(prevSessions.find(s => s.id === sessionId)?.messages || []), newMessage]);
          } catch (error) {
            console.error('Fehler beim Speichern der Nachricht:', error);
            return prevSessions;
          }
        });
      }
    });

    // DEFERRED: Per-Card SQLite Persistence
    if (cardSessionHookRef.current) {
      const cardId = cardSessionHookRef.current.currentCardId;
      if (cardId) {
        queueMicrotask(() => cardSessionHookRef.current?.saveMessage(cardId, newMessage));
      }
    }

    // Push card messages to Free Chat hook (for deck-level chronological view)
    if (freeChatPushRef.current) {
      freeChatPushRef.current(newMessage);
    }
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

    // Generate a unique request ID to correlate streaming/error/metadata responses
    const requestId = crypto.randomUUID?.() ||
                      `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    activeRequestIdRef.current = requestId;

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
          
          console.log('📤 useChat: Fordere KI-Titel an für Section:', sectionIdForTitle, 'Text:', questionText.substring(0, 50));

          // Request title immediately - requestId-based correlation eliminates the race condition
          bridge.generateSectionTitle(questionText, answerText, null);
        }
      } else {
        effectiveSectionId = existingSection.id;
        // Aktualisiere die Ref auch für existierende Sections
        currentSectionIdRef.current = effectiveSectionId;
      }
    }

    // Per-Card SQLite: Save newly created section
    if (newlyCreatedSection && cardSessionHookRef.current) {
      const cardId = cardSessionHookRef.current.currentCardId || cardContextHook?.cardContext?.cardId;
      if (cardId) {
        cardSessionHookRef.current.saveSection(cardId, newlyCreatedSection);
      }
    }

    // Erstelle die neue Nachricht mit der effektiven Section-ID
    const newMessage = {
      text,
      from: 'user',
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // Unique stable ID
      sectionId: effectiveSectionId,
      steps: [],  // User messages don't have steps
      citations: {},  // User messages don't have citations
      request_id: requestId  // Link to request for correlation
    };
    
    // ── CRITICAL PATH: These must fire FIRST to unblock the UI ──
    // Pipeline generation increment signals ThoughtStream to reset its internal refs
    // (seenRef, activeRef, etc.) even when React batches the [] and new steps together.
    setPipelineGeneration(g => g + 1);
    updatePipelineSteps([]);
    updateCurrentSteps([]);
    updateCurrentCitations({});
    setMessages((prev) => [...prev, newMessage]);
    setIsLoading(true);
    setStreamingMessage('');
    setError(null);
    setConnectionStatus('connecting');

    // ── DEFERRED: Session persistence (heavy computation, not visible to user) ──
    startTransition(() => {
      setSessions((prevSessions) => {
        let targetSessionId = currentSessionIdRef.current;
        let updatedSessions = prevSessions;
        let needsNewSession = false;

        if (!targetSessionId && pendingDeckSession) {
          const existingSession = findSessionByDeck(prevSessions, pendingDeckSession.deckId);

          if (existingSession) {
            targetSessionId = existingSession.id;
          } else {
            try {
              const newSession = createSession(
                prevSessions,
                pendingDeckSession.deckId,
                pendingDeckSession.deckName,
                tempSeenCardIds
              );
              targetSessionId = newSession.id;
              updatedSessions = [...prevSessions, newSession];
              needsNewSession = true;
            } catch (error) {
              console.error('Fehler beim Erstellen der Session:', error);
              targetSessionId = null;
            }
          }

          if (targetSessionId) {
            setCurrentSessionId(targetSessionId);
            currentSessionIdRef.current = targetSessionId;
          }
          setPendingDeckSession(null);
        }

        if (targetSessionId) {
          const currentSession = updatedSessions.find(s => s.id === targetSessionId);
          const currentSessionMessages = needsNewSession
            ? []
            : (currentSession?.messages || []);
          const updatedMessages = [...currentSessionMessages, newMessage];

          let updatedSectionsArray = currentSession?.sections || [];
          if (newlyCreatedSection) {
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
    });

    // ── DEFERRED: Per-Card SQLite persistence ──
    if (cardSessionHookRef.current) {
      const cardId = cardSessionHookRef.current.currentCardId;
      if (cardId) {
        queueMicrotask(() => cardSessionHookRef.current?.saveMessage(cardId, newMessage));
      }
    }

    // Sammle die letzten 10 Nachrichten für KI-Kontext
    const allMessages = [...(currentMessages || []), newMessage];
    const historyMessages = allMessages.slice(-10);

    // Konvertiere zu Format für KI
    const conversationHistory = historyMessages.map(msg => ({
      role: msg.from === 'user' ? 'user' : 'assistant',
      content: msg.text
    }));

    // @Subagent direct mode — detect via registry, emit synthetic pipeline, route via subagentDirect
    const directCallPattern = getDirectCallPattern();
    const directMatch = directCallPattern ? directCallPattern.exec(text) : null;

    if (directMatch) {
      const agentName = directMatch[1].toLowerCase();
      const agent = findAgent(agentName);
      if (agent) {
        console.log(`@${agent.label} detected, emitting synthetic pipeline`);
        // Emit synthetic router-active immediately
        updatePipelineSteps([{ step: 'router', status: 'active', data: {}, timestamp: Date.now() }]);

        // After 700ms, emit router-done with subagent info
        setTimeout(() => {
          updatePipelineSteps(prev => prev.map(s => s.step === 'router' ? {
            ...s,
            status: 'done',
            data: {
              search_needed: false,
              retrieval_mode: `subagent:${agentName}`,
              response_length: 'short',
              scope: 'none',
              scope_label: ''
            },
            timestamp: Date.now()
          } : s));
        }, 700);

        // Strip @Name prefix and route via generic bridge method
        const cleanText = text.replace(directCallPattern, '').trim() || text;
        console.log(`@${agent.label}: routing via bridge.subagentDirect`);
        if (bridge && bridge.subagentDirect) {
          bridge.subagentDirect(agentName, cleanText, JSON.stringify({}));
        } else {
          console.error(`@${agent.label}: bridge.subagentDirect NOT available!`);
        }
        return; // Skip normal sendMessage flow
      }
    }

    // Store message for potential retry
    setLastFailedMessage({ text, context });

    if (bridge && bridge.sendMessage) {
      console.log('📤 useChat: Sende an API mit Historie:', conversationHistory.length, 'Nachrichten, Modus:', mode, 'requestId:', requestId);
      try {
        bridge.sendMessage(text, conversationHistory, mode, requestId);
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
    activeRequestIdRef.current = null; // Clear active request on cancel
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
    if (payload.type === 'loading') {
      console.log('⏳ useChat: Loading-Indikator aktiviert');
      setIsLoading(true);
      setStreamingMessage('');
      updateCurrentSteps([]);  // Reset steps
      updateCurrentCitations({});  // Reset citations
      updatePipelineSteps([]);
    } else if (payload.type === 'pipeline_step') {
      // Filter out generating steps — ThoughtStream doesn't render them
      if (payload.step === 'generating') return;

      if (payload.requestId && payload.requestId !== activeRequestIdRef.current) return;

      updatePipelineSteps(prev => {
        const existing = prev.findIndex(s => s.step === payload.step);
        const newStep = {
          step: payload.step,
          status: payload.status,
          data: payload.data || {},
          timestamp: Date.now()
        };
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = newStep;
          return updated;
        }
        return [...prev, newStep];
      });
      return;
    } else if (payload.type === 'ai_state') {
      // ai_state events are suppressed by the backend when pipeline is active.
      // Any that still arrive are ignored — pipeline_step events handle the UI now.
      return;
    } else if (payload.type === 'rag_sources') {
      // NEW: Live citations from backend
      console.log('📚 useChat: Received live citations:', payload.data ? Object.keys(payload.data).length : 0);
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
            
            
            // Save to session
            const sessionId = currentSessionIdRef.current;
            if (sessionId) {
              setSessions((prevSessions) => {
                try {
                  const result = updateSession(prevSessions, sessionId, updated);
                  return result;
                } catch (error) {
                  console.error('Fehler beim Aktualisieren der Nachricht mit Citations:', error);
                  return prevSessions;
                }
              });
            }
            
            return updated;
          }
          
          return prev;
        });
      }
    } else if (payload.type === 'metadata') {
      // Handle metadata payloads (steps/citations from backend)
      if (payload.requestId === activeRequestIdRef.current) {
        console.log('📊 useChat: Metadata received for request:', payload.requestId);
        // Prefer stepLabels (clean pipeline labels) over old-format steps
        if (payload.stepLabels && payload.stepLabels.length > 0) {
          updateCurrentSteps(payload.stepLabels);
        } else if (payload.steps && payload.steps.length > 0) {
          updateCurrentSteps(payload.steps);
        }
        if (payload.citations) {
          updateCurrentCitations(payload.citations);
        }
      }
    } else if (payload.type === 'error') {
      // Handle error payloads - match by requestId if provided
      if (!payload.requestId || payload.requestId === activeRequestIdRef.current) {
        console.error('❌ useChat: Error received:', payload.message);
        setIsLoading(false);
        setStreamingMessage('');
        setError(payload.message || 'Ein Fehler ist aufgetreten');
        setConnectionStatus('error');
        activeRequestIdRef.current = null; // Clear active request

        // Show error message to user
        if (appendMessageRef.current) {
          appendMessageRef.current(
            `Fehler: ${payload.message || 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.'}`,
            'bot'
          );
        }
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
      // Ignore chunks from stale requests
      if (payload.requestId && payload.requestId !== activeRequestIdRef.current) {
        console.log('📡 useChat: Ignoring stale streaming chunk for request:', payload.requestId);
        return;
      }
      console.log('📡 useChat: Streaming-Chunk erhalten:', payload.chunk?.substring(0, 30) + '...', 'done:', payload.done, 'isFunctionCall:', payload.isFunctionCall);

      // Zeige Function Call Indikator wenn nötig
      if (payload.isFunctionCall && !streamingMessage) {
        console.log('🔧 useChat: Function Call erkannt - zeige Indikator');
        setStreamingMessage('⏳');
        setIsLoading(true);
      }
      
      // Handle steps and citations from payload (when done=True or during streaming)
      // Prefer stepLabels (clean pipeline labels) over old-format steps
      if (payload.stepLabels && payload.stepLabels.length > 0) {
        updateCurrentSteps(payload.stepLabels);
      } else if (payload.steps && payload.steps.length > 0) {
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
          const baseMessage = prev === '⏳' ? '' : prev;
          const newMessage = baseMessage + payload.chunk;
          return newMessage;
        });
      }
      
      if (payload.done) {
        // Extract token usage info if present
        if (payload.tokens) {
          setTokenInfo(payload.tokens);
        }
        // CRITICAL: Don't set isLoading to false immediately - keep it true until message is saved
        // This ensures StreamingChatMessage continues to render with currentSteps/currentCitations
        // until the saved message is available with the same data
        setStreamingMessage((prev) => {
          if (prev && appendMessageRef.current) {
            // Ignoriere Function Call Indikator beim Speichern
            if (prev !== '⏳') {
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
              
              const finalStepLabels = payload.stepLabels || [];

              // CRITICAL: Always save steps and citations, even if empty, to maintain consistency
              // This ensures the ThoughtStream has the same data during streaming and after saving
              // Save full pipeline data for persistent ThoughtStream v5
              const finalPipelineData = pipelineStepsRef.current && pipelineStepsRef.current.length > 0
                ? pipelineStepsRef.current
                : null;
              appendMessageRef.current(prev, 'bot', finalSteps, finalCitations, activeRequestIdRef.current, finalStepLabels, finalPipelineData);

              // CRITICAL: Set isLoading to false AFTER message is saved
              // This ensures StreamingChatMessage continues to render until saved message is available
              setTimeout(() => {
                setIsLoading(false);
                // Reset tracking state after a delay to ensure message is saved
                updateCurrentSteps([]);
                updateCurrentCitations({});
                activeRequestIdRef.current = null; // Clear active request
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

          // 2a. Per-Card SQLite: Update section title
          if (cardSessionHookRef.current) {
            const cardId = cardSessionHookRef.current.currentCardId;
            if (cardId) {
              const section = cardContextHook.sections?.find(s => s.id === sectionId);
              if (section) {
                cardSessionHookRef.current.saveSection(cardId, { ...section, title });
              }
            }
          }

          // 2b. Speichere auch in der Session (für Persistenz - legacy)
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
    setIsLoading,
    streamingMessage,
    freeChatPushRef,
    currentSteps,  // NEW: Expose current steps for streaming
    currentCitations,  // NEW: Expose current citations for streaming
    pipelineSteps,  // NEW: Expose pipeline steps for ThoughtStream
    pipelineGeneration,  // Generation counter for ThoughtStream reset
    updatePipelineSteps,  // Expose for @Plusi synthetic pipeline in App.jsx
    error,  // NEW: Error state
    connectionStatus,  // NEW: Connection status
    appendMessage,
    appendMessageRef,
    handleSend,
    handleStopRequest,
    handleRetry,  // NEW: Retry function
    clearError,  // NEW: Clear error function
    handleAnkiReceive,
    tokenInfo
  };
}
