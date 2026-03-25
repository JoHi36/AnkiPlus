# Addon WebView Proxy — Design Spec

**Date:** 2026-03-25
**Status:** Draft
**Scope:** Generic addon interop — mirror JS/CSS injections and web.eval() from native reviewer into our React QWebEngineView

---

## Problem

Anki addons like AMBOSS, Meditricks, etc. annotate card content (hover tooltips, clickable term links, overlays) by injecting JavaScript/CSS into Anki's native reviewer webview. Our React app runs in a separate QWebEngineView — addon injections don't reach it.

Medical students (primary target audience) actively use AMBOSS hover/click features. Without them, the app loses a critical learning tool.

## Solution

A generic proxy that mirrors addon injections from the native reviewer into our React WebView. No addon-specific logic — works with any addon that uses Anki's standard hooks.

## Architecture

### Three Components

#### 1. AddonContentCapture (`ui/addon_proxy.py`)

Hooks into `webview_will_set_content` with low priority (runs AFTER all addons have injected their content). Parses `web_content.body` to extract:
- `<script src="/_addons/...">` tags — JS file paths
- `<link rel="stylesheet" href="/_addons/...">` tags — CSS file paths
- Inline `<style>` blocks added by addons

Stores captured assets in a list. These are loaded into our WebView when the React app initializes.

#### 2. WebEvalProxy (`ui/addon_proxy.py`)

Wraps `mw.reviewer.web.page().runJavaScript()` using a simple proxy pattern. Every JS execution on the native reviewer also runs in our React WebView.

Note on security: `web.runJavaScript()` / `web.page().runJavaScript()` is Anki's standard API for addon communication — it's how ALL Anki addons work (AMBOSS, AnkiHub, etc.). The proxy simply forwards the same trusted addon JS to a second webview. No user input is evaluated, no new attack surface is introduced.

Safeguards:
- Skip if our WebView isn't ready (queue for later)
- Tag our own calls to prevent echo loops
- Restore original on addon cleanup (profile_will_close)

#### 3. PycmdBridge (JavaScript, in our WebView)

Defines `window.pycmd()` so addon JS can communicate back to Python:

```javascript
window.pycmd = function(cmd, callback) {
    window.ankiBridge.addMessage('pycmd', cmd);
};
```

Already partially built — `_msg_pycmd` handler exists in widget.py. Relays to Anki's native reviewer where addon handlers process the command.

### Data Flow

```
Addon Setup (once per session):
  webview_will_set_content fires
  -> Addons inject their JS/CSS into web_content.body
  -> AddonContentCapture records all injected asset paths
  -> Assets loaded into our React WebView

Per Card:
  reviewer_did_show_question fires
  -> AMBOSS calls reviewer.web to run "mark({...})" on phrases
  -> WebEvalProxy intercepts
  -> Same JS runs in our React WebView
  -> Terms appear annotated in both views

User Interaction:
  User hovers/clicks annotated term in our React view
  -> Addon JS calls pycmd("amboss:reviewer:tooltip")
  -> PycmdBridge relays to Python
  -> AMBOSS handler processes request
  -> AMBOSS calls reviewer.web to run "setContentFor(...)" for tooltip
  -> WebEvalProxy mirrors to our WebView
  -> Tooltip appears in our app
```

### Asset Loading

When our React WebView loads, we inject captured addon assets by reading the JS/CSS files from disk and running them in the page context. This happens BEFORE any card is rendered, so addon JS is ready when annotation calls arrive.

### Timing / Queue

If the native reviewer triggers JS before our WebView has loaded assets:
- Queue the JS string
- Flush queue after assets are loaded
- Simple list, max ~5 entries per card

### Scope

- **Generic** — works with any addon using webview_will_set_content + reviewer.web
- **All views** — ReviewerView + CardPreviewModal
- **Togglable** — config flag `addon_proxy_enabled` (default: true)
- **Known compatible addons**: AMBOSS (1044112126), Meditricks, any future annotation addon

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `ui/addon_proxy.py` | Create | AddonContentCapture + WebEvalProxy (~80 lines) |
| `ui/widget.py` | Modify | Initialize proxy, inject assets on WebView load |
| `ui/widget.py` | Modify | Extend _msg_pycmd to handle addon callbacks |
| `__init__.py` | Modify | Register proxy hooks on profile_did_open |

### Files NOT Modified

- `frontend/` — No React changes needed. pycmd bridge already exists via ankiBridge.
- `ui/bridge.py` — pycmd handler already registered
- Addon files — We never touch other addons

### Risk Assessment

- **Low risk**: Asset capture — read-only parsing of already-injected content
- **Low risk**: WebEvalProxy — standard proxy pattern, restorable
- **Low risk**: pycmd relay — already implemented and tested
- **Medium risk**: Timing — JS call before assets loaded. Mitigated by queue.
- **Low risk**: Performance — 1-2 JS calls per card, microseconds
