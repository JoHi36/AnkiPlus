import React from 'react';
import { getFocusColor } from '../hooks/useFocusManager';
import TrajectoryChart from './TrajectoryChart';
import SessionSuggestion from './SessionSuggestion';

export default function FocusDetailView({ focus, trajectory, suggestion, onBack }) {
  const color = getFocusColor(focus.colorIndex);

  return (
    <div style={CONTAINER_STYLE}>
      <div style={HEADER_STYLE}>
        <button onClick={onBack} style={BACK_STYLE}>← Alle Fokus</button>
        <div style={FOCUS_INFO_STYLE}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ ...DOT_STYLE, background: color }} />
            <span style={FOCUS_NAME_STYLE}>{(focus.deckNames || []).join(', ')}</span>
          </div>
        </div>
      </div>

      {trajectory ? (
        <TrajectoryChart
          days={trajectory.days || []}
          currentPct={trajectory.current_pct || 0}
          totalCards={trajectory.total_cards || 0}
          matureCards={trajectory.mature_cards || 0}
          youngCards={trajectory.young_cards || 0}
          avgNew7d={trajectory.avg_new_7d || 0}
        />
      ) : (
        <div style={LOADING_STYLE}>
          <span style={{ color: 'var(--ds-text-muted)', fontSize: 13 }}>Lade Verlauf…</span>
        </div>
      )}

      <SessionSuggestion suggestion={suggestion} />

      <button onClick={() => onBack('delete')} style={DELETE_STYLE}>
        Fokus entfernen
      </button>
    </div>
  );
}

const CONTAINER_STYLE = { display: 'flex', flexDirection: 'column', gap: 20, width: '100%' };
const HEADER_STYLE = { display: 'flex', flexDirection: 'column', gap: 8 };
const BACK_STYLE = {
  background: 'none', border: 'none', padding: '4px 0',
  color: 'var(--ds-accent)', fontSize: 13, fontWeight: 500,
  fontFamily: 'inherit', cursor: 'pointer', alignSelf: 'flex-start',
};
const FOCUS_INFO_STYLE = { display: 'flex', flexDirection: 'column', gap: 4 };
const DOT_STYLE = { width: 8, height: 8, borderRadius: '50%' };
const FOCUS_NAME_STYLE = { fontSize: 15, fontWeight: 500, color: 'var(--ds-text-primary)' };
const LOADING_STYLE = { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 };
const DELETE_STYLE = {
  background: 'none', border: 'none', padding: '8px 0',
  color: 'var(--ds-red)', fontSize: 12, fontWeight: 400,
  fontFamily: 'inherit', cursor: 'pointer', alignSelf: 'center', opacity: 0.6,
};
