# MC Card Integration Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current MC dock integration with card-embedded options, a 3-attempt degrading star-based scoring system, and W3/C3 visual feedback.

**Architecture:** All changes are in `custom_reviewer/interactions.js` and `custom_reviewer/template.html`. No backend changes. The dock shows stars (no labels) during MC_ACTIVE; on resolve, stars colorize and a label appears. Options live on the card in `#mc-card-area`.

**Tech Stack:** Vanilla JS, inline CSS, DaisyUI Tailwind classes (minimal), Anki `pycmd()` for rating submission.

**Spec:** `docs/superpowers/specs/2026-03-17-mc-card-redesign.md`

**Testing:** No automated test harness — each task ends with a manual test step. Restart Anki after changes to `interactions.js` or `template.html` (the addon hot-caches these files, so a full restart is needed).

---

## Chunk 1: Template & Star Infrastructure

### Task 1: Update template.html — mc-stars-row + mc-card-area separator

**Files:**
- Modify: `custom_reviewer/template.html`

**What:** Replace the `#mc-shortcuts` div inside `#dc-mc` with a `#mc-stars-row` container. Add `border-top` separator to `#mc-card-area`.

- [ ] **Step 1: Read current dc-mc section in template.html**

Open `custom_reviewer/template.html`, find the `#dc-mc` section (around line 233):
```html
<div id="dc-mc" class="dock-section">
    <div id="mc-shortcuts" class="flex items-center justify-center gap-2 px-4 py-2.5 font-mono"></div>
</div>
```

- [ ] **Step 2: Replace #mc-shortcuts with #mc-stars-row**

Replace the entire `#dc-mc` section content:

```html
<div id="dc-mc" class="dock-section">
    <div id="mc-stars-row" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:12px 16px;"></div>
</div>
```

- [ ] **Step 3: Add border-top to #mc-card-area**

Find in template.html:
```html
<div id="mc-card-area" class="hidden px-4 py-4 flex flex-col gap-2"></div>
```

Replace with:
```html
<div id="mc-card-area" class="hidden flex flex-col gap-2" style="border-top:1px solid rgba(255,255,255,0.05);padding:16px 16px 0 16px;"></div>
```

- [ ] **Step 4: Commit**

```bash
git add "custom_reviewer/template.html"
git commit -m "feat(mc): replace mc-shortcuts with mc-stars-row, add card separator"
```

---

### Task 2: Add star builder functions to interactions.js

**Files:**
- Modify: `custom_reviewer/interactions.js`

**What:** Add `buildStars()`, `degradeStar()`, `updateStarsRevealed()` — the three functions that manage the star lifecycle.

- [ ] **Step 1: Add star functions after the `finishMC` function (around line 576)**

Insert after the closing brace of `finishMC`:

```js
// ═══ MC Stars ═══

function buildStars() {
    const row = document.getElementById('mc-stars-row');
    if (!row) return;
    row.innerHTML = '';
    for (let i = 0; i < 3; i++) {
        const s = document.createElement('span');
        s.className = 'mc-star';
        s.textContent = '★';
        s.style.cssText = 'font-size:22px;line-height:1;color:rgba(255,255,255,0.85);transition:color 0.2s;';
        row.appendChild(s);
    }
}

function degradeStar() {
    // Called AFTER mcWrongPicks.push() so length already reflects new pick
    const stars = document.querySelectorAll('#mc-stars-row .mc-star');
    const idx = mcWrongPicks.length - 1;
    if (stars[idx]) {
        stars[idx].style.color = 'rgba(255,255,255,0.12)';
        stars[idx].dataset.dimmed = 'true';
    }
}

function updateStarsRevealed(ease) {
    const colorMap = { 3: 'rgb(48,209,88)', 2: 'rgb(255,159,10)', 1: 'rgb(255,69,58)' };
    const labelMap = { 3: 'Gut', 2: 'Schwierig', 1: 'Wiederholen' };
    const color = colorMap[ease];

    const row = document.getElementById('mc-stars-row');
    if (!row) return;

    // Color non-dimmed stars
    row.querySelectorAll('.mc-star').forEach(s => {
        if (s.dataset.dimmed !== 'true') s.style.color = color;
    });

    // Append arrow + label
    row.insertAdjacentHTML('beforeend',
        `<span style="font-size:13px;color:rgba(255,255,255,0.3);margin:0 4px;">→</span>`
        + `<span style="font-size:14px;font-weight:600;color:${color};">${labelMap[ease]}</span>`
    );

    // Move row to eval-result
    const evalResult = document.getElementById('eval-result');
    if (evalResult) {
        evalResult.innerHTML = '';
        evalResult.appendChild(row);
    }

    // Dock border tint
    const dockInner = document.querySelector('#unified-dock > div');
    if (dockInner) {
        const borderMap = { 3: 'rgba(48,209,88,0.2)', 2: 'rgba(255,159,10,0.2)', 1: 'rgba(255,69,58,0.2)' };
        dockInner.style.borderColor = borderMap[ease];
    }
}
```

- [ ] **Step 2: Verify no syntax errors**

Open browser dev tools on the reviewer page (or check Anki console after reload). No errors expected at this stage since the functions are defined but not yet called.

- [ ] **Step 3: Commit**

```bash
git add "custom_reviewer/interactions.js"
git commit -m "feat(mc): add buildStars, degradeStar, updateStarsRevealed functions"
```

---

## Chunk 2: MC Option Rendering

### Task 3: Rewrite onMCOptions() with new DOM structure

**Files:**
- Modify: `custom_reviewer/interactions.js`

**What:** Replace the current option HTML (Tailwind classes, 32px badge, no mc-icon, no data-wrong) with the spec's structure (inline styles, 24px badge, mc-icon span, data-wrong attribute, 9px border-radius).

- [ ] **Step 1: Replace the onMCOptions function (lines 453–484)**

Find:
```js
window.onMCOptions = function(options) {
```

Replace the entire function:

```js
window.onMCOptions = function(options) {
    if (!Array.isArray(options) || options.length === 0) {
        showAnswer();
        return;
    }

    mcAttempts = 0;
    mcOptions = options;
    mcWrongPicks = [];
    mcCorrectIndex = options.findIndex(o => o.correct);
    aiSteps = [];

    const area = document.getElementById('mc-card-area');
    if (area) {
        area.classList.remove('hidden');
        area.innerHTML = options.map((opt, i) => `
            <button class="mc-opt" data-index="${i}" data-wrong="false"
                    onclick="selectMCOption(${i})"
                    style="display:flex;flex-direction:column;width:100%;border-radius:9px;border:1px solid rgba(255,255,255,0.07);background:none;padding:0;cursor:pointer;text-align:left;">
                <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;">
                    <div class="mc-badge" style="width:24px;height:24px;border-radius:50%;border:1px solid rgba(255,255,255,0.13);display:flex;align-items:center;justify-content:center;font-size:10px;color:rgba(255,255,255,0.38);flex-shrink:0;">${String.fromCharCode(65 + i)}</div>
                    <span class="mc-text" style="font-size:15px;color:rgba(255,255,255,0.75);flex:1;">${opt.text}</span>
                    <span class="mc-icon" style="font-size:14px;font-weight:700;margin-left:auto;display:none;"></span>
                </div>
                <div class="mc-exp" style="display:none;background:rgba(0,0,0,0.25);padding:8px 12px 10px 46px;font-size:11.5px;color:rgba(255,255,255,0.45);line-height:1.5;"></div>
            </button>
        `).join('');
    }

    setState(S.MC_ACTIVE); // called AFTER mcOptions is populated
};
```

- [ ] **Step 2: Remove showExplanation() helper function (lines 486–497)**

The `showExplanation()` helper is no longer needed — explanation display is now inline in `selectMCOption`. Delete the entire function:

```js
function showExplanation(index) {
    // DELETE THIS ENTIRE FUNCTION
}
```

- [ ] **Step 3: Manual test — MC generates and renders**

In Anki reviewer, press Enter on a card to trigger MC generation. Verify:
- Options appear on the card with the new styling (smaller badges, no Tailwind classes visible)
- Options are clickable
- No JS errors in console

- [ ] **Step 4: Commit**

```bash
git add "custom_reviewer/interactions.js"
git commit -m "feat(mc): rewrite onMCOptions with spec-compliant DOM structure"
```

---

### Task 4: Update setState(MC_ACTIVE) to build stars and set new action buttons

**Files:**
- Modify: `custom_reviewer/interactions.js`

**What:** The `MC_ACTIVE` case in `setState()` currently renders shortcut hints into `#mc-shortcuts`. Replace with `buildStars()` call and new action buttons.

- [ ] **Step 1: Replace MC_ACTIVE case in setState (lines 138–152)**

Find:
```js
case S.MC_ACTIVE: {
    showSection('dc-mc');
    const scEl = $('#mc-shortcuts');
    if (scEl) {
        const count = mcOptions.length > 0 ? mcOptions.length : 4;
        scEl.innerHTML = Array.from({length: count}, (_, i) =>
            `<span style="display:inline-flex;align-items:center;gap:4px;"><span style="font-size:10px;color:rgba(255,255,255,0.2);">${i+1}</span><span style="font-size:11px;color:rgba(255,255,255,0.4);">${String.fromCharCode(65+i)}</span></span>`
        ).join(`<span style="color:rgba(255,255,255,0.1);font-size:10px;">·</span>`);
    }
    setActions(
        { label: 'Überspringen', shortcut: 'SPACE', onclick: 'skipMC()' },
        { label: 'Text-Modus', shortcut: '↵', onclick: 'cancelMC()' }
    );
    break;
}
```

Replace with:
```js
case S.MC_ACTIVE:
    showSection('dc-mc');
    buildStars();
    setActions(
        { label: 'Auflösen', shortcut: 'SPACE', onclick: 'revealAnswer()' },
        { label: 'Auflösen & Nachfragen', shortcut: '↵', onclick: 'revealAndChat()' }
    );
    break;
```

- [ ] **Step 2: Manual test — stars appear in dock**

Trigger MC mode. Verify:
- 3 white stars appear in the dock (no shortcut labels 1A·2B·3C·4D)
- Action row shows "Auflösen [SPACE]" and "Auflösen & Nachfragen [↵]"

- [ ] **Step 3: Commit**

```bash
git add "custom_reviewer/interactions.js"
git commit -m "feat(mc): setState MC_ACTIVE builds stars and shows new action buttons"
```

---

## Chunk 3: Selection Logic

### Task 5: Rewrite selectMCOption() AND finishMC() — atomically

**Files:**
- Modify: `custom_reviewer/interactions.js`

**What:** These two functions must be rewritten in the same commit. `selectMCOption()` no longer sets `autoRateEase` before calling `finishMC()` — it now relies on `finishMC()` to set it internally. Committing only one without the other breaks the correct-answer path (ease=0). Do all steps in this task before committing.

Rewrite of `selectMCOption()`: guard before increment, re-click protection via `data-wrong`, strikethrough on wrong text, mc-icon inside flex row, `degradeStar()` call, 3-attempt threshold, C3/W3 inline styles.

Rewrite of `finishMC()`: sets `autoRateEase` centrally based on `mcAttempts` and `wasCorrect`, calls `updateStarsRevealed()`, transitions to MC_RESULT. Old text summary removed.

- [ ] **Step 1: Replace selectMCOption (lines 499–543)**

Find:
```js
window.selectMCOption = function(index) {
```

Replace the entire function:

```js
window.selectMCOption = function(index) {
    if (current !== S.MC_ACTIVE) return;
    if (index < 0 || index >= mcOptions.length) return;

    const btn = document.querySelector(`#mc-card-area .mc-opt[data-index="${index}"]`);
    if (!btn) return;

    // Re-click guard — do not re-process an already-wrong option
    if (btn.dataset.wrong === 'true') return;

    mcAttempts++;

    const badge = btn.querySelector('.mc-badge');
    const text = btn.querySelector('.mc-text');
    const icon = btn.querySelector('.mc-icon');
    const exp = btn.querySelector('.mc-exp');

    if (index === mcCorrectIndex) {
        // ── Correct (C3) ──
        btn.style.border = '1px solid rgba(48,209,88,0.45)';
        btn.style.background = 'rgba(48,209,88,0.12)';
        if (badge) { badge.style.background = 'rgba(48,209,88,0.25)'; badge.style.border = '1px solid rgba(48,209,88,0.65)'; badge.style.color = 'rgb(48,209,88)'; }
        if (icon) { icon.textContent = '✓'; icon.style.color = 'rgb(48,209,88)'; icon.style.display = 'block'; }
        if (exp && mcOptions[index].explanation) { exp.textContent = mcOptions[index].explanation; exp.style.display = 'block'; }
        lockAllOptions();
        finishMC(true);
    } else {
        // ── Wrong (W3) ──
        btn.style.border = '1px solid rgba(255,69,58,0.4)';
        btn.style.background = 'rgba(255,69,58,0.12)';
        if (badge) { badge.style.background = 'rgba(255,69,58,0.25)'; badge.style.border = '1px solid rgba(255,69,58,0.6)'; badge.style.color = 'rgb(255,80,65)'; }
        if (text) { text.style.textDecoration = 'line-through'; text.style.textDecorationColor = 'rgba(255,69,58,0.4)'; }
        if (icon) { icon.textContent = '✗'; icon.style.color = 'rgb(255,69,58)'; icon.style.display = 'block'; }
        if (exp && mcOptions[index].explanation) { exp.textContent = mcOptions[index].explanation; exp.style.display = 'block'; }
        btn.dataset.wrong = 'true';
        mcWrongPicks.push(index);
        degradeStar();

        if (mcWrongPicks.length >= 3) {
            revealAnswer(); // auto-reveal after 3 wrong attempts
        }
    }
};
```

- [ ] **Step 2: Add lockAllOptions() helper**

Add this small helper just before `selectMCOption` (or after the star functions — keep it close):

```js
function lockAllOptions() {
    const all = document.querySelectorAll('#mc-card-area .mc-opt');
    all.forEach(btn => { btn.disabled = true; btn.style.cursor = 'default'; });
}
```

- [ ] **Step 3: Manual test — wrong answer**

Select a wrong option. Verify:
- Red background, strikethrough text, ✗ icon inside the row (right-aligned)
- Explanation appears below text inside the same button box
- One star dims in the dock
- Other options remain clickable

- [ ] **Step 4: Manual test — correct on 1st try**

Select correct option immediately. Verify:
- Green background, ✓ icon, explanation shows
- All options disabled
- State transitions to MC_RESULT (stars go green + "→ Gut")

- [ ] **Step 5: Replace finishMC function (lines 545–576) in the same edit session**

Find:
```js
function finishMC(wasCorrect) {
```

Replace entire function:

```js
function finishMC(wasCorrect) {
    // Set autoRateEase centrally — callers must NOT set it before calling here
    autoRateEase = wasCorrect
        ? (mcAttempts === 1 ? 3 : mcAttempts === 2 ? 2 : 1)
        : 1;

    updateStarsRevealed(autoRateEase);
    setState(S.MC_RESULT);
}
```

- [ ] **Step 6: Commit both rewrites together**

```bash
git add "custom_reviewer/interactions.js"
git commit -m "feat(mc): rewrite selectMCOption (3-attempt, W3/C3, stars) + finishMC (central ease)"
```

---

### Task 7: Add revealAnswer() and revealAndChat()

**Files:**
- Modify: `custom_reviewer/interactions.js`

**What:** `revealAnswer()` applies C3 to the correct option, dims all others, locks all, then calls `finishMC(false)`. `revealAndChat()` calls `revealAnswer()` then `openFollowUp()`.

- [ ] **Step 1: Add revealAnswer() and revealAndChat() after finishMC**

Insert after the closing brace of `finishMC`:

```js
function revealAnswer() {
    if (current !== S.MC_ACTIVE) return;

    // Apply C3 to correct option
    const correct = document.querySelector(`#mc-card-area .mc-opt[data-index="${mcCorrectIndex}"]`);
    if (correct) {
        correct.style.border = '1px solid rgba(48,209,88,0.45)';
        correct.style.background = 'rgba(48,209,88,0.12)';
        const badge = correct.querySelector('.mc-badge');
        if (badge) { badge.style.background = 'rgba(48,209,88,0.25)'; badge.style.border = '1px solid rgba(48,209,88,0.65)'; badge.style.color = 'rgb(48,209,88)'; }
        const icon = correct.querySelector('.mc-icon');
        if (icon) { icon.textContent = '✓'; icon.style.color = 'rgb(48,209,88)'; icon.style.display = 'block'; }
        const exp = correct.querySelector('.mc-exp');
        if (exp && mcOptions[mcCorrectIndex] && mcOptions[mcCorrectIndex].explanation) {
            exp.textContent = mcOptions[mcCorrectIndex].explanation;
            exp.style.display = 'block';
        }
    }

    // Dim unchosen options (not already styled wrong or correct)
    document.querySelectorAll('#mc-card-area .mc-opt').forEach(btn => {
        const idx = parseInt(btn.dataset.index, 10);
        if (idx === mcCorrectIndex) return; // already styled green
        if (btn.dataset.wrong === 'true') {
            btn.style.opacity = '0.75'; // keep W3 style visible but slightly faded
        } else {
            btn.style.opacity = '0.35'; // never-selected options
        }
    });

    lockAllOptions();
    finishMC(false); // wasCorrect=false → autoRateEase=1 (Wiederholen)
}
window.revealAnswer = revealAnswer;

function revealAndChat() {
    revealAnswer();    // sets state to MC_RESULT
    openFollowUp();    // opens chat with MC context (state is now MC_RESULT)
}
window.revealAndChat = revealAndChat;
```

- [ ] **Step 2: Manual test — SPACE reveals**

In MC_ACTIVE with no prior wrong picks, press SPACE. Verify:
- Correct option shown in green with explanation
- All other options at 0.35 opacity (none were previously wrong)
- All 3 stars turn **red** (ease=1, Wiederholen — no stars were dimmed so all colorize red)
- "→ Wiederholen" label appears after the stars
- Dock border turns red

- [ ] **Step 3: Manual test — ENTER reveal + chat**

In MC_ACTIVE, press ENTER. Verify:
- Same visual reveal as SPACE
- Chat panel opens automatically

- [ ] **Step 4: Commit**

```bash
git add "custom_reviewer/interactions.js"
git commit -m "feat(mc): add revealAnswer and revealAndChat functions"
```

---

## Chunk 5: Keyboard & Cleanup

### Task 8: Update keyboard handler — remove cancelMC/skipMC, add letter keys, fix SPACE/ENTER

**Files:**
- Modify: `custom_reviewer/interactions.js`

**What:** In MC_ACTIVE: SPACE → `revealAnswer()`, ENTER → `revealAndChat()`. Add `a`–`d` letter key bindings. Remove `cancelMC()` and `skipMC()` functions.

- [ ] **Step 1: Update Space handler in onKeydown**

Find in the `handlers` object:
```js
'Space': () => {
    if (current === S.QUESTION) showAnswer();
    else if (current === S.MC_ACTIVE) skipMC();
    else if (current === S.ANSWER) rateCard(autoRateEase || 3);
    else if (current === S.EVALUATED || current === S.MC_RESULT) proceedAfterEval();
},
```

Replace with:
```js
'Space': () => {
    if (current === S.QUESTION) showAnswer();
    else if (current === S.MC_ACTIVE) revealAnswer();
    else if (current === S.ANSWER) rateCard(autoRateEase || 3);
    else if (current === S.EVALUATED || current === S.MC_RESULT) proceedAfterEval();
},
```

- [ ] **Step 2: Update Enter handler in onKeydown**

Find:
```js
'Enter': () => {
    if (current === S.QUESTION) startMCMode();
    else if (current === S.MC_ACTIVE) cancelMC();
    else if (current === S.ANSWER || current === S.EVALUATED || current === S.MC_RESULT) openFollowUp();
},
```

Replace with:
```js
'Enter': () => {
    if (current === S.QUESTION) startMCMode();
    else if (current === S.MC_ACTIVE) revealAndChat();
    else if (current === S.ANSWER || current === S.EVALUATED || current === S.MC_RESULT) openFollowUp();
},
```

- [ ] **Step 3: Add letter key bindings (a–d) after the numeric handlers**

After the `'5'` handler line:
```js
'5': () => current === S.MC_ACTIVE && selectMCOption(4),
```

Add:
```js
'a': () => current === S.MC_ACTIVE && selectMCOption(0),
'b': () => current === S.MC_ACTIVE && selectMCOption(1),
'c': () => current === S.MC_ACTIVE && selectMCOption(2),
'd': () => current === S.MC_ACTIVE && selectMCOption(3),
'A': () => current === S.MC_ACTIVE && selectMCOption(0),
'B': () => current === S.MC_ACTIVE && selectMCOption(1),
'C': () => current === S.MC_ACTIVE && selectMCOption(2),
'D': () => current === S.MC_ACTIVE && selectMCOption(3),
```

- [ ] **Step 4: Delete skipMC() and cancelMC() functions**

Remove the entire `window.skipMC` function (lines ~377–390):
```js
window.skipMC = function() {
    // DELETE ENTIRE FUNCTION
};
```

Remove the entire `window.cancelMC` function (lines ~392–400):
```js
window.cancelMC = function() {
    // DELETE ENTIRE FUNCTION
};
```

- [ ] **Step 5: Manual test — full MC flow**

Run through all scenarios:
1. Select correct on 1st try → all 3 stars green → "→ Gut" → SPACE advances
2. Select wrong, then correct → 1 star dims → 2 orange stars → "→ Schwierig" → SPACE advances
3. Select wrong twice, then correct → 2 stars dim → 1 red star → "→ Wiederholen" → SPACE advances
4. Select wrong 3× → auto-reveal → all stars dim → "→ Wiederholen" → SPACE advances
5. Press SPACE during MC → reveal → Wiederholen stars
6. Press ENTER during MC → reveal + chat opens
7. Press 'a' key → selects first option
8. Press 'A' key → selects first option (re-click guard fires if already wrong)

- [ ] **Step 6: Commit**

```bash
git add "custom_reviewer/interactions.js"
git commit -m "feat(mc): update keyboard handler, add a-d keys, remove skipMC/cancelMC"
```

---

## Chunk 6: Dock Border Reset

### Task 9: Reset dock border tint on new card

**Files:**
- Modify: `custom_reviewer/interactions.js`

**What:** After `updateStarsRevealed()` tints the dock border, the next card should start with the default border. The `init()` function runs on each card load — add a border reset there.

- [ ] **Step 1: Add border reset in setState(QUESTION) case**

In the `setState` switch, find the `S.QUESTION` case:
```js
case S.QUESTION:
    showSection('dc-input');
    setActions(
```

Add one line before `showSection`:
```js
case S.QUESTION:
    // Reset dock border tint from previous MC result
    const dockInner = document.querySelector('#unified-dock > div');
    if (dockInner) dockInner.style.borderColor = '';
    showSection('dc-input');
    setActions(
```

Note: `const` inside a case requires a block — wrap the case:
```js
case S.QUESTION: {
    // Reset dock border tint from previous MC result
    const dockInner = document.querySelector('#unified-dock > div');
    if (dockInner) dockInner.style.borderColor = '';
    showSection('dc-input');
    setActions(
        { label: 'Show Answer', shortcut: 'SPACE', onclick: 'showAnswer()', color: 'rgba(255,255,255,0.88)', weight: '600' },
        { label: 'Multiple Choice', shortcut: '↵', onclick: 'startMCMode()' }
    );
    break;
}
```

- [ ] **Step 2: Manual test — border resets between cards**

Complete an MC question (so dock gets a colored border), then advance to the next card. Verify the dock border returns to the default `rgba(255,255,255,0.08)` (or effectively invisible since we clear the inline style, letting CSS take over).

- [ ] **Step 3: Commit**

```bash
git add "custom_reviewer/interactions.js"
git commit -m "fix(mc): reset dock border tint on QUESTION state"
```

---

## Verification Checklist

After all tasks:

- [ ] MC options appear on card (not in dock), separated by subtle border-top
- [ ] Wrong answer: red bg, strikethrough, ✗ icon in row, explanation inside box
- [ ] Correct answer: green bg, ✓ icon, explanation inside box
- [ ] 3 attempts before auto-reveal (not 2)
- [ ] Scoring: Gut (1st), Schwierig (2nd), Wiederholen (3rd/reveal)
- [ ] Stars degrade left-to-right per wrong pick
- [ ] After resolve: remaining stars colorize + "→ Label" appears
- [ ] Dock border tints to match achieved rating
- [ ] SPACE = Auflösen, ENTER = Auflösen & Nachfragen (during MC)
- [ ] SPACE = Weiter, ENTER = Nachfragen (after resolve)
- [ ] Letter keys a/b/c/d select options
- [ ] No double-rating on SPACE after MC
- [ ] Dock border resets on next card
