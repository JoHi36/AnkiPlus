"""Google Gemini API integration: request handling, streaming, retry logic."""

import requests
import json
import time
import re

try:
    from ..config import (get_config, RESPONSE_STYLES, is_backend_mode, get_backend_url,
                          get_auth_token, get_refresh_token, update_config)
except ImportError:
    from config import (get_config, RESPONSE_STYLES, is_backend_mode, get_backend_url,
                        get_auth_token, get_refresh_token, update_config)

try:
    from .auth import get_auth_headers, refresh_auth_token
except ImportError:
    from auth import get_auth_headers, refresh_auth_token

try:
    from .system_prompt import get_system_prompt
except ImportError:
    from system_prompt import get_system_prompt

try:
    from .tools import registry as tool_registry
    from .agent_loop import run_agent_loop
except ImportError:
    from tools import registry as tool_registry
    from agent_loop import run_agent_loop

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# User-friendly error messages
# ---------------------------------------------------------------------------
ERROR_MESSAGES = {
    'QUOTA_EXCEEDED': 'Tageslimit erreicht. Upgrade für mehr Requests?',
    'TOKEN_EXPIRED': 'Sitzung abgelaufen. Bitte erneut verbinden.',
    'TOKEN_INVALID': 'Authentifizierung fehlgeschlagen. Bitte erneut verbinden.',
    'NETWORK_ERROR': 'Verbindungsfehler. Bitte erneut versuchen.',
    'RATE_LIMIT_EXCEEDED': 'Zu viele Anfragen. Bitte versuchen Sie es später erneut.',
    'BACKEND_ERROR': 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.',
    'GEMINI_API_ERROR': 'Der Service ist vorübergehend nicht verfügbar. Bitte versuchen Sie es später erneut.',
    'VALIDATION_ERROR': 'Ungültige Anfrage. Bitte überprüfen Sie Ihre Eingabe.',
    'TIMEOUT_ERROR': 'Anfrage dauerte zu lange. Bitte versuchen Sie es erneut.',
}


def get_user_friendly_error(error_code, default_message=None):
    """Get user-friendly error message for error code"""
    return ERROR_MESSAGES.get(error_code, default_message or 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.')


def retry_with_backoff(func, max_retries=3, initial_delay=1.0, max_delay=8.0, multiplier=2.0, retryable_status_codes=None):
    """
    Retry function with exponential backoff
    @param func: Function to retry (should return response object)
    @param max_retries: Maximum number of retries
    @param initial_delay: Initial delay in seconds
    @param max_delay: Maximum delay in seconds
    @param multiplier: Backoff multiplier
    @param retryable_status_codes: List of status codes that should be retried (default: [429, 500, 502, 503])
    @returns Response object
    """
    if retryable_status_codes is None:
        retryable_status_codes = [429, 500, 502, 503]

    last_error = None
    delay = initial_delay

    for attempt in range(max_retries + 1):
        try:
            response = func()

            # Check if status code is retryable
            if response.status_code in retryable_status_codes:
                if attempt < max_retries:
                    logger.warning("⚠️ Retry %s/%s nach %.1fs für Status %s", attempt + 1, max_retries, delay, response.status_code)
                    time.sleep(delay)
                    delay = min(delay * multiplier, max_delay)
                    continue
                else:
                    # Last attempt failed
                    response.raise_for_status()

            # Success or non-retryable error
            return response

        except requests.exceptions.RequestException as e:
            last_error = e

            # Check if it's a retryable error
            if hasattr(e, 'response') and e.response:
                status_code = e.response.status_code
                if status_code not in retryable_status_codes:
                    # Non-retryable error, raise immediately
                    raise

            # Network errors are retryable
            if attempt < max_retries:
                logger.warning("⚠️ Retry %s/%s nach %.1fs für Netzwerkfehler: %s", attempt + 1, max_retries, delay, str(e)[:100])
                time.sleep(delay)
                delay = min(delay * multiplier, max_delay)
            else:
                # All retries failed
                raise

    # Should not reach here, but just in case
    if last_error:
        raise last_error
    raise Exception("Retry failed without error")


# ---------------------------------------------------------------------------
# Helper: refresh config + auth token (replaces self._refresh_auth_token)
# ---------------------------------------------------------------------------
def _do_refresh_auth_token():
    """Refresh the auth token and reload config on success."""
    result = refresh_auth_token()
    if result:
        get_config(force_reload=True)
    return result


# ---------------------------------------------------------------------------
# get_google_response  (was AIHandler._get_google_response)
# ---------------------------------------------------------------------------
def get_google_response(user_message, model, api_key, context=None, history=None,
                        mode='compact', rag_context=None, system_prompt_override=None,
                        config=None):
    """Google Gemini API-Integration mit optionalem Kontext und Chat-Historie"""
    # CRITICAL: Hardcode to gemini-3-flash-preview for maximum reasoning capability
    # Fallback handled in get_response_with_rag
    if not model:
        model = "gemini-3-flash-preview"

    # Gemini 3 Flash Modell (nur noch Flash wird verwendet)
    # Für Chat verwenden wir Gemini 3 Flash direkt
    model_normalized = model

    # Bestimme thinking_level basierend auf Modell
    # Flash: minimal (schnellste Antworten)
    thinking_level = None
    if "gemini-3" in model.lower() and "flash" in model.lower():
        thinking_level = "minimal"  # Minimale Latenz für Flash

    logger.debug("get_google_response: Model: %s, thinking_level: %s", model_normalized, thinking_level)

    if config is None:
        config = get_config() or {}

    # Prüfe ob Backend-Modus aktiv ist
    use_backend = is_backend_mode() and get_auth_token()

    if use_backend:
        # Backend-Modus: Verwende Backend-URL
        backend_url = get_backend_url()
        # Backend-URL ist die Cloud Function Base-URL, Express-Routen haben kein /api/ Präfix
        urls = [f"{backend_url}/chat"]
        logger.debug("get_google_response: Verwende Backend-Modus: %s", urls[0])
    else:
        # Fallback: Direkte Gemini API (API-Key-Modus)
        urls = [
            f"https://generativelanguage.googleapis.com/v1beta/models/{model_normalized}:generateContent?key={api_key}",
            f"https://generativelanguage.googleapis.com/v1/models/{model_normalized}:generateContent?key={api_key}",
        ]
        logger.debug("get_google_response: Verwende API-Key-Modus (Fallback)")

    # Lade Tool-Einstellungen aus Config
    ai_tools = config.get("ai_tools", {
        "images": True,
        "diagrams": True,
        "molecules": False
    })

    # System Prompt hinzufügen (mit Modus und Tools, oder Override falls angegeben)
    if system_prompt_override is not None:
        system_instruction = system_prompt_override
    else:
        system_instruction = get_system_prompt(mode=mode, tools=ai_tools)

    # Erweitere System Prompt mit RAG-Anweisungen falls RAG-Kontext vorhanden
    if rag_context and rag_context.get("cards"):
        rag_instruction = """\n\nSOURCE SYSTEM (CRITICAL — MUST BE FOLLOWED):
You receive source cards from the user's learning material. These cards are your PRIMARY knowledge source.

RESPONSE STRATEGY:
1. Answer the question CONCRETELY and DIRECTLY — give the user exactly the information they need
2. Use facts from the source cards as your foundation — the user is studying these cards, so use their terminology and facts
3. Supplement with your own knowledge ONLY where cards are insufficient to fully answer the question
4. The current card (the one the user is studying) is the MOST IMPORTANT source — refer to it

CITATION RULES (MANDATORY):
- Place [[NoteID]] DIRECTLY after every fact that comes from a card (e.g. [[1735567472099]])
- EVERY statement based on a card MUST have a citation — a statement without citation is worthless
- Find the Note IDs in the context as "Note XXXXX" — use exactly these numbers
- Even if you only have ONE card as a source, cite it
- The numbers appear to the user as clickable [1], [2], [3] badges"""
        system_instruction = system_instruction + rag_instruction

    # Erstelle Tools Array für Function Calling (nur wenn aktiviert)
    declarations = tool_registry.get_function_declarations(agent='tutor', ai_tools_config=ai_tools, mode=mode)
    tools_array = [{"functionDeclarations": declarations}] if declarations else []

    # Erweitere Nachricht mit Kontext, falls vorhanden
    enhanced_message = user_message

    # IMMER Kontext senden, wenn verfügbar (wichtig für konsistente Antworten)
    # Bei längerer Historie senden wir einen kompakteren Kontext
    has_long_history = history and len(history) > 2

    if context:
        try:
            from ..utils.text import clean_html
        except ImportError:
            from utils.text import clean_html

        # Erstelle Kontext-String mit BEGRENZTER Länge
        # Bei langer Historie, verwende kürzeren Kontext
        context_parts = []
        is_question = context.get('isQuestion', True)

        # Kartenfrage: Verwende frontField (bereinigt) oder question (bereinigt)
        question_text = context.get('frontField') or context.get('question', '')
        max_question_len = 500 if has_long_history else 1000
        if question_text:
            clean_question = clean_html(question_text, max_question_len)
            if clean_question:
                context_parts.append(f"Kartenfrage: {clean_question}")

        # Wenn Antwort bereits angezeigt wurde, füge sie hinzu (begrenzt)
        max_answer_len = 400 if has_long_history else 800
        if not is_question and context.get('answer'):
            clean_answer = clean_html(context['answer'], max_answer_len)
            if clean_answer:
                context_parts.append(f"Kartenantwort: {clean_answer}")

        # Kartenfelder: NICHT hinzufügen (zu groß und redundant)

        # Füge Statistiken hinzu (nur bei erstem Request ohne lange Historie)
        if context.get('stats') and not has_long_history:
            stats = context['stats']
            knowledge_score = stats.get('knowledgeScore', 0)
            reps = stats.get('reps', 0)
            lapses = stats.get('lapses', 0)
            ivl = stats.get('interval', 0)

            stats_text = f"\nKartenstatistiken: Kenntnisscore {knowledge_score}% (0=neu, 100=sehr gut bekannt), {reps} Wiederholungen, {lapses} Fehler, Intervall {ivl} Tage. "
            stats_text += "Passe die Schwierigkeit deiner Erklärung und Fragen entsprechend an: "
            if knowledge_score >= 70:
                stats_text += "Karte ist gut bekannt - verwende fortgeschrittene Konzepte und vertiefende Fragen."
            elif knowledge_score >= 40:
                stats_text += "Karte ist mäßig bekannt - verwende mittlere Schwierigkeit mit klaren Erklärungen."
            else:
                stats_text += "Karte ist neu oder wenig bekannt - verwende einfache Sprache und grundlegende Erklärungen."

            context_parts.append(stats_text)

        if context_parts:
            context_text = "\n".join(context_parts)

            # Workflow-Anweisungen je nach Phase
            workflow_instruction = ""
            if is_question:
                # Frage noch nicht aufgedeckt
                workflow_instruction = "\n\nWICHTIG: Die Kartenantwort ist noch NICHT aufgedeckt. "
                workflow_instruction += "Wenn der Benutzer eine Antwort gibt, prüfe sie gegen die korrekte Antwort (die du kennst, aber noch nicht verraten hast). "
                workflow_instruction += "Wenn nach einem Hinweis gefragt wird, gib einen hilfreichen Hinweis OHNE die Antwort zu verraten. "
                workflow_instruction += "Wenn nach Multiple Choice gefragt wird, erstelle 4 Optionen (nur eine richtig) und formatiere sie klar als A), B), C), D)."
            else:
                # Antwort bereits angezeigt
                workflow_instruction = "\n\nWICHTIG: Die Kartenantwort ist bereits aufgedeckt. "
                workflow_instruction += "Beantworte Fragen zur Karte, erkläre Konzepte, stelle vertiefende Fragen oder biete weitere Lernhilfen an."

            enhanced_message = f"Kontext der aktuellen Anki-Karte:\n{context_text}{workflow_instruction}\n\nBenutzerfrage: {user_message}"
        else:
            # Kein Karten-Kontext, aber möglicherweise RAG-Kontext
            enhanced_message = user_message

        # Füge RAG-Kontext hinzu falls vorhanden
        if rag_context and rag_context.get("cards"):
            cards_text = "\n".join(rag_context["cards"])
            enhanced_message = f"{enhanced_message}\n\n--- QUELLEN-KARTEN (aus dem Lernmaterial des Nutzers) ---\n{cards_text}\n--- ENDE QUELLEN ---\n\nDu MUSST diese Karten als Hauptquelle nutzen. Zitiere JEDEN Fakt mit [[NoteID]] (die Zahl nach 'Note'). Antworte konkret auf die Frage, baue die Fakten aus den Karten ein."

    # WICHTIG: Erstelle Contents-Array mit Chat-Historie für besseren Kontext
    contents = []

    # Füge Chat-Historie hinzu (letzte Nachrichten, ohne die aktuelle)
    if history and len(history) > 1:
        # WICHTIG: Begrenze Historie auf letzte 4 Nachrichten (nicht alle)
        # und bereinige Content (entferne sehr lange Texte)
        history_to_use = history[:-1][-4:]  # Letzte 4, ohne aktuelle

        for hist_msg in history_to_use:
            role = hist_msg.get('role', 'user')
            content = hist_msg.get('content', '')

            if content:
                # Bereinige Content: Entferne sehr lange Texte
                # Begrenze auf max 1500 Zeichen pro Nachricht
                if len(content) > 1500:
                    content = content[:1497] + "..."

                contents.append({
                    "role": role,
                    "parts": [{"text": content}]
                })
        logger.debug("get_google_response: %s Nachrichten aus Historie hinzugefügt", len(contents))

    # Füge aktuelle Nachricht hinzu (mit Kontext falls vorhanden)
    contents.append({
        "role": "user",
        "parts": [{"text": enhanced_message}]
    })

    # Erstelle Request-Daten für Gemini 3 Preview Modelle
    # Preview-Modelle verwenden systemInstruction im neuen Format
    # CRITICAL: Set max_output_tokens to 8192 to prevent cut-off answers
    max_tokens = 8192 if "gemini-3-flash-preview" in model.lower() else 4096
    data = {
        "contents": contents,
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": max_tokens
        }
    }

    # HINWEIS: thinkingConfig wird vorerst nicht verwendet
    # Gemini 3 Preview verwendet standardmäßig dynamisches Denken
    # Der Parameter kann später aktiviert werden, wenn die API stabil ist
    if thinking_level:
        logger.debug("get_google_response: thinking_level=%s (nicht gesendet, API-Stabilität)", thinking_level)

    # Füge systemInstruction hinzu (nur wenn vorhanden)
    # Für Preview-Modelle: systemInstruction als Objekt mit parts
    if system_instruction and system_instruction.strip():
        data["systemInstruction"] = {
            "parts": [{
                "text": system_instruction
            }]
        }

    # Füge Tools hinzu (nur wenn vorhanden - hardcoded Aktivierung)
    if tools_array:
        data["tools"] = tools_array

    # Validiere Request-Größe (Google API Limit: ~30k Tokens ≈ 20k Zeichen)
    total_chars = sum(len(msg.get('parts', [{}])[0].get('text', '')) for msg in contents)
    total_chars += len(system_instruction)

    # Wenn Request zu groß, reduziere Historie weiter
    if total_chars > 18000:
        logger.warning("⚠️ Request zu groß (%s Zeichen), reduziere Historie", total_chars)
        # Behalte nur letzte 2 Nachrichten aus Historie
        if len(contents) > 3:  # system + 2 history + current
            contents = contents[-3:]  # Letzte 2 History + Current
            data["contents"] = contents

    # Prüfe ob Backend-Modus aktiv ist
    use_backend = is_backend_mode() and get_auth_token()

    last_error = None
    retry_count = 0
    max_retries = 1  # Max 1 Retry bei Token-Refresh

    for url in urls:
        try:
            logger.debug("get_google_response: Versuche URL: %s...", url.split('?')[0])
            if use_backend:
                logger.debug("get_google_response: Backend-Modus aktiv")
                headers = get_auth_headers()
                # Backend erwartet anderes Format: {message, history, context, mode, model}
                backend_data = {
                    "message": enhanced_message,
                    "history": history if history else None,
                    "context": context,
                    "mode": mode,
                    "model": model_normalized
                }
                request_data = backend_data
            else:
                logger.debug("get_google_response: Modell: %s, API-Key Länge: %s", model_normalized, len(api_key))
                headers = {"Content-Type": "application/json"}
                request_data = data

            logger.debug("get_google_response: Request-Größe: %s Zeichen", len(str(request_data)))

            # Retry-Logic mit Exponential Backoff für retryable Errors
            def make_request():
                return requests.post(url, json=request_data, headers=headers, timeout=30)

            # Bei 401: Versuche Token-Refresh oder wechsle zu anonymem Modus
            if use_backend:
                response = make_request()
                if response.status_code == 401:
                    if retry_count < max_retries:
                        logger.debug("get_google_response: 401 Unauthorized - Versuche Token-Refresh")
                        if _do_refresh_auth_token():
                            retry_count += 1
                            headers = get_auth_headers()
                            response = make_request()
                            logger.debug("get_google_response: Retry nach Token-Refresh - Status: %s", response.status_code)
                        else:
                            # Kein Refresh-Token vorhanden - wechsle zu anonymem Modus
                            logger.debug("get_google_response: Kein Refresh-Token - wechsle zu anonymem Modus")
                            update_config(auth_token="")  # Token löschen
                            get_config(force_reload=True)
                            headers = get_auth_headers()  # Jetzt mit Device-ID
                            retry_count += 1
                            response = make_request()
                            logger.debug("get_google_response: Retry als anonymer User - Status: %s", response.status_code)
                    else:
                        # Max Retries erreicht - versuche als anonymer User
                        logger.debug("get_google_response: Max Retries erreicht - versuche als anonymer User")
                        update_config(auth_token="")  # Token löschen
                        get_config(force_reload=True)
                        headers = get_auth_headers()  # Jetzt mit Device-ID
                        response = make_request()
                        logger.debug("get_google_response: Request als anonymer User - Status: %s", response.status_code)
                else:
                    response = make_request()

            # Bei 403 (Forbidden): Quota-Fehler (kein Retry)
            if response.status_code == 403:
                try:
                    error_data = response.json()
                    error_code = error_data.get("error", {}).get("code", "QUOTA_EXCEEDED")
                    error_msg = error_data.get("error", {}).get("message", "Quota überschritten")
                    user_msg = get_user_friendly_error(error_code, error_msg)
                    # #region agent log
                    try:
                        with open(log_path, 'a', encoding='utf-8') as f:
                            f.write(json.dumps({"location": "ai_handler.py:624", "message": "Raising QUOTA_EXCEEDED exception", "data": {"error_code": error_code, "error_msg": error_msg, "user_msg": user_msg}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "A"}) + "\n")
                    except (OSError, ValueError, TypeError):
                        pass
                    # #endregion
                    raise Exception(user_msg)
                except Exception as e:
                    if "Quota" in str(e) or "quota" in str(e).lower():
                        raise
                    raise Exception(get_user_friendly_error('QUOTA_EXCEEDED'))

            # Bei 400: Client-Fehler (kein Retry)
            if response.status_code == 400:
                try:
                    error_data = response.json()
                    error_code = error_data.get("error", {}).get("code", "VALIDATION_ERROR")
                    error_msg = error_data.get("error", {}).get("message", "Ungültige Anfrage")
                    user_msg = get_user_friendly_error(error_code, error_msg)
                    raise Exception(user_msg)
                except Exception as e:
                    if "Exception" in str(type(e)):
                        raise
                    raise Exception(get_user_friendly_error('VALIDATION_ERROR'))

            # Für retryable Errors (429, 500, 502, 503): Verwende Retry mit Backoff
            if response.status_code in [429, 500, 502, 503]:
                logger.warning("get_google_response: Retryable Error %s - Verwende Retry mit Backoff", response.status_code)
                response = retry_with_backoff(
                    make_request,
                    max_retries=3,
                    initial_delay=1.0,
                    max_delay=8.0,
                    retryable_status_codes=[429, 500, 502, 503]
                )

            # Logge Status-Code
            logger.debug("get_google_response: Response Status: %s", response.status_code)

            # Bei 400-Fehler, logge die vollständige Fehlermeldung
            if response.status_code == 400:
                try:
                    error_data = response.json()
                    error_msg = error_data.get("error", {}).get("message", "Unbekannter 400 Fehler")
                    error_details = error_data.get("error", {})
                    logger.warning("⚠️ 400 Bad Request Fehler:")
                    logger.debug("   Message: %s", error_msg)
                    logger.debug("   Details: %s", error_details)
                    logger.debug("   Vollständige Response: %s", response.text[:1000])
                except (ValueError, KeyError):
                    logger.warning("⚠️ 400 Bad Request - Response Text: %s", response.text[:500])

            # Bei 500-Fehler, logge die Fehlermeldung bevor raise_for_status() aufgerufen wird
            if response.status_code == 500:
                try:
                    error_data = response.json()
                    error_msg = error_data.get("error", {}).get("message", "Unbekannter 500 Fehler")
                    error_code = error_data.get("error", {}).get("code", 500)
                    logger.warning("⚠️ 500 Internal Server Error:")
                    logger.debug("   Message: %s", error_msg)
                    logger.debug("   Code: %s", error_code)
                    logger.debug("   Response Text: %s", response.text[:1000])
                except (ValueError, KeyError):
                    logger.warning("⚠️ 500 Internal Server Error - Response Text: %s", response.text[:500])

            response.raise_for_status()
            result = response.json()

            # Prüfe auf Fehler in der Antwort
            if "error" in result:
                error_msg = result["error"].get("message", "Unbekannter Fehler")
                error_code = result["error"].get("code", "BACKEND_ERROR")
                user_msg = get_user_friendly_error(error_code, error_msg)
                raise Exception(user_msg)

            # Backend-Modus: Antwort-Format ist anders
            if use_backend:
                # Backend sendet direkt Text oder Streaming-Format
                # Für non-streaming: Backend sollte direkt Text zurückgeben
                # Aber aktuell unterstützt Backend nur Streaming
                # Daher: Diese Funktion wird im Backend-Modus nicht verwendet
                # Streaming wird in get_google_response_streaming behandelt
                raise Exception("Backend-Modus unterstützt nur Streaming. Bitte verwenden Sie get_response() mit callback.")

            # Prüfe auf Function Call in der Antwort (nur für API-Key-Modus)
            if "candidates" in result and len(result["candidates"]) > 0:
                candidate = result["candidates"][0]

                # Prüfe ob Function Call vorhanden ist
                if "content" in candidate and "parts" in candidate["content"]:
                    parts = candidate["content"]["parts"]

                    # Tool calls are handled by run_agent_loop() in the
                    # streaming path. Non-streaming path returns text only.

                    # Normale Text-Antwort
                    if len(parts) > 0:
                        text_part = parts[0].get("text", "")
                        if text_part:
                            logger.info("✅ get_google_response: Erfolgreich, Antwort-Länge: %s", len(text_part))
                            return text_part

            raise Exception("Ungültige Antwort von Google API")
        except requests.exceptions.HTTPError as e:
            last_error = e
            status_code = e.response.status_code if hasattr(e, 'response') and e.response else None

            # Bei 400-Fehler, extrahiere detaillierte Fehlermeldung
            if status_code == 400:
                try:
                    if hasattr(e, 'response') and e.response:
                        error_data = e.response.json()
                        error_msg = error_data.get("error", {}).get("message", "Bad Request")
                        error_code = error_data.get("error", {}).get("code", 400)
                        logger.warning("⚠️ HTTP 400 Fehler: %s (Code: %s)", error_msg, error_code)
                        # Versuche nächste URL wenn Modell-Problem
                        if "model" in error_msg.lower() or "not found" in error_msg.lower():
                            logger.debug("   → Versuche nächste URL/Modell...")
                            continue
                        else:
                            raise Exception(f"Google API Fehler 400: {error_msg}")
                except Exception as parse_error:
                    logger.warning("⚠️ Konnte 400-Fehler nicht parsen: %s", parse_error)
                    if hasattr(e, 'response') and e.response:
                        logger.debug("   Response Text: %s", e.response.text[:500])
                    raise Exception(f"Google API Fehler 400: {str(e)}")

            # Bei 500: Versuche Request ohne Historie (Fallback)
            if status_code == 500:
                # Logge Fehlermeldung wenn verfügbar
                try:
                    if hasattr(e, 'response') and e.response:
                        error_data = e.response.json()
                        error_msg = error_data.get("error", {}).get("message", "Internal Server Error")
                        logger.warning("⚠️ 500 Internal Server Error Details: %s", error_msg)
                except (ValueError, KeyError, AttributeError):
                    pass

                # Versuche Retry ohne Historie, wenn Historie vorhanden
                if history and len(history) > 1:
                    logger.warning("⚠️ 500 Fehler - versuche Request ohne Historie als Fallback")
                    # Retry ohne Historie, nur mit aktueller Nachricht
                    contents_retry = [{
                        "role": "user",
                        "parts": [{"text": enhanced_message}]
                    }]
                    data_retry = {
                        "contents": contents_retry,
                        "systemInstruction": {
                            "parts": [{"text": system_instruction}]
                        },
                        "generationConfig": {
                            "temperature": 0.7,
                            "maxOutputTokens": 2000
                        }
                    }

                    # Füge Tools auch zum Retry-Request hinzu
                    if tools_array:
                        data_retry["tools"] = tools_array
                    try:
                        response_retry = requests.post(url, json=data_retry, timeout=30)
                        response_retry.raise_for_status()
                        result_retry = response_retry.json()
                        if "candidates" in result_retry and len(result_retry["candidates"]) > 0:
                            candidate = result_retry["candidates"][0]
                            if "content" in candidate and "parts" in candidate["content"]:
                                if len(candidate["content"]["parts"]) > 0:
                                    logger.info("✅ Retry ohne Historie erfolgreich")
                                    return candidate["content"]["parts"][0].get("text", "")
                    except Exception as retry_error:
                        logger.warning("⚠️ Retry ohne Historie fehlgeschlagen: %s", retry_error)
                        # Versuche nächste URL wenn Retry fehlschlägt
                        continue
                else:
                    # Keine Historie vorhanden, versuche nächste URL
                    logger.warning("⚠️ 500 Fehler ohne Historie - versuche nächste URL")
                    continue

            # Bei 404, versuche nächste URL
            if status_code == 404:
                continue
            # Bei anderen Fehlern, versuche Fehlermeldung zu extrahieren
            try:
                if hasattr(e, 'response') and e.response:
                    error_data = e.response.json()
                    error_msg = error_data.get("error", {}).get("message", str(e))
                    raise Exception(f"Google API Fehler: {error_msg}")
                else:
                    raise Exception(f"Google API Fehler: {str(e)}")
            except (ValueError, KeyError, AttributeError):
                raise Exception(f"Google API Fehler: {str(e)}")
        except Exception as e:
            if "Google API Fehler" in str(e):
                raise
            last_error = e
            continue

    # Wenn alle URLs fehlgeschlagen sind
    if last_error:
        raise Exception(f"Google API Fehler: {str(last_error)}")

    raise Exception("Konnte keine Antwort von Google API erhalten")


# ---------------------------------------------------------------------------
# get_google_response_streaming  (was AIHandler._get_google_response_streaming)
# ---------------------------------------------------------------------------
def get_google_response_streaming(user_message, model, api_key, context=None, history=None,
                                  mode='compact', callback=None, rag_context=None,
                                  suppress_error_callback=False, system_prompt_override=None,
                                  config=None):
    """
    Google Gemini API mit Streaming-Support und Tool Call Handling

    Args:
        callback: Funktion(chunk, done, is_function_call, steps=None, citations=None)
        suppress_error_callback: Wenn True, wird bei Fehlern keine Fehlermeldung an den Callback gesendet (für Retries)
        config: Config dict (thread-safe, passed from AIHandler)
    """
    # CRITICAL: Hardcode to gemini-3-flash-preview for maximum reasoning capability
    # Fallback handled in get_response_with_rag
    if not model:
        model = "gemini-3-flash-preview"

    model_normalized = model

    if config is None:
        config = get_config() or {}

    # Prüfe ob Backend-Modus aktiv ist
    # Prefer direct API key over Cloud Function when both are available
    use_backend = is_backend_mode() and get_auth_token() and not api_key

    if use_backend:
        # Backend-Modus: Verwende Backend-URL
        backend_url = get_backend_url()
        stream_urls = [f"{backend_url}/chat"]
        normal_urls = [f"{backend_url}/chat"]
        logger.debug("get_google_response_streaming: Verwende Backend-Modus: %s", stream_urls[0])
    else:
        # Fallback: Direkte Gemini API (API-Key-Modus)
        stream_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_normalized}:streamGenerateContent?key={api_key}"
        normal_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_normalized}:generateContent?key={api_key}"

        # Fallback URLs
        stream_urls = [
            stream_url,
            f"https://generativelanguage.googleapis.com/v1/models/{model_normalized}:streamGenerateContent?key={api_key}",
        ]
        normal_urls = [
            normal_url,
            f"https://generativelanguage.googleapis.com/v1/models/{model_normalized}:generateContent?key={api_key}",
        ]
        logger.debug("get_google_response_streaming: Verwende API-Key-Modus (Fallback)")

    # Lade Tool-Einstellungen
    ai_tools = config.get("ai_tools", {
        "images": True,
        "diagrams": True,
        "molecules": False
    })

    # System Prompt (Override falls angegeben, z.B. für Companion/Plusi)
    if system_prompt_override is not None:
        system_instruction = system_prompt_override
    else:
        system_instruction = get_system_prompt(mode=mode, tools=ai_tools)

    # Erweitere System Prompt mit RAG-Anweisungen falls RAG-Kontext vorhanden
    if rag_context and rag_context.get("cards"):
        rag_instruction = """\n\nSOURCE SYSTEM (CRITICAL — MUST BE FOLLOWED):
You receive source cards from the user's learning material. These cards are your PRIMARY knowledge source.

RESPONSE STRATEGY:
1. Answer the question CONCRETELY and DIRECTLY — give the user exactly the information they need
2. Use facts from the source cards as your foundation — the user is studying these cards, so use their terminology and facts
3. Supplement with your own knowledge ONLY where cards are insufficient to fully answer the question
4. The current card (the one the user is studying) is the MOST IMPORTANT source — refer to it

CITATION RULES (MANDATORY):
- Place [[NoteID]] DIRECTLY after every fact that comes from a card (e.g. [[1735567472099]])
- EVERY statement based on a card MUST have a citation — a statement without citation is worthless
- Find the Note IDs in the context as "Note XXXXX" — use exactly these numbers
- Even if you only have ONE card as a source, cite it
- The numbers appear to the user as clickable [1], [2], [3] badges"""
        system_instruction = system_instruction + rag_instruction

    # Tools Array — built from central registry
    declarations = tool_registry.get_function_declarations(
        agent='tutor',
        ai_tools_config=ai_tools,
        mode=mode,
    )
    tools_array = []
    if declarations:
        tools_array.append({"functionDeclarations": declarations})
        logger.debug("get_google_response_streaming: %s Tool(s) aktiviert (mode: %s)", len(declarations), mode)

    # Erweitere Nachricht mit Kontext (gleiche Logik wie get_google_response)
    enhanced_message = user_message
    has_long_history = history and len(history) > 2

    if context:
        try:
            from ..utils.text import clean_html
        except ImportError:
            from utils.text import clean_html

        context_parts = []
        is_question = context.get('isQuestion', True)

        question_text = context.get('frontField') or context.get('question', '')
        max_question_len = 500 if has_long_history else 1000
        if question_text:
            clean_question = clean_html(question_text, max_question_len)
            if clean_question:
                context_parts.append(f"Kartenfrage: {clean_question}")

        max_answer_len = 400 if has_long_history else 800
        if not is_question and context.get('answer'):
            clean_answer = clean_html(context['answer'], max_answer_len)
            if clean_answer:
                context_parts.append(f"Kartenantwort: {clean_answer}")

        if context.get('stats') and not has_long_history:
            stats = context['stats']
            knowledge_score = stats.get('knowledgeScore', 0)
            reps = stats.get('reps', 0)
            lapses = stats.get('lapses', 0)
            ivl = stats.get('interval', 0)

            stats_text = f"\nKartenstatistiken: Kenntnisscore {knowledge_score}% (0=neu, 100=sehr gut bekannt), {reps} Wiederholungen, {lapses} Fehler, Intervall {ivl} Tage. "
            stats_text += "Passe die Schwierigkeit deiner Erklärung und Fragen entsprechend an: "
            if knowledge_score >= 70:
                stats_text += "Karte ist gut bekannt - verwende fortgeschrittene Konzepte und vertiefende Fragen."
            elif knowledge_score >= 40:
                stats_text += "Karte ist mäßig bekannt - verwende mittlere Schwierigkeit mit klaren Erklärungen."
            else:
                stats_text += "Karte ist neu oder wenig bekannt - verwende einfache Sprache und grundlegende Erklärungen."

            context_parts.append(stats_text)

        if context_parts:
            context_text = "\n".join(context_parts)

            workflow_instruction = ""
            if is_question:
                workflow_instruction = "\n\nWICHTIG: Die Kartenantwort ist noch NICHT aufgedeckt. "
                workflow_instruction += "Wenn der Benutzer eine Antwort gibt, prüfe sie gegen die korrekte Antwort (die du kennst, aber noch nicht verraten hast). "
                workflow_instruction += "Wenn nach einem Hinweis gefragt wird, gib einen hilfreichen Hinweis OHNE die Antwort zu verraten. "
                workflow_instruction += "Wenn nach Multiple Choice gefragt wird, erstelle 4 Optionen (nur eine richtig) und formatiere sie klar als A), B), C), D)."
            else:
                workflow_instruction = "\n\nWICHTIG: Die Kartenantwort ist bereits aufgedeckt. "
                workflow_instruction += "Beantworte Fragen zur Karte, erkläre Konzepte, stelle vertiefende Fragen oder biete weitere Lernhilfen an."

            enhanced_message = f"Kontext der aktuellen Anki-Karte:\n{context_text}{workflow_instruction}\n\nBenutzerfrage: {user_message}"
        else:
            # Kein Karten-Kontext, aber möglicherweise RAG-Kontext
            enhanced_message = user_message

        # Füge RAG-Kontext hinzu falls vorhanden
        if rag_context and rag_context.get("cards"):
            cards_text = "\n".join(rag_context["cards"])
            enhanced_message = f"{enhanced_message}\n\n--- QUELLEN-KARTEN (aus dem Lernmaterial des Nutzers) ---\n{cards_text}\n--- ENDE QUELLEN ---\n\nDu MUSST diese Karten als Hauptquelle nutzen. Zitiere JEDEN Fakt mit [[NoteID]] (die Zahl nach 'Note'). Antworte konkret auf die Frage, baue die Fakten aus den Karten ein."

    # Erstelle Contents-Array mit Chat-Historie
    contents = []

    if history and len(history) > 1:
        history_to_use = history[:-1][-4:]

        for hist_msg in history_to_use:
            role = hist_msg.get('role', 'user')
            content = hist_msg.get('content', '')

            if content:
                if len(content) > 1500:
                    content = content[:1497] + "..."

                contents.append({
                    "role": role,
                    "parts": [{"text": content}]
                })
        logger.debug("get_google_response_streaming: %s Nachrichten aus Historie hinzugefügt", len(contents))

    contents.append({
        "role": "user",
        "parts": [{"text": enhanced_message}]
    })

    # Request-Daten
    # CRITICAL: Set max_output_tokens to 8192 to prevent cut-off answers
    max_tokens = 8192 if "gemini-3-flash-preview" in model.lower() else 4096
    data = {
        "contents": contents,
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": max_tokens
        }
    }

    if system_instruction and system_instruction.strip():
        data["systemInstruction"] = {
            "parts": [{"text": system_instruction}]
        }

    if tools_array:
        data["tools"] = tools_array

    # Validiere Request-Größe
    total_chars = sum(len(msg.get('parts', [{}])[0].get('text', '')) for msg in contents)
    total_chars += len(system_instruction)

    if total_chars > 18000:
        logger.warning("⚠️ Request zu groß (%s Zeichen), reduziere Historie", total_chars)
        if len(contents) > 3:
            contents = contents[-3:]
            data["contents"] = contents

    # Prüfe ob Tools aktiv sind
    has_tools = bool(tools_array)

    # Erstelle Backend-Daten falls Backend-Modus aktiv
    backend_data = None
    if use_backend:
        backend_data = {
            "message": enhanced_message,
            "history": history if history else None,
            "context": context,
            "mode": mode,
            "model": model_normalized
        }

    try:
        # Run agent loop (handles multi-turn tool calling)
        system_instruction_dict = None
        if system_instruction and system_instruction.strip():
            system_instruction_dict = {"parts": [{"text": system_instruction}]}

        text_result = run_agent_loop(
            stream_fn=stream_response,
            stream_urls=stream_urls,
            data=data,
            callback=callback,
            use_backend=use_backend,
            backend_data=backend_data,
            tools_array=tools_array if tools_array else None,
            system_instruction=system_instruction_dict,
            model=model,
        )
        return text_result

    except Exception as e:
        error_msg = f"Fehler bei Streaming-Request: {str(e)}"
        logger.exception("⚠️ Streaming-Fehler: %s", error_msg)

        # FALLBACK: Versuche non-streaming
        logger.info("🔄 Fallback auf non-streaming...")
        try:
            for url in normal_urls:
                try:
                    logger.info("🔄 Fallback: Versuche URL: %s...", url.split('?')[0])
                    response = requests.post(url, json=data, timeout=30)
                    response.raise_for_status()
                    result = response.json()

                    if "candidates" in result and len(result["candidates"]) > 0:
                        candidate = result["candidates"][0]
                        if "content" in candidate and "parts" in candidate["content"]:
                            parts = candidate["content"]["parts"]
                            if len(parts) > 0:
                                text = parts[0].get("text", "")
                                logger.info("✅ Fallback erfolgreich: %s Zeichen erhalten", len(text))
                                if callback:
                                    # Sende als einzelne Nachricht (simuliere Streaming für UX)
                                    callback(text, True, False)
                                return text
                except Exception as fallback_e:
                    logger.warning("⚠️ Fallback-URL fehlgeschlagen: %s", fallback_e)
                    continue
        except Exception as fallback_error:
            logger.warning("⚠️ Fallback komplett fehlgeschlagen: %s", fallback_error)

        # Wenn Fallback auch fehlschlägt, Fehler nur über Exception-Pfad melden.
        # NICHT zusätzlich über callback senden – das führt zu doppelten
        # Fehlermeldungen, weil die Exception in widget.py nochmal per
        # error_signal an das Frontend gesendet wird.
        raise Exception(error_msg)


# ---------------------------------------------------------------------------
# stream_response  (was AIHandler._stream_response)
# ---------------------------------------------------------------------------
def stream_response(urls, data, callback=None, use_backend=False, backend_data=None):
    """
    Streamt eine Antwort von der Gemini API oder Backend

    Args:
        urls: Liste von Streaming-URLs (mit Fallback)
        data: Request-Daten (Gemini-Format)
        callback: Optional - Funktion(chunk, done, is_function_call=False)
        use_backend: Ob Backend-Modus aktiv ist
        backend_data: Request-Daten im Backend-Format (falls use_backend=True)

    Returns:
        Tuple (full_text, function_call_data)
    """
    full_text = ""
    last_error = None
    retry_count = 0
    max_retries = 1

    for url in urls:
        try:
            logger.debug("stream_response: Versuche URL: %s...", url.split('?')[0])

            # Bestimme Request-Daten und Headers
            if use_backend:
                headers = get_auth_headers()
                request_data = backend_data if backend_data else data
            else:
                headers = {"Content-Type": "application/json"}
                request_data = data

            response = requests.post(url, json=request_data, headers=headers, stream=True, timeout=60)

            # Bei 401: Versuche Token-Refresh oder wechsle zu anonymem Modus
            if response.status_code == 401 and use_backend:
                if retry_count < max_retries:
                    logger.debug("stream_response: 401 Unauthorized - Versuche Token-Refresh")
                    if _do_refresh_auth_token():
                        retry_count += 1
                        headers = get_auth_headers()
                        response = requests.post(url, json=request_data, headers=headers, stream=True, timeout=60)
                        logger.debug("stream_response: Retry nach Token-Refresh - Status: %s", response.status_code)
                    else:
                        # Kein Refresh-Token vorhanden - wechsle zu anonymem Modus
                        logger.debug("stream_response: Kein Refresh-Token - wechsle zu anonymem Modus")
                        update_config(auth_token="")  # Token löschen
                        get_config(force_reload=True)
                        headers = get_auth_headers()  # Jetzt mit Device-ID
                        retry_count += 1
                        response = requests.post(url, json=request_data, headers=headers, stream=True, timeout=60)
                        logger.debug("stream_response: Retry als anonymer User - Status: %s", response.status_code)
                else:
                    # Max Retries erreicht - versuche als anonymer User
                    logger.debug("stream_response: Max Retries erreicht - versuche als anonymer User")
                    update_config(auth_token="")  # Token löschen
                    get_config(force_reload=True)
                    headers = get_auth_headers()  # Jetzt mit Device-ID
                    response = requests.post(url, json=request_data, headers=headers, stream=True, timeout=60)
                    logger.debug("stream_response: Request als anonymer User - Status: %s", response.status_code)

            # Bei 403: Quota-Fehler
            if response.status_code == 403:
                try:
                    error_text = response.text[:500]
                    error_data = json.loads(error_text) if error_text.startswith('{') else {}
                    error_msg = error_data.get("error", {}).get("message", "Quota überschritten")
                    raise Exception(f"Quota überschritten: {error_msg}. Bitte upgraden Sie Ihren Plan.")
                except (ValueError, KeyError):
                    raise Exception("Quota überschritten. Bitte upgraden Sie Ihren Plan.")

            response.raise_for_status()

            # Prüfe Content-Type und erzwinge UTF-8
            content_type = response.headers.get('Content-Type', '')
            logger.debug("stream_response: Content-Type: %s", content_type)
            response.encoding = 'utf-8'

            # Verarbeite Stream - ECHTES STREAMING
            stream_finished = False
            chunk_count = 0
            accumulated_text = ""

            # Backend sendet SSE-Format: data: {"text": "..."}
            # Gemini sendet JSON-Array-Stream
            if use_backend:
                # Backend SSE-Format parsen
                logger.debug("📡 Starte Backend-Stream-Verarbeitung...")
                chunk_received = False
                try:
                    # Verwende iter_lines für bessere SSE-Verarbeitung
                    for line in response.iter_lines(decode_unicode=True):
                        if line is None:
                            continue

                        chunk_received = True
                        line = line.strip()
                        if not line:
                            continue

                        logger.debug("📝 Verarbeite Zeile: %s...", line[:100])

                        # SSE-Format: data: {...}
                        if line.startswith('data: '):
                            data_str = line[6:]  # Entferne "data: " Präfix

                            # Prüfe auf [DONE]
                            if data_str == '[DONE]':
                                logger.info("✅ Stream beendet mit [DONE]")
                                stream_finished = True
                                if callback:
                                    callback("", True, False)
                                return (full_text, None)

                            try:
                                chunk_data = json.loads(data_str)
                                logger.debug("📦 Chunk-Daten geparst: %s", list(chunk_data.keys()))

                                # Backend-Format: {"text": "..."}
                                if "text" in chunk_data:
                                    chunk_text = chunk_data["text"]
                                    if chunk_text:
                                        logger.info("✅ Text-Chunk erhalten (Länge: %s)", len(chunk_text))
                                        accumulated_text += chunk_text
                                        full_text = accumulated_text
                                        chunk_count += 1
                                        if callback:
                                            callback(chunk_text, False, False)

                                # Backend-Format: {"error": "..."}
                                if "error" in chunk_data:
                                    error_msg = chunk_data["error"].get("message", "Unbekannter Fehler")
                                    error_code = chunk_data["error"].get("code", "UNKNOWN")
                                    if error_code == "QUOTA_EXCEEDED":
                                        raise Exception(f"Quota überschritten: {error_msg}. Bitte upgraden Sie Ihren Plan.")
                                    raise Exception(f"Backend Fehler: {error_msg}")

                            except json.JSONDecodeError as e:
                                # Ignoriere JSON-Parse-Fehler für unvollständige Chunks
                                logger.warning("⚠️ JSON-Parse-Fehler (ignoriert): %s, Zeile: %s...", e, line[:50])
                                continue
                            except Exception as e:
                                if "Quota" in str(e) or "Token" in str(e):
                                    raise
                                logger.warning("⚠️ Fehler beim Verarbeiten von Backend-Chunk: %s", e)
                except Exception as stream_error:
                    logger.warning("⚠️ Stream-Fehler: %s", stream_error)
                    raise

                if not chunk_received:
                    logger.warning("⚠️ Keine Chunks vom Backend empfangen!")

                # Stream beendet
                logger.debug("📊 Stream beendet - Chunks: %s, Text-Länge: %s", chunk_count, len(full_text))
                if full_text:
                    if callback:
                        callback("", True, False)
                    return (full_text, None)
                else:
                    if callback:
                        callback("", True, False)
                    raise Exception("Backend-Streaming lieferte keine Antwort")

            # Gemini-Format (Fallback)
            buffer = ""
            brace_count = 0
            bracket_count = 0
            in_string = False
            escape_next = False
            array_started = False

            for chunk in response.iter_content(chunk_size=1024, decode_unicode=True):
                if chunk is None:
                    continue

                if not chunk:
                    continue

                # Entferne SSE-Präfix falls vorhanden
                chunk_str = chunk
                if chunk_str.startswith("data: "):
                    chunk_str = chunk_str[6:]
                elif chunk_str.startswith(":"):
                    continue

                # Erkenne Array-Start
                if not array_started and "[" in chunk_str:
                    array_started = True
                    bracket_pos = chunk_str.find("[")
                    if bracket_pos >= 0:
                        chunk_str = chunk_str[bracket_pos + 1:]

                buffer += chunk_str

                # Zähle Klammern
                for char in chunk_str:
                    if escape_next:
                        escape_next = False
                        continue

                    if char == '\\':
                        escape_next = True
                        continue

                    if char == '"' and not escape_next:
                        in_string = not in_string
                        continue

                    if not in_string:
                        if char == '{':
                            brace_count += 1
                        elif char == '}':
                            brace_count -= 1
                        elif char == '[':
                            bracket_count += 1
                        elif char == ']':
                            bracket_count -= 1

                # Wenn vollständiges Objekt vorhanden
                if brace_count == 0 and bracket_count == 0 and buffer.strip():
                    buffer_clean = buffer.strip()
                    while buffer_clean.startswith(','):
                        buffer_clean = buffer_clean[1:].strip()

                    if not buffer_clean.startswith('{'):
                        buffer = buffer_clean
                        continue

                    try:
                        chunk_data = json.loads(buffer_clean)
                        buffer = ""
                        chunk_count += 1

                        if "candidates" in chunk_data and len(chunk_data["candidates"]) > 0:
                            candidate = chunk_data["candidates"][0]
                            finish_reason = candidate.get("finishReason", None)

                            if "content" in candidate and "parts" in candidate["content"]:
                                parts = candidate["content"]["parts"]
                                for part in parts:
                                    # Check for Function Call
                                    if "functionCall" in part:
                                        function_call = part["functionCall"]
                                        logger.debug("🔧 stream_response: Function Call im Stream erkannt: %s", function_call.get('name'))

                                        # Notify callback about tool usage
                                        if callback:
                                            callback(None, False, is_function_call=True)

                                        # Return immediately to handle tool
                                        return (accumulated_text, function_call)

                                    if "text" in part:
                                        chunk_text = part["text"]
                                        if chunk_text:
                                            accumulated_text += chunk_text
                                            full_text = accumulated_text
                                            if callback:
                                                callback(chunk_text, False, False)

                            if finish_reason:
                                stream_finished = True
                                if finish_reason == "STOP":
                                    logger.info("✅ Stream normal beendet (STOP) nach %s Chunks", chunk_count)
                                else:
                                    logger.warning("⚠️ Stream beendet mit Reason: %s", finish_reason)

                                if callback:
                                    callback("", True, False)
                                return (full_text, None)

                    except json.JSONDecodeError:
                        if len(buffer) > 500000:
                            buffer = ""
                            brace_count = 0
                            bracket_count = 0
                        continue
                    except Exception as e:
                        logger.warning("⚠️ Fehler beim Verarbeiten von Stream-Chunk: %s", e)
                        buffer = ""
                        brace_count = 0
                        bracket_count = 0
                        continue

            if not stream_finished:
                if full_text:
                    if callback:
                        callback("", True, False)
                    return (full_text, None)
                else:
                    if callback:
                        callback("", True, False)
                    raise Exception("Streaming lieferte keine Antwort")

            if callback:
                callback("", True, False)
            return (full_text, None)

        except Exception as e:
            if "Google API Fehler" in str(e):
                raise
            last_error = e
            continue

    if last_error:
        if callback:
            callback("", True, False)
        raise Exception(f"Fehler beim Streaming: {str(last_error)}")

    if callback:
        callback("", True, False)
    return (full_text, None)


# ---------------------------------------------------------------------------
# generate_definition  — lightweight synchronous call for KG definitions
# ---------------------------------------------------------------------------
DEFINITION_MODEL = "gemini-2.0-flash"


def generate_definition(term, card_texts, model=None):
    """Generate a concise definition of a term from flashcard texts.

    Args:
        term: The term to define.
        card_texts: List of dicts with 'question' and 'answer' keys.
        model: Model to use (defaults to DEFINITION_MODEL).

    Returns:
        Definition string, or empty string on failure.
    """
    if not card_texts:
        return ""

    if model is None:
        model = DEFINITION_MODEL

    config = get_config() or {}
    api_key = config.get("api_key", "")
    if not api_key:
        logger.warning("generate_definition: Kein API-Key konfiguriert")
        return ""

    cards_str = "\n\n".join(
        "Karte %d:\nFrage: %s\nAntwort: %s" % (i + 1, c.get("question", ""), c.get("answer", ""))
        for i, c in enumerate(card_texts[:8])
    )

    prompt = (
        "Basierend auf den folgenden Lernkarten, erstelle eine präzise Definition von '%s'. "
        "Maximal 3 Sätze. Antworte auf Deutsch.\n\n%s" % (term, cards_str)
    )

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        "%s:generateContent?key=%s" % (model, api_key)
    )
    data = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 300,
        },
    }

    try:
        response = requests.post(url, json=data, headers={"Content-Type": "application/json"}, timeout=20)
        response.raise_for_status()
        result = response.json()

        candidates = result.get("candidates", [])
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            if parts:
                text = parts[0].get("text", "").strip()
                if text:
                    logger.info("generate_definition: Definition für '%s' generiert (%s Zeichen)", term, len(text))
                    return text

        logger.warning("generate_definition: Keine Textantwort für '%s'", term)
        return ""

    except requests.exceptions.RequestException as e:
        logger.error("generate_definition: Netzwerkfehler für '%s': %s", term, str(e))
        return ""
    except (ValueError, KeyError) as e:
        logger.error("generate_definition: Fehler beim Parsen der Antwort für '%s': %s", term, str(e))
        return ""
    except Exception as e:
        logger.exception("generate_definition: Unbekannter Fehler für '%s'", term)
        return ""
