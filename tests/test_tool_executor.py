"""Tests for ai/tool_executor.py — tool execution with timeout."""

import time
from ai.tool_executor import execute_tool, ToolResponse, _run_with_timeout
from ai.tools import registry, ToolDefinition


class TestRunWithTimeout:
    def test_fast_function_returns_result(self):
        result = _run_with_timeout(lambda args: 42, {}, timeout=5)
        assert result == 42

    def test_slow_function_raises_timeout(self):
        def slow(args):
            time.sleep(10)
            return "never"

        try:
            _run_with_timeout(slow, {}, timeout=1)
            assert False, "Should have raised TimeoutError"
        except TimeoutError:
            pass

    def test_exception_propagates(self):
        def failing(args):
            raise ValueError("broken")

        try:
            _run_with_timeout(failing, {}, timeout=5)
            assert False, "Should have raised ValueError"
        except ValueError as e:
            assert "broken" in str(e)

    def test_args_passed_through(self):
        def echo(args):
            return args.get("x")

        result = _run_with_timeout(echo, {"x": "hello"}, timeout=5)
        assert result == "hello"


class TestExecuteTool:
    def setup_method(self):
        """Register a test tool."""
        registry.register(ToolDefinition(
            name="_test_echo",
            schema={"name": "_test_echo", "description": "Echo", "parameters": {"type": "object", "properties": {"msg": {"type": "string"}}}},
            execute_fn=lambda args: args.get("msg", "default"),
            display_type="silent",
        ))

    def teardown_method(self):
        registry._tools.pop("_test_echo", None)

    def test_successful_execution(self):
        result = execute_tool("_test_echo", {"msg": "hello"})
        assert isinstance(result, ToolResponse)
        assert result.status == "success"
        assert result.result == "hello"
        assert result.display_type == "silent"

    def test_unknown_tool(self):
        result = execute_tool("nonexistent_tool_xyz", {})
        assert result.status == "error"
        assert "Unknown tool" in result.error_message

    def test_tool_exception_handled(self):
        registry.register(ToolDefinition(
            name="_test_failing",
            schema={"name": "_test_failing", "description": "Fail", "parameters": {"type": "object", "properties": {}}},
            execute_fn=lambda args: 1 / 0,
            display_type="silent",
        ))
        try:
            result = execute_tool("_test_failing", {})
            assert result.status == "error"
            assert "division by zero" in result.error_message
        finally:
            registry._tools.pop("_test_failing", None)

    def test_tool_timeout_handled(self):
        registry.register(ToolDefinition(
            name="_test_slow",
            schema={"name": "_test_slow", "description": "Slow", "parameters": {"type": "object", "properties": {}}},
            execute_fn=lambda args: time.sleep(10),
            display_type="widget",
            timeout_seconds=1,
        ))
        try:
            result = execute_tool("_test_slow", {})
            assert result.status == "error"
            assert "Timeout" in result.error_message
        finally:
            registry._tools.pop("_test_slow", None)

    def test_result_preserves_display_type(self):
        registry.register(ToolDefinition(
            name="_test_widget",
            schema={"name": "_test_widget", "description": "Widget", "parameters": {"type": "object", "properties": {}}},
            execute_fn=lambda args: {"cards": []},
            display_type="widget",
        ))
        try:
            result = execute_tool("_test_widget", {})
            assert result.display_type == "widget"
            assert result.result == {"cards": []}
        finally:
            registry._tools.pop("_test_widget", None)
