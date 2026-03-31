# Statistik als Lernplan — Design Spec

**Status:** Approved
**Date:** 2026-03-30
**Depends on:** TrajectoryChart v2 (done), KnowledgeHeatmap (existing), bridge_stats.py (existing)

## Overview

Die StatistikView wird zu einem Two-Level Flow umgebaut. Level 1 zeigt eine Wissenslandschaft (Polished Treemap), Level 2 zeigt Fokus-Details für ein einzelnes Deck mit Trajectory + Lernvorschlag.

## Level 1 — Wissenslandschaft

### Hero: Polished Treemap

Die bestehende KnowledgeHeatmap wird visuell überarbeitet:

**Layout:**
- Squarify-Algorithmus bleibt (echte Proportionen nach Kartenzahl)
- **6px Gaps** zwischen allen Blöcken
- **14px border-radius** auf allen Blöcken
- Subtile **Gradienten** statt Flat-Fills (heller oben-links, dunkler unten-rechts)
- Volle Breite, Hero-Position oben in der StatistikView

**Farbe = Mastery-Encoding:**
- Durchgehender **rot → orange → gelb → gelbgrün → grün** Farbverlauf
- Basiert auf `mastery_pct` = `(mature_cards + young_cards * 0.5) / total_cards`
- Farbstops: 0% = `#F87171`, 30% = `#FB923C`, 50% = `#FBBF24`, 70% = `#A3E635`, 90%+ = `#4ADE80`
- Opacity-Stufen: Label ~40%, Prozentwert ~85%, Kartenzahl ~25%, Hintergrund-Gradient 5-18%
- Border: gleiche Farbe, ~10-12% Opacity

**Sortierung:**
- **Stärkstes Deck zuerst** (oben-links = grün, unten-rechts = rot)
- Motivierendes Framing: "Worauf kann ich aufbauen?"
- Sortierung erfolgt VOR dem Squarify-Algorithmus (Input-Array nach mastery_pct DESC sortieren)

**Interaktion:**
- **Single-Tap** → Level 2 (Deck-Fokus mit Trajectory + SessionSuggestion)
- **Long-Press** → Drill-Down in Kinder-Decks (bestehende Morph-Animation, nur bei Parent-Decks mit Kindern)

**Block-Content:**
- Deck-Name (uppercase, letter-spacing, niedrige Opacity)
- Mastery-Prozent (großer Font, hohe Opacity)
- Kartenzahl (klein, sehr niedrige Opacity) — nur wenn Block groß genug

### Sekundäre Charts (unter der Treemap, scrollbar)

- **YearHeatmap** — jährliche Aktivitäts-Konsistenz (bestehend)
- **TimeOfDayChart** — optimale Lernzeiten (bestehend)

Keine Änderungen an diesen Komponenten nötig.

## Level 2 — Stapel-Fokus

### Betreten

- Tap auf Deck-Block in der Treemap
- **Morph-Transition:** Block expandiert zu voller Breite (bestehende Animationslogik adaptieren)

### Inhalte

**1. TrajectoryChart (bestehend)**
- Zeigt per-Deck Fortschrittsverlauf + Prediction
- Nutzt den bestehenden TrajectoryChart mit useTrajectoryModel
- Daten kommen von neuem `getDeckTrajectory(deckId)` Bridge-Call

**2. SessionSuggestion (neu)**
- Informativer Lernvorschlag: "X Pflege + Y Neue = Z Karten heute"
- Dynamisch berechnet, passiv nutzbar — kein "Jetzt lernen" Button
- Berechnung rückwärts aus Prediction-Kurve: welcher tägliche Mix hält die Kurve auf Kurs?
- Zeigt: `dueReview` (Pflege), empfohlene `newCards`, Summe
- Visuell: kompakte Card unter dem TrajectoryChart, Design-System-konform (`.ds-frosted` oder `.ds-canvas`)

### Verlassen

- Back-Button oben-links → collapsiert zurück zur Treemap
- Oder: Swipe-Back (falls framer-motion unterstützt)

## Backend

### Neuer Bridge-Call: `getDeckTrajectory(deckId)`

- Separater Call (nicht in `getStatistikData` integriert)
- Cachebar: Frontend cached Ergebnisse pro deckId für die Session
- Rückgabe: gleiche Struktur wie `get_trajectory_data()`, aber gefiltert auf ein Deck
- Implementation: `bridge_stats.py` erweitern um `get_deck_trajectory(deck_id)`

### Neuer Bridge-Call: `getDeckSessionSuggestion(deckId)`

- Berechnet empfohlene Session für heute
- Rückgabe: `{ dueReview: number, recommendedNew: number, total: number, deckName: string }`
- Logik: `dueReview` = aktuell fällige Reviews, `recommendedNew` = basierend auf Deck-Limits und aktueller Auslastung

### Bestehende Calls

- `getStatistikData()` — unverändert (liefert weiterhin globale Daten für Level 1)
- KnowledgeHeatmap-Daten kommen bereits über `getStatistikData()` → Feld `treemap`/`knowledge`

## Persistenz

- Letzte Deck-Auswahl wird in `config.json` gespeichert (`last_statistik_deck_id`)
- Beim Öffnen der StatistikView: wenn ein gespeichertes Deck existiert, optional automatisch Level 2 öffnen (oder nur den Block visuell hervorheben — TBD beim Finetuning)

## Änderungen an bestehenden Komponenten

### KnowledgeHeatmap.jsx — Major Refactor

- Farb-System: weg von 7-Level strength-Farben, hin zu kontinuierlichem Mastery-Gradient
- Sortierung: Input-Array nach mastery_pct DESC sortieren vor Squarify
- Styling: Gaps (6px), border-radius (14px), Gradienten
- Tap-Handler: Single-Tap feuert `onDeckSelect(deckId)` statt Drill-Down
- Long-Press: bestehender Drill-Down nur für Parent-Decks mit Kindern
- Bestehende Breadcrumb-Navigation bleibt für Drill-Down

### StatistikView.jsx — Layout-Umbau

- Treemap wird Hero (oben, volle Breite)
- TrajectoryChart verschwindet aus Level 1 (nur noch in Level 2)
- Level-2-State: `selectedDeckId` → zeigt Deck-Fokus-View
- Transition-Animation zwischen Level 1 und Level 2

### bridge.py / widget.py — Neue Message-Handler

- `getDeckTrajectory` Message-Handler
- `getDeckSessionSuggestion` Message-Handler

### bridge_stats.py — Neue Funktionen

- `get_deck_trajectory(deck_id)` — per-Deck 180-Tage-Trajectory
- `get_deck_session_suggestion(deck_id)` — Lernvorschlag-Berechnung

## Nicht in Scope

- "Jetzt lernen" Button (bewusst nur informativ)
- Anpassung von Anki-Tageslimits
- Änderungen an YearHeatmap oder TimeOfDayChart
- Neue Python-Tests (bridge_stats hat keine bestehenden Tests)

## Design-System Compliance

- Alle Farben über `var(--ds-*)` Tokens oder berechnete HSLA-Werte basierend auf Mastery
- Treemap-Blöcke: keine CSS-Klassen, SVG-Rendering (wie bestehend)
- SessionSuggestion: `.ds-frosted` oder `.ds-canvas` Material
- Schriften: SF Pro (system-ui), Brand-Font nur für Plusi
