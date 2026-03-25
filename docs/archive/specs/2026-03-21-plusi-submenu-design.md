# Plusi Sub-Agent Menü — Design Spec

## Overview

The Plusi Sub-Agent Menu is a full-panel React view (replaces Agent Studio when navigated to) that serves as Plusi's configuration, personality dashboard, and diary. It introduces a **computed personality system** where Plusi's personality type is derived from his actual behavior — not chosen by the AI.

## Navigation

- Accessible via Agent Studio → "Sub-Agent-Menü" → chevron (already wired in `AgentStudio.jsx`)
- Renders as `activeView === 'plusiMenu'` in `App.jsx` (already exists, currently placeholder)
- Back button "← Agent Studio" returns to `activeView === 'agentStudio'`
- Toggle relationship: Agent Studio ↔ Plusi Menu (same level, not nested)

## Layout (top to bottom)

### 1. Back Navigation

Simple "← Agent Studio" link, same style as other back-navs in the app.

### 2. Plusi Header

Horizontal layout:
- **Left side:** Name "Plusi", mood indicator (green dot + mood text + current energy), friendship bar (Lv label + progress bar + points)
- **Right side:** Static Plusi character (52px SVG). Static means no animation — the animated Plusi lives only as the living mascot elsewhere. This one is smaller and still, clearly a "profile picture" not the living entity.

### 3. Personality Grid

A computed 2D personality visualization as a pure SVG (no canvas heatmap).

**Axes:**
- **Y-axis: Reflektiv ↔ Aktiv** — computed as the long-term average of Plusi's `energy` values across all stored interactions. High average = aktiv (top), low average = reflektiv (bottom).
- **X-axis: Sachorientiert ↔ Menschorientiert** — computed from `plusi_history` interaction patterns. Each Plusi interaction is classified by `history_type`: `'reflect'` and `'silent'` count as sachorientiert (Plusi acting autonomously on content), `'chat'` counts as menschorientiert (direct user interaction). The ratio `chat_count / total_count` gives the X position. This is a meaningful behavioral signal — a user who chats a lot with Plusi produces more `chat` entries, while a silent learner produces more `reflect`/`silent` entries from Plusi's autonomous activity.

**Four Quadrants:**
| | Sachorientiert (left) | Menschorientiert (right) |
|---|---|---|
| **Aktiv (top)** | **Forscher** — aktiv · sachlich (cyan #5AC8FA) | **Begleiter** — aktiv · persönlich (green #30D158) |
| **Reflektiv (bottom)** | **Denker** — still · sachlich (purple #BF5AF2) | **Vertrauter** — still · persönlich (amber #FF9F0A) |

**Visual style:**
- Dark background (#1C1C1E) with subtle radial gradients for each quadrant
- Mathematical grid lines (center cross + minor grid), tick marks on axes
- Axis labels: AKTIV (top), REFLEKTIV (bottom), SACH (left), MENSCH (right)
- Quadrant labels inside each quadrant (name + descriptor), muted opacity
- No numeric values displayed below the grid — the grid IS the display

**Current position:**
- White dot (r=5) with subtle glow and pulse animation
- Dashed crosshair lines at current position
- **Drift trail:** Series of smaller dots (r=2) with decreasing opacity showing historical positions, connected by a very subtle line

**Feedback loop:**
- On each `persist_internal_state()`, the computed personality position is saved as a `self` memory entry: `personality_tendency: "Forscher — sachorientiert, aktiv"` (or whichever quadrant)
- Plusi reads this in his next prompt injection via `build_memory_context()` → influences his self-image subtly
- This is emergent, not directive — Plusi "discovers" his own personality

### 4. Autonomie

Card with:
- **Token-Budget:** Label + value ("500 / h") + slider (gradient green→blue). Controls how many tokens Plusi can spend per hour on autonomous activity.
- **Fähigkeiten (Capabilities):** Toggle list:
  - "Selbst reflektieren" — Denkt eigenständig über dein Lernen nach (toggle, default ON)
  - "Karten erkunden" — Durchsucht deine Decks nach Verbindungen (toggle, default ON)
  - "Tagebuch schreiben" — Hält Gedanken und Entdeckungen fest (toggle, default ON)
  - "Event-Kommentare" — locked, grayed out, "🔒 Ab Lv 3 · Freunde" (toggle OFF, not interactive until friendship level 3)

### 5. Tagebuch (Diary Stream)

Scrollable stream of diary entries. No tabs, no separate memory view — the user sees Plusi's inner life through diary entries.

- **Day markers:** "Heute", "Gestern", dates
- **Entry format:** Left border (color-coded by category), metadata row (time · category emoji · category label | mood emoji), entry text with cipher blocks (██████ for encrypted parts), discovery tags (linked cards)
- **Category colors:** Reflektiert=#0A84FF, Forscht=#5AC8FA, Gemerkt=#30D158, default=#8E8E93
- **Cipher blocks:** `<span>` with monospace font, dark background, representing encrypted diary parts

## Backend Changes

### 1. Energy History Log

New storage mechanism for tracking energy over time:

```python
# In persist_internal_state(), after saving energy:
if 'energy' in internal:
    set_memory('state', 'energy', internal['energy'])
    _append_energy_log(internal['energy'])  # NEW

def _append_energy_log(energy_value):
    """Append energy value to rolling log for personality computation."""
    log = get_memory('personality', 'energy_log', default=[])
    log.append({'value': energy_value, 'ts': datetime.now().isoformat()})
    # Keep last 100 entries
    if len(log) > 100:
        log = log[-100:]
    set_memory('personality', 'energy_log', log)
```

### 2. Personality Position Computation

New function in `plusi/storage.py`:

```python
def compute_personality_position():
    """Compute Plusi's personality grid position from behavioral data.

    X-axis: ratio of 'chat' interactions vs total in plusi_history
    Y-axis: long-term average energy from energy_log

    Returns:
        dict: {
            'x': float (0-1, 0=sach, 1=mensch),
            'y': float (0-1, 0=reflektiv, 1=aktiv),
            'quadrant': str ('forscher'|'begleiter'|'denker'|'vertrauter'),
            'quadrant_label': str (e.g. 'Forscher — aktiv · sachlich'),
            'confident': bool (True if enough data points exist)
        }
    """
    db = _get_db()

    # X-axis: chat vs reflect/silent interaction ratio from plusi_history
    cursor = db.execute("""
        SELECT history_type, COUNT(*) FROM plusi_history
        GROUP BY history_type
    """)
    counts = dict(cursor.fetchall())
    chat_count = counts.get('chat', 0)
    reflect_count = counts.get('reflect', 0) + counts.get('silent', 0)
    total_interactions = chat_count + reflect_count
    x = chat_count / total_interactions if total_interactions > 0 else 0.5

    # Y-axis: average energy from rolling log
    energy_log = get_memory('personality', 'energy_log', default=[])
    if energy_log:
        avg_energy = sum(e['value'] for e in energy_log) / len(energy_log)
        y = (avg_energy - 1) / 9.0  # normalize 1-10 range to 0-1
    else:
        y = 0.5

    # Enough data to show confident position?
    confident = total_interactions >= 5 and len(energy_log) >= 5

    # Determine quadrant
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
        'quadrant': quadrant,
        'quadrant_label': label,
        'confident': confident
    }
```

### 3. Personality Trail Storage

On each `persist_internal_state()`, after computing position:

```python
def _save_personality_snapshot(position):
    """Save current personality position for drift trail visualization."""
    trail = get_memory('personality', 'trail', default=[])
    trail.append({
        'x': round(position['x'], 3),
        'y': round(position['y'], 3),
        'ts': datetime.now().isoformat()
    })
    # Keep last 20 snapshots
    if len(trail) > 20:
        trail = trail[-20:]
    set_memory('personality', 'trail', trail)
```

### 4. Self-Image Feedback Loop

After saving the personality snapshot, update Plusi's self-knowledge:

```python
set_memory('self', 'personality_tendency', position['quadrant_label'])
```

This gets injected into Plusi's prompt via the existing `build_memory_context()` → `WER DU BIST (selbst-geschrieben)` section. Plusi reads it and subtly orients toward it.

### 5. Autonomy Config

New config keys in `config.py` DEFAULT_CONFIG:

```python
"plusi_autonomy": {
    "token_budget_per_hour": 500,
    "can_reflect": True,
    "can_explore_cards": True,
    "can_write_diary": True,
    "can_comment_events": False,  # unlocked at friendship level 3
}
```

### 6. Bridge Communication (Message Queue Pattern)

Uses the async message queue, not synchronous `@pyqtSlot(result=str)`. Follow the same pattern as `AgentStudio.jsx` / `getEmbeddingStatus`.

**Message types (JS → Python via `widget.py` dispatch table):**

| JS message type | Handler in `widget.py` | Response event | Description |
|---|---|---|---|
| `getPlusiMenuData` | `_msg_get_plusi_menu_data()` | `ankiPlusiMenuDataLoaded` | All menu data on mount |
| `savePlusiAutonomy` | `_msg_save_plusi_autonomy(data)` | (none, fire-and-forget) | Save autonomy config |

**`ankiPlusiMenuDataLoaded` response schema:**

```json
{
  "personality": {
    "position": {"x": 0.6, "y": 0.7},
    "quadrant": "begleiter",
    "quadrant_label": "Begleiter — aktiv · persönlich",
    "confident": true,
    "trail": [{"x": 0.3, "y": 0.4, "ts": "2026-03-15T..."}, ...]
  },
  "state": {
    "energy": 7,
    "mood": "happy",
    "obsession": "Aminosäuren"
  },
  "friendship": {
    "level": 2,
    "levelName": "Bekannte",
    "points": 23,
    "maxPoints": 50
  },
  "diary": [
    {
      "id": 1,
      "timestamp": "2026-03-21T14:32:00",
      "entry_text": "Die Organchemie-Karten...",
      "cipher_text": ["verschlüsselter Teil"],
      "category": "reflektiert",
      "mood": "happy",
      "discoveries": ["Aminosäuren #234"]
    }
  ],
  "autonomy": {
    "token_budget_per_hour": 500,
    "can_reflect": true,
    "can_explore_cards": true,
    "can_write_diary": true,
    "can_comment_events": false
  }
}
```

**Frontend pattern (in PlusiMenu.jsx):**
```javascript
useEffect(() => {
  const handler = (e) => setMenuData(e.detail);
  window.addEventListener('ankiPlusiMenuDataLoaded', handler);
  window.ankiBridge?.addMessage('getPlusiMenuData', null);
  return () => window.removeEventListener('ankiPlusiMenuDataLoaded', handler);
}, []);
```

**`App.jsx` wiring change:**
Currently `<PlusiMenu />` has no props. Must be updated to:
```jsx
<PlusiMenu
  bridge={bridge}
  onNavigateBack={() => setActiveView('agentStudio')}
/>
```

## Frontend Components

### PlusiMenu.jsx (replace current placeholder)

Main view component. Sections:
1. Back nav → `onNavigateBack()` → `setActiveView('agentStudio')`
2. PlusiHeader (inline component or extracted)
3. PersonalityGrid (extracted component — SVG-based)
4. AutonomyCard (extracted component)
5. DiaryStream (extracted component)

Data loaded on mount via `getPlusiMenuData` bridge call.

### PersonalityGrid.jsx (new component)

Pure SVG rendering:
- Takes `{position: {x, y}, trail: [{x, y, ts}...], quadrant}` as props
- Renders the mathematical grid, quadrant labels, trail dots, current position dot with pulse
- No canvas, no heatmap — clean SVG with radial gradients

### AutonomyCard.jsx (new component)

- Token budget slider (controlled input, debounced save)
- Capability toggles
- Locked capabilities based on friendship level

### DiaryStream.jsx (new component)

- Takes diary entries array
- Groups by day
- Renders entries with cipher blocks, mood emojis, discovery tags
- Scrollable within the view

### 7. Config Merge

Add merge block in `load_config()` for the new nested dict:

```python
elif key == "plusi_autonomy" and isinstance(value, dict):
    for k, v in DEFAULT_CONFIG["plusi_autonomy"].items():
        if k not in config[key]:
            config[key][k] = v
```

## Design Tokens

All colors from `shared/styles/design-system.css`:
- Card backgrounds: `var(--ds-bg-canvas)` for content sections (personality grid, diary), `var(--ds-bg-frosted)` for action sections (autonomy card with sliders/toggles) — per "Frosted Glass for action, Borderless for content" rule
- Grid SVG background: `var(--ds-bg-canvas)` (not hardcoded hex)
- Text: standard design system tokens
- Quadrant colors: #5AC8FA (cyan), #30D158 (green), #BF5AF2 (purple), #FF9F0A (amber) — Apple HIG semantic colors, same in light/dark mode (used at low opacity on contrasting backgrounds)
- Accent: `var(--ds-accent)` / #0A84FF

## Empty / Loading States

- **Personality grid with < 5 data points:** Show dot at center (0.5, 0.5) with reduced opacity + label "Noch zu wenig Daten"
- **No diary entries:** Show placeholder text "Plusi hat noch keine Tagebucheinträge geschrieben."
- **Loading:** Sections render progressively as data arrives (same pattern as AgentStudio)

## What This Does NOT Change

- Plusi's system prompt — unchanged
- Plusi's JSON output format — unchanged (mood, energy, friendship_delta, internal, diary)
- Mood system — remains reactive, AI-chosen
- Friendship system — unchanged (4 levels, point-based)
- Diary storage schema — unchanged
- The animated living Plusi (MascotCharacter, MascotShell, dock) — unchanged
