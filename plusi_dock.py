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
  <!-- Character (SVG-based, matches PlusiIcon in chat widget) -->
  <div id="plusi-dock-char" onclick="window._plusiToggleMenu()">
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

  // SVG face definitions — matches PlusiIcon in chat widget
  var FACES = {
    neutral:   '<ellipse cx="48" cy="49" rx="7" ry="8" fill="white"><animate attributeName="ry" values="8;0.5;8" dur="4s" begin="2s" repeatCount="indefinite" keyTimes="0;0.04;0.08" keySplines="0.4 0 0.2 1;0.4 0 0.2 1" calcMode="spline"/></ellipse><ellipse cx="49" cy="50" rx="4" ry="4" fill="#1a1a1a"><animate attributeName="cx" values="49;51;49;47;49" dur="6s" repeatCount="indefinite"/></ellipse><ellipse cx="72" cy="49" rx="7" ry="8" fill="white"><animate attributeName="ry" values="8;0.5;8" dur="4s" begin="2s" repeatCount="indefinite" keyTimes="0;0.04;0.08" keySplines="0.4 0 0.2 1;0.4 0 0.2 1" calcMode="spline"/></ellipse><ellipse cx="71" cy="50" rx="4" ry="4" fill="#1a1a1a"><animate attributeName="cx" values="71;73;71;69;71" dur="6s" repeatCount="indefinite"/></ellipse><path d="M 48 68 Q 60 74 72 68" stroke="#1a1a1a" stroke-width="3" fill="none" stroke-linecap="round"/>',
    happy:     '<ellipse cx="48" cy="49" rx="7" ry="8" fill="white"/><rect x="41" y="41" width="14" height="4" fill="#0a84ff"/><ellipse cx="49" cy="51" rx="4" ry="3.5" fill="#1a1a1a"/><ellipse cx="72" cy="49" rx="7" ry="8" fill="white"/><rect x="65" y="41" width="14" height="4" fill="#0a84ff"/><ellipse cx="71" cy="51" rx="4" ry="3.5" fill="#1a1a1a"/><path d="M 46 66 Q 60 78 74 66" stroke="#1a1a1a" stroke-width="3" fill="none" stroke-linecap="round"/>',
    annoyed:   '<ellipse cx="48" cy="49" rx="7" ry="8" fill="white"/><rect x="41" y="41" width="14" height="7" fill="#0a84ff"/><ellipse cx="49" cy="52" rx="4" ry="3" fill="#1a1a1a"/><ellipse cx="72" cy="49" rx="7" ry="8" fill="white"/><rect x="65" y="41" width="14" height="7" fill="#0a84ff"/><ellipse cx="71" cy="52" rx="4" ry="3" fill="#1a1a1a"/><line x1="50" y1="70" x2="70" y2="70" stroke="#1a1a1a" stroke-width="3" stroke-linecap="round"/>',
    curious:   '<ellipse cx="48" cy="48" rx="7" ry="9" fill="white"><animate attributeName="ry" values="9;0.5;9" dur="5s" begin="3s" repeatCount="indefinite" keyTimes="0;0.03;0.06" keySplines="0.4 0 0.2 1;0.4 0 0.2 1" calcMode="spline"/></ellipse><ellipse cx="49" cy="49" rx="4" ry="4" fill="#1a1a1a"><animate attributeName="cx" values="49;52;49" dur="3s" repeatCount="indefinite"/></ellipse><ellipse cx="72" cy="50" rx="7" ry="7" fill="white"/><rect x="65" y="43" width="14" height="5" fill="#0a84ff"/><ellipse cx="71" cy="52" rx="4" ry="3" fill="#1a1a1a"/><path d="M 50 68 Q 56 68 60 66 Q 64 64 68 66" stroke="#1a1a1a" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
    excited:   '<ellipse cx="48" cy="47" rx="8" ry="10" fill="white"><animate attributeName="ry" values="10;0.5;10" dur="3s" begin="1.5s" repeatCount="indefinite" keyTimes="0;0.04;0.08" keySplines="0.4 0 0.2 1;0.4 0 0.2 1" calcMode="spline"/></ellipse><ellipse cx="49" cy="48" rx="5" ry="5" fill="#1a1a1a"/><ellipse cx="72" cy="47" rx="8" ry="10" fill="white"><animate attributeName="ry" values="10;0.5;10" dur="3s" begin="1.5s" repeatCount="indefinite" keyTimes="0;0.04;0.08" keySplines="0.4 0 0.2 1;0.4 0 0.2 1" calcMode="spline"/></ellipse><ellipse cx="71" cy="48" rx="5" ry="5" fill="#1a1a1a"/><ellipse cx="60" cy="70" rx="7" ry="6" fill="#1a1a1a"/>',
    sleepy:    '<ellipse cx="48" cy="52" rx="7" ry="3" fill="white"/><ellipse cx="72" cy="52" rx="7" ry="3" fill="white"/><line x1="54" y1="70" x2="66" y2="71" stroke="#1a1a1a" stroke-width="2.5" stroke-linecap="round"/>',
    surprised: '<ellipse cx="48" cy="46" rx="8" ry="10" fill="white"><animate attributeName="ry" values="10;11;10" dur="1.5s" repeatCount="indefinite"/></ellipse><ellipse cx="49" cy="47" rx="5" ry="5" fill="#1a1a1a"/><ellipse cx="72" cy="46" rx="8" ry="10" fill="white"><animate attributeName="ry" values="10;11;10" dur="1.5s" repeatCount="indefinite"/></ellipse><ellipse cx="71" cy="47" rx="5" ry="5" fill="#1a1a1a"/><ellipse cx="60" cy="70" rx="5" ry="4" fill="#1a1a1a"><animate attributeName="ry" values="4;5;4" dur="1.5s" repeatCount="indefinite"/></ellipse>',
    blush:     '<ellipse cx="48" cy="49" rx="7" ry="7" fill="white"/><rect x="41" y="42" width="14" height="4" fill="#0a84ff"/><ellipse cx="49" cy="51" rx="3.5" ry="3.5" fill="#1a1a1a"/><ellipse cx="72" cy="49" rx="7" ry="7" fill="white"/><rect x="65" y="42" width="14" height="4" fill="#0a84ff"/><ellipse cx="71" cy="51" rx="3.5" ry="3.5" fill="#1a1a1a"/><ellipse cx="38" cy="60" rx="6" ry="3" fill="rgba(248,113,113,0.3)"/><ellipse cx="82" cy="60" rx="6" ry="3" fill="rgba(248,113,113,0.3)"/><path d="M 52 68 Q 54 66 57 68 Q 60 70 63 68 Q 66 66 68 68" stroke="#1a1a1a" stroke-width="2" fill="none" stroke-linecap="round"/>',
    empathy:   '<ellipse cx="48" cy="49" rx="7" ry="8" fill="white"/><rect x="41" y="41" width="14" height="3" fill="#0a84ff"/><ellipse cx="49" cy="52" rx="4" ry="4" fill="#1a1a1a"/><ellipse cx="72" cy="49" rx="7" ry="8" fill="white"/><rect x="65" y="41" width="14" height="3" fill="#0a84ff"/><ellipse cx="71" cy="52" rx="4" ry="4" fill="#1a1a1a"/><path d="M 50 70 Q 60 66 70 70" stroke="#1a1a1a" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
    thinking:  '<ellipse cx="48" cy="49" rx="7" ry="8" fill="white"/><ellipse cx="51" cy="47" rx="4" ry="4" fill="#1a1a1a"><animate attributeName="cx" values="51;52;50;51" dur="4s" repeatCount="indefinite"/><animate attributeName="cy" values="47;46;48;47" dur="5s" repeatCount="indefinite"/></ellipse><ellipse cx="72" cy="49" rx="7" ry="8" fill="white"/><ellipse cx="75" cy="47" rx="4" ry="4" fill="#1a1a1a"><animate attributeName="cx" values="75;76;74;75" dur="4s" repeatCount="indefinite"/><animate attributeName="cy" values="47;46;48;47" dur="5s" repeatCount="indefinite"/></ellipse><path d="M 50 69 Q 60 72 70 69" stroke="#1a1a1a" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
    reading:   '<ellipse cx="48" cy="51" rx="7" ry="6" fill="white"/><rect x="41" y="43" width="14" height="5" fill="#0a84ff"/><ellipse cx="49" cy="53" rx="4" ry="3" fill="#1a1a1a"><animate attributeName="cx" values="47;51;47" dur="3s" repeatCount="indefinite"/></ellipse><ellipse cx="72" cy="51" rx="7" ry="6" fill="white"/><rect x="65" y="43" width="14" height="5" fill="#0a84ff"/><ellipse cx="71" cy="53" rx="4" ry="3" fill="#1a1a1a"><animate attributeName="cx" values="69;73;69" dur="3s" repeatCount="indefinite"/></ellipse><path d="M 52 68 Q 60 71 68 68" stroke="#1a1a1a" stroke-width="2" fill="none" stroke-linecap="round"/>',
  };

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
