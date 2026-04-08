"""relay/actions.py — Card operations for PWA remote control.

Pure Anki interaction logic with zero transport dependency.
Every function that touches Anki state runs on the main thread.
"""

import threading

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_MAIN_THREAD_TIMEOUT = 10  # seconds

# Known PWA action types and their expected param keys
_KNOWN_ACTIONS = {
    "flip": [],
    "rate": ["ease"],
    "mc_select": ["option_id"],
    "open_deck": ["deck_id"],
    "set_mode": ["mode"],
    "get_decks": [],
    "switch_tab": ["tab"],
    "chat_message": ["text"],
    "request_mc": [],
}

# ---------------------------------------------------------------------------
# Main-thread helper
# ---------------------------------------------------------------------------


def _is_main_thread():
    """Check if current thread is the Qt main thread."""
    return threading.current_thread() is threading.main_thread()


def _run_on_main(fn, timeout=_MAIN_THREAD_TIMEOUT):
    """Execute *fn* on Anki's main thread, blocking until done.

    Uses ``mw.taskman.run_on_main()`` (Anki >= 2.1.46) with a fallback to
    ``QMetaObject.invokeMethod`` for older versions.

    Returns whatever *fn* returns, or ``{"error": ...}`` on failure/timeout.
    """
    result = [None]
    done = threading.Event()

    def _wrapper():
        try:
            result[0] = fn()
        except Exception as exc:
            logger.error("relay.actions: main-thread error: %s", exc)
            result[0] = {"error": str(exc)}
        finally:
            done.set()

    try:
        from aqt import mw
        if not mw:
            return {"error": "Anki not available"}

        # Prefer taskman (Anki >= 2.1.46)
        if hasattr(mw, "taskman") and mw.taskman:
            mw.taskman.run_on_main(_wrapper)
        else:
            # Fallback: post via QMetaObject
            from PyQt6.QtCore import QMetaObject, Qt
            QMetaObject.invokeMethod(
                mw, lambda: _wrapper(),
                Qt.ConnectionType.QueuedConnection,
            )

        done.wait(timeout=timeout)
        if not done.is_set():
            logger.warning("relay.actions: _run_on_main timed out after %ds", timeout)
            return {"error": "timeout"}
        return result[0]
    except Exception as exc:
        logger.error("relay.actions: _run_on_main failed: %s", exc)
        return {"error": "Anki not available"}


# ---------------------------------------------------------------------------
# Message builders / parsers
# ---------------------------------------------------------------------------


def build_card_state(phase, front_html, back_html, deck, current, total,
                     card_id, mc_options=None):
    """Build a ``card_state`` dict message for the PWA.

    Parameters
    ----------
    phase : str
        ``"question"`` or ``"answer"``.
    front_html, back_html : str
        Card HTML content.
    deck : str
        Current deck name.
    current, total : int
        Review progress (cards reviewed today / total due).
    card_id : int
        Anki card ID.
    mc_options : list[dict] | None
        Optional multiple-choice options (``[{"id": ..., "text": ...}]``).
    """
    msg = {
        "type": "card_state",
        "phase": phase,
        "front_html": front_html,
        "back_html": back_html,
        "deck": deck,
        "progress": {"current": current, "total": total},
        "card_id": card_id,
    }
    if mc_options:
        msg["mc_options"] = mc_options
    return msg


def parse_action(msg):
    """Parse an incoming action message from the PWA.

    Returns ``(action_type, params)`` tuple, or ``None`` if the message
    type is unknown or missing.
    """
    msg_type = msg.get("type")
    if not msg_type:
        return None

    if msg_type not in _KNOWN_ACTIONS:
        return None

    params = {k: msg[k] for k in _KNOWN_ACTIONS[msg_type] if k in msg}
    return (msg_type, params)


# ---------------------------------------------------------------------------
# Card-state from live reviewer
# ---------------------------------------------------------------------------


def build_card_state_from_reviewer(phase="question"):
    """Build a ``card_state`` dict from the current Anki reviewer.

    MUST be called on the main thread (or via ``_run_on_main``).
    Returns the dict, or ``None`` if no card is active.
    """
    def _fn():
        from aqt import mw
        if not mw or not mw.reviewer or not mw.reviewer.card:
            return None

        card = mw.reviewer.card
        front_html = card.question()
        back_html = card.answer()

        # Deck name
        deck_name = "Unknown"
        try:
            deck_obj = mw.col.decks.get(card.did)
            if deck_obj:
                deck_name = deck_obj.get("name", "Unknown")
        except Exception:
            pass

        # Progress: reviewed today / total due
        current = 0
        total = 0
        try:
            counts = mw.col.sched.counts()
            total = sum(counts)
            # Rough "reviewed today" count
            today = mw.col.db.scalar(
                "SELECT count() FROM revlog WHERE id > ?",
                (mw.col.sched.day_cutoff - 86400) * 1000,
            )
            current = today or 0
        except Exception:
            pass

        return build_card_state(
            phase=phase,
            front_html=front_html,
            back_html=back_html,
            deck=deck_name,
            current=current,
            total=total,
            card_id=card.id,
        )

    if _is_main_thread():
        return _fn()
    return _run_on_main(_fn)


# ---------------------------------------------------------------------------
# Action handlers
# ---------------------------------------------------------------------------


def flip(client):
    """Show answer and send ``card_state`` with ``phase="answer"`` to PWA.

    Runs the actual answer reveal on the main thread, then sends the
    updated state to the connected PWA client.
    """
    def _fn():
        from aqt import mw
        if not mw or not mw.reviewer:
            return {"error": "No reviewer active"}
        logger.info("relay.actions: flip — showing answer")
        mw.reviewer._showAnswer()
        return True

    result = _run_on_main(_fn)
    if result is True:
        state = build_card_state_from_reviewer(phase="answer")
        if state and client:
            client.send(state)
    return result


def rate(client, ease):
    """Rate the current card.

    Does NOT send state — the next card triggers a hook in ``state.py``
    which broadcasts the new card_state automatically.

    Parameters
    ----------
    ease : int
        Rating: 1=Again, 2=Hard, 3=Good, 4=Easy.
    """
    def _fn():
        from aqt import mw
        if not mw or not mw.reviewer or not mw.reviewer.card:
            return {"error": "No card active"}
        logger.info("relay.actions: rate ease=%d", ease)
        mw.reviewer._answerCard(ease)
        return {"rated": ease}

    return _run_on_main(_fn)


def open_deck(client, deck_id):
    """Open a deck and start review.

    Selects the deck, resets the main window, and transitions to review
    state. The first card will trigger the reviewer hook which sends
    ``card_state`` to the PWA.
    """
    def _fn():
        from aqt import mw
        if not mw or not mw.col:
            return {"error": "Collection not available"}
        logger.info("relay.actions: open_deck id=%s", deck_id)
        mw.col.decks.select(deck_id)
        mw.reset()
        mw.moveToState("review")
        return {"opened": deck_id}

    return _run_on_main(_fn)


def switch_tab(client, tab):
    """Switch the desktop Anki view based on tab name.

    Maps remote tabs to Anki states:
    - lernen → review (or overview if not in review)
    - finden → deckBrowser
    - planen → deckBrowser (statistics view)
    """
    TAB_MAP = {
        "lernen": "review",
        "finden": "deckBrowser",
        "planen": "deckBrowser",
    }
    target = TAB_MAP.get(tab, "deckBrowser")

    def _fn():
        from aqt import mw
        if not mw:
            return {"error": "Anki not available"}
        logger.info("relay.actions: switch_tab tab=%s → state=%s", tab, target)

        # Also send to React frontend so it switches views
        try:
            from .state import AnkiStateReporter
            view = None
            try:
                from ..ui.main_view import get_main_view
            except ImportError:
                from ui.main_view import get_main_view
            view = get_main_view()
            if view and hasattr(view, '_chatbot') and view._chatbot:
                wv = view._chatbot.web_view
                if wv:
                    import json
                    # Map tab to the React app's tab system
                    tab_map = {"lernen": "session", "finden": "stapel", "planen": "statistik"}
                    react_tab = tab_map.get(tab, "session")
                    payload = json.dumps({"type": "remoteTabSwitch", "data": {"tab": react_tab}})
                    wv.page().runJavaScript(
                        f"window.ankiReceive && window.ankiReceive({payload});"
                    )
        except Exception as exc:
            logger.debug("relay.actions: switch_tab desktop notify error: %s", exc)

        mw.moveToState(target)
        return {"switched": tab}

    return _run_on_main(_fn)


def _forward_chat_to_desktop(client, text):
    """Forward a chat message from PWA to the desktop React app."""
    if not text:
        return None

    def _fn():
        try:
            try:
                from ..ui.main_view import get_main_view
            except ImportError:
                from ui.main_view import get_main_view
            view = get_main_view()
            if view and hasattr(view, '_chatbot') and view._chatbot:
                wv = view._chatbot.web_view
                if wv:
                    import json
                    payload = json.dumps({"type": "remoteChatMessage", "data": {"text": text}})
                    wv.page().runJavaScript(
                        f"window.ankiReceive && window.ankiReceive({payload});"
                    )
                    logger.info("relay.actions: chat forwarded to desktop (%d chars)", len(text))
        except Exception as exc:
            logger.error("relay.actions: _forward_chat error: %s", exc)

    return _run_on_main(_fn)


def get_decks(client):
    """Get deck list with due counts and send to PWA.

    Traverses the scheduler's deck-due tree, flattens it, and sends
    a ``deck_list`` message to the client.
    """
    def _fn():
        from aqt import mw
        if not mw or not mw.col:
            return {"error": "Collection not available"}

        tree = mw.col.sched.deck_due_tree()
        decks = []
        for node in _flatten_tree(tree):
            deck_id = getattr(node, "deck_id", None)
            if not deck_id:
                continue
            decks.append({
                "id": deck_id,
                "name": getattr(node, "name", ""),
                "new": getattr(node, "new_count", 0),
                "learning": getattr(node, "learn_count", 0),
                "review": getattr(node, "review_count", 0),
            })
        return decks

    deck_list = _run_on_main(_fn)

    if isinstance(deck_list, list) and client:
        client.send({"type": "deck_list", "decks": deck_list})
    return deck_list


# ---------------------------------------------------------------------------
# Action router
# ---------------------------------------------------------------------------


def handle_action(client, action_type, params):
    """Route an incoming PWA action to the correct handler.

    Parameters
    ----------
    client : object
        RelayClient (or any object with ``.send(msg)`` and ``.mode``).
    action_type : str
        One of the known action types (flip, rate, etc.).
    params : dict
        Action parameters.
    """
    logger.info("relay.actions: handle %s %s", action_type, params)

    if action_type == "flip":
        return flip(client)

    if action_type == "rate":
        ease = params.get("ease", 3)
        return rate(client, ease)

    if action_type == "mc_select":
        # MC select is treated like a flip (show answer)
        return flip(client)

    if action_type == "open_deck":
        deck_id = params.get("deck_id")
        if deck_id is not None:
            return open_deck(client, deck_id)
        logger.warning("relay.actions: open_deck missing deck_id")
        return None

    if action_type == "set_mode":
        mode = params.get("mode", "duo")
        if client:
            client.mode = mode
            logger.info("relay.actions: mode set to %s", mode)
        return {"mode": mode}

    if action_type == "get_decks":
        return get_decks(client)

    if action_type == "switch_tab":
        tab = params.get("tab", "lernen")
        return switch_tab(client, tab)

    if action_type == "chat_message":
        text = params.get("text", "")
        logger.info("relay.actions: chat_message len=%d", len(text))
        # Forward to desktop as a sendMessage action
        return _forward_chat_to_desktop(client, text)

    if action_type == "request_mc":
        logger.info("relay.actions: request_mc — not yet implemented")
        return None

    logger.warning("relay.actions: unknown action %s", action_type)
    return None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _flatten_tree(node):
    """Recursively flatten a ``DeckTreeNode`` into a flat list.

    Works with Anki's scheduler ``deck_due_tree()`` return value, which
    is a tree of nodes with a ``children`` attribute.
    """
    nodes = [node]
    for child in getattr(node, "children", []):
        nodes.extend(_flatten_tree(child))
    return nodes
