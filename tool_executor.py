try:
    from .tool_registry import registry
except ImportError:
    from tool_registry import registry


# Global callback for tools that need to communicate with the frontend
_frontend_callback = None


def set_frontend_callback(callback):
    """Set a callback function for tools that need to push events to frontend."""
    global _frontend_callback
    _frontend_callback = callback


def get_frontend_callback():
    """Get the frontend callback (or None)."""
    return _frontend_callback


def execute_tool(tool_name, args):
    """
    Execute a tool by name with the given arguments.

    Args:
        tool_name: The function name from Gemini's functionCall
        args: Dict of arguments from Gemini's functionCall

    Returns:
        str: The tool result (to be sent back to Gemini as functionResponse)
    """
    print(f"[tool_executor] Executing tool: {tool_name}, args: {args}")

    tool = registry.get(tool_name)
    if tool is None:
        error_msg = f"Unknown tool: {tool_name}"
        print(f"[tool_executor] Error: {error_msg}")
        return error_msg

    try:
        # For spawn_plusi, inject frontend callback
        if tool_name == 'spawn_plusi' and _frontend_callback:
            args['_frontend_callback'] = _frontend_callback

        result = tool.execute_fn(args)
        print(f"[tool_executor] Tool '{tool_name}' returned: {result}")
        return result
    except Exception as e:
        error_msg = f"Error executing tool '{tool_name}': {e}"
        print(f"[tool_executor] {error_msg}")
        return error_msg
