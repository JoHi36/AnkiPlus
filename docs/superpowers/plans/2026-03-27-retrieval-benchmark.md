# Retrieval Benchmark System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A standalone benchmark that measures retrieval quality at every pipeline step, generates test cases from cards, and shows results in a web dashboard on localhost:8080.

**Architecture:** Three scripts: generator (creates test cases from KG data), runner (executes pipeline and scores), server (HTML dashboard). All use Python stdlib + SQLite only. No Anki needed.

**Tech Stack:** Python 3.9+, sqlite3, http.server, json, struct, math, urllib.

**Spec:** `docs/superpowers/specs/2026-03-27-retrieval-benchmark.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `scripts/benchmark_generate.py` | Generate test cases from KG database |
| `scripts/benchmark_run.py` | Run benchmark pipeline, score each step, save results |
| `scripts/benchmark_serve.py` | HTTP server + HTML dashboard on :8080 |
| `benchmark/test_cases.json` | Generated test cases (output of generate) |
| `benchmark/results.json` | Benchmark results (output of run) |

---

## Task 1: Test Case Generator

Generate ~80 test cases from KG data across 5 categories: direct (40%), synonym (20%), context (15%), cross-deck (15%), typo (10%).

**Files:** Create `scripts/benchmark_generate.py`, create `benchmark/` directory.

The generator reads `kg_card_terms` to find cards with 4+ terms, splits them into pools per category, and generates questions using templates. Each case has `expected_card_id` and `expected_terms` as ground truth.

**Run:** `python3 scripts/benchmark_generate.py`
**Output:** `benchmark/test_cases.json`
**Commit:** `feat(benchmark): test case generator from KG data`

---

## Task 2: Benchmark Runner

Run each test case through the enrichment pipeline and score every step.

**Files:** Create `scripts/benchmark_run.py`

For each test case, the runner:
1. Calls `extract_query_terms()` — scores term precision/recall
2. Calls `enrich_query()` with embeddings — scores KG expansion hit-rate
3. SQL proxy search via `kg_card_terms` — scores recall@10
4. Semantic search via card embeddings — scores recall@10
5. `compute_rrf()` — scores MRR (Mean Reciprocal Rank)
6. `check_confidence()` — scores accuracy

Aggregates results by category and by step.

**Run:** `python3 scripts/benchmark_run.py` or `--category synonym` or `--id direct_001`
**Output:** `benchmark/results.json`
**Commit:** `feat(benchmark): pipeline runner with step-by-step scoring`

---

## Task 3: Web Dashboard

Standalone HTTP server serving a visual benchmark dashboard.

**Files:** Create `scripts/benchmark_serve.py`

Dashboard shows:
- Overall Recall@K and MRR (big number)
- Score bars per pipeline step (term extraction, KG expansion, SQL, semantic, RRF, confidence)
- Score per category (direct, synonym, context, cross-deck, typo)
- Filterable table of all test cases with pass/fail status
- Click-to-expand pipeline trace for each case
- Re-Run and Regenerate buttons

Uses Python `http.server` with inline HTML/CSS/JS. Dark theme matching the app design. No build step, no external dependencies.

The dashboard renders results client-side from `/api/results` endpoint. Re-Run triggers `benchmark_run.py` via subprocess. Regenerate triggers `benchmark_generate.py`.

NOTE: The dashboard uses safe DOM construction via `document.createElement` and `textContent` for user data to prevent XSS. Only structural HTML is set via template literals in the initial page load (no user-controlled data in the template).

**Run:** `python3 scripts/benchmark_serve.py` then open `http://localhost:8080`
**Commit:** `feat(benchmark): web dashboard on localhost:8080`

---

## Post-Implementation Flow

```bash
python3 scripts/benchmark_generate.py   # 1. Generate test cases
python3 scripts/benchmark_run.py         # 2. Run pipeline + score
python3 scripts/benchmark_serve.py       # 3. Open dashboard
# Open http://localhost:8080
# Change code -> click Re-Run -> see if scores improved
```
