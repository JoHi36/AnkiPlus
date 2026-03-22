"""
Custom Reviewer Module
Replaces Anki's native reviewer with a completely custom UI
while keeping Anki's scheduling backend.

Uses the webview_will_set_content hook (fires BEFORE rendering)
to replace the reviewer HTML content.
"""

import os
import json
import threading
import time as _time
from typing import Optional, Tuple
from aqt import mw, gui_hooks
from aqt.reviewer import Reviewer

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

_preview_state = {
    'active': False,
    'stage': None,            # 'peek' | 'card_chat'
    'card_id': None,
    'previous_state': None,   # 'review' | 'overview' | 'deckBrowser'
    'previous_card_id': None,
    'previous_chat_tab': None,
    '_transitioning': False,
}


def open_preview(card_id):
    """Open a card in preview mode from any Anki state."""
    from aqt import mw

    # Close existing preview first (no stacking)
    if _preview_state['active']:
        close_preview(notify_frontend=False)

    try:
        card = mw.col.get_card(card_id)
    except Exception:
        return {"success": False, "error": "Card not found"}

    # Save current state
    _preview_state['active'] = True
    _preview_state['stage'] = 'peek'
    _preview_state['card_id'] = card_id
    _preview_state['previous_state'] = mw.state
    _preview_state['previous_card_id'] = (
        mw.reviewer.card.id if mw.state == "review" and mw.reviewer and mw.reviewer.card else None
    )

    def _inject_preview():
        """Inject card into reviewer after state transition."""
        rev = mw.reviewer
        if not rev:
            return
        rev.card = card
        card.timer_started = _time.time()
        # Mark as navigating to prevent trail tracking
        handle_custom_pycmd._is_navigating = True
        from PyQt6.QtCore import QTimer
        QTimer.singleShot(0, lambda: _do_init_preview(rev))

    def _do_init_preview(rev):
        handle_custom_pycmd._is_navigating = False
        rev._initWeb()
        # Notify frontend
        _notify_frontend_preview('peek', card_id)

    if mw.state == "review":
        _inject_preview()
    else:
        # Transition to review state first.
        # Keep _transitioning True until injection completes
        _preview_state['_transitioning'] = True
        from PyQt6.QtCore import QTimer

        def _on_review_ready():
            """Called after reviewer is initialized — inject our card."""
            _preview_state['_transitioning'] = False
            _inject_preview()

        mw.moveToState("review")
        # Delay injection to let reviewer fully initialize
        QTimer.singleShot(100, _on_review_ready)

    return {"success": True}


def close_preview(notify_frontend=True):
    """Close preview and restore previous state."""
    from aqt import mw

    if not _preview_state['active']:
        return

    prev_state = _preview_state['previous_state']
    prev_card_id = _preview_state['previous_card_id']

    # Reset state
    _preview_state['active'] = False
    _preview_state['stage'] = None
    _preview_state['card_id'] = None
    _preview_state['previous_state'] = None
    _preview_state['previous_card_id'] = None
    _preview_state['previous_chat_tab'] = None

    if notify_frontend:
        _notify_frontend_preview(None, None)

    if prev_state == "review" and prev_card_id:
        # Re-inject the session card
        try:
            card = mw.col.get_card(prev_card_id)
            rev = mw.reviewer
            if rev:
                rev.card = card
                card.timer_started = _time.time()
                from PyQt6.QtCore import QTimer
                QTimer.singleShot(0, rev._initWeb)
                return  # No state transition needed
        except Exception:
            pass
        # Fallback: go to overview
        _preview_state['_transitioning'] = True
        mw.moveToState("overview")
        _preview_state['_transitioning'] = False
    elif prev_state in ("overview", "deckBrowser"):
        _preview_state['_transitioning'] = True
        mw.moveToState(prev_state)
        _preview_state['_transitioning'] = False
    else:
        _preview_state['_transitioning'] = True
        mw.moveToState("overview")
        _preview_state['_transitioning'] = False


def _notify_frontend_preview(stage, card_id):
    """Send previewMode event to frontend."""
    import json
    from ..ui import setup as ui_setup

    widget = getattr(ui_setup, '_chatbot_widget', None)
    if widget and widget.web_view:
        if stage is None:
            payload = json.dumps({"type": "previewMode", "data": None})
        else:
            payload = json.dumps({
                "type": "previewMode",
                "data": {"stage": stage, "cardId": card_id}
            })
        widget.web_view.page().runJavaScript(
            f"window.ankiReceive({payload});"
        )


def _evaluate_answer_async(data):
    """Background thread: evaluate user answer via AI and inject result back."""
    try:
        question = data.get('question', '')
        user_answer = data.get('userAnswer', '')
        correct_answer = data.get('correctAnswer', '')

        _inject_ai_step('analyzing', 'Analysiere Antwort…')
        _inject_ai_step('comparing', 'Vergleiche mit korrekter Antwort…')
        _inject_ai_step('evaluating', 'KI bewertet…')

        # Try to use the addon's AI handler
        result = _call_ai_evaluation(question, user_answer, correct_answer)

        _inject_ai_step('done', 'Bewertung abgeschlossen')

        # Inject result back into reviewer webview (must be on main thread)
        def inject():
            try:
                if mw and mw.reviewer and mw.reviewer.web:
                    js = f'window.onEvaluationResult({json.dumps(result)});'
                    mw.reviewer.web.eval(js)

                    # Also send evaluation result to chat panel for SectionDivider
                    try:
                        from . import __init__ as _self_mod
                    except ImportError:
                        _self_mod = None
                    try:
                        from ..ui import setup as ui_setup
                        chat_widget = getattr(ui_setup, '_chatbot_widget', None)
                        if chat_widget and hasattr(chat_widget, 'web_view'):
                            score = result.get('score', 0)
                            card_id = mw.reviewer.card.id if mw.reviewer and mw.reviewer.card else 0
                            eval_payload = {
                                "type": "evaluationResult",
                                "data": {
                                    "cardId": card_id,
                                    "score": score,
                                    "feedback": result.get('feedback', ''),
                                    "userAnswer": user_answer,
                                }
                            }
                            chat_js = f"if(window.ankiReceive) window.ankiReceive({json.dumps(eval_payload)});"
                            chat_widget.web_view.page().runJavaScript(chat_js)
                    except Exception as e:
                        logger.error(f"CustomReviewer: ⚠️ Could not send eval result to chat: {e}")
            except Exception as e:
                logger.error(f"CustomReviewer: Error injecting eval result: {e}")

        mw.taskman.run_on_main(inject)

    except Exception as e:
        logger.exception("CustomReviewer: evaluate_answer_async error: %s", e)
        def inject_error():
            try:
                if mw and mw.reviewer and mw.reviewer.web:
                    mw.reviewer.web.eval(f'window.onEvaluationResult({json.dumps({"error": str(e)})});')
            except (AttributeError, RuntimeError):
                pass
        mw.taskman.run_on_main(inject_error)


def _inject_ai_step(phase, label):
    """Inject a ThoughtStream step into the dock loading UI.
    Uses threading.Event to wait until the main thread has processed the step,
    ensuring steps appear one at a time with visible delays."""
    import time as _time
    import threading as _threading
    try:
        step = {"phase": phase, "label": label}
        done_event = _threading.Event()

        def _inject():
            try:
                if mw and mw.reviewer and mw.reviewer.web:
                    mw.reviewer.web.eval(f'window.onAIStep({json.dumps(step)});')
            except Exception:
                pass
            finally:
                done_event.set()

        mw.taskman.run_on_main(_inject)
        # Wait for main thread to execute the injection (max 2s)
        done_event.wait(timeout=2.0)
        # Additional delay so the user can read each step
        _time.sleep(0.8)
    except Exception:
        pass


def _get_deck_context_answers_sync(card_id=None, max_answers=8):
    """Get answers from other cards in the same deck. MUST be called on main thread."""
    try:
        if not mw or not mw.col or not mw.reviewer or not mw.reviewer.card:
            return []
        import re
        import random as _rand
        card = mw.reviewer.card
        note = card.note()
        current_tags = set(note.tags)
        deck_id = card.did
        deck_name = mw.col.decks.name(deck_id)

        # Prefer cards with overlapping tags
        tag_card_ids = []
        if current_tags:
            tag_query = ' OR '.join(f'tag:{t}' for t in list(current_tags)[:3])
            try:
                tag_card_ids = [c for c in mw.col.find_cards(f'({tag_query}) deck:"{deck_name}"') if c != card.id]
                _rand.shuffle(tag_card_ids)
            except Exception:
                tag_card_ids = []

        # Fill remaining slots from full deck
        used_ids = set(tag_card_ids)
        all_card_ids = [c for c in mw.col.find_cards(f'"deck:{deck_name}"') if c != card.id and c not in used_ids]
        _rand.shuffle(all_card_ids)

        sampled = (tag_card_ids[:5] + all_card_ids)[:max_answers]

        answers = []
        for cid in sampled:
            try:
                c = mw.col.get_card(cid)
                note = c.note()
                fields = list(note.keys())
                if len(fields) >= 2:
                    ans_text = note[fields[1]]
                    if ans_text and ans_text.strip():
                        clean = re.sub(r'<[^>]+>', ' ', ans_text)
                        clean = re.sub(r'\s+', ' ', clean).strip()
                        if clean and len(clean) < 200:
                            answers.append(clean)
            except Exception:
                continue

        # Prefer answers with similar length to the correct answer
        try:
            correct_fields = list(card.note().keys())
            if len(correct_fields) >= 2:
                import re as _re
                correct_ans = card.note()[correct_fields[1]]
                correct_len = len(_re.sub(r'<[^>]+>', '', correct_ans))
                if correct_len > 0:
                    filtered = [a for a in answers if 0.5 * correct_len <= len(a) <= 2.0 * correct_len]
                    if len(filtered) >= 3:
                        answers = filtered
        except Exception:
            pass

        return answers[:max_answers]
    except Exception as e:
        logger.error(f"CustomReviewer: Error getting deck context: {e}")
        return []


def _generate_mc_async(data, deck_answers=None):
    """Background thread: generate MC options via AI and inject back.
    deck_answers must be pre-collected on the main thread (Anki collection is not thread-safe).
    """
    try:
        question = data.get('question', '')
        correct_answer = data.get('correctAnswer', '')
        card_id = data.get('cardId', None)

        # Step 1: Check cache
        _inject_ai_step('cache', 'Prüfe gespeicherte Optionen…')
        from ..storage.mc_cache import get_cached_mc, save_mc_cache
        cached = get_cached_mc(card_id, question, correct_answer) if card_id else None
        if cached:
            logger.debug(f"CustomReviewer: MC cache hit for card {card_id}")
            _inject_ai_step('done', 'Aus Cache geladen')
            def inject_cached():
                try:
                    if mw and mw.reviewer and mw.reviewer.web:
                        mw.reviewer.web.eval(f'window.onMCOptions({json.dumps(cached)});')
                except Exception as e:
                    logger.error(f"CustomReviewer: Error injecting cached MC: {e}")
            mw.taskman.run_on_main(inject_cached)
            return

        # Step 2: Show deck context step
        if deck_answers:
            _inject_ai_step('context', f'{len(deck_answers)} Karten als Kontext geladen')
        else:
            _inject_ai_step('context', 'Kein Deck-Kontext verfügbar')

        # Step 3: Generate via AI
        _inject_ai_step('generating', 'Generiere Multiple-Choice-Optionen…')
        logger.debug(f"CustomReviewer: MC gen input — question_len={len(question)}, answer_len={len(correct_answer)}, deck_answers={len(deck_answers) if deck_answers else 0}")
        result = _call_ai_mc_generation(question, correct_answer, deck_answers)

        # Check if result is fallback (detect by checking if any option text matches fallback patterns)
        is_fallback = any(opt.get('text', '') in ('Keine der genannten Optionen', 'Alle genannten Optionen sind richtig', 'Die Frage kann nicht beantwortet werden') for opt in result)
        if is_fallback:
            _inject_ai_step('error', 'KI nicht verfügbar — Fallback verwendet')
            logger.debug("CustomReviewer: MC generation used fallback!")
        else:
            _inject_ai_step('synthesis', 'Erklärungen erstellt')

        # Step 5: Cache result (but NOT fallback results)
        if card_id and result and len(result) >= 4 and not is_fallback:
            save_mc_cache(card_id, question, correct_answer, result)
            logger.debug(f"CustomReviewer: MC cached for card {card_id}")

        # Shuffle before sending to frontend
        import random as _rand
        _rand.shuffle(result)

        def inject():
            try:
                if mw and mw.reviewer and mw.reviewer.web:
                    js = f'window.onMCOptions({json.dumps(result)});'
                    mw.reviewer.web.eval(js)
            except Exception as e:
                logger.error(f"CustomReviewer: Error injecting MC options: {e}")

        mw.taskman.run_on_main(inject)

    except Exception as e:
        logger.exception("CustomReviewer: MC generation error: %s", e)
        def inject_error():
            try:
                if mw and mw.reviewer and mw.reviewer.web:
                    mw.reviewer.web.eval('window.onMCOptions([]);')
            except (AttributeError, RuntimeError):
                pass
        mw.taskman.run_on_main(inject_error)


def _ai_get_response_sync(prompt):
    """Get a synchronous AI response, works in both API-key and backend mode.
    Backend mode only supports streaming, so we collect chunks via a blocking callback."""
    from ..ai.handler import get_ai_handler
    ai = get_ai_handler()

    logger.debug(f"CustomReviewer: _ai_get_response_sync called, is_configured={ai.is_configured()}")

    collected = []
    errors = []

    def _collector(chunk, is_done, is_function_call=False, **kwargs):
        logger.debug(f"CustomReviewer: _collector chunk={repr(chunk[:80]) if chunk else None}, is_done={is_done}")
        if chunk:
            collected.append(chunk)
        if is_done and not collected:
            errors.append("No chunks received before done signal")

    try:
        result = ai.get_response(prompt, callback=_collector)
        logger.debug(f"CustomReviewer: get_response returned, collected {len(collected)} chunks, result_len={len(result) if result else 0}")
    except Exception as e:
        logger.exception(f"CustomReviewer: AI response error: {e}")

    if errors:
        logger.error(f"CustomReviewer: Callback errors: {errors}")

    full = ''.join(collected) if collected else None
    if full:
        logger.debug(f"CustomReviewer: AI response ({len(full)} chars): {full[:200]}...")
        # Detect error messages returned as text (not real AI responses)
        error_patterns = ['Bitte verbinden', 'Bitte konfigurieren', 'Fehler bei', 'Quota überschritten', 'nicht konfiguriert']
        for pattern in error_patterns:
            if pattern in full:
                logger.error(f"CustomReviewer: AI response looks like an error message: {full[:100]}")
                _inject_ai_step('error', full[:80])
                return None
    else:
        logger.debug("CustomReviewer: AI response is None/empty — will use fallback")
    return full


def _call_ai_evaluation(question, user_answer, correct_answer):
    """Call AI to evaluate the user's answer. Returns {score, feedback, missing}."""
    try:
        prompt = f"""Vergleiche die Antwort des Lernenden mit der korrekten Antwort.
Erkläre in 1-2 Sätzen SPEZIFISCH was in der Antwort des Lernenden fehlte oder falsch war.
Erkläre NICHT die gesamte Lösung neu — die korrekte Antwort ist dem Lernenden bereits sichtbar.
Fokussiere auf: Was hat der Lernende geschrieben? Was fehlte konkret?

FRAGE:
{question}

KORREKTE ANTWORT:
{correct_answer}

ANTWORT DES LERNENDEN:
{user_answer}

Antworte NUR mit JSON: {{"score": 0-100, "feedback": "..."}}"""

        response = _ai_get_response_sync(prompt)

        if response:
            # Try to parse JSON from response
            cleaned = response.strip()
            if cleaned.startswith('```'):
                cleaned = cleaned.split('\n', 1)[1] if '\n' in cleaned else cleaned[3:]
                if cleaned.endswith('```'):
                    cleaned = cleaned[:-3]
                cleaned = cleaned.strip()
            if cleaned.startswith('json'):
                cleaned = cleaned[4:].strip()

            result = json.loads(cleaned)
            return {
                "score": max(0, min(100, int(result.get("score", 50)))),
                "feedback": result.get("feedback", "Bewertung abgeschlossen."),
                "missing": result.get("missing", "")
            }

    except json.JSONDecodeError as e:
        logger.error(f"CustomReviewer: JSON parse error in evaluation: {e}")
        return {"score": 50, "feedback": "Bewertung konnte nicht vollständig durchgeführt werden."}
    except Exception as e:
        logger.error(f"CustomReviewer: AI evaluation error: {e}")

    # Fallback: simple text comparison
    return _fallback_evaluation(user_answer, correct_answer)


def _fallback_evaluation(user_answer, correct_answer):
    """Simple fallback evaluation without AI."""
    user_words = set(user_answer.lower().split())
    correct_words = set(correct_answer.lower().split())

    if not correct_words:
        return {"score": 50, "feedback": "Keine Referenzantwort verfügbar."}

    # Simple word overlap
    common = user_words & correct_words
    # Remove very common words
    stopwords = {'der', 'die', 'das', 'ein', 'eine', 'und', 'oder', 'ist', 'sind',
                 'in', 'von', 'zu', 'mit', 'auf', 'für', 'an', 'bei', 'the', 'a',
                 'an', 'is', 'are', 'in', 'of', 'to', 'and', 'or', 'for', 'with'}
    meaningful_correct = correct_words - stopwords
    meaningful_common = common - stopwords

    if not meaningful_correct:
        return {"score": 50, "feedback": "Bewertung nicht möglich."}

    score = int((len(meaningful_common) / len(meaningful_correct)) * 100)
    score = max(0, min(100, score))

    if score >= 70:
        feedback = "Gute Antwort! Die wesentlichen Punkte sind richtig."
    elif score >= 40:
        feedback = "Teilweise richtig. Einige wichtige Aspekte fehlen."
    else:
        feedback = "Die Antwort weicht deutlich von der erwarteten Antwort ab."

    return {"score": score, "feedback": feedback}


def _call_ai_mc_generation(question, correct_answer, deck_answers=None):
    """Call AI to generate MC options with explanations. Returns [{text, correct, explanation}, ...]."""
    try:
        deck_context = ""
        if deck_answers:
            deck_context = "\n\nDECK-KONTEXT (Inspiration für Distraktoren):\n"
            for i, ans in enumerate(deck_answers, 1):
                deck_context += f"- {ans}\n"

        prompt = f"""Erstelle 4 MC-Optionen für diese Karteikarten-Frage. 1 korrekt, 3 plausibel falsch.
Jede Option: kurze Erklärung (max 1 Satz, warum richtig/falsch).

FRAGE: {question}
KORREKTE ANTWORT: {correct_answer}{deck_context}

Antworte NUR mit JSON-Array:
[{{"text":"...","correct":true,"explanation":"..."}},{{"text":"...","correct":false,"explanation":"..."}},{{"text":"...","correct":false,"explanation":"..."}},{{"text":"...","correct":false,"explanation":"..."}}]"""

        response = _ai_get_response_sync(prompt)

        if response:
            cleaned = response.strip()
            # Try to extract JSON from various wrapper formats
            if cleaned.startswith('```'):
                cleaned = cleaned.split('\n', 1)[1] if '\n' in cleaned else cleaned[3:]
                if cleaned.endswith('```'):
                    cleaned = cleaned[:-3]
                cleaned = cleaned.strip()
            if cleaned.startswith('json'):
                cleaned = cleaned[4:].strip()

            # Find the JSON array in the response (may have leading text)
            bracket_start = cleaned.find('[')
            bracket_end = cleaned.rfind(']')
            if bracket_start >= 0 and bracket_end > bracket_start:
                cleaned = cleaned[bracket_start:bracket_end + 1]

            options = json.loads(cleaned)
            if isinstance(options, list) and len(options) >= 4:
                # Ensure all options have explanation field
                for opt in options:
                    if 'explanation' not in opt:
                        opt['explanation'] = ''
                logger.info(f"CustomReviewer: AI MC generation SUCCESS — {len(options)} options")
                return options[:4]
            else:
                logger.debug(f"CustomReviewer: AI returned invalid options list (len={len(options) if isinstance(options, list) else 'not-list'})")
        else:
            logger.debug("CustomReviewer: AI returned no response for MC generation")

    except json.JSONDecodeError as e:
        logger.error(f"CustomReviewer: JSON parse error in MC generation: {e}")
    except Exception as e:
        logger.error(f"CustomReviewer: AI MC generation error: {e}")

    # Fallback: generate simple options from correct answer
    return _fallback_mc_generation(correct_answer)


def _fallback_mc_generation(correct_answer):
    """Simple fallback MC generation without AI."""
    short = correct_answer[:80] if len(correct_answer) > 80 else correct_answer
    return [
        {"text": short, "correct": True, "explanation": "Dies ist die korrekte Antwort."},
        {"text": "Keine der genannten Optionen", "correct": False, "explanation": "Die korrekte Antwort ist oben aufgeführt."},
        {"text": "Alle genannten Optionen sind richtig", "correct": False, "explanation": "Nur eine der Optionen ist korrekt."},
        {"text": "Die Frage kann nicht beantwortet werden", "correct": False, "explanation": "Die Frage hat eine klare Antwort."},
    ]


def handle_custom_pycmd(handled: Tuple[bool, any], message: str, context) -> Tuple[bool, any]:
    """
    Handle custom pycmd messages from the reviewer webview.
    Routes commands to appropriate handlers.
    """
    if message == "ans":
        # INTERCEPT: Prevent Anki's _showAnswer() from re-rendering our custom page.
        # We call _showAnswer internals manually, but temporarily disable web.eval
        # so Anki can't modify our DOM.
        try:
            if mw and mw.reviewer:
                rev = mw.reviewer
                web = rev.web

                # Temporarily replace web.eval to prevent DOM modifications
                _orig_eval = web.eval
                def _noop_eval(js):
                    pass  # Swallow all JS evals during _showAnswer
                web.eval = _noop_eval

                try:
                    # Call Anki's _showAnswer which sets internal state,
                    # records timing, fires hooks — everything except DOM changes
                    rev._showAnswer()
                finally:
                    # Restore web.eval immediately
                    web.eval = _orig_eval

                # CRITICAL: Force focus back to webview after _showAnswer
                # Qt operations during _showAnswer can steal focus from the webview,
                # which prevents JS keyboard events from firing.
                from aqt.qt import QTimer
                def _refocus():
                    try:
                        if mw and mw.reviewer and mw.reviewer.web:
                            mw.reviewer.web.setFocus()
                            mw.reviewer.web.eval('document.body.focus(); window.focus();')
                    except Exception:
                        pass
                # Single refocus after Qt layout stabilizes
                QTimer.singleShot(150, _refocus)

                logger.error("CustomReviewer: ✅ ans intercepted (internal state updated, no DOM change)")
        except Exception as e:
            logger.error(f"CustomReviewer: ans intercept error: {e}")
            # Fallback: at minimum set state
            try:
                if mw and mw.reviewer:
                    mw.reviewer.state = "answer"
            except Exception:
                pass
        return (True, None)

    elif message.startswith("ease"):
        # Handle ease ratings — the critical card-advance flow.
        #
        # WHY this is complex:
        # _answerCard() internally calls nextCard() → _showQuestion() → web.eval('_showQuestion(html,...)')
        # But our custom template does NOT have Anki's built-in _showQuestion JS function,
        # so that web.eval silently fails and the page never updates.
        #
        # FIX: Swallow web.eval during _answerCard (like we do for 'ans'),
        # then force a FULL page reload via _initWeb() so our
        # webview_will_set_content hook fires again with the next card.
        try:
            ease_num = int(message[4:])
            logger.debug(f"CustomReviewer: ease{ease_num} received")
            if mw and mw.reviewer:
                rev = mw.reviewer
                rev.state = "answer"
                card = rev.card
                if not card:
                    logger.error("CustomReviewer: ❌ No card on reviewer!")
                    return (True, None)

                # Clamp ease to valid range
                try:
                    btn_count = mw.col.sched.answerButtons(card)
                    if ease_num > btn_count:
                        ease_num = btn_count
                except Exception:
                    pass

                # Swallow ALL web.eval calls during _answerCard.
                # _answerCard → nextCard → _showQuestion → web.eval(...)
                # That JS call targets Anki's default DOM which doesn't exist
                # in our custom template. We'll do a full reload instead.
                web = rev.web
                _orig_eval = web.eval
                web.eval = lambda js: None
                try:
                    rev._answerCard(ease_num)
                finally:
                    web.eval = _orig_eval

                logger.info(f"CustomReviewer: ✅ Card answered ease={ease_num}")

                # Send review result to chat panel for SectionDivider performance data
                try:
                    from ..ui import setup as ui_setup
                    chat_widget = getattr(ui_setup, '_chatbot_widget', None)
                    if chat_widget and hasattr(chat_widget, 'web_view'):
                        ease_labels = {1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy'}
                        # Calculate time spent on card (approximate from card stats)
                        try:
                            time_taken = card.time_taken() // 1000 if hasattr(card, 'time_taken') else 0
                        except (TypeError, AttributeError):
                            time_taken = 0
                        review_payload = {
                            "type": "reviewResult",
                            "data": {
                                "cardId": card.id,
                                "ease": ease_num,
                                "rating": ease_labels.get(ease_num, 'Good'),
                                "timeSeconds": time_taken,
                                "score": {1: 0, 2: 40, 3: 70, 4: 100}.get(ease_num, 70)
                            }
                        }
                        js = f"if(window.ankiReceive) window.ankiReceive({json.dumps(review_payload)});"
                        chat_widget.web_view.page().runJavaScript(js)
                        logger.debug(f"CustomReviewer: 📊 Review result sent to chat: ease={ease_num}")
                except Exception as e:
                    logger.error(f"CustomReviewer: ⚠️ Could not send review result to chat: {e}")

                # After _answerCard, rev.card is now the NEXT card
                # (set internally by nextCard() → sched.getCard()).
                # Track the new card in the review trail
                if rev.card:
                    if not hasattr(handle_custom_pycmd, '_review_trail'):
                        handle_custom_pycmd._review_trail = []
                        handle_custom_pycmd._trail_index = -1
                    trail = handle_custom_pycmd._review_trail
                    new_cid = rev.card.id
                    if len(trail) == 0 or trail[-1] != new_cid:
                        trail.append(new_cid)
                        handle_custom_pycmd._trail_index = len(trail) - 1

                # Force a full page reload so our webview_will_set_content
                # hook renders the new card with our custom template.
                if rev.card:
                    # Ensure timer_started is set (safety)
                    import time as _time
                    if not getattr(rev.card, 'timer_started', None):
                        rev.card.timer_started = _time.time()
                    next_card = rev.card
                    logger.debug(f"CustomReviewer: 🔄 Loading next card {next_card.id}...")

                    # Defer _initWeb to avoid Qt re-entrancy SEGFAULT
                    def _do_show_next(rev=rev, card=next_card):
                        if hasattr(rev, '_initWeb'):
                            rev._initWeb()
                        else:
                            rev.web.stdHtml("", context=rev)
                        # Send cardContext to chat panel
                        try:
                            from ..ui import setup as ui_setup
                            chat_widget = getattr(ui_setup, '_chatbot_widget', None)
                            if chat_widget and hasattr(chat_widget, 'card_tracker'):
                                chat_widget.card_tracker.send_card_context(card, is_question=True)
                                logger.info(f"CustomReviewer: ✅ cardContext sent to chat for next card {card.id}")
                        except Exception as ctx_e:
                            logger.error(f"CustomReviewer: ⚠️ Could not send cardContext after ease: {ctx_e}")

                    from aqt.qt import QTimer
                    QTimer.singleShot(0, _do_show_next)
                else:
                    logger.debug("CustomReviewer: 📋 No more cards — going to overview")
                    mw.moveToState("overview")
            else:
                logger.error("CustomReviewer: ❌ No mw or reviewer available")
        except Exception as e:
            logger.exception(f"CustomReviewer: ❌ ease rating error: {e}")
        return (True, None)

    elif message == "toggle-sidebar":
        try:
            from ..ui.settings_sidebar import toggle_settings_sidebar
            toggle_settings_sidebar()
        except Exception as e:
            logger.error("toggle-sidebar error: %s", e)
        return (True, None)

    elif message == "settings":
        # Open Anki's native preferences
        try:
            if mw and hasattr(mw, 'onPrefs'):
                mw.onPrefs()
        except Exception:
            pass
        return (True, None)

    elif message == "deck:home":
        if mw:
            mw.moveToState("deckBrowser")
        return (True, None)

    elif message == "deck:stats":
        if mw:
            mw.onStats()
        return (True, None)

    elif message == "plusi:ask":
        # Open chat panel with @Plusi prefix
        try:
            from ..ui import setup as ui_setup
            if not (hasattr(ui_setup, '_chatbot_dock') and ui_setup._chatbot_dock and ui_setup._chatbot_dock.isVisible()):
                if hasattr(ui_setup, 'toggle_chatbot'):
                    ui_setup.toggle_chatbot()
            # Send @Plusi focus event to React
            chat_widget = getattr(ui_setup, '_chatbot_widget', None)
            if chat_widget and hasattr(chat_widget, 'web_view'):
                chat_widget.web_view.page().runJavaScript(
                    "window.dispatchEvent(new CustomEvent('plusi-ask-focus', {detail: {prefix: '@Plusi '}}));"
                )
        except Exception as e:
            logger.error(f"plusi:ask error: {e}")
        return (True, None)

    elif message == "plusi:settings":
        try:
            if mw:
                mw.onPrefs()
        except Exception as e:
            logger.error("plusi:settings error: %s", e)
        return (True, None)

    elif message == "dock:query_panel_state":
        # Reviewer asks: is the side panel open? Respond authoritatively.
        # Note: web.eval() is Qt's QWebEngineView JS execution API, not Python eval().
        try:
            from ..ui.setup import _chatbot_dock
            is_open = _chatbot_dock is not None and _chatbot_dock.isVisible()
            if mw and mw.reviewer and mw.reviewer.web:
                val = "true" if is_open else "false"
                mw.reviewer.web.eval(f'if(window.setChatOpen) setChatOpen({val});')
        except Exception as e:
            logger.debug("dock:query_panel_state error: %s", e)
        return (True, None)

    elif message.startswith("debug:"):
        logger.debug("REVIEWER JS: %s", message)
        return (True, None)

    elif message == "plusi:panel":
        from ..plusi.panel import toggle_panel
        toggle_panel()
        return (True, None)

    elif message == "plusi:panelClose":
        from ..plusi.panel import toggle_panel
        toggle_panel()
        return (True, None)

    elif message == "chat:open":
        try:
            from ..ui import setup as ui_setup
            was_already_open = hasattr(ui_setup, '_chatbot_dock') and ui_setup._chatbot_dock and ui_setup._chatbot_dock.isVisible()

            if not was_already_open:
                if hasattr(ui_setup, 'toggle_chatbot'):
                    ui_setup.toggle_chatbot()

            # Tell reviewer JS that chat is now open
            try:
                if mw and mw.reviewer and mw.reviewer.web:
                    mw.reviewer.web.eval('if(window.setChatOpen) setChatOpen(true);')
            except Exception:
                pass

            # Auto-focus the chat textarea after panel opens/is shown
            from aqt.qt import QTimer
            def _focus_chat_textarea():
                try:
                    widget = ui_setup._chatbot_widget
                    if widget and hasattr(widget, 'web_view'):
                        # Focus the webview widget itself first
                        widget.web_view.setFocus()
                        # Then focus the textarea inside
                        widget.web_view.page().runJavaScript(
                            "var ta = document.querySelector('textarea'); if (ta) { ta.focus(); }"
                        )
                        logger.info("CustomReviewer: ✅ Chat textarea focused")
                except Exception as e:
                    logger.error(f"CustomReviewer: focus chat error: {e}")
            # Single delay after webview content is ready
            QTimer.singleShot(400, _focus_chat_textarea)
        except Exception as e:
            logger.error(f"CustomReviewer: Error opening chat: {e}")

        # If MC mode with wrong picks, auto-send initial message explaining the error
        try:
            import builtins as _builtins
            ctx = getattr(_builtins, '_anki_card_context', {})
            if ctx.get('mode') == 'mc' and ctx.get('mcContext') and ctx['mcContext'].get('wrongPicks'):
                mc = ctx['mcContext']
                wrong_texts = [p['text'] for p in mc['wrongPicks'] if p.get('text')]
                correct = (mc.get('correctOption') or {}).get('text', '') or ctx.get('correctAnswer', '')
                if wrong_texts and correct:
                    initial_msg = (
                        f"Ich habe gerade eine Multiple-Choice-Frage falsch beantwortet. "
                        f"Ich hatte '{', '.join(wrong_texts)}' gewählt, aber die richtige Antwort war '{correct}'. "
                        f"Kannst du mir kurz erklären, warum meine Wahl falsch war?"
                    )
                    def _send_initial(msg=initial_msg):
                        try:
                            widget = ui_setup._chatbot_widget
                            if widget and hasattr(widget, 'web_view'):
                                widget.web_view.page().runJavaScript(
                                    f"if(window.ankiReceive) window.ankiReceive({json.dumps({'type': 'initialMessage', 'data': {'text': msg}})});"
                                )
                        except Exception as e:
                            logger.error(f"CustomReviewer: Error sending initial MC message: {e}")
                    QTimer.singleShot(800, _send_initial)
        except Exception as e:
            logger.error(f"CustomReviewer: Error preparing initial MC message: {e}")

        return (True, None)

    elif message == "chat:close":
        try:
            from ..ui import setup as ui_setup
            is_open = hasattr(ui_setup, '_chatbot_dock') and ui_setup._chatbot_dock and ui_setup._chatbot_dock.isVisible()
            if is_open:
                # Hide panel without setting _panel_user_closed (auto-close on card advance)
                ui_setup._chatbot_dock.hide()
                ui_setup._notify_reviewer_chat_state(False)
            # Tell reviewer JS that chat is now closed
            try:
                if mw and mw.reviewer and mw.reviewer.web:
                    mw.reviewer.web.eval('if(window.setChatOpen) setChatOpen(false);')
            except Exception:
                pass
            # Refocus reviewer webview
            from aqt.qt import QTimer
            def _refocus_reviewer():
                try:
                    if mw and mw.reviewer and mw.reviewer.web:
                        mw.reviewer.web.setFocus()
                        mw.reviewer.web.eval('document.body.focus(); window.focus();')
                except Exception:
                    pass
            QTimer.singleShot(100, _refocus_reviewer)
        except Exception as e:
            logger.error(f"CustomReviewer: Error closing chat: {e}")
        return (True, None)

    elif message.startswith("chat:context:"):
        # Store context for chat panel (when user opens "Weitere Fragen")
        try:
            data = json.loads(message[13:])
            # Store in a global that the chat widget can access
            import builtins
            builtins._anki_card_context = data
            logger.debug(f"CustomReviewer: Card context stored for chat")
        except Exception as e:
            logger.error(f"CustomReviewer: Error storing chat context: {e}")
        return (True, None)

    elif message.startswith("evaluate:"):
        # AI evaluation of free-text answer
        try:
            data = json.loads(message[9:])
            thread = threading.Thread(target=_evaluate_answer_async, args=(data,), daemon=True)
            thread.start()
            logger.debug(f"CustomReviewer: Evaluation started in background")
        except Exception as e:
            logger.error(f"CustomReviewer: Error starting evaluation: {e}")
            # Fallback: show answer
            if mw and mw.reviewer and mw.reviewer.web:
                mw.reviewer.web.eval('window.onEvaluationResult({"error": "Parse error"});')
        return (True, None)

    elif message.startswith("mc:generate:"):
        # AI generation of MC options
        # IMPORTANT: Collect deck context on main thread (Anki collection is not thread-safe)
        try:
            data = json.loads(message[12:])
            deck_answers = _get_deck_context_answers_sync(data.get('cardId'))
            thread = threading.Thread(target=_generate_mc_async, args=(data, deck_answers), daemon=True)
            thread.start()
            logger.debug(f"CustomReviewer: MC generation started in background (deck_answers={len(deck_answers)})")
        except Exception as e:
            logger.error(f"CustomReviewer: Error starting MC generation: {e}")
            if mw and mw.reviewer and mw.reviewer.web:
                mw.reviewer.web.eval('window.onMCOptions([]);')
        return (True, None)

    elif message == "preview:close":
        close_preview()
        return (True, None)

    elif message == "preview:toggle_chat":
        if _preview_state['active']:
            if _preview_state['stage'] == 'peek':
                _preview_state['stage'] = 'card_chat'
                _notify_frontend_preview('card_chat', _preview_state['card_id'])
                if mw.reviewer and mw.reviewer.web:
                    mw.reviewer.web.eval("window.updatePreviewChatLabel(true);")
            else:
                _preview_state['stage'] = 'peek'
                _notify_frontend_preview('peek', _preview_state['card_id'])
                if mw.reviewer and mw.reviewer.web:
                    mw.reviewer.web.eval("window.updatePreviewChatLabel(false);")
        return (True, None)

    elif message.startswith("navigate:"):
        # Review Trail Navigation
        # Supports: navigate:prev, navigate:next, navigate:<cardId>
        try:
            arg = message[9:]

            # Maintain review trail as a list on this function
            if not hasattr(handle_custom_pycmd, '_review_trail'):
                handle_custom_pycmd._review_trail = []
                handle_custom_pycmd._trail_index = -1

            trail = handle_custom_pycmd._review_trail
            idx = handle_custom_pycmd._trail_index

            # Track current card if not already at end of trail
            if mw and mw.reviewer and mw.reviewer.card:
                current_cid = mw.reviewer.card.id
                if len(trail) == 0 or (idx == len(trail) - 1 and trail[-1] != current_cid):
                    trail.append(current_cid)
                    handle_custom_pycmd._trail_index = len(trail) - 1
                    idx = handle_custom_pycmd._trail_index

            target_card_id = None

            if arg == 'prev':
                if idx > 0:
                    handle_custom_pycmd._trail_index -= 1
                    target_card_id = trail[handle_custom_pycmd._trail_index]
                else:
                    logger.debug("CustomReviewer: Already at beginning of trail")
                    return (True, None)
            elif arg == 'next':
                if idx < len(trail) - 1:
                    handle_custom_pycmd._trail_index += 1
                    target_card_id = trail[handle_custom_pycmd._trail_index]
                else:
                    logger.debug("CustomReviewer: Already at end of trail")
                    return (True, None)
            else:
                target_card_id = int(arg)

            if target_card_id and mw and mw.reviewer and mw.col:
                card = mw.col.get_card(target_card_id)
                if card:
                    rev = mw.reviewer
                    rev.card = card
                    # Set timer_started so _answerCard doesn't crash
                    import time as _time
                    card.timer_started = _time.time()

                    # Determine if navigated card should show in answered state
                    # Cards behind the current trail position were already reviewed
                    is_history = handle_custom_pycmd._trail_index < len(handle_custom_pycmd._review_trail) - 1

                    # Defer _initWeb() to avoid SEGFAULT when called from
                    # within a pycmd handler (Qt re-entrancy issue)
                    def _do_navigate(rev=rev, card=card, target_id=target_card_id, show_answer=is_history):
                        handle_custom_pycmd._is_navigating = True
                        handle_custom_pycmd._show_answered = show_answer
                        try:
                            rev._initWeb()
                        finally:
                            handle_custom_pycmd._is_navigating = False
                        logger.debug(f"CustomReviewer: Navigated to card {target_id} (trail {handle_custom_pycmd._trail_index + 1}/{len(handle_custom_pycmd._review_trail)}, answered={show_answer})")

                        # Send cardContext to chat panel after webview is ready
                        is_q = not show_answer
                        try:
                            from ..ui import setup as ui_setup
                            chat_widget = getattr(ui_setup, '_chatbot_widget', None)
                            if chat_widget and hasattr(chat_widget, 'card_tracker'):
                                chat_widget.card_tracker.send_card_context(card, is_question=is_q)
                                logger.info(f"CustomReviewer: ✅ cardContext sent to chat for card {target_id}")
                        except Exception as nav_e:
                            logger.error(f"CustomReviewer: ⚠️ Could not send cardContext after navigate: {nav_e}")

                        # For history cards: load and inject stored performance result
                        if show_answer:
                            try:
                                from ..storage.card_sessions import load_card_session
                                session_data = load_card_session(target_id)
                                if session_data:
                                    sections = session_data.get('sections', [])
                                    # Find the latest section with performance data
                                    perf_section = None
                                    for s in reversed(sections):
                                        if s.get('performance_data'):
                                            perf_section = s
                                            break
                                    if perf_section:
                                        perf_data = perf_section['performance_data']
                                        perf_json = json.dumps(perf_data) if not isinstance(perf_data, str) else perf_data
                                        def _inject_perf():
                                            try:
                                                if mw and mw.reviewer and mw.reviewer.web:
                                                    mw.reviewer.web.eval(
                                                        f'if(window.showStoredPerformance) showStoredPerformance({perf_json});'
                                                    )
                                            except Exception:
                                                pass
                                        from aqt.qt import QTimer as _QT
                                        _QT.singleShot(300, _inject_perf)
                            except Exception as perf_e:
                                logger.error(f"CustomReviewer: ⚠️ Could not load performance for card {target_id}: {perf_e}")

                    from aqt.qt import QTimer
                    QTimer.singleShot(0, _do_navigate)
                else:
                    logger.debug(f"CustomReviewer: Card {target_card_id} not found")
        except Exception as e:
            logger.exception(f"CustomReviewer: Error navigating: {e}")
        return (True, None)

    return handled


# ─── Design-system token loader ──────────────────────────────────────────────

_design_tokens_css = None

def _get_design_tokens_css():
    """Load shared/styles/design-system.css and cache it."""
    global _design_tokens_css
    if _design_tokens_css is None:
        css_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'shared', 'styles', 'design-system.css')
        try:
            with open(css_path, 'r', encoding='utf-8') as f:
                _design_tokens_css = f.read()
        except Exception as e:
            logger.error("CustomReviewer: Could not load design-system.css: %s", e)
            _design_tokens_css = ''
    return _design_tokens_css


class CustomReviewer:
    """
    Custom Reviewer that uses webview_will_set_content hook
    to replace Anki's reviewer HTML before rendering.

    Usage:
        custom_reviewer = CustomReviewer()
        custom_reviewer.enable()  # Activate custom UI
        custom_reviewer.disable()  # Restore native reviewer
    """

    def __init__(self):
        self.active = False
        self._hook_registered = False
        self._pycmd_hook_registered = False
        self._addon_dir = os.path.dirname(os.path.abspath(__file__))
        self._css_cache: Optional[str] = None
        self._js_cache: Optional[str] = None
        self._html_cache: Optional[str] = None

    def _hide_reviewer_bottom(self):
        """Hide Anki's native reviewer bottom bar at Qt level — called before rendering."""
        try:
            if mw and hasattr(mw, 'reviewer') and mw.reviewer:
                if hasattr(mw.reviewer, 'bottom') and mw.reviewer.bottom:
                    web = mw.reviewer.bottom.web
                    web.hide()
                    web.setFixedHeight(0)
                    web.setMaximumHeight(0)
                    web.setMinimumHeight(0)
                if hasattr(mw.reviewer, '_bottomWeb') and mw.reviewer._bottomWeb:
                    mw.reviewer._bottomWeb.hide()
                    mw.reviewer._bottomWeb.setFixedHeight(0)
        except Exception:
            pass

    def enable(self):
        """Enable custom reviewer using webview hook"""
        if not self._hook_registered:
            gui_hooks.webview_will_set_content.append(self._on_webview_content)
            self._hook_registered = True
            logger.info("CustomReviewer: Hook registered")

        # Register pycmd handler for custom buttons
        if not self._pycmd_hook_registered:
            gui_hooks.webview_did_receive_js_message.append(handle_custom_pycmd)
            self._pycmd_hook_registered = True
            logger.info("CustomReviewer: pycmd hook registered for deck:home and deck:stats")

        self.active = True
        logger.info("CustomReviewer: Enabled - using custom reviewer UI")

    def disable(self):
        """Disable custom reviewer (hook stays registered but inactive)"""
        self.active = False
        logger.info("CustomReviewer: Disabled - using native Anki reviewer")

    def toggle(self):
        """Toggle between custom and native reviewer"""
        if self.active:
            self.disable()
        else:
            self.enable()
        return self.active

    def _on_webview_content(self, web_content, context):
        """
        Hook called BEFORE webview renders content.
        Replaces reviewer HTML with our custom UI.
        """
        if not self.active:
            logger.info("CustomReviewer: Hook called but inactive")
            return

        # Only modify if context is the Reviewer
        if not isinstance(context, Reviewer):
            logger.info(f"CustomReviewer: Hook called but context is {type(context).__name__}, not Reviewer")
            return

        # Get current card from the reviewer
        card = context.card
        if not card:
            logger.debug("CustomReviewer: No card available")
            return

        try:
            # Hide native bottom bar IMMEDIATELY (before rendering)
            self._hide_reviewer_bottom()

            # Track card in review trail (so arrow navigation works from the first card)
            # SKIP during backward/forward navigation — the navigate handler manages the index
            if not hasattr(handle_custom_pycmd, '_review_trail'):
                handle_custom_pycmd._review_trail = []
                handle_custom_pycmd._trail_index = -1
            if not getattr(handle_custom_pycmd, '_is_navigating', False):
                trail = handle_custom_pycmd._review_trail
                cid = card.id
                if len(trail) == 0 or trail[-1] != cid:
                    trail.append(cid)
                    handle_custom_pycmd._trail_index = len(trail) - 1

            # Build custom HTML and replace the body
            # If navigating to a previously-reviewed card, show it answered
            show_answered = getattr(handle_custom_pycmd, '_show_answered', False)
            if show_answered:
                handle_custom_pycmd._show_answered = False  # Reset flag
            custom_html = self._build_reviewer_html(card, context, show_answered=show_answered)
            web_content.body = custom_html
            logger.info(f"CustomReviewer: ✅ Injected custom HTML for card {card.id} (trail {handle_custom_pycmd._trail_index + 1}/{len(handle_custom_pycmd._review_trail)})")
        except Exception as e:
            logger.exception(f"CustomReviewer: ❌ Error in hook: {e}")
            # Don't modify web_content on error - let native UI show

    def _load_css(self) -> str:
        """Load compiled Tailwind+DaisyUI CSS (no caching for dev)"""
        # Primary: compiled DaisyUI CSS
        css_path = os.path.join(self._addon_dir, 'reviewer.css')
        if os.path.exists(css_path):
            with open(css_path, 'r', encoding='utf-8') as f:
                return f.read()
        # Fallback: old styles.css
        css_path = os.path.join(self._addon_dir, 'styles.css')
        if os.path.exists(css_path):
            with open(css_path, 'r', encoding='utf-8') as f:
                return f.read()
        return self._get_default_css()

    def _load_js(self) -> str:
        """Load JavaScript from file (no caching for dev)"""
        js_path = os.path.join(self._addon_dir, 'interactions.js')
        if os.path.exists(js_path):
            with open(js_path, 'r', encoding='utf-8') as f:
                return f.read()
        return self._get_default_js()

    def _load_template(self) -> str:
        """Load HTML template from file (no caching for dev)"""
        html_path = os.path.join(self._addon_dir, 'template.html')
        if os.path.exists(html_path):
            with open(html_path, 'r', encoding='utf-8') as f:
                return f.read()
        return None

    def clear_cache(self):
        """Clear cached CSS/JS/HTML for development"""
        self._css_cache = None
        self._js_cache = None
        self._html_cache = None
        logger.debug("CustomReviewer: Cache cleared")

    def _get_button_labels(self, reviewer) -> list:
        """Get dynamic button labels from scheduler"""
        try:
            if not mw or not mw.col:
                return ["Again", "Hard", "Good", "Easy"]

            # Get scheduling states for the card
            states = reviewer._state
            if hasattr(mw.col.sched, 'describe_next_states') and states:
                try:
                    labels = mw.col.sched.describe_next_states(states)
                    if labels and len(labels) >= 4:
                        return list(labels[:4])
                except (AttributeError, KeyError, RuntimeError):
                    pass

            # Fallback: Use answerButtons count and default labels
            button_count = mw.col.sched.answerButtons(reviewer.card)
            if button_count == 2:
                return ["Again", "Good"]
            elif button_count == 3:
                return ["Again", "Good", "Easy"]
            else:
                return ["Again", "Hard", "Good", "Easy"]

        except Exception as e:
            logger.error(f"CustomReviewer: Error getting button labels: {e}")
            return ["Again", "Hard", "Good", "Easy"]

    def _get_progress_info(self, reviewer) -> dict:
        """Get session progress information"""
        try:
            if not mw or not mw.col:
                return {"done": 0, "total": 0, "new": 0, "learning": 0, "review": 0}

            # Get counts from scheduler
            counts = list(mw.col.sched.counts())
            new_count = counts[0] if len(counts) > 0 else 0
            learning_count = counts[1] if len(counts) > 1 else 0
            review_count = counts[2] if len(counts) > 2 else 0

            total_remaining = new_count + learning_count + review_count

            # Estimate done cards (this is approximate)
            done = 0
            if hasattr(mw.col.sched, 'reps'):
                done = mw.col.sched.reps

            return {
                "done": done,
                "total": done + total_remaining,
                "remaining": total_remaining,
                "new": new_count,
                "learning": learning_count,
                "review": review_count
            }
        except Exception as e:
            logger.error(f"CustomReviewer: Error getting progress: {e}")
            return {"done": 0, "total": 0, "remaining": 0, "new": 0, "learning": 0, "review": 0}

    def _get_card_info(self, card) -> dict:
        """Get card metadata for display"""
        try:
            note = card.note()

            # Get deck name
            deck_name = ""
            if mw and mw.col:
                full_name = mw.col.decks.name(card.did)
                # Only show the deepest deck level (after last ::)
                deck_name = full_name.split("::")[-1] if full_name else ""

            # Check if card is marked/flagged
            is_marked = note.has_tag("marked")
            flag = card.flags

            return {
                "cardId": card.id,
                "noteId": card.nid,
                "deckName": deck_name,
                "isMarked": is_marked,
                "flag": flag,
                "reps": card.reps,
                "lapses": card.lapses,
                "interval": card.ivl,
                "ease": card.factor
            }
        except Exception as e:
            logger.error(f"CustomReviewer: Error getting card info: {e}")
            return {}

    def _build_reviewer_html(self, card, reviewer, show_answered=False) -> str:
        """Generate completely custom HTML for the reviewer"""
        # Get card content
        question_html = card.question()
        answer_html = card.answer()

        # Get button labels
        button_labels = self._get_button_labels(reviewer)
        button_count = len(button_labels)

        # Get progress info
        progress = self._get_progress_info(reviewer)

        # Get card info
        card_info = self._get_card_info(card)

        # Build button HTML
        button_html = self._build_rating_buttons(button_labels)

        # Load CSS and JS (prepend design system tokens so var(--ds-*) works)
        design_tokens = _get_design_tokens_css()
        css = design_tokens + '\n' + self._load_css()
        js = self._load_js()

        # Resolve current theme (dark/light)
        try:
            from ..ui.theme import get_resolved_theme
        except ImportError:
            from ui.theme import get_resolved_theme
        resolved_theme = get_resolved_theme()
        is_dark_mode = resolved_theme == "dark"

        # Try to load template, otherwise use inline HTML
        template = self._load_template()

        if template:
            # Replace placeholders in template
            html = template
            html = html.replace('{{CSS}}', css)
            html = html.replace('{{THEME}}', resolved_theme)
            html = html.replace('{{COLOR_SCHEME}}', resolved_theme)
            html = html.replace('{{IS_DARK_MODE}}', 'nightMode' if is_dark_mode else '')
            html = html.replace('{{QUESTION}}', question_html)
            html = html.replace('{{ANSWER}}', answer_html)
            html = html.replace('{{BUTTONS}}', button_html)
            html = html.replace('{{BUTTON_COUNT}}', str(button_count))
            html = html.replace('{{PROGRESS_DONE}}', str(progress.get('done', 0)))
            html = html.replace('{{PROGRESS_REMAINING}}', str(progress.get('remaining', 0)))
            html = html.replace('{{PROGRESS_NEW}}', str(progress.get('new', 0)))
            html = html.replace('{{PROGRESS_LEARNING}}', str(progress.get('learning', 0)))
            html = html.replace('{{PROGRESS_REVIEW}}', str(progress.get('review', 0)))
            html = html.replace('{{DECK_NAME}}', card_info.get('deckName', ''))
            # Profile initial for avatar
            profile_initial = '?'
            try:
                if mw and mw.pm and mw.pm.name:
                    profile_initial = mw.pm.name[0].upper()
            except Exception:
                pass
            html = html.replace('{{PROFILE_INITIAL}}', profile_initial)
            # Profile name
            profile_name = ''
            try:
                if mw and mw.pm and mw.pm.name:
                    profile_name = mw.pm.name
            except Exception:
                pass
            html = html.replace('{{PROFILE_NAME}}', profile_name or 'Profil')
            # Account badge — frosted glass style
            is_premium_user = False
            try:
                from ..ai import auth
                status = auth.get_auth_status()
                is_premium_user = status.get('is_premium') or status.get('isPremium')
            except Exception:
                pass
            if is_premium_user:
                html = html.replace('{{ACCOUNT_BADGE_HTML}}',
                    '<span style="font-size:9px;font-weight:600;letter-spacing:0.5px;padding:2px 7px;'
                    'border-radius:5px;background:rgba(10,132,255,0.12);color:rgba(10,132,255,0.7);">PRO</span>')
            else:
                html = html.replace('{{ACCOUNT_BADGE_HTML}}',
                    '<span style="font-size:9px;font-weight:600;letter-spacing:0.5px;padding:2px 7px;'
                    'border-radius:5px;background:var(--ds-hover-tint);color:var(--ds-text-muted);">Free</span>')
            html = html.replace('{{CARD_INFO}}', json.dumps(card_info))
            html = html.replace('{{JS}}', js)
        else:
            # Inline HTML fallback
            html = self._build_inline_html(
                css=css,
                question=question_html,
                answer=answer_html,
                buttons=button_html,
                button_count=button_count,
                progress=progress,
                card_info=card_info,
                js=js,
                is_dark_mode=is_dark_mode  # NEW
            )

        # Inject chat panel state so interactions.js knows whether dock should be hidden.
        chat_panel_open = False
        try:
            from ..ui.setup import _chatbot_dock
            if _chatbot_dock is not None and _chatbot_dock.isVisible():
                chat_panel_open = True
        except Exception:
            pass
        chat_state_js = f'\n<script>window.__chatOpen = {"true" if chat_panel_open else "false"};</script>'
        html = html.replace('</head>', chat_state_js + '\n</head>')

        # CRITICAL FIX: Inject override CSS at the END of body tag
        override_css = """
<style>
/* FORCE TRANSPARENCY: Override AMBOSS deck background */
.card,
.card.nightMode,
#qa,
.card-container {
    background: transparent !important;
    background-color: transparent !important;
}
</style>"""
        # Check if we're in preview mode — inject preview JS instead of history mode
        _is_preview = _preview_state.get('active', False)
        if _is_preview:
            preview_js = """
<script>
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
        // Hide question, show only answer (back side)
        var questionEl = document.querySelector('section.question');
        if (questionEl) questionEl.style.display = 'none';
        var divider = document.getElementById('card-divider');
        if (divider) divider.style.display = 'none';
        // Show answer section
        var ansSection = document.getElementById('answer-section');
        if (ansSection) ansSection.classList.remove('hidden');
        // Hide the answer input textfield
        var inputEl = document.getElementById('dc-input');
        if (inputEl) inputEl.style.display = 'none';
        // Set preview state
        document.body.setAttribute('data-state', 'preview');
        if (window.setPreviewMode) window.setPreviewMode();
    }, 50);
});
</script>
"""
            html = html.replace('</body>', preview_js + '</body>')

        # Auto-show answer + HISTORY mode for previously-reviewed cards
        auto_answer_js = ""
        if not _is_preview and show_answered:
            auto_answer_js = """
<script>
// Flag to prevent load-event from resetting to QUESTION state
window._historyPending = true;
// Auto-show answer for previously-reviewed card, then switch to HISTORY dock mode
document.addEventListener('DOMContentLoaded', function() {
    if (typeof showAnswer === 'function') showAnswer();
    setTimeout(function() {
        if (typeof setHistoryMode === 'function') setHistoryMode();
    }, 100);
});
setTimeout(function() {
    if (typeof showAnswer === 'function') showAnswer();
    setTimeout(function() {
        if (typeof setHistoryMode === 'function') setHistoryMode();
    }, 100);
}, 50);
</script>"""

        # Inject Plusi dock into reviewer
        try:
            from ..plusi.dock import get_plusi_dock_injection
        except (ImportError, ValueError):
            try:
                import importlib, os, sys
                _addon_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                if _addon_dir not in sys.path:
                    sys.path.insert(0, _addon_dir)
                from plusi.dock import get_plusi_dock_injection
            except ImportError:
                get_plusi_dock_injection = lambda: ''
        plusi_html = get_plusi_dock_injection()

        html = html.replace('</body>', override_css + auto_answer_js + plusi_html + '</body>')

        return html

    def _build_rating_buttons(self, labels: list) -> str:
        """Build HTML for rating buttons — DaisyUI style"""
        color_classes = {1: 'text-error', 2: 'text-warning', 3: 'text-success', 4: 'text-primary'}
        buttons = []
        for i, label in enumerate(labels):
            ease = i + 1
            color = color_classes.get(ease, '')
            buttons.append(
                f'<button class="btn btn-ghost btn-sm flex-1 rounded-none h-11 {color} font-medium text-sm no-animation" onclick="rateCard({ease})">'
                f'{label}'
                f'<kbd class="kbd kbd-xs bg-transparent border-none text-base-content/20 font-mono">{ease}</kbd>'
                f'</button>'
            )
        return '\n'.join(buttons)

    def _build_inline_html(self, css, question, answer, buttons, button_count, progress, card_info, js, is_dark_mode=False) -> str:
        """Build inline HTML when template is not available - Jony Ive inspired"""
        dark_mode_class = 'nightMode' if is_dark_mode else ''
        _inline_theme = 'dark' if is_dark_mode else 'light'
        return f'''<!DOCTYPE html>
<html lang="en" data-theme="{_inline_theme}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
{css}
    </style>
</head>
<body class="{dark_mode_class}">
    <div id="reviewer" data-state="question" data-button-count="{button_count}">
        <div class="surface">
            <nav class="stats-bar">
                <div class="stats">
                    <span class="stat" data-type="new">{progress.get('new', 0)}</span>
                    <span class="stat" data-type="learning">{progress.get('learning', 0)}</span>
                    <span class="stat" data-type="review">{progress.get('review', 0)}</span>
                </div>
                <span class="deck">{card_info.get('deckName', '')}</span>
                <div class="actions">
                    <div class="action-group">
                        <button class="action" onclick="pycmd('deck:home')" aria-label="Stapel">
                            <svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                        </button>
                        <button class="action" onclick="pycmd('deck:stats')" aria-label="Statistik">
                            <svg viewBox="0 0 24 24"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
                        </button>
                        <button class="action" onclick="editCard()" aria-label="Bearbeiten">
                            <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button class="action" onclick="pycmd('chat:open')" aria-label="Chat">
                            <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                        </button>
                    </div>
                </div>
            </nav>
            <main class="canvas">
                <article class="card">
                    <section class="question">{question}</section>
                    <div class="divider"></div>
                    <section class="answer">{answer}</section>
                </article>
            </main>
            <footer class="response">
                <button class="reveal" onclick="showAnswer()">
                    <span>Show Answer</span>
                    <kbd>space</kbd>
                </button>
                <div class="ratings">{buttons}</div>
            </footer>
        </div>
    </div>
    <script>
        window.cardInfo = {json.dumps(card_info)};
        window.buttonCount = {button_count};
{js}
    </script>
</body>
</html>'''

    def _get_default_css(self) -> str:
        """Default CSS - Jony Ive inspired minimal fallback"""
        return '''
:root {
    --surface: var(--ds-bg-frosted, #161618);
    --surface-elevated: var(--ds-bg-canvas, #1c1c1e);
    --text-primary: var(--ds-text-primary, rgba(255,255,255,0.92));
    --text-tertiary: var(--ds-text-tertiary, rgba(255,255,255,0.35));
    --border: var(--ds-border-subtle, rgba(255,255,255,0.06));
    --accent: var(--ds-accent, #0a84ff);
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; background: var(--surface); color: var(--text-primary); font-family: -apple-system, system-ui, sans-serif; }
#reviewer { min-height: 100vh; display: flex; flex-direction: column; }
.surface { flex: 1; display: flex; flex-direction: column; }
.stats-bar { display: flex; align-items: center; justify-content: space-between; padding: 12px 24px; }
.stats { display: flex; gap: 16px; }
.stat { font-size: 13px; font-weight: 500; color: var(--text-tertiary); }
.stat[data-type="new"] { color: rgba(10,132,255,0.8); }
.stat[data-type="learning"] { color: rgba(255,159,10,0.8); }
.stat[data-type="review"] { color: rgba(48,209,88,0.8); }
.deck { font-size: 13px; color: rgba(255,255,255,0.18); }
.actions { display: flex; gap: 4px; }
.action { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: transparent; border: none; border-radius: 8px; color: var(--text-tertiary); cursor: pointer; }
.action svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.5; }
.action:hover { background: var(--surface-elevated); }
.canvas { flex: 1; display: flex; flex-direction: column; padding: 24px; overflow-y: auto; }
.card { max-width: 720px; width: 100%; margin: 0 auto; padding: 32px 0; }
.question, .answer { font-size: 18px; line-height: 1.7; }
.answer { display: none; }
[data-state="answer"] .answer { display: block; }
.divider { height: 1px; margin: 32px 0; background: var(--border); opacity: 0; }
[data-state="answer"] .divider { opacity: 1; }
.response { padding: 24px; display: flex; justify-content: center; }
.reveal { display: flex; align-items: center; gap: 12px; padding: 12px 32px; background: var(--surface-elevated); border: 1px solid var(--border); border-radius: 12px; color: var(--text-primary); font-size: 15px; font-weight: 500; cursor: pointer; }
.reveal kbd { font-size: 11px; color: rgba(255,255,255,0.18); background: var(--surface); padding: 2px 8px; border-radius: 4px; }
[data-state="answer"] .reveal { display: none; }
.ratings { display: none; gap: 12px; justify-content: center; }
[data-state="answer"] .ratings { display: flex; }
.rating-btn { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 72px; padding: 12px 16px; background: var(--surface-elevated); border: 1px solid var(--border); border-radius: 12px; color: var(--text-primary); font-size: 14px; cursor: pointer; }
.rating-label { font-weight: 600; }
.rating-shortcut { font-size: 10px; color: rgba(255,255,255,0.18); }
'''

    def _get_default_js(self) -> str:
        """Default JavaScript - minimal fallback"""
        return '''
let state = 'question';
function showAnswer() {
    if (state === 'answer') return;
    state = 'answer';
    document.getElementById('reviewer').dataset.state = 'answer';
    pycmd('ans');
}
function rateCard(ease) {
    if (state !== 'answer') return;
    pycmd('ease' + ease);
}
function editCard() { pycmd('edit'); }
function toggleMark() {
    const btn = document.getElementById('mark-btn');
    if (btn) btn.classList.toggle('active');
    pycmd('mark');
}
function undoCard() { pycmd('undo'); }
document.addEventListener('keydown', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (state === 'question') showAnswer();
    }
    if (state === 'answer' && e.key >= '1' && e.key <= '4') {
        e.preventDefault();
        rateCard(parseInt(e.key));
    }
    if (e.key === 'e' || e.key === 'E') { e.preventDefault(); editCard(); }
    if (e.key === 'm' || e.key === 'M') { e.preventDefault(); toggleMark(); }
    if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); undoCard(); }
});
'''


# Global instance
custom_reviewer = CustomReviewer()
