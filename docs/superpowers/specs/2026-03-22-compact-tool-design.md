# Compact Tool — Insight Extraction Redesign

**Date:** 2026-03-22
**Status:** Approved

## Problem

The current insight extraction system doesn't work reliably:
- The extraction prompt produces invalid JSON
- The manual `ExtractInsightsButton` is forgettable and has broken error handling
- There's no intelligent trigger — it's either manual (forgotten) or auto-on-reset (disruptive)
- The "neu" labels for new insights are never populated
- No merge logic for accumulating insights across sessions

## Solution

Replace the manual button with an AI-initiated **`compact` tool**. The AI model decides when a chat is long or a topic is concluded, calls `compact` as its last tool, and a confirmation widget appears at the end of the AI message. On user confirmation, the chat is cleared and the existing `InsightsDashboard` shows a skeleton loading state while extraction runs in the background.

## Core Flow

```
User chats with card
  → AI responds normally + calls compact tool at end of message
  → Compact widget renders: "Zusammenfassen?" + Confirm/Skip buttons
  → User clicks "Zusammenfassen"
  → Chat clears instantly (transition animation)
  → InsightsDashboard appears with skeleton shimmer bars
  → InsightExtractionThread runs in background
  → Skeleton bars replaced by real insights (with "neu" labels)
  → User can navigate to next card at any point — extraction continues
```

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Trigger | AI-initiated tool call | Contextually intelligent — no manual button, no wasteful auto-trigger |
| Suggestion UI | Widget at end of normal AI response | Organic, not a separate message or floating UI element |
| After confirm | Chat cleared, InsightsDashboard shown | Clean cycle: chat → destillate → chat → better destillate |
| Merge strategy | Smart merge (AI reconsolidates) | Old insights passed as context, AI produces unified list |
| New-insight tracking | Text hash comparison | Survives reordering from smart merge |
| Token cost | Only on user confirmation | No background cost — extraction happens only when user agrees |

## Components

### 1. Tool Definition (`ai/tools.py`)

Register via `ToolDefinition`:

```python
registry.register(ToolDefinition(
    name="compact",
    schema={
        "name": "compact",
        "description": "Schlage dem Nutzer vor, den bisherigen Chat zusammenzufassen "
                       "und die Lernerkenntnisse zu extrahieren. Nutze dieses Tool "
                       "am ENDE deiner Antwort, wenn der Chat lang wird (>6 Nachrichten) "
                       "oder wenn ein Thema abgeschlossen scheint. "
                       "Das Tool rendert einen Bestätigungs-Button.",
        "parameters": {}
    },
    execute_fn=lambda args: {"type": "compact"},
    display_type="widget",
    timeout_seconds=1,
))
```

No parameters needed — the tool is a signal, not a data carrier. The `execute_fn` returns immediately with a widget marker. `display_type="widget"` ensures `ToolWidgetRenderer` handles it.

### 2. Tool Executor (`ai/tool_executor.py`)

No special handling needed — the `execute_fn` returns `{"type": "compact"}`, which gets wrapped in the standard `ToolResponse`. The frontend receives it as a tool widget with `tw.name === "compact"`.

### 3. Compact Widget (`frontend/src/components/ToolWidgetRenderer.jsx`)

New `case 'compact':` in the existing `switch (tw.name)` block (matching the pattern of all other tools):

- Renders at the end of the AI message (inline, like other tool widgets)
- Text: "Soll ich die Erkenntnisse zusammenfassen?"
- Two buttons:
  - **"Zusammenfassen"** — accent-colored, triggers extraction flow
  - **"Nein danke"** — muted text, dismisses the widget (fades out)
- After click on "Zusammenfassen":
  - Button changes to loading state briefly
  - Triggers the extraction flow (see section 5)
- After click on "Nein danke":
  - Widget fades out / collapses
  - Chat continues normally

Styling: use `var(--ds-*)` tokens exclusively. Compact, not attention-grabbing — it's a suggestion, not a modal.

### 4. Improved Extraction Prompt (`storage/insights.py`)

Replace `build_extraction_prompt()` with a more reliable prompt:

```
Du extrahierst Lernerkenntnisse aus einem Chat über eine Anki-Karte.

KARTE: {question}

BISHERIGE ERKENNTNISSE: {existing_insights_json OR "Keine"}

CHAT:
{formatted_messages}

AUFGABE:
- Extrahiere die wichtigsten Lernpunkte als kurze Stichpunkte
- Typ "learned": Konzept verstanden, Wissen bestätigt
- Typ "weakness": Fehler gemacht, Verwechslung, Unsicherheit
- Priorisiere: Fehler des Nutzers > neue Konzepte > Bestätigungen
- Merge mit bisherigen Erkenntnissen: Duplikate entfernen, Widersprüche aktualisieren, max 10 Einträge
- NUR das JSON-Objekt ausgeben, KEIN anderer Text

BEISPIEL-OUTPUT:
{"version":1,"insights":[{"text":"Kompetitive Hemmung erhöht Km, nicht Vmax","type":"learned"},{"text":"Verwechslung: allosterisch ≠ nicht-kompetitiv","type":"weakness"}]}
```

Key improvements over current prompt:
- Few-shot example for reliable JSON output
- Explicit merge instructions
- Clearer type definitions
- Single-line JSON example (less parsing ambiguity)

### 5. Extraction Flow (after user confirms)

Reuses existing infrastructure with minimal changes:

**Frontend (`App.jsx` / `useInsights.js`):**
1. Clear chat messages (existing `clearMessages` / state reset)
2. Set `isExtracting = true` → `InsightsDashboard` renders in skeleton state
3. Send `extractInsights` message to backend (existing message handler)
4. Listen for `ankiInsightExtractionComplete` event (existing listener)
5. On completion: update insights state, skeleton bars replaced by real text

**Backend (`ui/widget.py`):**
1. `_msg_extract_insights()` creates `InsightExtractionThread` (existing)
2. Thread builds prompt with existing insights for smart merge
3. Calls AI, parses response, saves to storage
4. Computes `new_indices` by comparing insight text hashes against `seen_hashes`
5. Embeds `new_indices` as a top-level key in the JSON string emitted by `finished_signal(int, str)` — no signal signature change needed. E.g.: `{"version":1,"insights":[...],"new_indices":[2,4]}`
6. `_on_extraction_done` in `widget.py` extracts `new_indices` from the JSON and includes it in the `insightExtractionComplete` event payload to frontend
7. Frontend receives via event, renders insights with "neu" labels

### 6. Skeleton State in InsightsDashboard

Small addition to existing `InsightsDashboard.jsx`:

**Fresh extraction (no previous insights):** When `isExtracting === true` AND `insights.insights.length === 0`:
- Render 4-5 skeleton rows instead of insight bullets
- Each row: gray dot + shimmer bar (same width variation as real insights)
- Stats section at bottom renders normally (data already available)
- Shimmer animation: `linear-gradient` sweep, same as existing `isExtracting` overlay but applied per-row
- When extraction completes: skeleton rows replaced by real `InsightBullet` components

**Re-extraction (existing insights present):** When `isExtracting === true` AND `insights.insights.length > 0`:
- Keep existing insights visible
- Show the existing shimmer overlay (lines 30-39 of current `InsightsDashboard.jsx`)
- When extraction completes: insights list updates in-place, new ones get "neu" labels

### 7. "Neu" Labels — Hash-Based Tracking

**Storage format** (in `card_sessions.summary` JSON):
```json
{
  "version": 1,
  "insights": [...],
  "seen_hashes": ["a1b2c3", "d4e5f6"]
}
```

**Hash:** Simple hash of insight text (e.g., first 8 chars of MD5 or a short string hash). Only needs to be deterministic, not cryptographic.

**Flow:**
1. After extraction: compare each insight's text hash against `seen_hashes`
2. Insights with unknown hashes → `new_indices` array sent to frontend
3. Frontend shows "neu" label (existing `newInsightIds` prop + rendering code)
4. When user has viewed the dashboard (tracked via visibility — e.g., 3 seconds on screen, or on card change): frontend sends `markInsightsSeen` message
5. Backend updates `seen_hashes` to include all current insight hashes

**Backend handler:** New message `_msg_mark_insights_seen(data)` — loads current insights, computes all hashes, saves as `seen_hashes`.

### 8. Removals

- **`ExtractInsightsButton.jsx`** — no longer needed, replaced by compact tool widget
- **`ExtractInsightsButton` import/usage in `App.jsx`** — remove
- **Auto-extraction on chat reset** in `App.jsx` (lines ~1858-1873) — remove, compact tool replaces this

### 9. Files Changed

**Modified:**
- `ai/tools.py` — add `compact` tool definition
- `ai/tool_executor.py` — handle `compact` tool call (return widget data)
- `frontend/src/components/ToolWidgetRenderer.jsx` — add CompactWidget case
- `frontend/src/components/InsightsDashboard.jsx` — add skeleton loading state
- `frontend/src/hooks/useInsights.js` — add `markInsightsSeen` method, handle `new_indices`
- `frontend/src/App.jsx` — remove ExtractInsightsButton, wire compact confirmation to extraction flow
- `storage/insights.py` — improved extraction prompt, hash utilities
- `ui/widget.py` — add `_msg_mark_insights_seen` handler, send `new_indices` in extraction result

**Removed:**
- `frontend/src/components/ExtractInsightsButton.jsx`

### 10. Edge Cases

| Scenario | Behavior |
|----------|----------|
| Model calls compact on <3 user messages | Extraction runs but may produce thin results — acceptable, model is trusted to judge |
| Extraction fails (API error, invalid JSON) | `InsightExtractionThread` retries once (existing). On final failure: skeleton reverts to empty state, error logged. Chat is already cleared — user can start fresh |
| User navigates away mid-extraction | Thread runs to completion, saves to storage. UI update is ignored (card mismatch). Insights available on next card visit |
| Model calls compact twice in same session | User must confirm each time. Smart merge handles it — second extraction merges with first |
| Card has no previous insights | `seen_hashes` is empty, all extracted insights are "new" |

**Not changed:**
- `InsightBullet.jsx` — already supports "neu" rendering
- `MiniChart.jsx` — unchanged
- `InsightExtractionThread` — core logic unchanged (prompt change is in `storage/insights.py`)
- `card_sessions.py` — `save_insights` does a full JSON replace of the `summary` column, which naturally preserves `seen_hashes` as long as the caller includes it in the dict. The `InsightExtractionThread` must include `seen_hashes` when saving. No changes to `card_sessions.py` itself needed.
- `ai/system_prompt.py` — insight injection unchanged
- `ui/bridge.py` — no bridge changes (uses message queue pattern)
