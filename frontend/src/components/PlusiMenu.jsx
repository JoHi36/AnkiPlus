import React, { useState, useEffect, useCallback } from 'react';
import PersonalityGrid from './PersonalityGrid';
import AutonomyCard from './AutonomyCard';
import DiaryStream from './DiaryStream';

// ─── Static Plusi SVG ────────────────────────────────────────────────────────

function PlusiAvatar({ size = 52 }) {
  const c = size / 2;
  const arm = size * 0.38;
  const t = size * 0.12;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
      {/* Plus shape */}
      <rect x={c - t / 2} y={c - arm} width={t} height={arm * 2} rx={t / 2}
        fill="var(--ds-accent, #0A84FF)" />
      <rect x={c - arm} y={c - t / 2} width={arm * 2} height={t} rx={t / 2}
        fill="var(--ds-accent, #0A84FF)" />
      {/* Eyes */}
      <circle cx={c - 6} cy={c - 4} r={2} fill="var(--ds-bg-deep, #141416)" />
      <circle cx={c + 6} cy={c - 4} r={2} fill="var(--ds-bg-deep, #141416)" />
      {/* Mouth */}
      <path d={`M${c - 4} ${c + 5} Q${c} ${c + 9} ${c + 4} ${c + 5}`}
        stroke="var(--ds-bg-deep, #141416)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function PlusiMenu({ bridge, onNavigateBack }) {
  const [data, setData] = useState(null);

  // Request data on mount
  useEffect(() => {
    window.ankiBridge?.addMessage('getPlusiMenuData', null);
  }, []);

  // Listen for data response
  useEffect(() => {
    function handleData(e) {
      setData(e.detail);
    }
    window.addEventListener('ankiPlusiMenuDataLoaded', handleData);
    return () => window.removeEventListener('ankiPlusiMenuDataLoaded', handleData);
  }, []);

  const handleAutonomySave = useCallback((config) => {
    window.ankiBridge?.addMessage('savePlusiAutonomy', config);
  }, []);

  const mood = data?.mood || 'calm';
  const energy = data?.energy ?? 100;
  const friendshipLevel = data?.friendshipLevel ?? 0;
  const friendshipPoints = data?.friendshipPoints ?? 0;
  const personality = data?.personality || {};
  const autonomy = data?.autonomy || {};
  const diary = data?.diary || [];

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      padding: '0 20px 140px', overflowY: 'auto',
    }}>

      {/* ── Back Navigation ───────────────────────────────────────────── */}
      <div onClick={onNavigateBack} style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '20px 0', cursor: 'pointer',
      }}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
          stroke="var(--ds-accent, #0A84FF)" strokeWidth="2" strokeLinecap="round">
          <path d="M10 3L5 8L10 13" />
        </svg>
        <span style={{ fontSize: 14, color: 'var(--ds-text-secondary)' }}>Agent Studio</span>
      </div>

      {/* ── Plusi Header ──────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingBottom: 20,
      }}>
        {/* Left: info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{
            fontSize: 20, fontWeight: 700,
            color: 'var(--ds-text-primary, rgba(255,255,255,0.88))',
          }}>Plusi</span>

          {/* Mood line */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: 'var(--ds-green, #30D158)', flexShrink: 0,
            }} />
            <span style={{
              fontSize: 13, color: 'var(--ds-text-secondary, rgba(255,255,255,0.55))',
              textTransform: 'capitalize',
            }}>{mood}</span>
            <span style={{
              fontSize: 12, color: 'var(--ds-text-tertiary, rgba(255,255,255,0.3))',
            }}>· {energy}% energy</span>
          </div>

          {/* Friendship bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 11, fontWeight: 600,
              color: 'var(--ds-text-tertiary, rgba(255,255,255,0.3))',
              textTransform: 'uppercase', letterSpacing: '0.5px',
            }}>Lv {friendshipLevel}</span>
            <div style={{
              width: 80, height: 4, borderRadius: 2,
              background: 'var(--ds-border, rgba(255,255,255,0.08))',
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${Math.min(100, (friendshipPoints % 100))}%`,
                height: '100%', borderRadius: 2,
                background: 'var(--ds-accent, #0A84FF)',
                transition: 'width 0.4s ease',
              }} />
            </div>
            <span style={{
              fontSize: 11, color: 'var(--ds-text-tertiary, rgba(255,255,255,0.3))',
            }}>{friendshipPoints} pts</span>
          </div>
        </div>

        {/* Right: Plusi avatar */}
        <PlusiAvatar size={52} />
      </div>

      {/* ── Personality Grid ──────────────────────────────────────────── */}
      <PersonalityGrid
        position={personality.position}
        trail={personality.trail}
        quadrant={personality.quadrant}
        confident={personality.confident}
      />

      {/* ── Autonomy Card ─────────────────────────────────────────────── */}
      <div style={{ marginTop: 16 }}>
        <AutonomyCard
          autonomy={autonomy}
          friendshipLevel={friendshipLevel}
          onSave={handleAutonomySave}
        />
      </div>

      {/* ── Diary Stream ──────────────────────────────────────────────── */}
      <div style={{ marginTop: 16 }}>
        <DiaryStream entries={diary} />
      </div>
    </div>
  );
}
