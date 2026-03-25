# ReviewerView Migration — Handoff

## Context

We are migrating the custom reviewer (vanilla HTML/JS/CSS in `custom_reviewer/`) to a React component (`ReviewerView.jsx`). Stages 1+2 (QDockWidget -> sidebar, two React apps merged into one) are complete. The custom reviewer is disabled; its code remains as a reference.

## Current State

### What Works
- `ReviewerView.jsx` exists with state machine (QUESTION / EVALUATING / EVALUATED / MC_LOADING / MC_ACTIVE / MC_RESULT / ANSWER)
- ChatInput (shared) is reused as the dock via `topSlot` + `hideInput` for morphing
- Python handlers in `widget.py`: `card.flip`, `card.rate`, `card.evaluate`, `card.mc.generate`
- Events from Python: `reviewer.evaluationResult`, `reviewer.mcOptions`, `reviewer.aiStep` — dispatched as `CustomEvent` in `App.jsx`
- Timer with auto-rating (time-based) in ANSWER state
- Stars system for MC (3 stars, degrades per wrong attempt)

### What Is Broken / Incorrect

1. **Card HTML renders garbage text**: Anki tags (`#Ankiphil_Vorklinik...`), "Errata" labels, and sometimes JavaScript code are rendered as visible text. The `_clean_card_html` function in `widget.py` does not strip enough. `card.answer()` returns everything: styles, scripts, tag metadata, question and answer combined. Either strip more aggressively, or read fields directly from the note.

2. **MC component is outdated**: Both `MultipleChoiceCard.tsx` and `QuizCard.tsx` in `shared/components/` are old, bloated components (Framer Motion, `emerald-500` Tailwind colors, "flip card" buttons, etc.). They should be deleted. The design system has simple `.ds-mc-option` CSS classes (`shared/styles/design-system.css` from line 388). MC options should use those design system classes — lean, clean, no animation library.

3. **Rating shown twice**: In MC_RESULT state, the stars display "3 stars -> Good" AND the button reads "Continue - Good". The rating should appear ONLY in the stars (topSlot); the button should say only "Continue".

4. **Timer does not stop**: In ANSWER state the timer keeps running after the card flips. It should STOP when the card is flipped and freeze that value.

5. **"Continue" button should not say "Continue - Good"**: The button says only "Continue"; the rating is shown above in the dock content (timer or stars).

## Architecture (Target State, 1:1 Match with Custom Reviewer)

### Two Regions
```
+----------------------------------+
|  CARD AREA (scrollable)          |
|  - Card HTML (Front OR Back)     |
|  - MC options (when in MC state) |
|                                  |
|                                  |
+----------------------------------+
|  DOCK (ChatInput, sticky bottom) |
|  +----------------------------+  |
|  | topSlot: morphs per state  |  |
|  | (textarea / timer / score /|  |
|  |  stars / thoughtstream)    |  |
|  +----------------------------+  |
|  | Actions: [Primary | Second]|  |
|  +----------------------------+  |
+----------------------------------+
```

### State Machine — Dock Contents

| State | topSlot (in dock) | hideInput | Primary Button | Secondary Button |
|---|---|---|---|---|
| QUESTION | — | false (textarea visible) | Show Answer `SPACE` | Multiple Choice `ENTER` |
| EVALUATING | Spinner + AI step label | true | Cancel | — |
| EVALUATED | Score bar (3px) + % + ease + feedback | true | Continue `SPACE` | Follow Up `ENTER` |
| MC_LOADING | Spinner + AI step label | true | Cancel | — |
| MC_ACTIVE | stars | true | Resolve `SPACE` | Resolve & Follow Up `ENTER` |
| MC_RESULT | stars + label | true | Continue `SPACE` | Follow Up `ENTER` |
| ANSWER | Timer (12s Good, click to change) | true | Continue `SPACE` | Follow Up `ENTER` |

### Follow-Up Behavior
- Click "Follow Up" OR type text + Enter in a rateable state -> opens sidebar chat with card context
- The sidebar panel (right, 450px) shows the chat
- `onFollowUp(text)` prop calls `handleSend(text)` in `App.jsx`

## Key Files

### React Frontend
- `frontend/src/components/ReviewerView.jsx` — main component (work here)
- `frontend/src/components/ChatInput.jsx` — re-exports `shared/components/ChatInput.tsx`
- `frontend/src/App.jsx` — renders ReviewerView (from ~line 2406), forwards `reviewer.*` events
- `shared/styles/design-system.css` — `.ds-mc-option` classes (lines 388-419), `.ds-review-result` (lines 423-465)
- `shared/components/ChatInput.tsx` — dock component with `topSlot`, `hideInput`, `placeholder`, `actionPrimary/Secondary`

### Python Backend
- `ui/widget.py` — handlers: `card.flip`, `card.rate`, `card.evaluate`, `card.mc.generate`, `_send_card_data`, `_clean_card_html`
- `custom_reviewer/__init__.py` — reference: `_call_ai_evaluation()`, `_call_ai_mc_generation()`, `_get_deck_context_answers_sync()`
- `custom_reviewer/interactions.js` — THE reference for all dock behavior (1072 lines, read completely)
- `custom_reviewer/template.html` — HTML structure of the dock
- `custom_reviewer/styles.css` — `.mc-option`, `.mc-letter` classes

### Bridge Communication
- **JS -> Python**: `bridgeAction('card.flip')`, `bridgeAction('card.rate', {ease})`, `bridgeAction('card.evaluate', {question, userAnswer, correctAnswer})`, `bridgeAction('card.mc.generate', {question, correctAnswer, cardId})`
- **Python -> JS**: `_send_to_frontend('reviewer.evaluationResult', {score, feedback})`, `_send_to_frontend('reviewer.mcOptions', [{text, correct, explanation}])`, `_send_to_frontend('reviewer.aiStep', {phase, label})`
- **Events**: `App.jsx` forwards `reviewer.*` payloads as `window.dispatchEvent(new CustomEvent(...))`

## Card HTML Problem in Detail

`card.answer()` returns EVERYTHING:
```html
<style>.card { ... }</style>
<div class="tags">#Ankiphil_Vorklinik...</div>
<div>Errata</div>
<div>Kleinzehenloge</div>
<div>Where does M. abductor digiti minimi pedis originate?</div>
<script>// BUTTON SHORTCUTS var tags = '84' ...</script>
<hr id="answer">
<div>Calcaneus (Proc. lateralis ...)</div>
```

The current `_clean_card_html` only strips `<script>` tags and `// BUTTON SHORTCUTS`. It must also strip:
- `<style>` tags
- Everything before `<hr id=answer>` (for backHtml — partially done but not always effective)
- Div elements with tag metadata (lines prefixed with `#`)
- "Errata" labels and other template artifacts

Better approach: Read note fields directly (`card.note().fields[0]` / `fields[1]`) instead of using `card.question()` / `card.answer()` which render the full template.

## MC Options — Correct Implementation

Do NOT use `MultipleChoiceCard.tsx` or `QuizCard.tsx`. These are bloated.

MC options should use the `.ds-mc-option` CSS classes from `design-system.css`:
```jsx
<button className={`ds-mc-option ${isCorrect ? 'correct' : ''} ${isWrong ? 'wrong' : ''}`}>
  <span className="mc-letter">{letter}</span>
  <span>{text}</span>
</button>
```

Alternatively, build a new minimal React wrapper that uses these classes.

## Timer Logic (from interactions.js)

```javascript
// Timer starts when ANSWER state begins (card flipped)
// Timer STOPS immediately — it measures only the time FROM question start TO flip
// The displayed value is FROZEN after the flip
function getTimeThresholds() {
  const chars = questionCharCount;
  const bonus = Math.floor(chars / 50);
  const goodThreshold = Math.min(6 + bonus, 20);     // 6-20s
  const hardThreshold = Math.min(15 + bonus * 2, 45); // 15-45s
}
// elapsed <= goodThreshold -> Good (3)
// elapsed <= hardThreshold -> Hard (2)
// else -> Again (1)
// Click on timer cycles: 1->2->3->4->1
```

IMPORTANT: The timer measures time from QUESTION start to FLIP. In ANSWER state, the frozen time and rating are displayed. The timer does NOT keep running.

## Keyboard Shortcuts

```
SPACE       -> Flip (QUESTION) / Rate+Next (ANSWER/EVALUATED/MC_RESULT)
ENTER       -> Generate MC (QUESTION, empty) / Evaluate (QUESTION, with text) / Follow Up (rateable, with text)
1-4         -> Set rating manually (ANSWER/EVALUATED/MC_RESULT)
A-D/a-d     -> Select MC option (MC_ACTIVE) [TODO]
ESC         -> Close chat (when open)
```

## Safety Tags
- `pre-reviewer-migration` — before the first attempt
- `pre-unified-app` — before stage 2

## Rules
1. **Reuse ChatInput** — do not rebuild it
2. **All colors via `var(--ds-*)` tokens** — NEVER hardcoded hex
3. **Incremental** — one feature at a time, test each before continuing
4. **`custom_reviewer/interactions.js` is THE reference** — consult it when in doubt
5. **MC options: `.ds-mc-option` CSS classes** — not the old React components
