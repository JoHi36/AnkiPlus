"""
Unified RAG retrieval pipeline — single source of truth for all agents.

Each agent passes a RetrievalConfig that customizes which phases run and how.
The defaults match the Tutor agent's behavior (the most full-featured path);
other agents override only what they need.

Pipeline phases (each gated by RetrievalConfig flags):
  0. Routing parse — extract queries from routing_result
  1. Retrieval — KG-enriched (EnrichedRetrieval) or hybrid (HybridRetrieval)
     OR preloaded_cards path (skip retrieval, use caller-provided cards)
  2. Reranker — LLM filters irrelevant sources, renumbers [N]
  3. Web fallback — Perplexity if confidence low or too few relevant sources
  4. Current-card injection — add the user's currently-reviewing card
  5. Build RagResult

History: forked from rag_pipeline.py and tutor_retrieval.py on 2026-04-09.
The unified version replaces both. Per-agent forks in ai/retrieval_agents/
have been deleted — agents customize via RetrievalConfig, not by copying code.
"""
import re
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

PERPLEXITY_QUERY_MAX_LEN = 500
PERPLEXITY_TIMEOUT_S = 15


# ---------------------------------------------------------------------------
# RetrievalConfig — per-agent pipeline configuration
# ---------------------------------------------------------------------------

@dataclass
class RetrievalConfig:
    """Per-agent configuration for the unified RAG pipeline.

    Defaults match main's stable rag_pipeline.py behavior:
      - No reranker (LLM filtering off)
      - Web fallback fires ONLY on confidence == 'low' from retrieval
        (single trigger, last resort, matches main exactly)
      - Current-card injection on (matches Tutor on main)

    Agents customize by overriding fields. The reranker_enabled flag
    exists for opt-in but is off by default — earlier versions of this
    config defaulted it to True and that introduced source-quality
    regressions vs. main's behavior. See ai/reranker.py if you want to
    enable it for an experiment.
    """
    # --- Retrieval defaults (used if routing_result omits them) ---
    retrieval_mode_default: str = 'both'
    search_scope_default: str = 'collection'
    max_sources_default: str = 'medium'
    kg_enrichment: bool = True

    # --- Reranker (LLM-based source filtering) ---
    # Off by default — main's stable pipeline has no reranker.
    reranker_enabled: bool = False
    use_resolved_intent_for_reranker: bool = True

    # --- Web fallback (Perplexity via backend /research) ---
    # Web search is a LAST RESORT — fires only when retrieval reports
    # confidence == 'low'. There is no minimum-source threshold. This
    # matches main's single-condition fallback exactly.
    web_fallback_enabled: bool = True
    use_resolved_intent_for_web: bool = True

    # --- Current-card injection ---
    inject_current_card: bool = True

    # --- Preloaded cards path (Smart Search) ---
    accept_preloaded_cards: bool = False


# Default = main's stable behavior. Used when caller passes retrieval_config=None.
_DEFAULT_CONFIG = RetrievalConfig()


# ---------------------------------------------------------------------------
# RagResult
# ---------------------------------------------------------------------------

@dataclass
class RagResult:
    """Result of a RAG retrieval pipeline call."""
    rag_context: Optional[Dict[str, Any]]
    citations: Dict[str, Any]
    cards_found: int
    retrieval_state: Any = None
    keyword_hits: int = 0
    web_sources: List[Dict[str, Any]] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Web fallback — delegates to the shared pipeline block
# ---------------------------------------------------------------------------

def _call_perplexity(query: str, auth_token: Optional[str] = None,
                     backend_url: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Call backend /research for web results.

    Thin wrapper around ai.pipeline_blocks.web_search — kept for internal
    use by the orchestrator. New code should call web_search directly.
    """
    try:
        from .pipeline_blocks import web_search
    except ImportError:
        from pipeline_blocks import web_search
    return web_search(query, auth_token=auth_token, backend_url=backend_url)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _attr_or_key(obj):
    """Return a getter that works on both objects with attributes and dicts."""
    if obj is None:
        return lambda key, default=None: default
    if isinstance(obj, dict):
        return lambda key, default=None: obj.get(key, default)
    return lambda key, default=None: getattr(obj, key, default)


def _build_preloaded_context(preloaded_cards: List[dict]) -> tuple:
    """Convert caller-provided cards into the (context_string, citations) shape.

    Used by the Smart Search path: cards are already loaded by another pipeline
    (e.g. SearchCardsThread). We just format them so the rest of the unified
    pipeline (reranker, web fallback, current-card injection) can run on them.
    """
    context_lines = []
    citations = {}
    for i, card in enumerate(preloaded_cards[:50]):
        if isinstance(card, str):
            context_lines.append(card)
            continue
        idx = i + 1
        card_id = card.get('id') or card.get('cardId') or card.get('card_id') or 0
        try:
            card_id_int = int(card_id) if card_id else 0
        except (ValueError, TypeError):
            card_id_int = 0
        question = (card.get('question') or '')[:200]
        answer = (card.get('answer') or card.get('back') or '')[:200]
        deck = card.get('deck') or card.get('deckName') or ''
        context_lines.append(f'[{idx}] ({deck}) {question} | {answer}')
        key = str(card_id_int) if card_id_int else f'preloaded_{i}'
        citations[key] = {
            'index': idx,
            'cardId': card_id_int,
            'noteId': card_id_int,
            'question': question,
            'answer': answer,
            'deckName': deck,
            'sources': ['preloaded'],
        }
    return '\n'.join(context_lines), citations


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def retrieve_rag_context(
    user_message: str,
    context: Optional[dict] = None,
    config: Optional[dict] = None,
    routing_result=None,
    *,
    retrieval_config: Optional[RetrievalConfig] = None,
    preloaded_cards: Optional[List[dict]] = None,
    emit_step: Optional[Callable] = None,
    embedding_manager=None,
    rag_retrieve_fn: Optional[Callable] = None,
    request_steps_ref: Optional[List] = None,
) -> RagResult:
    """Orchestrate RAG retrieval for a user query.

    Args:
        user_message: The user's question text.
        context: Current card context dict (cardId, noteId, question, answer, ...).
        config: Application config dict.
        routing_result: Routing result object/dict with search parameters.
            Can be None if preloaded_cards is provided.
        retrieval_config: Per-agent RetrievalConfig. None = Tutor defaults.
        preloaded_cards: Optional list of pre-loaded card dicts. If provided
            AND retrieval_config.accept_preloaded_cards is True, retrieval is
            skipped and these cards become the context. Used by Research's
            Smart Search path.
        emit_step: Optional callback(step, status, data=None) for pipeline visualization.
        embedding_manager: Optional embedding manager for semantic search.
        rag_retrieve_fn: Callable for SQL keyword retrieval.
        request_steps_ref: Optional shared list for HybridRetrieval state sync.

    Returns:
        RagResult.
    """
    cfg = retrieval_config or _DEFAULT_CONFIG
    _emit = emit_step or (lambda step, status, data=None: None)
    _get = _attr_or_key(routing_result)

    # ── Phase 1: Retrieval (or preloaded cards path) ──────────────────────
    retrieval_result = None
    retrieval_state = None
    confidence = 'medium'
    citations: Dict[str, Any] = {}
    context_string = ''

    use_preloaded = (
        preloaded_cards is not None
        and cfg.accept_preloaded_cards
    )

    if use_preloaded:
        context_string, citations = _build_preloaded_context(preloaded_cards)
        confidence = 'medium'
        if not context_string:
            return RagResult(rag_context=None, citations={}, cards_found=0)
    else:
        search_needed = _get('search_needed', False)
        if not search_needed:
            return RagResult(rag_context=None, citations={}, cards_found=0)

        retrieval_mode = _get('retrieval_mode', cfg.retrieval_mode_default) \
            or cfg.retrieval_mode_default
        search_scope = _get('search_scope', cfg.search_scope_default) \
            or cfg.search_scope_default
        max_sources_level = _get('max_sources', cfg.max_sources_default) \
            or cfg.max_sources_default
        max_notes = {"low": 10, "medium": 30, "high": 50}.get(max_sources_level, 30)

        precise_queries = [q for q in (_get('precise_queries', []) or []) if q and q.strip()]
        broad_queries = [q for q in (_get('broad_queries', []) or []) if q and q.strip()]

        if not precise_queries and not broad_queries:
            resolved_intent = _get('resolved_intent', '') or ''
            if resolved_intent and resolved_intent.strip():
                precise_queries = [resolved_intent.strip()]
                logger.debug("RAG pipeline: using resolved_intent as query: %s",
                             resolved_intent[:80])
            elif user_message and user_message.strip():
                precise_queries = [user_message.strip()]
                logger.debug("RAG pipeline: no queries from router, using user_message")

        logger.debug("RAG pipeline: mode=%s, scope=%s, max_notes=%s, precise=%d, broad=%d",
                     retrieval_mode, search_scope, max_notes,
                     len(precise_queries), len(broad_queries))

        if not precise_queries and not broad_queries:
            return RagResult(rag_context=None, citations={}, cards_found=0)

        if embedding_manager and retrieval_mode in ('semantic', 'both'):
            if cfg.kg_enrichment:
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

            if retrieval_result is None:
                try:
                    try:
                        from .retrieval import HybridRetrieval, RetrievalState
                    except ImportError:
                        from retrieval import HybridRetrieval, RetrievalState

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

        if not retrieval_result or not retrieval_result.get("context_string"):
            return RagResult(rag_context=None, citations={}, cards_found=0,
                             retrieval_state=retrieval_state)

        context_string = retrieval_result["context_string"]
        citations = retrieval_result.get("citations", {})
        confidence = retrieval_result.get("confidence", "medium")

    # ── Phase 2: LLM Reranker — filter irrelevant sources ─────────────────
    if cfg.reranker_enabled:
        try:
            try:
                from .reranker import rerank_sources
            except ImportError:
                from reranker import rerank_sources

            _prelim_lines = context_string.split('\n') if context_string else []
            _numbered = [l for l in _prelim_lines if l.strip().startswith('[')]

            if _numbered and confidence != "low":
                _emit("reranker", "running", {"sources": len(_numbered)})
                _rerank_question = user_message
                if cfg.use_resolved_intent_for_reranker:
                    _resolved = _get('resolved_intent', '') or ''
                    if _resolved.strip():
                        _rerank_question = _resolved.strip()

                rerank_result = rerank_sources(
                    question=_rerank_question,
                    context_lines=_numbered,
                    min_confidence=confidence,
                    emit_step=_emit,
                )

                if rerank_result.get("reranked"):
                    relevant_indices = set(rerank_result.get("relevant_indices", []))
                    for note_id, cdata in list(citations.items()):
                        idx = cdata.get('index')
                        if idx and idx not in relevant_indices:
                            cdata.pop('index', None)
                    relevant_lines = [l for l in _numbered
                                      if any(l.startswith(f'[{i}]') for i in relevant_indices)]
                    _renumbered = []
                    _new_idx = 1
                    _old_to_new = {}
                    for line in relevant_lines:
                        _renumbered.append(re.sub(r'^\[\d+\]', f'[{_new_idx}]', line))
                        _m = re.match(r'^\[(\d+)\]', line)
                        if _m:
                            _old_to_new[int(_m.group(1))] = _new_idx
                        _new_idx += 1
                    context_string = '\n'.join(_renumbered)
                    for note_id, cdata in citations.items():
                        old_idx = cdata.get('index')
                        if old_idx and old_idx in _old_to_new:
                            cdata['index'] = _old_to_new[old_idx]
                    logger.info("Reranker: kept %d/%d sources (renumbered)",
                                len(relevant_lines), len(_numbered))

                    if rerank_result.get("web_search"):
                        confidence = "low"
                        logger.info("Reranker recommends web search")
                    elif not relevant_indices:
                        confidence = "low"
                        logger.info("Reranker: 0 relevant sources, forcing web search")
        except Exception as e:
            logger.warning("Reranker failed, continuing without: %s", e)

    # ── Phase 3: Web fallback (Perplexity) ────────────────────────────────
    # Web search is the LAST RESORT — fires only if retrieval reported
    # confidence='low'. This is a single condition, matching main's stable
    # rag_pipeline.py exactly. No minimum-source threshold, no double-trigger.
    web_context = None
    if cfg.web_fallback_enabled:
        if confidence == "low":
            _web_query = user_message
            if cfg.use_resolved_intent_for_web:
                _resolved = (_get('resolved_intent', '') or '').strip()
                if _resolved:
                    _web_query = _resolved
            logger.info("RAG confidence is low, calling Perplexity for query: %s",
                        _web_query[:80])
            _emit("web_search", "running", {"query": _web_query[:200]})
            web_context = _call_perplexity(_web_query)
            if web_context and web_context.get("text"):
                sources = web_context.get("sources", [])
                _max_idx = max((c.get('index', 0) for c in citations.values()), default=0)
                web_source_lines = []
                for i, s in enumerate(sources):
                    _web_idx = _max_idx + i + 1
                    _title = s.get('title', 'Quelle')
                    _url = s.get('url', '')
                    web_source_lines.append(f"[{_web_idx}] (Web) {_title}")
                    _web_key = f"web_{i}"
                    citations[_web_key] = {
                        'type': 'web',
                        'index': _web_idx,
                        'url': _url,
                        'title': _title,
                        'domain': _url.split('/')[2] if _url.count('/') >= 2 else '',
                    }
                context_string = (
                    context_string
                    + f"\n\n--- WEB-RECHERCHE ---\n{web_context['text']}"
                    + ("\n\nWeb-Quellen:\n" + "\n".join(web_source_lines)
                       if web_source_lines else "")
                )
                _emit("web_search", "done", {"sources_count": len(sources)})
                logger.info("Perplexity returned %d web sources", len(sources))
            else:
                _emit("web_search", "error", {"reason": "no results"})
                logger.warning("Perplexity returned no usable web context")

    # ── Phase 4: Inject current card if not already in results ────────────
    if cfg.inject_current_card and context and context.get('cardId'):
        current_note_id = str(context.get('noteId', context['cardId']))
        if current_note_id not in citations:
            _q = context.get('question') or context.get('frontField') or ''
            _a = context.get('answer') or ''
            _q_clean = re.sub(r'<[^>]+>', ' ', _q).strip()[:200]
            _a_clean = re.sub(r'<[^>]+>', ' ', _a).strip()[:200]
            _max_idx = max((c.get('index', 0) for c in citations.values()), default=0)
            _current_idx = _max_idx + 1
            citations[current_note_id] = {
                'noteId': context.get('noteId', context['cardId']),
                'cardId': context['cardId'],
                'question': _q_clean,
                'answer': _a_clean,
                'fields': context.get('fields', {}),
                'deckName': context.get('deckName', ''),
                'isCurrentCard': True,
                'sources': ['current'],
                'index': _current_idx,
            }
            context_string = (
                f"[{_current_idx}] (aktuelle Karte):\n"
                f"  Frage: {_q_clean}\n  Antwort: {_a_clean}\n\n"
                f"{context_string}"
            )

    # ── Phase 5: Build result ─────────────────────────────────────────────
    formatted_cards = [line for line in context_string.split("\n") if line.strip()]
    rag_context = {
        "cards": formatted_cards,
        "reasoning": _get('reasoning', ''),
        "citations": citations,
    }

    logger.debug("RAG pipeline: %d cards, %d citations",
                 len(formatted_cards), len(citations))

    return RagResult(
        rag_context=rag_context,
        citations=citations,
        cards_found=len(citations),
        retrieval_state=retrieval_state,
        keyword_hits=(retrieval_result or {}).get("keyword_count", 0),
        web_sources=web_context.get("sources", []) if web_context else [],
    )
