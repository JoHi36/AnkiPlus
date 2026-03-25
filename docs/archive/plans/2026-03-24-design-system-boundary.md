# Design System Boundary Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a clean boundary between design system primitives (`shared/components/`) and product components (`frontend/src/components/`) by moving 4 Anki-coupled components out of shared.

**Architecture:** The `shared/components/` directory becomes the "Invisible Addiction" primitive layer — only generic, Anki-agnostic components live there. Product components in `frontend/src/components/` import and compose these primitives. Currently 4 of 11 shared components reference Anki-specific concepts (bridge, cardContext, deckName, agent registry) and must move.

**Tech Stack:** React, TypeScript (.tsx), Vite with `@shared` alias, framer-motion, lucide-react

---

## Current State

**Re-export pattern:** Each of the 4 components has a thin `.jsx` wrapper in `frontend/src/components/` that re-exports from `@shared/components/`:
```js
// frontend/src/components/ChatInput.jsx
export { default } from '@shared/components/ChatInput';
```
All other frontend components import from this local wrapper (e.g., `import ChatInput from './ChatInput'`). This means **no widespread import changes needed** — only the wrapper files change.

**Dependency chain (shared → shared):**
- `ThoughtStream.tsx` → imports `SourcesCarousel`
- `SourcesCarousel.tsx` → imports `SourceCard`
- `ChatInput.tsx` → imports `../config/subagentRegistry`
- `SourceCard.tsx` → standalone

**Components staying in shared/ (7 — verified generic):**
Button, Card, MultipleChoiceCard, QuizCard, ResponsiveContainer, ReviewResult, TreeList

**Components moving to frontend/ (4 — Anki-coupled):**
ChatInput, SourceCard, SourcesCarousel, ThoughtStream

---

### Task 1: Move SourceCard (standalone, no dependencies)

**Files:**
- Delete: `frontend/src/components/SourceCard.jsx` (re-export wrapper)
- Move: `shared/components/SourceCard.tsx` → `frontend/src/components/SourceCard.tsx`
- Delete: `shared/components/SourceCard.tsx` (original)

- [ ] **Step 1: Move the file**
```bash
cp shared/components/SourceCard.tsx frontend/src/components/SourceCard.tsx
rm shared/components/SourceCard.tsx
rm frontend/src/components/SourceCard.jsx
```

- [ ] **Step 2: Verify no broken imports**
```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
# OR just check dev server has no errors
curl -s http://localhost:3000/ | head -5
```

- [ ] **Step 3: Commit**
```bash
git add shared/components/ frontend/src/components/SourceCard.*
git commit -m "refactor: move SourceCard from shared to frontend (Anki-coupled)"
```

---

### Task 2: Move SourcesCarousel (depends on SourceCard)

**Files:**
- Delete: `frontend/src/components/SourcesCarousel.jsx` (re-export wrapper)
- Move: `shared/components/SourcesCarousel.tsx` → `frontend/src/components/SourcesCarousel.tsx`
- Modify: update import path for SourceCard (now local)

- [ ] **Step 1: Move the file**
```bash
cp shared/components/SourcesCarousel.tsx frontend/src/components/SourcesCarousel.tsx
rm shared/components/SourcesCarousel.tsx
rm frontend/src/components/SourcesCarousel.jsx
```

- [ ] **Step 2: Update imports inside SourcesCarousel.tsx**

Change:
```typescript
import SourceCard from './SourceCard';
import type { Citation } from './SourceCard';
```
This already points to `./SourceCard` which now resolves to the local `.tsx` file. **No change needed** — the relative path still works because both files are now in the same directory.

- [ ] **Step 3: Verify dev server has no errors**

- [ ] **Step 4: Commit**
```bash
git add shared/components/ frontend/src/components/SourcesCarousel.*
git commit -m "refactor: move SourcesCarousel from shared to frontend (Anki-coupled)"
```

---

### Task 3: Move ThoughtStream (depends on SourcesCarousel)

**Files:**
- Delete: `frontend/src/components/ThoughtStream.jsx` (re-export wrapper)
- Move: `shared/components/ThoughtStream.tsx` → `frontend/src/components/ThoughtStream.tsx`

- [ ] **Step 1: Move the file**
```bash
cp shared/components/ThoughtStream.tsx frontend/src/components/ThoughtStream.tsx
rm shared/components/ThoughtStream.tsx
rm frontend/src/components/ThoughtStream.jsx
```

- [ ] **Step 2: Verify imports**

ThoughtStream imports `./SourcesCarousel` — now both are in `frontend/src/components/`, relative path still valid. **No change needed.**

- [ ] **Step 3: Verify dev server**

- [ ] **Step 4: Commit**
```bash
git add shared/components/ frontend/src/components/ThoughtStream.*
git commit -m "refactor: move ThoughtStream from shared to frontend (Anki-coupled)"
```

---

### Task 4: Move ChatInput (imports from shared/config)

**Files:**
- Delete: `frontend/src/components/ChatInput.jsx` (re-export wrapper)
- Move: `shared/components/ChatInput.tsx` → `frontend/src/components/ChatInput.tsx`
- Modify: update `../config/subagentRegistry` import path
- Modify: `Landingpage/src/components/demo/InteractivePlayground.tsx` — imports ChatInput directly from `@shared/`, needs path update

- [ ] **Step 1: Move the file**
```bash
cp shared/components/ChatInput.tsx frontend/src/components/ChatInput.tsx
rm shared/components/ChatInput.tsx
rm frontend/src/components/ChatInput.jsx
```

- [ ] **Step 2: Fix the subagentRegistry import**

In `frontend/src/components/ChatInput.tsx`, change:
```typescript
// Before (relative to shared/components/):
import { findAgent, getRegistry } from '../config/subagentRegistry';

// After (using Vite alias):
import { findAgent, getRegistry } from '@shared/config/subagentRegistry';
```

- [ ] **Step 3: Fix Landingpage direct import**

In `Landingpage/src/components/demo/InteractivePlayground.tsx`, change:
```typescript
// Before:
import ChatInput from '@shared/components/ChatInput';

// After — create a minimal stub that re-exports, or copy ChatInput for Landingpage independence:
// Simplest: keep a thin re-export stub at the old location
```

Create `shared/components/ChatInput.tsx` as a stub:
```typescript
// Re-export from frontend for backwards compatibility (Landingpage consumer)
// TODO: Landingpage should bundle its own copy or use a simpler input
export { default } from '../../frontend/src/components/ChatInput';
```

**Alternative (cleaner):** Update the Landingpage Vite config to resolve ChatInput from the frontend path, or give the Landingpage its own simpler input component since it doesn't need the full ChatInput.

- [ ] **Step 4: Verify dev server has no errors**

- [ ] **Step 5: Verify ChatInput renders in ComponentViewer**
Open `http://localhost:3000/?view=components`, scroll to ChatInput section. Confirm all variants render.

- [ ] **Step 5: Commit**
```bash
git add shared/components/ frontend/src/components/ChatInput.*
git commit -m "refactor: move ChatInput from shared to frontend (Anki-coupled)"
```

---

### Task 5: Update ComponentViewer imports

**Files:**
- Modify: `frontend/src/ComponentViewer.jsx`

- [ ] **Step 1: Check ComponentViewer imports**

ComponentViewer imports ChatInput and ThoughtStream. These were previously imported from `./components/ChatInput` etc. which pointed at the re-export wrappers. Now the `.tsx` files are there directly. Vite resolves `.tsx` — **likely no change needed**.

Verify: check that `import ChatInput from './components/ChatInput'` resolves to the `.tsx` file.

- [ ] **Step 2: Verify full ComponentViewer renders**
```bash
curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/?view=components"
```
Expected: 200, no console errors.

- [ ] **Step 3: Commit (if any changes needed)**

---

### Task 6: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the shared/components documentation**

In the Package Structure section, update the shared/components line count and clarify the boundary:

```markdown
├── shared/                  # Design system — "Invisible Addiction"
│   ├── styles/design-system.css  # Token source of truth (CSS vars)
│   ├── config/tailwind.preset.js # Tailwind ↔ token mapping
│   ├── components/          # Generic primitives (7 files, NO Anki knowledge)
│   │   ├── Button.tsx       # Variant button
│   │   ├── Card.tsx         # Motion card wrapper
│   │   ├── MultipleChoiceCard.tsx  # Quiz option UI
│   │   ├── QuizCard.tsx     # Quiz container
│   │   ├── ResponsiveContainer.tsx # Layout wrapper
│   │   ├── ReviewResult.tsx # Feedback display
│   │   └── TreeList.tsx     # Expandable tree list (DeckBrowser, TOC, etc.)
```

- [ ] **Step 2: Add shared/components rule**

In the Design System & Styling section, add:
```markdown
**Shared/Product boundary:**
- `shared/components/` = design system primitives. MUST be Anki-agnostic. No bridge, no cardContext, no deckName, no sessions. Props are generic.
- `frontend/src/components/` = product components. Import and compose shared primitives. May use bridge, hooks, Anki-specific state.
- Before adding a component to `shared/`, verify it has zero Anki imports or props.
```

- [ ] **Step 3: Commit**
```bash
git add CLAUDE.md
git commit -m "docs: document shared/product component boundary"
```

---

### Task 7: Final verification

- [ ] **Step 1: Verify shared/components/ is clean**
```bash
ls shared/components/
# Expected: Button.tsx Card.tsx MultipleChoiceCard.tsx QuizCard.tsx
#           ResponsiveContainer.tsx ReviewResult.tsx TreeList.tsx
# (7 files, all generic)
```

- [ ] **Step 2: Grep for Anki-specific terms in shared/components/**
```bash
grep -r "bridge\|cardContext\|deckName\|session\|anki" shared/components/ --include="*.tsx"
# Expected: no results
```

- [ ] **Step 3: Verify dev server runs clean**

- [ ] **Step 4: Verify ComponentViewer renders all sections**

- [ ] **Step 5: Final commit if needed**
