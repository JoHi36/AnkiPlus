"""Tests for storage/insights.py — extraction prompt, hash utilities, message filtering."""


def test_build_extraction_prompt_has_example():
    """Prompt must include a few-shot JSON example for reliable output."""
    from storage.insights import build_extraction_prompt
    prompt = build_extraction_prompt(
        {'frontField': 'What is mitosis?'},
        [{'from': 'user', 'text': 'explain'}, {'from': 'assistant', 'text': 'cell division'}],
        {'version': 1, 'insights': []},
    )
    assert 'BEISPIEL-OUTPUT' in prompt
    assert '"type":"learned"' in prompt


def test_build_extraction_prompt_card_relevance():
    """Prompt must instruct to focus on card-relevant insights only."""
    from storage.insights import build_extraction_prompt
    prompt = build_extraction_prompt(
        {'frontField': 'What is mitosis?'},
        [{'from': 'user', 'text': 'explain'}],
        {'version': 1, 'insights': []},
    )
    assert 'VERHALTEN DES NUTZERS' in prompt
    assert 'Off-Topic' in prompt


def test_insight_hash_deterministic():
    """Hash of same text must always produce same result."""
    from storage.insights import insight_hash
    h1 = insight_hash("Kompetitive Hemmung erhöht Km")
    h2 = insight_hash("Kompetitive Hemmung erhöht Km")
    assert h1 == h2
    assert isinstance(h1, str)
    assert len(h1) == 8


def test_insight_hash_different_texts():
    from storage.insights import insight_hash
    h1 = insight_hash("Text A")
    h2 = insight_hash("Text B")
    assert h1 != h2


def test_compute_new_indices():
    """New indices are insights whose hash is not in seen_hashes."""
    from storage.insights import insight_hash, compute_new_indices
    insights = [
        {"text": "old fact", "type": "learned"},
        {"text": "new fact", "type": "learned"},
    ]
    seen = [insight_hash("old fact")]
    result = compute_new_indices(insights, seen)
    assert result == [1]


def test_compute_new_indices_all_new():
    from storage.insights import insight_hash, compute_new_indices
    insights = [{"text": "a", "type": "learned"}, {"text": "b", "type": "weakness"}]
    result = compute_new_indices(insights, [])
    assert result == [0, 1]


def test_filter_excludes_plusi_messages():
    """Plusi subagent messages must not be included in extraction."""
    from storage.insights import _filter_messages_for_extraction
    messages = [
        {'from': 'user', 'text': 'what is this?'},
        {'from': 'assistant', 'text': 'it is a cell'},
        {'from': 'assistant', 'text': 'Hey!', 'subagent': 'plusi'},
        {'from': 'assistant', 'text': 'Yo!', 'agent': 'plusi'},
    ]
    result = _filter_messages_for_extraction(messages)
    assert len(result) == 2
    assert result[0]['text'] == 'what is this?'
    assert result[1]['text'] == 'it is a cell'


def test_filter_excludes_tool_calls():
    """Tool call messages must be excluded."""
    from storage.insights import _filter_messages_for_extraction
    messages = [
        {'from': 'user', 'text': 'search for X'},
        {'from': 'assistant', 'text': '[[TOOL:search]]', 'is_function_call': True},
        {'from': 'assistant', 'text': 'Here are results'},
    ]
    result = _filter_messages_for_extraction(messages)
    assert len(result) == 2


def test_filter_excludes_tool_markers():
    """Tool widget markers like [[TOOL...]] must be excluded."""
    from storage.insights import _filter_messages_for_extraction
    messages = [
        {'from': 'user', 'text': 'hi'},
        {'from': 'assistant', 'text': '[[TOOL{"name":"compact"}]]'},
        {'from': 'assistant', 'text': '[[LOADING:search_deck]]'},
    ]
    result = _filter_messages_for_extraction(messages)
    assert len(result) == 1
