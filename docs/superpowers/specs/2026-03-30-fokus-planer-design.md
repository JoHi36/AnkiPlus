# Fokus-Planer — Multi-Target Lernplan

**Status:** Approved
**Date:** 2026-03-30
**Depends on:** Statistik als Lernplan (Two-Level Flow, implemented), TrajectoryChart v2, SessionSuggestion

---

## Vision

Die StatistikView wird von einem passiven Dashboard zu einem aktiven Planungstool. Studierende setzen mehrere Fokus-Ziele parallel (Biochemie bis 15. Mai, Anatomie bis 30. Mai). Das System zeigt transparent: "Bei deinem Tempo erreichst du X% bis dahin" — und der Student entscheidet selbst, ob das reicht.

## Neue Kern-Metrik: Abrufwahrscheinlichkeit

### Warum nicht mature_pct?

Die alte Metrik `(mature + young * 0.5) / total` hat ein fundamentales Problem: "mature" bedeutet Intervall ≥ 21 Tage. Wenn die Prüfung in 14 Tagen ist, kann KEINE Karte mature werden — die Metrik zeigt 0%, obwohl der Student alles mehrfach richtig beantwortet hat.

### Die neue Metrik: "Wie viel könntest du jetzt abrufen?"

Für jede Karte wird die geschätzte Abrufwahrscheinlichkeit (Retrievability R) berechnet. Der Durchschnitt über alle Karten ergibt den Mastery-Score.

**Bedeutung:** "78% bedeutet: wenn du jetzt geprüft würdest, könntest du wahrscheinlich 78 von 100 Karten richtig beantworten."

### Berechnung: FSRS-First, SM-2-Fallback

**Wenn FSRS aktiv** (Anki ≥ 23.10 mit FSRS aktiviert):

FSRS speichert pro Karte Stability (S) und Difficulty (D). Daraus:

```
R = (1 + elapsed_days / (9 × S))^(-1)
```

- `elapsed_days` = Tage seit letztem Review
- `S` = Stability (aus `cards.data` JSON-Feld)
- Direkt aus Ankis Daten, präzise, personalisiert

**Wenn SM-2 aktiv** (Fallback):

Approximation aus Kartenfeldern (kein Revlog nötig):

```python
def estimate_retention(card, today):
    if card.queue == 0:  # new
        return 0.0
    if card.queue in (1, 3):  # learning / day-learn
        return 0.5
    if card.queue in (-1, -2):  # suspended / buried
        # Use last known interval — student probably still knows it
        if card.ivl <= 0:
            return 0.0

    # Review queue: compute from interval + elapsed time
    days_since_review = today - (card.due - card.ivl)
    ivl = max(1, card.ivl)

    # Base retention scales with interval (longer = more stable)
    base_r = 0.85 + 0.10 * min(1.0, ivl / 30)

    if days_since_review <= ivl:
        # Not yet due — retention is high
        return base_r + (1 - base_r) * (1 - days_since_review / ivl)
    else:
        # Overdue — exponential decay
        overdue_ratio = days_since_review / ivl
        return base_r * math.exp(-0.5 * (overdue_ratio - 1))
```

Ergebnis:
- Intervall 1, gerade gelernt: R ≈ 0.95
- Intervall 1, 1 Tag her: R ≈ 0.85
- Intervall 30, nicht fällig: R ≈ 0.95
- Intervall 7, 3x überfällig: R ≈ 0.55
- Nie gesehen: R = 0.0

### Mastery-Score

```
mastery = sum(R(card) for card in deck_cards) / len(deck_cards) * 100
```

### FSRS-Erkennung

```python
def is_fsrs_enabled():
    """Check if collection uses FSRS scheduler."""
    try:
        return mw.col.get_config("fsrs", False)
    except:
        return False
```

Wenn FSRS aktiv: `cards.data` enthält JSON mit `{"s": stability, "d": difficulty}`.

### Glättung

Der Chart zeigt einen **3-Tage gleitenden Durchschnitt** statt den Rohwert. Dadurch:
- Ein freier Tag → kaum sichtbar
- Eine Woche Pause → deutlicher Rückgang
- Kein tägliches Zittern

### Historische Rekonstruktion

Für die 180-Tage-Kurve im Chart wird eine vereinfachte Version berechnet (aus Revlog wie bisher, aber mit kontinuierlicher Gewichtung statt binärem mature/not-mature):

```python
# Statt:
pct = (mature + young * 0.5) / total * 100

# Jetzt:
weighted = sum(min(1.0, max(0, ivl) / 21) for ivl in card_intervals.values())
pct = weighted / total * 100
```

Computationally günstig, gibt eine glatte aufsteigende Kurve.

---

## Fokus = Deck(s) + Deadline

Ein Fokus ist:
- **Ein oder mehrere Decks** (ausgewählt via Treemap Multi-Select)
- **Ein Zieldatum** (Prüfungstermin)
- Das System berechnet automatisch, welches Mastery-Level realistisch erreichbar ist

Fokus wird persistiert und bleibt aktiv bis manuell gelöscht oder Deadline erreicht.

---

## Navigation — Drei Ebenen

### Ebene 0: Setup (konditionell)

**Wenn keine aktiven Fokus existieren:**
- Treemap (KnowledgeHeatmap) als Startseite
- Multi-Select → "Fokus festlegen" → Datum-Picker → Fokus erstellen
- Danach: Weiterleitung zu Ebene 1

**Wenn aktive Fokus existieren:**
- Direkt zu Ebene 1 (Aggregierte Plan-Ansicht)
- Treemap nur erreichbar via "+ Fokus hinzufügen" Button

### Ebene 1: Aggregierte Plan-Ansicht (Default)

**Layered TrajectoryChart:**
- **Weiße Gesamtlinie** prominent mit Area-Fill — gewichteter Durchschnitt aller Fokus (nach Kartenzahl)
- **Farbige Einzellinien** transparent im Hintergrund (jeder Fokus eigene Farbe)
- **Target-Marker** pro Fokus als farbige Kreise am jeweiligen Deadline
- **Deadline-Daten** in Fokus-Farbe auf der X-Achse
- X-Achse: vom frühesten Vergangenheitsdatum bis zum spätesten Deadline
- Alle Linien behalten den vollen Damped-Holt-Forecast mit Confidence Band

**Header:**
- Gesamtfortschritt % (gewichteter Durchschnitt) + tägliche Wachstumsrate
- Fokus-Badges: farbige Pills mit Name + verbleibende Tage ("Biochemie · 46d")

**Tagesübersicht (darunter):**

```
Biochemie    30 Pflege + 10 Neue    bei deinem Tempo → ~45% bis 15. Mai
Anatomie     15 Pflege + 20 Neue    bei deinem Tempo → ~58% bis 30. Mai
Physio        8 Pflege +  5 Neue    bei deinem Tempo → ~72% bis 10. Jun
──────────────────────────────────────────────────────────────────────────
Heute         53 Pflege + 35 Neue = 88 Karten
```

Jede Zeile zeigt: was heute ansteht + wohin das aktuelle Tempo führt. Keine Vorschriften, nur Transparenz.

**Navigation:**
- "+ Fokus hinzufügen" → öffnet Treemap (Ebene 0)
- Tap auf Fokus-Badge oder Zeile → Ebene 2 (Drill-in)

### Ebene 2: Einzelner Fokus (Drill-in)

**TrajectoryChart im Fokus-Farbton:**
- Volle Farbe, voller Damped-Holt-Forecast
- X-Achse: automatisch skaliert auf den Zeitraum (Vergangenheit als Kontext → Deadline)
- Kein manuelles W/M/J — der Fokus-Zeitraum bestimmt den Range
- **Target-Marker:** Vertikale Linie am Deadline + Kreis am erreichbaren Prozent
- **Confidence Band:** Zeigt Unsicherheit
- **Ampel:** Grün = auf Kurs, Gelb = knapp, Rot = kritisch

**Prognose-Szenarien (unter dem Chart):**

```
Bei deinem Tempo (Ø 25/Tag):    → ~45% bis 15. Mai
Wenn du auf 35/Tag steigerst:   → ~58% bis 15. Mai
Wenn du auf 15/Tag reduzierst:  → ~32% bis 15. Mai
```

Zeigt verschiedene erreichbare Niveaus basierend auf verschiedenen Paces. Student entscheidet selbst.

**Session-Detail:**

```
Heute für diesen Fokus:
  Pflege: 30 (fällige Reviews)
  Neue:   10 (bei aktuellem Tempo)
  Gesamt: 40
```

**Review-Last-Warnung** (wenn relevant):

```
⚠ Bei diesem Tempo wirst du in 2 Wochen ~250 Reviews/Tag haben.
```

**Navigation:**
- "← Alle Fokus" → zurück zu Ebene 1
- Datum bearbeiten, Fokus löschen

---

## Fokus erstellen — Flow

1. User ist auf Treemap (Ebene 0 oder via "+ Fokus hinzufügen")
2. Wählt Decks (Multi-Select, wie implementiert)
3. Klickt "Fokus festlegen" im Bottom-Dock
4. **Datum-Picker** erscheint — "Bis wann?"
5. System berechnet sofort: "Bei deinem aktuellen Tempo erreichst du ~X% bis dahin"
6. Fokus wird gespeichert
7. → Weiterleitung zu Ebene 1

---

## Fokus verwalten

- **Löschen:** X-Button oder Swipe → Fokus wird archiviert
- **Bearbeiten:** Tap auf Datum → Datum-Picker zum Ändern der Deadline
- **Max 5 parallele Fokus** (UI-Limit, verhindert Überforderung)
- **Keine Deck-Dopplung:** Ein Deck kann nur in einem Fokus sein. Versuch es einem zweiten zuzuordnen → Warnung

---

## Prognose-Berechnung: "Bei deinem Tempo"

### Grundprinzip

Nicht "du musst X Karten", sondern "wenn du so weitermachst, erreichst du Y%."

Die Prediction-Linie (Damped Holt) zeigt den extrapolierten Trend. Der Wert am Deadline-Datum ist die Prognose.

### Tempo-Szenarien

Das aktuelle Tempo = Durchschnitt der letzten 7 Tage (neue Karten/Tag + Review-Completion).

Alternative Szenarien (±40% und ±20%) zeigen was erreichbar wäre:

```python
current_pace = avg_new_7d  # z.B. 25/Tag
scenarios = [
    ("Wenn du auf {}/Tag steigerst", ceil(current_pace * 1.4)),
    ("Bei deinem Tempo ({}/Tag)", current_pace),
    ("Wenn du auf {}/Tag reduzierst", floor(current_pace * 0.6)),
]
```

Für jedes Szenario: Fortschreibung des Trends mit angepasster Steigung.

### Review-Last-Schätzung

Jede neue Karte erzeugt in den ersten 4 Wochen ~6-8 Reviews. Faustregel:

```
estimated_daily_reviews_in_2_weeks = existing_due + daily_new * 3.5
```

Wenn > 250: Warnung anzeigen. Wenn > 400: "Dieses Tempo ist langfristig nicht haltbar."

### Ampel-Berechnung

```
predicted_pct_at_deadline = prediction_line[deadline_day]
current_pct = mastery_today

if predicted_pct_at_deadline >= current_pct * 1.5:
    → Grün (guter Fortschritt, Ziel in Reichweite)
elif predicted_pct_at_deadline >= current_pct * 1.2:
    → Gelb (langsamer Fortschritt, Steigerung hilfreich)
else:
    → Rot (kaum Fortschritt, deutliche Steigerung nötig)
```

---

## Multi-Fokus-Koordination

### Priorisierung

Wenn mehrere Fokus aktiv sind, zeigt die Tagesübersicht automatisch die Reihenfolge nach Dringlichkeit:

```
Sortierung: nach verbleibenden Tagen (wenigste zuerst)
```

Der dringendste Fokus steht oben und bekommt visuell mehr Gewicht.

### Aggregierte Gesamtlinie

```
aggregatePct(day) = Σ(focusPct(day, f) × totalCards(f)) / Σ(totalCards(f))
```

Gewichteter Durchschnitt nach Kartenzahl — ein großes Deck wiegt mehr als ein kleines.

Für die Aggregate-Prediction: gleiche Gewichtung auf die Einzel-Holt-Vorhersagen.

### Keine künstliche Budgetierung

Das System verteilt NICHT Karten zwischen Fokus. Es zeigt einfach: "Du machst aktuell Ø X neue Karten in Biochemie, Ø Y in Anatomie. Das führt zu diesen Ergebnissen." Der Student verteilt seine Zeit selbst.

---

## Fokus-Farben

Feste Palette, Farbe wird bei Erstellung zugewiesen:

| Index | Farbe | RGBA |
|-------|-------|------|
| 0 | Grün | `rgba(74,222,128,*)` |
| 1 | Blau | `rgba(96,165,250,*)` |
| 2 | Gelb | `rgba(251,191,36,*)` |
| 3 | Lila | `rgba(168,85,247,*)` |
| 4 | Rot | `rgba(248,113,113,*)` |

Auf dem Chart: Opacity 0.20 für Hintergrund-Linien, 0.80 für den aktiven Fokus (Drill-in).

---

## Chart Auto-Scaling

Statt manuellem W/M/J:

```
// Einzelner Fokus (Ebene 2):
pastDays = min(daysUntilDeadline × 0.5, 90)
futureDays = daysUntilDeadline + 7

// Aggregierte Ansicht (Ebene 1):
futureDays = max(allDeadlines) - today + 7
pastDays = min(futureDays × 0.4, 90)
```

---

## Persistenz

### Datenmodell

```json
{
  "focuses": [
    {
      "id": "focus_1711800000",
      "deckIds": [1234, 5678],
      "deckNames": ["Biochemie"],
      "deadline": "2026-05-15",
      "colorIndex": 0,
      "createdAt": "2026-03-30",
      "archived": false
    }
  ]
}
```

### Speicherort

`config.json` — konsistent mit bestehendem Persistenz-Ansatz.

---

## Backend-Anforderungen

### Neue Bridge-Calls

- `saveFocus(focusData)` — Fokus speichern/aktualisieren
- `getFocuses()` — Alle aktiven Fokus laden
- `deleteFocus(focusId)` — Fokus archivieren

### Angepasste Bridge-Calls

- `getDeckTrajectory(deckId)` — bereits implementiert, muss neue Mastery-Metrik verwenden
- `getDeckSessionSuggestion(deckId)` — bereits implementiert, unverändert (zeigt fällige + verfügbare Karten)

### Neue Bridge-Calls für Mastery

- `getDeckMastery(deckId)` — berechnet aktuelle Abrufwahrscheinlichkeit für ein Deck
  - Erkennt automatisch ob FSRS oder SM-2 aktiv ist
  - Gibt zurück: `{ mastery, totalCards, cardsByLevel, isFsrs }`

### FSRS-Integration

```python
def get_card_retention_fsrs(card, elapsed_days):
    """Precise retention using FSRS stability parameter."""
    import json
    try:
        data = json.loads(card.data) if card.data else {}
        stability = data.get("s", None)
        if stability and stability > 0:
            return (1 + elapsed_days / (9 * stability)) ** (-1)
    except (json.JSONDecodeError, TypeError):
        pass
    return None  # Fallback to SM-2 approximation
```

---

## Nicht in Scope (v1)

- Automatische Prüfungstermin-Erkennung
- Benachrichtigungen/Reminders
- Fokus-Sharing zwischen Geräten (nur lokal)
- KI-basierte Ziel-Optimierung
- Historische Fokus-Analyse (was hat funktioniert)
- FSRS-Parameter selbst trainieren (Anki macht das)

---

## Mockups

Brainstorming-Session Mockups:
- Layered Trajectory: `.superpowers/brainstorm/83236-1774879718/content/layered-trajectory.html`
- Treemap-Redesign: `.superpowers/brainstorm/53634-1774825003/content/`
