# Image Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cluster-grouped image grid to the canvas area, triggered by a new Definition tab in the SearchSidebar, with batch image extraction from Python and multi-select → study flow.

**Architecture:** New `ImageCanvas.jsx` renders deduplicated images grouped by semantic cluster. A new Python handler `_msg_get_card_images` batch-extracts images from card HTML, deduplicates by filename, and returns `file://` URLs. The SearchSidebar gets a 3-tab restructure (Definition/Perspektiven/Begriffe) that controls `graphMode` in GraphView.

**Tech Stack:** React 18, Python/PyQt6, Anki collection API, existing message queue bridge

**Spec:** `docs/superpowers/specs/2026-03-27-image-canvas-design.md`

---

### Task 1: Python — Batch Image Extraction Handler

**Files:**
- Modify: `ui/widget.py:1142-1147` (add handler to routing table)
- Modify: `ui/widget.py` (add `_msg_get_card_images` method after `_on_quick_answer_result`, ~line 3261)
- Test: `tests/test_text.py` (add dedup/filtering tests)

- [ ] **Step 1: Add tests for image extraction with URL filtering**

In `tests/test_text.py`, add a new test class:

```python
import os


class TestExtractImagesFiltering:
    """Tests for extract_images_from_html and the filtering logic used by getCardImages."""

    def test_skips_http_urls(self):
        html = '<img src="http://example.com/pic.png"><img src="local.jpg">'
        results = extract_images_from_html(html)
        # extract_images_from_html returns ALL src values — filtering happens in widget
        assert "http://example.com/pic.png" in results
        assert "local.jpg" in results

    def test_extracts_anki_media_filenames(self):
        html = '<img src="anatomy_forearm.jpg"><img src="schema-2.png">'
        results = extract_images_from_html(html)
        assert results == ["anatomy_forearm.jpg", "schema-2.png"]

    def test_handles_mixed_quotes_and_attrs(self):
        html = '''<img class="big" src="a.jpg" width="200"><img src='b.png'>'''
        results = extract_images_from_html(html)
        assert results == ["a.jpg", "b.png"]


class TestImageDeduplication:
    """Tests for the dedup + URL-filtering logic that _msg_get_card_images uses."""

    def _filter_and_dedup(self, fields_by_card):
        """Simulate the dedup logic from _msg_get_card_images."""
        seen = {}
        for cid, fields in fields_by_card.items():
            for field in fields:
                for raw_src in extract_images_from_html(field):
                    if raw_src.startswith(('http://', 'https://', 'file://', '/')):
                        continue
                    filename = os.path.basename(raw_src)
                    if not filename:
                        continue
                    if filename not in seen:
                        seen[filename] = {"filename": filename, "cardIds": []}
                    if cid not in seen[filename]["cardIds"]:
                        seen[filename]["cardIds"].append(cid)
        return seen

    def test_deduplicates_same_image_across_cards(self):
        fields = {
            1: ['<img src="anatomy.jpg">'],
            2: ['<img src="anatomy.jpg">'],
            3: ['<img src="other.png">'],
        }
        result = self._filter_and_dedup(fields)
        assert len(result) == 2
        assert result["anatomy.jpg"]["cardIds"] == [1, 2]
        assert result["other.png"]["cardIds"] == [3]

    def test_filters_remote_urls(self):
        fields = {
            1: ['<img src="http://example.com/pic.png"><img src="local.jpg">'],
        }
        result = self._filter_and_dedup(fields)
        assert "pic.png" not in result
        assert "local.jpg" in result

    def test_filters_absolute_paths(self):
        fields = {
            1: ['<img src="/usr/share/pic.png"><img src="relative.jpg">'],
        }
        result = self._filter_and_dedup(fields)
        assert "pic.png" not in result
        assert "relative.jpg" in result

    def test_normalizes_basename(self):
        fields = {
            1: ['<img src="subdir/image.jpg">'],
        }
        result = self._filter_and_dedup(fields)
        assert "image.jpg" in result

    def test_multiple_images_per_card(self):
        fields = {
            1: ['<img src="a.jpg"><img src="b.png">'],
        }
        result = self._filter_and_dedup(fields)
        assert len(result) == 2
        assert result["a.jpg"]["cardIds"] == [1]
        assert result["b.png"]["cardIds"] == [1]

    def test_empty_fields(self):
        fields = {1: ['<p>No images here</p>']}
        result = self._filter_and_dedup(fields)
        assert len(result) == 0
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -k "TestExtractImagesFiltering or TestImageDeduplication" -v`

Expected: PASS — all tests should pass immediately (they test pure logic, no mocks needed)

- [ ] **Step 3: Add `getCardImages` to the message handler routing table**

In `ui/widget.py`, find the handler dict (around line 1142) and add:

```python
            'startTermStack': self._msg_start_term_stack,
            'searchCards': self._msg_search_cards,
            'getCardImages': self._msg_get_card_images,  # NEW
            'searchKgSubgraph': self._msg_search_kg_subgraph,
            'subClusterCards': self._msg_sub_cluster,
            'quickAnswer': lambda data: None,  # Reserved — triggered internally by searchCards
```

- [ ] **Step 4: Implement `_msg_get_card_images` handler**

Add the method after `_on_quick_answer_result` (~line 3261), before `_msg_sub_cluster`.

**Important:** The polling timer already runs on the main thread, so `mw.col` is directly accessible. Do NOT use `run_on_main_thread` + `event.wait()` — that would deadlock. Use synchronous access like `_msg_search_kg_subgraph` does.

Note: `os`, `re`, and `json` are already imported at module level in `widget.py`. Only `extract_images_from_html` needs a local import.

```python
    def _msg_get_card_images(self, data):
        """Batch-extract deduplicated images from card HTML fields.

        Runs synchronously on main thread (called from polling timer).
        Request: { cardIds: JSON string of int array }
        Response: graph.cardImages event with deduplicated image list.
        """
        try:
            from ..utils.text import extract_images_from_html
        except ImportError:
            from utils.text import extract_images_from_html

        card_ids_raw = data.get("cardIds", "[]") if isinstance(data, dict) else "[]"
        try:
            card_ids = json.loads(card_ids_raw)
        except (ValueError, TypeError):
            card_ids = []

        if not card_ids:
            self._send_to_js({"type": "graph.cardImages", "data": {"images": []}})
            return

        try:
            from aqt import mw
            if mw is None or mw.col is None:
                self._send_to_js({"type": "graph.cardImages", "data": {"images": []}})
                return

            media_dir = mw.col.media.dir()
            seen = {}  # filename -> entry dict

            for cid in card_ids[:30]:  # Cap at 30
                try:
                    card = mw.col.get_card(int(cid))
                    note = card.note()
                    deck = mw.col.decks.get(card.did)
                    deck_name = deck["name"].split("::")[-1] if deck else "Unknown"
                    question = re.sub(r'<[^>]+>', '', note.fields[0])[:80] if note.fields else ""

                    for field in note.fields:
                        for raw_src in extract_images_from_html(field):
                            # Skip remote URLs and absolute paths — only local media
                            if raw_src.startswith(('http://', 'https://', 'file://', '/')):
                                continue
                            filename = os.path.basename(raw_src)
                            if not filename:
                                continue
                            # Check file actually exists in media dir
                            filepath = os.path.join(media_dir, filename)
                            if not os.path.isfile(filepath):
                                continue

                            if filename not in seen:
                                seen[filename] = {
                                    "filename": filename,
                                    "src": "file://" + filepath,
                                    "cardIds": [],
                                    "questions": {},
                                    "decks": {},
                                }
                            entry = seen[filename]
                            cid_int = int(cid)
                            if cid_int not in entry["cardIds"]:
                                entry["cardIds"].append(cid_int)
                                entry["questions"][str(cid_int)] = question
                                entry["decks"][str(cid_int)] = deck_name
                except Exception:
                    pass

            self._send_to_js({
                "type": "graph.cardImages",
                "data": {"images": list(seen.values())}
            })
        except Exception as e:
            logger.exception("_msg_get_card_images failed: %s", e)
            self._send_to_js({"type": "graph.cardImages", "data": {"images": []}})
```

- [ ] **Step 5: Commit**

```bash
git add ui/widget.py tests/test_text.py
git commit -m "feat: add getCardImages batch image extraction handler"
```

---

### Task 2: Frontend — ImageCanvas Component (Core Rendering)

**Files:**
- Create: `frontend/src/components/ImageCanvas.jsx`

- [ ] **Step 1: Create `ImageCanvas.jsx` with cluster-grouped image grid**

```jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';

// --- Static styles (no inline object creation per render) ---

const CANVAS_STYLE = {
  flex: 1,
  overflowY: 'auto',
  padding: 20,
  background: 'var(--ds-bg-deep)',
  scrollbarWidth: 'none',
  display: 'flex',
  flexDirection: 'column',
};

const CLUSTER_HEADER_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  marginBottom: 10,
};

const CLUSTER_LABEL_STYLE = {
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const CLUSTER_COUNT_STYLE = {
  fontSize: 10,
  color: 'var(--ds-text-muted)',
};

const TILE_GRID_STYLE = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
};

const TILE_STYLE = {
  position: 'relative',
  cursor: 'pointer',
  borderRadius: 10,
  overflow: 'hidden',
  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
};

const TILE_IMG_STYLE = {
  display: 'block',
  height: 100,
  width: 'auto',
  minWidth: 80,
  maxWidth: 200,
  objectFit: 'cover',
  borderRadius: 10,
};

const BADGE_STYLE = {
  position: 'absolute',
  background: 'var(--ds-bg-overlay)',
  backdropFilter: 'blur(4px)',
  borderRadius: 4,
  padding: '1px 5px',
  fontSize: 8,
  color: 'var(--ds-text-tertiary)',
};

const DECK_BADGE_STYLE = { ...BADGE_STYLE, top: 5, left: 5 };
const MULTI_BADGE_STYLE = { ...BADGE_STYLE, bottom: 5, right: 5 };

const CHECK_STYLE = {
  position: 'absolute',
  top: -4,
  right: -4,
  width: 18,
  height: 18,
  background: 'var(--ds-accent)',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 10,
  color: 'var(--ds-bg-deep)',
};

const EMPTY_STYLE = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--ds-text-muted)',
  fontSize: 13,
};

const HINT_STYLE = {
  textAlign: 'center',
  padding: 12,
  fontSize: 10,
  color: 'var(--ds-text-muted)',
  opacity: 0.5,
};

const SKELETON_STYLE = {
  height: 100,
  borderRadius: 10,
  background: 'var(--ds-hover-tint)',
  animation: 'pulse 1.5s ease-in-out infinite',
};

// Cluster colors — same as SearchSidebar
const CLUSTER_COLORS = [
  '#3B6EA5', '#4A8C5C', '#B07D3A', '#7B5EA7',
  '#A0524B', '#4A9BAE', '#A69550', '#7A6B5D',
];

// --- Cluster assignment ---

function assignCluster(image, searchResult) {
  const clusters = searchResult?.clusters || [];
  for (let ci = 0; ci < clusters.length; ci++) {
    const clusterCardIds = new Set(clusters[ci].cards.map(c => Number(c.id)));
    if (image.cardIds.some(id => clusterCardIds.has(Number(id)))) {
      return `cluster_${ci}`;
    }
  }
  return null;
}

// --- ImageTile (memoized for .map() usage) ---

const ImageTile = React.memo(function ImageTile({ image, isSelected, onToggle }) {
  const firstCardId = image.cardIds[0];
  const question = image.questions?.[String(firstCardId)] || '';
  const deck = image.decks?.[String(firstCardId)] || '';
  const multiCount = image.cardIds.length;

  return (
    <div
      style={{
        ...TILE_STYLE,
        border: isSelected
          ? '2px solid var(--ds-accent)'
          : '1px solid var(--ds-border-subtle)',
        boxShadow: isSelected ? '0 0 0 1px var(--ds-accent-10)' : 'none',
      }}
      onClick={() => onToggle(image.filename)}
      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
      title={question}
    >
      <img
        src={image.src}
        alt={question}
        style={TILE_IMG_STYLE}
        loading="lazy"
      />
      {deck && <div style={DECK_BADGE_STYLE}>{deck}</div>}
      {multiCount > 1 && (
        <div style={MULTI_BADGE_STYLE}>{multiCount} Karten</div>
      )}
      {isSelected && <div style={CHECK_STYLE}>✓</div>}
    </div>
  );
});

// --- Main component ---

export default function ImageCanvas({
  searchResult,
  clusterLabels,
  onSelectionChange,
}) {
  const [images, setImages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImages, setSelectedImages] = useState(new Set());

  // Request images when search results change
  useEffect(() => {
    if (!searchResult?.cards?.length) {
      setImages([]);
      setSelectedImages(new Set());
      return;
    }

    const cardIds = searchResult.cards
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 30)
      .map(c => Number(c.id));

    setIsLoading(true);
    setSelectedImages(new Set());
    window.ankiBridge?.addMessage('getCardImages', {
      cardIds: JSON.stringify(cardIds),
    });
  }, [searchResult]);

  // Listen for response
  useEffect(() => {
    const handler = (e) => {
      const data = e.detail;
      if (data?.images) {
        setImages(data.images);
        setIsLoading(false);
      }
    };
    window.addEventListener('graph.cardImages', handler);
    return () => window.removeEventListener('graph.cardImages', handler);
  }, []);

  // Group images by cluster
  const clusteredImages = useMemo(() => {
    if (!images.length || !searchResult) return [];

    const groups = {};
    images.forEach(img => {
      const clusterId = assignCluster(img, searchResult);
      const key = clusterId || '__unclustered__';
      if (!groups[key]) groups[key] = { clusterId: key, images: [] };
      groups[key].images.push(img);
    });

    // Sort clusters by index (cluster_0 first)
    return Object.values(groups).sort((a, b) => {
      if (a.clusterId === '__unclustered__') return 1;
      if (b.clusterId === '__unclustered__') return -1;
      const ai = parseInt(a.clusterId.replace('cluster_', ''), 10);
      const bi = parseInt(b.clusterId.replace('cluster_', ''), 10);
      return ai - bi;
    });
  }, [images, searchResult]);

  // Toggle image selection
  const toggleImage = useCallback((filename) => {
    setSelectedImages(prev => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });
  }, []);

  // Notify parent of selection changes
  const selectedCardIds = useMemo(() => {
    const ids = new Set();
    selectedImages.forEach(filename => {
      const img = images.find(i => i.filename === filename);
      img?.cardIds?.forEach(id => ids.add(Number(id)));
    });
    return [...ids];
  }, [selectedImages, images]);

  useEffect(() => {
    onSelectionChange?.(selectedCardIds);
  }, [selectedCardIds, onSelectionChange]);

  // Escape to deselect
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && selectedImages.size > 0) {
        e.preventDefault();
        setSelectedImages(new Set());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedImages]);

  // --- Render ---

  // Loading skeleton
  if (isLoading) {
    return (
      <div style={CANVAS_STYLE}>
        {[0, 1].map(g => (
          <div key={g} style={{ marginBottom: 24 }}>
            <div style={{ ...CLUSTER_HEADER_STYLE, marginBottom: 10 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ds-hover-tint)' }} />
              <div style={{ height: 10, width: 80, borderRadius: 3, background: 'var(--ds-hover-tint)', animation: 'pulse 1.5s ease-in-out infinite' }} />
            </div>
            <div style={TILE_GRID_STYLE}>
              {[120, 100, 140, 90].map((w, i) => (
                <div key={i} style={{ ...SKELETON_STYLE, width: w, animationDelay: `${i * 0.1}s` }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Empty state
  if (!images.length) {
    return (
      <div style={CANVAS_STYLE}>
        <div style={EMPTY_STYLE}>Keine Bilder in den Ergebnissen</div>
      </div>
    );
  }

  // Cluster-grouped grid
  return (
    <div style={CANVAS_STYLE}>
      {clusteredImages.map(group => {
        const ci = group.clusterId !== '__unclustered__'
          ? parseInt(group.clusterId.replace('cluster_', ''), 10)
          : -1;
        const color = ci >= 0 ? CLUSTER_COLORS[ci % CLUSTER_COLORS.length] : 'var(--ds-text-muted)';
        const label = ci >= 0
          ? (clusterLabels?.[group.clusterId] || searchResult?.clusters?.[ci]?.label || `Cluster ${ci + 1}`)
          : 'Sonstige';

        return (
          <div key={group.clusterId} style={{ marginBottom: 24 }}>
            {/* Cluster header */}
            <div style={CLUSTER_HEADER_STYLE}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ ...CLUSTER_LABEL_STYLE, color }}>{label}</span>
              <span style={CLUSTER_COUNT_STYLE}>{group.images.length} Bilder</span>
            </div>

            {/* Image tiles */}
            <div style={TILE_GRID_STYLE}>
              {group.images.map(img => (
                <ImageTile
                  key={img.filename}
                  image={img}
                  isSelected={selectedImages.has(img.filename)}
                  onToggle={toggleImage}
                />
              ))}
            </div>
          </div>
        );
      })}

      <div style={HINT_STYLE}>
        Klick → auswählen · Hover → Kartenfrage
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify file created and no syntax errors**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npx -y acorn --ecma2020 --module src/components/ImageCanvas.jsx > /dev/null 2>&1 && echo "SYNTAX OK" || echo "SYNTAX ERROR"`

Note: If acorn is not available, just ensure the file is well-formed JSX by visual inspection.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ImageCanvas.jsx
git commit -m "feat: add ImageCanvas component with cluster-grouped image grid"
```

---

### Task 3: SearchSidebar — 3-Tab Restructure

**Files:**
- Modify: `frontend/src/components/SearchSidebar.jsx`

This task restructures the sidebar from 2 tabs (Perspektiven/Begriffe) to 3 tabs (Definition/Perspektiven/Begriffe). The Tutor answer (AgenticCell) moves from above the tabs into the Definition tab content.

- [ ] **Step 1: Change default tab and add graphMode mapping**

In `SearchSidebar.jsx`, find line 58:

```javascript
const [sidebarTab, setSidebarTab] = useState('clusters'); // 'clusters' | 'terms'
const handleTabChange = (tab) => {
  setSidebarTab(tab);
  onGraphModeChange?.(tab === 'terms' ? 'knowledge' : 'clusters');
};
```

Replace with:

```javascript
const [sidebarTab, setSidebarTab] = useState('definition'); // 'definition' | 'clusters' | 'terms'
const TAB_TO_GRAPH_MODE = { definition: 'images', clusters: 'clusters', terms: 'knowledge' };
const handleTabChange = (tab) => {
  setSidebarTab(tab);
  onGraphModeChange?.(TAB_TO_GRAPH_MODE[tab] || 'clusters');
};
```

- [ ] **Step 2: Add `imageSelectedCardIds` prop to function signature**

Find the component function signature (line 10) and add the new prop:

```javascript
export default function SearchSidebar({
  query,
  answerText,
  clusters,
  clusterLabels,
  clusterSummaries,
  selectedClusterId,
  onSelectCluster,
  visible,
  isExiting = false,
  onStartStack,
  onSearch,
  isSearching,
  totalCards,
  cardRefs,
  bridge,
  subClusters,
  isSubClustering,
  sidebarHasAnimated,
  kgSubgraph,
  onGraphModeChange,
  selectedTerm,
  onSelectTerm,
  termDefinition,
  imageSelectedCardIds = [],  // NEW — from ImageCanvas selection
}) {
```

- [ ] **Step 3: Update tab bar from 2 tabs to 3 tabs and fix guard condition**

Find the tab bar guard condition (around line 327):

```javascript
{(clusters?.length > 1 || kgSubgraph?.nodes?.length > 0) && (
```

Replace with (Definition tab should always show after any search):

```javascript
{(answerText || clusters?.length > 1 || kgSubgraph?.nodes?.length > 0) && (
```

Then find the tab array inside (the `{[...].map(tab =>` block) and replace:

```javascript
{[
  { key: 'definition', label: 'Definition' },
  { key: 'clusters', label: 'Perspektiven' },
  { key: 'terms', label: 'Begriffe' },
].map(tab => (
```

- [ ] **Step 4: Move Tutor AgenticCell into Definition tab content**

The AgenticCell and pipeline steps (lines ~239-279) currently render above the tabs unconditionally. Wrap them in a `sidebarTab === 'definition'` condition:

Find the section starting with `{/* Orchestration step */}` and the `<AgenticCell>` block. Wrap both in:

```jsx
{sidebarTab === 'definition' && (
  <>
    {/* Orchestration step — ABOVE agent */}
    {pipelineSteps.some(s => s.step === 'orchestrating') && (
      <ReasoningDisplay ... />
    )}

    {/* Tutor AgenticCell */}
    <AgenticCell ...>
      ...existing content...
    </AgenticCell>
  </>
)}
```

- [ ] **Step 5: Update dock to use imageSelectedCardIds when on Definition tab**

Find the `stackCardCount` computation (around line 89) and update to account for image selection:

```javascript
const imageCardCount = imageSelectedCardIds?.length || 0;
const stackCardCount = sidebarTab === 'definition' && imageCardCount > 0
  ? imageCardCount
  : selectedTerm ? termCardCount : (multiCards?.length || selectedCluster?.cards?.length || totalCards || 0);

const stackLabel = sidebarTab === 'definition' && imageCardCount > 0
  ? query  // Use search query as title — count is shown separately by dock
  : selectedTerm ? selectedTerm.label : (multiCards
    ? `${multiIds.size} Perspektiven`
    : selectedLabel || query);
```

Also update the `onStartStack` in the dock's `actionPrimary` to pass `imageSelectedCardIds` when on the Definition tab:

```javascript
actionPrimary={{
  label: `${stackCardCount} Karten kreuzen`,
  shortcut: 'Enter',
  onClick: () => {
    if (sidebarTab === 'definition' && imageCardCount > 0) {
      // Start stack with image-selected cards
      window.ankiBridge?.addMessage('startTermStack', {
        term: query,
        cardIds: JSON.stringify(imageSelectedCardIds),
      });
    } else {
      onStartStack?.();
    }
  },
}}
```

- [ ] **Step 6: Emit initial graphMode on mount**

Add a `useEffect` to emit the initial graphMode so GraphView knows to render ImageCanvas on first load:

```javascript
// Emit graphMode when sidebar becomes visible or tab changes
useEffect(() => {
  if (visible) {
    onGraphModeChange?.(TAB_TO_GRAPH_MODE[sidebarTab] || 'clusters');
  }
}, [visible, sidebarTab, onGraphModeChange]);
```

Place this right after the `handleTabChange` definition.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/SearchSidebar.jsx
git commit -m "feat: restructure SearchSidebar to 3 tabs (Definition/Perspektiven/Begriffe)"
```

---

### Task 4: GraphView — Conditional ImageCanvas Rendering

**Files:**
- Modify: `frontend/src/components/GraphView.jsx`

- [ ] **Step 1: Import ImageCanvas**

At the top of `GraphView.jsx` (after the existing imports around line 11), add:

```javascript
import ImageCanvas from './ImageCanvas';
```

- [ ] **Step 2: Conditionally render ImageCanvas when graphMode is 'images'**

Find the canvas area render section (line 604-606):

```jsx
{/* 3D canvas — only when search results */}
{hasResults && <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />}
```

Replace with:

```jsx
{/* Canvas content — switches based on graphMode */}
{hasResults && graphMode === 'images' && (
  <ImageCanvas
    searchResult={searchResult}
    clusterLabels={clusterLabels}
    onSelectionChange={setImageSelectedCardIds}
  />
)}
{hasResults && graphMode !== 'images' && (
  <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
)}
```

- [ ] **Step 3: Add shared state in `useSmartSearch` for cross-component access**

`GraphView` and `SearchSidebar` are siblings rendered by `App.jsx`. Both need access to `imageSelectedCardIds`. The established pattern for sharing state between these siblings is via `useSmartSearch` (same as `graphMode`, `selectedClusterId`, etc.).

In `frontend/src/hooks/useSmartSearch.js`, add state:

```javascript
const [imageSelectedCardIds, setImageSelectedCardIds] = useState([]);
```

Add to the return object (around line 179):

```javascript
imageSelectedCardIds, setImageSelectedCardIds,
```

Then in `GraphView.jsx`, destructure the new fields from `smartSearch`:

```javascript
const {
  query, searchResult, isSearching, hasResults,
  answerText, clusterLabels, clusterSummaries, cardRefs,
  selectedClusterId, setSelectedClusterId,
  selectedCluster, selectedClusterLabel, selectedClusterSummary,
  subClusters, kgSubgraph, graphMode,
  search, reset, selectTerm,
  imageSelectedCardIds, setImageSelectedCardIds,  // NEW
} = smartSearch;
```

And pass to `ImageCanvas`:

```jsx
<ImageCanvas
  searchResult={searchResult}
  clusterLabels={clusterLabels}
  onSelectionChange={setImageSelectedCardIds}
/>
```

- [ ] **Step 4: Destroy 3D graph when switching to images mode**

The existing 3D ForceGraph useEffects check `graphMode !== 'clusters'` and `graphMode !== 'knowledge'` as guards. When `graphMode` is `'images'`, both effects return early, which is correct. However, the existing graph instance may still be rendered. Add cleanup:

After the existing `containerRef` usage (around line 606), ensure the 3D graph is destroyed when switching to images:

```javascript
// Cleanup 3D graph when switching to image mode
useEffect(() => {
  if (graphMode === 'images' && graphRef.current?._destructor) {
    graphRef.current._destructor();
    graphRef.current = null;
  }
}, [graphMode]);
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/GraphView.jsx frontend/src/hooks/useSmartSearch.js
git commit -m "feat: render ImageCanvas in GraphView when graphMode is 'images'"
```

---

### Task 5: App.jsx — Wire imageSelectedCardIds to SearchSidebar

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Find where SearchSidebar is rendered and add the new prop**

Search for `<SearchSidebar` in `App.jsx`. It receives props from `smartSearch`. Add:

```jsx
imageSelectedCardIds={smartSearch.imageSelectedCardIds}
```

- [ ] **Step 2: Verify the initial graphMode emission works**

When SearchSidebar mounts with `sidebarTab='definition'`, it should emit `graphMode='images'` via `onGraphModeChange`. This is handled by the `useEffect` added in Task 3 Step 6. Verify the prop `onGraphModeChange` is already wired in App.jsx (it should be `smartSearch.setGraphMode`).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: pass imageSelectedCardIds from smartSearch to SearchSidebar"
```

---

### Task 6: Build & Smoke Test

**Files:** None (verification only)

- [ ] **Step 1: Run Python tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -v`

Expected: All tests pass (481+)

- [ ] **Step 2: Run frontend tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm test -- --run`

Expected: All tests pass (107+)

- [ ] **Step 3: Build frontend**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build`

Expected: Build succeeds, output in `web/` directory

- [ ] **Step 4: Verify no console errors in build output**

Check that Vite/Rollup doesn't report any warnings about missing imports or unused variables.

- [ ] **Step 5: Commit build output if building for Anki testing**

```bash
git add web/
git commit -m "build: frontend build with Image Canvas"
```
