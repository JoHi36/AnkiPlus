import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import ForceGraph3D from '3d-force-graph';
import { Search } from 'lucide-react';
import useKnowledgeGraph from '../hooks/useKnowledgeGraph';
import { executeAction } from '../actions';

const QUESTION_WORDS = /\b(was|wie|warum|erkläre|welche|wozu|wann|what|how|why|explain|which|when|describe)\b/i;
const MAX_W = 'var(--ds-content-width)';

const DECK_COLORS = ['#0A84FF','#30D158','#FF9F0A','#BF5AF2','#FF453A','#5AC8FA','#FFD60A','#AC8E68'];

function deckTreeToGraph(roots) {
  const nodes = [];
  const links = [];
  let colorIdx = 0;

  function walk(deck, parentId, topColor, depth) {
    if (!deck || !deck.id) return;
    const color = depth === 0 ? DECK_COLORS[colorIdx++ % DECK_COLORS.length] : topColor;
    const total = deck.total || 0;
    if (total === 0 && (!deck.children || deck.children.length === 0)) return;

    nodes.push({
      id: String(deck.id),
      label: deck.display || deck.name,
      fullName: deck.name,
      total: total,
      dueNew: deck.dueNew || 0,
      dueLearn: deck.dueLearn || 0,
      dueReview: deck.dueReview || 0,
      deckColor: color,
      depth: depth,
      parentId: parentId,
    });

    if (parentId) {
      links.push({ source: parentId, target: String(deck.id), value: 1, type: 'hierarchy' });
    }

    if (deck.children) {
      deck.children.forEach(child => walk(child, String(deck.id), color, depth + 1));
    }
  }

  roots.forEach(root => walk(root, null, null, 0));
  return { nodes, links };
}

export default function GraphView({ onToggleView, isPremium, deckData }) {
  const containerRef = useRef(null);
  const graphRef = useRef(null);
  const debounceRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');

  const {
    selectedTerm,
    setSelectedTerm,
    searchResult,
    searchGraph,
  } = useKnowledgeGraph();

  const graphData = useMemo(() => {
    if (!deckData?.roots?.length) return null;
    return deckTreeToGraph(deckData.roots);
  }, [deckData]);

  // Handle node click — fly camera to node
  const handleNodeClick = useCallback((node) => {
    if (!node || !graphRef.current) return;
    setSelectedTerm(node.label);

    const distance = 80;
    const distRatio = 1 + distance / Math.hypot(node.x || 1, node.y || 1, node.z || 1);
    graphRef.current.cameraPosition(
      { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
      node,
      1000
    );
  }, [setSelectedTerm]);

  // Build / rebuild the graph when data arrives
  useEffect(() => {
    if (!containerRef.current || !graphData) return;

    const graph = ForceGraph3D()(containerRef.current);
    graphRef.current = graph;

    graph
      .graphData({ nodes: graphData.nodes, links: graphData.links })
      .backgroundColor('rgba(0,0,0,0)')
      .nodeColor(node => node.deckColor || '#0A84FF')
      .nodeVal(node => {
        const base = Math.log2((node.total || 1) + 1);
        return node.depth === 0 ? base * 3 : base * 1.5;
      })
      .nodeLabel(node => {
        const due = node.dueNew + node.dueLearn + node.dueReview;
        return `${node.label} (${node.total} Karten, ${due} fällig)`;
      })
      .linkWidth(link => link.type === 'hierarchy' ? 0.5 : Math.min((link.value || 1) / 2, 3))
      .linkOpacity(link => link.type === 'hierarchy' ? 0.08 : 0.3)
      .linkColor(link => link.type === 'hierarchy' ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.25)')
      .onNodeClick(handleNodeClick)
      .enableNodeDrag(false)
      .d3AlphaDecay(0.04)
      .d3VelocityDecay(0.4)
      .showNavInfo(false);

    // Auto-rotate
    if (graph.controls()) {
      graph.controls().autoRotate = true;
      graph.controls().autoRotateSpeed = 0.3;
    }

    // Resize observer — keep canvas in sync with window size
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphData]);

  // Keep the click handler current
  useEffect(() => {
    if (!graphRef.current) return;
    graphRef.current.onNodeClick(handleNodeClick);
  }, [handleNodeClick]);

  // Focused sub-network search: show only matched decks + parents
  useEffect(() => {
    if (!graphRef.current || !graphData) return;

    if (!searchResult?.matchedDeckIds?.length) {
      // No search — show all nodes, restore default visibility
      graphRef.current.nodeVisibility(() => true);
      graphRef.current.linkVisibility(() => true);
      graphRef.current.nodeColor(node => node.deckColor || '#0A84FF');
      return;
    }

    // Build set of matched deck IDs
    const matched = new Set(searchResult.matchedDeckIds.map(String));

    // Include parent decks of matched decks
    const visible = new Set(matched);
    graphData.nodes.forEach(node => {
      if (matched.has(node.id) && node.parentId) {
        visible.add(node.parentId);
      }
    });

    // Show only the sub-network
    graphRef.current.nodeVisibility(node => visible.has(node.id));
    graphRef.current.linkVisibility(link => {
      const src = link.source?.id || link.source;
      const tgt = link.target?.id || link.target;
      return visible.has(src) && visible.has(tgt);
    });
    graphRef.current.nodeColor(node =>
      matched.has(node.id) ? '#FFFFFF' : (node.deckColor || '#0A84FF')
    );

    // Fly camera to first matched node
    const firstMatch = graphData.nodes.find(n => matched.has(n.id));
    if (firstMatch && graphRef.current.graphData().nodes.length > 0) {
      const nodes3d = graphRef.current.graphData().nodes;
      const target = nodes3d.find(n => n.id === firstMatch.id);
      if (target) {
        graphRef.current.cameraPosition(
          { x: target.x + 100, y: target.y + 50, z: target.z + 100 },
          target, 1000
        );
      }
    }
  }, [searchResult, graphData]);

  // Debounced search
  const handleSearchChange = useCallback((e) => {
    const query = e.target.value;
    setSearchQuery(query);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (query.trim()) {
        searchGraph(query.trim());
      } else {
        // Clear search — restore full graph
        if (graphRef.current) {
          graphRef.current.nodeVisibility(() => true);
          graphRef.current.linkVisibility(() => true);
          graphRef.current.nodeColor(node => node.deckColor || '#0A84FF');
        }
      }
    }, 300);
  }, [searchGraph]);

  const isLoading = !deckData;
  const hasGraph = graphData?.nodes?.length > 0;

  return (
    <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
      {/* 3D graph canvas — FULLSCREEN BACKGROUND */}
      <div
        ref={containerRef}
        style={{ position: 'absolute', inset: 0 }}
      />

      {/* Header + search overlaid on top */}
      <div style={{ position: 'relative', zIndex: 10, pointerEvents: 'none' }}>
        {/* === HEADER: Anki.plus wordmark === */}
        <div style={{
          paddingTop: 64,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 10, marginBottom: 16, width: '100%', maxWidth: MAX_W,
          margin: '0 auto 16px', padding: '64px 20px 0',
          position: 'relative',
          pointerEvents: 'auto',
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

          {/* Deck list toggle */}
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
              onMouseEnter={e => {
                e.currentTarget.style.color = 'var(--ds-text-primary)';
                e.currentTarget.style.background = 'var(--ds-active-tint)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'var(--ds-text-secondary)';
                e.currentTarget.style.background = 'var(--ds-hover-tint)';
              }}
            >
              Deck-Liste
            </button>
          )}
        </div>

        {/* === SEARCH BAR === */}
        <div style={{
          width: '100%', maxWidth: MAX_W,
          padding: '0 20px', marginBottom: 16,
          margin: '0 auto',
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
              onChange={handleSearchChange}
              placeholder="Deck suchen..."
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: 'var(--ds-text-primary)', fontSize: 15,
                fontFamily: 'var(--ds-font-sans)',
              }}
            />
            <span style={{ color: 'var(--ds-text-placeholder)', fontSize: 12, fontWeight: 500 }}>⌘K</span>
          </div>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 12, color: 'var(--ds-text-secondary)', fontSize: 14, pointerEvents: 'none',
          zIndex: 5,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            border: '2px solid var(--ds-border-subtle)',
            borderTopColor: 'var(--ds-accent)',
            animation: 'spin 0.8s linear infinite',
          }} />
          <span>Wissensgraph wird geladen...</span>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !hasGraph && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 8, color: 'var(--ds-text-tertiary)', fontSize: 14, pointerEvents: 'none',
          zIndex: 5,
        }}>
          <span style={{ fontSize: 32, opacity: 0.3 }}>◎</span>
          <span>Keine Decks vorhanden</span>
        </div>
      )}

      {/* Selected term badge */}
      {selectedTerm && (
        <div style={{
          position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          padding: '4px 12px', borderRadius: 20,
          background: 'var(--ds-accent-10)', border: '1px solid var(--ds-accent-20)',
          color: 'var(--ds-accent)', fontSize: 12, fontWeight: 500,
          pointerEvents: 'none', zIndex: 10, whiteSpace: 'nowrap',
        }}>
          {selectedTerm}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
