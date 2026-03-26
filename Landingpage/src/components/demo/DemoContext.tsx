import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from 'react';
import { DEMO_SCENARIOS, type DemoScenario } from './DemoData';

// ───────────────────────────────────────────────
// State Machine
// ───────────────────────────────────────────────

export type DemoPhase =
  | 'QUESTION'
  | 'TYPING'
  | 'EVALUATING'
  | 'EVALUATED'
  | 'ANSWER'
  | 'MC_LOADING'
  | 'MC_ACTIVE'
  | 'MC_RESULT'
  | 'CHAT';

// ───────────────────────────────────────────────
// Bridge
// ───────────────────────────────────────────────

export interface DemoBridge {
  saveMultipleChoice: () => void;
  openPreview: () => void;
  openUrl: (url: string) => void;
}

const DEMO_BRIDGE: DemoBridge = {
  saveMultipleChoice: () => {},
  openPreview: () => {},
  openUrl: (url: string) => window.open(url, '_blank'),
};

// ───────────────────────────────────────────────
// Context Shape
// ───────────────────────────────────────────────

interface DemoContextValue {
  // Scenario
  scenario: DemoScenario;
  scenarioKey: string;
  setScenarioKey: (key: string) => void;

  // State machine
  phase: DemoPhase;

  // Bridge
  bridge: DemoBridge;

  // UI state
  showBack: boolean;
  inputText: string;
  setInputText: (text: string) => void;
  chatMessages: Array<{ role: string; text: string }>;
  isStreaming: boolean;
  evalScore: number;
  mcResult: { correct: boolean; attempts: number } | null;
  autoRateEase: number;

  // Actions
  handleShowAnswer: () => void;
  handleSubmitText: () => void;
  handleStartMC: () => void;
  handleMCSelect: (id: string, isCorrect: boolean) => void;
  handleSendChat: (text: string) => void;
  handleOpenChat: () => void;
  handleCloseChat: () => void;
  handleReset: () => void;
}

// ───────────────────────────────────────────────
// Context
// ───────────────────────────────────────────────

const DemoContext = createContext<DemoContextValue | null>(null);

// ───────────────────────────────────────────────
// Provider
// ───────────────────────────────────────────────

function getInitialState() {
  return {
    phase: 'QUESTION' as DemoPhase,
    showBack: false,
    inputText: '',
    chatMessages: [] as Array<{ role: string; text: string }>,
    isStreaming: false,
    evalScore: 0,
    mcResult: null as { correct: boolean; attempts: number } | null,
    autoRateEase: 0,
  };
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const [scenarioKey, setScenarioKeyRaw] = useState<string>('medicine');
  const [phase, setPhase] = useState<DemoPhase>('QUESTION');
  const [showBack, setShowBack] = useState(false);
  const [inputText, setInputText] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{ role: string; text: string }>>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [evalScore, setEvalScore] = useState(0);
  const [mcResult, setMcResult] = useState<{ correct: boolean; attempts: number } | null>(null);
  const [autoRateEase, setAutoRateEase] = useState(0);

  const streamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scenario = DEMO_SCENARIOS[scenarioKey];

  // Cleanup streaming on unmount
  useEffect(() => {
    return () => {
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
    };
  }, []);

  const resetState = useCallback(() => {
    if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
    const init = getInitialState();
    setPhase(init.phase);
    setShowBack(init.showBack);
    setInputText(init.inputText);
    setChatMessages(init.chatMessages);
    setIsStreaming(init.isStreaming);
    setEvalScore(init.evalScore);
    setMcResult(init.mcResult);
    setAutoRateEase(init.autoRateEase);
  }, []);

  const setScenarioKey = useCallback((key: string) => {
    setScenarioKeyRaw(key);
    resetState();
  }, [resetState]);

  // ─── handleShowAnswer: QUESTION → ANSWER ───

  const handleShowAnswer = useCallback(() => {
    if (phase !== 'QUESTION') return;
    setShowBack(true);
    setAutoRateEase(scenario.timer.ease);
    setPhase('ANSWER');
  }, [phase, scenario]);

  // ─── handleSubmitText: QUESTION → EVALUATING → EVALUATED ───

  const handleSubmitText = useCallback(() => {
    if (phase !== 'QUESTION') return;
    const text = inputText.trim();
    if (!text) return;

    setPhase('EVALUATING');
    setTimeout(() => {
      const score = scenario.evaluation.score;
      const ease = score >= 90 ? 4 : score >= 70 ? 3 : score >= 40 ? 2 : 1;
      setShowBack(true);
      setEvalScore(score);
      setAutoRateEase(ease);
      setPhase('EVALUATED');
    }, 1500);
  }, [phase, inputText, scenario]);

  // ─── handleStartMC: QUESTION → MC_LOADING → MC_ACTIVE ───

  const handleStartMC = useCallback(() => {
    if (phase !== 'QUESTION') return;
    setPhase('MC_LOADING');
    setTimeout(() => {
      setPhase('MC_ACTIVE');
    }, 1200);
  }, [phase]);

  // ─── handleMCSelect ───

  const handleMCSelect = useCallback((id: string, _isCorrect: boolean) => {
    if (id === 'FLIP') {
      setShowBack(true);
      setMcResult({ correct: true, attempts: 1 });
      setAutoRateEase(3);
      setPhase('MC_RESULT');
    }
  }, []);

  // ─── handleSendChat: streams aiResponse char by char ───

  const handleSendChat = useCallback((text: string) => {
    if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);

    setChatMessages(prev => [...prev, { role: 'user', text }]);
    setIsStreaming(true);

    const fullResponse = scenario.chat.aiResponse;
    let idx = 0;
    let accumulated = '';

    streamIntervalRef.current = setInterval(() => {
      const charsToAdd = Math.min(3, fullResponse.length - idx);
      if (charsToAdd <= 0) {
        clearInterval(streamIntervalRef.current!);
        streamIntervalRef.current = null;
        setIsStreaming(false);
        return;
      }
      accumulated += fullResponse.slice(idx, idx + charsToAdd);
      idx += charsToAdd;

      setChatMessages(prev => {
        const next = [...prev];
        const lastIdx = next.length - 1;
        if (lastIdx >= 0 && next[lastIdx].role === 'ai') {
          next[lastIdx] = { role: 'ai', text: accumulated };
        } else {
          next.push({ role: 'ai', text: accumulated });
        }
        return next;
      });
    }, 16);
  }, [scenario]);

  // ─── handleOpenChat / handleCloseChat ───

  const handleOpenChat = useCallback(() => {
    setPhase('CHAT');
    setChatMessages([]);
  }, []);

  const handleCloseChat = useCallback(() => {
    // Return to EVALUATED or ANSWER or MC_RESULT — whichever was last non-CHAT phase
    // We use showBack as a proxy: if showBack, we were past QUESTION
    setPhase(showBack ? 'ANSWER' : 'QUESTION');
  }, [showBack]);

  // ─── handleReset ───

  const handleReset = useCallback(() => {
    const keys = Object.keys(DEMO_SCENARIOS);
    const currentIdx = keys.indexOf(scenarioKey);
    const nextKey = keys[(currentIdx + 1) % keys.length];
    setScenarioKeyRaw(nextKey);
    resetState();
  }, [scenarioKey, resetState]);

  const value: DemoContextValue = {
    scenario,
    scenarioKey,
    setScenarioKey,
    phase,
    bridge: DEMO_BRIDGE,
    showBack,
    inputText,
    setInputText,
    chatMessages,
    isStreaming,
    evalScore,
    mcResult,
    autoRateEase,
    handleShowAnswer,
    handleSubmitText,
    handleStartMC,
    handleMCSelect,
    handleSendChat,
    handleOpenChat,
    handleCloseChat,
    handleReset,
  };

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

// ───────────────────────────────────────────────
// Hook
// ───────────────────────────────────────────────

export function useDemoContext(): DemoContextValue {
  const ctx = useContext(DemoContext);
  if (!ctx) {
    throw new Error('useDemoContext must be used inside <DemoProvider>');
  }
  return ctx;
}
