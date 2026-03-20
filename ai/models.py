"""Model management: fetching available models, generating section titles."""

import json
import re
import requests

try:
    from ..config import get_config, is_backend_mode, get_backend_url, get_auth_token
except ImportError:
    from config import get_config, is_backend_mode, get_backend_url, get_auth_token

try:
    from .auth import get_auth_headers
except ImportError:
    from auth import get_auth_headers

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)


def get_section_title(question, answer="", config=None):
    """
    Generiert einen kurzen Titel (max 5 Wörter) für eine Lernkarte

    Args:
        question: Die Frage der Lernkarte (kann HTML enthalten)
        answer: Optional - Die Antwort der Lernkarte
        config: Optional - Config dict; if None, get_config(force_reload=True) is used

    Returns:
        Ein kurzer, aussagekräftiger Titel
    """
    logger.debug("=" * 60)
    logger.debug("get_section_title: START")
    logger.debug("=" * 60)

    # Entferne HTML-Tags aus question und answer
    def strip_html(text):
        if not text:
            return ""
        # Entferne HTML-Tags
        clean = re.sub(r'<[^>]+>', ' ', text)
        # Entferne mehrfache Leerzeichen
        clean = re.sub(r'\s+', ' ', clean)
        # Entferne HTML-Entities
        clean = re.sub(r'&[a-zA-Z]+;', ' ', clean)
        return clean.strip()

    logger.debug("get_section_title: Schritt 1 - HTML-Bereinigung")
    logger.debug("  Original Frage Länge: %s", len(question) if question else 0)
    question_clean = strip_html(question)
    answer_clean = strip_html(answer)
    logger.debug("  Bereinigte Frage Länge: %s", len(question_clean) if question_clean else 0)
    logger.debug("  Bereinigte Antwort Länge: %s", len(answer_clean) if answer_clean else 0)

    # Lade Config neu
    logger.debug("get_section_title: Schritt 2 - Config laden")
    if config is None:
        config = get_config(force_reload=True)
    logger.debug("  Config neu geladen")

    # Inline is_configured check
    if is_backend_mode():
        configured = True  # Backend-Modus = immer konfiguriert (unterstützt anonyme User)
    else:
        configured = bool(config.get("api_key", "").strip())

    if not configured:
        logger.warning("get_section_title: Kein API-Key konfiguriert")
        return "Lernkarte"

    # Wenn nach Bereinigung keine Frage übrig bleibt, Fallback
    if not question_clean or len(question_clean) < 5:
        logger.warning("get_section_title: Frage zu kurz (%s Zeichen)", len(question_clean) if question_clean else 0)
        return "Lernkarte"

    logger.debug("get_section_title: Schritt 3 - API-Key validieren")
    api_key = config.get("api_key", "").strip()  # WICHTIG: Trimme API-Key
    logger.debug("  API-Key Länge nach Trimmen: %s", len(api_key))

    # Warnung wenn API-Key zu lang ist
    if len(api_key) > 50:
        logger.warning("get_section_title: API-Key ist sehr lang (%s Zeichen)!", len(api_key))
        logger.debug("   Erste 30 Zeichen: %s...", api_key[:30])

    # Prüfe ob Backend-Modus aktiv ist
    use_backend = is_backend_mode() and get_auth_token()

    if not use_backend and not api_key:
        logger.warning("get_section_title: API-Key ist leer nach Trimmen")
        return "Lernkarte"

    # IMMER Gemini 2.0 Flash für Titel (schneller, günstiger, stabiler als Preview)
    # Gemini 3 Preview ist für Chat, aber für einfache Titel ist 2.0 besser
    model = "gemini-2.5-flash"
    logger.debug("  Verwende für Titel-Generierung: %s (immer 2.0 Flash für Stabilität)", model)

    logger.debug("get_section_title: Schritt 4 - Request vorbereiten")
    logger.debug("  Modell: %s", model)
    if not use_backend:
        logger.debug("  API-Key Länge: %s", len(api_key))
    logger.debug("  Frage-Länge: %s", len(question_clean))
    logger.debug("  Frage-Inhalt (erste 100 Zeichen): %s...", question_clean[:100])

    # Erstelle Prompt für kurzen Titel - EINFACHER
    prompt = f"""Erstelle einen Kurztitel (2-4 Wörter) für diese Lernkarte. Nur den Titel, nichts anderes.

Karteninhalt: {question_clean[:500]}"""

    if use_backend:
        # Backend-Modus: Verwende Backend-URL
        backend_url = get_backend_url()
        url = f"{backend_url}/chat"
        logger.debug("  URL: %s", url)

        # Backend-Format: message, model, mode, stream=false für non-streaming
        backend_data = {
            "message": prompt,
            "model": model,
            "mode": "compact",
            "history": [],
            "stream": False  # Non-streaming für Titel-Generierung
        }
        headers = get_auth_headers()
    else:
        # Fallback: Direkte Gemini API (API-Key-Modus)
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        logger.debug("  URL (ohne Key): %s...", url.split('?')[0])

        data = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": 20
            }
        }
        backend_data = None
        headers = {"Content-Type": "application/json"}

    logger.debug("  Request-Daten Größe: %s Zeichen", len(str(backend_data if use_backend else data)))
    logger.debug("  Prompt Länge: %s Zeichen", len(prompt))

    try:
        logger.debug("get_section_title: Schritt 5 - API-Request senden")
        logger.debug("  Sende Request an %s...", model)
        if use_backend:
            response = requests.post(url, json=backend_data, headers=headers, timeout=15)
        else:
            response = requests.post(url, json=data, headers=headers, timeout=15)
        logger.debug("  Response Status: %s", response.status_code)
        logger.debug("  Response Headers: %s", dict(response.headers))

        if response.status_code != 200:
            logger.warning("get_section_title: Fehler Status %s", response.status_code)
            logger.debug("  Vollständige Response:")
            logger.debug("  %s", response.text)
            try:
                error_data = response.json()
                logger.warning("  Parsed Error Data: %s", error_data)
                error_msg = error_data.get("error", {}).get("message", "Unbekannter Fehler")
                error_code = error_data.get("error", {}).get("code", response.status_code)
                logger.warning("  Fehlercode: %s", error_code)
                logger.warning("  Fehlermeldung: %s", error_msg)
            except Exception as parse_error:
                logger.debug("  Konnte Response nicht als JSON parsen: %s", parse_error)
                logger.debug("  Response Text (erste 1000 Zeichen): %s", response.text[:1000])
            return "Lernkarte"

        logger.debug("get_section_title: Schritt 6 - Response parsen")
        try:
            result = response.json()
            logger.debug("  Response JSON Keys: %s", list(result.keys()))
        except Exception as json_error:
            logger.error("get_section_title: Konnte Response nicht als JSON parsen: %s", json_error)
            logger.debug("  Response Text: %s", response.text[:1000])
            return "Lernkarte"

        logger.debug("get_section_title: Schritt 7 - Response validieren")

        # Extrahiere Titel aus Response (Backend oder direkte API)
        title = ""
        if use_backend:
            # Backend-Format: Prüfe verschiedene mögliche Formate
            if "text" in result:
                title = result["text"].strip()
            elif "message" in result:
                title = result["message"].strip()
            elif "candidates" in result and len(result["candidates"]) > 0:
                candidate = result["candidates"][0]
                if "content" in candidate and "parts" in candidate["content"]:
                    parts = candidate["content"]["parts"]
                    if len(parts) > 0:
                        title = parts[0].get("text", "").strip()

            if not title:
                logger.warning("get_section_title: Konnte Titel nicht aus Backend-Response extrahieren")
                logger.debug("  Response Struktur: %s", list(result.keys()))
                logger.debug("  Vollständige Response: %s", result)
                return "Lernkarte"
        else:
            # Direkte Gemini API
            if "candidates" not in result:
                logger.warning("get_section_title: Kein 'candidates' Feld in Response")
                logger.debug("  Response Struktur: %s", list(result.keys()))
                logger.debug("  Vollständige Response: %s", result)
                return "Lernkarte"

            if len(result["candidates"]) == 0:
                logger.warning("get_section_title: 'candidates' Array ist leer")
                logger.debug("  Response: %s", result)
                return "Lernkarte"

            candidate = result["candidates"][0]
            logger.debug("  Candidate Keys: %s", list(candidate.keys()) if isinstance(candidate, dict) else 'Nicht ein Dict')

            if "content" not in candidate:
                logger.warning("get_section_title: Kein 'content' Feld in Candidate")
                logger.debug("  Candidate: %s", candidate)
                return "Lernkarte"

            if "parts" not in candidate["content"]:
                logger.warning("get_section_title: Kein 'parts' Feld in Content")
                logger.debug("  Content: %s", candidate['content'])
                return "Lernkarte"

            if len(candidate["content"]["parts"]) == 0:
                logger.warning("get_section_title: 'parts' Array ist leer")
                logger.debug("  Content: %s", candidate['content'])
                return "Lernkarte"

            title = candidate["content"]["parts"][0].get("text", "").strip()

        logger.debug("get_section_title: Schritt 8 - Titel extrahieren")
        logger.debug("  Roher Titel: '%s' (Länge: %s)", title, len(title))

        if not title:
            logger.warning("get_section_title: Titel ist leer nach Extraktion")
            return "Lernkarte"

        # Entferne Anführungszeichen falls vorhanden
        title = title.strip('"\'')
        # Entferne Zeilenumbrüche
        title = title.replace('\n', ' ').strip()
        # Begrenze auf max 50 Zeichen
        if len(title) > 50:
            title = title[:47] + "..."

        logger.info("get_section_title: Titel erfolgreich generiert: '%s'", title)
        logger.debug("=" * 60)
        return title if title else "Lernkarte"

    except requests.exceptions.RequestException as e:
        logger.exception("get_section_title: Request Exception (%s): %s", type(e).__name__, e)
        return "Lernkarte"
    except Exception as e:
        logger.exception("get_section_title: Unerwartete Exception (%s): %s", type(e).__name__, e)
        return "Lernkarte"


def fetch_available_models(provider, api_key):
    """
    Ruft verfügbare Modelle von der Google API ab

    Args:
        provider: Der Provider (sollte "google" sein)
        api_key: Der API-Schlüssel

    Returns:
        Liste von Modellen mit name und label, oder leere Liste bei Fehler
    """
    # Trimme API-Key
    api_key = api_key.strip() if api_key else ""

    if not api_key:
        logger.warning("fetch_available_models: Kein API-Key vorhanden")
        return []

    # Warnung wenn API-Key zu lang ist
    if len(api_key) > 50:
        logger.warning("WARNUNG: API-Key ist sehr lang (%s Zeichen). Erste 20 Zeichen: %s...", len(api_key), api_key[:20])
        # Versuche nur die ersten 50 Zeichen (falls versehentlich mehr eingegeben wurde)
        if len(api_key) > 100:
            logger.warning("API-Key scheint falsch zu sein. Versuche nur ersten Teil...")
            api_key = api_key[:50].strip()

    try:
        return fetch_google_models(api_key)
    except Exception as e:
        logger.exception("Fehler beim Abrufen der Modelle: %s", e)
        # Gib leere Liste zurück, damit Frontend Fallback verwenden kann
        return []


def fetch_google_models(api_key):
    """Ruft Google-Modelle ab"""
    # Prüfe ob Backend-Modus aktiv ist
    use_backend = is_backend_mode() and get_auth_token()

    if use_backend:
        # Backend-Modus: Verwende Backend-URL
        backend_url = get_backend_url()
        urls = [f"{backend_url}/models"]
        logger.debug("fetch_google_models: Verwende Backend-Modus: %s", urls[0])
        headers = get_auth_headers()
    else:
        # Fallback: Direkte Gemini API (API-Key-Modus)
        api_key = api_key.strip()
        logger.debug("fetch_google_models: API-Key Länge: %s", len(api_key))
        if len(api_key) > 50:
            logger.warning("WARNUNG: API-Key ist sehr lang! Erste 30 Zeichen: %s...", api_key[:30])
            logger.warning("Normalerweise sind Google API-Keys ~39 Zeichen lang")

        # Versuche zuerst v1beta, dann v1 als Fallback
        urls = [
            f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}",
            f"https://generativelanguage.googleapis.com/v1/models?key={api_key}"
        ]
        headers = {"Content-Type": "application/json"}

    # Gewünschte Modelle mit Labels
    # NUR Gemini 3 Flash für Chat (2.0 wird nur intern für Titel verwendet)
    desired_models = {
        "gemini-3-flash-preview": "Gemini 3 Flash",
    }

    last_error = None
    for url in urls:
        try:
            logger.debug("fetch_google_models: Versuche URL: %s...", url.split('?')[0])
            if use_backend:
                response = requests.get(url, headers=headers, timeout=10)
            else:
                response = requests.get(url, timeout=10)
            logger.debug("fetch_google_models: Response Status: %s", response.status_code)

            # Bei Fehler, logge Details
            if response.status_code != 200:
                logger.warning("fetch_google_models: Status %s", response.status_code)
                try:
                    error_data = response.json()
                    error_msg = error_data.get("error", {}).get("message", "Unbekannter Fehler")
                    logger.warning("   Fehlermeldung: %s", error_msg)
                except (ValueError, KeyError):
                    logger.debug("   Response Text: %s", response.text[:500])

            response.raise_for_status()
            data = response.json()

            # Backend gibt möglicherweise direkt models-Array zurück
            if use_backend and "models" in data:
                models_list = data["models"]
            elif "models" in data:
                models_list = data["models"]
            else:
                models_list = []

            models = []
            found_models = set()

            for model in models_list:
                model_name = model.get("name", "")
                # Entferne "models/" Präfix falls vorhanden
                if model_name.startswith("models/"):
                    model_name = model_name.replace("models/", "")

                # Prüfe ob Modell für generateContent verfügbar ist
                supported_methods = model.get("supportedGenerationMethods", [])
                if "generateContent" not in supported_methods:
                    continue

                # Prüfe ob dieses Modell in unserer gewünschten Liste ist
                for desired_name, label in desired_models.items():
                    if desired_name in model_name.lower() and desired_name not in found_models:
                        models.append({"name": model_name, "label": label})
                        found_models.add(desired_name)
                        logger.info("  Modell gefunden: %s -> %s", model_name, label)
                        break

            logger.debug("fetch_google_models: %s Modelle gefunden", len(models))

            # Falls keine Modelle gefunden, verwende Fallback-Liste (nur Gemini 3 Flash)
            if not models:
                logger.debug("fetch_google_models: Keine Modelle gefunden, verwende Fallback")
                return [
                    {"name": "gemini-3-flash-preview", "label": "Gemini 3 Flash"},
                ]

            # Sortiere nach Priorität (nur Flash)
            def sort_key(m):
                name = m["name"].lower()
                if "gemini-3-flash" in name:
                    return 0
                else:
                    return 10

            models.sort(key=sort_key)
            return models[:1]  # Nur ein Modell (Flash)

        except requests.exceptions.HTTPError as e:
            last_error = e
            # Wenn 404 oder 403, versuche nächste URL
            if e.response.status_code in [404, 403]:
                continue
            # Bei anderen HTTP-Fehlern, werfe weiter
            raise
        except Exception as e:
            last_error = e
            continue

    # Wenn alle URLs fehlgeschlagen sind, werfe letzten Fehler
    if last_error:
        error_msg = str(last_error)
        if hasattr(last_error, 'response') and last_error.response is not None:
            try:
                error_data = last_error.response.json()
                error_msg = error_data.get("error", {}).get("message", error_msg)
            except (ValueError, KeyError):
                pass
        raise Exception(f"Google API Fehler: {error_msg}")

    # Fallback: Statische Liste mit nur Gemini 3 Flash
    return [
        {"name": "gemini-3-flash-preview", "label": "Gemini 3 Flash"},
    ]
