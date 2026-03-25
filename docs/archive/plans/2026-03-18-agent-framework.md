# Agent Framework Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inline tool-calling code in `ai_handler.py` with a proper agent framework — central tool registry, multi-turn agent loop, and generic tool executor — then migrate the existing Mermaid tool into it.

**Architecture:** Three new Python files (`tool_registry.py`, `tool_executor.py`, `agent_loop.py`) extract and generalize the tool-calling logic currently hardcoded in `ai_handler.py`. The existing Mermaid tool is migrated as the first registered tool. `ai_handler.py` is modified to delegate to the agent loop instead of handling tools inline. No frontend changes in this sub-project.

**Tech Stack:** Python 3.9+, Google Gemini API (function calling), SQLite (existing), PyQt6 (existing threading model).

**Spec:** `docs/superpowers/specs/2026-03-18-plusi-unified-identity.md` — Section 3 (Agent Framework)

**Build/verify command:** Since this is an Anki addon with no Python test suite, verification is:
- Syntax check: `python3 -m py_compile <file>` (avoids relative import issues outside Anki)
- Integration: Restart Anki, send a message that triggers a Mermaid diagram, verify it still renders correctly.

**Note on imports:** All new Python files use `try/except` import pattern to support both Anki's package loading (relative imports) and standalone syntax checking (absolute imports). The spec mentions "Image tool migration" but `search_image` is NOT a Gemini function-calling tool in the current codebase — images are handled via bridge/frontend inline URLs. No migration needed.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `tool_registry.py` | **Create** | Central tool definitions — schema, execute fn, category, enabled flag |
| `tool_executor.py` | **Create** | Routes tool calls to the correct handler, error handling |
| `agent_loop.py` | **Create** | Multi-turn agent loop — calls Gemini, detects tool calls, executes, loops |
| `ai_handler.py` | **Modify** | Remove inline tool handling, delegate to agent loop |
| `config.py` | **Modify** | No changes needed — existing `ai_tools` config pattern is reused |

---

## Task 1: Create tool_registry.py

**Files:**
- Create: `tool_registry.py`

- [ ] **Step 1: Create the tool registry module**

```python
# tool_registry.py
"""
Central registry for all AI tools (Gemini function calling).

Each tool has:
- name: unique identifier (matches Gemini functionDeclarations name)
- schema: Gemini-format function declaration dict
- execute_fn: callable(args_dict) -> str (returns result as string)
- category: 'content' | 'action' (content = renders in chat, action = does something)
- config_key: key in config["ai_tools"] that enables/disables this tool (nullable)
- agent: 'tutor' | 'plusi' — which agent owns this tool
"""


class ToolDefinition:
    """A single registered tool."""

    def __init__(self, name, schema, execute_fn, category='content', config_key=None, agent='tutor', disabled_modes=None):
        self.name = name
        self.schema = schema  # Gemini functionDeclarations format
        self.execute_fn = execute_fn
        self.category = category
        self.config_key = config_key  # e.g., 'diagrams' → checked against config["ai_tools"]["diagrams"]
        self.agent = agent  # 'tutor' or 'plusi'
        self.disabled_modes = disabled_modes or []  # e.g., ['compact'] — tool disabled in these modes


class ToolRegistry:
    """Central registry for all AI tools."""

    def __init__(self):
        self._tools = {}  # name -> ToolDefinition

    def register(self, tool):
        """Register a ToolDefinition."""
        if not isinstance(tool, ToolDefinition):
            raise TypeError(f"Expected ToolDefinition, got {type(tool)}")
        self._tools[tool.name] = tool

    def get(self, name):
        """Get a tool by name. Returns None if not found."""
        return self._tools.get(name)

    def get_function_declarations(self, agent='tutor', ai_tools_config=None, mode='compact'):
        """
        Build Gemini functionDeclarations array for the given agent.

        Args:
            agent: 'tutor' or 'plusi' — filter tools by owner
            ai_tools_config: dict from config["ai_tools"], e.g. {"diagrams": True, "images": True}
            mode: 'compact' or 'detailed' — some tools are disabled in compact mode

        Returns:
            list of function declaration dicts, or empty list if no tools enabled
        """
        ai_tools_config = ai_tools_config or {}
        declarations = []

        for tool in self._tools.values():
            if tool.agent != agent:
                continue

            # Check config toggle (if tool has a config_key)
            if tool.config_key and not ai_tools_config.get(tool.config_key, True):
                continue

            # Check mode restrictions (e.g., diagrams disabled in compact mode)
            if mode in tool.disabled_modes:
                continue

            declarations.append(tool.schema)

        return declarations

    def list_tools(self, agent='tutor'):
        """List all tool names for an agent."""
        return [t.name for t in self._tools.values() if t.agent == agent]


# ──────────────────────────────────────────────
# Mermaid Diagram Tool (migrated from ai_handler.py)
# ──────────────────────────────────────────────

"""
IMPORTANT: This is copied verbatim from ai_handler.py MERMAID_TOOL.
Do NOT shorten the description — it contains critical color restrictions
that prevent the AI from generating diagrams with explicit colors.
"""
MERMAID_SCHEMA = {
    "name": "create_mermaid_diagram",
    "description": """Erstellt ein Mermaid-Diagramm zur Visualisierung von Konzepten, Prozessen oder Strukturen.

Unterstützte Diagrammtypen:
- flowchart: Flowcharts für Prozesse und Abläufe (graph TD, graph LR, etc.)
- sequenceDiagram: Sequenzdiagramme für Interaktionen zwischen Entitäten
- gantt: Gantt-Charts für Zeitpläne und Projektphasen
- classDiagram: Klassendiagramme für Strukturen und Hierarchien
- stateDiagram-v2: Zustandsdiagramme für Zustandsübergänge
- erDiagram: Entity-Relationship-Diagramme für Beziehungen
- pie: Kreisdiagramme für Verteilungen
- gitGraph: Git-Graphen für Versionskontrolle
- timeline: Timeline-Diagramme für zeitliche Abläufe
- journey: Journey-Diagramme für Prozesse mit Phasen
- mindmap: Mindmaps für hierarchische Strukturen
- quadrantChart: Quadrant-Charts für 2D-Klassifikationen
- requirement: Requirement-Diagramme für Anforderungen
- userJourney: User Journey für Nutzerpfade
- sankey-beta: Sankey-Diagramme für Flüsse und Mengen

WICHTIG: Mermaid akzeptiert NUR reinen Text - keine HTML-Tags oder Markdown-Formatierung im Code!
Verwende \\n für Zeilenumbrüche und Anführungszeichen für Labels mit Leerzeichen.

KRITISCH - FARBEN:
- Verwende KEINE expliziten Farben im Code (keine 'style' Statements, keine 'classDef' mit fill/stroke Farben)
- Verwende KEINE Farbnamen (z.B. orange, red, pink) oder Hex-Codes (z.B. #ff0000) im Diagramm-Code
- Verwende KEINE Subgraphs mit expliziten Farben
- Mermaid verwendet automatisch konsistente Farben basierend auf dem Theme (Grautöne mit Teal-Akzenten)
- Alle Knoten sollten die Standard-Farben verwenden - keine manuellen Farbzuweisungen nötig!""",
    "parameters": {
        "type": "object",
        "properties": {
            "diagram_type": {
                "type": "string",
                "enum": [
                    "flowchart", "sequenceDiagram", "gantt", "classDiagram",
                    "stateDiagram-v2", "erDiagram", "pie", "gitGraph",
                    "timeline", "journey", "mindmap", "quadrantChart",
                    "requirement", "userJourney", "sankey-beta"
                ],
                "description": "Der Typ des Mermaid-Diagramms"
            },
            "code": {
                "type": "string",
                "description": "Der Mermaid-Code für das Diagramm (ohne ```mermaid Markdown-Wrapper). WICHTIG: Nur reiner Text, keine HTML-Tags oder Markdown-Formatierung! Verwende \\n für Zeilenumbrüche."
            }
        },
        "required": ["diagram_type", "code"]
    }
}


def execute_mermaid(args):
    """Execute the create_mermaid_diagram tool. Returns markdown code block."""
    diagram_type = args.get("diagram_type", "")
    code = args.get("code", "")

    if not diagram_type or not code:
        return "Fehler: diagram_type und code sind erforderlich."

    mermaid_block = f"```mermaid\n{code}\n```"
    print(f"execute_mermaid: Diagramm erstellt - Typ: {diagram_type}, Code-Laenge: {len(code)}")
    return mermaid_block


# ──────────────────────────────────────────────
# Global registry instance + registration
# ──────────────────────────────────────────────

registry = ToolRegistry()

registry.register(ToolDefinition(
    name="create_mermaid_diagram",
    schema=MERMAID_SCHEMA,
    execute_fn=execute_mermaid,
    category='content',
    config_key='diagrams',
    agent='tutor',
    disabled_modes=['compact'],  # diagrams disabled in compact mode
))
```

- [ ] **Step 2: Verify syntax**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
python3 -m py_compile tool_registry.py && echo "Syntax OK"
```
Expected: `Syntax OK`

- [ ] **Step 3: Commit**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
git add tool_registry.py
git commit -m "feat(agent): add central tool registry with Mermaid tool migrated"
```

---

## Task 2: Create tool_executor.py

**Files:**
- Create: `tool_executor.py`

- [ ] **Step 1: Create the tool executor module**

```python
# tool_executor.py
"""
Routes tool calls from the Gemini API to the correct handler function.

Used by the agent loop to execute tools detected in streaming responses.
"""
try:
    from .tool_registry import registry
except ImportError:
    from tool_registry import registry


def execute_tool(tool_name, args):
    """
    Execute a tool by name with the given arguments.

    Args:
        tool_name: The function name from Gemini's functionCall
        args: Dict of arguments from Gemini's functionCall

    Returns:
        str: The tool result (to be sent back to Gemini as functionResponse)

    Raises:
        ValueError: If the tool is not found in the registry
    """
    tool = registry.get(tool_name)
    if not tool:
        error_msg = f"Unbekanntes Tool: {tool_name}"
        print(f"tool_executor: {error_msg}")
        return error_msg

    try:
        print(f"tool_executor: Fuehre '{tool_name}' aus mit args: {list(args.keys())}")
        result = tool.execute_fn(args)
        print(f"tool_executor: '{tool_name}' erfolgreich, Ergebnis-Laenge: {len(str(result))}")
        return result
    except Exception as e:
        error_msg = f"Fehler bei Tool '{tool_name}': {str(e)}"
        print(f"tool_executor: {error_msg}")
        import traceback
        traceback.print_exc()
        return error_msg
```

- [ ] **Step 2: Verify syntax**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
python3 -m py_compile tool_executor.py && echo "Syntax OK"
```
Expected: `Syntax OK`

- [ ] **Step 3: Commit**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
git add tool_executor.py
git commit -m "feat(agent): add tool executor — routes tool calls to registered handlers"
```

---

## Task 3: Create agent_loop.py

**Files:**
- Create: `agent_loop.py`

This is the core: a multi-turn loop that replaces the single-turn tool handling in `ai_handler.py`. It calls the Gemini API, checks for tool calls, executes them, sends results back, and repeats until the AI responds with just text.

- [ ] **Step 1: Create the agent loop module**

```python
# agent_loop.py
"""
Multi-turn agent loop for Gemini API with tool calling.

Replaces the single-turn tool handling in ai_handler.py.
Calls Gemini → detects tool calls → executes → sends result back → repeats.
Max iterations prevents infinite loops.
"""
import json

try:
    from .tool_executor import execute_tool
except ImportError:
    from tool_executor import execute_tool

MAX_ITERATIONS = 5


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
    """
    Run the agent loop: stream a response, handle tool calls, repeat.

    This function replaces the inline tool handling in _get_google_response_streaming().
    It uses the existing _stream_response() method for actual API calls.

    Args:
        stream_fn: The _stream_response method from AIHandler (bound method)
        stream_urls: List of streaming API URLs
        data: Initial request data dict (contents, generationConfig, etc.)
        callback: Streaming callback fn(chunk, done, is_function_call)
        use_backend: Whether to use backend mode
        backend_data: Backend-format request data (if use_backend)
        tools_array: The tools array for Gemini API (for re-injection on follow-up calls)
        system_instruction: System instruction dict (for re-injection on follow-up calls)
        model: Model string (for max_tokens calculation)

    Returns:
        str: The final text response
    """
    contents = data.get("contents", [])
    iteration = 0

    while iteration < MAX_ITERATIONS:
        iteration += 1
        print(f"agent_loop: Iteration {iteration}/{MAX_ITERATIONS}")

        # Stream the response
        text_result, function_call = stream_fn(
            stream_urls, data, callback,
            use_backend=use_backend,
            backend_data=backend_data,
        )

        # No tool call — we're done
        if not function_call:
            print(f"agent_loop: Fertig nach {iteration} Iteration(en)")
            return text_result

        # Tool call detected — execute it
        function_name = function_call.get("name", "")
        function_args = function_call.get("args", {})
        print(f"agent_loop: Tool-Call erkannt: {function_name}")

        tool_result = execute_tool(function_name, function_args)

        # Build follow-up request with function response
        # Append model's function call to contents
        contents.append({
            "role": "model",
            "parts": [{"functionCall": function_call}]
        })

        # Append tool result as function response
        contents.append({
            "role": "function",
            "parts": [{
                "functionResponse": {
                    "name": function_name,
                    "response": {"result": tool_result}
                }
            }]
        })

        # Rebuild request data for next iteration
        max_tokens = 8192 if model and "gemini-3-flash-preview" in model.lower() else 2000
        data = {
            "contents": contents,
            "generationConfig": {
                "temperature": 0.7,
                "maxOutputTokens": max_tokens,
            }
        }

        if system_instruction:
            data["systemInstruction"] = system_instruction

        if tools_array:
            data["tools"] = tools_array

        # Don't use backend for follow-up tool response calls
        use_backend = False
        backend_data = None

        print(f"agent_loop: Sende Tool-Ergebnis zurueck, naechste Iteration...")

    # Max iterations reached
    print(f"agent_loop: Max Iterationen ({MAX_ITERATIONS}) erreicht")
    if callback:
        callback("", True, False)
    return text_result or ""
```

- [ ] **Step 2: Verify syntax**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
python3 -m py_compile agent_loop.py && echo "Syntax OK"
```
Expected: `Syntax OK`

- [ ] **Step 3: Commit**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
git add agent_loop.py
git commit -m "feat(agent): add multi-turn agent loop — replaces single-turn tool handling"
```

---

## Task 4: Integrate agent loop into ai_handler.py

**Files:**
- Modify: `ai_handler.py`

This is the critical integration step. We modify `_get_google_response_streaming()` to:
1. Use `tool_registry` for tool declarations instead of inline `MERMAID_TOOL`
2. Delegate to `agent_loop.run_agent_loop()` instead of inline tool handling
3. Remove the inline `_execute_mermaid_tool()` method and `MERMAID_TOOL` constant

**Important:** The changes must be surgical. The streaming, backend mode, RAG, and all other logic stays untouched. We only replace the tool-related parts.

- [ ] **Step 1: Add imports at top of ai_handler.py**

Find the imports section (around line 1-15) and add after the existing imports:

```python
from .tool_registry import registry as tool_registry
from .agent_loop import run_agent_loop
```

- [ ] **Step 2: Replace tools_array construction in _get_google_response_streaming()**

Find the block (around lines 1012-1019) that builds `tools_array`:

```python
# Tools Array
tools_array = []
diagrams_enabled = ai_tools.get("diagrams", True)
if diagrams_enabled and mode != 'compact':
    tools_array.append({
        "functionDeclarations": [MERMAID_TOOL]
    })
    print(f"_get_google_response_streaming: Mermaid Tool aktiviert (mode: {mode})")
```

Replace with:

```python
# Tools Array — built from central registry
declarations = tool_registry.get_function_declarations(
    agent='tutor',
    ai_tools_config=ai_tools,
    mode=mode,
)
tools_array = []
if declarations:
    tools_array.append({"functionDeclarations": declarations})
    print(f"_get_google_response_streaming: {len(declarations)} Tool(s) aktiviert (mode: {mode})")
```

- [ ] **Step 3: Replace inline tool handling with agent loop call**

Find the block (around lines 1166-1170) that calls `_stream_response` and handles the result:

```python
text_result, function_call = self._stream_response(stream_urls, data, callback, use_backend=use_backend, backend_data=backend_data)
```

And the subsequent `if function_call:` block (around lines 1172-1230) that handles the function call inline.

Replace the entire section from the `_stream_response` call through the end of the `if function_call:` block with:

```python
# Run agent loop (handles multi-turn tool calling)
system_instruction_dict = None
if system_instruction and system_instruction.strip():
    system_instruction_dict = {"parts": [{"text": system_instruction}]}

text_result = run_agent_loop(
    stream_fn=self._stream_response,
    stream_urls=stream_urls,
    data=data,
    callback=callback,
    use_backend=use_backend,
    backend_data=backend_data,
    tools_array=tools_array if tools_array else None,
    system_instruction=system_instruction_dict,
    model=model,
)
return text_result
```

**Important notes:**
- This replaces approximately 60 lines of inline tool handling with 12 lines. The `agent_loop` handles the entire tool call → execute → send back → repeat cycle.
- The existing `try:` block (around line 1164) and `except Exception` block (around line 1240) that wraps the streaming code must be **preserved**. The replacement code goes **inside** the existing `try` block, replacing only the `_stream_response` call and the `if function_call:` block.
- The `system_instruction_dict` passed to `run_agent_loop` is in Gemini API format (`{"parts": [{"text": "..."}]}`), NOT a raw string. The agent loop uses it only for rebuilding request data on subsequent iterations.
- The existing `suppress_error_callback` parameter is no longer needed for tool errors — `tool_executor.py` returns error messages gracefully to the AI instead of raising exceptions.

- [ ] **Step 4: Remove the old MERMAID_TOOL constant and _execute_mermaid_tool method**

Delete `MERMAID_TOOL` dict (lines ~98-159) and `_execute_mermaid_tool` method (lines ~274-302) from `ai_handler.py`. These now live in `tool_registry.py`.

**Important:** Also check if there are references to `MERMAID_TOOL` anywhere else in the file (there's one in the non-streaming `_get_google_response` method around line 380). If so, update that method similarly to use `tool_registry.get_function_declarations()`.

- [ ] **Step 5: Update the non-streaming _get_google_response() method**

Find the non-streaming method (around line 323) that also references `MERMAID_TOOL` and `tools_array`. Apply the same registry-based tool construction:

Find:
```python
tools_array = []
diagrams_enabled = ai_tools.get("diagrams", True)
if diagrams_enabled and mode != 'compact':
    tools_array.append({
        "functionDeclarations": [MERMAID_TOOL]
    })
```

Replace with:
```python
declarations = tool_registry.get_function_declarations(agent='tutor', ai_tools_config=ai_tools, mode=mode)
tools_array = [{"functionDeclarations": declarations}] if declarations else []
```

Also find any reference to `self._execute_mermaid_tool` in this method and replace with:
```python
from .tool_executor import execute_tool
tool_result = execute_tool(function_name, function_call.get("args", {}))
```

- [ ] **Step 6: Verify all modules compile**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
python3 -m py_compile tool_registry.py && python3 -m py_compile tool_executor.py && python3 -m py_compile agent_loop.py && python3 -m py_compile ai_handler.py && echo "All modules OK"
```
Expected: `All modules OK`

- [ ] **Step 7: Commit**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
git add ai_handler.py
git commit -m "refactor(agent): integrate agent loop into ai_handler, remove inline tool handling"
```

---

## Task 5: Integration Test in Anki

**Files:** None (manual verification)

- [ ] **Step 1: Build frontend (no changes, but ensures clean state)**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend"
npm run build 2>&1 | tail -3
```
Expected: `✓ built in X.XXs`

- [ ] **Step 2: Restart Anki and verify basic chat**

Open Anki, open the chatbot panel (Cmd+I). Send a simple text message like "Was ist Mitose?". Verify:
- Response streams normally
- No errors in terminal/console
- Response is text-only (no tool call needed)

- [ ] **Step 3: Verify Mermaid tool still works**

Send a message that should trigger a diagram, e.g. "Erstelle ein Diagramm das den Zellzyklus zeigt" (make sure mode is 'detailed', not 'compact'). Verify:
- The AI generates a Mermaid diagram
- The diagram renders correctly in the chat
- Console shows: `agent_loop: Tool-Call erkannt: create_mermaid_diagram`
- Console shows: `tool_executor: Fuehre 'create_mermaid_diagram' aus`

- [ ] **Step 4: Verify compact mode disables tools**

Switch to compact mode and send a message requesting a diagram. Verify:
- No diagram is generated (tools disabled in compact mode)
- The AI responds with text only

- [ ] **Step 5: Commit any fixes if needed**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
git add -p
git commit -m "fix(agent): integration fixes from Anki testing"
```
