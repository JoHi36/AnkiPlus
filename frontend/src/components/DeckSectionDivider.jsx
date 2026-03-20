import React from 'react';

/**
 * Visual divider inserted between messages when the deck context changes.
 */
export default function DeckSectionDivider({ deckName }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '12px 16px 6px',
    }}>
      <div style={{
        flex: 1,
        height: 1,
        background: 'var(--ds-border-subtle)',
      }} />
      <span style={{
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--ds-text-tertiary)',
        letterSpacing: '0.5px',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}>
        {deckName || 'Free Chat'}
      </span>
      <div style={{
        flex: 1,
        height: 1,
        background: 'var(--ds-border-subtle)',
      }} />
    </div>
  );
}
