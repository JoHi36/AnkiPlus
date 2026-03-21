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

  const handleMascotToggle = useCallback(() => {
    const next = !(data?.state?.mascotEnabled !== false);
    window.ankiBridge?.addMessage('saveMascotEnabled', next);
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
          mascotEnabled={state.mascotEnabled !== false}
          onMascotToggle={handleMascotToggle}
          onSave={handleAutonomySave}
        />
      </div>

      {/* ── Container 2: Personality + Diary ────────────────────────── */}
      <div style={{ marginTop: 24 }}>
        <PersonalityGrid
          position={personality.position}
          trail={personality.trail}
          quadrant={personality.quadrant}
          confident={personality.confident}
        />
        <DiaryStream entries={diary} />
      </div>
    </div>
  );
}
