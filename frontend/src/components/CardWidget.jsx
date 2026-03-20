import React from 'react';

export default function CardWidget({ cardId, front, back, deckName, onCardClick }) {
  const handleClick = () => {
    if (onCardClick) onCardClick(cardId);
  };

  return (
    <div
      onClick={handleClick}
      style={{
        background: 'var(--ds-bg-overlay)',
        border: '1px solid var(--ds-border-subtle)',
        borderRadius: 16,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'border-color 0.2s ease',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--ds-accent)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--ds-border-subtle)'}
    >
      <div style={{ padding: '16px 20px', fontSize: 14, color: 'var(--ds-text-primary)', lineHeight: 1.5 }}>
        {front}
      </div>
      <div style={{ height: 1, background: 'var(--ds-hover-tint)', margin: '0 20px' }} />
      <div style={{ padding: '16px 20px', fontSize: 13, color: 'var(--ds-text-secondary)', lineHeight: 1.5 }}>
        {back}
      </div>
      <div style={{
        padding: '10px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'var(--ds-hover-tint)',
        borderTop: '1px solid var(--ds-hover-tint)',
      }}>
        <span style={{ fontSize: 11, color: 'var(--ds-text-tertiary)' }}>{deckName}</span>
        <span style={{ fontSize: 11, color: 'var(--ds-accent)', fontWeight: 500 }}>Karte öffnen →</span>
      </div>
    </div>
  );
}
