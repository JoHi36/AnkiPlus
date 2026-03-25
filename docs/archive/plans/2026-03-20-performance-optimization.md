# Performance Optimization — Full Stack

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all UI freezes, stuttering, and performance bottlenecks across the Python/Qt backend and React frontend.

**Architecture:** The addon has two performance-critical layers: (1) Python/Qt where timers, pollers, and synchronous bridge calls block the main thread, and (2) React where missing memoization, redundant state updates, and expensive equality checks cause excessive re-renders. Fixes are independent per layer and can be parallelized.

**Tech Stack:** Python 3 / PyQt6 / QWebEngineView / React 18 / Vite

---

## File Map

| File | Changes |
|------|---------|
| `anki_global_theme.py` | Pre-compile regex, reduce restyle timer frequency |
| `__init__.py` | Consolidate QTimer cascades, guard Plusi reflection threads |
| `widget.py` | Increase polling interval |
| `overlay_chat.py` | Increase polling interval, skip poll when hidden |
| `bridge.py` | Cache `getCardDetails()` result |
| `card_tracker.py` | Move embedding to background (ThreadPoolExecutor) |
| `custom_reviewer/__init__.py` | Consolidate refocus/focus cascades |
| `frontend/src/components/StreamingChatMessage.jsx` | Stabilize steps/citations refs for memo equality |
| `frontend/src/components/ChatMessage.jsx` | Stabilize steps/citations refs for memo equality |
| `frontend/src/App.jsx` | Stabilize message props, extract normalizeMessages, debounce IntersectionObserver, stabilize idle timer |

---

## Task 1: Reduce Message Polling Interval (Quick Win)

**Files:**
- Modify: `widget.py:293`
- Modify: `overlay_chat.py:87`

- [ ] **Step 1: Change widget.py polling from 100ms to 200ms**

In `widget.py`, line 293, change:
```python
self.message_timer.start(100)  # Alle 100ms prüfen
```
to:
```python
self.message_timer.start(200)  # Alle 200ms prüfen
```

- [ ] **Step 2: Change overlay_chat.py polling from 100ms to 200ms**

In `overlay_chat.py`, line 87, change:
```python
self.message_timer.start(100)
```
to:
```python
self.message_timer.start(200)
```

- [ ] **Step 3: Verify overlay_chat skips polling when hidden**

In `overlay_chat.py`, line 91, confirm the early return exists:
```python
def _poll_messages(self):
    if not self.web_view or not self._visible:
        return
```
This is already correct — no change needed, just verify.

- [ ] **Step 4: Manual test**

Restart Anki. Send a message in the chat panel. Verify:
- Messages still appear immediately (200ms is imperceptible)
- No noticeable lag in message delivery
- CPU usage is lower during idle (check Activity Monitor)

- [ ] **Step 5: Commit**

```bash
git add widget.py overlay_chat.py
git commit -m "perf: reduce message polling from 100ms to 200ms (50% less overhead)"
```

---

## Task 2: Consolidate QTimer Cascades

**Files:**
- Modify: `__init__.py:700-713`
- Modify: `custom_reviewer/__init__.py:624-627`
- Modify: `custom_reviewer/__init__.py:860-863`

- [ ] **Step 1: Consolidate deckBrowser hide timers**

In `__init__.py`, lines 700-705, replace:
```python
# Hide DeckBrowser bottom bar when entering deckBrowser
# Multiple delays: Anki re-shows the bar after full render
if new_state == "deckBrowser":
    QTimer.singleShot(150, hide_deckbrowser_bottom)
    QTimer.singleShot(400, hide_deckbrowser_bottom)
    QTimer.singleShot(800, hide_deckbrowser_bottom)
```
with:
```python
# Hide DeckBrowser bottom bar — use longest delay as safety net
# (Anki re-shows the bar after full render, so we need to wait)
if new_state == "deckBrowser":
    QTimer.singleShot(800, hide_deckbrowser_bottom)
```

- [ ] **Step 2: Consolidate review hide timers**

In `__init__.py`, lines 707-713, replace:
```python
# Hide reviewer bottom bar immediately when entering review
# Multiple delays because Anki re-creates the bar after render
if new_state == "review":
    QTimer.singleShot(50, hide_native_bottom_bar)
    QTimer.singleShot(200, hide_native_bottom_bar)
    QTimer.singleShot(500, hide_native_bottom_bar)
    QTimer.singleShot(1000, hide_native_bottom_bar)
```
with:
```python
# Hide reviewer bottom bar — use longest delay as safety net
# (Anki re-creates the bar after render, needs time to settle)
if new_state == "review":
    QTimer.singleShot(1000, hide_native_bottom_bar)
```

- [ ] **Step 3: Consolidate custom_reviewer refocus cascade**

In `custom_reviewer/__init__.py`, lines 624-627, replace:
```python
# Multiple refocus attempts — Qt can steal focus at different times
QTimer.singleShot(30, _refocus)
QTimer.singleShot(100, _refocus)
QTimer.singleShot(250, _refocus)
```
with:
```python
# Single refocus after Qt settles
QTimer.singleShot(150, _refocus)
```

- [ ] **Step 4: Consolidate custom_reviewer chat focus cascade**

In `custom_reviewer/__init__.py`, lines 860-863, replace:
```python
# Multiple attempts with increasing delays
QTimer.singleShot(200, _focus_chat_textarea)
QTimer.singleShot(500, _focus_chat_textarea)
QTimer.singleShot(1000, _focus_chat_textarea)
```
with:
```python
# Single focus attempt after UI settles
QTimer.singleShot(400, _focus_chat_textarea)
```

- [ ] **Step 5: Manual test**

Restart Anki. Test these transitions:
- Switch from deck browser to review mode (answer should still be visible, bottom bar hidden)
- Switch back to deck browser (bottom bar hidden)
- Open the chat in review mode (textarea should get focus)
- If any bar flickers back: increase the single delay to 800ms

- [ ] **Step 6: Commit**

```bash
git add __init__.py custom_reviewer/__init__.py
git commit -m "perf: consolidate cascading QTimer delays into single calls"
```

---

## Task 3: Reduce Continuous Restyle Frequency

**Files:**
- Modify: `anki_global_theme.py:856-887`

- [ ] **Step 1: Increase continuous restyle interval from 5s to 15s**

15s is a compromise: still catches edge cases (dialog closes, preference resets) within a reasonable window, while reducing CPU overhead by 66% compared to 5s.

In `anki_global_theme.py`, line 881 and 887, change both occurrences of:
```python
_continuous_restyle_timer = create_safe_timer(5000, continuous_restyle)
```
to:
```python
_continuous_restyle_timer = create_safe_timer(15000, continuous_restyle)
```

- [ ] **Step 2: Ensure state_did_change still calls restyle immediately**

Verify that `on_state_change()` (line 847) still calls `apply_global_dark_theme()` directly. This ensures theme is applied on every state transition without waiting for the timer. The 15s timer is just a safety net for non-state-change style resets.

Already correct at line 847:
```python
apply_global_dark_theme()
```
No change needed here.

- [ ] **Step 3: Manual test**

Restart Anki. Verify:
- Dark theme still applies correctly on startup
- Switching between states (deckBrowser → review → overview) re-applies theme immediately
- No visual glitches or white flashes
- CPU usage significantly lower during idle

- [ ] **Step 4: Commit**

```bash
git add anki_global_theme.py
git commit -m "perf: increase continuous restyle interval from 5s to 15s"
```

---

## Task 4: Pre-Compile Regex Patterns in Hot Path

**Files:**
- Modify: `anki_global_theme.py:682-729`

- [ ] **Step 1: Add compiled regex patterns at module level**

After the existing module-level globals (around line 30, or wherever convenient near the top of the file after imports), add:

Uses the existing `import re` already present in the file (line 11). Do NOT add `import re as _re`.

```python
# Pre-compiled regex patterns for HTML processing (hot path)
_RE_HR = re.compile(r'<hr[^>]*/?>',  re.IGNORECASE)
_RE_BOTTOM_TABLE = re.compile(
    r'<div[^>]*id=["\']bottom["\'][^>]*>.*?<table[^>]*>.*?</table>.*?</div>',
    re.DOTALL | re.IGNORECASE
)
_RE_TABLE_INNER = re.compile(r'<table[^>]*>.*?</table>', re.DOTALL | re.IGNORECASE)
_RE_AMBOSS_LINKS = re.compile(
    r'<a[^>]*(?:href|title|class|id)=[^>]*(?:amboss|meditricks)[^>]*>.*?</a>',
    re.IGNORECASE | re.DOTALL
)
_RE_AMBOSS_IMGS = re.compile(
    r'<img[^>]*(?:src|alt|title|class|id)=[^>]*(?:amboss|meditricks)[^>]*/?>',
    re.IGNORECASE
)
_RE_AMBOSS_ELEMENTS = re.compile(
    r'<[^>]*(?:class|id|title)=[^>]*(?:amboss|meditricks)[^>]*>.*?</[^>]+>',
    re.IGNORECASE | re.DOTALL
)
_RE_BUTTON = re.compile(r'<button[^>]*>', re.IGNORECASE)
_RE_BUTTON_FIND = re.compile(r'<button[^>]*>.*?</button>', re.DOTALL | re.IGNORECASE)
_RE_INPUT_BUTTON = re.compile(r'<input[^>]*type=["\']button["\'][^>]*>', re.IGNORECASE)
_RE_STYLE_ATTR = re.compile(r'style=["\']([^"\']*)["\']')
```

- [ ] **Step 2: Replace inline regex calls with compiled versions**

In `on_webview_will_set_content()`, replace lines 682-729 with the compiled versions:

```python
html = _RE_HR.sub('', html)

def remove_table_keep_buttons(match):
    table_content = match.group(0)
    buttons = _RE_BUTTON_FIND.findall(table_content)
    buttons += _RE_INPUT_BUTTON.findall(table_content)
    return ''.join(buttons) if buttons else ''

html = _RE_BOTTOM_TABLE.sub(
    lambda m: _RE_TABLE_INNER.sub(remove_table_keep_buttons, m.group(0)),
    html
)

html = _RE_AMBOSS_LINKS.sub('', html)
html = _RE_AMBOSS_IMGS.sub('', html)
html = _RE_AMBOSS_ELEMENTS.sub('', html)

def style_button(match):
    button = match.group(0)
    if 'style=' in button:
        button = _RE_STYLE_ATTR.sub(
            lambda m: f'style="{m.group(1)} background: transparent !important; border: none !important; color: rgba(255, 255, 255, 0.7) !important;"',
            button
        )
    else:
        button = button.replace('>', ' style="background: transparent !important; border: none !important; color: rgba(255, 255, 255, 0.7) !important;">', 1)
    return button

html = _RE_BUTTON.sub(style_button, html)
```

- [ ] **Step 3: Manual test**

Restart Anki, go to review mode. Verify:
- Card content displays correctly
- No Amboss/Meditricks elements visible
- Buttons still styled correctly
- HR tags removed

- [ ] **Step 4: Commit**

```bash
git add anki_global_theme.py
git commit -m "perf: pre-compile regex patterns used in card HTML processing"
```

---

## Task 5: Cache getCardDetails() in Bridge

**Files:**
- Modify: `bridge.py:274-344`

- [ ] **Step 1: Add a simple LRU cache to getCardDetails**

At the top of the `WebBridge` class (or in `__init__`), add a cache dict:

```python
def __init__(self, widget):
    super().__init__()
    self.widget = widget
    self._card_details_cache = {}  # card_id -> (result_json, timestamp)
```

- [ ] **Step 2: Add cache lookup and TTL to getCardDetails**

Wrap the existing `getCardDetails` method body. Replace lines 275-344:

```python
@pyqtSlot(str, result=str)
def getCardDetails(self, card_id):
    """Lädt die Details einer Karte mit 10s Cache."""
    import time

    # Check cache (10 second TTL)
    cached = self._card_details_cache.get(card_id)
    if cached:
        result_json, ts = cached
        if time.time() - ts < 10:
            return result_json

    try:
        from aqt import mw
        if mw is None or mw.col is None:
            return json.dumps({"error": "No collection"})

        card_id_int = int(card_id)
        try:
            card = mw.col.get_card(card_id_int)
        except Exception:
            try:
                note = mw.col.get_note(card_id_int)
                cards = note.cards()
                if cards:
                    card = cards[0]
                else:
                    return json.dumps({"error": "No cards for note"})
            except Exception:
                return json.dumps({"error": "Card or Note not found"})

        if not card:
            return json.dumps({"error": "Card not found"})

        front = card.q()
        back = card.a()

        deck_name = "Unbekannt"
        try:
            deck = mw.col.decks.get(card.odid or card.did)
            if deck:
                deck_name = deck['name']
        except:
            pass

        model_name = "Unbekannt"
        try:
            note = card.note()
            model = note.model()
            model_name = model['name']
        except:
            pass

        result = json.dumps({
            "id": card_id_int,
            "front": front,
            "back": back,
            "deckName": deck_name,
            "modelName": model_name
        })

        # Cache result
        self._card_details_cache[card_id] = (result, time.time())

        # Limit cache size
        if len(self._card_details_cache) > 50:
            oldest_key = min(self._card_details_cache, key=lambda k: self._card_details_cache[k][1])
            del self._card_details_cache[oldest_key]

        return result

    except Exception as e:
        import traceback
        print(f"Fehler in getCardDetails: {e}")
        print(traceback.format_exc())
        return json.dumps({"error": str(e)})
```

- [ ] **Step 3: Manual test**

Restart Anki, enter review mode, switch between cards. Verify:
- Card details still load correctly
- Switching to the same card again is noticeably faster
- No stale data shown (cache expires after 10s)

- [ ] **Step 4: Commit**

```bash
git add bridge.py
git commit -m "perf: add 10s LRU cache to getCardDetails() to avoid repeated template rendering"
```

---

## Task 6: Move Card Embedding to Background Thread

**Files:**
- Modify: `card_tracker.py:188-198`

- [ ] **Step 1: Add a module-level ThreadPoolExecutor**

At the top of `card_tracker.py` (after imports), add:

```python
from concurrent.futures import ThreadPoolExecutor

# Single-worker executor for card embedding — serializes operations,
# prevents thread explosion when flipping cards rapidly
_embed_executor = ThreadPoolExecutor(max_workers=1)
```

Using `max_workers=1` ensures:
- Embedding calls are serialized (no concurrent access to shared state)
- Rapid card flipping queues embeddings instead of spawning threads
- No thread-safety issues with `ensure_embedded`

- [ ] **Step 2: Make ensure_embedded non-blocking**

In `card_tracker.py`, replace lines 188-198:

```python
# Lazy embed current card for semantic search (after UI update)
try:
    try:
        from . import get_embedding_manager
    except ImportError:
        from __init__ import get_embedding_manager
    emb_mgr = get_embedding_manager()
    if emb_mgr:
        emb_mgr.ensure_embedded(card.id, context)
except Exception:
    pass  # Don't block card display
```

with:

```python
# Embed current card in background (never block card display)
try:
    try:
        from . import get_embedding_manager
    except ImportError:
        from __init__ import get_embedding_manager
    emb_mgr = get_embedding_manager()
    if emb_mgr:
        _embed_executor.submit(emb_mgr.ensure_embedded, card.id, context)
except Exception:
    pass
```

- [ ] **Step 2: Manual test**

Restart Anki, enter review mode, flip through cards. Verify:
- Card display is never delayed by embedding
- Embeddings still work (test semantic search after a few cards)

- [ ] **Step 3: Commit**

```bash
git add card_tracker.py
git commit -m "perf: move card embedding to background thread to prevent blocking card display"
```

---

## Task 7: Guard Plusi Reflection Thread Spawning

**Files:**
- Modify: `__init__.py:520-529`

- [ ] **Step 1: Add thread-running guard and shared helper**

In `__init__.py`, add a guard variable near line 483 and a shared helper:

```python
_plusi_reflect_pending = False
_plusi_reflect_running = False  # Guard: prevent concurrent reflections

def _run_guarded_reflect():
    """Runs one reflection cycle with concurrency guard."""
    global _plusi_reflect_running
    _plusi_reflect_running = True
    try:
        _plusi_reflect_once()
    finally:
        _plusi_reflect_running = False
```

Note: `_plusi_reflect_once` is defined nearby (line 486), so `_run_guarded_reflect` must be placed after it.

- [ ] **Step 2: Update check_and_trigger_reflect to check guard**

Replace lines 520-526:
```python
def check_and_trigger_reflect():
    """Called after each Plusi interaction. If window is open, trigger reflect."""
    global _plusi_reflect_pending
    if _plusi_reflect_pending:
        _plusi_reflect_pending = False
        print("plusi reflect: triggered by interaction")
        threading.Thread(target=_plusi_reflect_once, daemon=True).start()
```

with:

```python
def check_and_trigger_reflect():
    """Called after each Plusi interaction. If window is open, trigger reflect."""
    global _plusi_reflect_pending
    if _plusi_reflect_pending and not _plusi_reflect_running:
        _plusi_reflect_pending = False
        print("plusi reflect: triggered by interaction")
        threading.Thread(target=_run_guarded_reflect, daemon=True).start()
```

- [ ] **Step 3: Also guard the startup reflect**

Replace line 529:
```python
threading.Thread(target=_plusi_reflect_once, daemon=True).start()
```

with:

```python
threading.Thread(target=_run_guarded_reflect, daemon=True).start()
```

- [ ] **Step 4: Commit**

```bash
git add __init__.py
git commit -m "perf: guard Plusi reflection to prevent concurrent thread spawning"
```

---

## Task 8: Stabilize steps/citations Refs and Fix Memo Equality

The problem: `JSON.stringify()` in `React.memo` equality checks is expensive during streaming. But simply switching to `===` would break memoization because the render path creates new objects via `steps={msg.steps || []}` (the `|| []` and `|| {}` fallbacks create new references every render).

**Solution:** Two-part fix: (1) stabilize the references at the render site so the same empty array/object is reused, then (2) switch memo equality to use `===`.

**Files:**
- Modify: `frontend/src/App.jsx` (render section where ChatMessage/StreamingChatMessage are used)
- Modify: `frontend/src/components/ChatMessage.jsx:1763-1772`
- Modify: `frontend/src/components/StreamingChatMessage.jsx:60-66`

- [ ] **Step 1: Add stable empty constants at file scope in App.jsx**

At the top of `App.jsx` (after imports, before component), add:

```javascript
// Stable empty references — prevent new object creation on every render
const EMPTY_STEPS = [];
const EMPTY_CITATIONS = {};
```

- [ ] **Step 2: Replace fallback expressions in render path**

Find all places in `App.jsx` where `steps` and `citations` are passed to `ChatMessage` or `StreamingChatMessage`. Replace:

```javascript
steps={msg.steps || []}
citations={msg.citations || {}}
```

with:

```javascript
steps={msg.steps || EMPTY_STEPS}
citations={msg.citations || EMPTY_CITATIONS}
```

There are multiple occurrences (around lines 2103-2104 and 2199-2200). Update ALL of them.

- [ ] **Step 3: Fix ChatMessage memo equality**

In `ChatMessage.jsx`, replace lines 1763-1772:

```javascript
const MemoizedChatMessage = React.memo(ChatMessage, (prevProps, nextProps) => {
  // Custom comparison - nur re-render wenn sich wichtige Props ändern
  // Verhindert Re-Renders während Streaming (wenn nur message sich ändert)
  return prevProps.message === nextProps.message &&
         prevProps.from === nextProps.from &&
         prevProps.isStreaming === nextProps.isStreaming &&
         prevProps.isLastMessage === nextProps.isLastMessage &&
         prevProps.cardContext === nextProps.cardContext &&
         JSON.stringify(prevProps.steps) === JSON.stringify(nextProps.steps) &&
         JSON.stringify(prevProps.citations) === JSON.stringify(nextProps.citations);
});
```

with:

```javascript
const MemoizedChatMessage = React.memo(ChatMessage, (prevProps, nextProps) => {
  return prevProps.message === nextProps.message &&
         prevProps.from === nextProps.from &&
         prevProps.isStreaming === nextProps.isStreaming &&
         prevProps.isLastMessage === nextProps.isLastMessage &&
         prevProps.cardContext === nextProps.cardContext &&
         prevProps.steps === nextProps.steps &&
         prevProps.citations === nextProps.citations;
});
```

- [ ] **Step 4: Fix StreamingChatMessage memo equality**

In `StreamingChatMessage.jsx`, replace lines 60-66:

```javascript
}, (prevProps, nextProps) => {
  // Custom comparison - nur re-render wenn message oder isStreaming sich ändert
  return prevProps.message === nextProps.message &&
         prevProps.isStreaming === nextProps.isStreaming &&
         prevProps.cardContext === nextProps.cardContext &&
         JSON.stringify(prevProps.steps) === JSON.stringify(nextProps.steps) &&
         JSON.stringify(prevProps.citations) === JSON.stringify(nextProps.citations);
});
```

with:

```javascript
}, (prevProps, nextProps) => {
  return prevProps.message === nextProps.message &&
         prevProps.isStreaming === nextProps.isStreaming &&
         prevProps.cardContext === nextProps.cardContext &&
         prevProps.steps === nextProps.steps &&
         prevProps.citations === nextProps.citations;
});
```

- [ ] **Step 5: Build and test**

```bash
cd frontend && npm run build
```

Restart Anki. Test streaming a response — verify:
- Streaming text renders correctly and smoothly
- Citations/sources still display after stream completes
- Steps (thought stream) still animate correctly
- Messages without steps/citations don't cause re-renders

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/ChatMessage.jsx frontend/src/components/StreamingChatMessage.jsx
git commit -m "perf: stabilize steps/citations refs and replace JSON.stringify with reference equality"
```

---

## Task 9: Deduplicate normalizeMessages in App.jsx

**Files:**
- Modify: `frontend/src/App.jsx:690-720, 1143-1170`

- [ ] **Step 1: Extract normalizeMessages helper**

At the top of the file (after imports, before component), add:

```javascript
function normalizeMessages(messages) {
  return messages.map(m => ({
    ...m,
    from: m.sender || m.from || 'user',
    sectionId: m.section_id || m.sectionId,
    createdAt: m.created_at || m.createdAt,
    steps: typeof m.steps === 'string' ? JSON.parse(m.steps || '[]') : (m.steps || []),
    citations: typeof m.citations === 'string' ? JSON.parse(m.citations || '{}') : (m.citations || {}),
  }));
}

function normalizeSections(sections) {
  return sections.map(s => ({
    ...s,
    cardId: s.card_id || s.cardId,
    createdAt: s.created_at || s.createdAt,
    performanceType: s.performance_type || s.performanceType,
    performanceData: typeof s.performance_data === 'string'
      ? JSON.parse(s.performance_data || 'null')
      : (s.performance_data || s.performanceData || null),
  }));
}
```

- [ ] **Step 2: Replace first occurrence (ankiReceive handler, ~line 690)**

Replace the inline `data.messages.map(...)` block (lines 690-719) with:

```javascript
if (data && data.messages && data.messages.length > 0) {
  _chat.setMessages(normalizeMessages(data.messages));
} else if (data && (!data.messages || data.messages.length === 0)) {
  _chat.setMessages([]);
}
if (data && data.sections) {
  const normalized = normalizeSections(data.sections);
  _cardCtx.setSections(normalized);
  if (normalized.length > 0) {
    _cardCtx.setCurrentSectionId(normalized[normalized.length - 1].id);
  } else {
    _cardCtx.setCurrentSectionId(null);
  }
}
```

- [ ] **Step 3: Replace second occurrence (CustomEvent handler, ~line 1143)**

Replace the duplicate block (lines 1142-1170) with the same pattern:

```javascript
const data = payload.data || payload;
if (data && data.messages && data.messages.length > 0) {
  _chat.setMessages(normalizeMessages(data.messages));
} else if (data && (!data.messages || data.messages.length === 0)) {
  _chat.setMessages([]);
}
if (data && data.sections) {
  const normalized = normalizeSections(data.sections);
  _cardCtx.setSections(normalized);
  if (normalized.length > 0) {
    _cardCtx.setCurrentSectionId(normalized[normalized.length - 1].id);
  } else {
    _cardCtx.setCurrentSectionId(null);
  }
}
```

- [ ] **Step 4: Build and test**

```bash
cd frontend && npm run build
```

Restart Anki, switch between cards. Verify:
- Session data loads correctly (messages, sections)
- Section titles display properly
- No double-loading or flickering

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "refactor: extract normalizeMessages/normalizeSections helpers, remove duplication"
```

---

## Task 10: Debounce IntersectionObserver for Lazy Message Loading

**Files:**
- Modify: `frontend/src/App.jsx:1876-1898`

- [ ] **Step 1: Add debounce to the IntersectionObserver callback**

Replace lines 1876-1898:

```javascript
// Performance: Intersection Observer for loading more messages when scrolling up
useEffect(() => {
    if (!messagesContainerRef.current || !loadMoreTriggerRef.current) return;
    if (chatHook.messages.length <= visibleMessageCount) return; // All messages already visible

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Load 20 more messages
            setVisibleMessageCount((prev) => Math.min(prev + 20, chatHook.messages.length));
          }
        });
      },
      { root: messagesContainerRef.current, rootMargin: '200px' }
    );

    observer.observe(loadMoreTriggerRef.current);

    return () => {
      observer.disconnect();
    };
  }, [visibleMessageCount, chatHook.messages.length]);
```

with:

```javascript
// Performance: Intersection Observer for loading more messages when scrolling up
useEffect(() => {
    if (!messagesContainerRef.current || !loadMoreTriggerRef.current) return;
    if (chatHook.messages.length <= visibleMessageCount) return;

    let debounceTimer = null;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !debounceTimer) {
            debounceTimer = setTimeout(() => {
              setVisibleMessageCount((prev) => Math.min(prev + 20, chatHook.messages.length));
              debounceTimer = null;
            }, 150);
          }
        });
      },
      { root: messagesContainerRef.current, rootMargin: '200px' }
    );

    observer.observe(loadMoreTriggerRef.current);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      observer.disconnect();
    };
  }, [visibleMessageCount, chatHook.messages.length]);
```

- [ ] **Step 2: Build and test**

```bash
cd frontend && npm run build
```

Restart Anki, open a chat with 50+ messages. Scroll up rapidly. Verify:
- Messages load smoothly without jank
- No rapid-fire state updates visible in React DevTools

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "perf: debounce IntersectionObserver for lazy message loading"
```

---

## Task 11: Stabilize Idle Timer Event Listeners

**Files:**
- Modify: `frontend/src/App.jsx:337-351`

- [ ] **Step 1: Remove resetIdleTimer from useEffect dependency**

The problem: `resetIdleTimer` is a `useCallback` that depends on `setEventMood`, which can change. Every time it changes, the event listeners are torn down and re-registered.

Replace lines 337-351:

```javascript
const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => setEventMood('sleepy'), 10 * 60 * 1000);
  }, [setEventMood]);

  useEffect(() => {
    window.addEventListener('mousedown', resetIdleTimer);
    window.addEventListener('keydown', resetIdleTimer);
    resetIdleTimer();
    return () => {
      window.removeEventListener('mousedown', resetIdleTimer);
      window.removeEventListener('keydown', resetIdleTimer);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [resetIdleTimer]);
```

with:

```javascript
const setEventMoodRef = useRef(setEventMood);
  useEffect(() => { setEventMoodRef.current = setEventMood; }, [setEventMood]);

  useEffect(() => {
    const resetIdle = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => setEventMoodRef.current('sleepy'), 10 * 60 * 1000);
    };
    window.addEventListener('mousedown', resetIdle);
    window.addEventListener('keydown', resetIdle);
    resetIdle();
    return () => {
      window.removeEventListener('mousedown', resetIdle);
      window.removeEventListener('keydown', resetIdle);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []); // stable — runs once
```

- [ ] **Step 2: Build and test**

```bash
cd frontend && npm run build
```

Restart Anki. Verify:
- After 10 minutes of inactivity, mascot still changes to sleepy
- Mouse/keyboard activity resets the timer
- No unnecessary event listener churn in console

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "perf: stabilize idle timer listeners to prevent constant re-registration"
```

---

## Task 12: Final Integration Test

- [ ] **Step 1: Full build**

```bash
cd frontend && npm run build
```

- [ ] **Step 2: Restart Anki and test all scenarios**

Test checklist:
1. App starts without freezing
2. Dark theme applies on startup
3. Switching to deck browser — no freeze, bottom bar hidden
4. Switching to review — no freeze, bottom bar hidden
5. Sending a chat message — no hang, response streams smoothly
6. Switching between cards — instant, no lag
7. Scrolling through long chat history — smooth
8. Tab switching in chat — no loading indicator freeze
9. Opening/closing chat panel — responsive
10. Plusi interactions — no concurrent thread issues

- [ ] **Step 3: Commit all remaining changes (if any)**

```bash
git add -A
git commit -m "perf: full performance optimization pass — polling, timers, memoization, caching"
```
