import React from 'react';

function StreakModule({ current, best, is_record }) {
  return (
    <div style={{ textAlign: 'center', padding: '8px 0' }}>
      <div style={{
        fontSize: 11, fontWeight: 500, letterSpacing: 0.3,
        color: 'var(--ds-text-tertiary)', textTransform: 'uppercase', marginBottom: 6,
      }}>
        {is_record ? 'Streak — neuer Rekord!' : 'Streak'}
      </div>
      <div style={{
        fontSize: 48, fontWeight: 700,
        color: is_record ? 'var(--ds-accent)' : 'var(--ds-text-primary)',
        letterSpacing: -2, lineHeight: 1,
        textShadow: is_record ? '0 0 30px rgba(10,132,255,0.3)' : 'none',
      }}>
        {current}{is_record && <span style={{ fontSize: 20, marginLeft: 4 }}>🔥</span>}
      </div>
      <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ds-text-tertiary)', marginTop: 4 }}>
        Tage in Folge
      </div>
      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center', gap: 24 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: is_record ? 'var(--ds-accent)' : 'var(--ds-text-secondary)' }}>{current}</div>
          <div style={{ fontSize: 10, color: 'var(--ds-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 2 }}>Aktuell</div>
        </div>
        <div style={{ width: 1, background: 'var(--ds-border-subtle)' }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ds-text-secondary)' }}>{best}</div>
          <div style={{ fontSize: 10, color: 'var(--ds-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 2 }}>{is_record ? 'Vorheriger Rekord' : 'Rekord'}</div>
        </div>
      </div>
    </div>
  );
}

function HeatmapModule({ days, period }) {
  const levels = [
    'var(--ds-hover-tint)',
    'rgba(10,132,255,0.15)',
    'rgba(10,132,255,0.30)',
    'rgba(10,132,255,0.50)',
    'rgba(10,132,255,0.75)',
  ];
  return (
    <div>
      <div style={{
        fontSize: 11, fontWeight: 500, letterSpacing: 0.3,
        color: 'var(--ds-text-tertiary)', textTransform: 'uppercase', marginBottom: 12,
      }}>Aktivität — letzte {period} Tage</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(15, 1fr)', gap: 3 }}>
        {(days || []).map((level, i) => (
          <div key={i} style={{
            aspectRatio: '1', borderRadius: 3,
            background: levels[level] || levels[0],
            boxShadow: i === days.length - 1 ? '0 0 0 1.5px rgba(10,132,255,0.6)' : 'none',
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, justifyContent: 'flex-end' }}>
        <span style={{ fontSize: 10, color: 'var(--ds-text-tertiary)' }}>weniger</span>
        {levels.map((bg, i) => (
          <div key={i} style={{ width: 10, height: 10, borderRadius: 2, background: bg }} />
        ))}
        <span style={{ fontSize: 10, color: 'var(--ds-text-tertiary)' }}>mehr</span>
      </div>
    </div>
  );
}

function DeckOverviewModule({ name, total, new_count, learning_count, review_count }) {
  const statColors = {
    new: 'var(--ds-stat-new)',
    learning: 'var(--ds-stat-learning)',
    review: 'var(--ds-stat-review)',
    unseen: 'var(--ds-border-subtle)',
  };
  const unseen = Math.max(0, total - new_count - learning_count - review_count);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: 0.3, color: 'var(--ds-text-tertiary)', textTransform: 'uppercase' }}>{name}</div>
        <div style={{ fontSize: 12, color: 'var(--ds-text-tertiary)' }}>{total} Karten</div>
      </div>
      <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 12, gap: 2 }}>
        {new_count > 0 && <div style={{ flex: new_count, background: statColors.new }} />}
        {learning_count > 0 && <div style={{ flex: learning_count, background: statColors.learning }} />}
        {review_count > 0 && <div style={{ flex: review_count, background: statColors.review }} />}
        {unseen > 0 && <div style={{ flex: unseen, background: statColors.unseen }} />}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
        {[
          { label: 'Neu', count: new_count, color: statColors.new },
          { label: 'Lernen', count: learning_count, color: statColors.learning },
          { label: 'Reif', count: review_count, color: statColors.review },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ds-text-secondary)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} />
            <span>{item.label} <span style={{ fontWeight: 600, color: 'var(--ds-text-primary)' }}>{item.count}</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}

const MODULE_MAP = { streak: StreakModule, heatmap: HeatmapModule, deck_overview: DeckOverviewModule };

export default function StatsWidget({ modules }) {
  if (!modules || modules.length === 0) return null;
  const single = modules.length === 1;
  return (
    <div>
      {modules.map((mod, i) => {
        const Component = MODULE_MAP[mod.type];
        if (!Component) return null;
        const isFirst = i === 0;
        const isLast = i === modules.length - 1;
        return (
          <div key={i} style={{
            background: 'var(--ds-bg-overlay)',
            border: '1px solid var(--ds-border-subtle)',
            borderBottom: !isLast && !single ? 'none' : '1px solid var(--ds-border-subtle)',
            borderRadius: single ? 16 : isFirst ? '16px 16px 0 0' : isLast ? '0 0 16px 16px' : 0,
            padding: '18px 20px',
            borderTop: !isFirst && !single ? '1px solid var(--ds-hover-tint)' : '1px solid var(--ds-border-subtle)',
          }}>
            <Component {...mod} />
          </div>
        );
      })}
    </div>
  );
}
