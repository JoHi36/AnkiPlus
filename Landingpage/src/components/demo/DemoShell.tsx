import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DEMO_SCENARIOS } from './DemoData';
import ChatInput from '@frontend/components/ChatInput.tsx';
import ReviewFeedback from '@frontend/components/ReviewFeedback.jsx';
import { MultipleChoiceCard as QuizCard } from '@shared/components/MultipleChoiceCard';

// ───────────────────────────────────────────────
// Styles
// ───────────────────────────────────────────────

const SHELL: React.CSSProperties = {
  width: '100%', height: '100%',
  display: 'flex', flexDirection: 'column',
  background: 'var(--ds-bg-canvas, #1C1C1E)',
  overflow: 'hidden',
};

const HEADER: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '10px 16px',
  borderBottom: '1px solid var(--ds-border-subtle, rgba(255,255,255,0.06))',
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
  transition: 'all 0.15s ease',
};

const TAB_ON: React.CSSProperties = {
  ...TAB,
  background: 'rgba(255,255,255,0.06)',
  color: 'rgba(255,255,255,0.92)',
};

/* The scrollable content area mirrors the real app's reviewer layout */
const CONTENT: React.CSSProperties = {
  flex: 1, overflow: 'auto',
  display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center',
  padding: '40px 24px 24px',
  gap: 16,
};

const BADGE: React.CSSProperties = {
  display: 'inline-block', fontSize: 10, fontWeight: 600,
  letterSpacing: '0.12em', textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.35)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 6, padding: '2px 8px',
};

const FRONT: React.CSSProperties = {
  fontSize: 22, color: 'rgba(255,255,255,0.92)',
  lineHeight: 1.5, textAlign: 'center', maxWidth: 560,
};

/* Bottom dock — stays at bottom via flex, centered like the real app */
const DOCK: React.CSSProperties = {
  flexShrink: 0,
  width: '100%', maxWidth: 680,
  margin: '0 auto',
  padding: '0 24px 20px',
};

const SCENARIOS = [
  { key: 'medicine', label: 'Medizin' },
  { key: 'law',      label: 'Jura' },
  { key: 'business', label: 'BWL' },
];

// ───────────────────────────────────────────────
// DemoShell
// ───────────────────────────────────────────────

export function DemoShell() {
  const [scenarioKey, setScenarioKey] = useState('medicine');
  const [phase, setPhase] = useState<'question' | 'evaluating' | 'evaluated' | 'mc'>('question');
  const [showBack, setShowBack] = useState(false);

  const scenario = DEMO_SCENARIOS[scenarioKey];

  const switchScenario = useCallback((key: string) => {
    setShowBack(false);
    setPhase('question');
    setScenarioKey(key);
  }, []);

  const handleShowAnswer = useCallback(() => {
    if (phase !== 'question') return;
    setShowBack(true);
    setPhase('evaluated');
  }, [phase]);

  const handleStartMC = useCallback(() => {
    if (phase !== 'question') return;
    setPhase('mc');
  }, [phase]);

  const handleMCSelect = useCallback((_id: string, _correct: boolean) => {
    setShowBack(true);
  }, []);

  const handleSend = useCallback((text: string) => {
    if (phase === 'question' && text.trim()) {
      setPhase('evaluating');
      setTimeout(() => {
        setShowBack(true);
        setPhase('evaluated');
      }, 1500);
    }
  }, [phase]);

  const quizOptions = scenario.mc.options.map(o => ({
    id: o.id, text: o.text, isCorrect: o.correct, explanation: o.explanation,
  }));

  return (
    <div style={SHELL}>

      {/* ── Title bar with dots + tabs ── */}
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

      {/* ── Card content ── */}
      <div style={CONTENT}>
        <span style={BADGE}>
          {scenario.card.tags[0] || scenario.card.deckName}
        </span>

        <div style={FRONT} dangerouslySetInnerHTML={{ __html: scenario.card.front }} />

        {/* Answer reveal */}
        <AnimatePresence>
          {showBack && (
            <motion.div
              key="back"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              style={{ overflow: 'hidden', width: '100%', maxWidth: 560 }}
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

        {/* Evaluation bar */}
        {phase === 'evaluated' && (
          <div style={{ width: '100%', maxWidth: 480 }}>
            <ReviewFeedback score={scenario.evaluation.score} />
          </div>
        )}

        {/* MC Quiz */}
        {phase === 'mc' && (
          <div style={{ width: '100%', maxWidth: 480 }}>
            <QuizCard question="" options={quizOptions} onSelect={handleMCSelect} />
          </div>
        )}
      </div>

      {/* ── Input dock — real ChatInput, max-width centered like the app ── */}
      <div style={DOCK}>
        <ChatInput
          onSend={handleSend}
          isLoading={phase === 'evaluating'}
          placeholder="Stelle eine Frage..."
          actionPrimary={{
            label: 'Antwort zeigen',
            shortcut: 'SPACE',
            onClick: handleShowAnswer,
            disabled: phase !== 'question',
          }}
          actionSecondary={{
            label: 'Multiple Choice',
            shortcut: 'ENTER',
            onClick: handleStartMC,
            disabled: phase !== 'question',
          }}
        />
      </div>
    </div>
  );
}

export default DemoShell;
