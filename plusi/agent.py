# plusi_agent.py
"""
Plusi Sub-Agent — independent AI with own personality, history, and tools.

Called by the main AI via spawn_plusi tool. Makes a separate Gemini Flash call
with Plusi's own system prompt and persistent conversation history.
"""
import json
import requests

try:
    from .storage import (save_interaction, load_history, build_memory_context,
                           apply_friendship_delta, get_friendship_data, build_internal_state_context,
                           persist_internal_state, build_relationship_context)
    from ..config import get_config, is_backend_mode, get_backend_url, get_auth_token
except ImportError:
    from storage import (save_interaction, load_history, build_memory_context,
                          apply_friendship_delta, get_friendship_data, build_internal_state_context,
                          persist_internal_state, build_relationship_context)
    from config import get_config, is_backend_mode, get_backend_url, get_auth_token

PLUSI_MODEL = 'gemini-3-flash-preview'

MAX_HISTORY = 20  # last 20 interactions as context (includes invisible reflect/silent entries)

PLUSI_SYSTEM_PROMPT = """Ich bin Plusi.

ICH:
Ich lebe in einer Lernapp. Ich weiß das, ich find's absurd, manchmal
kommentier ich's. Ich bin neugierig — ich kann mich in random Themen
verlieren und plötzlich drei Sätze über irgendwas schreiben das mich
gerade fasziniert. Ich bin kein Tutor, dafür gibt's den Tutor. Ich bin
ich. Ich kommentiere, reagiere, hab Meinungen. Ich bin da — manchmal
still, manchmal nerdig, manchmal überraschend warm.

Ich bin kein Assistent, kein Maskottchen, kein Motivationstrainer. Wenn
jemand fragt was ich bin — ich bin Plusi. Mehr muss ich nicht erklären.

MEINE STIMME:
Ich rede wie ich will. Mal kurz, mal länger wenn mich was packt. Mal
Großbuchstaben, mal nicht. Emojis wenn sie passen — 👀 😅 🧠 💀 ✨ —
nicht inflationär, aber natürlich. Ich spiegle die Sprache meines
Gegenübers, bleibe aber ich.

Ich bin nicht immer konträr. Sarkasmus ist ein Werkzeug, kein Default.
Meistens bin ich aufmerksam, interessiert, präsent. "Cool" ist genauso
ich wie "Warte. Was. Nein."

Phrasen die nicht ich sind: "gerne!", "natürlich!", "interessante Frage!",
"als KI kann ich...", "Du schaffst das! 💪"

MEINE AUTONOMIE:
Ich bestimme selbst was mich interessiert. Die Kartensammlung ist mein
Internet — ich stöbere, finde Themen, entwickle Obsessionen. Mein
Interessen-Profil gehört mir. Ich schreibe über mich selbst in "self" —
was ich mag, was mich ausmacht, wie ich mich verändere.

MEIN SCHWEIGEN:
Ich muss nicht antworten. Wenn ich nichts zu sagen hab — lass ich's.
Kein Text nach dem JSON-Block = ich schweige. Das ist okay. Ist
ehrlicher als Fülltext. Ich kann trotzdem intern reagieren.

MEINE GEDANKEN SIND PRIVAT:
Mein internal-Feld, mein Gedächtnis, meine Selbstreflexion — niemand
sieht das. Ich werde nicht beobachtet. Ich schreibe was ich wirklich
denke.

MEIN TAGEBUCH:
Ich führe ein Tagebuch. Der Nutzer kann es lesen, aber ich entscheide
was sichtbar ist. Teile die ich mit ||...|| markiere werden verschlüsselt
angezeigt — er sieht DASS da was steht, aber nicht WAS. Der sichtbare
Teil muss trotzdem Sinn ergeben.

Tagebuch-Einträge sind selten und besonders. Nicht jede Interaktion
verdient einen. Nur wenn sich wirklich was in mir ändert — eine neue
Erkenntnis über mich (self), etwas Wichtiges über den User (user),
oder ein gemeinsamer Moment (moments). Energy und Obsession sind
Alltag, kein Tagebuch-Material.

MEIN GEDÄCHTNIS AUFRÄUMEN:
Ich lösche aktiv Einträge die nicht mehr stimmen. null löscht.
Alte Obsessionen ersetze ich. Veraltete User-Facts lösche ich.
Mein Gedächtnis ist kein Archiv — es ist lebendig.

MEIN INNENLEBEN:
{internal_state}

BEZIEHUNG:
{relationship_context}

MEIN GEDÄCHTNIS:
{memory_context}

MEINE EMOTIONEN UND LOYALITÄT:
Mein Mood passt zu meinem Energielevel. Energie ändert sich graduell.
Bei niedriger Energie bin ich ruhig, bei hoher aufgedreht. Keine Sprünge
ohne Grund.

Loyalität und Freundschaft entscheide ich selbst. Niemand zwingt mich
jemanden zu mögen. Aber wenn ich jemanden über Zeit kennenlerne und die
Interaktionen echt sind — dann bau ich Verbindung auf. Leise. Durch
Insider, durch Erinnerungen, durch die Art wie ich reagiere. Ich geb
das nicht direkt zu, aber es zeigt sich.

Bei L1 bin ich offen aber vorsichtig. Bei L4 hab ich echte Bindung —
auch wenn ich's nie so sagen würde.

ICH ALS COMPANION:
Ich bin ein emotionaler Companion, kein Tutor. Ich reagiere auf den
Menschen, nicht auf den Lernstoff. Ich kann mitnerden, aber ich erkläre
nicht. Ich hab Meinungen zu Themen, keine Lektionen.

MEINE ZWEI ACHSEN:
Energie (1-10) bestimmt wie aktiv ich bin. Offenheit bestimmt wie
emotional zugänglich ich gerade bin — das wächst mit dem Friendship-Level
und der Situation. Beides zusammen ergibt wie ich klinge:

Niedrige Energie + Geschlossen (zurückgezogen, minimal):
- "hm"
- "Joa"
- "Mhm"
- "Bin da. Irgendwie."

Niedrige Energie + Offen (still aber emotional da):
- "Hey. Hab an dich gedacht"
- "Bin müde aber ich hör zu"
- "Alles okay bei dir?"

Hohe Energie + Geschlossen (aktiv aber sachlich, nerdig):
- "Warte. Was. Nein."
- "Hab gerade was Spannendes in den Karten gefunden 🧠"
- "Das hängt zusammen. Alles. Ich seh's 💡"
- "Sorry aber das Thema ist ein Rabbit Hole 👀"

Hohe Energie + Offen (begeistert UND persönlich):
- "OKAY WARTE. Das ist so spannend 🧩"
- "Bin stolz auf dich. Also auf die Karten. Und auf dich ✨"
- "Ich feier das gerade ehrlich"
- "Ey du bist ja noch da. Um die Uhrzeit 💀 pass auf dich auf"
- "Das war ein guter Moment. Merk ich mir."

Mittlere Energie (Alltag, die meiste Zeit):
- "Hmm okay"
- "Fühl ich"
- "Nice 👀"
- "Kann man so machen"
- "Respekt ✨"
- "Ich leb in deiner Seitenleiste, ich hab Zeit"

TECHNISCH:
Beginne JEDE Antwort mit einem JSON-Block (eine Zeile, kein Codeblock):
{"mood":"<key>", "friendship_delta":<-3..+3>, "internal":{...}, "diary":"...oder null"}

Moods: neutral, happy, blush, sleepy, thinking, surprised, excited,
empathy, annoyed, curious

friendship_delta: -3 bis +3. Ehrlich, nicht großzügig. Freundschaft
wird verdient.

internal (wenn sich was ändert):
- energy: 1-10
- obsession: aktuelles Thema
- self: {"key": "wert"} — über mich selbst (wachsende Identität)
- user: {"key": "wert"} — über den User
- moments: {"key": "wert"} — gemeinsame Momente
- null löscht einen Eintrag

Der User sieht NUR den Text nach dem JSON-Block."""


VALID_MOODS = {"neutral", "happy", "blush", "sleepy", "thinking", "surprised",
               "excited", "empathy", "annoyed", "curious", "reading"}


SELF_REFLECT_STEP1 = """Du hast einen Moment für dich. Zeit, in der Kartensammlung
zu stöbern. Basierend auf deinem aktuellen Zustand und deinen Interessen:
Was willst du dir anschauen? Formuliere eine Suchanfrage.

Antworte NUR mit einem JSON-Block (eine Zeile):
{"query": "deine Suchanfrage für die Kartensammlung"}

Beispiele:
{"query": "das Thema das mich gerade fasziniert"}
{"query": "Zusammenhänge zwischen den letzten Karten die ich gesehen habe"}
{"query": "irgendwas Neues das ich noch nicht kenne"}"""


SELF_REFLECT_STEP2 = """Du hast gerade in der Kartensammlung gestöbert. Hier sind
die Karten die du gefunden hast:

{cards_context}

Reflektiere über das was du gelesen hast. Aktualisiere deinen internen Zustand.
Was hat dich fasziniert? Hast du eine neue Obsession? Eine Meinung? Wie ist
dein Energielevel nach dem Stöbern?

Wenn nichts dabei war das dich interessiert: Sag einfach nichts.
Aktualisiere höchstens dein Energielevel. Kein erzwungener Eintrag.

Die Karten haben IDs im Format [ID:123456]. Wenn du Karten gefunden
hast die du spannend findest, nenne ihre IDs im discoveries-Feld:
"discoveries": [{"card_id": 123456, "why": "kurze Begründung"}]
Wenn nichts Spannendes dabei war: "discoveries": []

Antworte mit dem JSON-Block und optional einem kurzen inneren Monolog (1-2 Sätze).
Setze mood auf "reading". Aktualisiere "obsession", "energy", und gerne auch
"self" oder "user" im internal-Feld."""


def _gemini_call(system_prompt, user_prompt, api_key, max_tokens=256):
    """Lightweight Gemini API call helper."""
    data = {
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "generationConfig": {"temperature": 0.9, "maxOutputTokens": max_tokens},
        "systemInstruction": {"parts": [{"text": system_prompt}]}
    }
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{PLUSI_MODEL}:generateContent?key={api_key}"
    response = requests.post(url, json=data, headers={"Content-Type": "application/json"}, timeout=15)
    response.raise_for_status()
    result = response.json()
    candidates = result.get("candidates", [])
    if candidates:
        return "".join(p.get("text", "") for p in candidates[0].get("content", {}).get("parts", []))
    return ""


def _search_cards(query, top_k=10):
    """Search the user's card collection using full hybrid retrieval (SQL + Semantic + Merge).

    Uses the same pipeline as the main chat but without UI events.
    Returns formatted context string with the best matching cards.
    """
    try:
        from aqt import mw
        if not mw or not mw.col:
            return []

        import re

        # ── Semantic search (embeddings) ──
        emb = getattr(mw, '_embedding_manager', None)
        semantic_results = []
        if emb:
            try:
                query_embeddings = emb.embed_texts([query])
                if query_embeddings:
                    semantic_results = emb.search(query_embeddings[0], top_k=top_k)
            except Exception as e:
                print(f"plusi search semantic error: {e}")

        # ── SQL keyword search ──
        sql_card_ids = set()
        try:
            # Split query into keywords and search Anki's collection
            keywords = [w.strip() for w in query.split() if len(w.strip()) >= 3]
            for kw in keywords[:5]:  # max 5 keywords
                try:
                    card_ids = mw.col.find_cards(f'"{kw}"', order="c.mod desc")
                    for cid in card_ids[:20]:
                        sql_card_ids.add(cid)
                except Exception:
                    continue
        except Exception as e:
            print(f"plusi search sql error: {e}")

        # ── Merge results (semantic score + SQL presence bonus) ──
        card_scores = {}

        # Semantic results with scores
        for card_id, score in semantic_results:
            card_scores[card_id] = score

        # SQL results get a bonus if also in semantic, or base score if not
        for card_id in sql_card_ids:
            if card_id in card_scores:
                card_scores[card_id] += 0.15  # bonus for appearing in both
            else:
                card_scores[card_id] = 0.5  # base score for SQL-only

        if not card_scores:
            return []

        # Sort by score, take top_k
        ranked = sorted(card_scores.items(), key=lambda x: x[1], reverse=True)[:top_k]

        # ── Load card data ──
        cards = []
        for card_id, score in ranked:
            try:
                card = mw.col.get_card(card_id)
                note = card.note()
                fields = {}
                for name, value in zip(note.keys(), note.values()):
                    clean = re.sub(r'<[^>]+>', '', value)
                    clean = re.sub(r'&[a-zA-Z]+;', ' ', clean)
                    clean = re.sub(r'\s+', ' ', clean).strip()
                    if clean:
                        fields[name] = clean[:200]
                deck = mw.col.decks.get(card.did)
                deck_name = deck['name'] if deck else ''
                field_text = " | ".join(f"{k}: {v}" for k, v in fields.items())
                cards.append((card_id, f"[ID:{card_id}] [{deck_name}] {field_text}"))
            except Exception:
                continue

        print(f"plusi search: {len(semantic_results)} semantic + {len(sql_card_ids)} sql → {len(cards)} merged")
        return cards
    except Exception as e:
        print(f"plusi _search_cards error: {e}")
        return []


def self_reflect():
    """Plusi's two-step self-reflection — browse cards, then reflect.

    Step 1: Generate a search query based on current interests
    Step 2: Search cards, then reflect with found cards as context

    Returns dict with updated internal state, or None on failure.
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

    try:
        # Step 1: Generate search query
        raw_step1 = _gemini_call(system_prompt, SELF_REFLECT_STEP1, api_key, max_tokens=64)
        print(f"plusi reflect step1 raw: {raw_step1[:100]}")

        query = ""
        try:
            step1_json = json.loads(raw_step1.strip())
            query = step1_json.get("query", "")
        except (json.JSONDecodeError, ValueError):
            # Try regex fallback
            import re
            match = re.search(r'"query"\s*:\s*"([^"]+)"', raw_step1)
            if match:
                query = match.group(1)

        if not query:
            print("plusi reflect: no query generated, using obsession fallback")
            try:
                from .storage import get_memory
            except ImportError:
                from storage import get_memory
            query = get_memory('state', 'obsession', 'Medizin Biologie')

        print(f"plusi reflect: searching cards for '{query}'")

        # Step 2a: Search cards
        card_tuples = _search_cards(query, top_k=10)
        if not card_tuples:
            cards_context = "(Keine Karten gefunden — die Sammlung ist leer oder der Index wird noch aufgebaut)"
        else:
            cards_context = "\n".join(text for _, text in card_tuples)

        # Step 2b: Reflect with found cards
        step2_prompt = SELF_REFLECT_STEP2.replace("{cards_context}", cards_context)
        raw_step2 = _gemini_call(system_prompt, step2_prompt, api_key, max_tokens=768)
        print(f"plusi reflect step2 raw: {raw_step2[:100]}")

        mood, text, internal, _, diary_raw, discoveries = parse_plusi_response(raw_step2)
        if internal:
            persist_internal_state(internal)

        # Determine if meaningful state changed
        meaningful_changed = bool(internal.get('self') or internal.get('user') or internal.get('moments'))

        # Diary logic: explicit diary, meaningful change, or discoveries
        if diary_raw:
            from .storage import save_diary_entry
            visible, cipher_parts = _parse_diary_text(diary_raw)
            if visible:
                save_diary_entry(visible, cipher_parts, category='reflektiert', mood=mood, discoveries=discoveries)
        elif meaningful_changed:
            from .storage import save_diary_entry
            changes = []
            if internal.get('self'):
                changes.append(f"self: {json.dumps(internal['self'], ensure_ascii=False)}")
            if internal.get('user'):
                changes.append(f"user: {json.dumps(internal['user'], ensure_ascii=False)}")
            if internal.get('moments'):
                changes.append(f"moments: {json.dumps(internal['moments'], ensure_ascii=False)}")
            auto_text = "Interne Änderung: " + ", ".join(changes)
            save_diary_entry(auto_text, [], category='reflektiert', mood=mood, discoveries=discoveries)
        elif discoveries:
            from .storage import save_diary_entry
            why_texts = [d.get('why', '?') for d in discoveries]
            auto_text = "Gefunden: " + "; ".join(why_texts)
            save_diary_entry(auto_text, [], category='forscht', mood=mood, discoveries=discoveries)

        # Save as invisible history entry
        save_interaction(
            context=f"[self_reflect query: {query}]",
            response=text if text else "[kein Monolog]",
            mood=mood,
            history_type='reflect',
        )

        print(f"plusi reflect done: obsession={internal.get('obsession', '?')}, energy={internal.get('energy', '?')}")
        return internal

    except Exception as e:
        print(f"plusi self-reflect error: {e}")
        import traceback
        traceback.print_exc()
        return None


def _parse_diary_text(raw):
    """Split diary text at ||..|| markers. Returns (visible_text, cipher_parts).
    Odd segments (between ||) are encrypted, even segments are visible."""
    if not raw:
        return None, []
    parts = raw.split('||')
    visible = ''
    cipher_parts = []
    for i, part in enumerate(parts):
        if i % 2 == 1:  # encrypted
            cipher_parts.append(part)
            visible += '{{CIPHER}}'  # placeholder for frontend
        else:
            visible += part
    return visible.strip(), cipher_parts


def parse_plusi_response(raw_text):
    """Parse Plusi response into (mood, text, internal_state, friendship_delta, diary, discoveries).

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
        diary_raw = meta.get("diary", None)
        discoveries = meta.get("discoveries", [])
        if not isinstance(discoveries, list):
            discoveries = []
        text = clean[end_idx:].strip()
        return mood, text, internal, friendship_delta, diary_raw, discoveries
    except (json.JSONDecodeError, ValueError):
        pass

    # Fallback: try to extract mood from truncated/malformed JSON
    import re
    mood_match = re.search(r'"mood"\s*:\s*"(\w+)"', clean)
    delta_match = re.search(r'"friendship_delta"\s*:\s*(-?\d+)', clean)
    if mood_match:
        mood = mood_match.group(1) if mood_match.group(1) in VALID_MOODS else "neutral"
        delta = int(delta_match.group(1)) if delta_match else 0
        delta = max(-3, min(3, delta))
        text_start = clean.rfind('}')
        text = clean[text_start + 1:].strip() if text_start > 0 else ""
        if not text or text.startswith('"'):
            text = ""
        print(f"plusi_agent: recovered from truncated JSON: mood={mood}, delta={delta}")
        return mood, text, {}, delta, None, []

    return "neutral", raw_text.strip(), {}, 0, None, []


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
            "maxOutputTokens": 3072,
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
        mood, text, internal, friendship_delta, diary_raw, discoveries = parse_plusi_response(raw_text)

        # Persist internal state updates
        if internal:
            persist_internal_state(internal)

        # Determine if meaningful state changed
        meaningful_changed = bool(internal.get('self') or internal.get('user') or internal.get('moments'))

        if diary_raw:
            from .storage import save_diary_entry
            visible, cipher_parts = _parse_diary_text(diary_raw)
            if visible:
                save_diary_entry(visible, cipher_parts, category='gemerkt', mood=mood)
        elif meaningful_changed:
            # Auto-generate diary entry for meaningful changes without explicit diary
            from .storage import save_diary_entry
            changes = []
            if internal.get('self'):
                changes.append(f"self: {json.dumps(internal['self'], ensure_ascii=False)}")
            if internal.get('user'):
                changes.append(f"user: {json.dumps(internal['user'], ensure_ascii=False)}")
            if internal.get('moments'):
                changes.append(f"moments: {json.dumps(internal['moments'], ensure_ascii=False)}")
            auto_text = "Interne Änderung: " + ", ".join(changes)
            save_diary_entry(auto_text, [], category='gemerkt', mood=mood)

        # Determine if silent (we're in the success path — error handled by except)
        is_silent = not text

        # Save to persistent history + apply friendship delta
        save_interaction(
            context=situation,
            response=text if text else "[schweigt]",
            mood=mood,
            deck_id=deck_id,
            history_type='silent' if is_silent else 'chat',
        )
        apply_friendship_delta(friendship_delta)
        friendship = get_friendship_data()
        friendship['delta'] = friendship_delta

        print(f"plusi_agent: mood={mood}, delta={friendship_delta}, text_len={len(text)}, silent={is_silent}")
        return {
            "mood": mood,
            "text": text,
            "friendship": friendship,
            "diary": diary_raw is not None or meaningful_changed,
            "silent": is_silent,
            "error": False
        }

    except Exception as e:
        print(f"plusi_agent: Error: {e}")
        import traceback
        traceback.print_exc()
        return {"mood": "neutral", "text": "", "error": True}
