import React, { useState, useRef, useCallback, useEffect } from 'react';

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

// ─── Static Plus Icon ───────────────────────────────────────────────────────

function PlusiIcon() {
  return (
    <svg viewBox="0 0 120 120" width={28} height={28} style={{ flexShrink: 0 }}>
      <rect x="40" y="5" width="40" height="110" rx="8" fill="#0a84ff"/>
      <rect x="5" y="35" width="110" height="40" rx="8" fill="#0a84ff"/>
      <rect x="40" y="35" width="40" height="40" fill="#0a84ff"/>
      <ellipse cx="48" cy="49" rx="7" ry="8" fill="white"/>
      <ellipse cx="49" cy="50" rx="4" ry="4" fill="#1a1a1a"/>
      <ellipse cx="72" cy="49" rx="7" ry="8" fill="white"/>
      <ellipse cx="71" cy="50" rx="4" ry="4" fill="#1a1a1a"/>
      <path d="M 48 68 Q 60 74 72 68" stroke="#1a1a1a" strokeWidth="3" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function AutonomyCard({
  autonomy,
  friendshipLevel = 0,
  friendshipLevelName = '',
  friendshipPoints = 0,
  friendshipMaxPoints = 0,
  mood = 'neutral',
  energy = 5,
  mascotEnabled = true,
  onMascotToggle,
  onSave,
}) {
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

  const friendshipPct = friendshipMaxPoints
    ? Math.min(100, (friendshipPoints / friendshipMaxPoints) * 100)
    : 0;

  return (
    <div style={CARD_STYLE}>

      {/* ── Row 1: Plusi icon + name/mood + master toggle ──────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
      }}>
        <PlusiIcon />

        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{
            fontSize: 16, fontWeight: 700,
            color: 'var(--ds-text-primary, rgba(255,255,255,0.88))',
          }}>Plusi</span>
          <span style={{
            fontSize: 12, marginLeft: 8,
            color: 'var(--ds-text-secondary, rgba(255,255,255,0.55))',
          }}>
            {mood} &middot; {energy}
          </span>
        </div>

        <Toggle
          on={mascotEnabled}
          onChange={onMascotToggle}
        />
      </div>

      {/* ── Row 2: Friendship bar ──────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18,
      }}>
        <span style={{
          fontSize: 11, fontWeight: 600,
          color: 'var(--ds-text-tertiary, rgba(255,255,255,0.3))',
          whiteSpace: 'nowrap',
        }}>
          Lv {friendshipLevel}{friendshipLevelName ? ` \u00B7 ${friendshipLevelName}` : ''}
        </span>

        <div style={{
          flex: 1, height: 3, borderRadius: 2,
          background: 'var(--ds-border, rgba(255,255,255,0.08))',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${friendshipPct}%`,
            height: '100%', borderRadius: 2,
            background: 'var(--ds-accent, #0A84FF)',
            transition: 'width 0.4s ease',
          }} />
        </div>

        <span style={{
          fontSize: 11,
          color: 'var(--ds-text-tertiary, rgba(255,255,255,0.3))',
          whiteSpace: 'nowrap',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {friendshipPoints}/{friendshipMaxPoints}
        </span>
      </div>

      {/* ── Token Budget ───────────────────────────────────────────── */}
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

      {/* ── Capabilities label ─────────────────────────────────────── */}
      <div style={{
        fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '0.8px',
        color: 'var(--ds-text-tertiary, rgba(255,255,255,0.22))',
        marginBottom: 12,
      }}>
        F&auml;higkeiten
      </div>

      {/* ── Capability toggles ─────────────────────────────────────── */}
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
  );
}
