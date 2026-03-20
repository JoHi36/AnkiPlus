import React, { useState, useEffect, useRef, useCallback } from 'react';
import ChatMessage from './components/ChatMessage';
import StreamingChatMessage from './components/StreamingChatMessage';
import ChatInput from './components/ChatInput';
import ErrorBoundary from './components/ErrorBoundary';
import CardRefChip from './components/CardRefChip';
import DeckSectionDivider from './components/DeckSectionDivider';
import { useFreeChat } from './hooks/useFreeChat';

/**
 * FreeChatApp — standalone React app for the overlay chat.
 * Uses the exact same components as the session chat.
 * Loaded when URL has ?mode=freechat
 */
export default function FreeChatApp() {
  const [isReady, setIsReady] = useState(false);
  const [animState, setAnimState] = useState('visible');
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);

  const bridge = useRef({
    sendMessage: (data) => {
      window.ankiBridge?.addMessage('sendMessage', data);
    },
    cancelRequest: () => {
      window.ankiBridge?.addMessage('cancelRequest', '');
    },
    goToCard: (cardId) => {
      window.ankiBridge?.addMessage('goToCard', cardId);
    },
    openPreview: (cardId) => {
      window.ankiBridge?.addMessage('openPreview', { cardId: String(cardId) });
    },
  }).current;

  const freeChatHook = useFreeChat({
    bridge,
    onLoadingChange: () => {},
    onCancelComplete: () => {},
  });

  const {
    messages, streamingMessage, isLoading, handleSend,
    handleDeckMessagesLoaded, handleAnkiReceive, loadForDeck,
  } = freeChatHook;

  // Refs for stable callback references (prevent ankiReceive reassignment)
  const handleDeckMessagesLoadedRef = useRef(handleDeckMessagesLoaded);
  const handleAnkiReceiveRef = useRef(handleAnkiReceive);
  const handleSendRef = useRef(handleSend);
  const loadForDeckRef = useRef(loadForDeck);

  useEffect(() => { handleDeckMessagesLoadedRef.current = handleDeckMessagesLoaded; }, [handleDeckMessagesLoaded]);
  useEffect(() => { handleAnkiReceiveRef.current = handleAnkiReceive; }, [handleAnkiReceive]);
  useEffect(() => { handleSendRef.current = handleSend; }, [handleSend]);
  useEffect(() => { loadForDeckRef.current = loadForDeck; }, [loadForDeck]);

  // Set up window.ankiReceive handler ONCE (stable via refs)
  useEffect(() => {
    const queued = window._ankiReceiveQueue?.splice(0) || [];

    window.ankiReceive = (payload) => {
      if (!payload || !payload.type) return;

      if (payload.type === 'deckMessagesLoaded') {
        handleDeckMessagesLoadedRef.current(payload);
        return;
      }

      if (payload.type === 'overlayShow') {
        setAnimState('entering');
        setTimeout(() => setAnimState('visible'), 20);
        loadForDeckRef.current(0);
        if (payload.initialText) {
          setTimeout(() => handleSendRef.current(payload.initialText), 400);
        }
        return;
      }

      if (payload.type === 'overlayHide') {
        setAnimState('exiting');
        return;
      }

      if (payload.type === 'initialText' && payload.text) {
        handleSendRef.current(payload.text);
        return;
      }

      handleAnkiReceiveRef.current(payload);
    };

    queued.forEach(p => window.ankiReceive(p));

    // Load messages from DB immediately on mount
    loadForDeckRef.current(0);

    setIsReady(true);
    return () => { window.ankiReceive = null; };
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage]);

  // ESC key to close
  const handleClose = useCallback(() => {
    if (isLoading) {
      bridge.cancelRequest();
    }
    window.ankiBridge?.addMessage('closeOverlay', '');
  }, [isLoading, bridge]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleClose]);

  const handleSendMessage = useCallback((text) => {
    handleSend(text, 'compact');
  }, [handleSend]);

  const isVisible = animState === 'entering' || animState === 'visible';

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'var(--ds-bg-deep)',
      display: 'flex',
      flexDirection: 'column',
      opacity: isVisible ? 1 : 0,
      transform: isVisible ? 'translateY(0)' : 'translateY(12px)',
      transition: 'opacity 280ms ease, transform 280ms ease',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px 12px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', letterSpacing: '-0.3px' }}>
          Anki<span style={{ color: '#6b8cff' }}>Plus</span>
          <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 400, marginLeft: 8, fontSize: 12 }}>Chat</span>
        </div>
        <button
          onClick={handleClose}
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: 'none',
            borderRadius: 8,
            color: 'rgba(255,255,255,0.4)',
            fontSize: 11,
            padding: '4px 12px',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
        >
          ESC
        </button>
      </div>

      {/* Messages area */}
      <div
        ref={messagesContainerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 16px 120px',
          maxWidth: 720,
          width: '100%',
          margin: '0 auto',
        }}
      >
        {messages.length === 0 && !isLoading && !streamingMessage && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'rgba(255,255,255,0.15)',
            fontSize: 13,
          }}>
            Stelle eine Frage...
          </div>
        )}

        {messages.map((msg, idx) => {
          const prevMsg = idx > 0 ? messages[idx - 1] : null;
          const deckChanged = msg.deckName && (!prevMsg || prevMsg.deckName !== msg.deckName);
          const showDivider = deckChanged || (idx === 0 && msg.deckName);

          return (
            <React.Fragment key={msg.id}>
              {showDivider && <DeckSectionDivider deckName={msg.deckName} />}
              <div className="mb-6">
                <ErrorBoundary>
                  <ChatMessage
                    message={msg.text}
                    from={msg.from}
                    cardContext={null}
                    steps={msg.steps || []}
                    citations={msg.citations || {}}
                    pipelineSteps={[]}
                    bridge={bridge}
                    isLastMessage={idx === messages.length - 1}
                  />
                </ErrorBoundary>
              </div>
              {msg.cardId && (
                <div style={{ padding: '0 16px', marginTop: -16, marginBottom: 16 }}>
                  <CardRefChip cardId={msg.cardId} cardFront={msg.cardFront} bridge={bridge} />
                </div>
              )}
            </React.Fragment>
          );
        })}

        {/* Streaming message */}
        {(isLoading || streamingMessage) && (
          <div className="w-full flex-none">
            <StreamingChatMessage
              message={streamingMessage || ''}
              isStreaming={isLoading}
              cardContext={null}
              steps={[]}
              citations={{}}
              pipelineSteps={[]}
              bridge={bridge}
            />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input — fixed bottom */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '0 16px 16px',
        maxWidth: 720,
        margin: '0 auto',
        width: '100%',
      }}>
        <ChatInput
          onSend={handleSendMessage}
          isLoading={isLoading}
          onStop={() => bridge.cancelRequest()}
          cardContext={null}
          isPremium={true}
          onClose={handleClose}
          actionPrimary={{
            label: 'Schließen',
            shortcut: 'ESC',
            onClick: handleClose,
          }}
          actionSecondary={{
            label: 'Senden',
            shortcut: '↵',
            onClick: () => {},
            disabled: isLoading,
          }}
        />
      </div>
    </div>
  );
}
