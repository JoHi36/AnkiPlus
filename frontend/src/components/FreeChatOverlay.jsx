// frontend/src/components/FreeChatOverlay.jsx
import React, { useEffect, useRef, useState } from 'react';
import ChatMessage from './ChatMessage';
import StreamingChatMessage from './StreamingChatMessage';

/**
 * FreeChatOverlay — full-screen chat overlay on top of the deck browser.
 *
 * All state lives in AppInner and is passed as props — this component is
 * purely presentational + local input state.
 */
export default function FreeChatOverlay({
  messages,
  streamingMessage,
  isLoading,
  initialText,
  onSend,
  onClose,
  bridge,
}) {
  const [inputValue, setInputValue] = useState('');
  const [mode, setMode] = useState('compact');
  const messagesEndRef = useRef(null);
  const hasSentInitialRef = useRef(false);

  // Send initial text on mount (one-shot)
  useEffect(() => {
    if (initialText && !hasSentInitialRef.current) {
      hasSentInitialRef.current = true;
      onSend(initialText, 'compact');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (inputValue.trim()) {
        onSend(inputValue.trim(), mode);
        setInputValue('');
      } else if (!isLoading) {
        // Empty Enter closes when not streaming
        onClose();
      }
    }
  };

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      background: '#0f1117',
      zIndex: 50,
      display: 'flex',
      flexDirection: 'column',
      animation: 'freechat-fadein 0.4s ease forwards',
    }}>
      <style>{`
        @keyframes freechat-fadein {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>

      {/* Top bar — just the X button */}
      <div style={{
        display: 'flex',
        justifyContent: 'flex-end',
        padding: '14px 16px 6px',
        flexShrink: 0,
      }}>
        <button
          onClick={onClose}
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: '#1e1e28',
            border: '1px solid #2a2a38',
            color: '#666',
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      {/* Messages area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '8px 14px',
        scrollbarWidth: 'none',
      }}>
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

        {/* Streaming message */}
        {isLoading && streamingMessage && (
          <StreamingChatMessage
            message={streamingMessage}
            isStreaming={true}
          />
        )}

        {/* Loading indicator when no streaming text yet */}
        {isLoading && !streamingMessage && (
          <div style={{ color: '#3a3a55', fontSize: 12, padding: '8px 0' }}>
            Denkt nach…
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Bottom action input */}
      <div style={{
        padding: '8px 12px 14px',
        borderTop: '1px solid #1a1a24',
        flexShrink: 0,
      }}>
        {/* Mode buttons */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          {['compact', 'detailed', 'overview'].map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                background: mode === m ? '#252545' : '#1a1a28',
                border: `1px solid ${mode === m ? '#4a5aff' : '#252535'}`,
                borderRadius: 8,
                padding: '4px 10px',
                fontSize: 10,
                color: mode === m ? '#8899ff' : '#555',
                cursor: 'pointer',
              }}
            >
              {m === 'compact' ? '⚡ Flash' : m === 'detailed' ? '🔍 Deep' : '📋 Übersicht'}
            </button>
          ))}
        </div>

        {/* Text input row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: '#1a1a28',
          border: '1px solid #252535',
          borderRadius: 16,
          padding: '7px 10px 7px 14px',
        }}>
          <input
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isLoading ? 'Wartet auf Antwort…' : 'Weiterfragen… oder Enter zum Schließen'}
            disabled={isLoading}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#ccc',
              fontSize: 12,
            }}
          />
          {isLoading ? (
            // IMPORTANT: This stop button correctly calls onClose (= handleFreeChatClose
            // in AppInner), which handles the cancel-ack flow:
            //   1. calls startCancel() on the hook
            //   2. calls bridge.cancelRequest()
            //   3. waits for cancel-ack payload before actually closing
            // Do NOT change to setFreeChatOpen(false) — that bypasses cancel-ack.
            <button
              onClick={onClose}
              style={{
                width: 24, height: 24, borderRadius: '50%',
                background: '#3a1a1a', border: '1px solid #5a2a2a',
                color: '#ff6b6b', fontSize: 11, cursor: 'pointer',
              }}
            >
              ■
            </button>
          ) : (
            <button
              onClick={() => { if (inputValue.trim()) { onSend(inputValue.trim(), mode); setInputValue(''); } }}
              style={{
                width: 24, height: 24, borderRadius: '50%',
                background: inputValue.trim() ? '#4a5aff' : '#1e1e38',
                border: 'none', color: '#fff', fontSize: 11, cursor: 'pointer',
              }}
            >
              ↑
            </button>
          )}
        </div>

        <div style={{ fontSize: 9, color: '#2a2a40', textAlign: 'center', marginTop: 4 }}>
          Leeres Enter → zurück zur Stapelansicht
        </div>
      </div>
    </div>
  );
}
