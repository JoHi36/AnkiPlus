"""Tests for storage/kg_store.py — Knowledge Graph SQLite storage layer.

These tests use an in-memory SQLite database (no Anki dependency).
"""

import sqlite3
import struct
import storage.kg_store as kg


def _make_embedding(n=3):
    """Create a small embedding as bytes (n floats)."""
    return struct.pack(f"{n}f", *[float(i) * 0.1 for i in range(n)])


class TestKGSchemaInit:
    """Schema creation is idempotent."""

    def setup_method(self):
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        kg._init_kg_schema(self.db)

    def teardown_method(self):
        self.db.close()

    def test_tables_created(self):
        tables = {
            row[0]
            for row in self.db.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        assert "kg_card_terms" in tables
        assert "kg_terms" in tables
        assert "kg_edges" in tables
        assert "kg_definitions" in tables

    def test_index_created(self):
        indexes = {
            row[0]
            for row in self.db.execute(
                "SELECT name FROM sqlite_master WHERE type='index'"
            ).fetchall()
        }
        assert "idx_kg_card_terms_term" in indexes

    def test_idempotent(self):
        """Calling _init_kg_schema twice should not raise."""
        kg._init_kg_schema(self.db)  # second call


class _BaseKGTest:
    """Shared setup/teardown: injects an in-memory DB into kg module."""

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


class TestSaveGetCardTerms(_BaseKGTest):
    """save_card_terms / get_card_terms / delete_card_terms."""

    def test_save_and_get(self):
        kg.save_card_terms(1, ["Herzinfarkt", "EKG"], deck_id=10)
        terms = kg.get_card_terms(1)
        assert set(terms) == {"Herzinfarkt", "EKG"}

    def test_empty_returns_empty_list(self):
        assert kg.get_card_terms(999) == []

    def test_delete_card_terms(self):
        kg.save_card_terms(2, ["Herz", "Aorta"], deck_id=10)
        kg.delete_card_terms(2)
        assert kg.get_card_terms(2) == []

    def test_upsert_replaces_on_conflict(self):
        """Saving the same (card_id, term) twice should not raise."""
        kg.save_card_terms(3, ["Herz"], deck_id=10)
        kg.save_card_terms(3, ["Herz", "EKG"], deck_id=10)
        terms = kg.get_card_terms(3)
        assert "Herz" in terms
        assert "EKG" in terms

    def test_definition_terms_flagged(self):
        kg.save_card_terms(4, ["Herz", "EKG"], deck_id=10, definition_terms=["EKG"])
        row = kg._db.execute(
            "SELECT is_definition FROM kg_card_terms WHERE card_id=4 AND term='EKG'"
        ).fetchone()
        assert row["is_definition"] == 1

        row2 = kg._db.execute(
            "SELECT is_definition FROM kg_card_terms WHERE card_id=4 AND term='Herz'"
        ).fetchone()
        assert row2["is_definition"] == 0


class TestGetTermCardIds(_BaseKGTest):

    def test_basic(self):
        kg.save_card_terms(10, ["Sepsis"], deck_id=1)
        kg.save_card_terms(11, ["Sepsis", "Infektion"], deck_id=1)
        ids = kg.get_term_card_ids("Sepsis")
        assert set(ids) == {10, 11}

    def test_unknown_term_returns_empty(self):
        assert kg.get_term_card_ids("nonexistent_xyz") == []


class TestTermFrequencies(_BaseKGTest):

    def test_update_and_get_frequency(self):
        kg.save_card_terms(20, ["Alpha", "Beta"], deck_id=1)
        kg.save_card_terms(21, ["Alpha"], deck_id=1)
        kg.update_term_frequencies()
        assert kg.get_term_frequency("Alpha") == 2
        assert kg.get_term_frequency("Beta") == 1

    def test_frequency_zero_for_unknown(self):
        assert kg.get_term_frequency("unknown_zzz") == 0

    def test_update_idempotent(self):
        kg.save_card_terms(30, ["Gamma"], deck_id=1)
        kg.update_term_frequencies()
        kg.update_term_frequencies()
        assert kg.get_term_frequency("Gamma") == 1


class TestEdges(_BaseKGTest):

    def test_save_and_get_edges(self):
        kg.save_edges([("Herz", "EKG", 5), ("EKG", "Infarkt", 3)])
        edges = kg.get_all_edges(min_weight=1)
        pairs = {(e["term_a"], e["term_b"]) for e in edges}
        assert ("Herz", "EKG") in pairs
        assert ("EKG", "Infarkt") in pairs

    def test_min_weight_filter(self):
        kg.save_edges([("A", "B", 2), ("C", "D", 5)])
        edges = kg.get_all_edges(min_weight=4)
        pairs = {(e["term_a"], e["term_b"]) for e in edges}
        assert ("C", "D") in pairs
        assert ("A", "B") not in pairs

    def test_get_connected_terms(self):
        kg.save_edges([("Herz", "EKG", 4), ("Herz", "Infarkt", 2)])
        connected = kg.get_connected_terms("Herz")
        assert "EKG" in connected
        assert "Infarkt" in connected

    def test_connected_terms_both_directions(self):
        kg.save_edges([("X", "Y", 1)])
        # Y→X should also be returned when querying Y
        connected = kg.get_connected_terms("Y")
        assert "X" in connected

    def test_no_connections_returns_empty(self):
        assert kg.get_connected_terms("isolated_node") == []


class TestDefinitions(_BaseKGTest):

    def test_save_and_get_definition(self):
        kg.save_definition(
            term="Myokardinfarkt",
            definition="Absterben von Herzmuskelgewebe durch Ischämie.",
            source_card_ids=[1, 2, 3],
            generated_by="gemini-flash",
        )
        result = kg.get_definition("Myokardinfarkt")
        assert result is not None
        assert result["definition"] == "Absterben von Herzmuskelgewebe durch Ischämie."
        assert result["source_count"] == 3
        assert result["generated_by"] == "gemini-flash"

    def test_get_nonexistent_definition(self):
        assert kg.get_definition("nonexistent_term_xyz") is None

    def test_save_definition_replaces(self):
        kg.save_definition("Term", "Old def", [1], "model-a")
        kg.save_definition("Term", "New def", [1, 2], "model-b")
        result = kg.get_definition("Term")
        assert result["definition"] == "New def"
        assert result["source_count"] == 2


class TestSearchTerms(_BaseKGTest):

    def test_exact_match(self):
        kg.save_card_terms(50, ["Herzinsuffizienz", "Hypertonie"], deck_id=1)
        results = kg.search_terms_exact("Herzinsuffizienz")
        assert "Herzinsuffizienz" in results

    def test_prefix_match(self):
        kg.save_card_terms(51, ["Herzinsuffizienz"], deck_id=1)
        results = kg.search_terms_exact("Herz")
        assert "Herzinsuffizienz" in results

    def test_no_match_returns_empty(self):
        results = kg.search_terms_exact("ZZZNOMATCH")
        assert results == []


class TestEmbeddings(_BaseKGTest):

    def test_save_and_get_unembedded(self):
        kg.save_card_terms(60, ["Niere", "Leber"], deck_id=1)
        kg.update_term_frequencies()
        unembedded = kg.get_unembedded_terms()
        assert "Niere" in unembedded
        assert "Leber" in unembedded

    def test_save_term_embedding(self):
        kg.save_card_terms(61, ["Milz"], deck_id=1)
        kg.update_term_frequencies()
        emb = _make_embedding()
        kg.save_term_embedding("Milz", emb)
        unembedded = kg.get_unembedded_terms()
        assert "Milz" not in unembedded

    def test_overwrite_embedding(self):
        kg.save_card_terms(62, ["Tonsille"], deck_id=1)
        kg.update_term_frequencies()
        emb1 = _make_embedding(3)
        emb2 = _make_embedding(3)
        kg.save_term_embedding("Tonsille", emb1)
        kg.save_term_embedding("Tonsille", emb2)
        row = kg._db.execute(
            "SELECT embedding FROM kg_terms WHERE term='Tonsille'"
        ).fetchone()
        assert row["embedding"] == emb2


class TestGetGraphData(_BaseKGTest):

    def test_graph_data_structure(self):
        kg.save_card_terms(70, ["NodeA", "NodeB"], deck_id=1)
        kg.update_term_frequencies()
        kg.save_edges([("NodeA", "NodeB", 3)])
        data = kg.get_graph_data()
        assert "nodes" in data
        assert "edges" in data
        node_ids = {n["id"] for n in data["nodes"]}
        assert "NodeA" in node_ids
        assert "NodeB" in node_ids

    def test_node_has_required_fields(self):
        kg.save_card_terms(71, ["TestNode"], deck_id=2)
        kg.update_term_frequencies()
        data = kg.get_graph_data()
        node = next(n for n in data["nodes"] if n["id"] == "TestNode")
        assert "label" in node
        assert "frequency" in node
        assert "deckColor" in node
        assert "deckName" in node

    def test_deck_color_is_valid_hex(self):
        kg.save_card_terms(72, ["ColorNode"], deck_id=0)
        kg.update_term_frequencies()
        data = kg.get_graph_data()
        node = next(n for n in data["nodes"] if n["id"] == "ColorNode")
        color = node["deckColor"]
        assert color.startswith("#")
        assert len(color) == 7


class TestGetGraphStatus(_BaseKGTest):

    def test_status_structure(self):
        status = kg.get_graph_status()
        assert "totalCards" in status
        assert "totalTerms" in status
        assert "lastUpdated" in status
        assert "pendingUpdates" in status

    def test_status_counts(self):
        kg.save_card_terms(80, ["T1", "T2"], deck_id=1)
        kg.save_card_terms(81, ["T3"], deck_id=1)
        kg.update_term_frequencies()
        status = kg.get_graph_status()
        assert status["totalCards"] >= 2
        assert status["totalTerms"] >= 3


class TestDeckCrossLinks(_BaseKGTest):
    """compute_deck_links / get_deck_cross_links / search_decks_by_term."""

    def test_compute_deck_links(self):
        kg.save_card_terms(100, ["Kollagen", "Prolin", "Elastin"], deck_id=1)
        kg.save_card_terms(200, ["Kollagen", "Prolin", "Glykolyse"], deck_id=2)
        kg.save_card_terms(300, ["ATP", "Glykolyse"], deck_id=3)
        kg.update_term_frequencies()
        count = kg.compute_deck_links(min_shared=2)
        assert count >= 1

    def test_get_deck_cross_links_format(self):
        kg.save_card_terms(100, ["Kollagen", "Prolin", "Elastin"], deck_id=1)
        kg.save_card_terms(200, ["Kollagen", "Prolin"], deck_id=2)
        kg.update_term_frequencies()
        kg.compute_deck_links(min_shared=2)
        links = kg.get_deck_cross_links()
        assert len(links) >= 1
        assert "source" in links[0]
        assert "target" in links[0]
        assert "weight" in links[0]
        assert links[0]["type"] == "crosslink"

    def test_search_decks_by_term(self):
        kg.save_card_terms(100, ["Kollagen"], deck_id=1)
        kg.save_card_terms(200, ["Kollagen"], deck_id=2)
        kg.save_card_terms(300, ["Glykolyse"], deck_id=3)
        deck_ids = kg.search_decks_by_term("Kollagen")
        assert set(deck_ids) == {1, 2}

    def test_search_decks_partial_match(self):
        kg.save_card_terms(100, ["Aktionspotential"], deck_id=1)
        deck_ids = kg.search_decks_by_term("Aktion")
        assert 1 in deck_ids


import unittest


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
