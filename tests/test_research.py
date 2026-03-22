"""Tests for research package: types and Perplexity client."""


def test_research_result_to_dict():
    from research.types import Source, ResearchResult
    r = ResearchResult(
        sources=[Source(title='Test', url='https://example.com', domain='example.com',
                        favicon_letter='E', snippet='A test')],
        answer='Answer text', query='test query', tool_used='perplexity'
    )
    d = r.to_dict()
    assert len(d['sources']) == 1
    assert d['sources'][0]['title'] == 'Test'
    assert d['error'] is None


def test_research_result_error():
    from research.types import ResearchResult
    r = ResearchResult(error='API timeout')
    d = r.to_dict()
    assert d['error'] == 'API timeout'
    assert d['sources'] == []


def test_perplexity_missing_key():
    from research.perplexity import search_perplexity
    result = search_perplexity('test', '')
    assert result['error'] == 'No Perplexity API key configured'
