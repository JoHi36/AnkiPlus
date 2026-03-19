"""
Plusi Dock — Injectable HTML/CSS/JS for the main Anki window.
Renders the Plusi mascot character as a fixed-position element in the
bottom-left corner of the reviewer and deck browser webviews.

Features:
- 48px animated Plusi character (same CSS as MascotCharacter.jsx)
- Context menu (Plusi fragen + Einstellungen)
- Event bubbles (card correct/wrong, streaks)
- Mood system (neutral/happy/empathy/excited + animations)
- Communication via pycmd() in reviewer, window._apAction in deck browser
"""

import json

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
.mascot-ph { position: absolute; height: 38.5%; border-radius: 3px; top: 30.7%; left: 0; width: 100%; }
.mascot-pv { position: absolute; width: 38.5%; border-radius: 3px; top: 0; left: 30.7%; height: 100%; }

.mascot-blue   .mascot-ph, .mascot-blue   .mascot-pv { background: #007AFF; }
.mascot-grey   .mascot-ph, .mascot-grey   .mascot-pv { background: #4b5563; }
.mascot-purple .mascot-ph, .mascot-purple .mascot-pv { background: #7c3aed; }
.mascot-dark   .mascot-ph, .mascot-dark   .mascot-pv { background: #1d4ed8; filter: brightness(0.75); }

.mascot-face {
  position: absolute; top: 30.7%; left: 30.7%;
  width: 38.5%; height: 38.5%; z-index: 3;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
}
.mascot-eyes-row { display: flex; gap: 5px; }
.mascot-eye {
  width: 5px; height: 6px; background: white; border-radius: 50%;
  position: relative; overflow: hidden; flex-shrink: 0;
  transition: height 0.3s, border-radius 0.3s;
  animation: mascot-blink 5s ease-in-out infinite;
}
@keyframes mascot-blink { 0%,85%,100%{transform:scaleY(1)} 91%{transform:scaleY(0.05)} }

.mascot-pupil {
  position: absolute; width: 2.5px; height: 2.5px;
  background: #002a6e; border-radius: 50%; top: 1.5px; left: 1px;
}
.mascot-pupil-wander { animation: p-wander 6s ease-in-out infinite; }
@keyframes p-wander { 0%,100%{transform:translate(0,0)} 25%{transform:translate(1px,0)} 50%{transform:translate(0,1px)} 75%{transform:translate(-1px,0)} }

.mascot-mouth-d     { width: 10px; height: 5px; background: #003a80; border-radius: 0 0 7px 7px; margin-top: 2px; }
.mascot-mouth-smile { width: 11px; height: 5px; background: #003a80; border-radius: 0 0 8px 8px; margin-top: 1px; }
.mascot-mouth-wide  { width: 13px; height: 7px; background: #003a80; border-radius: 0 0 9px 9px; margin-top: 2px; }
.mascot-mouth-sad   { width: 10px; height: 5px; background: #1e3a8a; border-radius: 7px 7px 0 0; margin-top: 4px; }

.mascot-float    { animation: m-float 3.5s ease-in-out infinite; }
.mascot-bounce   { animation: m-bounce 0.55s ease-in-out infinite alternate; }
.mascot-droop    { animation: m-droop 4s ease-in-out infinite; }

@keyframes m-float  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
@keyframes m-bounce { 0%{transform:translateY(0) scale(1,1)} 100%{transform:translateY(-9px) scale(1.04,0.97)} }
@keyframes m-droop  { 0%,100%{transform:translateY(0) rotate(-1deg)} 50%{transform:translateY(3px) rotate(1deg)} }

.mascot-shadow { width: 32px; height: 4px; background: #007AFF15; border-radius: 50%; margin: 4px auto 0; }
.mascot-shadow.mascot-float { animation: s-float 3.5s ease-in-out infinite; }
.mascot-shadow.mascot-bounce { animation: s-bounce 0.55s ease-in-out infinite alternate; }
@keyframes s-float  { 0%,100%{width:32px;opacity:.4} 50%{width:24px;opacity:.2} }
@keyframes s-bounce { 0%{width:32px;opacity:.4} 100%{width:26px;opacity:.2} }

/* Glow when menu open */
.mascot-glow {
  filter: drop-shadow(0 0 4px rgba(0,122,255,.95)) drop-shadow(0 0 10px rgba(0,122,255,.5));
}

/* ── Context Menu + Event Bubble ── */
.plusi-dock-menu,
.plusi-dock-bubble {
  background: rgba(18,18,18,.94);
  border: none;
  border-radius: 10px;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow:
    -4px 0 12px rgba(10,132,255,.06),
    0 4px 16px rgba(0,0,0,.35),
    0 0 0 0.5px rgba(255,255,255,.04) inset;
  animation: pd-card-in 0.25s cubic-bezier(0.34,1.1,0.64,1);
  align-self: center;
  display: none;
}
.plusi-dock-menu.visible,
.plusi-dock-bubble.visible { display: block; }

@keyframes pd-card-in {
  0% { opacity: 0; transform: translateX(-4px) scale(0.96); }
  100% { opacity: 1; transform: translateX(0) scale(1); }
}

.plusi-dock-menu { padding: 3px; min-width: 130px; }

.plusi-menu-item {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px; border-radius: 7px; cursor: pointer;
  font-size: 12.5px; color: rgba(232,232,232,.7);
  font-family: -apple-system, sans-serif;
  transition: background 0.15s;
}
.plusi-menu-item:hover { background: rgba(10,132,255,.08); }
.plusi-menu-item svg { opacity: 0.4; flex-shrink: 0; }
.plusi-menu-accent { color: rgba(10,132,255,.8); font-weight: 500; }
.plusi-menu-accent svg { opacity: 0.65; color: #0a84ff; }

.plusi-menu-sep {
  height: 1px; margin: 2px 6px;
  background: radial-gradient(ellipse at center, rgba(255,255,255,.05) 0%, transparent 75%);
}

.plusi-dock-bubble {
  padding: 6px 11px;
  font-family: 'Space Grotesk', -apple-system, sans-serif;
  font-size: 12.5px;
  color: rgba(232,232,232,.72);
  line-height: 1.45;
  background: rgba(10,132,255,.05);
}
"""

# ═══════════════════════════════════════════════════
# HTML — Character + Menu + Bubble
# ═══════════════════════════════════════════════════

PLUSI_HTML = """
<div id="plusi-dock" class="pd-float">
  <!-- Character -->
  <div id="plusi-dock-char" onclick="window._plusiToggleMenu()">
    <div class="mascot-body mascot-float mascot-blue" id="plusi-mascot">
      <div class="mascot-ph"></div>
      <div class="mascot-pv"></div>
      <div class="mascot-face">
        <div class="mascot-eyes-row">
          <div class="mascot-eye"><div class="mascot-pupil mascot-pupil-wander"></div></div>
          <div class="mascot-eye" style="animation-delay:0.3s"><div class="mascot-pupil mascot-pupil-wander" style="animation-delay:0.5s"></div></div>
        </div>
        <div class="mascot-mouth mascot-mouth-d" id="plusi-mouth"></div>
      </div>
    </div>
    <div class="mascot-shadow mascot-float" id="plusi-shadow"></div>
  </div>

  <!-- Context Menu -->
  <div class="plusi-dock-menu" id="plusi-menu">
    <div class="plusi-menu-item plusi-menu-accent" onclick="window._plusiAsk()">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <span>Plusi fragen</span>
    </div>
    <div class="plusi-menu-sep"></div>
    <div class="plusi-menu-item" onclick="window._plusiSettings()">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      <span>Einstellungen</span>
    </div>
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
  var menuOpen = false;
  var bubbleTimer = null;

  // Mood configurations
  var MOODS = {
    neutral:   { bodyAnim: 'mascot-float',    colorClass: 'mascot-blue',   mouth: 'mascot-mouth-d',    dockAnim: 'pd-float' },
    happy:     { bodyAnim: 'mascot-bounce',   colorClass: 'mascot-blue',   mouth: 'mascot-mouth-wide', dockAnim: 'pd-bounce' },
    annoyed:   { bodyAnim: 'mascot-float',    colorClass: 'mascot-dark',   mouth: 'mascot-mouth-d',    dockAnim: 'pd-float' },
    curious:   { bodyAnim: 'mascot-tilt',     colorClass: 'mascot-blue',   mouth: 'mascot-mouth-d',    dockAnim: 'pd-float' },
    excited:   { bodyAnim: 'mascot-dance',    colorClass: 'mascot-purple', mouth: 'mascot-mouth-wide', dockAnim: 'pd-bounce' },
    sleepy:    { bodyAnim: 'mascot-sway',     colorClass: 'mascot-grey',   mouth: 'mascot-mouth-tiny', dockAnim: 'pd-float' },
    surprised: { bodyAnim: 'mascot-pop-once', colorClass: 'mascot-blue',   mouth: 'mascot-mouth-o',    dockAnim: 'pd-bounce' },
    blush:     { bodyAnim: 'mascot-wiggle',   colorClass: 'mascot-blush',  mouth: 'mascot-mouth-tiny', dockAnim: 'pd-float' },
    empathy:   { bodyAnim: 'mascot-droop',    colorClass: 'mascot-dark',   mouth: 'mascot-mouth-sad',  dockAnim: 'pd-droop' },
    thinking:  { bodyAnim: 'mascot-float',    colorClass: 'mascot-blue',   mouth: 'mascot-mouth-d',    dockAnim: 'pd-float' },
    reading:   { bodyAnim: 'mascot-tilt',     colorClass: 'mascot-blue',   mouth: 'mascot-mouth-d',    dockAnim: 'pd-float' },
  };

  function setMood(mood) {
    var m = MOODS[mood] || MOODS.neutral;
    var mascot = document.getElementById('plusi-mascot');
    var mouth = document.getElementById('plusi-mouth');
    var shadow = document.getElementById('plusi-shadow');
    var dock = document.getElementById('plusi-dock');
    if (!mascot) return;

    // Reset classes
    mascot.className = 'mascot-body ' + m.bodyAnim + ' ' + m.colorClass;
    mouth.className = 'mascot-mouth ' + m.mouth;
    shadow.className = 'mascot-shadow ' + m.bodyAnim;
    dock.className = m.dockAnim;

    // Add glow if menu open
    if (menuOpen) mascot.classList.add('mascot-glow');
  }

  function showBubble(text, mood) {
    if (menuOpen) return;
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

  window._plusiToggleMenu = function() {
    var menu = document.getElementById('plusi-menu');
    var bubble = document.getElementById('plusi-bubble');
    var mascot = document.getElementById('plusi-mascot');
    if (!menu) return;

    menuOpen = !menuOpen;
    if (menuOpen) {
      menu.classList.add('visible');
      bubble.classList.remove('visible');
      mascot.classList.add('mascot-glow');
    } else {
      menu.classList.remove('visible');
      mascot.classList.remove('mascot-glow');
    }
  };

  window._plusiAsk = function() {
    menuOpen = false;
    document.getElementById('plusi-menu').classList.remove('visible');
    document.getElementById('plusi-mascot').classList.remove('mascot-glow');

    // Always signal Python to open chat panel with @Plusi prefix
    // (works in both reviewer and deck browser — Python opens side panel)
    if (typeof pycmd === 'function') {
      pycmd('plusi:ask');
    } else {
      // DeckBrowser fallback: use polling action
      window._apAction = {type: 'plusiAsk'};
    }
  };

  window._plusiSettings = function() {
    menuOpen = false;
    document.getElementById('plusi-menu').classList.remove('visible');
    document.getElementById('plusi-mascot').classList.remove('mascot-glow');
    if (typeof pycmd === 'function') {
      pycmd('plusi:settings');
    } else if (window._apAction !== undefined) {
      window._apAction = {type: 'plusiSettings'};
    }
  };

  // Close menu on outside click
  document.addEventListener('mousedown', function(e) {
    if (!menuOpen) return;
    var dock = document.getElementById('plusi-dock');
    if (dock && !dock.contains(e.target)) {
      menuOpen = false;
      document.getElementById('plusi-menu').classList.remove('visible');
      document.getElementById('plusi-mascot').classList.remove('mascot-glow');
    }
  });

  // API for Python to call
  window._plusiSetMood = setMood;
  window._plusiShowBubble = showBubble;
})();
"""


def get_plusi_dock_injection():
    """Return the complete HTML/CSS/JS to inject into a webview.
    Includes initial mood restore from persisted state."""
    mood = get_persisted_mood()
    init_script = f"\nwindow.addEventListener('DOMContentLoaded', function() {{ if(window._plusiSetMood) window._plusiSetMood('{mood}'); }});\nsetTimeout(function() {{ if(window._plusiSetMood) window._plusiSetMood('{mood}'); }}, 100);"
    return f'<style>{PLUSI_CSS}</style>\n{PLUSI_HTML}\n<script>{PLUSI_JS}\n{init_script}</script>'


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
    print(f"plusi_dock.sync_mood: {mood}")
    # Persist to storage
    try:
        try:
            from .plusi_storage import set_memory
        except ImportError:
            from plusi_storage import set_memory
        set_memory('state', 'last_mood', mood)
    except Exception:
        pass
    set_mood(None, mood)


def get_persisted_mood():
    """Get the last persisted mood, or 'neutral' as default."""
    try:
        try:
            from .plusi_storage import get_memory
        except ImportError:
            from plusi_storage import get_memory
        return get_memory('state', 'last_mood', 'neutral')
    except Exception:
        return 'neutral'
