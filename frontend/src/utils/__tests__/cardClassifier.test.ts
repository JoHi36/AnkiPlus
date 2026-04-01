import { describe, it, expect } from 'vitest';
import { classifyCard } from '../cardClassifier';

// ---------------------------------------------------------------------------
// cardType detection
// ---------------------------------------------------------------------------
describe('classifyCard — cardType', () => {
  it('returns basic for empty strings', () => {
    expect(classifyCard('', '').cardType).toBe('basic');
  });

  it('returns basic for null/undefined inputs', () => {
    expect(classifyCard(null as any, null as any).cardType).toBe('basic');
    expect(classifyCard(undefined as any, undefined as any).cardType).toBe('basic');
  });

  it('returns basic for plain text card', () => {
    expect(classifyCard('What is mitosis?', 'Cell division').cardType).toBe('basic');
  });

  it('detects image-occlusion from io-header class', () => {
    const front = '<div class="io-header">Question</div>';
    expect(classifyCard(front, '').cardType).toBe('image-occlusion');
  });

  it('detects image-occlusion from io-table class', () => {
    expect(classifyCard('<div class="io-table"></div>', '').cardType).toBe('image-occlusion');
  });

  it('detects image-occlusion from io-revl class', () => {
    expect(classifyCard('', '<div class="io-revl"></div>').cardType).toBe('image-occlusion');
  });

  it('detects type-in from input#typeans', () => {
    const front = 'Spell the word: <input id="typeans" />';
    expect(classifyCard(front, '').cardType).toBe('type-in');
  });

  it('detects type-in from id="typeans"', () => {
    expect(classifyCard('<input id="typeans">', '').cardType).toBe('type-in');
  });

  it('detects cloze from class="cloze"', () => {
    const front = 'The {{c1::heart}} pumps <span class="cloze">blood</span>';
    expect(classifyCard(front, '').cardType).toBe('cloze');
  });

  it('detects cloze from [...] pattern', () => {
    expect(classifyCard('The [...] is the largest organ', '').cardType).toBe('cloze');
  });

  it('image-occlusion takes priority over cloze', () => {
    const html = '<div class="io-header"><span class="cloze">X</span></div>';
    expect(classifyCard(html, '').cardType).toBe('image-occlusion');
  });
});

// ---------------------------------------------------------------------------
// boolean feature flags
// ---------------------------------------------------------------------------
describe('classifyCard — hasImages', () => {
  it('is false when no img tag', () => {
    expect(classifyCard('Text only', '').hasImages).toBe(false);
  });

  it('is true when front contains <img', () => {
    expect(classifyCard('<img src="x.png">', '').hasImages).toBe(true);
  });

  it('is true when back contains <img', () => {
    expect(classifyCard('', '<img src="y.png">').hasImages).toBe(true);
  });
});

describe('classifyCard — hasTables', () => {
  it('is false when no table tag', () => {
    expect(classifyCard('No table here', '').hasTables).toBe(false);
  });

  it('is true when front contains <table', () => {
    expect(classifyCard('<table><tr><td>cell</td></tr></table>', '').hasTables).toBe(true);
  });
});

describe('classifyCard — hasCode', () => {
  it('is false when no code or pre tag', () => {
    expect(classifyCard('Plain text', '').hasCode).toBe(false);
  });

  it('is true when card has <pre tag', () => {
    expect(classifyCard('<pre>code block</pre>', '').hasCode).toBe(true);
  });

  it('is true when card has <code tag', () => {
    expect(classifyCard('', '<code>snippet</code>').hasCode).toBe(true);
  });
});

describe('classifyCard — hasAudio', () => {
  it('is false when no audio marker', () => {
    expect(classifyCard('Text', '').hasAudio).toBe(false);
  });

  it('is true when [sound:...] is present', () => {
    expect(classifyCard('[sound:audio.mp3]', '').hasAudio).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// contentLength
// ---------------------------------------------------------------------------
describe('classifyCard — contentLength', () => {
  it('is short for empty content', () => {
    expect(classifyCard('', '').contentLength).toBe('short');
  });

  it('is short for text under 100 chars', () => {
    expect(classifyCard('Short', 'Answer').contentLength).toBe('short');
  });

  it('is medium for 100–499 char text', () => {
    const text = 'a'.repeat(200);
    expect(classifyCard(text, '').contentLength).toBe('medium');
  });

  it('is long for 500+ char text', () => {
    const text = 'b'.repeat(600);
    expect(classifyCard(text, '').contentLength).toBe('long');
  });
});

// ---------------------------------------------------------------------------
// deckFamily detection
// ---------------------------------------------------------------------------
describe('classifyCard — deckFamily', () => {
  it('is null for generic card', () => {
    expect(classifyCard('What is DNA?', '').deckFamily).toBeNull();
  });

  it('detects amboss from "amboss" keyword', () => {
    expect(classifyCard('<div class="amboss-link">...</div>', '').deckFamily).toBe('amboss');
  });

  it('detects amboss from AnkiHub keyword', () => {
    expect(classifyCard('AnkiHub source card', '').deckFamily).toBe('amboss');
  });

  it('detects anking from AnKingMed keyword', () => {
    expect(classifyCard('AnKingMed deck card', '').deckFamily).toBe('anking');
  });

  it('detects anking from AnKing keyword', () => {
    expect(classifyCard('Made by AnKing', '').deckFamily).toBe('anking');
  });
});

// ---------------------------------------------------------------------------
// cloze counting and ID extraction
// ---------------------------------------------------------------------------
describe('classifyCard — clozeCount', () => {
  it('is 0 for non-cloze card', () => {
    expect(classifyCard('Basic question', 'Basic answer').clozeCount).toBe(0);
  });

  it('counts single cloze', () => {
    const front = '<span class="cloze">term</span>';
    expect(classifyCard(front, '').clozeCount).toBe(1);
  });

  it('counts multiple clozes', () => {
    const front = '<span class="cloze">a</span> and <span class="cloze">b</span>';
    expect(classifyCard(front, '').clozeCount).toBe(2);
  });
});

describe('classifyCard — clozeIds', () => {
  it('is empty array for non-cloze card', () => {
    expect(classifyCard('Basic', '').clozeIds).toEqual([]);
  });

  it('extracts cloze IDs from data-cloze attributes', () => {
    const front = '<span data-cloze="1">a</span><span data-cloze="2">b</span>';
    const ids = classifyCard(front, '').clozeIds;
    expect(ids).toContain('1');
    expect(ids).toContain('2');
  });

  it('deduplicates cloze IDs', () => {
    const front = '<span data-cloze="1">a</span><span data-cloze="1">b</span>';
    const ids = classifyCard(front, '').clozeIds;
    expect(ids.filter(id => id === '1')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// hasColorCoding
// ---------------------------------------------------------------------------
describe('classifyCard — hasColorCoding', () => {
  it('is false for plain text card', () => {
    expect(classifyCard('No styles', '').hasColorCoding).toBe(false);
  });

  it('is false for card with only black/white colors', () => {
    const front = '<p style="color: black; background: white;">text</p>';
    expect(classifyCard(front, '').hasColorCoding).toBe(false);
  });

  it('is true when more than 2 distinct non-trivial colors are present', () => {
    // Note: The exclusion pattern /^#000/i also excludes colors like #0000ff (blue),
    // so we use hex values that don't start with #000 or #fff.
    const front = [
      '<p style="color: #ff0000;">red</p>',
      '<p style="color: #00ff00;">green</p>',
      '<p style="color: #1a2b3c;">navy</p>',
    ].join('');
    expect(classifyCard(front, '').hasColorCoding).toBe(true);
  });

  it('is false when exactly 2 distinct non-trivial colors are present', () => {
    const front = [
      '<p style="color: #ff0000;">red</p>',
      '<p style="color: #00ff00;">green</p>',
    ].join('');
    expect(classifyCard(front, '').hasColorCoding).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// return shape completeness
// ---------------------------------------------------------------------------
describe('classifyCard — return shape', () => {
  it('always returns all expected keys', () => {
    const result = classifyCard('', '');
    const expectedKeys = [
      'cardType',
      'hasImages',
      'hasTables',
      'hasCode',
      'hasAudio',
      'hasColorCoding',
      'contentLength',
      'deckFamily',
      'clozeCount',
      'clozeIds',
    ];
    for (const key of expectedKeys) {
      expect(result).toHaveProperty(key);
    }
  });
});
