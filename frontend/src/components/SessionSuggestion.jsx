import React from 'react';

const CARD_STYLE = {
  padding: '20px 24px',
  borderRadius: 14,
  border: '1px solid var(--ds-border-subtle)',
  background: 'var(--ds-bg-canvas)',
};

const TITLE_STYLE = {
  fontSize: 11,
  fontWeight: 500,
  color: 'var(--ds-text-muted)',
  letterSpacing: 0.5,
  textTransform: 'uppercase',
  marginBottom: 16,
};

const ROW_STYLE = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  padding: '6px 0',
};

const LABEL_STYLE = {
  fontSize: 14,
  color: 'var(--ds-text-secondary)',
};

const VALUE_STYLE = {
  fontSize: 20,
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
};

const DIVIDER_STYLE = {
  height: 1,
  background: 'var(--ds-border-subtle)',
  margin: '8px 0',
};

const TOTAL_LABEL_STYLE = {
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--ds-text-primary)',
};

const TOTAL_VALUE_STYLE = {
  fontSize: 24,
  fontWeight: 600,
  color: 'var(--ds-text-primary)',
  fontVariantNumeric: 'tabular-nums',
};

export default function SessionSuggestion({ suggestion }) {
  if (!suggestion || suggestion.error) return null;

  const { dueReview, recommendedNew, total } = suggestion;

  return (
    <div style={CARD_STYLE}>
      <div style={TITLE_STYLE}>Dein Plan für heute</div>

      <div style={ROW_STYLE}>
        <span style={LABEL_STYLE}>Pflege</span>
        <span style={{ ...VALUE_STYLE, color: 'var(--ds-accent)' }}>
          {dueReview}
        </span>
      </div>

      <div style={ROW_STYLE}>
        <span style={LABEL_STYLE}>Neue Karten</span>
        <span style={{ ...VALUE_STYLE, color: 'var(--ds-green)' }}>
          {recommendedNew}
        </span>
      </div>

      <div style={DIVIDER_STYLE} />

      <div style={ROW_STYLE}>
        <span style={TOTAL_LABEL_STYLE}>Gesamt</span>
        <span style={TOTAL_VALUE_STYLE}>{total}</span>
      </div>
    </div>
  );
}
