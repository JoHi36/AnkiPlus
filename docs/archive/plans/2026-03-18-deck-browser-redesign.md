# Deck Browser Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the deck browser search bar, add a wordmark, redesign chat messages, and suppress the legacy account widget — all inside `custom_screens.py`.

**Architecture:** All changes are confined to `custom_screens.py`. The file has three layers: (1) CSS constants (`_PAGE_CSS`), (2) HTML template constants (`_SEARCHBAR_HTML`, `_CHAT_HTML`), (3) JS logic constant (`_CHAT_JS`). Each task targets one layer. No tests exist — every task ends with a manual Anki reload verification.

**Tech Stack:** Python f-strings, vanilla HTML/CSS/JS embedded as string constants, Qt WebEngineView, Anki addon hooks.

---

## How to reload and verify

After every task:
```bash
# Anki must be running with the addon loaded
# Tools → Add-ons → AnkiPlus → Config (or just restart Anki)
# Navigate to Deck Browser (Home screen)
# Check the stated visual outcome
```

There is no automated test suite. Verification is visual, in Anki.

---

## File map

**Single file, all changes:** `custom_screens.py`

| Constant / Method | Current state | This plan changes it |
|---|---|---|
| `_PAGE_CSS` (line 467) | Has dock snake CSS, missing wordmark/pill/exchange CSS | Add new rules; remove `ap-snake-spin` keyframe |
| `_SEARCHBAR_HTML` (line 683) | Old pill with inline `<style>` + inline `<script>` | Full replacement |
| `_CHAT_JS` (line 773) | `addUser` bubble + `startAI` div | Replace with `addExchange`/`appendChunk`; add ⌘K, send-btn, placeholder |
| `_wrap_page()` (line 656) | Always calls `_account_widget()` | Add `show_account_widget=True` param |
| `_deck_browser_html()` (line 873) | Calls `_wrap_page(...)` with no widget param | Pass `show_account_widget=False` |
| `_handle_action()` (line 1010) | No `upgradeBadge` handler | Add handler for badge click |

---

## Task 1: CSS — Add wordmark, pill, exchange, cursor styles; remove old snake keyframe

**Files:**
- Modify: `custom_screens.py` — `_PAGE_CSS` string (lines ~467–591)

The `_PAGE_CSS` string ends at the closing `"""` before `_TOGGLE_JS`. Add new CSS blocks and delete the `@keyframes ap-snake-spin` rule that is inlined inside `_SEARCHBAR_HTML` (we'll remove it from there in Task 2, but confirm no duplicate exists in `_PAGE_CSS`).

- [ ] **Step 1: Open `_PAGE_CSS`, locate the end of the string** (line ~591, just before the closing `"""`)

- [ ] **Step 2: Add wordmark CSS block** — append inside `_PAGE_CSS` before the closing `"""`

```css
/* ─── Wordmark ─── */
#ap-wordmark {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin-bottom: 24px;
}
.ap-wm-text { display: flex; align-items: baseline; }
.ap-wm-anki {
    font-family: -apple-system, "SF Pro Display", system-ui, sans-serif;
    font-size: 46px;
    font-weight: 700;
    letter-spacing: -1.8px;
    color: rgba(255,255,255,0.92);
    line-height: 1;
}
.ap-wm-tld {
    font-family: -apple-system, "SF Pro Display", system-ui, sans-serif;
    font-size: 46px;
    font-weight: 300;
    letter-spacing: -1px;
    color: rgba(255,255,255,0.22);
    line-height: 1;
}
.ap-wm-badge {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.07em;
    padding: 4px 9px;
    border-radius: 7px;
    align-self: center;
    margin-top: 4px;
    cursor: pointer;
    white-space: nowrap;
}
.ap-wm-badge--free {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.09);
    color: rgba(255,255,255,0.28);
}
.ap-wm-badge--pro {
    background: rgba(10,132,255,0.1);
    border: 1px solid rgba(10,132,255,0.22);
    color: rgba(10,132,255,0.72);
}
```

- [ ] **Step 3: Add pill search bar CSS block**

```css
/* ─── Pill Search Bar ─── */
#ap-search-wrap {
    max-width: 720px;
    width: 100%;
    margin: 0 auto;
    padding-top: 48px;
}
#ap-search-bar {
    border-radius: 50px;
    height: 46px;
    padding: 0 10px 0 20px;
    display: flex;
    align-items: center;
    gap: 8px;
    background: #1c1c1e;
    border: 1px solid rgba(255,255,255,0.08);
    position: relative;
    transition: border-color 0.2s;
}
#ap-search-bar:focus-within {
    border-color: rgba(10,132,255,0.25);
}
.ap-sb-icon {
    font-size: 14px;
    color: rgba(100,130,255,0.65);
    flex-shrink: 0;
    line-height: 1;
    pointer-events: none;
}
#ap-search-input {
    flex: 1;
    background: transparent;
    border: none !important;
    outline: none !important;
    box-shadow: none !important;
    color: rgba(255,255,255,0.85);
    font-size: 14px;
    font-family: inherit;
    min-width: 0;
}
#ap-search-input::placeholder { color: transparent; }
#ap-send-btn {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: #0a84ff;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    opacity: 0;
    transform: scale(0.75);
    transition: opacity 0.15s, transform 0.15s;
    pointer-events: none;
}
#ap-send-btn.ap-send-visible {
    opacity: 1;
    transform: scale(1);
    pointer-events: auto;
}
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
/* ─── Pill Snake Border ─── */
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
/* ─── Placeholder overlays ─── */
#ap-placeholder-wrap {
    position: absolute;
    left: 46px;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
}
.ap-ph {
    font-size: 14px;
    color: rgba(255,255,255,0.22);
    position: absolute;
    white-space: nowrap;
    transition: opacity 0.4s ease;
    top: 0;
    left: 0;
    transform: translateY(-50%);
}
.ap-ph--hidden { opacity: 0; }
```

- [ ] **Step 4: Add chat exchange and cursor CSS block**

```css
/* ─── Chat exchange (Style B) ─── */
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
/* Streaming cursor */
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

- [ ] **Step 5: Confirm no duplicate `ap-snake-spin` keyframe in `_PAGE_CSS`**

Run: `grep -n "ap-snake-spin" custom_screens.py`
Expected: zero matches in `_PAGE_CSS`. The only occurrence is inside `_SEARCHBAR_HTML` (Task 2 replaces the entire string, eliminating it). If it somehow also appears in `_PAGE_CSS`, delete it now.

- [ ] **Step 6: Verify — reload Anki, open deck browser**

Expected: No visual change yet (CSS added but old HTML still references old classes). No console errors visible in Anki's webview inspector. This step just confirms the CSS doesn't break the page.

- [ ] **Step 7: Commit**

```bash
git add "custom_screens.py"
git commit -m "feat(deck-browser): add wordmark/pill/exchange CSS to _PAGE_CSS"
```

---

## Task 2: Replace `_SEARCHBAR_HTML`

**Files:**
- Modify: `custom_screens.py` — `_SEARCHBAR_HTML` constant (lines ~683–718)

Replace the entire `_SEARCHBAR_HTML = """..."""` string (from the opening `"""` to the closing `"""`). The new string includes: wordmark, pill bar with snake overlay, placeholder spans, send button, hint line. No inline `<style>` or `<script>` tags — those go in `_PAGE_CSS` (Task 1) and `_CHAT_JS` (Task 3) respectively.

The `_deck_browser_html()` function already inserts `_SEARCHBAR_HTML` inside `<div id="ap-deck-content">` — no change needed there.

- [ ] **Step 1: Replace `_SEARCHBAR_HTML`**

New value (Python triple-quoted string):

```python
_SEARCHBAR_HTML = """
<div id="ap-search-wrap">
  <div id="ap-wordmark">
    <div class="ap-wm-text">
      <span class="ap-wm-anki">Anki</span><span class="ap-wm-tld">.plus</span>
    </div>
    <span id="ap-wm-badge" class="ap-wm-badge ap-wm-badge--free">Free</span>
  </div>

  <div id="ap-search-bar">
    <div id="ap-sb-snake"></div>
    <span class="ap-sb-icon">&#10022;</span>
    <div id="ap-placeholder-wrap">
      <span id="ap-placeholder-a" class="ap-ph"></span>
      <span id="ap-placeholder-b" class="ap-ph ap-ph--hidden"></span>
    </div>
    <input id="ap-search-input" type="text" autocomplete="off" spellcheck="false">
    <button id="ap-send-btn" aria-label="Senden">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
           stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="5" y1="12" x2="19" y2="12"/>
        <polyline points="12 5 19 12 12 19"/>
      </svg>
    </button>
  </div>

  <div id="ap-search-hint">
    <span id="ap-hint-text"></span>
  </div>
</div>
<div style="margin-top:32px;"></div>
"""
```

Note: `&#10022;` is the HTML entity for `✦`. Using entity avoids encoding issues in Python string.

- [ ] **Step 2: Reload Anki, open deck browser**

Expected:
- "Anki" in bold + ".plus" in light gray + "Free" badge visible above the pill
- Pill bar present, correct height (~46px), no placeholder text yet (JS not wired yet — that's Task 3)
- Send button invisible (correct — no value)
- Hint line empty (correct — JS not wired yet)
- Deck list still renders below with 32px gap

- [ ] **Step 3: Commit**

```bash
git add "custom_screens.py"
git commit -m "feat(deck-browser): replace _SEARCHBAR_HTML with wordmark + pill design"
```

---

## Task 3: Replace `_CHAT_JS` — wire search bar + replace message rendering

**Files:**
- Modify: `custom_screens.py` — `_CHAT_JS` constant (lines ~773–870)

This is the largest change. The new `_CHAT_JS` must:
1. Keep all existing chat open/close/reset/receive/dock logic
2. Replace `addUser` + `startAI` with `addExchange` + `appendChunk`
3. Wire the search input: snake, hint toggle, placeholder rotation, send button, Enter/send-btn submit
4. Add ⌘K global focus shortcut

Replace the entire `_CHAT_JS = """..."""` string:

- [ ] **Step 1: Write the new `_CHAT_JS`**

```python
_CHAT_JS = """
(function(){
  /* ── DOM refs ── */
  var overlay  = document.getElementById('ap-chat-overlay');
  var msgs     = document.getElementById('ap-chat-msgs');
  var dock     = document.getElementById('ap-chat-dock');
  var ci       = document.getElementById('ap-chat-input');
  var deck     = document.getElementById('ap-deck-content');
  var sbInput  = document.getElementById('ap-search-input');
  var sbSnake  = document.getElementById('ap-sb-snake');
  var sbSend   = document.getElementById('ap-send-btn');
  var hintEl   = document.getElementById('ap-hint-text');
  var phWrap   = document.getElementById('ap-placeholder-wrap');
  var phA      = document.getElementById('ap-placeholder-a');
  var phB      = document.getElementById('ap-placeholder-b');

  /* ── State ── */
  var isOpen   = false;
  var isLoading = false;
  var _aiCounter = 0;
  var _curN    = null;

  var DOCK_HIDDEN = 'translateX(-50%) translateY(14px)';
  var DOCK_SHOWN  = 'translateX(-50%) translateY(0)';

  /* ── Helpers ── */
  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── Chat open/close/reset ── */
  function openChat(q) {
    if (isOpen) return; isOpen = true;
    deck.style.transition = 'opacity 250ms ease,transform 250ms ease';
    deck.style.opacity = '0';
    deck.style.transform = 'translateY(60px)';
    deck.style.pointerEvents = 'none';
    overlay.style.pointerEvents = 'auto';
    requestAnimationFrame(function(){
      overlay.style.opacity = '1';
      overlay.style.transform = 'translateY(0)';
      setTimeout(function(){
        dock.style.opacity = '1';
        dock.style.transform = DOCK_SHOWN;
        dock.style.pointerEvents = 'auto';
        ci.focus();
      }, 150);
    });
    _curN = addExchange(q);
  }

  function closeChat() {
    if (!isOpen) return; isOpen = false;
    overlay.style.opacity = '0';
    overlay.style.transform = 'translateY(8px)';
    overlay.style.pointerEvents = 'none';
    dock.style.opacity = '0';
    dock.style.transform = DOCK_HIDDEN;
    dock.style.pointerEvents = 'none';
    setTimeout(function(){
      deck.style.opacity = '1';
      deck.style.transform = 'translateY(0)';
      deck.style.pointerEvents = 'auto';
    }, 200);
    window._apAction = {type:'freeChatClose'};
  }

  function resetChat() {
    msgs.innerHTML = '';
    _curN = null;
    isLoading = false;
    _aiCounter = 0;
  }

  /* ── Message rendering (Style B) ── */
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
    /* Append blinking cursor */
    var prose = document.getElementById('ap-ai-' + n);
    var cursor = document.createElement('span');
    cursor.className = 'ap-cursor';
    prose.appendChild(cursor);
    return n;
  }

  function appendChunk(n, chunk) {
    var el = document.getElementById('ap-ai-' + n);
    if (!el) return;
    /* Insert text before cursor */
    var cursor = el.querySelector('.ap-cursor');
    if (cursor) {
      el.insertBefore(document.createTextNode(chunk), cursor);
    } else {
      el.appendChild(document.createTextNode(chunk));
    }
    msgs.scrollTop = msgs.scrollHeight;
  }

  /* ── Receive from Python ── */
  window.apOpenChat  = openChat;
  window.apCloseChat = closeChat;
  window.apResetChat = resetChat;

  window.apChatReceive = function(data) {
    if (!_curN) { _curN = addExchange(''); }
    var el = document.getElementById('ap-ai-' + _curN);
    if (data.error) {
      if (el) { el.textContent = data.error; el.style.color = 'rgba(255,80,80,0.8)'; }
      isLoading = false; _curN = null; return;
    }
    if (data.chunk) appendChunk(_curN, data.chunk);
    if (data.done) {
      /* Remove cursor */
      if (el) { var c = el.querySelector('.ap-cursor'); if (c) c.remove(); }
      isLoading = false; _curN = null;
    }
    msgs.scrollTop = msgs.scrollHeight;
  };

  /* ── Dock textarea auto-resize ── */
  ci.addEventListener('input', function(){
    ci.style.height = 'auto';
    ci.style.height = Math.min(ci.scrollHeight, 120) + 'px';
  });

  /* ── Dock Enter to send follow-up ── */
  ci.addEventListener('keydown', function(e){
    if (e.key === 'Escape') { closeChat(); return; }
    if (e.key === 'Enter' && !e.shiftKey && ci.value.trim() && !isLoading) {
      e.preventDefault();
      var t = ci.value.trim(); ci.value = ''; ci.style.height = 'auto';
      _curN = addExchange(t);
      window._apAction = {type:'freeChatSend', text:t};
    }
  });

  /* ── Global keyboard shortcuts ── */
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && isOpen) { closeChat(); return; }
    if ((e.metaKey||e.ctrlKey) && e.key==='x' && isOpen) { resetChat(); return; }
    /* ⌘K / Ctrl+K — focus search bar */
    if ((e.metaKey||e.ctrlKey) && e.key==='k') {
      e.preventDefault();
      if (sbInput) sbInput.focus();
    }
  });

  document.getElementById('ap-btn-close').onclick = closeChat;
  document.getElementById('ap-btn-reset').onclick = resetChat;

  /* ── Search bar wiring ── */
  if (!sbInput) return; /* guard: HTML must be present */

  /* Platform-aware hint text */
  var isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  var focusHint = isMac ? 'Fokussieren\u00a0<kbd>\u2318K</kbd>' : 'Fokussieren\u00a0<kbd>Ctrl+K</kbd>';
  var sendHint  = 'Senden\u00a0<kbd>Enter</kbd>';
  if (hintEl) hintEl.innerHTML = focusHint;

  /* Focus / blur */
  sbInput.addEventListener('focus', function(){
    if (sbSnake) sbSnake.classList.add('active');
    if (hintEl) hintEl.innerHTML = sendHint;
  });
  sbInput.addEventListener('blur', function(){
    if (sbSnake) sbSnake.classList.remove('active');
    if (hintEl) hintEl.innerHTML = focusHint;
  });

  /* Send button visibility — single source of truth */
  sbInput.addEventListener('input', function(){
    var hasText = sbInput.value.trim().length > 0;
    if (sbSend) sbSend.classList.toggle('ap-send-visible', hasText);
    if (phWrap) phWrap.style.opacity = hasText ? '0' : '1';
  });

  /* Enter / send button → open chat */
  function submitSearch() {
    var t = sbInput.value.trim();
    if (!t) return;
    window._apAction = {type:'freeChat', text:t};
    sbInput.value = '';
    sbInput.dispatchEvent(new Event('input')); /* triggers visibility reset */
  }
  sbInput.addEventListener('keydown', function(e){
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitSearch(); }
  });
  if (sbSend) sbSend.addEventListener('click', submitSearch);

  /* Rotating placeholder */
  var phrases = [
    'Stelle eine Frage\u2026',
    'Was ist ein Aktionspotential?',
    'Erkl\u00e4re die Nernst-Gleichung',
    'Welche Muskeln rotieren den Oberarm?',
    'Zusammenfassung Biochemie?'
  ];
  var phIdx = 0;
  if (phA) phA.textContent = phrases[0];
  setInterval(function(){
    if (!phA || !phB) return;
    if (sbInput.value || document.activeElement === sbInput) return;
    phIdx = (phIdx + 1) % phrases.length;
    phB.textContent = phrases[phIdx];
    phB.classList.remove('ap-ph--hidden');
    phA.classList.add('ap-ph--hidden');
    setTimeout(function(){
      phA.textContent = phrases[phIdx];
      phA.classList.remove('ap-ph--hidden');
      phB.classList.add('ap-ph--hidden');
    }, 500);
  }, 3000);

  /* Badge tier — read from Python-injected data attribute if present */
  var badge = document.getElementById('ap-wm-badge');
  if (badge) {
    var isPro = document.body.dataset.tier === 'pro';
    if (isPro) {
      badge.textContent = 'Pro';
      badge.className = 'ap-wm-badge ap-wm-badge--pro';
    }
    badge.onclick = function(){ window._apAction = {type:'upgradeBadge'}; };
  }

})();
"""
```

- [ ] **Step 2: Reload Anki, open deck browser — verify search bar**

Expected:
- Placeholder text "Stelle eine Frage…" visible in the pill
- Placeholder rotates every 3s (wait ~6s to see two rotations)
- Clicking pill focuses it: snake border animates, hint changes to "Senden Enter"
- Clicking elsewhere: hint reverts to "Fokussieren ⌘K" (or Ctrl+K on Windows)
- Typing text: send button (blue circle, right arrow) fades in
- Pressing Enter or clicking send button: chat overlay opens, user question shown as title, AI response streaming as prose

- [ ] **Step 3: Verify chat message style**

Expected:
- "Du" label in small uppercase gray
- Question text large (19px, bold, no bubble)
- AI response as flowing text, no border/background, blinking cursor while streaming, cursor disappears when done
- Follow-up via dock textarea still works

- [ ] **Step 4: Verify ⌘K shortcut**

Expected: Press ⌘K (Cmd+K on Mac, Ctrl+K on Windows/Linux) from anywhere on the deck browser — pill input gets focus, hint shows "Senden Enter", snake border activates.

- [ ] **Step 5: Commit**

```bash
git add "custom_screens.py"
git commit -m "feat(deck-browser): replace _CHAT_JS with new message style + search bar wiring"
```

---

## Task 4: Suppress `_account_widget()` on deck browser only

**Files:**
- Modify: `custom_screens.py` — `_wrap_page()` (line 656) and `_deck_browser_html()` (line 873)

`_wrap_page()` calls `_account_widget()` unconditionally at line 674. The Overview page needs the widget; the deck browser does not (wordmark badge replaces it).

- [ ] **Step 1: Add `show_account_widget` parameter to `_wrap_page()`**

Change the signature from:
```python
def _wrap_page(top_bar_html, content_html, extra_js=''):
```
to:
```python
def _wrap_page(top_bar_html, content_html, extra_js='', show_account_widget=True):
```

Change the body line that injects the widget (line ~674):
```python
f'{_account_widget()}'
```
to:
```python
f'{_account_widget() if show_account_widget else ""}'
```

- [ ] **Step 2: Pass `show_account_widget=False` in `_deck_browser_html()`**

In `_deck_browser_html()` (line ~892), change:
```python
return _wrap_page(top_bar, content, extra_js=_CHAT_JS)
```
to:
```python
return _wrap_page(top_bar, content, extra_js=_CHAT_JS, show_account_widget=False)
```

- [ ] **Step 3: Reload Anki — verify**

Expected:
- Deck browser: no "AnkiPlus / Free" button in bottom-right corner
- Overview page (click a deck to open overview): "AnkiPlus / Free" button still present in bottom-right

- [ ] **Step 4: Commit**

```bash
git add "custom_screens.py"
git commit -m "feat(deck-browser): suppress account widget on deck browser; keep on overview"
```

---

## Task 5: Handle `upgradeBadge` action in Python

**Files:**
- Modify: `custom_screens.py` — `_handle_action()` (line ~1010)

When the user clicks the wordmark badge, `window._apAction = {type:'upgradeBadge'}` is set. Python polls this and needs to open the settings/upgrade dialog.

- [ ] **Step 1: Add `upgradeBadge` branch in `_handle_action()`**

In `_handle_action()`, after the existing `elif action_type == 'cmd':` block (around line ~1045), add:

```python
elif action_type == 'upgradeBadge':
    # Open addon settings — same as 'cmd':'settings'
    try:
        from . import ui_setup
        if hasattr(ui_setup, 'show_settings'):
            ui_setup.show_settings()
        elif hasattr(mw, 'onPrefs'):
            mw.onPrefs()
    except Exception:
        if hasattr(mw, 'onPrefs'):
            mw.onPrefs()
```

- [ ] **Step 2: Reload Anki — verify**

Expected: Clicking the "Free" badge in the wordmark opens the addon settings/profile dialog (same as the existing AnkiPlus settings button behavior).

- [ ] **Step 3: Commit**

```bash
git add "custom_screens.py"
git commit -m "feat(deck-browser): handle upgradeBadge action to open settings"
```

---

## Task 6: Wire badge tier display from Python

**Files:**
- Modify: `custom_screens.py` — `_SEARCHBAR_HTML` constant and `_inject_deck_browser()`

Currently the badge always shows "Free" in the HTML. Python knows the tier via `_account_widget()`'s auth check. Pass this into the deck browser by setting a `data-tier` attribute on `<body>` — `_CHAT_JS` already reads `document.body.dataset.tier` (Task 3 step 1).

- [ ] **Step 1: Read tier in `_inject_deck_browser()`**

In `_inject_deck_browser()` (line ~1170), add tier detection immediately after the line `html = _deck_browser_html(...)` is currently set up — specifically after `total_review = sum(...)` and before the `html = _deck_browser_html(...)` call:

```python
# Determine tier for badge
is_premium = False
try:
    from .auth import get_auth_status
    auth_status = get_auth_status()
    is_premium = auth_status.get('isPremium', False) or auth_status.get('is_premium', False)
except Exception:
    pass
tier = 'pro' if is_premium else 'free'
```

- [ ] **Step 2: Pass tier into `_deck_browser_html()`**

Change the call in `_inject_deck_browser()` from:
```python
html = _deck_browser_html(tree, len(all_decks), total_new, total_learn, total_review)
```
to:
```python
html = _deck_browser_html(tree, len(all_decks), total_new, total_learn, total_review, tier=tier)
```

- [ ] **Step 3: Add `tier` parameter to `_deck_browser_html()`**

Change signature from:
```python
def _deck_browser_html(tree, total_decks, total_new=0, total_learn=0, total_review=0):
```
to:
```python
def _deck_browser_html(tree, total_decks, total_new=0, total_learn=0, total_review=0, tier='free'):
```

In the body, add `data-tier` to the body opening. The `<body>` tag is generated by `_wrap_page()` as:
```python
f'<body class="bg-base-100 text-base-content overflow-hidden m-0 p-0">'
```

The cleanest approach: inject a small inline script before `_CHAT_JS` to set `document.body.dataset.tier`:

In `_deck_browser_html()`, change:
```python
return _wrap_page(top_bar, content, extra_js=_CHAT_JS, show_account_widget=False)
```
to:
```python
tier_js = f'document.body.dataset.tier = "{tier}";'
return _wrap_page(top_bar, content, extra_js=tier_js + _CHAT_JS, show_account_widget=False)
```

- [ ] **Step 4: Reload Anki — verify**

Expected:
- Free account: badge shows "Free" in near-invisible style
- Pro account: badge shows "Pro" in blue (only testable with Pro credentials)

- [ ] **Step 5: Commit**

```bash
git add "custom_screens.py"
git commit -m "feat(deck-browser): wire tier badge (Free/Pro) from Python auth status"
```

---

## Done

All 6 tasks complete. The deck browser now has:
- Wordmark `Anki.plus [Free|Pro]` centered above the search bar
- Pill search bar with snake border, rotating placeholder, blue ArrowRight send button, contextual hint
- Chat messages in Style B (no bubbles — "Du" label + title + prose)
- Legacy account widget suppressed on deck browser only
- Badge click opens settings
- Tier-aware badge display
