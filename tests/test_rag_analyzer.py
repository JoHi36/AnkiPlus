"""Tests for RAG query analyzer (extracted from router)."""
import sys
import types

_aqt = types.ModuleType('aqt')
_aqt.mw = None
_aqt.qt = types.ModuleType('aqt.qt')
_aqt.utils = types.ModuleType('aqt.utils')
_aqt.utils.showInfo = lambda *a, **kw: None
_aqt.utils.showWarning = lambda *a, **kw: None
_aqt.utils.showCritical = lambda *a, **kw: None
sys.modules.update({'aqt': _aqt, 'aqt.qt': _aqt.qt, 'aqt.utils': _aqt.utils})

from ai.rag_analyzer import RagAnalysis, analyze_query


def test_rag_analysis_defaults():
    r = RagAnalysis()
    assert r.search_needed is True
    assert r.resolved_intent == ''
    assert r.retrieval_mode == 'both'
    assert r.search_scope == 'current_deck'
    assert r.response_length == 'medium'


def test_rag_analysis_custom():
    r = RagAnalysis(
        search_needed=False,
        resolved_intent='Herzklappen Funktion',
        retrieval_mode='semantic',
        search_scope='collection',
        response_length='long',
    )
    assert r.search_needed is False
    assert r.resolved_intent == 'Herzklappen Funktion'


from unittest.mock import patch, MagicMock


def _mock_backend_response(json_dict):
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = json_dict
    return mock_resp


@patch('ai.rag_analyzer.get_auth_token', return_value='test-token')
@patch('ai.rag_analyzer.get_backend_url', return_value='https://backend.example.com')
@patch('ai.rag_analyzer._requests')
def test_analyze_query_returns_rag_fields(mock_requests, mock_url, mock_token):
    mock_requests.post.return_value = _mock_backend_response({
        'agent': 'research',  # Agent field exists but should be IGNORED
        'search_needed': True,
        'resolved_intent': 'Laenge des Duenndarms',
        'retrieval_mode': 'both',
        'response_length': 'medium',
        'search_scope': 'collection',
    })
    result = analyze_query(
        user_message='wie lang ist der',
        card_context={'cardId': 1, 'question': 'Duenndarm?', 'deckName': 'Anatomie'},
    )
    assert isinstance(result, RagAnalysis)
    assert result.search_needed is True
    assert result.resolved_intent == 'Laenge des Duenndarms'
    assert not hasattr(result, 'agent')


@patch('ai.rag_analyzer.get_auth_token', return_value='test-token')
@patch('ai.rag_analyzer.get_backend_url', return_value='https://backend.example.com')
@patch('ai.rag_analyzer._requests')
def test_analyze_query_fallback_on_error(mock_requests, mock_url, mock_token):
    mock_requests.post.side_effect = Exception('Network error')
    result = analyze_query(user_message='some question')
    assert isinstance(result, RagAnalysis)
    assert result.search_needed is True
    assert result.retrieval_mode == 'both'


@patch('ai.rag_analyzer.get_auth_token', return_value=None)
@patch('ai.rag_analyzer.get_backend_url', return_value=None)
def test_analyze_query_no_backend(mock_url, mock_token):
    result = analyze_query(user_message='test')
    assert isinstance(result, RagAnalysis)
    assert result.search_needed is True
