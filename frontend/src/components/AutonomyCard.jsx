import React, { useState, useRef, useCallback, useEffect } from 'react';

const CARD_STYLE = {
  background: 'var(--ds-bg-frosted)',
  borderRadius: 16,
  padding: 20,
  backdropFilter: 'blur(20px)',
  border: '1px solid var(--ds-border)',
};

const CAPABILITIES = [
  {
    key: 'can_reflect',
    label: 'Selbst reflektieren',
    locked: false,
  },
  {
    key: 'can_explore_cards',
    label: 'Karten erkunden',
    locked: false,
  },
  {
    key: 'can_write_diary',
    label: 'Tagebuch schreiben',
    locked: false,
  },
  {
    key: 'can_comment_events',
    label: 'Event-Kommentare',
    locked: true,
    requiredLevel: 3,
  },
];

function Toggle({ on, onChange, disabled = false }) {
  const trackColor = disabled
    ? 'var(--ds-bg-overlay)'
    : on
      ? 'var(--ds-green)'
      : 'var(--ds-bg-overlay)';

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
          background: 'var(--ds-bg-canvas)',
          transition: 'left 0.2s',
          boxShadow: 'var(--ds-shadow-sm)',
        }}
      />
    </button>
  );
}

// ─── Activity Level Slider (Sparsam / Aktiv) ────────────────────────────────

const ACTIVITY_LEVELS = [
  { key: 'chat', label: 'Nur Chat', budget: 0, desc: 'Keine proaktiven Aktionen' },
  { key: 'sparsam', label: 'Sparsam', budget: 1500, desc: 'Wacht ~1× pro Stunde auf' },
  { key: 'aktiv', label: 'Aktiv', budget: 4000, desc: 'Wacht alle 20–30 Min auf' },
];

function ActivitySegments({ value, onChange }) {
  const containerRef = useRef(null);
  const [pillStyle, setPillStyle] = useState({});

  useEffect(() => {
    if (!containerRef.current) return;
    const buttons = containerRef.current.querySelectorAll('[data-level]');
    const idx = ACTIVITY_LEVELS.findIndex(l => l.key === value);
    const btn = buttons[idx >= 0 ? idx : 0];
    if (btn) {
      setPillStyle({ left: btn.offsetLeft, width: btn.offsetWidth });
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        display: 'flex',
        background: 'var(--ds-bg-overlay)',
        borderRadius: 8,
        padding: 2,
      }}
    >
      <div style={{
        position: 'absolute', top: 2, height: 'calc(100% - 4px)',
        borderRadius: 6,
        background: 'var(--ds-accent-10)',
        border: '1px solid var(--ds-accent-20)',
        transition: 'left 0.25s ease, width 0.25s ease',
        ...pillStyle,
      }} />
      {ACTIVITY_LEVELS.map((level) => (
        <button
          key={level.key}
          data-level={level.key}
          onClick={() => onChange(level.key)}
          style={{
            flex: 1, position: 'relative', zIndex: 1,
            padding: '6px 4px', border: 'none', background: 'none',
            cursor: 'pointer', fontSize: 11, whiteSpace: 'nowrap',
            fontWeight: value === level.key ? 600 : 400,
            color: value === level.key
              ? 'var(--ds-accent)'
              : 'var(--ds-text-tertiary)',
            transition: 'color 0.2s',
            fontFamily: '-apple-system, Inter, system-ui, sans-serif',
          }}
        >
          {level.label}
        </button>
      ))}
    </div>
  );
}

// ─── Static Plus Icon ───────────────────────────────────────────────────────

function PlusiIcon() {
  return (
    <svg viewBox="0 0 120 120" width={28} height={28} style={{ flexShrink: 0 }}>
      <rect x="40" y="5" width="40" height="110" rx="8" fill="var(--ds-accent)"/>
      <rect x="5" y="35" width="110" height="40" rx="8" fill="var(--ds-accent)"/>
      <rect x="40" y="35" width="40" height="40" fill="var(--ds-accent)"/>
      <ellipse cx="48" cy="49" rx="7" ry="8" fill="white"/>
      <ellipse cx="49" cy="50" rx="4" ry="4" fill="var(--ds-bg-deep)"/>
      <ellipse cx="72" cy="49" rx="7" ry="8" fill="white"/>
      <ellipse cx="71" cy="50" rx="4" ry="4" fill="var(--ds-bg-deep)"/>
      <path d="M 48 68 Q 60 74 72 68" stroke="var(--ds-bg-deep)" strokeWidth="3" fill="none" strokeLinecap="round"/>
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
  onSave,
}) {
  const [config, setConfig] = useState(() => ({
    activity_level: 'sparsam',
    budget_per_hour: 1500,
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

  const handleActivityChange = useCallback((level) => {
    const levelData = ACTIVITY_LEVELS.find(l => l.key === level) || ACTIVITY_LEVELS[0];
    setConfig(prev => {
      const next = {
        ...prev,
        activity_level: level,
        budget_per_hour: levelData.budget,
        enabled: level !== 'chat',
      };
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

      {/* ── Row 1: Plusi icon + name/mood ──────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
      }}>
        <PlusiIcon />

        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{
            fontSize: 16, fontWeight: 700,
            color: 'var(--ds-text-primary)',
          }}>Plusi</span>
          <span style={{
            fontSize: 12, marginLeft: 8,
            color: 'var(--ds-text-secondary)',
          }}>
            {mood} &middot; {energy}
          </span>
        </div>
      </div>

      {/* ── Row 2: Friendship bar ──────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18,
      }}>
        <span style={{
          fontSize: 11, fontWeight: 600,
          color: 'var(--ds-text-tertiary)',
          whiteSpace: 'nowrap',
        }}>
          Lv {friendshipLevel}{friendshipLevelName ? ` \u00B7 ${friendshipLevelName}` : ''}
        </span>

        <div style={{
          flex: 1, height: 3, borderRadius: 2,
          background: 'var(--ds-border)',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${friendshipPct}%`,
            height: '100%', borderRadius: 2,
            background: 'var(--ds-accent)',
            transition: 'width 0.4s ease',
          }} />
        </div>

        <span style={{
          fontSize: 11,
          color: 'var(--ds-text-tertiary)',
          whiteSpace: 'nowrap',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {friendshipPoints}/{friendshipMaxPoints}
        </span>
      </div>

      {/* ── Activity Level ─────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', marginBottom: 6,
        }}>
          <span style={{
            fontSize: 13, fontWeight: 500,
            color: 'var(--ds-text-secondary)',
          }}>
            Aktivität
          </span>
          <span style={{
            fontSize: 11,
            color: 'var(--ds-text-tertiary)',
          }}>
            {(ACTIVITY_LEVELS.find(l => l.key === config.activity_level) || ACTIVITY_LEVELS[0]).desc}
          </span>
        </div>

        <ActivitySegments
          value={config.activity_level}
          onChange={handleActivityChange}
        />
      </div>

      {/* ── Separator line ───────────────────────────────────────── */}
      <div style={{
        height: 1,
        background: 'var(--ds-border)',
        marginBottom: 14,
      }} />

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
                paddingTop: i === 0 ? 0 : 10,
                paddingBottom: i < CAPABILITIES.length - 1 ? 10 : 0,
                borderBottom: i < CAPABILITIES.length - 1
                  ? '1px solid var(--ds-border-subtle)'
                  : 'none',
                opacity: isLocked ? 0.4 : 1,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 400,
                  color: 'var(--ds-text-secondary)',
                }}>
                  {cap.label}{isLocked ? ' (locked)' : ''}
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
