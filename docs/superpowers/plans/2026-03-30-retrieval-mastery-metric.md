# Retrieval Mastery Metric — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the binary mature_pct metric with a retrieval-probability-based mastery score (FSRS-first, SM-2 fallback) so the TrajectoryChart shows meaningful progress even for short-term deadlines.

**Architecture:** New `retrieval.py` module computes per-card retention probability (FSRS direct read or SM-2 approximation). The existing `_compute_daily_mature_pct` becomes `_compute_daily_mastery` with continuous weighting. `current_pct` uses the new live retrieval calculation. Frontend field name stays `mature_pct` for backwards compatibility but now contains the new metric. Historical reconstruction uses a simplified continuous formula for performance.

**Tech Stack:** Python (SQLite queries on Anki card data), JavaScript (useTrajectoryModel unchanged — it consumes `mature_pct` field regardless of how it's computed)

**Spec:** `docs/superpowers/specs/2026-03-30-fokus-planer-design.md` → "Neue Kern-Metrik: Abrufwahrscheinlichkeit"

**Note:** This is Plan A of 2. Plan B (Focus System with CRUD, layered charts, navigation) builds on this metric and will be planned separately.

---

### Task 1: Retrieval probability module — pure functions

Create a new module `ui/retrieval.py` with the pure computation functions. These have no Anki dependencies and are fully testable.

**Files:**
- Create: `ui/retrieval.py`
- Create: `tests/test_retrieval.py`

- [ ] **Step 1: Write tests for SM-2 retention estimation**

Create `tests/test_retrieval.py`:

```python
"""Tests for retrieval probability calculations."""

import sys
import os
import types
import math

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Stub aqt before importing
_aqt_stub = types.ModuleType("aqt")
_aqt_stub.mw = types.SimpleNamespace()
sys.modules.setdefault("aqt", _aqt_stub)

from ui.retrieval import estimate_retention_sm2, estimate_retention_fsrs


class TestEstimateRetentionSm2:
    """SM-2 fallback: estimate retention from interval + elapsed days."""

    def test_new_card_returns_zero(self):
        assert estimate_retention_sm2(ivl=0, days_since_review=0, queue=0) == 0.0

    def test_learning_card_returns_half(self):
        assert estimate_retention_sm2(ivl=0, days_since_review=0, queue=1) == 0.5

    def test_day_learn_card_returns_half(self):
        assert estimate_retention_sm2(ivl=0, days_since_review=0, queue=3) == 0.5

    def test_just_reviewed_short_interval(self):
        """Card with interval 1, just reviewed → high retention."""
        r = estimate_retention_sm2(ivl=1, days_since_review=0, queue=2)
        assert 0.95 <= r <= 1.0

    def test_due_card_short_interval(self):
        """Card with interval 1, 1 day elapsed → ~85% (base retention)."""
        r = estimate_retention_sm2(ivl=1, days_since_review=1, queue=2)
        assert 0.83 <= r <= 0.88

    def test_not_due_long_interval(self):
        """Card with interval 30, 10 days elapsed → still high."""
        r = estimate_retention_sm2(ivl=30, days_since_review=10, queue=2)
        assert r >= 0.92

    def test_overdue_decays(self):
        """Card with interval 7, 21 days elapsed (3x overdue) → significant decay."""
        r = estimate_retention_sm2(ivl=7, days_since_review=21, queue=2)
        assert r < 0.5

    def test_long_interval_base_retention_higher(self):
        """Cards with longer intervals have higher base retention."""
        r_short = estimate_retention_sm2(ivl=1, days_since_review=1, queue=2)
        r_long = estimate_retention_sm2(ivl=30, days_since_review=30, queue=2)
        assert r_long > r_short

    def test_suspended_with_interval_uses_interval(self):
        """Suspended card with interval → estimate from interval (student knows it)."""
        r = estimate_retention_sm2(ivl=30, days_since_review=10, queue=-1)
        assert r >= 0.90

    def test_suspended_no_interval_returns_zero(self):
        """Suspended card with no interval → never learned."""
        r = estimate_retention_sm2(ivl=0, days_since_review=0, queue=-1)
        assert r == 0.0

    def test_returns_between_zero_and_one(self):
        """Retention is always in [0, 1]."""
        for ivl in [0, 1, 3, 7, 14, 21, 30, 60, 180]:
            for elapsed in [0, 1, 5, 10, 30, 90]:
                for q in [-2, -1, 0, 1, 2, 3]:
                    r = estimate_retention_sm2(ivl=ivl, days_since_review=elapsed, queue=q)
                    assert 0.0 <= r <= 1.0, f"ivl={ivl}, elapsed={elapsed}, q={q} → {r}"


class TestEstimateRetentionFsrs:
    """FSRS: precise retention from stability parameter."""

    def test_just_reviewed(self):
        """0 days elapsed → R ≈ 1.0."""
        r = estimate_retention_fsrs(stability=10.0, elapsed_days=0)
        assert r > 0.99

    def test_at_stability(self):
        """Elapsed == 9*S → R = 0.5 (by FSRS formula)."""
        r = estimate_retention_fsrs(stability=10.0, elapsed_days=90)
        assert abs(r - 0.5) < 0.01

    def test_half_stability(self):
        """Short elapsed → high retention."""
        r = estimate_retention_fsrs(stability=30.0, elapsed_days=15)
        assert r > 0.9

    def test_long_overdue(self):
        """Very overdue → low retention."""
        r = estimate_retention_fsrs(stability=5.0, elapsed_days=100)
        assert r < 0.1

    def test_zero_stability_returns_zero(self):
        r = estimate_retention_fsrs(stability=0.0, elapsed_days=5)
        assert r == 0.0

    def test_returns_between_zero_and_one(self):
        for s in [0.1, 1, 5, 10, 30, 100]:
            for e in [0, 1, 5, 10, 30, 90, 365]:
                r = estimate_retention_fsrs(stability=s, elapsed_days=e)
                assert 0.0 <= r <= 1.0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -k test_retrieval -v`

Expected: FAIL (module not found)

- [ ] **Step 3: Implement retrieval.py**

Create `ui/retrieval.py`:

```python
"""Retrieval probability calculations for mastery metric.

Provides two estimation methods:
- FSRS (precise): uses per-card stability parameter
- SM-2 (fallback): approximates from interval + elapsed time
"""

import math

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)


def estimate_retention_sm2(ivl, days_since_review, queue):
    """Estimate retrieval probability from SM-2 card state.

    Args:
        ivl: Current interval in days (0 for new/learning cards).
        days_since_review: Days since the card was last reviewed.
        queue: Anki queue type (0=new, 1=learning, 2=review, 3=day-learn,
               -1=suspended, -2=buried).

    Returns:
        float between 0.0 and 1.0.
    """
    # New cards: never seen
    if queue == 0:
        return 0.0

    # Learning / day-learn: partial knowledge
    if queue in (1, 3):
        return 0.5

    # Suspended / buried with no meaningful interval: unknown
    if queue in (-1, -2) and ivl <= 0:
        return 0.0

    # Review cards (queue 2) and suspended/buried with interval:
    # estimate from interval + elapsed time
    ivl = max(1, ivl)

    # Base retention scales with interval (longer interval = more stable memory)
    base_r = 0.85 + 0.10 * min(1.0, ivl / 30)

    if days_since_review <= ivl:
        # Not yet due — retention is between base_r and 1.0
        progress = days_since_review / ivl
        return base_r + (1.0 - base_r) * (1.0 - progress)
    else:
        # Overdue — exponential decay
        overdue_ratio = days_since_review / ivl
        return max(0.0, base_r * math.exp(-0.5 * (overdue_ratio - 1.0)))


def estimate_retention_fsrs(stability, elapsed_days):
    """Precise retrieval probability using FSRS formula.

    R = (1 + elapsed / (9 * S))^(-1)

    Args:
        stability: FSRS stability parameter (days until R drops to 90%).
        elapsed_days: Days since last review.

    Returns:
        float between 0.0 and 1.0.
    """
    if stability <= 0:
        return 0.0
    return (1.0 + elapsed_days / (9.0 * stability)) ** (-1.0)


def compute_deck_mastery(cards, today_day_number, fsrs_enabled=False):
    """Compute mastery score for a collection of cards.

    Args:
        cards: list of tuples (ivl, due, queue, data_json).
            ivl: interval in days.
            due: due day number (for review) or timestamp (for learning).
            queue: Anki queue type.
            data_json: JSON string from cards.data (contains FSRS params if enabled).
        today_day_number: Anki's day number for today.
        fsrs_enabled: whether the collection uses FSRS.

    Returns:
        float: mastery percentage (0-100).
    """
    if not cards:
        return 0.0

    import json

    total_r = 0.0
    count = 0

    for ivl, due, queue, data_json in cards:
        count += 1

        # Try FSRS first
        if fsrs_enabled and data_json and queue == 2:
            try:
                data = json.loads(data_json) if isinstance(data_json, str) else {}
                stability = data.get("s")
                if stability and stability > 0:
                    # For review cards: days_since_review = today - (due - ivl)
                    days_since = max(0, today_day_number - (due - ivl))
                    total_r += estimate_retention_fsrs(stability, days_since)
                    continue
            except (json.JSONDecodeError, TypeError, ValueError):
                pass

        # SM-2 fallback
        if queue == 0:
            total_r += 0.0
        elif queue in (1, 3):
            total_r += 0.5
        elif ivl <= 0 and queue in (-1, -2):
            total_r += 0.0
        else:
            days_since = max(0, today_day_number - (due - max(1, ivl)))
            total_r += estimate_retention_sm2(ivl, days_since, queue)

    return round(total_r / count * 100, 1) if count > 0 else 0.0
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -k test_retrieval -v`

Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add ui/retrieval.py tests/test_retrieval.py
git commit -m "feat(stats): add retrieval probability module (FSRS + SM-2)"
```

---

### Task 2: Tests for compute_deck_mastery

Add tests for the aggregation function that computes the deck-level mastery score.

**Files:**
- Modify: `tests/test_retrieval.py`

- [ ] **Step 1: Add tests**

Append to `tests/test_retrieval.py`:

```python
from ui.retrieval import compute_deck_mastery


class TestComputeDeckMastery:
    """Aggregate mastery across a deck of cards."""

    def test_empty_deck(self):
        assert compute_deck_mastery([], today_day_number=1000) == 0.0

    def test_all_new_cards(self):
        """All new → 0%."""
        cards = [(0, 1000, 0, None)] * 100  # (ivl, due, queue, data)
        assert compute_deck_mastery(cards, today_day_number=1000) == 0.0

    def test_all_recently_reviewed(self):
        """All cards just reviewed with interval 1 → high mastery."""
        # due = today + ivl (just reviewed today: due - ivl = today)
        cards = [(1, 1001, 2, None)] * 100
        m = compute_deck_mastery(cards, today_day_number=1000)
        assert m >= 90.0  # just reviewed, high retention

    def test_mix_of_new_and_reviewed(self):
        """50 new + 50 reviewed → ~50% of max."""
        cards = (
            [(0, 1000, 0, None)] * 50 +  # new
            [(10, 1010, 2, None)] * 50    # reviewed, not yet due
        )
        m = compute_deck_mastery(cards, today_day_number=1000)
        assert 40.0 <= m <= 50.0

    def test_overdue_cards_lower_mastery(self):
        """Overdue cards reduce mastery."""
        on_time = [(7, 1007, 2, None)] * 50  # due in 7 days
        overdue = [(7, 990, 2, None)] * 50   # due 10 days ago (17 days since review)
        m_on_time = compute_deck_mastery(on_time, today_day_number=1000)
        m_mixed = compute_deck_mastery(on_time + overdue, today_day_number=1000)
        assert m_mixed < m_on_time

    def test_fsrs_mode_uses_stability(self):
        """When FSRS enabled and data has stability, use FSRS formula."""
        import json
        data = json.dumps({"s": 30.0, "d": 5.0})
        cards = [(30, 1030, 2, data)] * 10  # just reviewed
        m = compute_deck_mastery(cards, today_day_number=1000, fsrs_enabled=True)
        assert m >= 90.0

    def test_fsrs_fallback_on_missing_data(self):
        """FSRS enabled but card has no stability → SM-2 fallback."""
        cards = [(10, 1010, 2, None)] * 10
        m = compute_deck_mastery(cards, today_day_number=1000, fsrs_enabled=True)
        assert m > 0  # should not crash, uses SM-2

    def test_result_between_0_and_100(self):
        cards = [
            (0, 1000, 0, None),
            (1, 1001, 2, None),
            (30, 1030, 2, None),
            (0, 1000, 1, None),
            (60, 900, 2, None),  # very overdue
        ]
        m = compute_deck_mastery(cards, today_day_number=1000)
        assert 0.0 <= m <= 100.0
```

- [ ] **Step 2: Run tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -k test_retrieval -v`

Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add tests/test_retrieval.py
git commit -m "test(stats): add compute_deck_mastery tests"
```

---

### Task 3: Replace `_compute_daily_mature_pct` with continuous weighting

Update the historical reconstruction function to use a continuous weighted score instead of binary mature/not-mature.

**Files:**
- Modify: `ui/bridge_stats.py:18-47`
- Modify: `tests/test_bridge_stats.py`

- [ ] **Step 1: Update test expectations**

The existing test expects old values. Update `tests/test_bridge_stats.py`:

```python
def test_compute_daily_mature_pct_basic():
    """Given review history, compute mastery per day (continuous weighting)."""
    revlog_rows = [
        (1, "2026-03-01", 25),  # 25/21 = 1.0 (capped)
        (2, "2026-03-01", 25),  # 1.0
        (3, "2026-03-01", 10),  # 10/21 = 0.476
        (4, "2026-03-01", 5),   # 5/21 = 0.238
        (5, "2026-03-01", 8),   # 8/21 = 0.381
        (6, "2026-03-01", 3),   # 3/21 = 0.143
        (7, "2026-03-02", 22),  # 1.0
        (3, "2026-03-02", 15),  # 15/21 = 0.714
        (8, "2026-03-03", 30),  # 1.0
        (5, "2026-03-03", 12),  # 12/21 = 0.571
    ]
    dates = ["2026-03-01", "2026-03-02", "2026-03-03"]
    total_cards = 10
    result = _compute_daily_mature_pct(revlog_rows, dates, total_cards)
    assert len(result) == 3
    # Day 1: (1.0 + 1.0 + 0.476 + 0.238 + 0.381 + 0.143) / 10 = 0.3238 → 32.4%
    assert 32.0 <= result[0] <= 33.0
    # Day 2: card 7 → 1.0, card 3 → 0.714 (replaces 0.476)
    # (1.0 + 1.0 + 0.714 + 0.238 + 0.381 + 0.143 + 1.0) / 10 = 0.4476 → 44.8%
    assert 44.0 <= result[1] <= 45.0
    # Day 3: card 8 → 1.0, card 5 → 0.571 (replaces 0.381)
    # (1.0 + 1.0 + 0.714 + 0.238 + 0.571 + 0.143 + 1.0 + 1.0) / 10 = 0.5666 → 56.7%
    assert 56.0 <= result[2] <= 57.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -k test_compute_daily_mature_pct_basic -v`

Expected: FAIL (old values don't match new ranges)

- [ ] **Step 3: Update `_compute_daily_mature_pct` in `bridge_stats.py`**

Replace lines 18-47:

```python
def _compute_daily_mature_pct(revlog_rows, dates, total_cards):
    """Reconstruct daily mastery from review history using continuous weighting.

    Each card contributes min(1.0, interval / 21) to the score.
    This gives a smooth curve instead of a binary mature/not-mature step.

    Args:
        revlog_rows: list of (card_id, date_str, interval) tuples from revlog.
        dates: ordered list of date strings to compute pct for.
        total_cards: total card count in collection.

    Returns:
        list of floats — one mastery percentage per date.
    """
    if total_cards == 0 or not dates:
        return [0.0] * len(dates)

    card_intervals = {}
    from collections import defaultdict
    reviews_by_date = defaultdict(list)
    for card_id, date_str, interval in revlog_rows:
        reviews_by_date[date_str].append((card_id, interval))

    result = []
    for d in dates:
        for card_id, interval in reviews_by_date.get(d, []):
            card_intervals[card_id] = interval
        weighted = sum(
            min(1.0, max(0, ivl) / 21)
            for ivl in card_intervals.values()
        )
        pct = round(weighted / total_cards * 100, 1)
        result.append(pct)

    return result
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -k test_bridge_stats -v`

Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add ui/bridge_stats.py tests/test_bridge_stats.py
git commit -m "feat(stats): continuous mastery weighting in historical reconstruction"
```

---

### Task 4: Update `current_pct` to use retrieval probability

Replace the binary mature/young counting for the live `current_pct` value with the new `compute_deck_mastery` function.

**Files:**
- Modify: `ui/bridge_stats.py` (in `get_trajectory_data` around line 117-132, and in `get_deck_trajectory` around line 293-306)

- [ ] **Step 1: Update `get_trajectory_data` current_pct calculation**

In `get_trajectory_data()`, replace the current_pct block (lines ~117-132):

```python
        # Current mastery using retrieval probability
        try:
            from .retrieval import compute_deck_mastery
        except ImportError:
            from ui.retrieval import compute_deck_mastery

        try:
            # Check if FSRS is enabled
            fsrs_enabled = False
            try:
                fsrs_enabled = mw.col.get_config("fsrs", False)
            except Exception:
                pass

            today_dn = mw.col.sched.today
            card_rows = mw.col.db.all(
                "SELECT ivl, due, queue, data FROM cards"
            )
            current_pct = compute_deck_mastery(card_rows, today_dn, fsrs_enabled)
            total = len(card_rows)
            mature = sum(1 for ivl, _, q, _ in card_rows if ivl >= 21 and q >= 0)
            young = sum(1 for ivl, _, q, _ in card_rows if 0 < ivl < 21 and q >= 0)
        except Exception as e:
            logger.warning("get_trajectory_data: mastery query failed: %s", e)
            current_pct = 0.0
            total = 0
            mature = 0
            young = 0
```

- [ ] **Step 2: Update `get_deck_trajectory` current_pct calculation**

In `get_deck_trajectory()`, replace the current_pct block (lines ~293-306):

```python
        # Current mastery using retrieval probability
        try:
            from .retrieval import compute_deck_mastery
        except ImportError:
            from ui.retrieval import compute_deck_mastery

        try:
            fsrs_enabled = False
            try:
                fsrs_enabled = mw.col.get_config("fsrs", False)
            except Exception:
                pass

            today_dn = mw.col.sched.today
            card_rows = mw.col.db.all(
                "SELECT ivl, due, queue, data FROM cards WHERE id IN %s"
                % card_in_clause
            )
            current_pct = compute_deck_mastery(card_rows, today_dn, fsrs_enabled)
            mature = sum(1 for ivl, _, q, _ in card_rows if ivl >= 21 and q >= 0)
            young = sum(1 for ivl, _, q, _ in card_rows if 0 < ivl < 21 and q >= 0)
        except Exception as e:
            logger.warning("get_deck_trajectory: mastery query failed: %s", e)
            current_pct = 0.0
            mature = 0
            young = 0
```

- [ ] **Step 3: Verify syntax**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -c "import ast; ast.parse(open('ui/bridge_stats.py').read()); print('OK')"`

Expected: `OK`

- [ ] **Step 4: Run all tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py 2>&1 | tail -5`

Expected: All retrieval + bridge_stats tests pass

- [ ] **Step 5: Commit**

```bash
git add ui/bridge_stats.py
git commit -m "feat(stats): use retrieval probability for live current_pct"
```

---

### Task 5: Add `getDeckMastery` bridge call

Add a dedicated bridge call that returns the current mastery score for a deck, including FSRS detection.

**Files:**
- Modify: `ui/bridge_stats.py` (append function)
- Modify: `ui/bridge.py` (add slot)
- Modify: `ui/widget.py` (register + add handler)

- [ ] **Step 1: Add `get_deck_mastery` to `bridge_stats.py`**

Append to `bridge_stats.py`:

```python
def get_deck_mastery(deck_id_str):
    """Compute current retrieval-based mastery for a specific deck.

    Args:
        deck_id_str: deck ID as string.

    Returns:
        dict with keys:
          - mastery: float (0-100)
          - totalCards: int
          - isFsrs: bool
    """
    try:
        from ..utils.anki import run_on_main_thread
    except ImportError:
        from utils.anki import run_on_main_thread

    try:
        from .retrieval import compute_deck_mastery
    except ImportError:
        from ui.retrieval import compute_deck_mastery

    def _collect():
        from aqt import mw

        if mw is None or mw.col is None:
            return {"error": "No collection"}

        did = int(deck_id_str)
        deck = mw.col.decks.get(did)
        if deck is None:
            return {"error": "Deck not found"}

        deck_name = deck["name"]
        all_decks = mw.col.decks.all()
        prefix = deck_name + "::"
        all_dids = [did]
        for d in all_decks:
            if d["name"].startswith(prefix):
                all_dids.append(d["id"])

        did_clause = _sql_in(all_dids)

        fsrs_enabled = False
        try:
            fsrs_enabled = mw.col.get_config("fsrs", False)
        except Exception:
            pass

        today_dn = mw.col.sched.today
        card_rows = mw.col.db.all(
            "SELECT ivl, due, queue, data FROM cards WHERE did IN %s" % did_clause
        )

        mastery = compute_deck_mastery(card_rows, today_dn, fsrs_enabled)

        return {
            "mastery": mastery,
            "totalCards": len(card_rows),
            "isFsrs": fsrs_enabled,
        }

    try:
        return run_on_main_thread(_collect, timeout=9)
    except Exception as e:
        logger.exception("get_deck_mastery failed: %s", e)
        return {"error": str(e)}
```

- [ ] **Step 2: Add `getDeckMastery` slot to `bridge.py`**

After the existing `getDeckSessionSuggestion` method:

```python
    @pyqtSlot(str, result=str)
    def getDeckMastery(self, deck_id_str):
        """Return current retrieval-based mastery for a specific deck."""
        try:
            try:
                from .bridge_stats import get_deck_mastery
            except ImportError:
                from ui.bridge_stats import get_deck_mastery
            result = get_deck_mastery(deck_id_str)
            return json.dumps(result)
        except Exception as e:
            logger.exception("getDeckMastery error: %s", e)
            return json.dumps({"error": str(e)})
```

- [ ] **Step 3: Register handler in `widget.py`**

Add to handler dict:

```python
            'getDeckMastery': self._msg_get_deck_mastery,
```

Add handler method:

```python
    def _msg_get_deck_mastery(self, data=None):
        """Fetch deck mastery and send to frontend."""
        deck_id = data.get("deckId") if data else None
        if not deck_id:
            self._send_to_frontend("deckMastery", {"error": "No deckId"})
            return
        result = self.bridge.getDeckMastery(str(deck_id))
        try:
            parsed = json.loads(result)
        except (json.JSONDecodeError, TypeError) as e:
            logger.warning("Failed to parse getDeckMastery response: %s", e)
            parsed = {"error": "Parse error"}
        self._send_to_frontend("deckMastery", parsed)
```

- [ ] **Step 4: Verify syntax**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -c "import ast; ast.parse(open('ui/bridge_stats.py').read()); ast.parse(open('ui/bridge.py').read()); ast.parse(open('ui/widget.py').read()); print('OK')"`

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add ui/bridge_stats.py ui/bridge.py ui/widget.py
git commit -m "feat(stats): add getDeckMastery bridge call with FSRS detection"
```

---

### Task 6: Frontend build and integration test

Verify the frontend still builds and all tests pass. The frontend doesn't need code changes — `useTrajectoryModel` reads `mature_pct` from the data, which is now computed differently on the backend but has the same field name and type.

**Files:**
- No changes needed

- [ ] **Step 1: Run Python tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py 2>&1 | tail -10`

Expected: All tests pass (retrieval + bridge_stats + existing)

- [ ] **Step 2: Run frontend tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npx vitest run 2>&1 | tail -5`

Expected: All pass

- [ ] **Step 3: Build frontend**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build 2>&1 | tail -3`

Expected: Clean build

- [ ] **Step 4: Commit build if needed**

```bash
git add web/
git commit -m "chore(stats): rebuild frontend with retrieval mastery backend"
```
