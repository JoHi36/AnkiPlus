# Custom Reviewer → React Migration

## Goal
Replace the custom reviewer (HTML/CSS/JS injected into mw.web) with a React component (`ReviewerView`) inside App.jsx. Same UI, same functionality, just React.

## Architecture Change

```
BEFORE:
  mw.web (custom reviewer HTML — VISIBLE)     + Sidebar (React App — 450px right)
  pycmd() communication between them

AFTER:
  MainViewWidget FULLSCREEN
    App.jsx renders:
      ├── ReviewerView (LEFT, flex-1)     — card content + dock
      └── SessionChat (RIGHT, 450px)      — existing chat
  mw.web HIDDEN (Anki uses it internally for scheduling)
```

Key change: `show_for_state('review')` now shows FULLSCREEN (not sidebar). React handles the left/right split layout.

## ReviewerView Component

### State Machine
```
useState: reviewState = 'question' | 'answer' | 'evaluating' | 'evaluated' | 'mc_loading' | 'mc_active' | 'mc_result'
```

### Props (from App.jsx)
```javascript
<ReviewerView
  cardData={cardData}         // {cardId, frontHtml, backHtml, deckName, fields, tags, stats}
  isAnswerShown={isAnswerShown}
  mcOptions={mcOptions}       // [{text, correct, explanation}, ...]
  evaluationResult={evalResult} // {score, feedback, missing}
  onFlip={() => bridgeAction('card.flip')}
  onRate={(ease) => bridgeAction('card.rate', {ease})}
  onRequestMC={(data) => bridgeAction('card.requestMC', data)}
  onSubmitAnswer={(data) => bridgeAction('card.submitAnswer', data)}
  onAdvance={() => bridgeAction('card.rate', {ease: 3})}
/>
```

### Card HTML Rendering
Card templates come from Anki's own internal card renderer — this is trusted internal data (the user's own card templates), not external web content. Rendered via scoped container with Anki's card CSS applied.

Card images need absolute paths: `src="filename.jpg"` → `src="file:///path/to/collection.media/filename.jpg"`. Python rewrites before sending.

### Dock (Bottom Controls)
The dock morphs between states — same as current custom reviewer:
- QUESTION: [Show Answer SPACE] [Multiple Choice ENTER]
- ANSWER: [Weiter SPACE] [Nachfragen ENTER] + timer/rating display
- MC_LOADING: ThoughtStream mini-steps
- MC_ACTIVE: 4 option buttons (A/B/C/D) + stars
- MC_RESULT: Stars + rating + [Weiter SPACE]
- EVALUATING: ThoughtStream mini-steps
- EVALUATED: Score bar + feedback + [Weiter SPACE]
- TEXT input: Textarea + send button

### Keyboard Shortcuts
Handled by React useEffect on ReviewerView (not GlobalShortcutFilter):
- SPACE: flip / rate+advance / advance
- ENTER: start MC / submit text / open chat
- 1-4: rate with specific ease
- A-D / 1-4 in MC: select option

## Python Changes

### ChatbotWidget — new message handlers
```python
'card.flip':        self._msg_flip_card,
'card.rate':        self._msg_rate_card,
'card.requestMC':   self._msg_request_mc,
'card.submitAnswer': self._msg_submit_answer,
```

### card.flip handler
Swallow web.eval, call rev._showAnswer(), send back HTML:
```python
def _msg_flip_card(self, data):
    rev = mw.reviewer
    web = rev.web
    _orig = web.eval
    web.eval = lambda js: None
    try:
        rev._showAnswer()
    finally:
        web.eval = _orig
    if rev.card:
        self._send_card_data(rev.card, is_question=False)
```

### card.rate handler
Swallow web.eval, call rev._answerCard(ease), send next card:
```python
def _msg_rate_card(self, data):
    ease = int(data.get('ease', 2))
    rev = mw.reviewer
    web = rev.web
    _orig = web.eval
    web.eval = lambda js: None
    try:
        rev._answerCard(ease)
    finally:
        web.eval = _orig
    if rev.card:
        self._send_card_data(rev.card, is_question=True)
```

### _send_card_data helper
```python
def _send_card_data(self, card, is_question=True):
    import re
    note = card.note()
    front_html = card.question()
    back_html = card.answer()
    # Rewrite image paths to absolute
    media_dir = mw.col.media.dir()
    front_html = re.sub(r'src="([^":/]+)"', f'src="file://{media_dir}/\\1"', front_html)
    back_html = re.sub(r'src="([^":/]+)"', f'src="file://{media_dir}/\\1"', back_html)

    self._send_to_frontend("card.shown" if is_question else "card.answerShown", {
        "cardId": card.id,
        "frontHtml": front_html,
        "backHtml": back_html,
        "deckId": card.did,
        "deckName": mw.col.decks.name(card.did),
        "isQuestion": is_question,
        "stats": {"reps": card.reps, "lapses": card.lapses, "ivl": card.ivl, "ease": card.factor},
    })
```

### MC + Text Eval
Reuse existing AI logic from custom_reviewer/__init__.py:
- `_generate_mc_async` → sends result via `card.mcGenerated` ankiReceive
- `_evaluate_answer_async` → sends result via `card.evaluated` ankiReceive

### show_for_state('review') — NOW FULLSCREEN
```python
if state == 'review':
    self._current_mode = 'fullscreen'  # NOT sidebar anymore!
    self._squeeze_main_content(False)
    self._show()
    self._send_to_react({"type": "app.stateChanged", "state": "review", "data": {}})
```

### Reviewer hooks
`reviewer_did_show_question` → call `_send_card_data(card, True)` on ChatbotWidget
`reviewer_did_show_answer` → call `_send_card_data(card, False)` on ChatbotWidget

### Disable custom reviewer injection
In `__init__.py`, do NOT call `custom_reviewer.enable()`. The custom reviewer HTML injection is no longer needed.

## App.jsx Changes

### Review layout (activeView === 'review')
```jsx
if (activeView === 'review') {
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex' }}>
      {/* Left: Card reviewer */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <TopBar ... />
        <ReviewerView
          cardData={cardData}
          reviewState={reviewState}
          ...
        />
      </div>
      {/* Right: Session chat sidebar */}
      <div style={{ width: 450, borderLeft: '1px solid var(--ds-border-subtle)' }}>
        {/* Existing session chat content (ContextSurface, messages, ChatInput) */}
      </div>
    </div>
  );
}
```

### ankiReceive additions
```javascript
case 'card.shown':     setCardData(payload.data); setReviewState('question'); break;
case 'card.answerShown': setCardData(prev => ({...prev, backHtml: payload.data.backHtml})); setReviewState('answer'); break;
case 'card.mcGenerated': setMcOptions(payload.data); setReviewState('mc_active'); break;
case 'card.evaluated':   setEvalResult(payload.data); setReviewState('evaluated'); break;
```

## Files

| File | Action |
|------|--------|
| `frontend/src/components/ReviewerView.jsx` | CREATE — card display + dock + state machine |
| `frontend/src/App.jsx` | MODIFY — review layout, ankiReceive handlers, card state |
| `ui/widget.py` | MODIFY — add card.flip/rate/requestMC/submitAnswer handlers, _send_card_data |
| `ui/main_view.py` | MODIFY — review state = fullscreen (not sidebar) |
| `__init__.py` | MODIFY — disable custom_reviewer.enable(), wire reviewer hooks to ChatbotWidget |

## DO NOT DELETE
- `custom_reviewer/` folder — keep as reference/fallback. Just don't enable it.
- `bridge.py`, `useAnki.js` — untouched

## Testing
1. Card shows front HTML correctly
2. SPACE flips card, back HTML shows
3. Rating buttons work (1-4), next card loads
4. MC mode: ENTER generates options, click selects, stars work
5. TEXT mode: type answer, AI evaluates, score shows
6. Keyboard shortcuts work
7. Session chat sidebar shows alongside reviewer
8. Card images render (absolute paths)
9. State transitions smooth (no ruckeln — everything in one window!)
