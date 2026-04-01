import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import ChatInput from './ChatInput';
import ResizeHandle from './ResizeHandle';
import { parseCitations } from '../utils/parseCitations';
import CitationRef from '@shared/components/CitationRef';
import CitationPreview from './CitationPreview';
import ThinkingIndicator from './ThinkingIndicator';
import { useThinkingPhases } from '../hooks/useThinkingPhases';

// Also keep SafeMarkdownRenderer export removal clean
// (was imported but no longer needed for Definition tab)

const SKELETON_STYLE = { borderRadius: 4, background: 'var(--ds-hover-tint)' };

/**
 * ResearchMarkdown — Markdown renderer with [N] citation badge support.
 * Uses the same styling as Tutor (remarkGfm, remarkMath, rehypeKatex)
 * but handles [1], [2, 3] references via parseCitations + CitationRef.
 */
function ResearchMarkdown({ content, cardRefs, bridge }) {
  const citationsArray = useMemo(() => {
    if (!cardRefs) return [];
    return Object.entries(cardRefs).map(([key, ref]) => ({
      type: 'card',
      index: parseInt(key, 10),
      cardId: parseInt(ref.id || ref.noteId || key, 10),
      noteId: parseInt(ref.noteId || ref.id || key, 10),
      deckName: ref.deckName || '',
      front: ref.question || '',
    }));
  }, [cardRefs]);

  const [previewCardId, setPreviewCardId] = useState(null);

  const renderTextWithCitations = (text) => {
    const segments = parseCitations(text, citationsArray);
    return segments.map((seg, i) => {
      if (seg.type === 'text') return seg.content;
      const { citation, index } = seg;
      return (
        <CitationRef
          key={`cite-${index}-${i}`}
          index={index}
          variant="card"
          title={citation.front || ''}
          onClick={() => setPreviewCardId(citation.cardId)}
        />
      );
    });
  };

  const renderWithCites = (children) => {
    const result = [];
    React.Children.forEach(children, child => {
      if (typeof child !== 'string') { result.push(child); return; }
      result.push(...renderTextWithCitations(child));
    });
    return result.length === 1 ? result[0] : <>{result}</>;
  };

  return (
    <>
      <div className="markdown-content">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{
            p: ({ children }) => <p className="mb-4 text-[15px] leading-[1.8]" style={{ color: 'var(--ds-text-secondary)' }}>{renderWithCites(children)}</p>,
            strong: ({ children }) => (
              <span className="font-semibold px-1 rounded-sm" style={{ color: 'var(--ds-text-primary)', background: 'color-mix(in srgb, var(--ds-accent) 15%, transparent)' }}>{children}</span>
            ),
            em: ({ children }) => <em style={{ color: 'var(--ds-text-secondary)' }}>{children}</em>,
            ul: (props) => <ul className="mb-5 ml-5 list-disc space-y-2" style={{ color: 'var(--ds-text-secondary)' }} {...props} />,
            ol: (props) => <ol className="mb-5 ml-5 list-decimal space-y-2" style={{ color: 'var(--ds-text-secondary)' }} {...props} />,
            li: ({ children }) => <li className="pl-1 leading-[1.8]">{renderWithCites(children)}</li>,
            h1: ({ children }) => <h1 className="text-xl font-bold mt-6 mb-3" style={{ color: 'var(--ds-text-primary)' }}>{children}</h1>,
            h2: ({ children }) => <h2 className="text-lg font-bold mt-5 mb-3" style={{ color: 'var(--ds-text-primary)' }}>{children}</h2>,
            h3: ({ children }) => <h3 className="text-base font-semibold mt-4 mb-2" style={{ color: 'var(--ds-text-primary)' }}>{children}</h3>,
            table: (props) => (
              <div className="my-4 overflow-hidden rounded-xl border" style={{ borderColor: 'var(--ds-border-subtle)' }}>
                <table className="min-w-full" {...props} />
              </div>
            ),
            thead: (props) => <thead style={{ background: 'var(--ds-hover-tint)' }} {...props} />,
            th: (props) => <th className="px-4 py-2 text-left text-xs font-semibold uppercase" style={{ color: 'var(--ds-text-secondary)', borderBottom: '1px solid var(--ds-border-subtle)' }} {...props} />,
            td: (props) => <td className="px-4 py-2 text-sm" style={{ color: 'var(--ds-text-primary)', borderBottom: '1px solid var(--ds-border-subtle)' }} {...props} />,
            hr: () => <hr className="my-5 border-0 h-px" style={{ background: 'linear-gradient(to right, transparent, var(--ds-border-medium), transparent)' }} />,
            blockquote: ({ children }) => (
              <blockquote className="border-l-2 pl-4 py-2 my-4" style={{ borderColor: 'color-mix(in srgb, var(--ds-accent) 40%, transparent)', color: 'var(--ds-text-primary)' }}>
                {children}
              </blockquote>
            ),
          }}
        >
          {content || ''}
        </ReactMarkdown>
      </div>
      {previewCardId != null && (
        <CitationPreview
          cardId={previewCardId}
          bridge={bridge}
          onClose={() => setPreviewCardId(null)}
        />
      )}
    </>
  );
}

function SkeletonBlock({ lines = [0.8, 0.6, 0.9], dotted = false }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: dotted ? 10 : 8 }}>
      {lines.map((w, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: dotted ? 10 : 0 }}>
          {dotted && (
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              ...SKELETON_STYLE,
              animation: 'pulse 1.5s ease-in-out infinite',
              animationDelay: `${i * 0.12}s`,
            }} />
          )}
          <div style={{
            height: 13,
            width: `${w * 100}%`,
            ...SKELETON_STYLE,
            animation: 'pulse 1.5s ease-in-out infinite',
            animationDelay: `${i * 0.12}s`,
          }} />
        </div>
      ))}
    </div>
  );
}

function SearchThinking({ streamId }) {
  const phases = useThinkingPhases(streamId, 'research');
  if (!phases) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <ThinkingIndicator phases={phases} />
    </div>
  );
}

export default function SearchSidebar({
  query,
  answerText,
  clusters,
  clusterLabels,
  clusterSummaries,
  selectedClusterId,
  onSelectCluster,
  visible,
  isExiting = false,
  onStartStack,
  onSearch,
  isSearching,
  totalCards,
  cardRefs,
  bridge,
  subClusters,
  isSubClustering,
  sidebarHasAnimated,
  kgSubgraph,
  onGraphModeChange,
  selectedTerm,
  onSelectTerm,
  termDefinition,
  imageSelectedCardIds = [],  // NEW — from ImageCanvas selection
  searchStreamId,              // NEW — for ThinkingIndicator
}) {

  // All hooks must be called unconditionally (before any early return)
  const [multiSelect, setMultiSelect] = useState(false);
  const [multiIds, setMultiIds] = useState(new Set());
  const [sidebarTab, setSidebarTab] = useState('definition'); // 'definition' | 'clusters' | 'terms'
  const [animating, setAnimating] = useState(false);
  const TAB_TO_GRAPH_MODE = { definition: 'images', clusters: 'clusters', terms: 'knowledge' };
  const handleTabChange = (tab) => {
    setSidebarTab(tab);
    onGraphModeChange?.(TAB_TO_GRAPH_MODE[tab] || 'clusters');
  };

  // Emit graphMode when sidebar becomes visible or tab changes
  useEffect(() => {
    if (visible) {
      onGraphModeChange?.(TAB_TO_GRAPH_MODE[sidebarTab] || 'clusters');
    }
  }, [visible, sidebarTab, onGraphModeChange]);

  if (!visible) return null;

  // Animation only on first appearance — ref lives in useSmartSearch (survives tab switches)
  const shouldAnimate = sidebarHasAnimated ? !sidebarHasAnimated.current : false;
  if (sidebarHasAnimated) sidebarHasAnimated.current = true;

  const clusterColors = [
    '#3B6EA5', '#4A8C5C', '#B07D3A', '#7B5EA7',
    '#A0524B', '#4A9BAE', '#A69550', '#7A6B5D',
  ];

  // Parse selectedClusterId(s) — supports single or multi
  const selectedIdx = selectedClusterId
    ? parseInt(selectedClusterId.replace('cluster_', ''), 10)
    : null;

  const selectedCluster = selectedIdx !== null && clusters?.[selectedIdx]
    ? clusters[selectedIdx]
    : null;

  const selectedLabel = selectedClusterId && clusterLabels?.[selectedClusterId]
    || selectedCluster?.label || null;

  const selectedSummary = selectedClusterId && clusterSummaries?.[selectedClusterId] || null;

  // Multi-select: compute combined cards
  const multiCards = multiSelect && multiIds.size > 0
    ? clusters?.filter((_, i) => multiIds.has(`cluster_${i}`)).flatMap(c => c.cards) || []
    : null;

  const termCardCount = selectedTerm?.cardIds?.length || selectedTerm?.subsetCount || 0;
  const imageCardCount = imageSelectedCardIds?.length || 0;
  const stackCardCount = sidebarTab === 'definition' && imageCardCount > 0
    ? imageCardCount
    : selectedTerm ? termCardCount : (multiCards?.length || selectedCluster?.cards?.length || totalCards || 0);

  const stackLabel = sidebarTab === 'definition' && imageCardCount > 0
    ? query  // Use search query as title — count is shown separately by dock
    : selectedTerm ? selectedTerm.label : (multiCards
      ? `${multiIds.size} Perspektiven`
      : selectedLabel || query);

  // Compute learning progress from card review data
  const stackCards = selectedTerm ? null
    : multiCards || selectedCluster?.cards || (clusters?.flatMap(c => c.cards) || []);
  const learnStats = useMemo(() => {
    const cards = stackCards || [];
    if (!cards.length) return null;
    const total = cards.length;
    const learned = cards.filter(c => c.cardType === 2).length; // type 2 = review/mature
    const due = cards.filter(c => c.isDue).length;
    const pct = total > 0 ? Math.round((learned / total) * 100) : 0;
    return { total, learned, due, pct };
  }, [stackCards]);

  // Handle cluster click — single or multi mode
  const handleClusterClick = (cId, e) => {
    if (e?.metaKey || e?.ctrlKey || multiSelect) {
      // Multi-select mode
      setMultiSelect(true);
      setMultiIds(prev => {
        const next = new Set(prev);
        if (next.has(cId)) next.delete(cId);
        else next.add(cId);
        if (next.size === 0) setMultiSelect(false);
        return next;
      });
      onSelectCluster(null); // clear single selection
    } else {
      // Single drill-down
      setMultiSelect(false);
      setMultiIds(new Set());
      onSelectCluster(cId);
    }
  };

  // Render markdown text with inline [1], [2] card references as clickable badges
  const renderMarkdownWithRefs = (text, refsOverride) => {
    if (!text) return null;
    const refs = refsOverride || cardRefs;

    // Pre-process: convert [1, 2, 44] → [1] [2] [44] and [1,4,5] → [1] [4] [5]
    let processed = text.replace(/\[(\d+(?:\s*,\s*\d+)+)\]/g, (match, inner) => {
      return inner.split(',').map(n => `[${n.trim()}]`).join(' ');
    });

    // Split by [N] references, render markdown for text parts and badges for refs
    const parts = processed.split(/(\[\d+\])/g);
    return (
      <span>
        {parts.map((part, i) => {
          const match = part.match(/^\[(\d+)\]$/);
          if (match && refs?.[match[1]]) {
            const ref = refs[match[1]];
            return (
              <span
                key={i}
                onClick={() => bridge?.openPreview?.(String(ref.id))}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 18, height: 18, borderRadius: 4,
                  background: 'var(--ds-accent-10)',
                  color: 'var(--ds-accent)',
                  fontSize: 10, fontWeight: 700,
                  cursor: 'pointer',
                  verticalAlign: 'super',
                  marginLeft: 1, marginRight: 1,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--ds-accent-20)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--ds-accent-10)'; }}
                title={ref.question}
              >
                {match[1]}
              </span>
            );
          }
          // Render non-reference parts as markdown inline
          return (
            <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={{
              p: ({ children }) => <>{children}</>,
              strong: ({ children }) => <strong style={{ color: 'var(--ds-text-primary)', fontWeight: 600 }}>{children}</strong>,
            }}>
              {part}
            </ReactMarkdown>
          );
        })}
      </span>
    );
  };

  const handleDrillDown = (cId, e) => {
    if (e?.metaKey || e?.ctrlKey || multiSelect) {
      handleClusterClick(cId, e);
      return;
    }
    setAnimating(true);
    onSelectCluster(cId);
    setTimeout(() => setAnimating(false), 300);
  };

  const handleDrillUp = () => {
    setAnimating(true);
    onSelectCluster(null);
    setTimeout(() => setAnimating(false), 300);
  };

  return (
    <div style={{
      width: 'var(--ds-sidebar-width, 380px)',
      minWidth: 'var(--ds-sidebar-width, 380px)',
      flexShrink: 0,
      background: 'var(--ds-bg-canvas)',
      border: '1px solid var(--ds-border-subtle)',
      borderRadius: 14,
      boxShadow: 'none',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      margin: '10px 10px 10px 0',
      animation: isExiting
        ? 'slideOutRight 0.3s ease-in forwards'
        : shouldAnimate ? 'slideInRight 0.3s ease-out' : 'none',
    }}>
      {/* Resize handle — same as session sidebar */}
      <ResizeHandle />

      {/* Agent header — icon + name */}
      <div style={{
        flexShrink: 0,
        padding: '14px 20px 0',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <div style={{
          width: 22, height: 22,
          borderRadius: 6,
          background: 'color-mix(in srgb, #00D084 12%, transparent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#00D084" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
            <circle cx="11" cy="11" r="8"/>
            <path d="M11 3a15 15 0 0 1 4 8 15 15 0 0 1-4 8"/>
            <path d="M11 3a15 15 0 0 0-4 8 15 15 0 0 0 4 8"/>
            <path d="M3 11h16"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65" strokeWidth="2"/>
          </svg>
        </div>
        <span style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--ds-text-primary)',
          letterSpacing: '-0.01em',
        }}>
          Research
        </span>
      </div>

      {/* Tab bar — always visible */}
      <div style={{
        flexShrink: 0,
        padding: '10px 20px 0',
      }}>
        <div style={{
          display: 'flex', gap: 0,
          background: 'var(--ds-hover-tint)',
          borderRadius: 6,
          overflow: 'hidden',
        }}>
          {[
            { key: 'definition', label: 'Definition' },
            { key: 'clusters', label: 'Perspektiven' },
            { key: 'terms', label: 'Begriffe' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              style={{
                flex: 1,
                padding: '6px 12px',
                fontSize: 11, fontWeight: 500,
                fontFamily: 'inherit',
                border: 'none', cursor: 'pointer',
                color: sidebarTab === tab.key ? 'var(--ds-text-primary)' : 'var(--ds-text-tertiary)',
                background: sidebarTab === tab.key ? 'var(--ds-active-tint)' : 'transparent',
                transition: 'color 0.15s, background 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable content — only tab content scrolls */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '12px 20px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        scrollbarWidth: 'none',
      }}>

        {/* ═══ Tab Content ═══ */}
        <div>
            {/* ThinkingIndicator for Research channel */}
            {isSearching && searchStreamId && (
              <SearchThinking streamId={searchStreamId} />
            )}

            {/* ── Definition tab: skeleton while loading ── */}
            {sidebarTab === 'definition' && !answerText && isSearching && (
              <SkeletonBlock lines={[0.95, 0.8, 0.6, 0.9, 0.5]} />
            )}
            {/* ── Definition tab: content ── */}
            {sidebarTab === 'definition' && answerText && (
              <ResearchMarkdown content={answerText} cardRefs={cardRefs} bridge={bridge} />
            )}
            {/* ── Clusters tab: skeleton while loading ── */}
            {sidebarTab === 'clusters' && !clusters && isSearching && (
              <SkeletonBlock lines={[0.7, 0.85, 0.6, 0.75, 0.5]} dotted />
            )}
            {/* ── Clusters tab ── */}
            {sidebarTab === 'clusters' && clusters?.length > 1 && (
            <div style={{
              transition: 'opacity 0.25s ease, transform 0.25s ease',
              opacity: animating ? 0.3 : 1,
              transform: animating ? 'translateY(4px)' : 'translateY(0)',
            }}>
              {selectedCluster && !multiSelect ? (
                /* ── Selected cluster: drill-down view ── */
                <>
                  <button
                    onClick={handleDrillUp}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontFamily: 'inherit', padding: '0 0 10px',
                      color: 'var(--ds-text-tertiary)', fontSize: 12,
                    }}
                  >
                    ← Alle Perspektiven
                  </button>

                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    marginBottom: 10,
                  }}>
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: clusterColors[selectedIdx % clusterColors.length],
                      flexShrink: 0,
                    }} />
                    <span style={{
                      fontSize: 16, fontWeight: 600,
                      color: 'var(--ds-text-primary)',
                    }}>
                      {selectedLabel}
                    </span>
                    <span style={{
                      fontSize: 12, color: 'var(--ds-text-tertiary)',
                    }}>
                      {selectedCluster.cards.length} Karten
                    </span>
                  </div>

                  {/* Cluster summary — Markdown rendered */}
                  {selectedSummary ? (
                    <div style={{
                      fontSize: 13,
                      color: 'var(--ds-text-secondary)',
                      lineHeight: 1.6,
                    }}>
                      {renderMarkdownWithRefs(selectedSummary)}
                    </div>
                  ) : clusterSummaries ? null : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {[0.9, 0.6].map((w, i) => (
                        <div key={i} style={{
                          height: 12, borderRadius: 3,
                          background: 'var(--ds-hover-tint)',
                          width: `${w * 100}%`,
                          animation: 'pulse 1.5s ease-in-out infinite',
                        }} />
                      ))}
                    </div>
                  )}

                  {/* Card list removed — references in text are sufficient */}
                </>
              ) : (
                /* ── Cluster list view ── */
                <>
                  <div style={{
                    fontSize: 10, fontWeight: 600,
                    color: 'var(--ds-text-tertiary)',
                    letterSpacing: '0.5px',
                    marginBottom: 8,
                  }}>
                    PERSPEKTIVEN
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {clusters
                      .map((cluster, i) => ({
                        cluster,
                        i,
                        avgScore: cluster.cards.reduce((s, c) => s + (c.score || 0), 0) / Math.max(1, cluster.cards.length),
                      }))
                      .sort((a, b) => b.avgScore - a.avgScore)
                      .map(({ cluster, i, avgScore }) => {
                      const cId = `cluster_${i}`;
                      const color = clusterColors[i % clusterColors.length];
                      const label = clusterLabels?.[cId] || cluster.label;
                      const pct = Math.round(avgScore * 100);
                      const isMultiSelected = multiIds.has(cId);

                      return (
                        <button
                          key={cId}
                          onClick={(e) => handleDrillDown(cId, e)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '8px 10px', borderRadius: 8,
                            border: 'none', cursor: 'pointer',
                            fontFamily: 'inherit', textAlign: 'left',
                            background: isMultiSelected
                              ? `color-mix(in srgb, ${color} 15%, transparent)`
                              : 'transparent',
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={e => {
                            if (!isMultiSelected) e.currentTarget.style.background = 'var(--ds-hover-tint)';
                          }}
                          onMouseLeave={e => {
                            if (!isMultiSelected) e.currentTarget.style.background = isMultiSelected
                              ? `color-mix(in srgb, ${color} 15%, transparent)`
                              : 'transparent';
                          }}
                        >
                          <div style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: color, flexShrink: 0,
                          }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: 13, fontWeight: 500,
                              color: isMultiSelected ? 'var(--ds-text-primary)' : 'var(--ds-text-secondary)',
                              transition: 'opacity 0.3s',
                            }}>
                              {label}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--ds-text-tertiary)' }}>
                              {cluster.cards.length} Karten
                            </div>
                          </div>
                          <div style={{
                            fontSize: 11, fontWeight: 600,
                            color: 'var(--ds-accent)',
                            opacity: 0.7,
                            fontFamily: 'var(--ds-font-mono, monospace)',
                            flexShrink: 0,
                          }}>
                            {pct > 0 ? `.${String(pct).padStart(2, '0')}` : ''}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Multi-select hint */}
                  <div style={{
                    fontSize: 10, color: 'var(--ds-text-tertiary)',
                    textAlign: 'center', marginTop: 8, opacity: 0.5,
                  }}>
                    {multiSelect
                      ? `${multiIds.size} ausgewählt — klicke zum Hinzufügen/Entfernen`
                      : '⌘ gedrückt halten für Mehrfachauswahl'
                    }
                  </div>
                </>
              )}
            </div>
            )}

            {/* ── Terms tab: skeleton while loading ── */}
            {sidebarTab === 'terms' && !kgSubgraph?.nodes?.length && !selectedTerm && isSearching && (
              <SkeletonBlock lines={[0.5, 0.7, 0.4, 0.6, 0.55, 0.45]} dotted />
            )}
            {/* ── Terms tab (Knowledge Graph) ── */}
            {sidebarTab === 'terms' && selectedTerm ? (
              /* Term drill-down view — identical layout to cluster drill-down */
              <>
                <button
                  onClick={() => onSelectTerm?.(null)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontFamily: 'inherit', padding: '0 0 10px',
                    color: 'var(--ds-text-tertiary)', fontSize: 12,
                  }}
                >
                  ← Alle Begriffe
                </button>

                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  marginBottom: 10,
                }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: selectedTerm.color || 'var(--ds-accent)',
                    flexShrink: 0,
                  }} />
                  <span style={{
                    fontSize: 16, fontWeight: 600,
                    color: 'var(--ds-text-primary)',
                  }}>
                    {selectedTerm.label}
                  </span>
                  <span style={{
                    fontSize: 12, color: 'var(--ds-text-tertiary)',
                  }}>
                    {selectedTerm.cardIds?.length || selectedTerm.subsetCount || 0} Karten
                  </span>
                </div>

                {/* Definition — with card refs and source attribution */}
                {termDefinition?.definition ? (
                  <div style={{
                    fontSize: 13,
                    color: 'var(--ds-text-secondary)',
                    lineHeight: 1.6,
                  }}>
                    {renderMarkdownWithRefs(termDefinition.definition, termDefinition.cardRefs)}
                    {/* Source info */}
                    <div style={{
                      fontSize: 10, color: 'var(--ds-text-tertiary)',
                      marginTop: 8, fontStyle: 'italic',
                    }}>
                      Quelle: {termDefinition.generatedBy === 'llm' || termDefinition.generated_by === 'llm'
                        ? 'Tutor (aus deinen Karten)'
                        : termDefinition.generatedBy === 'research' || termDefinition.generated_by === 'research'
                        ? 'Research Agent'
                        : 'Karten-Analyse'}
                    </div>
                  </div>
                ) : termDefinition?.error ? (
                  <div style={{
                    fontSize: 12, color: 'var(--ds-text-tertiary)',
                    fontStyle: 'italic',
                  }}>
                    {termDefinition.error}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[0.9, 0.7, 0.5].map((w, i) => (
                      <div key={i} style={{
                        height: 12, borderRadius: 3,
                        background: 'var(--ds-hover-tint)',
                        width: `${w * 100}%`,
                        animation: 'pulse 1.5s ease-in-out infinite',
                      }} />
                    ))}
                    <div style={{
                      fontSize: 10, color: 'var(--ds-text-tertiary)',
                      marginTop: 4, fontStyle: 'italic',
                    }}>
                      Tutor generiert Erklärung aus deinen Karten...
                    </div>
                  </div>
                )}

                {/* Connected terms — navigate through the graph */}
                {termDefinition?.connectedTerms?.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{
                      fontSize: 10, color: 'var(--ds-text-muted)',
                      marginBottom: 6, fontWeight: 500,
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>
                      Verbundene Begriffe
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {termDefinition.connectedTerms.slice(0, 8).map(t => (
                        <button
                          key={t}
                          onClick={() => {
                            // Find the node in kgSubgraph and select it
                            const node = kgSubgraph?.nodes?.find(n => n.label === t || n.id === t);
                            if (node) onSelectTerm?.(node);
                            else onSelectTerm?.({ id: t, label: t });
                          }}
                          style={{
                            padding: '4px 10px',
                            fontSize: 11, fontWeight: 500,
                            fontFamily: 'inherit',
                            background: 'var(--ds-hover-tint)',
                            border: '1px solid var(--ds-border-subtle)',
                            borderRadius: 6,
                            color: 'var(--ds-text-secondary)',
                            cursor: 'pointer',
                            transition: 'background 0.15s, color 0.15s',
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = 'var(--ds-active-tint)';
                            e.currentTarget.style.color = 'var(--ds-text-primary)';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = 'var(--ds-hover-tint)';
                            e.currentTarget.style.color = 'var(--ds-text-secondary)';
                          }}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : sidebarTab === 'terms' && kgSubgraph?.nodes?.length > 0 ? (() => {
              // Group terms by deck, sort by subsetCount within each group
              const deckGroups = {};
              kgSubgraph.nodes.forEach(node => {
                const deck = node.deckName || 'Sonstige';
                if (!deckGroups[deck]) deckGroups[deck] = { color: node.color, terms: [] };
                deckGroups[deck].terms.push(node);
              });
              // Sort groups by total term count (most terms first)
              const sortedGroups = Object.entries(deckGroups)
                .sort((a, b) => b[1].terms.length - a[1].terms.length);
              // Sort terms within each group by subsetCount
              sortedGroups.forEach(([, group]) => {
                group.terms.sort((a, b) => b.subsetCount - a.subsetCount);
              });
              const maxCount = Math.max(...kgSubgraph.nodes.map(n => n.subsetCount), 1);

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {sortedGroups.map(([deckName, group]) => (
                    <div key={deckName}>
                      {/* Deck header */}
                      <div style={{
                        fontSize: 10, fontWeight: 600,
                        color: group.color,
                        letterSpacing: '0.5px',
                        marginBottom: 6,
                        textTransform: 'uppercase',
                      }}>
                        {deckName}
                      </div>

                      {/* Terms in this deck */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {group.terms.slice(0, 15).map(term => {
                          const pct = (term.subsetCount / maxCount) * 100;
                          // Darker blue for higher relevance
                          const alpha = 0.15 + (term.subsetCount / maxCount) * 0.45;
                          return (
                            <div
                              key={term.id}
                              onClick={() => onSelectTerm?.(term)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '4px 8px', borderRadius: 6,
                                cursor: 'pointer',
                                transition: 'background 0.15s',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'var(--ds-hover-tint)'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                            >
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                                  marginBottom: 2,
                                }}>
                                  <span style={{
                                    fontSize: 12, fontWeight: 500,
                                    color: 'var(--ds-text-secondary)',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  }}>
                                    {term.label}
                                  </span>
                                  <span style={{
                                    fontSize: 10, color: 'var(--ds-text-tertiary)',
                                    flexShrink: 0, marginLeft: 8,
                                  }}>
                                    {term.subsetCount}
                                  </span>
                                </div>
                                {/* Relevance bar */}
                                <div style={{
                                  height: 3, borderRadius: 1.5,
                                  background: 'var(--ds-hover-tint)',
                                  overflow: 'hidden',
                                }}>
                                  <div style={{
                                    height: '100%', borderRadius: 1.5,
                                    width: `${pct}%`,
                                    background: `color-mix(in srgb, ${group.color} ${Math.round(alpha * 100)}%, transparent)`,
                                    transition: 'width 0.3s ease',
                                  }} />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })() : null}

        </div>
      </div>

    </div>
  );
}
