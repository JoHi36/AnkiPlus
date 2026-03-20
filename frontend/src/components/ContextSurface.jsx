import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, RotateCcw,
  BookOpen, User, CheckCircle,
} from 'lucide-react';
import { useSessionContext } from '../contexts/SessionContext';

/* ── tokens ── */
const T = {
  blue:   '#0a84ff',
  green:  '#30d158',
};

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
      <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.72)', letterSpacing: '-0.01em' }}>
        AnkiPlus
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {sessions.length > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 600,
            color: 'rgba(255,255,255,0.28)',
            background: 'rgba(255,255,255,0.06)', borderRadius: 6,
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
              background: authStatus.authenticated ? 'rgba(48,209,88,0.1)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${authStatus.authenticated ? 'rgba(48,209,88,0.2)' : 'rgba(255,255,255,0.07)'}`,
            }}
          >
            <User size={12} style={{ color: authStatus.authenticated ? '#30d158' : 'rgba(255,255,255,0.4)' }} />
            <span style={{ fontSize: 11, fontWeight: 500, color: authStatus.authenticated ? '#30d158' : 'rgba(255,255,255,0.4)' }}>
              Profil
            </span>
            {authStatus.authenticated && <CheckCircle size={9} style={{ color: '#30d158' }} />}
          </motion.button>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   FLOATING SECTION PILL — WhatsApp-style centered pill
   Appears when a section header scrolls past the top.
   Tap → TOC dropdown with all chapters + "Chat zurücksetzen"
   ══════════════════════════════════════════════════════════ */
function FloatingSectionPill({ sectionTitle, sections, onScrollToSection, onSectionTitleClick, onReset, isResetDisabled }) {
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef(null);

  // Close TOC when clicking outside or pressing Escape
  useEffect(() => {
    if (!expanded) return;
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setExpanded(false);
      }
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [expanded]);

  const hasSections = sections?.length > 0;
  const displayTitle = sectionTitle || 'Lernkarte';

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '8px 0 0 0',
        position: 'relative',
      }}
    >
      {/* The floating pill */}
      <motion.button
        onClick={() => hasSections ? setExpanded(v => !v) : onSectionTitleClick?.()}
        initial={{ opacity: 0, y: -8, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.9 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        whileTap={{ scale: 0.95 }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '5px 14px',
          borderRadius: 20,
          background: 'rgba(30, 30, 30, 0.85)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
          cursor: 'pointer',
          maxWidth: '70%',
        }}
      >
        <div style={{
          width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
          background: T.blue,
          boxShadow: '0 0 6px 1px rgba(10,132,255,0.5)',
        }} />
        <span style={{
          fontSize: 11, fontWeight: 500,
          color: 'rgba(255,255,255,0.6)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {displayTitle}
        </span>
        {hasSections && (
          <BookOpen size={11} style={{ color: 'rgba(255,255,255,0.25)', flexShrink: 0 }} />
        )}
      </motion.button>

      {/* TOC dropdown — centered under pill, floats over content */}
      <AnimatePresence initial={false}>
        {expanded && hasSections && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginTop: 4,
            zIndex: 100,
            minWidth: 200,
            maxWidth: 280,
          }}>
          <motion.div
            key="toc"
            initial={{ opacity: 0, y: -4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            style={{
              background: 'rgba(22, 22, 24, 0.95)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 14,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              overflow: 'hidden',
            }}
          >
            {/* Section list */}
            <div style={{ padding: '6px 4px' }}>
              {sections.map((section, i) => {
                const active = section.title === sectionTitle;
                return (
                  <motion.button
                    key={section.id}
                    onClick={() => { onScrollToSection?.(section.id); setExpanded(false); }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer',
                      borderRadius: 8,
                    }}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03, type: 'spring', stiffness: 400, damping: 28 }}
                    whileHover={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div style={{
                      width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                      background: active ? T.blue : 'rgba(255,255,255,0.15)',
                      boxShadow: active ? '0 0 6px rgba(10,132,255,0.55)' : 'none',
                    }} />
                    <span style={{
                      fontSize: 12,
                      fontWeight: active ? 600 : 400,
                      color: active ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.38)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      textAlign: 'left',
                    }}>
                      {section.title}
                    </span>
                  </motion.button>
                );
              })}
            </div>

            {/* Divider */}
            <div style={{ height: 1, margin: '0 10px', background: 'rgba(255,255,255,0.06)' }} />

            {/* Chat zurücksetzen */}
            <div style={{ padding: '4px 4px 6px' }}>
              <motion.button
                onClick={() => { onReset?.(); setExpanded(false); }}
                disabled={isResetDisabled}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer',
                  borderRadius: 8,
                  opacity: isResetDisabled ? 0.2 : 0.55,
                }}
                whileHover={!isResetDisabled ? { backgroundColor: 'rgba(255,69,58,0.06)' } : {}}
                whileTap={!isResetDisabled ? { scale: 0.98 } : {}}
              >
                <RotateCcw size={11} style={{ color: isResetDisabled ? 'rgba(255,255,255,0.3)' : 'rgba(255,69,58,0.7)' }} />
                <span style={{
                  fontSize: 12, fontWeight: 400,
                  color: isResetDisabled ? 'rgba(255,255,255,0.2)' : 'rgba(255,69,58,0.7)',
                }}>
                  Chat zurücksetzen
                </span>
              </motion.button>
            </div>
          </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Main export
   ══════════════════════════════════════════════════════════ */
export default function ContextSurface({
  onNavigateToOverview, showSessionOverview,
  onReset, isResetDisabled, onOpenSettings,
  cardContext, sectionTitle, sections, onScrollToSection, onSectionTitleClick,
  sessions, onSelectSession,
  bridge,
}) {
  const { currentSession } = useSessionContext();
  const hasCard = !!(cardContext && (cardContext.question || cardContext.frontField));

  const mode = showSessionOverview ? 'sessions' : hasCard ? 'card' : 'idle';

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

        {mode === 'card' && (
          <motion.div key="card"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <FloatingSectionPill
              sectionTitle={sectionTitle}
              sections={sections}
              onScrollToSection={onScrollToSection}
              onSectionTitleClick={onSectionTitleClick}
              onReset={onReset}
              isResetDisabled={isResetDisabled}
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
