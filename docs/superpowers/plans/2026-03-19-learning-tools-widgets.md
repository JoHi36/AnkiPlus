# Learning Tools + Widget System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add search_deck and get_learning_stats tools with a generic frontend widget rendering system that replaces the Plusi-only handling.

**Architecture:** Two new Python tools use `run_on_main_thread()` to safely access Anki's collection. The frontend gets a `ToolWidgetRenderer` that routes `[[TOOL:...]]` markers to the correct React component (CardWidget, CardListWidget, StatsWidget, PlusiWidget). The `plusiData` state migrates into a generic `toolWidgets` array.

**Tech Stack:** Python (Anki API, QTimer), React 18, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-19-learning-tools-widgets-design.md`

**Note:** The spec lists `bridge.py` as affected but no changes are needed there. The new tools use `mw.col` directly via `run_on_main_thread()` — they don't add new bridge methods. The existing `bridge.goToCard()` is already available for card clicks.

---

### Task 1: Add `run_on_main_thread` helper

**Files:**
- Create: `anki_utils.py`

This utility marshals function calls from daemon threads to Anki's main Qt thread. Both new tools need it.

- [ ] **Step 1: Create anki_utils.py**

```python
"""
anki_utils.py — Utilities for safe Anki API access from background threads.
"""

import re
import threading


def run_on_main_thread(fn, timeout=14):
    """Run a function on the main Qt thread and wait for the result.

    Tool execute functions run in daemon threads (via _run_with_timeout in
    tool_executor.py), but Anki's mw.col is only safe on the main thread.
    This helper uses QTimer.singleShot(0, ...) to marshal the call.

    Args:
        fn: Callable that takes no arguments and returns a value.
            All mw.col access must happen inside this callable.
        timeout: Max seconds to wait. Must be strictly less than the
                 tool's timeout_seconds (convention: timeout_seconds - 1).

    Returns:
        The return value of fn.

    Raises:
        TimeoutError: If the main thread doesn't respond in time.
        Exception: Any exception raised by fn.
    """
    from aqt.qt import QTimer

    result = {}
    error = {}
    done = threading.Event()

    def _on_main():
        try:
            result["value"] = fn()
        except Exception as e:
            error["value"] = e
        finally:
            done.set()

    QTimer.singleShot(0, _on_main)
    if not done.wait(timeout=timeout):
        raise TimeoutError("Main thread did not respond")
    if "value" in error:
        raise error["value"]
    return result["value"]


def strip_html_and_cloze(text):
    """Strip HTML tags and resolve cloze markup for display.

    '{{c1::answer::hint}}' → 'answer'
    '<b>bold</b>' → 'bold'
    """
    if not text:
        return ""
    # Resolve cloze: {{c1::answer::hint}} → answer, {{c1::answer}} → answer
    clean = re.sub(r'\{\{c\d+::(.*?)(?:::[^}]*)?\}\}', r'\1', text)
    # Strip HTML tags
    clean = re.sub(r'<[^>]+>', ' ', clean)
    # Collapse whitespace
    clean = re.sub(r'\s+', ' ', clean)
    # Strip HTML entities
    clean = re.sub(r'&[a-zA-Z]+;', ' ', clean)
    return clean.strip()
```

- [ ] **Step 2: Verify imports**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
python3 -c "
from anki_utils import strip_html_and_cloze
assert strip_html_and_cloze('<b>hello</b>') == 'hello'
assert strip_html_and_cloze('{{c1::answer::hint}}') == 'answer'
assert strip_html_and_cloze('{{c1::answer}}') == 'answer'
assert strip_html_and_cloze('') == ''
assert strip_html_and_cloze(None) == ''
print('All OK')
"
```

- [ ] **Step 3: Commit**

```bash
git add anki_utils.py
git commit -m "feat(tools): add run_on_main_thread helper and strip_html_and_cloze utility"
```

---

### Task 2: Register `search_deck` tool

**Files:**
- Modify: `tool_registry.py` (append after Plusi registration, ~line 314)

- [ ] **Step 1: Add search_deck schema and execute function**

Append to the end of `tool_registry.py`, after the Plusi registration block:

```python
# ---------------------------------------------------------------------------
# Search Deck Tool
# ---------------------------------------------------------------------------

SEARCH_DECK_SCHEMA = {
    "name": "search_deck",
    "description": (
        "Sucht Karten im Deck des Nutzers. Verwende dieses Tool wenn der Nutzer "
        "nach bestimmten Karten fragt, Karten zu einem Thema sehen möchte, oder "
        "du relevante Karten zeigen willst. Gibt eine Liste mit Karten-Vorschauen zurück."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Suchbegriff (wird gegen Front- und Back-Text der Karten gesucht)"
            },
            "deck_id": {
                "type": "integer",
                "description": "Deck-ID. Wenn nicht angegeben, wird im aktuellen Deck gesucht."
            },
            "max_results": {
                "type": "integer",
                "description": "Maximale Anzahl Ergebnisse (default: 10, max: 50)"
            }
        },
        "required": ["query"]
    }
}


def execute_search_deck(args):
    """Search for cards in the user's deck.

    Returns dict with query, cards array, total_found, showing.
    Cards have card_id, front (plain text), back (plain text), deck_name.
    """
    try:
        from .anki_utils import run_on_main_thread, strip_html_and_cloze
    except ImportError:
        from anki_utils import run_on_main_thread, strip_html_and_cloze

    query = args.get("query", "")
    deck_id = args.get("deck_id")
    max_results = min(args.get("max_results", 10), 50)

    if not query:
        return {"query": "", "cards": [], "total_found": 0, "showing": 0}

    def _search():
        from aqt import mw

        # Build Anki search string
        search = query
        if deck_id:
            deck = mw.col.decks.get(int(deck_id))
            if not deck:
                return {"error": "Deck nicht gefunden"}
            search = f'"deck:{deck["name"]}" {query}'
        else:
            did = mw.col.decks.selected()
            deck = mw.col.decks.get(did)
            if deck and deck["name"] != "Default":
                search = f'"deck:{deck["name"]}" {query}'

        card_ids = mw.col.find_cards(search, order=True)
        total_found = len(card_ids)
        showing = min(total_found, max_results)

        cards = []
        for cid in card_ids[:max_results]:
            try:
                card = mw.col.get_card(cid)
                note = card.note()
                front_fields = note.fields[0] if note.fields else ""
                back_fields = note.fields[1] if len(note.fields) > 1 else ""
                deck_name = mw.col.decks.name(card.did)
                cards.append({
                    "card_id": cid,
                    "front": strip_html_and_cloze(front_fields)[:200],
                    "back": strip_html_and_cloze(back_fields)[:200],
                    "deck_name": deck_name,
                })
            except Exception:
                continue

        return {
            "query": query,
            "cards": cards,
            "total_found": total_found,
            "showing": showing,
        }

    # Inner timeout = timeout_seconds - 1
    return run_on_main_thread(_search, timeout=14)


registry.register(ToolDefinition(
    name="search_deck",
    schema=SEARCH_DECK_SCHEMA,
    execute_fn=execute_search_deck,
    category="content",
    config_key=None,  # Always enabled
    agent="tutor",
    display_type="widget",
    timeout_seconds=15,
))
```

- [ ] **Step 2: Verify registration**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
python3 -c "
from tool_registry import registry
t = registry.get('search_deck')
assert t is not None
assert t.display_type == 'widget'
assert t.timeout_seconds == 15
print(f'search_deck registered: display_type={t.display_type}, timeout={t.timeout_seconds}')
"
```

- [ ] **Step 3: Commit**

```bash
git add tool_registry.py
git commit -m "feat(tools): register search_deck tool — searches Anki cards by query"
```

---

### Task 3: Register `get_learning_stats` tool

**Files:**
- Modify: `tool_registry.py` (append after search_deck registration)

- [ ] **Step 1: Add get_learning_stats schema and execute function**

Append to `tool_registry.py`:

```python
# ---------------------------------------------------------------------------
# Learning Stats Tool
# ---------------------------------------------------------------------------

LEARNING_STATS_SCHEMA = {
    "name": "get_learning_stats",
    "description": (
        "Zeigt Lernstatistiken als visuelle Widgets. Die AI wählt die passenden Module "
        "basierend auf dem Kontext. Verfügbare Module: 'streak' (aktuelle Lernserie), "
        "'heatmap' (Aktivität der letzten 30 Tage), 'deck_overview' (Kartenverteilung im Deck)."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "modules": {
                "type": "array",
                "items": {
                    "type": "string",
                    "enum": ["streak", "heatmap", "deck_overview"]
                },
                "description": "Welche Statistik-Module angezeigt werden sollen. Kann einzeln oder kombiniert sein."
            },
            "deck_id": {
                "type": "integer",
                "description": "Deck-ID für deck_overview. Wenn nicht angegeben, wird das aktuelle Deck verwendet."
            }
        },
        "required": ["modules"]
    }
}


def execute_learning_stats(args):
    """Collect learning statistics for the requested modules.

    Returns dict with modules array. Each module has a 'type' key
    plus type-specific data (streak, heatmap, deck_overview).
    """
    try:
        from .anki_utils import run_on_main_thread
    except ImportError:
        from anki_utils import run_on_main_thread

    modules = args.get("modules", [])
    deck_id = args.get("deck_id")

    if not modules:
        return {"error": "Keine Module angegeben"}

    def _collect():
        from aqt import mw
        import time

        result_modules = []

        if "streak" in modules:
            # Calculate streak from revlog
            today = int(time.time())
            day_seconds = 86400
            # Get all review dates (as day offsets from today)
            query = "SELECT DISTINCT date(id/1000, 'unixepoch', 'localtime') as day FROM revlog ORDER BY day DESC"
            rows = mw.col.db.list(query)

            # Count consecutive days from today backwards
            from datetime import date, timedelta
            current_streak = 0
            check_date = date.today()
            review_dates = set(rows)

            while str(check_date) in review_dates:
                current_streak += 1
                check_date -= timedelta(days=1)

            # Best streak: find longest consecutive run in review_dates
            best_streak = 0
            if review_dates:
                sorted_dates = sorted(review_dates)
                run = 1
                for i in range(1, len(sorted_dates)):
                    from datetime import datetime
                    d1 = datetime.strptime(sorted_dates[i-1], "%Y-%m-%d").date()
                    d2 = datetime.strptime(sorted_dates[i], "%Y-%m-%d").date()
                    if (d2 - d1).days == 1:
                        run += 1
                    else:
                        best_streak = max(best_streak, run)
                        run = 1
                best_streak = max(best_streak, run)

            is_record = current_streak >= best_streak and current_streak > 0

            result_modules.append({
                "type": "streak",
                "current": current_streak,
                "best": best_streak,
                "is_record": is_record,
            })

        if "heatmap" in modules:
            # Last 30 days of review activity
            from datetime import date, datetime, timedelta
            days_data = []
            for i in range(29, -1, -1):  # 29 days ago → today
                d = date.today() - timedelta(days=i)
                day_start = int(datetime.combine(d, datetime.min.time()).timestamp()) * 1000
                day_end = day_start + 86400000
                count = mw.col.db.scalar(
                    "SELECT COUNT(*) FROM revlog WHERE id >= ? AND id < ?",
                    day_start, day_end
                ) or 0
                # Map count to level: 0=none, 1=light, 2=moderate, 3=good, 4=heavy
                if count == 0:
                    level = 0
                elif count < 10:
                    level = 1
                elif count < 30:
                    level = 2
                elif count < 60:
                    level = 3
                else:
                    level = 4
                days_data.append(level)

            result_modules.append({
                "type": "heatmap",
                "days": days_data,
                "period": 30,
            })

        if "deck_overview" in modules:
            # Card counts by state
            did = int(deck_id) if deck_id else mw.col.decks.selected()
            deck = mw.col.decks.get(did)
            if not deck:
                result_modules.append({"type": "deck_overview", "error": "Deck nicht gefunden"})
            else:
                deck_name = deck["name"]
                total = len(mw.col.find_cards(f'"deck:{deck_name}"'))
                new_count = len(mw.col.find_cards(f'"deck:{deck_name}" is:new'))
                learn_count = len(mw.col.find_cards(f'"deck:{deck_name}" is:learn'))
                review_count = len(mw.col.find_cards(f'"deck:{deck_name}" is:review'))
                unseen = total - new_count - learn_count - review_count

                result_modules.append({
                    "type": "deck_overview",
                    "name": deck_name,
                    "total": total,
                    "new_count": new_count,
                    "learning_count": learn_count,
                    "review_count": review_count,
                    "unseen_count": max(0, unseen),
                })

        if not result_modules:
            return {"error": "Keine Module konnten geladen werden"}

        return {"modules": result_modules}

    # Inner timeout = timeout_seconds - 1
    return run_on_main_thread(_collect, timeout=9)


registry.register(ToolDefinition(
    name="get_learning_stats",
    schema=LEARNING_STATS_SCHEMA,
    execute_fn=execute_learning_stats,
    category="content",
    config_key=None,  # Always enabled
    agent="tutor",
    display_type="widget",
    timeout_seconds=10,
))
```

- [ ] **Step 2: Verify registration**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
python3 -c "
from tool_registry import registry
t = registry.get('get_learning_stats')
assert t is not None
assert t.display_type == 'widget'
assert t.timeout_seconds == 10

# Verify all 4 tools are registered
names = [registry.get(n).name for n in ['create_mermaid_diagram', 'spawn_plusi', 'search_deck', 'get_learning_stats']]
print(f'All tools: {names}')
"
```

- [ ] **Step 3: Commit**

```bash
git add tool_registry.py
git commit -m "feat(tools): register get_learning_stats tool — streak, heatmap, deck overview modules"
```

---

### Task 4: Create frontend widget components

**Files:**
- Create: `frontend/src/components/ToolWidgetRenderer.jsx`
- Create: `frontend/src/components/ToolLoadingPlaceholder.jsx`
- Create: `frontend/src/components/ToolErrorBadge.jsx`
- Create: `frontend/src/components/CardWidget.jsx`
- Create: `frontend/src/components/CardListWidget.jsx`
- Create: `frontend/src/components/StatsWidget.jsx`

These are all new files. They follow the app's design tokens (`#222224` backgrounds, `16px` radius, opacity-based text hierarchy).

- [ ] **Step 1: Create ToolLoadingPlaceholder.jsx**

```jsx
import React from 'react';

const loadingLabels = {
  search_deck: "Sucht Karten...",
  get_learning_stats: "Lädt Statistiken...",
  spawn_plusi: "Plusi denkt nach...",
};

export default function ToolLoadingPlaceholder({ toolName }) {
  const label = loadingLabels[toolName] || "Lädt...";

  return (
    <div style={{
      background: '#222224',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 16,
      padding: '18px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Shimmer overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.03), transparent)',
        animation: 'shimmer 2.5s infinite',
      }} />
      <div style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: '#0a84ff',
        animation: 'pulse 1.5s ease-in-out infinite',
      }} />
      <span style={{
        fontSize: 13,
        color: 'rgba(255,255,255,0.35)',
        fontWeight: 500,
      }}>{label}</span>
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 2: Create ToolErrorBadge.jsx**

```jsx
import React from 'react';

export default function ToolErrorBadge({ toolName, error }) {
  return (
    <div style={{
      background: 'rgba(255,69,58,0.05)',
      border: '1px solid rgba(255,69,58,0.15)',
      borderRadius: 12,
      padding: '10px 14px',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    }}>
      <span style={{ fontSize: 14 }}>⚠</span>
      <span style={{
        fontSize: 12,
        color: 'rgba(255,69,58,0.8)',
        fontWeight: 500,
      }}>{error || `${toolName} fehlgeschlagen`}</span>
    </div>
  );
}
```

- [ ] **Step 3: Create CardWidget.jsx**

```jsx
import React from 'react';

export default function CardWidget({ cardId, front, back, deckName, onCardClick }) {
  const handleClick = () => {
    if (onCardClick) onCardClick(cardId);
  };

  return (
    <div
      onClick={handleClick}
      style={{
        background: '#222224',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 16,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'border-color 0.2s ease',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(10,132,255,0.3)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}
    >
      <div style={{ padding: '16px 20px', fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 1.5 }}>
        {front}
      </div>
      <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', margin: '0 20px' }} />
      <div style={{ padding: '16px 20px', fontSize: 13, color: 'rgba(255,255,255,0.50)', lineHeight: 1.5 }}>
        {back}
      </div>
      <div style={{
        padding: '10px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'rgba(255,255,255,0.02)',
        borderTop: '1px solid rgba(255,255,255,0.04)',
      }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>{deckName}</span>
        <span style={{ fontSize: 11, color: '#0a84ff', fontWeight: 500 }}>Karte öffnen →</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create CardListWidget.jsx**

```jsx
import React from 'react';
import CardWidget from './CardWidget';

export default function CardListWidget({ query, cards, totalFound, showing, onCardClick }) {
  // Empty state
  if (!cards || cards.length === 0) {
    return (
      <div style={{
        background: '#222224',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 16,
        padding: '24px 20px',
        textAlign: 'center',
      }}>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>
          Keine Karten gefunden für „{query}"
        </span>
      </div>
    );
  }

  // Single card → delegate to CardWidget
  if (cards.length === 1) {
    const c = cards[0];
    return <CardWidget cardId={c.card_id} front={c.front} back={c.back} deckName={c.deck_name} onCardClick={onCardClick} />;
  }

  return (
    <div style={{
      background: '#222224',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 16,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{query}</span>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.30)' }}>
          {showing} von {totalFound}
        </span>
      </div>

      {/* Scrollable list */}
      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
        {cards.map((card, i) => (
          <div
            key={card.card_id}
            onClick={() => onCardClick && onCardClick(card.card_id)}
            style={{
              padding: '12px 20px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              borderTop: i > 0 ? '1px solid rgba(255,255,255,0.03)' : 'none',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.20)',
              fontWeight: 500,
              minWidth: 16,
              fontVariantNumeric: 'tabular-nums',
            }}>{i + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13,
                color: 'rgba(255,255,255,0.80)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                lineHeight: 1.4,
              }}>{card.front}</div>
              <div style={{
                fontSize: 11,
                color: 'rgba(255,255,255,0.30)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                marginTop: 2,
              }}>{card.back}</div>
            </div>
            <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: 14, flexShrink: 0 }}>›</span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        padding: '10px 20px',
        textAlign: 'center',
        borderTop: '1px solid rgba(255,255,255,0.04)',
        background: 'rgba(255,255,255,0.02)',
      }}>
        <button
          disabled
          style={{
            fontSize: 12,
            color: 'rgba(255,255,255,0.35)',
            fontWeight: 500,
            background: 'none',
            border: 'none',
            cursor: 'not-allowed',
            opacity: 0.4,
            padding: '4px 0',
          }}
          title="Bald verfügbar"
        >
          Als aktive Session setzen
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create StatsWidget.jsx**

```jsx
import React from 'react';

// --- Streak Module (Variant B: centered with glow) ---
function StreakModule({ current, best, is_record }) {
  return (
    <div style={{ textAlign: 'center', padding: '8px 0' }}>
      <div style={{
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: 0.3,
        color: 'rgba(255,255,255,0.35)',
        textTransform: 'uppercase',
        marginBottom: 6,
      }}>
        {is_record ? 'Streak — neuer Rekord!' : 'Streak'}
      </div>
      <div style={{
        fontSize: 48,
        fontWeight: 700,
        color: is_record ? '#0a84ff' : 'rgba(255,255,255,0.92)',
        letterSpacing: -2,
        lineHeight: 1,
        textShadow: is_record ? '0 0 30px rgba(10,132,255,0.3)' : 'none',
      }}>
        {current}{is_record && <span style={{ fontSize: 20, marginLeft: 4 }}>🔥</span>}
      </div>
      <div style={{ fontSize: 15, fontWeight: 500, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
        Tage in Folge
      </div>
      <div style={{
        marginTop: 12,
        display: 'flex',
        justifyContent: 'center',
        gap: 24,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontSize: 16,
            fontWeight: 600,
            color: is_record ? '#0a84ff' : 'rgba(255,255,255,0.7)',
          }}>{current}</div>
          <div style={{
            fontSize: 10,
            color: 'rgba(255,255,255,0.25)',
            textTransform: 'uppercase',
            letterSpacing: 0.3,
            marginTop: 2,
          }}>Aktuell</div>
        </div>
        <div style={{ width: 1, background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>{best}</div>
          <div style={{
            fontSize: 10,
            color: 'rgba(255,255,255,0.25)',
            textTransform: 'uppercase',
            letterSpacing: 0.3,
            marginTop: 2,
          }}>{is_record ? 'Vorheriger Rekord' : 'Rekord'}</div>
        </div>
      </div>
    </div>
  );
}

// --- Heatmap Module ---
function HeatmapModule({ days, period }) {
  const levels = [
    'rgba(255,255,255,0.04)',
    'rgba(10,132,255,0.15)',
    'rgba(10,132,255,0.30)',
    'rgba(10,132,255,0.50)',
    'rgba(10,132,255,0.75)',
  ];

  return (
    <div>
      <div style={{
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: 0.3,
        color: 'rgba(255,255,255,0.35)',
        textTransform: 'uppercase',
        marginBottom: 12,
      }}>Aktivität — letzte {period} Tage</div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(15, 1fr)',
        gap: 3,
      }}>
        {(days || []).map((level, i) => (
          <div key={i} style={{
            aspectRatio: '1',
            borderRadius: 3,
            background: levels[level] || levels[0],
            boxShadow: i === days.length - 1 ? '0 0 0 1.5px rgba(10,132,255,0.6)' : 'none',
          }} />
        ))}
      </div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        marginTop: 8,
        justifyContent: 'flex-end',
      }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>weniger</span>
        {levels.map((bg, i) => (
          <div key={i} style={{ width: 10, height: 10, borderRadius: 2, background: bg }} />
        ))}
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>mehr</span>
      </div>
    </div>
  );
}

// --- Deck Overview Module ---
function DeckOverviewModule({ name, total, new_count, learning_count, review_count, unseen_count }) {
  const statColors = {
    new: 'rgba(10,132,255,0.7)',
    learning: 'rgba(255,159,10,0.7)',
    review: 'rgba(48,209,88,0.7)',
    unseen: 'rgba(255,255,255,0.06)',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: 0.3,
          color: 'rgba(255,255,255,0.35)',
          textTransform: 'uppercase',
        }}>{name}</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{total} Karten</div>
      </div>
      {/* Segmented bar */}
      <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 12, gap: 2 }}>
        {new_count > 0 && <div style={{ flex: new_count, background: statColors.new }} />}
        {learning_count > 0 && <div style={{ flex: learning_count, background: statColors.learning }} />}
        {review_count > 0 && <div style={{ flex: review_count, background: statColors.review }} />}
        {unseen_count > 0 && <div style={{ flex: unseen_count, background: statColors.unseen }} />}
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
        {[
          { label: 'Neu', count: new_count, color: statColors.new },
          { label: 'Lernen', count: learning_count, color: statColors.learning },
          { label: 'Reif', count: review_count, color: statColors.review },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} />
            <span>{item.label} <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{item.count}</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Module Router ---
const MODULE_MAP = {
  streak: StreakModule,
  heatmap: HeatmapModule,
  deck_overview: DeckOverviewModule,
};

// --- Main StatsWidget ---
export default function StatsWidget({ modules }) {
  if (!modules || modules.length === 0) return null;
  const single = modules.length === 1;

  return (
    <div>
      {modules.map((mod, i) => {
        const Component = MODULE_MAP[mod.type];
        if (!Component) return null;
        const isFirst = i === 0;
        const isLast = i === modules.length - 1;
        return (
          <div key={i} style={{
            background: '#222224',
            border: '1px solid rgba(255,255,255,0.06)',
            borderBottom: !isLast && !single ? 'none' : '1px solid rgba(255,255,255,0.06)',
            borderRadius: single ? 16 :
              isFirst ? '16px 16px 0 0' :
              isLast ? '0 0 16px 16px' : 0,
            padding: '18px 20px',
            borderTop: !isFirst && !single ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(255,255,255,0.06)',
          }}>
            <Component {...mod} />
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: Create ToolWidgetRenderer.jsx**

```jsx
import React from 'react';
import PlusiWidget from './PlusiWidget';
import CardWidget from './CardWidget';
import CardListWidget from './CardListWidget';
import StatsWidget from './StatsWidget';
import ToolLoadingPlaceholder from './ToolLoadingPlaceholder';
import ToolErrorBadge from './ToolErrorBadge';

export default function ToolWidgetRenderer({ toolWidgets, bridge, isStreaming, isLastMessage }) {
  if (!toolWidgets || toolWidgets.length === 0) return null;

  const handleCardClick = (cardId) => {
    if (bridge && bridge.goToCard) {
      bridge.goToCard(String(cardId));
    }
  };

  return (
    <>
      {toolWidgets.map((tw, i) => {
        // Loading state
        if (tw.displayType === 'loading') {
          return <ToolLoadingPlaceholder key={`loading-${i}`} toolName={tw.name} />;
        }

        // Error state
        if (tw.displayType === 'error') {
          return <ToolErrorBadge key={`error-${i}`} toolName={tw.name} error={tw.error} />;
        }

        // Widget state
        if (tw.displayType === 'widget' && tw.result) {
          switch (tw.name) {
            case 'spawn_plusi':
              return (
                <PlusiWidget
                  key={`plusi-${i}`}
                  mood={tw.result.mood || 'neutral'}
                  text={tw.result.text || ''}
                  metaText={tw.result.meta || ''}
                  isLoading={false}
                  isFrozen={!isStreaming && !isLastMessage}
                />
              );

            case 'search_deck':
              return (
                <CardListWidget
                  key={`cards-${i}`}
                  query={tw.result.query}
                  cards={tw.result.cards}
                  totalFound={tw.result.total_found}
                  showing={tw.result.showing}
                  onCardClick={handleCardClick}
                />
              );

            case 'get_learning_stats':
              return (
                <StatsWidget
                  key={`stats-${i}`}
                  modules={tw.result.modules}
                />
              );

            default:
              return null;
          }
        }

        return null;
      })}
    </>
  );
}
```

- [ ] **Step 7: Commit all new components**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
git add frontend/src/components/ToolWidgetRenderer.jsx \
        frontend/src/components/ToolLoadingPlaceholder.jsx \
        frontend/src/components/ToolErrorBadge.jsx \
        frontend/src/components/CardWidget.jsx \
        frontend/src/components/CardListWidget.jsx \
        frontend/src/components/StatsWidget.jsx
git commit -m "feat(frontend): add ToolWidgetRenderer + CardWidget + CardListWidget + StatsWidget + loading/error components"
```

---

### Task 5: Wire ToolWidgetRenderer into ChatMessage.jsx

**Files:**
- Modify: `frontend/src/components/ChatMessage.jsx`

This replaces the Plusi-specific `plusiData` state and render slot with the generic `toolWidgets` array and `ToolWidgetRenderer`.

- [ ] **Step 1: Replace plusiData state with toolWidgets**

In `ChatMessage.jsx`, find:
```javascript
const [plusiData, setPlusiData] = useState(null);
```
(around line 1230)

Replace with:
```javascript
const [toolWidgets, setToolWidgets] = useState([]);
```

- [ ] **Step 2: Replace the TOOL marker parser**

Find the tool marker parsing block (around lines 1397-1415):
```javascript
        // 5. Tool markers ([[TOOL:{...}]])
        const toolMatches = fixedMessage.matchAll(/\[\[TOOL:(\{.*?\})\]\]/g);
        for (const match of toolMatches) {
            try {
                const toolData = JSON.parse(match[1]);
                if (toolData.name === 'spawn_plusi') {
                    if (toolData.displayType === 'loading') {
                        setPlusiData({ _loading: true });
                    } else if (toolData.displayType === 'widget' && toolData.result) {
                        setPlusiData(toolData.result);
                    } else if (toolData.displayType === 'error') {
                        setPlusiData({ _error: true, message: toolData.error });
                    }
                }
                // Future tools will be handled here
            } catch (e) {
                console.warn('Failed to parse TOOL marker:', e);
            }
        }
```

Replace with:
```javascript
        // 5. Tool markers ([[TOOL:{...}]]) → generic toolWidgets array
        const toolMarkers = [...fixedMessage.matchAll(/\[\[TOOL:(\{.*?\})\]\]/g)];
        if (toolMarkers.length > 0) {
            setToolWidgets(prev => {
                let updated = [...prev];
                for (const match of toolMarkers) {
                    try {
                        const toolData = JSON.parse(match[1]);
                        if (toolData.displayType === 'loading') {
                            updated.push(toolData);
                        } else if (toolData.displayType === 'widget' || toolData.displayType === 'error') {
                            // Replace first loading entry for same tool name
                            const loadingIdx = updated.findIndex(
                                tw => tw.name === toolData.name && tw.displayType === 'loading'
                            );
                            if (loadingIdx >= 0) {
                                updated[loadingIdx] = toolData;
                            } else {
                                updated.push(toolData);
                            }
                        }
                    } catch (e) {
                        console.warn('Failed to parse TOOL marker:', e);
                    }
                }
                return updated;
            });
        }
```

- [ ] **Step 3: Replace PlusiWidget render slot with ToolWidgetRenderer**

Add the import at the top of the file (near the other imports):
```javascript
import ToolWidgetRenderer from './ToolWidgetRenderer';
```

Find the PlusiWidget render block (around lines 1711-1720):
```javascript
            {/* Plusi Widget */}
            {plusiData && (
                <PlusiWidget
                    mood={plusiData._loading ? 'thinking' : (plusiData.mood || 'neutral')}
                    text={plusiData.text || ''}
                    metaText={plusiData.meta || ''}
                    isLoading={!!plusiData._loading}
                    isFrozen={!isStreaming && !isLastMessage}
                />
            )}
```

Replace with:
```javascript
            {/* Tool Widgets (Plusi, Cards, Stats, etc.) */}
            {toolWidgets.length > 0 && (
                <ToolWidgetRenderer
                    toolWidgets={toolWidgets}
                    bridge={bridge}
                    isStreaming={isStreaming}
                    isLastMessage={isLastMessage}
                />
            )}
```

**Note on render order:** The spec says Tool Widgets should render before SafeMarkdownRenderer (text). The current position (where PlusiWidget was) is already before the markdown text block — PlusiWidget at lines 1711-1720 renders before SafeMarkdownRenderer at lines 1738-1748. So the position is correct per the spec.

- [ ] **Step 4: Update the divider condition**

Find the divider condition (around line 1701):
```javascript
                !isUser && !plusiData && !reviewData && message && message.trim().length > 0 && (
```

Replace `!plusiData` with `toolWidgets.length === 0`:
```javascript
                !isUser && toolWidgets.length === 0 && !reviewData && message && message.trim().length > 0 && (
```

- [ ] **Step 5: Remove PlusiWidget import if no longer used directly**

Check if `PlusiWidget` is imported at the top of ChatMessage.jsx. Since it's now imported inside `ToolWidgetRenderer.jsx`, remove the direct import from ChatMessage.jsx:
```javascript
// Remove this line:
import PlusiWidget from './PlusiWidget';
```

- [ ] **Step 6: Build and verify**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend"
npm run build
```
Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ChatMessage.jsx
git commit -m "refactor(frontend): replace plusiData with generic toolWidgets + ToolWidgetRenderer"
```

---

### Task 6: Build, verify, and test in Anki

**Files:** None (verification only)

- [ ] **Step 1: Verify all Python imports**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
python3 -c "
from tool_registry import registry
from tool_executor import execute_tool, ToolResponse
from anki_utils import run_on_main_thread, strip_html_and_cloze

# All 4 tools registered
for name in ['create_mermaid_diagram', 'spawn_plusi', 'search_deck', 'get_learning_stats']:
    t = registry.get(name)
    assert t is not None, f'{name} not registered'
    print(f'{name}: display_type={t.display_type}, timeout={t.timeout_seconds}s')

# Test strip_html_and_cloze
assert strip_html_and_cloze('<b>test</b>') == 'test'
assert strip_html_and_cloze('{{c1::answer::hint}}') == 'answer'
print('All OK')
"
```

- [ ] **Step 2: Build frontend**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend"
npm run build
```

- [ ] **Step 3: Manual test in Anki**

Restart Anki and test:
1. Send "Zeig mir Karten zu [topic]" → should see loading placeholder, then card list widget
2. Send "Wie ist meine Streak?" → should see stats widget with streak module
3. Send "Zeig mir meine Statistiken" → should see combined stats (streak + heatmap + deck overview)
4. Trigger Plusi (emotional message) → should still work through ToolWidgetRenderer
5. Ask for Mermaid diagram → should still work (markdown display_type, no widget)

- [ ] **Step 4: Commit build output**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
git add web/
git commit -m "build: rebuild frontend with learning tools widget system"
```
