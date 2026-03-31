import React from 'react';
import { motion } from 'framer-motion';

const GRID_STYLE = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 'var(--ds-space-sm)',
  padding: 'var(--ds-space-md)',
};

const RATINGS = [
  { ease: 1, label: 'Nochmal', color: 'var(--ds-red)' },
  { ease: 2, label: 'Schwer', color: 'var(--ds-yellow)' },
  { ease: 3, label: 'Gut', color: 'var(--ds-green)' },
  { ease: 4, label: 'Leicht', color: 'var(--ds-accent)' },
];

const BUTTON_BASE = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 'var(--ds-space-lg) var(--ds-space-md)',
  borderRadius: 'var(--ds-radius-lg)',
  border: '1px solid var(--ds-border)',
  background: 'var(--ds-bg-frosted)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  cursor: 'pointer',
  minHeight: 72,
  gap: 'var(--ds-space-2xs)',
};

const RatingButton = React.memo(({ ease, label, color, onRate }) => (
  <motion.button
    style={BUTTON_BASE}
    whileTap={{ scale: 0.95 }}
    onClick={() => onRate(ease)}
  >
    <span style={{ fontSize: 'var(--ds-text-xl)', fontWeight: 600, color }}>{ease}</span>
    <span style={{ fontSize: 'var(--ds-text-sm)', color: 'var(--ds-text-secondary)' }}>{label}</span>
  </motion.button>
));

const RatingButtons = ({ onRate }) => (
  <div style={GRID_STYLE}>
    {RATINGS.map(r => (
      <RatingButton key={r.ease} {...r} onRate={onRate} />
    ))}
  </div>
);

export default React.memo(RatingButtons);
