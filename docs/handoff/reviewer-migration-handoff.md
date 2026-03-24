# ReviewerView Migration — Handoff Prompt

## Kontext

Wir migrieren den Custom Reviewer (vanilla HTML/JS/CSS in `custom_reviewer/`) zu einer React-Komponente (`ReviewerView.jsx`). Die Stufen 1+2 (QDockWidget → Sidebar, zwei React-Apps zu einer) sind erledigt. Der Custom Reviewer ist deaktiviert, sein Code existiert als Referenz.

## Aktueller Stand

### Was funktioniert
- ReviewerView.jsx existiert mit State Machine (QUESTION/EVALUATING/EVALUATED/MC_LOADING/MC_ACTIVE/MC_RESULT/ANSWER)
- ChatInput (shared) wird als Dock wiederverwendet mit `topSlot` + `hideInput` zum Morphen
- Python-Handler in widget.py: `card.flip`, `card.rate`, `card.evaluate`, `card.mc.generate`
- Events von Python: `reviewer.evaluationResult`, `reviewer.mcOptions`, `reviewer.aiStep` → als CustomEvents in App.jsx dispatched
- Timer mit Auto-Rating (zeitbasiert) im ANSWER-State
- Stars-System für MC (3 Sterne, degradiert pro Fehlversuch)

### Was KAPUTT ist / NICHT stimmt

1. **Card HTML zeigt Müll-Text**: Anki-Tags (#Ankiphil_Vorklinik...), "Errata"-Label, und teilweise noch JavaScript-Code werden als sichtbarer Text gerendert. Die `_clean_card_html` Funktion in `widget.py` strippt nicht genug. Anki's `card.answer()` enthält alles: Styles, Scripts, Tag-Metadata, Question+Answer. Man muss aggressiver bereinigen oder die Felder direkt aus der Note lesen.

2. **MC-Komponente ist VERALTET**: Sowohl `MultipleChoiceCard.tsx` als auch `QuizCard.tsx` in `shared/components/` sind alte, überladene Komponenten (Framer Motion, emerald-500 Tailwind-Farben, "Karte umdrehen" Button etc.). Sie gehören GELÖSCHT. Das Design System hat einfache `.ds-mc-option` CSS-Klassen (`shared/styles/design-system.css` ab Zeile 388). Die MC-Optionen sollen diese Design-System-Klassen verwenden — schlank, clean, keine Animations-Library.

3. **Rating doppelt angezeigt**: Im MC_RESULT-State zeigen die Stars "★★★ → Good" UND der Button "Weiter · Good". Rating soll NUR in den Stars (topSlot) stehen, der Button sagt nur "Weiter".

4. **Timer stoppt nicht**: Im ANSWER-State läuft der Timer weiter nachdem man flippt. Er soll STOPPEN wenn die Karte umgedreht wird und den Wert einfrieren.

5. **"Weiter" soll NICHT "Weiter · Good" heißen**: Der Button heißt nur "Weiter", die Bewertung steht oben im Dock-Content (Timer oder Stars).

## Architektur (so soll es sein, 1:1 wie Custom Reviewer)

### Zwei Bereiche
```
┌──────────────────────────────────┐
│  KARTEN-BEREICH (scrollbar)      │
│  - Card HTML (Front ODER Back)   │
│  - MC-Optionen (wenn MC-State)   │
│                                  │
│                                  │
├──────────────────────────────────┤
│  DOCK (ChatInput, sticky bottom) │
│  ┌────────────────────────────┐  │
│  │ topSlot: morpht per State  │  │
│  │ (textarea/timer/score/     │  │
│  │  stars/thoughtstream)      │  │
│  ├────────────────────────────┤  │
│  │ Actions: [Primary | Secon] │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

### State Machine — Dock-Inhalte

| State | topSlot (im Dock) | hideInput | Primary Button | Secondary Button |
|---|---|---|---|---|
| QUESTION | — | false (Textarea sichtbar) | Show Answer `SPACE` | Multiple Choice `↵` |
| EVALUATING | Spinner + AI-Step-Label | true | Abbrechen | — |
| EVALUATED | Score-Bar (3px) + % + Ease + Feedback | true | Weiter `SPACE` | Nachfragen `↵` |
| MC_LOADING | Spinner + AI-Step-Label | true | Abbrechen | — |
| MC_ACTIVE | ★★★ → Gut (Stars) | true | Auflösen `SPACE` | Auflösen & Nachfragen `↵` |
| MC_RESULT | ★★★ → Rating (Stars + Label) | true | Weiter `SPACE` | Nachfragen `↵` |
| ANSWER | Timer (12s Good, klick zum Ändern) | true | Weiter `SPACE` | Nachfragen `↵` |

### "Nachfragen" Verhalten
- Klick auf "Nachfragen" ODER Text tippen + Enter im rateable State → öffnet Sidebar-Chat mit Kontext
- Das Sidebar-Panel (rechts, 450px) zeigt den Chat
- `onFollowUp(text)` Prop ruft `handleSend(text)` in App.jsx auf

## Schlüssel-Dateien

### React Frontend
- `frontend/src/components/ReviewerView.jsx` — Hauptkomponente (HIER arbeiten)
- `frontend/src/components/ChatInput.jsx` → re-exportiert `shared/components/ChatInput.tsx`
- `frontend/src/App.jsx` — Rendert ReviewerView (ab ~Zeile 2406), forwarded reviewer.* Events
- `shared/styles/design-system.css` — `.ds-mc-option` Klassen (Zeile 388-419), `.ds-review-result` (Zeile 423-465)
- `shared/components/ChatInput.tsx` — Dock-Komponente mit `topSlot`, `hideInput`, `placeholder`, `actionPrimary/Secondary`

### Python Backend
- `ui/widget.py` — Handler: `card.flip`, `card.rate`, `card.evaluate`, `card.mc.generate`, `_send_card_data`, `_clean_card_html`
- `custom_reviewer/__init__.py` — Referenz: `_call_ai_evaluation()`, `_call_ai_mc_generation()`, `_get_deck_context_answers_sync()`
- `custom_reviewer/interactions.js` — **DIE REFERENZ** für das gesamte Dock-Verhalten (1072 Zeilen, komplett lesen!)
- `custom_reviewer/template.html` — HTML-Struktur des Docks
- `custom_reviewer/styles.css` — `.mc-option`, `.mc-letter` Klassen

### Bridge-Kommunikation
- **JS → Python**: `bridgeAction('card.flip')`, `bridgeAction('card.rate', {ease})`, `bridgeAction('card.evaluate', {question, userAnswer, correctAnswer})`, `bridgeAction('card.mc.generate', {question, correctAnswer, cardId})`
- **Python → JS**: `_send_to_frontend('reviewer.evaluationResult', {score, feedback})`, `_send_to_frontend('reviewer.mcOptions', [{text, correct, explanation}])`, `_send_to_frontend('reviewer.aiStep', {phase, label})`
- **Events**: App.jsx forwarded `reviewer.*` Payloads als `window.dispatchEvent(new CustomEvent(...))`

## Card HTML Problem im Detail

`card.answer()` liefert ALLES:
```html
<style>.card { ... }</style>
<div class="tags">#Ankiphil_Vorklinik...</div>
<div>Errata</div>
<div>Kleinzehenloge</div>
<div>Wo liegt der Ursprung des M. abductor digiti minimi pedis ?</div>
<script>// BUTTON SHORTCUTS var tags = '84' ...</script>
<hr id="answer">
<div>Calcaneus (Proc. lateralis ...)</div>
```

Die aktuelle `_clean_card_html` strippt nur `<script>` Tags und `// BUTTON SHORTCUTS`. Sie muss auch strippen:
- `<style>` Tags
- Alles vor `<hr id=answer>` (für backHtml — wird schon gemacht aber greift nicht immer)
- Div-Elemente mit Tag-Metadaten (#-prefixed lines)
- "Errata" Labels und andere Template-Artefakte

Besser: Die Note-Felder direkt lesen (`card.note().fields[0]` / `fields[1]`) statt `card.question()`/`card.answer()` die das komplette Template rendern.

## MC-Optionen — Richtige Implementierung

NICHT MultipleChoiceCard.tsx oder QuizCard.tsx verwenden. Diese sind überladen.

Die MC-Optionen sollen die `.ds-mc-option` CSS-Klassen aus `design-system.css` nutzen:
```jsx
<button className={`ds-mc-option ${isCorrect ? 'correct' : ''} ${isWrong ? 'wrong' : ''}`}>
  <span className="mc-letter">{letter}</span>
  <span>{text}</span>
</button>
```

Oder einen neuen, minimalen React-Wrapper bauen der diese Klassen benutzt.

## Timer-Logik (aus interactions.js)

```javascript
// Timer startet wenn ANSWER-State beginnt (Karte umgedreht)
// Timer STOPPT sofort — er misst nur die Zeit VOM Fragestart BIS zum Umdrehen
// Der angezeigte Wert ist EINGEFROREN nach dem Flip
function getTimeThresholds() {
  const chars = questionCharCount;
  const bonus = Math.floor(chars / 50);
  const goodThreshold = Math.min(6 + bonus, 20);    // 6-20s
  const hardThreshold = Math.min(15 + bonus * 2, 45); // 15-45s
}
// elapsed <= goodThreshold → Good (3)
// elapsed <= hardThreshold → Hard (2)
// else → Again (1)
// Klick auf Timer cycled: 1→2→3→4→1
```

WICHTIG: Der Timer misst die Zeit von QUESTION-Start bis FLIP. Im ANSWER-State wird die eingefrorene Zeit + Rating angezeigt. Der Timer läuft NICHT weiter.

## Keyboard Shortcuts

```
SPACE       → Flip (QUESTION) / Rate+Next (ANSWER/EVALUATED/MC_RESULT)
ENTER       → MC generieren (QUESTION, leer) / Evaluieren (QUESTION, mit Text) / Nachfragen (rateable, mit Text)
1-4         → Rating manuell setzen (ANSWER/EVALUATED/MC_RESULT)
A-D/a-d     → MC-Option wählen (MC_ACTIVE) [TODO]
ESC         → Chat schließen (wenn offen)
```

## Safety Tags
- `pre-reviewer-migration` — vor dem ersten Versuch
- `pre-unified-app` — vor Stufe 2

## Regeln
1. **ChatInput WIEDERVERWENDEN** — nicht nachbauen
2. **Alle Farben via `var(--ds-*)` Tokens** — NIEMALS hardcoded hex
3. **Inkrementell** — ein Feature nach dem anderen, jedes testen
4. **`custom_reviewer/interactions.js` ist DIE REFERENZ** — im Zweifel dort nachlesen
5. **MC-Optionen: `.ds-mc-option` CSS-Klassen** — nicht die alten React-Komponenten
