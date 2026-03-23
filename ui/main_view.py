"""
MainViewWidget — positioning shell for the unified React app.
Creates ChatbotWidget as its sole child. Handles fullscreen vs sidebar positioning.
"""

import os
import json
import time
from aqt import mw
from aqt.qt import *

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

try:
    from ..config import get_config
except ImportError:
    from config import get_config

SIDEBAR_DEFAULT_WIDTH = 450


class MainViewWidget(QWidget):
    """Positioning shell — fullscreen (deckBrowser/overview) or sidebar (review)."""

    def __init__(self, parent=None):
        super().__init__(parent or mw)
        self._chatbot = None
        self._sidebar_visible = False
        self._current_mode = 'fullscreen'
        self._visible = False
        self._setup_ui()

    def _setup_ui(self):
        self.setStyleSheet("background: transparent;")
        layout = QVBoxLayout()
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        try:
            from .widget import ChatbotWidget
        except ImportError:
            from ui.widget import ChatbotWidget

        self._chatbot = ChatbotWidget()
        layout.addWidget(self._chatbot)
        self.setLayout(layout)
        self.hide()

    # ── Send to React ────────────────────────────────────────────

    def _send_to_react(self, payload):
        """Send payload to React through ChatbotWidget's webview."""
        if self._chatbot and self._chatbot.web_view:
            js = "window.ankiReceive && window.ankiReceive(%s);" % json.dumps(payload)
            self._chatbot.web_view.page().runJavaScript(js)

    # ── Sidebar ──────────────────────────────────────────────────

    def show_sidebar(self):
        """Show as 450px right sidebar (review mode)."""
        self._current_mode = 'sidebar'
        self._sidebar_visible = True
        self._squeeze_main_content(True)
        self._position_over_main()
        self._visible = True
        self.show()
        self.raise_()
        if self.parent():
            self.parent().installEventFilter(self)
        # Notify React
        try:
            self._chatbot.web_view.page().runJavaScript(
                "window.ankiReceive && window.ankiReceive({type:'panelOpened'});"
            )
        except Exception:
            pass

    def hide_sidebar(self):
        """Hide sidebar. Only hides widget if still in sidebar mode."""
        self._sidebar_visible = False
        self._squeeze_main_content(False)
        if self._current_mode == 'sidebar':
            self._visible = False
            if self.parent():
                self.parent().removeEventFilter(self)
            self.hide()

    def toggle_sidebar(self):
        if self._sidebar_visible:
            self.hide_sidebar()
        else:
            self.show_sidebar()

    def get_sidebar_widget(self):
        """Return the ChatbotWidget instance."""
        return self._chatbot

    get_chatbot_widget = get_sidebar_widget

    # ── Show / Hide ──────────────────────────────────────────────

    def show_for_state(self, state):
        """Position widget and send state data to React."""
        if state == 'review':
            # Sidebar mode — actual sidebar shown by ensure_chatbot_open()
            self._current_mode = 'sidebar'
            # Hide widget — sidebar shown by ensure_chatbot_open() in setup.py
            self._visible = False
            self.hide()
            # Tell React we're in review → switches activeView to 'chat'
            self._send_to_react({
                "type": "app.stateChanged",
                "state": "review",
                "data": {},
            })
            return

        # Fullscreen mode
        self._current_mode = 'fullscreen'
        self._sidebar_visible = False
        self._squeeze_main_content(False)
        self._visible = False  # Reset so _show() works
        self._show()
        self._pending_state = state

        # Send state data (with retry if not ready)
        self._send_state_data(state)

    def _send_state_data(self, state, _retries=0):
        """Send state data to React. Waits for ankiReceive to be available."""
        if not self._chatbot or not self._chatbot.web_view or _retries > 20:
            if _retries <= 20:
                QTimer.singleShot(300, lambda: self._send_state_data(state, _retries + 1))
            return

        # Build payload
        if state == 'deckBrowser':
            data = self._get_deck_browser_data()
            freechat_was_open = getattr(self._chatbot, '_freechat_was_open', False)
            payload = {
                "type": "app.stateChanged",
                "state": "deckBrowser",
                "data": data,
                "freeChatWasOpen": freechat_was_open,
            }
        elif state == 'overview':
            data = self._get_overview_data()
            payload = {
                "type": "app.stateChanged",
                "state": "overview",
                "data": data,
            }
        else:
            return

        # Check if ankiReceive exists (page may not have loaded yet)
        def _on_check(is_ready):
            if is_ready:
                self._send_to_react(payload)
            else:
                QTimer.singleShot(300, lambda: self._send_state_data(state, _retries + 1))

        self._chatbot.web_view.page().runJavaScript(
            "typeof window.ankiReceive === 'function'",
            _on_check
        )

    def _show(self):
        if self._visible:
            self._position_over_main()
            return
        self._visible = True
        try:
            from .shortcut_filter import get_shortcut_filter
            sf = get_shortcut_filter()
            if sf and hasattr(sf, 'set_main_view_active'):
                sf.set_main_view_active(True)
        except Exception:
            pass
        self._position_over_main()
        self.show()
        self.raise_()
        if self.parent():
            self.parent().installEventFilter(self)

    def _hide(self):
        if not self._visible:
            return
        self._visible = False
        try:
            from .shortcut_filter import get_shortcut_filter
            sf = get_shortcut_filter()
            if sf and hasattr(sf, 'set_main_view_active'):
                sf.set_main_view_active(False)
        except Exception:
            pass
        if self.parent():
            self.parent().removeEventFilter(self)
        self.hide()

    def _position_over_main(self):
        """Position based on mode: fullscreen or right sidebar."""
        try:
            if self._current_mode == 'sidebar':
                w = SIDEBAR_DEFAULT_WIDTH
                self.setGeometry(mw.width() - w, 0, w, mw.height())
            else:
                self.setGeometry(0, 0, mw.width(), mw.height())
        except Exception:
            try:
                self.setGeometry(mw.rect())
            except Exception:
                pass

    def _squeeze_main_content(self, make_room):
        """Resize mw.web so custom reviewer doesn't render behind sidebar."""
        try:
            central = mw.centralWidget()
            if central and central.layout():
                right_margin = SIDEBAR_DEFAULT_WIDTH if make_room else 0
                central.layout().setContentsMargins(0, 0, right_margin, 0)
        except Exception:
            pass

    def eventFilter(self, obj, event):
        if event.type() == event.Type.Resize and self._visible:
            self._position_over_main()
        return super().eventFilter(obj, event)

    # ── Data Gathering ───────────────────────────────────────────

    def _get_deck_browser_data(self):
        """Build complete deck tree data for React."""
        try:
            all_decks = mw.col.decks.all_names_and_ids()

            # Due counts
            due_counts = {}
            tree = mw.col.sched.deck_due_tree()
            def traverse(node):
                did = getattr(node, 'deck_id', None)
                if did:
                    due_counts[did] = {
                        'new': getattr(node, 'new_count', 0),
                        'learning': getattr(node, 'learn_count', 0),
                        'review': getattr(node, 'review_count', 0),
                    }
                for child in getattr(node, 'children', []):
                    traverse(child)
            traverse(tree)

            # Card distribution
            card_dist = {}
            try:
                rows = mw.col.db.all("SELECT did, ivl, queue FROM cards")
                for did, ivl, queue in rows:
                    if did not in card_dist:
                        card_dist[did] = [0, 0, 0, 0]
                    card_dist[did][3] += 1
                    if queue == 0:
                        card_dist[did][2] += 1
                    elif ivl >= 21:
                        card_dist[did][0] += 1
                    else:
                        card_dist[did][1] += 1
            except Exception:
                pass

            # Build tree
            by_name = {}
            for deck in sorted(all_decks, key=lambda d: d.name):
                parts = deck.name.split('::')
                due = due_counts.get(deck.id, {'new': 0, 'learning': 0, 'review': 0})
                cd = card_dist.get(deck.id, [0, 0, 0, 0])
                by_name[deck.name] = {
                    'id': deck.id,
                    'name': deck.name,
                    'display': parts[-1],
                    'dueNew': due['new'],
                    'dueLearn': due['learning'],
                    'dueReview': due['review'],
                    'mature': cd[0],
                    'young': cd[1],
                    'new': cd[2],
                    'total': cd[3],
                    'children': [],
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

            # Aggregate child counts upward
            def aggregate(node):
                for child in node['children']:
                    aggregate(child)
                    node['mature'] += child['mature']
                    node['young'] += child['young']
                    node['new'] += child['new']
                    node['total'] += child['total']

            for root in roots:
                aggregate(root)

            roots.sort(key=lambda n: n['name'])

            # Total dues
            total_new = sum(n.new_count for n in tree.children)
            total_lrn = sum(n.learn_count for n in tree.children)
            total_rev = sum(n.review_count for n in tree.children)

            # Premium status
            cfg = get_config()
            is_premium = bool(cfg.get('auth_token', '').strip()) and cfg.get('auth_validated', False)

            return {
                'roots': roots,
                'totalNew': total_new,
                'totalLearn': total_lrn,
                'totalReview': total_rev,
                'totalDue': total_new + total_lrn + total_rev,
                'isPremium': is_premium,
            }
        except Exception as e:
            logger.error("MainView: getDeckBrowserData error: %s", e)
            return {'roots': [], 'totalNew': 0, 'totalLearn': 0, 'totalReview': 0, 'totalDue': 0, 'isPremium': False}

    def _get_overview_data(self):
        """Get data for the overview screen."""
        try:
            deck_id = mw.col.decks.get_current_id()
            deck_name = mw.col.decks.name(deck_id)
            counts = mw.col.sched.counts()
            return {
                'deckId': deck_id,
                'deckName': deck_name,
                'dueNew': counts[0],
                'dueLearning': counts[1],
                'dueReview': counts[2],
            }
        except Exception as e:
            logger.error("MainView: getOverviewData error: %s", e)
            return {'deckId': 0, 'deckName': '', 'dueNew': 0, 'dueLearning': 0, 'dueReview': 0}


# ── Singleton ────────────────────────────────────────────────────────

_main_view_instance = None

def get_main_view():
    global _main_view_instance
    if _main_view_instance is None:
        _main_view_instance = MainViewWidget(mw)
    return _main_view_instance

def show_main_view(state):
    view = get_main_view()
    view.show_for_state(state)
