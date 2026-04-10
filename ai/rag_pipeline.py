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

    Defaults are conservative (no reranker, no min-indexed threshold) so
    lightweight agents opt in only to what they need. The Tutor agent is
    the full-featured path on main — it enables the reranker and the
    min_indexed_for_web=3 fallback. See TUTOR_RETRIEVAL in ai/agents.py.
    """
    # --- Retrieval defaults (used if routing_result omits them) ---
    retrieval_mode_default: str = 'both'
    search_scope_default: str = 'collection'
    max_sources_default: str = 'medium'
    kg_enrichment: bool = True

    # --- Reranker (LLM-based source filtering) ---
    # Off by default. Tutor sets this to True to match main's
    # retrieval_agents/tutor_retrieval.py behavior.
    reranker_enabled: bool = False
    use_resolved_intent_for_reranker: bool = True

    # --- Web fallback (Perplexity via backend /research) ---
    # Fires when retrieval reports confidence == 'low' OR, if
    # min_indexed_for_web > 0, when fewer than that many indexed cards
    # survived retrieval+reranker. Tutor sets min_indexed_for_web=3 to
    # match main's "<3 sources forces web" rule.
    web_fallback_enabled: bool = True
    min_indexed_for_web: int = 0  # 0 = disabled; Tutor = 3
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


def _log_state(state: str, status: str, **data) -> None:
    """Emit a structured pipeline-state log line.

    Every state transition in retrieve_rag_context() calls this so that
    INFO-level logs give a complete trace of the pipeline's decisions:
    which phase ran, which branch was taken, what each phase produced.
    Format is grep-friendly, e.g. ``[STATE S9 rag.retrieval] ENTER | ...``.

    Args:
        state: Short identifier like ``'S9 rag.retrieval'`` (S-number + dotted name).
        status: One of ENTER, EXIT, TRY, OK, SKIP, BRANCH, RESULT, WARN, FAIL.
        **data: Extra key/value pairs to append. Strings get repr'd so empty
            values and whitespace stay visible.
    """
    if data:
        kv = ' '.join(
            f"{k}={v!r}" if isinstance(v, str) else f"{k}={v}"
            for k, v in data.items()
        )
        logger.info("[STATE %s] %s | %s", state, status, kv)
    else:
        logger.info("[STATE %s] %s", state, status)


def _build_preloaded_context(preloaded_cards: List[dict]) -> tuple:
    """Convert caller-provided cards into the (context_string, citations) shape.

    Used by the Smart Search path: cards are already loaded by another pipeline
    (e.g. SearchCardsThread). Callers SHOULD pre-clean their cards (strip HTML
    and cloze syntax via utils/anki.py:strip_html_and_cloze) and provide both
    a question and an answer field. As a defensive fallback we strip cloze
    here too — leftover {{c1::...}} markup confuses the LLM and causes it to
    hallucinate citations.

    Notably we do NOT fall back the answer field to the deck name when answer
    is missing — that produced LERNMATERIAL like "[1] (deck) Q | deck" where
    every card looked identical to the LLM, leading to citation hallucination.
    A missing answer stays as an empty string; the LLM sees question only.
    """
    try:
        try:
            from ..utils.anki import strip_html_and_cloze
        except ImportError:
            from utils.anki import strip_html_and_cloze
    except ImportError:
        strip_html_and_cloze = lambda s: s  # noqa: E731 — graceful no-op fallback

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
        # Defensive cleaning: even if the caller pre-cleaned, double-stripping
        # is cheap and idempotent. Truncation widened to 400 chars to give the
        # LLM enough content per card to disambiguate citations.
        question = strip_html_and_cloze((card.get('question') or ''))[:400]
        answer_raw = card.get('answer') or card.get('back') or ''
        answer = strip_html_and_cloze(answer_raw)[:400] if answer_raw else ''
        deck = card.get('deck') or card.get('deckName') or ''
        # Format: [N] (deck) question | answer  — matching neo4j-kg's working format.
        # If answer is empty, omit the trailing pipe so the line doesn't look
        # like "[1] (deck) question | " which the LLM might parse as "no answer".
        if answer:
            context_lines.append(f'[{idx}] ({deck}) {question} | {answer}')
        else:
            context_lines.append(f'[{idx}] ({deck}) {question}')
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

    # ── S8 rag.parse_routing — entry ──────────────────────────────────────
    _log_state(
        'S8 rag.parse_routing', 'ENTER',
        user_message=(user_message or '')[:120],
        has_context=bool(context and (context.get('cardId')
                                      if isinstance(context, dict) else False)),
        card_id=(context.get('cardId') if isinstance(context, dict) else None),
        has_preloaded=preloaded_cards is not None,
        cfg_reranker_enabled=cfg.reranker_enabled,
        cfg_min_indexed_for_web=cfg.min_indexed_for_web,
        cfg_web_fallback_enabled=cfg.web_fallback_enabled,
        cfg_inject_current_card=cfg.inject_current_card,
    )

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
        _log_state('S8 rag.parse_routing', 'BRANCH', path='preloaded_cards',
                   count=len(preloaded_cards) if preloaded_cards else 0)
        context_string, citations = _build_preloaded_context(preloaded_cards)
        confidence = 'medium'
        if not context_string:
            _log_state('S8 rag.parse_routing', 'EXIT',
                       reason='preloaded_cards_produced_empty_context',
                       next='return empty RagResult')
            return RagResult(rag_context=None, citations={}, cards_found=0)
        _log_state('S8 rag.parse_routing', 'OK',
                   preloaded_citations=len(citations),
                   context_chars=len(context_string),
                   next='S10 rag.reranker')
    else:
        search_needed = _get('search_needed', False)
        if not search_needed:
            _log_state('S8 rag.parse_routing', 'EXIT',
                       reason='router_said_search_not_needed',
                       next='return empty RagResult')
            return RagResult(rag_context=None, citations={}, cards_found=0)

        retrieval_mode = _get('retrieval_mode', cfg.retrieval_mode_default) \
            or cfg.retrieval_mode_default
        search_scope = _get('search_scope', cfg.search_scope_default) \
            or cfg.search_scope_default
        max_sources_level = _get('max_sources', cfg.max_sources_default) \
            or cfg.max_sources_default
        max_notes = {"low": 10, "medium": 30, "high": 50}.get(max_sources_level, 30)

        # ── Router output (post-commit 74a7b5c simplification) ───────────
        # The router no longer returns precise_queries / broad_queries —
        # those fields were dropped to keep the prompt small. The only
        # query-shaped output we get is:
        #   - associated_terms : curated KG-grade domain terms (the
        #     primary signal — drives BOTH SQL lanes)
        #   - embedding_queries: semantic search candidates (passed to
        #     EnrichedRetrieval as additional embed inputs)
        #   - resolved_intent  : a natural-language restatement (last
        #     resort, useless for SQL but still fed to semantic search
        #     and the LLM)
        _raw_embedding = _get('embedding_queries', []) or []
        _raw_associated = _get('associated_terms', []) or []
        _raw_resolved = _get('resolved_intent', '') or ''

        embedding_queries = [q for q in _raw_embedding if q and q.strip()]
        associated_terms_list = [
            t for t in _raw_associated if t and isinstance(t, str) and t.strip()
        ]

        precise_queries = []
        broad_queries = []
        query_source = 'none'

        # Derive BOTH SQL lanes from associated_terms.
        #   - precise lane: each term as a single-quoted AND query
        #   - broad lane:   one OR-concat across all terms
        # Both go into the rag_pipeline → EnrichedRetrieval SQL search
        # so multi-lane agreement can lift the top RRF score above the
        # CONFIDENCE_LOW threshold (0.018).
        if associated_terms_list:
            precise_queries = ['"%s"' % t.strip() for t in associated_terms_list[:10]]
            or_query = ' OR '.join(
                '"%s"' % t.strip() for t in associated_terms_list[:10]
            )
            if or_query:
                broad_queries = [or_query]
            query_source = 'associated_terms→both_lanes'

        # Last-resort fallback if router returned no associated_terms
        if not precise_queries and not broad_queries:
            if _raw_resolved and _raw_resolved.strip():
                precise_queries = [_raw_resolved.strip()]
                query_source = 'fallback:resolved_intent'
            elif user_message and user_message.strip():
                precise_queries = [user_message.strip()]
                query_source = 'fallback:user_message'

        _log_state(
            'S8 rag.parse_routing', 'RESULT',
            retrieval_mode=retrieval_mode,
            search_scope=search_scope,
            max_notes=max_notes,
            query_source=query_source,
            precise_queries=precise_queries[:5],
            broad_queries=broad_queries[:5],
            embedding_queries=embedding_queries[:5],
            associated_terms=associated_terms_list[:10],
            resolved_intent=_raw_resolved[:100],
        )

        if not precise_queries and not broad_queries:
            _log_state('S8 rag.parse_routing', 'EXIT',
                       reason='no_queries_available',
                       next='return empty RagResult')
            return RagResult(rag_context=None, citations={}, cards_found=0)

        # ── S9 rag.retrieval — entry ──────────────────────────────────────
        _log_state('S9 rag.retrieval', 'ENTER',
                   embedding_manager=bool(embedding_manager),
                   mode=retrieval_mode,
                   kg_enrichment=cfg.kg_enrichment)

        if embedding_manager and retrieval_mode in ('semantic', 'both'):
            if cfg.kg_enrichment:
                _log_state('S9 rag.retrieval', 'TRY', retriever='EnrichedRetrieval')
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
                    _cc = retrieval_result.get('citations', {}) if retrieval_result else {}
                    _log_state('S9 rag.retrieval', 'OK', retriever='EnrichedRetrieval',
                               citations=len(_cc),
                               confidence=(retrieval_result or {}).get('confidence', 'medium'),
                               keyword_hits=(retrieval_result or {}).get('keyword_count', 0))
                except Exception as e:
                    _log_state('S9 rag.retrieval', 'FAIL',
                               retriever='EnrichedRetrieval', error=str(e)[:200])
                    retrieval_result = None

            if retrieval_result is None:
                _log_state('S9 rag.retrieval', 'TRY', retriever='HybridRetrieval')
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
                    _cc = retrieval_result.get('citations', {}) if retrieval_result else {}
                    _log_state('S9 rag.retrieval', 'OK', retriever='HybridRetrieval',
                               citations=len(_cc),
                               confidence=(retrieval_result or {}).get('confidence', 'medium'),
                               keyword_hits=(retrieval_result or {}).get('keyword_count', 0))
                except Exception as e2:
                    _log_state('S9 rag.retrieval', 'FAIL',
                               retriever='HybridRetrieval', error=str(e2)[:200])
                    retrieval_result = None

        if retrieval_result is None and rag_retrieve_fn:
            _log_state('S9 rag.retrieval', 'TRY', retriever='SQL_only_fallback')
            try:
                retrieval_result = rag_retrieve_fn(
                    precise_queries=precise_queries,
                    broad_queries=broad_queries,
                    search_scope=search_scope,
                    context=context,
                    max_notes=max_notes,
                )
                _cc = retrieval_result.get('citations', {}) if retrieval_result else {}
                _log_state('S9 rag.retrieval', 'OK', retriever='SQL_only_fallback',
                           citations=len(_cc),
                           confidence=(retrieval_result or {}).get('confidence', 'medium'))
            except Exception as e:
                _log_state('S9 rag.retrieval', 'FAIL',
                           retriever='SQL_only_fallback', error=str(e)[:200])
                _log_state('S9 rag.retrieval', 'EXIT',
                           reason='all_retrievers_failed',
                           next='return empty RagResult')
                return RagResult(rag_context=None, citations={}, cards_found=0,
                                 retrieval_state=retrieval_state)

        if not retrieval_result or not retrieval_result.get("context_string"):
            _log_state('S9 rag.retrieval', 'EXIT',
                       reason='empty_context_string',
                       retrieval_result_present=bool(retrieval_result),
                       keyword_hits=(retrieval_result or {}).get('keyword_count', 0),
                       next='return empty RagResult')
            return RagResult(rag_context=None, citations={}, cards_found=0,
                             retrieval_state=retrieval_state)

        context_string = retrieval_result["context_string"]
        citations = retrieval_result.get("citations", {})
        confidence = retrieval_result.get("confidence", "medium")

        # Log top 5 retrieved cards so we can see what went into the reranker
        _indexed_top = sorted(
            [c for c in citations.values() if c.get('index')],
            key=lambda c: c.get('index', 999),
        )[:5]
        for _c in _indexed_top:
            _front = (_c.get('question') or _c.get('front') or '')[:80]
            _log_state('S9 rag.retrieval', 'RESULT',
                       idx=_c.get('index'),
                       deck=_c.get('deckName', '')[:40],
                       front=_front)
        _log_state('S9 rag.retrieval', 'EXIT',
                   citations=len(citations),
                   context_chars=len(context_string),
                   confidence=confidence,
                   next='S10 rag.reranker')

    # ── S10 rag.reranker — Phase 2: LLM source filter ─────────────────────
    if not cfg.reranker_enabled:
        _log_state('S10 rag.reranker', 'SKIP', reason='disabled_in_config',
                   next='S11 rag.web_fallback')
    else:
        _prelim_lines = context_string.split('\n') if context_string else []
        _numbered = [l for l in _prelim_lines if l.strip().startswith('[')]
        _log_state('S10 rag.reranker', 'ENTER',
                   input_sources=len(_numbered), confidence=confidence)
        try:
            try:
                from .reranker import rerank_sources
            except ImportError:
                from reranker import rerank_sources

            if not _numbered:
                _log_state('S10 rag.reranker', 'SKIP',
                           reason='no_numbered_context_lines',
                           next='S11 rag.web_fallback')
            elif confidence == 'low':
                _log_state('S10 rag.reranker', 'SKIP',
                           reason='confidence_already_low',
                           next='S11 rag.web_fallback')
            else:
                _emit("reranker", "running", {"sources": len(_numbered)})
                _rerank_question = user_message
                if cfg.use_resolved_intent_for_reranker:
                    _resolved = _get('resolved_intent', '') or ''
                    if _resolved.strip():
                        _rerank_question = _resolved.strip()
                _log_state('S10 rag.reranker', 'TRY',
                           question=_rerank_question[:120],
                           sources=len(_numbered))

                rerank_result = rerank_sources(
                    question=_rerank_question,
                    context_lines=_numbered,
                    min_confidence=confidence,
                    emit_step=_emit,
                )
                _log_state('S10 rag.reranker', 'RESULT',
                           reranked=rerank_result.get('reranked'),
                           relevant_indices=rerank_result.get('relevant_indices'),
                           web_search_recommended=rerank_result.get('web_search'))

                if rerank_result.get("reranked"):
                    relevant_indices = set(rerank_result.get("relevant_indices", []))
                    _rejected = []
                    for note_id, cdata in list(citations.items()):
                        idx = cdata.get('index')
                        if idx and idx not in relevant_indices:
                            _rejected.append(idx)
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
                    _log_state('S10 rag.reranker', 'OK',
                               kept=len(relevant_lines), rejected=len(_rejected),
                               rejected_idx=sorted(_rejected)[:10],
                               renumbered_to=list(range(1, _new_idx)))

                    if rerank_result.get("web_search"):
                        confidence = "low"
                        _log_state('S10 rag.reranker', 'BRANCH',
                                   reason='reranker_recommends_web',
                                   new_confidence='low')
                    elif not relevant_indices:
                        confidence = "low"
                        _log_state('S10 rag.reranker', 'BRANCH',
                                   reason='reranker_kept_0_sources',
                                   new_confidence='low')
                else:
                    _log_state('S10 rag.reranker', 'SKIP',
                               reason='reranker_returned_reranked_false')
        except Exception as e:
            _log_state('S10 rag.reranker', 'FAIL', error=str(e)[:200],
                       next='continue without reranker')
        _log_state('S10 rag.reranker', 'EXIT',
                   citations_indexed=sum(1 for c in citations.values() if c.get('index')),
                   context_chars=len(context_string),
                   confidence=confidence, next='S11 rag.web_fallback')

    # ── S11 rag.web_fallback — Phase 3: Perplexity backup ─────────────────
    # Fires when retrieval reports confidence == 'low' OR, if the agent
    # sets cfg.min_indexed_for_web > 0, when too few indexed sources
    # survived retrieval+reranker. Tutor uses the threshold to match main's
    # old per-agent pipeline's "<3 sources forces web" rule.
    web_context = None
    if not cfg.web_fallback_enabled:
        _log_state('S11 rag.web_fallback', 'SKIP', reason='disabled_in_config',
                   next='S12 rag.inject_current_card')
    else:
        indexed_count = sum(1 for c in citations.values() if c.get('index'))
        _log_state('S11 rag.web_fallback', 'ENTER',
                   confidence=confidence,
                   indexed_count=indexed_count,
                   min_indexed_for_web=cfg.min_indexed_for_web)

        # Threshold check — can escalate medium → low
        if cfg.min_indexed_for_web and confidence != "low":
            if indexed_count < cfg.min_indexed_for_web:
                _log_state('S11 rag.web_fallback', 'BRANCH',
                           reason='indexed_below_threshold',
                           indexed=indexed_count,
                           threshold=cfg.min_indexed_for_web,
                           action='force_confidence=low')
                confidence = "low"
            else:
                _log_state('S11 rag.web_fallback', 'OK',
                           reason='indexed_meets_threshold',
                           indexed=indexed_count,
                           threshold=cfg.min_indexed_for_web)

        if confidence == "low":
            _web_query = user_message
            _web_query_source = 'user_message'
            if cfg.use_resolved_intent_for_web:
                _resolved = (_get('resolved_intent', '') or '').strip()
                if _resolved:
                    _web_query = _resolved
                    _web_query_source = 'resolved_intent'
            _log_state('S11 rag.web_fallback', 'TRY',
                       provider='perplexity',
                       web_query=_web_query[:120],
                       web_query_source=_web_query_source)
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
                _log_state('S11 rag.web_fallback', 'OK',
                           provider='perplexity',
                           web_sources=len(sources),
                           web_text_chars=len(web_context.get('text', '')),
                           web_indices_assigned=[_max_idx + i + 1 for i in range(len(sources))])
                for _i, _s in enumerate(sources[:5]):
                    _domain = ''
                    _url = _s.get('url', '') or ''
                    if _url.count('/') >= 2:
                        _domain = _url.split('/')[2]
                    _log_state('S11 rag.web_fallback', 'RESULT',
                               web_idx=_max_idx + _i + 1,
                               title=(_s.get('title') or '')[:80],
                               domain=_domain)
            else:
                _emit("web_search", "error", {"reason": "no results"})
                _log_state('S11 rag.web_fallback', 'FAIL',
                           reason='perplexity_returned_no_usable_text')
        else:
            _log_state('S11 rag.web_fallback', 'SKIP',
                       reason='confidence_not_low',
                       confidence=confidence,
                       next='S12 rag.inject_current_card')
        _log_state('S11 rag.web_fallback', 'EXIT',
                   web_context_present=bool(web_context),
                   total_citations=len(citations),
                   context_chars=len(context_string),
                   next='S12 rag.inject_current_card')

    # ── S12 rag.inject_current_card — Phase 4 ─────────────────────────────
    if not cfg.inject_current_card:
        _log_state('S12 rag.inject_current_card', 'SKIP',
                   reason='disabled_in_config', next='S13 rag.build_result')
    elif not (context and context.get('cardId')):
        _log_state('S12 rag.inject_current_card', 'SKIP',
                   reason='no_current_card_context', next='S13 rag.build_result')
    else:
        current_note_id = str(context.get('noteId', context['cardId']))
        if current_note_id in citations:
            _log_state('S12 rag.inject_current_card', 'SKIP',
                       reason='current_card_already_in_results',
                       note_id=current_note_id, next='S13 rag.build_result')
        else:
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
            _log_state('S12 rag.inject_current_card', 'OK',
                       injected_at_index=_current_idx,
                       card_id=context['cardId'],
                       front=_q_clean[:80],
                       next='S13 rag.build_result')

    # ── S13 rag.build_result — Phase 5 ────────────────────────────────────
    formatted_cards = [line for line in context_string.split("\n") if line.strip()]
    rag_context = {
        "cards": formatted_cards,
        "reasoning": _get('reasoning', ''),
        "citations": citations,
    }

    _card_cites = sum(1 for c in citations.values() if c.get('type') != 'web')
    _web_cites = sum(1 for c in citations.values() if c.get('type') == 'web')
    _current_marked = sum(1 for c in citations.values() if c.get('isCurrentCard'))
    _indexed = sum(1 for c in citations.values() if c.get('index'))
    _log_state('S13 rag.build_result', 'RESULT',
               formatted_lines=len(formatted_cards),
               total_citations=len(citations),
               card_citations=_card_cites,
               web_citations=_web_cites,
               current_card=_current_marked,
               indexed=_indexed,
               context_chars=len(context_string))
    # Dump the first 12 LERNMATERIAL lines so the LLM input is visible
    for _i, _line in enumerate(formatted_cards[:12]):
        logger.info("[STATE S13 rag.build_result] CTX[%02d] %s", _i, _line[:160])
    if len(formatted_cards) > 12:
        logger.info("[STATE S13 rag.build_result] CTX (+%d more lines)",
                    len(formatted_cards) - 12)
    _log_state('S13 rag.build_result', 'EXIT',
               cards_found=len(citations),
               next='return to run_tutor (S14)')

    return RagResult(
        rag_context=rag_context,
        citations=citations,
        cards_found=len(citations),
        retrieval_state=retrieval_state,
        keyword_hits=(retrieval_result or {}).get("keyword_count", 0),
        web_sources=web_context.get("sources", []) if web_context else [],
    )
