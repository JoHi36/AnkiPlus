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

**Execute function:** Uses Anki's `col.find_notes()` with the query string, loads card data for each result. Returns:

```python
def execute_search_deck(args):
    query = args.get("query", "")
    deck_id = args.get("deck_id")  # None = current deck
    max_results = min(args.get("max_results", 10), 50)

    # Use Anki's search (runs on main thread via QTimer.singleShot)
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

**Important:** Since Anki's collection can only be accessed from the main thread, the execute function must use `QTimer.singleShot(0, ...)` with a threading event to marshal the call. This is the same pattern used by `execute_plusi`.

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
            "is_record": False  # True when current >= best
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

    return {"modules": result_modules}
```

**Main thread access:** Same pattern as `search_deck` — uses `QTimer.singleShot(0, ...)` to marshal Anki collection access to the main Qt thread.

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
const [toolData, setToolData] = useState({});
// toolData = { "spawn_plusi": {result}, "search_deck": {result}, ... }
```

The `[[TOOL:...]]` parser sets data per tool name. Multiple tools in one message are supported.

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

**Single vs. List decision:** The widget checks `cards.length`. If 1 → renders CardWidget. If >1 → renders CardListWidget.

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
- `plusiData` merges into `toolData["spawn_plusi"]`
- PlusiWidget renders through ToolWidgetRenderer like all other tools
- PlusiWidget.jsx itself is unchanged — only the wiring in ChatMessage.jsx changes

### 6. "Als aktive Session setzen" Button

The CardListWidget shows this button in its footer. For now:
- Button is visible but disabled (greyed out, `opacity: 0.4`, `cursor: not-allowed`)
- Tooltip or small text: "Bald verfügbar"
- Will be activated when Preview Mode feature is implemented (separate spec/chat)

### 7. Out of Scope

- Preview Mode (separate feature — card opens in reviewer-like view without changing queue)
- New stat modules beyond streak/heatmap/deck_overview (future, system is modular)
- Card creation tool (future)
- "Als aktive Session setzen" functionality (future, button is placeholder)
- Karten-Chat context switching when clicking a card (part of Preview Mode)
