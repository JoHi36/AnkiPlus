# Statistik als Lernplan — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform StatistikView from a passive dashboard into a two-level Lernplan with a polished KnowledgeHeatmap (mastery-sorted, gradient-colored) as hero, and a per-deck TrajectoryChart + SessionSuggestion as drill-in.

**Architecture:** Level 1 = polished Treemap hero + YearHeatmap + TimeOfDay. Tap on deck → Level 2 = per-deck TrajectoryChart + SessionSuggestion. New backend calls `getDeckTrajectory(deckId)` and `getDeckSessionSuggestion(deckId)`. Last selection persisted in config.json.

**Tech Stack:** React 18, SVG rendering, Python/Anki revlog queries, bridge message queue

**Spec:** `docs/superpowers/specs/2026-03-30-statistik-lernplan-flow-design.md`

---

### Task 1: Backend — `get_deck_trajectory(deck_id)`

Add per-deck trajectory function to bridge_stats.py. Same logic as `get_trajectory_data()` but filtered to a specific deck.

**Files:**
- Modify: `ui/bridge_stats.py` (append new function)
- Modify: `ui/bridge.py:1433-1465` (add new slot)
- Modify: `ui/widget.py:1261` (register handler), `ui/widget.py:2847` (add handler)

- [ ] **Step 1: Add `get_deck_trajectory(deck_id)` to `bridge_stats.py`**

Append after `get_trajectory_data()` (after line 165):

```python
def get_deck_trajectory(deck_id):
    """Daily progress for the last 180 days, filtered to a specific deck.

    Args:
        deck_id: Anki deck ID (int or str).

    Returns:
        dict with same structure as get_trajectory_data(), but scoped to one deck.
    """
    try:
        from ..utils.anki import run_on_main_thread
    except ImportError:
        from utils.anki import run_on_main_thread

    def _collect():
        from aqt import mw
        from datetime import date, timedelta, datetime
        from collections import defaultdict

        if mw is None or mw.col is None:
            return {"error": "No collection"}

        did = int(deck_id)
        today = date.today()
        days_back = 180
        rollover_offset_ms = _DAY_ROLLOVER_HOUR * 3600 * 1000

        # Get all card IDs in this deck (including children)
        try:
            deck = mw.col.decks.get(did)
            if deck is None:
                return {"error": "Deck not found"}
            deck_name = deck["name"]
            # Cards in this deck or child decks
            card_ids = set(
                mw.col.db.list(
                    "SELECT c.id FROM cards c JOIN notes n ON c.nid = n.id "
                    "WHERE c.did IN (SELECT id FROM decks WHERE name = ? OR name LIKE ?)",
                    deck_name, deck_name + "::%"
                )
            )
        except Exception as e:
            logger.warning("get_deck_trajectory: deck query failed: %s", e)
            return {"error": str(e)}

        if not card_ids:
            return {"days": [], "current_pct": 0, "avg_new_7d": 0,
                    "total_cards": 0, "mature_cards": 0, "young_cards": 0}

        total = len(card_ids)

        # Current maturity for this deck
        mature = 0
        young = 0
        for row in mw.col.db.all(
            "SELECT id, ivl FROM cards WHERE id IN " + _sql_in(card_ids)
        ):
            if row[1] >= 21:
                mature += 1
            elif row[1] > 0:
                young += 1
        current_pct = round((mature + young * 0.5) / total * 100, 1) if total > 0 else 0.0

        # Revlog entries for these cards
        cutoff_ms = int(
            (datetime.combine(today - timedelta(days=days_back),
             datetime.min.time()).timestamp()) * 1000 - rollover_offset_ms
        )
        rows = mw.col.db.all(
            "SELECT id, type, cid FROM revlog WHERE id >= ?",
            cutoff_ms,
        )

        day_reviews = defaultdict(int)
        day_new = defaultdict(int)
        for rev_id, rev_type, cid in rows:
            if cid not in card_ids:
                continue
            shifted_ms = rev_id - rollover_offset_ms
            shifted_s = shifted_ms / 1000
            day_str = date.fromtimestamp(shifted_s).isoformat()
            day_reviews[day_str] += 1
            if rev_type == 0:
                day_new[day_str] += 1

        # Build ordered day list
        days_data = []
        date_strings = []
        new_counts_last_7 = []
        for i in range(days_back - 1, -1, -1):
            d = today - timedelta(days=i)
            d_str = d.isoformat()
            rev_count = day_reviews.get(d_str, 0)
            n_count = day_new.get(d_str, 0)
            days_data.append({
                "date": d_str,
                "review_count": rev_count,
                "new_count": n_count,
            })
            date_strings.append(d_str)
            if i < 7:
                new_counts_last_7.append(n_count)

        avg_new_7d = round(sum(new_counts_last_7) / max(len(new_counts_last_7), 1), 1)

        # Reconstruct daily mature_pct for this deck
        try:
            ivl_rows = mw.col.db.all(
                "SELECT cid, date(id/1000 - ?, 'unixepoch', 'localtime'), ivl "
                "FROM revlog WHERE id >= ? ORDER BY id",
                _DAY_ROLLOVER_HOUR * 3600, cutoff_ms,
            )
            # Filter to only this deck's cards
            deck_ivl_rows = [(cid, d, ivl) for cid, d, ivl in ivl_rows if cid in card_ids]
            daily_pcts = _compute_daily_mature_pct(deck_ivl_rows, date_strings, total)
            for entry, pct in zip(days_data, daily_pcts):
                entry["mature_pct"] = pct
        except Exception as e:
            logger.warning("get_deck_trajectory: mature_pct reconstruction failed: %s", e)
            for entry in days_data:
                entry["mature_pct"] = 0.0

        return {
            "days": days_data,
            "current_pct": current_pct,
            "avg_new_7d": avg_new_7d,
            "total_cards": total,
            "mature_cards": mature,
            "young_cards": young,
        }

    try:
        return run_on_main_thread(_collect, timeout=9)
    except Exception as e:
        logger.exception("get_deck_trajectory failed: %s", e)
        return {"error": str(e)}


def _sql_in(ids):
    """Build a SQL IN clause from a set of IDs."""
    return "(%s)" % ",".join(str(int(i)) for i in ids)
```

- [ ] **Step 2: Add `getDeckTrajectory` slot to `bridge.py`**

After the `getStatistikData` method (line ~1465), add:

```python
    @pyqtSlot(str, result=str)
    def getDeckTrajectory(self, deck_id_str):
        """Return trajectory data for a specific deck."""
        try:
            try:
                from .bridge_stats import get_deck_trajectory
            except ImportError:
                from ui.bridge_stats import get_deck_trajectory
            result = get_deck_trajectory(deck_id_str)
            return json.dumps(result)
        except Exception as e:
            logger.exception("getDeckTrajectory error: %s", e)
            return json.dumps({"error": str(e)})
```

- [ ] **Step 3: Register message handler in `widget.py`**

Add to the handler dict (around line 1261, after `'getStatistikData'`):

```python
            'getDeckTrajectory': self._msg_get_deck_trajectory,
```

Add the handler method (after `_msg_get_statistik_data`, around line 2848):

```python
    def _msg_get_deck_trajectory(self, data=None):
        """Fetch per-deck trajectory data and send to frontend."""
        deck_id = data.get("deckId") if data else None
        if not deck_id:
            self._send_to_frontend("deckTrajectory", {"error": "No deckId"})
            return
        result = self.bridge.getDeckTrajectory(str(deck_id))
        try:
            parsed = json.loads(result)
        except (json.JSONDecodeError, TypeError) as e:
            logger.warning("Failed to parse getDeckTrajectory response: %s", e)
            parsed = {"error": "Parse error"}
        self._send_to_frontend("deckTrajectory", parsed)
```

- [ ] **Step 4: Verify no syntax errors**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -c "import ast; ast.parse(open('ui/bridge_stats.py').read()); ast.parse(open('ui/bridge.py').read()); ast.parse(open('ui/widget.py').read()); print('OK')"`

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add ui/bridge_stats.py ui/bridge.py ui/widget.py
git commit -m "feat(stats): add per-deck trajectory backend (getDeckTrajectory)"
```

---

### Task 2: Backend — `get_deck_session_suggestion(deck_id)`

Add session suggestion calculation that tells the user how many review + new cards to do today for a given deck.

**Files:**
- Modify: `ui/bridge_stats.py` (append new function)
- Modify: `ui/bridge.py` (add new slot)
- Modify: `ui/widget.py` (register handler + add handler)

- [ ] **Step 1: Add `get_deck_session_suggestion(deck_id)` to `bridge_stats.py`**

Append after `get_deck_trajectory()`:

```python
def get_deck_session_suggestion(deck_id):
    """Calculate recommended session for a specific deck.

    Returns:
        dict with keys:
          - dueReview: int — currently due review cards
          - recommendedNew: int — suggested new cards for today
          - total: int — dueReview + recommendedNew
          - deckName: str — display name of the deck
          - totalCards: int — total cards in deck
          - matureCards: int — mature cards (ivl >= 21)
          - youngCards: int — young/learning cards (0 < ivl < 21)
          - newAvailable: int — unseen cards available
    """
    try:
        from ..utils.anki import run_on_main_thread
    except ImportError:
        from utils.anki import run_on_main_thread

    def _collect():
        from aqt import mw

        if mw is None or mw.col is None:
            return {"error": "No collection"}

        did = int(deck_id)
        deck = mw.col.decks.get(did)
        if deck is None:
            return {"error": "Deck not found"}

        deck_name = deck["name"]

        # Get deck IDs (this deck + children)
        child_dids = [
            d["id"] for d in mw.col.decks.all()
            if d["name"] == deck_name or d["name"].startswith(deck_name + "::")
        ]
        did_clause = ",".join(str(d) for d in child_dids)

        # Card counts
        total = mw.col.db.scalar(
            "SELECT COUNT(*) FROM cards WHERE did IN (%s)" % did_clause
        ) or 0
        mature = mw.col.db.scalar(
            "SELECT COUNT(*) FROM cards WHERE did IN (%s) AND ivl >= 21" % did_clause
        ) or 0
        young = mw.col.db.scalar(
            "SELECT COUNT(*) FROM cards WHERE did IN (%s) AND ivl > 0 AND ivl < 21" % did_clause
        ) or 0

        # Due counts (using Anki's queue system)
        # queue: 0=new, 1=learning, 2=review, 3=day-learn, -1=suspended, -2=buried
        due_review = mw.col.db.scalar(
            "SELECT COUNT(*) FROM cards WHERE did IN (%s) AND queue IN (1,2,3)" % did_clause
        ) or 0
        new_available = mw.col.db.scalar(
            "SELECT COUNT(*) FROM cards WHERE did IN (%s) AND queue = 0" % did_clause
        ) or 0

        # Recommended new cards: use deck's daily new card limit
        conf = mw.col.decks.config_dict_for_deck_id(did)
        daily_new_limit = conf.get("new", {}).get("perDay", 20)
        # How many new cards already studied today
        from datetime import date, datetime
        today_start_ms = int(
            datetime.combine(date.today(), datetime.min.time()).timestamp() * 1000
        )
        new_today = mw.col.db.scalar(
            "SELECT COUNT(DISTINCT cid) FROM revlog "
            "WHERE id >= ? AND type = 0 AND cid IN "
            "(SELECT id FROM cards WHERE did IN (%s))" % did_clause,
            today_start_ms,
        ) or 0
        recommended_new = min(
            max(0, daily_new_limit - new_today),
            new_available,
        )

        return {
            "dueReview": due_review,
            "recommendedNew": recommended_new,
            "total": due_review + recommended_new,
            "deckName": deck_name.split("::")[-1],
            "totalCards": total,
            "matureCards": mature,
            "youngCards": young,
            "newAvailable": new_available,
        }

    try:
        return run_on_main_thread(_collect, timeout=9)
    except Exception as e:
        logger.exception("get_deck_session_suggestion failed: %s", e)
        return {"error": str(e)}
```

- [ ] **Step 2: Add `getDeckSessionSuggestion` slot to `bridge.py`**

After the `getDeckTrajectory` method:

```python
    @pyqtSlot(str, result=str)
    def getDeckSessionSuggestion(self, deck_id_str):
        """Return session suggestion for a specific deck."""
        try:
            try:
                from .bridge_stats import get_deck_session_suggestion
            except ImportError:
                from ui.bridge_stats import get_deck_session_suggestion
            result = get_deck_session_suggestion(deck_id_str)
            return json.dumps(result)
        except Exception as e:
            logger.exception("getDeckSessionSuggestion error: %s", e)
            return json.dumps({"error": str(e)})
```

- [ ] **Step 3: Register handler in `widget.py`**

Add to handler dict:

```python
            'getDeckSessionSuggestion': self._msg_get_deck_session_suggestion,
```

Add handler method:

```python
    def _msg_get_deck_session_suggestion(self, data=None):
        """Fetch per-deck session suggestion and send to frontend."""
        deck_id = data.get("deckId") if data else None
        if not deck_id:
            self._send_to_frontend("deckSessionSuggestion", {"error": "No deckId"})
            return
        result = self.bridge.getDeckSessionSuggestion(str(deck_id))
        try:
            parsed = json.loads(result)
        except (json.JSONDecodeError, TypeError) as e:
            logger.warning("Failed to parse getDeckSessionSuggestion response: %s", e)
            parsed = {"error": "Parse error"}
        self._send_to_frontend("deckSessionSuggestion", parsed)
```

- [ ] **Step 4: Verify no syntax errors**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -c "import ast; ast.parse(open('ui/bridge_stats.py').read()); ast.parse(open('ui/bridge.py').read()); ast.parse(open('ui/widget.py').read()); print('OK')"`

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add ui/bridge_stats.py ui/bridge.py ui/widget.py
git commit -m "feat(stats): add per-deck session suggestion backend"
```

---

### Task 3: KnowledgeHeatmap — Polished Visual Overhaul

Restyle the treemap: mastery-based color gradient, sorted strongest-first, gaps, rounded corners, gradient fills.

**Files:**
- Modify: `frontend/src/components/KnowledgeHeatmap.jsx`

- [ ] **Step 1: Replace `strengthColor()` with mastery gradient function**

Replace the `strengthColor` function (lines 52-61) with:

```javascript
function masteryColor(strength, opacity = 0.14) {
  // Continuous red → orange → yellow → lime → green based on mastery
  const pct = Math.max(0, Math.min(1, strength));
  let r, g, b;
  if (pct < 0.3) {
    // red → orange
    const t = pct / 0.3;
    r = 248; g = Math.round(113 + t * (146 - 113)); b = Math.round(113 + t * (60 - 113));
  } else if (pct < 0.5) {
    // orange → yellow
    const t = (pct - 0.3) / 0.2;
    r = Math.round(251 - t * (251 - 251)); g = Math.round(146 + t * (191 - 146)); b = Math.round(60 - t * (60 - 36));
  } else if (pct < 0.7) {
    // yellow → lime
    const t = (pct - 0.5) / 0.2;
    r = Math.round(251 - t * (251 - 163)); g = Math.round(191 + t * (230 - 191)); b = Math.round(36 - t * (36 - 53));
  } else {
    // lime → green
    const t = Math.min(1, (pct - 0.7) / 0.3);
    r = Math.round(163 - t * (163 - 74)); g = Math.round(230 - t * (230 - 222)); b = Math.round(53 + t * (128 - 53));
  }
  return { r, g, b, opacity };
}

function masteryGradientStyle(strength) {
  const { r, g, b } = masteryColor(strength);
  return {
    background: `linear-gradient(135deg, rgba(${r},${g},${b},0.16), rgba(${r},${g},${b},0.04))`,
    borderColor: `rgba(${r},${g},${b},0.12)`,
    textColor: `rgba(${r},${g},${b},0.85)`,
    labelColor: `rgba(${r},${g},${b},0.4)`,
    metaColor: `rgba(${r},${g},${b},0.25)`,
  };
}
```

- [ ] **Step 2: Sort items strongest-first in cell computation**

In the `useEffect` that computes cells (lines 157-165), change the sort direction from ascending to descending:

Replace:
```javascript
    // Sort ascending by strength (weakest top-left)
    items.sort((a, b) => a.strength - b.strength);
```

With:
```javascript
    // Sort descending by strength (strongest top-left — motivating framing)
    items.sort((a, b) => b.strength - a.strength);
```

- [ ] **Step 3: Add gap constant and update squarify call**

The gaps are achieved by insetting each cell after layout. Add a constant at the top of the component (line 90 area):

```javascript
const CELL_GAP = 3; // 3px per side = 6px gap between cells
const CELL_RADIUS = 14;
```

In the cell rendering (inside the `.map()` around line 239), adjust positions to create gaps:

Replace the `cellStyle` block (lines 244-268) with:

```javascript
          const colors = masteryGradientStyle(cell.strength);
          let cellStyle = {
            position: 'absolute',
            left: cell.x + CELL_GAP,
            top: cell.y + CELL_GAP,
            width: cell.w - CELL_GAP * 2,
            height: cell.h - CELL_GAP * 2,
            boxSizing: 'border-box',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '12px 14px',
            background: colors.background,
            border: `1px solid ${colors.borderColor}`,
            borderRadius: CELL_RADIUS,
            transition: [
              'left 0.55s cubic-bezier(0.4,0,0.15,1)',
              'top 0.55s cubic-bezier(0.4,0,0.15,1)',
              'width 0.55s cubic-bezier(0.4,0,0.15,1)',
              'height 0.55s cubic-bezier(0.4,0,0.15,1)',
              'opacity 0.3s ease',
            ].join(', '),
          };
```

- [ ] **Step 4: Update cell text rendering to use mastery colors**

Replace the text rendering block (lines 294-335) with:

```javascript
              {textVisible && (
                <>
                  <div style={{
                    fontSize: 10, fontWeight: 500,
                    color: colors.labelColor,
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                    marginBottom: 4,
                    transition: 'opacity 0.2s',
                  }}>
                    {cell.name}
                    {cell.hasChildren && (
                      <span style={{ opacity: 0.5, fontWeight: 400 }}> ›</span>
                    )}
                  </div>
                  {showPct && (
                    <div style={{
                      fontSize: Math.max(18, Math.min(34, cell.w / 8)),
                      fontWeight: 600,
                      color: colors.textColor,
                      lineHeight: 1,
                      transition: 'opacity 0.2s',
                    }}>
                      {pct}%
                    </div>
                  )}
                  {showMeta && (
                    <div style={{
                      fontSize: 11,
                      color: colors.metaColor,
                      marginTop: 4,
                      transition: 'opacity 0.2s',
                    }}>
                      {cell.cards} Karten
                    </div>
                  )}
                </>
              )}
```

- [ ] **Step 5: Update container styling**

Replace the container `div` style (lines 228-238):

```javascript
        style={{
          width: '100%',
          aspectRatio: '16/9',
          position: 'relative',
          borderRadius: 16,
          overflow: 'hidden',
        }}
```

Remove the `background: 'var(--ds-bg-deep)'` — the cells themselves provide the visual through their gradients. The container should be transparent.

- [ ] **Step 6: Remove selection outline logic**

The selection outline (`outline: selectedDeckId === cell.id ? ...`) is no longer needed since single-tap now opens Level 2 instead of toggling selection. Remove the outline from cellStyle.

- [ ] **Step 7: Build and verify visually**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build`

Expected: Build succeeds. Open dev server to verify: treemap cells are rounded, have gaps, use mastery-gradient colors, and strongest deck appears top-left.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/KnowledgeHeatmap.jsx
git commit -m "feat(stats): polished treemap with mastery gradient and strongest-first sort"
```

---

### Task 4: KnowledgeHeatmap — Tap → Level 2, Long-Press → Drill-Down

Change interaction model: single-tap fires `onDeckFocus(deckId)` for Level 2, long-press triggers drill-down.

**Files:**
- Modify: `frontend/src/components/KnowledgeHeatmap.jsx`

- [ ] **Step 1: Add long-press detection refs**

Add after the `lastTapRef` (line 105):

```javascript
  const longPressRef = useRef(null);
  const longPressTriggered = useRef(false);
```

- [ ] **Step 2: Replace `handleCellClick` with tap/long-press handlers**

Replace the `handleCellClick` callback (lines 169-183) with three handlers:

```javascript
  const handlePointerDown = useCallback((cell) => {
    longPressTriggered.current = false;
    longPressRef.current = setTimeout(() => {
      longPressTriggered.current = true;
      if (cell.hasChildren) {
        drillInto(cell);
      }
    }, 500);
  }, [drillInto]);

  const handlePointerUp = useCallback(() => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }, []);

  const handleCellClick = useCallback((cell) => {
    if (longPressTriggered.current) return;
    // Single tap → open Level 2 (deck focus)
    onSelectDeck?.(cell);
  }, [onSelectDeck]);
```

- [ ] **Step 3: Wire up pointer events on cells**

In the cell `div` (line 292), replace `onClick={() => handleCellClick(cell)}` with:

```javascript
              onPointerDown={() => handlePointerDown(cell)}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              onClick={() => handleCellClick(cell)}
```

- [ ] **Step 4: Clean up — remove `lastTapRef` and double-tap logic**

Remove line 105 (`const lastTapRef = useRef(...)`) since double-tap is no longer used.

- [ ] **Step 5: Build and verify**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build`

Expected: Build succeeds. Single tap calls `onSelectDeck`, long-press (500ms) triggers drill-down.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/KnowledgeHeatmap.jsx
git commit -m "feat(stats): single-tap → level 2, long-press → drill-down"
```

---

### Task 5: Frontend — `useDeckFocus` hook

New hook that manages Level 2 state: fetching per-deck trajectory + session suggestion, caching results, and persisting last selection.

**Files:**
- Create: `frontend/src/hooks/useDeckFocus.js`

- [ ] **Step 1: Create the hook**

```javascript
import { useState, useEffect, useCallback, useRef } from 'react';

export default function useDeckFocus() {
  const [focusedDeckId, setFocusedDeckId] = useState(null);
  const [trajectory, setTrajectory] = useState(null);
  const [suggestion, setSuggestion] = useState(null);
  const [loading, setLoading] = useState(false);
  const cache = useRef({});

  // Listen for backend responses
  useEffect(() => {
    const handler = (event) => {
      const payload = event.detail || event;
      if (payload?.type === 'deckTrajectory' && payload.data) {
        const data = payload.data;
        if (!data.error) {
          cache.current[`traj_${focusedDeckId}`] = data;
          setTrajectory(data);
        }
      }
      if (payload?.type === 'deckSessionSuggestion' && payload.data) {
        const data = payload.data;
        if (!data.error) {
          cache.current[`sugg_${focusedDeckId}`] = data;
          setSuggestion(data);
          setLoading(false);
        }
      }
    };
    window.addEventListener('ankiReceive', handler);
    return () => window.removeEventListener('ankiReceive', handler);
  }, [focusedDeckId]);

  const focusDeck = useCallback((deckCell) => {
    if (!deckCell) {
      setFocusedDeckId(null);
      setTrajectory(null);
      setSuggestion(null);
      setLoading(false);
      return;
    }

    const id = deckCell.id;
    setFocusedDeckId(id);

    // Check cache
    const cachedTraj = cache.current[`traj_${id}`];
    const cachedSugg = cache.current[`sugg_${id}`];

    if (cachedTraj && cachedSugg) {
      setTrajectory(cachedTraj);
      setSuggestion(cachedSugg);
      setLoading(false);
      return;
    }

    setLoading(true);
    setTrajectory(cachedTraj || null);
    setSuggestion(cachedSugg || null);

    // Request from backend
    if (window.ankiBridge) {
      window.ankiBridge.addMessage('getDeckTrajectory', { deckId: id });
      window.ankiBridge.addMessage('getDeckSessionSuggestion', { deckId: id });
    }
  }, []);

  const goBack = useCallback(() => {
    setFocusedDeckId(null);
    setTrajectory(null);
    setSuggestion(null);
    setLoading(false);
  }, []);

  return {
    focusedDeckId,
    trajectory,
    suggestion,
    loading,
    focusDeck,
    goBack,
  };
}
```

- [ ] **Step 2: Build to verify**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build`

Expected: Build succeeds (hook is just created, not yet imported).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useDeckFocus.js
git commit -m "feat(stats): add useDeckFocus hook for level-2 state management"
```

---

### Task 6: Frontend — SessionSuggestion Component

New component that displays the informative learning suggestion card.

**Files:**
- Create: `frontend/src/components/SessionSuggestion.jsx`

- [ ] **Step 1: Create the component**

```javascript
import React from 'react';

const CARD_STYLE = {
  padding: '20px 24px',
  borderRadius: 14,
  border: '1px solid var(--ds-border-subtle)',
  background: 'var(--ds-bg-canvas)',
};

const TITLE_STYLE = {
  fontSize: 11,
  fontWeight: 500,
  color: 'var(--ds-text-muted)',
  letterSpacing: 0.5,
  textTransform: 'uppercase',
  marginBottom: 16,
};

const ROW_STYLE = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  padding: '6px 0',
};

const LABEL_STYLE = {
  fontSize: 14,
  color: 'var(--ds-text-secondary)',
};

const VALUE_STYLE = {
  fontSize: 20,
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
};

const DIVIDER_STYLE = {
  height: 1,
  background: 'var(--ds-border-subtle)',
  margin: '8px 0',
};

const TOTAL_LABEL_STYLE = {
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--ds-text-primary)',
};

const TOTAL_VALUE_STYLE = {
  fontSize: 24,
  fontWeight: 600,
  color: 'var(--ds-text-primary)',
  fontVariantNumeric: 'tabular-nums',
};

export default function SessionSuggestion({ suggestion }) {
  if (!suggestion || suggestion.error) return null;

  const { dueReview, recommendedNew, total, deckName } = suggestion;

  return (
    <div style={CARD_STYLE}>
      <div style={TITLE_STYLE}>Dein Plan für heute</div>

      <div style={ROW_STYLE}>
        <span style={LABEL_STYLE}>Pflege</span>
        <span style={{ ...VALUE_STYLE, color: 'var(--ds-accent)' }}>
          {dueReview}
        </span>
      </div>

      <div style={ROW_STYLE}>
        <span style={LABEL_STYLE}>Neue Karten</span>
        <span style={{ ...VALUE_STYLE, color: 'var(--ds-green)' }}>
          {recommendedNew}
        </span>
      </div>

      <div style={DIVIDER_STYLE} />

      <div style={ROW_STYLE}>
        <span style={TOTAL_LABEL_STYLE}>Gesamt</span>
        <span style={TOTAL_VALUE_STYLE}>{total}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build to verify**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/SessionSuggestion.jsx
git commit -m "feat(stats): add SessionSuggestion component"
```

---

### Task 7: StatistikView — Two-Level Layout Rewrite

Rewrite StatistikView to implement the two-level flow: Level 1 (treemap hero + secondary charts), Level 2 (per-deck trajectory + suggestion).

**Files:**
- Modify: `frontend/src/components/StatistikView.jsx`

- [ ] **Step 1: Rewrite StatistikView**

Replace the entire file content:

```javascript
import React, { useState, useMemo } from 'react';
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
        {/* Back button */}
        <button onClick={goBack} style={BACK_BUTTON_STYLE}>
          ← Übersicht
        </button>

        {/* Trajectory Chart */}
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

        {/* Session Suggestion */}
        <SessionSuggestion suggestion={suggestion} />
      </div>
    );
  }

  // ── Level 1: Wissenslandschaft ───────────────────────────────────────────
  return (
    <div style={PAGE_STYLE}>
      {/* Hero: Treemap */}
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

      {/* Secondary: YearHeatmap + TimeOfDay */}
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
```

- [ ] **Step 2: Build and verify**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build`

Expected: Build succeeds. Dev server shows: Level 1 with treemap as hero, YearHeatmap + TimeOfDay below. Clicking a deck cell opens Level 2 with trajectory chart and session suggestion.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/StatistikView.jsx
git commit -m "feat(stats): two-level StatistikView with treemap hero and deck focus"
```

---

### Task 8: KnowledgeHeatmap — Full-Width Hero Sizing

Update KnowledgeHeatmap's container constraints for its new hero role — it should take full width, not be capped at 680px.

**Files:**
- Modify: `frontend/src/components/KnowledgeHeatmap.jsx`

- [ ] **Step 1: Update container width**

In the outer wrapper div (line 226), change:

```javascript
    <div style={{ width: '100%', maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 6 }}>
```

to:

```javascript
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
```

Remove the `maxWidth: 680` constraint since the treemap is now the hero element and should fill the available width.

- [ ] **Step 2: Build and verify**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build`

Expected: Treemap fills the full width of the StatistikView container (up to 900px max from page style).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/KnowledgeHeatmap.jsx
git commit -m "feat(stats): full-width treemap hero, remove 680px cap"
```

---

### Task 9: Frontend Build & Integration Test

Final build, verify everything works together, clean up unused imports.

**Files:**
- Modify: `frontend/src/components/StatistikView.jsx` (if cleanup needed)

- [ ] **Step 1: Run frontend tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm test -- --watchAll=false 2>&1 | tail -20`

Expected: All existing tests pass. No new test failures.

- [ ] **Step 2: Run Python tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py 2>&1 | tail -10`

Expected: All tests pass.

- [ ] **Step 3: Production build**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build`

Expected: Clean build with no warnings about unused imports.

- [ ] **Step 4: Verify in dev server**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run dev`

Open `localhost:3000` and navigate to Statistik view. Verify:
1. Level 1: Treemap hero with mastery gradient colors, strongest first
2. Level 1: YearHeatmap + TimeOfDay below
3. Tap on deck cell → Level 2 with trajectory chart + session suggestion
4. Back button → returns to Level 1

- [ ] **Step 5: Commit if any cleanup was needed**

```bash
git add -A
git commit -m "chore(stats): final cleanup and integration verification"
```
