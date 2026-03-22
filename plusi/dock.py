"""
Plusi Dock — Injectable HTML/CSS/JS for the main Anki window.
Renders the Plusi mascot character as a fixed-position element in the
bottom-left corner of the reviewer and deck browser webviews.

Uses the unified plusi-renderer.js for character rendering (SVG, animations,
mood system). Adds dock-specific features: event bubbles, click/drag
interactions, and Python ↔ JS API glue.

Features:
- 48px animated Plusi character via createPlusi() renderer
- Single-click: toggle diary panel; double-click: open chat
- Event bubbles (card correct/wrong, streaks)
- Mood system via renderer API
- Communication via pycmd() in reviewer, window._apAction in deck browser
"""

import json
import os

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

# ═══════════════════════════════════════════════════
# Renderer cache — loads shared/plusi-renderer.js once
# ═══════════════════════════════════════════════════

_renderer_cache = None

def _get_renderer_js():
    """Load and cache the unified Plusi renderer JavaScript."""
    global _renderer_cache
    if _renderer_cache is None:
        renderer_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            '..', 'shared', 'plusi-renderer.js'
        )
        logger.info("Loading Plusi renderer from %s", renderer_path)
        with open(renderer_path, 'r', encoding='utf-8') as f:
            _renderer_cache = f.read()
    return _renderer_cache


# ═══════════════════════════════════════════════════
# Bubble CSS — event bubble (card correct/wrong, streaks)
# ═══════════════════════════════════════════════════

BUBBLE_CSS = """
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

#plusi-dock-char {
  cursor: pointer;
  flex-shrink: 0;
}

/* ── Sleep Animation ── */
@keyframes plusi-breathe {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-1px) scale(1.02); }
}

#plusi-dock.plusi-sleeping #plusi-dock-char > div {
  animation: plusi-breathe 4s ease-in-out infinite !important;
  filter: saturate(0.4) brightness(0.7) !important;
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
# Dock HTML — minimal container for renderer + bubble
# ═══════════════════════════════════════════════════

DOCK_HTML = """
<div id="plusi-dock">
  <div id="plusi-dock-char"></div>
  <div class="plusi-dock-bubble" id="plusi-bubble"></div>
</div>
"""

# ═══════════════════════════════════════════════════
# Dock JS — interaction logic (click, drag, bubble)
# ═══════════════════════════════════════════════════

DOCK_JS = """
(function() {
  var bubbleTimer = null;
  var plusiInstance = null;

  // Initialize renderer into #plusi-dock-char
  var charEl = document.getElementById('plusi-dock-char');
  if (charEl && window.createPlusi) {
    plusiInstance = window.createPlusi(charEl, {
      mood: '__INITIAL_MOOD__',
      size: 48,
      animated: true
    });
  }

  function setMood(mood) {
    if (plusiInstance) plusiInstance.setMood(mood);
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
  var _isDragging = false;
  var _dragThreshold = 80;

  (function() {
    var char = document.getElementById('plusi-dock-char');
    if (!char) return;

    char.addEventListener('mousedown', function(e) {
      _dragStartX = e.clientX;
      _isDragging = false;
    });

    document.addEventListener('mousemove', function(e) {
      if (_dragStartX === 0) return;
      var dx = e.clientX - _dragStartX;
      if (dx > 30) {
        _isDragging = true;
        var wrapper = char.firstElementChild;
        if (wrapper) {
          wrapper.style.transform = 'translateX(' + (dx - 30) + 'px) scale(0.9)';
          wrapper.style.opacity = '0.7';
        }
      }
    });

    document.addEventListener('mouseup', function(e) {
      if (_dragStartX === 0) return;
      var dx = e.clientX - _dragStartX;
      var wrapper = char.firstElementChild;

      if (_isDragging && dx > _dragThreshold) {
        /* Drag completed — open chat with @Plusi */
        if (typeof pycmd === 'function') {
          pycmd('plusi:ask');
        } else {
          window._apAction = {type: 'plusiAsk'};
        }
      }

      /* Reset */
      if (wrapper) {
        wrapper.style.transform = '';
        wrapper.style.opacity = '';
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

  // Wire up click on the dock char container
  if (charEl) {
    charEl.addEventListener('click', function() { window._plusiClick(); });
  }

  // API for Python to call
  window._plusiSetMood = setMood;
  window._plusiShowBubble = showBubble;

  window._plusiSetIntegrity = function(val) {
    if (plusiInstance) plusiInstance.setIntegrity(val);
  };

  window._plusiSetSleeping = function(sleeping) {
    var el = document.getElementById('plusi-dock');
    if (!el) return;
    if (sleeping) {
      el.classList.add('plusi-sleeping');
      // Also set mood to 'sleeping' so ZZZ accessoire renders
      setMood('sleeping');
    } else {
      el.classList.remove('plusi-sleeping');
    }
  };
})();
"""


def is_plusi_enabled():
    """Check if Plusi is enabled in config (mascot_enabled)."""
    try:
        try:
            from ..config import get_config
        except ImportError:
            from config import get_config
        config = get_config()
        return config.get('mascot_enabled', False)
    except Exception:
        return False


def get_plusi_dock_injection():
    """Return the complete HTML/CSS/JS to inject into a webview.
    Returns empty string if Plusi is disabled in config.
    Uses the unified plusi-renderer.js for character rendering,
    plus dock-specific bubble/interaction code."""
    if not is_plusi_enabled():
        return ''
    mood = get_persisted_mood()
    renderer_js = _get_renderer_js()
    dock_js = DOCK_JS.replace('__INITIAL_MOOD__', mood)
    return (
        f'<style>{BUBBLE_CSS}</style>\n'
        f'{DOCK_HTML}\n'
        f'<script>{renderer_js}</script>\n'
        f'<script>{dock_js}</script>'
    )


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


def hide_dock(web_view_or_none=None):
    """Remove Plusi dock from the given or active webview."""
    def _do():
        web = web_view_or_none or _get_active_webview()
        if web:
            web.page().runJavaScript(
                "var d = document.getElementById('plusi-dock'); if(d) d.remove();"
            )

    import threading
    if threading.current_thread() is not threading.main_thread():
        from aqt import mw
        if mw and mw.taskman:
            mw.taskman.run_on_main(_do)
    else:
        _do()


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
    No-op if Plusi is disabled.
    Thread-safe: dispatches to main thread if called from a background thread."""
    if not is_plusi_enabled():
        return
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
    Also persists the mood so it survives page reloads and app restarts.
    No-op if Plusi is disabled."""
    if not is_plusi_enabled():
        return
    logger.debug("plusi_dock.sync_mood: %s", mood)
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
