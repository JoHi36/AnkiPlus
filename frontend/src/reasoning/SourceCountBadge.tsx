// frontend/src/reasoning/SourceCountBadge.tsx
import React from 'react';

interface SourceCountBadgeProps {
  count: number;
  cardCount: number;
}

const BADGE_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '2px 0',
};

const DOTS_STYLE: React.CSSProperties = {
  display: 'flex',
  gap: 2,
  alignItems: 'center',
};

const DOT_STYLE: React.CSSProperties = {
  width: 4,
  height: 4,
  borderRadius: '50%',
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: 'var(--ds-text-tertiary)',
  letterSpacing: '0.2px',
};

export default function SourceCountBadge({ count, cardCount }: SourceCountBadgeProps) {
  if (count === 0) return null;

  const webCount = count - cardCount;
  const dots: Array<'card' | 'web'> = [
    ...Array(Math.min(cardCount, 6)).fill('card' as const),
    ...Array(Math.min(webCount, 4)).fill('web' as const),
  ];

  return (
    <div style={BADGE_STYLE}>
      <div style={DOTS_STYLE}>
        {dots.map((type, i) => (
          <div
            key={i}
            style={{
              ...DOT_STYLE,
              background: type === 'card'
                ? 'color-mix(in srgb, var(--ds-accent) 50%, transparent)'
                : 'color-mix(in srgb, var(--ds-green) 50%, transparent)',
            }}
          />
        ))}
      </div>
      <span style={LABEL_STYLE}>
        {count} Quelle{count !== 1 ? 'n' : ''}
      </span>
    </div>
  );
}
