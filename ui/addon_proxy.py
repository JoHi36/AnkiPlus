"""
addon_proxy.py — Capture, proxy, and inject third-party addon assets into our QWebEngineView.

Other Anki addons (e.g. AMBOSS) inject JS/CSS into Anki's native reviewer to annotate card
content with hover tooltips and clickable term links.  This module mirrors those injections into
our React QWebEngineView so the annotations also appear there.

Three components:

1. AddonContentCapture  – hooks webview_will_set_content, extracts addon scripts/styles.
2. WebEvalProxy         – wraps reviewer.web.eval() so JS evals are mirrored to our webview.
3. Module-level helpers – singletons, inject_addon_assets().
"""

import json
import os
import re

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Marker injected into mirrored JS so the proxy can skip its own calls.
_PROXY_MARKER = "/* __ankiplus_proxy__ */"

# JS prefixes that are Anki's own reviewer internals — NEVER mirror these.
# They reference functions/DOM that only exist in Anki's native webview.
_ANKI_INTERNAL_PREFIXES = (
    '_show', '_draw', '_update', '_toggle',  # Anki reviewer functions
    'document.body.style',                    # Direct DOM manipulation
    'window.anki',                            # Our own card_tracker injections
    'pycmd(',                                 # pycmd calls from native reviewer
    '/**',                                    # Our own Premium/MC JS injections
)


def _should_mirror(js_code):
    """Return True if this JS call should be mirrored to our webview.
    Only mirrors addon calls (ambossAddon.*, meditricks.*, etc.).
    Skips Anki internal reviewer JS and our own injections.
    """
    if not js_code:
        return False
    stripped = js_code.lstrip()
    # Skip known Anki internals
    for prefix in _ANKI_INTERNAL_PREFIXES:
        if stripped.startswith(prefix):
            return False
    # Skip very large payloads (likely _showQuestion HTML dumps)
    if len(js_code) > 5000:
        return False
    # Mirror everything else — addon calls like ambossAddon.*, meditricks.*, etc.
    return True

# Addon folder names that belong to this addon — skip them when capturing.
_OWN_ADDON_NAMES = {"AnkiPlus_main", "ankiplus", "chatbot"}

# Inline <style> blocks are only captured when their text contains one of these keywords.
_STYLE_KEYWORDS = ("amboss", "marker", "meditricks")

# Pattern that identifies an addon path in a URL: /_addons/<id>/...
_ADDON_PATH_RE = re.compile(r"^/_addons/([^/]+)/(.+)$")


# ---------------------------------------------------------------------------
# 1. AddonContentCapture
# ---------------------------------------------------------------------------

class AddonContentCapture:
    """
    Hooks into ``webview_will_set_content`` (called *after* other addons have injected
    their content) and extracts third-party addon JS/CSS assets so they can be
    re-injected into our own QWebEngineView.
    """

    def __init__(self):
        self.captured_assets: list = []

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def on_webview_will_set_content(self, web_content, context):
        """
        Hook handler.  Call this from the ``webview_will_set_content`` Anki hook.

        Only processes Reviewer contexts; silently ignores everything else.
        When assets are first captured, immediately injects them into our webview.
        """
        context_type = type(context).__name__
        if "Reviewer" not in context_type:
            logger.debug(
                "addon_proxy: skipping non-reviewer context %s", context_type
            )
            return

        body = web_content.body or ""
        new_assets = self._extract_assets(body)

        if new_assets:
            had_assets_before = bool(self.captured_assets)
            self.captured_assets = new_assets
            logger.info(
                "addon_proxy: captured %s addon asset(s) from reviewer body",
                len(new_assets),
            )
            # On first capture, immediately inject into our webview
            if not had_assets_before and _proxy._our_webview is not None:
                logger.info("addon_proxy: first capture — injecting assets now")
                inject_addon_assets(_proxy._our_webview)
        else:
            logger.debug("addon_proxy: no third-party addon assets found in reviewer body")

    def get_assets(self):
        """Return the list of captured asset dicts (may be empty)."""
        return list(self.captured_assets)

    def has_assets(self):
        """Return True if at least one asset has been captured."""
        return bool(self.captured_assets)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _extract_assets(self, body):
        """Parse *body* HTML and return a list of asset dicts."""
        assets = []

        # --- External script tags: <script src="/_addons/..."> ---
        for m in re.finditer(
            r'<script[^>]+src=["\']([^"\']+)["\'][^>]*>', body, re.IGNORECASE
        ):
            src = m.group(1)
            if self._is_own_addon(src):
                logger.debug("addon_proxy: skipping own addon script %s", src)
                continue
            content = self._read_addon_file(src)
            if content is not None:
                assets.append({"type": "js", "content": content, "src": src})
                logger.debug("addon_proxy: captured JS asset %s", src)

        # --- External stylesheet links: <link rel="stylesheet" href="/_addons/..."> ---
        for m in re.finditer(
            r'<link[^>]+href=["\']([^"\']+)["\'][^>]*>', body, re.IGNORECASE
        ):
            href = m.group(1)
            # Only stylesheet links
            rel_match = re.search(r'rel=["\']([^"\']+)["\']', m.group(0), re.IGNORECASE)
            if rel_match and "stylesheet" not in rel_match.group(1).lower():
                continue
            if self._is_own_addon(href):
                logger.debug("addon_proxy: skipping own addon stylesheet %s", href)
                continue
            content = self._read_addon_file(href)
            if content is not None:
                assets.append({"type": "css", "content": content, "src": href})
                logger.debug("addon_proxy: captured CSS asset %s", href)

        # --- Inline <style> blocks that look addon-related ---
        for m in re.finditer(
            r'<style[^>]*>(.*?)</style>', body, re.IGNORECASE | re.DOTALL
        ):
            style_text = m.group(1)
            if any(kw in style_text.lower() for kw in _STYLE_KEYWORDS):
                assets.append({"type": "style", "content": style_text, "src": "(inline)"})
                logger.debug(
                    "addon_proxy: captured inline style block (%s chars)", len(style_text)
                )

        return assets

    def _is_own_addon(self, url):
        """Return True if *url* refers to one of our own addon folders."""
        m = _ADDON_PATH_RE.match(url)
        if not m:
            return False
        folder_name = m.group(1)
        return folder_name.lower() in {n.lower() for n in _OWN_ADDON_NAMES}

    def _read_addon_file(self, url):
        """
        Resolve ``/_addons/<id>/web/file.ext`` to an absolute filesystem path
        and read its contents.  Returns ``None`` on any error.
        """
        m = _ADDON_PATH_RE.match(url)
        if not m:
            logger.debug("addon_proxy: URL does not match addon pattern: %s", url)
            return None

        addon_id = m.group(1)
        relative_path = m.group(2)  # e.g. "web/file.js"

        try:
            from aqt import mw  # type: ignore
            addons_folder = mw.addonManager.addonsFolder()
            file_path = os.path.join(addons_folder, addon_id, relative_path)
            file_path = os.path.normpath(file_path)

            with open(file_path, "r", encoding="utf-8") as fh:
                return fh.read()
        except FileNotFoundError:
            logger.warning("addon_proxy: addon file not found on disk: %s", url)
            return None
        except Exception:
            logger.exception("addon_proxy: failed to read addon file %s", url)
            return None


# ---------------------------------------------------------------------------
# 2. WebEvalProxy
# ---------------------------------------------------------------------------

class WebEvalProxy:
    """
    Wraps ``mw.reviewer.web.eval()`` so that JS evaluated by third-party addons
    (notably AMBOSS, which calls ``reviewer.web.eval()``) is also mirrored into
    our QWebEngineView.

    Note: eval() usage here is intentional — we are wrapping Anki's own
    reviewer.web.eval() interface which executes arbitrary JS in a WebEngine
    page.  There is no safer alternative for this interop layer.
    """

    def __init__(self):
        self._original_eval = None
        self._our_webview = None
        self._installed = False
        self._queue = []
        self._assets_loaded = False

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def install(self, target_webview):
        """
        Replace ``reviewer.web.eval`` with our proxy.

        *target_webview* is our QWebEngineView that should receive mirrored JS.
        """
        try:
            from aqt import mw  # type: ignore
            reviewer_web = mw.reviewer.web
        except Exception:
            logger.warning("addon_proxy: could not access mw.reviewer.web — proxy not installed")
            return

        if self._installed:
            logger.debug("addon_proxy: WebEvalProxy already installed; skipping")
            return

        self._our_webview = target_webview
        self._original_eval = reviewer_web.eval

        proxy_self = self

        def _proxy_eval(js_code):
            # Always call the real eval first (don't break the native reviewer).
            proxy_self._original_eval(js_code)
            # Skip our own injections (prevent loops)
            if _PROXY_MARKER in js_code:
                return
            # Only mirror addon-related calls — skip Anki's own reviewer JS
            # which would crash in our React webview (no _showQuestion etc.)
            if _should_mirror(js_code):
                logger.debug("addon_proxy: mirroring (%d chars): %s",
                             len(js_code), js_code[:80].replace('\n', ' '))
                proxy_self._mirror(js_code)

        reviewer_web.eval = _proxy_eval
        self._installed = True
        logger.info("addon_proxy: WebEvalProxy installed on reviewer.web.eval")

    def mark_assets_loaded(self):
        """
        Signal that addon assets have been injected into our webview.
        Flushes any queued JS calls.
        """
        self._assets_loaded = True
        if self._queue:
            logger.info(
                "addon_proxy: flushing %s queued JS calls after assets loaded",
                len(self._queue),
            )
            for js_code in self._queue:
                self._run_in_our_webview(js_code)
            self._queue.clear()

    def uninstall(self):
        """Restore the original ``reviewer.web.eval``."""
        if not self._installed:
            return
        try:
            from aqt import mw  # type: ignore
            mw.reviewer.web.eval = self._original_eval
            logger.info("addon_proxy: WebEvalProxy uninstalled")
        except Exception:
            logger.exception("addon_proxy: failed to uninstall WebEvalProxy")
        finally:
            self._installed = False
            self._original_eval = None

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _mirror(self, js_code):
        """Mirror addon JS calls into our webview.

        For mark() calls: instead of running AMBOSS's DOM manipulation
        (which doesn't work in React's context), we parse the phrase data
        and send it to React via ankiReceive for our own marking.
        """
        if not self._assets_loaded:
            self._queue.append(js_code)
            return

        # Intercept mark() calls — extract phrase data, send to React
        if 'phraseMarker.mark(' in js_code:
            self._send_phrases_to_react(js_code)
            return

        # Intercept setContentFor() — tooltip content for clicked terms
        if 'setContentFor(' in js_code:
            self._send_tooltip_to_react(js_code)
            return

        # All other addon calls: run directly
        self._run_in_our_webview(js_code)

    def _send_phrases_to_react(self, js_code):
        """Parse phrase pairs from mark() call and send to React."""
        # Extract JSON from: ambossAddon.tooltip.phraseMarker.mark({"term": "id", ...})
        start = js_code.find('mark(')
        if start == -1:
            return
        start += 5  # skip 'mark('
        end = js_code.rfind(')')
        if end <= start:
            return
        json_str = js_code[start:end]

        try:
            phrases = json.loads(json_str)
        except (json.JSONDecodeError, ValueError):
            logger.warning("addon_proxy: failed to parse mark() JSON: %s", json_str[:100])
            return

        if not phrases or not isinstance(phrases, dict):
            return

        # Send to React as ankiReceive event
        payload = json.dumps({
            "type": "addon.phrases",
            "data": {"phrases": phrases, "source": "amboss"}
        })
        js = "if(window.ankiReceive)window.ankiReceive(%s);" % payload
        from PyQt6.QtCore import QTimer
        QTimer.singleShot(300, lambda: self._run_in_our_webview(js))
        logger.debug("addon_proxy: sent %d phrases to React", len(phrases))

    def _send_tooltip_to_react(self, js_code):
        """Forward tooltip content to React (future use)."""
        # TODO: parse setContentFor() and send tooltip HTML to React
        logger.debug("addon_proxy: tooltip content intercepted (not yet forwarded)")

    def _run_in_our_webview(self, js_code):
        """Execute *js_code* in our QWebEngineView."""
        if self._our_webview is None:
            logger.warning("addon_proxy: no target webview; cannot mirror JS")
            return
        try:
            # Wrap with marker so the proxy skips this call on re-entry.
            wrapped = "{marker}\n{code}".format(marker=_PROXY_MARKER, code=js_code)
            self._our_webview.page().runJavaScript(wrapped)
        except Exception:
            logger.exception("addon_proxy: error running mirrored JS in our webview")


# ---------------------------------------------------------------------------
# 3. Module-level singletons and helpers
# ---------------------------------------------------------------------------

_capture = AddonContentCapture()
_proxy = WebEvalProxy()


def get_capture():
    """Return the module-level AddonContentCapture singleton."""
    return _capture


def get_proxy():
    """Return the module-level WebEvalProxy singleton."""
    return _proxy


def set_target_webview(webview):
    """Store a reference to our React QWebEngineView for later injection."""
    _proxy._our_webview = webview
    logger.debug("addon_proxy: target webview set")


def inject_addon_assets(webview):
    """
    Inject all captured third-party addon assets into *webview* (our QWebEngineView).

    Steps:
    1. Define ``window.pycmd`` so addon JS can communicate back through our bridge.
    2. Inject captured JS files (run via ``page().runJavaScript()``).
    3. Inject captured CSS files / inline styles (create ``<style>`` elements via JS).
    4. Mark assets as loaded so the WebEvalProxy flushes its queue.
    """
    page = webview.page()

    # 1. Shim window.pycmd — AMBOSS and other addons call pycmd() to signal
    #    back to Python.  We route those calls through our bridge message queue.
    pycmd_shim = (
        "window.pycmd = function(cmd, cb) {"
        "  if (window.ankiBridge && window.ankiBridge.addMessage) {"
        "    window.ankiBridge.addMessage('pycmd',"
        "      typeof cmd === 'string' ? cmd : String(cmd));"
        "  }"
        "  if (cb) setTimeout(function(){ cb(true); }, 0);"
        "};"
    )
    try:
        page.runJavaScript(pycmd_shim)
        logger.debug("addon_proxy: window.pycmd shim injected")
    except Exception:
        logger.exception("addon_proxy: failed to inject window.pycmd shim")

    # 2 & 3. Inject assets in capture order so dependencies are respected.
    assets = _capture.get_assets()
    if not assets:
        logger.debug("addon_proxy: no addon assets to inject")
        _proxy.mark_assets_loaded()
        return

    for asset in assets:
        asset_type = asset["type"]
        content = asset["content"]
        src = asset["src"]

        if asset_type == "js":
            _inject_js(page, content, src)
        elif asset_type in ("css", "style"):
            _inject_css(page, content, src)
        else:
            logger.warning("addon_proxy: unknown asset type %s from %s", asset_type, src)

    logger.info("addon_proxy: injected %s addon asset(s) into our webview", len(assets))

    # 4. Signal assets are loaded — flushes queued eval() mirrors.
    _proxy.mark_assets_loaded()


# ---------------------------------------------------------------------------
# Private injection helpers
# ---------------------------------------------------------------------------

def _inject_js(page, content, src):
    """Inject JS by creating a <script> element in the page DOM.
    This mimics how the script originally loads in Anki's reviewer
    (as a <script> tag), which is critical for webpack bundles that
    rely on proper script execution context.
    """
    try:
        js_escaped = json.dumps(content)
        src_escaped = json.dumps(src)
        loader = (
            "(function() {{"
            "  var s = document.createElement('script');"
            "  s.setAttribute('data-addon-src', {src});"
            "  s.textContent = {js};"
            "  document.head.appendChild(s);"
            "  if (window.ankiBridge && window.ankiBridge.addMessage) {{"
            "    window.ankiBridge.addMessage('jsError',"
            "      'addon_proxy: loaded ' + {src} + ', ambossAddon exists: ' + (typeof window.ambossAddon !== \"undefined\"));"
            "  }}"
            "}})();"
        ).format(js=js_escaped, src=src_escaped)
        page.runJavaScript(loader)
        logger.debug("addon_proxy: injected JS via <script> tag from %s", src)
    except Exception:
        logger.exception("addon_proxy: failed to inject JS from %s", src)


def _inject_css(page, content, src):
    """
    Inject CSS *content* into the document by creating a ``<style>`` element via JS.
    The CSS text is JSON-encoded to prevent injection issues.
    """
    # json.dumps gives us a safe JS string literal (handles quotes, newlines, etc.)
    css_literal = json.dumps(content)
    src_literal = json.dumps(src)
    js = (
        "(function() {{"
        "  var s = document.createElement('style');"
        "  s.setAttribute('data-addon-src', {src});"
        "  s.textContent = {css};"
        "  document.head.appendChild(s);"
        "}})();"
    ).format(src=src_literal, css=css_literal)
    try:
        page.runJavaScript(js)
        logger.debug("addon_proxy: injected CSS from %s", src)
    except Exception:
        logger.exception("addon_proxy: failed to inject CSS from %s", src)
