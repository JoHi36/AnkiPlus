# Agentic Message System v2 — Spec

## Problem

The current chat message system was designed for simple text streaming and had agent features bolted on incrementally. This creates:

1. **3 parallel rendering paths** (Live-Pipeline in App.jsx, StreamingChatMessage, saved ChatMessage) that race against each other, causing duplicate UI, flicker, and inconsistent state.
2. **Tool markers embedded as text** (`[[TOOL:{...}]]`) requiring fragile regex parsing, prone to batching issues, and impossible to render in correct position reliably.
3. **No first-class agent support** — handoffs, loading states, and multi-agent responses are hacked into a single-text-stream model.
4. **Performance waste** — 5+ regex passes per render, 3 reconciliation paths, and "dead time" gaps where nothing visual happens.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Message structure | Structured object with `agentCells[]` | Eliminates text-marker parsing, enables positional rendering |
| Rendering | Single renderer (ChatMessage.jsx) | Eliminates 3-way duplication bugs entirely |
| Agent results | Structured events, not text chunks | No regex, no batching issues, atomic updates |
| Orchestration | Own element, auto-collapse, preserved | User validated current design, just needs reliability |
| ThoughtStream | Preserved exactly as-is for Tutor | Significant investment, works well, assigned per-agent |
| Visual flow | Progressive, zero dead time | Every second has visual activity; loading states mask API latency |

## Architecture

### 1. Message Data Structure

Every bot message is a structured object with ordered agent cells:

```typescript
interface BotMessage {
  id: string;
  from: 'bot';
  status: 'routing' | 'thinking' | 'streaming' | 'handoff' | 'done';
  createdAt: number;
  sectionId?: string;

  // Orchestration (own visual element, auto-collapses)
  orchestration?: {
    agent: string;        // 'tutor', 'research', etc.
    mode: string;         // 'direkt', 'handoff', etc.
    steps: PipelineStep[];
  };

  // Ordered list of agent cells (each renders as a block)
  agentCells: AgentCell[];
}

interface AgentCell {
  agent: string;          // 'tutor', 'research', 'plusi', 'help'
  status: 'loading' | 'thinking' | 'streaming' | 'done' | 'error';

  // Content (varies by agent)
  text?: string;                  // Markdown text response
  pipelineSteps?: PipelineStep[]; // ThoughtStream steps (Tutor-specific)
  citations?: Record<string, any>;
  sources?: Source[];             // Research sources
  toolUsed?: string;              // 'perplexity', etc.
  toolWidgets?: ToolWidget[];     // Plusi, Cards, Stats, Images

  // Loading state
  loadingHint?: string;

  // Metadata
  stepLabels?: string[];
}
```

### 2. Rendering — Single Renderer

**What changes:**
- `StreamingChatMessage` component → **REMOVED**
- Live-pipeline block in App.jsx (lines ~2342-2450) → **REMOVED**
- Streaming skeleton in App.jsx → **REMOVED**

**What stays:**
- `ChatMessage.jsx` — becomes the ONLY renderer for bot messages
- `ThoughtStream.tsx` — unchanged, receives props from `agentCell.pipelineSteps`
- `AgenticCell.jsx` — unchanged
- `ResearchContent.jsx` — unchanged
- `ToolWidgetRenderer.jsx` — used inside agent cells for Plusi/Cards/Stats

**App.jsx rendering (simplified):**
```jsx
{messages.map((msg, i) => (
  <ChatMessage key={msg.id} message={msg} ... />
))}

{/* Current message (live) — uses same ChatMessage component */}
{currentMessage && (
  <ChatMessage message={currentMessage} isLive={true} ... />
)}
```

No separate streaming view. No separate pipeline view. One component, one code path.

**ChatMessage.jsx internal structure for bot messages:**
```jsx
<div>
  {/* 1. Orchestration — own element, auto-collapses when done */}
  {msg.orchestration && (
    <ThoughtStream
      variant="router"
      pipelineSteps={msg.orchestration.steps}
      isStreaming={msg.status !== 'done'}
    />
  )}

  {/* 2. Agent Cells — ordered blocks, flush against each other */}
  {msg.agentCells.map((cell, i) => (
    <AgenticCell
      key={`${cell.agent}-${i}`}
      agentName={cell.agent}
      isLoading={cell.status === 'loading'}
      loadingHint={cell.loadingHint}
      style={i > 0 ? { marginTop: -8 } : undefined}  // flush stacking
    >
      {/* Tutor: ThoughtStream + Text */}
      {cell.pipelineSteps?.length > 0 && (
        <ThoughtStream
          pipelineSteps={cell.pipelineSteps}
          citations={cell.citations}
          message={cell.text}
          isStreaming={cell.status === 'streaming'}
        />
      )}

      {/* Text content */}
      {cell.text && cell.status !== 'loading' && (
        <MarkdownRenderer content={cell.text} ... />
      )}

      {/* Research: sources */}
      {cell.sources && (
        <ResearchContent sources={cell.sources} answer={cell.text} />
      )}

      {/* Tool widgets (Plusi, Cards, Stats) */}
      {cell.toolWidgets?.length > 0 && (
        <ToolWidgetRenderer toolWidgets={cell.toolWidgets} ... />
      )}

      {/* Generating skeleton — inside agent cell, after steps done */}
      {cell.status === 'thinking' && cell.pipelineSteps?.every(s => s.status === 'done') && (
        <GeneratingSkeleton />
      )}
    </AgenticCell>
  ))}
</div>
```

### 3. Backend Event Protocol

Replace `[[TOOL:...]]` text markers with structured events sent via the existing `_send_to_js` mechanism.

**Event types:**

| Event | When | Data |
|-------|------|------|
| `msg_start` | Request begins | `{ messageId, status: 'routing' }` |
| `orchestration` | Router decides | `{ agent, mode, steps }` |
| `agent_cell` | Agent state change | `{ agent, status, data }` |
| `pipeline_step` | RAG step update | Same as today, unchanged |
| `text_chunk` | Text streaming | `{ agent, chunk }` |
| `msg_done` | Everything complete | `{ messageId, finalMessage, tokens }` |
| `msg_error` | Unrecoverable error | `{ messageId, error }` |
| `msg_cancelled` | User cancelled | `{ messageId }` |

**All events carry `messageId`** for correlation. The frontend discards events whose `messageId` doesn't match the active request.

**`rag_sources` events** are folded into `agent_cell` updates: when citations arrive, emit `agent_cell` with `status: 'thinking'` and `data: { citations: {...} }`. This ensures citations are part of the structured message, not a side-channel.

**Handoff flow (backend):**
```python
# 1. Router decides → Tutor
self._emit_event("orchestration", {"agent": "tutor", "mode": "direkt", "steps": [...]})

# 2. Tutor pipeline runs
self._emit_event("agent_cell", {"agent": "tutor", "status": "thinking"})
# ... pipeline_step events as today ...

# 3. Tutor generates text
self._emit_event("agent_cell", {"agent": "tutor", "status": "streaming"})
# ... text_chunk events ...

# 4. HANDOFF detected → Research loading IMMEDIATELY
self._emit_event("agent_cell", {"agent": "research", "status": "loading",
                                 "data": {"loadingHint": "Recherchiere..."}})

# 5. Research completes
self._emit_event("agent_cell", {"agent": "research", "status": "done",
                                 "data": {"text": "...", "sources": [...]}})

# 6. Done
self._emit_event("msg_done", {"messageId": "...", "finalMessage": {...}})
```

### 4. State Management (useChat.js)

Replace fragmented state with a single `currentMessage` object:

**Current (fragmented):**
```javascript
// 6 separate state variables that must stay in sync:
const [streamingMessage, setStreamingMessage] = useState('');
const [currentSteps, setCurrentSteps] = useState([]);
const [currentCitations, setCurrentCitations] = useState({});
const [pipelineSteps, setPipelineSteps] = useState([]);
const [isLoading, setIsLoading] = useState(false);
// + refs for synchronous access
```

**New (unified):**
```javascript
const [currentMessage, setCurrentMessage] = useState(null);
const [pipelineGeneration, setPipelineGeneration] = useState(0); // Reset counter for ThoughtStream
const currentMessageRef = useRef(null); // Ref for synchronous access in done handler

// Derived state:
const isLoading = currentMessage !== null;
const streamingText = currentMessage?.agentCells?.find(c => c.status === 'streaming')?.text || '';

// Keep ref in sync
useEffect(() => { currentMessageRef.current = currentMessage; }, [currentMessage]);
```

**NOTE:** All ChatMessage rendering code in this spec is illustrative pseudocode. All existing ThoughtStream props (`pipelineGeneration`, `agentColor`, `bridge`, `onPreviewCard`, `steps`) must be preserved in the actual implementation. ThoughtStream receives `pipelineGeneration` which must increment on each `msg_start`.

**Event handlers:**
```javascript
function handleAnkiReceive(payload) {
  switch (payload.type) {
    case 'msg_start':
      setPipelineGeneration(g => g + 1); // Reset ThoughtStream internal state
      setCurrentMessage({ id: payload.messageId, from: 'bot', status: 'routing', agentCells: [] });
      break;

    case 'orchestration':
      setCurrentMessage(prev => ({ ...prev, orchestration: payload, status: 'thinking' }));
      break;

    case 'agent_cell':
      setCurrentMessage(prev => {
        const cells = [...(prev?.agentCells || [])];
        const idx = cells.findIndex(c => c.agent === payload.agent);
        if (idx >= 0) {
          cells[idx] = { ...cells[idx], ...payload.data, status: payload.status };
        } else {
          cells.push({ agent: payload.agent, status: payload.status, ...payload.data });
        }
        return { ...prev, agentCells: cells, status: payload.status === 'loading' ? 'handoff' : prev.status };
      });
      break;

    case 'pipeline_step':
      setCurrentMessage(prev => {
        if (!prev) return prev;
        const cells = prev.agentCells.map(c => {
          if (!['thinking', 'streaming'].includes(c.status)) return c;
          const steps = [...(c.pipelineSteps || [])];
          const existing = steps.findIndex(s => s.step === payload.step);
          if (existing >= 0) steps[existing] = { ...steps[existing], ...payload };
          else steps.push(payload);
          return { ...c, pipelineSteps: steps }; // immutable update
        });
        return { ...prev, agentCells: cells };
      });
      break;

    case 'text_chunk':
      setCurrentMessage(prev => {
        if (!prev) return prev;
        const cells = prev.agentCells.map(c => {
          if (c.agent !== payload.agent && c !== prev.agentCells[prev.agentCells.length - 1]) return c;
          if (c.agent === payload.agent || c === prev.agentCells[prev.agentCells.length - 1]) {
            return { ...c, text: (c.text || '') + payload.chunk, status: 'streaming' }; // immutable
          }
          return c;
        });
        return { ...prev, agentCells: cells, status: 'streaming' };
      });
      break;

    case 'msg_done':
      // Use ref for latest state (avoids stale closure)
      const finalMsg = { ...currentMessageRef.current, ...payload.finalMessage, status: 'done' };
      setMessages(prev => [...prev, finalMsg]);
      setCurrentMessage(null);
      break;

    case 'msg_error':
      setCurrentMessage(null); // Discard partial message
      // Show error toast or inline error
      break;

    case 'msg_cancelled':
      setCurrentMessage(null); // Discard partial message
      break;
  }
}
```

### 5. Scope

**In scope:** Session chat (main panel), which handles Tutor, Research, Plusi, Help agents.

**Out of scope for now:** Free Chat (Stapel view, `useFreeChat.js`). Free Chat is simpler (no RAG, no ThoughtStream) and can adopt the new message format later without blocking this migration. It continues using the current text-based streaming until v2 is stable.

### 6. Agent Registration & Scalability (renumbered from 5)

When registering a new agent, it automatically gets:
- Loading state (AgenticCell with shimmer)
- Proper positioning in the cell chain
- Handoff support (can be target of any agent's handoff)

No frontend code changes needed to add a new agent. The agent registry defines:
```python
register_agent(AgentDefinition(
    name='new_agent',
    label='New Agent',
    color='#FF6B6B',
    icon_svg='...',
    loading_hint_template='Agent arbeitet...',
    # ...
))
```

And it "just works" — the structured message system renders any `agentCell` with any agent name using the registry for visual config.

### 6. Storage Format

Saved messages in SQLite use the same structure:
```python
# card_sessions.py
save_message(
    card_id=...,
    text=json.dumps(message_object),  # Full structured message
    sender='assistant',
    ...
)
```

Loading reconstructs the object. Legacy messages (plain text) get a migration wrapper that converts them to the new format with a single tutor agent cell.

### 7. What's Preserved (unchanged)

| Component | Status |
|-----------|--------|
| `ThoughtStream.tsx` | **Unchanged** — same component, same props, same animations |
| `AgenticCell.jsx` | **Unchanged** — same component |
| `ResearchContent.jsx` | **Unchanged** |
| `SourcesCarousel` | **Unchanged** |
| Pipeline step emission (`_emit_pipeline_step`) | **Unchanged** — same backend mechanism |
| Agent registry (`agents.py`) | **Unchanged** — same registration system |
| RAG pipeline | **Unchanged** — same retrieval, same ThoughtStream integration |
| Design system / CSS | **Unchanged** |

### 8. What's Removed

| Component | Reason |
|-----------|--------|
| `StreamingChatMessage` | Replaced by ChatMessage with `status !== 'done'` |
| Live-pipeline block in App.jsx (~100 lines) | Moved into ChatMessage |
| `[[TOOL:...]]` text markers | Replaced by structured `agent_cell` events |
| Done-signal buffering (`_buffered_done`) | Not needed — agent results are separate events |
| HANDOFF text-stripping regex (frontend) | Not needed — HANDOFF is parsed backend-only |
| 3-way duplication guards | Only one renderer exists |

### 9. Migration Strategy

**Phase 1: New state model** (useChat.js)
- Add `currentMessage` state alongside existing state
- New event handlers that build the structured message
- Both old and new paths active (feature flag)

**Phase 2: Unified renderer** (ChatMessage.jsx)
- Extend ChatMessage to render from `agentCells[]`
- Remove StreamingChatMessage
- Remove live-pipeline block from App.jsx

**Phase 3: Backend events** (handler.py)
- Replace `[[TOOL:...]]` callback pattern with `agent_cell` events
- Remove done-signal buffering
- Clean handoff flow: emit loading → run agent → emit done

**Phase 4: Cleanup**
- Remove old streaming state variables from useChat
- Remove marker-parsing regex from ChatMessage
- Remove StreamingChatMessage component file
- Update storage format

Each phase is independently testable. No big-bang rewrite.

### 10. Performance Characteristics

| Aspect | Current | New |
|--------|---------|-----|
| Renderers active during streaming | 3 | 1 |
| Regex passes per render | 5+ | 0 |
| State variables to sync | 6+ refs | 1 object |
| Dead time during handoff | 2-3s (no visual) | 0s (loading cell instant) |
| Time to first visual after Enter | ~200ms (skeleton) | ~200ms (routing tags) |
| React reconciliation complexity | O(n) × 3 paths | O(n) × 1 path |
