import React from 'react';

const DOT_COLORS = {
  learned: 'var(--ds-green-50)',
  weakness: 'var(--ds-red-50)',
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
              color: 'var(--ds-accent-50)',
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
