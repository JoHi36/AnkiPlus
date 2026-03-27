# Image Canvas — Design Spec

**Date:** 2026-03-27
**Status:** Approved
**Scope:** New `ImageCanvas.jsx` component + batch bridge method + 3-tab sidebar integration

## Overview

The Image Canvas extracts and displays deduplicated images from search result cards as a visual, cluster-grouped grid. It replaces the 3D force graph on the canvas area (left side) when the **Definition** tab is active in the SearchSidebar.

**Google Search analogy:** Right side = text summary (Tutor answer). Left side = media (Image Canvas). The user sees relevant images at a glance and can select them to study the associated cards.

## 3-Tab Sidebar Structure

The SearchSidebar is restructured into 3 tabs:

| Tab | Sidebar (right) | Canvas (left) |
|-----|-----------------|---------------|
| **Definition** | Tutor answer (AgenticCell) | Image Canvas |
| **Perspektiven** | Cluster list + drill-down | 3D Cluster Graph |
| **Begriffe** | KG term list + definitions | 3D Knowledge Graph |

The tab bar replaces the current 2-tab (Perspektiven/Begriffe) layout. The Tutor answer moves from above the tabs into the Definition tab content.

**Default tab:** Definition (first tab). **Tab-to-graphMode mapping:**

| Tab | `sidebarTab` value | `graphMode` value |
|-----|-------------------|-------------------|
| Definition | `'definition'` | `'images'` |
| Perspektiven | `'clusters'` | `'clusters'` |
| Begriffe | `'terms'` | `'knowledge'` |

`GraphView` uses `graphMode` to decide what to render:
- `'images'` → `<ImageCanvas />` (new)
- `'clusters'` → 3D ForceGraph cluster view (existing)
- `'knowledge'` → 3D ForceGraph KG view (existing)

## Image Canvas Component

### Data Model

The primary unit is a **unique image**, not a card:

```
UniqueImage {
  src: string           // Absolute file:// path to image
  filename: string      // Original filename (dedup key)
  cardIds: number[]     // All cards containing this image
  question: string      // First card's question (for tooltip)
  deck: string          // First card's deck name (short)
  clusterId: string     // Cluster this image belongs to (from first card)
  clusterLabel: string  // Human-readable cluster label
}
```

Images are deduplicated by filename. If the same `anatomy_forearm.jpg` appears in 3 cards, it becomes 1 tile with `cardIds: [101, 202, 303]`.

### Layout

- **Cluster-grouped flow**: Images are grouped by semantic cluster (same clusters as Perspektiven tab).
- **Cluster header**: Colored dot + uppercase label + image count (same style as existing cluster headers in SearchSidebar).
- **Image tiles**: `flex-wrap` within each cluster. Tiles have consistent height (~100px), variable width based on image aspect ratio.
- **Scrollable**: The canvas scrolls vertically when images exceed viewport.

### Image Tile

Each tile displays:

- **The image**: Rendered at thumbnail size with `object-fit: cover`, rounded corners (`border-radius: 10px`).
- **Deck badge** (top-left): Frosted glass badge showing short deck name. Uses `var(--ds-bg-overlay)` + `backdrop-filter: blur(4px)`.
- **Multi-card badge** (bottom-right, conditional): Shows "N Karten" when `cardIds.length > 1`. Same style as deck badge (`var(--ds-bg-overlay)`).
- **Selection state**: Blue border (`2px solid var(--ds-accent)`), blue checkmark circle (top-right), accent box-shadow.

### Interactions

| Action | Behavior |
|--------|----------|
| **Hover** | `transform: scale(1.03)`, tooltip shows card question |
| **Click** | Toggles selection (blue border + checkmark). Multiple images selectable. |
| **Selection** | Dock updates: shows selected image count + total card count + "N Karten kreuzen" button |
| **Kreuzen** | Starts a term stack session with all cards from selected images |
| **Escape** | Deselects all images |

### Empty States

- **No images found**: "Keine Bilder in den Ergebnissen" centered text. Falls back gracefully — the Definition tab still shows the Tutor answer in the sidebar.
- **Loading**: Skeleton tiles with pulse animation (same pattern as cluster skeletons in SearchSidebar).

## Backend: Batch Image Extraction

### New Bridge Method: `getCardImages`

A new message handler in `widget.py` that batch-extracts images from cards.

**Request:**
```javascript
window.ankiBridge.addMessage('getCardImages', {
  cardIds: JSON.stringify([101, 202, 303, ...])  // Up to 30 card IDs
});
```

**Response (via `window.ankiReceive`):**

Uses `graph.cardImages` prefix so it flows through the existing `graph.*` event forwarding in `App.jsx` (no App.jsx changes needed).

```javascript
{
  type: "graph.cardImages",
  data: {
    images: [
      {
        filename: "anatomy_forearm.jpg",
        src: "file:///path/to/collection.media/anatomy_forearm.jpg",
        cardIds: [101, 202],
        questions: { 101: "Welcher Muskel...", 202: "Nenne die..." },
        decks: { 101: "Anatomie", 202: "Anatomie" }
      },
      ...
    ]
  }
}
```

**Python implementation:**

1. For each card ID, get the note fields (raw HTML).
2. Extract image filenames using `extract_images_from_html()` from `utils/text.py`.
3. Resolve paths to absolute `file://` URLs using `mw.col.media.dir()`.
4. Deduplicate by filename — merge card IDs.
5. Collect card question (clean text, first 80 chars) and deck name per card.
6. Run on main thread (Anki collection access), emit result via `result_signal`.

### Deduplication Logic

```python
seen = {}  # filename → { src, cardIds, questions, decks }
for cid in card_ids:
    card = mw.col.get_card(cid)
    note = card.note()
    deck_name = mw.col.decks.get(card.did)["name"].split("::")[-1]
    question = re.sub(r'<[^>]+>', '', note.fields[0])[:80]

    for field in note.fields:
        for raw_src in extract_images_from_html(field):
            # Skip remote URLs and absolute paths — only local media files
            if raw_src.startswith(('http://', 'https://', 'file://', '/')):
                continue
            filename = os.path.basename(raw_src)  # normalize
            if filename not in seen:
                seen[filename] = {
                    "filename": filename,
                    "src": f"file://{media_dir}/{filename}",
                    "cardIds": [],
                    "questions": {},
                    "decks": {},
                }
            entry = seen[filename]
            if cid not in entry["cardIds"]:
                entry["cardIds"].append(cid)
                entry["questions"][cid] = question
                entry["decks"][cid] = deck_name
```

## Frontend Component

### `ImageCanvas.jsx`

**Props:**
```jsx
ImageCanvas({
  searchResult,       // { cards, clusters, query, ... } from useSmartSearch
  clusterLabels,      // { cluster_0: "Flexoren", ... }
  onSelectionChange,  // (cardIds: number[]) => void — notifies parent of selected cards
  bridge,             // Bridge object (unused directly, but available for future)
})
```

**Internal state:**
- `images`: `UniqueImage[]` — loaded via bridge call
- `isLoading`: boolean
- `selectedImages`: `Set<string>` — selected filenames
- `error`: string | null

**Flow:**
1. When `searchResult.cards` changes, extract top 30 card IDs (sorted by score).
2. Call `getCardImages` via bridge (`window.ankiBridge.addMessage`).
3. Listen for `graph.cardImages` CustomEvent on `window` (self-contained — no state in `useSmartSearch`).
4. On response, group images by cluster (using card → cluster mapping from `searchResult.clusters`).
5. Render cluster-grouped grid.

### Cluster Assignment

Each image belongs to the cluster of its first (highest-score) card.

**Type safety:** The backend MUST emit `cardIds` as integers (not strings). The frontend cluster assignment defensively casts both sides with `Number()` to prevent silent mismatches that would produce an empty canvas.

```javascript
function assignCluster(image, searchResult) {
  const clusters = searchResult.clusters || [];
  for (let ci = 0; ci < clusters.length; ci++) {
    const clusterCardIds = new Set(clusters[ci].cards.map(c => Number(c.id)));
    if (image.cardIds.some(id => clusterCardIds.has(Number(id)))) {
      return `cluster_${ci}`;
    }
  }
  return null; // unclustered
}
```

### Selection & Dock Integration

Selected images feed into the existing ChatInput dock pattern:

```javascript
const selectedCardIds = useMemo(() => {
  const ids = new Set();
  selectedImages.forEach(filename => {
    const img = images.find(i => i.filename === filename);
    img?.cardIds.forEach(id => ids.add(id));
  });
  return [...ids];
}, [selectedImages, images]);
```

**State lift path:** `ImageCanvas` exposes `selectedCardIds` via an `onSelectionChange(cardIds)` callback prop. `GraphView` holds `imageSelectedCardIds` state, passes it down to `SearchSidebar` as an override prop. When `imageSelectedCardIds.length > 0`, the SearchSidebar dock shows "N Karten kreuzen" for those cards instead of the default cluster-based count. When the Definition tab is not active or no images are selected, `imageSelectedCardIds` is empty and the dock falls back to default behavior.

## Design System Compliance

- All colors via `var(--ds-*)` tokens
- Cluster header style matches existing SearchSidebar cluster headers
- Frosted glass badges use `.ds-frosted` pattern (inline for small elements)
- Selection accent: `var(--ds-accent)` for border, `var(--ds-accent-10)` for glow
- Tile border: `1px solid var(--ds-border-subtle)`
- Background: `var(--ds-bg-deep)` for canvas area
- Hover scale transition: `transform 0.15s ease`
- All static styles extracted to module-level constants

## File Changes

| File | Change |
|------|--------|
| `frontend/src/components/ImageCanvas.jsx` | **New** — Image Canvas component |
| `ui/widget.py` | Add `_msg_get_card_images` handler + response logic |
| `frontend/src/components/GraphView.jsx` | Conditionally render ImageCanvas when Definition tab active |
| `frontend/src/components/SearchSidebar.jsx` | 3-tab restructure (Definition/Perspektiven/Begriffe), accept `imageSelectedCardIds` override prop |

## Out of Scope

- Image zoom/lightbox (future enhancement)
- Image search across all cards (only search result cards)
- Image similarity/visual clustering (uses text-based semantic clusters)
- Drag-and-drop reordering
- Image annotation or tagging
