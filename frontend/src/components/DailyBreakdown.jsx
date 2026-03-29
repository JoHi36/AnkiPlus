import React from 'react';

// ─── Static style constants ───────────────────────────────────────────────────

const CONTAINER_STYLE = {
  background: 'var(--ds-bg-overlay)',
  border: '1px solid var(--ds-border-subtle)',
  borderRadius: 16,
  padding: '18px 20px',
};

const HEADER_STYLE = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  marginBottom: 14,
};

const LABEL_STYLE = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: 0.3,
  color: 'var(--ds-text-tertiary)',
  textTransform: 'uppercase',
};

const TOTAL_STYLE = {
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--ds-text-secondary)',
};

const BAR_WRAPPER_STYLE = {
  display: 'flex',
  height: 7,
  borderRadius: 4,
  overflow: 'hidden',
  gap: 2,
  marginBottom: 16,
};

const ROWS_STYLE = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

const ROW_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};

const DOT_BASE_STYLE = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  flexShrink: 0,
};

const ROW_LABEL_STYLE = {
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--ds-text-primary)',
  minWidth: 72,
};

const ROW_DESC_STYLE = {
  fontSize: 12,
  color: 'var(--ds-text-muted)',
  flex: 1,
};

const ROW_VALUE_STYLE = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--ds-text-primary)',
};

const FOOTER_STYLE = {
  marginTop: 14,
  paddingTop: 12,
  borderTop: '1px solid var(--ds-border-subtle)',
  fontSize: 12,
  color: 'var(--ds-text-secondary)',
};

// Wachstum uses a purple not in the design system — defined as a local constant
const WACHSTUM_COLOR = '#5E5CE6';

// ─── Component ────────────────────────────────────────────────────────────────

export default function DailyBreakdown({
  newCount = 0,
  youngCount = 0,
  matureCount = 0,
  growthPct = 0,
}) {
  const total = newCount + youngCount + matureCount;
  const safeDenom = total || 1;

  const segments = [
    { color: WACHSTUM_COLOR, count: newCount },
    { color: 'var(--ds-accent)', count: youngCount },
    { color: 'var(--ds-border-medium)', count: matureCount },
  ];

  const categories = [
    {
      color: WACHSTUM_COLOR,
      label: 'Wachstum',
      desc: 'Neue Karten',
      count: newCount,
    },
    {
      color: 'var(--ds-accent)',
      label: 'Festigung',
      desc: 'Junge Karten im Lernzyklus',
      count: youngCount,
    },
    {
      color: 'var(--ds-border-medium)',
      label: 'Pflege',
      desc: 'Reife Karten wiederholt',
      count: matureCount,
    },
  ];

  return (
    <div style={CONTAINER_STYLE}>
      {/* Header */}
      <div style={HEADER_STYLE}>
        <div style={LABEL_STYLE}>Dein Tag</div>
        <div style={TOTAL_STYLE}>Heute: {total} Karten</div>
      </div>

      {/* Segmented bar */}
      <div style={BAR_WRAPPER_STYLE}>
        {segments.map((s, i) =>
          s.count > 0 ? (
            <div
              key={i}
              style={{
                flex: s.count / safeDenom,
                background: s.color,
                minWidth: 4,
              }}
            />
          ) : null
        )}
      </div>

      {/* Rows */}
      <div style={ROWS_STYLE}>
        {categories.map((cat, i) => (
          <div key={i} style={ROW_STYLE}>
            <div style={{ ...DOT_BASE_STYLE, background: cat.color }} />
            <div style={ROW_LABEL_STYLE}>{cat.label}</div>
            <div style={ROW_DESC_STYLE}>{cat.desc}</div>
            <div style={ROW_VALUE_STYLE}>{cat.count}</div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={FOOTER_STYLE}>
        Davon echtes Wachstum:{' '}
        <span style={{ fontWeight: 600, color: 'var(--ds-text-primary)' }}>
          {newCount} neue Karten
        </span>
        {' '}(+{growthPct.toFixed(1)}%)
      </div>
    </div>
  );
}
