import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { getRegistry } from '@shared/config/subagentRegistry';

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
  stickyAgent?: { name: string; label: string } | null;
  onStickyAgentChange?: (agent: { name: string; label: string } | null) => void;
}


function getTextWidth(text: string, textarea: HTMLTextAreaElement): number {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;
  const style = window.getComputedStyle(textarea);
  ctx.font = `${style.fontSize} ${style.fontFamily}`;
  return ctx.measureText(text).width;
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
  stickyAgent: stickyAgentProp = null,
  onStickyAgentChange,
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [chipAgent, setChipAgent] = useState<{ name: string; label: string } | null>(stickyAgentProp);
  const chipRef = useRef<HTMLSpanElement>(null);
  const [chipWidth, setChipWidth] = useState(0);

  // Measure chip width for text-indent
  useEffect(() => {
    if (chipRef.current) {
      setChipWidth(chipRef.current.offsetWidth);
    } else {
      setChipWidth(0);
    }
  }, [chipAgent]);

  const [ghostVisible, setGhostVisible] = useState(false);
  const [ghostIndex, setGhostIndex] = useState(0);
  const [ghostFilter, setGhostFilter] = useState('');
  const [ghostInteracted, setGhostInteracted] = useState(false); // true after user types or arrows

  // Sync chip from parent prop (e.g. after send resets input)
  useEffect(() => {
    setChipAgent(stickyAgentProp);
  }, [stickyAgentProp]);

  // Listen for "Plusi fragen" from MascotShell context menu
  useEffect(() => {
    if (!plusiEnabled) return;
    const handler = (e: any) => {
      const agent = { name: 'plusi', label: 'Plusi' };
      setChipAgent(agent);
      onStickyAgentChange?.(agent);
      setTimeout(() => textareaRef.current?.focus(), 50);
    };
    window.addEventListener('plusi-ask-focus', handler);
    return () => window.removeEventListener('plusi-ask-focus', handler);
  }, [plusiEnabled, onStickyAgentChange]);

  // Re-render when registry updates (Python pushes agents asynchronously)
  const [registryVersion, setRegistryVersion] = useState(0);
  useEffect(() => {
    const handler = () => setRegistryVersion(v => v + 1);
    window.addEventListener('subagent_registry_updated', handler);
    return () => window.removeEventListener('subagent_registry_updated', handler);
  }, []);

  // Build ghost suggestion list from registry
  const ghostAgents = React.useMemo(() => {
    const registry = getRegistry();
    const FALLBACK_AGENTS = [
      { name: 'tutor', label: 'Tutor', enabled: true },
      { name: 'research', label: 'Research', enabled: true },
      { name: 'help', label: 'Help', enabled: true },
      { name: 'plusi', label: 'Plusi', enabled: true },
    ];
    const registryAgents = registry.size > 0
      ? [...registry.values()].filter((a: any) => a.enabled).sort((a: any, b: any) => a.label.localeCompare(b.label))
      : FALLBACK_AGENTS;

    const settingsEntry = { name: 'agenten', label: 'Agenten', isSettings: true };
    const all: any[] = [settingsEntry, ...registryAgents];

    if (!ghostFilter) return all;
    const lower = ghostFilter.toLowerCase();
    return all.filter((a: any) => a.name.toLowerCase().startsWith(lower) || a.label.toLowerCase().startsWith(lower));
  }, [ghostFilter, registryVersion]);

  const currentGhost = ghostAgents[ghostIndex] || null;

  // Auto-select when only one non-settings agent matches and name is fully typed
  useEffect(() => {
    if (!ghostVisible || !ghostFilter) return;
    const nonSettings = ghostAgents.filter((a: any) => !a.isSettings);
    if (nonSettings.length === 1) {
      const agent = nonSettings[0];
      if (agent.label.toLowerCase() === ghostFilter.toLowerCase()) {
        // Exact match, auto-select
        const newAgent = { name: agent.name, label: agent.label };
        setChipAgent(newAgent);
        onStickyAgentChange?.(newAgent);
        setInput(input.replace(/@\w*$/, '').trimStart());
        setGhostVisible(false);
      }
    }
  }, [ghostAgents, ghostFilter, ghostVisible]);

  // Detect @ in input → activate ghost
  useEffect(() => {
    const atMatch = input.match(/@(\w*)$/);
    if (atMatch) {
      const filter = atMatch[1];
      setGhostFilter(filter);
      setGhostVisible(true);
      setGhostIndex(0);
      if (filter.length > 0) setGhostInteracted(true);
    } else if (input === '@') {
      setGhostFilter('');
      setGhostVisible(true);
      setGhostIndex(0);
      setGhostInteracted(false); // fresh @ — show both options
    } else {
      setGhostVisible(false);
      setGhostInteracted(false);
    }
  }, [input]);

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
    };
    window.addEventListener('ankiSendMessage', handleSend);
    window.addEventListener('ankiClearAndBlur', handleClearAndBlur);
    return () => {
      window.removeEventListener('ankiSendMessage', handleSend);
      window.removeEventListener('ankiClearAndBlur', handleClearAndBlur);
    };
  }, [input, handleSubmit]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Tab on empty input → insert @ and activate ghost (works with or without existing chip)
    if (e.key === 'Tab' && !input && !ghostVisible) {
      e.preventDefault();
      setInput('@');
      return;
    }
    // Ghost autocomplete navigation
    if (ghostVisible && ghostAgents.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setGhostInteracted(true);
        setGhostIndex(prev => (prev + 1) % ghostAgents.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setGhostInteracted(true);
        setGhostIndex(prev => (prev - 1 + ghostAgents.length) % ghostAgents.length);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        if (currentGhost) {
          if ((currentGhost as any).isSettings) {
            // Settings entry — clear the input and close ghost
            setInput(input.replace(/@\w*$/, ''));
            setGhostVisible(false);
          } else {
            // Create chip, remove @text from input
            const newAgent = { name: currentGhost.name, label: currentGhost.label };
            setChipAgent(newAgent);
            onStickyAgentChange?.(newAgent);
            setInput(input.replace(/@\w*$/, '').trimStart());
            setGhostVisible(false);
          }
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setInput(input.replace(/@\w*$/, ''));
        setGhostVisible(false);
        return;
      }
    }
    // Backspace at position 0 with chip → delete chip
    if (e.key === 'Backspace' && chipAgent && textareaRef.current?.selectionStart === 0 && textareaRef.current?.selectionEnd === 0) {
      e.preventDefault();
      setChipAgent(null);
      onStickyAgentChange?.(null);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (onClose) onClose();
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
            WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
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
          {/* Chip + Textarea wrapper */}
          <div style={{
            gridArea: '1 / 1',
            position: 'relative',
            padding: 'var(--ds-space-md) var(--ds-space-lg)',
            paddingRight: '40px',
          }}>
            {/* Agent chip — overlay on first line, textarea indented to make room */}
            {chipAgent && (
              <span ref={chipRef} style={{
                position: 'absolute',
                top: 'var(--ds-space-md)',
                left: 'var(--ds-space-lg)',
                display: 'inline-flex', alignItems: 'center',
                padding: '1px 8px', borderRadius: 6,
                fontSize: 13, fontWeight: 600,
                background: 'var(--ds-accent)', color: 'white',
                lineHeight: '22px', userSelect: 'none', cursor: 'default',
                zIndex: 1,
              }}>
                {chipAgent.label}
              </span>
            )}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => { setIsFocused(true); onFocusProp?.(); }}
              onBlur={() => { setIsFocused(false); onBlurProp?.(); }}
              placeholder={chipAgent ? 'Frage stellen...' : (placeholderProp || 'Stelle eine Frage...')}
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
                textIndent: chipAgent ? `${chipWidth + 8}px` : 0,
              }}
            />
            {/* Ghost autocomplete text */}
            {ghostVisible && currentGhost && (() => {
              const atMatch = input.match(/@(\w*)$/);
              const typed = atMatch ? atMatch[1] : '';
              const ghostLabel = currentGhost.label;
              // Show the suffix that completes what the user typed
              const suffix = ghostLabel.toLowerCase().startsWith(typed.toLowerCase()) && typed.length > 0
                ? ghostLabel.slice(typed.length)
                : ghostLabel;

              if (!suffix) return null;

              return (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: textareaRef.current
                      ? textareaRef.current.offsetLeft + getTextWidth(input, textareaRef.current) + (chipAgent ? chipWidth + 8 : 0)
                      : 0,
                    top: textareaRef.current
                      ? textareaRef.current.offsetTop
                      : 0,
                    color: 'var(--ds-text-placeholder)',
                    fontSize: 'var(--ds-text-lg)',
                    fontFamily: 'var(--ds-font-sans)',
                    pointerEvents: 'none',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    maxWidth: textareaRef.current
                      ? `calc(100% - ${textareaRef.current.offsetLeft + getTextWidth(input, textareaRef.current) + (chipAgent ? chipWidth + 8 : 0)}px)`
                      : undefined,
                    lineHeight: textareaRef.current
                      ? window.getComputedStyle(textareaRef.current).lineHeight
                      : undefined,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {suffix}
                  <kbd style={{
                    fontSize: 10, fontWeight: 500,
                    color: 'var(--ds-text-muted)',
                    background: 'var(--ds-bg-overlay)',
                    borderRadius: 4, padding: '1px 5px',
                    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                    verticalAlign: 'middle',
                  }}>↑↓</kbd>
                  {/* "· Studio Tab" when ghost is Agenten (settings entry) — always, even after scrolling back */}
                  {(currentGhost as any)?.isSettings && (
                    <>
                      <span style={{ color: 'var(--ds-text-placeholder)', fontSize: 'var(--ds-text-lg)' }}> · Studio</span>
                      <kbd style={{
                        fontSize: 10, fontWeight: 500,
                        color: 'var(--ds-text-muted)',
                        background: 'var(--ds-bg-overlay)',
                        borderRadius: 4, padding: '1px 5px',
                        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                        verticalAlign: 'middle',
                      }}>Tab</kbd>
                    </>
                  )}
                  {/* "Tab" badge for real agents — so user knows they can select */}
                  {!(currentGhost as any)?.isSettings && (
                    <kbd style={{
                      fontSize: 10, fontWeight: 500,
                      color: 'var(--ds-text-muted)',
                      background: 'var(--ds-bg-overlay)',
                      borderRadius: 4, padding: '1px 5px',
                      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                      verticalAlign: 'middle',
                    }}>Tab</kbd>
                  )}
                </span>
              );
            })()}
            {/* Tab badge — visible when focused + empty (with or without chip) */}
            {isFocused && !input && !ghostVisible && (
              <kbd style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 10,
                fontWeight: 500,
                color: 'var(--ds-text-muted)',
                background: 'var(--ds-bg-overlay)',
                borderRadius: 4,
                padding: '1px 5px',
                pointerEvents: 'none',
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              }}>
                Tab
              </kbd>
            )}

            {/* ↑↓ badge is now inline with ghost text (rendered inside the ghost span) */}
            {false && (
              <kbd>↑↓</kbd>
            )}
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
            {actionPrimary.shortcut && (
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
