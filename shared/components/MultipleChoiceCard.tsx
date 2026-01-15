import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, HelpCircle, Trophy, RotateCcw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export interface MultipleChoiceOption {
  letter: string;
  text: string;
  isCorrect: boolean;
  explanation?: string;
}

export interface MultipleChoiceCardProps {
  question: string;
  options: MultipleChoiceOption[];
  onSelect?: (option: MultipleChoiceOption) => void;
  onRetry?: () => void;
}

/**
 * MultipleChoiceCard - High End UI 4.0 ("Medical Precision" Style)
 * Unified High-End Quiz Component for App and Landing Page.
 * Features:
 * - Monospace indices
 * - Focus dimming
 * - Inline explanations (Accordion)
 * - Clean, professional layout
 */
export const MultipleChoiceCard: React.FC<MultipleChoiceCardProps> = ({ 
  question, 
  options, 
  onSelect, 
  onRetry 
}) => {
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  const handleSelect = (option: MultipleChoiceOption) => {
    if (hasSubmitted) return;
    
    setSelectedLetter(option.letter);
    setHasSubmitted(true);
    setIsCorrect(option.isCorrect);
    
    if (onSelect) onSelect(option);
  };

  const handleRetryClick = () => {
    setSelectedLetter(null);
    setHasSubmitted(false);
    setIsCorrect(null);
    if (onRetry) onRetry();
  };

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col font-sans my-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header Badge */}
      <div className="flex items-center gap-2 mb-6 px-1">
        <div className="w-1 h-4 bg-primary rounded-full" />
        <span className="text-[10px] font-bold tracking-[0.2em] uppercase font-mono text-primary/80">Exam Simulation</span>
      </div>

      {/* Question */}
      <h3 className="text-xl sm:text-2xl font-medium text-base-content/95 mb-10 leading-snug px-1">
        <ReactMarkdown 
            remarkPlugins={[remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={{
                p: ({node, ...props}) => <span {...props} />
            }}>
            {typeof question === 'string' ? question : "Wähle die richtige Antwort"}
        </ReactMarkdown>
      </h3>

      {/* Options List */}
      <div className="flex flex-col gap-3">
        {options.map((option, idx) => {
          const isSelected = selectedLetter === option.letter;
          
          // Visual States
          let state = 'idle'; // idle, selected-correct, selected-wrong, missed-correct, dim
          
          if (hasSubmitted) {
            if (isSelected) {
              state = option.isCorrect ? 'selected-correct' : 'selected-wrong';
            } else if (option.isCorrect) {
              state = 'missed-correct'; // Show correct answer if wrong was picked
            } else {
              state = 'dim'; // Dim irrelevant options
            }
          }

          return (
            <motion.div
              key={idx}
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
                onClick={() => handleSelect(option)}
                className={`
                  w-full text-left relative flex items-start group rounded-lg overflow-hidden transition-all duration-200
                  border
                  ${state === 'idle' 
                    ? 'bg-base-200/40 hover:bg-base-200/80 border-base-300/60 hover:border-base-300' 
                    : ''}
                  ${state === 'selected-correct' 
                    ? 'bg-emerald-500/10 border-emerald-500/50 shadow-[0_0_15px_-5px_rgba(16,185,129,0.3)]' 
                    : ''}
                  ${state === 'selected-wrong' 
                    ? 'bg-red-500/10 border-red-500/50' 
                    : ''}
                  ${state === 'missed-correct' 
                    ? 'bg-emerald-500/5 border-emerald-500/30 border-dashed' 
                    : ''}
                  ${state === 'dim' 
                    ? 'bg-base-200/20 border-transparent opacity-50 grayscale' 
                    : ''}
                `}
              >
                {/* Active Indicator Bar (Left) */}
                <div className={`absolute left-0 top-0 bottom-0 w-1 transition-colors duration-200
                  ${state === 'idle' ? 'bg-transparent group-hover:bg-base-content/10' : ''}
                  ${state === 'selected-correct' ? 'bg-emerald-500' : ''}
                  ${state === 'selected-wrong' ? 'bg-red-500' : ''}
                  ${state === 'missed-correct' ? 'bg-emerald-500/50' : ''}
                `} />

                <div className="flex w-full p-4 pl-5">
                  {/* Index Box (A, B, C...) */}
                  <div className={`
                    flex-shrink-0 w-8 h-8 mr-4 rounded flex items-center justify-center font-mono text-sm font-bold border transition-colors
                    ${state === 'idle' ? 'bg-base-300/50 border-base-300 text-base-content/60 group-hover:text-base-content/80' : ''}
                    ${state === 'selected-correct' ? 'bg-emerald-500 text-base-100 border-emerald-500' : ''}
                    ${state === 'selected-wrong' ? 'bg-red-500 text-base-100 border-red-500' : ''}
                    ${state === 'missed-correct' ? 'bg-emerald-500/20 text-emerald-600 border-emerald-500/30' : ''}
                    ${state === 'dim' ? 'bg-base-200 border-base-200 text-base-content/30' : ''}
                  `}>
                    {option.letter}
                  </div>

                  {/* Text Content */}
                  <div className="flex-1 py-1">
                    <div className={`text-[15px] leading-relaxed transition-colors ${
                      state === 'selected-correct' ? 'text-base-content font-medium' :
                      state === 'selected-wrong' ? 'text-base-content font-medium' :
                      state === 'missed-correct' ? 'text-emerald-700 dark:text-emerald-400' :
                      'text-base-content/80 group-hover:text-base-content'
                    }`}>
                      <ReactMarkdown 
                          remarkPlugins={[remarkMath]}
                          rehypePlugins={[rehypeKatex]}
                          components={{ 
                              p: ({node, ...props}) => <p className="m-0 inline" {...props} />,
                              code: ({node, ...props}) => <code className="bg-base-content/10 px-1 py-0.5 rounded text-xs font-mono" {...props} />
                          }}>
                          {typeof option.text === 'string' ? option.text : String(option.text || '')}
                      </ReactMarkdown>
                    </div>
                  </div>

                  {/* Status Icon (Right) */}
                  <div className="flex-shrink-0 w-6 flex items-center justify-center ml-2">
                    {state === 'selected-correct' && <Check size={18} className="text-emerald-500" strokeWidth={3} />}
                    {state === 'selected-wrong' && <X size={18} className="text-red-500" strokeWidth={3} />}
                    {state === 'missed-correct' && <Check size={16} className="text-emerald-500/50" />}
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
                        ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-700/90 dark:text-emerald-300/90' 
                        : 'bg-red-500/5 border-red-500/20 text-red-700/90 dark:text-red-300/90'}
                    `}>
                      <div className="flex gap-2">
                        <div className="mt-0.5 shrink-0 opacity-70">
                          {state === 'selected-correct' || state === 'missed-correct' ? <Check size={14} /> : <HelpCircle size={14} />}
                        </div>
                        <div>
                          <ReactMarkdown 
                              remarkPlugins={[remarkMath]}
                              rehypePlugins={[rehypeKatex]}
                              components={{
                                  p: ({node, ...props}) => <p className="m-0" {...props} />
                              }}>
                              {typeof option.explanation === 'string' ? option.explanation : "Keine Erklärung verfügbar."}
                          </ReactMarkdown>
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

      {/* Footer / Actions */}
      <div className="mt-8 flex justify-center min-h-[44px]">
         {/* Retry Button */}
        {hasSubmitted && !isCorrect && (
            <button 
                onClick={handleRetryClick}
                className="flex items-center gap-2 px-5 py-2.5 bg-base-200 hover:bg-base-300 text-base-content/80 rounded-full text-xs sm:text-sm font-bold transition-all hover:scale-105 active:scale-95 animate-in fade-in slide-in-from-bottom-2 shadow-sm border border-base-300/50 min-h-[44px]"
            >
                <RotateCcw size={14} />
                <span>Nochmal versuchen</span>
            </button>
        )}
        
        {/* Success / Score */}
         {hasSubmitted && isCorrect && (
            <div className="flex flex-col items-center gap-1.5 animate-in fade-in slide-in-from-bottom-2">
                 <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10 px-5 py-2.5 rounded-full border border-emerald-500/20 shadow-sm text-sm sm:text-base min-h-[44px]">
                    <Trophy size={16} />
                    <span>Richtig! 100%</span>
                </div>
            </div>
        )}
       </div>
    </div>
  );
};