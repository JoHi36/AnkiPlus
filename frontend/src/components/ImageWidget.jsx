import React, { useState } from 'react';

/* ── module-level style constants ── */
const IMAGE_WIDGET_ERROR = {
  background: 'var(--ds-bg-overlay)',
  border: '1px solid var(--ds-border-subtle)',
  borderRadius: 16,
  padding: '16px 20px',
  fontSize: 13,
  color: 'var(--ds-text-tertiary)',
  textAlign: 'center',
};
const IMAGE_WIDGET_CARD_CONTAINER = {
  background: 'var(--ds-bg-overlay)',
  border: '1px solid var(--ds-border-subtle)',
  borderRadius: 16,
  overflow: 'hidden',
};
const IMAGE_WIDGET_CARD_HEADER = {
  padding: '12px 20px',
  borderBottom: '1px solid var(--ds-hover-tint)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};
const IMAGE_WIDGET_CARD_FRONT_LABEL = { fontSize: 12, color: 'var(--ds-text-secondary)', fontWeight: 500 };
const IMAGE_WIDGET_CARD_DECK_LABEL = { fontSize: 11, color: 'var(--ds-text-tertiary)' };
const IMAGE_WIDGET_CARD_FOOTER = {
  padding: '8px 20px',
  borderTop: '1px solid var(--ds-hover-tint)',
  background: 'var(--ds-hover-tint)',
};
const IMAGE_WIDGET_CARD_FOOTER_TEXT = { fontSize: 10, color: 'var(--ds-text-muted)' };
const IMAGE_WIDGET_IMG_CLICK_WRAP = { cursor: 'pointer' };
const IMAGE_WIDGET_SEARCH_CONTAINER = {
  background: 'var(--ds-bg-overlay)',
  border: '1px solid var(--ds-border-subtle)',
  borderRadius: 16,
  overflow: 'hidden',
};
const IMAGE_WIDGET_SEARCH_IMG = {
  width: '100%',
  maxHeight: 400,
  objectFit: 'contain',
  display: 'block',
  background: 'var(--ds-bg-canvas)',
  padding: 12,
};
const IMAGE_WIDGET_SEARCH_IMG_ERROR = { padding: '20px', textAlign: 'center', color: 'var(--ds-red)', fontSize: 12 };
const IMAGE_WIDGET_SEARCH_FOOTER = {
  padding: '8px 20px',
  borderTop: '1px solid var(--ds-hover-tint)',
  background: 'var(--ds-hover-tint)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};
const IMAGE_WIDGET_SEARCH_DESC = { fontSize: 11, color: 'var(--ds-text-secondary)' };
const IMAGE_WIDGET_SEARCH_SOURCE = { fontSize: 10, color: 'var(--ds-text-muted)' };

/**
 * ImageWidget — renders images from show_card_media or search_image tools.
 *
 * For show_card_media: Shows card images with card context (front text, deck name).
 * For search_image: Shows a single internet image with source attribution.
 */
export default function ImageWidget({ data, toolName }) {
  const [expandedIdx, setExpandedIdx] = useState(null);

  // --- show_card_media: local card images ---
  if (toolName === 'show_card_media') {
    if (data.error) {
      return (
        <div style={IMAGE_WIDGET_ERROR}>
          {data.error}
        </div>
      );
    }

    const images = data.images || [];

    return (
      <div style={IMAGE_WIDGET_CARD_CONTAINER}>
        {/* Card context header */}
        {data.front && (
          <div style={IMAGE_WIDGET_CARD_HEADER}>
            <span style={IMAGE_WIDGET_CARD_FRONT_LABEL}>
              {data.front}
            </span>
            {data.deck_name && (
              <span style={IMAGE_WIDGET_CARD_DECK_LABEL}>
                {data.deck_name}
              </span>
            )}
          </div>
        )}

        {/* Images */}
        <div style={{ padding: images.length > 1 ? '12px 20px' : 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {images.map((img, i) => (
            <div key={i} style={IMAGE_WIDGET_IMG_CLICK_WRAP} onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}>
              <img
                src={img.dataUrl}
                alt={img.filename}
                style={{
                  width: '100%',
                  maxHeight: expandedIdx === i ? 'none' : 300,
                  objectFit: expandedIdx === i ? 'contain' : 'cover',
                  borderRadius: images.length > 1 ? 8 : 0,
                  display: 'block',
                }}
              />
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={IMAGE_WIDGET_CARD_FOOTER}>
          <span style={IMAGE_WIDGET_CARD_FOOTER_TEXT}>
            {images.length} {images.length === 1 ? 'Bild' : 'Bilder'} aus Karte
          </span>
        </div>
      </div>
    );
  }

  // --- search_image: internet image ---
  if (toolName === 'search_image') {
    if (data.error) {
      return (
        <div style={IMAGE_WIDGET_ERROR}>
          {data.error}
        </div>
      );
    }

    return (
      <div style={IMAGE_WIDGET_SEARCH_CONTAINER}>
        {/* Image — base64 data URL from Python, renders directly */}
        {data.dataUrl ? (
          <img
            src={data.dataUrl}
            alt={data.description || ''}
            style={IMAGE_WIDGET_SEARCH_IMG}
          />
        ) : (
          <div style={IMAGE_WIDGET_SEARCH_IMG_ERROR}>
            Bild konnte nicht geladen werden
          </div>
        )}

        {/* Source attribution */}
        <div style={IMAGE_WIDGET_SEARCH_FOOTER}>
          <span style={IMAGE_WIDGET_SEARCH_DESC}>
            {data.description}
          </span>
          <span style={IMAGE_WIDGET_SEARCH_SOURCE}>
            {data.source === 'pubchem' ? 'PubChem' : data.source === 'wikimedia' ? 'Wikimedia' : data.source}
          </span>
        </div>
      </div>
    );
  }

  return null;
}
