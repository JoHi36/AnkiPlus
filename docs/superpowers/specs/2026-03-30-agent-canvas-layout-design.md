# Agent Canvas Layout — Design Spec

**Date:** 2026-03-30
**Status:** Approved
**Mockup:** `.superpowers/brainstorm/74388-1774871874/content/canvas-layout-v6.html`

## Summary

When the user clicks the DeckSearchBar on the Stapelansicht, the Lid-Lift animation transitions into the Agent Canvas mode. This spec defines the canvas layout after the animation completes.

## Layout

### Deep Background (z: 0)
- `#141416` fills the entire screen
- 3D graph nodes (ForceGraph3D / Three.js) render directly on this surface
- **No container clips the graph** — nodes can bleed past screen edges, behind all overlay elements

### TopBar (z: 20) — unchanged structure
- Original TopBar component stays as-is
- **Left slot adapts**: "Heute: X Karten" replaced by `ESC` + "Verlassen" badge
- **Right slot adapts**: Neu/Fällig/Wieder dots hidden (invisible)
- **+/X menu button**: stays visible
- Tab bar (Stapel/Session/Statistik) stays centered, unchanged

### Deck Popup Widget (z: 21) — new component
- Small tooltip-style widget below TopBar
- **Centered exactly under the "Session" tab** with upward-pointing arrow
- Canvas-colored background (#1C1C1E), grey line border (`rgba(255,255,255,0.06)`), rounded corners (10px)
- Content: `✦ DeckName [count] | Lernen →`
- Clicking "Lernen →" starts a learning session for that deck
- **Not glass** — Ein-Glas-Regel: only the Input Bar is frosted glass

### Info Panel (z: 15) — replaces SearchSidebar
- `position: absolute; top: 10px; right: 10px; bottom: 10px`
- Solid canvas background (#1C1C1E), grey line border, rounded corners (14px)
- **No dots visible through it** — solid background blocks the dot grid
- **No frosted glass** — simple solid fill
- **Resizable** via drag handle on left edge (min 280px, max 600px, persisted)
- Content: existing SearchSidebar tabs (Definition, Perspektiven, Begriffe)
- **No action dock at bottom** — the Input Bar replaces it (`hideActionDock={true}`)

### Input Bar (z: 25) — the dropped DeckSearchBar
- `position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%)`
- Frosted glass material (the ONE glass element)
- Width ~460px, centered across full viewport width
- Snake border activates after landing
- Submits to `smartSearch.search()` — populates Info Panel + Graph

## Animation Sequence (Lid-Lift)

1. User clicks DeckSearchBar → FLIP measurement
2. SearchBar switches to `position: fixed`, CSS animation drops it to bottom
3. Deck content (wordmark + deck list) hides (`display: none` via conditional rendering)
4. CockpitBar → replaced by Deck Popup Widget under Session tab
5. SparkBurst fires at separation point
6. Info Panel slides in from right (SearchSidebar mount)
7. TopBar left/right slots adapt (ESC badge, dots hidden)
8. 3D graph renders on deep background (GraphView overlay)

## Reverse (ESC)

- If no search results: reverse animation (bar flies back up), deck content reappears
- If search results exist: instant reset to deck browser, search state cleared

## Component Changes

| Component | Change |
|-----------|--------|
| `DeckSearchBar` | forwardRef, FLIP animation, lidState prop |
| `DeckBrowserView` | conditional rendering based on lidState |
| `SearchSidebar` | `hideActionDock` prop |
| `TopBar` | left/right slot adaptation for canvas mode |
| `App.jsx` | useLidLift hook, GraphView overlay, deck popup |
| **New: `DeckPopup`** | tooltip widget under Session tab |
| `CockpitBar` | removed (replaced by DeckPopup) |

## Material Hierarchy

```
Deep #141416     — 3D graph lives here (lowest)
Canvas #1C1C1E   — Info Panel, Deck Popup (solid, no dots)
Frosted Glass    — Input Bar only (highest, one glass element)
```
