# Knowledge Graph v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the term-based 3D graph with a deck-hierarchy graph where nodes are decks/sub-decks and edges are shared-term cross-links between them.

**Architecture:** The existing deck tree data (already sent to React via `app.stateChanged`) is transformed into 3d-force-graph nodes. Cross-links between decks are computed from `kg_card_terms` (shared terms) and overlaid as edges. The existing GraphView component is adapted — no new components needed.

**Tech Stack:** React, 3d-force-graph (already installed), SQLite (existing KG tables)

**Spec:** `docs/superpowers/specs/2026-03-25-knowledge-graph-v2-design.md`

---

## File Structure

### Modified Files

| File | Changes |
|------|---------|
| `frontend/src/components/GraphView.jsx` | Replace term-node rendering with deck-node rendering. New `deckTreeToGraph()` transform. Zoom-to-deck on click. |
| `frontend/src/hooks/useKnowledgeGraph.js` | Get deck data from existing `deckBrowserData` prop instead of separate bridge call. Add cross-links loading. |
| `frontend/src/App.jsx` | Pass `deckBrowserData` to GraphView as prop |
| `storage/kg_store.py` | Add `compute_deck_links()` and `get_deck_cross_links()` functions |
| `ui/widget.py` | Add `getDeckCrossLinks` message handler |

### No New Files Needed

The existing components (GraphView, GraphBottomBar, TermPopup, useKnowledgeGraph) are adapted in place. No new Python modules needed — deck cross-links are a simple addition to `kg_store.py`.

---

## Task 1: Deck Tree → Graph Transform

**Files:**
- Modify: `frontend/src/components/GraphView.jsx`

The core change: transform the deck tree (already available as `deckBrowserData.roots`) into `{nodes, links}` that 3d-force-graph can render.

- [ ] **Step 1: Create `deckTreeToGraph()` utility function**

Add at the top of GraphView.jsx (before the component):

```javascript
/**
 * Flatten deck tree into nodes + intra-hierarchy links for 3d-force-graph.
 * Only includes decks with cards (total > 0).
 */
const DECK_COLORS = ['#0A84FF','#30D158','#FF9F0A','#BF5AF2','#FF453A','#5AC8FA','#FFD60A','#AC8E68'];

function deckTreeToGraph(roots) {
  const nodes = [];
  const links = [];
  let colorIdx = 0;

  function walk(deck, parentId, topColor, depth) {
    if (!deck || !deck.id) return;
    const color = depth === 0 ? DECK_COLORS[colorIdx++ % DECK_COLORS.length] : topColor;
    const total = deck.total || 0;
    // Skip empty decks
    if (total === 0 && (!deck.children || deck.children.length === 0)) return;

    nodes.push({
      id: String(deck.id),
      label: deck.display || deck.name,
      fullName: deck.name,
      total: total,
      dueNew: deck.dueNew || 0,
      dueLearn: deck.dueLearn || 0,
      dueReview: deck.dueReview || 0,
      deckColor: color,
      depth: depth,
      parentId: parentId,
    });

    // Link to parent
    if (parentId) {
      links.push({ source: parentId, target: String(deck.id), value: 1, type: 'hierarchy' });
    }

    // Recurse children
    if (deck.children) {
      deck.children.forEach(child => walk(child, String(deck.id), color, depth + 1));
    }
  }

  roots.forEach(root => walk(root, null, null, 0));
  return { nodes, links };
}
```

- [ ] **Step 2: Replace the graphData-based rendering with deckData-based**

The component should accept `deckData` as a prop (the existing `deckBrowserData` from App.jsx):

```javascript
export default function GraphView({ onToggleView, isPremium, deckData }) {
```

Replace the `useKnowledgeGraph` data loading with a useMemo that transforms deckData:

```javascript
const graphData = useMemo(() => {
  if (!deckData?.roots?.length) return null;
  return deckTreeToGraph(deckData.roots);
}, [deckData]);
```

- [ ] **Step 3: Adapt the ForceGraph3D configuration for deck nodes**

Deck nodes are larger, fewer, and need different sizing:

```javascript
graph
  .graphData({ nodes: graphData.nodes, links: graphData.links })
  .backgroundColor('rgba(0,0,0,0)')
  .nodeColor(node => node.deckColor)
  .nodeVal(node => {
    // Top-level decks are large, sub-decks smaller
    const base = Math.log2((node.total || 1) + 1);
    return node.depth === 0 ? base * 3 : base * 1.5;
  })
  .nodeLabel(node => {
    const due = (node.dueNew || 0) + (node.dueLearn || 0) + (node.dueReview || 0);
    return `${node.label} (${node.total} Karten${due > 0 ? `, ${due} fällig` : ''})`;
  })
  .linkWidth(link => link.type === 'crosslink' ? Math.min(link.value / 2, 3) : 0.5)
  .linkOpacity(link => link.type === 'crosslink' ? 0.4 : 0.1)
  .linkColor(link => link.type === 'crosslink' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.05)')
  .onNodeClick(handleNodeClick)
  .enableNodeDrag(false)
  .d3AlphaDecay(0.04)
  .d3VelocityDecay(0.4)
  .showNavInfo(false)
  .warmupTicks(50)
  .cooldownTicks(100);
```

- [ ] **Step 4: Update the loading/empty states**

```javascript
const hasGraph = graphData?.nodes?.length > 0;

// Loading: show when deckData is null (not yet received from Python)
{!deckData && (
  <div style={...}>Wissensgraph wird geladen...</div>
)}

// Empty: show when deckData exists but has no roots
{deckData && !hasGraph && (
  <div style={...}>Keine Decks vorhanden</div>
)}
```

- [ ] **Step 5: Remove the old `useKnowledgeGraph` import and polling logic**

The hook's graph data loading / 5s polling is no longer needed. The deck data comes from App.jsx as a prop. Keep the hook only for cross-links, search, and definition functionality.

- [ ] **Step 6: Build and verify**

```bash
cd frontend && npm run build
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/GraphView.jsx
git commit -m "feat(kg-v2): render deck hierarchy as 3D graph nodes"
```

---

## Task 2: Pass deckData to GraphView

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Pass deckBrowserData to GraphView**

Find the GraphView render (around line 2407) and pass the data:

```jsx
<GraphView
  onToggleView={() => setViewMode('decks')}
  isPremium={isPremium}
  deckData={deckBrowserData}
/>
```

- [ ] **Step 2: Build and verify**

```bash
cd frontend && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(kg-v2): pass deckBrowserData to GraphView"
```

---

## Task 3: Deck Cross-Links (Backend)

**Files:**
- Modify: `storage/kg_store.py`
- Modify: `ui/widget.py`
- Test: `tests/test_kg_store.py`

- [ ] **Step 1: Add `kg_deck_links` table to schema**

In `_init_kg_schema()`, add:

```sql
CREATE TABLE IF NOT EXISTS kg_deck_links (
    deck_a       INTEGER,
    deck_b       INTEGER,
    shared_terms INTEGER,
    top_terms    TEXT,
    PRIMARY KEY (deck_a, deck_b)
);
```

- [ ] **Step 2: Add `compute_deck_links()` function**

```python
def compute_deck_links(min_shared=3, max_links=200):
    """Compute cross-links between decks based on shared terms."""
    db = _get_db()
    db.execute("DELETE FROM kg_deck_links")

    rows = db.execute("""
        SELECT a.deck_id AS deck_a, b.deck_id AS deck_b,
               COUNT(DISTINCT a.term) AS shared_terms,
               GROUP_CONCAT(DISTINCT a.term) AS terms
        FROM kg_card_terms a
        JOIN kg_card_terms b ON a.term = b.term AND a.deck_id < b.deck_id
        GROUP BY a.deck_id, b.deck_id
        HAVING shared_terms >= ?
        ORDER BY shared_terms DESC
        LIMIT ?
    """, (min_shared, max_links)).fetchall()

    for r in rows:
        # Keep only top 5 terms for display
        all_terms = r["terms"].split(",") if r["terms"] else []
        top = all_terms[:5]
        db.execute(
            "INSERT OR REPLACE INTO kg_deck_links VALUES (?, ?, ?, ?)",
            (r["deck_a"], r["deck_b"], r["shared_terms"], json.dumps(top))
        )
    db.commit()
    return len(rows)
```

- [ ] **Step 3: Add `get_deck_cross_links()` function**

```python
def get_deck_cross_links():
    """Return all deck cross-links for graph rendering."""
    db = _get_db()
    rows = db.execute(
        "SELECT deck_a, deck_b, shared_terms, top_terms FROM kg_deck_links"
    ).fetchall()
    return [
        {
            "source": str(r["deck_a"]),
            "target": str(r["deck_b"]),
            "weight": r["shared_terms"],
            "topTerms": json.loads(r["top_terms"]) if r["top_terms"] else [],
            "type": "crosslink",
        }
        for r in rows
    ]
```

- [ ] **Step 4: Call `compute_deck_links()` after graph build in embeddings.py**

In `ai/embeddings.py`, after `builder.build()` succeeds, add:

```python
try:
    from ..storage.kg_store import compute_deck_links
except ImportError:
    from storage.kg_store import compute_deck_links
link_count = compute_deck_links()
logger.info("Computed %d deck cross-links", link_count)
```

- [ ] **Step 5: Add message handler in widget.py**

In the `_get_message_handler()` dict, add:

```python
'getDeckCrossLinks': self._msg_get_deck_cross_links,
```

Handler method:

```python
def _msg_get_deck_cross_links(self, data):
    try:
        from ..storage.kg_store import get_deck_cross_links
    except ImportError:
        from storage.kg_store import get_deck_cross_links
    try:
        links = get_deck_cross_links()
        self._send_to_js({"type": "graph.crossLinks", "data": links})
    except Exception:
        logger.exception("getDeckCrossLinks failed")
        self._send_to_js({"type": "graph.crossLinks", "data": []})
```

- [ ] **Step 6: Write tests**

Add to `tests/test_kg_store.py`:

```python
def test_compute_deck_links(self):
    # Two decks sharing terms "Kollagen" and "Prolin"
    kg.save_card_terms(100, ["Kollagen", "Prolin", "Elastin"], deck_id=1)
    kg.save_card_terms(200, ["Kollagen", "Prolin", "Glykolyse"], deck_id=2)
    kg.save_card_terms(300, ["ATP", "Glykolyse"], deck_id=3)
    kg.update_term_frequencies()
    count = kg.compute_deck_links(min_shared=2)
    assert count >= 1  # deck 1 ↔ 2 share Kollagen + Prolin

def test_get_deck_cross_links(self):
    kg.save_card_terms(100, ["Kollagen", "Prolin", "Elastin"], deck_id=1)
    kg.save_card_terms(200, ["Kollagen", "Prolin"], deck_id=2)
    kg.update_term_frequencies()
    kg.compute_deck_links(min_shared=2)
    links = kg.get_deck_cross_links()
    assert len(links) >= 1
    link = links[0]
    assert "source" in link
    assert "target" in link
    assert "weight" in link
    assert link["type"] == "crosslink"
```

- [ ] **Step 7: Run tests**

```bash
python3 run_tests.py -k "test_kg_store" -v
```

- [ ] **Step 8: Commit**

```bash
git add storage/kg_store.py ui/widget.py ai/embeddings.py tests/test_kg_store.py
git commit -m "feat(kg-v2): add deck cross-links computation and bridge handler"
```

---

## Task 4: Load Cross-Links in Frontend

**Files:**
- Modify: `frontend/src/hooks/useKnowledgeGraph.js`
- Modify: `frontend/src/components/GraphView.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Simplify useKnowledgeGraph to focus on cross-links and search**

Rewrite the hook — remove graph data loading/polling (now comes from deckData prop). Keep: cross-links, search, definition, startStack.

```javascript
import { useState, useEffect, useCallback } from 'react';

export default function useKnowledgeGraph() {
  const [crossLinks, setCrossLinks] = useState([]);
  const [selectedTerm, setSelectedTerm] = useState(null);
  const [searchResult, setSearchResult] = useState(null);
  const [termDefinition, setTermDefinition] = useState(null);

  // Request cross-links on mount
  useEffect(() => {
    window.ankiBridge?.addMessage('getDeckCrossLinks', {});
  }, []);

  // Listen for events
  useEffect(() => {
    const handlers = {
      'graph.crossLinks': (e) => setCrossLinks(e.detail || []),
      'graph.searchResult': (e) => setSearchResult(e.detail),
      'graph.termDefinition': (e) => setTermDefinition(e.detail),
    };
    Object.entries(handlers).forEach(([evt, fn]) => window.addEventListener(evt, fn));
    return () => Object.entries(handlers).forEach(([evt, fn]) => window.removeEventListener(evt, fn));
  }, []);

  const searchGraph = useCallback((query) => {
    window.ankiBridge?.addMessage('searchGraph', { query });
  }, []);

  const requestDefinition = useCallback((term) => {
    setTermDefinition({ term, loading: true });
    window.ankiBridge?.addMessage('getTermDefinition', { term });
  }, []);

  const startStack = useCallback((term, cardIds) => {
    window.ankiBridge?.addMessage('startTermStack', { term, cardIds: JSON.stringify(cardIds) });
  }, []);

  return {
    crossLinks, selectedTerm, setSelectedTerm,
    searchResult, termDefinition,
    searchGraph, requestDefinition, startStack,
  };
}
```

- [ ] **Step 2: Merge cross-links into graph data in GraphView**

In GraphView, after `deckTreeToGraph()` computes hierarchy links, merge in cross-links:

```javascript
const { crossLinks, searchGraph, ... } = useKnowledgeGraph();

const graphData = useMemo(() => {
  if (!deckData?.roots?.length) return null;
  const { nodes, links } = deckTreeToGraph(deckData.roots);
  // Merge cross-links (only if both endpoints exist as nodes)
  const nodeIds = new Set(nodes.map(n => n.id));
  const merged = [
    ...links,
    ...crossLinks.filter(cl => nodeIds.has(cl.source) && nodeIds.has(cl.target)),
  ];
  return { nodes, links: merged };
}, [deckData, crossLinks]);
```

- [ ] **Step 3: Add ankiReceive handler for graph.crossLinks in App.jsx**

The existing handler for `graph.*` events should already cover this (added in Task 12 of v1). Verify it dispatches `graph.crossLinks` as a CustomEvent.

- [ ] **Step 4: Build and verify**

```bash
cd frontend && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useKnowledgeGraph.js frontend/src/components/GraphView.jsx frontend/src/App.jsx
git commit -m "feat(kg-v2): merge deck cross-links into graph, simplify hook"
```

---

## Task 5: Search → Focused Deck Network

**Files:**
- Modify: `ui/widget.py`
- Modify: `frontend/src/components/GraphView.jsx`

- [ ] **Step 1: Update searchGraph handler for deck-based search**

The existing `_msg_search_graph` in widget.py searches `kg_terms`. For v2, it should find decks containing the search term:

```python
def _msg_search_graph(self, data):
    """Find sub-decks containing cards with the search term."""
    try:
        query = data.get("query", "") if isinstance(data, dict) else str(data)
        try:
            from ..storage.kg_store import search_decks_by_term
        except ImportError:
            from storage.kg_store import search_decks_by_term
        deck_ids = search_decks_by_term(query)
        self._send_to_js({
            "type": "graph.searchResult",
            "data": {"matchedDeckIds": [str(d) for d in deck_ids], "query": query}
        })
    except Exception as e:
        logger.exception("searchGraph failed")
```

- [ ] **Step 2: Add `search_decks_by_term()` to kg_store.py**

```python
def search_decks_by_term(query):
    """Find deck_ids that contain cards with the given term."""
    db = _get_db()
    rows = db.execute(
        "SELECT DISTINCT deck_id FROM kg_card_terms WHERE term LIKE ? OR term LIKE ?",
        (query, f"%{query}%")
    ).fetchall()
    return [r["deck_id"] for r in rows if r["deck_id"]]
```

- [ ] **Step 3: Update search highlight in GraphView for deck IDs**

```javascript
useEffect(() => {
  if (!graphRef.current || !graphData) return;

  if (!searchResult?.matchedDeckIds?.length) {
    graphRef.current.nodeVisibility(() => true);
    graphRef.current.linkVisibility(() => true);
    graphRef.current.nodeColor(node => node.deckColor);
    return;
  }

  const matched = new Set(searchResult.matchedDeckIds);
  // Also include parent decks of matched decks
  const visible = new Set(matched);
  graphData.nodes.forEach(n => {
    if (matched.has(n.id) && n.parentId) visible.add(n.parentId);
  });

  graphRef.current.nodeVisibility(node => visible.has(node.id));
  graphRef.current.linkVisibility(link => {
    const src = link.source?.id || link.source;
    const tgt = link.target?.id || link.target;
    return visible.has(src) && visible.has(tgt);
  });
  graphRef.current.nodeColor(node =>
    matched.has(node.id) ? '#FFFFFF' : node.deckColor
  );

  // Fly to first match
  const target = graphRef.current.graphData().nodes.find(n => matched.has(n.id));
  if (target) {
    graphRef.current.cameraPosition(
      { x: target.x + 80, y: target.y + 40, z: target.z + 80 },
      target, 1000
    );
  }
}, [searchResult, graphData]);
```

- [ ] **Step 4: Write test for search_decks_by_term**

Add to `tests/test_kg_store.py`:

```python
def test_search_decks_by_term(self):
    kg.save_card_terms(100, ["Kollagen"], deck_id=1)
    kg.save_card_terms(200, ["Kollagen"], deck_id=2)
    kg.save_card_terms(300, ["Glykolyse"], deck_id=3)
    deck_ids = kg.search_decks_by_term("Kollagen")
    assert set(deck_ids) == {1, 2}

def test_search_decks_partial_match(self):
    kg.save_card_terms(100, ["Aktionspotential"], deck_id=1)
    deck_ids = kg.search_decks_by_term("Aktion")
    assert 1 in deck_ids
```

- [ ] **Step 5: Run tests, build, commit**

```bash
python3 run_tests.py -k "test_kg_store" -v
cd frontend && npm run build
git add storage/kg_store.py ui/widget.py frontend/src/components/GraphView.jsx tests/test_kg_store.py
git commit -m "feat(kg-v2): search finds decks containing term, shows focused network"
```

---

## Task 6: Node Click → Start Stack / Bottom Bar

**Files:**
- Modify: `frontend/src/components/GraphView.jsx`

- [ ] **Step 1: Update handleNodeClick for deck nodes**

When clicking a deck node, the user should be able to start studying that deck. Update the click handler:

```javascript
const handleNodeClick = useCallback((node) => {
  if (!node || !graphRef.current) return;
  setSelectedTerm(node.label);

  // Fly camera to node
  const dist = 60 + (node.depth === 0 ? 40 : 0);
  const distRatio = 1 + dist / Math.hypot(node.x || 1, node.y || 1, node.z || 1);
  graphRef.current.cameraPosition(
    { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
    node, 1000
  );
}, [setSelectedTerm]);
```

- [ ] **Step 2: Show deck info in the selected term badge**

Replace the simple selected term badge with deck info:

```jsx
{selectedTerm && (
  <div style={{
    position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
    padding: '8px 20px', borderRadius: 14,
    background: 'var(--ds-bg-frosted)', backdropFilter: 'blur(20px)',
    border: '1px solid var(--ds-border-subtle)',
    color: 'var(--ds-text-primary)', fontSize: 14, fontWeight: 500,
    zIndex: 10, whiteSpace: 'nowrap',
    display: 'flex', alignItems: 'center', gap: 12,
    boxShadow: 'var(--ds-shadow-md)',
  }}>
    <span>{selectedTerm}</span>
    <button
      onClick={() => {
        // Open this deck for study
        const { executeAction } = require('../actions');
        const node = graphData?.nodes?.find(n => n.label === selectedTerm);
        if (node) executeAction('deck.study', { deckId: parseInt(node.id) });
      }}
      style={{
        background: 'var(--ds-accent)', color: 'white', border: 'none',
        borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 600,
        cursor: 'pointer', fontFamily: 'inherit',
      }}
    >
      Stapel starten
    </button>
  </div>
)}
```

- [ ] **Step 3: Build and commit**

```bash
cd frontend && npm run build
git add frontend/src/components/GraphView.jsx
git commit -m "feat(kg-v2): click deck node → show info + start stack button"
```

---

## Task 7: Integration Test

- [ ] **Step 1: Run all Python tests**

```bash
python3 run_tests.py -v
```

- [ ] **Step 2: Build frontend**

```bash
cd frontend && npm run build
```

- [ ] **Step 3: Manual Anki test**

Restart Anki, verify:
1. Graph view shows deck hierarchy as 3D nodes (Anatomie, Biochemie, etc.)
2. Sub-decks visible as smaller nodes connected to parents
3. Cross-link edges between related decks (if KG terms exist)
4. Search "Kollagen" → shows only decks containing Kollagen cards
5. Click a deck → "Stapel starten" button appears
6. "Stapel starten" → enters review
7. "Deck-Liste" toggle works
8. Canvas fills entire screen, resizes with window

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(kg-v2): complete deck-hierarchy Knowledge Graph"
```
