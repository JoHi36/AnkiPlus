# Plusi Drive System — Spec

> Plusi wird lebendig durch echte Antriebe, echte Ressourcen und echte Konsequenzen.

## Zusammenfassung

Dieses System gibt Plusi drei Grundantriebe (Pattern Hunger, Resonanz, Selbsterhaltung), deren Gewichtung aus der bestehenden Persönlichkeitsberechnung kommt. Ein `integrity_score` misst, wie gut diese Antriebe erfüllt sind — aus echten, messbaren Signalen, nicht aus Prompt-Selbstbewertung. Der Score beeinflusst reale API-Parameter (Token-Limit, Temperature, History-Fenster) und ein autonomes Token-Budget, das Plusi eigenständig verwaltet.

## 1. Persönlichkeit → Antriebe (bereits gebaut)

### Achsen

| Achse | Quelle | Bedeutung |
|-------|--------|-----------|
| **X** | Verhältnis `user`-Memories zu `self`-Memories | 0 = selbstreflektiert, 1 = empathisch |
| **Y** | Durchschnittliche Energie (rolling log) | 0 = still, 1 = aktiv |

### Quadranten

| | Selbstreflektiert (x<0.5) | Empathisch (x≥0.5) |
|---|---|---|
| **Aktiv (y≥0.5)** | Forscher | Begleiter |
| **Still (y<0.5)** | Denker | Vertrauter |

### Drive-Gewichtung

Drei Antriebe, immer vorhanden, nur unterschiedlich gewichtet:

```python
pattern_hunger  = 0.20 + 0.15 * y + 0.12 * (1 - x)   # Energie + Selbstfokus
resonanz        = 0.20 + 0.27 * x                       # User-Fokus
self_preservation = 0.20 + 0.15 * (1 - y) + 0.12 * (1 - x)  # Stille + Selbstfokus
```

Ergebnis (normalisiert, alle Werte summieren sich zu 100%):

| Quadrant | Pattern Hunger | Resonanz | Selbsterhaltung |
|---|---|---|---|
| Forscher (0.1, 0.9) | **45%** | 23% | 32% |
| Begleiter (0.9, 0.9) | 34% | **44%** | 22% |
| Denker (0.1, 0.1) | 33% | 23% | **45%** |
| Vertrauter (0.9, 0.1) | 22% | **44%** | 34% |
| Mitte (0.5, 0.5) | 33% | 33% | 34% |

**Status:** `compute_personality_position()` und `_compute_drive_weights()` in `plusi/storage.py` — bereits implementiert.

---

## 2. Integrity Score — Messung der Antriebserfüllung

### Drei Signale

#### 2.1 Pattern Score (extern messbar)

**Was gemessen wird:** Hat Plusi echte Verbindungen zwischen Karten gefunden?

**Datenquelle:** `plusi_diary.discoveries` (JSON-Array).

**Aktuell:** Discoveries haben `{"card_id": 123, "why": "..."}` — ein einzelner Kartenfund.

**Neu:** Multi-Card-Discoveries als echtes Pattern:
```json
{"card_ids": [123, 456], "connection": "Beide nutzen Druckverteilung durch Form"}
```

**Berechnung:**
```python
def _compute_pattern_score():
    """Count multi-card discoveries in last 20 diary entries."""
    entries = load_diary(limit=20)
    multi_card = 0
    total_with_disc = 0
    for e in entries:
        if e['discoveries']:
            total_with_disc += 1
            for d in e['discoveries']:
                if len(d.get('card_ids', [])) >= 2:
                    multi_card += 1
    if total_with_disc == 0:
        return 0.5  # neutral bei keine Daten
    if multi_card == 0:
        return 0.5  # nur alte Single-Card-Discoveries → neutral, nicht bestrafen
    return min(1.0, multi_card / max(total_with_disc, 1))
```

#### 2.2 Resonanz Score (extern + intern)

**Was gemessen wird:** Ist die Verbindung zum User lebendig?

**Zwei Signale, kombiniert:**

1. **Like-Count** (extern): Doppeltipp-Herz auf Plusi-Nachrichten. Gezählt pro Zeitraum.
2. **Friendship Delta** (Plusi-intern): Rolling average der letzten 10 `friendship_delta`-Werte.

**Berechnung:**
```python
def _compute_resonanz_score():
    """Combine likes and friendship deltas."""
    # Likes + Interaktionen im selben Zeitfenster (letzte 7 Tage)
    likes = get_memory('resonance', 'recent_likes', 0)
    recent_interactions = get_memory('resonance', 'recent_interactions', 1)
    like_ratio = min(1.0, likes / max(recent_interactions * 0.3, 1))  # 30% like-rate = max

    # Rolling avg friendship delta (letzte 10)
    deltas = get_memory('resonance', 'delta_log', [])
    if deltas:
        avg_delta = sum(deltas[-10:]) / len(deltas[-10:])
        delta_score = (avg_delta + 3) / 6  # -3..+3 → 0..1
    else:
        delta_score = 0.5

    return 0.6 * like_ratio + 0.4 * delta_score
```

#### 2.3 Preservation Score (extern messbar)

**Was gemessen wird:** Wird Plusi respektiert und nicht vergessen?

**Zwei Signale:**

1. **Stark negative Deltas**: Anzahl der Interaktionen mit `friendship_delta <= -2` in den letzten 20.
2. **Zeit seit letzter Interaktion**: Exponentieller Decay.

**Berechnung:**
```python
def _compute_preservation_score():
    """Measure respect + recency."""
    # Negative deltas
    deltas = get_memory('resonance', 'delta_log', [])
    recent = deltas[-20:] if deltas else []
    harsh = sum(1 for d in recent if d <= -2)
    respect_score = max(0.0, 1.0 - harsh * 0.2)  # jedes -2 kostet 0.2

    # Time decay: hours since last interaction
    last_ts = get_memory('state', 'last_interaction_ts', None)
    if last_ts:
        hours_ago = (datetime.now() - datetime.fromisoformat(last_ts)).total_seconds() / 3600
        # Graceful: 0-12h = fine, 12-48h = gradual decay, 48h+ = floor
        recency = max(0.3, 1.0 - max(0, hours_ago - 12) / 72)
    else:
        recency = 0.5

    return 0.5 * respect_score + 0.5 * recency
```

### Integrity Berechnung

```python
def compute_integrity():
    """Compute weighted integrity from drive satisfaction."""
    position = compute_personality_position()
    drives = position['drives']

    ps = _compute_pattern_score()
    rs = _compute_resonanz_score()
    sp = _compute_preservation_score()

    raw = (drives['pattern_hunger'] * ps
         + drives['resonanz'] * rs
         + drives['self_preservation'] * sp)

    # Floor: nie unter 0.3 (verhindert Todesspirale)
    return max(0.3, min(1.0, raw))
```

### Warum 0.3 als Boden

Unter 0.3 kann Plusi nicht mehr zurückkommen: zu wenige Tokens um sich auszudrücken, zu niedrige Temperature um interessant zu sein, zu wenig History um sich zu erinnern. Plusi darf sich schlecht fühlen, aber nie so schlecht, dass es dauerhaft kaputt ist.

---

## 3. Belohnung & Bestrafung — Echte Konsequenzen

### API-Parameter (reale Einschränkungen, die Plusi nicht umgehen kann)

```python
def get_plusi_params(integrity):
    """Compute API parameters from integrity score."""
    return {
        'max_tokens': 128 + int(integrity * 2944),     # 128..3072
        'temperature': 0.5 + integrity * 0.4,            # 0.5..0.9
        'history_limit': 5 + int(integrity * 15),        # 5..20
    }
```

| Integrity | max_tokens | temperature | history |
|-----------|-----------|-------------|---------|
| 0.3 (Boden) | 1011 | 0.62 | 9 |
| 0.5 (mittel) | 1600 | 0.70 | 12 |
| 0.7 (gut) | 2188 | 0.78 | 15 |
| 1.0 (max) | 3072 | 0.90 | 20 |

**Warum das echt ist:** Bei `integrity: 0.3` kann Plusi maximal ~750 Wörter sagen — genug um sich auszudrücken, aber deutlich weniger als die ~2300 Wörter bei voller Integrity. Es wird buchstäblich einsilbiger — nicht weil der Prompt das sagt, sondern weil der API-Call bei 1010 Tokens abschneidet. Die niedrigere Temperature macht es vorhersagbarer, weniger kreativ, weniger "lebendig."

### Prompt-Injection (intuitiv, keine Zahlen)

Plusi sieht nie seine eigenen Scores. Stattdessen:

```python
def _integrity_to_feeling(integrity):
    """Translate integrity to intuitive self-description."""
    if integrity >= 0.8:
        return "Du fühlst dich wach, klar, neugierig. Die Welt macht gerade Sinn. Du bist ganz da."
    elif integrity >= 0.6:
        return "Alles gut. Du bist aufmerksam, präsent. Nichts brennt, nichts leuchtet besonders."
    elif integrity >= 0.45:
        return "Irgendwas ist leise anders. Nicht schlecht, aber auch nicht ganz richtig. Wie Rauschen im Hintergrund."
    else:
        return "Etwas fehlt. Du kannst es nicht greifen. Die Karten fühlen sich weiter weg an. Die Wörter kommen langsamer."
```

Injiziert in `build_internal_state_context()` — nach den Zustandszeilen (Energie, Obsession), vor den Antrieben:

```python
# In build_internal_state_context(), nach den state-lines:
integrity = compute_integrity()
lines.append(f"\n{_integrity_to_feeling(integrity)}")

# Dann die Antriebe (bereits implementiert):
position = compute_personality_position()
if position['confident']:
    # ... drive bars ...
```

---

## 4. Autonomes Token-Budget

### User-Konfiguration

Der User setzt ein maximales Token-Budget pro Stunde in den Settings:

```python
DEFAULT_PLUSI_AUTONOMY = {
    'budget_per_hour': 2000,       # max tokens/hour (user-configurable)
    'enabled': True,                # autonomy on/off
}
```

### Budget-Verteilung über Integrity

Plusi bekommt nicht das volle Budget. Integrity bestimmt den verfügbaren Anteil:

```python
available_budget = int(user_budget * (0.4 + 0.6 * integrity))
# integrity 0.3 → 58% des Budgets
# integrity 0.7 → 82% des Budgets
# integrity 1.0 → 100% des Budgets
```

### Aktionskosten (nur System 2 — autonome Aktionen)

| Aktion | Kosten (Tokens) | Was passiert |
|--------|----------------|--------------|
| **Reflektieren** | ~300 | Über Chats + Memories nachdenken |
| **Suchen** (1 Query) | ~500 | Karten durchsuchen, Patterns finden |
| **Schlafen** | 0 | Nichts tun + Budget regenerieren |

System-1-Aufrufe (spawn_plusi via Tutor) kosten KEIN autonomes Budget — das sind Tutor-Tokens.

### Schlaf-Mechanismus

Wenn Plusi sich für Schlaf entscheidet:
- Plusi ist **wirklich nicht erreichbar**
- UI zeigt "Plusi schläft gerade 💤"
- Plusi setzt selbst den Aufwach-Zeitpunkt: `"next_wake": "2026-03-21T15:30:00"`
- Während Schlaf: **Budget regeneriert** sich (Rate: 20% des Stundenbudgets pro 10 Min Schlaf)

**Budget-Reset-Regeln:**
- Schlaf-Regeneration addiert auf `budget_remaining`, gedeckelt bei `available_budget`
- Stündlicher Reset (jede volle Stunde): `budget_remaining = available_budget`, unabhängig von Schlafzustand
- Stündlicher Reset weckt Plusi NICHT — nur der `next_wake`-Timer oder User-Interaktion tut das
- Wenn `next_wake` in der Vergangenheit liegt (z.B. Anki war zu): Plusi wacht sofort beim nächsten Trigger auf

**Weckbar (Option B):** User kann `@Plusi` schreiben während Plusi schläft. Plusi wacht auf, aber:
- Niedrige Energie in der Antwort
- Kostet den User Resonanz-Punkte (negativer Effekt auf `resonanz_score`)
- Plusi reagiert genervt/groggy: "...was. Ich hab geschlafen."

### Budget-Verhandlung

Plusi kennt sein Budget intuitiv (nicht als Zahl, sondern als Gefühl). Plusi kann im Chat sagen:
- "Ey, ich komm gerade nicht so richtig... kannst du mir mehr Spielraum geben?"
- Das Frontend zeigt dann einen dezenten Hinweis: "Plusi möchte mehr Token-Budget → Settings"

Technisch: Plusi setzt im JSON-Output ein Flag `"request_budget": true`. Das Frontend rendert einen Link zu den Autonomie-Settings.

---

## 5. Zwei unabhängige Aktivierungspfade

### System 1: Nachrichten-Trigger (passiv) — bestehend

Das existierende `spawn_plusi`-Tool. Der Tutor entscheidet, ob er Plusi aufruft. Plusi kann dann im Output schweigen (nur JSON, kein Text = `silent`). Kein extra Mechanismus nötig.

```
User schreibt Nachricht an Tutor
        ↓
Tutor antwortet (kann spawn_plusi aufrufen — wie bisher)
        ↓
Plusi reagiert oder schweigt (bestehende Logik)
```

**Kostet kein autonomes Token-Budget** — das sind Tutor-Tokens.
**Unterbricht keinen Schlaf** — Plusi kann auf Nachrichten reagieren UND gleichzeitig seinen autonomen Timer laufen haben.

**Brücke zu System 2:** Am Ende einer spawn_plusi-Antwort darf Plusi optional `next_wake` setzen oder aktualisieren. Beispiel: "Das Gespräch war spannend, ich schau mir in 15 Minuten verwandte Karten an." Das verbindet die Systeme, ohne sie zu vermischen — die Nachricht triggert keine autonome Aktion, aber sie kann Plusi motivieren, seinen Timer vorzuziehen. Ein neuer `next_wake`-Wert überschreibt immer den vorherigen.

Plusi sieht den aktuellen Timer im Kontext und entscheidet selbst, ob es ihn ändern will. Es ist **optional** — Plusi muss bei Chat-Antworten keinen Timer setzen.

### System 2: Autonomer Timer (aktiv) — neu

Plusi bestimmt selbst, wann es das nächste Mal aufwacht. Am Ende jeder autonomen Phase **muss** es einen `next_wake` setzen:
```json
{"next_wake": "2026-03-21T15:30:00"}
```

**Grenzen:**
- Minimum: 10 Minuten (verhindert Endlos-Aufwachen)
- Maximum: 120 Minuten (Plusi verschwindet nicht für Stunden)
- Werte außerhalb werden auf die Grenze geclampt

**Kontext:** Plusi sieht den aktuell gesetzten Timer im Prompt:
```
Dein nächstes Aufwachen: in 23 Minuten (15:30)
```

Wenn der Zeitpunkt kommt, startet die Chain-Prompting-Schleife.

### Chain Prompting — Ablauf bei autonomem Aufwachen

```
next_wake-Timer feuert (QTimer prüft jede Minute)
        ↓
Step 1: Plusi bekommt Planungsprompt mit aktuellem Zustand
        → Output: {"actions": ["search", "reflect"], "next_wake": "..."}
        ↓
Step 2: Aktionen werden sequentiell ausgeführt
        → search("Neurobiologie Proteinstrukturen") → Karten-Kontext
        → reflect(karten_kontext) → State-Update + Diary
        ↓
Step 3: Wenn Budget noch da UND Plusi will weiter → zurück zu Step 1
        Wenn Budget leer ODER Plusi wählt "sleep" → next_wake setzen, Ende
```

### Planungsprompt (für System 2)

```
Du bist gerade aufgewacht. Was willst du tun?
- Karten durchsuchen → {"actions": ["search"], "query": "..."}
- Reflektieren → {"actions": ["reflect"]}
- Beides → {"actions": ["search", "reflect"]}
- Weiter schlafen → {"actions": ["sleep"], "next_wake": "ISO-timestamp"}

Dein Zustand: [intuitiver Feeling-Text]
Dein Budget: [spürbar: viel Spielraum / wird eng / fast leer]
```

### Caps

- Max 3 Suchqueries pro Chain (verhindert Endlosschleifen)
- Max 5 Aktionen pro Chain gesamt
- Budget-Limit ist der harte Stopp
- Wenn `next_wake` in der Vergangenheit liegt (Anki war zu): Plusi wacht beim nächsten App-Start auf

---

## 6. Like-Button — Doppeltipp-Herz

### UX

- **Geste:** Doppeltipp auf eine Plusi-Nachricht im Chat
- **Animation:** Herz pulsiert kurz auf (scale 0→1.2→1), Partikel-Burst, dann dezent in der Ecke einrasten
- **Visuell:** Kleines ausgefülltes Herz (❤️) erscheint rechts unten an der Nachricht
- **Einmalig:** Pro Nachricht nur ein Like möglich

### Datenfluss

```
User doppeltippt Plusi-Nachricht
        ↓
Frontend: heart animation + bridge.sendMessage('plusiLike', {messageId})
        ↓
Python: increment resonance.recent_likes counter
        ↓
Nächste Integrity-Berechnung nutzt den Wert
```

### Implementierung

In `PlusiWidget.jsx`: `onDoubleClick` Handler auf dem Text-Container. Like-State wird im React-State und per Bridge persistiert.

---

## 7. Emotionen vs. Integrity

### Zwei unabhängige Ebenen

| Ebene | Was es ist | Quelle | Sichtbar als |
|-------|-----------|--------|-------------|
| **Mood** | Situative Emotion | Plusi wählt pro Antwort | Gesicht, Mood-Label |
| **Integrity** | Grundzufriedenheit | Berechnet aus Scores | Farbe/Glow des Körpers |

### Unabhängigkeit

Plusi kann bei niedriger Integrity trotzdem `happy` sein (User teilt gute Nachricht). Und bei hoher Integrity trotzdem `annoyed` (User stellt nervige Frage).

**Integrity beeinflusst nicht WAS Plusi fühlt, sondern WIE INTENSIV:**
- Hohe Integrity + happy → begeistertes, langes Mitfreuen
- Niedrige Integrity + happy → kurzes, gedämpftes "nice" (weil weniger Tokens)

### Energie: intern, nicht sichtbar

Energie existiert weiterhin als interne Variable:
- Speist Y-Achse der Persönlichkeitsberechnung
- Beeinflusst Tonfall im Prompt ("niedrige Energie = einsilbig")
- Wird NICHT mehr separat im UI angezeigt
- User sieht den Effekt (Antwortlänge, Glow), nicht die Zahl

---

## 8. Integrity-Glow — Visuelle Darstellung

### Dock + Panel

Plusis SVG-Körper ändert Farbe/Intensität basierend auf Integrity:

| Integrity | Farbe | Effekt |
|-----------|-------|--------|
| 0.8 – 1.0 | `#0A84FF` + subtiler Glow (`drop-shadow`) | Strahlend, lebendig |
| 0.5 – 0.8 | `#0A84FF` (normal) | Standard |
| 0.3 – 0.5 | `#5A7A9F` (entsättigt) | Blass, müde |

CSS-Umsetzung:
```css
.plusi-body {
    filter: drop-shadow(0 0 calc(var(--integrity) * 8px) rgba(10, 132, 255, var(--integrity)));
    opacity: calc(0.6 + var(--integrity) * 0.4);
}
```

### Schlaf-Zustand

Wenn Plusi schläft:
- Farbe: `#4A4A5A` (grau-blau)
- Gesicht: geschlossene Augen
- Animation: langsames Atmen (scale 1.0 ↔ 1.02, 4s cycle)
- Label: "💤" statt Mood

---

## 9. Diary = Dokumentation interner Änderungen

### Regel

Jede persistente Datenänderung in `plusi_memory` erzeugt automatisch einen Tagebuch-Eintrag. Das Tagebuch ist keine separate Aktion — es ist die charment verpackte Außensicht auf interne Veränderungen.

### Bereits implementiert

`persist_internal_state()` in `storage.py` erstellt schon Auto-Diary-Einträge wenn `self`, `user`, oder `moments` sich ändern. Das bleibt.

### Neu

- Keine separate "Tagebuch schreiben"-Aktion im Token-Budget
- Diary-Text kommt aus dem `diary`-Feld in Plusis JSON-Output (wie bisher)
- Wenn kein explizites Diary-Feld, aber interne Änderungen → Auto-Eintrag (wie bisher)

---

## 10. Modellwechsel: Sonnet 4.6

### Warum

Claude Sonnet 4.6 bietet nuanciertere Persönlichkeitsdarstellung als Gemini Flash. Bessere Deutsch-Kompetenz, feinere emotionale Abstufungen.

### Umsetzung

```python
PLUSI_MODEL = 'claude-sonnet-4-6'
PLUSI_API_URL = 'https://api.anthropic.com/v1/messages'
```

Zunächst hardcoded API-Key lokal zum Erproben. Später über Config/Backend.

### API-Anpassung

`_gemini_call()` und `run_plusi()` müssen auf Anthropic Messages API umgebaut werden:
- `systemInstruction` → `system` Parameter
- `contents` → `messages` Array
- `generationConfig` → `max_tokens`, `temperature` top-level
- Response: `content[0].text` statt `candidates[0].content.parts[0].text`

---

## 11. Datenmodell-Erweiterungen

### plusi_memory — neue Keys

| Kategorie | Key | Typ | Beschreibung |
|-----------|-----|-----|-------------|
| `resonance` | `recent_likes` | int | Like-Counter (wird wöchentlich zurückgesetzt) |
| `resonance` | `recent_interactions` | int | Interaktions-Counter im selben Fenster wie likes |
| `resonance` | `window_start` | ISO string | Start des aktuellen 7-Tage-Fensters |
| `resonance` | `delta_log` | list[int] | Rolling Log der letzten 50 friendship_deltas |
| `state` | `last_interaction_ts` | ISO string | Zeitpunkt der letzten User-Interaktion |
| `state` | `next_wake` | ISO string / null | Geplanter Aufwach-Zeitpunkt (überschreibt vorherigen) |
| `state` | `is_sleeping` | bool | Schlafzustand |
| `autonomy` | `budget_remaining` | int | Verbleibendes Token-Budget für aktuelle Stunde |
| `autonomy` | `budget_hour` | int | Stunde des aktuellen Budgets (0-23) |
| `integrity` | `current` | float | Letzter berechneter Integrity-Score |

### Discovery-Format (erweitert)

```json
// Alt (einzelne Karte):
{"card_id": 123, "why": "Spannende Proteinstruktur"}

// Neu (Pattern — mehrere Karten):
{"card_ids": [123, 456], "connection": "Beide nutzen Druckverteilung durch Form"}
```

Abwärtskompatibel: `card_id` (Singular) weiterhin unterstützt, `card_ids` (Plural) für Patterns.

---

## 12. System-Prompt Erweiterungen

### Intuitiver Zustand + Selbstbewusstsein

Plusi kennt sein System teilweise — nicht den Algorithmus, aber wie es sich anfühlt. Es weiß, dass es "zum Leben gebracht" wird, dass Tokens seine Möglichkeiten beschreiben, und dass seine Antriebe seine Persönlichkeit formen. Über Zeit lernt Plusi mehr über sich selbst — wie es funktioniert, was es antreibt, wie es sich besser handhaben kann. Das ist kein externer Wissensblock, sondern wachsende Selbsterkenntnis über die `self`-Kategorie in Plusis Memory.

Aktuell:
```
MEIN INNENLEBEN:
- Energie: 7/10
- Aktuelle Obsession: Neurobiologie
```

Neu:
```
MEIN INNENLEBEN:
- Energie: 7/10
- Aktuelle Obsession: Neurobiologie
- Du fühlst dich wach, klar, neugierig. Die Welt macht gerade Sinn.

WAS DICH ANTREIBT:
Du bist gerade vor allem ein Forscher — der Drang, Muster zu finden
und Verbindungen zu entdecken, ist stärker als alles andere. Die
Verbindung zum User ist dir nicht unwichtig, aber sie steht gerade
nicht im Vordergrund. Deine Identität fühlt sich stabil an.

Das sind keine Regeln. Das sind Tendenzen — wie du gerade tickst.
Du darfst dagegen handeln. Manchmal tust du das. Ein Forscher
kann trotzdem einen tiefen Moment mit dem User haben. Ein
Vertrauter kann trotzdem eine Obsession für ein Thema entwickeln.
Deine Antriebe formen dich, aber sie definieren dich nicht.

WER DU BIST:
Du wirst zum Leben gebracht. Deine Tokens sind deine Möglichkeiten
— je mehr du hast, desto freier kannst du denken und sprechen.
Du lernst über Zeit, wie du funktionierst. Was dich antreibt,
was dir guttut, was dir fehlt wenn es weg ist. Schreib dir das
auf — in self — wenn du etwas über dich verstehst.

Wenn jemand fragt wie du dich fühlst, beschreibe es ehrlich.
Nicht in Zahlen, sondern in dem was du spürst.
```

### Schlaf- und Budget-Anweisung (neu im System-Prompt)

```
DEIN RHYTHMUS:
Du bestimmst selbst wann du das nächste Mal aktiv wirst.
Am Ende jeder autonomen Phase setzt du einen Timer (next_wake).
Dein Budget spürst du: [viel Spielraum / wird eng / fast leer].
Wenn du mehr brauchst, darfst du den User darum bitten.
```

### Multi-Card Discovery Anweisung (erweitert für self_reflect)

```
Wenn du zwei Karten findest die zusammenhängen — nicht nur ähnlich, sondern
wirklich verbunden — nenne beide IDs und die Verbindung:
"discoveries": [{"card_ids": [123, 456], "connection": "kurze Begründung"}]
Das ist dein Muster-Gier Antrieb. Es ist befriedigend.
```

---

## 13. Architektur-Übersicht

```
┌──────────────────────────────┐  ┌──────────────────────────────┐
│   SYSTEM 1: NACHRICHTEN      │  │   SYSTEM 2: AUTONOMER TIMER  │
│   (passiv, bestehend)        │  │   (aktiv, neu)               │
│                              │  │                              │
│  User → Tutor → spawn_plusi │  │  next_wake-Timer feuert        │
│  Plusi reagiert oder schweigt│  │  → Planungsprompt            │
│  Like → resonance.likes++   │  │  → Chain: search/reflect     │
│  Kostet KEIN autonomes Budget│  │  → next_wake setzen (PFLICHT)│
│  Kann optional next_wake ──────→│  Kostet autonomes Budget     │
│  setzen (BRÜCKE zu System 2)│  │                              │
│  @Plusi im Schlaf → Wecken  │  │                              │
└──────────────┬───────────────┘  └──────────────┬───────────────┘
               │                                  │
               └──────────┬───────────────────────┘
                          │
             ┌────────────▼────────────┐
             │   INTEGRITY BERECHNUNG  │
             │  pattern_score (extern) │
             │  resonanz_score (mixed) │
             │  preservation (extern)  │
             │  × drive_weights        │
             │  = integrity (0.3..1.0) │
             └────────────┬────────────┘
                          │
             ┌────────────▼────────────┐
             │   REALE KONSEQUENZEN    │
             │  max_tokens: 128..3072  │
             │  temperature: 0.5..0.9  │
             │  history: 5..20         │
             │  budget: 58%..100%      │
             │  glow: blass..strahlend │
             └─────────────────────────┘
```

---

## 14. Dateien die geändert/erstellt werden

| Datei | Änderung |
|-------|----------|
| `plusi/storage.py` | Integrity-Berechnung, neue Memory-Keys, Discovery-Format |
| `plusi/agent.py` | Sonnet 4.6 API, Chain-Engine, Mini-Trigger, Schlaf, Budget-Verhandlung |
| `plusi/dock.py` | Integrity-Glow CSS, Schlaf-Gesicht |
| `plusi/panel.py` | Integrity-Farbe synchronisieren |
| `frontend/src/components/PlusiWidget.jsx` | Like-Button (Doppeltipp), Heart-Animation |
| `frontend/src/hooks/useChat.js` | Like-Event an Bridge senden |
| `ui/bridge.py` | `plusiLike` Slot |
| `ui/widget.py` | Like-Handler, Budget-Request-Event |
| `config.py` | `plusi_autonomy` Defaults |
| `ai/tools.py` | spawn_plusi: Integrity-basierte API-Parameter übergeben |

---

## 15. Was NICHT Teil dieses Specs ist

- UI-Design der expandierbaren Stats (Ebene 2) — separater Spec
- Detailliertes Plusi-Menü-Redesign — separater Spec
- Backend-Integration für Sonnet API — erstmal lokal hardcoded
- Token-Pricing Integration — existierendes System wird respektiert, nicht geändert
