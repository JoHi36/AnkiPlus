import React, { useState } from 'react';
import { CheckCircle2, XCircle, RotateCcw, Trophy } from 'lucide-react';
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
 * MultipleChoiceCard - High End UI 3.0
 * Redesigned for maximum clarity and engagement.
 * Supports 5 options, explanations, and distinct reveal states.
 * Mobile-optimized with touch targets (min 44px height).
 */
export const MultipleChoiceCard: React.FC<MultipleChoiceCardProps> = ({ 
  question, 
  options, 
  onSelect, 
  onRetry 
}) => {
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  const handleSelect = (option: MultipleChoiceOption) => {
    if (selectedLetter) return; // Already selected
    
    setSelectedLetter(option.letter);
    setIsCorrect(option.isCorrect);
    if (onSelect) onSelect(option);
  };

  const handleRetryClick = () => {
    setSelectedLetter(null);
    setIsCorrect(null);
    if (onRetry) onRetry();
  };

  return (
    <div className="my-6 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
       {/* Header - Aligned left, no icon */}
       <div className="flex flex-col mb-5 px-1">
            <span className="text-[10px] font-bold text-base-content/40 uppercase tracking-widest mb-1.5">Quiz Time</span>
            <h3 className="text-base sm:text-lg font-bold text-base-content/95 leading-snug">
                <ReactMarkdown 
                    remarkPlugins={[remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    components={{
                        p: ({node, ...props}) => <span {...props} />
                    }}>
                    {typeof question === 'string' ? question : "Wähle die richtige Antwort"}
                </ReactMarkdown>
            </h3>
      </div>

      {/* Options Stack */}
      <div className="flex flex-col gap-3">
        {options.map((option, idx) => {
            const isSelected = selectedLetter === option.letter;
            const showResult = selectedLetter !== null;
            const isThisCorrect = option.isCorrect;
            
            // Visibility Logic:
            // 1. Show explanation for the SELECTED option always.
            // 2. If User is CORRECT (isCorrect===true), show explanations for ALL options.
            const showExplanation = showResult && (isSelected || isCorrect === true);
            
            // Styling Logic
            let containerClass = "bg-base-200/40 border-base-300/60 hover:bg-base-200/80 hover:border-base-300 hover:shadow-sm";
            let indicatorClass = "bg-base-300/50 text-base-content/70";
            let textClass = "text-base-content/90";
            
            if (showResult) {
                if (isSelected) {
                    if (isThisCorrect) {
                         // User Selected CORRECT -> Green High End
                         containerClass = "bg-emerald-500/10 border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/20";
                         indicatorClass = "bg-emerald-500 text-white shadow-md scale-105";
                         textClass = "text-base-content"; 
                    } else {
                         // User Selected WRONG -> Red High End
                         containerClass = "bg-red-500/10 border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.15)] ring-1 ring-red-500/20";
                         indicatorClass = "bg-red-500 text-white shadow-md scale-105";
                         textClass = "text-base-content";
                    }
                } else if (isCorrect === true) {
                    // User was RIGHT, this is another option (Wrong) -> Reveal explanation but keep neutral
                    containerClass = "bg-base-200/30 border-base-300/30";
                    indicatorClass = "bg-base-300/30 text-base-content/40";
                    textClass = "text-base-content/60";
                } else {
                    // User was WRONG, this is another option -> Fade out
                    containerClass = "opacity-30 border-transparent bg-base-200/10 grayscale filter blur-[0.5px]";
                    indicatorClass = "bg-base-200 text-base-content/20";
                }
            }

            return (
                <button
                    key={idx}
                    onClick={() => handleSelect(option)}
                    disabled={showResult}
                    className={`group relative w-full text-left p-3.5 sm:p-4 pr-4 rounded-xl border transition-all duration-300 ease-out min-h-[44px] ${containerClass} ${showResult ? 'cursor-default' : 'cursor-pointer active:scale-[0.99]'}`}
                >
                    <div className="flex items-start gap-3.5">
                        {/* Letter Indicator */}
                         <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center font-bold text-xs sm:text-sm transition-all duration-300 flex-shrink-0 mt-0.5 ${indicatorClass}`}>
                            {option.letter}
                        </div>
                        
                        <div className="flex-1 min-w-0 pt-0.5">
                            {/* Option Text */}
                            <div className={`text-sm sm:text-base leading-relaxed font-medium transition-colors duration-300 ${textClass}`}>
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
                            
                            {/* Explanation (Collapsible) */}
                            <div className={`grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${showExplanation ? 'grid-rows-[1fr] mt-3 pt-3 border-t border-base-content/5' : 'grid-rows-[0fr]'}`}>
                                <div className="overflow-hidden min-h-0">
                                    <div className="text-xs sm:text-sm leading-relaxed">
                                        <div className={`flex items-center gap-1.5 mb-1 text-xs font-bold uppercase tracking-wider ${isThisCorrect ? 'text-emerald-500' : 'text-red-500'}`}>
                                            {isThisCorrect ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                                            {isThisCorrect ? 'Richtig' : 'Falsch'}
                                        </div>
                                        <div className="text-base-content/70">
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
                            </div>
                        </div>

                         {/* Status Icon for Selected */}
                        {showResult && isSelected && (
                            <div className="absolute right-3 top-3 animate-in zoom-in duration-300">
                                {isThisCorrect ? (
                                    <CheckCircle2 size={18} className="text-emerald-500 drop-shadow-sm" />
                                ) : (
                                    <XCircle size={18} className="text-red-500 drop-shadow-sm" />
                                )}
                            </div>
                        )}
                    </div>
                </button>
            )
        })}
      </div>
      
       {/* Footer / Actions */}
       <div className="mt-6 flex justify-center min-h-[44px]">
         {/* Retry Button */}
        {selectedLetter && !isCorrect && (
            <button 
                onClick={handleRetryClick}
                className="flex items-center gap-2 px-5 py-2.5 bg-base-200 hover:bg-base-300 text-base-content/80 rounded-full text-xs sm:text-sm font-bold transition-all hover:scale-105 active:scale-95 animate-in fade-in slide-in-from-bottom-2 shadow-sm border border-base-300/50 min-h-[44px]"
            >
                <RotateCcw size={14} />
                <span>Nochmal versuchen</span>
            </button>
        )}
        
        {/* Success / Score */}
         {selectedLetter && isCorrect && (
            <div className="flex flex-col items-center gap-1.5 animate-in fade-in slide-in-from-bottom-2">
                 <div className="flex items-center gap-2 text-emerald-500 font-bold bg-emerald-500/10 px-5 py-2.5 rounded-full border border-emerald-500/20 shadow-sm text-sm sm:text-base min-h-[44px]">
                    <Trophy size={16} />
                    <span>Richtig! 100%</span>
                </div>
                 <span className="text-[10px] text-base-content/40 font-bold uppercase tracking-wide">Karte wird umgedreht...</span>
            </div>
        )}
       </div>
    </div>
  );
};

export default MultipleChoiceCard;


