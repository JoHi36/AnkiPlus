"""
Hybrid Retrieval: SQL + Semantic search orchestrated by router decision.
Merges results from both retrieval paths, prioritizing cards found by both.
"""
import re

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)


class RetrievalState:
    """Shared mutable state between retrieval and pipeline.

    HybridRetrieval modifies these during execution:
    - fallback_in_progress: suppresses duplicate pipeline events during retry
    - step_labels: accumulates step labels, truncated before retry
    - request_steps: collects emitted AI state steps (for query hit parsing)
    """
    def __init__(self):
        self.fallback_in_progress = False
        self.step_labels = []
        self.request_steps = []


class HybridRetrieval:
    def __init__(self, embedding_manager, emit_step=None, rag_retrieve_fn=None, state=None):
        self.emb = embedding_manager
        self.emit_step = emit_step or (lambda step, status, data=None: None)
        self.rag_retrieve_fn = rag_retrieve_fn
        self.state = state or RetrievalState()

    def retrieve(self, user_message, router_result, context=None, max_notes=30):
        """
        Execute retrieval based on router decision.

        Args:
            user_message: User's question
            router_result: Dict from _rag_router() with intent, search_needed, queries, retrieval_mode
            context: Current card context dict
            max_notes: Max cards to return (default 30, model filters relevance)

        Returns:
            {context_string: str, citations: dict} — same format as _rag_retrieve_cards()
        """
        if not router_result.get('search_needed', False):
            return {"context_string": "", "citations": {}}

        mode = router_result.get('retrieval_mode', 'both')
        sql_citations = {}
        semantic_results = []
        sql_total = 0
        semantic_total = 0

        # SQL retrieval
        if mode in ('sql', 'both'):
            try:
                # Pre-fill queries from router result so UI shows them immediately
                all_queries = (router_result.get('precise_queries', []) +
                               router_result.get('broad_queries', []))
                preview_queries = [{"text": q, "hits": None} for q in all_queries if q]
                self.emit_step("sql_search", "active", {
                    "queries": preview_queries
                })
                sql_data = self.rag_retrieve_fn(
                    precise_queries=router_result.get('precise_queries'),
                    broad_queries=router_result.get('broad_queries'),
                    search_scope=router_result.get('search_scope', 'current_deck'),
                    context=context,
                    max_notes=max_notes,
                    suppress_event=True,
                )
                sql_citations = sql_data.get('citations', {})
                sql_total = len(sql_citations)

                # Build query result data for UI from the original queries
                query_data = [{"text": q, "hits": None} for q in all_queries if q]
                self.emit_step("sql_search", "done", {
                    "queries": query_data,
                    "total_hits": sql_total
                })
            except Exception as e:
                logger.warning("HybridRetrieval: SQL retrieval failed: %s", e)
                self.emit_step("sql_search", "error", {"message": str(e)})

        # KG retrieval — Knowledge Graph term expansion (free, local)
        kg_card_ids = []
        kg_terms_found = []
        if mode in ('sql', 'both', 'semantic'):
            try:
                self.emit_step("kg_search", "active", {"terms": []})
                kg_card_ids, kg_terms_found = self._kg_retrieve(user_message, router_result)
                self.emit_step("kg_search", "done", {
                    "terms": kg_terms_found[:8],
                    "total_hits": len(kg_card_ids),
                })
            except Exception as e:
                logger.warning("HybridRetrieval: KG retrieval failed: %s", e)
                self.emit_step("kg_search", "error", {"message": str(e)})

        # Semantic retrieval — use embedding_queries (multi-query) from router
        if mode in ('semantic', 'both') and self.emb:
            try:
                # Support multi-query: embedding_queries (array) or legacy embedding_query (string)
                embedding_queries = router_result.get('embedding_queries', [])
                if not embedding_queries:
                    legacy = router_result.get('embedding_query', user_message)
                    embedding_queries = [legacy] if legacy else [user_message]
                embedding_queries = [q for q in embedding_queries if q and q.strip()][:3]

                # Pre-fill embedding queries so UI shows them immediately
                preview_chunks = [{"score": None, "snippet": eq} for eq in embedding_queries]
                self.emit_step("semantic_search", "active", {
                    "chunks": preview_chunks,
                    "embedding_queries": embedding_queries
                })

                exclude = []
                if context and context.get('cardId'):
                    exclude.append(context['cardId'])

                # Batch all embedding queries into a single call, then search per embedding
                seen_cards = {}  # card_id -> best_score
                all_embeddings = self.emb.embed_texts(embedding_queries)
                for eq, emb in zip(embedding_queries, all_embeddings or []):
                    if not emb:
                        continue
                    results = self.emb.search(
                        emb,
                        top_k=max_notes,
                        exclude_card_ids=exclude
                    )
                    for card_id, score in results:
                        if card_id not in seen_cards or score > seen_cards[card_id]:
                            seen_cards[card_id] = score

                # Sort merged results by score descending, take top max_notes
                semantic_results = sorted(seen_cards.items(), key=lambda x: x[1], reverse=True)[:max_notes]
                semantic_total = len(semantic_results)

                # Build chunk previews for top 3
                chunks = []
                for card_id, score in semantic_results[:3]:
                    card_data = self._load_card_data(card_id)
                    snippet = ""
                    if card_data and card_data.get('fields'):
                        field_values = list(card_data['fields'].values())
                        raw = field_values[1] if len(field_values) > 1 else field_values[0]
                        snippet = (raw or "")[:60]
                    chunks.append({"score": round(score, 3), "snippet": snippet})

                self.emit_step("semantic_search", "done", {
                    "chunks": chunks,
                    "total_hits": semantic_total,
                    "embedding_queries": embedding_queries
                })
            except Exception as e:
                logger.warning("HybridRetrieval: Semantic retrieval failed: %s", e)
                self.emit_step("semantic_search", "error", {"message": str(e)})

        # Merge results
        if mode == 'both' and (sql_citations or semantic_results):
            self.emit_step("merge", "active")

        merged = self._merge_results(sql_citations, semantic_results, kg_card_ids, context, max_notes)

        context_string = self._build_context_string(merged)

        # Scope fallback: if <2 results on current_deck, try collection
        total_results = len(merged)
        if total_results < 2 and router_result.get('search_scope') == 'current_deck' and not router_result.get('_fallback_used'):
            # Keep only the router label, remove search/merge labels before retry
            self.state.step_labels = self.state.step_labels[:1]

            # Suppress duplicate step emissions during fallback
            self.state.fallback_in_progress = True
            fallback_router = {**router_result, 'search_scope': 'collection', '_fallback_used': True}
            result = self.retrieve(user_message, fallback_router, context, max_notes)
            self.state.fallback_in_progress = False

            # Update router step with new scope
            scope_label = "Alle Stapel"
            self.emit_step("router", "done", {
                "search_needed": True,
                "retrieval_mode": router_result.get('retrieval_mode', 'both'),
                "response_length": router_result.get('response_length', 'medium'),
                "scope": "collection",
                "scope_label": scope_label
            })

            return result

        if mode == 'both' and merged:
            keyword_count = sum(1 for d in merged.values() if 'keyword' in d.get('sources', []))
            semantic_count = sum(1 for d in merged.values() if 'semantic' in d.get('sources', []))
            kg_count = sum(1 for d in merged.values() if 'kg' in d.get('sources', []))
            total = len(merged)
            weight = semantic_count / (keyword_count + semantic_count) if (keyword_count + semantic_count) > 0 else 0.5

            self.emit_step("merge", "done", {
                "keyword_count": keyword_count,
                "semantic_count": semantic_count,
                "kg_count": kg_count,
                "total": total,
                "weight_position": round(weight, 2)
            })

        # NOTE: rag_sources emission removed — caller (handler.py) handles it
        # after enriching citations with current card data.

        # Include keyword_count so the tutor can decide on web search fallback
        kw_count = sum(1 for d in merged.values() if 'keyword' in d.get('sources', [])) if merged else 0
        return {"context_string": context_string, "citations": merged, "keyword_count": kw_count}

    def _merge_results(self, sql_citations, semantic_results, kg_card_ids, context, max_notes):
        """Merge SQL citations and semantic search results."""
        merged = {}

        # Add SQL results
        for note_id, data in sql_citations.items():
            merged[note_id] = {**data, 'sources': ['keyword']}

        # Enrich semantic results with card data from Anki
        # CRITICAL: SQL citations are keyed by note_id (str), so we must resolve
        # card_id → note_id for semantic results to enable proper overlap detection.
        if semantic_results:
            for card_id, score in semantic_results:
                card_data = self._load_card_data(card_id)
                if not card_data:
                    continue

                # Use note_id as key (same as SQL citations) for correct overlap detection
                note_id_str = str(card_data.get('noteId', card_id))

                if note_id_str in merged:
                    # Note found by both SQL and semantic — boost priority
                    if 'semantic' not in merged[note_id_str].get('sources', []):
                        merged[note_id_str]['sources'].append('semantic')
                    merged[note_id_str]['similarity_score'] = max(
                        score, merged[note_id_str].get('similarity_score', 0)
                    )
                else:
                    # Semantic-only result
                    merged[note_id_str] = {
                        'noteId': card_data.get('noteId', card_id),
                        'cardId': card_id,
                        'fields': card_data.get('fields', {}),
                        'deckName': card_data.get('deckName', ''),
                        'isCurrentCard': False,
                        'similarity_score': score,
                        'sources': ['semantic']
                    }

        # Add KG results (cards found via term co-occurrence)
        for card_id in kg_card_ids[:max_notes]:
            card_data = self._load_card_data(card_id)
            if not card_data:
                continue
            note_id_str = str(card_data.get('noteId', card_id))
            if note_id_str in merged:
                if 'kg' not in merged[note_id_str].get('sources', []):
                    merged[note_id_str]['sources'].append('kg')
            else:
                merged[note_id_str] = {
                    'noteId': card_data.get('noteId', card_id),
                    'cardId': card_id,
                    'fields': card_data.get('fields', {}),
                    'deckName': card_data.get('deckName', ''),
                    'isCurrentCard': False,
                    'similarity_score': 0.3,
                    'sources': ['kg']
                }

        # Sort: both sources first, then by similarity score, then by note_id
        sorted_items = sorted(
            merged.items(),
            key=lambda x: (
                len(x[1].get('sources', [])),
                x[1].get('similarity_score', 0)
            ),
            reverse=True
        )

        return dict(sorted_items[:max_notes])

    def _load_card_data(self, card_id):
        """Load card data from Anki's collection for semantic-only results."""
        try:
            from aqt import mw
            if not mw or not mw.col:
                return None

            card = mw.col.get_card(card_id)
            note = card.note()

            fields = {}
            for name, value in zip(note.keys(), note.values()):
                clean = re.sub(r'<[^>]+>', '', value)
                clean = re.sub(r'&[a-zA-Z]+;', ' ', clean)
                clean = re.sub(r'\s+', ' ', clean).strip()
                if clean:
                    fields[name] = clean

            deck = mw.col.decks.get(card.did)
            deck_name = deck['name'] if deck else ''

            return {
                'noteId': note.id,
                'cardId': card_id,
                'fields': fields,
                'deckName': deck_name
            }
        except Exception as e:
            logger.warning("HybridRetrieval: Failed to load card %s: %s", card_id, e)
            return None

    def _build_context_string(self, merged):
        """Build formatted context string from merged results."""
        if not merged:
            return ""

        parts = []
        for note_id, data in merged.items():
            sources = ', '.join(data.get('sources', ['unknown']))
            fields = data.get('fields', {})
            if fields:
                field_lines = []
                for name, value in fields.items():
                    if value:
                        field_lines.append(f"  {name}: {value}")
                if field_lines:
                    parts.append(
                        f"Note {note_id} (via {sources}):\n" + '\n'.join(field_lines)
                    )

        return '\n\n'.join(parts)

    def _kg_retrieve(self, user_message, router_result):
        """Knowledge Graph retrieval: find cards via exact term matching + co-occurrence."""
        try:
            try:
                from ..storage.kg_store import _get_db as kg_get_db
            except ImportError:
                from storage.kg_store import _get_db as kg_get_db

            db = kg_get_db()

            # Build candidate terms: full query + individual words (≥3 chars)
            candidates = [user_message.strip()]
            candidates.extend([w for w in user_message.split() if len(w) >= 3])
            if not candidates:
                return [], []

            # Exact term matching (case-insensitive) — no LIKE wildcards
            matched_terms = []
            for candidate in candidates[:8]:
                rows = db.execute(
                    "SELECT term FROM kg_terms WHERE LOWER(term) = LOWER(?) ORDER BY frequency DESC LIMIT 1",
                    (candidate,)
                ).fetchall()
                matched_terms.extend([r[0] for r in rows])

            # If no exact matches, try prefix matching (starts with) as softer fallback
            if not matched_terms:
                for candidate in candidates[:5]:
                    if len(candidate) >= 4:
                        rows = db.execute(
                            "SELECT term FROM kg_terms WHERE LOWER(term) LIKE ? ORDER BY frequency DESC LIMIT 3",
                            (candidate.lower() + '%',)
                        ).fetchall()
                        matched_terms.extend([r[0] for r in rows])

            if not matched_terms:
                return [], []

            matched_terms = list(dict.fromkeys(matched_terms))[:10]

            term_placeholders = ','.join('?' * len(matched_terms))
            connected_rows = db.execute(
                "SELECT DISTINCT b.term FROM kg_card_terms a "
                "JOIN kg_card_terms b ON a.card_id = b.card_id AND a.term != b.term "
                "WHERE a.term IN (%s) "
                "GROUP BY b.term "
                "HAVING COUNT(DISTINCT a.card_id) >= 2 "
                "ORDER BY COUNT(DISTINCT a.card_id) DESC "
                "LIMIT 15" % term_placeholders,
                matched_terms
            ).fetchall()
            expanded_terms = matched_terms + [r[0] for r in connected_rows]
            expanded_terms = list(dict.fromkeys(expanded_terms))[:20]

            exp_placeholders = ','.join('?' * len(expanded_terms))
            card_rows = db.execute(
                "SELECT DISTINCT card_id FROM kg_card_terms WHERE term IN (%s)" % exp_placeholders,
                expanded_terms
            ).fetchall()
            card_ids = [r[0] for r in card_rows]

            return card_ids, expanded_terms
        except Exception as e:
            logger.warning("KG retrieval failed: %s", e)
            return [], []


try:
    from .kg_enrichment import enrich_query
except ImportError:
    from kg_enrichment import enrich_query

try:
    from .rrf import compute_rrf, check_confidence, K_LLM_SQL
except ImportError:
    from rrf import compute_rrf, check_confidence, K_LLM_SQL


class EnrichedRetrieval:
    """KG-enriched hybrid retrieval using RRF ranking.

    Pipeline:
        1. KG Enrichment — expand user query via Knowledge Graph
        2. Embedding batch — single embed_texts() call for all queries
        3. SQL Search — tiered precise/broad queries with cascade logic
        4. Semantic Search — primary + secondary embedding vectors
        5. RRF + Confidence — merge via Reciprocal Rank Fusion
    """

    def __init__(self, embedding_manager, emit_step=None, rag_retrieve_fn=None, state=None):
        self.emb = embedding_manager
        self.emit_step = emit_step or (lambda step, status, data=None: None)
        self.rag_retrieve_fn = rag_retrieve_fn
        self.state = state or RetrievalState()

    def retrieve(self, user_message, routing_result, context=None, max_notes=30):
        """Execute enriched retrieval pipeline.

        Args:
            user_message: User's question.
            routing_result: Dict from Router with resolved_intent, search_needed, etc.
            context: Current card context dict (unused for scope — always collection-wide).
            max_notes: Max cards to return (default 30, model filters relevance).

        Returns:
            {context_string, citations, keyword_count, confidence, rrf_scores}
        """
        # Handle both dict and dataclass routing_result
        _get_rr = (lambda k, d=None: routing_result.get(k, d)) if isinstance(routing_result, dict) \
            else (lambda k, d=None: getattr(routing_result, k, d))

        if not _get_rr('search_needed', False):
            return {"context_string": "", "citations": {}, "keyword_count": 0,
                    "confidence": "low", "rrf_scores": []}

        resolved_intent = _get_rr('resolved_intent', '') or ''
        associated_terms = _get_rr('associated_terms', []) or []

        # ── 1. Load KG term index ────────────────────────────────────────────
        kg_term_index = {}
        if self.emb:
            try:
                kg_term_index = self.emb.load_kg_term_index()
            except Exception as e:
                logger.warning("EnrichedRetrieval: load KG term index failed: %s", e)

        # ── 2. Extract terms + embed them ────────────────────────────────────
        # Extract query terms FIRST, then embed them so KG enrichment can use
        # embedding similarity to find related KG terms (not just exact match).
        try:
            from .kg_enrichment import extract_query_terms
        except ImportError:
            from kg_enrichment import extract_query_terms

        tier1_candidates = extract_query_terms(user_message)
        tier2_candidates = extract_query_terms(resolved_intent) if resolved_intent else []

        # Batch embed: all candidate terms + semantic query
        all_candidate_terms = list(dict.fromkeys(tier1_candidates + tier2_candidates))
        texts_to_embed = list(all_candidate_terms) + [user_message]
        if resolved_intent:
            texts_to_embed.append(resolved_intent)

        all_embeddings = []
        if self.emb and texts_to_embed:
            try:
                all_embeddings = self.emb.embed_texts(texts_to_embed) or []
            except Exception as e:
                logger.warning("EnrichedRetrieval: embed_texts failed: %s", e)

        # Split embeddings: term vectors + semantic vectors
        term_embeddings = {}
        for i, term in enumerate(all_candidate_terms):
            if i < len(all_embeddings) and all_embeddings[i]:
                term_embeddings[term] = all_embeddings[i]

        sem_offset = len(all_candidate_terms)
        primary_vec = all_embeddings[sem_offset] if sem_offset < len(all_embeddings) else None
        secondary_vec = all_embeddings[sem_offset + 1] if (resolved_intent and sem_offset + 1 < len(all_embeddings)) else None

        # ── 3. KG Enrichment (embedding-first, then edges) ──────────────────
        self.emit_step("kg_enrichment", "active", {"terms": []})
        enrichment = {}
        try:
            # Build sentence embeddings dict for enrich_query
            sentence_embs = {}
            if primary_vec:
                sentence_embs[user_message] = primary_vec
            if secondary_vec and resolved_intent:
                sentence_embs[resolved_intent] = secondary_vec

            enrichment = enrich_query(
                user_message,
                resolved_intent=resolved_intent,
                kg_term_index=kg_term_index,
                term_embeddings=term_embeddings,
                sentence_embeddings=sentence_embs,
            )
            self.emit_step("kg_enrichment", "done", {
                "terms": enrichment.get('kg_terms_found', [])[:8],
                "tier1_terms": enrichment.get('tier1_terms', []),
                "tier2_terms": enrichment.get('tier2_terms', []),
            })
        except Exception as e:
            logger.warning("EnrichedRetrieval: KG enrichment failed: %s", e)
            self.emit_step("kg_enrichment", "error", {"message": str(e)})
            enrichment = {
                'precise_primary': [' '.join('"%s"' % t for t in tier1_candidates)] if tier1_candidates else [],
                'broad_primary': [],
                'precise_secondary': [], 'broad_secondary': [],
                'embedding_primary': user_message,
                'embedding_secondary': resolved_intent or '',
            }

        # ── 3. SQL Search ─────────────────────────────────────────────────────
        self.emit_step("sql_search", "active", {
            "queries": [{"text": q, "hits": None}
                        for q in enrichment.get('precise_primary', [])
                        + enrichment.get('broad_primary', [])]
        })
        sql_results = {}
        try:
            sql_results = self._run_sql_search(enrichment, max_notes)
            self.emit_step("sql_search", "done", {
                "total_hits": len(sql_results),
                "queries": [{"text": q, "hits": None}
                            for q in enrichment.get('precise_primary', [])
                            + enrichment.get('broad_primary', [])]
            })
        except Exception as e:
            logger.warning("EnrichedRetrieval: SQL search failed: %s", e)
            self.emit_step("sql_search", "error", {"message": str(e)})

        # ── 4. Semantic Search ────────────────────────────────────────────────
        emb_primary_text = enrichment.get('embedding_primary', user_message)
        emb_secondary_text = enrichment.get('embedding_secondary', '')
        self.emit_step("semantic_search", "active", {
            "chunks": [],
            "embedding_queries": [q for q in [emb_primary_text, emb_secondary_text] if q]
        })
        semantic_results = {}
        try:
            if self.emb:
                exclude = []
                if context and context.get('cardId'):
                    exclude.append(context['cardId'])

                rank = 1
                # Primary vector
                if primary_vec:
                    results = self.emb.search(primary_vec, top_k=max_notes,
                                              exclude_card_ids=exclude) or []
                    for card_id, score in results:
                        note_id = self._resolve_note_id(card_id)
                        if note_id and note_id not in semantic_results:
                            semantic_results[note_id] = {
                                'rank': rank,
                                'tier': 'primary',
                                'score': score,
                                'card_id': card_id,
                            }
                            rank += 1

                # Secondary vector
                if secondary_vec:
                    sec_rank = 1
                    sec_results = self.emb.search(secondary_vec, top_k=max_notes,
                                                  exclude_card_ids=exclude) or []
                    for card_id, score in sec_results:
                        note_id = self._resolve_note_id(card_id)
                        if note_id and note_id not in semantic_results:
                            semantic_results[note_id] = {
                                'rank': sec_rank,
                                'tier': 'secondary',
                                'score': score,
                                'card_id': card_id,
                            }
                        sec_rank += 1

            self.emit_step("semantic_search", "done", {
                "total_hits": len(semantic_results),
                "embedding_queries": [q for q in [emb_primary_text, emb_secondary_text] if q]
            })
        except Exception as e:
            logger.warning("EnrichedRetrieval: Semantic search failed: %s", e)
            self.emit_step("semantic_search", "error", {"message": str(e)})

        # ── 4c. Semantic-informed SQL Expansion (Feedback Loop) ────────────
        # Extract KG terms from top semantic hits, use them for additional SQL queries.
        # This finds cards that semantic search "knows about" but SQL missed.
        if semantic_results and self.rag_retrieve_fn:
            try:
                try:
                    from ..storage.kg_store import _get_db as _kg_db
                except ImportError:
                    from storage.kg_store import _get_db as _kg_db

                # Get card_ids from top-5 semantic results
                top_sem_cards = []
                for nid, data in sorted(semantic_results.items(), key=lambda x: x[1]['rank'])[:5]:
                    cid = data.get('card_id')
                    if cid:
                        top_sem_cards.append(cid)

                if top_sem_cards:
                    kg_db = _kg_db()
                    feedback_terms = set()
                    for cid in top_sem_cards:
                        rows = kg_db.execute(
                            "SELECT term FROM kg_card_terms WHERE card_id = ?", (cid,)
                        ).fetchall()
                        for r in rows:
                            feedback_terms.add(r[0])

                    # Remove terms we already searched for
                    existing_lower = {t.lower() for t in enrichment.get('tier1_terms', [])}
                    for exps in enrichment.get('expansions', {}).values():
                        for t, _ in exps:
                            existing_lower.add(t.lower())
                    new_terms = [t for t in feedback_terms if t.lower() not in existing_lower]

                    if new_terms:
                        # Run feedback SQL with new terms (max 5 most common)
                        from collections import Counter
                        term_freq = Counter()
                        for cid in top_sem_cards:
                            rows = kg_db.execute(
                                "SELECT term FROM kg_card_terms WHERE card_id = ?", (cid,)
                            ).fetchall()
                            for r in rows:
                                if r[0].lower() not in existing_lower:
                                    term_freq[r[0]] += 1

                        top_feedback = [t for t, _ in term_freq.most_common(5)]
                        if top_feedback:
                            feedback_queries = [' OR '.join('"%s"' % t for t in top_feedback)]
                            try:
                                fb_data = self.rag_retrieve_fn(
                                    precise_queries=[],
                                    broad_queries=feedback_queries,
                                    context=None,
                                    max_notes=max_notes,
                                    suppress_event=True,
                                )
                                fb_citations = fb_data.get('citations', {})
                                fb_rank = len(sql_results) + 1
                                for nid in fb_citations:
                                    if nid not in sql_results:
                                        sql_results[nid] = {
                                            'rank': fb_rank,
                                            'query_type': 'broad',
                                            'tier': 'secondary',
                                            'card_data': fb_citations[nid],
                                        }
                                        fb_rank += 1
                                if fb_citations:
                                    logger.info("Feedback SQL: +%d cards from %d semantic-derived terms",
                                                len(fb_citations), len(top_feedback))
                            except Exception as e:
                                logger.debug("Feedback SQL failed: %s", e)
            except Exception as e:
                logger.debug("Semantic-informed expansion failed: %s", e)

        # ── 4d. Router associated_terms → own RRF lane ─────────────────────
        llm_sql_results = {}
        if associated_terms and self.rag_retrieve_fn:
            try:
                at_query = ' OR '.join('"%s"' % t for t in associated_terms[:10])
                if at_query:
                    at_data = self.rag_retrieve_fn(
                        precise_queries=[],
                        broad_queries=[at_query],
                        context=None,
                        max_notes=max_notes,
                        suppress_event=True,
                    )
                    at_citations = at_data.get('citations', {})
                    at_rank = 1
                    for nid in at_citations:
                        if nid not in llm_sql_results:
                            llm_sql_results[nid] = {'rank': at_rank}
                            at_rank += 1
                    if llm_sql_results:
                        logger.info("Router associated_terms: +%d cards from %d terms",
                                    len(llm_sql_results), len(associated_terms))
            except Exception as e:
                logger.debug("Router associated_terms SQL failed: %s", e)

        # Build extra lanes for RRF
        extra_lanes = []
        if llm_sql_results:
            extra_lanes.append((llm_sql_results, K_LLM_SQL))

        # ── 5. RRF + Confidence ───────────────────────────────────────────────
        self.emit_step("merge", "active")
        try:
            rrf_ranked = compute_rrf(sql_results, semantic_results, extra_lanes=extra_lanes or None)
            confidence = check_confidence(rrf_ranked)
            top_notes = rrf_ranked[:max_notes]
            rrf_scores = dict(top_notes)

            merged = self._build_merged_citations(top_notes, sql_results, semantic_results, context)
            context_string = self._build_context_string(merged)

            keyword_count = sum(
                1 for n in merged.values()
                if 'keyword' in n.get('sources', [])
            )

            self.emit_step("merge", "done", {
                "total": len(merged),
                "confidence": confidence,
                "keyword_count": keyword_count,
                "semantic_count": sum(
                    1 for n in merged.values()
                    if 'semantic' in n.get('sources', [])
                ),
            })

            return {
                "context_string": context_string,
                "citations": merged,
                "keyword_count": keyword_count,
                "confidence": confidence,
                "rrf_scores": list(rrf_ranked[:max_notes]),
            }
        except Exception as e:
            logger.error("EnrichedRetrieval: RRF/merge failed: %s", e)
            self.emit_step("merge", "error", {"message": str(e)})
            return {"context_string": "", "citations": {}, "keyword_count": 0,
                    "confidence": "low", "rrf_scores": []}

    def _run_sql_search(self, enrichment, max_notes):
        """Execute tiered SQL queries using enrichment result.

        Cascade logic:
          - Always run precise_primary + precise_secondary.
          - Run broad_primary only if precise_primary found <5 unique notes.
          - Run broad_secondary only if broad_primary also ran and still <5 notes.

        Returns:
            Dict of note_id -> {rank, query_type, tier, card_data}
        """
        if not self.rag_retrieve_fn:
            return {}

        results = {}  # note_id -> best entry

        def _merge_sql_batch(raw_citations, query_type, tier):
            """Merge a batch of SQL citations into results dict."""
            rank = len(results) + 1
            for note_id, card_data in (raw_citations or {}).items():
                note_id_str = str(note_id)
                if note_id_str not in results:
                    results[note_id_str] = {
                        'rank': rank,
                        'query_type': query_type,
                        'tier': tier,
                        'card_data': card_data,
                    }
                    rank += 1

        def _call_rag(precise_queries, broad_queries):
            try:
                data = self.rag_retrieve_fn(
                    precise_queries=precise_queries or [],
                    broad_queries=broad_queries or [],
                    context=None,
                    max_notes=max_notes,
                    suppress_event=True,
                )
                return data.get('citations', {})
            except Exception as e:
                logger.warning("EnrichedRetrieval: rag_retrieve_fn failed: %s", e)
                return {}

        # Precise primary
        precise_primary = enrichment.get('precise_primary', [])
        if precise_primary:
            cits = _call_rag(precise_primary, [])
            _merge_sql_batch(cits, 'precise', 'primary')

        # Broad primary — cascade: only if <5 precise primary hits
        broad_primary = enrichment.get('broad_primary', [])
        if broad_primary and len(results) < 5:
            cits = _call_rag([], broad_primary)
            _merge_sql_batch(cits, 'broad', 'primary')

        # Precise secondary
        precise_secondary = enrichment.get('precise_secondary', [])
        if precise_secondary:
            cits = _call_rag(precise_secondary, [])
            _merge_sql_batch(cits, 'precise', 'secondary')

        # Broad secondary — cascade: only if still <5 total hits
        broad_secondary = enrichment.get('broad_secondary', [])
        if broad_secondary and len(results) < 5:
            cits = _call_rag([], broad_secondary)
            _merge_sql_batch(cits, 'broad', 'secondary')

        # Tag-based search: if enrichment found KG terms, search by Anki tags too.
        # Anki tags are hierarchical (e.g. "Anatomie::GI-Trakt::Duenndarm") and
        # searched via "tag:*segment*" wildcards in find_cards().
        kg_terms = enrichment.get('kg_terms_found', [])
        tier1_terms = enrichment.get('tier1_terms', [])
        tag_candidates = list(dict.fromkeys(tier1_terms + kg_terms))[:8]
        if tag_candidates and len(results) < max_notes:
            tag_queries = []
            for term in tag_candidates:
                # Wildcard match within hierarchical tags: tag:*Duenndarm*
                tag_queries.append('tag:*%s*' % term)
            # Run as broad queries (OR semantics via separate calls)
            for tq in tag_queries[:5]:
                try:
                    cits = _call_rag([], [tq])
                    _merge_sql_batch(cits, 'precise', 'primary')
                except Exception as e:
                    logger.debug("Tag search '%s' failed: %s", tq, e)

        return results

    def _resolve_note_id(self, card_id):
        """Resolve card_id to note_id string.

        Returns note_id as string, or None on failure.
        """
        try:
            from aqt import mw
            if not mw or not mw.col:
                return None
            card = mw.col.get_card(card_id)
            return str(card.note().id)
        except Exception as e:
            logger.warning("EnrichedRetrieval: Failed to resolve note_id for card %s: %s",
                           card_id, e)
            return None

    def _build_merged_citations(self, top_notes, sql_results, semantic_results, context):
        """Build citations dict from RRF-ranked note list.

        Args:
            top_notes: Sorted list of (note_id, rrf_score) from compute_rrf().
            sql_results: Dict of note_id -> {rank, query_type, tier, card_data}.
            semantic_results: Dict of note_id -> {rank, tier, score, card_id}.
            context: Current card context dict (for isCurrentCard flag).

        Returns:
            Dict of note_id -> citation dict (same shape as HybridRetrieval).
        """
        merged = {}
        current_card_id = context.get('cardId') if context else None

        for note_id, rrf_score in top_notes:
            note_id_str = str(note_id)
            sources = []
            card_data = None
            similarity_score = 0.0

            # Prefer SQL card_data (already loaded by rag_retrieve_fn)
            if note_id_str in sql_results:
                sql_entry = sql_results[note_id_str]
                card_data = sql_entry.get('card_data') or {}
                sources.append('keyword')

            # Enrich with semantic info
            if note_id_str in semantic_results:
                sem_entry = semantic_results[note_id_str]
                similarity_score = sem_entry.get('score', 0.0)
                sources.append('semantic')
                # If no SQL card_data, load from Anki
                if not card_data:
                    sem_card_id = sem_entry.get('card_id')
                    if sem_card_id:
                        card_data = self._load_card_data(sem_card_id) or {}

            if not card_data:
                continue

            is_current = (
                current_card_id is not None
                and card_data.get('cardId') == current_card_id
            )

            merged[note_id_str] = {
                'noteId': card_data.get('noteId', note_id),
                'cardId': card_data.get('cardId'),
                'fields': card_data.get('fields', {}),
                'deckName': card_data.get('deckName', ''),
                'isCurrentCard': is_current,
                'similarity_score': similarity_score,
                'sources': sources,
                'rrf_score': rrf_score,
            }

        return merged

    def _load_card_data(self, card_id):
        """Load card data from Anki's collection."""
        try:
            from aqt import mw
            if not mw or not mw.col:
                return None

            card = mw.col.get_card(card_id)
            note = card.note()

            fields = {}
            for name, value in zip(note.keys(), note.values()):
                clean = re.sub(r'<[^>]+>', '', value)
                clean = re.sub(r'&[a-zA-Z]+;', ' ', clean)
                clean = re.sub(r'\s+', ' ', clean).strip()
                if clean:
                    fields[name] = clean

            deck = mw.col.decks.get(card.did)
            deck_name = deck['name'] if deck else ''

            return {
                'noteId': note.id,
                'cardId': card_id,
                'fields': fields,
                'deckName': deck_name,
            }
        except Exception as e:
            logger.warning("EnrichedRetrieval: Failed to load card %s: %s", card_id, e)
            return None

    def _build_context_string(self, merged):
        """Build formatted context string for LLM from merged citations."""
        if not merged:
            return ""

        parts = []
        for note_id, data in merged.items():
            sources = ', '.join(data.get('sources', ['unknown']))
            fields = data.get('fields', {})
            if fields:
                field_lines = []
                for name, value in fields.items():
                    if value:
                        field_lines.append(f"  {name}: {value}")
                if field_lines:
                    parts.append(
                        f"Note {note_id} (via {sources}):\n"
                        + '\n'.join(field_lines)
                    )

        return '\n\n'.join(parts)
