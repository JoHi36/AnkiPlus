"""
Composable pipeline blocks — the lego kit for retrieval-using agents.

Each block is a small, single-purpose function with a clean input/output
contract. Agents compose blocks to build their own retrieval flows without
duplicating low-level mechanics like embedding-manager lookup, card cleaning,
or backend calls.

Blocks exposed by this module:
    embed_search        — embed a query, run cosine search, return (card_id, score)
    fetch_card_snippets — main-thread Anki lookup + HTML/cloze cleaning + deck name
    web_search          — backend /research call, returns {text, sources, tokens}

Already-public blocks (in their own files, listed here as part of the kit):
    ai.reranker.rerank_sources              — LLM-based source filtering
    ai.retrieval.HybridRetrieval            — SQL + semantic merge
    ai.retrieval.EnrichedRetrieval          — KG-enriched hybrid retrieval

The full pipeline (ai.rag_pipeline.retrieve_rag_context) is one specific
composition of these blocks. Agents that need a different shape (Plusi tool,
Definition agent, future custom pipelines) compose the blocks they need
without forking the orchestrator.
"""
from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional, Set, Tuple

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

WEB_SEARCH_QUERY_MAX_LEN = 500
WEB_SEARCH_TIMEOUT_S = 15


# ---------------------------------------------------------------------------
# Embedding manager resolution — single canonical path
# ---------------------------------------------------------------------------

def _resolve_embedding_manager():
    """Return the singleton EmbeddingManager, or None if unavailable.

    Single source of truth for finding the embedding manager. Replaces
    multiple inconsistent lookups across plusi/tools.py, ai/definition.py,
    ai/handler.py, etc.

    KNOWN BUG — fallback path is broken in QThread context.
    ─────────────────────────────────────────────────────────
    `from .. import get_embedding_manager` works on the main thread but
    fails inside an _AgentDispatchThread / QThread with a cryptic
    "No module named 'theme'" error from the import machinery (the
    relative-import resolution can't reach AnkiPlus_main from a
    background thread context cleanly). The `from __init__ import ...`
    second clause is also broken — `__init__` is not a top-level module
    name, only the package init file. So when the relative import fails
    on the first line, the second line raises ModuleNotFoundError too,
    and the outer except returns None.

    The CORRECT pattern is the one ai/handler.py:488 uses for the same
    lookup — read sys.modules directly, no import statement needed:

        import sys
        init_mod = sys.modules.get('AnkiPlus_main') or sys.modules.get('__init__')
        if init_mod and hasattr(init_mod, 'get_embedding_manager'):
            return init_mod.get_embedding_manager()
        return None

    This is not yet ported here because every current caller of
    embed_search() that runs from a background thread (Definition,
    Tutor) gets `embedding_manager` injected as a kwarg by
    AIHandler._dispatch_agent and never reaches this fallback. New
    callers that hit this path on a worker thread will silently get
    no semantic search. If you add such a caller, port the sys.modules
    pattern above before relying on this resolver.

    Tracking: see git commit ff02338 ("fix(definition): unblock KG term
    definitions") for the diagnostic trail that uncovered this.
    """
    try:
        try:
            from .. import get_embedding_manager
        except ImportError:
            from __init__ import get_embedding_manager  # noqa: F401  (broken fallback, see docstring)
        return get_embedding_manager()
    except Exception as e:
        logger.debug("pipeline_blocks: embedding manager lookup failed: %s", e)
        return None


# ---------------------------------------------------------------------------
# Block: embed_search
# ---------------------------------------------------------------------------

def embed_search(
    query: str,
    top_k: int = 30,
    card_id_filter: Optional[Set[int]] = None,
    embedding_manager=None,
) -> List[Tuple[int, float]]:
    """Embed a query string and run cosine top-k search over the card store.

    Args:
        query: Natural-language query.
        top_k: Maximum number of results to return after filtering.
        card_id_filter: Optional set of card IDs to constrain results to.
            When provided, the underlying search fetches a wider window
            (top_k * 5, capped at 200) so the post-filter still has enough
            material to return top_k. Use this for term-scoped search
            (e.g. Definition agent's "cards mentioning this term").
        embedding_manager: Optional override. If None, the canonical
            singleton is resolved via __init__.get_embedding_manager().

    Returns:
        List of (card_id, score) tuples, length <= top_k.
        Empty list on any failure (failure is logged at warning level).
    """
    if not query or not query.strip():
        return []

    em = embedding_manager or _resolve_embedding_manager()
    if em is None:
        logger.warning("embed_search: embedding manager not available")
        return []

    try:
        embeddings = em.embed_texts([query.strip()])
    except Exception as e:
        logger.warning("embed_search: embed_texts failed: %s", e)
        return []
    if not embeddings:
        return []

    # When filtering, fetch a wider window so we have enough headroom.
    fetch_k = top_k
    if card_id_filter is not None:
        fetch_k = min(max(top_k * 5, 50), 200)

    try:
        hits = em.search(embeddings[0], top_k=fetch_k)
    except Exception as e:
        logger.warning("embed_search: cosine search failed: %s", e)
        return []
    if not hits:
        return []

    if card_id_filter is not None:
        hits = [(cid, score) for cid, score in hits if cid in card_id_filter]

    return hits[:top_k]


# ---------------------------------------------------------------------------
# Block: fetch_card_snippets
# ---------------------------------------------------------------------------

def fetch_card_snippets(
    card_ids: List[int],
    max_field_len: int = 200,
) -> List[Dict[str, Any]]:
    """Look up cards in the Anki collection on the main thread, return cleaned snippets.

    Replaces the inline card-lookup loop that exists in plusi/tools.py
    (3 places), ai/definition.py, and ai/tools.py (3 places). Handles
    main-thread safety, HTML/cloze stripping, and deck name resolution
    in one place.

    Args:
        card_ids: List of integer card IDs to fetch.
        max_field_len: Truncate cleaned question/answer fields to this length.

    Returns:
        List of card snippet dicts (in input order, cards that fail to load
        are silently skipped):
            {
                'cardId':    int,
                'noteId':    int,
                'question':  str,    # cleaned, truncated
                'answer':    str,    # cleaned, truncated
                'deckName':  str,
            }
    """
    if not card_ids:
        return []

    try:
        try:
            from ..utils.anki import run_on_main_thread, strip_html_and_cloze, is_main_thread
        except ImportError:
            from utils.anki import run_on_main_thread, strip_html_and_cloze, is_main_thread
    except ImportError as e:
        logger.warning("fetch_card_snippets: utils.anki import failed: %s", e)
        return []

    def _fetch():
        try:
            from aqt import mw  # type: ignore
        except ImportError:
            return []
        if mw is None or mw.col is None:
            return []

        snippets = []
        for cid in card_ids:
            try:
                card = mw.col.get_card(int(cid))
                note = card.note()
                fields = note.fields
                front_raw = fields[0] if fields else ''
                back_raw = fields[1] if len(fields) > 1 else ''
                deck_name = mw.col.decks.name(card.did) if card.did else ''
                snippets.append({
                    'cardId': int(cid),
                    'noteId': int(note.id) if hasattr(note, 'id') else int(cid),
                    'question': strip_html_and_cloze(front_raw)[:max_field_len],
                    'answer': strip_html_and_cloze(back_raw)[:max_field_len],
                    'deckName': deck_name,
                })
            except Exception as e:
                logger.debug("fetch_card_snippets: card %s lookup failed: %s", cid, e)
                continue
        return snippets

    # If the caller is already on the main thread, calling run_on_main_thread
    # would deadlock (it posts a callback then blocks on done.wait, and the
    # main thread that needs to fire the callback is the one that's blocked).
    # Run _fetch directly in that case.
    if is_main_thread():
        try:
            return _fetch()
        except Exception as e:
            logger.warning("fetch_card_snippets: direct fetch failed: %s", e)
            return []

    try:
        return run_on_main_thread(_fetch)
    except Exception as e:
        logger.warning("fetch_card_snippets: main-thread fetch failed: %s", e)
        return []


# ---------------------------------------------------------------------------
# Block: web_search
# ---------------------------------------------------------------------------

def web_search(
    query: str,
    auth_token: Optional[str] = None,
    backend_url: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Call backend /research for Perplexity web results.

    Backend contract (functions/lib/handlers/research.js):
        Request:  {query: string, model?: string}
        Response: {answer: string, citations: [{url, title}], tokens?}

    Returns:
        {
            'text':    str,            # the answer text
            'sources': [{url, title}], # web citations
            'tokens':  dict,           # token usage info (may be empty)
        }
        or None if the call fails / no backend / no auth.

    This block is the same call the unified pipeline uses internally for
    its web fallback. Any agent can call it directly when it wants web
    sources without invoking the full pipeline.
    """
    try:
        import requests
    except ImportError:
        logger.warning("web_search: requests library not available")
        return None

    try:
        try:
            from ..config import get_backend_url, get_auth_token
        except ImportError:
            from config import get_backend_url, get_auth_token

        url = backend_url or get_backend_url()
        token = auth_token or get_auth_token()

        if not url:
            logger.warning("web_search: no backend URL configured")
            return None

        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        response = requests.post(
            f"{url}/research",
            json={"query": query[:WEB_SEARCH_QUERY_MAX_LEN]},
            headers=headers,
            timeout=WEB_SEARCH_TIMEOUT_S,
        )
        response.raise_for_status()
        data = response.json()
        sources = []
        for cit in data.get("citations", []):
            if isinstance(cit, dict):
                sources.append({"title": cit.get("title", ""), "url": cit.get("url", "")})
            elif isinstance(cit, str):
                sources.append({"title": "", "url": cit})
        return {
            "text": data.get("answer", data.get("text", "")),
            "sources": sources,
            "tokens": data.get("tokens", {}),
        }
    except Exception as e:
        logger.warning("web_search: backend call failed: %s", e)
        return None
