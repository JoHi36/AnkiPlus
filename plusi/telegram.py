"""plusi/telegram.py — Telegram bot bridge for Plusi agent.

Runs a polling loop in a QThread so Plusi can respond to Telegram
messages while Anki is open. No external server needed.
"""

import json
import os
import subprocess
import urllib.request
import urllib.error
import time
import threading

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

try:
    from ..config import get_config, update_config
except ImportError:
    from config import get_config, update_config

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

TELEGRAM_API = "https://api.telegram.org/bot{token}/{method}"
POLL_TIMEOUT = 30          # Long-polling timeout (seconds)
MAX_MESSAGE_LENGTH = 4096  # Telegram message length limit
RETRY_DELAY = 5            # Seconds to wait after an error before retrying

# ---------------------------------------------------------------------------
# Telegram API helpers (stdlib only — no pip dependencies)
# ---------------------------------------------------------------------------


def _api_call(token: str, method: str, data: dict = None) -> dict:
    """Call Telegram Bot API. Returns parsed JSON response."""
    url = TELEGRAM_API.format(token=token, method=method)
    if data is not None:
        payload = json.dumps(data).encode("utf-8")
        req = urllib.request.Request(
            url, data=payload,
            headers={"Content-Type": "application/json"},
        )
    else:
        req = urllib.request.Request(url)

    with urllib.request.urlopen(req, timeout=POLL_TIMEOUT + 10) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _send_message(token: str, chat_id: int, text: str) -> None:
    """Send a text message via Telegram, splitting if needed."""
    if not text:
        text = "..."

    # Split long messages
    chunks = [text[i:i + MAX_MESSAGE_LENGTH] for i in range(0, len(text), MAX_MESSAGE_LENGTH)]
    for chunk in chunks:
        try:
            _api_call(token, "sendMessage", {
                "chat_id": chat_id,
                "text": chunk,
                "parse_mode": "Markdown",
            })
        except Exception:
            # Fallback: send without Markdown if it fails
            try:
                _api_call(token, "sendMessage", {
                    "chat_id": chat_id,
                    "text": chunk,
                })
            except Exception as exc:
                logger.error("telegram: failed to send message: %s", exc)


def _send_mood_photo(token: str, chat_id: int, mood: str, caption: str) -> bool:
    """Send mood avatar as photo with the response text as caption."""
    try:
        try:
            from .mood_avatars import get_mood_png_path
        except ImportError:
            from plusi.mood_avatars import get_mood_png_path

        png_path = get_mood_png_path(mood)
        if not png_path or not os.path.exists(png_path):
            return False

        with open(png_path, 'rb') as f:
            photo_data = f.read()

        boundary = '----PlusiMood'
        url = TELEGRAM_API.format(token=token, method='sendPhoto')

        # Truncate caption (Telegram limit: 1024 chars for photo captions)
        cap = caption[:1024] if caption else ''

        parts = (
            f'--{boundary}\r\n'
            f'Content-Disposition: form-data; name="chat_id"\r\n\r\n'
            f'{chat_id}\r\n'
            f'--{boundary}\r\n'
            f'Content-Disposition: form-data; name="caption"\r\n\r\n'
            f'{cap}\r\n'
            f'--{boundary}\r\n'
            f'Content-Disposition: form-data; name="photo"; filename="plusi.png"\r\n'
            f'Content-Type: image/png\r\n\r\n'
        ).encode() + photo_data + f'\r\n--{boundary}--\r\n'.encode()

        req = urllib.request.Request(
            url, data=parts,
            headers={'Content-Type': f'multipart/form-data; boundary={boundary}'},
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read().decode('utf-8'))
            return result.get('ok', False)
    except Exception as exc:
        logger.warning("telegram: mood photo send failed: %s", exc)
        return False


def _send_message_kb(token: str, chat_id: int, text: str, keyboard: list,
                     message_id: int = None) -> dict:
    """Send or edit a message with an inline keyboard.

    keyboard: list of rows, each row is a list of {"text": ..., "callback_data": ...}.
    If message_id is given, edits that message instead of sending a new one.
    Uses HTML parse mode (more forgiving than Markdown with special chars).
    """
    kb_markup = {"inline_keyboard": keyboard}
    # Escape HTML entities in text
    safe_text = (text
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;"))

    method = "editMessageText" if message_id else "sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": safe_text,
        "reply_markup": kb_markup,
    }
    if message_id:
        payload["message_id"] = message_id

    try:
        return _api_call(token, method, payload)
    except urllib.error.HTTPError as exc:
        # Read error body for debugging
        body = ""
        try:
            body = exc.read().decode("utf-8", errors="replace")
        except Exception:
            pass
        # "message is not modified" is fine — just means same content
        if "message is not modified" in body:
            return {}
        logger.error("telegram: send_message_kb %s failed: %s — %s", method, exc, body)
        return {}
    except Exception as exc:
        logger.error("telegram: send_message_kb failed: %s", exc)
        return {}


def _answer_callback(token: str, callback_id: str, text: str = "") -> None:
    """Answer a callback query (removes loading spinner on button)."""
    try:
        _api_call(token, "answerCallbackQuery", {
            "callback_query_id": callback_id,
            "text": text,
        })
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Anki remote control helpers (run on main thread)
# ---------------------------------------------------------------------------

def _run_on_main(fn):
    """Execute fn on Anki's main thread and return result. Blocks until done."""
    from threading import Event
    result = [None]
    done = Event()

    def _wrapper():
        try:
            result[0] = fn()
        except Exception as exc:
            logger.error("telegram: main thread error: %s", exc)
            result[0] = {"error": str(exc)}
        finally:
            done.set()

    try:
        from aqt import mw
        if mw:
            # Try taskman first (Anki ≥ 2.1.46)
            if hasattr(mw, 'taskman') and mw.taskman:
                mw.taskman.run_on_main(_wrapper)
            else:
                # Fallback: QTimer on main thread
                from PyQt6.QtCore import QTimer, QMetaObject, Qt, Q_ARG
                QMetaObject.invokeMethod(
                    mw, lambda: _wrapper(),
                    Qt.ConnectionType.QueuedConnection,
                )
            done.wait(timeout=10)
            if not done.is_set():
                logger.warning("telegram: _run_on_main timed out")
                return {"error": "timeout"}
            return result[0]
    except Exception as exc:
        logger.error("telegram: _run_on_main failed: %s", exc)
    return {"error": "Anki not available"}


def _get_current_card() -> dict:
    """Get current reviewer card (front/back/deck). Must call from main thread."""
    def _fn():
        try:
            from .tools import execute_tool
        except ImportError:
            from plusi.tools import execute_tool
        return execute_tool("aktuelle_karte", {})
    return _run_on_main(_fn)


def _get_deck_list() -> list:
    """Get list of decks."""
    def _fn():
        try:
            from .tools import execute_tool
        except ImportError:
            from plusi.tools import execute_tool
        result = execute_tool("deck_liste", {})
        return result.get("decks", [])
    return _run_on_main(_fn) or []


def _get_stats() -> dict:
    """Get today's learning stats."""
    def _fn():
        try:
            from .tools import execute_tool
        except ImportError:
            from plusi.tools import execute_tool
        return execute_tool("lernstatistik", {})
    return _run_on_main(_fn) or {}


def _open_deck(deck_id: int) -> dict:
    """Open a deck and start reviewing."""
    def _fn():
        try:
            from .tools import execute_tool
        except ImportError:
            from plusi.tools import execute_tool
        result = execute_tool("deck_oeffnen", {"deck_id": deck_id})
        # Notify frontend about deck change
        try:
            from aqt import mw
            if mw and mw.reviewer and mw.reviewer.card:
                _notify_frontend_state()
        except Exception:
            pass
        return result
    return _run_on_main(_fn) or {}


def _rate_card(ease: int) -> dict:
    """Rate the current card (1=Again, 2=Hard, 3=Good, 4=Easy).

    Calls Anki's reviewer + notifies both React frontends (ChatWidget + MainView).
    """
    def _fn():
        from aqt import mw
        if not mw or not mw.reviewer or not mw.reviewer.card:
            return {"error": "Keine Karte aktiv"}
        logger.info("telegram: rating card ease=%d", ease)
        mw.reviewer._answerCard(ease)
        # Notify React frontends
        _notify_frontend("rate", ease)
        return {"rated": ease}
    return _run_on_main(_fn) or {}


def _show_answer() -> dict:
    """Show the answer side of the current card."""
    def _fn():
        from aqt import mw
        if not mw or not mw.reviewer:
            return {"error": "Kein Reviewer aktiv"}
        logger.info("telegram: showing answer")
        mw.reviewer._showAnswer()
        _notify_frontend("answer", None)
        return {"shown": True}
    return _run_on_main(_fn) or {}


def _notify_frontend(action: str, data) -> None:
    """Notify both React frontends (ChatWidget + MainView) of reviewer changes."""
    try:
        from aqt import mw
        if not mw:
            return

        import json as _json

        # Build payload based on action
        if action == "answer":
            # Tell React to show answer
            if mw.reviewer and mw.reviewer.card:
                try:
                    from ..ui.setup import get_chatbot_widget
                except ImportError:
                    from ui.setup import get_chatbot_widget
                widget = get_chatbot_widget()
                if widget and hasattr(widget, '_send_card_data'):
                    widget._send_card_data(mw.reviewer.card, is_question=False)

        elif action == "rate":
            # Card was rated — next card will be sent via reviewer_did_show_question hook
            # But also poke MainView to update its state
            pass

        # Always: send reviewerState to MainView so tabs update
        try:
            from ..ui.main_view import get_main_view
        except ImportError:
            from ui.main_view import get_main_view
        view = get_main_view()
        if view and hasattr(view, 'web_view') and view.web_view:
            state = "review"
            if mw.state == "overview":
                state = "overview"
            elif mw.state == "deckBrowser":
                state = "deckBrowser"
            payload = _json.dumps({
                "type": "ankiStateChanged",
                "data": {"state": state}
            })
            view.web_view.page().runJavaScript(
                f"window.ankiReceive && window.ankiReceive({payload});"
            )

    except Exception as exc:
        logger.debug("telegram: _notify_frontend error: %s", exc)


def _navigate_desktop(target: str) -> None:
    """Navigate the desktop Anki UI to a target state/view.

    target: 'deckBrowser', 'overview', 'review', 'statistik'
    Sends app.stateChanged event which the React app already handles.
    """
    def _fn():
        from aqt import mw
        import json as _json
        if not mw:
            return

        # Navigate Anki's internal state (deckBrowser, overview, review)
        if target in ("deckBrowser", "overview", "review"):
            try:
                logger.info("telegram: moveToState(%s) — current state: %s", target, mw.state)
                mw.moveToState(target)
                logger.info("telegram: desktop navigated to %s — new state: %s", target, mw.state)
            except Exception as exc:
                logger.exception("telegram: moveToState(%s) FAILED: %s", target, exc)

        # Send stateChanged to React MainView (same event App.jsx already handles)
        try:
            from ..ui.main_view import get_main_view
        except ImportError:
            from ui.main_view import get_main_view

        view = get_main_view()
        if view and hasattr(view, 'web_view') and view.web_view:
            if target == "statistik":
                # Statistik is a React-only view, not an Anki state
                # Use the tab click handler directly
                view.web_view.page().runJavaScript(
                    "window.ankiReceive && window.ankiReceive("
                    "{type:'app.stateChanged', state:'statistik', data:{}});"
                )
            # deckBrowser, overview, review are handled by Anki's state_will_change hook
            # which already fires app.stateChanged → no extra JS needed

    _run_on_main(_fn)


def _send_typing(token: str, chat_id: int) -> None:
    """Send typing indicator."""
    try:
        _api_call(token, "sendChatAction", {
            "chat_id": chat_id,
            "action": "typing",
        })
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Polling thread
# ---------------------------------------------------------------------------


class TelegramBot:
    """Manages Telegram bot polling in a background thread."""

    def __init__(self):
        self._thread = None
        self._stop_event = threading.Event()
        self._caffeinate_proc = None
        self._running = False
        self._current_mood = None
        self._last_callback_time = 0

    @property
    def is_running(self) -> bool:
        return self._running

    def start(self) -> bool:
        """Start the polling thread. Returns True if started successfully."""
        if self._running:
            logger.info("telegram: bot already running")
            return True

        config = get_config()
        tg_config = config.get("telegram", {})
        token = tg_config.get("bot_token", "").strip()
        if not token:
            logger.warning("telegram: no bot_token configured")
            return False

        # Verify token works
        try:
            result = _api_call(token, "getMe")
            bot_name = result.get("result", {}).get("username", "unknown")
            logger.info("telegram: connected as @%s", bot_name)
        except Exception as exc:
            logger.error("telegram: token verification failed: %s", exc)
            return False

        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._poll_loop,
            args=(token,),
            daemon=True,
            name="PlusiTelegramBot",
        )
        self._thread.start()
        self._running = True

        # Register Mini App menu button if relay is configured
        try:
            relay_url = tg_config.get("relay_url", "").strip()
            if relay_url:
                app_url = relay_url.replace("/api/relay", "/remote")
                _api_call(token, "setChatMenuButton", {
                    "menu_button": {
                        "type": "web_app",
                        "text": "Remote",
                        "web_app": {"url": app_url},
                    }
                })
                logger.info("telegram: Mini App menu button set")
        except Exception as exc:
            logger.warning("telegram: setChatMenuButton failed: %s", exc)

        # Start caffeinate if configured
        if tg_config.get("keep_awake", False):
            self._start_caffeinate()

        logger.info("telegram: bot started")
        return True

    def stop(self) -> None:
        """Stop the polling thread and caffeinate."""
        if not self._running:
            return
        self._stop_event.set()
        self._running = False
        self._stop_caffeinate()
        logger.info("telegram: bot stopped")

    def _poll_loop(self, token: str) -> None:
        """Long-polling loop that runs in a background thread."""
        offset = 0

        while not self._stop_event.is_set():
            try:
                params = {
                    "timeout": POLL_TIMEOUT,
                    "allowed_updates": ["message", "callback_query"],
                }
                if offset:
                    params["offset"] = offset

                response = _api_call(token, "getUpdates", params)
                updates = response.get("result", [])

                for update in updates:
                    offset = update["update_id"] + 1
                    self._handle_update(token, update)

            except (urllib.error.URLError, TimeoutError) as exc:
                # Network errors — retry silently
                logger.debug("telegram: poll error (retrying): %s", exc)
                if not self._stop_event.is_set():
                    self._stop_event.wait(RETRY_DELAY)
            except Exception as exc:
                logger.error("telegram: unexpected poll error: %s", exc)
                if not self._stop_event.is_set():
                    self._stop_event.wait(RETRY_DELAY)

        logger.info("telegram: poll loop exited")

    def _handle_update(self, token: str, update: dict) -> None:
        """Process a single Telegram update."""
        # Handle callback queries (inline button presses)
        callback = update.get("callback_query")
        if callback:
            self._handle_callback(token, callback)
            return

        message = update.get("message")
        if not message:
            return

        text = message.get("text", "").strip()
        chat_id = message["chat"]["id"]
        user = message.get("from", {})
        user_name = user.get("first_name", "User")

        if not text:
            return

        # Handle commands
        if text.startswith("/"):
            self._handle_command(token, chat_id, text)
            return

        logger.info("telegram: message from %s: %s", user_name, text[:80])

        # Show typing indicator
        _send_typing(token, chat_id)

        # Run Plusi agent
        try:
            try:
                from .agent import run_plusi
            except ImportError:
                from plusi.agent import run_plusi

            result = run_plusi(text)
            response_text = result.get("text", "")
            mood = result.get("mood", "neutral")

            if not response_text:
                response_text = f"~{mood}"

            # Send mood avatar with response if mood changed
            if mood != self._current_mood:
                if _send_mood_photo(token, chat_id, mood, response_text):
                    self._current_mood = mood
                    # If text was too long for caption, send remainder as text
                    if len(response_text) > 1024:
                        _send_message(token, chat_id, response_text)
                else:
                    _send_message(token, chat_id, response_text)
            else:
                _send_message(token, chat_id, response_text)

            logger.info("telegram: replied (mood=%s, len=%d)", mood, len(response_text))

        except Exception as exc:
            logger.exception("telegram: agent error: %s", exc)
            _send_message(token, chat_id, "Fehler bei der Verarbeitung. Versuch's nochmal.")

    def _handle_command(self, token: str, chat_id: int, text: str) -> None:
        """Handle bot commands."""
        cmd = text.split()[0].lower().replace("@ankiplusbot", "")

        if cmd == "/start":
            _send_message(token, chat_id,
                "Hey. Ich bin Plusi.\n"
                "Schreib mir einfach — ich antworte.\n\n"
                "/remote — Anki Fernbedienung\n"
                "/decks — Deck-Liste\n"
                "/stats — Tagesstatistik\n"
                "/status — Was ich gerade sehe\n"
                "/mood — Wie ich drauf bin"
            )
        elif cmd == "/remote":
            config = get_config()
            tg_config = config.get("telegram", {})
            relay_url = tg_config.get("relay_url", "").strip()
            if relay_url:
                app_url = relay_url.replace("/api/relay", "/remote")
                _send_message_kb(token, chat_id,
                    "AnkiPlus Remote",
                    [[{"text": "Remote öffnen",
                       "web_app": {"url": app_url}}]])
            else:
                self._send_remote(token, chat_id)
        elif cmd == "/decks":
            self._send_deck_list(token, chat_id)
        elif cmd == "/stats":
            stats = _get_stats()
            today = stats.get("today", {})
            reviewed = today.get("reviewed", 0)
            correct = today.get("correct", 0)
            pct = round(correct / reviewed * 100) if reviewed > 0 else 0
            _send_message(token, chat_id,
                f"Heute: {reviewed} Karten, {correct} richtig ({pct}%)")
        elif cmd == "/status":
            try:
                try:
                    from .tools import execute_tool
                except ImportError:
                    from plusi.tools import execute_tool
                status = execute_tool("app_status", {})
                _send_message(token, chat_id, json.dumps(status, indent=2, ensure_ascii=False))
            except Exception as exc:
                _send_message(token, chat_id, f"Status nicht verfügbar: {exc}")
        elif cmd == "/mood":
            try:
                try:
                    from .memory import PlusiMemory
                except ImportError:
                    from plusi.memory import PlusiMemory
                mem = PlusiMemory()
                last = mem.load_history(limit=1)
                if last:
                    mood = last[0].get("mood", "neutral")
                    _send_message(token, chat_id, f"~{mood}")
                else:
                    _send_message(token, chat_id, "~neutral")
            except Exception:
                _send_message(token, chat_id, "~neutral")
        else:
            _send_message(token, chat_id, "Kenn ich nicht. Schreib einfach normal.")

    # ── Remote control ─────────────────────────────────────────────────────
    # Mirrors the AnkiPlus UI: 3 tabs (Stapel/Session/Statistik),
    # always 2 actions at bottom (Space = primary, Enter = secondary).

    def _send_remote(self, token: str, chat_id: int, message_id: int = None) -> None:
        """Send the remote control view based on current Anki state."""
        # Detect Anki state
        state = self._get_anki_state()

        if state == "review_question":
            self._send_review_question(token, chat_id, message_id)
        elif state == "review_answer":
            self._send_review_answer(token, chat_id, message_id)
        elif state == "overview":
            self._send_overview(token, chat_id, message_id)
        else:
            # deckBrowser or unknown
            self._send_deck_browser(token, chat_id, message_id)

    def _get_anki_state(self) -> str:
        """Get current Anki state: deckBrowser, overview, review_question, review_answer."""
        def _fn():
            from aqt import mw
            if not mw:
                return "deckBrowser"
            state = mw.state
            if state == "review" and mw.reviewer:
                if mw.reviewer.state == "answer":
                    return "review_answer"
                return "review_question"
            if state == "overview":
                return "overview"
            return "deckBrowser"
        return _run_on_main(_fn) or "deckBrowser"

    def _tab_row(self, active: str) -> list:
        """Build the tab navigation row. Matches TopBar: Stapel | Session | Statistik."""
        def _tab(label, tab_id):
            marker = "• " if active == tab_id else ""
            return {"text": f"{marker}{label}", "callback_data": f"rc:tab:{tab_id}"}
        return [_tab("Stapel", "stapel"), _tab("Session", "session"), _tab("Statistik", "statistik")]

    # ── Tab: Stapel (Deck Browser) ──

    def _send_deck_browser(self, token: str, chat_id: int, msg_id: int = None) -> None:
        """Stapel tab — deck list."""
        decks = _get_deck_list()
        top_decks = [d for d in decks if "::" not in d["name"]][:10]
        if not top_decks:
            top_decks = decks[:10]

        stats = _get_stats()
        today = stats.get("today", {})
        reviewed = today.get("reviewed", 0)
        correct = today.get("correct", 0)

        text = (
            "Stapel\n"
            "━━━━━━━━━━━━━━━\n"
            f"Heute: {reviewed} Karten, {correct} richtig\n"
            "━━━━━━━━━━━━━━━\n"
            "Wähle ein Deck:"
        )

        keyboard = [self._tab_row("stapel")]
        for d in top_decks:
            # Show short name (last segment after ::)
            short_name = d["name"].split("::")[-1] if "::" in d["name"] else d["name"]
            keyboard.append([
                {"text": short_name, "callback_data": f"rc:open:{d['id']}"}
            ])

        result = _send_message_kb(token, chat_id, text, keyboard, msg_id)
        if not msg_id and result:
            self._remote_msg_id = result.get("result", {}).get("message_id")

    # ── Tab: Session (Overview / Review) ──

    def _send_overview(self, token: str, chat_id: int, msg_id: int = None) -> None:
        """Session tab — overview before review starts."""
        def _fn():
            from aqt import mw
            if not mw or not mw.col:
                return {"name": "?", "new": 0, "learn": 0, "review": 0}
            deck = mw.col.decks.current()
            counts = mw.col.sched.counts()
            return {
                "name": deck.get("name", "?"),
                "new": counts[0], "learn": counts[1], "review": counts[2],
            }
        info = _run_on_main(_fn) or {}

        text = (
            f"Session — {info.get('name', '?')}\n"
            f"━━━━━━━━━━━━━━━\n"
            f"Neu: {info.get('new', 0)}  ·  "
            f"Lernen: {info.get('learn', 0)}  ·  "
            f"Wiederholen: {info.get('review', 0)}"
        )

        keyboard = [
            self._tab_row("session"),
            # 2 actions: Space = Lernen starten, Enter = (none)
            [{"text": "▶  Lernen starten  [Space]", "callback_data": "rc:study"}],
        ]

        _send_message_kb(token, chat_id, text, keyboard, msg_id)

    @staticmethod
    def _short_deck(name: str) -> str:
        """Shorten deck name: 'A::B::C' → 'C'."""
        return name.split("::")[-1] if "::" in name else name

    def _send_review_question(self, token: str, chat_id: int, msg_id: int = None) -> None:
        """Session tab — card question side."""
        card = _get_current_card()
        if "error" in card:
            self._send_deck_browser(token, chat_id, msg_id)
            return

        front = card.get("front", "—")[:400]
        deck = self._short_deck(card.get("deck", "?"))

        text = (
            f"Session  {deck}\n"
            "━━━━━━━━━━━━━━━\n"
            f"{front}\n"
            "━━━━━━━━━━━━━━━"
        )

        keyboard = [
            self._tab_row("session"),
            # 2 actions: Space = Antwort zeigen, Enter = (context action)
            [
                {"text": "Antwort zeigen  [Space]", "callback_data": "rc:flip"},
                {"text": "← →", "callback_data": "rc:skip"},
            ],
        ]

        _send_message_kb(token, chat_id, text, keyboard, msg_id)

    def _send_review_answer(self, token: str, chat_id: int, msg_id: int = None) -> None:
        """Session tab — card answer side with rating buttons."""
        card = _get_current_card()
        if "error" in card:
            self._send_deck_browser(token, chat_id, msg_id)
            return

        front = card.get("front", "—")[:200]
        back = card.get("back", "—")[:300]
        deck = self._short_deck(card.get("deck", "?"))

        text = (
            f"Session  {deck}\n"
            "━━━━━━━━━━━━━━━\n"
            f"{front}\n"
            "───────────────\n"
            f"{back}\n"
            "━━━━━━━━━━━━━━━"
        )

        keyboard = [
            self._tab_row("session"),
            # Rating = number keys 1-4
            [
                {"text": "1 Nochmal", "callback_data": "rc:rate:1"},
                {"text": "2 Schwer", "callback_data": "rc:rate:2"},
                {"text": "3 Gut", "callback_data": "rc:rate:3"},
                {"text": "4 Leicht", "callback_data": "rc:rate:4"},
            ],
            # 2 actions: Space = Weiter (Good), Enter = (context)
            [
                {"text": "Weiter  [Space]", "callback_data": "rc:rate:3"},
            ],
        ]

        _send_message_kb(token, chat_id, text, keyboard, msg_id)

    # ── Tab: Statistik ──

    def _send_statistik(self, token: str, chat_id: int, msg_id: int = None) -> None:
        """Statistik tab — today's stats."""
        stats = _get_stats()
        today = stats.get("today", {})
        reviewed = today.get("reviewed", 0)
        correct = today.get("correct", 0)
        pct = round(correct / reviewed * 100) if reviewed > 0 else 0

        text = (
            f"Statistik\n"
            f"━━━━━━━━━━━━━━━\n"
            f"Heute gelernt: {reviewed}\n"
            f"Richtig: {correct} ({pct}%)\n"
            f"Falsch: {reviewed - correct}\n"
            f"━━━━━━━━━━━━━━━"
        )

        keyboard = [
            self._tab_row("statistik"),
        ]

        _send_message_kb(token, chat_id, text, keyboard, msg_id)

    # ── Callback handler ──

    def _handle_callback(self, token: str, callback: dict) -> None:
        """Handle inline keyboard button presses."""
        cb_id = callback.get("id", "")
        data = callback.get("data", "")
        message = callback.get("message", {})
        chat_id = message.get("chat", {}).get("id")
        msg_id = message.get("message_id")

        if not chat_id or not data.startswith("rc:"):
            _answer_callback(token, cb_id)
            return

        # Debounce: ignore rapid-fire button presses (< 0.8s apart)
        now = time.time()
        if now - self._last_callback_time < 0.8:
            _answer_callback(token, cb_id)
            return
        self._last_callback_time = now

        action = data[3:]  # Strip "rc:" prefix

        # ── Tab navigation (force target view on BOTH Telegram + Desktop) ──
        if action == "tab:stapel":
            _answer_callback(token, cb_id)
            _navigate_desktop("deckBrowser")
            time.sleep(0.3)
            self._send_deck_browser(token, chat_id, msg_id)
        elif action == "tab:session":
            _answer_callback(token, cb_id)
            state = self._get_anki_state()
            if state.startswith("review"):
                # Already in review — just show current card
                if state == "review_answer":
                    self._send_review_answer(token, chat_id, msg_id)
                else:
                    self._send_review_question(token, chat_id, msg_id)
            else:
                # Navigate desktop to overview
                _navigate_desktop("overview")
                time.sleep(0.3)
                new_state = self._get_anki_state()
                if new_state == "overview":
                    self._send_overview(token, chat_id, msg_id)
                else:
                    keyboard = [
                        self._tab_row("session"),
                        [{"text": "Deck wählen →", "callback_data": "rc:tab:stapel"}],
                    ]
                    _send_message_kb(token, chat_id,
                        "Session\n━━━━━━━━━━━━━━━\nKein Deck offen.\nWähle erst ein Deck im Stapel-Tab.",
                        keyboard, msg_id)
        elif action == "tab:statistik":
            _answer_callback(token, cb_id)
            _navigate_desktop("statistik")
            self._send_statistik(token, chat_id, msg_id)

        # ── Review actions ──
        elif action == "flip":
            _answer_callback(token, cb_id, "Antwort")
            _show_answer()
            time.sleep(0.3)
            self._send_review_answer(token, chat_id, msg_id)

        elif action.startswith("rate:"):
            ease = int(action.split(":")[1])
            labels = {1: "Nochmal", 2: "Schwer", 3: "Gut", 4: "Leicht"}
            _answer_callback(token, cb_id, labels.get(ease, "?"))
            _rate_card(ease)
            time.sleep(0.5)
            self._send_remote(token, chat_id, msg_id)

        elif action == "skip":
            _answer_callback(token, cb_id, "→")
            _rate_card(3)  # Good = skip forward
            time.sleep(0.5)
            self._send_remote(token, chat_id, msg_id)

        # ── Deck actions ──
        elif action.startswith("open:"):
            deck_id = int(action.split(":")[1])
            _answer_callback(token, cb_id, "Deck geöffnet")
            _open_deck(deck_id)
            time.sleep(0.5)
            self._send_remote(token, chat_id, msg_id)

        elif action == "study":
            _answer_callback(token, cb_id, "Los geht's")
            def _fn():
                from aqt import mw
                if mw:
                    mw.moveToState("review")
            _run_on_main(_fn)
            time.sleep(0.5)
            self._send_remote(token, chat_id, msg_id)

        else:
            _answer_callback(token, cb_id)

    # ── caffeinate (prevent sleep) ──────────────────────────────────────────

    def _start_caffeinate(self) -> None:
        """Prevent macOS from sleeping (display + idle)."""
        if self._caffeinate_proc is not None:
            return
        try:
            self._caffeinate_proc = subprocess.Popen(
                ["caffeinate", "-di"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            logger.info("telegram: caffeinate started (pid=%d)", self._caffeinate_proc.pid)
        except Exception as exc:
            logger.warning("telegram: caffeinate failed: %s", exc)

    def _stop_caffeinate(self) -> None:
        """Stop caffeinate process."""
        if self._caffeinate_proc is not None:
            try:
                self._caffeinate_proc.terminate()
                self._caffeinate_proc.wait(timeout=5)
                logger.info("telegram: caffeinate stopped")
            except Exception as exc:
                logger.warning("telegram: caffeinate stop failed: %s", exc)
            finally:
                self._caffeinate_proc = None


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_bot = None


def get_bot() -> TelegramBot:
    """Get or create the singleton TelegramBot instance."""
    global _bot
    if _bot is None:
        _bot = TelegramBot()
    return _bot


def start_bot() -> bool:
    """Start the Telegram bot if a token is configured."""
    config = get_config()
    tg_config = config.get("telegram", {})
    token = tg_config.get("bot_token", "").strip()
    if not token:
        logger.debug("telegram: no bot_token")
        return False
    return get_bot().start()


def stop_bot() -> None:
    """Stop the Telegram bot."""
    if _bot is not None:
        _bot.stop()
