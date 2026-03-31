import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type BubbleState = 'typing' | 'waiting' | 'response' | 'voice';

interface PlusiChatBubbleProps {
  open: boolean;
  onClose: () => void;
  plusiText: string | null;
  voiceAudio: string | null;
  voiceTranscript: string | null;
  voiceState: 'idle' | 'recording' | 'processing' | 'speaking';
}

const DEFAULT_MAX_HEIGHT = 200;
const MIN_BUBBLE_HEIGHT = 60;

const BUBBLE_CONTAINER: React.CSSProperties = {
  position: 'absolute',
  bottom: 8,
  left: 60,
  maxWidth: 280,
  minWidth: 180,
  background: 'var(--ds-bg-frosted)',
  backdropFilter: 'blur(40px) saturate(1.8)',
  WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
  border: '1px solid var(--ds-border-subtle)',
  borderRadius: 16,
  boxShadow: 'var(--ds-shadow-md)',
  zIndex: 81,
  overflow: 'visible',
  animation: 'plusi-bubble-in 200ms var(--ds-ease) both',
};

/* Tail is now rendered inline as SVG — see PlusiTail below */

const SCROLL_AREA: React.CSSProperties = {
  overflowY: 'auto',
  padding: '14px 16px',
  scrollbarWidth: 'none',
  borderRadius: 16,
};

/* Text style now handled by .plusi-md CSS class (see PLUSI_BUBBLE_CSS) */

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  background: 'transparent',
  border: 'none',
  outline: 'none',
  fontSize: 13,
  lineHeight: 1.55,
  color: 'var(--ds-text-primary)',
  fontFamily: "'Space Grotesk', var(--ds-font-sans)",
  resize: 'none',
  padding: '14px 16px',
  maxHeight: DEFAULT_MAX_HEIGHT,
  overflowY: 'auto',
  scrollbarWidth: 'none',
};

const THINKING_DOTS_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '16px 20px',
};

const DOT_BASE: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: 'var(--ds-text-tertiary)',
};

const VOICE_ROW: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '14px 16px',
};

const VOICE_PLAY: React.CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: '50%',
  background: 'var(--ds-accent-10)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  flexShrink: 0,
  border: 'none',
};

const VOICE_BAR_BG: React.CSSProperties = {
  flex: 1,
  height: 3,
  background: 'var(--ds-hover-tint)',
  borderRadius: 2,
  overflow: 'hidden',
};

const VOICE_TIME: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--ds-text-tertiary)',
};

const VOICE_TRANSCRIPT: React.CSSProperties = {
  padding: '0 16px 12px',
  fontSize: 11,
  color: 'var(--ds-text-tertiary)',
  lineHeight: 1.5,
};

export default function PlusiChatBubble({
  open, onClose, plusiText, voiceAudio, voiceTranscript, voiceState,
}: PlusiChatBubbleProps) {
  const [bubbleState, setBubbleState] = useState<BubbleState>('typing');
  const [inputText, setInputText] = useState('');
  const [displayText, setDisplayText] = useState<string | null>(null);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [maxHeight, setMaxHeight] = useState(DEFAULT_MAX_HEIGHT);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  // Detect overflow in response scroll area
  useEffect(() => {
    if (bubbleState === 'response' && scrollRef.current) {
      setIsOverflowing(scrollRef.current.scrollHeight > maxHeight);
    }
  }, [bubbleState, displayText, maxHeight]);

  // Drag-to-resize from top-right handle
  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { startY: e.clientY, startHeight: maxHeight };
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
  }, [maxHeight]);

  const handleResizeMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    // Dragging UP increases height (negative deltaY = larger)
    const deltaY = dragRef.current.startY - e.clientY;
    const newHeight = Math.max(MIN_BUBBLE_HEIGHT, dragRef.current.startHeight + deltaY);
    setMaxHeight(newHeight);
  }, []);

  const handleResizeEnd = useCallback(() => {
    dragRef.current = null;
  }, []);

  // When plusiText arrives, show response
  useEffect(() => {
    if (plusiText && open) {
      setDisplayText(plusiText);
      setBubbleState('response');
    }
  }, [plusiText, open]);

  useEffect(() => {
    if (voiceAudio && open) {
      setBubbleState('voice');
    }
  }, [voiceAudio, open]);

  useEffect(() => {
    if (voiceState === 'processing' && open) {
      setBubbleState('waiting');
    }
  }, [voiceState, open]);

  // Reset to typing state when bubble opens
  useEffect(() => {
    if (open) {
      setBubbleState('typing');
      setInputText('');
      setDisplayText(null);
    }
  }, [open]);

  // Auto-focus input when in typing state
  useEffect(() => {
    if (bubbleState === 'typing' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [bubbleState]);

  // Click on response text → back to typing
  const handleResponseClick = useCallback(() => {
    setBubbleState('typing');
    setDisplayText(null);
    setInputText('');
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = inputText.trim();
      if (!text) return;
      if (window.ankiBridge) {
        window.ankiBridge.addMessage('sendMessage', {
          message: text,
          agent: 'plusi',
        });
      }
      setInputText('');
      setBubbleState('waiting');
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, [inputText, onClose]);

  const togglePlayback = useCallback(() => {
    if (!voiceAudio) return;
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }
    const player = new Audio(`data:audio/wav;base64,${voiceAudio}`);
    audioRef.current = player;
    player.ontimeupdate = () => {
      if (player.duration) {
        setAudioProgress(player.currentTime / player.duration);
        setAudioDuration(player.duration);
      }
    };
    player.onended = () => {
      setIsPlaying(false);
      setAudioProgress(0);
    };
    player.play();
    setIsPlaying(true);
  }, [voiceAudio, isPlaying]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  if (!open) return null;

  return (
    <div style={BUBBLE_CONTAINER}>
      <style>{PLUSI_BUBBLE_CSS}</style>
      {/* WhatsApp-style tail — left side, pointing toward Plusi */}
      <svg
        width="22" height="28"
        style={{ position: 'absolute', bottom: 8, left: -19, display: 'block' }}
      >
        {/* Fill extends 2px into bubble (x=20→22) to cover its left border */}
        <path
          d="M 22 0 L 22 18 C 20 24 12 27 2 28 C 10 25 18 21 20 12 Z"
          fill="var(--ds-bg-frosted)"
        />
        {/* Stroke only on outer curve, not the edge touching the bubble */}
        <path
          d="M 20 18 C 20 24 12 27 2 28 C 10 25 18 21 20 12"
          fill="none" stroke="var(--ds-border-subtle)" strokeWidth="1"
        />
      </svg>

      {bubbleState === 'typing' && (
        <textarea
          ref={inputRef}
          style={INPUT_STYLE}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Schreib Plusi..."
          rows={1}
          onInput={(e) => {
            const el = e.target as HTMLTextAreaElement;
            el.style.height = 'auto';
            el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px';
          }}
        />
      )}

      {bubbleState === 'waiting' && (
        <div style={THINKING_DOTS_STYLE}>
          <div style={DOT_BASE} className="thinking-dot-pulse" />
          <div style={DOT_BASE} className="thinking-dot-pulse" />
          <div style={DOT_BASE} className="thinking-dot-pulse" />
        </div>
      )}

      {bubbleState === 'response' && displayText && (
        <>
          {/* Resize handle — top-right corner, visible only when content overflows */}
          {isOverflowing && (
            <div
              onPointerDown={handleResizeStart}
              onPointerMove={handleResizeMove}
              onPointerUp={handleResizeEnd}
              onPointerCancel={handleResizeEnd}
              style={{
                position: 'absolute', top: 0, right: 0,
                width: 28, height: 28,
                cursor: 'ns-resize', zIndex: 2,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: '0 16px 0 8px',
              }}
            >
              <div style={{
                width: 14, height: 3,
                borderTop: '1px solid var(--ds-text-muted)',
                borderBottom: '1px solid var(--ds-text-muted)',
                opacity: 0.4,
              }} />
            </div>
          )}
          <div
            ref={scrollRef}
            style={{ ...SCROLL_AREA, maxHeight, cursor: 'pointer' }}
            className="plusi-bubble-scroll"
            onClick={handleResponseClick}
          >
            <div className="plusi-md">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {displayText}
              </ReactMarkdown>
            </div>
          </div>
        </>
      )}

      {bubbleState === 'voice' && (
        <>
          <div style={VOICE_ROW}>
            <button style={VOICE_PLAY} onClick={togglePlayback}>
              <span style={{ color: 'var(--ds-accent)', fontSize: 10, marginLeft: 1 }}>
                {isPlaying ? '⏸' : '▶'}
              </span>
            </button>
            <div style={VOICE_BAR_BG}>
              <div style={{
                height: '100%',
                width: `${audioProgress * 100}%`,
                background: 'var(--ds-accent)',
                borderRadius: 2,
                transition: 'width 100ms linear',
              }} />
            </div>
            <span style={VOICE_TIME}>
              {audioDuration > 0 ? `0:${String(Math.round(audioDuration)).padStart(2, '0')}` : '0:00'}
            </span>
          </div>
          {voiceTranscript && (
            <div style={VOICE_TRANSCRIPT}>"{voiceTranscript}"</div>
          )}
        </>
      )}
    </div>
  );
}

const PLUSI_BUBBLE_CSS = `
  .plusi-md {
    font-size: 12.5px;
    line-height: 1.65;
    font-family: 'SF Mono', 'SFMono-Regular', 'Menlo', monospace;
    color: var(--ds-text-primary);
    letter-spacing: -0.02em;
  }
  .plusi-md strong { color: var(--ds-accent); font-weight: 600; }
  .plusi-md em { color: var(--ds-text-secondary); font-style: normal; opacity: 0.7; }
  .plusi-md code {
    font-size: 11.5px; padding: 1px 5px; border-radius: 4px;
    background: var(--ds-hover-tint); color: var(--ds-accent);
  }
  .plusi-md p { margin: 0 0 8px 0; }
  .plusi-md p:last-child { margin-bottom: 0; }
  .plusi-md ul, .plusi-md ol { margin: 4px 0; padding-left: 16px; }
  .plusi-md li { margin: 2px 0; }
  .plusi-md li::marker { color: var(--ds-text-muted); }
  .plusi-md a { color: var(--ds-accent); text-decoration: none; border-bottom: 1px solid var(--ds-accent-20); }
  .plusi-md blockquote { margin: 6px 0; padding: 4px 10px; border-left: 2px solid var(--ds-accent-30); color: var(--ds-text-secondary); font-style: italic; }
  .plusi-md hr { border: none; border-top: 1px solid var(--ds-border-subtle); margin: 8px 0; }
`;
