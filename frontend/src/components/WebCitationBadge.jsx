import React from 'react';

export default function WebCitationBadge({ index, url, color = 'var(--ds-green)' }) {
  const handleClick = () => {
    if (window.ankiBridge) {
      window.ankiBridge.addMessage('openUrl', { url });
    } else {
      window.open(url, '_blank');
    }
  };

  // Derive background as a low-opacity tint via color-mix (works with CSS vars too)
  const bgColor = color.startsWith('var(')
    ? `color-mix(in srgb, ${color} 10%, transparent)`
    : `${color}1A`;

  return (
    <span
      className="web-cite-badge"
      style={{
        color,
        background: bgColor,
      }}
      onClick={handleClick}
      title={url}
    >
      {index}
    </span>
  );
}
