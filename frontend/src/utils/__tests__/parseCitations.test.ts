import { describe, test, expect } from 'vitest';
import { parseCitations, Citation } from '../parseCitations';

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
    expect((citationSegments[0] as { type: 'citation'; index: number; citation: Citation }).index).toBe(2);
    expect((citationSegments[1] as { type: 'citation'; index: number; citation: Citation }).index).toBe(3);
  });

  test('unmatched [99] renders as plain text', () => {
    const result = parseCitations('See [99] here.', [cardCitation]);
    const citations = result.filter(s => s.type === 'citation');
    expect(citations.length).toBe(0);
    const textContent = result.filter(s => s.type === 'text').map(s => (s as { type: 'text'; content: string }).content).join('');
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
    expect((citations[0] as { type: 'citation'; index: number; citation: Citation }).citation).toBe(cardCitation);
  });

  test('legacy [[WEB:1]] is normalized', () => {
    const webC: Citation = { type: 'web', index: 1, url: 'https://x.com', title: 'X', domain: 'x.com' };
    const result = parseCitations('See [[WEB:1]] here.', [webC]);
    const citations = result.filter(s => s.type === 'citation');
    expect(citations.length).toBe(1);
  });
});
