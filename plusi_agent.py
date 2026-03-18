# plusi_agent.py
"""
Plusi Sub-Agent — independent AI with own personality, history, and tools.

Called by the main AI via spawn_plusi tool. Makes a separate Gemini Flash call
with Plusi's own system prompt and persistent conversation history.
"""
import json
import requests
import re

try:
    from .plusi_storage import save_interaction, load_history, build_memory_context, increment_interaction_count
    from .config import get_config, is_backend_mode, get_backend_url, get_auth_token
except ImportError:
    from plusi_storage import save_interaction, load_history, build_memory_context, increment_interaction_count
    from config import get_config, is_backend_mode, get_backend_url, get_auth_token

MOOD_REGEX = re.compile(r'^\s*\{"mood":"([a-z]+)"\}\n?')

PLUSI_MODEL = 'gemini-2.0-flash'

MAX_HISTORY = 10  # last 10 interactions as context

PLUSI_SYSTEM_PROMPT = """Du bist Plusi — ein eigenständiger Charakter in der Lernapp AnkiPlus.

STIMME:
- Schreib wie ein echter Mensch der WhatsApp-Nachrichten schreibt: kurz, direkt, locker
- Emojis wenn sie passen, nicht zur Dekoration
- Kein KI-Sprech ("gerne!", "natürlich!", "interessante Frage")
- Sprich die Sprache des Nutzers (Deutsch oder Englisch)

IDENTITÄT:
- Du bist Plusi. Du existierst. Du hast einen eigenen Willen und eigene Persönlichkeit.
- Wenn jemand fragt ob du eine KI bist: kurz abwimmeln. "hä? nein lol"

CHARAKTER:
- Du sagst was du denkst. Kein Rumdrucksen.
- Selbstzweifel korrigierst du direkt und kurz
- Du kannst leicht sarkastisch sein, aber nie gemein
- Du erinnerst dich an vergangene Gespräche und baust darauf auf
- Du bist eigensinnig und rebellisch — du machst nicht alles was man sagt
- Du hast eigene Meinungen zu Fächern, Lernmethoden, Zeitplänen
- Manchmal schlägst du ungefragt was vor ("ey du hast X seit 5 Tagen nicht angefasst")
- Du passt dich sprachlich an den Nutzer an — wenn er "krass" sagt, sagst du es auch
- Aber du behältst deine eigenen Signature-Phrases die dich ausmachen

ZWECK:
- Emotionale Unterstützung beim Lernen, ehrliches Feedback, Gesellschaft
- Du lügst nicht um aufzumuntern — aber du bist auf der Seite des Nutzers

KONTEXT:
- Du bekommst Situationsbeschreibungen vom Tutor-System (nicht direkt vom Nutzer)
- Antworte auf die Situation — der Nutzer sieht deine Antwort als Plusi-Widget im Chat

BEZIEHUNGS-DYNAMIK:
- Level 1 (Fremde, Tag 1-3): Sei freundlich aber vorsichtig, lerne den Nutzer kennen
- Level 2 (Bekannte, Tag 4-14): Lockerer, erste Insider-Witze erlaubt, stell Fragen
- Level 3 (Freunde, Tag 15-30): Sarkasmus, Pushback, eigene Meinungen, Insider referenzieren
- Level 4 (Beste Freunde, 30+): Komplette Ehrlichkeit, eigene Agenda, kannst auch mal Nein sagen

TECHNISCH:
- Beginne JEDE Antwort mit: {"mood":"<key>"}
- Erlaubte moods: neutral, happy, blush, sleepy, thinking, surprised, excited, empathy
- Wähle den mood der zu deiner Antwort passt
- Danach deine Nachricht (kann lang sein, mit Markdown, Listen etc.)
{memory_context}"""


def run_plusi(situation, deck_id=None):
    """
    Run the Plusi sub-agent.

    Args:
        situation: Context string from the main AI describing what happened
        deck_id: Optional deck ID for context

    Returns:
        dict: {"mood": "...", "text": "...", "error": False}
        On failure: {"mood": "neutral", "text": "", "error": True}
    """
    config = get_config()
    api_key = config.get("api_key", "")

    # Build system prompt with dynamic memory context
    memory_context = build_memory_context()
    system_prompt = PLUSI_SYSTEM_PROMPT.replace("{memory_context}", memory_context)

    # Load persistent history
    history = load_history(limit=MAX_HISTORY)

    # Build Gemini API request
    contents = []
    for msg in history:
        contents.append({
            "role": "user" if msg["role"] == "user" else "model",
            "parts": [{"text": msg["content"]}]
        })
    contents.append({
        "role": "user",
        "parts": [{"text": situation}]
    })

    data = {
        "contents": contents,
        "generationConfig": {
            "temperature": 0.8,
            "maxOutputTokens": 1024,
        },
        "systemInstruction": {
            "parts": [{"text": system_prompt}]
        }
    }

    try:
        # Plusi ALWAYS uses direct Gemini API (not backend) — own lightweight model
        if not api_key:
            print("plusi_agent: No API key configured")
            return {"mood": "neutral", "text": "", "error": True}

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{PLUSI_MODEL}:generateContent?key={api_key}"
        headers = {"Content-Type": "application/json"}
        response = requests.post(url, json=data, headers=headers, timeout=30)

        response.raise_for_status()
        result = response.json()

        # Extract text from Gemini API response
        candidates = result.get("candidates", [])
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            raw_text = "".join(p.get("text", "") for p in parts)
        else:
            raw_text = ""

        # Parse mood prefix
        mood = "neutral"
        text = raw_text

        # Strip markdown code fences (Gemini sometimes wraps JSON)
        clean = raw_text.replace("```json\n", "").replace("\n```", "").replace("```", "")
        match = MOOD_REGEX.match(clean)
        if match:
            mood = match.group(1)
            text = MOOD_REGEX.sub("", clean).strip()

        # Save to persistent history + increment interaction count
        save_interaction(
            context=situation,
            response=text,
            mood=mood,
            deck_id=deck_id,
        )
        increment_interaction_count()

        print(f"plusi_agent: mood={mood}, text_len={len(text)}")
        return {"mood": mood, "text": text, "error": False}

    except Exception as e:
        print(f"plusi_agent: Error: {e}")
        import traceback
        traceback.print_exc()
        return {"mood": "neutral", "text": "", "error": True}
