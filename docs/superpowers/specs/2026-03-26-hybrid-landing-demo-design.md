# Hybrid Landing Page Demo

**Date:** 2026-03-26
**Status:** Draft
**Branch:** feature/agent-studio

## Problem

The landing page demo (`InteractivePlayground.tsx`, 658 lines) is a standalone recreation of the app UI. Every component (ChatInput, Evaluation, MC cards, chat messages) was rebuilt from scratch in `Landingpage/src/components/demo/`. When the real product changes, the demo falls behind — it must be manually updated for every new feature.

## Solution

Import **real frontend components** directly into the landing page, fed with scripted demo data via a `DemoContext`. The components render exactly as they do in the real app; only the data source changes (fake data instead of Anki bridge).

## Architecture

```
Landingpage/src/components/demo/
├── DemoShell.tsx          ← Orchestrator (replaces InteractivePlayground)
├── DemoContext.tsx         ← React Context providing fake bridge + data
├── DemoData.ts            ← Scenarios (exists, adapted for new props)
└── demoAdapters.ts        ← Thin wrappers for bridge-coupled components
```

### Data Flow

```
DemoData.ts (scenarios)
    ↓
DemoContext.tsx (React Context)
    ↓ provides: cardData, reviewerState, chatMessages, deckInfo, demoBridge
    ↓
DemoShell.tsx (orchestrator + state machine)
    ↓ passes props
    ↓
Real Components (ReviewerView, ChatInput, ChatMessage, etc.)
```

### DemoContext

A React Context that replaces the bridge/hook layer. Components that normally call `bridge.X()` receive a `demoBridge` object with no-op or scripted responses:

```typescript
interface DemoContextValue {
  cardData: { front: string; back: string; deckName: string };
  reviewerState: 'question' | 'answer' | 'mc' | 'rated';
  chatMessages: DemoMessage[];
  isStreaming: boolean;
  demoBridge: {
    saveMultipleChoice: () => void;   // no-op
    openPreview: () => void;          // no-op
    openUrl: (url: string) => void;   // window.open
  };
  // State machine controls
  advance: () => void;
  showAnswer: () => void;
  selectMC: (id: string) => void;
  sendChat: (text: string) => void;
}
```

### DemoShell (replaces InteractivePlayground)

The orchestrator composes real components in the same layout as the app:

```
┌─────────────────────────────────────┐
│  ReviewerView (card front/back)     │
│  ─────────────────────────────────  │
│  ReasoningStream (AI thinking)      │
│  ─────────────────────────────────  │
│  AgenticCell + ChatMessage (answer) │
│  ─────────────────────────────────  │
│  SourcesCarousel (citations)        │
│  ─────────────────────────────────  │
│  ReviewFeedback (score bar)         │
│  DockEvalResult (rating)            │
│  ─────────────────────────────────  │
│  ChatInput (input dock)             │
└─────────────────────────────────────┘
```

The state machine from `DemoData.ts` drives transitions: Question → Type Answer → Evaluation → Show Answer → MC → Chat.

### Demo Flow (scripted)

Each scenario defines the full data for every phase:

```typescript
interface DemoScenario {
  subject: 'Medizin' | 'Jura' | 'BWL';
  card: { front: string; back: string; deckName: string };
  userAnswer: string;           // Auto-typed answer text
  evaluation: { score: number; feedback: string };
  mcOptions: MCOption[];
  reasoningSteps: PipelineStep[];  // For ReasoningStream
  chatResponse: string;           // Streamed AI answer
  sources: SourceCard[];          // For SourcesCarousel
}
```

## Components to Import

### Tier 1 — Direct import, pure or near-pure

| Component | Source | Bridge Coupling | Action |
|-----------|--------|-----------------|--------|
| ChatInput | `frontend/src/components/ChatInput.tsx` | None | Import directly |
| MultipleChoiceCard | `shared/components/MultipleChoiceCard.tsx` | None | Import directly |
| ReviewFeedback | `frontend/src/components/ReviewFeedback.jsx` | None | Import directly |
| DockEvalResult | `frontend/src/components/ReviewerDock.jsx` | None | Import directly |
| DockStars | `frontend/src/components/ReviewerDock.jsx` | None | Import directly |
| DockTimer | `frontend/src/components/ReviewerDock.jsx` | None | Import directly |
| InsightBullet | `frontend/src/components/InsightBullet.jsx` | None | Import directly |
| CitationBadge | `frontend/src/components/CitationBadge.jsx` | None | Import directly |

### Tier 2 — Need thin adapter (bridge calls replaced with props/no-ops)

| Component | Source | Bridge Calls | Adapter |
|-----------|--------|--------------|---------|
| ReviewerView | `frontend/src/components/ReviewerView.jsx` | `ankiBridge.addMessage` (KG terms, AMBOSS) | Stub `window.ankiBridge` or pass callbacks |
| ChatMessage | `frontend/src/components/ChatMessage.jsx` | `bridge.saveMultipleChoice`, `bridge.openPreview` | Pass `demoBridge` from context |
| StreamingChatMessage | `frontend/src/components/StreamingChatMessage.jsx` | Inherits ChatMessage | Adapted via ChatMessage |
| SourcesCarousel | `frontend/src/components/SourcesCarousel.tsx` | `bridge.previewCard` fallback | Pass `onPreviewCard` prop |
| AgenticCell | `frontend/src/components/AgenticCell.jsx` | `subagentRegistry` lookup | Works as-is (registry is shared config) |

### Tier 3 — Reasoning display (pure, high visual impact)

| Component | Source | Bridge Coupling | Action |
|-----------|--------|-----------------|--------|
| ReasoningStream | `frontend/src/reasoning/ReasoningStream.tsx` | None (data via props) | Import directly |
| defaultRenderers | `frontend/src/reasoning/defaultRenderers.tsx` | None | Import directly |

## Components to Extract to shared/

These components are currently in `frontend/src/components/` but are pure enough to live in `shared/components/` for reuse by both frontend and landing page:

1. **ReviewFeedback** — pure score bar animation, zero Anki deps
2. **DockEvalResult / DockStars / DockTimer** — pure evaluation micro-components
3. **CitationBadge** — pure numbered pill with tooltip
4. **InsightBullet** — pure colored bullet point
5. **SourceCard** — pure frosted glass card

These extractions are optional for the initial implementation — direct imports from `frontend/` work via Vite aliases. But moving them to `shared/` is cleaner long-term.

## Vite Configuration

Extend `Landingpage/vite.config.ts`:

```typescript
resolve: {
  alias: {
    '@shared': path.resolve(__dirname, '../shared'),
    '@frontend': path.resolve(__dirname, '../frontend/src'),  // NEW
  }
}
```

The existing `fixSharedComponentResolution()` plugin already handles npm package deduplication (react-markdown, framer-motion, etc.). It needs to be extended to also intercept imports from `@frontend/` paths, routing their npm dependencies to Landingpage's `node_modules/`.

### React 18/19 Compatibility

Frontend uses React 18, Landingpage uses React 19. The existing Vite alias `react: landingpageNodeModules/react` forces all components to use React 19 at build time. This works because:
- Frontend components only use React 18 APIs (hooks, memo, forwardRef)
- React 19 is backwards-compatible with these APIs
- No React 18-only features are used (e.g., no `useId` polyfills)

## Files to Delete (after migration)

These demo-specific recreations become unnecessary:

- `Landingpage/src/components/demo/RealChatInput.tsx` (replaced by real ChatInput)
- `Landingpage/src/components/demo/RealChatMessage.tsx` (replaced by real ChatMessage)
- `Landingpage/src/components/demo/RealEvaluation.tsx` (replaced by real ReviewFeedback)
- `Landingpage/src/components/demo/RealThoughtStream.tsx` (replaced by real ReasoningStream)
- `Landingpage/src/components/demo/RealSourcesCarousel.tsx` (replaced by real SourcesCarousel)

Keep:
- `DemoData.ts` (adapted with new prop shapes)
- `InteractivePlayground.tsx` → renamed to `DemoShell.tsx` (rewritten as orchestrator)

## Component Viewer Updates

All imported components should be added to the Component Viewer (`frontend/src/ComponentViewer.jsx`) as standalone showcases:

1. **ReasoningStream** — with sample pipeline steps (router → search → merge)
2. **AgenticCell** — with different agent types (tutor, research, plusi)
3. **ReviewFeedback** — with different scores (30%, 70%, 100%)
4. **DockEvalResult + DockStars + DockTimer** — rating states (Again, Hard, Good, Easy)
5. **SourceCard** — keyword, semantic, dual-match variants
6. **CitationBadge** — numbered badges with tooltip preview

## Success Criteria

1. Landing page demo renders real components from `frontend/src/` and `shared/`
2. Demo flow works end-to-end: Question → Answer → Evaluation → MC → Chat
3. No bridge required — all data comes from DemoContext
4. All 3 scenarios (Medizin, Jura, BWL) work with scenario switcher
5. Landingpage build succeeds with no React version conflicts
6. Demo-specific component clones (Real*.tsx) are deleted
7. New components visible in Component Viewer

## Risks

- **Breaking imports**: If frontend components add new hook dependencies, the demo may break. Mitigation: CI build check for Landingpage.
- **Bundle size**: Importing real components pulls in their dependencies (react-markdown, mermaid, etc.). Mitigation: Landingpage already includes most of these. Monitor bundle size delta.
- **React version drift**: If frontend moves to React 19-only APIs, the compatibility layer becomes unnecessary. If it stays on 18, the alias approach continues to work.
