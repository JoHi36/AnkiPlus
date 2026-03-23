"""Tests for the unified router."""
import sys
import types

# Mock aqt module tree (same pattern as other tests)
_aqt = types.ModuleType('aqt')
_aqt.mw = None
_aqt.qt = types.ModuleType('aqt.qt')
_aqt.utils = types.ModuleType('aqt.utils')
sys.modules.update({'aqt': _aqt, 'aqt.qt': _aqt.qt, 'aqt.utils': _aqt.utils})

from ai.router import UnifiedRoutingResult


def test_unified_routing_result_tutor_with_queries():
    r = UnifiedRoutingResult(
        agent='tutor', method='llm', reasoning='Lernfrage',
        search_needed=True, retrieval_mode='both',
        response_length='medium', max_sources='medium',
        search_scope='collection',
        precise_queries=['a AND b'], broad_queries=['a OR b'],
        embedding_queries=['concept search'],
    )
    assert r.agent == 'tutor'
    assert r.search_needed is True
    assert len(r.precise_queries) == 1


def test_unified_routing_result_non_tutor():
    r = UnifiedRoutingResult(agent='plusi', method='heuristic', reasoning='Name detected')
    assert r.agent == 'plusi'
    assert r.search_needed is None
    assert r.precise_queries is None


from unittest.mock import patch, MagicMock
from ai.router import unified_route


def _mock_gemini_response(json_text):
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = {
        'candidates': [{'content': {'parts': [{'text': json_text}]}}]
    }
    return mock_resp


@patch('ai.router._requests')
def test_unified_route_tutor_with_search(mock_requests):
    mock_requests.post.return_value = _mock_gemini_response(
        '{"agent":"tutor","search_needed":true,"retrieval_mode":"both",'
        '"response_length":"medium","max_sources":"medium","search_scope":"collection",'
        '"precise_queries":["a AND b"],"broad_queries":["a OR b"],"embedding_queries":["concept"]}'
    )
    result = unified_route(
        user_message='warum ist die banane krumm',
        session_context={'mode': 'free_chat', 'deck_name': '', 'has_card': False},
        config={'api_key': 'test-key'},
        card_context=None,
        chat_history=[],
    )
    assert result.agent == 'tutor'
    assert result.search_needed is True
    assert result.precise_queries == ['a AND b']


@patch('ai.router._requests')
def test_unified_route_plusi(mock_requests):
    mock_requests.post.return_value = _mock_gemini_response(
        '{"agent":"plusi","reasoning":"Persoenliche Ansprache"}'
    )
    result = unified_route(
        user_message='hey plusi wie gehts',
        session_context={'mode': 'free_chat', 'deck_name': '', 'has_card': False},
        config={'api_key': 'test-key'},
        card_context=None,
        chat_history=[],
    )
    assert result.agent == 'plusi'
    assert result.search_needed is None


@patch('ai.router._requests')
def test_unified_route_fallback_on_error(mock_requests):
    mock_requests.post.side_effect = Exception('API error')
    result = unified_route(
        user_message='some question',
        session_context={'mode': 'free_chat', 'deck_name': '', 'has_card': False},
        config={'api_key': 'test-key'},
        card_context=None,
        chat_history=[],
    )
    assert result.agent == 'tutor'
    assert result.method == 'default'


@patch('ai.router.unified_route')
def test_route_message_passes_context_to_unified(mock_unified):
    mock_unified.return_value = UnifiedRoutingResult(
        agent='tutor', method='llm', search_needed=True,
        retrieval_mode='both', precise_queries=['test'],
        broad_queries=['test'], embedding_queries=['test'],
    )
    from ai.router import route_message
    # Need at least one non-default agent enabled so LLM routing triggers
    result = route_message(
        'some question',
        {'mode': 'card_session', 'deck_name': 'Bio', 'has_card': True},
        {'api_key': 'test', 'research_enabled': True},
        card_context={'cardId': 123, 'question': 'What is DNA?'},
        chat_history=[{'role': 'user', 'content': 'hello'}],
    )
    assert result.agent == 'tutor'
    assert result.search_needed is True
    mock_unified.assert_called_once()


def test_route_message_heuristic_plusi():
    from ai.router import route_message
    result = route_message(
        'plusi wie gehts',
        {'mode': 'free_chat', 'deck_name': '', 'has_card': False},
        {},
    )
    assert result.agent == 'plusi'
    assert result.method == 'heuristic'
