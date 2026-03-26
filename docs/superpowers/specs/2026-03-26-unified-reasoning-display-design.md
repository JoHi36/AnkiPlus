# Unified Reasoning Display — Design Spec

**Date:** 2026-03-26
**Status:** Draft
**Replaces:** Current ReasoningStream + scattered pipeline state in useChat/useSmartSearch/useFreeChat

---

## Problem Statement

The current reasoning display system has five structural problems:

1. **Four separate state locations** — `useChat.js`, `useAgenticMessage.js`, `useSmartSearch.js`, and `useFreeChat.js` each manage pipeline steps independently with different logic. Fixes must be applied in multiple places.
2. **800ms fixed queue delay causes race conditions** — Steps are queued with 800ms minimum intervals. With 4 steps, the artificial delay (3.2s) exceeds actual backend latency (~400ms for search). Text arrives while steps are still queued, causing collapse/queue conflicts and visual flickering.
3. **No reusable drop-in component** — Each integration point (session chat, smart search, streaming messages) builds its own ReasoningStream wiring with ~50 lines of boilerplate.
4. **No multi-stream support** — The system assumes one active reasoning process at a time. Parallel processes (e.g., keyword definition lookup while chat is streaming) would collide.
5. **Orchestration and agent steps are mixed** — All steps arrive in a flat array. The router/agent split happens in rendering, not in state. No agent-ID association for multi-agent scenarios.

## Design Goals

1. **One component, everywhere** — A single `<ReasoningDisplay>` that works in session chat, smart search, tooltips, input docks, and any future context.
2. **Zero wiring** — Integration is one JSX line. No state variables, no event handlers, no collapse logic at the integration site.
3. **Stable timing** — Adaptive pacing that respects real backend speed instead of fighting it.
4. **Multi-stream** — Multiple independent reasoning processes can run concurrently.
5. **Agent-agnostic** — Any agent can emit steps. Custom renderers are optional (fallback exists). New agents need zero UI code.

## Architecture Overview

Three layers, each with a single responsibility:

```
┌─────────────────────────────────────────────────┐
│  ReasoningDisplay (Component)                   │
│  Props: streamId OR steps, mode (full|compact)  │
│  Renders steps via StepRegistry                 │
├─────────────────────────────────────────────────┤
│  useReasoningStream (Hook)                      │
│  Adaptive pacing, collapse logic, phase state   │
├─────────────────────────────────────────────────┤
│  ReasoningStore (Context + Reducer)             │
│  Central state for all active streams           │
│  Single dispatch point from ankiReceive         │
└─────────────────────────────────────────────────┘
```

The existing **StepRegistry** (`stepRegistry.ts`) and **step renderers** (`defaultRenderers.tsx`) remain unchanged — they are already well-designed.

---

## Layer 1: ReasoningStore

A React Context + `useReducer` that holds all active reasoning streams. Follows the existing `SessionContext.jsx` pattern.

### Data Model

```typescript
// reasoning/store/types.ts

/** Stream phases — lifecycle of a reasoning process */
export type StreamPhase = 'accumulating' | 'generating' | 'complete';

/** A single reasoning stream (one per request/process) */
export interface ReasoningStreamState {
  streamId: string;
  phase: StreamPhase;
  steps: ReasoningStep[];          // Raw steps from backend
  agentName?: string;              // "Tutor", "Research", etc.
  agentColor?: string;             // Agent brand color
  citations?: Record<string, any>;
  createdAt: number;               // Stream creation time
  completedAt?: number;            // Set when phase → 'complete', used for cleanup timing
}

/** Global store state — plain object for React immutability patterns */
export interface ReasoningStoreState {
  streams: Record<string, ReasoningStreamState>;
}
```

### Actions

```typescript
// reasoning/store/actions.ts

type ReasoningAction =
  // A step event arrived (from backend OR synthetic/client-side)
  | { type: 'STEP'; streamId: string; step: string; status: 'active' | 'done' | 'error'; data?: Record<string, any>; timestamp?: number }
  // Phase transition (accumulating → generating → complete)
  | { type: 'PHASE'; streamId: string; phase: StreamPhase }
  // Citations arrived for a stream
  | { type: 'CITATIONS'; streamId: string; citations: Record<string, any> }
  // Set agent metadata (name, color)
  | { type: 'AGENT_META'; streamId: string; agentName?: string; agentColor?: string }
  // Remove completed stream (after idle timeout)
  | { type: 'CLEANUP'; streamId: string }
  // Reset a stream (new request with same streamId)
  | { type: 'RESET'; streamId: string };
```

### Reducer Logic

```typescript
// reasoning/store/reducer.ts

function createStream(streamId: string): ReasoningStreamState {
  return { streamId, phase: 'accumulating', steps: [], createdAt: Date.now() };
}

function reasoningReducer(state: ReasoningStoreState, action: ReasoningAction): ReasoningStoreState {
  switch (action.type) {
    case 'STEP': {
      const stream = state.streams[action.streamId] || createStream(action.streamId);
      const existingIdx = stream.steps.findIndex(s => s.step === action.step);
      const newStep: ReasoningStep = {
        step: action.step,
        status: action.status,
        data: action.data || {},
        timestamp: action.timestamp || Date.now(),
      };

      const updatedSteps = existingIdx >= 0
        ? stream.steps.map((s, i) => i === existingIdx ? { ...s, status: newStep.status, data: newStep.data } : s)
        : [...stream.steps, newStep];

      // Auto-detect phase transitions
      let phase = stream.phase;
      let completedAt = stream.completedAt;
      if (action.step === 'generating' && action.status === 'active') {
        phase = 'generating';
      }
      // Auto-complete: if ALL steps are 'done' and no 'generating' step exists,
      // this is an orchestration-style stream — mark complete immediately
      if (updatedSteps.length > 0 &&
          updatedSteps.every(s => s.status === 'done') &&
          !updatedSteps.some(s => s.step === 'generating')) {
        phase = 'complete';
        completedAt = Date.now();
      }

      return {
        streams: { ...state.streams, [action.streamId]: { ...stream, steps: updatedSteps, phase, completedAt } },
      };
    }

    case 'PHASE': {
      const stream = state.streams[action.streamId];
      if (!stream) return state;
      const completedAt = action.phase === 'complete' ? Date.now() : stream.completedAt;
      return {
        streams: { ...state.streams, [action.streamId]: { ...stream, phase: action.phase, completedAt } },
      };
    }

    case 'CITATIONS': {
      const stream = state.streams[action.streamId];
      if (!stream) return state;
      return {
        streams: { ...state.streams, [action.streamId]: { ...stream, citations: action.citations } },
      };
    }

    case 'AGENT_META': {
      const stream = state.streams[action.streamId];
      if (!stream) return state;
      return {
        streams: {
          ...state.streams,
          [action.streamId]: { ...stream, agentName: action.agentName, agentColor: action.agentColor },
        },
      };
    }

    case 'CLEANUP': {
      const { [action.streamId]: _, ...rest } = state.streams;
      return { streams: rest };
    }

    case 'RESET': {
      return {
        streams: { ...state.streams, [action.streamId]: createStream(action.streamId) },
      };
    }
  }
}
```

### Context Provider

```typescript
// reasoning/store/ReasoningProvider.tsx

const ReasoningContext = createContext<{
  state: ReasoningStoreState;
  dispatch: React.Dispatch<ReasoningAction>;
} | null>(null);

export function ReasoningProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reasoningReducer, { streams: {} });
  const stateRef = useRef(state);
  stateRef.current = state;

  // Cleanup completed streams after 10s of completion.
  // Uses a ref to avoid recreating the interval on every state change.
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      for (const [id, stream] of Object.entries(stateRef.current.streams)) {
        if (stream.phase === 'complete' && stream.completedAt && now - stream.completedAt > 10_000) {
          dispatch({ type: 'CLEANUP', streamId: id });
        }
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []); // Empty deps — uses ref for latest state

  return (
    <ReasoningContext.Provider value={{ state, dispatch }}>
      {children}
    </ReasoningContext.Provider>
  );
}

export function useReasoningStore() {
  const ctx = useContext(ReasoningContext);
  if (!ctx) throw new Error('useReasoningStore must be used within ReasoningProvider');
  return ctx;
}
```

### Event Routing (Single Dispatch Point)

In `App.jsx`, replace the current scattered pipeline handling with one dispatch:

```javascript
// In handleAnkiReceive or wherever pipeline_step events arrive:
if (payload.type === 'pipeline_step') {
  const streamId = payload.requestId || payload.streamId;
  reasoningDispatch({ type: 'STEP', streamId, step: payload.step, status: payload.status, data: payload.data });

  // Auto-detect agent metadata from orchestrating step
  if (payload.step === 'orchestrating' && payload.data?.retrieval_mode) {
    const rm = payload.data.retrieval_mode;
    if (rm.startsWith('agent:') || rm.startsWith('subagent:')) {
      const agentName = rm.split(':')[1];
      reasoningDispatch({ type: 'AGENT_META', streamId, agentName });
    }
  }
}
```

**Search pipeline routing:** Search requests use `requestId` prefixed with `search_`. The `streamId` convention maps naturally:

```javascript
// Chat request → streamId = requestId (e.g., "req-abc-123")
// Search request → streamId = requestId (e.g., "search_abc-123")
// Keyword definition → streamId = "def-{term}"
// MC generation → streamId = "mc-{cardId}"
```

Components subscribe by `streamId` — no filtering logic needed. `SearchSidebar` uses `<ReasoningDisplay streamId={searchRequestId}>`, chat uses `<ReasoningDisplay streamId={chatRequestId}>`. The store doesn't route — it just stores. Consumers pick their stream.

**Synthetic events (client-side orchestrating):** For `@Subagent` routing, the caller dispatches to the store with an explicit timing delay:

```javascript
// Synthetic orchestrating — the 700ms delay between active → done is managed by the caller
reasoningDispatch({ type: 'STEP', streamId, step: 'orchestrating', status: 'active', data: { ... } });
setTimeout(() => {
  reasoningDispatch({ type: 'STEP', streamId, step: 'orchestrating', status: 'done', data: { ... } });
}, 700);
```

This replaces:
- `updatePipelineSteps()` in `useChat.js`
- `window.dispatchEvent(new CustomEvent('graph.pipelineStep', ...))` in `App.jsx`
- `onPipelineStep()` listener in `useSmartSearch.js`
- `handlePipelineStep()` in `useAgenticMessage.js`

### Integration with useAgenticMessage (v2 Messages)

The v2 agentic message system (`useAgenticMessage.js`) currently tracks `pipelineSteps` per agent cell. With the ReasoningStore, this changes:

**Before:** `useAgenticMessage.handlePipelineStep` receives events, routes them to the correct cell by `payload.agent`, and stores steps in `cell.pipelineSteps`.

**After:** `useAgenticMessage` no longer tracks pipeline steps. Instead:

1. App.jsx dispatches ALL pipeline events to the ReasoningStore (single dispatch point).
2. Each agent cell knows its `streamId` (e.g., `agent-{requestId}` or `{agentName}-{requestId}`).
3. When `useAgenticMessage` creates an agent cell, it records the cell's `streamId`.
4. `ChatMessage.jsx` renders `<ReasoningDisplay streamId={cell.streamId}>` inside each `AgenticCell`.
5. For saved messages, `ChatMessage.jsx` renders `<ReasoningDisplay steps={cell.pipeline_data}>`.

The `handlePipelineStep` function in `useAgenticMessage` is removed entirely. The cell's `pipelineSteps` array is removed from the cell data structure. Pipeline state lives in one place: the ReasoningStore.

**streamId convention for v2 cells:**
```javascript
// Orchestration: `router-{requestId}`
// Agent cell:    `{agentName}-{requestId}` (e.g., "tutor-req-abc-123")
```

The backend already sends `payload.agent` (or derives it from `retrieval_mode`). App.jsx uses this to construct the `streamId`:

```javascript
if (payload.type === 'pipeline_step') {
  const agentPrefix = payload.data?.agent || payload.agent || '';
  const requestId = payload.requestId;

  // Orchestration steps → router stream
  if (payload.step === 'orchestrating' || payload.step === 'router') {
    reasoningDispatch({ type: 'STEP', streamId: `router-${requestId}`, ... });
  }
  // Agent-internal steps → agent stream
  else {
    const streamId = agentPrefix ? `${agentPrefix}-${requestId}` : requestId;
    reasoningDispatch({ type: 'STEP', streamId, ... });
  }
}
```

---

## Layer 2: useReasoningStream Hook

Consumes a single stream from the store and handles all timing + collapse logic.

### Interface

```typescript
// reasoning/useReasoningStream.ts

interface UseReasoningStreamOptions {
  streamId?: string;                    // Live stream — read from store
  steps?: ReasoningStep[];              // Static steps — saved messages
  mode?: 'full' | 'compact';           // Display mode (affects collapse behavior)
  hasOutput?: boolean;                  // True when text/output arrived
}

interface UseReasoningStreamResult {
  displaySteps: DisplayStep[];          // Paced steps ready for rendering
  phase: StreamPhase;                   // Current stream phase
  isCollapsed: boolean;                 // Whether the display is collapsed
  toggleCollapse: () => void;           // User toggle
  agentName?: string;
  agentColor?: string;
  citations?: Record<string, any>;
  hasContent: boolean;                  // True if there's anything to show
}
```

### Adaptive Pacing

Replaces the 800ms fixed queue. The core idea: steps appear with a short minimum visibility (200ms), but the real wait happens naturally at the `generating` phase.

```typescript
const STEP_MIN_VISIBILITY = 200;  // ms — minimum time a step is visible before next appears

function useAdaptivePacing(rawSteps: ReasoningStep[], isLive: boolean): DisplayStep[] {
  const [displaySteps, setDisplaySteps] = useState<DisplayStep[]>([]);
  const queueRef = useRef<ReasoningStep[]>([]);
  const lastShowRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const knownRef = useRef(new Set<string>());

  useEffect(() => {
    if (!isLive) {
      // Saved messages: show all instantly
      setDisplaySteps(rawSteps.map(s => ({ ...s, visibleSince: Date.now() })));
      return;
    }

    // Update existing steps (status/data changes)
    setDisplaySteps(prev => {
      let changed = false;
      const updated = prev.map(ds => {
        const source = rawSteps.find(s => s.step === ds.step);
        if (!source) return ds;
        if (source.status !== ds.status || JSON.stringify(source.data) !== JSON.stringify(ds.data)) {
          changed = true;
          return { ...ds, status: source.status, data: source.data || ds.data };
        }
        return ds;
      });
      return changed ? updated : prev;
    });

    // Queue new steps
    for (const s of rawSteps) {
      if (!knownRef.current.has(s.step)) {
        knownRef.current.add(s.step);
        queueRef.current.push(s);
      }
    }

    // Flush with adaptive timing
    flushQueue();
  }, [rawSteps, isLive]);

  const flushQueue = useCallback(() => {
    if (queueRef.current.length === 0 || timerRef.current) return;
    const elapsed = Date.now() - lastShowRef.current;
    const delay = Math.max(0, STEP_MIN_VISIBILITY - elapsed);

    const showNext = () => {
      if (queueRef.current.length === 0) return;
      const next = queueRef.current.shift()!;
      lastShowRef.current = Date.now();
      setDisplaySteps(prev => [...prev, { ...next, visibleSince: Date.now() }]);
      if (queueRef.current.length > 0) {
        timerRef.current = setTimeout(() => { timerRef.current = null; showNext(); }, STEP_MIN_VISIBILITY);
      }
    };

    if (delay === 0) showNext();
    else {
      timerRef.current = setTimeout(() => { timerRef.current = null; showNext(); }, delay);
    }
  }, []); // Stable — only references refs and setDisplaySteps (both stable)

  // Cleanup
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return displaySteps;
}
```

### Collapse Logic

Phase-driven instead of step-status-aggregation:

```typescript
// Inside useReasoningStream:

// Orchestration streams (no output): collapse when phase = 'complete'
// Agent streams (produce output): collapse when hasOutput = true OR phase = 'generating'

const isOrchestration = !stream?.steps.some(s =>
  s.step !== 'orchestrating' && s.step !== 'router'
);

useEffect(() => {
  if (userExpandedRef.current) return;

  if (isOrchestration) {
    // Orchestration: collapse when all steps done
    if (phase === 'complete' && !isCollapsed) setIsCollapsed(true);
  } else {
    // Agent: collapse when output starts
    if (hasOutput && !isCollapsed) setIsCollapsed(true);
    // Agent: collapse when generating starts (skeleton shows)
    if (phase === 'generating' && !isCollapsed) setIsCollapsed(true);
  }
}, [phase, hasOutput, isCollapsed, isOrchestration]);
```

### Stream Reset

When a new request starts with the same `streamId`, the store dispatches `RESET`. The hook detects the generation change and clears its internal pacing state:

```typescript
const prevPhaseRef = useRef(phase);
useEffect(() => {
  if (phase === 'accumulating' && prevPhaseRef.current === 'complete') {
    // New stream started — reset pacing
    knownRef.current.clear();
    queueRef.current = [];
    setDisplaySteps([]);
    setIsCollapsed(false);
    userExpandedRef.current = false;
  }
  prevPhaseRef.current = phase;
}, [phase]);
```

---

## Layer 3: ReasoningDisplay Component

A single drop-in component that works everywhere.

### Props

```typescript
// reasoning/ReasoningDisplay.tsx

export interface ReasoningDisplayProps {
  // Data source (one of these two):
  streamId?: string;                    // Live — reads from ReasoningStore
  steps?: ReasoningStep[];              // Static — saved messages

  // Display options:
  mode?: 'full' | 'compact';           // full = step list, compact = one-at-a-time
  hasOutput?: boolean;                  // Signals that output/text has arrived (triggers collapse)

  // Optional overrides:
  agentColor?: string;                  // Override agent color
  label?: string;                       // Override collapsed label (default: "Orchestrierung" or "N Schritte")

  // Callbacks:
  bridge?: any;                         // For SourcesCarousel preview
  onPreviewCard?: (citation: any) => void;
}
```

### Usage Examples

```jsx
// Session chat — orchestration (always first)
<ReasoningDisplay streamId={`router-${requestId}`} mode="full" />

// Session chat — agent reasoning
<ReasoningDisplay streamId={`agent-${requestId}`} mode="full" hasOutput={hasText} />

// Smart Search sidebar — same component, same behavior
<ReasoningDisplay streamId={`search-${searchId}`} mode="full" hasOutput={!!answer} />

// Keyword definition popup — compact
<ReasoningDisplay streamId={`def-${term}`} mode="compact" />

// MC generation in input dock — compact
<ReasoningDisplay streamId={`mc-${cardId}`} mode="compact" />

// Saved message — static steps, no live stream
<ReasoningDisplay steps={msg.pipeline_data} mode="full" />
```

### Rendering Logic

```typescript
export default function ReasoningDisplay({
  streamId,
  steps: staticSteps,
  mode = 'full',
  hasOutput = false,
  agentColor: colorOverride,
  label,
  bridge,
  onPreviewCard,
}: ReasoningDisplayProps) {
  // Get stream data — either from store (live) or from props (static)
  const {
    displaySteps,
    phase,
    isCollapsed,
    toggleCollapse,
    agentName,
    agentColor: storeColor,
    citations,
    hasContent,
  } = useReasoningStream({
    streamId,
    steps: staticSteps,
    mode,
    hasOutput,
  });

  const agentColor = colorOverride || storeColor;

  if (!hasContent) return null;

  if (mode === 'compact') {
    return <CompactReasoningDisplay /* ... */ />;
  }

  return <FullReasoningDisplay /* ... */ />;
}
```

### Full Mode

Behaves like the current ReasoningStream — step list with expand/collapse, checkmarks, step-specific renderers. Reuses `PhaseRow`, `ExtendingLine`, `ChevronRight`/`ChevronDown` from the current implementation. Text skeleton appears when `phase === 'generating'` and `!hasOutput`.

### Compact Mode

Shows one step at a time with crossfade animation:

```typescript
function CompactReasoningDisplay({ displaySteps, phase, agentColor }: CompactProps) {
  // Show the latest step (last in array)
  const currentStep = displaySteps[displaySteps.length - 1];
  const completedCount = displaySteps.filter(s => s.status === 'done').length;
  const totalCount = displaySteps.length;

  if (!currentStep) return null;

  const renderer = getStepRenderer(currentStep.step) || getFallbackRenderer(currentStep.step);
  const isActive = currentStep.status === 'active';
  const title = isActive
    ? (typeof renderer.activeTitle === 'function' ? renderer.activeTitle(currentStep.data) : renderer.activeTitle)
    : renderer.doneLabel(currentStep.data, currentStep.status);

  return (
    <div style={{ /* compact container styles */ }}>
      {/* Step counter: "2/4" */}
      <span style={{ fontSize: 11, color: 'var(--ds-text-tertiary)', fontFamily: 'monospace' }}>
        {completedCount}/{totalCount}
      </span>

      {/* Current step — crossfade via key */}
      <div key={currentStep.step} style={{ animation: 'ts-phaseReveal 0.2s ease-out both' }}>
        {/* Dot + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <PulsingDot isActive={isActive} color={agentColor} />
          <span style={{ fontSize: 12, color: 'var(--ds-text-secondary)' }}>{title}</span>
        </div>
        {/* Compact mode: title + dot only, NO renderContent.
            This prevents tall renderers (SemanticChunks, SourcesCarousel)
            from overflowing small containers like tooltips/input docks. */}
      </div>
    </div>
  );
}
```

---

## Orchestration Model

The orchestration step is modeled as a **stream without output**. It has its own `streamId` (e.g., `router-{requestId}`) separate from the agent's stream.

### Lifecycle

1. **Request starts** → Backend emits `orchestrating` step with `status: 'active'`
2. **Router skeleton** shows (shimmer animation inside the step)
3. **Router decides** → Backend emits `orchestrating` step with `status: 'done'` + data (routing method, agent name, context)
4. **Chips appear**: `Routing Auto` · `Agent Tutor` · `Kontext Karte`
5. **Auto-collapse** → The orchestration stream's phase goes to `complete` (no `generating` phase, since there's no output)
6. **Agent stream starts** below — separate `streamId`, separate `<ReasoningDisplay>`

### Why a Separate Stream

- Clean lifecycle: orchestration completes before agent starts. No shared state.
- The orchestration collapse is independent of the agent's collapse.
- For sequential handoffs (Agent A → Agent B), the router can run again with a new orchestrating step while the previous agent's stream is still collapsing.

### Phase Transitions for Orchestration

```
STEP(orchestrating, active) → phase: accumulating (skeleton shows)
STEP(orchestrating, done)   → phase: complete (chips show, auto-collapse)
```

No `generating` phase needed. The absence of a `generating` step is what distinguishes orchestration streams from agent streams. The `useReasoningStream` hook detects this automatically.

---

## Adaptive Pacing — Detailed Timing Model

### Current Problem (800ms Fixed Queue)

```
Time:   0ms     200ms    400ms    800ms    1600ms   2400ms   3200ms
Backend: sql✓    sem✓     merge✓   gen→     ─────────text──→
Frontend:sql─────────────────────sem──────────────merge──────→
         ←—— 800ms queue ——→    ←—— 800ms queue ——→
                                          ↑ TEXT ARRIVES HERE
                                          ↑ but steps still in queue!
```

### New Model (200ms Adaptive)

```
Time:   0ms   200ms  400ms  600ms    1600ms   2400ms
Backend: sql✓  sem✓   merge✓ gen→     ─────────text──→
Frontend:sql   sem    merge  gen···shimmer··→  text!
         200ms 200ms  200ms  (waits for backend)
                             ↑ ALL STEPS DONE
                             ↑ clean transition to skeleton
```

### Key Constants

```typescript
const STEP_MIN_VISIBILITY = 200;   // Minimum time (ms) between step reveals
// No MAX — if backend is slow, the current step shows its active state naturally
```

### Why 200ms

- **Perceptible**: Human visual attention needs ~150ms to register a new element
- **Not sluggish**: 4 steps complete in 600ms (vs. 3200ms with 800ms)
- **No debt**: Steps finish revealing before LLM text typically arrives (~1-2s)

---

## Backend Changes

Minimal. The Python backend (`ai/handler.py`) already emits well-structured events. Two small additions:

### 1. Add `streamId` to Pipeline Events

Currently, `pipeline_signal` emits `(requestId, step, status, data)`. The `requestId` already serves as stream identifier. For parallel processes (e.g., keyword lookup), use a prefixed ID:

```python
# In the keyword definition handler (future):
self._emit_pipeline_step('card_search', 'active', data=None)
# The requestId for this process would be e.g. "def-{term}" instead of the chat requestId
```

No change needed for existing chat/search flows — `requestId` already works as `streamId`.

### 2. Explicit `complete` Signal

Add a `pipeline_complete` event type to signal end of a stream:

```python
def _emit_pipeline_complete(self):
    """Signal that all pipeline steps for this request are done."""
    callback = getattr(self, '_pipeline_signal_callback', None)
    if callback:
        callback('__complete', 'done', None)
```

Called after the last pipeline step and before text streaming begins. This triggers the `generating` → `complete` phase transition in the frontend.

**For orchestration streams** (no generating step): The reducer auto-detects completion — when all steps in a stream are `done` and no `generating` step exists, phase transitions to `complete` automatically. No explicit signal needed.

**For agent streams** (with generating step): The `text_chunk` event from streaming already signals that generating has begun. App.jsx dispatches `{ type: 'PHASE', streamId, phase: 'generating' }` on first `text_chunk`, and `{ type: 'PHASE', streamId, phase: 'complete' }` when streaming ends. This reuses existing events — no new backend signal needed for v1.

---

## Step Registry — No Changes

The existing registry (`stepRegistry.ts`) is well-designed and stays as-is:

- `registerStepRenderer(def)` — register custom renderers
- `getStepRenderer(stepId)` — lookup by step ID
- `getFallbackRenderer(stepId)` — auto-generates a basic renderer for unknown steps

Step renderers in `defaultRenderers.tsx` (RouterDetails, SqlTags, SemanticChunks, MergeBar, SourcesCarousel trigger) remain unchanged. They already receive `{ data, isDone, animate, agentColor }` — exactly what ReasoningDisplay will pass.

### Future: Agent-Specific Renderers

New agents register their own renderers at import time:

```typescript
// reasoning/renderers/researchRenderers.ts
import { registerStepRenderer } from '../stepRegistry';

registerStepRenderer({
  id: 'web_search',
  label: 'Web-Suche',
  activeTitle: 'Durchsuche das Web...',
  doneLabel: (data) => `${data.total_results || 0} Ergebnisse`,
  renderContent: ({ data, isDone }) => (
    <div>
      {data.urls?.map((url, i) => <UrlChip key={i} url={url} />)}
    </div>
  ),
});
```

Imported once at app startup. The ReasoningDisplay picks them up automatically.

---

## Migration Plan

### What Gets Replaced

| Current | New |
|---------|-----|
| `pipelineSteps` state in `useChat.js` | ReasoningStore |
| `pipelineSteps` per cell in `useAgenticMessage.js` | ReasoningStore (per `streamId`) |
| `pipelineSteps` state in `useSmartSearch.js` | ReasoningStore |
| `window.dispatchEvent('graph.pipelineStep')` in App.jsx | Single `dispatch()` to store |
| `handlePipelineStep()` in `useAgenticMessage.js` | Removed — store handles routing |
| `useAccumulatingPipeline()` in ReasoningStream.tsx | `useAdaptivePacing()` in useReasoningStream |
| Collapse logic in ReasoningStream.tsx | Phase-driven collapse in useReasoningStream |
| Two ReasoningStream instances in ChatMessage.jsx | Two `<ReasoningDisplay>` (router + agent) |
| Two ReasoningStream instances in SearchSidebar.jsx | Two `<ReasoningDisplay>` (router + agent) |
| `pipelineGeneration` counter | Store `RESET` action |

### What Stays

| Stays | Why |
|-------|-----|
| `stepRegistry.ts` | Already well-designed |
| `defaultRenderers.tsx` | All renderers stay, just consumed by new component |
| `types.ts` (ReasoningStep, StepRendererDef) | Types are correct, extended with StreamPhase |
| `PhaseRow` sub-component | Extracted into ReasoningDisplay, same logic |
| `ExtendingLine`, Chevrons | Visual elements stay |
| Backend `_emit_pipeline_step()` | Already correct event format |

### New Files

```
frontend/src/reasoning/
├── store/
│   ├── types.ts              # StreamPhase, ReasoningStreamState, ReasoningStoreState
│   ├── actions.ts            # ReasoningAction type
│   ├── reducer.ts            # reasoningReducer
│   └── ReasoningProvider.tsx  # Context + Provider + useReasoningStore
├── useReasoningStream.ts      # Hook: adaptive pacing + collapse + phase
├── ReasoningDisplay.tsx       # Drop-in component (replaces ReasoningStream.tsx)
├── FullReasoningDisplay.tsx   # Full mode renderer (step list)
├── CompactReasoningDisplay.tsx # Compact mode renderer (one-at-a-time)
├── stepRegistry.ts            # Unchanged
├── defaultRenderers.tsx       # Unchanged
└── types.ts                   # Extended with new types
```

### Deleted After Migration

- `ReasoningStream.tsx` — fully replaced by `ReasoningDisplay.tsx`
- Pipeline state variables in `useChat.js` (`pipelineSteps`, `pipelineGeneration`, `currentSteps`)
- `handlePipelineStep()` and per-cell `pipelineSteps` in `useAgenticMessage.js`
- Pipeline state variables in `useSmartSearch.js`
- `graph.pipelineStep` CustomEvent dispatch in App.jsx

---

## Edge Cases

### Saved Messages (Historical Reasoning)

Saved messages have `pipeline_data` stored in the message object. They don't come from the live store.

Solution: `<ReasoningDisplay steps={msg.pipeline_data}>` — the `steps` prop bypasses the store entirely. The hook detects static mode (`!streamId`) and renders instantly without pacing.

### Synthetic Pipeline Events (Client-Side)

For `@Subagent` routing, `useChat.js` currently creates fake orchestrating steps. These continue to work — just dispatch them to the store instead:

```javascript
// Instead of manually creating pipeline steps:
dispatch({ type: 'STEP', streamId, step: 'orchestrating', status: 'active', data: { ... } });
// ...700ms later:
dispatch({ type: 'STEP', streamId, step: 'orchestrating', status: 'done', data: { ... } });
```

### Stream Cleanup

Completed streams are cleaned up 10 seconds after reaching `complete` phase. This is long enough for any late-arriving events but short enough to prevent memory leaks.

### Error States

If a step arrives with `status: 'error'`, it's displayed with the error styling from the existing renderer. The stream does NOT auto-collapse on error — it stays expanded so the user can see what failed.

### Free Chat (Deck-Level)

Currently, Free Chat (`useFreeChat.js`) intentionally shows no reasoning. With the new system, adding reasoning to Free Chat becomes trivial: just add a `<ReasoningDisplay streamId={...}>` — but only when desired.

---

## Resolved Design Decisions

1. **Compact mode shows title + dot only** — no `renderContent`. This prevents tall renderers (SemanticChunks, SourcesCarousel) from overflowing small containers like tooltips and input docks. The step counter ("2/4") provides enough context.

2. **SourcesCarousel stays inside ReasoningDisplay but below the collapsible area.** Sources render in a slot between the collapsed summary and the text/output. They remain visible when steps collapse — the user doesn't need to expand to see them. This keeps the component self-contained while solving the current visibility problem.

---

## Testing Strategy

### Unit Tests (reducer)

Test all action types in `reasoningReducer`:
- `STEP`: new stream creation, step update, step addition, auto-phase detection (`generating` → phase change), auto-complete for orchestration streams (all steps done, no generating)
- `PHASE`: phase transitions, `completedAt` set on `complete`
- `CITATIONS`, `AGENT_META`: metadata updates
- `CLEANUP`: stream removal
- `RESET`: stream re-initialization

### Unit Tests (useAdaptivePacing)

- Static mode: all steps appear instantly, no queue
- Live mode: steps appear with 200ms minimum gap
- Status updates: existing steps update in-place without re-queuing
- Queue flush: multiple rapid steps queue correctly
- Reset: pacing state clears when stream resets

### Integration Tests

- Full flow: dispatch STEP → store update → hook pacing → ReasoningDisplay renders correct step
- Dual-input: `streamId` prop reads from store, `steps` prop renders statically
- Multi-stream: two concurrent streams render independently
- Collapse: orchestration collapses on complete, agent collapses on output

### Existing Test Compatibility

All existing `defaultRenderers.tsx` renderers receive the same `{ data, isDone, animate, agentColor }` interface — no renderer changes needed, no renderer tests needed.
