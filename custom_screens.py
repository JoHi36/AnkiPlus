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
    from aqt.deckbrowser import DeckBrowser
except ImportError:
    DeckBrowser = None

try:
    from aqt.overview import Overview
except ImportError:
    Overview = None

try:
    from .sessions_storage import load_sessions
except ImportError:
    try:
        from sessions_storage import load_sessions
    except ImportError:
        def load_sessions(): return []


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
    try:
        sessions = load_sessions()
        result = {}
        for s in sessions:
            name = s.get('deckName', '')
            if not name:
                continue
            if name not in result:
                result[name] = []
            result[name].append(s)
        for name in result:
            result[name].sort(
                key=lambda x: x.get('updatedAt') or x.get('createdAt') or '',
                reverse=True
            )
        return result
    except Exception as e:
        print(f"CustomScreens: sessions error: {e}")
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
        f'<div class="flex items-center justify-between px-5 h-12 bg-base-100 z-50 flex-shrink-0">'
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
    # Check premium status
    is_premium = False
    try:
        from .auth import get_auth_status
        auth_status = get_auth_status()
        is_premium = auth_status.get('isPremium', False) or auth_status.get('is_premium', False)
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
    background: #1A1A1A !important;
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
}
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


def _wrap_page(top_bar_html, content_html, extra_js=''):
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
        f'{_account_widget()}'
        f'</div>'
        f'<script>{_TOGGLE_JS}{extra_js}</script>'
        f'</body></html>'
    )


# ─── Deck Browser ─────────────────────────────────────────────────────────────

_SEARCHBAR_HTML = """
<div id="ap-searchbar" style="padding:10px 16px 8px;">
  <div style="position:relative;border-radius:24px;padding:2px;">
    <!-- Animated snake-border ring -->
    <div id="ap-sb-ring" style="
      position:absolute;inset:-1px;border-radius:25px;
      background:conic-gradient(from 0deg,transparent 0deg,transparent 55%,#6b8cff 60%,#a78bfa 72%,#38bdf8 81%,#6b8cff 86%,transparent 92%);
      -webkit-mask:radial-gradient(circle,transparent calc(100% - 2px),white calc(100% - 2px));
      mask:radial-gradient(circle,transparent calc(100% - 2px),white calc(100% - 2px));
      animation:ap-snake-spin 2.5s linear infinite;opacity:0;transition:opacity 0.3s;
    "></div>
    <div style="position:relative;background:#1c1c1e;border-radius:22px;display:flex;align-items:center;padding:9px 14px 9px 38px;gap:8px;border:1px solid rgba(255,255,255,0.07);">
      <span style="position:absolute;left:13px;color:#6b8cff;font-size:14px;line-height:1;">✦</span>
      <input id="ap-search-input"
        placeholder="Stelle eine Frage…"
        autocomplete="off"
        style="flex:1;background:transparent;border:none;outline:none;color:#ccc;font-size:13px;font-family:inherit;"
        onfocus="document.getElementById('ap-sb-ring').style.opacity='1'"
        onblur="document.getElementById('ap-sb-ring').style.opacity='0'"
      />
    </div>
  </div>
  <div style="text-align:right;font-size:10px;color:#2a2a40;margin-top:3px;padding-right:4px;">Enter zum Senden</div>
</div>
<style>
@keyframes ap-snake-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
</style>
<script>
(function(){
  var inp = document.getElementById('ap-search-input');
  if (!inp) return;
  inp.addEventListener('keydown', function(e){
    if (e.key === 'Enter' && inp.value.trim()) {
      window._apAction = {type:'freeChat', text: inp.value.trim()};
      inp.value = '';
    }
  });
})();
</script>
"""


def _deck_browser_html(tree, total_decks, total_new=0, total_learn=0, total_review=0):
    cards_html = ''.join(_deck_card(node, i) for i, node in enumerate(tree))
    if not cards_html:
        cards_html = (
            '<div style="padding:40px 20px;text-align:center;color:rgba(255,255,255,0.2);font-size:13px;">'
            'Keine Decks vorhanden.</div>'
        )

    content = (
        f'<div style="max-width:720px;margin:0 auto;padding:20px 24px 80px;">'
        f'{_SEARCHBAR_HTML}'
        f'{cards_html}'
        f'</div>'
    )

    top_bar = _top_bar(active_tab='stapel', due_new=total_new, due_learn=total_learn, due_review=total_review)
    return _wrap_page(top_bar, content)


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
                    try:
                        from . import ui_setup
                        import json as _json
                        # Open panel if not already visible, then send message
                        ui_setup.ensure_chatbot_open()
                        payload = _json.dumps({'type': 'startFreeChat', 'text': text})
                        def _send(t=text, p=payload):
                            widget = ui_setup.get_chatbot_widget()
                            if widget and widget.web_view:
                                widget.web_view.page().runJavaScript(
                                    f"window.ankiReceive({p});"
                                )
                        # Delay to allow the webview to initialize if panel just opened
                        QTimer.singleShot(150, _send)
                    except Exception:
                        traceback.print_exc()
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
        except Exception as e:
            print(f"CustomScreens: action error: {e}")
            traceback.print_exc()

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

            html             = _deck_browser_html(tree, len(all_decks), total_new, total_learn, total_review)
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
