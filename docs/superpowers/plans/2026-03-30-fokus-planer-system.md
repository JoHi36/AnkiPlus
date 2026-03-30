# Fokus-Planer System — Implementation Plan (Plan B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-focus learning planner where students set deadline-based goals on deck groups, see layered trajectory predictions, and get an aggregated daily plan showing what's achievable at their current pace.

**Architecture:** Focus CRUD persisted in config.json via bridge. New `useFocusManager` hook replaces `useDeckFocus`. StatistikView conditionally renders treemap (no focuses) or aggregated plan view (has focuses). Each focus has its own colored trajectory line. Aggregated view shows weighted average.

**Tech Stack:** React 18, Python/config.json persistence, existing TrajectoryChart + useTrajectoryModel

**Spec:** `docs/superpowers/specs/2026-03-30-fokus-planer-design.md`

**Depends on:** Plan A (Retrieval Mastery Metric — implemented)

---

## File Structure

```
New files:
  ui/focus_store.py              — Focus CRUD (save/load/delete in config.json)
  frontend/src/hooks/useFocusManager.js  — Focus state, bridge comm, multi-focus orchestration
  frontend/src/components/FocusTabs.jsx  — Tab bar for switching between focuses
  frontend/src/components/AggregatedPlanView.jsx — Ebene 1: layered chart + daily plan
  frontend/src/components/FocusDetailView.jsx    — Ebene 2: single focus drill-in

Modified files:
  ui/bridge.py                   — 3 new slots (saveFocus, getFocuses, deleteFocus)
  ui/widget.py                   — 3 new message handlers
  frontend/src/hooks/useStatistikData.js — load focuses on init
  frontend/src/components/StatistikView.jsx — conditional navigation (treemap vs plan)
```

---

### Task 1: Backend — Focus CRUD in config.json

Create `ui/focus_store.py` with save/load/delete functions for focus objects.

**Files:**
- Create: `ui/focus_store.py`
- Modify: `ui/bridge.py`
- Modify: `ui/widget.py`

- [ ] **Step 1: Create `ui/focus_store.py`**

```python
"""Focus persistence — save/load/delete focuses in config.json."""

import time
import json

try:
    from ..utils.logging import get_logger
    from ..config import get_config, save_config
except ImportError:
    from utils.logging import get_logger
    from config import get_config, save_config

logger = get_logger(__name__)

MAX_FOCUSES = 5

FOCUS_COLORS = [
    [74, 222, 128],   # green
    [96, 165, 250],   # blue
    [251, 191, 36],   # yellow
    [168, 85, 247],   # purple
    [248, 113, 113],  # red
]


def get_focuses():
    """Return list of active (non-archived) focuses."""
    config = get_config(force_reload=True)
    focuses = config.get("focuses", [])
    return [f for f in focuses if not f.get("archived", False)]


def save_focus(focus_data):
    """Save a new focus or update an existing one.

    Args:
        focus_data: dict with keys deckIds, deckNames, deadline.

    Returns:
        dict: the saved focus object with generated id and colorIndex.
    """
    config = get_config(force_reload=True)
    focuses = config.get("focuses", [])
    active = [f for f in focuses if not f.get("archived", False)]

    # Check limits
    if len(active) >= MAX_FOCUSES:
        return {"error": "Maximum %s focuses reached" % MAX_FOCUSES}

    # Check deck duplication
    existing_deck_ids = set()
    for f in active:
        for did in f.get("deckIds", []):
            existing_deck_ids.add(did)

    for did in focus_data.get("deckIds", []):
        if did in existing_deck_ids:
            return {"error": "Deck %s is already in another focus" % did}

    # Assign color (next free index)
    used_colors = {f.get("colorIndex", 0) for f in active}
    color_index = 0
    for i in range(len(FOCUS_COLORS)):
        if i not in used_colors:
            color_index = i
            break

    focus = {
        "id": "focus_%d" % int(time.time()),
        "deckIds": focus_data.get("deckIds", []),
        "deckNames": focus_data.get("deckNames", []),
        "deadline": focus_data.get("deadline", ""),
        "colorIndex": color_index,
        "createdAt": time.strftime("%Y-%m-%d"),
        "archived": False,
    }

    focuses.append(focus)
    config["focuses"] = focuses
    save_config(config)
    logger.info("Saved focus %s with %s decks, deadline %s",
                focus["id"], len(focus["deckIds"]), focus["deadline"])
    return focus


def delete_focus(focus_id):
    """Archive a focus by ID."""
    config = get_config(force_reload=True)
    focuses = config.get("focuses", [])
    found = False
    for f in focuses:
        if f.get("id") == focus_id:
            f["archived"] = True
            found = True
            break
    if found:
        config["focuses"] = focuses
        save_config(config)
        logger.info("Archived focus %s", focus_id)
        return {"success": True}
    return {"error": "Focus not found"}
```

- [ ] **Step 2: Add bridge slots**

In `ui/bridge.py`, add after `getDeckMastery`:

```python
    @pyqtSlot(str, result=str)
    def saveFocus(self, focus_json):
        """Save a new focus."""
        try:
            try:
                from .focus_store import save_focus
            except ImportError:
                from ui.focus_store import save_focus
            data = json.loads(focus_json)
            result = save_focus(data)
            return json.dumps(result)
        except Exception as e:
            logger.exception("saveFocus error: %s", e)
            return json.dumps({"error": str(e)})

    @pyqtSlot(result=str)
    def getFocuses(self):
        """Return all active focuses."""
        try:
            try:
                from .focus_store import get_focuses
            except ImportError:
                from ui.focus_store import get_focuses
            return json.dumps(get_focuses())
        except Exception as e:
            logger.exception("getFocuses error: %s", e)
            return json.dumps([])

    @pyqtSlot(str, result=str)
    def deleteFocus(self, focus_id):
        """Archive a focus."""
        try:
            try:
                from .focus_store import delete_focus
            except ImportError:
                from ui.focus_store import delete_focus
            result = delete_focus(focus_id)
            return json.dumps(result)
        except Exception as e:
            logger.exception("deleteFocus error: %s", e)
            return json.dumps({"error": str(e)})
```

- [ ] **Step 3: Register message handlers in `widget.py`**

Add to handler dict:

```python
            'saveFocus': self._msg_save_focus,
            'getFocuses': self._msg_get_focuses,
            'deleteFocus': self._msg_delete_focus,
```

Add handler methods:

```python
    def _msg_save_focus(self, data=None):
        """Save a focus and send result."""
        result = self.bridge.saveFocus(json.dumps(data or {}))
        try:
            parsed = json.loads(result)
        except (json.JSONDecodeError, TypeError):
            parsed = {"error": "Parse error"}
        self._send_to_frontend("focusSaved", parsed)

    def _msg_get_focuses(self, data=None):
        """Load all focuses and send to frontend."""
        result = self.bridge.getFocuses()
        try:
            parsed = json.loads(result)
        except (json.JSONDecodeError, TypeError):
            parsed = []
        self._send_to_frontend("focusList", parsed)

    def _msg_delete_focus(self, data=None):
        """Delete a focus and send updated list."""
        focus_id = data.get("focusId") if data else None
        if focus_id:
            self.bridge.deleteFocus(focus_id)
        # Send updated list
        self._msg_get_focuses()
```

- [ ] **Step 4: Verify syntax**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -c "import ast; ast.parse(open('ui/focus_store.py').read()); ast.parse(open('ui/bridge.py').read()); ast.parse(open('ui/widget.py').read()); print('OK')"`

- [ ] **Step 5: Commit**

```bash
git add ui/focus_store.py ui/bridge.py ui/widget.py
git commit -m "feat(focus): add focus CRUD backend (save/load/delete in config.json)"
```

---

### Task 2: Frontend — useFocusManager hook

Replace the existing `useDeckFocus` with a more capable `useFocusManager` that handles multiple persisted focuses.

**Files:**
- Create: `frontend/src/hooks/useFocusManager.js`

- [ ] **Step 1: Create the hook**

```javascript
import { useState, useEffect, useCallback, useRef } from 'react';

const FOCUS_COLORS = [
  [74, 222, 128],
  [96, 165, 250],
  [251, 191, 36],
  [168, 85, 247],
  [248, 113, 113],
];

export function getFocusColor(colorIndex, opacity = 1) {
  const [r, g, b] = FOCUS_COLORS[colorIndex % FOCUS_COLORS.length];
  return opacity < 1 ? `rgba(${r},${g},${b},${opacity})` : `rgb(${r},${g},${b})`;
}

export default function useFocusManager() {
  const [focuses, setFocuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFocusId, setActiveFocusId] = useState(null);
  const trajectoryCache = useRef({});

  // Load focuses on mount
  useEffect(() => {
    const handler = (event) => {
      const payload = event.detail || event;
      if (payload?.type === 'focusList') {
        const list = Array.isArray(payload.data) ? payload.data : [];
        setFocuses(list);
        setLoading(false);
      }
      if (payload?.type === 'focusSaved' && payload.data && !payload.data.error) {
        // Reload all focuses after save
        if (window.ankiBridge) {
          window.ankiBridge.addMessage('getFocuses', {});
        }
      }
      if (payload?.type === 'deckTrajectory' && payload.data && !payload.data.error) {
        // Cache trajectory data keyed by the request
        trajectoryCache.current[payload.data._focusDeckId || 'last'] = payload.data;
      }
    };
    window.addEventListener('ankiReceive', handler);

    // Initial load
    if (window.ankiBridge) {
      window.ankiBridge.addMessage('getFocuses', {});
    } else {
      setFocuses([]);
      setLoading(false);
    }

    return () => window.removeEventListener('ankiReceive', handler);
  }, []);

  const createFocus = useCallback((deckCells, deadline) => {
    if (!window.ankiBridge) return;
    window.ankiBridge.addMessage('saveFocus', {
      deckIds: deckCells.map(c => c.id),
      deckNames: deckCells.map(c => c.name),
      deadline: deadline,
    });
  }, []);

  const deleteFocus = useCallback((focusId) => {
    if (!window.ankiBridge) return;
    window.ankiBridge.addMessage('deleteFocus', { focusId });
    setActiveFocusId(null);
  }, []);

  const hasFocuses = focuses.length > 0;

  // Sort by deadline (nearest first)
  const sortedFocuses = [...focuses].sort((a, b) => {
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return a.deadline.localeCompare(b.deadline);
  });

  const activeFocus = activeFocusId
    ? sortedFocuses.find(f => f.id === activeFocusId) || null
    : null;

  return {
    focuses: sortedFocuses,
    hasFocuses,
    loading,
    activeFocusId,
    activeFocus,
    setActiveFocusId,
    createFocus,
    deleteFocus,
    getFocusColor,
  };
}
```

- [ ] **Step 2: Build to verify**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build 2>&1 | tail -3`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useFocusManager.js
git commit -m "feat(focus): add useFocusManager hook with CRUD + color assignment"
```

---

### Task 3: Frontend — FocusTabs component

Tab bar showing active focuses sorted by deadline.

**Files:**
- Create: `frontend/src/components/FocusTabs.jsx`

- [ ] **Step 1: Create the component**

```javascript
import React from 'react';
import { getFocusColor } from '../hooks/useFocusManager';

export default function FocusTabs({ focuses, activeFocusId, onSelect, onAdd }) {
  const daysUntil = (deadline) => {
    if (!deadline) return '?';
    const diff = Math.ceil((new Date(deadline) - new Date()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  };

  return (
    <div style={BAR_STYLE}>
      {focuses.map(f => {
        const isActive = f.id === activeFocusId;
        const color = getFocusColor(f.colorIndex);
        const days = daysUntil(f.deadline);
        return (
          <button
            key={f.id}
            onClick={() => onSelect(isActive ? null : f.id)}
            style={{
              ...TAB_STYLE,
              borderColor: isActive ? color : 'transparent',
              background: isActive ? getFocusColor(f.colorIndex, 0.08) : 'transparent',
            }}
          >
            <span style={{ ...DOT_STYLE, background: color }} />
            <span style={NAME_STYLE}>
              {(f.deckNames || []).join(', ') || 'Fokus'}
            </span>
            <span style={DAYS_STYLE}>{days}d</span>
          </button>
        );
      })}
      <button onClick={onAdd} style={ADD_STYLE}>+</button>
    </div>
  );
}

const BAR_STYLE = {
  display: 'flex', gap: 6, alignItems: 'center',
  overflowX: 'auto', scrollbarWidth: 'none',
  padding: '0 0 4px',
};

const TAB_STYLE = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '6px 12px', borderRadius: 10,
  border: '1.5px solid transparent',
  background: 'transparent',
  cursor: 'pointer', fontFamily: 'inherit',
  fontSize: 12, color: 'var(--ds-text-secondary)',
  transition: 'all 0.15s', whiteSpace: 'nowrap',
};

const DOT_STYLE = {
  width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
};

const NAME_STYLE = {
  maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis',
};

const DAYS_STYLE = {
  fontSize: 10, color: 'var(--ds-text-muted)',
  fontVariantNumeric: 'tabular-nums',
};

const ADD_STYLE = {
  width: 28, height: 28, borderRadius: 8,
  border: '1px solid var(--ds-border-subtle)',
  background: 'transparent', color: 'var(--ds-text-muted)',
  cursor: 'pointer', fontSize: 16, fontFamily: 'inherit',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
```

- [ ] **Step 2: Build to verify**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build 2>&1 | tail -3`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/FocusTabs.jsx
git commit -m "feat(focus): add FocusTabs component"
```

---

### Task 4: Frontend — AggregatedPlanView (Ebene 1)

The default view when focuses exist — shows all trajectories overlaid + aggregated daily plan.

**Files:**
- Create: `frontend/src/components/AggregatedPlanView.jsx`

- [ ] **Step 1: Create the component**

```javascript
import React, { useEffect, useState } from 'react';
import { getFocusColor } from '../hooks/useFocusManager';
import TrajectoryChart from './TrajectoryChart';

export default function AggregatedPlanView({ focuses, onSelectFocus, trajectoryData }) {
  // For v1: show the first focus's trajectory as the main chart
  // Future: layered multi-trajectory
  const primaryFocus = focuses[0];
  const traj = trajectoryData;

  const daysUntil = (deadline) => {
    if (!deadline) return '?';
    return Math.max(0, Math.ceil((new Date(deadline) - new Date()) / (1000 * 60 * 60 * 24)));
  };

  return (
    <div style={CONTAINER_STYLE}>
      {/* Header */}
      <div style={HEADER_STYLE}>
        <span style={TITLE_STYLE}>Dein Lernplan</span>
      </div>

      {/* Trajectory Chart (primary focus for now) */}
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

      {/* Focus list with daily breakdown */}
      <div style={PLAN_STYLE}>
        <div style={PLAN_HEADER_STYLE}>
          <span style={PLAN_TITLE_STYLE}>HEUTE</span>
        </div>
        {focuses.map(f => {
          const color = getFocusColor(f.colorIndex);
          const days = daysUntil(f.deadline);
          return (
            <button
              key={f.id}
              onClick={() => onSelectFocus(f.id)}
              style={PLAN_ROW_STYLE}
            >
              <span style={{ ...ROW_DOT_STYLE, background: color }} />
              <span style={ROW_NAME_STYLE}>
                {(f.deckNames || []).join(', ')}
              </span>
              <span style={ROW_DAYS_STYLE}>{days}d</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const CONTAINER_STYLE = {
  display: 'flex', flexDirection: 'column', gap: 20, width: '100%',
};

const HEADER_STYLE = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
};

const TITLE_STYLE = {
  fontSize: 15, fontWeight: 500, color: 'var(--ds-text-secondary)',
};

const LOADING_STYLE = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200,
};

const PLAN_STYLE = {
  borderRadius: 14, border: '1px solid var(--ds-border-subtle)',
  background: 'var(--ds-bg-canvas)', overflow: 'hidden',
};

const PLAN_HEADER_STYLE = {
  padding: '12px 16px 8px',
};

const PLAN_TITLE_STYLE = {
  fontSize: 10, fontWeight: 500, color: 'var(--ds-text-muted)',
  letterSpacing: 0.5, textTransform: 'uppercase',
};

const PLAN_ROW_STYLE = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '10px 16px', width: '100%',
  background: 'transparent', border: 'none',
  borderTop: '1px solid var(--ds-border-subtle)',
  cursor: 'pointer', fontFamily: 'inherit',
  transition: 'background 0.15s',
};

const ROW_DOT_STYLE = {
  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
};

const ROW_NAME_STYLE = {
  flex: 1, fontSize: 13, color: 'var(--ds-text-primary)', textAlign: 'left',
};

const ROW_DAYS_STYLE = {
  fontSize: 11, color: 'var(--ds-text-muted)', fontVariantNumeric: 'tabular-nums',
};
```

- [ ] **Step 2: Build to verify**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build 2>&1 | tail -3`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/AggregatedPlanView.jsx
git commit -m "feat(focus): add AggregatedPlanView for Ebene 1"
```

---

### Task 5: Frontend — FocusDetailView (Ebene 2)

Single focus drill-in with auto-scaled chart and session suggestion.

**Files:**
- Create: `frontend/src/components/FocusDetailView.jsx`

- [ ] **Step 1: Create the component**

```javascript
import React from 'react';
import { getFocusColor } from '../hooks/useFocusManager';
import TrajectoryChart from './TrajectoryChart';
import SessionSuggestion from './SessionSuggestion';

export default function FocusDetailView({ focus, trajectory, suggestion, onBack }) {
  const color = getFocusColor(focus.colorIndex);
  const daysLeft = focus.deadline
    ? Math.max(0, Math.ceil((new Date(focus.deadline) - new Date()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <div style={CONTAINER_STYLE}>
      {/* Header */}
      <div style={HEADER_STYLE}>
        <button onClick={onBack} style={BACK_STYLE}>← Alle Fokus</button>
        <div style={FOCUS_INFO_STYLE}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ ...DOT_STYLE, background: color }} />
            <span style={FOCUS_NAME_STYLE}>
              {(focus.deckNames || []).join(', ')}
            </span>
          </div>
          {daysLeft !== null && (
            <span style={DEADLINE_STYLE}>
              {daysLeft > 0 ? `${daysLeft} Tage bis ${focus.deadline}` : 'Deadline erreicht'}
            </span>
          )}
        </div>
      </div>

      {/* Trajectory */}
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

      {/* Session Suggestion */}
      <SessionSuggestion suggestion={suggestion} />

      {/* Delete button */}
      <button onClick={() => onBack('delete')} style={DELETE_STYLE}>
        Fokus entfernen
      </button>
    </div>
  );
}

const CONTAINER_STYLE = {
  display: 'flex', flexDirection: 'column', gap: 20, width: '100%',
};

const HEADER_STYLE = {
  display: 'flex', flexDirection: 'column', gap: 8,
};

const BACK_STYLE = {
  background: 'none', border: 'none', padding: '4px 0',
  color: 'var(--ds-accent)', fontSize: 13, fontWeight: 500,
  fontFamily: 'inherit', cursor: 'pointer', alignSelf: 'flex-start',
};

const FOCUS_INFO_STYLE = {
  display: 'flex', flexDirection: 'column', gap: 4,
};

const DOT_STYLE = {
  width: 8, height: 8, borderRadius: '50%',
};

const FOCUS_NAME_STYLE = {
  fontSize: 15, fontWeight: 500, color: 'var(--ds-text-primary)',
};

const DEADLINE_STYLE = {
  fontSize: 12, color: 'var(--ds-text-muted)',
};

const LOADING_STYLE = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200,
};

const DELETE_STYLE = {
  background: 'none', border: 'none', padding: '8px 0',
  color: 'var(--ds-red)', fontSize: 12, fontWeight: 400,
  fontFamily: 'inherit', cursor: 'pointer', alignSelf: 'center',
  opacity: 0.6,
};
```

- [ ] **Step 2: Build to verify**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build 2>&1 | tail -3`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/FocusDetailView.jsx
git commit -m "feat(focus): add FocusDetailView for Ebene 2 drill-in"
```

---

### Task 6: Frontend — StatistikView conditional navigation

Rewire StatistikView to conditionally show treemap (no focuses) or aggregated plan (has focuses), with drill-in support.

**Files:**
- Modify: `frontend/src/components/StatistikView.jsx`

- [ ] **Step 1: Rewrite StatistikView**

Replace the entire file:

```javascript
import React, { useState, useCallback, useMemo } from 'react';
import useStatistikData from '../hooks/useStatistikData';
import useFocusManager from '../hooks/useFocusManager';
import useDeckFocus from '../hooks/useDeckFocus';
import KnowledgeHeatmap from './KnowledgeHeatmap';
import YearHeatmap from './YearHeatmap';
import TimeOfDayChart from './TimeOfDayChart';
import FocusTabs from './FocusTabs';
import AggregatedPlanView from './AggregatedPlanView';
import FocusDetailView from './FocusDetailView';

export default function StatistikView({ deckData }) {
  const { data, loading } = useStatistikData();
  const {
    focuses, hasFocuses, loading: focusLoading,
    activeFocusId, activeFocus, setActiveFocusId,
    createFocus, deleteFocus,
  } = useFocusManager();

  // Deck focus for trajectory data (reuses existing hook)
  const {
    trajectory: deckTrajectory,
    suggestion,
    loading: deckLoading,
    focusDeck,
    goBack: goBackDeck,
  } = useDeckFocus();

  // UI modes: 'treemap' | 'plan' | 'detail'
  const [showTreemap, setShowTreemap] = useState(false);
  const [selectedCells, setSelectedCells] = useState([]);
  const [deadlineInput, setDeadlineInput] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

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
    if (!deadlineInput || !selectedCells.length) return;
    createFocus(selectedCells, deadlineInput);
    setSelectedCells([]);
    setDeadlineInput('');
    setShowDatePicker(false);
    setShowTreemap(false);
  }, [selectedCells, deadlineInput, createFocus]);

  // When a focus is selected, load its trajectory
  const handleSelectFocus = useCallback((focusId) => {
    setActiveFocusId(focusId);
    const focus = focuses.find(f => f.id === focusId);
    if (focus && focus.deckIds?.length > 0) {
      focusDeck({ id: focus.deckIds[0], name: focus.deckNames?.[0] });
    }
  }, [focuses, focusDeck, setActiveFocusId]);

  const handleBackFromDetail = useCallback((action) => {
    if (action === 'delete' && activeFocusId) {
      deleteFocus(activeFocusId);
    }
    setActiveFocusId(null);
    goBackDeck();
  }, [activeFocusId, deleteFocus, setActiveFocusId, goBackDeck]);

  if (loading || focusLoading) {
    return (
      <div style={LOADING_STYLE}>
        <span style={{ color: 'var(--ds-text-muted)', fontSize: 13 }}>Statistik wird geladen…</span>
      </div>
    );
  }

  const heatmapData = data?.heatmap || data?.year_heatmap;
  const todData = data?.timeOfDay || data?.time_of_day;

  // ── Ebene 2: Focus Detail ────────────────────────────────────────────────
  if (activeFocus) {
    return (
      <div style={PAGE_STYLE}>
        <FocusDetailView
          focus={activeFocus}
          trajectory={deckTrajectory}
          suggestion={suggestion}
          onBack={handleBackFromDetail}
        />
      </div>
    );
  }

  // ── Ebene 1: Aggregated Plan (when focuses exist and not in treemap mode)
  if (hasFocuses && !showTreemap) {
    return (
      <div style={PAGE_STYLE}>
        <FocusTabs
          focuses={focuses}
          activeFocusId={null}
          onSelect={handleSelectFocus}
          onAdd={() => setShowTreemap(true)}
        />
        <AggregatedPlanView
          focuses={focuses}
          onSelectFocus={handleSelectFocus}
          trajectoryData={deckTrajectory}
        />
      </div>
    );
  }

  // ── Ebene 0: Treemap (no focuses or adding new focus) ────────────────────
  return (
    <div style={PAGE_STYLE}>
      {hasFocuses && (
        <button onClick={() => setShowTreemap(false)} style={BACK_BUTTON_STYLE}>
          ← Zurück zum Plan
        </button>
      )}

      {/* Treemap */}
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

      {/* Secondary widgets */}
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
          {showDatePicker ? (
            <div style={DATE_PICKER_STYLE}>
              <span style={{ fontSize: 12, color: 'var(--ds-text-secondary)' }}>Bis wann?</span>
              <input
                type="date"
                value={deadlineInput}
                onChange={e => setDeadlineInput(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                style={DATE_INPUT_STYLE}
              />
              <button
                onClick={handleCreateFocus}
                disabled={!deadlineInput}
                style={{
                  ...DOCK_BUTTON_STYLE,
                  opacity: deadlineInput ? 1 : 0.4,
                }}
              >
                Starten
              </button>
            </div>
          ) : selectionSummary ? (
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
              <button onClick={() => setShowDatePicker(true)} style={DOCK_BUTTON_STYLE}>
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
// ── Dock ──
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
  background: 'var(--ds-accent)', color: '#fff',
  border: 'none', fontSize: 13, fontWeight: 600,
  fontFamily: 'inherit', cursor: 'pointer', transition: 'opacity 0.15s',
};
const DOCK_HINT_STYLE = { fontSize: 13, color: 'var(--ds-text-muted)', padding: '2px 12px' };
const DATE_PICKER_STYLE = { display: 'flex', alignItems: 'center', gap: 12 };
const DATE_INPUT_STYLE = {
  padding: '6px 10px', borderRadius: 8,
  border: '1px solid var(--ds-border-subtle)',
  background: 'var(--ds-bg-canvas)', color: 'var(--ds-text-primary)',
  fontSize: 13, fontFamily: 'inherit',
};
```

- [ ] **Step 2: Build and verify**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build 2>&1 | tail -3`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/StatistikView.jsx
git commit -m "feat(focus): conditional navigation — treemap vs plan vs detail"
```

---

### Task 7: Build + Integration Test

Final build, all tests, verify the flow works.

**Files:** No changes needed

- [ ] **Step 1: Run Python tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py 2>&1 | tail -5`

Expected: All pass (except pre-existing test_kg_store failures)

- [ ] **Step 2: Run frontend tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npx vitest run 2>&1 | tail -5`

Expected: All pass

- [ ] **Step 3: Production build**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build 2>&1 | tail -3`

Expected: Clean build

- [ ] **Step 4: Commit build**

```bash
git add web/
git commit -m "chore(focus): production build with focus planer system"
```
