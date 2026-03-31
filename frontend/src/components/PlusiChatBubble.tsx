import React, { useState, useRef, useEffect, useCallback } from 'react';

type BubbleState = 'typing' | 'waiting' | 'response' | 'voice';

interface PlusiChatBubbleProps {
  open: boolean;
  onClose: () => void;
  plusiText: string | null;
  voiceAudio: string | null;
  voiceTranscript: string | null;
  voiceState: 'idle' | 'recording' | 'processing' | 'speaking';
}

const MAX_HEIGHT = 200;

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
  overflow: 'hidden',
  animation: 'plusi-bubble-in 200ms var(--ds-ease) both',
};

/* Tail is now rendered inline as SVG — see PlusiTail below */

const SCROLL_AREA: React.CSSProperties = {
  maxHeight: MAX_HEIGHT,
  overflowY: 'auto',
  padding: '14px 16px',
  scrollbarWidth: 'none',
};

const TEXT_STYLE: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.55,
  color: 'var(--ds-text-primary)',
  fontFamily: "'Space Grotesk', var(--ds-font-sans)",
};

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
  maxHeight: MAX_HEIGHT,
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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
      {/* WhatsApp-style tail — left side, pointing toward Plusi */}
      <svg
        width="10" height="16"
        style={{ position: 'absolute', bottom: 10, left: -9, display: 'block' }}
      >
        <path
          d="M 10 0 L 10 10 C 10 13 6 15 1 16 C 5 14 9 12 9 6 Z"
          fill="var(--ds-bg-frosted)"
        />
        <path
          d="M 10 10 C 10 13 6 15 1 16 C 5 14 9 12 9 6"
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
            el.style.height = Math.min(el.scrollHeight, MAX_HEIGHT) + 'px';
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
        <div
          style={{ ...SCROLL_AREA, cursor: 'pointer' }}
          className="plusi-bubble-scroll"
          onClick={handleResponseClick}
        >
          <div style={TEXT_STYLE}>{displayText}</div>
        </div>
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
