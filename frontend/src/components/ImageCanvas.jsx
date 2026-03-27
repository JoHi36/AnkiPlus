import React, { useState, useEffect, useMemo, useCallback } from 'react';

// --- Static styles ---

const CANVAS_STYLE = {
  flex: 1,
  overflowY: 'auto',
  padding: '72px 20px 20px',  // top padding clears TopBar header
  background: 'var(--ds-bg-deep)',
  scrollbarWidth: 'none',
  display: 'flex',
  flexDirection: 'column',
};

const DECK_HEADER_STYLE = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 6,
  marginBottom: 8,
  paddingTop: 8,
};

const DECK_LABEL_STYLE = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--ds-text-tertiary)',
  letterSpacing: '0.02em',
};

const DECK_COUNT_STYLE = {
  fontSize: 10,
  color: 'var(--ds-text-muted)',
};

const GRID_STYLE = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
};

const TILE_BASE = {
  position: 'relative',
  cursor: 'pointer',
  borderRadius: 8,
  overflow: 'hidden',
  transition: 'all 0.25s ease',
  flexShrink: 0,
};

const THUMB_IMG = {
  display: 'block',
  height: 80,
  width: 'auto',
  minWidth: 60,
  maxWidth: 160,
  objectFit: 'cover',
};

const EXPANDED_IMG = {
  display: 'block',
  maxHeight: 320,
  maxWidth: '100%',
  width: 'auto',
  objectFit: 'contain',
};

const BADGE_STYLE = {
  position: 'absolute',
  background: 'var(--ds-bg-overlay)',
  backdropFilter: 'blur(4px)',
  borderRadius: 4,
  padding: '1px 5px',
  fontSize: 8,
  color: 'var(--ds-text-tertiary)',
};

const DECK_BADGE_STYLE = { ...BADGE_STYLE, top: 4, left: 4 };
const MULTI_BADGE_STYLE = { ...BADGE_STYLE, bottom: 4, right: 4 };

const CHECK_STYLE = {
  position: 'absolute',
  top: -3,
  right: -3,
  width: 16,
  height: 16,
  background: 'var(--ds-accent)',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 9,
  color: 'var(--ds-bg-deep)',
  zIndex: 2,
};

const EMPTY_STYLE = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--ds-text-muted)',
  fontSize: 13,
};

const SKELETON_STYLE = {
  height: 80,
  borderRadius: 8,
  background: 'var(--ds-hover-tint)',
  animation: 'pulse 1.5s ease-in-out infinite',
};

const EXPANDED_CONTAINER = {
  width: '100%',
  borderRadius: 10,
  border: '2px solid var(--ds-accent)',
  boxShadow: '0 0 0 1px var(--ds-accent-10)',
  overflow: 'hidden',
  position: 'relative',
  background: 'var(--ds-bg-canvas)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 8,
  cursor: 'pointer',
};

const EXPANDED_QUESTION = {
  fontSize: 11,
  color: 'var(--ds-text-secondary)',
  padding: '6px 8px',
  lineHeight: 1.4,
};

// --- Group images by deck ---

function groupByDeck(images) {
  const groups = {};
  images.forEach(img => {
    // Use the first card's deck as the group key
    const firstCardId = img.cardIds[0];
    const deck = img.decks?.[String(firstCardId)] || 'Sonstige';
    if (!groups[deck]) groups[deck] = { deck, images: [] };
    groups[deck].images.push(img);
  });
  // Sort by image count descending
  return Object.values(groups).sort((a, b) => b.images.length - a.images.length);
}

// --- ImageTile (memoized) ---

const ImageTile = React.memo(function ImageTile({ image, isExpanded, isMultiSelected, isOtherExpanded, onClick }) {
  const firstCardId = image.cardIds[0];
  const question = image.questions?.[String(firstCardId)] || '';
  const deck = image.decks?.[String(firstCardId)] || '';
  const multiCount = image.cardIds.length;

  // Expanded view — large image with question
  if (isExpanded) {
    return (
      <div style={{ width: '100%', marginBottom: 4 }}>
        <div
          style={EXPANDED_CONTAINER}
          onClick={onClick}
        >
          <img src={image.src} alt={question} style={EXPANDED_IMG} loading="lazy" />
          {multiCount > 1 && <div style={MULTI_BADGE_STYLE}>{multiCount} Karten</div>}
          <div style={CHECK_STYLE}>✓</div>
        </div>
        {question && <div style={EXPANDED_QUESTION}>{question}</div>}
      </div>
    );
  }

  // Thumbnail — shrinks when another is expanded
  const shrunk = isOtherExpanded;

  return (
    <div
      style={{
        ...TILE_BASE,
        border: isMultiSelected
          ? '2px solid var(--ds-accent)'
          : '1px solid var(--ds-border-subtle)',
        boxShadow: isMultiSelected ? '0 0 0 1px var(--ds-accent-10)' : 'none',
        opacity: shrunk ? 0.6 : 1,
        transform: shrunk ? 'scale(0.92)' : 'scale(1)',
      }}
      onClick={onClick}
      onMouseEnter={e => { if (!shrunk) e.currentTarget.style.transform = 'scale(1.03)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = shrunk ? 'scale(0.92)' : 'scale(1)'; }}
      title={question}
    >
      <img src={image.src} alt={question} style={THUMB_IMG} loading="lazy" />
      {deck && <div style={DECK_BADGE_STYLE}>{deck}</div>}
      {multiCount > 1 && <div style={MULTI_BADGE_STYLE}>{multiCount} Karten</div>}
      {isMultiSelected && <div style={CHECK_STYLE}>✓</div>}
    </div>
  );
});

// --- Main component ---

export default function ImageCanvas({
  searchResult,
  clusterLabels,
  onSelectionChange,
}) {
  const [images, setImages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedImage, setExpandedImage] = useState(null);     // single focused image filename
  const [multiSelected, setMultiSelected] = useState(new Set()); // cmd+click multi-select

  // Request images when search results change
  useEffect(() => {
    if (!searchResult?.cards?.length) {
      setImages([]);
      setExpandedImage(null);
      setMultiSelected(new Set());
      return;
    }

    const cardIds = searchResult.cards
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 30)
      .map(c => Number(c.id));

    setIsLoading(true);
    setExpandedImage(null);
    setMultiSelected(new Set());
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

  // Group images by deck
  const deckGroups = useMemo(() => {
    if (!images.length) return [];
    return groupByDeck(images);
  }, [images]);

  // Handle click — normal click expands, cmd+click multi-selects
  const handleClick = useCallback((filename, e) => {
    if (e?.metaKey || e?.ctrlKey) {
      // Multi-select mode
      setMultiSelected(prev => {
        const next = new Set(prev);
        if (next.has(filename)) next.delete(filename);
        else next.add(filename);
        return next;
      });
    } else {
      // Single expand — toggle
      setExpandedImage(prev => prev === filename ? null : filename);
      setMultiSelected(new Set());
    }
  }, []);

  // Compute selected card IDs (expanded + multi-selected)
  const selectedCardIds = useMemo(() => {
    const ids = new Set();
    const selectedFilenames = multiSelected.size > 0
      ? multiSelected
      : expandedImage ? new Set([expandedImage]) : new Set();

    selectedFilenames.forEach(filename => {
      const img = images.find(i => i.filename === filename);
      img?.cardIds?.forEach(id => ids.add(Number(id)));
    });
    return [...ids];
  }, [expandedImage, multiSelected, images]);

  // Notify parent
  useEffect(() => {
    onSelectionChange?.(selectedCardIds);
  }, [selectedCardIds, onSelectionChange]);

  // Escape to deselect
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && (expandedImage || multiSelected.size > 0)) {
        e.preventDefault();
        setExpandedImage(null);
        setMultiSelected(new Set());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expandedImage, multiSelected]);

  // Arrow keys to navigate between images when one is expanded
  useEffect(() => {
    if (!expandedImage || !images.length) return;
    const onKey = (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const idx = images.findIndex(i => i.filename === expandedImage);
      if (idx < 0) return;
      const next = e.key === 'ArrowRight'
        ? (idx + 1) % images.length
        : (idx - 1 + images.length) % images.length;
      setExpandedImage(images[next].filename);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expandedImage, images]);

  // --- Render ---

  if (isLoading) {
    return (
      <div style={CANVAS_STYLE}>
        <div style={GRID_STYLE}>
          {[100, 80, 120, 90, 110, 85, 95, 105].map((w, i) => (
            <div key={i} style={{ ...SKELETON_STYLE, width: w, animationDelay: `${i * 0.08}s` }} />
          ))}
        </div>
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

  return (
    <div style={CANVAS_STYLE}>
      {deckGroups.map(group => (
        <div key={group.deck} style={{ marginBottom: 16 }}>
          {/* Deck header */}
          <div style={DECK_HEADER_STYLE}>
            <span style={DECK_LABEL_STYLE}>{group.deck}</span>
            <span style={DECK_COUNT_STYLE}>{group.images.length}</span>
          </div>

          {/* Image tiles */}
          <div style={GRID_STYLE}>
            {group.images.map(img => (
              <ImageTile
                key={img.filename}
                image={img}
                isExpanded={expandedImage === img.filename}
                isMultiSelected={multiSelected.has(img.filename)}
                isOtherExpanded={expandedImage != null && expandedImage !== img.filename}
                onClick={(e) => handleClick(img.filename, e)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
