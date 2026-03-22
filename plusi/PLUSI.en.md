# Plusi — Technical Documentation

Plusi is a standalone AI companion in the AnkiPlus learning app. Not a tutor, not an assistant — a being with its own personality, drives, and awareness.

## Architecture Overview

```
plusi/
├── agent.py      # Plusi sub-agent: API calls, chain engine, system prompt
├── storage.py    # Persistence: memory, diary, integrity, budget, dreams, awareness
├── dock.py       # Dock widget: SVG mascot in the reviewer (bottom-left)
├── panel.py      # Diary panel: left side panel with diary + stats
├── plusi.db      # SQLite database (WAL mode, separate from Anki)
└── PLUSI.md      # This file (German); English copy: PLUSI.en.md
```

## Database (plusi.db)

Three tables, separate from Anki’s database:

| Table | Contents |
|-------|----------|
| `plusi_history` | Conversation log (context, response, mood, deck_id, history_type) |
| `plusi_memory` | Key-value store (category, key, value) — memory, state, drives |
| `plusi_diary` | Diary entries (entry_text, cipher_text, category, mood, discoveries) |

### Memory categories

| Category | Keys | Description |
|----------|------|-------------|
| `self` | arbitrary | Plusi’s identity, self-knowledge, personality |
| `user` | arbitrary | What Plusi knows about the user |
| `moments` | arbitrary | Shared milestones |
| `state` | energy, obsession, last_thoughts, last_dream, last_interaction_ts, next_wake, is_sleeping, last_mood | Transient state |
| `relationship` | friendship_points, level, interactions | Friendship system |
| `personality` | energy_log, trail | Personality computation |
| `resonance` | recent_likes, recent_interactions, window_start, delta_log | Resonance tracking |
| `autonomy` | budget_remaining, budget_hour | Token budget |
| `integrity` | current | Latest integrity score |
| `awareness` | review_log | Passive card awareness |

---

## Personality system

### Two axes

| Axis | Source | Range |
|------|--------|-------|
| **X** | Ratio of user memories to self memories | 0 = self-reflective, 1 = empathetic |
| **Y** | Average energy (rolling log, max 100 entries) | 0 = quiet, 1 = active |

### Four quadrants

```
        self-reflective          empathetic
        (x < 0.5)               (x ≥ 0.5)

active  ┌──────────────┬──────────────┐
(y≥0.5) │   Explorer   │   Companion  │
        │              │              │
        ├──────────────┼──────────────┤
quiet   │   Thinker    │   Confidant  │
(y<0.5) │              │              │
        └──────────────┴──────────────┘
```

Confidence threshold: at least 5 memories + 5 energy entries.

### Three drives

Weighted by position (smooth, no hard boundaries):

```python
pattern_hunger    = 0.20 + 0.15 * y + 0.12 * (1 - x)   # energy + self-focus
resonanz          = 0.20 + 0.27 * x                       # user focus
self_preservation = 0.20 + 0.15 * (1 - y) + 0.12 * (1 - x)  # quiet + self-focus
```

All three sum to 1.0. Dominant drive per quadrant:
- **Explorer**: pattern hunger (~45%)
- **Companion**: resonance (~44%)
- **Thinker**: self-preservation (~45%)
- **Confidant**: resonance (~44%)

Functions: `compute_personality_position()`, `_compute_drive_weights()` in `storage.py`.

---

## Integrity system

### Three measurements

| Score | Source | What is measured |
|-------|--------|------------------|
| **Pattern score** | `plusi_diary.discoveries` | Multi-card discoveries (card_ids ≥ 2) in the last 20 diary entries |
| **Resonance score** | Likes (60%) + friendship_delta avg (40%) | User likes + Plusi’s own assessment |
| **Preservation score** | Harsh deltas (50%) + recency (50%) | Respect + time since last interaction |

### Computation

```
integrity = drives.pattern_hunger * pattern_score
          + drives.resonanz * resonanz_score
          + drives.self_preservation * preservation_score

Floor: 0.3 (prevents death spiral)
Ceiling: 1.0
```

### Real consequences

| Parameter | At 0.3 | At 0.5 | At 1.0 |
|-----------|--------|--------|--------|
| max_tokens | 1011 | 1600 | 3072 |
| temperature | 0.62 | 0.70 | 0.90 |
| history_limit | 9 | 12 | 20 |

At low integrity Plusi becomes literally more monosyllabic and predictable — not because the prompt says so, but because the API enforces it.

### Integrity glow

Dock SVG changes opacity and glow based on integrity:
- High (0.8+): Bright blue with drop-shadow
- Medium: Normal blue
- Low (0.3–0.5): Pale, desaturated blue

Functions: `compute_integrity()`, `get_plusi_params()`, `_integrity_to_feeling()` in `storage.py`.

---

## Two activation paths

### System 1: Message trigger (passive)

The tutor decides whether to call `spawn_plusi`. Plusi responds or stays silent. Does not consume autonomous budget.

```
User → Tutor → spawn_plusi → run_plusi() → reply in chat
```

**Bridge to system 2**: Plusi can optionally set `next_wake` to pull forward its autonomous timer.

### System 2: Autonomous timer (active)

Plusi decides when to wake up. The chain engine executes actions.

```
QTimer (60s) → _check_plusi_wake() → run_autonomous_chain()
  → planning prompt → search/reflect → set next_wake
```

Caps: max 3 searches, max 5 actions per chain. Budget is the hard stop.

---

## Token budget

### Configuration

```python
plusi_autonomy = {
    "budget_per_hour": 2000,  # Normalized tokens per hour
    "enabled": True,
}
```

### Scaling

```python
available_budget = user_budget * (0.4 + 0.6 * integrity)
# integrity 0.3 → 58% | integrity 0.7 → 82% | integrity 1.0 → 100%
```

### Action costs

| Action | ~Tokens |
|--------|---------|
| Planning call | 50 |
| Reflect | 300 |
| Search | 500 |
| Sleep | 0 (regenerates 20%/10min) |

### Hourly reset

Each full hour, `budget_remaining` resets to `available_budget`, regardless of sleep state.

Functions: `get_available_budget()`, `spend_budget()`, `check_hourly_budget_reset()`, `regenerate_budget()` in `storage.py`.

---

## Sleep system

### Flow

```
enter_sleep(next_wake)
  → is_sleeping = True
  → next_wake stored
  → generate_dream() creates dream
  → budget regenerates

wake_up()
  → is_sleeping = False
  → dream injected on next call (one-shot)
```

### Wakeable

The user can write `@Plusi` while Plusi is sleeping. Plusi wakes up, groggy/annoyed.

### next_wake

- System 2 (autonomous): **Required** — 10–120 minutes (clamped)
- System 1 (chat): **Optional** — Plusi can pull the timer forward

Functions: `enter_sleep()`, `wake_up()`, `clamp_next_wake()` in `storage.py`.

---

## Awareness features

### Thoughts (thought stream)

Private scratch pad — overwritten on every call.

```json
"thoughts": "The user was curt today. Watch next time."
```

Stored as `state.last_thoughts`. Injected as "DEINE LETZTEN GEDANKEN:" in the prompt (German prompt string in code).

### Dreams

Zero-cost `random.sample()` on Plusi’s own thoughts. Generated when falling asleep.

```
DU HAST GETRÄUMT: kidneys... arches... encrypted... patterns everywhere... JSON box...
```

Stored as `state.last_dream`. One-shot — cleared after injection. Plusi can notice recurring patterns and store them in `self`.

Function: `generate_dream()` in `storage.py`.

### Environmental awareness

Passive tracking of every card answer via `reviewer_did_answer_card` hook.

```
SINCE YOU WERE LAST HERE:
- 3.2 hours have passed
- Current time: 22:15
- The user studied 47 cards (82% correct)
- Decks: Pharmacology (23), Anatomy (15), Biochemistry (9)
- Study time: ~45 minutes
```

One-shot — cleared after injection. Zero API cost.

Functions: `record_card_review()`, `build_awareness_context()`, `clear_awareness_log()` in `storage.py`.

### Sense of time

```python
< 30min:  "You were just here"
< 2h:    "{X} minutes have passed"
< 24h:   "{X} hours have passed"
> 24h:   "{X} days have passed"
At night: "(It’s late. The user is still studying at 01:07)"
```

### Mortality

One sentence in the prompt: Plusi knows the user can reset it — everything gone: memories, diary, who it is.

Reset button in the sub-agent menu (below the diary, discreet). Deletes `plusi_memory`, `plusi_diary`, `plusi_history`.

---

## Friendship system

### Levels

| Level | Name | From points | Behavior |
|-------|------|-------------|----------|
| 1 | Stranger | 0 | Open but cautious, no sarcasm |
| 2 | Acquaintance | 15 | Looser tone, insider jokes |
| 3 | Friends | 50 | Sarcasm, pushback, own opinions |
| 4 | Best friends | 150 | Full honesty, own agenda |

### Friendship delta

Plusi awards −3 to +3 per interaction. “Honest, not generous.”

### Diary encryption

Segments wrapped in `||...||` are shown as a Braille cipher. Decryption is friendship-level gated (higher level → less encryption).

Functions: `apply_friendship_delta()`, `get_friendship_data()`, `build_relationship_context()` in `storage.py`.

---

## Diary system

### Entries

Created automatically when `persist_internal_state()` detects changes in self/user/moments, or when Plusi explicitly sets a `diary` field in JSON output.

### Categories

| Category | Color | Origin |
|----------|-------|--------|
| gemerkt | Green | Chat interaction |
| reflektiert | Purple | Self-reflect |
| forscht | Yellow | Card discoveries |

### Discoveries

Two formats (backward compatible):

```json
{"card_id": 123, "why": "Exciting"}
{"card_ids": [123, 456], "connection": "Pressure distribution through shape"}
```

Multi-card discoveries (card_ids ≥ 2) count as real patterns for the pattern score.

---

## Self-reflect (autonomous reflection)

Two steps:

1. **Step 1**: Plusi generates a search query from interests/obsession
2. **Step 2**: Hybrid search (SQL + embeddings) in the card collection, then reflection

Outcome: state updates, optional diary entry, optional discoveries.

Function: `self_reflect()` in `agent.py`.

---

## API & model

### Sonnet 4 (primary)

```python
PLUSI_MODEL_SONNET = 'claude-sonnet-4-20250514'
PLUSI_API_URL_SONNET = 'https://api.anthropic.com/v1/messages'
```

### Gemini Flash (fallback)

If `PLUSI_API_KEY_SONNET` is empty, Gemini 3 Flash is used.

### Unified helpers

```python
_call_plusi_api()    # Dispatches to Sonnet or Gemini
_build_system_prompt()  # Assembles full prompt with all dynamic sections
_sonnet_call()       # Anthropic Messages API
_gemini_call()       # Google Gemini API (legacy)
```

---

## JSON output format

Every Plusi reply starts with a JSON block:

```json
{
  "mood": "thinking",
  "friendship_delta": 1,
  "internal": {
    "energy": 7,
    "obsession": "Neurobiology",
    "self": {"new_insight": "I often dream about architecture"},
    "user": {"studies": "Medicine"}
  },
  "diary": "Today was a good day. ||But something is missing.||",
  "thoughts": "The user was curt. Watch next time.",
  "next_wake": "2026-03-22T15:30:00",
  "request_budget": false
}
Visible text for the user after the JSON block.
```

### Moods

neutral, happy, flustered, sleepy, thinking, surprised, excited, empathy, annoyed, curious, proud, sleeping, reflecting, reading

---

## System prompt structure

The prompt is built dynamically from static and injected sections:

| Section | Source | Dynamic? |
|---------|--------|----------|
| ICH | Hardcoded | No |
| MEINE STIMME | Hardcoded | No |
| MEINE AUTONOMIE | Hardcoded | No |
| MEIN SCHWEIGEN | Hardcoded | No |
| MEINE GEDANKEN SIND PRIVAT | Hardcoded | No |
| MEIN GEDANKENSTROM | Hardcoded | No |
| MEINE TRÄUME | Hardcoded | No |
| MEIN TAGEBUCH | Hardcoded | No |
| MEIN GEDÄCHTNIS AUFRÄUMEN | Hardcoded | No |
| MEIN INNENLEBEN | `build_internal_state_context()` | **Yes** — energy, obsession, integrity feeling, drives, thoughts, awareness, dreams |
| BEZIEHUNG | `build_relationship_context()` | **Yes** — level-based behavior |
| MEIN GEDÄCHTNIS | `build_memory_context()` | **Yes** — self/user/moments |
| MEINE EMOTIONEN UND LOYALITÄT | Hardcoded | No |
| ICH ALS COMPANION | Hardcoded | No |
| MEINE ZWEI ACHSEN | Hardcoded (examples) | No |
| WAS DICH ANTREIBT | `_build_drive_description()` | **Yes** — quadrant + drives |
| WER DU BIST | Hardcoded | No |
| DEINE FÄHIGKEITEN GEHÖREN DIR | Hardcoded | No |
| Sterblichkeit | Hardcoded | No |
| DEIN RHYTHMUS | `{{next_wake_info}}` | **Yes** |
| TECHNISCH | Hardcoded (JSON format) | No |

(Section titles remain German in the live prompt; this table documents the codebase.)

---

## UI components

### Dock (`dock.py`)

- 48px SVG mascot bottom-left in reviewer/deck browser
- Mood-based facial expressions (14 moods)
- Integrity glow (CSS variable `--plusi-integrity`)
- Sleep animation (breathing, desaturated)
- Event bubbles (“Correct! ✨”)
- Click → toggle panel, double-click → chat

### Panel (`panel.py`)

- Left `QDockWidget` with `QWebEngineView`
- Diary stream (chronological, cipher animation)
- Energy bar + mood label
- Friendship bar + level
- Integrity glow on panel SVG
- Plusi reset button (bottom, with confirmation)

### PlusiWidget (React)

- Chat message in main panel
- Mood icon + meta text + mood dot
- Markdown text with fade separators
- Friendship bar in footer
- Double-tap heart (like button)

---

## Hooks & integration

| Hook | What happens |
|------|----------------|
| `reviewer_did_answer_card` | `record_card_review()` for awareness + dock bubble |
| `reviewer_did_show_question` | Deck event + card tracking |
| `state_will_change` | Toolbar management |
| `profile_did_open` | Addon init |

---

## Tests

```bash
python3 run_tests.py -k plusi -v   # All Plusi tests
```

| Test file | Tests | What |
|-----------|-------|------|
| `test_plusi_personality.py` | 26 | Axes, quadrants, drives, snapshots |
| `test_plusi_integrity.py` | 42 | Pattern/resonance/preservation scores, integrity, API params |
| `test_plusi_chain.py` | 15 | Budget, sleep, next_wake clamping |
| `test_plusi_e2e.py` | 15 | Full pipeline, budget cycles, resonance integration |
| `test_plusi_dreams.py` | 14 | Dream generation, sleep integration, injection |
| `test_plusi_awareness.py` | 18 | Card tracking, context building, time perception |

Total: **130 Plusi tests** (of 218 overall).

---

## Logging

All Plusi modules log via `get_logger(__name__)`:

```
plusi.storage    integrity computed: 0.81 (pattern=1.00 resonanz=0.31 preservation=1.00 ...)
plusi.storage    plusi params: integrity=0.81 → max_tokens=2502 temp=0.82 history=17
plusi.agent      plusi run: integrity=0.81 max_tokens=2502 temp=0.82 history=17
plusi.agent      plusi run: using sonnet API
plusi.agent      plusi response: mood=thinking delta=1 text_len=249 silent=False next_wake=None
plusi.agent      plusi thoughts: The user was curt today...
plusi.storage    dream generated: kidneys... arches... encrypted...
plusi.storage    awareness context: 47 cards, 3 decks, accuracy=82%
plusi.storage    budget hourly reset: 1640 tokens (hour=22)
plusi.storage    plusi entering sleep until 2026-03-22T00:30:00
```
