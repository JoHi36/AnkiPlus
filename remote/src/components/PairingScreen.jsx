import React from 'react';
import { motion } from 'framer-motion';

const CONTAINER_STYLE = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  gap: 'var(--ds-space-xl)',
  padding: 'var(--ds-space-2xl)',
  textAlign: 'center',
};

const TITLE_STYLE = {
  fontSize: 'var(--ds-text-xl)',
  fontWeight: 600,
  color: 'var(--ds-text-primary)',
};

const DESC_STYLE = {
  fontSize: 'var(--ds-text-md)',
  color: 'var(--ds-text-secondary)',
  lineHeight: 1.5,
};

const ICON_STYLE = {
  width: 64,
  height: 64,
  borderRadius: 'var(--ds-radius-lg)',
  background: 'var(--ds-bg-canvas)',
  border: '1px solid var(--ds-border)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 32,
};

const PairingScreen = () => (
  <div style={CONTAINER_STYLE}>
    <motion.div
      style={ICON_STYLE}
      animate={{ scale: [1, 1.05, 1] }}
      transition={{ duration: 2, repeat: Infinity }}
    >
      📱
    </motion.div>
    <div style={TITLE_STYLE}>AnkiPlus Remote</div>
    <div style={DESC_STYLE}>
      Öffne die AnkiPlus Settings auf deinem Computer und scanne den QR-Code um dich zu verbinden.
    </div>
  </div>
);

export default React.memo(PairingScreen);
