# Card Renderer Enhancement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix unformatted card rendering in ReviewerView, add CSS Enhancement Layer, build Card Classifier with EventBus integration, and prep Interactive Cloze architecture.

**Architecture:** Three-layer CSS cascade (Reset then Enhancement then Card Original). Card Classifier runs on every `card.shown` event and emits `card.classified` on EventBus. Enhancement Layer uses low-specificity CSS defaults that card CSS automatically overrides.

**Tech Stack:** React, CSS (no Tailwind for enhancement layer — raw CSS for cascade control), JavaScript regex for classifier.

**Spec:** `docs/superpowers/specs/2026-03-24-card-renderer-enhancement-design.md`

**Security note:** Card HTML is rendered from Anki's own template engine applied to the user's own local cards. Script tags are stripped by `_clean_card_html()` on the Python side before reaching React. This is existing behavior — no new HTML injection vectors are introduced.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/utils/cardClassifier.js` | Create | Pure functions: classify card HTML into metadata object |
| `frontend/src/styles/card-enhancement.css` | Create | Enhancement Layer: typography, dark mode, spacing, cloze prep |
| `frontend/src/components/ReviewerView.jsx` | Modify | Swap frontField to frontHtml, wrap in `.card-renderer` container |
| `frontend/src/App.jsx` | Modify | Import classifier, emit `card.classified` on card.shown/answerShown |
| `frontend/src/main.jsx` | Modify | Import card-enhancement.css |
| `frontend/src/components/CardPreviewModal.jsx` | Modify | Wrap card HTML in `.card-renderer` container |
| `ui/widget.py` | Modify | Fix misleading comment (line 1943) |

---

### Task 1: Create Card Classifier

**Files:**
- Create: `frontend/src/utils/cardClassifier.js`

- [ ] **Step 1: Create cardClassifier.js with all detection functions**

Create `frontend/src/utils/cardClassifier.js` with:
- `classifyCard(frontHtml, backHtml)` — main export, returns metadata object
- `detectCardType(html)` — returns 'cloze' | 'image-occlusion' | 'type-in' | 'basic'
- `detectDeckFamily(html)` — returns 'amboss' | 'anking' | null
- `detectColorCoding(html)` — returns boolean (true if >2 non-black/white colors)
- `categorizeLength(html)` — returns 'short' | 'medium' | 'long' based on text length
- `countClozes(html)` — count `.cloze` class occurrences
- `extractClozeIds(html)` — extract unique cloze data attributes

Detection patterns:
- Cloze: `class="cloze"` or `[...]` pattern
- Image-occlusion: `io-header`, `io-table`, `io-revl` classes
- Type-in: `input#typeans`
- AMBOSS: `amboss` or `AnkiHub` in HTML
- AnKing: `AnKingMed` or `AnKing` in HTML

Return shape:
```
{ cardType, hasImages, hasTables, hasCode, hasAudio, hasColorCoding,
  contentLength, deckFamily, clozeCount, clozeIds }
```

- [ ] **Step 2: Verify file was created correctly**

Run: `head -5 frontend/src/utils/cardClassifier.js`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/utils/cardClassifier.js
git commit -m "feat: add card classifier utility for HTML analysis"
```

---

### Task 2: Create Enhancement Layer CSS

**Files:**
- Create: `frontend/src/styles/card-enhancement.css` (new `styles/` directory)

- [ ] **Step 1: Create the styles directory and card-enhancement.css**

The CSS file has three sections:

**Layer 1 — Reset/Isolation:**
- `.card-renderer` — transparent bg, color from design system, box-sizing
- Universal box-sizing reset inside container

**Layer 2 — Enhancement Defaults (low specificity):**
- `.card-renderer .card`, `.card-renderer #qa`, `.card-renderer .card-content` — font-size `var(--ds-text-xl)`, line-height 1.65, system font, text color
- `img` — max-width 100%, border-radius 6px
- `table` — collapse, full width, borders using `var(--ds-border-medium)`, th with bold + hover-tint bg
- `pre` — padding, border-radius, hover-tint bg, monospace font
- `code` — monospace, smaller font, padding, rounded
- `ul`/`ol` — proper list styles, margin-left
- `p` — bottom margin
- `a` — accent color, underline on hover
- `sub`/`sup` — proper positioning (science cards)

**Dark Mode Safety (forced with !important):**
- Black text selectors: `[style*="color: black"]`, `[style*="color:black"]`, `[style*="color:#000"]`, `[style*="color: #000"]`, `[style*="color: rgb(0"]`, `[style*="color:rgb(0"]` → `var(--ds-text-primary)`
- White bg selectors: all variants of `background: white`, `background-color:#fff`, `background: rgb(255` etc. → transparent
- `.card` and `.card.nightMode` background → transparent

**Cloze Prep:**
- `.card-renderer .cloze` — font-weight 600, padding, border-radius 3px, `var(--ds-active-tint)` bg, transition

- [ ] **Step 2: Verify file structure**

Run: `ls frontend/src/styles/`
Expected: `card-enhancement.css`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/styles/card-enhancement.css
git commit -m "feat: add card enhancement layer CSS (typography, dark mode, cloze prep)"
```

---

### Task 3: Fix ReviewerView Rendering

**Files:**
- Modify: `frontend/src/components/ReviewerView.jsx`

- [ ] **Step 1: Add content check helper and swap HTML priority**

Add helper function after imports (before the component):

```js
/** Check if HTML has visible content (not just style tags / whitespace) */
function hasVisibleContent(html) {
  if (!html) return false;
  const stripped = html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, '').trim();
  return stripped.length > 0;
}
```

Replace lines 65-68 (the rendering block inside the max-width div):

**Before:**
```jsx
{showBack
  ? <div ... __html: cardData.backField || cardData.backHtml || '' ... />
  : <div ... __html: cardData.frontField || cardData.frontHtml || '' ... />
}
```

**After:**
```jsx
{showBack
  ? <div className="card-renderer">
      <div className="card-content" set-inner-html with:
        hasVisibleContent(cardData.backHtml) ? cardData.backHtml : (cardData.backField || cardData.backHtml || '')
      />
    </div>
  : <div className="card-renderer">
      <div className="card-content" set-inner-html with:
        hasVisibleContent(cardData.frontHtml) ? cardData.frontHtml : (cardData.frontField || cardData.frontHtml || '')
      />
    </div>
}
```

Key changes:
1. Priority swapped: `frontHtml` first (has CSS + template rendering), `frontField` as fallback
2. `hasVisibleContent()` check prevents blank display when HTML is only style tags
3. Wrapped in `.card-renderer > .card-content` for Enhancement Layer scoping
4. Same for back side

- [ ] **Step 2: Verify the changes**

Run: `grep -n "card-renderer" frontend/src/components/ReviewerView.jsx`
Expected: Shows the new `.card-renderer` wrapper on multiple lines.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ReviewerView.jsx
git commit -m "fix: use template-rendered HTML for card display (includes Note Type CSS)"
```

---

### Task 4: Import Enhancement CSS in main.jsx

**Files:**
- Modify: `frontend/src/main.jsx`

- [ ] **Step 1: Add the import**

After line 6 (`import './index.css';`), add:

```js
import './styles/card-enhancement.css';
```

Import order matters for cascade: index.css (design system) then card-enhancement.css then katex.css.

- [ ] **Step 2: Verify import order**

Run: `grep -n "import.*css" frontend/src/main.jsx`
Expected: index.css, card-enhancement.css, katex.min.css in that order.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/main.jsx
git commit -m "chore: import card enhancement CSS in main entry point"
```

---

### Task 5: Wire Card Classifier into App.jsx EventBus

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Add import at top of App.jsx**

Add with the other imports:

```js
import { classifyCard } from './utils/cardClassifier';
```

Note: `emit` from `./eventBus` should already be imported. If not, add it.

- [ ] **Step 2: Add classifier call in card.shown handler**

Find the `card.shown` handler block (around line 717):

```js
if (payload.type === 'card.shown') {
  setCardData({...payload.data, isQuestion: true});
  setReviewChatOpen(false);
  return;
}
```

Add classifier call before the return:

```js
if (payload.type === 'card.shown') {
  setCardData({...payload.data, isQuestion: true});
  setReviewChatOpen(false);
  const classification = classifyCard(payload.data.frontHtml, payload.data.backHtml);
  emit('card.classified', { cardId: payload.data.cardId, deckName: payload.data.deckName, ...classification });
  return;
}
```

- [ ] **Step 3: Add classifier call in card.answerShown handler**

Find the `card.answerShown` handler (around line 722). Add classifier call before the return:

```js
if (payload.type === 'card.answerShown') {
  setCardData(prev => {
    if (prev && !prev.isQuestion) return prev;
    return prev ? {...prev, ...payload.data, isQuestion: false} : {...payload.data, isQuestion: false};
  });
  const classification = classifyCard(payload.data.frontHtml, payload.data.backHtml);
  emit('card.classified', { cardId: payload.data.cardId, deckName: payload.data.deckName, ...classification, isAnswer: true });
  return;
}
```

- [ ] **Step 4: Verify import and usage**

Run: `grep -n "classifyCard\|card.classified" frontend/src/App.jsx`
Expected: Shows import line and two emit calls.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: emit card.classified event on EventBus with card metadata"
```

---

### Task 6: Apply card-renderer to CardPreviewModal

**Files:**
- Modify: `frontend/src/components/CardPreviewModal.jsx`

- [ ] **Step 1: Wrap front/back HTML divs in card-renderer**

Find the front rendering block (around line 222-234). Replace the `prose prose-lg` div with:

```jsx
<div className="card-renderer">
  <div className="card-content" set-inner-html={createMarkup(details.front)} />
</div>
```

Do the same for the back rendering block (around line 242-254):

```jsx
<div className="card-renderer">
  <div className="card-content" set-inner-html={createMarkup(details.back)} />
</div>
```

The old `prose prose-lg` classes and inline Tailwind overrides are removed — the Enhancement Layer CSS handles all of this.

- [ ] **Step 2: Verify**

Run: `grep -n "card-renderer" frontend/src/components/CardPreviewModal.jsx`
Expected: Shows two occurrences of card-renderer.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/CardPreviewModal.jsx
git commit -m "refactor: use card-renderer container in CardPreviewModal for consistent styling"
```

---

### Task 7: Fix misleading comment in widget.py

**Files:**
- Modify: `ui/widget.py` (line 1943)

- [ ] **Step 1: Fix the comment**

Find line 1943:
```python
# Clean scripts, styles, tag metadata from both
```

Replace with:
```python
# Strip <script> tags (keeps <style> — they carry card formatting)
```

- [ ] **Step 2: Commit**

```bash
git add ui/widget.py
git commit -m "docs: fix misleading comment in _send_card_data (styles are kept, not stripped)"
```

---

### Task 8: Build and Verify

- [ ] **Step 1: Build frontend**

Run: `cd frontend && npm run build`
Expected: Build succeeds, no errors.

- [ ] **Step 2: Verify build output includes new CSS**

Run: `grep -r "card-renderer" web/`
Expected: card-renderer class appears in compiled CSS output.

- [ ] **Step 3: Verify classifier is bundled**

Run: `grep -r "card.classified" web/`
Expected: event name appears in compiled JS output.

- [ ] **Step 4: Final commit**

```bash
git add -A web/
git commit -m "build: compile frontend with card renderer enhancement"
```
