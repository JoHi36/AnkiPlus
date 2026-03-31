"""Tests for ai/agent_loop.py — multi-turn agent loop logic."""

import json
from ai.agent_loop import (
    _build_tool_marker, _prune_contents,
    _handle_tool_response, run_agent_loop,
    MAX_ITERATIONS, MAX_CONTEXT_CHARS,
)
from ai.tool_executor import ToolResponse


class TestBuildToolMarker:
    def test_loading_marker(self):
        result = _build_tool_marker("search_cards", "loading")
        parsed = json.loads(result.replace("[[TOOL:", "").replace("]]", ""))
        assert parsed["name"] == "search_cards"
        assert parsed["displayType"] == "loading"

    def test_widget_marker_with_result(self):
        result = _build_tool_marker("search_cards", "widget", result={"cards": []})
        parsed = json.loads(result.replace("[[TOOL:", "").replace("]]", ""))
        assert parsed["result"] == {"cards": []}

    def test_error_marker(self):
        result = _build_tool_marker("search_cards", "error", error="Timeout")
        parsed = json.loads(result.replace("[[TOOL:", "").replace("]]", ""))
        assert parsed["error"] == "Timeout"

    def test_marker_format(self):
        result = _build_tool_marker("test", "loading")
        assert result.startswith("[[TOOL:")
        assert result.endswith("]]")

    def test_build_tool_marker_extra_fields(self):
        import json
        marker = _build_tool_marker('search_web', 'loading',
                                    extra_fields={'loadingHint': 'Searching photosynthesis...'})
        json_str = marker[len('[[TOOL:'):-len(']]')]
        data = json.loads(json_str)
        assert data['name'] == 'search_web'
        assert data['displayType'] == 'loading'
        assert data['loadingHint'] == 'Searching photosynthesis...'


class TestPruneContents:
    def test_no_pruning_when_under_budget(self):
        contents = [{"role": "user", "parts": [{"text": "Hello"}]}]
        result = _prune_contents(contents)
        assert result == contents

    def test_pruning_drops_middle_entries(self):
        # Create 8 entries where the middle ones are huge
        big_text = "X" * (MAX_CONTEXT_CHARS // 2)
        contents = [
            {"role": "user", "parts": [{"text": "first"}]},     # idx 0: head (protected)
            {"role": "model", "parts": [{"text": big_text}]},   # idx 1: middle (droppable)
            {"role": "user", "parts": [{"text": big_text}]},    # idx 2: middle (droppable)
            {"role": "model", "parts": [{"text": big_text}]},   # idx 3: middle (droppable)
            {"role": "user", "parts": [{"text": "t1"}]},        # idx 4: tail (protected)
            {"role": "model", "parts": [{"text": "t2"}]},       # idx 5: tail (protected)
            {"role": "user", "parts": [{"text": "t3"}]},        # idx 6: tail (protected)
            {"role": "user", "parts": [{"text": "last"}]},      # idx 7: tail (protected)
        ]
        result = _prune_contents(contents)
        # Should have dropped some middle entries
        assert len(result) < len(contents)
        # First entry preserved
        assert result[0]["parts"][0]["text"] == "first"
        # Last entry preserved
        assert result[-1]["parts"][0]["text"] == "last"

    def test_empty_contents(self):
        assert _prune_contents([]) == []

    def test_single_entry(self):
        contents = [{"role": "user", "parts": [{"text": "only"}]}]
        assert _prune_contents(contents) == contents


class TestHandleToolResponse:
    def test_error_response(self):
        response = ToolResponse(
            status="error", result="", display_type="widget",
            error_message="DB not available"
        )
        chunks = []
        callback = lambda text, done, is_fn: chunks.append(text)

        result = _handle_tool_response("search_cards", response, callback)
        assert "DB not available" in result
        assert len(chunks) == 1
        assert "error" in chunks[0].lower() or "TOOL:" in chunks[0]

    def test_widget_response(self):
        response = ToolResponse(
            status="success", result={"cards": [1, 2, 3]},
            display_type="widget"
        )
        chunks = []
        callback = lambda text, done, is_fn: chunks.append(text)

        result = _handle_tool_response("search_cards", response, callback)
        parsed = json.loads(result)
        assert parsed["status"] == "displayed_to_user"
        assert len(chunks) == 1

    def test_markdown_response(self):
        response = ToolResponse(
            status="success", result="## Stats\n- 100 cards",
            display_type="markdown"
        )
        chunks = []
        callback = lambda text, done, is_fn: chunks.append(text)

        result = _handle_tool_response("get_stats", response, callback)
        assert "Stats" in result
        assert chunks[0] == "## Stats\n- 100 cards"

    def test_silent_response(self):
        response = ToolResponse(
            status="success", result="internal data",
            display_type="silent"
        )
        result = _handle_tool_response("internal_tool", response, None)
        assert result == "internal data"

    def test_no_callback(self):
        response = ToolResponse(
            status="error", result="", display_type="widget",
            error_message="fail"
        )
        # Should not crash when callback is None
        result = _handle_tool_response("tool", response, None)
        assert "fail" in result


class TestRunAgentLoop:
    def test_no_tool_call_returns_immediately(self):
        """If stream_fn returns no function_call, loop exits after 1 iteration."""
        def mock_stream(urls, data, callback, **kw):
            return ("Hello world", None)  # text, no function_call

        result = run_agent_loop(
            stream_fn=mock_stream,
            stream_urls=["http://fake"],
            data={"contents": []},
        )
        assert result == "Hello world"

    def test_max_iterations_reached(self):
        """Loop should stop after MAX_ITERATIONS even if tools keep being called."""
        call_count = [0]

        def mock_stream(urls, data, callback, **kw):
            call_count[0] += 1
            # Return different args each time to avoid duplicate-call detection
            return ("", {"name": "fake_tool", "args": {"i": call_count[0]}})

        # Register a fake tool
        from ai.tools import registry, ToolDefinition
        registry.register(ToolDefinition(
            name="fake_tool",
            schema={"name": "fake_tool", "description": "test", "parameters": {"type": "object", "properties": {}}},
            execute_fn=lambda args: "ok",
            display_type="silent",
        ))

        try:
            result = run_agent_loop(
                stream_fn=mock_stream,
                stream_urls=["http://fake"],
                data={"contents": [], "generationConfig": {}},
            )
            assert call_count[0] == MAX_ITERATIONS
        finally:
            # Clean up: remove the fake tool
            registry._tools.pop("fake_tool", None)

    def test_duplicate_tool_call_breaks_loop(self):
        """Loop should break early when model repeats the same tool call."""
        call_count = [0]

        def mock_stream(urls, data, callback, **kw):
            call_count[0] += 1
            # Always return identical tool call — triggers duplicate detection
            return ("", {"name": "dup_tool", "args": {"q": "same"}})

        from ai.tools import registry, ToolDefinition
        registry.register(ToolDefinition(
            name="dup_tool",
            schema={"name": "dup_tool", "description": "test", "parameters": {"type": "object", "properties": {}}},
            execute_fn=lambda args: "ok",
            display_type="silent",
        ))

        try:
            result = run_agent_loop(
                stream_fn=mock_stream,
                stream_urls=["http://fake"],
                data={"contents": [], "generationConfig": {}},
            )
            # Should break after 2 iterations (first call + duplicate detected)
            assert call_count[0] == 2
        finally:
            registry._tools.pop("dup_tool", None)

    def test_tool_call_then_text(self):
        """Loop: first iteration returns tool call, second returns text."""
        call_count = [0]

        def mock_stream(urls, data, callback, **kw):
            call_count[0] += 1
            if call_count[0] == 1:
                return ("", {"name": "test_tool_2", "args": {}})
            return ("Final answer", None)

        from ai.tools import registry, ToolDefinition
        registry.register(ToolDefinition(
            name="test_tool_2",
            schema={"name": "test_tool_2", "description": "test", "parameters": {"type": "object", "properties": {}}},
            execute_fn=lambda args: {"data": "result"},
            display_type="silent",
        ))

        try:
            result = run_agent_loop(
                stream_fn=mock_stream,
                stream_urls=["http://fake"],
                data={"contents": [], "generationConfig": {}},
            )
            assert result == "Final answer"
            assert call_count[0] == 2
        finally:
            registry._tools.pop("test_tool_2", None)
