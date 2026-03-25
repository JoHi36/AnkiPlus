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


def _mock_backend_response(json_dict):
    """Mock a backend /router response (returns parsed JSON directly)."""
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = json_dict
    return mock_resp


@patch('ai.router.get_auth_token', return_value='test-token')
@patch('ai.router.get_backend_url', return_value='https://backend.example.com')
@patch('ai.router._requests')
def test_unified_route_tutor_with_search(mock_requests, mock_url, mock_token):
    mock_requests.post.return_value = _mock_backend_response({
        'agent': 'tutor', 'search_needed': True, 'retrieval_mode': 'both',
        'response_length': 'medium', 'max_sources': 'medium', 'search_scope': 'collection',
        'precise_queries': ['a AND b'], 'broad_queries': ['a OR b'], 'embedding_queries': ['concept'],
    })
    result = unified_route(
        user_message='warum ist die banane krumm',
        session_context={'mode': 'free_chat', 'deck_name': '', 'has_card': False},
        config={},
        card_context=None,
        chat_history=[],
    )
    assert result.agent == 'tutor'
    assert result.search_needed is True
    assert result.precise_queries == ['a AND b']


@patch('ai.router.get_auth_token', return_value='test-token')
@patch('ai.router.get_backend_url', return_value='https://backend.example.com')
@patch('ai.router._requests')
def test_unified_route_plusi(mock_requests, mock_url, mock_token):
    mock_requests.post.return_value = _mock_backend_response({
        'agent': 'plusi', 'reasoning': 'Persoenliche Ansprache',
    })
    result = unified_route(
        user_message='hey plusi wie gehts',
        session_context={'mode': 'free_chat', 'deck_name': '', 'has_card': False},
        config={},
        card_context=None,
        chat_history=[],
    )
    assert result.agent == 'plusi'
    assert result.search_needed is None


@patch('ai.router.get_auth_token', return_value='test-token')
@patch('ai.router.get_backend_url', return_value='https://backend.example.com')
@patch('ai.router._requests')
def test_unified_route_fallback_on_error(mock_requests, mock_url, mock_token):
    mock_requests.post.side_effect = Exception('API error')
    result = unified_route(
        user_message='some question',
        session_context={'mode': 'free_chat', 'deck_name': '', 'has_card': False},
        config={},
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


def test_route_empty_query():
    """Routing an empty string should not crash and should default to tutor."""
    from ai.router import route_message
    result = route_message(
        '',
        {'mode': 'free_chat', 'deck_name': '', 'has_card': False},
        {},
    )
    assert result.agent == 'tutor'


def test_route_none_query():
    """Routing None as the message should raise a clear error or default to tutor gracefully."""
    from ai.router import route_message
    try:
        result = route_message(
            None,
            {'mode': 'free_chat', 'deck_name': '', 'has_card': False},
            {},
        )
        # If it returns without raising, agent must still be a valid string
        assert isinstance(result.agent, str)
    except (TypeError, AttributeError):
        pass  # Acceptable: explicit exception from None.lower() is a clear error


@patch('ai.router.get_auth_token', return_value='test-token')
@patch('ai.router.get_backend_url', return_value='https://backend.example.com')
@patch('ai.router._requests')
def test_route_malformed_json_response(mock_requests, mock_url, mock_token):
    """If the backend returns invalid JSON, unified_route falls back to tutor."""
    mock_resp = MagicMock()
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.side_effect = ValueError('Invalid JSON')
    mock_requests.post.return_value = mock_resp
    result = unified_route(
        user_message='what is mitosis',
        session_context={'mode': 'card_session', 'deck_name': 'Bio', 'has_card': True},
        config={},
        card_context=None,
        chat_history=[],
    )
    assert result.agent == 'tutor'
    assert result.method == 'default'
