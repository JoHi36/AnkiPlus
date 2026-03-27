import React, { useState, useEffect, useMemo, useCallback } from 'react';

// --- Static styles (no inline object creation per render) ---

const CANVAS_STYLE = {
  flex: 1,
  overflowY: 'auto',
  padding: 20,
  background: 'var(--ds-bg-deep)',
  scrollbarWidth: 'none',
  display: 'flex',
  flexDirection: 'column',
};

const CLUSTER_HEADER_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  marginBottom: 10,
};

const CLUSTER_LABEL_STYLE = {
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const CLUSTER_COUNT_STYLE = {
  fontSize: 10,
  color: 'var(--ds-text-muted)',
};

const TILE_GRID_STYLE = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
};

const TILE_STYLE = {
  position: 'relative',
  cursor: 'pointer',
  borderRadius: 10,
  overflow: 'hidden',
  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
};

const TILE_IMG_STYLE = {
  display: 'block',
  height: 100,
  width: 'auto',
  minWidth: 80,
  maxWidth: 200,
  objectFit: 'cover',
  borderRadius: 10,
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

const DECK_BADGE_STYLE = { ...BADGE_STYLE, top: 5, left: 5 };
const MULTI_BADGE_STYLE = { ...BADGE_STYLE, bottom: 5, right: 5 };

const CHECK_STYLE = {
  position: 'absolute',
  top: -4,
  right: -4,
  width: 18,
  height: 18,
  background: 'var(--ds-accent)',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 10,
  color: 'var(--ds-bg-deep)',
};

const EMPTY_STYLE = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--ds-text-muted)',
  fontSize: 13,
};

const HINT_STYLE = {
  textAlign: 'center',
  padding: 12,
  fontSize: 10,
  color: 'var(--ds-text-muted)',
  opacity: 0.5,
};

const SKELETON_STYLE = {
  height: 100,
  borderRadius: 10,
  background: 'var(--ds-hover-tint)',
  animation: 'pulse 1.5s ease-in-out infinite',
};

// Cluster colors — same as SearchSidebar
const CLUSTER_COLORS = [
  '#3B6EA5', '#4A8C5C', '#B07D3A', '#7B5EA7',
  '#A0524B', '#4A9BAE', '#A69550', '#7A6B5D',
];

// --- Cluster assignment ---

function assignCluster(image, searchResult) {
  const clusters = searchResult?.clusters || [];
  for (let ci = 0; ci < clusters.length; ci++) {
    const clusterCardIds = new Set(clusters[ci].cards.map(c => Number(c.id)));
    if (image.cardIds.some(id => clusterCardIds.has(Number(id)))) {
      return `cluster_${ci}`;
    }
  }
  return null;
}

// --- ImageTile (memoized for .map() usage) ---

const ImageTile = React.memo(function ImageTile({ image, isSelected, onToggle }) {
  const firstCardId = image.cardIds[0];
  const question = image.questions?.[String(firstCardId)] || '';
  const deck = image.decks?.[String(firstCardId)] || '';
  const multiCount = image.cardIds.length;

  return (
    <div
      style={{
        ...TILE_STYLE,
        border: isSelected
          ? '2px solid var(--ds-accent)'
          : '1px solid var(--ds-border-subtle)',
        boxShadow: isSelected ? '0 0 0 1px var(--ds-accent-10)' : 'none',
      }}
      onClick={() => onToggle(image.filename)}
      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
      title={question}
    >
      <img
        src={image.src}
        alt={question}
        style={TILE_IMG_STYLE}
        loading="lazy"
      />
      {deck && <div style={DECK_BADGE_STYLE}>{deck}</div>}
      {multiCount > 1 && (
        <div style={MULTI_BADGE_STYLE}>{multiCount} Karten</div>
      )}
      {isSelected && <div style={CHECK_STYLE}>✓</div>}
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
  const [selectedImages, setSelectedImages] = useState(new Set());

  // Request images when search results change
  useEffect(() => {
    if (!searchResult?.cards?.length) {
      setImages([]);
      setSelectedImages(new Set());
      return;
    }

    const cardIds = searchResult.cards
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 30)
      .map(c => Number(c.id));

    setIsLoading(true);
    setSelectedImages(new Set());
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

  // Group images by cluster
  const clusteredImages = useMemo(() => {
    if (!images.length || !searchResult) return [];

    const groups = {};
    images.forEach(img => {
      const clusterId = assignCluster(img, searchResult);
      const key = clusterId || '__unclustered__';
      if (!groups[key]) groups[key] = { clusterId: key, images: [] };
      groups[key].images.push(img);
    });

    // Sort clusters by index (cluster_0 first)
    return Object.values(groups).sort((a, b) => {
      if (a.clusterId === '__unclustered__') return 1;
      if (b.clusterId === '__unclustered__') return -1;
      const ai = parseInt(a.clusterId.replace('cluster_', ''), 10);
      const bi = parseInt(b.clusterId.replace('cluster_', ''), 10);
      return ai - bi;
    });
  }, [images, searchResult]);

  // Toggle image selection
  const toggleImage = useCallback((filename) => {
    setSelectedImages(prev => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });
  }, []);

  // Notify parent of selection changes
  const selectedCardIds = useMemo(() => {
    const ids = new Set();
    selectedImages.forEach(filename => {
      const img = images.find(i => i.filename === filename);
      img?.cardIds?.forEach(id => ids.add(Number(id)));
    });
    return [...ids];
  }, [selectedImages, images]);

  useEffect(() => {
    onSelectionChange?.(selectedCardIds);
  }, [selectedCardIds, onSelectionChange]);

  // Escape to deselect
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && selectedImages.size > 0) {
        e.preventDefault();
        setSelectedImages(new Set());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedImages]);

  // --- Render ---

  // Loading skeleton
  if (isLoading) {
    return (
      <div style={CANVAS_STYLE}>
        {[0, 1].map(g => (
          <div key={g} style={{ marginBottom: 24 }}>
            <div style={{ ...CLUSTER_HEADER_STYLE, marginBottom: 10 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ds-hover-tint)' }} />
              <div style={{ height: 10, width: 80, borderRadius: 3, background: 'var(--ds-hover-tint)', animation: 'pulse 1.5s ease-in-out infinite' }} />
            </div>
            <div style={TILE_GRID_STYLE}>
              {[120, 100, 140, 90].map((w, i) => (
                <div key={i} style={{ ...SKELETON_STYLE, width: w, animationDelay: `${i * 0.1}s` }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Empty state
  if (!images.length) {
    return (
      <div style={CANVAS_STYLE}>
        <div style={EMPTY_STYLE}>Keine Bilder in den Ergebnissen</div>
      </div>
    );
  }

  // Cluster-grouped grid
  return (
    <div style={CANVAS_STYLE}>
      {clusteredImages.map(group => {
        const ci = group.clusterId !== '__unclustered__'
          ? parseInt(group.clusterId.replace('cluster_', ''), 10)
          : -1;
        const color = ci >= 0 ? CLUSTER_COLORS[ci % CLUSTER_COLORS.length] : 'var(--ds-text-muted)';
        const label = ci >= 0
          ? (clusterLabels?.[group.clusterId] || searchResult?.clusters?.[ci]?.label || `Cluster ${ci + 1}`)
          : 'Sonstige';

        return (
          <div key={group.clusterId} style={{ marginBottom: 24 }}>
            {/* Cluster header */}
            <div style={CLUSTER_HEADER_STYLE}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ ...CLUSTER_LABEL_STYLE, color }}>{label}</span>
              <span style={CLUSTER_COUNT_STYLE}>{group.images.length} Bilder</span>
            </div>

            {/* Image tiles */}
            <div style={TILE_GRID_STYLE}>
              {group.images.map(img => (
                <ImageTile
                  key={img.filename}
                  image={img}
                  isSelected={selectedImages.has(img.filename)}
                  onToggle={toggleImage}
                />
              ))}
            </div>
          </div>
        );
      })}

      <div style={HINT_STYLE}>
        Klick → auswählen · Hover → Kartenfrage
      </div>
    </div>
  );
}
