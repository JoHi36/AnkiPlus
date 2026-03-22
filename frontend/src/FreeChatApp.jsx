import React, { useState, useEffect, useRef, useCallback } from 'react';
import ChatMessage from './components/ChatMessage';
import StreamingChatMessage from './components/StreamingChatMessage';
import ChatInput from './components/ChatInput';
import ErrorBoundary from './components/ErrorBoundary';
import ContextTags from './components/ContextTags';
import OverlayHeader from './components/OverlayHeader';
import { useFreeChat } from './hooks/useFreeChat';
import { useHoldToReset } from './hooks/useHoldToReset';

/**
 * FreeChatApp — standalone React app for the overlay chat.
 * Renders a pixel-identical header, smooth transitions, and full chat.
 * Loaded when URL has ?mode=freechat
 */
export default function FreeChatApp() {
  const [animState, setAnimState] = useState('hidden'); // hidden | mounting | entering | visible | exiting
  const [inputFocused, setInputFocused] = useState(false);
  const [headerInfo, setHeaderInfo] = useState({ totalDue: 0, dueNew: 0, dueLearning: 0, dueReview: 0 });
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);

  const bridge = useRef({
    sendMessage: (data) => window.ankiBridge?.addMessage('sendMessage', data),
    cancelRequest: () => window.ankiBridge?.addMessage('cancelRequest', ''),
    goToCard: (cardId) => window.ankiBridge?.addMessage('goToCard', cardId),
    openPreview: (cardId) => window.ankiBridge?.addMessage('openPreview', { cardId: String(cardId) }),
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

  // Hold-to-reset
  const chatOpen = animState === 'visible' || animState === 'entering' || animState === 'mounting';
  const holdToReset = useHoldToReset({
    onReset: clearMessages,
    enabled: chatOpen && !inputFocused && !isLoading,
  });

  // Stable refs for ankiReceive
  const handleDeckMessagesLoadedRef = useRef(handleDeckMessagesLoaded);
  const handleAnkiReceiveRef = useRef(handleAnkiReceive);
  const handleSendRef = useRef(handleSend);
  const loadForDeckRef = useRef(loadForDeck);

  useEffect(() => { handleDeckMessagesLoadedRef.current = handleDeckMessagesLoaded; }, [handleDeckMessagesLoaded]);
  useEffect(() => { handleAnkiReceiveRef.current = handleAnkiReceive; }, [handleAnkiReceive]);
  useEffect(() => { handleSendRef.current = handleSend; }, [handleSend]);
  useEffect(() => { loadForDeckRef.current = loadForDeck; }, [loadForDeck]);

  // Set up window.ankiReceive ONCE
  useEffect(() => {
    const queued = window._ankiReceiveQueue?.splice(0) || [];

    window.ankiReceive = (payload) => {
      if (!payload || !payload.type) return;

      if (payload.type === 'deckMessagesLoaded') {
        handleDeckMessagesLoadedRef.current(payload);
        return;
      }

      if (payload.type === 'overlayShow') {
        if (payload.headerInfo) setHeaderInfo(payload.headerInfo);
        // Phase 1: mount the component with transparent background
        setAnimState('mounting');
        // Phase 2: allow one frame to paint the transparent state,
        // then trigger CSS transition to opaque background.
        // Use 50ms delay as safety margin for Qt WebEngine rendering.
        setTimeout(() => {
          setAnimState('entering');
          // Phase 3: after transition completes, mark as fully visible
          setTimeout(() => setAnimState('visible'), 450);
        }, 50);
        loadForDeckRef.current(0);
        if (payload.initialText?.trim()) {
          setTimeout(() => handleSendRef.current(payload.initialText), 600);
        }
        return;
      }

      if (payload.type === 'overlayHide') {
        setAnimState('exiting');
        setTimeout(() => setAnimState('hidden'), 350);
        return;
      }

      if (payload.type === 'initialText' && payload.text) {
        handleSendRef.current(payload.text);
        return;
      }

      handleAnkiReceiveRef.current(payload);
    };

    queued.forEach(p => window.ankiReceive(p));
    loadForDeckRef.current(0);
    return () => { window.ankiReceive = null; };
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage]);

  // Close handler
  const handleClose = useCallback(() => {
    if (isLoading) bridge.cancelRequest();
    window.ankiBridge?.addMessage('closeOverlay', '');
  }, [isLoading, bridge]);

  // Keyboard: Escape and Space to close
  useEffect(() => {
    const handler = (e) => {
      if (inputFocused) return;
      if (e.key === 'Escape' || e.key === ' ') {
        e.preventDefault();
        handleClose();
      }
    };
    if (chatOpen) {
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }
  }, [handleClose, chatOpen, inputFocused]);

  // Focus tracking for input
  const handleInputFocus = useCallback(() => {
    setInputFocused(true);
    window.ankiBridge?.addMessage('textFieldFocus', JSON.stringify({ focused: true }));
  }, []);
  const handleInputBlur = useCallback(() => {
    setInputFocused(false);
    window.ankiBridge?.addMessage('textFieldFocus', JSON.stringify({ focused: false }));
  }, []);

  const handleSendMessage = useCallback((text) => {
    handleSend(text, 'compact');
  }, [handleSend]);

  // Tab click handler
  const handleTabClick = useCallback((tab) => {
    if (tab === 'stapel') {
      handleClose();
    } else {
      window.ankiBridge?.addMessage('closeOverlay', '');
      window.ankiBridge?.addMessage('switchTab', tab);
    }
  }, [handleClose]);

  const isAnimatingIn = animState === 'entering' || animState === 'visible';
  const isMounted = animState !== 'hidden';

  if (!isMounted) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', flexDirection: 'column',
      background: isAnimatingIn ? 'var(--ds-bg-deep)' : 'transparent',
      transition: 'background-color 400ms cubic-bezier(0.25, 0.1, 0.25, 1)',
    }}>
      {/* Header */}
      <OverlayHeader
        chatOpen={true}
        messageCount={messageCount}
        totalDue={headerInfo.totalDue}
        dueNew={headerInfo.dueNew}
        dueLearning={headerInfo.dueLearning}
        dueReview={headerInfo.dueReview}
        onTabClick={handleTabClick}
        onSidebarToggle={() => window.ankiBridge?.addMessage('toggleSidebar', '')}
        holdToResetProps={holdToReset}
      />

      {/* Content area */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        opacity: isAnimatingIn ? 1 : 0,
        transform: isAnimatingIn ? 'translateY(0)' : 'translateY(-12px)',
        transition: 'opacity 350ms cubic-bezier(0.25, 0.1, 0.25, 1) 50ms, transform 350ms cubic-bezier(0.25, 0.1, 0.25, 1) 50ms',
      }}>
        <div
          ref={messagesContainerRef}
          style={{
            flex: 1, overflowY: 'auto', padding: '20px 16px 120px',
            maxWidth: 720, width: '100%', margin: '0 auto',
          }}
        >
          {messages.length === 0 && !isLoading && !streamingMessage && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: '100%', color: 'var(--ds-text-muted)', fontSize: 13,
            }}>
              Stelle eine Frage...
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={msg.id} style={{
              opacity: isAnimatingIn ? 1 : 0,
              transform: isAnimatingIn ? 'translateY(0)' : 'translateY(-8px)',
              transition: `opacity 250ms ease ${200 + Math.min(idx, 10) * 30}ms, transform 250ms ease ${200 + Math.min(idx, 10) * 30}ms`,
            }}>
              {msg.from === 'user' && (
                <>
                  <div className="mb-1">
                    <ErrorBoundary>
                      <ChatMessage
                        message={msg.text} from={msg.from} cardContext={null}
                        steps={[]} citations={{}} pipelineSteps={[]}
                        bridge={bridge} isLastMessage={false}
                      />
                    </ErrorBoundary>
                  </div>
                  <ContextTags
                    deckName={msg.deckName} cardFront={msg.cardFront}
                    cardId={msg.cardId} bridge={bridge}
                  />
                </>
              )}
              {msg.from === 'bot' && (
                <div className="mb-6">
                  <ErrorBoundary>
                    <ChatMessage
                      message={msg.text} from={msg.from} cardContext={null}
                      steps={msg.steps || []} citations={msg.citations || {}}
                      pipelineSteps={[]} bridge={bridge}
                      isLastMessage={idx === messages.length - 1}
                    />
                  </ErrorBoundary>
                </div>
              )}
            </div>
          ))}

          {(isLoading || streamingMessage) && (
            <div className="w-full flex-none">
              <StreamingChatMessage
                message={streamingMessage || ''} isStreaming={isLoading}
                cardContext={null} steps={[]} citations={{}}
                pipelineSteps={[]} bridge={bridge}
              />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input dock */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        padding: '0 16px 16px', maxWidth: 720, margin: '0 auto', width: '100%',
        opacity: isAnimatingIn ? 1 : 0,
        transform: isAnimatingIn ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 250ms ease 150ms, transform 250ms ease 150ms',
      }}>
        <ChatInput
          onSend={handleSendMessage}
          isLoading={isLoading}
          onStop={() => bridge.cancelRequest()}
          cardContext={null}
          isPremium={true}
          onClose={handleClose}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          actionPrimary={{
            label: 'Schließen',
            shortcut: '\u2423',
            onClick: handleClose,
          }}
          actionSecondary={{
            label: 'Senden',
            shortcut: '\u21B5',
            onClick: () => {},
            disabled: isLoading,
          }}
        />
      </div>
    </div>
  );
}
