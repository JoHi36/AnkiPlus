"""
agent_loop.py — Multi-turn agent loop with generic tool handling.

Handles tool calls from Gemini, emits [[TOOL:...]] markers for the frontend,
prunes context when it exceeds budget, and supports graceful error degradation.
"""

import json

try:
    from .tool_executor import execute_tool
    from .tools import registry
except ImportError:
    from tool_executor import execute_tool
    from tools import registry

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

MAX_ITERATIONS = 5          # Maximum tool-call cycles per agent run (prevents infinite loops)
MAX_CONTEXT_CHARS = 100_000  # ~25k tokens — prune threshold for Gemini context window


def _build_tool_marker(name: str, marker_type: str, result=None, error=None,
                       extra_fields: dict = None) -> str:
    """Build a [[TOOL:{...}]] marker string for the frontend.

    Args:
        name: Tool name (e.g. 'spawn_plusi').
        marker_type: One of 'loading', 'widget', 'error'.
        result: Tool result data (for 'widget' type).
        error: Error message string (for 'error' type).
        extra_fields: Optional dict of additional fields to merge into the payload.
    """
    payload = {"name": name, "displayType": marker_type}
    if result is not None:
        payload["result"] = result
    if error is not None:
        payload["error"] = error
    if extra_fields:
        payload.update(extra_fields)
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

        # Research tools: return full content + citation instructions to the model
        if function_name in RESEARCH_TOOL_NAMES and isinstance(tool_response.result, dict):
            sources = tool_response.result.get('sources', [])
            answer = tool_response.result.get('answer', '')
            source_lines = []
            for i, src in enumerate(sources, 1):
                title = src.get('title', '')
                url = src.get('url', '')
                source_lines.append(f"[[WEB:{i}]] {title} ({url})")
            sources_text = '\n'.join(source_lines)
            return (
                f"WEB-RECHERCHE-ERGEBNIS:\n{answer}\n\n"
                f"QUELLEN:\n{sources_text}\n\n"
                f"WICHTIG: Verwende [[WEB:N]] als Inline-Referenzen in deiner Antwort. "
                f"Beispiel: 'Die Banane ist krumm wegen negativem Geotropismus [[WEB:1]].' "
                f"Schreibe NICHT [1] oder (Quelle 1), sondern exakt [[WEB:1]], [[WEB:2]] etc."
            )

        # Tell Gemini the widget was displayed, don't echo full result
        return json.dumps({"status": "displayed_to_user", "tool": function_name})

    if tool_response.display_type == "markdown":
        if callback:
            callback(str(tool_response.result), False, True)
        return str(tool_response.result)

    # silent: nothing to frontend, just feed back to Gemini
    return str(tool_response.result)


RESEARCH_TOOL_NAMES = frozenset({'search_web', 'search_pubmed', 'search_wikipedia'})


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
    pending_function_call=None,
    pipeline_step_callback=None,
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
        pending_function_call: If set, skip the first stream_fn call and use
            this function call directly (for when the caller already received it).
        pipeline_step_callback: Optional fn(step, status, data) to emit reasoning steps.

    Returns:
        str: The final accumulated text response.
    """
    iteration = 0
    text_result = ""
    _prev_call_key = None  # Loop detection: (name, args_json)

    while iteration < MAX_ITERATIONS:
        iteration += 1
        logger.debug("agent_loop: Iteration %d/%d", iteration, MAX_ITERATIONS)

        # If we have a pending function call from the caller, use it directly
        if pending_function_call is not None:
            function_call = pending_function_call
            pending_function_call = None  # Only use once
        else:
            # Stream from Gemini
            text_result, function_call = stream_fn(
                stream_urls, data, callback,
                use_backend=use_backend, backend_data=backend_data
            )

        # No tool call → done
        if not function_call:
            logger.info("agent_loop: Fertig nach %d Iteration(en)", iteration)
            return text_result

        # Tool call detected
        function_name = function_call.get("name", "")
        function_args = function_call.get("args", {})
        logger.info("agent_loop: Tool-Call erkannt: %s", function_name)

        # Loop detection: abort if model repeats the exact same tool call
        call_key = (function_name, json.dumps(function_args, sort_keys=True))
        if call_key == _prev_call_key:
            logger.warning("agent_loop: Duplicate tool call detected (%s), breaking loop", function_name)
            break
        _prev_call_key = call_key

        # Pre-execution: loading placeholder for widget tools
        tool_def = registry.get(function_name)
        if tool_def and tool_def.display_type == "widget" and callback:
            loading_marker = _build_tool_marker(function_name, "loading")
            callback(loading_marker, False, True)

        # Emit web_search reasoning step for research tools
        is_research_tool = function_name in RESEARCH_TOOL_NAMES
        if is_research_tool and pipeline_step_callback:
            pipeline_step_callback(
                'web_search', 'active',
                {'query': function_args.get('query', ''), 'tool': function_name},
            )

        # Execute tool (with timeout from ToolDefinition)
        tool_response = execute_tool(function_name, function_args)

        # Emit web_search done step with sources info
        if is_research_tool and pipeline_step_callback:
            step_data = {'tool_used': function_name.replace('search_', ''), 'query': function_args.get('query', '')}
            if tool_response.status == 'success' and isinstance(tool_response.result, dict):
                sources = tool_response.result.get('sources', [])
                step_data['source_count'] = len(sources)
                step_data['sources'] = sources[:5]
            pipeline_step_callback('web_search', 'done', step_data)

        # Handle response: emit markers, build Gemini response
        gemini_response = _handle_tool_response(function_name, tool_response, callback)

        # Terminal tools (UI-only signals like compact): stop loop after execution
        if tool_def and tool_def.display_type == "widget" and tool_response.result and isinstance(tool_response.result, dict) and tool_response.result.get("type") == "compact":
            logger.info("agent_loop: Terminal tool '%s', stopping loop", function_name)
            if callback:
                callback("", True, False)
            return text_result or ""

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
        max_tokens = 8192 if model and "gemini-3-flash-preview" in model.lower() else 4096
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
    logger.warning("agent_loop: Maximale Iterationen (%d) erreicht", MAX_ITERATIONS)
    if callback:
        callback("", True, False)
    return text_result or ""
