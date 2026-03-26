import React, { useRef, useEffect, useCallback, useState } from 'react';
import ForceGraph3D from '3d-force-graph';
import { executeAction } from '../actions';
import KnowledgeHeatmap from './KnowledgeHeatmap';
import ChatInput from './ChatInput';
import SearchSidebar from './SearchSidebar';
import DeckSearchBar from './DeckSearchBar';
import { DeckNode } from './DeckNode';
import { useDeckTree } from '../hooks/useDeckTree';

const MAX_W = 'var(--ds-content-width)';

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

export default function GraphView({ onToggleView, isPremium, deckData, smartSearch, bridge }) {
  const containerRef = useRef(null);
  const graphRef = useRef(null);
  const heatmapRef = useRef(null);
  const [heatmapDeck, setHeatmapDeck] = useState(null);
  const [contentMode, setContentMode] = useState('decks'); // 'decks' | 'heatmap'
  const { isExpanded, toggleExpanded } = useDeckTree();

  // Destructure smartSearch
  const {
    query, searchResult, isSearching, hasResults,
    answerText, clusterLabels, clusterSummaries,
    selectedClusterId, setSelectedClusterId,
    selectedCluster, selectedClusterLabel, selectedClusterSummary,
    search, reset,
  } = smartSearch;

  // Build / rebuild graph when search results arrive
  useEffect(() => {
    if (!containerRef.current || !searchResult?.cards?.length) {
      if (graphRef.current) graphRef.current.graphData({ nodes: [], links: [] });
      return;
    }

    const clusters = searchResult.clusters || [];
    const nodes = [];
    const links = [];

    nodes.push({
      id: '__query__',
      label: searchResult.query,
      color: '#ffffff',  // WebGL node — CSS vars not supported by 3d-force-graph
      isQuery: true,
      isCluster: false,
      val: 5,
    });

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

        if (bestCardId) {
          links.push({ source: '__query__', target: bestCardId, value: 0.7, isBalloonString: true });
        }

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
      .linkWidth(l => l.isIntraCluster ? 0.15 : l.isBalloonString ? 0.3 : 0.15)
      .linkOpacity(l => l.isIntraCluster ? 0.04 : l.isBalloonString ? 0.06 : 0.02)
      .linkColor(() => '#3A3A3C')  // WebGL link — CSS vars not supported by 3d-force-graph
      .onNodeClick(node => {
        if (!node || node.isQuery) return;
        if (node.clusterIndex !== undefined) {
          setSelectedClusterId(`cluster_${node.clusterIndex}`);
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
    graph.nodeLabel(n => {
      if (n.isQuery) return n.label;
      const cluster = n.clusterLabel ? `[${n.clusterLabel}] ` : '';
      return `${cluster}${n.label}\n${n.deck}`;
    });
  }, [clusterLabels, searchResult]);

  // Cluster selection → camera rotation + node highlighting
  useEffect(() => {
    if (!graphRef.current) return;

    if (!selectedClusterId) {
      // Reset all nodes to default color
      graphRef.current.nodeColor(n => n.isQuery ? '#FFFFFF' : n.color);
      return;
    }

    const graph = graphRef.current;
    const idx = parseInt(selectedClusterId.replace('cluster_', ''), 10);

    // Brighten selected cluster, dim others
    graph.nodeColor(n => {
      if (n.isQuery) return '#FFFFFF';
      if (n.clusterIndex === idx) return n.brightColor || n.color;
      return n.color;
    });

    // Rotate camera to cluster centroid
    const { nodes } = graph.graphData();
    const clusterNodes = nodes.filter(n => n.clusterIndex === idx);
    if (clusterNodes.length > 0) {
      const cx = clusterNodes.reduce((s, n) => s + (n.x || 0), 0) / clusterNodes.length;
      const cy = clusterNodes.reduce((s, n) => s + (n.y || 0), 0) / clusterNodes.length;
      const cz = clusterNodes.reduce((s, n) => s + (n.z || 0), 0) / clusterNodes.length;
      const dist = 60;
      const r = Math.hypot(cx, cy, cz) || 1;
      const ratio = 1 + dist / r;
      graph.cameraPosition(
        { x: cx * ratio, y: cy * ratio, z: cz * ratio },
        { x: 0, y: 0, z: 0 },
        800
      );
    }
  }, [selectedClusterId]);

  // Start stack — uses selected cluster cards or full result
  const startStack = useCallback(() => {
    const cards = selectedCluster?.cards || searchResult?.cards;
    if (!cards?.length) return;
    window.ankiBridge?.addMessage('startTermStack', {
      term: query,
      cardIds: JSON.stringify(cards.map(c => Number(c.id))),
    });
  }, [selectedCluster, searchResult, query]);

  // Keyboard handlers
  useEffect(() => {
    const onKey = (e) => {
      if (hasResults) {
        if (e.key === 'Escape') {
          e.preventDefault();
          if (selectedClusterId) {
            setSelectedClusterId(null);
          } else {
            reset();
            if (graphRef.current?._destructor) graphRef.current._destructor();
            graphRef.current = null;
          }
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          startStack();
          return;
        }
        const clusters = searchResult?.clusters;
        if (clusters?.length > 1) {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const currentIdx = selectedClusterId
              ? parseInt(selectedClusterId.replace('cluster_', ''), 10)
              : -1;
            const next = e.key === 'ArrowDown'
              ? Math.min(currentIdx + 1, clusters.length - 1)
              : Math.max(currentIdx - 1, 0);
            setSelectedClusterId(`cluster_${next}`);
          }
          if (e.key >= '1' && e.key <= '6') {
            const idx = parseInt(e.key, 10) - 1;
            if (idx < clusters.length) {
              setSelectedClusterId(`cluster_${idx}`);
            }
          }
        }
        return;
      }
      // Heatmap keyboard
      if (e.key === 'Escape' && heatmapDeck) {
        e.preventDefault();
        setHeatmapDeck(null);
      }
      if (e.key === ' ' && heatmapDeck?.hasChildren) {
        e.preventDefault();
        heatmapRef.current?.drillInto(heatmapDeck);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasResults, selectedClusterId, heatmapDeck, searchResult, reset, setSelectedClusterId, startStack]);

  // Heatmap deck selection info
  const isWeak = heatmapDeck && heatmapDeck.strength < 0.5;
  const deckDue = heatmapDeck ? (heatmapDeck.dueNew + heatmapDeck.dueLearn + heatmapDeck.dueReview) : 0;
  const clusterCards = selectedCluster?.cards;
  const totalCards = searchResult?.totalFound || 0;

  // topSlot content
  const topSlotContent = (() => {
    if (heatmapDeck && !hasResults) {
      return (
        <div style={{
          padding: '12px 16px', textAlign: 'center',
          borderBottom: '1px solid var(--ds-border-subtle)',
        }}>
          <div style={{
            fontSize: 15, fontWeight: 600,
            color: 'var(--ds-text-primary)',
          }}>
            {heatmapDeck.name}
          </div>
          <div style={{
            fontSize: 12, color: 'var(--ds-text-secondary)', marginTop: 4,
          }}>
            {heatmapDeck.cards} Karten &middot; {Math.round(heatmapDeck.strength * 100)}% gelernt
            {deckDue > 0 && (
              <span style={{ color: 'var(--ds-yellow)', marginLeft: 8 }}>
                {deckDue} fällig
              </span>
            )}
          </div>
        </div>
      );
    }
    if (hasResults) {
      return (
        <div style={{
          padding: '8px 14px', fontSize: 13,
          color: 'var(--ds-text-primary)',
          borderBottom: '1px solid var(--ds-border-subtle)',
        }}>
          {selectedClusterId
            ? `${selectedClusterLabel} \u00B7 ${clusterCards?.length || 0} Karten`
            : `${query} \u00B7 ${searchResult?.clusters?.length || 0} Cluster \u00B7 ${totalCards} Karten`
          }
        </div>
      );
    }
    return null;
  })();

  return (
    <div style={{ position: 'relative', flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* Canvas area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* 3D canvas — only when search results */}
        {hasResults && <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />}

        {/* Top bar — only when search results visible */}
        {hasResults && (
          <div style={{
            position: 'relative', zIndex: 10, pointerEvents: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 20px', maxWidth: MAX_W, margin: '0 auto',
            width: '100%',
          }}>
            <div />
            <div />
          </div>
        )}

        {/* ═══ DEFAULT STATE: DeckBrowser frame with toggle ═══ */}
        {!hasResults && (
          <div style={{
            flex: 1, overflow: 'hidden',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '0 20px',
          }}>
            {/* Wordmark — matches DeckBrowserView exactly */}
            <div style={{
              flexShrink: 0, paddingTop: 64,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 10, marginBottom: 24, width: '100%', maxWidth: MAX_W,
              position: 'relative',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline' }}>
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
                  ...(isPremium
                    ? { background: 'var(--ds-accent-10)', border: '1px solid var(--ds-accent-20)', color: 'var(--ds-accent)' }
                    : { background: 'var(--ds-hover-tint)', border: '1px solid var(--ds-border-medium)', color: 'var(--ds-text-placeholder)' }),
                }}
                onClick={() => executeAction('settings.toggle')}
              >
                {isPremium ? 'Pro' : 'Free'}
              </span>
            </div>

            {/* Search Bar */}
            <div style={{
              flexShrink: 0, width: '100%', maxWidth: MAX_W,
              marginBottom: 16,
            }}>
              <DeckSearchBar
                onSubmit={(text) => { if (text.trim()) search(text); }}
                onOpenEmpty={() => {}}
              />
            </div>

            {/* Content area — deck list or heatmap (only this part toggles) */}
            <div style={{
              flex: 1, overflowY: 'auto',
              width: '100%', maxWidth: MAX_W,
              paddingBottom: 60,
              scrollbarWidth: 'none',
            }}>
              {contentMode === 'decks' ? (
                /* Deck list — same as DeckBrowserView */
                <>
                  {(deckData?.roots || []).map((node, idx) => (
                    <DeckNode
                      key={node.id}
                      node={node}
                      depth={0}
                      isExpanded={isExpanded}
                      onToggle={toggleExpanded}
                      onStudy={(deckId) => executeAction('deck.study', { deckId })}
                      onSelect={(deckId) => executeAction('deck.select', { deckId })}
                      index={idx}
                    />
                  ))}
                  {(!deckData?.roots || deckData.roots.length === 0) && (
                    <div style={{
                      textAlign: 'center', padding: '40px 0',
                      color: 'var(--ds-text-muted)', fontSize: 13,
                    }}>
                      Keine Stapel vorhanden
                    </div>
                  )}
                </>
              ) : (
                /* Heatmap view */
                <KnowledgeHeatmap
                  ref={heatmapRef}
                  deckData={deckData}
                  selectedDeckId={heatmapDeck?.id ?? null}
                  onSelectDeck={setHeatmapDeck}
                />
              )}
            </div>

            {/* Toggle — Stapel / Heatmap */}
            <div style={{
              flexShrink: 0, width: '100%', maxWidth: MAX_W,
              display: 'flex', justifyContent: 'center',
              padding: '12px 0 20px',
            }}>
              <div style={{
                display: 'flex', gap: 0,
                background: 'var(--ds-hover-tint)',
                borderRadius: 8,
                border: '1px solid var(--ds-border)',
                overflow: 'hidden',
              }}>
                {['decks', 'heatmap'].map(mode => (
                  <button
                    key={mode}
                    onClick={() => setContentMode(mode)}
                    style={{
                      padding: '6px 16px',
                      fontSize: 12, fontWeight: 500,
                      fontFamily: 'inherit',
                      border: 'none', cursor: 'pointer',
                      color: contentMode === mode ? 'var(--ds-text-primary)' : 'var(--ds-text-tertiary)',
                      background: contentMode === mode ? 'var(--ds-active-tint)' : 'transparent',
                      transition: 'color 0.15s, background 0.15s',
                    }}
                  >
                    {mode === 'decks' ? 'Stapel' : 'Heatmap'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ SEARCH STATE: ChatInput docked at bottom ═══ */}
        {hasResults && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            zIndex: 15, pointerEvents: 'auto',
            display: 'flex', justifyContent: 'center',
            padding: '0 20px 20px',
          }}>
            <div style={{ width: '100%', maxWidth: 680 }}>
              <ChatInput
              onSend={(text) => { if (text.trim()) search(text); }}
              isLoading={isSearching}
              placeholder="Was willst du lernen?"
              hideInput={true}
              topSlot={topSlotContent}
              actionPrimary={{
                label: `${clusterCards?.length || totalCards} Karten kreuzen`,
                onClick: startStack,
              }}
              actionSecondary={{
                label: '',
                shortcut: 'Esc',
                onClick: () => { reset(); if (graphRef.current?._destructor) graphRef.current._destructor(); graphRef.current = null; },
              }}
            />
          </div>
        </div>
        )}
      </div>

      {/* SearchSidebar — right panel, only when results exist */}
      <SearchSidebar
        visible={hasResults}
        query={query}
        answerText={answerText}
        clusters={searchResult?.clusters}
        clusterLabels={clusterLabels}
        clusterSummaries={clusterSummaries}
        selectedClusterId={selectedClusterId}
        onSelectCluster={setSelectedClusterId}
        bridge={bridge}
      />
    </div>
  );
}
