import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import ForceGraph3D from '3d-force-graph';
import { Search } from 'lucide-react';
import { executeAction } from '../actions';
import KnowledgeHeatmap from './KnowledgeHeatmap';
import ChatInput from './ChatInput';

const MAX_W = 'var(--ds-content-width)';

// Deck name → color mapping (consistent colors for same decks)
const DECK_COLORS = ['#0A84FF','#30D158','#FF9F0A','#BF5AF2','#FF453A','#5AC8FA','#FFD60A','#AC8E68'];
function deckColor(deckName) {
  let hash = 0;
  for (let i = 0; i < deckName.length; i++) hash = ((hash << 5) - hash + deckName.charCodeAt(i)) | 0;
  return DECK_COLORS[Math.abs(hash) % DECK_COLORS.length];
}

export default function GraphView({ onToggleView, isPremium, deckData }) {
  const containerRef = useRef(null);
  const graphRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null);
  const [searchActive, setSearchActive] = useState(false);
  const [answerText, setAnswerText] = useState(null);

  // Listen for search results and quick answers from backend
  useEffect(() => {
    const onSearchCards = (e) => {
      setSearchResult(e.detail);
      setIsSearching(false);
    };
    const onQuickAnswer = (e) => {
      setAnswerText(e.detail?.answer || null);
    };
    window.addEventListener('graph.searchCards', onSearchCards);
    window.addEventListener('graph.quickAnswer', onQuickAnswer);
    return () => {
      window.removeEventListener('graph.searchCards', onSearchCards);
      window.removeEventListener('graph.quickAnswer', onQuickAnswer);
    };
  }, []);

  // Handle search submit from State A (centered search bar)
  const handleSearch = useCallback(() => {
    const query = searchQuery.trim();
    if (!query) return;
    setSearchActive(true);
    setIsSearching(true);
    setSearchResult(null);
    setAnswerText(null);
    setSelectedCard(null);
    window.ankiBridge?.addMessage('searchCards', { query, topK: 25 });
    window.ankiBridge?.addMessage('quickAnswer', { query });
  }, [searchQuery]);

  // Handle search from State B (ChatInput at bottom)
  const handleSearchWithQuery = useCallback((query) => {
    setSearchQuery(query);
    setIsSearching(true);
    setSearchResult(null);
    setAnswerText(null);
    setSelectedCard(null);
    window.ankiBridge?.addMessage('searchCards', { query: query.trim(), topK: 25 });
    window.ankiBridge?.addMessage('quickAnswer', { query: query.trim() });
  }, []);

  // Reset to State A
  const handleReset = useCallback(() => {
    setSearchActive(false);
    setSearchResult(null);
    setAnswerText(null);
    setSearchQuery('');
    setSelectedCard(null);
    if (graphRef.current?._destructor) graphRef.current._destructor();
    graphRef.current = null;
  }, []);

  // Build / rebuild graph when search results arrive
  useEffect(() => {
    if (!containerRef.current || !searchResult?.cards?.length) {
      if (graphRef.current) graphRef.current.graphData({ nodes: [], links: [] });
      return;
    }

    const clusters = searchResult.clusters || [];
    const nodes = [];
    const links = [];

    // Query center node
    nodes.push({
      id: '__query__',
      label: searchResult.query,
      color: '#FFFFFF',
      isQuery: true,
      isCluster: false,
      val: 5,
    });

    // All cards connect directly to query — colored by cluster
    if (clusters.length > 1) {
      clusters.forEach((cluster, ci) => {
        const clusterColor = DECK_COLORS[ci % DECK_COLORS.length];
        cluster.cards.forEach(card => {
          nodes.push({
            id: card.id,
            label: card.question,
            deck: card.deck,
            deckFull: card.deckFull,
            score: card.score,
            color: clusterColor,
            clusterLabel: cluster.label,
            clusterIndex: ci,
            isQuery: false,
            isCluster: false,
            val: 1.0 + (card.score || 0.5),
          });
          links.push({ source: '__query__', target: card.id, value: card.score || 0.5 });
        });
      });
    } else {
      // No clusters — all cards same color
      searchResult.cards.forEach(card => {
        nodes.push({
          id: card.id,
          label: card.question,
          deck: card.deck,
          deckFull: card.deckFull,
          score: card.score,
          color: deckColor(card.deck),
          isQuery: false,
          isCluster: false,
          val: 1.0 + (card.score || 0.5),
        });
        links.push({ source: '__query__', target: card.id, value: card.score || 0.5 });
      });
    }

    // Inter-cluster links removed (no cluster nodes to connect)
    // Cards of same cluster naturally group via force physics
    if (false && searchResult.clusterLinks) {
      searchResult.clusterLinks.forEach(cl => {
        links.push({
          source: cl.source,
          target: cl.target,
          value: cl.value * 0.5,  // thinner than cluster→card links
          isInterCluster: true,
        });
      });
    }

    // Destroy old graph
    if (graphRef.current?._destructor) graphRef.current._destructor();

    const graph = ForceGraph3D()(containerRef.current);
    graphRef.current = graph;

    graph
      .graphData({ nodes, links })
      .backgroundColor('rgba(0,0,0,0)')
      .nodeColor(n => n.color)
      .nodeVal(n => n.val)
      .nodeLabel(n => {
        if (n.isQuery) return n.label;
        const cluster = n.clusterLabel ? `[${n.clusterLabel}] ` : '';
        return `${cluster}${n.label}\n${n.deck}`;
      })
      .nodeOpacity(1.0)
      .linkWidth(l => l.isInterCluster ? 0.8 : (l.value || 0.5) * 2)
      .linkOpacity(l => l.isInterCluster ? 0.15 : 0.2)
      .linkColor(l => l.isInterCluster ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.2)')
      .onNodeClick(node => {
        if (!node || node.isQuery) return;
        setSelectedCard(node);
        const dist = 40;
        const ratio = 1 + dist / Math.hypot(node.x || 1, node.y || 1, node.z || 1);
        graph.cameraPosition(
          { x: node.x * ratio, y: node.y * ratio, z: node.z * ratio },
          node, 800
        );
      })
      .enableNodeDrag(false)
      .warmupTicks(0)
      .cooldownTicks(300)
      .d3AlphaDecay(0.015)
      .d3VelocityDecay(0.25)
      .showNavInfo(false);

    // Distance from center = relevance (closer = more relevant)
    graph.d3Force('link').distance(link => {
      const score = link.value || 0.5;
      // High relevance (0.9) → distance 25 (close to center)
      // Low relevance (0.3) → distance 100 (far out)
      return 20 + (1 - score) * 120;
    });

    // Stronger center gravity to keep it compact
    graph.d3Force('center', null); // remove default center force
    graph.d3Force('charge').strength(-40); // gentler repulsion

    // Zoom to fit all nodes after settling
    setTimeout(() => {
      if (graphRef.current) graphRef.current.zoomToFit(1000, 80);
    }, 2000);

    // Controls: rotate only, no pan
    if (graph.controls()) {
      graph.controls().autoRotate = true;
      graph.controls().autoRotateSpeed = 0.4;
      graph.controls().enablePan = false;
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

  // Compute cluster legend (falls back to deck breakdown if no clusters)
  const clusterLegend = useMemo(() => {
    if (!searchResult?.clusters?.length) {
      // Fallback to deck breakdown
      if (!searchResult?.cards?.length) return [];
      const counts = {};
      const colors = {};
      searchResult.cards.forEach(c => {
        const deck = c.deck || 'Unbekannt';
        counts[deck] = (counts[deck] || 0) + 1;
        if (!colors[deck]) colors[deck] = deckColor(deck);
      });
      return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([deck, count]) => ({ label: deck, count, color: colors[deck] }));
    }
    return searchResult.clusters.map((c, i) => ({
      label: c.label,
      count: c.cards.length,
      color: DECK_COLORS[i % DECK_COLORS.length],
    }));
  }, [searchResult]);

  // Only render the 3D canvas when we actually have search results and search is active
  const showGraph = searchActive && hasResults;

  return (
    <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
      {/* 3D canvas — only mounted when search is active and results exist (saves GPU) */}
      {showGraph && <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />}

      {/* Header — logo + Deck-Liste toggle, always visible */}
      <div style={{ position: 'relative', zIndex: 10, pointerEvents: 'none' }}>
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

        {/* State A: Centered search bar — only when not search active */}
        {!searchActive && (
          <form
            onSubmit={(e) => { e.preventDefault(); handleSearch(); }}
            style={{
              width: '100%', maxWidth: MAX_W,
              padding: '0 20px', margin: '0 auto',
              pointerEvents: 'auto',
            }}
          >
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
        )}
      </div>

      {/* State A: Heatmap — shown before any search when deck data is available */}
      {!searchActive && !isSearching && !searchResult?.error && deckData?.roots?.length > 0 && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '160px 24px 48px',
          zIndex: 5, pointerEvents: 'auto',
          overflowY: 'auto',
        }}>
          <KnowledgeHeatmap
            deckData={deckData}
            onStartStack={(deckId) => {
              executeAction('deck.study', { deckId });
            }}
          />
        </div>
      )}

      {/* State A: Empty state — no decks yet or loading */}
      {!searchActive && !isSearching && !searchResult?.error && !deckData?.roots?.length && (
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

      {/* State B: Cluster/Deck legend — right side (visible when search active + results) */}
      {searchActive && hasResults && clusterLegend.length > 0 && (
        <div style={{
          position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)',
          display: 'flex', flexDirection: 'column', gap: 6,
          zIndex: 10, pointerEvents: 'none',
        }}>
          {clusterLegend.map(({ label, count, color }) => (
            <div key={label} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 11, color: 'var(--ds-text-secondary)',
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: color, flexShrink: 0,
              }} />
              <span>{label}</span>
              <span style={{ color: 'var(--ds-text-tertiary)' }}>{count}</span>
            </div>
          ))}
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

      {/* State B: ChatInput docked at bottom */}
      {searchActive && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          zIndex: 15, pointerEvents: 'auto',
        }}>
          <ChatInput
            onSend={(text) => {
              if (text.trim()) {
                setSearchQuery(text);
                handleSearchWithQuery(text);
              }
            }}
            isLoading={isSearching}
            placeholder="Nächste Suche..."
            topSlot={answerText ? (
              <div style={{
                padding: '8px 14px',
                fontSize: 13,
                color: 'var(--ds-text-primary)',
                lineHeight: 1.5,
                borderBottom: '1px solid var(--ds-border-subtle)',
              }}>
                {answerText}
              </div>
            ) : null}
            actionPrimary={{
              label: searchResult?.totalFound ? `${searchResult.totalFound} Karten kreuzen` : '',
              onClick: () => {
                if (searchResult?.cards?.length) {
                  window.ankiBridge?.addMessage('startTermStack', {
                    term: searchResult.query,
                    cardIds: JSON.stringify(searchResult.cards.map(c => Number(c.id))),
                  });
                }
              },
              disabled: !searchResult?.totalFound,
            }}
            actionSecondary={{
              label: '',
              shortcut: 'Esc',
              onClick: handleReset,
            }}
          />
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
