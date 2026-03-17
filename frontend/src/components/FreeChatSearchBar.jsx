// frontend/src/components/FreeChatSearchBar.jsx
import React, { useState, useRef } from 'react';

/**
 * FreeChatSearchBar — special entry-point input for the free chat overlay.
 *
 * Visual: animated blue/purple conic-gradient snake border around a dark input.
 * Behavior: on Enter with non-empty text, calls onOpen(text).
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

  return (
    <div style={{ padding: '8px 16px 12px' }}>
      {/* Brand */}
      <div style={{
        textAlign: 'center',
        fontSize: 18,
        fontWeight: 700,
        color: '#fff',
        letterSpacing: '-0.3px',
        marginBottom: 10,
      }}>
        Anki<span style={{ color: '#6b8cff' }}>Plus</span>
      </div>

      {/* Snake-border wrapper */}
      <div style={{ position: 'relative', borderRadius: 24, padding: 2 }}>
        {/* Animated conic-gradient ring */}
        <div style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 24,
          background: 'conic-gradient(from 0deg, transparent 0deg, transparent 200deg, #6b8cff 220deg, #a78bfa 260deg, #38bdf8 290deg, #6b8cff 310deg, transparent 330deg)',
          WebkitMask: 'radial-gradient(circle, transparent calc(100% - 2px), white calc(100% - 2px))',
          mask: 'radial-gradient(circle, transparent calc(100% - 2px), white calc(100% - 2px))',
          animation: 'freechat-snake-rotate 2.5s linear infinite',
        }} />

        {/* Input */}
        <div style={{
          position: 'relative',
          background: '#22222f',
          borderRadius: 22,
          display: 'flex',
          alignItems: 'center',
          padding: '9px 14px 9px 38px',
          gap: 8,
        }}>
          {/* Icon */}
          <span style={{
            position: 'absolute',
            left: 13,
            color: '#6b8cff',
            fontSize: 14,
            lineHeight: 1,
          }}>✦</span>

          <input
            ref={inputRef}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Stelle eine Frage…"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#ccc',
              fontSize: 13,
            }}
          />
        </div>
      </div>

      {/* Hint */}
      <div style={{ textAlign: 'right', fontSize: 10, color: '#2a2a40', marginTop: 4, paddingRight: 4 }}>
        Enter zum Senden
      </div>

      {/* CSS animation — injected once via style tag */}
      <style>{`
        @keyframes freechat-snake-rotate {
          0%   { background: conic-gradient(from 0deg,   transparent 0deg, transparent 200deg, #6b8cff 220deg, #a78bfa 260deg, #38bdf8 290deg, #6b8cff 310deg, transparent 330deg); }
          25%  { background: conic-gradient(from 90deg,  transparent 0deg, transparent 200deg, #6b8cff 220deg, #a78bfa 260deg, #38bdf8 290deg, #6b8cff 310deg, transparent 330deg); }
          50%  { background: conic-gradient(from 180deg, transparent 0deg, transparent 200deg, #6b8cff 220deg, #a78bfa 260deg, #38bdf8 290deg, #6b8cff 310deg, transparent 330deg); }
          75%  { background: conic-gradient(from 270deg, transparent 0deg, transparent 200deg, #6b8cff 220deg, #a78bfa 260deg, #38bdf8 290deg, #6b8cff 310deg, transparent 330deg); }
          100% { background: conic-gradient(from 360deg, transparent 0deg, transparent 200deg, #6b8cff 220deg, #a78bfa 260deg, #38bdf8 290deg, #6b8cff 310deg, transparent 330deg); }
        }
      `}</style>
    </div>
  );
}
