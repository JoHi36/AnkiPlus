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

function normalizeLegacyMarkers(text: string, citations: Citation[]): string {
  text = text.replace(/\[\[WEB:(\d+)\]\]/gi, (_, n) => `[${n}]`);
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

function expandCompound(text: string): string {
  return text.replace(/\[(\d+(?:\s*,\s*\d+)+)\]/g, (_, nums: string) =>
    nums.split(',').map((n: string) => `[${n.trim()}]`).join(' ')
  );
}

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
