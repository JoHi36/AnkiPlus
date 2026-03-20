import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, CheckCircle,
} from 'lucide-react';
import { useSessionContext } from '../contexts/SessionContext';

/* ══════════════════════════════════════════════════════════
   OVERVIEW PILL  (shown when showSessionOverview=true)
   ══════════════════════════════════════════════════════════ */
function OverviewPill({ sessions, onOpenSettings, bridge }) {
  const [authStatus, setAuthStatus] = useState({ authenticated: false });

  useEffect(() => {
    if (!bridge?.getAuthStatus) return;
    try {
      const raw = bridge.getAuthStatus();
      if (raw) setAuthStatus(JSON.parse(raw));
    } catch (_) {}
  }, [bridge]);

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
        {onOpenSettings && (
          <motion.button
            onClick={onOpenSettings}
            whileTap={{ scale: 0.9 }}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 8, cursor: 'pointer',
              background: authStatus.authenticated ? 'var(--ds-green-tint)' : 'var(--ds-hover-tint)',
              border: `1px solid ${authStatus.authenticated ? 'rgba(48,209,88,0.2)' : 'var(--ds-border-subtle)'}`,
            }}
          >
            <User size={12} style={{ color: authStatus.authenticated ? 'var(--ds-green)' : 'var(--ds-text-secondary)' }} />
            <span style={{ fontSize: 11, fontWeight: 500, color: authStatus.authenticated ? 'var(--ds-green)' : 'var(--ds-text-secondary)' }}>
              Profil
            </span>
            {authStatus.authenticated && <CheckCircle size={9} style={{ color: 'var(--ds-green)' }} />}
          </motion.button>
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
  onOpenSettings,
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
              onOpenSettings={onOpenSettings}
              bridge={bridge}
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
