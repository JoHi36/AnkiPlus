# Knowledge Graph v2 — Deck-Hierarchy Graph

**Date:** 2026-03-25
**Status:** Draft (replaces v1 term-based approach)
**Feature:** 3D Knowledge Graph based on deck hierarchy + term cross-links

## Overview

Replace the flat deck browser with an interactive 3D Knowledge Graph where the **deck hierarchy provides the structure** and **shared terms provide cross-deck connections**. The deck tree (already curated by deck creators) becomes a navigable 3D network. Cross-links between sub-decks — discovered via shared terms in card text — reveal hidden connections across subjects.

## Why v2 (Lessons from v1)

The v1 approach extracted ~38,000 terms from card text and rendered them as nodes. Problems:
- **Term quality:** Local extraction produced too much noise (generic words, tags, verbs)
- **Hairball:** 2000+ nodes with 5000 edges collapsed into a dense blob with no visible structure
- **No natural clustering:** Force-directed layout can't create meaningful clusters from term co-occurrence alone
- **Expensive fix:** LLM extraction (~$0.50, 170 API calls) needed for usable term quality

**Key insight:** The deck hierarchy already IS a curated knowledge structure. Using it as the graph skeleton is free, works with any deck, and provides natural clustering. Term connections become the bonus layer, not the foundation.

## Architecture

### Two Layers

```
SKELETON (Deck Hierarchy)          NERVOUS SYSTEM (Term Cross-Links)
├── Anatomie                       Kollagen ──── Anatomie ↔ Biochemie ↔ Histologie
│   ├── Bewegungsapparat           Aktionspotential ── Physiologie ↔ Biochemie
│   ├── Histo Allg.                pH-Wert ──── Chemie ↔ Physiologie ↔ Biochemie
│   ├── Kopf und Hals              Na/K-ATPase ── Physiologie ↔ Biochemie
│   └── Neuroanatomie              ...
├── Biochemie
│   ├── Ernährung und Stoffwechsel
│   └── Molekularbiologie
└── Physiologie
```

- **Nodes** = Decks and sub-decks (not individual terms or cards)
- **Position** = Hierarchical — children orbit their parent
- **Edges** = Shared terms between sub-decks (weight = number of shared terms)
- **Node size** = Card count in that deck
- **Node color** = Top-level deck (Anatomie = blue, Biochemie = green, etc.)

### Zoom Levels

| Level | What you see | Node count | Interaction |
|-------|-------------|-----------|------------|
| **1 — Collection** | Top-level decks as large spheres | ~5-10 | Click → zoom into deck |
| **2 — Deck** | Sub-decks as medium spheres, cross-links visible | ~10-30 | Click → zoom in, or start stack |
| **3 — Sub-deck** | Individual terms or cards within a sub-deck | ~20-50 | Click → card preview or definition |

Zoom level transitions animate smoothly. Cross-links between decks at different levels stay visible as thin lines.

### Data Source

**Deck tree:** Already available via existing bridge method `getAvailableDecks()` which returns the full deck hierarchy with card counts. No new extraction needed.

**Cross-links:** Computed from `kg_card_terms` (term co-occurrence between decks). For each pair of sub-decks, count how many terms they share. This is a lightweight SQL query on existing data.

```sql
-- Cross-links between sub-decks
SELECT a.deck_id AS deck_a, b.deck_id AS deck_b, COUNT(DISTINCT a.term) AS shared_terms
FROM kg_card_terms a
JOIN kg_card_terms b ON a.term = b.term AND a.deck_id != b.deck_id
GROUP BY a.deck_id, b.deck_id
HAVING shared_terms >= 3
```

## Graph View (Home Screen)

### Layout

```
┌──────────────────────────────────────────┐
│  Anki.plus                [Deck-Liste ↗] │
│  ┌────────────────────────────────────┐  │
│  │ 🔍 Suche / Frage eingeben...   ⌘K │  │
│  └────────────────────────────────────┘  │
│                                          │
│     ┌───────────────────────────────┐    │
│     │                               │    │
│     │   3D Deck Graph (fullscreen)  │    │
│     │                               │    │
│     │   ◉ Anatomie ──── ◉ Biochemie│    │
│     │     ╲               ╱         │    │
│     │      ◉ Histologie ◉          │    │
│     │     ╱               ╲         │    │
│     │   ◉ Physiologie ── ◉ Chemie  │    │
│     │                               │    │
│     └───────────────────────────────┘    │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │         BOTTOM BAR (contextual)    │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

- Canvas fills entire background (position: absolute, inset: 0)
- Header/search/bottom bar float on top
- ResizeObserver keeps canvas in sync with window size

### Interaction

- **Rotate/zoom/pan:** Standard orbit controls (drag, scroll, right-click)
- **Click deck node:** Zoom into that deck → see sub-decks
- **Click sub-deck node:** Bottom bar shows deck info + "Stapel starten"
- **Double-click sub-deck:** Zoom into → see individual terms/cards
- **Search:** Find decks/sub-decks containing the search term → focus sub-network
- **Back/zoom out:** Escape or scroll out returns to parent level

### Search Mechanics

When the user types "Kollagen":
1. Find all sub-decks that contain cards with "Kollagen"
2. Show only those sub-decks + their cross-links
3. Highlight "Kollagen" as the connecting concept
4. Bottom bar shows: "Kollagen — 12 Karten in 3 Fachgebieten" + "Stapel starten"

This naturally creates a focused sub-network without the hairball problem, because the number of sub-decks containing any given term is typically 2-5, not 2000.

### Node Appearance

**Top-level decks (zoom level 1):**
- Large translucent sphere with label
- Size proportional to log(card_count)
- Color: fixed per deck (Apple HIG palette)
- Glow effect on hover

**Sub-decks (zoom level 2):**
- Medium sphere, same color as parent (slightly different shade)
- Label visible on hover and when zoomed in
- Card count badge

**Cross-link edges:**
- Thin lines with gradient color (source deck → target deck)
- Width proportional to shared_terms count
- Only shown between currently visible nodes
- Hover shows: "14 gemeinsame Begriffe (Kollagen, Prolin, Vitamin C, ...)"

## Bottom Bar (Contextual)

Same three states as v1:

**Idle:** "Graph aktuell · 8.342 Karten · 15 Fachgebiete"

**Search:** Summary of matched decks + "Stapel starten" (creates filtered deck from all matching cards)

**Selected deck:** Deck name, card count, sub-deck list, due cards, "Stapel starten"

## Term Cross-Links

### Computation

Cross-links are computed from `kg_card_terms` which is populated during the embedding pipeline (existing infrastructure from v1). The term extraction quality doesn't need to be perfect — even noisy terms create meaningful deck-level connections because the aggregation (shared_terms >= 3) filters out noise.

### Storage

New table for pre-computed deck cross-links:

```sql
CREATE TABLE IF NOT EXISTS kg_deck_links (
    deck_a     INTEGER,
    deck_b     INTEGER,
    shared_terms INTEGER,
    top_terms    TEXT,       -- JSON: top 5 shared term names
    PRIMARY KEY (deck_a, deck_b)
);
```

Computed after `GraphIndexBuilder.build()` completes. Lightweight query, runs in <1s.

### Bridge Method

```python
def _msg_get_graph_data(self, data):
    """Return deck hierarchy + cross-links for 3D rendering."""
    # Deck tree from Anki
    deck_tree = self._get_deck_tree()
    # Cross-links from kg_deck_links
    cross_links = get_deck_cross_links()
    self._send_to_js({
        "type": "graph.data",
        "data": {"decks": deck_tree, "crossLinks": cross_links}
    })
```

## Dynamic Stack Creation

Same as v1 — clicking "Stapel starten" on a deck or search result creates a filtered deck via Anki's API.

For search results: collect all card IDs from matching sub-decks → create filtered deck.
For deck click: just open that deck normally (no filtered deck needed).

## Term Marking in Reviewer

Same as v1 — when reviewing a card, mark terms that appear in other decks. Clicking a marked term shows which other decks contain that term, with option to jump to the graph focused on that connection.

## Performance

- **Zoom level 1:** ~5-10 nodes → instant
- **Zoom level 2:** ~10-30 nodes → instant
- **Zoom level 3:** ~20-50 nodes → instant
- **Cross-links:** ~50-100 edges max → instant
- **No hairball possible** — node count is bounded by deck hierarchy depth
- **Canvas resize:** ResizeObserver keeps it smooth

## What Changes from v1

| Aspect | v1 (term-based) | v2 (deck-hierarchy) |
|--------|-----------------|---------------------|
| Nodes | ~2000 extracted terms | ~30-50 decks/sub-decks |
| Edges | Term co-occurrence | Shared terms between decks |
| Structure | Force-directed (random) | Hierarchical (curated) |
| Term quality | Critical (garbage in, garbage out) | Not critical (aggregated) |
| LLM needed | Yes, for usable quality | No (deck tree is free) |
| Performance | Hairball at >500 nodes | Always fast (<100 nodes) |
| Clustering | None (force layout) | Natural (deck hierarchy) |
| Familiarity | New paradigm | User recognizes their decks |

## What Stays from v1

- 3d-force-graph library (same rendering engine)
- SQLite storage (kg_card_terms, kg_terms for cross-link computation)
- useKnowledgeGraph hook (same communication pattern)
- GraphView component (adapted for deck nodes)
- GraphBottomBar + TermPopup components
- Term marking in reviewer
- Fullscreen canvas with header/search overlay
- Search → focused sub-network → "Stapel starten" flow

## Phases

1. **Deck graph rendering:** Fetch deck tree, render as 3D graph with hierarchical layout
2. **Cross-links:** Compute and display shared-term connections between decks
3. **Search + focus:** Search finds sub-decks containing term, shows focused network
4. **Zoom levels:** Click to zoom into sub-decks, back to zoom out
5. **Polish:** Animations, bottom bar, term marking in reviewer
