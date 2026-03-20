# Plusi Sub-Agent Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Plusi Sub-Agent Menu view with computed personality grid, autonomy controls, and diary stream.

**Architecture:** Backend adds personality computation (energy log + history type ratios) to `plusi/storage.py`, config defaults for autonomy, and message handlers in `widget.py`. Frontend replaces the `PlusiMenu.jsx` placeholder with four sub-components (PersonalityGrid, AutonomyCard, DiaryStream) loaded via async message queue.

**Tech Stack:** Python 3 (SQLite, PyQt6), React 18, SVG, Tailwind/DaisyUI, design system CSS vars.

**Spec:** `docs/superpowers/specs/2026-03-21-plusi-submenu-design.md`

---

## File Structure

**Backend (Python):**
| File | Action | Responsibility |
|---|---|---|
| `plusi/storage.py` | Modify | Add `_append_energy_log()`, `compute_personality_position()`, `_save_personality_snapshot()`, update `persist_internal_state()` |
| `config.py` | Modify | Add `plusi_autonomy` to `DEFAULT_CONFIG`, add merge block in `load_config()` |
| `ui/widget.py` | Modify | Add `getPlusiMenuData` and `savePlusiAutonomy` to dispatch table + handler methods |

**Frontend (React):**
| File | Action | Responsibility |
|---|---|---|
| `frontend/src/components/PlusiMenu.jsx` | Rewrite | Main view: data loading, layout, back nav |
| `frontend/src/components/PersonalityGrid.jsx` | Create | Pure SVG grid with quadrants, trail, position dot |
| `frontend/src/components/AutonomyCard.jsx` | Create | Token budget slider + capability toggles |
| `frontend/src/components/DiaryStream.jsx` | Create | Day-grouped diary entries with cipher blocks |
| `frontend/src/App.jsx` | Modify | Wire props to `<PlusiMenu>` |

**Tests:**
| File | Action | Responsibility |
|---|---|---|
| `tests/test_plusi_personality.py` | Create | Test personality computation, energy log, trail storage |

---

### Task 1: Energy Log + Personality Computation (Backend)

**Files:**
- Modify: `plusi/storage.py:216-261` (persist_internal_state + new functions)
- Test: `tests/test_plusi_personality.py`

- [ ] **Step 1: Write failing tests for energy log and personality computation**

Create `tests/test_plusi_personality.py`:

```python
"""Tests for Plusi personality computation system."""
import os
import sys
import pytest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from plusi.storage import (
    _get_db, set_memory, get_memory, get_category,
    save_interaction, persist_internal_state,
)


@pytest.fixture(autouse=True)
def fresh_db(tmp_path):
    """Use a fresh temp DB for each test by pre-initializing _db."""
    import sqlite3
    import plusi.storage as mod
    mod._db = None
    db_path = str(tmp_path / 'test_plusi.db')
    db = sqlite3.connect(db_path, check_same_thread=False)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA foreign_keys=ON")
    mod._init_tables(db)
    mod._db = db
    mod._db_path = db_path
    yield db
    mod._db = None


class TestEnergyLog:
    def test_append_energy_log_stores_values(self):
        from plusi.storage import _append_energy_log
        _append_energy_log(7)
        _append_energy_log(5)
        log = get_memory('personality', 'energy_log', default=[])
        assert len(log) == 2
        assert log[0]['value'] == 7
        assert log[1]['value'] == 5
        assert 'ts' in log[0]

    def test_energy_log_rolling_limit(self):
        from plusi.storage import _append_energy_log
        for i in range(110):
            _append_energy_log(i % 10 + 1)
        log = get_memory('personality', 'energy_log', default=[])
        assert len(log) == 100

    def test_persist_internal_state_appends_energy(self):
        persist_internal_state({'energy': 8})
        log = get_memory('personality', 'energy_log', default=[])
        assert len(log) == 1
        assert log[0]['value'] == 8


class TestPersonalityPosition:
    def test_default_position_no_data(self):
        from plusi.storage import compute_personality_position
        pos = compute_personality_position()
        assert pos['x'] == 0.5
        assert pos['y'] == 0.5
        assert pos['confident'] is False

    def test_x_axis_all_chat(self):
        from plusi.storage import compute_personality_position
        for i in range(10):
            save_interaction(f"ctx{i}", f"resp{i}", history_type='chat')
        pos = compute_personality_position()
        assert pos['x'] == 1.0  # all chat = fully menschorientiert

    def test_x_axis_all_reflect(self):
        from plusi.storage import compute_personality_position
        for i in range(10):
            save_interaction(f"ctx{i}", f"resp{i}", history_type='reflect')
        pos = compute_personality_position()
        assert pos['x'] == 0.0  # all reflect = fully sachorientiert

    def test_x_axis_mixed(self):
        from plusi.storage import compute_personality_position
        for i in range(6):
            save_interaction(f"ctx{i}", f"resp{i}", history_type='chat')
        for i in range(4):
            save_interaction(f"ctx{i}", f"resp{i}", history_type='reflect')
        pos = compute_personality_position()
        assert pos['x'] == pytest.approx(0.6, abs=0.01)

    def test_y_axis_from_energy_log(self):
        from plusi.storage import _append_energy_log, compute_personality_position
        for _ in range(10):
            _append_energy_log(10)  # max energy
        pos = compute_personality_position()
        assert pos['y'] == pytest.approx(1.0, abs=0.01)

    def test_y_axis_low_energy(self):
        from plusi.storage import _append_energy_log, compute_personality_position
        for _ in range(10):
            _append_energy_log(1)  # min energy
        pos = compute_personality_position()
        assert pos['y'] == pytest.approx(0.0, abs=0.01)

    def test_quadrant_forscher(self):
        from plusi.storage import _append_energy_log, compute_personality_position
        for _ in range(10):
            _append_energy_log(8)
            save_interaction("c", "r", history_type='reflect')
        pos = compute_personality_position()
        assert pos['quadrant'] == 'forscher'

    def test_quadrant_begleiter(self):
        from plusi.storage import _append_energy_log, compute_personality_position
        for _ in range(10):
            _append_energy_log(8)
            save_interaction("c", "r", history_type='chat')
        pos = compute_personality_position()
        assert pos['quadrant'] == 'begleiter'

    def test_confident_flag(self):
        from plusi.storage import _append_energy_log, compute_personality_position
        # Not enough data
        for _ in range(3):
            _append_energy_log(5)
            save_interaction("c", "r", history_type='chat')
        assert compute_personality_position()['confident'] is False
        # Enough data
        for _ in range(5):
            _append_energy_log(5)
            save_interaction("c", "r", history_type='chat')
        assert compute_personality_position()['confident'] is True


class TestPersonalitySnapshot:
    def test_save_snapshot(self):
        from plusi.storage import _save_personality_snapshot
        _save_personality_snapshot({'x': 0.6, 'y': 0.7, 'quadrant': 'begleiter', 'quadrant_label': 'Begleiter'})
        trail = get_memory('personality', 'trail', default=[])
        assert len(trail) == 1
        assert trail[0]['x'] == 0.6
        assert trail[0]['y'] == 0.7

    def test_snapshot_rolling_limit(self):
        from plusi.storage import _save_personality_snapshot
        for i in range(25):
            _save_personality_snapshot({'x': i/25, 'y': 0.5, 'quadrant': 'test', 'quadrant_label': 'Test'})
        trail = get_memory('personality', 'trail', default=[])
        assert len(trail) == 20

    def test_persist_internal_state_triggers_personality(self):
        # Add enough history for meaningful computation
        for _ in range(5):
            save_interaction("c", "r", history_type='chat')
        persist_internal_state({'energy': 7})
        # Should have saved personality_tendency in self
        tendency = get_memory('self', 'personality_tendency')
        assert tendency is not None
        # Should have trail
        trail = get_memory('personality', 'trail', default=[])
        assert len(trail) == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -k plusi_personality -v`
Expected: ImportError or AttributeError (functions don't exist yet)

- [ ] **Step 3: Implement energy log, personality computation, and snapshot functions**

Add to `plusi/storage.py` after the `persist_internal_state()` function (after line 261):

```python
def _append_energy_log(energy_value):
    """Append energy value to rolling log for personality computation."""
    log = get_memory('personality', 'energy_log', default=[])
    log.append({'value': energy_value, 'ts': datetime.now().isoformat()})
    if len(log) > 100:
        log = log[-100:]
    set_memory('personality', 'energy_log', log)


def compute_personality_position():
    """Compute Plusi's personality grid position from behavioral data.

    X-axis: ratio of 'chat' interactions vs total in plusi_history
    Y-axis: long-term average energy from energy_log

    Returns dict with x, y (0-1), quadrant, quadrant_label, confident.
    """
    db = _get_db()

    cursor = db.execute("""
        SELECT history_type, COUNT(*) FROM plusi_history
        GROUP BY history_type
    """)
    counts = dict(cursor.fetchall())
    chat_count = counts.get('chat', 0)
    reflect_count = counts.get('reflect', 0) + counts.get('silent', 0)
    total_interactions = chat_count + reflect_count
    x = chat_count / total_interactions if total_interactions > 0 else 0.5

    energy_log = get_memory('personality', 'energy_log', default=[])
    if energy_log:
        avg_energy = sum(e['value'] for e in energy_log) / len(energy_log)
        y = (avg_energy - 1) / 9.0
    else:
        y = 0.5

    confident = total_interactions >= 5 and len(energy_log) >= 5

    if y >= 0.5 and x < 0.5:
        quadrant, label = 'forscher', 'Forscher — aktiv · sachlich'
    elif y >= 0.5 and x >= 0.5:
        quadrant, label = 'begleiter', 'Begleiter — aktiv · persönlich'
    elif y < 0.5 and x < 0.5:
        quadrant, label = 'denker', 'Denker — still · sachlich'
    else:
        quadrant, label = 'vertrauter', 'Vertrauter — still · persönlich'

    return {
        'x': x, 'y': y,
        'quadrant': quadrant, 'quadrant_label': label,
        'confident': confident
    }


def _save_personality_snapshot(position):
    """Save current personality position for drift trail visualization."""
    trail = get_memory('personality', 'trail', default=[])
    trail.append({
        'x': round(position['x'], 3),
        'y': round(position['y'], 3),
        'ts': datetime.now().isoformat()
    })
    if len(trail) > 20:
        trail = trail[-20:]
    set_memory('personality', 'trail', trail)
```

Then modify `persist_internal_state()` — add these lines at the end of the function (after the legacy support block, after line 261):

```python
    # Personality computation — append energy log, compute position, save snapshot
    if 'energy' in internal:
        _append_energy_log(internal['energy'])
    position = compute_personality_position()
    if position['confident']:
        _save_personality_snapshot(position)
        set_memory('self', 'personality_tendency', position['quadrant_label'])
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -k plusi_personality -v`
Expected: All tests PASS

- [ ] **Step 5: Run full test suite to check no regressions**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -v`
Expected: All existing tests still PASS

- [ ] **Step 6: Commit**

```bash
git add plusi/storage.py tests/test_plusi_personality.py
git commit -m "feat(plusi): add personality computation system

Energy log, personality position (2-axis: chat ratio × avg energy),
trail snapshots, and self-image feedback loop."
```

---

### Task 2: Autonomy Config (Backend)

**Files:**
- Modify: `config.py:18-42` (DEFAULT_CONFIG) and `config.py:96-108` (load_config merge)

- [ ] **Step 1: Add `plusi_autonomy` to DEFAULT_CONFIG**

In `config.py`, add after the `"firebase"` dict (around line 40), before `"mascot_enabled"`:

```python
    "plusi_autonomy": {
        "token_budget_per_hour": 500,
        "can_reflect": True,
        "can_explore_cards": True,
        "can_write_diary": True,
        "can_comment_events": False,
    },
```

- [ ] **Step 2: Add merge block in `load_config()`**

In `load_config()`, after the `firebase` merge block (around line 108), add:

```python
            elif key == "plusi_autonomy" and isinstance(value, dict):
                default_autonomy = DEFAULT_CONFIG["plusi_autonomy"]
                for k, v in default_autonomy.items():
                    if k not in config[key]:
                        config[key][k] = v
```

- [ ] **Step 3: Run config tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -k config -v`
Expected: All config tests PASS

- [ ] **Step 4: Commit**

```bash
git add config.py
git commit -m "feat(config): add plusi_autonomy defaults and merge logic"
```

---

### Task 3: Bridge Message Handlers (Backend)

**Files:**
- Modify: `ui/widget.py:391-460` (dispatch table) and add handler methods

- [ ] **Step 1: Add message types to dispatch table**

In `_get_message_handler()` (around line 440, in the config/settings section), add:

```python
            'getPlusiMenuData': self._msg_get_plusi_menu_data,
            'savePlusiAutonomy': self._msg_save_plusi_autonomy,
```

- [ ] **Step 2: Implement `_msg_get_plusi_menu_data()` handler**

Add after the `_msg_get_embedding_status()` method (around line 789):

```python
    def _msg_get_plusi_menu_data(self, data=None):
        """Return all data needed for the Plusi Menu view."""
        try:
            try:
                from ..plusi.storage import (
                    compute_personality_position, get_memory,
                    get_friendship_data, load_diary, get_category,
                    load_history
                )
                from ..config import get_config
            except ImportError:
                from plusi.storage import (
                    compute_personality_position, get_memory,
                    get_friendship_data, load_diary, get_category,
                    load_history
                )
                from config import get_config

            # Personality
            position = compute_personality_position()
            trail = get_memory('personality', 'trail', default=[])

            # Current state — read mood from most recent history entry
            state_data = get_category('state')
            last_mood = 'neutral'
            recent = load_history(limit=1)
            if recent:
                # load_history returns [{"role":"user","content":...}, {"role":"assistant","content":...}]
                # mood is stored in plusi_history table, query directly
                pass
            # Fallback: read mood from last diary entry or default
            try:
                diary_entries = load_diary(limit=1)
                if diary_entries:
                    last_mood = diary_entries[0].get('mood', 'neutral')
            except Exception:
                pass

            state = {
                'energy': state_data.get('energy', 5),
                'mood': last_mood,
                'obsession': state_data.get('obsession', None),
            }

            # Friendship
            friendship = get_friendship_data()

            # Diary
            diary = load_diary(limit=50)

            # Autonomy config
            config = get_config()
            autonomy = config.get('plusi_autonomy', {})

            result = {
                'personality': {
                    'position': {'x': position['x'], 'y': position['y']},
                    'quadrant': position['quadrant'],
                    'quadrant_label': position['quadrant_label'],
                    'confident': position['confident'],
                    'trail': trail,
                },
                'state': state,
                'friendship': friendship,
                'diary': diary,
                'autonomy': autonomy,
            }

            self._send_to_frontend_with_event(
                'plusiMenuData', result, 'ankiPlusiMenuDataLoaded'
            )
        except Exception:
            logger.exception("Failed to load Plusi menu data")
            self._send_to_frontend_with_event(
                'plusiMenuData', {}, 'ankiPlusiMenuDataLoaded'
            )

    def _msg_save_plusi_autonomy(self, data):
        """Save Plusi autonomy config (token budget, capabilities)."""
        try:
            try:
                from ..config import update_config
            except ImportError:
                from config import update_config
            if isinstance(data, dict):
                update_config(plusi_autonomy=data)
        except Exception:
            logger.exception("Failed to save Plusi autonomy config")
```

- [ ] **Step 3: Verify the import and method exist by checking syntax**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -c "import ast; ast.parse(open('ui/widget.py').read()); print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add ui/widget.py
git commit -m "feat(bridge): add getPlusiMenuData and savePlusiAutonomy handlers"
```

---

### Task 4: PersonalityGrid Component (Frontend)

**Files:**
- Create: `frontend/src/components/PersonalityGrid.jsx`

- [ ] **Step 1: Create the PersonalityGrid SVG component**

Create `frontend/src/components/PersonalityGrid.jsx`:

```jsx
import React from 'react';

const QUADRANTS = [
  { key: 'forscher', name: 'Forscher', desc: 'aktiv · sachlich', color: '#5AC8FA', x: 0.25, y: 0.25 },
  { key: 'begleiter', name: 'Begleiter', desc: 'aktiv · persönlich', color: '#30D158', x: 0.75, y: 0.25 },
  { key: 'denker', name: 'Denker', desc: 'still · sachlich', color: '#BF5AF2', x: 0.25, y: 0.75 },
  { key: 'vertrauter', name: 'Vertrauter', desc: 'still · persönlich', color: '#FF9F0A', x: 0.75, y: 0.75 },
];

export default function PersonalityGrid({ position, trail = [], quadrant, confident }) {
  // Map 0-1 position to SVG coordinates (12-288 range within 300x300 viewBox)
  const pad = 12;
  const range = 300 - 2 * pad;
  const dotX = pad + (position?.x ?? 0.5) * range;
  const dotY = pad + (1 - (position?.y ?? 0.5)) * range; // invert Y (high energy = top)

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        fontSize: 11, color: 'var(--ds-text-tertiary)', textTransform: 'uppercase',
        letterSpacing: 1, fontWeight: 500, marginBottom: 12,
      }}>
        Persönlichkeit
      </div>
      <div style={{
        background: 'var(--ds-bg-canvas)',
        borderRadius: 16, padding: 20,
        border: '1px solid var(--ds-border, rgba(255,255,255,0.06))',
      }}>
        <svg viewBox="0 0 300 300" style={{ width: '100%', height: 'auto' }}>
          <defs>
            {QUADRANTS.map(q => (
              <radialGradient key={q.key} id={`g-${q.key}`} cx={`${q.x * 100}%`} cy={`${q.y * 100}%`} r="45%">
                <stop offset="0%" stopColor={q.color} stopOpacity="0.12" />
                <stop offset="100%" stopColor={q.color} stopOpacity="0" />
              </radialGradient>
            ))}
          </defs>

          {/* Background */}
          <rect width="300" height="300" rx="8" fill="var(--ds-bg-canvas, #1C1C1E)" />

          {/* Quadrant glows */}
          {QUADRANTS.map(q => (
            <rect key={q.key} width="300" height="300" rx="8" fill={`url(#g-${q.key})`} />
          ))}

          {/* Grid lines */}
          <rect x={pad} y={pad} width={range} height={range} rx="4" fill="none"
            stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
          <line x1="150" y1={pad} x2="150" y2={pad + range}
            stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
          <line x1={pad} y1="150" x2={pad + range} y2="150"
            stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />

          {/* Minor grid */}
          {[81, 219].map(v => (
            <React.Fragment key={v}>
              <line x1={v} y1={pad} x2={v} y2={pad + range}
                stroke="rgba(255,255,255,0.025)" strokeWidth="0.5" />
              <line x1={pad} y1={v} x2={pad + range} y2={v}
                stroke="rgba(255,255,255,0.025)" strokeWidth="0.5" />
            </React.Fragment>
          ))}

          {/* Tick marks */}
          {[81, 219].map(v => (
            <React.Fragment key={`t${v}`}>
              <line x1={v} y1="148" x2={v} y2="152" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
              <line x1="148" y1={v} x2="152" y2={v} stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
            </React.Fragment>
          ))}

          {/* Quadrant labels */}
          {QUADRANTS.map(q => (
            <React.Fragment key={`l-${q.key}`}>
              <text x={q.x * 300} y={q.y * 300 - 6} textAnchor="middle"
                fontSize="11" fontWeight="600" fill={q.color} opacity="0.6"
                fontFamily="-apple-system, system-ui">{q.name}</text>
              <text x={q.x * 300} y={q.y * 300 + 8} textAnchor="middle"
                fontSize="8" fill={q.color} opacity="0.3"
                fontFamily="-apple-system, system-ui">{q.desc}</text>
            </React.Fragment>
          ))}

          {/* Axis labels */}
          <text x="150" y="8" textAnchor="middle" fontSize="8" fill="var(--ds-text-quaternary, #636366)"
            letterSpacing="1" fontFamily="-apple-system, system-ui">AKTIV</text>
          <text x="150" y="298" textAnchor="middle" fontSize="8" fill="var(--ds-text-quaternary, #48484A)"
            letterSpacing="1" fontFamily="-apple-system, system-ui">REFLEKTIV</text>
          <text x="8" y="150" textAnchor="middle" fontSize="8" fill="var(--ds-text-quaternary, #48484A)"
            letterSpacing="1" fontFamily="-apple-system, system-ui"
            transform="rotate(-90, 8, 150)">SACH</text>
          <text x="296" y="150" textAnchor="middle" fontSize="8" fill="var(--ds-text-quaternary, #48484A)"
            letterSpacing="1" fontFamily="-apple-system, system-ui"
            transform="rotate(90, 296, 150)">MENSCH</text>

          {/* Drift trail */}
          {trail.length > 1 && (
            <polyline
              points={trail.map(t => {
                const tx = pad + t.x * range;
                const ty = pad + (1 - t.y) * range;
                return `${tx},${ty}`;
              }).join(' ')}
              fill="none" stroke="#0A84FF" strokeWidth="0.8" opacity="0.12"
              strokeLinecap="round" strokeLinejoin="round"
            />
          )}
          {trail.map((t, i) => {
            const tx = pad + t.x * range;
            const ty = pad + (1 - t.y) * range;
            const opacity = 0.08 + (i / Math.max(trail.length - 1, 1)) * 0.32;
            return (
              <circle key={i} cx={tx} cy={ty} r="2" fill="#0A84FF" opacity={opacity} />
            );
          })}

          {/* Crosshairs at current position */}
          <line x1={pad} y1={dotY} x2={pad + range} y2={dotY}
            stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" strokeDasharray="2,4" />
          <line x1={dotX} y1={pad} x2={dotX} y2={pad + range}
            stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" strokeDasharray="2,4" />

          {/* Current position glow */}
          <circle cx={dotX} cy={dotY} r="20" fill="rgba(255,255,255,0.05)" />

          {/* Pulse ring */}
          <circle cx={dotX} cy={dotY} r="8" fill="none"
            stroke="rgba(255,255,255,0.12)" strokeWidth="0.5">
            <animate attributeName="r" values="8;20" dur="2.5s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.15;0" dur="2.5s" repeatCount="indefinite" />
          </circle>

          {/* Current position dot */}
          <circle cx={dotX} cy={dotY} r={5}
            fill="#fff" opacity={confident ? 0.95 : 0.35} />

          {/* Low confidence label */}
          {!confident && (
            <text x="150" y="155" textAnchor="middle" fontSize="9"
              fill="var(--ds-text-quaternary, #636366)"
              fontFamily="-apple-system, system-ui">
              Noch zu wenig Daten
            </text>
          )}
        </svg>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify no syntax errors**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npx -y acorn --ecma2020 --module src/components/PersonalityGrid.jsx 2>&1 | tail -3 || echo "Check with build instead"`
If acorn not available, skip — will be verified during build.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/PersonalityGrid.jsx
git commit -m "feat(plusi): add PersonalityGrid SVG component"
```

---

### Task 5: AutonomyCard Component (Frontend)

**Files:**
- Create: `frontend/src/components/AutonomyCard.jsx`

- [ ] **Step 1: Create the AutonomyCard component**

Create `frontend/src/components/AutonomyCard.jsx`:

```jsx
import React, { useState, useCallback, useRef } from 'react';

const CAPABILITIES = [
  { key: 'can_reflect', label: 'Selbst reflektieren', desc: 'Denkt eigenständig über dein Lernen nach' },
  { key: 'can_explore_cards', label: 'Karten erkunden', desc: 'Durchsucht deine Decks nach Verbindungen' },
  { key: 'can_write_diary', label: 'Tagebuch schreiben', desc: 'Hält Gedanken und Entdeckungen fest' },
  { key: 'can_comment_events', label: 'Event-Kommentare', desc: null, lockedUntilLevel: 3 },
];

export default function AutonomyCard({ autonomy, friendshipLevel, onSave }) {
  const [config, setConfig] = useState(autonomy || {});
  const saveTimer = useRef(null);

  const debouncedSave = useCallback((updated) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => onSave?.(updated), 500);
  }, [onSave]);

  const updateConfig = useCallback((key, value) => {
    setConfig(prev => {
      const updated = { ...prev, [key]: value };
      debouncedSave(updated);
      return updated;
    });
  }, [debouncedSave]);

  const budget = config.token_budget_per_hour ?? 500;

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        fontSize: 11, color: 'var(--ds-text-tertiary)', textTransform: 'uppercase',
        letterSpacing: 1, fontWeight: 500, marginBottom: 12,
      }}>
        Autonomie
      </div>
      <div style={{
        background: 'var(--ds-bg-frosted)',
        borderRadius: 16, padding: 20,
        backdropFilter: 'blur(20px)',
        border: '1px solid var(--ds-border, rgba(255,255,255,0.06))',
      }}>
        {/* Token Budget */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>Token-Budget</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ds-accent)' }}>{budget} / h</span>
        </div>
        <input
          type="range" min="100" max="2000" step="100" value={budget}
          onChange={e => updateConfig('token_budget_per_hour', Number(e.target.value))}
          style={{
            width: '100%', height: 6, marginBottom: 22,
            appearance: 'none', background: 'var(--ds-bg-overlay, #3A3A3C)',
            borderRadius: 4, outline: 'none',
          }}
        />

        {/* Capabilities */}
        <div style={{
          fontSize: 11, color: 'var(--ds-text-tertiary)', textTransform: 'uppercase',
          letterSpacing: 1, fontWeight: 500, marginBottom: 4,
        }}>
          Fähigkeiten
        </div>

        {CAPABILITIES.map(cap => {
          const locked = cap.lockedUntilLevel && friendshipLevel < cap.lockedUntilLevel;
          const isOn = !locked && (config[cap.key] ?? false);

          return (
            <div key={cap.key} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 0',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              opacity: locked ? 0.4 : 1,
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 450 }}>{cap.label}</div>
                <div style={{ fontSize: 11, color: 'var(--ds-text-tertiary)', marginTop: 1 }}>
                  {locked ? `🔒 Ab Lv ${cap.lockedUntilLevel} · Freunde` : cap.desc}
                </div>
              </div>
              <button
                disabled={locked}
                onClick={() => updateConfig(cap.key, !isOn)}
                style={{
                  width: 42, height: 26, borderRadius: 13, position: 'relative',
                  cursor: locked ? 'default' : 'pointer', border: 'none',
                  background: isOn ? '#30D158' : 'var(--ds-bg-overlay, #3A3A3C)',
                  transition: 'background 0.2s', marginLeft: 12, flexShrink: 0,
                }}
              >
                <div style={{
                  width: 22, height: 22, background: locked ? 'var(--ds-text-quaternary, #636366)' : '#fff',
                  borderRadius: '50%', position: 'absolute', top: 2,
                  ...(isOn ? { right: 2 } : { left: 2 }),
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  transition: 'left 0.2s, right 0.2s',
                }} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/AutonomyCard.jsx
git commit -m "feat(plusi): add AutonomyCard component with token budget slider"
```

---

### Task 6: DiaryStream Component (Frontend)

**Files:**
- Create: `frontend/src/components/DiaryStream.jsx`

- [ ] **Step 1: Create the DiaryStream component**

Create `frontend/src/components/DiaryStream.jsx`:

```jsx
import React from 'react';

const CATEGORY_COLORS = {
  reflektiert: '#0A84FF',
  forscht: '#5AC8FA',
  gemerkt: '#30D158',
};

const CATEGORY_EMOJI = {
  reflektiert: '💭',
  forscht: '🔍',
  gemerkt: '✍️',
};

function formatTime(ts) {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function getDayLabel(ts) {
  try {
    const d = new Date(ts);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const entry = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = (today - entry) / (1000 * 60 * 60 * 24);
    if (diff < 1) return 'Heute';
    if (diff < 2) return 'Gestern';
    return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

function renderTextWithCipher(text, cipherParts) {
  if (!cipherParts?.length || !text.includes('{{CIPHER}}')) {
    return text;
  }
  const parts = text.split('{{CIPHER}}');
  return parts.map((part, i) => (
    <React.Fragment key={i}>
      {part}
      {i < cipherParts.length && (
        <span style={{
          background: 'var(--ds-bg-overlay, #3A3A3C)',
          color: 'var(--ds-text-quaternary, #48484A)',
          borderRadius: 3, padding: '1px 5px',
          fontFamily: "'SF Mono', monospace",
          fontSize: 10, letterSpacing: 1,
        }}>
          {'█'.repeat(Math.min(cipherParts[i].length, 20))}
        </span>
      )}
    </React.Fragment>
  ));
}

export default function DiaryStream({ entries = [] }) {
  if (!entries.length) {
    return (
      <div style={{ marginBottom: 24 }}>
        <div style={{
          fontSize: 11, color: 'var(--ds-text-tertiary)', textTransform: 'uppercase',
          letterSpacing: 1, fontWeight: 500, marginBottom: 12,
        }}>
          Tagebuch
        </div>
        <div style={{
          background: 'var(--ds-bg-canvas)',
          borderRadius: 16, padding: 20,
          border: '1px solid var(--ds-border, rgba(255,255,255,0.06))',
        }}>
          <div style={{ fontSize: 13, color: 'var(--ds-text-tertiary)', textAlign: 'center', padding: '20px 0' }}>
            Plusi hat noch keine Tagebucheinträge geschrieben.
          </div>
        </div>
      </div>
    );
  }

  // Group entries by day
  const groups = [];
  let currentDay = null;
  for (const entry of entries) {
    const day = getDayLabel(entry.timestamp);
    if (day !== currentDay) {
      groups.push({ day, entries: [] });
      currentDay = day;
    }
    groups[groups.length - 1].entries.push(entry);
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        fontSize: 11, color: 'var(--ds-text-tertiary)', textTransform: 'uppercase',
        letterSpacing: 1, fontWeight: 500, marginBottom: 12,
      }}>
        Tagebuch
      </div>
      <div style={{
        background: 'var(--ds-bg-canvas)',
        borderRadius: 16, padding: 20,
        border: '1px solid var(--ds-border, rgba(255,255,255,0.06))',
      }}>
        {groups.map((group, gi) => (
          <div key={gi}>
            <div style={{
              fontSize: 11, color: 'var(--ds-text-quaternary, #636366)', fontWeight: 500,
              marginBottom: 12,
              ...(gi > 0 ? { marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.04)' } : {}),
            }}>
              {group.day}
            </div>
            {group.entries.map((entry, ei) => {
              const cat = entry.category || 'gemerkt';
              const borderColor = CATEGORY_COLORS[cat] || 'var(--ds-text-quaternary, #8E8E93)';
              return (
                <div key={entry.id || ei} style={{
                  paddingLeft: 12, borderLeft: `2px solid ${borderColor}`,
                  marginBottom: ei < group.entries.length - 1 ? 16 : 0,
                }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginBottom: 4,
                  }}>
                    <span style={{ fontSize: 11, color: 'var(--ds-text-secondary, #8E8E93)' }}>
                      {formatTime(entry.timestamp)} · {CATEGORY_EMOJI[cat] || '📝'} {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </span>
                    <span style={{ fontSize: 12 }}>{entry.mood === 'happy' ? '😊' : entry.mood === 'thinking' ? '🧠' : entry.mood === 'curious' ? '🤔' : entry.mood === 'empathy' ? '🫂' : entry.mood === 'excited' ? '🤩' : entry.mood === 'sleepy' ? '😴' : entry.mood === 'annoyed' ? '😤' : entry.mood === 'blush' ? '😳' : entry.mood === 'surprised' ? '😮' : '😐'}</span>
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--ds-text-primary, #E5E5EA)' }}>
                    {renderTextWithCipher(entry.entry_text, entry.cipher_parts)}
                  </div>
                  {entry.discoveries?.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      {entry.discoveries.map((d, di) => (
                        <span key={di} style={{
                          background: 'rgba(10,132,255,0.08)', color: 'var(--ds-accent)',
                          fontSize: 10, padding: '3px 8px', borderRadius: 6, fontWeight: 450,
                        }}>
                          📎 {d}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/DiaryStream.jsx
git commit -m "feat(plusi): add DiaryStream component with cipher blocks and day groups"
```

---

### Task 7: PlusiMenu Main View + App.jsx Wiring (Frontend)

**Files:**
- Rewrite: `frontend/src/components/PlusiMenu.jsx`
- Modify: `frontend/src/App.jsx` (~line where `<PlusiMenu />` is rendered)

- [ ] **Step 1: Rewrite PlusiMenu.jsx**

Replace contents of `frontend/src/components/PlusiMenu.jsx`:

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import PersonalityGrid from './PersonalityGrid';
import AutonomyCard from './AutonomyCard';
import DiaryStream from './DiaryStream';

export default function PlusiMenu({ bridge, onNavigateBack }) {
  const [data, setData] = useState(null);

  // Load data on mount via async message queue
  useEffect(() => {
    const handler = (e) => {
      const d = e.detail?.data || e.detail;
      if (d) setData(d);
    };
    window.addEventListener('ankiPlusiMenuDataLoaded', handler);
    window.ankiBridge?.addMessage('getPlusiMenuData', null);
    return () => window.removeEventListener('ankiPlusiMenuDataLoaded', handler);
  }, []);

  const handleSaveAutonomy = useCallback((config) => {
    window.ankiBridge?.addMessage('savePlusiAutonomy', config);
  }, []);

  const personality = data?.personality;
  const state = data?.state;
  const friendship = data?.friendship;

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      padding: '0 20px 140px', overflowY: 'auto',
    }}>

      {/* Back Navigation */}
      <div
        onClick={onNavigateBack}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '20px 0', cursor: 'pointer',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
          stroke="var(--ds-accent, #0A84FF)" strokeWidth="2" strokeLinecap="round">
          <path d="M10 3L5 8L10 13" />
        </svg>
        <span style={{ fontSize: 14, color: 'var(--ds-text-secondary)' }}>Agent Studio</span>
      </div>

      {/* Plusi Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: -0.4, marginBottom: 4 }}>
            Plusi
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ds-text-secondary)' }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: state?.mood === 'happy' ? '#30D158' : state?.mood === 'annoyed' ? '#FF453A' : '#8E8E93',
            }} />
            <span>{state?.mood || 'neutral'} · Energie {state?.energy ?? '?'}</span>
          </div>
          {friendship && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <span style={{ fontSize: 10, color: 'var(--ds-text-quaternary)', whiteSpace: 'nowrap' }}>
                Lv {friendship.level} · {friendship.levelName}
              </span>
              <div style={{
                flex: 1, height: 3, background: 'var(--ds-bg-overlay, #3A3A3C)', borderRadius: 2,
              }}>
                <div style={{
                  height: '100%', borderRadius: 2,
                  background: 'linear-gradient(90deg, #0A84FF, #5AC8FA)',
                  width: `${Math.min(100, (friendship.points / friendship.maxPoints) * 100)}%`,
                }} />
              </div>
              <span style={{ fontSize: 10, color: 'var(--ds-text-quaternary)', whiteSpace: 'nowrap' }}>
                {friendship.points}/{friendship.maxPoints}
              </span>
            </div>
          )}
        </div>

        {/* Static Plusi (smaller, no animation) */}
        <svg width="52" height="52" viewBox="0 0 52 52">
          <rect x="19" y="5" width="14" height="42" rx="7" fill="var(--ds-accent, #0A84FF)" />
          <rect x="5" y="19" width="42" height="14" rx="7" fill="var(--ds-accent, #0A84FF)" />
          <circle cx="21" cy="23.5" r="2.2" fill="#fff" />
          <circle cx="31" cy="23.5" r="2.2" fill="#fff" />
          <circle cx="21.6" cy="23.5" r="1.1" fill="var(--ds-bg-deep, #1C1C1E)" />
          <circle cx="31.6" cy="23.5" r="1.1" fill="var(--ds-bg-deep, #1C1C1E)" />
          <path d="M22.5 29 Q26 32.5 29.5 29" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
      </div>

      {/* Personality Grid */}
      <PersonalityGrid
        position={personality?.position}
        trail={personality?.trail || []}
        quadrant={personality?.quadrant}
        confident={personality?.confident ?? false}
      />

      {/* Autonomy Controls */}
      <AutonomyCard
        autonomy={data?.autonomy}
        friendshipLevel={friendship?.level ?? 1}
        onSave={handleSaveAutonomy}
      />

      {/* Diary Stream */}
      <DiaryStream entries={data?.diary || []} />
    </div>
  );
}
```

- [ ] **Step 2: Wire props in App.jsx**

Find the line where `<PlusiMenu />` is rendered (search for `plusiMenu` in the activeView conditional). Change from:

```jsx
<PlusiMenu />
```

to:

```jsx
<PlusiMenu
  bridge={bridge}
  onNavigateBack={() => setActiveView('agentStudio')}
/>
```

- [ ] **Step 3: Build frontend and verify no errors**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build 2>&1 | tail -10`
Expected: Build succeeds with no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/PlusiMenu.jsx frontend/src/App.jsx
git commit -m "feat(plusi): implement PlusiMenu view with all sections wired

Replaces placeholder with full view: header, personality grid,
autonomy controls, diary stream. Wired in App.jsx with bridge + nav."
```

---

### Task 8: Build + Smoke Test

- [ ] **Step 1: Run full Python test suite**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -v`
Expected: All tests PASS

- [ ] **Step 2: Build frontend for production**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build`
Expected: Build completes successfully, files in `web/`

- [ ] **Step 3: Commit built files**

```bash
git add web/
git commit -m "build: production frontend with Plusi Menu"
```
