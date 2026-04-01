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


def run_help(situation: str = '', emit_step=None, memory=None, stream_callback=None, **kwargs) -> dict:
    """Run the Help agent.

    Args:
        situation: The user's message/question about the app.
        emit_step: Callback for pipeline visualization (step_name, status).
        memory: AgentMemory instance for persistent state.
        **kwargs: Additional keyword arguments (e.g. memory_context).

    Returns:
        Dict with 'text' (response) and optionally 'error'.
    """
    model = kwargs.get('model') or HELP_MODEL
    memory_context = kwargs.get('memory_context', '')
    try:
        try:
            from ..config import get_config, is_backend_mode, get_backend_url, get_auth_token
        except ImportError:
            from config import get_config, is_backend_mode, get_backend_url, get_auth_token

        # Backend-only mode
        backend_url = get_backend_url()
        if not backend_url:
            return {
                'text': 'Der Help-Agent benötigt eine Backend-Verbindung. '
                        'Bitte melde dich an oder konfiguriere die Verbindung.',
                'error': True,
            }

        # Build system prompt with optional memory context
        system_prompt = HELP_SYSTEM_PROMPT
        if memory_context:
            system_prompt += f"\n\nUSER-KONTEXT:\n{memory_context}"

        import requests
        try:
            from .auth import get_auth_headers
        except ImportError:
            from ai.auth import get_auth_headers

        url = f"{backend_url}/chat"
        headers = get_auth_headers()
        payload = {
            "message": situation,
            "model": model,
            "agent": "help",
            "systemPrompt": system_prompt,
            "stream": False,
        }
        response = requests.post(url, json=payload, headers=headers, timeout=15)
        response.raise_for_status()
        result = response.json()
        text = result.get('response', result.get('text', ''))

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
