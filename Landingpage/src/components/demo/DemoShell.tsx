import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DemoProvider, useDemoContext } from './DemoContext';
import { useDemoBridgeStub } from './demoAdapters';
import ChatInput from '@frontend/components/ChatInput';
import ReviewFeedback from '@frontend/components/ReviewFeedback';
import { QuizCard } from '@shared/components/QuizCard';
import ReasoningStream from '@frontend/reasoning/ReasoningStream';
import SourcesCarousel from '@frontend/components/SourcesCarousel';
import AgenticCell from '@frontend/components/AgenticCell';

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
    chatMessages,
    handleShowAnswer,
    handleSubmitText,
    handleStartMC,
    handleMCSelect,
    handleSendChat,
    setInputText,
  } = useDemoContext();

  // ─── Transform DemoData reasoningSteps → ReasoningStep[] format ───
  const reasoningStepsForStream = useMemo(() => {
    return (scenario.reasoningSteps || []).map(s => ({
      step: s.id,
      status: s.status as 'active' | 'done' | 'error',
      data: { label: s.label, detail: s.detail || '' },
      timestamp: Date.now(),
    }));
  }, [scenario.reasoningSteps]);

  // ─── Transform DemoData sources array → citations Record format ───
  const citationsRecord = useMemo(() => {
    const result: Record<string, any> = {};
    (scenario.sources || []).forEach((src, idx) => {
      const key = String(src.cardId);
      result[key] = {
        id: key,
        cardId: src.cardId,
        noteId: src.cardId,
        front: src.front,
        deckName: src.deckName,
        matchType: src.matchType,
        score: src.score,
        sources: src.matchType === 'both' ? [{ type: 'keyword' }, { type: 'semantic' }] : [{ type: src.matchType }],
        index: idx + 1,
      };
    });
    return result;
  }, [scenario.sources]);

  const citationIndices = useMemo(() => {
    const result: Record<string, number> = {};
    (scenario.sources || []).forEach((src, idx) => {
      result[String(src.cardId)] = idx + 1;
    });
    return result;
  }, [scenario.sources]);

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

        {/* ReasoningStream — shown during EVALUATING (streaming) and EVALUATED (done) */}
        {(phase === 'EVALUATING' || phase === 'EVALUATED') && reasoningStepsForStream.length > 0 && (
          <div style={{ padding: '4px 0 0' }}>
            <ReasoningStream
              steps={reasoningStepsForStream}
              pipelineGeneration={1}
              isStreaming={phase === 'EVALUATING'}
              message=""
              variant="agent"
            />
          </div>
        )}

        {/* Evaluation feedback */}
        {isEvaluated && evalScore > 0 && (
          <ReviewFeedback score={evalScore} />
        )}

        {/* SourcesCarousel — shown when EVALUATED and sources exist */}
        {phase === 'EVALUATED' && Object.keys(citationsRecord).length > 0 && (
          <SourcesCarousel
            citations={citationsRecord}
            citationIndices={citationIndices}
            onPreviewCard={() => {}}
          />
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

      {/* Chat messages — AI responses wrapped in AgenticCell */}
      {chatMessages.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {chatMessages.map((msg, idx) =>
            msg.role === 'ai' ? (
              <AgenticCell key={idx} agentName="tutor" isLoading={isStreaming && idx === chatMessages.length - 1}>
                <div style={{ fontSize: 14, color: 'var(--ds-text-primary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {msg.text}
                </div>
              </AgenticCell>
            ) : (
              <div
                key={idx}
                style={{
                  alignSelf: 'flex-end',
                  background: 'var(--ds-accent-10)',
                  borderRadius: 12,
                  padding: '8px 14px',
                  fontSize: 14,
                  color: 'var(--ds-text-primary)',
                  maxWidth: '85%',
                }}
              >
                {msg.text}
              </div>
            )
          )}
        </div>
      )}

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
