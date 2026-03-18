import json

try:
    from .tool_executor import execute_tool
except ImportError:
    from tool_executor import execute_tool

MAX_ITERATIONS = 5

MOOD_META = {
    'happy': 'freut sich', 'empathy': 'fühlt mit dir', 'excited': 'ist aufgeregt',
    'surprised': 'ist überrascht', 'sleepy': 'ist müde', 'blush': 'wird rot',
    'thinking': 'denkt nach', 'neutral': '',
}


def run_agent_loop(
    stream_fn,          # The _stream_response method (bound) from AIHandler
    stream_urls,        # List of streaming API URLs
    data,               # Initial request data dict (contents, generationConfig, etc.)
    callback=None,      # Streaming callback fn(chunk, done, is_function_call)
    use_backend=False,  # Whether to use backend mode
    backend_data=None,  # Backend-format request data
    tools_array=None,   # Gemini tools array (for re-injection on follow-up calls)
    system_instruction=None,  # System instruction DICT in Gemini format {"parts": [{"text": "..."}]}
    model=None,         # Model string (for max_tokens calculation)
):
    iteration = 0
    text_result = ""

    while iteration < MAX_ITERATIONS:
        iteration += 1
        print(f"agent_loop: Iteration {iteration}/{MAX_ITERATIONS}")

        # Call stream_fn (the existing _stream_response method)
        text_result, function_call = stream_fn(
            stream_urls, data, callback,
            use_backend=use_backend, backend_data=backend_data
        )

        # No tool call → done, return text
        if not function_call:
            print(f"agent_loop: Fertig nach {iteration} Iteration(en)")
            return text_result

        # Tool call detected → execute it
        function_name = function_call.get("name", "")
        function_args = function_call.get("args", {})
        print(f"agent_loop: Tool-Call erkannt: {function_name}")

        # spawn_plusi: inject loading widget BEFORE the tool executes
        if function_name == 'spawn_plusi' and callback:
            callback('\n[[PLUSI_LOADING]]\n', False, False)

        tool_result = execute_tool(function_name, function_args)

        # Special: spawn_plusi — inject PlusiWidget data directly into the stream
        if function_name == 'spawn_plusi' and callback:
            try:
                result_obj = json.loads(tool_result)
                plusi_text = result_obj.get('text', '')
                plusi_mood = result_obj.get('mood', 'neutral')
                if plusi_text and not result_obj.get('error'):
                    plusi_marker = '\n[[PLUSI_DATA: ' + json.dumps({
                        "mood": plusi_mood,
                        "text": plusi_text,
                        "meta": MOOD_META.get(plusi_mood, ''),
                    }, ensure_ascii=False) + ']]\n'
                    callback(plusi_marker, False, False)
                    print(f"agent_loop: PlusiWidget injected (mood={plusi_mood})")
                    # Sanitize result for Gemini — remove text so it doesn't echo it
                    tool_result = json.dumps({"status": "displayed", "mood": plusi_mood})
            except Exception as e:
                print(f"agent_loop: Plusi injection error: {e}")

        # Get contents from data and append function call + response
        contents = data.get("contents", [])
        contents.append({
            "role": "model",
            "parts": [{"functionCall": function_call}]
        })
        contents.append({
            "role": "function",
            "parts": [{"functionResponse": {
                "name": function_name,
                "response": {"result": tool_result}
            }}]
        })

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
