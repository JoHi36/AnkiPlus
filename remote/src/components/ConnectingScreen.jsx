import React from 'react';
import { motion } from 'framer-motion';

const CONTAINER_STYLE = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  gap: 'var(--ds-space-lg)',
  color: 'var(--ds-text-secondary)',
};

const DOT_STYLE = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: 'var(--ds-accent)',
};

const ConnectingScreen = ({ peerConnected }) => (
  <div style={CONTAINER_STYLE}>
    <motion.div
      style={DOT_STYLE}
      animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 1.5, repeat: Infinity }}
    />
    <p style={{ fontSize: 'var(--ds-text-lg)' }}>
      {peerConnected ? 'Verbunden' : 'Verbinde mit Anki...'}
    </p>
    {!peerConnected && (
      <p style={{ fontSize: 'var(--ds-text-sm)', color: 'var(--ds-text-tertiary)' }}>
        Starte Anki auf deinem Computer
      </p>
    )}
  </div>
);

export default React.memo(ConnectingScreen);
