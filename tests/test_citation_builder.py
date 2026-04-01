import unittest
import sys
from unittest.mock import MagicMock

for mod in ['aqt', 'aqt.qt', 'aqt.utils', 'anki', 'anki.collection',
            'anki.notes', 'anki.cards', 'anki.decks', 'anki.models',
            'PyQt6', 'PyQt6.QtCore', 'PyQt6.QtWidgets', 'PyQt6.QtWebEngineWidgets',
            'PyQt6.QtWebChannel']:
    sys.modules.setdefault(mod, MagicMock())

from ai.citation_builder import CitationBuilder


class TestCitationBuilder(unittest.TestCase):
    def test_add_card_returns_index_starting_at_1(self):
        b = CitationBuilder()
        idx = b.add_card(card_id=42, note_id=42, deck_name='Bio::Enzyme',
                         front='Was ist ATP?', back='Adenosintriphosphat')
        self.assertEqual(idx, 1)

    def test_add_web_returns_next_index(self):
        b = CitationBuilder()
        b.add_card(card_id=1, note_id=1, deck_name='D', front='Q')
        idx = b.add_web(url='https://example.com', title='Example', domain='example.com')
        self.assertEqual(idx, 2)

    def test_build_returns_list_with_correct_types(self):
        b = CitationBuilder()
        b.add_card(card_id=10, note_id=10, deck_name='Deck', front='Front', back='Back')
        b.add_web(url='https://x.com', title='X', domain='x.com')
        result = b.build()
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]['type'], 'card')
        self.assertEqual(result[0]['index'], 1)
        self.assertEqual(result[0]['cardId'], 10)
        self.assertEqual(result[1]['type'], 'web')
        self.assertEqual(result[1]['index'], 2)
        self.assertEqual(result[1]['url'], 'https://x.com')

    def test_front_truncated_to_200_chars(self):
        b = CitationBuilder()
        b.add_card(card_id=1, note_id=1, deck_name='D', front='A' * 300)
        result = b.build()
        self.assertEqual(len(result[0]['front']), 200)

    def test_build_returns_copy(self):
        b = CitationBuilder()
        b.add_card(card_id=1, note_id=1, deck_name='D', front='Q')
        r1 = b.build()
        r2 = b.build()
        self.assertEqual(r1, r2)
        self.assertIsNot(r1, r2)

    def test_empty_builder_returns_empty_list(self):
        b = CitationBuilder()
        self.assertEqual(b.build(), [])

    def test_sources_default_to_empty_list(self):
        b = CitationBuilder()
        b.add_card(card_id=1, note_id=1, deck_name='D', front='Q')
        self.assertEqual(b.build()[0]['sources'], [])

    def test_sources_passed_through(self):
        b = CitationBuilder()
        b.add_card(card_id=1, note_id=1, deck_name='D', front='Q',
                   sources=['keyword', 'semantic'])
        self.assertEqual(b.build()[0]['sources'], ['keyword', 'semantic'])

    def test_mixed_card_web_numbering(self):
        b = CitationBuilder()
        self.assertEqual(b.add_card(card_id=1, note_id=1, deck_name='D', front='Q1'), 1)
        self.assertEqual(b.add_web(url='https://a.com', title='A', domain='a.com'), 2)
        self.assertEqual(b.add_card(card_id=2, note_id=2, deck_name='D', front='Q2'), 3)
        self.assertEqual(b.add_web(url='https://b.com', title='B', domain='b.com'), 4)

if __name__ == '__main__':
    unittest.main()
