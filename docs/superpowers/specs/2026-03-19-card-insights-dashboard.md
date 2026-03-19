# Card Insights Dashboard — Design Spec

## Overview

A per-card dashboard that replaces the empty chat state, combining accumulated learning insights from past chats with fine-grained review statistics. Serves dual purpose: visual learning summary for the user AND clean AI context (replacing full chat history).

## Problem

- When a chat is reset, all learning context is lost
- The AI currently receives full old chat messages as context — noisy, expensive, often irrelevant
- The empty chat state ("Stelle eine Frage zur aktuellen Karte") wastes valuable screen space
- No per-card learning progress visualization exists

## Solution

### Visual Design

The dashboard fills the entire chat panel background when no active chat messages exist.

**Erkenntnisse (top, prominent):**
- Subtle title: "Aus X Chats extrahiert" — `font-size: 11px`, `color: rgba(232,232,232,0.12)`
- Bullet points with colored dots:
  - Green (`rgba(74,158,108,0.55)`) = learned/understood concepts
  - Red (`rgba(180,80,70,0.55)`) = mistakes/corrections/things to watch out for
- Text: `15px`, `font-weight: 500`, `color: rgba(232,232,232,0.8)`, staccato phrasing (not full sentences)
- Card citations possible: superscript numbers linking to other cards via `goToCard(cardId)`, reusing `CardRefChip` pattern
- Content vertically centered in available space above ChatInput overlay

**Statistiken (bottom, subtle):**
- Three key numbers left-aligned: REV (total reviews), OK% (success rate), IVL (current interval)
  - `font-size: 15px`, `font-weight: 500`, `color: rgba(232,232,232,0.3)`
  - Labels: `font-size: 8px`, `color: rgba(232,232,232,0.1)`
- Main chart right of numbers: distinct violet tone (`rgba(140,120,200)`) — intentionally different from type charts to avoid association
  - SVG line chart with gradient fill (color → transparent top to bottom)
  - Grid lines at `rgba(255,255,255,0.02)`
- Three mini charts below in a row (FLIP, MC, TEXT):
  - Each with own color: teal (`rgba(20,184,166)`), blue (`rgba(10,132,255)`), orange (`rgba(249,115,22)`)
  - Each with gradient fill and grid lines
  - Labels: `font-size: 8px`, `color: rgba(232,232,232,0.1)`
- Charts show performance progression per answer type from `revlog` data

**Color separation principle:** Bullet dot colors (muted green/red) are intentionally distinct from chart colors (violet/teal/blue/orange) to avoid visual association between insights and specific chart types.

### Interaction Flow

1. **User opens card** → Dashboard visible as chat background (insights + stats)
2. **User types first message** → Dashboard disappears, normal chat takes over
3. **User finishes chatting** → Can continue to next card via "Weiter SPACE"
4. **User returns to card in later session** → Fresh chat, old chat was auto-summarized into insights
5. **"Erkenntnisse" button** (replaces "Übersicht" in ChatInput action bar) → Toggles between chat view and dashboard view during an active chat

### Reset = Summarize (Atomic)

**Trigger conditions:**
- **Manual reset:** User clicks reset button (existing `handleResetChat()`)
- **Card change:** User navigates to a different card (via `reviewer_did_show_question` hook) — if current card had ≥2 user messages, extraction triggers
- **Minimum threshold:** Extraction only triggers if the chat contains ≥2 user messages. Single-message chats are too shallow to extract meaningful insights.
- **Unexpected exit (Anki close):** Messages persist in SQLite. Extraction runs on next card load if un-extracted messages exist (check `card_sessions.updated_at` vs last extraction timestamp).

**Process:**
1. AI receives: card context + current chat messages (tools stripped) + existing insights + session performance data
2. AI extracts new insights, merges with existing ones
3. Updated insights stored in `card_sessions.summary` (SQLite field exists, currently unused)
4. Chat messages cleared from RAM, fresh chat starts
5. Dashboard re-appears with updated insights

**Execution model:** Extraction runs in background using existing `AIRequestThread` pattern. User sees a subtle shimmer animation on the dashboard while extraction is in progress. If the user rapidly switches cards, any pending extraction is cancelled (only the latest card's extraction runs). On failure (network error, malformed JSON), existing insights are preserved unchanged — no data loss.

### AI Extraction Process

**Approach:** Inkrementell (A) — merge new findings into existing insights each time. Full re-extraction is not performed; existing insights serve as the accumulation layer.

**Model:** Uses the user's configured model/provider (same as chat). Estimated cost per extraction: ~500-1000 input tokens, ~200 output tokens.

**Input context for extraction prompt:**
- Card content (question, answer, fields, tags)
- Current chat messages with tool outputs stripped (reduce tokens)
- Existing insights/summary (if any)
- Performance data from the current session (score, answer type, errors)

**Extraction prompt structure:**
```
System: Du extrahierst Lernerkenntnisse aus einem Chat über eine Anki-Lernkarte.

Karteninhalt: {card question + answer}
Bisherige Erkenntnisse: {existing insights JSON or "Keine"}
Chat-Verlauf: {messages, tools stripped}
Session-Performance: {answer type, score, errors}

Regeln:
- Formuliere stichpunktartig, keine ganzen Sätze
- Priorisiere: User-Fehler > neue Konzepte > Bestätigungen
- Typ "learned" = verstanden/gelernt, Typ "weakness" = Fehler/Unsicherheit
- Wenn eine andere Karte relevant ist, füge cardId als Citation hinzu
- Merge mit bestehenden Erkenntnissen: update wenn sich etwas verändert hat, ergänze nur wirklich Neues
- Maximal 10 Erkenntnisse pro Karte — wenn das Limit erreicht ist, ersetze die am wenigsten relevante
- Antworte ausschließlich im JSON-Format

Output-Format: {schema}
```

**Error handling:** If the AI returns malformed JSON, retry once. If still invalid, log the error and preserve existing insights unchanged.

**Extraction priorities:**
1. User input — what did the user believe, ask about, struggle with?
2. Errors/corrections — what mistakes were made and corrected?
3. New concepts learned — what was explained and confirmed?
4. Cross-references — are other cards relevant? (include card IDs for citations)

**Output format:** Structured JSON array of insight objects:
```json
{
  "version": 1,
  "insights": [
    {
      "text": "Plexus lumbosacralis = Rami ventrales L1-S3",
      "type": "learned",
      "citations": [{ "cardId": 1234567, "label": "1" }]
    },
    {
      "text": "Dermatome untere Extremität -- Zuordnung unsicher",
      "type": "weakness",
      "citations": []
    }
  ]
}
```

**Type mapping to visual:**
- `"learned"` → green dot
- `"weakness"` → red dot

**Limits:** Maximum 10 insights per card. When the limit is reached, the AI replaces the least relevant insight rather than appending. This keeps the dashboard scannable and token usage bounded.

### Erkenntnisse Toggle Behavior

When the user taps "Erkenntnisse" during an active chat:
- Chat view slides out, dashboard slides in (simple opacity transition, 200ms)
- Dashboard shows the last-saved insights (not live-updated during chat)
- Citations are interactive — tapping a citation calls `goToCard(cardId)`
- Tapping "Erkenntnisse" again (or the chat input) returns to the chat at the same scroll position
- No data is modified during toggle — it's purely a view switch

### Empty State (No Data)

Two distinct states:

**Card with reviews but no chats:**
- Stats section shows real data from `revlog` (charts, REV/OK%/IVL numbers)
- Insights section shows placeholder: "Noch keine Erkenntnisse — starte einen Chat, um Lernpunkte zu sammeln"

**Brand new card (0 reviews, no chats):**
- Dashboard layout visible with full placeholder state
- Empty chart areas (flat baseline)
- Stats show "0 REV · — · —"
- Insights placeholder as above

### AI Context Usage

Instead of passing old chat messages to the AI for new conversations, pass only:
- The extracted insights array
- Card content and stats
- Current chat messages

This dramatically reduces token usage and improves response quality by providing clean, distilled context.

## Data Model

### Storage

Uses existing `card_sessions.summary` TEXT field in SQLite (`card_sessions_storage.py`). Stores JSON string of the insights structure above.

### Statistics Data Source

All from existing Anki data, no new storage needed:
- `card.reps`, `card.lapses`, `card.ivl`, `card.factor` — from Anki card object
- `knowledgeScore` — already calculated in `card_tracker.py`
- `revlog` table — individual review history with timestamps, ease (1-4), answer time
- `review_sections.performance_data` — per-session performance (answer type, score)

### Chart Data Derivation

- **Main chart (violet):** `revlog` entries plotted over time, y-axis = ease rating or derived score
- **FLIP/MC/TEXT charts:** Filter `review_sections` by `performance_type`, plot scores over time
- All charts show progression trend (improvement/decline over sessions)

## Frontend Components

### New Components
- `InsightsDashboard.jsx` — main dashboard component, renders when `messages.length === 0`
- `InsightBullet.jsx` — single insight with colored dot and optional citation chips
- `MiniChart.jsx` — reusable SVG sparkline with gradient fill and grid

### Modified Components
- `App.jsx` — render `InsightsDashboard` in empty state instead of current placeholder text
- `ChatInput` action bar — replace "Übersicht" with "Erkenntnisse" toggle
- `useChat.js` — trigger insight extraction on reset

### Bridge Methods (New)
- `getCardInsights(cardId)` — load insights from `card_sessions.summary`
- `saveCardInsights(cardId, insightsJson)` — save updated insights
- `getCardRevlog(cardId)` — fetch review history for charts. Queries Anki's `revlog` table via `mw.col.db.execute()` (main thread only). Returns array of `{timestamp, ease, ivl, time}` objects, aggregated to max 50 data points per card for performance.

## Design Tokens (from existing system)

- Background: `#161616`
- Text primary: `rgba(232,232,232,0.8)` (insights)
- Text secondary: `rgba(232,232,232,0.3)` (stats numbers)
- Text tertiary: `rgba(232,232,232,0.1)` (labels)
- Insight dot green: `rgba(74,158,108,0.55)`
- Insight dot red: `rgba(180,80,70,0.55)`
- Chart main: `rgba(140,120,200,0.35)` (violet)
- Chart FLIP: `rgba(20,184,166,0.2)` (teal)
- Chart MC: `rgba(10,132,255,0.18)` (blue)
- Chart TEXT: `rgba(249,115,22,0.18)` (orange)
- Gradient fills: same colors, 0.1 → 0 opacity top to bottom
- Grid lines: `rgba(255,255,255,0.02)`
- Separator: `linear-gradient(90deg, rgba(232,232,232,0.03), rgba(232,232,232,0.06), rgba(232,232,232,0.03))`

## Visual Reference

See mockup: `.superpowers/brainstorm/` directory (local only, not committed)
