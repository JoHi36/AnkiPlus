# React Chat Overlay — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the native HTML/JS chat in the deck browser with a React-powered overlay that uses the exact same components as the session chat (ChatMessage, StreamingChatMessage, ThoughtStream, ChatInput, SourcesCarousel).

**Architecture:** When the user clicks the searchbar in `custom_screens.py`, Python creates a QWebEngineView overlay widget positioned over Anki's main content area. This overlay loads the same `web/index.html` with `?mode=freechat`. React detects the mode parameter and renders a dedicated FreeChatApp — a stripped-down chat UI using the same shared components as the session chat. Communication uses the same ankiBridge message-queue pattern. The native HTML chat in custom_screens.py is completely removed.

**Tech Stack:** Python/PyQt6, React 18, same shared components (ChatMessage, ChatInput, ThoughtStream, SourcesCarousel)

---

## File Structure

| File | Role | Action |
|------|------|--------|
| `overlay_chat.py` | QWebEngineView overlay widget + message queue + AI request handling | **Create** |
| `custom_screens.py` | Deck browser HTML injection — remove native chat, wire searchbar to overlay | Modify |
| `frontend/src/FreeChatApp.jsx` | Standalone React app for overlay mode — same components, free-chat state | **Create** |
| `frontend/src/main.jsx` | Entry point — route to App or FreeChatApp based on URL param | Modify |
| `frontend/src/hooks/useFreeChat.js` | Free chat hook — already exists, minor fixes | Modify |

---

### Task 1: Create the Python overlay widget

**Why:** We need a QWebEngineView that can appear/disappear over Anki's main content area, loading the React app in freechat mode. It needs its own message queue and AI request handling.

**Files:**
- Create: `overlay_chat.py`

- [ ] **Step 1: Create overlay_chat.py with the OverlayChatWidget class**

This widget is a QWidget containing a QWebEngineView, positioned as a child of `mw` (Anki's main window). It loads `web/index.html?mode=freechat` and sets up its own ankiBridge message queue.

```python
"""
Overlay Chat Widget
A QWebEngineView that overlays Anki's main content area,
running the React app in freechat mode.
"""

import os
import json
import time
from aqt import mw
from aqt.qt import *

try:
    from PyQt6.QtWebEngineWidgets import QWebEngineView
except ImportError:
    try:
        from PyQt5.QtWebEngineWidgets import QWebEngineView
    except ImportError:
        QWebEngineView = None

try:
    from .card_sessions_storage import load_deck_messages, save_deck_message
    from .config import get_config
except ImportError:
    from card_sessions_storage import load_deck_messages, save_deck_message
    from config import get_config


class OverlayChatWidget(QWidget):
    """React-based chat overlay that covers Anki's main content area."""

    def __init__(self, parent=None):
        super().__init__(parent or mw)
        self.web_view = None
        self.message_timer = None
        self._current_thread = None
        self._streaming_text = ''
        self._visible = False
        self._bridge_initialized = False
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
        # Transparent background so animation fade looks smooth
        self.web_view.page().setBackgroundColor(QColor(0, 0, 0, 0))

        html_path = os.path.join(os.path.dirname(__file__), "web", "index.html")
        url = QUrl.fromLocalFile(html_path)
        url.setQuery(f"v={int(time.time())}&mode=freechat")
        self.web_view.loadFinished.connect(self._init_bridge)
        self.web_view.load(url)

        layout.addWidget(self.web_view)
        self.setLayout(layout)
        self.hide()  # Start hidden

    def _init_bridge(self):
        """Initialize ankiBridge message queue in the overlay webview."""
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
                const msgs = this.messageQueue.slice();
                this.messageQueue = [];
                return msgs;
            }
        };
        console.log('overlay ankiBridge initialized');
        """
        self.web_view.page().runJavaScript(js)
        self.message_timer = QTimer()
        self.message_timer.timeout.connect(self._poll_messages)
        self.message_timer.start(100)

    def _poll_messages(self):
        """Poll for messages from React."""
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
            print(f"OverlayChat: message parse error: {e}")

    def _route_message(self, msg_type, data):
        """Route messages from React to appropriate handlers."""
        if msg_type == 'loadDeckMessages':
            deck_id = int(data) if isinstance(data, (int, str)) else 0
            try:
                messages = load_deck_messages(deck_id, limit=50)
                payload = {"type": "deckMessagesLoaded", "deckId": deck_id, "messages": messages}
                self._send_to_react(payload)
            except Exception as e:
                print(f"OverlayChat: loadDeckMessages error: {e}")

        elif msg_type == 'saveDeckMessage':
            try:
                msg_data = json.loads(data) if isinstance(data, str) else data
                save_deck_message(int(msg_data.get('deckId', 0)), msg_data.get('message', {}))
            except Exception as e:
                print(f"OverlayChat: saveDeckMessage error: {e}")

        elif msg_type == 'sendMessage':
            try:
                msg_data = json.loads(data) if isinstance(data, str) else data
                text = msg_data.get('text', '')
                if text.strip():
                    self._start_ai_request(text, msg_data)
            except Exception as e:
                print(f"OverlayChat: sendMessage error: {e}")

        elif msg_type == 'cancelRequest':
            if self._current_thread:
                try:
                    self._current_thread.cancel()
                except Exception:
                    pass
                self._current_thread = None
                self._send_to_react({"type": "loading", "loading": False})

        elif msg_type == 'closeOverlay':
            self.hide_overlay()

    def _send_to_react(self, payload):
        """Send a payload to the React app via window.ankiReceive."""
        if self.web_view:
            js = f"window.ankiReceive && window.ankiReceive({json.dumps(payload)});"
            self.web_view.page().runJavaScript(js)

    def _start_ai_request(self, text, msg_data):
        """Start an AI request using the same AIHandler as the main chat.
        Uses the same get_response_with_rag + callback pattern as widget.py."""
        try:
            from .ai_handler import get_ai_handler
        except ImportError:
            from ai_handler import get_ai_handler

        try:
            ai_handler = get_ai_handler()
            context = self._build_context()

            self._streaming_text = ''
            self._send_to_react({"type": "loading", "loading": True})

            # Use QThread — same pattern as widget.py's AIRequestThread
            from aqt.qt import QThread

            class FreeChatThread(QThread):
                chunk_signal = pyqtSignal(str, str, bool, bool)  # request_id, chunk, done, is_function_call
                finished_signal = pyqtSignal(str)  # request_id
                error_signal = pyqtSignal(str, str)  # request_id, error

                def __init__(self, handler, text, context, history, mode):
                    super().__init__()
                    self.handler = handler
                    self.text = text
                    self.context = context
                    self.history = history
                    self.mode = mode
                    self.request_id = f"fc-{int(time.time()*1000)}"
                    self._cancelled = False

                def cancel(self):
                    self._cancelled = True

                def run(self):
                    try:
                        def stream_callback(chunk, done, is_function_call=False, steps=None, citations=None, step_labels=None):
                            if self._cancelled:
                                return
                            self.chunk_signal.emit(self.request_id, chunk or "", done, is_function_call)

                        self.handler.get_response_with_rag(
                            self.text, context=self.context, history=self.history,
                            mode=self.mode, callback=stream_callback
                        )

                        if not self._cancelled:
                            self.finished_signal.emit(self.request_id)
                    except Exception as e:
                        if not self._cancelled:
                            self.error_signal.emit(self.request_id, str(e))
                    finally:
                        self.handler._pipeline_signal_callback = None

            # Load chat history from DB for AI context
            db_messages = load_deck_messages(0, limit=20)
            history = [
                {'role': 'assistant' if m.get('sender') == 'assistant' else 'user',
                 'content': m.get('text', '')}
                for m in db_messages
            ]

            mode = msg_data.get('mode', 'compact') if isinstance(msg_data, dict) else 'compact'
            thread = FreeChatThread(ai_handler, text, context, history, mode)
            thread.chunk_signal.connect(self._on_chunk)
            thread.finished_signal.connect(self._on_ai_done)
            thread.error_signal.connect(self._on_ai_error)
            thread.finished.connect(thread.deleteLater)  # Clean up thread
            self._current_thread = thread
            thread.start()

        except Exception as e:
            self._send_to_react({"type": "error", "message": str(e)})
            self._send_to_react({"type": "loading", "loading": False})

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
        self._current_thread = None

    def _on_ai_error(self, request_id, error):
        self._send_to_react({"type": "error", "message": error})
        self._send_to_react({"type": "loading", "loading": False})
        self._streaming_text = ''
        self._current_thread = None

    def _build_context(self):
        """Build deck-level context (no card context)."""
        import datetime
        today = datetime.date.today().strftime('%A, %d. %B %Y')
        lines = [
            "Du bist ein hilfreicher Lernassistent für Anki-Karteikarten.",
            f"Heute ist {today}.",
        ]
        try:
            total = mw.col.card_count() if hasattr(mw.col, 'card_count') else 0
            lines.append(f"Der Nutzer hat {total} Karten in seiner Sammlung.")
        except Exception:
            pass
        return "\n".join(lines)

    # ── Show / Hide with animation ───────────────────────────────────

    def show_overlay(self, initial_text=''):
        """Show the overlay with a fade-in animation."""
        if self._visible:
            # Already visible — just send new text if provided
            if initial_text:
                self._send_to_react({"type": "initialText", "text": initial_text})
            return

        self._visible = True
        self._position_over_main()
        self.show()
        self.raise_()

        # Tell React to animate in and optionally send initial text
        QTimer.singleShot(50, lambda: self._send_to_react({
            "type": "overlayShow",
            "initialText": initial_text or ''
        }))

    def hide_overlay(self):
        """Hide the overlay with a fade-out animation."""
        if not self._visible:
            return
        self._visible = False
        # Tell React to animate out, then hide the widget
        self._send_to_react({"type": "overlayHide"})
        QTimer.singleShot(300, self.hide)  # 300ms for animation

    def _position_over_main(self):
        """Position this widget exactly over Anki's main content area."""
        try:
            main_widget = mw.centralWidget()
            if main_widget:
                # Map central widget position to main window coordinates
                pos = main_widget.mapTo(mw, QPoint(0, 0))
                self.setGeometry(pos.x(), pos.y(), main_widget.width(), main_widget.height())
            else:
                self.setGeometry(mw.rect())
        except Exception:
            self.setGeometry(mw.rect())

    def resizeEvent(self, event):
        """Re-position when parent resizes."""
        super().resizeEvent(event)
        if self._visible:
            self._position_over_main()


# ── Singleton access ─────────────────────────────────────────────────

_overlay_instance = None

def get_overlay():
    """Get or create the singleton overlay widget."""
    global _overlay_instance
    if _overlay_instance is None:
        _overlay_instance = OverlayChatWidget(mw)
    return _overlay_instance

def show_overlay_chat(initial_text=''):
    """Show the overlay chat, optionally with initial text."""
    overlay = get_overlay()
    overlay.show_overlay(initial_text)

def hide_overlay_chat():
    """Hide the overlay chat."""
    overlay = get_overlay()
    overlay.hide_overlay()
```

- [ ] **Step 2: Commit**

```bash
git add overlay_chat.py
git commit -m "feat(chat): create OverlayChatWidget — React overlay for deck browser"
```

---

### Task 2: Create FreeChatApp.jsx — the overlay React app

**Why:** When the overlay QWebEngineView loads `?mode=freechat`, React needs to render a dedicated chat UI. This is a stripped-down version of App.jsx that uses the same ChatMessage, StreamingChatMessage, ThoughtStream, ChatInput, and SourcesCarousel components.

**Files:**
- Create: `frontend/src/FreeChatApp.jsx`

- [ ] **Step 1: Create FreeChatApp.jsx**

This component is the root for freechat mode. It sets up `window.ankiReceive`, manages messages via `useFreeChat`, and renders the chat using the exact same components as the session chat.

```jsx
// frontend/src/FreeChatApp.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ChatMessage from './components/ChatMessage';
import StreamingChatMessage from './components/StreamingChatMessage';
import ChatInput from './components/ChatInput';
import ErrorBoundary from './components/ErrorBoundary';
import CardRefChip from './components/CardRefChip';
import DeckSectionDivider from './components/DeckSectionDivider';
import { useFreeChat } from './hooks/useFreeChat';

/**
 * FreeChatApp — standalone React app for the overlay chat.
 * Uses the exact same components as the session chat.
 * Loaded when URL has ?mode=freechat
 */
export default function FreeChatApp() {
  const [isReady, setIsReady] = useState(false);
  const [animState, setAnimState] = useState('hidden'); // 'hidden' | 'entering' | 'visible' | 'exiting'
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);

  // Bridge object for components that need it
  const bridge = useRef({
    sendMessage: (data) => {
      window.ankiBridge?.addMessage('sendMessage', data);
    },
    cancelRequest: () => {
      window.ankiBridge?.addMessage('cancelRequest', '');
    },
    goToCard: (cardId) => {
      window.ankiBridge?.addMessage('goToCard', cardId);
    },
  }).current;

  const freeChatHook = useFreeChat({
    bridge,
    onLoadingChange: () => {},
    onCancelComplete: () => {},
  });

  const {
    messages, streamingMessage, isLoading, handleSend,
    handleDeckMessagesLoaded, handleAnkiReceive, loadForDeck,
  } = freeChatHook;

  // Refs for stable callback references (prevent ankiReceive reassignment)
  const handleDeckMessagesLoadedRef = useRef(handleDeckMessagesLoaded);
  const handleAnkiReceiveRef = useRef(handleAnkiReceive);
  const handleSendRef = useRef(handleSend);
  const loadForDeckRef = useRef(loadForDeck);

  useEffect(() => { handleDeckMessagesLoadedRef.current = handleDeckMessagesLoaded; }, [handleDeckMessagesLoaded]);
  useEffect(() => { handleAnkiReceiveRef.current = handleAnkiReceive; }, [handleAnkiReceive]);
  useEffect(() => { handleSendRef.current = handleSend; }, [handleSend]);
  useEffect(() => { loadForDeckRef.current = loadForDeck; }, [loadForDeck]);

  // Set up window.ankiReceive handler ONCE (stable via refs)
  useEffect(() => {
    // Drain any queued messages from pre-React loading
    const queued = window._ankiReceiveQueue?.splice(0) || [];

    window.ankiReceive = (payload) => {
      if (!payload || !payload.type) return;

      if (payload.type === 'deckMessagesLoaded') {
        handleDeckMessagesLoadedRef.current(payload);
        return;
      }

      if (payload.type === 'overlayShow') {
        setAnimState('entering');
        setTimeout(() => setAnimState('visible'), 20);
        loadForDeckRef.current(0);
        if (payload.initialText) {
          setTimeout(() => handleSendRef.current(payload.initialText), 400);
        }
        return;
      }

      if (payload.type === 'overlayHide') {
        setAnimState('exiting');
        return;
      }

      if (payload.type === 'initialText' && payload.text) {
        handleSendRef.current(payload.text);
        return;
      }

      handleAnkiReceiveRef.current(payload);
    };

    // Process any queued messages
    queued.forEach(p => window.ankiReceive(p));

    setIsReady(true);
    return () => { window.ankiReceive = null; };
  }, []); // Empty deps — runs once, uses refs for latest values

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage]);

  const handleClose = useCallback(() => {
    if (isLoading) {
      bridge.cancelRequest();
    }
    window.ankiBridge?.addMessage('closeOverlay', '');
  }, [isLoading, bridge]);

  const handleSendMessage = useCallback((text) => {
    handleSend(text, 'compact');
  }, [handleSend]);

  const isVisible = animState === 'entering' || animState === 'visible';

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: '#161616',
      display: 'flex',
      flexDirection: 'column',
      opacity: isVisible ? 1 : 0,
      transform: isVisible ? 'translateY(0)' : 'translateY(12px)',
      transition: 'opacity 280ms ease, transform 280ms ease',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px 12px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', letterSpacing: '-0.3px' }}>
          Anki<span style={{ color: '#6b8cff' }}>Plus</span>
          <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 400, marginLeft: 8, fontSize: 12 }}>Chat</span>
        </div>
        <button
          onClick={handleClose}
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: 'none',
            borderRadius: 8,
            color: 'rgba(255,255,255,0.4)',
            fontSize: 11,
            padding: '4px 12px',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
        >
          ESC
        </button>
      </div>

      {/* Messages area */}
      <div
        ref={messagesContainerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 16px 120px',
          maxWidth: 720,
          width: '100%',
          margin: '0 auto',
        }}
      >
        {messages.length === 0 && !isLoading && !streamingMessage && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'rgba(255,255,255,0.15)',
            fontSize: 13,
          }}>
            Stelle eine Frage...
          </div>
        )}

        {messages.map((msg, idx) => {
          const prevMsg = idx > 0 ? messages[idx - 1] : null;
          const deckChanged = msg.deckName && (!prevMsg || prevMsg.deckName !== msg.deckName);
          const showDivider = deckChanged || (idx === 0 && msg.deckName);

          return (
            <React.Fragment key={msg.id}>
              {showDivider && <DeckSectionDivider deckName={msg.deckName} />}
              <div className="mb-6">
                <ErrorBoundary>
                  <ChatMessage
                    message={msg.text}
                    from={msg.from}
                    cardContext={null}
                    steps={msg.steps || []}
                    citations={msg.citations || {}}
                    pipelineSteps={[]}
                    bridge={bridge}
                    isLastMessage={idx === messages.length - 1}
                  />
                </ErrorBoundary>
              </div>
              {msg.cardId && (
                <div style={{ padding: '0 16px', marginTop: -16, marginBottom: 16 }}>
                  <CardRefChip cardId={msg.cardId} cardFront={msg.cardFront} bridge={bridge} />
                </div>
              )}
            </React.Fragment>
          );
        })}

        {/* Streaming message */}
        {(isLoading || streamingMessage) && (
          <div className="w-full flex-none">
            <StreamingChatMessage
              message={streamingMessage || ''}
              isStreaming={isLoading}
              cardContext={null}
              steps={[]}
              citations={{}}
              pipelineSteps={[]}
              bridge={bridge}
            />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input — fixed bottom */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '0 16px 16px',
        maxWidth: 720,
        margin: '0 auto',
        width: '100%',
      }}>
        <ChatInput
          onSend={handleSendMessage}
          isLoading={isLoading}
          onStop={() => bridge.cancelRequest()}
          cardContext={null}
          isPremium={true}
          onClose={handleClose}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/FreeChatApp.jsx
git commit -m "feat(chat): create FreeChatApp — overlay React app using same session components"
```

---

### Task 3: Route React entry point based on URL mode

**Why:** `main.jsx` is the React entry point. It needs to check for `?mode=freechat` and render FreeChatApp instead of App.

**Files:**
- Modify: `frontend/src/main.jsx`

- [ ] **Step 1: Read main.jsx and add mode routing**

Read the current `frontend/src/main.jsx`, then modify it to add URL param detection:

```jsx
// At the top of main.jsx, after existing imports:
import FreeChatApp from './FreeChatApp';

// Replace the render call with:
const params = new URLSearchParams(window.location.search);
const mode = params.get('mode');

const root = ReactDOM.createRoot(document.getElementById('root'));

if (mode === 'freechat') {
  // Skip the ankiReceiveQueue system — FreeChatApp handles its own setup
  // and drains any queued messages on mount
  root.render(
    <React.StrictMode>
      <FreeChatApp />
    </React.StrictMode>
  );
} else {
  // Normal session app with queue system
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
```

**Important:** If `main.jsx` currently sets up `window._ankiReceiveQueue` before the render call, make sure the queue setup still runs for BOTH modes (so early messages are captured), but the queue-polling interval should only start for the non-freechat mode. `FreeChatApp` drains the queue itself on mount.

- [ ] **Step 2: Build frontend and verify**

```bash
cd frontend && npm run build
```

Open `web/index.html?mode=freechat` in a browser — should render FreeChatApp (empty chat). Open without param — should render the normal App.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/main.jsx
git commit -m "feat(chat): route React entry to FreeChatApp when mode=freechat"
```

---

### Task 4: Wire custom_screens.py searchbar to the overlay

**Why:** When the user clicks the searchbar or presses Enter in the deck browser, it should open the React overlay instead of the native HTML chat.

**Files:**
- Modify: `custom_screens.py:1523-1552` — replace `freeChat` action handling

- [ ] **Step 1: Replace the freeChat action handler**

In `custom_screens.py`, find `_handle_action()` method. Replace the `freeChat` and `freeChatSend` and `freeChatClose`/`freeChatCancel` cases with:

```python
            elif action_type == 'freeChat':
                text = action.get('text', '').strip()
                if text:
                    try:
                        from .overlay_chat import show_overlay_chat
                    except ImportError:
                        from overlay_chat import show_overlay_chat
                    show_overlay_chat(initial_text=text)
            elif action_type == 'freeChatSend':
                # Legacy — overlay handles its own sends now
                pass
            elif action_type in ('freeChatClose', 'freeChatCancel'):
                try:
                    from .overlay_chat import hide_overlay_chat
                except ImportError:
                    from overlay_chat import hide_overlay_chat
                hide_overlay_chat()
```

- [ ] **Step 2: Remove native chat HTML/JS/CSS from custom_screens.py**

Find and remove these blocks (they are no longer needed):
- `_CHAT_HTML` — the native chat overlay HTML (around line 948-1021)
- `_CHAT_JS` — the native chat JavaScript (around line 1023-1365)
- Remove `_CHAT_HTML` and `_CHAT_JS` from the `_deck_browser_html()` function call where they're concatenated into the page

**Important:** Keep `_SEARCHBAR_HTML` — the search bar stays in the native deck browser. Only the chat overlay and its JS are removed.

Also remove these methods that are no longer needed:
- `_fc_push_history_to_ui()`
- `_fc_push()`
- `_start_fc_request()` and the `_FreeChatThread` class
- `_build_fc_system_prompt()`
- `_save_fc_message()`
- `_load_fc_db_messages()`

Keep `_handle_action()` with the updated freeChat case from Step 1.

- [ ] **Step 3: Commit**

```bash
git add custom_screens.py
git commit -m "refactor(chat): replace native deck browser chat with React overlay trigger"
```

---

### Task 5: Handle overlay positioning and ESC key

**Why:** The overlay needs to correctly cover the main content area (not the side panel), reposition on window resize, and close on ESC key.

**Files:**
- Modify: `overlay_chat.py` — add resize handling and ESC key support

- [ ] **Step 1: Add parent resize event filter**

In `overlay_chat.py`, the `OverlayChatWidget` needs to listen for the parent window's resize events to reposition itself. Add an event filter in `show_overlay`:

```python
    def show_overlay(self, initial_text=''):
        """Show the overlay with a fade-in animation."""
        if self._visible:
            if initial_text:
                self._send_to_react({"type": "initialText", "text": initial_text})
            return

        self._visible = True
        self._position_over_main()
        self.show()
        self.raise_()

        # Install event filter on parent to track resizes
        if self.parent():
            self.parent().installEventFilter(self)

        QTimer.singleShot(50, lambda: self._send_to_react({
            "type": "overlayShow",
            "initialText": initial_text or ''
        }))

    def hide_overlay(self):
        """Hide the overlay."""
        if not self._visible:
            return
        self._visible = False
        self._send_to_react({"type": "overlayHide"})
        # Remove event filter
        if self.parent():
            self.parent().removeEventFilter(self)
        QTimer.singleShot(300, self.hide)

    def eventFilter(self, obj, event):
        """Reposition overlay when parent resizes."""
        if event.type() == event.Type.Resize and self._visible:
            self._position_over_main()
        return super().eventFilter(obj, event)
```

- [ ] **Step 2: Add ESC key handling in FreeChatApp.jsx**

In `FreeChatApp.jsx`, add a keydown listener for ESC:

```jsx
  // ESC key to close
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleClose]);
```

- [ ] **Step 3: Build and commit**

```bash
cd frontend && npm run build
git add overlay_chat.py frontend/src/FreeChatApp.jsx
git commit -m "feat(chat): overlay resize handling + ESC key to close"
```

---

### Task 6: Build, test, and verify end-to-end

**Why:** Everything must work together: searchbar click → React overlay opens → messages load → user can chat → ESC closes.

- [ ] **Step 1: Build frontend**

```bash
cd frontend && npm run build
```

- [ ] **Step 2: Test the full flow in Anki**

1. Start Anki, go to DeckBrowser
2. Type in the searchbar and press Enter
3. **Verify:** React overlay appears with smooth fade-in animation
4. **Verify:** Historical messages from DB are loaded (with card references + deck dividers)
5. **Verify:** ChatMessage renders markdown correctly (bold, code blocks, etc.)
6. **Verify:** Can type a new message and get an AI response with streaming
7. **Verify:** ThoughtStream appears during pipeline processing
8. **Verify:** Press ESC → overlay fades out smoothly

- [ ] **Step 3: Test that the side panel still works**

1. Start a card review
2. **Verify:** Side panel session chat still works normally
3. **Verify:** Messages in the session chat are independent from the overlay chat
4. Go back to DeckBrowser
5. **Verify:** Previous session messages now appear in the overlay chat (chronological)

- [ ] **Step 4: Commit any fixes**

```bash
git add -A && git commit -m "fix(chat): overlay integration fixes"
```
