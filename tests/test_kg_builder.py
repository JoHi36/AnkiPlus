"""Tests for ai/kg_builder.py — GraphIndexBuilder.

Uses an in-memory SQLite database (no Anki dependency).
"""

import sqlite3
import storage.kg_store as kg


class _BaseKGBuilderTest:
    """Inject a fresh in-memory DB into kg_store before each test."""

    def setup_method(self):
        self._orig_db = kg._db
        kg._db = sqlite3.connect(":memory:")
        kg._db.row_factory = sqlite3.Row
        kg._db.execute("PRAGMA journal_mode=WAL")
        kg._init_kg_schema(kg._db)

    def teardown_method(self):
        if kg._db:
            kg._db.close()
        kg._db = self._orig_db


class TestGraphIndexBuilder(_BaseKGBuilderTest):

    def _make_builder(self):
        """Import and instantiate GraphIndexBuilder with the mocked db."""
        try:
            from ai.kg_builder import GraphIndexBuilder
        except ImportError:
            from kg_builder import GraphIndexBuilder
        return GraphIndexBuilder()

    # ------------------------------------------------------------------
    # test_compute_edges_from_shared_cards
    # ------------------------------------------------------------------

    def test_compute_edges_from_shared_cards(self):
        """Two cards each containing Kollagen + Prolin → edge weight = 2."""
        kg.save_card_terms(100, ["Kollagen", "Prolin"], deck_id=1)
        kg.save_card_terms(200, ["Kollagen", "Prolin"], deck_id=1)

        builder = self._make_builder()
        builder.compute_edges(min_weight=2)

        edges = kg.get_all_edges(min_weight=1)
        pairs = {(e["term_a"], e["term_b"]): e["weight"] for e in edges}

        # Edge exists in either order (sorted canonical form: Kollagen < Prolin)
        key = tuple(sorted(["Kollagen", "Prolin"]))
        assert key in pairs, f"Expected edge {key}, got {list(pairs.keys())}"
        assert pairs[key] == 2

    # ------------------------------------------------------------------
    # test_prunes_edges_below_threshold
    # ------------------------------------------------------------------

    def test_prunes_edges_below_threshold(self):
        """Only 1 shared card → edge weight = 1, pruned at min_weight=2."""
        kg.save_card_terms(300, ["Alpha", "Beta"], deck_id=1)
        # Alpha and Beta appear together only once

        builder = self._make_builder()
        builder.compute_edges(min_weight=2)

        edges = kg.get_all_edges(min_weight=1)
        pairs = {(e["term_a"], e["term_b"]) for e in edges}

        key = tuple(sorted(["Alpha", "Beta"]))
        assert key not in pairs, "Edge with weight < min_weight should be pruned"

    # ------------------------------------------------------------------
    # test_limits_max_edges
    # ------------------------------------------------------------------

    def test_limits_max_edges(self):
        """With many co-occurring pairs, only top max_edges are kept."""
        # Create 5 cards, each with 4 terms — 4C2 = 6 unique pairs per card.
        # Use distinct terms per card so each pair appears exactly twice (in 2 cards).
        # We'll use 10 terms across 2 cards to generate C(10,2)=45 unique pairs
        # each at weight ≥1, but then limit to max_edges=3.
        terms_a = [f"term_a_{i}" for i in range(6)]
        terms_b = [f"term_b_{i}" for i in range(6)]

        # Card 400 and 401 share all terms_a (6 terms → 15 pairs at weight=2)
        for card_id in [400, 401]:
            kg.save_card_terms(card_id, terms_a, deck_id=1)

        # Card 402 and 403 share all terms_b (6 terms → 15 pairs at weight=2)
        for card_id in [402, 403]:
            kg.save_card_terms(card_id, terms_b, deck_id=1)

        builder = self._make_builder()
        builder.compute_edges(min_weight=2, max_edges=5)

        edges = kg.get_all_edges(min_weight=1)
        assert len(edges) <= 5, f"Expected at most 5 edges, got {len(edges)}"

    # ------------------------------------------------------------------
    # test_updates_term_frequencies
    # ------------------------------------------------------------------

    def test_updates_term_frequencies(self):
        """update_frequencies(): Kollagen in 2 cards → frequency = 2."""
        kg.save_card_terms(500, ["Kollagen", "Hydroxyprolin"], deck_id=1)
        kg.save_card_terms(501, ["Kollagen"], deck_id=1)

        builder = self._make_builder()
        builder.update_frequencies()

        assert kg.get_term_frequency("Kollagen") == 2
        assert kg.get_term_frequency("Hydroxyprolin") == 1

    # ------------------------------------------------------------------
    # test_full_build
    # ------------------------------------------------------------------

    def test_full_build(self):
        """build() runs both update_frequencies and compute_edges."""
        kg.save_card_terms(600, ["Fibrin", "Thrombin"], deck_id=1)
        kg.save_card_terms(601, ["Fibrin", "Thrombin"], deck_id=1)

        builder = self._make_builder()
        builder.build(min_weight=2)

        # Frequencies updated
        assert kg.get_term_frequency("Fibrin") == 2
        assert kg.get_term_frequency("Thrombin") == 2

        # Edge computed
        edges = kg.get_all_edges(min_weight=1)
        pairs = {(e["term_a"], e["term_b"]) for e in edges}
        key = tuple(sorted(["Fibrin", "Thrombin"]))
        assert key in pairs, f"Expected edge {key} after build(), got {list(pairs)}"
