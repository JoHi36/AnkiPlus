# Agent Canvas Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Agent Canvas layout so the 3D graph floats on Deep background without clipping, the info panel is a solid Canvas-colored overlay (not glass), and a DeckPopup tooltip replaces CockpitBar — with TopBar adapting its left/right slots.

**Architecture:** The existing lid-lift trigger flow stays. We replace CockpitBar with a DeckPopup tooltip centered under the "Session" tab, adapt TopBar slots for canvas mode (ESC badge left, dots hidden right, +/X stays), and restyle the SearchSidebar mount as a solid canvas panel with resize handle. The GraphView overlay renders without a container so 3D bleeds to screen edges.

**Tech Stack:** React 18, CSS (design-system tokens), existing useLidLift hook, existing ResizeHandle component, existing SearchSidebar.

**Spec:** `docs/superpowers/specs/2026-03-30-agent-canvas-layout-design.md`
**Mockup:** `.superpowers/brainstorm/74388-1774871874/content/canvas-layout-v6.html`

---

### Task 1: Create DeckPopup component

**Files:**
- Create: `frontend/src/components/DeckPopup.tsx`

- [ ] **Step 1: Create DeckPopup component**

```tsx
// frontend/src/components/DeckPopup.tsx
import React, { useEffect, useRef } from 'react';

interface DeckPopupProps {
  deckName: string | null;
  cardCount?: number;
  onStartLearning?: () => void;
  /** ID of the DOM element to center the arrow under */
  anchorId?: string;
}

const POPUP_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: 50,
  zIndex: 21,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  pointerEvents: 'auto',
};

const BODY_STYLE: React.CSSProperties = {
  background: 'var(--ds-bg-canvas)',
  border: '1px solid var(--ds-border-subtle)',
  borderRadius: 10,
  padding: '7px 14px',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  whiteSpace: 'nowrap',
  boxShadow: 'var(--ds-shadow-lg)',
};

const ICON_STYLE: React.CSSProperties = {
  color: 'var(--ds-text-muted)',
  fontSize: 11,
};

const DECK_STYLE: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--ds-text-secondary)',
  fontWeight: 500,
};

const COUNT_STYLE: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--ds-text-muted)',
  background: 'var(--ds-hover-tint)',
  padding: '2px 7px',
  borderRadius: 5,
};

const DIVIDER_STYLE: React.CSSProperties = {
  width: 1,
  height: 12,
  background: 'var(--ds-border-subtle)',
};

const LEARN_STYLE: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--ds-accent)',
  fontWeight: 500,
  cursor: 'pointer',
  background: 'none',
  border: 'none',
  padding: 0,
  fontFamily: 'inherit',
};

export default function DeckPopup({ deckName, cardCount, onStartLearning, anchorId = 'topbar-session-tab' }: DeckPopupProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const position = () => {
      const anchor = document.getElementById(anchorId);
      if (!anchor || !ref.current) return;
      const rect = anchor.getBoundingClientRect();
      ref.current.style.left = `${rect.left + rect.width / 2}px`;
      ref.current.style.transform = 'translateX(-50%)';
    };
    position();
    window.addEventListener('resize', position);
    return () => window.removeEventListener('resize', position);
  }, [anchorId]);

  if (!deckName) return null;

  return (
    <div ref={ref} style={POPUP_STYLE}>
      {/* Arrow pointing up */}
      <svg width="14" height="7" viewBox="0 0 14 7" style={{ marginBottom: -1 }}>
        <path d="M0 7 L7 0 L14 7" fill="var(--ds-bg-canvas)" stroke="var(--ds-border-subtle)" strokeWidth="1" />
        {/* Cover the border line at bottom of arrow */}
        <line x1="1" y1="7" x2="13" y2="7" stroke="var(--ds-bg-canvas)" strokeWidth="1.5" />
      </svg>
      <div style={BODY_STYLE}>
        <span style={ICON_STYLE}>✦</span>
        <span style={DECK_STYLE}>{deckName}</span>
        {cardCount != null && <span style={COUNT_STYLE}>{cardCount}</span>}
        <span style={DIVIDER_STYLE} />
        <button style={LEARN_STYLE} onClick={onStartLearning}>
          Lernen →
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx vitest run --passWithNoTests 2>&1 | tail -5`
Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/DeckPopup.tsx
git commit -m "feat: add DeckPopup tooltip component (replaces CockpitBar)"
```

---

### Task 2: Add `id` to Session tab in TopBar + canvas-mode props

**Files:**
- Modify: `frontend/src/components/TopBar.jsx`

- [ ] **Step 1: Add `id` to the Session tab element for DeckPopup anchoring**

Find the Session tab render in TopBar.jsx. Each tab is rendered in a map or inline. Add `id="topbar-session-tab"` to the Session tab's DOM element.

- [ ] **Step 2: Add `canvasMode` prop to TopBar**

```jsx
// Add to TopBar props:
export default function TopBar({
  activeView = 'deckBrowser',
  ankiState = 'deckBrowser',
  totalDue = 0,
  deckName = '',
  dueNew = 0, dueLearning = 0, dueReview = 0,
  onTabClick, onSidebarToggle, settingsOpen = false,
  canvasMode = false,  // NEW — hides dots, shows ESC badge
}) {
```

- [ ] **Step 3: Adapt left slot — show ESC badge when canvasMode**

In TopBar's left-side render area, wrap the existing content:

```jsx
{canvasMode ? (
  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
    <kbd style={{
      fontSize: 9, fontWeight: 500,
      background: 'var(--ds-hover-tint)',
      border: '1px solid var(--ds-border-subtle)',
      padding: '2px 7px', borderRadius: 5,
      color: 'var(--ds-text-muted)',
    }}>ESC</kbd>
    <span style={{ fontSize: 11, color: 'var(--ds-text-muted)' }}>Verlassen</span>
  </div>
) : (
  /* existing left content (today count, plus button etc.) */
)}
```

- [ ] **Step 4: Adapt right slot — hide dots when canvasMode**

Wrap the right-side dots/statistics content:

```jsx
{!canvasMode && (
  /* existing right content (Neu/Fällig/Wieder dots) */
)}
```

Keep the +/X settings button visible in both modes.

- [ ] **Step 5: Verify build**

Run: `cd frontend && npm run build 2>&1 | tail -3`
Expected: build succeeds

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/TopBar.jsx
git commit -m "feat(TopBar): add canvasMode prop — ESC badge left, dots hidden right"
```

---

### Task 3: Wire DeckPopup + TopBar canvasMode in App.jsx, remove CockpitBar/LidLiftTransition

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Add DeckPopup import, remove LidLiftTransition import**

```jsx
// Remove:
import LidLiftTransition from './components/LidLiftTransition';

// Add:
import DeckPopup from './components/DeckPopup';
```

- [ ] **Step 2: Pass `canvasMode` to TopBar**

Find `persistentTopBar` definition. Add `canvasMode={lidIsActive}`:

```jsx
const persistentTopBar = (
    <TopBar
      activeView={activeView}
      ankiState={ankiState}
      // ... existing props ...
      canvasMode={lidIsActive}
    />
  );
```

- [ ] **Step 3: Replace LidLiftTransition with DeckPopup in deckBrowser block**

Replace:
```jsx
{lidLift.state !== 'idle' && (
  <LidLiftTransition
    state={lidLift.state}
    onAnimationComplete={lidLift.onAnimationComplete}
    deckName={deckBrowserData?.roots?.[0]?.name || null}
    onClose={() => lidLift.close(smartSearch.hasResults || smartSearch.isSearching)}
  />
)}
```

With:
```jsx
{lidIsActive && (
  <DeckPopup
    deckName={deckBrowserData?.roots?.[0]?.name || null}
    cardCount={deckBrowserData?.totalDue}
    onStartLearning={() => {
      const firstDeck = deckBrowserData?.roots?.[0];
      if (firstDeck) executeAction('deck.study', { deckId: firstDeck.id });
    }}
  />
)}
```

- [ ] **Step 4: Fix GraphView overlay — remove container, use full inset**

The GraphView overlay currently has a wrapping div with `position: absolute; inset: 0; zIndex: 3`. Change it so the GraphView itself renders without clipping:

```jsx
{lidIsActive && (
  <div style={{
    position: 'absolute', inset: 0, zIndex: 3,
    pointerEvents: lidLift.state === 'open' ? 'auto' : 'none',
    overflow: 'visible', /* 3D nodes bleed past edges */
  }}>
    <React.Suspense fallback={<div style={{ flex: 1 }} />}>
      <GraphView
        onToggleView={() => {}}
        isPremium={isPremium}
        deckData={deckBrowserData}
        smartSearch={smartSearch}
        bridge={bridgeRef.current}
      />
    </React.Suspense>
  </div>
)}
```

- [ ] **Step 5: Move onAnimationComplete to DeckSearchBar's onLidAnimEnd (already wired)**

Since we removed LidLiftTransition (which had its own 450ms timer for `onAnimationComplete`), verify that `lidLift.onAnimationComplete` is still called. It IS — via DeckSearchBar's `animationend` event listener (`onLidAnimEnd` prop). So no change needed here.

- [ ] **Step 6: Build and test**

Run: `cd frontend && npm run build 2>&1 | tail -3`
Run: `cd frontend && npx vitest run 2>&1 | tail -5`
Expected: both pass

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: replace CockpitBar with DeckPopup, wire TopBar canvasMode"
```

---

### Task 4: Restyle SearchSidebar as solid canvas panel

**Files:**
- Modify: `frontend/src/components/SearchSidebar.jsx`

- [ ] **Step 1: Find the sidebar root container styles**

The SearchSidebar root div has its own styling (background, border, border-radius). Find it and change:
- Background: solid `var(--ds-bg-canvas)` (NOT frosted/glass)
- Border: `1px solid var(--ds-border-subtle)`
- Border-radius: `14px`
- Remove any `backdrop-filter` / glass effects
- Add `box-shadow: var(--ds-shadow-lg)` for depth
- Add margin/inset: `top: 10px; right: 10px; bottom: 10px` (gap from screen edges)

- [ ] **Step 2: Verify the `hideActionDock` prop removes the bottom ChatInput**

Already implemented — confirm `{!hideActionDock && <div>...</div>}` wraps the bottom ChatInput section.

- [ ] **Step 3: Build and test**

Run: `cd frontend && npm run build 2>&1 | tail -3`
Expected: build succeeds

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/SearchSidebar.jsx
git commit -m "feat(SearchSidebar): solid canvas panel style, rounded corners, no glass"
```

---

### Task 5: Remove SparkBurst from lid-lift flow (optional — spec says CockpitBar removed)

**Files:**
- Modify: `frontend/src/App.jsx` (remove SparkBurst if it was rendered via LidLiftTransition)

- [ ] **Step 1: Check if SparkBurst is still rendered anywhere**

SparkBurst was rendered inside LidLiftTransition which we removed in Task 3. If no other code renders SparkBurst, nothing to do. The component files (`SparkBurst.tsx`, `CockpitBar.tsx`, `LidLiftTransition.tsx`) can stay as dead code for now — no need to delete.

- [ ] **Step 2: Verify no runtime errors**

Run: `cd frontend && npm run build 2>&1 | tail -3`
Expected: build succeeds, no unused import warnings that break build

---

### Task 6: Full integration test + build

**Files:** None (testing only)

- [ ] **Step 1: Run all frontend tests**

Run: `cd frontend && npx vitest run 2>&1 | tail -10`
Expected: 159+ tests pass (useLidLift tests still pass)

- [ ] **Step 2: Production build**

Run: `cd frontend && npm run build 2>&1 | tail -5`
Expected: build succeeds

- [ ] **Step 3: Manual test checklist**

Restart Anki and verify:
1. Stapelansicht shows DeckBrowserView with SearchBar between wordmark and deck list
2. Click SearchBar → lid-lift animation plays, bar drops to bottom
3. Wordmark + deck list disappear (conditional rendering)
4. DeckPopup appears centered under "Session" tab with deck name + "Lernen →"
5. TopBar left shows "ESC Verlassen", right dots hidden, +/X button still visible
6. SearchSidebar slides in from right: solid canvas color, rounded corners, no glass, no bottom dock
7. SearchSidebar resize handle works (drag left edge)
8. Type in dropped SearchBar → `smartSearch.search()` → sidebar fills with results
9. GraphView renders 3D graph on deep background (no clipping container)
10. ESC closes canvas mode, deck content reappears
11. Reverse animation plays if no search results

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: agent canvas layout — DeckPopup, solid panel, canvas mode TopBar"
```
