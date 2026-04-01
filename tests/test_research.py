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


def test_openrouter_missing_auth():
    """Backend research returns error when not authenticated."""
    from unittest.mock import patch
    with patch('config.get_backend_url', return_value=''), \
         patch('config.get_auth_token', return_value=''):
        from research.openrouter import search_via_openrouter
        result = search_via_openrouter('test')
        assert result['error'] is not None
        assert 'authentifiziert' in result['error'].lower()


def test_pubmed_search_function_exists():
    """PubMed search function is importable."""
    from research.pubmed import search_pubmed
    assert callable(search_pubmed)


def test_search_medical_query_detection():
    from research.search import _is_medical_query
    assert _is_medical_query('clinical trial diabetes')
    assert _is_medical_query('Studie zu Enzymaktivität')
    assert not _is_medical_query('French revolution causes')

def test_search_no_auth_returns_error():
    """search() returns error when backend is not authenticated."""
    from unittest.mock import patch
    with patch('config.get_backend_url', return_value=''), \
         patch('config.get_auth_token', return_value=''):
        from research.search import search
        result = search('French revolution', api_key='')
        assert result.error is not None

def test_convert_citations():
    from research.search import _convert_citations
    assert _convert_citations('Text [1] and [2]') == 'Text [[WEB:1]] and [[WEB:2]]'
    assert _convert_citations('No citations here') == 'No citations here'
