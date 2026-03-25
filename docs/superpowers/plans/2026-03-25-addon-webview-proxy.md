# Addon WebView Proxy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mirror addon JS/CSS injections (AMBOSS, Meditricks, etc.) from Anki's native reviewer into our React QWebEngineView so term annotations, tooltips, and popups work in our app.

**Architecture:** Three components in one file: AddonContentCapture (records addon JS/CSS from webview_will_set_content), WebEvalProxy (mirrors reviewer.web's JS execution to our webview), PycmdBridge (window.pycmd in our webview relays to addon handlers). All generic — no addon-specific code.

**Tech Stack:** Python (PyQt6), Anki gui_hooks, JavaScript injection

**Spec:** `docs/superpowers/specs/2026-03-25-addon-webview-proxy-design.md`

**Security note:** `reviewer.web` methods are Anki's standard API for addon communication. ALL Anki addons use them (AMBOSS, AnkiHub, etc.). The proxy forwards the same trusted addon JS to a second webview — no user input is involved, no new attack surface introduced.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `ui/addon_proxy.py` | Create | All three proxy components: capture, proxy, asset injection |
| `__init__.py` | Modify | Register capture hook on startup, cleanup on close |
| `ui/widget.py` | Modify | Install proxy, inject assets when WebView loads |

---

### Task 1: Create addon_proxy.py with AddonContentCapture

**Files:**
- Create: `ui/addon_proxy.py`

- [ ] **Step 1: Create the file with AddonContentCapture class**

The class hooks into `webview_will_set_content` (runs AFTER other addons). It parses `web_content.body` to extract addon-injected assets:
- `<script src="/_addons/...">` tags — reads JS file from disk
- `<link rel="stylesheet" href="/_addons/...">` tags — reads CSS file from disk
- Inline `<style>` blocks from addons (containing "amboss", "marker", etc.)

Skips our own addon assets (folder names containing AnkiPlus_main/ankiplus/chatbot).

Resolves `/_addons/123/web/file.js` paths to filesystem paths via `mw.addonManager.addonsFolder()`.

Stores everything in `captured_assets` list with shape `{'type': 'js'|'css'|'style', 'content': str, 'src': str}`.

Only captures from Reviewer context (checks `type(context).__name__`).

Uses dual import pattern for logging:
```python
try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
```

- [ ] **Step 2: Commit**

```bash
git add ui/addon_proxy.py
git commit -m "feat: add AddonContentCapture for recording addon JS/CSS injections"
```

---

### Task 2: Add WebEvalProxy to addon_proxy.py

**Files:**
- Modify: `ui/addon_proxy.py`

- [ ] **Step 1: Add WebEvalProxy class**

The class wraps `mw.reviewer.web`'s JS execution method with a proxy:
- `install(target_webview)` — saves original method, installs proxy that runs JS in both native reviewer AND our webview
- `_mirror(js_code)` — runs JS in our webview, or queues if assets not yet loaded
- `mark_assets_loaded()` — called after addon assets are injected, flushes queue
- `uninstall()` — restores original method, cleans up

Uses a marker string `'/* __ankiplus_proxy__ */'` to detect and skip our own calls (prevents echo loops).

Queue: simple list, flushed when `mark_assets_loaded()` is called. Max ~5 entries per card typical.

**IMPORTANT**: AMBOSS specifically uses `reviewer.web.eval()` (Anki's `AnkiWebView.eval` method), NOT `page().runJavaScript()`. The proxy must wrap `reviewer.web.eval`.

- [ ] **Step 2: Add module-level singletons and inject function**

At the bottom of the file:
- `_capture = AddonContentCapture()` singleton
- `_proxy = WebEvalProxy()` singleton
- `get_capture()` and `get_proxy()` accessors
- `inject_addon_assets(webview)` function that:
  1. Defines `window.pycmd` function in the webview (bridge to ankiBridge.addMessage)
  2. Injects all captured JS by running content in page context
  3. Injects all captured CSS by creating `<style>` elements via JS
  4. Calls `_proxy.mark_assets_loaded()` to flush queue

- [ ] **Step 3: Commit**

```bash
git add ui/addon_proxy.py
git commit -m "feat: add WebEvalProxy + asset injection for addon interop"
```

---

### Task 3: Register Proxy in __init__.py

**Files:**
- Modify: `__init__.py`

- [ ] **Step 1: Register capture hook on startup**

Find the hook registration section (around line 728). Add BEFORE `profile_did_open`:

```python
# Addon Proxy — capture JS/CSS injected by other addons (AMBOSS, etc.)
try:
    from .ui.addon_proxy import get_capture
    gui_hooks.webview_will_set_content.append(get_capture().on_webview_content)
except Exception as e:
    logger.warning("Addon proxy registration failed: %s", e)
```

- [ ] **Step 2: Add cleanup on profile_will_close**

Find the existing `profile_will_close` handler. Add proxy cleanup:

```python
try:
    from .ui.addon_proxy import get_proxy
    get_proxy().uninstall()
except Exception:
    pass
```

- [ ] **Step 3: Commit**

```bash
git add __init__.py
git commit -m "feat: register addon proxy hooks on startup and cleanup"
```

---

### Task 4: Wire Proxy into Widget

**Files:**
- Modify: `ui/widget.py`

- [ ] **Step 1: Install WebEvalProxy on first card**

In `_send_card_data()` (around line 2015), add at the beginning:

```python
if not getattr(self, '_addon_proxy_installed', False):
    try:
        from .addon_proxy import get_proxy
        get_proxy().install(self.web_view)
        self._addon_proxy_installed = True
    except Exception as e:
        logger.warning("Addon proxy install failed: %s", e)
```

This installs the proxy the first time a card is shown (reviewer is now available).

- [ ] **Step 2: Inject addon assets after React app loads**

Find where the `init` payload is sent to the frontend (look for `_send_to_frontend('init', ...)` or where `window.ankiReceive` is called with init type). After that call, add:

```python
try:
    from .addon_proxy import inject_addon_assets
    inject_addon_assets(self.web_view)
except Exception as e:
    logger.warning("Addon asset injection failed: %s", e)
```

- [ ] **Step 3: Commit**

```bash
git add ui/widget.py
git commit -m "feat: wire addon proxy into widget (install + inject assets)"
```

---

### Task 5: Test and Verify

- [ ] **Step 1: Restart Anki and review AMBOSS cards**

Check Python console for:
- "AddonContentCapture: N assets captured from reviewer"
- "WebEvalProxy installed"
- "inject_addon_assets: N assets injected"

Check React WebView for:
- AMBOSS term annotations (underlined colored terms)
- Hover tooltip popup
- Click opens AMBOSS sidebar

- [ ] **Step 2: Test error cases**

- Non-AMBOSS deck: no errors, normal rendering
- AMBOSS not installed: no errors, no assets captured (graceful no-op)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: addon webview proxy complete — AMBOSS annotations in React view"
```
