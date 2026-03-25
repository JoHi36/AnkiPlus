// frontend/src/components/FreeChatSearchBar.jsx
import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';

/**
 * FreeChatSearchBar — special entry-point input for the free chat overlay.
 *
 * Visual: animated blue/purple conic-gradient snake border around a dark input.
 * Behavior: on Enter with non-empty text, calls onOpen(text).
 * Command+K focuses the input from anywhere; blue send arrow appears when typing.
 *
 * Props:
 *   onOpen(text: string) — called when user presses Enter with text
 */
export default function FreeChatSearchBar({ onOpen }) {
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && value.trim()) {
      onOpen(value.trim());
      setValue('');
    }
  };

  const handleSend = () => {
    if (value.trim()) {
      onOpen(value.trim());
      setValue('');
    }
  };

  /* Command+K / Ctrl+K -> focus the input */
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const hasText = value.trim().length > 0;
  const RADIUS = 22;
  const BORDER = 1.5;

  return (
    <div style={{ padding: '8px 16px 12px' }}>
      {/* Brand */}
      <div style={{
        textAlign: 'center',
        fontSize: 18,
        fontWeight: 700,
        color: 'var(--ds-text-primary)',
        letterSpacing: '-0.3px',
        marginBottom: 10,
      }}>
        Anki<span style={{ color: 'var(--ds-accent)' }}>Plus</span>
      </div>

      {/* Snake-border wrapper — the gradient fills this element, border-radius clips it,
          and the inner div covers the center so only a thin ring is visible. */}
      <div className="freechat-snake-ring" style={{
        position: 'relative',
        borderRadius: RADIUS,
        padding: BORDER,
        overflow: 'hidden',
      }}>
        {/* Input surface — covers the gradient center, leaving only the ring edge */}
        <div style={{
          position: 'relative',
          background: 'var(--ds-bg-frosted)',
          borderRadius: RADIUS - BORDER,
          display: 'flex',
          alignItems: 'center',
          padding: '9px 14px 9px 38px',
          gap: 8,
        }}>
          {/* Icon */}
          <span style={{
            position: 'absolute',
            left: 13,
            color: 'var(--ds-accent)',
            fontSize: 14,
            lineHeight: 1,
          }}>✦</span>

          <input
            ref={inputRef}
            className="freechat-input"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Stelle eine Frage…"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              boxShadow: 'none',
              WebkitAppearance: 'none',
              color: 'var(--ds-text-primary)',
              fontSize: 13,
            }}
          />

          {/* Right side: Command+K badge when empty, blue send arrow when typing */}
          {hasText ? (
            <button
              onClick={handleSend}
              style={{
                width: 24, height: 24, borderRadius: '50%',
                background: 'var(--ds-accent)',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, padding: 0,
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              <ArrowUp size={14} color="#fff" strokeWidth={2.5} />
            </button>
          ) : (
            <kbd style={{
              fontSize: 10, fontWeight: 500,
              color: 'var(--ds-text-tertiary)',
              background: 'var(--ds-border-subtle)',
              borderRadius: 5,
              padding: '2px 6px',
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              flexShrink: 0,
              lineHeight: 1.3,
            }}>⌘K</kbd>
          )}
        </div>
      </div>

      {/* CSS: rotating gradient background on the outer ring + focus suppression */}
      <style>{`
        .freechat-snake-ring {
          background:
            conic-gradient(
              from var(--snake-angle, 0deg),
              transparent 0deg, transparent 55%,
              var(--ds-accent) 60%, var(--ds-purple) 72%,
              #38bdf8 81%, var(--ds-accent) 86%,
              transparent 92%
            );
          animation: freechat-snake-rotate 2.5s linear infinite;
        }
        @keyframes freechat-snake-rotate {
          from { --snake-angle: 0deg; }
          to   { --snake-angle: 360deg; }
        }
        @property --snake-angle {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }
        /* Suppress all browser/DaisyUI focus outlines on this input */
        .freechat-input:focus,
        .freechat-input:focus-visible {
          outline: none !important;
          box-shadow: none !important;
          border: none !important;
        }
      `}</style>
    </div>
  );
}
