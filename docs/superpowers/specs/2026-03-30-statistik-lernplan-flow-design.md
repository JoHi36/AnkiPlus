# Statistik als Lernplan — Two-Level Flow

**Date:** 2026-03-30
**Status:** Draft (Brainstorming-Ergebnis, needs detailed design)
**Depends on:** TrajectoryChart v2 (implemented), KnowledgeHeatmap (existing)

---

## Vision

Die Statistik-Seite wird von einem passiven Dashboard zu einem aktiven Lernplan-Tool umgebaut. Zwei Ebenen: erst sehen wo man steht (Treemap), dann verstehen wohin es geht (Trajectory), und am Ende bekommen was man tun soll (Session-Vorschlag).

## Two-Level Architecture

### Level 1: Wissenslandschaft (Outer)

**Hero-Element:** KnowledgeHeatmap (Treemap) — volle Breite, prominenter als aktuell.
Zeigt alle Decks als farbige Blöcke. Rot = schwach, Grün = stark. Drill-down durch Tap.

**Darüber:** "Worauf möchtest du dich fokussieren?"

**Drumherum (sekundär):**
- GitHub-Style Aktivitäts-Heatmap (YearHeatmap) — zeigt Konsistenz
- TimeOfDay-Chart — zeigt optimale Lernzeiten
- Streak-Info — motivational

**Interaktion:** User tappt auf einen Deck-Block → Übergang zu Level 2.

**Persistenz:** Die letzte Auswahl wird gespeichert. Beim nächsten Öffnen der Statistik wird der zuletzt fokussierte Stapel direkt angeboten (aber nicht erzwungen — man kann jederzeit zurück zur Treemap).

### Level 2: Stapel-Fokus (Inner)

**Betreten durch:** Tap auf Deck-Block in der Treemap.

**Inhalt:**
1. **TrajectoryChart** — Fortschrittsverlauf + Prediction für genau diesen Stapel
   - Damped Holt Forecast mit Dynamik-Score
   - Confidence Band (oberer Rand = Potential, unterer Rand = Decay-Szenario)
   - W/M/J Zeitraum-Umschalter
   - Header Value Swap bei Hover
2. **Session-Vorschlag** — "Was du heute brauchst für diesen Stapel"
   - Berechnet rückwärts aus der Prediction
   - Zeigt: X Pflege-Reviews + Y neue Karten = Z Karten gesamt
   - Berücksichtigt Deck-Mastery (hohes Deck braucht mehr Pflege, niedriges braucht mehr Neue)

**Nicht enthalten auf Level 2:**
- Keine YearHeatmap (gehört zur Außenebene)
- Keine TimeOfDay (gehört zur Außenebene)
- Keine DailyBreakdown (der Session-Vorschlag ersetzt das)
- Minimal, fokussiert auf diesen einen Stapel

**Navigation:** Back-Button oder Swipe → zurück zur Treemap.

## Session-Vorschlag: Umgekehrte Prediction

Die Kernberechnung: gegeben die Prediction-Kurve, was muss der User HEUTE tun um auf Kurs zu bleiben?

### Formel

```
target_pct_tomorrow = prediction_line[1]  // Wert morgen laut Prediction
delta_pct = target_pct_tomorrow - current_pct
delta_cards = delta_pct / 100 * total_cards_in_deck

// Aufschlüsselung:
new_cards_needed = max(0, ceil(delta_cards))
due_cards_today = cards_due_in_deck  // von Anki's Scheduler
maintenance_cards = due_cards_today

suggested_session = {
  neue: new_cards_needed,
  pflege: maintenance_cards,
  gesamt: new_cards_needed + maintenance_cards,
}
```

### Anpassung nach Mastery

- **Niedriger Mastery (< 30%):** Mehr neue Karten, weniger Pflege. Jede neue Karte bewegt den Prozentsatz stark.
- **Mittlerer Mastery (30-70%):** Balance aus Neuen und Pflege.
- **Hoher Mastery (> 70%):** Hauptsächlich Pflege (viele mature Karten werden fällig). Wenige neue Karten bewegen den Prozentsatz kaum noch.

### Backend-Anforderungen

Neue Bridge-Methode nötig: `getDeckSessionSuggestion(deckId)` die zurückgibt:
- `due_new`: Anzahl neue Karten die in diesem Deck verfügbar sind
- `due_review`: Anzahl fällige Review-Karten in diesem Deck
- `total_cards`: Gesamt-Karten im Deck
- `mature_cards`: Mature Karten im Deck
- `young_cards`: Young Karten im Deck

## Scope-Frage: Deck vs. Gesamt

- **mature_pct**: immer relativ zum gewählten Deck (nicht global)
- **Dynamik**: berechnet aus den Review-Counts des gewählten Decks
- **Wachstum (neue Karten/Tag)**: ist global — wenn du 20 neue Karten am Tag lernst, ist das über alle Decks verteilt

## Transition Design

**Treemap → Stapel-Fokus:**
- Tap auf Deck-Block
- Block expandiert (morph-Animation, bereits in KnowledgeHeatmap implementiert als drill-down)
- Überblendung zu Level 2

**Zurück:**
- Back-Button oder Swipe
- Level 2 collapsiert zurück zum Treemap-Block

## Was bereits existiert

- `KnowledgeHeatmap.jsx` — Treemap mit Drill-Down, Squarify-Layout, Strength-Coloring ✅
- `TrajectoryChart.jsx` — Damped Holt, Dynamik, Confidence Band, Hover ✅
- `YearHeatmap.jsx` — GitHub-Style Activity Grid ✅
- `TimeOfDayChart.jsx` — Stunden-Distribution ✅
- `DailyBreakdown.jsx` — Tages-Aufschlüsselung ✅
- `bridge_stats.py` — Backend-Daten für alle Charts ✅
- `StatistikView.jsx` — aktueller Container (muss umgebaut werden)

## Was neu gebaut werden muss

1. **StatistikView Rewrite** — Two-Level State Machine (outer/inner)
2. **SessionSuggestion-Komponente** — zeigt den Vorschlag im Level 2
3. **Backend: `getDeckSessionSuggestion`** — per-Deck Session-Daten
4. **Backend: `getDeckTrajectory`** — per-Deck Trajectory-Daten (mature_pct pro Tag für ein spezifisches Deck, nicht global)
5. **Persistenz** — letzte Deck-Auswahl speichern/laden

## Mockups

Brainstorming-Session Mockups: `.superpowers/brainstorm/24974-1774810098/content/`
