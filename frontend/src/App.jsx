import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAnki } from './hooks/useAnki';
import { useChat } from './hooks/useChat';
import { useSessions } from './hooks/useSessions';
import { useDeckTracking } from './hooks/useDeckTracking';
import { useCardContext } from './hooks/useCardContext';
import { useModels } from './hooks/useModels';
import { SessionContextProvider, useSessionContext } from './contexts/SessionContext';
import Header from './components/Header';
import SessionHeader from './components/SessionView/SessionHeader';
import ChatMessage from './components/ChatMessage';
import StreamingChatMessage from './components/StreamingChatMessage';
import ChatInput from './components/ChatInput';
import ProfileDialog from './components/ProfileDialog';
import ThoughtStream from './components/ThoughtStream';
import SessionOverview from './components/SessionOverview';
import CardPreviewModal from './components/CardPreviewModal';
import SessionList from './components/SessionView/SessionList';
import CardContext from './components/CardContext';
import ErrorBoundary from './components/ErrorBoundary';
import PaywallModal from './components/PaywallModal';
import { Sparkles, Brain, BookOpen } from 'lucide-react';

/**
 * Inner App Component - wrapped by SessionContextProvider
 */
function AppInner() {
  const { bridge, isReady } = useAnki();
  const sessionContext = useSessionContext();
  
  // Settings State
  const [showProfile, setShowProfile] = useState(false);
  
  // Auth State für Quota-Anzeige
  const [authStatus, setAuthStatus] = useState({
    authenticated: false,
    hasToken: false,
    backendUrl: '',
    backendMode: false
  });
  const [currentAuthToken, setCurrentAuthToken] = useState('');
  
  // Lade Auth-Status
  useEffect(() => {
    if (bridge && bridge.getAuthStatus) {
      const checkAuth = () => {
        try {
          const statusStr = bridge.getAuthStatus();
          if (statusStr) {
            const status = JSON.parse(statusStr);
            setAuthStatus(status);
          }
        } catch (e) {
          console.error('Fehler beim Laden des Auth-Status:', e);
        }
      };
      
      checkAuth();
      const interval = setInterval(checkAuth, 30000);
      return () => clearInterval(interval);
    }
  }, [bridge]);
  
  // Lade Auth-Token
  useEffect(() => {
    if (bridge && bridge.getAuthToken) {
      bridge.getAuthToken();
    }
  }, [bridge]);
  
  // Höre auf auth Events
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.detail && event.detail.type === 'authTokenLoaded' && event.detail.data) {
        setCurrentAuthToken(event.detail.data.token || '');
      } else if (event.detail && event.detail.type === 'auth_success') {
        if (bridge && bridge.getAuthStatus) {
          try {
            const statusStr = bridge.getAuthStatus();
            if (statusStr) {
              const status = JSON.parse(statusStr);
              setAuthStatus(status);
            }
          } catch (e) {
            console.error('Fehler beim Laden des Auth-Status:', e);
          }
        }
        if (bridge && bridge.getAuthToken) {
          bridge.getAuthToken();
        }
      }
    };
    
    const originalAnkiReceive = window.ankiReceive;
    window.ankiReceive = (payload) => {
      if (originalAnkiReceive) {
        originalAnkiReceive(payload);
      }
      if (payload.type === 'authTokenLoaded' && payload.data) {
        setCurrentAuthToken(payload.data.token || '');
      } else if (payload.type === 'auth_success') {
        if (bridge && bridge.getAuthStatus) {
          try {
            const statusStr = bridge.getAuthStatus();
            if (statusStr) {
              const status = JSON.parse(statusStr);
              setAuthStatus(status);
            }
          } catch (e) {
            console.error('Fehler beim Laden des Auth-Status:', e);
          }
        }
        if (bridge && bridge.getAuthToken) {
          bridge.getAuthToken();
        }
      }
    };
    
    window.addEventListener('ankiMessage', handleMessage);
    return () => {
      window.removeEventListener('ankiMessage', handleMessage);
      window.ankiReceive = originalAnkiReceive;
    };
  }, [bridge]);
  
  // Premium State - Lade aus localStorage beim Start
  const [isPremium, setIsPremium] = useState(() => {
    try {
      const saved = localStorage.getItem('anki_premium_status');
      return saved === 'true';
    } catch (e) {
      return false;
    }
  });
  const [showPaywall, setShowPaywall] = useState(false);
  
  // Custom Hooks
  const modelsHook = useModels(bridge);
  const sessionsHook = useSessions(bridge, isReady);
  const cardContextHook = useCardContext();
  // Create a setSessions wrapper that works with SessionContext
  const setSessionsWrapper = useCallback((updater) => {
    if (typeof updater === 'function') {
      const updatedSessions = updater(sessionContext.sessions);
      sessionContext.setSessions(updatedSessions);
      
      // If current session was updated, sync it
      if (sessionContext.currentSession) {
        const updated = updatedSessions.find(s => s.id === sessionContext.currentSession.id);
        if (updated) {
          sessionContext.setCurrentSession(updated);
        }
      }
    } else {
      sessionContext.setSessions(updater);
    }
  }, [sessionContext]);
  
  // Übergebe cardContextHook an useChat für Section-Erstellung bei erster Nachricht
  // Use SessionContext's currentSessionId and wrapper
  const chatHook = useChat(bridge, sessionContext.currentSessionId, setSessionsWrapper, cardContextHook.currentSectionId, cardContextHook);
  // DEPRECATED: useDeckTracking is being phased out in favor of SessionContext
  // Keep for backward compatibility during migration
  const deckTrackingHook = useDeckTracking(
    bridge,
    isReady,
    sessionContext.sessions,
    sessionsHook.forceShowOverview,
    sessionContext.currentSessionId,
    chatHook.messages,
    (id) => sessionContext.setCurrentSession(sessionContext.sessions.find(s => s.id === id) || null),
    chatHook.setMessages,
    sessionContext.setSessions,
    cardContextHook.setSections,
    cardContextHook.setCurrentSectionId,
    sessionsHook.setForceShowOverview
  );
  
  // Ref für window.ankiReceive
  const bridgeRef = useRef(bridge);
  const ankiReceiveRef = useRef(false);
  // Ref für messages container (für Auto-Scroll)
  const messagesContainerRef = useRef(null);
  // Ref für Header-Höhe (für sticky section headers)
  const headerRef = useRef(null);
  const [headerHeight, setHeaderHeight] = useState(60); // Default fallback
  // Viewport height für minHeight-Berechnung
  const [viewportHeight, setViewportHeight] = useState(typeof window !== 'undefined' ? window.innerHeight : 800);
  // Ref für die letzte gesendete User-Nachricht ID (für Scroll-to-Top)
  const lastUserMessageIdRef = useRef(null);
  // Ref für Interaction Container (für Scroll-to-Top)
  const interactionContainerRef = useRef(null);
  // Ref für vorherige Messages-Länge (für ResizeObserver)
  const prevMessagesLengthRef = useRef(0);
  // Performance: Lazy loading state - how many messages to render initially
  const [visibleMessageCount, setVisibleMessageCount] = useState(20);
  const loadMoreTriggerRef = useRef(null);

  // Card Preview State
  const [previewCard, setPreviewCard] = useState(null);

  // Handler for opening card preview
  const handlePreviewCard = useCallback((cardData) => {
    console.log('🔍 Opening preview for card:', cardData);
    // #region agent log
    if (window.ankiBridge && window.ankiBridge.addMessage) {
      window.ankiBridge.addMessage('debugLog', JSON.stringify({location:'App.jsx:98',message:'handlePreviewCard called',data:{cardData:cardData?{cardId:cardData.cardId,noteId:cardData.noteId,id:cardData.id}:null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'}));
    }
    // #endregion
    setPreviewCard(cardData);
  }, []);
  
  // Zeige Session-Übersicht wenn explizit angefordert ODER wenn keine Session aktiv ist
  // Use SessionContext for current session state
  const showSessionOverview = sessionsHook.forceShowOverview || !sessionContext.currentSession;
  
  useEffect(() => {
    bridgeRef.current = bridge;
  }, [bridge]);
  
  // Measure header height for sticky positioning
  useEffect(() => {
    const measureHeader = () => {
      if (headerRef.current) {
        const height = headerRef.current.offsetHeight;
        setHeaderHeight(height);
      }
    };
    
    measureHeader();
    // Re-measure on window resize
    window.addEventListener('resize', measureHeader);
    return () => window.removeEventListener('resize', measureHeader);
  }, [showSessionOverview]);

  // Measure viewport height for minHeight calculation
  useEffect(() => {
    const updateViewportHeight = () => {
      setViewportHeight(window.innerHeight);
    };
    
    updateViewportHeight();
    window.addEventListener('resize', updateViewportHeight);
    return () => window.removeEventListener('resize', updateViewportHeight);
  }, []);
  
  // REMOVED: scrollToBottom - no longer needed with Interaction Container approach

  // Scroll to Interaction Container: Scrollt den Interaction Container an die Spitze des Viewports
  const scrollToInteractionContainer = useCallback(() => {
    if (!messagesContainerRef.current || !interactionContainerRef.current) {
      console.warn('🔍 scrollToInteractionContainer: Missing container or interaction container');
      return;
    }
    
    console.log('🔍 scrollToInteractionContainer: Starting scroll to interaction container');
    
    // Versuche mehrfach, das Element zu finden (mit Retry-Logik)
    const attemptScroll = (attempt = 0, maxAttempts = 10) => {
      const container = messagesContainerRef.current;
      const interactionContainer = interactionContainerRef.current;
      
      if (!container || !interactionContainer) {
        if (attempt < maxAttempts) {
          // Retry nach kurzer Verzögerung
          setTimeout(() => attemptScroll(attempt + 1, maxAttempts), 50);
          return;
        }
        console.warn('🔍 scrollToInteractionContainer: Container not found after', maxAttempts, 'attempts');
        return;
      }
      
      // Warte auf DOM-Update
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Berechne Position: Container soll direkt unter dem Header sein
          const elementOffsetTop = interactionContainer.offsetTop;
          const targetScrollTop = elementOffsetTop - headerHeight - 8; // 8px Abstand unter Header
          
          // CRITICAL: Use instant scroll first to avoid visual jumping, then smooth if needed
          // Set position immediately to prevent glitch
          container.scrollTop = Math.max(0, targetScrollTop);
          
          // Then apply smooth scroll if position is correct
          requestAnimationFrame(() => {
            container.scrollTo({
              top: Math.max(0, targetScrollTop),
              behavior: 'smooth'
            });
          });
        });
      });
    };
    
    // Starte Scroll-Versuch nach DOM-Update
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        attemptScroll();
      });
    });
  }, [headerHeight]);

  // Scroll to Last User Message: Scrollt zur letzten User-Nachricht beim Öffnen einer Session
  const scrollToLastUserMessage = useCallback(() => {
    if (!messagesContainerRef.current) {
      console.warn('🔍 scrollToLastUserMessage: Missing container');
      return;
    }
    
    const container = messagesContainerRef.current;
    
    // Versuche mehrfach, das Element zu finden (mit Retry-Logik)
    const attemptScroll = (attempt = 0, maxAttempts = 15) => {
      // Finde alle User-Messages
      const userMessages = Array.from(container.querySelectorAll('[data-message-from="user"]'));
      
      if (userMessages.length === 0) {
        if (attempt < maxAttempts) {
          // Retry nach kurzer Verzögerung
          setTimeout(() => attemptScroll(attempt + 1, maxAttempts), 100);
          return;
        }
        console.warn('🔍 scrollToLastUserMessage: No user messages found after', maxAttempts, 'attempts');
        // Fallback: Scroll nach unten
        container.scrollTo({
          top: container.scrollHeight,
          behavior: 'smooth'
        });
        return;
      }
      
      // Nimm die letzte User-Message
      const lastUserMessage = userMessages[userMessages.length - 1];
      
      // Warte auf DOM-Update
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Berechne Position: Message soll direkt unter dem Header sein
          const elementOffsetTop = lastUserMessage.offsetTop;
          const targetScrollTop = elementOffsetTop - headerHeight - 8; // 8px Abstand unter Header
          
          // CRITICAL: Use instant scroll first to avoid visual jumping
          // Set position immediately to prevent glitch, then smooth if needed
          container.scrollTop = Math.max(0, targetScrollTop);
          requestAnimationFrame(() => {
            container.scrollTo({
              top: Math.max(0, targetScrollTop),
              behavior: 'smooth'
            });
          });
        });
      });
    };
    
    // Starte Scroll-Versuch nach DOM-Update
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        attemptScroll();
      });
    });
  }, [headerHeight]);
  
  // WICHTIG: Definiere window.ankiReceive SOFORT (außerhalb von useEffect) um Race Conditions zu vermeiden
  // Python ruft dies auf, bevor React gerendert hat
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Initialisiere Queue nur einmal
    if (!window._ankiReceiveQueue) {
      window._ankiReceiveQueue = [];
    }
    
    // Definiere die vollständige Handler-Funktion nur einmal
    if (!ankiReceiveRef.current) {
    // Store original handler (from main.jsx) to call it first
    const originalMainHandler = window.ankiReceive;
    window.ankiReceive = (payload) => {
      console.error('🔵 DEBUG App.jsx: ankiReceive aufgerufen:', payload?.type, payload);
      console.log('🔵 App.jsx: ankiReceive aufgerufen:', payload.type, payload);
      
      if (!payload || typeof payload !== 'object') {
        console.warn('⚠️ App.jsx: Ungültiges Payload:', payload);
        return;
      }
      
      // CRITICAL: Process sessionsLoaded and deckSelected immediately, don't queue them
      // These events are time-sensitive and need to be processed as soon as possible
      if (payload.type === 'sessionsLoaded') {
        console.error('🔵 DEBUG App.jsx: Processing sessionsLoaded IMMEDIATELY', payload.data?.length);
        window.dispatchEvent(new CustomEvent('sessionsLoaded', { 
          detail: { sessions: payload.data || [] } 
        }));
      }
      
      if (payload.type === 'deckSelected') {
        console.error('🔵 DEBUG App.jsx: Processing deckSelected IMMEDIATELY', payload.data);
        window.dispatchEvent(new CustomEvent('deckSelected', { 
          detail: payload.data 
        }));
      }
      
      // If original handler exists and it's the queue handler, call it for other events
      // This ensures other events are queued if React isn't ready yet
      if (originalMainHandler && typeof originalMainHandler === 'function') {
        try {
          originalMainHandler(payload);
        } catch (e) {
          console.error('🔵 DEBUG App.jsx: Error calling original handler', e);
        }
      }

        // Models Events
        modelsHook.handleAnkiReceive(payload);
        
        // Chat Events
        // #region agent log
        if (payload.type === 'ai_state') {
          const timestamp = Date.now();
          fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.jsx:283',message:'Calling chatHook.handleAnkiReceive for ai_state',data:{payloadType:payload.type,payloadMessage:payload.message,chatHookExists:!!chatHook,handleAnkiReceiveExists:!!chatHook?.handleAnkiReceive},timestamp:timestamp,sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        }
        // #endregion
        chatHook.handleAnkiReceive(payload);
        
        // Deck Events
        if (payload.type === 'currentDeck') {
          console.log('📚 App.jsx: Aktuelles Deck erhalten:', payload.data);
          deckTrackingHook.setCurrentDeck(payload.data);
          deckTrackingHook.handleDeckChange(payload.data);
        } else if (payload.type === 'availableDecks') {
          console.log('📚 App.jsx: Verfügbare Decks erhalten:', payload.data?.decks?.length || 0);
        } else if (payload.type === 'openDeck') {
          // WICHTIG: Wenn ein Deck geöffnet wird, sofort getCurrentDeck aufrufen
          // um die Session zu laden (nicht auf Polling warten)
          console.log('📚 App.jsx: Deck geöffnet, hole aktuelle Deck-Info...');
          const currentBridge = bridgeRef.current;
          if (currentBridge && currentBridge.getCurrentDeck) {
            // Kleine Verzögerung, damit Anki das Deck vollständig geöffnet hat
            setTimeout(() => {
              currentBridge.getCurrentDeck();
            }, 300);
          }
        }
        
        // Card Context Events - forward to SessionContext for seenCardIds tracking
        if (payload.type === 'cardContext') {
          cardContextHook.handleCardContext(payload.data);
          // Forward cardId to SessionContext for tracking
          if (payload.data && payload.data.cardId) {
            sessionContext.handleCardShown(payload.data.cardId);
          }
        }
        
        // Section Title Events
        if (payload.type === 'sectionTitleGenerated') {
          console.log('🏷️ App.jsx: Section-Titel erhalten:', payload.data);
          // Delegate an useChat
          chatHook.handleAnkiReceive(payload);
        }
        
        // Sessions Events - Sessions wurden von Python geladen
        if (payload.type === 'sessionsLoaded') {
          console.log('📚 App.jsx: Sessions geladen:', payload.data?.length || 0);
          // #region agent log
          const timestamp = Date.now();
          console.error('🔵 DEBUG: sessionsLoaded event received in App.jsx', {
            payloadDataType: typeof payload.data,
            payloadDataIsArray: Array.isArray(payload.data),
            payloadDataLength: Array.isArray(payload.data) ? payload.data.length : null,
            hasPayloadData: !!payload.data
          });
          fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.jsx:431',message:'sessionsLoaded event received in App.jsx',data:{payloadDataType:typeof payload.data,payloadDataIsArray:Array.isArray(payload.data),payloadDataLength:Array.isArray(payload.data)?payload.data.length:null,hasPayloadData:!!payload.data},timestamp:timestamp,sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          // Sessions werden direkt in useSessions verarbeitet via Event
          // #region agent log
          const timestamp2 = Date.now();
          console.error('🔵 DEBUG: Dispatching sessionsLoaded CustomEvent', {
            sessionsCount: Array.isArray(payload.data) ? payload.data.length : 0
          });
          fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.jsx:433',message:'Dispatching sessionsLoaded CustomEvent',data:{sessionsCount:Array.isArray(payload.data)?payload.data.length:0},timestamp:timestamp2,sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          window.dispatchEvent(new CustomEvent('sessionsLoaded', { 
            detail: { sessions: payload.data || [] } 
          }));
        }
        
        // Deck Events - deckSelected
        if (payload.type === 'deckSelected') {
          // #region agent log
          console.error('🔵 DEBUG: deckSelected event received in App.jsx', {
            deckId: payload.data?.deckId,
            deckName: payload.data?.deckName,
            hasData: !!payload.data
          });
          // #endregion
        }
        
        // Card Details Events - Karten-Details wurden geladen
        if (payload.type === 'cardDetails') {
          console.log('🔍 App.jsx: Card Details erhalten:', payload.data);
          // Rufe Callback auf, falls vorhanden
          if (window._getCardDetailsCallbacks && payload.callbackId) {
            const callback = window._getCardDetailsCallbacks[payload.callbackId];
            if (callback) {
              delete window._getCardDetailsCallbacks[payload.callbackId];
              callback.resolve(JSON.stringify(payload.data));
            }
          }
        }
        
        // Save Multiple Choice Result
        if (payload.type === 'saveMultipleChoiceResult') {
          console.log('💾 App.jsx: Save Multiple Choice Result erhalten:', payload.data);
          if (window._saveMultipleChoiceCallbacks && payload.callbackId) {
            const callback = window._saveMultipleChoiceCallbacks[payload.callbackId];
            if (callback) {
              delete window._saveMultipleChoiceCallbacks[payload.callbackId];
              callback(JSON.stringify(payload.data));
            }
          }
        }
        
        // Load Multiple Choice Result
        if (payload.type === 'loadMultipleChoiceResult') {
          console.log('📥 App.jsx: Load Multiple Choice Result erhalten:', payload.data);
          if (window._loadMultipleChoiceCallbacks && payload.callbackId) {
            const callback = window._loadMultipleChoiceCallbacks[payload.callbackId];
            if (callback) {
              delete window._loadMultipleChoiceCallbacks[payload.callbackId];
              callback(JSON.stringify(payload.data));
            }
          }
        }
        
        // Has Multiple Choice Result
        if (payload.type === 'hasMultipleChoiceResult') {
          console.log('❓ App.jsx: Has Multiple Choice Result erhalten:', payload.data);
          if (window._hasMultipleChoiceCallbacks && payload.callbackId) {
            const callback = window._hasMultipleChoiceCallbacks[payload.callbackId];
            if (callback) {
              delete window._hasMultipleChoiceCallbacks[payload.callbackId];
              callback(JSON.stringify(payload.data));
            }
          }
        }
        
        // Deck Stats Events - Deck-Statistiken wurden geladen
        if (payload.type === 'deckStats') {
          console.log('📊 App.jsx: Deck-Statistiken erhalten:', payload.deckId);
          window.dispatchEvent(new CustomEvent('deckStats', { 
            detail: { deckId: payload.deckId, data: payload.data } 
          }));
        }
        
        // Image Loaded Events - Bilder wurden über Python-Proxy geladen
        if (payload.type === 'imageLoaded') {
          console.error('🖼️ App.jsx: Bild-Event empfangen, dispatching event:', payload.url?.substring(0, 50), 'success:', payload.data?.success, 'error:', payload.data?.error);
          window.dispatchEvent(new CustomEvent('imageLoaded', { 
            detail: { url: payload.url, data: payload.data } 
          }));
          console.error('🖼️ App.jsx: Event dispatched');
        }
        
        // AI State Events - RAG Pipeline Status Updates
        // CRITICAL: Handle ai_state BEFORE the general chatHook.handleAnkiReceive call
        // to ensure it's processed even if the callback is stale
        if (payload.type === 'ai_state') {
          console.log('🤖 App.jsx: AI State Update:', payload.message);
          // #region agent log
          const timestamp = Date.now();
          fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.jsx:354',message:'ai_state event received in App.jsx',data:{message:payload.message,chatHookExists:!!chatHook,handleAnkiReceiveExists:!!chatHook?.handleAnkiReceive},timestamp:timestamp,sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          // CRITICAL: Explicitly forward to chatHook to ensure steps are tracked
          // Call it directly here to ensure it's processed
          if (chatHook && chatHook.handleAnkiReceive) {
            chatHook.handleAnkiReceive(payload);
          }
          // Dispatch event für optionales UI-Feedback (z.B. Loading-Indikator mit Status)
          window.dispatchEvent(new CustomEvent('aiStateUpdate', { 
            detail: { message: payload.message } 
          }));
        }
        
        // Init Event - spezielle Behandlung
        if (payload.type === 'init') {
          // Setze aktuelles Deck
          if (payload.currentDeck) {
            deckTrackingHook.setCurrentDeck(payload.currentDeck);
            deckTrackingHook.handleDeckChange(payload.currentDeck);
          }
          
          // Initiale Nachricht
          if (payload.message && payload.currentDeck?.isInDeck) {
            if (chatHook.appendMessageRef.current) {
              chatHook.appendMessageRef.current(payload.message, 'bot');
            }
        }
      }
      };
      ankiReceiveRef.current = true;
    }
    
    // Function to process queued messages
    const processQueue = () => {
      if (window._ankiReceiveQueue && window._ankiReceiveQueue.length > 0) {
        console.error('🔵 DEBUG App.jsx: Processing queued messages', window._ankiReceiveQueue.length);
        const queued = window._ankiReceiveQueue.splice(0);
        queued.forEach(payload => {
          console.error('🔵 DEBUG App.jsx: Processing queued payload', payload?.type);
          // Process ALL queued messages, not just 'init'
          if (payload.type === 'sessionsLoaded') {
            console.error('🔵 DEBUG App.jsx: Processing queued sessionsLoaded', payload.data?.length);
            // Handle sessionsLoaded from queue
            window.dispatchEvent(new CustomEvent('sessionsLoaded', { 
              detail: { sessions: payload.data || [] } 
            }));
        } else if (payload.type === 'deckSelected') {
          console.error('🔵 DEBUG App.jsx: Processing queued deckSelected', payload.data);
          // Handle deckSelected from queue - dispatch event for SessionContext
          window.dispatchEvent(new CustomEvent('deckSelected', { 
            detail: payload.data 
          }));
        } else if (payload.type === 'init') {
            modelsHook.handleAnkiReceive(payload);
            if (payload.currentDeck) {
              deckTrackingHook.setCurrentDeck(payload.currentDeck);
              deckTrackingHook.handleDeckChange(payload.currentDeck);
            }
          }
        });
      }
    };
    
    // Process queue immediately
    console.error('🔵 DEBUG App.jsx: Initial queue processing, queue length:', window._ankiReceiveQueue?.length || 0);
    processQueue();
    
    // Also poll the queue periodically to catch events that arrive after initial render
    const queuePollInterval = setInterval(() => {
      if (window._ankiReceiveQueue && window._ankiReceiveQueue.length > 0) {
        console.error('🔵 DEBUG App.jsx: Polling found queued messages', window._ankiReceiveQueue.length);
      }
      processQueue();
    }, 100); // Check every 100ms
    
    // Store interval ID for cleanup
    window._ankiReceiveQueuePollInterval = queuePollInterval;
    console.error('🔵 DEBUG App.jsx: Queue polling started');

    return () => {
      // Cleanup: Clear polling interval
      if (window._ankiReceiveQueuePollInterval) {
        clearInterval(window._ankiReceiveQueuePollInterval);
        window._ankiReceiveQueuePollInterval = null;
      }
    };
  }, [modelsHook, chatHook, deckTrackingHook, cardContextHook]);
  
  // Hole aktuelles Deck-Info beim Start
  useEffect(() => {
    if (isReady && bridge && bridge.getCurrentDeck) {
      bridge.getCurrentDeck();
    }
  }, [isReady, bridge]);
  
  // DISABLED: Auto-Scroll nach unten wenn Antwort fertig ist
  // Während Generation bleibt die View am Top des Interaction Containers
  // Kein automatisches Scrollen mehr

  // ResizeObserver für stabile Scroll-Position: Hält User-Frage am oberen Rand
  // Reagiert auf Layout-Änderungen (z.B. ThoughtStream expandiert/kollabiert)
  useEffect(() => {
    const container = messagesContainerRef.current;
    const interactionContainer = interactionContainerRef.current;
    
    if (!container || !interactionContainer) return;
    
    // Finde die User-Nachricht im Interaction Container
    const findUserMessage = () => {
      return interactionContainer.querySelector('[data-message-from="user"]');
    };
    
    // Scroll-Funktion: Hält User-Frage am oberen Rand (unter Header)
    const scrollToUserMessage = () => {
      const userMessage = findUserMessage();
      if (!userMessage) return;
      
      // Nutze scrollIntoView mit block: 'start' für präzise Positionierung
      userMessage.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
        inline: 'nearest'
      });
    };
    
    // ResizeObserver: Überwacht Höhenänderungen des Interaction Containers
    const resizeObserver = new ResizeObserver((entries) => {
      // Nur scrollen wenn eine neue Nachricht pending ist oder während Generation
      if (lastUserMessageIdRef.current === 'pending' || chatHook.isLoading || chatHook.streamingMessage) {
        // Warte auf nächsten Frame für stabile Position
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            scrollToUserMessage();
          });
        });
      }
    });
    
    // Beobachte den Interaction Container
    resizeObserver.observe(interactionContainer);
    
    // Initialer Scroll wenn neue User-Nachricht
    const checkNewMessage = () => {
      const currentLength = chatHook.messages.length;
      const prevLength = prevMessagesLengthRef.current;
      
      if (currentLength > prevLength && lastUserMessageIdRef.current === 'pending') {
        console.log('🔍 Interaction Container: New user message detected, scrolling to container');
        // Sofort scrollen, dann Observer übernimmt
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            scrollToUserMessage();
            lastUserMessageIdRef.current = null; // Reset pending flag
          });
        });
      }
      
      prevMessagesLengthRef.current = currentLength;
    };
    
    // Prüfe auf neue Nachrichten
    checkNewMessage();
    
    // Cleanup
    return () => {
      resizeObserver.disconnect();
    };
  }, [chatHook.messages, chatHook.isLoading, chatHook.streamingMessage]);
  
  // Active Section Detection using IntersectionObserver
  // More reliable than scroll events, better performance, no flickering
  const [activeStickyHeaderId, setActiveStickyHeaderId] = useState(null);
  
  useEffect(() => {
    if (!messagesContainerRef.current || chatHook.messages.length === 0) {
      setActiveStickyHeaderId(null);
      return;
    }
    
    const container = messagesContainerRef.current;
    const headers = Array.from(container.querySelectorAll('[data-section-id]'));
    
    if (headers.length === 0) {
      setActiveStickyHeaderId(null);
      return;
    }
    
    // Improved IntersectionObserver Strategy:
    // rootMargin: "0px 0px -95% 0px" - focus on top 5% of viewport for more precise detection
    // This ensures we detect headers exactly when they reach the header position
    // threshold: [0, 0.05, 0.1, 0.2] - more thresholds for better detection
    
    const observerOptions = {
      root: container,
      rootMargin: '0px 0px -95% 0px', // More precise: top 5% of viewport
      threshold: [0, 0.05, 0.1, 0.2] // More thresholds for better detection
    };
    
    // Track which headers are intersecting and their positions
    const headerStates = new Map();
    let updateTimeout = null;
    
    const updateActiveHeader = () => {
      // Clear any pending update
      if (updateTimeout) {
        clearTimeout(updateTimeout);
      }
      
      // Faster debounce: 10ms instead of 30ms for more responsive updates
      updateTimeout = setTimeout(() => {
        const containerRect = container.getBoundingClientRect();
        const headerHeight = headerRef.current?.offsetHeight || 60;
        // stickyThreshold is exactly the header bottom edge - when section header bottom reaches this, switch
        const stickyThreshold = headerHeight;
        
        // Find the header that is currently at or just passed the sticky threshold
        // A header is active when its bottom edge reaches or passes the header bottom edge
        // This creates the "header swallows section title" effect at the right moment
        let activeHeader = null;
        let activeHeaderDistance = Infinity;
        
        headers.forEach((header) => {
          const rect = header.getBoundingClientRect();
          const relativeTop = rect.top - containerRect.top;
          const relativeBottom = rect.bottom - containerRect.top;
          
          // Header is active when its bottom edge reaches or just passed the header bottom edge
          // This creates the "header swallows section title" effect at the exact right moment
          // We want: relativeBottom >= stickyThreshold (bottom edge reached or passed header bottom)
          // AND relativeTop < stickyThreshold (header hasn't completely passed yet)
          if (relativeBottom >= stickyThreshold && relativeTop < stickyThreshold) {
            const distance = Math.abs(relativeBottom - stickyThreshold);
            if (distance < activeHeaderDistance) {
              activeHeaderDistance = distance;
              activeHeader = header;
            }
          }
        });
        
        // Fallback: If no header exactly at threshold, find the one whose bottom is closest to threshold
        // This handles cases where we're between sections or slightly off
        if (!activeHeader && headers.length > 0) {
          headers.forEach((header) => {
            const rect = header.getBoundingClientRect();
            const relativeBottom = rect.bottom - containerRect.top;
            const relativeTop = rect.top - containerRect.top;
            
            // Check if header bottom is near the threshold (within 30px above or below)
            // And header top is still above or at threshold (header hasn't completely passed)
            if (relativeBottom >= stickyThreshold - 30 && relativeBottom <= stickyThreshold + 30 && relativeTop <= stickyThreshold) {
              const distance = Math.abs(relativeBottom - stickyThreshold);
              if (distance < activeHeaderDistance) {
                activeHeaderDistance = distance;
                activeHeader = header;
              }
            }
          });
        }
        
        // Final fallback: If still no header, use the first one if we're near the top
        if (!activeHeader && headers.length > 0) {
          const firstHeader = headers[0];
          const firstRect = firstHeader.getBoundingClientRect();
          if (firstRect.bottom <= containerRect.top + headerHeight + 30) {
            activeHeader = firstHeader;
          }
        }
        
        const newActiveId = activeHeader 
          ? activeHeader.getAttribute('data-section-id')
          : null;
        
        // Update state immediately (no conditional check to ensure updates)
        setActiveStickyHeaderId(newActiveId);
        
        // Hide/show original headers in chat (keep spacing)
        headers.forEach((header) => {
          const headerId = header.getAttribute('data-section-id');
          if (headerId === newActiveId) {
            // Hide the original header when it's shown in breadcrumb
            header.style.opacity = '0';
            header.style.visibility = 'hidden';
            header.style.transition = 'none';
            header.style.height = header.offsetHeight + 'px';
          } else {
            // Show other headers
            header.style.opacity = '1';
            header.style.visibility = 'visible';
            header.style.transition = 'opacity 0.2s ease-out';
            header.style.height = 'auto';
          }
        });
      }, 10); // Faster debounce: 10ms instead of 30ms
    };
    
    // Create observer for each header
    const observers = headers.map(header => {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          // Track intersection state and position
          headerStates.set(header, {
            isIntersecting: entry.isIntersecting,
            boundingClientRect: entry.boundingClientRect,
            intersectionRatio: entry.intersectionRatio
          });
          updateActiveHeader();
        });
      }, observerOptions);
      
      observer.observe(header);
      return observer;
    });
    
    // Also listen to scroll events as backup for more responsive updates
    let scrollTicking = false;
    const handleScroll = () => {
      if (!scrollTicking) {
        requestAnimationFrame(() => {
          updateActiveHeader();
          scrollTicking = false;
        });
        scrollTicking = true;
      }
    };
    
    container.addEventListener('scroll', handleScroll, { passive: true });
    
    // Initial update after a shorter delay
    const initialTimeout = setTimeout(() => {
      updateActiveHeader();
    }, 50); // Reduced from 100ms
    
    // Periodic update to catch any missed changes (faster: every 100ms instead of 200ms)
    const periodicUpdate = setInterval(() => {
      updateActiveHeader();
    }, 100);
    
    // Cleanup
    return () => {
      clearTimeout(initialTimeout);
      clearInterval(periodicUpdate);
      if (updateTimeout) {
        clearTimeout(updateTimeout);
      }
      container.removeEventListener('scroll', handleScroll);
      observers.forEach(observer => observer.disconnect());
      headerStates.clear();
    };
  }, [chatHook.messages, cardContextHook.sections, headerHeight]);
  
  /**
   * Nachricht senden - VEREINFACHT
   * 
   * Die gesamte Logik für Session-Erstellung und Nachricht-Speicherung
   * ist jetzt in useChat.handleSend implementiert (atomare Operation).
   * 
   * App.jsx muss nur noch den Kontext übergeben.
   */
  const handleSend = (text, options = {}) => {
    // Immer im Chat bleiben
    sessionsHook.setForceShowOverview(false);
    
    // Check if this is the first message in a temporary session
    const isFirstMessage = sessionContext.isTemporary && 
                          (!sessionContext.currentSession?.messages || sessionContext.currentSession.messages.length === 0);
    
    console.log('📤 handleSend: Sending message', { 
      text: text.substring(0, 50), 
      currentMessagesCount: chatHook.messages.length,
      isTemporary: sessionContext.isTemporary,
      isFirstMessage 
    });
    
    // Prepare context - use SessionContext's temporary session if available
    const pendingDeckSession = sessionContext.isTemporary && sessionContext.currentSession
      ? {
          deckId: sessionContext.currentSession.deckId,
          deckName: sessionContext.currentSession.deckName
        }
      : deckTrackingHook.pendingDeckSession;
    
    // Übergebe den vollständigen Kontext an useChat
    // useChat.handleSend führt eine atomare Operation aus
    chatHook.handleSend(text, {
      pendingDeckSession: pendingDeckSession,
      setCurrentSessionId: (id) => {
        const session = sessionContext.sessions.find(s => s.id === id) || 
                       (sessionContext.isTemporary && sessionContext.currentSession?.id === id ? sessionContext.currentSession : null);
        if (session) {
          sessionContext.setCurrentSession(session);
          if (!sessionContext.isTemporary) {
            // Session was persisted by useChat
            sessionContext.setIsTemporary(false);
          }
        }
      },
      setPendingDeckSession: deckTrackingHook.setPendingDeckSession,
      currentMessages: chatHook.messages,
      mode: options.mode || 'compact', // Standard: kompakt
      tempSeenCardIds: sessionContext.isTemporary && sessionContext.currentSession
        ? sessionContext.currentSession.seenCardIds || []
        : deckTrackingHook.tempSeenCardIds
    });
    
    // If this is the first message in a temporary session, persist it after a short delay
    // (allowing useChat to complete its session creation first)
    if (isFirstMessage) {
      setTimeout(() => {
        if (sessionContext.isTemporary && sessionContext.currentSession) {
          console.log('💬 App.jsx: Erste Nachricht gesendet, persistiere temporäre Session');
          sessionContext.handleFirstMessage();
        }
      }, 100);
    }
    
    // Markiere dass wir auf eine neue User-Nachricht warten
    // Der useEffect wird die neue Nachricht erkennen und zum Interaction Container scrollen
    lastUserMessageIdRef.current = 'pending';
  };

  // Keyboard Navigation: Cmd + ArrowUp/Down to jump between user messages
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Check for Cmd (Meta) or Ctrl + ArrowUp/Down
      if ((e.metaKey || e.ctrlKey) && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        
        const container = messagesContainerRef.current;
        if (!container) return;

        // Find all user messages (including those in interaction container)
        const userMessages = Array.from(container.querySelectorAll('[data-message-from="user"]'));
        if (userMessages.length === 0) return;

        // Calculate offsetTop relative to the container for each message
        // Note: msg.offsetTop is relative to offsetParent (which is the container because it has 'relative' class)
        const currentScrollTop = container.scrollTop;
        
        // Target offset: Header height + minimal padding to look good
        const targetOffset = headerHeight + 10;
        
        // Tolerance buffer to avoid getting stuck on the same message due to pixel rounding
        const buffer = 5;

        if (e.key === 'ArrowDown') {
            // Find the first message that is strictly "below" the current view line
            // Meaning: Its required scroll position is greater than current scroll position
            const nextMsg = userMessages.find(msg => {
                const targetScrollForMsg = msg.offsetTop - targetOffset;
                return targetScrollForMsg > (currentScrollTop + buffer);
            });
            
            if (nextMsg) {
                container.scrollTo({
                    top: nextMsg.offsetTop - targetOffset,
                    behavior: 'smooth'
                });
            }
        } else if (e.key === 'ArrowUp') {
            // Find the first message that is strictly "above" the current view line (iterating backwards)
            // Meaning: Its required scroll position is less than current scroll position
            // We reverse the array to find the "closest" previous message
            const prevMsg = [...userMessages].reverse().find(msg => {
                 const targetScrollForMsg = msg.offsetTop - targetOffset;
                 return targetScrollForMsg < (currentScrollTop - buffer);
            });
            
            if (prevMsg) {
                 container.scrollTo({
                    top: prevMsg.offsetTop - targetOffset,
                    behavior: 'smooth'
                });
            } else {
                // If no previous message found (we are at the first one), scroll to very top
                 container.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
            }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [headerHeight]);

  // Settings öffnen
  const handleOpenSettings = () => {
    setShowProfile(true);
  };

  // Settings speichern
  const handleSaveSettings = (settings) => {
    console.log('💾 App.jsx: Settings gespeichert:', settings);
    setShowProfile(false);
    modelsHook.handleSaveSettings(settings);
  };

  // Panel schließen
  const handleClose = () => {
    console.log('handleClose aufgerufen, bridge:', bridge);
    if (bridge && bridge.closePanel) {
      console.log('Rufe bridge.closePanel auf');
      try {
        bridge.closePanel();
      } catch (e) {
        console.error('Fehler beim Schließen:', e);
      }
    } else {
      console.warn('bridge oder bridge.closePanel nicht verfügbar');
    }
  };
  
  // Use SessionContext for session selection
  const handleSelectSession = useCallback((sessionId) => {
    const session = sessionContext.sessions.find(s => s.id === sessionId);
    if (session && bridge && bridge.openDeck) {
      // Open deck in Anki
      bridge.openDeck(session.deckId);
      
      // Set session in context
      sessionContext.setCurrentSession(session);
      sessionContext.setIsTemporary(false);
      
      // Hide overview
      sessionsHook.setForceShowOverview(false);
      
      // Load session messages and sections
      chatHook.setMessages(session.messages || []);
      cardContextHook.setSections(session.sections || []);
      if (session.messages && session.messages.length > 0) {
        const lastMsg = session.messages[session.messages.length - 1];
        if (lastMsg.sectionId) {
          cardContextHook.setCurrentSectionId(lastMsg.sectionId);
        }
      }
      
      // Scroll to last user message after session is loaded
      setTimeout(() => {
        scrollToLastUserMessage();
      }, 500); // Give React time to render the messages
    }
  }, [sessionContext, bridge, sessionsHook, chatHook, cardContextHook, scrollToLastUserMessage]);
  
  const handleDeleteSession = useCallback((sessionId) => {
    sessionContext.deleteSessionById(sessionId);
    if (sessionContext.currentSessionId === sessionId) {
      chatHook.setMessages([]);
      cardContextHook.setSections([]);
      cardContextHook.setCurrentSectionId(null);
    }
  }, [sessionContext, chatHook, cardContextHook]);
  
  const handleNavigateToOverview = sessionsHook.createHandleNavigateToOverview(bridge);
  
  const handleResetChat = sessionsHook.createHandleResetChat(
    chatHook.setMessages,
    cardContextHook.setSections,
    cardContextHook.setCurrentSectionId
  );
  
  // Prüfe ob Reset-Button inaktiv sein soll (keine Messages und keine Sections)
  const isResetDisabled = chatHook.messages.length === 0 && cardContextHook.sections.length === 0;
  
  const handleRequestHint = cardContextHook.createHandleRequestHint(handleSend);
  
  const handleRequestMultipleChoice = cardContextHook.createHandleRequestMultipleChoice(handleSend);

  // Toggle Card State Handler
  const handleToggleCardState = () => {
    if (!cardContextHook.cardContext) return;
    
    const isQuestion = cardContextHook.cardContext.isQuestion !== false;
    
    if (isQuestion) {
        // Wenn Frage -> Aufdecken
        if (bridge && bridge.showAnswer) {
            bridge.showAnswer();
        }
        // Optimistisches UI Update
        cardContextHook.setCardContext(prev => ({ ...prev, isQuestion: false }));
    } else {
        // Wenn Antwort -> Verdecken (experimentell)
        if (bridge && bridge.hideAnswer) {
            bridge.hideAnswer();
        }
        // UI Update
        cardContextHook.setCardContext(prev => ({ ...prev, isQuestion: true }));
    }
  };

  // Premium Unlock Handler
  const handlePremiumUnlock = () => {
    setIsPremium(true);
    try {
      localStorage.setItem('anki_premium_status', 'true');
    } catch (e) {
      console.warn('Fehler beim Speichern des Premium-Status:', e);
    }
    // Deep-Mode wird automatisch aktiviert, wenn der User den Button erneut klickt
    // Oder wir können es hier direkt aktivieren, wenn ChatInput einen Ref hat
    // Für jetzt: User muss nach Unlock den DEEP-Button erneut klicken
  };

  // Premium Reset Handler (Developer Backdoor - Long Press auf FLASH)
  const handleResetPremium = () => {
    setIsPremium(false);
    try {
      localStorage.setItem('anki_premium_status', 'false');
    } catch (e) {
      console.warn('Fehler beim Zurücksetzen des Premium-Status:', e);
    }
    console.log('🔓 Premium-Status zurückgesetzt (Developer Backdoor)');
  };

  // Berechne activeSectionTitle für Header - MEMOIZED für Performance
  const activeSection = useMemo(() => {
    return activeStickyHeaderId 
      ? cardContextHook.sections.find(s => s.id === activeStickyHeaderId) 
      : null;
  }, [activeStickyHeaderId, cardContextHook.sections]);
  const activeSectionTitle = activeSection?.title || null;

  // Performance: Memoize messages to render (only visible ones)
  const messagesToRender = useMemo(() => {
    // Always show the last N messages (or all if less than N)
    const totalMessages = chatHook.messages.length;
    if (totalMessages <= visibleMessageCount) {
      return chatHook.messages;
    }
    // Show last N messages
    return chatHook.messages.slice(-visibleMessageCount);
  }, [chatHook.messages, visibleMessageCount]);

  // Performance: Intersection Observer for loading more messages when scrolling up
  useEffect(() => {
    if (!messagesContainerRef.current || !loadMoreTriggerRef.current) return;
    if (chatHook.messages.length <= visibleMessageCount) return; // All messages already visible

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Load 20 more messages
            setVisibleMessageCount((prev) => Math.min(prev + 20, chatHook.messages.length));
          }
        });
      },
      { root: messagesContainerRef.current, rootMargin: '200px' }
    );

    observer.observe(loadMoreTriggerRef.current);

    return () => {
      observer.disconnect();
    };
  }, [visibleMessageCount, chatHook.messages.length]);

  // Reset visible count when messages change significantly (e.g., new session loaded)
  useEffect(() => {
    // If messages array length changed dramatically (new session), reset visible count
    if (Math.abs(chatHook.messages.length - prevMessagesLengthRef.current) > 50) {
      setVisibleMessageCount(20);
      // Scroll to last user message when a new session is loaded
      setTimeout(() => {
        scrollToLastUserMessage();
      }, 600); // Give React time to render all messages
    }
    prevMessagesLengthRef.current = chatHook.messages.length;
  }, [chatHook.messages.length, scrollToLastUserMessage]);

  // Scroll to last user message when currentSession changes (e.g., deck selected)
  const prevSessionIdRef = useRef(sessionContext.currentSessionId);
  useEffect(() => {
    // Only scroll if session actually changed and we have messages
    if (sessionContext.currentSessionId !== prevSessionIdRef.current && 
        chatHook.messages.length > 0 && 
        !sessionContext.isTemporary) {
      prevSessionIdRef.current = sessionContext.currentSessionId;
      // Scroll to last user message after a short delay to ensure DOM is ready
      setTimeout(() => {
        scrollToLastUserMessage();
      }, 500);
    } else if (sessionContext.currentSessionId !== prevSessionIdRef.current) {
      prevSessionIdRef.current = sessionContext.currentSessionId;
    }
  }, [sessionContext.currentSessionId, sessionContext.isTemporary, chatHook.messages.length, scrollToLastUserMessage]);

  return (
    <ErrorBoundary>
    <div className="flex flex-col h-screen bg-base-100 text-base-content overflow-hidden">
      {/* Header - fixiert oben */}
      <div ref={headerRef} className="fixed top-0 left-0 right-0 z-40">
        <SessionHeader
          onNavigateToOverview={handleNavigateToOverview}
          showSessionOverview={showSessionOverview}
          onReset={handleResetChat}
          sections={cardContextHook.sections}
          onScrollToSection={cardContextHook.handleScrollToSection}
          messages={chatHook.messages}
          isResetDisabled={isResetDisabled}
          activeSectionTitle={activeSectionTitle}
          onSectionTitleClick={() => {
            if (activeSection && activeSection.cardId && bridge && bridge.goToCard) {
              bridge.goToCard(activeSection.cardId);
            }
          }}
          bridge={bridge}
          onOpenSettings={() => setShowProfile(true)}
        />
      </div>

      <main className="flex-1 overflow-hidden relative flex flex-col min-h-0" style={{ height: '100%' }}>
        {showSessionOverview ? (
          /* Session-Übersicht - wenn kein Deck aktiv */
          <div className="flex-1 overflow-hidden pt-16">
            <SessionList 
              bridge={bridge}
              onSelectSession={handleSelectSession}
            />
          </div>
        ) : (
          <>
            {/* Chat Container - scrollbar */}
            <div className="flex-1 overflow-hidden relative">
              {/* Top Fade Gradient - smooth fade-out at top, positioned below header */}
              {/* Adjusted to be always under header, now that floating pill is gone */}
              <div 
                className="fixed left-0 right-0 pointer-events-none z-25 max-w-3xl mx-auto"
                style={{
                  top: `${headerHeight}px`, 
                  height: '40px',
                  background: 'linear-gradient(to bottom, hsl(var(--b1)) 0%, hsl(var(--b1) / 0.9) 30%, hsl(var(--b1) / 0.0) 100%)'
                }}
              />
              <div 
                ref={messagesContainerRef}
                id="messages-container"
                className="h-full overflow-y-auto px-4 pt-20 pb-40 max-w-3xl mx-auto w-full scrollbar-thin relative z-10"
              >
                {chatHook.messages.length === 0 && !chatHook.isLoading && !chatHook.streamingMessage ? (
            <div className="flex flex-col items-center justify-center h-full text-base-content/50">
              <div className="relative w-24 h-24 mb-8 flex items-center justify-center">
                <div className="absolute inset-0 bg-primary/5 rounded-full blur-xl animate-pulse"></div>
                <div className="relative bg-base-200/50 p-6 rounded-2xl border border-primary/10 shadow-lg backdrop-blur-sm">
                   <Brain size={48} className="text-primary/80" strokeWidth={1.5} />
                </div>
                <div className="absolute -top-2 -right-2 bg-base-100 p-1.5 rounded-lg border border-base-300 shadow-sm">
                  <Sparkles size={16} className="text-amber-500" fill="currentColor" />
                </div>
              </div>
              <p className="text-lg font-medium mb-3 text-base-content tracking-tight">Bereit für eine neue Session?</p>
              <p className="text-sm text-base-content/40 max-w-xs text-center leading-relaxed">
                Stelle eine Frage zu deinen Karten oder lass uns über ein Thema diskutieren.
              </p>
            </div>
          ) : (
            <>
              {/* Finde letzte User-Nachricht für Interaction Container */}
              {(() => {
                let lastUserMessageIdx = -1;
                for (let i = chatHook.messages.length - 1; i >= 0; i--) {
                  if (chatHook.messages[i].from === 'user') {
                    lastUserMessageIdx = i;
                    break;
                  }
                }
                const hasLastUserMessage = lastUserMessageIdx >= 0;
                const lastUserMessage = hasLastUserMessage ? chatHook.messages[lastUserMessageIdx] : null;
                const nextMsg = lastUserMessageIdx >= 0 && lastUserMessageIdx < chatHook.messages.length - 1 
                  ? chatHook.messages[lastUserMessageIdx + 1] 
                  : null;
                const hasStreamingOrLoading = chatHook.streamingMessage || chatHook.isLoading;
                const isLastInteraction = hasLastUserMessage && (nextMsg?.from === 'bot' || hasStreamingOrLoading || !nextMsg);
                
                return (
                  <>
                    {/* Load More Trigger - invisible element at top to detect scroll */}
                    {chatHook.messages.length > visibleMessageCount && (
                      <div ref={loadMoreTriggerRef} className="h-1 w-full" aria-hidden="true" />
                    )}
                    
                    {/* Render only visible messages before the last interaction */}
                    {messagesToRender.map((msg, localIdx) => {
                      // Calculate original index in full messages array
                      const originalIdx = chatHook.messages.length - messagesToRender.length + localIdx;
                      
                      // Skip if this is part of the last interaction (will be rendered in Interaction Container)
                      if (isLastInteraction && originalIdx >= lastUserMessageIdx) {
                        return null;
                      }
                      
                      // Finde Section für diese Nachricht
                      const section = msg.sectionId ? cardContextHook.sections.find(s => s.id === msg.sectionId) : null;
                      
                      // Prüfe ob dies die ERSTE Nachricht dieser Section ist
                      const prevMsg = originalIdx > 0 ? chatHook.messages[originalIdx - 1] : null;
                      const isFirstMessageOfSection = !prevMsg || !prevMsg.sectionId || prevMsg.sectionId !== msg.sectionId;
                      
                      // Zeige Header wenn:
                      // 1. Es eine Section gibt UND
                      // 2. Es die erste Nachricht dieser Section ist
                      const showHeader = section && isFirstMessageOfSection;
                      
                      return (
                        <React.Fragment key={msg.id || originalIdx}>
                          {/* Section Header - Badge links, Linie nach rechts */}
                          {showHeader && (
                            <div 
                              id={section.id}
                              data-section-id={section.id}
                              className={`group/section bg-base-100/95 backdrop-blur-sm ${localIdx === 0 ? 'pt-2 pb-4' : 'pt-6 pb-4 mt-6'}`}
                            >
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => {
                                    if (section.cardId && bridge && bridge.goToCard) {
                                      bridge.goToCard(section.cardId);
                                    }
                                  }}
                                  className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full bg-base-content/5 border border-base-content/10 group-hover/section:bg-primary/10 group-hover/section:border-primary/20 transition-all cursor-pointer"
                                  title="Zur Lernkarte springen"
                                >
                                  <BookOpen size={13} className="text-base-content/40 group-hover/section:text-primary/70 transition-colors" />
                                  <span className="text-xs font-medium text-base-content/50 group-hover/section:text-base-content/80 transition-colors">
                                    {section.title === "Lade Titel..." ? (
                                      <span className="flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 border-2 border-base-content/20 border-t-primary/50 rounded-full animate-spin" />
                                        <span className="italic text-base-content/30">Generiere...</span>
                                      </span>
                                    ) : (
                                      typeof section.title === 'string' ? section.title : 'Lernkarte'
                                    )}
                                  </span>
                                </button>
                                <div className="flex-1 h-px bg-gradient-to-r from-base-content/15 via-base-content/8 to-transparent group-hover/section:from-primary/25 group-hover/section:via-primary/10 transition-all duration-300" />
                              </div>
                            </div>
                          )}
                          {msg && typeof msg.text === 'string' && msg.text && (
                            <div 
                              className="mb-6" 
                              data-message-id={msg.id}
                              data-message-from={msg.from || 'bot'}
                            >
                              <ErrorBoundary>
                                {/* #region agent log */}
                                {(() => {
                                  const timestamp = Date.now();
                                  fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.jsx:1092',message:'Rendering ChatMessage with saved message',data:{messageId:msg.id,from:msg.from,stepsLength:msg.steps?.length||0,citationsCount:Object.keys(msg.citations||{}).length,messageLength:msg.text?.length||0},timestamp:timestamp,sessionId:'debug-session',runId:'run1',hypothesisId:'K'})}).catch(()=>{});
                                  return null;
                                })()}
                                {/* #endregion */}
                                <ChatMessage 
                                  message={msg.text} 
                                  from={msg.from || 'bot'}
                                  cardContext={cardContextHook.cardContext}
                                  steps={msg.steps || []}
                                  citations={msg.citations || {}}
                                  bridge={bridge}
                                  onAnswerSelect={(letter, isCorrect) => {
                                    console.log(`User selected ${letter}, correct: ${isCorrect}`);
                                  }}
                                  onAutoFlip={() => {
                                    if (bridge && bridge.showAnswer) {
                                      bridge.showAnswer();
                                    } else {
                                      console.warn('Bridge showAnswer not available');
                                    }
                                  }}
                                  onPreviewCard={handlePreviewCard}
                                />
                              </ErrorBoundary>
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}
                    
                    {/* Interaction Container: Last User Message + AI Response/Loading */}
                    {isLastInteraction && lastUserMessage && (
                      <div
                        ref={interactionContainerRef}
                        data-interaction-container="true"
                        className="flex flex-col justify-start w-full"
                        style={{
                          minHeight: '100dvh' // Dynamische Viewport-Height für mobile Browser-Bars
                        }}
                      >
                        {/* Section Header für letzte Interaction (falls vorhanden) */}
                        {(() => {
                          const section = lastUserMessage.sectionId 
                            ? cardContextHook.sections.find(s => s.id === lastUserMessage.sectionId) 
                            : null;
                          const prevMsg = lastUserMessageIdx > 0 ? chatHook.messages[lastUserMessageIdx - 1] : null;
                          const isFirstMessageOfSection = !prevMsg || !prevMsg.sectionId || prevMsg.sectionId !== lastUserMessage.sectionId;
                          const showHeader = section && isFirstMessageOfSection;
                          
                          return showHeader ? (
                            <div 
                              id={section.id}
                              data-section-id={section.id}
                              className="group/section bg-base-100/95 backdrop-blur-sm pt-6 pb-4 mt-6 w-full flex-none"
                            >
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => {
                                    if (section.cardId && bridge && bridge.goToCard) {
                                      bridge.goToCard(section.cardId);
                                    }
                                  }}
                                  className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full bg-base-content/5 border border-base-content/10 group-hover/section:bg-primary/10 group-hover/section:border-primary/20 transition-all cursor-pointer"
                                  title="Zur Lernkarte springen"
                                >
                                  <BookOpen size={13} className="text-base-content/40 group-hover/section:text-primary/70 transition-colors" />
                                  <span className="text-xs font-medium text-base-content/50 group-hover/section:text-base-content/80 transition-colors">
                                    {section.title === "Lade Titel..." ? (
                                      <span className="flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 border-2 border-base-content/20 border-t-primary/50 rounded-full animate-spin" />
                                        <span className="italic text-base-content/30">Generiere...</span>
                                      </span>
                                    ) : (
                                      typeof section.title === 'string' ? section.title : 'Lernkarte'
                                    )}
                                  </span>
                                </button>
                                <div className="flex-1 h-px bg-gradient-to-r from-base-content/15 via-base-content/8 to-transparent group-hover/section:from-primary/25 group-hover/section:via-primary/10 transition-all duration-300" />
                              </div>
                            </div>
                          ) : null;
                        })()}
                        
                        {/* User Message - NO bottom margin - flex-none verhindert Dehnung */}
                        {lastUserMessage && typeof lastUserMessage.text === 'string' && lastUserMessage.text && (
                          <div 
                            className="w-full flex-none"
                            data-message-id={lastUserMessage.id}
                            data-message-from="user"
                          >
                            <ErrorBoundary>
                              <ChatMessage 
                                message={lastUserMessage.text} 
                                from="user"
                                cardContext={cardContextHook.cardContext}
                                onAnswerSelect={(letter, isCorrect) => {
                                  console.log(`User selected ${letter}, correct: ${isCorrect}`);
                                }}
                                onAutoFlip={() => {
                                  if (bridge && bridge.showAnswer) {
                                    bridge.showAnswer();
                                  } else {
                                    console.warn('Bridge showAnswer not available');
                                  }
                                }}
                                onPreviewCard={handlePreviewCard}
                              />
                                                            </ErrorBoundary>
                                                          </div>
                                                        )}
                                                        
                                                        {/* AI Response or Loading - flex-none verhindert Dehnung */}
                                                        {nextMsg && nextMsg.from === 'bot' && typeof nextMsg.text === 'string' && nextMsg.text && (
                                                          <div className="w-full flex-none">
                                                            <ErrorBoundary>
                                                              <ChatMessage 
                                                                message={nextMsg.text} 
                                                                from="bot"
                                                                cardContext={cardContextHook.cardContext}
                                                                steps={nextMsg.steps || []}
                                                                citations={nextMsg.citations || {}}
                                                                bridge={bridge}
                                                                onAnswerSelect={(letter, isCorrect) => {
                                                                  console.log(`User selected ${letter}, correct: ${isCorrect}`);
                                                                }}
                                                                onAutoFlip={() => {
                                                                  if (bridge && bridge.showAnswer) {
                                                                    bridge.showAnswer();
                                                                  } else {
                                                                    console.warn('Bridge showAnswer not available');
                                                                  }
                                                                }}
                                                                onPreviewCard={handlePreviewCard}
                                                              />
                                                            </ErrorBoundary>
                                                          </div>
                                                        )}                        
                        {/* Streaming Message - handles both Loading (Thinking) and Generating phases */}
                        {/* CRITICAL: Only render StreamingChatMessage if no saved bot message exists yet */}
                        {/* This prevents double-rendering when message is saved but timeout hasn't cleared streamingMessage */}
                        {/* Robust: Text-Vergleich verhindert Dopplung auch bei Race Conditions */}
                        {(chatHook.isLoading || chatHook.streamingMessage) && !(
                          nextMsg && 
                          nextMsg.from === 'bot' && 
                          typeof nextMsg.text === 'string' &&
                          nextMsg.text && 
                          // CRITICAL: Prüfe auf Identität (Text-Vergleich), um Dopplung zu verhindern
                          // Nutze trim(), um Whitespace-Unterschiede zu ignorieren
                          // Sicher: Prüfe ob beide Strings vorhanden sind vor trim()
                          chatHook.streamingMessage && 
                          typeof chatHook.streamingMessage === 'string' &&
                          (chatHook.streamingMessage.trim() === nextMsg.text.trim())
                        ) && (
                          <div className="w-full flex-none">
                            {/* #region agent log */}
                            {(() => {
                              const timestamp_render = Date.now();
                              fetch('http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.jsx:688',message:'Rendering StreamingChatMessage (unified)',data:{streaming_len:chatHook.streamingMessage?.length||0,isLoading:chatHook.isLoading,timestamp:timestamp_render},timestamp:timestamp_render,sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
                              return null;
                            })()}
                            {/* #endregion */}
                            <StreamingChatMessage 
                              message={chatHook.streamingMessage || ''} 
                              isStreaming={chatHook.isLoading}
                              cardContext={cardContextHook.cardContext}
                              steps={chatHook.currentSteps || []}
                              citations={chatHook.currentCitations || {}}
                              bridge={bridge}
                              onPreviewCard={handlePreviewCard}
                            />
                          </div>
                        )}
                        
                        {/* SPACER - Drückt alles nach oben und füllt den Rest des Screens */}
                        <div className="flex-grow w-full min-h-[50px]" />
                      </div>
                    )}
                    
                    {/* Spacer am Ende - sorgt dafür dass der letzte Content vollständig sichtbar ist */}
                    <div className="h-6 w-full" aria-hidden="true" />
                  </>
                );
              })()}
            </>
          )}
              </div>
            </div>
          </>
        )}

      </main>

      {!showSessionOverview && (
        <>
          {/* Gradient Fade Overlay - smooth fade-out at bottom, positioned above input footer */}
          {/* Fixed position so it stays visible while content scrolls behind it */}
          <div 
            className="fixed left-0 right-0 pointer-events-none z-40"
            style={{
              bottom: '160px', // Position above footer (footer is ~160px tall with CardContext + Input + padding)
              height: '80px',
              background: 'linear-gradient(to top, hsl(var(--b1)) 0%, hsl(var(--b1) / 0.98) 20%, hsl(var(--b1) / 0.9) 40%, hsl(var(--b1) / 0.7) 60%, hsl(var(--b1) / 0.4) 80%, hsl(var(--b1) / 0.1) 90%, transparent 100%)'
            }}
          />
          {/* Card Context + Chat Input - zusammengehörig wie Perplexity */}
          <div className="fixed bottom-0 left-0 right-0 z-50 pb-4 px-4 bg-base-100/95 backdrop-blur-sm">
            <div className="max-w-3xl mx-auto relative">
              {/* Card Context als Topper hinter dem Input, gleiche Breite, leichte Überlappung */}
                {cardContextHook.cardContext && (cardContextHook.cardContext.question || cardContextHook.cardContext.frontField) && (
                <div className="absolute -top-4 left-0 right-0 z-10 bg-base-100">
            <ErrorBoundary>
                  <CardContext
                        context={cardContextHook.cardContext}
                        title={cardContextHook.sections.find(s => s.cardId === cardContextHook.cardContext.cardId)?.title}
                    onRequestHint={handleRequestHint}
                    onRequestMultipleChoice={handleRequestMultipleChoice}
                  />
                  </ErrorBoundary>
                </div>
          )}
              {/* Chat Input */}
                <div className={cardContextHook.cardContext ? 'pt-8 relative z-20' : 'relative z-20'}>
        <ChatInput
          onSend={handleSend}
          onOpenSettings={handleOpenSettings}
                    isLoading={chatHook.isLoading}
                    onStop={chatHook.handleStopRequest}
                    cardContext={cardContextHook.cardContext}
                    onRequestHint={handleRequestHint}
                    onRequestMultipleChoice={handleRequestMultipleChoice}
                    onToggleCardState={handleToggleCardState}
                    bridge={bridge}
                    isPremium={isPremium}
                    onShowPaywall={() => setShowPaywall(true)}
                    onResetPremium={handleResetPremium}
                    authStatus={authStatus}
                    currentAuthToken={currentAuthToken}
        />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Profile Dialog */}
      <ProfileDialog
        isOpen={showProfile}
        onClose={() => setShowProfile(false)}
        bridge={bridge}
        isReady={isReady}
      />

      {/* Card Preview Modal */}
      <CardPreviewModal 
        card={previewCard} 
        isOpen={!!previewCard} 
        onClose={() => setPreviewCard(null)} 
        bridge={bridge}
      />

      {/* Paywall Modal */}
      <PaywallModal
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        onUnlock={handlePremiumUnlock}
      />
    </div>
    </ErrorBoundary>
  );
}

/**
 * Main App Component - wraps AppInner with SessionContextProvider
 */
export default function App() {
  const { bridge, isReady } = useAnki();
  
  return (
    <SessionContextProvider bridge={bridge} isReady={isReady}>
      <AppInner />
    </SessionContextProvider>
  );
}