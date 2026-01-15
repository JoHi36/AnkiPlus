import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, HelpCircle } from 'lucide-react';
import { useState } from 'react';

interface QuizOption {
  id: string;
  text: string;
  correct: boolean;
  explanation?: string;
}

interface DemoQuizCardProps {
  question: string;
  options: QuizOption[];
}

export function DemoQuizCard({ question, options }: DemoQuizCardProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-6 sm:p-8 bg-[#1A1A1A] relative overflow-hidden overflow-y-auto">
      <div className="w-full max-w-2xl mx-auto flex flex-col items-center">
        {/* Rescue Header */}
        <div className="flex items-center gap-2 mb-8 text-teal-500">
          <HelpCircle size={18} />
          <span className="text-xs font-bold tracking-widest uppercase">Rescue Mode</span>
        </div>

        {/* Question */}
        <h3 className="text-xl sm:text-2xl font-medium text-white mb-10 leading-snug text-center">
          {question}
        </h3>

        {/* Options */}
        <div className="space-y-4 w-full">
          {options.map((option, idx) => {
            const isSelected = selectedId === option.id;
            const showResult = selectedId !== null;
            const isCorrect = option.correct;

            let borderClass = 'border-white/5 hover:border-white/20';
            let bgClass = 'bg-[#222]';
            let textClass = 'text-neutral-400';

            if (showResult) {
              if (isCorrect) {
                borderClass = 'border-green-500/50';
                bgClass = 'bg-green-500/10';
                textClass = 'text-green-100';
              } else if (isSelected && !isCorrect) {
                borderClass = 'border-red-500/50';
                bgClass = 'bg-red-500/10';
                textClass = 'text-red-100';
              } else {
                bgClass = 'bg-[#222] opacity-50';
              }
            }

            return (
              <motion.div
                key={option.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
              >
                <button
                  disabled={showResult}
                  onClick={() => setSelectedId(option.id)}
                  className={`w-full p-4 rounded-xl border text-left transition-all duration-200 flex items-center justify-between group ${borderClass} ${bgClass}`}
                >
                  <div className="flex items-center gap-4">
                    <span className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold border shrink-0 ${showResult && isCorrect ? 'border-green-500 text-green-400' : 'border-white/10 text-neutral-500'}`}>
                      {option.id}
                    </span>
                    <span className={`text-sm ${textClass} group-hover:text-white transition-colors`}>
                      {option.text}
                    </span>
                  </div>
                  
                  {showResult && isCorrect && <CheckCircle2 className="text-green-500 w-5 h-5 shrink-0 ml-2" />}
                  {showResult && isSelected && !isCorrect && <XCircle className="text-red-500 w-5 h-5 shrink-0 ml-2" />}
                </button>
                
                {/* Explanation Reveal */}
                {showResult && (isSelected || isCorrect) && option.explanation && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className={`mt-2 ml-12 text-xs leading-relaxed ${isCorrect ? 'text-green-400/80' : 'text-red-400/80'}`}
                  >
                    {isCorrect ? "✅ " : "💡 "}{option.explanation}
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}