import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSessionContext } from '../contexts/SessionContext';

/* ══════════════════════════════════════════════════════════
   OVERVIEW PILL  (shown when showSessionOverview=true)
   ══════════════════════════════════════════════════════════ */
function OverviewPill({ sessions }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 16px',
    }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ds-text-primary)', letterSpacing: '-0.01em' }}>
        AnkiPlus
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {sessions.length > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 600,
            color: 'var(--ds-text-tertiary)',
            background: 'var(--ds-border-subtle)', borderRadius: 6,
            padding: '2px 7px',
          }}>
            {sessions.length} Sessions
          </span>
        )}
      </div>
    </div>
  );
}


/* ══════════════════════════════════════════════════════════
   Main export
   ══════════════════════════════════════════════════════════ */
export default function ContextSurface({
  onNavigateToOverview, showSessionOverview,
  cardContext,
  sessions, onSelectSession,
  bridge,
}) {
  const { currentSession } = useSessionContext();

  const mode = showSessionOverview ? 'sessions' : 'idle';

  return (
    <div style={{ padding: 0, background: 'var(--ds-bg-deep)' }}>
      <AnimatePresence mode="wait" initial={false}>

        {mode === 'sessions' && (
          <motion.div key="sessions"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <OverviewPill
              sessions={sessions || []}
            />
          </motion.div>
        )}

        {mode === 'idle' && (
          <motion.div key="idle"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ height: 8 }}
          />
        )}

      </AnimatePresence>
    </div>
  );
}
