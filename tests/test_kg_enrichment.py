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
