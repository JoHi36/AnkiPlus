import React from 'react';

/**
 * ContextTags — shows [Deck] -> [Card] or [Freie Frage] below user messages.
 *
 * @param {string|null} deckName - deck name (may contain :: separators)
 * @param {string|null} cardFront - card front text (truncated)
 * @param {number|null} cardId - card ID for click-to-open
 * @param {object} bridge - for goToCard / openPreview
 */
export default function ContextTags({ deckName, cardFront, cardId, bridge }) {
  const shortDeck = deckName ? deckName.split('::').pop() : null;

  if (!cardId && !shortDeck) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, marginBottom: 12 }}>
        <span style={{
          background: 'var(--ds-border-subtle)',
          color: 'var(--ds-text-muted)',
          fontSize: 10, padding: '3px 8px', borderRadius: 6,
          display: 'inline-flex', alignItems: 'center',
        }}>
          Freie Frage
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, marginBottom: 12 }}>
      {shortDeck && (
        <span
          onClick={() => bridge?.goToCard?.(cardId)}
          style={{
            background: 'color-mix(in srgb, var(--ds-accent) 12%, transparent)',
            color: 'var(--ds-accent)',
            fontSize: 10, padding: '3px 8px', borderRadius: 6, cursor: cardId ? 'pointer' : 'default',
            display: 'inline-flex', alignItems: 'center', gap: 3,
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.7'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
        >
          {shortDeck}
        </span>
      )}
      {shortDeck && cardFront && (
        <span style={{ color: 'var(--ds-text-muted)', fontSize: 10, opacity: 0.4 }}>&#8594;</span>
      )}
      {cardFront && (
        <span
          onClick={() => cardId && bridge?.openPreview?.(cardId)}
          style={{
            background: 'color-mix(in srgb, var(--ds-accent) 12%, transparent)',
            color: 'var(--ds-accent)',
            fontSize: 10, padding: '3px 8px', borderRadius: 6,
            cursor: cardId ? 'pointer' : 'default',
            display: 'inline-flex', alignItems: 'center', gap: 3,
            maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.7'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
        >
          {cardFront}
        </span>
      )}
    </div>
  );
}
