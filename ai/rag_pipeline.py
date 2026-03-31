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
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)


@dataclass
class RagResult:
    """Result of a RAG retrieval pipeline call."""
    rag_context: Optional[Dict[str, Any]]  # {cards, citations, reasoning} or None
    citations: Dict[str, Any]
    cards_found: int
    retrieval_state: Any = None  # RetrievalState if hybrid was used
    keyword_hits: int = 0  # SQL keyword search hit count (0 = topic not in cards)


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

    # Fallback: use user_message as query when router didn't provide queries
    if not precise_queries and not broad_queries and user_message and user_message.strip():
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
                from .retrieval import EnrichedRetrieval, RetrievalState
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
                    from .retrieval import HybridRetrieval
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
    )


def _attr_or_key(obj):
    """Return a getter that works on both objects with attributes and dicts."""
    if isinstance(obj, dict):
        return lambda key, default=None: obj.get(key, default)
    return lambda key, default=None: getattr(obj, key, default)
