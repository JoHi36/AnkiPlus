import React, { useState } from 'react';
import { motion } from 'framer-motion';
import ProgressBar from './ProgressBar';
import RatingButtons from './RatingButtons';

const LIST_STYLE = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--ds-space-sm)',
  padding: 'var(--ds-space-md)',
  flex: 1,
};

const OPTION_BASE = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--ds-space-md)',
  padding: 'var(--ds-space-md) var(--ds-space-lg)',
  borderRadius: 'var(--ds-radius-lg)',
  border: '1px solid var(--ds-border)',
  background: 'var(--ds-bg-canvas)',
  cursor: 'pointer',
  fontSize: 'var(--ds-text-md)',
  color: 'var(--ds-text-primary)',
  textAlign: 'left',
  width: '100%',
};

const LETTER_STYLE = {
  fontFamily: 'var(--ds-font-mono)',
  fontWeight: 600,
  color: 'var(--ds-text-secondary)',
  minWidth: 24,
};

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

const MCScreen = ({ card, progress, mcOptions, onSelect, onRate }) => {
  const [selected, setSelected] = useState(null);
  const [showRating, setShowRating] = useState(false);

  const handleSelect = (option, index) => {
    if (selected !== null) return;
    setSelected(index);
    onSelect(option.id);
    setTimeout(() => setShowRating(true), 800);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ProgressBar deck={card.deck} current={progress.current} total={progress.total} />

      {!showRating ? (
        <div style={LIST_STYLE}>
          {mcOptions.map((opt, i) => (
            <motion.button
              key={opt.id}
              style={{
                ...OPTION_BASE,
                borderColor: selected === i ? 'var(--ds-accent)' : 'var(--ds-border)',
                background: selected === i ? 'var(--ds-accent-10)' : 'var(--ds-bg-canvas)',
              }}
              whileTap={selected === null ? { scale: 0.98 } : {}}
              onClick={() => handleSelect(opt, i)}
            >
              <span style={LETTER_STYLE}>{LETTERS[i]})</span>
              <span>{opt.text}</span>
            </motion.button>
          ))}
        </div>
      ) : (
        <div style={{ marginTop: 'auto' }}>
          <RatingButtons onRate={onRate} />
        </div>
      )}
    </div>
  );
};

export default React.memo(MCScreen);
