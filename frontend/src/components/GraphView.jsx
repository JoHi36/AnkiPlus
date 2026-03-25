import React, { useRef, useEffect, useCallback, useState } from 'react';
import ForceGraph3D from '3d-force-graph';
import { Search } from 'lucide-react';
import useKnowledgeGraph from '../hooks/useKnowledgeGraph';

const QUESTION_WORDS = /\b(was|wie|warum|erkläre|welche|wozu|wann|what|how|why|explain|which|when|describe)\b/i;

function isQuestion(query) {
  return QUESTION_WORDS.test(query) || query.trim().endsWith('?');
}

export default function GraphView({ onToggleView }) {
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
      .backgroundColor('#0a0a0c')
      .nodeColor(node => node.deckColor || '#0A84FF')
      .nodeVal(node => Math.max(1, (node.frequency || 1) / 2))
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
      .d3VelocityDecay(0.4);

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

  // Keep the click handler current after re-renders without rebuilding the graph
  useEffect(() => {
    if (!graphRef.current) return;
    graphRef.current.onNodeClick(handleNodeClick);
  }, [handleNodeClick]);

  // Search highlighting — dim non-matching nodes
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

  // Debounced search input handler
  const handleSearchChange = useCallback((e) => {
    const query = e.target.value;
    setSearchQuery(query);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (query.trim()) {
        searchGraph(query.trim());
      } else {
        // Clear highlighting when search is empty
        if (graphRef.current) {
          graphRef.current.nodeColor(node => node.deckColor || '#0A84FF');
        }
      }
    }, 300);
  }, [searchGraph]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--ds-bg-deep)',
        overflow: 'hidden',
      }}
    >
      {/* 3D graph container — fills entire space */}
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%' }}
      />

      {/* Loading state */}
      {loading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            color: 'var(--ds-text-secondary)',
            fontSize: 14,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              border: '2px solid var(--ds-border-subtle)',
              borderTopColor: 'var(--ds-accent)',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <span>Wissensgraph wird geladen…</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && !graphData?.nodes?.length && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            color: 'var(--ds-text-tertiary)',
            fontSize: 14,
            pointerEvents: 'none',
          }}
        >
          <span style={{ fontSize: 32, opacity: 0.3 }}>◎</span>
          <span>Noch keine Begriffe extrahiert</span>
          <span style={{ fontSize: 12 }}>Lerne mehr Karten, um den Graphen zu füllen</span>
        </div>
      )}

      {/* Top overlay: search bar + deck list toggle */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          zIndex: 10,
          width: '100%',
          maxWidth: 480,
          padding: '0 16px',
        }}
      >
        {/* Search input */}
        <div
          className="ds-frosted"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            borderRadius: 12,
            border: '1px solid var(--ds-border-subtle)',
          }}
        >
          <Search
            size={14}
            style={{ color: 'var(--ds-text-tertiary)', flexShrink: 0 }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Begriff suchen oder Frage stellen…"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--ds-text-primary)',
              fontSize: 13,
              fontFamily: 'var(--ds-font-sans)',
            }}
          />
        </div>

        {/* Deck list toggle button */}
        {onToggleView && (
          <button
            onClick={onToggleView}
            style={{
              background: 'var(--ds-hover-tint)',
              border: '1px solid var(--ds-border)',
              borderRadius: 8,
              padding: '6px 14px',
              color: 'var(--ds-text-secondary)',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
              flexShrink: 0,
              whiteSpace: 'nowrap',
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

      {/* Selected term badge — bottom center hint */}
      {selectedTerm && (
        <div
          style={{
            position: 'absolute',
            bottom: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '4px 12px',
            borderRadius: 20,
            background: 'var(--ds-accent-10)',
            border: '1px solid var(--ds-accent-20)',
            color: 'var(--ds-accent)',
            fontSize: 12,
            fontWeight: 500,
            pointerEvents: 'none',
            zIndex: 10,
            whiteSpace: 'nowrap',
          }}
        >
          {selectedTerm}
        </div>
      )}

      {/* Spin keyframe — injected once */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
