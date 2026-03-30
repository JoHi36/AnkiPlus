import React from 'react';

// ─── Bar color helper ─────────────────────────────────────────────────────────

function barColor(value) {
  // Green intensity matches treemap mastery palette
  if (value >= 0.7) return 'rgba(74,222,128,0.80)';
  if (value >= 0.4) return 'rgba(74,222,128,0.45)';
  if (value >= 0.15) return 'rgba(74,222,128,0.20)';
  return 'rgba(74,222,128,0.08)';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TimeOfDayChart({
  hours = Array(24).fill(0),
  bestStart = 8,
  bestEnd = 11,
}) {
  const safeHours = Array.from({ length: 24 }, (_, i) => Math.min(1, Math.max(0, hours[i] ?? 0)));
  const MIN_BAR_H = 3;

  return (
    <div style={CONTAINER_STYLE}>
      {/* Bars */}
      <div style={BARS_STYLE}>
        {safeHours.map((val, h) => {
          const barH = Math.max(MIN_BAR_H, Math.round(val * 60));
          return (
            <div
              key={h}
              style={{
                flex: 1,
                height: barH,
                borderRadius: 2,
                background: barColor(val),
                opacity: val === 0 ? 0.35 : 1,
                transition: 'height 0.3s ease',
              }}
            />
          );
        })}
      </div>

      {/* Footer: best time */}
      <div style={FOOTER_STYLE}>
        <div style={DOT_STYLE} />
        <span style={BEST_STYLE}>
          <b>{bestStart}–{bestEnd}</b>
        </span>
      </div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const CONTAINER_STYLE = {
  display: 'flex', flexDirection: 'column', gap: 6,
};

const BARS_STYLE = {
  display: 'flex', alignItems: 'flex-end', gap: 1, height: 64,
};

const FOOTER_STYLE = {
  display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center',
};

const DOT_STYLE = {
  width: 5, height: 5, borderRadius: '50%',
  background: 'rgba(74,222,128,0.80)', flexShrink: 0,
};

const BEST_STYLE = {
  fontSize: 9, color: 'var(--ds-text-muted)',
};
