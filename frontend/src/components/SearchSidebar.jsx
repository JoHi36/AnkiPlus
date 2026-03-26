import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ChatInput from './ChatInput';

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
}) {
  // Track if slide-in animation has played — don't replay on tab switch
  const hasAnimatedRef = useRef(false);
  useEffect(() => {
    if (visible) hasAnimatedRef.current = true;
  }, [visible]);

  if (!visible) return null;

  const shouldAnimate = !hasAnimatedRef.current;

  const [multiSelect, setMultiSelect] = useState(false);
  const [multiIds, setMultiIds] = useState(new Set());

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

  const stackCardCount = multiCards?.length || selectedCluster?.cards?.length || totalCards || 0;
  const stackLabel = multiCards
    ? `${multiIds.size} Perspektiven`
    : selectedLabel || query;

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
  const renderMarkdownWithRefs = (text) => {
    if (!text) return null;

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
          if (match && cardRefs?.[match[1]]) {
            const ref = cardRefs[match[1]];
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

  // Animation state for cluster drill-down
  const [animating, setAnimating] = useState(false);

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
      background: 'var(--ds-bg-deep)',
      borderLeft: '1px solid var(--ds-border-subtle)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      animation: isExiting
        ? 'slideOutRight 0.3s ease-in forwards'
        : shouldAnimate ? 'slideInRight 0.3s ease-out' : 'none',
    }}>
      {/* Scrollable content */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px 20px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        scrollbarWidth: 'none',
      }}>
        {/* Query title */}
        <div style={{
          fontSize: 20, fontWeight: 700,
          color: 'var(--ds-text-primary)',
          letterSpacing: '-0.3px',
        }}>
          {query}
        </div>

        {/* Answer / Definition — rendered as Markdown */}
        {answerText ? (
          <div style={{
            fontSize: 14,
            color: 'var(--ds-text-secondary)',
            lineHeight: 1.65,
          }}>
            {renderMarkdownWithRefs(answerText)}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1, 0.7, 0.85].map((w, i) => (
              <div key={i} style={{
                height: 14, borderRadius: 4,
                background: 'var(--ds-hover-tint)',
                width: `${w * 100}%`,
                animation: 'pulse 1.5s ease-in-out infinite',
              }} />
            ))}
          </div>
        )}

        {/* Cluster skeleton — shown while searching, before clusters arrive */}
        {!clusters && isSearching && (
          <div style={{
            borderTop: '1px solid var(--ds-border-subtle)',
            paddingTop: 12,
          }}>
            <div style={{
              fontSize: 10, fontWeight: 600,
              color: 'var(--ds-text-tertiary)',
              letterSpacing: '0.5px',
              marginBottom: 10,
            }}>
              PERSPEKTIVEN
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[0.7, 0.85, 0.6, 0.75, 0.5].map((w, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: 'var(--ds-hover-tint)',
                    animation: 'pulse 1.5s ease-in-out infinite',
                    animationDelay: `${i * 0.15}s`,
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{
                      height: 13, borderRadius: 4,
                      background: 'var(--ds-hover-tint)',
                      width: `${w * 100}%`,
                      animation: 'pulse 1.5s ease-in-out infinite',
                      animationDelay: `${i * 0.15}s`,
                    }} />
                    <div style={{
                      height: 10, borderRadius: 3,
                      background: 'var(--ds-hover-tint)',
                      width: '40%', marginTop: 4,
                      animation: 'pulse 1.5s ease-in-out infinite',
                      animationDelay: `${i * 0.15 + 0.05}s`,
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ Cluster list OR selected cluster detail ═══ */}
        {clusters && clusters.length > 1 && (
          <div style={{
            borderTop: '1px solid var(--ds-border-subtle)',
            paddingTop: 12,
          }}>
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

                  {/* Numbered card list */}
                  {selectedCluster.cards?.length > 0 && (
                    <div style={{ marginTop: 12, borderTop: '1px solid var(--ds-border-subtle)', paddingTop: 10 }}>
                      <div style={{
                        fontSize: 10, fontWeight: 600,
                        color: 'var(--ds-text-tertiary)',
                        letterSpacing: '0.5px',
                        marginBottom: 6,
                      }}>
                        KARTEN
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {selectedCluster.cards.map((card, ci) => {
                          // Find this card's reference number from cardRefs
                          let refNum = null;
                          if (cardRefs) {
                            for (const [num, ref] of Object.entries(cardRefs)) {
                              if (String(ref.id) === String(card.id)) { refNum = num; break; }
                            }
                          }
                          return (
                            <div
                              key={card.id}
                              onClick={() => bridge?.openPreview?.(String(card.id))}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '5px 8px', borderRadius: 6,
                                cursor: 'pointer',
                                transition: 'background 0.15s',
                                fontSize: 12,
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'var(--ds-hover-tint)'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                            >
                              {/* Reference number badge */}
                              {refNum && (
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  width: 20, height: 20, borderRadius: 4,
                                  background: 'var(--ds-accent-10)',
                                  color: 'var(--ds-accent)',
                                  fontSize: 9, fontWeight: 700,
                                  flexShrink: 0,
                                }}>
                                  {refNum}
                                </span>
                              )}
                              <span style={{
                                color: 'var(--ds-text-secondary)',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                flex: 1,
                              }}>
                                {card.question || `Karte ${card.id}`}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
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
          </div>
        )}
      </div>

      {/* Bottom dock — ChatInput like reviewer */}
      <div style={{
        flexShrink: 0,
        padding: '0 12px 14px',
      }}>
        <ChatInput
          onSend={(text) => { if (text.trim() && onSearch) onSearch(text); }}
          isLoading={isSearching}
          placeholder="Neue Suche..."
          hideInput={true}
          topSlot={
            <div style={{
              padding: '10px 16px', textAlign: 'center',
              borderBottom: '1px solid var(--ds-border-subtle)',
            }}>
              <div style={{
                fontSize: 14, fontWeight: 600,
                color: 'var(--ds-text-primary)',
              }}>
                {stackLabel}
              </div>
              <div style={{
                fontSize: 12, color: 'var(--ds-text-secondary)', marginTop: 3,
              }}>
                {stackCardCount} Karten
              </div>
            </div>
          }
          actionPrimary={{
            label: `${stackCardCount} Karten kreuzen`,
            onClick: onStartStack,
          }}
          actionSecondary={{
            label: '',
            shortcut: 'Esc',
            onClick: () => {
              if (multiSelect) { setMultiSelect(false); setMultiIds(new Set()); }
              else if (selectedClusterId) handleDrillUp();
            },
          }}
        />
      </div>
    </div>
  );
}
