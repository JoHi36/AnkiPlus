import React from 'react';
import CardRefChip from './CardRefChip';

export default function SearchSidebar({
  query,
  answerText,
  clusters,
  clusterLabels,
  clusterSummaries,
  selectedClusterId,
  onSelectCluster,
  visible,
  bridge,
}) {
  if (!visible) return null;

  const clusterColors = [
    '#3B6EA5', '#4A8C5C', '#B07D3A', '#7B5EA7',
    '#A0524B', '#4A9BAE', '#A69550', '#7A6B5D',
  ];

  const selectedIdx = selectedClusterId
    ? parseInt(selectedClusterId.replace('cluster_', ''), 10)
    : null;

  const displayAnswer = selectedClusterId && clusterSummaries?.[selectedClusterId]
    ? clusterSummaries[selectedClusterId]
    : answerText;

  const selectedCards = selectedIdx !== null && clusters?.[selectedIdx]
    ? clusters[selectedIdx].cards
    : null;

  return (
    <div style={{
      width: 320,
      flexShrink: 0,
      background: 'var(--ds-bg-deep)',
      borderLeft: '1px solid var(--ds-border-subtle)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      animation: 'slideInRight 0.3s ease-out',
    }}>
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
        {/* Header */}
        <div>
          <div style={{
            fontSize: 18, fontWeight: 700,
            color: 'var(--ds-text-primary)',
            letterSpacing: '-0.3px',
          }}>
            {query}
          </div>
        </div>

        {/* Answer / Cluster Summary */}
        {displayAnswer && (
          <div style={{
            fontSize: 13,
            color: 'var(--ds-text-secondary)',
            lineHeight: 1.6,
          }}>
            {displayAnswer}
          </div>
        )}

        {/* Loading state */}
        {!answerText && (
          <div style={{
            fontSize: 12,
            color: 'var(--ds-text-tertiary)',
            fontStyle: 'italic',
          }}>
            Zusammenfassung wird geladen...
          </div>
        )}

        {/* Cluster list */}
        {clusters && clusters.length > 1 && (
          <>
            <div style={{
              borderTop: '1px solid var(--ds-border-subtle)',
              paddingTop: 12,
            }}>
              <div style={{
                fontSize: 10, fontWeight: 600,
                color: 'var(--ds-text-tertiary)',
                letterSpacing: '0.5px',
                marginBottom: 8,
              }}>
                PERSPEKTIVEN
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {clusters.map((cluster, i) => {
                  const cId = `cluster_${i}`;
                  const isSelected = selectedClusterId === cId;
                  const color = clusterColors[i % clusterColors.length];
                  const label = clusterLabels?.[cId] || cluster.label;

                  return (
                    <button
                      key={cId}
                      onClick={() => onSelectCluster(isSelected ? null : cId)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 10px', borderRadius: 8,
                        border: 'none', cursor: 'pointer',
                        fontFamily: 'inherit', textAlign: 'left',
                        background: isSelected
                          ? `color-mix(in srgb, ${color} 15%, transparent)`
                          : 'transparent',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => {
                        if (!isSelected) e.currentTarget.style.background = 'var(--ds-hover-tint)';
                      }}
                      onMouseLeave={e => {
                        if (!isSelected) e.currentTarget.style.background = isSelected
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
                          color: isSelected ? 'var(--ds-text-primary)' : 'var(--ds-text-secondary)',
                        }}>
                          {label}
                        </div>
                        <div style={{
                          fontSize: 11,
                          color: 'var(--ds-text-tertiary)',
                        }}>
                          {cluster.cards.length} Karten
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* CardRefChips for selected cluster */}
            {selectedCards && (
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 4,
                paddingTop: 8,
                borderTop: '1px solid var(--ds-border-subtle)',
              }}>
                <div style={{
                  fontSize: 10, fontWeight: 600,
                  color: 'var(--ds-text-tertiary)',
                  letterSpacing: '0.5px',
                  marginBottom: 4,
                }}>
                  KARTEN
                </div>
                {selectedCards.slice(0, 10).map(card => (
                  <CardRefChip
                    key={card.id}
                    cardId={card.id}
                    cardFront={card.question}
                    bridge={bridge}
                  />
                ))}
                {selectedCards.length > 10 && (
                  <div style={{
                    fontSize: 11, color: 'var(--ds-text-tertiary)',
                    padding: '4px 0',
                  }}>
                    +{selectedCards.length - 10} weitere
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
