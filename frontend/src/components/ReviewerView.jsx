import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * ReviewerView — Card reviewer as a React component.
 *
 * Replaces the custom_reviewer HTML/CSS/JS with a single React component
 * that renders Anki cards in FLIP, MC, and TEXT answer modes.
 *
 * Card HTML comes from Anki's internal card renderer — trusted content
 * from the user's own card templates, not user-generated web input.
 *
 * States: question | answer | evaluating | evaluated | mc_loading | mc_active | mc_result
 */

const RATING_META = [
  { ease: 1, label: 'Again', cssColor: 'var(--ds-rate-again)' },
  { ease: 2, label: 'Hard',  cssColor: 'var(--ds-rate-hard)' },
  { ease: 3, label: 'Good',  cssColor: 'var(--ds-rate-good)' },
  { ease: 4, label: 'Easy',  cssColor: 'var(--ds-rate-easy)' },
];

function ratingForTime(seconds, questionLen) {
  const bonus = Math.floor(questionLen / 50);
  const goodThreshold = Math.min(6 + bonus, 20);
  const hardThreshold = Math.min(15 + bonus * 2, 45);
  if (seconds <= goodThreshold) return 3; // Good
  if (seconds <= hardThreshold) return 2; // Hard
  return 1; // Again
}

function ratingForScore(score) {
  if (score >= 90) return 4;
  if (score >= 70) return 3;
  if (score >= 40) return 2;
  return 1;
}

function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, '');
}

/* ─── Sub-components ──────────────────────────────────── */

function DockButton({ label, shortcut, onClick, primary, color }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 6, padding: '11px 16px',
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: color || (primary ? 'var(--ds-text-primary)' : 'var(--ds-text-tertiary)'),
        fontSize: 13, fontWeight: primary ? 600 : 500,
        fontFamily: 'var(--ds-font-sans)', whiteSpace: 'nowrap',
        transition: 'color 0.15s ease',
      }}
    >
      {label}
      <span className="ds-kbd" style={{ marginLeft: 4 }}>{shortcut}</span>
    </button>
  );
}

function DockDivider() {
  return (
    <div style={{
      width: 1, height: 16, background: 'var(--ds-border-subtle)', flexShrink: 0,
    }} />
  );
}

function Stars({ count, total = 3, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 4, padding: '4px 0' }}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} style={{
          fontSize: 18,
          opacity: i < count ? 1 : 0.2,
          color: color || 'var(--ds-text-muted)',
        }}>&#9733;</span>
      ))}
    </div>
  );
}

function ThoughtStreamMini({ steps }) {
  if (!steps || steps.length === 0) {
    return (
      <div style={{
        padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ color: 'var(--ds-text-tertiary)', fontSize: 13 }}>
          Wird geladen<span className="reviewer-dots" />
        </span>
      </div>
    );
  }
  const last = steps[steps.length - 1];
  return (
    <div style={{ padding: '12px 16px' }}>
      <div className="ds-thought-step ds-thought-active">
        <span className="ds-thought-text">{last.label || last.phase}</span>
      </div>
    </div>
  );
}

/* ─── Main Component ──────────────────────────────────── */

export default function ReviewerView({
  cardData,
  reviewState,
  mcOptions,
  evaluationResult,
  aiSteps,
  onFlip,
  onRate,
  onRequestMC,
  onSubmitAnswer,
  onAdvance,
  onOpenChat,
}) {
  // Internal state
  const [selectedRating, setSelectedRating] = useState(3);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [textAnswer, setTextAnswer] = useState('');
  const [mcAttempts, setMcAttempts] = useState(0);
  const [mcSelectedOptions, setMcSelectedOptions] = useState([]);
  const [mcCorrectFound, setMcCorrectFound] = useState(false);

  const timerRef = useRef(null);
  const textareaRef = useRef(null);

  // ── Reset on new card ──
  useEffect(() => {
    if (cardData?.isQuestion) {
      setSelectedRating(3);
      setElapsedSeconds(0);
      setTextAnswer('');
      setMcAttempts(0);
      setMcSelectedOptions([]);
      setMcCorrectFound(false);
    }
  }, [cardData?.cardId, cardData?.isQuestion]);

  // ── Timer when answer is shown ──
  useEffect(() => {
    if (reviewState === 'answer') {
      const start = Date.now();
      const questionLen = stripHtml(cardData?.frontHtml).length;

      const tick = () => {
        const sec = Math.floor((Date.now() - start) / 1000);
        setElapsedSeconds(sec);
        setSelectedRating(ratingForTime(sec, questionLen));
      };
      tick();
      timerRef.current = setInterval(tick, 1000);
      return () => clearInterval(timerRef.current);
    }
  }, [reviewState, cardData?.frontHtml]);

  // ── Auto-rating from evaluation score ──
  useEffect(() => {
    if (reviewState === 'evaluated' && evaluationResult) {
      setSelectedRating(ratingForScore(evaluationResult.score));
    }
  }, [reviewState, evaluationResult]);

  // ── MC select handler ──
  const handleMCSelect = useCallback((index) => {
    if (mcCorrectFound || !mcOptions) return;
    setMcSelectedOptions((prev) => [...prev, index]);

    if (mcOptions[index].correct) {
      setMcCorrectFound(true);
      const ease = mcAttempts === 0 ? 3 : mcAttempts === 1 ? 2 : 1;
      setSelectedRating(ease);
    } else {
      setMcAttempts((prev) => {
        const next = prev + 1;
        if (next >= 3) {
          setMcCorrectFound(true);
          setSelectedRating(1);
        }
        return next;
      });
    }
  }, [mcOptions, mcAttempts, mcCorrectFound]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;

      if (e.key === ' ') {
        e.preventDefault();
        if (reviewState === 'question') onFlip?.();
        else if (reviewState === 'answer') onRate?.(selectedRating);
        else if (reviewState === 'evaluated' || reviewState === 'mc_result') onAdvance?.();
        else if (reviewState === 'mc_active' && !mcCorrectFound) {
          setMcCorrectFound(true);
          setSelectedRating(1);
        }
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (reviewState === 'question') {
          onRequestMC?.({
            question: stripHtml(cardData?.frontHtml),
            correctAnswer: stripHtml(cardData?.backHtml),
            cardId: cardData?.cardId,
          });
        } else if (['answer', 'evaluated', 'mc_result'].includes(reviewState)) {
          onOpenChat?.();
        }
      }

      if (reviewState === 'answer' && ['1', '2', '3', '4'].includes(e.key)) {
        setSelectedRating(parseInt(e.key));
      }

      if (reviewState === 'mc_active' && !mcCorrectFound) {
        const letterMap = { a: 0, b: 1, c: 2, d: 3 };
        const numMap = { '1': 0, '2': 1, '3': 2, '4': 3 };
        const idx = letterMap[e.key.toLowerCase()] ?? numMap[e.key];
        if (idx !== undefined && mcOptions && idx < mcOptions.length) {
          handleMCSelect(idx);
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [reviewState, selectedRating, mcCorrectFound, mcOptions, cardData,
      onFlip, onRate, onAdvance, onRequestMC, onOpenChat, handleMCSelect]);

  // ── Derived values ──
  const ratingMeta = RATING_META.find((r) => r.ease === selectedRating) || RATING_META[2];
  const showBack = reviewState !== 'question' && reviewState !== 'mc_loading' && reviewState !== 'evaluating';
  const starsCount = Math.max(0, 3 - mcAttempts);
  const starsColor = mcCorrectFound
    ? (mcAttempts === 0 ? 'var(--ds-green)' : mcAttempts === 1 ? 'var(--ds-yellow)' : 'var(--ds-red)')
    : 'var(--ds-text-muted)';

  // ── Render ──
  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: 'var(--ds-bg-canvas)', overflow: 'hidden',
      fontFamily: 'var(--ds-font-sans)', color: 'var(--ds-text-primary)',
    }}>

      {/* 1. Card Content Area */}
      <div style={{
        flex: 1, overflowY: 'auto', overflowX: 'hidden',
        padding: '40px 24px', paddingBottom: 200,
        scrollbarWidth: 'none',
      }}>
        <div style={{ maxWidth: 720, width: '100%', margin: '0 auto' }}>
          {/* Card front — trusted Anki card template output */}
          <div
            className="card-front"
            style={{ background: 'transparent' }}
            dangerouslySetInnerHTML={{ __html: cardData?.frontHtml || '' }}
          />

          {/* Divider + Card back — trusted Anki card template output */}
          {showBack && cardData?.backHtml && (
            <div style={{ marginTop: 24, animation: 'reviewerFadeUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>
              <div style={{
                height: 1, margin: '28px 0',
                background: 'linear-gradient(90deg, transparent, var(--ds-border-medium) 20%, var(--ds-border-medium) 80%, transparent)',
              }} />
              <div
                className="card-back"
                style={{
                  opacity: (reviewState === 'evaluated' || reviewState === 'mc_result') ? 0.5 : 1,
                }}
                dangerouslySetInnerHTML={{ __html: cardData.backHtml }}
              />
            </div>
          )}
        </div>
      </div>

      {/* 2. Results / MC area (above dock) */}

      {/* Evaluation result */}
      {reviewState === 'evaluated' && evaluationResult && (
        <div style={{ padding: '0 24px 16px', maxWidth: 720, margin: '0 auto', width: '100%' }}>
          <div style={{
            height: 3, borderRadius: 2, background: 'var(--ds-hover-tint)',
            overflow: 'hidden', marginBottom: 10,
          }}>
            <div style={{
              height: '100%', borderRadius: 2,
              width: `${evaluationResult.score}%`,
              background: ratingMeta.cssColor,
              transition: 'width 500ms cubic-bezier(0.16, 1, 0.3, 1)',
            }} />
          </div>
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4,
          }}>
            <span style={{
              fontSize: 20, fontWeight: 700, fontFamily: 'var(--ds-font-mono)',
              letterSpacing: '-0.03em', color: ratingMeta.cssColor,
            }}>
              {evaluationResult.score}%
            </span>
            <span style={{
              fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.05em', color: ratingMeta.cssColor,
            }}>
              {ratingMeta.label}
            </span>
          </div>
          {evaluationResult.feedback && (
            <div style={{
              borderLeft: `2px solid ${ratingMeta.cssColor}`,
              padding: '5px 10px', borderRadius: '0 4px 4px 0',
              color: 'var(--ds-text-secondary)', fontSize: 12, lineHeight: 1.5,
            }}>
              {evaluationResult.feedback}
              {evaluationResult.missing && evaluationResult.score < 70 ? ' ' + evaluationResult.missing : ''}
            </div>
          )}
        </div>
      )}

      {/* MC options */}
      {reviewState === 'mc_active' && mcOptions && (
        <div style={{ padding: '0 24px 12px', maxWidth: 720, margin: '0 auto', width: '100%' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {mcOptions.map((opt, i) => {
              const letter = String.fromCharCode(65 + i);
              const isSelected = mcSelectedOptions.includes(i);
              const isCorrect = opt.correct;

              return (
                <button
                  key={i}
                  onClick={() => handleMCSelect(i)}
                  disabled={mcCorrectFound}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 9,
                    border: '1px solid var(--ds-border-subtle)',
                    background: isSelected
                      ? (isCorrect ? 'var(--ds-green-tint)' : 'var(--ds-red-tint)')
                      : 'transparent',
                    cursor: mcCorrectFound ? 'default' : 'pointer',
                    color: isSelected
                      ? (isCorrect ? 'var(--ds-green)' : 'var(--ds-red)')
                      : 'var(--ds-text-primary)',
                    textAlign: 'left', fontFamily: 'var(--ds-font-sans)',
                    fontSize: 15, textDecoration: (isSelected && !isCorrect) ? 'line-through' : 'none',
                    opacity: (isSelected && !isCorrect) ? 0.35 : 1,
                    transition: 'background 0.12s ease, color 0.12s ease',
                  }}
                >
                  <span style={{
                    width: 24, height: 24, borderRadius: '50%', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 600, flexShrink: 0,
                    border: isSelected ? 'none' : '1px solid var(--ds-border-medium)',
                    background: isSelected
                      ? (isCorrect ? 'var(--ds-green)' : 'var(--ds-red)')
                      : 'transparent',
                    color: isSelected ? '#fff' : 'var(--ds-text-tertiary)',
                  }}>
                    {isSelected ? (isCorrect ? '\u2713' : '\u2717') : letter}
                  </span>
                  <span style={{ flex: 1 }}>{opt.text}</span>
                </button>
              );
            })}
          </div>
          <Stars count={starsCount} color={starsColor} />
        </div>
      )}

      {/* MC result (after correct found) */}
      {reviewState === 'mc_result' && (
        <div style={{ padding: '0 24px 12px', maxWidth: 720, margin: '0 auto', width: '100%' }}>
          <Stars count={starsCount} color={starsColor} />
          <div style={{
            textAlign: 'center', fontSize: 11, fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.05em',
            color: ratingMeta.cssColor, marginTop: 4,
          }}>
            {ratingMeta.label}
          </div>
        </div>
      )}

      {/* 3. Dock (fixed bottom) */}
      <div style={{
        position: 'sticky', bottom: 0,
        padding: '0 20px 24px', zIndex: 100,
        display: 'flex', justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        <div className="ds-input-dock" style={{
          maxWidth: 520, width: '100%', pointerEvents: 'auto',
        }}>

          {/* QUESTION dock */}
          {reviewState === 'question' && (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <DockButton
                label="Show Answer" shortcut="SPACE"
                onClick={onFlip} primary
              />
              <DockDivider />
              <DockButton
                label="Multiple Choice" shortcut="&#8629;"
                onClick={() => onRequestMC?.({
                  question: stripHtml(cardData?.frontHtml),
                  correctAnswer: stripHtml(cardData?.backHtml),
                  cardId: cardData?.cardId,
                })}
              />
            </div>
          )}

          {/* ANSWER dock — timer + rating */}
          {reviewState === 'answer' && (
            <>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 8, padding: '10px 16px',
              }}>
                <span style={{
                  fontFamily: 'var(--ds-font-mono)', fontSize: 18, fontWeight: 700,
                  color: ratingMeta.cssColor,
                }}>
                  {elapsedSeconds}s
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                  letterSpacing: '0.05em', color: ratingMeta.cssColor,
                }}>
                  {ratingMeta.label}
                </span>
              </div>
              <div style={{
                display: 'flex', alignItems: 'center',
                borderTop: '1px solid var(--ds-border-subtle)',
              }}>
                <DockButton
                  label="Weiter" shortcut="SPACE"
                  onClick={() => onRate?.(selectedRating)} primary
                />
                <DockDivider />
                <DockButton
                  label="Nachfragen" shortcut="&#8629;"
                  onClick={onOpenChat}
                />
              </div>
            </>
          )}

          {/* MC_LOADING / EVALUATING dock */}
          {(reviewState === 'mc_loading' || reviewState === 'evaluating') && (
            <ThoughtStreamMini steps={aiSteps} />
          )}

          {/* MC_ACTIVE dock */}
          {reviewState === 'mc_active' && (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <DockButton
                label="Aufl\u00f6sen" shortcut="SPACE"
                onClick={() => { setMcCorrectFound(true); setSelectedRating(1); }}
                primary
              />
              <DockDivider />
              <DockButton
                label="Nachfragen" shortcut="&#8629;"
                onClick={onOpenChat}
              />
            </div>
          )}

          {/* EVALUATED / MC_RESULT dock */}
          {(reviewState === 'evaluated' || reviewState === 'mc_result') && (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <DockButton
                label="Weiter" shortcut="SPACE"
                onClick={() => onAdvance?.()}
                primary
              />
              <DockDivider />
              <DockButton
                label="Nachfragen" shortcut="&#8629;"
                onClick={onOpenChat}
              />
            </div>
          )}
        </div>
      </div>

      {/* Scoped keyframe + dots animations */}
      <style>{`
        @keyframes reviewerFadeUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .reviewer-dots::after {
          content: '';
          animation: reviewerDots 1.5s steps(4) infinite;
        }
        @keyframes reviewerDots {
          0%  { content: ''; }
          25% { content: '.'; }
          50% { content: '..'; }
          75% { content: '...'; }
        }
      `}</style>
    </div>
  );
}
