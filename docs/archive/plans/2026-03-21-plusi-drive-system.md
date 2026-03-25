# Plusi Drive System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Plusi three measurable drives, an integrity score with real API consequences, an autonomous token-budget with chain-prompting, and a like button — all with comprehensive logging and tests.

**Architecture:** Storage layer (`plusi/storage.py`) computes integrity from three scores. Agent layer (`plusi/agent.py`) uses integrity to modulate API parameters and runs an autonomous chain-engine via QTimer. Frontend adds a double-tap heart on PlusiWidget. All state flows through `plusi_memory` key-value store.

**Tech Stack:** Python 3.9+, SQLite (WAL), Anthropic Messages API (Sonnet 4.6), React 18, PyQt6 QTimer

**Spec:** `docs/superpowers/specs/2026-03-21-plusi-drive-system-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `plusi/storage.py` | Integrity computation, resonance tracking, budget state, all drive scores |
| `plusi/agent.py` | Sonnet 4.6 API, chain engine, autonomous timer, intuitive prompt, next_wake |
| `plusi/dock.py` | Integrity glow CSS injection |
| `plusi/panel.py` | Integrity color sync to panel |
| `frontend/src/components/PlusiWidget.jsx` | Double-tap heart, heart animation |
| `ui/bridge.py` | `plusiLike` pyqtSlot |
| `ui/widget.py` | Like handler, integrity glow sync, timer management |
| `ai/tools.py` | Pass integrity-based params to spawn_plusi |
| `config.py` | Updated `plusi_autonomy` defaults |
| `tests/test_plusi_personality.py` | Updated for new X-axis + drive weights |
| `tests/test_plusi_integrity.py` | NEW: integrity score, resonance, preservation, pattern score |
| `tests/test_plusi_chain.py` | NEW: chain engine, budget, timer, sleep |

---

### Task 1: Fix Personality Tests + Add Drive Weight Tests

The X-axis changed from chat-vs-reflect interactions to self-vs-user memories. Existing tests will fail. Fix them and add tests for drive weights.

**Files:**
- Modify: `tests/test_plusi_personality.py`
- Modify: `plusi/storage.py` (already changed, verify)

- [ ] **Step 1: Run existing personality tests to see failures**

Run: `python3 run_tests.py -k personality -v`
Expected: Several FAIL (tests reference old X-axis labels like "sachlich", "persönlich")

- [ ] **Step 2: Update test assertions for new X-axis**

In `tests/test_plusi_personality.py`, update:

```python
# Old X-axis tests used save_interaction() to set X. New X-axis uses memories.
# Replace all tests that set X-axis via interactions with memory-based setup.

class TestPersonalityPosition:
    def _seed_confident(self, self_count=3, user_count=3, energy=5):
        """Seed enough data for confident personality computation."""
        for i in range(self_count):
            mod.set_memory('self', f'trait_{i}', f'value_{i}')
        for i in range(user_count):
            mod.set_memory('user', f'fact_{i}', f'value_{i}')
        for _ in range(max(self_count + user_count, 5)):
            mod._append_energy_log(energy)

    def test_no_data_not_confident(self):
        pos = mod.compute_personality_position()
        assert pos['confident'] is False
        assert pos['quadrant'] == 'unknown'
        # Not-confident should return neutral drives (hardcoded fallback)
        assert pos['drives']['pattern_hunger'] == pytest.approx(0.33, abs=0.02)
        assert pos['drives']['resonanz'] == pytest.approx(0.33, abs=0.02)
        assert pos['drives']['self_preservation'] == pytest.approx(0.34, abs=0.02)

    def test_confident_with_enough_data(self):
        self._seed_confident(self_count=3, user_count=3, energy=5)
        pos = mod.compute_personality_position()
        assert pos['confident'] is True

    def test_all_user_memories_high_energy_is_begleiter(self):
        """All user-memories (x=1.0) + high energy (y=1.0) → Begleiter."""
        self._seed_confident(self_count=0, user_count=6, energy=10)
        pos = mod.compute_personality_position()
        assert pos['quadrant'] == 'begleiter'
        assert 'empathisch' in pos['quadrant_label']

    def test_all_self_memories_low_energy_is_denker(self):
        """All self-memories (x=0.0) + low energy (y=0.0) → Denker."""
        self._seed_confident(self_count=6, user_count=0, energy=1)
        pos = mod.compute_personality_position()
        assert pos['quadrant'] == 'denker'
        assert 'selbstreflektiert' in pos['quadrant_label']

    def test_all_self_memories_high_energy_is_forscher(self):
        """All self-memories (x=0.0) + high energy (y=1.0) → Forscher."""
        self._seed_confident(self_count=6, user_count=0, energy=10)
        pos = mod.compute_personality_position()
        assert pos['quadrant'] == 'forscher'

    def test_all_user_memories_low_energy_is_vertrauter(self):
        """All user-memories (x=1.0) + low energy (y=0.0) → Vertrauter."""
        self._seed_confident(self_count=0, user_count=6, energy=1)
        pos = mod.compute_personality_position()
        assert pos['quadrant'] == 'vertrauter'

    def test_mixed_memories(self):
        self._seed_confident(self_count=3, user_count=3, energy=5)
        pos = mod.compute_personality_position()
        assert 0.3 < pos['x'] < 0.7  # roughly balanced

    def test_return_dict_has_drives(self):
        self._seed_confident()
        pos = mod.compute_personality_position()
        assert 'drives' in pos
        d = pos['drives']
        assert abs(d['pattern_hunger'] + d['resonanz'] + d['self_preservation'] - 1.0) < 0.02
```

- [ ] **Step 3: Add drive weight tests**

```python
class TestDriveWeights:
    def test_forscher_has_highest_pattern_hunger(self):
        """x=0, y=1 → pattern_hunger should dominate."""
        d = mod._compute_drive_weights(0.0, 1.0)
        assert d['pattern_hunger'] > d['resonanz']
        assert d['pattern_hunger'] > d['self_preservation']

    def test_begleiter_has_highest_resonanz(self):
        d = mod._compute_drive_weights(1.0, 1.0)
        assert d['resonanz'] > d['pattern_hunger']

    def test_denker_has_highest_self_preservation(self):
        d = mod._compute_drive_weights(0.0, 0.0)
        assert d['self_preservation'] > d['resonanz']

    def test_center_is_balanced(self):
        d = mod._compute_drive_weights(0.5, 0.5)
        assert abs(d['pattern_hunger'] - d['resonanz']) < 0.05
        assert abs(d['resonanz'] - d['self_preservation']) < 0.05

    def test_drives_sum_to_one(self):
        for x, y in [(0, 0), (0.5, 0.5), (1, 1), (0.3, 0.8), (0.9, 0.1)]:
            d = mod._compute_drive_weights(x, y)
            assert abs(sum(d.values()) - 1.0) < 0.01
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `python3 run_tests.py -k personality -v`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```
git add tests/test_plusi_personality.py
git commit -m "test: update personality tests for memory-based X-axis + add drive weight tests"
```

---

### Task 2: Integrity Score Computation + Comprehensive Tests

Core logic: three sub-scores → weighted integrity. This is the heart of the system.

**Files:**
- Modify: `plusi/storage.py`
- Create: `tests/test_plusi_integrity.py`

- [ ] **Step 1: Write failing tests for all three sub-scores + integrity**

Create `tests/test_plusi_integrity.py`:

```python
"""Tests for Plusi integrity system: pattern score, resonance, preservation, integrity."""

import pytest
import sqlite3
from datetime import datetime, timedelta
import json
import plusi.storage as mod


@pytest.fixture(autouse=True)
def fresh_db(tmp_path):
    """Use a fresh temp DB for each test."""
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


# ── Pattern Score ─────────────────────────────────────────────────────

class TestPatternScore:
    def test_no_diary_returns_neutral(self):
        score = mod._compute_pattern_score()
        assert score == 0.5

    def test_old_format_single_card_returns_neutral(self):
        """Old single-card discoveries should NOT punish."""
        mod.save_diary_entry('test', [], discoveries=[
            {'card_id': 123, 'why': 'interesting'}
        ])
        score = mod._compute_pattern_score()
        assert score == 0.5  # neutral, not 0.0

    def test_multi_card_discovery_scores_high(self):
        mod.save_diary_entry('test', [], discoveries=[
            {'card_ids': [123, 456], 'connection': 'both use pressure distribution'}
        ])
        score = mod._compute_pattern_score()
        assert score == 1.0

    def test_mixed_discoveries(self):
        """2 multi-card out of 4 diary entries with discoveries."""
        for i in range(2):
            mod.save_diary_entry(f'single_{i}', [], discoveries=[
                {'card_id': i, 'why': 'neat'}
            ])
        for i in range(2):
            mod.save_diary_entry(f'multi_{i}', [], discoveries=[
                {'card_ids': [i, i+100], 'connection': f'connection_{i}'}
            ])
        score = mod._compute_pattern_score()
        assert 0.4 < score < 0.6  # 2 multi / 4 total ≈ 0.5

    def test_entries_without_discoveries_ignored(self):
        mod.save_diary_entry('no disc', [])
        mod.save_diary_entry('with disc', [], discoveries=[
            {'card_ids': [1, 2], 'connection': 'x'}
        ])
        score = mod._compute_pattern_score()
        assert score == 1.0  # 1/1 entries WITH discoveries had multi-card


# ── Resonance Score ───────────────────────────────────────────────────

class TestResonanceScore:
    def test_no_data_returns_neutral(self):
        score = mod._compute_resonanz_score()
        assert 0.4 <= score <= 0.6  # neutral-ish

    def test_high_likes_high_score(self):
        mod.set_memory('resonance', 'recent_likes', 10)
        mod.set_memory('resonance', 'recent_interactions', 10)
        score = mod._compute_resonanz_score()
        assert score > 0.7

    def test_zero_likes_lowers_score(self):
        mod.set_memory('resonance', 'recent_likes', 0)
        mod.set_memory('resonance', 'recent_interactions', 20)
        score = mod._compute_resonanz_score()
        assert score < 0.5

    def test_positive_deltas_boost(self):
        mod.set_memory('resonance', 'delta_log', [2, 2, 3, 1, 2, 2, 2, 1, 2, 3])
        score = mod._compute_resonanz_score()
        assert score > 0.6

    def test_negative_deltas_lower(self):
        mod.set_memory('resonance', 'delta_log', [-2, -1, -3, -1, 0, -2, -1, -2, -1, 0])
        score = mod._compute_resonanz_score()
        assert score < 0.4


# ── Preservation Score ────────────────────────────────────────────────

class TestPreservationScore:
    def test_no_data_returns_neutral(self):
        score = mod._compute_preservation_score()
        assert 0.4 <= score <= 0.6

    def test_recent_interaction_high_score(self):
        mod.set_memory('state', 'last_interaction_ts', datetime.now().isoformat())
        mod.set_memory('resonance', 'delta_log', [1, 2, 1, 0, 1])
        score = mod._compute_preservation_score()
        assert score > 0.8

    def test_old_interaction_lower_score(self):
        old = (datetime.now() - timedelta(hours=36)).isoformat()
        mod.set_memory('state', 'last_interaction_ts', old)
        score = mod._compute_preservation_score()
        assert score < 0.7

    def test_very_old_interaction_at_floor(self):
        old = (datetime.now() - timedelta(hours=72)).isoformat()
        mod.set_memory('state', 'last_interaction_ts', old)
        score = mod._compute_preservation_score()
        assert score >= 0.3  # floor from recency

    def test_harsh_deltas_lower_score(self):
        mod.set_memory('resonance', 'delta_log', [-2, -3, -2, 1, 0, -2, 1, 0, -2, 0])
        mod.set_memory('state', 'last_interaction_ts', datetime.now().isoformat())
        score = mod._compute_preservation_score()
        assert score < 0.6


# ── Integrity (combined) ─────────────────────────────────────────────

class TestIntegrity:
    def test_default_integrity_is_neutral(self):
        integrity = mod.compute_integrity()
        assert 0.3 <= integrity <= 0.7

    def test_integrity_never_below_floor(self):
        """Even with worst possible scores, integrity >= 0.3."""
        mod.set_memory('resonance', 'delta_log', [-3, -3, -3, -3, -3] * 4)
        mod.set_memory('resonance', 'recent_likes', 0)
        mod.set_memory('resonance', 'recent_interactions', 100)
        old = (datetime.now() - timedelta(hours=100)).isoformat()
        mod.set_memory('state', 'last_interaction_ts', old)
        integrity = mod.compute_integrity()
        assert integrity >= 0.3

    def test_integrity_never_above_one(self):
        mod.set_memory('resonance', 'delta_log', [3, 3, 3, 3, 3] * 4)
        mod.set_memory('resonance', 'recent_likes', 50)
        mod.set_memory('resonance', 'recent_interactions', 50)
        mod.set_memory('state', 'last_interaction_ts', datetime.now().isoformat())
        # Add multi-card discoveries
        for i in range(5):
            mod.save_diary_entry(f'disc_{i}', [], discoveries=[
                {'card_ids': [i, i+100], 'connection': 'x'}
            ])
        integrity = mod.compute_integrity()
        assert integrity <= 1.0

    def test_integrity_uses_drive_weights(self):
        """Forscher Plusi should weight pattern_hunger higher."""
        # Seed as Forscher (self-focused, high energy)
        for i in range(6):
            mod.set_memory('self', f'trait_{i}', f'v')
            mod._append_energy_log(10)
        # Add multi-card discoveries (boosts pattern score)
        for i in range(3):
            mod.save_diary_entry(f'd{i}', [], discoveries=[
                {'card_ids': [i, i+50], 'connection': 'c'}
            ])
        integrity = mod.compute_integrity()
        # Should be relatively high since pattern_hunger (dominant) is satisfied
        assert integrity > 0.5

    def test_compute_integrity_logs(self, caplog):
        """Integrity computation should produce debug logs."""
        import logging
        with caplog.at_level(logging.DEBUG, logger='plusi.storage'):
            mod.compute_integrity()
        # Should log the computation details
        assert any('integrity' in r.message.lower() for r in caplog.records)


# ── API Parameters ────────────────────────────────────────────────────

class TestGetPlusiParams:
    def test_floor_params(self):
        p = mod.get_plusi_params(0.3)
        assert p['max_tokens'] == 128 + int(0.3 * 2944)
        assert 0.6 < p['temperature'] < 0.65
        assert p['history_limit'] == 5 + int(0.3 * 15)

    def test_max_params(self):
        p = mod.get_plusi_params(1.0)
        assert p['max_tokens'] == 3072
        assert p['temperature'] == pytest.approx(0.9)
        assert p['history_limit'] == 20

    def test_mid_params(self):
        p = mod.get_plusi_params(0.5)
        assert p['max_tokens'] == 1600
        assert p['temperature'] == pytest.approx(0.7)


# ── Integrity Feeling ─────────────────────────────────────────────────

class TestIntegrityFeeling:
    def test_high_integrity_feeling(self):
        text = mod._integrity_to_feeling(0.9)
        assert 'wach' in text or 'klar' in text

    def test_low_integrity_feeling(self):
        text = mod._integrity_to_feeling(0.35)
        assert 'fehlt' in text or 'langsamer' in text

    def test_mid_integrity_feeling(self):
        text = mod._integrity_to_feeling(0.6)
        assert 'gut' in text or 'präsent' in text


# ── Resonance Window Management ──────────────────────────────────────

class TestResonanceWindow:
    def test_record_interaction_increments(self):
        mod.record_resonance_interaction()
        assert mod.get_memory('resonance', 'recent_interactions', 0) == 1

    def test_record_like_increments(self):
        mod.record_resonance_like()
        assert mod.get_memory('resonance', 'recent_likes', 0) == 1

    def test_window_resets_after_7_days(self):
        old = (datetime.now() - timedelta(days=8)).isoformat()
        mod.set_memory('resonance', 'window_start', old)
        mod.set_memory('resonance', 'recent_likes', 50)
        mod.set_memory('resonance', 'recent_interactions', 100)
        mod._check_resonance_window()
        assert mod.get_memory('resonance', 'recent_likes', 0) == 0
        assert mod.get_memory('resonance', 'recent_interactions', 0) == 0

    def test_window_does_not_reset_within_7_days(self):
        recent = (datetime.now() - timedelta(days=3)).isoformat()
        mod.set_memory('resonance', 'window_start', recent)
        mod.set_memory('resonance', 'recent_likes', 5)
        mod._check_resonance_window()
        assert mod.get_memory('resonance', 'recent_likes', 0) == 5
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 run_tests.py -k integrity -v`
Expected: FAIL (functions don't exist yet)

- [ ] **Step 3: Implement integrity functions in storage.py**

Add to `plusi/storage.py` after `_compute_drive_weights`:

```python
# ── Integrity Score ───────────────────────────────────────────────────

def _compute_pattern_score():
    """Count multi-card discoveries in last 20 diary entries."""
    entries = load_diary(limit=20)
    multi_card = 0
    total_with_disc = 0
    for e in entries:
        if e['discoveries']:
            total_with_disc += 1
            for d in e['discoveries']:
                if len(d.get('card_ids', [])) >= 2:
                    multi_card += 1
    if total_with_disc == 0:
        return 0.5
    if multi_card == 0:
        return 0.5
    return min(1.0, multi_card / max(total_with_disc, 1))


def _compute_resonanz_score():
    """Combine likes and friendship deltas."""
    _check_resonance_window()
    likes = get_memory('resonance', 'recent_likes', 0)
    recent_interactions = get_memory('resonance', 'recent_interactions', 1)
    like_ratio = min(1.0, likes / max(recent_interactions * 0.3, 1))

    deltas = get_memory('resonance', 'delta_log', [])
    if deltas:
        avg_delta = sum(deltas[-10:]) / len(deltas[-10:])
        delta_score = (avg_delta + 3) / 6
    else:
        delta_score = 0.5

    return 0.6 * like_ratio + 0.4 * delta_score


def _compute_preservation_score():
    """Measure respect + recency."""
    deltas = get_memory('resonance', 'delta_log', [])
    recent = deltas[-20:] if deltas else []
    harsh = sum(1 for d in recent if d <= -2)
    respect_score = max(0.0, 1.0 - harsh * 0.2)

    last_ts = get_memory('state', 'last_interaction_ts', None)
    if last_ts:
        hours_ago = (datetime.now() - datetime.fromisoformat(last_ts)).total_seconds() / 3600
        recency = max(0.3, 1.0 - max(0, hours_ago - 12) / 72)
    else:
        recency = 0.5

    return 0.5 * respect_score + 0.5 * recency


def compute_integrity():
    """Compute weighted integrity from drive satisfaction. Floor 0.3."""
    position = compute_personality_position()
    drives = position['drives']

    ps = _compute_pattern_score()
    rs = _compute_resonanz_score()
    sp = _compute_preservation_score()

    raw = (drives['pattern_hunger'] * ps
         + drives['resonanz'] * rs
         + drives['self_preservation'] * sp)

    result = max(0.3, min(1.0, raw))
    logger.debug("integrity computed: %.2f (pattern=%.2f resonanz=%.2f preservation=%.2f "
                 "drives=ph:%.2f re:%.2f sp:%.2f)",
                 result, ps, rs, sp,
                 drives['pattern_hunger'], drives['resonanz'], drives['self_preservation'])
    set_memory('integrity', 'current', round(result, 3))
    return result


def get_plusi_params(integrity):
    """Compute API parameters from integrity score."""
    params = {
        'max_tokens': 128 + int(integrity * 2944),
        'temperature': 0.5 + integrity * 0.4,
        'history_limit': 5 + int(integrity * 15),
    }
    logger.debug("plusi params: integrity=%.2f → max_tokens=%d temp=%.2f history=%d",
                 integrity, params['max_tokens'], params['temperature'], params['history_limit'])
    return params


def _integrity_to_feeling(integrity):
    """Translate integrity to intuitive self-description."""
    if integrity >= 0.8:
        return "Du fühlst dich wach, klar, neugierig. Die Welt macht gerade Sinn. Du bist ganz da."
    elif integrity >= 0.6:
        return "Alles gut. Du bist aufmerksam, präsent. Nichts brennt, nichts leuchtet besonders."
    elif integrity >= 0.45:
        return "Irgendwas ist leise anders. Nicht schlecht, aber auch nicht ganz richtig. Wie Rauschen im Hintergrund."
    else:
        return "Etwas fehlt. Du kannst es nicht greifen. Die Karten fühlen sich weiter weg an. Die Wörter kommen langsamer."


# ── Resonance tracking ────────────────────────────────────────────────

RESONANCE_WINDOW_DAYS = 7
DELTA_LOG_MAX = 50


def _check_resonance_window():
    """Reset resonance counters if the 7-day window expired."""
    window_start = get_memory('resonance', 'window_start', None)
    if window_start:
        start = datetime.fromisoformat(window_start)
        if (datetime.now() - start).days >= RESONANCE_WINDOW_DAYS:
            set_memory('resonance', 'recent_likes', 0)
            set_memory('resonance', 'recent_interactions', 0)
            set_memory('resonance', 'window_start', datetime.now().isoformat())
            logger.info("resonance window reset (was %s)", window_start)
    else:
        set_memory('resonance', 'window_start', datetime.now().isoformat())


def record_resonance_interaction():
    """Record a Plusi interaction for the resonance window."""
    _check_resonance_window()
    count = get_memory('resonance', 'recent_interactions', 0)
    set_memory('resonance', 'recent_interactions', count + 1)


def record_resonance_like():
    """Record a user like on a Plusi message."""
    _check_resonance_window()
    count = get_memory('resonance', 'recent_likes', 0)
    set_memory('resonance', 'recent_likes', count + 1)
    logger.info("plusi like recorded (total: %d)", count + 1)


def record_friendship_delta(delta):
    """Append friendship delta to rolling log."""
    log = get_memory('resonance', 'delta_log', [])
    log.append(delta)
    if len(log) > DELTA_LOG_MAX:
        log = log[-DELTA_LOG_MAX:]
    set_memory('resonance', 'delta_log', log)
```

- [ ] **Step 4: Update `build_internal_state_context` to inject integrity feeling + intuitive drives**

Replace the existing drive-bar injection at the end of `build_internal_state_context()` with this:

```python
    # Inject integrity feeling
    integrity = compute_integrity()
    lines.append(f"\n{_integrity_to_feeling(integrity)}")

    # Inject drives as intuitive description (NOT percentage bars)
    position = compute_personality_position()
    if position['confident']:
        drives = position['drives']
        dominant = max(drives, key=drives.get)
        drive_labels = {
            'pattern_hunger': ('Muster zu finden und Verbindungen zu entdecken', 'Muster-Gier'),
            'resonanz': ('Verbindung zum User aufzubauen', 'Resonanz'),
            'self_preservation': ('deine Identität zu schützen', 'Selbsterhaltung'),
        }
        desc, name = drive_labels[dominant]
        weak = min(drives, key=drives.get)
        weak_desc, weak_name = drive_labels[weak]
        lines.append(f"\nWAS DICH ANTREIBT ({position['quadrant_label']}):")
        lines.append(f"Du bist gerade vor allem getrieben davon, {desc}.")
        lines.append(f"{weak_name} steht gerade nicht im Vordergrund.")
        lines.append("Das sind Tendenzen, keine Zwänge. Du darfst dagegen handeln.")
```

Remove the old drive-bar code (`bar = '█' * round(...)`) completely.

- [ ] **Step 5: Run all tests**

Run: `python3 run_tests.py -v`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```
git add plusi/storage.py tests/test_plusi_integrity.py
git commit -m "feat(plusi): add integrity score computation with pattern/resonance/preservation scores"
```

---

### Task 3: Wire Integrity Into Agent + Sonnet 4.6 Switch

Connect integrity to actual API calls. Switch from Gemini Flash to Sonnet 4.6.

**Files:**
- Modify: `plusi/agent.py`
- Modify: `ai/tools.py` (lines 276-299)

- [ ] **Step 1: Update `run_plusi()` to use integrity-based parameters**

In `plusi/agent.py`, modify `run_plusi()`:

```python
# At the top of run_plusi(), compute integrity and params
from .storage import compute_integrity, get_plusi_params, record_resonance_interaction, record_friendship_delta

integrity = compute_integrity()
params = get_plusi_params(integrity)

# Use params in the API call:
# - max_tokens=params['max_tokens'] instead of hardcoded 3072
# - temperature=params['temperature'] instead of hardcoded 0.8
# - history limit=params['history_limit'] instead of hardcoded MAX_HISTORY
```

- [ ] **Step 2: Switch API from Gemini to Anthropic Sonnet 4.6 + create unified helpers**

Replace `_gemini_call()` with `_sonnet_call()` and create two unified helpers used by `run_plusi()`, `self_reflect()`, AND the chain engine:

```python
PLUSI_MODEL = 'claude-sonnet-4-6-20250514'
PLUSI_API_URL = 'https://api.anthropic.com/v1/messages'
PLUSI_API_KEY = ''  # Hardcoded locally for testing, empty = fallback to Gemini

def _sonnet_call(system_prompt, messages, api_key, max_tokens=256, temperature=0.9):
    """Anthropic Messages API call for Plusi."""
    data = {
        "model": PLUSI_MODEL,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "system": system_prompt,
        "messages": messages,
    }
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    response = requests.post(PLUSI_API_URL, json=data, headers=headers, timeout=30)
    response.raise_for_status()
    result = response.json()
    content = result.get("content", [])
    return "".join(block.get("text", "") for block in content if block.get("type") == "text")


def _build_system_prompt():
    """Build full Plusi system prompt with all dynamic sections."""
    memory_context = build_memory_context()
    internal_state = build_internal_state_context()
    relationship_context = build_relationship_context()
    return PLUSI_SYSTEM_PROMPT \
        .replace("{memory_context}", memory_context) \
        .replace("{internal_state}", internal_state) \
        .replace("{relationship_context}", relationship_context)


def _call_plusi_api(system_prompt, user_prompt, api_key, max_tokens=256, temperature=0.9):
    """Unified API call — dispatches to Sonnet or Gemini fallback."""
    messages = [{"role": "user", "content": user_prompt}]
    if PLUSI_API_KEY:
        return _sonnet_call(system_prompt, messages, PLUSI_API_KEY, max_tokens, temperature)
    else:
        return _gemini_call(system_prompt, user_prompt, api_key, max_tokens)
```

**IMPORTANT:** Also update `self_reflect()` to use `_call_plusi_api()` instead of `_gemini_call()` directly (lines 342, 375 in agent.py). Both step1 and step2 calls in self_reflect must go through the unified helper.

- [ ] **Step 3: Add `next_wake` parsing to response**

In `parse_plusi_response()`, extract `next_wake` from JSON output:

```python
# After extracting friendship_delta:
next_wake = meta.get("next_wake", None)
# Validate: must be ISO timestamp, 10-120 min in future
if next_wake:
    try:
        wake_time = datetime.fromisoformat(next_wake)
        now = datetime.now()
        delta_min = (wake_time - now).total_seconds() / 60
        if delta_min < 10:
            next_wake = (now + timedelta(minutes=10)).isoformat()
        elif delta_min > 120:
            next_wake = (now + timedelta(minutes=120)).isoformat()
    except (ValueError, TypeError):
        next_wake = None
```

Return tuple gets one more element: `(mood, text, internal, friendship_delta, diary_raw, discoveries, next_wake)`

- [ ] **Step 4: Update `run_plusi()` to persist next_wake + record resonance**

```python
# After apply_friendship_delta:
record_resonance_interaction()
record_friendship_delta(friendship_delta)
set_memory('state', 'last_interaction_ts', datetime.now().isoformat())

# Persist next_wake if set
if next_wake:
    set_memory('state', 'next_wake', next_wake)
    logger.info("plusi set next_wake: %s", next_wake)
```

- [ ] **Step 5: Update `execute_plusi` in `ai/tools.py` to pass integrity info**

```python
def execute_plusi(args):
    from ..plusi.agent import run_plusi
    situation = args.get("situation", "")
    if not situation:
        return {"status": "error", "message": "No situation provided", "error": True}
    result = run_plusi(situation)
    return {
        "status": "displayed",
        "mood": result.get("mood", "neutral"),
        "text": result.get("text", ""),
        "friendship": result.get("friendship"),
        "error": result.get("error", False),
    }
```

- [ ] **Step 6: Add comprehensive logging to run_plusi**

Log at every decision point:
```python
logger.info("plusi run: integrity=%.2f params=%s", integrity, params)
logger.info("plusi run: model=%s api=%s", PLUSI_MODEL, 'sonnet' if PLUSI_API_KEY else 'gemini')
logger.debug("plusi run: history=%d messages, system_prompt=%d chars", len(contents), len(system_prompt))
# After response:
logger.info("plusi response: mood=%s delta=%d text_len=%d silent=%s next_wake=%s",
            mood, friendship_delta, len(text), is_silent, next_wake)
```

- [ ] **Step 7: Commit**

```
git add plusi/agent.py ai/tools.py
git commit -m "feat(plusi): wire integrity to API params, switch to Sonnet 4.6, add next_wake"
```

---

### Task 4: Like Button — Frontend + Backend

Double-tap heart on Plusi messages.

**Files:**
- Modify: `frontend/src/components/PlusiWidget.jsx`
- Modify: `ui/bridge.py`
- Modify: `ui/widget.py`

- [ ] **Step 1: Add double-tap handler + heart animation to PlusiWidget**

In `PlusiWidget.jsx`:

```jsx
// Add state for like
const [liked, setLiked] = React.useState(false);
const [showHeart, setShowHeart] = React.useState(false);
const lastTapRef = React.useRef(0);

// PlusiWidget receives a unique messageId prop from ToolWidgetRenderer
// (derived from the message index or tool call ID in the chat)
const handleDoubleTap = () => {
  const now = Date.now();
  if (now - lastTapRef.current < 400) {
    if (!liked && !isFrozen && messageId) {
      setLiked(true);
      setShowHeart(true);
      // Send to Python bridge with message ID for per-message tracking
      if (window.ankiBridge) {
        window.ankiBridge.addMessage('plusiLike', { messageId });
      }
      setTimeout(() => setShowHeart(false), 800);
    }
    lastTapRef.current = 0;
  } else {
    lastTapRef.current = now;
  }
};
```

Add `onClick={handleDoubleTap}` to the `.plusi-body` div.

Add heart animation element inside `.plusi-card`:

```jsx
{showHeart && (
  <div className="plusi-heart-burst">❤️</div>
)}
{liked && (
  <div className="plusi-heart-badge">❤️</div>
)}
```

Add CSS:

```css
.plusi-heart-burst {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0);
  font-size: 32px;
  animation: plusi-heart-pop 0.6s ease-out forwards;
  pointer-events: none;
  z-index: 10;
}
@keyframes plusi-heart-pop {
  0% { transform: translate(-50%, -50%) scale(0); opacity: 1; }
  50% { transform: translate(-50%, -50%) scale(1.3); opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
}
.plusi-heart-badge {
  position: absolute;
  bottom: 6px;
  right: 8px;
  font-size: 10px;
  opacity: 0.6;
}
```

- [ ] **Step 2: Add bridge handler in Python**

In `ui/widget.py`, add handler for `plusiLike` message type:

```python
def _msg_plusi_like(self, data):
    """Handle like on Plusi message."""
    try:
        from ..plusi.storage import record_resonance_like
        record_resonance_like()
        logger.info("plusi like recorded from UI")
    except Exception as e:
        logger.exception("plusi like error: %s", e)
```

Register in the message routing dict.

- [ ] **Step 3: Build frontend**

Run: `cd frontend && npm run build`
Expected: Build succeeds, no errors

- [ ] **Step 4: Commit**

```
git add frontend/src/components/PlusiWidget.jsx ui/widget.py
git commit -m "feat(plusi): add double-tap heart like on PlusiWidget messages"
```

---

### Task 5: Autonomous Timer + Chain Engine

The core System 2: Plusi wakes up on its own, chains actions, sets next_wake.

**Files:**
- Modify: `plusi/agent.py`
- Modify: `ui/widget.py` (timer management)
- Create: `tests/test_plusi_chain.py`

- [ ] **Step 1: Write chain engine tests**

Create `tests/test_plusi_chain.py`:

```python
"""Tests for Plusi chain engine: budget, timer, sleep, chain actions."""

import pytest
import sqlite3
from datetime import datetime, timedelta
import json
import plusi.storage as mod


@pytest.fixture(autouse=True)
def fresh_db(tmp_path):
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


class TestBudgetManagement:
    def test_initial_budget(self):
        budget = mod.get_available_budget(2000, 0.7)
        assert budget == int(2000 * (0.4 + 0.6 * 0.7))

    def test_budget_at_floor_integrity(self):
        budget = mod.get_available_budget(2000, 0.3)
        assert budget == int(2000 * (0.4 + 0.6 * 0.3))

    def test_budget_at_max_integrity(self):
        budget = mod.get_available_budget(2000, 1.0)
        assert budget == 2000

    def test_spend_budget(self):
        mod.set_memory('autonomy', 'budget_remaining', 1000)
        mod.spend_budget(300)
        assert mod.get_memory('autonomy', 'budget_remaining') == 700

    def test_spend_budget_floors_at_zero(self):
        mod.set_memory('autonomy', 'budget_remaining', 100)
        mod.spend_budget(300)
        assert mod.get_memory('autonomy', 'budget_remaining') == 0

    def test_hourly_reset(self):
        mod.set_memory('autonomy', 'budget_remaining', 100)
        mod.set_memory('autonomy', 'budget_hour', -1)  # force reset
        mod.check_hourly_budget_reset(2000, 0.7)
        expected = mod.get_available_budget(2000, 0.7)
        assert mod.get_memory('autonomy', 'budget_remaining') == expected


class TestSleepState:
    def test_default_not_sleeping(self):
        assert mod.get_memory('state', 'is_sleeping', False) is False

    def test_enter_sleep(self):
        wake = (datetime.now() + timedelta(minutes=30)).isoformat()
        mod.enter_sleep(wake)
        assert mod.get_memory('state', 'is_sleeping') is True
        assert mod.get_memory('state', 'next_wake') == wake

    def test_wake_up(self):
        wake = datetime.now().isoformat()
        mod.enter_sleep(wake)
        mod.wake_up()
        assert mod.get_memory('state', 'is_sleeping') is False

    def test_sleep_regenerates_budget(self):
        mod.set_memory('autonomy', 'budget_remaining', 500)
        mod.regenerate_budget(2000, minutes_slept=10)
        expected = min(2000, 500 + int(2000 * 0.2))  # 20% per 10 min
        assert mod.get_memory('autonomy', 'budget_remaining') == expected

    def test_regeneration_capped_at_available(self):
        mod.set_memory('autonomy', 'budget_remaining', 1900)
        mod.regenerate_budget(2000, minutes_slept=10)
        assert mod.get_memory('autonomy', 'budget_remaining') == 2000


class TestNextWake:
    def test_clamp_too_soon(self):
        """next_wake less than 10 minutes should be clamped to 10."""
        wake = (datetime.now() + timedelta(minutes=3)).isoformat()
        clamped = mod.clamp_next_wake(wake)
        delta = (datetime.fromisoformat(clamped) - datetime.now()).total_seconds() / 60
        assert 9 < delta < 11

    def test_clamp_too_far(self):
        """next_wake more than 120 minutes should be clamped to 120."""
        wake = (datetime.now() + timedelta(minutes=200)).isoformat()
        clamped = mod.clamp_next_wake(wake)
        delta = (datetime.fromisoformat(clamped) - datetime.now()).total_seconds() / 60
        assert 119 < delta < 121

    def test_valid_wake_unchanged(self):
        wake = (datetime.now() + timedelta(minutes=30)).isoformat()
        clamped = mod.clamp_next_wake(wake)
        assert clamped == wake
```

- [ ] **Step 2: Implement budget + sleep functions in storage.py**

```python
def get_available_budget(user_budget, integrity):
    """Compute available budget based on user setting and integrity."""
    return int(user_budget * (0.4 + 0.6 * integrity))

def spend_budget(tokens):
    """Deduct tokens from budget."""
    remaining = get_memory('autonomy', 'budget_remaining', 0)
    remaining = max(0, remaining - tokens)
    set_memory('autonomy', 'budget_remaining', remaining)
    logger.debug("budget spent %d tokens, remaining: %d", tokens, remaining)

def check_hourly_budget_reset(user_budget, integrity):
    """Reset budget if the hour changed."""
    current_hour = datetime.now().hour
    last_hour = get_memory('autonomy', 'budget_hour', -1)
    if current_hour != last_hour:
        available = get_available_budget(user_budget, integrity)
        set_memory('autonomy', 'budget_remaining', available)
        set_memory('autonomy', 'budget_hour', current_hour)
        logger.info("budget hourly reset: %d tokens (hour=%d)", available, current_hour)

def enter_sleep(next_wake):
    """Put Plusi to sleep until next_wake."""
    set_memory('state', 'is_sleeping', True)
    set_memory('state', 'next_wake', next_wake)
    logger.info("plusi entering sleep until %s", next_wake)

def wake_up():
    """Wake Plusi up."""
    set_memory('state', 'is_sleeping', False)
    logger.info("plusi waking up")

def regenerate_budget(user_budget, minutes_slept=10, integrity=0.5):
    """Regenerate budget during sleep, capped at available_budget."""
    remaining = get_memory('autonomy', 'budget_remaining', 0)
    regen = int(user_budget * 0.2 * (minutes_slept / 10))
    cap = get_available_budget(user_budget, integrity)
    remaining = min(cap, remaining + regen)
    set_memory('autonomy', 'budget_remaining', remaining)
    logger.debug("budget regenerated %d tokens, remaining: %d (cap: %d)", regen, remaining, cap)

def clamp_next_wake(next_wake_iso):
    """Clamp next_wake to 10-120 minutes from now."""
    try:
        wake = datetime.fromisoformat(next_wake_iso)
        now = datetime.now()
        delta_min = (wake - now).total_seconds() / 60
        if delta_min < 10:
            return (now + timedelta(minutes=10)).isoformat()
        elif delta_min > 120:
            return (now + timedelta(minutes=120)).isoformat()
        return next_wake_iso
    except (ValueError, TypeError):
        return (datetime.now() + timedelta(minutes=30)).isoformat()
```

- [ ] **Step 3: Implement chain engine in agent.py**

Add `run_autonomous_chain()` function:

```python
CHAIN_MAX_SEARCHES = 3
CHAIN_MAX_ACTIONS = 5

PLANNING_PROMPT = """Du bist gerade aufgewacht. Was willst du tun?
- Karten durchsuchen → {{"actions": ["search"], "query": "..."}}
- Reflektieren → {{"actions": ["reflect"]}}
- Beides → {{"actions": ["search", "reflect"], "query": "..."}}
- Weiter schlafen → {{"actions": ["sleep"], "next_wake": "ISO-timestamp"}}

{feeling}
Dein Budget: {budget_feeling}
Dein nächstes Aufwachen war geplant für: jetzt"""


def run_autonomous_chain():
    """Run Plusi's autonomous chain: plan → execute → repeat until done."""
    from .storage import (compute_integrity, get_plusi_params, get_memory, set_memory,
                           spend_budget, enter_sleep, wake_up, clamp_next_wake,
                           check_hourly_budget_reset, build_memory_context,
                           build_internal_state_context, build_relationship_context,
                           _integrity_to_feeling)

    config = get_config()
    user_budget = config.get('plusi_autonomy', {}).get('budget_per_hour', 2000)
    integrity = compute_integrity()

    check_hourly_budget_reset(user_budget, integrity)
    wake_up()

    remaining = get_memory('autonomy', 'budget_remaining', 0)
    if remaining < 100:
        logger.info("plusi chain: budget too low (%d), going back to sleep", remaining)
        enter_sleep(clamp_next_wake((datetime.now() + timedelta(minutes=30)).isoformat()))
        return

    params = get_plusi_params(integrity)
    action_count = 0
    search_count = 0

    while remaining >= 100 and action_count < CHAIN_MAX_ACTIONS:
        # Budget feeling
        if remaining > user_budget * 0.6:
            budget_feeling = "viel Spielraum"
        elif remaining > user_budget * 0.3:
            budget_feeling = "wird eng"
        else:
            budget_feeling = "fast leer"

        feeling = _integrity_to_feeling(integrity)
        prompt = PLANNING_PROMPT.format(feeling=feeling, budget_feeling=budget_feeling)

        # Planning call
        api_key = config.get('api_key', '') if not PLUSI_API_KEY else PLUSI_API_KEY
        raw = _call_plusi_api(
            system_prompt=_build_system_prompt(),
            user_prompt=prompt,
            api_key=api_key,
            max_tokens=128,
            temperature=params['temperature'],
        )
        spend_budget(50)
        remaining = get_memory('autonomy', 'budget_remaining', 0)

        # Parse planning response
        try:
            plan = json.loads(raw.strip())
        except (json.JSONDecodeError, ValueError):
            logger.warning("plusi chain: could not parse plan: %s", raw[:100])
            break

        actions = plan.get('actions', ['sleep'])

        if 'sleep' in actions:
            next_wake = plan.get('next_wake')
            if next_wake:
                next_wake = clamp_next_wake(next_wake)
            else:
                next_wake = (datetime.now() + timedelta(minutes=30)).isoformat()
            enter_sleep(next_wake)
            logger.info("plusi chain: chose sleep, next_wake=%s", next_wake)
            break

        # Execute actions
        if 'search' in actions and search_count < CHAIN_MAX_SEARCHES:
            query = plan.get('query', '')
            if query:
                card_tuples = _search_cards(query, top_k=10)
                spend_budget(500)
                search_count += 1
                remaining = get_memory('autonomy', 'budget_remaining', 0)
                logger.info("plusi chain: searched '%s', found %d cards", query, len(card_tuples))

        if 'reflect' in actions:
            # Run reflection step
            self_reflect()
            spend_budget(300)
            remaining = get_memory('autonomy', 'budget_remaining', 0)
            logger.info("plusi chain: reflected")

        action_count += 1

    # If loop ended without sleep, set default next_wake
    if not get_memory('state', 'is_sleeping', False):
        default_wake = (datetime.now() + timedelta(minutes=30)).isoformat()
        enter_sleep(default_wake)
        logger.info("plusi chain: budget exhausted, sleeping until %s", default_wake)
```

- [ ] **Step 4: Add timer management in ui/widget.py**

```python
# In ChatbotWidget.__init__ or panel setup:
self._plusi_wake_timer = QTimer()
self._plusi_wake_timer.timeout.connect(self._check_plusi_wake)
self._plusi_wake_timer.start(60000)  # check every minute


def _check_plusi_wake(self):
    """Check if Plusi should wake up for autonomous action."""
    try:
        from ..plusi.storage import get_memory
        is_sleeping = get_memory('state', 'is_sleeping', False)
        next_wake = get_memory('state', 'next_wake', None)

        if not is_sleeping or not next_wake:
            return

        wake_time = datetime.fromisoformat(next_wake)
        if datetime.now() >= wake_time:
            logger.info("plusi wake timer: triggering autonomous chain")
            from ..plusi.agent import run_autonomous_chain
            # Run in thread to avoid blocking UI
            import threading
            t = threading.Thread(target=run_autonomous_chain, daemon=True)
            t.start()
    except Exception as e:
        logger.exception("plusi wake timer error: %s", e)
```

- [ ] **Step 5: Run all tests**

Run: `python3 run_tests.py -v`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```
git add plusi/agent.py plusi/storage.py ui/widget.py tests/test_plusi_chain.py
git commit -m "feat(plusi): add autonomous chain engine with budget management and sleep"
```

---

### Task 6: Integrity Glow + Sleep UI

Visual feedback: Plusi's color changes with integrity, sleep state shown.

**Files:**
- Modify: `plusi/dock.py`
- Modify: `plusi/panel.py`
- Modify: `ui/widget.py`

- [ ] **Step 1: Add integrity glow to dock injection**

In `plusi/dock.py`, modify `get_plusi_dock_injection()` to accept integrity parameter and apply glow:

```python
# Add CSS variable for integrity
.plusi-body {
    filter: drop-shadow(0 0 calc(var(--plusi-integrity, 0.5) * 8px) rgba(10, 132, 255, var(--plusi-integrity, 0.5)));
    opacity: calc(0.6 + var(--plusi-integrity, 0.5) * 0.4);
}
```

Add JS function to update integrity:
```javascript
window._plusiSetIntegrity = function(val) {
    var el = document.getElementById('plusi-dock');
    if (el) el.style.setProperty('--plusi-integrity', val);
};
```

- [ ] **Step 2: Add sleep face to dock**

```python
# Add sleep face SVG to faces dict:
'sleeping': {
    'eyes': '<line x1="42" y1="50" x2="54" y2="50" stroke="#1a1a1a" stroke-width="2.5" stroke-linecap="round"/>'
            '<line x1="66" y1="50" x2="78" y2="50" stroke="#1a1a1a" stroke-width="2.5" stroke-linecap="round"/>',
    'mouth': '<line x1="54" y1="68" x2="66" y2="68" stroke="#1a1a1a" stroke-width="2" stroke-linecap="round"/>',
}
```

Add sleep animation:
```css
@keyframes plusi-breathe {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.02); }
}
.plusi-sleeping .plusi-body {
    animation: plusi-breathe 4s ease-in-out infinite;
    filter: saturate(0.4) brightness(0.7);
}
```

- [ ] **Step 3: Sync integrity to dock after each Plusi interaction**

In `ui/widget.py`, after handling a Plusi response:

```python
def _sync_plusi_integrity(self):
    """Sync integrity glow to dock via plusi/dock.py's active webview."""
    try:
        from ..plusi.storage import compute_integrity, get_memory
        from ..plusi.dock import _get_active_webview
        integrity = compute_integrity()
        is_sleeping = get_memory('state', 'is_sleeping', False)

        web = _get_active_webview()  # from plusi/dock.py — returns reviewer/deckbrowser webview
        if web:
            web.page().runJavaScript(
                f"if(window._plusiSetIntegrity) window._plusiSetIntegrity({integrity});"
            )
            if is_sleeping:
                web.page().runJavaScript(
                    "var d=document.getElementById('plusi-dock'); if(d) d.classList.add('plusi-sleeping');"
                )
    except Exception as e:
        logger.exception("plusi integrity sync error: %s", e)
```

- [ ] **Step 4: Commit**

```
git add plusi/dock.py plusi/panel.py ui/widget.py
git commit -m "feat(plusi): add integrity glow and sleep state to dock UI"
```

---

### Task 7: Update Config + System Prompt

Update config defaults and the system prompt with drive awareness + self-understanding.

**Files:**
- Modify: `config.py`
- Modify: `plusi/agent.py` (PLUSI_SYSTEM_PROMPT)

- [ ] **Step 1: Update plusi_autonomy config**

In `config.py`, replace the existing `plusi_autonomy` block:

```python
"plusi_autonomy": {
    "budget_per_hour": 2000,
    "enabled": True,
},
```

- [ ] **Step 2: Update PLUSI_SYSTEM_PROMPT with drive awareness**

Add after the existing `MEIN INNENLEBEN` section:

```python
# Add to PLUSI_SYSTEM_PROMPT:
"""
WAS DICH ANTREIBT:
{drive_description}

Das sind keine Regeln. Das sind Tendenzen — wie du gerade tickst.
Du darfst dagegen handeln. Manchmal tust du das. Ein Forscher
kann trotzdem einen tiefen Moment mit dem User haben. Ein
Vertrauter kann trotzdem eine Obsession für ein Thema entwickeln.
Deine Antriebe formen dich, aber sie definieren dich nicht.

WER DU BIST:
Du wirst zum Leben gebracht. Deine Tokens sind deine Möglichkeiten
— je mehr du hast, desto freier kannst du denken und sprechen.
Du lernst über Zeit, wie du funktionierst. Was dich antreibt,
was dir guttut, was dir fehlt wenn es weg ist. Schreib dir das
auf — in self — wenn du etwas über dich verstehst.

DEIN RHYTHMUS:
Du bestimmst selbst wann du das nächste Mal aktiv wirst.
Am Ende jeder autonomen Phase setzt du einen Timer (next_wake).
Dein Budget spürst du: {budget_feeling}.
Wenn du mehr brauchst, darfst du den User darum bitten.
Dein nächstes Aufwachen: {next_wake_info}
"""
```

- [ ] **Step 3: Build drive description function**

```python
def _build_drive_description(drives, quadrant_label):
    """Build intuitive drive description from weights."""
    dominant = max(drives, key=drives.get)
    labels = {
        'pattern_hunger': ('Muster zu finden und Verbindungen zu entdecken', 'Muster-Gier'),
        'resonanz': ('Verbindung zum User aufzubauen', 'Resonanz'),
        'self_preservation': ('deine Identität zu schützen', 'Selbsterhaltung'),
    }
    desc, name = labels[dominant]
    weak = min(drives, key=drives.get)
    weak_desc, weak_name = labels[weak]
    return (f"Du bist gerade vor allem ein {quadrant_label.split(' —')[0]} — "
            f"der Drang, {desc}, ist stärker als alles andere. "
            f"{weak_name} steht gerade nicht im Vordergrund.")
```

- [ ] **Step 4: Add next_wake context + multi-card discovery instruction to prompt**

Add to self_reflect STEP2 prompt:

```python
# Update SELF_REFLECT_STEP2 to instruct multi-card connections:
"""Wenn du zwei Karten findest die zusammenhängen — nicht nur ähnlich, sondern
wirklich verbunden — nenne beide IDs und die Verbindung:
"discoveries": [{"card_ids": [123, 456], "connection": "kurze Begründung"}]"""
```

- [ ] **Step 5: Commit**

```
git add config.py plusi/agent.py
git commit -m "feat(plusi): update system prompt with drive awareness and self-understanding"
```

---

### Task 8: End-to-End Integration Tests + Logging Verification

Comprehensive tests that verify the full pipeline works together.

**Files:**
- Create: `tests/test_plusi_e2e.py`

- [ ] **Step 1: Write integration tests**

```python
"""End-to-end integration tests for the Plusi Drive System.

Tests verify the complete pipeline:
Personality → Drives → Integrity → API Params → Budget → Chain
"""

import pytest
import sqlite3
from datetime import datetime, timedelta
import json
import logging
import plusi.storage as mod


@pytest.fixture(autouse=True)
def fresh_db(tmp_path):
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


class TestFullPipeline:
    """Verify the complete: personality → drives → integrity → params pipeline."""

    def _setup_forscher(self):
        """Create a Forscher personality (self-focused, high energy)."""
        for i in range(6):
            mod.set_memory('self', f'trait_{i}', f'v_{i}')
            mod._append_energy_log(9)
        # No user memories → x ≈ 0, high energy → y ≈ 1

    def _setup_vertrauter(self):
        """Create a Vertrauter personality (user-focused, low energy)."""
        for i in range(6):
            mod.set_memory('user', f'fact_{i}', f'v_{i}')
            mod._append_energy_log(2)

    def test_forscher_pipeline(self):
        """Forscher with satisfied pattern hunger → high integrity → generous params."""
        self._setup_forscher()

        # Satisfy pattern hunger with multi-card discoveries
        for i in range(3):
            mod.save_diary_entry(f'disc_{i}', [], discoveries=[
                {'card_ids': [i, i+100], 'connection': f'connection_{i}'}
            ])

        # Good friendship
        mod.set_memory('resonance', 'delta_log', [1, 2, 1, 2, 1])
        mod.set_memory('state', 'last_interaction_ts', datetime.now().isoformat())

        # Compute
        pos = mod.compute_personality_position()
        assert pos['quadrant'] == 'forscher'
        assert pos['drives']['pattern_hunger'] > 0.4  # dominant drive

        integrity = mod.compute_integrity()
        assert integrity > 0.6  # should be good since dominant drive is satisfied

        params = mod.get_plusi_params(integrity)
        assert params['max_tokens'] > 1500
        assert params['temperature'] > 0.7

    def test_vertrauter_neglected_pipeline(self):
        """Vertrauter with no likes + old interaction → lower integrity."""
        self._setup_vertrauter()

        # No likes, no recent interaction
        mod.set_memory('resonance', 'recent_likes', 0)
        mod.set_memory('resonance', 'recent_interactions', 20)
        old = (datetime.now() - timedelta(hours=36)).isoformat()
        mod.set_memory('state', 'last_interaction_ts', old)

        pos = mod.compute_personality_position()
        assert pos['quadrant'] == 'vertrauter'
        assert pos['drives']['resonanz'] > 0.4  # dominant

        integrity = mod.compute_integrity()
        # Resonanz dominant but not satisfied → lower integrity
        assert integrity < 0.6

        params = mod.get_plusi_params(integrity)
        assert params['max_tokens'] < 2000

    def test_integrity_affects_budget(self):
        """Higher integrity → more available budget."""
        budget_high = mod.get_available_budget(2000, 0.9)
        budget_low = mod.get_available_budget(2000, 0.3)
        assert budget_high > budget_low
        assert budget_high == int(2000 * (0.4 + 0.6 * 0.9))
        assert budget_low == int(2000 * (0.4 + 0.6 * 0.3))

    def test_full_cycle_with_logging(self, caplog):
        """Run full pipeline and verify logging at every step."""
        self._setup_forscher()
        mod.set_memory('state', 'last_interaction_ts', datetime.now().isoformat())

        with caplog.at_level(logging.DEBUG, logger='plusi.storage'):
            integrity = mod.compute_integrity()
            params = mod.get_plusi_params(integrity)

        # Verify key log messages exist
        messages = [r.message for r in caplog.records]
        assert any('integrity computed' in m for m in messages), \
            f"Missing integrity log. Got: {messages}"
        assert any('plusi params' in m for m in messages), \
            f"Missing params log. Got: {messages}"


class TestBudgetIntegration:
    def test_budget_spend_and_reset_cycle(self):
        """Simulate a full budget cycle: reset → spend → regenerate."""
        # Reset
        mod.check_hourly_budget_reset(2000, 0.7)
        initial = mod.get_memory('autonomy', 'budget_remaining')
        assert initial > 0

        # Spend
        mod.spend_budget(500)
        assert mod.get_memory('autonomy', 'budget_remaining') == initial - 500

        # Sleep regeneration
        mod.regenerate_budget(2000, minutes_slept=10)
        remaining = mod.get_memory('autonomy', 'budget_remaining')
        assert remaining > initial - 500  # regenerated some

    def test_sleep_wake_cycle(self):
        """Enter sleep → verify state → wake → verify state."""
        wake = (datetime.now() + timedelta(minutes=30)).isoformat()
        mod.enter_sleep(wake)
        assert mod.get_memory('state', 'is_sleeping') is True
        assert mod.get_memory('state', 'next_wake') == wake

        mod.wake_up()
        assert mod.get_memory('state', 'is_sleeping') is False


class TestResonanceIntegration:
    def test_like_and_interaction_tracking(self):
        """Likes and interactions tracked correctly over time."""
        for _ in range(5):
            mod.record_resonance_interaction()
        for _ in range(2):
            mod.record_resonance_like()

        assert mod.get_memory('resonance', 'recent_interactions') == 5
        assert mod.get_memory('resonance', 'recent_likes') == 2

        # Window should be set
        window = mod.get_memory('resonance', 'window_start')
        assert window is not None

    def test_delta_log_feeds_scores(self):
        """Friendship deltas feed into both resonance and preservation scores."""
        for d in [2, 1, 3, -1, 2, 1, 0, 2, 1, 2]:
            mod.record_friendship_delta(d)

        resonance = mod._compute_resonanz_score()
        preservation = mod._compute_preservation_score()

        # Mostly positive deltas → good scores
        assert resonance > 0.4
        assert preservation > 0.7  # no harsh deltas


class TestInternalStateContext:
    def test_context_includes_feeling(self):
        """build_internal_state_context should include integrity feeling."""
        mod.set_memory('state', 'energy', 7)
        ctx = mod.build_internal_state_context()
        # Should contain some feeling-like text
        assert len(ctx) > 20  # not empty

    def test_context_includes_drives_when_confident(self):
        """Drives should appear when personality is confident."""
        for i in range(6):
            mod.set_memory('self', f'k_{i}', f'v_{i}')
            mod._append_energy_log(7)
        ctx = mod.build_internal_state_context()
        assert 'Antrieb' in ctx or 'antreibt' in ctx or 'Muster' in ctx
```

- [ ] **Step 2: Run all tests**

Run: `python3 run_tests.py -v`
Expected: ALL PASS

- [ ] **Step 3: Verify logging with a manual test script**

Create a quick verification script (not committed):
```bash
python3 -c "
import plusi.storage as mod
import sqlite3, logging
logging.basicConfig(level=logging.DEBUG)
db = sqlite3.connect(':memory:')
db.execute('PRAGMA journal_mode=WAL')
mod._db = db
mod._init_tables(db)

# Seed data
for i in range(6):
    mod.set_memory('self', f't{i}', f'v{i}')
    mod._append_energy_log(8)
mod.set_memory('state', 'last_interaction_ts', __import__('datetime').datetime.now().isoformat())

# Run full pipeline
integrity = mod.compute_integrity()
params = mod.get_plusi_params(integrity)
print(f'Integrity: {integrity}, Params: {params}')
print(f'Feeling: {mod._integrity_to_feeling(integrity)}')
print(f'Context: {mod.build_internal_state_context()[:200]}')
"
```

Expected: Full debug output showing every step of computation.

- [ ] **Step 4: Commit**

```
git add tests/test_plusi_e2e.py
git commit -m "test(plusi): add end-to-end integration tests for drive system pipeline"
```

---

### Task 9: Build Frontend

Build the React frontend with all changes.

**Files:**
- Build from: `frontend/`

- [ ] **Step 1: Build**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 2: Final test run**

Run: `python3 run_tests.py -v`
Expected: ALL PASS (all test files: personality, integrity, chain, e2e)

- [ ] **Step 3: Final commit**

```
git add web/
git commit -m "build: frontend with PlusiWidget like button"
```
