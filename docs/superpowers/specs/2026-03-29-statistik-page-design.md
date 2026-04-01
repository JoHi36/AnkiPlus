# Statistik Page — Design Spec

## Overview

Die Statistik-Seite ist der dritte Tab (Statistik → Planen). Ihr Interaktionsmodell ist **Trajektorie-basiert**: es geht um Zeit und Richtung — "wohin bewege ich mich?" Das One Glass Object ist ein Ziel-Input ("Was willst du bis wann schaffen?"), der Agent-gestützte Lernplanerstellung triggert.

## Voraussetzung

**Heatmap-Toggle aus Stapel entfernen.** Die `GraphView.jsx` hat aktuell einen "Stapel / Heatmap" Toggle unten. Der Heatmap-Toggle und die `KnowledgeHeatmap`-Integration werden aus der GraphView entfernt. Die `KnowledgeHeatmap`-Komponente selbst bleibt erhalten und wird auf der Statistik-Seite als Wissensstand-Widget eingebunden.

## Layout (v6 — approved)

Kein Scrollen nötig. Wenig Container — Inhalte leben direkt auf der Seite, getrennt durch dünne Divider. Apple-Eleganz: leise Opazitäten, dünne Linien, viel Weißraum.

```
┌──────────────────────────────────────────────────────────┐
│  Fortschritt   42% gesamt                    +1.2% / Tag │
│                                                          │
│  ┌─ Trajektorie-Chart (SVG) ───────────────────────────┐ │
│  │  Past (solid) ───●── Future (dashed) ──◆60% ──◆80%  │ │
│  │                 Heute                                │ │
│  └──────────────────────────────────────────────────────┘ │
│  23 neue Karten / Tag Wachstum · 50 Pflege · 73 gesamt  │
│  ─────────────────────────────────────────────────────── │
│                                                          │
│  Dein Tag           73 Karten  │  Wissensstand           │
│  ████████░░░░░░░░░░░░░░░░░░░  │  ┌─ Treemap ──────────┐ │
│  ● Wachstum    Neue     23    │  │ Anatomie  Phys Phar │ │
│  ● Festigung   Junge    25    │  │ 92%       68%  23%  │ │
│  ○ Pflege      Reife    25    │  │           Bioc Path │ │
│  Echtes Wachstum: +1.8%       │  └─────────────────────┘ │
│  ─────────────────────────────────────────────────────── │
│                                                          │
│  Aktivität 🔥12 Tage    2.847  │  Tageszeit              │
│  ┌─ 365-Tage Heatmap ────────┐ │  ┌─ 24h Bars ─────────┐│
│  │ ░░▓▓█▓░▓█▓▓░░▓█▓▓█░▓█▓▓ │ │  │ ▃▅█▇▅▃▂▃▅▆▅▃▂    ││
│  └────────────────────────────┘ │  │ Am besten: 8-10    ││
│                                  │  └────────────────────┘│
│                                                          │
│         ┌─ ◎ Was willst du bis wann schaffen? ⌘K ─┐      │
└──────────────────────────────────────────────────────────┘
```

## Widgets (5 Bereiche)

### 1. Trajektorie (Hero)

**SVG-Chart** mit zwei Phasen:
- **Past** (links von "Heute"): Durchgezogene blaue Linie, tatsächlicher Fortschritt über Monate
- **Future** (rechts von "Heute"): Gestrichelte Linie mit Confidence-Band, basierend auf aktuellem Tempo

**Daten:**
- Y-Achse: Gesamt-Fortschritt in % (berechnet als gewichteter Durchschnitt aller Decks: `(mature + young * 0.5) / total`)
- X-Achse: Monate (6 Monate zurück, 3 Monate voraus)
- "Heute"-Marker: vertikale gestrichelte Linie + Dot
- Ziel-Marker: Klickbare Punkte auf der Zukunftslinie (z.B. "60% bis Mai", "80% bis Juni")

**Header:** "Fortschritt" (label) + "42%" (groß, blau) + "+1.2% / Tag" (grün, rechts)
**Footer:** "23 neue Karten / Tag Wachstum · 50 Pflege-Reviews · 73 Karten gesamt"

**Datenquelle:** Anki's `revlog`-Tabelle für historische Daten. Täglicher Snapshot des Gesamtfortschritts. Projektion basiert auf gleitendem 7-Tage-Durchschnitt.

### 2. Dein Tag (links)

Ehrliche Aufschlüsselung der heutigen Karten in drei Kategorien:
- **Wachstum** (lila, #5E5CE6): Neue Karten lernen — das ist echter Fortschritt
- **Festigung** (blau, #0A84FF): Junge Karten wiederholen (Intervall < 21 Tage)
- **Pflege** (grau): Reife Karten erhalten (Intervall ≥ 21 Tage)

**Segmented Bar** oben zeigt Proportionen visuell.
**Footer:** "Davon echtes Wachstum: 23 neue Karten (+1.8%)" — hebt hervor, was wirklich zählt.

**Datenquelle:** `revlog` für heute, card type/interval für Kategorisierung.

### 3. Wissensstand (rechts, Treemap)

Wiederverwendung der bestehenden `KnowledgeHeatmap`-Komponente, aber kompakter (120px Höhe). Zeigt Deck-Stärken farbcodiert (Grün=stark, Rot=schwach).

**Ziel-Badges:** Decks mit gesetztem Ziel zeigen "→ 80%" oder "✓ 90%" als Badge.
**Interaktion:** Tippe auf ein Deck → Ziel setzen (Details für spätere Iteration).

### 4. Aktivität (365-Tage GitHub-Heatmap)

Eigenständige Komponente (nicht die bestehende 30-Tage Chat-Heatmap). GitHub-Style Grid: 52 Wochen × 7 Tage, Blautöne nach Aktivitätslevel (0-4).

**Header:** "Aktivität" + Streak-Badge (🔥 12 Tage) + "2.847 dieses Jahr"
**Footer:** Weniger→Mehr Legende

**Datenquelle:** `revlog`, gruppiert nach Datum, Level = Quantile der Kartenanzahl.

### 5. Tageszeit (kompakt, neben Heatmap)

24h Bar-Chart: Höhe = relative Aktivität pro Stunde. Farben: Grün (beste Stunden), Blau (mittel), Grau (wenig).

**Footer:** "Am besten: 8-10 Uhr"

**Tageszeitoptimum-Messung:** Wird anhand von Keyboard-Aktivität oder Event-Bus-Interaktionen gemessen (höhere Interaktionsdichte = produktivere Zeit). Details in späterer Iteration.

**Datenquelle:** `revlog` mit Uhrzeitextraktion, aggregiert über letzte 30+ Tage.

### 6. Ziel-Input (One Glass Object)

Frosted Glass Input-Dock am unteren Bildschirmrand. Placeholder: "Was willst du bis wann schaffen?" + ⌘K Shortcut.

**Funktion (spätere Iteration):** Öffnet Agent-gestützten Lernplan-Flow. Für v1 wird das Input-Feld angezeigt aber noch nicht funktional.

## Stil-Richtlinien

- **Keine Container-Backgrounds** für Trajektorie, Dein Tag, Heatmap. Content lebt direkt auf `--ds-bg-deep`.
- **Dünne Divider** (`1px, rgba(255,255,255,0.04)`) trennen die drei Bereiche.
- **Treemap** behält eigene visuelle Form (Farbzellen brauchen keinen Container).
- **Alle Farben über `var(--ds-*)`** — kein hardcoded Hex.
- **Opazitäten leise** — Labels bei 0.35, Hints bei 0.12, Linien bei 0.04.
- **Typografie:** Section-Titles 13px/500/0.35 Opacity. Werte groß + farbig.

## Wiederverwendbare Widgets

Alle Statistik-Widgets werden als eigenständige React-Komponenten gebaut, die auch im Chat via `get_learning_stats` Tool verwendbar sind:

- `TrajectoryChart` — SVG Fortschrittskurve
- `DailyBreakdown` — Tages-Aufschlüsselung (Wachstum/Festigung/Pflege)
- `YearHeatmap` — 365-Tage GitHub-Heatmap
- `TimeOfDayChart` — 24h Aktivitätsverteilung

Bestehende Widgets bleiben: `StatsWidget` (Streak, 30-Tage-Heatmap, DeckOverview) für Chat-Kontext.

**Alle neuen Widgets werden in den Component Viewer eingetragen** (Abschnitt "Statistik").

## Nicht im Scope (v1)

- Ziel-Input Funktionalität (Agent-Flow für Lernplanerstellung)
- Deck-spezifische Zielansicht (Tippe auf Deck → Ziel-Dialog)
- Dynamische Lernpfad-Generierung
- Zeitmessung via Inaktivitäts-Timer (5-Min-Idle-Pause)
- Per-Deck Drill-Down in der Trajektorie

## Beziehung zu bestehenden Komponenten

- `KnowledgeHeatmap.jsx` (388 Zeilen): Wird aus GraphView entfernt, auf Statistik-Seite eingebunden
- `StatsWidget.jsx`: Bleibt unverändert für Chat-Widgets
- `StatistikView.jsx` (27 Zeilen): Wird komplett ersetzt durch neue Implementation
- `GraphView.jsx`: Heatmap-Toggle + KnowledgeHeatmap-Import werden entfernt
