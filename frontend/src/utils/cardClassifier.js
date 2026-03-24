/**
 * cardClassifier.js
 *
 * Analyzes card HTML and returns structured metadata.
 * Used by the EventBus so agents (Tutor, MC Generator) can subscribe
 * and receive card context.
 */

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Detects the card type from HTML content.
 * @param {string} html
 * @returns {'cloze' | 'image-occlusion' | 'type-in' | 'basic'}
 */
function detectCardType(html) {
  if (!html) return 'basic';

  if (html.includes('io-header') || html.includes('io-table') || html.includes('io-revl')) {
    return 'image-occlusion';
  }

  if (html.includes('input#typeans') || html.includes('id="typeans"') || html.includes("id='typeans'")) {
    return 'type-in';
  }

  if (html.includes('class="cloze"') || html.includes("class='cloze'") || /\[\.\.\.]/i.test(html)) {
    return 'cloze';
  }

  return 'basic';
}

/**
 * Detects the deck family from HTML content.
 * @param {string} html
 * @returns {'amboss' | 'anking' | null}
 */
function detectDeckFamily(html) {
  if (!html) return null;

  if (html.includes('amboss') || html.includes('AnkiHub')) {
    return 'amboss';
  }

  if (html.includes('AnKingMed') || html.includes('AnKing')) {
    return 'anking';
  }

  return null;
}

// Colors to exclude when counting unique color values
const EXCLUDED_COLOR_PATTERNS = [
  /^black$/i,
  /^white$/i,
  /^inherit$/i,
  /^currentcolor$/i,
  /^transparent$/i,
  /^initial$/i,
  /^unset$/i,
  /^var\(/i,
  /^#000/i,
  /^#fff/i,
  /^rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)/i,
  /^rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)/i,
  /^rgba\(\s*0\s*,\s*0\s*,\s*0\s*,/i,
  /^rgba\(\s*255\s*,\s*255\s*,\s*255\s*,/i,
];

function isExcludedColor(color) {
  const trimmed = color.trim();
  return EXCLUDED_COLOR_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Counts unique non-black/white colors found in style attributes.
 * Returns true if more than 2 such colors are found.
 * @param {string} html
 * @returns {boolean}
 */
function detectColorCoding(html) {
  if (!html) return false;

  const uniqueColors = new Set();

  // Match style="..." attribute values
  const styleAttrRegex = /style\s*=\s*["']([^"']+)["']/gi;
  let styleMatch;

  while ((styleMatch = styleAttrRegex.exec(html)) !== null) {
    const styleValue = styleMatch[1];

    // Extract color-related CSS properties: color, background, background-color, border-color, etc.
    const colorPropRegex =
      /(?:^|;)\s*(?:color|background(?:-color)?|border(?:-color)?|outline(?:-color)?)\s*:\s*([^;]+)/gi;
    let propMatch;

    while ((propMatch = colorPropRegex.exec(styleValue)) !== null) {
      const colorValue = propMatch[1].trim();
      if (colorValue && !isExcludedColor(colorValue)) {
        uniqueColors.add(colorValue.toLowerCase());
      }
    }
  }

  return uniqueColors.size > 2;
}

/**
 * Categorizes text length after stripping HTML tags.
 * @param {string} html
 * @returns {'short' | 'medium' | 'long'}
 */
function categorizeLength(html) {
  if (!html) return 'short';

  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const length = text.length;

  if (length < 100) return 'short';
  if (length < 500) return 'medium';
  return 'long';
}

/**
 * Counts the number of cloze deletions (occurrences of class="cloze").
 * @param {string} html
 * @returns {number}
 */
function countClozes(html) {
  if (!html) return 0;

  let count = 0;
  const regex = /class\s*=\s*["'][^"']*cloze[^"']*["']/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    count++;
  }

  return count;
}

/**
 * Extracts unique cloze IDs from data-cloze attributes.
 * @param {string} html
 * @returns {string[]}
 */
function extractClozeIds(html) {
  if (!html) return [];

  const ids = new Set();
  const regex = /data-cloze\s*=\s*["'](\d+)["']/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    ids.add(match[1]);
  }

  return Array.from(ids);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classifies a card by analyzing its front and back HTML.
 *
 * @param {string|null|undefined} frontHtml
 * @param {string|null|undefined} backHtml
 * @returns {{
 *   cardType: 'cloze' | 'image-occlusion' | 'type-in' | 'basic',
 *   hasImages: boolean,
 *   hasTables: boolean,
 *   hasCode: boolean,
 *   hasAudio: boolean,
 *   hasColorCoding: boolean,
 *   contentLength: 'short' | 'medium' | 'long',
 *   deckFamily: 'amboss' | 'anking' | null,
 *   clozeCount: number,
 *   clozeIds: string[],
 * }}
 */
export function classifyCard(frontHtml, backHtml) {
  const front = frontHtml || '';
  const back = backHtml || '';
  const combined = front + ' ' + back;

  return {
    cardType: detectCardType(combined),
    hasImages: combined.includes('<img'),
    hasTables: combined.includes('<table'),
    hasCode: combined.includes('<pre') || combined.includes('<code'),
    hasAudio: combined.includes('[sound:'),
    hasColorCoding: detectColorCoding(combined),
    contentLength: categorizeLength(combined),
    deckFamily: detectDeckFamily(combined),
    clozeCount: countClozes(combined),
    clozeIds: extractClozeIds(combined),
  };
}
