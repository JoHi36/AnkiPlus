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
  alignItems: 'center',
  marginBottom: 14,
};

const LABEL_STYLE = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: 0.3,
  color: 'var(--ds-text-tertiary)',
  textTransform: 'uppercase',
};

const HEADER_RIGHT_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};

const STREAK_BADGE_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--ds-text-primary)',
};

const TOTAL_STYLE = {
  fontSize: 12,
  color: 'var(--ds-text-muted)',
};

const MONTH_ROW_STYLE = {
  display: 'flex',
  justifyContent: 'space-between',
  marginBottom: 5,
};

const MONTH_LABEL_STYLE = {
  fontSize: 10,
  color: 'var(--ds-text-muted)',
  width: '8.33%',
  textAlign: 'center',
};

const GRID_STYLE = {
  display: 'grid',
  gridTemplateColumns: 'repeat(52, 1fr)',
  gridTemplateRows: 'repeat(7, 1fr)',
  gap: 2,
  gridAutoFlow: 'column',
};

const FOOTER_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  marginTop: 10,
  justifyContent: 'flex-end',
};

const FOOTER_LABEL_STYLE = {
  fontSize: 10,
  color: 'var(--ds-text-muted)',
};

const LEGEND_SQUARE_STYLE = {
  width: 10,
  height: 10,
  borderRadius: 2,
};

// Level colors — opacity variants of ds-accent (#0A84FF) + empty state
const LEVEL_COLORS = [
  'rgba(255,255,255,0.025)',
  'rgba(10,132,255,0.15)',
  'rgba(10,132,255,0.32)',
  'rgba(10,132,255,0.55)',
  'rgba(10,132,255,0.85)',
];

// Month names for labels
const MONTH_NAMES = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

// ─── Component ────────────────────────────────────────────────────────────────

export default function YearHeatmap({
  levels = [],
  totalYear = 0,
  streak = 0,
  bestStreak = 0,
}) {
  // Pad to 364 cells (52 weeks × 7 days)
  const CELLS = 52 * 7;
  const padded = Array.from({ length: CELLS }, (_, i) => levels[i] ?? 0);

  // Compute month label positions: one label per month based on start-of-month column
  const today = new Date();
  const monthLabels = MONTH_NAMES.map((name, m) => {
    // Find which column corresponds to the 1st of month m in the past year
    const d = new Date(today.getFullYear(), today.getMonth() - 11 + m, 1);
    const msInWeek = 7 * 24 * 3600 * 1000;
    const startOfGrid = new Date(today);
    startOfGrid.setDate(today.getDate() - CELLS + 1);
    const col = Math.round((d - startOfGrid) / msInWeek);
    if (col < 0 || col > 51) return null;
    return { name, col };
  }).filter(Boolean);

  return (
    <div style={CONTAINER_STYLE}>
      {/* Header */}
      <div style={HEADER_STYLE}>
        <div style={LABEL_STYLE}>Aktivität</div>
        <div style={HEADER_RIGHT_STYLE}>
          <div style={STREAK_BADGE_STYLE}>
            <span>🔥</span>
            <span>{streak}</span>
            <span style={{ fontWeight: 400, color: 'var(--ds-text-muted)', fontSize: 11 }}>Tage</span>
          </div>
          <div style={TOTAL_STYLE}>{totalYear} dieses Jahr</div>
        </div>
      </div>

      {/* Month labels */}
      <div style={{ position: 'relative', height: 14, marginBottom: 4 }}>
        {monthLabels.map(({ name, col }) => (
          <span
            key={name}
            style={{
              position: 'absolute',
              left: `${(col / 52) * 100}%`,
              fontSize: 10,
              color: 'var(--ds-text-muted)',
              transform: 'translateX(-50%)',
              whiteSpace: 'nowrap',
            }}
          >
            {name}
          </span>
        ))}
      </div>

      {/* Grid */}
      <div style={GRID_STYLE}>
        {padded.map((level, i) => (
          <div
            key={i}
            style={{
              aspectRatio: '1',
              borderRadius: 2,
              background: LEVEL_COLORS[Math.min(4, Math.max(0, level))],
            }}
          />
        ))}
      </div>

      {/* Footer legend */}
      <div style={FOOTER_STYLE}>
        <span style={FOOTER_LABEL_STYLE}>Weniger</span>
        {LEVEL_COLORS.map((bg, i) => (
          <div key={i} style={{ ...LEGEND_SQUARE_STYLE, background: bg }} />
        ))}
        <span style={FOOTER_LABEL_STYLE}>Mehr</span>
      </div>
    </div>
  );
}
