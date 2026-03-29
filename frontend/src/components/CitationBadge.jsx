import React, { useState } from 'react';
import SourceCard from './SourceCard';

const BADGE_BASE = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '1.25rem',
  height: '1rem',
  padding: '0 4px',
  borderRadius: 4,
  fontSize: 9,
  fontWeight: 700,
  verticalAlign: 'super',
  cursor: 'pointer',
  margin: '0 1px',
  transition: 'all 0.15s',
  border: 'none',
  lineHeight: 1,
  transform: 'translateY(-1px)',
};

const CARD_STYLE = {
  ...BADGE_BASE,
  background: 'color-mix(in srgb, var(--ds-accent) 15%, transparent)',
  color: 'var(--ds-accent)',
};

const WEB_STYLE = {
  ...BADGE_BASE,
  background: 'color-mix(in srgb, var(--ds-green) 15%, transparent)',
  color: 'var(--ds-green)',
};

const CARD_HOVER = { background: 'color-mix(in srgb, var(--ds-accent) 30%, transparent)' };
const WEB_HOVER = { background: 'color-mix(in srgb, var(--ds-green) 30%, transparent)' };

const TOOLTIP_CONTAINER = { width: 192 };

export default function CitationBadge({ cardId, citation, onClick, index }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [hovered, setHovered] = useState(false);

  const isWeb = citation && (citation.url || citation.web_url);
  const baseStyle = isWeb ? WEB_STYLE : CARD_STYLE;
  const hoverStyle = isWeb ? WEB_HOVER : CARD_HOVER;

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onClick) onClick(cardId, citation);
  };

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={handleClick}
        onMouseEnter={() => { setShowTooltip(true); setHovered(true); }}
        onMouseLeave={() => { setShowTooltip(false); setHovered(false); }}
        style={hovered ? { ...baseStyle, ...hoverStyle } : baseStyle}
      >
        {index !== undefined ? index : cardId}
      </button>

      {showTooltip && citation && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: 12,
            zIndex: 50,
            ...TOOLTIP_CONTAINER,
          }}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <SourceCard
            citation={citation}
            index={index}
            onClick={onClick ? () => onClick(cardId, citation) : null}
          />
        </div>
      )}
    </span>
  );
}
