# ReviewerView — Core Concept

## Architecture

The React app (QWebEngineView) sits over the ENTIRE Anki window via `MainViewWidget`. No native Anki UI is visible. The React app IS the entire UI — fullscreen, not a sidebar.

`MainViewWidget._position_over_main()` sets `setGeometry(0, 0, mw.width(), mw.height())` in fullscreen mode. The outer React container has an opaque background (`--ds-bg-canvas`) so that Anki's native UI does not show through underneath.

## Core Principle

**One screen, one input field, no side panel by default.**

The reviewer is the primary experience. The user works through cards — fullscreen, centered, with no chat sidebar open. The sidebar opens ONLY on demand as a "follow-up" mode.

## Layout

```
+----------------------------------------------------------+
|                                                          |
|              CARD AREA (centered)                        |
|              Card HTML (Front OR Back)                   |
|              + MC options (when in MC state)             |
|                                                          |
|                                                          |
|                                                          |
|                                                          |
|          +------------------------------+                |
|          |  DOCK (centered, 520px max)  |                |
|          |  topSlot: Rating/Stars/Score |                |
|          |  [Primary SPACE | Secondary ENTER]|           |
|          +------------------------------+                |
|                                                          |
+----------------------------------------------------------+
```

There is always exactly ONE input field per screen. The dock is that input field.

## The Three Answer Types

### 1. Show Answer (SPACE)

Standard Anki functionality. The card flips directly.

- **Rating**: Automatic, based on the timer (time from question display to flip) relative to card length
- **Timer thresholds**: `goodThreshold = min(6 + charBonus, 20)s`, `hardThreshold = min(15 + charBonus*2, 45)s`
- **Rating**: elapsed <= good -> Good (3), elapsed <= hard -> Hard (2), else -> Again (1)
- **Timer value is FROZEN** after the flip — does not keep running
- **Click on timer cycles**: 1 -> 2 -> 3 -> 4 -> 1 (manual override)

### 2. Multiple Choice (ENTER without text)

AI generates MC options. User selects via click or A-D keys.

- **Stars**: 3 stars, -1 per wrong attempt
- **Rating**: Correct on 1st attempt -> Good, 2nd -> Hard, 3rd+ -> Again
- **After correct answer**: Card flips automatically
- **After 0 stars**: Result = Again, card flips

### 3. Free-text Answer (text + ENTER)

User types an answer; AI evaluates it against the correct answer.

- **Evaluation**: Score (0-100%), feedback, ease mapping
- **Score -> Rating**: >=90 -> Easy, >=70 -> Good, >=40 -> Hard, <40 -> Again
- **After evaluation**: Card flips automatically

## State Machine — Dock Contents

| State | topSlot (in dock) | hideInput | Primary Button | Secondary Button |
|---|---|---|---|---|
| QUESTION | — | false (textarea visible) | Show Answer `SPACE` | Multiple Choice `ENTER` |
| EVALUATING | Spinner + AI step label | true | Cancel | — |
| EVALUATED | Score bar + % + rating + feedback | true | Continue `SPACE` | Follow Up `ENTER` |
| MC_LOADING | Spinner + AI step label | true | Cancel | — |
| MC_ACTIVE | stars (centered) | true | Resolve `SPACE` | — |
| MC_RESULT | stars + label (centered) | true | Continue `SPACE` | Follow Up `ENTER` |
| ANSWER | Timer + rating (centered, clickable) | true | Continue `SPACE` | Follow Up `ENTER` |

**topSlot height**: Always the same height as the textarea (~48px min). Everything centered. No type labels left or right.

## Follow-Up Flow (Sidebar Chat)

Available in all rateable states: ANSWER, EVALUATED, MC_RESULT.

1. User presses ENTER (or clicks "Follow Up") or types text + ENTER
2. The center dock disappears (animated out)
3. The sidebar slides in from the right (animated)
4. The text field visually "travels" from the center to the right — smooth transition
5. The chat has the card context (question, answer, evaluation)
6. ESC closes the sidebar; the dock reappears

This transition must be smooth — animations for:
- Sidebar slide-in from right
- Dock fade-out
- Text field transition (center -> sidebar)

## Keyboard Shortcuts

```
SPACE       -> Flip (QUESTION) / Rate+Next (rateable states)
ENTER       -> Generate MC (QUESTION, empty) / Evaluate (QUESTION, with text) / Follow Up (rateable)
1-4         -> Set rating manually (rateable states)
A-D         -> Select MC option (MC_ACTIVE)
ESC         -> Close chat (when sidebar is open)
```

## Key Files

- `frontend/src/components/ReviewerView.jsx` — main component
- `frontend/src/App.jsx` — renders ReviewerView, forwards events, manages sidebar state
- `shared/components/ChatInput.tsx` — dock component (topSlot + hideInput + actions)
- `shared/styles/design-system.css` — `.ds-mc-option`, `.ds-review-result` classes
- `ui/widget.py` — Python handlers: `card.flip`, `card.rate`, `card.evaluate`, `card.mc.generate`
- `custom_reviewer/interactions.js` — legacy vanilla JS reference (1072 lines)

## Rules

1. **One input field per screen** — never two visible at the same time
2. **No sidebar by default** — only via Follow Up
3. **Everything centered** — no type labels, no info left/right in the dock
4. **Reuse ChatInput** — do not rebuild it
5. **All colors via `var(--ds-*)` tokens** — never hardcoded hex
6. **MC options: `.ds-mc-option` CSS classes** — not the old React components
7. **Note fields for display** — use `frontField`/`backField` instead of template-rendered HTML
