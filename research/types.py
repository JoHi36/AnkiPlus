"""Research Agent data types."""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Source:
    title: str
    url: str
    domain: str
    favicon_letter: str
    snippet: str = ''


@dataclass
class ResearchResult:
    sources: list[Source] = field(default_factory=list)
    answer: str = ''
    query: str = ''
    tool_used: str = ''
    error: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            'sources': [
                {'title': s.title, 'url': s.url, 'domain': s.domain,
                 'favicon_letter': s.favicon_letter, 'snippet': s.snippet}
                for s in self.sources
            ],
            'answer': self.answer,
            'query': self.query,
            'tool_used': self.tool_used,
            'error': self.error,
        }
