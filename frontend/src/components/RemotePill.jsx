import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone } from 'lucide-react';

const PILL_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--ds-space-xs)',
  padding: 'var(--ds-space-xs) var(--ds-space-md)',
  fontSize: 'var(--ds-text-sm)',
  color: 'var(--ds-text-secondary)',
  borderRadius: 'var(--ds-radius-full)',
  background: 'var(--ds-bg-frosted)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid var(--ds-border)',
};

const DOT_STYLE = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: 'var(--ds-green)',
};

const RemotePill = ({ visible }) => (
  <AnimatePresence>
    {visible && (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ duration: 0.25 }}
        style={PILL_STYLE}
      >
        <span style={DOT_STYLE} />
        <Smartphone size={14} />
        <span>Remote verbunden</span>
      </motion.div>
    )}
  </AnimatePresence>
);

export default React.memo(RemotePill);
