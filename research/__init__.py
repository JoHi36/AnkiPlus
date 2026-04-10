"""Research Agent — DEPRECATED as standalone chat agent.

In the Agent-Kanal-Paradigma, the Stapel channel (SearchCardsThread + Clustering
+ KG + Canvas + Quick Answer) IS the Research Agent. This run_research() function
was used for @Research mentions in chat, which no longer exist.

The Stapel pipeline lives in:
- ui/widget.py: SearchCardsThread (graph search, clustering)
- ui/widget.py: KGDefinitionThread (term definitions)
- ui/widget.py: QuickAnswerThread (LLM text generation)
- frontend/src/hooks/useSmartSearch.js (frontend orchestration)

This file is kept for backwards compatibility only.
"""
try:
    from ..utils.logging import get_logger
    from ..config import get_config
    from ..ai.citation_builder import CitationBuilder
except ImportError:
    from utils.logging import get_logger
    from config import get_config
    from ai.citation_builder import CitationBuilder

logger = get_logger(__name__)

# Research system prompt — loaded from TypeScript source or fallback
_RESEARCH_PROMPT_CACHE = None

def _get_research_prompt():
    """Load Research Agent prompt. Cached after first call."""
    global _RESEARCH_PROMPT_CACHE
    if _RESEARCH_PROMPT_CACHE:
        return _RESEARCH_PROMPT_CACHE

    # Try loading from TypeScript source
    import os, re
    prompt_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                               'functions', 'src', 'prompts', 'research.ts')
    try:
        with open(prompt_path, 'r', encoding='utf-8') as f:
            content = f.read()
        match = re.search(r'RESEARCH_PROMPT\s*=\s*`(.*?)`', content, re.DOTALL)
        if match:
            _RESEARCH_PROMPT_CACHE = match.group(1).replace('\\`', '`')
            return _RESEARCH_PROMPT_CACHE
    except (OSError, IOError):
        pass

    # Fallback
    _RESEARCH_PROMPT_CACHE = (
        "Du bist ein Wissens-Agent. Beantworte Fragen präzise auf Basis des Lernmaterials. "
        "Inline-Referenzen [1], [2] für Fakten aus Karten. Sachlich, keine Floskeln."
    )
    return _RESEARCH_PROMPT_CACHE


def run_research(situation: str = '', emit_step=None, memory=None,
                 stream_callback=None, citation_builder=None, **kwargs) -> dict:
    """Research agent entry point.

    Pipeline:
    1. Local: find cards via smart_search_context (pre-loaded) or RAG retrieval
    2. Transport: cards sent as rag_context={"cards": [...]} → backend "insights"
    3. Backend: generates answer with Research prompt + our cards

    Returns:
        dict with 'text', 'citations', '_used_streaming'.
    """
    # ── [STATE R10 research.entry] ───────────────────────────────────
    try:
        from ai.rag_pipeline import _log_state as _log_state_rag
    except ImportError:
        try:
            from ..ai.rag_pipeline import _log_state as _log_state_rag
        except ImportError:
            from rag_pipeline import _log_state as _log_state_rag

    query = situation or kwargs.get('query', '')
    if not query:
        _log_state_rag('R10 research.entry', 'BRANCH',
                       reason='empty_query', action='return_empty')
        return {'text': '', 'citations': [], '_used_streaming': False}

    if citation_builder is None:
        citation_builder = CitationBuilder()

    config = kwargs.get('config') or get_config()
    context = kwargs.get('context')
    routing_result = kwargs.get('routing_result')
    model = kwargs.get('model', 'gemini-3-flash-preview')
    fallback_model = kwargs.get('fallback_model', 'gemini-2.5-flash')
    callback = kwargs.get('callback')
    rag_retrieve_fn = kwargs.get('rag_retrieve_fn')
    # ── Bug A fix: handler.dispatch_smart_search never injects
    # rag_retrieve_fn into agent_kwargs, so without this fallback the
    # entire SQL search lane silently returns {} (see ai/retrieval.py:851).
    # Tutor builds the same fallback at ai/tutor.py:206-207.
    if rag_retrieve_fn is None:
        try:
            from ai.tutor import _make_default_rag_retrieve_fn
        except ImportError:
            try:
                from ..ai.tutor import _make_default_rag_retrieve_fn
            except ImportError:
                _make_default_rag_retrieve_fn = None
        if _make_default_rag_retrieve_fn:
            rag_retrieve_fn = _make_default_rag_retrieve_fn()
    embedding_manager = kwargs.get('embedding_manager')
    smart_search_context = kwargs.get('smart_search_context')

    _log_state_rag('R10 research.entry', 'ENTER',
                   query=query[:200], query_len=len(query),
                   has_smart_search=bool(smart_search_context),
                   has_routing_result=bool(routing_result),
                   has_embedding_manager=bool(embedding_manager),
                   model=model, fallback_model=fallback_model,
                   smart_search_cards=(
                       len((smart_search_context or {}).get('cards_data', []))
                       if smart_search_context else 0))

    logger.info("Research Agent: query='%s'", query[:80])

    # ── TEST MODE: bypass SearchCardsThread prefetch ────────────────────
    # The prefetched 50 cards from SearchCardsThread are designed to feed
    # the parallel cluster-labels call, NOT the answer LLM. Their semantic
    # match is loose ("any heart card") which is why the answer LLM picks
    # [1] arbitrarily and slaps it on training-data prose. Let Research run
    # its OWN unified pipeline retrieval — same path Tutor uses — by
    # dropping smart_search_context and synthesizing a routing_result.
    _had_smart_search = bool(smart_search_context)
    smart_search_context = None
    _log_state_rag('R10 research.entry', 'BRANCH',
                   action='ignore_smart_search_context_use_unified_pipeline',
                   had_smart_search=_had_smart_search)

    if not routing_result:
        try:
            from ai.rag_analyzer import analyze_query as _analyze_query
        except ImportError:
            try:
                from ..ai.rag_analyzer import analyze_query as _analyze_query
            except ImportError:
                from rag_analyzer import analyze_query as _analyze_query
        _log_state_rag('R10.5 research.analyze_query', 'TRY',
                       user_message=query[:200])
        try:
            routing_result = _analyze_query(
                user_message=query,
                card_context=context,
                chat_history=None,
            )
            _log_state_rag(
                'R10.5 research.analyze_query', 'OK',
                search_needed=getattr(routing_result, 'search_needed', None),
                resolved_intent=getattr(routing_result, 'resolved_intent', None),
                precise_queries=getattr(routing_result, 'precise_queries', None),
                broad_queries=getattr(routing_result, 'broad_queries', None),
                associated_terms=getattr(routing_result, 'associated_terms', None),
            )
        except Exception as _ae:
            _log_state_rag('R10.5 research.analyze_query', 'FAIL',
                           error=str(_ae)[:200])
            logger.warning("Research analyze_query failed: %s", _ae)
            routing_result = None

    # ------------------------------------------------------------------
    # 1. Find cards via the unified RAG pipeline
    # ------------------------------------------------------------------
    # Two paths into the pipeline:
    #   - Smart Search: cards pre-loaded by SearchCardsThread, passed via
    #     preloaded_cards (RESEARCH_RETRIEVAL has accept_preloaded_cards=True).
    #   - Normal: routing_result drives the full retrieval phase.
    # In both cases the unified pipeline runs the reranker and (optionally)
    # web fallback, so this file no longer duplicates that logic.
    try:
        from ai.rag_pipeline import retrieve_rag_context
        from ai.agents import RESEARCH_RETRIEVAL
    except ImportError:
        try:
            from ..ai.rag_pipeline import retrieve_rag_context
            from ..ai.agents import RESEARCH_RETRIEVAL
        except ImportError:
            from rag_pipeline import retrieve_rag_context
            from agents import RESEARCH_RETRIEVAL

    rag_result = None

    if smart_search_context:
        _log_state_rag('R11 research.enrich_snippets', 'ENTER',
                       cards_in_smart_search=len(smart_search_context.get('cards_data', []) or []))
        # Re-fetch full card content via fetch_card_snippets — SearchCardsThread
        # only stores a 80-char front-field snippet with cloze syntax intact and
        # no answer field at all, which is too thin for the LLM to disambiguate
        # cards. We use the pipeline_blocks helper to get cleaned full
        # question + answer for each card, marshalled to the main thread.
        # run_research is invoked from SmartSearchAgentThread (a QThread), so
        # fetch_card_snippets's main-thread marshalling works correctly.
        try:
            from ai.pipeline_blocks import fetch_card_snippets
        except ImportError:
            try:
                from ..ai.pipeline_blocks import fetch_card_snippets
            except ImportError:
                from pipeline_blocks import fetch_card_snippets

        cards = smart_search_context.get('cards_data', []) or []
        # Extract integer card IDs in original order (which is similarity-ranked)
        card_ids = []
        for card in cards[:50]:
            cid = card.get('id') or card.get('card_id') or card.get('cardId') or 0
            try:
                card_ids.append(int(cid))
            except (ValueError, TypeError):
                continue

        # Get cleaned full content (cloze stripped, longer truncation than the
        # SearchCardsThread snippet)
        snippets = fetch_card_snippets(card_ids, max_field_len=400)

        preloaded = []
        for s in snippets:
            preloaded.append({
                'id': s.get('cardId'),
                'question': s.get('question', ''),
                'answer': s.get('answer', ''),  # real back side, not deck-name fallback
                'deck': s.get('deckName', ''),
            })
        # R11.1 — first 5 enriched snippets so we can verify card_id ↔ content
        # alignment (catches fetch_card_snippets returning wrong order or
        # silently dropping cards).
        _preview_snippets = [
            (p.get('id'),
             (p.get('deck', '') or '')[:24],
             (p.get('question', '') or '')[:60])
            for p in preloaded[:5]
        ]
        _log_state_rag('R11 research.enrich_snippets', 'PREVIEW',
                       first_5=_preview_snippets)
        _log_state_rag('R11 research.enrich_snippets', 'EXIT',
                       card_ids_extracted=len(card_ids),
                       snippets_returned=len(snippets),
                       preloaded_count=len(preloaded),
                       next='R12 research.retrieve')
        logger.info(
            "Research: %d cards from smart_search → enriched to %d snippets → unified pipeline",
            len(card_ids), len(preloaded),
        )
        _log_state_rag('R12 research.retrieve', 'TRY',
                       path='smart_search', preloaded_cards=len(preloaded))
        try:
            rag_result = retrieve_rag_context(
                user_message=query,
                context=context,
                config=config,
                routing_result=None,
                retrieval_config=RESEARCH_RETRIEVAL,
                preloaded_cards=preloaded,
                emit_step=emit_step,
                embedding_manager=embedding_manager,
            )
            _log_state_rag('R12 research.retrieve', 'OK',
                           rag_result_present=rag_result is not None,
                           citations=(len(rag_result.citations) if rag_result and rag_result.citations else 0))
        except Exception as e:
            _log_state_rag('R12 research.retrieve', 'FAIL',
                           error=str(e)[:200], path='smart_search')
            logger.warning("Research smart_search pipeline failed: %s", e)
    else:
        # Normal path: routing_result drives retrieval
        if routing_result and (
            getattr(routing_result, 'search_needed', True)
            or (isinstance(routing_result, dict) and routing_result.get('search_needed', True))
        ):
            _log_state_rag('R12 research.retrieve', 'TRY',
                           path='normal', has_routing_result=True)
            try:
                rag_result = retrieve_rag_context(
                    user_message=query,
                    context=context,
                    config=config,
                    routing_result=routing_result,
                    retrieval_config=RESEARCH_RETRIEVAL,
                    emit_step=emit_step,
                    rag_retrieve_fn=rag_retrieve_fn,
                    embedding_manager=embedding_manager,
                )
                _log_state_rag('R12 research.retrieve', 'OK',
                               rag_result_present=rag_result is not None,
                               citations=(len(rag_result.citations) if rag_result and rag_result.citations else 0))
            except Exception as e:
                _log_state_rag('R12 research.retrieve', 'FAIL',
                               error=str(e)[:200], path='normal')
                logger.warning("Research RAG failed: %s", e)
        else:
            _log_state_rag('R12 research.retrieve', 'SKIP',
                           reason='no_smart_search_no_routing_result')

    # ------------------------------------------------------------------
    # 2. Extract reranked card lines + populate CitationBuilder from result
    # ------------------------------------------------------------------
    # The unified pipeline already reranked, renumbered, and (if needed)
    # added web sources. We translate its citations dict into the
    # CitationBuilder so the frontend gets the right [N] chips.
    _log_state_rag('R13 research.build_context', 'ENTER',
                   rag_result_present=rag_result is not None)
    cards_for_backend = []
    if rag_result and rag_result.rag_context:
        cards_for_backend = rag_result.rag_context.get('cards', []) or []

        if rag_result.citations:
            # R13.2 — drop count: how many citations had no `index` and got
            # silently filtered out by the truthy check below. If this is
            # non-zero, the LLM's [N] no longer matches the frontend's [N].
            _all_cits = list(rag_result.citations.values())
            _with_index = [c for c in _all_cits if c.get('index')]
            _log_state_rag('R13 research.build_context', 'DROP_CHECK',
                           rag_citations_total=len(_all_cits),
                           with_index=len(_with_index),
                           dropped_no_index=len(_all_cits) - len(_with_index))
            # Sort by [N] index for deterministic ordering
            sorted_cits = sorted(
                (c for c in rag_result.citations.values() if c.get('index')),
                key=lambda c: c.get('index', 0),
            )
            # R13.1 — builder map: log every (rag_index, type, cardId, front[:60])
            # tuple as it goes into citation_builder. The frontend will see these
            # in this exact order, renumbered sequentially starting at [1].
            _builder_map = []
            for cit in sorted_cits:
                if cit.get('type') == 'web':
                    citation_builder.add_web(
                        url=cit.get('url', ''),
                        title=cit.get('title', ''),
                        domain=cit.get('domain', ''),
                    )
                    _builder_map.append((cit.get('index'), 'web',
                                         (cit.get('url') or '')[:60]))
                else:
                    card_id = cit.get('cardId') or cit.get('id') or cit.get('noteId') or 0
                    note_id = cit.get('noteId') or card_id
                    try:
                        card_id_int = int(card_id) if card_id else 0
                        note_id_int = int(note_id) if note_id else 0
                    except (ValueError, TypeError):
                        card_id_int = 0
                        note_id_int = 0
                    citation_builder.add_card(
                        card_id=card_id_int,
                        note_id=note_id_int,
                        deck_name=cit.get('deckName', ''),
                        front=(cit.get('question') or cit.get('front') or '')[:200],
                        back=(cit.get('answer') or cit.get('back') or '')[:200],
                        sources=cit.get('sources') or ['research'],
                    )
                    _builder_map.append((
                        cit.get('index'),
                        card_id_int,
                        (cit.get('question') or cit.get('front') or '')[:60],
                    ))
            # Log first 15 to keep the line readable; if drift happens after [15]
            # we'll still see it via R14 cites_used cross-reference.
            _log_state_rag('R13 research.build_context', 'BUILDER_MAP',
                           total_added=len(_builder_map),
                           first_15=_builder_map[:15])

    _final_citations_preview = citation_builder.build()
    _log_state_rag('R13 research.build_context', 'EXIT',
                   cards_for_backend=len(cards_for_backend),
                   citation_builder_count=len(_final_citations_preview),
                   next='R14 research.llm_call')

    if emit_step:
        emit_step("sources_ready", "done", {"citations": _final_citations_preview})

    # ------------------------------------------------------------------
    # 2. Send to backend: cards as insights + Research prompt
    # ------------------------------------------------------------------
    system_prompt = _get_research_prompt()

    # Transport cards via rag_context → _build_chat_payload extracts as "insights"
    rag_context = {"cards": cards_for_backend} if cards_for_backend else None

    _log_state_rag('R14 research.llm_call', 'ENTER',
                   model=model, fallback_model=fallback_model,
                   has_rag_context=rag_context is not None,
                   rag_cards=(len(cards_for_backend) if cards_for_backend else 0))

    try:
        try:
            from ..ai.gemini import get_google_response_streaming
        except ImportError:
            from ai.gemini import get_google_response_streaming

        text = ''
        used_streaming = False

        def _stream_wrapper(chunk, done, is_function_call=False, **_kw):
            nonlocal text, used_streaming
            if chunk:
                text += chunk
                used_streaming = True
            if stream_callback:
                stream_callback(chunk, done)
            if callback:
                callback(chunk, done, is_function_call)

        get_google_response_streaming(
            user_message=query,
            model=model,
            api_key='',
            context=None,
            history=[],
            mode='compact',
            callback=_stream_wrapper,
            rag_context=rag_context,
            system_prompt_override=system_prompt,
            config=config,
            agent='research',
        )

        _log_state_rag('R14 research.llm_call', 'OK',
                       model=model, text_chars=len(text),
                       used_streaming=used_streaming)
        # Dump the actual answer so we can diagnose "wrong information" cases.
        # 800 chars covers the prompt's "5-8 lines max" guidance with headroom.
        _log_state_rag('R14 research.llm_call', 'TEXT',
                       text_preview=text[:800])
        # R14.1 — extract every [N] reference the LLM actually wrote, in order.
        # Cross-reference against R13 BUILDER_MAP first_15 to detect drift:
        # if the LLM cites [3] but the builder put a different card at index 3,
        # the user sees a mismatched chip.
        try:
            import re as _re_cite
            _cites_in_text = _re_cite.findall(r'\[(\d+)\]', text or '')
            _cite_int_list = [int(c) for c in _cites_in_text]
            _unique_cites = sorted(set(_cite_int_list))
            _log_state_rag('R14 research.llm_call', 'CITES_USED',
                           total_cite_marks=len(_cite_int_list),
                           unique_indices=_unique_cites,
                           in_order=_cite_int_list[:30])
        except Exception as _ce:
            _log_state_rag('R14 research.llm_call', 'CITES_USED',
                           parse_error=str(_ce)[:120])
        _log_state_rag('R17 research.return', 'EXIT',
                       text_chars=len(text),
                       citations=len(citation_builder.build()),
                       used_streaming=used_streaming,
                       path='primary')
        return {
            'text': text,
            'citations': citation_builder.build(),
            '_used_streaming': used_streaming,
        }

    except Exception as e:
        _log_state_rag('R14 research.llm_call', 'FAIL',
                       model=model, error=str(e)[:300])
        logger.error("Research generation failed: %s", e)

        # Fallback with simpler model
        _log_state_rag('R15 research.fallback', 'TRY',
                       fallback_model=fallback_model)
        try:
            text = ''
            def _fb(chunk, done, is_fc=False, **_kw):
                nonlocal text
                if chunk:
                    text += chunk

            get_google_response_streaming(
                user_message=query,
                model=fallback_model,
                api_key='',
                callback=_fb,
                rag_context=rag_context,
                system_prompt_override=system_prompt,
                config=config,
                agent='research',
            )
            _log_state_rag('R15 research.fallback', 'OK',
                           fallback_model=fallback_model, text_chars=len(text))
            _log_state_rag('R17 research.return', 'EXIT',
                           text_chars=len(text),
                           citations=len(citation_builder.build()),
                           used_streaming=True, path='fallback')
            return {'text': text, 'citations': citation_builder.build(), '_used_streaming': True}
        except Exception as e2:
            _log_state_rag('R15 research.fallback', 'FAIL',
                           fallback_model=fallback_model, error=str(e2)[:300])
            _log_state_rag('R17 research.return', 'EXIT',
                           text_chars=0, citations=0,
                           used_streaming=False, path='all_failed')
            logger.error("Research fallback also failed: %s", e2)
            return {'text': '', 'citations': [], '_used_streaming': False, 'error': str(e2)}
