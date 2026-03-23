# SP1: Fullscreen React Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace custom_screens.py (HTML injection) and overlay_chat.py with a permanent fullscreen React app that renders DeckBrowser, Overview, and FreeChat.

**Architecture:** A new `MainViewWidget` (QWebEngineView) sits permanently over `mw.web`, loading `web/index.html?mode=main`. A new `MainApp` React root receives state changes from Python and renders the appropriate view. During review state, MainViewWidget hides and custom_reviewer works on mw.web as before.

**Tech Stack:** Python/PyQt6 (MainViewWidget), React 18 (MainApp), Tailwind CSS + design tokens, SQLite (unchanged)

**Spec:** `docs/superpowers/specs/2026-03-23-react-unification-sp1-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `ui/main_view.py` | MainViewWidget — permanent QWebEngineView, message polling, state routing, AI requests |
| `frontend/src/MainApp.jsx` | React root for `?mode=main` — view switching, state management, ankiReceive handler |
| `frontend/src/components/TopBar.jsx` | Unified top bar — tabs, info left/right, adapts per view |
| `frontend/src/components/DeckBrowserView.jsx` | Deck tree container — search bar, deck list, empty state |
| `frontend/src/components/DeckNode.jsx` | Single deck with expand/collapse — recursive children |
| `frontend/src/components/DeckSearchBar.jsx` | Search input — rotating placeholders, snake border, Cmd+K |
| `frontend/src/components/OverviewView.jsx` | Study overview — deck name, due pills, study/back buttons |
| `frontend/src/components/AccountBadge.jsx` | "AnkiPlus Free/Pro" badge — bottom-right fixed |
| `frontend/src/hooks/useDeckTree.js` | Expand/collapse localStorage state management |

### Files to Delete (after all tasks complete)

| File | Replaced by |
|------|------------|
| `ui/custom_screens.py` | MainViewWidget + React components |
| `ui/overlay_chat.py` | MainViewWidget (FreeChat integrated in MainApp) |
| `frontend/src/FreeChatApp.jsx` | MainApp (FreeChat is a view within MainApp) |
| `frontend/src/components/OverlayHeader.jsx` | TopBar |

### Files to Modify

| File | Change |
|------|--------|
| `__init__.py` | Replace custom_screens.enable() with MainViewWidget init; update state_will_change hook |
| `ui/setup.py` | Add MainViewWidget creation alongside existing dock |
| `ui/shortcut_filter.py` | Update overlay flags for MainViewWidget |
| `frontend/src/main.jsx` | Add `mode=main` routing to MainApp |

---

### Task 1: Create `MainViewWidget` Python shell

**Files:**
- Create: `ui/main_view.py`

This is the Python-side foundation. A QWidget with QWebEngineView that loads the React app, positions itself over `mw.web`, and handles message polling.

- [ ] **Step 1: Create the file with the QWidget shell**

```python
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

    def _route_message(self, msg_type, data):
        """Route messages from React to appropriate handlers."""
        if msg_type == 'studyDeck':
            self._handle_study_deck(data)
        elif msg_type == 'selectDeck':
            self._handle_select_deck(data)
        elif msg_type == 'navigateTo':
            self._handle_navigate(data)
        elif msg_type == 'sendMessage':
            self._handle_send_message(data)
        elif msg_type == 'cancelRequest':
            self._handle_cancel_request()
        elif msg_type == 'loadDeckMessages':
            self._handle_load_deck_messages(data)
        elif msg_type == 'saveDeckMessage':
            self._handle_save_deck_message(data)
        elif msg_type == 'clearDeckMessages':
            self._handle_clear_deck_messages()
        elif msg_type == 'openStats':
            self._handle_open_stats()
        elif msg_type == 'openDeckOptions':
            self._handle_open_deck_options()
        elif msg_type == 'toggleSettingsSidebar':
            self._handle_toggle_settings_sidebar()
        elif msg_type == 'textFieldFocus':
            self._handle_text_field_focus(data)
        elif msg_type == 'goToCard':
            self._handle_go_to_card(data)
        elif msg_type == 'openPreview':
            self._handle_open_preview(data)
        elif msg_type == 'freeChatStateChanged':
            # Track whether FreeChat is open for state persistence
            try:
                parsed = json.loads(data) if isinstance(data, str) else data
                self._freechat_was_open = parsed.get('open', False)
            except Exception:
                pass

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
            msg_data = json.loads(data) if isinstance(data, str) else data
            text = msg_data.get('text', '').strip()
            if not text:
                return

            context = self._build_chat_context()
            db_messages = load_deck_messages(0, limit=20)
            history = [
                {'role': 'assistant' if m.get('sender') == 'assistant' else 'user',
                 'content': m.get('text', '')}
                for m in db_messages
            ]
            mode = msg_data.get('mode', 'compact')

            self._streaming_text = ''
            self._send_to_react({"type": "loading", "loading": True})

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
            self._send_to_react({"type": "error", "message": str(e)})
            self._send_to_react({"type": "loading", "loading": False})

    def _handle_cancel_request(self):
        try:
            from ..ai.request_manager import get_request_manager
        except ImportError:
            from ai.request_manager import get_request_manager
        get_request_manager().cancel()
        self._send_to_react({"type": "loading", "loading": False})

    def _handle_load_deck_messages(self, data):
        deck_id = int(data) if isinstance(data, (int, str)) else 0
        try:
            messages = load_deck_messages(deck_id, limit=50)
            self._send_to_react({"type": "deckMessagesLoaded", "deckId": deck_id, "messages": messages})
        except Exception as e:
            logger.error("MainView: loadDeckMessages error: %s", e)

    def _handle_save_deck_message(self, data):
        try:
            msg_data = json.loads(data) if isinstance(data, str) else data
            save_deck_message(int(msg_data.get('deckId', 0)), msg_data.get('message', {}))
        except Exception as e:
            logger.error("MainView: saveDeckMessage error: %s", e)

    def _handle_clear_deck_messages(self):
        try:
            count = clear_deck_messages()
            self._send_to_react({"type": "deckMessagesCleared", "count": count})
        except Exception as e:
            logger.error("MainView: clearDeckMessages error: %s", e)

    def _handle_open_stats(self):
        try:
            mw.onStats()
        except Exception as e:
            logger.warning("MainView: openStats error: %s", e)

    def _handle_open_deck_options(self):
        try:
            mw.overview._linkHandler('opts')
        except Exception as e:
            logger.warning("MainView: openDeckOptions error: %s", e)

    def _handle_toggle_settings_sidebar(self):
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
                self._send_to_react({"type": "openCardPreview", "cardId": card_id})
        except Exception as e:
            logger.warning("MainView: openPreview error: %s", e)

    # ── AI Callbacks ─────────────────────────────────────────────────

    def _on_chunk(self, request_id, chunk, done, is_function_call):
        if chunk:
            self._streaming_text += chunk
            self._send_to_react({"type": "streaming", "chunk": chunk})

    def _on_ai_done(self, request_id):
        self._send_to_react({
            "type": "bot",
            "message": self._streaming_text,
            "citations": {}
        })
        self._send_to_react({"type": "loading", "loading": False})
        self._streaming_text = ''

    def _on_ai_error(self, request_id, error):
        self._send_to_react({"type": "error", "message": error})
        self._send_to_react({"type": "loading", "loading": False})
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

        if state == 'deckBrowser':
            data = self._get_deck_browser_data()
            self._send_to_react({
                "type": "stateChanged",
                "state": "deckBrowser",
                "data": data,
                "freeChatWasOpen": self._freechat_was_open,
            })
        elif state == 'overview':
            data = self._get_overview_data()
            self._send_to_react({
                "type": "stateChanged",
                "state": "overview",
                "data": data,
            })

    def _show(self):
        if self._visible:
            return
        self._visible = True
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
```

- [ ] **Step 2: Commit**

```bash
git add ui/main_view.py
git commit -m "feat(ui): add MainViewWidget — permanent fullscreen React shell"
```

---

### Task 2: Create `MainApp.jsx` React root

**Files:**
- Create: `frontend/src/MainApp.jsx`
- Modify: `frontend/src/main.jsx` (add `mode=main` routing)

- [ ] **Step 1: Create MainApp.jsx**

This is the React root component. It receives state changes from Python, manages view switching, and handles FreeChat. Initially renders a minimal shell — views are added in later tasks.

```jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useFreeChat } from './hooks/useFreeChat';
import { useHoldToReset } from './hooks/useHoldToReset';

/**
 * MainApp — React root for the fullscreen main view.
 * Renders DeckBrowser, Overview, or FreeChat based on Anki state.
 * Loaded when URL has ?mode=main
 */
export default function MainApp() {
  // Anki state (from Python)
  const [ankiState, setAnkiState] = useState('deckBrowser');
  const [deckBrowserData, setDeckBrowserData] = useState(null);
  const [overviewData, setOverviewData] = useState(null);
  const [isPremium, setIsPremium] = useState(false);

  // View state (React-internal)
  const [activeView, setActiveView] = useState('deckBrowser'); // deckBrowser | overview | freeChat
  const [freeChatTransition, setFreeChatTransition] = useState('idle');
  const [inputFocused, setInputFocused] = useState(false);

  const bridge = useRef({
    sendMessage: (data) => window.ankiBridge?.addMessage('sendMessage', data),
    cancelRequest: () => window.ankiBridge?.addMessage('cancelRequest', ''),
    goToCard: (cardId) => window.ankiBridge?.addMessage('goToCard', cardId),
    openPreview: (cardId) => window.ankiBridge?.addMessage('openPreview', { cardId: String(cardId) }),
  }).current;

  const freeChatHook = useFreeChat({
    bridge,
    onLoadingChange: () => {},
    onCancelComplete: () => {},
  });

  const {
    messages, streamingMessage, isLoading, handleSend,
    handleDeckMessagesLoaded, handleAnkiReceive, loadForDeck,
    clearMessages, messageCount,
  } = freeChatHook;

  const holdToReset = useHoldToReset({
    onReset: clearMessages,
    enabled: activeView === 'freeChat' && !inputFocused && !isLoading,
  });

  // Stable refs
  const handleDeckMessagesLoadedRef = useRef(handleDeckMessagesLoaded);
  const handleAnkiReceiveRef = useRef(handleAnkiReceive);
  const loadForDeckRef = useRef(loadForDeck);

  useEffect(() => { handleDeckMessagesLoadedRef.current = handleDeckMessagesLoaded; }, [handleDeckMessagesLoaded]);
  useEffect(() => { handleAnkiReceiveRef.current = handleAnkiReceive; }, [handleAnkiReceive]);
  useEffect(() => { loadForDeckRef.current = loadForDeck; }, [loadForDeck]);

  // ankiReceive handler — ONCE
  useEffect(() => {
    const queued = window._ankiReceiveQueue?.splice(0) || [];

    window.ankiReceive = (payload) => {
      if (!payload || !payload.type) return;

      if (payload.type === 'stateChanged') {
        const { state, data, freeChatWasOpen } = payload;
        setAnkiState(state);

        if (state === 'deckBrowser') {
          setDeckBrowserData(data);
          setIsPremium(data?.isPremium || false);
          if (freeChatWasOpen) {
            setActiveView('freeChat');
            loadForDeckRef.current(0);
          } else {
            setActiveView('deckBrowser');
          }
        } else if (state === 'overview') {
          setOverviewData(data);
          setActiveView('overview');
        }
        return;
      }

      if (payload.type === 'deckMessagesLoaded') {
        handleDeckMessagesLoadedRef.current(payload);
        return;
      }

      // All other payloads (streaming, bot, error, loading, etc.)
      handleAnkiReceiveRef.current(payload);
    };

    queued.forEach(p => window.ankiReceive(p));
    return () => { window.ankiReceive = null; };
  }, []);

  // ── FreeChat open/close ───────────────────────────────────────

  const openFreeChat = useCallback((initialText) => {
    loadForDeck(0);
    setFreeChatTransition('mounting');
    setTimeout(() => {
      setFreeChatTransition('entering');
      setTimeout(() => setFreeChatTransition('visible'), 400);
    }, 50);
    setActiveView('freeChat');
    // Notify Python for state persistence
    window.ankiBridge?.addMessage('freeChatStateChanged', JSON.stringify({ open: true }));
    if (initialText?.trim()) {
      setTimeout(() => handleSend(initialText, 'compact'), 600);
    }
  }, [loadForDeck, handleSend]);

  const closeFreeChat = useCallback(() => {
    if (isLoading) bridge.cancelRequest();
    setFreeChatTransition('exiting');
    window.ankiBridge?.addMessage('freeChatStateChanged', JSON.stringify({ open: false }));
    setTimeout(() => {
      setActiveView('deckBrowser');
      setFreeChatTransition('idle');
    }, 350);
  }, [isLoading, bridge]);

  // ── Keyboard shortcuts ────────────────────────────────────────

  useEffect(() => {
    const handler = (e) => {
      if (inputFocused) return;

      if (activeView === 'freeChat') {
        if (e.key === 'Escape' || e.key === ' ') {
          e.preventDefault();
          closeFreeChat();
        }
      } else if (activeView === 'deckBrowser') {
        if (e.key === ' ') {
          e.preventDefault();
          openFreeChat('');
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeView, inputFocused, openFreeChat, closeFreeChat]);

  // Focus tracking
  const handleInputFocus = useCallback(() => {
    setInputFocused(true);
    window.ankiBridge?.addMessage('textFieldFocus', JSON.stringify({ focused: true }));
  }, []);
  const handleInputBlur = useCallback(() => {
    setInputFocused(false);
    window.ankiBridge?.addMessage('textFieldFocus', JSON.stringify({ focused: false }));
  }, []);

  // ── Navigation callbacks (passed to child components) ─────────

  const handleStudyDeck = useCallback((deckId) => {
    window.ankiBridge?.addMessage('studyDeck', JSON.stringify({ deckId }));
  }, []);

  const handleSelectDeck = useCallback((deckId) => {
    window.ankiBridge?.addMessage('selectDeck', JSON.stringify({ deckId }));
  }, []);

  const handleTabClick = useCallback((tab) => {
    if (tab === 'stapel') {
      if (activeView === 'freeChat') {
        closeFreeChat();
      } else {
        window.ankiBridge?.addMessage('navigateTo', 'deckBrowser');
      }
    } else if (tab === 'session') {
      window.ankiBridge?.addMessage('navigateTo', 'overview');
    } else if (tab === 'statistik') {
      window.ankiBridge?.addMessage('openStats', '');
    }
  }, [activeView, closeFreeChat]);

  const handleSidebarToggle = useCallback(() => {
    window.ankiBridge?.addMessage('toggleSettingsSidebar', '');
  }, []);

  // ── Render ────────────────────────────────────────────────────

  const isFreeChatAnimatingIn = freeChatTransition === 'entering' || freeChatTransition === 'visible';
  const showFreeChat = activeView === 'freeChat' && freeChatTransition !== 'idle';

  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', flexDirection: 'column',
      background: showFreeChat && isFreeChatAnimatingIn ? 'var(--ds-bg-deep)' : 'var(--ds-bg-canvas)',
      transition: 'background-color 400ms cubic-bezier(0.25, 0.1, 0.25, 1)',
    }}>
      {/* TopBar — placeholder, replaced in Task 3 */}
      <div style={{ height: 56, flexShrink: 0 }} />

      {/* View content — placeholder divs, replaced in Tasks 4-7 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {activeView === 'deckBrowser' && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ds-text-muted)' }}>
            DeckBrowser (Task 4)
          </div>
        )}
        {activeView === 'overview' && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ds-text-muted)' }}>
            Overview (Task 7)
          </div>
        )}
        {showFreeChat && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ds-text-muted)' }}>
            FreeChat (Task 8)
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add `mode=main` routing to main.jsx**

In `frontend/src/main.jsx`, add import and routing:

```jsx
// Add import at top
import MainApp from './MainApp';

// In the routing block, add before the else:
if (mode === 'main') {
  root.render(
    <React.StrictMode>
      <MainApp />
    </React.StrictMode>
  );
} else if (mode === 'freechat') {
```

- [ ] **Step 3: Build and verify**

```bash
cd frontend && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/MainApp.jsx frontend/src/main.jsx
git commit -m "feat(ui): add MainApp React root with state management and view switching"
```

---

### Task 3: Create `TopBar` component

**Files:**
- Create: `frontend/src/components/TopBar.jsx`

Unified top bar replacing both `_top_bar()` from custom_screens and `OverlayHeader`.

- [ ] **Step 1: Create TopBar.jsx**

Reference values from `custom_screens.py:360-437`:
- Height: 56px, paddingTop: 4px, padding: 0 20px
- Tab container: `p-[3px] rounded-lg` background `var(--ds-hover-tint)`
- Active tab: `px-4 py-[5px] text-xs font-semibold rounded-md` background `var(--ds-border-subtle)`
- Inactive tab: same padding, font-weight 500, transparent background
- Left text: font-size 11px, font-weight 600, color `var(--ds-text-tertiary)`

```jsx
import React from 'react';

/**
 * TopBar — unified top bar for all views.
 * Adapts content based on activeView and ankiState.
 */
export default function TopBar({
  activeView = 'deckBrowser',
  ankiState = 'deckBrowser',
  messageCount = 0,
  totalDue = 0,
  deckName = '',
  dueNew = 0,
  dueLearning = 0,
  dueReview = 0,
  onTabClick,
  onSidebarToggle,
  holdToResetProps = {},
}) {
  const activeTab = ankiState === 'overview' ? 'session' : 'stapel';

  // Plus button
  const plusButton = (
    <button
      onClick={onSidebarToggle}
      style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: 4, marginRight: 8,
        transition: 'transform 0.2s ease, opacity 0.15s ease',
        display: 'flex', alignItems: 'center', outline: 'none',
      }}
      onMouseEnter={e => { e.currentTarget.style.opacity = '0.6'; }}
      onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="5" y="0" width="4" height="14" rx="2" fill="var(--ds-accent)" opacity="0.6"/>
        <rect x="0" y="5" width="14" height="4" rx="2" fill="var(--ds-accent)" opacity="0.6"/>
      </svg>
    </button>
  );

  // Left content — depends on view
  let leftContent;
  if (activeView === 'freeChat') {
    leftContent = (
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {plusButton}
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ds-text-tertiary)' }}>
          {messageCount} {messageCount === 1 ? 'Nachricht' : 'Nachrichten'}
        </span>
      </div>
    );
  } else if (ankiState === 'overview') {
    const shortDeck = deckName ? deckName.split('::').pop() : '';
    leftContent = (
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {plusButton}
        <span style={{
          fontSize: 11, fontWeight: 600, color: 'var(--ds-text-tertiary)',
          maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {shortDeck}
        </span>
      </div>
    );
  } else {
    leftContent = (
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {plusButton}
        {totalDue > 0 && (
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ds-text-tertiary)' }}>
            Heute: {totalDue} Karten
          </span>
        )}
      </div>
    );
  }

  // Right content
  let rightContent;
  if (activeView === 'freeChat') {
    rightContent = <HoldToResetIndicator {...holdToResetProps} />;
  } else if (ankiState === 'overview') {
    rightContent = (
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, fontWeight: 600, color: 'var(--ds-stat-new)', fontVariantNumeric: 'tabular-nums' }}>{dueNew}</span>
        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, fontWeight: 600, color: 'var(--ds-stat-learning)', fontVariantNumeric: 'tabular-nums' }}>{dueLearning}</span>
        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, fontWeight: 600, color: 'var(--ds-stat-review)', fontVariantNumeric: 'tabular-nums' }}>{dueReview}</span>
      </div>
    );
  } else {
    rightContent = (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {[
          { color: 'var(--ds-stat-new)', label: 'Neu' },
          { color: 'var(--ds-stat-learning)', label: 'Fällig' },
          { color: 'var(--ds-stat-review)', label: 'Wieder' },
        ].map(({ color, label }) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
            <span style={{ fontSize: 10, fontWeight: 500, color }}>{label}</span>
          </span>
        ))}
      </div>
    );
  }

  // Tab bar
  const tabs = [
    { id: 'stapel', label: 'Stapel' },
    { id: 'session', label: 'Session' },
    { id: 'statistik', label: 'Statistik' },
  ];

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 20px', height: 56, paddingTop: 4, flexShrink: 0,
      background: 'transparent',
    }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>{leftContent}</div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 2, padding: 3, borderRadius: 8,
        background: 'var(--ds-hover-tint)',
      }}>
        {tabs.map(({ id, label }) => {
          const isActive = id === activeTab;
          return (
            <button
              key={id}
              onClick={() => onTabClick?.(id)}
              style={{
                padding: '5px 16px', fontSize: 12, borderRadius: 6,
                border: 'none', cursor: isActive ? 'default' : 'pointer',
                fontWeight: isActive ? 600 : 500,
                background: isActive ? 'var(--ds-border-subtle)' : 'transparent',
                color: isActive ? 'var(--ds-text-primary)' : 'var(--ds-text-muted)',
                transition: 'background 0.15s, color 0.15s',
                fontFamily: 'inherit', lineHeight: 1,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>{rightContent}</div>
    </div>
  );
}

function HoldToResetIndicator({ progress = 0, isHolding = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        fontSize: 10, fontWeight: 500, color: 'var(--ds-text-muted)',
        opacity: isHolding ? 1 : 0.6, transition: 'opacity 0.15s',
      }}>
        Zurücksetzen
      </span>
      <span style={{
        background: 'var(--ds-border-subtle)', padding: '2px 6px', borderRadius: 4,
        fontSize: 10, fontWeight: 600, color: 'var(--ds-text-secondary)',
        position: 'relative', overflow: 'hidden', minWidth: 18, textAlign: 'center',
      }}>
        R
        <span style={{
          position: 'absolute', left: 0, bottom: 0, height: 2,
          width: `${progress * 100}%`,
          background: progress > 0.8 ? 'var(--ds-red)' : 'var(--ds-text-muted)',
          transition: isHolding ? 'none' : 'width 0.15s ease',
          borderRadius: 1,
        }} />
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Wire TopBar into MainApp.jsx**

Replace the placeholder `<div style={{ height: 56, flexShrink: 0 }} />` in MainApp with:

```jsx
import TopBar from './components/TopBar';

// In the render:
<TopBar
  activeView={activeView}
  ankiState={ankiState}
  messageCount={messageCount}
  totalDue={deckBrowserData?.totalDue || 0}
  deckName={overviewData?.deckName || ''}
  dueNew={ankiState === 'overview' ? (overviewData?.dueNew || 0) : (deckBrowserData?.totalNew || 0)}
  dueLearning={ankiState === 'overview' ? (overviewData?.dueLearning || 0) : (deckBrowserData?.totalLearn || 0)}
  dueReview={ankiState === 'overview' ? (overviewData?.dueReview || 0) : (deckBrowserData?.totalReview || 0)}
  onTabClick={handleTabClick}
  onSidebarToggle={handleSidebarToggle}
  holdToResetProps={holdToReset}
/>
```

- [ ] **Step 3: Build and commit**

```bash
cd frontend && npm run build
git add frontend/src/components/TopBar.jsx frontend/src/MainApp.jsx
git commit -m "feat(ui): add TopBar component — unified tab bar for all views"
```

---

### Task 4: Create `DeckSearchBar` component

**Files:**
- Create: `frontend/src/components/DeckSearchBar.jsx`

Port of the search bar from custom_screens `_SEARCHBAR_JS` (rotating placeholders, snake border, send button).

- [ ] **Step 1: Create the component**

The search bar has: rotating placeholder phrases, snake border animation on focus, Cmd+K badge, send arrow on text input, Enter to submit, double-click to open empty.

Write the complete component following the exact styling from custom_screens (snake border = conic-gradient animation, placeholder rotation every 6s).

Key behavior:
- `onSubmit(text)` — called when user presses Enter with text
- `onOpenEmpty()` — called on double-click or Enter with empty
- Input: frosted glass style (`var(--ds-bg-frosted)`, `backdrop-filter: blur(20px)`)

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/DeckSearchBar.jsx
git commit -m "feat(ui): add DeckSearchBar with rotating placeholders and snake border"
```

---

### Task 5: Create `useDeckTree` hook and `DeckNode` component

**Files:**
- Create: `frontend/src/hooks/useDeckTree.js`
- Create: `frontend/src/components/DeckNode.jsx`

- [ ] **Step 1: Create useDeckTree hook**

Manages expand/collapse state with localStorage persistence (key: `ap_expand`). Same format as current custom_screens.

```javascript
import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'ap_expand';

export function useDeckTree() {
  const [expanded, setExpanded] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch { return {}; }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expanded));
  }, [expanded]);

  const toggleExpanded = useCallback((deckId) => {
    setExpanded(prev => ({ ...prev, [deckId]: !prev[deckId] }));
  }, []);

  const isExpanded = useCallback((deckId) => {
    return !!expanded[deckId];
  }, [expanded]);

  return { isExpanded, toggleExpanded };
}
```

- [ ] **Step 2: Create DeckNode component**

Recursive component rendering a deck card with its children. Reference: `_deck_card()` (65 lines) and `_child_row()` (64 lines) from custom_screens.

Props: `node`, `depth`, `isExpanded`, `onToggle`, `onStudy`, `onSelect`, `index` (for stagger animation)

Visual: chevron (rotates on expand), deck name, colored stat numbers (new/learning/review), expand on click if has children, study action on click if leaf.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useDeckTree.js frontend/src/components/DeckNode.jsx
git commit -m "feat(ui): add DeckNode recursive component and useDeckTree expand state hook"
```

---

### Task 6: Create `DeckBrowserView` and `AccountBadge`

**Files:**
- Create: `frontend/src/components/DeckBrowserView.jsx`
- Create: `frontend/src/components/AccountBadge.jsx`

- [ ] **Step 1: Create AccountBadge**

Simple badge replacing the 534-line `_account_widget()`. Shows "AnkiPlus" + "Free" or "Pro" badge. Fixed bottom-right. Clickable → toggle settings sidebar.

- [ ] **Step 2: Create DeckBrowserView**

Container that composes: Anki.plus wordmark, DeckSearchBar, DeckNode tree, AccountBadge. Receives `deckBrowserData` as prop. Uses `useDeckTree` for expand state.

Layout: centered content (max-width 720px), wordmark at top, search bar below, deck list below that. Same layout as current custom_screens.

- [ ] **Step 3: Wire into MainApp**

Replace the deckBrowser placeholder in MainApp with the real component.

- [ ] **Step 4: Build and commit**

```bash
cd frontend && npm run build
git add frontend/src/components/DeckBrowserView.jsx frontend/src/components/AccountBadge.jsx frontend/src/MainApp.jsx
git commit -m "feat(ui): add DeckBrowserView with deck tree, search bar, and account badge"
```

---

### Task 7: Create `OverviewView`

**Files:**
- Create: `frontend/src/components/OverviewView.jsx`

Port of `_overview_html()` (296 lines) from custom_screens.

- [ ] **Step 1: Create the component**

Content: Deck path (hierarchical), three colored pills (New/Learning/Review counts), "Jetzt lernen" button (or "Keine Karten fällig" if all zero), "Zurück" link.

Props: `overviewData`, `onStudy`, `onBack`, `onOptions`

- [ ] **Step 2: Wire into MainApp**

Replace the overview placeholder.

- [ ] **Step 3: Build and commit**

```bash
cd frontend && npm run build
git add frontend/src/components/OverviewView.jsx frontend/src/MainApp.jsx
git commit -m "feat(ui): add OverviewView with study button, deck info, and due pills"
```

---

### Task 8: Integrate FreeChat into MainApp

**Files:**
- Modify: `frontend/src/MainApp.jsx`

FreeChat is already set up in MainApp (useFreeChat hook, state management). This task adds the actual rendering with ChatMessage, StreamingChatMessage, ContextTags, ChatInput.

- [ ] **Step 1: Add FreeChat rendering**

Import ChatMessage, StreamingChatMessage, ChatInput, ContextTags, ErrorBoundary. Add the FreeChat view with the same layout as the current FreeChatApp but as a conditional view within MainApp.

Key: transition animations (mounting → entering → visible) with background color change from `--ds-bg-canvas` to `--ds-bg-deep`.

- [ ] **Step 2: Build and test in browser**

```bash
cd frontend && npm run dev
```

Open `http://localhost:3000?mode=main`. Verify: TopBar renders, DeckBrowser shows placeholder, Space opens FreeChat with transition.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/MainApp.jsx
git commit -m "feat(ui): integrate FreeChat view into MainApp with transition animations"
```

---

### Task 9: Wire MainViewWidget into Anki hooks

**Files:**
- Modify: `__init__.py`
- Modify: `ui/setup.py`

This connects the Python side to Anki's state machine.

- [ ] **Step 1: Update `__init__.py`**

Replace `custom_screens.enable()` (line 325) with MainViewWidget initialization:

```python
# Replace:
#   custom_screens.enable()
#   QTimer.singleShot(80, custom_screens.refresh_if_visible)
# With:
try:
    from .ui.main_view import get_main_view, show_main_view
    main_view = get_main_view()
    # Show for current state
    current_state = getattr(mw, 'state', 'deckBrowser')
    QTimer.singleShot(200, lambda: show_main_view(current_state))
except Exception as e:
    logger.error("Failed to init MainViewWidget: %s", e)
```

Update `on_state_will_change()` to call `show_main_view(new_state)`:

```python
# In on_state_will_change, after the toolbar hiding logic:
try:
    from .ui.main_view import show_main_view
    show_main_view(new_state)
except Exception:
    pass
```

Remove the custom_screens import and all references.

- [ ] **Step 2: Update `ui/setup.py`**

No dock changes needed (sidebar stays). But remove any overlay_chat imports if present.

- [ ] **Step 3: Update shortcut filter**

In `ui/shortcut_filter.py`, the `_overlay_visible` flag should now be controlled by MainViewWidget. Update if needed — but since MainViewWidget is always visible (except in review), the Space shortcut from the filter can be simplified or removed (React handles it internally now).

Actually, when MainViewWidget is visible, keyboard events go to its QWebEngineView where React handles them. The GlobalShortcutFilter should **not** intercept Space/R when MainViewWidget is active. Add a `_main_view_active` flag.

- [ ] **Step 4: Build frontend, test in Anki**

```bash
cd frontend && npm run build
```

Restart Anki. Verify:
1. DeckBrowser renders in React (TopBar + deck list)
2. Click a deck → Overview renders
3. Click "Jetzt lernen" → review starts, MainViewWidget hides
4. Finish review / press Escape → MainViewWidget shows again
5. Space → FreeChat opens with smooth transition

- [ ] **Step 5: Commit**

```bash
git add __init__.py ui/setup.py ui/shortcut_filter.py
git commit -m "feat(hooks): wire MainViewWidget into Anki state machine, replace custom_screens"
```

---

### Task 10: Delete old files and cleanup

**Files:**
- Delete: `ui/overlay_chat.py`
- Delete: `ui/custom_screens.py`
- Delete: `frontend/src/FreeChatApp.jsx`
- Delete: `frontend/src/components/OverlayHeader.jsx`
- Modify: `__init__.py` (remove custom_screens import)
- Modify: `frontend/src/main.jsx` (remove FreeChatApp import/routing)

- [ ] **Step 1: Search for all references to deleted files**

Grep for `overlay_chat`, `custom_screens`, `FreeChatApp`, `OverlayHeader` across the codebase. Fix any remaining imports.

- [ ] **Step 2: Delete files**

```bash
rm ui/overlay_chat.py ui/custom_screens.py
rm frontend/src/FreeChatApp.jsx frontend/src/components/OverlayHeader.jsx
```

- [ ] **Step 3: Fix broken imports**

Update any file that imports from the deleted modules.

- [ ] **Step 4: Build and run tests**

```bash
cd frontend && npm run build
cd .. && python3 run_tests.py -v
```

- [ ] **Step 5: Commit**

```bash
git add -u  # stage deletions
git add __init__.py frontend/src/main.jsx
git commit -m "refactor: delete custom_screens, overlay_chat, FreeChatApp — replaced by MainViewWidget + MainApp"
```

---

### Task 11: Final integration test and polish

**Files:**
- Various (fixes found during testing)

- [ ] **Step 1: Full manual test in Anki**

Test matrix:
1. Anki start → DeckBrowser renders correctly
2. Deck tree → expand/collapse works, persists in localStorage
3. Search bar → type + Enter → FreeChat opens with question
4. Space → FreeChat opens empty
5. Space in FreeChat → closes back to DeckBrowser
6. Hold R → chat clears
7. Click deck → Overview renders with correct data
8. Click "Jetzt lernen" → review starts, MainView hides
9. Finish cards → MainView shows, correct state restored
10. FreeChat open → switch to overview → switch back → FreeChat restored
11. Cmd+K → focuses search bar
12. Settings sidebar toggle works
13. AccountBadge shows correct tier

- [ ] **Step 2: Fix visual issues**

Compare pixel-by-pixel with the old custom_screens rendering. Fix any spacing, font, or color discrepancies.

- [ ] **Step 3: Build final version**

```bash
cd frontend && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add frontend/ ui/ __init__.py
git commit -m "fix: integration test fixes for SP1 React unification"
```
