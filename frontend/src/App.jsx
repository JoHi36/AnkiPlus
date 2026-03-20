import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAnki } from './hooks/useAnki';
import { useChat } from './hooks/useChat';
import { updateSessionSections } from './utils/sessions';
import { useDeckTracking } from './hooks/useDeckTracking';
import { useCardContext } from './hooks/useCardContext';
import { useCardSession } from './hooks/useCardSession';
import { useReviewTrail } from './hooks/useReviewTrail';
import { useModels } from './hooks/useModels';
import { SessionContextProvider, useSessionContext } from './contexts/SessionContext';
import Header from './components/Header';
import SessionHeader from './components/SessionView/SessionHeader';
import ChatMessage from './components/ChatMessage';
import StreamingChatMessage from './components/StreamingChatMessage';
import { getOrCreateDeviceId } from './utils/deviceId';
import ChatInput from './components/ChatInput';
import ProfileDialog from './components/ProfileDialog';
import ThoughtStream from './components/ThoughtStream';
import SessionOverview from './components/SessionOverview';
// CardPreviewModal removed — replaced by universal Preview Mode (bridge.openPreview)
import SessionList from './components/SessionView/SessionList';
import ContextSurface from './components/ContextSurface';
import DeckBrowser from './components/DeckBrowser';
import ErrorBoundary from './components/ErrorBoundary';
import PaywallModal from './components/PaywallModal';
import TokenBar from './components/TokenBar';
import SectionDivider from './components/SectionDivider';
import SourcesCarousel from './components/SourcesCarousel';
import ReviewTrailIndicator from './components/ReviewTrailIndicator';
import { BookOpen } from 'lucide-react';
import { useFreeChat } from './hooks/useFreeChat';
// MascotShell moved to main window (plusi_dock.py) — no longer imported
import { useMascot } from './hooks/useMascot';
import { usePlusiDirect } from './hooks/usePlusiDirect';
import InsightsDashboard from './components/InsightsDashboard';
import AgentStudio from './components/AgentStudio';
import ExtractInsightsButton from './components/ExtractInsightsButton';
import useInsights from './hooks/useInsights';
import PlusiMenu from './components/PlusiMenu';

// Stable empty references — prevent new object creation on every render
const EMPTY_STEPS = [];
const EMPTY_CITATIONS = {};

function normalizeMessages(messages) {
  return messages.map(m => ({
    ...m,
    from: m.sender || m.from || 'user',
    sectionId: m.section_id || m.sectionId,
    createdAt: m.created_at || m.createdAt,
    steps: typeof m.steps === 'string' ? JSON.parse(m.steps || '[]') : (m.steps || EMPTY_STEPS),
    citations: typeof m.citations === 'string' ? JSON.parse(m.citations || '{}') : (m.citations || EMPTY_CITATIONS),
  }));
}

function normalizeSections(sections) {
  return sections.map(s => ({
    ...s,
    cardId: s.card_id || s.cardId,
    createdAt: s.created_at || s.createdAt,
    performanceType: s.performance_type || s.performanceType,
    performanceData: typeof s.performance_data === 'string'
      ? JSON.parse(s.performance_data || 'null')
      : (s.performance_data || s.performanceData || null),
  }));
}

/**
 * Inner App Component - wrapped by SessionContextProvider
 */
function AppInner() {
  const { bridge, isReady } = useAnki();
  const sessionContext = useSessionContext();
  
  // Initialize Device-ID for anonymous users
  useEffect(() => {
    const deviceId = getOrCreateDeviceId();
  }, []);
  
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
    
    // NOTE: Auth events (authTokenLoaded, auth_success) are now handled in the main
    // ankiReceive handler below. Do NOT override window.ankiReceive here — that would
    // destroy the main handler when this useEffect re-runs (bridge change).

    window.addEventListener('ankiMessage', handleMessage);
    return () => {
      window.removeEventListener('ankiMessage', handleMessage);
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
  const [forceShowOverview, setForceShowOverview] = useState(false);
  const cardContextHook = useCardContext();
  const cardSessionHook = useCardSession(bridge);
  const reviewTrailHook = useReviewTrail();
  const insightsHook = useInsights();
  const [activeView, setActiveView] = useState('chat'); // 'chat' | 'agentStudio' | 'plusiMenu'
  const lastProcessedCardRef = useRef(null);
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
  const chatHook = useChat(bridge, sessionContext.currentSessionId, setSessionsWrapper, cardContextHook.currentSectionId, cardContextHook, cardSessionHook);

  // DEPRECATED: useDeckTracking is being phased out in favor of SessionContext
  // Keep for backward compatibility during migration
  const deckTrackingHook = useDeckTracking(
    bridge,
    isReady,
    sessionContext.sessions,
    forceShowOverview,
    sessionContext.currentSessionId,
    chatHook.messages,
    (id) => sessionContext.setCurrentSession(sessionContext.sessions.find(s => s.id === id) || null),
    chatHook.setMessages,
    sessionContext.setSessions,
    cardContextHook.setSections,
    cardContextHook.setCurrentSectionId,
    setForceShowOverview
  );
  
  // Refs für window.ankiReceive — prevent stale closures
  const bridgeRef = useRef(bridge);
  const ankiReceiveRef = useRef(false);
  // Hook refs — ankiReceive handler captures these once, so we need refs to get latest values
  const cardSessionHookRef = useRef(cardSessionHook);
  const cardContextHookRef = useRef(cardContextHook);
  const chatHookRef = useRef(chatHook);
  const modelsHookRef = useRef(modelsHook);
  const deckTrackingHookRef = useRef(deckTrackingHook);
  const reviewTrailHookRef = useRef(reviewTrailHook);
  const insightsHookRef = useRef(insightsHook);
  const sessionContextRef = useRef(sessionContext);
  const handlePerformanceCaptureRef = useRef(null);
  useEffect(() => {
    cardSessionHookRef.current = cardSessionHook;
    cardContextHookRef.current = cardContextHook;
    chatHookRef.current = chatHook;
    modelsHookRef.current = modelsHook;
    deckTrackingHookRef.current = deckTrackingHook;
    reviewTrailHookRef.current = reviewTrailHook;
    insightsHookRef.current = insightsHook;
    sessionContextRef.current = sessionContext;
    handlePerformanceCaptureRef.current = handlePerformanceCapture;
  });
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

  // Preview Mode State (for Card Preview Mode feature)
  // null | {stage: 'peek'|'card_chat', cardId: number, previousChatState: object}
  const [previewMode, setPreviewMode] = useState(null);
  const previewModeRef = useRef(null);
  useEffect(() => { previewModeRef.current = previewMode; }, [previewMode]);

  // Handler for opening card preview — uses new universal Preview Mode
  const handlePreviewCard = useCallback((cardData) => {
    const cardId = cardData?.cardId || cardData?.noteId || cardData?.id;
    if (cardId && bridge?.openPreview) {
      bridge.openPreview(String(cardId));
    }
  }, [bridge]);

  // Handler for performance data capture (MC, text evaluation, flip)
  // Updates both local sections state and persists to session
  const handlePerformanceCapture = useCallback((sectionId, perfData) => {
    if (!sectionId) return;
    // 1. Update local sections state
    cardContextHook.updateSectionPerformance(sectionId, perfData);
    // 2. Persist to deck-based session (legacy)
    const sessionId = sessionContext.currentSessionId;
    if (sessionId) {
      setSessionsWrapper((prevSessions) => {
        const session = prevSessions.find(s => s.id === sessionId);
        if (!session) return prevSessions;
        const updatedSections = (session.sections || []).map(s =>
          s.id === sectionId ? { ...s, performanceData: perfData } : s
        );
        return updateSessionSections(prevSessions, sessionId, updatedSections);
      });
    }
    // 3. Persist to per-card SQLite session
    const cardId = cardSessionHook.currentCardId || cardContextHook.cardContext?.cardId;
    if (cardId) {
      const section = cardContextHook.sections.find(s => s.id === sectionId);
      if (section) {
        cardSessionHook.saveSection(cardId, {
          ...section,
          performanceData: perfData,
          performanceType: perfData?.type,
        });
      }
    }
  }, [cardContextHook, sessionContext.currentSessionId, setSessionsWrapper, cardSessionHook]);
  
  // Zeige Session-Übersicht NUR wenn explizit vom User angefordert (via Stapel-Button o.ä.)
  // NICHT automatisch wenn keine Session aktiv — Chat startet immer im Chat-Modus
  const showSessionOverview = forceShowOverview;

  // ── Free Chat State ──────────────────────────────────────────────
  const [freeChatOpen, setFreeChatOpen] = useState(false);
  const [freeChatInitialText, setFreeChatInitialText] = useState('');
  const [animPhase, setAnimPhase] = useState('idle'); // 'idle'|'entering'|'entered'|'exiting'
  const [activeChat, setActiveChat] = useState('session'); // "session" | "free"

  // activeChatRef must be declared AFTER activeChat (can't reference before initialization)
  const activeChatRef = useRef('session');
  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);

  const freeChatHook = useFreeChat({
    bridge,
    onLoadingChange: (loading) => {
      // Only restore session routing if free chat is no longer open.
      // If free chat is open, the exit handlers (handleFreeChatClose/onCancelComplete)
      // are responsible for calling setActiveChat('session').
      if (!loading && !freeChatOpenRef.current) {
        setActiveChat('session');
      }
    },
    onCancelComplete: () => {
      // Must animate out — do NOT call setFreeChatOpen(false) directly
      setAnimPhase('exiting');
      setTimeout(() => {
        setFreeChatOpen(false);
        setAnimPhase('idle');
        setActiveChat('session');
      }, 300);
    },
  });
  const freeChatHookRef = useRef(freeChatHook);
  useEffect(() => { freeChatHookRef.current = freeChatHook; }, [freeChatHook]);

  // ── Free Chat Push: card messages → Free Chat ──────────────────
  // When session chat saves a message, also push it to Free Chat for the chronological view
  useEffect(() => {
    chatHook.freeChatPushRef.current = (msg) => {
      freeChatHook.setMessages(prev => [...prev, {
        id: msg.id,
        text: msg.text,
        from: msg.from,
        createdAt: new Date().toISOString(),
      }]);
    };
    return () => { chatHook.freeChatPushRef.current = null; };
  }, []);
  const freeChatOpenRef = useRef(false);
  const handleFreeChatOpenRef = useRef(null);
  useEffect(() => { freeChatOpenRef.current = freeChatOpen; }, [freeChatOpen]);

  // Theme state — 'dark' | 'light' | 'system'; resolvedTheme is the effective value
  const [theme, setTheme] = useState('dark');
  const [resolvedTheme, setResolvedTheme] = useState('dark');

  // Apply data-theme to document root whenever resolvedTheme changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }, [resolvedTheme]);

  // Load theme from config on bridge ready
  useEffect(() => {
    if (isReady && bridge && bridge.getTheme) {
      bridge.getTheme();
    }
  }, [isReady, bridge]);

  // Mascot state
  const { mood, setEventMood, setAiMood, resetMood } = useMascot();
  const [mascotEnabled, setMascotEnabled] = useState(false);

  const [consecutiveWrong, setConsecutiveWrong] = useState(0);
  const activationCountRef = useRef(0);
  const activationResetRef = useRef(null);

  // Plusi Direct — @Plusi inline messages
  const { sendDirect: sendPlusiDirect } = usePlusiDirect();
  const eventTriggerRef = useRef(null);
  const [streak, setStreak] = useState(0);

  // Idle timer — set mascot to sleepy after 10 minutes of inactivity
  const idleTimerRef = useRef(null);
  const setEventMoodRef = useRef(setEventMood);
  useEffect(() => { setEventMoodRef.current = setEventMood; }, [setEventMood]);

  useEffect(() => {
    const resetIdle = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => setEventMoodRef.current('sleepy'), 10 * 60 * 1000);
    };
    window.addEventListener('mousedown', resetIdle);
    window.addEventListener('keydown', resetIdle);
    resetIdle();
    return () => {
      window.removeEventListener('mousedown', resetIdle);
      window.removeEventListener('keydown', resetIdle);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  // Load mascot_enabled from config on bridge ready
  useEffect(() => {
    if (!isReady || !bridge || !bridge.getCurrentConfig) return;
    try {
      const configStr = bridge.getCurrentConfig();
      if (configStr) {
        const config = JSON.parse(configStr);
        const mascotVal = config?.mascot_enabled ?? false;
        setMascotEnabled(mascotVal);
      }
    } catch (e) {
      // ignore parse errors
    }
  }, [isReady, bridge]);

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
      
      // Trigger slide-in animation when panel is opened
      if (payload.type === 'panelOpened') {
        const root = document.getElementById('chat-root');
        if (root) {
          root.style.animation = 'none';
          root.offsetHeight; // force reflow
          root.style.animation = 'slideInFromRight 0.3s ease-out';
        }
        return;
      }

      // CRITICAL: Process deckSelected immediately, don't queue it
      // This event is time-sensitive and needs to be processed as soon as possible
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

        // Use refs to avoid stale closures — this handler is only created once
        const _models = modelsHookRef.current;
        const _chat = chatHookRef.current;
        const _deck = deckTrackingHookRef.current;
        const _cardCtx = cardContextHookRef.current;
        const _cardSession = cardSessionHookRef.current;
        const _trail = reviewTrailHookRef.current;
        const _session = sessionContextRef.current;
        const _perfCapture = handlePerformanceCaptureRef.current;

        // Auth Events (handled here to avoid destructive window.ankiReceive overrides)
        if (payload.type === 'authTokenLoaded' && payload.data) {
          setCurrentAuthToken(payload.data.token || '');
        }
        if (payload.type === 'auth_success') {
          const b = bridgeRef.current;
          if (b && b.getAuthStatus) {
            try {
              const statusStr = b.getAuthStatus();
              if (statusStr) {
                const status = JSON.parse(statusStr);
                setAuthStatus(status);
              }
            } catch (e) { /* ignore */ }
          }
          if (b && b.getAuthToken) {
            b.getAuthToken();
          }
        }
        // Dispatch auth events as CustomEvents for ProfileDialog
        if (['authTokenLoaded', 'authStatusLoaded', 'auth_success', 'auth_error', 'auth_logout', 'auth_linking', 'auth_link_expired', 'auth_link_timeout'].includes(payload.type)) {
          window.dispatchEvent(new CustomEvent('ankiAuthEvent', { detail: payload }));
        }

        // Models Events
        _models.handleAnkiReceive(payload);

        // Chat Events — mutual exclusion: only one hook receives each payload
        const _freeChat = freeChatHookRef.current;
        if (activeChatRef.current === 'free') {
          _freeChat.handleAnkiReceive(payload);
        } else {
          _chat.handleAnkiReceive(payload);
        }

        // Deck Events
        if (payload.type === 'currentDeck') {
          console.log('📚 App.jsx: Aktuelles Deck erhalten:', payload.data);
          _deck.setCurrentDeck(payload.data);
          _deck.handleDeckChange(payload.data);
        } else if (payload.type === 'availableDecks') {
          console.log('📚 App.jsx: Verfügbare Decks erhalten:', payload.data?.decks?.length || 0);
        } else if (payload.type === 'openDeck') {
          console.log('📚 App.jsx: Deck geöffnet, hole aktuelle Deck-Info...');
          const currentBridge = bridgeRef.current;
          if (currentBridge && currentBridge.getCurrentDeck) {
            setTimeout(() => {
              currentBridge.getCurrentDeck();
            }, 300);
          }
        }

        // Card Context Events — PER-CARD SESSION SWITCH
        if (payload.type === 'cardContext') {
          const newCardId = payload.data?.cardId;
          const isQuestion = payload.data?.isQuestion;
          console.error('🔴 CARD_SWITCH: cardContext for cardId:', newCardId, 'isQuestion:', isQuestion);

          // Dedup: skip if this card was already processed (dual dispatch)
          if (newCardId && newCardId === lastProcessedCardRef.current) {
            console.log('🔵 CARD_SWITCH: skipping duplicate for cardId:', newCardId);
            return;
          }
          if (newCardId) lastProcessedCardRef.current = newCardId;

          // Cancel any in-flight AI request before switching cards
          if (_chat.isLoading) {
            _chat.handleStopRequest();
          }

          _cardCtx.handleCardContext(payload.data);
          if (newCardId) {
            // SAVE current card's messages to cache BEFORE clearing
            const prevCardId = _cardSession.currentCardId;
            if (prevCardId && _chat.messages && _chat.messages.length > 0) {
              _cardSession.updateLocalMessages(prevCardId, _chat.messages);
            }
            // Auto-extraction removed — now manual via ExtractInsightsButton
            const _insights = insightsHookRef.current;
            _session.handleCardShown(newCardId);
            // Clear chat and sections for new card
            _chat.setMessages([]);
            _cardCtx.setSections([]);
            _cardCtx.setCurrentSectionId(null);
            // Per-Card Session: Load card's session from SQLite
            _cardSession.loadCardSession(newCardId);
            // Load insights for new card
            _insights.loadInsights(newCardId);
            // Review Trail
            _trail.addCard(newCardId);
          }
        }

        // Per-Card Session Events
        if (payload.type === 'cardSessionLoaded') {
          const enrichedPayload = {
            ...payload,
            data: { ...(payload.data || {}), cardId: payload.cardId || payload.data?.cardId }
          };
          _cardSession.handleAnkiReceive(enrichedPayload);
          // Sync loaded card session data to chat and sections
          const data = payload.data || payload;
          if (data && data.messages && data.messages.length > 0) {
            _chat.setMessages(normalizeMessages(data.messages));
          } else if (data && (!data.messages || data.messages.length === 0)) {
            _chat.setMessages([]);
          }
          if (data && data.sections) {
            const normalized = normalizeSections(data.sections);
            _cardCtx.setSections(normalized);
            if (normalized.length > 0) {
              _cardCtx.setCurrentSectionId(normalized[normalized.length - 1].id);
            } else {
              _cardCtx.setCurrentSectionId(null);
            }
          }
        }

        // Deck Messages Loaded — route to Free Chat hook for persistence
        if (payload.type === 'deckMessagesLoaded') {
          _freeChat.handleDeckMessagesLoaded(payload);
        }

        // Review Result Events
        if (payload.type === 'reviewResult' && payload.data) {
          console.log('📊 App.jsx: Review result received:', payload.data);
          const { cardId, ease, rating, timeSeconds, score } = payload.data;
          if (cardId) {
            const section = _cardCtx.getSectionForCard(cardId);
            const perfData = {
              type: 'flip',
              score: score || 70,
              timeSeconds: timeSeconds || 0,
              rating: rating || 'Good',
              ease: ease || 3,
            };
            if (section) {
              _perfCapture(section.id, perfData);
            } else {
              window._pendingPerformanceData = window._pendingPerformanceData || {};
              window._pendingPerformanceData[cardId] = perfData;
            }
          }
          // Mascot mood: ease 1=Again, 2=Hard, 3=Good, 4=Easy
          const easeVal = payload.data?.ease ?? payload.ease;
          if (easeVal >= 3) {
            setEventMood('happy');
            setConsecutiveWrong(0);
          } else if (easeVal === 1) {
            setConsecutiveWrong(prev => {
              const next = prev + 1;
              if (next >= 3) setEventMood('empathy');
              return next;
            });
          }
        }

        // Evaluation Result Events
        if (payload.type === 'evaluationResult' && payload.data) {
          console.log('📊 App.jsx: Evaluation result received:', payload.data);
          const { cardId, score, feedback, userAnswer } = payload.data;
          if (cardId) {
            const section = _cardCtx.getSectionForCard(cardId);
            const perfData = {
              type: 'text',
              score: score || 0,
              userAnswer: userAnswer || '',
              analysis: [],
              feedback: feedback || '',
            };
            if (section) {
              _perfCapture(section.id, perfData);
            } else {
              window._pendingPerformanceData = window._pendingPerformanceData || {};
              window._pendingPerformanceData[cardId] = perfData;
            }
          }
        }

        // Initial Message (from reviewer MC mode — auto-send to AI)
        if (payload.type === 'initialMessage' && payload.data?.text) {
          const _chatHook = chatHookRef.current;
          if (_chatHook && _chatHook.handleSend) {
            setTimeout(() => {
              _chatHook.handleSend(payload.data.text);
            }, 300);
          }
        }

        // Section Title Events — handled by the general mutual-exclusion block above.
        // useFreeChat.handleAnkiReceive drops sectionTitleGenerated internally.
        // No secondary dispatch needed here.

        // Free Chat triggered from native DeckBrowser search bar
        if (payload.type === 'startFreeChat' && payload.text) {
          handleFreeChatOpenRef.current(payload.text);
          return;
        }

        // Deck Events - deckSelected / deckExited
        if (payload.type === 'deckSelected') {
          _trail.resetTrail();
          // Dispatch as CustomEvent for SessionContext (which listens via addEventListener)
          window.dispatchEvent(new CustomEvent('deckSelected', { detail: payload.data }));
        }
        if (payload.type === 'deckExited') {
          _trail.resetTrail();
          _cardSession.clearCurrentSession();
          // Dispatch as CustomEvent for SessionContext
          window.dispatchEvent(new CustomEvent('deckExited'));
        }

        // Card Details Events
        if (payload.type === 'cardDetails') {
          console.log('🔍 App.jsx: Card Details erhalten:', payload.data);
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
          if (window._hasMultipleChoiceCallbacks && payload.callbackId) {
            const callback = window._hasMultipleChoiceCallbacks[payload.callbackId];
            if (callback) {
              delete window._hasMultipleChoiceCallbacks[payload.callbackId];
              callback(JSON.stringify(payload.data));
            }
          }
        }

        // Deck Stats Events
        if (payload.type === 'deckStats') {
          window.dispatchEvent(new CustomEvent('deckStats', {
            detail: { deckId: payload.deckId, data: payload.data }
          }));
        }

        // Image Loaded Events
        if (payload.type === 'imageLoaded') {
          window.dispatchEvent(new CustomEvent('imageLoaded', {
            detail: { url: payload.url, data: payload.data }
          }));
        }

        // AI State Events — route to active chat hook
        if (payload.type === 'ai_state') {
          console.log('🤖 App.jsx: AI State Update:', payload.message);
          if (activeChatRef.current === 'free') {
            _freeChat.handleAnkiReceive(payload);
          } else {
            _chat.handleAnkiReceive(payload);
          }
          window.dispatchEvent(new CustomEvent('aiStateUpdate', {
            detail: { message: payload.message }
          }));
        }

        // Init Event
        if (payload.type === 'init') {
          if (payload.currentDeck) {
            _deck.setCurrentDeck(payload.currentDeck);
            _deck.handleDeckChange(payload.currentDeck);
          }
          // Apply theme from init payload
          if (payload.theme) setTheme(payload.theme);
          if (payload.resolvedTheme) setResolvedTheme(payload.resolvedTheme);
          // Don't append greeting when in review mode — InsightsDashboard is the empty state now
        }

        // Plusi Sub-Agent Events
        if (payload.type === 'plusiSkeleton') {
          console.log('🔵 Plusi skeleton received');
        }

        if (payload.type === 'plusiResult') {
          console.log('🔵 Plusi result received:', payload.mood, payload.text?.substring(0, 50));
          if (!payload.error && payload.text) {
            const meta = {
              happy: 'freut sich', empathy: 'fühlt mit dir', excited: 'ist aufgeregt',
              surprised: 'ist überrascht', sleepy: 'ist müde', blush: 'wird rot',
              thinking: 'denkt nach', neutral: '',
            }[payload.mood] || '';

            const plusiMarker = `[[TOOL:${JSON.stringify({
              name: "spawn_plusi",
              displayType: "widget",
              result: { mood: payload.mood, text: payload.text, meta: meta, friendship: payload.friendship }
            })}]]`;

            // Append Plusi marker to the current streaming message
            const _chatForPlusi = chatHookRef.current;
            if (_chatForPlusi && _chatForPlusi.appendMessageRef?.current) {
              // If streaming is done, append as part of last bot message
              _chatForPlusi.setMessages(prev => {
                if (prev.length === 0) return prev;
                const lastIdx = prev.length - 1;
                const lastMsg = prev[lastIdx];
                if (lastMsg.from === 'bot') {
                  const updated = [...prev];
                  updated[lastIdx] = { ...lastMsg, text: (lastMsg.text || '') + '\n' + plusiMarker };
                  return updated;
                }
                return prev;
              });
            }
          }
        }

        // Plusi Direct Result — @Plusi inline messages
        if (payload.type === 'plusi_direct_result') {
          const _chatForPlusi = chatHookRef.current;
          if (_chatForPlusi) {
            const result = {
              mood: payload.mood || 'neutral',
              text: payload.text || '',
              meta: payload.meta || '',
              friendship: payload.friendship || null,
              error: payload.error || false,
              silent: payload.silent || false,
            };
            if (!result.error && !result.silent && result.text) {
              const plusiMarker = `[[TOOL:${JSON.stringify({
                name: "spawn_plusi",
                displayType: "widget",
                result: { mood: result.mood, text: result.text, meta: result.meta, friendship: result.friendship }
              })}]]`;
              // Add as a new bot message containing the Plusi widget
              _chatForPlusi.setMessages(prev => [
                ...prev,
                { id: Date.now(), from: 'bot', text: plusiMarker }
              ]);
              setAiMood(result.mood);
            } else if (result.silent) {
              // Silent response — show muted message, still sync mood
              const silentMarker = `[[TOOL:${JSON.stringify({
                name: "spawn_plusi",
                displayType: "widget",
                result: { mood: result.mood, text: '*Plusi antwortet nicht.*', meta: '', friendship: result.friendship }
              })}]]`;
              _chatForPlusi.setMessages(prev => [
                ...prev,
                { id: Date.now(), from: 'bot', text: silentMarker }
              ]);
              setAiMood(result.mood);
            }
          }
        }

        // Card Result — streak tracking + mascot reactions
        if (payload.type === 'cardResult') {
          if (payload.correct) {
            setStreak(prev => {
              const newStreak = prev + 1;
              setEventMood('happy');
              if (newStreak === 5) eventTriggerRef.current?.('streak_5');
              else if (newStreak === 10) eventTriggerRef.current?.('streak_10');
              return newStreak;
            });
          } else {
            setStreak(0);
            setEventMood('empathy');
            eventTriggerRef.current?.('card_wrong');
          }
        }

        // Mascot Events
        if (payload.type === 'mascotEnabledSaved') {
          setMascotEnabled(payload.data.enabled);
        }

        // Preview Mode Events
        if (payload.type === 'previewMode') {
          if (payload.data === null) {
            // Preview closed — restore previous chat state
            const currentPreviewMode = previewModeRef.current;
            if (currentPreviewMode?.previousChatState) {
              setActiveChat(currentPreviewMode.previousChatState.activeChat || 'session');
            }
            setPreviewMode(null);
          } else {
            const { stage, cardId } = payload.data;
            if (stage === 'peek') {
              setPreviewMode({
                stage: 'peek',
                cardId,
                previousChatState: {
                  activeChat: activeChatRef.current,
                }
              });
            } else if (stage === 'card_chat') {
              setPreviewMode(prev => ({
                ...prev,
                stage: 'card_chat',
                cardId
              }));
              setActiveChat('session');
              const currentBridge = bridgeRef.current;
              if (currentBridge?.loadCardSession) {
                currentBridge.loadCardSession(String(cardId));
              }
            }
          }
        }

        // configLoaded — sync mascot_enabled and theme from full config
        if (payload.type === 'configLoaded' && payload.data) {
          window._cachedConfig = payload.data;
          const mascotVal = payload.data?.mascot_enabled ?? false;
          setMascotEnabled(mascotVal);
          if (payload.data.theme) setTheme(payload.data.theme);
          if (payload.data.resolvedTheme) setResolvedTheme(payload.data.resolvedTheme);
        }

        // Theme events
        if (payload.type === 'themeChanged' && payload.data) {
          if (payload.data.theme) setTheme(payload.data.theme);
          if (payload.data.resolvedTheme) setResolvedTheme(payload.data.resolvedTheme);
        }
        if (payload.type === 'themeLoaded' && payload.data) {
          if (payload.data.theme) setTheme(payload.data.theme);
          if (payload.data.resolvedTheme) setResolvedTheme(payload.data.resolvedTheme);
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
          if (payload.type === 'deckSelected') {
          console.error('🔵 DEBUG App.jsx: Processing queued deckSelected', payload.data);
          // Handle deckSelected from queue - dispatch event for SessionContext
          window.dispatchEvent(new CustomEvent('deckSelected', { 
            detail: payload.data 
          }));
        } else if (payload.type === 'init') {
            modelsHookRef.current.handleAnkiReceive(payload);
            if (payload.currentDeck) {
              deckTrackingHookRef.current.setCurrentDeck(payload.currentDeck);
              deckTrackingHookRef.current.handleDeckChange(payload.currentDeck);
            }
            if (payload.theme) setTheme(payload.theme);
            if (payload.resolvedTheme) setResolvedTheme(payload.resolvedTheme);
          }
        });
      }
    };

    // Process queue immediately
    processQueue();

    // Poll the queue periodically to catch events that arrive after initial render
    const queuePollInterval = setInterval(() => {
      processQueue();
    }, 100);

    window._ankiReceiveQueuePollInterval = queuePollInterval;

    return () => {
      if (window._ankiReceiveQueuePollInterval) {
        clearInterval(window._ankiReceiveQueuePollInterval);
        window._ankiReceiveQueuePollInterval = null;
      }
    };
  }, []); // No deps needed — all hook access is via refs

  // FALLBACK: Listen for cardContext via CustomEvent (more reliable than window.ankiReceive chain)
  // card_tracker.py dispatches this alongside the ankiReceive call
  useEffect(() => {
    const handleCardContextEvent = (event) => {
      const payload = event.detail;
      if (!payload || payload.type !== 'cardContext') return;
      console.error('🟢 CARD_SWITCH via CustomEvent: cardId:', payload.data?.cardId);

      const _chat = chatHookRef.current;
      const _cardCtx = cardContextHookRef.current;
      const _cardSession = cardSessionHookRef.current;
      const _trail = reviewTrailHookRef.current;
      const _session = sessionContextRef.current;

      const newCardId = payload.data?.cardId;
      const isQuestion = payload.data?.isQuestion;

      // Dedup: skip if this card was already processed by ankiReceive handler
      if (newCardId && newCardId === lastProcessedCardRef.current) {
        console.log('🟢 CARD_SWITCH: skipping duplicate CustomEvent for cardId:', newCardId);
        return;
      }
      if (newCardId) lastProcessedCardRef.current = newCardId;

      // Cancel any in-flight AI request before switching cards
      if (_chat.isLoading) {
        _chat.handleStopRequest();
      }

      _cardCtx.handleCardContext(payload.data);
      if (newCardId) {
        // Save current card's messages BEFORE clearing
        const prevCardId = _cardSession.currentCardId;
        if (prevCardId && _chat.messages && _chat.messages.length > 0) {
          _cardSession.updateLocalMessages(prevCardId, _chat.messages);
        }
        // Auto-extraction removed — now manual via ExtractInsightsButton
        const _insights = insightsHookRef.current;
        _session.handleCardShown(newCardId);
        // Clear chat and sections for new card
        _chat.setMessages([]);
        _cardCtx.setSections([]);
        _cardCtx.setCurrentSectionId(null);
        _cardSession.loadCardSession(newCardId);
        // Load insights for new card
        _insights.loadInsights(newCardId);
        _trail.addCard(newCardId);
      }
    };

    // Also listen for cardSessionLoaded via CustomEvent
    const handleCardSessionLoadedEvent = (event) => {
      const payload = event.detail;
      if (!payload || payload.type !== 'cardSessionLoaded') return;
      console.error('🟢 CARD_SESSION_LOADED via CustomEvent: cardId:', payload.cardId);

      const _chat = chatHookRef.current;
      const _cardCtx = cardContextHookRef.current;
      const _cardSession = cardSessionHookRef.current;

      _cardSession.handleAnkiReceive(payload);

      const data = payload.data || payload;
      if (data && data.messages && data.messages.length > 0) {
        _chat.setMessages(normalizeMessages(data.messages));
      } else if (data && (!data.messages || data.messages.length === 0)) {
        _chat.setMessages([]);
      }
      if (data && data.sections) {
        const normalized = normalizeSections(data.sections);
        _cardCtx.setSections(normalized);
        if (normalized.length > 0) {
          _cardCtx.setCurrentSectionId(normalized[normalized.length - 1].id);
        } else {
          _cardCtx.setCurrentSectionId(null);
        }
      }
    };

    window.addEventListener('ankiCardContext', handleCardContextEvent);
    window.addEventListener('ankiCardSessionLoaded', handleCardSessionLoadedEvent);
    return () => {
      window.removeEventListener('ankiCardContext', handleCardContextEvent);
      window.removeEventListener('ankiCardSessionLoaded', handleCardSessionLoadedEvent);
    };
  }, []); // Refs are used, no deps needed

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
    if (activeView !== 'chat') {
      setActiveView('chat');
    }

    // @Plusi intercept — route to Plusi Direct instead of main AI
    if (text.trim().startsWith('@Plusi')) {
      const plusiText = text.trim().slice(6).trim();
      if (plusiText) {
        // Add user message to chat
        chatHook.setMessages(prev => [
          ...prev,
          { id: Date.now(), from: 'user', text }
        ]);
        // Send to Plusi directly
        sendPlusiDirect(plusiText);
      }
      return;
    }

    // Auto-transition from peek to card_chat when user sends a message
    if (previewModeRef.current?.stage === 'peek') {
      const peekCardId = previewModeRef.current.cardId;
      setPreviewMode(prev => prev ? { ...prev, stage: 'card_chat' } : prev);
      setActiveChat('session');
      const currentBridge = bridgeRef.current;
      if (currentBridge?.loadCardSession) {
        currentBridge.loadCardSession(String(peekCardId));
      }
      if (window.ankiBridge) {
        window.ankiBridge.addMessage('previewToggleChat', {});
      }
    }

    // Immer im Chat bleiben
    setForceShowOverview(false);

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

  // Review Trail Navigation handlers — defined before the keyboard useEffect that references them
  const handleTrailNavigateLeft = useCallback(() => {
    if (bridge) {
      bridge.navigateToCard('prev');
    }
  }, [bridge]);

  const handleTrailNavigateRight = useCallback(() => {
    if (bridge) {
      bridge.navigateToCard('next');
    }
  }, [bridge]);

  // Keyboard Navigation: ArrowLeft/Right for review trail, Cmd+ArrowUp/Down for messages
  useEffect(() => {
    const handleKeyDown = (e) => {
      // ArrowLeft/Right ALWAYS navigate cards, even from textarea
      if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          handleTrailNavigateLeft();
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          handleTrailNavigateRight();
          return;
        }
      }

      // Skip remaining shortcuts if in input/textarea
      const tag = e.target.tagName.toLowerCase();
      if (tag === 'textarea' || tag === 'input' || e.target.isContentEditable) return;

      // ESC closes the chat panel
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
        return;
      }

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
  }, [headerHeight, handleTrailNavigateLeft, handleTrailNavigateRight]);

  // ⌘X — reset free chat history (stay in chat mode)
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'x' && freeChatOpen && animPhase === 'entered') {
        e.preventDefault();
        freeChatHookRef.current.resetMessages();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [freeChatOpen, animPhase]);

  // ⌘. — toggle between chat and agentStudio
  useEffect(() => {
    const handleGlobalShortcut = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault();
        setActiveView(prev => prev === 'chat' ? 'agentStudio' : 'chat');
      }
    };
    window.addEventListener('keydown', handleGlobalShortcut);
    return () => window.removeEventListener('keydown', handleGlobalShortcut);
  }, []);

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
      setForceShowOverview(false);
      
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
  }, [sessionContext, bridge, chatHook, cardContextHook, scrollToLastUserMessage]);
  
  const handleDeleteSession = useCallback((sessionId) => {
    sessionContext.deleteSessionById(sessionId);
    if (sessionContext.currentSessionId === sessionId) {
      chatHook.setMessages([]);
      cardContextHook.setSections([]);
      cardContextHook.setCurrentSectionId(null);
    }
  }, [sessionContext, chatHook, cardContextHook]);
  
  const handleOpenDeck = useCallback((deckId) => {
    if (bridge && bridge.openDeck) {
      bridge.openDeck(deckId);
    }
    setForceShowOverview(false);
  }, [bridge]);

  // ── Free Chat Handlers ─────────────────────────────────────────
  const handleFreeChatOpen = useCallback((text) => {
    // Load persisted deck messages before opening (0 = global Free Chat fallback)
    const deckId = sessionContext.currentSession?.deckId || 0;
    console.error('📦 handleFreeChatOpen called, deckId:', deckId, 'text:', text?.substring(0, 30));
    freeChatHook.loadForDeck(deckId);

    // Step 1: show DeckBrowser (deck list visible)
    setForceShowOverview(true);
    setActiveChat('free');
    // Step 2: after DeckBrowser has mounted and rendered, start animation
    setTimeout(() => {
      setFreeChatInitialText(text);
      setFreeChatOpen(true);
      setAnimPhase('entering');
      setTimeout(() => setFreeChatInitialText(''), 0);
      setTimeout(() => setAnimPhase('entered'), 350);
    }, 80);
  }, [sessionContext.currentSession?.deckId, freeChatHook]);
  useEffect(() => { handleFreeChatOpenRef.current = handleFreeChatOpen; }, [handleFreeChatOpen]);

  const handleFreeChatClose = useCallback(() => {
    if (freeChatHookRef.current.isLoading) {
      freeChatHookRef.current.startCancel();
      if (bridge?.cancelRequest) bridge.cancelRequest();
      // onCancelComplete (above) will trigger the exit animation
    } else {
      setAnimPhase('exiting');
      setTimeout(() => {
        setFreeChatOpen(false);
        setAnimPhase('idle');
        setActiveChat('session');
      }, 300);
    }
  }, [bridge]);

  // (handleTrailNavigateLeft/Right defined earlier, before the keyboard useEffect)

  const handleNavigateToOverview = useCallback(() => {
    setForceShowOverview(true);
    if (bridge && bridge.openDeckBrowser) {
      bridge.openDeckBrowser();
    }
  }, [bridge, chatHook, sessionContext]);

  const handleResetChat = useCallback(() => {
    if (confirm('Möchtest du den Chat wirklich zurücksetzen? Alle Nachrichten und Abschnitte werden gelöscht.')) {
      const userMsgCount = chatHook.messages.filter(m => m.from === 'user').length;
      if (userMsgCount >= 2 && cardContextHook.cardContext?.cardId) {
        insightsHook.extractInsights(
          cardContextHook.cardContext.cardId,
          cardContextHook.cardContext,
          chatHook.messages,
          null
        );
      }
      chatHook.setMessages([]);
      cardContextHook.setSections([]);
      cardContextHook.setCurrentSectionId(null);
    }
  }, [chatHook, cardContextHook, insightsHook]);
  
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

    let debounceTimer = null;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              setVisibleMessageCount((prev) => Math.min(prev + 20, chatHook.messages.length));
            }, 150);
          }
        });
      },
      { root: messagesContainerRef.current, rootMargin: '200px' }
    );

    observer.observe(loadMoreTriggerRef.current);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
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
    <style>{`
      @keyframes slideInFromRight {
        from { transform: translateX(30px); opacity: 0; }
        to   { transform: translateX(0);    opacity: 1; }
      }
    `}</style>
    <div id="chat-root" className="flex flex-col h-screen overflow-hidden" style={{ backgroundColor: 'var(--ds-bg-deep)', color: 'var(--ds-text-primary)' }}>
      {/* Header — ContextSurface (fixiert oben) */}
      <div ref={headerRef} className="fixed top-0 left-0 right-0 z-40" style={{ overflow: 'visible' }}>
        <ContextSurface
          onNavigateToOverview={handleNavigateToOverview}
          showSessionOverview={showSessionOverview}
          onReset={handleResetChat}
          isResetDisabled={isResetDisabled}
          onOpenSettings={() => setShowProfile(true)}
          cardContext={cardContextHook.cardContext}
          sessions={sessionContext.sessions}
          onSelectSession={handleSelectSession}
          bridge={bridge}
        />
        {/* Fade mask — chat content fades out behind the pill */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', bottom: -56, left: 0, right: 0,
            height: 56, pointerEvents: 'none', zIndex: 10,
            background: 'linear-gradient(to bottom, var(--ds-bg-deep) 0%, var(--ds-bg-deep) 30%, transparent 100%)',
          }}
        />
      </div>

      <TokenBar tokenInfo={chatHook.tokenInfo} />

      <main className="flex-1 overflow-hidden relative flex flex-col min-h-0" style={{ height: '100%' }}>
        {showSessionOverview ? (
          /* Deck Browser — flex column container for in-place chat transformation */
          <div style={{ position: 'relative', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <DeckBrowser
              bridge={bridge}
              sessions={sessionContext.sessions}
              onSelectSession={handleSelectSession}
              onOpenDeck={handleOpenDeck}
              headerHeight={headerHeight}
              onFreeChatOpen={handleFreeChatOpen}
              freeChatOpen={freeChatOpen}
              animPhase={animPhase}
              freeChatInitialText={freeChatInitialText}
              freeChatHook={freeChatHook}
              onFreeChatClose={handleFreeChatClose}
            />
          </div>
        ) : (
          <>
            {/* Review Trail Indicator — fixed below header, outside scroll area */}
            <ReviewTrailIndicator
              currentPosition={reviewTrailHook.currentPosition}
              totalCards={reviewTrailHook.totalCards}
              canGoLeft={reviewTrailHook.canGoLeft}
              canGoRight={reviewTrailHook.canGoRight}
              isViewingHistory={reviewTrailHook.isViewingHistory}
              onNavigateLeft={handleTrailNavigateLeft}
              onNavigateRight={handleTrailNavigateRight}
            />
            {/* Chat Container - scrollbar */}
            <div className="flex-1 overflow-hidden relative">
              {/* Top Fade Gradient */}
              <div
                className="fixed left-0 right-0 pointer-events-none z-25 max-w-3xl mx-auto"
                style={{
                  top: `${headerHeight}px`,
                  height: '40px',
                  background: 'linear-gradient(to bottom, var(--ds-bg-deep) 0%, var(--ds-bg-deep) 30%, transparent 100%)'
                }}
              />
              <div
                ref={messagesContainerRef}
                id="messages-container"
                className="h-full overflow-y-auto px-4 pt-20 pb-40 max-w-3xl mx-auto w-full scrollbar-thin relative z-10"
              >

                {activeView === 'agentStudio' ? (
                  <AgentStudio
                    bridge={bridge}
                    onNavigateToPlusi={() => setActiveView('plusiMenu')}
                  />
                ) : activeView === 'plusiMenu' ? (
                  <PlusiMenu />
                ) : chatHook.messages.length === 0 && !chatHook.isLoading && !chatHook.streamingMessage ? (
            <InsightsDashboard
              insights={insightsHook.insights}
              cardStats={cardContextHook.cardContext?.stats || {}}
              chartData={insightsHook.chartData}
              isExtracting={insightsHook.isExtracting}
              onCitationClick={(cardId) => bridge.goToCard?.(String(cardId))}
            />
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
                          {/* Section Divider with performance data */}
                          {showHeader && (
                            <SectionDivider
                              section={section}
                              isFirst={localIdx === 0}
                              onGoToCard={(cardId) => {
                                if (bridge && bridge.openPreview) bridge.openPreview(String(cardId));
                              }}
                              lowScorePulse={section.performanceData && section.performanceData.score < 40}
                            />
                          )}
                          {msg && typeof msg.text === 'string' && msg.text && (
                            <div 
                              className="mb-6" 
                              data-message-id={msg.id}
                              data-message-from={msg.from || 'bot'}
                            >
                              <ErrorBoundary>
                                <ChatMessage
                                  message={msg.text}
                                  from={msg.from || 'bot'}
                                  cardContext={cardContextHook.cardContext}
                                  steps={msg.steps || EMPTY_STEPS}
                                  citations={msg.citations || EMPTY_CITATIONS}
                                  pipelineSteps={msg.pipeline_data || []}
                                  bridge={bridge}
                                  isLastMessage={false}
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
                                  onPerformanceCapture={(perfData) => {
                                    handlePerformanceCapture(msg.sectionId, perfData);
                                  }}
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
                        {/* Section Divider für letzte Interaction (falls vorhanden) */}
                        {(() => {
                          const section = lastUserMessage.sectionId
                            ? cardContextHook.sections.find(s => s.id === lastUserMessage.sectionId)
                            : null;
                          const prevMsg = lastUserMessageIdx > 0 ? chatHook.messages[lastUserMessageIdx - 1] : null;
                          const isFirstMessageOfSection = !prevMsg || !prevMsg.sectionId || prevMsg.sectionId !== lastUserMessage.sectionId;
                          const showHeader = section && isFirstMessageOfSection;

                          return showHeader ? (
                            <div className="w-full flex-none">
                              <SectionDivider
                                section={section}
                                isFirst={false}
                                onGoToCard={(cardId) => {
                                  if (bridge && bridge.openPreview) bridge.openPreview(String(cardId));
                                }}
                                lowScorePulse={section.performanceData && section.performanceData.score < 40}
                              />
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
                                                                pipelineSteps={nextMsg.pipeline_data || []}
                                                                bridge={bridge}
                                                                isLastMessage={!chatHook.isLoading && !chatHook.streamingMessage}
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
                                                                onPerformanceCapture={(perfData) => {
                                                                  handlePerformanceCapture(nextMsg.sectionId || lastUserMessage.sectionId, perfData);
                                                                }}
                                                              />
                                                            </ErrorBoundary>
                                                          </div>
                                                        )}                        
                        {/* Streaming Message - handles both Loading (Thinking) and Generating phases */}
                        {/* CRITICAL: Only render StreamingChatMessage if no saved bot message exists yet */}
                        {/* This prevents double-rendering when message is saved but timeout hasn't cleared streamingMessage */}
                        {/* Robust: Text-Vergleich verhindert Dopplung auch bei Race Conditions */}
                        {/* Pipeline ThoughtStream — rendered directly during loading */}
                        {chatHook.isLoading && (
                          <div className="w-full flex-none mb-2">
                            {/* ThoughtStream divider — v5 no longer renders sources */}
                            {(chatHook.pipelineSteps && chatHook.pipelineSteps.length > 0) ? (
                              <ThoughtStream
                                pipelineSteps={chatHook.pipelineSteps || []}
                                isStreaming={true}
                                message={chatHook.streamingMessage || ''}
                                steps={[]}
                              />
                            ) : (
                              /* Simple divider for no-search messages */
                              <div className="h-px my-2" style={{ background: 'var(--ds-border-subtle)' }} />
                            )}

                            {/* Sources — always visible, outside ThoughtStream */}
                            {Object.keys(chatHook.currentCitations || {}).length > 0 && (() => {
                              // Build citation indices from sorted keys (1-based)
                              const cits = chatHook.currentCitations || {};
                              const indices = {};
                              let counter = 1;
                              // Sort by sources.length desc (dual-source first)
                              const sorted = Object.entries(cits).sort(([,a],[,b]) => (b.sources?.length || 0) - (a.sources?.length || 0));
                              sorted.forEach(([key, cit]) => {
                                const id = String(cit.noteId || cit.cardId || key);
                                if (!indices[id]) indices[id] = counter++;
                              });
                              return (
                                <SourcesCarousel
                                  citations={cits}
                                  citationIndices={indices}
                                  bridge={bridge}
                                  onPreviewCard={handlePreviewCard}
                                />
                              );
                            })()}
                          </div>
                        )}
                        {(chatHook.isLoading || chatHook.streamingMessage) && !(
                          nextMsg &&
                          nextMsg.from === 'bot' &&
                          typeof nextMsg.text === 'string' &&
                          nextMsg.text &&
                          chatHook.streamingMessage &&
                          typeof chatHook.streamingMessage === 'string' &&
                          (chatHook.streamingMessage.trim() === nextMsg.text.trim())
                        ) && (
                          <div className="w-full flex-none">
                            <StreamingChatMessage
                              message={chatHook.streamingMessage || ''}
                              isStreaming={chatHook.isLoading}
                              cardContext={cardContextHook.cardContext}
                              steps={chatHook.currentSteps || []}
                              citations={chatHook.currentCitations || {}}
                              pipelineSteps={chatHook.pipelineSteps || []}
                              bridge={bridge}
                              onPreviewCard={handlePreviewCard}
                            />
                          </div>
                        )}
                        
                        {/* SPACER - Drückt alles nach oben und füllt den Rest des Screens */}
                        <div className="flex-grow w-full min-h-[50px]" />
                      </div>
                    )}
                    
                    {/* Manual insight extraction button */}
                    <ExtractInsightsButton
                      messageCount={chatHook.messages.length}
                      onExtract={(onDone, onError) => {
                        if (cardContextHook.cardContext?.cardId) {
                          insightsHook.extractInsights(
                            cardContextHook.cardContext.cardId,
                            cardContextHook.cardContext,
                            chatHook.messages,
                            null
                          );
                        }
                        // Listen for extraction result
                        const handler = (e) => {
                          window.removeEventListener('ankiInsightExtractionComplete', handler);
                          if (e.detail?.success) {
                            onDone?.();
                          } else {
                            onError?.();
                          }
                        };
                        window.addEventListener('ankiInsightExtractionComplete', handler);
                      }}
                    />

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

      {/* Mascot moved to main Anki window (plusi_dock.py) — no longer rendered in React */}

      {!showSessionOverview && (
        <>
          {/* Chat Input — full-width dock at bottom */}
          <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4">
        <ChatInput
          onSend={handleSend}
          onOpenSettings={handleOpenSettings}
          isLoading={chatHook.isLoading}
          onStop={chatHook.handleStopRequest}
          cardContext={cardContextHook.cardContext}
          isPremium={isPremium}
          onShowPaywall={() => setShowPaywall(true)}
          authStatus={authStatus}
          currentAuthToken={currentAuthToken}
          onClose={handleClose}
          actionPrimary={{
            label: activeView === 'plusiMenu' ? 'Zurück' : 'Weiter',
            shortcut: 'SPACE',
            onClick: () => {
              if (activeView !== 'chat') {
                setActiveView('chat');
              } else if (bridge?.advanceCard) {
                bridge.advanceCard();
              } else {
                handleClose();
              }
            },
          }}
          actionSecondary={{
            label: activeView === 'agentStudio' ? 'Chat' : 'Agent Studio',
            shortcut: '↵',
            onClick: () => {
              switch (activeView) {
                case 'chat':
                  setActiveView('agentStudio');
                  break;
                case 'agentStudio':
                  setActiveView('chat');
                  break;
                case 'plusiMenu':
                  setActiveView('agentStudio');
                  break;
              }
            },
          }}
        />
          </div>
        </>
      )}

      {/* Profile Dialog (in-chat, for session overview access) */}
      <ProfileDialog
        isOpen={showProfile}
        onClose={() => setShowProfile(false)}
        bridge={bridge}
        isReady={isReady}
        currentTheme={theme}
      />

      {/* Card Preview Modal removed — replaced by universal Preview Mode */}

      {/* Paywall Modal */}
      <PaywallModal
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
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