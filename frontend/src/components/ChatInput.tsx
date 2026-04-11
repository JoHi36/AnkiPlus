import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Square } from 'lucide-react';

/**
 * ChatInput — Unified dock-style input component
 * Uses .ds-input-dock from design-system.css (single source of truth)
 * to match the reviewer's floating dock exactly.
 *
 *   - Textarea on top (with animated snake border on focus)
 *   - Send button (absolute, appears when text present)
 *   - Split action row at bottom: configurable via actionPrimary/actionSecondary props
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
  plusiEnabled?: boolean; // When false, @Plusi detection/highlighting is disabled
  topSlot?: React.ReactNode; // Optional content rendered above the textarea (e.g. token budget slider)
  hideInput?: boolean; // When true, hide the textarea row (topSlot + actionbar only)
  placeholder?: string; // Custom placeholder text (default: "Stelle eine Frage...")
  onFocus?: () => void; // Called when the textarea gains focus
  onBlur?: () => void;  // Called when the textarea loses focus
  autoFocus?: boolean; // When true, focus textarea on mount/when becoming true
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
  plusiEnabled = true,
  topSlot,
  hideInput = false,
  placeholder: placeholderProp,
  onFocus: onFocusProp,
  onBlur: onBlurProp,
  autoFocus = false,
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-Grow textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const maxHeight = 120;
      const newHeight = Math.min(textareaRef.current.scrollHeight, maxHeight);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [input]);

  // Auto-focus when prop becomes true (e.g. Nachfragen sidebar opens)
  useEffect(() => {
    if (autoFocus && !hideInput && textareaRef.current) {
      // Delay matches sidebar slide animation (300ms) so textarea is fully visible
      const t = setTimeout(() => textareaRef.current?.focus(), 350);
      return () => clearTimeout(t);
    }
  }, [autoFocus, hideInput]);

  const handleSubmit = (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    const text = input.trim();
    if (text) {
      onSend(text, { mode: 'compact' });
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }
  };

  // Listen for global shortcut filter events (Enter → send, Escape → clear+blur)
  useEffect(() => {
    const handleSend = () => {
      if (input.trim()) {
        handleSubmit();
      }
    };
    const handleClearAndBlur = () => {
      setInput('');
      textareaRef.current?.blur();
      // If in sidebar mode, also close it (ESC was intercepted by Python)
      if (onClose) onClose();
    };
    window.addEventListener('ankiSendMessage', handleSend);
    window.addEventListener('ankiClearAndBlur', handleClearAndBlur);
    return () => {
      window.removeEventListener('ankiSendMessage', handleSend);
      window.removeEventListener('ankiClearAndBlur', handleClearAndBlur);
    };
  }, [input, handleSubmit]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setInput('');
      textareaRef.current?.blur();
      // Immediately tell Python focus is gone (don't wait for 200ms poll)
      window.ankiBridge?.addMessage('textFieldFocus', { focused: false });
      if (onClose) {
        // Sidebar/panel mode: ESC always closes (even when focused)
        onClose();
      }
      return;
    }
    // Space (when not typing) → advance card
    if (e.code === 'Space' && !input.trim() && document.activeElement !== textareaRef.current) {
      e.preventDefault();
      actionPrimary?.onClick();
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

  return (
    <div className="w-full relative">
      <div
        className="ds-input-dock relative overflow-visible transition-all duration-300"
      >
        {/* Animated snake border — blue on focus */}
        <div
          className="absolute pointer-events-none transition-opacity duration-300"
          style={{
            inset: '-1px',
            borderRadius: '17px',
            padding: '1px',
            background: 'conic-gradient(from var(--border-angle, 0deg) at 50% 100%, transparent 0deg, var(--ds-accent-50) 60deg, var(--ds-accent-10) 120deg, transparent 180deg, var(--ds-accent-10) 240deg, var(--ds-accent-50) 300deg, transparent 360deg)',
            WebkitMask: 'linear-gradient(white 0 0) content-box, linear-gradient(white 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
            opacity: isFocused ? 1 : 0,
            animation: 'borderRotate 4s linear infinite',
          }}
        />

        {/* Top slot — e.g. token budget slider when in plusiMenu view */}
        {topSlot}

        {/* Textarea area */}
        {!hideInput && <div style={{ display: 'grid', position: 'relative' }}>
          <div style={{
            gridArea: '1 / 1',
            position: 'relative',
            padding: 'var(--ds-space-md) var(--ds-space-lg)',
            paddingRight: '40px',
          }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => { setIsFocused(true); onFocusProp?.(); }}
              onBlur={() => { setIsFocused(false); onBlurProp?.(); }}
              placeholder={placeholderProp || 'Stelle eine Frage...'}
              data-chat-input="true"
              rows={1}
              style={{
                width: '100%',
                minHeight: '24px',
                maxHeight: '120px',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                resize: 'none',
                color: 'var(--ds-text-primary)',
                fontFamily: 'var(--ds-font-sans)',
                fontSize: 'var(--ds-text-lg)',
                padding: 0,
                caretColor: 'var(--ds-text-primary)',
              }}
            />
          </div>
          {/* Send button — appears when text present */}
          {isLoading ? (
            <button
              type="button"
              onClick={onStop}
              className="ds-send-btn absolute"
              style={{
                right: 'var(--ds-space-md)',
                bottom: '10px',
                background: 'var(--ds-red-10)',
              }}
            >
              <Square size={10} style={{ color: 'var(--ds-red)' }} fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleSubmit()}
              className="ds-send-btn absolute"
              data-empty={!input.trim() ? 'true' : undefined}
              style={{
                right: 'var(--ds-space-md)',
                bottom: '10px',
              }}
            >
              <ArrowUp size={14} strokeWidth={2.5} style={{ color: 'white' }} />
            </button>
          )}
        </div>}

        {/* Split action row — primary (left) | divider | secondary (right) */}
        {actionPrimary && <div className="ds-split-actions">
          <button
            type="button"
            onClick={actionPrimary.onClick}
            disabled={actionPrimary.disabled}
            className="ds-split-btn"
          >
            {actionPrimary.label}
            {(actionPrimary.shortcut === 'ESC' || !isFocused) && actionPrimary.shortcut && (
              <span className="ds-kbd">{actionPrimary.shortcut}</span>
            )}
          </button>

          <div className="ds-split-divider" />

          {actionSecondary && <button
            type="button"
            onClick={actionSecondary.onClick}
            disabled={actionSecondary.disabled}
            className={`ds-split-btn${actionSecondary.pulse ? ' animate-pulse' : ''}`}
            style={actionSecondary.pulse ? { color: 'var(--ds-accent)' } : undefined}
          >
            {actionSecondary.label}
            {!isFocused && actionSecondary.shortcut && (
              <span className="ds-kbd">{actionSecondary.shortcut}</span>
            )}
          </button>}
        </div>}
      </div>
    </div>
  );
}
