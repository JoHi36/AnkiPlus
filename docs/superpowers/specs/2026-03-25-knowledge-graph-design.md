# Knowledge Graph — Design Spec

**Date:** 2026-03-25
**Status:** Draft
**Feature:** 3D Knowledge Graph as primary navigation + term-level learning

## Overview

Replace the flat deck browser with an interactive 3D Knowledge Graph as the app's home screen. Fachbegriffe (technical terms) extracted from cards form nodes; shared card associations form edges. Users navigate by exploring the graph, searching terms, asking questions, and launching dynamic study stacks from clusters.

Additionally, terms are marked on cards during review (like AMBOSS underlines). Clicking a marked term shows the same unified TermPopup component used in the graph.

## Goals

1. **Visual knowledge navigation** — see connections between concepts across decks
2. **Dynamic stack creation** — select a cluster or search a term → start reviewing the most relevant cards
3. **On-demand definitions** — click any term → LLM-generated definition from your own cards, cached
4. **Term marking in reviewer** — Fachbegriffe highlighted on cards, clickable for definitions
5. **Offline-first** — all data local (SQLite), no external dependency for core functionality

## Non-Goals

- Replacing the chat/tutor system (chat lives in the reviewer session)
- Building a general-purpose graph database
- Real-time collaborative editing of the graph

## Architecture

### Three Layers

```
┌─────────────────────────────────────────────────┐
│  FRONTEND                                        │
│  ┌──────────────┐  ┌──────────────────────────┐ │
│  │ GraphView    │  │ TermPopup                │ │
│  │ (3d-force-   │  │ (unified: Graph +        │ │
│  │  graph lib)  │  │  Reviewer, definition,   │ │
│  │              │  │  sources, "Stapel        │ │
│  │  Home screen │  │  starten")               │ │
│  └──────────────┘  └──────────────────────────┘ │
├─────────────────────────────────────────────────┤
│  BRIDGE (existing, extended)                     │
│  New slots: getGraphData, getTermDefinition,    │
│  searchGraph, getTermCards                       │
├─────────────────────────────────────────────────┤
│  BACKEND                                         │
│  ┌──────────────┐  ┌────────────┐  ┌──────────┐│
│  │TermExtractor │  │ GraphIndex │  │ TermCache ││
│  │ (pluggable:  │  │ (SQLite:   │  │ (SQLite:  ││
│  │  A=local,    │  │  terms,    │  │  defini-  ││
│  │  B=LLM)      │  │  edges,    │  │  tions,   ││
│  └──────────────┘  │  weights)  │  │  LLM /    ││
│         ↑          └────────────┘  │  Research) ││
│  Embedding Pipeline (existing)     └──────────┘│
└─────────────────────────────────────────────────┘
```

### Data Flow

1. Embedding pipeline runs at startup → extracts terms per card alongside embeddings
2. GraphIndex builds inversion index + edge weights from term co-occurrence
3. Frontend loads graph data once → renders 3D with `3d-force-graph`
4. User interacts → search via embedding similarity, click via TermPopup
5. Definitions generated on-demand (Gemini Flash) and cached in SQLite

## Term Extraction

### TermExtractor Interface

```python
class TermExtractor:
    def extract(self, card_text: str) -> list[str]:
        """Returns list of technical terms found in card text."""
```

Pluggable: Implementation A (local) can be swapped for Implementation B (LLM) without changing consumers.

### Implementation A: Local (Initial)

1. Strip HTML, normalize text
2. Filter stopwords (DE + EN, ~600 words)
3. Remove words < 3 characters
4. Multi-word term detection:
   - **Uppercase chains:** Consecutive capitalized words in German text → single term ("Obere Extremität", "Plexus brachialis")
   - **Hyphen/slash compounds:** "Na/K-ATPase", "Acetyl-CoA", "Henderson-Hasselbalch" → single term
   - **N-gram collocation (PMI):** Across all cards, compute Pointwise Mutual Information for adjacent word pairs. Parameters: minimum co-occurrence count = 3, PMI threshold = 3.0, window = adjacent words only (bigrams). Corpus = all card texts concatenated. Results cached in memory after first computation. Only applied to pairs where both words are already candidate terms (post-stopword-filter), keeping the search space manageable (~O(unique_terms^2) but bounded by adjacency)
5. Output: `["Kollagen", "Osteogenesis imperfecta", "Typ-I-Kollagen", ...]`

### Implementation B: LLM (Future Upgrade)

- Gemini Flash in batches of 50 cards (~170 calls for 8300 cards, one-time)
- Better multi-word detection, synonym grouping ("OI" = "Osteogenesis imperfecta")
- Drop-in replacement via same interface

### Incremental Updates

The pipeline detects new/changed/deleted cards via `content_hash` comparison:
- New cards → extract terms + embed
- Changed cards → re-extract terms + re-embed
- Deleted cards → remove from index
- Only recompute edge weights for affected terms

## Database Schema

All tables in existing `card_sessions.db`:

```sql
-- Terms per card (canonical many-to-many, source of truth)
CREATE TABLE kg_card_terms (
    card_id        INTEGER,
    term           TEXT,
    deck_id        INTEGER,           -- Denormalized for fast per-deck queries
    is_definition  BOOLEAN DEFAULT 0,
    PRIMARY KEY (card_id, term)
);
CREATE INDEX idx_kg_card_terms_term ON kg_card_terms(term);

-- Term metadata (frequency derived from kg_card_terms, no JSON arrays)
CREATE TABLE kg_terms (
    term       TEXT PRIMARY KEY,
    frequency  INTEGER,               -- COUNT(*) from kg_card_terms, updated on write
    embedding  BLOB                   -- Term embedding for vector search
);

-- Edges (shared cards between terms, pruned: weight >= 2 only)
CREATE TABLE kg_edges (
    term_a     TEXT,
    term_b     TEXT,
    weight     INTEGER,               -- Number of shared cards (minimum 2)
    PRIMARY KEY (term_a, term_b)
);

-- Cached definitions (generated on-demand)
CREATE TABLE kg_definitions (
    term           TEXT PRIMARY KEY,
    definition     TEXT,
    sources        TEXT,              -- JSON: card_ids used to generate definition
    source_count   INTEGER,           -- Number of cards used
    generated_by   TEXT,              -- 'llm' or 'research'
    created_at     TEXT DEFAULT (datetime('now')),
    updated_at     TEXT DEFAULT (datetime('now'))
);
```

### Derived Queries (no denormalized JSON)

```sql
-- Get all card IDs for a term
SELECT card_id FROM kg_card_terms WHERE term = ?;

-- Get deck distribution for a term
SELECT deck_id, COUNT(*) as cnt FROM kg_card_terms WHERE term = ? GROUP BY deck_id;

-- Get primary deck for a term (for node color)
SELECT deck_id FROM kg_card_terms WHERE term = ? GROUP BY deck_id ORDER BY COUNT(*) DESC LIMIT 1;
```

### Edge Pruning

Edges with `weight < 2` (single-card coincidences) are excluded to keep the graph clean. Maximum 5000 edges retained (top by weight) to bound graph data size.

### Term Embedding Generation

After term extraction completes, term embeddings are computed:
1. Collect all terms from `kg_terms` that have `embedding IS NULL`
2. Batch-embed via `EmbeddingManager.embed_texts()` (same API, term string as input)
3. Store as BLOB in `kg_terms.embedding`
4. Incremental: only newly-added terms get embedded

### Definition Cache Staleness

`kg_definitions.updated_at` tracks when the definition was last generated. If new cards are added containing a term and the definition is older than the newest card's embedding timestamp, the definition is marked stale and re-generated on next click.

### is_definition Heuristic

A card is likely a "definition card" for a term if:
- The term appears in the question/front field (not just the answer)
- Patterns like "Was ist...", "...ist/sind/bedeutet..." near the term
- These cards get higher rank when generating definitions

## Graph View (Home Screen)

### Technology

**`3d-force-graph`** (vasturiano) — WebGL library built on three.js with built-in force-directed physics. Handles 1000+ nodes smoothly.

- Nodes = terms (from `kg_terms`)
- Edges = term co-occurrence (from `kg_edges`, weight = shared cards)
- Node size = frequency (more cards → bigger node)
- Node color = primary deck (deck with most cards for that term)
- Edge opacity = weight (more shared cards → more visible)

### Layout

```
┌──────────────────────────────────────────┐
│  Anki.plus                [Deck-Liste ↗] │
│  ┌────────────────────────────────────┐  │
│  │ 🔍 Suche / Frage eingeben...   ⌘K │  │
│  └────────────────────────────────────┘  │
│                                          │
│           3D Knowledge Graph             │
│          (fullscreen canvas)             │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │         BOTTOM BAR (contextual)    │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

- Toggle to legacy deck list for conservative users
- Graph covers entire background
- Auto-rotation when idle, stops on interaction

### Level of Detail (LOD)

- **Zoomed out:** Only high-frequency terms visible (labels), clusters as soft color regions
- **Mid zoom:** Medium-frequency terms appear
- **Zoomed in:** All terms in view visible, including low-frequency ones
- Threshold based on camera distance + term frequency

### Interaction

- **Drag:** Rotate graph
- **Scroll:** Zoom in/out
- **Right-click drag:** Pan
- **Hover:** Tooltip with term name, card count, deck tags
- **Click node:** Camera flies to node, Bottom Bar shows TermPopup content
- **Search:** Type in search bar → graph focuses (see Search section)

## Bottom Bar (Contextual)

A single bar at the bottom of the Graph View with three states:

### State 1: Idle (nothing selected)

Shows embedding/graph status and refresh animation.

```
◉ Graph aktuell · 8.342 Karten · 1.203 Terme · Letzte Prüfung: gerade eben
```

- On startup: pulse/spinner animation checking for new/changed cards
- Even if nothing changed → short animation → "Graph aktuell" with checkmark
- If new cards found: progress bar for term extraction
- Embedding progress display (moved here from elsewhere in the app)

### State 2: Search / Question

User types a query. System auto-detects:
- **Term search** ("Kollagen"): Graph focuses, Bottom Bar shows term info + stack button
- **Question** ("Was ist Kollagen?", contains question word): Graph focuses AND Tutor answer in Bottom Bar

Detection: Simple heuristic — contains question word (was, wie, warum, erkläre, welche, wozu, wann...) → question mode. Otherwise → term search.

```
┌──────────────────────────────────────────────┐
│ Kollagen ist ein Strukturprotein des         │
│ Bindegewebes...                              │
│                                              │
│ 📚 23 relevante Karten      [Stapel starten] │
└──────────────────────────────────────────────┘
```

For questions: Tutor agent generates the answer using RAG from the focused cards.
Stack is automatically assembled from cards the graph focus identified.

### State 3: Single Node Selected

User clicks a term node in the graph.

```
┌──────────────────────────────────────────────┐
│ Kollagen                                     │
│ 12 Karten · Anatomie, Biochemie, Histologie  │
│                                              │
│ Strukturprotein des Bindegewebes. Häufigstes │
│ Protein im menschlichen Körper...            │
│ Generiert aus 6 Karten                       │
│                                              │
│ Verbunden: Prolin · Vitamin C ·              │
│ Osteogenesis imperfecta · Elastin            │
│                          [Stapel starten]    │
└──────────────────────────────────────────────┘
```

Connected terms are clickable → navigates in graph.

## Search Mechanics

### Term Search

1. User types "Kollagen"
2. Exact match in `kg_terms` → highlight that node + connected nodes
3. Non-matching nodes fade to low opacity
4. Camera animates to focus on the term
5. Bottom Bar shows term info

### Semantic Search (Vector)

1. User types a concept not in the index, or a question
2. Embed the query using existing `EmbeddingManager.embed_texts()`
3. Cosine similarity against all term embeddings (from `kg_terms.embedding`)
4. Top-N terms form the focused subgraph
5. All `card_ids` from those terms → dynamic stack

### Dynamic Stack Creation

1. Graph focus identifies relevant terms
2. Collect all `card_ids` from focused terms via `SELECT card_id FROM kg_card_terms WHERE term IN (?)`
3. Sort by relevance: definition cards first (`is_definition=1`), then by semantic similarity to search query
4. Deduplicate (same note_id)
5. Create filtered deck via Anki API:
   - `deck = mw.col.decks.new_filtered('KG: {search_term}')`
   - Set search string to `cid:id1,id2,id3,...` (Anki's card ID search syntax)
   - `mw.col.sched.rebuild_filtered_deck(deck['id'])`
   - `mw.moveToState('review')`
6. Previous KG filtered decks are cleaned up automatically on new stack creation
7. When review ends, filtered deck is emptied (cards return to original decks)

## On-Demand Definition Generation

### Trigger

First click on a term (in Graph or Reviewer). Subsequent clicks load from cache.

### Flow

1. Check `kg_definitions` cache → if exists, return immediately
2. Build definition query: "Was ist {term}? Definition"
3. Embed the query
4. From the term's associated `card_ids`, find top 5-8 cards by cosine similarity to the definition query
5. This selects cards that **define** the term, not just mention it
6. Send cards to Gemini Flash with prompt: "Generate a concise definition of '{term}' based on these flashcard contents"
7. If < 2 relevant cards found → trigger Research Agent for external lookup
8. Cache result in `kg_definitions` with source card IDs and count
9. Display: "Generiert aus 6 Karten"

### Research Agent Fallback

When local cards are insufficient:
1. Research Agent searches externally (Perplexity, PubMed, Wikipedia)
2. Result cached with `generated_by='research'`
3. Indicated differently in UI: "Aus externer Recherche"

## Term Marking in Reviewer

### Marking

Reuses existing `applyPhraseMarkers()` infrastructure from AMBOSS integration:

1. When a card is displayed in ReviewerView, get its terms from `kg_card_terms`
2. Build term map: `{ "Kollagen": "kg-kollagen", "Prolin": "kg-prolin", ... }` (term → marker ID)
3. Pass to `applyPhraseMarkers(containerEl, termMap, 'knowledge-graph')`
4. `applyPhraseMarkers` needs refactoring to support configurable CSS class:
   - Source `'amboss'` → class `amboss-marker` (existing behavior)
   - Source `'knowledge-graph'` → class `kg-marker` (new)
5. Click handler in ReviewerView detects `.kg-marker` clicks (separate from AMBOSS `.amboss-marker` handler) → opens TermPopup overlay

### Styling

```css
.kg-marker {
  border-bottom: 1px solid var(--ds-accent-30);
  cursor: pointer;
  transition: border-color 0.15s;
}
.kg-marker:hover {
  border-bottom-color: var(--ds-accent);
  background: var(--ds-accent-10);
}
```

Subtle underline, not distracting during review. Hover intensifies.

### Click → TermPopup

Same unified TermPopup component as in the Graph View, but rendered as a floating overlay positioned near the clicked term. Same content: definition, connected terms, "Stapel starten".

## TermPopup Component (Unified)

A single React component used in two contexts:

| Property | Graph View | Reviewer |
|---|---|---|
| Render target | Bottom Bar | Floating overlay |
| Trigger | Node click | Marker click |
| Content | Identical | Identical |
| "Stapel starten" | Creates stack, enters reviewer | Leaves current review, creates new stack |
| Connected terms | Clickable → graph navigation | Clickable → show that term's popup |

### Props

```tsx
interface TermPopupProps {
  term: string;
  cardCount: number;
  deckNames: string[];
  definition: string | null;     // null = loading
  sourceCount: number;
  connectedTerms: string[];
  onTermClick: (term: string) => void;
  onStartStack: (cardIds: number[]) => void;
  mode: 'bottom-bar' | 'overlay';
}
```

## Bridge Methods (New)

### Synchronous Slots (instant, SQLite-only)

```python
@pyqtSlot(result=str)
def getGraphData(self):
    """Returns JSON: { nodes: [{id, label, frequency, deckColor}], edges: [{source, target, weight}] }"""

@pyqtSlot(str, result=str)
def getTermCards(self, term):
    """Returns JSON: { cardIds: [...], sorted by relevance }"""

@pyqtSlot(result=str)
def getGraphStatus(self):
    """Returns JSON: { totalCards, totalTerms, lastUpdated, pendingUpdates }"""
```

### Async Slots (LLM/API calls via QThread, result pushed via ankiReceive)

These methods return immediately with `{"status": "loading"}`. The actual work runs in a `QThread`. When complete, the result is pushed to the frontend via `window.ankiReceive()`.

```python
@pyqtSlot(str)
def searchGraph(self, query):
    """Immediate: return exact matches from SQLite.
    If no exact match: embed query in QThread → cosine similarity → push result via ankiReceive:
    { type: 'graph.searchResult', data: { matchedTerms, cardIds, isQuestion } }"""

@pyqtSlot(str)
def getTermDefinition(self, term):
    """Immediate: return cached definition from kg_definitions if exists.
    If not cached: run in QThread (embed query → find top cards → Gemini Flash → cache).
    Push result via ankiReceive:
    { type: 'graph.termDefinition', data: { term, definition, sourceCount, generatedBy, connectedTerms } }
    On failure: { type: 'graph.termDefinition', data: { term, error: 'description' } }"""

@pyqtSlot(str)
def startTermStack(self, cardIdsJson):
    """Creates a filtered deck from card IDs and enters the reviewer.
    Uses Anki's FilteredDeckForUpdate API:
    1. mw.col.decks.new_filtered('KG: {term}')
    2. Set search to 'cid:id1,id2,id3,...'
    3. mw.col.sched.rebuild_filtered_deck(deck_id)
    4. mw.moveToState('review')
    Cleans up previous KG filtered decks on creation."""
```

### Frontend ankiReceive Handlers

The frontend listens for async results:
- `graph.searchResult` → update graph focus + Bottom Bar
- `graph.termDefinition` → update TermPopup content (replace loading state)
- `graph.termDefinition` with `error` → show retry button in TermPopup

## Frontend Components

### New Components

- `GraphView.jsx` — Main 3D graph (uses `3d-force-graph` library)
- `GraphBottomBar.jsx` — Contextual bottom bar (3 states)
- `TermPopup.jsx` — Unified term detail component
- `GraphSearchBar.jsx` — Search bar with dual-mode detection (or reuse existing ChatInput with different action props)

### Modified Components

- `App.jsx` — Add graph view as home screen state, toggle with deck browser
- `ReviewerView.jsx` — Add term marking via existing `applyPhraseMarkers()`, add TermPopup overlay
- `DeckBrowserView.jsx` — Add toggle to switch to Graph View (and back)

### NPM Dependencies

- `3d-force-graph` — 3D force-directed graph rendering (pulls in `three.js`)
- Code-split via `React.lazy()` to avoid loading three.js on non-graph views

### Graph Data JSON Schema

```typescript
// Returned by getGraphData()
interface GraphData {
  nodes: Array<{
    id: string;          // term (unique)
    label: string;       // display name
    frequency: number;   // card count
    deckColor: string;   // hex color of primary deck
    deckName: string;    // name of primary deck
  }>;
  edges: Array<{
    source: string;      // term_a
    target: string;      // term_b
    weight: number;      // shared card count
  }>;
}
```

## Design Rules

All styling via `var(--ds-*)` tokens. No hardcoded colors.

- **Graph background:** `var(--ds-bg-deep)` (#141416 dark / #ECECF0 light)
- **Node colors:** Deck-specific using semantic tokens (accent, green, yellow, purple, red)
- **Bottom Bar:** `.ds-frosted` material (action element)
- **TermPopup overlay:** `var(--ds-bg-overlay)` + `var(--ds-shadow-lg)`
- **Term markers:** `var(--ds-accent-30)` border, `var(--ds-accent-10)` hover background
- **Labels:** SF Pro, `var(--ds-text-secondary)` for normal, `var(--ds-text-primary)` for focused

Must work in both dark and light mode.

## Performance Considerations

- **Initial load:** Graph data JSON (~50-150KB for 1000 terms + 5000 edges) loaded once
- **3d-force-graph:** Handles 1000+ nodes at 60fps (WebGL)
- **Force simulation:** Runs for ~600 frames then stops (settled state)
- **LOD:** Label rendering gated by camera distance → fewer DOM elements when zoomed out
- **Definition cache:** SQLite lookup is instant; LLM generation only on first click
- **Incremental updates:** Only changed cards reprocessed, not full rebuild
- **Bundle size:** `3d-force-graph` pulls in `three.js` (~600KB min+gz). Use `React.lazy()` + `Suspense` to code-split the GraphView so three.js only loads when navigating to the graph. Vite config already supports chunk splitting.
- **Edge computation:** O(cards × terms_per_card²) for edge weight computation. With ~8300 cards and ~5-15 terms per card, this is ~500K-2M pair evaluations — runs in <1s on modern hardware. Pruned to top 5000 edges by weight.

## Graceful Degradation

- **Offline / no API key:** Graph renders normally (all data is local SQLite). TermPopup shows term name, card count, connected terms, and deck distribution — but no definition. Definition section shows "Offline — Definition nicht verfügbar" instead of loading spinner.
- **API failure:** TermPopup shows error state with retry button. Previously cached definitions remain available.
- **Research Agent failure:** TermPopup shows "Nicht genug Quellen für eine Definition" with the card count and connected terms still visible.
- **0 terms extracted:** Graph view shows empty state with message "Starte ein Embedding um den Knowledge Graph aufzubauen" and a button to trigger the pipeline.
- **Graph still building:** Bottom Bar shows progress (X/Y Karten verarbeitet), graph renders incrementally as terms arrive.

## Fallback: Legacy Deck List

- Toggle button in header: "Deck-Liste" ↔ "Knowledge Graph"
- User preference saved in config
- Deck list remains fully functional, no changes to existing DeckBrowserView
- Default: Knowledge Graph (once term index is built)

## Phases

While this is one unified spec, implementation can proceed in phases:

1. **Backend:** TermExtractor + SQLite schema + incremental pipeline integration
2. **Graph View:** 3d-force-graph rendering + search + Bottom Bar
3. **Term Marking:** Reviewer integration + TermPopup in review context
4. **Definition Generation:** On-demand LLM + Research Agent fallback + caching
5. **Polish:** LOD, refresh animation, light mode, performance tuning

## Open Questions (Resolved)

- ~~Term extraction: local vs LLM?~~ → Local first (A), LLM upgrade later (B)
- ~~Graph structure: deck-synced vs free?~~ → Free, term-based clusters
- ~~Chat vs search bar?~~ → Graph search = home screen, Chat = reviewer session
- ~~TermPopup: separate or unified?~~ → Unified component, two render modes
- ~~Scope: separate specs?~~ → One spec, phased implementation
