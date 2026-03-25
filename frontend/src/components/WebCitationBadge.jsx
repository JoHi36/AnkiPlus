import React from 'react';

export default function WebCitationBadge({ index, url, color = '#00D084' }) {
  const handleClick = () => {
    if (window.ankiBridge) {
      window.ankiBridge.addMessage('openUrl', { url });
    } else {
      window.open(url, '_blank');
    }
  };

  return (
    <span
      className="web-cite-badge"
      style={{
        color,
        background: `${color}1A`,
      }}
      onClick={handleClick}
      title={url}
    >
      {index}
    </span>
  );
}
