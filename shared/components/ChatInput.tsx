import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { findAgent, getRegistry } from '../config/subagentRegistry';

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
  onFocus?: () => void; // Called when the textarea gains focus
  onBlur?: () => void;  // Called when the textarea loses focus
}

/** Renders agent icon — uses createPlusi for Plusi, registry SVG for others.
 *  SVG content comes from our own Python registry (trusted, not user input). */
function MentionAgentIcon({ name, svg, color, label }: { name: string; svg: string; color: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.textContent = '';

    // Plusi: use the animated createPlusi renderer if available
    if (name === 'plusi' && (window as any).createPlusi) {
      (window as any).createPlusi(ref.current, { mood: 'neutral', size: 20, animated: false });
      return;
    }

    // Others: parse registry SVG safely via DOMParser (trusted source: our Python registry)
    if (svg) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svg.trim(), 'image/svg+xml');
      const svgEl = doc.documentElement;
      if (svgEl && svgEl.nodeName === 'svg') {
        svgEl.setAttribute('width', '20');
        svgEl.setAttribute('height', '20');
        ref.current.appendChild(svgEl);
      }
    }
  }, [name, svg]);

  // Fallback: colored letter initial
  if (!svg && name !== 'plusi') {
    return (
      <div style={{
        width: 20, height: 20, borderRadius: 5, flexShrink: 0,
        background: `${color}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, color,
      }}>
        {label[0]}
      </div>
    );
  }
  return <div ref={ref} style={{ width: 20, height: 20, flexShrink: 0, color }} />;
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
  onFocus: onFocusProp,
  onBlur: onBlurProp,
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Detect @AgentName case-insensitive, normalize to @Label at front
  // Uses subagent registry for dynamic agent detection
  const [activeAgentTag, setActiveAgentTag] = useState<{ name: string; label: string; color: string } | null>(null);

  // @-mention autocomplete
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);

  // Auto mode entry — router decides which agent handles the message
  const AUTO_ENTRY = React.useMemo(() => ({
    name: 'auto',
    label: 'Auto',
    color: '#A78BFA',
    enabled: true,
    isDefault: false,
    isAuto: true,
    description: 'Router entscheidet automatisch',
    iconType: 'svg',
    iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z"/></svg>',
  }), []);

  // Build filtered agent list for autocomplete
  const mentionAgents = React.useMemo(() => {
    const registry = getRegistry();
    const FALLBACK_AGENTS = [
      { name: 'plusi', label: 'Plusi', color: '#0A84FF', pipelineLabel: 'Plusi', enabled: true },
    ];
    const registryAgents = registry.size > 0
      ? [...registry.values()].filter(a => a.enabled)
      : (plusiEnabled ? FALLBACK_AGENTS : []);
    // Auto first, then all agents
    const agents = [AUTO_ENTRY, ...registryAgents];
    if (!mentionFilter) return agents;
    const lower = mentionFilter.toLowerCase();
    return agents.filter(a => a.name.includes(lower) || a.label.toLowerCase().includes(lower));
  }, [mentionFilter, plusiEnabled, AUTO_ENTRY]);

  // Detect @ trigger
  useEffect(() => {
    // Show menu when input is exactly "@" or starts with "@" and no space after @Name yet
    if (input === '@' || (input.startsWith('@') && !input.includes(' ') && !activeAgentTag)) {
      const filter = input.slice(1); // everything after @
      setMentionFilter(filter);
      setShowMentionMenu(true);
      setMentionIndex(0);
    } else {
      setShowMentionMenu(false);
    }
  }, [input, activeAgentTag]);

  const selectMentionAgent = useCallback((agent: any) => {
    if (agent.isAuto) {
      // Auto mode: clear any @tag, let the router decide
      setInput('');
      setShowMentionMenu(false);
      setActiveAgentTag(null);
    } else {
      setInput(`@${agent.label} `);
      setShowMentionMenu(false);
      setActiveAgentTag({ name: agent.name, label: agent.label, color: agent.color });
    }
    setTimeout(() => textareaRef.current?.focus(), 20);
  }, []);

  useEffect(() => {
    // Check if input already starts with a known @Agent tag
    if (activeAgentTag && input.startsWith(`@${activeAgentTag.label}`)) return;

    // Try to detect @AgentName pattern
    const match = input.match(/@(\w+)/i);
    if (!match || match.index === undefined) {
      if (activeAgentTag) setActiveAgentTag(null);
      return;
    }

    const typed = match[1].toLowerCase();
    let agent: any = findAgent(typed) || null;
    // Fallback: check hardcoded names if registry is empty
    if (!agent) {
      if (typed === 'plusi' && plusiEnabled) {
        agent = { name: 'plusi', label: 'Plusi', color: '#0A84FF' };
      } else if (typed === 'research') {
        agent = { name: 'research', label: 'Research', color: '#00D084' };
      }
    }

    if (agent) {
      const prefix = `@${agent.label}`;
      const without = input.slice(0, match.index) + input.slice(match.index + match[0].length);
      const cleaned = without.replace(/^\s+/, '');
      setInput(prefix + ' ' + cleaned);
      setActiveAgentTag({ name: agent.name, label: agent.label, color: agent.color });
    } else {
      if (activeAgentTag) setActiveAgentTag(null);
    }
  }, [input, plusiEnabled]);

  const hasAgentTag = !!activeAgentTag;
  const agentTagLabel = activeAgentTag ? `@${activeAgentTag.label}` : '';
  const agentTagColor = activeAgentTag?.color || '#0A84FF';
  // Backwards compat
  const hasPlusiTag = hasAgentTag && activeAgentTag?.name === 'plusi';

  // Listen for "Plusi fragen" from MascotShell context menu
  useEffect(() => {
    if (!plusiEnabled) return;
    const handler = (e: any) => {
      const prefix = e.detail?.prefix || '@Plusi ';
      setInput(prefix);
      setTimeout(() => textareaRef.current?.focus(), 50);
    };
    window.addEventListener('plusi-ask-focus', handler);
    return () => window.removeEventListener('plusi-ask-focus', handler);
  }, [plusiEnabled]);

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
    // @-mention menu navigation
    if (showMentionMenu && mentionAgents.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(prev => (prev + 1) % mentionAgents.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(prev => (prev - 1 + mentionAgents.length) % mentionAgents.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        selectMentionAgent(mentionAgents[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMentionMenu(false);
        return;
      }
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
        style={hasAgentTag ? { borderColor: `${agentTagColor}66`, background: `${agentTagColor}0D` } : undefined}
      >
        {/* Animated snake border — blue on focus or @Plusi tag */}
        <div
          className="absolute pointer-events-none transition-opacity duration-300"
          style={{
            inset: '-1px',
            borderRadius: '17px',
            padding: '1px',
            background: hasAgentTag
              ? `conic-gradient(from var(--border-angle, 0deg) at 50% 100%, ${agentTagColor}00 0deg, ${agentTagColor}80 60deg, ${agentTagColor}1A 120deg, ${agentTagColor}00 180deg, ${agentTagColor}1A 240deg, ${agentTagColor}80 300deg, ${agentTagColor}00 360deg)`
              : 'conic-gradient(from var(--border-angle, 0deg) at 50% 100%, rgba(10,132,255,0.0) 0deg, rgba(10,132,255,0.5) 60deg, rgba(10,132,255,0.1) 120deg, rgba(10,132,255,0.0) 180deg, rgba(10,132,255,0.1) 240deg, rgba(10,132,255,0.5) 300deg, rgba(10,132,255,0.0) 360deg)',
            WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
            opacity: (isFocused || hasAgentTag) ? 1 : 0,
            animation: 'borderRotate 4s linear infinite',
          }}
        />

        {/* @-mention autocomplete dropdown */}
        {showMentionMenu && mentionAgents.length > 0 && (
          <div style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: 6,
            background: 'var(--ds-bg-frosted)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid var(--ds-border-subtle)',
            borderRadius: 14,
            overflow: 'hidden',
            boxShadow: '0 -4px 24px rgba(0,0,0,0.3)',
            zIndex: 50,
            minWidth: 200,
          }}>
            {mentionAgents.map((agent, i) => {
              const isSelected = i === mentionIndex;
              const displayColor = (!agent.color || agent.color === 'transparent') ? 'var(--ds-text-secondary)' : agent.color;
              const isAuto = (agent as any).isAuto;
              // Separator before first real agent (after Auto)
              const showSeparator = i > 0 && mentionAgents[i - 1] && (mentionAgents[i - 1] as any).isAuto;
              return (
                <React.Fragment key={agent.name}>
                  {showSeparator && (
                    <div style={{ height: 1, margin: '2px 12px', background: 'var(--ds-border-subtle)' }} />
                  )}
                  <div
                    onClick={() => selectMentionAgent(agent)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 14px',
                      cursor: 'pointer',
                      background: isSelected ? `${displayColor}12` : 'transparent',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={() => setMentionIndex(i)}
                  >
                    {/* Agent icon */}
                    <MentionAgentIcon name={agent.name} svg={(agent as any).iconSvg || ''} color={displayColor} label={agent.label} />
                    {/* Agent label + description */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 600,
                        color: displayColor,
                      }}>
                        {isAuto ? agent.label : `@${agent.label}`}
                      </div>
                      {(agent as any).description && (
                        <div style={{
                          fontSize: 10,
                          color: 'var(--ds-text-muted)',
                          marginTop: 1,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                          {(agent as any).description}
                        </div>
                      )}
                    </div>
                    {/* Keyboard hint */}
                    {isSelected && (
                      <span style={{
                        fontSize: 9, color: 'var(--ds-text-muted)',
                        flexShrink: 0,
                      }}>
                        Tab ↵
                      </span>
                    )}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        )}

        {/* Top slot — e.g. token budget slider when in plusiMenu view */}
        {topSlot}

        {/* Textarea area — grid stack: overlay behind textarea, both same size */}
        {!hideInput && <div style={{ display: 'grid', position: 'relative' }}>
          {/* Highlight overlay — same grid cell as textarea */}
          {hasAgentTag && (() => {
            const idx = input.indexOf(agentTagLabel);
            const before = input.slice(0, idx);
            const after = input.slice(idx + agentTagLabel.length);
            return (
              <div
                aria-hidden="true"
                style={{
                  gridArea: '1 / 1',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontSize: 'var(--ds-text-lg)',
                  lineHeight: '1.625',
                  fontFamily: 'var(--ds-font-sans)',
                  overflow: 'hidden',
                  color: 'var(--ds-text-primary)',
                  padding: 'var(--ds-space-md) var(--ds-space-lg)',
                  paddingRight: '40px',
                  pointerEvents: 'none',
                  minHeight: '24px',
                }}
              >
                {before && <span>{before}</span>}
                <span style={{
                  background: `${agentTagColor}2E`,
                  color: agentTagColor,
                  borderRadius: '3px',
                }}>{agentTagLabel}</span>
                {after && <span>{after}</span>}
              </div>
            );
          })()}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => { setIsFocused(true); onFocusProp?.(); }}
            onBlur={() => { setIsFocused(false); onBlurProp?.(); }}
            placeholder="Stelle eine Frage..."
            data-chat-input="true"
            rows={1}
            style={{
              gridArea: '1 / 1',
              minHeight: '24px',
              maxHeight: '120px',
              paddingRight: '40px',
              color: hasAgentTag ? 'transparent' : undefined,
              caretColor: 'var(--ds-text-primary)',
              WebkitTextFillColor: hasAgentTag ? 'transparent' : undefined,
            }}
          />
          {/* Send button — appears when text present */}
          {isLoading ? (
            <button
              type="button"
              onClick={onStop}
              className="ds-send-btn absolute"
              style={{
                right: 'var(--ds-space-md)',
                bottom: '10px',
                background: 'rgba(255,69,58,0.15)',
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
