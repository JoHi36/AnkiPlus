# Fokus-Planer — Multi-Target Lernplan

**Status:** Draft (Brainstorming abgeschlossen, bereit für Detail-Design)
**Date:** 2026-03-30
**Depends on:** Statistik als Lernplan (Two-Level Flow, implemented), TrajectoryChart v2, SessionSuggestion

---

## Vision

Die StatistikView wird von einem passiven "wo stehe ich" zu einem aktiven "was muss ich tun" Planungstool. Studierende können mehrere Fokus-Ziele parallel setzen (Biochemie bis 15. Mai, Anatomie bis 30. Mai), und das System berechnet täglich einen adaptiven Plan, der alle Fokus aggregiert.

## Konzept: Fokus = Deck(s) + Deadline

Ein Fokus ist:
- **Ein oder mehrere Decks** (ausgewählt via Treemap Multi-Select)
- **Ein Zieldatum** (Prüfungstermin)
- **Ein berechnetes Ziel-Prozent** (vom System vorgeschlagen, optional manuell überschreibbar)

Fokus wird persistiert und bleibt aktiv bis manuell gelöscht oder Deadline erreicht.

## Navigation — Drei Ebenen

### Ebene 0: Startseite (konditionell)

**Wenn keine aktiven Fokus:**
- Treemap (KnowledgeHeatmap) als Startseite
- "Fokus wählen" Bottom-Dock wie aktuell implementiert
- Multi-Select → Datum-Picker → Fokus erstellen

**Wenn aktive Fokus existieren:**
- Direkt zur Aggregierten Plan-Ansicht (Ebene 1)
- Treemap nur erreichbar via "+ Fokus hinzufügen"

### Ebene 1: Aggregierte Plan-Ansicht (Default bei aktiven Fokus)

**Layered TrajectoryChart:**
- **Weiße Gesamtlinie** prominent mit Area-Fill — gewichteter Durchschnitt aller Fokus (nach Kartenzahl)
- **Farbige Einzellinien** transparent im Hintergrund (jeder Fokus eine eigene Farbe)
- **Target-Marker** pro Fokus als farbige Kreise auf der Timeline
- **Deadline-Daten** in Fokus-Farbe auf der X-Achse
- X-Achse: vom frühesten Vergangenheitsdatum bis zum spätesten Deadline

**Header:**
- Gesamtfortschritt % + tägliche Wachstumsrate
- Fokus-Badges: farbige Pills mit Name + verbleibende Tage ("Biochemie · 46d")

**Aggregierter Tagesplan (darunter):**
```
Biochemie    30 + 10
Anatomie     15 + 20
Physio        8 +  5
─────────────────────
Heute        53 + 35 = 88
```
Kompakt, eine Zeile pro Fokus, Summe darunter. Tap auf Fokus-Zeile → Drill-in.

**Navigation:**
- "+ Fokus hinzufügen" Button → öffnet Treemap
- Tap auf Fokus-Badge oder Zeile → Ebene 2

### Ebene 2: Einzelner Fokus (Drill-in)

**TrajectoryChart im Fokus-Farbton:**
- X-Achse: automatisch skaliert auf den Zeitraum (Vergangenheit als Kontext → Deadline)
- Kein manuelles W/M/J — der Fokus-Zeitraum bestimmt den Range
- Target-Marker am Deadline + Confidence Band
- **Ampel-Indikator:** Grün = auf Kurs, Gelb = knapp, Rot = kritisch

**SessionSuggestion** — deadline-aware:
- Berücksichtigt Deadline-Abstand
- SRS-aware: nahe der Deadline weniger Neue (können nicht mehr reifen)

**Navigation:**
- "← Alle Fokus" → zurück zu Ebene 1
- Fokus bearbeiten (Datum ändern, löschen)

## Fokus erstellen — Flow

1. User ist auf Treemap (Ebene 0 ohne Fokus, oder via "+ Fokus hinzufügen")
2. Wählt Decks (Multi-Select wie implementiert)
3. Klickt "Fokus festlegen" im Bottom-Dock
4. **Datum-Picker erscheint** — "Bis wann?"
5. System berechnet: "Realistisch erreichbar: ~X% bis dahin"
6. Fokus wird gespeichert
7. → Weiterleitung zur Aggregierten Plan-Ansicht

## Fokus verwalten

- **Löschen:** X-Button oder Swipe → Fokus wird archiviert
- **Bearbeiten:** Tap auf Datum → Datum-Picker zum Ändern
- **Max 5 parallele Fokus** (UI-Limit)
- **Keine Deck-Dopplung:** Ein Deck kann nur in einem Fokus sein

## Adaptive Plan-Berechnung

### Grundprinzip

Gegeben: `currentPct`, `targetPct`, `daysRemaining`, `deckComposition`

Der Plan berechnet den täglichen Mix aus Review + Neue Karten, der nötig ist um das Ziel zu erreichen.

### SRS-Constraints

- **Neue Karten erzeugen zukünftige Reviews** — das muss eingepreist werden
- **Reifung braucht Zeit** — eine Karte wird erst nach ~21 Tagen "mature"
- **Nahes Deadline:** Nur noch Pflege sinnvoll, neue Karten können nicht mehr reifen
- **Fernes Deadline:** Gleichmäßig neue Karten verteilen, Reviews wachsen organisch

### Vereinfachtes Modell (v1)

```
daysLeft = deadlineDate - today
newCardsRemaining = targetCards - (mature + young)

if daysLeft > 21:
    # Genug Zeit zum Reifen — neue Karten gleichmäßig verteilen
    dailyNew = ceil(newCardsRemaining / (daysLeft - 14))  # 14 Tage Puffer
else if daysLeft > 7:
    # Wenig Zeit — reduzierte Neue, Fokus auf Pflege
    dailyNew = ceil(newCardsRemaining / (daysLeft * 2))
else:
    # Kurz vor Deadline — nur Pflege
    dailyNew = 0

dailyReview = dueToday  # immer alle fälligen Reviews
```

### Ampel-Berechnung

```
expectedPctAtDeadline = extrapolate(predictionLine, deadlineDate)
gap = targetPct - expectedPctAtDeadline

if gap <= 0:       → Grün (auf Kurs oder voraus)
if gap < 10:       → Gelb (knapp, Steigerung nötig)
if gap >= 10:      → Rot (kritisch hinter Plan)
```

## Fokus-Farben

Jeder Fokus bekommt eine eindeutige Farbe aus einer festen Palette:
1. `rgba(74,222,128,*)` — Grün
2. `rgba(96,165,250,*)` — Blau
3. `rgba(251,191,36,*)` — Gelb
4. `rgba(168,85,247,*)` — Lila
5. `rgba(248,113,113,*)` — Rot

Farbe wird bei Erstellung zugewiesen (nächste freie Farbe).

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
      "targetPct": 45,
      "colorIndex": 0,
      "createdAt": "2026-03-30",
      "archived": false
    }
  ]
}
```

### Speicherort

`config.json` — konsistent mit bestehendem Persistenz-Ansatz.

## Backend-Anforderungen

### Neue Bridge-Calls

- `saveFocus(focusData)` — Fokus speichern/aktualisieren
- `getFocuses()` — Alle aktiven Fokus laden
- `deleteFocus(focusId)` — Fokus archivieren
- `getDeckTrajectory(deckId)` — bereits implementiert
- `getDeckSessionSuggestion(deckId, deadline?)` — bestehend, um Deadline erweitern

### Erweiterung SessionSuggestion

`getDeckSessionSuggestion(deckId, deadline?)` — optionaler Deadline-Parameter.
Wenn gesetzt: Plan ist adaptiv auf das Deadline berechnet statt passiv.

## Nicht in Scope (v1)

- Automatische Prüfungstermin-Erkennung
- Benachrichtigungen/Reminders
- Fokus-Sharing zwischen Geräten (nur lokal)
- KI-basierte Ziel-Optimierung
- Historische Fokus-Analyse
- Zoom-Out Button im Drill-in (kann in v2 kommen)

## Mockups

Brainstorming-Session Mockups: `.superpowers/brainstorm/83236-1774879718/content/layered-trajectory.html`
