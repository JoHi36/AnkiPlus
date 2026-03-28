# Retrieval Algorithm Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace naive KG-parallel-search + LLM-query-generation + source-counting merge with KG-enriched query expansion + deterministic query generation + Reciprocal Rank Fusion scoring.

**Architecture:** The KG moves from a third parallel search to a pre-search enrichment layer. The Router is slimmed to 3 fields (agent, search_needed, resolved_intent). Queries are generated deterministically from KG-expanded terms. SQL and Semantic results are merged via weighted RRF. A confidence score triggers Perplexity web search when cards don't cover the topic.

**Tech Stack:** Python 3.9+, SQLite (WAL mode), Gemini text-embedding-004 (3072-dim), Anki `mw.col.find_cards()`, numpy-free cosine similarity.

**Spec:** `docs/superpowers/specs/2026-03-27-retrieval-algorithm-redesign.md`

**Test runner:** `python3 run_tests.py -k <test_pattern> -v` (mocks aqt/PyQt automatically)

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `ai/rrf.py` | Reciprocal Rank Fusion: `compute_rrf()`, `check_confidence()`. Pure math, no imports from Anki. |
| `ai/kg_enrichment.py` | KG Query Enrichment: `enrich_query()` — term extraction, KG lookup, fuzzy matching, deterministic query generation. |
| `tests/test_rrf.py` | RRF unit tests |
| `tests/test_kg_enrichment.py` | KG enrichment unit tests |

### Modified Files

| File | Changes |
|------|---------|
| `storage/kg_store.py` | Add `load_term_embeddings()`, `get_term_expansions()`, `exact_term_lookup()` |
| `ai/embeddings.py` | Add `load_kg_term_index()`, `fuzzy_term_search()` methods |
| `ai/kg_builder.py` | Add `build_term_embeddings()` function |
| `ai/router.py` | Add `resolved_intent` field to `UnifiedRoutingResult`. Keep legacy fields for migration. |
| `ai/rag.py` | Mark `rag_router()`, `fix_router_queries()`, `is_standalone_question()` as deprecated. Simplify `rag_retrieve_cards()` (remove scope filtering). |
| `ai/retrieval.py` | Add `EnrichedRetrieval` class alongside existing `HybridRetrieval`. |
| `ai/rag_pipeline.py` | Update `retrieve_rag_context()` to prefer `EnrichedRetrieval` with `HybridRetrieval` fallback. |
| `ai/tutor.py` | No code changes needed — pipeline change is transparent. |

---

## Task 1: RRF Module

Pure math module. No Anki dependencies. Fully testable.

**Files:**
- Create: `ai/rrf.py`
- Create: `tests/test_rrf.py`

- [ ] **Step 1: Write failing tests for `compute_rrf` and `check_confidence`**

```python
# tests/test_rrf.py
"""Tests for Reciprocal Rank Fusion scoring."""
import unittest


class TestComputeRrf(unittest.TestCase):

    def test_single_source_sql_precise_primary(self):
        """Card found only by precise primary SQL gets expected score."""
        from ai.rrf import compute_rrf
        sql_results = {'note_1': {'rank': 0, 'query_type': 'precise', 'tier': 'primary'}}
        semantic_results = {}
        ranked = compute_rrf(sql_results, semantic_results)
        self.assertEqual(ranked[0][0], 'note_1')
        # 1/(50+0) = 0.02
        self.assertAlmostEqual(ranked[0][1], 0.02, places=4)

    def test_dual_source_ranks_higher(self):
        """Card found by both SQL and semantic ranks above single-source."""
        from ai.rrf import compute_rrf
        sql_results = {
            'note_dual': {'rank': 1, 'query_type': 'precise', 'tier': 'primary'},
            'note_sql_only': {'rank': 0, 'query_type': 'precise', 'tier': 'primary'},
        }
        semantic_results = {
            'note_dual': {'rank': 0, 'tier': 'primary'},
            'note_sem_only': {'rank': 1, 'tier': 'primary'},
        }
        ranked = compute_rrf(sql_results, semantic_results)
        note_ids = [nid for nid, _ in ranked]
        self.assertEqual(note_ids[0], 'note_dual')

    def test_primary_outweighs_secondary(self):
        """Primary tier card ranks above secondary tier card at same rank."""
        from ai.rrf import compute_rrf
        sql_results = {
            'note_primary': {'rank': 0, 'query_type': 'precise', 'tier': 'primary'},
            'note_secondary': {'rank': 0, 'query_type': 'precise', 'tier': 'secondary'},
        }
        ranked = compute_rrf(sql_results, {})
        self.assertEqual(ranked[0][0], 'note_primary')
        self.assertGreater(ranked[0][1], ranked[1][1])

    def test_precise_outweighs_broad(self):
        """Precise query match ranks above broad query match at same rank."""
        from ai.rrf import compute_rrf
        sql_results = {
            'note_precise': {'rank': 0, 'query_type': 'precise', 'tier': 'primary'},
            'note_broad': {'rank': 0, 'query_type': 'broad', 'tier': 'primary'},
        }
        ranked = compute_rrf(sql_results, {})
        self.assertEqual(ranked[0][0], 'note_precise')

    def test_empty_inputs(self):
        """Empty inputs return empty list."""
        from ai.rrf import compute_rrf
        self.assertEqual(compute_rrf({}, {}), [])

    def test_returns_sorted_descending(self):
        """Results are sorted by score descending."""
        from ai.rrf import compute_rrf
        sql_results = {
            'note_a': {'rank': 5, 'query_type': 'broad', 'tier': 'secondary'},
            'note_b': {'rank': 0, 'query_type': 'precise', 'tier': 'primary'},
        }
        ranked = compute_rrf(sql_results, {})
        scores = [s for _, s in ranked]
        self.assertEqual(scores, sorted(scores, reverse=True))


class TestCheckConfidence(unittest.TestCase):

    def test_high_confidence(self):
        from ai.rrf import check_confidence
        rrf_results = [('note_1', 0.035), ('note_2', 0.020)]
        self.assertEqual(check_confidence(rrf_results), 'high')

    def test_medium_confidence(self):
        from ai.rrf import check_confidence
        rrf_results = [('note_1', 0.018)]
        self.assertEqual(check_confidence(rrf_results), 'medium')

    def test_low_confidence(self):
        from ai.rrf import check_confidence
        rrf_results = [('note_1', 0.008)]
        self.assertEqual(check_confidence(rrf_results), 'low')

    def test_empty_results(self):
        from ai.rrf import check_confidence
        self.assertEqual(check_confidence([]), 'low')


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 run_tests.py -k test_rrf -v`
Expected: `ModuleNotFoundError: No module named 'ai.rrf'`

- [ ] **Step 3: Implement `ai/rrf.py`**

```python
# ai/rrf.py
"""Reciprocal Rank Fusion -- mathematically optimal merging of ranked search results.

Combines SQL keyword search and semantic embedding search into a single
unified ranking. Uses tier-aware k-values so that:
  - Precise AND queries from user's direct terms rank highest
  - Broad OR queries rank lower
  - Secondary queries from Router's resolved_intent rank lowest
  - Cards found by multiple searches get a natural multi-source boost

Reference: Cormack, Clarke and Buettcher (2009) -- RRF for information retrieval.
"""

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

# k-values: lower = more weight (steeper contribution curve)
K_PRECISE_PRIMARY = 50    # AND queries from user's direct terms
K_BROAD_PRIMARY = 70      # OR queries from user's direct terms
K_SEMANTIC_PRIMARY = 60   # Embedding search from user's query
K_PRECISE_SECONDARY = 90  # AND queries from Router intent
K_BROAD_SECONDARY = 110   # OR queries from Router intent
K_SEMANTIC_SECONDARY = 120  # Embedding search from Router intent

# Confidence thresholds -- tune with real data after deployment
CONFIDENCE_HIGH = 0.025
CONFIDENCE_LOW = 0.012


def _get_k(query_type, tier):
    """Return the k-value for a given query type and tier."""
    if query_type == 'precise' and tier == 'primary':
        return K_PRECISE_PRIMARY
    elif query_type == 'broad' and tier == 'primary':
        return K_BROAD_PRIMARY
    elif query_type == 'semantic' and tier == 'primary':
        return K_SEMANTIC_PRIMARY
    elif query_type == 'precise' and tier == 'secondary':
        return K_PRECISE_SECONDARY
    elif query_type == 'broad' and tier == 'secondary':
        return K_BROAD_SECONDARY
    else:
        return K_SEMANTIC_SECONDARY


def compute_rrf(sql_results, semantic_results):
    """Compute weighted RRF score for each note.

    Args:
        sql_results: dict of note_id -> {rank: int, query_type: str, tier: str}
        semantic_results: dict of note_id -> {rank: int, tier: str}

    Returns:
        Sorted list of (note_id, rrf_score) tuples, descending by score.
    """
    scores = {}
    all_note_ids = set(sql_results.keys()) | set(semantic_results.keys())

    for note_id in all_note_ids:
        score = 0.0

        if note_id in sql_results:
            sql = sql_results[note_id]
            k = _get_k(sql['query_type'], sql['tier'])
            score += 1.0 / (k + sql['rank'])

        if note_id in semantic_results:
            sem = semantic_results[note_id]
            k = _get_k('semantic', sem['tier'])
            score += 1.0 / (k + sem['rank'])

        scores[note_id] = score

    return sorted(scores.items(), key=lambda x: x[1], reverse=True)


def check_confidence(rrf_results):
    """Determine retrieval confidence from RRF scores.

    Args:
        rrf_results: sorted list of (note_id, rrf_score) from compute_rrf().

    Returns:
        'high': strong match, answer from cards
        'medium': partial match, answer from cards with caveat
        'low': weak match, trigger Perplexity web search
    """
    if not rrf_results:
        return 'low'

    top_score = rrf_results[0][1]

    if top_score >= CONFIDENCE_HIGH:
        return 'high'
    elif top_score >= CONFIDENCE_LOW:
        return 'medium'
    else:
        return 'low'
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 run_tests.py -k test_rrf -v`
Expected: All 10 tests PASS

- [ ] **Step 5: Commit**

```bash
git add ai/rrf.py tests/test_rrf.py
git commit -m "feat(retrieval): add RRF module with weighted tier-aware scoring"
```

---

## Task 2: KG Store Extensions

Add query functions needed by the enrichment pipeline.

**Files:**
- Modify: `storage/kg_store.py` (add after line ~256, after `get_connected_terms()`)
- Modify: `tests/test_kg_store.py`

- [ ] **Step 1: Write failing tests**

Add to `tests/test_kg_store.py`:

```python
class TestKgStoreEnrichment(unittest.TestCase):
    """Tests for KG enrichment query functions."""

    def setUp(self):
        import sqlite3
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
            CREATE TABLE kg_terms (term TEXT PRIMARY KEY, frequency INTEGER DEFAULT 0, embedding BLOB);
            CREATE TABLE kg_edges (term_a TEXT, term_b TEXT, weight INTEGER, PRIMARY KEY (term_a, term_b));
            CREATE TABLE kg_card_terms (card_id INTEGER, term TEXT, deck_id INTEGER, is_definition INTEGER DEFAULT 0);
            CREATE INDEX idx_kg_card_terms_term ON kg_card_terms(term);
        """)
        terms = [('Duenndarm', 5, None), ('Jejunum', 8, None), ('Ileum', 7, None), ('Duodenum', 6, None)]
        self.db.executemany("INSERT INTO kg_terms VALUES (?, ?, ?)", terms)
        edges = [('Duenndarm', 'Jejunum', 8), ('Duenndarm', 'Ileum', 7), ('Duenndarm', 'Duodenum', 6),
                 ('Jejunum', 'Ileum', 5)]
        self.db.executemany("INSERT INTO kg_edges VALUES (?, ?, ?)", edges)
        self.db.commit()

    def test_get_term_expansions_sorted_by_weight(self):
        from storage.kg_store import get_term_expansions
        expansions = get_term_expansions('Duenndarm', db=self.db)
        self.assertEqual(len(expansions), 3)
        self.assertEqual(expansions[0], ('Jejunum', 8))
        self.assertEqual(expansions[1], ('Ileum', 7))

    def test_get_term_expansions_limit(self):
        from storage.kg_store import get_term_expansions
        expansions = get_term_expansions('Duenndarm', max_terms=2, db=self.db)
        self.assertEqual(len(expansions), 2)

    def test_get_term_expansions_unknown_term(self):
        from storage.kg_store import get_term_expansions
        self.assertEqual(get_term_expansions('Unbekannt', db=self.db), [])

    def test_exact_term_lookup_case_insensitive(self):
        from storage.kg_store import exact_term_lookup
        result = exact_term_lookup('duenndarm', db=self.db)
        self.assertEqual(result, 'Duenndarm')

    def test_exact_term_lookup_miss(self):
        from storage.kg_store import exact_term_lookup
        self.assertIsNone(exact_term_lookup('Quantenmechanik', db=self.db))

    def test_load_term_embeddings_empty(self):
        from storage.kg_store import load_term_embeddings
        self.assertEqual(load_term_embeddings(db=self.db), {})

    def test_load_term_embeddings_with_data(self):
        import struct
        from storage.kg_store import load_term_embeddings
        fake_emb = struct.pack('4f', 0.1, 0.2, 0.3, 0.4)
        self.db.execute("UPDATE kg_terms SET embedding = ? WHERE term = ?", (fake_emb, 'Jejunum'))
        self.db.commit()
        result = load_term_embeddings(db=self.db)
        self.assertIn('Jejunum', result)
        self.assertEqual(result['Jejunum'], fake_emb)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 run_tests.py -k TestKgStoreEnrichment -v`
Expected: `ImportError` for missing functions

- [ ] **Step 3: Implement functions in `storage/kg_store.py`**

Add after `get_connected_terms()`:

```python
def get_term_expansions(term, max_terms=5, db=None):
    """Get co-occurrence expansions for a term, sorted by edge weight.

    Returns list of (term, weight) tuples sorted by weight descending.
    """
    conn = db or _get_db()
    rows = conn.execute(
        "SELECT term_b, weight FROM kg_edges WHERE term_a = ? "
        "UNION "
        "SELECT term_a, weight FROM kg_edges WHERE term_b = ? "
        "ORDER BY weight DESC LIMIT ?",
        (term, term, max_terms)
    ).fetchall()
    return [(r[0], r[1]) for r in rows]


def exact_term_lookup(query, db=None):
    """Case-insensitive exact match in kg_terms.

    Returns the canonical term string if found, None otherwise.
    """
    conn = db or _get_db()
    row = conn.execute(
        "SELECT term FROM kg_terms WHERE LOWER(term) = LOWER(?) LIMIT 1",
        (query,)
    ).fetchone()
    return row[0] if row else None


def load_term_embeddings(db=None):
    """Load all term embeddings from kg_terms.

    Returns dict of {term: embedding_bytes} for terms with non-NULL embeddings.
    """
    conn = db or _get_db()
    rows = conn.execute(
        "SELECT term, embedding FROM kg_terms WHERE embedding IS NOT NULL"
    ).fetchall()
    return {r[0]: r[1] for r in rows}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 run_tests.py -k TestKgStoreEnrichment -v`
Expected: All 7 tests PASS

- [ ] **Step 5: Run all kg_store tests for regression check**

Run: `python3 run_tests.py -k test_kg_store -v`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add storage/kg_store.py tests/test_kg_store.py
git commit -m "feat(kg): add term expansion, exact lookup, and embedding loading to kg_store"
```

---

## Task 3: KG Term Embedding Builder

Add function to compute embeddings for all KG terms.

**Files:**
- Modify: `ai/kg_builder.py`
- Modify: `tests/test_kg_builder.py`

- [ ] **Step 1: Write failing tests**

Add to `tests/test_kg_builder.py`:

```python
class TestBuildTermEmbeddings(unittest.TestCase):

    def setUp(self):
        import sqlite3
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
            CREATE TABLE kg_terms (term TEXT PRIMARY KEY, frequency INTEGER DEFAULT 0, embedding BLOB);
        """)
        self.db.executemany("INSERT INTO kg_terms VALUES (?, ?, ?)",
                           [('Herz', 5, None), ('Lunge', 3, None)])
        self.db.commit()

    def test_embeds_all_unembedded_terms(self):
        from unittest.mock import MagicMock
        mock_embed_fn = MagicMock(return_value=[[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]])
        from ai.kg_builder import build_term_embeddings
        count = build_term_embeddings(embed_fn=mock_embed_fn, db=self.db, batch_size=50)
        self.assertEqual(count, 2)
        mock_embed_fn.assert_called_once()
        row = self.db.execute("SELECT embedding FROM kg_terms WHERE term = 'Herz'").fetchone()
        self.assertIsNotNone(row[0])

    def test_skips_already_embedded(self):
        import struct
        from unittest.mock import MagicMock
        fake_emb = struct.pack('3f', 0.1, 0.2, 0.3)
        self.db.execute("UPDATE kg_terms SET embedding = ? WHERE term = 'Herz'", (fake_emb,))
        self.db.commit()
        mock_embed_fn = MagicMock(return_value=[[0.4, 0.5, 0.6]])
        from ai.kg_builder import build_term_embeddings
        count = build_term_embeddings(embed_fn=mock_embed_fn, db=self.db, batch_size=50)
        self.assertEqual(count, 1)
        call_args = mock_embed_fn.call_args[0][0]
        self.assertEqual(call_args, ['Lunge'])

    def test_returns_zero_when_all_embedded(self):
        import struct
        fake_emb = struct.pack('3f', 0.1, 0.2, 0.3)
        self.db.execute("UPDATE kg_terms SET embedding = ? WHERE term = 'Herz'", (fake_emb,))
        self.db.execute("UPDATE kg_terms SET embedding = ? WHERE term = 'Lunge'", (fake_emb,))
        self.db.commit()
        from unittest.mock import MagicMock
        mock_embed_fn = MagicMock()
        from ai.kg_builder import build_term_embeddings
        count = build_term_embeddings(embed_fn=mock_embed_fn, db=self.db, batch_size=50)
        self.assertEqual(count, 0)
        mock_embed_fn.assert_not_called()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 run_tests.py -k TestBuildTermEmbeddings -v`
Expected: `ImportError`

- [ ] **Step 3: Implement `build_term_embeddings` in `ai/kg_builder.py`**

Add after the `GraphIndexBuilder` class:

```python
def build_term_embeddings(embed_fn, db=None, batch_size=50):
    """Compute and store embeddings for all KG terms without one.

    Args:
        embed_fn: Callable(texts: list[str]) -> list[list[float]].
        db: Optional DB connection (for testing).
        batch_size: Number of terms per API call.

    Returns:
        Number of terms newly embedded.
    """
    import struct

    try:
        from ..storage.kg_store import _get_db as kg_get_db
    except ImportError:
        from storage.kg_store import _get_db as kg_get_db

    conn = db or kg_get_db()

    rows = conn.execute(
        "SELECT term FROM kg_terms WHERE embedding IS NULL ORDER BY frequency DESC"
    ).fetchall()
    terms = [r[0] for r in rows]

    if not terms:
        logger.info("build_term_embeddings: all terms already embedded")
        return 0

    total_embedded = 0
    for i in range(0, len(terms), batch_size):
        batch = terms[i:i + batch_size]
        try:
            embeddings = embed_fn(batch)
            if not embeddings:
                continue
            for term, emb in zip(batch, embeddings):
                if emb:
                    packed = struct.pack('%df' % len(emb), *emb)
                    conn.execute(
                        "UPDATE kg_terms SET embedding = ? WHERE term = ?",
                        (packed, term)
                    )
                    total_embedded += 1
            conn.commit()
        except Exception as e:
            logger.warning("build_term_embeddings: batch %d failed: %s", i, e)

    logger.info("build_term_embeddings: embedded %d/%d terms", total_embedded, len(terms))
    return total_embedded
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 run_tests.py -k TestBuildTermEmbeddings -v`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add ai/kg_builder.py tests/test_kg_builder.py
git commit -m "feat(kg): add build_term_embeddings for KG fuzzy matching"
```

---

## Task 4: Embedding Manager Extensions

Add KG term index loading and fuzzy term search to `EmbeddingManager`.

**Files:**
- Modify: `ai/embeddings.py` (add after `search()` method, around line ~244)

- [ ] **Step 1: Add `load_kg_term_index()` and `fuzzy_term_search()` methods**

```python
    def load_kg_term_index(self):
        """Load pre-computed KG term embeddings into memory for fuzzy matching.

        Returns:
            Dict of {term: normalized_vector (list of float)} or empty dict.
        """
        import struct
        import math

        try:
            try:
                from ..storage.kg_store import load_term_embeddings
            except ImportError:
                from storage.kg_store import load_term_embeddings

            raw = load_term_embeddings()
            if not raw:
                return {}

            index = {}
            for term, emb_bytes in raw.items():
                dim = len(emb_bytes) // 4
                if dim == 0:
                    continue
                vec = list(struct.unpack('%df' % dim, emb_bytes))
                norm = math.sqrt(sum(v * v for v in vec))
                if norm > 0:
                    vec = [v / norm for v in vec]
                index[term] = vec

            logger.info("Loaded %d KG term embeddings for fuzzy matching", len(index))
            return index
        except Exception as e:
            logger.warning("Failed to load KG term index: %s", e)
            return {}

    def fuzzy_term_search(self, term_embedding, kg_term_index, top_k=3, min_similarity=0.60):
        """Find nearest KG terms by cosine similarity.

        Args:
            term_embedding: Embedding vector for the query term.
            kg_term_index: Dict of {term: normalized_vector} from load_kg_term_index().
            top_k: Max number of matches to return.
            min_similarity: Minimum cosine similarity threshold.

        Returns:
            List of (term, score) tuples sorted by similarity descending.
        """
        if not kg_term_index or not term_embedding:
            return []

        import math
        norm = math.sqrt(sum(v * v for v in term_embedding))
        if norm > 0:
            normed = [v / norm for v in term_embedding]
        else:
            return []

        scored = []
        for kg_term, kg_vec in kg_term_index.items():
            score = sum(a * b for a, b in zip(normed, kg_vec))
            if score >= min_similarity:
                scored.append((kg_term, score))

        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:top_k]
```

- [ ] **Step 2: Run existing tests to verify no regressions**

Run: `python3 run_tests.py -v`
Expected: All existing tests PASS

- [ ] **Step 3: Commit**

```bash
git add ai/embeddings.py
git commit -m "feat(embeddings): add KG term index loading and fuzzy term search"
```

---

## Task 5: KG Enrichment Module

The core new module. Takes user query + resolved_intent, returns enriched queries.

**Files:**
- Create: `ai/kg_enrichment.py`
- Create: `tests/test_kg_enrichment.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_kg_enrichment.py
"""Tests for KG Query Enrichment pipeline."""
import unittest
import sqlite3


def _make_test_db():
    """Create in-memory KG DB with medical test data."""
    db = sqlite3.connect(':memory:')
    db.row_factory = sqlite3.Row
    db.executescript("""
        CREATE TABLE kg_terms (term TEXT PRIMARY KEY, frequency INTEGER DEFAULT 0, embedding BLOB);
        CREATE TABLE kg_edges (term_a TEXT, term_b TEXT, weight INTEGER, PRIMARY KEY (term_a, term_b));
        CREATE TABLE kg_card_terms (card_id INTEGER, term TEXT, deck_id INTEGER, is_definition INTEGER DEFAULT 0);
        CREATE INDEX idx_kg_card_terms_term ON kg_card_terms(term);
    """)
    terms = [
        ('Duenndarm', 5, None), ('Jejunum', 8, None), ('Ileum', 7, None),
        ('Duodenum', 6, None), ('Herz', 10, None), ('Fettgewebe', 4, None),
    ]
    db.executemany("INSERT INTO kg_terms VALUES (?, ?, ?)", terms)
    edges = [
        ('Duenndarm', 'Jejunum', 8), ('Duenndarm', 'Ileum', 7),
        ('Duenndarm', 'Duodenum', 6), ('Jejunum', 'Ileum', 5),
    ]
    db.executemany("INSERT INTO kg_edges VALUES (?, ?, ?)", edges)
    db.commit()
    return db


class TestExtractQueryTerms(unittest.TestCase):

    def test_extracts_domain_terms(self):
        from ai.kg_enrichment import extract_query_terms
        terms = extract_query_terms("Wie lang ist der Duenndarm")
        self.assertIn("Duenndarm", terms)
        self.assertNotIn("ist", terms)
        self.assertNotIn("der", terms)

    def test_extracts_abbreviations(self):
        from ai.kg_enrichment import extract_query_terms
        terms = extract_query_terms("Was macht ATP in der Zelle")
        self.assertIn("ATP", terms)

    def test_empty_input(self):
        from ai.kg_enrichment import extract_query_terms
        self.assertEqual(extract_query_terms(""), [])

    def test_deduplicates(self):
        from ai.kg_enrichment import extract_query_terms
        terms = extract_query_terms("Herz Herz herz")
        herz_count = sum(1 for t in terms if t.lower() == 'herz')
        self.assertEqual(herz_count, 1)


class TestEnrichQuery(unittest.TestCase):

    def setUp(self):
        self.db = _make_test_db()

    def test_standalone_question_with_kg_terms(self):
        from ai.kg_enrichment import enrich_query
        result = enrich_query(
            user_message="Wie lang ist der Duenndarm",
            resolved_intent=None,
            db=self.db,
            kg_term_index={},
        )
        self.assertTrue(len(result['precise_primary']) > 0)
        all_text = ' '.join(result['precise_primary'] + result['broad_primary'])
        self.assertIn('Duenndarm', all_text)

    def test_kg_expansion_in_queries(self):
        from ai.kg_enrichment import enrich_query
        result = enrich_query(
            user_message="Duenndarm",
            resolved_intent=None,
            db=self.db,
            kg_term_index={},
        )
        all_text = ' '.join(result['precise_primary'] + result['broad_primary'])
        self.assertIn('Jejunum', all_text)

    def test_context_dependent_produces_secondary(self):
        from ai.kg_enrichment import enrich_query
        result = enrich_query(
            user_message="Wie meinst du das",
            resolved_intent="Funktion des Jejunum im Duenndarm",
            db=self.db,
            kg_term_index={},
        )
        all_secondary = ' '.join(result.get('precise_secondary', []) + result.get('broad_secondary', []))
        self.assertTrue('Jejunum' in all_secondary or 'Duenndarm' in all_secondary)

    def test_no_kg_coverage_uses_original_terms(self):
        from ai.kg_enrichment import enrich_query
        result = enrich_query(
            user_message="Was ist Quantenmechanik",
            resolved_intent=None,
            db=self.db,
            kg_term_index={},
        )
        all_text = ' '.join(result['precise_primary'] + result['broad_primary'])
        self.assertIn('Quantenmechanik', all_text)

    def test_embedding_primary_contains_original(self):
        from ai.kg_enrichment import enrich_query
        result = enrich_query(
            user_message="Wie lang ist der Duenndarm",
            resolved_intent=None,
            db=self.db,
            kg_term_index={},
        )
        self.assertIn('Duenndarm', result.get('embedding_primary', ''))

    def test_tier2_deduplicates_against_tier1(self):
        from ai.kg_enrichment import enrich_query
        result = enrich_query(
            user_message="Duenndarm",
            resolved_intent="Duenndarm Jejunum Funktion",
            db=self.db,
            kg_term_index={},
        )
        tier2_lower = {t.lower() for t in result.get('tier2_terms', [])}
        tier1_lower = {t.lower() for t in result.get('tier1_terms', [])}
        overlap = tier2_lower & tier1_lower
        self.assertEqual(len(overlap), 0)

    def test_returns_metadata(self):
        from ai.kg_enrichment import enrich_query
        result = enrich_query(
            user_message="Duenndarm",
            resolved_intent=None,
            db=self.db,
            kg_term_index={},
        )
        self.assertIn('kg_terms_found', result)
        self.assertIn('expansions', result)
        self.assertIn('unmatched_terms', result)


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 run_tests.py -k test_kg_enrichment -v`
Expected: `ModuleNotFoundError`

- [ ] **Step 3: Implement `ai/kg_enrichment.py`**

```python
# ai/kg_enrichment.py
"""KG Query Enrichment -- generates search queries from Knowledge Graph term expansion.

Two-tier architecture:
  Tier 1 (Primary): Terms from user's direct query -> KG expansion -> queries
  Tier 2 (Secondary): NEW terms from Router's resolved_intent -> additional queries

The KG replaces the LLM Router for query generation. It knows the actual
vocabulary of the user's cards and generates deterministic, testable queries.
"""
import re

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

_STOPWORDS = frozenset({
    'und', 'oder', 'der', 'die', 'das', 'ein', 'eine', 'ist', 'sind',
    'hat', 'haben', 'wird', 'werden', 'kann', 'koennen', 'bei', 'von',
    'mit', 'auf', 'fuer', 'aus', 'nach', 'ueber', 'sich', 'dem', 'den',
    'des', 'einer', 'einem', 'eines', 'nicht', 'auch', 'noch', 'aber',
    'wenn', 'dass', 'wie', 'was', 'wer', 'wem', 'wen', 'welche',
    'the', 'and', 'for', 'with', 'from', 'this', 'that', 'which',
    'are', 'was', 'were', 'been', 'have', 'has', 'had', 'does', 'did',
    'will', 'would', 'could', 'should', 'may', 'might', 'can',
    'meinst', 'genau', 'erklaere', 'erklaer', 'kannst', 'bitte', 'lang',
})

_KEEP_ABBREVIATIONS = frozenset({
    'ATP', 'ADP', 'AMP', 'DNA', 'RNA', 'mRNA', 'tRNA', 'rRNA',
    'GIP', 'GLP', 'CCK', 'LDL', 'HDL', 'VLDL', 'HbA', 'EKG',
    'EEG', 'MRI', 'UCP', 'BMI', 'CRP', 'TSH', 'LH', 'FSH',
    'NAD', 'FAD', 'CoA', 'IgG', 'IgA', 'IgM', 'IgE',
})


def extract_query_terms(text):
    """Extract candidate terms from text for KG lookup.

    Returns list of candidate term strings, deduplicated, ordered by position.
    """
    if not text or not text.strip():
        return []

    clean = re.sub(r'[^\w\s\-/]', ' ', text)
    clean = re.sub(r'\s+', ' ', clean).strip()

    tokens = clean.split()
    terms = []
    seen = set()

    for token in tokens:
        if token in _KEEP_ABBREVIATIONS:
            if token.lower() not in seen:
                seen.add(token.lower())
                terms.append(token)
            continue

        if len(token) < 3:
            continue
        if token.lower() in _STOPWORDS:
            continue
        if token.isdigit():
            continue

        if token.lower() not in seen:
            seen.add(token.lower())
            terms.append(token)

    return terms


def _kg_lookup_terms(candidate_terms, db=None):
    """Look up candidate terms in KG via exact match.

    Returns (found_terms, unmatched_terms).
    found_terms are canonical KG term strings.
    """
    try:
        try:
            from ..storage.kg_store import exact_term_lookup
        except ImportError:
            from storage.kg_store import exact_term_lookup
    except ImportError:
        return [], list(candidate_terms)

    found = []
    unmatched = []

    for term in candidate_terms:
        canonical = exact_term_lookup(term, db=db)
        if canonical:
            found.append(canonical)
        else:
            unmatched.append(term)

    return found, unmatched


def _build_queries(terms, expansions):
    """Build SQL queries from terms and their KG expansions.

    Returns (precise_queries, broad_queries).
    """
    if not terms:
        return [], []

    all_terms = list(terms)
    for term in terms:
        for expanded, weight in expansions.get(term, []):
            if expanded.lower() not in {t.lower() for t in all_terms}:
                all_terms.append(expanded)

    # PRECISE: original terms as AND
    precise = []
    if len(terms) >= 1:
        precise.append(' '.join('"%s"' % t for t in terms))

    # PRECISE: top expansions + context term
    for term in terms:
        exps = expansions.get(term, [])
        if exps:
            top_exp = [e[0] for e in exps[:2]]
            context = [t for t in terms if t.lower() != term.lower()]
            if context:
                precise.append(' '.join('"%s"' % t for t in top_exp + context[:1]))
            else:
                precise.append(' '.join('"%s"' % t for t in top_exp))

    # Deduplicate precise
    seen_p = set()
    unique_precise = []
    for q in precise:
        norm = q.lower()
        if norm not in seen_p:
            seen_p.add(norm)
            unique_precise.append(q)
    precise = unique_precise[:3]

    # BROAD: all terms as OR
    unique_all = []
    seen_lower = set()
    for t in all_terms:
        if t.lower() not in seen_lower:
            seen_lower.add(t.lower())
            unique_all.append(t)
    broad = []
    if unique_all:
        broad = [' OR '.join('"%s"' % t for t in unique_all[:6])]

    return precise, broad


def _build_embedding_query(original_text, found_terms, expansions):
    """Build enriched embedding query by appending expansion terms."""
    expansion_terms = []
    for term in found_terms:
        for expanded, weight in expansions.get(term, []):
            if expanded.lower() not in original_text.lower():
                expansion_terms.append(expanded)

    if expansion_terms:
        return original_text + ' ' + ' '.join(expansion_terms[:8])
    return original_text


def enrich_query(user_message, resolved_intent=None, db=None, kg_term_index=None,
                 embed_fn=None):
    """Main enrichment entry point.

    Args:
        user_message: Original user question.
        resolved_intent: Optional Router-provided intent description.
        db: Optional SQLite DB connection (for testing).
        kg_term_index: Dict of {term: normalized_vector} for fuzzy matching.
        embed_fn: Optional callable for embedding unmatched terms.

    Returns:
        Dict with tier1_terms, tier2_terms, kg_terms_found, expansions,
        precise_primary, broad_primary, precise_secondary, broad_secondary,
        embedding_primary, embedding_secondary, unmatched_terms.
    """
    try:
        try:
            from ..storage.kg_store import get_term_expansions
        except ImportError:
            from storage.kg_store import get_term_expansions
    except ImportError:
        get_term_expansions = lambda term, max_terms=5, db=None: []

    # TIER 1: user's direct query
    tier1_candidates = extract_query_terms(user_message)
    tier1_found, tier1_unmatched = _kg_lookup_terms(tier1_candidates, db=db)

    expansions = {}
    for term in tier1_found:
        expansions[term] = get_term_expansions(term, max_terms=5, db=db)

    tier1_query_terms = tier1_found if tier1_found else tier1_candidates
    precise_primary, broad_primary = _build_queries(tier1_query_terms, expansions)
    embedding_primary = _build_embedding_query(user_message, tier1_found, expansions)

    # TIER 2: resolved_intent (new terms only)
    tier2_terms = []
    precise_secondary = []
    broad_secondary = []
    embedding_secondary = ''

    if resolved_intent:
        tier2_candidates = extract_query_terms(resolved_intent)

        tier1_lower = {t.lower() for t in tier1_candidates}
        tier1_found_lower = {t.lower() for t in tier1_found}
        expansion_lower = set()
        for exps in expansions.values():
            for expanded, _ in exps:
                expansion_lower.add(expanded.lower())
        all_tier1_lower = tier1_lower | tier1_found_lower | expansion_lower

        tier2_new = [t for t in tier2_candidates if t.lower() not in all_tier1_lower]

        if tier2_new:
            tier2_found, tier2_unmatched_extra = _kg_lookup_terms(tier2_new, db=db)
            tier1_unmatched.extend(tier2_unmatched_extra)

            tier2_expansions = {}
            for term in tier2_found:
                tier2_expansions[term] = get_term_expansions(term, max_terms=5, db=db)
            expansions.update(tier2_expansions)

            tier2_query_terms = tier2_found if tier2_found else tier2_new
            precise_secondary, broad_secondary = _build_queries(tier2_query_terms, tier2_expansions)
            embedding_secondary = _build_embedding_query(resolved_intent, tier2_found, tier2_expansions)
            tier2_terms = tier2_query_terms

    return {
        'tier1_terms': tier1_query_terms,
        'tier2_terms': tier2_terms,
        'kg_terms_found': tier1_found,
        'expansions': expansions,
        'precise_primary': precise_primary,
        'broad_primary': broad_primary,
        'precise_secondary': precise_secondary,
        'broad_secondary': broad_secondary,
        'embedding_primary': embedding_primary,
        'embedding_secondary': embedding_secondary,
        'unmatched_terms': tier1_unmatched,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 run_tests.py -k test_kg_enrichment -v`
Expected: All 11 tests PASS

- [ ] **Step 5: Commit**

```bash
git add ai/kg_enrichment.py tests/test_kg_enrichment.py
git commit -m "feat(retrieval): add KG query enrichment with two-tier term expansion"
```

---

## Task 6: Router Simplification

Add `resolved_intent` field. Keep legacy fields for backwards compatibility.

**Files:**
- Modify: `ai/router.py` (lines 37-52: UnifiedRoutingResult dataclass)
- Modify: `tests/test_router.py`

- [ ] **Step 1: Write failing test**

Add to `tests/test_router.py`:

```python
class TestSlimRoutingResult(unittest.TestCase):

    def test_resolved_intent_field(self):
        from ai.router import UnifiedRoutingResult
        result = UnifiedRoutingResult(
            agent='tutor', method='llm',
            search_needed=True, resolved_intent='Laenge des Duenndarms'
        )
        self.assertEqual(result.resolved_intent, 'Laenge des Duenndarms')

    def test_default_resolved_intent_is_none(self):
        from ai.router import UnifiedRoutingResult
        result = UnifiedRoutingResult(agent='tutor', method='default')
        self.assertIsNone(result.resolved_intent)
```

- [ ] **Step 2: Run to verify failure**

Run: `python3 run_tests.py -k TestSlimRoutingResult -v`
Expected: `TypeError`

- [ ] **Step 3: Add `resolved_intent` to `UnifiedRoutingResult`**

In `ai/router.py`, update the dataclass (line ~44, after `search_needed`):

```python
    search_needed: Optional[bool] = None
    resolved_intent: Optional[str] = None   # Router's interpretation of user's question
```

- [ ] **Step 4: Update `unified_route()` to parse `resolved_intent` from backend response**

In `unified_route()` (line ~208), add to the return statement:

```python
            resolved_intent=parsed.get('resolved_intent'),
```

(Add this line after `reasoning=parsed.get('reasoning', ''),`)

- [ ] **Step 5: Run all router tests**

Run: `python3 run_tests.py -k test_router -v`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add ai/router.py tests/test_router.py
git commit -m "feat(router): add resolved_intent field to UnifiedRoutingResult"
```

---

## Task 7: SQL Search Simplification

Remove deck scope filtering from `rag_retrieve_cards()`.

**Files:**
- Modify: `ai/rag.py` (line ~561: `build_anki_query` helper)

- [ ] **Step 1: Simplify `build_anki_query` to always return raw query**

In `ai/rag.py`, replace the `build_anki_query` function (inside `rag_retrieve_cards`, around line 561):

```python
        def build_anki_query(query, search_scope, context):
            """Return query as-is. Always searches entire collection."""
            return query
```

- [ ] **Step 2: Run all existing tests**

Run: `python3 run_tests.py -v`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add ai/rag.py
git commit -m "refactor(rag): simplify SQL search to always use collection-wide scope"
```

---

## Task 8: New Retrieval Pipeline

Add `EnrichedRetrieval` class alongside existing `HybridRetrieval`.

**Files:**
- Modify: `ai/retrieval.py` (add new class at end of file)

- [ ] **Step 1: Add `EnrichedRetrieval` class at the end of `ai/retrieval.py`**

Add after the existing `HybridRetrieval` class (after line ~404). The full class implementation is specified in the spec Section 6 and Section 7. Key methods:

- `retrieve(user_message, routing_result, context, max_notes)` — main entry point
- `_run_sql_search(enrichment, max_notes)` — executes tiered SQL queries
- `_resolve_note_id(card_id)` — card_id to note_id resolution
- `_build_merged_citations(top_notes, sql_results, semantic_results, context)` — citations from RRF ranking
- `_build_context_string(merged)` — format for LLM context

The class uses `enrich_query()` from `ai/kg_enrichment.py` and `compute_rrf()` + `check_confidence()` from `ai/rrf.py`.

(Full implementation code is in the spec under Section 6. Copy the `EnrichedRetrieval` class from Task 8 of the detailed spec.)

- [ ] **Step 2: Run all tests to verify no regressions**

Run: `python3 run_tests.py -v`
Expected: All tests PASS (HybridRetrieval still exists and works)

- [ ] **Step 3: Commit**

```bash
git add ai/retrieval.py
git commit -m "feat(retrieval): add EnrichedRetrieval with KG enrichment + RRF pipeline"
```

---

## Task 9: Pipeline Orchestration

Wire `EnrichedRetrieval` into `rag_pipeline.py` as primary, `HybridRetrieval` as fallback.

**Files:**
- Modify: `ai/rag_pipeline.py` (lines ~101-143: hybrid retrieval section)

- [ ] **Step 1: Update `retrieve_rag_context()` to try `EnrichedRetrieval` first**

Replace the hybrid retrieval block (lines ~101-143) with:

```python
    if embedding_manager and retrieval_mode in ('semantic', 'both'):
        # Try EnrichedRetrieval first (new KG-enriched pipeline)
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

        # Fallback to legacy HybridRetrieval
        if retrieval_result is None:
            try:
                try:
                    from .retrieval import HybridRetrieval
                except ImportError:
                    from retrieval import HybridRetrieval

                if retrieval_state is None:
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
```

- [ ] **Step 2: Run all tests**

Run: `python3 run_tests.py -v`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add ai/rag_pipeline.py
git commit -m "feat(pipeline): wire EnrichedRetrieval as primary with HybridRetrieval fallback"
```

---

## Task 10: Deprecation Markers + Final Verification

Mark deprecated functions and verify full integration.

**Files:**
- Modify: `ai/rag.py` (add deprecation docstrings)

- [ ] **Step 1: Add deprecation markers to legacy functions**

Update docstrings for `rag_router()` (line ~189), `fix_router_queries()` (line ~128), `is_standalone_question()` (line ~74):

For `rag_router`:
```python
def rag_router(user_message, context=None, config=None, emit_step=None):
    """DEPRECATED: Replaced by Router (ai/router.py) + KG Enrichment (ai/kg_enrichment.py).
    Kept as fallback. Will be removed in future version.
    ...existing docstring...
    """
```

For `fix_router_queries`:
```python
def fix_router_queries(router_result, user_message, context):
    """DEPRECATED: KG enrichment handles query quality now. Kept for backwards compatibility."""
```

For `is_standalone_question`:
```python
def is_standalone_question(user_message, context):
    """DEPRECATED: Router's resolved_intent handles context resolution now."""
```

- [ ] **Step 2: Run full test suite**

Run: `python3 run_tests.py -v`
Expected: ALL tests PASS

- [ ] **Step 3: Commit**

```bash
git add ai/rag.py
git commit -m "refactor: mark deprecated RAG functions for future removal"
```

---

## Post-Implementation Notes

### Backend `/router` Endpoint Update (Separate Task)

The backend needs updating to:
1. Return `resolved_intent` field
2. Optionally stop generating query fields (or keep for backwards compat)
3. Use the slimmer prompt from Spec Section 3.4

This is a separate deployment — the client-side code handles both old and new backend responses.

### KG Term Embedding Bootstrap

After deploying, trigger term embedding once:
```python
from ai.kg_builder import build_term_embeddings
from ai.embeddings import EmbeddingManager
emb = EmbeddingManager()
build_term_embeddings(embed_fn=emb.embed_texts)
```

### Confidence Threshold Tuning

`CONFIDENCE_HIGH` (0.025) and `CONFIDENCE_LOW` (0.012) in `ai/rrf.py` are initial estimates. Tune after deployment by logging RRF scores alongside user satisfaction signals.
