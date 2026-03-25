# Resizable Sidebar — Design Spec

## Overview

Add a drag-to-resize handle on the left edge of the chat sidebar in review mode. The resize must be butter-smooth (no React state during drag — pure CSS custom property mutation).

## Mechanism

A `ResizeHandle` component renders an 8px-wide invisible strip on the left edge of the sidebar. On pointer drag, it computes `newWidth = window.innerWidth - clientX`, clamps it, and sets `--ds-sidebar-width` directly on `document.documentElement.style`. No React state updates during drag — the browser reflows immediately via CSS.

## Constraints

- **Min width:** 400px
- **Max width:** 70% of `window.innerWidth`
- **Default:** 568px (current value from design system)

## Dock Adaptation

`--ds-dock-width` becomes a derived value:

```css
--ds-dock-width: calc(var(--ds-sidebar-width) - 2 * var(--ds-space-xl));
```

The ChatInput dock already references `--ds-dock-width` for its max-width. By making it derived, the input field automatically adapts to any sidebar width.

## Persistence

- Save width to `localStorage` key `ankiplus-sidebar-width` on `pointerup`.
- On app init, read from `localStorage` and set the CSS var.
- Double-click on handle resets to default (568px) and clears localStorage.

## Visual Feedback

- **Hover:** 1px vertical line in `var(--ds-accent)` at 30% opacity appears on the handle's right edge.
- **Dragging:** Line becomes 2px at 60% opacity. Cursor: `col-resize`.
- **Idle:** Invisible (no visible chrome).

## Slide Animation

The existing `marginRight: reviewChatOpen ? 0 : calc(-1 * var(--ds-sidebar-width))` animation continues to work because it references the same CSS variable. No changes needed.

## Files to Modify

1. **`shared/styles/design-system.css`** — Make `--ds-dock-width` derived from `--ds-sidebar-width`
2. **`frontend/src/components/ResizeHandle.jsx`** — New component (drag logic, visual feedback)
3. **`frontend/src/App.jsx`** — Mount `ResizeHandle` on the sidebar container, load persisted width on init

## Component: ResizeHandle

```
Props: { onWidthChange?: (width: number) => void }

State: isDragging (local, only for visual feedback class toggle)

Lifecycle:
  - pointerdown → setPointerCapture, set isDragging
  - pointermove → compute width, clamp, set CSS var
  - pointerup → releasePointerCapture, save to localStorage, clear isDragging
  - dblclick → reset to default
```

Uses `setPointerCapture` for reliable tracking even when cursor leaves the handle.
