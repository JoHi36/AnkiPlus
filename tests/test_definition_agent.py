import unittest
import sys
from unittest.mock import MagicMock

for mod in ['aqt', 'aqt.qt', 'aqt.utils', 'anki', 'anki.collection',
            'anki.notes', 'anki.cards', 'anki.decks', 'anki.models',
            'PyQt6', 'PyQt6.QtCore', 'PyQt6.QtWidgets', 'PyQt6.QtWebEngineWidgets',
            'PyQt6.QtWebChannel']:
    sys.modules.setdefault(mod, MagicMock())

from ai.citation_builder import CitationBuilder


class TestDefinitionAgent(unittest.TestCase):
    def test_citation_builder_used_for_card_refs(self):
        builder = CitationBuilder()
        idx1 = builder.add_card(card_id=10, note_id=10, deck_name='Bio',
                                front='Was ist ATP?', back='Adenosintriphosphat')
        idx2 = builder.add_card(card_id=20, note_id=20, deck_name='Bio',
                                front='ATP Funktion', back='Energiewaehrung')
        self.assertEqual(idx1, 1)
        self.assertEqual(idx2, 2)
        result = builder.build()
        self.assertEqual(len(result), 2)
        self.assertTrue(all(c['type'] == 'card' for c in result))

    def test_empty_term_returns_empty(self):
        from ai.definition import run_definition
        result = run_definition('', citation_builder=CitationBuilder())
        self.assertEqual(result['text'], '')
        self.assertEqual(result['citations'], [])

if __name__ == '__main__':
    unittest.main()
