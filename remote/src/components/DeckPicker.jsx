import React from 'react';
import { motion } from 'framer-motion';

const LIST_STYLE = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--ds-space-xs)',
  padding: 'var(--ds-space-md)',
  overflowY: 'auto',
  flex: 1,
};

const ITEM_STYLE = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: 'var(--ds-space-md) var(--ds-space-lg)',
  borderRadius: 'var(--ds-radius-lg)',
  background: 'var(--ds-bg-canvas)',
  border: '1px solid var(--ds-border)',
  cursor: 'pointer',
};

const NAME_STYLE = {
  fontSize: 'var(--ds-text-md)',
  fontWeight: 500,
  color: 'var(--ds-text-primary)',
};

const COUNTS_STYLE = {
  fontSize: 'var(--ds-text-sm)',
  color: 'var(--ds-text-tertiary)',
};

const DeckItem = React.memo(({ deck, onOpen }) => {
  const shortName = deck.name.includes('::')
    ? deck.name.split('::').pop()
    : deck.name;

  return (
    <motion.div
      style={ITEM_STYLE}
      whileTap={{ scale: 0.98 }}
      onClick={() => onOpen(deck.id)}
    >
      <span style={NAME_STYLE}>{shortName}</span>
      <span style={COUNTS_STYLE}>
        {deck.new || 0} · {deck.learn || 0} · {deck.review || 0}
      </span>
    </motion.div>
  );
});

const HEADER_STYLE = {
  padding: 'var(--ds-space-lg) var(--ds-space-lg) var(--ds-space-sm)',
  fontSize: 'var(--ds-text-xl)',
  fontWeight: 600,
  color: 'var(--ds-text-primary)',
};

const DeckPicker = ({ decks, onOpenDeck }) => (
  <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <div style={HEADER_STYLE}>Stapel</div>
    <div style={LIST_STYLE}>
      {decks.filter(d => !d.name.includes('::')).map(deck => (
        <DeckItem key={deck.id} deck={deck} onOpen={onOpenDeck} />
      ))}
    </div>
  </div>
);

export default React.memo(DeckPicker);
