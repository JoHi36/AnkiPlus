# Retrieval System — Architecture & Evaluation Guide

## Overview

The retrieval system finds relevant flashcards for a user's question. It combines three search strategies into a single ranked result via Reciprocal Rank Fusion (RRF).

**Core principle:** Embedding-first KG expansion, then Graph edges, then parallel SQL + Semantic search, then mathematical ranking.

## Pipeline (5 Phases)

```
USER QUESTION: "wie lang ist der dünndarm"
    |
    v
PHASE 1: ROUTER (~250ms, backend LLM)
    Agent routing + context resolution
    Output: {agent: "tutor", search_needed: true, resolved_intent: "..."}
    |
    v
PHASE 2: TERM EXTRACTION + EMBEDDING (~200ms, 1 API call)
    Extract terms: ["dünndarm"]
    Batch embed: ["dünndarm", "wie lang ist der dünndarm"]
    -> term vectors (for KG fuzzy matching)
    -> sentence vector (for KG expansion + semantic search)
    |
    v
PHASE 3: KG ENRICHMENT (~30ms, local)
    A. Sentence-level expansion: sentence vector vs 17k KG term embeddings
       -> finds: Duodenum(0.67), Jejunum(0.66), Ileumschlingen(0.69)
       -> filters morphological variants (Dünndarms, Dünndarmkonvolut)
    B. KG-based stopword filter: "macht", "liegt" NOT in KG -> excluded from SQL
    C. Edge expansion: Dünndarm -> Dickdarm(7), Pankreas(6)
       Duodenum -> Jejunum edges, etc.
    D. Query generation (deterministic, no LLM):
       Precise: "dünndarm", "Duodenum", "Jejunum", "Dickdarm", "Pankreas"
       Broad: "dünndarm" OR "Duodenum" OR "Jejunum" OR ...
       Embedding: "wie lang ist der dünndarm Duodenum Jejunum Ileumschlingen"
    |
    v
PHASE 4: PARALLEL SEARCH
    SQL Search: Anki find_cards() with generated queries (always collection-wide)
    Semantic Search: cosine similarity against 8k+ card embedding index
    |
    v
PHASE 5: RRF + CONFIDENCE
    Weighted Reciprocal Rank Fusion:
      score(card) = 1/(k + rank_sql) + 1/(k + rank_semantic)
    k-values by tier:
      Precise Primary:    k=50  (highest weight)
      Semantic Primary:   k=60
      Broad Primary:      k=70
      Precise Secondary:  k=90
      Broad Secondary:    k=110
      Semantic Secondary: k=120 (lowest weight)
    Confidence: high (>0.025), medium (>0.012), low (<0.012 -> web search)
```

## Key Files

| File | Responsibility |
|------|---------------|
| `ai/kg_enrichment.py` | Term extraction, KG expansion (embedding + edges), query generation |
| `ai/rrf.py` | Reciprocal Rank Fusion scoring, confidence check |
| `ai/retrieval.py` | `EnrichedRetrieval` class — orchestrates the full pipeline |
| `ai/rag_pipeline.py` | Entry point: `retrieve_rag_context()`, routes to EnrichedRetrieval |
| `ai/rag.py` | SQL search: `rag_retrieve_cards()` (Anki find_cards wrapper) |
| `ai/embeddings.py` | Embedding API, in-memory card index, KG term index, fuzzy search |
| `ai/router.py` | Agent routing (tutor/research/help/plusi), resolved_intent |
| `ai/tutor.py` | Tutor agent — calls pipeline, handles generation + fallback |
| `storage/kg_store.py` | KG persistence: terms, edges, definitions, embeddings |
| `ai/kg_builder.py` | Builds KG graph (edges, frequencies, term embeddings) |

## KG Enrichment Strategy

### Universal Stopword Filtering

No hardcoded stopword lists per language. Instead:

```
Term in KG? -> Domain term -> use for SQL + Embedding queries
Term NOT in KG? -> Generic word -> use for Embedding only (not SQL)
```

The KG contains only terms extracted from the user's cards. "Dünndarm", "ATP", "Plexus brachialis" are in the KG. "macht", "liegt", "produziert" are not. This works for ANY language.

### Term Expansion (Embedding-first, then Edges)

```
1. Sentence embedding vs KG term embeddings -> semantic synonyms
   (Dünndarm question finds Duodenum, Jejunum)
2. Edge expansion on ALL found terms -> co-occurrence terms
   (Dünndarm -> Dickdarm, Pankreas; Duodenum -> Jejunum)
3. Morphological variant filter removes noise
   (Dünndarms, Dünndarmkonvolut filtered out)
```

### Multi-Word Term Detection

Latin compound prefixes (Plexus, Nervus, Arteria, etc.) trigger multi-word extraction:
- "Plexus brachialis" -> one term (not "Plexus" + "brachialis")
- Consecutive capitalized words: "Braunes Fettgewebe" -> one term

### Query Priority

Precise SQL queries are ordered by relevance:
1. Original terms (user's own words)
2. Edge-expanded terms from originals (high co-occurrence = high card relevance)
3. Sentence-embedding expansion terms (new vocabulary)
4. Edge-expanded terms from embedding-found terms

Max 5 precise queries to reduce noise.

## RRF Scoring

Reciprocal Rank Fusion (Cormack et al., 2009) combines ranked lists without requiring score normalization:

```python
score(card) = sum(1 / (k + rank_i)) for each search that found the card
```

Lower k = more weight. Cards found by multiple searches get a natural multi-source boost.

Constants in `ai/rrf.py`:
- `K_PRECISE_PRIMARY = 50` (AND queries from user's terms)
- `K_SEMANTIC_PRIMARY = 60` (embedding search from user's query)
- `K_BROAD_PRIMARY = 70` (OR queries from user's terms)
- `K_PRECISE_SECONDARY = 90` (queries from Router intent)
- `K_BROAD_SECONDARY = 110`
- `K_SEMANTIC_SECONDARY = 120`

Confidence thresholds (tunable):
- `CONFIDENCE_HIGH = 0.025` (answer from cards)
- `CONFIDENCE_LOW = 0.012` (trigger Perplexity web search)

## Evaluation

### CLI Eval Script

Test the enrichment pipeline without running Anki:

```bash
# Single query
python3 scripts/eval_retrieval.py "wie lang ist der dünndarm"

# All built-in test queries
python3 scripts/eval_retrieval.py --all
```

Output shows every pipeline step:
1. Term Extraction (which terms were extracted)
2. Embedding (API call timing)
3. Sentence-Level KG Expansion (which KG terms matched, with scores)
4. Term-Level KG Expansion (morphological matches)
5. Graph Edge Expansion (co-occurrence terms with weights)
6. Full enrich_query() result (final queries, tier breakdown)

### Test Suite

```bash
python3 run_tests.py -k test_rrf -v          # RRF scoring tests (10 tests)
python3 run_tests.py -k test_kg_enrichment -v  # KG enrichment tests (11 tests)
python3 run_tests.py -k test_kg_store -v       # KG storage tests
python3 run_tests.py -k test_kg_builder -v     # KG builder tests
```

### Test Queries for Manual Evaluation

| Query | Expected Key Terms |
|---|---|
| "wie lang ist der dünndarm" | Dünndarm, Jejunum, Ileum, Duodenum |
| "was macht ATP in der Zelle" | ATP, ADP, AMP, Glykolyse, Phosphorylierung, Atmungskette |
| "wo liegt der Plexus brachialis" | Plexus brachialis, C5-T1, Armnerven |
| "welche Hormone produziert die Schilddrüse" | Hormone, Schilddrüse, T3, T4, Calcitonin |
| "Bauernfettgewebe" (typo) | braunes Fettgewebe, UCP1, Thermogenese |
| "wie funktioniert die Nernst-Gleichung" | Nernst-Gleichung, Membranpotential |
| "welche Hirnnerven gibt es" | Hirnnerven, Hirnstamm, Ganglien |

## Known Limitations & Next Steps

### Current Limitations

1. **KG-Term-Embeddings sind als Einzelwörter embedded** — "Jejunum" als nacktes Wort ist lexikalisch weit von "Dünndarm". Sentence-Embedding der Frage findet es (Score 0.66), aber viele Darm*-Varianten scoren höher.

2. **Nur 28 von 17.335 Termen haben Definitionen** — Terme mit Definition werden besser embedded ("Jejunum: mittlerer Abschnitt des Dünndarms"), aber fast alle Terme haben noch keine.

3. **Embedding-API-Latenz** — ~200ms pro Batch-Call. Nicht schlimm, aber addiert sich.

4. **Confidence-Schwellenwerte sind Schätzungen** — müssen mit echten Daten kalibriert werden.

### High-Impact Next Steps

1. **Mehr KG-Definitionen generieren** — Jeder Term mit Definition bekommt ein semantisch reicheres Embedding. Target: 1000+ Definitionen.

2. **Term-Embeddings re-berechnen** mit Definitionen — einmalig nach Definition-Generierung.

3. **Confidence-Thresholds kalibrieren** — RRF-Scores loggen + User-Feedback korrelieren.

4. **Backend-Router-Prompt vereinfachen** — Nur noch 3 Felder (agent, search_needed, resolved_intent) statt 8+.

## Architecture History

- **v1 (pre-2026-03-27):** LLM Router generates queries, KG as dead-arm parallel search, source-count merge.
- **v2 (2026-03-27):** KG-enriched query expansion, RRF scoring, embedding-first expansion, universal KG stopword filter. Spec: `docs/superpowers/specs/2026-03-27-retrieval-algorithm-redesign.md`
