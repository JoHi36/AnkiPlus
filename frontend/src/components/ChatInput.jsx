import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Square, CornerDownLeft } from 'lucide-react';

/**
 * ChatInput — Unified dock-style input component
 * Matches the reviewer's floating dock design:
 *   - Textarea on top (with animated snake border on focus)
 *   - Send button (absolute, appears when text present)
 *   - Action row at bottom: [Weiter SPACE | Übersicht]
 *
 * "Weiter" closes the side panel and advances to next card.
 * "Übersicht" triggers a full topic summary in the chat.
 * Typing a question + Enter sends a concrete question (compact mode).
 */
export default function ChatInput({
  onSend,
  onOverview,
  onOpenSettings,
  isLoading,
  onStop,
  cardContext,
  bridge,
  isPremium = false,
  onShowPaywall,
  authStatus = {},
  currentAuthToken = '',
  onClose,
  lowScorePulse = false,
}) {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef(null);

  // Auto-focus textarea when component mounts (chat panel opened)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }, 200);
    return () => clearTimeout(timer);
  }, []);

  // Auto-Grow textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const maxHeight = 120;
      const newHeight = Math.min(textareaRef.current.scrollHeight, maxHeight);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [input]);

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    const text = input.trim();
    if (text) {
      onSend(text, { mode: 'compact' });
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }
  };

  const handleAdvance = () => {
    // Close panel and advance to next card
    if (bridge && bridge.advanceCard) {
      bridge.advanceCard();
    } else if (onClose) {
      onClose();
    }
  };

  const handleOverview = () => {
    if (onOverview) {
      onOverview();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (onClose) onClose();
      return;
    }
    // Space (when not typing) → advance card
    if (e.code === 'Space' && !input.trim() && document.activeElement !== textareaRef.current) {
      e.preventDefault();
      handleAdvance();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim()) {
        handleSubmit(e);
      } else {
        // Enter with empty input → trigger Übersicht
        handleOverview();
      }
    }
  };

  // Global keydown for Space shortcut (when textarea not focused)
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        handleAdvance();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [bridge, onClose]);

  return (
    <div className="w-full relative">
      <div
        className="relative backdrop-blur-xl rounded-2xl overflow-visible transition-all duration-300"
        style={{
          backgroundColor: 'rgba(21,21,21,0.75)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        }}
      >
        {/* Animated snake border — visible when textarea focused */}
        <div
          className="absolute pointer-events-none transition-opacity duration-300"
          style={{
            inset: '-1px',
            borderRadius: '17px',
            padding: '1px',
            background: 'conic-gradient(from var(--border-angle, 0deg) at 50% 100%, rgba(10,132,255,0.0) 0deg, rgba(10,132,255,0.5) 60deg, rgba(10,132,255,0.1) 120deg, rgba(10,132,255,0.0) 180deg, rgba(10,132,255,0.1) 240deg, rgba(10,132,255,0.5) 300deg, rgba(10,132,255,0.0) 360deg)',
            WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
            opacity: isFocused ? 1 : 0,
            animation: 'borderRotate 4s linear infinite',
          }}
        />

        {/* Textarea area */}
        <div className="relative px-4 py-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Stelle eine Frage..."
            rows="1"
            className="w-full min-h-[24px] max-h-[120px] p-0 pr-10 bg-transparent text-base-content text-[15px] leading-relaxed resize-none outline-none placeholder:text-base-content/25"
            style={{ border: 'none' }}
          />
          {/* Send button — appears when text present */}
          {isLoading ? (
            <button
              type="button"
              onClick={onStop}
              className="absolute right-3 bottom-2.5 w-[30px] h-[30px] rounded-full flex items-center justify-center border-none cursor-pointer transition-all duration-150"
              style={{ background: 'rgba(255,69,58,0.15)' }}
            >
              <Square size={10} className="text-error" fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleSubmit()}
              className={`absolute right-3 bottom-2.5 w-[30px] h-[30px] rounded-full flex items-center justify-center border-none cursor-pointer transition-all duration-150 ${
                input.trim()
                  ? 'opacity-100 scale-100 bg-primary'
                  : 'opacity-0 scale-75 pointer-events-none bg-primary'
              }`}
            >
              <ArrowUp size={14} strokeWidth={2.5} className="text-white" />
            </button>
          )}
        </div>

        {/* Action row — matches dock design */}
        <div
          className="flex items-center"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          {/* Weiter */}
          <button
            type="button"
            onClick={handleAdvance}
            className="flex-1 flex items-center justify-center gap-1 h-[44px] bg-transparent border-none cursor-pointer transition-colors duration-100 hover:bg-white/[0.04]"
            style={{
              fontFamily: 'inherit',
              fontSize: '13px',
              fontWeight: '600',
              color: 'rgba(255,255,255,0.88)',
              borderRadius: '0',
              borderBottomLeftRadius: '16px',
            }}
          >
            Weiter
            <span style={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: '10px',
              color: 'rgba(255,255,255,0.18)',
              marginLeft: '4px',
            }}>SPACE</span>
          </button>

          {/* Divider */}
          <div style={{
            width: '1px',
            height: '16px',
            background: 'rgba(255,255,255,0.06)',
            flexShrink: 0,
          }} />

          {/* Übersicht — triggers full topic summary */}
          <button
            type="button"
            onClick={handleOverview}
            disabled={isLoading}
            className={`flex-1 flex items-center justify-center gap-1.5 h-[44px] bg-transparent border-none cursor-pointer transition-all duration-200 hover:bg-white/[0.04] ${
              lowScorePulse ? 'animate-pulse' : ''
            } ${isLoading ? 'opacity-30 cursor-not-allowed' : ''}`}
            style={{
              fontFamily: 'inherit',
              fontSize: '13px',
              fontWeight: '500',
              color: lowScorePulse ? 'rgba(10,132,255,0.8)' : 'rgba(255,255,255,0.35)',
              borderRadius: '0',
              borderBottomRightRadius: '16px',
            }}
          >
            Übersicht
            <CornerDownLeft size={11} className="opacity-40" />
          </button>
        </div>
      </div>
    </div>
  );
}
