import React, { useState, useEffect, useRef, useCallback } from 'react';
import PersonalityGrid from './PersonalityGrid';
import DiaryStream from './DiaryStream';

export default function PlusiMenu({ agent, bridge, onNavigateBack }) {
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

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleReset = () => {
    window.ankiBridge?.addMessage('resetPlusi', null);
    setShowResetConfirm(false);
    setData(null);
    // Reload data after reset
    setTimeout(() => {
      window.ankiBridge?.addMessage('getPlusiMenuData', null);
    }, 500);
  };

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Fixed Grid Header — never scrolls, always visible */}
      <div style={{
        flexShrink: 0,
        zIndex: 10,
        background: 'var(--ds-bg-deep)',
        padding: '12px 20px 0',
      }}>
        <PersonalityGrid
          position={currentPosition}
          trail={visibleTrail}
          quadrant={personality.quadrant}
          confident={personality.confident}
        />
      </div>

      {/* Scrollable diary area below the fixed grid */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* Fade overlay — diary text disappears under this */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          height: 32, zIndex: 5, pointerEvents: 'none',
          background: 'linear-gradient(to bottom, var(--ds-bg-deep) 0%, transparent 100%)',
        }} />
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="scrollbar-hide"
          style={{
            height: '100%',
            overflowY: 'auto',
            padding: '24px 20px 140px',
          }}
        >
          <DiaryStream
            entries={diary}
            dayRefs={dayRefs}
          />

          {/* Reset option at bottom */}
          <div style={{ marginTop: 40, paddingBottom: 20, textAlign: 'center' }}>
            {!showResetConfirm ? (
              <button
                onClick={() => setShowResetConfirm(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--ds-text-muted)',
                  fontSize: 11,
                  cursor: 'pointer',
                  padding: '6px 12px',
                  transition: 'color 0.2s',
                }}
                onMouseEnter={e => e.target.style.color = 'var(--ds-red)'}
                onMouseLeave={e => e.target.style.color = 'var(--ds-text-muted)'}
              >
                Plusi zurücksetzen
              </button>
            ) : (
              <div style={{
                background: 'var(--ds-bg-overlay)',
                borderRadius: 10,
                padding: '14px 16px',
                maxWidth: 280,
                margin: '0 auto',
              }}>
                <p style={{
                  fontSize: 12,
                  color: 'var(--ds-text-secondary)',
                  margin: '0 0 12px',
                  lineHeight: 1.5,
                }}>
                  Plusis Erinnerungen, Tagebuch und Persönlichkeit werden gelöscht. Das kann nicht rückgängig gemacht werden.
                </p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  <button
                    onClick={() => setShowResetConfirm(false)}
                    style={{
                      background: 'var(--ds-hover-tint)',
                      border: '1px solid var(--ds-border-subtle)',
                      borderRadius: 6,
                      color: 'var(--ds-text-secondary)',
                      fontSize: 11,
                      padding: '5px 14px',
                      cursor: 'pointer',
                    }}
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={handleReset}
                    style={{
                      background: 'var(--ds-red-10)',
                      border: '1px solid var(--ds-red-20)',
                      borderRadius: 6,
                      color: 'var(--ds-red)',
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '5px 14px',
                      cursor: 'pointer',
                    }}
                  >
                    Zurücksetzen
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
