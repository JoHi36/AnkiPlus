import React, { useEffect, useState } from 'react';
import { Check, X, AlertCircle, ArrowRight, Lightbulb, List, Trophy, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';

/**
 * RealEvaluation Komponente - Medical Precision Redesign
 * Technisch, clean, kompakt.
 */
export default function RealEvaluation({ score, feedback, onStartQuiz, onStartHint }: any) {
  
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
            <div className="p-5">
                <p className="text-[15px] leading-relaxed text-white/80">
                    {feedback}
                </p>
            </div>

            {/* Action Bar (Footer) */}
            <div className="px-2 pb-2 grid grid-cols-2 gap-2">
                <button 
                    onClick={onStartHint}
                    className="flex items-center justify-center gap-2 py-3 rounded-lg text-xs font-semibold text-white/60 hover:text-white hover:bg-white/5 transition-all border border-transparent hover:border-white/10"
                >
                    <Lightbulb size={14} />
                    Hinweis geben
                </button>
                <button 
                    onClick={onStartQuiz}
                    className="flex items-center justify-center gap-2 py-3 rounded-lg text-xs font-bold bg-[#151515] text-white border border-white/10 hover:border-teal-500/50 hover:text-teal-400 hover:shadow-[0_0_15px_-5px_rgba(20,184,166,0.3)] transition-all group"
                >
                    <List size={14} className="group-hover:scale-110 transition-transform" />
                    Quiz starten
                </button>
            </div>
        </div>
    </motion.div>
  );
}
