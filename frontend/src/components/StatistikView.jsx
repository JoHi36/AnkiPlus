import React, { useState, useMemo } from 'react';
import useStatistikData from '../hooks/useStatistikData';
import TrajectoryChart from './TrajectoryChart';
import DailyBreakdown from './DailyBreakdown';
import KnowledgeHeatmap from './KnowledgeHeatmap';
import YearHeatmap from './YearHeatmap';
import TimeOfDayChart from './TimeOfDayChart';

export default function StatistikView({ deckData }) {
  const { data, loading } = useStatistikData();
  const [scopeDeckId, setScopeDeckId] = useState(null); // null = all

  // Build deck options from deckData roots
  const deckOptions = useMemo(() => {
    if (!deckData?.roots) return [];
    return deckData.roots.map(d => ({ id: d.id, name: d.name }));
  }, [deckData]);

  // Filter deckData for scope
  const scopedDeckData = useMemo(() => {
    if (!scopeDeckId || !deckData?.roots) return deckData;
    const selected = deckData.roots.find(d => d.id === scopeDeckId);
    if (!selected) return deckData;
    return { ...deckData, roots: selected.children || [] };
  }, [deckData, scopeDeckId]);

  if (loading || !data) {
    return (
      <div style={LOADING_STYLE}>
        <span style={{ color: 'var(--ds-text-muted)', fontSize: 13 }}>Statistik wird geladen…</span>
      </div>
    );
  }

  const { trajectory, daily, heatmap, timeOfDay } = data;
  // Handle both naming conventions from bridge
  const dailyData = daily || data.daily_breakdown;
  const heatmapData = heatmap || data.year_heatmap;
  const todData = timeOfDay || data.time_of_day;

  const totalDaily = (dailyData?.new || 0) + (dailyData?.young || 0) + (dailyData?.mature || 0);
  const growthPct = trajectory?.total > 0
    ? ((dailyData?.new || 0) / trajectory.total * 100).toFixed(1)
    : '0';

  return (
    <div style={PAGE_STYLE}>
      {/* Deck Scope Selector */}
      <div style={SCOPE_ROW_STYLE}>
        <div style={SCOPE_PILLS_STYLE}>
          <button
            style={scopeDeckId === null ? SCOPE_PILL_ACTIVE_STYLE : SCOPE_PILL_STYLE}
            onClick={() => setScopeDeckId(null)}
          >
            Alle Stapel
          </button>
          {deckOptions.map(d => (
            <button
              key={d.id}
              style={scopeDeckId === d.id ? SCOPE_PILL_ACTIVE_STYLE : SCOPE_PILL_STYLE}
              onClick={() => setScopeDeckId(d.id)}
            >
              {d.name}
            </button>
          ))}
        </div>
      </div>

      {/* Trajectory Hero */}
      <TrajectoryChart
        days={trajectory?.days || []}
        currentPct={trajectory?.current_pct || 0}
        totalCards={trajectory?.total_cards || 0}
        matureCards={trajectory?.mature_cards || 0}
        youngCards={trajectory?.young_cards || 0}
        avgNew7d={trajectory?.avg_new_7d || 0}
      />

      <div style={DIVIDER_STYLE} />

      {/* Mid row: Dein Tag + Wissensstand */}
      <div style={MID_ROW_STYLE}>
        <div style={DAILY_COL_STYLE}>
          <DailyBreakdown
            newCount={dailyData?.new || 0}
            youngCount={dailyData?.young || 0}
            matureCount={dailyData?.mature || 0}
            growthPct={growthPct}
          />
        </div>
        <div style={KNOWLEDGE_COL_STYLE}>
          <div style={SECTION_HEADER_STYLE}>
            <span style={SECTION_TITLE_STYLE}>Wissensstand</span>
            <span style={SECTION_HINT_STYLE}>Tippe für Ziel</span>
          </div>
          <div style={TREEMAP_WRAP_STYLE}>
            {scopedDeckData?.roots?.length > 0 ? (
              <KnowledgeHeatmap
                deckData={scopedDeckData}
                onSelectDeck={() => {}}
                selectedDeckId={null}
              />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--ds-text-muted)', fontSize: 12 }}>
                Deck-Daten werden geladen…
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={DIVIDER_STYLE} />

      {/* Bottom row: Heatmap + Tageszeit */}
      <div style={BOTTOM_ROW_STYLE}>
        <div style={HEATMAP_COL_STYLE}>
          <YearHeatmap
            levels={heatmapData?.levels || []}
            totalYear={heatmapData?.total_year || 0}
            streak={heatmapData?.streak || 0}
            bestStreak={heatmapData?.best_streak || 0}
          />
        </div>
        <div style={TIME_COL_STYLE}>
          <TimeOfDayChart
            hours={todData?.hours || []}
            bestStart={todData?.best_start || 0}
            bestEnd={todData?.best_end || 0}
          />
        </div>
      </div>

      {/* Goal Input Dock */}
      <div style={GOAL_WRAP_STYLE}>
        <div className="ds-frosted" style={GOAL_INPUT_STYLE}>
          <span style={GOAL_ICON_STYLE}>◎</span>
          <span style={GOAL_TEXT_STYLE}>Was willst du bis wann schaffen?</span>
          <span style={KBD_STYLE}>⌘K</span>
        </div>
      </div>
    </div>
  );
}

const LOADING_STYLE = {
  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const PAGE_STYLE = {
  flex: 1, display: 'flex', flexDirection: 'column', gap: 28,
  maxWidth: 900, margin: '0 auto', width: '100%',
  padding: '16px 36px 80px',
  overflowY: 'auto', scrollbarWidth: 'none',
};
const SCOPE_ROW_STYLE = {
  padding: '0 4px',
};
const SCOPE_PILLS_STYLE = {
  display: 'flex', gap: 6, flexWrap: 'wrap',
};
const SCOPE_PILL_STYLE = {
  padding: '4px 12px', fontSize: 11, fontWeight: 500, fontFamily: 'inherit',
  border: '1px solid var(--ds-border-subtle)', borderRadius: 8,
  background: 'transparent', color: 'var(--ds-text-tertiary)',
  cursor: 'pointer', transition: 'all 0.15s',
};
const SCOPE_PILL_ACTIVE_STYLE = {
  ...SCOPE_PILL_STYLE,
  background: 'var(--ds-active-tint)',
  color: 'var(--ds-text-primary)',
  borderColor: 'var(--ds-border-medium)',
};
const DIVIDER_STYLE = {
  height: 1, background: 'var(--ds-border-subtle)', margin: '0 4px',
};
const MID_ROW_STYLE = { display: 'flex', gap: 28, padding: '0 4px' };
const DAILY_COL_STYLE = { flex: '0 0 260px' };
const KNOWLEDGE_COL_STYLE = { flex: 1, display: 'flex', flexDirection: 'column' };
const BOTTOM_ROW_STYLE = { display: 'flex', gap: 28, padding: '0 4px' };
const HEATMAP_COL_STYLE = { flex: 1 };
const TIME_COL_STYLE = { flex: '0 0 170px' };
const SECTION_HEADER_STYLE = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10,
};
const SECTION_TITLE_STYLE = {
  fontSize: 13, fontWeight: 500, color: 'var(--ds-text-tertiary)', letterSpacing: 0.3,
};
const SECTION_HINT_STYLE = { fontSize: 10, color: 'var(--ds-text-muted)' };
const TREEMAP_WRAP_STYLE = { flex: 1, minHeight: 120 };
const GOAL_WRAP_STYLE = {
  position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', zIndex: 100,
};
const GOAL_INPUT_STYLE = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '10px 20px', borderRadius: 14, minWidth: 360,
  border: '1px solid var(--ds-border-subtle)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
};
const GOAL_ICON_STYLE = { fontSize: 13, color: 'var(--ds-text-muted)' };
const GOAL_TEXT_STYLE = { flex: 1, fontSize: 13, color: 'var(--ds-text-muted)' };
const KBD_STYLE = {
  fontSize: 9, color: 'var(--ds-text-muted)',
  padding: '2px 5px', border: '1px solid var(--ds-border-subtle)', borderRadius: 4,
};
