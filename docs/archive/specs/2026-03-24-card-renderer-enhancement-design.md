# Card Renderer Enhancement — Design Spec

**Date:** 2026-03-24
**Status:** Reviewed
**Scope:** Fix card rendering, Enhancement Layer, Card Classifier, Interactive Cloze prep

---

## Problem

Cards in the Session/Review view appear completely unformatted. The `ReviewerView.jsx` component prefers `frontField` (raw note field content) over `frontHtml` (Anki template-rendered HTML with embedded CSS). This means:
- No Note Type CSS (colors, fonts, layout)
- Cloze markers show as raw `{{c1::...}}` instead of resolved blanks
- No template logic (conditionals, FrontSide injection)

## Architecture

### Three-Layer Rendering System

```
┌─────────────────────────────────────────────┐
│  Layer 3: Card Original CSS (highest wins)  │
│  Embedded <style> from Note Type            │
│  Deck-specific colors, fonts, layout        │
├─────────────────────────────────────────────┤
│  Layer 2: Enhancement Layer                 │
│  Typography baseline, dark mode fixes,      │
│  spacing, image/table normalization         │
├─────────────────────────────────────────────┤
│  Layer 1: Reset / Isolation                 │
│  Scoped container, background transparent,  │
│  box-sizing reset                           │
└─────────────────────────────────────────────┘
```

### Card Classifier to EventBus

```
card.shown event arrives
  -> CardClassifier.classify(html) runs
  -> emit('card.classified', metadata)
  -> Any agent/hook can subscribe
```

---

## Part 1: Fix Rendering

### Change: ReviewerView.jsx

Swap field priority for **both front and back** — use template-rendered HTML (which includes style tags):

```jsx
// BEFORE (broken — both sides):
cardData.frontField || cardData.frontHtml   // line 67
cardData.backField || cardData.backHtml     // line 66

// AFTER (correct — both sides):
cardData.frontHtml || cardData.frontField
cardData.backHtml || cardData.backField
```

Edge case: if `frontHtml` is whitespace-only or contains only style tags with no visible content, fall through to `frontField`. Use a content check: `frontHtml?.replace(/<style[\s\S]*?<\/style>/gi, '').trim()`.

### Why frontHtml works

`card.question()` returns fully rendered HTML including:
- Resolved cloze deletions (blanks on question, answer on answer side)
- Note Type CSS as embedded style tags
- Template conditionals resolved
- Media paths (already resolved by `_send_card_data`)

The `_clean_card_html()` method intentionally keeps style tags (only strips script tags).

Note: Card HTML comes from Anki's own template engine applied to the user's own cards. Script tags are already stripped by `_clean_card_html()` on the Python side before reaching React.

### Container scoping

Wrap card HTML in a scoped container. Note: CSS `isolation: isolate` only creates a stacking context — it does NOT scope CSS. Card style tags with selectors like `body`, `.card`, or `*` can still leak. True isolation would require Shadow DOM or iframe, which adds complexity we don't need for v1.

Practical approach: the `.card-renderer` container provides a scoping selector for our Enhancement Layer. Card CSS leakage is mitigated by:
1. Most card CSS targets `.card` or `#qa` — our app doesn't use these classes
2. Enhancement CSS re-asserts app styles on sibling elements
3. Cards with aggressive selectors (`body`, `*`) are rare edge cases — address per-deck if needed

```jsx
<div className="card-renderer">
  <div className="card-content" />
</div>
```

---

## Part 2: Enhancement Layer

A CSS file (`card-enhancement.css`) loaded inside the card renderer container. Uses **low specificity** so card CSS always wins.

### What it enhances (defaults only)

| Property | Enhancement | Card CSS overrides? |
|----------|------------|-------------------|
| `font-size` | `var(--ds-text-xl)` (18px) | Yes |
| `line-height` | 1.65 | Yes |
| `font-family` | SF Pro (system) | Yes |
| `color` | `var(--ds-text-primary)` | Yes |
| `img max-width` | 100% | Yes |
| `table` | Responsive, borders | Yes |
| `code/pre` | Styled blocks | Yes |
| `ul/ol` | Consistent spacing | Yes |

### What it forces (dark mode safety)

These use `!important` because they fix broken dark mode:

```css
/* Only target "dumb" black/white — semantic colors untouched */
/* Broad selectors to cover formatting variants (spaces, #000 vs #000000, etc.) */
.card-renderer [style*="color: black"],
.card-renderer [style*="color:black"],
.card-renderer [style*="color:#000"],
.card-renderer [style*="color: #000"],
.card-renderer [style*="color: rgb(0"],
.card-renderer [style*="color:rgb(0"] {
  color: var(--ds-text-primary) !important;
}

.card-renderer [style*="background: white"],
.card-renderer [style*="background:white"],
.card-renderer [style*="background-color:white"],
.card-renderer [style*="background-color: white"],
.card-renderer [style*="background:#fff"],
.card-renderer [style*="background: #fff"],
.card-renderer [style*="background-color:#fff"],
.card-renderer [style*="background-color: #fff"],
.card-renderer [style*="background: rgb(255"],
.card-renderer [style*="background:rgb(255"],
.card-renderer [style*="background-color: rgb(255"],
.card-renderer [style*="background-color:rgb(255"] {
  background: transparent !important;
}
```

### CSS injection strategy

Enhancement CSS is injected **before** the card HTML in the DOM. Since card CSS appears inside the card HTML (later in document order), it automatically wins in the CSS cascade when specificity is equal.

```
DOM order:
1. card-enhancement.css (our defaults) — LOSES when card has own CSS
2. Card HTML with embedded style — WINS (appears later)
```

---

## Part 3: Card Classifier

### Module: `frontend/src/utils/cardClassifier.js`

Lightweight HTML analysis (~30 lines). Runs synchronously on card HTML string.

```js
export function classifyCard(frontHtml, backHtml) {
  return {
    // Card type
    cardType: detectCardType(frontHtml),

    // Content features
    hasImages: /<img\s/i.test(combined),
    hasTables: /<table/i.test(combined),
    hasCode: /<pre|<code/i.test(combined),
    hasAudio: /\[sound:/i.test(combined),
    hasColorCoding: detectColorCoding(combined),

    // Content size
    contentLength: categorizeLength(frontHtml),

    // Deck family (known formats)
    deckFamily: detectDeckFamily(combined),

    // Cloze info (for future interactive cloze)
    clozeCount: countClozes(backHtml),
    clozeIds: extractClozeIds(frontHtml),
  };
}
```

### Detection functions

- `detectCardType(html)` — checks for cloze class, image-occlusion patterns, type-in input
- `detectDeckFamily(html)` — looks for AMBOSS/AnKing markers in HTML
- `detectColorCoding(html)` — counts unique non-black/white color values in style attributes

### EventBus integration

In `App.jsx`, after setting card data:

```js
import { classifyCard } from './utils/cardClassifier';
import { emit } from './eventBus';

// In card.shown handler:
const classification = classifyCard(payload.data.frontHtml, payload.data.backHtml);
emit('card.classified', { cardId: payload.data.cardId, ...classification });
```

Agents subscribe via `eventBus.on('card.classified', callback)`.

---

## Part 4: Interactive Cloze Architecture (Prep Only)

### What we build now

1. **Cloze detection** in classifier (Part 3 covers this)
2. **CSS classes** for cloze elements in Enhancement Layer
3. **Event hook** `card.clozeRevealed` on EventBus (defined, not wired)

### What we build later

- Tab-to-reveal: pressing Tab reveals next cloze one by one
- Cloze animation (fade-in, highlight)
- AMBOSS button re-styling
- Hint toggle accordions

### CSS prep in Enhancement Layer

```css
/* Cloze styling — ready for interactive enhancement later */
.card-renderer .cloze {
  font-weight: 600;
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--ds-active-tint);
  transition: all 0.2s ease;
}
```

---

## Files to create/modify

| File | Action | Description |
|------|--------|-------------|
| `frontend/src/components/ReviewerView.jsx` | Modify | Swap frontField to frontHtml, add container isolation |
| `frontend/src/styles/card-enhancement.css` | Create | Enhancement Layer CSS (new `styles/` directory) |
| `frontend/src/utils/cardClassifier.js` | Create | Card content classifier |
| `frontend/src/App.jsx` | Modify | Add classifier call + emit on card.shown |
| `frontend/src/main.jsx` | Modify | Import `./styles/card-enhancement.css` after `./index.css` |
| `frontend/src/components/CardPreviewModal.jsx` | Modify | Apply same `.card-renderer` container for consistency |
| `ui/widget.py` | Modify | Fix misleading comment on line 1943 (says "styles" but _clean_card_html keeps them) |

## Files NOT modified

- `ui/bridge.py` — getCardDetails already includes CSS
- `eventBus.js` — already supports new events, no changes needed

---

## Risk assessment

- **Low risk**: frontHtml swap — card.question() is Anki's standard API
- **Low risk**: Enhancement CSS — low specificity means card CSS always wins
- **Low risk**: Classifier — pure read-only analysis, no mutations
- **Medium risk**: Dark mode color override — attribute selectors may not catch all formats. Mitigated by targeting only explicit black/white values.
