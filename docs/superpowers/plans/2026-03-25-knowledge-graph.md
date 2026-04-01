# Knowledge Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat deck browser with an interactive 3D Knowledge Graph that extracts terms from cards, visualizes their connections, enables dynamic stack creation, and provides on-demand definitions.

**Architecture:** Local term extraction during the existing embedding pipeline builds an inverted index (SQLite). A `3d-force-graph` (three.js) frontend renders terms as nodes and shared-card co-occurrences as edges. A unified TermPopup component works in both the graph view and the reviewer. Definitions are generated on-demand via Gemini Flash with Research Agent fallback.

**Tech Stack:** Python/SQLite (backend), React/three.js/3d-force-graph (frontend), Gemini Embedding API (vector search), Gemini Flash (definitions)

**Spec:** `docs/superpowers/specs/2026-03-25-knowledge-graph-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `storage/kg_store.py` | KG SQLite tables: schema, CRUD for `kg_card_terms`, `kg_terms`, `kg_edges`, `kg_definitions` |
| `ai/term_extractor.py` | `TermExtractor` interface + Implementation A (local: stopwords, uppercase chains, hyphen compounds, PMI) |
| `ai/kg_builder.py` | `GraphIndexBuilder`: edge computation from `kg_card_terms`, PMI collocation, term frequency aggregation |
| `frontend/src/components/GraphView.jsx` | 3D graph rendering via `3d-force-graph`, orbit controls, node interaction, search focus animation |
| `frontend/src/components/GraphBottomBar.jsx` | Contextual bottom bar: idle/search/selected states |
| `frontend/src/components/TermPopup.jsx` | Unified term detail: definition, connected terms, "Stapel starten" — used in graph + reviewer |
| `frontend/src/hooks/useKnowledgeGraph.js` | Graph state management, bridge communication, search logic, ankiReceive handlers |
| `tests/test_term_extractor.py` | Unit tests for term extraction (stopwords, compounds, uppercase chains, PMI) |
| `tests/test_kg_store.py` | Unit tests for KG SQLite CRUD (in-memory DB) |
| `tests/test_kg_builder.py` | Unit tests for edge computation, pruning, frequency aggregation |

### Modified Files

| File | Changes |
|------|---------|
| `storage/card_sessions.py` | Add KG tables to `_init_schema()` and `_migrate_schema()` |
| `ai/embeddings.py` | Hook term extraction into `BackgroundEmbeddingThread.run()`, add term embedding step |
| `ui/bridge.py` | Add `@pyqtSlot` methods as legacy surface (optional) |
| `ui/widget.py` | Add message handlers in `_get_message_handler()` dict + `KGDefinitionThread(QThread)` for async operations |
| `frontend/src/App.jsx` | Add `graphView` state, toggle between graph and deck browser |
| `frontend/src/components/ReviewerView.jsx` | Refactor `applyPhraseMarkers()` for configurable class, add KG marker click handler, add TermPopup overlay |
| `frontend/package.json` | Add `3d-force-graph` dependency |
| `frontend/vite.config.js` | Ensure chunk splitting works for three.js lazy load |
| `frontend/src/index.css` | Add `.kg-marker` styles |

---

## Phase 1: Backend

### Task 1: KG SQLite Schema + CRUD

**Files:**
- Create: `storage/kg_store.py`
- Modify: `storage/card_sessions.py:64-118` (add to `_init_schema`)
- Test: `tests/test_kg_store.py`

- [ ] **Step 1: Write failing tests for KG storage**

```python
# tests/test_kg_store.py
import sqlite3
try:
    from storage import kg_store as kg
except ImportError:
    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
    from storage import kg_store as kg

class TestKGStore:
    def _fresh_db(self):
        db = sqlite3.connect(":memory:")
        db.row_factory = sqlite3.Row
        kg._init_kg_schema(db)
        kg._db = db
        return db

    def setup_method(self):
        self._fresh_db()

    def teardown_method(self):
        if kg._db:
            kg._db.close()
            kg._db = None

    def test_save_and_load_card_terms(self):
        kg.save_card_terms(100, ["Kollagen", "Prolin"], deck_id=1)
        terms = kg.get_card_terms(100)
        assert set(terms) == {"Kollagen", "Prolin"}

    def test_save_card_terms_with_definition_flag(self):
        kg.save_card_terms(100, ["Kollagen"], deck_id=1, definition_terms=["Kollagen"])
        row = kg._db.execute(
            "SELECT is_definition FROM kg_card_terms WHERE card_id=100 AND term='Kollagen'"
        ).fetchone()
        assert row["is_definition"] == 1

    def test_delete_card_terms(self):
        kg.save_card_terms(100, ["Kollagen", "Prolin"], deck_id=1)
        kg.delete_card_terms(100)
        assert kg.get_card_terms(100) == []

    def test_get_term_card_ids(self):
        kg.save_card_terms(100, ["Kollagen"], deck_id=1)
        kg.save_card_terms(200, ["Kollagen"], deck_id=1)
        kg.save_card_terms(300, ["Prolin"], deck_id=2)
        ids = kg.get_term_card_ids("Kollagen")
        assert set(ids) == {100, 200}

    def test_get_term_frequency(self):
        kg.save_card_terms(100, ["Kollagen"], deck_id=1)
        kg.save_card_terms(200, ["Kollagen"], deck_id=2)
        kg.update_term_frequencies()
        freq = kg.get_term_frequency("Kollagen")
        assert freq == 2

    def test_save_and_load_edges(self):
        kg.save_edges([("Kollagen", "Prolin", 5), ("Kollagen", "Elastin", 3)])
        edges = kg.get_all_edges()
        assert len(edges) == 2
        assert edges[0]["weight"] == 5

    def test_edge_pruning_skips_weight_1(self):
        kg.save_edges([("A", "B", 1), ("C", "D", 2)])
        edges = kg.get_all_edges(min_weight=2)
        assert len(edges) == 1
        assert edges[0]["term_a"] == "C"

    def test_save_and_load_definition(self):
        kg.save_definition("Kollagen", "Strukturprotein...", [100, 200], "llm")
        defn = kg.get_definition("Kollagen")
        assert defn["definition"] == "Strukturprotein..."
        assert defn["source_count"] == 2
        assert defn["generated_by"] == "llm"

    def test_get_definition_returns_none_if_missing(self):
        assert kg.get_definition("Nicht vorhanden") is None

    def test_search_terms_exact(self):
        kg.save_card_terms(100, ["Kollagen", "Prolin"], deck_id=1)
        kg.update_term_frequencies()
        results = kg.search_terms_exact("Kollagen")
        assert "Kollagen" in results
        results = kg.search_terms_exact("Kolla")
        assert "Kollagen" in results  # prefix match
        results = kg.search_terms_exact("xyz")
        assert len(results) == 0

    def test_get_unembedded_terms(self):
        kg.save_card_terms(100, ["Kollagen", "Prolin"], deck_id=1)
        kg.update_term_frequencies()
        unembedded = kg.get_unembedded_terms()
        assert set(unembedded) == {"Kollagen", "Prolin"}

    def test_save_term_embedding(self):
        kg.save_card_terms(100, ["Kollagen"], deck_id=1)
        kg.update_term_frequencies()
        kg.save_term_embedding("Kollagen", b"\x00" * 12)
        unembedded = kg.get_unembedded_terms()
        assert "Kollagen" not in unembedded

    def test_get_connected_terms(self):
        kg.save_edges([("Kollagen", "Prolin", 5), ("Kollagen", "Elastin", 3)])
        connected = kg.get_connected_terms("Kollagen")
        assert set(connected) == {"Prolin", "Elastin"}

    def test_get_graph_status(self):
        kg.save_card_terms(100, ["Kollagen", "Prolin"], deck_id=1)
        kg.update_term_frequencies()
        status = kg.get_graph_status()
        assert status["totalTerms"] == 2
        assert status["totalCards"] == 1

    def test_get_graph_data(self):
        kg.save_card_terms(100, ["Kollagen", "Prolin"], deck_id=1)
        kg.save_card_terms(200, ["Kollagen"], deck_id=2)
        kg.update_term_frequencies()
        kg.save_edges([("Kollagen", "Prolin", 3)])
        data = kg.get_graph_data()
        assert len(data["nodes"]) == 2
        assert len(data["edges"]) == 1
        kollagen = next(n for n in data["nodes"] if n["id"] == "Kollagen")
        assert kollagen["frequency"] == 2
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 run_tests.py -k test_kg_store -v`
Expected: ImportError (module doesn't exist yet)

- [ ] **Step 3: Implement kg_store.py**

Create `storage/kg_store.py` with:
- `_db` module-level connection (same pattern as `card_sessions.py`)
- `_init_kg_schema(db)`: CREATE TABLE IF NOT EXISTS for all 4 KG tables + index
- `_get_db()`: lazy DB init (reuse `card_sessions.db` path)
- CRUD functions: `save_card_terms`, `get_card_terms`, `delete_card_terms`, `get_term_card_ids`, `update_term_frequencies`, `save_edges`, `get_all_edges`, `save_definition`, `get_definition`, `get_graph_data`, `search_terms_exact`, `get_unembedded_terms`, `save_term_embedding`, `get_connected_terms`, `get_graph_status`
- `get_graph_data()` returns `{"nodes": [...], "edges": [...]}` with deck color derived from primary deck
- `search_terms_exact(query)` returns terms matching exact or prefix match
- `get_unembedded_terms()` returns terms where `embedding IS NULL`
- `save_term_embedding(term, embedding_bytes)` saves embedding BLOB
- `get_connected_terms(term)` returns terms connected via `kg_edges`
- `get_graph_status()` returns `{totalCards, totalTerms, lastUpdated, pendingUpdates}`

Follow the `card_sessions.py` pattern: module-level `_db`, WAL mode, Row factory.

- [ ] **Step 4: Add KG tables to card_sessions._init_schema()**

In `storage/card_sessions.py`, add after existing table creation (line ~118):
```python
# Knowledge Graph tables
from .kg_store import _init_kg_schema
_init_kg_schema(db)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python3 run_tests.py -k test_kg_store -v`
Expected: All 17 tests PASS

- [ ] **Step 6: Commit**

```bash
git add storage/kg_store.py tests/test_kg_store.py storage/card_sessions.py
git commit -m "feat(kg): add Knowledge Graph SQLite schema and CRUD"
```

---

### Task 2: Term Extractor (Local Implementation A)

**Files:**
- Create: `ai/term_extractor.py`
- Test: `tests/test_term_extractor.py`

- [ ] **Step 1: Write failing tests for term extraction**

```python
# tests/test_term_extractor.py
try:
    from ai.term_extractor import TermExtractor
except ImportError:
    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
    from ai.term_extractor import TermExtractor

class TestTermExtractor:
    def setup_method(self):
        self.extractor = TermExtractor()

    def test_extracts_single_word_terms(self):
        terms = self.extractor.extract("Kollagen ist ein Strukturprotein des Bindegewebes")
        assert "Kollagen" in terms
        assert "Strukturprotein" in terms
        assert "Bindegewebes" in terms  # or normalized form

    def test_filters_stopwords(self):
        terms = self.extractor.extract("Das ist ein Test mit dem Wort Kollagen")
        assert "Das" not in terms
        assert "ist" not in terms
        assert "ein" not in terms
        assert "Kollagen" in terms

    def test_filters_short_words(self):
        terms = self.extractor.extract("Na ja so ist es mit ATP und GFR")
        assert "Na" not in terms
        assert "ja" not in terms
        assert "so" not in terms
        assert "ATP" in terms
        assert "GFR" in terms

    def test_detects_hyphen_compounds(self):
        terms = self.extractor.extract("Die Na/K-ATPase und Acetyl-CoA sind wichtig")
        assert "Na/K-ATPase" in terms
        assert "Acetyl-CoA" in terms

    def test_detects_uppercase_chains(self):
        terms = self.extractor.extract("Der Plexus brachialis versorgt die Obere Extremität")
        assert "Plexus brachialis" in terms
        assert "Obere Extremität" in terms  # or "Obere Extremitat" normalized

    def test_strips_html(self):
        terms = self.extractor.extract("<b>Kollagen</b> ist ein <i>Protein</i>")
        assert "Kollagen" in terms
        # No HTML tags in output
        assert not any("<" in t for t in terms)

    def test_empty_input(self):
        assert self.extractor.extract("") == []
        assert self.extractor.extract(None) == []

    def test_returns_unique_terms(self):
        terms = self.extractor.extract("Kollagen Kollagen Kollagen")
        assert terms.count("Kollagen") == 1

    def test_is_definition_heuristic(self):
        # Term in question field = likely definition card
        assert self.extractor.is_definition_card("Kollagen", "Was ist Kollagen?", "Strukturprotein...")
        assert self.extractor.is_definition_card("Kollagen", "Kollagen", "Ein Protein das...")
        assert not self.extractor.is_definition_card("Kollagen", "Welche Vitamine?", "Vitamin C für Kollagen")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 run_tests.py -k test_term_extractor -v`
Expected: ImportError

- [ ] **Step 3: Implement TermExtractor**

Create `ai/term_extractor.py`:
- `TermExtractor` class with `extract(card_text: str) -> list[str]`
- `is_definition_card(term, question, answer) -> bool`
- Internal methods: `_strip_html()`, `_tokenize()`, `_filter_stopwords()`, `_detect_compounds()`, `_detect_uppercase_chains()`
- Stopword list: ~600 DE + EN common words (inline constant)
- HTML stripping via regex (reuse pattern from `utils/text.py` if available)
- Uppercase chain detection: walk tokens, group consecutive capitalized non-stopword tokens

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 run_tests.py -k test_term_extractor -v`
Expected: All 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add ai/term_extractor.py tests/test_term_extractor.py
git commit -m "feat(kg): add local TermExtractor with stopwords, compounds, uppercase chains"
```

---

### Task 3: PMI Collocation

**Files:**
- Modify: `ai/term_extractor.py`
- Test: `tests/test_term_extractor.py` (add tests)

- [ ] **Step 1: Write failing tests for PMI**

Add to `tests/test_term_extractor.py`:
```python
class TestPMICollocation:
    def test_detects_frequent_bigrams(self):
        from ai.term_extractor import compute_collocations
        # "Osteogenesis imperfecta" appears 4 times, each word alone rarely
        texts = [
            "Osteogenesis imperfecta ist eine Erbkrankheit",
            "Bei Osteogenesis imperfecta ist Kollagen betroffen",
            "Typ I Osteogenesis imperfecta ist häufig",
            "Osteogenesis imperfecta betrifft Knochen",
            "Kollagen ist ein Protein",
            "Knochen bestehen aus Kollagen",
        ]
        collocations = compute_collocations(texts, min_count=3, pmi_threshold=2.0)
        assert ("Osteogenesis", "imperfecta") in collocations

    def test_ignores_rare_bigrams(self):
        from ai.term_extractor import compute_collocations
        texts = ["Seltenes Wortpaar hier", "Anderer Text komplett"]
        collocations = compute_collocations(texts, min_count=3, pmi_threshold=2.0)
        assert len(collocations) == 0

    def test_extractor_uses_collocations(self):
        extractor = TermExtractor()
        # Pre-load collocations
        extractor.set_collocations({("Osteogenesis", "imperfecta")})
        terms = extractor.extract("Osteogenesis imperfecta ist eine Erkrankung")
        assert "Osteogenesis imperfecta" in terms
        assert "Osteogenesis" not in terms  # should be merged
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 run_tests.py -k TestPMICollocation -v`
Expected: ImportError for `compute_collocations`

- [ ] **Step 3: Implement PMI collocation**

Add to `ai/term_extractor.py`:
- `compute_collocations(texts, min_count=3, pmi_threshold=3.0) -> set[tuple[str,str]]`
  - Count unigrams and bigrams across all texts
  - PMI = log2(P(a,b) / (P(a) * P(b)))
  - Return pairs where count >= min_count AND PMI >= threshold
- `TermExtractor.set_collocations(pairs: set)` — stores for use in `extract()`
- In `extract()`: after tokenizing, merge adjacent tokens that match a collocation pair

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 run_tests.py -k TestPMICollocation -v`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add ai/term_extractor.py tests/test_term_extractor.py
git commit -m "feat(kg): add PMI collocation for multi-word term detection"
```

---

### Task 4: Graph Index Builder

**Files:**
- Create: `ai/kg_builder.py`
- Test: `tests/test_kg_builder.py`

- [ ] **Step 1: Write failing tests for edge computation**

```python
# tests/test_kg_builder.py
import sqlite3
try:
    from ai.kg_builder import GraphIndexBuilder
    from storage import kg_store as kg
except ImportError:
    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
    from ai.kg_builder import GraphIndexBuilder
    from storage import kg_store as kg

class TestGraphIndexBuilder:
    def setup_method(self):
        db = sqlite3.connect(":memory:")
        db.row_factory = sqlite3.Row
        kg._init_kg_schema(db)
        kg._db = db
        self.builder = GraphIndexBuilder()

    def teardown_method(self):
        if kg._db:
            kg._db.close()
            kg._db = None

    def test_compute_edges_from_shared_cards(self):
        # Card 100 has Kollagen + Prolin → edge between them
        kg.save_card_terms(100, ["Kollagen", "Prolin"], deck_id=1)
        kg.save_card_terms(200, ["Kollagen", "Prolin"], deck_id=1)
        kg.save_card_terms(300, ["Kollagen", "Elastin"], deck_id=2)
        self.builder.compute_edges()
        edges = kg.get_all_edges()
        kp = next((e for e in edges if set([e["term_a"], e["term_b"]]) == {"Kollagen", "Prolin"}), None)
        assert kp is not None
        assert kp["weight"] == 2  # shared in cards 100 and 200

    def test_prunes_edges_below_threshold(self):
        kg.save_card_terms(100, ["A", "B"], deck_id=1)  # only 1 shared card
        self.builder.compute_edges(min_weight=2)
        edges = kg.get_all_edges()
        assert len(edges) == 0

    def test_limits_max_edges(self):
        # Create many terms sharing cards
        for i in range(50):
            kg.save_card_terms(i, [f"Term{i}", f"Term{i+1}"], deck_id=1)
            kg.save_card_terms(i + 100, [f"Term{i}", f"Term{i+1}"], deck_id=1)
        self.builder.compute_edges(min_weight=2, max_edges=10)
        edges = kg.get_all_edges()
        assert len(edges) <= 10

    def test_updates_term_frequencies(self):
        kg.save_card_terms(100, ["Kollagen"], deck_id=1)
        kg.save_card_terms(200, ["Kollagen"], deck_id=2)
        kg.save_card_terms(300, ["Prolin"], deck_id=1)
        self.builder.update_frequencies()
        assert kg.get_term_frequency("Kollagen") == 2
        assert kg.get_term_frequency("Prolin") == 1

    def test_full_build(self):
        kg.save_card_terms(100, ["Kollagen", "Prolin", "Vitamin C"], deck_id=1)
        kg.save_card_terms(200, ["Kollagen", "Prolin"], deck_id=1)
        kg.save_card_terms(300, ["Kollagen", "Elastin"], deck_id=2)
        self.builder.build()
        data = kg.get_graph_data()
        assert len(data["nodes"]) == 4
        assert all(n["frequency"] > 0 for n in data["nodes"])
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 run_tests.py -k test_kg_builder -v`
Expected: ImportError

- [ ] **Step 3: Implement GraphIndexBuilder**

Create `ai/kg_builder.py`:
- `GraphIndexBuilder` class
- `compute_edges(min_weight=2, max_edges=5000)`: query all `(card_id, term)` pairs from `kg_card_terms`, compute term-pair co-occurrence counts, prune, save via `kg.save_edges()`
- `update_frequencies()`: `UPDATE kg_terms SET frequency = (SELECT COUNT(*) FROM kg_card_terms WHERE kg_card_terms.term = kg_terms.term)`
- `build()`: runs `update_frequencies()` then `compute_edges()`

Edge computation algorithm:
```python
# Group terms by card_id
card_terms = {}  # card_id → [terms]
for row in db.execute("SELECT card_id, term FROM kg_card_terms"):
    card_terms.setdefault(row[0], []).append(row[1])

# Count co-occurrences
from collections import Counter
pair_counts = Counter()
for terms in card_terms.values():
    for i, a in enumerate(terms):
        for b in terms[i+1:]:
            key = tuple(sorted([a, b]))
            pair_counts[key] += 1

# Prune and save
edges = [(a, b, w) for (a, b), w in pair_counts.most_common(max_edges) if w >= min_weight]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 run_tests.py -k test_kg_builder -v`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add ai/kg_builder.py tests/test_kg_builder.py
git commit -m "feat(kg): add GraphIndexBuilder with edge computation and pruning"
```

---

### Task 5: Pipeline Integration

**Files:**
- Modify: `ai/embeddings.py:272-335` (BackgroundEmbeddingThread.run)
- Modify: `__init__.py:224-244` (card data includes deck_id)

- [ ] **Step 1: Read current BackgroundEmbeddingThread.run() to understand exact insertion point**

Check `ai/embeddings.py` lines 272-335 for the card processing loop.

- [ ] **Step 2: Hook term extraction into the embedding loop**

In `ai/embeddings.py`, after `text = self.manager._card_to_text(card)` and before embedding, add:
```python
# Extract KG terms alongside embedding
try:
    from .term_extractor import TermExtractor
    from ..storage.kg_store import save_card_terms
    if not hasattr(self, '_term_extractor'):
        self._term_extractor = TermExtractor()
    terms = self._term_extractor.extract(text)
    if terms:
        question = card.get('question', '')
        definition_terms = [t for t in terms if self._term_extractor.is_definition_card(t, question, card.get('answer', ''))]
        save_card_terms(card['card_id'], terms, deck_id=card.get('deck_id', 0), definition_terms=definition_terms)
except Exception as e:
    logger.warning("KG term extraction failed for card %s: %s", card.get('id'), e)
```

- [ ] **Step 3: Add PMI computation and second-pass re-extraction after all cards**

PMI collocations require all card texts to compute, but term extraction happens per-card in the loop above. Solution: after the first pass, compute PMI, then re-extract ONLY the cards where new collocations would change the result. In practice, accept that the first run uses basic extraction and collocations take effect from the second run onward (or on incremental updates). This is acceptable since the basic extraction already handles 90% of terms.

After the main embedding loop completes:
```python
# Build KG graph index after all terms extracted
try:
    from .term_extractor import compute_collocations
    from .kg_builder import GraphIndexBuilder

    # Compute PMI collocations for future incremental runs
    all_texts = [self.manager._card_to_text(c) for c in cards]
    collocations = compute_collocations(all_texts)
    if hasattr(self, '_term_extractor') and collocations:
        self._term_extractor.set_collocations(collocations)
        # Note: collocations will be used on next incremental update
        # First full run uses basic extraction only (acceptable trade-off)

    builder = GraphIndexBuilder()
    builder.build()
    term_count = kg._db.execute("SELECT COUNT(*) FROM kg_terms").fetchone()[0] if kg._db else 0
    edge_count = kg._db.execute("SELECT COUNT(*) FROM kg_edges").fetchone()[0] if kg._db else 0
    logger.info("Knowledge Graph built: %d terms, %d edges", term_count, edge_count)
except Exception as e:
    logger.warning("KG graph build failed: %s", e)
```

- [ ] **Step 4: Add term embedding generation after graph build**

After `builder.build()`, add step to embed unembedded terms:
```python
# Embed terms that don't have embeddings yet
from ..storage.kg_store import get_unembedded_terms, save_term_embedding
unembedded = get_unembedded_terms()
if unembedded:
    for batch in chunks(unembedded, 50):
        embeddings = self.manager.embed_texts(batch)
        for term, emb in zip(batch, embeddings):
            save_term_embedding(term, emb)
```

- [ ] **Step 5: Ensure card data includes deck_id**

In `__init__.py`, in the `get_all_cards()` callback (~line 230), the card dict uses `card_id` as key (not `id`). Add `deck_id` using the card object that's already available in the loop:
```python
# The existing loop already has the card object — add deck_id to the dict:
# 'deck_id': card.did,  # card.did is the deck ID on the Card object
# Do NOT call mw.col.get_card() again — the card is already in scope
```
Read the actual `get_all_cards` implementation to find the exact insertion point. The card object's `.did` attribute gives the deck ID.
```

- [ ] **Step 6: Test manually by running embedding pipeline**

Build and restart Anki, verify in console that KG terms are extracted and graph is built.

- [ ] **Step 7: Commit**

```bash
git add ai/embeddings.py __init__.py
git commit -m "feat(kg): integrate term extraction into embedding pipeline"
```

---

## Phase 2: Graph View Frontend

### Task 6: Install 3d-force-graph + Code Splitting

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/vite.config.js`

- [ ] **Step 1: Install 3d-force-graph**

```bash
cd frontend && npm install 3d-force-graph
```

- [ ] **Step 2: Verify three.js is pulled in as dependency**

```bash
ls node_modules/three/build/three.module.js
```

- [ ] **Step 3: Configure Vite manual chunks for three.js**

In `frontend/vite.config.js`, add to `rollupOptions.output`:
```javascript
manualChunks: {
  'three-vendor': ['three'],
  '3d-force-graph': ['3d-force-graph'],
},
```

- [ ] **Step 4: Build to verify chunk splitting works**

```bash
npm run build
ls -la ../web/assets/ | grep three
```
Expected: separate chunk file for three.js

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vite.config.js
git commit -m "feat(kg): add 3d-force-graph dependency with chunk splitting"
```

---

### Task 7: Message Queue Handlers (Synchronous)

**Files:**
- Modify: `ui/widget.py:441-549` (add to `_get_message_handler()` dict)

**IMPORTANT:** This codebase does NOT use `@pyqtSlot` for JS→Python communication. JavaScript calls `window.ankiBridge.addMessage(type, data)` which pushes to a queue. Python polls via `_poll_messages()` and dispatches to handlers in the `_get_message_handler()` dict in `widget.py`. Results are pushed back via `self._send_to_js(payload)`.

- [ ] **Step 1: Read `_get_message_handler()` in widget.py to find the handler dict**

Read `ui/widget.py` around line 441 to see the existing handler registration pattern.

- [ ] **Step 2: Add KG message handlers to the handler dict**

In the `handlers` dict inside `_get_message_handler()`, add:
```python
'getGraphData': self._msg_get_graph_data,
'getTermCards': self._msg_get_term_cards,
'getGraphStatus': self._msg_get_graph_status,
'getCardKGTerms': self._msg_get_card_kg_terms,
'searchGraph': self._msg_search_graph,
'getTermDefinition': self._msg_get_term_definition,
'startTermStack': self._msg_start_term_stack,
```

- [ ] **Step 3: Implement sync handler methods on ChatbotWidget**

```python
def _msg_get_graph_data(self, data):
    """Return full graph data for 3D rendering."""
    try:
        from ..storage.kg_store import get_graph_data
        result = get_graph_data()
        self._send_to_js({"type": "graph.data", "data": result})
    except Exception as e:
        logger.exception("getGraphData failed")
        self._send_to_js({"type": "graph.data", "data": {"nodes": [], "edges": []}})

def _msg_get_term_cards(self, data):
    """Return card IDs for a term."""
    try:
        from ..storage.kg_store import get_term_card_ids
        term = data.get("term", "")
        card_ids = get_term_card_ids(term)
        self._send_to_js({"type": "graph.termCards", "data": {"term": term, "cardIds": card_ids}})
    except Exception as e:
        logger.exception("getTermCards failed")
        self._send_to_js({"type": "graph.termCards", "data": {"cardIds": []}})

def _msg_get_graph_status(self, data):
    """Return graph build status."""
    try:
        from ..storage.kg_store import get_graph_status
        self._send_to_js({"type": "graph.status", "data": get_graph_status()})
    except Exception as e:
        logger.exception("getGraphStatus failed")
        self._send_to_js({"type": "graph.status", "data": {"totalCards": 0, "totalTerms": 0}})

def _msg_get_card_kg_terms(self, data):
    """Return KG terms for a specific card (for reviewer marking)."""
    try:
        from ..storage.kg_store import get_card_terms
        card_id = int(data.get("cardId", 0))
        terms = get_card_terms(card_id)
        self._send_to_js({"type": "kg.cardTerms", "data": {"cardId": card_id, "terms": terms}})
    except Exception as e:
        logger.exception("getCardKGTerms failed")
        self._send_to_js({"type": "kg.cardTerms", "data": {"terms": []}})
```

- [ ] **Step 4: Commit**

```bash
git add ui/widget.py
git commit -m "feat(kg): add message queue handlers for graph data"
```

---

### Task 8: useKnowledgeGraph Hook

**Files:**
- Create: `frontend/src/hooks/useKnowledgeGraph.js`

- [ ] **Step 1: Create the hook**

```javascript
// frontend/src/hooks/useKnowledgeGraph.js
import { useState, useEffect, useCallback, useRef } from 'react';

export default function useKnowledgeGraph() {
  const [graphData, setGraphData] = useState(null);
  const [graphStatus, setGraphStatus] = useState(null);
  const [selectedTerm, setSelectedTerm] = useState(null);
  const [searchResult, setSearchResult] = useState(null);
  const [termDefinition, setTermDefinition] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load graph data on mount
  useEffect(() => {
    const loadGraph = () => {
      if (window.ankiBridge) {
        window.ankiBridge.addMessage('getGraphData', {});
      }
    };
    loadGraph();
  }, []);

  // Listen for async results via ankiReceive (standard pattern)
  // The parent App.jsx ankiReceive handler dispatches graph.* events
  // as window events. This follows the existing addon.phrases pattern.
  useEffect(() => {
    const handlers = {
      'graph.data': (e) => { setGraphData(e.detail); setLoading(false); },
      'graph.searchResult': (e) => { setSearchResult(e.detail); },
      'graph.termDefinition': (e) => { setTermDefinition(e.detail); },
      'graph.status': (e) => { setGraphStatus(e.detail); },
      'graph.termCards': (e) => { /* handled by ReviewerView directly */ },
    };
    Object.entries(handlers).forEach(([evt, fn]) => window.addEventListener(evt, fn));
    return () => Object.entries(handlers).forEach(([evt, fn]) => window.removeEventListener(evt, fn));
  }, []);

  const searchGraph = useCallback((query) => {
    if (window.ankiBridge) {
      window.ankiBridge.addMessage('searchGraph', { query });
    }
  }, []);

  const requestDefinition = useCallback((term) => {
    setTermDefinition({ term, loading: true });
    if (window.ankiBridge) {
      window.ankiBridge.addMessage('getTermDefinition', { term });
    }
  }, []);

  const startStack = useCallback((term, cardIds) => {
    if (window.ankiBridge) {
      window.ankiBridge.addMessage('startTermStack', { term, cardIds: JSON.stringify(cardIds) });
    }
  }, []);

  return {
    graphData, graphStatus, loading,
    selectedTerm, setSelectedTerm,
    searchResult, termDefinition,
    searchGraph, requestDefinition, startStack,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useKnowledgeGraph.js
git commit -m "feat(kg): add useKnowledgeGraph hook for bridge communication"
```

---

### Task 9: GraphView Component

**Files:**
- Create: `frontend/src/components/GraphView.jsx`

- [ ] **Step 1: Create GraphView with 3d-force-graph**

Create `frontend/src/components/GraphView.jsx`:
- Import `ForceGraph3D` from `3d-force-graph` (ensure it's default export)
- Use `useKnowledgeGraph()` hook for data
- Configure node appearance: size by frequency, color by deckColor
- Configure edge appearance: opacity by weight
- Add node hover → tooltip
- Add node click → select term, fly camera
- Add search focus: filter nodes by opacity based on `searchResult`
- Style: `var(--ds-bg-deep)` background, `var(--ds-text-primary)` labels

Key implementation details:
- `ForceGraph3D` takes `graphData` prop with `{nodes, links}` (rename edges → links)
- `nodeThreeObject` callback for custom node rendering (sphere + glow)
- `onNodeClick` for selection
- `onNodeHover` for tooltip
- Camera animation via `graph.cameraPosition()` method
- `React.forwardRef` to expose graph instance for external control

- [ ] **Step 2: Add to index.css for kg-marker styles**

Add to `frontend/src/index.css`:
```css
.kg-marker {
  border-bottom: 1px solid var(--ds-accent-20);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.kg-marker:hover {
  border-bottom-color: var(--ds-accent);
  background: var(--ds-accent-10);
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/GraphView.jsx frontend/src/index.css
git commit -m "feat(kg): add GraphView component with 3d-force-graph"
```

---

### Task 10: GraphBottomBar Component

**Files:**
- Create: `frontend/src/components/GraphBottomBar.jsx`

- [ ] **Step 1: Create GraphBottomBar with 3 states**

Create `frontend/src/components/GraphBottomBar.jsx`:
- Props: `{ status, selectedTerm, termDefinition, searchResult, onStartStack, onTermClick, onRequestDefinition }`
- State 1 (idle): Show `status.totalCards`, `status.totalTerms`, refresh animation
- State 2 (search): Show search result summary + "Stapel starten" button
- State 3 (selected): Show term name, card count, definition (or loading), connected terms, "Stapel starten"
- All styling via `.ds-frosted` material and `var(--ds-*)` tokens
- Smooth transitions between states via framer-motion (already installed)

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/GraphBottomBar.jsx
git commit -m "feat(kg): add GraphBottomBar with idle/search/selected states"
```

---

### Task 11: TermPopup Component

**Files:**
- Create: `frontend/src/components/TermPopup.jsx`

- [ ] **Step 1: Create unified TermPopup**

Create `frontend/src/components/TermPopup.jsx`:
- Props: `{ term, cardCount, deckNames, definition, sourceCount, connectedTerms, onTermClick, onStartStack, mode, onClose }`
- `mode='bottom-bar'`: renders inline (no positioning, no close button)
- `mode='overlay'`: renders as fixed-position floating panel with close button, positioned via `x,y` props
- Definition loading state: subtle pulse animation
- Definition error state: "Offline — Definition nicht verfügbar" or retry button
- Connected terms as clickable chips
- "Stapel starten" button (accent color)
- Styling: `var(--ds-bg-overlay)`, `var(--ds-shadow-lg)`, `var(--ds-text-primary)`

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/TermPopup.jsx
git commit -m "feat(kg): add unified TermPopup component (bottom-bar + overlay modes)"
```

---

### Task 12: App.jsx Integration

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Add lazy-loaded GraphView import**

At the top of App.jsx:
```javascript
const GraphView = React.lazy(() => import('./components/GraphView'));
```

- [ ] **Step 2: Add graph view state**

Add to the app's state management:
```javascript
const [viewMode, setViewMode] = useState('graph'); // 'graph' | 'decks'
```

- [ ] **Step 3: Render GraphView when viewMode === 'graph'**

In the render section where DeckBrowserView is currently rendered, wrap with conditional:
```jsx
{appState === 'deckBrowser' && (
  viewMode === 'graph' ? (
    <React.Suspense fallback={<div style={{flex:1}} />}>
      <GraphView onToggleView={() => setViewMode('decks')} />
    </React.Suspense>
  ) : (
    <DeckBrowserView data={deckData} onToggleView={() => setViewMode('graph')} />
  )
)}
```

- [ ] **Step 4: Add ankiReceive handler for graph events**

In the existing `ankiReceive` handler in App.jsx, add cases for `graph.*` event types.
This follows the same pattern as `addon.phrases` — dispatch as CustomEvent on `window`:
```javascript
if (payload.type && payload.type.startsWith('graph.')) {
  window.dispatchEvent(new CustomEvent(payload.type, { detail: payload.data }));
}
if (payload.type === 'kg.cardTerms') {
  window.dispatchEvent(new CustomEvent('kg.cardTerms', { detail: payload.data }));
}
```

- [ ] **Step 5: Build and test in browser**

```bash
cd frontend && npm run build
```
Restart Anki, verify graph view loads on home screen.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(kg): integrate GraphView as home screen with lazy loading"
```

---

## Phase 3: Term Marking in Reviewer

### Task 13: Refactor applyPhraseMarkers

**Files:**
- Modify: `frontend/src/components/ReviewerView.jsx:125-183`

- [ ] **Step 1: Make CSS class configurable by source**

In `applyPhraseMarkers()`, replace hardcoded `'amboss-marker'`:
```javascript
// Derive class name from source
const markerClass = source === 'knowledge-graph' ? 'kg-marker' : 'amboss-marker';

// In the span creation:
span.className = markerClass;
```

- [ ] **Step 2: Also skip already-marked kg-marker spans in TreeWalker**

Update the skip condition:
```javascript
if (tag === 'SCRIPT' || tag === 'STYLE' ||
    parent.classList.contains('amboss-marker') ||
    parent.classList.contains('kg-marker')) continue;
```

- [ ] **Step 3: Add KG term loading on card display**

Add a new useEffect in ReviewerView that loads KG terms for the current card:
```javascript
useEffect(() => {
  if (!cardId || !cardContentRef.current) return;
  // Request KG terms for this card via bridge
  if (window.ankiBridge) {
    window.ankiBridge.addMessage('getCardKGTerms', { cardId });
  }
  const handler = (e) => {
    const { terms, source } = e.detail || {};
    if (terms && cardContentRef.current) {
      const termMap = {};
      terms.forEach(t => { termMap[t] = 'kg-' + t.toLowerCase().replace(/\s+/g, '-'); });
      applyPhraseMarkers(cardContentRef.current, termMap, 'knowledge-graph');
    }
  };
  window.addEventListener('kg.cardTerms', handler);
  return () => window.removeEventListener('kg.cardTerms', handler);
}, [cardId]);
```

- [ ] **Step 4: Add click handler for .kg-marker**

In the existing `handleCardClick` function, add detection for `.kg-marker`:
```javascript
const kgMarker = e.target.closest('.kg-marker');
if (kgMarker) {
  const term = kgMarker.textContent;
  setKgPopup({ term, x: e.clientX, y: e.clientY });
  return;
}
```

- [ ] **Step 5: Render TermPopup overlay in ReviewerView**

```jsx
{kgPopup && (
  <TermPopup
    term={kgPopup.term}
    mode="overlay"
    x={kgPopup.x}
    y={kgPopup.y}
    onClose={() => setKgPopup(null)}
    onTermClick={(t) => { setKgPopup({ ...kgPopup, term: t }); }}
    onStartStack={(cardIds) => { /* bridge call */ }}
    {...termPopupData}
  />
)}
```

- [ ] **Step 6: Add getCardKGTerms bridge slot**

In `ui/bridge.py`:
```python
@pyqtSlot(str, result=str)
def getCardKGTerms(self, card_id_str):
    try:
        from ..storage.kg_store import get_card_terms
        terms = get_card_terms(int(card_id_str))
        return json.dumps({"terms": terms})
    except Exception as e:
        logger.exception("getCardKGTerms failed")
        return json.dumps({"terms": []})
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ReviewerView.jsx ui/bridge.py
git commit -m "feat(kg): add term marking in reviewer with TermPopup overlay"
```

---

## Phase 4: Definition Generation

### Task 14: Async Bridge Methods + QThreads

**Files:**
- Modify: `ui/widget.py`
- Modify: `ui/bridge.py`

- [ ] **Step 1: Create KGDefinitionThread**

In `ui/widget.py`, add after AIRequestThread:
```python
class KGDefinitionThread(QThread):
    result_signal = pyqtSignal(str)  # JSON result

    def __init__(self, term, widget_ref):
        super().__init__()
        self.term = term
        self._widget_ref = weakref.ref(widget_ref)

    def run(self):
        try:
            from ..storage.kg_store import get_definition, get_term_card_ids, save_definition, get_connected_terms
            # IMPORTANT: get_embedding_manager is in __init__.py, not ai/embeddings.py
            from .. import get_embedding_manager

            # Check cache first
            cached = get_definition(self.term)
            if cached:
                cached["connectedTerms"] = get_connected_terms(self.term)
                self.result_signal.emit(json.dumps({
                    "type": "graph.termDefinition",
                    "data": cached
                }))
                return

            # Use existing search() method (does cosine similarity internally)
            emb_mgr = get_embedding_manager()
            if emb_mgr is None:
                self.result_signal.emit(json.dumps({
                    "type": "graph.termDefinition",
                    "data": {"term": self.term, "error": "Embedding-Manager nicht verfügbar"}
                }))
                return

            query = f"Was ist {self.term}? Definition"
            query_emb = emb_mgr.embed_texts([query])
            if not query_emb:
                self.result_signal.emit(json.dumps({
                    "type": "graph.termDefinition",
                    "data": {"term": self.term, "error": "Embedding fehlgeschlagen"}
                }))
                return

            # Use search() to find top cards by similarity, then filter to term's cards
            card_ids_set = set(get_term_card_ids(self.term))
            all_results = emb_mgr.search(query_emb[0], top_k=50)
            # Filter to only cards containing this term
            top_cards = [(cid, score) for cid, score in all_results if cid in card_ids_set][:8]

            if len(top_cards) < 2:
                self.result_signal.emit(json.dumps({
                    "type": "graph.termDefinition",
                    "data": {"term": self.term, "error": "Nicht genug Quellen"}
                }))
                return

            # Get card texts for LLM (from Anki collection, must be on main thread)
            from ..utils.anki import run_on_main_thread
            import threading
            card_texts = []
            event = threading.Event()
            def _fetch_texts():
                from aqt import mw
                for cid, _ in top_cards:
                    try:
                        card = mw.col.get_card(cid)
                        note = card.note()
                        fields = note.fields
                        card_texts.append({
                            "question": fields[0] if fields else "",
                            "answer": fields[1] if len(fields) > 1 else "",
                        })
                    except Exception:
                        pass
                event.set()
            run_on_main_thread(_fetch_texts)
            event.wait(timeout=10)

            # Generate definition via Gemini Flash
            from ..ai.gemini import generate_definition
            definition = generate_definition(self.term, card_texts)

            # Cache
            source_ids = [cid for cid, _ in top_cards]
            save_definition(self.term, definition, source_ids, "llm")

            connected = get_connected_terms(self.term)
            self.result_signal.emit(json.dumps({
                "type": "graph.termDefinition",
                "data": {
                    "term": self.term,
                    "definition": definition,
                    "sourceCount": len(source_ids),
                    "generatedBy": "llm",
                    "connectedTerms": connected,
                }
            }))
        except Exception as e:
            logger.exception("KG definition generation failed for %s", self.term)
            self.result_signal.emit(json.dumps({
                "type": "graph.termDefinition",
                "data": {"term": self.term, "error": str(e)}
            }))
```

- [ ] **Step 2: Add async message handlers to widget.py**

These go in the same ChatbotWidget class, registered in the handler dict (Task 7):

```python
def _msg_get_term_definition(self, data):
    """Async: check cache, if miss → QThread generates definition."""
    try:
        from ..storage.kg_store import get_definition, get_connected_terms
        term = data.get("term", "")
        cached = get_definition(term)
        if cached:
            cached["connectedTerms"] = get_connected_terms(term)
            self._send_to_js({"type": "graph.termDefinition", "data": cached})
            return
        # Launch background thread
        self._start_kg_definition(term)
    except Exception as e:
        logger.exception("getTermDefinition failed")

def _msg_search_graph(self, data):
    """Exact match → immediate. Semantic → async QThread."""
    try:
        from ..storage.kg_store import search_terms_exact
        query = data.get("query", "")
        exact = search_terms_exact(query)
        if exact:
            self._send_to_js({
                "type": "graph.searchResult",
                "data": {"matchedTerms": exact, "isQuestion": False}
            })
            return
        # Semantic search in background thread
        self._start_kg_search(query)
    except Exception as e:
        logger.exception("searchGraph failed")

def _msg_start_term_stack(self, data):
    """Create filtered deck from card IDs and enter reviewer."""
    try:
        term = data.get("term", "KG Stack")
        card_ids = json.loads(data.get("cardIds", "[]"))
        if not card_ids:
            return

        from ..utils.anki import run_on_main_thread
        def _create_stack():
            from aqt import mw
            # Clean up old KG filtered decks
            for d in mw.col.decks.all_names_and_ids():
                if d.name.startswith("KG: "):
                    mw.col.decks.remove([d.id])

            # Create filtered deck — verify API against installed Anki version
            # Anki's search syntax for multiple card IDs: "cid:1 OR cid:2 OR cid:3"
            search = " OR ".join(f"cid:{cid}" for cid in card_ids[:100])
            did = mw.col.decks.new_filtered(f"KG: {term}")
            deck = mw.col.decks.get(did)
            deck["terms"] = [{"search": search, "limit": len(card_ids), "order": 0}]
            mw.col.decks.save(deck)
            mw.col.sched.rebuild_filtered_deck(did)
            mw.moveToState("review")

        run_on_main_thread(_create_stack)
    except Exception as e:
        logger.exception("startTermStack failed")
```

- [ ] **Step 5: Wire thread dispatch in widget.py**

Add to ChatbotWidget:
```python
def _start_kg_definition(self, term):
    self._kg_def_thread = KGDefinitionThread(term, self)
    self._kg_def_thread.result_signal.connect(self._on_kg_result)
    self._kg_def_thread.start()

def _on_kg_result(self, result_json):
    payload = json.loads(result_json)
    self._send_to_js(payload)
```

- [ ] **Step 6: Commit**

```bash
git add ui/widget.py ui/bridge.py
git commit -m "feat(kg): add async bridge methods for definition generation and search"
```

---

### Task 15: Gemini Definition Generation Function

**Files:**
- Modify: `ai/gemini.py` (add `generate_definition` function)

- [ ] **Step 1: Add generate_definition to gemini.py**

```python
def generate_definition(term, card_texts, model="gemini-2.0-flash"):
    """Generate a concise definition from card texts."""
    cards_str = "\n\n".join(
        f"Karte {i+1}:\nFrage: {c.get('question','')}\nAntwort: {c.get('answer','')}"
        for i, c in enumerate(card_texts)
    )
    prompt = (
        f"Basierend auf den folgenden Lernkarten, erstelle eine präzise Definition von '{term}'. "
        f"Maximal 3 Sätze. Antworte auf Deutsch.\n\n{cards_str}"
    )
    # Use existing request infrastructure
    response = _make_request(prompt, model=model, max_tokens=300)
    return response.get("text", "")
```

- [ ] **Step 2: Commit**

```bash
git add ai/gemini.py
git commit -m "feat(kg): add Gemini definition generation function"
```

---

## Phase 5: Polish

### Task 16: Level of Detail (LOD)

**Files:**
- Modify: `frontend/src/components/GraphView.jsx`

- [ ] **Step 1: Implement LOD label visibility**

In GraphView, add camera distance-based label filtering:
```javascript
// In the render loop or nodeThreeObject callback:
const cameraDistance = camera.position.distanceTo(node.__threeObj.position);
const showLabel = node.frequency > frequencyThreshold(cameraDistance);

function frequencyThreshold(distance) {
  if (distance < 20) return 1;   // zoomed in: show all
  if (distance < 40) return 3;   // mid zoom: frequent terms only
  return 8;                       // zoomed out: only high-frequency
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/GraphView.jsx
git commit -m "feat(kg): add LOD label visibility based on camera distance"
```

---

### Task 17: Refresh Animation + Status Display

**Files:**
- Modify: `frontend/src/components/GraphBottomBar.jsx`

- [ ] **Step 1: Add refresh animation on mount**

When GraphBottomBar mounts in idle state:
1. Show "Prüfe..." with subtle pulse animation (framer-motion)
2. After bridge returns graph status: animate to "Graph aktuell" with checkmark
3. If `pendingUpdates > 0`: show progress bar

Use `var(--ds-green)` for "aktuell" state, `var(--ds-accent)` for "Prüfe..." state.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/GraphBottomBar.jsx
git commit -m "feat(kg): add refresh animation and status display in bottom bar"
```

---

### Task 18: Deck List Toggle

**Files:**
- Modify: `frontend/src/components/DeckBrowserView.jsx`

- [ ] **Step 1: Add toggle button in header**

In the header area of DeckBrowserView, add a button to switch to graph view:
```jsx
<button
  onClick={onToggleView}
  style={{
    background: 'var(--ds-hover-tint)',
    border: '1px solid var(--ds-border)',
    borderRadius: 8,
    padding: '4px 12px',
    color: 'var(--ds-text-secondary)',
    fontSize: 12,
    cursor: 'pointer',
  }}
>
  Knowledge Graph
</button>
```

Similarly in GraphView, add toggle back to "Deck-Liste".

- [ ] **Step 2: Save preference in config**

```javascript
// In App.jsx, persist viewMode
useEffect(() => {
  if (window.ankiBridge) {
    window.ankiBridge.addMessage('saveSettings', { key: 'kg_view_mode', value: viewMode });
  }
}, [viewMode]);
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/DeckBrowserView.jsx frontend/src/components/GraphView.jsx frontend/src/App.jsx
git commit -m "feat(kg): add deck list / knowledge graph toggle with preference persistence"
```

---

### Task 19: Build + Integration Test

**Files:**
- All

- [ ] **Step 1: Run all Python tests**

```bash
python3 run_tests.py -v
```
Expected: All existing tests + new KG tests pass

- [ ] **Step 2: Build frontend**

```bash
cd frontend && npm run build
```
Expected: Clean build, three.js in separate chunk

- [ ] **Step 3: Manual Anki test**

Restart Anki, verify:
1. Graph view loads as home screen
2. Nodes appear after embedding pipeline runs
3. Search focuses the graph
4. Clicking a node shows TermPopup in bottom bar
5. "Stapel starten" creates a filtered deck and enters reviewer
6. Term marking appears on cards in reviewer
7. Clicking a marked term shows TermPopup overlay
8. Toggle to deck list and back works

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(kg): complete Knowledge Graph integration"
```
