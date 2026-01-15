import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, ChevronRight, HelpCircle } from 'lucide-react';

export interface QuizOption {
  id: string; // "A", "B", "C", "D", "E"
  text: string;
  isCorrect: boolean;
  explanation?: string;
}

export interface QuizCardProps {
  question: string;
  options: QuizOption[];
  onSelect?: (id: string, isCorrect: boolean) => void;
  className?: string;
}

/**
 * QuizCard Component - "Medical Precision" Style
 * Clean, professional multiple choice layout aiming for exam simulation quality.
 * Features: 
 * - Monospace indices
 * - Focus dimming
 * - Inline explanations
 * - 5-Option Standard
 */
export function QuizCard({ question, options, onSelect, className = '' }: QuizCardProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const handleSelect = (id: string, isCorrect: boolean) => {
    if (hasSubmitted) return;
    setSelectedId(id);
    setHasSubmitted(true);
    if (onSelect) onSelect(id, isCorrect);
  };

  return (
    <div className={`w-full max-w-3xl mx-auto flex flex-col font-sans ${className}`}>
      
      {/* Header Badge */}
      <div className="flex items-center gap-2 mb-6 text-teal-500/80 px-1">
        <div className="w-1 h-4 bg-teal-500 rounded-full" />
        <span className="text-[10px] font-bold tracking-[0.2em] uppercase font-mono">Exam Simulation</span>
      </div>

      {/* Question */}
      <h3 className="text-xl sm:text-2xl font-medium text-white/95 mb-10 leading-snug px-1">
        {question}
      </h3>

      {/* Options List */}
      <div className="flex flex-col gap-3">
        {options.map((option, idx) => {
          const isSelected = selectedId === option.id;
          const isCorrect = option.isCorrect;
          
          // Visual States
          let state = 'idle'; // idle, selected-correct, selected-wrong, missed-correct, dim
          
          if (hasSubmitted) {
            if (isSelected) {
              state = isCorrect ? 'selected-correct' : 'selected-wrong';
            } else if (isCorrect) {
              state = 'missed-correct'; // Show correct answer if wrong was picked
            } else {
              state = 'dim'; // Dim irrelevant options
            }
          }

          return (
            <motion.div
              key={option.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ 
                opacity: state === 'dim' ? 0.4 : 1, 
                y: 0 
              }}
              transition={{ delay: idx * 0.05, duration: 0.3 }}
              className="relative"
            >
              <button
                disabled={hasSubmitted}
                onClick={() => handleSelect(option.id, option.isCorrect)}
                className={`
                  w-full text-left relative flex items-start group rounded-lg overflow-hidden transition-all duration-200
                  border border-transparent
                  ${state === 'idle' 
                    ? 'bg-[#151515] hover:bg-[#1a1a1a] border-white/5 hover:border-white/10' 
                    : ''}
                  ${state === 'selected-correct' 
                    ? 'bg-teal-500/10 border-teal-500/50 shadow-[0_0_15px_-5px_rgba(20,184,166,0.3)]' 
                    : ''}
                  ${state === 'selected-wrong' 
                    ? 'bg-red-500/10 border-red-500/50' 
                    : ''}
                  ${state === 'missed-correct' 
                    ? 'bg-teal-500/5 border-teal-500/30 border-dashed' 
                    : ''}
                  ${state === 'dim' 
                    ? 'bg-[#151515] border-transparent opacity-50 grayscale' 
                    : ''}
                `}
              >
                {/* Active Indicator Bar (Left) */}
                <div className={`absolute left-0 top-0 bottom-0 w-1 transition-colors duration-200
                  ${state === 'idle' ? 'bg-transparent group-hover:bg-white/20' : ''}
                  ${state === 'selected-correct' ? 'bg-teal-500' : ''}
                  ${state === 'selected-wrong' ? 'bg-red-500' : ''}
                  ${state === 'missed-correct' ? 'bg-teal-500/50' : ''}
                `} />

                <div className="flex w-full p-4 pl-5">
                  {/* Index Box (A, B, C...) */}
                  <div className={`
                    flex-shrink-0 w-8 h-8 mr-4 rounded flex items-center justify-center font-mono text-sm font-bold border transition-colors
                    ${state === 'idle' ? 'bg-black/20 border-white/10 text-neutral-500 group-hover:text-neutral-300' : ''}
                    ${state === 'selected-correct' ? 'bg-teal-500 text-black border-teal-500' : ''}
                    ${state === 'selected-wrong' ? 'bg-red-500 text-white border-red-500' : ''}
                    ${state === 'missed-correct' ? 'bg-teal-500/20 text-teal-500 border-teal-500/30' : ''}
                    ${state === 'dim' ? 'bg-black/20 border-white/5 text-neutral-600' : ''}
                  `}>
                    {option.id}
                  </div>

                  {/* Text Content */}
                  <div className="flex-1 py-1">
                    <div className={`text-[15px] leading-relaxed transition-colors ${
                      state === 'selected-correct' ? 'text-teal-50' :
                      state === 'selected-wrong' ? 'text-red-50' :
                      state === 'missed-correct' ? 'text-teal-100' :
                      'text-neutral-300 group-hover:text-neutral-100'
                    }`}>
                      {option.text}
                    </div>
                  </div>

                  {/* Status Icon (Right) */}
                  <div className="flex-shrink-0 w-6 flex items-center justify-center ml-2">
                    {state === 'selected-correct' && <Check size={18} className="text-teal-400" strokeWidth={3} />}
                    {state === 'selected-wrong' && <X size={18} className="text-red-400" strokeWidth={3} />}
                    {state === 'missed-correct' && <Check size={16} className="text-teal-500/50" />}
                  </div>
                </div>
              </button>

              {/* Inline Explanation (Accordion) */}
              <AnimatePresence>
                {hasSubmitted && (state === 'selected-correct' || state === 'selected-wrong' || state === 'missed-correct') && option.explanation && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    <div className={`
                      mx-5 mb-2 p-3 rounded-b-lg border-x border-b text-sm leading-relaxed
                      ${state === 'selected-correct' || state === 'missed-correct' 
                        ? 'bg-teal-950/20 border-teal-500/20 text-teal-200/80' 
                        : 'bg-red-950/20 border-red-500/20 text-red-200/80'}
                    `}>
                      <div className="flex gap-2">
                        <div className="mt-0.5 shrink-0 opacity-70">
                          {state === 'selected-correct' || state === 'missed-correct' ? <Check size={14} /> : <HelpCircle size={14} />}
                        </div>
                        <div>
                          {option.explanation}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
