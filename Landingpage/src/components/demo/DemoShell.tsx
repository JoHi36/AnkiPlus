import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DemoProvider, useDemoContext } from './DemoContext';
import { useDemoBridgeStub } from './demoAdapters';
import ChatInput from '@frontend/components/ChatInput.tsx';
import ReviewFeedback from '@frontend/components/ReviewFeedback.jsx';
import { QuizCard } from '@shared/components/QuizCard';

// ───────────────────────────────────────────────
// Constants — all styles as module-level objects
// ───────────────────────────────────────────────

const SHELL_STYLE: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--ds-bg-canvas)',
  borderRadius: 16,
  overflow: 'hidden',
};

const HEADER_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '12px 16px',
  borderBottom: '1px solid var(--ds-border-subtle)',
  flexShrink: 0,
};

const TRAFFIC_DOT: React.CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: '50%',
  background: 'rgba(255,255,255,0.08)',
};

const TABS_STYLE: React.CSSProperties = {
  display: 'flex',
  gap: 2,
  marginLeft: 'auto',
  marginRight: 'auto',
};

const TAB_BASE: React.CSSProperties = {
  padding: '4px 14px',
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  border: 'none',
  background: 'transparent',
  color: 'var(--ds-text-tertiary)',
  transition: 'all 0.15s ease',
  fontFamily: 'inherit',
};

const TAB_ACTIVE: React.CSSProperties = {
  ...TAB_BASE,
  background: 'var(--ds-hover-tint)',
  color: 'var(--ds-text-primary)',
};

const SCROLL_AREA_STYLE: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '32px 48px',
  gap: 20,
};

const CARD_FRONT_STYLE: React.CSSProperties = {
  fontSize: 20,
  color: 'var(--ds-text-primary)',
  lineHeight: 1.55,
  textAlign: 'center',
  maxWidth: 600,
};

const TAG_BADGE_STYLE: React.CSSProperties = {
  display: 'inline-block',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--ds-text-tertiary)',
  border: '1px solid var(--ds-border-medium)',
  borderRadius: 6,
  padding: '2px 8px',
};

const DOCK_STYLE: React.CSSProperties = {
  flexShrink: 0,
  padding: '0 16px 16px',
};

const SCENARIO_TABS = [
  { key: 'medicine', label: 'Medizin' },
  { key: 'law',      label: 'Jura' },
  { key: 'business', label: 'BWL' },
];

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

  const isEvaluated = phase === 'EVALUATED' || phase === 'ANSWER';
  const isMCPhase = phase === 'MC_ACTIVE' || phase === 'MC_RESULT';
  const isLoading = phase === 'EVALUATING' || phase === 'MC_LOADING' || isStreaming;

  const handleSend = (text: string) => {
    if (phase === 'QUESTION') {
      setInputText(text);
      setTimeout(() => handleSubmitText(), 0);
    } else {
      handleSendChat(text);
    }
  };

  const quizOptions = scenario.mc.options.map(opt => ({
    id: opt.id,
    text: opt.text,
    isCorrect: opt.correct,
    explanation: opt.explanation,
  }));

  return (
    <div style={SHELL_STYLE}>

      {/* ── Window chrome: traffic lights + scenario tabs ── */}
      <div style={HEADER_STYLE}>
        <div style={TRAFFIC_DOT} />
        <div style={TRAFFIC_DOT} />
        <div style={TRAFFIC_DOT} />
        <div style={TABS_STYLE}>
          {SCENARIO_TABS.map(tab => (
            <button
              key={tab.key}
              style={scenarioKey === tab.key ? TAB_ACTIVE : TAB_BASE}
              onClick={() => setScenarioKey(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Scrollable content area ── */}
      <div style={SCROLL_AREA_STYLE}>

        {/* Tag badge */}
        <span style={TAG_BADGE_STYLE}>
          {scenario.card.tags[0] || scenario.card.deckName}
        </span>

        {/* Card front */}
        <div style={CARD_FRONT_STYLE} dangerouslySetInnerHTML={{ __html: scenario.card.front }} />

        {/* Card back — animated reveal */}
        <AnimatePresence>
          {showBack && (
            <motion.div
              key="card-back"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              style={{ overflow: 'hidden', width: '100%', maxWidth: 600 }}
            >
              <div
                style={{
                  borderTop: '1px solid var(--ds-border-subtle)',
                  paddingTop: 16,
                  fontSize: 14,
                  color: 'var(--ds-text-secondary)',
                  lineHeight: 1.7,
                }}
                dangerouslySetInnerHTML={{ __html: scenario.card.back }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Evaluation feedback */}
        {isEvaluated && evalScore > 0 && (
          <div style={{ width: '100%', maxWidth: 500 }}>
            <ReviewFeedback score={evalScore} />
          </div>
        )}

        {/* MC quiz */}
        {isMCPhase && (
          <div style={{ width: '100%', maxWidth: 500 }}>
            <QuizCard
              question=""
              options={quizOptions}
              onSelect={handleMCSelect}
            />
          </div>
        )}
      </div>

      {/* ── Bottom dock: ChatInput ── */}
      <div style={DOCK_STYLE}>
        <ChatInput
          onSend={handleSend}
          isLoading={isLoading}
          placeholder="Stelle eine Frage..."
          actionPrimary={{
            label: 'Antwort zeigen',
            shortcut: 'SPACE',
            onClick: handleShowAnswer,
            disabled: phase !== 'QUESTION',
          }}
          actionSecondary={{
            label: 'Multiple Choice',
            shortcut: 'ENTER',
            onClick: handleStartMC,
            disabled: phase !== 'QUESTION',
          }}
        />
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────
// DemoShell (public export)
// ───────────────────────────────────────────────

// Error boundary to catch runtime crashes from imported components
class DemoErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(err: Error) {
    return { error: err.message };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--ds-bg-canvas)', borderRadius: 16,
          color: 'var(--ds-text-secondary)', fontSize: 13, padding: 32,
          textAlign: 'center',
        }}>
          Demo konnte nicht geladen werden: {this.state.error}
        </div>
      );
    }
    return this.props.children;
  }
}

export function DemoShell() {
  return (
    <DemoErrorBoundary>
      <DemoProvider>
        <DemoShellInner />
      </DemoProvider>
    </DemoErrorBoundary>
  );
}

export default DemoShell;
