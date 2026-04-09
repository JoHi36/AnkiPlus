"""
plusi/tools.py — Tool implementations for 20 Plusi tools.

Architecture:
- Module-level globals: _memory, _embed_fn, _anki_bridge, _event_bus — set via init_tools()
- init_tools(memory, embed_fn, anki_bridge=None, event_bus=None) — injects dependencies
- execute_tool(name, args) — looks up TOOL_MAP, calls the function, catches exceptions
- TOOL_MAP — dict mapping tool name string to function

All tools that access Anki APIs wrap calls in try/except and return error dicts on failure.
Perception tools use run_on_main_thread() for thread-safe mw.col access where needed.
"""

from __future__ import annotations

import struct
from datetime import datetime
from typing import Any, Optional

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Module-level dependency slots (injected via init_tools)
# ---------------------------------------------------------------------------

_memory = None          # PlusiMemory instance
_embed_fn = None        # Callable(text: str) -> bytes
_anki_bridge = None     # Optional bridge object (unused currently)
_event_bus = None       # EventBus instance


def init_tools(memory, embed_fn, anki_bridge=None, event_bus=None) -> None:
    """Inject dependencies into the tools module.

    Parameters
    ----------
    memory:       PlusiMemory instance for all persistence operations.
    embed_fn:     Callable that accepts a text string and returns embedding bytes.
                  Typically wraps EmbeddingManager.embed_texts().
    anki_bridge:  Optional bridge object (reserved for future use).
    event_bus:    EventBus instance for subscription management.
    """
    global _memory, _embed_fn, _anki_bridge, _event_bus
    _memory = memory
    _embed_fn = embed_fn
    _anki_bridge = anki_bridge
    _event_bus = event_bus
    logger.info("plusi/tools: init_tools() called — dependencies injected")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _pack_embedding(floats: list) -> bytes:
    """Pack a list of floats into little-endian float32 bytes."""
    return struct.pack(f"<{len(floats)}f", *floats)


def _check_memory():
    """Raise RuntimeError if memory not initialised."""
    if _memory is None:
        raise RuntimeError("PlusiMemory not initialised — call init_tools() first")


def _check_embed():
    """Raise RuntimeError if embed_fn not initialised."""
    if _embed_fn is None:
        raise RuntimeError("embed_fn not initialised — call init_tools() first")


# ---------------------------------------------------------------------------
# Memory tools
# ---------------------------------------------------------------------------

def _merk_dir(text: str) -> dict:
    """Store a memory.

    Parameters
    ----------
    text: Plain-text content to remember.

    Returns
    -------
    {"stored": True, "id": <memory_id>}
    """
    _check_memory()
    _check_embed()
    floats = _embed_fn(text)
    if floats is None:
        return {"error": "Embedding failed — no vector returned"}
    embedding = _pack_embedding(floats) if not isinstance(floats, (bytes, bytearray)) else floats
    mid = _memory.store(text, embedding)
    logger.debug("plusi/tools: _merk_dir stored id=%s", mid)
    return {"stored": True, "id": mid}


def _erinnere_dich(query: str, limit: int = 10) -> dict:
    """Recall memories similar to query.

    Parameters
    ----------
    query: Text to search for in memory.
    limit: Maximum number of results.

    Returns
    -------
    {"memories": [...]} where each item has id, text, created_at, mood, relevance.
    """
    _check_memory()
    _check_embed()
    floats = _embed_fn(query)
    if floats is None:
        return {"error": "Embedding failed — no vector returned", "memories": []}
    embedding = _pack_embedding(floats) if not isinstance(floats, (bytes, bytearray)) else floats
    results = _memory.recall(embedding, limit=int(limit))
    logger.debug("plusi/tools: _erinnere_dich recalled %d results", len(results))
    return {"memories": results}


def _vergiss(memory_id: int) -> dict:
    """Forget a specific memory by id.

    Parameters
    ----------
    memory_id: The integer primary key of the memory to delete.

    Returns
    -------
    {"forgotten": True}
    """
    _check_memory()
    _memory.forget(int(memory_id))
    logger.debug("plusi/tools: _vergiss memory_id=%s", memory_id)
    return {"forgotten": True}


def _tagebuch(text: str, mood: str = "neutral") -> dict:
    """Write an entry to the Plusi diary.

    Parameters
    ----------
    text: The diary entry text.
    mood: Plusi's mood at the time of writing (default: "neutral").

    Returns
    -------
    {"written": True}
    """
    _check_memory()
    _memory.save_diary(text, mood=mood)
    logger.debug("plusi/tools: _tagebuch entry written mood=%s", mood)
    return {"written": True}


# ---------------------------------------------------------------------------
# Perception tools
# ---------------------------------------------------------------------------

def _app_status() -> dict:
    """Return the current app state and local time.

    Returns
    -------
    {"state": "<mw.state>", "time": "HH:MM"} or {"state": "unknown", "error": "..."}
    """
    try:
        from aqt import mw  # type: ignore
        state = getattr(mw, "state", "unknown") if mw is not None else "unknown"
        now = datetime.now().strftime("%H:%M")
        return {"state": state, "time": now}
    except Exception as exc:
        logger.warning("plusi/tools: _app_status error: %s", exc)
        return {"state": "unknown", "error": str(exc)}


def _aktuelle_karte() -> dict:
    """Return details about the card currently shown in the reviewer.

    Returns
    -------
    {"card_id": int, "front": str, "back": str, "deck": str, "reviews": int}
    or {"error": "User ist gerade nicht beim Lernen"}
    """
    try:
        from aqt import mw  # type: ignore
        if mw is None or mw.col is None:
            return {"error": "User ist gerade nicht beim Lernen"}
        reviewer = getattr(mw, "reviewer", None)
        if reviewer is None:
            return {"error": "User ist gerade nicht beim Lernen"}
        card = getattr(reviewer, "card", None)
        if card is None:
            return {"error": "User ist gerade nicht beim Lernen"}

        try:
            from ..utils.anki import strip_html_and_cloze  # type: ignore
        except ImportError:
            from utils.anki import strip_html_and_cloze  # type: ignore

        note = card.note()
        fields = note.fields
        front = strip_html_and_cloze(fields[0]) if fields else ""
        back = strip_html_and_cloze(fields[1]) if len(fields) > 1 else ""
        deck_name = mw.col.decks.name(card.did)
        reviews = card.reps

        return {
            "card_id": card.id,
            "front": front[:500],
            "back": back[:500],
            "deck": deck_name,
            "reviews": reviews,
        }
    except Exception as exc:
        logger.warning("plusi/tools: _aktuelle_karte error: %s", exc)
        return {"error": "User ist gerade nicht beim Lernen"}


def _lernstatistik() -> dict:
    """Return today's learning statistics from the revlog.

    Returns
    -------
    {"today": {"reviewed": int, "correct": int}}
    """
    try:
        from aqt import mw  # type: ignore
        if mw is None or mw.col is None:
            return {"today": {"reviewed": 0, "correct": 0}}

        # Day cutoff in epoch milliseconds (Anki stores timestamps in seconds for revlog)
        today_start = mw.col.sched.dayCutoff - 86400
        rows = mw.col.db.all(
            "SELECT ease FROM revlog WHERE id/1000 >= ?",
            today_start,
        )
        reviewed = len(rows)
        correct = sum(1 for r in rows if r[0] > 1)
        return {"today": {"reviewed": reviewed, "correct": correct}}
    except Exception as exc:
        logger.warning("plusi/tools: _lernstatistik error: %s", exc)
        return {"today": {"reviewed": 0, "correct": 0}, "error": str(exc)}


# ---------------------------------------------------------------------------
# Card search tools
# ---------------------------------------------------------------------------

def _suche_karten(query: str, top_k: int = 10) -> dict:
    """Semantic card search — composed from pipeline blocks.

    Plusi's lightweight search tool: embed the query, run cosine top-k,
    fetch and clean the results. No reranker, no web fallback, no KG —
    Plusi's LLM expects results within a single tool-call latency budget.

    Parameters
    ----------
    query: Natural-language search query.
    top_k: Maximum number of results to return.

    Returns
    -------
    {"cards": [{"card_id": int, "text": str, "deck": str, "score": float}, ...]}
    """
    try:
        try:
            from ..ai.pipeline_blocks import embed_search, fetch_card_snippets
        except ImportError:
            from ai.pipeline_blocks import embed_search, fetch_card_snippets

        hits = embed_search(query, top_k=int(top_k))
        if not hits:
            return {"cards": []}

        score_by_id = {cid: score for cid, score in hits}
        snippets = fetch_card_snippets([cid for cid, _ in hits], max_field_len=300)

        results = [
            {
                "card_id": s["cardId"],
                "text": s["question"],
                "deck": s["deckName"],
                "score": round(score_by_id.get(s["cardId"], 0.0), 4),
            }
            for s in snippets
        ]
        logger.debug("plusi/tools: _suche_karten returned %d results", len(results))
        return {"cards": results}
    except Exception as exc:
        logger.warning("plusi/tools: _suche_karten error: %s", exc)
        return {"cards": [], "error": str(exc)}


def _karte_lesen(card_id: int) -> dict:
    """Read full details of a single card.

    Parameters
    ----------
    card_id: Anki card integer id.

    Returns
    -------
    {"card_id": int, "front": str, "back": str, "deck": str, "tags": list, "reviews": int}
    """
    try:
        from aqt import mw  # type: ignore
        if mw is None or mw.col is None:
            return {"error": "Anki collection not available"}

        try:
            from ..utils.anki import strip_html_and_cloze  # type: ignore
        except ImportError:
            from utils.anki import strip_html_and_cloze  # type: ignore

        card = mw.col.get_card(int(card_id))
        note = card.note()
        fields = note.fields
        front = strip_html_and_cloze(fields[0]) if fields else ""
        back = strip_html_and_cloze(fields[1]) if len(fields) > 1 else ""
        deck_name = mw.col.decks.name(card.did)
        tags = note.tags
        reviews = card.reps

        return {
            "card_id": card.id,
            "front": front[:1000],
            "back": back[:1000],
            "deck": deck_name,
            "tags": tags,
            "reviews": reviews,
        }
    except Exception as exc:
        logger.warning("plusi/tools: _karte_lesen error: %s", exc)
        return {"error": str(exc)}


def _deck_liste() -> dict:
    """List all decks in the collection (max 50).

    Returns
    -------
    {"decks": [{"id": int, "name": str}, ...]}
    """
    try:
        from aqt import mw  # type: ignore
        if mw is None or mw.col is None:
            return {"decks": [], "error": "Anki collection not available"}

        all_decks = mw.col.decks.all_names_and_ids()
        decks = [
            {"id": d.id, "name": d.name}
            for d in sorted(all_decks, key=lambda x: x.name)[:50]
        ]
        return {"decks": decks}
    except Exception as exc:
        logger.warning("plusi/tools: _deck_liste error: %s", exc)
        return {"decks": [], "error": str(exc)}


def _deck_stats(deck_id: int) -> dict:
    """Return card count for a deck.

    Parameters
    ----------
    deck_id: The integer deck id.

    Returns
    -------
    {"deck_id": int, "total_cards": int}
    """
    try:
        from aqt import mw  # type: ignore
        if mw is None or mw.col is None:
            return {"deck_id": deck_id, "total_cards": 0, "error": "Anki collection not available"}

        deck_id_int = int(deck_id)
        count = mw.col.db.scalar(
            "SELECT count() FROM cards WHERE did = ?", deck_id_int
        )
        return {"deck_id": deck_id_int, "total_cards": count or 0}
    except Exception as exc:
        logger.warning("plusi/tools: _deck_stats error: %s", exc)
        return {"deck_id": deck_id, "total_cards": 0, "error": str(exc)}


# ---------------------------------------------------------------------------
# Action tools
# ---------------------------------------------------------------------------

def _deck_oeffnen(deck_id: int) -> dict:
    """Open a deck and navigate to the review state.

    Parameters
    ----------
    deck_id: The integer deck id to open.

    Returns
    -------
    {"opened": True} or {"error": "..."}
    """
    try:
        from aqt import mw  # type: ignore
        if mw is None or mw.col is None:
            return {"error": "Anki collection not available"}

        deck_id_int = int(deck_id)
        mw.col.decks.select(deck_id_int)
        mw.moveToState("review")
        logger.info("plusi/tools: _deck_oeffnen opened deck_id=%s", deck_id_int)
        return {"opened": True}
    except Exception as exc:
        logger.warning("plusi/tools: _deck_oeffnen error: %s", exc)
        return {"error": str(exc)}


def _karte_zeigen(card_id: int) -> dict:
    """Open the card browser filtered to a specific card.

    Parameters
    ----------
    card_id: The integer card id to show.

    Returns
    -------
    {"shown": True} or {"error": "..."}
    """
    try:
        from aqt import mw  # type: ignore
        from aqt.browser import Browser  # type: ignore
        if mw is None:
            return {"error": "Anki not available"}

        card_id_int = int(card_id)
        browser = mw.find_window(Browser)  # type: ignore
        if browser is None:
            browser = Browser(mw)
        browser.show()
        browser.search_for(f"cid:{card_id_int}")
        logger.info("plusi/tools: _karte_zeigen card_id=%s", card_id_int)
        return {"shown": True}
    except Exception as exc:
        logger.warning("plusi/tools: _karte_zeigen error: %s", exc)
        return {"error": str(exc)}


def _nachricht(text: str, mood: str = "neutral") -> dict:
    """Compose an outgoing message (resolved by the caller).

    Parameters
    ----------
    text: Message text to send.
    mood: Mood to accompany the message (default: "neutral").

    Returns
    -------
    {"sent": True, "text": str, "mood": str}
    """
    return {"sent": True, "text": text, "mood": mood}


def _theme_wechseln(theme: str) -> dict:
    """Switch the app colour theme.

    Parameters
    ----------
    theme: One of "dark", "light", or "system".

    Returns
    -------
    {"changed": True, "theme": str} or {"error": "..."}
    """
    valid_themes = ("dark", "light", "system")
    if theme not in valid_themes:
        return {"error": f"Ungültiges Theme '{theme}'. Erlaubt: {valid_themes}"}

    try:
        # Must run on main thread — widget JS calls require it
        from ..utils.anki import run_on_main_thread

        def _apply():
            from ..ui.setup import get_chatbot_widget
            w = get_chatbot_widget()
            if w:
                w._msg_save_theme({"theme": theme})
            else:
                from ..config import update_config  # type: ignore
                update_config(**{"theme": theme})

        run_on_main_thread(_apply)
        logger.info("plusi/tools: _theme_wechseln → %s", theme)
        return {"changed": True, "theme": theme}
    except Exception as exc:
        logger.warning("plusi/tools: _theme_wechseln error: %s", exc)
        return {"error": str(exc)}


# ---------------------------------------------------------------------------
# Research tools
# ---------------------------------------------------------------------------

def _perplexity(query: str) -> dict:
    """Search the web via Perplexity (OpenRouter sonar-pro model).

    Parameters
    ----------
    query: Natural-language search query.

    Returns
    -------
    {"answer": str} or {"error": str}
    """
    try:
        import requests as http_requests

        try:
            from ..config import get_config  # type: ignore
        except ImportError:
            from config import get_config  # type: ignore

        config = get_config()
        api_key = config.get("dev_openrouter_key", "").strip()
        if not api_key:
            return {"error": "dev_openrouter_key nicht konfiguriert"}

        payload = {
            "model": "perplexity/sonar-pro",
            "messages": [{"role": "user", "content": query}],
        }
        response = http_requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        logger.debug("plusi/tools: _perplexity query answered (%d chars)", len(content))
        return {"answer": content}
    except Exception as exc:
        logger.warning("plusi/tools: _perplexity error: %s", exc)
        return {"error": str(exc)}


# ---------------------------------------------------------------------------
# Self-programming tools
# ---------------------------------------------------------------------------

def _list_events() -> dict:
    """Return the available event catalog.

    Returns
    -------
    The EVENT_CATALOG dict (category → list of event descriptors).
    """
    try:
        if _event_bus is not None:
            return _event_bus.available_events()
    except Exception as exc:
        logger.warning("plusi/tools: _list_events event_bus error: %s", exc)

    # Fallback: import directly
    try:
        try:
            from ..plusi.event_bus import EVENT_CATALOG  # type: ignore
        except ImportError:
            from plusi.event_bus import EVENT_CATALOG  # type: ignore
        return EVENT_CATALOG
    except ImportError:
        try:
            from .event_bus import EVENT_CATALOG  # type: ignore
            return EVENT_CATALOG
        except ImportError as exc:
            logger.error("plusi/tools: _list_events import failed: %s", exc)
            return {"error": str(exc)}


def _subscribe(event: str, condition: str, prompt: str, name: str) -> dict:
    """Add an event subscription.

    Parameters
    ----------
    event:     Event type string (must exist in ALL_EVENTS).
    condition: Condition template string (e.g. "count(5)", "streak(3)").
    prompt:    Wake-up prompt text for Plusi when the condition fires.
    name:      Unique subscription name.

    Returns
    -------
    {"subscribed": True, "name": name} on success, or error dict with templates.
    """
    try:
        try:
            from .subscriptions import parse_condition, AVAILABLE_TEMPLATES, ALL_EVENTS  # type: ignore
        except ImportError:
            try:
                from ..plusi.subscriptions import parse_condition, AVAILABLE_TEMPLATES, ALL_EVENTS  # type: ignore
            except ImportError:
                from plusi.subscriptions import parse_condition, AVAILABLE_TEMPLATES, ALL_EVENTS  # type: ignore
    except ImportError:
        try:
            from plusi.subscriptions import parse_condition, AVAILABLE_TEMPLATES, ALL_EVENTS  # type: ignore
        except ImportError as exc:
            return {"error": f"Subscriptions module not available: {exc}"}

    # Validate event
    if event not in ALL_EVENTS:
        known = sorted(ALL_EVENTS)
        return {
            "error": f"Unbekanntes Event '{event}'. Bekannte Events: {known}",
            "available_templates": AVAILABLE_TEMPLATES,
        }

    # Parse condition
    parsed_condition = parse_condition(condition)
    if parsed_condition is None:
        return {
            "error": (
                f"Ungültige Condition '{condition}'. "
                "Verwende eines der verfügbaren Templates."
            ),
            "available_templates": AVAILABLE_TEMPLATES,
            "examples": [
                "count(5)          — nach 5 Ereignissen",
                "count(3, within=10m) — 3 Events in 10 Minuten",
                "streak(3)         — 3 Events hintereinander",
                "accuracy_below(40) — Genauigkeit unter 40%",
                "idle(120)         — 120 Minuten keine Aktivität",
                "time(22:00-06:00) — zwischen 22:00 und 06:00 Uhr",
                "contains(Anatomie) — Payload enthält 'Anatomie'",
            ],
        }

    sub = {
        "name": name,
        "event": event,
        "condition": parsed_condition,
        "wake_prompt": prompt,
    }

    # Add to in-memory event bus
    if _event_bus is not None:
        _event_bus.add_subscription(sub)

    # Persist to DB
    if _memory is not None:
        try:
            condition_json = parsed_condition.to_json()
            _memory._db.execute(
                """
                INSERT OR REPLACE INTO plusi_subscriptions
                    (name, event, condition_raw, condition_parsed, wake_prompt, active)
                VALUES (?, ?, ?, ?, ?, 1)
                """,
                (name, event, condition, condition_json, prompt),
            )
            _memory._db.commit()
            logger.info("plusi/tools: _subscribe persisted name=%s event=%s", name, event)
        except Exception as db_exc:
            logger.warning("plusi/tools: _subscribe DB persist failed: %s", db_exc)

    logger.info("plusi/tools: _subscribe added name=%s event=%s", name, event)
    return {"subscribed": True, "name": name}


def _unsubscribe(name: str) -> dict:
    """Remove an event subscription by name.

    Parameters
    ----------
    name: The unique subscription name to remove.

    Returns
    -------
    {"unsubscribed": True, "name": name} or {"error": "..."}
    """
    removed_bus = False
    removed_db = False

    # Remove from event bus
    if _event_bus is not None:
        removed_bus = _event_bus.remove_subscription(name)

    # Remove from DB
    if _memory is not None:
        try:
            cursor = _memory._db.execute(
                "DELETE FROM plusi_subscriptions WHERE name = ?", (name,)
            )
            _memory._db.commit()
            removed_db = cursor.rowcount > 0
        except Exception as db_exc:
            logger.warning("plusi/tools: _unsubscribe DB error: %s", db_exc)

    if not removed_bus and not removed_db:
        return {"error": f"Subscription '{name}' nicht gefunden"}

    logger.info("plusi/tools: _unsubscribe removed name=%s", name)
    return {"unsubscribed": True, "name": name}


def _list_subscriptions() -> dict:
    """Return all active event subscriptions.

    Returns
    -------
    {"subscriptions": [...]} where each entry has name, event, wake_prompt.
    """
    if _event_bus is not None:
        raw = _event_bus.list_subscriptions()
        # Serialise condition objects to their string representations for display
        subs = []
        for s in raw:
            cond = s.get("condition")
            cond_repr = repr(cond) if cond is not None else None
            subs.append({
                "name": s.get("name"),
                "event": s.get("event"),
                "wake_prompt": s.get("wake_prompt"),
                "condition": cond_repr,
            })
        return {"subscriptions": subs}

    # Fallback: read from DB
    if _memory is not None:
        try:
            rows = _memory._db.execute(
                """
                SELECT name, event, condition_raw, wake_prompt
                FROM plusi_subscriptions
                WHERE active = 1
                ORDER BY id
                """
            ).fetchall()
            return {
                "subscriptions": [
                    {
                        "name": r["name"],
                        "event": r["event"],
                        "wake_prompt": r["wake_prompt"],
                        "condition": r["condition_raw"],
                    }
                    for r in rows
                ]
            }
        except Exception as exc:
            logger.warning("plusi/tools: _list_subscriptions DB error: %s", exc)

    return {"subscriptions": []}


# ---------------------------------------------------------------------------
# execute_tool dispatcher
# ---------------------------------------------------------------------------

#: Maps tool name → implementation function.
#: Each function takes keyword arguments matching its parameter names.
TOOL_MAP: dict[str, Any] = {
    # Memory
    "merk_dir": _merk_dir,
    "erinnere_dich": _erinnere_dich,
    "vergiss": _vergiss,
    "tagebuch": _tagebuch,
    # Perception
    "app_status": _app_status,
    "aktuelle_karte": _aktuelle_karte,
    "lernstatistik": _lernstatistik,
    # Card search
    "suche_karten": _suche_karten,
    "karte_lesen": _karte_lesen,
    "deck_liste": _deck_liste,
    "deck_stats": _deck_stats,
    # Actions
    "deck_oeffnen": _deck_oeffnen,
    "karte_zeigen": _karte_zeigen,
    "nachricht": _nachricht,
    "theme_wechseln": _theme_wechseln,
    # Research
    "perplexity": _perplexity,
    # Self-programming
    "list_events": _list_events,
    "subscribe": _subscribe,
    "unsubscribe": _unsubscribe,
    "list_subscriptions": _list_subscriptions,
}


def execute_tool(name: str, args: Optional[dict] = None) -> dict:
    """Dispatch a tool call by name.

    Parameters
    ----------
    name: Tool name (must be a key in TOOL_MAP).
    args: Dict of keyword arguments for the tool. None is treated as {}.

    Returns
    -------
    Tool result dict, or {"error": "..."} on failure.
    """
    if args is None:
        args = {}

    fn = TOOL_MAP.get(name)
    if fn is None:
        known = sorted(TOOL_MAP.keys())
        logger.warning("plusi/tools: unknown tool '%s'. Known: %s", name, known)
        return {"error": f"Unbekanntes Tool '{name}'. Bekannte Tools: {known}"}

    try:
        result = fn(**args)
        logger.debug("plusi/tools: execute_tool '%s' → %s", name, type(result).__name__)
        return result
    except TypeError as exc:
        # Missing or unexpected arguments
        logger.warning("plusi/tools: execute_tool '%s' argument error: %s", name, exc)
        return {"error": f"Argument-Fehler bei Tool '{name}': {exc}"}
    except Exception as exc:
        logger.exception("plusi/tools: execute_tool '%s' failed", name)
        return {"error": f"Tool '{name}' fehlgeschlagen: {exc}"}
