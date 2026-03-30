import React, { useState, useCallback, useMemo } from 'react';
import useStatistikData from '../hooks/useStatistikData';
import useFocusManager from '../hooks/useFocusManager';
import KnowledgeHeatmap from './KnowledgeHeatmap';
import YearHeatmap from './YearHeatmap';
import TimeOfDayChart from './TimeOfDayChart';
import AggregatedPlanView from './AggregatedPlanView';
import FocusDetailView from './FocusDetailView';

export default function StatistikView({ deckData }) {
  const { data, loading } = useStatistikData();
  const {
    focuses, hasFocuses, loading: focusLoading,
    activeFocusId, activeFocus, setActiveFocusId,
    createFocus, deleteFocus,
    trajectories, suggestions, aggregateTrajectory,
  } = useFocusManager();

  const [showTreemap, setShowTreemap] = useState(false);
  const [selectedCells, setSelectedCells] = useState([]);

  const selectedDeckIds = useMemo(() => selectedCells.map(c => c.id), [selectedCells]);

  const handleSelectDeck = useCallback((cell) => {
    if (!cell) return;
    setSelectedCells(prev => {
      const exists = prev.find(c => c.id === cell.id);
      if (exists) return prev.filter(c => c.id !== cell.id);
      return [...prev, cell];
    });
  }, []);

  const handleDrillDown = useCallback(() => setSelectedCells([]), []);

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

  const handleCreateFocus = useCallback(() => {
    if (!selectedCells.length) return;
    createFocus(selectedCells);
    setSelectedCells([]);
    setShowTreemap(false);
  }, [selectedCells, createFocus]);

  const handleSelectFocus = useCallback((focusId) => {
    setActiveFocusId(focusId);
  }, [setActiveFocusId]);

  const handleBackFromDetail = useCallback((action) => {
    if (action === 'delete' && activeFocusId) {
      deleteFocus(activeFocusId);
    }
    setActiveFocusId(null);
  }, [activeFocusId, deleteFocus, setActiveFocusId]);

  if (loading || focusLoading) {
    return (
      <div style={LOADING_STYLE}>
        <span style={{ color: 'var(--ds-text-muted)', fontSize: 13 }}>Statistik wird geladen…</span>
      </div>
    );
  }

  const heatmapData = data?.heatmap || data?.year_heatmap;
  const todData = data?.timeOfDay || data?.time_of_day;

  // -- Ebene 2: Focus Detail ------------------------------------------------
  if (activeFocus) {
    return (
      <div style={PAGE_STYLE}>
        <FocusDetailView
          focus={activeFocus}
          trajectory={trajectories[activeFocusId]}
          suggestion={suggestions[activeFocusId]}
          onBack={handleBackFromDetail}
        />
      </div>
    );
  }

  // -- Ebene 1: Aggregated Plan (when focuses exist and not in treemap mode) -
  if (hasFocuses && !showTreemap) {
    return (
      <div style={PAGE_STYLE}>
        <AggregatedPlanView
          focuses={focuses}
          onSelectFocus={handleSelectFocus}
          onAddFocus={() => setShowTreemap(true)}
          trajectories={trajectories}
          suggestions={suggestions}
          aggregateTrajectory={aggregateTrajectory}
          heatmapData={heatmapData}
          todData={todData}
        />
      </div>
    );
  }

  // -- Ebene 0: Treemap (no focuses or adding new focus) ---------------------
  return (
    <div style={PAGE_STYLE}>
      {hasFocuses && (
        <button onClick={() => setShowTreemap(false)} style={BACK_BUTTON_STYLE}>
          ← Zurück zum Plan
        </button>
      )}

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

      <div style={SECONDARY_ROW_STYLE}>
        <div style={STREAK_WIDGET_STYLE}>
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
        <div style={TIME_COL_STYLE}>
          <TimeOfDayChart
            hours={todData?.hours || []}
            bestStart={todData?.best_start || 0}
            bestEnd={todData?.best_end || 0}
          />
        </div>
      </div>

      {/* Bottom dock */}
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
              <button onClick={handleCreateFocus} style={DOCK_BUTTON_STYLE}>
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

// -- Styles ------------------------------------------------------------------

const LOADING_STYLE = { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const PAGE_STYLE = {
  flex: 1, display: 'flex', flexDirection: 'column', gap: 24,
  justifyContent: 'center', maxWidth: 780, margin: '0 auto', width: '100%',
  padding: '24px 0 100px', overflowY: 'auto', scrollbarWidth: 'thin',
};
const EMPTY_STYLE = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  height: 200, color: 'var(--ds-text-muted)', fontSize: 12,
};
const DIVIDER_STYLE = { height: 1, background: 'var(--ds-border-subtle)' };
const SECONDARY_ROW_STYLE = { display: 'flex', gap: 20, alignItems: 'center' };
const STREAK_WIDGET_STYLE = {
  flex: '0 0 60px', display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center',
};
const STREAK_VALUE_STYLE = {
  fontSize: 32, fontWeight: 200, color: 'var(--ds-text-primary)', lineHeight: 1, marginTop: 4,
};
const STREAK_UNIT_STYLE = { fontSize: 10, color: 'var(--ds-text-muted)', marginTop: 2 };
const STREAK_BEST_STYLE = { fontSize: 9, color: 'var(--ds-text-muted)', marginTop: 6, opacity: 0.5 };
const HEATMAP_COL_STYLE = { flex: 1, minWidth: 0 };
const TIME_COL_STYLE = { flex: '0 0 100px' };
const BACK_BUTTON_STYLE = {
  background: 'none', border: 'none', padding: '4px 0',
  color: 'var(--ds-accent)', fontSize: 13, fontWeight: 500,
  fontFamily: 'inherit', cursor: 'pointer', alignSelf: 'flex-start',
};
const DOCK_WRAP_STYLE = {
  position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', zIndex: 100,
};
const DOCK_STYLE = {
  display: 'flex', alignItems: 'center', gap: 20,
  padding: '12px 20px', borderRadius: 16,
  border: '1px solid var(--ds-border-subtle)', boxShadow: 'var(--ds-shadow-lg)',
};
const DOCK_STATS_STYLE = { display: 'flex', alignItems: 'center', gap: 12 };
const DOCK_STAT_STYLE = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 };
const DOCK_STAT_VALUE_STYLE = {
  fontSize: 18, fontWeight: 600, color: 'var(--ds-accent)', fontVariantNumeric: 'tabular-nums',
};
const DOCK_STAT_LABEL_STYLE = {
  fontSize: 10, color: 'var(--ds-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5,
};
const DOCK_TOTAL_VALUE_STYLE = {
  fontSize: 20, fontWeight: 600, color: 'var(--ds-text-primary)', fontVariantNumeric: 'tabular-nums',
};
const DOCK_PLUS_STYLE = { fontSize: 14, color: 'var(--ds-text-muted)', fontWeight: 300 };
const DOCK_EQUALS_STYLE = { fontSize: 14, color: 'var(--ds-text-tertiary)', fontWeight: 300 };
const DOCK_BUTTON_STYLE = {
  padding: '8px 20px', borderRadius: 10,
  background: 'var(--ds-accent)', color: 'white',
  border: 'none', fontSize: 13, fontWeight: 600,
  fontFamily: 'inherit', cursor: 'pointer', transition: 'opacity 0.15s',
};
const DOCK_HINT_STYLE = { fontSize: 13, color: 'var(--ds-text-muted)', padding: '2px 12px' };
