"""Tests for storage/insights.py — extraction prompt and hash utilities."""


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
