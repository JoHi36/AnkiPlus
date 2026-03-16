import React, { useState } from 'react';
import { BookOpen, HelpCircle, Clock, CheckCircle2, XCircle, AlertCircle, ChevronDown } from 'lucide-react';

/**
 * SectionDivider — Replaces the old inline section header.
 * Shows: section title (clickable), performance summary, expandable detail panel.
 *
 * Props:
 *   section        - { id, cardId, title, createdAt, performanceData? }
 *   isFirst        - true if this is the very first section (no top margin)
 *   onGoToCard     - (cardId) => void
 *   lowScorePulse  - if true, show subtle pulse animation (adaptive highlighting)
 */
export default function SectionDivider({ section, isFirst = false, onGoToCard, lowScorePulse = false }) {
  const [expanded, setExpanded] = useState(false);

  if (!section) return null;

  const perf = section.performanceData;
  const hasPerformance = perf && perf.type;

  // Color based on score
  const getScoreColor = (score) => {
    if (score >= 90) return 'text-emerald-400';
    if (score >= 60) return 'text-amber-400';
    return 'text-red-400';
  };

  const getScoreBg = (score) => {
    if (score >= 90) return 'bg-emerald-500/10 border-emerald-500/20';
    if (score >= 60) return 'bg-amber-500/10 border-amber-500/20';
    return 'bg-red-500/10 border-red-500/20';
  };

  // Build compact performance summary text
  const renderPerformanceBadge = () => {
    if (!hasPerformance) return null;

    if (perf.type === 'mc') {
      // MC: show wrong/correct counts + score
      const wrongCount = perf.wrongAnswers ? perf.wrongAnswers.length : 0;
      return (
        <div className="flex items-center gap-2 text-[11px]">
          {wrongCount > 0 && (
            <span className="flex items-center gap-1 text-red-400/80">
              <XCircle size={11} />
              {wrongCount}×
            </span>
          )}
          <span className="flex items-center gap-1 text-emerald-400/80">
            <CheckCircle2 size={11} />
            {perf.correctAnswer || '?'}
          </span>
          <span className="text-base-content/20">·</span>
          <span className={`font-mono font-semibold ${getScoreColor(perf.score)}`}>
            {perf.score}%
          </span>
        </div>
      );
    }

    if (perf.type === 'text') {
      // Text answer: show score + summary counts
      const correctCount = perf.analysis ? perf.analysis.filter(a => a.type === 'correct').length : 0;
      const missingCount = perf.analysis ? perf.analysis.filter(a => a.type === 'missing').length : 0;
      const wrongCount = perf.analysis ? perf.analysis.filter(a => a.type === 'wrong').length : 0;
      return (
        <div className="flex items-center gap-2 text-[11px]">
          {correctCount > 0 && (
            <span className="flex items-center gap-1 text-emerald-400/80">
              <CheckCircle2 size={11} />
              {correctCount}
            </span>
          )}
          {missingCount > 0 && (
            <span className="flex items-center gap-1 text-amber-400/80">
              <AlertCircle size={11} />
              {missingCount}
            </span>
          )}
          {wrongCount > 0 && (
            <span className="flex items-center gap-1 text-red-400/80">
              <XCircle size={11} />
              {wrongCount}
            </span>
          )}
          <span className="text-base-content/20">·</span>
          <span className={`font-mono font-semibold ${getScoreColor(perf.score)}`}>
            {perf.score}%
          </span>
        </div>
      );
    }

    if (perf.type === 'flip') {
      // Flip: show time + rating
      return (
        <div className="flex items-center gap-2 text-[11px]">
          <span className="flex items-center gap-1 text-base-content/50">
            <Clock size={11} />
            {perf.timeSeconds}s
          </span>
          <span className="text-base-content/20">·</span>
          <span className={`font-semibold ${getScoreColor(perf.score)}`}>
            {perf.rating || 'Good'}
          </span>
        </div>
      );
    }

    return null;
  };

  // Expandable detail panel content
  const renderDetailPanel = () => {
    if (!hasPerformance) return null;

    if (perf.type === 'mc') {
      return (
        <div className="space-y-2">
          {/* Wrong answers */}
          {perf.wrongAnswers && perf.wrongAnswers.map((wa, idx) => (
            <div key={idx} className="flex items-start gap-2.5 text-[13px]">
              <div className="w-5 h-5 rounded flex items-center justify-center bg-red-500/15 text-red-400 font-mono text-[11px] font-bold flex-shrink-0 mt-0.5">
                {wa.letter}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-base-content/70 line-through decoration-red-500/30">{wa.text}</span>
                {wa.explanation && (
                  <p className="text-[12px] text-red-400/70 mt-0.5 leading-relaxed">{wa.explanation}</p>
                )}
              </div>
              <XCircle size={13} className="text-red-500/50 flex-shrink-0 mt-1" />
            </div>
          ))}
          {/* Correct answer */}
          {perf.correctAnswer && (
            <div className="flex items-start gap-2.5 text-[13px]">
              <div className="w-5 h-5 rounded flex items-center justify-center bg-emerald-500/15 text-emerald-400 font-mono text-[11px] font-bold flex-shrink-0 mt-0.5">
                {perf.correctAnswerLetter || '✓'}
              </div>
              <span className="text-emerald-400/90 font-medium">{perf.correctAnswer}</span>
              <CheckCircle2 size={13} className="text-emerald-500/50 flex-shrink-0 mt-1" />
            </div>
          )}
        </div>
      );
    }

    if (perf.type === 'text') {
      return (
        <div className="space-y-2.5">
          {/* User's answer */}
          {perf.userAnswer && (
            <div className="text-[13px] text-base-content/50 italic border-l-2 border-base-content/10 pl-3 mb-3">
              "{perf.userAnswer}"
            </div>
          )}
          {/* Analysis items */}
          {perf.analysis && perf.analysis.map((item, idx) => (
            <div key={idx} className="flex items-start gap-2.5 text-[13px]">
              {item.type === 'correct' && <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0 mt-0.5" />}
              {item.type === 'missing' && <AlertCircle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />}
              {item.type === 'wrong' && <XCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />}
              <span className="text-base-content/70">{item.text}</span>
            </div>
          ))}
        </div>
      );
    }

    if (perf.type === 'flip') {
      return (
        <div className="flex items-center gap-3 text-[13px] text-base-content/60">
          <Clock size={14} className="text-base-content/40" />
          <span>Antwortzeit: <strong className="text-base-content/80">{perf.timeSeconds}s</strong></span>
          <span className="text-base-content/20">→</span>
          <span className={`font-semibold ${getScoreColor(perf.score)}`}>{perf.rating || 'Good'}</span>
        </div>
      );
    }

    return null;
  };

  const isLoading = section.title === "Lade Titel...";

  return (
    <div
      id={section.id}
      data-section-id={section.id}
      className={`group/section backdrop-blur-sm ${isFirst ? 'pt-2 pb-4' : 'pt-6 pb-4 mt-6'}`}
      style={{ backgroundColor: '#161616' }}
    >
      {/* Row 1: Title badge + gradient line */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            if (section.cardId && onGoToCard) {
              onGoToCard(section.cardId);
            }
          }}
          className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full bg-base-content/5 border border-base-content/10 group-hover/section:bg-primary/10 group-hover/section:border-primary/20 transition-all cursor-pointer"
          title="Zur Lernkarte springen"
        >
          <BookOpen size={13} className="text-base-content/40 group-hover/section:text-primary/70 transition-colors" />
          <span className="text-xs font-medium text-base-content/50 group-hover/section:text-base-content/80 transition-colors">
            {isLoading ? (
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 border-2 border-base-content/20 border-t-primary/50 rounded-full animate-spin" />
                <span className="italic text-base-content/30">Generiere...</span>
              </span>
            ) : (
              typeof section.title === 'string' ? section.title : 'Lernkarte'
            )}
          </span>
        </button>
        <div className="flex-1 h-px bg-gradient-to-r from-base-content/15 via-base-content/8 to-transparent group-hover/section:from-primary/25 group-hover/section:via-primary/10 transition-all duration-300" />
      </div>

      {/* Row 2: Performance summary + expand button (only if performance data exists) */}
      {hasPerformance && (
        <div className="flex items-center gap-2 mt-2.5 pl-1">
          {renderPerformanceBadge()}

          {/* Expand/collapse button */}
          <button
            onClick={() => setExpanded(!expanded)}
            className={`
              ml-1 w-5 h-5 rounded-full flex items-center justify-center transition-all duration-200
              ${expanded
                ? 'bg-primary/15 text-primary/70'
                : 'bg-base-content/5 text-base-content/30 hover:bg-base-content/10 hover:text-base-content/50'}
              ${lowScorePulse && !expanded ? 'animate-pulse' : ''}
            `}
            title="Details anzeigen"
          >
            {expanded ? (
              <ChevronDown size={11} className="rotate-180 transition-transform duration-200" />
            ) : (
              <HelpCircle size={11} />
            )}
          </button>
        </div>
      )}

      {/* Row 3: Expandable detail panel */}
      {hasPerformance && expanded && (
        <div
          className={`mt-3 ml-1 p-3 rounded-lg border transition-all duration-300 animate-in fade-in slide-in-from-top-2 duration-200 ${getScoreBg(perf.score)}`}
        >
          {renderDetailPanel()}
        </div>
      )}
    </div>
  );
}
