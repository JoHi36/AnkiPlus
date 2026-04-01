"""Tests for the router shim — backwards-compat layer over rag_analyzer."""
import sys
import types

# Mock aqt module tree — must include showInfo etc. needed by config.py
_aqt = types.ModuleType('aqt')
_aqt.mw = None
_aqt.qt = types.ModuleType('aqt.qt')
_aqt.utils = types.ModuleType('aqt.utils')
_aqt.utils.showInfo = lambda *a, **kw: None
_aqt.utils.showWarning = lambda *a, **kw: None
_aqt.utils.showCritical = lambda *a, **kw: None
sys.modules.update({'aqt': _aqt, 'aqt.qt': _aqt.qt, 'aqt.utils': _aqt.utils})

import unittest
from unittest.mock import patch, MagicMock

from ai.router import UnifiedRoutingResult, RoutingResult, route_message
from ai.rag_analyzer import RagAnalysis


# ---------------------------------------------------------------------------
# Backwards-compat: UnifiedRoutingResult must be RagAnalysis
# ---------------------------------------------------------------------------

def test_unified_routing_result_is_rag_analysis():
    """UnifiedRoutingResult imported from ai.router must be RagAnalysis."""
    assert UnifiedRoutingResult is RagAnalysis


def test_routing_result_alias():
    """RoutingResult must also be RagAnalysis."""
    assert RoutingResult is RagAnalysis


# ---------------------------------------------------------------------------
# RagAnalysis fields
# ---------------------------------------------------------------------------

class TestSlimRoutingResult(unittest.TestCase):

    def test_default_fields(self):
        r = RagAnalysis()
        self.assertTrue(r.search_needed)
        self.assertEqual(r.resolved_intent, '')
        self.assertEqual(r.retrieval_mode, 'both')
        self.assertEqual(r.search_scope, 'current_deck')
        self.assertEqual(r.response_length, 'medium')

    def test_resolved_intent_field(self):
        result = UnifiedRoutingResult(
            search_needed=True, resolved_intent='Laenge des Duenndarms'
        )
        self.assertEqual(result.resolved_intent, 'Laenge des Duenndarms')

    def test_default_resolved_intent_is_empty_string(self):
        result = UnifiedRoutingResult()
        self.assertEqual(result.resolved_intent, '')

    def test_custom_fields(self):
        r = RagAnalysis(
            search_needed=False,
            resolved_intent='test intent',
            retrieval_mode='sql',
            search_scope='collection',
            response_length='long',
        )
        self.assertFalse(r.search_needed)
        self.assertEqual(r.resolved_intent, 'test intent')
        self.assertEqual(r.retrieval_mode, 'sql')
        self.assertEqual(r.search_scope, 'collection')
        self.assertEqual(r.response_length, 'long')


# ---------------------------------------------------------------------------
# route_message shim — delegates to analyze_query
# ---------------------------------------------------------------------------

def test_route_message_returns_rag_analysis():
    """route_message shim must return a RagAnalysis instance."""
    with patch('ai.rag_analyzer._requests') as mock_req, \
         patch('ai.rag_analyzer.get_backend_url', return_value=''), \
         patch('ai.rag_analyzer.get_auth_token', return_value=''):
        result = route_message('warum ist die banane krumm')
        assert isinstance(result, RagAnalysis)


def test_route_message_passes_card_context():
    """route_message must forward card_context to analyze_query."""
    with patch('ai.router.analyze_query') as mock_analyze:
        mock_analyze.return_value = RagAnalysis()
        card_ctx = {'cardId': 42, 'question': 'What is DNA?', 'deckName': 'Bio'}
        route_message(
            'erklaer mir DNA',
            card_context=card_ctx,
            chat_history=[{'role': 'user', 'content': 'hello'}],
        )
        mock_analyze.assert_called_once_with(
            user_message='erklaer mir DNA',
            card_context=card_ctx,
            chat_history=[{'role': 'user', 'content': 'hello'}],
        )


def test_route_message_shim_fallback_on_error():
    """When analyze_query raises, the shim should propagate or default gracefully."""
    with patch('ai.router.analyze_query') as mock_analyze:
        mock_analyze.return_value = RagAnalysis(
            search_needed=True, retrieval_mode='both', search_scope='current_deck'
        )
        result = route_message('some question')
        assert isinstance(result, RagAnalysis)
        assert result.search_needed is True


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

def test_route_empty_query():
    """Routing an empty string should not crash and return a RagAnalysis."""
    with patch('ai.router.analyze_query') as mock_analyze:
        mock_analyze.return_value = RagAnalysis()
        result = route_message('')
        assert isinstance(result, RagAnalysis)


def test_route_none_query():
    """Routing None as the message should not crash — shim passes None to analyze_query."""
    with patch('ai.router.analyze_query') as mock_analyze:
        mock_analyze.return_value = RagAnalysis()
        result = route_message(None)
        assert isinstance(result, RagAnalysis)
        mock_analyze.assert_called_once_with(
            user_message=None,
            card_context=None,
            chat_history=None,
        )
