# Fokus-Planer — Multi-Target Lernplan

**Status:** Draft
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

## Flow

### Fokus erstellen (Level 1 → Transition)

1. User wählt Decks in der Treemap (Single/Multi-Select wie implementiert)
2. Klickt "Fokus festlegen" im Bottom-Dock
3. **Datum-Picker erscheint** — "Bis wann willst du das können?"
4. System berechnet: "Realistisch erreichbar: ~X% bis dahin" (basierend auf aktueller Dynamik)
5. Fokus wird gespeichert, Level 2 öffnet sich

### Level 2 — Fokus-Ansicht (überarbeitet)

**Tabs oben:** Jeder aktive Fokus als Tab, sortiert nach Deadline (dringendster links).
- Tab zeigt: Deck-Name(n) + verbleibende Tage ("Biochemie · 46 Tage")
- Aktiver Tab ist hervorgehoben

**Pro Tab:**
1. **TrajectoryChart** mit Ziellinien-Overlay
   - X-Achse: automatisch skaliert auf den Zeitraum (heute → Deadline + etwas Vergangenheit als Kontext)
   - Kein manuelles W/M/J mehr — der Fokus-Zeitraum bestimmt den Range
   - Zoom-Out Button für Gesamtansicht (optional)
   - **Target-Marker:** Vertikale gestrichelte Linie am Deadline-Datum + horizontale am Ziel-Prozent
   - **Prediction-Linie:** Zeigt ob man auf Kurs ist (trifft sie den Target-Marker?)
   - **Ampel-Indikator:** Grün = auf Kurs, Gelb = knapp, Rot = kritisch hinter Plan
2. **SessionSuggestion** — adaptiv auf den Fokus berechnet
   - Berücksichtigt Deadline-Abstand: viel Zeit → entspannt, wenig Zeit → intensiver
   - SRS-aware: nahe der Deadline weniger Neue (können nicht mehr reifen)

### Aggregierter Tagesplan

**Bottom-Dock (Level 1, immer sichtbar wenn Fokus existieren):**

Statt "Fokus wählen" zeigt es den aggregierten Tagesplan:

```
Biochemie  30 + 10
Anatomie   15 + 20
──────────────────
Gesamt     45 + 30 = 75
```

Kompakt, eine Zeile pro Fokus, Summe darunter. Tap → öffnet Level 2 zum entsprechenden Tab.

### Fokus verwalten

- **Löschen:** Swipe oder X-Button auf dem Tab → Fokus wird archiviert
- **Bearbeiten:** Tap auf Datum → Datum-Picker zum Ändern
- **Max 5 parallele Fokus** (UI-Limit, verhindert Überforderung)
- **Keine Deck-Dopplung:** Ein Deck kann nur in einem Fokus sein. Versuch es einem zweiten zuzuordnen → Warnung

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
      "createdAt": "2026-03-30",
      "archived": false
    }
  ]
}
```

### Speicherort

`config.json` — konsistent mit bestehendem Persistenz-Ansatz (`last_statistik_deck_id` etc.)

## Backend-Anforderungen

### Neue Bridge-Calls

- `saveFocus(focusData)` — Fokus speichern/aktualisieren
- `getFocuses()` — Alle aktiven Fokus laden
- `deleteFocus(focusId)` — Fokus archivieren
- `getDeckTrajectory(deckId)` — bereits implementiert
- `getDeckSessionSuggestion(deckId)` — bereits implementiert, muss um Deadline-Parameter erweitert werden

### Erweiterung SessionSuggestion

`getDeckSessionSuggestion(deckId, deadline?)` — optionaler Deadline-Parameter.
Wenn gesetzt: Plan ist adaptiv auf das Deadline berechnet statt "heute passiv".

## UI-Änderungen

### Level 1 (StatistikView)

- Bottom-Dock: zeigt aggregierten Tagesplan wenn Fokus existieren
- "Fokus festlegen" → öffnet Datum-Picker vor dem Speichern
- Treemap-Blöcke die bereits in einem Fokus sind: subtiler Indikator (z.B. kleines Deadline-Badge)

### Level 2 (Fokus-Ansicht)

- Tab-Bar oben für parallele Fokus
- TrajectoryChart: auto-scaled Range, Target-Marker, Ampel
- SessionSuggestion: deadline-aware Berechnung
- "← Fokus ändern" bleibt als Back-Navigation

### Neues Element: Datum-Picker

Minimaler Datum-Picker, passend zum Design-System. Keine Library — einfacher nativer `<input type="date">` gestylt oder ein simpler Kalender-Popup.

## Nicht in Scope (v1)

- Automatische Prüfungstermin-Erkennung
- Benachrichtigungen/Reminders
- Fokus-Sharing zwischen Geräten (nur lokal)
- KI-basierte Ziel-Optimierung
- Historische Fokus-Analyse (was hat funktioniert)

## Offene Design-Fragen

1. **Soll der aggregierte Tagesplan im Bottom-Dock oder als eigene View erscheinen?** Dock ist kompakt, eigene View gibt mehr Platz für Details.
2. **Datum-Picker:** Nativer Input oder Custom-Kalender? Nativer ist einfacher, Custom ist hübscher.
3. **Was passiert am Deadline-Tag?** Automatisch archivieren? Celebration-Animation? Nur ausgrauen?
