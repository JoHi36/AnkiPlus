"""
tool_executor.py — Execute registered tools with timeout and structured responses.
"""

import json
import threading
from dataclasses import dataclass
from typing import Any, Callable, Dict

try:
    from .tools import registry
except ImportError:
    from tools import registry

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

# Global frontend callback — allows tools to push events to the UI
_frontend_callback = None

def set_frontend_callback(callback):
    """Set the callback function that tools use to push events to the frontend."""
    global _frontend_callback
    _frontend_callback = callback

def get_frontend_callback():
    """Get the current frontend callback."""
    return _frontend_callback


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
    logger.debug("Executing tool: %s, args: %s", tool_name, args)

    tool = registry.get(tool_name)
    if tool is None:
        return ToolResponse(
            status="error", result="",
            display_type="silent",
            error_message=f"Unknown tool: {tool_name}"
        )

    try:
        result = _run_with_timeout(tool.execute_fn, args, tool.timeout_seconds)
        logger.info("Tool '%s' returned successfully", tool_name)
        return ToolResponse(
            status="success", result=result,
            display_type=tool.display_type
        )
    except TimeoutError:
        msg = f"{tool.name}: Timeout nach {tool.timeout_seconds}s"
        logger.warning("%s", msg)
        return ToolResponse(
            status="error", result="",
            display_type=tool.display_type,
            error_message=msg
        )
    except Exception as e:
        msg = f"Error executing tool '{tool_name}': {e}"
        logger.error("%s", msg)
        return ToolResponse(
            status="error", result="",
            display_type=tool.display_type,
            error_message=str(e)
        )
