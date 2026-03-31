import React from 'react';

const BAR_STYLE = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: 'var(--ds-space-sm) var(--ds-space-lg)',
  fontSize: 'var(--ds-text-sm)',
  color: 'var(--ds-text-secondary)',
};

const DECK_STYLE = {
  fontWeight: 500,
  color: 'var(--ds-text-primary)',
};

const ProgressBar = ({ deck, current, total }) => (
  <div style={BAR_STYLE}>
    <span style={DECK_STYLE}>{deck}</span>
    <span>{current}/{total}</span>
  </div>
);

export default React.memo(ProgressBar);
