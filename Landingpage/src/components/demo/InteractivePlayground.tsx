import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, Loader2, RefreshCcw } from 'lucide-react';

import { DEMO_SCENARIOS, type DemoScenario } from './DemoData';
import { RealChatMessage } from './RealChatMessage';

// Shared components — identical to the real app
import ChatInput from '@shared/components/ChatInput';
import { QuizCard } from '@shared/components/QuizCard';

// ───────────────────────────────────────────────
// State Machine
// ───────────────────────────────────────────────
type DemoState =
  | 'QUESTION'
  | 'EVALUATING'
  | 'EVALUATED'
  | 'ANSWER'
  | 'MC_LOADING'
  | 'MC_ACTIVE'
  | 'MC_RESULT';

const RATING_COLORS: Record<number, { label: string; color: string; textClass: string }> = {
  1: { label: 'Again', color: '#ff453a', textClass: 'text-red-500' },
  2: { label: 'Hard', color: '#ffd60a', textClass: 'text-yellow-400' },
  3: { label: 'Good', color: '#30d158', textClass: 'text-green-500' },
  4: { label: 'Easy', color: '#0a84ff', textClass: 'text-blue-500' },
};

// ───────────────────────────────────────────────
// Floating Dock Action Row
// ───────────────────────────────────────────────
function DockActions({ left, right }: {
  left?: { label: string; shortcut: string; onClick: () => void; bold?: boolean };
  right?: { label: string; shortcut: string; onClick: () => void };
}) {
  if (!left && !right) return null;

  const btn = (a: NonNullable<typeof left>, position: 'left' | 'right' | 'only') => (
    <button
      type="button"
      onClick={a.onClick}
      className="flex-1 flex items-center justify-center gap-1 h-[44px] bg-transparent border-none cursor-pointer transition-colors duration-100 hover:bg-white/[0.04]"
      style={{
        fontFamily: 'inherit',
        fontSize: '13px',
        fontWeight: a.bold ? '600' : '500',
        color: a.bold ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.35)',
        borderRadius: '0',
        borderBottomLeftRadius: position === 'left' || position === 'only' ? '16px' : '0',
        borderBottomRightRadius: position === 'right' || position === 'only' ? '16px' : '0',
      }}
    >
      {a.label}
      <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '10px', color: 'rgba(255,255,255,0.18)', marginLeft: '4px' }}>
        {a.shortcut}
      </span>
    </button>
  );

  return (
    <div className="flex items-center" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      {left && btn(left, right ? 'left' : 'only')}
      {left && right && (
        <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
      )}
      {right && btn(right, left ? 'right' : 'only')}
    </div>
  );
}

// ───────────────────────────────────────────────
// Main Component
// ───────────────────────────────────────────────
export function InteractivePlayground() {
  const [scenarioKey, setScenarioKey] = useState<string>('medicine');
  const [state, setState] = useState<DemoState>('QUESTION');
  const [chatOpen, setChatOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: string; text: string }>>([]);
  const [chatStreaming, setChatStreaming] = useState(false);
  const [mcResult, setMcResult] = useState<{ correct: boolean; attempts: number } | null>(null);
  const [autoRateEase, setAutoRateEase] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const typingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scenario = DEMO_SCENARIOS[scenarioKey];

  // Auto-scroll chat
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, chatStreaming]);

  // Auto-grow textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [inputText]);

  // Cleanup typing interval
  useEffect(() => {
    return () => {
      if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
    };
  }, []);

  // ─── State transitions ───

  const simulateTyping = useCallback((fullText: string, onComplete: () => void) => {
    let idx = 0;
    setInputText('');
    typingIntervalRef.current = setInterval(() => {
      if (idx < fullText.length) {
        setInputText(fullText.slice(0, idx + 1));
        idx++;
      } else {
        if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
        onComplete();
      }
    }, 25);
  }, []);

  const handleShowAnswer = useCallback(() => {
    if (state !== 'QUESTION') return;
    setShowAnswer(true);
    setAutoRateEase(scenario.timer.ease);
    setState('ANSWER');
  }, [state, scenario]);

  const handleSubmitText = useCallback(() => {
    if (state !== 'QUESTION') return;
    const text = inputText.trim();
    if (!text) return;

    setState('EVALUATING');
    // Simulate AI evaluation
    setTimeout(() => {
      setShowAnswer(true);
      setAutoRateEase(scenario.evaluation.score >= 90 ? 4 : scenario.evaluation.score >= 70 ? 3 : scenario.evaluation.score >= 40 ? 2 : 1);
      setState('EVALUATED');
    }, 1500);
  }, [state, inputText, scenario]);

  const handleStartMC = useCallback(() => {
    if (state !== 'QUESTION') return;
    setState('MC_LOADING');
    setTimeout(() => {
      setState('MC_ACTIVE');
    }, 1200);
  }, [state]);

  const handleMCSelect = useCallback((id: string, isCorrect: boolean) => {
    if (id === 'FLIP') {
      // Quiz completed successfully — show result
      setShowAnswer(true);
      setMcResult({ correct: true, attempts: 1 });
      setAutoRateEase(3);
      setState('MC_RESULT');
      return;
    }
  }, []);

  const handleOpenChat = useCallback(() => {
    setChatOpen(true);
    setChatMessages([]);
  }, []);

  const handleCloseChat = useCallback(() => {
    setChatOpen(false);
  }, []);

  const handleChatSend = useCallback((text: string) => {
    setChatMessages(prev => [...prev, { role: 'user', text }]);
    setChatStreaming(true);
    // Simulate AI response
    setTimeout(() => {
      setChatMessages(prev => [...prev, { role: 'ai', text: scenario.chat.aiResponse }]);
      setChatStreaming(false);
    }, 800);
  }, [scenario]);

  const handleAdvance = useCallback(() => {
    // Next card / reset
    if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
    const keys = Object.keys(DEMO_SCENARIOS);
    const currentIdx = keys.indexOf(scenarioKey);
    const nextKey = keys[(currentIdx + 1) % keys.length];
    setScenarioKey(nextKey);
    setState('QUESTION');
    setShowAnswer(false);
    setChatOpen(false);
    setInputText('');
    setChatMessages([]);
    setMcResult(null);
    setAutoRateEase(0);
    setIsFocused(false);
  }, [scenarioKey]);

  const handleReset = handleAdvance;

  // Demo auto-typing shortcut (for text eval path)
  const handleDemoAutoType = useCallback(() => {
    if (state !== 'QUESTION') return;
    simulateTyping(scenario.evaluation.userTyping, () => {
      setState('EVALUATING');
      setTimeout(() => {
        setShowAnswer(true);
        setAutoRateEase(scenario.evaluation.score >= 90 ? 4 : scenario.evaluation.score >= 70 ? 3 : scenario.evaluation.score >= 40 ? 2 : 1);
        setState('EVALUATED');
      }, 1500);
    });
  }, [state, scenario, simulateTyping]);

  // ─── Keyboard shortcuts ───

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName.toLowerCase();
      if (tag === 'textarea' || tag === 'input') return;

      if (e.key === 'Escape' && chatOpen) {
        e.preventDefault();
        handleCloseChat();
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (state === 'QUESTION') handleShowAnswer();
        else if (state === 'ANSWER' || state === 'EVALUATED' || state === 'MC_RESULT') {
          if (chatOpen) handleAdvance();
          else handleAdvance();
        }
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (state === 'QUESTION') handleStartMC();
        else if ((state === 'ANSWER' || state === 'EVALUATED' || state === 'MC_RESULT') && !chatOpen) {
          handleOpenChat();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [state, chatOpen, handleShowAnswer, handleStartMC, handleAdvance, handleOpenChat, handleCloseChat]);

  // ─── Textarea keyboard ───

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (inputText.trim()) {
        handleSubmitText();
      } else {
        handleStartMC();
      }
    }
  };

  // ─── Dock rendering ───

  const dockVisible = !chatOpen && state !== 'MC_ACTIVE';

  const renderDockContent = () => {
    switch (state) {
      case 'QUESTION':
        return (
          <>
            {/* Textarea + Send */}
            <div className="relative px-4 py-3">
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleTextareaKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="Antwort eingeben..."
                rows={1}
                className="w-full min-h-[24px] max-h-[120px] p-0 pr-10 bg-transparent text-base-content text-[15px] leading-relaxed resize-none outline-none placeholder:text-base-content/25"
                style={{ border: 'none' }}
              />
              <button
                type="button"
                onClick={handleSubmitText}
                className={`absolute right-3 bottom-2.5 w-[30px] h-[30px] rounded-full flex items-center justify-center border-none cursor-pointer transition-all duration-150 ${
                  inputText.trim()
                    ? 'opacity-100 scale-100 bg-primary'
                    : 'opacity-0 scale-75 pointer-events-none bg-primary'
                }`}
              >
                <ArrowUp size={14} strokeWidth={2.5} className="text-white" />
              </button>
            </div>
            <DockActions
              left={{ label: 'Show Answer', shortcut: 'SPACE', onClick: handleShowAnswer, bold: true }}
              right={{ label: 'Multiple Choice', shortcut: '↵', onClick: handleStartMC }}
            />
          </>
        );

      case 'EVALUATING':
      case 'MC_LOADING':
        return (
          <>
            <div className="flex items-center justify-center gap-3 px-4 py-6">
              <Loader2 className="w-4 h-4 animate-spin text-base-content/30" />
              <span className="text-sm text-base-content/40">
                {state === 'MC_LOADING' ? 'Generiere Optionen…' : 'KI bewertet…'}
              </span>
            </div>
          </>
        );

      case 'ANSWER': {
        const rating = RATING_COLORS[autoRateEase] || RATING_COLORS[3];
        return (
          <>
            <div className="px-5 py-4 flex items-center justify-center gap-3">
              <span className="font-mono text-xl font-bold" style={{ color: rating.color }}>
                {scenario.timer.seconds}s
              </span>
              <span className={`text-xs font-semibold uppercase tracking-wide ${rating.textClass}`}>
                {rating.label}
              </span>
            </div>
            <DockActions
              left={{ label: 'Weiter', shortcut: 'SPACE', onClick: handleAdvance, bold: true }}
              right={{ label: 'Nachfragen', shortcut: '↵', onClick: handleOpenChat }}
            />
          </>
        );
      }

      case 'EVALUATED': {
        const evalScore = scenario.evaluation.score;
        const barColor = evalScore >= 90 ? '#30d158' : evalScore >= 60 ? '#ffd60a' : '#ff453a';
        const labelColor = evalScore >= 90 ? 'text-green-500' : evalScore >= 60 ? 'text-yellow-400' : 'text-red-500';
        return (
          <>
            <div className="px-5 py-4">
              {/* Progress bar */}
              <div className="w-full h-[3px] bg-base-content/[0.06] rounded-full overflow-hidden mb-2">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${evalScore}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className="h-full rounded-full"
                  style={{ background: barColor }}
                />
              </div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className={`font-mono text-xl font-bold ${labelColor}`}>{evalScore}%</span>
                <span className={`text-xs font-semibold uppercase tracking-wide ${labelColor}`}>
                  {scenario.evaluation.label}
                </span>
              </div>
              <p className="text-xs text-base-content/55 leading-relaxed">
                {scenario.evaluation.feedback}
              </p>
              {scenario.evaluation.missing && evalScore < 70 && (
                <p className="text-xs text-base-content/40 leading-relaxed mt-1" style={{ borderLeft: '2px solid rgba(255,255,255,0.08)', paddingLeft: '8px' }}>
                  {scenario.evaluation.missing}
                </p>
              )}
            </div>
            <DockActions
              left={{ label: 'Weiter', shortcut: 'SPACE', onClick: handleAdvance, bold: true }}
              right={{ label: 'Nachfragen', shortcut: '↵', onClick: handleOpenChat }}
            />
          </>
        );
      }

      case 'MC_RESULT': {
        const isCorrect = mcResult?.correct ?? false;
        const attempts = mcResult?.attempts ?? 1;
        const ease = autoRateEase;
        const rating = RATING_COLORS[ease] || RATING_COLORS[2];
        const icon = isCorrect ? '✓' : '✗';
        const msg = isCorrect
          ? (attempts === 1 ? 'Beim ersten Versuch richtig!' : 'Beim zweiten Versuch richtig.')
          : 'Nicht richtig.';

        return (
          <>
            <div className="flex items-center justify-center gap-2 px-5 py-4">
              <span className={`text-lg ${rating.textClass}`}>{icon}</span>
              <span className={`text-xs font-semibold uppercase tracking-wide ${rating.textClass}`}>{rating.label}</span>
              <span className="text-xs text-base-content/55">{msg}</span>
            </div>
            <DockActions
              left={{ label: 'Weiter', shortcut: 'SPACE', onClick: handleAdvance, bold: true }}
              right={{ label: 'Nachfragen', shortcut: '↵', onClick: handleOpenChat }}
            />
          </>
        );
      }

      default:
        return null;
    }
  };

  // ─── Render ───

  return (
    <div className="w-full max-w-6xl mx-auto relative" data-theme="dark">
      {/* Blue nebula glow behind widget */}
      <div className="absolute -inset-20 pointer-events-none z-0" style={{
        background: 'radial-gradient(ellipse 60% 40% at 50% 50%, rgba(10,132,255,0.12) 0%, rgba(10,132,255,0.04) 40%, transparent 70%)',
        filter: 'blur(40px)',
      }} />
      <div className="relative z-10 h-[600px] md:h-[750px] bg-[#0F0F0F] rounded-2xl border border-white/[0.08] overflow-hidden">

      {/* ── Top Bar ── */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-5 h-11" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Scenario selector (left) */}
        <div className="flex gap-0 p-[2px] bg-white/[0.04] rounded-md">
          {Object.values(DEMO_SCENARIOS).map((s) => (
            <button
              key={s.id}
              onClick={() => {
                if (scenarioKey === s.id) return;
                if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
                setScenarioKey(s.id);
                setState('QUESTION');
                setShowAnswer(false);
                setChatOpen(false);
                setInputText('');
                setChatMessages([]);
                setMcResult(null);
                setAutoRateEase(0);
                setIsFocused(false);
              }}
              className={`px-2.5 py-[3px] rounded text-[11px] font-medium transition-colors border-none cursor-pointer ${
                scenarioKey === s.id
                  ? 'bg-white/[0.08] text-white/90 font-semibold'
                  : 'bg-transparent text-white/30 hover:text-white/50'
              }`}
            >
              {s.category}
            </button>
          ))}
        </div>
        {/* Center tabs */}
        <div className="flex gap-0 p-[2px] bg-white/[0.04] rounded-md">
          {['Stapel', 'Session', 'Statistik'].map((tab, i) => (
            <span
              key={tab}
              className={`px-3 py-[3px] rounded text-[11px] font-medium transition-colors ${
                i === 1 ? 'bg-white/[0.08] text-white/90' : 'text-white/30'
              }`}
            >
              {tab}
            </span>
          ))}
        </div>
        <div className="flex gap-2 text-[11px] font-mono tabular-nums">
          <span className="text-green-500">4890</span>
          <span className="text-red-500">5</span>
          <span className="text-blue-500">3012</span>
        </div>
      </div>

      {/* ── Card Area ── */}
      <motion.div
        className="absolute top-11 bottom-0 left-0 overflow-y-auto bg-[#1A1A1A]"
        animate={{ width: chatOpen ? '60%' : '100%' }}
        transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      >
        {/* Dot grid background */}
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '24px 24px' }}
        />

        {/* Reset Button */}
        {state !== 'QUESTION' && !chatOpen && (
          <button
            onClick={handleReset}
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/40 text-neutral-500 hover:text-white border border-white/[0.06] hover:border-white/20 transition-all backdrop-blur-md"
            title="Neu starten"
          >
            <RefreshCcw size={14} />
          </button>
        )}

        {/* Card Content */}
        <AnimatePresence mode="wait">
          {state === 'MC_ACTIVE' ? (
            <motion.div
              key="quiz"
              initial={{ opacity: 0, rotateY: -90 }}
              animate={{ opacity: 1, rotateY: 0 }}
              exit={{ opacity: 0, rotateY: 90 }}
              transition={{ duration: 0.5, ease: 'easeInOut' }}
              className="absolute inset-0 pt-4"
              style={{ perspective: '1000px' }}
            >
              <QuizCard
                question=""
                options={scenario.mc.options.map(o => ({ ...o, isCorrect: o.correct }))}
                onSelect={handleMCSelect}
                className="h-full overflow-y-auto px-6"
              />
            </motion.div>
          ) : (
            <motion.div
              key="card"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="flex flex-col items-center pt-16 pb-40 px-8 min-h-full"
            >
              {/* Tags */}
              <div className="flex gap-2 mb-2 opacity-60">
                {scenario.card.tags.map((tag, i) => (
                  <span key={i} className="text-[10px] text-white/40 border border-white/10 rounded px-1.5 py-0.5 uppercase tracking-wider font-medium">
                    {tag}
                  </span>
                ))}
              </div>

              {/* Question */}
              <div
                className={`text-xl md:text-2xl font-medium text-white/90 leading-relaxed text-center max-w-2xl transition-opacity duration-300 ${showAnswer ? 'opacity-50 text-lg' : ''}`}
                dangerouslySetInnerHTML={{ __html: scenario.card.front }}
              />

              {/* Cloze placeholder */}
              {!showAnswer && (
                <div className="mt-6 text-orange-400/60 font-bold text-lg">[...]</div>
              )}

              {/* Answer section */}
              <AnimatePresence>
                {showAnswer && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                    className="mt-8 max-w-2xl w-full"
                  >
                    <div className="w-full h-px bg-white/[0.06] mb-6" />
                    <div
                      className="text-white/80 leading-relaxed text-center [&_h3]:text-lg [&_h3]:mb-3 [&_p]:text-[15px] [&_strong]:text-white"
                      dangerouslySetInnerHTML={{ __html: scenario.card.back }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ── Floating Dock ── */}
      <AnimatePresence>
        {dockVisible && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="absolute z-20 bottom-6 left-0 flex justify-center pointer-events-none"
            style={{ width: chatOpen ? '60%' : '100%' }}
          >
          <div className="w-full max-w-[480px] px-4 pointer-events-auto">
            <div
              className="relative backdrop-blur-xl rounded-2xl overflow-visible transition-all duration-300"
              style={{
                backgroundColor: 'rgba(21,21,21,0.85)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              }}
            >
              {/* Snake border animation */}
              <div
                className="absolute pointer-events-none transition-opacity duration-300"
                style={{
                  inset: '-1px',
                  borderRadius: '17px',
                  padding: '1px',
                  background: 'conic-gradient(from var(--border-angle, 0deg) at 50% 100%, rgba(10,132,255,0.0) 0deg, rgba(10,132,255,0.5) 60deg, rgba(10,132,255,0.1) 120deg, rgba(10,132,255,0.0) 180deg, rgba(10,132,255,0.1) 240deg, rgba(10,132,255,0.5) 300deg, rgba(10,132,255,0.0) 360deg)',
                  WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                  WebkitMaskComposite: 'xor',
                  maskComposite: 'exclude',
                  opacity: isFocused && state === 'QUESTION' ? 1 : 0,
                  animation: 'borderRotate 4s linear infinite',
                }}
              />

              {renderDockContent()}
            </div>
          </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Chat Panel (slide-in from right) ── */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            className="absolute right-0 top-11 bottom-0 w-[40%] bg-[#111111] flex flex-col z-20"
            style={{ borderLeft: '1px solid rgba(255,255,255,0.06)' }}
          >
            {/* Chat Messages */}
            <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-5 space-y-6 pb-4">
              {chatMessages.map((msg, i) => (
                <div key={i}>
                  {msg.role === 'user' ? (
                    <div className="flex justify-end">
                      <div className="bg-[#222] text-neutral-200 px-4 py-3 rounded-2xl rounded-tr-sm max-w-[85%] text-sm leading-relaxed border border-white/[0.06]">
                        {msg.text}
                      </div>
                    </div>
                  ) : (
                    <RealChatMessage message={msg.text} isStreaming={false} citations={[]} />
                  )}
                </div>
              ))}
              {chatStreaming && (
                <div className="flex items-center gap-2 pl-1">
                  <Loader2 className="w-3 h-3 animate-spin text-base-content/30" />
                  <span className="text-[12px] text-base-content/30">Formuliere Antwort…</span>
                </div>
              )}

              {/* Empty state */}
              {chatMessages.length === 0 && !chatStreaming && (
                <div className="h-full flex flex-col items-center justify-center opacity-30">
                  <p className="text-sm text-white/40">Stelle eine Frage zur Karte</p>
                </div>
              )}
            </div>

            {/* Chat Input — uses real shared ChatInput component */}
            <div className="p-3">
              <ChatInput
                onSend={handleChatSend}
                isLoading={chatStreaming}
                onClose={handleCloseChat}
                onOverview={() => handleChatSend(scenario.chat.userQuestion)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </div>
  );
}
