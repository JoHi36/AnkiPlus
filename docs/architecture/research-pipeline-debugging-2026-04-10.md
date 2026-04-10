# Research Agent Debugging Session — 2026-04-10

Investigation into why the Research agent (Smart Search) returns wrong
information and wrong citations. This document captures the state of the
investigation so we can resume later.

## Session goal

The user reported that the Research agent (invoked via the Stapel Smart Search
bar) produces:

1. Factually wrong answers
2. Citations that don't point to the cards they claim to back

## Baseline — the Research pipeline

```
Frontend (useSmartSearch.js)
   ↓ bridge.addMessage('searchCards', {query, topK})
ui/widget.py:_msg_search_cards                              (R1)
   ↓ spawns SearchCardsThread
SearchCardsThread.run() — multi-query hybrid search         (R2)
   ↓ 100 cards, 8 clusters → result_signal
ui/widget.py:_on_search_cards_result                        (R3)
   ↓ truncates to 50 cards → _start_quick_answer            (R4)
SmartSearchAgentThread.run() — parallel branches:           (R5)
  A) handler.dispatch_smart_search                          (R6)
     ↓
     _dispatch_agent(agent='research')                      (S6)
     ↓
     research.run_research()                                (R10)
        ↓ analyze_query → routing_result                    (R10.5, S5)
        ↓ fetch_card_snippets (dead code after bypass)      (R11)
        ↓ retrieve_rag_context                              (R12, S8-S13)
        ↓ build context + citation_builder                  (R13)
        ↓ get_google_response_streaming                     (R14)
  B) _generate_cluster_labels → generate_quick_answer       (R5.1)
     ↓ parallel LLM call for cluster labeling
```

## Instrumentation added

17 new R-state logs on the Research path, all using the existing
`_log_state` helper from `ai/rag_pipeline.py`. Grep `[STATE R` to extract
the Research trace in one shot.

| State | Location | Captures |
|---|---|---|
| R1 | `ui/widget.py:_msg_search_cards` | query, top_k, has_emb_mgr |
| R2 | `ui/widget.py:SearchCardsThread.run` | ENTER/RESULT/EXIT/FAIL with card counts |
| R3 | `ui/widget.py:_on_search_cards_result` | cards_count after the `[:50]` truncation |
| R4 | `ui/widget.py:_start_quick_answer` | handler resolved, thread spawn |
| R5 | `ui/widget.py:SmartSearchAgentThread.run` | TRY/RESULT/OK/EXIT/FAIL |
| R5.1 | `ui/widget.py:SmartSearchAgentThread._generate_cluster_labels` | cluster_labels + summaries + cardRefs preview (first 4) |
| R6 | `ai/handler.py:dispatch_smart_search` | agent_def_loaded, run_fn_resolved |
| R10 | `research/__init__.py:run_research` | query, has_smart_search, model, fallback_model |
| R10.5 | `research/__init__.py` | analyze_query result (search_needed, resolved_intent, associated_terms) |
| R11 | `research/__init__.py` | snippets enrichment + PREVIEW of first 5 |
| R12 | `research/__init__.py` | retrieve_rag_context path (smart_search / normal / skip) |
| R13 | `research/__init__.py` | build_context ENTER/EXIT + DROP_CHECK + BUILDER_MAP |
| R14 | `research/__init__.py` | llm_call ENTER/OK/TEXT/CITES_USED/FAIL |
| R15 | `research/__init__.py` | fallback LLM path (fires only if R14 failed) |
| R17 | `research/__init__.py` | return dict shape |

### Key diagnostic log lines

- **`R13 BUILDER_MAP`** — the `[N] → cardId` mapping the frontend will render. Cross-reference with `LERNMATERIAL [N]` from S16 and `S13 CTX[NN]` to verify alignment end-to-end.
- **`R13 DROP_CHECK`** — counts citations silently dropped by the `if c.get('index')` filter (`dropped_no_index=0` in all our runs; was not the bug).
- **`R14 TEXT`** — 800-char preview of the actual LLM response text.
- **`R14 CITES_USED`** — every `[N]` pattern extracted from the response text via `re.findall(r'\[(\d+)\]', text)`. Collapses into `unique_indices=[…]` so drift jumps out.
- **`R5.1 PREVIEW`** — the parallel cluster-labels path (was completely uninstrumented before).

## Bugs found

### Bug A — Research never built `rag_retrieve_fn` (FIXED)

**Symptom.** `keyword_hits=0` in every Research run → `confidence='low'` → unnecessary Perplexity web fallback firing → wasted tokens.

**Cause.** `handler.dispatch_smart_search` doesn't inject `rag_retrieve_fn` into `agent_kwargs`, and `research/__init__.py` had no fallback. Tutor has `_make_default_rag_retrieve_fn()` at `ai/tutor.py:206-207`; Research was missing the equivalent.

**Effect.** When `EnrichedRetrieval` received `rag_retrieve_fn=None`:

- `_sql_search` at `ai/retrieval.py:851` returned `{}` immediately
- The associated_terms OR-query lane at line 773 was gated out
- Semantic-informed expansion at line 698 was gated out
- Only the semantic lane fired → top RRF score below the `0.018` medium threshold → `confidence='low'`

**Fix.** `research/__init__.py:82` now imports and calls `_make_default_rag_retrieve_fn()` from `ai/tutor.py` whenever kwargs don't provide one.

**Verification.** Run 3 showed `keyword_hits=50 confidence='high'` and `S11 web_fallback SKIP reason='confidence_not_low'`.

### Bug B — S8 ignored associated_terms / embedding_queries (PARTIALLY FIXED — architecturally wrong, revert in next session)

**Symptom.** The router's curated `associated_terms` list wasn't visibly driving the `precise_queries` or `broad_queries` that S8 produced.

**What I did.** Added a conversion in `ai/rag_pipeline.py:310-360` that builds `precise_queries` (each term as a single-quoted AND) and `broad_queries` (all terms OR-concatenated) from `associated_terms` when the router's explicit precise/broad fields are null.

**Why this is architecturally wrong.** See the S8 → S9 → S10 section below. TL;DR: `EnrichedRetrieval.retrieve()` is called without `precise_queries` or `broad_queries` at all — it reads `associated_terms`, `embedding_queries`, `resolved_intent` **directly** from `routing_result`. So S8's converted variables are dead code in the happy path. They only flow into `HybridRetrieval` and `SQL_only_fallback`, which fire only when `EnrichedRetrieval` crashes.

**The conversion's only real effect** is bypassing the early-return guard at S8 line 337 (`if not precise_queries and not broad_queries: return empty`). The correct fix is to change the guard to check all router fields, not to reshape data into dead-end variables.

**TODO for next session.** Revert the conversion, rewrite the guard as:

```python
if (not associated_terms_list
        and not embedding_queries
        and not _raw_resolved.strip()
        and not (user_message or '').strip()):
    return empty
```

### Bug C — LLM parrots literal `[1]` from prompt examples (STILL OPEN)

**Symptom.** The Research answer LLM cites only `[1]`, always, regardless of:

- How many cards are in context (50)
- Which card is actually at position `[1]` (proved with 3 consecutive runs where `[1]` was completely different content)
- How many other citation indices are available (`[39]`–`[47]` perfect web sources were ignored in one run)

**Cause (strongly suspected, not yet confirmed).** The Research system prompt at `functions/src/prompts/research.ts` contains format examples using literal `[1]` and `[1][2]` markers:

```
- **Kernaussage** — Ein Satz, der die Frage direkt beantwortet [1].
- **Details** als Bullet-Points — jeder Punkt ein Fakt, maximal 1-2 Sätze [1][2].
```

The model (`gemini-3-flash-preview`) appears to be reproducing these literal tokens verbatim instead of treating them as placeholders.

**Controlled experiment.** Across 3 consecutive runs we changed everything upstream (prefetch vs unified pipeline, different retrieval algorithms, different card sets at position `[1]`, `rag_retrieve_fn` off vs on). Card `[1]` was completely different content each run:

| Run | Card `[1]` content |
|---|---|
| 1 | "Welche Flächen unterscheidet man an der Herzoberfläche?" (Facies sternocostalis) |
| 2 | "Körperkreislauf: Aorta → Kapillarbett → Hohlvene → Rechter Vorhof" (blood flow path) |
| 3 | "Kaum Einstrom während der Systole, Koronare Herzkrankheit" (coronary perfusion) |

All 3 LLM outputs were near-identical generic textbook intro about the heart, with `[1]` tagged on every sentence. None of the claimed facts were in the actual `[1]` card in any of the runs.

**Cross-reference.** The parallel `generate_quick_answer` call (cluster labels, `gemini-2.5-flash`) uses a different prompt and produces **correctly grounded** summaries on the same 50 cards. The model family CAN do this correctly when the prompt is right:

```
cluster_0 label:   "Fetalentwicklung & Kreislauf"
cluster_0 summary: "Die embryonale Entwicklung des Herzens beinhaltet
                    Verlagerungen des Herzschlauch…"
```

Real prose, specific, grounded in the cards.

**Two suspects — both untested:**

1. **Prompt.** The literal `[1]` in format examples primes reproduction.
2. **Model.** `gemini-3-flash-preview` is a preview model and might have weaker instruction-following than `gemini-2.5-flash`.

**TODO for next session.** Two experiments, cheapest first:

1. Swap main-answer model `gemini-3-flash-preview` → `gemini-2.5-flash` (one-line change each in `research/__init__.py:79` and `ai/tutor.py:86`). Restart, retry, check `R14 CITES_USED`.
2. If (1) doesn't fix it: edit `functions/src/prompts/research.ts` format examples to use `[N]` and `[N][M]` placeholders instead of literal `[1]`. Redeploy `functions/`. Retry.

## The S8 → S9 → S10 architectural finding

This is the most important thing to carry into the next session.

### `precise_queries` / `broad_queries` are vestigial after commit `74a7b5c`

Pre-`74a7b5c`, the router used to return `precise_queries` and `broad_queries` explicitly. That commit simplified the router prompt and dropped those fields. The router now only returns:

- `search_needed`
- `resolved_intent`
- `associated_terms`
- `agent` (deprecated, unused)

But the downstream RRF lanes (`precise_primary` k=40, `broad_primary` k=80) still exist and still expect queries shaped like precise/broad.

### `EnrichedRetrieval` doesn't use S8's precise/broad

`ai/rag_pipeline.py:411-412`:

```python
retrieval_result = enriched.retrieve(
    user_message, routing_result, context, max_notes=max_notes)
```

Note: `precise_queries` and `broad_queries` are **not** in the argument list. `EnrichedRetrieval.retrieve()` reads what it needs straight from `routing_result` at `ai/retrieval.py:500-507`:

```python
resolved_intent = _get_rr('resolved_intent', '') or ''
associated_terms = _get_rr('associated_terms', []) or []
embedding_queries = [
    q for q in (_get_rr('embedding_queries', []) or [])
    if q and isinstance(q, str) and q.strip()
]
```

Then it fills its own RRF lanes:

| Lane | k | Source |
|---|---|---|
| `precise_primary` | 40 | `enrichment.precise_primary` from KG-matched associated_terms |
| `broad_primary` | 80 | `enrichment.broad_primary` from KG enrichment broad expansion |
| `semantic_primary` | 60 | `user_message` embedding |
| `semantic_secondary` | 120 | `resolved_intent` embedding |
| `semantic` (via primary tier) | 60 | `embedding_queries` — each one individually (newly wired this session) |
| `LLM_SQL` | 80 | Direct OR-concat of all `associated_terms` (line 771-794) |
| `feedback_terms` | 80 | KG terms extracted from top semantic hits → SQL search |

**None of these are fed by S8's `precise_queries`/`broad_queries` variables.**

### Where S8's precise/broad ARE used

Only by the fallback retrievers in S9:

- `HybridRetrieval` (rag_pipeline.py:437-444) — fires only if `EnrichedRetrieval` crashes
- `SQL_only_fallback` (rag_pipeline.py:459-465) — fires only if `HybridRetrieval` also crashes

`EnrichedRetrieval` has been stable; these fallbacks rarely fire; S8's precise/broad is effectively dead code.

### Why run 3 retrieval improved so much — it wasn't S8

My S8 conversion was irrelevant to the run-3 retrieval jump. What actually happened:

1. **Bug A fix** (`rag_retrieve_fn` fallback) — made `EnrichedRetrieval._run_sql_search` actually work, populating `precise_primary` via `enrichment.precise_primary` (built by KG enrichment from associated_terms).
2. Bug A fix also made the line 771-794 OR-query lane fire, populating `LLM_SQL`.
3. Bug A fix also made the semantic-informed expansion at line 698 fire.
4. Multi-lane agreement lifted the top RRF score above the `0.025` HIGH threshold.

Run 3 went from `keyword_hits=0 confidence='low'` to `keyword_hits=50 confidence='high'` entirely because of Bug A. My S8 conversion happened to sit in the same commit but contributed nothing to the retrieval quality.

### Tutor uses the same path

`run_tutor` (`ai/tutor.py`) calls the same `retrieve_rag_context` with the same `routing_result`. Tutor's S8 previously ran with `precise_queries=['the resolved_intent sentence']` (the old fallback) — a useless natural-language sentence. Tutor still worked because:

1. `EnrichedRetrieval` reads `associated_terms` directly and fills lanes from them
2. `TUTOR_RETRIEVAL.reranker_enabled=True`, so `gemini-2.5-flash-lite` filters out the useless cards at S10

Research was broken not because of S8 but because of Bug A. Once Bug A is fixed, Research has the same retrieval quality as Tutor, minus the S10 reranker filtering.

## LLM models used in every call

Verified against the source.

| Call | File : line | Model |
|---|---|---|
| Router (`analyze_query` → `/router`) | `functions/src/handlers/router.ts:11` `ROUTER_MODEL` | **`gemini-2.5-flash`** |
| Reranker (`rerank_sources`) | `ai/reranker.py:28` `RERANKER_MODEL` | **`gemini-2.5-flash-lite`** |
| Cluster labels (`generate_quick_answer`) | `ai/gemini.py:863` defaults to `DEFINITION_MODEL` | **`gemini-2.5-flash`** |
| Definition (`generate_definition`) | `ai/gemini.py:717` `DEFINITION_MODEL` | **`gemini-2.5-flash`** |
| KG term extraction | `ai/gemini.py:1002` `EXTRACTION_MODEL` | **`gemini-2.5-flash`** |
| **Tutor main answer** | `ai/tutor.py:86` default | **`gemini-3-flash-preview`** |
| **Research main answer** | `research/__init__.py:79` default | **`gemini-3-flash-preview`** |

**Every in-app LLM call uses `gemini-2.5-flash` or `gemini-2.5-flash-lite` — except the two main answer streams.** The cluster labeler (using `gemini-2.5-flash`) produces grounded, correctly-cited summaries on the same cards where the main answer (using `gemini-3-flash-preview`) produces Wikipedia hallucinations with fake `[1]` citations. Strong correlation with Bug C.

## Useful grep recipes for the Anki debug-shell log

```bash
LOGFILE=/path/to/anki-debug-shell.output

# Research state trace (chronological)
grep -E '\[STATE R[0-9]' "$LOGFILE" | awk '!seen[$0]++'

# Unified RAG pipeline decisions
grep -E '\[STATE S(8|9|10|11|12|13|16|20) ' "$LOGFILE" | awk '!seen[$0]++'

# LERNMATERIAL — what the LLM actually saw
grep 'LERNMATERIAL:' "$LOGFILE" | awk '!seen[$0]++'

# The actual LLM response text
grep 'R14 research.llm_call\] TEXT' "$LOGFILE"

# Which citations the LLM used in the response
grep 'R14 research.llm_call\] CITES_USED' "$LOGFILE"

# Citation-drift detectors
grep -E 'R13 research.build_context\] (DROP_CHECK|BUILDER_MAP)' "$LOGFILE"

# Cluster labels parallel path
grep -E 'R5.1 cluster_labels.run\]' "$LOGFILE"

# Dedupe double-logged lines (our logger is attached twice somewhere)
awk '!seen[$0]++' "$LOGFILE"
```

## State of the branch at session end

### Committed previously

- `ff02338` — Definition four-bug chain fix
- `0be4b4b` — Widget bare-`mw` cosmetic fix; document `pipeline_blocks._resolve_embedding_manager` broken fallback

### Staged in this session's commit

- **17 new R-state instrumentation log lines** across `ui/widget.py`, `ai/handler.py`, `research/__init__.py`
- **`ai/rag_pipeline.py` S8 rewrite** — currently contains the architecturally-wrong `associated_terms → precise_queries/broad_queries` conversion. **Needs revert next session** per the S8 → S9 finding above. Kept for now so the early-return guard doesn't fire.
- **`ai/retrieval.py`** — wired `embedding_queries` into the semantic search lane (`embedding_query_vecs` batch-embed + per-query search pass). This one IS correct and should stay.
- **`research/__init__.py` Bug A fix** — `rag_retrieve_fn` fallback via `_make_default_rag_retrieve_fn()` from `ai/tutor.py`. Correct, keep.
- **`research/__init__.py` smart_search_context bypass** — experiment-mode; kept in for now, the unified pipeline is a cleaner base for Research anyway. Can be reconsidered once Bug C is nailed down.
- **`ui/widget.py` `_generate_cluster_labels`** — now instrumented with R5.1.
- **Existing work unrelated to this session** — Tutor state machine doc enhancement (worked example + citation notes), dashboard Architecture tab (`scripts/benchmark_serve.py`), `docs/architecture/research-pipeline-debugging-2026-04-10.md` (this file).

## Next session plan

Pick up in this order:

1. **Revert S8's `associated_terms → precise/broad` conversion**. Replace the early-return guard with one that bails only when `associated_terms`, `embedding_queries`, `resolved_intent`, and `user_message` are ALL empty. Keep the `embedding_queries` log output.
2. **Model-swap experiment for Bug C.** Change `research/__init__.py:79` and `ai/tutor.py:86` defaults from `gemini-3-flash-preview` to `gemini-2.5-flash`. Restart Anki, re-run "Erklär mir das Herz." Check `R14 TEXT` and `R14 CITES_USED`. If the LLM cites multiple unique indices and the text is grounded → Bug C was the model.
3. **If (2) doesn't fix Bug C.** Edit `functions/src/prompts/research.ts` format examples. Replace literal `[1]` and `[1][2]` with `[N]` and `[N][M]` (or varied `[3] [7] [12]`). Redeploy `functions/`. Retry.
4. **Once Bug C is nailed down.** Decide whether to keep the smart_search_context bypass in Research or restore the prefetch path. The prefetch's cluster-labels consumer doesn't depend on this decision — it reads `cards_data` directly from `SmartSearchAgentThread.__init__`, not from `smart_search_context`.
5. **Optional cleanup.** The `pipeline_blocks._resolve_embedding_manager` broken fallback documented in commit `0be4b4b` is still there. Not urgent but worth porting to the `sys.modules.get('AnkiPlus_main')` pattern from `ai/handler.py:492` at some point.

## Open questions for next session

- Does `gemini-2.5-flash` produce grounded citations on the same 50 heart cards, or does it also parrot `[1]` from the prompt template? (Bug C experiment #1)
- Does replacing `[1]` with `[N]` in the prompt fix citation behavior on `gemini-3-flash-preview`? (Bug C experiment #2)
- Is there a principled reason to use `gemini-3-flash-preview` for main answers given that every other call uses `gemini-2.5-flash`? If not, retire it.
- Should S10 reranker be enabled for Research? Currently `RESEARCH_RETRIEVAL.reranker_enabled=False`. With reranker on, the post-retrieval junk would get filtered like Tutor's does. Cost: extra `gemini-2.5-flash-lite` call per query.
