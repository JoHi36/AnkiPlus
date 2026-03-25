import React, { useState, useEffect } from 'react';

/* ── EmbeddingsWidget ─────────────────────────────────────────────────────── */
function EmbeddingsWidget({ bridge }) {
  const [embedding, setEmbedding] = useState({ embeddedCards: 0, totalCards: 0, isRunning: false });

  useEffect(() => {
    const onStatus = (e) => {
      const data = e.detail?.data || e.detail;
      if (data) setEmbedding(data);
    };

    window.addEventListener('ankiEmbeddingStatusLoaded', onStatus);
    window.ankiBridge?.addMessage('getEmbeddingStatus', null);

    const timer = setInterval(() => {
      window.ankiBridge?.addMessage('getEmbeddingStatus', null);
    }, 3000);

    return () => {
      window.removeEventListener('ankiEmbeddingStatusLoaded', onStatus);
      clearInterval(timer);
    };
  }, []);

  const pct = embedding.totalCards > 0
    ? Math.round((embedding.embeddedCards / embedding.totalCards) * 100)
    : 0;
  const done = pct >= 100 && !embedding.isRunning;

  return (
    <div style={{ padding: '8px 12px 6px' }}>
      {/* Row: label + badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
        <span style={{
          fontSize: 11, fontWeight: 500,
          color: 'var(--ds-text-secondary)',
          flex: 1,
        }}>
          Embeddings
        </span>
        {/* Count */}
        <span style={{
          fontSize: 10, color: 'var(--ds-text-muted)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {embedding.embeddedCards}/{embedding.totalCards}
        </span>
        {/* Status badge */}
        <span style={{
          fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
          background: done ? 'var(--ds-green-10)' : 'var(--ds-accent-10)',
          color: done ? 'var(--ds-green)' : 'var(--ds-accent)',
        }}>
          {done ? 'Fertig' : 'L\u00E4uft...'}
        </span>
      </div>

      {/* Progress bar: 2px height */}
      <div style={{
        height: 2, borderRadius: 1,
        background: 'var(--ds-bg-overlay)',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%', borderRadius: 1,
          transition: 'width 0.6s ease',
          background: done ? '#22c55e' : 'var(--ds-accent)',
        }} />
      </div>
    </div>
  );
}

/* ── BudgetWidget ─────────────────────────────────────────────────────────── */
function BudgetWidget({ bridge, color }) {
  return (
    <div style={{ padding: '8px 12px 6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          fontSize: 11, fontWeight: 500,
          color: 'var(--ds-text-secondary)',
          flex: 1,
        }}>
          Budget
        </span>
        <span style={{
          fontSize: 11,
          color: color ? `${color}99` : 'var(--ds-text-muted)',
        }}>
          Sparsam
        </span>
      </div>
    </div>
  );
}

/* ── AgentWidgetSlot ──────────────────────────────────────────────────────── */
export default function AgentWidgetSlot({ widgetType, bridge, agentColor }) {
  if (!widgetType) return null;

  switch (widgetType) {
    case 'embeddings':
      return <EmbeddingsWidget bridge={bridge} />;
    case 'budget':
      return <BudgetWidget bridge={bridge} color={agentColor} />;
    default:
      return null;
  }
}
