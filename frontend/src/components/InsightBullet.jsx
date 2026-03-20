import React from 'react';

const DOT_COLORS = {
  learned: 'rgba(74,158,108,0.55)',
  weakness: 'rgba(180,80,70,0.55)',
};

export default function InsightBullet({ text, type = 'learned', citations = [], onCitationClick, bulletColor }) {
  const dotColor = bulletColor || DOT_COLORS[type] || DOT_COLORS.learned;
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: dotColor,
          flexShrink: 0,
          marginTop: 6,
        }}
      />
      <div style={{ fontSize: 15, color: 'var(--ds-text-primary)', lineHeight: 1.55, letterSpacing: '-0.2px' }}>
        {text}
        {citations.map((c) => (
          <sup
            key={c.cardId}
            onClick={() => onCitationClick?.(c.cardId)}
            style={{
              fontSize: 10,
              color: 'rgba(10,132,255,0.5)',
              cursor: 'pointer',
              marginLeft: 3,
              fontWeight: 500,
            }}
          >
            {c.label}
          </sup>
        ))}
      </div>
    </div>
  );
}
