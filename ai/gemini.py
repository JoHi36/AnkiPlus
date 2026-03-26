"""Google Gemini API integration: backend-only request handling, streaming, retry logic.

All AI calls are routed through the backend /chat endpoint.
Direct Gemini API calls have been removed (Phase 2, Task 9).
"""

import requests
import json
import time
import re

try:
    from ..config import (get_config, is_backend_mode, get_backend_url,
                          get_auth_token, get_refresh_token, update_config)
except ImportError:
    from config import (get_config, is_backend_mode, get_backend_url,
                        get_auth_token, get_refresh_token, update_config)

try:
    from .auth import get_auth_headers, refresh_auth_token
except ImportError:
    from auth import get_auth_headers, refresh_auth_token

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
                    logger.warning("Retry %s/%s after %.1fs for status %s", attempt + 1, max_retries, delay, response.status_code)
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
                logger.warning("Retry %s/%s after %.1fs for network error: %s", attempt + 1, max_retries, delay, str(e)[:100])
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
# Helper: refresh config + auth token
# ---------------------------------------------------------------------------
def _do_refresh_auth_token():
    """Refresh the auth token and reload config on success."""
    result = refresh_auth_token()
    if result:
        get_config(force_reload=True)
    return result


# ---------------------------------------------------------------------------
# Shared helpers for backend calls
# ---------------------------------------------------------------------------
def _get_backend_chat_url():
    """Return the backend /chat URL."""
    backend_url = get_backend_url()
    return f"{backend_url}/chat"


def _get_auth_headers_safe():
    """Get auth headers, returning Content-Type-only headers on failure."""
    try:
        return get_auth_headers()
    except Exception as e:
        logger.warning("Failed to get auth headers: %s", e)
        return {"Content-Type": "application/json"}


def _build_chat_payload(user_message, model, context=None, history=None,
                        mode='compact', rag_context=None, system_prompt_override=None,
                        config=None, stream=False, agent='tutor'):
    """Build the payload for the backend /chat endpoint.

    The backend handles: system prompt assembly, RAG context injection,
    tool format translation, retries.
    """
    if config is None:
        config = get_config() or {}

    ai_tools = config.get("ai_tools", {
        "images": True,
        "diagrams": True,
        "molecules": False
    })

    # Determine enabled tools list
    enabled_tools = [name for name, enabled in ai_tools.items() if enabled]

    # Build card context from the context dict
    card_context = None
    if context:
        card_context = {
            "question": context.get('frontField') or context.get('question', ''),
            "answer": context.get('answer', ''),
            "deckName": context.get('deckName', ''),
            "tags": context.get('tags', []),
            "stats": context.get('stats', {}),
            "isQuestion": context.get('isQuestion', True),
        }

    # Build insights list from RAG context
    insights = []
    if rag_context and rag_context.get("cards"):
        insights = rag_context["cards"]

    # Map mode to responseStyle
    response_style = mode if mode in ('compact', 'detailed') else 'compact'

    payload = {
        "message": user_message,
        "history": history if history else [],
        "cardContext": card_context,
        "insights": insights,
        "agent": agent,
        "mode": "review" if context else "free_chat",
        "responseStyle": response_style,
        "tools": enabled_tools,
        "model": model or "gemini-3-flash-preview",
        "stream": stream,
        "temperature": 0.7,
        "maxOutputTokens": 8192,
    }

    # Pass system prompt override if provided (backend can use or ignore)
    if system_prompt_override is not None:
        payload["systemPromptOverride"] = system_prompt_override

    return payload


def _handle_backend_error(response):
    """Handle error responses from the backend. Raises Exception with user-friendly message."""
    status_code = response.status_code

    if status_code == 403:
        try:
            error_data = response.json()
            error_code = error_data.get("error", {}).get("code", "QUOTA_EXCEEDED")
            error_msg = error_data.get("error", {}).get("message", "Quota exceeded")
            user_msg = get_user_friendly_error(error_code, error_msg)
            raise Exception(user_msg)
        except (ValueError, KeyError):
            raise Exception(get_user_friendly_error('QUOTA_EXCEEDED'))

    if status_code == 400:
        try:
            error_data = response.json()
            error_code = error_data.get("error", {}).get("code", "VALIDATION_ERROR")
            error_msg = error_data.get("error", {}).get("message", "Invalid request")
            user_msg = get_user_friendly_error(error_code, error_msg)
            raise Exception(user_msg)
        except (ValueError, KeyError):
            raise Exception(get_user_friendly_error('VALIDATION_ERROR'))

    if status_code >= 400:
        try:
            error_data = response.json()
            error_msg = error_data.get("error", {}).get("message", f"HTTP {status_code}")
            error_code = error_data.get("error", {}).get("code", "BACKEND_ERROR")
            user_msg = get_user_friendly_error(error_code, error_msg)
            raise Exception(user_msg)
        except (ValueError, KeyError):
            raise Exception(get_user_friendly_error('BACKEND_ERROR'))


def _handle_401_retry(url, request_data, headers, stream=False, retry_count=0, max_retries=1):
    """Handle 401 Unauthorized by refreshing token or falling back to anonymous.

    Returns (response, retry_count) tuple.
    """
    timeout = 60 if stream else 30

    if retry_count < max_retries:
        logger.debug("401 Unauthorized - attempting token refresh")
        if _do_refresh_auth_token():
            retry_count += 1
            headers = _get_auth_headers_safe()
            response = requests.post(url, json=request_data, headers=headers,
                                     stream=stream, timeout=timeout)
            logger.debug("Retry after token refresh - Status: %s", response.status_code)
            return response, retry_count
        else:
            # No refresh token — switch to anonymous mode
            logger.debug("No refresh token - switching to anonymous mode")
            update_config(auth_token="")
            get_config(force_reload=True)
            headers = _get_auth_headers_safe()
            retry_count += 1
            response = requests.post(url, json=request_data, headers=headers,
                                     stream=stream, timeout=timeout)
            return response, retry_count
    else:
        # Max retries reached — try anonymous
        logger.debug("Max retries reached - trying as anonymous user")
        update_config(auth_token="")
        get_config(force_reload=True)
        headers = _get_auth_headers_safe()
        response = requests.post(url, json=request_data, headers=headers,
                                 stream=stream, timeout=timeout)
        return response, retry_count

    return None, retry_count


def _maybe_call_openrouter(payload, config):
    """Dev-only bypass: call OpenRouter directly if dev_openrouter_key is set.

    Returns response text or None if not applicable.
    """
    dev_key = config.get('dev_openrouter_key', '')
    if not dev_key:
        return None

    logger.warning("DEV MODE: Using OpenRouter directly (dev_openrouter_key is set)")

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {dev_key}",
    }

    # Map to OpenRouter format
    messages = []
    if payload.get("systemPromptOverride"):
        messages.append({"role": "system", "content": payload["systemPromptOverride"]})

    for msg in payload.get("history", []):
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if content:
            messages.append({"role": role, "content": content})

    messages.append({"role": "user", "content": payload["message"]})

    or_data = {
        "model": payload.get("model", "google/gemini-2.0-flash-001"),
        "messages": messages,
        "temperature": payload.get("temperature", 0.7),
        "max_tokens": payload.get("maxOutputTokens", 8192),
    }

    try:
        response = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            json=or_data, headers=headers, timeout=30
        )
        response.raise_for_status()
        result = response.json()
        choices = result.get("choices", [])
        if choices:
            return choices[0].get("message", {}).get("content", "")
        return ""
    except Exception as e:
        logger.error("OpenRouter dev bypass failed: %s", e)
        raise Exception(f"OpenRouter error: {e}")


# ---------------------------------------------------------------------------
# get_google_response (non-streaming, backend-only)
# ---------------------------------------------------------------------------
def get_google_response(user_message, model, api_key, context=None, history=None,
                        mode='compact', rag_context=None, system_prompt_override=None,
                        config=None):
    """Send a chat request to the backend /chat endpoint (non-streaming).

    All parameters are preserved for backward compatibility.
    The api_key parameter is ignored — auth tokens are used instead.
    """
    if not model:
        model = "gemini-3-flash-preview"

    if config is None:
        config = get_config() or {}

    logger.debug("get_google_response: model=%s", model)

    # Build backend payload
    payload = _build_chat_payload(
        user_message=user_message,
        model=model,
        context=context,
        history=history,
        mode=mode,
        rag_context=rag_context,
        system_prompt_override=system_prompt_override,
        config=config,
        stream=False,
    )

    # Dev-only OpenRouter bypass
    or_result = _maybe_call_openrouter(payload, config)
    if or_result is not None:
        return or_result

    url = _get_backend_chat_url()
    headers = _get_auth_headers_safe()
    retry_count = 0

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=30)

        # Handle 401 with token refresh
        if response.status_code == 401:
            response, retry_count = _handle_401_retry(
                url, payload, headers, stream=False, retry_count=retry_count
            )

        # Handle error responses
        if response.status_code >= 400:
            _handle_backend_error(response)

        result = response.json()

        # Check for error in response body
        if "error" in result:
            error_msg = result["error"].get("message", "Unknown error")
            error_code = result["error"].get("code", "BACKEND_ERROR")
            user_msg = get_user_friendly_error(error_code, error_msg)
            raise Exception(user_msg)

        # Extract text from backend response
        # Backend returns {"text": "..."} or {"response": "..."} for non-streaming
        text = result.get("text") or result.get("response") or ""
        if text:
            logger.info("get_google_response: Success, response length: %s", len(text))
            return text

        # Fallback: check Gemini-style candidates (if backend proxies raw response)
        if "candidates" in result and len(result["candidates"]) > 0:
            candidate = result["candidates"][0]
            if "content" in candidate and "parts" in candidate["content"]:
                parts = candidate["content"]["parts"]
                if parts:
                    text = parts[0].get("text", "")
                    if text:
                        logger.info("get_google_response: Success (candidates format), length: %s", len(text))
                        return text

        raise Exception("Invalid response from backend")

    except requests.exceptions.RequestException as e:
        logger.exception("get_google_response: Network error: %s", e)
        raise Exception(get_user_friendly_error('NETWORK_ERROR'))


# ---------------------------------------------------------------------------
# get_google_response_streaming (streaming, backend-only)
# ---------------------------------------------------------------------------
def get_google_response_streaming(user_message, model, api_key, context=None, history=None,
                                  mode='compact', callback=None, rag_context=None,
                                  suppress_error_callback=False, system_prompt_override=None,
                                  config=None):
    """Send a streaming chat request to the backend /chat endpoint.

    All parameters are preserved for backward compatibility.
    The api_key parameter is ignored — auth tokens are used instead.

    Args:
        callback: Function(chunk, done, is_function_call, steps=None, citations=None)
        suppress_error_callback: If True, don't send error messages via callback (for retries)
        config: Config dict (thread-safe, passed from AIHandler)
    """
    if not model:
        model = "gemini-3-flash-preview"

    if config is None:
        config = get_config() or {}

    logger.debug("get_google_response_streaming: model=%s", model)

    # Build backend payload (streaming)
    payload = _build_chat_payload(
        user_message=user_message,
        model=model,
        context=context,
        history=history,
        mode=mode,
        rag_context=rag_context,
        system_prompt_override=system_prompt_override,
        config=config,
        stream=True,
    )

    url = _get_backend_chat_url()

    try:
        result = stream_response(
            urls=[url],
            data=None,
            callback=callback,
            use_backend=True,
            backend_data=payload,
        )
        # stream_response returns (full_text, function_call_data) tuple
        # Callers expect a plain string
        if isinstance(result, tuple):
            return result[0] or ""
        return result or ""
    except Exception as e:
        error_msg = f"Streaming request error: {str(e)}"
        logger.exception("Streaming error: %s", error_msg)
        raise Exception(error_msg)


# ---------------------------------------------------------------------------
# stream_response (backend SSE streaming)
# ---------------------------------------------------------------------------
def stream_response(urls, data, callback=None, use_backend=False, backend_data=None):
    """Stream a response from the backend via SSE.

    Args:
        urls: List of URLs (with fallback)
        data: Legacy parameter (ignored when use_backend=True)
        callback: Optional - Function(chunk, done, is_function_call=False)
        use_backend: Whether backend mode is active (always True now)
        backend_data: Request data in backend format

    Returns:
        Tuple (full_text, function_call_data)
    """
    full_text = ""
    last_error = None
    retry_count = 0
    max_retries = 1

    for url in urls:
        try:
            logger.debug("stream_response: Trying URL: %s...", url.split('?')[0])

            headers = _get_auth_headers_safe()
            request_data = backend_data if backend_data else data

            response = requests.post(url, json=request_data, headers=headers, stream=True, timeout=60)

            # Handle 401 with token refresh
            if response.status_code == 401:
                response, retry_count = _handle_401_retry(
                    url, request_data, headers, stream=True, retry_count=retry_count,
                    max_retries=max_retries
                )

            # Handle 403 (Quota)
            if response.status_code == 403:
                try:
                    error_text = response.text[:500]
                    error_data = json.loads(error_text) if error_text.startswith('{') else {}
                    error_msg = error_data.get("error", {}).get("message", "Quota exceeded")
                    raise Exception(f"Quota exceeded: {error_msg}")
                except (ValueError, KeyError):
                    raise Exception(get_user_friendly_error('QUOTA_EXCEEDED'))

            response.raise_for_status()

            # Force UTF-8
            response.encoding = 'utf-8'

            # Parse SSE stream from backend
            # Format: data: {"text": "chunk"} or data: {"functionCall": {...}} or data: {"error": "..."}
            logger.debug("Starting backend stream processing...")
            chunk_count = 0
            accumulated_text = ""
            chunk_received = False

            try:
                for line in response.iter_lines(decode_unicode=True):
                    if line is None:
                        continue

                    chunk_received = True
                    line = line.strip()
                    if not line:
                        continue

                    # SSE format: data: {...}
                    if not line.startswith('data: '):
                        continue

                    data_str = line[6:]  # Remove "data: " prefix

                    # Check for [DONE]
                    if data_str == '[DONE]':
                        logger.info("Stream finished with [DONE]")
                        if callback:
                            callback("", True, False)
                        return (accumulated_text, None)

                    try:
                        chunk_data = json.loads(data_str)

                        # Text chunk: {"text": "..."}
                        if "text" in chunk_data:
                            chunk_text = chunk_data["text"]
                            if chunk_text:
                                accumulated_text += chunk_text
                                full_text = accumulated_text
                                chunk_count += 1
                                if callback:
                                    callback(chunk_text, False, False)

                        # Done marker: {"done": true, "tokens": {...}}
                        if chunk_data.get("done"):
                            logger.info("Stream finished (done=true), chunks: %s", chunk_count)
                            if callback:
                                callback("", True, False)
                            return (accumulated_text, None)

                        # Function call: {"functionCall": {"name": "...", "args": {...}}}
                        if "functionCall" in chunk_data:
                            function_call = chunk_data["functionCall"]
                            logger.debug("Function call in stream: %s", function_call.get('name'))
                            if callback:
                                callback(None, False, True)
                            return (accumulated_text, function_call)

                        # Error: {"error": "..."} or {"error": {"message": "...", "code": "..."}}
                        if "error" in chunk_data:
                            error_val = chunk_data["error"]
                            if isinstance(error_val, dict):
                                error_msg = error_val.get("message", "Unknown error")
                                error_code = error_val.get("code", "UNKNOWN")
                            else:
                                error_msg = str(error_val)
                                error_code = "UNKNOWN"
                            if error_code == "QUOTA_EXCEEDED":
                                raise Exception(get_user_friendly_error('QUOTA_EXCEEDED'))
                            raise Exception(f"Backend error: {error_msg}")

                    except json.JSONDecodeError as e:
                        logger.warning("JSON parse error (ignored): %s, line: %s...", e, line[:50])
                        continue
                    except Exception as e:
                        if "Quota" in str(e) or "Token" in str(e) or "Backend error" in str(e):
                            raise
                        logger.warning("Error processing backend chunk: %s", e)

            except Exception as stream_error:
                logger.warning("Stream error: %s", stream_error)
                raise

            if not chunk_received:
                logger.warning("No chunks received from backend!")

            # Stream ended without explicit [DONE] or done=true
            logger.debug("Stream ended - chunks: %s, text length: %s", chunk_count, len(full_text))
            if full_text:
                if callback:
                    callback("", True, False)
                return (full_text, None)
            else:
                if callback:
                    callback("", True, False)
                raise Exception("Backend streaming returned no response")

        except Exception as e:
            if "Quota" in str(e) or "Backend error" in str(e):
                raise
            last_error = e
            continue

    if last_error:
        if callback:
            callback("", True, False)
        raise Exception(f"Streaming error: {str(last_error)}")

    if callback:
        callback("", True, False)
    return (full_text, None)


# ---------------------------------------------------------------------------
# generate_definition — lightweight call for KG definitions (via backend)
# ---------------------------------------------------------------------------
DEFINITION_MODEL = "gemini-2.0-flash"


def generate_definition(term, card_texts, model=None):
    """Generate a concise definition of a term from flashcard texts.

    Routes through the backend /chat endpoint with agent='tutor'.

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

    cards_str = "\n\n".join(
        "Karte %d:\nFrage: %s\nAntwort: %s" % (i + 1, c.get("question", ""), c.get("answer", ""))
        for i, c in enumerate(card_texts[:8])
    )

    prompt = (
        "Basierend auf den folgenden Lernkarten, erstelle eine präzise Definition von '%s'. "
        "Maximal 3 Sätze. Antworte auf Deutsch.\n\n%s" % (term, cards_str)
    )

    config = get_config() or {}

    # Dev-only OpenRouter bypass
    payload = {
        "message": prompt,
        "model": model,
        "temperature": 0.3,
        "maxOutputTokens": 300,
    }
    or_result = _maybe_call_openrouter(payload, config)
    if or_result is not None:
        return or_result

    # Backend call
    url = _get_backend_chat_url()
    headers = _get_auth_headers_safe()

    backend_payload = {
        "message": prompt,
        "history": [],
        "agent": "tutor",
        "mode": "free_chat",
        "responseStyle": "compact",
        "model": model,
        "stream": False,
        "temperature": 0.3,
        "maxOutputTokens": 300,
    }

    try:
        response = requests.post(url, json=backend_payload, headers=headers, timeout=20)
        response.raise_for_status()
        result = response.json()

        # Extract text from backend response
        text = result.get("text") or result.get("response") or ""
        if not text:
            # Fallback: check candidates format
            candidates = result.get("candidates", [])
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                if parts:
                    text = parts[0].get("text", "").strip()

        if text:
            logger.info("generate_definition: Definition for '%s' generated (%s chars)", term, len(text))
            return text.strip()

        logger.warning("generate_definition: No text response for '%s'", term)
        return ""

    except requests.exceptions.RequestException as e:
        logger.error("generate_definition: Network error for '%s': %s", term, str(e))
        return ""
    except (ValueError, KeyError) as e:
        logger.error("generate_definition: Parse error for '%s': %s", term, str(e))
        return ""
    except Exception as e:
        logger.exception("generate_definition: Unknown error for '%s'", term)
        return ""


# ---------------------------------------------------------------------------
# generate_quick_answer — concise 2-3 sentence answer from card texts
# ---------------------------------------------------------------------------
def generate_quick_answer(query, card_texts, cluster_labels=None, model=None):
    """Generate a concise 2-3 sentence answer from card texts.

    Args:
        query: The user's search query.
        card_texts: List of dicts with 'question' and 'answer' keys (max 10).
        cluster_labels: Optional dict of cluster_id → [card_question_snippets] for naming.
        model: Model override (defaults to DEFINITION_MODEL).

    Returns:
        dict: {"answer": str, "answerable": bool, "clusterLabels": dict}
    """
    if not card_texts:
        return {"answer": "Nicht genug Karten zu diesem Thema.", "answerable": False, "clusterLabels": {}}

    if model is None:
        model = DEFINITION_MODEL

    cards_str = "\n".join(
        "Karte %d: %s | %s" % (i + 1, c.get('question', '')[:60], c.get('answer', '')[:60])
        for i, c in enumerate(card_texts[:10])
    )

    # Detect: single term vs question
    question_words = ['was', 'wie', 'warum', 'welche', 'wozu', 'wann', 'erkläre', 'definiere']
    is_question = any(w in query.lower().split() for w in question_words) or query.strip().endswith('?')

    if is_question:
        prompt = (
            "Beantworte diese Frage in maximal 2 Sätzen basierend auf diesen Lernkarten:\n"
            "\"%s\"\n\n%s\n\n"
            "Beantworte NUR den Kern der Frage. Kein Drumherum. "
            "Wenn die Karten nicht genug Kontext bieten, antworte GENAU: "
            "\"Diese Frage kann mit deinen Karten nicht beantwortet werden.\""
        ) % (query, cards_str)
    else:
        prompt = (
            "Definiere '%s' in maximal 2 Sätzen basierend auf diesen Lernkarten:\n\n%s\n\n"
            "Kein Drumherum. "
            "Wenn die Karten keine klare Definition liefern, antworte GENAU: "
            "\"Keine Definition in deinen Karten gefunden.\""
        ) % (query, cards_str)

    # Add cluster labeling request if clusters provided
    parsed_labels = {}
    if cluster_labels:
        cluster_str = "\n".join(
            "Cluster %s: %s" % (k, ", ".join(str(s)[:30] for s in v[:3]))
            for k, v in cluster_labels.items()
        )
        prompt += (
            "\n\nBenenne außerdem jeden Cluster mit 2-3 Wörtern:\n%s\n"
            "\nAntworte im Format:\nANTWORT: [deine antwort]\nCLUSTER: cluster_0=Name, cluster_1=Name"
        ) % cluster_str

    config = get_config() or {}

    # Use the SAME streaming infrastructure as the regular chat
    try:
        payload = _build_chat_payload(
            user_message=prompt,
            model=model,
            mode='compact',
            stream=True,
            agent='tutor',
        )
        # Override temperature for concise answers
        payload["temperature"] = 0.3
        payload["maxOutputTokens"] = 400

        # Collect chunks
        collected_text = []
        def _collect(chunk, done, is_function_call=False, **kwargs):
            if chunk:
                collected_text.append(chunk)

        result = stream_response(
            urls=[_get_backend_chat_url()],
            data=None,
            callback=_collect,
            use_backend=True,
            backend_data=payload,
        )

        response_text = "".join(collected_text)
        if not response_text.strip():
            # Fallback: stream_response might return the text directly
            if isinstance(result, tuple):
                response_text = result[0] or ""
            elif isinstance(result, str):
                response_text = result

        if not response_text.strip():
            logger.warning("generate_quick_answer: Empty response for '%s'", query)
            return {"answer": "", "answerable": False, "clusterLabels": {}}

    except Exception as e:
        logger.exception("generate_quick_answer: Error for '%s'", query)
        return {"answer": "", "answerable": False, "clusterLabels": {}}

    # Parse response
    text = response_text.strip()

    if cluster_labels and "ANTWORT:" in text:
        # Parse structured response
        parts = text.split("CLUSTER:")
        answer = parts[0].replace("ANTWORT:", "").strip()
        if len(parts) > 1:
            for pair in parts[1].strip().split(","):
                pair = pair.strip()
                if "=" in pair:
                    k, v = pair.split("=", 1)
                    parsed_labels[k.strip()] = v.strip()
    else:
        answer = text

    answerable = not any(phrase in answer for phrase in [
        "kann mit deinen Karten nicht beantwortet",
        "Keine Definition in deinen Karten",
        "Nicht genug Karten",
    ])

    logger.info("generate_quick_answer: Done for '%s', answerable=%s, labels=%s",
                query, answerable, len(parsed_labels))

    return {
        "answer": answer,
        "answerable": answerable,
        "clusterLabels": parsed_labels,
    }
