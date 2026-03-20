import React, { useState } from 'react';

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
        <div style={{
          background: 'var(--ds-bg-overlay)',
          border: '1px solid var(--ds-border-subtle)',
          borderRadius: 16,
          padding: '16px 20px',
          fontSize: 13,
          color: 'var(--ds-text-tertiary)',
          textAlign: 'center',
        }}>
          {data.error}
        </div>
      );
    }

    const images = data.images || [];

    return (
      <div style={{
        background: 'var(--ds-bg-overlay)',
        border: '1px solid var(--ds-border-subtle)',
        borderRadius: 16,
        overflow: 'hidden',
      }}>
        {/* Card context header */}
        {data.front && (
          <div style={{
            padding: '12px 20px',
            borderBottom: '1px solid var(--ds-hover-tint)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span style={{ fontSize: 12, color: 'var(--ds-text-secondary)', fontWeight: 500 }}>
              {data.front}
            </span>
            {data.deck_name && (
              <span style={{ fontSize: 11, color: 'var(--ds-text-tertiary)' }}>
                {data.deck_name}
              </span>
            )}
          </div>
        )}

        {/* Images */}
        <div style={{ padding: images.length > 1 ? '12px 20px' : 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {images.map((img, i) => (
            <div key={i} style={{ cursor: 'pointer' }} onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}>
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
        <div style={{
          padding: '8px 20px',
          borderTop: '1px solid var(--ds-hover-tint)',
          background: 'var(--ds-hover-tint)',
        }}>
          <span style={{ fontSize: 10, color: 'var(--ds-text-muted)' }}>
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
        <div style={{
          background: 'var(--ds-bg-overlay)',
          border: '1px solid var(--ds-border-subtle)',
          borderRadius: 16,
          padding: '16px 20px',
          fontSize: 13,
          color: 'var(--ds-text-tertiary)',
          textAlign: 'center',
        }}>
          {data.error}
        </div>
      );
    }

    return (
      <div style={{
        background: 'var(--ds-bg-overlay)',
        border: '1px solid var(--ds-border-subtle)',
        borderRadius: 16,
        overflow: 'hidden',
      }}>
        {/* Image — base64 data URL from Python, renders directly */}
        {data.dataUrl ? (
          <img
            src={data.dataUrl}
            alt={data.description || ''}
            style={{
              width: '100%',
              maxHeight: 400,
              objectFit: 'contain',
              display: 'block',
              background: '#ffffff',
              padding: 12,
            }}
          />
        ) : (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--ds-red)', fontSize: 12 }}>
            Bild konnte nicht geladen werden
          </div>
        )}

        {/* Source attribution */}
        <div style={{
          padding: '8px 20px',
          borderTop: '1px solid var(--ds-hover-tint)',
          background: 'var(--ds-hover-tint)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{ fontSize: 11, color: 'var(--ds-text-secondary)' }}>
            {data.description}
          </span>
          <span style={{ fontSize: 10, color: 'var(--ds-text-muted)' }}>
            {data.source === 'pubchem' ? 'PubChem' : data.source === 'wikimedia' ? 'Wikimedia' : data.source}
          </span>
        </div>
      </div>
    );
  }

  return null;
}
