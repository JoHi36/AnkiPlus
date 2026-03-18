# Deck Browser Redesign — Design Spec

**Date:** 2026-03-18
**Status:** Approved

---

## Overview

Redesign the native Anki deck browser (rendered in `custom_screens.py` via `webview_will_set_content`) to feel like a coherent Anki.plus product page: a wordmark header, a prominent pill search bar, and a clean in-place chat transformation. All changes are vanilla HTML/CSS/JS — no React involved.

This spec describes the **target state**. The existing partial implementation of `_SEARCHBAR_HTML` is **replaced in full**. The `_account_widget()` bottom-right badge is **removed** — the wordmark badge is the single upgrade trigger going forward.

---

## 1. Wordmark

**Placement:** Centered above the search bar, inside `_SEARCHBAR_HTML`. Part of the same HTML block as the pill.

**Design:**
```html
<div id="ap-wordmark">
  <div class="ap-wm-text">
    <span class="ap-wm-anki">Anki</span><span class="ap-wm-tld">.plus</span>
  </div>
  <span id="ap-wm-badge" class="ap-wm-badge ap-wm-badge--free">Free</span>
</div>
```

CSS:
- `.ap-wm-anki` — -apple-system / SF Pro Display, 46px, weight 700, letter-spacing −1.8px, `rgba(255,255,255,0.92)`
- `.ap-wm-tld` — same font, 46px, weight 300, letter-spacing −1px, `rgba(255,255,255,0.22)`
- `#ap-wordmark` — `display:flex; align-items:center; justify-content:center; gap:10px; margin-bottom:24px`
- `.ap-wm-text` — `display:flex; align-items:baseline`

**Badge (`.ap-wm-badge`):** border-radius 7px, font-size 10px, weight 700, letter-spacing 0.07em, padding `4px 9px`, align-self center, margin-top 4px (optical baseline), cursor pointer.

- `--free`: `background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.09); color:rgba(255,255,255,0.28)`
- `--pro`: `background:rgba(10,132,255,0.1); border:1px solid rgba(10,132,255,0.22); color:rgba(10,132,255,0.72)`

Badge click → calls `window._apAction = {type:'upgradeBadge'}` (same polling mechanism as other actions).

**Account widget removal:** `_account_widget()` is called from `_wrap_page()`, not from `_deck_browser_html()`. `_wrap_page()` is also used by the Overview page. To avoid removing the widget from Overview: do **not** delete `_account_widget()` itself; instead remove its call specifically inside the deck browser path. In `_deck_browser_html()`, the HTML currently calls `_wrap_page()` which injects the widget — either inline the deck browser HTML to bypass `_wrap_page()`, or add a parameter to `_wrap_page(show_account_widget=True)` that gates the call. Either approach is acceptable. The wordmark badge is the sole upgrade trigger on the deck browser page.

---

## 2. Search Bar (Pill)

**Full replacement** of existing `_SEARCHBAR_HTML`. Structure:

```html
<div id="ap-search-wrap">
  <!-- Wordmark (Section 1) lives here, above the pill -->

  <div id="ap-search-bar">
    <div id="ap-sb-snake"></div>
    <span class="ap-sb-icon">✦</span>
    <div id="ap-placeholder-wrap">
      <span id="ap-placeholder-a" class="ap-ph">Stelle eine Frage…</span>
      <span id="ap-placeholder-b" class="ap-ph ap-ph--hidden"></span>
    </div>
    <input id="ap-search-input" type="text" autocomplete="off" spellcheck="false">
    <button id="ap-send-btn" aria-label="Senden">
      <!-- ArrowRight SVG inline -->
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
           stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="5" y1="12" x2="19" y2="12"/>
        <polyline points="12 5 19 12 12 19"/>
      </svg>
    </button>
  </div>

  <div id="ap-search-hint">
    <span id="ap-hint-text">Fokussieren&nbsp;<kbd>⌘K</kbd></span>
  </div>
</div>
```

### Shape & dimensions
- `#ap-search-bar` — `border-radius:50px; height:46px; padding:0 10px 0 20px; display:flex; align-items:center; gap:8px; background:#1c1c1e; border:1px solid rgba(255,255,255,0.08); position:relative; transition:border-color 0.2s`
- `max-width: 720px; width: 100%; margin: 0 auto` — matches the `max-width:720px` container already used by `_wrap_page()`. No additional max-width needed on child elements.

### Send button
- `#ap-send-btn` — `width:30px; height:30px; border-radius:50%; background:#0a84ff; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0`
- **Default (empty input):** `opacity:0; transform:scale(0.75); pointer-events:none; transition:opacity 0.15s,transform 0.15s`
- **Text present:** `opacity:1; transform:scale(1); pointer-events:auto`
- JS: `input.addEventListener('input', () => { btn.classList.toggle('ap-send-visible', input.value.trim().length > 0) })`

### Focus state
- `border-color:rgba(10,132,255,0.25)` on `#ap-search-bar` when input is focused
- Snake border activates (see below)

### Snake border
**Use the `@property --ap-sb-angle` approach** (same pattern as `--ap-dock-angle` in `_PAGE_CSS`). Replace the existing `<div id="ap-sb-ring">` + `ap-snake-spin` keyframe approach entirely.

```css
@property --ap-sb-angle {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}
@keyframes apSbRotate {
  from { --ap-sb-angle: 0deg; }
  to   { --ap-sb-angle: 360deg; }
}
#ap-sb-snake {
  position: absolute;
  inset: -1px;
  border-radius: 50px;
  padding: 1px;
  background: conic-gradient(
    from var(--ap-sb-angle) at 50% 50%,
    rgba(10,132,255,0.0)   0deg,
    rgba(10,132,255,0.55) 60deg,
    rgba(10,132,255,0.12) 120deg,
    rgba(10,132,255,0.0) 180deg,
    rgba(10,132,255,0.12) 240deg,
    rgba(10,132,255,0.55) 300deg,
    rgba(10,132,255,0.0) 360deg
  );
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s;
}
#ap-sb-snake.active {
  opacity: 1;
  animation: apSbRotate 4s linear infinite;
}
```

JS: `input.addEventListener('focus', () => snake.classList.add('active'))` / `blur` removes it.

Remove the old `@keyframes ap-snake-spin` from `_PAGE_CSS`.

### Hint line
```css
#ap-search-hint {
  text-align: center;
  margin-top: 8px;
  height: 16px;
  font-size: 10px;
  color: rgba(255,255,255,0.15);
}
#ap-search-hint kbd {
  font-family: ui-monospace, monospace;
  font-size: 9.5px;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 4px;
  padding: 1px 4px;
  color: rgba(255,255,255,0.3);
}
```

JS toggle on focus/blur (swap `innerHTML`, platform-aware shortcut):
```js
var isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
var focusHint = isMac ? 'Fokussieren&nbsp;<kbd>⌘K</kbd>' : 'Fokussieren&nbsp;<kbd>Ctrl+K</kbd>';
var sendHint  = 'Senden&nbsp;<kbd>Enter</kbd>';

input.addEventListener('focus', function() { hintEl.innerHTML = sendHint; });
input.addEventListener('blur',  function() { hintEl.innerHTML = focusHint; });
```

Initial hint HTML (set before JS runs) should default to the unfocused state. Since JS sets it on focus/blur, initialize `#ap-hint-text` content as empty and let the JS set it on first render via `hintEl.innerHTML = focusHint` immediately after the listeners are attached.

### Rotating placeholder
The native `input.placeholder` attribute cannot be CSS-transitioned. Use two `<span>` overlays positioned absolutely over the input. The input itself has `color:transparent` placeholder (or no placeholder attribute).

The `#ap-placeholder-wrap` must be positioned flush-left with the `<input>` element itself. The pill has `padding-left:20px` + `✦` icon (~14px wide) + `gap:8px` = approximately `left:46px` from the pill's left edge. Use `left:46px` as the starting value; adjust if the icon renders wider.

```css
#ap-placeholder-wrap {
  position: absolute;
  left: 46px; /* pill padding-left(20) + icon(~14) + gap(8) + 4 optical */
  top: 50%; transform: translateY(-50%);
  pointer-events: none;
}
.ap-ph {
  font-size: 14px;
  color: rgba(255,255,255,0.22);
  position: absolute;
  white-space: nowrap;
  transition: opacity 0.4s ease;
}
.ap-ph--hidden { opacity: 0; }
```

JS rotation and visibility (single authoritative rule: the `input` event drives placeholder visibility; Enter handler clears the value which fires `input`, which handles the rest):
```js
var phrases = [
  'Stelle eine Frage…',
  'Was ist ein Aktionspotential?',
  'Erkläre die Nernst-Gleichung',
  'Welche Muskeln rotieren den Oberarm?',
  'Zusammenfassung Biochemie?'
];
var phIdx = 0;
var phA = document.getElementById('ap-placeholder-a');
var phB = document.getElementById('ap-placeholder-b');
var phWrap = document.getElementById('ap-placeholder-wrap');
phA.textContent = phrases[0];

// Single source of truth: show/hide based on input value
input.addEventListener('input', function() {
  phWrap.style.opacity = input.value ? '0' : '1';
});

// Rotate every 3s; skip if input is focused or has content
setInterval(function() {
  if (input.value || document.activeElement === input) return;
  phIdx = (phIdx + 1) % phrases.length;
  phB.textContent = phrases[phIdx];
  phB.classList.remove('ap-ph--hidden');
  phA.classList.add('ap-ph--hidden');
  setTimeout(function() {
    phA.textContent = phrases[phIdx];
    phA.classList.remove('ap-ph--hidden');
    phB.classList.add('ap-ph--hidden');
  }, 500);
}, 3000);
```

The Enter handler simply clears `input.value = ''` and dispatches an `input` event to trigger visibility restore:
```js
input.value = '';
input.dispatchEvent(new Event('input'));
```

### ⌘K global focus
Added inside `_CHAT_JS` (existing `document.addEventListener('keydown')` block):
```js
if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
  e.preventDefault();
  document.getElementById('ap-search-input').focus();
}
```

### Enter to send
When search bar has focus and Enter is pressed (not Shift+Enter), fire the chat action:
```js
input.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey && input.value.trim()) {
    e.preventDefault();
    window._apAction = { type: 'freeChat', text: input.value.trim() };
    // clear input after sending
    input.value = '';
    // hide placeholder
    document.getElementById('ap-placeholder-wrap').style.opacity = '0';
  }
});
```

### Vertical spacing (wordmark block)
- Distance from page top to wordmark: `padding-top: 48px` on `#ap-search-wrap`
- Gap between wordmark baseline and pill top: `margin-bottom: 24px` on `#ap-wordmark`
- Gap between pill bottom and hint: `margin-top: 8px` on `#ap-search-hint`
- Gap between hint and deck list: `margin-top: 32px` on the deck list container

---

## 3. Chat Message Style (Style B)

**Full replacement** of the `addUser()` and `addAI()` / streaming functions in `_CHAT_JS`.

### DOM structure for a single exchange
```html
<div class="ap-exchange">
  <div class="ap-user-label">Du</div>
  <div class="ap-user-q">Was ist ein Aktionspotential?</div>
  <div class="ap-ai-prose" id="ap-ai-{n}"><!-- streamed text here --></div>
</div>
```

Each question+answer pair lives in `.ap-exchange`. When user sends a new message, a new `.ap-exchange` is appended to `#ap-chat-msgs`.

### CSS
```css
.ap-exchange { margin-bottom: 40px; max-width: 720px; }
.ap-user-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.3);
  margin-bottom: 6px;
}
.ap-user-q {
  font-size: 19px;
  font-weight: 600;
  color: rgba(255,255,255,0.88);
  line-height: 1.35;
  margin-bottom: 20px;
}
.ap-ai-prose {
  font-size: 15px;
  font-weight: 400;
  color: rgba(255,255,255,0.75);
  line-height: 1.7;
}
```

No background, no border, no border-radius on `.ap-user-q` or `.ap-ai-prose`.

### JS functions (replace existing `addUser` / `startAI`)

Define `escHtml` at the top of the `_CHAT_JS` IIFE (needed to safely inject user text via `innerHTML`):
```js
function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
```

```js
var _aiCounter = 0;
function addExchange(question) {
  var n = ++_aiCounter;
  var el = document.createElement('div');
  el.className = 'ap-exchange';
  el.innerHTML =
    '<div class="ap-user-label">Du</div>' +
    '<div class="ap-user-q">' + escHtml(question) + '</div>' +
    '<div class="ap-ai-prose" id="ap-ai-' + n + '"></div>';
  msgs.appendChild(el);
  msgs.scrollTop = msgs.scrollHeight;
  return n;
}
function appendChunk(n, chunk) {
  var el = document.getElementById('ap-ai-' + n);
  if (el) {
    el.textContent += chunk; // plain text; markdown out of scope
    msgs.scrollTop = msgs.scrollHeight;
  }
}
```

`window.apChatReceive` calls `appendChunk(currentN, data.chunk)` during streaming. `currentN` is set when `addExchange()` is called.

**Markdown:** Out of scope. Plain `textContent` append only.

### Cursor / loading indicator
While streaming, the AI prose element shows a blinking cursor appended as the last child. Remove it on `done:true`.

```css
.ap-cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  background: rgba(255,255,255,0.5);
  margin-left: 2px;
  vertical-align: text-bottom;
  animation: apCursorBlink 0.9s step-start infinite;
}
@keyframes apCursorBlink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
}
```

JS: append `<span class="ap-cursor"></span>` as a separate DOM node (not via `textContent`) after `appendChunk`. On `done:true`, query and remove it:
```js
var cursor = el.querySelector('.ap-cursor');
if (cursor) cursor.remove();
```

---

## 4. Background & Transition

Already implemented; **no changes required**. The `top:48px` value is intentional — it leaves the Anki tab bar visible above the chat overlay. With the new wordmark block, the deck browser page is taller, but the overlay still covers from the tab bar bottom downward, which is correct behavior.

- Overlay `position:fixed; top:48px; left:0; right:0; bottom:0; background:#111111`
- Overlay fades in: `opacity 0→1`, 250ms ease
- Deck content: `opacity 1→0` + `translateY(0→60px)`, 250ms ease
- Return: reverse on ESC / close button

---

## 5. Scope & Files

All changes confined to **`custom_screens.py`** only.

| Item | Action |
|---|---|
| `_SEARCHBAR_HTML` | Full replacement: wordmark + pill + hint, as specified |
| `_PAGE_CSS` | Add wordmark CSS, pill CSS, `@property --ap-sb-angle`, `@keyframes apSbRotate`, `.ap-exchange` CSS; remove old `ap-snake-spin` keyframe |
| `_CHAT_JS` | Replace `addUser`/`startAI` with `addExchange`/`appendChunk`; add ⌘K listener; add send-button show/hide; add placeholder rotation |
| `_account_widget()` | Keep method; suppress its output on the deck browser page only (see Section 1 for approach) |
| `_deck_browser_html()` | Insert `_SEARCHBAR_HTML` above deck content; no other changes |
| All other files | No changes |

---

## 6. Out of Scope

- Animated deck list entries
- Markdown rendering in chat prose
- Mobile/responsive layout
- Persistent chat history across sessions (existing behavior unchanged)
- Any changes to React frontend, `bridge.py`, `widget.py`, or other Python files
