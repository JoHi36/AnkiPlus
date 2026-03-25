# MC Card Integration Redesign — Design Spec
**Date:** 2026-03-17

## Overview

Redesign the Multiple Choice (MC) integration in the custom reviewer. The current implementation places MC options in the dock and uses a simple 2-attempt system with no scoring feedback. This spec replaces it with a card-embedded option panel, a 3-attempt degrading score system displayed via stars in the dock, and clearer feedback at every stage.

---

## Design Decisions

| Topic | Decision |
|-------|----------|
| Option placement | On the card (not in dock) |
| Panel style | Dezent — no outer container, border-top separator |
| Wrong answer feedback | Strong: red bg + strikethrough + dark explanation sub-block (W3) |
| Correct answer feedback | Strong: green bg + explanation in same box (C3) |
| Scoring display | 3 stars in dock, degrade left-to-right per wrong attempt, label revealed on resolve |
| Max achievable rating | Gut (3) — Leicht (4) never awarded via MC |
| Rating submission | `pycmd('ease' + autoRateEase)` on SPACE in MC_RESULT (via `proceedAfterEval()`) |

---

## Attempt & Scoring Logic

The user has **3 attempts** total. `mcAttempts` counts every call to `selectMCOption()` where the user was not re-clicking an already-wrong option (guard fires before increment — see below).

| Event | `autoRateEase` set by `finishMC()` |
|-------|-------------------------------------|
| Correct on 1st attempt (`mcAttempts === 1`) | 3 (Gut) |
| Correct on 2nd attempt (`mcAttempts === 2`) | 2 (Schwierig) |
| Correct on 3rd attempt (`mcAttempts === 3`) | 1 (Wiederholen) |
| 3 wrong attempts → auto-reveal | 1 (Wiederholen) |
| SPACE → `revealAnswer()` | 1 (Wiederholen) |

`autoRateEase` is set **inside `finishMC(wasCorrect)`** — callers do not set it:

```js
function finishMC(wasCorrect) {
  autoRateEase = wasCorrect
    ? (mcAttempts === 1 ? 3 : mcAttempts === 2 ? 2 : 1)
    : 1;
  // … render stars, setState(S.MC_RESULT)
}
```

**Rating submission** happens via `proceedAfterEval()` when the user presses SPACE in MC_RESULT — matching the existing text-eval pattern. `finishMC()` does NOT call `pycmd()` directly.

---

## MC Card Area

### Separator

`#mc-card-area` uses `border-top: 1px solid rgba(255,255,255,0.05)` and `padding-top: 16px` (inline style or class). No sibling element needed.

### Option Row DOM Structure

Each option is a `<button class="mc-opt">` with this internal structure:

```html
<button class="mc-opt" data-index="0" data-wrong="false" style="
  display:flex; flex-direction:column; width:100%;
  border-radius:9px; border:1px solid rgba(255,255,255,0.07);
  background:none; padding:0; cursor:pointer; text-align:left;
">
  <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;">
    <div class="mc-badge" style="
      width:24px;height:24px;border-radius:50%;
      border:1px solid rgba(255,255,255,0.13);
      display:flex;align-items:center;justify-content:center;
      font-size:10px;color:rgba(255,255,255,0.38);flex-shrink:0;
    ">A</div>
    <span class="mc-text" style="font-size:15px;color:rgba(255,255,255,0.75);flex:1;">Option text</span>
    <span class="mc-icon" style="font-size:14px;font-weight:700;display:none;margin-left:auto;"></span>
  </div>
  <div class="mc-exp" style="
    display:none;
    background:rgba(0,0,0,0.25);
    padding:8px 12px 10px 46px;
    font-size:11.5px;color:rgba(255,255,255,0.45);line-height:1.5;
  "></div>
</button>
```

Gap between buttons: 5px. Hover (`:not(:disabled)`): background `rgba(255,255,255,0.05)`.

### `selectMCOption(index)` Logic

```
1. Guard: if index >= mcOptions.length → return
2. Guard: if btn.dataset.wrong === 'true' → return  (re-click protection)
3. mcAttempts++
4. If correct:
   a. Apply C3 style + explanation
   b. finishMC(true)
5. If wrong:
   a. Apply W3 style + explanation
   b. mcWrongPicks.push(index)
   c. degradeStar()   ← after push, so length is already updated
   d. btn.dataset.wrong = 'true'
   e. If mcWrongPicks.length >= 3 → revealAnswer()  (auto-reveal)
```

### Wrong Answer Style (W3)

```js
btn.style.border = '1px solid rgba(255,69,58,0.4)';
btn.style.background = 'rgba(255,69,58,0.12)';
badge.style.background = 'rgba(255,69,58,0.25)';
badge.style.border = '1px solid rgba(255,69,58,0.6)';
badge.style.color = 'rgb(255,80,65)';
text.style.textDecoration = 'line-through';
text.style.textDecorationColor = 'rgba(255,69,58,0.4)';
icon.textContent = '✗';
icon.style.color = 'rgb(255,69,58)';
icon.style.display = 'block';
exp.textContent = mcOptions[index].explanation;
exp.style.display = 'block';
```

### Correct Answer Style (C3)

```js
btn.style.border = '1px solid rgba(48,209,88,0.45)';
btn.style.background = 'rgba(48,209,88,0.12)';
badge.style.background = 'rgba(48,209,88,0.25)';
badge.style.border = '1px solid rgba(48,209,88,0.65)';
badge.style.color = 'rgb(48,209,88)';
icon.textContent = '✓';
icon.style.color = 'rgb(48,209,88)';
icon.style.display = 'block';
exp.textContent = mcOptions[index].explanation;
exp.style.display = 'block';
```

### `revealAnswer()` — sequence

```
1. Apply C3 style to the correct option (mcOptions[mcCorrectIndex])
2. Set all options disabled = true
3. Set opacity 0.35 on all options except those already styled (wrong/correct)
4. Previously-wrong options: keep W3 style, reduce to opacity 0.75
5. finishMC(false)   ← called LAST, after all visual updates
```

`finishMC(false)` triggers `setState(S.MC_RESULT)` which does NOT hide `#mc-card-area` — the card area remains visible. Only the dock section changes.

### Final Lock State

After `finishMC()`:
- Correct option: C3 (full opacity)
- Wrong-picked options: W3, `opacity: 0.75`
- All other options: `opacity: 0.35`, `disabled = true`

---

## Dock During MC

### `#dc-mc` Section Structure (replaces current `#mc-shortcuts` content)

The template's `#dc-mc` section contains a single container for stars:

```html
<div id="dc-mc" class="dock-section">
  <div id="mc-stars-row" style="
    display:flex;align-items:center;justify-content:center;gap:8px;padding:12px 16px;
  "></div>
</div>
```

`#mc-shortcuts` div is removed from the template.

On `setState(S.MC_ACTIVE)`, render stars into `#mc-stars-row`:

```js
const row = document.getElementById('mc-stars-row');
row.innerHTML = '';
for (let i = 0; i < 3; i++) {
  const s = document.createElement('span');
  s.className = 'mc-star';
  s.textContent = '★';
  s.style.cssText = 'font-size:22px;line-height:1;color:rgba(255,255,255,0.85);';
  row.appendChild(s);
}
```

### `degradeStar()` — called after `mcWrongPicks.push()`

```js
function degradeStar() {
  const stars = document.querySelectorAll('#mc-stars-row .mc-star');
  const idx = mcWrongPicks.length - 1; // leftmost undimmed star
  if (stars[idx]) {
    stars[idx].style.color = 'rgba(255,255,255,0.12)';
    stars[idx].dataset.dimmed = 'true';
  }
}
```

Uses `dataset.dimmed` so reveal detection is reliable.

### `updateStarsRevealed(ease)` — called inside `finishMC()`

Move star row into `#eval-result` and colorize + append label:

```js
function updateStarsRevealed(ease) {
  const colors = { 3: 'rgb(48,209,88)', 2: 'rgb(255,159,10)', 1: 'rgb(255,69,58)' };
  const labels = { 3: 'Gut', 2: 'Schwierig', 1: 'Wiederholen' };
  const color = colors[ease];

  const row = document.getElementById('mc-stars-row');
  // Color non-dimmed stars
  row.querySelectorAll('.mc-star').forEach(s => {
    if (s.dataset.dimmed !== 'true') s.style.color = color;
  });
  // Append arrow + label
  row.insertAdjacentHTML('beforeend',
    `<span style="font-size:13px;color:rgba(255,255,255,0.3);margin:0 4px;">→</span>
     <span style="font-size:14px;font-weight:600;color:${color};">${labels[ease]}</span>`
  );
  // Move row to eval-result
  const evalResult = document.getElementById('eval-result');
  evalResult.innerHTML = '';
  evalResult.appendChild(row);
  // Dock border tint
  const dockInner = document.querySelector('#unified-dock > div');
  const borderAlpha = { 3: 'rgba(48,209,88,0.2)', 2: 'rgba(255,159,10,0.2)', 1: 'rgba(255,69,58,0.2)' };
  dockInner.style.borderColor = borderAlpha[ease];
}
```

Call `updateStarsRevealed(autoRateEase)` inside `finishMC()` before `setState(S.MC_RESULT)`.

### Action Rows

**MC_ACTIVE** (`setActions` call in `setState(S.MC_ACTIVE)`):
```
│  Auflösen  [SPACE]  │  Auflösen & Nachfragen  [↵]  │
```

**MC_RESULT** (`setActions` call in `finishMC()` or `setState(S.MC_RESULT)`):
```
│  Weiter  [SPACE]  │  Nachfragen  [↵]  │
```

SPACE in MC_RESULT → `proceedAfterEval()` (submits `pycmd('ease' + autoRateEase)`, advances card).
ENTER in MC_RESULT → `openFollowUp()`.

---

## Keyboard Handler Changes

Replaces current MC_ACTIVE bindings. The handler checks `e.key.toLowerCase()`:

| Key(s) | MC_ACTIVE | MC_RESULT |
|--------|-----------|-----------|
| `'1'`–`'4'` | `selectMCOption(Number(key)-1)` | — |
| `'a'`–`'d'` | `selectMCOption('abcd'.indexOf(key))` | — |
| `'5'` | `selectMCOption(4)` (guard handles missing index) | — |
| `' '` (space) | `revealAnswer()` | `proceedAfterEval()` |
| `'enter'` | `revealAndChat()` | `openFollowUp()` |

- Guard in `selectMCOption`: `if (index >= mcOptions.length) return`
- MC_LOADING: all keys ignored (existing behavior, unchanged)
- `cancelMC()` and its ENTER binding in MC_ACTIVE are **removed**
- `skipMC()` and its SPACE binding in MC_ACTIVE are **replaced by `revealAnswer()`**; `skipMC()` function is removed

---

## `revealAndChat()`

```js
function revealAndChat() {
  revealAnswer();   // applies C3 style, calls finishMC(false) → sets state to MC_RESULT
  openFollowUp();   // openFollowUp reads current state (now MC_RESULT) for MC context
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `custom_reviewer/interactions.js` | `onMCOptions()`, `selectMCOption()`, `revealAnswer()` (new), `revealAndChat()` (new), `degradeStar()` (new), `updateStarsRevealed()` (new), `finishMC()`, `setState(MC_ACTIVE/MC_RESULT)`, keyboard handler; remove `cancelMC()`, remove `skipMC()` |
| `custom_reviewer/template.html` | `#dc-mc` section: remove `#mc-shortcuts`, add `#mc-stars-row`; `#mc-card-area`: add border-top separator style |
| `custom_reviewer/styles.css` | No new changes required (`.mc-opt` hover already present) |

No backend (`__init__.py`) changes required.

---

## Out of Scope

- Animated star transitions
- "Leicht" via any MC path
- Changes to MC generation, evaluation prompts, or caching
