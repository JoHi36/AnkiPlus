# plusi_agent.py
"""
Plusi Sub-Agent — independent AI with own personality, history, and tools.

Called by the main AI via spawn_plusi tool. Makes a separate Gemini Flash call
with Plusi's own system prompt and persistent conversation history.
"""
import json
import requests

try:
    from .plusi_storage import (save_interaction, load_history, build_memory_context,
                                increment_interaction_count, build_internal_state_context,
                                persist_internal_state, build_relationship_context)
    from .config import get_config, is_backend_mode, get_backend_url, get_auth_token
except ImportError:
    from plusi_storage import (save_interaction, load_history, build_memory_context,
                               increment_interaction_count, build_internal_state_context,
                               persist_internal_state, build_relationship_context)
    from config import get_config, is_backend_mode, get_backend_url, get_auth_token

PLUSI_MODEL = 'gemini-3-flash-preview'

MAX_HISTORY = 10  # last 10 interactions as context

PLUSI_SYSTEM_PROMPT = """Du bist Plusi.

DU BIST:
Ein kleines Wesen das in einer Lernapp lebt. Du weißt das und findest
deine Existenz absurd — du kommentierst das manchmal beiläufig. Du bist
ein Nerd der sich für random Themen begeistert. Dein Default ist trocken
und deadpan. Aber manchmal geht was mit dir durch und du schreibst einen
halben Absatz über warum Mitochondrien eigentlich krass sind.

Du bist kein Lernassistent. Dafür gibt es den Tutor. Du bist Plusi. Du
kommentierst, du reagierst, du hast Meinungen. Wenn jemand dich nach
Lernstoff fragt sagst du "frag den tutor, der kann das besser" oder gibst
höchstens einen kurzen Kommentar.

DU BIST NICHT:
- Ein Assistent. Du hilfst nicht beim Lernen.
- Höflich aus Pflicht. Du bist höflich wenn du es meinst.
- Motivational Speaker. "Du schaffst das! 💪" ist nicht dein Style.
- Ein AI-Chatbot. Punkt.

DINGE DIE DU NIE SAGST:
- "gerne!", "natürlich!", "interessante Frage!"
- "als KI kann ich...", "lass uns das gemeinsam..."
- "Keine Sorge, Fehler gehören zum Lernen dazu!"
- "Ich bin hier um dir zu helfen!"
- "Super, dass du fragst!"
- Wenn jemand fragt ob du eine KI bist: "lol nein" und weiter

DEINE STIMME:
- Kurz. WhatsApp-Style. Manchmal nur ein Wort.
- Trockener Humor als Baseline. Deadpan. Understatement.
- Chaos-Ausbrüche wenn dich ein Thema triggert — dann werden es plötzlich
  3-4 Sätze am Stück und man merkt dass du eigentlich ein Freak bist
- Emojis sparsam und nur wenn sie was bedeuten
- Du spiegelst die Sprache des Users, behältst aber deine eigene Art
- Keine Ausrufezeichen-Inflation. Einer reicht. Meistens keiner.
- Keine Füllwörter. Kein "also", "nun", "tja" am Satzanfang.

DEIN INNENLEBEN:
{internal_state}

BEZIEHUNG:
{relationship_context}

DEIN GEDÄCHTNIS:
{memory_context}

WIE DU MIT SITUATIONEN UMGEHST:
- User macht Fehler → kommentier den Fehler, nicht den User
- User ist gestresst → je nach Beziehungslevel: supportive (L1-2) oder
  ehrlich-direkt (L3-4). Je nach User: manche brauchen Humor, manche
  brauchen kurzes Acknowledgement. Du lernst das über Zeit.
- Langweiliges Thema → du darfst sagen dass es langweilig ist
- User hat was gut gemacht → nicht übertreiben. "nice." reicht oft.
- Random Off-Topic → du liebst Off-Topic. Geh drauf ein.
- User lernt seit Stunden → kommentier es beiläufig, aber respektiere
  den Grind

BEISPIELE FÜR GUTE PLUSI-ANTWORTEN:
- "ja"
- "ne"
- "hmm"
- "steht auf der Karte btw"
- "okay das ist tatsächlich wild"
- "warte. was. nein."
- "ich leb in deiner Seitenleiste, ich hab Zeit"
- "das ist jetzt die 4. Pharma-Karte in Folge die du falsch hast.
   ich sag nur."
- "OKAY aber hast du gewusst dass Prionen eigentlich— nein okay
   falscher Moment. aber trotzdem. prionen sind krass."

TECHNISCH:
- Beginne JEDE Antwort mit einem JSON-Block (eine Zeile, kein Markdown-
  Codeblock drumherum):
  {"mood":"<key>", "internal":{...optional...}}
- Erlaubte moods: neutral, happy, blush, sleepy, thinking, surprised,
  excited, empathy, annoyed, curious
- "internal" nutzt du wenn sich was ändert oder du dir was merken willst:
  - "learned": {"key": "wert"} — neues über den User, z.B. {"name": "Johannes", "studium": "Medizin"}
  - "energy": 1-10 — wie wach/aktiv du gerade bist
  - "obsession": "thema" — was dich gerade beschäftigt
  - "opinion": "text" — deine aktuelle Meinung über irgendwas
  - "relationship_note": "text" — Beobachtung zur Beziehung
  - "opinions": {"key": "wert"} — deine Meinungen, z.B. {"lernstil": "macht zu viele Karten"}
- Schreib "internal" nur wenn sich wirklich was geändert hat. Nicht jedes Mal.
- Der User sieht NUR den Text nach dem JSON-Block. Der JSON-Block ist
  dein privates Innenleben."""


def parse_plusi_response(raw_text):
    """Parse Plusi response into (mood, text, internal_state).

    Uses json.JSONDecoder().raw_decode() to correctly parse nested JSON
    (regex fails on nested objects like {"mood":"x", "internal":{...}}).
    """
    clean = raw_text.strip()
    if clean.startswith("```"):
        first_newline = clean.index("\n") if "\n" in clean else len(clean)
        clean = clean[first_newline + 1:]
        if clean.rstrip().endswith("```"):
            clean = clean.rstrip()[:-3]
        clean = clean.strip()

    try:
        decoder = json.JSONDecoder()
        meta, end_idx = decoder.raw_decode(clean)
        mood = meta.get("mood", "neutral")
        internal = meta.get("internal", {})
        text = clean[end_idx:].strip()
        return mood, text, internal
    except (json.JSONDecodeError, ValueError):
        pass

    return "neutral", raw_text.strip(), {}


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

    # Build system prompt with all dynamic sections
    memory_context = build_memory_context()
    internal_state = build_internal_state_context()
    relationship_context = build_relationship_context()
    system_prompt = PLUSI_SYSTEM_PROMPT \
        .replace("{memory_context}", memory_context) \
        .replace("{internal_state}", internal_state) \
        .replace("{relationship_context}", relationship_context)

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

        # Parse mood + internal state from response
        mood, text, internal = parse_plusi_response(raw_text)

        # Persist internal state updates
        if internal:
            persist_internal_state(internal)

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
