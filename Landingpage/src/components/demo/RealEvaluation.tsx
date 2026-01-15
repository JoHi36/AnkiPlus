import React, { useEffect, useState } from 'react';
import { Check, X, AlertCircle, ArrowRight, Lightbulb, List, Trophy, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';

/**
 * RealEvaluation Komponente - Medical Precision Redesign
 * Technisch, clean, kompakt.
 */
export default function RealEvaluation({ score, feedback, onStartQuiz, onStartHint }: any) {
  const [showHint, setShowHint] = useState(false);
  
  // Color Logic
  const getTheme = (s: number) => {
    if (s >= 90) return {
        text: 'text-emerald-400',
        border: 'border-emerald-500/30',
        bg: 'bg-emerald-500/5',
        progress: 'bg-emerald-500'
    };
    if (s >= 60) return {
        text: 'text-teal-400',
        border: 'border-teal-500/30',
        bg: 'bg-teal-500/5',
        progress: 'bg-teal-500'
    };
    return {
        text: 'text-amber-400',
        border: 'border-amber-500/30',
        bg: 'bg-amber-500/5',
        progress: 'bg-amber-500'
    };
  };

  const theme = getTheme(score);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full font-sans"
    >
        {/* Main Card */}
        <div className={`relative overflow-hidden rounded-xl border ${theme.border} ${theme.bg} backdrop-blur-sm`}>
            
            {/* Top Bar: Score & Status */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                <div className="flex items-center gap-3">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-lg bg-[#151515] border border-white/10 shadow-sm ${theme.text}`}>
                        {score >= 90 ? <Trophy size={18} /> : score >= 60 ? <Check size={18} /> : <TrendingUp size={18} />}
                    </div>
                    <div>
                        <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Confidence Score</div>
                        <div className={`text-xl font-bold ${theme.text} tabular-nums leading-none mt-0.5`}>
                            {score}<span className="text-sm opacity-60">%</span>
                        </div>
                    </div>
                </div>

                {/* Progress Bar Visual */}
                <div className="hidden sm:flex flex-col items-end gap-1 w-32">
                    <div className="h-1.5 w-full bg-[#151515] rounded-full overflow-hidden">
                        <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${score}%` }}
                            transition={{ duration: 1, ease: "easeOut" }}
                            className={`h-full ${theme.progress} rounded-full`}
                        />
                    </div>
                </div>
            </div>

            {/* Feedback Text */}
            <div className="p-5 prose prose-sm prose-invert max-w-none">
                <ReactMarkdown>{feedback}</ReactMarkdown>
            </div>

            {/* Action Bar (Footer) */}
            <div className="px-2 pb-2 flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-2">
                    <button 
                        onClick={() => setShowHint(!showHint)}
                        className="flex items-center justify-center gap-2 py-3 rounded-lg text-xs font-medium text-white/50 hover:text-white hover:bg-white/5 transition-all"
                    >
                        <Lightbulb size={14} />
                        {showHint ? "Hinweis verbergen" : "Hinweis geben"}
                    </button>
                    <button 
                        onClick={onStartQuiz}
                        className="flex items-center justify-center gap-2 py-3 rounded-lg text-xs font-bold text-white/80 hover:text-teal-400 hover:bg-teal-500/10 transition-all group"
                    >
                        <List size={14} className="group-hover:scale-110 transition-transform" />
                        Quiz starten
                    </button>
                </div>

                {/* Expandable Hint */}
                <AnimatePresence>
                    {showHint && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="p-3 mx-2 mb-2 rounded bg-white/5 border border-white/5 text-xs text-white/60 text-center">
                                Du könntest deine Antwort theoretisch noch weiter ausführen...
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    </motion.div>
  );
}
