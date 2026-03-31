"""Prufer -- Reviewer-Inline Channel Agent.

Evaluates user answers and generates Multiple-Choice questions during card review.
This IS the reviewer-inline channel's pipeline -- no chat, no RAG, just assessment.

Entry point: run_prufer(situation, mode='evaluate', **kwargs)
"""

import json
import random

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)


def _ai_call_sync(prompt):
    """Get a synchronous AI response. Delegates to handler.get_response()."""
    try:
        from ..ai.handler import get_ai_handler
    except ImportError:
        from ai.handler import get_ai_handler

    ai = get_ai_handler()
    if not ai or not ai.is_configured():
        return None

    collected = []

    def _collector(chunk, is_done, is_function_call=False, **kwargs):
        if chunk:
            collected.append(chunk)

    try:
        ai.get_response(prompt, callback=_collector)
    except (OSError, RuntimeError, ValueError) as e:
        logger.exception("Prufer AI call error: %s", e)
        return None

    full = ''.join(collected) if collected else None
    if full:
        # Detect error messages returned as text
        error_patterns = ['Bitte verbinden', 'Bitte konfigurieren', 'Fehler bei',
                         'Quota überschritten', 'nicht konfiguriert']
        for pattern in error_patterns:
            if pattern in full:
                logger.error("Prufer: AI response looks like error: %s", full[:100])
                return None
    return full


def _parse_json_response(text):
    """Extract JSON from AI response (handles ```json wrapping)."""
    if not text:
        return None
    cleaned = text.strip()
    if cleaned.startswith('```'):
        cleaned = cleaned.split('\n', 1)[1] if '\n' in cleaned else cleaned[3:]
        if cleaned.endswith('```'):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()
    if cleaned.startswith('json'):
        cleaned = cleaned[4:].strip()
    return cleaned


# ---------------------------------------------------------------------------
# Answer Evaluation
# ---------------------------------------------------------------------------

def evaluate_answer(question, user_answer, correct_answer):
    """Evaluate a user's text answer against the correct answer.

    Returns: dict with {score: 0-100, feedback: str, missing: str}
    """
    try:
        prompt = (
            "Vergleiche die Antwort des Lernenden mit der korrekten Antwort.\n"
            "Erklaere in 1-2 Saetzen SPEZIFISCH was in der Antwort des Lernenden fehlte oder falsch war.\n"
            "Erklaere NICHT die gesamte Loesung neu -- die korrekte Antwort ist dem Lernenden bereits sichtbar.\n"
            "Fokussiere auf: Was hat der Lernende geschrieben? Was fehlte konkret?\n\n"
            "FRAGE:\n%s\n\n"
            "KORREKTE ANTWORT:\n%s\n\n"
            "ANTWORT DES LERNENDEN:\n%s\n\n"
            'Antworte NUR mit JSON: {"score": 0-100, "feedback": "..."}'
        ) % (question, correct_answer, user_answer)

        response = _ai_call_sync(prompt)
        if response:
            cleaned = _parse_json_response(response)
            result = json.loads(cleaned)
            return {
                "score": max(0, min(100, int(result.get("score", 50)))),
                "feedback": result.get("feedback", "Bewertung abgeschlossen."),
                "missing": result.get("missing", ""),
            }

    except (json.JSONDecodeError, KeyError, ValueError, TypeError) as e:
        logger.error("Prufer: evaluation parse error: %s", e)

    return _fallback_evaluation(user_answer, correct_answer)


def _fallback_evaluation(user_answer, correct_answer):
    """Simple word-overlap fallback when AI is unavailable."""
    user_words = set(user_answer.lower().split())
    correct_words = set(correct_answer.lower().split())
    if not correct_words:
        return {"score": 50, "feedback": "Keine Referenzantwort verfuegbar."}

    stopwords = {'der', 'die', 'das', 'ein', 'eine', 'und', 'oder', 'ist', 'sind',
                 'in', 'von', 'zu', 'mit', 'auf', 'fuer', 'an', 'bei', 'the', 'a',
                 'an', 'is', 'are', 'in', 'of', 'to', 'and', 'or', 'for', 'with'}
    meaningful_correct = correct_words - stopwords
    meaningful_common = (user_words & correct_words) - stopwords

    if not meaningful_correct:
        return {"score": 50, "feedback": "Bewertung nicht moeglich."}

    score = max(0, min(100, int((len(meaningful_common) / len(meaningful_correct)) * 100)))

    if score >= 70:
        feedback = "Gute Antwort! Die wesentlichen Punkte sind richtig."
    elif score >= 40:
        feedback = "Teilweise richtig. Einige wichtige Aspekte fehlen."
    else:
        feedback = "Die Antwort weicht deutlich von der erwarteten Antwort ab."

    return {"score": score, "feedback": feedback}


# ---------------------------------------------------------------------------
# MC Generation
# ---------------------------------------------------------------------------

def generate_mc(question, correct_answer, deck_answers=None):
    """Generate 4 Multiple-Choice options for a card question.

    Returns: list of {text: str, correct: bool, explanation: str}
    """
    try:
        deck_context = ""
        if deck_answers:
            deck_context = "\n\nDECK-KONTEXT (Inspiration fuer Distraktoren):\n"
            for ans in deck_answers:
                deck_context += "- %s\n" % ans

        prompt = (
            "Erstelle 4 MC-Optionen fuer diese Karteikarten-Frage. 1 korrekt, 3 plausibel falsch.\n"
            "Jede Option: kurze Erklaerung (max 1 Satz, warum richtig/falsch).\n\n"
            "FRAGE: %s\n"
            "KORREKTE ANTWORT: %s%s\n\n"
            "Antworte NUR mit JSON-Array:\n"
            '[{"text":"...","correct":true,"explanation":"..."},'
            '{"text":"...","correct":false,"explanation":"..."},'
            '{"text":"...","correct":false,"explanation":"..."},'
            '{"text":"...","correct":false,"explanation":"..."}]'
        ) % (question, correct_answer, deck_context)

        response = _ai_call_sync(prompt)
        if response:
            cleaned = _parse_json_response(response)
            # Find JSON array in response
            bracket_start = cleaned.find('[')
            bracket_end = cleaned.rfind(']')
            if bracket_start >= 0 and bracket_end > bracket_start:
                cleaned = cleaned[bracket_start:bracket_end + 1]

            options = json.loads(cleaned)
            if isinstance(options, list) and len(options) >= 4:
                for opt in options:
                    if 'explanation' not in opt:
                        opt['explanation'] = ''
                logger.info("Prufer: MC generation SUCCESS -- %s options", len(options))
                result = options[:4]
                random.shuffle(result)
                return result

    except (json.JSONDecodeError, KeyError, ValueError, TypeError) as e:
        logger.error("Prufer: MC generation parse error: %s", e)

    return _fallback_mc(correct_answer)


def _fallback_mc(correct_answer):
    """Fallback MC options when AI is unavailable."""
    short = correct_answer[:80] if len(correct_answer) > 80 else correct_answer
    return [
        {"text": short, "correct": True, "explanation": "Dies ist die korrekte Antwort."},
        {"text": "Keine der genannten Optionen", "correct": False, "explanation": "Die korrekte Antwort ist oben aufgefuehrt."},
        {"text": "Alle genannten Optionen sind richtig", "correct": False, "explanation": "Nur eine der Optionen ist korrekt."},
        {"text": "Die Frage kann nicht beantwortet werden", "correct": False, "explanation": "Die Frage hat eine klare Antwort."},
    ]


# ---------------------------------------------------------------------------
# Agent entry point
# ---------------------------------------------------------------------------

def run_prufer(situation='', emit_step=None, memory=None,
               stream_callback=None, **kwargs):
    """Prufer agent entry point.

    Args:
        situation: User's answer text (for evaluate) or empty (for MC).
        emit_step: Pipeline step callback (unused for now).
        memory: Agent memory (unused for now).
        stream_callback: Streaming callback (unused -- Prufer returns complete results).
        **kwargs:
            mode: 'evaluate' or 'generate_mc'
            question: Card question text
            correct_answer: Card correct answer text
            user_answer: User's submitted answer (evaluate mode)
            deck_answers: List of other deck answers (MC mode)

    Returns:
        dict with mode-specific results
    """
    mode = kwargs.get('mode', 'evaluate')

    if mode == 'evaluate':
        question = kwargs.get('question', '')
        user_answer = kwargs.get('user_answer', situation)
        correct_answer = kwargs.get('correct_answer', '')
        result = evaluate_answer(question, user_answer, correct_answer)
        return {'text': result.get('feedback', ''), 'evaluation': result}

    elif mode == 'generate_mc':
        question = kwargs.get('question', '')
        correct_answer = kwargs.get('correct_answer', '')
        deck_answers = kwargs.get('deck_answers')
        options = generate_mc(question, correct_answer, deck_answers)
        return {'text': '', 'mc_options': options}

    else:
        logger.warning("Prufer: unknown mode %s", mode)
        return {'text': 'Unbekannter Modus.', 'error': 'unknown_mode'}
