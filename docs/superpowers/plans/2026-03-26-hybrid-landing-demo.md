# Hybrid Landing Page Demo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the landing page's hand-built demo with real frontend components fed by scripted demo data, so new features appear automatically without maintaining duplicate code.

**Architecture:** A `DemoContext` provides fake bridge/data to real components (`ReviewerView`, `ChatInput`, `ChatMessage`, `ReasoningStream`, etc.) inside a `DemoShell` orchestrator. Vite aliases (`@frontend`) let the Landingpage import from `frontend/src/` directly, with the existing `fixSharedComponentResolution` plugin handling npm deduplication.

**Tech Stack:** React 19 (Landingpage), Vite 6, Tailwind, real frontend components from `frontend/src/`

**Spec:** `docs/superpowers/specs/2026-03-26-hybrid-landing-demo-design.md`

---

## File Structure

**Create:**
- `Landingpage/src/components/demo/DemoContext.tsx` — React Context with fake bridge + demo state machine
- `Landingpage/src/components/demo/DemoShell.tsx` — Orchestrator composing real components
- `Landingpage/src/components/demo/demoAdapters.tsx` — Thin wrappers for bridge-coupled components

**Modify:**
- `Landingpage/vite.config.ts` — Add `@frontend` alias, extend resolution plugin
- `Landingpage/src/components/demo/DemoData.ts` — Add `reasoningSteps` + `sources` to scenarios
- `Landingpage/src/pages/LandingPage.tsx` — Replace `InteractivePlayground` with `DemoShell`
- `frontend/src/ComponentViewer.jsx` — Add showcases for ReasoningStream, AgenticCell, ReviewFeedback, DockEvalResult, SourceCard, CitationBadge

**Delete (after migration verified):**
- `Landingpage/src/components/demo/RealChatInput.tsx`
- `Landingpage/src/components/demo/RealChatMessage.tsx`
- `Landingpage/src/components/demo/RealEvaluation.tsx`
- `Landingpage/src/components/demo/RealThoughtStream.tsx`
- `Landingpage/src/components/demo/RealSourcesCarousel.tsx`
- `Landingpage/src/components/demo/RealSourceCard.tsx`
- `Landingpage/src/components/demo/RealToolTogglePopup.tsx`
- `Landingpage/src/components/demo/InteractivePlayground.tsx` (replaced by DemoShell)

---

### Task 1: Vite Config — Add @frontend alias

**Files:**
- Modify: `Landingpage/vite.config.ts`

- [ ] **Step 1: Add @frontend alias to resolve.alias**

In `Landingpage/vite.config.ts`, add the `@frontend` alias alongside the existing `@shared` alias:

```typescript
resolve: {
  alias: {
    '@': path.resolve(__dirname, '.'),
    '@shared': path.resolve(__dirname, '../shared'),
    '@frontend': path.resolve(__dirname, '../frontend/src'),  // NEW
    // ... existing package aliases
  },
```

- [ ] **Step 2: Extend fixSharedComponentResolution to handle @frontend imports**

Update the `resolveId` check to also intercept imports from `@frontend/` paths. Change the importer check from:

```typescript
if (importer && importer.includes('/shared/')) {
```

to:

```typescript
if (importer && (importer.includes('/shared/') || importer.includes('/frontend/src/'))) {
```

Also add these packages to `problematicPackages` if not already present: `'react-syntax-highlighter'`, `'remark-gfm'`, `'mermaid'`.

- [ ] **Step 3: Add new packages to optimizeDeps and dedupe**

Add to `optimizeDeps.include`: `'react-syntax-highlighter'`, `'remark-gfm'`, `'mermaid'`.

Add to `resolve.dedupe`: `'framer-motion'`, `'lucide-react'`.

- [ ] **Step 4: Verify build still works**

Run: `cd Landingpage && npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add Landingpage/vite.config.ts
git commit -m "build(landing): add @frontend alias for component imports"
```

---

### Task 2: DemoContext — Fake bridge + state machine

**Files:**
- Create: `Landingpage/src/components/demo/DemoContext.tsx`

- [ ] **Step 1: Create DemoContext with types and provider**

Create a React Context that provides:
- Current scenario data (from `DEMO_SCENARIOS`)
- State machine: `DemoPhase` type with states `QUESTION`, `TYPING`, `EVALUATING`, `EVALUATED`, `ANSWER`, `MC_LOADING`, `MC_ACTIVE`, `MC_RESULT`, `CHAT`
- A `DemoBridge` object with no-op methods: `saveMultipleChoice`, `openPreview`, `openUrl`
- State: `showBack`, `inputText`, `chatMessages`, `isStreaming`, `evalScore`, `mcResult`, `autoRateEase`
- Actions: `handleShowAnswer`, `handleSubmitText`, `handleStartMC`, `handleMCSelect`, `handleSendChat`, `handleOpenChat`, `handleCloseChat`, `handleReset`
- Scenario switching: `setScenarioKey` that resets state on switch

The state machine logic mirrors the existing `InteractivePlayground.tsx` transitions:
- `handleShowAnswer`: QUESTION → ANSWER (shows back, sets ease from timer)
- `handleSubmitText`: QUESTION → EVALUATING → EVALUATED (1.5s delay, shows back, calculates ease from score)
- `handleStartMC`: QUESTION → MC_LOADING → MC_ACTIVE (1.2s delay)
- `handleMCSelect`: MC_ACTIVE → MC_RESULT (on FLIP signal)
- `handleSendChat`: Simulates streaming by appending characters at 16ms intervals (3 chars at a time)

Export: `DemoProvider` component, `useDemoContext` hook.

- [ ] **Step 2: Verify file compiles**

Run: `cd Landingpage && npx tsc --noEmit src/components/demo/DemoContext.tsx 2>&1 || echo "check manually"`

- [ ] **Step 3: Commit**

```bash
git add Landingpage/src/components/demo/DemoContext.tsx
git commit -m "feat(landing): add DemoContext with state machine and fake bridge"
```

---

### Task 3: DemoData — Add reasoning steps and sources

**Files:**
- Modify: `Landingpage/src/components/demo/DemoData.ts`

- [ ] **Step 1: Extend DemoScenario interface**

Add these fields to the `DemoScenario` interface:

```typescript
reasoningSteps: Array<{
  id: string;
  label: string;
  status: 'done' | 'active' | 'pending';
  detail?: string;
}>;
sources: Array<{
  cardId: number;
  deckName: string;
  front: string;
  matchType: 'keyword' | 'semantic' | 'both';
  score: number;
}>;
```

- [ ] **Step 2: Add reasoning steps to each scenario**

Add to the `medicine` scenario:

```typescript
reasoningSteps: [
  { id: 'router', label: 'Anfrage analysieren', status: 'done', detail: 'Kartenkontext erkannt → Tutor' },
  { id: 'search', label: '4 Karten durchsucht', status: 'done', detail: 'Wirbelsäule-Deck' },
  { id: 'merge', label: 'Antwort zusammenführen', status: 'done' },
],
sources: [
  { cardId: 1, deckName: 'Wirbelsäule', front: 'Aufbau der Bandscheibe', matchType: 'both', score: 0.92 },
  { cardId: 2, deckName: 'Wirbelsäule', front: 'Nucleus pulposus Funktion', matchType: 'semantic', score: 0.85 },
  { cardId: 3, deckName: 'Wirbelsäule', front: 'Stoßdämpferfunktion', matchType: 'keyword', score: 0.78 },
],
```

Add similar data for `law` and `business` scenarios (adjust labels to match subject).

- [ ] **Step 3: Commit**

```bash
git add Landingpage/src/components/demo/DemoData.ts
git commit -m "feat(landing): add reasoning steps and sources to demo scenarios"
```

---

### Task 4: demoAdapters — Thin wrappers for bridge-coupled components

**Files:**
- Create: `Landingpage/src/components/demo/demoAdapters.tsx`

- [ ] **Step 1: Create useDemoBridgeStub hook**

ReviewerView calls `window.ankiBridge.addMessage()` for KG terms and AMBOSS tooltips. Create a hook that stubs the global before rendering:

```tsx
export function useDemoBridgeStub() {
  useEffect(() => {
    const existing = (window as any).ankiBridge;
    (window as any).ankiBridge = {
      addMessage: (type: string, _data: any) => {
        // Silently ignore all bridge calls in demo mode
      },
    };
    return () => {
      if (existing) (window as any).ankiBridge = existing;
      else delete (window as any).ankiBridge;
    };
  }, []);
}
```

- [ ] **Step 2: Create buildDemoBridgeProp function**

Build a minimal bridge object that ChatMessage/SourcesCarousel expect. All methods are no-ops:

```tsx
export function buildDemoBridgeProp() {
  return {
    saveMultipleChoice: () => {},
    loadMultipleChoice: () => JSON.stringify({ success: false }),
    hasMultipleChoice: () => JSON.stringify({ has: false }),
    openPreview: () => {},
    previewCard: () => {},
    openUrl: (url: string) => window.open(url, '_blank'),
    goToCard: () => {},
    getCardDetails: () => JSON.stringify({}),
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add Landingpage/src/components/demo/demoAdapters.tsx
git commit -m "feat(landing): add demo adapters for bridge-coupled components"
```

---

### Task 5: DemoShell — Orchestrator with real components

**Files:**
- Create: `Landingpage/src/components/demo/DemoShell.tsx`

This is the largest task. The DemoShell replaces `InteractivePlayground.tsx` by composing real components.

- [ ] **Step 1: Create DemoShell with imports and layout**

Create a `DemoShellInner` component (wrapped by `DemoProvider`) that:

1. Imports real components: `ChatInput` from `@frontend/components/ChatInput`, `ReviewFeedback` from `@frontend/components/ReviewFeedback`, `QuizCard` from `@shared/components/QuizCard`
2. Uses `useDemoContext()` for all state
3. Calls `useDemoBridgeStub()` to stub window.ankiBridge
4. Renders this layout:
   - **Scenario tabs** at top (Medizin / Jura / BWL)
   - **Card container** with frosted dark background, rounded corners
     - Card front (rendered as HTML from scenario data — this is trusted, developer-authored content from DemoData.ts)
     - Card back (animated reveal with AnimatePresence)
     - Evaluation result (ReviewFeedback with score)
     - MC quiz (QuizCard with scenario options)
   - **ChatInput** at bottom with action buttons (Show Answer / Multiple Choice)

Export a `DemoShell` component that wraps `DemoShellInner` in `<DemoProvider>`.

This is the **minimal viable version** using known-pure components. Advanced components are added in Task 7.

- [ ] **Step 2: Verify build**

Run: `cd Landingpage && npm run build`
Expected: Build succeeds. Fix any import resolution errors.

- [ ] **Step 3: Commit**

```bash
git add Landingpage/src/components/demo/DemoShell.tsx
git commit -m "feat(landing): add DemoShell orchestrator with real components"
```

---

### Task 6: Wire DemoShell into LandingPage

**Files:**
- Modify: `Landingpage/src/pages/LandingPage.tsx`

- [ ] **Step 1: Replace InteractivePlayground import with DemoShell**

Change:
```tsx
import { InteractivePlayground } from '../components/demo/InteractivePlayground';
```
To:
```tsx
import { DemoShell } from '../components/demo/DemoShell';
```

- [ ] **Step 2: Replace usage in JSX**

Find the `<InteractivePlayground />` usage in the demo section and replace with `<DemoShell />`.

- [ ] **Step 3: Build and test visually**

Run: `cd Landingpage && npm run dev`

Open `http://localhost:3000` and verify:
- Scenario tabs work (Medizin / Jura / BWL)
- Card front displays correctly
- ChatInput renders with action buttons
- Show Answer reveals card back
- MC quiz works via QuizCard
- Evaluation score bar appears

- [ ] **Step 4: Commit**

```bash
git add Landingpage/src/pages/LandingPage.tsx
git commit -m "feat(landing): wire DemoShell into landing page, replace InteractivePlayground"
```

---

### Task 7: Add advanced components (ReasoningStream, ChatMessage, Sources)

**Files:**
- Modify: `Landingpage/src/components/demo/DemoShell.tsx`

This task adds the visually rich components on top of the working base.

- [ ] **Step 1: Import ReasoningStream**

Add to DemoShell imports:
```tsx
import ReasoningStream from '@frontend/reasoning/ReasoningStream';
```

Add to the JSX, between the card display and the evaluation result:
```tsx
{(phase === 'EVALUATING' || phase === 'EVALUATED') && scenario.reasoningSteps && (
  <div style={{ padding: '12px 28px 0' }}>
    <ReasoningStream
      steps={scenario.reasoningSteps}
      pipelineGeneration={1}
      isStreaming={phase === 'EVALUATING'}
      message=""
      variant="compact"
    />
  </div>
)}
```

Build and verify. If ReasoningStream has transitive import issues, check which packages need adding to `fixSharedComponentResolution`.

- [ ] **Step 2: Import SourcesCarousel**

```tsx
import SourcesCarousel from '@frontend/components/SourcesCarousel';
```

Add below the evaluation result, only when sources are available:
```tsx
{phase === 'EVALUATED' && scenario.sources?.length > 0 && (
  <div style={{ padding: '8px 16px 16px' }}>
    <SourcesCarousel
      sources={scenario.sources}
      onPreviewCard={() => {}}
    />
  </div>
)}
```

- [ ] **Step 3: Import AgenticCell for chat response wrapper**

```tsx
import AgenticCell from '@frontend/components/AgenticCell';
```

Use it to wrap the chat response area when in CHAT phase.

- [ ] **Step 4: Build and verify all components render**

Run: `cd Landingpage && npm run build`
Expected: Build succeeds. All new components visible in the demo.

- [ ] **Step 5: Commit**

```bash
git add Landingpage/src/components/demo/DemoShell.tsx
git commit -m "feat(landing): add ReasoningStream, SourcesCarousel, AgenticCell to demo"
```

---

### Task 8: Delete old demo component clones

**Files:**
- Delete: `Landingpage/src/components/demo/RealChatInput.tsx`
- Delete: `Landingpage/src/components/demo/RealChatMessage.tsx`
- Delete: `Landingpage/src/components/demo/RealEvaluation.tsx`
- Delete: `Landingpage/src/components/demo/RealThoughtStream.tsx`
- Delete: `Landingpage/src/components/demo/RealSourcesCarousel.tsx`
- Delete: `Landingpage/src/components/demo/RealSourceCard.tsx`
- Delete: `Landingpage/src/components/demo/RealToolTogglePopup.tsx`
- Delete: `Landingpage/src/components/demo/InteractivePlayground.tsx`

- [ ] **Step 1: Verify no other files import the Real* components**

Search for imports of `RealChatInput`, `RealChatMessage`, `RealEvaluation`, `RealThoughtStream`, `RealSourcesCarousel`, `RealSourceCard`, `RealToolTogglePopup`, and `InteractivePlayground` in the Landingpage source. Should be zero after Task 6.

- [ ] **Step 2: Delete the files**

```bash
cd Landingpage/src/components/demo
rm RealChatInput.tsx RealChatMessage.tsx RealEvaluation.tsx \
   RealThoughtStream.tsx RealSourcesCarousel.tsx RealSourceCard.tsx \
   RealToolTogglePopup.tsx InteractivePlayground.tsx
```

- [ ] **Step 3: Build to verify nothing breaks**

Run: `cd Landingpage && npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add -u Landingpage/src/components/demo/
git commit -m "cleanup(landing): delete old demo component clones replaced by real imports"
```

---

### Task 9: Component Viewer — Add showcases for extracted components

**Files:**
- Modify: `frontend/src/ComponentViewer.jsx`

- [ ] **Step 1: Add ReasoningStream showcase**

Import ReasoningStream and add a Showcase section with sample pipeline steps:

```jsx
const DEMO_REASONING_STEPS = [
  { id: 'router', label: 'Anfrage analysieren', status: 'done', detail: 'Kartenkontext erkannt → Tutor' },
  { id: 'search', label: '4 Karten durchsucht', status: 'done', detail: 'Wirbelsäule-Deck' },
  { id: 'merge', label: 'Antwort zusammenführen', status: 'active' },
];
```

Show it in a Showcase block with `variant="compact"` and `variant="full"`.

- [ ] **Step 2: Add ReviewFeedback showcase**

Show three instances: `<ReviewFeedback score={30} />`, `<ReviewFeedback score={70} />`, `<ReviewFeedback score={100} />`.

- [ ] **Step 3: Add DockEvalResult / DockStars / DockTimer showcase**

Import from `ReviewerDock.jsx` and show all four rating states (Again=1, Hard=2, Good=3, Easy=4).

- [ ] **Step 4: Add SourceCard showcase**

Import SourceCard and show three variants: keyword (blue), semantic (green), dual-match (gold).

- [ ] **Step 5: Add CitationBadge showcase**

Show numbered badges `[1]`, `[2]`, `[3]` with sample tooltip data.

- [ ] **Step 6: Add AgenticCell showcase**

Show three agent types: tutor, research, plusi — with loading and loaded states.

- [ ] **Step 7: Build frontend and verify Component Viewer**

Run: `cd frontend && npm run dev`
Open: `http://localhost:3000/?view=components`
Verify: All new showcases render correctly.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/ComponentViewer.jsx
git commit -m "feat(viewer): add showcases for ReasoningStream, ReviewFeedback, Dock, Sources, AgenticCell"
```

---

### Task 10: Final verification and build

- [ ] **Step 1: Build both projects**

```bash
cd frontend && npm run build
cd ../Landingpage && npm run build
```

Both must succeed.

- [ ] **Step 2: Run frontend tests**

```bash
cd frontend && npm test
```

All tests must pass.

- [ ] **Step 3: Visual verification**

Run: `cd Landingpage && npm run dev`

Check:
- [ ] Scenario tabs switch correctly
- [ ] Card front/back renders with HTML formatting
- [ ] Evaluation score bar animates
- [ ] MC quiz works (select, show result)
- [ ] ReasoningStream shows pipeline steps
- [ ] SourcesCarousel shows source cards
- [ ] ChatInput renders with action buttons
- [ ] No console errors

- [ ] **Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix(landing): final polish for hybrid demo integration"
```
