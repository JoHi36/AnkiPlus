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
        background: 'rgba(255,255,255,0.06)',
      }} />
      <span style={{
        fontSize: 10,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.25)',
        letterSpacing: '0.5px',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}>
        {deckName || 'Free Chat'}
      </span>
      <div style={{
        flex: 1,
        height: 1,
        background: 'rgba(255,255,255,0.06)',
      }} />
    </div>
  );
}
