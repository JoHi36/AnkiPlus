import React, { useState, useCallback, useRef, useEffect } from 'react';

const LEVELS = [
  { key: 'chat', label: 'Nur Chat', budget: 0, tip: 'Plusi reagiert nur wenn du ihn ansprichst. Keine proaktiven Aktionen, keine Token-Kosten.' },
  { key: 'sparsam', label: 'Sparsam', budget: 1500, tip: 'Plusi wacht ~1× pro Stunde auf, stöbert in deinen Karten und reflektiert. ~1.500 Tokens/h.' },
  { key: 'aktiv', label: 'Aktiv', budget: 4000, tip: 'Plusi wacht alle 20–30 Min auf, sucht aktiv nach Mustern und schreibt Tagebuch. ~4.000 Tokens/h.' },
];

const SEG_COUNT = LEVELS.length;
const SEG_WIDTH = 100 / SEG_COUNT;
const PAD = 16; // equal padding all sides

export default function TokenBudgetSlider({ value, onChange }) {
  const [active, setActive] = useState(() => {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') {
      if (value <= 0) return 'chat';
      if (value <= 2000) return 'sparsam';
      return 'aktiv';
    }
    return 'sparsam';
  });

  const [showTip, setShowTip] = useState(false);
  const tipTimeout = useRef(null);
  const activeIdx = Math.max(0, LEVELS.findIndex(l => l.key === active));

  // Auto-dismiss tooltip
  useEffect(() => {
    if (showTip) {
      tipTimeout.current = setTimeout(() => setShowTip(false), 4000);
      return () => clearTimeout(tipTimeout.current);
    }
  }, [showTip]);

  const handleSelect = useCallback((level) => {
    setActive(level.key);
    setShowTip(false);
    if (onChange) onChange(level.key);
    window.ankiBridge?.addMessage('savePlusiAutonomy', {
      activity_level: level.key,
      budget_per_hour: level.budget,
      enabled: level.key !== 'chat',
    });
  }, [onChange]);

  const toggleTip = useCallback((e) => {
    e.stopPropagation();
    setShowTip(prev => !prev);
  }, []);

  const activeLevel = LEVELS[activeIdx];

  return (
    <div style={{
      padding: `${PAD}px ${PAD}px`,
      position: 'relative',
    }}>
      {/* Tooltip bubble with arrow */}
      {showTip && (
        <>
          <div
            onClick={() => setShowTip(false)}
            style={{
              position: 'absolute',
              bottom: `calc(100% - ${PAD - 4}px)`,
              left: PAD + 8,
              right: PAD + 8,
              background: 'var(--ds-bg-overlay)',
              borderRadius: 10,
              padding: '10px 14px',
              fontSize: 11.5,
              lineHeight: 1.55,
              color: 'var(--ds-text-secondary)',
              boxShadow: 'var(--ds-shadow-sm)',
              zIndex: 20,
              cursor: 'pointer',
              animation: 'dsTipIn 0.15s ease',
            }}
          >
            {activeLevel.tip}
          </div>
          {/* Arrow */}
          <div style={{
            position: 'absolute',
            bottom: `calc(100% - ${PAD + 2}px)`,
            left: `calc(${(activeIdx + 0.5) * SEG_WIDTH}% + ${PAD}px - 6px)`,
            width: 0,
            height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: '6px solid var(--ds-bg-overlay)',
            zIndex: 21,
            animation: 'dsTipIn 0.15s ease',
          }} />
          <style>{`@keyframes dsTipIn { from { opacity:0; transform:translateY(3px) } to { opacity:1; transform:translateY(0) } }`}</style>
        </>
      )}

      {/* Segmented control */}
      <div style={{
        position: 'relative',
        display: 'flex',
        background: 'var(--ds-hover-tint)',
        borderRadius: 10,
        padding: 3,
      }}>
        {/* Sliding pill */}
        <div style={{
          position: 'absolute',
          top: 3,
          bottom: 3,
          left: `calc(${activeIdx * SEG_WIDTH}% + 3px)`,
          width: `calc(${SEG_WIDTH}% - 6px)`,
          borderRadius: 7,
          background: 'var(--ds-active-tint)',
          transition: 'left 0.2s ease',
          pointerEvents: 'none',
        }} />

        {LEVELS.map((level) => {
          const isActive = active === level.key;
          return (
            <button
              key={level.key}
              onClick={() => handleSelect(level)}
              style={{
                flex: 1,
                position: 'relative',
                zIndex: 1,
                padding: '7px 0',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: isActive ? 500 : 400,
                color: isActive
                  ? 'var(--ds-text-primary)'
                  : 'var(--ds-text-muted)',
                transition: 'color 0.15s',
                whiteSpace: 'nowrap',
                fontFamily: '-apple-system, Inter, system-ui, sans-serif',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
              }}
            >
              {level.label}
              {isActive && (
                <svg
                  onClick={toggleTip}
                  width="11"
                  height="11"
                  viewBox="0 0 16 16"
                  fill="none"
                  style={{ cursor: 'pointer', flexShrink: 0, opacity: 0.35 }}
                >
                  <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                  <text x="8" y="11.5" textAnchor="middle" fill="currentColor" fontSize="10" fontWeight="600">?</text>
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
