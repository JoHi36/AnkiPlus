import React from 'react';
import CardWidget from './CardWidget';

export default function CardListWidget({ query, cards, totalFound, showing, onCardClick }) {
  if (!cards || cards.length === 0) {
    return (
      <div style={{
        background: 'var(--ds-bg-overlay)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 16,
        padding: '24px 20px',
        textAlign: 'center',
      }}>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>
          Keine Karten gefunden für „{query}"
        </span>
      </div>
    );
  }

  if (cards.length === 1) {
    const c = cards[0];
    return <CardWidget cardId={c.card_id} front={c.front} back={c.back} deckName={c.deck_name} onCardClick={onCardClick} />;
  }

  return (
    <div style={{
      background: 'var(--ds-bg-overlay)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 16,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{query}</span>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.30)' }}>
          {showing} von {totalFound}
        </span>
      </div>

      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
        {cards.map((card, i) => (
          <div
            key={card.card_id}
            onClick={() => onCardClick && onCardClick(card.card_id)}
            style={{
              padding: '12px 20px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              borderTop: i > 0 ? '1px solid rgba(255,255,255,0.03)' : 'none',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.20)',
              fontWeight: 500,
              minWidth: 16,
              fontVariantNumeric: 'tabular-nums',
            }}>{i + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13,
                color: 'rgba(255,255,255,0.80)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                lineHeight: 1.4,
              }}>{card.front}</div>
              <div style={{
                fontSize: 11,
                color: 'rgba(255,255,255,0.30)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                marginTop: 2,
              }}>{card.back}</div>
            </div>
            <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: 14, flexShrink: 0 }}>›</span>
          </div>
        ))}
      </div>

      <div style={{
        padding: '10px 20px',
        textAlign: 'center',
        borderTop: '1px solid rgba(255,255,255,0.04)',
        background: 'rgba(255,255,255,0.02)',
      }}>
        <button
          disabled
          style={{
            fontSize: 12,
            color: 'rgba(255,255,255,0.35)',
            fontWeight: 500,
            background: 'none',
            border: 'none',
            cursor: 'not-allowed',
            opacity: 0.4,
            padding: '4px 0',
          }}
          title="Bald verfügbar"
        >
          Als aktive Session setzen
        </button>
      </div>
    </div>
  );
}
