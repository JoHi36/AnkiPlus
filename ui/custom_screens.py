"""
Custom Screens for AnkiPlus

Deck browser and overview share the same visual framework as the reviewer:
  - Same top bar with tabs (Stapel | Session | Statistik)
  - Same DaisyUI theme and compiled CSS
  - Tab switching feels like a single-page app

NAVIGATION: Python polling approach (100ms interval).
  JS sets:  window._apAction = {type:'nav', did:12345}
         or window._apAction = {type:'cmd', cmd:'stats'}
"""

import os
import json
from aqt import mw, gui_hooks

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

try:
    from aqt.qt import QTimer
except ImportError:
    from PyQt6.QtCore import QTimer


try:
    from aqt.deckbrowser import DeckBrowser
except ImportError:
    DeckBrowser = None

try:
    from aqt.overview import Overview
except ImportError:
    Overview = None

# NOTE: Legacy sessions_storage (JSON) removed — per-card SQLite is now used instead.


# ─── Design-system token loader ──────────────────────────────────────────────

_design_tokens_css = None

def _get_design_tokens_css():
    """Load shared/styles/design-system.css and cache it."""
    global _design_tokens_css
    if _design_tokens_css is None:
        css_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'shared', 'styles', 'design-system.css')
        try:
            with open(css_path, 'r', encoding='utf-8') as f:
                _design_tokens_css = f.read()
        except Exception as e:
            logger.error("CustomScreens: Could not load design-system.css: %s", e)
            _design_tokens_css = ''
    return _design_tokens_css


# ─── Plusi dock injection ────────────────────────────────────────────────────

def _get_plusi_dock_html():
    """Get the Plusi dock HTML/CSS/JS for injection into main window webviews."""
    try:
        try:
            from ..plusi.dock import get_plusi_dock_injection
        except ImportError:
            from plusi.dock import get_plusi_dock_injection
        return get_plusi_dock_injection()
    except Exception as e:
        logger.error("Plusi dock injection error: %s", e)
        return ''


# ─── Shared CSS loader ────────────────────────────────────────────────────────

def _load_reviewer_css():
    """Load compiled reviewer.css (DaisyUI + Tailwind) for shared visual framework."""
    addon_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'custom_reviewer')
    css_path = os.path.join(addon_dir, 'reviewer.css')
    if os.path.exists(css_path):
        with open(css_path, 'r', encoding='utf-8') as f:
            return f.read()
    return ''


# ─── Data layer ───────────────────────────────────────────────────────────────

def _get_sessions_by_deck():
    # Legacy JSON sessions removed — per-card SQLite is now used instead.
    return {}


def _get_due_counts():
    counts = {}
    try:
        tree = mw.col.sched.deck_due_tree()
        def traverse(node):
            did = getattr(node, 'deck_id', None)
            if did:
                counts[did] = {
                    'new':      getattr(node, 'new_count',    0),
                    'learning': getattr(node, 'learn_count',  0),
                    'review':   getattr(node, 'review_count', 0),
                }
            for child in getattr(node, 'children', []):
                traverse(child)
        traverse(tree)
    except Exception as e:
        logger.error("CustomScreens: due_counts error: %s", e)
    return counts


def _get_card_distribution():
    dist = {}
    try:
        rows = mw.col.db.all("SELECT did, ivl, queue FROM cards")
        for did, ivl, queue in rows:
            if did not in dist:
                dist[did] = [0, 0, 0, 0]
            dist[did][3] += 1
            if queue == 0:
                dist[did][2] += 1
            elif ivl >= 21:
                dist[did][0] += 1
            else:
                dist[did][1] += 1
    except Exception as e:
        logger.error("CustomScreens: card_distribution error: %s", e)
    return dist


def _build_deck_tree(all_decks, due_counts, card_dist, sessions_by_deck):
    by_name = {}
    for deck in sorted(all_decks, key=lambda d: d.name):
        parts = deck.name.split('::')
        due = due_counts.get(deck.id, {'new': 0, 'learning': 0, 'review': 0})
        cd  = card_dist.get(deck.id, [0, 0, 0, 0])
        by_name[deck.name] = {
            'id':          deck.id,
            'name':        deck.name,
            'display':     parts[-1],
            'due_new':     due['new'],
            'due_learn':   due['learning'],
            'due_review':  due['review'],
            'agg_mature':  cd[0],
            'agg_young':   cd[1],
            'agg_new':     cd[2],
            'agg_total':   cd[3],
            'sessions':    sessions_by_deck.get(deck.name, []),
            'children':    [],
        }

    roots = []
    for name, node in by_name.items():
        parts = name.split('::')
        if len(parts) == 1:
            roots.append(node)
        else:
            parent = '::'.join(parts[:-1])
            if parent in by_name:
                by_name[parent]['children'].append(node)
            else:
                roots.append(node)

    def aggregate(node):
        for child in node['children']:
            aggregate(child)
            node['agg_mature'] += child['agg_mature']
            node['agg_young']  += child['agg_young']
            node['agg_new']    += child['agg_new']
            node['agg_total']  += child['agg_total']

    for root in roots:
        aggregate(root)

    return sorted(roots, key=lambda n: n['name'])


# ─── HTML helpers ──────────────────────────────────────────────────────────────

def _esc(s):
    return (s.replace('&', '&amp;').replace('<', '&lt;')
             .replace('>', '&gt;').replace('"', '&quot;'))


def _nav_action(did):
    return f"window._apAction={{type:'nav',did:{did}}}"

def _study_action(did):
    """Go directly into study/session for this deck."""
    return f"window._apAction={{type:'study',did:{did}}}"


def _stats_inline(node):
    """Just the colored due-count numbers, no box, no button."""
    parts = []
    if node['due_new']:    parts.append(f'<span style="font-family:ui-monospace,monospace;font-size:11px;font-weight:600;color:var(--ds-stat-new);font-variant-numeric:tabular-nums;">{node["due_new"]}</span>')
    if node['due_learn']:  parts.append(f'<span style="font-family:ui-monospace,monospace;font-size:11px;font-weight:600;color:var(--ds-stat-learning);font-variant-numeric:tabular-nums;">{node["due_learn"]}</span>')
    if node['due_review']: parts.append(f'<span style="font-family:ui-monospace,monospace;font-size:11px;font-weight:600;color:var(--ds-stat-review);font-variant-numeric:tabular-nums;">{node["due_review"]}</span>')
    if not parts:
        return ''
    return f'<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">{"".join(parts)}</div>'


def _session_dot(sessions):
    if not sessions:
        return ''
    return '<span style="width:6px;height:6px;border-radius:50%;flex-shrink:0;background:var(--ds-accent);box-shadow:0 0 4px rgba(10,132,255,0.5);"></span>'


_CHEV_SVG = (
    '<svg width="8" height="8" viewBox="0 0 10 10" fill="none">'
    '<path d="M3.5 2L7 5L3.5 8" stroke="currentColor" stroke-width="1.6"'
    ' stroke-linecap="round" stroke-linejoin="round"/>'
    '</svg>'
)


def _child_row(node, depth=0):
    """Render a child row inside a deck card — flat, no box.

    Navigation rules:
      - Leaf: click anywhere → study
      - Parent: click row → expand/collapse, hover NAME → white + click → study
    """
    did    = node['id']
    name   = _esc(node['display'])
    has_ch = bool(node['children'])
    stats  = _stats_inline(node)
    sdot   = _session_dot(node['sessions'])

    pl = 14 + depth * 18
    text_color = 'var(--ds-text-secondary)' if depth == 0 else 'var(--ds-text-tertiary)'
    text_size  = '13px' if depth == 0 else '12px'
    text_weight = '500' if depth == 0 else '400'

    if has_ch:
        chev = (f'<span class="ap-chev" style="flex-shrink:0;width:16px;display:flex;align-items:center;'
                f'justify-content:center;color:var(--ds-text-muted);transition:transform 0.18s;">{_CHEV_SVG}</span>')
        sub_rows  = ''.join(_child_row(c, depth + 1) for c in node['children'])
        sub_block = f'<div class="ap-sub ap-hidden">{sub_rows}</div>'
        row_click = 'apToggle(this)'
        name_html = (
            f'<span class="ap-name" style="flex:1;font-size:{text_size};font-weight:{text_weight};color:{text_color};'
            f'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;cursor:pointer;'
            f'transition:color 0.12s;"'
            f' onmouseover="this.style.color=\'var(--ds-text-primary)\'"'
            f' onmouseout="this.style.color=\'{text_color}\'"'
            f' onclick="event.stopPropagation();{_study_action(did)}">'
            f'{name}</span>'
        )
    else:
        chev = f'<span style="flex-shrink:0;width:16px;"></span>'
        sub_block = ''
        row_click = _study_action(did)
        name_html = (
            f'<span style="flex:1;font-size:{text_size};font-weight:{text_weight};color:{text_color};'
            f'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;'
            f'cursor:pointer;transition:color 0.12s;"'
            f' onmouseover="this.style.color=\'var(--ds-text-primary)\'"'
            f' onmouseout="this.style.color=\'{text_color}\'">'
            f'{name}</span>'
        )

    return (
        f'<div class="ap-cwrap" data-did="{did}">'
        f'<div class="ap-row" style="display:flex;align-items:center;gap:8px;padding-left:{pl}px;padding-right:12px;'
        f'cursor:pointer;user-select:none;min-height:36px;'
        f'border-bottom:1px solid var(--ds-border-subtle);"'
        f' onmouseover="this.style.background=\'var(--ds-hover-tint)\'"'
        f' onmouseout="this.style.background=\'transparent\'"'
        f' onclick="{row_click}">'
        f'{chev}'
        f'{sdot}'
        f'{name_html}'
        f'{stats}'
        f'</div>'
        f'{sub_block}'
        f'</div>\n'
    )


def _deck_card(node, idx):
    """Render a top-level deck as a slim card with children inside.
    No 'Lernen' button, no progress bar — just name + inline stats.
    Click name → study, click card header → expand/collapse children.
    """
    did  = node['id']
    name = _esc(node['display'])
    stats = _stats_inline(node)
    sdot = _session_dot(node['sessions'])
    has_ch = bool(node['children'])

    # Children section
    children_html = ''
    if has_ch:
        rows = ''.join(_child_row(c, depth=0) for c in node['children'])
        children_html = f'<div class="ap-sub ap-hidden" style="border-top:1px solid var(--ds-border-subtle);">{rows}</div>'

    delay = f'animation-delay:{idx * 0.04}s'

    # Header click: if has children → toggle, else → study
    if has_ch:
        header_click = 'apToggle(this)'
        chev = (f'<span class="ap-chev" style="flex-shrink:0;width:16px;display:flex;align-items:center;'
                f'justify-content:center;color:var(--ds-text-muted);transition:transform 0.18s;">{_CHEV_SVG}</span>')
        # Name hover → white, click → study
        name_el = (
            f'<span class="ap-name" style="flex:1;font-size:14px;font-weight:600;letter-spacing:-0.15px;'
            f'color:var(--ds-text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;'
            f'cursor:pointer;transition:color 0.12s;"'
            f' onmouseover="this.style.color=\'#fff\'"'
            f' onmouseout="this.style.color=\'var(--ds-text-primary)\'"'
            f' onclick="event.stopPropagation();{_study_action(did)}">'
            f'{name}</span>'
        )
    else:
        header_click = _study_action(did)
        chev = ''
        name_el = (
            f'<span style="flex:1;font-size:14px;font-weight:600;letter-spacing:-0.15px;'
            f'color:var(--ds-text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;'
            f'cursor:pointer;transition:color 0.12s;"'
            f' onmouseover="this.style.color=\'#fff\'"'
            f' onmouseout="this.style.color=\'var(--ds-text-primary)\'">'
            f'{name}</span>'
        )

    return (
        f'<div class="ap-card ap-cwrap" data-did="{did}" style="margin-bottom:6px;border-radius:14px;overflow:hidden;'
        f'background:var(--ds-bg-canvas);border:1px solid var(--ds-border-subtle);{delay}">'
        f'<div class="ap-row" style="display:flex;align-items:center;gap:8px;padding:11px 14px;cursor:pointer;user-select:none;"'
        f' onmouseover="this.style.background=\'var(--ds-hover-tint)\'"'
        f' onmouseout="this.style.background=\'transparent\'"'
        f' onclick="{header_click}">'
        f'{chev}'
        f'{sdot}'
        f'{name_el}'
        f'{stats}'
        f'</div>'
        f'{children_html}'
        f'</div>\n'
    )


# ─── Shared top bar builder ──────────────────────────────────────────────────

def _get_profile_name():
    """Get the current Anki profile name."""
    try:
        if mw and mw.pm:
            return mw.pm.name or ''
    except Exception:
        pass
    return ''


def _top_bar(active_tab='stapel', deck_name='', due_new=0, due_learn=0, due_review=0):
    """Build the shared top bar with tabs and stats.
    Layout: [Deck Name left] ... [Tabs centered] ... [Stats right]
    Account widget is rendered separately at fixed bottom-left.
    """
    def tab_cls(tab_name):
        if tab_name == active_tab:
            return 'tab-btn tab-active px-4 py-[5px] text-xs font-semibold rounded-md cursor-default'
        return 'tab-btn px-4 py-[5px] text-xs font-medium rounded-md cursor-pointer transition-colors'

    stapel_onclick = '' if active_tab == 'stapel' else " onclick=\"window._apAction={type:'cmd',cmd:'decks'}\""
    session_onclick = '' if active_tab == 'session' else " onclick=\"window._apAction={type:'cmd',cmd:'study'}\""
    statistik_onclick = " onclick=\"window._apAction={type:'cmd',cmd:'stats'}\""

    # Unified text style for left-side info (same across all views)
    left_text_style = 'font-size:11px;font-weight:600;color:var(--ds-text-tertiary);'

    total_due = due_new + due_learn + due_review
    deck_display = _esc(deck_name.split('::')[-1]) if deck_name else ''

    if active_tab == 'stapel':
        # Stapel: "Heute: X Karten" on the left
        if total_due > 0:
            left_html = f'<span style="{left_text_style}">Heute: {total_due} Karten</span>'
        else:
            left_html = ''

        # Right side: colored dot + label legend
        legend_items = []
        legend_items.append(f'<span style="display:flex;align-items:center;gap:4px;">'
                           f'<span style="width:6px;height:6px;border-radius:50%;background:var(--ds-stat-new);"></span>'
                           f'<span style="font-size:10px;font-weight:500;color:var(--ds-stat-new);">Neu</span></span>')
        legend_items.append(f'<span style="display:flex;align-items:center;gap:4px;">'
                           f'<span style="width:6px;height:6px;border-radius:50%;background:var(--ds-stat-learning);"></span>'
                           f'<span style="font-size:10px;font-weight:500;color:var(--ds-stat-learning);">Fällig</span></span>')
        legend_items.append(f'<span style="display:flex;align-items:center;gap:4px;">'
                           f'<span style="width:6px;height:6px;border-radius:50%;background:var(--ds-stat-review);"></span>'
                           f'<span style="font-size:10px;font-weight:500;color:var(--ds-stat-review);">Wieder</span></span>')
        right_html = f'<div style="display:flex;align-items:center;gap:10px;">{"".join(legend_items)}</div>'
    else:
        # Session/other views: deck name on left (same unified style), numbers on right
        left_html = f'<span style="{left_text_style}max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{deck_display}</span>' if deck_display else ''
        right_html = (
            f'<div style="display:flex;align-items:baseline;gap:8px;">'
            f'<span style="font-family:ui-monospace,monospace;font-size:11px;font-weight:600;color:var(--ds-stat-new);font-variant-numeric:tabular-nums;">{due_new}</span>'
            f'<span style="font-family:ui-monospace,monospace;font-size:11px;font-weight:600;color:var(--ds-stat-learning);font-variant-numeric:tabular-nums;">{due_learn}</span>'
            f'<span style="font-family:ui-monospace,monospace;font-size:11px;font-weight:600;color:var(--ds-stat-review);font-variant-numeric:tabular-nums;">{due_review}</span>'
            f'</div>'
        )

    return (
        f'<div class="flex items-center justify-between px-5 h-12 z-50 flex-shrink-0" style="background:transparent;">'
        f'<div class="flex-1 flex items-center">{left_html}</div>'
        f'<div class="flex items-center gap-0.5 p-[3px] rounded-lg" style="background:var(--ds-hover-tint);">'
        f'<button class="{tab_cls("stapel")}"{stapel_onclick}>Stapel</button>'
        f'<button class="{tab_cls("session")}"{session_onclick}>Session</button>'
        f'<button class="{tab_cls("statistik")}"{statistik_onclick}>Statistik</button>'
        f'</div>'
        f'<div class="flex-1 flex justify-end">{right_html}</div>'
        f'</div>'
    )


def _account_widget():
    """Build the fixed bottom-right settings widget.
    Shows 'AnkiPlus' + tier badge. Flat, rectangular, minimal.
    """
    # Check premium status — authenticated + validated = Pro
    is_premium = False
    try:
        from ..config import get_config
        _cfg = get_config()
        is_premium = bool(_cfg.get('auth_token', '').strip()) and _cfg.get('auth_validated', False)
    except Exception:
        pass

    if is_premium:
        badge_html = (
            '<span style="font-size:9px;font-weight:600;letter-spacing:0.5px;padding:2px 7px;'
            'border-radius:4px;background:rgba(10,132,255,0.12);color:rgba(10,132,255,0.7);">PRO</span>'
        )
    else:
        badge_html = (
            '<span style="font-size:9px;font-weight:600;letter-spacing:0.5px;padding:2px 7px;'
            'border-radius:4px;background:var(--ds-hover-tint);color:var(--ds-text-muted);">Free</span>'
        )

    return (
        f'<style>'
        f'.ap-settings-btn{{'
        f'  display:flex;align-items:center;gap:7px;padding:6px 11px;border-radius:6px;'
        f'  background:var(--ds-hover-tint);border:1px solid var(--ds-border-subtle);'
        f'  cursor:pointer;font-family:inherit;transition:all 0.15s ease;'
        f'}}'
        f'.ap-settings-btn:hover{{'
        f'  background:var(--ds-active-tint);border-color:var(--ds-active-tint);'
        f'}}'
        f'.ap-settings-btn:hover .ap-uname{{color:var(--ds-text-secondary)!important}}'
        f'.ap-settings-btn:active{{transform:scale(0.97)}}'
        f'</style>'
        f'<div style="position:fixed;bottom:0;right:0;padding:12px 18px;z-index:9998;">'
        f'<button class="ap-settings-btn"'
        f' onclick="window._apAction={{type:\'cmd\',cmd:\'settings\'}}">'
        f'<span class="ap-uname" style="font-size:11px;font-weight:500;color:var(--ds-text-placeholder);'
        f'white-space:nowrap;transition:color 0.15s;">AnkiPlus</span>'
        f'{badge_html}'
        f'</button>'
        f'</div>'
    )


# ─── Page wrapper ─────────────────────────────────────────────────────────────

_PAGE_CSS = """
/* Nuclear hide for ALL native Anki UI elements */
#top, #topbutt, #outer-top, .top-area,
#bottom, #bottombutt, #outer-bottom, .bottom-area,
#qa-controls, .bottom-bar, .top-bar,
div[id^="top"]:not(#ap-page *),
div[id^="bottom"]:not(#ap-page *) {
    display: none !important;
    visibility: hidden !important;
    height: 0 !important;
    min-height: 0 !important;
    max-height: 0 !important;
    overflow: hidden !important;
    pointer-events: none !important;
    position: absolute !important;
    left: -9999px !important;
    opacity: 0 !important;
}

html, body {
    background: var(--ds-bg-canvas);
    color: var(--ds-text-primary) !important;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif !important;
    -webkit-font-smoothing: antialiased !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
}
*, *::before, *::after { box-sizing: border-box !important; }

.scrollbar-hide::-webkit-scrollbar { display: none; }
.scrollbar-hide { scrollbar-width: none; -ms-overflow-style: none; }

/* Tab Bar */
.tab-btn {
    box-shadow: none !important;
    outline: none !important;
    border: none !important;
    color: var(--ds-text-tertiary);
    background: transparent;
}
.tab-btn:hover {
    box-shadow: none !important;
    outline: none !important;
    border: none !important;
    color: var(--ds-text-secondary);
    background: var(--ds-hover-tint);
}
.tab-btn.tab-active {
    box-shadow: 0 1px 2px rgba(0,0,0,0.2) !important;
    color: var(--ds-text-primary);
    background: var(--ds-active-tint);
}

/* Canvas background: dot grid fading out radially — same as reviewer */
.canvas-bg {
    position: relative;
}
.canvas-bg::before {
    content: '';
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background-image: radial-gradient(circle, var(--ds-hover-tint) 1px, transparent 1px);
    background-size: 24px 24px;
    -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 40%, black 0%, transparent 100%);
    mask-image: radial-gradient(ellipse 70% 60% at 50% 40%, black 0%, transparent 100%);
    pointer-events: none;
    z-index: 0;
    transition: opacity 350ms ease;
}
.canvas-bg.chat-active::before { opacity: 0; }
.canvas-bg.no-transition::before { transition: none !important; }
.canvas-content {
    position: relative;
    z-index: 1;
}

.ap-card {
    animation: apFadeUp 0.25s ease both;
}
@keyframes apFadeUp {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
}

.ap-hidden { display: none !important; }
.ap-row.open > .ap-chev { transform: rotate(90deg) !important; }

/* ─── Free Chat Dock ─── */
@property --ap-dock-angle {
    syntax: '<angle>';
    initial-value: 0deg;
    inherits: false;
}
@keyframes apDockBorderRotate {
    from { --ap-dock-angle: 0deg; }
    to   { --ap-dock-angle: 360deg; }
}
.ap-dock-snake {
    position: absolute;
    inset: -1px;
    border-radius: 17px;
    padding: 1px;
    background: conic-gradient(
        from var(--ap-dock-angle) at 50% 100%,
        rgba(10,132,255,0.0) 0deg,
        rgba(10,132,255,0.5) 60deg,
        rgba(10,132,255,0.1) 120deg,
        rgba(10,132,255,0.0) 180deg,
        rgba(10,132,255,0.1) 240deg,
        rgba(10,132,255,0.5) 300deg,
        rgba(10,132,255,0.0) 360deg
    );
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.3s ease;
    animation: apDockBorderRotate 4s linear infinite;
}
.ap-dock-snake.active { opacity: 1; }
.ap-dock-action {
    flex: 1; display: flex; align-items: center; justify-content: center;
    gap: 4px; height: 44px; background: none; border: none; cursor: pointer;
    font-family: inherit; font-size: 13px; transition: background 0.1s; padding: 0 12px;
}
.ap-dock-action:hover { background: var(--ds-hover-tint); }
#ap-chat-input, #ap-chat-input:focus, #ap-chat-input:hover, #ap-chat-input:active {
    outline: none !important; border: none !important;
    background: transparent !important; resize: none !important;
    box-shadow: none !important; min-height: unset !important;
}

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
    color: var(--ds-text-primary);
    line-height: 1;
}
.ap-wm-tld {
    font-family: -apple-system, "SF Pro Display", system-ui, sans-serif;
    font-size: 46px;
    font-weight: 300;
    letter-spacing: -1px;
    color: var(--ds-text-muted);
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
    background: var(--ds-hover-tint);
    border: 1px solid var(--ds-border-medium);
    color: var(--ds-text-placeholder);
}
.ap-wm-badge--pro {
    background: rgba(10,132,255,0.1);
    border: 1px solid rgba(10,132,255,0.22);
    color: rgba(10,132,255,0.72);
}

/* ─── Pill Search Bar ─── */
#ap-search-wrap {
    max-width: 720px;
    width: 100%;
    margin: 0 auto;
    padding-top: 64px;
}
#ap-search-bar {
    border-radius: var(--ds-radius-lg);
    height: 46px;
    padding: 0 16px 0 20px;
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--ds-bg-frosted);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid var(--ds-border-medium);
    box-shadow: var(--ds-shadow-md);
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
    color: var(--ds-text-primary);
    font-size: 14px;
    font-family: inherit;
    min-width: 0;
}
#ap-search-input::placeholder { color: transparent; }
#ap-send-btn {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%) scale(0.75);
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--ds-accent);
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.15s, transform 0.15s;
    pointer-events: none;
}
#ap-send-btn.ap-send-visible {
    opacity: 1;
    transform: translateY(-50%) scale(1);
    pointer-events: auto;
}
#ap-cmdk-badge {
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 10px;
    font-weight: 500;
    color: var(--ds-text-muted);
    background: var(--ds-border-subtle);
    border: none;
    border-radius: 5px;
    padding: 2px 6px;
    flex-shrink: 0;
    line-height: 1.3;
    pointer-events: none;
    transition: opacity 0.15s;
}
#ap-cmdk-badge.ap-hidden { opacity: 0; }
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
    color: var(--ds-text-muted);
    position: absolute;
    white-space: nowrap;
    transition: opacity 0.4s ease;
    top: 0;
    left: 0;
    transform: translateY(-50%);
}
.ap-ph--hidden { opacity: 0; }

/* ─── Chat exchange (Style B) ─── */
.ap-exchange { margin-bottom: 40px; max-width: 720px; }
.ap-user-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ds-text-placeholder);
    margin-bottom: 6px;
}
.ap-user-q {
    font-size: 19px;
    font-weight: 600;
    color: var(--ds-text-primary);
    line-height: 1.35;
    margin-bottom: 20px;
}
.ap-ai-prose {
    font-size: 15px;
    font-weight: 400;
    color: var(--ds-text-secondary);
    line-height: 1.7;
}
/* Streaming cursor */
.ap-cursor {
    display: inline-block;
    width: 2px;
    height: 1em;
    background: var(--ds-text-secondary);
    margin-left: 2px;
    vertical-align: text-bottom;
    animation: apCursorBlink 0.9s step-start infinite;
}
@keyframes apCursorBlink {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0; }
}
.ap-search-spacer { margin-top: 24px; }

/* ─── Exchange separator ─── */
.ap-exchange-sep {
    height: 1px;
    background: var(--ds-border-subtle);
    margin: 16px 0 20px;
    border: none;
}

/* ─── Loading dots pulse ─── */
@keyframes apDotPulse {
    0%, 80%, 100% { opacity: 0.2; }
    40%           { opacity: 1; }
}
#ap-loading-dots span:nth-child(1) { animation: apDotPulse 1.2s ease-in-out infinite; }
#ap-loading-dots span:nth-child(2) { animation: apDotPulse 1.2s ease-in-out 0.2s infinite; }
#ap-loading-dots span:nth-child(3) { animation: apDotPulse 1.2s ease-in-out 0.4s infinite; }
"""

_TOGGLE_JS = """
/* Persistent expand state via localStorage */
var _expandState = {};
try { _expandState = JSON.parse(localStorage.getItem('ap_expand') || '{}'); } catch(e) {}
function _saveExpand() { try { localStorage.setItem('ap_expand', JSON.stringify(_expandState)); } catch(e) {} }

function apToggle(row) {
  var wrap = row.parentElement;
  if (!wrap) return;
  var sub = wrap.querySelector(':scope > .ap-sub');
  if (!sub) return;
  var did = wrap.dataset.did || '';
  var isHidden = sub.className.indexOf('ap-hidden') !== -1;
  if (isHidden) {
    sub.className = sub.className.replace(/\\bap-hidden\\b/g, '').trim();
    row.className += ' open';
    if (did) { _expandState[did] = true; _saveExpand(); }
  } else {
    sub.className += ' ap-hidden';
    row.className = row.className.replace(/\\bopen\\b/g, '').trim();
    if (did) { _expandState[did] = false; _saveExpand(); }
  }
}

/* Auto-expand on load: restore all expand states from localStorage.
   First top-level card opens by default unless explicitly closed. */
function apInitExpand() {
  /* Top-level cards (.ap-card) */
  var topCards = document.querySelectorAll('.ap-card.ap-cwrap[data-did]');
  topCards.forEach(function(wrap, idx) {
    var did = wrap.dataset.did;
    var row = wrap.querySelector(':scope > .ap-row');
    var sub = wrap.querySelector(':scope > .ap-sub');
    if (!row || !sub) return;
    var shouldOpen = (idx === 0 && _expandState[did] !== false) || _expandState[did] === true;
    if (shouldOpen) {
      sub.className = sub.className.replace(/\\bap-hidden\\b/g, '').trim();
      row.className += ' open';
    }
  });
  /* Nested child wraps */
  var childWraps = document.querySelectorAll('.ap-cwrap[data-did]:not(.ap-card)');
  childWraps.forEach(function(wrap) {
    var did = wrap.dataset.did;
    if (_expandState[did] !== true) return;
    var row = wrap.querySelector(':scope > .ap-row');
    var sub = wrap.querySelector(':scope > .ap-sub');
    if (!row || !sub) return;
    sub.className = sub.className.replace(/\\bap-hidden\\b/g, '').trim();
    row.className += ' open';
  });
}
/* Run on DOMContentLoaded AND as fallback immediately if document is already loaded */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', apInitExpand);
} else {
  apInitExpand();
}

window._apAction = null;
"""


def _wrap_page(top_bar_html, content_html, extra_js='', show_account_widget=True):
    """Wrap content in the shared page layout with DaisyUI theme — same as reviewer."""
    try:
        from .theme import get_resolved_theme
    except ImportError:
        from ui.theme import get_resolved_theme
    resolved_theme = get_resolved_theme()
    reviewer_css = _load_reviewer_css()
    design_tokens = _get_design_tokens_css()
    return (
        f'<!DOCTYPE html>'
        f'<html lang="de" data-theme="{resolved_theme}">'
        f'<head><meta charset="utf-8">'
        f'<meta name="viewport" content="width=device-width, initial-scale=1.0">'
        f'<style>{design_tokens}\n{reviewer_css}\n{_PAGE_CSS}\n'
        f'html {{ color-scheme: {resolved_theme}; }}'
        f'</style>'
        f'</head>'
        f'<body class="bg-base-100 text-base-content overflow-hidden m-0 p-0">'
        f'<div id="ap-page" class="h-screen flex flex-col overflow-hidden">'
        f'{top_bar_html}'
        f'<main class="canvas-bg flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide">'
        f'<div class="canvas-content">'
        f'{content_html}'
        f'</div>'
        f'</main>'
        f'{_account_widget() if show_account_widget else ""}'
        f'</div>'
        f'<script>{_TOGGLE_JS}{extra_js}</script>'
        f'{_get_plusi_dock_html()}'
        f'</body></html>'
    )


# ─── Deck Browser ─────────────────────────────────────────────────────────────

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
    <kbd id="ap-cmdk-badge">⌘K</kbd>
    <button id="ap-send-btn" aria-label="Senden">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
           stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 19V5M5 12l7-7 7 7"/>
      </svg>
    </button>
  </div>
</div>
<div class="ap-search-spacer" style="height:8px;"></div>
"""


_SEARCHBAR_JS = """
(function(){
  /* ── DOM refs ── */
  var sbInput   = document.getElementById('ap-search-input');
  var sbSnake   = document.getElementById('ap-sb-snake');
  var sbSend    = document.getElementById('ap-send-btn');
  var cmdkBadge = document.getElementById('ap-cmdk-badge');
  var phWrap    = document.getElementById('ap-placeholder-wrap');
  var phA       = document.getElementById('ap-placeholder-a');
  var phB       = document.getElementById('ap-placeholder-b');

  /* ── Global keyboard shortcut: ⌘K / Ctrl+K — focus search bar ── */
  document.addEventListener('keydown', function(e){
    if ((e.metaKey||e.ctrlKey) && e.key==='k') {
      e.preventDefault();
      if (sbInput) sbInput.focus();
    }
  });

  /* ── Search bar wiring ── */
  if (!sbInput) return; /* guard: HTML must be present */

  /* Platform-aware ⌘K badge */
  var isMac = ((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '').toUpperCase().indexOf('MAC') >= 0;
  if (cmdkBadge && !isMac) cmdkBadge.textContent = 'Ctrl+K';

  /* Focus / blur */
  sbInput.addEventListener('focus', function(){
    if (sbSnake) sbSnake.classList.add('active');
    if (cmdkBadge) cmdkBadge.classList.add('ap-hidden');
  });
  sbInput.addEventListener('blur', function(){
    if (sbSnake) sbSnake.classList.remove('active');
    var hasText = sbInput.value.trim().length > 0;
    if (cmdkBadge && !hasText) cmdkBadge.classList.remove('ap-hidden');
  });

  /* Send button + badge visibility — single source of truth */
  sbInput.addEventListener('input', function(){
    var hasText = sbInput.value.trim().length > 0;
    var isFocused = document.activeElement === sbInput;
    if (sbSend) sbSend.classList.toggle('ap-send-visible', hasText);
    if (cmdkBadge) cmdkBadge.classList.toggle('ap-hidden', hasText || isFocused);
    if (phWrap) phWrap.style.opacity = hasText ? '0' : '1';
  });

  /* Enter / send button → trigger overlay chat */
  function submitSearch() {
    var t = sbInput.value.trim();
    if (!t) return;
    window._apAction = {type:'freeChat', text:t};
    sbInput.value = '';
    sbInput.dispatchEvent(new Event('input')); /* triggers visibility reset */
  }
  function openChatEmpty() {
    window._apAction = {type:'freeChat', text:' '};
  }
  sbInput.addEventListener('keydown', function(e){
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitSearch(); }
  });
  if (sbSend) sbSend.addEventListener('click', submitSearch);
  /* Double-tap on search bar opens chat without text */
  sbInput.addEventListener('dblclick', openChatEmpty);

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
  var _phInterval = setInterval(function(){
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
      var tld = document.querySelector('.ap-wm-tld');
      if (tld) tld.style.color = 'rgba(10,132,255,0.72)';
    }
    badge.onclick = function(){ window._apAction = {type:'upgradeBadge'}; };
  }

})();
"""


def _deck_browser_html(tree, total_decks, total_new=0, total_learn=0, total_review=0, tier='free'):
    cards_html = ''.join(_deck_card(node, i) for i, node in enumerate(tree))
    if not cards_html:
        cards_html = (
            '<div style="padding:40px 20px;text-align:center;color:rgba(255,255,255,0.2);font-size:13px;">'
            'Keine Decks vorhanden.</div>'
        )

    content = (
        f'<div id="ap-deck-content" style="transition:opacity 250ms ease,transform 250ms ease;">'
        f'<div style="max-width:720px;margin:0 auto;padding:20px 24px 80px;">'
        f'{_SEARCHBAR_HTML}'
        f'{cards_html}'
        f'</div>'
        f'</div>'
    )

    top_bar = _top_bar(active_tab='stapel', due_new=total_new, due_learn=total_learn, due_review=total_review)
    tier_js = f'document.body.dataset.tier = "{tier}";'
    return _wrap_page(top_bar, content, extra_js=tier_js + _SEARCHBAR_JS, show_account_widget=False)


# ─── Overview ─────────────────────────────────────────────────────────────────

def _overview_html(deck_name, new_c, lrn_c, rev_c):
    total    = new_c + lrn_c + rev_c
    display  = deck_name.split('::')[-1] if '::' in deck_name else deck_name
    path     = ' › '.join(deck_name.split('::')[:-1]) if '::' in deck_name else ''
    display  = _esc(display)
    path_esc = _esc(path)
    lbl      = 'Jetzt lernen' if total > 0 else 'Keine Karten fällig'
    disabled = '' if total > 0 else 'disabled'
    path_html = f'<div style="font-size:10px;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;color:var(--ds-text-muted);margin-bottom:10px;text-align:center;">{path_esc}</div>' if path else ''

    pill_style = 'display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 22px;border-radius:16px;background:var(--ds-bg-overlay);border:1px solid var(--ds-border-subtle);min-width:80px;'
    btn_style = ('padding:14px 52px;border-radius:12px;font-size:16px;font-weight:600;border:none;cursor:pointer;'
                 'font-family:inherit;margin-bottom:20px;letter-spacing:-0.1px;transition:opacity 0.12s,transform 0.08s;')
    if total > 0:
        btn_style += 'background:var(--ds-accent);color:#fff;'
    else:
        btn_style += 'background:var(--ds-bg-overlay);color:var(--ds-text-muted);cursor:default;border:1px solid var(--ds-border-subtle);'

    act_style = 'background:none;border:none;color:var(--ds-text-muted);font-size:13px;cursor:pointer;font-family:inherit;padding:4px 2px;transition:color 0.1s;'

    content = (
        f'<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100%;padding:48px 28px;">'
        f'{path_html}'
        f'<div style="font-size:30px;font-weight:700;color:var(--ds-text-primary);margin-bottom:28px;text-align:center;letter-spacing:-0.6px;">{display}</div>'
        f'<div style="display:flex;gap:10px;margin-bottom:36px;">'
        f'<div style="{pill_style}">'
        f'<span style="font-size:26px;font-weight:700;letter-spacing:-0.5px;font-variant-numeric:tabular-nums;color:var(--ds-accent);">{new_c}</span>'
        f'<span style="font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--ds-stat-new);">Neu</span>'
        f'</div>'
        f'<div style="{pill_style}">'
        f'<span style="font-size:26px;font-weight:700;letter-spacing:-0.5px;font-variant-numeric:tabular-nums;color:var(--ds-yellow);">{lrn_c}</span>'
        f'<span style="font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--ds-stat-learning);">Lernen</span>'
        f'</div>'
        f'<div style="{pill_style}">'
        f'<span style="font-size:26px;font-weight:700;letter-spacing:-0.5px;font-variant-numeric:tabular-nums;color:var(--ds-green);">{rev_c}</span>'
        f'<span style="font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--ds-stat-review);">Wieder</span>'
        f'</div>'
        f'</div>'
        f'<button style="{btn_style}" onclick="window._apAction={{type:\'cmd\',cmd:\'study\'}}" {disabled}>{lbl}</button>'
        f'<div style="display:flex;gap:20px;">'
        f'<button style="{act_style}"'
        f' onmouseover="this.style.color=\'var(--ds-text-secondary)\'"'
        f' onmouseout="this.style.color=\'var(--ds-text-muted)\'"'
        f' onclick="window._apAction={{type:\'cmd\',cmd:\'decks\'}}">← Zurück</button>'
        f'<button style="{act_style}"'
        f' onmouseover="this.style.color=\'var(--ds-text-secondary)\'"'
        f' onmouseout="this.style.color=\'var(--ds-text-muted)\'"'
        f' onclick="window._apAction={{type:\'cmd\',cmd:\'opts\'}}">Optionen</button>'
        f'</div>'
        f'</div>'
    )

    top_bar = _top_bar(active_tab='stapel', deck_name=deck_name, due_new=new_c, due_learn=lrn_c, due_review=rev_c)
    return _wrap_page(top_bar, content)


# ─── Controller ───────────────────────────────────────────────────────────────

_POLL_JS = "(function(){var x=window._apAction;window._apAction=null;return x||null;})()"


class CustomScreens:
    def __init__(self):
        self.active = True
        self._hook_registered = False
        self._poll_timer = None

    def enable(self):
        if not self._hook_registered:
            gui_hooks.webview_will_set_content.append(self._on_webview_content)
            self._hook_registered = True
            logger.info("CustomScreens: Hook registered")
        self.active = True

    def disable(self):
        self.active = False
        self._stop_poll()

    def refresh_if_visible(self):
        try:
            if mw and getattr(mw, 'state', None) == 'deckBrowser' and hasattr(mw, 'deckBrowser'):
                mw.deckBrowser.refresh()
        except Exception as e:
            logger.error("CustomScreens: refresh error: %s", e)

    # ── Python polling navigation ──────────────────────────────────────────────

    def _start_poll(self):
        if self._poll_timer is not None:
            return
        self._poll_timer = QTimer()
        self._poll_timer.timeout.connect(self._poll)
        self._poll_timer.start(100)

    def _stop_poll(self):
        if self._poll_timer is not None:
            self._poll_timer.stop()
            self._poll_timer = None

    def _poll(self):
        try:
            state = getattr(mw, 'state', None)
            if state == 'deckBrowser' and hasattr(mw, 'deckBrowser'):
                mw.deckBrowser.web.page().runJavaScript(_POLL_JS, self._handle_action)
            elif state == 'overview' and hasattr(mw, 'overview'):
                mw.overview.web.page().runJavaScript(_POLL_JS, self._handle_action)
            else:
                self._stop_poll()
        except Exception:
            pass

    def _handle_action(self, action):
        if not action:
            return
        try:
            action_type = action.get('type') if isinstance(action, dict) else None
            if action_type == 'nav':
                did = action.get('did')
                if did:
                    mw.col.decks.select(int(did))
                    mw.onOverview()
            elif action_type == 'study':
                did = action.get('did')
                if did:
                    mw.col.decks.select(int(did))
                    mw.onOverview()
                    # Auto-start study after brief delay for overview to initialize
                    QTimer.singleShot(100, lambda: mw.overview._linkHandler('study'))
            elif action_type == 'freeChat':
                text = action.get('text', '').strip()
                try:
                    from .overlay_chat import show_overlay_chat
                except ImportError:
                    from overlay_chat import show_overlay_chat
                show_overlay_chat(initial_text=text if text else '')
            elif action_type == 'cmd':
                cmd = action.get('cmd', '')
                if cmd == 'study':
                    mw.overview._linkHandler('study')
                elif cmd == 'decks':
                    mw.moveToState('deckBrowser')
                elif cmd == 'opts':
                    mw.overview._linkHandler('opts')
                elif cmd == 'stats':
                    mw.onStats()
                elif cmd == 'createDeck':
                    mw.onCreateDeck()
                elif cmd == 'import':
                    if hasattr(mw, 'handleImport'):
                        mw.handleImport()
                    elif hasattr(mw, 'onImport'):
                        mw.onImport()
                elif cmd == 'settings':
                    # Open addon settings / preferences
                    try:
                        from . import setup
                        if hasattr(setup, 'show_settings'):
                            setup.show_settings()
                        elif hasattr(mw, 'onPrefs'):
                            mw.onPrefs()
                    except Exception:
                        if hasattr(mw, 'onPrefs'):
                            mw.onPrefs()
            elif action_type == 'plusiAsk':
                # Open side panel chat with @Plusi prefix (same behavior as in reviewer)
                try:
                    from . import setup
                    if not (hasattr(setup, '_chatbot_dock') and setup._chatbot_dock and setup._chatbot_dock.isVisible()):
                        if hasattr(setup, 'toggle_chatbot'):
                            setup.toggle_chatbot()
                    chat_widget = getattr(setup, '_chatbot_widget', None)
                    if chat_widget and hasattr(chat_widget, 'web_view'):
                        chat_widget.web_view.page().runJavaScript(
                            "window.dispatchEvent(new CustomEvent('plusi-ask-focus', {detail: {prefix: '@Plusi '}}));"
                        )
                except Exception as e:
                    logger.error("plusiAsk error: %s", e)
            elif action_type == 'plusiSettings':
                try:
                    from . import setup
                    if not (hasattr(setup, '_chatbot_dock') and setup._chatbot_dock and setup._chatbot_dock.isVisible()):
                        if hasattr(setup, 'toggle_chatbot'):
                            setup.toggle_chatbot()
                    chat_widget = getattr(setup, '_chatbot_widget', None)
                    if chat_widget and hasattr(chat_widget, 'web_view'):
                        chat_widget.web_view.page().runJavaScript(
                            "window.dispatchEvent(new CustomEvent('open-settings'));"
                        )
                except Exception as e:
                    logger.error("plusiSettings error: %s", e)
            elif action_type == 'upgradeBadge':
                # Open addon settings — same as 'cmd':'settings'
                try:
                    from . import setup
                    if hasattr(setup, 'show_settings'):
                        setup.show_settings()
                    elif hasattr(mw, 'onPrefs'):
                        mw.onPrefs()
                except Exception:
                    if hasattr(mw, 'onPrefs'):
                        mw.onPrefs()
        except Exception as e:
            logger.exception("CustomScreens: action error: %s", e)

    # ── Hook ──────────────────────────────────────────────────────────────────

    def _on_webview_content(self, web_content, context):
        if not self.active:
            return
        if DeckBrowser and isinstance(context, DeckBrowser):
            self._inject_deck_browser(web_content)
            self._start_poll()
        elif Overview and isinstance(context, Overview):
            self._inject_overview(web_content)
            self._start_poll()

    def _inject_deck_browser(self, web_content):
        try:
            sessions_by_deck = _get_sessions_by_deck()
            due_counts       = _get_due_counts()
            card_dist        = _get_card_distribution()
            all_decks        = list(mw.col.decks.all_names_and_ids())
            tree             = _build_deck_tree(all_decks, due_counts, card_dist, sessions_by_deck)

            # Aggregate total due counts across all decks
            total_new = sum(d.get('new', 0) for d in due_counts.values())
            total_learn = sum(d.get('learning', 0) for d in due_counts.values())
            total_review = sum(d.get('review', 0) for d in due_counts.values())

            # Determine tier for badge — authenticated + validated = Pro
            is_premium = False
            try:
                from ..config import get_config
                _cfg = get_config()
                is_premium = bool(_cfg.get('auth_token', '').strip()) and _cfg.get('auth_validated', False)
            except Exception:
                pass
            tier = 'pro' if is_premium else 'free'

            html             = _deck_browser_html(tree, len(all_decks), total_new, total_learn, total_review, tier=tier)
            web_content.body  = html
            web_content.head  = ''
            logger.info("CustomScreens: ✅ DeckBrowser (%d decks)", len(all_decks))
        except Exception as e:
            logger.exception("CustomScreens: ❌ DeckBrowser: %s", e)

    def _inject_overview(self, web_content):
        try:
            deck_id   = mw.col.decks.get_current_id()
            deck_name = mw.col.decks.name(deck_id)
            counts    = list(mw.col.sched.counts())
            new_c = counts[0] if len(counts) > 0 else 0
            lrn_c = counts[1] if len(counts) > 1 else 0
            rev_c = counts[2] if len(counts) > 2 else 0
            html = _overview_html(deck_name, new_c, lrn_c, rev_c)
            web_content.body  = html
            web_content.head  = ''
            logger.info("CustomScreens: ✅ Overview '%s'", deck_name)
        except Exception as e:
            logger.exception("CustomScreens: ❌ Overview: %s", e)


# Global instance
custom_screens = CustomScreens()
