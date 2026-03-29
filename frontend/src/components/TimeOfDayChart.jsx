import React from 'react';

// ─── Static style constants ───────────────────────────────────────────────────

const CONTAINER_STYLE = {};

const HEADER_STYLE = {
  marginBottom: 14,
};

const LABEL_STYLE = {
  fontSize: 13,
  fontWeight: 500,
  letterSpacing: 0.3,
  color: 'var(--ds-text-tertiary)',
};

const SUBTITLE_STYLE = {
  fontSize: 12,
  color: 'var(--ds-text-muted)',
  marginTop: 2,
};

const BARS_WRAPPER_STYLE = {
  display: 'flex',
  alignItems: 'flex-end',
  gap: 3,
  height: 64,
  marginBottom: 6,
};

const HOUR_LABELS_STYLE = {
  display: 'flex',
  justifyContent: 'space-between',
  paddingLeft: 0,
};

const HOUR_LABEL_STYLE = {
  fontSize: 10,
  color: 'var(--ds-text-muted)',
  width: '25%',
};

const FOOTER_STYLE = {
  marginTop: 12,
  paddingTop: 10,
  borderTop: '1px solid var(--ds-border-subtle)',
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  fontSize: 12,
  color: 'var(--ds-text-secondary)',
};

const GREEN_DOT_STYLE = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: 'var(--ds-green)',
  flexShrink: 0,
};

// ─── Bar color helper ─────────────────────────────────────────────────────────

function barColor(value) {
  if (value >= 0.7) return 'var(--ds-green)';
  if (value >= 0.3) return 'var(--ds-accent)';
  return 'var(--ds-border-medium)';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TimeOfDayChart({
  hours = Array(24).fill(0),
  bestStart = 8,
  bestEnd = 11,
}) {
  const safeHours = Array.from({ length: 24 }, (_, i) => Math.min(1, Math.max(0, hours[i] ?? 0)));
  const MIN_BAR_H = 4; // px — always visible even at 0

  return (
    <div style={CONTAINER_STYLE}>
      {/* Header */}
      <div style={HEADER_STYLE}>
        <div style={LABEL_STYLE}>Tageszeit</div>
        <div style={SUBTITLE_STYLE}>Aktivität</div>
      </div>

      {/* Bars */}
      <div style={BARS_WRAPPER_STYLE}>
        {safeHours.map((val, h) => {
          const barH = Math.max(MIN_BAR_H, Math.round(val * 60));
          return (
            <div
              key={h}
              style={{
                flex: 1,
                height: barH,
                borderRadius: 3,
                background: barColor(val),
                opacity: val === 0 ? 0.35 : 1,
                transition: 'height 0.3s ease',
              }}
            />
          );
        })}
      </div>

      {/* Hour labels every 6h */}
      <div style={HOUR_LABELS_STYLE}>
        {[0, 6, 12, 18].map(h => (
          <div key={h} style={HOUR_LABEL_STYLE}>
            {h === 0 ? '0h' : `${h}h`}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={FOOTER_STYLE}>
        <div style={GREEN_DOT_STYLE} />
        <span>
          Am besten:{' '}
          <span style={{ fontWeight: 600, color: 'var(--ds-text-primary)' }}>
            {bestStart}–{bestEnd} Uhr
          </span>
        </span>
      </div>
    </div>
  );
}
