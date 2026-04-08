import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import TouchZone from './TouchZone';

/* ── Layout Constants ── */

const TABS = [
  { id: 'lernen', label: 'Lernen' },
  { id: 'finden', label: 'Finden' },
  { id: 'planen', label: 'Planen' },
];

const MC_LETTERS = ['A', 'B', 'C', 'D', 'E'];

/* ── Static Styles ── */

const SCREEN_STYLE = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  transition: 'background 0.3s ease',
};

const TABS_ROW_STYLE = {
  display: 'flex',
  justifyContent: 'center',
  gap: 6,
  padding: '12px 16px 8px',
};

const TAB_STYLE = {
  padding: '6px 16px',
  borderRadius: 'var(--ds-radius-full, 999px)',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'var(--ds-font-sans)',
  fontSize: 'var(--ds-text-sm)',
  fontWeight: 500,
  transition: 'all 0.2s',
  background: 'transparent',
};

const BOX_OUTER_STYLE = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  margin: 16,
};

const FROSTED_BOX_STYLE = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  borderRadius: 20,
  overflow: 'hidden',
  /* Full ds-frosted material */
  background:
    'linear-gradient(165deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.08) 100%), rgba(28,28,30,0.82)',
  backdropFilter: 'blur(40px) saturate(1.8)',
  WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
  border: '1px solid rgba(255,255,255,0.12)',
  boxShadow:
    'inset 0 1px 0 0 rgba(255,255,255,0.28), inset 1px 0 0 0 rgba(255,255,255,0.12), inset 0 -1px 0 0 rgba(0,0,0,0.06), inset -1px 0 0 0 rgba(0,0,0,0.04), 0 4px 24px rgba(0,0,0,0.25)',
};

const CONTENT_AREA_STYLE = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  position: 'relative',
};

const SPLIT_ROW_STYLE = {
  display: 'flex',
  alignItems: 'center',
  borderTop: '1px solid var(--ds-border-subtle)',
  flexShrink: 0,
};

const SPLIT_BTN_BASE = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  height: 60,
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'var(--ds-font-sans)',
  fontSize: 'var(--ds-text-base)',
  padding: '0 12px',
  transition: 'background 0.15s ease',
};

const SPLIT_DIVIDER_STYLE = {
  width: 1,
  height: 20,
  background: 'var(--ds-border-subtle)',
  flexShrink: 0,
};

const KBD_STYLE = {
  fontFamily: 'var(--ds-font-mono)',
  fontSize: 10,
  color: 'var(--ds-text-muted)',
  marginLeft: 4,
};

const STARS_STYLE = {
  fontSize: 28,
  letterSpacing: 4,
  marginBottom: 16,
};

const MC_CHIPS_ROW = {
  display: 'flex',
  gap: 10,
  flexWrap: 'wrap',
  justifyContent: 'center',
};

const MC_CHIP_BASE = {
  width: 48,
  height: 48,
  borderRadius: 14,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid var(--ds-border-medium)',
  background: 'transparent',
  cursor: 'pointer',
  fontFamily: 'var(--ds-font-mono)',
  fontSize: 'var(--ds-text-lg)',
  fontWeight: 600,
  transition: 'all 0.15s ease',
};

const BIG_VALUE_STYLE = {
  fontFamily: 'var(--ds-font-mono)',
  fontSize: 42,
  fontWeight: 600,
  lineHeight: 1,
};

const LABEL_STYLE = {
  fontFamily: 'var(--ds-font-sans)',
  fontSize: 'var(--ds-text-md)',
  marginTop: 8,
};

const TEXTAREA_STYLE = {
  flex: 1,
  width: '100%',
  background: 'transparent',
  border: 'none',
  outline: 'none',
  resize: 'none',
  color: 'var(--ds-text-primary)',
  fontFamily: 'var(--ds-font-sans)',
  fontSize: 16,
  padding: 20,
  boxSizing: 'border-box',
};

const SEND_BTN_STYLE = {
  position: 'absolute',
  bottom: 16,
  right: 16,
  width: 32,
  height: 32,
  borderRadius: '50%',
  background: 'var(--ds-accent)',
  border: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  transition: 'opacity 0.15s, transform 0.15s',
};

const SCORE_BAR_BG = {
  width: '80%',
  height: 3,
  borderRadius: 2,
  background: 'var(--ds-border-subtle)',
  marginBottom: 16,
  overflow: 'hidden',
};

const CONTENT_FADE = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.2 },
};

/* ── Rating Helpers ── */

const RATING_MAP = {
  1: { label: 'Again', color: 'var(--ds-red)' },
  2: { label: 'Hard', color: 'var(--ds-yellow)' },
  3: { label: 'Good', color: 'var(--ds-green)' },
  4: { label: 'Easy', color: 'var(--ds-accent)' },
};

const getTimerRating = (seconds) => {
  if (seconds <= 3) return { ease: 4, ...RATING_MAP[4] };
  if (seconds <= 8) return { ease: 3, ...RATING_MAP[3] };
  if (seconds <= 15) return { ease: 2, ...RATING_MAP[2] };
  return { ease: 1, ...RATING_MAP[1] };
};

/* ── Sub-Components ── */

const SplitButtons = React.memo(({ leftLabel, leftKbd, rightLabel, rightKbd, onLeft, onRight }) => (
  <div style={SPLIT_ROW_STYLE}>
    <motion.button
      style={{ ...SPLIT_BTN_BASE, fontWeight: 600, color: 'var(--ds-text-primary)' }}
      whileTap={{ scale: 0.97 }}
      onClick={onLeft}
    >
      {leftLabel}
      <span style={KBD_STYLE}>{leftKbd}</span>
    </motion.button>
    <div style={SPLIT_DIVIDER_STYLE} />
    <motion.button
      style={{ ...SPLIT_BTN_BASE, fontWeight: 500, color: 'var(--ds-text-secondary)' }}
      whileTap={{ scale: 0.97 }}
      onClick={onRight}
    >
      {rightLabel}
      <span style={KBD_STYLE}>{rightKbd}</span>
    </motion.button>
  </div>
));

const QuestionContent = React.memo(() => (
  <span style={{ color: 'var(--ds-text-tertiary)', fontSize: 'var(--ds-text-lg)' }}>
    Karte bereit
  </span>
));

const TimerContent = React.memo(({ seconds }) => {
  const rating = getTimerRating(seconds);
  return (
    <>
      <span style={{ ...BIG_VALUE_STYLE, color: rating.color }}>
        {seconds}s
      </span>
      <span style={{ ...LABEL_STYLE, color: 'var(--ds-text-secondary)' }}>
        {'→ '}{rating.label}
      </span>
    </>
  );
});

const ScoreContent = React.memo(({ score }) => {
  const pct = Math.round(score * 100);
  const color = pct >= 70 ? 'var(--ds-green)' : pct >= 40 ? 'var(--ds-yellow)' : 'var(--ds-red)';
  const label = pct >= 70 ? 'Good' : pct >= 40 ? 'Hard' : 'Again';
  return (
    <>
      <div style={SCORE_BAR_BG}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: color }} />
      </div>
      <span style={{ ...BIG_VALUE_STYLE, color }}>{pct}%</span>
      <span style={{ ...LABEL_STYLE, color: 'var(--ds-text-secondary)' }}>{label}</span>
    </>
  );
});

const MCContent = React.memo(({ mcOptions, selectedIndex, onSelect }) => {
  const count = mcOptions ? mcOptions.length : 5;
  const letters = MC_LETTERS.slice(0, count);

  return (
    <>
      <div style={STARS_STYLE}>
        <span style={{ color: 'var(--ds-yellow)' }}>{'★'.repeat(3)}</span>
      </div>
      <div style={MC_CHIPS_ROW}>
        {letters.map((letter, i) => {
          const isSelected = selectedIndex === i;
          return (
            <motion.button
              key={letter}
              style={{
                ...MC_CHIP_BASE,
                color: isSelected ? 'var(--ds-accent)' : 'var(--ds-text-secondary)',
                borderColor: isSelected ? 'var(--ds-accent)' : 'var(--ds-border-medium)',
                background: isSelected ? 'var(--ds-accent-10)' : 'transparent',
              }}
              whileTap={{ scale: 0.92 }}
              onClick={() => onSelect(i)}
            >
              {letter}
            </motion.button>
          );
        })}
      </div>
    </>
  );
});

const StarsContent = React.memo(({ starsResult }) => {
  const filled = starsResult?.stars ?? 2;
  const total = 3;
  const rating = RATING_MAP[filled === 3 ? 3 : filled === 2 ? 2 : 1] || RATING_MAP[2];
  return (
    <>
      <div style={STARS_STYLE}>
        <span style={{ color: 'var(--ds-yellow)' }}>{'★'.repeat(filled)}</span>
        <span style={{ color: 'var(--ds-text-muted)' }}>{'★'.repeat(total - filled)}</span>
      </div>
      <span style={{ ...LABEL_STYLE, color: rating.color }}>
        {'→ '}{rating.label}
      </span>
    </>
  );
});

const ChatContent = React.memo(({ chatText, onTextChange }) => {
  const textareaRef = useRef(null);
  useEffect(() => {
    if (textareaRef.current) textareaRef.current.focus();
  }, []);

  const hasText = chatText.length > 0;

  return (
    <div style={{ flex: 1, width: '100%', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <textarea
        ref={textareaRef}
        style={TEXTAREA_STYLE}
        placeholder="Nachfrage stellen..."
        value={chatText}
        onChange={(e) => onTextChange(e.target.value)}
      />
      <button
        style={{
          ...SEND_BTN_STYLE,
          opacity: hasText ? 1 : 0,
          transform: hasText ? 'scale(1)' : 'scale(0.7)',
          pointerEvents: hasText ? 'auto' : 'none',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      </button>
    </div>
  );
});

/* ── Main RemoteDock Component ── */

const RemoteDock = ({ phase, card, mcOptions, progress, send }) => {
  const [activeTab, setActiveTab] = useState('lernen');
  const [dockPhase, setDockPhase] = useState('question');
  const [chatText, setChatText] = useState('');
  const [selectedMC, setSelectedMC] = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [starsResult, setStarsResult] = useState(null);
  const [scoreData, setScoreData] = useState(null);
  const timerRef = useRef(null);
  const flipTimeRef = useRef(null);

  /* ── Map external phase to dock phase ── */
  useEffect(() => {
    if (phase === 'idle') {
      setDockPhase('idle');
      return;
    }
    if (phase === 'question') {
      if (mcOptions && mcOptions.length > 0) {
        setDockPhase('mc');
        setSelectedMC(null);
      } else {
        setDockPhase('question');
      }
      setTimerSeconds(0);
      setStarsResult(null);
      setScoreData(null);
      setChatText('');
      if (timerRef.current) clearInterval(timerRef.current);
    } else if (phase === 'answer') {
      /* Start timer on flip */
      if (dockPhase !== 'chat') {
        flipTimeRef.current = Date.now();
        setTimerSeconds(0);
        setDockPhase('timer');
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
          setTimerSeconds(Math.floor((Date.now() - flipTimeRef.current) / 1000));
        }, 1000);
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase, mcOptions]);

  /* ── Tab switching ── */
  const handleTabChange = useCallback((tabId) => {
    setActiveTab(tabId);
    send({ type: 'switch_tab', tab: tabId });
  }, [send]);

  /* ── Actions ── */
  const handleFlip = useCallback(() => {
    send({ type: 'flip' });
  }, [send]);

  const handleRate = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    const seconds = timerSeconds;
    const rating = getTimerRating(seconds);
    send({ type: 'rate', ease: rating.ease });
  }, [send, timerSeconds]);

  const handleMCSelect = useCallback((index) => {
    if (selectedMC !== null) return;
    setSelectedMC(index);
    if (mcOptions && mcOptions[index]) {
      send({ type: 'mc_select', option_id: mcOptions[index].id });
    }
  }, [send, mcOptions, selectedMC]);

  const handleResolve = useCallback(() => {
    /* Resolve MC: auto-rate based on stars */
    setDockPhase('stars');
    setStarsResult({ stars: selectedMC === 0 ? 3 : 2 }); /* simplified */
    setTimeout(() => {
      send({ type: 'rate', ease: 3 });
    }, 1500);
  }, [send, selectedMC]);

  const handleChatEnter = useCallback(() => {
    setDockPhase('chat');
    setChatText('');
  }, []);

  const handleChatBack = useCallback(() => {
    if (phase === 'answer') {
      setDockPhase('timer');
    } else if (mcOptions) {
      setDockPhase('mc');
    } else {
      setDockPhase('question');
    }
    setChatText('');
  }, [phase, mcOptions]);

  const handleChatSend = useCallback(() => {
    if (!chatText.trim()) return;
    send({ type: 'chat_message', text: chatText.trim() });
    setChatText('');
    handleChatBack();
  }, [send, chatText, handleChatBack]);

  /* ── Background color based on tab ── */
  const bgColor = activeTab === 'lernen' ? 'var(--ds-bg-deep)' : 'var(--ds-bg-canvas)';

  /* ── Render content based on dockPhase ── */
  const renderContent = () => {
    switch (dockPhase) {
      case 'question':
        return <QuestionContent />;
      case 'timer':
        return <TimerContent seconds={timerSeconds} />;
      case 'score':
        return <ScoreContent score={scoreData?.score ?? 0.73} />;
      case 'mc':
        return <MCContent mcOptions={mcOptions} selectedIndex={selectedMC} onSelect={handleMCSelect} />;
      case 'stars':
        return <StarsContent starsResult={starsResult} />;
      case 'chat':
        return <ChatContent chatText={chatText} onTextChange={setChatText} />;
      case 'idle':
        return (
          <span style={{ color: 'var(--ds-text-tertiary)', fontSize: 'var(--ds-text-lg)' }}>
            Verbunden — starte eine Session
          </span>
        );
      default:
        return <QuestionContent />;
    }
  };

  /* ── Render split buttons based on dockPhase ── */
  const renderButtons = () => {
    switch (dockPhase) {
      case 'question':
        return (
          <SplitButtons
            leftLabel="Antwort" leftKbd="SPACE"
            rightLabel="MC" rightKbd="↵"
            onLeft={handleFlip}
            onRight={() => send({ type: 'request_mc' })}
          />
        );
      case 'timer':
      case 'score':
      case 'stars':
        return (
          <SplitButtons
            leftLabel="Weiter" leftKbd="SPACE"
            rightLabel="Nachfragen" rightKbd="↵"
            onLeft={handleRate}
            onRight={handleChatEnter}
          />
        );
      case 'mc':
        return (
          <SplitButtons
            leftLabel="Aufl\u00F6sen" leftKbd="SPACE"
            rightLabel="Nachfragen" rightKbd="↵"
            onLeft={handleResolve}
            onRight={handleChatEnter}
          />
        );
      case 'chat':
        return (
          <SplitButtons
            leftLabel="Zur\u00FCck" leftKbd="ESC"
            rightLabel="Senden" rightKbd="↵"
            onLeft={handleChatBack}
            onRight={handleChatSend}
          />
        );
      case 'idle':
        return null;
      default:
        return null;
    }
  };

  return (
    <div style={{ ...SCREEN_STYLE, background: bgColor }}>
      {/* Zone 1: Anki Tabs */}
      <div style={TABS_ROW_STYLE}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            style={{
              ...TAB_STYLE,
              color: activeTab === tab.id ? 'var(--ds-text-primary)' : 'var(--ds-text-tertiary)',
              background: activeTab === tab.id ? 'var(--ds-active-tint)' : 'transparent',
            }}
            onClick={() => handleTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Zone 2: Frosted Box */}
      <div style={BOX_OUTER_STYLE}>
        <div style={FROSTED_BOX_STYLE}>
          <div style={dockPhase === 'chat' ? { flex: 1, display: 'flex', flexDirection: 'column' } : CONTENT_AREA_STYLE}>
            <AnimatePresence mode="wait">
              <motion.div
                key={dockPhase}
                {...CONTENT_FADE}
                style={dockPhase === 'chat'
                  ? { flex: 1, display: 'flex', flexDirection: 'column' }
                  : { display: 'flex', flexDirection: 'column', alignItems: 'center' }
                }
              >
                {renderContent()}
              </motion.div>
            </AnimatePresence>
          </div>
          {renderButtons()}
        </div>
      </div>

      {/* Zone 3: Touch Zone */}
      <TouchZone />
    </div>
  );
};

export default React.memo(RemoteDock);
