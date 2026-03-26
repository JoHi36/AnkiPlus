import React, { useState, useCallback, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DEMO_SCENARIOS, type DemoScenario } from './DemoData';

// ───────────────────────────────────────────────
// Styles (module-level, no external deps)
// ───────────────────────────────────────────────

const SHELL: React.CSSProperties = {
  width: '100%', height: '100%',
  display: 'flex', flexDirection: 'column',
  background: '#1C1C1E',
  borderRadius: 16, overflow: 'hidden',
  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
};

const HEADER: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '12px 16px',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  flexShrink: 0,
};

const DOT: React.CSSProperties = {
  width: 10, height: 10, borderRadius: '50%',
  background: 'rgba(255,255,255,0.08)',
};

const TABS: React.CSSProperties = {
  display: 'flex', gap: 2, margin: '0 auto',
};

const TAB: React.CSSProperties = {
  padding: '4px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500,
  cursor: 'pointer', border: 'none', background: 'transparent',
  color: 'rgba(255,255,255,0.35)', fontFamily: 'inherit',
};

const TAB_ON: React.CSSProperties = {
  ...TAB,
  background: 'rgba(255,255,255,0.04)',
  color: 'rgba(255,255,255,0.92)',
};

const CENTER: React.CSSProperties = {
  flex: 1, overflow: 'auto',
  display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center',
  padding: '32px 48px', gap: 20,
};

const BADGE: React.CSSProperties = {
  display: 'inline-block', fontSize: 10, fontWeight: 600,
  letterSpacing: '0.12em', textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.35)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 6, padding: '2px 8px',
};

const FRONT: React.CSSProperties = {
  fontSize: 20, color: 'rgba(255,255,255,0.92)',
  lineHeight: 1.55, textAlign: 'center', maxWidth: 600,
};

const DOCK: React.CSSProperties = {
  flexShrink: 0, padding: '0 16px 16px',
};

const INPUT_DOCK: React.CSSProperties = {
  background: 'linear-gradient(165deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%), rgba(28,28,30,0.82)',
  backdropFilter: 'blur(40px) saturate(1.8)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 16, overflow: 'hidden',
  boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.15), 0 4px 24px rgba(0,0,0,0.25)',
};

const TEXTAREA: React.CSSProperties = {
  background: 'transparent', border: 'none', outline: 'none', resize: 'none',
  color: 'rgba(255,255,255,0.92)', fontFamily: 'inherit',
  fontSize: 15, padding: '14px 18px', width: '100%', boxSizing: 'border-box',
};

const ACTIONS_ROW: React.CSSProperties = {
  display: 'flex', alignItems: 'center',
  borderTop: '1px solid rgba(255,255,255,0.06)',
};

const ACTION_BTN: React.CSSProperties = {
  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
  gap: 4, height: 44, background: 'transparent', border: 'none',
  cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
  fontWeight: 500, color: 'rgba(255,255,255,0.35)',
};

const ACTION_BTN_PRIMARY: React.CSSProperties = {
  ...ACTION_BTN,
  fontWeight: 600, color: 'rgba(255,255,255,0.88)',
};

const KBD: React.CSSProperties = {
  fontFamily: 'ui-monospace, monospace', fontSize: 10,
  color: 'rgba(255,255,255,0.18)', marginLeft: 4,
};

const DIVIDER: React.CSSProperties = {
  width: 1, height: 16, background: 'rgba(255,255,255,0.06)', flexShrink: 0,
};

const SCENARIOS = [
  { key: 'medicine', label: 'Medizin' },
  { key: 'law',      label: 'Jura' },
  { key: 'business', label: 'BWL' },
];

// ───────────────────────────────────────────────
// DemoShell — self-contained, zero external imports
// ───────────────────────────────────────────────

export function DemoShell() {
  const [scenarioKey, setScenarioKey] = useState('medicine');
  const [showBack, setShowBack] = useState(false);

  const scenario = DEMO_SCENARIOS[scenarioKey];

  const handleShowAnswer = useCallback(() => {
    setShowBack(true);
  }, []);

  const switchScenario = useCallback((key: string) => {
    setShowBack(false);
    setScenarioKey(key);
  }, []);

  return (
    <div style={SHELL}>

      {/* Window chrome */}
      <div style={HEADER}>
        <div style={DOT} />
        <div style={DOT} />
        <div style={DOT} />
        <div style={TABS}>
          {SCENARIOS.map(s => (
            <button
              key={s.key}
              style={scenarioKey === s.key ? TAB_ON : TAB}
              onClick={() => switchScenario(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Card area */}
      <div style={CENTER}>
        <span style={BADGE}>
          {scenario.card.tags[0] || scenario.card.deckName}
        </span>

        <div style={FRONT} dangerouslySetInnerHTML={{ __html: scenario.card.front }} />

        <AnimatePresence>
          {showBack && (
            <motion.div
              key="back"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              style={{ overflow: 'hidden', width: '100%', maxWidth: 600 }}
            >
              <div
                style={{
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                  paddingTop: 16, fontSize: 14,
                  color: 'rgba(255,255,255,0.55)', lineHeight: 1.7,
                }}
                dangerouslySetInnerHTML={{ __html: scenario.card.back }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Input dock — built inline, no ChatInput import */}
      <div style={DOCK}>
        <div style={INPUT_DOCK}>
          <textarea
            rows={1}
            placeholder="Stelle eine Frage..."
            style={TEXTAREA}
            readOnly
          />
          <div style={ACTIONS_ROW}>
            <button style={ACTION_BTN_PRIMARY} onClick={handleShowAnswer}>
              Antwort zeigen<span style={KBD}>SPACE</span>
            </button>
            <div style={DIVIDER} />
            <button style={ACTION_BTN}>
              Multiple Choice<span style={KBD}>ENTER</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DemoShell;
