import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAnki } from './hooks/useAnki';
import ReviewerView from './components/ReviewerView';
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
import ReviewTrailIndicator from './components/ReviewTrailIndicator';
import { BookOpen } from 'lucide-react';
import { useFreeChat } from './hooks/useFreeChat';
import { useHoldToReset } from './hooks/useHoldToReset';
import { setRegistry, findAgent, getRegistry } from '@shared/config/subagentRegistry';
import { registerAction, executeAction, bridgeAction } from './actions';
import { emit } from './eventBus';
// MascotShell moved to main window (plusi_dock.py) — no longer imported
import { useMascot } from './hooks/useMascot';
import InsightsDashboard from './components/InsightsDashboard';
import AgentStudio from './components/AgentStudio';
import useInsights from './hooks/useInsights';
import PlusiMenu from './components/PlusiMenu';
import ResearchMenu from './components/ResearchMenu';
import StandardSubMenu from './components/StandardSubMenu';
import TokenBudgetSlider from './components/TokenBudgetSlider';
import SettingsSidebar from './components/SettingsSidebar';
import AgenticCell from './components/AgenticCell';
import TopBar from './components/TopBar';
import DeckBrowserView from './components/DeckBrowserView';
import OverviewView from './components/OverviewView';
import ContextTags from './components/ContextTags';

// Stable empty references — prevent new object creation on every render
const EMPTY_STEPS = [];
const EMPTY_CITATIONS = {};

// Map domain.past event names to useFreeChat's expected names (for fullscreen FreeChat)
const EVENT_NAME_MAP = {
  'chat.loadingChanged': 'loading',
  'chat.chunkReceived': 'streaming',
  'chat.responseCompleted': 'bot',
  'chat.errorOccurred': 'error',
  'chat.messagesCleared': 'deckMessagesCleared',
};

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
  const [activeView, setActiveView] = useState('chat'); // 'chat' | 'agentStudio' | 'plusiMenu' | 'researchMenu' | 'subMenu:<agentName>' | 'deckBrowser' | 'overview' | 'freeChat'
  const activeViewRef = useRef('chat');
  useEffect(() => { activeViewRef.current = activeView; }, [activeView]);

  // Fullscreen view state (merged from MainApp)
  const [ankiState, setAnkiState] = useState('deckBrowser');
  const [deckBrowserData, setDeckBrowserData] = useState(null);
  const [overviewData, setOverviewData] = useState(null);
  const [freeChatTransition, setFreeChatTransition] = useState('idle');
  const [mainInputFocused, setMainInputFocused] = useState(false);
  const messagesEndRef = useRef(null);

  // Card reviewer state
  const [cardData, setCardData] = useState(null);

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
  const [activeChat, setActiveChat] = useState('session'); // "session" | "free"

  // activeChatRef must be declared AFTER activeChat (can't reference before initialization)
  const activeChatRef = useRef('session');
  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);

  const freeChatHook = useFreeChat({
    bridge,
    onLoadingChange: (loading) => {
      if (!loading) {
        setActiveChat('session');
      }
    },
    onCancelComplete: () => {
      setActiveChat('session');
    },
  });
  const freeChatHookRef = useRef(freeChatHook);
  useEffect(() => { freeChatHookRef.current = freeChatHook; }, [freeChatHook]);

  // ── Fullscreen FreeChat bridge (stable ref, delegates to bridgeAction) ──
  const fullscreenBridge = useRef({
    sendMessage: (data) => bridgeAction('chat.send', data),
    cancelRequest: () => bridgeAction('chat.cancel'),
    goToCard: (cardId) => bridgeAction('card.goTo', cardId),
    openPreview: (cardId) => bridgeAction('card.preview', { cardId: String(cardId) }),
  }).current;

  // Hold-to-reset for fullscreen FreeChat
  const holdToReset = useHoldToReset({
    onReset: freeChatHook.clearMessages,
    enabled: activeView === 'freeChat' && !mainInputFocused && !freeChatHook.isLoading,
  });

  // Stable refs for fullscreen FreeChat ankiReceive handlers
  const fullscreenHandleDeckMessagesLoadedRef = useRef(freeChatHook.handleDeckMessagesLoaded);
  const fullscreenHandleAnkiReceiveRef = useRef(freeChatHook.handleAnkiReceive);
  const fullscreenLoadForDeckRef = useRef(freeChatHook.loadForDeck);
  useEffect(() => { fullscreenHandleDeckMessagesLoadedRef.current = freeChatHook.handleDeckMessagesLoaded; }, [freeChatHook.handleDeckMessagesLoaded]);
  useEffect(() => { fullscreenHandleAnkiReceiveRef.current = freeChatHook.handleAnkiReceive; }, [freeChatHook.handleAnkiReceive]);
  useEffect(() => { fullscreenLoadForDeckRef.current = freeChatHook.loadForDeck; }, [freeChatHook.loadForDeck]);

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
  const handleFreeChatOpenRef = useRef(null);

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
  const mascotEnabledRef = useRef(false);
  useEffect(() => {
    mascotEnabledRef.current = mascotEnabled;
    window._plusiEnabled = mascotEnabled; // Expose for useChat.js @Plusi guard
  }, [mascotEnabled]);

  const [activeAgentColor, setActiveAgentColor] = useState(null);
  const [activeAgentName, setActiveAgentName] = useState(null);

  // Detect subagent routing from pipeline steps (covers both direct @Name and router delegation)
  useEffect(() => {
    const steps = chatHook?.pipelineSteps || [];
    const routerDone = steps.find(s => s.step === 'router' && s.status === 'done');
    if (routerDone) {
      const rm = routerDone.data?.retrieval_mode || '';
      if (rm.startsWith('subagent:')) {
        const name = rm.split(':')[1];
        const agent = findAgent(name);
        if (agent && activeAgentName !== name) {
          setActiveAgentName(name);
          setActiveAgentColor(agent.color);
        }
      }
    }
    // Clear when not loading
    if (!chatHook?.isLoading && activeAgentName) {
      setActiveAgentName(null);
      setActiveAgentColor(null);
    }
  }, [chatHook?.pipelineSteps, chatHook?.isLoading]);

  const [consecutiveWrong, setConsecutiveWrong] = useState(0);
  const activationCountRef = useRef(0);
  const activationResetRef = useRef(null);

  const eventTriggerRef = useRef(null);
  const [streak, setStreak] = useState(0);

  // Idle timer — set mascot to sleepy after 10 minutes of inactivity (only when Plusi enabled)
  const idleTimerRef = useRef(null);
  const setEventMoodRef = useRef(setEventMood);
  useEffect(() => { setEventMoodRef.current = setEventMood; }, [setEventMood]);

  useEffect(() => {
    if (!mascotEnabled) {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      return;
    }
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
  }, [mascotEnabled]);

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

  // Subagent registry is pushed from Python via ankiReceive('subagent_registry')
  // — no synchronous bridge call needed here.

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
      
      // Emit through Event Bus (agents can subscribe)
      emit(payload.type, payload);

      // Fullscreen state changes (merged from MainApp)
      if (payload.type === 'app.stateChanged' || payload.type === 'stateChanged') {
        const { state, data, freeChatWasOpen } = payload;
        setAnkiState(state);
        if (state === 'deckBrowser') {
          setDeckBrowserData(data);
          if (freeChatWasOpen) {
            setActiveView('freeChat');
            setFreeChatTransition('visible');
            fullscreenLoadForDeckRef.current(0);
          } else {
            if (activeViewRef.current === 'freeChat') {
              setFreeChatTransition('idle');
            }
            setActiveView('deckBrowser');
          }
        } else if (state === 'overview') {
          if (activeViewRef.current === 'freeChat') {
            fullscreenBridge.cancelRequest();
            setFreeChatTransition('idle');
            bridgeAction('chat.stateChanged', { open: false });
          }
          setOverviewData(data);
          setActiveView('overview');
        } else if (state === 'review') {
          setActiveView('review');
        }
        return;
      }

      // Card reviewer events
      if (payload.type === 'card.shown') {
        setCardData({...payload.data, isQuestion: true});
        return;
      }
      if (payload.type === 'card.answerShown') {
        setCardData(prev => prev ? {...prev, backHtml: payload.data.backHtml, isQuestion: false} : {...payload.data, isQuestion: false});
        return;
      }

      // Fullscreen FreeChat messages loaded
      if (payload.type === 'chat.messagesLoaded') {
        fullscreenHandleDeckMessagesLoadedRef.current(payload);
        return;
      }

      // Agent/Python can trigger React-side actions
      if (payload.type === 'executeAction') {
        executeAction(payload.action, payload.data);
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
        // Dispatch auth events as CustomEvents
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
            const _insights = insightsHookRef.current;
            // Mark previous card's insights as seen
            if (_insights.currentCardId) {
              _insights.markInsightsSeen(_insights.currentCardId);
            }
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

        // Plusi Sub-Agent Events (ignored when Plusi is disabled)
        if (payload.type === 'plusiSkeleton') {
          if (!mascotEnabledRef.current) return;
          console.log('🔵 Plusi skeleton received');
        }

        if (payload.type === 'plusiResult') {
          if (!mascotEnabledRef.current) return;
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

        // Subagent Direct Result — unified handler for all subagent inline messages
        if (payload.type === 'subagent_result') {
          const agentName = payload.agent_name || 'unknown';
          console.log(`Subagent[${agentName}] result received:`, payload.text?.substring(0, 50));

          const _chatForAgent = chatHookRef.current;
          if (_chatForAgent) {
            // Mark pipeline steps as done
            if (_chatForAgent.updatePipelineSteps) {
              _chatForAgent.updatePipelineSteps(prev => {
                return prev.map(s => s.status === 'active' ? {
                  ...s, status: 'done',
                  data: { ...s.data, search_needed: false, retrieval_mode: `subagent:${agentName}` },
                  timestamp: Date.now()
                } : s);
              });
            }

            if (payload.error && agentName !== 'research') {
              // For non-research agents, error = abort. Research shows error in widget.
              console.error(`Subagent[${agentName}] error`);
              if (_chatForAgent.setIsLoading) _chatForAgent.setIsLoading(false);
              if (_chatForAgent.setStreamingMessage) _chatForAgent.setStreamingMessage('');
              setActiveAgentColor(null);
              setActiveAgentName(null);
              return;
            }
            if (payload.silent) {
              if (_chatForAgent.setIsLoading) _chatForAgent.setIsLoading(false);
              if (_chatForAgent.setStreamingMessage) _chatForAgent.setStreamingMessage('');
              setActiveAgentColor(null);
              setActiveAgentName(null);
              return;
            }

            // Set agent info for ThoughtStream and loading indicator
            const agent = findAgent(agentName);
            if (agent) {
              setActiveAgentColor(agent.color);
              setActiveAgentName(agentName);
            }

            // Build pipeline_data for persisted ThoughtStream
            const subagentPipelineData = [{
              step: 'orchestrating', status: 'done',
              data: { search_needed: false, retrieval_mode: `subagent:${agentName}` },
              timestamp: Date.now()
            }];

            if (_chatForAgent.appendMessageRef?.current) {
              // Build agent-specific tool marker
              let widgetMarker;
              if (agentName === 'research' && payload.result) {
                // Research Agent: only the widget marker — ResearchContent renders answer + sources
                widgetMarker = `[[TOOL:${JSON.stringify({
                  name: 'search_web',
                  displayType: 'widget',
                  result: payload.result,
                })}]]`;
                _chatForAgent.appendMessageRef.current(
                  widgetMarker, 'bot', [], {}, null, [], subagentPipelineData
                );
              } else if (agentName === 'plusi' && payload.text) {
                // Plusi: use spawn_plusi widget with mood/friendship
                widgetMarker = `[[TOOL:${JSON.stringify({
                  name: 'spawn_plusi',
                  displayType: 'widget',
                  result: {
                    mood: payload.mood || 'neutral',
                    text: payload.text,
                    meta: payload.meta || '',
                    friendship: payload.friendship || null,
                  }
                })}]]`;
                _chatForAgent.appendMessageRef.current(
                  widgetMarker, 'bot', [], {}, null, [], subagentPipelineData
                );
              } else if (payload.text) {
                // Help and other agents: render as plain text
                _chatForAgent.appendMessageRef.current(
                  payload.text, 'bot', [], {}, null, [], subagentPipelineData
                );
              }
            }
            if (_chatForAgent.setIsLoading) _chatForAgent.setIsLoading(false);
            if (_chatForAgent.setStreamingMessage) _chatForAgent.setStreamingMessage('');
            setActiveAgentColor(null);

            // Update mood if provided (Plusi compatibility)
            if (payload.mood) setAiMood(payload.mood);
          }
        }

        // Card Result — streak tracking + mascot reactions (only when Plusi enabled)
        if (payload.type === 'cardResult' && mascotEnabledRef.current) {
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

        // Subagent registry push from Python
        if (payload.type === 'subagent_registry') {
          setRegistry(payload.agents || []);
          return;
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
        const _insights = insightsHookRef.current;
        // Mark previous card's insights as seen
        if (_insights.currentCardId) {
          _insights.markInsightsSeen(_insights.currentCardId);
        }
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

    // @Subagent intercept is now handled inside useChat.handleSend() via registry-based detection.
    // No App.jsx-level interception needed — useChat routes via bridge.subagentDirect().

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

  // Keyboard Navigation: Cmd+ArrowUp/Down for messages
  useEffect(() => {
    const handleKeyDown = (e) => {
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
      if ((e.metaKey || e.ctrlKey) && e.key === 'x' && activeChat === 'free') {
        e.preventDefault();
        freeChatHookRef.current.resetMessages();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeChat]);

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

  // Report text field focus state to Python for global shortcut routing
  useEffect(() => {
    const onFocusIn = (e) => {
      const tag = e.target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) {
        window.ankiBridge?.addMessage('textFieldFocus', { focused: true });
      }
    };
    const onFocusOut = (e) => {
      const tag = e.target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) {
        window.ankiBridge?.addMessage('textFieldFocus', { focused: false });
      }
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  // Settings speichern
  const handleSaveSettings = (settings) => {
    console.log('💾 App.jsx: Settings gespeichert:', settings);
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
    freeChatHook.loadForDeck(deckId);
    setForceShowOverview(true);
    setActiveChat('free');
  }, [sessionContext.currentSession?.deckId, freeChatHook]);
  useEffect(() => { handleFreeChatOpenRef.current = handleFreeChatOpen; }, [handleFreeChatOpen]);

  // ── Fullscreen FreeChat open/close (merged from MainApp) ──────
  const openFullscreenFreeChat = useCallback((initialText) => {
    freeChatHook.loadForDeck(0);
    setFreeChatTransition('mounting');
    setTimeout(() => {
      setFreeChatTransition('entering');
      setTimeout(() => setFreeChatTransition('visible'), 400);
    }, 50);
    setActiveView('freeChat');
    bridgeAction('chat.stateChanged', { open: true });
    if (initialText?.trim()) {
      setTimeout(() => freeChatHook.handleSend(initialText, 'compact'), 600);
    }
  }, [freeChatHook]);

  const closeFullscreenFreeChat = useCallback(() => {
    if (freeChatHook.isLoading) fullscreenBridge.cancelRequest();
    setFreeChatTransition('exiting');
    bridgeAction('chat.stateChanged', { open: false });
    setTimeout(() => {
      setActiveView('deckBrowser');
      setFreeChatTransition('idle');
    }, 350);
  }, [freeChatHook.isLoading, fullscreenBridge]);

  // ── Register fullscreen actions (merged from MainApp) ──────────
  useEffect(() => {
    registerAction('chat.open', (data) => openFullscreenFreeChat(data?.text || ''), { label: 'Chat oeffnen', description: 'Open free chat overlay' });
    registerAction('chat.close', () => closeFullscreenFreeChat(), { label: 'Chat schliessen', description: 'Close free chat overlay' });
    registerAction('deck.study', (data) => bridgeAction('deck.study', data), { label: 'Deck lernen', description: 'Start studying a deck' });
    registerAction('deck.select', (data) => bridgeAction('deck.select', data), { label: 'Deck auswaehlen', description: 'Select and open a deck' });
    registerAction('view.navigate', (data) => bridgeAction('view.navigate', data), { label: 'Navigieren', description: 'Navigate to a view' });
    registerAction('settings.toggle', () => bridgeAction('settings.toggle'), { label: 'Einstellungen', description: 'Toggle settings sidebar' });
    registerAction('stats.open', () => bridgeAction('stats.open'), { label: 'Statistik', description: 'Open statistics window' });
    registerAction('plusi.ask', () => bridgeAction('plusi.ask'), { label: 'Plusi fragen', description: 'Ask Plusi' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── TopBar tab handler (merged from MainApp) ──────────────────
  const handleTabClick = useCallback((tab) => {
    if (tab === 'stapel') {
      if (activeView === 'freeChat') {
        executeAction('chat.close');
      } else {
        executeAction('view.navigate', 'deckBrowser');
      }
    } else if (tab === 'session') {
      executeAction('view.navigate', 'overview');
    } else if (tab === 'statistik') {
      executeAction('stats.open');
    }
  }, [activeView]);

  const handleSidebarToggle = useCallback(() => {
    executeAction('settings.toggle');
  }, []);

  // ── Keyboard shortcuts for fullscreen FreeChat (merged from MainApp) ──
  useEffect(() => {
    const handler = (e) => {
      if (mainInputFocused) return;
      if (activeView === 'freeChat') {
        if (e.key === 'Escape' || e.key === ' ') {
          e.preventDefault();
          executeAction('chat.close');
        }
      } else if (activeView === 'deckBrowser') {
        if (e.key === ' ') {
          e.preventDefault();
          executeAction('chat.open');
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeView, mainInputFocused]);

  // Focus tracking for fullscreen FreeChat input
  const handleMainInputFocus = useCallback(() => {
    setMainInputFocused(true);
    bridgeAction('system.textFieldFocus', { focused: true });
  }, []);
  const handleMainInputBlur = useCallback(() => {
    setMainInputFocused(false);
    bridgeAction('system.textFieldFocus', { focused: false });
  }, []);

  // Auto-scroll to bottom on fullscreen FreeChat messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [freeChatHook.messages, freeChatHook.streamingMessage]);

  // (handleTrailNavigateLeft/Right defined earlier, before the keyboard useEffect)

  const handleNavigateToOverview = useCallback(() => {
    setForceShowOverview(true);
    if (bridge && bridge.openDeckBrowser) {
      bridge.openDeckBrowser();
    }
  }, [bridge, chatHook, sessionContext]);

  const handleResetChat = useCallback(() => {
    if (confirm('Möchtest du den Chat wirklich zurücksetzen? Alle Nachrichten und Abschnitte werden gelöscht.')) {
      chatHook.setMessages([]);
      cardContextHook.setSections([]);
      cardContextHook.setCurrentSectionId(null);
    }
  }, [chatHook, cardContextHook]);

  // Compact tool: when user confirms, clear chat and trigger extraction
  useEffect(() => {
    const handleCompactConfirmed = () => {
      const cardId = cardContextHook.cardContext?.cardId;
      if (!cardId) return;

      // Trigger extraction with current messages before clearing
      insightsHook.extractInsights(
        cardId,
        cardContextHook.cardContext,
        chatHook.messages,
        null
      );

      // Clear chat immediately
      chatHook.setMessages([]);
      cardContextHook.setSections([]);
      cardContextHook.setCurrentSectionId(null);
    };

    window.addEventListener('compactConfirmed', handleCompactConfirmed);
    return () => window.removeEventListener('compactConfirmed', handleCompactConfirmed);
  }, [cardContextHook, chatHook, insightsHook]);

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

  // Computed view state — used in JSX below
  const isInSubmenu = activeView === 'plusiMenu' || activeView === 'researchMenu' || activeView.startsWith('subMenu:');

  // ── Fullscreen views (DeckBrowser, Overview, FreeChat) — merged from MainApp ──
  const isFreeChatAnimatingIn = freeChatTransition === 'entering' || freeChatTransition === 'visible';
  const showFreeChat = activeView === 'freeChat' && freeChatTransition !== 'idle';

  if (activeView === 'deckBrowser' || activeView === 'overview' || activeView === 'freeChat') {
    return (
      <div style={{
        position: 'fixed', inset: 0,
        display: 'flex', flexDirection: 'column',
        background: showFreeChat && isFreeChatAnimatingIn ? 'var(--ds-bg-deep)' : 'var(--ds-bg-canvas)',
        transition: 'background-color 400ms cubic-bezier(0.25, 0.1, 0.25, 1)',
      }}>
        <TopBar
          activeView={activeView}
          ankiState={ankiState}
          messageCount={freeChatHook.messageCount}
          totalDue={deckBrowserData?.totalDue || 0}
          deckName={overviewData?.deckName || ''}
          dueNew={ankiState === 'overview' ? (overviewData?.dueNew || 0) : (deckBrowserData?.totalNew || 0)}
          dueLearning={ankiState === 'overview' ? (overviewData?.dueLearning || 0) : (deckBrowserData?.totalLearn || 0)}
          dueReview={ankiState === 'overview' ? (overviewData?.dueReview || 0) : (deckBrowserData?.totalReview || 0)}
          onTabClick={handleTabClick}
          onSidebarToggle={handleSidebarToggle}
          holdToResetProps={holdToReset}
        />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {activeView === 'deckBrowser' && (
            <DeckBrowserView data={deckBrowserData} isPremium={isPremium} />
          )}
          {activeView === 'overview' && (
            <OverviewView
              data={overviewData}
              onStudy={() => executeAction('deck.study', { deckId: overviewData?.deckId })}
              onBack={() => executeAction('view.navigate', 'deckBrowser')}
              onOptions={() => bridgeAction('deck.options')}
            />
          )}
          {showFreeChat && (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              opacity: isFreeChatAnimatingIn ? 1 : 0,
              transform: isFreeChatAnimatingIn ? 'translateY(0)' : 'translateY(-12px)',
              transition: 'opacity 350ms cubic-bezier(0.25, 0.1, 0.25, 1) 50ms, transform 350ms cubic-bezier(0.25, 0.1, 0.25, 1) 50ms',
            }}>
              {/* Messages area */}
              <div style={{
                flex: 1, overflowY: 'auto', padding: '20px 16px 120px',
                maxWidth: 720, width: '100%', margin: '0 auto',
              }}>
                {freeChatHook.messages.length === 0 && !freeChatHook.isLoading && !freeChatHook.streamingMessage && (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    height: '100%', color: 'var(--ds-text-muted)', fontSize: 13,
                  }}>
                    Stelle eine Frage...
                  </div>
                )}

                {freeChatHook.messages.map((msg, idx) => (
                  <div key={msg.id} style={{
                    opacity: isFreeChatAnimatingIn ? 1 : 0,
                    transform: isFreeChatAnimatingIn ? 'translateY(0)' : 'translateY(-8px)',
                    transition: `opacity 250ms ease ${200 + Math.min(idx, 10) * 30}ms, transform 250ms ease ${200 + Math.min(idx, 10) * 30}ms`,
                  }}>
                    {msg.from === 'user' && (
                      <>
                        <div className="mb-1">
                          <ErrorBoundary>
                            <ChatMessage
                              message={msg.text} from={msg.from} cardContext={null}
                              steps={[]} citations={{}} pipelineSteps={[]}
                              bridge={fullscreenBridge} isLastMessage={false}
                            />
                          </ErrorBoundary>
                        </div>
                        <ContextTags
                          deckName={msg.deckName} cardFront={msg.cardFront}
                          cardId={msg.cardId} bridge={fullscreenBridge}
                        />
                      </>
                    )}
                    {msg.from === 'bot' && (
                      <div className="mb-6">
                        <ErrorBoundary>
                          <ChatMessage
                            message={msg.text} from={msg.from} cardContext={null}
                            steps={msg.steps || []} citations={msg.citations || {}}
                            pipelineSteps={[]} bridge={fullscreenBridge}
                            isLastMessage={idx === freeChatHook.messages.length - 1}
                          />
                        </ErrorBoundary>
                      </div>
                    )}
                  </div>
                ))}

                {(freeChatHook.isLoading || freeChatHook.streamingMessage) && (
                  <div className="w-full flex-none">
                    <StreamingChatMessage
                      message={freeChatHook.streamingMessage || ''} isStreaming={freeChatHook.isLoading}
                      cardContext={null} steps={[]} citations={{}}
                      pipelineSteps={[]} bridge={fullscreenBridge}
                    />
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input dock -- fixed bottom */}
              <div style={{
                position: 'fixed', bottom: 0, left: 0, right: 0,
                padding: '0 16px 16px', maxWidth: 720, margin: '0 auto', width: '100%',
                opacity: isFreeChatAnimatingIn ? 1 : 0,
                transform: isFreeChatAnimatingIn ? 'translateY(0)' : 'translateY(8px)',
                transition: 'opacity 250ms ease 150ms, transform 250ms ease 150ms',
              }}>
                <ChatInput
                  onSend={(text) => freeChatHook.handleSend(text, 'compact')}
                  isLoading={freeChatHook.isLoading}
                  onStop={() => fullscreenBridge.cancelRequest()}
                  cardContext={null}
                  isPremium={true}
                  onClose={() => executeAction('chat.close')}
                  onFocus={handleMainInputFocus}
                  onBlur={handleMainInputBlur}
                  actionPrimary={{
                    label: 'Schlie\u00DFen',
                    shortcut: '\u2423',
                    onClick: () => executeAction('chat.close'),
                  }}
                  actionSecondary={{
                    label: 'Senden',
                    shortcut: '\u21B5',
                    onClick: () => {},
                    disabled: freeChatHook.isLoading,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
    <style>{`
      @keyframes slideInFromRight {
        from { transform: translateX(30px); opacity: 0; }
        to   { transform: translateX(0);    opacity: 1; }
      }
    `}</style>
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Left: ReviewerView — only in review mode */}
      {activeView === 'review' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--ds-bg-canvas)' }}>
          <TopBar
            activeView="review" ankiState="review"
            messageCount={0} totalDue={deckBrowserData?.totalDue || 0}
            deckName={cardData?.deckName || ''} dueNew={0} dueLearning={0} dueReview={0}
            onTabClick={handleTabClick} onSidebarToggle={handleSidebarToggle}
          />
          <ReviewerView
            cardData={cardData}
            onFlip={() => bridgeAction('card.flip')}
            onRate={(ease) => bridgeAction('card.rate', { ease })}
          />
        </div>
      )}
      {/* Right: Session Chat (always rendered, sidebar width in review) */}
      <div id="chat-root" className="flex flex-col overflow-hidden" style={{
        backgroundColor: 'var(--ds-bg-deep)', color: 'var(--ds-text-primary)',
        width: activeView === 'review' ? 450 : '100%',
        minWidth: activeView === 'review' ? 450 : undefined,
        borderLeft: activeView === 'review' ? '1px solid var(--ds-border-subtle)' : 'none',
        height: '100vh',
        position: 'relative',
        transform: 'translateZ(0)',
      }}>
      {/* Unified TopBar — same header across all views (hidden in review, shown in reviewer panel) */}
      {activeView !== 'review' && <TopBar
        activeView={activeView}
        ankiState={ankiState}
        messageCount={freeChatHook.messageCount}
        totalDue={deckBrowserData?.totalDue || 0}
        deckName={overviewData?.deckName || sessionContext?.currentSession?.deckName || ''}
        dueNew={overviewData?.dueNew || deckBrowserData?.totalNew || 0}
        dueLearning={overviewData?.dueLearning || deckBrowserData?.totalLearn || 0}
        dueReview={overviewData?.dueReview || deckBrowserData?.totalReview || 0}
        onTabClick={handleTabClick}
        onSidebarToggle={handleSidebarToggle}
      />}
      {/* Header — ContextSurface (fixiert oben) */}
      <div ref={headerRef} className="fixed top-0 left-0 right-0 z-40" style={{ overflow: 'visible' }}>
        <ContextSurface
          onNavigateToOverview={handleNavigateToOverview}
          showSessionOverview={showSessionOverview}
          onReset={handleResetChat}
          isResetDisabled={isResetDisabled}
          cardContext={cardContextHook.cardContext}
          sessions={sessionContext.sessions}
          onSelectSession={handleSelectSession}
          bridge={bridge}
        />
        {/* Fade mask — chat content fades out behind the pill (hidden in sub-menus/studio) */}
        {activeView === 'chat' && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', bottom: -56, left: 0, right: 0,
            height: 56, pointerEvents: 'none', zIndex: 10,
            background: 'linear-gradient(to bottom, var(--ds-bg-deep) 0%, var(--ds-bg-deep) 30%, transparent 100%)',
          }}
        />
        )}
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
              freeChatHook={freeChatHook}
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
              {/* Top Fade Gradient — hidden in sub-menus and Agent Studio */}
              {!isInSubmenu && activeView !== 'agentStudio' && (
              <div
                className="fixed left-0 right-0 pointer-events-none z-25"
                style={{
                  top: `${headerHeight}px`,
                  height: '40px',
                  background: 'linear-gradient(to bottom, var(--ds-bg-deep) 0%, var(--ds-bg-deep) 30%, transparent 100%)'
                }}
              />
              )}
              <div
                ref={messagesContainerRef}
                id="messages-container"
                className={`h-full w-full scrollbar-thin relative z-10 ${activeView === 'chat' ? 'overflow-y-auto px-8 pt-20 pb-40' : 'overflow-hidden flex flex-col px-0 pt-2 pb-0'}`}
              >

                {activeView === 'agentStudio' ? (
                  <AgentStudio
                    bridge={bridge}
                    onNavigateToSubmenu={(view) => setActiveView(view)}
                  />
                ) : activeView === 'plusiMenu' ? (
                  <PlusiMenu
                    agent={[...getRegistry().values()].find(a => a.name === 'plusi')}
                    bridge={bridge}
                    onNavigateBack={() => setActiveView('agentStudio')}
                  />
                ) : activeView === 'researchMenu' ? (
                  <ResearchMenu
                    agent={[...getRegistry().values()].find(a => a.name === 'research')}
                    bridge={bridge}
                    onNavigateBack={() => setActiveView('agentStudio')}
                  />
                ) : activeView.startsWith('subMenu:') ? (
                  <StandardSubMenu
                    agent={[...getRegistry().values()].find(a => a.name === activeView.split(':')[1])}
                    bridge={bridge}
                    onNavigateBack={() => setActiveView('agentStudio')}
                  />
                ) : chatHook.messages.length === 0 && !chatHook.isLoading && !chatHook.streamingMessage ? (
            <InsightsDashboard
              insights={insightsHook.insights}
              cardStats={cardContextHook.cardContext?.stats || {}}
              chartData={insightsHook.chartData}
              isExtracting={insightsHook.isExtracting}
              newInsightIds={insightsHook.newInsightIds}
              noNewInsights={insightsHook.noNewInsights}
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
                                  webSources={msg.webSources || null}
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
                                                                webSources={nextMsg.webSources || null}
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
                                                                agentCells={nextMsg.agentCells}
                                                                orchestration={nextMsg.orchestration}
                                                                status="done"
                                                              />
                                                            </ErrorBoundary>
                                                          </div>
                                                        )}
                        {/* ── v2: Live message (structured, single renderer) ── */}
                        {chatHook.currentMessage && !(nextMsg && nextMsg.from === 'bot' && nextMsg.text) && (
                          <div className="w-full flex-none">
                            <ChatMessage
                              message={chatHook.currentMessage.agentCells?.[0]?.text || ''}
                              from="bot"
                              cardContext={cardContextHook.cardContext}
                              agentCells={chatHook.currentMessage.agentCells}
                              orchestration={chatHook.currentMessage.orchestration}
                              status={chatHook.currentMessage.status}
                              pipelineGeneration={chatHook.pipelineGenerationV2}
                              bridge={bridge}
                              isStreaming={true}
                              isLastMessage={true}
                              onPreviewCard={handlePreviewCard}
                            />
                          </div>
                        )}
                        {/* Streaming Message - handles both Loading (Thinking) and Generating phases */}
                        {/* CRITICAL: Only render StreamingChatMessage if no saved bot message exists yet */}
                        {/* This prevents double-rendering when message is saved but timeout hasn't cleared streamingMessage */}
                        {/* Robust: Text-Vergleich verhindert Dopplung auch bei Race Conditions */}
                        {/* Pipeline ThoughtStream — Router + Agent split */}
                        {chatHook.isLoading && !chatHook.currentMessage && !(nextMsg && nextMsg.from === 'bot' && nextMsg.text) && (() => {
                          const allSteps = chatHook.pipelineSteps || [];
                          const rSteps = allSteps.filter(s => s.step === 'orchestrating');
                          const aSteps = allSteps.filter(s => s.step !== 'orchestrating');
                          // Detect agent name from orchestrating step data
                          const liveAgentName = (() => {
                            for (const s of rSteps) {
                              const rm = s.data?.retrieval_mode || '';
                              const m = rm.match(/^(?:subagent|agent):(\w+)$/);
                              if (m) return m[1];
                              if (s.data?.agent) return s.data.agent;
                            }
                            return activeAgentName || 'tutor';
                          })();
                          return (
                            <div className="w-full flex-none mb-2">
                              {/* Router ThoughtStream (before agent) */}
                              {rSteps.length > 0 && (
                                <ThoughtStream
                                  pipelineSteps={rSteps}
                                  agentColor={activeAgentColor}
                                  citations={{}}
                                  isStreaming={true}
                                  message=""
                                  steps={[]}
                                  variant="router"
                                />
                              )}
                              {/* Agent ThoughtStream inside AgenticCell */}
                              {(aSteps.length > 0 || chatHook.streamingMessage) && (
                                <AgenticCell agentName={liveAgentName} isLoading={aSteps.length === 0 && !chatHook.streamingMessage}>
                                  {aSteps.length > 0 && (
                                    <ThoughtStream
                                      pipelineSteps={aSteps}
                                      pipelineGeneration={chatHook.pipelineGeneration}
                                      agentColor={activeAgentColor}
                                      citations={chatHook.currentCitations || {}}
                                      isStreaming={true}
                                      bridge={bridge}
                                      onPreviewCard={handlePreviewCard}
                                      message={chatHook.streamingMessage || ''}
                                      steps={[]}
                                    />
                                  )}
                                  {/* Generating skeleton INSIDE AgenticCell — after all steps done, before text */}
                                  {!chatHook.streamingMessage && aSteps.length > 0 && aSteps.every(s => s.status === 'done') && (
                                    <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                      {[0.92, 0.76, 0.58].map((w, i) => (
                                        <div key={i} style={{ height: 12, borderRadius: 6, width: `${w * 100}%`, background: 'linear-gradient(90deg, var(--ds-hover-tint), var(--ds-active-tint), var(--ds-hover-tint))', backgroundSize: '200% 100%', animation: `ts-shimmerWave 2s ease-in-out infinite ${i * 0.15}s` }} />
                                      ))}
                                    </div>
                                  )}
                                </AgenticCell>
                              )}
                            </div>
                          );
                        })()}
                        {/* Initial routing skeleton — only before any pipeline steps arrive */}
                        {chatHook.isLoading && !chatHook.currentMessage && !chatHook.streamingMessage && (chatHook.pipelineSteps || []).length === 0 && !(nextMsg && nextMsg.from === 'bot' && nextMsg.text) && (
                          <div className="w-full flex-none mb-2" style={{ padding: '0 4px' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {[
                                { label: 'Routing Agent', width: 60 },
                                { label: 'Agent', width: 52 },
                                { label: 'Modus', width: 48 },
                              ].map((tag, i) => (
                                <div
                                  key={tag.label}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 5,
                                    fontSize: 11,
                                    padding: '3px 8px',
                                    borderRadius: 5,
                                    background: 'var(--ds-hover-tint)',
                                    animation: `ts-phaseReveal 0.3s ease-out ${i * 0.1}s both`,
                                  }}
                                >
                                  <span style={{ color: 'var(--ds-text-muted)' }}>{tag.label}</span>
                                  <div style={{ width: tag.width, height: 10, borderRadius: 3, background: 'linear-gradient(90deg, var(--ds-hover-tint), var(--ds-active-tint), var(--ds-hover-tint))', backgroundSize: '200% 100%', animation: 'ts-shimmerWave 2s ease-in-out infinite' }} />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {(chatHook.isLoading || chatHook.streamingMessage) && !chatHook.currentMessage && !(
                          nextMsg &&
                          nextMsg.from === 'bot' &&
                          typeof nextMsg.text === 'string' &&
                          nextMsg.text
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
          isLoading={chatHook.isLoading}
          onStop={chatHook.handleStopRequest}
          cardContext={cardContextHook.cardContext}
          isPremium={isPremium}
          onShowPaywall={() => setShowPaywall(true)}
          authStatus={authStatus}
          currentAuthToken={currentAuthToken}
          onClose={handleClose}
          plusiEnabled={mascotEnabled}
          topSlot={activeView === 'plusiMenu' ? (
            <TokenBudgetSlider value={500} />
          ) : undefined}
          hideInput={isInSubmenu || activeView === 'agentStudio'}
          actionPrimary={{
            label: isInSubmenu ? 'Zurück' : 'Weiter',
            shortcut: 'SPACE',
            onClick: () => {
              if (isInSubmenu) {
                setActiveView('agentStudio');
              } else if (activeView !== 'chat') {
                setActiveView('chat');
              } else if (bridge?.advanceCard) {
                bridge.advanceCard();
              } else {
                handleClose();
              }
            },
          }}
          actionSecondary={{
            label: isInSubmenu || activeView === 'agentStudio' ? 'Chat' : 'Agent Studio',
            shortcut: '↵',
            onClick: () => {
              if (activeView === 'chat') {
                setActiveView('agentStudio');
              } else {
                setActiveView('chat');
              }
            },
          }}
        />
          </div>
        </>
      )}

      {/* Card Preview Modal removed — replaced by universal Preview Mode */}

      {/* Paywall Modal */}
      <PaywallModal
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
      />
    </div>
    </div>
    </ErrorBoundary>
  );
}

/**
 * Main App Component - wraps AppInner with SessionContextProvider
 * If ?view=sidebar is set, render SettingsSidebar instead of chat.
 */
export default function App() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');

  if (view === 'sidebar') {
    return (
      <ErrorBoundary>
        <SettingsSidebar />
      </ErrorBoundary>
    );
  }

  const { bridge, isReady } = useAnki();

  return (
    <SessionContextProvider bridge={bridge} isReady={isReady}>
      <AppInner />
    </SessionContextProvider>
  );
}