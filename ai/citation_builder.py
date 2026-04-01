"""
CitationBuilder — sole mechanism for creating citations in agent responses.

Every agent receives a CitationBuilder instance. Call add_card() or add_web()
to register a citation and get back the [N] index to use in text.
"""

from typing import List, Optional


class CitationBuilder:
    """Builds a citations array with automatic sequential numbering."""

    def __init__(self):
        self._citations: List[dict] = []

    def add_card(
        self,
        card_id: int,
        note_id: int,
        deck_name: str,
        front: str,
        back: str = '',
        sources: Optional[List[str]] = None,
    ) -> int:
        """Add a card citation. Returns 1-based index for [N] in text."""
        index = len(self._citations) + 1
        self._citations.append({
            'type': 'card',
            'index': index,
            'cardId': card_id,
            'noteId': note_id,
            'deckName': deck_name,
            'front': front[:200],
            'back': back[:200] if back else '',
            'sources': sources or [],
        })
        return index

    def add_web(self, url: str, title: str, domain: str) -> int:
        """Add a web citation. Returns 1-based index for [N] in text."""
        index = len(self._citations) + 1
        self._citations.append({
            'type': 'web',
            'index': index,
            'url': url,
            'title': title,
            'domain': domain,
        })
        return index

    def build(self) -> List[dict]:
        """Return a copy of the citations array."""
        return list(self._citations)
