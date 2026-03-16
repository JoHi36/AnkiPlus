import React, { useState, useEffect, useRef, useMemo } from 'react';
import ChatMessage from './ChatMessage';

/**
 * StreamingChatMessage Component
 * Wrapper um ChatMessage für Streaming-Nachrichten
 * 
 * WICHTIG: Zeigt Text SOFORT an - keine Animation, die das Streaming verlangsamt
 * - Optimiert mit React.memo um Re-Renders zu vermeiden
 * - Text wird direkt angezeigt, sobald er verfügbar ist
 * 
 * @param {string} message - Der vollständige Text, der angezeigt werden soll
 * @param {boolean} isStreaming - Ob der Text noch streamt (zeigt Cursor)
 * @param {object} cardContext - Kontext für die Karte
 */
const StreamingChatMessage = React.memo(({ message, isStreaming = true, cardContext, steps = [], citations = {}, bridge = null, onPreviewCard }) => {
  const [displayedMessage, setDisplayedMessage] = useState('');

  // Zeige Text SOFORT an - keine Verzögerung für echtes Streaming
  useEffect(() => {
    setDisplayedMessage(message);
  }, [message]);

  // Memoize ChatMessage props um Re-Renders zu vermeiden
  const chatMessageProps = useMemo(() => ({
    message: displayedMessage,
    from: 'bot',
    cardContext,
    isStreaming,
    steps,
    citations,
    bridge,
    onPreviewCard
  }), [displayedMessage, cardContext, isStreaming, steps, citations, bridge, onPreviewCard]);

  return (
    <div className="streaming-message-wrapper">
      <ChatMessage {...chatMessageProps} />
      {isStreaming && (
        <span 
          className="inline-block w-0.5 h-4 bg-primary ml-1 animate-pulse"
          style={{ 
            animation: 'blink 1s infinite',
            verticalAlign: 'middle'
          }}
        />
      )}
      <style>{`
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
        .streaming-message-wrapper {
          will-change: contents;
        }
      `}</style>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison - nur re-render wenn message oder isStreaming sich ändert
  return prevProps.message === nextProps.message && 
         prevProps.isStreaming === nextProps.isStreaming &&
         prevProps.cardContext === nextProps.cardContext &&
         JSON.stringify(prevProps.steps) === JSON.stringify(nextProps.steps) &&
         JSON.stringify(prevProps.citations) === JSON.stringify(nextProps.citations);
});

StreamingChatMessage.displayName = 'StreamingChatMessage';

export default StreamingChatMessage;

