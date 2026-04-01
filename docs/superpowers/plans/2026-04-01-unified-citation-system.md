# Unified Citation System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace three fragmented citation rendering paths with one unified system: CitationBuilder (backend) → `[N]` markers → parseCitations (frontend) → CitationRef component. Every agent uses the same pipeline.

**Architecture:** CitationBuilder generates stable indices on the backend. Agents write `[N]` in text, return citations array. Frontend parses with one function, renders with one component (CitationRef). CardPreview popup replaces broken CardPreviewModal. Each agent gets its own RAG pipeline copy.

**Tech Stack:** Python (CitationBuilder), TypeScript (parseCitations), React (CitationRef, CardPreview), existing design system tokens.

**Spec:** `docs/superpowers/specs/2026-04-01-unified-citation-system.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `ai/citation_builder.py` | CitationBuilder class — sole mechanism for creating citations |
| `tests/test_citation_builder.py` | Unit tests for CitationBuilder |
| `frontend/src/utils/parseCitations.ts` | Single parser: text + citations[] → segments |
| `frontend/src/utils/__tests__/parseCitations.test.ts` | Tests for parseCitations |
| `shared/components/CardPreview.jsx` | Simple card preview popup (Front+Back, deckName) |
| `ai/definition.py` | Definition agent entry point (run_definition) |
| `tests/test_definition_agent.py` | Tests for definition agent |
| `ai/retrieval/tutor_retrieval.py` | Forked RAG pipeline for Tutor |
| `ai/retrieval/research_retrieval.py` | Forked RAG pipeline for Research |
| `ai/retrieval/definition_retrieval.py` | Forked RAG pipeline for Definition |
| `ai/retrieval/prufer_retrieval.py` | Forked RAG pipeline for Prufer |
| `ai/retrieval/plusi_retrieval.py` | Forked RAG pipeline for Plusi |
| `ai/retrieval/__init__.py` | Package init |

### Modified Files
| File | Change |
|------|--------|
| `ai/handler.py:463-524` | Inject CitationBuilder into agent kwargs, extract citations array |
| `ai/tutor.py:43-317` | Accept citation_builder, use it instead of dict-building |
| `ai/agents.py:336-658` | Add Definition agent registration |
| `ui/widget.py:750-874` | Replace KGDefinitionThread with _dispatch_agent('definition') |
| `frontend/src/components/ChatMessage.jsx:1542-1660` | Replace regex logic with parseCitations() |
| `frontend/src/components/SearchSidebar.jsx:25-108` | Replace ResearchMarkdown citations with parseCitations() |
| `frontend/src/components/ResearchContent.jsx:14-42` | Replace [[WEB:N]] logic with parseCitations() |
| `frontend/src/components/TermPopup.jsx:45-84` | Replace inline spans with CitationRef |
| `frontend/src/components/ReviewerView.jsx:240-350` | Wire TermPopup to new citation format |

### Deleted Files (after migration)
| File | Replaced by |
|------|-------------|
| `frontend/src/components/CitationBadge.jsx` | `shared/components/CitationRef.jsx` |
| `frontend/src/components/WebCitationBadge.jsx` | `shared/components/CitationRef.jsx` |
| `frontend/src/components/CardPreviewModal.jsx` | `shared/components/CardPreview.jsx` |

---

## Task 1: CitationBuilder (Backend)

**Files:**
- Create: `ai/citation_builder.py`
- Create: `tests/test_citation_builder.py`

- [ ] **Step 1: Write failing tests for CitationBuilder**

```python
# tests/test_citation_builder.py
import unittest
import sys
from unittest.mock import MagicMock

# Mock Anki modules
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -m pytest tests/test_citation_builder.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'ai.citation_builder'`

- [ ] **Step 3: Implement CitationBuilder**

```python
# ai/citation_builder.py
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -m pytest tests/test_citation_builder.py -v`
Expected: All 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add ai/citation_builder.py tests/test_citation_builder.py
git commit -m "feat: add CitationBuilder — unified citation creation for all agents"
```

---

## Task 2: parseCitations (Frontend)

**Files:**
- Create: `frontend/src/utils/parseCitations.ts`
- Create: `frontend/src/utils/__tests__/parseCitations.test.ts`

- [ ] **Step 1: Write failing tests for parseCitations**

```typescript
// frontend/src/utils/__tests__/parseCitations.test.ts
import { parseCitations, Citation, Segment } from '../parseCitations';

const cardCitation: Citation = {
  type: 'card', index: 1, cardId: 42, noteId: 42,
  deckName: 'Bio::Enzyme', front: 'Was ist ATP?', back: 'Adenosintriphosphat',
};
const webCitation: Citation = {
  type: 'web', index: 2, url: 'https://pubmed.ncbi.nlm.nih.gov/123',
  title: 'ATP Review', domain: 'pubmed.ncbi.nlm.nih.gov',
};

describe('parseCitations', () => {
  test('text without citations returns single text segment', () => {
    const result = parseCitations('Hello world', []);
    expect(result).toEqual([{ type: 'text', content: 'Hello world' }]);
  });

  test('single citation is parsed', () => {
    const result = parseCitations('See [1] for details.', [cardCitation]);
    expect(result).toEqual([
      { type: 'text', content: 'See ' },
      { type: 'citation', index: 1, citation: cardCitation },
      { type: 'text', content: ' for details.' },
    ]);
  });

  test('multiple citations are parsed', () => {
    const result = parseCitations('Per [1] and [2].', [cardCitation, webCitation]);
    expect(result.length).toBe(5);
    expect(result[1]).toEqual({ type: 'citation', index: 1, citation: cardCitation });
    expect(result[3]).toEqual({ type: 'citation', index: 2, citation: webCitation });
  });

  test('compound [2, 3] is expanded to [2] [3]', () => {
    const c2: Citation = { type: 'card', index: 2, cardId: 2, noteId: 2, deckName: 'D', front: 'Q2' };
    const c3: Citation = { type: 'card', index: 3, cardId: 3, noteId: 3, deckName: 'D', front: 'Q3' };
    const result = parseCitations('Result [2, 3] here.', [cardCitation, c2, c3]);
    const citationSegments = result.filter(s => s.type === 'citation');
    expect(citationSegments.length).toBe(2);
    expect(citationSegments[0].index).toBe(2);
    expect(citationSegments[1].index).toBe(3);
  });

  test('unmatched [99] renders as plain text', () => {
    const result = parseCitations('See [99] here.', [cardCitation]);
    const citations = result.filter(s => s.type === 'citation');
    expect(citations.length).toBe(0);
    const textContent = result.filter(s => s.type === 'text').map(s => s.content).join('');
    expect(textContent).toContain('[99]');
  });

  test('empty text returns empty array', () => {
    expect(parseCitations('', [])).toEqual([]);
  });

  test('adjacent citations [1][2] are both parsed', () => {
    const result = parseCitations('[1][2]', [cardCitation, webCitation]);
    const citations = result.filter(s => s.type === 'citation');
    expect(citations.length).toBe(2);
  });

  test('legacy [[CardID:42]] is normalized to [N]', () => {
    const result = parseCitations('See [[CardID:42]] here.', [cardCitation]);
    const citations = result.filter(s => s.type === 'citation');
    expect(citations.length).toBe(1);
    expect(citations[0].citation).toBe(cardCitation);
  });

  test('legacy [[WEB:1]] is normalized', () => {
    const webC: Citation = { type: 'web', index: 1, url: 'https://x.com', title: 'X', domain: 'x.com' };
    const result = parseCitations('See [[WEB:1]] here.', [webC]);
    const citations = result.filter(s => s.type === 'citation');
    expect(citations.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npx jest src/utils/__tests__/parseCitations.test.ts --no-cache`
Expected: FAIL — cannot find module `../parseCitations`

- [ ] **Step 3: Implement parseCitations**

```typescript
// frontend/src/utils/parseCitations.ts

export interface Citation {
  type: 'card' | 'web';
  index: number;
  cardId?: number;
  noteId?: number;
  deckName?: string;
  front?: string;
  back?: string;
  url?: string;
  title?: string;
  domain?: string;
  sources?: string[];
}

export type Segment =
  | { type: 'text'; content: string }
  | { type: 'citation'; index: number; citation: Citation };

/**
 * Normalize legacy marker formats to [N] before parsing.
 */
function normalizeLegacyMarkers(text: string, citations: Citation[]): string {
  // [[WEB:N]] -> [N]
  text = text.replace(/\[\[WEB:(\d+)\]\]/gi, (_, n) => `[${n}]`);

  // [[CardID:N]] or [[N]] -> look up by cardId -> [index]
  text = text.replace(/\[\[\s*(?:CardID:\s*)?(\d+)\s*\]\]/gi, (_, idStr) => {
    const cardId = parseInt(idStr, 10);
    const match = citations.find(c => c.type === 'card' && c.cardId === cardId);
    if (match) return `[${match.index}]`;
    const byIndex = citations.find(c => c.index === cardId);
    if (byIndex) return `[${byIndex.index}]`;
    return `[${idStr}]`;
  });

  return text;
}

/**
 * Expand compound citations: [2, 3] -> [2] [3]
 */
function expandCompound(text: string): string {
  return text.replace(/\[(\d+(?:\s*,\s*\d+)+)\]/g, (_, nums: string) =>
    nums.split(',').map((n: string) => `[${n.trim()}]`).join(' ')
  );
}

/**
 * Parse text with [N] citation markers into segments.
 *
 * - Citations with matching entry in array -> citation segment
 * - Citations without match -> left as plain text (never broken badges)
 * - Handles legacy formats via normalization
 */
export function parseCitations(text: string, citations: Citation[]): Segment[] {
  if (!text) return [];

  let normalized = normalizeLegacyMarkers(text, citations);
  normalized = expandCompound(normalized);

  const parts = normalized.split(/(\[\d+\])/g);
  const segments: Segment[] = [];

  for (const part of parts) {
    if (!part) continue;

    const match = part.match(/^\[(\d+)\]$/);
    if (match) {
      const index = parseInt(match[1], 10);
      const citation = citations.find(c => c.index === index);
      if (citation) {
        segments.push({ type: 'citation', index, citation });
      } else {
        segments.push({ type: 'text', content: part });
      }
    } else {
      segments.push({ type: 'text', content: part });
    }
  }

  return segments;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npx jest src/utils/__tests__/parseCitations.test.ts --no-cache`
Expected: All 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/parseCitations.ts frontend/src/utils/__tests__/parseCitations.test.ts
git commit -m "feat: add parseCitations — single parser for all citation markers"
```

---

## Task 3: CardPreview Popup

**Files:**
- Create: `shared/components/CardPreview.jsx`
- Create: `frontend/src/components/CitationPreview.jsx`

- [ ] **Step 1: Create CardPreview (design system component)**

Note: CardPreview renders sanitized Anki card HTML. The card HTML comes from Anki's own rendering pipeline which already sanitizes content. The `card-content` class applies Anki's native card styling.

```jsx
// shared/components/CardPreview.jsx
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';

/**
 * CardPreview — Simple popup showing card front + back.
 * Design system component (Anki-agnostic). No bridge, no actions.
 * Card HTML is pre-sanitized by Anki's rendering pipeline.
 */

const PANEL_W = 400;
const PANEL_MAX_H = 500;

const BACKDROP_STYLE = {
  position: 'fixed', inset: 0, zIndex: 99998,
  background: 'var(--ds-bg-scrim, rgba(0,0,0,0.3))',
};

const BREADCRUMB_STYLE = {
  fontSize: 11,
  color: 'var(--ds-text-tertiary)',
  marginBottom: 10,
  lineHeight: 1.3,
};

const FRONT_STYLE = {
  fontSize: 14,
  color: 'var(--ds-text-primary)',
  lineHeight: 1.6,
  marginBottom: 12,
};

const DIVIDER_STYLE = {
  height: 1,
  background: 'var(--ds-border-subtle)',
  margin: '0 0 12px 0',
};

const BACK_STYLE = {
  fontSize: 14,
  color: 'var(--ds-text-secondary)',
  lineHeight: 1.6,
};

export default function CardPreview({ front, back, deckName, onClose }) {
  const [animIn, setAnimIn] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setAnimIn(true));
  }, []);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const breadcrumb = deckName ? deckName.replace(/::/g, ' \u2192 ') : '';

  const panelStyle = {
    position: 'fixed', zIndex: 99999,
    top: '50%', left: '50%',
    transform: animIn
      ? 'translate(-50%, -50%) scale(1)'
      : 'translate(-50%, -50%) scale(0.96)',
    opacity: animIn ? 1 : 0,
    transition: 'opacity 0.15s ease-out, transform 0.15s ease-out',
    width: PANEL_W,
    maxHeight: PANEL_MAX_H,
    overflowY: 'auto',
    background: 'var(--ds-bg-deep)',
    border: '1px solid var(--ds-border-subtle)',
    borderRadius: 12,
    boxShadow: 'var(--ds-shadow-lg)',
    fontFamily: 'var(--ds-font-sans)',
    scrollbarWidth: 'none',
  };

  const overlay = (
    <>
      <div onClick={onClose} style={BACKDROP_STYLE} />
      <div style={panelStyle}>
        <div style={{ padding: '16px 18px' }}>
          {breadcrumb && <div style={BREADCRUMB_STYLE}>{breadcrumb}</div>}
          <div style={FRONT_STYLE}>
            <div className="card-content"
              dangerouslySetInnerHTML={{ __html: front || '' }} />
          </div>
          <div style={DIVIDER_STYLE} />
          <div style={BACK_STYLE}>
            <div className="card-content"
              dangerouslySetInnerHTML={{ __html: back || '' }} />
          </div>
        </div>
      </div>
    </>
  );

  return ReactDOM.createPortal(overlay, document.body);
}
```

- [ ] **Step 2: Create CitationPreview (product wrapper)**

```jsx
// frontend/src/components/CitationPreview.jsx
import React, { useState, useEffect } from 'react';
import CardPreview from '../../shared/components/CardPreview';

/**
 * CitationPreview — Loads card data via bridge and shows CardPreview.
 * Product component (uses bridge). Handles loading + error states.
 */
export default function CitationPreview({ cardId, onClose }) {
  const [cardData, setCardData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!cardId) return;
    setCardData(null);
    setError(false);

    const callbackId = `card_preview_${cardId}_${Date.now()}`;
    window[callbackId] = (result) => {
      delete window[callbackId];
      try {
        const data = typeof result === 'string' ? JSON.parse(result) : result;
        if (data && (data.frontHtml || data.front)) {
          setCardData(data);
        } else {
          setError(true);
        }
      } catch {
        setError(true);
      }
    };

    window.ankiBridge?.addMessage('getCardDetails', {
      cardId: String(cardId),
      callback: callbackId,
    });

    const timeout = setTimeout(() => {
      if (window[callbackId]) {
        delete window[callbackId];
        setError(true);
      }
    }, 5000);

    return () => clearTimeout(timeout);
  }, [cardId]);

  if (error) {
    onClose?.();
    return null;
  }

  if (!cardData) return null;

  return (
    <CardPreview
      front={cardData.frontHtml || cardData.front || ''}
      back={cardData.backHtml || cardData.back || ''}
      deckName={cardData.deckName || ''}
      onClose={onClose}
    />
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add shared/components/CardPreview.jsx frontend/src/components/CitationPreview.jsx
git commit -m "feat: add CardPreview popup — simple card front+back display"
```

---

## Task 4: Wire CitationBuilder into handler.py

**Files:**
- Modify: `ai/handler.py`

- [ ] **Step 1: Import CitationBuilder in handler.py**

Add after existing imports:

```python
try:
    from .citation_builder import CitationBuilder
except ImportError:
    from citation_builder import CitationBuilder
```

- [ ] **Step 2: Inject CitationBuilder into agent kwargs**

In `_dispatch_agent()`, after the model selection block (after line 493), add:

```python
        # Inject CitationBuilder — every agent gets one
        agent_kwargs['citation_builder'] = CitationBuilder()
```

- [ ] **Step 3: Extract citations as array from result**

Replace lines 522-524:

Old:
```python
        text = result.get('text', '') if isinstance(result, dict) else str(result)
        citations = result.get('citations', {}) if isinstance(result, dict) else {}
```

New:
```python
        text = result.get('text', '') if isinstance(result, dict) else str(result)
        # Support both new array format and legacy dict format
        raw_citations = result.get('citations', []) if isinstance(result, dict) else []
        if isinstance(raw_citations, dict):
            citations = list(raw_citations.values()) if raw_citations else []
        else:
            citations = raw_citations
```

- [ ] **Step 4: Run existing tests to verify no regressions**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -m pytest tests/test_agent_pipeline.py -v`
Expected: Same pass/fail as before

- [ ] **Step 5: Commit**

```bash
git add ai/handler.py
git commit -m "feat: inject CitationBuilder into all agents, support array citations"
```

---

## Task 5: Migrate Tutor to CitationBuilder

**Files:**
- Modify: `ai/tutor.py`

- [ ] **Step 1: Add CitationBuilder import**

```python
try:
    from .citation_builder import CitationBuilder
except ImportError:
    from citation_builder import CitationBuilder
```

- [ ] **Step 2: Accept citation_builder in run_tutor signature**

```python
def run_tutor(situation, emit_step=None, memory=None,
              stream_callback=None, citation_builder=None, **kwargs) -> dict:
```

Add fallback:
```python
    if citation_builder is None:
        citation_builder = CitationBuilder()
```

- [ ] **Step 3: Convert RAG citations dict to CitationBuilder calls**

After RAG returns (around line 164-166), replace `citations = rag_result.citations`:

```python
    if rag_result and rag_result.cards_found > 0:
        rag_context = rag_result.rag_context
        old_citations = rag_result.citations or {}
        for _note_id, cdata in old_citations.items():
            citation_builder.add_card(
                card_id=int(cdata.get('cardId', cdata.get('noteId', 0))),
                note_id=int(cdata.get('noteId', 0)),
                deck_name=cdata.get('deckName', ''),
                front=cdata.get('question', cdata.get('front', '')),
                back=cdata.get('answer', cdata.get('back', '')),
                sources=cdata.get('sources', []),
            )
```

- [ ] **Step 4: Update return statement**

```python
    result = {
        'text': final_text,
        'citations': citation_builder.build(),
        '_used_streaming': stream_callback is not None,
        '_handoff_marker': handoff_marker,
    }
```

- [ ] **Step 5: Run tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -m pytest tests/ -v -k "tutor or agent_pipeline" 2>&1 | tail -20`
Expected: No regressions

- [ ] **Step 6: Commit**

```bash
git add ai/tutor.py
git commit -m "feat: migrate Tutor to CitationBuilder, output citations as array"
```

---

## Task 6: Migrate ChatMessage.jsx to parseCitations

**Files:**
- Modify: `frontend/src/components/ChatMessage.jsx`

- [ ] **Step 1: Add imports**

```javascript
import { parseCitations } from '../utils/parseCitations';
import CitationRef from '../../shared/components/CitationRef';
import CitationPreview from './CitationPreview';
```

Remove:
```javascript
import CitationBadge from './CitationBadge';
```

- [ ] **Step 2: Replace citationIndices + marker replacement logic (lines 1542-1660)**

Replace with:

```javascript
  const citationsArray = useMemo(() => {
    if (!citations) return [];
    if (Array.isArray(citations)) return citations;
    return Object.entries(citations).map(([key, val], i) => ({
      type: val.url ? 'web' : 'card',
      index: val.index || (i + 1),
      cardId: val.cardId || val.noteId || parseInt(key, 10),
      noteId: val.noteId || parseInt(key, 10),
      deckName: val.deckName || '',
      front: val.question || val.front || '',
      back: val.answer || val.back || '',
      url: val.url || '',
      title: val.title || '',
      domain: val.domain || '',
      sources: val.sources || [],
    }));
  }, [citations]);
```

- [ ] **Step 3: Add preview state**

```javascript
  const [previewCardId, setPreviewCardId] = useState(null);
```

- [ ] **Step 4: Add renderTextWithCitations callback**

```javascript
  const renderTextWithCitations = useCallback((textContent) => {
    const segments = parseCitations(textContent, citationsArray);
    return segments.map((seg, i) => {
      if (seg.type === 'citation') {
        return (
          <CitationRef
            key={i}
            index={seg.citation.index}
            variant={seg.citation.type}
            onClick={() => {
              if (seg.citation.type === 'web' && seg.citation.url) {
                window.ankiBridge?.addMessage('openUrl', { url: seg.citation.url });
              } else if (seg.citation.cardId) {
                setPreviewCardId(seg.citation.cardId);
              }
            }}
            title={seg.citation.front || seg.citation.title || ''}
          />
        );
      }
      return <span key={i}>{seg.content}</span>;
    });
  }, [citationsArray]);
```

- [ ] **Step 5: Strip cleanup markers from text**

```javascript
  const processedText = useMemo(() => {
    if (!text) return '';
    let t = text;
    t = t.replace(/\[\[SCORE:[^\]]*\]\]/g, '');
    t = t.replace(/\[\[INTENT:[^\]]*\]\]/g, '');
    t = t.replace(/\[\[TOOL:\{[^\]]*\}\]\]/g, '');
    return t;
  }, [text]);
```

- [ ] **Step 6: Add CitationPreview to JSX**

```jsx
  {previewCardId && (
    <CitationPreview
      cardId={previewCardId}
      onClose={() => setPreviewCardId(null)}
    />
  )}
```

- [ ] **Step 7: Verify build**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/ChatMessage.jsx
git commit -m "feat: migrate ChatMessage to parseCitations + CitationRef"
```

---

## Task 7: Migrate SearchSidebar ResearchMarkdown

**Files:**
- Modify: `frontend/src/components/SearchSidebar.jsx`

- [ ] **Step 1: Replace imports**

Add:
```javascript
import { parseCitations } from '../utils/parseCitations';
import CitationRef from '../../shared/components/CitationRef';
import CitationPreview from './CitationPreview';
```

Remove:
```javascript
import CitationBadge from './CitationBadge';
```

- [ ] **Step 2: Replace ResearchMarkdown citation logic**

Remove `CITE_MARKER`, `CITE_RE` constants and `%%CITE:N%%` escaping logic.

Replace with:

```javascript
function ResearchMarkdown({ content, cardRefs, bridge }) {
  const citationsArray = useMemo(() => {
    if (!cardRefs) return [];
    return Object.entries(cardRefs).map(([key, ref]) => ({
      type: 'card',
      index: parseInt(key, 10),
      cardId: parseInt(ref.id || ref.noteId || key, 10),
      noteId: parseInt(ref.noteId || ref.id || key, 10),
      deckName: ref.deckName || '',
      front: ref.question || '',
    }));
  }, [cardRefs]);

  const [previewCardId, setPreviewCardId] = useState(null);

  const renderTextWithCitations = useCallback((textContent) => {
    const segments = parseCitations(textContent, citationsArray);
    return segments.map((seg, i) => {
      if (seg.type === 'citation') {
        return (
          <CitationRef
            key={i}
            index={seg.citation.index}
            variant={seg.citation.type}
            onClick={() => {
              if (seg.citation.cardId) {
                setPreviewCardId(seg.citation.cardId);
              }
            }}
            title={seg.citation.front || ''}
          />
        );
      }
      return <span key={i}>{seg.content}</span>;
    });
  }, [citationsArray]);

  // ... ReactMarkdown rendering uses renderTextWithCitations in text component
```

- [ ] **Step 3: Verify build**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/SearchSidebar.jsx
git commit -m "feat: migrate SearchSidebar to parseCitations + CitationRef"
```

---

## Task 8: Migrate ResearchContent.jsx

**Files:**
- Modify: `frontend/src/components/ResearchContent.jsx`

- [ ] **Step 1: Replace imports and [[WEB:N]] processing**

Add:
```javascript
import { parseCitations } from '../utils/parseCitations';
import CitationRef from '../../shared/components/CitationRef';
```

Remove:
```javascript
import WebCitationBadge from './WebCitationBadge';
```

Replace `processedAnswer` and `linkRenderer` with:

```javascript
  const citationsArray = useMemo(() => {
    if (!sources) return [];
    return sources.map((src, i) => ({
      type: 'web',
      index: i + 1,
      url: src.url,
      title: src.title,
      domain: src.domain,
    }));
  }, [sources]);
```

Use same `renderTextWithCitations` pattern with `parseCitations` as in previous tasks.

- [ ] **Step 2: Verify build**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ResearchContent.jsx
git commit -m "feat: migrate ResearchContent to parseCitations + CitationRef"
```

---

## Task 9: Migrate TermPopup.jsx

**Files:**
- Modify: `frontend/src/components/TermPopup.jsx`

- [ ] **Step 1: Replace imports**

Add:
```javascript
import { parseCitations } from '../utils/parseCitations';
import CitationRef from '../../shared/components/CitationRef';
import CitationPreview from './CitationPreview';
```

- [ ] **Step 2: Replace renderDef callback (lines 53-84)**

```javascript
  const citationsArray = useMemo(() => {
    if (!cardRefs) return [];
    if (Array.isArray(cardRefs)) return cardRefs;
    return Object.entries(cardRefs).map(([key, ref]) => ({
      type: 'card',
      index: parseInt(key, 10),
      cardId: parseInt(ref.id || key, 10),
      noteId: parseInt(ref.id || key, 10),
      front: ref.question || '',
    }));
  }, [cardRefs]);

  const [previewCardId, setPreviewCardId] = useState(null);

  const renderDef = useCallback(() => {
    if (!cleanDef) return null;
    const segments = parseCitations(cleanDef, citationsArray);
    return segments.map((seg, i) => {
      if (seg.type === 'citation') {
        return (
          <CitationRef
            key={i}
            index={seg.citation.index}
            variant="card"
            onClick={() => {
              if (seg.citation.cardId) setPreviewCardId(seg.citation.cardId);
            }}
            title={seg.citation.front || `Karte ${seg.citation.index}`}
          />
        );
      }
      if (!seg.content.trim()) return null;
      return (
        <ReactMarkdown key={i}
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{
            p: ({ children }) => <>{children}</>,
            strong: ({ children }) => (
              <strong style={{ color: 'var(--ds-text-primary)', fontWeight: 600 }}>
                {children}
              </strong>
            ),
          }}
        >{seg.content}</ReactMarkdown>
      );
    });
  }, [cleanDef, citationsArray]);
```

- [ ] **Step 3: Add CitationPreview to JSX**

After the panel body, before the portal close:

```jsx
  {previewCardId && (
    <CitationPreview
      cardId={previewCardId}
      onClose={() => setPreviewCardId(null)}
    />
  )}
```

- [ ] **Step 4: Verify build**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/TermPopup.jsx
git commit -m "feat: migrate TermPopup to parseCitations + CitationRef"
```

---

## Task 10: Delete old citation components

**Files:**
- Delete: `frontend/src/components/CitationBadge.jsx`
- Delete: `frontend/src/components/WebCitationBadge.jsx`
- Delete: `frontend/src/components/CardPreviewModal.jsx`

- [ ] **Step 1: Search for remaining imports**

Run: `grep -rn "CitationBadge\|WebCitationBadge\|CardPreviewModal" frontend/src/ --include="*.jsx" --include="*.tsx" --include="*.js" --include="*.ts" | grep -v node_modules`

Fix any remaining imports.

- [ ] **Step 2: Delete old files**

```bash
rm frontend/src/components/CitationBadge.jsx
rm frontend/src/components/WebCitationBadge.jsx
rm frontend/src/components/CardPreviewModal.jsx
```

- [ ] **Step 3: Verify build**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add -A frontend/src/components/CitationBadge.jsx frontend/src/components/WebCitationBadge.jsx frontend/src/components/CardPreviewModal.jsx
git commit -m "chore: delete old citation components — replaced by CitationRef + CardPreview"
```

---

## Task 11: Register Definition Agent

**Files:**
- Create: `ai/definition.py`
- Create: `tests/test_definition_agent.py`
- Modify: `ai/agents.py`

- [ ] **Step 1: Write test**

```python
# tests/test_definition_agent.py
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
```

- [ ] **Step 2: Create ai/definition.py**

```python
# ai/definition.py
"""
Definition Agent — generates term definitions from card content.

Registered as full agent in agents.py. Dispatched via handler._dispatch_agent().
Uses KG store for caching and embedding search for card retrieval.
"""

try:
    from ..utils.logging import get_logger
    from ..citation_builder import CitationBuilder
except ImportError:
    from utils.logging import get_logger
    from citation_builder import CitationBuilder

logger = get_logger(__name__)


def run_definition(situation, emit_step=None, memory=None,
                   stream_callback=None, citation_builder=None, **kwargs):
    """
    Generate a definition for a term using card content + optional web.

    Returns dict with 'text' (definition with [N] refs) and 'citations' (array).
    """
    if citation_builder is None:
        citation_builder = CitationBuilder()

    term = situation.strip()
    if not term:
        return {'text': '', 'citations': []}

    try:
        from ..storage.kg_store import (get_definition, get_term_card_ids,
                                         save_definition, get_connected_terms)
    except ImportError:
        from storage.kg_store import (get_definition, get_term_card_ids,
                                       save_definition, get_connected_terms)

    # Check cache
    cached = get_definition(term)
    if cached and cached.get('definition'):
        connected = get_connected_terms(term)
        card_refs = cached.get('cardRefs', {})
        for key, ref in card_refs.items():
            citation_builder.add_card(
                card_id=int(ref.get('id', 0)),
                note_id=int(ref.get('id', 0)),
                deck_name='',
                front=ref.get('question', '')[:200],
            )
        return {
            'text': cached['definition'],
            'citations': citation_builder.build(),
            'connectedTerms': connected,
            'sourceCount': cached.get('sourceCount', 0),
            'generatedBy': cached.get('generatedBy', 'cache'),
        }

    # Embedding search for relevant cards
    embedding_manager = kwargs.get('embedding_manager')
    if not embedding_manager:
        return {'text': '', 'citations': [], 'error': 'Embedding-Manager nicht verfuegbar'}

    query = "Was ist %s? Definition" % term
    query_emb = embedding_manager.embed_texts([query])
    if not query_emb:
        return {'text': '', 'citations': [], 'error': 'Embedding fehlgeschlagen'}

    card_ids_set = set(get_term_card_ids(term))
    all_results = embedding_manager.search(query_emb[0], top_k=50)
    top_cards = [(cid, score) for cid, score in all_results if cid in card_ids_set][:8]

    if len(top_cards) < 2:
        connected = get_connected_terms(term)
        return {'text': '', 'citations': [], 'error': 'Nicht genug Quellen',
                'connectedTerms': connected}

    # Fetch card texts (must be on main thread)
    import threading
    try:
        from ..utils.anki import run_on_main_thread
    except ImportError:
        from utils.anki import run_on_main_thread

    card_texts = []
    event = threading.Event()

    def _fetch_texts():
        try:
            from aqt import mw
            for cid, _ in top_cards:
                try:
                    card = mw.col.get_card(cid)
                    note = card.note()
                    fields = note.fields
                    card_texts.append({
                        'question': fields[0] if fields else '',
                        'answer': fields[1] if len(fields) > 1 else '',
                    })
                except Exception:
                    pass
        finally:
            event.set()

    run_on_main_thread(_fetch_texts)
    event.wait(timeout=10)

    # Generate definition via Gemini
    try:
        from ..ai.gemini import generate_definition
    except ImportError:
        from ai.gemini import generate_definition

    search_query = kwargs.get('search_query')
    definition = generate_definition(term, card_texts, search_query=search_query)

    # Build citations via CitationBuilder
    source_ids = [cid for cid, _ in top_cards]
    for i, (cid, _) in enumerate(top_cards):
        q = card_texts[i].get('question', '') if i < len(card_texts) else ''
        citation_builder.add_card(card_id=cid, note_id=cid, deck_name='', front=q)

    # Cache result
    card_refs = {}
    for i, (cid, _) in enumerate(top_cards):
        q = card_texts[i].get('question', '') if i < len(card_texts) else ''
        card_refs[str(i + 1)] = {'id': str(cid), 'question': q[:60]}
    save_definition(term, definition, source_ids, 'llm')

    connected = get_connected_terms(term)
    return {
        'text': definition,
        'citations': citation_builder.build(),
        'connectedTerms': connected,
        'sourceCount': len(source_ids),
        'generatedBy': 'llm',
    }
```

- [ ] **Step 3: Register in agents.py**

Add after existing registrations (after line ~578):

```python
register_agent(AgentDefinition(
    name='definition',
    label='Definition',
    description='Generiert Definitionen fuer Fachbegriffe aus Karteninhalt',
    color='#8E8E93',
    icon_type='none',
    channel='reviewer-term',
    uses_rag=False,
    run_module='ai.definition',
    run_function='run_definition',
    tools=[],
    context_sources=['card', 'memory'],
    is_default=False,
    enabled_key='definition_enabled',
    premium_model='gemini-2.5-flash',
    fast_model='gemini-2.5-flash',
    fallback_model='gemini-2.5-flash',
))
```

- [ ] **Step 4: Run tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -m pytest tests/test_definition_agent.py tests/test_citation_builder.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add ai/definition.py ai/agents.py tests/test_definition_agent.py
git commit -m "feat: register Definition as full agent with CitationBuilder"
```

---

## Task 12: Wire Definition Agent dispatch

**Files:**
- Modify: `ui/widget.py`
- Modify: `frontend/src/components/ReviewerView.jsx`

- [ ] **Step 1: Replace _start_kg_definition in widget.py**

Replace the method (around line 3758) with:

```python
    def _start_kg_definition(self, term, search_query=None):
        """Launch definition agent via standard dispatch."""
        if not self._handler:
            logger.warning("No AI handler for definition agent")
            return

        try:
            from .agents import get_agent
        except ImportError:
            from agents import get_agent

        agent_def = get_agent('definition')
        if not agent_def:
            logger.warning("Definition agent not registered")
            return

        import importlib
        mod = importlib.import_module(agent_def.run_module, package='AnkiPlus_main')
        run_fn = getattr(mod, agent_def.run_function)

        def _on_finished(widget, agent_name, result):
            try:
                data = {
                    'term': term,
                    'definition': result.get('text', ''),
                    'sourceCount': result.get('sourceCount', 0),
                    'generatedBy': result.get('generatedBy', 'llm'),
                    'connectedTerms': result.get('connectedTerms', []),
                    'citations': result.get('citations', []),
                }
                if result.get('error'):
                    data['error'] = result['error']
                widget._send_to_js({'type': 'graph.termDefinition', 'data': data})
            except Exception:
                logger.exception("Failed to send definition result")

        self._handler._dispatch_agent(
            agent_name='definition',
            run_fn=run_fn,
            situation=term,
            request_id='definition_%s' % id(self),
            on_finished=_on_finished,
            extra_kwargs={'search_query': search_query},
            agent_def=agent_def,
        )
```

- [ ] **Step 2: Mark KGDefinitionThread as deprecated**

Add comment before class:
```python
# DEPRECATED: Replaced by Definition agent dispatch. Kept for reference.
class KGDefinitionThread(QThread):
```

- [ ] **Step 3: Update ReviewerView TermPopup props**

In `ReviewerView.jsx`, update TermPopup to pass citations array (backward-compatible):

```jsx
    cardRefs={kgDefinition?.citations || kgDefinition?.cardRefs || null}
```

- [ ] **Step 4: Verify build**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add ui/widget.py frontend/src/components/ReviewerView.jsx
git commit -m "feat: wire Definition agent dispatch, replace KGDefinitionThread"
```

---

## Task 13: Fork RAG Pipelines per Agent

**Files:**
- Create: `ai/retrieval/__init__.py`
- Create: `ai/retrieval/tutor_retrieval.py` (copy of rag_pipeline.py)
- Create: `ai/retrieval/research_retrieval.py` (copy)
- Create: `ai/retrieval/definition_retrieval.py` (copy)
- Create: `ai/retrieval/prufer_retrieval.py` (copy)
- Create: `ai/retrieval/plusi_retrieval.py` (copy)
- Modify: `ai/tutor.py` (import from new path)

- [ ] **Step 1: Create retrieval package**

```bash
mkdir -p ai/retrieval
```

```python
# ai/retrieval/__init__.py
"""Agent-specific RAG retrieval pipelines.
Each agent has its own copy. All start identical — diverge independently."""
```

- [ ] **Step 2: Copy current pipeline as tutor_retrieval.py**

```bash
cp ai/rag_pipeline.py ai/retrieval/tutor_retrieval.py
```

Add header comment:
```python
# Tutor-specific RAG retrieval pipeline.
# Forked from ai/rag_pipeline.py on 2026-04-01.
# Modify independently for Tutor-specific retrieval needs.
```

Fix imports: the copy lives one level deeper, so relative imports need adjustment. Change:
- `from ..utils.logging` stays the same (still correct relative to ai/)
- `from .retrieval import ...` becomes `from ..retrieval import ...`
- `from .rag import ...` becomes `from ..rag import ...`
- `from .rrf import ...` becomes `from ..rrf import ...`
- `from .embeddings import ...` becomes `from ..embeddings import ...`

- [ ] **Step 3: Create remaining copies**

```bash
cp ai/retrieval/tutor_retrieval.py ai/retrieval/research_retrieval.py
cp ai/retrieval/tutor_retrieval.py ai/retrieval/definition_retrieval.py
cp ai/retrieval/tutor_retrieval.py ai/retrieval/prufer_retrieval.py
cp ai/retrieval/tutor_retrieval.py ai/retrieval/plusi_retrieval.py
```

Update header comments in each to match agent name.

- [ ] **Step 4: Wire tutor.py to use tutor_retrieval**

In `ai/tutor.py`, change:

```python
try:
    from .retrieval.tutor_retrieval import retrieve_rag_context
except ImportError:
    from retrieval.tutor_retrieval import retrieve_rag_context
```

- [ ] **Step 5: Verify RAG tests still pass**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -m pytest tests/ -v -k "retrieval or rag" 2>&1 | tail -20`
Expected: Same results — original files untouched

- [ ] **Step 6: Commit**

```bash
git add ai/retrieval/ ai/tutor.py
git commit -m "feat: fork RAG pipeline per agent — 5 independent copies"
```

---

## Task 14: Integration verification

**Files:** None (verification only)

- [ ] **Step 1: Run all Python tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py 2>&1 | tail -10`
Expected: 772+ passed, no new failures

- [ ] **Step 2: Build frontend**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 3: Verify no old imports remain**

Run: `grep -rn "CitationBadge\|WebCitationBadge\|CardPreviewModal" frontend/src/ --include="*.jsx" --include="*.tsx" --include="*.js" --include="*.ts" | grep -v node_modules | grep -v __tests__`
Expected: No matches

- [ ] **Step 4: Verify CitationRef is used everywhere**

Run: `grep -rn "CitationRef\|parseCitations" frontend/src/ --include="*.jsx" --include="*.tsx" --include="*.js" --include="*.ts" | grep -v node_modules | grep -v __tests__ | head -20`
Expected: CitationRef in ChatMessage, SearchSidebar, ResearchContent, TermPopup

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: unified citation system — integration verification pass"
```
