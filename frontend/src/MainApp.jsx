import React, { useState, useEffect, useRef, useCallback } from 'react';
import { registerAction, executeAction, bridgeAction } from './actions';
import { emit } from './eventBus';
import { useFreeChat } from './hooks/useFreeChat';
import { useHoldToReset } from './hooks/useHoldToReset';
import TopBar from './components/TopBar';
import DeckBrowserView from './components/DeckBrowserView';
import OverviewView from './components/OverviewView';

/**
 * MainApp — React root for the fullscreen main view.
 * All UI actions go through the Action Registry (actions.js).
 * Loaded when URL has ?mode=main
 */

// Map domain.past event names to useFreeChat's expected names
const EVENT_NAME_MAP = {
  'chat.loadingChanged': 'loading',
  'chat.chunkReceived': 'streaming',
  'chat.responseCompleted': 'bot',
  'chat.errorOccurred': 'error',
  'chat.messagesCleared': 'deckMessagesCleared',
};

export default function MainApp() {
  // Anki state (from Python)
  const [ankiState, setAnkiState] = useState('deckBrowser');
  const [deckBrowserData, setDeckBrowserData] = useState(null);
  const [overviewData, setOverviewData] = useState(null);
  const [isPremium, setIsPremium] = useState(false);

  // View state (React-internal)
  const [activeView, setActiveView] = useState('deckBrowser'); // deckBrowser | overview | freeChat
  const activeViewRef = useRef('deckBrowser'); // ref for use in ankiReceive closure
  const [freeChatTransition, setFreeChatTransition] = useState('idle');
  const [inputFocused, setInputFocused] = useState(false);

  // Keep ref in sync
  useEffect(() => { activeViewRef.current = activeView; }, [activeView]);

  const bridge = useRef({
    sendMessage: (data) => bridgeAction('chat.send', data),
    cancelRequest: () => bridgeAction('chat.cancel'),
    goToCard: (cardId) => bridgeAction('card.goTo', cardId),
    openPreview: (cardId) => bridgeAction('card.preview', { cardId: String(cardId) }),
  }).current;

  const freeChatHook = useFreeChat({
    bridge,
    onLoadingChange: () => {},
    onCancelComplete: () => {},
  });

  const {
    messages, streamingMessage, isLoading, handleSend,
    handleDeckMessagesLoaded, handleAnkiReceive, loadForDeck,
    clearMessages, messageCount,
  } = freeChatHook;

  const holdToReset = useHoldToReset({
    onReset: clearMessages,
    enabled: activeView === 'freeChat' && !inputFocused && !isLoading,
  });

  // Stable refs
  const handleDeckMessagesLoadedRef = useRef(handleDeckMessagesLoaded);
  const handleAnkiReceiveRef = useRef(handleAnkiReceive);
  const loadForDeckRef = useRef(loadForDeck);

  useEffect(() => { handleDeckMessagesLoadedRef.current = handleDeckMessagesLoaded; }, [handleDeckMessagesLoaded]);
  useEffect(() => { handleAnkiReceiveRef.current = handleAnkiReceive; }, [handleAnkiReceive]);
  useEffect(() => { loadForDeckRef.current = loadForDeck; }, [loadForDeck]);

  // ankiReceive handler — ONCE
  useEffect(() => {
    const queued = window._ankiReceiveQueue?.splice(0) || [];

    window.ankiReceive = (payload) => {
      if (!payload || !payload.type) return;

      // Emit through Event Bus before processing (agents can subscribe)
      emit(payload.type, payload);

      if (payload.type === 'app.stateChanged' || payload.type === 'stateChanged') {
        const { state, data, freeChatWasOpen } = payload;
        setAnkiState(state);

        if (state === 'deckBrowser') {
          setDeckBrowserData(data);
          setIsPremium(data?.isPremium || false);
          if (freeChatWasOpen) {
            setActiveView('freeChat');
            setFreeChatTransition('visible');
            loadForDeckRef.current(0);
          } else {
            // If FreeChat was active, close it cleanly
            if (activeViewRef.current === 'freeChat') {
              setFreeChatTransition('idle');
            }
            setActiveView('deckBrowser');
          }
        } else if (state === 'overview') {
          // Force-exit FreeChat if active (Python changed state)
          if (activeViewRef.current === 'freeChat') {
            bridge.cancelRequest(); // cancel any in-flight AI request
            setFreeChatTransition('idle');
            bridgeAction('chat.stateChanged', { open: false });
          }
          setOverviewData(data);
          setActiveView('overview');
        }
        return;
      }

      if (payload.type === 'chat.messagesLoaded') {
        handleDeckMessagesLoadedRef.current(payload);
        return;
      }

      // Agent/Python can trigger React-side actions
      if (payload.type === 'executeAction') {
        executeAction(payload.action, payload.data);
        return;
      }

      // All other payloads — map domain.past names to useFreeChat's expected names
      const mappedType = EVENT_NAME_MAP[payload.type];
      if (mappedType) {
        handleAnkiReceiveRef.current({ ...payload, type: mappedType });
      } else {
        handleAnkiReceiveRef.current(payload);
      }
    };

    queued.forEach(p => window.ankiReceive(p));
    return () => { window.ankiReceive = null; };
  }, []);

  // -- FreeChat open/close --

  const openFreeChat = useCallback((initialText) => {
    loadForDeck(0);
    setFreeChatTransition('mounting');
    setTimeout(() => {
      setFreeChatTransition('entering');
      setTimeout(() => setFreeChatTransition('visible'), 400);
    }, 50);
    setActiveView('freeChat');
    // Notify Python for state persistence
    bridgeAction('chat.stateChanged', { open: true });
    if (initialText?.trim()) {
      setTimeout(() => handleSend(initialText, 'compact'), 600);
    }
  }, [loadForDeck, handleSend]);

  const closeFreeChat = useCallback(() => {
    if (isLoading) bridge.cancelRequest();
    setFreeChatTransition('exiting');
    bridgeAction('chat.stateChanged', { open: false });
    setTimeout(() => {
      setActiveView('deckBrowser');
      setFreeChatTransition('idle');
    }, 350);
  }, [isLoading, bridge]);

  // -- Keyboard shortcuts --

  useEffect(() => {
    const handler = (e) => {
      if (inputFocused) return;

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
  }, [activeView, inputFocused, openFreeChat, closeFreeChat]);

  // Focus tracking
  const handleInputFocus = useCallback(() => {
    setInputFocused(true);
    bridgeAction('system.textFieldFocus', { focused: true });
  }, []);
  const handleInputBlur = useCallback(() => {
    setInputFocused(false);
    bridgeAction('system.textFieldFocus', { focused: false });
  }, []);

  // -- Navigation callbacks (passed to child components) --

  // -- Register actions (once, on mount) --

  useEffect(() => {
    registerAction('chat.open', (data) => openFreeChat(data?.text || ''), { label: 'Chat oeffnen', description: 'Open free chat overlay' });
    registerAction('chat.close', () => closeFreeChat(), { label: 'Chat schliessen', description: 'Close free chat overlay' });
    registerAction('deck.study', (data) => bridgeAction('deck.study', data), { label: 'Deck lernen', description: 'Start studying a deck' });
    registerAction('deck.select', (data) => bridgeAction('deck.select', data), { label: 'Deck auswaehlen', description: 'Select and open a deck' });
    registerAction('view.navigate', (data) => bridgeAction('view.navigate', data), { label: 'Navigieren', description: 'Navigate to a view' });
    registerAction('settings.toggle', () => bridgeAction('settings.toggle'), { label: 'Einstellungen', description: 'Toggle settings sidebar' });
    registerAction('stats.open', () => bridgeAction('stats.open'), { label: 'Statistik', description: 'Open statistics window' });
    registerAction('plusi.ask', () => bridgeAction('plusi.ask'), { label: 'Plusi fragen', description: 'Ask Plusi' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // -- Render --

  const isFreeChatAnimatingIn = freeChatTransition === 'entering' || freeChatTransition === 'visible';
  const showFreeChat = activeView === 'freeChat' && freeChatTransition !== 'idle';

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
        messageCount={messageCount}
        totalDue={deckBrowserData?.totalDue || 0}
        deckName={overviewData?.deckName || ''}
        dueNew={ankiState === 'overview' ? (overviewData?.dueNew || 0) : (deckBrowserData?.totalNew || 0)}
        dueLearning={ankiState === 'overview' ? (overviewData?.dueLearning || 0) : (deckBrowserData?.totalLearn || 0)}
        dueReview={ankiState === 'overview' ? (overviewData?.dueReview || 0) : (deckBrowserData?.totalReview || 0)}
        onTabClick={handleTabClick}
        onSidebarToggle={handleSidebarToggle}
        holdToResetProps={holdToReset}
      />

      {/* View content — placeholder divs, replaced in Tasks 4-7 */}
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
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ds-text-muted)' }}>
            FreeChat (Task 8)
          </div>
        )}
      </div>
    </div>
  );
}
