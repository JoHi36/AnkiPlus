import React, { useState, useRef, useCallback, useEffect } from 'react';

const SECTION_TITLE_STYLE = {
  fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.8px', color: 'var(--ds-text-tertiary, rgba(255,255,255,0.22))',
  marginBottom: 10,
};

const CARD_STYLE = {
  background: 'var(--ds-bg-frosted)',
  borderRadius: 16,
  padding: 20,
  backdropFilter: 'blur(20px)',
  border: '1px solid var(--ds-border, rgba(255,255,255,0.06))',
};

const CAPABILITIES = [
  {
    key: 'can_reflect',
    label: 'Selbst reflektieren',
    desc: 'Denkt eigenständig über dein Lernen nach',
    locked: false,
  },
  {
    key: 'can_explore_cards',
    label: 'Karten erkunden',
    desc: 'Durchsucht deine Decks nach Verbindungen',
    locked: false,
  },
  {
    key: 'can_write_diary',
    label: 'Tagebuch schreiben',
    desc: 'Hält Gedanken und Entdeckungen fest',
    locked: false,
  },
  {
    key: 'can_comment_events',
    label: 'Event-Kommentare',
    desc: 'Ab Lv 3 · Freunde',
    locked: true,
    requiredLevel: 3,
  },
];

function Toggle({ on, onChange, disabled = false }) {
  const trackColor = disabled
    ? 'var(--ds-bg-overlay, #3A3A3C)'
    : on
      ? '#30D158'
      : 'var(--ds-bg-overlay, #3A3A3C)';

  return (
    <button
      onClick={disabled ? undefined : onChange}
      disabled={disabled}
      style={{
        width: 42,
        height: 26,
        borderRadius: 13,
        position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        border: 'none',
        transition: 'background 0.2s',
        background: trackColor,
        flexShrink: 0,
        padding: 0,
      }}
      aria-checked={on}
      role="switch"
    >
      <div
        style={{
          position: 'absolute',
          top: 2,
          left: on && !disabled ? 18 : 2,
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
        }}
      />
    </button>
  );
}

// ─── Custom Slider ──────────────────────────────────────────────────────────

function BudgetSlider({ min, max, step, value, onChange }) {
  const trackRef = useRef(null);
  const dragging = useRef(false);

  const pct = ((value - min) / (max - min)) * 100;

  const calcValue = useCallback((clientX) => {
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const raw = min + ratio * (max - min);
    const stepped = Math.round(raw / step) * step;
    return Math.max(min, Math.min(max, stepped));
  }, [min, max, step]);

  const handleTrackClick = useCallback((e) => {
    onChange(calcValue(e.clientX));
  }, [calcValue, onChange]);

  const handlePointerDown = useCallback((e) => {
    e.preventDefault();
    dragging.current = true;

    const onMove = (ev) => {
      if (!dragging.current) return;
      const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
      onChange(calcValue(clientX));
    };

    const onUp = () => {
      dragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
  }, [calcValue, onChange]);

  return (
    <div
      ref={trackRef}
      onClick={handleTrackClick}
      style={{
        position: 'relative',
        height: 24,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      {/* Track background */}
      <div style={{
        position: 'absolute',
        left: 0, right: 0,
        height: 6,
        borderRadius: 4,
        background: 'var(--ds-bg-overlay, #3A3A3C)',
      }} />

      {/* Filled portion */}
      <div style={{
        position: 'absolute',
        left: 0,
        width: `${pct}%`,
        height: 6,
        borderRadius: 4,
        background: 'linear-gradient(90deg, #30D158, #0A84FF)',
      }} />

      {/* Thumb */}
      <div
        onMouseDown={handlePointerDown}
        onTouchStart={handlePointerDown}
        style={{
          position: 'absolute',
          left: `${pct}%`,
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
          cursor: 'pointer',
          zIndex: 1,
        }}
      />
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function AutonomyCard({ autonomy, friendshipLevel = 0, onSave }) {
  const [config, setConfig] = useState(() => ({
    token_budget: 500,
    can_reflect: true,
    can_explore_cards: false,
    can_write_diary: false,
    can_comment_events: false,
    ...autonomy,
  }));

  // Sync config if autonomy prop changes externally
  useEffect(() => {
    if (autonomy) {
      setConfig(prev => ({ ...prev, ...autonomy }));
    }
  }, [autonomy]);

  const debounceRef = useRef(null);

  const triggerSave = useCallback((nextConfig) => {
    if (!onSave) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSave(nextConfig);
    }, 500);
  }, [onSave]);

  const handleBudgetChange = useCallback((value) => {
    setConfig(prev => {
      const next = { ...prev, token_budget: value };
      triggerSave(next);
      return next;
    });
  }, [triggerSave]);

  const handleCapabilityToggle = useCallback((key) => {
    setConfig(prev => {
      const next = { ...prev, [key]: !prev[key] };
      triggerSave(next);
      return next;
    });
  }, [triggerSave]);

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Section label */}
      <div style={SECTION_TITLE_STYLE}>Autonomie</div>

      {/* Card wrapper */}
      <div style={CARD_STYLE}>

        {/* Token Budget */}
        <div style={{ marginBottom: 20 }}>
          <div style={{
            display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', marginBottom: 10,
          }}>
            <span style={{
              fontSize: 13, fontWeight: 500,
              color: 'var(--ds-text-secondary, rgba(255,255,255,0.7))',
            }}>
              Token-Budget
            </span>
            <span style={{
              fontSize: 13, fontWeight: 600,
              color: 'var(--ds-accent, #0A84FF)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {config.token_budget} / h
            </span>
          </div>

          <BudgetSlider
            min={100}
            max={2000}
            step={100}
            value={config.token_budget}
            onChange={handleBudgetChange}
          />
        </div>

        {/* Capabilities label */}
        <div style={{
          fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '0.8px',
          color: 'var(--ds-text-tertiary, rgba(255,255,255,0.22))',
          marginBottom: 12,
        }}>
          Fähigkeiten
        </div>

        {/* Capability toggles */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {CAPABILITIES.map((cap, i) => {
            const isLocked = cap.locked && friendshipLevel < (cap.requiredLevel ?? 99);
            const isOn = !isLocked && !!config[cap.key];

            return (
              <div
                key={cap.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  paddingTop: i === 0 ? 0 : 12,
                  paddingBottom: i < CAPABILITIES.length - 1 ? 12 : 0,
                  borderBottom: i < CAPABILITIES.length - 1
                    ? '1px solid var(--ds-border-subtle, rgba(255,255,255,0.06))'
                    : 'none',
                  opacity: isLocked ? 0.4 : 1,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 500,
                    color: 'var(--ds-text-secondary, rgba(255,255,255,0.7))',
                    marginBottom: 2,
                  }}>
                    {cap.label}
                  </div>
                  <div style={{
                    fontSize: 11,
                    color: 'var(--ds-text-tertiary, rgba(255,255,255,0.3))',
                    lineHeight: 1.4,
                  }}>
                    {cap.desc}
                  </div>
                </div>
                <Toggle
                  on={isOn}
                  onChange={() => handleCapabilityToggle(cap.key)}
                  disabled={isLocked}
                />
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
