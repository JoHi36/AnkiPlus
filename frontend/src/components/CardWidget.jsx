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
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 16,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'border-color 0.2s ease',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(10,132,255,0.3)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}
    >
      <div style={{ padding: '16px 20px', fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 1.5 }}>
        {front}
      </div>
      <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', margin: '0 20px' }} />
      <div style={{ padding: '16px 20px', fontSize: 13, color: 'rgba(255,255,255,0.50)', lineHeight: 1.5 }}>
        {back}
      </div>
      <div style={{
        padding: '10px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'rgba(255,255,255,0.02)',
        borderTop: '1px solid rgba(255,255,255,0.04)',
      }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>{deckName}</span>
        <span style={{ fontSize: 11, color: '#0a84ff', fontWeight: 500 }}>Karte öffnen →</span>
      </div>
    </div>
  );
}
