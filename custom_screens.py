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
import traceback
from aqt import mw, gui_hooks

try:
    from aqt.qt import QTimer
except ImportError:
    from PyQt6.QtCore import QTimer

try:
    from PyQt6.QtCore import QThread, pyqtSignal as _Signal, Qt as _Qt
except ImportError:
    try:
        from PyQt5.QtCore import QThread, pyqtSignal as _Signal, Qt as _Qt
    except ImportError:
        QThread = None
        _Signal = None
        _Qt = None

try:
    from aqt.deckbrowser import DeckBrowser
except ImportError:
    DeckBrowser = None

try:
    from aqt.overview import Overview
except ImportError:
    Overview = None

# NOTE: Legacy sessions_storage (JSON) removed — per-card SQLite is now used instead.


# ─── Shared CSS loader ────────────────────────────────────────────────────────

def _load_reviewer_css():
    """Load compiled reviewer.css (DaisyUI + Tailwind) for shared visual framework."""
    addon_dir = os.path.join(os.path.dirname(__file__), 'custom_reviewer')
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
        print(f"CustomScreens: due_counts error: {e}")
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
        print(f"CustomScreens: card_distribution error: {e}")
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
    if node['due_new']:    parts.append(f'<span style="font-family:ui-monospace,monospace;font-size:11px;font-weight:600;color:rgba(10,132,255,0.75);font-variant-numeric:tabular-nums;">{node["due_new"]}</span>')
    if node['due_learn']:  parts.append(f'<span style="font-family:ui-monospace,monospace;font-size:11px;font-weight:600;color:rgba(255,159,10,0.75);font-variant-numeric:tabular-nums;">{node["due_learn"]}</span>')
    if node['due_review']: parts.append(f'<span style="font-family:ui-monospace,monospace;font-size:11px;font-weight:600;color:rgba(48,209,88,0.75);font-variant-numeric:tabular-nums;">{node["due_review"]}</span>')
    if not parts:
        return ''
    return f'<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">{"".join(parts)}</div>'


def _session_dot(sessions):
    if not sessions:
        return ''
    return '<span style="width:6px;height:6px;border-radius:50%;flex-shrink:0;background:#0a84ff;box-shadow:0 0 4px rgba(10,132,255,0.5);"></span>'


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
    text_color = 'rgba(255,255,255,0.50)' if depth == 0 else 'rgba(255,255,255,0.35)'
    text_size  = '13px' if depth == 0 else '12px'
    text_weight = '500' if depth == 0 else '400'

    if has_ch:
        chev = (f'<span class="ap-chev" style="flex-shrink:0;width:16px;display:flex;align-items:center;'
                f'justify-content:center;color:rgba(255,255,255,0.18);transition:transform 0.18s;">{_CHEV_SVG}</span>')
        sub_rows  = ''.join(_child_row(c, depth + 1) for c in node['children'])
        sub_block = f'<div class="ap-sub ap-hidden">{sub_rows}</div>'
        row_click = 'apToggle(this)'
        name_html = (
            f'<span class="ap-name" style="flex:1;font-size:{text_size};font-weight:{text_weight};color:{text_color};'
            f'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;cursor:pointer;'
            f'transition:color 0.12s;"'
            f' onmouseover="this.style.color=\'rgba(255,255,255,0.95)\'"'
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
            f' onmouseover="this.style.color=\'rgba(255,255,255,0.95)\'"'
            f' onmouseout="this.style.color=\'{text_color}\'">'
            f'{name}</span>'
        )

    return (
        f'<div class="ap-cwrap" data-did="{did}">'
        f'<div class="ap-row" style="display:flex;align-items:center;gap:8px;padding-left:{pl}px;padding-right:12px;'
        f'cursor:pointer;user-select:none;min-height:36px;'
        f'border-bottom:1px solid rgba(255,255,255,0.035);"'
        f' onmouseover="this.style.background=\'rgba(255,255,255,0.03)\'"'
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
        children_html = f'<div class="ap-sub ap-hidden" style="border-top:1px solid rgba(255,255,255,0.05);">{rows}</div>'

    delay = f'animation-delay:{idx * 0.04}s'

    # Header click: if has children → toggle, else → study
    if has_ch:
        header_click = 'apToggle(this)'
        chev = (f'<span class="ap-chev" style="flex-shrink:0;width:16px;display:flex;align-items:center;'
                f'justify-content:center;color:rgba(255,255,255,0.22);transition:transform 0.18s;">{_CHEV_SVG}</span>')
        # Name hover → white, click → study
        name_el = (
            f'<span class="ap-name" style="flex:1;font-size:14px;font-weight:600;letter-spacing:-0.15px;'
            f'color:rgba(255,255,255,0.88);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;'
            f'cursor:pointer;transition:color 0.12s;"'
            f' onmouseover="this.style.color=\'#fff\'"'
            f' onmouseout="this.style.color=\'rgba(255,255,255,0.88)\'"'
            f' onclick="event.stopPropagation();{_study_action(did)}">'
            f'{name}</span>'
        )
    else:
        header_click = _study_action(did)
        chev = ''
        name_el = (
            f'<span style="flex:1;font-size:14px;font-weight:600;letter-spacing:-0.15px;'
            f'color:rgba(255,255,255,0.88);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;'
            f'cursor:pointer;transition:color 0.12s;"'
            f' onmouseover="this.style.color=\'#fff\'"'
            f' onmouseout="this.style.color=\'rgba(255,255,255,0.88)\'">'
            f'{name}</span>'
        )

    return (
        f'<div class="ap-card ap-cwrap" data-did="{did}" style="margin-bottom:6px;border-radius:14px;overflow:hidden;'
        f'background:#1f1f21;border:1px solid rgba(255,255,255,0.06);{delay}">'
        f'<div class="ap-row" style="display:flex;align-items:center;gap:8px;padding:11px 14px;cursor:pointer;user-select:none;"'
        f' onmouseover="this.style.background=\'rgba(255,255,255,0.03)\'"'
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
            return 'tab-btn tab-active px-4 py-[5px] text-xs font-semibold text-base-content bg-base-content/[0.08] rounded-md cursor-default'
        return ('tab-btn px-4 py-[5px] text-xs font-medium text-base-content/[0.35] bg-transparent rounded-md'
                ' cursor-pointer hover:text-base-content/[0.55] hover:bg-base-content/[0.04] transition-colors')

    stapel_onclick = '' if active_tab == 'stapel' else " onclick=\"window._apAction={type:'cmd',cmd:'decks'}\""
    session_onclick = '' if active_tab == 'session' else " onclick=\"window._apAction={type:'cmd',cmd:'study'}\""
    statistik_onclick = " onclick=\"window._apAction={type:'cmd',cmd:'stats'}\""

    # Unified text style for left-side info (same across all views)
    left_text_style = 'font-size:11px;font-weight:600;color:rgba(255,255,255,0.35);'

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
                           f'<span style="width:6px;height:6px;border-radius:50%;background:rgba(10,132,255,0.85);"></span>'
                           f'<span style="font-size:10px;font-weight:500;color:rgba(10,132,255,0.5);">Neu</span></span>')
        legend_items.append(f'<span style="display:flex;align-items:center;gap:4px;">'
                           f'<span style="width:6px;height:6px;border-radius:50%;background:rgba(255,159,10,0.85);"></span>'
                           f'<span style="font-size:10px;font-weight:500;color:rgba(255,159,10,0.5);">Fällig</span></span>')
        legend_items.append(f'<span style="display:flex;align-items:center;gap:4px;">'
                           f'<span style="width:6px;height:6px;border-radius:50%;background:rgba(48,209,88,0.85);"></span>'
                           f'<span style="font-size:10px;font-weight:500;color:rgba(48,209,88,0.5);">Wieder</span></span>')
        right_html = f'<div style="display:flex;align-items:center;gap:10px;">{"".join(legend_items)}</div>'
    else:
        # Session/other views: deck name on left (same unified style), numbers on right
        left_html = f'<span style="{left_text_style}max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{deck_display}</span>' if deck_display else ''
        right_html = (
            f'<div style="display:flex;align-items:baseline;gap:8px;">'
            f'<span style="font-family:ui-monospace,monospace;font-size:11px;font-weight:600;color:rgba(10,132,255,0.85);font-variant-numeric:tabular-nums;">{due_new}</span>'
            f'<span style="font-family:ui-monospace,monospace;font-size:11px;font-weight:600;color:rgba(255,159,10,0.85);font-variant-numeric:tabular-nums;">{due_learn}</span>'
            f'<span style="font-family:ui-monospace,monospace;font-size:11px;font-weight:600;color:rgba(48,209,88,0.85);font-variant-numeric:tabular-nums;">{due_review}</span>'
            f'</div>'
        )

    return (
        f'<div class="flex items-center justify-between px-5 h-12 z-50 flex-shrink-0" style="background:transparent;">'
        f'<div class="flex-1 flex items-center">{left_html}</div>'
        f'<div class="flex items-center gap-0.5 p-[3px] bg-base-content/[0.04] rounded-lg">'
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
        from .config import get_config
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
            'border-radius:4px;background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.2);">Free</span>'
        )

    return (
        f'<style>'
        f'.ap-settings-btn{{'
        f'  display:flex;align-items:center;gap:7px;padding:6px 11px;border-radius:6px;'
        f'  background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);'
        f'  cursor:pointer;font-family:inherit;transition:all 0.15s ease;'
        f'}}'
        f'.ap-settings-btn:hover{{'
        f'  background:rgba(255,255,255,0.06);border-color:rgba(255,255,255,0.08);'
        f'}}'
        f'.ap-settings-btn:hover .ap-uname{{color:rgba(255,255,255,0.5)!important}}'
        f'.ap-settings-btn:active{{transform:scale(0.97)}}'
        f'</style>'
        f'<div style="position:fixed;bottom:0;right:0;padding:12px 18px;z-index:9998;">'
        f'<button class="ap-settings-btn"'
        f' onclick="window._apAction={{type:\'cmd\',cmd:\'settings\'}}">'
        f'<span class="ap-uname" style="font-size:11px;font-weight:500;color:rgba(255,255,255,0.3);'
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
    background: #1A1A1A;
    color: #e8e8e8 !important;
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
}
.tab-btn:hover {
    box-shadow: none !important;
    outline: none !important;
    border: none !important;
}
.tab-btn.tab-active {
    box-shadow: 0 1px 2px rgba(0,0,0,0.2) !important;
}

/* Canvas background: dot grid fading out radially — same as reviewer */
.canvas-bg {
    position: relative;
}
.canvas-bg::before {
    content: '';
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background-image: radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px);
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
.ap-dock-action:hover { background: rgba(255,255,255,0.04); }
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

/* ─── Pill Search Bar ─── */
#ap-search-wrap {
    max-width: 720px;
    width: 100%;
    margin: 0 auto;
    padding-top: 64px;
}
#ap-search-bar {
    border-radius: 50px;
    height: 46px;
    padding: 0 16px 0 20px;
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
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%) scale(0.75);
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
    color: rgba(255,255,255,0.22);
    background: rgba(255,255,255,0.06);
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
    color: rgba(255,255,255,0.22);
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
.ap-search-spacer { margin-top: 24px; }

/* ─── Exchange separator ─── */
.ap-exchange-sep {
    height: 1px;
    background: rgba(255,255,255,0.06);
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
    reviewer_css = _load_reviewer_css()
    return (
        f'<!DOCTYPE html>'
        f'<html lang="de" data-theme="dark">'
        f'<head><meta charset="utf-8">'
        f'<meta name="viewport" content="width=device-width, initial-scale=1.0">'
        f'<style>{reviewer_css}\n{_PAGE_CSS}</style>'
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

_CHAT_HTML = """
<div id="ap-chat-overlay" style="
  position:fixed;top:48px;left:0;right:0;bottom:0;z-index:50;
  background:transparent;
  opacity:0;
  transition:opacity 220ms ease;
  pointer-events:none;overflow-y:auto;scrollbar-width:none;
">
  <div id="ap-chat-msgs" style="
    max-width:720px;margin:0 auto;padding:20px 20px 130px;
    display:flex;flex-direction:column;gap:10px;
  "></div>
</div>

<div id="ap-chat-dock" style="
  position:fixed;bottom:24px;left:50%;
  transform:translateX(-50%) translateY(14px);
  width:min(720px,calc(100vw - 40px));
  padding:0 20px;z-index:9999;
  opacity:0;pointer-events:none;
  transition:opacity 220ms ease,transform 220ms ease;
">
  <div style="
    position:relative;display:flex;flex-direction:column;border-radius:16px;
    background:#151515;border:1px solid rgba(255,255,255,0.07);
    box-shadow:0 4px 24px rgba(0,0,0,0.4);
  ">
    <div class="ap-dock-snake" id="ap-ci-snake"></div>
    <div style="padding:12px 16px 10px;">
      <textarea id="ap-chat-input" rows="1"
        placeholder="Stelle eine Folgefrage…"
        style="width:100%;min-height:24px;max-height:120px;overflow-y:hidden;
          color:rgba(255,255,255,0.75);font-family:inherit;font-size:15px;line-height:1.625;
          display:block;"
        onfocus="document.getElementById('ap-ci-snake').classList.add('active')"
        onblur="document.getElementById('ap-ci-snake').classList.remove('active')"
      ></textarea>
    </div>
    <div style="display:flex;border-top:1px solid rgba(255,255,255,0.06);position:relative;">
      <button id="ap-btn-close" class="ap-dock-action"
        style="border-bottom-left-radius:16px;color:rgba(255,255,255,0.88);font-weight:600;">
        Schließen <span style="font-family:ui-monospace,monospace;font-size:10px;color:rgba(255,255,255,0.18);margin-left:4px;">ESC</span>
      </button>
      <div style="width:1px;height:16px;background:rgba(255,255,255,0.06);align-self:center;flex-shrink:0;"></div>
      <button id="ap-btn-reset" class="ap-dock-action"
        style="border-bottom-right-radius:16px;color:rgba(255,255,255,0.35);">
        Zurücksetzen <span style="font-family:ui-monospace,monospace;font-size:10px;color:rgba(255,255,255,0.18);margin-left:4px;">⌘X</span>
      </button>
      <!-- Loading + Stop overlay — appears over the action bar when AI is thinking -->
      <div id="ap-dock-loading" style="
        display:none;position:absolute;inset:0;border-bottom-left-radius:16px;border-bottom-right-radius:16px;
        background:#151515;align-items:center;justify-content:space-between;padding:0 16px;gap:10px;
      ">
        <div style="display:flex;align-items:center;gap:8px;flex:1;">
          <span id="ap-loading-dots" style="display:inline-flex;gap:3px;align-items:center;">
            <span style="font-size:8px;color:rgba(255,255,255,0.4);">&#x25cf;</span>
            <span style="font-size:8px;color:rgba(255,255,255,0.4);">&#x25cf;</span>
            <span style="font-size:8px;color:rgba(255,255,255,0.4);">&#x25cf;</span>
          </span>
          <span style="font-size:12px;color:rgba(255,255,255,0.25);">KI denkt…</span>
        </div>
        <button id="ap-btn-stop" style="
          display:flex;align-items:center;gap:5px;padding:5px 12px;
          border-radius:8px;border:1px solid rgba(255,80,80,0.25);
          background:rgba(255,80,80,0.08);color:rgba(255,100,100,0.7);
          font-family:inherit;font-size:12px;cursor:pointer;transition:background 0.12s;
        ">
          &#x25a0; Stopp
        </button>
      </div>
    </div>
  </div>
</div>
"""

_CHAT_JS = """
(function(){
  /* ── DOM refs ── */
  var overlay       = document.getElementById('ap-chat-overlay');
  var msgs          = document.getElementById('ap-chat-msgs');
  var dock          = document.getElementById('ap-chat-dock');
  var ci            = document.getElementById('ap-chat-input');
  var deck          = document.getElementById('ap-deck-content');
  var sbInput       = document.getElementById('ap-search-input');
  var sbSnake       = document.getElementById('ap-sb-snake');
  var sbSend        = document.getElementById('ap-send-btn');
  var cmdkBadge     = document.getElementById('ap-cmdk-badge');
  var phWrap        = document.getElementById('ap-placeholder-wrap');
  var phA           = document.getElementById('ap-placeholder-a');
  var phB           = document.getElementById('ap-placeholder-b');
  var dockLoading   = document.getElementById('ap-dock-loading');
  var btnStop       = document.getElementById('ap-btn-stop');

  /* ── State ── */
  var isOpen    = false;
  var isLoading = false;
  var _aiCounter = 0;
  var _curN     = null;

  var DOCK_HIDDEN = 'translateX(-50%) translateY(14px)';
  var DOCK_SHOWN  = 'translateX(-50%) translateY(0)';

  /* ── Helpers ── */
  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── Loading state ── */
  function setLoading(on) {
    isLoading = on;
    if (dockLoading) dockLoading.style.display = on ? 'flex' : 'none';
    if (ci) ci.disabled = on;
  }

  /* ── Chat message persistence for tab switches ── */
  function _saveChatMsgs() {
    try { if (msgs) sessionStorage.setItem('ap_chat_msgs', msgs.innerHTML); } catch(e){}
  }
  function _restoreChatMsgs() {
    try {
      var saved = sessionStorage.getItem('ap_chat_msgs');
      if (saved && msgs) { msgs.innerHTML = saved; msgs.scrollTop = msgs.scrollHeight; }
    } catch(e){}
  }

  /* ── Chat open/close/reset ── */
  var canvasBg = document.querySelector('.canvas-bg');

  function openChat(q) {
    if (isOpen) return; isOpen = true;
    /* Background morph + dots fade */
    document.body.style.transition = 'background-color 350ms ease';
    document.body.style.backgroundColor = '#161616';
    if (canvasBg) canvasBg.classList.add('chat-active');
    /* Deck content slides down and fades out */
    deck.style.transition = 'opacity 300ms ease, transform 300ms ease';
    deck.style.opacity = '0';
    deck.style.transform = 'translateY(30px)';
    deck.style.pointerEvents = 'none';
    setTimeout(function(){
      overlay.style.opacity = '1';
      overlay.style.pointerEvents = 'auto';
      setTimeout(function(){
        dock.style.opacity = '1';
        dock.style.transform = DOCK_SHOWN;
        dock.style.pointerEvents = 'auto';
        ci.focus();
      }, 100);
    }, 120);
    if (q) {
      _curN = addExchange(q);
      setLoading(true);
    }
    /* Persist chat-open state for tab switches */
    try { sessionStorage.setItem('ap_chat_open', '1'); } catch(e){}
    /* Save messages before any tab switch */
    _saveChatMsgs();
  }

  function closeChat() {
    if (!isOpen) return; isOpen = false;
    setLoading(false);
    overlay.style.opacity = '0';
    overlay.style.pointerEvents = 'none';
    dock.style.opacity = '0';
    dock.style.transform = DOCK_HIDDEN;
    dock.style.pointerEvents = 'none';
    /* Restore original background */
    document.body.style.transition = 'background-color 350ms ease';
    document.body.style.backgroundColor = '#1A1A1A';
    if (canvasBg) canvasBg.classList.remove('chat-active');
    /* Deck slides back up */
    setTimeout(function(){
      deck.style.transition = 'opacity 300ms ease, transform 300ms ease';
      deck.style.opacity = '1';
      deck.style.transform = 'translateY(0)';
      deck.style.pointerEvents = 'auto';
    }, 200);
    try { sessionStorage.removeItem('ap_chat_open'); sessionStorage.removeItem('ap_chat_msgs'); } catch(e){}
    window._apAction = {type:'freeChatClose'};
  }

  function resetChat() {
    msgs.innerHTML = '';
    _curN = null;
    setLoading(false);
    _aiCounter = 0;
    try { sessionStorage.removeItem('ap_chat_msgs'); } catch(e){}
  }

  /* ── Message rendering (Style B) ── */
  function addExchange(question) {
    var n = ++_aiCounter;
    var el = document.createElement('div');
    el.className = 'ap-exchange';
    el.innerHTML =
      '<div class="ap-user-label">Du</div>' +
      '<div class="ap-user-q">' + escHtml(question) + '</div>' +
      '<hr class="ap-exchange-sep">' +
      '<div class="ap-ai-prose" id="ap-ai-' + n + '"></div>';
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
    _saveChatMsgs();
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
      setLoading(false); _curN = null; return;
    }
    if (data.chunk) appendChunk(_curN, data.chunk);
    if (data.done) {
      /* Remove cursor */
      if (el) { var c = el.querySelector('.ap-cursor'); if (c) c.remove(); }
      setLoading(false); _curN = null;
      _saveChatMsgs();
    }
    msgs.scrollTop = msgs.scrollHeight;
  };

  /* ── Dock textarea auto-resize ── */
  ci.addEventListener('input', function(){
    ci.style.height = 'auto';
    ci.style.height = Math.min(ci.scrollHeight, 120) + 'px';
  });

  /* ── Stop button ── */
  if (btnStop) {
    btnStop.addEventListener('click', function(){
      setLoading(false);
      window._apAction = {type:'freeChatCancel'};
      /* Show error marker in current exchange */
      if (_curN) {
        var el = document.getElementById('ap-ai-' + _curN);
        if (el) {
          var c = el.querySelector('.ap-cursor'); if (c) c.remove();
          if (!el.textContent.trim()) el.innerHTML = '<span style="color:rgba(255,255,255,0.2);font-size:13px;">—</span>';
        }
        _curN = null;
      }
    });
  }

  /* ── Dock Enter to send follow-up ── */
  ci.addEventListener('keydown', function(e){
    if (e.key === 'Escape') { closeChat(); return; }
    if (e.key === 'Enter' && !e.shiftKey && ci.value.trim() && !isLoading) {
      e.preventDefault();
      var t = ci.value.trim(); ci.value = ''; ci.style.height = 'auto';
      _curN = addExchange(t);
      setLoading(true);
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

  /* Enter / send button → open chat */
  function submitSearch() {
    var t = sbInput.value.trim();
    if (!t) return;
    openChat(t);
    window._apAction = {type:'freeChat', text:t};
    sbInput.value = '';
    sbInput.dispatchEvent(new Event('input')); /* triggers visibility reset */
  }
  sbInput.addEventListener('keydown', function(e){
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitSearch(); }
  });
  /* Double-tap on input opens chat without needing text */
  sbInput.addEventListener('dblclick', function(){
    if (!sbInput.value.trim()) {
      openChat('');
      window._apAction = {type:'freeChat', text:''};
    }
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

  /* ── Restore chat if it was open before tab switch ── */
  try {
    if (sessionStorage.getItem('ap_chat_open') === '1') {
      /* Skip ALL animations — restore instantly */
      isOpen = true;
      document.body.style.backgroundColor = '#161616';
      if (canvasBg) { canvasBg.classList.add('no-transition'); canvasBg.classList.add('chat-active'); }
      _restoreChatMsgs();
      deck.style.transition = 'none';
      deck.style.opacity = '0';
      deck.style.transform = 'translateY(30px)';
      deck.style.pointerEvents = 'none';
      overlay.style.transition = 'none';
      overlay.style.opacity = '1';
      overlay.style.pointerEvents = 'auto';
      dock.style.transition = 'none';
      dock.style.opacity = '1';
      dock.style.transform = DOCK_SHOWN;
      dock.style.pointerEvents = 'auto';
      /* Also suppress canvas-bg dot transition */
      var bgBefore = canvasBg ? canvasBg.style.cssText : '';
      /* Restore transitions after paint so future open/close animates */
      requestAnimationFrame(function(){
        requestAnimationFrame(function(){
          overlay.style.transition = 'opacity 220ms ease';
          dock.style.transition = 'opacity 220ms ease,transform 220ms ease';
          deck.style.transition = '';
          if (canvasBg) canvasBg.classList.remove('no-transition');
          ci.focus();
        });
      });
    }
  } catch(e){}

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
        f'{_CHAT_HTML}'
    )

    top_bar = _top_bar(active_tab='stapel', due_new=total_new, due_learn=total_learn, due_review=total_review)
    tier_js = f'document.body.dataset.tier = "{tier}";'
    return _wrap_page(top_bar, content, extra_js=tier_js + _CHAT_JS, show_account_widget=False)


# ─── Overview ─────────────────────────────────────────────────────────────────

def _overview_html(deck_name, new_c, lrn_c, rev_c):
    total    = new_c + lrn_c + rev_c
    display  = deck_name.split('::')[-1] if '::' in deck_name else deck_name
    path     = ' › '.join(deck_name.split('::')[:-1]) if '::' in deck_name else ''
    display  = _esc(display)
    path_esc = _esc(path)
    lbl      = 'Jetzt lernen' if total > 0 else 'Keine Karten fällig'
    disabled = '' if total > 0 else 'disabled'
    path_html = f'<div style="font-size:10px;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;color:rgba(255,255,255,0.2);margin-bottom:10px;text-align:center;">{path_esc}</div>' if path else ''

    pill_style = 'display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 22px;border-radius:16px;background:#222224;border:1px solid rgba(255,255,255,0.05);min-width:80px;'
    btn_style = ('padding:14px 52px;border-radius:12px;font-size:16px;font-weight:600;border:none;cursor:pointer;'
                 'font-family:inherit;margin-bottom:20px;letter-spacing:-0.1px;transition:opacity 0.12s,transform 0.08s;')
    if total > 0:
        btn_style += 'background:#0a84ff;color:#fff;'
    else:
        btn_style += 'background:#282828;color:rgba(255,255,255,0.2);cursor:default;border:1px solid rgba(255,255,255,0.06);'

    act_style = 'background:none;border:none;color:rgba(255,255,255,0.22);font-size:13px;cursor:pointer;font-family:inherit;padding:4px 2px;transition:color 0.1s;'

    content = (
        f'<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100%;padding:48px 28px;">'
        f'{path_html}'
        f'<div style="font-size:30px;font-weight:700;color:rgba(255,255,255,0.9);margin-bottom:28px;text-align:center;letter-spacing:-0.6px;">{display}</div>'
        f'<div style="display:flex;gap:10px;margin-bottom:36px;">'
        f'<div style="{pill_style}">'
        f'<span style="font-size:26px;font-weight:700;letter-spacing:-0.5px;font-variant-numeric:tabular-nums;color:#0a84ff;">{new_c}</span>'
        f'<span style="font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:rgba(10,132,255,0.45);">Neu</span>'
        f'</div>'
        f'<div style="{pill_style}">'
        f'<span style="font-size:26px;font-weight:700;letter-spacing:-0.5px;font-variant-numeric:tabular-nums;color:#ffd60a;">{lrn_c}</span>'
        f'<span style="font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:rgba(255,214,10,0.45);">Lernen</span>'
        f'</div>'
        f'<div style="{pill_style}">'
        f'<span style="font-size:26px;font-weight:700;letter-spacing:-0.5px;font-variant-numeric:tabular-nums;color:#30d158;">{rev_c}</span>'
        f'<span style="font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:rgba(48,209,88,0.45);">Wieder</span>'
        f'</div>'
        f'</div>'
        f'<button style="{btn_style}" onclick="window._apAction={{type:\'cmd\',cmd:\'study\'}}" {disabled}>{lbl}</button>'
        f'<div style="display:flex;gap:20px;">'
        f'<button style="{act_style}"'
        f' onmouseover="this.style.color=\'rgba(255,255,255,0.5)\'"'
        f' onmouseout="this.style.color=\'rgba(255,255,255,0.22)\'"'
        f' onclick="window._apAction={{type:\'cmd\',cmd:\'decks\'}}">← Zurück</button>'
        f'<button style="{act_style}"'
        f' onmouseover="this.style.color=\'rgba(255,255,255,0.5)\'"'
        f' onmouseout="this.style.color=\'rgba(255,255,255,0.22)\'"'
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
        self._fc_thread = None
        self._fc_history = []

    def enable(self):
        if not self._hook_registered:
            gui_hooks.webview_will_set_content.append(self._on_webview_content)
            self._hook_registered = True
            print("CustomScreens: Hook registered")
        self.active = True

    def disable(self):
        self.active = False
        self._stop_poll()

    def refresh_if_visible(self):
        try:
            if mw and getattr(mw, 'state', None) == 'deckBrowser' and hasattr(mw, 'deckBrowser'):
                mw.deckBrowser.refresh()
        except Exception as e:
            print(f"CustomScreens: refresh error: {e}")

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
                if text:
                    # Load persistent history from DB on first open
                    self._fc_history = self._load_fc_history()
                    self._fc_history.append({'role': 'user', 'content': text})
                    self._save_fc_message(text, 'user')
                    self._start_fc_request(text)
            elif action_type == 'freeChatSend':
                text = action.get('text', '').strip()
                if text:
                    self._fc_history.append({'role': 'user', 'content': text})
                    self._save_fc_message(text, 'user')
                    self._start_fc_request(text)
            elif action_type in ('freeChatClose', 'freeChatCancel'):
                if self._fc_thread is not None:
                    try:
                        self._fc_thread.cancel()
                    except Exception:
                        pass
                    self._fc_thread = None
                if action_type == 'freeChatClose':
                    self._fc_history = []
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
                        from . import ui_setup
                        if hasattr(ui_setup, 'show_settings'):
                            ui_setup.show_settings()
                        elif hasattr(mw, 'onPrefs'):
                            mw.onPrefs()
                    except Exception:
                        if hasattr(mw, 'onPrefs'):
                            mw.onPrefs()
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
        except Exception as e:
            print(f"CustomScreens: action error: {e}")
            traceback.print_exc()

    # ── Free chat AI request ──────────────────────────────────────────────

    def _build_fc_system_prompt(self):
        """Build a rich system prompt with the user's current deck context."""
        import datetime
        today = datetime.date.today().strftime('%A, %d. %B %Y')

        lines = [
            "Du bist ein hilfreicher Lernassistent für Anki-Karteikarten.",
            f"Heute ist {today}.",
            "",
            "# Kontext: Aktuelle Anki-Sammlung",
        ]

        try:
            due_counts   = _get_due_counts()
            card_dist    = _get_card_distribution()
            all_decks    = list(mw.col.decks.all_names_and_ids())
            tree         = _build_deck_tree(all_decks, due_counts, card_dist, {})

            total_new    = sum(d.get('new', 0) for d in due_counts.values())
            total_learn  = sum(d.get('learning', 0) for d in due_counts.values())
            total_review = sum(d.get('review', 0) for d in due_counts.values())
            total_due    = total_new + total_learn + total_review
            total_cards  = sum(n['agg_total'] for n in tree)

            lines += [
                f"- Karten gesamt: {total_cards}",
                f"- Heute fällig: {total_due} ({total_new} neu, {total_learn} lernen, {total_review} wiederholen)",
                f"- Stapel (Decks): {len(tree)}",
                "",
                "## Stapel-Übersicht:",
            ]

            for node in tree:
                name  = node['name']
                total = node['agg_total']
                new   = node['due_new']
                lrn   = node['due_learn']
                rev   = node['due_review']
                lines.append(f"- **{name}**: {total} Karten gesamt, heute fällig: {new} neu / {lrn} lernen / {rev} wiederholen")
                for child in node.get('children', []):
                    c_total = child['agg_total']
                    lines.append(f"  - {child['display']}: {c_total} Karten")
        except Exception as e:
            lines.append(f"(Deck-Kontext konnte nicht geladen werden: {e})")

        lines += [
            "",
            "Antworte auf Deutsch, klar und präzise. Wenn der Nutzer nach einem Lernplan oder Strategie fragt, "
            "nutze die obigen Zahlen konkret. Halte Antworten kompakt (2–5 Sätze) außer wenn mehr Tiefe explizit erwünscht ist.",
        ]

        return "\n".join(lines)

    def _start_fc_request(self, text):
        if QThread is None:
            self._fc_push({'error': 'QThread nicht verfügbar.', 'done': True})
            return

        try:
            from .ai_handler import get_ai_handler
        except ImportError:
            try:
                from ai_handler import get_ai_handler
            except ImportError:
                self._fc_push({'error': 'AI Handler nicht gefunden.', 'done': True})
                return

        ai = get_ai_handler()
        system_prompt = self._build_fc_system_prompt()
        history_snapshot = list(self._fc_history[:-1])  # all but last (current user msg)
        print(f"CustomScreens: _start_fc_request — handler={ai}, msg={text[:60]!r}")

        class _FCThread(QThread):
            chunk_signal = _Signal(str, bool)  # chunk, done

            def __init__(self, handler, msg, hist, sys_prompt):
                super().__init__()
                self._handler = handler
                self._msg = msg
                self._hist = hist
                self._sys_prompt = sys_prompt
                self._cancelled = False

            def cancel(self):
                self._cancelled = True

            def run(self):
                def cb(chunk, done, is_function_call=False):
                    if not self._cancelled:
                        self.chunk_signal.emit(chunk or '', done)
                try:
                    print(f"CustomScreens: _FCThread.run — calling get_response")
                    self._handler.get_response(
                        self._msg,
                        history=self._hist,
                        mode='compact',
                        callback=cb,
                        system_prompt_override=self._sys_prompt,
                    )
                    print(f"CustomScreens: _FCThread.run — get_response returned")
                except Exception as e:
                    print(f"CustomScreens: _FCThread.run — exception: {e}")
                    if not self._cancelled:
                        self.chunk_signal.emit(f'Fehler: {e}', True)

        if self._fc_thread is not None:
            try:
                self._fc_thread.cancel()
            except Exception:
                pass

        thread = _FCThread(ai, text, history_snapshot, system_prompt)
        self._fc_thread = thread

        _buf = []

        def on_chunk_with_hist(chunk, done):
            if self._fc_thread is not thread:
                return
            _buf.append(chunk)
            self._fc_push({'chunk': chunk, 'done': done})
            if done:
                full = ''.join(_buf)
                self._fc_history.append({'role': 'assistant', 'content': full})
                if full.strip():
                    self._save_fc_message(full, 'assistant')
                self._fc_thread = None

        # QueuedConnection ensures on_chunk_with_hist runs on the main thread,
        # preventing crashes from runJavaScript called on a background thread
        if _Qt is not None:
            thread.chunk_signal.connect(on_chunk_with_hist, _Qt.ConnectionType.QueuedConnection)
        else:
            thread.chunk_signal.connect(on_chunk_with_hist)
        thread.start()

    def _fc_push(self, data):
        """Push data to the deck browser's apChatReceive JS function."""
        try:
            state = getattr(mw, 'state', None)
            if mw and state == 'deckBrowser' and hasattr(mw, 'deckBrowser'):
                js = f"window.apChatReceive({json.dumps(data)});"
                mw.deckBrowser.web.page().runJavaScript(js)
            else:
                print(f"CustomScreens: _fc_push skipped — state={state!r}")
        except Exception as e:
            print(f"CustomScreens: _fc_push error: {e}")

    def _load_fc_history(self):
        """Load Free Chat history from SQLite (deck_id=0 = global). Returns list of {role, content}."""
        try:
            from .card_sessions_storage import load_deck_messages
        except ImportError:
            try:
                from card_sessions_storage import load_deck_messages
            except ImportError:
                return []
        try:
            messages = load_deck_messages(0, limit=20)
            history = []
            for m in messages:
                role = 'assistant' if m.get('sender') == 'assistant' else 'user'
                history.append({'role': role, 'content': m.get('text', '')})
            print(f"CustomScreens: Loaded {len(history)} messages from FC history")
            return history
        except Exception as e:
            print(f"CustomScreens: _load_fc_history error: {e}")
            return []

    def _save_fc_message(self, text, sender):
        """Save a Free Chat message to SQLite for persistence."""
        try:
            from .card_sessions_storage import save_deck_message
        except ImportError:
            try:
                from card_sessions_storage import save_deck_message
            except ImportError:
                return
        try:
            import uuid
            save_deck_message(0, {
                'id': str(uuid.uuid4()),
                'text': text,
                'sender': sender,
                'source': 'tutor',
            })
        except Exception as e:
            print(f"CustomScreens: _save_fc_message error: {e}")

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
                from .config import get_config
                _cfg = get_config()
                is_premium = bool(_cfg.get('auth_token', '').strip()) and _cfg.get('auth_validated', False)
            except Exception:
                pass
            tier = 'pro' if is_premium else 'free'

            html             = _deck_browser_html(tree, len(all_decks), total_new, total_learn, total_review, tier=tier)
            web_content.body  = html
            web_content.head  = ''
            print(f"CustomScreens: ✅ DeckBrowser ({len(all_decks)} decks)")
        except Exception as e:
            print(f"CustomScreens: ❌ DeckBrowser: {e}")
            traceback.print_exc()

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
            print(f"CustomScreens: ✅ Overview '{deck_name}'")
        except Exception as e:
            print(f"CustomScreens: ❌ Overview: {e}")
            traceback.print_exc()


# Global instance
custom_screens = CustomScreens()
