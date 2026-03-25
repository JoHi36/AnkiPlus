import React, { useRef, useEffect, useCallback, useState } from 'react';
import ForceGraph3D from '3d-force-graph';
import { Search } from 'lucide-react';
import useKnowledgeGraph from '../hooks/useKnowledgeGraph';
import { executeAction } from '../actions';

const QUESTION_WORDS = /\b(was|wie|warum|erkläre|welche|wozu|wann|what|how|why|explain|which|when|describe)\b/i;
const MAX_W = 'var(--ds-content-width)';

export default function GraphView({ onToggleView, isPremium }) {
  const containerRef = useRef(null);
  const graphRef = useRef(null);
  const debounceRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');

  const {
    graphData,
    loading,
    selectedTerm,
    setSelectedTerm,
    searchResult,
    searchGraph,
    requestDefinition,
  } = useKnowledgeGraph();

  // Handle node click — fly camera to node and request definition
  const handleNodeClick = useCallback((node) => {
    if (!node || !graphRef.current) return;
    setSelectedTerm(node.id);
    requestDefinition(node.id);

    const distance = 80;
    const distRatio = 1 + distance / Math.hypot(node.x || 1, node.y || 1, node.z || 1);
    graphRef.current.cameraPosition(
      { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
      node,
      1000
    );
  }, [setSelectedTerm, requestDefinition]);

  // Build / rebuild the graph when data arrives
  useEffect(() => {
    if (!containerRef.current || !graphData) return;

    const links = graphData.edges.map(e => ({
      source: e.source,
      target: e.target,
      value: e.weight,
    }));

    const graph = ForceGraph3D()(containerRef.current);
    graphRef.current = graph;

    graph
      .graphData({ nodes: graphData.nodes, links })
      .backgroundColor('rgba(0,0,0,0)')
      .nodeColor(node => node.deckColor || '#0A84FF')
      .nodeVal(node => Math.max(0.5, Math.log2((node.frequency || 1) + 1) * 0.8))
      .nodeLabel(node => `${node.label} (${node.frequency || 0} Karten)`)
      .nodeVisibility(node => {
        if (!graphRef.current) return true;
        const camera = graphRef.current.camera();
        const dist = camera.position.length();
        if (dist < 200) return true;
        if (dist < 400) return (node.frequency || 1) >= 3;
        return (node.frequency || 1) >= 8;
      })
      .linkWidth(link => Math.min((link.value || 1) / 2, 3))
      .linkOpacity(0.15)
      .linkColor(() => 'rgba(255,255,255,0.1)')
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

    return () => {
      if (graph._destructor) graph._destructor();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphData]);

  // Keep the click handler current
  useEffect(() => {
    if (!graphRef.current) return;
    graphRef.current.onNodeClick(handleNodeClick);
  }, [handleNodeClick]);

  // Search highlighting
  useEffect(() => {
    if (!graphRef.current) return;
    const matched = new Set(searchResult?.matchedTerms || []);
    graphRef.current.nodeColor(node =>
      matched.size === 0
        ? (node.deckColor || '#0A84FF')
        : matched.has(node.id)
          ? (node.deckColor || '#0A84FF')
          : 'rgba(255,255,255,0.05)'
    );
  }, [searchResult]);

  // Debounced search
  const handleSearchChange = useCallback((e) => {
    const query = e.target.value;
    setSearchQuery(query);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (query.trim()) {
        searchGraph(query.trim());
      } else {
        if (graphRef.current) {
          graphRef.current.nodeColor(node => node.deckColor || '#0A84FF');
        }
      }
    }, 300);
  }, [searchGraph]);

  const hasGraph = graphData?.nodes?.length > 0;

  return (
    <div style={{
      flex: 1, overflow: 'hidden',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      position: 'relative',
    }}>
      {/* === HEADER: Anki.plus wordmark (same as DeckBrowserView) === */}
      <div style={{
        flexShrink: 0, paddingTop: 64,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 10, marginBottom: 16, width: '100%', maxWidth: MAX_W,
        position: 'relative', padding: '64px 20px 0',
        zIndex: 10,
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
        flexShrink: 0, width: '100%', maxWidth: MAX_W,
        padding: '0 20px', marginBottom: 16, zIndex: 10,
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
            placeholder="Fachbegriff suchen oder Frage stellen..."
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--ds-text-primary)', fontSize: 15,
              fontFamily: 'var(--ds-font-sans)',
            }}
          />
          <span style={{ color: 'var(--ds-text-placeholder)', fontSize: 12, fontWeight: 500 }}>⌘K</span>
        </div>
      </div>

      {/* === 3D GRAPH CANVAS (fills remaining space) === */}
      <div style={{
        flex: 1, width: '100%', position: 'relative', overflow: 'hidden',
      }}>
        <div
          ref={containerRef}
          style={{ width: '100%', height: '100%' }}
        />

        {/* Loading state */}
        {loading && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 12, color: 'var(--ds-text-secondary)', fontSize: 14, pointerEvents: 'none',
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
        {!loading && !hasGraph && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 8, color: 'var(--ds-text-tertiary)', fontSize: 14, pointerEvents: 'none',
          }}>
            <span style={{ fontSize: 32, opacity: 0.3 }}>◎</span>
            <span>Noch keine Begriffe extrahiert</span>
            <span style={{ fontSize: 12 }}>Starte ein Embedding, um den Graphen aufzubauen</span>
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
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
