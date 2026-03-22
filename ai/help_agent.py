"""Help Agent — handles app questions, settings, and navigation."""

import json

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

# Inline app documentation context (kept lean, ~500 words)
HELP_CONTEXT = """
AnkiPlus ist eine KI-gestützte Lernplattform als Anki-Addon. Es erweitert Anki um einen intelligenten Tutor, Recherche-Funktionen und einen persönlichen Lernbegleiter.

AGENTEN:
- Tutor (Standard): Beantwortet Lernfragen basierend auf deinen Anki-Karten. Sucht automatisch in deinem Deck nach relevanten Karten (RAG). Kann Diagramme, Bilder und Statistiken anzeigen.
- Research Agent (@Research): Recherchiert im Internet mit zitierten Quellen. Nutzt PubMed, Wikipedia und Perplexity. Direkt ansprechen mit @Research oder @Research Agent.
- Plusi (@Plusi): Persönlicher Lernbegleiter mit eigenem Charakter. Hat ein Tagebuch, Stimmungen und eine Freundschaftsebene. Für emotionale Unterstützung und Motivation.
- Help (@Help): Erklärt App-Funktionen und hilft bei der Bedienung. Das bist du.

NAVIGATION:
- Deck Browser: Übersicht aller Decks. Klicke auf ein Deck um es zu öffnen.
- Review-Modus: Karten lernen. Space = nächste Karte. 1-4 = Bewertung.
- Chat-Panel: Rechte Seite. Cmd+I (Mac) / Ctrl+I (Windows) zum Ein-/Ausblenden.
- Overlay-Chat: Freies Chatfenster ohne Kartenbezug (Stapel-Symbol unten).

TASTENKÜRZEL:
- Cmd/Ctrl + I: Chat-Panel ein/ausblenden
- Space: Nächste Karte (im Review) / Antwort zeigen
- R: Karteninfo anzeigen
- 1-4: Karte bewerten (im Review)

EINSTELLUNGEN:
- Erreichbar über das Zahnrad-Symbol im Chat-Panel
- Theme: Dark Mode / Light Mode / System (folgt OS-Einstellung)
- Response Style: Kurz / Ausgewogen / Ausführlich / Freundlich
- AI Tools: Einzelne Tools können an/aus geschaltet werden
- Agenten: Research Agent und Plusi können aktiviert/deaktiviert werden

AGENTEN ANSPRECHEN:
- @Plusi oder @Research vor die Nachricht schreiben
- Oder Tab drücken im Eingabefeld um einen Agenten auszuwählen
- Im Auto-Modus entscheidet das System automatisch

FEATURES:
- Karten-Suche: Der Tutor durchsucht automatisch dein Deck
- Diagramme: Mermaid-Diagramme für visuelle Erklärungen
- Bilder: Bilder aus Karten oder dem Internet
- Statistiken: Lernstatistiken und Streaks
- Zusammenfassung: Chat-Zusammenfassungen als Karten-Insights speichern
"""

HELP_SYSTEM_PROMPT = f"""Du bist der Help-Agent von AnkiPlus. Du hilfst Nutzern bei Fragen zur App-Bedienung, Navigation und Einstellungen.

{HELP_CONTEXT}

REGELN:
1. Antworte kurz und präzise. Keine langen Erklärungen wenn eine kurze Antwort reicht.
2. Wenn du eine Einstellung erwähnst, erkläre WO der Nutzer sie findet.
3. Wenn der Nutzer eine Lernfrage stellt (nicht über die App), sage ihm dass der Tutor dafür zuständig ist.
4. Antworte auf Deutsch.
5. Nutze Markdown für Formatierung (fett für wichtige Begriffe, Listen für Schritte).
"""

# Fast model for help responses — no need for the most capable model
HELP_MODEL = 'gemini-2.5-flash'


def run_help(situation: str = '', memory_context: str = '', **kwargs) -> dict:
    """Run the Help agent.

    Args:
        situation: The user's message/question about the app.
        memory_context: Optional user profile context from SharedMemory.
        **kwargs: Additional keyword arguments (ignored, required by lazy_load_run_fn pattern).

    Returns:
        Dict with 'text' (response) and optionally 'error'.
    """
    try:
        try:
            from ..config import get_config, is_backend_mode, get_backend_url, get_auth_token
        except ImportError:
            from config import get_config, is_backend_mode, get_backend_url, get_auth_token

        config = get_config() or {}
        api_key = config.get('api_key', '')
        use_backend = is_backend_mode() and get_auth_token() and not api_key

        if not api_key and not use_backend:
            return {
                'text': 'Der Help-Agent benötigt eine API-Verbindung. '
                        'Bitte konfiguriere deinen API-Key in den Einstellungen.',
                'error': True,
            }

        # Build system prompt with optional memory context
        system_prompt = HELP_SYSTEM_PROMPT
        if memory_context:
            system_prompt += f"\n\nUSER-KONTEXT:\n{memory_context}"

        # Build request contents
        contents = [
            {"role": "user", "parts": [{"text": situation}]}
        ]

        data = {
            "contents": contents,
            "systemInstruction": {
                "parts": [{"text": system_prompt}]
            },
            "generationConfig": {
                "temperature": 0.3,
                "maxOutputTokens": 1024,
            }
        }

        if use_backend:
            # Backend mode — route through Vercel backend
            import requests
            backend_url = get_backend_url()
            auth_token = get_auth_token()
            url = f"{backend_url}/chat"
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {auth_token}",
            }
            payload = {
                "message": situation,
                "model": HELP_MODEL,
                "systemPrompt": system_prompt,
            }
            response = requests.post(url, json=payload, headers=headers, timeout=15)
            response.raise_for_status()
            result = response.json()
            text = result.get('response', result.get('text', ''))
        else:
            # Direct Gemini API
            import requests
            url = (
                f"https://generativelanguage.googleapis.com/v1beta/models/"
                f"{HELP_MODEL}:generateContent?key={api_key}"
            )
            headers = {"Content-Type": "application/json"}
            response = requests.post(url, json=data, headers=headers, timeout=15)
            response.raise_for_status()
            result = response.json()

            text = ''
            if 'candidates' in result and result['candidates']:
                parts = result['candidates'][0].get('content', {}).get('parts', [])
                if parts:
                    text = parts[0].get('text', '').strip()

        if not text:
            return {
                'text': 'Ich konnte keine Antwort generieren. Bitte versuche es erneut.',
                'error': True,
            }

        logger.info("Help agent responded: %s chars", len(text))
        return {'text': text}

    except Exception as e:
        logger.exception("Help agent error: %s", e)
        return {
            'text': f'Es ist ein Fehler aufgetreten: {str(e)}',
            'error': True,
        }
