"""
MainViewWidget — permanent fullscreen QWebEngineView for the React main app.
Replaces custom_screens.py and overlay_chat.py.
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
    from PyQt6.QtWebEngineWidgets import QWebEngineView
except ImportError:
    try:
        from PyQt5.QtWebEngineWidgets import QWebEngineView
    except ImportError:
        QWebEngineView = None

try:
    from ..storage.card_sessions import load_deck_messages, save_deck_message, clear_deck_messages
    from ..config import get_config
except ImportError:
    from storage.card_sessions import load_deck_messages, save_deck_message, clear_deck_messages
    from config import get_config


class MainViewWidget(QWidget):
    """Permanent fullscreen React app covering mw.web."""

    def __init__(self, parent=None):
        super().__init__(parent or mw)
        self.web_view = None
        self.message_timer = None
        self._streaming_text = ''
        self._visible = False
        self._bridge_initialized = False
        self._freechat_was_open = False  # preserve FreeChat state across hide/show
        self._init_action_handlers()
        self._init_state_getters()
        self._setup_ui()

    def _setup_ui(self):
        if QWebEngineView is None:
            return

        self.setStyleSheet("background: transparent;")
        layout = QVBoxLayout()
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        self.web_view = QWebEngineView()
        self.web_view.setContextMenuPolicy(Qt.ContextMenuPolicy.NoContextMenu)
        self.web_view.page().setBackgroundColor(QColor(0, 0, 0, 0))

        html_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "web", "index.html")
        url = QUrl.fromLocalFile(html_path)
        url.setQuery("v=%s&mode=main" % int(time.time()))
        self.web_view.loadFinished.connect(self._init_bridge)
        self.web_view.load(url)

        layout.addWidget(self.web_view)
        self.setLayout(layout)
        self.hide()

    def _init_bridge(self):
        """Initialize ankiBridge message queue."""
        if self._bridge_initialized:
            return
        self._bridge_initialized = True
        js = """
        window.ankiBridge = {
            messageQueue: [],
            addMessage: function(type, data) {
                this.messageQueue.push({type: type, data: data, timestamp: Date.now()});
            },
            getMessages: function() {
                var msgs = this.messageQueue.slice();
                this.messageQueue = [];
                return msgs;
            }
        };
        console.log('MainView ankiBridge initialized');
        """
        self.web_view.page().runJavaScript(js)
        self.message_timer = QTimer()
        self.message_timer.timeout.connect(self._poll_messages)
        self.message_timer.start(100)

    # ── Polling ──────────────────────────────────────────────────────

    def _poll_messages(self):
        if not self.web_view or not self._visible:
            return
        js = """
        (function() {
            if (window.ankiBridge && window.ankiBridge.messageQueue.length > 0) {
                return JSON.stringify(window.ankiBridge.getMessages());
            }
            return null;
        })();
        """
        self.web_view.page().runJavaScript(js, self._handle_messages)

    def _handle_messages(self, result):
        if not result:
            return
        try:
            messages = json.loads(result)
            for msg in messages:
                self._route_message(msg.get('type'), msg.get('data'))
        except Exception as e:
            logger.error("MainView: message parse error: %s", e)

    def _init_action_handlers(self):
        """Action Registry — domain.verb pattern. Same actions available to UI, shortcuts, and agents."""
        self._action_handlers = {
            # Deck actions
            'deck.study':           self._handle_study_deck,
            'deck.select':          self._handle_select_deck,
            'deck.create':          self._handle_create_deck,
            'deck.import':          self._handle_import_deck,
            'deck.options':         self._handle_open_deck_options,
            # View actions
            'view.navigate':        self._handle_navigate,
            # Chat actions
            'chat.send':            self._handle_send_message,
            'chat.cancel':          self._handle_cancel_request,
            'chat.load':            self._handle_load_deck_messages,
            'chat.save':            self._handle_save_deck_message,
            'chat.clear':           self._handle_clear_deck_messages,
            'chat.stateChanged':    self._handle_freechat_state,
            # Settings & tools
            'settings.toggle':      self._handle_toggle_settings_sidebar,
            'stats.open':           self._handle_open_stats,
            # Plusi
            'plusi.ask':            self._handle_plusi_ask,
            'plusi.settings':       self._handle_toggle_settings_sidebar,
            # Card actions
            'card.goTo':            self._handle_go_to_card,
            'card.preview':         self._handle_open_preview,
            # System
            'system.textFieldFocus': self._handle_text_field_focus,
            'system.upgrade':       self._handle_toggle_settings_sidebar,
            # Legacy aliases (useFreeChat hook still uses old names)
            'loadDeckMessages':     self._handle_load_deck_messages,
            'saveDeckMessage':      self._handle_save_deck_message,
            'clearDeckMessages':    self._handle_clear_deck_messages,
            'sendMessage':          self._handle_send_message,
            'cancelRequest':        self._handle_cancel_request,
            'textFieldFocus':       self._handle_text_field_focus,
            'closeOverlay':         self._handle_freechat_state,  # legacy close
            'freeChatStateChanged': self._handle_freechat_state,
            'goToCard':             self._handle_go_to_card,
            'openPreview':          self._handle_open_preview,
        }

    def _init_state_getters(self):
        """State Query Registry — domain.noun pattern. Agents can query current state."""
        self._state_getters = {
            'app.state':        lambda: getattr(mw, 'state', 'unknown'),
            'deck.current':     self._get_current_deck_state,
            'deck.dueCount':    self._get_due_count_state,
            'chat.messageCount': lambda: len(load_deck_messages(0, limit=100)),
            'user.premium':     self._get_premium_state,
        }

    def _get_current_deck_state(self):
        try:
            did = mw.col.decks.get_current_id()
            return {'deckId': did, 'deckName': mw.col.decks.name(did)}
        except Exception:
            return {'deckId': 0, 'deckName': ''}

    def _get_due_count_state(self):
        try:
            tree = mw.col.sched.deck_due_tree()
            return {
                'new': sum(n.new_count for n in tree.children),
                'learning': sum(n.learn_count for n in tree.children),
                'review': sum(n.review_count for n in tree.children),
            }
        except Exception:
            return {'new': 0, 'learning': 0, 'review': 0}

    def _get_premium_state(self):
        cfg = get_config()
        return bool(cfg.get('auth_token', '').strip()) and cfg.get('auth_validated', False)

    def get_available_actions(self):
        """Agent can discover all available actions."""
        return list(self._action_handlers.keys())

    def get_available_queries(self):
        """Agent can discover all queryable state."""
        return list(self._state_getters.keys())

    def _route_message(self, msg_type, data):
        """Route messages from React via Action Registry, State Queries, or executeAction."""
        # executeAction wrapper (from Python/Agent → React-side actions)
        if msg_type == 'executeAction':
            try:
                parsed = json.loads(data) if isinstance(data, str) else data
                action_name = parsed.get('action', '')
                action_data = parsed.get('data')
                handler = self._action_handlers.get(action_name)
                if handler:
                    handler(action_data)
                else:
                    logger.warning("Unknown action via executeAction: %s", action_name)
            except Exception as e:
                logger.error("MainView: executeAction error: %s", e)
            return

        # State query (React asks for current state)
        if msg_type == 'query':
            try:
                parsed = json.loads(data) if isinstance(data, str) else data
                key = parsed.get('key', '') if isinstance(parsed, dict) else str(parsed)
                getter = self._state_getters.get(key)
                if getter:
                    result = getter()
                    self._send_to_react({
                        "type": "queryResult",
                        "key": key,
                        "data": result,
                    })
                else:
                    logger.warning("Unknown state query: %s", key)
            except Exception as e:
                logger.error("MainView: query error: %s", e)
            return

        # Direct action dispatch (domain.verb from React)
        handler = self._action_handlers.get(msg_type)
        if handler:
            handler(data)
        else:
            logger.warning("Unknown message type: %s", msg_type)

    # ── Message Handlers ─────────────────────────────────────────────

    def _handle_study_deck(self, data):
        try:
            parsed = json.loads(data) if isinstance(data, str) else data
            did = int(parsed.get('deckId', 0))
            if did:
                mw.col.decks.select(did)
                mw.onOverview()
                QTimer.singleShot(100, lambda: mw.overview._linkHandler('study'))
        except Exception as e:
            logger.error("MainView: studyDeck error: %s", e)

    def _handle_select_deck(self, data):
        try:
            parsed = json.loads(data) if isinstance(data, str) else data
            did = int(parsed.get('deckId', 0))
            if did:
                mw.col.decks.select(did)
                mw.onOverview()
        except Exception as e:
            logger.error("MainView: selectDeck error: %s", e)

    def _handle_navigate(self, data):
        try:
            state = data if isinstance(data, str) else str(data)
            if state == 'deckBrowser':
                mw.moveToState('deckBrowser')
            elif state == 'overview':
                mw.onOverview()
        except Exception as e:
            logger.error("MainView: navigateTo error: %s", e)

    def _handle_send_message(self, data):
        try:
            from ..ai.request_manager import get_request_manager
        except ImportError:
            from ai.request_manager import get_request_manager

        try:
            msg_data = data
            if isinstance(data, str):
                try:
                    msg_data = json.loads(data)
                except (json.JSONDecodeError, ValueError):
                    msg_data = {'text': data}
            if not isinstance(msg_data, dict):
                msg_data = {'text': str(msg_data) if msg_data else ''}
            text = msg_data.get('text', '').strip()
            if not text:
                return

            context = None  # Free chat has no card context
            db_messages = load_deck_messages(0, limit=20)
            history = [
                {'role': 'assistant' if m.get('sender') == 'assistant' else 'user',
                 'content': m.get('text', '')}
                for m in db_messages
            ]
            mode = msg_data.get('mode', 'compact')

            self._streaming_text = ''
            self._send_to_react({"type": "chat.loadingChanged", "loading": True})

            manager = get_request_manager()
            manager.start_request(
                text=text, context=context, history=history, mode=mode,
                caller_id='main',
                callbacks={
                    'on_chunk': self._on_chunk,
                    'on_finished': self._on_ai_done,
                    'on_error': self._on_ai_error,
                }
            )
        except Exception as e:
            self._send_to_react({"type": "chat.errorOccurred", "message": str(e)})
            self._send_to_react({"type": "chat.loadingChanged", "loading": False})

    def _handle_cancel_request(self, data=None):
        try:
            from ..ai.request_manager import get_request_manager
        except ImportError:
            from ai.request_manager import get_request_manager
        get_request_manager().cancel()
        self._send_to_react({"type": "chat.loadingChanged", "loading": False})

    def _handle_load_deck_messages(self, data):
        deck_id = int(data) if isinstance(data, (int, str)) else 0
        try:
            messages = load_deck_messages(deck_id, limit=50)
            self._send_to_react({"type": "chat.messagesLoaded", "deckId": deck_id, "messages": messages})
        except Exception as e:
            logger.error("MainView: loadDeckMessages error: %s", e)

    def _handle_save_deck_message(self, data):
        try:
            msg_data = json.loads(data) if isinstance(data, str) else data
            save_deck_message(int(msg_data.get('deckId', 0)), msg_data.get('message', {}))
        except Exception as e:
            logger.error("MainView: saveDeckMessage error: %s", e)

    def _handle_clear_deck_messages(self, data=None):
        try:
            count = clear_deck_messages()
            self._send_to_react({"type": "chat.messagesCleared", "count": count})
        except Exception as e:
            logger.error("MainView: clearDeckMessages error: %s", e)

    def _handle_open_stats(self, data=None):
        try:
            mw.onStats()
        except Exception as e:
            logger.warning("MainView: openStats error: %s", e)

    def _handle_open_deck_options(self, data=None):
        try:
            mw.overview._linkHandler('opts')
        except Exception as e:
            logger.warning("MainView: openDeckOptions error: %s", e)

    def _handle_toggle_settings_sidebar(self, data=None):
        try:
            from .settings_sidebar import toggle_settings_sidebar
            toggle_settings_sidebar()
        except Exception as e:
            logger.warning("MainView: toggleSettingsSidebar error: %s", e)

    def _handle_text_field_focus(self, data):
        try:
            from .shortcut_filter import get_shortcut_filter
            sf = get_shortcut_filter()
            if sf:
                parsed = json.loads(data) if isinstance(data, str) else data
                sf.set_text_field_focus(parsed.get('focused', False), self.web_view)
        except Exception as e:
            logger.warning("MainView: textFieldFocus error: %s", e)

    def _handle_go_to_card(self, data):
        try:
            card_id = int(data) if not isinstance(data, dict) else int(data.get('cardId', 0))
            if card_id and mw.col:
                from aqt.browser.browser import Browser
                browser = Browser(mw)
                browser.form.searchEdit.lineEdit().setText("cid:%s" % card_id)
                browser.onSearchActivated()
        except Exception as e:
            logger.warning("MainView: goToCard error: %s", e)

    def _handle_open_preview(self, data):
        try:
            parsed = json.loads(data) if isinstance(data, str) else data
            card_id = int(parsed.get('cardId', 0))
            if card_id:
                self._send_to_react({"type": "card.previewOpened", "cardId": card_id})
        except Exception as e:
            logger.warning("MainView: openPreview error: %s", e)

    def _handle_freechat_state(self, data):
        try:
            parsed = json.loads(data) if isinstance(data, str) else data
            self._freechat_was_open = parsed.get('open', False)
        except Exception:
            pass

    def _handle_plusi_ask(self, data):
        try:
            from .setup import ensure_chatbot_open
            ensure_chatbot_open()
        except Exception as e:
            logger.warning("MainView: plusi.ask error: %s", e)

    def _handle_create_deck(self, data):
        try:
            if hasattr(mw, 'onAddDeck'):
                mw.onAddDeck()
        except Exception as e:
            logger.warning("MainView: deck.create error: %s", e)

    def _handle_import_deck(self, data):
        try:
            if hasattr(mw, 'handleImport'):
                mw.handleImport()
            elif hasattr(mw, 'onImport'):
                mw.onImport()
        except Exception as e:
            logger.warning("MainView: deck.import error: %s", e)

    # ── AI Callbacks ─────────────────────────────────────────────────

    def _on_chunk(self, request_id, chunk, done, is_function_call):
        if chunk:
            self._streaming_text += chunk
            self._send_to_react({"type": "chat.chunkReceived", "chunk": chunk})

    def _on_ai_done(self, request_id):
        self._send_to_react({
            "type": "chat.responseCompleted",
            "message": self._streaming_text,
            "citations": {}
        })
        self._send_to_react({"type": "chat.loadingChanged", "loading": False})
        self._streaming_text = ''

    def _on_ai_error(self, request_id, error):
        self._send_to_react({"type": "chat.errorOccurred", "message": error})
        self._send_to_react({"type": "chat.loadingChanged", "loading": False})
        self._streaming_text = ''

    def _build_chat_context(self):
        import datetime
        today = datetime.date.today().strftime('%A, %d. %B %Y')
        lines = [
            "Du bist ein hilfreicher Lernassistent fuer Anki-Karteikarten.",
            "Heute ist %s." % today,
        ]
        try:
            total = mw.col.card_count() if hasattr(mw.col, 'card_count') else 0
            lines.append("Der Nutzer hat %s Karten in seiner Sammlung." % total)
        except Exception:
            pass
        return "\n".join(lines)

    # ── Send to React ────────────────────────────────────────────────

    def _send_to_react(self, payload):
        if self.web_view:
            js = "window.ankiReceive && window.ankiReceive(%s);" % json.dumps(payload)
            self.web_view.page().runJavaScript(js)

    # ── Data Gathering ───────────────────────────────────────────────

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

    # ── Show / Hide ──────────────────────────────────────────────────

    def show_for_state(self, state):
        """Show the widget and send state data to React."""
        if state == 'review':
            self._hide()
            return

        self._show()
        self._pending_state = state

        # If bridge isn't initialized yet, wait and retry
        if not self._bridge_initialized:
            QTimer.singleShot(500, lambda: self._send_state_data(state))
        else:
            self._send_state_data(state)

    def _send_state_data(self, state):
        """Send state data to React. Retries if bridge not ready."""
        if not self._bridge_initialized:
            QTimer.singleShot(300, lambda: self._send_state_data(state))
            return

        if state == 'deckBrowser':
            data = self._get_deck_browser_data()
            self._send_to_react({
                "type": "app.stateChanged",
                "state": "deckBrowser",
                "data": data,
                "freeChatWasOpen": self._freechat_was_open,
            })
        elif state == 'overview':
            data = self._get_overview_data()
            self._send_to_react({
                "type": "app.stateChanged",
                "state": "overview",
                "data": data,
            })

    def _show(self):
        if self._visible:
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
        if self.message_timer:
            self.message_timer.start(100)
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
        # Cancel any active AI request
        try:
            from ..ai.request_manager import get_request_manager
        except ImportError:
            from ai.request_manager import get_request_manager
        get_request_manager().cancel()
        if self.message_timer:
            self.message_timer.stop()
        if self.parent():
            self.parent().removeEventFilter(self)
        self.hide()

    def _position_over_main(self):
        """Position over mw.web."""
        try:
            web = mw.web if hasattr(mw, 'web') else None
            if web:
                pos = web.mapTo(mw, QPoint(0, 0))
                self.setGeometry(pos.x(), pos.y(), web.width(), web.height())
            else:
                self.setGeometry(mw.rect())
        except Exception:
            self.setGeometry(mw.rect())

    def eventFilter(self, obj, event):
        if event.type() == event.Type.Resize and self._visible:
            self._position_over_main()
        return super().eventFilter(obj, event)


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
