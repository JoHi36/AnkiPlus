import React from 'react';
import CardWidget from './CardWidget';

const CardRow = React.memo(function CardRow({ card, index, onCardClick }) {
  return (
    <div
      key={card.card_id}
      onClick={() => onCardClick && onCardClick(card.card_id)}
      style={{
        padding: '12px 20px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        borderTop: index > 0 ? '1px solid var(--ds-hover-tint)' : 'none',
        transition: 'background 0.15s ease',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--ds-hover-tint)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <span style={{
        fontSize: 11,
        color: 'var(--ds-text-muted)',
        fontWeight: 500,
        minWidth: 16,
        fontVariantNumeric: 'tabular-nums',
      }}>{index + 1}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13,
          color: 'var(--ds-text-primary)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          lineHeight: 1.4,
        }}>{card.front}</div>
        <div style={{
          fontSize: 11,
          color: 'var(--ds-text-placeholder)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          marginTop: 2,
        }}>{card.back}</div>
      </div>
      <span style={{ color: 'var(--ds-text-muted)', fontSize: 14, flexShrink: 0 }}>›</span>
    </div>
  );
});

export default function CardListWidget({ query, cards, totalFound, showing, onCardClick }) {
  if (!cards || cards.length === 0) {
    return (
      <div style={{
        background: 'var(--ds-bg-overlay)',
        border: '1px solid var(--ds-border-subtle)',
        borderRadius: 16,
        padding: '24px 20px',
        textAlign: 'center',
      }}>
        <span style={{ fontSize: 13, color: 'var(--ds-text-tertiary)' }}>
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
      border: '1px solid var(--ds-border-subtle)',
      borderRadius: 16,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid var(--ds-hover-tint)',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ds-text-primary)' }}>{query}</span>
        <span style={{ fontSize: 12, color: 'var(--ds-text-placeholder)' }}>
          {showing} von {totalFound}
        </span>
      </div>

      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
        {cards.map((card, i) => (
          <CardRow
            key={card.card_id}
            card={card}
            index={i}
            onCardClick={onCardClick}
          />
        ))}
      </div>

      <div style={{
        padding: '10px 20px',
        textAlign: 'center',
        borderTop: '1px solid var(--ds-hover-tint)',
        background: 'var(--ds-hover-tint)',
      }}>
        <button
          disabled
          style={{
            fontSize: 12,
            color: 'var(--ds-text-tertiary)',
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
