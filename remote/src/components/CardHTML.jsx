import React, { useMemo } from 'react';

const FRAME_STYLE = {
  width: '100%',
  flex: 1,
  border: 'none',
  background: 'transparent',
};

const CardHTML = ({ html }) => {
  const srcDoc = useMemo(() => `
    <!DOCTYPE html>
    <html><head>
      <meta charset="UTF-8">
      <style>
        body { margin: 0; padding: 16px; font-family: system-ui; font-size: 16px;
               line-height: 1.6; color: #e5e5e5; background: transparent; }
        img { max-width: 100%; height: auto; }
      </style>
    </head><body>${html || ''}</body></html>
  `, [html]);

  return (
    <iframe
      srcDoc={srcDoc}
      sandbox="allow-same-origin"
      style={FRAME_STYLE}
      title="Card content"
    />
  );
};

export default React.memo(CardHTML);
