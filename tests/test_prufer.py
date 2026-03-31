"""Tests for Prufer agent (reviewer-inline channel)."""
import sys
import types
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

_aqt = types.ModuleType('aqt')
_aqt.mw = None
_aqt.qt = types.ModuleType('aqt.qt')
_aqt.utils = types.ModuleType('aqt.utils')
for attr in ('showInfo', 'showWarning', 'showCritical'):
    setattr(_aqt.utils, attr, lambda *a, **k: None)
sys.modules.update({'aqt': _aqt, 'aqt.qt': _aqt.qt, 'aqt.utils': _aqt.utils})

from ai.prufer import evaluate_answer, generate_mc, _fallback_evaluation, _fallback_mc, _parse_json_response


def test_parse_json_response_plain():
    assert _parse_json_response('{"score": 80}') == '{"score": 80}'


def test_parse_json_response_wrapped():
    assert _parse_json_response('```json\n{"score": 80}\n```') == '{"score": 80}'


def test_parse_json_response_none():
    assert _parse_json_response(None) is None
    assert _parse_json_response('') is None


def test_fallback_evaluation_high_overlap():
    result = _fallback_evaluation('Herz pumpt Blut', 'Das Herz pumpt Blut durch den Koerper')
    assert result['score'] > 0
    assert 'feedback' in result


def test_fallback_evaluation_no_overlap():
    result = _fallback_evaluation('xyz', 'Das Herz pumpt Blut')
    assert result['score'] < 30


def test_fallback_evaluation_empty_correct():
    result = _fallback_evaluation('test', '')
    assert result['score'] == 50


def test_fallback_mc_has_4_options():
    result = _fallback_mc('Korrekte Antwort hier')
    assert len(result) == 4
    assert sum(1 for o in result if o['correct']) == 1


def test_fallback_mc_all_have_fields():
    result = _fallback_mc('Test')
    for opt in result:
        assert 'text' in opt
        assert 'correct' in opt
        assert 'explanation' in opt


def test_run_prufer_evaluate():
    from unittest.mock import patch
    with patch('ai.prufer._ai_call_sync', return_value='{"score": 85, "feedback": "Sehr gut!"}'):
        from ai.prufer import run_prufer
        result = run_prufer(
            situation='Herz pumpt Blut',
            mode='evaluate',
            question='Was macht das Herz?',
            correct_answer='Das Herz pumpt Blut durch den Koerper',
            user_answer='Herz pumpt Blut',
        )
        assert result['evaluation']['score'] == 85
        assert 'Sehr gut' in result['evaluation']['feedback']


def test_run_prufer_generate_mc():
    from unittest.mock import patch
    mock_response = '[{"text":"A","correct":true,"explanation":"Richtig"},{"text":"B","correct":false,"explanation":"Falsch"},{"text":"C","correct":false,"explanation":"Falsch"},{"text":"D","correct":false,"explanation":"Falsch"}]'
    with patch('ai.prufer._ai_call_sync', return_value=mock_response):
        from ai.prufer import run_prufer
        result = run_prufer(
            mode='generate_mc',
            question='Was macht das Herz?',
            correct_answer='Es pumpt Blut',
        )
        assert len(result['mc_options']) == 4
        assert sum(1 for o in result['mc_options'] if o['correct']) == 1


def test_run_prufer_unknown_mode():
    from ai.prufer import run_prufer
    result = run_prufer(mode='unknown')
    assert 'error' in result


def test_agent_registration():
    from ai.agents import AGENT_REGISTRY
    prufer = AGENT_REGISTRY.get('prufer')
    assert prufer is not None
    assert prufer.channel == 'reviewer-inline'
    assert prufer.uses_rag is False
    assert prufer.label == 'Prufer'
