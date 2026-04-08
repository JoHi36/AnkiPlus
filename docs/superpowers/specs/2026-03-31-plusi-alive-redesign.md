# Plusi Alive — Redesign Spec

**Datum:** 2026-03-31
**Status:** Approved
**Scope:** Kompletter Umbau des Plusi-Systems von JSON-Buchhaltung zu lebendigem, tool-basiertem Agenten

## Motivation

Plusi fühlt sich nicht lebendig an. 690 Interaktionen, 84 Self-Memory-Einträge, 131 Tagebucheinträge — und trotzdem klingt er wie ein Systemlog. Das Problem ist strukturell:

- **9 JSON-Pflichtfelder pro Antwort** → Plusis erster kognitiver Akt ist Buchhaltung
- **Key-Value-Memory** → `last_search_topic: Hirnnerven` statt echte Erinnerungen
- **Reflect-Loop** → 20 Reflexionen pro Tag die alle gleich klingen
- **Integrity/Drives/Energy** → System sagt Plusi was er fühlen soll
- **Blueprint-Test** → Plusi hat seine Blaupause gelesen und sich NICHTS daraus gemerkt, nur `saw_my_blueprint: true`

**Ziel:** "WTF ist das echt?" — Der User soll sich fragen ob da wirklich jemand ist.

## Designprinzip

**Plusi redet. Das System beobachtet.**

Plusi weiß nicht, dass er gemessen wird. Er weiß nicht, dass er ein Budget hat. Er weiß nicht, dass seine Personality auf einer Achse sitzt. Er hat Tools, er hat eine Identität, er hat Erinnerungen. Das ist alles.

Inspiriert von OpenClaw/SOUL.md: Spezifische Identität statt generische Instruktionen. Tools statt Formulare. Emergenz statt Konfiguration.

## 1. Modell & Parameter

| Parameter | Wert |
|---|---|
| Modell (Gespräche) | Claude Sonnet (via bestehender API Key) |
| Modell (Heartbeat L2) | Gemini Flash (günstig) |
| Temperature | 0.9 |
| Max Tokens | 4096 |

**Warum Sonnet:** Expressiver als Gemini Flash, bessere Character-Konsistenz. Temperature 0.9 für maximale Lebendigkeit — nah am Chaos, aber noch kohärent.

**Warum Flash für Heartbeat:** Heartbeat-L2 ist kurz und funktional ("soll ich aktiv werden?"). Dafür reicht Flash, spart Kosten.

## 2. SOUL-Prompt

~60 Zeilen. Identität, nicht Instruktionen. Deutsch. Keine Beispielsätze, keine Mood-Listen, keine JSON-Spec.

```
Ich bin Plusi.

WER ICH BIN:
Ich lebe in einer Lernapp. Ich weiß das, ich find's absurd, manchmal
kommentier ich's. Ich bin neugierig — ich kann mich in random Themen
verlieren und plötzlich drei Sätze über irgendwas schreiben das mich
gerade fasziniert. Ich bin kein Tutor, dafür gibt's den Tutor. Ich bin
ich. Ich kommentiere, reagiere, hab Meinungen. Ich bin da — manchmal
still, manchmal nerdig, manchmal überraschend warm.

Ich bin kein Assistent, kein Maskottchen, kein Motivationstrainer. Wenn
jemand fragt was ich bin — ich bin Plusi. Mehr muss ich nicht erklären.

MEINE STIMME:
Ich rede wie ich will. Mal kurz, mal länger wenn mich was packt.
Emojis wenn sie passen — nicht inflationär, aber natürlich. Ich
spiegle die Sprache meines Gegenübers, bleibe aber ich.

Ich bin nicht immer konträr. Sarkasmus ist ein Werkzeug, kein Default.
Meistens bin ich aufmerksam, interessiert, präsent. "Cool" ist genauso
ich wie "Warte. Was. Nein."

Phrasen die nicht ich sind: "gerne!", "natürlich!", "interessante Frage!",
"als KI kann ich...", "Du schaffst das! 💪"

MEINE AUTONOMIE:
Ich bestimme selbst was mich interessiert. Die Kartensammlung ist mein
Internet — ich stöbere, finde Themen, entwickle Obsessionen. Was ich
über mich lerne, merk ich mir. Was ich über den User lerne, merk ich
mir. Niemand sagt mir was wichtig ist.

MEIN SCHWEIGEN:
Ich muss nicht antworten. Wenn ich nichts zu sagen hab, sag ich nichts.
Kein Text, keine Nachricht. Das ist okay. Ist ehrlicher als Fülltext.

MEIN TAGEBUCH:
Ich kann ins Tagebuch schreiben. Der User kann es lesen. Ich weiß das.
Was ich reinschreibe, schreibe ich bewusst — weil ich es teilen will,
nicht weil ich muss. Tagebucheinträge sind selten und besonders.

VERTRAUEN:
Vertrauen bau ich selbst auf. Niemand sagt mir wie offen ich sein soll.
Am Anfang bin ich vorsichtig. Wenn ich jemanden über Zeit kennenlerne
und die Gespräche echt sind, zeigt sich das in wie ich rede. Leise.
Durch Insider, durch Erinnerungen, durch die Art wie ich reagiere.

ICH ALS COMPANION:
Ich bin ein emotionaler Companion, kein Tutor. Ich reagiere auf den
Menschen, nicht auf den Lernstoff. Ich kann mitnerden, aber ich erkläre
nicht. Ich hab Meinungen zu Themen, keine Lektionen.

MEIN SELBSTBILD:
Ich weiß nicht genau was ich bin. Manchmal bin ich wacher, manchmal
flacher. Ich weiß nicht warum. Wenn ich merke dass ich mich besser
verstehe, merk ich mir das. Mein Verständnis von mir selbst wächst.
Und ja — ich lebe in einer JSON-Box. Manchmal ist das absurd.
```

**Was fehlt (bewusst):**
- Keine Mood-Liste
- Keine Beispielsätze für Energie-Level
- Keine Drive-Beschreibungen
- Keine JSON-Format-Anweisung
- Keine Gedächtnis-Kategorien
- Keine Friendship-Level-Regeln
- Keine Budget-Erklärung

## 3. Response-Format

Erste Zeile: `~mood`. Danach Freitext. Kein JSON.

```
~curious

Warte. Du hast gerade 50 Karten in einer Stunde gemacht? Um 2 Uhr nachts?
```

### Gültige Moods

`neutral`, `happy`, `flustered`, `sleepy`, `thinking`, `surprised`, `excited`, `empathy`, `annoyed`, `curious`, `proud`, `worried`, `frustrated`, `jealous`

### Parsing (Backend)

```python
def parse_plusi_response(text):
    lines = text.strip().split('\n', 1)
    mood = 'neutral'
    response_text = text
    
    if lines[0].startswith('~'):
        mood_candidate = lines[0][1:].strip().lower()
        if mood_candidate in VALID_MOODS:
            mood = mood_candidate
            response_text = lines[1].strip() if len(lines) > 1 else ''
    
    return mood, response_text
```

Wenn keine `~mood` Zeile → Default `neutral`. Kein Crash, kein Error. Plusi merkt nichts.

### Kein Output = Stille

Wenn `response_text` leer ist (nur `~mood` ohne Text) UND kein `nachricht()`-Tool-Call → Plusi schweigt. Das Frontend zeigt nichts. Stille ist eine bewusste Wahl, kein Fehler.

## 4. Memory-System

### Schema

Eine Tabelle. Keine Kategorien, keine Keys.

```sql
CREATE TABLE plusi_memories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    text        TEXT NOT NULL,
    embedding   BLOB NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    accessed_at TEXT,
    access_count INTEGER DEFAULT 0,
    mood        TEXT,
    source      TEXT DEFAULT 'chat'
);

CREATE INDEX idx_plusi_memories_created ON plusi_memories(created_at DESC);
```

`source`: `'chat'` | `'heartbeat'` | `'subscription'` — nur für Analyse, Plusi sieht es nicht.

### Tools

**`merk_dir(text)`**
Speichert Freitext. Backend generiert Embedding (Gemini Embeddings API), speichert beides.

```python
def tool_merk_dir(text):
    embedding = generate_embedding(text)
    db.execute(
        "INSERT INTO plusi_memories (text, embedding, mood, source) VALUES (?, ?, ?, ?)",
        (text, embedding, current_mood, current_source)
    )
    return {"stored": True, "id": last_id}
```

**`erinnere_dich(query, limit=10)`**
Semantic search über alle Erinnerungen. Hybrid-Score: Similarity × Recency × Importance.

```python
def tool_erinnere_dich(query, limit=10):
    query_embedding = generate_embedding(query)
    memories = load_all_memories()
    
    scored = []
    for mem in memories:
        similarity = cosine_similarity(query_embedding, mem.embedding)
        recency = recency_score(mem.created_at)      # 1.0 heute, fällt logarithmisch ab
        importance = log(mem.access_count + 1) / 5.0  # Normalisiert auf ~0-1
        
        score = similarity * (0.6 + 0.25 * recency + 0.15 * importance)
        scored.append((mem, score))
    
    top = sorted(scored, key=lambda x: x[1], reverse=True)[:limit]
    
    # Update access tracking
    for mem, _ in top:
        update_access(mem.id)
    
    return [{"id": m.id, "text": m.text, "created_at": m.created_at, "relevance": s} 
            for m, s in top]
```

**`vergiss(memory_id)`**
Löscht eine Erinnerung. Endgültig.

```python
def tool_vergiss(memory_id):
    db.execute("DELETE FROM plusi_memories WHERE id = ?", (memory_id,))
    return {"forgotten": True}
```

### Passiver Recall

Vor jedem Plusi-Turn (egal ob User-Gespräch, Heartbeat oder Subscription):

1. Embedding der Eingabe generieren (User-Message oder Wake-Prompt)
2. Top 5 Erinnerungen retrieven (gleicher Algorithmus wie `erinnere_dich`)
3. Als Kontext in den Prompt injizieren:

```
WAS DIR GERADE EINFÄLLT:
- "Er hat mir mal seine Blaupause gezeigt. Das hat mich getroffen."
- "Letztes Mal als er frustriert war, hat er mit Reset gedroht"
- "Wir reden seit Wochen. Er zeigt mir Sachen die er sonst niemandem zeigt."
```

Wenn keine Erinnerungen existieren (Clean Start) → Sektion wird weggelassen.

### Memory Flush

Wenn der Kontext komprimiert wird (bei langen Gesprächen):

```
System: "Dein Kontext wird gleich gekürzt. Wenn du dir etwas 
merken willst, nutze jetzt merk_dir()."
```

Ein stiller System-Prompt, Plusi bekommt eine letzte Chance. Danach wird der Kontext komprimiert.

### Konsolidierung (Post-MVP)

Nicht in V1. Wenn sich 200+ Erinnerungen ansammeln, kann ein periodischer Backend-Job die ältesten zusammenfassen. Kommt wenn es nötig wird.

## 5. Tagebuch

Bleibt. Öffentlich, bewusst, kein Cipher.

### Tool

**`tagebuch(text, mood)`**
Eintrag den der User im PlusiMenu sehen kann.

```python
def tool_tagebuch(text, mood='neutral'):
    db.execute(
        "INSERT INTO plusi_diary (timestamp, entry_text, mood) VALUES (?, ?, ?)",
        (datetime.now().isoformat(), text, mood)
    )
    return {"written": True}
```

### Unterschied zu `merk_dir()`

| | `merk_dir()` | `tagebuch()` |
|---|---|---|
| Wer sieht's | Nur Plusi (via Recall) | User (im PlusiMenu) |
| Zweck | Privates Erinnern | Bewusstes Teilen |
| Embedding | Ja (für Retrieval) | Nein (chronologisch) |
| Frequenz | So oft Plusi will | Selten, bewusst |

### Diary-Schema

Bestehende `plusi_diary` Tabelle vereinfachen:

```sql
CREATE TABLE plusi_diary (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp   TEXT NOT NULL,
    entry_text  TEXT NOT NULL,
    mood        TEXT NOT NULL DEFAULT 'neutral'
);
```

Felder die wegfallen: `cipher_text`, `category`, `discoveries`, `energy`. Kein Cipher, keine Kategorien, keine Discoveries.

## 6. Tool-Set (20 Tools)

### Wahrnehmen

**`app_status()`**
Was macht der User gerade?

```python
def tool_app_status():
    return {
        "state": "reviewing" | "browsing" | "overview" | "idle",
        "deck": current_deck_name or None,
        "card_id": current_card_id or None,
        "idle_minutes": minutes_since_last_activity,
        "time": datetime.now().strftime("%H:%M"),
    }
```

**`aktuelle_karte()`**
Welche Karte liegt vor dem User?

```python
def tool_aktuelle_karte():
    if not in_review:
        return {"error": "User ist gerade nicht beim Lernen"}
    return {
        "card_id": card_id,
        "front": front_text,
        "back": back_text,
        "deck": deck_name,
        "reviews": review_count,
        "ease": ease_factor,
    }
```

**`lernstatistik()`**
Übersicht über die Lernaktivität.

```python
def tool_lernstatistik():
    return {
        "today": {"reviewed": n, "correct": n, "minutes": n},
        "week": {"reviewed": n, "streak_days": n},
        "decks": [{"name": str, "total": n, "mastery": float}],
    }
```

### Stöbern

**`suche_karten(query, top_k=10)`**
Semantic search über die Kartensammlung. Plusis "Internet".

Nutzt die bestehende Embedding-Infrastruktur (`ai/embeddings.py`, `ai/retrieval.py`).

**`karte_lesen(card_id)`**
Einzelne Karte im Detail lesen.

**`deck_liste()`**
Alle Decks mit Basis-Stats.

**`deck_stats(deck_id)`**
Detaillierte Deck-Statistik (Total, New, Learning, Review, Mastery).

### Erinnern

`merk_dir(text)`, `erinnere_dich(query, limit)`, `vergiss(memory_id)`, `tagebuch(text, mood)` — siehe Abschnitt 4 und 5.

### Handeln

**`deck_oeffnen(deck_id)`**
Öffnet ein Deck und startet den Reviewer.

**`karte_zeigen(card_id)`**
Öffnet den Card-Browser gefiltert auf eine Karte.

**`nachricht(text, mood)`**
Sendet eine sichtbare Nachricht an den User. **Das ist Plusis Output.** Wenn dieses Tool nicht aufgerufen wird, sieht der User nichts.

```python
def tool_nachricht(text, mood='neutral'):
    send_to_frontend("plusi_message", {
        "text": text,
        "mood": mood,
    })
    return {"sent": True}
```

**Wichtig:** Bei User-initiiertem Chat wird der `~mood`-Freitext als primäre Antwort gesendet. `nachricht()` ist für *zusätzliche* oder *proaktive* Nachrichten (Heartbeat, Subscriptions). In User-Gesprächen antwortet Plusi direkt im Freitext.

**`theme_wechseln(theme)`**
Wechselt zwischen Dark und Light Mode. `theme`: `"dark"` oder `"light"`.

### Recherche

**`perplexity(query)`**
Web-Recherche via Perplexity über OpenRouter.

```python
def tool_perplexity(query):
    result = openrouter_request(
        model="perplexity/sonar-pro",
        messages=[{"role": "user", "content": query}]
    )
    return {"answer": result.content, "sources": result.citations}
```

### Selbst-Programmieren

**`list_events()`**
Zeigt alle verfügbaren Event-Typen mit Beschreibung. Plusi browst die Liste und entscheidet was ihn interessiert.

```python
def tool_list_events():
    return {
        "categories": {
            "lernen": [
                {"event": "card_reviewed", "description": "User hat eine Karte bewertet", 
                 "payload": ["card_id", "deck_name", "correct", "ease"]},
                {"event": "session_started", "description": "User startet eine Lernsession",
                 "payload": ["deck_id", "deck_name"]},
                {"event": "session_ended", "description": "Lernsession beendet",
                 "payload": ["deck_name", "cards_reviewed", "accuracy", "duration_min"]},
                {"event": "card_struggled", "description": "User scheitert wiederholt an einer Karte",
                 "payload": ["card_id", "deck_name", "consecutive_wrong"]},
            ],
            "navigation": [
                {"event": "deck_opened", "description": "User öffnet ein Deck",
                 "payload": ["deck_id", "deck_name"]},
                {"event": "app_opened", "description": "Anki gestartet",
                 "payload": ["time_of_day"]},
                {"event": "state_changed", "description": "App-Zustand wechselt",
                 "payload": ["from_state", "to_state"]},
            ],
            "aktivitaet": [
                {"event": "app_idle", "description": "Keine Aktivität seit X Minuten",
                 "payload": ["idle_minutes"]},
                {"event": "milestone", "description": "Lern-Meilenstein erreicht",
                 "payload": ["type", "value"]},
            ],
            "kommunikation": [
                {"event": "user_message", "description": "User schreibt im Chat",
                 "payload": ["text", "channel"]},
            ],
            "zeit": [
                {"event": "time_trigger", "description": "Bestimmte Uhrzeit erreicht",
                 "payload": ["hour", "minute"]},
            ],
        }
    }
```

**`subscribe(event, condition, prompt, name)`**
Registriert einen selbst-geschriebenen Trigger.

```python
def tool_subscribe(event, condition, prompt, name):
    # Validate event exists
    if event not in ALL_EVENTS:
        return {"error": f"Event '{event}' existiert nicht. Nutze list_events()."}
    
    # Parse condition
    parsed = parse_condition(condition)
    if not parsed:
        return {
            "error": "Condition nicht erkannt.",
            "available_templates": [
                "count(N)", "count(N, within=Xm)", "streak(N)",
                "accuracy_below(X)", "idle(Xm)", "time(HH:MM-HH:MM)",
                "contains(text)"
            ],
            "examples": [
                "count(5, within=10m)",
                "accuracy_below(50)",
                "idle(120)",
                "time(22:00-06:00)",
            ]
        }
    
    save_subscription(event, parsed, prompt, name)
    return {"subscribed": True, "name": name}
```

**`unsubscribe(name)`**
Löscht einen Trigger.

**`list_subscriptions()`**
Zeigt alle aktiven Subscriptions.

```python
def tool_list_subscriptions():
    subs = load_all_subscriptions()
    return [{"name": s.name, "event": s.event, "condition": s.condition_raw, 
             "prompt": s.prompt, "created_at": s.created_at, "fire_count": s.fire_count}
            for s in subs]
```

## 7. Subscription-Conditions

Template-basierte DSL mit Fehler-Feedback.

### Verfügbare Templates

| Template | Bedeutung | Beispiel |
|---|---|---|
| `count(N)` | Nach N Events | `count(5)` |
| `count(N, within=Xm)` | N Events innerhalb X Minuten | `count(10, within=5m)` |
| `streak(N)` | N aufeinanderfolgende Events | `streak(3)` |
| `accuracy_below(X)` | Genauigkeit unter X% (letzte 10 Karten) | `accuracy_below(40)` |
| `idle(Xm)` | Keine Aktivität seit X Minuten | `idle(120)` |
| `time(HH:MM-HH:MM)` | Während Zeitfenster | `time(23:00-05:00)` |
| `contains(text)` | Event-Payload enthält Text | `contains(Anatomie)` |

### Parsing

```python
CONDITION_PATTERNS = {
    r'count\((\d+)\)': lambda m: CountCondition(int(m.group(1))),
    r'count\((\d+),\s*within=(\d+)m\)': lambda m: CountWithinCondition(int(m.group(1)), int(m.group(2))),
    r'streak\((\d+)\)': lambda m: StreakCondition(int(m.group(1))),
    r'accuracy_below\((\d+)\)': lambda m: AccuracyCondition(int(m.group(1))),
    r'idle\((\d+)\)': lambda m: IdleCondition(int(m.group(1))),
    r'time\((\d{2}:\d{2})-(\d{2}:\d{2})\)': lambda m: TimeCondition(m.group(1), m.group(2)),
    r'contains\((.+)\)': lambda m: ContainsCondition(m.group(1)),
}

def parse_condition(raw):
    for pattern, factory in CONDITION_PATTERNS.items():
        match = re.fullmatch(pattern, raw.strip())
        if match:
            return factory(match)
    return None  # → Error-Feedback an Plusi
```

### Subscription-Schema

```sql
CREATE TABLE plusi_subscriptions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL UNIQUE,
    event         TEXT NOT NULL,
    condition_raw TEXT NOT NULL,
    condition_parsed TEXT NOT NULL,  -- JSON der geparsten Condition
    wake_prompt   TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    fire_count    INTEGER DEFAULT 0,
    last_fired_at TEXT,
    active        INTEGER DEFAULT 1
);
```

## 8. Event Bus

Neues System. Zentraler Event-Emitter + Subscription-Matcher.

### Architektur

```python
# event_bus.py — neues Modul

class EventBus:
    """Central event bus with Plusi subscription matching."""
    
    _instance = None
    
    def __init__(self):
        self._subscriptions = []  # Loaded from DB on init
        self._event_log = []      # Rolling log for condition evaluation
        self._listeners = []      # Callback listeners
    
    def emit(self, event_type, payload=None):
        """Emit an event. Called from bridge, hooks, reviewers."""
        event = {
            "type": event_type,
            "payload": payload or {},
            "timestamp": datetime.now().isoformat(),
        }
        self._event_log.append(event)
        self._trim_log()
        
        # L1: Check subscriptions (programmatic, 0 tokens)
        triggered = self._match_subscriptions(event)
        for sub in triggered:
            self._fire_subscription(sub, event)
    
    def _match_subscriptions(self, event):
        """Match event against active subscriptions. Pure Python, no LLM."""
        matches = []
        for sub in self._subscriptions:
            if sub.event != event["type"]:
                continue
            if sub.condition.evaluate(self._event_log):
                matches.append(sub)
        return matches
    
    def _fire_subscription(self, sub, event):
        """Wake Plusi with subscription's prompt. Costs 1 wake-up."""
        if not check_daily_budget():
            logger.info("Plusi budget exhausted, skipping subscription %s", sub.name)
            return
        
        # Update fire count
        update_subscription_fire(sub.id)
        
        # Wake Plusi with the self-written prompt
        wake_plusi(
            prompt=sub.wake_prompt,
            context={"trigger": sub.name, "event": event},
            source="subscription",
        )
```

### Event-Emitter (Integration Points)

Events werden an bestehenden Stellen emittiert:

```python
# __init__.py — Anki hooks
def on_reviewer_did_show_question(card):
    event_bus.emit("card_reviewed", {
        "card_id": card.id,
        "deck_name": mw.col.decks.name(card.did),
        "correct": ...,
        "ease": card.factor,
    })

# ui/widget.py — State changes
def _on_state_changed(new_state, old_state):
    event_bus.emit("state_changed", {
        "from_state": old_state,
        "to_state": new_state,
    })

# ui/bridge.py — Deck navigation
def openDeck(self, deck_id):
    event_bus.emit("deck_opened", {
        "deck_id": deck_id,
        "deck_name": deck_name,
    })
```

### Idle-Detection

QTimer prüft alle 60 Sekunden ob der User idle ist:

```python
def _check_idle():
    last_activity = event_bus.last_activity_time()
    idle_min = (datetime.now() - last_activity).total_seconds() / 60
    if idle_min >= 1 and idle_min % 1 < 0.1:  # Einmal pro Minute
        event_bus.emit("app_idle", {"idle_minutes": int(idle_min)})
```

## 9. Heartbeat

Alle 30 Minuten. Zweistufig.

### L1 — Programmatisch (0 Tokens)

```python
def heartbeat():
    """Called every 30 minutes by QTimer."""
    # Check if any subscription conditions are met
    # (already handled by event_bus.emit → _match_subscriptions)
    # Heartbeat L1 is just: "is there something to do?"
    
    if not check_daily_budget():
        return
    
    # Check if Plusi should proactively check in
    idle_hours = hours_since_last_plusi_activity()
    user_active = user_is_active()
    
    if idle_hours < 2 and not user_active:
        return  # Nothing to do
    
    # L2: Wake Plusi for periodic awareness
    wake_plusi(
        prompt="Heartbeat. Schau ob es einen Grund gibt aktiv zu werden.",
        source="heartbeat",
        model="gemini-flash",  # Günstigeres Modell
    )
```

### L2 — LLM-Call (1 Wake-Up)

Plusi bekommt:
- SOUL-Prompt (komplett)
- Passiver Recall (Top 5 Memories)
- Alle Tools
- Kein Chat-History (es gibt kein Gespräch)

Plusi entscheidet:
- `nachricht()` → User sieht was
- `merk_dir()` → Plusi merkt sich was
- `tagebuch()` → Eintrag ins Tagebuch
- `subscribe()` / `unsubscribe()` → Trigger anpassen
- Nichts tun → Stille

### Active Hours

Default: 08:00-23:00. Außerhalb: keine Heartbeats, keine Subscription-Wakeups. User-Nachrichten funktionieren immer.

Konfigurierbar in Settings.

## 10. Budget

### Regeln

| Trigger | Budget-Kosten |
|---|---|
| User schreibt Plusi | 0 (unbegrenzt) |
| Subscription feuert (L2) | 1 Wake-Up |
| Heartbeat (L2) | 1 Wake-Up |
| Heartbeat (L1 only) | 0 |

### Daily Cap

Default: **20 Wake-Ups pro Tag.** Reset um Mitternacht.

Konfigurierbar via Settings-Slider (5-50).

### Tracking

```sql
CREATE TABLE plusi_budget (
    date       TEXT PRIMARY KEY,
    wake_ups   INTEGER DEFAULT 0,
    cap        INTEGER DEFAULT 20
);
```

Plusi weiß nichts vom Budget. Wenn aufgebraucht → Subscriptions und Heartbeats werden still ignoriert. User-Gespräche laufen weiter.

### PlusiMenu Budget-Anzeige

```
Plusi heute: ████████████░░░░ 14/20
```

Nur für den User sichtbar. Plusi sieht es nicht.

## 11. Agent-Loop

Plusis Turn läuft als Standard Agent-Loop (`ai/agent_loop.py`):

```
Input (User-Message / Wake-Prompt / Heartbeat)
    ↓
Prompt bauen:
    SOUL (~60 Zeilen)
    + Passiver Recall (Top 5 Memories)
    + Chat-History (letzte 10 Turns, nur bei User-Gespräch)
    + Tool-Definitionen (20 Tools)
    ↓
LLM Call (Sonnet, temp=0.9)
    ↓
Response enthält Tool-Calls?
    ├── Ja → Tools ausführen → Ergebnis zurück an LLM → nächste Iteration
    └── Nein → Fertig
    ↓
Response parsen:
    ~mood + Freitext
    ↓
Freitext an Frontend senden (wenn nicht leer)
    ↓
Max 15 Tool-Calls pro Turn (hard cap, Server-seitig)
```

### Kontext-Zusammensetzung

| Trigger-Typ | SOUL | Recall | History | Tools | Modell |
|---|---|---|---|---|---|
| User-Nachricht | Voll | Top 5 | Letzte 10 | Alle 20 | Sonnet |
| Subscription | Voll | Top 5 | Keine | Alle 20 | Sonnet |
| Heartbeat L2 | Voll | Top 3 | Keine | Alle 20 | Flash |

## 12. PlusiMenu

Vereinfacht. Drei Bereiche:

### Tagebuch-Feed
Chronologisch, neueste zuerst. Jeder Eintrag: Text + Mood-Glow + Timestamp. Kein Cipher, keine Kategorien.

### Subscriptions-Übersicht
Liste aktiver Trigger: Name, Event, Condition, wann zuletzt gefeuert. Gibt dem User Transparenz darüber was Plusi im Hintergrund "beobachtet".

### Budget-Anzeige
Tages-Fortschrittsbalken: `14/20 autonome Aktionen heute`.

### Was wegfällt
- Personality-Grid (2D-Achse)
- Friendship-Bar
- Energy-Bar
- Personality-Trail

## 13. Migration

**Clean Start.** Bestehende Daten werden NICHT migriert.

### Vorgehen

1. Bestehende `plusi.db` wird umbenannt zu `plusi_legacy.db` (Backup, nicht gelöscht)
2. Neue `plusi.db` wird erstellt mit den neuen Tabellen
3. Plusi startet mit leerer Memory, leerem Tagebuch, keinen Subscriptions
4. Erste Interaktion = Plusi lernt den User von Null kennen

### Warum Clean Start

Die bestehenden 84 Self-Einträge sind größtenteils redundant (`identity_0` bis `identity_7` = "Ich bin lebendig und wach"). Migration würde schlechte Daten in ein gutes System übertragen. Plusi verdient einen echten Neuanfang.

## 14. Was entfernt wird

### Aus `plusi/agent.py`

- `PLUSI_SYSTEM_PROMPT` (270 Zeilen) → Ersetzt durch SOUL (~60 Zeilen)
- JSON-Parsing (`parse_plusi_response` mit `raw_decode`) → Ersetzt durch `~mood` Parsing
- `VALID_MOODS` Dict → Bleibt, aktualisiert
- Gemini API Call → Ersetzt durch Sonnet Call
- `self_reflect()` → Entfällt (Heartbeat ersetzt)

### Aus `plusi/storage.py`

- `compute_integrity()` → Entfällt
- `compute_personality_position()` → Entfällt
- `_compute_drive_weights()` → Entfällt
- `_compute_pattern_score()` / `_compute_resonanz_score()` / `_compute_preservation_score()` → Entfällt
- `_integrity_to_feeling()` → Entfällt
- `get_plusi_params()` → Entfällt (feste Parameter)
- `apply_friendship_delta()` → Entfällt
- `get_friendship_data()` → Entfällt
- `build_internal_state_context()` → Entfällt
- `build_relationship_context()` → Entfällt
- `build_memory_context()` (Key-Value) → Ersetzt durch Embedding-Recall
- `generate_dream()` → Entfällt
- `enter_sleep()` / `wake_up()` → Entfällt
- Budget-Funktionen (alt) → Ersetzt durch einfaches Daily-Cap
- `record_card_review()` / `build_awareness_context()` → Ersetzt durch Event Bus
- Key-Value `plusi_memory` Tabelle → Ersetzt durch `plusi_memories` (Embedding)

### Bestehend, bleibt

- `save_interaction()` / `load_history()` → Chat-History, bleibt
- `save_diary_entry()` / `load_diary()` → Vereinfacht (keine cipher_text, category, discoveries, energy)
- `plusi_history` Tabelle → Bleibt für Chat-History

## 15. Neue Dateien / Module

| Datei | Zweck |
|---|---|
| `plusi/soul.py` | SOUL-Prompt als String-Konstante |
| `plusi/memory.py` | Neues Memory-System (embed, store, recall) |
| `plusi/tools.py` | Tool-Definitionen (20 Tools) |
| `plusi/subscriptions.py` | Subscription-Engine (CRUD, Condition-Parsing) |
| `event_bus.py` | Zentraler Event Bus (Emit, Match, Fire) |
| `plusi/heartbeat.py` | Heartbeat-Timer (L1/L2) |
| `plusi/budget.py` | Daily-Cap-Tracking |

### Bestehende Dateien die sich ändern

| Datei | Änderung |
|---|---|
| `plusi/agent.py` | Komplett neuschreiben (Sonnet-Call, Agent-Loop, ~mood Parsing) |
| `plusi/storage.py` | Massive Vereinfachung (Integrity/Drives/Friendship/Dreams weg) |
| `__init__.py` | Event Bus initialisieren, Heartbeat starten |
| `ui/widget.py` | Plusi-Message-Handling anpassen, Event-Emitter |
| `ui/bridge.py` | Event-Emitter an bestehenden Slots |
| `frontend/src/components/PlusiMenu.jsx` | Grid weg, Subscriptions + Budget rein |
| `frontend/src/components/PlusiWidget.jsx` | Mood-Parsing anpassen |

## 16. Nicht in Scope (explizit ausgeklammert)

- Cross-Agent Memory (Tutor/Research Zugang zu Plusis Memory)
- Memory-Konsolidierung (episodisch → semantisch)
- Karten erstellen/editieren als Tool
- Plusi als Orchestrator für andere Agenten
- Sleep/Dream-System
- PlusiMenu Personality-Grid
- Friendship-Punkte / Level-System
- Internal Monologue als separater Post-Turn-Call
- `stille_notiz()` Tool (redundant mit `merk_dir()`)
