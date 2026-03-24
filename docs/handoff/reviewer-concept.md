# ReviewerView — Grundkonzept

## Architektur

Die React-App (QWebEngineView) liegt über dem GESAMTEN Anki-Fenster via `MainViewWidget`. Es gibt keine native Anki-UI die sichtbar ist. Die React-App IST die gesamte UI — Fullscreen, nicht Sidebar.

`MainViewWidget._position_over_main()` setzt `setGeometry(0, 0, mw.width(), mw.height())` im Fullscreen-Mode. Der äußere React-Container hat ein opakes Background (`--ds-bg-canvas`), damit Ankis native UI darunter nicht durchscheint.

## Kernprinzip

**Ein Screen, ein Inputfeld, kein Seitenfenster standardmäßig.**

Der Reviewer ist das Haupterlebnis. Der User kreuzt Karten durch — fullscreen, zentriert, ohne dass ein Chat-Seitenfenster offen ist. Das Seitenfenster öffnet sich NUR on-demand als "Nachfragen"-Modus.

## Layout

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│              KARTEN-BEREICH (zentriert)                   │
│              Card HTML (Front ODER Back)                  │
│              + MC-Optionen (wenn MC-State)                │
│                                                          │
│                                                          │
│                                                          │
│                                                          │
│          ┌──────────────────────────────┐                │
│          │  DOCK (zentriert, 520px max)  │                │
│          │  topSlot: Rating/Stars/Score  │                │
│          │  [Primary SPACE | Secondary ↵]│                │
│          └──────────────────────────────┘                │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

Es gibt immer nur EIN Inputfeld pro Screen. Das Dock ist dieses Inputfeld.

## Die drei Antworttypen

### 1. Show Answer (SPACE)

Reguläre Anki-Funktion. Karte dreht sich direkt um.

- **Bewertung**: Automatisch, basierend auf Timer (Zeit von Frage-Anzeige bis Flip) im Verhältnis zur Kartenlänge
- **Timer-Thresholds**: `goodThreshold = min(6 + charBonus, 20)s`, `hardThreshold = min(15 + charBonus*2, 45)s`
- **Rating**: elapsed ≤ good → Good (3), elapsed ≤ hard → Hard (2), else → Again (1)
- **Timer-Wert ist EINGEFROREN** nach dem Flip — läuft nicht weiter
- **Klick auf Timer cycled**: 1 → 2 → 3 → 4 → 1 (manuelles Override)

### 2. Multiple Choice (↵ ohne Text)

KI generiert MC-Optionen. User wählt per Klick oder A-D Tasten.

- **Stars**: 3 Sterne, -1 pro Fehlversuch
- **Rating**: 1. Versuch richtig → Good, 2. → Hard, 3+ → Again
- **Nach korrekter Antwort**: Karte dreht sich automatisch um
- **Nach 0 Sternen**: Ergebnis = Again, Karte dreht sich um

### 3. Antwort eingeben (Text + ↵)

User tippt Antwort ein, KI bewertet gegen die korrekte Antwort.

- **Auswertung**: Score (0-100%), Feedback, Ease-Mapping
- **Score → Rating**: ≥90 → Easy, ≥70 → Good, ≥40 → Hard, <40 → Again
- **Nach Auswertung**: Karte dreht sich automatisch um

## State Machine — Dock-Inhalte

| State | topSlot (im Dock) | hideInput | Primary Button | Secondary Button |
|---|---|---|---|---|
| QUESTION | — | false (Textarea sichtbar) | Show Answer `SPACE` | Multiple Choice `↵` |
| EVALUATING | Spinner + AI-Step-Label | true | Abbrechen | — |
| EVALUATED | Score-Bar + % + Rating + Feedback | true | Weiter `SPACE` | Nachfragen `↵` |
| MC_LOADING | Spinner + AI-Step-Label | true | Abbrechen | — |
| MC_ACTIVE | ★★★ (Stars, zentriert) | true | Auflösen `SPACE` | — |
| MC_RESULT | ★★★ → Rating (Stars + Label, zentriert) | true | Weiter `SPACE` | Nachfragen `↵` |
| ANSWER | Timer + Rating (zentriert, klickbar) | true | Weiter `SPACE` | Nachfragen `↵` |

**topSlot-Höhe**: Immer gleiche Höhe wie das Textarea-Feld (~48px min). Alles zentriert. Keine Typ-Labels links oder rechts.

## "Nachfragen"-Flow (Sidebar-Chat)

Verfügbar in allen "rateable" States: ANSWER, EVALUATED, MC_RESULT.

1. User drückt ↵ (oder klickt "Nachfragen") oder tippt Text + ↵
2. Das mittlere Dock verschwindet (animiert raus)
3. Das Seitenfenster gleitet von rechts ein (animiert)
4. Das Textfeld "wandert" visuell von der Mitte nach rechts — fließender Übergang
5. Der Chat hat den Karten-Kontext (Frage, Antwort, Auswertung)
6. ESC schließt das Seitenfenster, Dock erscheint wieder

Dieser Übergang muss smooth sein — Animationen für:
- Sidebar slide-in von rechts
- Dock fade-out
- Textfeld-Transition (Mitte → Sidebar)

## Keyboard Shortcuts

```
SPACE       → Flip (QUESTION) / Rate+Next (rateable states)
ENTER       → MC generieren (QUESTION, leer) / Evaluieren (QUESTION, mit Text) / Nachfragen (rateable)
1-4         → Rating manuell setzen (rateable states)
A-D         → MC-Option wählen (MC_ACTIVE)
ESC         → Chat schließen (wenn Sidebar offen)
```

## Schlüssel-Dateien

- `frontend/src/components/ReviewerView.jsx` — Hauptkomponente
- `frontend/src/App.jsx` — Rendert ReviewerView, forwarded Events, managed Sidebar-State
- `shared/components/ChatInput.tsx` — Dock-Komponente (topSlot + hideInput + actions)
- `shared/styles/design-system.css` — .ds-mc-option, .ds-review-result Klassen
- `ui/widget.py` — Python-Handler: card.flip, card.rate, card.evaluate, card.mc.generate
- `custom_reviewer/interactions.js` — Alte Vanilla-JS Referenz (1072 Zeilen)

## Regeln

1. **Ein Inputfeld pro Screen** — nie zwei gleichzeitig sichtbar
2. **Kein Seitenfenster standardmäßig** — nur via "Nachfragen"
3. **Alles zentriert** — keine Typ-Labels, keine Info links/rechts im Dock
4. **ChatInput WIEDERVERWENDEN** — nicht nachbauen
5. **Alle Farben via `var(--ds-*)` Tokens** — niemals hardcoded hex
6. **MC-Optionen: `.ds-mc-option` CSS-Klassen** — nicht die alten React-Komponenten
7. **Note-Felder für Display** — `frontField`/`backField` statt template-gerenderte HTML
