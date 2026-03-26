import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import ForceGraph3D from '3d-force-graph';
import { executeAction } from '../actions';
import KnowledgeHeatmap from './KnowledgeHeatmap';
import ChatInput from './ChatInput';

// Muted, darker color palette — brightens on cluster selection
const CLUSTER_COLORS = [
  '#3B6EA5', // steel blue
  '#4A8C5C', // forest green
  '#B07D3A', // amber
  '#7B5EA7', // muted purple
  '#A0524B', // terracotta
  '#4A9BAE', // teal
  '#A69550', // olive gold
  '#7A6B5D', // warm grey
];

// Brighter variants for selection highlight
const CLUSTER_BRIGHT = [
  '#5A9FD4', // bright steel
  '#5CB878', // bright green
  '#D4A04A', // bright amber
  '#A07DD4', // bright purple
  '#D06B62', // bright terracotta
  '#5CC4DA', // bright teal
  '#CDB860', // bright gold
  '#A0907E', // bright grey
];

function deckColor(deckName) {
  let hash = 0;
  for (let i = 0; i < deckName.length; i++) hash = ((hash << 5) - hash + deckName.charCodeAt(i)) | 0;
  return CLUSTER_COLORS[Math.abs(hash) % CLUSTER_COLORS.length];
}

export default function GraphView({ onToggleView, isPremium, deckData }) {
  const containerRef = useRef(null);
  const graphRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null);
  const [answerText, setAnswerText] = useState(null);
  const [clusterLabels, setClusterLabels] = useState(null); // LLM-generated labels

  // Listen for search results and quick answers from backend
  useEffect(() => {
    const onSearchCards = (e) => {
      setSearchResult(e.detail);
      setIsSearching(false);
      setClusterLabels(null); // reset until LLM responds
    };
    const onQuickAnswer = (e) => {
      setAnswerText(e.detail?.answer || null);
      // Update cluster labels from LLM if provided
      if (e.detail?.clusterLabels && Object.keys(e.detail.clusterLabels).length > 0) {
        setClusterLabels(e.detail.clusterLabels);
      }
    };
    window.addEventListener('graph.searchCards', onSearchCards);
    window.addEventListener('graph.quickAnswer', onQuickAnswer);
    return () => {
      window.removeEventListener('graph.searchCards', onSearchCards);
      window.removeEventListener('graph.quickAnswer', onQuickAnswer);
    };
  }, []);

  // Update graph node labels when LLM cluster labels arrive
  useEffect(() => {
    if (!clusterLabels || !graphRef.current || !searchResult?.clusters?.length) return;
    const graph = graphRef.current;
    const { nodes } = graph.graphData();
    nodes.forEach(n => {
      if (n.isQuery || n.clusterIndex === undefined) return;
      const clusterId = `cluster_${n.clusterIndex}`;
      if (clusterLabels[clusterId]) {
        n.clusterLabel = clusterLabels[clusterId];
      }
    });
    // Refresh labels by touching nodeLabel accessor
    graph.nodeLabel(n => {
      if (n.isQuery) return n.label;
      const cluster = n.clusterLabel ? `[${n.clusterLabel}] ` : '';
      return `${cluster}${n.label}\n${n.deck}`;
    });
  }, [clusterLabels, searchResult]);

  // Handle search from ChatInput
  const handleSearchWithQuery = useCallback((query) => {
    setSearchQuery(query);
    setIsSearching(true);
    setSearchResult(null);
    setAnswerText(null);
    setSelectedCard(null);
    setClusterLabels(null);
    window.ankiBridge?.addMessage('searchCards', { query: query.trim(), topK: 25 });
  }, []);

  // Reset to heatmap state
  const handleReset = useCallback(() => {
    setSearchResult(null);
    setAnswerText(null);
    setSearchQuery('');
    setSelectedCard(null);
    setClusterLabels(null);
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
      color: 'var(--ds-text-primary)',
      isQuery: true,
      isCluster: false,
      val: 5,
    });

    // Cards colored by cluster, only best card per cluster connects to query
    if (clusters.length > 1) {
      clusters.forEach((cluster, ci) => {
        const darkColor = CLUSTER_COLORS[ci % CLUSTER_COLORS.length];
        const brightColor = CLUSTER_BRIGHT[ci % CLUSTER_BRIGHT.length];
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
      .backgroundColor('transparent')
      .nodeColor(n => n.color)
      .nodeVal(n => n.val)
      .nodeLabel(n => {
        if (n.isQuery) return n.label;
        const cluster = n.clusterLabel ? `[${n.clusterLabel}] ` : '';
        return `${cluster}${n.label}\n${n.deck}`;
      })
      .nodeOpacity(1.0)
      .linkWidth(l => l.isIntraCluster ? 0.15 : l.isBalloonString ? 0.3 : 0.15)
      .linkOpacity(l => l.isIntraCluster ? 0.04 : l.isBalloonString ? 0.06 : 0.02)
      .linkColor(() => 'var(--ds-border)')
      .onNodeClick(node => {
        if (!node || node.isQuery) return;
        setSelectedCard(node);
        // Highlight entire cluster: brighten selected cluster, keep others dark
        if (node.clusterIndex !== undefined) {
          graph.nodeColor(n => {
            if (n.isQuery) return 'var(--ds-text-primary)';
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
      .showNavInfo(false)
      .onEngineStop(() => {
        // Zoom to fit once physics settle — reliable timing
        if (graphRef.current) graphRef.current.zoomToFit(800, 60);
      });

    graph.d3Force('link').distance(link => {
      if (link.isIntraCluster) return 15;
      const score = link.value || 0.5;
      return 30 + (1 - score) * 100;
    });

    graph.d3Force('center', null);
    graph.d3Force('charge').strength(-40);

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

  // Compute cluster legend — uses LLM labels when available
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
    return searchResult.clusters.map((c, i) => {
      const clusterId = `cluster_${i}`;
      const label = (clusterLabels && clusterLabels[clusterId]) || c.label;
      return {
        label,
        count: c.cards.length,
        color: CLUSTER_COLORS[i % CLUSTER_COLORS.length],
      };
    });
  }, [searchResult, clusterLabels]);

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
        {/* Left: Deck-Liste button */}
        <div style={{ display: 'flex', gap: 4, pointerEvents: 'auto' }}>
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
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--ds-text-primary)'; e.currentTarget.style.background = 'var(--ds-active-tint)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--ds-text-secondary)'; e.currentTarget.style.background = 'var(--ds-hover-tint)'; }}
            >
              Deck-Liste
            </button>
          )}
        </div>

        {/* Right: spacer */}
        <div />
      </div>

      {/* Heatmap — shown when no search results yet */}
      {!hasResults && deckData?.roots?.length > 0 && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '48px 24px 100px',
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
        padding: '0 20px 20px',
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
