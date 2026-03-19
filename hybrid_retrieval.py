"""
Hybrid Retrieval: SQL + Semantic search orchestrated by router decision.
Merges results from both retrieval paths, prioritizing cards found by both.
"""
import re


class HybridRetrieval:
    def __init__(self, embedding_manager, ai_handler):
        self.emb = embedding_manager
        self.ai = ai_handler

    def retrieve(self, user_message, router_result, context=None, max_notes=10):
        """
        Execute retrieval based on router decision.

        Args:
            user_message: User's question
            router_result: Dict from _rag_router() with intent, search_needed, queries, retrieval_mode
            context: Current card context dict
            max_notes: Max cards to return

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
                self.ai._emit_pipeline_step("sql_search", "active")
                sql_data = self.ai._rag_retrieve_cards(
                    precise_queries=router_result.get('precise_queries'),
                    broad_queries=router_result.get('broad_queries'),
                    search_scope=router_result.get('search_scope', 'current_deck'),
                    context=context,
                    max_notes=max_notes
                )
                sql_citations = sql_data.get('citations', {})
                sql_total = len(sql_citations)

                # Build query result data for UI from _current_request_steps
                query_data = []
                import re as _re
                for step in self.ai._current_request_steps:
                    state = step.get('state', '')
                    if 'Ergebnis:' in state:
                        m = _re.match(r'Ergebnis:\s*(\d+)\s*Treffer\s*für\s*\'(.*?)\'', state)
                        if m:
                            query_data.append({"text": m.group(2), "hits": int(m.group(1))})

                self.ai._emit_pipeline_step("sql_search", "done", {
                    "queries": query_data,
                    "total_hits": sql_total
                })
            except Exception as e:
                print(f"⚠️ HybridRetrieval: SQL retrieval failed: {e}")
                self.ai._emit_pipeline_step("sql_search", "error", {"message": str(e)})

        # Semantic retrieval — use embedding_query from router
        if mode in ('semantic', 'both') and self.emb:
            try:
                self.ai._emit_pipeline_step("semantic_search", "active")
                embedding_query = router_result.get('embedding_query', user_message)
                query_embeddings = self.emb.embed_texts([embedding_query])
                if query_embeddings:
                    exclude = []
                    if context and context.get('cardId'):
                        exclude.append(context['cardId'])
                    semantic_results = self.emb.search(
                        query_embeddings[0],
                        top_k=max_notes,
                        exclude_card_ids=exclude
                    )
                    semantic_total = len(semantic_results)

                    # Build chunk previews for top 3
                    chunks = []
                    for card_id, score in semantic_results[:3]:
                        card_data = self._load_card_data(card_id)
                        snippet = ""
                        if card_data and card_data.get('fields'):
                            first_field = next(iter(card_data['fields'].values()), "")
                            snippet = first_field[:60]
                        chunks.append({"score": round(score, 3), "snippet": snippet})

                    self.ai._emit_pipeline_step("semantic_search", "done", {
                        "chunks": chunks,
                        "total_hits": semantic_total
                    })
            except Exception as e:
                print(f"⚠️ HybridRetrieval: Semantic retrieval failed: {e}")
                self.ai._emit_pipeline_step("semantic_search", "error", {"message": str(e)})

        # Merge results
        if mode == 'both' and (sql_citations or semantic_results):
            self.ai._emit_pipeline_step("merge", "active")

        merged = self._merge_results(sql_citations, semantic_results, context, max_notes)

        context_string = self._build_context_string(merged)

        # Scope fallback: if <2 results on current_deck, try collection
        total_results = len(merged)
        if total_results < 2 and router_result.get('search_scope') == 'current_deck' and not router_result.get('_fallback_used'):
            # Keep only the router label, remove search/merge labels before retry
            self.ai._current_step_labels = self.ai._current_step_labels[:1]

            # Suppress duplicate step emissions during fallback
            self.ai._fallback_in_progress = True
            fallback_router = {**router_result, 'search_scope': 'collection', '_fallback_used': True}
            result = self.retrieve(user_message, fallback_router, context, max_notes)
            self.ai._fallback_in_progress = False

            # Update router step with new scope
            scope_label = "Alle Stapel"
            self.ai._emit_pipeline_step("router", "done", {
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
            total = len(merged)
            weight = semantic_count / (keyword_count + semantic_count) if (keyword_count + semantic_count) > 0 else 0.5

            self.ai._emit_pipeline_step("merge", "done", {
                "keyword_count": keyword_count,
                "semantic_count": semantic_count,
                "total": total,
                "weight_position": round(weight, 2)
            })

        # Emit sources for SourcesCarousel
        if merged:
            self.ai._emit_ai_event("rag_sources", merged)

        return {"context_string": context_string, "citations": merged}

    def _merge_results(self, sql_citations, semantic_results, context, max_notes):
        """Merge SQL citations and semantic search results."""
        merged = {}

        # Add SQL results
        for note_id, data in sql_citations.items():
            merged[note_id] = {**data, 'sources': ['keyword']}

        # Enrich semantic results with card data from Anki
        if semantic_results:
            for card_id, score in semantic_results:
                card_id_str = str(card_id)

                if card_id_str in merged:
                    # Card found by both — boost priority
                    merged[card_id_str]['sources'].append('semantic')
                    merged[card_id_str]['similarity_score'] = score
                else:
                    # Semantic-only result — need to load card data
                    card_data = self._load_card_data(card_id)
                    if card_data:
                        merged[card_id_str] = {
                            'noteId': card_data.get('noteId', card_id),
                            'cardId': card_id,
                            'fields': card_data.get('fields', {}),
                            'deckName': card_data.get('deckName', ''),
                            'isCurrentCard': False,
                            'similarity_score': score,
                            'sources': ['semantic']
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
            print(f"⚠️ HybridRetrieval: Failed to load card {card_id}: {e}")
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
