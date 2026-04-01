# Pruefer-specific RAG retrieval pipeline.
# Forked from ai/rag_pipeline.py on 2026-04-01.
# Modify independently for Pruefer-specific retrieval needs.
"""
RAG Pipeline: Standalone card retrieval orchestration.

Extracted from handler.py so that any agent (Tutor, future agents) can call
retrieve_rag_context() without importing handler internals.

Handles:
- Query parsing from routing_result
- HybridRetrieval (SQL + semantic) when embedding_manager is available
- SQL-only fallback
- Context string + citations formatting
- Current card injection if not already in results
"""
import re
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

try:
    from ...utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

PERPLEXITY_QUERY_MAX_LEN = 500
PERPLEXITY_TIMEOUT_S = 15


@dataclass
class RagResult:
    """Result of a RAG retrieval pipeline call."""
    rag_context: Optional[Dict[str, Any]]  # {cards, citations, reasoning} or None
    citations: Dict[str, Any]
    cards_found: int
    retrieval_state: Any = None  # RetrievalState if hybrid was used
    keyword_hits: int = 0  # SQL keyword search hit count (0 = topic not in cards)
    web_sources: List[Dict[str, Any]] = field(default_factory=list)  # Perplexity web sources


def _call_perplexity(query: str, auth_token: Optional[str] = None, backend_url: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Call the backend /research endpoint to get Perplexity web results.

    Args:
        query: The user's search query (truncated to 500 chars).
        auth_token: Optional auth token; fetched from config if not provided.
        backend_url: Optional backend URL; fetched from config if not provided.

    Returns:
        Dict with 'text', 'sources', 'tokens' keys, or None on failure.
    """
    try:
        import requests
    except ImportError:
        logger.warning("requests library not available, cannot call Perplexity")
        return None

    try:
        try:
            from ...config import get_backend_url, get_auth_token
        except ImportError:
            from config import get_backend_url, get_auth_token

        url = backend_url or get_backend_url()
        token = auth_token or get_auth_token()

        if not url:
            logger.warning("No backend URL configured, skipping Perplexity call")
            return None

        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        response = requests.post(
            f"{url}/research",
            json={"message": query[:PERPLEXITY_QUERY_MAX_LEN]},
            headers=headers,
            timeout=PERPLEXITY_TIMEOUT_S,
        )
        response.raise_for_status()
        data = response.json()
        return {
            "text": data.get("text", ""),
            "sources": data.get("sources", []),
            "tokens": data.get("tokens", {}),
        }
    except Exception as e:
        logger.warning("Perplexity call failed: %s", e)
        return None


def retrieve_rag_context(
    user_message: str,
    context: Optional[dict],
    config: dict,
    routing_result,
    emit_step: Optional[Callable] = None,
    embedding_manager=None,
    rag_retrieve_fn: Optional[Callable] = None,
    request_steps_ref: Optional[List] = None,
) -> RagResult:
    """Orchestrate card retrieval for a user query.

    Args:
        user_message: The user's question text.
        context: Current card context dict (cardId, noteId, question, answer, ...).
        config: Application config dict.
        routing_result: Routing result object with search parameters.
            Must have attributes: search_needed, retrieval_mode, precise_queries,
            broad_queries, embedding_queries, search_scope, max_sources.
        emit_step: Optional callback(step, status, data=None) for pipeline visualization.
        embedding_manager: Optional embedding manager for semantic search.
        rag_retrieve_fn: Callable for SQL keyword retrieval.
            Signature: (precise_queries, broad_queries, search_scope, context,
                        max_notes, suppress_event) -> {context_string, citations}
        request_steps_ref: Optional shared list of request steps (from handler's
            _current_request_steps). Used by HybridRetrieval to parse query hit
            counts from AI state events. If provided, the RetrievalState will
            be kept in sync with this reference after each rag_retrieve_fn call.

    Returns:
        RagResult with rag_context dict (or None), citations, and cards_found count.
    """
    _emit = emit_step or (lambda step, status, data=None: None)

    # Check if search is needed
    search_needed = getattr(routing_result, 'search_needed', None)
    if search_needed is None:
        search_needed = routing_result.get('search_needed', False) if isinstance(routing_result, dict) else False
    if not search_needed:
        return RagResult(rag_context=None, citations={}, cards_found=0)

    # Parse search parameters from routing_result
    _get = _attr_or_key(routing_result)
    retrieval_mode = _get('retrieval_mode', 'both')
    search_scope = _get('search_scope', 'current_deck')
    max_sources_level = _get('max_sources', 'medium')
    max_notes = {"low": 10, "medium": 30, "high": 50}.get(max_sources_level, 30)

    precise_queries = [q for q in (_get('precise_queries', []) or []) if q and q.strip()]
    broad_queries = [q for q in (_get('broad_queries', []) or []) if q and q.strip()]

    # Build queries from resolved_intent if router didn't provide explicit queries
    if not precise_queries and not broad_queries:
        resolved_intent = _get('resolved_intent', '') or ''
        if resolved_intent and resolved_intent.strip():
            precise_queries = [resolved_intent.strip()]
            logger.debug("RAG pipeline: using resolved_intent as query: %s", resolved_intent[:80])
        elif user_message and user_message.strip():
            precise_queries = [user_message.strip()]
            logger.debug("RAG pipeline: no queries from router, using user_message as fallback query")

    logger.debug("RAG pipeline: mode=%s, scope=%s, max_notes=%s, precise=%d, broad=%d",
                 retrieval_mode, search_scope, max_notes, len(precise_queries), len(broad_queries))

    if not precise_queries and not broad_queries:
        return RagResult(rag_context=None, citations={}, cards_found=0)

    # Execute retrieval
    retrieval_result = None
    retrieval_state = None

    if embedding_manager and retrieval_mode in ('semantic', 'both'):
        # Try EnrichedRetrieval first (new KG-enriched pipeline)
        try:
            try:
                from ..retrieval import EnrichedRetrieval, RetrievalState
            except ImportError:
                from retrieval import EnrichedRetrieval, RetrievalState

            retrieval_state = RetrievalState()
            if request_steps_ref is not None:
                retrieval_state.request_steps = list(request_steps_ref)

            _inner_fn = rag_retrieve_fn
            def _syncing_rag(**kwargs):
                result = _inner_fn(**kwargs)
                if request_steps_ref is not None:
                    retrieval_state.request_steps = list(request_steps_ref)
                return result

            enriched = EnrichedRetrieval(
                embedding_manager,
                emit_step=_emit,
                rag_retrieve_fn=_syncing_rag,
                state=retrieval_state,
            )

            retrieval_result = enriched.retrieve(
                user_message, routing_result, context, max_notes=max_notes)

        except Exception as e:
            logger.warning("EnrichedRetrieval failed, falling back to HybridRetrieval: %s", e)
            retrieval_result = None

        # Fallback to legacy HybridRetrieval
        if retrieval_result is None:
            try:
                try:
                    from ..retrieval import HybridRetrieval
                except ImportError:
                    from retrieval import HybridRetrieval

                retrieval_state = RetrievalState()

                hybrid = HybridRetrieval(
                    embedding_manager, emit_step=_emit,
                    rag_retrieve_fn=rag_retrieve_fn, state=retrieval_state,
                )
                router_dict = {
                    'search_needed': True, 'retrieval_mode': retrieval_mode,
                    'search_scope': 'collection',
                    'precise_queries': precise_queries,
                    'broad_queries': broad_queries,
                    'embedding_queries': _get('embedding_queries', []) or [],
                }
                retrieval_result = hybrid.retrieve(
                    user_message, router_dict, context, max_notes=max_notes)
            except Exception as e2:
                logger.warning("HybridRetrieval also failed: %s", e2)
                retrieval_result = None

    # SQL-only fallback (or if hybrid wasn't attempted)
    if retrieval_result is None and rag_retrieve_fn:
        try:
            retrieval_result = rag_retrieve_fn(
                precise_queries=precise_queries,
                broad_queries=broad_queries,
                search_scope=search_scope,
                context=context,
                max_notes=max_notes,
            )
        except Exception as e:
            logger.warning("SQL retrieval failed: %s", e)
            return RagResult(rag_context=None, citations={}, cards_found=0,
                             retrieval_state=retrieval_state)

    # Process retrieval results
    if not retrieval_result or not retrieval_result.get("context_string"):
        return RagResult(rag_context=None, citations={}, cards_found=0,
                         retrieval_state=retrieval_state)

    context_string = retrieval_result["context_string"]
    citations = retrieval_result.get("citations", {})

    # Auto web search: if confidence is low, augment with Perplexity results
    web_context = None
    confidence = retrieval_result.get("confidence", "medium")
    if confidence == "low":
        logger.info("RAG confidence is low, calling Perplexity for query: %s", user_message[:80])
        _emit("web_search", "running", {"query": user_message[:200]})
        web_context = _call_perplexity(user_message)
        if web_context and web_context.get("text"):
            sources = web_context.get("sources", [])
            source_lines = "\n".join(
                f"[[WEB:{i + 1}]] {s.get('title', 'Quelle')} ({s.get('url', '')})"
                for i, s in enumerate(sources)
            )
            context_string = (
                context_string
                + f"\n\n--- WEB-RECHERCHE (Perplexity) ---\n{web_context['text']}"
                + (f"\n\nWeb-Quellen:\n{source_lines}" if source_lines else "")
            )
            _emit("web_search", "done", {"sources_count": len(sources)})
            logger.info("Perplexity returned %d web sources", len(sources))
        else:
            _emit("web_search", "error", {"reason": "no results"})
            logger.warning("Perplexity returned no usable web context")

    # Inject current card if not already in results
    if context and context.get('cardId'):
        current_note_id = str(context.get('noteId', context['cardId']))
        if current_note_id not in citations:
            _q = context.get('question') or context.get('frontField') or ''
            _a = context.get('answer') or ''
            _q_clean = re.sub(r'<[^>]+>', ' ', _q).strip()[:200]
            _a_clean = re.sub(r'<[^>]+>', ' ', _a).strip()[:200]
            # Index: use next position after all retrieved cards
            citations[current_note_id] = {
                'noteId': context.get('noteId', context['cardId']),
                'cardId': context['cardId'],
                'question': _q_clean,
                'answer': _a_clean,
                'fields': context.get('fields', {}),
                'deckName': context.get('deckName', ''),
                'isCurrentCard': True,
                'sources': ['current'],
                'index': len(citations) + 1,  # Stable index for [N] inline references
            }
            context_string = (
                f"Note {current_note_id} (aktuelle Karte):\n"
                f"  Frage: {_q_clean}\n  Antwort: {_a_clean}\n"
                f"{context_string}"
            )

    # Build rag_context dict
    formatted_cards = [line for line in context_string.split("\n") if line.strip()]
    rag_context = {
        "cards": formatted_cards,
        "reasoning": _get('reasoning', '') if hasattr(routing_result, 'reasoning') or isinstance(routing_result, dict) else '',
        "citations": citations,
    }

    logger.debug("RAG pipeline: %d cards, %d citations",
                 len(formatted_cards), len(citations))

    return RagResult(
        rag_context=rag_context,
        citations=citations,
        cards_found=len(citations),
        retrieval_state=retrieval_state,
        keyword_hits=retrieval_result.get("keyword_count", 0),
        web_sources=web_context.get("sources", []) if web_context else [],
    )


def _attr_or_key(obj):
    """Return a getter that works on both objects with attributes and dicts."""
    if isinstance(obj, dict):
        return lambda key, default=None: obj.get(key, default)
    return lambda key, default=None: getattr(obj, key, default)
