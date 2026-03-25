# Unified Reasoning Display — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fragmented ThoughtStream/ChatMessage reasoning logic with a single, registry-based Reasoning Display system that any agent can plug into by declaring step definitions.

**Architecture:** A `StepRenderer` registry maps step type IDs to render functions. ThoughtStream becomes a generic engine that reads from this registry instead of hardcoding step names. Each agent defines its steps declaratively in the agent registry. The timing engine (800ms queue, collapse-after-done, skeleton) stays identical — only the rendering dispatch becomes pluggable.

**Tech Stack:** React 18, TypeScript, Python dataclasses, existing Qt signal pipeline (unchanged)

**Preserves:** The Tutor's current visual appearance (sql_search chips, semantic chunks, merge bar, sources carousel) is registered as the default step renderers. Zero visual regression.

---

## Current Problems

1. **Hardcoded step types** in ThoughtStream.tsx (STEP_NAMES, ACTIVE_TITLES, getDoneLabel, PhaseRow dispatch) — 5 places to modify per new step
2. **Collapse logic coupled** to specific step names and timing hacks
3. **Skeleton timing** competes between ChatMessage and ThoughtStream (two sources of truth)
4. **No standard way** for Research/Help/Plusi agents to add their own reasoning steps
5. **Orchestration flicker** during live→saved message transition

## Design Decisions

- **Registry over inheritance**: Step renderers are registered functions, not class hierarchies
- **Backend declares, frontend renders**: Python agent defines step IDs + display hints, frontend matches to renderers
- **Timing is universal**: 800ms min-display, collapse-after-all-done, skeleton-before-text — applies to ALL agents identically
- **Tutor steps are the default renderers**: Existing SqlTags, SemanticChunks, MergeBar become registered renderers, not hardcoded branches
- **Single DOM position for v2 messages**: Live and saved messages render at the same place (no unmount/remount flicker)
- **Two-tier extensibility**: Backend declares step metadata (id, label, activeTitle), frontend has lookup table of known custom renderers. Unknown steps get a clean fallback — no crash, no missing UI.
- **`router` as alias**: Register both `router` and `orchestrating` to the same renderer (v1 saved messages use `router`, v2 uses `orchestrating`)

## Review Findings (addressed)

1. **App.jsx live-path must also migrate** — Task 4b covers the live-streaming ThoughtStream in App.jsx (lines 2887-2920), not just ChatMessage
2. **`router` step alias** — `defaultRenderers.tsx` registers both `router` and `orchestrating`
3. **ComponentViewer** — Task 8 explicitly updates ComponentViewer's ThoughtStream references
4. **Dynamic renderer registration** — Task 6 defines how `reasoning_steps` from bridge JSON auto-register with fallback labels
5. **`pipelineGeneration` prop name** — kept as `pipelineGeneration` (not renamed to `generation`) for consistency

## File Structure

```
Frontend (create/modify):
  frontend/src/reasoning/                          # NEW directory
    stepRegistry.ts                                # Step renderer registry (Map<string, StepRendererDef>)
    defaultRenderers.tsx                            # Built-in renderers: SqlTags, SemanticChunks, MergeBar, RouterDetails
    ReasoningStream.tsx                             # Replaces ThoughtStream — generic engine using registry
    types.ts                                        # Shared types: StepRendererDef, ReasoningStep, CollapseRule

  frontend/src/components/ThoughtStream.tsx         # DELETE after migration (replaced by ReasoningStream)
  frontend/src/components/ChatMessage.jsx           # MODIFY: use ReasoningStream instead of ThoughtStream
  frontend/src/components/AgenticCell.jsx           # MODIFY: remove skeleton logic (ReasoningStream handles it)
  frontend/src/hooks/useAgenticMessage.js           # MODIFY: minor — no structural changes
  frontend/src/hooks/useChat.js                     # MODIFY: remove generating filter (registry handles it)
  frontend/src/App.jsx                              # MODIFY: single v2 render path + migrate live-path ThoughtStream
  frontend/src/ComponentViewer.jsx                   # MODIFY: replace ThoughtStream references with ReasoningStream

Backend (modify):
  ai/agents.py                                      # MODIFY: add reasoning_steps field to AgentDefinition
  shared/config/subagentRegistry.ts                  # MODIFY: add reasoningSteps to SubagentConfig
```

---

### Task 1: Define Types + Step Registry

**Files:**
- Create: `frontend/src/reasoning/types.ts`
- Create: `frontend/src/reasoning/stepRegistry.ts`

- [ ] **Step 1: Create types.ts**

```typescript
// frontend/src/reasoning/types.ts
import { ReactNode } from 'react';

/** A single pipeline step from the backend */
export interface ReasoningStep {
  step: string;           // Step ID: 'sql_search', 'web_search', 'summarize', etc.
  status: 'active' | 'done' | 'error';
  data: Record<string, any>;
  timestamp: number;
}

/** Display step with visibility tracking (used by accumulating queue) */
export interface DisplayStep extends ReasoningStep {
  visibleSince: number;
}

/** How a step type renders itself */
export interface StepRendererDef {
  /** Step type ID (matches ReasoningStep.step) */
  id: string;
  /** Human-readable name shown in collapsed summary */
  label: string;
  /** Text shown while step is active (with pulsing dot) */
  activeTitle: string | ((data: Record<string, any>) => string);
  /** Text shown when step is done (with checkmark). Receives step data for dynamic labels. */
  doneLabel: (data: Record<string, any>, status: string) => string;
  /** Optional content rendered below the title row (query chips, score list, merge bar, etc.) */
  renderContent?: (props: {
    data: Record<string, any>;
    isDone: boolean;
    animate: boolean;
    agentColor?: string;
  }) => ReactNode;
  /** If true, this step is hidden from ThoughtStream (e.g., 'generating' — handled by skeleton) */
  hidden?: boolean;
}

/** Minimum display time for each step before the next one appears */
export const MIN_STEP_INTERVAL = 800;

/** Collapse behavior for reasoning display */
export type CollapseRule = 'auto' | 'never' | 'immediate';
```

- [ ] **Step 2: Create stepRegistry.ts**

```typescript
// frontend/src/reasoning/stepRegistry.ts
import { StepRendererDef } from './types';

const registry = new Map<string, StepRendererDef>();

/** Register a step renderer. Call during app initialization. */
export function registerStepRenderer(def: StepRendererDef): void {
  registry.set(def.id, def);
}

/** Look up a renderer by step ID. Returns undefined for unknown steps. */
export function getStepRenderer(stepId: string): StepRendererDef | undefined {
  return registry.get(stepId);
}

/** Get all registered renderers (for debugging / dev tools) */
export function getAllRenderers(): Map<string, StepRendererDef> {
  return registry;
}

/**
 * Generic fallback renderer for unregistered step types.
 * Shows step name as-is with no content component.
 */
export function getFallbackRenderer(stepId: string): StepRendererDef {
  return {
    id: stepId,
    label: stepId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    activeTitle: 'Verarbeite...',
    doneLabel: () => stepId.replace(/_/g, ' '),
    renderContent: undefined,
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/reasoning/types.ts frontend/src/reasoning/stepRegistry.ts
git commit -m "feat(reasoning): add step registry types and core registry"
```

---

### Task 2: Extract Existing Renderers from ThoughtStream

**Files:**
- Create: `frontend/src/reasoning/defaultRenderers.tsx`
- Read: `frontend/src/components/ThoughtStream.tsx` (lines 260-574 — RouterDetails, SqlTags, SemanticChunks, MergeBar, RouterThinking)

- [ ] **Step 1: Create defaultRenderers.tsx**

Move the existing sub-components (SqlTags, SemanticChunks, MergeBar, RouterDetails, RouterThinking) from ThoughtStream.tsx into `defaultRenderers.tsx` as standalone exports. Then register them as step renderers.

The file should:
1. Export the 5 visual components unchanged (SqlTags, SemanticChunks, MergeBar, RouterDetails, RouterThinking)
2. Export a `registerDefaultRenderers()` function that registers: `orchestrating`, `sql_search`, `semantic_search`, `merge`, `generating` (hidden)
3. Use the existing `getDoneLabel()` logic per step

```typescript
// frontend/src/reasoning/defaultRenderers.tsx
import React from 'react';
import { registerStepRenderer, StepRendererDef } from './stepRegistry';

// ═══ Visual Components (moved verbatim from ThoughtStream.tsx) ═══

// SqlTags — query keywords with hit counts
function SqlTags({ data, isDone, animate = true }: { ... }) { /* EXACT COPY from ThoughtStream */ }

// SemanticChunks — snippet previews with similarity scores
function SemanticChunks({ data, isDone, animate = true }: { ... }) { /* EXACT COPY */ }

// MergeBar — keyword/semantic balance visualization
function MergeBar({ data }: { ... }) { /* EXACT COPY */ }

// RouterDetails — routing decision tags (agent, scope, mode)
function RouterDetails({ data, agentColor }: { ... }) { /* EXACT COPY */ }

// RouterThinking — skeleton shimmer tags during routing
function RouterThinking() { /* EXACT COPY */ }

// ═══ Registration ═══

export function registerDefaultRenderers(): void {
  registerStepRenderer({
    id: 'orchestrating',
    label: 'Routing',
    activeTitle: 'Agent wird ausgewählt...',
    doneLabel: (data) => {
      const rm = data.retrieval_mode || '';
      if (rm.startsWith('subagent:') || rm.startsWith('agent:')) return 'Aufgabe zugewiesen';
      if (rm === 'plusi') return 'Plusi';
      if (!data.search_needed) return 'Direkte Antwort';
      // ... existing logic from getDoneLabel
    },
    renderContent: ({ data, isDone, animate, agentColor }) =>
      isDone ? <RouterDetails data={data} agentColor={agentColor} />
             : (animate ? <RouterThinking /> : null),
  });

  registerStepRenderer({
    id: 'sql_search',
    label: 'Keyword-Suche',
    activeTitle: 'Durchsuche Karten...',
    doneLabel: (data) => `${data.total_hits || 0} Keyword-Treffer`,
    renderContent: ({ data, isDone, animate }) =>
      <SqlTags data={data} isDone={isDone} animate={animate} />,
  });

  registerStepRenderer({
    id: 'semantic_search',
    label: 'Semantische Suche',
    activeTitle: 'Semantische Suche...',
    doneLabel: (data) => `${data.total_hits || 0} semantische Treffer`,
    renderContent: ({ data, isDone, animate }) =>
      <SemanticChunks data={data} isDone={isDone} animate={animate} />,
  });

  registerStepRenderer({
    id: 'merge',
    label: 'Zusammenführung',
    activeTitle: 'Kombiniere Quellen...',
    doneLabel: (data) => {
      const t = data.total || 0;
      const k = data.keyword_count || 0;
      const s = data.semantic_count || 0;
      return `${t} Quelle${t !== 1 ? 'n' : ''} kombiniert` + (k + s > 0 ? ` (${k}K + ${s}S)` : '');
    },
    renderContent: ({ data, isDone }) => isDone ? <MergeBar data={data} /> : null,
  });

  registerStepRenderer({
    id: 'generating',
    label: 'Generierung',
    activeTitle: 'Generiere Antwort...',
    doneLabel: () => 'Antwort generiert',
    hidden: true,  // Not shown in ThoughtStream — skeleton handles it
  });

  // Alias: v1 saved messages use 'router', v2 uses 'orchestrating'
  const orchestratingRenderer = getStepRenderer('orchestrating')!;
  registerStepRenderer({ ...orchestratingRenderer, id: 'router' });
}
```

- [ ] **Step 2: Call registerDefaultRenderers() at app init**

In `frontend/src/App.jsx`, import and call before first render:
```javascript
import { registerDefaultRenderers } from './reasoning/defaultRenderers';
registerDefaultRenderers();  // Before React tree
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/reasoning/defaultRenderers.tsx frontend/src/App.jsx
git commit -m "feat(reasoning): extract default step renderers from ThoughtStream"
```

---

### Task 3: Build ReasoningStream Component

**Files:**
- Create: `frontend/src/reasoning/ReasoningStream.tsx`

This is the replacement for ThoughtStream. It uses the step registry for rendering and has clean, unified collapse/skeleton logic.

- [ ] **Step 1: Create ReasoningStream.tsx**

Core structure:
```typescript
// frontend/src/reasoning/ReasoningStream.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ReasoningStep, DisplayStep, MIN_STEP_INTERVAL } from './types';
import { getStepRenderer, getFallbackRenderer } from './stepRegistry';
import SourcesCarousel from '../components/SourcesCarousel';

interface ReasoningStreamProps {
  steps: ReasoningStep[];                // Pipeline steps from agentCell
  generation?: number;                   // Reset counter for new messages
  citations?: Record<string, any>;       // Citation map
  isStreaming?: boolean;                  // True during live message
  message?: string;                      // Agent's text content (for collapse detection)
  agentColor?: string;                   // Agent color from registry
  variant?: 'router' | 'agent';          // Router collapses differently
  bridge?: any;                          // For card preview
  onPreviewCard?: (citation: any) => void;
}

export default function ReasoningStream({ ... }: ReasoningStreamProps) {
  // 1. Accumulating pipeline (reuse exact logic from ThoughtStream's useAccumulatingPipeline)
  const { displaySteps, isProcessing } = useAccumulatingPipeline(steps, generation);

  // 2. Filter hidden steps (e.g., 'generating')
  const visibleSteps = displaySteps.filter(ds => {
    const renderer = getStepRenderer(ds.step);
    return !renderer?.hidden;
  });

  // 3. Collapse logic — UNIFIED for all agents
  //    - Router variant: collapse when all done
  //    - Agent variant: collapse when text arrives OR all done + MIN_STEP_INTERVAL delay
  //    - User toggle overrides everything

  // 4. Render: header (step count) + visible steps via registry + sources + skeleton
  //    Each step: look up renderer, call activeTitle/doneLabel/renderContent
  //    Skeleton: shows in collapsed view when !hasText && isStreaming
}
```

Key differences from current ThoughtStream:
- **No hardcoded step types**: PhaseRow looks up renderer from registry
- **Single collapse timer**: One `MIN_STEP_INTERVAL` delay, no competing effects
- **Skeleton inside collapsed view**: Not in ChatMessage
- **Sources rendered after last done step**: Always visible, not gated by collapse state

- [ ] **Step 2: Port useAccumulatingPipeline**

Move the exact hook from ThoughtStream.tsx. No logic changes — the 800ms queue, knownSteps tracking, processing state detection are all correct.

- [ ] **Step 3: Port PhaseRow with registry lookup**

Replace the hardcoded switch with:
```typescript
function PhaseRow({ step, data, status, isActive, agentColor, animate }: PhaseRowProps) {
  const renderer = getStepRenderer(step) || getFallbackRenderer(step);
  const title = isActive
    ? (typeof renderer.activeTitle === 'function' ? renderer.activeTitle(data) : renderer.activeTitle)
    : renderer.doneLabel(data, status);

  return (
    <div>
      <TitleRow title={title} isActive={isActive} agentColor={agentColor} status={status} />
      {renderer.renderContent?.({ data, isDone: !isActive, animate, agentColor })}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/reasoning/ReasoningStream.tsx
git commit -m "feat(reasoning): add ReasoningStream with registry-based rendering"
```

---

### Task 4: Replace ThoughtStream Usage in ChatMessage

**Files:**
- Modify: `frontend/src/components/ChatMessage.jsx` (lines 1884-1895)

- [ ] **Step 1: Replace ThoughtStream import with ReasoningStream**

```javascript
// Remove: import ThoughtStream from './ThoughtStream';
import ReasoningStream from '../reasoning/ReasoningStream';
```

- [ ] **Step 2: Replace v2 cell rendering**

```jsx
{cell.pipelineSteps && cell.pipelineSteps.length > 0 && (
  <ReasoningStream
    steps={cell.pipelineSteps}
    generation={message_prop.pipelineGeneration}
    citations={cell.citations || {}}
    isStreaming={cell.status === 'streaming' || cell.status === 'thinking'}
    message={cell.text || ''}
    agentColor={/* get from registry */}
    bridge={bridge}
    onPreviewCard={onPreviewCard}
  />
)}
```

- [ ] **Step 3: Remove skeleton from ChatMessage**

The skeleton that was previously in ChatMessage is now inside ReasoningStream's collapsed view. Remove any remaining skeleton divs.

- [ ] **Step 4: Keep ThoughtStream for v1 legacy messages (router variant)**

The router ThoughtStream at lines 1851-1859 can stay temporarily, or be replaced with `<ReasoningStream variant="router" ... />`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ChatMessage.jsx
git commit -m "refactor: replace ThoughtStream with ReasoningStream in ChatMessage"
```

---

### Task 4b: Migrate App.jsx Live-Path ThoughtStream

**Files:**
- Modify: `frontend/src/App.jsx` (lines ~2887-2920 — the live-streaming ThoughtStream + inline skeleton)

This is CRITICAL — the live-streaming path in App.jsx uses a separate ThoughtStream instance with its own inline skeleton. Without migrating this, removing the `generating` filter in Task 5 will break the live skeleton.

- [ ] **Step 1: Find the live-path ThoughtStream in App.jsx**

Search for the block that renders ThoughtStream when `chatHook.isLoading && !chatHook.currentMessage`. This is the v1 fallback live path.

- [ ] **Step 2: Replace with ReasoningStream or remove if v2 path handles it**

If `chatHook.currentMessage` is always set for v2 messages (which it is), this v1 live path only handles non-v2 messages. In that case:
- Replace ThoughtStream import with ReasoningStream
- Remove the inline skeleton div (lines ~2913-2920) — ReasoningStream handles skeleton internally

- [ ] **Step 3: Remove any remaining inline skeleton in the unified v2 render block**

The unified v2 renderer (Task 7) should rely solely on ReasoningStream for skeleton display.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "refactor: migrate App.jsx live-path to ReasoningStream"
```

---

### Task 5: Remove Generating Filter from useChat

**Files:**
- Modify: `frontend/src/hooks/useChat.js`

- [ ] **Step 1: Remove the generating step filter**

The registry now handles this with `hidden: true` on the generating renderer. Remove:
```javascript
// REMOVE this block from useChat.js:
if (payload.step === 'generating') {
  return;
}
```

Pipeline steps should flow through to `agenticMsg.handlePipelineStep` unchanged. ReasoningStream will filter hidden steps during rendering.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useChat.js
git commit -m "refactor: remove generating filter — handled by step registry"
```

---

### Task 6: Add reasoning_steps to AgentDefinition (Backend)

**Files:**
- Modify: `ai/agents.py`
- Modify: `shared/config/subagentRegistry.ts`

- [ ] **Step 1: Add reasoning_steps field**

```python
@dataclass
class AgentDefinition:
    # ... existing fields ...

    # Reasoning display — declares which pipeline steps this agent emits
    # Each entry: {'id': 'step_name', 'label': 'Display Name', 'activeTitle': '...'}
    # Frontend uses this to register agent-specific step renderers
    reasoning_steps: list = field(default_factory=list)
```

- [ ] **Step 2: Define Tutor's reasoning steps**

```python
register_agent(AgentDefinition(
    name='tutor',
    # ... existing fields ...
    reasoning_steps=[
        {'id': 'sql_search', 'label': 'Keyword-Suche'},
        {'id': 'semantic_search', 'label': 'Semantische Suche'},
        {'id': 'merge', 'label': 'Zusammenführung'},
    ],
))
```

- [ ] **Step 3: Define Research agent's reasoning steps (example)**

```python
register_agent(AgentDefinition(
    name='research',
    # ... existing fields ...
    reasoning_steps=[
        {'id': 'web_search', 'label': 'Web-Recherche'},
        {'id': 'summarize', 'label': 'Zusammenfassung'},
    ],
))
```

- [ ] **Step 4: Pass reasoning_steps to frontend registry**

In `get_registry_for_frontend()`, include `reasoning_steps` in the JSON sent to JS.

- [ ] **Step 5: Commit**

```bash
git add ai/agents.py shared/config/subagentRegistry.ts
git commit -m "feat(agents): add reasoning_steps field to AgentDefinition"
```

---

### Task 7: Fix v2 Message Transition (Single DOM Position)

**Files:**
- Modify: `frontend/src/App.jsx`

This task finalizes the single-render-path approach that was partially implemented.

- [ ] **Step 1: Ensure v2 messages (with orchestration) render at ONE position**

The unified v2 renderer at the bottom of the interaction container handles BOTH live and saved states:
- Live: uses `chatHook.currentMessage`
- Buffered: uses `lastLiveMsgRef.current` during transition
- Saved: uses `nextMsg` with `orchestration`
- v1 messages (without orchestration): rendered by the existing `nextMsg` block above

- [ ] **Step 2: Verify no double-rendering**

The `nextMsg` v1 block must exclude v2 messages: `!nextMsg.orchestration`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "fix: single DOM position for v2 messages prevents transition flicker"
```

---

### Task 8: Clean Up — Delete ThoughtStream

**Files:**
- Delete: `frontend/src/components/ThoughtStream.tsx` (after all references removed)
- Modify: Any remaining imports

- [ ] **Step 1: Search for remaining ThoughtStream imports**

```bash
grep -rn "ThoughtStream" frontend/src/ --include="*.tsx" --include="*.jsx" --include="*.ts"
```

- [ ] **Step 2: Replace remaining references**

Any remaining usage should use ReasoningStream:
- `ChatMessage.jsx` — router variant (lines 1851-1859)
- `ComponentViewer.jsx` — has ~5 ThoughtStream usages in the demo sections
- `App.jsx` — any remaining v1 fallback paths

- [ ] **Step 3: Delete ThoughtStream.tsx**

- [ ] **Step 4: Final build + test**

```bash
cd frontend && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove ThoughtStream — fully replaced by ReasoningStream"
```

---

## How to Add Reasoning Steps for a New Agent

After this refactoring, adding custom reasoning to the Research agent requires:

**1. Backend** (`ai/agents.py`): Declare steps
```python
reasoning_steps=[
    {'id': 'web_search', 'label': 'Web-Recherche'},
    {'id': 'analyze_sources', 'label': 'Quellenanalyse'},
]
```

**2. Backend** (agent's `run_research.py`): Emit steps
```python
emit_step('web_search', 'active', {'query': 'proteoglycans structure'})
# ... do work ...
emit_step('web_search', 'done', {'results_count': 5, 'query': 'proteoglycans structure'})
```

**3. Frontend** (optional — for custom rendering): Register renderer
```typescript
registerStepRenderer({
  id: 'web_search',
  label: 'Web-Recherche',
  activeTitle: 'Suche im Web...',
  doneLabel: (data) => `${data.results_count} Ergebnisse`,
  renderContent: ({ data, isDone }) => isDone ? <WebResultsList data={data} /> : null,
});
```

If no custom renderer is registered, the fallback renderer shows the step with its label — no crash, no missing UI.

---

## Regression Test Checklist

After all tasks complete, verify:

- [ ] **Tutor live message**: Orchestrierung collapses smooth → Tutor cell shows loading shimmer → sql_search appears with query chips and hit counts → semantic_search with scores → merge with balance bar → sources carousel → skeleton → text streams
- [ ] **Tutor saved message**: ThoughtStream starts collapsed ("3 Schritte · 10 Quellen"), expands on click, all steps + sources visible
- [ ] **No flicker**: Orchestrierung does NOT disappear/reappear during live→saved transition
- [ ] **800ms timing**: Each step is visible for at least 800ms before the next one appears
- [ ] **Skeleton timing**: Skeleton appears ONLY after all visible displaySteps are done (not raw pipelineSteps)
- [ ] **Router variant**: Collapses immediately after orchestrating step completes
- [ ] **Fallback**: Send an unknown step type from backend → renders with generic label, no crash
- [ ] **ComponentViewer**: All ThoughtStream demo sections work with ReasoningStream
- [ ] **Build**: `npm run build` succeeds with no warnings
- [ ] **v1 legacy messages**: Old saved messages without `orchestration` field still render correctly
