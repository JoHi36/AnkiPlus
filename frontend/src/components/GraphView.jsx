import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import ForceGraph3D from '3d-force-graph';
import { executeAction } from '../actions';
import KnowledgeHeatmap from './KnowledgeHeatmap';
import ChatInput from './ChatInput';

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

  // Handle search from ChatInput
  const handleSearchWithQuery = useCallback((query) => {
    setSearchQuery(query);
    setIsSearching(true);
    setSearchResult(null);
    setAnswerText(null);
    setSelectedCard(null);
    window.ankiBridge?.addMessage('searchCards', { query: query.trim(), topK: 25 });
  }, []);

  // Reset to heatmap state
  const handleReset = useCallback(() => {
    setSearchResult(null);
    setAnswerText(null);
    setSearchQuery('');
    setSelectedCard(null);
    if (graphRef.current?._destructor) graphRef.current._destructor();
    graphRef.current = null;
  }, []);

  const startStack = useCallback(() => {
    if (!searchResult?.cards?.length) return;
    window.ankiBridge?.addMessage('startTermStack', {
      term: searchResult.query,
      cardIds: JSON.stringify(searchResult.cards.map(c => Number(c.id))),
    });
  }, [searchResult]);

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

    // Darker color palette (brightens on cluster selection)
    const DARK_COLORS = DECK_COLORS.map(c => {
      const r = parseInt(c.slice(1,3),16), g = parseInt(c.slice(3,5),16), b = parseInt(c.slice(5,7),16);
      return `rgb(${Math.round(r*0.5)},${Math.round(g*0.5)},${Math.round(b*0.5)})`;
    });

    // Cards colored by cluster, only best card per cluster connects to query
    if (clusters.length > 1) {
      clusters.forEach((cluster, ci) => {
        const darkColor = DARK_COLORS[ci % DARK_COLORS.length];
        const brightColor = DECK_COLORS[ci % DECK_COLORS.length];
        const clusterCardIds = [];
        let bestCardId = null;
        let bestScore = -1;

        cluster.cards.forEach(card => {
          nodes.push({
            id: card.id,
            label: card.question,
            deck: card.deck,
            deckFull: card.deckFull,
            score: card.score,
            color: darkColor,
            brightColor: brightColor,
            clusterLabel: cluster.label,
            clusterIndex: ci,
            isQuery: false,
            isCluster: false,
            val: 1.0 + (card.score || 0.5),
          });
          clusterCardIds.push(card.id);
          if ((card.score || 0) > bestScore) {
            bestScore = card.score || 0;
            bestCardId = card.id;
          }
        });

        // ONE line per cluster: only the best card connects to query ("balloon string")
        if (bestCardId) {
          links.push({ source: '__query__', target: bestCardId, value: 0.7, isBalloonString: true });
        }

        // Intra-cluster edges: pull cards together
        for (let i = 0; i < clusterCardIds.length; i++) {
          for (let j = i + 1; j < clusterCardIds.length; j++) {
            links.push({
              source: clusterCardIds[i],
              target: clusterCardIds[j],
              value: 0.15,
              isIntraCluster: true,
            });
          }
        }
      });
    } else {
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
      .linkWidth(l => l.isIntraCluster ? 0.2 : l.isBalloonString ? 0.6 : 0.3)
      .linkOpacity(l => l.isIntraCluster ? 0.08 : l.isBalloonString ? 0.12 : 0.03)
      .linkColor(() => 'rgba(150,150,160,0.10)')
      .onNodeClick(node => {
        if (!node || node.isQuery) return;
        setSelectedCard(node);
        // Highlight entire cluster: brighten selected cluster, keep others dark
        if (node.clusterIndex !== undefined) {
          graph.nodeColor(n => {
            if (n.isQuery) return '#FFFFFF';
            if (n.clusterIndex === node.clusterIndex) return n.brightColor || n.color;
            return n.color;
          });
        }
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

    graph.d3Force('link').distance(link => {
      if (link.isIntraCluster) return 15;
      const score = link.value || 0.5;
      return 30 + (1 - score) * 100;
    });

    graph.d3Force('center', null);
    graph.d3Force('charge').strength(-40);

    setTimeout(() => {
      if (graphRef.current) graphRef.current.zoomToFit(1000, 80);
    }, 2000);

    if (graph.controls()) {
      graph.controls().autoRotate = true;
      graph.controls().autoRotateSpeed = 0.4;
      graph.controls().enablePan = false;
    }

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

  // Compute cluster legend (falls back to deck breakdown if no clusters)
  const clusterLegend = useMemo(() => {
    if (!searchResult?.clusters?.length) {
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

  return (
    <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
      {/* 3D canvas — only mounted when search results exist (saves GPU) */}
      {hasResults && <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />}

      {/* Top bar — minimal: toggle + Deck-Liste */}
      <div style={{
        position: 'relative', zIndex: 10, pointerEvents: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', maxWidth: 'var(--ds-content-width)', margin: '0 auto',
        width: '100%',
      }}>
        {/* Left: placeholder for future Heatmap ↔ Stapel toggle */}
        <div style={{ display: 'flex', gap: 4, pointerEvents: 'auto' }} />

        {/* Right: Deck-Liste button */}
        {onToggleView && (
          <button
            onClick={onToggleView}
            style={{
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

      {/* Heatmap — shown when no search results yet */}
      {!hasResults && deckData?.roots?.length > 0 && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '50px 24px 80px',
          zIndex: 5, pointerEvents: 'auto',
          overflowY: 'auto',
        }}>
          <KnowledgeHeatmap
            deckData={deckData}
            onStartStack={(deckId) => executeAction('deck.study', { deckId })}
          />
        </div>
      )}

      {/* Empty state — no decks yet */}
      {!hasResults && !isSearching && !searchResult?.error && !deckData?.roots?.length && (
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

      {/* Cluster/Deck legend — right side (visible when search results exist) */}
      {hasResults && clusterLegend.length > 0 && (
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

      {/* ChatInput — always docked at bottom */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        zIndex: 15, pointerEvents: 'auto',
        display: 'flex', justifyContent: 'center',
      }}>
        <div style={{ width: '100%', maxWidth: 680 }}>
          <ChatInput
            onSend={(text) => {
              if (text.trim()) handleSearchWithQuery(text);
            }}
            isLoading={isSearching}
            placeholder="Was willst du lernen?"
            topSlot={answerText ? (
              <div style={{
                padding: '8px 14px', fontSize: 13,
                color: 'var(--ds-text-primary)', lineHeight: 1.5,
                borderBottom: '1px solid var(--ds-border-subtle)',
              }}>
                {answerText}
              </div>
            ) : null}
            actionPrimary={{
              label: hasResults ? `${searchResult.totalFound} Karten kreuzen` : '',
              onClick: startStack,
              disabled: !hasResults,
            }}
            actionSecondary={{
              label: '',
              shortcut: hasResults ? 'Esc' : '',
              onClick: handleReset,
            }}
          />
        </div>
      </div>
    </div>
  );
}
