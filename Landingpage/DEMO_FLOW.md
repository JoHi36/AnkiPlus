# AnkiPlus Demo — User Flow Spezifikation

> Beschreibt den interaktiven Demo-Widget auf der Landing Page.
> Ziel: Die Essenz des Plugin-Flows erlebbar machen — optisch und funktional identisch zur echten App.

---

## Grundlayout

- **Karte ist fullscreen** (ganzer Demo-Container) — kein permanentes Side-Panel
- Unten zentriert: **Floating Dock** (max-width ~480px, abgerundete Ecken)
  - Oberer Bereich: Kontextabhängiger Inhalt (Input / Timer / Auswertung / MC-Optionen)
  - Unterer Bereich: Action Row mit 2 Buttons (links + rechts, getrennt durch Divider)
  - Snake-Border Animation beim Fokus (wie in der echten App)
- **Chat-Panel**: Slide-in von rechts, nur sichtbar nach "Nachfragen"
- Dunkles Theme durchgehend (#0F0F0F Hintergrund, #1A1A1A Dock/Chat)

---

## States & Übergänge

### State 1: QUESTION (Einstieg)
**Sichtbar:**
- Karte fullscreen mit Frage (farbcodierte Schlüsselwörter)
- `[...]` Cloze-Platzhalter unter der Frage
- Floating Dock:
  - **Oben:** Textarea "Antwort eingeben..." + Send-Button (erscheint bei Text)
  - **Action Row:** `Show Answer [SPACE]` | `Multiple Choice [↵]`

**User-Aktionen:**
1. **Space drücken** → State: ANSWER (Timer-Bewertung)
2. **Text eintippen + Enter/Send** → State: EVALUATING → EVALUATED (KI-Bewertung)
3. **Enter (ohne Text)** → State: MC_LOADING → MC_ACTIVE (Quiz generieren)

---

### State 2a: ANSWER (Space-Pfad — Timer-Bewertung)
**Sichtbar:**
- Antwort-Sektion wird eingeblendet (Frage verschwindet)
- Floating Dock:
  - **Oben:** Timer-Anzeige (`Xs`) + Auto-Rating (Again/Hard/Good/Easy)
    - Rating wird automatisch berechnet basierend auf Kartenlänge × Zeit
    - User kann Rating per Klick/Tap ändern
  - **Action Row:** `Weiter [SPACE]` | `Nachfragen [↵]`

**User-Aktionen:**
- **Space / Weiter** → Nächste Karte (State: QUESTION)
- **Enter / Nachfragen** → Chat öffnet sich (State: CHAT)

---

### State 2b: EVALUATING (Text-Pfad — KI bewertet)
**Sichtbar:**
- Floating Dock:
  - **Oben:** Loading-Spinner + ThoughtStream (KI-Schritte: Intent → Suche → Retrieval → Synthese)
  - **Action Row:** Versteckt

**Automatischer Übergang** → EVALUATED (nach KI-Antwort)

---

### State 2c: EVALUATED (Text-Pfad — Ergebnis)
**Sichtbar:**
- Antwort-Sektion wird eingeblendet
- Floating Dock:
  - **Oben:** Auswertungsmodul:
    - Fortschrittsbalken (farbcodiert: grün ≥90%, gelb ≥60%, rot <60%)
    - Score in % + Rating-Label (Again/Hard/Good/Easy)
    - Feedback-Text
    - Bei Score <70%: Fehlende Punkte (eingerückt mit Border-left)
  - **Action Row:** `Weiter [SPACE]` | `Nachfragen [↵]`

**User-Aktionen:**
- **Space / Weiter** → Nächste Karte
- **Enter / Nachfragen** → Chat öffnet sich

---

### State 2d: MC_LOADING (MC-Pfad — Generierung)
**Sichtbar:**
- Floating Dock:
  - **Oben:** Loading-Spinner + "Generiere Optionen" + ThoughtStream
  - **Action Row:** Versteckt

**Automatischer Übergang** → MC_ACTIVE

---

### State 2e: MC_ACTIVE (MC-Pfad — Quiz aktiv)
**Sichtbar:**
- Floating Dock:
  - **Oben:** Multiple-Choice Optionen (A, B, C, D, E)
    - Jede Option: Badge mit Buchstabe + Text
    - Klick → Sofortiges Feedback:
      - **Richtig (1. Versuch):** Grün markiert + Erklärung → Rating: Good
      - **Richtig (2. Versuch):** Grün markiert + Erklärung → Rating: Hard
      - **Falsch:** Rot markiert + ausgegraut + Erklärung → Nächster Versuch
      - **2× Falsch:** Richtige Antwort wird aufgedeckt → Rating: Again
  - **Action Row:** Versteckt (User wählt aus Optionen)

**Nach Abschluss** → MC_RESULT

---

### State 2f: MC_RESULT (MC-Pfad — Ergebnis)
**Sichtbar:**
- MC-Optionen bleiben sichtbar (mit Farb-Markierungen)
- Floating Dock:
  - **Oben:** Ergebnis-Zusammenfassung:
    - ✓/✗ Icon + Rating + Nachricht ("Beim ersten Versuch richtig!" etc.)
  - **Action Row:** `Weiter [SPACE]` | `Nachfragen [↵]`

**User-Aktionen:**
- **Space / Weiter** → Nächste Karte
- **Enter / Nachfragen** → Chat öffnet sich

---

### State 3: CHAT (Nachfragen — bei allen Pfaden)
**Sichtbar:**
- Chat-Panel **slided von rechts rein** (Karte wird schmaler / nach links geschoben)
- Karte + Antwort bleiben links sichtbar
- Chat-Panel (dunkles Theme, #1A1A1A):
  - Chat-Nachrichten (User-Fragen rechts, AI-Antworten links)
  - AI-Antwort: Strukturiert mit Überschriften, Aufzählungen, Fettschrift
  - Unten: Eingabefeld "Stelle eine Frage..."
  - **Action Row:** `Weiter [SPACE]` | `Übersicht [→]` (Button noch nicht final)
- Floating Dock ist **versteckt** wenn Chat offen ist
- **ESC** schließt den Chat wieder

**User-Aktionen:**
- Frage eintippen → AI antwortet
- **Space / Weiter** → Nächste Karte
- **ESC** → Chat schließt, zurück zum vorherigen State
- **Übersicht** → (geplant) Zusammenfassung zum Thema der Karte

---

## Demo-spezifische Vereinfachungen

Da die Demo auf der Landing Page läuft (kein Anki-Backend), gelten folgende Anpassungen:

| Feature | Echte App | Demo |
|---|---|---|
| KI-Bewertung | Echtzeit-API-Call | Simuliert mit Delay + vordefiniertem Ergebnis |
| MC-Generierung | KI generiert Optionen | Vordefinierte Optionen |
| Chat-Antworten | Streaming von API | Simuliertes Streaming (Buchstabe für Buchstabe) |
| ThoughtStream | Echte KI-Schritte | Animierte vordefinierte Schritte |
| Timer | Echte Zeitmessung | Simulierte Zeitmessung |
| Nächste Karte | Aus Anki-Deck | Szenario-Rotation (Medizin, Jura, Bio) |
| Keyboard-Shortcuts | Voll funktional | Space, Enter, ESC funktional |
| Bewertung ändern | Klick auf Rating | Klick auf Rating (visuell) |

---

## Keyboard-Shortcuts (in der Demo aktiv)

| Taste | State | Aktion |
|---|---|---|
| `SPACE` | QUESTION | Show Answer |
| `SPACE` | ANSWER / EVALUATED / MC_RESULT | Weiter (nächste Karte) |
| `ENTER` | QUESTION (ohne Text) | Multiple Choice starten |
| `ENTER` | QUESTION (mit Text) | Antwort absenden |
| `ENTER` | ANSWER / EVALUATED / MC_RESULT | Nachfragen (Chat öffnen) |
| `ESC` | CHAT | Chat schließen |

---

## Komponenten-Mapping (Demo ↔ App)

Ziel: Demo-Komponenten sollen die **gleichen shared Components** verwenden wie die echte App, damit Änderungen automatisch beide Seiten betreffen.

| Demo-Komponente | Shared/App-Quelle | Status |
|---|---|---|
| Floating Dock | `custom_reviewer/template.html` Dock-Layout | Neu zu bauen als React-Component |
| Action Row Buttons | Dock-Action-Buttons aus `interactions.js` | Neu zu bauen |
| MC-Optionen | `shared/components/QuizCard.tsx` | ✅ Bereits shared |
| Auswertung (Text) | `frontend/components/ReviewResult.jsx` | Zu extrahieren nach shared |
| Auswertung (MC) | MC-Result aus `interactions.js` | Zu extrahieren |
| Chat-Input | `frontend/components/ChatInput.jsx` | Zu extrahieren nach shared |
| Chat-Message | `frontend/components/ChatMessage.jsx` | Zu extrahieren nach shared |
| ThoughtStream | `frontend/components/ThoughtStream.jsx` | Zu extrahieren nach shared |
| Button | `shared/components/Button.tsx` | ✅ Bereits shared |

---

## Visuelles Verhalten

- **Übergänge:** Smooth transitions (opacity + translateY) bei State-Wechseln
- **Dock-Morphing:** Dock-Inhalt wechselt mit fade-Transition, Dock selbst bleibt stehen
- **Chat Slide-in:** Panel slided mit `translateX` von rechts rein (~300ms ease)
- **Karte Fade-in:** Bei erster Anzeige: opacity 0→1 + translateY 6px→0
- **MC Flip:** 3D-Rotation beim Wechsel Karte↔Quiz (rotateY)
- **Snake Border:** Animierter conic-gradient Border um das Dock bei Fokus
