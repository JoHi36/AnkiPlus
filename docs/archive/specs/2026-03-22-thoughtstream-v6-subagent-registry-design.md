# ThoughtStream v6 + Subagent Registry

**Date:** 2026-03-22
**Status:** Design
**Scope:** ThoughtStream rendering rewrite, subagent registry, pipeline architecture

## Problem

The current ThoughtStream (`useSmartPipeline`) uses 6 interacting refs, a promotion queue, and setTimeout chains to move steps between an "Active Box" and a "Done Stack". This architecture caused repeated bugs: steps flickering, disappearing, race conditions between generation resets and incoming steps. Adding a new subagent (like Plusi) requires code changes in 5+ locations.

## Goals

1. **Flicker-free, smooth pipeline visualization** — no steps disappearing/reappearing
2. **Single source of truth for subagents** — add one registry entry, everything else derives automatically
3. **Extensible for future agents** — same pattern for Plusi, Perplexity, or any future subagent
4. **Simpler implementation** — fewer refs, no promotion queue, no container-shifting

## Non-Goals

- Streaming text rendering changes (StreamingChatMessage stays as-is)
- Backend AI handler refactoring (beyond router prompt injection)
- New subagent implementations (only the framework)

---

## Design

### 1. Subagent Registry (Python)

**Location:** `ai/subagents.py` (new file)

Integrates with the existing `ToolRegistry` pattern from `ai/tools.py`. Each subagent is a dataclass entry:

```python
@dataclass
class SubagentDefinition:
    name: str                  # Unique ID: 'plusi', 'perplexity'
    label: str                 # Display name: 'Plusi', 'Perplexity'
    description: str           # For router prompt: "Persoenlicher Lernbegleiter..."
    color: str                 # Hex color for pipeline dot/tags: '#A78BFA'
    enabled_key: str           # Config key to check: 'mascot_enabled'
    pipeline_label: str        # What shows in router done-step: 'Plusi'
    run_module: str            # Module path for lazy import: 'plusi.agent'
    run_function: str          # Function name: 'run_plusi'
    router_hint: str           # When router should delegate to this agent
    on_finished: Optional[Callable] = None  # Main-thread post-processing (mood sync, panel notify, etc.)
    extra_kwargs: dict = field(default_factory=dict)  # Extra kwargs passed to run_fn (e.g., deck_id)

SUBAGENT_REGISTRY: dict[str, SubagentDefinition] = {}

def register_subagent(definition: SubagentDefinition):
    SUBAGENT_REGISTRY[definition.name] = definition

def get_enabled_subagents(config: dict) -> list[SubagentDefinition]:
    return [s for s in SUBAGENT_REGISTRY.values()
            if config.get(s.enabled_key, False)]

def get_router_subagent_prompt(config: dict) -> str:
    enabled = get_enabled_subagents(config)
    if not enabled:
        return ""
    lines = ["Available subagents (use retrieval_mode 'subagent:<name>' ONLY when "
             "exclusively this agent's function is needed, no search required):"]
    for s in enabled:
        lines.append(f"  - subagent:{s.name} -- {s.label}: {s.description}. {s.router_hint}")
    return "\n".join(lines)

def lazy_load_run_fn(agent: SubagentDefinition) -> Callable:
    """Import and return the agent's run function on first use."""
    import importlib
    try:
        # Try relative import (as Anki addon)
        mod = importlib.import_module(f'..{agent.run_module}', package=__package__)
    except (ImportError, ValueError):
        # Fallback: absolute import (standalone/testing)
        mod = importlib.import_module(agent.run_module)
    return getattr(mod, agent.run_function)
```

**Registration:**

```python
def _plusi_on_finished(widget, agent_name, result):
    """Plusi-specific main-thread side effects after run_plusi completes."""
    mood = result.get('mood', 'neutral')
    friendship = result.get('friendship', {})
    # Sync mood to dock
    try:
        from ..plusi.dock import sync_mood
        sync_mood(mood)
    except Exception as e:
        logger.error("plusi dock sync error: %s", e)
    # Sync integrity
    widget._sync_plusi_integrity()
    # Notify panel
    try:
        from ..plusi.panel import notify_new_diary_entry, update_panel_mood, update_panel_friendship
        if result.get('diary'):
            notify_new_diary_entry()
        update_panel_mood(mood)
        if friendship:
            update_panel_friendship(friendship)
    except Exception as e:
        logger.error("plusi panel notify error: %s", e)
    # Trigger reflect check
    try:
        from .. import check_and_trigger_reflect
        check_and_trigger_reflect()
    except Exception:
        pass

register_subagent(SubagentDefinition(
    name='plusi',
    label='Plusi',
    description='Persoenlicher Lernbegleiter mit Charakter und Gedaechtnis',
    color='#A78BFA',
    enabled_key='mascot_enabled',
    pipeline_label='Plusi',
    run_module='plusi.agent',
    run_function='run_plusi',
    router_hint='Use when user wants casual conversation, emotional support, or explicitly addresses Plusi.',
    on_finished=_plusi_on_finished,
))
```

### 2. Subagent Registry (Frontend)

**Location:** `shared/config/subagentRegistry.ts` (new file)

Mirror of the Python registry, passed to the frontend via bridge on init:

```typescript
export interface SubagentConfig {
  name: string;         // 'plusi'
  label: string;        // 'Plusi'
  color: string;        // '#A78BFA'
  enabled: boolean;     // Runtime: is this agent active?
  pipelineLabel: string; // 'Plusi' — shown in router done-step
}

let registry: Map<string, SubagentConfig> = new Map();

export function getRegistry(): Map<string, SubagentConfig> { return registry; }

export function setRegistry(agents: SubagentConfig[]): void {
  registry = new Map(agents.map(a => [a.name, a]));
}

export function getDirectCallPattern(): RegExp | null {
  const names = [...registry.values()]
    .filter(a => a.enabled)
    .map(a => a.name);
  if (names.length === 0) return null;
  return new RegExp('^@(' + names.join('|') + ')\\b', 'i');
}

export function findAgent(name: string): SubagentConfig | undefined {
  return registry.get(name.toLowerCase());
}
```

**Flow:**

1. On profile load, Python sends registry to JS: `window.ankiReceive({ type: 'subagent_registry', agents: [...] })`
2. Frontend stores in `subagentRegistry.ts`
3. `useChat.handleSend()` uses `getDirectCallPattern()` instead of hardcoded regex
4. ThoughtStream uses agent `color` and `pipelineLabel` for rendering

### 3. Unified Subagent Thread (Python)

**Replace per-agent thread classes with one generic `SubagentThread`:**

```python
class SubagentThread(QThread):
    finished_signal = pyqtSignal(str, dict)   # agent_name, result dict
    error_signal = pyqtSignal(str, str)       # agent_name, error message

    def __init__(self, agent_name, run_fn, text, **kwargs):
        super().__init__()
        self.agent_name = agent_name
        self.run_fn = run_fn
        self.text = text
        self.kwargs = kwargs

    def run(self):
        try:
            result = self.run_fn(situation=self.text, **self.kwargs)
            self.finished_signal.emit(self.agent_name, result)
        except Exception as e:
            logger.exception("SubagentThread[%s] error: %s", self.agent_name, e)
            self.error_signal.emit(self.agent_name, str(e))
```

**Widget handler (replaces _handle_plusi_direct):**

```python
def _handle_subagent_direct(self, agent_name, text, extra=None):
    agent = SUBAGENT_REGISTRY.get(agent_name)
    if not agent or not self.config.get(agent.enabled_key, False):
        return
    run_fn = lazy_load_run_fn(agent)
    # Merge extra kwargs (e.g., deck_id) with agent defaults
    kwargs = {**agent.extra_kwargs, **(extra or {})}
    thread = SubagentThread(agent_name, run_fn, text, **kwargs)
    thread.finished_signal.connect(self._on_subagent_finished)
    thread.error_signal.connect(self._on_subagent_error)
    self._active_subagent_thread = thread
    thread.start()

def _on_subagent_finished(self, agent_name, result):
    """Handle subagent result on main thread — emit to JS + run agent-specific side effects."""
    payload = {
        'type': 'subagent_result',
        'agent_name': agent_name,
        'text': result.get('text', ''),
        'mood': result.get('mood', 'neutral'),
        'meta': result.get('meta', ''),
        'friendship': result.get('friendship', {}),
        'silent': result.get('silent', False),
        'error': result.get('error', False),
    }
    self.web_view.page().runJavaScript(
        f"window.ankiReceive({json.dumps(payload)});"
    )
    # Run agent-specific post-processing (mood sync, panel notify, etc.)
    agent = SUBAGENT_REGISTRY.get(agent_name)
    if agent and agent.on_finished:
        try:
            agent.on_finished(self, agent_name, result)
        except Exception as e:
            logger.error("Subagent[%s] on_finished error: %s", agent_name, e)

def _on_subagent_error(self, agent_name, error_msg):
    """Handle subagent error on main thread."""
    logger.error("Subagent[%s] error: %s", agent_name, error_msg)
    payload = {
        'type': 'subagent_result',
        'agent_name': agent_name,
        'text': '',
        'error': True,
    }
    self.web_view.page().runJavaScript(
        f"window.ankiReceive({json.dumps(payload)});"
    )
```

**Bridge method:** A single `subagentDirect` replaces per-agent methods. Signature:

```python
# In bridge.py
@pyqtSlot(str, str, str)
def subagentDirect(self, agent_name, text, extra_json='{}'):
    """Route @Name messages to the appropriate subagent."""
    extra = json.loads(extra_json) if extra_json else {}
    self.widget._handle_subagent_direct(agent_name, text, extra)
```

**Frontend call:** `bridge.subagentDirect(agentName, cleanText, JSON.stringify({ deck_id: currentDeckId }))`.

**Registry delivery:** On profile load, `getSubagentRegistry` is called by the frontend once:

```python
# In bridge.py
@pyqtSlot(result=str)
def getSubagentRegistry(self):
    """Return enabled subagents as JSON for frontend registry."""
    config = self.widget.config
    enabled = get_enabled_subagents(config)
    agents = [{'name': a.name, 'label': a.label, 'color': a.color,
               'enabled': True, 'pipelineLabel': a.pipeline_label}
              for a in enabled]
    return json.dumps(agents)
```

### 4. Accumulating Pipeline Hook (Frontend)

**Replace `useSmartPipeline` (150+ lines, 6 refs) with `useAccumulatingPipeline` (~60 lines, 1 queue ref):**

```typescript
const MIN_STEP_INTERVAL = 800; // ms between showing new steps

interface DisplayStep {
  step: string;
  status: 'active' | 'done' | 'error';
  data: Record<string, any>;
  visibleSince: number;
}

function useAccumulatingPipeline(
  pipelineSteps: PipelineStep[],
  generation: number
): { displaySteps: DisplayStep[]; isProcessing: boolean } {

  const [displaySteps, setDisplaySteps] = useState<DisplayStep[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const queueRef = useRef<PipelineStep[]>([]);
  const timerRef = useRef<number | null>(null);
  const lastShowTimeRef = useRef(0);
  const prevGenerationRef = useRef(generation);

  // Track which steps are already displayed or queued
  const knownStepsRef = useRef<Set<string>>(new Set());

  // Reset on new generation
  useEffect(() => {
    if (generation !== prevGenerationRef.current) {
      prevGenerationRef.current = generation;
      setDisplaySteps([]);
      setIsProcessing(false);
      queueRef.current = [];
      knownStepsRef.current = new Set();
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      lastShowTimeRef.current = 0;
    }
  }, [generation]);

  // Process incoming pipeline steps
  useEffect(() => {
    if (!pipelineSteps || pipelineSteps.length === 0) return;
    setIsProcessing(true);

    // 1. Update existing displayed steps (status/data changes: active -> done)
    setDisplaySteps(prev => {
      let changed = false;
      const updated = prev.map(ds => {
        const source = pipelineSteps.find(s => s.step === ds.step);
        if (!source) return ds;
        const statusChanged = source.status !== ds.status;
        const dataChanged = source.data && JSON.stringify(source.data) !== JSON.stringify(ds.data);
        if (statusChanged || dataChanged) {
          changed = true;
          return { ...ds, status: source.status, data: source.data || ds.data };
        }
        return ds;
      });
      return changed ? updated : prev;
    });

    // 2. Queue new steps (ref-only, no setState)
    for (const s of pipelineSteps) {
      if (!knownStepsRef.current.has(s.step)) {
        knownStepsRef.current.add(s.step);
        queueRef.current.push(s);
      }
    }

    // 3. Flush queue respecting MIN_STEP_INTERVAL
    flushQueue();
  }, [pipelineSteps]);

  function flushQueue() {
    if (queueRef.current.length === 0 || timerRef.current) return;

    const elapsed = Date.now() - lastShowTimeRef.current;
    const delay = Math.max(0, MIN_STEP_INTERVAL - elapsed);

    if (delay === 0) {
      showNextStep();
    } else {
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        showNextStep();
      }, delay);
    }
  }

  function showNextStep() {
    // Guard: if generation changed while timer was pending, abort
    if (queueRef.current.length === 0) return;
    const next = queueRef.current.shift();
    if (!next) return;

    lastShowTimeRef.current = Date.now();
    setDisplaySteps(prev => [
      ...prev,
      { step: next.step, status: next.status, data: next.data || {}, visibleSince: Date.now() }
    ]);

    if (queueRef.current.length > 0) {
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        showNextStep();
      }, MIN_STEP_INTERVAL);
    }
  }

  // Detect processing end
  useEffect(() => {
    if (displaySteps.length > 0 &&
        queueRef.current.length === 0 &&
        !displaySteps.some(d => d.status === 'active')) {
      const t = setTimeout(() => setIsProcessing(false), 200);
      return () => clearTimeout(t);
    }
  }, [displaySteps]);

  return { displaySteps, isProcessing };
}
```

**Key simplification:** No `activeRef`, `seenRef`, `doneLabelsRef`, `promotionScheduledRef`, `showStartRef`, `pendingRef`. Just one queue and one timer.

### 5. ThoughtStream Rendering (Simplified)

The main component renders one flat list:

```tsx
{displaySteps.map((ds, idx) => (
  <PhaseRow
    key={ds.step}
    step={ds.step}
    data={ds.data}
    status={ds.status}
    isActive={ds.status === 'active'}
    isFirst={idx === 0}
    animate={isStreaming || isProcessing}
    agentColor={agentColor}
  />
))}

{/* Source cards -- show after all pipeline steps done */}
{hasCitations && !displaySteps.some(d => d.status === 'active') && (
  <SourcesCarousel ... />
)}
```

No Active Box. No Done Stack. No container shifting.

### 6. Pipeline Colors from Registry

When a subagent is detected, the agent's `color` from the registry is passed to ThoughtStream:

```tsx
<ThoughtStream
  pipelineSteps={chatHook.pipelineSteps}
  pipelineGeneration={chatHook.pipelineGeneration}
  agentColor={activeAgentColor}  // '#A78BFA' for Plusi, undefined for normal
  ...
/>
```

PhaseRow uses `agentColor` for the active dot and done checkmark, falling back to default colors when `undefined`.

### 7. Router Integration

**`ai/system_prompt.py`** injects subagent info into router prompt:

```python
from ai.subagents import get_router_subagent_prompt

def build_router_prompt(config):
    base_prompt = "..."  # existing router instructions
    subagent_section = get_router_subagent_prompt(config)
    return base_prompt + "\n\n" + subagent_section if subagent_section else base_prompt
```

Router can return `retrieval_mode: 'subagent:plusi'`. The backend detects the `subagent:` prefix and routes to `_handle_subagent_direct` instead of the normal RAG pipeline.

### 8. Unified Frontend Flow

**`useChat.handleSend()` -- simplified:**

```typescript
const directCallPattern = getDirectCallPattern();
const directMatch = directCallPattern?.exec(text);

if (directMatch) {
  const agentName = directMatch[1].toLowerCase();
  const agent = findAgent(agentName);
  if (agent) {
    // Emit synthetic router step with agent color/label
    updatePipelineSteps([{
      step: 'router', status: 'active', data: {}, timestamp: Date.now()
    }]);
    setTimeout(() => {
      updatePipelineSteps(prev => prev.map(s => s.step === 'router' ? {
        ...s, status: 'done',
        data: { search_needed: false, retrieval_mode: 'subagent:' + agentName }
      } : s));
    }, 700);

    bridge.subagentDirect(agentName, cleanText);
    return;
  }
}
```

**`ankiReceive` -- unified result handler:**

```typescript
if (payload.type === 'subagent_result') {
  const agent = findAgent(payload.agent_name);
  // Same handler for ALL subagents
  // ... append message, sync mood if plusi, etc.
}
```

---

## Files Changed

| File | Change |
|---|---|
| `ai/subagents.py` | **NEW** -- SubagentDefinition, SUBAGENT_REGISTRY, registration, router prompt generation |
| `shared/config/subagentRegistry.ts` | **NEW** -- Frontend mirror, @Name pattern builder |
| `shared/components/ThoughtStream.tsx` | **REWRITE** -- Replace useSmartPipeline with useAccumulatingPipeline, simplify main component (~983 to ~750 lines; phase-specific components preserved) |
| `frontend/src/hooks/useChat.js` | **MODIFY** -- Replace hardcoded @Plusi with registry-based detection, unified subagent result handler |
| `frontend/src/App.jsx` | **MODIFY** -- Pass agentColor to ThoughtStream, load registry on init |
| `ui/widget.py` | **MODIFY** -- Replace PlusiDirectThread + _handle_plusi_direct with generic SubagentThread + _handle_subagent_direct |
| `ai/system_prompt.py` | **MODIFY** -- Inject subagent section into router prompt from registry |
| `ui/bridge.py` | **MODIFY** -- Add subagentDirect method, add getSubagentRegistry method |

## Migration

**Atomic deployment required:** Python backend and frontend must be updated together (single Anki restart). The payload type changes from `plusi_direct_result` to `subagent_result` — mixing old/new will silently drop Plusi responses.

- `PlusiDirectThread` replaced by `SubagentThread`
- `_handle_plusi_direct` / `_on_plusi_direct_finished` / `_on_plusi_direct_error` replaced by generic `_handle_subagent_direct` / `_on_subagent_finished` / `_on_subagent_error`
- Plusi-specific side effects (mood sync, panel notify, integrity, reflect) moved to `on_finished` callback in registry
- `useSmartPipeline` replaced by `useAccumulatingPipeline`
- Hardcoded `isPlusiDirect` regex replaced by `getDirectCallPattern()` from registry
- `bridge.plusiDirect(text, deckId)` replaced by `bridge.subagentDirect(agentName, text, extraJson)`

## Animations

All existing animations preserved:
- `ts-phaseReveal` -- step rows fade in
- `ts-dotPulse` -- active step dot pulses
- `ts-shimmerWave` -- router skeleton shimmer
- `ts-pulseIn` -- SQL tag stagger
- `ts-fadeBlurIn` -- semantic chunk blur-in
- `ts-scanGlow` -- semantic chunk scan line

New: `ts-containerFadeIn` only on live (isStreaming) ThoughtStream, not on saved messages.

Unused animations removed: `ts-routerScan`, `ts-routerDotFloat`.

## Testing

- Existing unit tests unaffected (no logic changes in tested modules)
- Manual testing: send normal message, send @Plusi message, verify pipeline steps appear with correct timing and don't flicker
- Edge cases: rapid consecutive messages, backend faster than 800ms per step, late-arriving citations
