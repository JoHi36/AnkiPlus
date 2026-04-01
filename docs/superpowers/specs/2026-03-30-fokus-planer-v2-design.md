# Fokus-Planer v2 — Statusboard ohne Deadlines

**Status:** Approved
**Date:** 2026-03-30
**Supersedes:** `2026-03-30-fokus-planer-design.md` (v1 mit Deadlines)
**Mockup:** `.superpowers/brainstorm/12697-1774893219/content/07-activity-fix.html`

---

## Vision

Die StatistikView wird ein **Statusboard**: Wo stehe ich in jedem Fach, wie schnell wachse ich, was ist heute fällig? Kein Planungstool mit Deadlines — der Student verwaltet seine Prüfungstermine selbst und checkt seinen Fortschritt hier.

## Kern-Entscheidung: Keine Deadlines

v1 hatte Fokus = Decks + Deadline + Datum-Picker + Prognose-am-Stichtag. Das war:
- **Überfordernd** — Studenten ohne konkreten Prüfungstermin konnten keinen Fokus erstellen
- **Fehleranfällig** — Deadlines 600+ Tage in der Zukunft zerstörten die Chart-Skalierung
- **Nutzlos aggregiert** — "42% Gesamt" über Fokus mit unterschiedlichen Deadlines war bedeutungslos

**Neues Modell:** Fokus = nur eine Deck-Gruppe. Keine Deadline, kein Datum-Picker. Wer wissen will wo er am 15. Mai steht, schaut im Chart auf dieses Datum.

---

## Datenmodell

### Fokus (vereinfacht)

```json
{
  "id": "focus_1711800000",
  "deckIds": [1234, 5678],
  "deckNames": ["Biochemie"],
  "colorIndex": 0,
  "createdAt": "2026-03-30",
  "archived": false
}
```

Gegenüber v1 entfällt: `deadline`.

### Persistenz

`config.json` via `ui/focus_store.py` (bereits implementiert). Das `deadline`-Feld wird optional/ignoriert.

### Mastery-Metrik

Unverändert aus v1: Abrufwahrscheinlichkeit (FSRS-First, SM-2-Fallback). Berechnung in `ui/retrieval.py`.

### Karten-Daten

Kommen direkt aus Anki — wir erfinden keine eigene Scheduling-Logik:
- **Pflege (Reviews):** Karten mit `due <= heute` in den Fokus-Decks
- **Neue:** Verfügbare neue Karten bis zum Tageslimit des Decks
- Quelle: `getDeckSessionSuggestion` Bridge-Call (bereits implementiert)

---

## View-Struktur

### Ebene 0: Setup (konditionell)

**Wenn keine aktiven Fokus existieren:** Treemap als Startseite. Multi-Select → "Fokus festlegen" → **fertig** (kein Datum-Picker). Weiterleitung zu Ebene 1.

**Wenn aktive Fokus existieren:** Direkt zu Ebene 1. Treemap nur erreichbar via "+ Fokus".

### Ebene 1: Statusboard (Default)

Drei Zonen, vertikal gestapelt, borderless:

**Zone 1 — Gesamt-Header:**
- Große Zahl: Abrufwahrscheinlichkeit (z.B. "42%")
- Wachstumsrate: "+0.8% / Tag"
- Label: "Abrufwahrscheinlichkeit"
- TrajectoryChart: Bestehender Chart mit voller Komplexität (Damped Holt Prediction, Confidence Band mit Decay-Physik, Dynamik-getriebene Opacity, Auto-Y-Scaling)
- Trajectory-Daten: gewichteter Durchschnitt der Einzel-Fokus-Trajectories (nach Kartenzahl), berechnet auf dem Frontend aus den bereits geladenen Per-Fokus-Daten
- Range-Preset: M (30 Tage past, 30 future) als Default, W/M/J umschaltbar
- Unten: "88 Karten heute" links, "Alles lernen" Button rechts
- "Alles lernen" → startet Session über alle Fokus-Decks

**Zone 2 — Fokus-Zeilen:**
- Section-Label "FOKUS" links, "+ Fokus" Button rechts
- Jeder Fokus ist **eine kompakte Zeile** (keine Karten, keine Sparklines):
  - Farbiger Dot (8px)
  - Name (13px, 500)
  - Inline Progress-Bar (flex, 5px Höhe, Fokus-Farbe bei 55% Opacity)
  - Mastery % (14px, 600)
  - Wachstumsrate in Fokus-Farbe (10px, "+X.X%/d")
  - Fällige Karten (10px, muted, "X fällig")
  - Chevron "›"
- Max 5 Fokus
- Sortierung: nach Mastery % absteigend (bester Fokus oben)
- Tap auf Zeile → Ebene 2 (Drill-in)

**Zone 3 — Aktivität:**
- Separator-Linie
- Horizontal: Streak-Widget (links) | Heatmap (Mitte, Original-Format 9px Zellen) | Time-of-Day Barchart (rechts, gleiche Höhe wie Heatmap)
- Labels darunter: Monats-Labels unter Heatmap, "Tageszeit" unter Time-Chart
- Stats-Zeile: "12 Tage Streak (Best: 34)" + "2.847 dieses Jahr"

### Ebene 2: Fokus-Detail (Drill-in)

Wird angezeigt wenn der User auf eine Fokus-Zeile tippt:
- "← Alle Fokus" zurück-Button
- Fokus-Name + Dot + Mastery %
- **Voller TrajectoryChart** für diesen Fokus (mit Prediction, Confidence Band, Range-Presets)
- Session-Suggestion: "Heute: X Pflege + Y Neue"
- "Fokus entfernen" Button (unten, subtle)

---

## Fokus erstellen — vereinfachter Flow

1. User tippt "+ Fokus" → Treemap öffnet sich (Ebene 0)
2. Wählt Decks via Multi-Select
3. Tippt "Fokus festlegen" im Bottom-Dock
4. **Kein Datum-Picker.** Fokus wird sofort erstellt.
5. → Weiterleitung zu Ebene 1

---

## Was entfällt gegenüber v1

- `deadline` Feld und gesamte Deadline-Logik
- Datum-Picker im Erstellungs-Flow
- Prognose-am-Stichtag ("bei deinem Tempo → ~X% bis [Datum]")
- Layered Lines Chart (alle Fokus-Linien übereinander)
- Aggregate Prediction/Confidence Band über mehrere Fokus
- Ampel-Berechnung (grün/gelb/rot)
- Tempo-Szenarien
- Review-Last-Warnung
- `FocusTabs` Komponente
- `AggregatedPlanView` mit Layered Chart (wird zu kompakten Zeilen)

## Was wiederverwendet wird

- `ui/focus_store.py` — CRUD (deadline-Feld wird einfach nicht mehr gesetzt)
- `ui/retrieval.py` — Mastery-Metrik (unverändert)
- `useFocusManager.js` — Hook für Focus-State + Trajectory-Loading
- `TrajectoryChart.jsx` + `useTrajectoryModel.js` — Für Gesamt-Chart und Drill-in
- `KnowledgeHeatmap.jsx` — Treemap für Fokus-Auswahl
- `YearHeatmap.jsx` — Aktivitäts-Heatmap
- `TimeOfDayChart.jsx` — Tageszeit-Chart (als kompakter Barchart)
- `SessionSuggestion.jsx` — Für Drill-in View
- Bridge-Calls: `saveFocus`, `getFocuses`, `deleteFocus`, `getDeckTrajectory`, `getDeckSessionSuggestion`

## Neue/geänderte Dateien

- `AggregatedPlanView.jsx` → **Komplett neu:** Gesamt-Header + kompakte Fokus-Zeilen + Aktivität
- `StatistikView.jsx` → Vereinfachte Navigation (kein useDeckFocus, Treemap ohne Datum-Picker)
- `FocusDetailView.jsx` → Leicht angepasst (keine Deadline-Anzeige)
- `useFocusManager.js` → Deadline-bezogene Logik entfernen, Trajectory-Loading behalten

## Fokus-Farben

Unverändert aus v1:

| Index | Farbe | RGB |
|-------|-------|-----|
| 0 | Grün | 74, 222, 128 |
| 1 | Blau | 96, 165, 250 |
| 2 | Gelb | 251, 191, 36 |
| 3 | Lila | 168, 85, 247 |
| 4 | Rot | 248, 113, 113 |

---

## Design-Prinzipien

1. **Borderless** — Keine Karten-Borders, Content fließt direkt auf der Seite. Fokus-Zeilen getrennt durch subtile Linien.
2. **Gesamt-Chart hat volle Komplexität** — Prediction, Confidence Band, Dynamik, Range-Presets. Wie der bestehende TrajectoryChart.
3. **Fokus-Zeilen sind kompakt** — Eine Zeile pro Fokus, kein separater Chart. Sparkline/Details erst im Drill-in.
4. **Anki macht das Scheduling** — Wir zeigen was fällig ist, wir schlagen nichts vor.
5. **Keine Deadlines** — Student entscheidet selbst wann er wo stehen will.
