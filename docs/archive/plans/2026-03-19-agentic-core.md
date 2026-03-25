# Agentic Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the agent loop and tool system into a generic, robust framework with structured responses, timeouts, context pruning, and unified stream markers — removing all Plusi special-casing.

**Architecture:** Three files get rewritten (`tool_executor.py`, `agent_loop.py`, `tool_registry.py`), one gets patched (`ai_handler.py` non-streaming path removed), and the frontend gets a minimal regex swap. The `ToolResponse` dataclass wraps all tool results. The agent loop emits generic `[[TOOL:...]]` markers instead of tool-specific ones.

**Tech Stack:** Python 3.9+, dataclasses, threading (for timeout), json. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-03-19-agentic-core-design.md`

---

### Task 1: Extend ToolDefinition and rewrite tool_executor.py

**Files:**
- Modify: `tool_registry.py:92-116` (ToolDefinition dataclass)
- Modify: `tool_registry.py:230-240` (Mermaid registration)
- Modify: `tool_registry.py:272-308` (Plusi execute_fn + registration)
- Modify: `tool_executor.py` (full rewrite, 53 lines → ~80 lines)
- Modify: `widget.py:790-805` (remove _frontend_callback setup)

Both files must change together because `execute_tool()` accesses `tool.display_type` and `tool.timeout_seconds` which are added to `ToolDefinition` in the same task.

- [ ] **Step 1: Add new fields to ToolDefinition**

In `tool_registry.py`, update the `ToolDefinition` dataclass. Change `execute_fn` type from `Callable[[Dict[str, Any]], str]` to `Callable[[Dict[str, Any]], Any]` and add two new fields after `disabled_modes`:

```python
@dataclass
class ToolDefinition:
    name: str
    schema: Dict[str, Any]
    execute_fn: Callable[[Dict[str, Any]], Any]
    category: str = "content"
    config_key: Optional[str] = None
    agent: str = "tutor"
    disabled_modes: List[str] = field(default_factory=list)
    display_type: str = "markdown"     # "markdown" | "widget" | "silent"
    timeout_seconds: int = 30          # Per-tool timeout in seconds
```

- [ ] **Step 2: Update Mermaid registration**

Update the Mermaid `registry.register()` call (around line 230) to include the new fields:

```python
registry.register(
    ToolDefinition(
        name="create_mermaid_diagram",
        schema=MERMAID_SCHEMA,
        execute_fn=execute_mermaid,
        category="content",
        config_key="diagrams",
        agent="tutor",
        disabled_modes=["compact"],
        display_type="markdown",
        timeout_seconds=10,
    )
)
```

- [ ] **Step 3: Update execute_plusi to return dict instead of json.dumps(dict)**

In `tool_registry.py`, change `execute_plusi()` (around line 272). The function currently returns `json.dumps({...})`. Change it to return a plain dict so the marker system doesn't double-encode. Also remove the `_frontend_callback` pop since the callback mechanism is gone:

```python
def execute_plusi(args):
    """Execute spawn_plusi — calls the Plusi sub-agent.

    Returns dict with mood, text, error keys. The agent loop's generic
    marker system handles [[TOOL:...]] injection into the stream.
    """
    try:
        from .plusi_agent import run_plusi
    except ImportError:
        from plusi_agent import run_plusi

    situation = args.get("situation", "")
    if not situation:
        return {"status": "error", "message": "No situation provided", "error": True}

    result = run_plusi(situation)

    return {
        "status": "displayed",
        "mood": result.get("mood", "neutral"),
        "text": result.get("text", ""),
        "error": result.get("error", False),
    }
```

- [ ] **Step 4: Update Plusi registration**

Update the Plusi `registry.register()` call (around line 301) to include the new fields:

```python
registry.register(ToolDefinition(
    name="spawn_plusi",
    schema=PLUSI_SCHEMA,
    execute_fn=execute_plusi,
    category='content',
    config_key='plusi',
    agent='tutor',
    display_type="widget",
    timeout_seconds=30,
))
```

- [ ] **Step 5: Rewrite tool_executor.py**

Replace the entire file with:

```python
"""
tool_executor.py — Execute registered tools with timeout and structured responses.
"""

import json
import threading
from dataclasses import dataclass
from typing import Any, Callable, Dict

try:
    from .tool_registry import registry
except ImportError:
    from tool_registry import registry


@dataclass
class ToolResponse:
    """Structured envelope for tool execution results."""
    status: str            # "success" | "error"
    result: Any            # The actual content (string, dict, etc.)
    display_type: str      # "markdown" | "widget" | "silent"
    error_message: str = ""  # User-facing error description (on failure)


def _run_with_timeout(fn: Callable, args: Dict, timeout: int) -> Any:
    """Run a function in a thread with a timeout.

    Note: On timeout, the worker thread is NOT killed (Python has no safe
    thread-kill). It continues as a daemon thread until completion or process
    exit. Tools accessing Qt state should marshal via QTimer.singleShot(0, ...).
    """
    result_container = {}
    error_container = {}
    done_event = threading.Event()

    def worker():
        try:
            result_container["value"] = fn(args)
        except Exception as e:
            error_container["value"] = e
        finally:
            done_event.set()

    thread = threading.Thread(target=worker, daemon=True)
    thread.start()
    if not done_event.wait(timeout=timeout):
        raise TimeoutError(f"Tool execution exceeded {timeout}s")
    if "value" in error_container:
        raise error_container["value"]
    return result_container["value"]


def execute_tool(tool_name: str, args: Dict[str, Any]) -> ToolResponse:
    """Execute a tool by name with timeout and structured response.

    Args:
        tool_name: The function name from Gemini's functionCall.
        args: Dict of arguments from Gemini's functionCall.

    Returns:
        ToolResponse with status, result, display_type, and optional error.
    """
    print(f"[tool_executor] Executing tool: {tool_name}, args: {args}")

    tool = registry.get(tool_name)
    if tool is None:
        return ToolResponse(
            status="error", result="",
            display_type="silent",
            error_message=f"Unknown tool: {tool_name}"
        )

    try:
        result = _run_with_timeout(tool.execute_fn, args, tool.timeout_seconds)
        print(f"[tool_executor] Tool '{tool_name}' returned successfully")
        return ToolResponse(
            status="success", result=result,
            display_type=tool.display_type
        )
    except TimeoutError:
        msg = f"{tool.name}: Timeout nach {tool.timeout_seconds}s"
        print(f"[tool_executor] {msg}")
        return ToolResponse(
            status="error", result="",
            display_type=tool.display_type,
            error_message=msg
        )
    except Exception as e:
        msg = f"Error executing tool '{tool_name}': {e}"
        print(f"[tool_executor] {msg}")
        return ToolResponse(
            status="error", result="",
            display_type=tool.display_type,
            error_message=str(e)
        )
```

- [ ] **Step 6: Remove _frontend_callback setup from widget.py**

In `widget.py`, find and delete lines 790-805 — the `_push_to_frontend` function and `set_frontend_callback` call. This mechanism is replaced by the generic loading markers in the agent loop.

Delete this block:
```python
        # Set frontend callback for tools that need to push events (e.g. spawn_plusi)
        try:
            from .tool_executor import set_frontend_callback
        except ImportError:
            from tool_executor import set_frontend_callback

        import json as _json

        from PyQt6.QtCore import QTimer

        def _push_to_frontend(payload):
            # Must run on main Qt thread — tool executor runs in AI thread
            js_code = f"window.ankiReceive({_json.dumps(payload)});"
            QTimer.singleShot(0, lambda: self.web_view.page().runJavaScript(js_code))

        set_frontend_callback(_push_to_frontend)
```

- [ ] **Step 7: Verify imports**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
python3 -c "from tool_registry import registry; t = registry.get('create_mermaid_diagram'); print(t.display_type, t.timeout_seconds); t2 = registry.get('spawn_plusi'); print(t2.display_type, t2.timeout_seconds)"
```
Expected:
```
markdown 10
widget 30
```

- [ ] **Step 8: Commit**

```bash
git add tool_registry.py tool_executor.py widget.py
git commit -m "refactor(tools): ToolResponse + timeout + display_type, remove _frontend_callback"
```

---

### Task 2: Rewrite agent_loop.py with generic markers and context pruning

**Files:**
- Modify: `agent_loop.py` (full rewrite, 110 lines → ~160 lines)

This is the core change. Remove all Plusi special-casing (including `MOOD_META` dict which is no longer needed — mood metadata lives in `execute_plusi` now), add generic `[[TOOL:...]]` markers, loading markers, error handling, and context pruning.

- [ ] **Step 1: Rewrite agent_loop.py**

Replace the entire file with:

```python
"""
agent_loop.py — Multi-turn agent loop with generic tool handling.

Handles tool calls from Gemini, emits [[TOOL:...]] markers for the frontend,
prunes context when it exceeds budget, and supports graceful error degradation.
"""

import json

try:
    from .tool_executor import execute_tool
    from .tool_registry import registry
except ImportError:
    from tool_executor import execute_tool
    from tool_registry import registry

MAX_ITERATIONS = 5
MAX_CONTEXT_CHARS = 100_000  # ~25k tokens


def _build_tool_marker(name: str, marker_type: str, result=None, error=None) -> str:
    """Build a [[TOOL:{...}]] marker string for the frontend.

    Args:
        name: Tool name (e.g. 'spawn_plusi').
        marker_type: One of 'loading', 'widget', 'error'.
        result: Tool result data (for 'widget' type).
        error: Error message string (for 'error' type).
    """
    payload = {"name": name, "displayType": marker_type}
    if result is not None:
        payload["result"] = result
    if error is not None:
        payload["error"] = error
    return f"[[TOOL:{json.dumps(payload, ensure_ascii=False)}]]"


def _prune_contents(contents: list) -> list:
    """Prune contents array to stay within token budget.

    Keeps the first message (system context) and last 4 entries (recent
    interaction). Drops oldest middle entries first. O(n) in serialization.
    """
    sizes = [len(json.dumps(c)) for c in contents]
    total = sum(sizes)
    if total <= MAX_CONTEXT_CHARS:
        return contents

    protected_head_idx = 1
    protected_tail_idx = max(protected_head_idx, len(contents) - 4)

    head_size = sum(sizes[:protected_head_idx])
    tail_size = sum(sizes[protected_tail_idx:])

    # If protected entries alone exceed budget, just keep them
    if head_size + tail_size > MAX_CONTEXT_CHARS:
        return contents[:protected_head_idx] + contents[protected_tail_idx:]

    # Walk backwards from tail to keep newest middle entries
    remaining_budget = MAX_CONTEXT_CHARS - head_size - tail_size
    kept_middle = []
    for i in range(protected_tail_idx - 1, protected_head_idx - 1, -1):
        if remaining_budget >= sizes[i]:
            remaining_budget -= sizes[i]
            kept_middle.insert(0, contents[i])
        else:
            break

    return contents[:protected_head_idx] + kept_middle + contents[protected_tail_idx:]


def _handle_tool_response(function_name, tool_response, callback):
    """Process a tool response: emit markers and build Gemini response string.

    Returns:
        str: The response string to send back to Gemini as functionResponse.
    """
    if tool_response.status == "error":
        # Graceful degradation: error marker + AI gets error info
        marker = _build_tool_marker(function_name, "error",
                                     error=tool_response.error_message)
        if callback:
            callback(marker, False, True)
        return f"Error: {tool_response.error_message}"

    if tool_response.display_type == "widget":
        marker = _build_tool_marker(function_name, "widget",
                                     result=tool_response.result)
        if callback:
            callback(marker, False, True)
        # Tell Gemini the widget was displayed, don't echo full result
        return json.dumps({"status": "displayed_to_user", "tool": function_name})

    if tool_response.display_type == "markdown":
        if callback:
            callback(str(tool_response.result), False, True)
        return str(tool_response.result)

    # silent: nothing to frontend, just feed back to Gemini
    return str(tool_response.result)


def run_agent_loop(
    stream_fn,
    stream_urls,
    data,
    callback=None,
    use_backend=False,
    backend_data=None,
    tools_array=None,
    system_instruction=None,
    model=None,
):
    """Run the multi-turn agent loop.

    Streams from Gemini, detects tool calls, executes them with timeout,
    emits [[TOOL:...]] markers for the frontend, prunes context, and
    loops until the model returns pure text or MAX_ITERATIONS is reached.

    Args:
        stream_fn: Bound method AIHandler._stream_response.
        stream_urls: List of streaming API URLs.
        data: Initial Gemini request data dict.
        callback: Optional streaming callback fn(chunk, done, is_function_call).
        use_backend: Whether to use backend mode.
        backend_data: Backend-format request data.
        tools_array: Gemini tools array for re-injection.
        system_instruction: System instruction dict {"parts": [{"text": "..."}]}.
        model: Model string for maxOutputTokens calculation.

    Returns:
        str: The final accumulated text response.
    """
    iteration = 0
    text_result = ""

    while iteration < MAX_ITERATIONS:
        iteration += 1
        print(f"agent_loop: Iteration {iteration}/{MAX_ITERATIONS}")

        # Stream from Gemini
        text_result, function_call = stream_fn(
            stream_urls, data, callback,
            use_backend=use_backend, backend_data=backend_data
        )

        # No tool call → done
        if not function_call:
            print(f"agent_loop: Fertig nach {iteration} Iteration(en)")
            return text_result

        # Tool call detected
        function_name = function_call.get("name", "")
        function_args = function_call.get("args", {})
        print(f"agent_loop: Tool-Call erkannt: {function_name}")

        # Pre-execution: loading placeholder for widget tools
        tool_def = registry.get(function_name)
        if tool_def and tool_def.display_type == "widget" and callback:
            loading_marker = _build_tool_marker(function_name, "loading")
            callback(loading_marker, False, True)

        # Execute tool (with timeout from ToolDefinition)
        tool_response = execute_tool(function_name, function_args)

        # Handle response: emit markers, build Gemini response
        gemini_response = _handle_tool_response(function_name, tool_response, callback)

        # Append function call + response to contents
        contents = data.get("contents", [])
        contents.append({
            "role": "model",
            "parts": [{"functionCall": function_call}]
        })
        contents.append({
            "role": "function",
            "parts": [{"functionResponse": {
                "name": function_name,
                "response": {"result": gemini_response}
            }}]
        })

        # Prune contents if over budget
        contents = _prune_contents(contents)

        # Rebuild data for next iteration
        max_tokens = 8192 if model and "gemini-3-flash-preview" in model.lower() else 2000
        data = {
            "contents": contents,
            "generationConfig": {"temperature": 0.7, "maxOutputTokens": max_tokens}
        }
        if system_instruction:
            data["systemInstruction"] = system_instruction
        if tools_array:
            data["tools"] = tools_array

        # Don't use backend for follow-up tool response calls
        use_backend = False
        backend_data = None

    # Max iterations reached
    print(f"agent_loop: Maximale Iterationen ({MAX_ITERATIONS}) erreicht")
    if callback:
        callback("", True, False)
    return text_result or ""
```

- [ ] **Step 2: Verify the module imports correctly**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
python3 -c "from agent_loop import run_agent_loop, _build_tool_marker, _prune_contents; print('OK')"
```
Expected: `OK`

- [ ] **Step 3: Verify _build_tool_marker output**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
python3 -c "
from agent_loop import _build_tool_marker
print(_build_tool_marker('spawn_plusi', 'loading'))
print(_build_tool_marker('spawn_plusi', 'widget', result={'mood': 'happy', 'text': 'Hey!'}))
print(_build_tool_marker('spawn_plusi', 'error', error='Timeout nach 30s'))
"
```
Expected:
```
[[TOOL:{"name": "spawn_plusi", "displayType": "loading"}]]
[[TOOL:{"name": "spawn_plusi", "displayType": "widget", "result": {"mood": "happy", "text": "Hey!"}}]]
[[TOOL:{"name": "spawn_plusi", "displayType": "error", "error": "Timeout nach 30s"}]]
```

- [ ] **Step 4: Verify _prune_contents works**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
python3 -c "
from agent_loop import _prune_contents, MAX_CONTEXT_CHARS
# Small contents — should pass through unchanged
small = [{'role': 'user', 'text': 'hi'}] * 5
assert _prune_contents(small) == small, 'Small contents should be unchanged'
print('Small contents: OK')

# Large contents — should prune middle
import json
big_entry = {'role': 'model', 'parts': [{'text': 'x' * 30000}]}
large = [big_entry] * 10  # ~300k chars
pruned = _prune_contents(large)
total = sum(len(json.dumps(c)) for c in pruned)
assert total <= MAX_CONTEXT_CHARS, f'Pruned too large: {total}'
assert len(pruned) < len(large), 'Should have fewer entries'
print(f'Large contents: OK (pruned {len(large)} -> {len(pruned)} entries)')
"
```

- [ ] **Step 5: Commit**

```bash
git add agent_loop.py
git commit -m "refactor(agent): rewrite agent_loop with generic [[TOOL:...]] markers, pruning, loading states"
```

---

### Task 3: Remove non-streaming tool execution path from ai_handler.py

**Files:**
- Modify: `ai_handler.py:690-757` (non-streaming tool execution)

The non-streaming path in `_get_google_response()` calls `execute_tool()` directly and expects a string back. Since `execute_tool()` now returns `ToolResponse`, this path would break. Per the spec, we remove it — the streaming path via `run_agent_loop()` handles everything.

- [ ] **Step 1: Remove the non-streaming tool execution block**

In `ai_handler.py`, find the block starting at approximately line 690 (`if function_call:`) through approximately line 757 (`raise Exception("Konnte finale Antwort...")`). Replace the entire `if function_call:` block (lines 690-762) with a comment and pass-through to normal text extraction:

The section to replace starts with:
```python
                        if function_call:
                            function_name = function_call.get("name", "")
```

And ends just before:
```python
                        # Kein Function Call - normale Text-Antwort
```

Replace that entire block with:
```python
                        # Tool calls are handled by run_agent_loop() in the
                        # streaming path. Non-streaming path returns text only.
```

This means the non-streaming `_get_google_response()` method no longer handles tool calls at all. If Gemini returns a function call in non-streaming mode, it falls through to the text extraction below (which will find no text and raise an exception, causing a fallback to streaming). This is the correct behavior — tool calls should go through the agent loop.

- [ ] **Step 2: Remove the now-unused import**

In the same method, remove the conditional import of `execute_tool` that was inside the deleted block (lines ~697-699):
```python
                                try:
                                    from .tool_executor import execute_tool
                                except ImportError:
                                    from tool_executor import execute_tool
```
This import is gone since the whole block is deleted.

- [ ] **Step 3: Commit**

```bash
git add ai_handler.py
git commit -m "refactor(ai): remove non-streaming tool execution path, all tools go through agent_loop"
```

---

### Task 4: Swap frontend PLUSI_DATA markers for generic TOOL markers

**Files:**
- Modify: `frontend/src/components/ChatMessage.jsx:1397-1411` (parsing)
- Modify: `frontend/src/components/ChatMessage.jsx:1497-1498` (cleanup regex)
- Modify: `frontend/src/App.jsx:882-886, 918` (marker construction)

This is the minimal bridging change. We swap the `[[PLUSI_DATA:...]]` and `[[PLUSI_LOADING]]` patterns for the new generic `[[TOOL:...]]` format. The full widget system is Spec 2 — here we just make Plusi work with the new markers.

- [ ] **Step 1: Update ChatMessage.jsx parser**

In `frontend/src/components/ChatMessage.jsx`, find the Plusi parsing block (around line 1397-1411). Replace:

```javascript
        // 5. Plusi Data Parsing ([[PLUSI_DATA: {...}]] or [[PLUSI_LOADING]])
        const plusiMatch = fixedMessage.match(/\[\[PLUSI_DATA:\s*(\{[\s\S]*?\})\s*\]\]/);
        if (plusiMatch && plusiMatch[1]) {
            try {
                const data = JSON.parse(plusiMatch[1]);
                if (data && data.text) {
                    setPlusiData(data);
                }
            } catch (e) {
                console.warn('Failed to parse PLUSI_DATA:', e);
            }
        } else if (fixedMessage.includes('[[PLUSI_LOADING]]')) {
            // Show loading widget while Plusi's AI call is in progress
            setPlusiData({ _loading: true });
        }
```

With:

```javascript
        // 5. Tool markers ([[TOOL:{...}]])
        const toolMatches = fixedMessage.matchAll(/\[\[TOOL:(\{.*?\})\]\]/g);
        for (const match of toolMatches) {
            try {
                const toolData = JSON.parse(match[1]);
                if (toolData.name === 'spawn_plusi') {
                    if (toolData.displayType === 'loading') {
                        setPlusiData({ _loading: true });
                    } else if (toolData.displayType === 'widget' && toolData.result) {
                        setPlusiData(toolData.result);
                    } else if (toolData.displayType === 'error') {
                        setPlusiData({ _error: true, message: toolData.error });
                    }
                }
                // Future tools will be handled here
            } catch (e) {
                console.warn('Failed to parse TOOL marker:', e);
            }
        }
```

- [ ] **Step 2: Update ChatMessage.jsx cleanup regex**

In the same file, find the metadata cleanup section (around line 1492-1498). Replace:

```javascript
  processedMessage = processedMessage.replace(/\[\[PLUSI_DATA:\s*\{[\s\S]*?\}\s*\]\]/g, '');
  processedMessage = processedMessage.replace(/\[\[PLUSI_LOADING\]\]/g, '');
```

With:

```javascript
  processedMessage = processedMessage.replace(/\[\[TOOL:\{.*?\}\]\]/g, '');
```

- [ ] **Step 3: Update App.jsx marker construction**

In `frontend/src/App.jsx`, find the two places where `[[PLUSI_DATA:` markers are constructed (around lines 882 and 918). These are for when the frontend constructs Plusi markers itself (e.g., from direct frontend events).

Replace each `[[PLUSI_DATA: ${JSON.stringify({...})}]]` with the new format:

Line ~882:
```javascript
            const plusiMarker = `[[TOOL:${JSON.stringify({
              name: "spawn_plusi",
              displayType: "widget",
              result: { mood: payload.mood, text: payload.text, meta: meta }
            })}]]`;
```

Line ~918:
```javascript
              const plusiMarker = `[[TOOL:${JSON.stringify({
                name: "spawn_plusi",
                displayType: "widget",
                result: { mood: result.mood, text: result.text, meta: result.meta }
              })}]]`;
```

- [ ] **Step 4: Build frontend and verify**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend"
npm run build
```
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ChatMessage.jsx frontend/src/App.jsx
git commit -m "refactor(frontend): swap PLUSI_DATA/PLUSI_LOADING for generic [[TOOL:...]] markers"
```

---

### Task 5: End-to-end verification in Anki

**Files:** None (testing only)

- [ ] **Step 1: Verify module imports**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
python3 -c "
from tool_registry import registry
from tool_executor import execute_tool, ToolResponse
from agent_loop import run_agent_loop, _build_tool_marker, _prune_contents

# Verify Mermaid tool
t = registry.get('create_mermaid_diagram')
assert t.display_type == 'markdown'
assert t.timeout_seconds == 10

# Verify Plusi tool
t2 = registry.get('spawn_plusi')
assert t2.display_type == 'widget'
assert t2.timeout_seconds == 30

# Verify execute_tool returns ToolResponse
result = execute_tool('create_mermaid_diagram', {'diagram_type': 'flowchart', 'code': 'graph TD\n  A-->B'})
assert isinstance(result, ToolResponse)
assert result.status == 'success'
assert result.display_type == 'markdown'
assert 'mermaid' in result.result

# Verify unknown tool returns error ToolResponse
err = execute_tool('nonexistent_tool', {})
assert isinstance(err, ToolResponse)
assert err.status == 'error'
assert err.error_message == 'Unknown tool: nonexistent_tool'

print('All assertions passed!')
"
```

- [ ] **Step 2: Verify timeout works**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
python3 -c "
import time
from tool_executor import _run_with_timeout

# Fast function — should succeed
result = _run_with_timeout(lambda args: 'ok', {}, timeout=5)
assert result == 'ok', f'Expected ok, got {result}'
print('Fast function: OK')

# Slow function — should timeout
try:
    _run_with_timeout(lambda args: time.sleep(10), {}, timeout=1)
    assert False, 'Should have raised TimeoutError'
except TimeoutError:
    print('Timeout: OK')
"
```

- [ ] **Step 3: Build frontend for Anki**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend"
npm run build
```

- [ ] **Step 4: Manual test in Anki**

Restart Anki and test:
1. Send a normal chat message → should stream response as before
2. Ask something that triggers Mermaid → diagram should appear inline
3. Trigger Plusi (emotional message) → should see loading placeholder, then Plusi widget
4. Verify no `[[PLUSI_DATA:` or `[[PLUSI_LOADING]]` appears as raw text in chat

- [ ] **Step 5: Final commit (build output)**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
git add web/
git commit -m "build: rebuild frontend with generic [[TOOL:...]] marker support"
```
