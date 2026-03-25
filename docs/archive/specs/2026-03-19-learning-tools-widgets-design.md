# Spec: Learning Tools + Widget System

**Date:** 2026-03-19
**Scope:** Spec 2a — New tools + frontend widget rendering. Builds on Spec 1 (Agentic Core).
**Depends on:** `docs/superpowers/specs/2026-03-19-agentic-core-design.md` (implemented)
**Files affected:** `tool_registry.py`, `bridge.py`, new frontend components, `ChatMessage.jsx`

## Problem

The agentic core (Spec 1) provides the infrastructure — `ToolResponse`, `[[TOOL:...]]` markers, timeouts, loading states — but there are only two tools (Mermaid + Plusi) and the frontend only handles Plusi widgets. The AI assistant needs learning-specific tools and a generic widget rendering system.

## Design

### 1. Two New Tools

#### `search_deck` — Find and display cards

- **display_type:** `"widget"`
- **timeout_seconds:** `15`
- **Trigger:** User asks for cards ("Zeig mir Karten zu Pharmakologie", "Welche Karten hab ich zu Mitose?")

**Schema:**
```python
{
    "name": "search_deck",
    "description": "Sucht Karten im Deck des Nutzers. Verwende dieses Tool wenn der Nutzer nach bestimmten Karten fragt, Karten zu einem Thema sehen möchte, oder du relevante Karten zeigen willst.",
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
```

**Execute function:** Uses Anki's `col.find_cards()` with the query string, loads card data for each result. Card front/back text must be stripped of HTML tags and cloze markup for display. Returns:

```python
def execute_search_deck(args):
    query = args.get("query", "")
    deck_id = args.get("deck_id")  # None = current deck
    max_results = min(args.get("max_results", 10), 50)

    # Runs on main thread via run_on_main_thread() helper (see Section 8)
    # Search in specific deck if deck_id provided
    # Returns plain dict (not json.dumps)
    return {
        "query": query,
        "cards": [
            {
                "card_id": 123,
                "front": "Was ist der Wirkmechanismus von Aspirin?",
                "back": "Hemmt irreversibel COX-1 und COX-2...",
                "deck_name": "Pharmakologie"
            },
            # ... up to max_results
        ],
        "total_found": 45,
        "showing": 10
    }
```

**Empty results:** When no cards match, returns `{"query": query, "cards": [], "total_found": 0, "showing": 0}`. The frontend renders an empty state ("Keine Karten gefunden").

**Deck ID resolution:** If `deck_id` is None, uses `mw.col.decks.selected()` (the currently active deck in Anki). If `deck_id` is provided but invalid, returns an error dict: `{"error": "Deck nicht gefunden"}`.

**HTML stripping:** Card front/back fields contain HTML. Strip with `anki.utils.strip_html()` or a simple regex. Cloze markup `{{c1::answer}}` should show as `answer`.

#### `get_learning_stats` — Modular statistics display

- **display_type:** `"widget"`
- **timeout_seconds:** `10`
- **Trigger:** User asks about progress, stats, or the AI contextually shows stats

**Schema:**
```python
{
    "name": "get_learning_stats",
    "description": "Zeigt Lernstatistiken als visuelle Widgets. Die AI wählt die passenden Module basierend auf dem Kontext. Verfügbare Module: 'streak' (aktuelle Lernserie), 'heatmap' (Aktivität der letzten 30 Tage), 'deck_overview' (Kartenverteilung im Deck).",
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
```

**Execute function:** Collects data from Anki's collection for each requested module. Returns:

```python
def execute_learning_stats(args):
    modules = args.get("modules", [])
    deck_id = args.get("deck_id")  # None = current deck

    result_modules = []

    if "streak" in modules:
        # Calculate from revlog: consecutive days with reviews
        result_modules.append({
            "type": "streak",
            "current": 7,
            "best": 14,
            "is_record": False  # True when current >= best AND current > 0
        })

    if "heatmap" in modules:
        # Last 30 days of review activity from revlog
        # Each value: 0=no activity, 1=light, 2=moderate, 3=good, 4=heavy
        result_modules.append({
            "type": "heatmap",
            "days": [0, 3, 1, 2, 4, 0, 1, ...],  # 30 entries
            "period": 30
        })

    if "deck_overview" in modules:
        # Card counts by state for the deck
        result_modules.append({
            "type": "deck_overview",
            "name": "Pharmakologie",
            "total": 847,
            "new_count": 45,
            "learning_count": 120,
            "review_count": 380,
            "unseen_count": 302
        })

    if not result_modules:
        return {"error": "Keine Module angegeben"}

    return {"modules": result_modules}
```

**Empty modules:** If `modules` is empty or all requested modules fail, returns an error dict. The frontend shows the ToolErrorBadge.

**Main thread access:** Same `run_on_main_thread()` helper as `search_deck` (see Section 8).

### 2. Frontend Widget System

#### ToolWidgetRenderer — Router component

New component that maps tool `name` to the correct widget component. Lives in ChatMessage.jsx's render flow, replacing the current Plusi-only handling.

```
[[TOOL:{"name":"spawn_plusi","displayType":"widget","result":{...}}]]
  → PlusiWidget

[[TOOL:{"name":"search_deck","displayType":"widget","result":{...}}]]
  → CardListWidget (if multiple cards) or CardWidget (if single card)

[[TOOL:{"name":"get_learning_stats","displayType":"widget","result":{...}}]]
  → StatsWidget

[[TOOL:{"name":"any_tool","displayType":"loading"}]]
  → ToolLoadingPlaceholder (spinner + tool name)

[[TOOL:{"name":"any_tool","displayType":"error","error":"..."}]]
  → ToolErrorBadge (inline error message)
```

#### State management change

Currently, ChatMessage.jsx has a single `plusiData` state for Plusi. This needs to become a generic tool data store:

```javascript
// Before:
const [plusiData, setPlusiData] = useState(null);

// After:
const [toolWidgets, setToolWidgets] = useState([]);
// toolWidgets = [
//   { name: "spawn_plusi", displayType: "widget", result: {...} },
//   { name: "search_deck", displayType: "widget", result: {...} },
//   { name: "search_deck", displayType: "loading" },
// ]
```

Uses an array instead of a keyed object. This supports multiple calls to the same tool in one message (e.g., two separate `search_deck` calls). The parser appends to the array. A `loading` entry is replaced by the `widget` entry for the same tool name when it arrives (first match). This is safe because the agent loop executes tools sequentially — the first `loading` marker always corresponds to the first `widget` result for that tool name.

#### CardWidget — Single card display

Renders a single Anki card inline in the chat.

**Props:** `{ cardId, front, back, deckName, onCardClick }`

**Layout:**
- Background `#222224`, border `rgba(255,255,255,0.06)`, border-radius `16px`
- Front text (14px, 85% white)
- Divider line
- Back text (13px, 50% white)
- Footer: deck name left, "Karte öffnen →" right (blue, clickable)
- Click calls `bridge.goToCard(cardId)` (later: opens preview mode)
- Hover: border shifts to `rgba(10,132,255,0.3)`

#### CardListWidget — Scrollable card list

Renders search results as a scrollable list.

**Props:** `{ query, cards, totalFound, showing, onCardClick }`

**Layout:**
- Container: same styling as CardWidget outer shell
- Header: query/deck name (13px, 600 weight) + "10 von 45" count (12px, muted)
- Scrollable list area with fixed max-height (~5 items visible), overflow-y scroll
- Each item: number + front text (truncated) + back preview (truncated, muted) + chevron
- Items separated by subtle borders, hover highlights
- Footer: "Als aktive Session setzen" button (disabled/placeholder for now)
- Click on item calls `bridge.goToCard(cardId)`

**Rendering decision based on `cards.length`:**
- `0` → Empty state: "Keine Karten gefunden für '[query]'" in muted text, same container styling
- `1` → CardWidget (single card with front + back)
- `>1` → CardListWidget (scrollable list)

#### StatsWidget — Modular stats container

Renders stat modules stacked. If multiple modules, borders merge (first gets top radius, last gets bottom radius, middle gets no radius).

**Props:** `{ modules }`

**Module components:**

**StreakModule:** Centered layout (variant B from brainstorm).
- Large number centered, "Tage in Folge" subtitle
- Aktuell vs. Rekord comparison below (separated by vertical line)
- When `is_record`: number turns blue with glow, fire emoji, label "neuer Rekord!"

**HeatmapModule:** GitHub-style activity grid.
- 15-column grid, 2 rows (30 days)
- Blue intensity levels: empty → `rgba(10,132,255, 0.15/0.30/0.50/0.75)`
- Today cell has subtle ring highlight
- Legend: "weniger" ... "mehr"

**DeckOverviewModule:** Segmented bar + legend.
- Deck name + total count in header
- Horizontal bar: new (blue) + learning (orange) + review (green) + unseen (muted)
- Legend row with colored dots + counts

#### ToolLoadingPlaceholder — Generic loading state

Shown when `displayType === "loading"`.

**Layout:**
- Same container styling (`#222224`, border, 16px radius)
- Shimmer animation (same as PlusiWidget loading)
- Text: "Sucht Karten..." / "Lädt Statistiken..." (derived from tool name)
- Replaced by actual widget when `displayType === "widget"` marker arrives for same tool

**Tool name → loading text mapping:**
```javascript
const loadingLabels = {
  search_deck: "Sucht Karten...",
  get_learning_stats: "Lädt Statistiken...",
  spawn_plusi: "Plusi denkt nach...",
  // Fallback: "Lädt..."
};
```

#### ToolErrorBadge — Inline error display

Shown when `displayType === "error"`.

**Layout:**
- Subtle red-tinted container: `background: rgba(255,69,58,0.05)`, `border: 1px solid rgba(255,69,58,0.15)`
- Error icon + message text
- Compact, does not dominate the chat

### 3. Rendering Priority in ChatMessage.jsx

Update the render order to accommodate multiple tool widgets:

```
1. ReviewResult (if present)
2. Tool Widgets (all tools from toolData, rendered via ToolWidgetRenderer)
3. ReviewFeedback (if present)
4. MultipleChoiceCard (if present)
5. SafeMarkdownRenderer (text content)
```

PlusiWidget moves from its own special render slot into the generic ToolWidgetRenderer.

### 4. Design Tokens (from app design system)

All widgets use these exact values:

```
Background:     #222224
Border:         1px solid rgba(255,255,255, 0.06)
Border-radius:  16px
Text primary:   rgba(255,255,255, 0.92) — 26px stat values
Text secondary: rgba(255,255,255, 0.55) — 13px body text
Text tertiary:  rgba(255,255,255, 0.35) — 11px labels, uppercase
Text muted:     rgba(255,255,255, 0.25) — 11px hints
Accent:         #0a84ff — links, active states, streak glow
Font:           -apple-system, BlinkMacSystemFont, SF Pro Text, system-ui
Stat colors:    New=#0a84ff(70%), Learning=#ff9f0a(70%), Review=#30d158(70%)
```

### 5. Migration: PlusiWidget into generic system

PlusiWidget currently has its own state (`plusiData`) and render slot. After this change:
- `plusiData` is removed; Plusi data lives in the `toolWidgets` array like all other tools
- PlusiWidget renders through ToolWidgetRenderer like all other tools
- PlusiWidget.jsx itself is unchanged — only the wiring in ChatMessage.jsx changes

### 6. "Als aktive Session setzen" Button

The CardListWidget shows this button in its footer. For now:
- Button is visible but disabled (greyed out, `opacity: 0.4`, `cursor: not-allowed`)
- Tooltip or small text: "Bald verfügbar"
- Will be activated when Preview Mode feature is implemented (separate spec/chat)

### 7. Main Thread Access Pattern

Both `search_deck` and `get_learning_stats` need to access `mw.col` which is only safe on the main Qt thread. The tool executor runs tools in a daemon thread (via `_run_with_timeout`). We need a helper to marshal calls to the main thread.

**Note:** `execute_plusi` does NOT use this pattern — it makes HTTP requests which are thread-safe. The new tools are the first to access `mw.col` from a tool.

**Helper function** (add to `tool_registry.py` or a new `anki_utils.py`):

```python
def run_on_main_thread(fn, timeout=14):
    """Run a function on the main Qt thread and wait for the result.

    Args:
        fn: Callable that takes no arguments and returns a value.
        timeout: Max seconds to wait. Should be less than the tool's
                 timeout_seconds to avoid double-timeout conflicts.

    Returns:
        The return value of fn.

    Raises:
        TimeoutError: If the main thread doesn't respond in time.
        Exception: Any exception raised by fn.
    """
    from aqt.qt import QTimer
    import threading

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
```

**Double-timeout prevention:** The `timeout` parameter of `run_on_main_thread` must be strictly less than the tool's `timeout_seconds`. For `search_deck` (15s timeout), inner wait is 14s. For `get_learning_stats` (10s timeout), inner wait is 9s. This ensures the inner wait always resolves (success or timeout) before the outer `_run_with_timeout` fires.

**Usage in execute functions:**

```python
def execute_search_deck(args):
    query = args.get("query", "")
    deck_id = args.get("deck_id")
    max_results = min(args.get("max_results", 10), 50)

    def _search():
        from aqt import mw
        # Build Anki search string
        search = query
        if deck_id:
            deck = mw.col.decks.get(deck_id)
            if not deck:
                return {"error": "Deck nicht gefunden"}
            search = f'"deck:{deck["name"]}" {query}'
        else:
            did = mw.col.decks.selected()
            deck = mw.col.decks.get(did)
            if deck:
                search = f'"deck:{deck["name"]}" {query}'

        card_ids = mw.col.find_cards(search, order=True)
        # ... build card list, strip HTML, etc.

    # Inner timeout = timeout_seconds - 1 (search_deck has 15s, so 14s here)
    return run_on_main_thread(_search, timeout=14)
```

**Convention:** The inner `run_on_main_thread` timeout should always be `timeout_seconds - 1` for the tool. This is documented here rather than enforced in code — tool authors must follow this rule.
```

### 8. Out of Scope

- Preview Mode (separate feature — card opens in reviewer-like view without changing queue)
- New stat modules beyond streak/heatmap/deck_overview (future, system is modular)
- Card creation tool (future)
- "Als aktive Session setzen" functionality (future, button is placeholder)
- Karten-Chat context switching when clicking a card (part of Preview Mode)
