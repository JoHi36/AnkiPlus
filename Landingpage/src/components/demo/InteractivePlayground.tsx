import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCcw, ArrowRight, MessageSquareDashed, Sparkles, Brain, GitCompareArrows } from 'lucide-react';

import { DEMO_SCENARIOS } from './DemoData';
import { DemoAnkiCard } from './DemoAnkiCard';
import RealThoughtStream from './RealThoughtStream';
import { RealChatMessage } from './RealChatMessage';
import { QuizCard } from '@shared/components/QuizCard';
import RealChatInput from './RealChatInput';
import RealEvaluation from './RealEvaluation';
import { Button } from '@shared/components/Button';

// Linear State Machine
type DemoPhase = 'IDLE' | 'TYPING_EVAL' | 'EVALUATING' | 'SHOW_EVAL' | 'RESCUE_CHOICE' | 'RESCUE_ACTIVE' | 'QUIZ_SOLVED' | 'DEEP_CTA' | 'DEEP_TYPING' | 'DEEP_THINKING' | 'DEEP_RESULT';

export function InteractivePlayground() {
  const [scenarioKey, setScenarioKey] = useState<string>('medicine');
  const [phase, setPhase] = useState<DemoPhase>('IDLE');
  const [inputText, setInputText] = useState('');
  
  const scenario = DEMO_SCENARIOS[scenarioKey];
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logic
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [phase, inputText]);

  // Handle manual typing
  const handleUserTyping = (text: string) => {
    if (phase === 'IDLE') {
        setInputText(text);
        if (text.length > 5) {
             handleStartEval(); 
        }
    } else if (phase === 'DEEP_CTA') {
        setInputText(text);
        if (text.length > 5) {
             handleStartDeep();
        }
    }
  };

  // --- PHASE TRANSITION LOGIC ---

  const handleStartEval = () => {
    if (phase !== 'IDLE') return;
    setPhase('TYPING_EVAL');
    simulateTyping(scenario.evaluation.userTyping, () => {
      setPhase('EVALUATING');
      setTimeout(() => setPhase('SHOW_EVAL'), 1000);
    });
  };

  const handleStartRescue = () => {
    setPhase('RESCUE_ACTIVE');
    setInputText('');
  };

  // Triggered when user selects an answer in the QuizCard
  const handleQuizCompletion = (id: string, isCorrect: boolean) => {
    if (id === 'FLIP') {
        setPhase('DEEP_CTA');
        return;
    }
    
    if (phase === 'RESCUE_ACTIVE' && isCorrect) {
        setPhase('QUIZ_SOLVED'); 
    }
  };

  const handleStartDeep = () => {
    if (phase !== 'DEEP_CTA') return;
    setPhase('DEEP_TYPING');
    simulateTyping("Erklär mir die Hintergründe bitte.", () => {
      setPhase('DEEP_THINKING');
      setTimeout(() => setPhase('DEEP_RESULT'), 3500);
    });
  };

  const handleReset = () => {
    setPhase('IDLE');
    setInputText('');
  };

  const simulateTyping = (fullText: string, onComplete: () => void) => {
    let idx = 0;
    setInputText('');
    const interval = setInterval(() => {
      if (idx < fullText.length) {
        setInputText(fullText.slice(0, idx + 1));
        idx++;
      } else {
        clearInterval(interval);
        onComplete();
      }
    }, 25);
  };

  // --- RENDER HELPERS ---

  const renderRightPanel = () => {
    return (
      <div className="flex flex-col h-full bg-[#0A0A0A] relative">
        
        {/* Chat Area */}
        <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent pb-32">
          
          {/* POLISHED EMPTY STATE CTA - CLEANER VERSION */}
          {phase === 'IDLE' && !inputText && (
            <div className="h-full flex flex-col items-center justify-center space-y-6 opacity-40">
                {/* Subtle Ghost Icon */}
                <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center border border-white/5 rotate-3">
                    <Sparkles className="w-6 h-6 text-white/40" />
                </div>
                <div className="text-sm font-medium text-white/30 tracking-wide uppercase">
                    Bereit zum Lernen
                </div>
            </div>
          )}

          {/* 1. User Eval Message */}
          {['EVALUATING', 'SHOW_EVAL', 'RESCUE_CHOICE', 'RESCUE_ACTIVE', 'QUIZ_SOLVED', 'DEEP_CTA', 'DEEP_TYPING', 'DEEP_THINKING', 'DEEP_RESULT'].includes(phase) && (
            <div className="flex justify-end animate-in fade-in slide-in-from-bottom-2">
              <div className="bg-[#222] text-neutral-200 px-4 py-3 rounded-2xl rounded-tr-sm max-w-[85%] text-sm leading-relaxed border border-white/5">
                {scenario.evaluation.userTyping}
              </div>
            </div>
          )}

          {/* 2. AI Eval Result */}
          {['SHOW_EVAL', 'RESCUE_CHOICE', 'RESCUE_ACTIVE', 'QUIZ_SOLVED', 'DEEP_CTA', 'DEEP_TYPING', 'DEEP_THINKING', 'DEEP_RESULT'].includes(phase) && (
             <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <RealEvaluation 
                    score={scenario.evaluation.score} 
                    feedback={scenario.evaluation.feedback} 
                    onStartQuiz={handleStartRescue}
                    onStartHint={() => {}} 
                />
             </div>
          )}

          {/* 3. Deep Mode CTA (Appears after Quiz selection) */}
          {phase === 'DEEP_CTA' && (
             <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-center pt-4"
             >
                <button 
                    onClick={handleStartDeep}
                    className="flex items-center gap-3 px-6 py-3 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 hover:bg-purple-500/20 hover:scale-105 transition-all shadow-lg shadow-purple-900/20 group"
                >
                    <GitCompareArrows size={16} />
                    <span className="text-xs font-bold uppercase tracking-wider">Karte erklären</span>
                    <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                </button>
             </motion.div>
          )}

          {/* 4. Deep Mode User Trigger */}
          {['DEEP_THINKING', 'DEEP_RESULT'].includes(phase) && (
            <div className="flex justify-end animate-in fade-in slide-in-from-bottom-2">
               <div className="bg-[#222] text-neutral-200 px-4 py-3 rounded-2xl rounded-tr-sm max-w-[85%] text-sm leading-relaxed border border-white/5">
                 Erklär mir die Hintergründe bitte.
               </div>
            </div>
          )}

          {/* 5. Deep Thinking Stream */}
          {['DEEP_THINKING', 'DEEP_RESULT'].includes(phase) && (
             <RealThoughtStream 
               steps={scenario.deepMode.steps} 
               citations={scenario.deepMode.citations}
               isVisible={true} 
               isComplete={phase === 'DEEP_RESULT'} 
             />
          )}

          {/* 6. Final Deep Result */}
          {phase === 'DEEP_RESULT' && (
             <RealChatMessage 
               message={scenario.deepMode.answerMarkdown} 
               isStreaming={true} 
               citations={scenario.deepMode.citations}
             />
          )}
        </div>

        {/* Input Area (Bottom Fixed) */}
        <div className="p-4 border-t border-white/5 bg-[#0A0A0A] relative z-20">
           <RealChatInput 
              value={inputText} 
              onChange={handleUserTyping} 
              onSend={phase === 'IDLE' ? handleStartEval : phase === 'DEEP_CTA' ? handleStartDeep : () => {}}
              isLoading={phase === 'TYPING_EVAL' || phase === 'DEEP_TYPING'}
              cardContext={{ isQuestion: true }} 
              onToggleCardState={() => {}} 
           />
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-6xl mx-auto h-[700px] md:h-[800px] bg-[#0A0A0A] rounded-3xl border border-white/10 shadow-2xl flex flex-col md:flex-row overflow-hidden relative group">
      
      {/* --- LEFT SIDE: CARD / QUIZ --- */}
      <div className="relative w-full md:w-1/2 h-[40%] md:h-full bg-[#111] border-b md:border-b-0 md:border-r border-white/5 flex flex-col">
        
        {/* Scenario Selector */}
        {phase === 'IDLE' && (
          <div className="absolute top-4 left-4 z-10 flex gap-2 animate-in fade-in">
            {Object.values(DEMO_SCENARIOS).map((s) => (
              <button
                key={s.id}
                onClick={() => { setScenarioKey(s.id as any); handleReset(); }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  scenarioKey === s.id 
                    ? 'bg-teal-500/10 text-teal-400 border-teal-500/30' 
                    : 'bg-black/40 text-neutral-500 border-white/5 hover:bg-white/5'
                }`}
              >
                {s.category}
              </button>
            ))}
          </div>
        )}

        {/* Reset Button */}
        {phase !== 'IDLE' && (
           <button 
             onClick={handleReset}
             className="absolute top-4 right-4 z-20 p-2 rounded-full bg-black/40 text-neutral-500 hover:text-white border border-white/5 hover:border-white/20 transition-all backdrop-blur-md"
             title="Demo Neustarten"
           >
             <RefreshCcw size={16} />
           </button>
        )}

        {/* Card Content with 3D Flip Effect */}
        <div className="flex-1 relative perspective-1000">
           <AnimatePresence mode="wait">
             {/* Show Quiz during active quiz AND solved state */}
             {['RESCUE_ACTIVE', 'QUIZ_SOLVED'].includes(phase) ? (
                <motion.div
                  key="quiz"
                  initial={{ opacity: 0, rotateY: -90 }}
                  animate={{ opacity: 1, rotateY: 0 }}
                  exit={{ opacity: 0, rotateY: 90 }} // Flip away when done
                  transition={{ duration: 0.6, ease: "easeInOut" }}
                  className="absolute inset-0"
                >
                   <QuizCard 
                      question={scenario.rescue.question} 
                      options={scenario.rescue.options}
                      onSelect={() => handleQuizCompletion()}
                      className="h-full overflow-y-auto p-4"
                   />
                </motion.div>
             ) : (
                <motion.div
                  key="card"
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.6, ease: "easeInOut" }}
                  className="absolute inset-0"
                >
                   <DemoAnkiCard content={scenario.card.front} tags={scenario.card.tags} />
                </motion.div>
             )}
           </AnimatePresence>
        </div>
      </div>

      {/* --- RIGHT SIDE: CHAT INTERFACE --- */}
      <div className="w-full md:w-1/2 h-[60%] md:h-full">
         {renderRightPanel()}
      </div>

    </div>
  );
}