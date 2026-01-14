import React, { useEffect, useState } from 'react';
import { CheckCircle, Zap } from 'lucide-react';

/**
 * ReviewFeedback Komponente
 * Zeigt eine animierte Progress-Bar für Antworten an.
 * Löst Auto-Flip aus, wenn Score 100% erreicht.
 */
export default function ReviewFeedback({ score, onAutoFlip }) {
  const [displayedScore, setDisplayedScore] = useState(0);
  const [showFlipButton, setShowFlipButton] = useState(false);

  // Animation des Scores
  useEffect(() => {
    const timer = setTimeout(() => {
      setDisplayedScore(score);
    }, 100);
    return () => clearTimeout(timer);
  }, [score]);

  // Auto-Flip Trigger bei 100%
  useEffect(() => {
    if (score >= 100) {
      const timer = setTimeout(() => {
        setShowFlipButton(true);
        if (onAutoFlip) {
            // Kurze Verzögerung für den "Wow"-Effekt, dann Flip
            setTimeout(() => {
                onAutoFlip();
            }, 800);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [score, onAutoFlip]);

  // Farbe basierend auf Score
  const getColor = (s) => {
    if (s >= 90) return 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)]';
    if (s >= 60) return 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.3)]';
    return 'bg-red-400 shadow-[0_0_5px_rgba(248,113,113,0.2)]';
  };

  const colorClass = getColor(displayedScore);

  return (
    <div className="mt-4 mb-2 select-none animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-center justify-between mb-1.5 text-xs font-medium text-base-content/60 px-1">
        <span>Antwort-Qualität</span>
        <span className="font-mono">{displayedScore}%</span>
      </div>
      
      {/* Progress Bar Container */}
      <div className="h-2 w-full bg-base-300/50 rounded-full overflow-hidden relative">
        {/* Animated Bar */}
        <div 
          className={`h-full rounded-full transition-all duration-1000 ease-out ${colorClass}`}
          style={{ width: `${displayedScore}%` }}
        />
        
        {/* Glanz-Effekt */}
        <div 
            className="absolute top-0 bottom-0 w-[40px] bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-[-20deg]"
            style={{ 
                left: `${displayedScore}%`, 
                transform: 'translateX(-100%)',
                opacity: displayedScore > 0 ? 1 : 0
            }} 
        />
      </div>

      {/* Success Message bei 100% */}
      {showFlipButton && (
        <div className="mt-3 flex items-center justify-center gap-2 text-emerald-500 text-sm font-medium animate-in zoom-in duration-300">
            <CheckCircle size={14} />
            <span>Perfekt! Karte wird umgedreht...</span>
        </div>
      )}
    </div>
  );
}


