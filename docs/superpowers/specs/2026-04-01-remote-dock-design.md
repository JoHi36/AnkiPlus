# Remote Dock — Mobile Fernbedienung (Design Spec)

**Date:** 2026-04-01
**Status:** Approved
**Mockup:** `web/remote-dock.html` (live: ankiplus-dashboard.vercel.app/remote-dock.html)

## Konzept

Das Handy wird zur reinen Fernbedienung (Apple Remote-Analogie). Kein Karteninhalt — der Content wird auf dem Desktop angezeigt. Das gesamte Handy-UI besteht aus drei Zonen:

```
┌─────────────────────────┐
│  Lernen  Finden  Planen │  ← Echte Anki-Tabs (steuern Desktop-Kontext)
│                         │
│  ┌───────────────────┐  │
│  │                   │  │
│  │   Frosted Box     │  │  ← Schwebendes ds-frosted Element
│  │   (Status/Input)  │  │     Abstand zu allen Seiten
│  │                   │  │
│  │───────────────────│  │  ← border-top Trennlinie
│  │ Weiter ␣ │ MC  ↵  │  │  ← Split-Buttons (Divider, nicht isoliert)
│  └───────────────────┘  │
│                         │
│  [      Touch Zone     ]│  ← Gravity-Grid auf Berührung
└─────────────────────────┘
   bg = ds-bg-deep (Lernen)
        ds-bg-canvas (Finden/Planen)
```

## Drei Zonen

### 1. Anki-Tabs (oben)
- Lernen / Finden / Planen — steuern den Desktop-Kontext remote
- Hintergrund wechselt mit: Lernen → `--ds-bg-deep`, Finden/Planen → `--ds-bg-canvas`
- Dezente Pills, nicht prominent

### 2. Frosted Box (Hauptelement)
- Schwebendes `ds-frosted` Element mit 16px Abstand zu allen Seiten
- `border-radius: 20px`, volle Frosted-Glass-Material-Definition
- Füllt den verfügbaren Platz zwischen Tabs und Touch-Zone (`flex: 1`)
- Inhalt wechselt je nach Phase (siehe States)

**Split-Buttons (unten in der Box):**
- Zwei Bereiche getrennt durch `border-top` + vertikalen `ds-split-divider`
- Keine isolierten Button-Boxen — wie Desktop ChatInput
- Höhe: 60px (prominent, mobile-optimiert)
- Linker Button: Primary-Weight (`--ds-text-primary`, font-weight 600)
- Rechter Button: Secondary (`--ds-text-secondary`, font-weight 500)
- Keyboard-Hints in `--ds-font-mono`, `--ds-text-muted`

### 3. Touch-Zone (unten)
- Leeres Feld unter der Box (56px Höhe, `border-radius: 14px`)
- Im Ruhezustand: komplett leer/blank
- Bei Berührung: Gravity-Grid erscheint — Dot-Grid das sich um den Fingerpunkt verdichtet
  - Dots werden zum Touchpoint gezogen (quadratischer Falloff)
  - `maxDist: 120px`, Dot-Spacing: 16px
  - Alpha: 0.04 (Basis) bis 0.29 (am Finger)
  - Verschwindet beim Loslassen
- Funktion kontextabhängig: Chat scrollen, zwischen Karten wischen

## States (Phase → Box-Inhalt)

### Question (Frage bereit)
- Status: "Karte bereit" (tertiary text, zentriert)
- Buttons: **Antwort** `SPACE` | MC `↵`

### Timer (nach Flip)
- Status: `6s` in `--ds-green`, mono-font 42px + "→ Good"
- Auto-Rating basiert auf Antwortzeit
- Buttons: **Weiter** `SPACE` | Nachfragen `↵`

### Score (nach AI-Evaluation)
- Score-Bar (3px, `--ds-green`) + `73%` mono 42px + "Good"
- Buttons: **Weiter** `SPACE` | Nachfragen `↵`

### MC (Multiple Choice)
- Oben: Sterne (★★★) — reduzieren sich bei Fehlversuchen
- Mitte: A B C D E Chips (48x48px, `border-radius: 14px`, mono-font)
  - Kein Text — der steht auf dem Desktop
  - Tap → `accent-10` Highlight + accent Border
- Buttons: **Auflösen** `SPACE` | Nachfragen `↵`

### Stars (MC-Ergebnis)
- Sterne mit Ergebnis (★★☆ → Hard) + Rating-Arrow
- Buttons: **Weiter** `SPACE` | Nachfragen `↵`

### Chat (Nachfragen-Modus)
- Die gesamte frosted Box wird ein riesiges Textfeld (`<textarea>`)
  - Placeholder: "Nachfrage stellen..."
  - Font: 16px, volle Box-Fläche
  - Kein Chat-Verlauf — der wird auf dem Desktop gelesen
  - Chat-Scrolling passiert über die Touch-Zone
- Send-Button: 32px blauer Kreis, unten rechts
  - Invisible bei leerem Input (`opacity: 0, scale: 0.7`)
  - Faded ein sobald Text eingegeben wird (`opacity: 1, scale: 1`)
  - Transition: 150ms
- Buttons: **Zurück** `ESC` | Senden `↵`

## Design-Tokens

Alle Farben aus `shared/styles/design-system.css`:
- Frosted Box: volle `.ds-frosted` Material-Definition (gradient + blur + inset shadows)
- Hintergründe: `--ds-bg-deep`, `--ds-bg-canvas`
- Text: `--ds-text-primary`, `--ds-text-secondary`, `--ds-text-tertiary`, `--ds-text-muted`, `--ds-text-placeholder`
- Borders: `--ds-border-subtle`, `--ds-border-medium`
- Semantisch: `--ds-green`, `--ds-yellow`, `--ds-red`, `--ds-accent`, `--ds-accent-10`
- Interaktion: `--ds-hover-tint`
- Font: `--ds-font-mono` für Werte + Shortcuts

## Abgrenzung

- **Kein Karteninhalt** auf dem Handy (Remote = reine Fernbedienung)
- **Kein Chat-Verlauf** auf dem Handy (nur Eingabe, Verlauf auf Desktop)
- **Kein Solo-Modus** in diesem Spec (eigener Modus, eigenes Design)
- **Keine Deck-Navigation** in der Box (über Tabs oder zukünftig Touch-Zone Swipe)

## Technische Hinweise

- PWA lebt in `remote/` (React + Vite, deployed auf Vercel)
- Kommunikation via Firebase HTTP-Relay (500ms Polling)
- Demo-Modus verfügbar via `?demo` URL-Parameter
- Mockup-Lab via `web/remote-dock.html` (statisch, kein Build nötig)
