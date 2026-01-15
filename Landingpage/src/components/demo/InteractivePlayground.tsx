import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, MessageSquare, Zap, RefreshCcw, Search, ChevronRight, X, ArrowUpRight } from 'lucide-react';

import { DEMO_SCENARIOS } from './DemoData';
import { DemoAnkiCard } from './DemoAnkiCard';
import { DemoThoughtStream } from './DemoThoughtStream';
import { DemoChatMessage } from './DemoChatMessage';
import { DemoQuizCard } from './DemoQuizCard';
import { Button } from '@shared/components/Button';

type DemoMode = 'IDLE' | 'EVAL' | 'RESCUE' | 'DEEP';
type DemoPhase = 'INPUT' | 'PROCESSING' | 'RESULT';

export function InteractivePlayground() {
  const [scenarioKey, setScenarioKey] = useState<string>('medicine');
  const [mode, setMode] = useState<DemoMode>('IDLE');
  const [phase, setPhase] = useState<DemoPhase>('INPUT');
  const [inputText, setInputText] = useState('');
  const [showMobileSheet, setShowMobileSheet] = useState(false);

  const scenario = DEMO_SCENARIOS[scenarioKey];

  // Auto-typing effect for EVAL mode
  useEffect(() => {
    if (mode === 'EVAL' && phase === 'INPUT') {
      const targetText = scenario.evaluation.userTyping;
      let idx = 0;
      setInputText('');
      
      const interval = setInterval(() => {
        if (idx < targetText.length) {
          setInputText(targetText.slice(0, idx + 1));
          idx++;
        } else {
          clearInterval(interval);
          setTimeout(() => setPhase('PROCESSING'), 500);
        }
      }, 30); // Typing speed

      return () => clearInterval(interval);
    }
  }, [mode, phase, scenario]);

  // Processing simulation
  useEffect(() => {
    if (phase === 'PROCESSING') {
      const delay = mode === 'DEEP' ? 4000 : 1500;
      const timer = setTimeout(() => {
        setPhase('RESULT');
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [phase, mode]);

  const handleReset = () => {
    setMode('IDLE');
    setPhase('INPUT');
    setInputText('');
    setShowMobileSheet(false);
  };

  const startMode = (newMode: DemoMode) => {
    setMode(newMode);
    setPhase('INPUT');
    setShowMobileSheet(true); // Open sheet on mobile
    
    // For Rescue and Deep, skip manual input simulation
    if (newMode === 'RESCUE') {
      setPhase('RESULT'); // Immediate flip
    } else if (newMode === 'DEEP') {
      setPhase('PROCESSING'); // Start thinking
    }
    // EVAL will trigger the typing effect via useEffect
  };

  // --- COMPONENT RENDERERS ---

  const renderContent = () => {
    if (mode === 'RESCUE' && phase === 'RESULT') {
      return (
        <DemoQuizCard 
          question={scenario.rescue.question} 
          options={scenario.rescue.options} 
        />
      );
    }

    if (mode === 'DEEP' || mode === 'EVAL') {
      return (
        <div className="flex flex-col h-full overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          
          {/* User Input Bubble */}
          {(mode === 'EVAL' || (mode === 'DEEP' && phase !== 'INPUT')) && (
            <div className="flex justify-end animate-in fade-in slide-in-from-bottom-2">
              <div className="bg-[#222] text-neutral-200 px-4 py-3 rounded-2xl rounded-tr-sm max-w-[80%] text-sm leading-relaxed border border-white/5">
                {mode === 'EVAL' ? inputText : "Deep Mode: Erkläre mir die Zusammenhänge."}
                {phase === 'INPUT' && mode === 'EVAL' && <span className="animate-pulse">|</span>}
              </div>
            </div>
          )}

          {/* Deep Thinking Stream */}
          {mode === 'DEEP' && (phase === 'PROCESSING' || phase === 'RESULT') && (
            <DemoThoughtStream 
              steps={scenario.deepMode.steps} 
              isVisible={true} 
              isComplete={phase === 'RESULT'} 
            />
          )}

          {/* AI Result */}
          {phase === 'RESULT' && (
            mode === 'DEEP' ? (
              <DemoChatMessage 
                content={scenario.deepMode.answerMarkdown} 
                isStreaming={true} 
                citations={scenario.deepMode.citations}
              />
            ) : (
              <div className="flex gap-4 animate-in fade-in slide-in-from-bottom-2">
                 <div className="w-8 h-8 rounded-lg bg-yellow-500/10 flex items-center justify-center border border-yellow-500/20 shrink-0">
                    <MessageSquare size={16} className="text-yellow-500" />
                 </div>
                 <div className="p-4 bg-yellow-500/5 border border-yellow-500/10 rounded-lg text-sm text-neutral-300 leading-relaxed whitespace-pre-wrap">
                    {scenario.evaluation.feedback}
                 </div>
              </div>
            )
          )}
        </div>
      );
    }

    // Default Idle State
    return (
      <div className="h-full flex flex-col items-center justify-center text-neutral-500 space-y-4">
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
           <Search size={24} className="opacity-20" />
        </div>
        <p className="text-sm">Wähle eine Aktion, um Anki+ zu starten.</p>
      </div>
    );
  };

  return (
    <div className="w-full max-w-6xl mx-auto h-[600px] md:h-[700px] bg-[#0A0A0A] rounded-3xl border border-white/10 shadow-2xl flex flex-col md:flex-row overflow-hidden relative group">
      
      {/* --- LEFT SIDE: CARD (Desktop) / FULL (Mobile) --- */}
      <div className="relative w-full md:w-1/2 h-full bg-[#111] border-r border-white/5 flex flex-col">
        
        {/* Scenario Selector */}
        <div className="absolute top-4 left-4 z-10 flex gap-2">
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

        {/* The Card */}
        <div className={`flex-1 transition-all duration-500 ${showMobileSheet ? 'scale-95 opacity-50 md:scale-100 md:opacity-100' : ''}`}>
           <DemoAnkiCard content={scenario.card.front} tags={scenario.card.tags} />
        </div>

        {/* Mobile Action Bar (Bottom) */}
        <div className="md:hidden p-4 pb-6 grid grid-cols-3 gap-3 bg-[#0A0A0A] border-t border-white/10 z-20">
           <button onClick={() => startMode('EVAL')} className="flex flex-col items-center gap-1 p-2 rounded-lg bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 active:scale-95 transition-transform">
              <MessageSquare size={20} />
              <span className="text-[10px] font-bold">Eval</span>
           </button>
           <button onClick={() => startMode('RESCUE')} className="flex flex-col items-center gap-1 p-2 rounded-lg bg-teal-500/10 text-teal-500 border border-teal-500/20 active:scale-95 transition-transform">
              <Zap size={20} />
              <span className="text-[10px] font-bold">Rescue</span>
           </button>
           <button onClick={() => startMode('DEEP')} className="flex flex-col items-center gap-1 p-2 rounded-lg bg-purple-500/10 text-purple-500 border border-purple-500/20 active:scale-95 transition-transform">
              <Brain size={20} />
              <span className="text-[10px] font-bold">Deep</span>
           </button>
        </div>
      </div>

      {/* --- RIGHT SIDE: INTERACTION (Desktop) --- */}
      <div className="hidden md:flex w-1/2 h-full flex-col bg-[#0A0A0A] relative">
        
        {/* Interaction Area */}
        <div className="flex-1 relative overflow-hidden">
          {renderContent()}
        </div>

        {/* Desktop Controls */}
        <div className="p-6 border-t border-white/5 bg-[#050505]">
           {mode === 'IDLE' ? (
             <div className="grid grid-cols-3 gap-4">
                <Button variant="outline" onClick={() => startMode('EVAL')} className="h-auto py-4 flex flex-col gap-2 hover:border-yellow-500/50 hover:bg-yellow-500/5 group">
                   <MessageSquare className="w-5 h-5 text-yellow-500" />
                   <div className="flex flex-col items-start">
                      <span className="text-xs font-bold text-white">Evaluation</span>
                      <span className="text-[10px] text-neutral-500 group-hover:text-yellow-200/70">Check my answer</span>
                   </div>
                </Button>

                <Button variant="outline" onClick={() => startMode('RESCUE')} className="h-auto py-4 flex flex-col gap-2 hover:border-teal-500/50 hover:bg-teal-500/5 group">
                   <Zap className="w-5 h-5 text-teal-500" />
                   <div className="flex flex-col items-start">
                      <span className="text-xs font-bold text-white">Rescue</span>
                      <span className="text-[10px] text-neutral-500 group-hover:text-teal-200/70">Quiz Mode</span>
                   </div>
                </Button>

                <Button variant="outline" onClick={() => startMode('DEEP')} className="h-auto py-4 flex flex-col gap-2 hover:border-purple-500/50 hover:bg-purple-500/5 group">
                   <Brain className="w-5 h-5 text-purple-500" />
                   <div className="flex flex-col items-start">
                      <span className="text-xs font-bold text-white">Deep Mode</span>
                      <span className="text-[10px] text-neutral-500 group-hover:text-purple-200/70">Explain Concept</span>
                   </div>
                </Button>
             </div>
           ) : (
             <div className="flex justify-between items-center animate-in fade-in">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full animate-pulse ${mode === 'DEEP' ? 'bg-purple-500' : mode === 'RESCUE' ? 'bg-teal-500' : 'bg-yellow-500'}`} />
                  <span className="text-xs font-mono text-neutral-400">SESSION ACTIVE</span>
                </div>
                <Button variant="ghost" size="sm" onClick={handleReset} className="text-neutral-500 hover:text-white">
                  <RefreshCcw size={14} className="mr-2" />
                  Reset
                </Button>
             </div>
           )}
        </div>
      </div>

      {/* --- MOBILE BOTTOM SHEET --- */}
      <AnimatePresence>
        {showMobileSheet && (
          <>
            <motion.div 
               initial={{ opacity: 0 }} 
               animate={{ opacity: 1 }} 
               exit={{ opacity: 0 }} 
               className="md:hidden absolute inset-0 bg-black/60 z-30 backdrop-blur-sm"
               onClick={() => setShowMobileSheet(false)}
            />
            <motion.div
               initial={{ y: '100%' }}
               animate={{ y: '0%' }}
               exit={{ y: '100%' }}
               transition={{ type: "spring", damping: 25, stiffness: 300 }}
               className="md:hidden absolute bottom-0 left-0 right-0 h-[85%] bg-[#151515] rounded-t-3xl z-40 flex flex-col border-t border-white/10 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]"
            >
               {/* Drag Handle */}
               <div className="w-full h-8 flex items-center justify-center shrink-0" onClick={() => setShowMobileSheet(false)}>
                  <div className="w-12 h-1.5 bg-neutral-700 rounded-full" />
               </div>
               
               {/* Close Button */}
               <button onClick={() => setShowMobileSheet(false)} className="absolute top-4 right-4 p-2 text-neutral-500 hover:text-white">
                  <X size={20} />
               </button>

               {/* Sheet Content */}
               <div className="flex-1 overflow-y-auto p-4 pb-20">
                  {renderContent()}
               </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
