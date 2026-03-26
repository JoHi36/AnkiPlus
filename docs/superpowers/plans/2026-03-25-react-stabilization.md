# React Stabilization & Architecture Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the production stabilization by cleaning up the React frontend — remove debug noise, improve performance, enforce design system compliance, and set up the architecture for sustainable development.

**Architecture:** No new features. Same React app, same patterns. This plan fixes what's broken and establishes the foundations (tests, Error Boundaries, TypeScript direction) for the next phase.

**Tech Stack:** React 18, Vite, Tailwind CSS, DaisyUI, TypeScript (new files), Vitest (new)

**Prerequisite:** User's parallel frontend work must be committed before starting. Check `git status` — if uncommitted changes exist in frontend/src/, ask user to commit first.

**Updated:** 2026-03-26 — numbers refreshed from current codebase state.

---

## Phase 1: Production Noise Removal

### Task 1: Strip console statements + Vite auto-strip

**Current state:** ~303 console statements across 30+ files. No esbuild.drop configured — console calls ship to production.

**Top offenders:** useAnki.js (82), useChat.js (44), ChatMessage.jsx (44), App.jsx (34), useCardContext.js (14), useAgenticMessage.js (11), SectionDropdown.jsx (11), SessionContext.jsx (10), useModels.js (9)

**Files:**
- Modify: ALL files in `frontend/src/` containing `console.` (~30 files)
- Modify: `frontend/vite.config.js` — add `esbuild.drop`

**Strategy:**
- First, add Vite auto-strip (future-proof — prevents regressions):
```js
// vite.config.js build section:
esbuild: {
  drop: ['console', 'debugger'],
}
```
- Then manually remove console statements for code hygiene
- Exception: Keep `console.error` in `ErrorBoundary.jsx` (that's its job)

- [ ] **Step 1:** Run grep to get exact current count
- [ ] **Step 2:** Add `esbuild: { drop: ['console', 'debugger'] }` to vite.config.js build section
- [ ] **Step 3:** Remove console statements from hooks (useAnki.js ~82, useChat.js ~44, useAgenticMessage.js ~11, useModels.js ~9, useCardSession.js, useCardContext.js ~14, etc.)
- [ ] **Step 4:** Remove console statements from components (ChatMessage.jsx ~44, SectionDropdown.jsx ~11, Header.jsx, etc.)
- [ ] **Step 5:** Remove console statements from App.jsx (~34), SessionContext.jsx (~10), utils/sessions.js, utils/deviceId.js/ts
- [ ] **Step 6:** Verify ErrorBoundary.jsx still has its console.error (keep it)
- [ ] **Step 7:** Build: `cd frontend && npm run build`
- [ ] **Step 8:** Commit: `chore: remove ~303 console statements and add Vite auto-strip for production`

---

## Phase 2: React Performance

### Task 2: Add React.memo to list-rendered components

**Current state:** Only ChatMessage and StreamingChatMessage have React.memo. Components rendered in `.map()` loops (SessionRow, CardListWidget rows, AgentCard) lack memoization.

**Files:**
- Verify: `frontend/src/components/ChatMessage.jsx` — already memoized (no changes)
- Verify: `frontend/src/components/StreamingChatMessage.jsx` — already memoized (no changes)
- Modify: `frontend/src/components/DeckBrowser.jsx` — wrap SessionRow in React.memo
- Modify: `frontend/src/components/CardListWidget.jsx` — extract row, wrap in React.memo
- Modify: `frontend/src/components/AgentCard.jsx` — wrap in React.memo

- [ ] **Step 1:** Verify ChatMessage + StreamingChatMessage memos — no changes needed
- [ ] **Step 2:** Wrap SessionRow (inside DeckBrowser.jsx) in React.memo
- [ ] **Step 3:** Extract CardListWidget row to named component, wrap in React.memo
- [ ] **Step 4:** Wrap AgentCard export in React.memo
- [ ] **Step 5:** Build: `cd frontend && npm run build`
- [ ] **Step 6:** Commit: `perf: add React.memo to 3 list-rendered components`

---

### Task 3: Extract inline style objects to constants

**Current state:** ~692 `style={{}}` instances across components. Each creates a new object on every render, defeating React's diffing.

**Priority targets** (components in .map() loops or re-rendered frequently):
- `frontend/src/components/DeckBrowser.jsx` (~29 inline styles)
- `frontend/src/components/AgentCard.jsx` (~18 inline styles)
- `frontend/src/components/CardListWidget.jsx` (~15 inline styles)
- `frontend/src/components/ImageWidget.jsx` (~17 inline styles)
- `frontend/src/App.jsx` — skeleton/shimmer styles

**Pattern:**
```jsx
// Before (new object every render):
<div style={{ padding: '8px 0', display: 'flex', gap: 8 }}>

// After (stable reference):
const ROW_STYLE = { padding: '8px 0', display: 'flex', gap: 8 };
<div style={ROW_STYLE}>
```

**Rule:** If a style contains a hardcoded color, fix it to `var(--ds-*)` first, THEN extract.

- [ ] **Step 1:** Extract DeckBrowser.jsx inline styles (prioritize styles inside .map loops)
- [ ] **Step 2:** Extract AgentCard.jsx inline styles
- [ ] **Step 3:** Extract CardListWidget.jsx inline styles
- [ ] **Step 4:** Extract ImageWidget.jsx inline styles
- [ ] **Step 5:** Extract App.jsx skeleton/shimmer styles
- [ ] **Step 6:** Build: `cd frontend && npm run build`
- [ ] **Step 7:** Commit: `perf: extract inline style objects to stable constants`

---

### ~~Task 4: Fix Mermaid color reference errors~~ DONE

Mermaid constants are now properly defined (MERMAID_ACCENT, MERMAID_ACCENT2 at lines 457-458, palette validation at line 754). No action needed.

---

## Phase 3: Design System Compliance

### Task 5: Audit and fix hardcoded colors

**Current state:** ~100 hardcoded color instances across 26+ component files. Key offenders: AgentHeader.jsx (rgba violations), AgenticCell.jsx (dynamic rgba construction), plus scattered violations. ChatMessage.jsx Mermaid palette is an acceptable exception.

- [ ] **Step 1:** Run full audit: `grep -rn "rgba\|rgb(\|#[0-9a-fA-F]\{3,8\}" frontend/src/components/ --include='*.jsx' --include='*.tsx'` — get actual violations
- [ ] **Step 2:** Exclude acceptable exceptions (Mermaid palette constants)
- [ ] **Step 3:** Fix each file, mapping hardcoded values to design tokens:
  - White text → `var(--ds-text-primary)` / `var(--ds-text-secondary)` / `var(--ds-text-tertiary)`
  - Dark backgrounds → `var(--ds-bg-deep)` / `var(--ds-bg-canvas)` / `var(--ds-bg-frosted)`
  - Accent blue → `var(--ds-accent)`
  - Borders → `var(--ds-border)` / `var(--ds-border-subtle)`
  - Semantic colors → `var(--ds-green)`, `var(--ds-red)`, `var(--ds-yellow)`, `var(--ds-purple)`
- [ ] **Step 4:** Build: `cd frontend && npm run build`
- [ ] **Step 5:** Verify dark AND light mode in Component Viewer
- [ ] **Step 6:** Commit: `style: replace hardcoded colors with design system tokens`

---

## Phase 4: Error Resilience

### Task 6: Add granular Error Boundaries

**Current state:** One `ErrorBoundary.jsx` wraps the app. If a single ChatMessage crashes (e.g. bad Mermaid syntax), the entire app goes down.

**Files:**
- Modify: `frontend/src/components/ErrorBoundary.jsx` — add a `ComponentErrorBoundary` variant with inline fallback
- Modify: `frontend/src/components/ChatMessage.jsx` — wrap Mermaid/Molecule renderers
- Modify: `frontend/src/App.jsx` — wrap key view subtrees

**Design:**
```jsx
// Lightweight boundary for individual components:
function ComponentErrorBoundary({ children, fallback }) {
  // Shows fallback UI instead of crashing the whole app
  // Logs error via logger, not console
}

// Usage in ChatMessage:
<ComponentErrorBoundary fallback={<div className="ds-text-tertiary">Render error</div>}>
  <MermaidDiagram ... />
</ComponentErrorBoundary>
```

**Where to add boundaries:**
- Around each `<MermaidDiagram>` render
- Around each `<MoleculeRenderer>` render
- Around `<ToolWidgetRenderer>` in ChatMessage
- Around each major view in App.jsx (`<DeckBrowserView>`, `<ReviewerView>`, etc.)

- [ ] **Step 1:** Read ErrorBoundary.jsx — understand current implementation
- [ ] **Step 2:** Add `ComponentErrorBoundary` as a lightweight variant
- [ ] **Step 3:** Wrap MermaidDiagram, MoleculeRenderer, ToolWidgetRenderer in ChatMessage
- [ ] **Step 4:** Wrap major views in App.jsx
- [ ] **Step 5:** Build: `cd frontend && npm run build`
- [ ] **Step 6:** Commit: `feat: add granular Error Boundaries for component isolation`

---

## Phase 5: Dead Code & Cleanup

### Task 7: Remove dead code and unused variables

**Files:**
- Modify: `frontend/src/App.jsx` — empty JSX fragment blocks
- Audit: Unused imports across components

**Note:** `mermaidInitializedTheme` in ChatMessage.jsx is NOT dead code — do not remove.

- [ ] **Step 1:** Remove empty JSX fragments from App.jsx
- [ ] **Step 2:** Run `cd frontend && npx eslint src/ --rule 'no-unused-vars: warn'` to find unused vars
- [ ] **Step 3:** Remove verified unused imports and variables
- [ ] **Step 4:** Build: `cd frontend && npm run build`
- [ ] **Step 5:** Commit: `chore: remove dead code and unused variables`

---

## Phase 6: Frontend Test Setup

### Task 8: Set up Vitest + React Testing Library

**Current state:** Zero frontend tests. 74 components, 16 hooks, no automated verification.

**Files:**
- Create: `frontend/vitest.config.ts`
- Create: `frontend/src/test/setup.ts` — test setup with jsdom
- Modify: `frontend/package.json` — add test dependencies and script
- Create: `frontend/src/hooks/__tests__/useChat.test.ts` — first hook test

**Dependencies to add:**
```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

**Config:**
```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
});
```

**First test** (prove the system works):
```ts
// src/hooks/__tests__/useChat.test.ts
import { describe, it, expect } from 'vitest';

describe('useChat', () => {
  it('should be importable', () => {
    // Basic smoke test that the hook module loads
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 1:** Install dependencies: `cd frontend && npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom`
- [ ] **Step 2:** Create `vitest.config.ts` with jsdom environment
- [ ] **Step 3:** Create `src/test/setup.ts` with Testing Library matchers
- [ ] **Step 4:** Add `"test": "vitest run"` to package.json scripts
- [ ] **Step 5:** Create first smoke test
- [ ] **Step 6:** Run: `cd frontend && npm test`
- [ ] **Step 7:** Commit: `test: set up Vitest + React Testing Library for frontend`

---

### Task 9: Write critical hook tests

**Depends on:** Task 8 (Vitest setup)

**Files:**
- Create: `frontend/src/hooks/__tests__/useAnki.test.ts` — bridge mock behavior
- Create: `frontend/src/hooks/__tests__/useChat.test.ts` — message state management
- Create: `frontend/src/hooks/__tests__/useCardContext.test.ts` — card data handling

**Test cases (5-8 per hook):**

useAnki:
- Mock bridge returns expected methods
- sendMessage queues message correctly
- Timeout handling works
- Missing bridge gracefully degrades

useChat:
- Adding a message updates state
- Streaming message appends chunks
- Section management works
- Message normalization handles edge cases

useCardContext:
- Card data updates on ankiReceive
- Empty card context handled
- Deck change clears card context

- [ ] **Step 1:** Create useAnki tests with mock bridge
- [ ] **Step 2:** Create useChat tests with mock state
- [ ] **Step 3:** Create useCardContext tests
- [ ] **Step 4:** Run: `cd frontend && npm test`
- [ ] **Step 5:** Commit: `test: add tests for useAnki, useChat, useCardContext hooks`

---

## Phase 7: Window Globals Cleanup

### Task 10: Replace window._ callbacks with EventEmitter

**Current state:** `useAnki.js` registers callbacks as `window._sectionTitleCallback`, `window._getCardDetailsCallbacks`, etc. These are global singletons with no cleanup — if two components register, last one wins.

**Files:**
- Create: `frontend/src/utils/callbackRegistry.ts`
- Modify: `frontend/src/hooks/useAnki.js` — use registry instead of window._

**Design:**
```ts
// callbackRegistry.ts
type Callback = (...args: any[]) => void;
const registry = new Map<string, Map<string, Callback>>();

export function registerCallback(channel: string, id: string, fn: Callback) {
  if (!registry.has(channel)) registry.set(channel, new Map());
  registry.get(channel)!.set(id, fn);
}

export function unregisterCallback(channel: string, id: string) {
  registry.get(channel)?.delete(id);
}

export function invokeCallbacks(channel: string, ...args: any[]) {
  registry.get(channel)?.forEach(fn => fn(...args));
}
```

- [ ] **Step 1:** Create `callbackRegistry.ts` with register/unregister/invoke
- [ ] **Step 2:** Migrate `window._sectionTitleCallback` → registry
- [ ] **Step 3:** Migrate `window._getCardDetailsCallbacks` → registry
- [ ] **Step 4:** Migrate remaining window._ callbacks in useAnki.js
- [ ] **Step 5:** Add cleanup in useEffect returns where callbacks are registered
- [ ] **Step 6:** Build: `cd frontend && npm run build`
- [ ] **Step 7:** Commit: `refactor: replace window._ globals with callback registry`

---

## Execution Order Summary

| # | Task | Risk | Effort | Impact | Depends on |
|---|------|------|--------|--------|------------|
| 1 | Console strip (~303) + Vite auto-drop | Low | 60min | High | User's frontend committed |
| 2 | React.memo (3+ components) | Medium | 30min | High | — |
| 3 | Extract inline styles (top offenders) | Low | 60min | Medium | — |
| ~~4~~ | ~~Mermaid color fixes~~ | — | — | DONE | — |
| 5 | Design system compliance (~100 colors) | Medium | 60min | High | — |
| 6 | Granular Error Boundaries | Medium | 45min | High | — |
| 7 | Dead code removal | Low | 20min | Medium | — |
| 8 | Vitest setup | Low | 30min | High | — |
| 9 | Hook tests | Medium | 60min | High | Task 8 |
| 10 | Window globals cleanup | Medium | 45min | Medium | — |

**Total: ~6.5 hours (Task 4 done)**

**Parallelization:**
- Tasks 2-7 can run in any order (independent file changes)
- Task 9 requires Task 8
- Task 1 should be FIRST (makes all diffs cleaner)
- Task 5 after Task 3 if they touch the same files (inline styles may contain hardcoded colors)

---

## What This Plan Does NOT Cover (Separate Plans Needed)

- **App.jsx decomposition** — 3,138 lines → ~500 shell + view containers (separate plan after this stabilization)
- **Full TypeScript migration** — Decision: new files in .tsx, existing stay .jsx until touched (gradual)
- **CI/CD pipeline** — Automated testing on push (future)
- **Bundle optimization** — Tree shaking, code splitting, lazy loading for Mermaid/KaTeX (future)
- **Accessibility audit** — Screen reader support, keyboard navigation (future)
