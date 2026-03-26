# Smart Search v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current flat Smart Search with a cluster-first exploration experience: 3D graph (canvas) + SearchSidebar (right panel) + ChatInput (action dock).

**Architecture:** New `useSmartSearch` hook owns all search state (survives view transitions). `SearchSidebar.jsx` is a standalone panel (not inside SidebarShell). GraphView orchestrates the canvas + sidebar + ChatInput. Backend gets one expanded LLM call for answer + cluster names + cluster summaries.

**Tech Stack:** React 18, 3d-force-graph, Python/Qt backend, Gemini 2.5 Flash API

**Spec:** `docs/superpowers/specs/2026-03-26-smart-search-v2-design.md`

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `frontend/src/hooks/useSmartSearch.js` | All search state: query, results, clusters, selectedClusterId, answer, summaries. Persists across view transitions. |
| `frontend/src/components/SearchSidebar.jsx` | Right panel: answer + cluster list + cluster detail with CardRefChips |

### Modified files
| File | Changes |
|------|---------|
| `ai/gemini.py` | Expand `generate_quick_answer()`: accept 50 cards, raise truncation limit to 12000, add cluster summaries to prompt/parsing |
| `ui/widget.py` | `_on_search_cards_result`: pass 50 cards to QuickAnswerThread. `_msg_search_cards`: support topK up to 100. Clustering: new formula `clamp(3, floor(n/10), 6)` |
| `frontend/src/components/GraphView.jsx` | Major rewrite: integrate useSmartSearch hook, render SearchSidebar, cluster selection → camera rotation, remove inline state |
| `frontend/src/App.jsx` | Wire useSmartSearch at app level, pass to GraphView |

---

## Task 1: Backend — Expand LLM prompt for cluster summaries

**Files:**
- Modify: `ai/gemini.py:740-870` (generate_quick_answer)
- Test: `tests/test_gemini_quick_answer.py` (new)

- [ ] **Step 1: Write test for expanded prompt parsing**

```python
# tests/test_gemini_quick_answer.py
import pytest

def test_parse_cluster_summaries():
    """Test that the new ANTWORT/CLUSTER format parses correctly."""
    from ai.gemini import _parse_quick_answer_response

    response = (
        "ANTWORT: Cortisol ist ein Glucocorticoid der NNR.\n"
        "CLUSTER: cluster_0=Biosynthese|Cortisol wird aus Cholesterol synthetisiert. "
        "Die Synthese erfolgt in der Zona fasciculata.\n"
        "cluster_1=Wirkungen|Cortisol wirkt katabol und immunsuppressiv. "
        "Es beeinflusst den Glukosestoffwechsel."
    )

    result = _parse_quick_answer_response(response, has_clusters=True)

    assert result["answer"] == "Cortisol ist ein Glucocorticoid der NNR."
    assert result["answerable"] is True
    assert result["clusterLabels"]["cluster_0"] == "Biosynthese"
    assert result["clusterSummaries"]["cluster_0"].startswith("Cortisol wird")
    assert result["clusterLabels"]["cluster_1"] == "Wirkungen"
    assert "clusterSummaries" in result


def test_parse_fallback_no_cluster_marker():
    """If CLUSTER: marker is missing, return answer only."""
    from ai.gemini import _parse_quick_answer_response

    response = "Cortisol ist ein Stresshormon der NNR."
    result = _parse_quick_answer_response(response, has_clusters=True)

    assert result["answer"] == "Cortisol ist ein Stresshormon der NNR."
    assert result["clusterLabels"] == {}
    assert result["clusterSummaries"] == {}


def test_parse_fallback_no_answer_marker():
    """If ANTWORT: marker is missing, treat entire response as answer."""
    from ai.gemini import _parse_quick_answer_response

    response = "Cortisol ist ein Glucocorticoid."
    result = _parse_quick_answer_response(response, has_clusters=False)

    assert result["answer"] == "Cortisol ist ein Glucocorticoid."


def test_parse_pipe_in_cluster_name():
    """Only split on FIRST pipe — name may contain special chars."""
    from ai.gemini import _parse_quick_answer_response

    response = (
        "ANTWORT: Test.\n"
        "CLUSTER: cluster_0=Typ I / II|Beide Typen kommen vor."
    )
    result = _parse_quick_answer_response(response, has_clusters=True)

    assert result["clusterLabels"]["cluster_0"] == "Typ I / II"
    assert result["clusterSummaries"]["cluster_0"] == "Beide Typen kommen vor."
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/johanneshinkel/Library/Application\ Support/Anki2/addons21/AnkiPlus_main
python3 run_tests.py -k test_parse_cluster -v
```

Expected: ImportError — `_parse_quick_answer_response` doesn't exist yet.

- [ ] **Step 3: Extract parsing into dedicated function + expand prompt**

In `ai/gemini.py`, extract the response parsing (currently inline at lines 841-869) into a new function `_parse_quick_answer_response(text, has_clusters)`. Then modify `generate_quick_answer()`:

```python
# ai/gemini.py — add after line 739

def _parse_quick_answer_response(text, has_clusters=False):
    """Parse LLM response into answer + cluster labels + cluster summaries.

    Returns dict: {"answer": str, "answerable": bool,
                   "clusterLabels": dict, "clusterSummaries": dict}
    """
    text = text.strip()
    parsed_labels = {}
    parsed_summaries = {}

    if has_clusters and "ANTWORT:" in text:
        parts = text.split("CLUSTER:")
        answer = parts[0].replace("ANTWORT:", "").strip()
        if len(parts) > 1:
            for line in parts[1].strip().split("\n"):
                line = line.strip()
                if "=" not in line:
                    continue
                key, rest = line.split("=", 1)
                key = key.strip()
                if "|" in rest:
                    name, summary = rest.split("|", 1)
                    parsed_labels[key] = name.strip()
                    parsed_summaries[key] = summary.strip()
                else:
                    parsed_labels[key] = rest.strip()
    else:
        answer = text.replace("ANTWORT:", "").strip()

    answerable = not any(phrase in answer for phrase in [
        "kann mit deinen Karten nicht beantwortet",
        "Keine Definition in deinen Karten",
        "Nicht genug Karten",
    ])

    return {
        "answer": answer,
        "answerable": answerable,
        "clusterLabels": parsed_labels,
        "clusterSummaries": parsed_summaries,
    }
```

Then update `generate_quick_answer()`:
- Raise truncation: `if len(prompt) > 12000: prompt = prompt[:12000]`
- Accept `max_cards=50` parameter (was hardcoded to 10 in widget.py)
- Expand the cluster section of the prompt to request summaries:

```python
# Replace the cluster labeling block (lines 785-793)
if cluster_labels:
    cluster_str = "\n".join(
        "Cluster %s: %s" % (k, ", ".join(str(s)[:30] for s in v[:3]))
        for k, v in cluster_labels.items()
    )
    prompt += (
        "\n\nBenenne jeden Cluster mit 2-3 Wörtern und schreibe eine "
        "2-Satz-Zusammenfassung:\n%s\n"
        "Format:\nCLUSTER: cluster_0=Name|Zusammenfassung\n"
        "cluster_1=Name|Zusammenfassung"
    ) % cluster_str
```

Replace the inline parsing (lines 841-869) with a call to `_parse_quick_answer_response()`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
python3 run_tests.py -k test_parse_cluster -v
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add ai/gemini.py tests/test_gemini_quick_answer.py
git commit -m "feat: expand quick answer with cluster summaries + robust parsing"
```

---

## Task 2: Backend — Dynamic card count + improved clustering

**Files:**
- Modify: `ui/widget.py:289-600` (SearchCardsThread), `ui/widget.py:2860-2920` (handlers)
- Test: Manual (clustering changes are hard to unit test without embeddings)

- [ ] **Step 1: Raise topK and pass more cards to QuickAnswer**

In `ui/widget.py`, method `_msg_search_cards` (~line 2863):
```python
# Change default topK
top_k = int(data.get('topK', 100))  # was 25
```

In `_on_search_cards_result` (~line 2895):
```python
# Pass top 50 cards to quick answer (was 10)
cards = data.get("cards", [])[:50]
```

- [ ] **Step 2: Update clustering formula**

In `SearchCardsThread.run()`, replace the TARGET_CLUSTERS calculation (~line 438):
```python
# New formula: clamp(3, floor(n/10), 6)
n_cards = len(card_ids)
if n_cards < 6:
    TARGET_CLUSTERS = 1  # no clustering for very few cards
else:
    TARGET_CLUSTERS = max(3, min(6, n_cards // 10))
```

- [ ] **Step 3: Add clusterSummaries to quickAnswer event**

In `_on_quick_answer_result` (~line 2912), ensure `clusterSummaries` is forwarded:
```python
# The generate_quick_answer return dict now includes clusterSummaries
# _send_to_js already forwards the entire data dict, so this should work
# automatically. Verify the event payload includes clusterSummaries.
```

- [ ] **Step 4: Test in Anki**

Restart Anki, search for a topic with many cards. Verify in browser console:
- `graph.searchCards` event has more cards (up to 100)
- `graph.quickAnswer` event includes `clusterSummaries` dict
- Clusters are 3-6 groups

- [ ] **Step 5: Commit**

```bash
git add ui/widget.py
git commit -m "feat: dynamic card count (up to 100), improved clustering formula"
```

---

## Task 3: Frontend — useSmartSearch hook

**Files:**
- Create: `frontend/src/hooks/useSmartSearch.js`

- [ ] **Step 1: Create the hook**

```javascript
// frontend/src/hooks/useSmartSearch.js
import { useState, useCallback, useEffect, useRef } from 'react';

export default function useSmartSearch() {
  const [query, setQuery] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [answerText, setAnswerText] = useState(null);
  const [clusterLabels, setClusterLabels] = useState(null);
  const [clusterSummaries, setClusterSummaries] = useState(null);
  const [selectedClusterId, setSelectedClusterId] = useState(null);

  // Cache survives view transitions (ref persists across renders)
  const cacheRef = useRef(null);

  // Listen for backend events
  useEffect(() => {
    const onSearchCards = (e) => {
      const result = e.detail;
      setSearchResult(result);
      setIsSearching(false);
      setClusterLabels(null);
      setClusterSummaries(null);
      setSelectedClusterId(null);
      cacheRef.current = result;
    };

    const onQuickAnswer = (e) => {
      const data = e.detail;
      setAnswerText(data?.answer || null);
      if (data?.clusterLabels && Object.keys(data.clusterLabels).length > 0) {
        setClusterLabels(data.clusterLabels);
      }
      if (data?.clusterSummaries && Object.keys(data.clusterSummaries).length > 0) {
        setClusterSummaries(data.clusterSummaries);
      }
    };

    window.addEventListener('graph.searchCards', onSearchCards);
    window.addEventListener('graph.quickAnswer', onQuickAnswer);
    return () => {
      window.removeEventListener('graph.searchCards', onSearchCards);
      window.removeEventListener('graph.quickAnswer', onQuickAnswer);
    };
  }, []);

  const search = useCallback((q) => {
    setQuery(q);
    setIsSearching(true);
    setSearchResult(null);
    setAnswerText(null);
    setClusterLabels(null);
    setClusterSummaries(null);
    setSelectedClusterId(null);
    window.ankiBridge?.addMessage('searchCards', { query: q.trim(), topK: 100 });
  }, []);

  const reset = useCallback(() => {
    setQuery('');
    setSearchResult(null);
    setIsSearching(false);
    setAnswerText(null);
    setClusterLabels(null);
    setClusterSummaries(null);
    setSelectedClusterId(null);
    cacheRef.current = null;
  }, []);

  const restoreFromCache = useCallback(() => {
    if (cacheRef.current) {
      setSearchResult(cacheRef.current);
    }
  }, []);

  // Derive selected cluster data
  const selectedCluster = selectedClusterId != null && searchResult?.clusters
    ? searchResult.clusters.find((_, i) => `cluster_${i}` === selectedClusterId)
    : null;

  const selectedClusterLabel = selectedClusterId && clusterLabels?.[selectedClusterId]
    || selectedCluster?.label || null;

  const selectedClusterSummary = selectedClusterId && clusterSummaries?.[selectedClusterId] || null;

  return {
    query, searchResult, isSearching,
    answerText, clusterLabels, clusterSummaries,
    selectedClusterId, setSelectedClusterId,
    selectedCluster, selectedClusterLabel, selectedClusterSummary,
    search, reset, restoreFromCache,
    hasResults: !!(searchResult?.cards?.length > 0),
  };
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd frontend && npm run build 2>&1 | tail -3
```

Expected: Build succeeds (hook is not yet imported anywhere).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useSmartSearch.js
git commit -m "feat: useSmartSearch hook — centralized search state"
```

---

## Task 4: Frontend — SearchSidebar component

**Files:**
- Create: `frontend/src/components/SearchSidebar.jsx`

- [ ] **Step 1: Create SearchSidebar**

```jsx
// frontend/src/components/SearchSidebar.jsx
import React from 'react';
import CardRefChip from './CardRefChip';

export default function SearchSidebar({
  query,
  answerText,
  clusters,
  clusterLabels,
  clusterSummaries,
  selectedClusterId,
  onSelectCluster,
  visible,
  bridge,
}) {
  if (!visible) return null;

  const clusterColors = [
    '#3B6EA5', '#4A8C5C', '#B07D3A', '#7B5EA7',
    '#A0524B', '#4A9BAE', '#A69550', '#7A6B5D',
  ];

  const selectedIdx = selectedClusterId
    ? parseInt(selectedClusterId.replace('cluster_', ''), 10)
    : null;

  const displayAnswer = selectedClusterId && clusterSummaries?.[selectedClusterId]
    ? clusterSummaries[selectedClusterId]
    : answerText;

  const selectedCards = selectedIdx !== null && clusters?.[selectedIdx]
    ? clusters[selectedIdx].cards
    : null;

  return (
    <div style={{
      width: 320,
      flexShrink: 0,
      background: 'var(--ds-bg-deep)',
      borderLeft: '1px solid var(--ds-border-subtle)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      animation: 'slideInRight 0.3s ease-out',
    }}>
      {/* Scrollable content */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
        {/* Header */}
        <div>
          <div style={{
            fontSize: 18, fontWeight: 700,
            color: 'var(--ds-text-primary)',
            letterSpacing: '-0.3px',
          }}>
            {query}
          </div>
        </div>

        {/* Answer / Cluster Summary */}
        {displayAnswer && (
          <div style={{
            fontSize: 13,
            color: 'var(--ds-text-secondary)',
            lineHeight: 1.6,
          }}>
            {displayAnswer}
          </div>
        )}

        {/* Loading state */}
        {!answerText && (
          <div style={{
            fontSize: 12,
            color: 'var(--ds-text-tertiary)',
            fontStyle: 'italic',
          }}>
            Zusammenfassung wird geladen...
          </div>
        )}

        {/* Cluster list */}
        {clusters && clusters.length > 1 && (
          <>
            <div style={{
              borderTop: '1px solid var(--ds-border-subtle)',
              paddingTop: 12,
            }}>
              <div style={{
                fontSize: 10, fontWeight: 600,
                color: 'var(--ds-text-tertiary)',
                letterSpacing: '0.5px',
                marginBottom: 8,
              }}>
                PERSPEKTIVEN
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {clusters.map((cluster, i) => {
                  const cId = `cluster_${i}`;
                  const isSelected = selectedClusterId === cId;
                  const color = clusterColors[i % clusterColors.length];
                  const label = clusterLabels?.[cId] || cluster.label;

                  return (
                    <button
                      key={cId}
                      onClick={() => onSelectCluster(isSelected ? null : cId)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 10px', borderRadius: 8,
                        border: 'none', cursor: 'pointer',
                        fontFamily: 'inherit', textAlign: 'left',
                        background: isSelected
                          ? `color-mix(in srgb, ${color} 15%, transparent)`
                          : 'transparent',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => {
                        if (!isSelected) e.currentTarget.style.background = 'var(--ds-hover-tint)';
                      }}
                      onMouseLeave={e => {
                        if (!isSelected) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: color, flexShrink: 0,
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13, fontWeight: 500,
                          color: isSelected ? 'var(--ds-text-primary)' : 'var(--ds-text-secondary)',
                        }}>
                          {label}
                        </div>
                        <div style={{
                          fontSize: 11,
                          color: 'var(--ds-text-tertiary)',
                        }}>
                          {cluster.cards.length} Karten
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* CardRefChips for selected cluster */}
            {selectedCards && (
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 4,
                paddingTop: 8,
                borderTop: '1px solid var(--ds-border-subtle)',
              }}>
                <div style={{
                  fontSize: 10, fontWeight: 600,
                  color: 'var(--ds-text-tertiary)',
                  letterSpacing: '0.5px',
                  marginBottom: 4,
                }}>
                  KARTEN
                </div>
                {selectedCards.slice(0, 10).map(card => (
                  <CardRefChip
                    key={card.id}
                    cardId={card.id}
                    cardFront={card.question}
                    bridge={bridge}
                  />
                ))}
                {selectedCards.length > 10 && (
                  <div style={{
                    fontSize: 11, color: 'var(--ds-text-tertiary)',
                    padding: '4px 0',
                  }}>
                    +{selectedCards.length - 10} weitere
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add slideInRight keyframe to index.css**

In `frontend/src/index.css`, add:
```css
@keyframes slideInRight {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
```

- [ ] **Step 3: Build to verify**

```bash
cd frontend && npm run build 2>&1 | tail -3
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/SearchSidebar.jsx frontend/src/index.css
git commit -m "feat: SearchSidebar — cluster list, summaries, CardRefChips"
```

---

## Task 5: Frontend — Rewrite GraphView to use hook + sidebar

**Files:**
- Modify: `frontend/src/components/GraphView.jsx`
- Modify: `frontend/src/App.jsx` (~line 194, ~line 2361)

- [ ] **Step 1: Wire useSmartSearch in App.jsx**

At the top of the App component (~line 194), add:
```javascript
import useSmartSearch from './hooks/useSmartSearch';
// ... inside App function:
const smartSearch = useSmartSearch();
```

Pass it to GraphView (~line 2366):
```jsx
<GraphView
  onToggleView={() => setViewMode('decks')}
  isPremium={isPremium}
  deckData={deckBrowserData}
  smartSearch={smartSearch}
  bridge={bridgeRef.current}
/>
```

- [ ] **Step 2: Rewrite GraphView to use smartSearch prop + SearchSidebar**

Replace GraphView's internal search state with the `smartSearch` prop. Remove `searchResult`, `answerText`, `clusterLabels`, `isSearching` local states. Add `SearchSidebar` as a flex sibling to the canvas.

Key structural change:
```jsx
return (
  <div style={{ position: 'relative', flex: 1, display: 'flex', overflow: 'hidden' }}>
    {/* Canvas area (graph or heatmap) */}
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
      {/* 3D graph canvas */}
      {hasResults && <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />}

      {/* Heatmap (default) */}
      {!hasResults && deckData?.roots?.length > 0 && (
        <div style={{ /* heatmap wrapper */ }}>
          <KnowledgeHeatmap ... />
        </div>
      )}

      {/* ChatInput docked at bottom of canvas */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 15, ... }}>
        <ChatInput ... />
      </div>
    </div>

    {/* SearchSidebar — slides in when results exist */}
    <SearchSidebar
      visible={hasResults}
      query={smartSearch.query}
      answerText={smartSearch.answerText}
      clusters={smartSearch.searchResult?.clusters}
      clusterLabels={smartSearch.clusterLabels}
      clusterSummaries={smartSearch.clusterSummaries}
      selectedClusterId={smartSearch.selectedClusterId}
      onSelectCluster={smartSearch.setSelectedClusterId}
      bridge={bridge}
    />
  </div>
);
```

- [ ] **Step 3: Update graph building to react to cluster selection**

In the graph `useEffect`, add cluster selection highlighting. When `smartSearch.selectedClusterId` changes:

```javascript
useEffect(() => {
  if (!graphRef.current || !smartSearch.selectedClusterId) {
    // Reset all nodes to default color
    if (graphRef.current) {
      graphRef.current.nodeColor(n => n.isQuery ? '#FFFFFF' : n.color);
    }
    return;
  }

  const graph = graphRef.current;
  const idx = parseInt(smartSearch.selectedClusterId.replace('cluster_', ''), 10);

  // Brighten selected cluster, dim others
  graph.nodeColor(n => {
    if (n.isQuery) return '#FFFFFF';
    if (n.clusterIndex === idx) return n.brightColor || n.color;
    return n.color;
  });

  // Rotate camera to cluster centroid
  const { nodes } = graph.graphData();
  const clusterNodes = nodes.filter(n => n.clusterIndex === idx);
  if (clusterNodes.length > 0) {
    const cx = clusterNodes.reduce((s, n) => s + (n.x || 0), 0) / clusterNodes.length;
    const cy = clusterNodes.reduce((s, n) => s + (n.y || 0), 0) / clusterNodes.length;
    const cz = clusterNodes.reduce((s, n) => s + (n.z || 0), 0) / clusterNodes.length;
    const dist = 60;
    const r = Math.hypot(cx, cy, cz) || 1;
    const ratio = 1 + dist / r;
    graph.cameraPosition(
      { x: cx * ratio, y: cy * ratio, z: cz * ratio },
      { x: 0, y: 0, z: 0 },  // lookAt query node (origin)
      800
    );
  }
}, [smartSearch.selectedClusterId]);
```

- [ ] **Step 4: Update ChatInput props based on selection state**

```javascript
const clusterCards = smartSearch.selectedCluster?.cards;
const totalCards = smartSearch.searchResult?.totalFound || 0;

const chatInputTopSlot = hasResults ? (
  <div style={{ padding: '8px 14px', fontSize: 13, color: 'var(--ds-text-primary)', ... }}>
    {smartSearch.selectedClusterId
      ? `${smartSearch.selectedClusterLabel} · ${clusterCards?.length || 0} Karten`
      : `${smartSearch.query} · ${smartSearch.searchResult?.clusters?.length || 0} Cluster · ${totalCards} Karten`
    }
  </div>
) : /* heatmap deck topSlot logic */;
```

- [ ] **Step 5: Update keyboard handlers**

```javascript
useEffect(() => {
  const onKey = (e) => {
    if (hasResults) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (smartSearch.selectedClusterId) {
          smartSearch.setSelectedClusterId(null);
        } else {
          smartSearch.reset();
        }
      }
      if (e.key === 'Enter' && hasResults) {
        e.preventDefault();
        startStack();
      }
      // Arrow keys for cluster navigation
      const clusters = smartSearch.searchResult?.clusters;
      if (clusters?.length > 1 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        const currentIdx = smartSearch.selectedClusterId
          ? parseInt(smartSearch.selectedClusterId.replace('cluster_', ''), 10)
          : -1;
        const next = e.key === 'ArrowDown'
          ? Math.min(currentIdx + 1, clusters.length - 1)
          : Math.max(currentIdx - 1, 0);
        smartSearch.setSelectedClusterId(`cluster_${next}`);
      }
      // Number keys 1-6 for direct cluster selection
      if (clusters?.length > 1 && e.key >= '1' && e.key <= '6') {
        const idx = parseInt(e.key, 10) - 1;
        if (idx < clusters.length) {
          smartSearch.setSelectedClusterId(`cluster_${idx}`);
        }
      }
      return;
    }
    // Heatmap keyboard handlers (existing)
    if (e.key === 'Escape' && heatmapDeck) { ... }
    if (e.key === ' ' && heatmapDeck?.hasChildren) { ... }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, [hasResults, smartSearch.selectedClusterId, heatmapDeck]);
```

- [ ] **Step 6: Update startStack to support cluster subset**

```javascript
const startStack = useCallback(() => {
  const cards = smartSearch.selectedCluster?.cards || smartSearch.searchResult?.cards;
  if (!cards?.length) return;
  window.ankiBridge?.addMessage('startTermStack', {
    term: smartSearch.query,
    cardIds: JSON.stringify(cards.map(c => Number(c.id))),
  });
}, [smartSearch.selectedCluster, smartSearch.searchResult, smartSearch.query]);
```

- [ ] **Step 7: Build and test**

```bash
cd frontend && npm run build 2>&1 | tail -3
```

Expected: Build succeeds.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/GraphView.jsx frontend/src/App.jsx frontend/src/hooks/useSmartSearch.js
git commit -m "feat: GraphView v2 — sidebar, cluster selection, camera rotation"
```

---

## Task 6: Frontend — Heatmap polish (restore clean default)

**Files:**
- Modify: `frontend/src/components/KnowledgeHeatmap.jsx`
- Modify: `frontend/src/components/GraphView.jsx` (heatmap section only)

- [ ] **Step 1: Ensure heatmap renders cleanly as default**

Verify the heatmap:
- Logo "Anki.plus" centered above
- Treemap below with proper aspect ratio
- Legend row at bottom
- Auto-drill for single root deck
- ChatInput shows "Was willst du lernen?" when no deck selected
- Deck selection uses topSlot pattern

- [ ] **Step 2: Test heatmap → search transition**

1. Open Stapel tab — heatmap visible
2. Type "Cortisol" → press Enter
3. Heatmap should fade out, graph + sidebar appear
4. Press Escape → graph dismisses, heatmap returns

- [ ] **Step 3: Fix any layout issues**

Ensure the heatmap fills the canvas area properly and the SearchSidebar is NOT visible when in heatmap mode (the `visible={hasResults}` prop handles this).

- [ ] **Step 4: Commit if changes needed**

```bash
git add frontend/src/components/KnowledgeHeatmap.jsx frontend/src/components/GraphView.jsx
git commit -m "fix: heatmap polish — clean default state, smooth transitions"
```

---

## Task 7: Integration test — full flow

- [ ] **Step 1: Test in Anki — full happy path**

1. Open Stapel → see heatmap + logo + search input
2. Type "Cortisol" → Enter
3. Graph appears with clusters, sidebar slides in from right
4. Sidebar shows: query title, AI answer, cluster list (PERSPEKTIVEN)
5. Click a cluster → sidebar shows cluster summary + CardRefChips, graph rotates + highlights
6. ChatInput shows cluster name + card count + "Kreuzen"
7. Click another cluster → transitions smoothly
8. Click same cluster → deselects, back to full view
9. Press Escape → back to heatmap
10. Press 1-4 → direct cluster selection
11. Arrow keys → navigate clusters

- [ ] **Step 2: Test edge cases**

1. Search with very few results (< 6 cards) → no clustering, sidebar shows answer only
2. Search with no results → error state, sidebar hidden
3. LLM timeout → clusters show auto-labels, summary says "wird geladen..." then fallback
4. Escape from cluster selection → deselects cluster (not full dismiss)
5. Escape from full graph → returns to heatmap

- [ ] **Step 3: Fix issues found**

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: Smart Search v2 — cluster exploration with sidebar"
```
