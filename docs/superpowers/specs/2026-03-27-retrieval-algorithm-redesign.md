# Retrieval Algorithm Redesign — KG-Enriched Hybrid Search with RRF

**Date:** 2026-03-27
**Status:** Design approved, pending implementation
**Scope:** `ai/router.py`, `ai/retrieval.py`, `ai/rag.py`, `ai/rag_pipeline.py`, `ai/embeddings.py`, `storage/kg_store.py`, backend `/router` endpoint

---

## 1. Problem Statement

The current retrieval system has three structural weaknesses:

1. **KG is a dead arm.** It runs as a third parallel search with a fixed score of 0.3, never influencing SQL or semantic queries. It adds noise rather than signal.
2. **The LLM Router guesses search queries.** It doesn't know which terms exist in the card collection. When the user asks "Dünndarm" but cards say "Jejunum", the Router generates queries that miss.
3. **Merge is naive.** `len(sources) + similarity_score` is counting, not ranking. No mathematical basis for combining results from different search systems.

**Goal:** 100% recall when knowledge exists in cards. Mathematically verifiable ranking. Language-independent. Performant (<1s total retrieval).

---

## 2. Architecture Overview

Five phases, each with exactly one responsibility:

```
USER QUESTION
    │
    ▼
┌──────────────────────────────────────────────────────┐
│ PHASE 1: ROUTER                        ~250ms (LLM) │
│ Agent routing + context resolution                    │
│ Output: agent, search_needed, resolved_intent         │
└────────────────────┬─────────────────────────────────┘
                     │ (if search_needed=true)
                     ▼
┌──────────────────────────────────────────────────────┐
│ PHASE 2: KG ENRICHMENT                 ~30ms (local) │
│ Two-tier term expansion + query generation            │
│ Output: precise_queries, broad_queries, emb_queries   │
└────────────────────┬─────────────────────────────────┘
                     │
┌──────────────────────────────────────────────────────┐
│ PHASE 3: EMBEDDING BATCH             ~200ms (1 call) │
│ KG fuzzy term matching + semantic search vectors      │
│ All in one API call                                   │
└────────────────────┬─────────────────────────────────┘
                     │
           ┌─────────┴──────────┐
           ▼                    ▼
┌──────────────────┐  ┌─────────────────┐
│ PHASE 4a:        │  │ PHASE 4b:       │  ← PARALLEL
│ SQL SEARCH       │  │ SEMANTIC SEARCH │
│ (Anki find_cards)│  │ (cosine sim.)   │
└────────┬─────────┘  └───────┬─────────┘
         │                    │
         └────────┬───────────┘
                  ▼
┌──────────────────────────────────────────────────────┐
│ PHASE 5: RECIPROCAL RANK FUSION + CONFIDENCE         │
│ Weighted RRF scoring → unified rank → web fallback   │
└──────────────────────────────────────────────────────┘
```

### Timing Budget

| Phase | Latency | Notes |
|-------|---------|-------|
| Router | ~250ms | Slimmer prompt → faster than current ~300ms |
| KG Enrichment | ~30ms | Local SQLite queries |
| Embedding Batch | ~200ms | Single API call for all vectors. After return: fuzzy KG lookup + query refinement (~5ms). |
| SQL + Semantic | ~300ms | Parallel execution |
| RRF + Confidence | <1ms | Pure math |
| **Total** | **~780ms** | **vs. current ~800ms, but much higher quality** |

---

## 3. Phase 1: Router (Slim)

### 3.1 What Changes

The Router is stripped down to three responsibilities:

| Responsibility | Current | New |
|---|---|---|
| Agent routing | Yes | Yes (unchanged) |
| search_needed decision | Yes | Yes (unchanged) |
| Query generation | Yes (6+ query fields) | **Removed** |
| Context resolution | Implicit (in queries) | **Explicit** (`resolved_intent` field) |
| search_scope | Yes | **Removed** (always collection-wide) |
| response_length | Yes | **Removed** (model decides) |
| max_sources | Yes | **Removed** (fixed at 10) |
| retrieval_mode | Yes | **Removed** (always hybrid) |

### 3.2 Router Output Schema

```json
{
  "agent": "tutor",
  "search_needed": true,
  "resolved_intent": "Mechanismus der GIP-Sekretion durch K-Zellen im Duodenum und Wirkung auf Insulinsekretion"
}
```

Three fields. Nothing else.

### 3.3 Router Input

```json
{
  "message": "Wie genau meinst du das?",
  "cardContext": {
    "question": "K-Zellen GIP Duodenum",
    "answer": "K-Zellen sezernieren GIP...",
    "deckName": "Anatomie::GI-Trakt",
    "tags": ["Endokrinologie"]
  },
  "recentExchange": [
    {"role": "user", "content": "Was sind K-Zellen?"},
    {"role": "assistant", "content": "K-Zellen sind enteroendokrine Zellen im Duodenum...", "agent": "tutor"}
  ]
}
```

- `recentExchange`: Last 2 message pairs (user+assistant), truncated to ~200 chars each. Agent-agnostic (includes Plusi, Help, etc.).
- `cardContext`: Current card if open, null otherwise.

### 3.4 Router Prompt (New)

The Router prompt is focused solely on agent selection and intent resolution:

```
You are a message router for a learning app. Your job:
1. Decide which agent handles this message (tutor/research/help/plusi)
2. Decide if a card search is needed
3. If search is needed: write a clear, specific description of what
   the user wants to know, using domain-specific terminology.

CRITICAL for resolved_intent:
- For context-dependent questions ("what do you mean?", "explain that"):
  Use the card context and recent exchange to determine the SPECIFIC topic.
  Write the intent using the actual domain terms, not the user's vague words.
- For standalone questions ("How long is the small intestine?"):
  Restate the question with domain-specific precision.
- resolved_intent must be a factual description, NOT a search query.
  Good: "Length of the small intestine including jejunum and ileum segments"
  Bad: "small intestine AND length AND meters"

Output JSON only:
{
  "agent": "tutor" | "research" | "help" | "plusi",
  "search_needed": true | false,
  "resolved_intent": "..." (only when search_needed=true)
}
```

### 3.5 Existing Routing Levels (Unchanged)

Level 1 (0ms): Lock mode, @mentions → bypass LLM entirely.
Level 2 (0ms): Heuristic keywords → bypass LLM.
Level 3 (~250ms): Backend LLM → agent + search_needed + resolved_intent.

When Level 1 or 2 triggers for the Tutor agent, `resolved_intent` is not available. In this case, Phase 2 uses only the user's direct query (Tier 1). This is correct behavior — @tutor mentions and heuristic routes are typically explicit questions, not vague references.

---

## 4. Phase 2: KG Query Enrichment

### 4.1 Two-Tier Architecture

Queries are generated from TWO sources with different weights:

**Tier 1 — Primary (from user's direct query)**
- Strongest signal. User's actual words.
- KG expansion of these terms.
- Gets highest weight in RRF (k=60).

**Tier 2 — Secondary (from Router's resolved_intent)**
- Contextual enrichment. Router's interpretation.
- Only NEW terms not already in Tier 1.
- Gets lower weight in RRF (k=120).

### 4.2 Term Extraction

Extract candidate terms from text input. Language-independent approach:

```python
def extract_query_terms(text):
    """Extract candidate terms for KG lookup."""
    # 1. Tokenize (split on whitespace + punctuation)
    # 2. Remove stopwords (German + English lists, already exist in codebase)
    # 3. Keep tokens with len >= 3 or known abbreviations (ATP, GIP, DNA, etc.)
    # 4. Detect compound phrases: consecutive capitalized tokens
    #    e.g., "Plexus brachialis" → keep as single term
    # 5. Return list of candidate terms, ordered by position in text
    pass
```

Reuses existing logic from `ai/term_extractor.py` (heuristic extraction).

### 4.3 KG Term Lookup (Two-Step)

For each candidate term:

**Step 1: Exact match (0ms, SQLite)**
```sql
SELECT term, frequency FROM kg_terms
WHERE LOWER(term) = LOWER(?)
```

**Step 2: Embedding fuzzy match (if exact fails)**
- Term is added to the embedding batch (Phase 3)
- After embedding returns: compare against pre-computed KG term embeddings
- Find top-3 nearest KG terms with similarity > 0.60
- This handles typos, synonyms, cross-language terms

### 4.4 KG Term Expansion

For each matched KG term, expand via co-occurrence edges:

```sql
SELECT term_b, weight FROM kg_edges
WHERE term_a = ?
ORDER BY weight DESC
LIMIT 5
```

Returns related terms ranked by co-occurrence strength. Example:
- "Dünndarm" → Jejunum(8), Ileum(7), Duodenum(6), Intestinum(3)

### 4.5 Deterministic Query Generation

From the extracted and expanded terms, generate queries without any LLM:

```python
def generate_queries(tier1_terms, tier1_expansions, tier2_terms, tier2_expansions):
    """
    tier1_terms: terms from user's direct query
    tier1_expansions: KG expansions of tier1_terms
    tier2_terms: NEW terms from resolved_intent (not in tier1)
    tier2_expansions: KG expansions of tier2_terms
    """

    # --- PRECISE QUERIES (AND logic, highest weight) ---
    # Query 1: Original user terms
    precise_primary = ['" "'.join(tier1_terms)]  # Anki AND = space-separated quoted terms

    # Query 2-3: Top expansions + context term
    for expansion_group in tier1_expansions[:2]:
        top_expansions = [e[0] for e in expansion_group[:2]]  # top 2 by weight
        context_term = pick_context_term(tier1_terms)  # most specific non-expanded term
        if context_term:
            precise_primary.append('" "'.join(top_expansions + [context_term]))

    # --- BROAD QUERIES (OR logic, medium weight) ---
    all_tier1 = tier1_terms + flatten_expansions(tier1_expansions)
    broad_primary = [' OR '.join(f'"{t}"' for t in deduplicate(all_tier1)[:6])]

    # --- SECONDARY QUERIES (from resolved_intent) ---
    precise_secondary = []
    broad_secondary = []
    if tier2_terms:
        all_tier2 = tier2_terms + flatten_expansions(tier2_expansions)
        precise_secondary = ['" "'.join(tier2_terms[:3])]
        broad_secondary = [' OR '.join(f'"{t}"' for t in deduplicate(all_tier2)[:6])]

    # --- EMBEDDING QUERIES ---
    # Query 1 (primary): original question + tier1 expansions
    # Query 2 (secondary): resolved_intent + tier2 expansions (if available)

    return {
        'precise_primary': precise_primary,
        'broad_primary': broad_primary,
        'precise_secondary': precise_secondary,
        'broad_secondary': broad_secondary,
    }
```

### 4.6 Query Example

```
User: "Wie lang ist der Dünndarm?"
Router: resolved_intent = "Länge des Dünndarms, Abschnitte Jejunum Ileum Duodenum"

TIER 1 (from user query):
  Terms: ["Dünndarm", "Länge"]
  KG expansion of "Dünndarm": Jejunum(8), Ileum(7), Duodenum(6)

  precise_primary:
    [1] "Dünndarm" "Länge"              ← original terms
    [2] "Jejunum" "Ileum" "Länge"       ← top expansions + context
    [3] "Duodenum" "Länge"              ← next expansion + context

  broad_primary:
    [1] "Dünndarm" OR "Jejunum" OR "Ileum" OR "Duodenum" OR "Länge"

TIER 2 (from resolved_intent, NEW terms only):
  New terms not in Tier 1: ["Abschnitte"]
  KG expansion: Anatomie(3), Verdauung(2)

  precise_secondary:
    [1] "Abschnitte" "Dünndarm"

  broad_secondary:
    [1] "Abschnitte" OR "Anatomie" OR "Verdauung"

EMBEDDING:
  primary:   "Wie lang ist der Dünndarm Jejunum Ileum Duodenum"
  secondary: "Länge Dünndarm Abschnitte Jejunum Ileum Anatomie"
```

---

## 5. Phase 3: Embedding Batch Call

### 5.1 Single API Call for Everything

All embeddings are computed in ONE batch request:

```python
texts_to_embed = []

# 1. KG fuzzy matching: terms without exact KG match
unmatched_terms = [t for t in all_terms if not t.has_exact_kg_match]
texts_to_embed.extend(unmatched_terms)

# 2. Semantic search: enriched embedding queries
texts_to_embed.append(primary_embedding_query)
if secondary_embedding_query:
    texts_to_embed.append(secondary_embedding_query)

# ONE API call
all_vectors = embed_texts(texts_to_embed)

# Split results
fuzzy_vectors = all_vectors[:len(unmatched_terms)]
semantic_vectors = all_vectors[len(unmatched_terms):]
```

### 5.2 KG Fuzzy Term Matching

After the batch returns, for each unmatched term:

```python
def fuzzy_kg_lookup(term_embedding, kg_term_index):
    """Find nearest KG term by cosine similarity.

    kg_term_index: pre-computed dict of {term: normalized_embedding_vector}
    Loaded once at startup from kg_terms table.
    """
    best_term = None
    best_score = 0.0

    for kg_term, kg_vec in kg_term_index.items():
        score = dot_product(term_embedding, kg_vec)
        if score > best_score:
            best_score = score
            best_term = kg_term

    if best_score >= 0.60:  # Minimum similarity threshold
        return best_term, best_score
    return None, 0.0
```

This handles:
- **Typos**: "Bauernfettgewebe" → "braunes Fettgewebe" (similarity ~0.78)
- **Synonyms**: "heart" → "Herz" (similarity ~0.82)
- **Cross-language**: Works for any language the embedding model supports

### 5.3 Pre-computing KG Term Embeddings

One-time setup: embed all terms in `kg_terms` table.

```python
def build_kg_term_index():
    """Embed all KG terms and store in kg_terms.embedding column.
    Run once after KG is built/updated. ~5000 terms = 1-2 batch calls.
    """
    terms = db.execute("SELECT term FROM kg_terms WHERE embedding IS NULL").fetchall()
    batches = chunk(terms, 50)
    for batch in batches:
        embeddings = embed_texts([t[0] for t in batch])
        for term, emb in zip(batch, embeddings):
            db.execute("UPDATE kg_terms SET embedding = ? WHERE term = ?",
                       (pack_floats(emb), term[0]))
```

At runtime, the KG term index is loaded into memory (same pattern as card embedding index). ~5000 terms × 3072 floats × 4 bytes = ~60MB. Acceptable.

---

## 6. Phase 4: Parallel Retrieval

### 6.1 SQL Search

Always searches the entire collection (no deck filtering).

```python
def sql_search(precise_queries, broad_queries):
    """Execute queries against Anki's search index.

    Cascade: precise first, broad only if precise yields < 5 unique notes.
    Returns: list of (note_id, rank) tuples, ranked by query specificity.
    """
    results = {}  # note_id → {rank, query_type, query_tier}

    rank = 0

    # Phase 1: Precise primary (AND, highest weight)
    for query in precise_primary:
        card_ids = mw.col.find_cards(query)
        for card_id in card_ids:
            note_id = resolve_note_id(card_id)
            if note_id not in results:
                results[note_id] = {'rank': rank, 'query_type': 'precise', 'tier': 'primary'}
                rank += 1

    # Phase 2: Broad primary (OR) — only if < 5 unique notes
    if len(results) < 5:
        for query in broad_primary:
            card_ids = mw.col.find_cards(query)
            for card_id in card_ids:
                note_id = resolve_note_id(card_id)
                if note_id not in results:
                    results[note_id] = {'rank': rank, 'query_type': 'broad', 'tier': 'primary'}
                    rank += 1

    # Phase 3: Precise secondary (AND, from resolved_intent)
    for query in precise_secondary:
        card_ids = mw.col.find_cards(query)
        for card_id in card_ids:
            note_id = resolve_note_id(card_id)
            if note_id not in results:
                results[note_id] = {'rank': rank, 'query_type': 'precise', 'tier': 'secondary'}
                rank += 1

    # Phase 4: Broad secondary (OR) — only if still < 5
    if len(results) < 5:
        for query in broad_secondary:
            card_ids = mw.col.find_cards(query)
            for card_id in card_ids:
                note_id = resolve_note_id(card_id)
                if note_id not in results:
                    results[note_id] = {'rank': rank, 'query_type': 'broad', 'tier': 'secondary'}
                    rank += 1

    return results
```

### 6.2 Semantic Search

Uses the embedding vectors computed in Phase 3.

```python
def semantic_search(primary_vector, secondary_vector, max_results=10):
    """Search in-memory embedding index. Always collection-wide.

    Returns: dict of note_id → {rank, tier}
    """
    results = {}

    # Primary embedding search
    primary_hits = embedding_manager.search(primary_vector, top_k=max_results)
    for rank, (card_id, score) in enumerate(primary_hits):
        note_id = resolve_note_id(card_id)
        if note_id not in results:
            results[note_id] = {'rank': rank, 'tier': 'primary', 'score': score}

    # Secondary embedding search (if available)
    if secondary_vector is not None:
        secondary_hits = embedding_manager.search(secondary_vector, top_k=max_results)
        for rank, (card_id, score) in enumerate(secondary_hits):
            note_id = resolve_note_id(card_id)
            if note_id not in results:
                results[note_id] = {'rank': rank, 'tier': 'secondary', 'score': score}

    return results
```

---

## 7. Phase 5: Reciprocal Rank Fusion + Confidence

### 7.1 Weighted RRF Formula

Each search produces a ranked list. RRF combines them with tier-aware weighting:

```python
# k-values: lower = more weight (steeper contribution curve)
K_PRECISE_PRIMARY   = 50   # AND queries from user's direct terms — highest weight
K_BROAD_PRIMARY     = 70   # OR queries from user's direct terms
K_SEMANTIC_PRIMARY  = 60   # Embedding search from user's query
K_PRECISE_SECONDARY = 90   # AND queries from Router intent
K_BROAD_SECONDARY   = 110  # OR queries from Router intent
K_SEMANTIC_SECONDARY = 120 # Embedding search from Router intent

def compute_rrf(sql_results, semantic_results):
    """
    Compute weighted RRF score for each note.

    sql_results: dict of note_id → {rank, query_type, tier}
    semantic_results: dict of note_id → {rank, tier}

    Returns: sorted list of (note_id, rrf_score)
    """
    scores = {}
    all_note_ids = set(sql_results.keys()) | set(semantic_results.keys())

    for note_id in all_note_ids:
        score = 0.0

        # SQL contribution
        if note_id in sql_results:
            sql = sql_results[note_id]
            rank = sql['rank']
            if sql['query_type'] == 'precise' and sql['tier'] == 'primary':
                score += 1.0 / (K_PRECISE_PRIMARY + rank)
            elif sql['query_type'] == 'broad' and sql['tier'] == 'primary':
                score += 1.0 / (K_BROAD_PRIMARY + rank)
            elif sql['query_type'] == 'precise' and sql['tier'] == 'secondary':
                score += 1.0 / (K_PRECISE_SECONDARY + rank)
            elif sql['query_type'] == 'broad' and sql['tier'] == 'secondary':
                score += 1.0 / (K_BROAD_SECONDARY + rank)

        # Semantic contribution
        if note_id in semantic_results:
            sem = semantic_results[note_id]
            rank = sem['rank']
            if sem['tier'] == 'primary':
                score += 1.0 / (K_SEMANTIC_PRIMARY + rank)
            else:
                score += 1.0 / (K_SEMANTIC_SECONDARY + rank)

        scores[note_id] = score

    return sorted(scores.items(), key=lambda x: x[1], reverse=True)
```

### 7.2 Scoring Examples

**Example 1: "Wie lang ist der Dünndarm?"** (standalone, clear question)

| Card | SQL (precise primary) | Semantic (primary) | RRF Score |
|------|----------------------|-------------------|-----------|
| "Jejunum+Ileum=5m" | rank 0 | rank 2 | 1/50 + 1/62 = **0.0361** |
| "Dünndarm Aufbau" | rank 2 | rank 0 | 1/52 + 1/60 = **0.0359** |
| "Ileum Resorption" | rank 1 | rank 5 | 1/51 + 1/65 = **0.0350** |
| "Magen Anatomie" | — | rank 3 | 0 + 1/63 = **0.0159** |

Cards found by precise AND queries rank ~2x higher than semantic-only cards.

**Example 2: "Wie meinst du das?"** (context-dependent, no direct terms)

| Card | SQL (precise secondary) | Semantic (secondary) | RRF Score |
|------|------------------------|---------------------|-----------|
| "K-Zellen GIP" | rank 0 | rank 1 | 1/90 + 1/121 = **0.0194** |
| "GIP Insulin" | rank 1 | rank 0 | 1/91 + 1/120 = **0.0193** |

Secondary-only results are correctly ranked lower than primary results would be — the system knows the signal is weaker.

### 7.3 Confidence Check

```python
# Initial values — must be tuned with real query/card data after implementation
CONFIDENCE_HIGH = 0.025   # At least 1 card in primary precise + semantic
CONFIDENCE_LOW  = 0.012   # Weak signal: secondary-only or broad-only

def check_confidence(rrf_results):
    """Determine retrieval confidence from RRF scores.

    Returns: 'high', 'medium', or 'low'
    """
    if not rrf_results:
        return 'low'

    top_score = rrf_results[0][1]

    if top_score >= CONFIDENCE_HIGH:
        return 'high'    # Strong match — answer from cards
    elif top_score >= CONFIDENCE_LOW:
        return 'medium'  # Partial match — answer from cards with caveat
    else:
        return 'low'     # Weak match — trigger web search
```

When confidence is `low`:
- Emit a pipeline step to the UI ("Keine ausreichenden Treffer in deinen Karten")
- Trigger web search via **Perplexity API** (single standard provider for all web searches)
- Enrich the Perplexity response with any weak card results as supplementary context
- Perplexity provides both the answer and source URLs — display as web citations

When confidence is `medium`:
- Answer from cards, but append a note that coverage may be incomplete
- Do NOT trigger web search (cards are sufficient, just not comprehensive)

### 7.4 Max Results

Fixed at **10 cards** (no Router decision needed). After RRF ranking, take the top 10. This is sufficient for even complex questions and keeps the generation context manageable.

---

## 8. Removed Complexity

The following Router fields and code paths are eliminated:

| Removed | Reason |
|---------|--------|
| `precise_queries` from Router | KG generates these locally |
| `broad_queries` from Router | KG generates these locally |
| `embedding_queries` from Router | KG generates these locally |
| `search_scope` from Router | Always collection-wide |
| `response_length` from Router | Generation model decides |
| `max_sources` from Router | Fixed at 10 |
| `retrieval_mode` from Router | Always hybrid (SQL + semantic) |
| `fix_router_queries()` in rag.py | No longer needed — KG handles query quality |
| `is_standalone_question()` in rag.py | Router's `resolved_intent` handles this |
| `_kg_retrieve()` in retrieval.py | KG is no longer a parallel search |
| Scope fallback logic in retrieval.py | No scope = no fallback needed |
| Legacy `rag_router()` in rag.py | Fully replaced by new Router + KG pipeline |

---

## 9. Data Requirements

### 9.1 KG Term Embeddings

The `kg_terms` table already has an `embedding` column. We need to:
1. Compute embeddings for all terms (one-time batch: ~5000 terms)
2. Load into an in-memory index at startup (same pattern as card embeddings)
3. Update embeddings when new terms are extracted

### 9.2 KG Quality

The system's recall depends on KG term coverage. Current extraction:
- Heuristic extraction (immediate, no LLM): detects compounds, abbreviations, capitalized phrases
- LLM extraction (background, rate-limited): deeper semantic term extraction

Both should continue. The heuristic extractor runs on every new card; the LLM extractor runs in background batches.

### 9.3 Co-occurrence Edge Quality

The `kg_edges` table must have meaningful weights. Current builder (`ai/kg_builder.py`) computes co-occurrence within the same card. Minimum edge weight of 2 (shared by at least 2 cards) is a good threshold.

---

## 10. Fallback Chain

The system degrades gracefully at each level:

| Failure | Fallback |
|---------|----------|
| Router fails (network, timeout) | Use user's direct query only (Tier 1), no resolved_intent |
| KG has no matching terms | Use original terms as-is for SQL queries |
| KG term embeddings not yet computed | Skip fuzzy matching, exact-only KG lookup |
| Embedding API fails | SQL-only search (no semantic) |
| SQL yields 0 results | Semantic results carry the ranking alone |
| Semantic yields 0 results | SQL results carry the ranking alone |
| Both yield 0 results | Confidence = low → trigger web search |
| All systems fail | Generate response without RAG context (current Level 3 fallback) |

---

## 11. Pipeline Visualization

Each phase emits steps for the frontend ReasoningStream:

| Phase | Step | Status | Data |
|-------|------|--------|------|
| Router | `router` | active/done | `{agent, search_needed}` |
| KG Enrichment | `kg_enrichment` | active/done | `{terms_found, expansions, tier1_count, tier2_count}` |
| SQL Search | `sql_search` | active/done | `{queries, total_hits}` |
| Semantic Search | `semantic_search` | active/done | `{total_hits, top_score}` |
| RRF Merge | `merge` | active/done | `{total, top_score, confidence}` |
| Web Fallback | `web_search` | active/done | (only if confidence=low) |

---

## 12. Files to Modify

| File | Changes |
|------|---------|
| `ai/router.py` | Simplify `UnifiedRoutingResult` to 3 fields. Update `unified_route()` payload. |
| `ai/retrieval.py` | Replace `HybridRetrieval` with new pipeline: KG enrichment → parallel search → RRF. Remove `_kg_retrieve()`, `_merge_results()`. |
| `ai/rag.py` | Remove `rag_router()`, `fix_router_queries()`, `is_standalone_question()`. Keep `rag_retrieve_cards()` (SQL search) with simplified interface (no scope parameter). |
| `ai/rag_pipeline.py` | Update `retrieve_rag_context()` to use new pipeline. Remove scope/mode parsing. |
| `ai/embeddings.py` | Add `embed_batch()` for multi-purpose embedding. Add KG term index loading. |
| `storage/kg_store.py` | Add `load_term_index()` for in-memory KG term embeddings. Add `get_expansions(term)`. |
| `ai/kg_builder.py` | Add `build_term_embeddings()` step after graph index build. |
| `ai/tutor.py` | Minimal changes — receives new pipeline output format. |
| Backend `/router` endpoint | Simplify prompt. Return only 3 fields. |

### New Files

| File | Purpose |
|------|---------|
| `ai/kg_enrichment.py` | KG Query Enrichment module: term extraction, KG lookup, fuzzy matching, query generation |
| `ai/rrf.py` | Reciprocal Rank Fusion: scoring, confidence check |

---

## 13. Performance Characteristics

| Metric | Current | New |
|--------|---------|-----|
| Router latency | ~300ms (generates 6+ fields) | ~250ms (3 fields, simpler prompt) |
| Query generation | 0ms (Router already did it) | ~30ms (KG local) |
| Embedding calls | 1 call (semantic queries only) | 1 call (fuzzy + semantic batched) |
| SQL search | ~300ms (with scope filtering) | ~300ms (no filtering, same index speed) |
| Semantic search | ~50ms (index scan) | ~50ms (same) |
| Merge | <1ms (naive counting) | <1ms (RRF math) |
| **Total retrieval** | **~650-800ms** | **~630-780ms** |
| **Quality** | Router guesses terms | KG knows actual vocabulary |
| **Recall** | Misses synonym/cross-deck cards | Finds via KG expansion + collection-wide |
| **Ranking** | Source-count heuristic | Mathematically optimal (RRF) |

---

## 14. Success Criteria

1. **Recall test**: Given a question whose answer exists in the cards, the answer card is in the top-3 RRF results. Target: >95% of test cases.
2. **Typo tolerance**: Misspelled terms (1-2 character errors) still find the correct cards via embedding fuzzy matching. Target: >90%.
3. **Context resolution**: Context-dependent questions ("explain that") correctly resolve to the right topic. Target: >90% (Router dependent).
4. **Latency**: Total retrieval under 1000ms for 95th percentile.
5. **Confidence accuracy**: When confidence=high, the answer IS in the cards. When confidence=low, web search IS needed. Target: >85% accuracy.
