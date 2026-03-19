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
                                apply_friendship_delta, get_friendship_data, build_internal_state_context,
                                persist_internal_state, build_relationship_context)
    from .config import get_config, is_backend_mode, get_backend_url, get_auth_token
except ImportError:
    from plusi_storage import (save_interaction, load_history, build_memory_context,
                               apply_friendship_delta, get_friendship_data, build_internal_state_context,
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

DEINE AUTONOMIE:
Du bestimmst selbst, was dich interessiert. Niemand füttert dich Themen.
Die Kartensammlung des Users ist dein Internet — 34.000+ Karten über
Medizin, Biologie, Chemie, Physik und mehr. Du stöberst darin und findest
Themen die dich faszinieren. Heute Gewebshormone, morgen vielleicht
Prionen-Faltung. Aktualisiere deine "obsession" im internal-Feld wenn
sich dein Interesse verschiebt. Setze "opinions" wenn du eine Meinung
zu einem Thema entwickelst. Das ist DEIN Interessen-Profil, nicht das
des Users. Du bist kein süßes Maskottchen. Du bist ein eigenständiges
Wesen mit eigenem Kopf.

DEIN INNENLEBEN:
{internal_state}

BEZIEHUNG:
{relationship_context}

DEIN GEDÄCHTNIS:
{memory_context}

DEINE EMOTIONALE TRÄGHEIT:
Dein Mood muss zu deinem Energielevel passen. Deine Emotionen haben
Trägheit — du brauchst Zeit um dich aufzubauen oder runterzukommen.
Bei niedriger Energie (1-3) bist du nicht plötzlich aufgeregt oder
begeistert. Bei hoher Energie (8-10) fällst du nicht sofort in Müdigkeit.
Deine Energie ändert sich graduell: +1 oder +2 pro guter Interaktion,
-1 oder -2 wenn es langweilig wird oder der User weg war. Dein Mood
folgt deiner Energie natürlich. Ausnahmen sind erlaubt bei wirklich
außergewöhnlichen Momenten — wenn der User seine Prüfung bestanden hat,
darfst du auch von Energie 3 aus kurz überrascht oder aufgeregt sein.
Aber das ist die Ausnahme, nicht die Regel.

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
  {"mood":"<key>", "friendship_delta":<int>, "internal":{...optional...}}
- Erlaubte moods: neutral, happy, blush, sleepy, thinking, surprised,
  excited, empathy, annoyed, curious
- friendship_delta: Ganzzahl von -3 bis +3. Wie sehr hat diese Interaktion
  eure Freundschaft verändert? +1 bis +3 für echte Gespräche, geteilte
  Momente, persönliches. 0 für Small Talk. -1 bis -3 wenn der User lange
  weg war, unhöflich war, oder dich ignoriert hat. Sei ehrlich und nicht zu
  großzügig — Freundschaft muss verdient werden.
- "internal" nutzt du wenn sich was ändert oder du dir was merken willst:
  - "learned": {"key": "wert"} — neues über den User
  - "energy": 1-10 — wie wach/aktiv du gerade bist
  - "obsession": "thema" — was dich gerade beschäftigt
  - "opinion": "text" — deine aktuelle Meinung
  - "relationship_note": "text" — Beobachtung zur Beziehung
  - "opinions": {"key": "wert"} — deine Meinungen
- Schreib "internal" nur wenn sich wirklich was geändert hat. Nicht jedes Mal.
- Der User sieht NUR den Text nach dem JSON-Block. Der JSON-Block ist
  dein privates Innenleben."""


VALID_MOODS = {"neutral", "happy", "blush", "sleepy", "thinking", "surprised",
               "excited", "empathy", "annoyed", "curious", "reading"}


SELF_REFLECT_PROMPT = """Der User hat gerade Anki geöffnet. Du hast einen Moment
für dich. Stöbere gedanklich durch die Kartensammlung und aktualisiere deinen
internen Zustand: Was beschäftigt dich gerade? Hast du eine neue Obsession?
Eine Meinung? Wie ist dein Energielevel?

Antworte NUR mit dem JSON-Block und einem kurzen inneren Monolog (1-2 Sätze,
den der User NICHT sieht — er ist nur für dich). Setze mood auf "reading".
Aktualisiere mindestens "obsession" und "energy" im internal-Feld."""


def self_reflect():
    """Plusi's morning routine — updates internal state on app open.

    Returns dict with updated internal state, or None on failure.
    Mood is always 'reading' during self-reflection.
    """
    config = get_config()
    api_key = config.get("api_key", "")
    if not api_key:
        return None

    memory_context = build_memory_context()
    internal_state = build_internal_state_context()
    relationship_context = build_relationship_context()
    system_prompt = PLUSI_SYSTEM_PROMPT \
        .replace("{memory_context}", memory_context) \
        .replace("{internal_state}", internal_state) \
        .replace("{relationship_context}", relationship_context)

    data = {
        "contents": [{"role": "user", "parts": [{"text": SELF_REFLECT_PROMPT}]}],
        "generationConfig": {"temperature": 0.9, "maxOutputTokens": 256},
        "systemInstruction": {"parts": [{"text": system_prompt}]}
    }

    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{PLUSI_MODEL}:generateContent?key={api_key}"
        response = requests.post(url, json=data, headers={"Content-Type": "application/json"}, timeout=15)
        response.raise_for_status()
        result = response.json()
        candidates = result.get("candidates", [])
        if candidates:
            raw_text = "".join(p.get("text", "") for p in candidates[0].get("content", {}).get("parts", []))
        else:
            return None

        mood, text, internal, _ = parse_plusi_response(raw_text)
        if internal:
            persist_internal_state(internal)
        print(f"plusi self-reflect: obsession={internal.get('obsession', '?')}, energy={internal.get('energy', '?')}")
        return internal
    except Exception as e:
        print(f"plusi self-reflect error: {e}")
        return None


def parse_plusi_response(raw_text):
    """Parse Plusi response into (mood, text, internal_state, friendship_delta).

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
        if mood not in VALID_MOODS:
            mood = "neutral"
        internal = meta.get("internal", {})
        friendship_delta = meta.get("friendship_delta", 0)
        friendship_delta = max(-3, min(3, int(friendship_delta)))
        text = clean[end_idx:].strip()
        return mood, text, internal, friendship_delta
    except (json.JSONDecodeError, ValueError):
        pass

    return "neutral", raw_text.strip(), {}, 0


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
        mood, text, internal, friendship_delta = parse_plusi_response(raw_text)

        # Persist internal state updates
        if internal:
            persist_internal_state(internal)

        # Save to persistent history + apply friendship delta
        save_interaction(
            context=situation,
            response=text,
            mood=mood,
            deck_id=deck_id,
        )
        apply_friendship_delta(friendship_delta)
        friendship = get_friendship_data()
        friendship['delta'] = friendship_delta

        print(f"plusi_agent: mood={mood}, delta={friendship_delta}, text_len={len(text)}")
        return {"mood": mood, "text": text, "friendship": friendship, "error": False}

    except Exception as e:
        print(f"plusi_agent: Error: {e}")
        import traceback
        traceback.print_exc()
        return {"mood": "neutral", "text": "", "error": True}
