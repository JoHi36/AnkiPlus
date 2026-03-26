import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DemoProvider, useDemoContext } from './DemoContext';
import { useDemoBridgeStub } from './demoAdapters';
import ChatInput from '@frontend/components/ChatInput';
import ReviewFeedback from '@frontend/components/ReviewFeedback';
import { QuizCard } from '@shared/components/QuizCard';

// ───────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────

const SCENARIO_TABS = [
  { key: 'medicine', label: 'Medizin' },
  { key: 'law',      label: 'Jura' },
  { key: 'business', label: 'BWL' },
];

const CARD_CONTAINER_STYLE: React.CSSProperties = {
  background: 'rgba(28,28,30,0.6)',
  borderRadius: 20,
  border: '1px solid rgba(255,255,255,0.06)',
  padding: '32px 28px 24px',
  minHeight: 260,
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};

const TAG_BADGE_STYLE: React.CSSProperties = {
  display: 'inline-block',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.15em',
  textTransform: 'uppercase',
  color: 'var(--ds-accent)',
  background: 'var(--ds-accent-10)',
  borderRadius: 6,
  padding: '2px 8px',
  marginBottom: 12,
};

const CARD_FRONT_STYLE: React.CSSProperties = {
  fontSize: 18,
  color: 'var(--ds-text-primary)',
  lineHeight: 1.55,
  textAlign: 'center',
};

const TAB_BASE_STYLE: React.CSSProperties = {
  padding: '6px 16px',
  borderRadius: 20,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  border: 'none',
  background: 'transparent',
  color: 'var(--ds-text-secondary)',
  transition: 'all 0.15s ease',
};

const TAB_ACTIVE_STYLE: React.CSSProperties = {
  ...TAB_BASE_STYLE,
  background: 'rgba(255,255,255,0.10)',
  color: 'var(--ds-text-primary)',
};

const TABS_WRAPPER_STYLE: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  marginBottom: 16,
};

// ───────────────────────────────────────────────
// DemoShellInner
// ───────────────────────────────────────────────

function DemoShellInner() {
  useDemoBridgeStub();

  const {
    scenario,
    scenarioKey,
    setScenarioKey,
    phase,
    showBack,
    isStreaming,
    evalScore,
    handleShowAnswer,
    handleSubmitText,
    handleStartMC,
    handleMCSelect,
    handleSendChat,
    setInputText,
  } = useDemoContext();

  // ─── Derived ───
  const isEvaluated = phase === 'EVALUATED' || phase === 'ANSWER';
  const isMCPhase   = phase === 'MC_ACTIVE' || phase === 'MC_RESULT';
  const isLoading   = phase === 'EVALUATING' || phase === 'MC_LOADING' || isStreaming;

  // ─── ChatInput send handler ───

  const handleSend = (text: string) => {
    if (phase === 'QUESTION') {
      // Set inputText then call handleSubmitText on next tick so the state update propagates
      setInputText(text);
      setTimeout(() => {
        handleSubmitText();
      }, 0);
    } else {
      handleSendChat(text);
    }
  };

  // ─── Action configs ───

  const actionPrimary = {
    label: 'Antwort zeigen',
    shortcut: 'SPACE',
    onClick: handleShowAnswer,
    disabled: phase !== 'QUESTION',
  };

  const actionSecondary = {
    label: 'Multiple Choice',
    shortcut: 'ENTER',
    onClick: handleStartMC,
    disabled: phase !== 'QUESTION',
  };

  // ─── MC options mapped to QuizCard format ───

  const quizOptions = scenario.mc.options.map(opt => ({
    id: opt.id,
    text: opt.text,
    isCorrect: opt.correct,
    explanation: opt.explanation,
  }));

  // Strip HTML tags to produce plain text question for QuizCard
  const plainQuestion = scenario.card.front.replace(/<[^>]+>/g, '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>

      {/* Scenario tabs */}
      <div style={TABS_WRAPPER_STYLE}>
        {SCENARIO_TABS.map(tab => (
          <button
            key={tab.key}
            style={scenarioKey === tab.key ? TAB_ACTIVE_STYLE : TAB_BASE_STYLE}
            onClick={() => setScenarioKey(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Card container */}
      <div style={CARD_CONTAINER_STYLE}>

        {/* Tag badge */}
        <div style={{ textAlign: 'center' }}>
          {scenario.card.tags[0] && (
            <span style={TAG_BADGE_STYLE}>{scenario.card.tags[0]}</span>
          )}
        </div>

        {/* Card front — developer-authored trusted HTML from DemoData.ts */}
        {/* eslint-disable-next-line react/no-danger */}
        <div style={CARD_FRONT_STYLE} dangerouslySetInnerHTML={{ __html: scenario.card.front }} />

        {/* Card back — animated height reveal with framer-motion */}
        <AnimatePresence>
          {showBack && (
            <motion.div
              key="card-back"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              style={{ overflow: 'hidden' }}
            >
              {/* developer-authored trusted HTML from DemoData.ts */}
              {/* eslint-disable-next-line react/no-danger */}
              <div
                style={{
                  borderTop: '1px solid rgba(255,255,255,0.08)',
                  paddingTop: 16,
                  marginTop: 8,
                  fontSize: 15,
                  color: 'var(--ds-text-secondary)',
                  lineHeight: 1.6,
                }}
                dangerouslySetInnerHTML={{ __html: scenario.card.back }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Evaluation feedback */}
        {isEvaluated && evalScore > 0 && (
          <ReviewFeedback score={evalScore} />
        )}

        {/* MC quiz */}
        {isMCPhase && (
          <QuizCard
            question={plainQuestion}
            options={quizOptions}
            onSelect={handleMCSelect}
          />
        )}
      </div>

      {/* ChatInput */}
      <ChatInput
        onSend={handleSend}
        isLoading={isLoading}
        placeholder="Stelle eine Frage..."
        actionPrimary={actionPrimary}
        actionSecondary={actionSecondary}
      />
    </div>
  );
}

// ───────────────────────────────────────────────
// DemoShell (public export — wraps DemoShellInner with Provider)
// ───────────────────────────────────────────────

export function DemoShell() {
  return (
    <DemoProvider>
      <DemoShellInner />
    </DemoProvider>
  );
}

export default DemoShell;
