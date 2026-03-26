import React from 'react';
import CardWidget from './CardWidget';

/* ── module-level style constants ── */
const CARD_ROW_CONTAINER = {
  padding: '12px 20px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  transition: 'background 0.15s ease',
};
const CARD_ROW_INDEX = {
  fontSize: 11,
  color: 'var(--ds-text-muted)',
  fontWeight: 500,
  minWidth: 16,
  fontVariantNumeric: 'tabular-nums',
};
const CARD_ROW_CONTENT = { flex: 1, minWidth: 0 };
const CARD_ROW_FRONT = {
  fontSize: 13,
  color: 'var(--ds-text-primary)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  lineHeight: 1.4,
};
const CARD_ROW_BACK = {
  fontSize: 11,
  color: 'var(--ds-text-placeholder)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  marginTop: 2,
};
const CARD_ROW_CHEVRON = { color: 'var(--ds-text-muted)', fontSize: 14, flexShrink: 0 };
const CARD_LIST_EMPTY = {
  background: 'var(--ds-bg-overlay)',
  border: '1px solid var(--ds-border-subtle)',
  borderRadius: 16,
  padding: '24px 20px',
  textAlign: 'center',
};
const CARD_LIST_EMPTY_TEXT = { fontSize: 13, color: 'var(--ds-text-tertiary)' };
const CARD_LIST_CONTAINER = {
  background: 'var(--ds-bg-overlay)',
  border: '1px solid var(--ds-border-subtle)',
  borderRadius: 16,
  overflow: 'hidden',
};
const CARD_LIST_HEADER = {
  padding: '14px 20px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderBottom: '1px solid var(--ds-hover-tint)',
};
const CARD_LIST_HEADER_TITLE = { fontSize: 13, fontWeight: 600, color: 'var(--ds-text-primary)' };
const CARD_LIST_HEADER_COUNT = { fontSize: 12, color: 'var(--ds-text-placeholder)' };
const CARD_LIST_SCROLL = { maxHeight: 280, overflowY: 'auto' };
const CARD_LIST_FOOTER = {
  padding: '10px 20px',
  textAlign: 'center',
  borderTop: '1px solid var(--ds-hover-tint)',
  background: 'var(--ds-hover-tint)',
};
const CARD_LIST_FOOTER_BUTTON = {
  fontSize: 12,
  color: 'var(--ds-text-tertiary)',
  fontWeight: 500,
  background: 'none',
  border: 'none',
  cursor: 'not-allowed',
  opacity: 0.4,
  padding: '4px 0',
};

const CardRow = React.memo(function CardRow({ card, index, onCardClick }) {
  return (
    <div
      key={card.card_id}
      onClick={() => onCardClick && onCardClick(card.card_id)}
      style={{ ...CARD_ROW_CONTAINER, borderTop: index > 0 ? '1px solid var(--ds-hover-tint)' : 'none' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--ds-hover-tint)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <span style={CARD_ROW_INDEX}>{index + 1}</span>
      <div style={CARD_ROW_CONTENT}>
        <div style={CARD_ROW_FRONT}>{card.front}</div>
        <div style={CARD_ROW_BACK}>{card.back}</div>
      </div>
      <span style={CARD_ROW_CHEVRON}>›</span>
    </div>
  );
});

export default function CardListWidget({ query, cards, totalFound, showing, onCardClick }) {
  if (!cards || cards.length === 0) {
    return (
      <div style={CARD_LIST_EMPTY}>
        <span style={CARD_LIST_EMPTY_TEXT}>
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
    <div style={CARD_LIST_CONTAINER}>
      <div style={CARD_LIST_HEADER}>
        <span style={CARD_LIST_HEADER_TITLE}>{query}</span>
        <span style={CARD_LIST_HEADER_COUNT}>
          {showing} von {totalFound}
        </span>
      </div>

      <div style={CARD_LIST_SCROLL}>
        {cards.map((card, i) => (
          <CardRow
            key={card.card_id}
            card={card}
            index={i}
            onCardClick={onCardClick}
          />
        ))}
      </div>

      <div style={CARD_LIST_FOOTER}>
        <button
          disabled
          style={CARD_LIST_FOOTER_BUTTON}
          title="Bald verfügbar"
        >
          Als aktive Session setzen
        </button>
      </div>
    </div>
  );
}
