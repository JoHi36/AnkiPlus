import React, { useState, useEffect, useCallback } from 'react';
import PersonalityGrid from './PersonalityGrid';
import DiaryStream from './DiaryStream';

// Same PlusiIcon as AgentStudio
function PlusiIcon() {
  return (
    <svg viewBox="0 0 120 120" width={28} height={28}>
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

export default function PlusiMenu({ bridge, onNavigateBack }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    window.ankiBridge?.addMessage('getPlusiMenuData', null);
  }, []);

  useEffect(() => {
    function handleData(e) { setData(e.detail); }
    window.addEventListener('ankiPlusiMenuDataLoaded', handleData);
    return () => window.removeEventListener('ankiPlusiMenuDataLoaded', handleData);
  }, []);

  const state = data?.state || {};
  const friendship = data?.friendship || {};
  const personality = data?.personality || {};
  const autonomy = data?.autonomy || {};
  const diary = data?.diary || [];
  const budget = autonomy.token_budget_per_hour ?? 500;

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      padding: '0 20px 140px', overflowY: 'auto',
    }}>

      {/* ── Frosted Glass Header ──────────────────────────────── */}
      <div style={{
        background: 'var(--ds-bg-frosted)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: 16,
        border: '1px solid var(--ds-border, rgba(255,255,255,0.06))',
        padding: '16px 20px',
        marginTop: 16,
      }}>
        {/* Plusi Identity Row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          marginBottom: 8,
        }}>
          <PlusiIcon />
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--ds-text-primary)' }}>Plusi</span>
          <span style={{ fontSize: 12, color: 'var(--ds-text-tertiary)' }}>
            {state.mood || 'neutral'} &middot; {state.energy ?? '?'}
          </span>
        </div>

        {/* Friendship Bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          marginBottom: 14,
        }}>
          <span style={{ fontSize: 10, color: 'var(--ds-text-quaternary)', whiteSpace: 'nowrap' }}>
            Lv {friendship.level ?? 0} &middot; {friendship.levelName || ''}
          </span>
          <div style={{
            flex: 1, height: 2,
            background: 'var(--ds-border, rgba(255,255,255,0.08))',
            borderRadius: 1, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', borderRadius: 1,
              background: 'var(--ds-accent, #0A84FF)',
              width: friendship.maxPoints ? `${(friendship.points / friendship.maxPoints) * 100}%` : '0%',
            }} />
          </div>
          <span style={{ fontSize: 10, color: 'var(--ds-text-quaternary)', whiteSpace: 'nowrap' }}>
            {friendship.points ?? 0}/{friendship.maxPoints ?? 0}
          </span>
        </div>

        {/* Personality Grid Strip — inline, no wrapper */}
        <div style={{ marginBottom: 14 }}>
          <PersonalityGrid
            position={personality.position}
            trail={personality.trail}
            quadrant={personality.quadrant}
            confident={personality.confident}
          />
        </div>

        {/* Token Budget — compact inline */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: 6,
        }}>
          <span style={{ fontSize: 12, color: 'var(--ds-text-secondary)' }}>Token-Budget</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ds-accent)' }}>{budget} / h</span>
        </div>
        {/* Simple track + fill budget indicator */}
        <div style={{ position: 'relative', marginBottom: 4 }}>
          <div style={{
            height: 4, borderRadius: 2,
            background: 'var(--ds-border, rgba(255,255,255,0.08))',
          }}>
            <div style={{
              height: '100%', borderRadius: 2,
              background: 'linear-gradient(90deg, #30D158, #0A84FF)',
              width: `${((budget - 100) / 1900) * 100}%`,
            }} />
          </div>
        </div>
      </div>

      {/* ── Diary — free scrolling, no container ─────────────── */}
      <div style={{ marginTop: 20, paddingBottom: 20 }}>
        <DiaryStream entries={diary} />
      </div>
    </div>
  );
}
