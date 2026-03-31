import React from 'react';
import ThinkingIndicator from './ThinkingIndicator';
import { useThinkingPhases } from '../hooks/useThinkingPhases';

/**
 * Dock sub-components for the reviewer ChatInput's topSlot.
 * Used by App.jsx to build the topSlot based on reviewer state.
 */

const RATING_LABELS = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };
const RATING_COLORS = {
  1: 'var(--ds-red)', 2: 'var(--ds-yellow)',
  3: 'var(--ds-green)', 4: 'var(--ds-accent)',
};

export function DockLoading({ streamId, steps }) {
  const phases = useThinkingPhases(streamId, 'prufer');

  // If we have phases from ReasoningStore, use ThinkingIndicator
  if (phases) {
    return (
      <div style={{ padding: '12px 16px', minHeight: 48 }}>
        <ThinkingIndicator phases={phases} />
      </div>
    );
  }

  // Fallback: old spinner style but updated to SF Mono + thinking-dot-pulse
  const last = steps?.[steps.length - 1];
  return (
    <div style={{ padding: '12px 16px', minHeight: 48, display: 'flex', alignItems: 'baseline', gap: 8, fontFamily: 'var(--ds-font-mono)', fontSize: 11.5, letterSpacing: '0.02em' }}>
      <span className="thinking-dot-pulse" style={{ width: 5, height: 5, borderRadius: '50%', background: '#AF52DE', flexShrink: 0 }} />
      <span style={{ color: 'var(--ds-text-secondary)', fontWeight: 500 }}>
        {last?.label || 'Evaluation'}
      </span>
    </div>
  );
}

export function DockEvalResult({ result }) {
  if (!result) return null;
  const s = result.score || 0;
  const c = s >= 70 ? 'var(--ds-green)' : s >= 40 ? 'var(--ds-yellow)' : 'var(--ds-red)';
  const l = s >= 90 ? 'Easy' : s >= 70 ? 'Good' : s >= 40 ? 'Hard' : 'Again';
  return (
    <div style={{ padding: '12px 16px', minHeight: 48 }}>
      <div style={{ height: 3, background: 'var(--ds-border-subtle)', borderRadius: 2, overflow: 'hidden', marginBottom: 8 }}>
        <div style={{ width: `${s}%`, height: '100%', background: c, borderRadius: 2, transition: 'width 0.8s ease' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 8 }}>
        <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--ds-font-mono)', color: c }}>{s}%</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: c }}>{l}</span>
      </div>
      {result.feedback && <div style={{ fontSize: 12, color: 'var(--ds-text-secondary)', marginTop: 4, lineHeight: 1.4, textAlign: 'center' }}>{result.feedback}</div>}
    </div>
  );
}

export function DockTimer({ frozenElapsed, rating, onCycleRating }) {
  const c = RATING_COLORS[rating] || 'var(--ds-text-primary)';
  return (
    <div onClick={onCycleRating} title="Klick zum Ändern" style={{
      padding: '12px 16px', minHeight: 48, cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    }}>
      <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--ds-font-mono)', color: c }}>{Math.floor(frozenElapsed / 1000)}s</span>
      <span style={{ color: 'var(--ds-text-muted)', fontSize: 12 }}>{'\u2192'}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: c }}>{RATING_LABELS[rating]}</span>
    </div>
  );
}

export function DockStars({ stars, rating, isResult }) {
  const c = isResult ? (RATING_COLORS[rating] || 'var(--ds-text-primary)') : 'var(--ds-text-primary)';
  const l = isResult ? RATING_LABELS[rating] : (stars === 3 ? 'Gut' : stars === 2 ? 'Schwierig' : 'Wiederholen');
  return (
    <div style={{ padding: '12px 16px', minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{ fontSize: 22, lineHeight: 1, color: i < stars ? (isResult ? c : 'var(--ds-text-primary)') : 'var(--ds-border-medium)', transition: 'color 0.3s' }}>{'\u2605'}</span>
      ))}
      <span style={{ margin: '0 6px', color: 'var(--ds-text-muted)', fontSize: 12 }}>{'\u2192'}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: c }}>{l}</span>
    </div>
  );
}
