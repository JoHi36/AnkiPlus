import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, AlertCircle, ArrowRight, RotateCcw } from 'lucide-react';

/**
 * ReviewResult Komponente
 * Zeigt eine hochwertige Auswertung der Antwort an.
 * High-End Polish: Bessere Farben, Animationen und Typografie.
 * Neu: Kein Pokal mehr, interaktiver Button statt passivem Banner.
 */

interface AnalysisItem {
  type: string;
  text: string;
}

export interface ReviewResultData {
  score: number;
  feedback_title?: string;
  analysis?: AnalysisItem[];
  suggestion?: string;
}

export interface ReviewResultProps {
  data: ReviewResultData;
  onAutoFlip?: () => void;
}

export default function ReviewResult({ data, onAutoFlip }: ReviewResultProps) {
  const [visible, setVisible] = useState(false);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    setVisible(true);
  }, [data]);

  const handleFlip = () => {
    setFlipped(true);
    if (onAutoFlip) {
        onAutoFlip();
    }
  };

  // Color Logic — uses design-system CSS custom properties (no hardcoded colors)
  const getTheme = (s: number) => {
    if (s >= 90) return {
        bg: { background: 'var(--ds-green-5)' } as React.CSSProperties,
        border: { borderColor: 'var(--ds-green-20)' } as React.CSSProperties,
        text: { color: 'var(--ds-green)' } as React.CSSProperties,
        icon: { color: 'var(--ds-green)' } as React.CSSProperties,
        glow: { boxShadow: '0 0 30px var(--ds-green-10)' } as React.CSSProperties,
        button: { background: 'var(--ds-green)', color: 'white' } as React.CSSProperties,
    };
    if (s >= 60) return {
        bg: { background: 'var(--ds-yellow-5)' } as React.CSSProperties,
        border: { borderColor: 'var(--ds-yellow-20)' } as React.CSSProperties,
        text: { color: 'var(--ds-yellow)' } as React.CSSProperties,
        icon: { color: 'var(--ds-yellow)' } as React.CSSProperties,
        glow: { boxShadow: '0 0 30px var(--ds-yellow-10)' } as React.CSSProperties,
        button: { background: 'var(--ds-yellow)', color: 'white' } as React.CSSProperties,
    };
    return {
        bg: { background: 'var(--ds-red-5)' } as React.CSSProperties,
        border: { borderColor: 'var(--ds-red-20)' } as React.CSSProperties,
        text: { color: 'var(--ds-red)' } as React.CSSProperties,
        icon: { color: 'var(--ds-red)' } as React.CSSProperties,
        glow: { boxShadow: '0 0 20px var(--ds-red-10)' } as React.CSSProperties,
        button: { background: 'var(--ds-red)', color: 'white' } as React.CSSProperties,
    };
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'correct': return <CheckCircle2 size={18} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--ds-green)' }} />;
      case 'missing': return <AlertCircle size={18} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--ds-yellow)' }} />;
      case 'wrong': return <XCircle size={18} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--ds-red)' }} />;
      default: return null;
    }
  };

  const theme = getTheme(data.score);

  return (
    <div className={`my-6 overflow-hidden rounded-2xl border backdrop-blur-md transition-all duration-700 ease-out transform ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`} style={{ ...theme.bg, ...theme.border, ...theme.glow }}>

      {/* Header mit Score */}
      <div className="relative p-6 flex items-center gap-5 border-b border-base-content/5">
        {/* Animated Score Ring/Circle */}
        <div className="relative w-20 h-20 flex-shrink-0 flex items-center justify-center">
            {/* Background Circle */}
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 36 36">
                <path className="text-base-content/5" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="2.5" />
                {/* Progress Circle */}
                <path
                    className="drop-shadow-md transition-all duration-1500 ease-out"
                    style={theme.icon}
                    strokeDasharray={`${visible ? data.score : 0}, 100`}
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                />
            </svg>
            <div className="flex flex-col items-center leading-none">
                <span className="text-2xl font-bold tracking-tight" style={theme.text}>{data.score}</span>
                <span className="text-[10px] font-medium text-base-content/40 uppercase tracking-widest mt-0.5">Score</span>
            </div>
        </div>

        <div className="flex-1 min-w-0">
            <h3 className="font-bold text-xl leading-tight mb-1.5" style={theme.text}>{typeof data.feedback_title === 'string' ? data.feedback_title : "Auswertung"}</h3>
            <p className="text-[15px] text-base-content/70 leading-relaxed">
                {data.score >= 100 ? "Hervorragend! Du hast die Karte vollständig gemeistert." : data.score >= 60 ? "Gute Leistung. Ein paar Details fehlen noch." : "Das war ein Anfang. Schau dir die Lücken an."}
            </p>
        </div>
      </div>

      {/* Analysis List */}
      <div className="p-5 bg-base-100/40">
        <div className="space-y-4">
            {data.analysis && Array.isArray(data.analysis) && data.analysis.map((item, idx) => (
                <div key={idx} className="flex gap-4 text-[15px] leading-relaxed animate-in slide-in-from-left-4 fade-in duration-500" style={{ animationDelay: `${200 + idx * 100}ms` }}>
                    {getIcon(item.type)}
                    <span className="text-base-content/80 font-medium">{typeof item.text === 'string' ? item.text : String(item.text || '')}</span>
                </div>
            ))}
        </div>

        {/* Suggestion / Tip */}
        {data.suggestion && (
            <div className="mt-6 pt-4 border-t border-base-content/5 flex gap-3 text-sm text-base-content/60 italic animate-in fade-in duration-700 delay-500">
                <div className="w-8 h-8 rounded-full bg-base-content/5 flex items-center justify-center flex-shrink-0">
                    <ArrowRight size={14} />
                </div>
                <div className="py-1.5">
                    <span className="font-semibold not-italic text-base-content/40 text-xs uppercase tracking-wide block mb-0.5">Nächster Schritt</span>
                    <span>{typeof data.suggestion === 'string' ? data.suggestion : String(data.suggestion || '')}</span>
                </div>
            </div>
        )}
      </div>

      {/* Interactive Flip Button (nur bei 100% oder gutem Score) */}
      {data.score >= 100 && (
        <div className="p-4 bg-base-100/20 border-t border-base-content/5 flex justify-center">
            <button
                onClick={handleFlip}
                disabled={flipped}
                className={`group relative flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-bold uppercase tracking-wide transition-all duration-300 hover:scale-105 active:scale-95 shadow-lg ${flipped ? 'opacity-50 cursor-default' : ''}`}
                style={theme.button}
            >
                {flipped ? (
                    <>
                        <CheckCircle2 size={16} />
                        <span>Umdrehen...</span>
                    </>
                ) : (
                    <>
                        <span>Karte umdrehen</span>
                        <RotateCcw size={16} className="group-hover:rotate-180 transition-transform duration-500" />
                    </>
                )}
            </button>
        </div>
      )}
    </div>
  );
}
