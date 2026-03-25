# Agentic Message System v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fragmented 3-renderer message system with a single-renderer architecture using structured message objects, eliminating race conditions and enabling reliable agent handoffs.

**Architecture:** One `currentMessage` state object progressively filled by structured events. One `ChatMessage.jsx` component renders both live and saved messages. Backend emits typed events (`msg_start`, `agent_cell`, `text_chunk`, `msg_done`) instead of `[[TOOL:...]]` text markers.

**Tech Stack:** React 18, Python 3.13, PyQt6 signals, existing ThoughtStream/AgenticCell components (unchanged).

**Spec:** `docs/superpowers/specs/2026-03-23-agentic-message-system-v2.md`

---

## File Map

### New Files
| File | Purpose |
|------|---------|
| `frontend/src/hooks/useAgenticMessage.js` | New hook: builds structured message from events |
| `tests/test_handoff.py` | Unit tests for handoff parsing and event emission |

### Modified Files
| File | What Changes |
|------|-------------|
| `frontend/src/hooks/useChat.js` | Add `currentMessage` state, new event handlers, remove old streaming state |
| `frontend/src/App.jsx` | Remove live-pipeline block (~100 lines), use single ChatMessage for live+saved |
| `frontend/src/components/ChatMessage.jsx` | Render from `agentCells[]`, remove `[[TOOL:...]]` parsing |
| `ai/handler.py` | Emit structured events instead of text markers |
| `ui/widget.py` | New signal for agent_cell events, emit msg_start/msg_done |

### Removed Files
| File | Reason |
|------|--------|
| `frontend/src/components/StreamingChatMessage.jsx` | Replaced by ChatMessage with `isLive` prop |

---

## Task 1: New Hook — useAgenticMessage

Creates the structured message state management in isolation, without touching existing code.

**Files:**
- Create: `frontend/src/hooks/useAgenticMessage.js`

- [ ] **Step 1: Create the hook with message state**

```javascript
// frontend/src/hooks/useAgenticMessage.js
import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * useAgenticMessage — builds a structured BotMessage from backend events.
 * Single source of truth for the current live message.
 *
 * Message shape:
 * {
 *   id, from: 'bot', status,
 *   orchestration: { agent, mode, steps },
 *   agentCells: [{ agent, status, text, pipelineSteps, citations, sources, toolWidgets, loadingHint }]
 * }
 */
export default function useAgenticMessage() {
  const [currentMessage, setCurrentMessage] = useState(null);
  const [pipelineGeneration, setPipelineGeneration] = useState(0);
  const currentMessageRef = useRef(null);

  // Keep ref in sync for use in done handler
  useEffect(() => { currentMessageRef.current = currentMessage; }, [currentMessage]);

  const isLoading = currentMessage !== null;

  const handleMsgStart = useCallback((payload) => {
    setPipelineGeneration(g => g + 1);
    setCurrentMessage({
      id: payload.messageId || `msg-${Date.now()}`,
      from: 'bot',
      status: 'routing',
      orchestration: null,
      agentCells: [],
    });
  }, []);

  const handleOrchestration = useCallback((payload) => {
    setCurrentMessage(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        status: 'thinking',
        orchestration: {
          agent: payload.agent,
          mode: payload.mode || 'direkt',
          steps: payload.steps || [],
        },
      };
    });
  }, []);

  const handleAgentCell = useCallback((payload) => {
    setCurrentMessage(prev => {
      if (!prev) return prev;
      const cells = prev.agentCells.map(c =>
        c.agent === payload.agent
          ? { ...c, ...payload.data, status: payload.status }
          : c
      );
      // If agent not found, add new cell
      if (!cells.some(c => c.agent === payload.agent)) {
        cells.push({
          agent: payload.agent,
          status: payload.status,
          text: '',
          pipelineSteps: [],
          citations: {},
          sources: [],
          toolWidgets: [],
          loadingHint: payload.data?.loadingHint || '',
          ...payload.data,
        });
      }
      const newStatus = payload.status === 'loading' ? 'handoff' : prev.status;
      return { ...prev, agentCells: cells, status: newStatus };
    });
  }, []);

  const handlePipelineStep = useCallback((payload) => {
    setCurrentMessage(prev => {
      if (!prev) return prev;
      const cells = prev.agentCells.map(c => {
        if (!['thinking', 'streaming'].includes(c.status)) return c;
        const steps = [...(c.pipelineSteps || [])];
        const idx = steps.findIndex(s => s.step === payload.step);
        if (idx >= 0) {
          steps[idx] = { ...steps[idx], status: payload.status, data: payload.data, timestamp: payload.timestamp || Date.now() };
        } else {
          steps.push({ step: payload.step, status: payload.status, data: payload.data || {}, timestamp: payload.timestamp || Date.now() });
        }
        return { ...c, pipelineSteps: steps };
      });
      return { ...prev, agentCells: cells };
    });
  }, []);

  const handleTextChunk = useCallback((payload) => {
    setCurrentMessage(prev => {
      if (!prev) return prev;
      const targetAgent = payload.agent;
      const cells = prev.agentCells.map(c => {
        if (targetAgent && c.agent !== targetAgent) return c;
        if (!targetAgent && c !== prev.agentCells[prev.agentCells.length - 1]) return c;
        return { ...c, text: (c.text || '') + payload.chunk, status: 'streaming' };
      });
      return { ...prev, agentCells: cells, status: 'streaming' };
    });
  }, []);

  const handleCitations = useCallback((payload) => {
    setCurrentMessage(prev => {
      if (!prev) return prev;
      const cells = prev.agentCells.map(c => {
        if (!['thinking', 'streaming'].includes(c.status)) return c;
        return { ...c, citations: { ...(c.citations || {}), ...payload.data } };
      });
      return { ...prev, agentCells: cells };
    });
  }, []);

  const finalize = useCallback(() => {
    const msg = currentMessageRef.current;
    if (!msg) return null;
    const finalMsg = {
      ...msg,
      status: 'done',
      agentCells: msg.agentCells.map(c => ({ ...c, status: 'done' })),
    };
    setCurrentMessage(null);
    return finalMsg;
  }, []);

  const cancel = useCallback(() => {
    setCurrentMessage(null);
  }, []);

  return {
    currentMessage,
    isLoading,
    pipelineGeneration,
    handleMsgStart,
    handleOrchestration,
    handleAgentCell,
    handlePipelineStep,
    handleTextChunk,
    handleCitations,
    finalize,
    cancel,
  };
}
```

- [ ] **Step 2: Verify file exists and has no syntax errors**

Run: `cd frontend && node -e "require('./src/hooks/useAgenticMessage.js')" 2>&1 || echo "Module check — syntax validation done via build"`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useAgenticMessage.js
git commit -m "feat(v2): add useAgenticMessage hook — structured message state"
```

---

## Task 2: Backend — Structured Event Emission

Add new event types to handler.py without removing old code. Both old and new paths will coexist during migration.

**Files:**
- Modify: `ai/handler.py`
- Modify: `ui/widget.py`

- [ ] **Step 1: Add `_emit_msg_event` helper to handler.py**

Add after `_emit_ai_event` method (around line 354):

```python
def _emit_msg_event(self, event_type, data):
    """Emit a structured message event to the frontend (v2 protocol)."""
    if not self.widget or not self.widget.web_view:
        return
    payload = {"type": event_type}
    payload.update(data)
    payload_str = json.dumps(payload)
    if mw and mw.taskman:
        def emit_on_main():
            try:
                self.widget.web_view.page().runJavaScript(
                    "window.ankiReceive(" + payload_str + ");"
                )
            except Exception as e:
                logger.warning("msg_event emit error: %s", e)
        mw.taskman.run_on_main(emit_on_main)
```

- [ ] **Step 2: Emit `msg_start` at the beginning of `get_response_with_rag`**

In `get_response_with_rag` (after line 364, after `citations = {}`), add:

```python
# v2: Emit msg_start for structured message system
request_id = getattr(self, '_current_request_id', None)
self._emit_msg_event("msg_start", {"messageId": request_id or ''})
```

- [ ] **Step 3: Emit `orchestration` event when router decides**

After the orchestrating pipeline step at line 426 (`self._emit_pipeline_step("orchestrating", "done", {...})`), add:

```python
# v2: Emit orchestration event with routing details
self._emit_msg_event("orchestration", {
    "messageId": request_id or '',
    "agent": 'tutor',
    "mode": routing_result.method if routing_result else 'default',
    "steps": [{"step": "orchestrating", "status": "done", "data": {
        'retrieval_mode': routing_result.get('retrieval_mode', 'both') if isinstance(routing_result, dict) else 'agent:tutor',
        'agent': 'tutor',
    }}],
})
```

- [ ] **Step 4: Emit `agent_cell` for tutor thinking/streaming/done**

Add tutor agent_cell emit after RAG context is built (after `logger.debug("RAG: %s Karten...", ...)`, around line 520):

```python
# v2: Tutor cell enters thinking state
self._emit_msg_event("agent_cell", {
    "messageId": request_id or '',
    "agent": "tutor",
    "status": "thinking",
    "data": {}
})
```

In `enhanced_callback`, when first non-empty text chunk arrives, emit streaming state. Modify the `else` branch (line 585-587):

```python
else:
    if callback:
        callback(chunk, done, is_function_call)
    # v2: Emit text_chunk for structured messages
    if chunk and not is_function_call:
        self._emit_msg_event("text_chunk", {
            "messageId": request_id or '',
            "agent": "tutor",
            "chunk": chunk,
        })
```

- [ ] **Step 5: Emit `agent_cell` loading + done for handoff**

In the handoff section (around line 630), replace the loading marker code:

```python
# v2: Emit loading state for target agent IMMEDIATELY
self._emit_msg_event("agent_cell", {
    "messageId": request_id or '',
    "agent": handoff_req.to,
    "status": "loading",
    "data": {"loadingHint": handoff_req.reason}
})
```

After research completes (around line 670), add:

```python
# v2: Emit target agent result
if target_text:
    self._emit_msg_event("agent_cell", {
        "messageId": request_id or '',
        "agent": handoff_req.to,
        "status": "done",
        "data": {
            "text": target_text,
            "sources": target_result.get('sources', []) if isinstance(target_result, dict) else [],
            "toolUsed": target_result.get('tool_used', '') if isinstance(target_result, dict) else '',
        }
    })
```

- [ ] **Step 6: Emit `msg_done` in `_release_done`**

At the end of `_release_done` (after the existing callback call), add:

```python
# v2: Emit msg_done
self._emit_msg_event("msg_done", {"messageId": request_id or ''})
```

Also add `msg_done` in the normal (no-handoff) path, right before `return result` (around line 691):

```python
# v2: Emit msg_done for non-handoff responses
self._emit_msg_event("msg_done", {"messageId": request_id or ''})
```

- [ ] **Step 7: Emit rag_sources as agent_cell citation update**

After the existing `self._emit_ai_event("rag_sources", citations)` call (around line 521), add:

```python
# v2: Fold citations into agent_cell update
self._emit_msg_event("agent_cell", {
    "messageId": request_id or '',
    "agent": "tutor",
    "status": "thinking",
    "data": {"citations": citations}
})
```

- [ ] **Step 8: Commit**

```bash
git add ai/handler.py
git commit -m "feat(v2): emit structured message events alongside existing callbacks"
```

---

## Task 3: Wire useAgenticMessage into useChat

Connect the new hook to the existing event stream. Both old and new state coexist.

**Files:**
- Modify: `frontend/src/hooks/useChat.js`

- [ ] **Step 1: Import and initialize the new hook**

At the top of `useChat` function (after existing state declarations, around line 30):

```javascript
import useAgenticMessage from './useAgenticMessage';

// Inside useChat():
const agenticMsg = useAgenticMessage();
```

- [ ] **Step 2: Route new event types in handleAnkiReceive**

In the `handleAnkiReceive` function, add handlers for the new event types. Add before the existing `if (payload.type === 'loading')` check (around line 478):

```javascript
// ── v2 Structured Message Events ──
if (payload.type === 'msg_start') {
  agenticMsg.handleMsgStart(payload);
  // Continue with existing loading logic below
}
if (payload.type === 'orchestration') {
  agenticMsg.handleOrchestration(payload);
  return;
}
if (payload.type === 'agent_cell') {
  agenticMsg.handleAgentCell(payload);
  return;
}
if (payload.type === 'text_chunk') {
  agenticMsg.handleTextChunk(payload);
  return;
}
if (payload.type === 'msg_done') {
  // Finalize: move currentMessage → messages array
  const finalMsg = agenticMsg.finalize();
  if (finalMsg) {
    // Convert to existing message format for storage compatibility
    const primaryCell = finalMsg.agentCells[0];
    const savedMsg = {
      id: finalMsg.id,
      text: primaryCell?.text || '',
      from: 'bot',
      steps: primaryCell?.pipelineSteps?.map(s => ({ state: s.data?.label || s.step, timestamp: s.timestamp })) || [],
      citations: primaryCell?.citations || {},
      pipeline_data: primaryCell?.pipelineSteps || [],
      agentCells: finalMsg.agentCells,  // v2 data
      orchestration: finalMsg.orchestration,  // v2 data
    };
    setMessages(prev => [...prev, savedMsg]);
  }
  // Don't return — let existing done handler also run for backwards compat
}
if (payload.type === 'msg_error') {
  agenticMsg.cancel();
  return;
}
if (payload.type === 'msg_cancelled') {
  agenticMsg.cancel();
  return;
}
```

- [ ] **Step 3: Route pipeline_step events to new hook**

In the existing `pipeline_step` handler (around line 486), add:

```javascript
// Also forward to v2 hook
agenticMsg.handlePipelineStep(payload);
```

- [ ] **Step 4: Route rag_sources to new hook**

In the existing `rag_sources` handler (around line 512), add:

```javascript
// Also forward to v2 hook as citations
agenticMsg.handleCitations({ data: payload.data });
```

- [ ] **Step 5: Expose new state in return object**

Add to the return object of useChat (around line 830):

```javascript
// v2 structured message
currentMessage: agenticMsg.currentMessage,
pipelineGenerationV2: agenticMsg.pipelineGeneration,
cancelCurrentMessage: agenticMsg.cancel,
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useChat.js
git commit -m "feat(v2): wire useAgenticMessage into useChat event stream"
```

---

## Task 4: ChatMessage — Render from agentCells

Extend ChatMessage to render structured `agentCells[]` when present, falling back to existing text-parsing for old messages.

**Files:**
- Modify: `frontend/src/components/ChatMessage.jsx`

- [ ] **Step 1: Add agentCells rendering path**

At the top of the bot-message rendering section (before the existing `processedMessageWithCitations && !isUser` block around line 1847), add a new rendering path:

```jsx
{/* ── v2: Structured Agent Cells ── */}
{!isUser && message_prop.agentCells && message_prop.agentCells.length > 0 && (
  <>
    {/* Router ThoughtStream */}
    {message_prop.orchestration && (
      <ThoughtStream
        variant="router"
        pipelineSteps={message_prop.orchestration.steps}
        isStreaming={message_prop.status !== 'done'}
        agentColor={activeAgentColor}
        citations={{}}
        message=""
        steps={[]}
      />
    )}
    {/* Agent Cells — flush stacking */}
    {message_prop.agentCells.map((cell, i) => (
      <AgenticCell
        key={`${cell.agent}-${i}`}
        agentName={cell.agent}
        isLoading={cell.status === 'loading'}
        loadingHint={cell.loadingHint}
      >
        {/* Tutor-style ThoughtStream */}
        {cell.pipelineSteps && cell.pipelineSteps.length > 0 && (
          <ThoughtStream
            pipelineSteps={cell.pipelineSteps}
            pipelineGeneration={message_prop.pipelineGeneration}
            agentColor={agentColor}
            citations={cell.citations || {}}
            isStreaming={cell.status === 'streaming' || cell.status === 'thinking'}
            bridge={bridge}
            onPreviewCard={onPreviewCard}
            message={cell.text || ''}
            steps={[]}
          />
        )}
        {/* Text content */}
        {cell.text && cell.status !== 'loading' && (
          <SafeMarkdownRenderer
            content={cell.text}
            MermaidDiagram={MermaidDiagram}
            isStreaming={cell.status === 'streaming'}
            citations={cell.citations || {}}
            citationIndices={{}}
            bridge={bridge}
            onPreviewCard={onPreviewCard}
          />
        )}
        {/* Research sources */}
        {cell.sources && cell.sources.length > 0 && (
          <ResearchContent
            sources={cell.sources}
            answer={cell.text || ''}
          />
        )}
        {/* Tool widgets (Plusi, Cards, Stats) */}
        {cell.toolWidgets && cell.toolWidgets.length > 0 && (
          <ToolWidgetRenderer
            toolWidgets={cell.toolWidgets}
            bridge={bridge}
            isStreaming={cell.status === 'streaming'}
            isLastMessage={isLastMessage}
          />
        )}
        {/* Generating skeleton — inside cell, after steps all done */}
        {cell.status === 'thinking' && cell.pipelineSteps?.length > 0 && cell.pipelineSteps.every(s => s.status === 'done') && (
          <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[0.92, 0.76, 0.58].map((w, idx) => (
              <div key={idx} style={{ height: 12, borderRadius: 6, width: `${w * 100}%`, background: 'linear-gradient(90deg, var(--ds-hover-tint), var(--ds-active-tint), var(--ds-hover-tint))', backgroundSize: '200% 100%', animation: `ts-shimmerWave 2s ease-in-out infinite ${idx * 0.15}s` }} />
            ))}
          </div>
        )}
      </AgenticCell>
    ))}
  </>
)}

{/* ── v1 fallback: existing text-based rendering for old messages ── */}
```

- [ ] **Step 2: Add the `message_prop` variable**

At the top of the ChatMessage function, extract the structured message data. The `message` prop is a string (text), but the parent may pass structured data via a separate prop. Add to the component signature:

```jsx
function ChatMessage({ message, from, ..., agentCells, orchestration, status: msgStatus, pipelineGeneration: msgPipelineGeneration, ... })
```

And create a helper:

```javascript
const message_prop = {
  agentCells: agentCells || null,
  orchestration: orchestration || null,
  status: msgStatus || 'done',
  pipelineGeneration: msgPipelineGeneration || 0,
};
const hasV2Data = message_prop.agentCells && message_prop.agentCells.length > 0;
```

- [ ] **Step 3: Skip v1 parsing when v2 data is present**

Wrap the existing tool-marker parsing block (lines 1421-1452) with:

```javascript
if (!hasV2Data) {
  // ... existing [[TOOL:...]] parsing code ...
}
```

And wrap the existing bot message rendering (lines 1847-1873) with:

```javascript
{!hasV2Data && processedMessageWithCitations && !isUser && (
  // ... existing AgenticCell + ThoughtStream + SafeMarkdownRenderer ...
)}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ChatMessage.jsx
git commit -m "feat(v2): ChatMessage renders from agentCells when present, falls back to v1"
```

---

## Task 5: App.jsx — Single Renderer for Live + Saved

Replace the 3 separate rendering blocks with one `ChatMessage` for both live and saved messages.

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Add v2 live message rendering**

After the existing saved-message ChatMessage (around line 2335), add the v2 live renderer. This renders the `currentMessage` from the new hook:

```jsx
{/* ── v2: Live message (structured, single renderer) ── */}
{chatHook.currentMessage && !(nextMsg && nextMsg.from === 'bot' && nextMsg.text) && (
  <div className="w-full flex-none">
    <ChatMessage
      message={chatHook.currentMessage.agentCells?.[0]?.text || ''}
      from="bot"
      cardContext={cardContextHook.cardContext}
      agentCells={chatHook.currentMessage.agentCells}
      orchestration={chatHook.currentMessage.orchestration}
      status={chatHook.currentMessage.status}
      pipelineGeneration={chatHook.pipelineGenerationV2}
      bridge={bridge}
      isStreaming={true}
      isLastMessage={true}
      onPreviewCard={handlePreviewCard}
    />
  </div>
)}
```

- [ ] **Step 2: Gate old live rendering behind `!currentMessage`**

The existing live-pipeline block (line 2342) already has a guard `chatHook.isLoading && !(nextMsg...)`. Add an additional check:

```jsx
{chatHook.isLoading && !chatHook.currentMessage && !(nextMsg && nextMsg.from === 'bot' && nextMsg.text) && (() => {
```

Do the same for the existing StreamingChatMessage block (around line 2429):

```jsx
{(chatHook.isLoading || chatHook.streamingMessage) && !chatHook.currentMessage && !(
```

And the routing skeleton (around line 2399):

```jsx
{chatHook.isLoading && !chatHook.streamingMessage && !chatHook.currentMessage && (chatHook.pipelineSteps || []).length === 0 && ...
```

- [ ] **Step 3: Pass v2 data to saved ChatMessage**

Update the saved message ChatMessage (around line 2309) to pass v2 data when available:

```jsx
<ChatMessage
  message={nextMsg.text}
  from="bot"
  // ... existing props ...
  agentCells={nextMsg.agentCells}
  orchestration={nextMsg.orchestration}
  status="done"
/>
```

- [ ] **Step 4: Build and verify**

```bash
cd frontend && npm run build
```

Expected: Build succeeds. Both v1 (old messages) and v2 (new requests) render correctly.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(v2): single ChatMessage renders live+saved, old paths gated behind !currentMessage"
```

---

## Task 6: Test and Stabilize

Manual testing in Anki, then cleanup.

**Files:**
- Various

- [ ] **Step 1: Test basic Tutor flow**

In Anki, ask a card-related question. Verify:
- Orchestration appears and auto-collapses
- ThoughtStream shows pipeline steps
- Text streams correctly inside AgenticCell
- Message is saved correctly

- [ ] **Step 2: Test handoff flow**

Ask "warum ist die banane krumm" (no card context). Verify:
- Tutor cell appears with short handoff text
- Research cell loading state appears IMMEDIATELY
- Research result replaces loading
- Sources render correctly
- Answer is in German

- [ ] **Step 3: Test old message rendering**

Verify previously saved messages still render correctly with the v1 fallback path.

- [ ] **Step 4: Commit stabilization fixes**

```bash
git add -A
git commit -m "fix(v2): stabilization fixes from manual testing"
```

---

## Task 7: Cleanup — Remove Old Paths

Only after v2 is stable. Remove deprecated code.

**Files:**
- Delete: `frontend/src/components/StreamingChatMessage.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/hooks/useChat.js`
- Modify: `ai/handler.py`

- [ ] **Step 1: Remove StreamingChatMessage**

Delete the file and remove imports from App.jsx.

- [ ] **Step 2: Remove old live-pipeline block from App.jsx**

Remove the gated blocks (now behind `!chatHook.currentMessage`) entirely:
- Live ThoughtStream + AgenticCell block (~lines 2342-2398)
- StreamingChatMessage block (~lines 2429-2450)
- Routing skeleton block (~lines 2399-2428)

- [ ] **Step 3: Remove old streaming state from useChat**

Remove: `streamingMessage`, `currentSteps`, `currentCitations` state variables and their refs. Keep `pipelineSteps` for now (used by v2 forwarding).

- [ ] **Step 4: Remove `[[TOOL:...]]` marker code from handler.py**

Remove: `_buffered_done`, loading marker text emission, `_release_done` function. Keep only the v2 `_emit_msg_event` calls.

- [ ] **Step 5: Remove marker parsing from ChatMessage.jsx**

Remove the `[[TOOL:...]]` regex parsing block and the `hasV2Data` guard — v2 becomes the only path.

- [ ] **Step 6: Build, test, commit**

```bash
cd frontend && npm run build
# Test in Anki
git add -A
git commit -m "refactor(v2): remove v1 streaming paths, StreamingChatMessage, and marker parsing"
```

---

## Execution Order

```
Task 1 (new hook)        — zero risk, no existing code touched
Task 2 (backend events)  — additive, old callbacks still work
Task 3 (wire into chat)  — connects new to existing, both paths active
Task 4 (ChatMessage v2)  — new rendering path, old still works
Task 5 (App.jsx)         — gates old behind !currentMessage
Task 6 (test)            — verify everything works
Task 7 (cleanup)         — remove old code only after stable
```

Each task is independently committable and testable. The system works at every intermediate state.
