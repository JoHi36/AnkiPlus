# Spec: Agentischer Kern — Agent Loop + Tool-System

**Date:** 2026-03-19
**Scope:** Backend-Kern (Spec 1 von 2). Spec 2 (neue Tools + Frontend-Widgets) baut darauf auf.
**Files affected:** `agent_loop.py`, `tool_registry.py`, `tool_executor.py`, `ai_handler.py`

## Problem

The current agent framework has structural issues that block building a real agentic learning assistant:

1. **Plusi special-cased** — `agent_loop.py` has hardcoded logic for `spawn_plusi` (JSON parsing, `[[PLUSI_DATA:...]]` marker injection). Every new widget-type tool would need its own special case.
2. **Tool responses are unstructured strings** — no way to distinguish success/error, no metadata for frontend rendering.
3. **No timeout** — a hanging tool call blocks the entire agent loop and UI.
4. **Contents grow unbounded** — the `contents` array in the agent loop accumulates messages and tool results without pruning, eventually hitting token limits.
5. **No error handling** — tool failures are returned as error strings to the AI, invisible to the user.

## Design

### 1. ToolDefinition (extended)

Add two fields to the existing dataclass in `tool_registry.py`:

```python
@dataclass
class ToolDefinition:
    name: str
    schema: Dict[str, Any]           # Gemini function declaration
    execute_fn: Callable
    display_type: str = "markdown"   # "markdown" | "widget" | "silent"
    category: str = "content"
    config_key: Optional[str] = None
    agent: str = "tutor"
    disabled_modes: List[str] = field(default_factory=list)
    timeout_seconds: int = 30        # Per-tool timeout
```

**display_type values:**

| Type | Behavior | Example |
|------|----------|---------|
| `markdown` | Result embedded as markdown in chat text | Mermaid diagram |
| `widget` | Own React widget with tool-specific rendering | Plusi, card preview, learning stats |
| `silent` | No visible result — tool acts in background, AI explains via text | Create card, switch deck |

### 2. ToolResponse

New dataclass — the structured envelope that replaces raw strings:

```python
@dataclass
class ToolResponse:
    status: str            # "success" | "error"
    result: Any            # The actual content (string, dict, etc.)
    display_type: str      # Inherited from ToolDefinition
    error_message: str = ""  # User-facing error description (on failure)
```

**Key principle:** Tool execute functions continue to return simple values (strings, dicts). The executor wraps them into ToolResponse. Tools don't need to know about the envelope.

### 3. Tool Executor (rewritten)

`tool_executor.py` gets timeout support and builds the ToolResponse envelope:

```python
def execute_tool(tool_name: str, args: Dict[str, Any]) -> ToolResponse:
    tool = registry.get(tool_name)
    if not tool:
        return ToolResponse(
            status="error", result="",
            display_type="silent",
            error_message=f"Unknown tool: {tool_name}"
        )
    try:
        result = _run_with_timeout(tool.execute_fn, args, tool.timeout_seconds)
        return ToolResponse(
            status="success", result=result,
            display_type=tool.display_type
        )
    except TimeoutError:
        return ToolResponse(
            status="error", result="",
            display_type=tool.display_type,
            error_message=f"{tool.name}: Timeout nach {tool.timeout_seconds}s"
        )
    except Exception as e:
        return ToolResponse(
            status="error", result="",
            display_type=tool.display_type,
            error_message=str(e)
        )
```

**Timeout mechanism:** `threading.Timer` + `threading.Event`. The tool function runs in a thread; if it doesn't complete within `timeout_seconds`, a `TimeoutError` is raised. No external dependencies.

```python
def _run_with_timeout(fn: Callable, args: Dict, timeout: int) -> Any:
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
```

### 4. Agent Loop (rewritten)

Three changes to `agent_loop.py`:

#### a) Generic tool marker (replaces Plusi special-case)

After executing a tool, the loop emits a stream marker based on `display_type`:

```python
tool_response = execute_tool(function_name, function_args)

if tool_response.status == "error":
    # Graceful degradation: error widget inline + AI gets error info
    marker = _build_tool_marker(function_name, "error", error=tool_response.error_message)
    if callback:
        callback(marker, False, True)
    # Build error response for Gemini
    gemini_response = f"Error: {tool_response.error_message}"

elif tool_response.display_type == "widget":
    marker = _build_tool_marker(function_name, "widget", result=tool_response.result)
    if callback:
        callback(marker, False, True)
    gemini_response = _sanitize_for_gemini(function_name, tool_response.result)

elif tool_response.display_type == "markdown":
    if callback:
        callback(str(tool_response.result), False, True)
    gemini_response = str(tool_response.result)

elif tool_response.display_type == "silent":
    # Nothing to frontend, just feed back to Gemini
    gemini_response = str(tool_response.result)
```

The `_build_tool_marker` function produces the unified marker format:

```python
def _build_tool_marker(name: str, display_type: str, result=None, error=None) -> str:
    payload = {"name": name, "displayType": display_type}
    if result is not None:
        payload["result"] = result
    if error is not None:
        payload["error"] = error
    return f"[[TOOL:{json.dumps(payload, ensure_ascii=False)}]]"
```

#### b) Graceful degradation on errors

When a tool fails (timeout, exception, unknown tool):
1. An error marker is sent to the frontend: `[[TOOL:{"name":"spawn_plusi","displayType":"error","error":"Timeout nach 30s"}]]`
2. The frontend renders an inline error widget (defined in Spec 2)
3. The AI receives the error as a function response and can adapt its text accordingly
4. The agent loop continues — it does NOT abort

#### c) Smart context pruning

Budget: ~100,000 characters (≈25k tokens) for the entire `contents` array.

```python
MAX_CONTEXT_CHARS = 100_000

def _prune_contents(contents: List[Dict]) -> List[Dict]:
    total = sum(len(json.dumps(c)) for c in contents)
    if total <= MAX_CONTEXT_CHARS:
        return contents

    # Always keep: first message (system context), last 2 interactions
    protected_head = contents[:1]
    protected_tail = contents[-4:]  # last 2 pairs (model+function or user+model)
    middle = contents[1:-4]

    # Remove oldest middle entries until under budget
    while middle and sum(len(json.dumps(c)) for c in protected_head + middle + protected_tail) > MAX_CONTEXT_CHARS:
        middle.pop(0)

    return protected_head + middle + protected_tail
```

Called before each Gemini API request in the loop.

### 5. Stream Marker Format

Unified format for all tool results in the text stream:

```
[[TOOL:{"name":"spawn_plusi","displayType":"widget","result":{"mood":"happy","text":"Hey!"}}]]
[[TOOL:{"name":"create_mermaid_diagram","displayType":"markdown","result":"```mermaid\ngraph TD\n  A-->B\n```"}]]
[[TOOL:{"name":"create_card","displayType":"silent"}]]
[[TOOL:{"name":"spawn_plusi","displayType":"error","error":"Timeout nach 30s"}]]
```

Frontend parser (Spec 2 implements this, but the contract is defined here):
- Regex: `/\[\[TOOL:(.*?)\]\]/g`
- Parse JSON payload
- Render based on `displayType`: widget → tool-specific component, markdown → inline markdown, silent → nothing, error → error badge
- During loading (before tool completes): placeholder widget with tool name + spinner

### 6. Changes to Existing Tools

**Mermaid (`create_mermaid_diagram`):**
- Add: `display_type="markdown"`, `timeout_seconds=10`
- No change to `execute_mermaid()` function
- Agent loop no longer needs to know about Mermaid specifically

**Plusi (`spawn_plusi`):**
- Add: `display_type="widget"`, `timeout_seconds=30`
- No change to `execute_plusi()` function — still returns `{mood, text}`
- **Delete:** All `spawn_plusi` special-case code in `agent_loop.py` (the `if function_name == 'spawn_plusi'` block, `[[PLUSI_DATA:...]]` injection, result sanitization)
- The generic widget marker system handles it now

### 7. Max Iterations

Stays hardcoded at 5 in `agent_loop.py`. Sufficient for all current use cases. Will move to admin console configuration in the future.

### 8. Migration Path

1. Add `ToolResponse` dataclass and `_run_with_timeout` to `tool_executor.py`
2. Update `execute_tool()` to return `ToolResponse` instead of string
3. Add `display_type` and `timeout_seconds` to `ToolDefinition` dataclass
4. Update Mermaid and Plusi registrations with new fields
5. Rewrite agent loop: generic marker system, remove Plusi special-case, add pruning
6. Update `ai_handler.py` to work with new `ToolResponse` (wherever it inspects tool results)
7. Update frontend `[[PLUSI_DATA:...]]` parser to new `[[TOOL:...]]` format (minimal change, bridges to Spec 2)

### 9. Out of Scope

- New tools (Spec 2)
- Frontend widget components (Spec 2)
- Frontend `[[TOOL:...]]` parser implementation (Spec 2, format defined here)
- Admin console configuration (future)
- Multi-model support (future)
- Token counting with real tokenizer (character heuristic is sufficient)
