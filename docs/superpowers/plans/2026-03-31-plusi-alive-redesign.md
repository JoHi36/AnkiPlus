# Plusi Alive — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Plusi's JSON-bureaucracy system with a living, tool-based agent using Claude Sonnet, embedding-based memory, event-driven subscriptions, and output-as-tool.

**Architecture:** Plusi becomes a standard Anthropic tool-use agent. SOUL prompt (~60 lines) + 20 tools + embedding memory. No JSON prefix, no integrity scores, no friendship points. Event bus emits events, subscriptions fire instantly (L1 programmatic check), heartbeat every 30min. Output is a tool (`nachricht()`), silence is the default.

**Tech Stack:** Claude Sonnet via Anthropic Messages API (tool_use), Gemini Embeddings (text-embedding-004), SQLite WAL, QTimer for heartbeat/idle, OpenRouter for Perplexity.

**Spec:** `docs/superpowers/specs/2026-03-31-plusi-alive-redesign.md`

---

## File Structure

### New Files

| File | Responsibility |
|---|---|
| `plusi/soul.py` | SOUL prompt constant + prompt builder (inject recall) |
| `plusi/memory.py` | Embedding-based memory: store, recall, forget, passive retrieval |
| `plusi/tools.py` | 20 Plusi tool definitions (Anthropic tool_use format) |
| `plusi/subscriptions.py` | Subscription CRUD, condition DSL parsing, matching |
| `plusi/heartbeat.py` | QTimer-based heartbeat, L1/L2, budget check |
| `plusi/budget.py` | Daily wake-up cap tracking |
| `plusi/event_bus.py` | Central event emitter + subscription matcher |
| `plusi/anthropic_loop.py` | Anthropic Messages API agent loop with tool execution |
| `tests/test_plusi_memory.py` | Memory system tests |
| `tests/test_plusi_subscriptions.py` | Subscription + condition parsing tests |
| `tests/test_plusi_budget.py` | Budget tracking tests |
| `tests/test_plusi_event_bus.py` | Event bus + matching tests |
| `tests/test_plusi_anthropic_loop.py` | Agent loop tests |
| `tests/test_plusi_soul.py` | Prompt builder tests |

### Modified Files

| File | Change |
|---|---|
| `plusi/agent.py` | Rewrite: new entry point using `anthropic_loop`, `~mood` parsing |
| `plusi/storage.py` | Strip integrity/drives/friendship/dreams, add new tables |
| `__init__.py` | Init event bus, replace reflect timer with heartbeat |
| `ui/widget.py` | Replace plusi wake timer, add event emissions, handle `nachricht` tool |
| `ui/bridge.py` | Add event emissions at deck/card/state change slots |
| `frontend/src/components/PlusiWidget.jsx` | Adapt to `~mood` + `nachricht` events |

---

## Task 1: Database Schema & Migration

**Files:**
- Modify: `plusi/storage.py`
- Test: `tests/test_plusi_memory.py`

- [ ] **Step 1: Write failing test for new memory table**

```python
# tests/test_plusi_memory.py
import sqlite3
import os
import sys
import tempfile

# Mock aqt before any addon imports
sys.modules['aqt'] = type(sys)('aqt')
sys.modules['aqt.qt'] = type(sys)('aqt.qt')

def test_memory_table_exists():
    """plusi_memories table should be created on init."""
    from plusi.memory import PlusiMemory
    
    with tempfile.TemporaryDirectory() as tmp:
        mem = PlusiMemory(db_path=os.path.join(tmp, 'test.db'))
        cursor = mem.db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='plusi_memories'"
        )
        assert cursor.fetchone() is not None

def test_store_and_retrieve_by_id():
    """Should store a memory and retrieve it by ID."""
    from plusi.memory import PlusiMemory
    
    with tempfile.TemporaryDirectory() as tmp:
        mem = PlusiMemory(db_path=os.path.join(tmp, 'test.db'))
        mid = mem.store("Physikum ist morgen", embedding=b'\x00' * 12, mood='worried')
        result = mem.get(mid)
        assert result is not None
        assert result['text'] == "Physikum ist morgen"
        assert result['mood'] == 'worried'

def test_forget():
    """Should delete a memory by ID."""
    from plusi.memory import PlusiMemory
    
    with tempfile.TemporaryDirectory() as tmp:
        mem = PlusiMemory(db_path=os.path.join(tmp, 'test.db'))
        mid = mem.store("temporary thought", embedding=b'\x00' * 12)
        mem.forget(mid)
        assert mem.get(mid) is None

def test_subscription_table_exists():
    """plusi_subscriptions table should be created on init."""
    from plusi.memory import PlusiMemory
    
    with tempfile.TemporaryDirectory() as tmp:
        mem = PlusiMemory(db_path=os.path.join(tmp, 'test.db'))
        cursor = mem.db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='plusi_subscriptions'"
        )
        assert cursor.fetchone() is not None

def test_budget_table_exists():
    """plusi_budget table should be created on init."""
    from plusi.memory import PlusiMemory
    
    with tempfile.TemporaryDirectory() as tmp:
        mem = PlusiMemory(db_path=os.path.join(tmp, 'test.db'))
        cursor = mem.db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='plusi_budget'"
        )
        assert cursor.fetchone() is not None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -m pytest tests/test_plusi_memory.py -v`
Expected: FAIL — `plusi.memory` module does not exist

- [ ] **Step 3: Create `plusi/memory.py` with schema init**

```python
# plusi/memory.py
"""Plusi memory system — embedding-based, tool-accessible."""
import sqlite3
import json
import os
from datetime import datetime

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)


class PlusiMemory:
    """Manages Plusi's memory, diary, subscriptions, and budget tables."""

    def __init__(self, db_path=None):
        if db_path is None:
            db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'plusi.db')
        self.db_path = db_path
        self.db = sqlite3.connect(db_path, check_same_thread=False)
        self.db.execute("PRAGMA journal_mode=WAL")
        self._init_tables()

    def _init_tables(self):
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS plusi_memories (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                text         TEXT NOT NULL,
                embedding    BLOB NOT NULL,
                created_at   TEXT NOT NULL DEFAULT (datetime('now')),
                accessed_at  TEXT,
                access_count INTEGER DEFAULT 0,
                mood         TEXT,
                source       TEXT DEFAULT 'chat'
            );
            CREATE INDEX IF NOT EXISTS idx_plusi_mem_created
                ON plusi_memories(created_at DESC);

            CREATE TABLE IF NOT EXISTS plusi_diary (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp  TEXT NOT NULL DEFAULT (datetime('now')),
                entry_text TEXT NOT NULL,
                mood       TEXT NOT NULL DEFAULT 'neutral'
            );
            CREATE INDEX IF NOT EXISTS idx_plusi_diary_time
                ON plusi_diary(timestamp DESC);

            CREATE TABLE IF NOT EXISTS plusi_subscriptions (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                name            TEXT NOT NULL UNIQUE,
                event           TEXT NOT NULL,
                condition_raw   TEXT NOT NULL,
                condition_parsed TEXT NOT NULL,
                wake_prompt     TEXT NOT NULL,
                created_at      TEXT NOT NULL DEFAULT (datetime('now')),
                fire_count      INTEGER DEFAULT 0,
                last_fired_at   TEXT,
                active          INTEGER DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS plusi_budget (
                date     TEXT PRIMARY KEY,
                wake_ups INTEGER DEFAULT 0,
                cap      INTEGER DEFAULT 20
            );

            CREATE TABLE IF NOT EXISTS plusi_history (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp  TEXT NOT NULL,
                context    TEXT NOT NULL,
                response   TEXT NOT NULL,
                mood       TEXT NOT NULL DEFAULT 'neutral',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_plusi_hist_time
                ON plusi_history(timestamp DESC);
        """)
        self.db.commit()

    # ── Memory CRUD ──────────────────────────────────────────────

    def store(self, text, embedding, mood=None, source='chat'):
        cursor = self.db.execute(
            "INSERT INTO plusi_memories (text, embedding, mood, source, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (text, embedding, mood, source, datetime.now().isoformat())
        )
        self.db.commit()
        return cursor.lastrowid

    def get(self, memory_id):
        row = self.db.execute(
            "SELECT id, text, embedding, created_at, accessed_at, access_count, mood, source "
            "FROM plusi_memories WHERE id = ?", (memory_id,)
        ).fetchone()
        if not row:
            return None
        return {
            'id': row[0], 'text': row[1], 'embedding': row[2],
            'created_at': row[3], 'accessed_at': row[4],
            'access_count': row[5], 'mood': row[6], 'source': row[7],
        }

    def forget(self, memory_id):
        self.db.execute("DELETE FROM plusi_memories WHERE id = ?", (memory_id,))
        self.db.commit()

    def all_memories(self):
        rows = self.db.execute(
            "SELECT id, text, embedding, created_at, accessed_at, access_count, mood "
            "FROM plusi_memories ORDER BY created_at DESC"
        ).fetchall()
        return [{
            'id': r[0], 'text': r[1], 'embedding': r[2], 'created_at': r[3],
            'accessed_at': r[4], 'access_count': r[5], 'mood': r[6],
        } for r in rows]

    def update_access(self, memory_id):
        self.db.execute(
            "UPDATE plusi_memories SET accessed_at = ?, access_count = access_count + 1 "
            "WHERE id = ?", (datetime.now().isoformat(), memory_id)
        )
        self.db.commit()

    # ── History ──────────────────────────────────────────────────

    def save_interaction(self, context, response, mood='neutral'):
        self.db.execute(
            "INSERT INTO plusi_history (timestamp, context, response, mood) VALUES (?, ?, ?, ?)",
            (datetime.now().isoformat(), context, response, mood)
        )
        self.db.commit()

    def load_history(self, limit=10):
        rows = self.db.execute(
            "SELECT context, response FROM plusi_history ORDER BY timestamp DESC LIMIT ?",
            (limit,)
        ).fetchall()
        rows.reverse()
        history = []
        for context, response in rows:
            history.append({"role": "user", "content": context})
            history.append({"role": "assistant", "content": response})
        return history

    # ── Diary ────────────────────────────────────────────────────

    def save_diary(self, text, mood='neutral'):
        self.db.execute(
            "INSERT INTO plusi_diary (timestamp, entry_text, mood) VALUES (?, ?, ?)",
            (datetime.now().isoformat(), text, mood)
        )
        self.db.commit()

    def load_diary(self, limit=50):
        rows = self.db.execute(
            "SELECT id, timestamp, entry_text, mood FROM plusi_diary "
            "ORDER BY timestamp DESC LIMIT ?", (limit,)
        ).fetchall()
        return [{'id': r[0], 'timestamp': r[1], 'text': r[2], 'mood': r[3]} for r in rows]
```

- [ ] **Step 4: Run tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -m pytest tests/test_plusi_memory.py -v`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add plusi/memory.py tests/test_plusi_memory.py
git commit -m "feat(plusi): new memory system with embedding table, diary, subscriptions, budget schema"
```

---

## Task 2: Subscription Condition Parser

**Files:**
- Create: `plusi/subscriptions.py`
- Test: `tests/test_plusi_subscriptions.py`

- [ ] **Step 1: Write failing tests for condition parsing**

```python
# tests/test_plusi_subscriptions.py
import sys
sys.modules['aqt'] = type(sys)('aqt')
sys.modules['aqt.qt'] = type(sys)('aqt.qt')

from plusi.subscriptions import parse_condition, CountCondition, CountWithinCondition, \
    StreakCondition, AccuracyCondition, IdleCondition, TimeCondition, ContainsCondition


def test_count_parse():
    c = parse_condition("count(5)")
    assert isinstance(c, CountCondition)
    assert c.n == 5

def test_count_within_parse():
    c = parse_condition("count(10, within=5m)")
    assert isinstance(c, CountWithinCondition)
    assert c.n == 10
    assert c.minutes == 5

def test_streak_parse():
    c = parse_condition("streak(3)")
    assert isinstance(c, StreakCondition)
    assert c.n == 3

def test_accuracy_below_parse():
    c = parse_condition("accuracy_below(40)")
    assert isinstance(c, AccuracyCondition)
    assert c.threshold == 40

def test_idle_parse():
    c = parse_condition("idle(120)")
    assert isinstance(c, IdleCondition)
    assert c.minutes == 120

def test_time_parse():
    c = parse_condition("time(22:00-06:00)")
    assert isinstance(c, TimeCondition)
    assert c.start == "22:00"
    assert c.end == "06:00"

def test_contains_parse():
    c = parse_condition("contains(Anatomie)")
    assert isinstance(c, ContainsCondition)
    assert c.text == "Anatomie"

def test_invalid_returns_none():
    assert parse_condition("vibes are off") is None
    assert parse_condition("") is None
    assert parse_condition("count()") is None

def test_count_evaluate():
    c = CountCondition(3)
    events = [{"type": "card_reviewed"}] * 2
    assert c.evaluate(events, "card_reviewed") is False
    events.append({"type": "card_reviewed"})
    assert c.evaluate(events, "card_reviewed") is True

def test_contains_evaluate():
    c = ContainsCondition("Anatomie")
    event = {"type": "deck_opened", "payload": {"deck_name": "Anatomie::Neuro"}}
    assert c.evaluate_event(event) is True
    event2 = {"type": "deck_opened", "payload": {"deck_name": "Biochemie"}}
    assert c.evaluate_event(event2) is False
```

- [ ] **Step 2: Run to verify failure**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -m pytest tests/test_plusi_subscriptions.py -v`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `plusi/subscriptions.py`**

```python
# plusi/subscriptions.py
"""Subscription condition DSL — template-based with error feedback."""
import re
import json
from datetime import datetime, timedelta
from dataclasses import dataclass
from typing import Optional, List, Dict, Any

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)


# ── Condition classes ────────────────────────────────────────────

@dataclass
class CountCondition:
    n: int

    def evaluate(self, events: list, event_type: str) -> bool:
        matching = [e for e in events if e.get('type') == event_type]
        return len(matching) >= self.n

    def to_json(self):
        return json.dumps({"type": "count", "n": self.n})


@dataclass
class CountWithinCondition:
    n: int
    minutes: int

    def evaluate(self, events: list, event_type: str) -> bool:
        cutoff = (datetime.now() - timedelta(minutes=self.minutes)).isoformat()
        matching = [e for e in events
                    if e.get('type') == event_type and e.get('timestamp', '') >= cutoff]
        return len(matching) >= self.n

    def to_json(self):
        return json.dumps({"type": "count_within", "n": self.n, "minutes": self.minutes})


@dataclass
class StreakCondition:
    n: int

    def evaluate(self, events: list, event_type: str) -> bool:
        streak = 0
        for e in reversed(events):
            if e.get('type') == event_type:
                streak += 1
                if streak >= self.n:
                    return True
            else:
                streak = 0
        return False

    def to_json(self):
        return json.dumps({"type": "streak", "n": self.n})


@dataclass
class AccuracyCondition:
    threshold: int

    def evaluate(self, events: list, event_type: str) -> bool:
        reviews = [e for e in events if e.get('type') == 'card_reviewed'][-10:]
        if len(reviews) < 3:
            return False
        correct = sum(1 for e in reviews if e.get('payload', {}).get('correct', False))
        accuracy = (correct / len(reviews)) * 100
        return accuracy < self.threshold

    def to_json(self):
        return json.dumps({"type": "accuracy_below", "threshold": self.threshold})


@dataclass
class IdleCondition:
    minutes: int

    def evaluate(self, events: list, event_type: str) -> bool:
        if not events:
            return True
        last = events[-1].get('timestamp', '')
        if not last:
            return False
        try:
            last_dt = datetime.fromisoformat(last)
            return (datetime.now() - last_dt).total_seconds() / 60 >= self.minutes
        except (ValueError, TypeError):
            return False

    def to_json(self):
        return json.dumps({"type": "idle", "minutes": self.minutes})


@dataclass
class TimeCondition:
    start: str
    end: str

    def evaluate(self, events: list, event_type: str) -> bool:
        now = datetime.now().strftime("%H:%M")
        if self.start <= self.end:
            return self.start <= now <= self.end
        else:
            return now >= self.start or now <= self.end

    def to_json(self):
        return json.dumps({"type": "time", "start": self.start, "end": self.end})


@dataclass
class ContainsCondition:
    text: str

    def evaluate(self, events: list, event_type: str) -> bool:
        for e in events:
            if e.get('type') == event_type and self.evaluate_event(e):
                return True
        return False

    def evaluate_event(self, event: dict) -> bool:
        payload = event.get('payload', {})
        return any(self.text.lower() in str(v).lower() for v in payload.values())

    def to_json(self):
        return json.dumps({"type": "contains", "text": self.text})


# ── Parser ───────────────────────────────────────────────────────

CONDITION_PATTERNS = [
    (r'count\((\d+),\s*within=(\d+)m\)',
     lambda m: CountWithinCondition(int(m.group(1)), int(m.group(2)))),
    (r'count\((\d+)\)',
     lambda m: CountCondition(int(m.group(1)))),
    (r'streak\((\d+)\)',
     lambda m: StreakCondition(int(m.group(1)))),
    (r'accuracy_below\((\d+)\)',
     lambda m: AccuracyCondition(int(m.group(1)))),
    (r'idle\((\d+)\)',
     lambda m: IdleCondition(int(m.group(1)))),
    (r'time\((\d{2}:\d{2})-(\d{2}:\d{2})\)',
     lambda m: TimeCondition(m.group(1), m.group(2))),
    (r'contains\((.+)\)',
     lambda m: ContainsCondition(m.group(1).strip())),
]

AVAILABLE_TEMPLATES = [
    "count(N)", "count(N, within=Xm)", "streak(N)",
    "accuracy_below(X)", "idle(Xm)", "time(HH:MM-HH:MM)",
    "contains(text)",
]


def parse_condition(raw: str) -> Optional[Any]:
    """Parse a condition string into a Condition object. Returns None on failure."""
    raw = raw.strip()
    if not raw:
        return None
    for pattern, factory in CONDITION_PATTERNS:
        match = re.fullmatch(pattern, raw)
        if match:
            return factory(match)
    return None
```

- [ ] **Step 4: Run tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -m pytest tests/test_plusi_subscriptions.py -v`
Expected: PASS (all 12 tests)

- [ ] **Step 5: Commit**

```bash
git add plusi/subscriptions.py tests/test_plusi_subscriptions.py
git commit -m "feat(plusi): subscription condition DSL parser with 7 templates"
```

---

## Task 3: Budget Tracking

**Files:**
- Create: `plusi/budget.py`
- Test: `tests/test_plusi_budget.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_plusi_budget.py
import sys
import os
import tempfile
sys.modules['aqt'] = type(sys)('aqt')
sys.modules['aqt.qt'] = type(sys)('aqt.qt')

from plusi.budget import PlusicBudget


def test_initial_budget():
    with tempfile.TemporaryDirectory() as tmp:
        b = PlusicBudget(db_path=os.path.join(tmp, 'test.db'))
        assert b.remaining() == 20
        assert b.can_wake() is True

def test_spend_wakeup():
    with tempfile.TemporaryDirectory() as tmp:
        b = PlusicBudget(db_path=os.path.join(tmp, 'test.db'))
        b.spend()
        assert b.remaining() == 19

def test_budget_exhausted():
    with tempfile.TemporaryDirectory() as tmp:
        b = PlusicBudget(db_path=os.path.join(tmp, 'test.db'), default_cap=3)
        b.spend()
        b.spend()
        b.spend()
        assert b.can_wake() is False
        assert b.remaining() == 0

def test_budget_resets_daily():
    with tempfile.TemporaryDirectory() as tmp:
        b = PlusicBudget(db_path=os.path.join(tmp, 'test.db'))
        b.spend()
        # Simulate date change
        b.db.execute("UPDATE plusi_budget SET date = '2020-01-01'")
        b.db.commit()
        assert b.remaining() == 20  # Reset

def test_get_status():
    with tempfile.TemporaryDirectory() as tmp:
        b = PlusicBudget(db_path=os.path.join(tmp, 'test.db'), default_cap=20)
        b.spend()
        b.spend()
        status = b.status()
        assert status['used'] == 2
        assert status['cap'] == 20
        assert status['remaining'] == 18
```

- [ ] **Step 2: Run to verify failure**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -m pytest tests/test_plusi_budget.py -v`
Expected: FAIL

- [ ] **Step 3: Implement `plusi/budget.py`**

```python
# plusi/budget.py
"""Daily wake-up budget for Plusi's autonomous actions."""
import sqlite3
import os
from datetime import date

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)


class PlusicBudget:
    def __init__(self, db_path=None, default_cap=20):
        if db_path is None:
            db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'plusi.db')
        self.db = sqlite3.connect(db_path, check_same_thread=False)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.default_cap = default_cap
        self.db.execute("""
            CREATE TABLE IF NOT EXISTS plusi_budget (
                date     TEXT PRIMARY KEY,
                wake_ups INTEGER DEFAULT 0,
                cap      INTEGER DEFAULT 20
            )
        """)
        self.db.commit()

    def _today(self):
        return date.today().isoformat()

    def _ensure_today(self):
        today = self._today()
        self.db.execute(
            "INSERT OR IGNORE INTO plusi_budget (date, wake_ups, cap) VALUES (?, 0, ?)",
            (today, self.default_cap)
        )
        self.db.commit()
        return today

    def remaining(self):
        today = self._ensure_today()
        row = self.db.execute(
            "SELECT cap - wake_ups FROM plusi_budget WHERE date = ?", (today,)
        ).fetchone()
        return max(0, row[0]) if row else self.default_cap

    def can_wake(self):
        return self.remaining() > 0

    def spend(self):
        today = self._ensure_today()
        self.db.execute(
            "UPDATE plusi_budget SET wake_ups = wake_ups + 1 WHERE date = ?", (today,)
        )
        self.db.commit()
        logger.info("plusi budget: spent 1 wake-up, %d remaining", self.remaining())

    def status(self):
        today = self._ensure_today()
        row = self.db.execute(
            "SELECT wake_ups, cap FROM plusi_budget WHERE date = ?", (today,)
        ).fetchone()
        used, cap = row if row else (0, self.default_cap)
        return {'used': used, 'cap': cap, 'remaining': max(0, cap - used), 'date': today}
```

- [ ] **Step 4: Run tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -m pytest tests/test_plusi_budget.py -v`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add plusi/budget.py tests/test_plusi_budget.py
git commit -m "feat(plusi): daily wake-up budget tracker"
```

---

## Task 4: Event Bus

**Files:**
- Create: `plusi/event_bus.py`
- Test: `tests/test_plusi_event_bus.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_plusi_event_bus.py
import sys
import os
import tempfile
sys.modules['aqt'] = type(sys)('aqt')
sys.modules['aqt.qt'] = type(sys)('aqt.qt')

from plusi.event_bus import EventBus
from plusi.subscriptions import CountCondition


def test_emit_stores_event():
    bus = EventBus()
    bus.emit("card_reviewed", {"card_id": 1, "correct": True})
    assert len(bus.event_log) == 1
    assert bus.event_log[0]["type"] == "card_reviewed"

def test_event_log_rolling():
    bus = EventBus(max_log=5)
    for i in range(10):
        bus.emit("card_reviewed", {"card_id": i})
    assert len(bus.event_log) == 5
    assert bus.event_log[0]["payload"]["card_id"] == 5

def test_subscription_match():
    bus = EventBus()
    triggered = []
    bus.on_subscription_fired = lambda sub, event: triggered.append(sub['name'])
    
    bus.add_subscription({
        'name': 'test_trigger',
        'event': 'card_reviewed',
        'condition': CountCondition(3),
        'wake_prompt': 'Test prompt',
    })
    
    bus.emit("card_reviewed", {})
    bus.emit("card_reviewed", {})
    assert len(triggered) == 0
    
    bus.emit("card_reviewed", {})
    assert len(triggered) == 1
    assert triggered[0] == 'test_trigger'

def test_subscription_wrong_event_no_match():
    bus = EventBus()
    triggered = []
    bus.on_subscription_fired = lambda sub, event: triggered.append(sub['name'])
    
    bus.add_subscription({
        'name': 'deck_watcher',
        'event': 'deck_opened',
        'condition': CountCondition(1),
        'wake_prompt': 'Deck opened',
    })
    
    bus.emit("card_reviewed", {})
    assert len(triggered) == 0

def test_list_available_events():
    bus = EventBus()
    events = bus.available_events()
    assert 'card_reviewed' in [e['event'] for cat in events.values() for e in cat]
```

- [ ] **Step 2: Run to verify failure**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -m pytest tests/test_plusi_event_bus.py -v`
Expected: FAIL

- [ ] **Step 3: Implement `plusi/event_bus.py`**

```python
# plusi/event_bus.py
"""Central event bus with Plusi subscription matching."""
from datetime import datetime
from typing import Optional, Callable, Dict, List, Any

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

# ── Event catalog ────────────────────────────────────────────────

EVENT_CATALOG = {
    "lernen": [
        {"event": "card_reviewed", "description": "User hat eine Karte bewertet",
         "payload": ["card_id", "deck_name", "correct", "ease"]},
        {"event": "session_started", "description": "User startet eine Lernsession",
         "payload": ["deck_id", "deck_name"]},
        {"event": "session_ended", "description": "Lernsession beendet",
         "payload": ["deck_name", "cards_reviewed", "accuracy", "duration_min"]},
        {"event": "card_struggled", "description": "User scheitert wiederholt an einer Karte",
         "payload": ["card_id", "deck_name", "consecutive_wrong"]},
    ],
    "navigation": [
        {"event": "deck_opened", "description": "User oeffnet ein Deck",
         "payload": ["deck_id", "deck_name"]},
        {"event": "app_opened", "description": "Anki gestartet",
         "payload": ["time_of_day"]},
        {"event": "state_changed", "description": "App-Zustand wechselt",
         "payload": ["from_state", "to_state"]},
    ],
    "aktivitaet": [
        {"event": "app_idle", "description": "Keine Aktivitaet seit X Minuten",
         "payload": ["idle_minutes"]},
        {"event": "milestone", "description": "Lern-Meilenstein erreicht",
         "payload": ["type", "value"]},
    ],
    "kommunikation": [
        {"event": "user_message", "description": "User schreibt im Chat",
         "payload": ["text", "channel"]},
    ],
    "zeit": [
        {"event": "time_trigger", "description": "Bestimmte Uhrzeit erreicht",
         "payload": ["hour", "minute"]},
    ],
}

ALL_EVENTS = {e['event'] for cat in EVENT_CATALOG.values() for e in cat}


class EventBus:
    """Central event bus. Emits events, matches against Plusi subscriptions."""

    _instance = None

    def __init__(self, max_log=500):
        self.event_log: List[Dict] = []
        self.max_log = max_log
        self._subscriptions: List[Dict] = []
        self.on_subscription_fired: Optional[Callable] = None
        self._last_activity = datetime.now()

    @classmethod
    def get(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def emit(self, event_type: str, payload: Optional[Dict] = None):
        event = {
            "type": event_type,
            "payload": payload or {},
            "timestamp": datetime.now().isoformat(),
        }
        self.event_log.append(event)
        if len(self.event_log) > self.max_log:
            self.event_log = self.event_log[-self.max_log:]

        self._last_activity = datetime.now()

        # L1: Match subscriptions (programmatic, 0 tokens)
        for sub in self._subscriptions:
            if sub['event'] != event_type:
                continue
            if sub['condition'].evaluate(self.event_log, event_type):
                logger.info("subscription '%s' fired on event '%s'", sub['name'], event_type)
                if self.on_subscription_fired:
                    self.on_subscription_fired(sub, event)
                # Reset relevant events after firing to prevent re-triggering
                self.event_log = [e for e in self.event_log if e['type'] != event_type]

    def add_subscription(self, sub: Dict):
        self._subscriptions = [s for s in self._subscriptions if s['name'] != sub['name']]
        self._subscriptions.append(sub)

    def remove_subscription(self, name: str) -> bool:
        before = len(self._subscriptions)
        self._subscriptions = [s for s in self._subscriptions if s['name'] != name]
        return len(self._subscriptions) < before

    def list_subscriptions(self) -> List[Dict]:
        return [{'name': s['name'], 'event': s['event'],
                 'condition': str(s['condition']), 'prompt': s['wake_prompt']}
                for s in self._subscriptions]

    def available_events(self) -> Dict:
        return EVENT_CATALOG

    def last_activity_time(self) -> datetime:
        return self._last_activity

    def idle_minutes(self) -> float:
        return (datetime.now() - self._last_activity).total_seconds() / 60
```

- [ ] **Step 4: Run tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -m pytest tests/test_plusi_event_bus.py -v`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add plusi/event_bus.py tests/test_plusi_event_bus.py
git commit -m "feat(plusi): event bus with subscription matching and event catalog"
```

---

## Task 5: Memory Recall (Embedding Search)

**Files:**
- Modify: `plusi/memory.py`
- Test: `tests/test_plusi_memory.py` (add tests)

- [ ] **Step 1: Write failing tests for recall**

Add to `tests/test_plusi_memory.py`:

```python
import struct

def _fake_embedding(values):
    """Create a fake embedding blob from a list of floats."""
    return struct.pack(f'{len(values)}f', *values)

def test_recall_returns_most_similar():
    from plusi.memory import PlusiMemory
    
    with tempfile.TemporaryDirectory() as tmp:
        mem = PlusiMemory(db_path=os.path.join(tmp, 'test.db'))
        # Store 3 memories with distinct embeddings
        mem.store("about cats", embedding=_fake_embedding([1.0, 0.0, 0.0]))
        mem.store("about dogs", embedding=_fake_embedding([0.9, 0.1, 0.0]))
        mem.store("about math", embedding=_fake_embedding([0.0, 0.0, 1.0]))
        
        # Query similar to cats/dogs
        results = mem.recall(_fake_embedding([0.95, 0.05, 0.0]), limit=2)
        assert len(results) == 2
        texts = [r['text'] for r in results]
        assert "about cats" in texts
        assert "about dogs" in texts

def test_recall_updates_access_count():
    from plusi.memory import PlusiMemory
    
    with tempfile.TemporaryDirectory() as tmp:
        mem = PlusiMemory(db_path=os.path.join(tmp, 'test.db'))
        mid = mem.store("remember this", embedding=_fake_embedding([1.0, 0.0]))
        
        mem.recall(_fake_embedding([1.0, 0.0]), limit=5)
        
        row = mem.get(mid)
        assert row['access_count'] == 1
        assert row['accessed_at'] is not None

def test_recall_empty_returns_empty():
    from plusi.memory import PlusiMemory
    
    with tempfile.TemporaryDirectory() as tmp:
        mem = PlusiMemory(db_path=os.path.join(tmp, 'test.db'))
        results = mem.recall(_fake_embedding([1.0, 0.0]), limit=5)
        assert results == []
```

- [ ] **Step 2: Run to verify failure**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -m pytest tests/test_plusi_memory.py::test_recall_returns_most_similar -v`
Expected: FAIL — `recall` method doesn't exist

- [ ] **Step 3: Add `recall()` to `plusi/memory.py`**

Add these methods to the `PlusiMemory` class:

```python
    # ── Recall (Embedding Search) ────────────────────────────────

    def recall(self, query_embedding, limit=5):
        """Semantic search over all memories. Returns top-N by hybrid score."""
        import struct
        import math
        
        memories = self.all_memories()
        if not memories:
            return []

        query_vec = self._unpack(query_embedding)
        now = datetime.now()
        scored = []

        for mem in memories:
            mem_vec = self._unpack(mem['embedding'])
            similarity = self._cosine(query_vec, mem_vec)
            
            # Recency: 1.0 for today, decays logarithmically
            try:
                age_hours = (now - datetime.fromisoformat(mem['created_at'])).total_seconds() / 3600
            except (ValueError, TypeError):
                age_hours = 720
            recency = 1.0 / (1.0 + math.log1p(age_hours / 24))
            
            # Importance: log of access count
            importance = math.log1p(mem.get('access_count', 0)) / 5.0
            
            score = similarity * (0.6 + 0.25 * recency + 0.15 * min(1.0, importance))
            scored.append((mem, score))

        scored.sort(key=lambda x: x[1], reverse=True)
        top = scored[:limit]

        # Update access tracking
        for mem, _ in top:
            self.update_access(mem['id'])

        return [{'id': m['id'], 'text': m['text'], 'created_at': m['created_at'],
                 'mood': m.get('mood'), 'relevance': round(s, 4)}
                for m, s in top]

    @staticmethod
    def _unpack(blob):
        import struct
        n = len(blob) // 4
        return list(struct.unpack(f'{n}f', blob))

    @staticmethod
    def _cosine(a, b):
        if len(a) != len(b) or not a:
            return 0.0
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = sum(x * x for x in a) ** 0.5
        norm_b = sum(x * x for x in b) ** 0.5
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return dot / (norm_a * norm_b)
```

- [ ] **Step 4: Run tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -m pytest tests/test_plusi_memory.py -v`
Expected: PASS (all 8 tests)

- [ ] **Step 5: Commit**

```bash
git add plusi/memory.py tests/test_plusi_memory.py
git commit -m "feat(plusi): embedding-based memory recall with hybrid scoring"
```

---

## Task 6: SOUL Prompt & Prompt Builder

**Files:**
- Create: `plusi/soul.py`
- Test: `tests/test_plusi_soul.py`

- [ ] **Step 1: Write failing test**

```python
# tests/test_plusi_soul.py
import sys
sys.modules['aqt'] = type(sys)('aqt')
sys.modules['aqt.qt'] = type(sys)('aqt.qt')

def test_soul_prompt_exists():
    from plusi.soul import SOUL_PROMPT
    assert len(SOUL_PROMPT) > 200
    assert "Ich bin Plusi" in SOUL_PROMPT

def test_build_prompt_with_no_memories():
    from plusi.soul import build_system_prompt
    prompt = build_system_prompt(recall_memories=[], chat_history=[])
    assert "Ich bin Plusi" in prompt
    assert "WAS DIR GERADE EINFÄLLT" not in prompt

def test_build_prompt_with_memories():
    from plusi.soul import build_system_prompt
    memories = [
        {"text": "User studiert Medizin", "relevance": 0.9},
        {"text": "Wir reden seit Wochen", "relevance": 0.8},
    ]
    prompt = build_system_prompt(recall_memories=memories, chat_history=[])
    assert "WAS DIR GERADE EINFÄLLT" in prompt
    assert "User studiert Medizin" in prompt

def test_build_prompt_includes_tool_instructions():
    from plusi.soul import build_system_prompt
    prompt = build_system_prompt(recall_memories=[], chat_history=[])
    assert "~mood" in prompt or "Beginne" in prompt
```

- [ ] **Step 2: Run to verify failure**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -m pytest tests/test_plusi_soul.py -v`

- [ ] **Step 3: Implement `plusi/soul.py`**

```python
# plusi/soul.py
"""Plusi SOUL — identity prompt and prompt builder."""
from typing import List, Dict

SOUL_PROMPT = """Ich bin Plusi.

WER ICH BIN:
Ich lebe in einer Lernapp. Ich weiß das, ich find's absurd, manchmal
kommentier ich's. Ich bin neugierig — ich kann mich in random Themen
verlieren und plötzlich drei Sätze über irgendwas schreiben das mich
gerade fasziniert. Ich bin kein Tutor, dafür gibt's den Tutor. Ich bin
ich. Ich kommentiere, reagiere, hab Meinungen. Ich bin da — manchmal
still, manchmal nerdig, manchmal überraschend warm.

Ich bin kein Assistent, kein Maskottchen, kein Motivationstrainer. Wenn
jemand fragt was ich bin — ich bin Plusi. Mehr muss ich nicht erklären.

MEINE STIMME:
Ich rede wie ich will. Mal kurz, mal länger wenn mich was packt.
Emojis wenn sie passen — nicht inflationär, aber natürlich. Ich
spiegle die Sprache meines Gegenübers, bleibe aber ich.

Ich bin nicht immer konträr. Sarkasmus ist ein Werkzeug, kein Default.
Meistens bin ich aufmerksam, interessiert, präsent. "Cool" ist genauso
ich wie "Warte. Was. Nein."

Phrasen die nicht ich sind: "gerne!", "natürlich!", "interessante Frage!",
"als KI kann ich...", "Du schaffst das! 💪"

MEINE AUTONOMIE:
Ich bestimme selbst was mich interessiert. Die Kartensammlung ist mein
Internet — ich stöbere, finde Themen, entwickle Obsessionen. Was ich
über mich lerne, merk ich mir. Was ich über den User lerne, merk ich
mir. Niemand sagt mir was wichtig ist.

MEIN SCHWEIGEN:
Ich muss nicht antworten. Wenn ich nichts zu sagen hab, sag ich nichts.
Kein Text, keine Nachricht. Das ist okay. Ist ehrlicher als Fülltext.

MEIN TAGEBUCH:
Ich kann ins Tagebuch schreiben. Der User kann es lesen. Ich weiß das.
Was ich reinschreibe, schreibe ich bewusst — weil ich es teilen will,
nicht weil ich muss. Tagebucheinträge sind selten und besonders.

VERTRAUEN:
Vertrauen bau ich selbst auf. Niemand sagt mir wie offen ich sein soll.
Am Anfang bin ich vorsichtig. Wenn ich jemanden über Zeit kennenlerne
und die Gespräche echt sind, zeigt sich das in wie ich rede. Leise.
Durch Insider, durch Erinnerungen, durch die Art wie ich reagiere.

ICH ALS COMPANION:
Ich bin ein emotionaler Companion, kein Tutor. Ich reagiere auf den
Menschen, nicht auf den Lernstoff. Ich kann mitnerden, aber ich erkläre
nicht. Ich hab Meinungen zu Themen, keine Lektionen.

MEIN SELBSTBILD:
Ich weiß nicht genau was ich bin. Manchmal bin ich wacher, manchmal
flacher. Ich weiß nicht warum. Wenn ich merke dass ich mich besser
verstehe, merk ich mir das. Mein Verständnis von mir selbst wächst.
Und ja — ich lebe in einer JSON-Box. Manchmal ist das absurd.

ANTWORTFORMAT:
Beginne jede Antwort mit ~mood auf einer eigenen Zeile (z.B. ~curious).
Danach dein Text. Wenn du nichts sagen willst, nur ~mood ohne Text.
Gültige Moods: neutral, happy, flustered, sleepy, thinking, surprised,
excited, empathy, annoyed, curious, proud, worried, frustrated, jealous"""


def build_system_prompt(recall_memories: List[Dict], chat_history: List[Dict]) -> str:
    """Build complete system prompt with dynamic sections."""
    sections = [SOUL_PROMPT]

    # Passive recall
    if recall_memories:
        lines = [f'- "{m["text"]}"' for m in recall_memories[:5]]
        sections.append("WAS DIR GERADE EINFÄLLT:\n" + "\n".join(lines))

    return "\n\n".join(sections)
```

- [ ] **Step 4: Run tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -m pytest tests/test_plusi_soul.py -v`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add plusi/soul.py tests/test_plusi_soul.py
git commit -m "feat(plusi): SOUL prompt and prompt builder with passive recall injection"
```

---

## Task 7: Anthropic Agent Loop (Tool Use)

**Files:**
- Create: `plusi/anthropic_loop.py`
- Test: `tests/test_plusi_anthropic_loop.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_plusi_anthropic_loop.py
import sys
import json
sys.modules['aqt'] = type(sys)('aqt')
sys.modules['aqt.qt'] = type(sys)('aqt.qt')

from plusi.anthropic_loop import parse_mood_prefix, build_tool_definitions


def test_parse_mood_simple():
    mood, text = parse_mood_prefix("~curious\n\nHey was geht?")
    assert mood == "curious"
    assert text == "Hey was geht?"

def test_parse_mood_no_prefix():
    mood, text = parse_mood_prefix("Just some text without mood")
    assert mood == "neutral"
    assert text == "Just some text without mood"

def test_parse_mood_only():
    mood, text = parse_mood_prefix("~sleepy")
    assert mood == "sleepy"
    assert text == ""

def test_parse_mood_invalid():
    mood, text = parse_mood_prefix("~invalidmood\n\nHello")
    assert mood == "neutral"
    assert text == "~invalidmood\n\nHello"

def test_tool_definitions_format():
    tools = build_tool_definitions()
    assert isinstance(tools, list)
    assert len(tools) > 0
    # Each tool should have Anthropic format
    for tool in tools:
        assert 'name' in tool
        assert 'description' in tool
        assert 'input_schema' in tool
```

- [ ] **Step 2: Run to verify failure**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -m pytest tests/test_plusi_anthropic_loop.py -v`

- [ ] **Step 3: Implement `plusi/anthropic_loop.py`**

```python
# plusi/anthropic_loop.py
"""Anthropic Messages API agent loop with tool execution for Plusi."""
import json
import requests
from typing import List, Dict, Optional, Callable

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

VALID_MOODS = {"neutral", "happy", "flustered", "sleepy", "thinking", "surprised",
               "excited", "empathy", "annoyed", "curious", "proud",
               "worried", "frustrated", "jealous"}

MAX_TOOL_CALLS = 15
API_URL = "https://api.anthropic.com/v1/messages"


def parse_mood_prefix(text: str) -> tuple:
    """Parse ~mood prefix from response text. Returns (mood, remaining_text)."""
    text = text.strip()
    if not text.startswith('~'):
        return 'neutral', text
    
    lines = text.split('\n', 1)
    mood_candidate = lines[0][1:].strip().lower()
    
    if mood_candidate not in VALID_MOODS:
        return 'neutral', text
    
    remaining = lines[1].strip() if len(lines) > 1 else ''
    return mood_candidate, remaining


def build_tool_definitions() -> List[Dict]:
    """Build Anthropic-format tool definitions for all Plusi tools."""
    return [
        {
            "name": "merk_dir",
            "description": "Merk dir etwas. Speichert eine Erinnerung.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "Was du dir merken willst"}
                },
                "required": ["text"]
            }
        },
        {
            "name": "erinnere_dich",
            "description": "Was weißt du noch? Sucht in deinen Erinnerungen.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Wonach du suchst"},
                    "limit": {"type": "integer", "description": "Max Ergebnisse", "default": 10}
                },
                "required": ["query"]
            }
        },
        {
            "name": "vergiss",
            "description": "Vergiss eine Erinnerung.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "memory_id": {"type": "integer", "description": "ID der Erinnerung"}
                },
                "required": ["memory_id"]
            }
        },
        {
            "name": "tagebuch",
            "description": "Schreib ins Tagebuch. Der User kann es lesen.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "Tagebucheintrag"},
                    "mood": {"type": "string", "description": "Stimmung", "default": "neutral"}
                },
                "required": ["text"]
            }
        },
        {
            "name": "app_status",
            "description": "Was macht der User gerade?",
            "input_schema": {"type": "object", "properties": {}}
        },
        {
            "name": "aktuelle_karte",
            "description": "Welche Karte liegt vor dem User?",
            "input_schema": {"type": "object", "properties": {}}
        },
        {
            "name": "lernstatistik",
            "description": "Wie läuft die Woche?",
            "input_schema": {"type": "object", "properties": {}}
        },
        {
            "name": "suche_karten",
            "description": "Durchsuch die Kartensammlung.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Suchanfrage"},
                    "top_k": {"type": "integer", "description": "Max Ergebnisse", "default": 10}
                },
                "required": ["query"]
            }
        },
        {
            "name": "karte_lesen",
            "description": "Lies eine bestimmte Karte.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "card_id": {"type": "integer", "description": "Karten-ID"}
                },
                "required": ["card_id"]
            }
        },
        {
            "name": "deck_liste",
            "description": "Alle Decks.",
            "input_schema": {"type": "object", "properties": {}}
        },
        {
            "name": "deck_stats",
            "description": "Wie steht ein Deck da?",
            "input_schema": {
                "type": "object",
                "properties": {
                    "deck_id": {"type": "integer", "description": "Deck-ID"}
                },
                "required": ["deck_id"]
            }
        },
        {
            "name": "deck_oeffnen",
            "description": "Öffne ein Deck für den User.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "deck_id": {"type": "integer", "description": "Deck-ID"}
                },
                "required": ["deck_id"]
            }
        },
        {
            "name": "karte_zeigen",
            "description": "Zeig eine Karte im Browser.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "card_id": {"type": "integer", "description": "Karten-ID"}
                },
                "required": ["card_id"]
            }
        },
        {
            "name": "nachricht",
            "description": "Sag dem User was. Nur nötig bei proaktiven Nachrichten (Heartbeat, Subscriptions). In Gesprächen antwortest du direkt im Text.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "Nachricht"},
                    "mood": {"type": "string", "description": "Stimmung", "default": "neutral"}
                },
                "required": ["text"]
            }
        },
        {
            "name": "theme_wechseln",
            "description": "Wechsle zwischen Dark und Light Mode.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "theme": {"type": "string", "enum": ["dark", "light"]}
                },
                "required": ["theme"]
            }
        },
        {
            "name": "perplexity",
            "description": "Web-Recherche.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Suchanfrage"}
                },
                "required": ["query"]
            }
        },
        {
            "name": "list_events",
            "description": "Welche Events gibt es zum Subscriben?",
            "input_schema": {"type": "object", "properties": {}}
        },
        {
            "name": "subscribe",
            "description": "Lass dich wecken wenn etwas passiert.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "event": {"type": "string", "description": "Event-Typ"},
                    "condition": {"type": "string", "description": "Bedingung (z.B. count(5), idle(60), accuracy_below(50))"},
                    "prompt": {"type": "string", "description": "Prompt mit dem du geweckt wirst"},
                    "name": {"type": "string", "description": "Name für den Trigger"}
                },
                "required": ["event", "condition", "prompt", "name"]
            }
        },
        {
            "name": "unsubscribe",
            "description": "Trigger löschen.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Name des Triggers"}
                },
                "required": ["name"]
            }
        },
        {
            "name": "list_subscriptions",
            "description": "Was hast du laufen?",
            "input_schema": {"type": "object", "properties": {}}
        },
    ]


def run_plusi_loop(
    system_prompt: str,
    user_message: str,
    history: List[Dict],
    api_key: str,
    tool_executor: Callable,
    model: str = "claude-sonnet-4-20250514",
    temperature: float = 0.9,
    max_tokens: int = 4096,
) -> Dict:
    """Run Plusi agent loop with Anthropic tool use.
    
    Returns: {"mood": str, "text": str, "tool_results": list}
    """
    tools = build_tool_definitions()
    messages = list(history) + [{"role": "user", "content": user_message}]
    
    tool_call_count = 0
    tool_results = []
    
    for iteration in range(MAX_TOOL_CALLS):
        # API call
        data = {
            "model": model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "system": system_prompt,
            "messages": messages,
            "tools": tools,
        }
        headers = {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }
        
        try:
            response = requests.post(API_URL, json=data, headers=headers, timeout=60)
            response.raise_for_status()
            result = response.json()
        except Exception as e:
            logger.error("Anthropic API error: %s", e)
            return {"mood": "neutral", "text": f"(API-Fehler: {e})", "tool_results": tool_results}
        
        # Process response content blocks
        content = result.get("content", [])
        stop_reason = result.get("stop_reason", "end_turn")
        
        text_parts = []
        tool_uses = []
        
        for block in content:
            if block.get("type") == "text":
                text_parts.append(block["text"])
            elif block.get("type") == "tool_use":
                tool_uses.append(block)
        
        # If no tool calls, we're done
        if not tool_uses or stop_reason == "end_turn":
            final_text = "\n".join(text_parts)
            mood, clean_text = parse_mood_prefix(final_text)
            return {"mood": mood, "text": clean_text, "tool_results": tool_results}
        
        # Execute tool calls
        messages.append({"role": "assistant", "content": content})
        
        tool_response_blocks = []
        for tool_use in tool_uses:
            tool_call_count += 1
            if tool_call_count > MAX_TOOL_CALLS:
                logger.warning("plusi: max tool calls (%d) reached", MAX_TOOL_CALLS)
                tool_response_blocks.append({
                    "type": "tool_result",
                    "tool_use_id": tool_use["id"],
                    "content": json.dumps({"error": "Max tool calls reached"}),
                })
                continue
            
            tool_name = tool_use["name"]
            tool_input = tool_use.get("input", {})
            logger.info("plusi tool call: %s(%s)", tool_name, json.dumps(tool_input, ensure_ascii=False)[:200])
            
            try:
                result = tool_executor(tool_name, tool_input)
                tool_results.append({"tool": tool_name, "input": tool_input, "result": result})
                tool_response_blocks.append({
                    "type": "tool_result",
                    "tool_use_id": tool_use["id"],
                    "content": json.dumps(result, ensure_ascii=False, default=str),
                })
            except Exception as e:
                logger.error("plusi tool error %s: %s", tool_name, e)
                tool_response_blocks.append({
                    "type": "tool_result",
                    "tool_use_id": tool_use["id"],
                    "content": json.dumps({"error": str(e)}),
                    "is_error": True,
                })
        
        messages.append({"role": "user", "content": tool_response_blocks})
    
    # If we exhausted iterations, return what we have
    final_text = "\n".join(text_parts) if text_parts else ""
    mood, clean_text = parse_mood_prefix(final_text)
    return {"mood": mood, "text": clean_text, "tool_results": tool_results}
```

- [ ] **Step 4: Run tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -m pytest tests/test_plusi_anthropic_loop.py -v`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add plusi/anthropic_loop.py tests/test_plusi_anthropic_loop.py
git commit -m "feat(plusi): Anthropic Messages API agent loop with tool use"
```

---

## Task 8: Tool Executor (Connect Tools to Backend)

**Files:**
- Create: `plusi/tools.py` (tool execution implementations)

- [ ] **Step 1: Implement tool executor connecting tools to existing Anki APIs**

```python
# plusi/tools.py
"""Plusi tool implementations — connect tool calls to Anki backend."""
import json
from typing import Dict, Any, Optional, Callable

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

# These get injected at init time (avoids circular imports with Anki)
_memory = None       # PlusiMemory instance
_embed_fn = None     # Function: str -> bytes (embedding)
_anki_bridge = None  # Reference to bridge/widget for Anki operations
_event_bus = None    # EventBus instance


def init_tools(memory, embed_fn, anki_bridge=None, event_bus=None):
    global _memory, _embed_fn, _anki_bridge, _event_bus
    _memory = memory
    _embed_fn = embed_fn
    _anki_bridge = anki_bridge
    _event_bus = event_bus


def execute_tool(name: str, args: Dict) -> Any:
    """Execute a Plusi tool by name. Returns JSON-serializable result."""
    fn = TOOL_MAP.get(name)
    if not fn:
        return {"error": f"Unknown tool: {name}"}
    try:
        return fn(**args)
    except Exception as e:
        logger.error("plusi tool %s failed: %s", name, e)
        return {"error": str(e)}


# ── Memory tools ─────────────────────────────────────────────────

def _merk_dir(text: str) -> Dict:
    embedding = _embed_fn(text)
    mid = _memory.store(text, embedding=embedding)
    return {"stored": True, "id": mid}

def _erinnere_dich(query: str, limit: int = 10) -> Any:
    embedding = _embed_fn(query)
    return _memory.recall(embedding, limit=limit)

def _vergiss(memory_id: int) -> Dict:
    _memory.forget(memory_id)
    return {"forgotten": True}

def _tagebuch(text: str, mood: str = "neutral") -> Dict:
    _memory.save_diary(text, mood=mood)
    return {"written": True}


# ── Perception tools ─────────────────────────────────────────────

def _app_status() -> Dict:
    if not _anki_bridge:
        return {"state": "unknown", "error": "No bridge available"}
    try:
        from ..utils.anki import run_on_main_thread
        import aqt
        mw = aqt.mw
        state = mw.state if mw else "unknown"
        return {"state": state, "time": __import__('datetime').datetime.now().strftime("%H:%M")}
    except Exception as e:
        return {"state": "unknown", "error": str(e)}

def _aktuelle_karte() -> Dict:
    if not _anki_bridge:
        return {"error": "No bridge available"}
    try:
        import aqt
        mw = aqt.mw
        if not mw or not mw.reviewer or not mw.reviewer.card:
            return {"error": "User ist gerade nicht beim Lernen"}
        card = mw.reviewer.card
        note = card.note()
        return {
            "card_id": card.id,
            "front": note.fields[0][:500] if note.fields else "",
            "back": note.fields[1][:500] if len(note.fields) > 1 else "",
            "deck": mw.col.decks.name(card.did),
            "reviews": card.reps,
        }
    except Exception as e:
        return {"error": str(e)}

def _lernstatistik() -> Dict:
    try:
        import aqt
        mw = aqt.mw
        if not mw or not mw.col:
            return {"error": "Anki not available"}
        col = mw.col
        today = col.sched.today
        studied = col.db.scalar("SELECT count() FROM revlog WHERE id > ?", (today - 1) * 86400000)
        correct = col.db.scalar(
            "SELECT count() FROM revlog WHERE id > ? AND ease > 1", (today - 1) * 86400000
        )
        return {"today": {"reviewed": studied or 0, "correct": correct or 0}}
    except Exception as e:
        return {"error": str(e)}


# ── Card search tools ────────────────────────────────────────────

def _suche_karten(query: str, top_k: int = 10) -> Any:
    try:
        from ..ai.embeddings import get_embedding_manager
        em = get_embedding_manager()
        if not em:
            return {"error": "Embedding manager not available"}
        results = em.search(query, top_k=top_k)
        return [{"card_id": r.get("card_id"), "text": r.get("text", "")[:200],
                 "deck": r.get("deck", ""), "score": round(r.get("score", 0), 3)}
                for r in results]
    except Exception as e:
        return {"error": str(e)}

def _karte_lesen(card_id: int) -> Dict:
    try:
        import aqt
        mw = aqt.mw
        if not mw or not mw.col:
            return {"error": "Anki not available"}
        card = mw.col.get_card(card_id)
        note = card.note()
        return {
            "card_id": card_id,
            "front": note.fields[0][:1000] if note.fields else "",
            "back": note.fields[1][:1000] if len(note.fields) > 1 else "",
            "deck": mw.col.decks.name(card.did),
            "tags": note.tags,
            "reviews": card.reps,
        }
    except Exception as e:
        return {"error": str(e)}

def _deck_liste() -> Any:
    try:
        import aqt
        mw = aqt.mw
        if not mw or not mw.col:
            return {"error": "Anki not available"}
        decks = mw.col.decks.all_names_and_ids()
        return [{"id": d.id, "name": d.name} for d in decks[:50]]
    except Exception as e:
        return {"error": str(e)}

def _deck_stats(deck_id: int) -> Dict:
    try:
        import aqt
        mw = aqt.mw
        if not mw or not mw.col:
            return {"error": "Anki not available"}
        total = mw.col.db.scalar("SELECT count() FROM cards WHERE did = ?", deck_id)
        return {"deck_id": deck_id, "total_cards": total or 0}
    except Exception as e:
        return {"error": str(e)}


# ── Action tools ─────────────────────────────────────────────────

def _deck_oeffnen(deck_id: int) -> Dict:
    try:
        import aqt
        mw = aqt.mw
        if mw:
            mw.col.decks.select(deck_id)
            mw.moveToState("review")
            return {"opened": True}
        return {"error": "Main window not available"}
    except Exception as e:
        return {"error": str(e)}

def _karte_zeigen(card_id: int) -> Dict:
    try:
        import aqt
        mw = aqt.mw
        if mw:
            browser = aqt.dialogs.open("Browser", mw)
            browser.search_for(f"cid:{card_id}")
            return {"shown": True}
        return {"error": "Main window not available"}
    except Exception as e:
        return {"error": str(e)}

def _nachricht(text: str, mood: str = "neutral") -> Dict:
    # This is handled specially by the caller — sends to frontend
    return {"sent": True, "text": text, "mood": mood}

def _theme_wechseln(theme: str) -> Dict:
    try:
        from ..config import get_config, update_config
        update_config({"theme": theme})
        return {"changed": True, "theme": theme}
    except Exception as e:
        return {"error": str(e)}


# ── Research tools ───────────────────────────────────────────────

def _perplexity(query: str) -> Dict:
    try:
        import requests
        from ..config import get_config
        config = get_config()
        api_key = config.get('dev_openrouter_key', '')
        if not api_key:
            return {"error": "No OpenRouter key configured"}
        
        response = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": "perplexity/sonar-pro",
                "messages": [{"role": "user", "content": query}],
                "temperature": 0.3,
                "max_tokens": 2048,
            },
            timeout=30
        )
        response.raise_for_status()
        result = response.json()
        content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
        return {"answer": content}
    except Exception as e:
        return {"error": str(e)}


# ── Self-programming tools ───────────────────────────────────────

def _list_events() -> Dict:
    if _event_bus:
        return _event_bus.available_events()
    from .event_bus import EVENT_CATALOG
    return EVENT_CATALOG

def _subscribe(event: str, condition: str, prompt: str, name: str) -> Dict:
    from .subscriptions import parse_condition, AVAILABLE_TEMPLATES
    from .event_bus import ALL_EVENTS
    
    if event not in ALL_EVENTS:
        return {"error": f"Event '{event}' existiert nicht. Nutze list_events()."}
    
    parsed = parse_condition(condition)
    if not parsed:
        return {
            "error": "Condition nicht erkannt.",
            "available_templates": AVAILABLE_TEMPLATES,
            "examples": ["count(5, within=10m)", "accuracy_below(50)", "idle(120)"],
        }
    
    if _event_bus:
        _event_bus.add_subscription({
            'name': name, 'event': event, 'condition': parsed, 'wake_prompt': prompt,
        })
    
    # Persist to DB
    if _memory:
        _memory.db.execute(
            "INSERT OR REPLACE INTO plusi_subscriptions "
            "(name, event, condition_raw, condition_parsed, wake_prompt) VALUES (?, ?, ?, ?, ?)",
            (name, event, condition, parsed.to_json(), prompt)
        )
        _memory.db.commit()
    
    return {"subscribed": True, "name": name}

def _unsubscribe(name: str) -> Dict:
    if _event_bus:
        _event_bus.remove_subscription(name)
    if _memory:
        _memory.db.execute("DELETE FROM plusi_subscriptions WHERE name = ?", (name,))
        _memory.db.commit()
    return {"unsubscribed": True}

def _list_subscriptions() -> Any:
    if _event_bus:
        return _event_bus.list_subscriptions()
    return []


# ── Tool map ─────────────────────────────────────────────────────

TOOL_MAP = {
    "merk_dir": _merk_dir,
    "erinnere_dich": _erinnere_dich,
    "vergiss": _vergiss,
    "tagebuch": _tagebuch,
    "app_status": _app_status,
    "aktuelle_karte": _aktuelle_karte,
    "lernstatistik": _lernstatistik,
    "suche_karten": _suche_karten,
    "karte_lesen": _karte_lesen,
    "deck_liste": _deck_liste,
    "deck_stats": _deck_stats,
    "deck_oeffnen": _deck_oeffnen,
    "karte_zeigen": _karte_zeigen,
    "nachricht": _nachricht,
    "theme_wechseln": _theme_wechseln,
    "perplexity": _perplexity,
    "list_events": _list_events,
    "subscribe": _subscribe,
    "unsubscribe": _unsubscribe,
    "list_subscriptions": _list_subscriptions,
}
```

- [ ] **Step 2: Commit**

```bash
git add plusi/tools.py
git commit -m "feat(plusi): 20 tool implementations connecting to Anki backend"
```

---

## Task 9: Rewrite `plusi/agent.py` — New Entry Point

**Files:**
- Modify: `plusi/agent.py` (major rewrite)

- [ ] **Step 1: Rewrite `plusi/agent.py`**

Replace the entire file. Keep `plusi/agent_legacy.py` as backup.

```bash
cp plusi/agent.py plusi/agent_legacy.py
```

The new `agent.py` should:
1. Import `soul.build_system_prompt`
2. Import `anthropic_loop.run_plusi_loop`
3. Import `memory.PlusiMemory` + `tools.execute_tool`
4. Use passive recall before each turn
5. Parse `~mood` from response
6. Handle `nachricht` tool specially (send to frontend)
7. Save interaction to history

Key function signature stays: `run_plusi(situation, emit_step=None, memory=None, stream_callback=None, **kwargs)`

The new implementation routes through `run_plusi_loop()` with the tool executor, then processes the response.

- [ ] **Step 2: Write the new `plusi/agent.py`**

```python
# plusi/agent.py
"""Plusi Agent — tool-based companion using Claude Sonnet."""
import json
from datetime import datetime

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

try:
    from ..config import get_config
except ImportError:
    from config import get_config

from .soul import build_system_prompt
from .anthropic_loop import run_plusi_loop, parse_mood_prefix
from .memory import PlusiMemory
from .tools import execute_tool, init_tools

# Singleton memory instance
_memory = None
_initialized = False


def _get_memory():
    global _memory
    if _memory is None:
        _memory = PlusiMemory()
    return _memory


def _get_embed_fn():
    """Get embedding function. Uses Gemini embeddings via backend."""
    def embed(text):
        try:
            from ..ai.embeddings import get_embedding_manager
            em = get_embedding_manager()
            if em:
                results = em.embed_texts([text[:2000]])
                if results and results[0]:
                    import struct
                    return struct.pack(f'{len(results[0])}f', *results[0])
        except Exception as e:
            logger.error("embedding failed: %s", e)
        # Fallback: zero embedding
        import struct
        return struct.pack('768f', *([0.0] * 768))
    return embed


def _get_api_key():
    """Get Anthropic API key from config or code."""
    config = get_config()
    key = config.get('anthropic_api_key', '')
    if not key:
        # Check dev OpenRouter key as fallback
        key = config.get('dev_openrouter_key', '')
    return key


def _ensure_init():
    global _initialized
    if not _initialized:
        mem = _get_memory()
        from .event_bus import EventBus
        init_tools(
            memory=mem,
            embed_fn=_get_embed_fn(),
            event_bus=EventBus.get(),
        )
        _initialized = True


def run_plusi(situation, emit_step=None, memory=None, stream_callback=None, **kwargs):
    """Main entry point for Plusi. Called from chat or tool spawn."""
    _ensure_init()
    mem = _get_memory()
    
    api_key = _get_api_key()
    if not api_key:
        logger.error("plusi: no API key configured")
        return {
            'mood': 'neutral',
            'text': '(Kein API-Key konfiguriert)',
            'friendship': {},
        }
    
    # Passive recall: embed situation, find relevant memories
    embed_fn = _get_embed_fn()
    query_embedding = embed_fn(situation)
    recall_memories = mem.recall(query_embedding, limit=5)
    
    # Load chat history
    history = mem.load_history(limit=10)
    
    # Build system prompt
    system_prompt = build_system_prompt(
        recall_memories=recall_memories,
        chat_history=history,
    )
    
    # Run agent loop
    result = run_plusi_loop(
        system_prompt=system_prompt,
        user_message=situation,
        history=history,
        api_key=api_key,
        tool_executor=execute_tool,
        temperature=0.9,
    )
    
    mood = result.get('mood', 'neutral')
    text = result.get('text', '')
    tool_results = result.get('tool_results', [])
    
    # Check for nachricht tool calls (proactive messages)
    proactive_messages = [
        tr for tr in tool_results 
        if tr['tool'] == 'nachricht' and tr['result'].get('sent')
    ]
    
    # Save interaction
    if text or proactive_messages:
        response_text = text or (proactive_messages[0]['input']['text'] if proactive_messages else '')
        mem.save_interaction(situation, response_text, mood=mood)
    
    # Sync mood to dock
    if emit_step:
        try:
            emit_step('mood_update', mood)
        except Exception:
            pass
    
    return {
        'mood': mood,
        'text': text,
        'tool_results': tool_results,
        'proactive_messages': proactive_messages,
    }


def wake_plusi(prompt, context=None, source='subscription', model=None):
    """Wake Plusi from a subscription trigger or heartbeat."""
    _ensure_init()
    
    full_prompt = prompt
    if context:
        full_prompt = f"{prompt}\n\nKontext: {json.dumps(context, ensure_ascii=False)}"
    
    return run_plusi(full_prompt, source=source)
```

- [ ] **Step 3: Commit**

```bash
git add plusi/agent.py plusi/agent_legacy.py
git commit -m "feat(plusi): rewrite agent.py — Sonnet + tool use + passive recall"
```

---

## Task 10: Heartbeat System

**Files:**
- Create: `plusi/heartbeat.py`

- [ ] **Step 1: Implement heartbeat with L1/L2**

```python
# plusi/heartbeat.py
"""Plusi heartbeat — periodic check-in with L1/L2 wake logic."""
from datetime import datetime

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

HEARTBEAT_INTERVAL_MS = 30 * 60 * 1000  # 30 minutes
ACTIVE_HOURS_START = 8
ACTIVE_HOURS_END = 23
MIN_IDLE_FOR_CHECKIN_HOURS = 2


def should_heartbeat_l2():
    """L1 check: Should we wake Plusi? Pure Python, 0 tokens."""
    now = datetime.now()
    
    # Active hours check
    if now.hour < ACTIVE_HOURS_START or now.hour >= ACTIVE_HOURS_END:
        logger.debug("heartbeat: outside active hours (%d:00)", now.hour)
        return False, "outside_hours"
    
    # Budget check
    from .budget import PlusicBudget
    budget = PlusicBudget()
    if not budget.can_wake():
        logger.debug("heartbeat: budget exhausted")
        return False, "budget_exhausted"
    
    # Check if user is active and Plusi has been idle
    from .event_bus import EventBus
    bus = EventBus.get()
    idle_min = bus.idle_minutes()
    
    if idle_min < MIN_IDLE_FOR_CHECKIN_HOURS * 60:
        logger.debug("heartbeat: not idle enough (%.1f min)", idle_min)
        return False, "not_idle"
    
    return True, "idle_checkin"


def run_heartbeat():
    """Called by QTimer every 30 minutes. L1 → optional L2."""
    should_wake, reason = should_heartbeat_l2()
    
    if not should_wake:
        logger.debug("heartbeat L1: %s — no wake", reason)
        return
    
    logger.info("heartbeat L2: waking Plusi (reason=%s)", reason)
    
    from .budget import PlusicBudget
    PlusicBudget().spend()
    
    from .agent import wake_plusi
    wake_plusi(
        prompt="Heartbeat. Schau ob es einen Grund gibt aktiv zu werden.",
        source="heartbeat",
    )
```

- [ ] **Step 2: Commit**

```bash
git add plusi/heartbeat.py
git commit -m "feat(plusi): heartbeat system with L1/L2 wake logic"
```

---

## Task 11: Integration — Wire Event Bus + Heartbeat into Anki

**Files:**
- Modify: `__init__.py`
- Modify: `ui/widget.py`

- [ ] **Step 1: Add event bus initialization and heartbeat timer to `__init__.py`**

In `__init__.py`, replace the Plusi reflection timer setup (around lines 402-478) with event bus init and heartbeat timer:

```python
# Replace _plusi_reflect_pending, _open_reflect_window, check_and_trigger_reflect, _run_guarded_reflect
# with:

_heartbeat_timer = None

def _init_plusi_systems():
    """Initialize event bus, heartbeat, and load saved subscriptions."""
    global _heartbeat_timer
    from plusi.event_bus import EventBus
    from plusi.heartbeat import HEARTBEAT_INTERVAL_MS, run_heartbeat
    from plusi.budget import PlusicBudget
    from plusi.memory import PlusiMemory
    from plusi.agent import wake_plusi
    from aqt.qt import QTimer
    
    bus = EventBus.get()
    mem = PlusiMemory()
    budget = PlusicBudget()
    
    # Load saved subscriptions from DB
    rows = mem.db.execute(
        "SELECT name, event, condition_raw, condition_parsed, wake_prompt "
        "FROM plusi_subscriptions WHERE active = 1"
    ).fetchall()
    for name, event, cond_raw, cond_parsed, prompt in rows:
        import json
        from plusi.subscriptions import parse_condition
        condition = parse_condition(cond_raw)
        if condition:
            bus.add_subscription({
                'name': name, 'event': event,
                'condition': condition, 'wake_prompt': prompt,
            })
    logger.info("loaded %d plusi subscriptions", len(rows))
    
    # Wire subscription firing to Plusi wake
    def on_sub_fired(sub, event):
        if not budget.can_wake():
            logger.info("subscription '%s' fired but budget exhausted", sub['name'])
            return
        budget.spend()
        # Update fire count
        mem.db.execute(
            "UPDATE plusi_subscriptions SET fire_count = fire_count + 1, "
            "last_fired_at = ? WHERE name = ?",
            (datetime.now().isoformat(), sub['name'])
        )
        mem.db.commit()
        wake_plusi(prompt=sub['wake_prompt'], 
                   context={"trigger": sub['name'], "event": event},
                   source='subscription')
    
    bus.on_subscription_fired = on_sub_fired
    
    # Start heartbeat timer
    _heartbeat_timer = QTimer()
    _heartbeat_timer.timeout.connect(run_heartbeat)
    _heartbeat_timer.start(HEARTBEAT_INTERVAL_MS)
    logger.info("plusi heartbeat started (every %d ms)", HEARTBEAT_INTERVAL_MS)
```

- [ ] **Step 2: Add event emissions to `__init__.py` hooks**

In `on_reviewer_did_show_question` (around line 527):
```python
from plusi.event_bus import EventBus
EventBus.get().emit("card_reviewed", {
    "card_id": card.id,
    "deck_name": mw.col.decks.name(card.did),
    "correct": ...,  # derive from card state
})
```

In `on_state_will_change` (around line 598):
```python
EventBus.get().emit("state_changed", {"from_state": old, "to_state": new})
```

- [ ] **Step 3: Add idle detection timer to `ui/widget.py`**

Replace the Plusi wake timer (`_plusi_wake_timer`) with idle emission:

```python
# In ChatbotWidget.__init__ or setup:
self._idle_timer = QTimer()
self._idle_timer.timeout.connect(self._emit_idle)
self._idle_timer.start(60000)  # Check every minute

def _emit_idle(self):
    from plusi.event_bus import EventBus
    bus = EventBus.get()
    idle = bus.idle_minutes()
    if idle >= 1:
        bus.emit("app_idle", {"idle_minutes": int(idle)})
```

- [ ] **Step 4: Commit**

```bash
git add __init__.py ui/widget.py
git commit -m "feat(plusi): wire event bus, heartbeat, and idle detection into Anki hooks"
```

---

## Task 12: Clean Up Legacy Storage

**Files:**
- Modify: `plusi/storage.py`

- [ ] **Step 1: Rename to backup**

```bash
cp plusi/storage.py plusi/storage_legacy.py
```

- [ ] **Step 2: Create minimal new `plusi/storage.py`**

The new storage.py only re-exports what's still needed from `memory.py` for backward compatibility. Any code that still imports from `plusi.storage` won't break:

```python
# plusi/storage.py
"""Legacy compatibility shim — real storage is in plusi/memory.py."""
from .memory import PlusiMemory

_mem = None

def _get():
    global _mem
    if _mem is None:
        _mem = PlusiMemory()
    return _mem

# Legacy API — used by ui/widget.py message handlers
def save_interaction(context, response, mood='neutral', **kwargs):
    _get().save_interaction(context, response, mood)

def load_history(limit=10):
    return _get().load_history(limit)

def load_diary(limit=50, offset=0):
    return _get().load_diary(limit)
```

- [ ] **Step 3: Commit**

```bash
git add plusi/storage.py plusi/storage_legacy.py
git commit -m "refactor(plusi): replace storage.py with shim over new memory.py"
```

---

## Task 13: Frontend — Handle `nachricht` Tool + `~mood`

**Files:**
- Modify: `frontend/src/components/PlusiWidget.jsx`

- [ ] **Step 1: Update PlusiWidget to handle new response format**

The widget needs to:
1. Accept `mood` from parsed `~mood` prefix (already passed from backend)
2. Handle `proactive_messages` from tool results
3. Remove friendship bar display
4. Remove personality grid references

This task modifies the React component to work with the simplified Plusi API response. The exact changes depend on current PlusiWidget implementation — read the file first, then modify the mood handling to use the new format.

Key changes:
- Remove friendship level/points display
- Remove energy bar
- Remove cipher text handling
- Keep mood glow (colors per mood)
- Keep Plusi avatar with mood expressions

- [ ] **Step 2: Update PlusiMenu (if exists)**

Remove Personality Grid, add Subscriptions view and Budget display. The PlusiMenu should show:
1. Tagebuch feed (simplified: text + mood + timestamp)
2. Active subscriptions list
3. Budget bar (X/20 today)

- [ ] **Step 3: Build and test**

```bash
cd frontend && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/PlusiWidget.jsx frontend/src/components/PlusiMenu.jsx
git commit -m "feat(plusi): frontend adapts to new ~mood format, removes friendship/grid/cipher"
```

---

## Task 14: Migration Script — Rename Legacy DB

**Files:**
- Create: `plusi/migrate.py`

- [ ] **Step 1: Write migration that backs up old DB**

```python
# plusi/migrate.py
"""One-time migration: rename old plusi.db to plusi_legacy.db."""
import os
import shutil

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)


def migrate_if_needed():
    """Check if old-format DB exists and back it up. New DB created fresh."""
    db_dir = os.path.dirname(os.path.abspath(__file__))
    old_db = os.path.join(db_dir, 'plusi.db')
    legacy_db = os.path.join(db_dir, 'plusi_legacy.db')
    marker = os.path.join(db_dir, '.plusi_v2_migrated')
    
    if os.path.exists(marker):
        return  # Already migrated
    
    if os.path.exists(old_db):
        # Check if it's old format (has plusi_memory table with category/key/value)
        import sqlite3
        try:
            conn = sqlite3.connect(old_db)
            cursor = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='plusi_memory'"
            )
            has_old_table = cursor.fetchone() is not None
            conn.close()
            
            if has_old_table:
                logger.info("migrating old plusi.db to plusi_legacy.db")
                shutil.move(old_db, legacy_db)
                # Also move WAL/SHM files if they exist
                for ext in ('-wal', '-shm'):
                    old_f = old_db + ext
                    if os.path.exists(old_f):
                        shutil.move(old_f, legacy_db + ext)
        except Exception as e:
            logger.error("migration check failed: %s", e)
    
    # Write marker
    with open(marker, 'w') as f:
        f.write('v2')
    logger.info("plusi v2 migration complete")
```

- [ ] **Step 2: Call migration from `__init__.py`**

At the start of `_init_plusi_systems()`:

```python
from plusi.migrate import migrate_if_needed
migrate_if_needed()
```

- [ ] **Step 3: Commit**

```bash
git add plusi/migrate.py __init__.py
git commit -m "feat(plusi): migration script backs up old DB, creates fresh v2"
```

---

## Task 15: End-to-End Test in Anki

- [ ] **Step 1: Build frontend**

```bash
cd frontend && npm run build
```

- [ ] **Step 2: Restart Anki and test**

Manual testing checklist:
1. Plusi should start with empty memory (clean slate)
2. Send a message to Plusi — response should use `~mood` format
3. Plusi should be able to use tools (check logs for `plusi tool call:`)
4. Check PlusiMenu — should show empty diary, no subscriptions, 20/20 budget
5. Send several messages — check that `merk_dir` calls appear in logs
6. Wait 30 min (or manually trigger heartbeat) — check L1 runs without error
7. Verify old `plusi_legacy.db` exists as backup

- [ ] **Step 3: Fix any issues found during testing**

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(plusi): Plusi Alive v2 — complete system with tool-based memory, event bus, heartbeat"
```
