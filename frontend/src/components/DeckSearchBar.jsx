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
const RADIUS = 16;
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
    <div>
      {/* Snake-border outer ring — ::before pseudo renders the gradient, content stays visible */}
      <div
        className={`deck-search-snake-ring${isFocused ? ' active' : ''}`}
        style={{
          position: 'relative',
          borderRadius: RADIUS,
          padding: BORDER,
          overflow: 'hidden',
        }}
      >
        {/* Input surface — glass gradient with frosted backdrop */}
        <div className="ds-frosted deck-search-surface" style={{
          position: 'relative',
          borderRadius: RADIUS - BORDER,
          display: 'flex',
          alignItems: 'center',
          padding: '12px 16px 12px 42px',
          minHeight: 46,
          gap: 8,
        }}>
          {/* Sparkle icon */}
          <span style={{
            position: 'absolute',
            left: 16,
            color: 'color-mix(in srgb, var(--ds-accent) 65%, transparent)',
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
        /* Default: subtle border */
        .deck-search-snake-ring {
          background: var(--ds-border-subtle);
        }
        /* On focus: hide default border, show snake pseudo */
        .deck-search-snake-ring.active {
          background: transparent;
        }
        /* Snake as ::before — masked to 1.5px ring, content unaffected */
        .deck-search-snake-ring::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 1.5px;
          background:
            conic-gradient(
              from var(--deck-search-snake-angle, 0deg),
              color-mix(in srgb, var(--ds-accent)  0%, transparent)   0deg,
              color-mix(in srgb, var(--ds-accent) 55%, transparent)  60deg,
              color-mix(in srgb, var(--ds-accent) 12%, transparent) 120deg,
              color-mix(in srgb, var(--ds-accent)  0%, transparent) 180deg,
              color-mix(in srgb, var(--ds-accent) 12%, transparent) 240deg,
              color-mix(in srgb, var(--ds-accent) 55%, transparent) 300deg,
              color-mix(in srgb, var(--ds-accent)  0%, transparent) 360deg
            );
          -webkit-mask:
            linear-gradient(#fff 0 0) content-box,
            linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.2s;
        }
        .deck-search-snake-ring.active::before {
          opacity: 1;
          animation: deck-search-snake-rotate 4s linear infinite;
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
