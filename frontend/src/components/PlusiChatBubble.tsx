import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type BubbleState = 'typing' | 'waiting' | 'response' | 'voice';

interface PlusiChatBubbleProps {
  open: boolean;
  onClose: () => void;
  onWaiting?: (waiting: boolean) => void;
  plusiText: string | null;
  voiceAudio: string | null;
  voiceTranscript: string | null;
  voiceState: 'idle' | 'recording' | 'processing' | 'speaking';
}

const DEFAULT_MAX_HEIGHT = 200;
const MIN_BUBBLE_HEIGHT = 60;
const R = 8; // corner radius — matches ComponentViewer
const TAIL_EXTEND = 8; // how far tail extends beyond body
const TAIL_DROP = 2; // how far tail drops below body

let _persistedMaxHeight = DEFAULT_MAX_HEIGHT;
let _persistedMaxWidth = 280;

/* ── SVG path generators — identical curves to ComponentViewer ── */

/** Left tail (Plusi speaks) — tail at bottom-left pointing toward mascot */
function leftTailPath(w: number, h: number): string {
  // Body: x=12..w+12, y=0..h. Tail tip at (4, h+2).
  const bw = w + 12; // total SVG body right edge
  return [
    `M ${12 + R} 0`,
    `H ${bw - R}`,
    `A ${R} ${R} 0 0 1 ${bw} ${R}`,
    `V ${h - R}`,
    `A ${R} ${R} 0 0 1 ${bw - R} ${h}`,
    `H 24`,
    `C 18 ${h} 8 ${h + TAIL_DROP} 4 ${h + TAIL_DROP}`,
    `C 8 ${h} 12 ${h - 2} 12 ${h - 8}`,
    `V ${R}`,
    `A ${R} ${R} 0 0 1 ${12 + R} 0`,
    'Z',
  ].join(' ');
}

/** Right tail (user speaks) — tail at bottom-right pointing away from mascot */
function rightTailPath(w: number, h: number): string {
  // Body: x=0..w, y=0..h. Tail tip at (w+8, h+2).
  return [
    `M ${R} 0`,
    `H ${w - R}`,
    `A ${R} ${R} 0 0 1 ${w} ${R}`,
    `V ${h - R}`,
    `C ${w} ${h - 2} ${w + 4} ${h} ${w + TAIL_EXTEND} ${h + TAIL_DROP}`,
    `C ${w + 4} ${h + TAIL_DROP} ${w - 6} ${h} ${w - 12} ${h}`,
    `H ${R}`,
    `A ${R} ${R} 0 0 1 0 ${h - R}`,
    `V ${R}`,
    `A ${R} ${R} 0 0 1 ${R} 0`,
    'Z',
  ].join(' ');
}

/* ── Styles ── */

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  background: 'transparent',
  border: 'none',
  outline: 'none',
  fontSize: 12.5,
  lineHeight: 1.65,
  letterSpacing: '-0.02em',
  color: 'var(--ds-text-primary)',
  fontFamily: "'SF Mono', 'SFMono-Regular', 'Menlo', monospace",
  resize: 'none',
  padding: '14px 16px',
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

/* ── Component ── */

export default function PlusiChatBubble({
  open, onClose, onWaiting, plusiText, voiceAudio, voiceTranscript, voiceState,
}: PlusiChatBubbleProps) {
  const [bubbleState, setBubbleState] = useState<BubbleState>('typing');
  const [inputText, setInputText] = useState('');
  const [displayText, setDisplayText] = useState<string | null>(null);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [maxHeight, _setMaxHeight] = useState(_persistedMaxHeight);
  const [maxWidth, _setMaxWidth] = useState(_persistedMaxWidth);
  const setMaxHeight = useCallback((h: number) => { _persistedMaxHeight = h; _setMaxHeight(h); }, []);
  const setMaxWidth = useCallback((w: number) => { _persistedMaxWidth = w; _setMaxWidth(w); }, []);
  const [size, setSize] = useState({ w: 200, h: 44 });
  const [isOverflowing, setIsOverflowing] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);

  // Measure content size with ResizeObserver
  useEffect(() => {
    if (!contentRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.ceil(width), h: Math.ceil(height) });
    });
    ro.observe(contentRef.current);
    return () => ro.disconnect();
  }, []);

  // Detect overflow
  useEffect(() => {
    if (bubbleState === 'response' && scrollRef.current) {
      setIsOverflowing(scrollRef.current.scrollHeight > maxHeight);
    }
  }, [bubbleState, displayText, maxHeight]);

  // Corner resize (both width + height)
  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { startX: e.clientX, startY: e.clientY, startW: maxWidth, startH: maxHeight };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [maxWidth, maxHeight]);

  const handleResizeMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = dragRef.current.startY - e.clientY; // up = bigger
    setMaxWidth(Math.max(180, dragRef.current.startW + dx));
    setMaxHeight(Math.max(MIN_BUBBLE_HEIGHT, dragRef.current.startH + dy));
  }, [setMaxWidth, setMaxHeight]);

  const handleResizeEnd = useCallback(() => { dragRef.current = null; }, []);

  // Determine tail direction: response = left (Plusi), typing/waiting = right (user)
  const tail = bubbleState === 'response' || bubbleState === 'voice' ? 'left' : 'right';

  // When plusiText arrives, show response
  useEffect(() => {
    if (plusiText && open) { setDisplayText(plusiText); setBubbleState('response'); }
  }, [plusiText, open]);

  useEffect(() => {
    if (voiceAudio && open) setBubbleState('voice');
  }, [voiceAudio, open]);

  useEffect(() => {
    if (voiceState === 'processing' && open) setBubbleState('waiting');
  }, [voiceState, open]);

  useEffect(() => {
    if (open) { setBubbleState('typing'); setInputText(''); setDisplayText(null); }
  }, [open]);

  useEffect(() => {
    if (bubbleState === 'typing' && inputRef.current) inputRef.current.focus();
  }, [bubbleState]);

  // Sync waiting state to parent for mood control
  useEffect(() => {
    onWaiting?.(bubbleState === 'waiting');
  }, [bubbleState, onWaiting]);

  const handleResponseClick = useCallback(() => {
    setBubbleState('typing'); setDisplayText(null); setInputText('');
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = inputText.trim();
      if (!text) return;
      if (window.ankiBridge) {
        window.ankiBridge.addMessage('sendMessage', { message: text, agent: 'plusi' });
      }
      setInputText('');
      setBubbleState('waiting');
    }
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  }, [inputText, onClose]);

  const togglePlayback = useCallback(() => {
    if (!voiceAudio) return;
    if (isPlaying && audioRef.current) { audioRef.current.pause(); setIsPlaying(false); return; }
    const player = new Audio(`data:audio/wav;base64,${voiceAudio}`);
    audioRef.current = player;
    player.ontimeupdate = () => {
      if (player.duration) { setAudioProgress(player.currentTime / player.duration); setAudioDuration(player.duration); }
    };
    player.onended = () => { setIsPlaying(false); setAudioProgress(0); };
    player.play();
    setIsPlaying(true);
  }, [voiceAudio, isPlaying]);

  useEffect(() => {
    return () => { if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; } };
  }, []);

  if (!open) return null;

  // SVG dimensions
  const { w, h } = size;
  const d = tail === 'left' ? leftTailPath(w, h) : rightTailPath(w, h);
  const svgW = tail === 'left' ? w + 12 : w + TAIL_EXTEND;
  const svgH = h + TAIL_DROP;

  return (
    <div style={{
      position: 'absolute',
      bottom: 8,
      left: tail === 'left' ? 48 : 60,
      zIndex: 81,
      animation: 'plusi-bubble-in 200ms var(--ds-ease) both',
    }}>
      <style>{PLUSI_BUBBLE_CSS}</style>

      {/* SVG bubble shape — fill + border, exactly like ComponentViewer */}
      <svg
          width={svgW}
          height={svgH}
          style={{
            position: 'absolute',
            top: 0,
            left: tail === 'left' ? -12 : 0,
            pointerEvents: 'none',
            filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.25))',
          }}
        >
          <path d={d} fill="var(--ds-bg-frosted)" />
          <path d={d} fill="none" stroke="var(--ds-border-subtle)" strokeWidth="1" />
        </svg>

      {/* Content — positioned over the SVG */}
      <div
        ref={contentRef}
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: maxWidth,
          minWidth: 160,
        }}
      >
        {bubbleState === 'typing' && (
          <textarea
            ref={inputRef}
            style={{ ...INPUT_STYLE, maxHeight }}
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
          <div
            ref={scrollRef}
            style={{
              maxHeight,
              overflowY: 'auto',
              padding: '14px 16px',
              scrollbarWidth: 'none',
              cursor: 'pointer',
            }}
            className="plusi-bubble-scroll"
            onClick={handleResponseClick}
          >
            <div className="plusi-md">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {displayText}
              </ReactMarkdown>
            </div>
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

      {/* Resize handle — top-right corner */}
      {isOverflowing && (
        <div
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
          onPointerCancel={handleResizeEnd}
          style={{
            position: 'absolute', top: 2, right: -4,
            width: 20, height: 20,
            cursor: 'nwse-resize', zIndex: 3,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{
            width: 10, height: 3,
            borderTop: '1px solid var(--ds-text-muted)',
            borderBottom: '1px solid var(--ds-text-muted)',
            opacity: 0.4,
            transform: 'rotate(-45deg)',
          }} />
        </div>
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
