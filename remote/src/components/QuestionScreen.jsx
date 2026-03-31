import React from 'react';
import { motion } from 'framer-motion';
import ProgressBar from './ProgressBar';
import CardHTML from './CardHTML';

const CONTAINER_STYLE = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
};

const CENTER_STYLE = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const FLIP_BUTTON_STYLE = {
  padding: 'var(--ds-space-lg) var(--ds-space-2xl)',
  borderRadius: 'var(--ds-radius-lg)',
  background: 'var(--ds-bg-frosted)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid var(--ds-border)',
  color: 'var(--ds-text-primary)',
  fontSize: 'var(--ds-text-lg)',
  fontWeight: 500,
  cursor: 'pointer',
  width: 'calc(100% - 2 * var(--ds-space-lg))',
  margin: 'var(--ds-space-md) var(--ds-space-lg)',
};

const QuestionScreen = ({ card, progress, mode, onFlip }) => (
  <div style={CONTAINER_STYLE}>
    <ProgressBar deck={card.deck} current={progress.current} total={progress.total} />

    {mode === 'solo' ? (
      <>
        <CardHTML html={card.frontHtml} />
        <motion.button
          style={FLIP_BUTTON_STYLE}
          whileTap={{ scale: 0.97 }}
          onClick={onFlip}
        >
          Antwort zeigen
        </motion.button>
      </>
    ) : (
      <div style={CENTER_STYLE}>
        <motion.button
          style={{ ...FLIP_BUTTON_STYLE, width: 'auto', padding: 'var(--ds-space-2xl) var(--ds-space-3xl)' }}
          whileTap={{ scale: 0.97 }}
          onClick={onFlip}
        >
          Antwort zeigen
        </motion.button>
      </div>
    )}
  </div>
);

export default React.memo(QuestionScreen);
