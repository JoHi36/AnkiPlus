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
from typing import Optional, Tuple
from aqt import mw, gui_hooks
from aqt.reviewer import Reviewer


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
                        from .. import ui_setup
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
                        print(f"CustomReviewer: ⚠️ Could not send eval result to chat: {e}")
            except Exception as e:
                print(f"CustomReviewer: Error injecting eval result: {e}")

        mw.taskman.run_on_main(inject)

    except Exception as e:
        import traceback
        traceback.print_exc()
        def inject_error():
            try:
                if mw and mw.reviewer and mw.reviewer.web:
                    mw.reviewer.web.eval(f'window.onEvaluationResult({json.dumps({"error": str(e)})});')
            except:
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
        deck_id = card.did
        deck_name = mw.col.decks.name(deck_id)
        # Get card IDs from the same deck (excluding current card)
        card_ids = mw.col.find_cards(f'"deck:{deck_name}"')
        # Shuffle and take a sample
        sampled = [cid for cid in card_ids if cid != card.id]
        _rand.shuffle(sampled)
        sampled = sampled[:max_answers]

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
        return answers[:max_answers]
    except Exception as e:
        print(f"CustomReviewer: Error getting deck context: {e}")
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
        from ..mc_cache import get_cached_mc, save_mc_cache
        cached = get_cached_mc(card_id, question, correct_answer) if card_id else None
        if cached:
            print(f"CustomReviewer: MC cache hit for card {card_id}")
            _inject_ai_step('done', 'Aus Cache geladen')
            def inject_cached():
                try:
                    if mw and mw.reviewer and mw.reviewer.web:
                        mw.reviewer.web.eval(f'window.onMCOptions({json.dumps(cached)});')
                except Exception as e:
                    print(f"CustomReviewer: Error injecting cached MC: {e}")
            mw.taskman.run_on_main(inject_cached)
            return

        # Step 2: Show deck context step
        if deck_answers:
            _inject_ai_step('context', f'{len(deck_answers)} Karten als Kontext geladen')
        else:
            _inject_ai_step('context', 'Kein Deck-Kontext verfügbar')

        # Step 3: Generate via AI
        _inject_ai_step('generating', 'Generiere Multiple-Choice-Optionen…')
        print(f"CustomReviewer: MC gen input — question_len={len(question)}, answer_len={len(correct_answer)}, deck_answers={len(deck_answers) if deck_answers else 0}")
        result = _call_ai_mc_generation(question, correct_answer, deck_answers)

        # Check if result is fallback (detect by checking if any option text matches fallback patterns)
        is_fallback = any(opt.get('text', '') in ('Keine der genannten Optionen', 'Alle genannten Optionen sind richtig', 'Die Frage kann nicht beantwortet werden') for opt in result)
        if is_fallback:
            _inject_ai_step('error', 'KI nicht verfügbar — Fallback verwendet')
            print("CustomReviewer: MC generation used fallback!")
        else:
            _inject_ai_step('synthesis', 'Erklärungen erstellt')

        # Step 5: Cache result (but NOT fallback results)
        if card_id and result and len(result) >= 4 and not is_fallback:
            save_mc_cache(card_id, question, correct_answer, result)
            print(f"CustomReviewer: MC cached for card {card_id}")

        # Shuffle before sending to frontend
        import random as _rand
        _rand.shuffle(result)

        def inject():
            try:
                if mw and mw.reviewer and mw.reviewer.web:
                    js = f'window.onMCOptions({json.dumps(result)});'
                    mw.reviewer.web.eval(js)
            except Exception as e:
                print(f"CustomReviewer: Error injecting MC options: {e}")

        mw.taskman.run_on_main(inject)

    except Exception as e:
        import traceback
        traceback.print_exc()
        def inject_error():
            try:
                if mw and mw.reviewer and mw.reviewer.web:
                    mw.reviewer.web.eval('window.onMCOptions([]);')
            except:
                pass
        mw.taskman.run_on_main(inject_error)


def _ai_get_response_sync(prompt):
    """Get a synchronous AI response, works in both API-key and backend mode.
    Backend mode only supports streaming, so we collect chunks via a blocking callback."""
    from ..ai_handler import get_ai_handler
    ai = get_ai_handler()

    print(f"CustomReviewer: _ai_get_response_sync called, is_configured={ai.is_configured()}")

    collected = []
    errors = []

    def _collector(chunk, is_done, is_function_call=False, **kwargs):
        print(f"CustomReviewer: _collector chunk={repr(chunk[:80]) if chunk else None}, is_done={is_done}")
        if chunk:
            collected.append(chunk)
        if is_done and not collected:
            errors.append("No chunks received before done signal")

    try:
        result = ai.get_response(prompt, callback=_collector)
        print(f"CustomReviewer: get_response returned, collected {len(collected)} chunks, result_len={len(result) if result else 0}")
    except Exception as e:
        import traceback
        print(f"CustomReviewer: AI response error: {e}")
        traceback.print_exc()

    if errors:
        print(f"CustomReviewer: Callback errors: {errors}")

    full = ''.join(collected) if collected else None
    if full:
        print(f"CustomReviewer: AI response ({len(full)} chars): {full[:200]}...")
        # Detect error messages returned as text (not real AI responses)
        error_patterns = ['Bitte verbinden', 'Bitte konfigurieren', 'Fehler bei', 'Quota überschritten', 'nicht konfiguriert']
        for pattern in error_patterns:
            if pattern in full:
                print(f"CustomReviewer: AI response looks like an error message: {full[:100]}")
                _inject_ai_step('error', full[:80])
                return None
    else:
        print("CustomReviewer: AI response is None/empty — will use fallback")
    return full


def _call_ai_evaluation(question, user_answer, correct_answer):
    """Call AI to evaluate the user's answer. Returns {score, feedback, missing}."""
    try:
        prompt = f"""Du bist ein Lernassistent. Bewerte die Antwort des Studenten auf die Karteikarten-Frage.

FRAGE:
{question}

KORREKTE ANTWORT (aus der Karteikarte):
{correct_answer}

ANTWORT DES STUDENTEN:
{user_answer}

Bewerte die Antwort des Studenten im Vergleich zur korrekten Antwort.
Antworte NUR mit einem JSON-Objekt (kein Markdown, kein Code-Block):
{{"score": <0-100>, "feedback": "<1-2 Sätze Feedback auf Deutsch>", "missing": "<was fehlt oder falsch ist, nur bei score < 70, sonst leerer String>"}}

Bewertungskriterien:
- 90-100: Exzellent, alle wesentlichen Punkte korrekt
- 70-89: Gut, die wichtigsten Punkte stimmen
- 40-69: Teilweise richtig, wichtige Aspekte fehlen — erkläre konkret was fehlt
- 0-39: Größtenteils falsch oder unvollständig — erkläre was die richtige Antwort wäre

Sei spezifisch im Feedback: nenne konkret was richtig/falsch ist, nicht nur allgemeine Phrasen."""

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
        print(f"CustomReviewer: JSON parse error in evaluation: {e}")
        return {"score": 50, "feedback": "Bewertung konnte nicht vollständig durchgeführt werden."}
    except Exception as e:
        print(f"CustomReviewer: AI evaluation error: {e}")

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
            deck_context = "\n\nANTWORTEN AUS DEM GLEICHEN DECK (als Inspiration für plausible Distraktoren):\n"
            for i, ans in enumerate(deck_answers, 1):
                deck_context += f"- {ans}\n"

        prompt = f"""Du bist ein Lernassistent. Erstelle 4 Multiple-Choice-Optionen für diese Karteikarten-Frage.

FRAGE:
{question}

KORREKTE ANTWORT:
{correct_answer}{deck_context}

Erstelle genau 4 Antwortoptionen (1 korrekt, 3 plausible aber falsche).
Jede Option braucht eine kurze Erklärung (1 Satz), warum sie richtig oder falsch ist.
Die falschen Optionen sollen plausibel und lehrreich sein.
Antworte NUR mit einem JSON-Array (kein Markdown, kein Code-Block):
[
  {{"text": "Antworttext", "correct": true, "explanation": "Richtig, weil..."}},
  {{"text": "Antworttext", "correct": false, "explanation": "Falsch, weil..."}},
  {{"text": "Antworttext", "correct": false, "explanation": "Falsch, weil..."}},
  {{"text": "Antworttext", "correct": false, "explanation": "Falsch, weil..."}}
]

Mische die Position der korrekten Antwort zufällig."""

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
                print(f"CustomReviewer: AI MC generation SUCCESS — {len(options)} options")
                return options[:4]
            else:
                print(f"CustomReviewer: AI returned invalid options list (len={len(options) if isinstance(options, list) else 'not-list'})")
        else:
            print("CustomReviewer: AI returned no response for MC generation")

    except json.JSONDecodeError as e:
        print(f"CustomReviewer: JSON parse error in MC generation: {e}")
    except Exception as e:
        print(f"CustomReviewer: AI MC generation error: {e}")

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
                # Multiple refocus attempts — Qt can steal focus at different times
                QTimer.singleShot(30, _refocus)
                QTimer.singleShot(100, _refocus)
                QTimer.singleShot(250, _refocus)

                print("CustomReviewer: ✅ ans intercepted (internal state updated, no DOM change)")
        except Exception as e:
            print(f"CustomReviewer: ans intercept error: {e}")
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
            print(f"CustomReviewer: ease{ease_num} received")
            if mw and mw.reviewer:
                rev = mw.reviewer
                rev.state = "answer"
                card = rev.card
                if not card:
                    print("CustomReviewer: ❌ No card on reviewer!")
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

                print(f"CustomReviewer: ✅ Card answered ease={ease_num}")

                # Send review result to chat panel for SectionDivider performance data
                try:
                    from .. import ui_setup
                    chat_widget = getattr(ui_setup, '_chatbot_widget', None)
                    if chat_widget and hasattr(chat_widget, 'web_view'):
                        ease_labels = {1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy'}
                        # Calculate time spent on card (approximate from card stats)
                        time_taken = card.time_taken() // 1000 if hasattr(card, 'time_taken') else 0
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
                        print(f"CustomReviewer: 📊 Review result sent to chat: ease={ease_num}")
                except Exception as e:
                    print(f"CustomReviewer: ⚠️ Could not send review result to chat: {e}")

                # After _answerCard, rev.card is now the NEXT card
                # (set internally by nextCard() → sched.getCard()).
                # Force a full page reload so our webview_will_set_content
                # hook renders the new card with our custom template.
                if rev.card:
                    print(f"CustomReviewer: 🔄 Loading next card {rev.card.id}...")
                    if hasattr(rev, '_initWeb'):
                        rev._initWeb()
                    else:
                        # Fallback: trigger stdHtml directly — our hook replaces body anyway
                        rev.web.stdHtml("", context=rev)
                else:
                    print("CustomReviewer: 📋 No more cards — going to overview")
                    mw.moveToState("overview")
            else:
                print("CustomReviewer: ❌ No mw or reviewer available")
        except Exception as e:
            import traceback
            print(f"CustomReviewer: ❌ ease rating error: {e}")
            traceback.print_exc()
        return (True, None)

    elif message == "settings":
        # Open settings/profile
        try:
            from .. import ui_setup
            if hasattr(ui_setup, 'show_settings'):
                ui_setup.show_settings()
            elif hasattr(mw, 'onPrefs'):
                mw.onPrefs()
        except Exception:
            if mw and hasattr(mw, 'onPrefs'):
                mw.onPrefs()
        return (True, None)

    elif message == "deck:home":
        if mw:
            mw.moveToState("deckBrowser")
        return (True, None)

    elif message == "deck:stats":
        if mw:
            mw.onStats()
        return (True, None)

    elif message == "chat:open":
        try:
            from .. import ui_setup
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
                        print("CustomReviewer: ✅ Chat textarea focused")
                except Exception as e:
                    print(f"CustomReviewer: focus chat error: {e}")
            # Multiple attempts with increasing delays
            QTimer.singleShot(200, _focus_chat_textarea)
            QTimer.singleShot(500, _focus_chat_textarea)
            QTimer.singleShot(1000, _focus_chat_textarea)
        except Exception as e:
            print(f"CustomReviewer: Error opening chat: {e}")
        return (True, None)

    elif message == "chat:close":
        try:
            from .. import ui_setup
            is_open = hasattr(ui_setup, '_chatbot_dock') and ui_setup._chatbot_dock and ui_setup._chatbot_dock.isVisible()
            if is_open:
                if hasattr(ui_setup, 'toggle_chatbot'):
                    ui_setup.toggle_chatbot()
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
            print(f"CustomReviewer: Error closing chat: {e}")
        return (True, None)

    elif message.startswith("chat:context:"):
        # Store context for chat panel (when user opens "Weitere Fragen")
        try:
            data = json.loads(message[13:])
            # Store in a global that the chat widget can access
            import builtins
            builtins._anki_card_context = data
            print(f"CustomReviewer: Card context stored for chat")
        except Exception as e:
            print(f"CustomReviewer: Error storing chat context: {e}")
        return (True, None)

    elif message.startswith("evaluate:"):
        # AI evaluation of free-text answer
        try:
            data = json.loads(message[9:])
            thread = threading.Thread(target=_evaluate_answer_async, args=(data,), daemon=True)
            thread.start()
            print(f"CustomReviewer: Evaluation started in background")
        except Exception as e:
            print(f"CustomReviewer: Error starting evaluation: {e}")
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
            print(f"CustomReviewer: MC generation started in background (deck_answers={len(deck_answers)})")
        except Exception as e:
            print(f"CustomReviewer: Error starting MC generation: {e}")
            if mw and mw.reviewer and mw.reviewer.web:
                mw.reviewer.web.eval('window.onMCOptions([]);')
        return (True, None)

    return handled


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
            print("CustomReviewer: Hook registered")

        # Register pycmd handler for custom buttons
        if not self._pycmd_hook_registered:
            gui_hooks.webview_did_receive_js_message.append(handle_custom_pycmd)
            self._pycmd_hook_registered = True
            print("CustomReviewer: pycmd hook registered for deck:home and deck:stats")

        self.active = True
        print("CustomReviewer: Enabled - using custom reviewer UI")

    def disable(self):
        """Disable custom reviewer (hook stays registered but inactive)"""
        self.active = False
        print("CustomReviewer: Disabled - using native Anki reviewer")

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
            print("CustomReviewer: Hook called but inactive")
            return

        # Only modify if context is the Reviewer
        if not isinstance(context, Reviewer):
            print(f"CustomReviewer: Hook called but context is {type(context).__name__}, not Reviewer")
            return

        # Get current card from the reviewer
        card = context.card
        if not card:
            print("CustomReviewer: No card available")
            return

        try:
            # Hide native bottom bar IMMEDIATELY (before rendering)
            self._hide_reviewer_bottom()

            # Build custom HTML and replace the body
            custom_html = self._build_reviewer_html(card, context)
            web_content.body = custom_html
            print(f"CustomReviewer: ✅ Injected custom HTML for card {card.id}")
        except Exception as e:
            import traceback
            print(f"CustomReviewer: ❌ Error in hook: {e}")
            traceback.print_exc()
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
        print("CustomReviewer: Cache cleared")

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
                except:
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
            print(f"CustomReviewer: Error getting button labels: {e}")
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
            print(f"CustomReviewer: Error getting progress: {e}")
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
            print(f"CustomReviewer: Error getting card info: {e}")
            return {}

    def _build_reviewer_html(self, card, reviewer) -> str:
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

        # Load CSS and JS
        css = self._load_css()
        js = self._load_js()

        # Detect if Anki is in dark mode
        is_dark_mode = False
        try:
            if mw and mw.pm:
                is_dark_mode = mw.pm.night_mode()  # Returns True if dark mode active
        except Exception as e:
            print(f"CustomReviewer: Could not detect dark mode: {e}")
            is_dark_mode = False  # Default to light mode if detection fails

        # Try to load template, otherwise use inline HTML
        template = self._load_template()

        if template:
            # Replace placeholders in template
            html = template
            html = html.replace('{{CSS}}', css)
            html = html.replace('{{IS_DARK_MODE}}', 'nightMode' if is_dark_mode else '')  # NEW
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
                from .. import auth
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
                    'border-radius:5px;background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.2);">Free</span>')
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

        # CRITICAL FIX: Inject override CSS at the END of body tag
        # This ensures it comes AFTER deck CSS (which is embedded in question_html/answer_html)
        # and successfully overrides the white background from AMBOSS deck
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
        # Insert before closing body tag to ensure it's last in cascade
        html = html.replace('</body>', override_css + '</body>')

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
        return f'''<!DOCTYPE html>
<html lang="en">
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
    --surface: #161618;
    --surface-elevated: #1c1c1e;
    --text-primary: rgba(255,255,255,0.92);
    --text-tertiary: rgba(255,255,255,0.35);
    --border: rgba(255,255,255,0.06);
    --accent: #0a84ff;
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
