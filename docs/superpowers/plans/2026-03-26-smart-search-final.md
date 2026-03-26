# Smart Search Final Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Stapel tab search into a unified "Google for your cards" — type a question → get a concise AI answer + semantic card network + dynamic stack, with the search bar morphing from top to bottom input dock.

**Architecture:** The existing GraphView component is refactored to use ChatInput as its input dock. On search submit, the input morphs to the bottom, search results render as a star-topology 3D graph with semantic clusters. A new `quickAnswer` backend handler generates a concise 2-3 sentence answer from the top cards. Cluster computation groups cards by pairwise embedding similarity.

**Tech Stack:** React, 3d-force-graph, ChatInput component, Gemini Flash (via backend), existing hybrid search

**Spec:** `docs/superpowers/specs/2026-03-26-smart-search-final-design.md`

---

## File Structure

### Modified Files

| File | Changes |
|------|---------|
| `frontend/src/components/GraphView.jsx` | Major refactor: two-state layout (search-top vs results-bottom), ChatInput integration, cluster-based graph rendering |
| `ui/widget.py` | Add `quickAnswer` handler, modify `SearchCardsThread` for cluster output |
| `ai/gemini.py` | Add `generate_quick_answer()` function |

### No New Files

Everything builds on existing components: GraphView, ChatInput, KnowledgeHeatmap, SearchCardsThread.

---

## Task 1: Search Bar Morph — Two-State Layout

**Files:**
- Modify: `frontend/src/components/GraphView.jsx`

Refactor GraphView to have two visual states:
- **State A (default):** Search bar centered at top, heatmap below
- **State B (search active):** ChatInput docked at bottom, graph above

- [ ] **Step 1: Add `searchActive` state and phase tracking**

```javascript
const [searchActive, setSearchActive] = useState(false);
const [answerText, setAnswerText] = useState(null);
```

- [ ] **Step 2: Replace the `<form>` search bar with ChatInput in two positions**

When `!searchActive`: render a simplified search input centered below the logo (current position).

When `searchActive`: render ChatInput at the bottom using the standard `.ds-input-dock` pattern.

```jsx
import ChatInput from './ChatInput';

// State A: centered search (before any search)
{!searchActive && (
  <div style={{...centered styles...}}>
    <div className="ds-frosted" style={{...search bar styles...}}>
      <Search size={16} ... />
      <input
        type="text"
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && searchQuery.trim()) handleSearch(); }}
        placeholder="Was willst du lernen?"
        ...
      />
    </div>
  </div>
)}

// State B: ChatInput docked at bottom (after search)
{searchActive && (
  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 15, pointerEvents: 'auto' }}>
    <ChatInput
      onSend={(text) => {
        setSearchQuery(text);
        handleSearch(text);
      }}
      isLoading={isSearching}
      placeholder={answerText || "Nächste Suche..."}
      actionPrimary={{
        label: answerText ? `${searchResult?.totalFound || 0} Karten kreuzen` : '',
        onClick: () => {
          if (searchResult?.cards?.length) {
            window.ankiBridge?.addMessage('startTermStack', {
              term: searchResult.query,
              cardIds: JSON.stringify(searchResult.cards.map(c => Number(c.id))),
            });
          }
        },
        disabled: !searchResult?.cards?.length,
      }}
      actionSecondary={{
        label: '✕',
        onClick: () => {
          setSearchActive(false);
          setSearchResult(null);
          setAnswerText(null);
          setSearchQuery('');
        },
      }}
      hideInput={!!answerText}
    />
  </div>
)}
```

**Key:** When `answerText` is set, the ChatInput shows the answer text instead of an input field (using `hideInput={true}` + `placeholder` as display text). Tapping the input area clears the answer and shows the cursor again.

Actually — ChatInput has a `hideInput` prop but showing answer text requires a different approach. Read ChatInput.tsx to understand how `topSlot` or `placeholder` could display the answer. The simplest approach: use a `topSlot` that shows the answer, and keep the input below for next query.

- [ ] **Step 3: Implement `handleSearch` function**

```javascript
const handleSearch = useCallback((queryOverride) => {
  const query = (queryOverride || searchQuery).trim();
  if (!query) return;
  setSearchActive(true);
  setIsSearching(true);
  setSearchResult(null);
  setAnswerText(null);
  setSelectedCard(null);

  // Fire search
  window.ankiBridge?.addMessage('searchCards', { query, topK: 25 });
  // Fire quick answer in parallel
  window.ankiBridge?.addMessage('quickAnswer', { query });
}, [searchQuery]);
```

- [ ] **Step 4: Listen for `graph.quickAnswer` event**

Add to the useEffect that listens for events:
```javascript
const onQuickAnswer = (e) => {
  setAnswerText(e.detail?.answer || null);
};
window.addEventListener('graph.quickAnswer', onQuickAnswer);
// cleanup...
```

- [ ] **Step 5: Adjust layout — heatmap only when !searchActive, graph only when searchActive**

```jsx
{/* Heatmap — shown when no search active */}
{!searchActive && deckData?.roots?.length > 0 && (
  <div style={{...heatmap container...}}>
    <KnowledgeHeatmap deckData={deckData} onStartStack={...} />
  </div>
)}

{/* 3D Graph — shown when search active and has results */}
{searchActive && hasResults && (
  <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
)}
```

- [ ] **Step 6: Build and verify**

```bash
cd frontend && npm run build
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/GraphView.jsx
git commit -m "feat(search): two-state layout with ChatInput dock for search results"
```

---

## Task 2: Cluster Computation Backend

**Files:**
- Modify: `ui/widget.py` (SearchCardsThread)

Change `SearchCardsThread.run()` to compute semantic clusters and return them instead of flat card list.

- [ ] **Step 1: Add cluster computation after card search**

After finding cards and their scores, bring back pairwise similarity computation (previously removed), but use it to BUILD CLUSTERS instead of showing individual edges:

```python
# After getting cards_data and card_embs...

# Compute pairwise similarity matrix
sim_matrix = {}
cids_list = list(card_embs.keys())
for i in range(len(cids_list)):
    for j in range(i + 1, len(cids_list)):
        a = card_embs[cids_list[i]]
        b = card_embs[cids_list[j]]
        dot = sum(x * y for x, y in zip(a, b))
        na = sum(x * x for x in a) ** 0.5
        nb = sum(x * x for x in b) ** 0.5
        if na > 0 and nb > 0:
            sim = dot / (na * nb)
            if sim > 0.45:
                sim_matrix[(cids_list[i], cids_list[j])] = sim
                sim_matrix[(cids_list[j], cids_list[i])] = sim

# Build clusters via connected components
clusters = []
assigned = set()
for cid in card_ids:
    if cid in assigned:
        continue
    # BFS to find connected component
    cluster = [cid]
    queue = [cid]
    assigned.add(cid)
    while queue:
        current = queue.pop(0)
        for other in card_ids:
            if other not in assigned and (current, other) in sim_matrix:
                cluster.append(other)
                assigned.add(other)
                queue.append(other)
    clusters.append(cluster)

# Build cluster output
cards_by_id = {c["id"]: c for c in cards_data}
cluster_output = []
for i, cluster_cids in enumerate(clusters):
    cluster_cards = [cards_by_id.get(str(cid)) for cid in cluster_cids if cards_by_id.get(str(cid))]
    if not cluster_cards:
        continue
    # Label: most common deck name in cluster
    deck_counts = {}
    for c in cluster_cards:
        d = c.get("deck", "")
        deck_counts[d] = deck_counts.get(d, 0) + 1
    label = max(deck_counts, key=deck_counts.get) if deck_counts else f"Cluster {i+1}"
    cluster_output.append({
        "id": f"cluster_{i}",
        "label": label,
        "cards": cluster_cards,
    })
```

- [ ] **Step 2: Update the result format**

Change the emitted JSON from flat cards+edges to clusters:

```python
self.result_signal.emit(json.dumps({
    "type": "graph.searchCards",
    "data": {
        "clusters": cluster_output,
        "query": self.query,
        "totalFound": len(cards_data),
        "cards": cards_data,  # Keep flat list for backward compat
    }
}))
```

- [ ] **Step 3: Commit**

```bash
git add ui/widget.py
git commit -m "feat(search): compute semantic clusters from pairwise card similarity"
```

---

## Task 3: Quick Answer Backend

**Files:**
- Modify: `ai/gemini.py` (add `generate_quick_answer`)
- Modify: `ui/widget.py` (add handler + thread)

- [ ] **Step 1: Add `generate_quick_answer` to gemini.py**

Based on existing `generate_definition` pattern:

```python
def generate_quick_answer(query, card_texts, cluster_labels=None, model=None):
    """Generate a concise 2-3 sentence answer + optional cluster labels.

    Returns dict: { "answer": str, "answerable": bool, "clusterLabels": dict }
    """
    if not card_texts:
        return {"answer": "Nicht genug Karten zu diesem Thema.", "answerable": False, "clusterLabels": {}}

    cards_str = "\n".join(
        "Karte %d: %s | %s" % (i+1, c.get('question','')[:60], c.get('answer','')[:60])
        for i, c in enumerate(card_texts[:10])
    )

    # Detect: single term vs question
    is_question = any(w in query.lower() for w in ['was','wie','warum','welche','wozu','wann','erkläre','?'])

    if is_question:
        prompt = (
            "Beantworte diese Frage in maximal 2 Sätzen basierend auf diesen Lernkarten:\n"
            "\"%s\"\n\n%s\n\n"
            "Beantworte NUR den Kern der Frage. "
            "Wenn die Karten nicht genug Kontext bieten, antworte GENAU: "
            "\"Diese Frage kann mit deinen Karten nicht beantwortet werden.\""
        ) % (query, cards_str)
    else:
        prompt = (
            "Definiere '%s' in maximal 2 Sätzen basierend auf diesen Lernkarten:\n\n%s\n\n"
            "Wenn die Karten keine klare Definition liefern, antworte GENAU: "
            "\"Keine Definition in deinen Karten gefunden.\""
        ) % (query, cards_str)

    # Add cluster labeling if clusters provided
    if cluster_labels:
        cluster_str = "\n".join("Cluster %s: %s" % (k, ", ".join(v[:3])) for k, v in cluster_labels.items())
        prompt += "\n\nBenenne außerdem jeden Cluster mit 2-3 Wörtern:\n" + cluster_str
        prompt += "\nFormat: ANTWORT: [deine Antwort]\nCLUSTER: cluster_0=Name, cluster_1=Name"

    # Use existing API call pattern from generate_definition
    # ... (same backend/openrouter routing)
```

- [ ] **Step 2: Add `quickAnswer` message handler to widget.py**

Add to handler dict:
```python
'quickAnswer': self._msg_quick_answer,
```

Create a QThread for it (similar to KGDefinitionThread):

```python
class QuickAnswerThread(QThread):
    result_signal = pyqtSignal(str)

    def __init__(self, query, cards_data, cluster_info, widget_ref):
        super().__init__()
        self.query = query
        self.cards_data = cards_data
        self.cluster_info = cluster_info
        self._widget_ref = weakref.ref(widget_ref)

    def run(self):
        try:
            from ..ai.gemini import generate_quick_answer
            result = generate_quick_answer(self.query, self.cards_data, self.cluster_info)
            self.result_signal.emit(json.dumps({
                "type": "graph.quickAnswer",
                "data": result
            }))
        except Exception as e:
            logger.exception("QuickAnswer failed")
            self.result_signal.emit(json.dumps({
                "type": "graph.quickAnswer",
                "data": {"answer": "", "answerable": False}
            }))
```

The handler needs the search results (card texts) to generate the answer. Two approaches:
- **Option A:** `quickAnswer` message carries the query, the handler waits for `searchCards` to complete and then uses those results
- **Option B:** `searchCards` itself triggers the quick answer after finding cards

**Option B is simpler:** At the end of `SearchCardsThread.run()`, after computing clusters, launch the quick answer generation:

```python
# At end of SearchCardsThread.run(), after emitting graph.searchCards:
# Trigger quick answer with the found cards
try:
    widget = self._widget_ref()
    if widget:
        widget._start_quick_answer(self.query, cards_data[:10], cluster_output)
except Exception:
    pass
```

- [ ] **Step 3: Add handler methods**

```python
def _msg_quick_answer(self, data):
    """Manual trigger for quick answer (not usually needed, searchCards triggers it)."""
    pass  # Reserved for future use

def _start_quick_answer(self, query, cards_data, clusters):
    """Launch QuickAnswerThread."""
    cluster_info = {c["id"]: [card["question"][:40] for card in c["cards"][:3]] for c in clusters}
    self._quick_answer_thread = QuickAnswerThread(query, cards_data, cluster_info, self)
    self._quick_answer_thread.result_signal.connect(self._on_quick_answer_result)
    self._quick_answer_thread.start()

def _on_quick_answer_result(self, result_json):
    try:
        self._send_to_js(json.loads(result_json))
    except Exception:
        logger.exception("Failed to send quick answer")
```

- [ ] **Step 4: Commit**

```bash
git add ai/gemini.py ui/widget.py
git commit -m "feat(search): add quick answer generation with cluster labels"
```

---

## Task 4: Cluster-Based Graph Rendering

**Files:**
- Modify: `frontend/src/components/GraphView.jsx`

Update the ForceGraph3D rendering to show star topology with cluster nodes.

- [ ] **Step 1: Build cluster graph data from search results**

```javascript
// When searchResult arrives with clusters:
const graphData = useMemo(() => {
  if (!searchResult?.clusters?.length) return null;

  const nodes = [];
  const links = [];

  // Query center node
  nodes.push({
    id: '__query__',
    label: searchResult.query,
    color: '#FFFFFF',
    isQuery: true,
    isCluster: false,
    val: 4,
  });

  // Cluster nodes + card nodes
  searchResult.clusters.forEach((cluster, ci) => {
    const clusterId = cluster.id;

    // Cluster node
    nodes.push({
      id: clusterId,
      label: cluster.label,
      color: DECK_COLORS[ci % DECK_COLORS.length],
      isQuery: false,
      isCluster: true,
      cardCount: cluster.cards.length,
      val: 2 + cluster.cards.length * 0.3,
    });

    // Link query → cluster
    links.push({ source: '__query__', target: clusterId, value: 0.8 });

    // Card nodes within cluster
    cluster.cards.forEach(card => {
      nodes.push({
        id: card.id,
        label: card.question,
        deck: card.deck,
        deckFull: card.deckFull,
        score: card.score,
        color: deckColor(card.deck),
        isQuery: false,
        isCluster: false,
        val: 0.6 + card.score,
      });
      // Link cluster → card
      links.push({ source: clusterId, target: card.id, value: card.score });
    });
  });

  return { nodes, links };
}, [searchResult]);
```

- [ ] **Step 2: Update ForceGraph3D configuration for cluster topology**

```javascript
graph
  .graphData(graphData)
  .backgroundColor('rgba(0,0,0,0)')
  .nodeColor(n => n.color)
  .nodeVal(n => n.val)
  .nodeLabel(n => {
    if (n.isQuery) return n.label;
    if (n.isCluster) return `${n.label} (${n.cardCount} Karten)`;
    return `${n.label}\n${n.deck}`;
  })
  .nodeOpacity(n => n.isQuery ? 1.0 : n.isCluster ? 0.9 : 0.75)
  .linkWidth(l => l.value * 1.5)
  .linkOpacity(0.1)
  .linkColor(() => 'rgba(255,255,255,0.12)')
  .onNodeClick(node => {
    if (!node || node.isQuery) return;
    if (node.isCluster) {
      // Zoom to cluster
      graph.zoomToFit(800, 40, n => n.id === node.id || links.some(l =>
        (l.source.id || l.source) === node.id && (l.target.id || l.target) === n.id
      ));
      return;
    }
    setSelectedCard(node);
  })
  .warmupTicks(0)
  .cooldownTicks(200)
  .showNavInfo(false);

// Zoom to fit after settling
setTimeout(() => graph.zoomToFit(800, 60), 1500);
```

- [ ] **Step 3: Update the answer display integration**

When `answerText` arrives via `graph.quickAnswer`, also update cluster labels if LLM provided them:

```javascript
const onQuickAnswer = (e) => {
  const data = e.detail;
  setAnswerText(data?.answer || null);
  // Update cluster labels if provided
  if (data?.clusterLabels && searchResult?.clusters) {
    // Update labels in place (or via state update)
  }
};
```

- [ ] **Step 4: Update deck legend for clusters**

The right-side legend should show cluster labels (not individual deck names):

```javascript
const clusterLegend = useMemo(() => {
  if (!searchResult?.clusters?.length) return [];
  return searchResult.clusters.map((c, i) => ({
    label: c.label,
    count: c.cards.length,
    color: DECK_COLORS[i % DECK_COLORS.length],
  }));
}, [searchResult]);
```

- [ ] **Step 5: Build and verify**

```bash
cd frontend && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/GraphView.jsx
git commit -m "feat(search): cluster-based star topology with query center + ChatInput dock"
```

---

## Task 5: Answer Display in ChatInput

**Files:**
- Modify: `frontend/src/components/GraphView.jsx`

Integrate the answer text elegantly into the bottom ChatInput area.

- [ ] **Step 1: Use ChatInput's `topSlot` for answer display**

ChatInput accepts a `topSlot` prop for content above the textarea. Use it to show the answer:

```jsx
<ChatInput
  onSend={(text) => handleSearch(text)}
  isLoading={isSearching}
  placeholder="Nächste Suche..."
  topSlot={answerText ? (
    <div style={{
      padding: '8px 12px',
      fontSize: 13,
      color: 'var(--ds-text-primary)',
      lineHeight: 1.5,
      borderBottom: '1px solid var(--ds-border-subtle)',
    }}>
      {answerText}
    </div>
  ) : null}
  actionPrimary={{
    label: searchResult?.totalFound ? `${searchResult.totalFound} Karten kreuzen` : '',
    onClick: startStack,
    disabled: !searchResult?.totalFound,
  }}
  actionSecondary={{
    label: '',
    shortcut: 'Esc',
    onClick: dismissSearch,
  }}
/>
```

- [ ] **Step 2: Handle dismiss and next query**

```javascript
const dismissSearch = useCallback(() => {
  setSearchActive(false);
  setSearchResult(null);
  setAnswerText(null);
  setSearchQuery('');
  if (graphRef.current?._destructor) graphRef.current._destructor();
  graphRef.current = null;
}, []);

const startStack = useCallback(() => {
  if (!searchResult?.cards?.length) return;
  window.ankiBridge?.addMessage('startTermStack', {
    term: searchResult.query,
    cardIds: JSON.stringify(searchResult.cards.map(c => Number(c.id))),
  });
}, [searchResult]);
```

- [ ] **Step 3: Handle Escape key to dismiss**

The ChatInput already handles Escape via `actionSecondary`. When the user presses Escape with empty input, it calls `actionSecondary.onClick()` which dismisses.

- [ ] **Step 4: Build, test, commit**

```bash
cd frontend && npm run build
git add frontend/src/components/GraphView.jsx
git commit -m "feat(search): answer display in ChatInput topSlot with dismiss/next flow"
```

---

## Task 6: App.jsx Event Routing

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Add `graph.quickAnswer` to the event dispatcher**

The existing `graph.*` handler should already cover it (starts with `graph.`). Verify by reading App.jsx line ~756. If it dispatches all `graph.*` events as CustomEvents, no change needed.

- [ ] **Step 2: Build and verify**

```bash
cd frontend && npm run build
```

- [ ] **Step 3: Commit (if changes needed)**

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

- [ ] **Step 3: Manual Anki test checklist**

1. Open Anki → Stapel tab shows deck list with heatmap
2. Type "Cortisol" in search bar → press Enter
3. Search bar transforms to bottom input dock
4. 3D graph appears with query center node + cluster nodes + card nodes
5. After ~2s: answer text appears in the input dock
6. "25 Karten kreuzen" button visible
7. Click "Karten kreuzen" → enters review
8. Press Escape → back to heatmap
9. Type new query → new search replaces old results
10. Click a cluster node → zooms to that cluster

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: complete Smart Search with AI answer + semantic clusters"
```
