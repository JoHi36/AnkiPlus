import React from 'react';
import useStatistikData from '../hooks/useStatistikData';
import useDeckFocus from '../hooks/useDeckFocus';
import KnowledgeHeatmap from './KnowledgeHeatmap';
import TrajectoryChart from './TrajectoryChart';
import SessionSuggestion from './SessionSuggestion';
import YearHeatmap from './YearHeatmap';
import TimeOfDayChart from './TimeOfDayChart';

export default function StatistikView({ deckData }) {
  const { data, loading } = useStatistikData();
  const {
    focusedDeckId,
    trajectory: deckTrajectory,
    suggestion,
    loading: deckLoading,
    focusDeck,
    goBack,
  } = useDeckFocus();

  if (loading || !data) {
    return (
      <div style={LOADING_STYLE}>
        <span style={{ color: 'var(--ds-text-muted)', fontSize: 13 }}>
          Statistik wird geladen…
        </span>
      </div>
    );
  }

  const heatmapData = data.heatmap || data.year_heatmap;
  const todData = data.timeOfDay || data.time_of_day;

  // ── Level 2: Deck Focus ──────────────────────────────────────────────────
  if (focusedDeckId) {
    const traj = deckTrajectory;
    return (
      <div style={PAGE_STYLE}>
        <button onClick={goBack} style={BACK_BUTTON_STYLE}>
          ← Übersicht
        </button>

        {deckLoading && !traj ? (
          <div style={LOADING_BLOCK_STYLE}>
            <span style={{ color: 'var(--ds-text-muted)', fontSize: 13 }}>
              Lade Verlauf…
            </span>
          </div>
        ) : traj ? (
          <TrajectoryChart
            days={traj.days || []}
            currentPct={traj.current_pct || 0}
            totalCards={traj.total_cards || 0}
            matureCards={traj.mature_cards || 0}
            youngCards={traj.young_cards || 0}
            avgNew7d={traj.avg_new_7d || 0}
          />
        ) : null}

        <SessionSuggestion suggestion={suggestion} />
      </div>
    );
  }

  // ── Level 1: Wissenslandschaft ───────────────────────────────────────────
  return (
    <div style={PAGE_STYLE}>
      <div style={HERO_SECTION_STYLE}>
        <div style={HERO_HEADER_STYLE}>
          <span style={HERO_TITLE_STYLE}>Wissensstand</span>
        </div>
        {deckData?.roots?.length > 0 ? (
          <KnowledgeHeatmap
            deckData={deckData}
            onSelectDeck={focusDeck}
            selectedDeckId={null}
          />
        ) : (
          <div style={EMPTY_STYLE}>Deck-Daten werden geladen…</div>
        )}
      </div>

      <div style={DIVIDER_STYLE} />

      <div style={SECONDARY_ROW_STYLE}>
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
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const LOADING_STYLE = {
  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const PAGE_STYLE = {
  flex: 1, display: 'flex', flexDirection: 'column', gap: 28,
  maxWidth: 900, margin: '0 auto', width: '100%',
  padding: '16px 36px 80px',
  overflowY: 'auto', scrollbarWidth: 'none',
};

const HERO_SECTION_STYLE = {
  display: 'flex', flexDirection: 'column', gap: 12,
};

const HERO_HEADER_STYLE = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
  padding: '0 4px',
};

const HERO_TITLE_STYLE = {
  fontSize: 13, fontWeight: 500, color: 'var(--ds-text-tertiary)',
  letterSpacing: 0.3,
};

const EMPTY_STYLE = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  height: 200, color: 'var(--ds-text-muted)', fontSize: 12,
};

const DIVIDER_STYLE = {
  height: 1, background: 'var(--ds-border-subtle)', margin: '0 4px',
};

const SECONDARY_ROW_STYLE = {
  display: 'flex', gap: 28, padding: '0 4px',
};

const HEATMAP_COL_STYLE = { flex: 1 };

const TIME_COL_STYLE = { flex: '0 0 170px' };

const BACK_BUTTON_STYLE = {
  background: 'none', border: 'none', padding: '4px 0',
  color: 'var(--ds-accent)', fontSize: 13, fontWeight: 500,
  fontFamily: 'inherit', cursor: 'pointer', alignSelf: 'flex-start',
};

const LOADING_BLOCK_STYLE = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  height: 200,
};
