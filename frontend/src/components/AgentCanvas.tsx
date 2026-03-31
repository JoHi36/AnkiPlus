import React from 'react';

interface CanvasMessage {
  role: string;
  content: string;
  id?: string;
}

interface AgentCanvasProps {
  messages: CanvasMessage[];
  streamingText?: string | null;
  isLoading?: boolean;
}

const CANVAS_STYLE: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 4,
  pointerEvents: 'none',
};

const PLACEHOLDER_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 8,
  opacity: 0,
  animation: 'agentCanvasFadeIn 0.2s ease 0.25s forwards',
};

const SPARKLE_STYLE: React.CSSProperties = {
  fontSize: 44,
  color: 'var(--ds-text-muted)',
  opacity: 0.3,
};

const HINT_STYLE: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--ds-text-tertiary)',
};

const MESSAGES_STYLE: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  width: '100%',
  maxWidth: 'var(--ds-content-width)',
  padding: '80px 20px 100px',
  pointerEvents: 'auto',
  scrollbarWidth: 'none',
};

const USER_MSG_STYLE: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: 14,
  background: 'var(--ds-accent-10)',
  color: 'var(--ds-text-primary)',
  fontSize: 15,
  lineHeight: 1.5,
  marginBottom: 12,
  maxWidth: '80%',
  alignSelf: 'flex-end',
};

const BOT_MSG_STYLE: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: 14,
  background: 'var(--ds-bg-overlay)',
  color: 'var(--ds-text-primary)',
  fontSize: 15,
  lineHeight: 1.5,
  marginBottom: 12,
  maxWidth: '90%',
  alignSelf: 'flex-start',
  whiteSpace: 'pre-wrap',
};

const STREAMING_STYLE: React.CSSProperties = {
  ...BOT_MSG_STYLE,
  opacity: 0.8,
};

/**
 * AgentCanvas — renders in the deckBrowser block when lid-lift is open.
 * Shows a placeholder sparkle when empty, or simple message bubbles when present.
 * Uses its own lightweight message rendering (no ChatMessage dependency).
 */
export default function AgentCanvas({
  messages,
  streamingText,
  isLoading,
}: AgentCanvasProps) {
  const hasContent = messages.length > 0 || (streamingText != null && streamingText.length > 0) || isLoading;

  if (!hasContent) {
    return (
      <div style={CANVAS_STYLE}>
        <div style={PLACEHOLDER_STYLE}>
          <span style={SPARKLE_STYLE}>✦</span>
          <span style={HINT_STYLE}>Frag mich etwas über diesen Stapel</span>
        </div>
        <style>{`
          @keyframes agentCanvasFadeIn { to { opacity: 1; } }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ ...CANVAS_STYLE, justifyContent: 'flex-start', pointerEvents: 'auto' }}>
      <div style={{ ...MESSAGES_STYLE, display: 'flex', flexDirection: 'column' }}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={msg.role === 'user' ? USER_MSG_STYLE : BOT_MSG_STYLE}
          >
            {msg.content}
          </div>
        ))}
        {streamingText != null && streamingText.length > 0 && (
          <div style={STREAMING_STYLE}>{streamingText}</div>
        )}
        {isLoading && !streamingText && (
          <div style={{ ...BOT_MSG_STYLE, opacity: 0.4 }}>...</div>
        )}
      </div>
      <style>{`
        @keyframes agentCanvasFadeIn { to { opacity: 1; } }
      `}</style>
    </div>
  );
}
