# Smart Search v2 — Design Spec

**Date:** 2026-03-26
**Status:** Approved
**Replaces:** `2026-03-26-smart-search-final-design.md` (v1)

## Vision

Smart Search turns "Was willst du lernen?" into a visual knowledge exploration. You type a topic, see your cards as a 3D semantic network, get an AI-generated answer, explore clusters of related cards, and start targeted study sessions — all in one flow.

The feature lives on the Stapel tab and is the primary way to discover and study content. It follows the Anki mental model (decks, cards, review) but adds an intelligence layer that shows you *how* your knowledge is structured.

## Core Principles

1. **One input, three outputs:** Answer + Network + Stack
2. **Cluster-first:** Individual cards are not directly interactive in the graph. Clusters are the unit of exploration.
3. **Canvas + Sidebar:** Graph is the canvas (left), cluster info is the sidebar (right). Same layout shell as Session.
4. **Smooth transitions:** Smart Search → Session → back to Smart Search. Same frame, animated morphs.
5. **Honest:** "Diese Frage kann mit deinen Karten nicht beantwortet werden." No filler.

## UX Flow

### State 1: Default (Heatmap)

The Stapel tab opens with the existing layout:
- **Logo** "Anki.plus" centered (Space Grotesk, 36px)
- **Heatmap** treemap showing deck strength (red → yellow → green)
- **ChatInput** docked at bottom ("Was willst du lernen?")

Heatmap deck interaction via ChatInput topSlot (existing pattern). No separate bottom bar — selected deck info appears in topSlot, actions in action buttons.

### State 2: Search submitted

1. User types "Cortisol" → presses Enter
2. **Heatmap fades out** (opacity 0, 300ms)
3. **3D Graph materializes** from center (staggered node appearance)
4. **Sidebar slides in** from right (SidebarShell pattern, `--ds-bg-deep` background)
5. **ChatInput** stays docked at bottom, shows search info + "Kreuzen" action

### State 3: Results loaded — Graph + Sidebar

```
┌──────────────────────────────────────────────────────┐
│ [Deck-Liste]                  Stapel Session Statistik│
│                                                       │
│           ○  ○    ○           │ CORTISOL              │
│          ○ [Query] ○          │                        │
│           ○  ○  ○  ○         │ Glucocorticoid der NNR │
│          ○    ○     ○         │ katabol, immunsuppre-  │
│                               │ ssiv. Wichtigstes      │
│   3D Graph (Canvas)           │ Stresshormon.          │
│   Query = rotation center     │                        │
│   Auto-rotate slow            │ ── CLUSTER ──────────  │
│                               │ ● Biosynthese    14    │
│                               │ ● Wirkungen      12    │
│                               │ ● Cushing        11    │
│                               │ ● Regulation     10    │
│                               │                        │
│ ┌──────────────────────────┐  │                        │
│ │ Cortisol · 4 Cluster     │  │                        │
│ │ 47 Karten    [Kreuzen]   │  │                        │
│ └──────────────────────────┘  │                        │
└──────────────────────────────────────────────────────┘
```

**Sidebar contents (top to bottom):**
1. Query title (large, bold)
2. AI-generated answer (2-3 sentences)
3. Divider
4. "PERSPEKTIVEN" label
5. Cluster list — each item: colored dot + name + card count
6. When cluster selected: cluster summary + CardRefChips

**ChatInput (bottom, always visible):**
- Left: "{query} · {n} Cluster" + "{total} Karten"
- Right: "Kreuzen" button (all cards)
- Esc to dismiss, return to heatmap

### State 4: Cluster selected

User taps "Biosynthese" in sidebar:

1. **Graph rotates** to make Biosynthese cluster prominent and centered
2. **Biosynthese nodes brighten**, other clusters dim
3. **Sidebar updates:**
   - Answer text → Cluster summary (smooth crossfade)
   - CardRefChips appear below summary (scrollable)
4. **ChatInput updates:**
   - "Biosynthese · 14 Karten" + "14 Karten kreuzen"

Tapping the same cluster again deselects → back to full network view + main answer.

### State 5: Start stack → Session transition

User clicks "14 Karten kreuzen":

1. **Graph morphs out** (zoom into cluster, fade)
2. **Sidebar morphs** from cluster-info to Session chat (same position, animated)
3. **Canvas shows first card** (replaces graph)
4. Standard Session flow: question → answer → rate → next

### State 6: Session complete → back to graph

Session ends:

1. **Canvas morphs** from last card back to 3D graph
2. **Sidebar shows** completion summary: "14/14 geschafft" + option to explore another cluster
3. Graph returns with studied cluster visually marked (e.g. checkmark or glow)

## State Management

All Smart Search state lives in a new `useSmartSearch` hook, owned by `App.jsx` and passed down. This enables state survival across view transitions (e.g., graph → session → back to graph).

```
useSmartSearch() → {
  query, searchResult, answerText, clusterLabels, clusterSummaries,
  selectedClusterId, setSelectedClusterId,
  isSearching, search(query), reset(),
  cachedGraphData,  // preserved across session navigation
}
```

**GraphView** receives the hook's state as props and renders the graph + sidebar.
**SearchSidebar** receives `selectedClusterId` + `setSelectedClusterId` + cluster data.
**ChatInput** receives derived action props based on current selection.

Cluster selection flow: SearchSidebar calls `setSelectedClusterId(id)` → GraphView reacts (camera animation, node highlighting) → ChatInput updates action labels. All via shared state, no custom events needed.

## Edge Cases

### No results (0 cards)
- Sidebar does NOT appear
- Graph canvas shows: "Keine Karten zu diesem Thema gefunden"
- ChatInput: input stays active for a new query, Esc to return to heatmap

### Single cluster
- Sidebar shows answer but NO "PERSPEKTIVEN" section (pointless with 1 cluster)
- Graph shows the nodes without cluster differentiation (single color)
- ChatInput: "{n} Karten kreuzen" directly

### LLM failure / timeout
- Sidebar shows clusters with auto-generated labels (from backend keyword extraction)
- Answer area shows: "Zusammenfassung wird geladen..." → after 10s timeout: "Zusammenfassung nicht verfügbar"
- Cluster summaries fallback to empty (just name + card count)
- Feature remains fully functional without LLM — only labels/summaries are degraded

### Few cards (< 6)
- No clustering — treat as single group
- Graph shows star topology (all cards → query node)
- Sidebar: answer only, no cluster section

### Session → back to graph
- Search results are cached in `useSmartSearch` hook (survives session navigation)
- Graph rebuilds from cached data (ForceGraph3D instance is recreated, camera position reset)
- Studied cluster gets a subtle checkmark overlay on its nodes
- If user navigated away entirely (different tab), cache is preserved for 5 minutes then cleared

## 3D Graph Design

### Structure

- **Query node:** White, centered, largest. IS the rotation center for all axes.
- **Card nodes:** Small, colored by cluster. NOT individually clickable.
- **Cluster colors:** Muted palette (steel blue, forest green, amber, muted purple, terracotta, teal, olive gold, warm grey). Brighten on cluster selection.
- **Edges:** Very subtle (`var(--ds-border-subtle)`, opacity 0.04-0.06)
  - Balloon strings: one per cluster (best card → query)
  - Intra-cluster: pull cards together
- **Background:** Transparent (page background shows through)

### Physics

- `warmupTicks(0)` for live physics
- `cooldownTicks(300)` for settling
- `d3AlphaDecay(0.015)`, `d3VelocityDecay(0.25)`
- `onEngineStop` → `zoomToFit(800, 60)`
- Auto-rotate: speed 0.4, pan disabled
- Query node as rotation pivot (via camera lookAt)

### Cluster Selection Rotation

When a cluster is selected, compute the centroid of its nodes and animate the camera to face that centroid while keeping the query node as the lookAt target. Duration: 800ms cubic-bezier.

## Sidebar Design

### Layout

- Width: 320px (standalone panel, not inside SidebarShell — wider than settings sidebar for comfortable text display)
- Background: `var(--ds-bg-deep)` (black)
- Border-left: `1px solid var(--ds-border-subtle)`
- Slides in from right with 300ms ease-out animation
- Scrollable content area

### Sections

1. **Header:** Query term, large (18px, bold)
2. **Answer:** AI-generated, 14px, `var(--ds-text-secondary)`
3. **Divider**
4. **Cluster list:** "PERSPEKTIVEN" label + clickable items
5. **Cluster detail** (when selected): Summary + CardRefChips

### CardRefChips

Reuse existing `CardRefChip` component from session chat. Show up to 10 per cluster. Each chip shows truncated question text. Tap behavior: opens card in canvas area as peek overlay (future feature — for now, non-interactive or opens standard card preview).

## Backend Changes

### Search: Dynamic card count

Current: fixed `topK=25`
New: `topK` parameter accepts higher values. Frontend sends `topK=100`. Backend returns all cards with score > 0.3, up to 100. This gives denser, more impressive graphs for broad topics while staying lean for niche queries.

### Clustering: Better control

- Target clusters formula: `clamp(3, floor(cards / 10), 6)` — always 3-6 clusters
  - 15 cards → 3 clusters
  - 50 cards → 5 clusters
  - 100 cards → 6 clusters (capped)
  - < 6 cards → no clustering (single group)
- Minimum cluster size: 3 cards (merge smaller into nearest neighbor)
- Expose cluster IDs consistently: `cluster_0`, `cluster_1`, etc.

### LLM Call: One call for everything

Replace the current two-step flow (search → quick answer with 10 cards) with a single richer call:

**Model:** Gemini 2.5 Flash (same as Tutor)

**Input:** All result cards (up to 50 for context), cluster assignments

**Prompt:**
```
Basierend auf diesen {n} Lernkarten zum Thema "{query}":

{cards with cluster assignments}

1. ANTWORT: Beantworte "{query}" in 2-3 Sätzen. Nur basierend auf den Karten.
   Wenn nicht beantwortbar: "Diese Frage kann mit deinen Karten nicht beantwortet werden."

2. CLUSTER: Benenne jeden Cluster mit 2-3 Wörtern und schreibe eine 2-Satz-Zusammenfassung.
   Format: cluster_0=Name|Zusammenfassung
           cluster_1=Name|Zusammenfassung
```

**Output parsing:** Split on `ANTWORT:` and `CLUSTER:` markers. For cluster entries, split on first `=` then first `|` to extract name and summary. Fallback: if parsing fails for any cluster, use the auto-generated keyword label from the backend and leave summary empty.

**Parsing robustness:**
- If `ANTWORT:` not found → treat entire response as the answer
- If `CLUSTER:` not found → keep backend-generated labels, no summaries
- If a cluster line has no `|` → use the whole value as name, empty summary
- If LLM includes `|` in cluster name → only split on FIRST `|`

**Card format in prompt:**
```
[cluster_0] Karte 1: {question[:80]} | {answer[:80]}
[cluster_1] Karte 2: {question[:80]} | {answer[:80}}
```

Use top 50 cards by score in the prompt (not all 100 — balance quality vs. token cost). At ~170 chars per card, 50 cards ≈ 8500 chars. The current 2000-char truncation in `gemini.py` must be raised to 12000 chars for this prompt.

**Token budget:** ~3000 input tokens (prompt + cards) + ~500 output tokens. Well within Flash limits.

## Animations & Transitions

### Heatmap → Graph (total ~700ms)

1. **0ms:** Heatmap cells fade out (staggered 50ms per cell, opacity → 0)
2. **300ms:** Graph container fades in (opacity 0→1, 400ms ease-out)
3. **300ms:** Sidebar slides from right (translateX(100%) → 0, 300ms ease-out) — parallel with graph
4. **500ms:** Nodes appear staggered from center outward (50ms per node)

### Graph → Session (total ~800ms)

1. **0ms:** Camera zooms into selected cluster centroid (500ms cubic-bezier)
2. **400ms:** Cluster nodes fade out (200ms) — overlaps with zoom
3. **600ms:** Canvas crossfades to card display (200ms)
4. **300ms:** Sidebar crossfades content from cluster-info to chat (300ms) — parallel

### Session → Graph (total ~600ms)

1. **0ms:** Card fades out (200ms)
2. **200ms:** Graph fades back in from cached data (400ms)
3. **200ms:** Sidebar crossfades to cluster-info with completion state (300ms) — parallel
4. Studied cluster gets visual indicator (subtle glow on nodes)

## ChatInput States

The ChatInput at the bottom adapts to context using existing props:

| State | topSlot | hideInput | actionPrimary | actionSecondary |
|-------|---------|-----------|---------------|-----------------|
| Default (heatmap) | — | false | — | — |
| Heatmap deck selected | Deck info (name, cards, %) | true | "Stapel starten" | "Reinzoomen" + Space |
| Searching | — | false (loading) | — | — |
| Results (no cluster) | "{query} · {n} Cluster · {total} Karten" | true | "{total} Karten kreuzen" | Esc |
| Cluster selected | "{cluster} · {n} Karten" | true | "{n} Karten kreuzen" | Esc |

Note: The **answer/summary text** lives in the SIDEBAR, not in the ChatInput topSlot. The topSlot shows only the current selection context (query info or cluster info).

### Keyboard Navigation

| Key | Heatmap | Graph (no cluster) | Graph (cluster selected) |
|-----|---------|-------------------|--------------------------|
| Escape | Deselect deck | Return to heatmap | Deselect cluster |
| Space | Drill into deck | — | — |
| Enter | Start deck stack | Start full stack | Start cluster stack |
| ↑ / ↓ | — | Navigate cluster list in sidebar | Navigate cluster list |
| 1-6 | — | Select cluster by number | Select cluster by number |

## Heatmap

Heatmap stays on Stapel tab as default view. Also appears in Statistik tab (permanent home for detailed analysis).

### Strength formula
```
strength = (mature + young × 0.5) / total
```

### Colors
Semantic: red (weak) → yellow (medium) → green (strong), using design system tokens via `color-mix()`.

### Interaction
- Click: select deck → info in ChatInput topSlot
- Double-click / Space: drill into sub-decks
- Escape: deselect
- Auto-drill: if only one root deck with children, show children immediately

## What's NOT in scope

- **Canvas-based learning mode** — future feature, separate spec
- **CardRefChip peek in canvas** — future feature, for now chips are display-only or open standard preview
- **Free Chat on Stapel tab** — removed, replaced by Smart Search
- **Individual card interaction in graph** — cards are not clickable in the 3D view
- **Search bar morph animation** — deferred, input stays docked at bottom

## File Impact

### Frontend (modify)
- `GraphView.jsx` — major rewrite: sidebar integration, cluster interaction, camera control
- `KnowledgeHeatmap.jsx` — minor: keep current state, fix polish
- `App.jsx` — wire sidebar state, session transition

### Frontend (new)
- `SearchSidebar.jsx` — new component: answer + cluster list + detail view (standalone, not inside SidebarShell)
- `hooks/useSmartSearch.js` — new hook: all search state, survives view transitions

### Backend (modify)
- `ai/gemini.py` — `generate_quick_answer()`: expand prompt for cluster summaries, accept more cards
- `ui/widget.py` — `SearchCardsThread`: support higher topK, improve clustering
- `ui/widget.py` — `QuickAnswerThread`: pass more cards, parse new response format

### Backend (no change)
- Bridge methods: reuse existing `searchCards`, `graph.quickAnswer` events
- Session infrastructure: reuse existing session start/stop flow
