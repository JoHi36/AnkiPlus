# Retrieval Benchmark System — Design Spec

**Date:** 2026-03-27
**Status:** Design approved
**Scope:** `scripts/benchmark.py`, `scripts/benchmark_generate.py`, `benchmark/` directory

---

## 1. Goal

A standalone benchmark system that measures retrieval quality at every pipeline step, generates test cases automatically from the user's cards, and provides a visual web dashboard for iterative optimization. No Anki installation needed to run.

---

## 2. Architecture

Three components, each a standalone Python script:

```
[1] benchmark_generate.py     [2] benchmark.py          [2b] benchmark.py --serve
    Read cards from DB             Run all test cases          HTTP server :8080
    Generate test cases            Score each step             Visual dashboard
    Output: test_cases.json        Output: results.json        Browse results
```

### Dependencies

- Python stdlib only (sqlite3, http.server, json, struct, math, urllib)
- Access to `storage/card_sessions.db` (KG terms, edges, embeddings)
- Access to backend `/embed` API (for embedding-based steps)
- NO Anki, NO PyQt, NO npm/React

---

## 3. Test Case Generator

### File: `scripts/benchmark_generate.py`

Reads cards from the SQLite database and generates test cases across 5 difficulty categories.

### Input

- `storage/card_sessions.db` — KG terms, edges, card_terms mappings
- Anki card data accessed via `card_sessions.db` embeddings table (has card_id, which maps to KG terms)

### Test Case Categories

| Category | % | Description | How Generated |
|----------|---|-------------|---------------|
| **Direct** | 40% | Query uses same terms as card | Take card's KG terms, form a question using those exact terms |
| **Synonym** | 20% | Query uses different but related terms | Take card's KG terms, replace with edge-connected or embedding-similar terms |
| **Context** | 15% | Vague query + card context | "Erkläre das genauer" + card as context. Tests context resolution. |
| **Cross-Deck** | 15% | Query about topic in a different deck | Pick a card, form question, set search scope expectation to collection-wide |
| **Typo** | 10% | Misspelled domain terms | Take a KG term, introduce 1-2 character errors |

### Test Case Schema

```json
{
  "id": "direct_001",
  "category": "direct",
  "query": "Wie lang ist der Dünndarm?",
  "card_context": null,
  "expected_card_id": 1635491057757,
  "expected_note_id": 1635491057123,
  "expected_terms": ["Dünndarm", "Jejunum", "Ileum"],
  "expected_in_top_k": 3,
  "difficulty": "easy",
  "metadata": {
    "source_card_question": "Wie lang ist der Dünndarm?",
    "source_card_answer": "3-5 Meter (Jejunum + Ileum)",
    "source_deck": "Anatomie::GI-Trakt",
    "kg_terms_on_card": ["Dünndarm", "Jejunum", "Ileum"]
  }
}
```

### Generation Strategy

1. Query `kg_card_terms` to find cards with ≥3 KG terms (rich enough for testing)
2. Group by deck to ensure diverse coverage
3. For each selected card:
   - **Direct**: Use the card's front field (question) or construct from KG terms
   - **Synonym**: Look up edge-connected terms, replace one key term
   - **Context**: Use "Erkläre das genauer" with card as context
   - **Typo**: Pick the most specific KG term, swap/delete/insert a character
   - **Cross-Deck**: Same as Direct but pick a card from a different deck than usual
4. Set `expected_card_id` to the source card
5. Generate ~80 test cases total

### Output

`benchmark/test_cases.json` — array of test case objects.

---

## 4. Benchmark Runner

### File: `scripts/benchmark.py`

Runs all test cases through the retrieval pipeline and scores each step.

### Pipeline Steps Measured

For each test case, the runner executes:

**Step 1: Term Extraction**
- Call `extract_query_terms(query)`
- Score: Do `expected_terms` appear in extracted terms? → Precision & Recall

**Step 2: KG Expansion**
- Call `enrich_query()` with embeddings
- Score: Are `expected_terms` in the expanded term set? → Hit-Rate
- Track: Which expansion path found them (embedding vs edge vs both)

**Step 3: SQL Search**
- Execute generated precise + broad queries against card_sessions.db
- NOTE: We can't call `mw.col.find_cards()` without Anki. Instead, search the `kg_card_terms` table: if a query term appears as a KG term on a card, that card is a "SQL hit".
- Score: Is `expected_card_id` in SQL results? → Recall@10

**Step 4: Semantic Search**
- Embed the enriched query, search against card embedding index
- Score: Is `expected_card_id` in semantic results? → Recall@10

**Step 5: RRF Ranking**
- Combine SQL + Semantic via `compute_rrf()`
- Score: What rank is `expected_card_id`? → MRR (Mean Reciprocal Rank)
- Score: Is it in top-3? → Recall@3

**Step 6: Confidence**
- Check `check_confidence()` result
- Score: If card exists → confidence should be high/medium. If card doesn't exist → should be low.

### Scoring

Per test case:
```json
{
  "id": "direct_001",
  "category": "direct",
  "query": "...",
  "steps": {
    "term_extraction": {"score": 1.0, "extracted": ["Dünndarm"], "expected": ["Dünndarm"], "detail": "1/1 terms found"},
    "kg_expansion": {"score": 0.67, "found": ["Dünndarm", "Duodenum"], "missed": ["Jejunum"], "path": {"Duodenum": "sentence_embedding"}},
    "sql_search": {"score": 1.0, "target_rank": 2, "total_hits": 15},
    "semantic_search": {"score": 1.0, "target_rank": 5, "total_hits": 10},
    "rrf_ranking": {"score": 1.0, "target_rank": 1, "rrf_score": 0.0342},
    "confidence": {"score": 1.0, "level": "high", "expected": "high"}
  },
  "overall_pass": true,
  "target_in_top3": true
}
```

Aggregate scores:
```json
{
  "overall": {"recall_at_3": 0.78, "mrr": 0.72, "total_cases": 80, "passed": 62},
  "by_category": {
    "direct": {"recall_at_3": 0.95, "count": 32},
    "synonym": {"recall_at_3": 0.56, "count": 16},
    "context": {"recall_at_3": 0.50, "count": 12},
    "cross_deck": {"recall_at_3": 0.83, "count": 12},
    "typo": {"recall_at_3": 0.38, "count": 8}
  },
  "by_step": {
    "term_extraction": {"avg_score": 0.89},
    "kg_expansion": {"avg_score": 0.62},
    "sql_search": {"avg_recall_at_10": 0.85},
    "semantic_search": {"avg_recall_at_10": 0.91},
    "rrf_ranking": {"avg_mrr": 0.72},
    "confidence": {"accuracy": 0.88}
  }
}
```

### CLI Usage

```bash
# Generate test cases (one-time, re-run when cards change)
python3 scripts/benchmark_generate.py

# Run benchmark
python3 scripts/benchmark.py

# Run single category
python3 scripts/benchmark.py --category synonym

# Run single test case
python3 scripts/benchmark.py --id direct_001

# Start web dashboard
python3 scripts/benchmark.py --serve
```

---

## 5. Web Dashboard

### Served by `benchmark.py --serve` on `localhost:8080`

Single HTML page (inline CSS/JS, no build step). Vanilla JavaScript. Reads results.json from disk.

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  RETRIEVAL BENCHMARK                     [Re-Run] [Gen] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  OVERALL: Recall@3 = 78%  |  MRR = 0.72  |  80 cases   │
│  ████████████████████░░░░░░                             │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  BY STEP                          BY CATEGORY           │
│  ┌──────────────────────┐         ┌──────────────────┐  │
│  │ Term Extract.   89%  │         │ Direct      95%  │  │
│  │ KG Expansion    62%  │ ← weak  │ Synonym     56%  │  │
│  │ SQL Search      85%  │         │ Context     50%  │  │
│  │ Semantic Search 91%  │         │ Cross-Deck  83%  │  │
│  │ RRF Ranking     72%  │         │ Typo        38%  │  │
│  │ Confidence      88%  │         └──────────────────┘  │
│  └──────────────────────┘                               │
├─────────────────────────────────────────────────────────┤
│  TEST CASES                                    Filter:  │
│  ┌──────┬──────────┬────────────────┬──────┬──────────┐ │
│  │ ID   │ Category │ Query          │ Rank │ Status   │ │
│  ├──────┼──────────┼────────────────┼──────┼──────────┤ │
│  │ d001 │ direct   │ Wie lang is... │ #1   │ ✅ PASS  │ │
│  │ s005 │ synonym  │ Jejunum Län... │ #8   │ ❌ FAIL  │ │
│  │ c003 │ context  │ Erkläre das... │ —    │ ❌ MISS  │ │
│  └──────┴──────────┴────────────────┴──────┴──────────┘ │
│                                                         │
│  Click a row to see pipeline trace ↓                    │
│                                                         │
│  ┌─────────────────────────────────────────────────────┐│
│  │ PIPELINE TRACE: s005                                ││
│  │                                                     ││
│  │ 1. Terms: ["Jejunum", "Länge"]                     ││
│  │ 2. KG Expansion:                                   ││
│  │    Sentence → Dünndarm(0.67), Ileum(0.63)          ││
│  │    Edges → Jejunum→Ileum(5)                         ││
│  │ 3. SQL: "Jejunum" → 12 hits (target: rank #4)      ││
│  │ 4. Semantic: 10 hits (target: rank #2)              ││
│  │ 5. RRF: target rank #3 (score: 0.028)               ││
│  │    ⚠ Below top-3 threshold                          ││
│  │ 6. Confidence: medium                                ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

### Features

- **Re-Run button**: Runs benchmark again (after code changes), reloads results
- **Gen button**: Regenerates test cases
- **Category filter**: Show only direct/synonym/context/etc.
- **Status filter**: Show only PASS/FAIL
- **Click-to-expand**: Each test case shows full pipeline trace
- **Step highlighting**: Steps that failed are highlighted red in the trace

---

## 6. SQL Search Without Anki

Since we can't call `mw.col.find_cards()` without Anki running, the benchmark uses a proxy:

**KG-based card matching**: A query term matches a card if:
- The term exists in `kg_card_terms` for that card, OR
- The term appears as a substring in the card's embedding text (stored in card_sessions)

This isn't identical to Anki's full-text search, but close enough for benchmarking. The semantic search (embedding cosine similarity) works identically to production.

---

## 7. Files

| File | Purpose |
|------|---------|
| `scripts/benchmark_generate.py` | Generate test cases from cards |
| `scripts/benchmark.py` | Run benchmark + serve dashboard |
| `benchmark/test_cases.json` | Generated test cases |
| `benchmark/results.json` | Latest benchmark results |
| `benchmark/dashboard.html` | Inline HTML/CSS/JS dashboard template |

---

## 8. Not In Scope (Phase 2)

- LLM generation quality scoring (evaluate the answer text)
- Router benchmark (test resolved_intent quality)
- Automated regression detection (run on every commit)
- Multi-language test cases
- Performance benchmarks (latency per step)

These can be added incrementally on top of the Phase 1 retrieval benchmark.
