"""
AI-Handler für das Anki Chatbot Addon
Implementiert Google Gemini API-Integration
"""

import requests
import json
import time
from .config import (
    get_config, RESPONSE_STYLES, is_backend_mode, get_backend_url,
    get_auth_token, get_refresh_token, update_config
)
from .system_prompt import get_system_prompt

try:
    from .tool_registry import registry as tool_registry
    from .agent_loop import run_agent_loop
except ImportError:
    from tool_registry import registry as tool_registry
    from agent_loop import run_agent_loop

# User-friendly error messages
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
                    print(f"⚠️ Retry {attempt + 1}/{max_retries} nach {delay:.1f}s für Status {response.status_code}")
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
                print(f"⚠️ Retry {attempt + 1}/{max_retries} nach {delay:.1f}s für Netzwerkfehler: {str(e)[:100]}")
                time.sleep(delay)
                delay = min(delay * multiplier, max_delay)
            else:
                # All retries failed
                raise
    
    # Should not reach here, but just in case
    if last_error:
        raise last_error
    raise Exception("Retry failed without error")

# Import Anki's main window for thread-safe UI access
try:
    from aqt import mw
except ImportError:
    mw = None

class AIHandler:
    """Handler für AI-Anfragen (nur Google Gemini)"""
    
    # Phase-Konstanten für strukturierte Status-Updates
    PHASE_INTENT = "intent"
    PHASE_SEARCH = "search"
    PHASE_RETRIEVAL = "retrieval"
    PHASE_GENERATING = "generating"
    PHASE_FINISHED = "finished"
    
    def __init__(self, widget=None):
        self.config = get_config()
        self.widget = widget  # Widget reference for UI state emission
        self._current_request_steps = []  # Track steps for the current request
        self._current_request_id = None
        self._pipeline_signal_callback = None
        self._current_step_labels = []
    
    def _refresh_config(self):
        """Lädt die Config neu, um sicherzustellen dass API-Key aktuell ist"""
        self.config = get_config(force_reload=True)
    
    def _get_auth_headers(self):
        """Gibt Authorization Headers zurück für Backend-Requests"""
        from .config import get_or_create_device_id

        # Immer Device-ID mitsenden als Fallback für Anonymous-Modus
        device_id = get_or_create_device_id()
        headers = {
            "Content-Type": "application/json",
            "X-Device-Id": device_id
        }

        # Proaktiver Token-Refresh vor Ablauf
        self._ensure_valid_token()

        auth_token = get_auth_token()
        if auth_token:
            headers["Authorization"] = f"Bearer {auth_token}"

        return headers
    
    def _refresh_auth_token(self):
        """Ruft Backend Refresh-Endpoint auf und speichert neues Token"""
        try:
            refresh_token = get_refresh_token()
            if not refresh_token:
                print("_refresh_auth_token: Kein Refresh-Token vorhanden")
                return False
            
            backend_url = get_backend_url()
            # Backend-URL ist die Cloud Function Base-URL, Express-Routen haben kein /api/ Präfix
            refresh_url = f"{backend_url}/auth/refresh"
            
            response = requests.post(
                refresh_url,
                json={"refreshToken": refresh_token},
                headers={"Content-Type": "application/json"},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                new_token = data.get("idToken")
                if new_token:
                    update_config(auth_token=new_token)
                    print("_refresh_auth_token: Token erfolgreich erneuert")
                    self._refresh_config()
                    return True
                else:
                    print("_refresh_auth_token: Kein neues Token in Response")
                    return False
            else:
                print(f"_refresh_auth_token: Refresh fehlgeschlagen (Status: {response.status_code})")
                return False
        except Exception as e:
            print(f"_refresh_auth_token: Fehler beim Token-Refresh: {e}")
            return False
    
    def _ensure_valid_token(self):
        """Prüft Token-Gültigkeit und refresht proaktiv vor Ablauf"""
        auth_token = get_auth_token()
        if not auth_token:
            return False

        # Decode JWT payload (ohne Signatur-Validierung) um exp zu prüfen
        try:
            import base64
            # JWT: header.payload.signature
            parts = auth_token.split('.')
            if len(parts) != 3:
                return bool(auth_token)

            # Payload base64url-decodieren
            payload_b64 = parts[1]
            # Padding hinzufügen
            payload_b64 += '=' * (4 - len(payload_b64) % 4)
            payload = json.loads(base64.urlsafe_b64decode(payload_b64))

            exp = payload.get('exp', 0)
            import time
            now = time.time()

            # Token läuft in weniger als 5 Minuten ab → proaktiv refreshen
            if exp - now < 300:
                print(f"🔄 Token läuft in {int(exp - now)}s ab, proaktiver Refresh")
                if self._refresh_auth_token():
                    return True
                # Token abgelaufen und Refresh fehlgeschlagen
                if exp < now:
                    return False
            return True
        except Exception:
            # Bei Decode-Fehler: Token als gültig annehmen, Backend validiert
            return bool(auth_token)
    
    def get_response(self, user_message, context=None, history=None, mode='compact', callback=None, system_prompt_override=None, model_override=None):
        """
        Generiert eine Antwort auf eine Benutzer-Nachricht mit optionalem Streaming

        Args:
            user_message: Die Nachricht des Benutzers
            context: Optionaler Kontext (z.B. aktuelle Karte)
            history: Optional - Liste von vorherigen Nachrichten [{role: 'user'|'assistant', content: 'text'}]
            mode: Optional - 'compact' oder 'detailed' (Standard: 'compact')
            callback: Optional - Funktion(chunk, done, is_function_call=False)
                      - chunk: Text-Chunk oder None
                      - done: True wenn fertig
                      - is_function_call: True wenn Function Call erkannt
            system_prompt_override: Optional - Wenn gesetzt, wird dieser System-Prompt anstatt
                                    get_system_prompt() verwendet (z.B. für Companion/Plusi)

        Returns:
            Die generierte Antwort
        """
        # Lade Config neu um sicherzustellen, dass API-Key aktuell ist
        self._refresh_config()

        if not self.is_configured():
            # Unterschiedliche Fehlermeldungen je nach Modus
            if is_backend_mode():
                error_msg = "Bitte verbinden Sie sich zuerst mit Ihrem Account in den Einstellungen."
            else:
                error_msg = "Bitte konfigurieren Sie zuerst den API-Schlüssel in den Einstellungen."
            if callback:
                callback(error_msg, True, False)
            return error_msg

        model = model_override or self.config.get("model_name", "")
        api_key = self.config.get("api_key", "")

        try:
            # Wenn callback vorhanden, verwende Streaming
            if callback:
                return self._get_google_response_streaming(
                    user_message, model, api_key,
                    context=context, history=history, mode=mode, callback=callback,
                    system_prompt_override=system_prompt_override,
                )
            else:
                # Fallback auf non-streaming für Backward-Kompatibilität
                return self._get_google_response(user_message, model, api_key, context=context, history=history, mode=mode,
                                                  system_prompt_override=system_prompt_override)
        except Exception as e:
            error_msg = f"Fehler bei der API-Anfrage: {str(e)}"
            if callback:
                callback(error_msg, True, False)
            return error_msg
    
    def _get_google_response(self, user_message, model, api_key, context=None, history=None, mode='compact', rag_context=None, system_prompt_override=None):
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
        
        print(f"_get_google_response: Model: {model_normalized}, thinking_level: {thinking_level}")
        
        # Prüfe ob Backend-Modus aktiv ist
        use_backend = is_backend_mode() and get_auth_token()
        
        if use_backend:
            # Backend-Modus: Verwende Backend-URL
            backend_url = get_backend_url()
            # Backend-URL ist die Cloud Function Base-URL, Express-Routen haben kein /api/ Präfix
            urls = [f"{backend_url}/chat"]
            print(f"_get_google_response: Verwende Backend-Modus: {urls[0]}")
        else:
            # Fallback: Direkte Gemini API (API-Key-Modus)
            urls = [
                f"https://generativelanguage.googleapis.com/v1beta/models/{model_normalized}:generateContent?key={api_key}",
                f"https://generativelanguage.googleapis.com/v1/models/{model_normalized}:generateContent?key={api_key}",
            ]
            print(f"_get_google_response: Verwende API-Key-Modus (Fallback)")
        
        # Lade Tool-Einstellungen aus Config
        ai_tools = self.config.get("ai_tools", {
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
            rag_instruction = "\n\nWICHTIG: Du hast Zugriff auf relevante Anki-Karten als Kontext. Verwende diese Informationen, um präzise und fundierte Antworten zu geben. Zitiere IMMER deine Quellen mit dem Format [[CardID]] direkt im Text, wenn du Informationen aus den Karten verwendest."
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
            import re
            
            # Hilfsfunktion zum Bereinigen von HTML
            def clean_html(text, max_len=1500):
                if not text:
                    return ""
                # Entferne HTML-Tags
                clean = re.sub(r'<[^>]+>', ' ', text)
                # Entferne mehrfache Leerzeichen
                clean = re.sub(r'\s+', ' ', clean)
                # Entferne HTML-Entities
                clean = re.sub(r'&[a-zA-Z]+;', ' ', clean)
                clean = clean.strip()
                # Begrenze Länge
                if len(clean) > max_len:
                    clean = clean[:max_len] + "..."
                return clean
            
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
                enhanced_message = f"{enhanced_message}\n\nRelevante Anki-Karten als Kontext:\n{cards_text}\n\nVerwende diese Karten, um die Frage zu beantworten. Zitiere mit [[CardID]] wenn du Informationen aus den Karten verwendest."
        
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
            print(f"_get_google_response: {len(contents)} Nachrichten aus Historie hinzugefügt")
        
        # Füge aktuelle Nachricht hinzu (mit Kontext falls vorhanden)
        contents.append({
            "role": "user",
            "parts": [{"text": enhanced_message}]
        })
        
        # Erstelle Request-Daten für Gemini 3 Preview Modelle
        # Preview-Modelle verwenden systemInstruction im neuen Format
        # CRITICAL: Set max_output_tokens to 8192 for gemini-3-flash-preview to prevent cut-off answers
        max_tokens = 8192 if "gemini-3-flash-preview" in model.lower() else 2000
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
            print(f"_get_google_response: thinking_level={thinking_level} (nicht gesendet, API-Stabilität)")
        
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
            print(f"⚠️ Request zu groß ({total_chars} Zeichen), reduziere Historie")
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
                print(f"_get_google_response: Versuche URL: {url.split('?')[0]}...")
                if use_backend:
                    print(f"_get_google_response: Backend-Modus aktiv")
                    headers = self._get_auth_headers()
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
                    print(f"_get_google_response: Modell: {model_normalized}, API-Key Länge: {len(api_key)}")
                    headers = {"Content-Type": "application/json"}
                    request_data = data
                
                print(f"_get_google_response: Request-Größe: {len(str(request_data))} Zeichen")
                
                # Retry-Logic mit Exponential Backoff für retryable Errors
                def make_request():
                    return requests.post(url, json=request_data, headers=headers, timeout=30)
                
                # Bei 401: Versuche Token-Refresh oder wechsle zu anonymem Modus
                if use_backend:
                    response = make_request()
                    if response.status_code == 401:
                        if retry_count < max_retries:
                            print("_get_google_response: 401 Unauthorized - Versuche Token-Refresh")
                            if self._refresh_auth_token():
                                retry_count += 1
                                headers = self._get_auth_headers()
                                response = make_request()
                                print(f"_get_google_response: Retry nach Token-Refresh - Status: {response.status_code}")
                            else:
                                # Kein Refresh-Token vorhanden - wechsle zu anonymem Modus
                                print("_get_google_response: Kein Refresh-Token - wechsle zu anonymem Modus")
                                update_config(auth_token="")  # Token löschen
                                self._refresh_config()
                                headers = self._get_auth_headers()  # Jetzt mit Device-ID
                                retry_count += 1
                                response = make_request()
                                print(f"_get_google_response: Retry als anonymer User - Status: {response.status_code}")
                        else:
                            # Max Retries erreicht - versuche als anonymer User
                            print("_get_google_response: Max Retries erreicht - versuche als anonymer User")
                            update_config(auth_token="")  # Token löschen
                            self._refresh_config()
                            headers = self._get_auth_headers()  # Jetzt mit Device-ID
                            response = make_request()
                            print(f"_get_google_response: Request als anonymer User - Status: {response.status_code}")
                    else:
                        response = make_request()
                
                # Bei 403 (Forbidden): Quota-Fehler (kein Retry)
                if response.status_code == 403:
                    # #region agent log
                    import time
                    log_path = "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/anki-chatbot-addon/.cursor/debug.log"
                    try:
                        with open(log_path, 'a', encoding='utf-8') as f:
                            f.write(json.dumps({"location": "ai_handler.py:619", "message": "403 QUOTA_EXCEEDED received from backend", "data": {"status_code": response.status_code, "response_text": response.text[:200]}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "A"}) + "\n")
                    except:
                        pass
                    # #endregion
                    try:
                        error_data = response.json()
                        error_code = error_data.get("error", {}).get("code", "QUOTA_EXCEEDED")
                        error_msg = error_data.get("error", {}).get("message", "Quota überschritten")
                        user_msg = get_user_friendly_error(error_code, error_msg)
                        # #region agent log
                        try:
                            with open(log_path, 'a', encoding='utf-8') as f:
                                f.write(json.dumps({"location": "ai_handler.py:624", "message": "Raising QUOTA_EXCEEDED exception", "data": {"error_code": error_code, "error_msg": error_msg, "user_msg": user_msg}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "A"}) + "\n")
                        except:
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
                    print(f"_get_google_response: Retryable Error {response.status_code} - Verwende Retry mit Backoff")
                    response = retry_with_backoff(
                        make_request,
                        max_retries=3,
                        initial_delay=1.0,
                        max_delay=8.0,
                        retryable_status_codes=[429, 500, 502, 503]
                    )
                
                # Logge Status-Code
                print(f"_get_google_response: Response Status: {response.status_code}")
                
                # Bei 400-Fehler, logge die vollständige Fehlermeldung
                if response.status_code == 400:
                    try:
                        error_data = response.json()
                        error_msg = error_data.get("error", {}).get("message", "Unbekannter 400 Fehler")
                        error_details = error_data.get("error", {})
                        print(f"⚠️ 400 Bad Request Fehler:")
                        print(f"   Message: {error_msg}")
                        print(f"   Details: {error_details}")
                        print(f"   Vollständige Response: {response.text[:1000]}")
                    except:
                        print(f"⚠️ 400 Bad Request - Response Text: {response.text[:500]}")
                
                # Bei 500-Fehler, logge die Fehlermeldung bevor raise_for_status() aufgerufen wird
                if response.status_code == 500:
                    try:
                        error_data = response.json()
                        error_msg = error_data.get("error", {}).get("message", "Unbekannter 500 Fehler")
                        error_code = error_data.get("error", {}).get("code", 500)
                        print(f"⚠️ 500 Internal Server Error:")
                        print(f"   Message: {error_msg}")
                        print(f"   Code: {error_code}")
                        print(f"   Response Text: {response.text[:1000]}")
                    except:
                        print(f"⚠️ 500 Internal Server Error - Response Text: {response.text[:500]}")
                
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
                    # Streaming wird in _get_google_response_streaming behandelt
                    raise Exception("Backend-Modus unterstützt nur Streaming. Bitte verwenden Sie get_response() mit callback.")
                
                # Prüfe auf Function Call in der Antwort (nur für API-Key-Modus)
                if "candidates" in result and len(result["candidates"]) > 0:
                    candidate = result["candidates"][0]
                    
                    # Prüfe ob Function Call vorhanden ist
                    if "content" in candidate and "parts" in candidate["content"]:
                        parts = candidate["content"]["parts"]
                        
                        # Suche nach Function Call
                        function_call = None
                        for part in parts:
                            if "functionCall" in part:
                                function_call = part["functionCall"]
                                break
                        
                        # Wenn Function Call vorhanden, führe Tool aus und sende Ergebnis zurück
                        if function_call:
                            function_name = function_call.get("name", "")
                            print(f"🔧 _get_google_response: Function Call erkannt: {function_name}")
                            
                            if function_name:
                                # Führe Tool aus (generisch über Registry)
                                try:
                                    from .tool_executor import execute_tool
                                except ImportError:
                                    from tool_executor import execute_tool
                                tool_result = execute_tool(function_name, function_call.get("args", {}))
                                
                                # Erstelle neuen Request mit Function Response
                                # Füge Function Response zu contents hinzu
                                contents_with_function_response = contents.copy()
                                contents_with_function_response.append({
                                    "role": "model",
                                    "parts": parts  # Original Response mit Function Call
                                })
                                contents_with_function_response.append({
                                    "role": "function",
                                    "parts": [{
                                        "functionResponse": {
                                            "name": function_name,
                                            "response": {
                                                "result": tool_result
                                            }
                                        }
                                    }]
                                })
                                
                                # Erstelle neuen Request für finale Antwort
                                # CRITICAL: Set max_output_tokens to 8192 for gemini-3-flash-preview
                                max_tokens_final = 8192 if "gemini-3-flash-preview" in model.lower() else 2000
                                data_final = {
                                    "contents": contents_with_function_response,
                                    "generationConfig": {
                                        "temperature": 0.7,
                                        "maxOutputTokens": max_tokens_final
                                    }
                                }
                                
                                if system_instruction and system_instruction.strip():
                                    data_final["systemInstruction"] = {
                                        "parts": [{
                                            "text": system_instruction
                                        }]
                                    }
                                
                                if tools_array:
                                    data_final["tools"] = tools_array
                                
                                # Sende Request für finale Antwort
                                print(f"🔧 _get_google_response: Sende Function Response zurück, warte auf finale Antwort...")
                                response_final = requests.post(url, json=data_final, timeout=30)
                                response_final.raise_for_status()
                                result_final = response_final.json()
                                
                                # Extrahiere finale Antwort
                                if "candidates" in result_final and len(result_final["candidates"]) > 0:
                                    candidate_final = result_final["candidates"][0]
                                    if "content" in candidate_final and "parts" in candidate_final["content"]:
                                        if len(candidate_final["content"]["parts"]) > 0:
                                            final_text = candidate_final["content"]["parts"][0].get("text", "")
                                            print(f"✅ _get_google_response: Finale Antwort erhalten, Länge: {len(final_text)}")
                                            return final_text
                                
                                raise Exception("Konnte finale Antwort nach Function Call nicht extrahieren")
                            
                            else:
                                print(f"⚠️ _get_google_response: Unbekanntes Tool: {function_name}")
                                # Fallback: Versuche Text zu extrahieren
                                pass
                        
                        # Kein Function Call - normale Text-Antwort
                        if len(parts) > 0:
                            text_part = parts[0].get("text", "")
                            if text_part:
                                print(f"✅ _get_google_response: Erfolgreich, Antwort-Länge: {len(text_part)}")
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
                            print(f"⚠️ HTTP 400 Fehler: {error_msg} (Code: {error_code})")
                            # Versuche nächste URL wenn Modell-Problem
                            if "model" in error_msg.lower() or "not found" in error_msg.lower():
                                print(f"   → Versuche nächste URL/Modell...")
                                continue
                            else:
                                raise Exception(f"Google API Fehler 400: {error_msg}")
                    except Exception as parse_error:
                        print(f"⚠️ Konnte 400-Fehler nicht parsen: {parse_error}")
                        if hasattr(e, 'response') and e.response:
                            print(f"   Response Text: {e.response.text[:500]}")
                        raise Exception(f"Google API Fehler 400: {str(e)}")
                
                # Bei 500: Versuche Request ohne Historie (Fallback)
                if status_code == 500:
                    # Logge Fehlermeldung wenn verfügbar
                    try:
                        if hasattr(e, 'response') and e.response:
                            error_data = e.response.json()
                            error_msg = error_data.get("error", {}).get("message", "Internal Server Error")
                            print(f"⚠️ 500 Internal Server Error Details: {error_msg}")
                    except:
                        pass
                    
                    # Versuche Retry ohne Historie, wenn Historie vorhanden
                    if history and len(history) > 1:
                        print("⚠️ 500 Fehler - versuche Request ohne Historie als Fallback")
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
                                        print("✅ Retry ohne Historie erfolgreich")
                                        return candidate["content"]["parts"][0].get("text", "")
                        except Exception as retry_error:
                            print(f"⚠️ Retry ohne Historie fehlgeschlagen: {retry_error}")
                            # Versuche nächste URL wenn Retry fehlschlägt
                            continue
                    else:
                        # Keine Historie vorhanden, versuche nächste URL
                        print("⚠️ 500 Fehler ohne Historie - versuche nächste URL")
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
                except:
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
    
    def _get_google_response_streaming(self, user_message, model, api_key, context=None, history=None, mode='compact', callback=None, rag_context=None, suppress_error_callback=False, system_prompt_override=None):
        """
        Google Gemini API mit Streaming-Support und Tool Call Handling
        
        Args:
            callback: Funktion(chunk, done, is_function_call, steps=None, citations=None)
            suppress_error_callback: Wenn True, wird bei Fehlern keine Fehlermeldung an den Callback gesendet (für Retries)
        """
        # CRITICAL: Hardcode to gemini-3-flash-preview for maximum reasoning capability
        # Fallback handled in get_response_with_rag
        if not model:
            model = "gemini-3-flash-preview"
        
        model_normalized = model
        
        # Prüfe ob Backend-Modus aktiv ist
        use_backend = is_backend_mode() and get_auth_token()
        
        if use_backend:
            # Backend-Modus: Verwende Backend-URL
            backend_url = get_backend_url()
            # Backend-URL ist die Cloud Function Base-URL, Express-Routen haben kein /api/ Präfix
            stream_urls = [f"{backend_url}/chat"]
            normal_urls = [f"{backend_url}/chat"]  # Backend unterstützt nur Streaming
            print(f"_get_google_response_streaming: Verwende Backend-Modus: {stream_urls[0]}")
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
            print(f"_get_google_response_streaming: Verwende API-Key-Modus (Fallback)")
        
        # Lade Tool-Einstellungen
        ai_tools = self.config.get("ai_tools", {
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
            rag_instruction = "\n\nWICHTIG: Du hast Zugriff auf relevante Anki-Karten als Kontext. Verwende diese Informationen, um präzise und fundierte Antworten zu geben. Zitiere IMMER deine Quellen mit dem Format [[CardID]] direkt im Text, wenn du Informationen aus den Karten verwendest."
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
            print(f"_get_google_response_streaming: {len(declarations)} Tool(s) aktiviert (mode: {mode})")
        
        # Erweitere Nachricht mit Kontext (gleiche Logik wie _get_google_response)
        enhanced_message = user_message
        has_long_history = history and len(history) > 2
        
        if context:
            import re
            
            def clean_html(text, max_len=1500):
                if not text:
                    return ""
                clean = re.sub(r'<[^>]+>', ' ', text)
                clean = re.sub(r'\s+', ' ', clean)
                clean = re.sub(r'&[a-zA-Z]+;', ' ', clean)
                clean = clean.strip()
                if len(clean) > max_len:
                    clean = clean[:max_len] + "..."
                return clean
            
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
                enhanced_message = f"{enhanced_message}\n\nRelevante Anki-Karten als Kontext:\n{cards_text}\n\nVerwende diese Karten, um die Frage zu beantworten. Zitiere mit [[CardID]] wenn du Informationen aus den Karten verwendest."
        
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
            print(f"_get_google_response_streaming: {len(contents)} Nachrichten aus Historie hinzugefügt")
        
        contents.append({
            "role": "user",
            "parts": [{"text": enhanced_message}]
        })
        
        # Request-Daten
        # CRITICAL: Set max_output_tokens to 8192 for gemini-3-flash-preview to prevent cut-off answers
        max_tokens = 8192 if "gemini-3-flash-preview" in model.lower() else 2000
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
            print(f"⚠️ Request zu groß ({total_chars} Zeichen), reduziere Historie")
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
                stream_fn=self._stream_response,
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
            import traceback
            error_msg = f"Fehler bei Streaming-Request: {str(e)}"
            print(f"⚠️ Streaming-Fehler: {error_msg}")
            print(traceback.format_exc())
            
            # FALLBACK: Versuche non-streaming
            print(f"🔄 Fallback auf non-streaming...")
            try:
                for url in normal_urls:
                    try:
                        print(f"🔄 Fallback: Versuche URL: {url.split('?')[0]}...")
                        response = requests.post(url, json=data, timeout=30)
                        response.raise_for_status()
                        result = response.json()
                        
                        if "candidates" in result and len(result["candidates"]) > 0:
                            candidate = result["candidates"][0]
                            if "content" in candidate and "parts" in candidate["content"]:
                                parts = candidate["content"]["parts"]
                                if len(parts) > 0:
                                    text = parts[0].get("text", "")
                                    print(f"✅ Fallback erfolgreich: {len(text)} Zeichen erhalten")
                                    if callback:
                                        # Sende als einzelne Nachricht (simuliere Streaming für UX)
                                        callback(text, True, False)
                                    return text
                    except Exception as fallback_e:
                        print(f"⚠️ Fallback-URL fehlgeschlagen: {fallback_e}")
                        continue
            except Exception as fallback_error:
                print(f"⚠️ Fallback komplett fehlgeschlagen: {fallback_error}")
            
            # Wenn Fallback auch fehlschlägt, Fehler nur über Exception-Pfad melden.
            # NICHT zusätzlich über callback senden – das führt zu doppelten
            # Fehlermeldungen, weil die Exception in widget.py nochmal per
            # error_signal an das Frontend gesendet wird.
            raise Exception(error_msg)
    
    def _stream_response(self, urls, data, callback=None, use_backend=False, backend_data=None):
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
                print(f"_stream_response: Versuche URL: {url.split('?')[0]}...")
                
                # Bestimme Request-Daten und Headers
                if use_backend:
                    headers = self._get_auth_headers()
                    request_data = backend_data if backend_data else data
                else:
                    headers = {"Content-Type": "application/json"}
                    request_data = data
                
                response = requests.post(url, json=request_data, headers=headers, stream=True, timeout=60)
                
                # Bei 401: Versuche Token-Refresh oder wechsle zu anonymem Modus
                if response.status_code == 401 and use_backend:
                    if retry_count < max_retries:
                        print("_stream_response: 401 Unauthorized - Versuche Token-Refresh")
                        if self._refresh_auth_token():
                            retry_count += 1
                            headers = self._get_auth_headers()
                            response = requests.post(url, json=request_data, headers=headers, stream=True, timeout=60)
                            print(f"_stream_response: Retry nach Token-Refresh - Status: {response.status_code}")
                        else:
                            # Kein Refresh-Token vorhanden - wechsle zu anonymem Modus
                            print("_stream_response: Kein Refresh-Token - wechsle zu anonymem Modus")
                            update_config(auth_token="")  # Token löschen
                            self._refresh_config()
                            headers = self._get_auth_headers()  # Jetzt mit Device-ID
                            retry_count += 1
                            response = requests.post(url, json=request_data, headers=headers, stream=True, timeout=60)
                            print(f"_stream_response: Retry als anonymer User - Status: {response.status_code}")
                    else:
                        # Max Retries erreicht - versuche als anonymer User
                        print("_stream_response: Max Retries erreicht - versuche als anonymer User")
                        update_config(auth_token="")  # Token löschen
                        self._refresh_config()
                        headers = self._get_auth_headers()  # Jetzt mit Device-ID
                        response = requests.post(url, json=request_data, headers=headers, stream=True, timeout=60)
                        print(f"_stream_response: Request als anonymer User - Status: {response.status_code}")
                
                # Bei 403: Quota-Fehler
                if response.status_code == 403:
                    # #region agent log
                    import time
                    log_path = "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/anki-chatbot-addon/.cursor/debug.log"
                    try:
                        with open(log_path, 'a', encoding='utf-8') as f:
                            f.write(json.dumps({"location": "ai_handler.py:1281", "message": "403 QUOTA_EXCEEDED in stream_response", "data": {"status_code": response.status_code}, "timestamp": int(time.time() * 1000), "sessionId": "debug-session", "runId": "run1", "hypothesisId": "A"}) + "\n")
                    except:
                        pass
                    # #endregion
                    try:
                        error_text = response.text[:500]
                        error_data = json.loads(error_text) if error_text.startswith('{') else {}
                        error_msg = error_data.get("error", {}).get("message", "Quota überschritten")
                        raise Exception(f"Quota überschritten: {error_msg}. Bitte upgraden Sie Ihren Plan.")
                    except:
                        raise Exception("Quota überschritten. Bitte upgraden Sie Ihren Plan.")
                
                response.raise_for_status()
                
                # Prüfe Content-Type und erzwinge UTF-8
                content_type = response.headers.get('Content-Type', '')
                print(f"_stream_response: Content-Type: {content_type}")
                response.encoding = 'utf-8'
                
                # Verarbeite Stream - ECHTES STREAMING
                stream_finished = False
                chunk_count = 0
                accumulated_text = ""
                
                # Backend sendet SSE-Format: data: {"text": "..."}
                # Gemini sendet JSON-Array-Stream
                if use_backend:
                    # Backend SSE-Format parsen
                    print("📡 Starte Backend-Stream-Verarbeitung...")
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
                            
                            print(f"📝 Verarbeite Zeile: {line[:100]}...")
                            
                            # SSE-Format: data: {...}
                            if line.startswith('data: '):
                                data_str = line[6:]  # Entferne "data: " Präfix
                                
                                # Prüfe auf [DONE]
                                if data_str == '[DONE]':
                                    print("✅ Stream beendet mit [DONE]")
                                    stream_finished = True
                                    if callback:
                                        callback("", True, False)
                                    return (full_text, None)
                                
                                try:
                                    chunk_data = json.loads(data_str)
                                    print(f"📦 Chunk-Daten geparst: {list(chunk_data.keys())}")
                                    
                                    # Backend-Format: {"text": "..."}
                                    if "text" in chunk_data:
                                        chunk_text = chunk_data["text"]
                                        if chunk_text:
                                            print(f"✅ Text-Chunk erhalten (Länge: {len(chunk_text)})")
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
                                    print(f"⚠️ JSON-Parse-Fehler (ignoriert): {e}, Zeile: {line[:50]}...")
                                    continue
                                except Exception as e:
                                    if "Quota" in str(e) or "Token" in str(e):
                                        raise
                                    print(f"⚠️ Fehler beim Verarbeiten von Backend-Chunk: {e}")
                    except Exception as stream_error:
                        print(f"⚠️ Stream-Fehler: {stream_error}")
                        raise
                    
                    if not chunk_received:
                        print("⚠️ Keine Chunks vom Backend empfangen!")
                    
                    # Stream beendet
                    print(f"📊 Stream beendet - Chunks: {chunk_count}, Text-Länge: {len(full_text)}")
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
                                            print(f"🔧 _stream_response: Function Call im Stream erkannt: {function_call.get('name')}")
                                            
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
                                        print(f"✅ Stream normal beendet (STOP) nach {chunk_count} Chunks")
                                    else:
                                        print(f"⚠️ Stream beendet mit Reason: {finish_reason}")
                                    
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
                            print(f"⚠️ Fehler beim Verarbeiten von Stream-Chunk: {e}")
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
    
    def is_configured(self):
        """Prüft, ob die AI-Konfiguration vollständig ist"""
        # Prüfe Backend-Modus
        if is_backend_mode():
            # Im Backend-Modus: Anonyme User sind erlaubt (Device-ID wird verwendet)
            # Backend-URL wird standardmäßig gesetzt (DEFAULT_BACKEND_URL)
            # Daher ist Backend-Modus immer "konfiguriert", auch ohne Auth-Token
            return True  # Backend-Modus = immer konfiguriert (unterstützt anonyme User)
        # Fallback: API-Key-Modus (benötigt API-Key)
        api_key = self.config.get("api_key", "")
        return bool(api_key.strip())
    
    def get_model_info(self):
        """Gibt Informationen über das konfigurierte Modell zurück"""
        return {
            "provider": "google",
            "model": self.config.get("model_name", "gemini-3-flash-preview"),
            "style": self.config.get("response_style", "balanced")
        }
    
    def get_section_title(self, question, answer=""):
        """
        Generiert einen kurzen Titel (max 5 Wörter) für eine Lernkarte
        
        Args:
            question: Die Frage der Lernkarte (kann HTML enthalten)
            answer: Optional - Die Antwort der Lernkarte
        
        Returns:
            Ein kurzer, aussagekräftiger Titel
        """
        import re
        
        print("=" * 60)
        print("get_section_title: START")
        print("=" * 60)
        
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
        
        print(f"get_section_title: Schritt 1 - HTML-Bereinigung")
        print(f"  Original Frage Länge: {len(question) if question else 0}")
        question_clean = strip_html(question)
        answer_clean = strip_html(answer)
        print(f"  Bereinigte Frage Länge: {len(question_clean) if question_clean else 0}")
        print(f"  Bereinigte Antwort Länge: {len(answer_clean) if answer_clean else 0}")
        
        # Lade Config neu
        print(f"get_section_title: Schritt 2 - Config laden")
        self._refresh_config()
        print(f"  Config neu geladen")
        
        if not self.is_configured():
            print("❌ get_section_title: Kein API-Key konfiguriert")
            return "Lernkarte"
        
        # Wenn nach Bereinigung keine Frage übrig bleibt, Fallback
        if not question_clean or len(question_clean) < 5:
            print(f"❌ get_section_title: Frage zu kurz ({len(question_clean) if question_clean else 0} Zeichen)")
            return "Lernkarte"
        
        print(f"get_section_title: Schritt 3 - API-Key validieren")
        api_key = self.config.get("api_key", "").strip()  # WICHTIG: Trimme API-Key
        print(f"  API-Key Länge nach Trimmen: {len(api_key)}")
        
        # Warnung wenn API-Key zu lang ist
        if len(api_key) > 50:
            print(f"⚠️ get_section_title: API-Key ist sehr lang ({len(api_key)} Zeichen)!")
            print(f"   Erste 30 Zeichen: {api_key[:30]}...")
        
        # Prüfe ob Backend-Modus aktiv ist
        use_backend = is_backend_mode() and get_auth_token()
        
        if not use_backend and not api_key:
            print("❌ get_section_title: API-Key ist leer nach Trimmen")
            return "Lernkarte"
        
        # IMMER Gemini 2.0 Flash für Titel (schneller, günstiger, stabiler als Preview)
        # Gemini 3 Preview ist für Chat, aber für einfache Titel ist 2.0 besser
        model = "gemini-2.5-flash"
        print(f"  Verwende für Titel-Generierung: {model} (immer 2.0 Flash für Stabilität)")
        
        print(f"get_section_title: Schritt 4 - Request vorbereiten")
        print(f"  Modell: {model}")
        if not use_backend:
            print(f"  API-Key Länge: {len(api_key)}")
        print(f"  Frage-Länge: {len(question_clean)}")
        print(f"  Frage-Inhalt (erste 100 Zeichen): {question_clean[:100]}...")
        
        # Erstelle Prompt für kurzen Titel - EINFACHER
        prompt = f"""Erstelle einen Kurztitel (2-4 Wörter) für diese Lernkarte. Nur den Titel, nichts anderes.

Karteninhalt: {question_clean[:500]}"""
        
        if use_backend:
            # Backend-Modus: Verwende Backend-URL
            backend_url = get_backend_url()
            url = f"{backend_url}/chat"
            print(f"  URL: {url}")
            
            # Backend-Format: message, model, mode, stream=false für non-streaming
            backend_data = {
                "message": prompt,
                "model": model,
                "mode": "compact",
                "history": [],
                "stream": False  # Non-streaming für Titel-Generierung
            }
            headers = self._get_auth_headers()
        else:
            # Fallback: Direkte Gemini API (API-Key-Modus)
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
            print(f"  URL (ohne Key): {url.split('?')[0]}...")
            
            data = {
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": 0.1,
                    "maxOutputTokens": 20
                }
            }
            backend_data = None
            headers = {"Content-Type": "application/json"}
        
        print(f"  Request-Daten Größe: {len(str(backend_data if use_backend else data))} Zeichen")
        print(f"  Prompt Länge: {len(prompt)} Zeichen")
        
        try:
            print(f"get_section_title: Schritt 5 - API-Request senden")
            print(f"  Sende Request an {model}...")
            if use_backend:
                response = requests.post(url, json=backend_data, headers=headers, timeout=15)
            else:
                response = requests.post(url, json=data, headers=headers, timeout=15)
            print(f"  Response Status: {response.status_code}")
            print(f"  Response Headers: {dict(response.headers)}")
            
            if response.status_code != 200:
                print(f"❌ get_section_title: Fehler Status {response.status_code}")
                print(f"  Vollständige Response:")
                print(f"  {response.text}")
                try:
                    error_data = response.json()
                    print(f"  Parsed Error Data: {error_data}")
                    error_msg = error_data.get("error", {}).get("message", "Unbekannter Fehler")
                    error_code = error_data.get("error", {}).get("code", response.status_code)
                    print(f"  Fehlercode: {error_code}")
                    print(f"  Fehlermeldung: {error_msg}")
                except Exception as parse_error:
                    print(f"  Konnte Response nicht als JSON parsen: {parse_error}")
                    print(f"  Response Text (erste 1000 Zeichen): {response.text[:1000]}")
                return "Lernkarte"
            
            print(f"get_section_title: Schritt 6 - Response parsen")
            try:
                result = response.json()
                print(f"  Response JSON Keys: {list(result.keys())}")
            except Exception as json_error:
                print(f"❌ get_section_title: Konnte Response nicht als JSON parsen: {json_error}")
                print(f"  Response Text: {response.text[:1000]}")
                return "Lernkarte"
            
            print(f"get_section_title: Schritt 7 - Response validieren")
            
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
                    print(f"❌ get_section_title: Konnte Titel nicht aus Backend-Response extrahieren")
                    print(f"  Response Struktur: {list(result.keys())}")
                    print(f"  Vollständige Response: {result}")
                    return "Lernkarte"
            else:
                # Direkte Gemini API
                if "candidates" not in result:
                    print(f"❌ get_section_title: Kein 'candidates' Feld in Response")
                    print(f"  Response Struktur: {list(result.keys())}")
                    print(f"  Vollständige Response: {result}")
                    return "Lernkarte"
                
                if len(result["candidates"]) == 0:
                    print(f"❌ get_section_title: 'candidates' Array ist leer")
                    print(f"  Response: {result}")
                    return "Lernkarte"
                
                candidate = result["candidates"][0]
                print(f"  Candidate Keys: {list(candidate.keys()) if isinstance(candidate, dict) else 'Nicht ein Dict'}")
                
                if "content" not in candidate:
                    print(f"❌ get_section_title: Kein 'content' Feld in Candidate")
                    print(f"  Candidate: {candidate}")
                    return "Lernkarte"
                
                if "parts" not in candidate["content"]:
                    print(f"❌ get_section_title: Kein 'parts' Feld in Content")
                    print(f"  Content: {candidate['content']}")
                    return "Lernkarte"
                
                if len(candidate["content"]["parts"]) == 0:
                    print(f"❌ get_section_title: 'parts' Array ist leer")
                    print(f"  Content: {candidate['content']}")
                    return "Lernkarte"
                
                title = candidate["content"]["parts"][0].get("text", "").strip()
            
            print(f"get_section_title: Schritt 8 - Titel extrahieren")
            print(f"  Roher Titel: '{title}' (Länge: {len(title)})")
            
            if not title:
                print(f"❌ get_section_title: Titel ist leer nach Extraktion")
                return "Lernkarte"
            
            # Entferne Anführungszeichen falls vorhanden
            title = title.strip('"\'')
            # Entferne Zeilenumbrüche
            title = title.replace('\n', ' ').strip()
            # Begrenze auf max 50 Zeichen
            if len(title) > 50:
                title = title[:47] + "..."
            
            print(f"✅ get_section_title: Titel erfolgreich generiert: '{title}'")
            print("=" * 60)
            return title if title else "Lernkarte"
            
        except requests.exceptions.RequestException as e:
            import traceback
            print(f"❌ get_section_title: Request Exception: {e}")
            print(f"  Exception Type: {type(e).__name__}")
            print(traceback.format_exc())
            return "Lernkarte"
        except Exception as e:
            import traceback
            print(f"❌ get_section_title: Unerwartete Exception: {e}")
            print(f"  Exception Type: {type(e).__name__}")
            print(traceback.format_exc())
            return "Lernkarte"
    
    def fetch_available_models(self, provider, api_key):
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
            print("fetch_available_models: Kein API-Key vorhanden")
            return []
        
        # Warnung wenn API-Key zu lang ist
        if len(api_key) > 50:
            print(f"⚠️ WARNUNG: API-Key ist sehr lang ({len(api_key)} Zeichen). Erste 20 Zeichen: {api_key[:20]}...")
            # Versuche nur die ersten 50 Zeichen (falls versehentlich mehr eingegeben wurde)
            if len(api_key) > 100:
                print(f"⚠️ API-Key scheint falsch zu sein. Versuche nur ersten Teil...")
                api_key = api_key[:50].strip()
        
        try:
            return self._fetch_google_models(api_key)
        except Exception as e:
            import traceback
            error_msg = str(e)
            print(f"Fehler beim Abrufen der Modelle: {error_msg}")
            print(traceback.format_exc())
            # Gib leere Liste zurück, damit Frontend Fallback verwenden kann
            return []
    
    def _fetch_google_models(self, api_key):
        """Ruft Google-Modelle ab"""
        # Prüfe ob Backend-Modus aktiv ist
        use_backend = is_backend_mode() and get_auth_token()
        
        if use_backend:
            # Backend-Modus: Verwende Backend-URL
            backend_url = get_backend_url()
            urls = [f"{backend_url}/models"]
            print(f"_fetch_google_models: Verwende Backend-Modus: {urls[0]}")
            headers = self._get_auth_headers()
        else:
            # Fallback: Direkte Gemini API (API-Key-Modus)
            api_key = api_key.strip()
            print(f"_fetch_google_models: API-Key Länge: {len(api_key)}")
            if len(api_key) > 50:
                print(f"⚠️ WARNUNG: API-Key ist sehr lang! Erste 30 Zeichen: {api_key[:30]}...")
                print(f"⚠️ Normalerweise sind Google API-Keys ~39 Zeichen lang")
            
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
                print(f"_fetch_google_models: Versuche URL: {url.split('?')[0]}...")
                if use_backend:
                    response = requests.get(url, headers=headers, timeout=10)
                else:
                    response = requests.get(url, timeout=10)
                print(f"_fetch_google_models: Response Status: {response.status_code}")
                
                # Bei Fehler, logge Details
                if response.status_code != 200:
                    print(f"⚠️ _fetch_google_models: Status {response.status_code}")
                    try:
                        error_data = response.json()
                        error_msg = error_data.get("error", {}).get("message", "Unbekannter Fehler")
                        print(f"   Fehlermeldung: {error_msg}")
                    except:
                        print(f"   Response Text: {response.text[:500]}")
                
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
                            print(f"  ✓ Modell gefunden: {model_name} -> {label}")
                            break
                
                print(f"_fetch_google_models: {len(models)} Modelle gefunden")
                
                # Falls keine Modelle gefunden, verwende Fallback-Liste (nur Gemini 3 Flash)
                if not models:
                    print("_fetch_google_models: Keine Modelle gefunden, verwende Fallback")
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
                except:
                    pass
            raise Exception(f"Google API Fehler: {error_msg}")
        
        # Fallback: Statische Liste mit nur Gemini 3 Flash
        return [
            {"name": "gemini-3-flash-preview", "label": "Gemini 3 Flash"},
        ]
    
    def _emit_ai_state(self, message, phase=None, metadata=None):
        """
        Sendet AI-State-Updates an das Frontend und speichert sie für die Historie
        
        Thread-safe: Verwendet mw.taskman.run_on_main() um sicherzustellen,
        dass JavaScript-Aufrufe auf dem Hauptthread ausgeführt werden.
        
        Args:
            message: Die State-Nachricht (z.B. "Analysiere Anfrage...")
            phase: Optional - Phase-Konstante (PHASE_INTENT, PHASE_SEARCH, etc.)
            metadata: Optional - Dict mit Metadaten (mode, sourceCount, intent, scope)
        """
        # Track step for persistence (always — needed for query data parsing)
        import time
        step = {
            "state": message,
            "timestamp": time.time() * 1000,  # milliseconds
            "phase": phase,
            "metadata": metadata or {}
        }
        self._current_request_steps.append(step)

        # When new pipeline is active, don't send ai_state to frontend
        # (pipeline_step events handle the UI now; ai_state only logs internally)
        req_id = getattr(self, '_current_request_id', None)
        if req_id:
            print(f"🔇 _emit_ai_state SUPPRESSED (pipeline active, reqId={req_id[:8]}): {message[:50]}")
            return
        else:
            print(f"📡 _emit_ai_state SENDING (no pipeline): {message[:50]}")

        if not self.widget or not self.widget.web_view:
            return

        # Thread-safe: Führe JavaScript-Aufruf auf dem Hauptthread aus
        if mw and mw.taskman:
            def emit_on_main():
                try:
                    payload = {
                        "type": "ai_state", 
                        "message": message,
                        "phase": phase,
                        "metadata": metadata or {}
                    }
                    js_code = f"window.ankiReceive({json.dumps(payload)});"
                    self.widget.web_view.page().runJavaScript(js_code)
                    print(f"📡 RAG State: {message} (phase: {phase})")
                    # Process events immediately to ensure UI updates
                    from aqt.qt import QApplication
                    app = QApplication.instance()
                    if app:
                        app.processEvents()
                except Exception as e:
                    print(f"⚠️ Fehler beim Senden von AI-State: {e}")
            
            mw.taskman.run_on_main(emit_on_main)
        else:
            # Fallback: Direkter Aufruf (nur wenn mw nicht verfügbar ist)
            # Dies sollte nur in Tests oder wenn nicht in Anki-Umgebung passieren
            try:
                payload = {
                    "type": "ai_state", 
                    "message": message,
                    "phase": phase,
                    "metadata": metadata or {}
                }
                js_code = f"window.ankiReceive({json.dumps(payload)});"
                self.widget.web_view.page().runJavaScript(js_code)
                print(f"📡 RAG State: {message} (phase: {phase})")
            except Exception as e:
                print(f"⚠️ Fehler beim Senden von AI-State: {e}")

    def _emit_pipeline_step(self, step, status, data=None):
        """Emit a pipeline_step event to the frontend via Qt signal.

        Uses _pipeline_signal_callback (set by AIRequestThread) for real-time
        event delivery instead of mw.taskman.run_on_main which batches events.
        """
        # Record step label for persistence (only on 'done')
        if status == 'done':
            label = self._step_done_label(step, data)
            self._current_step_labels.append(label)

        # Emit via Qt signal callback (set by AIRequestThread)
        callback = getattr(self, '_pipeline_signal_callback', None)
        if callback:
            try:
                callback(step, status, data)
            except Exception as e:
                print(f"⚠️ _emit_pipeline_step error: {e}")

    def _step_done_label(self, step, data):
        """Generate a human-readable label for a completed step."""
        data = data or {}
        if step == 'router':
            mode = data.get('retrieval_mode', '')
            scope = data.get('scope_label', '')
            return f"Anfrage analysiert — {mode.capitalize()}, {scope}" if scope else f"Anfrage analysiert — {mode.capitalize()}"
        elif step == 'sql_search':
            return f"Keyword-Suche — {data.get('total_hits', 0)} Treffer"
        elif step == 'semantic_search':
            return f"Semantische Suche — {data.get('total_hits', 0)} Treffer"
        elif step == 'merge':
            t = data.get('total', 0)
            k = data.get('keyword_count', 0)
            s = data.get('semantic_count', 0)
            return f"Quellen kombiniert — {t} ({k}K + {s}S)"
        elif step == 'generating':
            return "Antwort generiert"
        return step

    def _rag_router(self, user_message, context=None):
        """
        Stage 1: Router - Analysiert die Anfrage und entscheidet ob und wie gesucht werden soll.

        Args:
            user_message: Die Benutzer-Nachricht
            context: Optionaler Kontext (z.B. aktuelle Karte)

        Returns:
            Dict mit search_needed, retrieval_mode, embedding_query, precise_queries, broad_queries, search_scope
            Oder None bei Fehler (dann wird search_needed=False angenommen)
        """
        try:
            self._refresh_config()

            # Prüfe ob Backend-Modus aktiv ist
            use_backend = is_backend_mode() and get_auth_token()
            if not use_backend:
                api_key = self.config.get("api_key", "")
                if not api_key:
                    return None
            else:
                api_key = ""  # Nicht benötigt im Backend-Modus

            # Router-Modell: gemini-2.5-flash (schnell, direkte API ~1s)
            # Fallback: gemini-3-flash-preview
            router_model = "gemini-2.5-flash"
            fallback_model = "gemini-3-flash-preview"

            # Emit pipeline step
            self._emit_pipeline_step("router", "active")

            # Fetch lastAssistantMessage from session storage
            last_assistant_message = ""
            try:
                try:
                    from . import card_sessions_storage
                except ImportError:
                    import card_sessions_storage
                if context and context.get('cardId'):
                    session_data = card_sessions_storage.load_card_session(context['cardId'])
                    messages = session_data.get('messages', [])
                    for msg in reversed(messages):
                        if msg.get('sender') == 'bot':
                            last_assistant_message = (msg.get('text', '') or '')[:300]
                            break
            except Exception:
                pass

            # Extrahiere Karteninhalt
            import re
            card_question = ""
            card_answer = ""
            deck_name = ""
            extra_fields = ""

            if context:
                question_raw = context.get('question') or context.get('frontField') or ""
                answer_raw = context.get('answer') or ""
                deck_name = context.get('deckName') or ""
                fields = context.get('fields', {})

                if question_raw:
                    card_question = re.sub(r'<[^>]+>', ' ', question_raw)
                    card_question = re.sub(r'\s+', ' ', card_question).strip()[:500]
                if answer_raw:
                    card_answer = re.sub(r'<[^>]+>', ' ', answer_raw)
                    card_answer = re.sub(r'\s+', ' ', card_answer).strip()[:500]

                # Wichtige Felder hinzufügen (falls vorhanden)
                if fields:
                    extra_lines = []
                    for field_name, field_value in list(fields.items())[:3]:
                        if field_value and field_name not in ['question', 'answer', 'Front', 'Back']:
                            field_clean = re.sub(r'<[^>]+>', ' ', str(field_value))
                            field_clean = re.sub(r'\s+', ' ', field_clean).strip()
                            if field_clean and len(field_clean) > 10:
                                extra_lines.append(f"- {field_name}: {field_clean[:200]}")
                    if extra_lines:
                        extra_fields = "\n".join(extra_lines)

            # Extract card tags
            card_tags = []
            if context and context.get('tags'):
                card_tags = context['tags']
            elif context and context.get('cardId'):
                try:
                    from aqt import mw
                    card = mw.col.get_card(context['cardId'])
                    note = card.note()
                    card_tags = list(note.tags)
                except Exception:
                    pass

            # Debug-Logging
            print(f"🔍 Router: user_message='{user_message[:100]}', has_context={bool(context)}, deck={deck_name}, tags={card_tags[:5]}")

            router_prompt = f"""Du bist ein Such-Router für eine Lernkarten-App. Entscheide ob und wie gesucht werden soll.

Benutzer-Nachricht: "{user_message}"
{f'Letzte Antwort: "{last_assistant_message[:200]}"' if last_assistant_message else ''}

Karten-Kontext:
- Frage: {card_question}
- Antwort: {card_answer}
- Deck: {deck_name}
- Tags: {', '.join(card_tags) if card_tags else 'keine'}
{extra_fields}

Antworte NUR mit JSON:
{{
  "search_needed": true/false,
  "retrieval_mode": "sql" | "semantic" | "both",
  "embedding_query": "semantisch reicher Suchtext aus Kartenkontext + Frage synthetisiert",
  "precise_queries": ["keyword1 AND keyword2", ...],
  "broad_queries": ["keyword1 OR keyword2", ...],
  "search_scope": "current_deck" | "collection"
}}

REGELN:
- search_needed=false bei Smalltalk, Danke, Meta-Fragen
- embedding_query: Synthese aus Karteninhalt + Benutzerfrage. NIEMALS die Benutzerfrage wörtlich verwenden.
  Beispiel: Frage="Was ist das?", Karte="Mitochondrium" → embedding_query="Mitochondrium Zellatmung Organell Funktion"
- precise_queries: 2-3 AND-Queries aus Karten-Keywords (nicht aus Benutzerfrage)
- broad_queries: 2-3 OR-Queries für breitere Suche
- search_scope: "current_deck" als Default, "collection" nur bei fächerübergreifenden Fragen
- retrieval_mode: "both" als Default, "sql" für exakte Fakten, "semantic" für konzeptuelle Fragen"""

            # Backend-Modus: Router über Cloud Function (API-Key serverseitig)
            if use_backend:
                try:
                    backend_url = get_backend_url()
                    auth_token = get_auth_token()
                    router_url = f"{backend_url}/router"
                    router_headers = {
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {auth_token}"
                    }
                    card_context = None
                    if context:
                        card_context = {
                            "question": context.get('question') or context.get('frontField') or "",
                            "answer": context.get('answer') or "",
                            "deckName": context.get('deckName') or "",
                            "tags": card_tags
                        }
                    router_payload = {
                        "message": user_message,
                        "lastAssistantMessage": last_assistant_message
                    }
                    if card_context:
                        router_payload["cardContext"] = card_context

                    print(f"🔍 Router: Backend-Aufruf an {router_url}")
                    response = requests.post(router_url, json=router_payload, headers=router_headers, timeout=15)
                    response.raise_for_status()
                    router_result = response.json()

                    if router_result.get("search_needed") is not None:
                        print(f"✅ Router (Backend): search_needed={router_result.get('search_needed')}")
                        # Weiter zur Validierung unten (gleicher Code wie bei direkter API)
                except Exception as be:
                    print(f"⚠️ Router: Backend-Fehler: {be}, Fallback auf direkte API")
                    use_backend = False

            # Wenn Backend erfolgreich war, überspringe direkte API
            if use_backend and 'router_result' in locals() and router_result and router_result.get("search_needed") is not None:
                # Validierung des Backend-Ergebnisses
                retrieval_mode = router_result.get('retrieval_mode', 'both')
                if retrieval_mode not in ('sql', 'semantic', 'both'):
                    retrieval_mode = 'both'
                router_result['retrieval_mode'] = retrieval_mode

                precise_queries = router_result.get("precise_queries", [])
                broad_queries = router_result.get("broad_queries", [])
                if not isinstance(precise_queries, list):
                    precise_queries = []
                if not isinstance(broad_queries, list):
                    broad_queries = []
                while len(precise_queries) < 3:
                    precise_queries.append("")
                while len(broad_queries) < 3:
                    broad_queries.append("")
                router_result["precise_queries"] = precise_queries[:3]
                router_result["broad_queries"] = broad_queries[:3]

                # Emit pipeline done
                scope_label = ""
                if deck_name:
                    scope_label = deck_name.split("::")[-1]
                self._emit_pipeline_step("router", "done", {
                    "search_needed": router_result.get("search_needed", True),
                    "retrieval_mode": retrieval_mode,
                    "scope": router_result.get("search_scope", "current_deck"),
                    "scope_label": scope_label
                })

                print(f"✅ Router (Backend): search_needed={router_result.get('search_needed')}, retrieval_mode={retrieval_mode}")
                return router_result

            # Direkter Gemini API Modus (Fallback oder wenn kein Backend)
            router_api_key = api_key or self.config.get("api_key", "")
            if not router_api_key:
                print("⚠️ Router: Kein API-Key verfügbar, überspringe direkte API")
                return None

            url_model_pairs = [
                (f"https://generativelanguage.googleapis.com/v1beta/models/{router_model}:generateContent?key={router_api_key}", router_model),
                (f"https://generativelanguage.googleapis.com/v1beta/models/{fallback_model}:generateContent?key={router_api_key}", fallback_model),
            ]
            headers = {"Content-Type": "application/json"}
            print(f"🔍 Router: Direkter Gemini API Aufruf, Models: [{router_model}, {fallback_model}]")
            data = {
                "contents": [{"role": "user", "parts": [{"text": router_prompt}]}],
                "generationConfig": {
                    "temperature": 0.1,
                    "maxOutputTokens": 500,
                    "responseMimeType": "application/json"
                }
            }

            last_error = None
            for url, current_model in url_model_pairs:
                try:
                    # Direkte Gemini API
                    print(f"🔍 Router: Direkter API-Aufruf an {current_model}")
                    response = requests.post(url, json=data, headers=headers, timeout=10)
                    response.raise_for_status()
                    result = response.json()

                    if "error" in result:
                        continue

                    if "candidates" in result and len(result["candidates"]) > 0:
                        candidate = result["candidates"][0]
                        if "content" in candidate and "parts" in candidate["content"]:
                            parts = candidate["content"]["parts"]
                            if len(parts) > 0:
                                text = parts[0].get("text", "")

                                # Parse JSON (kann in Code-Block sein)
                                import re
                                # Entferne Markdown-Code-Blöcke falls vorhanden
                                text = re.sub(r'```json\s*', '', text)
                                text = re.sub(r'```\s*', '', text)
                                # Erweitertes Pattern für strategies Array
                                json_match = re.search(r'\{.*?"search_needed".*?\}', text, re.DOTALL)
                                if json_match:
                                    text = json_match.group(0)

                                # Bereinige JSON: Entferne trailing commas
                                # Pattern: Komma gefolgt von } oder ]
                                text = re.sub(r',(\s*[}\]])', r'\1', text)

                                try:
                                    router_result = json.loads(text)
                                except json.JSONDecodeError as json_err:
                                    print(f"⚠️ Router: JSON-Parse-Fehler nach Bereinigung: {json_err}, Text: {text[:300]}")
                                    # Versuche nochmal mit strikterer Bereinigung
                                    # Entferne alle Kommentare (nicht standard JSON)
                                    text = re.sub(r'//.*?$', '', text, flags=re.MULTILINE)
                                    text = re.sub(r'/\*.*?\*/', '', text, flags=re.DOTALL)
                                    # Entferne trailing commas nochmal
                                    text = re.sub(r',(\s*[}\]])', r'\1', text)

                                    # Versuche unvollständiges JSON zu reparieren
                                    try:
                                        router_result = json.loads(text)
                                    except json.JSONDecodeError as json_err2:
                                        # Zähle öffnende und schließende Klammern
                                        open_braces = text.count('{')
                                        close_braces = text.count('}')
                                        open_brackets = text.count('[')
                                        close_brackets = text.count(']')

                                        # Füge fehlende schließende Klammern hinzu
                                        if open_braces > close_braces:
                                            text += '\n' + '}' * (open_braces - close_braces)
                                        if open_brackets > close_brackets:
                                            text += '\n' + ']' * (open_brackets - close_brackets)

                                        try:
                                            router_result = json.loads(text)
                                            print(f"✅ Router: Unvollständiges JSON repariert")
                                        except json.JSONDecodeError:
                                            # Letzter Versuch: Extrahiere precise_queries und broad_queries falls vorhanden
                                            precise_match = re.search(r'"precise_queries"\s*:\s*\[(.*?)\]', text, re.DOTALL)
                                            broad_match = re.search(r'"broad_queries"\s*:\s*\[(.*?)\]', text, re.DOTALL)
                                            if precise_match or broad_match:
                                                # Extrahiere Queries aus Arrays
                                                precise_queries = []
                                                broad_queries = []

                                                if precise_match:
                                                    precise_text = precise_match.group(1)
                                                    precise_items = re.findall(r'"([^"]+)"', precise_text)
                                                    precise_queries = precise_items[:3]

                                                if broad_match:
                                                    broad_text = broad_match.group(1)
                                                    broad_items = re.findall(r'"([^"]+)"', broad_text)
                                                    broad_queries = broad_items[:3]

                                                if precise_queries or broad_queries:
                                                    router_result = {
                                                        "search_needed": True,
                                                        "retrieval_mode": "both",
                                                        "embedding_query": "",
                                                        "precise_queries": precise_queries if precise_queries else [],
                                                        "broad_queries": broad_queries if broad_queries else [],
                                                        "search_scope": "current_deck"
                                                    }
                                                    print(f"✅ Router: Queries aus unvollständigem JSON extrahiert: {len(precise_queries)} precise, {len(broad_queries)} broad")
                                                else:
                                                    raise json_err
                                            else:
                                                raise json_err

                                # Validiere Struktur
                                if "search_needed" in router_result:
                                    # Extract and validate retrieval_mode
                                    retrieval_mode = router_result.get('retrieval_mode', 'both')
                                    if retrieval_mode not in ('sql', 'semantic', 'both'):
                                        retrieval_mode = 'both'
                                    router_result['retrieval_mode'] = retrieval_mode

                                    # Extract embedding_query
                                    embedding_query = router_result.get("embedding_query", "")

                                    # Validiere precise_queries und broad_queries
                                    precise_queries = router_result.get("precise_queries", [])
                                    broad_queries = router_result.get("broad_queries", [])

                                    if not isinstance(precise_queries, list):
                                        precise_queries = []
                                    if not isinstance(broad_queries, list):
                                        broad_queries = []

                                    # Stelle sicher dass wir mindestens 3 Queries haben
                                    while len(precise_queries) < 3:
                                        precise_queries.append("")
                                    while len(broad_queries) < 3:
                                        broad_queries.append("")

                                    precise_queries = precise_queries[:3]
                                    broad_queries = broad_queries[:3]

                                    router_result["precise_queries"] = precise_queries
                                    router_result["broad_queries"] = broad_queries
                                    router_result["embedding_query"] = embedding_query

                                    # Remove legacy intent field if present
                                    router_result.pop("intent", None)
                                    router_result.pop("reasoning", None)

                                    # KRITISCHE VALIDIERUNG: Prüfe ob Queries die Nutzeranfrage wörtlich enthalten
                                    if precise_queries or broad_queries:
                                        print(f"🔍 Router: Validiere {len(precise_queries)} precise_queries und {len(broad_queries)} broad_queries")
                                        user_message_clean = user_message.lower().strip()
                                        user_words = set(user_message_clean.split())
                                        corrected_precise = []
                                        corrected_broad = []

                                        # Validiere precise_queries
                                        for i, query in enumerate(precise_queries):
                                            if not query or not query.strip():
                                                continue
                                            print(f"🔍 Router: Precise Query {i+1}: '{query[:80]}'")
                                            query_lower = query.lower().strip()
                                            query_clean = query_lower.rstrip('.').rstrip('\u2026').rstrip('...')

                                            contains_user_message = user_message_clean in query_clean or query_clean in user_message_clean
                                            query_words = set(query_clean.split())
                                            overlap = user_words.intersection(query_words)

                                            if contains_user_message or (len(overlap) >= 3 and len(user_words) <= 15):
                                                print(f"⚠️ Router: Precise Query enthält Nutzeranfrage wörtlich: '{query[:100]}'")
                                                if context:
                                                    question = context.get('question') or context.get('frontField') or ""
                                                    answer = context.get('answer') or ""

                                                    import re
                                                    card_text = f"{question} {answer}".lower()
                                                    card_text = re.sub(r'<[^>]+>', ' ', card_text)
                                                    card_text = re.sub(r'[^\w\s]', ' ', card_text)
                                                    card_words = card_text.split()

                                                    stopwords = {'der', 'die', 'das', 'und', 'oder', 'ist', 'sind', 'wird', 'werden', 'auf', 'in', 'zu', 'für', 'mit', 'von', 'ein', 'eine', 'einer', 'einem', 'einen', 'mir', 'dir', 'uns', 'ihr', 'ihm', 'sie', 'er', 'es', 'diese', 'dieser', 'dieses', 'diesen', 'dem', 'den', 'des'}
                                                    important_words = [w for w in card_words if len(w) > 3 and w not in stopwords]

                                                    from collections import Counter
                                                    word_freq = Counter(important_words)
                                                    top_words = [word for word, count in word_freq.most_common(3)]

                                                    if top_words:
                                                        new_query = " AND ".join(top_words)
                                                        print(f"✅ Router: Korrigiere Precise Query zu: '{new_query}'")
                                                        corrected_precise.append(new_query)
                                                    else:
                                                        corrected_precise.append(query)
                                                else:
                                                    corrected_precise.append(query)
                                            else:
                                                corrected_precise.append(query)

                                        # Validiere broad_queries
                                        for i, query in enumerate(broad_queries):
                                            if not query or not query.strip():
                                                continue
                                            print(f"🔍 Router: Broad Query {i+1}: '{query[:80]}'")
                                            query_lower = query.lower().strip()
                                            query_clean = query_lower.rstrip('.').rstrip('\u2026').rstrip('...')

                                            contains_user_message = user_message_clean in query_clean or query_clean in user_message_clean
                                            query_words = set(query_clean.split())
                                            overlap = user_words.intersection(query_words)
                                            is_or_expansion = all(word in user_words or word == 'or' for word in query_words) and 'or' in query_clean

                                            if contains_user_message or (len(overlap) >= 3 and len(user_words) <= 15) or is_or_expansion:
                                                print(f"⚠️ Router: Broad Query enthält Nutzeranfrage wörtlich: '{query[:100]}'")
                                                if context:
                                                    question = context.get('question') or context.get('frontField') or ""
                                                    answer = context.get('answer') or ""

                                                    import re
                                                    card_text = f"{question} {answer}".lower()
                                                    card_text = re.sub(r'<[^>]+>', ' ', card_text)
                                                    card_text = re.sub(r'[^\w\s]', ' ', card_text)
                                                    card_words = card_text.split()

                                                    stopwords = {'der', 'die', 'das', 'und', 'oder', 'ist', 'sind', 'wird', 'werden', 'auf', 'in', 'zu', 'für', 'mit', 'von', 'ein', 'eine', 'einer', 'einem', 'einen', 'mir', 'dir', 'uns', 'ihr', 'ihm', 'sie', 'er', 'es', 'diese', 'dieser', 'dieses', 'diesen', 'dem', 'den', 'des'}
                                                    important_words = [w for w in card_words if len(w) > 3 and w not in stopwords]

                                                    from collections import Counter
                                                    word_freq = Counter(important_words)
                                                    top_words = [word for word, count in word_freq.most_common(5)]

                                                    if top_words:
                                                        new_query = " OR ".join(top_words)
                                                        print(f"✅ Router: Korrigiere Broad Query zu: '{new_query}'")
                                                        corrected_broad.append(new_query)
                                                    else:
                                                        corrected_broad.append(query)
                                                else:
                                                    corrected_broad.append(query)
                                            else:
                                                corrected_broad.append(query)

                                        # Stelle sicher dass wir 3 Queries haben
                                        while len(corrected_precise) < 3:
                                            corrected_precise.append("")
                                        while len(corrected_broad) < 3:
                                            corrected_broad.append("")

                                        router_result["precise_queries"] = corrected_precise[:3]
                                        router_result["broad_queries"] = corrected_broad[:3]

                                        print(f"✅ Router: Validierung abgeschlossen: {len([q for q in corrected_precise if q])} precise, {len([q for q in corrected_broad if q])} broad")

                                    # Emit pipeline done
                                    scope_label = ""
                                    if deck_name:
                                        scope_label = deck_name.split("::")[-1]
                                    self._emit_pipeline_step("router", "done", {
                                        "search_needed": router_result.get("search_needed", True),
                                        "retrieval_mode": retrieval_mode,
                                        "scope": router_result.get("search_scope", "current_deck"),
                                        "scope_label": scope_label
                                    })

                                    # Finale Log-Ausgabe
                                    print(f"✅ Router: search_needed={router_result.get('search_needed')}, retrieval_mode={retrieval_mode}, embedding_query='{embedding_query[:80]}', precise_queries={len([q for q in precise_queries if q])}, broad_queries={len([q for q in broad_queries if q])}, scope={router_result.get('search_scope')}")
                                    for i, q in enumerate(precise_queries):
                                        if q:
                                            print(f"   Precise Query {i+1}: '{q[:100]}'")
                                    for i, q in enumerate(broad_queries):
                                        if q:
                                            print(f"   Broad Query {i+1}: '{q[:100]}'")
                                    return router_result

                except requests.exceptions.HTTPError as e:
                    last_error = e
                    print(f"⚠️ Router: HTTP-Fehler {e.response.status_code}: {e.response.text[:300]}")
                    continue
                except json.JSONDecodeError as e:
                    print(f"⚠️ Router: JSON-Parse-Fehler: {e}, Text: {text[:200]}")
                    continue
                except Exception as e:
                    last_error = e
                    print(f"⚠️ Router: Unerwarteter Fehler: {type(e).__name__}: {e}")
                    continue

            print(f"⚠️ Router: Alle URLs fehlgeschlagen, verwende Fallback")

            # Fallback: Versuche Keywords aus Karteninhalt zu extrahieren
            fallback_precise = []
            fallback_broad = []
            fallback_embedding = ""
            if context:
                question = context.get('question') or context.get('frontField') or ""
                answer = context.get('answer') or ""

                if question or answer:
                    import re
                    from collections import Counter

                    # Extrahiere wichtige Wörter aus Karteninhalt
                    card_text = f"{question} {answer}".lower()
                    card_text = re.sub(r'<[^>]+>', ' ', card_text)
                    card_text = re.sub(r'[^\w\s]', ' ', card_text)
                    card_words = card_text.split()

                    # Filtere Stoppwörter und kurze Wörter
                    stopwords = {'der', 'die', 'das', 'und', 'oder', 'ist', 'sind', 'wird', 'werden', 'auf', 'in', 'zu', 'für', 'mit', 'von', 'ein', 'eine', 'einer', 'einem', 'einen', 'mir', 'dir', 'uns', 'ihr', 'ihm', 'sie', 'er', 'es', 'diese', 'dieser', 'dieses', 'diesen', 'dem', 'den', 'des', 'wo', 'was', 'wie', 'wenn', 'dass', 'sich', 'nicht', 'kein', 'keine', 'keinen', 'gib', 'gibt', 'geben', 'hint', 'hinweis', 'antwort', 'verraten', 'verrate'}
                    important_words = [w for w in card_words if len(w) > 3 and w not in stopwords]

                    if important_words:
                        word_freq = Counter(important_words)
                        top_words = [word for word, count in word_freq.most_common(9)]  # Genug für 3 Queries

                        if top_words:
                            fallback_embedding = " ".join(top_words[:7])
                            # Erstelle 3 verschiedene precise queries
                            fallback_precise = [
                                " AND ".join(top_words[0:3]) if len(top_words) >= 3 else " AND ".join(top_words),
                                " AND ".join(top_words[3:6]) if len(top_words) >= 6 else " AND ".join(top_words[:3]),
                                " AND ".join(top_words[6:9]) if len(top_words) >= 9 else " AND ".join(top_words[:3])
                            ]
                            # Erstelle 3 verschiedene broad queries
                            fallback_broad = [
                                " OR ".join(top_words[0:5]) if len(top_words) >= 5 else " OR ".join(top_words),
                                " OR ".join(top_words[2:7]) if len(top_words) >= 7 else " OR ".join(top_words[:5]),
                                " OR ".join(top_words[4:9]) if len(top_words) >= 9 else " OR ".join(top_words[:5])
                            ]
                            print(f"✅ Router Fallback: Keywords aus Karte extrahiert: {top_words[:9]}")

            # Wenn keine Keywords extrahiert werden konnten, verwende minimale Queries
            if not fallback_precise or not fallback_broad:
                import re
                user_words = [w for w in user_message.lower().split() if len(w) > 3 and w not in {'hint', 'hinweis', 'antwort', 'verraten', 'verrate', 'gib', 'gibt', 'geben', 'mir', 'dir', 'uns', 'einen', 'eine', 'ohne', 'die', 'der', 'das'}]
                if user_words:
                    fallback_embedding = " ".join(user_words[:7])
                    fallback_precise = [
                        " AND ".join(user_words[:3]) if len(user_words) >= 3 else " AND ".join(user_words),
                        " AND ".join(user_words[1:4]) if len(user_words) >= 4 else " AND ".join(user_words[:3]),
                        " AND ".join(user_words[2:5]) if len(user_words) >= 5 else " AND ".join(user_words[:3])
                    ]
                    fallback_broad = [
                        " OR ".join(user_words[:5]) if len(user_words) >= 5 else " OR ".join(user_words),
                        " OR ".join(user_words[1:6]) if len(user_words) >= 6 else " OR ".join(user_words[:5]),
                        " OR ".join(user_words[2:7]) if len(user_words) >= 7 else " OR ".join(user_words[:5])
                    ]
                    print(f"⚠️ Router Fallback: Verwende minimale Keywords aus Nutzeranfrage: {user_words[:7]}")
                else:
                    # Letzter Fallback: Verwende erste Wörter der Nutzeranfrage
                    words = user_message.split()[:9]
                    fallback_embedding = " ".join(words[:7])
                    if len(words) >= 3:
                        fallback_precise = [
                            " AND ".join(words[0:3]),
                            " AND ".join(words[1:4]) if len(words) >= 4 else " AND ".join(words[:3]),
                            " AND ".join(words[2:5]) if len(words) >= 5 else " AND ".join(words[:3])
                        ]
                        fallback_broad = [
                            " OR ".join(words[0:5]) if len(words) >= 5 else " OR ".join(words),
                            " OR ".join(words[1:6]) if len(words) >= 6 else " OR ".join(words[:5]),
                            " OR ".join(words[2:7]) if len(words) >= 7 else " OR ".join(words[:5])
                        ]
                    else:
                        # Minimale Fallback
                        fallback_precise = [" AND ".join(words)] * 3
                        fallback_broad = [" OR ".join(words)] * 3
                    print(f"⚠️ Router Fallback: Letzter Fallback mit ersten Wörtern: {words}")

            # Emit pipeline done for fallback
            scope_label = ""
            if deck_name:
                scope_label = deck_name.split("::")[-1]
            self._emit_pipeline_step("router", "done", {
                "search_needed": True,
                "retrieval_mode": "both",
                "scope": "current_deck",
                "scope_label": scope_label
            })

            return {
                "search_needed": True,
                "retrieval_mode": "both",
                "embedding_query": fallback_embedding,
                "precise_queries": fallback_precise[:3] if fallback_precise else ["", "", ""],
                "broad_queries": fallback_broad[:3] if fallback_broad else ["", "", ""],
                "search_scope": "current_deck"
            }

        except Exception as e:
            import traceback
            print(f"⚠️ Router Fehler: {e}")
            print(traceback.format_exc())

            # Emit pipeline error
            self._emit_pipeline_step("router", "error")

            # Fallback: Versuche Keywords aus Karteninhalt zu extrahieren
            fallback_precise = []
            fallback_broad = []
            fallback_embedding = ""
            if context:
                question = context.get('question') or context.get('frontField') or ""
                answer = context.get('answer') or ""

                if question or answer:
                    import re
                    from collections import Counter

                    card_text = f"{question} {answer}".lower()
                    card_text = re.sub(r'<[^>]+>', ' ', card_text)
                    card_text = re.sub(r'[^\w\s]', ' ', card_text)
                    card_words = card_text.split()

                    stopwords = {'der', 'die', 'das', 'und', 'oder', 'ist', 'sind', 'wird', 'werden', 'auf', 'in', 'zu', 'für', 'mit', 'von', 'ein', 'eine', 'einer', 'einem', 'einen', 'mir', 'dir', 'uns', 'ihr', 'ihm', 'sie', 'er', 'es', 'diese', 'dieser', 'dieses', 'diesen', 'dem', 'den', 'des', 'wo', 'was', 'wie', 'wenn', 'dass', 'sich', 'nicht', 'kein', 'keine', 'keinen', 'gib', 'gibt', 'geben', 'hint', 'hinweis', 'antwort', 'verraten', 'verrate'}
                    important_words = [w for w in card_words if len(w) > 3 and w not in stopwords]

                    if important_words:
                        word_freq = Counter(important_words)
                        top_words = [word for word, count in word_freq.most_common(5)]

                        if top_words:
                            fallback_embedding = " ".join(top_words[:5])
                            fallback_precise = [
                                " AND ".join(top_words[:3]),
                                " AND ".join(top_words[1:4]) if len(top_words) >= 4 else " AND ".join(top_words[:3]),
                                " AND ".join(top_words[2:5]) if len(top_words) >= 5 else " AND ".join(top_words[:3])
                            ]
                            fallback_broad = [
                                " OR ".join(top_words[:5]),
                                " OR ".join(top_words[1:]) if len(top_words) >= 2 else " OR ".join(top_words),
                                " OR ".join(top_words)
                            ]
                            print(f"✅ Router Exception-Fallback: Keywords aus Karte extrahiert: {top_words[:5]}")

            if not fallback_precise:
                import re
                user_words = [w for w in user_message.lower().split() if len(w) > 3 and w not in {'hint', 'hinweis', 'antwort', 'verraten', 'verrate', 'gib', 'gibt', 'geben', 'mir', 'dir', 'uns', 'einen', 'eine', 'ohne', 'die', 'der', 'das'}]
                if user_words:
                    fallback_embedding = " ".join(user_words[:5])
                    fallback_precise = [
                        " AND ".join(user_words[:3]),
                        " AND ".join(user_words[1:4]) if len(user_words) >= 4 else " AND ".join(user_words[:3]),
                        " AND ".join(user_words[2:5]) if len(user_words) >= 5 else " AND ".join(user_words[:3])
                    ]
                    fallback_broad = [
                        " OR ".join(user_words[:5]),
                        " OR ".join(user_words[1:]) if len(user_words) >= 2 else " OR ".join(user_words),
                        " OR ".join(user_words)
                    ]
                    print(f"⚠️ Router Exception-Fallback: Verwende minimale Keywords aus Nutzeranfrage: {user_words[:5]}")
                else:
                    words = user_message.split()[:3]
                    fallback_embedding = " ".join(words)
                    fallback_precise = [" AND ".join(words)] * 3
                    fallback_broad = [" OR ".join(words)] * 3
                    print(f"⚠️ Router Exception-Fallback: Letzter Fallback mit ersten Wörtern: {words}")

            return {
                "search_needed": True,
                "retrieval_mode": "both",
                "embedding_query": fallback_embedding,
                "precise_queries": fallback_precise[:3] if fallback_precise else ["", "", ""],
                "broad_queries": fallback_broad[:3] if fallback_broad else ["", "", ""],
                "search_scope": "current_deck"
            }
    
    def _emit_ai_event(self, event_type, data):
        """
        Sendet ein strukturiertes Event an das Frontend
        
        Args:
            event_type: Typ des Events (z.B. "rag_sources")
            data: Daten-Payload (Dict oder List)
        """
        if not self.widget or not self.widget.web_view:
            return
            
        if mw and mw.taskman:
            def emit_on_main():
                try:
                    payload = {"type": event_type, "data": data}
                    js_code = f"window.ankiReceive({json.dumps(payload)});"
                    self.widget.web_view.page().runJavaScript(js_code)
                    print(f"📡 AI Event ({event_type}) sent")
                except Exception as e:
                    print(f"⚠️ Fehler beim Senden von AI-Event: {e}")
            mw.taskman.run_on_main(emit_on_main)

    def _rag_retrieve_cards(self, precise_queries=None, broad_queries=None, search_scope="current_deck", context=None, max_notes=10):
        """
        Stage 2: Multi-Query Cascade Retrieval Engine - Führt präzise und breite Queries in Cascade aus
        
        Args:
            precise_queries: Liste von 3 präzisen Suchanfragen (AND-Verknüpfung)
            broad_queries: Liste von 3 breiten Suchanfragen (OR-Verknüpfung)
            search_scope: "current_deck" oder "collection"
            context: Optionaler Kontext (für Deck-Name und aktuelle Karte)
            max_notes: Maximale Anzahl Notizen (default: 10)
        
        Returns:
            Dict mit strukturierten Daten:
            {
                "context_string": "Note 123 (found in 2 queries): Field Front: ... Field Back: ...",
                "citations": {
                    "12345": {
                        "noteId": 12345,
                        "fields": {"Front": "...", "Back": "..."},
                        "deckName": "Biologie::Pflanzen",
                        "isCurrentCard": False
                    }
                }
            }
        """
        try:
            from aqt import mw
            if not mw or not mw.col:
                print("⚠️ RAG Retrieval: Keine Anki-Collection verfügbar")
                return {"context_string": "", "citations": {}}
            
            # Normalize inputs
            precise_queries = precise_queries or []
            broad_queries = broad_queries or []
            # Filter out empty queries
            precise_queries = [q for q in precise_queries if q and q.strip()]
            broad_queries = [q for q in broad_queries if q and q.strip()]
            
            if not precise_queries and not broad_queries:
                print("⚠️ RAG Retrieval: Keine Queries vorhanden")
                return {"context_string": "", "citations": {}}
            
            # Hilfsfunktion für Image-Extraktion
            import re
            def extract_images_from_html(text):
                """Extrahiert alle Bild-URLs aus HTML-Text"""
                if not text:
                    return []
                img_pattern = r'<img[^>]+src=["\']([^"\']+)["\']'
                matches = re.findall(img_pattern, text, re.IGNORECASE)
                image_urls = []
                for url in matches:
                    url = url.strip()
                    if url:
                        image_urls.append(url)
                return image_urls
            
            # Hilfsfunktion für HTML-Bereinigung
            def clean_html(text, max_len=2000):
                """Bereinigt HTML-Text und extrahiert Bilder"""
                if not text:
                    return ("", [])
                image_urls = extract_images_from_html(text)
                clean = re.sub(r'<[^>]+>', ' ', text)
                clean = re.sub(r'\s+', ' ', clean)
                clean = re.sub(r'&[a-zA-Z]+;', ' ', clean)
                clean = clean.strip()
                if len(clean) > max_len:
                    clean = clean[:max_len] + "..."
                return (clean, image_urls)
            
            # Extrahiere Deck-Name für Citations
            deck_name = None
            if context and context.get('deckName'):
                deck_name = context.get('deckName')
            elif search_scope == "current_deck" and context:
                deck_name = context.get('deckName', "Collection")
            else:
                deck_name = "Collection"
            
            # Dictionary für Note-Aggregation: note_id -> {note_data, query_count, queries_found_in}
            note_results = {}
            
            # Helper function to build Anki query with deck restriction
            def build_anki_query(query, search_scope, context):
                """Konstruiere Anki-Suchquery mit korrekter Deck-Name-Quote-Behandlung"""
                if search_scope == "current_deck" and context and context.get('deckName'):
                    deck_name_query = context.get('deckName')
                    if 'deck:' in query.lower():
                        import re
                        pattern = r'deck:(["\']?)([^"\'\s\)]+(?:\s+[^"\'\s\)]+)*)\1'
                        def replace_deck(match):
                            deck_val = match.group(2)
                            deck_val = deck_val.strip('"\'')
                            return f'deck:"{deck_val}"'
                        return re.sub(pattern, replace_deck, query, flags=re.IGNORECASE)
                    else:
                        return f'deck:"{deck_name_query}" ({query})'
                else:
                    return query
            
            # Helper function to execute query and aggregate results
            def execute_query(query, query_type, note_results):
                """Führt eine Query aus und aggregiert Ergebnisse in note_results"""
                anki_query = build_anki_query(query, search_scope, context)
                print(f"🔍 RAG Retrieval: {query_type} Query: {anki_query}")
                
                try:
                    card_ids = mw.col.find_cards(anki_query)
                    
                    if card_ids:
                        print(f"✅ {query_type} Query: {len(card_ids)} Karten gefunden")
                        self._emit_ai_state(f"Ergebnis: {len(card_ids)} Treffer für '{query[:50]}...'", phase=self.PHASE_SEARCH)
                        
                        for card_id in card_ids:
                            try:
                                card = mw.col.get_card(card_id)
                                if not card:
                                    continue
                                
                                note = card.note()
                                note_id = note.id
                                
                                if note_id not in note_results:
                                    note_results[note_id] = {
                                        'note': note,
                                        'card_ids': [],
                                        'query_count': 0,
                                        'queries_found_in': []
                                    }
                                
                                if query_type not in note_results[note_id]['queries_found_in']:
                                    note_results[note_id]['queries_found_in'].append(query_type)
                                    note_results[note_id]['query_count'] += 1
                                
                                if card_id not in note_results[note_id]['card_ids']:
                                    note_results[note_id]['card_ids'].append(card_id)
                                    
                            except Exception as e:
                                print(f"⚠️ RAG Retrieval: Fehler bei Karte {card_id}: {e}")
                                continue
                        return len(card_ids)
                    else:
                        print(f"⚠️ {query_type} Query: Keine Karten gefunden")
                        self._emit_ai_state(f"Ergebnis: 0 Treffer für '{query[:50]}...'", phase=self.PHASE_SEARCH)
                        return 0
                        
                except Exception as e:
                    print(f"⚠️ RAG Retrieval: Fehler bei {query_type} Query: {e}")
                    return 0
            
            # CASCADE LOGIC: Phase 1 - Precise Queries
            # CRITICAL: Deduplicate queries before processing
            normalized_precise = [q.strip().lower() for q in precise_queries if q and q.strip()]
            unique_precise = list(dict.fromkeys(normalized_precise))  # Preserves order, removes duplicates
            # Map back to original queries (case-sensitive) but deduplicated
            seen_normalized = set()
            deduplicated_precise = []
            for q in precise_queries:
                if not q or not q.strip():
                    continue
                normalized = q.strip().lower()
                if normalized not in seen_normalized:
                    seen_normalized.add(normalized)
                    deduplicated_precise.append(q)
            
            self._emit_ai_state("Präzise Suche...", phase=self.PHASE_SEARCH)
            precise_results_count = 0
            for i, query in enumerate(deduplicated_precise):
                self._emit_ai_state(f"Suche: {query[:50]}...", phase=self.PHASE_SEARCH)
                count = execute_query(query, f"precise_{i+1}", note_results)
                precise_results_count += count
            
            # Count unique notes after precise queries
            unique_notes = len(note_results)
            print(f"🔍 RAG Retrieval: Präzise Suche abgeschlossen: {unique_notes} eindeutige Notizen gefunden")
            
            # Check if we have enough results (>= 5)
            if unique_notes >= 5:
                self._emit_ai_state(f"Präzise Suche: {unique_notes} Treffer (ausreichend)", phase=self.PHASE_SEARCH)
                print(f"✅ RAG Retrieval: Genug Ergebnisse ({unique_notes}), stoppe Suche")
            else:
                # CASCADE LOGIC: Phase 2 - Broad Queries (wenn nicht genug Ergebnisse)
                self._emit_ai_state(f"Präzise Suche: {unique_notes} Treffer (zu wenig, erweitere Suche...)", phase=self.PHASE_SEARCH)
                
                if broad_queries:
                    # CRITICAL: Deduplicate broad queries before processing
                    seen_normalized_broad = set()
                    deduplicated_broad = []
                    for q in broad_queries:
                        if not q or not q.strip():
                            continue
                        normalized = q.strip().lower()
                        if normalized not in seen_normalized_broad:
                            seen_normalized_broad.add(normalized)
                            deduplicated_broad.append(q)
                    
                    self._emit_ai_state("Erweiterte Suche...", phase=self.PHASE_SEARCH)
                    broad_results_count = 0
                    for i, query in enumerate(deduplicated_broad):
                        self._emit_ai_state(f"Suche: {query[:50]}...", phase=self.PHASE_SEARCH)
                        count = execute_query(query, f"broad_{i+1}", note_results)
                        broad_results_count += count
                    
                    # Update unique count after broad queries
                    unique_notes = len(note_results)
                    print(f"🔍 RAG Retrieval: Erweiterte Suche abgeschlossen: {unique_notes} eindeutige Notizen gefunden (Gesamt)")
                    # Count how many new notes were added by broad queries
                    broad_notes_count = len([n for n in note_results.values() if any('broad' in str(q) for q in n.get('queries_found_in', []))])
                    precise_notes_count = unique_notes - broad_notes_count
                    self._emit_ai_state(f"Erweiterte Suche: +{broad_notes_count} Treffer (Gesamt: {unique_notes})", phase=self.PHASE_SEARCH)
                else:
                    print(f"⚠️ RAG Retrieval: Keine broad_queries verfügbar für Erweiterung")
            
            # Ranking: Sortiere nach query_count (absteigend), dann nach note_id
            ranked_notes = sorted(
                note_results.items(),
                key=lambda x: (x[1]['query_count'], x[0]),
                reverse=True
            )
            
            # Limit auf top max_notes
            ranked_notes = ranked_notes[:max_notes]
            
            # Fallback: Pure Keyword Search (ohne Deck-Restriction) wenn keine Ergebnisse
            if len(ranked_notes) == 0:
                print(f"⚠️ RAG Retrieval: Keine Notizen gefunden, versuche Fallback: Pure Keyword Search")
                self._emit_ai_state("🔍 Fallback: Reine Keyword-Suche...", phase=self.PHASE_SEARCH)
                
                # Extrahiere Haupt-Keywords aus der ersten precise query
                fallback_query = ""
                if precise_queries and len(precise_queries) > 0:
                    fallback_query = precise_queries[0]
                elif broad_queries and len(broad_queries) > 0:
                    fallback_query = broad_queries[0]
                
                # Entferne deck: und tag: Restrictions, behalte nur Keywords
                import re
                # Entferne deck: und tag: Präfixe
                fallback_query = re.sub(r'(deck|tag):["\']?[^"\'\s\)]+["\']?\s*', '', fallback_query, flags=re.IGNORECASE)
                # Entferne überflüssige Klammern und Whitespace
                fallback_query = re.sub(r'[\(\)]', ' ', fallback_query)
                fallback_query = ' '.join(fallback_query.split())
                
                if fallback_query:
                    try:
                        print(f"🔍 RAG Retrieval: Fallback-Query (ohne Deck-Restriction): {fallback_query}")
                        card_ids = mw.col.find_cards(fallback_query)
                        
                        if card_ids:
                            print(f"✅ Fallback: {len(card_ids)} Karten gefunden")
                            
                            # Aggregiere Notizen
                            for card_id in card_ids[:max_notes * 2]:  # Mehr Karten für Fallback
                                try:
                                    card = mw.col.get_card(card_id)
                                    if not card:
                                        continue
                                    
                                    note = card.note()
                                    note_id = note.id
                                    
                                    if note_id not in note_results:
                                        note_results[note_id] = {
                                            'note': note,
                                            'card_ids': [card_id],
                                            'query_count': 1,
                                            'queries_found_in': ['fallback']
                                        }
                                        
                                except Exception as e:
                                    print(f"⚠️ RAG Retrieval: Fehler bei Fallback-Karte {card_id}: {e}")
                                    continue
                                        
                        # Neu sortieren nach Fallback-Ergebnissen (nach der Schleife)
                        ranked_notes = sorted(
                            note_results.items(),
                            key=lambda x: (x[1]['query_count'], x[0]),
                            reverse=True
                        )[:max_notes]
                            
                    except Exception as e:
                        print(f"⚠️ RAG Retrieval: Fallback-Fehler: {e}")
            
            if len(ranked_notes) == 0:
                print(f"⚠️ RAG Retrieval: Keine Notizen gefunden (auch nicht im Fallback)")
                return {"context_string": "", "citations": {}}
            
            print(f"✅ RAG Retrieval: {len(ranked_notes)} Notizen nach Ranking (Top {max_notes})")
            
            # Note Expansion: Iteriere über alle Felder für jede Note
            formatted_notes = []
            citations = {}
            
            for note_id, note_data in ranked_notes:
                try:
                    note = note_data['note']
                    query_count = note_data['query_count']
                    queries_found = note_data['queries_found_in']
                    
                    # Iteriere über ALLE Felder der Note
                    note_fields = {}
                    all_images = []
                    
                    for field_name, field_value in note.items():
                        if field_value and field_value.strip():
                            # Bereinige HTML und extrahiere Bilder
                            field_clean, field_images = clean_html(field_value, max_len=1000)
                            note_fields[field_name] = field_clean
                            all_images.extend(field_images)
                    
                    # Entferne Duplikate bei Bildern
                    seen_images = set()
                    unique_images = []
                    for img in all_images:
                        if img not in seen_images:
                            seen_images.add(img)
                            unique_images.append(img)
                    
                    # Formatiere Note für Context-String
                    note_parts = [f"Note {note_id} (found in {query_count} queries: {', '.join(queries_found)}):"]
                    
                    for field_name, field_clean in note_fields.items():
                        note_parts.append(f"Field {field_name}: {field_clean}")
                    
                    if unique_images:
                        images_str = ", ".join(unique_images)
                        note_parts.append(f"Available Images: {images_str}")
                    
                    note_str = "\n".join(note_parts)
                    formatted_notes.append(note_str)
                    
                    # Erstelle Citation-Objekt mit allen Feldern
                    citation_fields = {}
                    for field_name, field_clean in note_fields.items():
                        # Erste 100 Zeichen pro Feld für Citation
                        citation_fields[field_name] = field_clean[:100] if field_clean else ""
                    
                    citations[str(note_id)] = {
                        "noteId": note_id,
                        "cardId": first_card_id,  # Erste Card-ID
                        "fields": citation_fields,
                        "deckName": deck_name,
                        "isCurrentCard": False  # Will be set to True for current card below
                    }
                    
                except Exception as e:
                    print(f"⚠️ RAG Retrieval: Fehler bei Note {note_id}: {e}")
                    continue
            
            # BEREICH 2: Füge aktuelle Karte zu Citations hinzu
            if context and context.get('noteId'):
                current_note_id = context.get('noteId')
                current_card_id = context.get('cardId')
                current_fields = context.get('fields', {})
                current_deck_name = context.get('deckName', deck_name)
                
                # Erstelle Citation für aktuelle Karte
                citation_fields = {}
                for field_name, field_value in current_fields.items():
                    if field_value:
                        # Bereinige HTML
                        import re
                        field_clean = re.sub(r'<[^>]+>', ' ', str(field_value))
                        field_clean = re.sub(r'\s+', ' ', field_clean).strip()
                        citation_fields[field_name] = field_clean[:100] if field_clean else ""
                
                # Füge aktuelle Karte hinzu (überschreibt falls bereits vorhanden)
                citations[str(current_note_id)] = {
                    "noteId": current_note_id,
                    "cardId": current_card_id,
                    "fields": citation_fields,
                    "deckName": current_deck_name,
                    "isCurrentCard": True  # WICHTIG: Flag für Frontend
                }
                print(f"✅ RAG Retrieval: Aktuelle Karte (Note {current_note_id}) zu Citations hinzugefügt")
            
            # Erstelle Context-String aus formatierten Notizen
            context_string = "\n\n".join(formatted_notes)
            
            # Emit sources count to frontend
            if len(citations) > 0:
                self._emit_ai_state(f"Gefunden: {len(citations)} Module", phase=self.PHASE_RETRIEVAL, metadata={"sourceCount": len(citations)})
                # CRITICAL: Emit full citation data to frontend for live display
                self._emit_ai_event("rag_sources", citations)
            
            print(f"✅ RAG Retrieval: {len(formatted_notes)} Notizen formatiert, {len(citations)} Citations erstellt")
            return {
                "context_string": context_string,
                "citations": citations
            }
            
        except Exception as e:
            import traceback
            print(f"⚠️ RAG Retrieval Fehler: {e}")
            print(traceback.format_exc())
            return {"context_string": "", "citations": {}}
    
    def get_response_with_rag(self, user_message, context=None, history=None, mode='compact', callback=None):
        """
        Hauptmethode für RAG-Pipeline: Orchestriert Router → Retrieval → Generator
        
        Args:
            user_message: Die Benutzer-Nachricht
            context: Optionaler Kontext (z.B. aktuelle Karte)
            history: Optional - Liste von vorherigen Nachrichten
            mode: Optional - 'compact' oder 'detailed'
            callback: Optional - Streaming-Callback mit erweitertem Format:
                      callback(chunk, done, is_function_call, steps=None, citations=None)
        
        Returns:
            Die generierte Antwort
        """
        import time
        
        # Reset Request State
        self._current_request_steps = []
        self._current_step_labels = []
        citations = {}
        
        try:
            # Stage 1: Router (pipeline_step emitted inside _rag_router)
            router_result = self._rag_router(user_message, context=context)
            
            rag_context = None
            if router_result and router_result.get("search_needed"):
                # Stage 2: Retrieval
                search_scope = router_result.get("search_scope", "current_deck")
                
                # Extract new format: precise_queries and broad_queries
                precise_queries = router_result.get("precise_queries", [])
                broad_queries = router_result.get("broad_queries", [])
                
                # Filter out empty queries
                precise_queries = [q for q in precise_queries if q and q.strip()]
                broad_queries = [q for q in broad_queries if q and q.strip()]
                
                if precise_queries or broad_queries:
                    # Check if hybrid retrieval (semantic search) is available
                    _emb_mgr = None
                    try:
                        try:
                            from . import get_embedding_manager
                        except ImportError:
                            from __init__ import get_embedding_manager
                        _emb_mgr = get_embedding_manager()
                    except Exception:
                        pass

                    retrieval_mode = router_result.get('retrieval_mode', 'both')

                    if _emb_mgr and retrieval_mode in ('semantic', 'both'):
                        # Use hybrid retrieval (SQL + semantic)
                        try:
                            try:
                                from .hybrid_retrieval import HybridRetrieval
                            except ImportError:
                                from hybrid_retrieval import HybridRetrieval
                            hybrid = HybridRetrieval(_emb_mgr, self)
                            retrieval_result = hybrid.retrieve(user_message, router_result, context, max_notes=10)
                        except Exception as e:
                            print(f"Hybrid retrieval failed, falling back to SQL: {e}")
                            retrieval_result = self._rag_retrieve_cards(
                                precise_queries=precise_queries,
                                broad_queries=broad_queries,
                                search_scope=search_scope,
                                context=context,
                                max_notes=10
                            )
                    else:
                        # Fallback to SQL-only (existing path)
                        retrieval_result = self._rag_retrieve_cards(
                            precise_queries=precise_queries,
                            broad_queries=broad_queries,
                            search_scope=search_scope,
                            context=context,
                            max_notes=10
                        )

                    # Handle new structured return format
                    if retrieval_result and retrieval_result.get("context_string"):
                        context_string = retrieval_result.get("context_string", "")
                        citations = retrieval_result.get("citations", {})

                        # Convert context_string to list format for backward compatibility
                        formatted_cards = [line for line in context_string.split("\n") if line.strip()]

                        rag_context = {
                            "cards": formatted_cards,
                            "reasoning": router_result.get("reasoning", ""),
                            "citations": citations  # NEW: Include citations
                        }
                        print(f"RAG: {len(formatted_cards)} Karten fuer Kontext verwendet, {len(citations)} Citations")
                    else:
                        print(f"RAG: Keine Karten gefunden")
            
            # Stage 3: Generator (mit RAG-Kontext falls vorhanden)
            self._refresh_config()

            if not self.is_configured():
                error_msg = "Bitte konfigurieren Sie zuerst den API-Schlüssel in den Einstellungen."
                if callback:
                    callback(error_msg, True, False)
                return error_msg

            # CRITICAL: Split-Brain Architecture
            # Generator: Use gemini-3-flash-preview for maximum reasoning capability
            # Fallback to gemini-2.5-flash (gemini-2.5-flash has quota 0)
            model = "gemini-3-flash-preview"
            fallback_model = "gemini-2.5-flash"
            api_key = self.config.get("api_key", "")

            # Emit generating pipeline step (covers both search and no-search paths)
            self._emit_pipeline_step("generating", "active")

            # (Old ai_state emission removed — replaced by _emit_pipeline_step above)
            
            # Wrapper für Callback um Steps und Citations zu übergeben
            def enhanced_callback(chunk, done, is_function_call=False):
                """Enhanced callback that includes steps and citations via kwargs"""
                if done:
                    self._emit_pipeline_step("generating", "done")
                    if callback:
                        callback(chunk, done, is_function_call,
                                 steps=self._current_request_steps,
                                 citations=citations,
                                 step_labels=getattr(self, '_current_step_labels', []))
                else:
                    if callback:
                        callback(chunk, done, is_function_call)
            
            # Verwende bestehende Streaming-Methode mit RAG-Kontext
            # Try gemini-3-flash-preview first, fallback to gemini-2.5-flash on error
            try:
                # Use suppress_error_callback=True to handle errors here instead of sending them to UI immediately
                if callback:
                    result = self._get_google_response_streaming(
                        user_message, model, api_key,
                        context=context, history=history, mode=mode, callback=enhanced_callback,
                        rag_context=rag_context,
                        suppress_error_callback=True # CRITICAL: Suppress error reporting for first attempt
                    )
                else:
                    result = self._get_google_response(
                    user_message, model, api_key,
                    context=context, history=history, mode=mode,
                    rag_context=rag_context
                )
                return result
            except Exception as e:
                # CRITICAL: Fallback logic with RAG preservation
                error_str = str(e).lower()
                status_code = None
                if hasattr(e, 'response') and e.response:
                    status_code = e.response.status_code
                
                print(f"⚠️ Primary model error ({status_code or 'unknown'}): {str(e)[:100]}...")
                
                # Wenn wir hier sind, hat der erste Versuch fehlgeschlagen
                # (Old ai_state "Wechsle zu Fallback-Modell..." removed)
                
                # Strategie für Fallback:
                # 1. Wenn 400 (Bad Request/Size) -> Sofort massiv kürzen
                # 2. Wenn 500/Timeout -> Gleicher Context mit anderem Modell
                
                fallback_rag_context = rag_context
                fallback_history = history
                
                if status_code == 400 or "400" in error_str or "too large" in error_str:
                    print("⚠️ 400/Size Error erkannt -> Massives Kürzen für Fallback")
                    # History komplett entfernen für maximalen Platz
                    fallback_history = [] 
                    # RAG Context auf Top 3 beschränken
                    if rag_context and rag_context.get("cards"):
                        fallback_rag_context = dict(rag_context)
                        fallback_rag_context["cards"] = rag_context["cards"][:3]
                        print(f"✂️ RAG-Kontext gekürzt auf 3 Karten, History entfernt")
                
                # Versuche Fallback mit gemini-2.5-flash (mit RAG)
                print(f"🔄 Versuche Fallback mit gemini-2.5-flash (mit RAG)...")
                try:
                    if callback:
                        return self._get_google_response_streaming(
                            user_message, fallback_model, api_key,
                            context=context, history=fallback_history, mode=mode, callback=enhanced_callback,
                            rag_context=fallback_rag_context,
                            suppress_error_callback=True # Auch hier Fehler unterdrücken für letzten Rettungsversuch
                        )
                    else:
                        return self._get_google_response(
                            user_message, fallback_model, api_key,
                            context=context, history=fallback_history, mode=mode,
                            rag_context=fallback_rag_context
                        )
                except Exception as fallback_e:
                    print(f"⚠️ Fallback mit RAG gescheitert: {fallback_e}")
                    
                    # Letzter Versuch: Fallback OHNE RAG aber MIT Metadaten
                    # Wir nutzen enhanced_callback, damit die bisherigen Steps/Citations erhalten bleiben
                    print("🔄 Letzter Versuch: Fallback OHNE RAG (aber mit Metadaten)...")
                    if callback:
                        return self._get_google_response_streaming(
                            user_message, fallback_model, api_key,
                            context=context, history=None, mode=mode, callback=enhanced_callback,
                            rag_context=None,
                            suppress_error_callback=False
                        )
                    else:
                        raise fallback_e
                
        except Exception as e:
            import traceback
            error_msg = f"Fehler in RAG-Pipeline: {str(e)}"
            print(f"⚠️ {error_msg}")
            print(traceback.format_exc())
            
            # Fallback: Normale Antwort ohne RAG - ABER mit enhanced_callback für Metadaten!
            print("🔄 Fallback auf normale Antwort ohne RAG (Endgültig)...")
            # WICHTIG: enhanced_callback verwenden, damit Steps/Citations gerettet werden
            return self.get_response(user_message, context=context, history=history, mode=mode, callback=enhanced_callback or callback)

# Globale Instanz
_ai_handler = None

def get_ai_handler(widget=None):
    """Gibt die globale AI-Handler-Instanz zurück"""
    global _ai_handler
    if _ai_handler is None:
        _ai_handler = AIHandler(widget=widget)
    elif widget and not _ai_handler.widget:
        # Update widget reference if provided and not already set
        _ai_handler.widget = widget
    return _ai_handler
