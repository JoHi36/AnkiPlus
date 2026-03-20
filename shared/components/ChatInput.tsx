import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Square } from 'lucide-react';

/**
 * ChatInput — Unified dock-style input component
 * Matches the reviewer's floating dock design:
 *   - Textarea on top (with animated snake border on focus)
 *   - Send button (absolute, appears when text present)
 *   - Action row at bottom: configurable via actionPrimary/actionSecondary props
 *
 * Typing a question + Enter sends a concrete question (compact mode).
 */

interface ActionConfig {
  label: string;
  shortcut?: string;    // display only, e.g. 'SPACE', 'ESC', '⌘X'
  onClick: () => void;
  disabled?: boolean;
  pulse?: boolean;      // animated highlight (lowScorePulse equivalent)
}

export interface ChatInputProps {
  onSend: (text: string, options?: { mode?: string }) => void;
  onOpenSettings?: () => void;
  isLoading: boolean;
  onStop?: () => void;
  cardContext?: any;
  isPremium?: boolean;
  onShowPaywall?: () => void;
  authStatus?: any;
  currentAuthToken?: string;
  onClose?: () => void; // Used by ESC handler in handleKeyDown to close the parent panel
  actionPrimary: ActionConfig;
  actionSecondary: ActionConfig;
}

export default function ChatInput({
  onSend,
  onOpenSettings,
  isLoading,
  onStop,
  cardContext,
  isPremium = false,
  onShowPaywall,
  authStatus = {},
  currentAuthToken = '',
  onClose,
  actionPrimary,
  actionSecondary,
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Detect @Plusi case-insensitive, normalize to @Plusi at front
  useEffect(() => {
    if (input.startsWith('@Plusi')) return;
    const match = input.match(/@plusi/i);
    if (match && match.index !== undefined) {
      const without = input.slice(0, match.index) + input.slice(match.index + 6);
      const cleaned = without.replace(/^\s+/, '');
      setInput('@Plusi ' + cleaned);
    }
  }, [input]);

  const hasPlusiTag = input.startsWith('@Plusi');

  // Auto-focus textarea when component mounts (chat panel opened)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }, 200);
    return () => clearTimeout(timer);
  }, []);

  // Listen for "Plusi fragen" from MascotShell context menu
  useEffect(() => {
    const handler = (e: any) => {
      const prefix = e.detail?.prefix || '@Plusi ';
      setInput(prefix);
      setTimeout(() => textareaRef.current?.focus(), 50);
    };
    window.addEventListener('plusi-ask-focus', handler);
    return () => window.removeEventListener('plusi-ask-focus', handler);
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

  const handleSubmit = (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    const text = input.trim();
    if (text) {
      onSend(text, { mode: 'compact' });
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (onClose) onClose();
      return;
    }
    // Space (when not typing) → advance card
    if (e.code === 'Space' && !input.trim() && document.activeElement !== textareaRef.current) {
      e.preventDefault();
      actionPrimary.onClick();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim()) {
        handleSubmit(e);
      } else {
        // Enter with empty input → trigger Übersicht
        actionSecondary.onClick();
      }
    }
  };

  // Global keydown for Space shortcut (when textarea not focused)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        actionPrimary.onClick();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [actionPrimary.onClick]);

  return (
    <div className="w-full relative">
      <div
        className="relative backdrop-blur-xl rounded-2xl overflow-visible transition-all duration-300"
        style={{
          backgroundColor: 'rgba(21,21,21,0.75)',
          border: hasPlusiTag ? '1px solid rgba(10,132,255,0.4)' : '1px solid var(--ds-active-tint)',
          boxShadow: 'var(--ds-shadow-md)',
        }}
      >
        {/* Animated snake border — blue on focus or @Plusi tag */}
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
            opacity: (isFocused || hasPlusiTag) ? 1 : 0,
            animation: 'borderRotate 4s linear infinite',
          }}
        />

        {/* Textarea area — grid stack: overlay behind textarea, both same size */}
        <div style={{ display: 'grid', padding: '12px 16px', position: 'relative' }}>
          {/* Highlight overlay — same grid cell as textarea */}
          {hasPlusiTag && (() => {
            const idx = input.indexOf('@Plusi');
            const before = input.slice(0, idx);
            const after = input.slice(idx + 6);
            return (
              <div
                aria-hidden="true"
                style={{
                  gridArea: '1 / 1',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontSize: '15px',
                  lineHeight: '1.625',
                  fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
                  overflow: 'hidden',
                  color: 'rgba(232,232,232,0.9)',
                  paddingRight: '40px',
                  pointerEvents: 'none',
                  minHeight: '24px',
                }}
              >
                {before && <span>{before}</span>}
                <span style={{
                  background: 'rgba(10,132,255,.18)',
                  color: 'var(--ds-accent)',
                  borderRadius: '3px',
                }}>@Plusi</span>
                {after && <span>{after}</span>}
              </div>
            );
          })()}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Stelle eine Frage..."
            rows={1}
            style={{
              gridArea: '1 / 1',
              width: '100%',
              minHeight: '24px',
              maxHeight: '120px',
              padding: 0,
              paddingRight: '40px',
              background: 'transparent',
              fontSize: '15px',
              lineHeight: '1.625',
              fontFamily: 'inherit',
              resize: 'none',
              outline: 'none',
              border: 'none',
              color: hasPlusiTag ? 'transparent' : 'rgba(232,232,232,0.9)',
              caretColor: 'white',
              WebkitTextFillColor: hasPlusiTag ? 'transparent' : undefined,
            }}
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

        {/* Action row — configurable via actionPrimary/actionSecondary props */}
        <div
          className="flex items-center"
          style={{ borderTop: '1px solid var(--ds-border-subtle)' }}
        >
          {/* Primary action (left) */}
          <button
            type="button"
            onClick={actionPrimary.onClick}
            disabled={actionPrimary.disabled}
            className="flex-1 flex items-center justify-center gap-1 h-[44px] bg-transparent border-none cursor-pointer transition-colors duration-100 hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              fontFamily: 'inherit',
              fontSize: '13px',
              fontWeight: '600',
              color: 'var(--ds-text-primary)',
              borderRadius: '0',
              borderBottomLeftRadius: '16px',
            }}
          >
            {actionPrimary.label}
            {actionPrimary.shortcut && (
              <span style={{
                fontFamily: 'ui-monospace, monospace',
                fontSize: '10px',
                color: 'var(--ds-text-muted)',
                marginLeft: '4px',
              }}>{actionPrimary.shortcut}</span>
            )}
          </button>

          {/* Divider */}
          <div style={{ width: '1px', height: '16px', background: 'var(--ds-border-subtle)', flexShrink: 0 }} />

          {/* Secondary action (right) */}
          <button
            type="button"
            onClick={actionSecondary.onClick}
            disabled={actionSecondary.disabled}
            className={`flex-1 flex items-center justify-center gap-1.5 h-[44px] bg-transparent border-none cursor-pointer transition-all duration-200 hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed ${
              actionSecondary.pulse ? 'animate-pulse' : ''
            }`}
            style={{
              fontFamily: 'inherit',
              fontSize: '13px',
              fontWeight: '500',
              color: actionSecondary.pulse ? 'var(--ds-accent)' : 'var(--ds-text-tertiary)',
              borderRadius: '0',
              borderBottomRightRadius: '16px',
            }}
          >
            {actionSecondary.label}
            {actionSecondary.shortcut && (
              <span style={{
                fontFamily: 'ui-monospace, monospace',
                fontSize: '10px',
                color: 'var(--ds-text-muted)',
                marginLeft: '4px',
              }}>{actionSecondary.shortcut}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
