// frontend/src/components/SpeechBubble.jsx
import React, { useEffect, useState } from 'react';

const MAX_BUBBLE_CHARS = 80;

// Trim to first sentence if over limit, append ellipsis indicator
function trimText(text) {
  if (text.length <= MAX_BUBBLE_CHARS) return text;
  const firstSentence = text.match(/^[^.!?]+[.!?]/)?.[0] ?? text.slice(0, MAX_BUBBLE_CHARS);
  return firstSentence.length <= MAX_BUBBLE_CHARS ? firstSentence : firstSentence.slice(0, MAX_BUBBLE_CHARS) + '…';
}

// Duration: clamp(2500ms, charCount * 50ms, 6000ms)
function calcDuration(text) {
  return Math.min(Math.max(text.length * 50, 2500), 6000);
}

export default function SpeechBubble({ text, onDismiss }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!text) return;
    const display = trimText(text);
    setVisible(true);
    const duration = calcDuration(display);
    const hideTimer = setTimeout(() => setVisible(false), duration);
    const dismissTimer = setTimeout(() => onDismiss?.(), duration + 300); // after fade-out
    return () => { clearTimeout(hideTimer); clearTimeout(dismissTimer); };
  }, [text]);

  if (!text) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '100%',
        left: '50%',
        transform: 'translateX(-50%)',
        marginBottom: 8,
        transition: 'opacity 0.2s, transform 0.2s',
        opacity: visible ? 1 : 0,
        pointerEvents: 'none',
        zIndex: 50,
      }}
    >
      <div style={{
        background: 'rgba(30,30,50,0.95)',
        border: '1px solid rgba(108,99,255,0.3)',
        borderRadius: '12px 12px 12px 4px',
        padding: '8px 12px',
        fontSize: 12,
        color: '#c0c0ff',
        maxWidth: 200,
        lineHeight: 1.4,
        whiteSpace: 'pre-wrap',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      }}>
        {trimText(text)}
      </div>
    </div>
  );
}
