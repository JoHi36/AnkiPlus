import React, { useMemo } from 'react';
import { getFocusColor } from '../hooks/useFocusManager';
import TrajectoryChart from './TrajectoryChart';
import YearHeatmap from './YearHeatmap';
import TimeOfDayChart from './TimeOfDayChart';

// Compute pace (new cards/day) from the last 7 days of trajectory data
function computePace(trajectory) {
  if (!trajectory?.days?.length) return 0;
  const last7 = trajectory.days.slice(-7);
  const total = last7.reduce((s, d) => s + (d.new_count ?? 0), 0);
  return last7.length > 0 ? Math.round(total / last7.length) : 0;
}

// -- Component ----------------------------------------------------------------

export default function AggregatedPlanView({
  focuses,
  onSelectFocus,
  onAddFocus,
  trajectories,
  suggestions,
  aggregateTrajectory,
  heatmapData,
  todData,
}) {
  const totalDue = useMemo(() => {
    if (!suggestions) return 0;
    return Object.values(suggestions).reduce((s, sg) => {
      return s + ((sg?.dueReview ?? 0) + (sg?.recommendedNew ?? 0));
    }, 0);
  }, [suggestions]);

  const aggPace = aggregateTrajectory ? computePace(aggregateTrajectory) : 0;
  const currentPct = aggregateTrajectory?.current_pct ?? 0;
  const avgNew7d = aggregateTrajectory?.avg_new_7d ?? aggPace;

  return (
    <div style={CONTAINER_STYLE}>

      {/* ── Zone 1: Gesamt-Header ─────────────────────────────────────────── */}
      <div style={ZONE1_STYLE}>
        <div style={ZONE1_META_STYLE}>
          <div style={BIG_PCT_WRAP_STYLE}>
            <span style={BIG_PCT_STYLE}>{currentPct}</span>
            <span style={PCT_UNIT_STYLE}>%</span>
          </div>
          <div style={PACE_ROW_STYLE}>
            <span style={PACE_STYLE}>+{avgNew7d} neue / Tag</span>
          </div>
          <span style={ABRUF_LABEL_STYLE}>Abrufwahrscheinlichkeit</span>
        </div>

        {aggregateTrajectory ? (
          <TrajectoryChart
            days={aggregateTrajectory.days || []}
            currentPct={aggregateTrajectory.current_pct || 0}
            totalCards={aggregateTrajectory.total_cards || 0}
            matureCards={aggregateTrajectory.mature_cards || 0}
            youngCards={aggregateTrajectory.young_cards || 0}
            avgNew7d={aggregateTrajectory.avg_new_7d || 0}
          />
        ) : (
          <div style={LOADING_STYLE}>
            <span style={{ color: 'var(--ds-text-muted)', fontSize: 13 }}>Lade Verlauf…</span>
          </div>
        )}

        <div style={ZONE1_FOOTER_STYLE}>
          <span style={DUE_LABEL_STYLE}>{totalDue} Karten heute</span>
          <button
            style={LEARN_ALL_STYLE}
            onClick={() => {
              if (window.ankiBridge) window.ankiBridge.addMessage('startStudySession', {});
            }}
          >
            Alles lernen
          </button>
        </div>
      </div>

      {/* ── Zone 2: Fokus rows ────────────────────────────────────────────── */}
      <div style={ZONE2_STYLE}>
        <div style={ZONE2_HEADER_STYLE}>
          <span style={SECTION_LABEL_STYLE}>FOKUS</span>
          <button onClick={onAddFocus} style={ADD_FOCUS_STYLE}>+ Fokus</button>
        </div>

        {focuses.map((f) => {
          const color = getFocusColor(f.colorIndex);
          const traj = trajectories?.[f.id];
          const sugg = suggestions?.[f.id];
          const pct = traj?.current_pct ?? 0;
          const pace = computePace(traj);
          const due = (sugg?.dueReview ?? 0) + (sugg?.recommendedNew ?? 0);
          const totalCards = traj?.total_cards || 1;
          const progressFraction = Math.min(1, pct / 100);

          return (
            <button
              key={f.id}
              onClick={() => onSelectFocus(f.id)}
              style={FOCUS_ROW_STYLE}
            >
              <span style={{ ...ROW_DOT_STYLE, background: color }} />
              <span style={ROW_NAME_STYLE}>{(f.deckNames || []).join(', ')}</span>
              <div style={ROW_BAR_TRACK_STYLE}>
                <div
                  style={{
                    ...ROW_BAR_FILL_STYLE,
                    width: `${progressFraction * 100}%`,
                    background: color,
                  }}
                />
              </div>
              <span style={ROW_PCT_STYLE}>{Math.round(pct)}%</span>
              <span style={{ ...ROW_PACE_STYLE, color }}>+{pace}/T</span>
              <span style={ROW_DUE_STYLE}>{due}</span>
              <span style={ROW_CHEVRON_STYLE}>›</span>
            </button>
          );
        })}
      </div>

      {/* ── Zone 3: Aktivität ────────────────────────────────────────────── */}
      <div style={ZONE3_STYLE}>
        <div style={SEPARATOR_STYLE} />
        <div style={ACTIVITY_ROW_STYLE}>
          <div style={STREAK_COL_STYLE}>
            <div style={STREAK_VALUE_STYLE}>{heatmapData?.streak || 0}</div>
            <div style={STREAK_UNIT_STYLE}>Tage Streak</div>
            {(heatmapData?.best_streak || 0) > 0 && (
              <div style={STREAK_BEST_STYLE}>Bester: {heatmapData.best_streak}</div>
            )}
          </div>
          <div style={HEATMAP_COL_STYLE}>
            <YearHeatmap
              levels={heatmapData?.levels || []}
              totalYear={heatmapData?.total_year || 0}
              streak={heatmapData?.streak || 0}
              bestStreak={heatmapData?.best_streak || 0}
              hideHeader
            />
          </div>
          <div style={TOD_COL_STYLE}>
            <TimeOfDayChart
              hours={todData?.hours || []}
              bestStart={todData?.best_start || 0}
              bestEnd={todData?.best_end || 0}
            />
          </div>
        </div>
        {(heatmapData?.total_year ?? 0) > 0 && (
          <div style={YEAR_TOTAL_STYLE}>
            {heatmapData.total_year} Karten dieses Jahr
          </div>
        )}
      </div>

    </div>
  );
}

// -- Styles -------------------------------------------------------------------

const CONTAINER_STYLE = {
  display: 'flex', flexDirection: 'column', gap: 28, width: '100%',
};

// Zone 1
const ZONE1_STYLE = {
  display: 'flex', flexDirection: 'column', gap: 16,
};
const ZONE1_META_STYLE = {
  display: 'flex', flexDirection: 'column', gap: 4,
};
const BIG_PCT_WRAP_STYLE = {
  display: 'flex', alignItems: 'baseline', gap: 4,
};
const BIG_PCT_STYLE = {
  fontSize: 52, fontWeight: 200, lineHeight: 1,
  color: 'var(--ds-text-primary)', letterSpacing: -2,
  fontVariantNumeric: 'tabular-nums',
};
const PCT_UNIT_STYLE = {
  fontSize: 22, fontWeight: 300, color: 'var(--ds-text-secondary)',
};
const PACE_ROW_STYLE = { display: 'flex', alignItems: 'center' };
const PACE_STYLE = {
  fontSize: 13, fontWeight: 500, color: 'var(--ds-accent)',
};
const ABRUF_LABEL_STYLE = {
  fontSize: 11, color: 'var(--ds-text-muted)', letterSpacing: 0.3,
};
const ZONE1_FOOTER_STYLE = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  marginTop: 4,
};
const DUE_LABEL_STYLE = {
  fontSize: 13, color: 'var(--ds-text-secondary)', fontVariantNumeric: 'tabular-nums',
};
const LEARN_ALL_STYLE = {
  padding: '8px 20px', borderRadius: 10,
  background: 'var(--ds-accent)', color: 'white',
  border: 'none', fontSize: 13, fontWeight: 600,
  fontFamily: 'inherit', cursor: 'pointer',
};

const LOADING_STYLE = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', height: 180,
};

// Zone 2
const ZONE2_STYLE = {
  borderRadius: 14, border: '1px solid var(--ds-border-subtle)',
  background: 'var(--ds-bg-canvas)', overflow: 'hidden',
};
const ZONE2_HEADER_STYLE = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '12px 16px 8px',
};
const SECTION_LABEL_STYLE = {
  fontSize: 10, fontWeight: 500, color: 'var(--ds-text-muted)',
  letterSpacing: 0.5, textTransform: 'uppercase',
};
const ADD_FOCUS_STYLE = {
  background: 'none', border: '1px solid var(--ds-border-subtle)',
  padding: '3px 10px', borderRadius: 7,
  color: 'var(--ds-text-muted)', fontSize: 10, fontWeight: 500,
  fontFamily: 'inherit', cursor: 'pointer',
};
const FOCUS_ROW_STYLE = {
  display: 'flex', alignItems: 'center', gap: 10,
  width: '100%', padding: '10px 14px',
  background: 'none', border: 'none',
  borderTop: '1px solid var(--ds-border-subtle)',
  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
};
const ROW_DOT_STYLE = {
  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
};
const ROW_NAME_STYLE = {
  flex: '0 0 96px', fontSize: 13, color: 'var(--ds-text-primary)',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
const ROW_BAR_TRACK_STYLE = {
  flex: 1, height: 4, borderRadius: 2,
  background: 'var(--ds-hover-tint)',
  overflow: 'hidden',
};
const ROW_BAR_FILL_STYLE = {
  height: '100%', borderRadius: 2, transition: 'width 0.3s ease',
};
const ROW_PCT_STYLE = {
  flex: '0 0 auto', fontSize: 14, fontWeight: 700,
  color: 'var(--ds-text-primary)', fontVariantNumeric: 'tabular-nums',
  minWidth: 36, textAlign: 'right',
};
const ROW_PACE_STYLE = {
  flex: '0 0 auto', fontSize: 10, fontVariantNumeric: 'tabular-nums',
  minWidth: 32, textAlign: 'right',
};
const ROW_DUE_STYLE = {
  flex: '0 0 auto', fontSize: 10, color: 'var(--ds-text-muted)',
  fontVariantNumeric: 'tabular-nums', minWidth: 20, textAlign: 'right',
};
const ROW_CHEVRON_STYLE = {
  flex: '0 0 auto', fontSize: 18, fontWeight: 300,
  color: 'var(--ds-text-muted)',
};

// Zone 3
const ZONE3_STYLE = {
  display: 'flex', flexDirection: 'column', gap: 16,
};
const SEPARATOR_STYLE = {
  height: 1, background: 'var(--ds-border-subtle)',
};
const ACTIVITY_ROW_STYLE = {
  display: 'flex', gap: 20, alignItems: 'center',
};
const STREAK_COL_STYLE = {
  flex: '0 0 50px', display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center',
};
const STREAK_VALUE_STYLE = {
  fontSize: 28, fontWeight: 200, color: 'var(--ds-text-primary)',
  lineHeight: 1, marginTop: 4,
};
const STREAK_UNIT_STYLE = { fontSize: 10, color: 'var(--ds-text-muted)', marginTop: 2 };
const STREAK_BEST_STYLE = { fontSize: 9, color: 'var(--ds-text-muted)', marginTop: 4, opacity: 0.5 };
const HEATMAP_COL_STYLE = { flex: 1, minWidth: 0 };
const TOD_COL_STYLE = { flex: '0 0 100px' };
const YEAR_TOTAL_STYLE = {
  fontSize: 11, color: 'var(--ds-text-muted)', textAlign: 'center',
};
