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
        {/* Animated conic-gradient ring — transform:rotate for smooth continuous spin */}
        <div style={{
          position: 'absolute',
          inset: -1,
          borderRadius: 25,
          background: 'conic-gradient(from 0deg, transparent 0deg, transparent 55%, #6b8cff 60%, #a78bfa 72%, #38bdf8 81%, #6b8cff 86%, transparent 92%)',
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

      {/* CSS animation — transform:rotate produces smooth continuous spin */}
      <style>{`
        @keyframes freechat-snake-rotate {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
