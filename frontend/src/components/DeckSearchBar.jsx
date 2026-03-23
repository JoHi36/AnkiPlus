// frontend/src/components/DeckSearchBar.jsx
import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';

const PHRASES = [
  'Stelle eine Frage\u2026',
  'Erkl\u00e4re die Nernst-Gleichung\u2026',
  'Fasse Kapitel 3 zusammen\u2026',
  'Was ist der Unterschied zwischen\u2026',
  'Hilf mir beim Verstehen von\u2026',
];

const PLACEHOLDER_INTERVAL_MS = 6000;
const PLACEHOLDER_FADE_MS = 400;
const RADIUS = 14;
const BORDER = 1.5;

/**
 * DeckSearchBar — search input for the deck browser.
 *
 * Features:
 * - Rotating placeholders every 6s with fade animation
 * - Snake border (animated conic-gradient) on focus
 * - ⌘K / Ctrl+K badge when idle; hides on focus or when text entered
 * - Blue send arrow appears when text is entered
 * - ankiClearAndBlur event clears + blurs the input
 *
 * Props:
 *   onSubmit(text)  — called with trimmed text when user sends
 *   onOpenEmpty()   — called on Enter without text, or double-click
 */
export default function DeckSearchBar({ onSubmit, onOpenEmpty }) {
  const [value, setValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [placeholderVisible, setPlaceholderVisible] = useState(true);
  const inputRef = useRef(null);

  const hasText = value.trim().length > 0;
  const isMac = typeof navigator !== 'undefined' &&
    (((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '')
      .toUpperCase().indexOf('MAC') >= 0);

  /* ── Rotating placeholder ── */
  useEffect(() => {
    const id = setInterval(() => {
      /* Skip rotation when focused or typing */
      if (inputRef.current === document.activeElement || hasText) return;

      /* Fade out current, swap text, fade in */
      setPlaceholderVisible(false);
      setTimeout(() => {
        setPlaceholderIndex(idx => (idx + 1) % PHRASES.length);
        setPlaceholderVisible(true);
      }, PLACEHOLDER_FADE_MS);
    }, PLACEHOLDER_INTERVAL_MS);
    return () => clearInterval(id);
  }, [hasText]);

  /* ── ankiClearAndBlur: GlobalShortcutFilter can dispatch this ── */
  useEffect(() => {
    const handler = () => {
      setValue('');
      inputRef.current?.blur();
    };
    window.addEventListener('ankiClearAndBlur', handler);
    return () => window.removeEventListener('ankiClearAndBlur', handler);
  }, []);

  /* ── Submit helpers ── */
  const submitSearch = () => {
    const t = value.trim();
    if (!t) return;
    onSubmit?.(t);
    setValue('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (hasText) {
        submitSearch();
      } else {
        onOpenEmpty?.();
      }
    }
  };

  const handleDoubleClick = () => {
    onOpenEmpty?.();
  };

  /* Show Cmd+K badge: input is empty AND not focused */
  const showCmdK = !hasText && !isFocused;

  return (
    <div style={{ maxWidth: 520, margin: '0 auto 20px', padding: '0 4px' }}>
      {/* Snake-border outer ring — gradient fills this, inner div covers center */}
      <div
        className={`deck-search-snake-ring${isFocused ? ' active' : ''}`}
        style={{
          position: 'relative',
          borderRadius: RADIUS,
          padding: isFocused ? BORDER : 1,
          background: isFocused ? undefined : 'var(--ds-border-subtle)',
          transition: 'padding 0.15s',
          overflow: 'hidden',
        }}
      >
        {/* Input surface */}
        <div style={{
          position: 'relative',
          background: 'var(--ds-bg-frosted)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: RADIUS - BORDER,
          display: 'flex',
          alignItems: 'center',
          padding: '10px 14px 10px 38px',
          gap: 8,
        }}>
          {/* Sparkle icon */}
          <span style={{
            position: 'absolute',
            left: 13,
            color: 'var(--ds-accent)',
            fontSize: 14,
            lineHeight: 1,
            userSelect: 'none',
          }}>✦</span>

          {/* Input with animated placeholder overlay */}
          <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
            <input
              ref={inputRef}
              className="deck-search-input"
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onDoubleClick={handleDoubleClick}
              placeholder=""
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                boxShadow: 'none',
                WebkitAppearance: 'none',
                color: 'var(--ds-text-primary)',
                fontSize: 14,
                lineHeight: '20px',
              }}
            />

            {/* Animated placeholder text — hidden when user types or browser native placeholder shows */}
            {!hasText && (
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: 0,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--ds-text-tertiary)',
                  fontSize: 14,
                  lineHeight: '20px',
                  pointerEvents: 'none',
                  userSelect: 'none',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  maxWidth: '100%',
                  opacity: placeholderVisible ? 1 : 0,
                  transition: `opacity ${PLACEHOLDER_FADE_MS}ms ease`,
                }}
              >
                {PHRASES[placeholderIndex]}
              </span>
            )}
          </div>

          {/* Right-side: send button when typing, Cmd+K badge when idle */}
          {hasText ? (
            <button
              onClick={submitSearch}
              style={{
                width: 26, height: 26, borderRadius: '50%',
                background: 'var(--ds-accent)',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, padding: 0,
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              aria-label="Senden"
            >
              <ArrowUp size={14} color="var(--ds-bg-canvas)" strokeWidth={2.5} />
            </button>
          ) : (
            <kbd
              style={{
                fontSize: 10, fontWeight: 500,
                color: 'var(--ds-text-tertiary)',
                background: 'var(--ds-bg-overlay)',
                borderRadius: 5,
                padding: '2px 6px',
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                flexShrink: 0,
                lineHeight: 1.4,
                opacity: showCmdK ? 1 : 0,
                transition: 'opacity 0.15s',
                pointerEvents: 'none',
              }}
            >
              {isMac ? '⌘K' : 'Ctrl+K'}
            </kbd>
          )}
        </div>
      </div>

      <style>{`
        /* Snake border: always-rotating gradient, only visible (via active class) on focus */
        .deck-search-snake-ring.active {
          background:
            conic-gradient(
              from var(--deck-search-snake-angle, 0deg),
              transparent 0deg, transparent 55%,
              var(--ds-accent) 60%, var(--ds-purple) 72%,
              #38bdf8 81%, var(--ds-accent) 86%,
              transparent 92%
            );
          animation: deck-search-snake-rotate 2.5s linear infinite;
        }
        @keyframes deck-search-snake-rotate {
          from { --deck-search-snake-angle: 0deg; }
          to   { --deck-search-snake-angle: 360deg; }
        }
        @property --deck-search-snake-angle {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }
        /* Suppress browser/DaisyUI focus rings */
        .deck-search-input:focus,
        .deck-search-input:focus-visible {
          outline: none !important;
          box-shadow: none !important;
          border: none !important;
        }
        /* Hide the native placeholder — we use our own animated one */
        .deck-search-input::placeholder {
          color: transparent;
        }
      `}</style>
    </div>
  );
}
