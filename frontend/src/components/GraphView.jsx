import React, { useRef, useEffect, useCallback, useState } from 'react';
import ForceGraph3D from '3d-force-graph';
import { Search } from 'lucide-react';
import { executeAction } from '../actions';

const MAX_W = 'var(--ds-content-width)';

// Deck name → color mapping (consistent colors for same decks)
const DECK_COLORS = ['#0A84FF','#30D158','#FF9F0A','#BF5AF2','#FF453A','#5AC8FA','#FFD60A','#AC8E68'];
function deckColor(deckName) {
  let hash = 0;
  for (let i = 0; i < deckName.length; i++) hash = ((hash << 5) - hash + deckName.charCodeAt(i)) | 0;
  return DECK_COLORS[Math.abs(hash) % DECK_COLORS.length];
}

export default function GraphView({ onToggleView, isPremium }) {
  const containerRef = useRef(null);
  const graphRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null);

  // Listen for search results from backend
  useEffect(() => {
    const onSearchCards = (e) => {
      setSearchResult(e.detail);
      setIsSearching(false);
    };
    window.addEventListener('graph.searchCards', onSearchCards);
    return () => {
      window.removeEventListener('graph.searchCards', onSearchCards);
    };
  }, []);

  // Handle search submit
  const handleSearch = useCallback((e) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    setIsSearching(true);
    setSearchResult(null);
    setSelectedCard(null);

    // Request card search via backend embedding similarity
    window.ankiBridge?.addMessage('searchCards', { query, topK: 25 });
  }, [searchQuery]);

  // Build / rebuild graph when search results arrive
  useEffect(() => {
    if (!containerRef.current || !searchResult?.cards?.length) {
      // Clear graph if no results
      if (graphRef.current) {
        graphRef.current.graphData({ nodes: [], links: [] });
      }
      return;
    }

    const nodes = searchResult.cards.map((card, i) => ({
      id: card.id,
      label: card.question,
      deck: card.deck,
      deckFull: card.deckFull,
      score: card.score,
      color: deckColor(card.deck),
      _delay: i * 40,
    }));

    const links = searchResult.edges.map(e => ({
      source: e.source,
      target: e.target,
      value: e.similarity,
    }));

    // Destroy old graph
    if (graphRef.current?._destructor) graphRef.current._destructor();

    const graph = ForceGraph3D()(containerRef.current);
    graphRef.current = graph;

    graph
      .graphData({ nodes, links })
      .backgroundColor('rgba(0,0,0,0)')
      .nodeColor(node => node.color)
      .nodeVal(node => 1 + node.score * 2)
      .nodeLabel(node => `${node.label}\n${node.deck}`)
      .nodeOpacity(0.85)
      .linkWidth(link => link.value * 2)
      .linkOpacity(0.12)
      .linkColor(() => 'rgba(255,255,255,0.15)')
      .onNodeClick(node => {
        if (!node) return;
        setSelectedCard(node);
        // Fly camera to clicked node
        const dist = 40;
        const ratio = 1 + dist / Math.hypot(node.x || 1, node.y || 1, node.z || 1);
        graph.cameraPosition(
          { x: node.x * ratio, y: node.y * ratio, z: node.z * ratio },
          node, 800
        );
      })
      .enableNodeDrag(false)
      .warmupTicks(0)
      .cooldownTicks(200)
      .d3AlphaDecay(0.03)
      .d3VelocityDecay(0.3)
      .showNavInfo(false);

    // Auto-rotate slowly
    if (graph.controls()) {
      graph.controls().autoRotate = true;
      graph.controls().autoRotateSpeed = 0.5;
    }

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (containerRef.current && graphRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        graphRef.current.width(clientWidth).height(clientHeight);
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      if (graph._destructor) graph._destructor();
    };
  }, [searchResult]);

  const hasResults = searchResult?.cards?.length > 0;
  const cardIds = searchResult?.cards?.map(c => c.id) || [];

  return (
    <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
      {/* 3D canvas — fullscreen background */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Header + search overlaid */}
      <div style={{ position: 'relative', zIndex: 10, pointerEvents: 'none' }}>
        {/* Anki.plus header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 10, width: '100%', maxWidth: MAX_W,
          margin: '0 auto', padding: '64px 20px 16px',
          position: 'relative', pointerEvents: 'auto',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', pointerEvents: 'none' }}>
            <span style={{
              fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif',
              fontSize: 46, fontWeight: 700, letterSpacing: '-1.8px',
              color: 'var(--ds-text-primary)', lineHeight: 1,
            }}>Anki</span>
            <span style={{
              fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif',
              fontSize: 46, fontWeight: 300, letterSpacing: '-1px',
              color: 'var(--ds-text-muted)', lineHeight: 1,
            }}>.plus</span>
          </div>
          <span
            style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
              padding: '4px 9px', borderRadius: 7, alignSelf: 'center',
              marginTop: 4, cursor: 'pointer', whiteSpace: 'nowrap',
              pointerEvents: 'auto',
              ...(isPremium
                ? { background: 'var(--ds-accent-10)', border: '1px solid var(--ds-accent-20)', color: 'var(--ds-accent)' }
                : { background: 'var(--ds-hover-tint)', border: '1px solid var(--ds-border-medium)', color: 'var(--ds-text-placeholder)' }),
            }}
            onClick={() => executeAction('settings.toggle')}
          >
            {isPremium ? 'Pro' : 'Free'}
          </span>
          {onToggleView && (
            <button
              onClick={onToggleView}
              style={{
                position: 'absolute', right: 20, bottom: 0,
                background: 'var(--ds-hover-tint)',
                border: '1px solid var(--ds-border)',
                borderRadius: 8, padding: '6px 14px',
                color: 'var(--ds-text-secondary)',
                fontSize: 12, fontWeight: 500, cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'color 0.15s, background 0.15s',
                pointerEvents: 'auto',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--ds-text-primary)'; e.currentTarget.style.background = 'var(--ds-active-tint)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--ds-text-secondary)'; e.currentTarget.style.background = 'var(--ds-hover-tint)'; }}
            >
              Deck-Liste
            </button>
          )}
        </div>

        {/* Search bar */}
        <form onSubmit={handleSearch} style={{
          width: '100%', maxWidth: MAX_W,
          padding: '0 20px', margin: '0 auto',
          pointerEvents: 'auto',
        }}>
          <div
            className="ds-frosted"
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 16px', borderRadius: 12,
              border: '1px solid var(--ds-border-subtle)',
            }}
          >
            <Search size={16} style={{ color: 'var(--ds-accent)', flexShrink: 0 }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Was willst du lernen?"
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: 'var(--ds-text-primary)', fontSize: 15,
                fontFamily: 'var(--ds-font-sans)',
              }}
            />
            {isSearching && (
              <div style={{
                width: 16, height: 16, borderRadius: '50%',
                border: '2px solid var(--ds-border-subtle)',
                borderTopColor: 'var(--ds-accent)',
                animation: 'spin 0.8s linear infinite',
              }} />
            )}
            {!isSearching && <span style={{ color: 'var(--ds-text-placeholder)', fontSize: 12, fontWeight: 500 }}>&#9166;</span>}
          </div>
        </form>
      </div>

      {/* Empty state — before any search */}
      {!hasResults && !isSearching && !searchResult?.error && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 8, color: 'var(--ds-text-tertiary)', fontSize: 14, pointerEvents: 'none',
          zIndex: 5,
        }}>
          <span style={{ fontSize: 40, opacity: 0.15 }}>&#8984;</span>
          <span>Gib ein Thema ein, um einen Stapel zu erstellen</span>
        </div>
      )}

      {/* Error state */}
      {searchResult?.error && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 8, color: 'var(--ds-text-tertiary)', fontSize: 14, pointerEvents: 'none',
          zIndex: 5,
        }}>
          <span style={{ fontSize: 14, color: 'var(--ds-red)', opacity: 0.7 }}>{searchResult.error}</span>
          <span style={{ fontSize: 12 }}>Versuche es erneut</span>
        </div>
      )}

      {/* Bottom bar — results */}
      {hasResults && (
        <div style={{
          position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          padding: '12px 24px', borderRadius: 16,
          background: 'var(--ds-bg-frosted)', backdropFilter: 'blur(20px)',
          border: '1px solid var(--ds-border-subtle)',
          boxShadow: 'var(--ds-shadow-lg)',
          zIndex: 10, pointerEvents: 'auto',
          display: 'flex', alignItems: 'center', gap: 16,
          maxWidth: 500,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ds-text-primary)' }}>
              {searchResult.totalFound} Karten gefunden
            </div>
            <div style={{ fontSize: 12, color: 'var(--ds-text-secondary)', marginTop: 2 }}>
              {searchResult.query}
            </div>
          </div>
          <button
            onClick={() => {
              window.ankiBridge?.addMessage('startTermStack', {
                term: searchResult.query,
                cardIds: JSON.stringify(cardIds.map(Number)),
              });
            }}
            style={{
              background: 'var(--ds-accent)', color: 'white', border: 'none',
              borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
            }}
          >
            Stapel starten
          </button>
        </div>
      )}

      {/* Selected card tooltip */}
      {selectedCard && (
        <div style={{
          position: 'absolute', top: 200, right: 24,
          padding: '12px 16px', borderRadius: 12,
          background: 'var(--ds-bg-overlay)',
          border: '1px solid var(--ds-border-subtle)',
          boxShadow: 'var(--ds-shadow-md)',
          zIndex: 10, pointerEvents: 'auto',
          maxWidth: 280, fontSize: 13,
        }}>
          <div style={{ color: 'var(--ds-text-primary)', fontWeight: 500, marginBottom: 4 }}>
            {selectedCard.label}
          </div>
          <div style={{ color: 'var(--ds-text-tertiary)', fontSize: 11 }}>
            {selectedCard.deckFull} &middot; Relevanz: {Math.round(selectedCard.score * 100)}%
          </div>
          <button
            onClick={() => setSelectedCard(null)}
            style={{
              position: 'absolute', top: 8, right: 8,
              background: 'none', border: 'none', color: 'var(--ds-text-tertiary)',
              cursor: 'pointer', fontSize: 14,
            }}
          >&times;</button>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
