import React, { useState, useEffect, useMemo, useCallback } from 'react';

// --- Static styles ---

const CANVAS_STYLE = {
  flex: 1,
  overflowY: 'auto',
  padding: '72px 16px 16px',
  background: 'var(--ds-bg-deep)',
  scrollbarWidth: 'none',
  display: 'flex',
  flexDirection: 'column',
};

const DECK_HEADER_STYLE = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--ds-text-tertiary)',
  marginBottom: 8,
  paddingLeft: 2,
};

const DECK_COUNT_STYLE = {
  fontWeight: 400,
  color: 'var(--ds-text-muted)',
  marginLeft: 4,
};

const GRID_ROW_STYLE = {
  display: 'flex',
  gap: 4,
  marginBottom: 4,
};

const TILE_STYLE = {
  height: 140,
  flex: 1,
  minWidth: 100,
  borderRadius: 8,
  overflow: 'hidden',
  cursor: 'pointer',
  position: 'relative',
  transition: 'transform 0.15s ease, box-shadow 0.2s ease',
  border: '1px solid var(--ds-border-subtle)',
};

const TILE_IMG_STYLE = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
};

const BADGE_STYLE = {
  position: 'absolute',
  bottom: 4,
  right: 4,
  background: 'var(--ds-bg-overlay)',
  backdropFilter: 'blur(4px)',
  borderRadius: 4,
  padding: '1px 5px',
  fontSize: 8,
  color: 'var(--ds-text-tertiary)',
};

const EMPTY_STYLE = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--ds-text-muted)',
  fontSize: 13,
};

const SKELETON_ROW = {
  display: 'flex',
  gap: 4,
  marginBottom: 4,
};

// --- Lightbox styles ---

const LB_OVERLAY = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.88)',
  backdropFilter: 'blur(16px)',
  zIndex: 100,
  display: 'flex',
  flexDirection: 'column',
  transition: 'opacity 0.25s ease',
};

const LB_HEADER = {
  flexShrink: 0,
  padding: '72px 56px 10px', // top padding for transparent app header
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const LB_BREADCRUMB = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
};

const LB_SOURCE = {
  fontSize: 11,
  color: 'var(--ds-accent)',
  opacity: 0.7,
  cursor: 'pointer',
  textDecoration: 'none',
  transition: 'opacity 0.15s',
};

const LB_CENTER = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  position: 'relative',
  padding: '0 60px',
  minHeight: 0,
};

const LB_IMAGE_BOX = {
  width: '88vw',
  maxWidth: 950,
  height: '100%',
  maxHeight: '74vh',
  borderRadius: 12,
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  position: 'relative',
  background: 'var(--ds-bg-canvas)',
};

const LB_IMG = {
  maxWidth: '100%',
  maxHeight: '100%',
  objectFit: 'contain',
};

const LB_COUNTER = {
  position: 'absolute',
  bottom: 10,
  right: 10,
  fontSize: 11,
  color: 'var(--ds-text-muted)',
  background: 'var(--ds-bg-overlay)',
  padding: '2px 8px',
  borderRadius: 5,
};

const LB_NAV = {
  position: 'absolute',
  top: '50%',
  transform: 'translateY(-50%)',
  width: 40,
  height: 40,
  borderRadius: '50%',
  background: 'var(--ds-hover-tint)',
  backdropFilter: 'blur(8px)',
  border: 'none',
  color: 'var(--ds-text-tertiary)',
  fontSize: 18,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'background 0.15s, color 0.15s',
};

const LB_FILMSTRIP_WRAP = {
  flexShrink: 0,
  padding: '12px 40px 22px',
  display: 'flex',
  justifyContent: 'center',
};

const LB_FILMSTRIP = {
  display: 'flex',
  gap: 6,
  overflowX: 'auto',
  scrollbarWidth: 'none',
  maxWidth: '88vw',
  padding: 4,
};

const LB_THUMB_BASE = {
  width: 96,
  height: 72,
  borderRadius: 8,
  overflow: 'hidden',
  cursor: 'pointer',
  flexShrink: 0,
  transition: 'border-color 0.2s ease, transform 0.15s ease, opacity 0.2s ease',
  border: '2px solid transparent',
};

const LB_THUMB_IMG = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
};

// --- Helpers ---

const IMAGES_PER_ROW = 4;

function chunkIntoRows(images, perRow) {
  const rows = [];
  for (let i = 0; i < images.length; i += perRow) {
    rows.push(images.slice(i, i + perRow));
  }
  return rows;
}

function groupByDeck(images) {
  const groups = {};
  images.forEach(img => {
    const firstCardId = img.cardIds[0];
    const deck = img.decks?.[String(firstCardId)] || 'Sonstige';
    if (!groups[deck]) groups[deck] = { deck, images: [] };
    groups[deck].images.push(img);
  });
  return Object.values(groups);
}

function sortDecksByKgRelevance(deckGroups, kgSubgraph) {
  if (!kgSubgraph?.nodes?.length) {
    return deckGroups.sort((a, b) => b.images.length - a.images.length);
  }
  // Count KG terms per deck
  const termCountByDeck = {};
  kgSubgraph.nodes.forEach(node => {
    const deck = node.deckName || '';
    // Match by last segment (short deck name)
    const shortDeck = deck.split('::').pop();
    termCountByDeck[shortDeck] = (termCountByDeck[shortDeck] || 0) + (node.subsetCount || 1);
  });

  return deckGroups.sort((a, b) => {
    const aScore = termCountByDeck[a.deck] || 0;
    const bScore = termCountByDeck[b.deck] || 0;
    if (bScore !== aScore) return bScore - aScore;
    return b.images.length - a.images.length;
  });
}

function getClusterForImage(image, searchResult, clusterLabels) {
  const clusters = searchResult?.clusters || [];
  for (let ci = 0; ci < clusters.length; ci++) {
    const ids = new Set(clusters[ci].cards.map(c => Number(c.id)));
    if (image.cardIds.some(id => ids.has(Number(id)))) {
      const key = `cluster_${ci}`;
      return clusterLabels?.[key] || clusters[ci]?.label || '';
    }
  }
  return '';
}

// --- ImageTile (memoized) ---

const ImageTile = React.memo(function ImageTile({ image, isSelected, onClick }) {
  const multiCount = image.cardIds.length;

  return (
    <div
      style={{
        ...TILE_STYLE,
        boxShadow: isSelected
          ? '0 0 0 2px var(--ds-accent), 0 0 16px var(--ds-accent-10)'
          : 'none',
      }}
      onClick={onClick}
      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.zIndex = '1'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.zIndex = '0'; }}
    >
      <img src={image.src} alt="" style={TILE_IMG_STYLE} loading="lazy" />
      {multiCount > 1 && <div style={BADGE_STYLE}>{multiCount} Karten</div>}
    </div>
  );
});

// --- Lightbox ---

function Lightbox({ images, currentIdx, clusterLabel, deckName, onNav, onClose }) {
  const image = images[currentIdx];
  if (!image) return null;

  const filmstripRef = React.useRef(null);

  // Scroll active thumb into view
  useEffect(() => {
    const fs = filmstripRef.current;
    if (!fs) return;
    const active = fs.children[currentIdx];
    if (active) active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [currentIdx]);

  return (
    <div
      style={{ ...LB_OVERLAY, opacity: 1, pointerEvents: 'auto' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Header: Deck › Perspektive | Quelle */}
      <div style={LB_HEADER}>
        <div style={LB_BREADCRUMB}>
          <span style={{ color: 'var(--ds-text-secondary)', fontWeight: 500 }}>{deckName}</span>
          {clusterLabel && (
            <>
              <span style={{ color: 'var(--ds-text-muted)', fontSize: 10 }}>›</span>
              <span style={{ color: 'var(--ds-text-tertiary)' }}>{clusterLabel}</span>
            </>
          )}
        </div>
        <span
          style={LB_SOURCE}
          onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '0.7'; }}
        >
          Quelle aufrufen
        </span>
      </div>

      {/* Big image */}
      <div style={LB_CENTER}>
        <button
          style={{ ...LB_NAV, left: 10 }}
          onClick={(e) => { e.stopPropagation(); onNav(-1); }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--ds-active-tint)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--ds-hover-tint)'; }}
        >
          ‹
        </button>

        <div style={LB_IMAGE_BOX}>
          <img src={image.src} alt="" style={LB_IMG} />
          <div style={LB_COUNTER}>{currentIdx + 1} / {images.length}</div>
        </div>

        <button
          style={{ ...LB_NAV, right: 10 }}
          onClick={(e) => { e.stopPropagation(); onNav(1); }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--ds-active-tint)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--ds-hover-tint)'; }}
        >
          ›
        </button>
      </div>

      {/* Filmstrip */}
      <div style={LB_FILMSTRIP_WRAP}>
        <div style={LB_FILMSTRIP} ref={filmstripRef}>
          {images.map((img, i) => (
            <div
              key={img.filename}
              style={{
                ...LB_THUMB_BASE,
                borderColor: i === currentIdx ? 'var(--ds-accent)' : 'transparent',
                opacity: i === currentIdx ? 1 : 0.5,
                transform: i === currentIdx ? 'scale(1.04)' : 'scale(1)',
              }}
              onClick={(e) => { e.stopPropagation(); onNav(i - currentIdx); }}
              onMouseEnter={e => {
                if (i !== currentIdx) {
                  e.currentTarget.style.opacity = '0.8';
                  e.currentTarget.style.transform = 'scale(1.06)';
                }
              }}
              onMouseLeave={e => {
                if (i !== currentIdx) {
                  e.currentTarget.style.opacity = '0.5';
                  e.currentTarget.style.transform = 'scale(1)';
                }
              }}
            >
              <img src={img.src} alt="" style={LB_THUMB_IMG} loading="lazy" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Main component ---

export default function ImageCanvas({
  searchResult,
  clusterLabels,
  kgSubgraph,
  onSelectionChange,
}) {
  const [images, setImages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState(null); // null = closed, number = open at index

  // Flat list of all images for lightbox navigation
  const allImages = useMemo(() => {
    if (!images.length) return [];
    const groups = groupByDeck(images);
    const sorted = sortDecksByKgRelevance(groups, kgSubgraph);
    return sorted.flatMap(g => g.images);
  }, [images, kgSubgraph]);

  // Request images when search results change
  useEffect(() => {
    if (!searchResult?.cards?.length) {
      setImages([]);
      setLightboxIdx(null);
      return;
    }

    const cardIds = [...searchResult.cards]
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 30)
      .map(c => Number(c.id));

    setIsLoading(true);
    setLightboxIdx(null);
    window.ankiBridge?.addMessage('getCardImages', {
      cardIds: JSON.stringify(cardIds),
    });
  }, [searchResult]);

  // Listen for response
  useEffect(() => {
    const handler = (e) => {
      const data = e.detail;
      if (data?.images) {
        setImages(data.images);
        setIsLoading(false);
      }
    };
    window.addEventListener('graph.cardImages', handler);
    return () => window.removeEventListener('graph.cardImages', handler);
  }, []);

  // Grouped + sorted deck groups
  const deckGroups = useMemo(() => {
    if (!images.length) return [];
    const groups = groupByDeck(images);
    return sortDecksByKgRelevance(groups, kgSubgraph);
  }, [images, kgSubgraph]);

  // Open lightbox — find index in allImages
  const openLightbox = useCallback((image) => {
    const idx = allImages.findIndex(i => i.filename === image.filename);
    setLightboxIdx(idx >= 0 ? idx : 0);
  }, [allImages]);

  // Lightbox navigation
  const navLightbox = useCallback((delta) => {
    setLightboxIdx(prev => {
      if (prev == null) return null;
      return (prev + delta + allImages.length) % allImages.length;
    });
  }, [allImages]);

  const closeLightbox = useCallback(() => {
    setLightboxIdx(null);
  }, []);

  // Compute selected card IDs from lightbox image
  const selectedCardIds = useMemo(() => {
    if (lightboxIdx == null || !allImages[lightboxIdx]) return [];
    return allImages[lightboxIdx].cardIds.map(Number);
  }, [lightboxIdx, allImages]);

  // Notify parent
  useEffect(() => {
    onSelectionChange?.(selectedCardIds);
  }, [selectedCardIds, onSelectionChange]);

  // Keyboard: Escape, ArrowLeft, ArrowRight
  useEffect(() => {
    const onKey = (e) => {
      if (lightboxIdx == null) return;
      if (e.key === 'Escape') { e.preventDefault(); closeLightbox(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); navLightbox(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); navLightbox(1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxIdx, closeLightbox, navLightbox]);

  // --- Render ---

  if (isLoading) {
    return (
      <div style={CANVAS_STYLE}>
        {[0, 1, 2].map(r => (
          <div key={r} style={SKELETON_ROW}>
            {[1, 1.3, 1.1, 1.2].map((f, i) => (
              <div key={i} style={{
                height: 140, flex: f, borderRadius: 8,
                background: 'var(--ds-hover-tint)',
                animation: 'pulse 1.5s ease-in-out infinite',
                animationDelay: `${(r * 4 + i) * 0.08}s`,
              }} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (!images.length) {
    return (
      <div style={CANVAS_STYLE}>
        <div style={EMPTY_STYLE}>Keine Bilder in den Ergebnissen</div>
      </div>
    );
  }

  // Current lightbox image info
  const lbImage = lightboxIdx != null ? allImages[lightboxIdx] : null;
  const lbDeck = lbImage ? (lbImage.decks?.[String(lbImage.cardIds[0])] || '') : '';
  const lbCluster = lbImage ? getClusterForImage(lbImage, searchResult, clusterLabels) : '';

  return (
    <div style={CANVAS_STYLE}>
      {deckGroups.map(group => {
        const rows = chunkIntoRows(group.images, IMAGES_PER_ROW);
        return (
          <div key={group.deck} style={{ marginBottom: 16 }}>
            <div style={DECK_HEADER_STYLE}>
              {group.deck}
              <span style={DECK_COUNT_STYLE}>{group.images.length}</span>
            </div>
            {rows.map((row, ri) => (
              <div key={ri} style={GRID_ROW_STYLE}>
                {row.map(img => (
                  <ImageTile
                    key={img.filename}
                    image={img}
                    isSelected={lbImage?.filename === img.filename}
                    onClick={() => openLightbox(img)}
                  />
                ))}
              </div>
            ))}
          </div>
        );
      })}

      {/* Lightbox overlay */}
      {lightboxIdx != null && lbImage && (
        <Lightbox
          images={allImages}
          currentIdx={lightboxIdx}
          deckName={lbDeck}
          clusterLabel={lbCluster}
          onNav={navLightbox}
          onClose={closeLightbox}
        />
      )}
    </div>
  );
}
