import React, { useState, useCallback, useMemo } from 'react';
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

  // Multi-select state: array of cell objects
  const [selectedCells, setSelectedCells] = useState([]);

  const selectedDeckIds = useMemo(
    () => selectedCells.map(c => c.id),
    [selectedCells]
  );

  const handleSelectDeck = useCallback((cell) => {
    if (!cell) return;
    setSelectedCells(prev => {
      const exists = prev.find(c => c.id === cell.id);
      if (exists) return prev.filter(c => c.id !== cell.id);
      return [...prev, cell];
    });
  }, []);

  const handleDrillDown = useCallback(() => {
    setSelectedCells([]);
  }, []);

  // Aggregated stats for selected decks
  const selectionSummary = useMemo(() => {
    if (!selectedCells.length) return null;
    let totalCards = 0, dueReview = 0, dueNew = 0;
    for (const c of selectedCells) {
      totalCards += c.cards || 0;
      dueReview += c.dueReview || 0;
      dueNew += c.dueNew || 0;
    }
    return { totalCards, dueReview, dueNew, total: dueReview + dueNew };
  }, [selectedCells]);

  const handleSetFocus = useCallback(() => {
    if (selectedCells.length === 1) {
      focusDeck(selectedCells[0]);
    } else if (selectedCells.length > 1) {
      // Treat as combined — use first deck's ID for trajectory
      // but pass all selected info
      focusDeck(selectedCells[0]);
    }
  }, [selectedCells, focusDeck]);

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
          ← Fokus ändern
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
      {/* Hero: Treemap */}
      {deckData?.roots?.length > 0 ? (
        <KnowledgeHeatmap
          deckData={deckData}
          onSelectDeck={handleSelectDeck}
          onDrillDown={handleDrillDown}
          selectedDeckIds={selectedDeckIds}
        />
      ) : (
        <div style={EMPTY_STYLE}>Deck-Daten werden geladen…</div>
      )}

      <div style={DIVIDER_STYLE} />

      {/* Secondary: 3 widgets — Streak | Activity | TimeOfDay */}
      <div style={SECONDARY_ROW_STYLE}>
        {/* Streak widget (square) */}
        <div style={STREAK_WIDGET_STYLE}>
          <div style={STREAK_VALUE_STYLE}>{heatmapData?.streak || 0}</div>
          <div style={STREAK_UNIT_STYLE}>Tage Streak</div>
          {(heatmapData?.best_streak || 0) > 0 && (
            <div style={STREAK_BEST_STYLE}>
              Bester: {heatmapData.best_streak}
            </div>
          )}
        </div>

        {/* Activity heatmap (wide) */}
        <div style={HEATMAP_COL_STYLE}>
          <YearHeatmap
            levels={heatmapData?.levels || []}
            totalYear={heatmapData?.total_year || 0}
            streak={heatmapData?.streak || 0}
            bestStreak={heatmapData?.best_streak || 0}
            hideHeader
          />
        </div>

        {/* TimeOfDay widget (square) */}
        <div style={TIME_COL_STYLE}>
          <TimeOfDayChart
            hours={todData?.hours || []}
            bestStart={todData?.best_start || 0}
            bestEnd={todData?.best_end || 0}
          />
        </div>
      </div>

      {/* Bottom dock — always visible, centered on canvas */}
      <div style={DOCK_WRAP_STYLE}>
        <div className="ds-frosted" style={DOCK_STYLE}>
          {selectionSummary ? (
            <>
              <div style={DOCK_STATS_STYLE}>
                <div style={DOCK_STAT_STYLE}>
                  <span style={DOCK_STAT_VALUE_STYLE}>{selectionSummary.dueReview}</span>
                  <span style={DOCK_STAT_LABEL_STYLE}>Pflege</span>
                </div>
                <span style={DOCK_PLUS_STYLE}>+</span>
                <div style={DOCK_STAT_STYLE}>
                  <span style={{ ...DOCK_STAT_VALUE_STYLE, color: 'var(--ds-green)' }}>
                    {selectionSummary.dueNew}
                  </span>
                  <span style={DOCK_STAT_LABEL_STYLE}>Neue</span>
                </div>
                <span style={DOCK_EQUALS_STYLE}>=</span>
                <div style={DOCK_STAT_STYLE}>
                  <span style={DOCK_TOTAL_VALUE_STYLE}>{selectionSummary.total}</span>
                  <span style={DOCK_STAT_LABEL_STYLE}>Gesamt</span>
                </div>
              </div>
              <button onClick={handleSetFocus} style={DOCK_BUTTON_STYLE}>
                Fokus festlegen
              </button>
            </>
          ) : (
            <span style={DOCK_HINT_STYLE}>Fokus wählen</span>
          )}
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
  flex: 1, display: 'flex', flexDirection: 'column', gap: 24,
  justifyContent: 'center',
  maxWidth: 780, margin: '0 auto', width: '100%',
  padding: '24px 0 100px',
  overflowY: 'auto', scrollbarWidth: 'thin',
};

const EMPTY_STYLE = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  height: 200, color: 'var(--ds-text-muted)', fontSize: 12,
};

const DIVIDER_STYLE = {
  height: 1, background: 'var(--ds-border-subtle)',
};

const SECONDARY_ROW_STYLE = {
  display: 'flex', gap: 20, alignItems: 'flex-end',
};

const STREAK_WIDGET_STYLE = {
  flex: '0 0 60px', display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'flex-end',
  paddingBottom: 4,
};

const STREAK_FLAME_STYLE = { fontSize: 20, lineHeight: 1 };

const STREAK_VALUE_STYLE = {
  fontSize: 32, fontWeight: 200, color: 'var(--ds-text-primary)',
  lineHeight: 1, marginTop: 4,
};

const STREAK_UNIT_STYLE = {
  fontSize: 10, color: 'var(--ds-text-muted)', marginTop: 2,
};

const STREAK_BEST_STYLE = {
  fontSize: 9, color: 'var(--ds-text-muted)', marginTop: 6,
  opacity: 0.5,
};

const HEATMAP_COL_STYLE = { flex: 1, minWidth: 0 };

const TIME_COL_STYLE = { flex: '0 0 100px' };

const BACK_BUTTON_STYLE = {
  background: 'none', border: 'none', padding: '4px 0',
  color: 'var(--ds-accent)', fontSize: 13, fontWeight: 500,
  fontFamily: 'inherit', cursor: 'pointer', alignSelf: 'flex-start',
};

const LOADING_BLOCK_STYLE = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  height: 200,
};

// ── Bottom Dock ──────────────────────────────────────────────────────────────

const DOCK_WRAP_STYLE = {
  position: 'fixed', bottom: 22, left: '50%',
  transform: 'translateX(-50%)', zIndex: 100,
};

const DOCK_STYLE = {
  display: 'flex', alignItems: 'center', gap: 20,
  padding: '12px 20px', borderRadius: 16,
  border: '1px solid var(--ds-border-subtle)',
  boxShadow: 'var(--ds-shadow-lg)',
};

const DOCK_STATS_STYLE = {
  display: 'flex', alignItems: 'center', gap: 12,
};

const DOCK_STAT_STYLE = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
};

const DOCK_STAT_VALUE_STYLE = {
  fontSize: 18, fontWeight: 600, color: 'var(--ds-accent)',
  fontVariantNumeric: 'tabular-nums',
};

const DOCK_STAT_LABEL_STYLE = {
  fontSize: 10, color: 'var(--ds-text-muted)', textTransform: 'uppercase',
  letterSpacing: 0.5,
};

const DOCK_TOTAL_VALUE_STYLE = {
  fontSize: 20, fontWeight: 600, color: 'var(--ds-text-primary)',
  fontVariantNumeric: 'tabular-nums',
};

const DOCK_PLUS_STYLE = {
  fontSize: 14, color: 'var(--ds-text-muted)', fontWeight: 300,
};

const DOCK_EQUALS_STYLE = {
  fontSize: 14, color: 'var(--ds-text-tertiary)', fontWeight: 300,
};

const DOCK_BUTTON_STYLE = {
  padding: '8px 20px', borderRadius: 10,
  background: 'var(--ds-accent)', color: '#fff',
  border: 'none', fontSize: 13, fontWeight: 600,
  fontFamily: 'inherit', cursor: 'pointer',
  transition: 'opacity 0.15s',
};

const DOCK_HINT_STYLE = {
  fontSize: 13, color: 'var(--ds-text-muted)',
  padding: '2px 12px',
};
