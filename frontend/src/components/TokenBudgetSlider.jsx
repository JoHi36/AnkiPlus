import React, { useState, useRef, useCallback, useEffect } from 'react';

const MIN_BUDGET = 100;
const MAX_BUDGET = 2000;
const STEP = 50;

function estimateActivations(budget) {
  // Rough estimate: ~150 tokens per activation on average
  return Math.round(budget / 150);
}

export default function TokenBudgetSlider({ value = 500, onChange }) {
  const [localValue, setLocalValue] = useState(value);
  const [isDragging, setIsDragging] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const hideTimerRef = useRef(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = useCallback((e) => {
    const v = Number(e.target.value);
    const snapped = Math.round(v / STEP) * STEP;
    setLocalValue(snapped);
    setShowHint(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  }, []);

  const handlePointerDown = useCallback(() => {
    setIsDragging(true);
    setShowHint(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  }, []);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    // Save on release
    if (onChange) onChange(localValue);
    window.ankiBridge?.addMessage('savePlusiAutonomy', { token_budget_per_hour: localValue });
    // Fade hint after release
    hideTimerRef.current = setTimeout(() => setShowHint(false), 1500);
  }, [localValue, onChange]);

  const pct = ((localValue - MIN_BUDGET) / (MAX_BUDGET - MIN_BUDGET)) * 100;
  const activations = estimateActivations(localValue);

  return (
    <div style={{
      padding: '8px 16px 4px',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      {/* Value row */}
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
      }}>
        <span style={{
          fontSize: 11,
          color: 'var(--ds-text-tertiary, rgba(255,255,255,0.35))',
          letterSpacing: '0.3px',
        }}>
          Token-Budget
        </span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--ds-accent, #0A84FF)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {localValue}/h
          </span>
          {/* Hint — appears while dragging, fades after release */}
          <span style={{
            fontSize: 10,
            color: 'var(--ds-text-quaternary, rgba(255,255,255,0.2))',
            opacity: showHint ? 1 : 0,
            transition: 'opacity 0.4s ease',
            whiteSpace: 'nowrap',
          }}>
            ≈ {activations} Aktiv./h
          </span>
        </div>
      </div>

      {/* Slider track */}
      <div style={{ position: 'relative', height: 20, display: 'flex', alignItems: 'center' }}>
        {/* Background track */}
        <div style={{
          position: 'absolute',
          left: 0, right: 0,
          height: 4, borderRadius: 2,
          background: 'rgba(128,128,128,0.2)',
        }} />
        {/* Filled track — gradient green to blue */}
        <div style={{
          position: 'absolute',
          left: 0,
          width: `${pct}%`,
          height: 4, borderRadius: 2,
          background: 'linear-gradient(90deg, #30D158, #0A84FF)',
          transition: isDragging ? 'none' : 'width 0.15s ease',
        }} />
        {/* Native range input — styled transparent, thumb via CSS */}
        <input
          type="range"
          min={MIN_BUDGET}
          max={MAX_BUDGET}
          step={STEP}
          value={localValue}
          onChange={handleChange}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onTouchEnd={handlePointerUp}
          style={{
            position: 'absolute',
            left: 0, right: 0,
            width: '100%',
            height: 20,
            margin: 0,
            appearance: 'none',
            WebkitAppearance: 'none',
            background: 'transparent',
            cursor: 'pointer',
            outline: 'none',
          }}
          className="token-budget-range"
        />
      </div>
    </div>
  );
}
