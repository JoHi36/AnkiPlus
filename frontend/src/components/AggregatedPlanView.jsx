import React from 'react';
import { getFocusColor } from '../hooks/useFocusManager';
import TrajectoryChart from './TrajectoryChart';

export default function AggregatedPlanView({ focuses, onSelectFocus, trajectoryData }) {
  const traj = trajectoryData;

  const daysUntil = (deadline) => {
    if (!deadline) return '?';
    return Math.max(0, Math.ceil((new Date(deadline) - new Date()) / (1000 * 60 * 60 * 24)));
  };

  return (
    <div style={CONTAINER_STYLE}>
      <div style={HEADER_STYLE}>
        <span style={TITLE_STYLE}>Dein Lernplan</span>
      </div>

      {traj ? (
        <TrajectoryChart
          days={traj.days || []}
          currentPct={traj.current_pct || 0}
          totalCards={traj.total_cards || 0}
          matureCards={traj.mature_cards || 0}
          youngCards={traj.young_cards || 0}
          avgNew7d={traj.avg_new_7d || 0}
        />
      ) : (
        <div style={LOADING_STYLE}>
          <span style={{ color: 'var(--ds-text-muted)', fontSize: 13 }}>Lade Verlauf…</span>
        </div>
      )}

      <div style={PLAN_STYLE}>
        <div style={PLAN_HEADER_STYLE}>
          <span style={PLAN_TITLE_STYLE}>HEUTE</span>
        </div>
        {focuses.map(f => {
          const color = getFocusColor(f.colorIndex);
          const days = daysUntil(f.deadline);
          return (
            <button key={f.id} onClick={() => onSelectFocus(f.id)} style={PLAN_ROW_STYLE}>
              <span style={{ ...ROW_DOT_STYLE, background: color }} />
              <span style={ROW_NAME_STYLE}>{(f.deckNames || []).join(', ')}</span>
              <span style={ROW_DAYS_STYLE}>{days}d</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const CONTAINER_STYLE = { display: 'flex', flexDirection: 'column', gap: 20, width: '100%' };
const HEADER_STYLE = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' };
const TITLE_STYLE = { fontSize: 15, fontWeight: 500, color: 'var(--ds-text-secondary)' };
const LOADING_STYLE = { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 };
const PLAN_STYLE = {
  borderRadius: 14, border: '1px solid var(--ds-border-subtle)',
  background: 'var(--ds-bg-canvas)', overflow: 'hidden',
};
const PLAN_HEADER_STYLE = { padding: '12px 16px 8px' };
const PLAN_TITLE_STYLE = {
  fontSize: 10, fontWeight: 500, color: 'var(--ds-text-muted)',
  letterSpacing: 0.5, textTransform: 'uppercase',
};
const PLAN_ROW_STYLE = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '10px 16px', width: '100%',
  background: 'transparent', border: 'none',
  borderTop: '1px solid var(--ds-border-subtle)',
  cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.15s',
};
const ROW_DOT_STYLE = { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 };
const ROW_NAME_STYLE = { flex: 1, fontSize: 13, color: 'var(--ds-text-primary)', textAlign: 'left' };
const ROW_DAYS_STYLE = { fontSize: 11, color: 'var(--ds-text-muted)', fontVariantNumeric: 'tabular-nums' };
