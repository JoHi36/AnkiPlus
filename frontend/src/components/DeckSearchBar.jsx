// frontend/src/components/DeckSearchBar.jsx
import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { ArrowUp } from 'lucide-react';

const PHRASES = [
  'Was m\u00f6chtest du wissen?',
  'Erkl\u00e4re die Nernst-Gleichung\u2026',
  'Fasse Kapitel 3 zusammen\u2026',
  'Was ist der Unterschied zwischen\u2026',
  'Hilf mir beim Verstehen von\u2026',
];

const PLACEHOLDER_INTERVAL_MS = 6000;
const PLACEHOLDER_FADE_MS = 400;
const RADIUS = 16;
const BORDER = 1.5;
const LID_END_BOTTOM_PX = 24; // distance from viewport bottom when landed
const LID_END_HEIGHT_PX = 50;
const LID_END_MAX_WIDTH_PX = 520;

/**
 * DeckSearchBar — search input for the deck browser.
 *
 * Features:
 * - Rotating placeholders every 6s with fade animation
 * - Snake border (animated conic-gradient) on focus
 * - ⌘K / Ctrl+K badge when idle; hides on focus or when text entered
 * - Blue send arrow appears when text is entered
 * - ankiClearAndBlur event clears + blurs the input
 * - FLIP lid-lift animation: on trigger, measures position, switches to
 *   position:fixed and animates from in-flow position to viewport bottom.
 *
 * Props:
 *   onSubmit(text)  — called with trimmed text when user sends
 *   lidState        — 'idle' | 'animating' | 'open' | 'reversing'
 *   onLidClick      — called when bar is clicked in idle state (triggers lid-lift)
 *   onLidAnimEnd    — called when lidDrop/lidReverse animation finishes
 */
const SIDEBAR_TOTAL_WIDTH_PX = 400; // 380px sidebar + 10px margin + ~10px gap

const DeckSearchBar = forwardRef(function DeckSearchBar({ onSubmit, lidState = 'idle', onLidClick, onLidAnimEnd, externalFlipRect, sidebarOpen = false }, ref) {
  const [value, setValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [placeholderVisible, setPlaceholderVisible] = useState(true);
  const inputRef = useRef(null);
  const outerRef = useRef(null);
  const flipRectRef = useRef(null); // stored rect from FLIP measurement

  // Expose measureRect + focusInput to parent via ref
  useImperativeHandle(ref, () => ({
    measureRect: () => {
      if (!outerRef.current) return null;
      const r = outerRef.current.getBoundingClientRect();
      flipRectRef.current = { top: r.top, left: r.left, width: r.width, height: r.height };
      return flipRectRef.current;
    },
    focusInput: () => inputRef.current?.focus(),
    getElement: () => outerRef.current,
    hasFlipData: () => !!flipRectRef.current,
  }), []);

  const hasText = value.trim().length > 0;
  const isMac = typeof navigator !== 'undefined' &&
    (((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '')
      .toUpperCase().indexOf('MAC') >= 0);

  // Compute FLIP style: fixed position with CSS custom properties for parametric keyframes
  const isActive = lidState === 'animating' || lidState === 'open' || lidState === 'reversing';
  const isAnimPhase = lidState === 'animating' || lidState === 'reversing';
  // Measure actual canvas area from DOM for centering
  const getCanvasRect = () => {
    // Walk up from our element to find the canvas column (flex:1 sibling of sidebar)
    const el = outerRef.current;
    if (el) {
      // The canvas column is the closest ancestor with data-canvas or the flex:1 column
      const canvasCol = el.closest('[data-canvas]');
      if (canvasCol) {
        const rect = canvasCol.getBoundingClientRect();
        return { left: rect.left, width: rect.width };
      }
    }
    return { left: 0, width: window.innerWidth };
  };

  const flipStyle = (() => {
    if (!isActive) return {};
    const canvas = getCanvasRect();
    const canvasCenter = canvas.left + canvas.width / 2;
    const endTop = window.innerHeight - LID_END_HEIGHT_PX - LID_END_BOTTOM_PX;
    const endWidth = Math.min(LID_END_MAX_WIDTH_PX, canvas.width - 32);
    // Open state — direct positioning, no FLIP data needed
    if (lidState === 'open') {
      return {
        position: 'fixed',
        left: canvasCenter,
        zIndex: 50,
        top: endTop,
        width: endWidth,
        transform: 'translateX(-50%)',
      };
    }
    // Animating/reversing — needs FLIP measurements (local or global fallback)
    const r = flipRectRef.current || externalFlipRect;
    if (!r) return {};
    return {
      position: 'fixed',
      left: canvasCenter,
      zIndex: 50,
      // CSS custom properties — keyframes read these
      '--lid-from-y': `${r.top}px`,
      '--lid-to-y': `${endTop}px`,
      '--lid-travel': `${endTop - r.top}px`,
      '--lid-from-w': `${r.width}px`,
      '--lid-to-w': `${endWidth}px`,
      '--lid-grow': `${endWidth - r.width}px`,
    };
  })();

  const lidAnimClass =
    lidState === 'animating' ? 'lid-dropping' :
    lidState === 'reversing' ? 'lid-reversing' :
    lidState === 'open' ? 'lid-open' : '';

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
      setLastQuery('');
      inputRef.current?.blur();
    };
    window.addEventListener('ankiClearAndBlur', handler);
    return () => window.removeEventListener('ankiClearAndBlur', handler);
  }, []);

  /* ── Lid-lift animation end listener ── */
  useEffect(() => {
    if (lidState !== 'animating' && lidState !== 'reversing') return;
    // No FLIP data (local or global) → can't animate, skip directly to end state
    if (!flipRectRef.current && !externalFlipRect) {
      onLidAnimEnd?.();
      return;
    }
    const el = outerRef.current;
    if (!el) return;
    const handler = (e) => {
      // Only react to our own animation, not child animations
      if (e.target !== el) return;
      onLidAnimEnd?.();
    };
    el.addEventListener('animationend', handler);
    return () => el.removeEventListener('animationend', handler);
  }, [lidState, onLidAnimEnd]);

  /* ── Auto-focus input when lid opens ── */
  useEffect(() => {
    if (lidState === 'open') {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [lidState]);

  /* ── Submit helpers ── */
  const [lastQuery, setLastQuery] = useState('');

  const submitSearch = () => {
    const t = value.trim();
    if (!t) return;
    onSubmit?.(t);
    setLastQuery(t);
    setValue('');
    inputRef.current?.blur();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (hasText) {
        submitSearch();
      }
    }
  };

  /* Show Cmd+K badge: input is empty AND not focused */
  const showCmdK = !hasText && !isFocused;

  // When animating but no FLIP rect yet, stay invisible (prevents flash).
  // In 'open' state we position directly — no FLIP data needed.
  const hideInFlow = isAnimPhase;

  return (
    <div
      ref={outerRef}
      className={lidAnimClass}
      style={{
        ...flipStyle,
        // When idle, keep in normal flow; when active, the flipStyle takes over
        ...(hideInFlow && !(flipRectRef.current || externalFlipRect) ? { visibility: 'hidden' } : {}),
        willChange: isActive ? 'transform, top, width' : undefined,
        perspective: isActive ? 900 : undefined,
      }}
      onClick={lidState === 'idle' ? onLidClick : undefined}
    >
      {/* Snake-border outer ring — ::before pseudo renders the gradient, content stays visible */}
      <div
        className={`deck-search-snake-ring${isFocused || lidState === 'open' ? ' active' : ''}`}
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
              onFocus={() => {
                setIsFocused(true);
                // Restore last query for editing when focusing empty input
                if (!value && lastQuery) {
                  setValue(lastQuery);
                  // Place cursor at end
                  setTimeout(() => {
                    const el = inputRef.current;
                    if (el) el.selectionStart = el.selectionEnd = el.value.length;
                  }, 0);
                }
              }}
              onBlur={() => setIsFocused(false)}
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

            {/* Last query shown in grey — or rotating placeholder when no query yet */}
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
                  opacity: lastQuery ? 1 : (placeholderVisible ? 1 : 0),
                  transition: `opacity ${PLACEHOLDER_FADE_MS}ms ease`,
                }}
              >
                {lastQuery || PHRASES[placeholderIndex]}
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
                opacity: (showCmdK && !isActive) ? 1 : 0,
                transition: 'opacity 0.15s',
                pointerEvents: 'none',
              }}
            >
              SPACE
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
            linear-gradient(white 0 0) content-box,
            linear-gradient(white 0 0);
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
});

export default DeckSearchBar;
