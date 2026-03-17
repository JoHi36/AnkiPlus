// frontend/src/components/FreeChatView.jsx
import React, { useEffect, useRef } from 'react';
import ChatMessage from './ChatMessage';
import StreamingChatMessage from './StreamingChatMessage';
import ChatInput from '@shared/components/ChatInput';

/**
 * FreeChatView — inline chat view rendered inside DeckBrowser.
 * No absolute positioning. Flex column, fills available height via flex: 1.
 */
export default function FreeChatView({
  freeChatHook,
  initialText,
  onClose,      // handleFreeChatClose in App.jsx (cancel-ack aware)
  bridge,
  animPhase,    // 'entering' | 'entered' | 'exiting' — drives own opacity/transform
}) {
  const { messages, streamingMessage, isLoading, handleSend, resetMessages } = freeChatHook;
  const messagesEndRef = useRef(null);
  const hasSentInitialRef = useRef(false);

  // One-shot: send initial text on mount
  useEffect(() => {
    if (initialText && !hasSentInitialRef.current) {
      hasSentInitialRef.current = true;
      handleSend(initialText, 'compact');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage]);

  const isVisible = animPhase === 'entering' || animPhase === 'entered';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        overflow: 'hidden',
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(-12px)',
        transition: 'opacity 280ms ease, transform 280ms ease',
      }}
    >
      {/* Messages area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 14px 8px',
          scrollbarWidth: 'none',
        }}
      >
        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            message={msg.text}
            from={msg.from}
            cardContext={null}
            citations={msg.citations || {}}
            bridge={bridge}
          />
        ))}

        {isLoading && streamingMessage && (
          <StreamingChatMessage message={streamingMessage} isStreaming={true} />
        )}

        {isLoading && !streamingMessage && (
          <div style={{ color: '#3a3a55', fontSize: 12, padding: '8px 0' }}>
            Denkt nach…
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ChatInput dock — fades in with 150ms delay after messages area */}
      <div
        style={{
          padding: '0 10px 10px',
          flexShrink: 0,
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? 'translateY(0)' : 'translateY(8px)',
          transition: 'opacity 250ms ease 150ms, transform 250ms ease 150ms',
        }}
      >
        <ChatInput
          onSend={(text, options) => handleSend(text, options?.mode ?? 'compact')}
          isLoading={isLoading}
          onStop={onClose}
          onClose={onClose}
          actionPrimary={{
            label: 'Schließen',
            shortcut: 'ESC',
            onClick: onClose,
          }}
          actionSecondary={{
            label: 'Zurücksetzen',
            shortcut: '⌘X',
            onClick: resetMessages,
          }}
        />
      </div>
    </div>
  );
}
