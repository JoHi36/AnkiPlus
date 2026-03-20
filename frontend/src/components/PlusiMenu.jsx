import React, { useState, useEffect, useCallback } from 'react';
import MascotCharacter from './MascotCharacter';
import PersonalityGrid from './PersonalityGrid';
import AutonomyCard from './AutonomyCard';
import DiaryStream from './DiaryStream';

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

  const state = data?.state || {};
  const friendship = data?.friendship || {};
  const personality = data?.personality || {};
  const autonomy = data?.autonomy || {};
  const diary = data?.diary || [];

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      padding: '0 20px 140px', overflowY: 'auto',
    }}>

      {/* ── Plusi Header ──────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: 20, paddingBottom: 20,
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
            }}>{state.mood || 'neutral'}</span>
            <span style={{
              fontSize: 12, color: 'var(--ds-text-tertiary, rgba(255,255,255,0.3))',
            }}>· Energie {state.energy ?? 5}</span>
          </div>

          {/* Friendship bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 11, fontWeight: 600,
              color: 'var(--ds-text-tertiary, rgba(255,255,255,0.3))',
              textTransform: 'uppercase', letterSpacing: '0.5px',
            }}>Lv {friendship.level ?? 0}{friendship.levelName ? ` · ${friendship.levelName}` : ''}</span>
            <div style={{
              width: 80, height: 4, borderRadius: 2,
              background: 'var(--ds-border, rgba(255,255,255,0.08))',
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${friendship.maxPoints ? Math.min(100, (friendship.points || 0) / friendship.maxPoints * 100) : 0}%`,
                height: '100%', borderRadius: 2,
                background: 'var(--ds-accent, #0A84FF)',
                transition: 'width 0.4s ease',
              }} />
            </div>
            <span style={{
              fontSize: 11, color: 'var(--ds-text-tertiary, rgba(255,255,255,0.3))',
            }}>{friendship.points ?? 0} pts</span>
          </div>
        </div>

        {/* Right: Plusi avatar */}
        <MascotCharacter mood={data?.state?.mood || 'neutral'} size={40} />
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
          friendshipLevel={friendship.level ?? 0}
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
