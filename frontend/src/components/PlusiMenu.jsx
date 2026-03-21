import React, { useState, useEffect, useCallback } from 'react';
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

      {/* ── Container 1: Plusi Control ──────────────────────────────── */}
      <div style={{ paddingTop: 20 }}>
        <AutonomyCard
          autonomy={autonomy}
          friendshipLevel={friendship.level ?? 0}
          friendshipLevelName={friendship.levelName || ''}
          friendshipPoints={friendship.points ?? 0}
          friendshipMaxPoints={friendship.maxPoints ?? 0}
          mood={state.mood || 'neutral'}
          energy={state.energy ?? 5}
          onSave={handleAutonomySave}
        />
      </div>

      {/* ── Container 2: Personality + Diary ────────────────────────── */}
      <div style={{
        marginTop: 24,
        background: 'var(--ds-bg-canvas)',
        borderRadius: 16,
        border: '1px solid var(--ds-border, rgba(255,255,255,0.06))',
        overflow: 'hidden',
      }}>
        <PersonalityGrid
          position={personality.position}
          trail={personality.trail}
          quadrant={personality.quadrant}
          confident={personality.confident}
        />
        <div style={{ padding: '16px 20px 20px' }}>
          <DiaryStream entries={diary} />
        </div>
      </div>
    </div>
  );
}
