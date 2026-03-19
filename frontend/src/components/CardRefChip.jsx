import React from 'react';
import { FileText } from 'lucide-react';

/**
 * Small clickable pill showing which card a message belongs to.
 * Shows card front-text snippet. Clicking navigates to the card.
 */
export default function CardRefChip({ cardId, cardFront, bridge }) {
  if (!cardId) return null;

  const label = cardFront || `Karte #${cardId}`;

  const handleClick = () => {
    if (bridge?.openPreview) {
      bridge.openPreview(String(cardId));
    }
  };

  return (
    <button
      onClick={handleClick}
      title={`Karte anzeigen: ${label}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        marginTop: 4,
        background: 'rgba(107, 140, 255, 0.1)',
        border: '1px solid rgba(107, 140, 255, 0.2)',
        borderRadius: 10,
        color: 'rgba(107, 140, 255, 0.7)',
        fontSize: 11,
        cursor: 'pointer',
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        transition: 'background 0.15s, color 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'rgba(107, 140, 255, 0.18)';
        e.currentTarget.style.color = 'rgba(107, 140, 255, 0.9)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'rgba(107, 140, 255, 0.1)';
        e.currentTarget.style.color = 'rgba(107, 140, 255, 0.7)';
      }}
    >
      <FileText size={10} />
      {label}
    </button>
  );
}
