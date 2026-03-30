import { useState, useEffect, useCallback, useRef, startTransition } from 'react';
import { updateSession, updateSessionSections, createSession, findSessionByDeck } from '../utils/sessions';
import { getDirectCallPattern, findAgent, getDefaultAgent } from '@shared/config/subagentRegistry';
import useAgenticMessage from './useAgenticMessage';
import { useReasoningStore, useReasoningDispatch } from '../reasoning/store';

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
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [error, setError] = useState(null);  // NEW: Error state
  const [connectionStatus, setConnectionStatus] = useState('connected');  // NEW: Connection status: 'connected', 'connecting', 'error', 'disconnected'
  const [lastFailedMessage, setLastFailedMessage] = useState(null);  // NEW: Store last failed message for retry
  const [tokenInfo, setTokenInfo] = useState(null);  // Token usage info from backend

  // v2: Structured message state
  const agenticMsg = useAgenticMessage();
  const v2ActiveRef = useRef(false); // Ref for stale-closure-safe check in streaming handler

  // Reasoning store — pipeline steps are now centralized here
  const { state: reasoningState } = useReasoningStore();
  const reasoningDispatch = useReasoningDispatch();
  const reasoningStateRef = useRef(reasoningState);
  reasoningStateRef.current = reasoningState;

  // Local accumulator for pipeline steps — needed because reasoningStateRef
  // may be stale during msg_done (React hasn't re-rendered yet with store updates).
  // This ref accumulates steps synchronously as they arrive, ensuring finalize has data.
  const livePipelineStepsRef = useRef([]);
  const liveCitationsRef = useRef({});

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

    // Extract webSources from search_web tool markers in the message text
    let webSources = null;
    if (from === 'bot') {
      const toolMarkers = [...text.matchAll(/\[\[TOOL:(\{.*?\})\]\]/g)];
      for (const match of toolMarkers) {
        try {
          const toolData = JSON.parse(match[1]);
          if (toolData.name === 'search_web' && toolData.result?.sources) {
            webSources = toolData.result.sources;
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }

    const newMessage = {
      text,
      from,
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // Unique stable ID
      sectionId: currentSectionIdRef.current,  // Verwende Ref statt Props
      steps: stepLabels && stepLabels.length > 0 ? stepLabels : (steps || []),  // NEW: Reasoning steps (prefer stepLabels)
      citations: citations || {},  // NEW: Citations map
      request_id: requestId || activeRequestIdRef.current,  // Link to request
      pipeline_data: pipelineData,  // Full pipeline step data for persistent ThoughtStream
      ...(webSources ? { webSources } : {}),  // Web sources from search_web tool for [[WEB:N]] citations
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

    // Generate a unique request ID to correlate streaming/error/metadata responses
    const requestId = crypto.randomUUID?.() ||
                      `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    activeRequestIdRef.current = requestId;
    // Reset pipeline globals for new request
    window._livePipelineSteps = [];
    window._livePipelineCitations = {};

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
      // Default agent (Tutor) goes through normal sendMessage → handler.py routing
      // Only non-default agents use subagentDirect
      if (agent && !agent.isDefault) {
        // Emit synthetic orchestrating step via reasoning store
        const routerStreamId = `router-${requestId}`;
        reasoningDispatch({ type: 'STEP', streamId: routerStreamId, step: 'orchestrating', status: 'active', data: {} });

        // After 700ms, mark orchestrating as done with subagent info
        setTimeout(() => {
          reasoningDispatch({
            type: 'STEP', streamId: routerStreamId, step: 'orchestrating', status: 'done',
            data: { search_needed: false, retrieval_mode: `subagent:${agentName}`, response_length: 'short', scope: 'none', scope_label: '' }
          });
          reasoningDispatch({ type: 'AGENT_META', streamId: routerStreamId, agentName });
        }, 700);

        // Strip @Name prefix and route via generic bridge method
        const cleanText = text.replace(directCallPattern, '').trim() || text;
        if (bridge && bridge.subagentDirect) {
          bridge.subagentDirect(agentName, cleanText, JSON.stringify({}));
        } else {
        }
        return; // Skip normal sendMessage flow
      }
    }

    // Store message for potential retry
    setLastFailedMessage({ text, context });

    if (bridge && bridge.sendMessage) {
      try {
        bridge.sendMessage(text, conversationHistory, mode, requestId);
        setConnectionStatus('connected');
      } catch (err) {
        setError(err.message || 'Fehler beim Senden der Nachricht');
        setConnectionStatus('error');
        setIsLoading(false);
      }
    } else {
      setError('Bridge nicht verfügbar');
      setConnectionStatus('error');
      setIsLoading(false);
    }
  }, [bridge, currentSectionId, setSessions, cardContextHook]);
  
  // Anfrage abbrechen
  const handleStopRequest = useCallback(() => {
    setIsLoading(false);
    setStreamingMessage('');
    setError(null);
    activeRequestIdRef.current = null; // Clear active request on cancel
    if (bridge && bridge.cancelRequest) {
      bridge.cancelRequest();
    } else {
      if (appendMessageRef.current) {
        appendMessageRef.current('Anfrage abgebrochen.', 'bot');
      }
    }
  }, [bridge]);

  // NEW: Retry last failed message
  const handleRetry = useCallback(() => {
    if (lastFailedMessage) {
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
    // ── v2 Structured Message Events ──
    if (payload.type === 'msg_start') {
      agenticMsg.handleMsgStart(payload);
      v2ActiveRef.current = true; // Mark v2 active for stale-closure-safe checks
      // Don't return — let existing 'loading' handler also process if it follows
    }
    if (payload.type === 'orchestration') {
      agenticMsg.handleOrchestration(payload);
      return;
    }
    if (payload.type === 'agent_cell') {
      agenticMsg.handleAgentCell(payload);
      return;
    }
    if (payload.type === 'text_chunk') {
      agenticMsg.handleTextChunk(payload);
      return;
    }
    if (payload.type === 'msg_done') {
      // Finalize: build saved message from live state, then smooth transition.
      // finalize() marks currentMessage as 'done' (keeps it alive for one render)
      // while setMessages adds the saved version. A cleanup effect clears it later.
      const finalMsg = agenticMsg.finalize();
      if (finalMsg) {
        const primaryCell = finalMsg.agentCells[0];
        const agentName = primaryCell?.agent || 'tutor';
        const reqId = payload.requestId || activeRequestIdRef.current || '';
        // Read pipeline data from window globals (synchronous, no closure issues)
        const pipelineSteps = window._livePipelineSteps || [];
        const pipelineCitations = window._livePipelineCitations || {};
        // Fallback: try store ref (may be stale but better than nothing)
        const _rs = reasoningStateRef.current;
        const agentStreamId = agentName ? `${agentName}-${reqId}` : reqId;
        const agentStream = _rs.streams[agentStreamId];
        const routerStream = _rs.streams[`router-${reqId}`];
        const finalSteps = pipelineSteps.length > 0 ? pipelineSteps : (agentStream?.steps || []);
        const finalCitations = Object.keys(pipelineCitations).length > 0 ? pipelineCitations : (primaryCell?.citations || agentStream?.citations || {});
        const savedMsg = {
          id: finalMsg.id,
          text: primaryCell?.text || '',
          from: 'bot',
          steps: finalSteps.map(s => ({ state: s.data?.label || s.step, timestamp: s.timestamp })),
          citations: finalCitations,
          pipeline_data: finalSteps,
          orchestration_steps: routerStream?.steps || finalMsg.orchestration?.steps || [],
          agentCells: finalMsg.agentCells,
          orchestration: finalMsg.orchestration,
          ...(payload.webSources ? { webSources: payload.webSources } : {}),
        };
        // Add saved message FIRST, then clear live message in same batch
        setMessages(prev => [...prev, savedMsg]);
        // Persist bot message to SQLite
        if (cardSessionHookRef.current) {
          const cardId = cardSessionHookRef.current.currentCardId;
          if (cardId) {
            queueMicrotask(() => cardSessionHookRef.current?.saveMessage(cardId, savedMsg));
          }
        }
        // Reset window globals for next request
        window._livePipelineSteps = [];
        window._livePipelineCitations = {};
      }
      // currentMessage stays alive (status='done') — cleanup effect clears it next render
      // Clean up v1 loading state
      setIsLoading(false);
      setStreamingMessage('');
      v2ActiveRef.current = false;
      return;
    }
    if (payload.type === 'msg_error') {
      agenticMsg.cancel();
      setIsLoading(false);
      setStreamingMessage('');
      v2ActiveRef.current = false;
      return;
    }
    if (payload.type === 'msg_cancelled') {
      agenticMsg.cancel();
      setIsLoading(false);
      setStreamingMessage('');
      v2ActiveRef.current = false;
      return;
    }

    if (payload.type === 'loading') {
      setIsLoading(true);
      setStreamingMessage('');
    } else if (payload.type === 'pipeline_step') {
      // Pipeline steps are now handled by the centralized reasoning store (dispatched in App.jsx).
      // Still forward to agenticMsg for agent cell status transitions (loading → thinking).
      agenticMsg.handlePipelineStep(payload);
      // Accumulate steps on window for finalize — guaranteed synchronous, no closure issues
      if (payload.step !== 'orchestrating' && payload.step !== 'router') {
        if (!window._livePipelineSteps) window._livePipelineSteps = [];
        const arr = window._livePipelineSteps;
        const stepObj = { step: payload.step, status: payload.status, data: payload.data || {}, timestamp: Date.now() };
        const existing = arr.findIndex(s => s.step === payload.step);
        if (existing >= 0) arr[existing] = stepObj;
        else arr.push(stepObj);
        // Capture citations from sources_ready
        if (payload.step === 'sources_ready' && payload.data?.citations) {
          window._livePipelineCitations = { ...(window._livePipelineCitations || {}), ...payload.data.citations };
        }
      }
      return;
    } else if (payload.type === 'ai_state') {
      // ai_state events are suppressed by the backend when pipeline is active.
      // Any that still arrive are ignored — pipeline_step events handle the UI now.
      return;
    } else if (payload.type === 'rag_sources') {
      // Live citations from backend
      if (payload.data) {
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
            const updated = [...prev];
            // Merge citations (don't overwrite, merge in case some were already there)
            const mergedCitations = { ...(lastMessage.citations || {}), ...payload.data };

            updated[lastBotMessageIndex] = {
              ...lastMessage,
              citations: mergedCitations,
            };

            // Save to session
            const sessionId = currentSessionIdRef.current;
            if (sessionId) {
              setSessions((prevSessions) => {
                try {
                  const result = updateSession(prevSessions, sessionId, updated);
                  return result;
                } catch (error) {
                  return prevSessions;
                }
              });
            }

            return updated;
          }

          return prev;
        });
        // v2: Forward citations to structured message hook
        agenticMsg.handleCitations({ data: payload.data });
      }
    } else if (payload.type === 'metadata') {
      // Metadata payloads — steps/citations now handled by reasoning store.
      // Keep handler for any future metadata fields.
    } else if (payload.type === 'error') {
      // Handle error payloads - match by requestId if provided
      if (!payload.requestId || payload.requestId === activeRequestIdRef.current) {
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
        return;
      }

      // v2: Skip most v1 chunk processing when structured message system is active
      // BUT still accumulate text in streamingMessage as a fallback for rendering
      if (v2ActiveRef.current) {
        if (!payload.done && payload.chunk && !payload.isFunctionCall) {
          setStreamingMessage(prev => (prev || '') + payload.chunk);
        }
        return;
      }

      // Zeige Function Call Indikator wenn nötig
      if (payload.isFunctionCall && !streamingMessage) {
        setStreamingMessage('⏳');
        setIsLoading(true);
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
        // v2: Skip v1 save when structured message system is active
        if (v2ActiveRef.current) {
          return;
        }
        // Extract token usage info if present
        if (payload.tokens) {
          setTokenInfo(payload.tokens);
        }
        // CRITICAL: Don't set isLoading to false immediately - keep it true until message is saved
        // This ensures StreamingChatMessage continues to render until the saved message is available
        setStreamingMessage((prev) => {
          if (prev && appendMessageRef.current) {
            // Ignoriere Function Call Indikator beim Speichern
            if (prev !== '⏳') {
              // Read pipeline data from reasoning store for persistence
              const _rs = reasoningStateRef.current;
              const reqId = activeRequestIdRef.current || '';
              // Find agent stream — look for any stream matching the request ID
              let storeSteps = [];
              let storeCitations = {};
              for (const [sid, stream] of Object.entries(_rs.streams)) {
                if (sid.endsWith(`-${reqId}`) && sid !== `router-${reqId}`) {
                  storeSteps = stream.steps || [];
                  storeCitations = stream.citations || {};
                  break;
                }
              }

              // Build final steps: prefer payload, fallback to store
              let finalSteps = (payload.steps && payload.steps.length > 0)
                ? payload.steps
                : storeSteps.map(s => ({ state: s.data?.label || s.step, timestamp: s.timestamp }));

              const finalCitations = (payload.citations && Object.keys(payload.citations).length > 0)
                ? payload.citations
                : (Object.keys(storeCitations).length > 0 ? storeCitations : {});

              // ROBUST FALLBACK: If steps are missing but we have citations, generate synthetic steps
              if (finalSteps.length === 0 && Object.keys(finalCitations).length > 0) {
                finalSteps = [
                  { state: 'Intent: Analyse', timestamp: Date.now() - 2000 },
                  { state: `Wissensabruf: ${Object.keys(finalCitations).length} relevante Karten gefunden`, timestamp: Date.now() - 1000 }
                ];
              } else if (finalSteps.length === 0) {
                finalSteps = [{ state: 'Antwort generiert', timestamp: Date.now() }];
              }

              const finalStepLabels = payload.stepLabels || [];
              const finalPipelineData = storeSteps.length > 0 ? storeSteps : null;
              appendMessageRef.current(prev, 'bot', finalSteps, finalCitations, activeRequestIdRef.current, finalStepLabels, finalPipelineData);

              // CRITICAL: Set isLoading to false AFTER message is saved
              setTimeout(() => {
                setIsLoading(false);
                activeRequestIdRef.current = null;
                setStreamingMessage('');
              }, 500);

              return prev; // Keep streaming message visible until timeout
            }
          }
          return '';
        });
      }
    } else if (payload.type === 'sectionTitleGenerated') {
      // Verarbeite KI-generierten Section-Titel
      
      if (!payload.data) {
        return;
      }
      
      if (payload.data.success === false) {
        // Fehler bei Titel-Generierung
        const error = payload.data.error || 'Unbekannter Fehler';
        
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
            setSessions(prevSessions => {
              const currentSession = prevSessions.find(s => s.id === sessionId);
              if (!currentSession) {
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
        }
      } else {
      }
    }
  }, [cardContextHook]);
  
  return {
    messages,
    setMessages,
    isLoading,
    setIsLoading,
    streamingMessage,
    error,
    connectionStatus,
    appendMessage,
    appendMessageRef,
    handleSend,
    handleStopRequest,
    handleRetry,
    clearError,
    handleAnkiReceive,
    tokenInfo,
    // v2 structured message
    currentMessage: agenticMsg.currentMessage,
    pipelineGenerationV2: agenticMsg.pipelineGeneration,
    cancelCurrentMessage: agenticMsg.cancel,
  };
}
