"""GraphIndexBuilder — computes term co-occurrence edges and updates frequencies.

Part of the Knowledge Graph pipeline. Reads from kg_card_terms (via kg_store)
and writes co-occurrence edges to kg_edges plus term frequencies to kg_terms.
"""

from collections import Counter

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

try:
    from . import kg_store_ref  # unused; kept for future intra-package imports
except ImportError:
    pass

logger = get_logger(__name__)


class GraphIndexBuilder:
    """Builds the Knowledge Graph index from stored card terms.

    Usage::

        builder = GraphIndexBuilder()
        builder.build()          # full rebuild (frequencies + edges)

        # or individually:
        builder.update_frequencies()
        builder.compute_edges(min_weight=2, max_edges=5000)
    """

    # ------------------------------------------------------------------
    #  Public API
    # ------------------------------------------------------------------

    def compute_edges(self, min_weight: int = 2, max_edges: int = 5000):
        """Compute co-occurrence edges between terms that share cards.

        Algorithm:
            1. Group terms by card_id from kg_card_terms.
            2. Count how many cards each (term_a, term_b) pair shares.
            3. Prune pairs below *min_weight*.
            4. Keep at most *max_edges* pairs (highest weight first).
            5. Persist to kg_edges via kg_store.save_edges().

        Args:
            min_weight: Minimum shared-card count for an edge to be kept.
            max_edges:  Maximum number of edges to persist.
        """
        try:
            from ..storage import kg_store as kg
        except ImportError:
            from storage import kg_store as kg

        db = kg._get_db()

        # Step 1 — group terms by card
        card_terms: dict = {}
        for row in db.execute("SELECT card_id, term FROM kg_card_terms"):
            card_terms.setdefault(row[0], []).append(row[1])

        logger.debug(
            "GraphIndexBuilder.compute_edges: %s cards loaded", len(card_terms)
        )

        # Step 2 — count co-occurrences
        pair_counts: Counter = Counter()
        for terms in card_terms.values():
            # Deduplicate within a card to avoid inflated self-counts
            unique_terms = list(dict.fromkeys(terms))
            for i, a in enumerate(unique_terms):
                for b in unique_terms[i + 1 :]:
                    key = tuple(sorted([a, b]))
                    pair_counts[key] += 1

        # Step 3 & 4 — prune and limit
        edges = [
            (a, b, w)
            for (a, b), w in pair_counts.most_common(max_edges)
            if w >= min_weight
        ]

        logger.info(
            "GraphIndexBuilder.compute_edges: %s edges computed (min_weight=%s, max_edges=%s)",
            len(edges),
            min_weight,
            max_edges,
        )

        # Step 5 — persist
        kg.save_edges(edges)

    def update_frequencies(self):
        """Update kg_terms.frequency from kg_card_terms counts.

        Delegates to kg_store.update_term_frequencies() which performs an
        efficient GROUP BY upsert in a single SQL statement.
        """
        try:
            from ..storage import kg_store as kg
        except ImportError:
            from storage import kg_store as kg

        logger.info("GraphIndexBuilder.update_frequencies: updating term frequencies")
        kg.update_term_frequencies()

    def build(self, min_weight: int = 2, max_edges: int = 5000):
        """Full index build: update frequencies then compute edges.

        Args:
            min_weight: Forwarded to compute_edges().
            max_edges:  Forwarded to compute_edges().
        """
        logger.info("GraphIndexBuilder.build: starting full build")
        self.update_frequencies()
        self.compute_edges(min_weight=min_weight, max_edges=max_edges)
        logger.info("GraphIndexBuilder.build: complete")
