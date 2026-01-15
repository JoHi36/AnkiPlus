import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCcw } from 'lucide-react';

import { DEMO_SCENARIOS } from './DemoData';
import { DemoAnkiCard } from './DemoAnkiCard';
import RealThoughtStream from './RealThoughtStream';
import { DemoChatMessage } from './DemoChatMessage';
import { DemoQuizCard } from './DemoQuizCard';
import RealChatInput from './RealChatInput';
import RealEvaluation from './RealEvaluation';
import { Button } from '@shared/components/Button';

// Linear State Machine
type DemoPhase = 'IDLE' | 'TYPING_EVAL' | 'EVALUATING' | 'SHOW_EVAL' | 'RESCUE_CHOICE' | 'RESCUE_ACTIVE' | 'DEEP_TYPING' | 'DEEP_THINKING' | 'DEEP_RESULT';

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

  // Handle manual typing in IDLE state to trigger simulation
  const handleUserTyping = (text: string) => {
    if (phase === 'IDLE') {
        setInputText(text);
        // Optional: Trigger auto-completion if user types a few chars
        if (text.length > 2) {
             handleStartEval(); 
        }
    } else if (phase === 'RESCUE_ACTIVE') {
        setInputText(text);
        if (text.length > 2) {
             handleStartDeep();
        }
    }
  };

  // --- PHASE TRANSITION LOGIC ---

  // Phase 1: User "types" eval answer (or we auto-complete it)
  const handleStartEval = () => {
    if (phase !== 'IDLE') return; // Prevent double trigger
    setPhase('TYPING_EVAL');
    simulateTyping(scenario.evaluation.userTyping, () => {
      setPhase('EVALUATING');
      setTimeout(() => setPhase('SHOW_EVAL'), 1000);
    });
  };

  // Phase 2: User chooses Rescue (Quiz)
  const handleStartRescue = () => {
    setPhase('RESCUE_ACTIVE');
    setInputText('');
  };

  // Phase 3: User triggers Deep Mode
  const handleStartDeep = () => {
    if (phase !== 'RESCUE_ACTIVE') return;
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
          
          {/* 1. User Eval Message */}
          {['EVALUATING', 'SHOW_EVAL', 'RESCUE_CHOICE', 'RESCUE_ACTIVE', 'DEEP_TYPING', 'DEEP_THINKING', 'DEEP_RESULT'].includes(phase) && (
            <div className="flex justify-end animate-in fade-in slide-in-from-bottom-2">
              <div className="bg-[#222] text-neutral-200 px-4 py-3 rounded-2xl rounded-tr-sm max-w-[85%] text-sm leading-relaxed border border-white/5">
                {scenario.evaluation.userTyping}
              </div>
            </div>
          )}

          {/* 2. AI Eval Result */}
          {['SHOW_EVAL', 'RESCUE_CHOICE', 'RESCUE_ACTIVE', 'DEEP_TYPING', 'DEEP_THINKING', 'DEEP_RESULT'].includes(phase) && (
             <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <RealEvaluation score={scenario.evaluation.score} feedback={scenario.evaluation.feedback} />
                
                {/* Contextual Action Button (Only if not moved on) */}
                {phase === 'SHOW_EVAL' && (
                  <div className="flex gap-2 justify-center pt-2">
                    <Button 
                      variant="primary" 
                      size="sm" 
                      onClick={handleStartRescue}
                      className="animate-in zoom-in duration-300"
                    >
                      Quiz starten (Rescue Mode)
                    </Button>
                  </div>
                )}
             </div>
          )}

          {/* 3. Deep Mode Trigger Message */}
          {['DEEP_THINKING', 'DEEP_RESULT'].includes(phase) && (
            <div className="flex justify-end animate-in fade-in slide-in-from-bottom-2">
               <div className="bg-purple-900/20 text-purple-200 px-4 py-3 rounded-2xl rounded-tr-sm max-w-[85%] text-sm leading-relaxed border border-purple-500/30">
                 Erklär mir die Hintergründe bitte.
               </div>
            </div>
          )}

          {/* 4. Deep Thinking Stream */}
          {['DEEP_THINKING', 'DEEP_RESULT'].includes(phase) && (
             <RealThoughtStream 
               steps={scenario.deepMode.steps} 
               citations={scenario.deepMode.citations}
               isVisible={true} 
               isComplete={phase === 'DEEP_RESULT'} 
             />
          )}

          {/* 5. Final Deep Result */}
          {phase === 'DEEP_RESULT' && (
             <DemoChatMessage 
               content={scenario.deepMode.answerMarkdown} 
               isStreaming={true} 
               citations={scenario.deepMode.citations}
             />
          )}
        </div>

        {/* Input Area (Bottom Fixed) */}
        <div className="p-4 border-t border-white/5 bg-[#0A0A0A] relative z-20">
           {/* If we are waiting for user to start deep mode after rescue */}
           {phase === 'RESCUE_ACTIVE' && (
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 animate-bounce pointer-events-none">
                 <span className="text-xs text-teal-400 bg-teal-950/80 border border-teal-500/30 px-3 py-1.5 rounded-full backdrop-blur-sm shadow-lg">
                   👇 Frag "Erklär mir das"
                 </span>
              </div>
           )}

           <RealChatInput 
              value={inputText} 
              onChange={handleUserTyping} 
              onSend={phase === 'IDLE' ? handleStartEval : phase === 'RESCUE_ACTIVE' ? handleStartDeep : () => {}}
              isLoading={phase === 'TYPING_EVAL' || phase === 'DEEP_TYPING'}
              cardContext={{ isQuestion: true }} // Mock context to show question actions
              onToggleCardState={() => {}} // Dummy handler
           />
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-6xl mx-auto h-[700px] md:h-[800px] bg-[#0A0A0A] rounded-3xl border border-white/10 shadow-2xl flex flex-col md:flex-row overflow-hidden relative group">
      
      {/* --- LEFT SIDE: CARD / QUIZ --- */}
      <div className="relative w-full md:w-1/2 h-[40%] md:h-full bg-[#111] border-b md:border-b-0 md:border-r border-white/5 flex flex-col">
        
        {/* Scenario Selector (Only visible in IDLE) */}
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

        {/* Reset Button (Visible when active) */}
        {phase !== 'IDLE' && (
           <button 
             onClick={handleReset}
             className="absolute top-4 left-4 z-20 p-2 rounded-full bg-black/40 text-neutral-500 hover:text-white border border-white/5 hover:border-white/20 transition-all"
             title="Demo Neustarten"
           >
             <RefreshCcw size={16} />
           </button>
        )}

        {/* Card Content with 3D Flip Effect */}
        <div className="flex-1 relative perspective-1000">
           <AnimatePresence mode="wait">
             {phase === 'RESCUE_ACTIVE' || phase === 'DEEP_TYPING' || phase === 'DEEP_THINKING' || phase === 'DEEP_RESULT' ? (
                <motion.div
                  key="quiz"
                  initial={{ opacity: 0, rotateY: -90 }}
                  animate={{ opacity: 1, rotateY: 0 }}
                  exit={{ opacity: 0, rotateY: 90 }}
                  transition={{ duration: 0.5 }}
                  className="absolute inset-0"
                >
                   <DemoQuizCard 
                      question={scenario.rescue.question} 
                      options={scenario.rescue.options} 
                   />
                </motion.div>
             ) : (
                <motion.div
                  key="card"
                  initial={{ opacity: 0, rotateY: 90 }}
                  animate={{ opacity: 1, rotateY: 0 }}
                  exit={{ opacity: 0, rotateY: -90 }}
                  transition={{ duration: 0.5 }}
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
