import React, { useState, useEffect, useRef, useCallback } from 'react';
import PersonalityGrid from './PersonalityGrid';
import DiaryStream from './DiaryStream';

export default function PlusiMenu({ bridge, onNavigateBack }) {
  const [data, setData] = useState(null);
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const scrollRef = useRef(null);
  const dayRefs = useRef([]);

  useEffect(() => {
    window.ankiBridge?.addMessage('getPlusiMenuData', null);
  }, []);

  useEffect(() => {
    function handleData(e) { setData(e.detail); }
    window.addEventListener('ankiPlusiMenuDataLoaded', handleData);
    return () => window.removeEventListener('ankiPlusiMenuDataLoaded', handleData);
  }, []);

  const personality = data?.personality || {};
  const diary = data?.diary || [];

  // Group diary entries by day
  const dayGroups = React.useMemo(() => {
    if (!diary.length) return [];
    const sorted = [...diary].sort((a, b) => b.timestamp - a.timestamp);
    const groups = [];
    let currentDay = null;
    for (const entry of sorted) {
      const d = new Date(entry.timestamp);
      const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (dayKey !== currentDay) {
        groups.push({ dayKey, entries: [], position: null });
        currentDay = dayKey;
      }
      groups[groups.length - 1].entries.push(entry);
    }
    return groups;
  }, [diary]);

  // For each day group, compute a personality position
  // In real implementation, this would come from stored trail snapshots
  // For now, interpolate from the trail data or use the overall position
  const dayPositions = React.useMemo(() => {
    const trail = personality.trail || [];
    const pos = personality.position || { x: 0.5, y: 0.5 };

    if (!dayGroups.length) return [];

    // If we have trail data, distribute trail points across days
    // Otherwise use the current position for all days
    if (trail.length >= dayGroups.length) {
      // Map trail points to days (newest first)
      return dayGroups.map((_, i) => {
        const trailIdx = Math.min(i, trail.length - 1);
        return trail[trail.length - 1 - trailIdx] || pos;
      });
    }

    // Fallback: interpolate from current position toward center
    return dayGroups.map((_, i) => {
      const t = dayGroups.length > 1 ? i / (dayGroups.length - 1) : 0;
      return {
        x: pos.x * (1 - t * 0.3) + 0.5 * (t * 0.3),
        y: pos.y * (1 - t * 0.3) + 0.5 * (t * 0.3),
      };
    });
  }, [dayGroups, personality]);

  // Scroll handler — find which day group is closest to viewport top
  const handleScroll = useCallback(() => {
    if (!dayRefs.current.length) return;
    const container = scrollRef.current;
    if (!container) return;

    const viewTop = container.scrollTop + 120; // offset for sticky header
    let closest = 0;
    let closestDist = Infinity;

    dayRefs.current.forEach((ref, i) => {
      if (!ref) return;
      const dist = Math.abs(ref.offsetTop - viewTop);
      if (dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    });

    if (closest !== activeDayIndex) {
      setActiveDayIndex(closest);
    }
  }, [activeDayIndex]);

  // Current position based on active day
  const currentPosition = dayPositions[activeDayIndex] || personality.position || { x: 0.5, y: 0.5 };

  // Trail from current day backwards
  const visibleTrail = dayPositions.slice(activeDayIndex);

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        padding: '0 20px 140px', overflowY: 'auto',
      }}
    >
      {/* Sticky Grid Header */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        paddingTop: 12,
        paddingBottom: 8,
        background: 'linear-gradient(to bottom, var(--ds-bg-deep, #141416) 70%, transparent)',
      }}>
        <div style={{
          background: 'var(--ds-bg-frosted, rgba(255,255,255,0.04))',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: 12,
          border: '1px solid var(--ds-border, rgba(255,255,255,0.06))',
          padding: '8px 14px 6px',
        }}>
          <PersonalityGrid
            position={currentPosition}
            trail={visibleTrail}
            quadrant={personality.quadrant}
            confident={personality.confident}
          />
        </div>
      </div>

      {/* Diary — free scrolling */}
      <div style={{ marginTop: 8 }}>
        <DiaryStream
          entries={diary}
          dayRefs={dayRefs}
        />
      </div>
    </div>
  );
}
