"""
Plusi Dock — Injectable HTML/CSS/JS for the main Anki window.
Renders the Plusi mascot character as a fixed-position element in the
bottom-left corner of the reviewer and deck browser webviews.

Features:
- 48px animated Plusi character (same CSS as MascotCharacter.jsx)
- Single-click: toggle diary panel; double-click: open chat
- Event bubbles (card correct/wrong, streaks)
- Mood system (neutral/happy/empathy/excited + animations)
- Communication via pycmd() in reviewer, window._apAction in deck browser
"""

import json
import os

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

_FACES_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'shared', 'assets', 'plusi-faces.json')

def get_faces_dict():
    """Return the FACES dict with SVG inner HTML strings for each mood.
    Loaded from shared/assets/plusi-faces.json — single source of truth."""
    with open(_FACES_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)


# ═══════════════════════════════════════════════════
# CSS — MascotCharacter port (exact copy from React)
# ═══════════════════════════════════════════════════

PLUSI_CSS = """
/* ── Plusi Dock Container ── */
#plusi-dock {
  position: fixed;
  bottom: 28px;
  left: 28px;
  z-index: 9999;
  display: flex;
  align-items: flex-end;
  gap: 12px;
  pointer-events: auto;
}

/* Parent animation classes */
#plusi-dock.pd-float  { animation: pd-float 3.5s ease-in-out infinite; }
#plusi-dock.pd-bounce { animation: pd-bounce 0.55s ease-in-out infinite alternate; }
#plusi-dock.pd-droop  { animation: pd-droop 4s ease-in-out infinite; }

@keyframes pd-float  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
@keyframes pd-bounce { 0%{transform:translateY(0)} 100%{transform:translateY(-6px)} }
@keyframes pd-droop  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(2px)} }

#plusi-dock-char {
  cursor: pointer;
  flex-shrink: 0;
  width: 48px;
  height: 48px;
}

/* ── Mascot Character (48px) ── */
.mascot-body { position: relative; width: 48px; height: 48px; transition: opacity 0.3s; }

.mascot-float    { animation: m-float 3.5s ease-in-out infinite; }
.mascot-bounce   { animation: m-bounce 0.55s ease-in-out infinite alternate; }
.mascot-droop    { animation: m-droop 4s ease-in-out infinite; }
.mascot-tilt     { animation: m-tilt 4s ease-in-out infinite; }
.mascot-sway     { animation: m-sway 5s ease-in-out infinite; }
.mascot-wiggle   { animation: m-wiggle 1.5s ease-in-out infinite; }
.mascot-dance    { animation: m-dance 0.4s ease-in-out infinite alternate; }
.mascot-pop-once { animation: m-pop 0.5s ease-out; }

@keyframes m-float  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
@keyframes m-bounce { 0%{transform:translateY(0) scale(1,1)} 100%{transform:translateY(-9px) scale(1.04,0.97)} }
@keyframes m-droop  { 0%,100%{transform:translateY(0) rotate(-1deg)} 50%{transform:translateY(3px) rotate(1deg)} }
@keyframes m-tilt   { 0%,100%{transform:rotate(0deg)} 50%{transform:rotate(-8deg)} }
@keyframes m-sway   { 0%,100%{transform:translateX(0)} 50%{transform:translateX(4px)} }
@keyframes m-wiggle { 0%,100%{transform:rotate(0deg)} 25%{transform:rotate(3deg)} 75%{transform:rotate(-3deg)} }
@keyframes m-dance  { 0%{transform:translateY(0) rotate(-3deg)} 100%{transform:translateY(-8px) rotate(3deg)} }
@keyframes m-pop    { 0%{transform:scale(1)} 40%{transform:scale(1.25)} 100%{transform:scale(1)} }

.mascot-shadow { width: 32px; height: 4px; background: #007AFF15; border-radius: 50%; margin: 4px auto 0; }
.mascot-shadow.mascot-float { animation: s-float 3.5s ease-in-out infinite; }
.mascot-shadow.mascot-bounce { animation: s-bounce 0.55s ease-in-out infinite alternate; }
@keyframes s-float  { 0%,100%{width:32px;opacity:.4} 50%{width:24px;opacity:.2} }
@keyframes s-bounce { 0%{width:32px;opacity:.4} 100%{width:26px;opacity:.2} }

/* Glow when active */
.mascot-glow {
  filter: drop-shadow(0 0 4px rgba(0,122,255,.95)) drop-shadow(0 0 10px rgba(0,122,255,.5));
}

/* ── Event Bubble ── */
.plusi-dock-bubble {
  background: var(--ds-bg-frosted);
  border: none;
  border-radius: 10px;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow:
    -4px 0 12px rgba(10,132,255,.06),
    0 4px 16px rgba(0,0,0,.35),
    0 0 0 0.5px var(--ds-border-subtle) inset;
  animation: pd-card-in 0.25s cubic-bezier(0.34,1.1,0.64,1);
  align-self: center;
  display: none;
  padding: 6px 11px;
  font-family: 'Space Grotesk', -apple-system, sans-serif;
  font-size: 12.5px;
  color: var(--ds-text-secondary);
  line-height: 1.45;
}
.plusi-dock-bubble.visible { display: block; }

@keyframes pd-card-in {
  0% { opacity: 0; transform: translateX(-4px) scale(0.96); }
  100% { opacity: 1; transform: translateX(0) scale(1); }
}
"""

# ═══════════════════════════════════════════════════
# HTML — Character + Menu + Bubble
# ═══════════════════════════════════════════════════

PLUSI_HTML = """
<div id="plusi-dock" class="pd-float">
  <!-- Character (SVG-based, matches PlusiIcon in chat widget) -->
  <div id="plusi-dock-char" onclick="window._plusiClick()">
    <div class="mascot-body mascot-float" id="plusi-mascot">
      <svg id="plusi-svg" viewBox="0 0 120 120" width="48" height="48">
        <rect x="40" y="5" width="40" height="110" rx="8" fill="#0a84ff"/>
        <rect x="5" y="35" width="110" height="40" rx="8" fill="#0a84ff"/>
        <rect x="40" y="35" width="40" height="40" fill="#0a84ff"/>
        <g id="plusi-face">
          <ellipse cx="48" cy="49" rx="7" ry="8" fill="white"/>
          <ellipse cx="49" cy="50" rx="4" ry="4" fill="#1a1a1a"/>
          <ellipse cx="72" cy="49" rx="7" ry="8" fill="white"/>
          <ellipse cx="71" cy="50" rx="4" ry="4" fill="#1a1a1a"/>
          <path d="M 48 68 Q 60 74 72 68" stroke="#1a1a1a" stroke-width="3" fill="none" stroke-linecap="round"/>
        </g>
      </svg>
    </div>
    <div class="mascot-shadow mascot-float" id="plusi-shadow"></div>
  </div>

  <!-- Event Bubble -->
  <div class="plusi-dock-bubble" id="plusi-bubble"></div>
</div>
"""

# ═══════════════════════════════════════════════════
# JS — Interaction logic
# ═══════════════════════════════════════════════════

PLUSI_JS = """
(function() {
  var bubbleTimer = null;

  // SVG face definitions — injected from shared/assets/plusi-faces.json at runtime
  var FACES = window.__plusi_faces__ || {};

  // Body animation per mood
  var MOODS = {
    neutral:   { bodyAnim: 'mascot-float',    dockAnim: 'pd-float' },
    happy:     { bodyAnim: 'mascot-bounce',   dockAnim: 'pd-bounce' },
    annoyed:   { bodyAnim: 'mascot-float',    dockAnim: 'pd-float' },
    curious:   { bodyAnim: 'mascot-tilt',     dockAnim: 'pd-float' },
    excited:   { bodyAnim: 'mascot-dance',    dockAnim: 'pd-bounce' },
    sleepy:    { bodyAnim: 'mascot-sway',     dockAnim: 'pd-float' },
    surprised: { bodyAnim: 'mascot-pop-once', dockAnim: 'pd-bounce' },
    blush:     { bodyAnim: 'mascot-wiggle',   dockAnim: 'pd-float' },
    empathy:   { bodyAnim: 'mascot-droop',    dockAnim: 'pd-droop' },
    thinking:  { bodyAnim: 'mascot-float',    dockAnim: 'pd-float' },
    reading:   { bodyAnim: 'mascot-tilt',     dockAnim: 'pd-float' },
  };

  function setMood(mood) {
    var m = MOODS[mood] || MOODS.neutral;
    var face = FACES[mood] || FACES.neutral;
    var mascot = document.getElementById('plusi-mascot');
    var faceEl = document.getElementById('plusi-face');
    var shadow = document.getElementById('plusi-shadow');
    var dock = document.getElementById('plusi-dock');
    if (!mascot || !faceEl) return;

    // Update SVG face
    faceEl.innerHTML = face;

    // Update body animation
    mascot.className = 'mascot-body ' + m.bodyAnim;
    shadow.className = 'mascot-shadow ' + m.bodyAnim;
    dock.className = m.dockAnim;
  }

  function showBubble(text, mood) {
    var bubble = document.getElementById('plusi-bubble');
    if (!bubble) return;
    bubble.textContent = text;
    bubble.classList.add('visible');
    setMood(mood || 'happy');

    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(function() {
      bubble.classList.remove('visible');
      setMood('neutral');
    }, 4000);
  }

  var _clickTimer = null;
  var _clickCount = 0;

  /* Drag to chat */
  var _dragStartX = 0;
  var _dragStartY = 0;
  var _isDragging = false;
  var _dragThreshold = 80;

  (function() {
    var char = document.getElementById('plusi-dock-char');
    if (!char) return;

    char.addEventListener('mousedown', function(e) {
      _dragStartX = e.clientX;
      _dragStartY = e.clientY;
      _isDragging = false;
    });

    document.addEventListener('mousemove', function(e) {
      if (_dragStartX === 0) return;
      var dx = e.clientX - _dragStartX;
      if (dx > 30) {
        _isDragging = true;
        var mascot = document.getElementById('plusi-mascot');
        if (mascot) {
          mascot.style.transform = 'translateX(' + (dx - 30) + 'px) scale(0.9)';
          mascot.style.opacity = '0.7';
        }
      }
    });

    document.addEventListener('mouseup', function(e) {
      if (_dragStartX === 0) return;
      var dx = e.clientX - _dragStartX;
      var mascot = document.getElementById('plusi-mascot');

      if (_isDragging && dx > _dragThreshold) {
        /* Drag completed — open chat with @Plusi */
        if (typeof pycmd === 'function') {
          pycmd('plusi:ask');
        } else {
          window._apAction = {type: 'plusiAsk'};
        }
      }

      /* Reset */
      if (mascot) {
        mascot.style.transform = '';
        mascot.style.opacity = '';
      }
      _dragStartX = 0;
      _isDragging = false;
    });
  })();

  window._plusiClick = function() {
    if (_isDragging) { _isDragging = false; return; }
    _clickCount++;
    if (_clickCount === 1) {
      _clickTimer = setTimeout(function() {
        _clickCount = 0;
        if (typeof pycmd === 'function') {
          pycmd('plusi:settings');
        } else {
          window._apAction = {type: 'plusiSettings'};
        }
      }, 300);
    } else if (_clickCount === 2) {
      clearTimeout(_clickTimer);
      _clickCount = 0;
      if (typeof pycmd === 'function') {
        pycmd('plusi:ask');
      } else {
        window._apAction = {type: 'plusiAsk'};
      }
    }
  };

  // API for Python to call
  window._plusiSetMood = setMood;
  window._plusiShowBubble = showBubble;
})();
"""


def get_plusi_dock_injection():
    """Return the complete HTML/CSS/JS to inject into a webview.
    Includes initial mood restore from persisted state.
    Faces data is loaded from shared/assets/plusi-faces.json and injected
    as window.__plusi_faces__ before PLUSI_JS runs."""
    mood = get_persisted_mood()
    faces_json = json.dumps(get_faces_dict())
    faces_init = f"window.__plusi_faces__ = {faces_json};"
    init_script = f"\nwindow.addEventListener('DOMContentLoaded', function() {{ if(window._plusiSetMood) window._plusiSetMood('{mood}'); }});\nsetTimeout(function() {{ if(window._plusiSetMood) window._plusiSetMood('{mood}'); }}, 100);"
    return f'<style>{PLUSI_CSS}</style>\n{PLUSI_HTML}\n<script>{faces_init}\n{PLUSI_JS}\n{init_script}</script>'


def _get_active_webview():
    """Get the currently active main webview (reviewer, deckBrowser, or overview)."""
    try:
        from aqt import mw
        if not mw:
            return None
        state = mw.state
        if state == 'review' and mw.reviewer and mw.reviewer.web:
            return mw.reviewer.web
        elif state == 'deckBrowser' and hasattr(mw, 'deckBrowser') and mw.deckBrowser and mw.deckBrowser.web:
            return mw.deckBrowser.web
        elif state == 'overview' and hasattr(mw, 'overview') and mw.overview and mw.overview.web:
            return mw.overview.web
        # Fallback: try reviewer first
        if mw.reviewer and mw.reviewer.web:
            return mw.reviewer.web
        return None
    except Exception:
        return None


def set_mood(web_view_or_none=None, mood='neutral'):
    """Update Plusi's mood in the given or active webview.
    Thread-safe: dispatches to main thread if called from a background thread."""
    def _do():
        web = web_view_or_none or _get_active_webview()
        if web:
            web.page().runJavaScript(f"window._plusiSetMood && window._plusiSetMood('{mood}');")

    import threading
    if threading.current_thread() is not threading.main_thread():
        from aqt import mw
        if mw and mw.taskman:
            mw.taskman.run_on_main(_do)
    else:
        _do()


def show_bubble(web_view_or_none=None, text='', mood='happy'):
    """Show an event bubble next to Plusi.
    Thread-safe: dispatches to main thread if called from a background thread."""
    def _do():
        web = web_view_or_none or _get_active_webview()
        if web:
            web.page().runJavaScript(
                f"window._plusiShowBubble && window._plusiShowBubble({json.dumps(text)}, '{mood}');"
            )

    import threading
    if threading.current_thread() is not threading.main_thread():
        from aqt import mw
        if mw and mw.taskman:
            mw.taskman.run_on_main(_do)
    else:
        _do()


def sync_mood(mood):
    """Convenience: sync mood to whatever webview is currently active.
    Also persists the mood so it survives page reloads and app restarts."""
    logger.debug(f"plusi_dock.sync_mood: {mood}")
    # Persist to storage
    try:
        try:
            from .storage import set_memory
        except ImportError:
            from storage import set_memory
        set_memory('state', 'last_mood', mood)
    except Exception:
        pass
    set_mood(None, mood)


def get_persisted_mood():
    """Get the last persisted mood, or 'neutral' as default."""
    try:
        try:
            from .storage import get_memory
        except ImportError:
            from storage import get_memory
        return get_memory('state', 'last_mood', 'neutral')
    except Exception:
        return 'neutral'
