# AnkiPlus Design System

## Quick Reference

**Source of Truth:** `shared/styles/design-system.css`
**Full Spec:** `docs/superpowers/specs/2026-03-20-unified-design-system.md`
**Component Viewer:** `npm run dev` → `http://localhost:3000/?view=components`
**Component Viewer Source:** `frontend/src/ComponentViewer.jsx`

---

## Core Principle: Material = Function

Zwei Materialien, nicht Elevation:

| Material | Klasse | Wann | Beispiele |
|----------|--------|------|-----------|
| **Frosted Glass** | `.ds-frosted` | Aktionselemente | ChatInput, Search, Docks |
| **Borderless** | `.ds-borderless` | Content | Karten, Deck-Listen, Sessions |

---

## Design Tokens (CSS Custom Properties)

### Backgrounds
| Token | Dark | Light | Rolle |
|-------|------|-------|-------|
| `--ds-bg-deep` | `#141416` | `#ECECF0` | Chat-Panel, Plusi Diary |
| `--ds-bg-canvas` | `#1C1C1E` | `#FFFFFF` | Hauptfläche |
| `--ds-bg-frosted` | `#161618` | `#F9F9FB` | Frosted Glass |
| `--ds-bg-overlay` | `#3A3A3C` | `#E5E5EA` | Tooltips, Popovers |

### Semantic Colors (Apple HIG)
| Token | Dark | Light | Rolle |
|-------|------|-------|-------|
| `--ds-accent` | `#0A84FF` | `#007AFF` | Primary Actions, Easy |
| `--ds-green` | `#30D158` | `#34C759` | Success, Good |
| `--ds-yellow` | `#FFD60A` | `#FF9F0A` | Warning, Hard |
| `--ds-red` | `#FF453A` | `#FF3B30` | Error, Again |
| `--ds-purple` | `#BF5AF2` | `#AF52DE` | Plusi, Deep Mode |

### Text (Opacity-basiert)
| Token | Rolle |
|-------|-------|
| `--ds-text-primary` | Headlines, Body |
| `--ds-text-secondary` | Beschreibungen |
| `--ds-text-tertiary` | Inaktive Tabs |
| `--ds-text-placeholder` | Input Placeholder |
| `--ds-text-muted` | Keyboard Hints (SPACE) |

### Typography
| Token | Größe | Wo |
|-------|-------|----|
| `--ds-text-xs` | 11px | Keyboard Hints |
| `--ds-text-sm` | 12px | Buttons, Timestamps |
| `--ds-text-base` | 13px | Beschreibungen |
| `--ds-text-md` | 14px | Card Content |
| **`--ds-text-lg`** | **15px** | **Chat Messages (Standard)** |
| `--ds-text-xl` | 18px | Section Headlines |
| `--ds-text-2xl` | 20px | Logo, Major Headlines |

### Fonts
| Token | Verwendung |
|-------|-----------|
| `--ds-font-sans` | Alles (SF Pro / System) |
| `--ds-font-brand` | NUR Plusi + Brand (Space Grotesk) |
| `--ds-font-mono` | Code, Stats |

### Spacing (Base-4)
`--ds-space-xs` (4) / `--ds-space-sm` (8) / `--ds-space-md` (12) / `--ds-space-lg` (16) / `--ds-space-xl` (24) / `--ds-space-2xl` (32)

### Radius
`--ds-radius-sm` (8) / `--ds-radius-md` (12) / `--ds-radius-lg` (16) / `--ds-radius-xl` (22)

---

## Component Classes (`.ds-*`)

CSS-Klassen die in React UND nativem HTML funktionieren:

| Klasse | Zweck |
|--------|-------|
| `.ds-frosted` | Frosted Glass Container |
| `.ds-borderless` | Content Container |
| `.ds-input-dock` | Komplettes Input-Element (Textarea + Actions) |
| `.ds-thought-step` | AI Pipeline Step |
| `.ds-mc-option` | Multiple Choice Option (idle/correct/wrong) |
| `.ds-review-result` | Quiz Feedback |
| `.ds-tab-bar` + `.ds-tab` | Tab-Navigation |
| `.ds-kbd` | Keyboard Shortcut Badge |
| `.ds-split-actions` | Split Action Row (Primary | Divider | Secondary) |

---

## Shared React Components (10 Primitives)

In `shared/components/`:

| Component | Zweck | Key Props |
|-----------|-------|-----------|
| **ChatInput** | Universelles Input-Dock | `actionPrimary`, `actionSecondary`, `placeholder`, `onSend` |
| **Button** | Button Primitive | `variant` (primary/secondary/ghost/outline), `size` |
| **Card** | Content-Container | Glass Effect, Hover, Motion |
| **ThoughtStream** | Pipeline-Visualisierung | `steps[]`, Animationen |
| **MultipleChoiceCard** | MC-UI | Options, Stars, Explanations |
| **QuizCard** | 5-Option Layout | States, Animations |
| **ReviewResult** | Score + Feedback | Circular Progress, Analysis |
| **SourceCard** | Citation Display | Deck Info, Snippet |
| **SourcesCarousel** | Sources Scroll | Masking, Perplexity-Style |
| **ResponsiveContainer** | Layout Wrapper | Max-Width, Responsive |

---

## Composable Primitive Vision (Next Level)

### Das Ziel: Ein Baustein, viele Anwendungen

Statt 70 lose Komponenten → 6 Grundbausteine aus denen ALLES gebaut wird:

**ActionDock** = ChatInput mit konfigurierbaren Actions
```
Reviewer (Question): Input "Antwort..." + [Show Answer SPACE] | [MC ↵]
Reviewer (Answer):   [Weiter SPACE] | [Nachfragen ↵]
Session Chat:        Input "Stelle eine Frage..." + [Weiter SPACE] | [Agent Studio ↵]
FreeChat:            Input "Stelle eine Frage..." + [Schließen ⌴] | [Senden ↵]
```

**Surface** = Hintergrund-Material
```
<Surface material="frosted">  → .ds-frosted
<Surface material="canvas">   → .ds-borderless
<Surface material="deep">     → bg-deep
```

**Badge** = Status/Kategorie Labels
```
Agent Badges:  @Tutor (grün), @Research (blau), @Plusi (lila)
Rating Badges: Again (rot), Hard (gelb), Good (grün), Easy (blau)
Stats Badges:  Neu (blau), Fällig (orange), Wieder (grün)
```

**CardShell** = Container für Inhalts-Karten
```
MC-Option, Insight-Bullet, Agent-Card, Source-Card → gleicher Container
```

---

## Plusi Design System

### Moods (14+ States)
neutral, happy, sad, curious, reading, thinking, excited, empathy, proud, confused, sleepy, mischievous, love, error

### Visual Elements
- SVG Mascot: `shared/plusi-renderer.js` (41KB, vollständig)
- Glow Animation: Pulsierender Halo basierend auf Mood-Farbe
- Bubble: Sprechblase mit Text + Fade-Animation
- Brand Font: Space Grotesk (`--ds-font-brand`)
- Brand Color: `--ds-purple` (#BF5AF2)

### Agent Colors
| Agent | Farbe | Token |
|-------|-------|-------|
| @Tutor | Grün | `--ds-green` |
| @Research | Blau | `--ds-accent` |
| @Plusi | Lila | `--ds-purple` |
| @Help | Grau | `--ds-text-secondary` |

---

## Regeln (MANDATORY)

1. **KEINE hardcoded Farben** — immer `var(--ds-*)` Tokens
2. **Material = Function** — Frosted Glass für Actions, Borderless für Content
3. **Chat Body = 15px** (`--ds-text-lg`)
4. **Jede neue Komponente** MUSS im ComponentViewer eingetragen werden
5. **Shared Components wiederverwenden** — nicht nachbauen
6. **Dark + Light Mode testen** für jede neue Komponente
7. **Space Grotesk NUR für Plusi + Brand**
8. **ChatInput für ALLE Input-Docks** — verschiedene Actions via Props

---

## Dateistruktur

```
shared/
├── styles/design-system.css      ← Source of Truth (alle Tokens + .ds-*)
├── config/tailwind.preset.js     ← Tailwind ↔ Token Mapping
├── components/                   ← 10 Shared React Primitives
│   ├── ChatInput.tsx             ← DAS Input-Element
│   ├── Button.tsx
│   ├── Card.tsx
│   ├── ThoughtStream.tsx
│   ├── MultipleChoiceCard.tsx
│   ├── QuizCard.tsx
│   ├── ReviewResult.tsx
│   ├── SourceCard.tsx
│   ├── SourcesCarousel.tsx
│   └── ResponsiveContainer.tsx
├── plusi-renderer.js             ← Plusi SVG Mood System
└── utils/constants.ts

frontend/src/
├── ComponentViewer.jsx           ← Design System Referenz (localhost:3000/?view=components)
├── components/                   ← 70 App-Komponenten (nutzen Shared Primitives)
└── hooks/                        ← 15 Hooks
```
