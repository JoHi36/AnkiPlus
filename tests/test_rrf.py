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
