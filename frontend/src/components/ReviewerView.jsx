import React, { useCallback, useEffect, useRef, useState } from 'react';
import TermPopup from './TermPopup';

/**
 * ReviewerView — Pure display component for the card viewer.
 * State machine lives in useReviewerState hook (used by App.jsx).
 * ChatInput lives at App level (unified, animated between positions).
 *
 * This component only renders: card HTML + MC options.
 * Knowledge Graph terms are marked after render via DOM manipulation.
 */

/** Check if HTML has visible content (not just style tags / whitespace) */
function hasVisibleContent(html) {
  if (!html) return false;
  const stripped = html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, '').trim();
  return stripped.length > 0;
}

/**
 * Regex matching ALL background CSS properties (background, background-color,
 * background-image, etc.). Catches every background-* variant.
 */
const BG_RE = /background(?:-[a-z-]+)?\s*:[^;]+;?/gi;

/**
 * Regex matching black/near-black color declarations in <style> blocks.
 * Targets: color: black, #000-#3xx, rgb(0,0,0). Preserves semantic colors.
 */
const BLACK_COLOR_RE = /(?:^|;)\s*color\s*:\s*(?:black|#0{3,6}|#1[0-9a-f]{2,5}|#2[0-9a-f]{2,5}|#3[0-9a-f]{2,5}|rgb\(\s*0[\s,]+0[\s,]+0\s*\)|rgba\(\s*0[\s,]+0[\s,]+0[\s,])(?:\s*!important)?\s*;?/gi;

/**
 * Sanitize card HTML for our renderer.
 * 1. Strip backgrounds from <style> blocks and inline style attributes
 * 2. Strip black/near-black text colors from <style> blocks
 * 3. Strip HTML bgcolor attributes (old-school table backgrounds)
 * Preserves semantic colors (red, green, blue for coding), fonts, and layout.
 */
function sanitizeCardHtml(html) {
  if (!html) return '';
  // Strip from <style> blocks: all background-* + black text colors
  let result = html.replace(/<style([\s\S]*?)<\/style>/gi, (match, content) => {
    let cleaned = content.replace(BG_RE, '');
    cleaned = cleaned.replace(BLACK_COLOR_RE, ';');
    return '<style' + cleaned + '</style>';
  });
  // Strip backgrounds from inline style="..." attributes
  result = result.replace(/style="([^"]*)"/gi, (match, styleContent) => {
    const cleaned = styleContent.replace(BG_RE, '').trim();
    return cleaned ? 'style="' + cleaned + '"' : '';
  });
  // Strip backgrounds from inline style='...' attributes
  result = result.replace(/style='([^']*)'/gi, (match, styleContent) => {
    const cleaned = styleContent.replace(BG_RE, '').trim();
    return cleaned ? "style='" + cleaned + "'" : '';
  });
  // Strip old HTML bgcolor attributes
  result = result.replace(/\s*bgcolor\s*=\s*["'][^"']*["']/gi, '');
  return result;
}

const MC_LETTERS = ['A', 'B', 'C', 'D', 'E'];

/**
 * Override style injected AFTER card content in the DOM.
 * Because it appears later, it wins the CSS cascade even against
 * deck CSS with !important (same specificity, later wins).
 * This is the same technique used by custom_reviewer/__init__.py.
 */
const CARD_BG_OVERRIDE = (
  <style>{`
    .card-renderer *,
    .card-renderer *::before,
    .card-renderer *::after {
      background: transparent !important;
      background-color: transparent !important;
      background-image: none !important;
    }
    .card-renderer .cloze {
      background: var(--ds-active-tint) !important;
    }
  `}</style>
);

function MCOptions({ options, selected, isResult, onSelect }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 24 }}>
      {options.map((opt, i) => {
        const correct = opt.correct || opt.isCorrect || false;
        const sel = selected[i];
        let cls = 'ds-mc-option';
        if (isResult && correct) cls += ' correct';
        else if (sel === 'wrong') cls += ' wrong';
        else if (sel === 'correct') cls += ' correct';
        return (
          <button key={i} className={cls} disabled={isResult || sel === 'wrong'}
            onClick={() => { if (!isResult && sel !== 'wrong') onSelect(i, correct); }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 24, height: 24, borderRadius: 4,
              fontSize: 12, fontWeight: 700, fontFamily: 'var(--ds-font-mono)',
              background: 'var(--ds-hover-tint)', color: 'var(--ds-text-secondary)', flexShrink: 0,
            }}>{MC_LETTERS[i]}</span>
            <span>{opt.text}</span>
          </button>
        );
      })}
      {isResult && options.map((opt, i) => {
        if (!(opt.correct || opt.isCorrect) || !opt.explanation) return null;
        return (
          <div key={`x${i}`} className="ds-review-result correct" style={{ marginTop: 8 }}>
            <span className="ds-result-label">Erklärung</span>
            <span className="ds-result-body">{opt.explanation}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Apply phrase annotations to the card DOM.
 * Walks text nodes, finds matching terms, wraps them in styled spans.
 * Marks Knowledge Graph terms in card content.
 */
function applyPhraseMarkers(containerEl, phrases, source) {
  if (!containerEl || !phrases || typeof phrases !== 'object') return;

  // Derive CSS class from source
  const markerClass = 'kg-marker';

  // Filter: skip branding terms and very short terms
  const SKIP_TERMS = new Set(['amboss', 'meditricks', 'ankihub']);
  const terms = Object.entries(phrases)
    .filter(([term]) => term.length > 2 && !SKIP_TERMS.has(term.toLowerCase()))
    .sort((a, b) => b[0].length - a[0].length);  // longest first to avoid partial matches

  if (terms.length === 0) return;

  // Build regex that matches any of the terms (case-insensitive)
  const escaped = terms.map(([term]) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp('(' + escaped.join('|') + ')', 'gi');

  // Map lowercase term → phraseId
  const phraseMap = {};
  terms.forEach(([term, id]) => { phraseMap[term.toLowerCase()] = id; });

  // Walk text nodes inside the container
  const walker = document.createTreeWalker(containerEl, NodeFilter.SHOW_TEXT, null);
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    // Skip nodes inside script/style tags or already-marked spans
    const parent = node.parentElement;
    if (!parent) continue;
    const tag = parent.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' ||
        parent.classList.contains('kg-marker')) continue;
    if (regex.test(node.textContent)) {
      textNodes.push(node);
      regex.lastIndex = 0;  // reset after test()
    }
  }

  // Replace matches in collected text nodes
  textNodes.forEach(textNode => {
    const text = textNode.textContent;
    const parts = text.split(regex);
    if (parts.length <= 1) return;

    const fragment = document.createDocumentFragment();
    parts.forEach(part => {
      const phraseId = phraseMap[part.toLowerCase()];
      if (phraseId) {
        const span = document.createElement('span');
        span.className = markerClass;
        span.setAttribute('data-phrase-group-id', phraseId);
        span.setAttribute('data-source', source || 'addon');
        span.textContent = part;
        span.style.cursor = 'pointer';
        fragment.appendChild(span);
      } else {
        fragment.appendChild(document.createTextNode(part));
      }
    });
    textNode.parentNode.replaceChild(fragment, textNode);
  });
}

export default function ReviewerView({ cardData, reviewer }) {
  const cardContentRef = useRef(null);
  const [kgPopup, setKgPopup] = useState(null);       // { term, x, y }
  const [kgDefinition, setKgDefinition] = useState(null);

  // Load KG terms for the current card and apply .kg-marker spans
  // Re-run when card flips (isQuestion changes) since the HTML content changes
  const cardId = cardData?.cardId || cardData?.id;
  const isQuestion = cardData?.isQuestion;
  const kgTermsRef = useRef([]);

  useEffect(() => {
    if (!cardId) return;

    // Request terms (only on card change, not on flip)
    window.ankiBridge?.addMessage('getCardKGTerms', { cardId: String(cardId) });

    const handler = (e) => {
      const { terms } = e.detail || {};
      if (terms && terms.length > 0) {
        kgTermsRef.current = terms;
        // Apply markers after a short delay (DOM needs to settle after flip)
        setTimeout(() => {
          if (cardContentRef.current) {
            const termMap = {};
            terms.forEach(t => { termMap[t] = 'kg-' + t.toLowerCase().replace(/\s+/g, '-'); });
            applyPhraseMarkers(cardContentRef.current, termMap, 'knowledge-graph');
          }
        }, 100);
      }
    };
    window.addEventListener('kg.cardTerms', handler);
    return () => window.removeEventListener('kg.cardTerms', handler);
  }, [cardId]);

  // Re-apply markers when card flips (question → answer or vice versa)
  useEffect(() => {
    if (!kgTermsRef.current.length || !cardContentRef.current) return;
    setTimeout(() => {
      if (cardContentRef.current) {
        const termMap = {};
        kgTermsRef.current.forEach(t => { termMap[t] = 'kg-' + t.toLowerCase().replace(/\s+/g, '-'); });
        applyPhraseMarkers(cardContentRef.current, termMap, 'knowledge-graph');
      }
    }, 150);
  }, [isQuestion]);

  // Listen for KG term definition results
  useEffect(() => {
    const handler = (e) => {
      setKgDefinition(e.detail);
    };
    window.addEventListener('graph.termDefinition', handler);
    return () => window.removeEventListener('graph.termDefinition', handler);
  }, []);

  /**
   * Handle clicks on links and addon markers inside card HTML.
   */
  const handleCardClick = useCallback((e) => {
    // Handle KG marker clicks → show TermPopup below the term
    const kgMarker = e.target.closest('.kg-marker');
    if (kgMarker) {
      e.preventDefault();
      e.stopPropagation();
      const term = kgMarker.textContent;
      const rect = kgMarker.getBoundingClientRect();
      setKgPopup({ term, x: rect.left + rect.width / 2, y: rect.bottom + 2 });
      setKgDefinition(null);
      window.ankiBridge?.addMessage('getTermDefinition', { term });
      return;
    }

    const link = e.target.closest('a');
    if (!link) return;

    e.preventDefault();
    e.stopPropagation();

    const href = link.getAttribute('href');
    if (!href || href === '#') return;

    // pycmd-style links (used by some addons): route to Anki's command handler
    if (href.startsWith('pycmd:') || href.startsWith('py:')) {
      const cmd = href.replace(/^py(cmd)?:/, '');
      if (window.ankiBridge?.addMessage) {
        window.ankiBridge.addMessage('pycmd', cmd);
      }
      return;
    }

    // javascript: links (some addons use onclick, which still works)
    if (href.startsWith('javascript:')) return;

    // Regular URLs — open in system browser via bridge
    if (window.ankiBridge?.addMessage) {
      window.ankiBridge.addMessage('openUrl', href);
    }
  }, []);

  if (!cardData) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ds-text-muted)', fontSize: 14, background: 'transparent' }}>
        Warte auf Karte...
      </div>
    );
  }

  const { state, showBack, handleMCSelect } = reviewer;

  // Card content uses template-rendered HTML (includes Note Type CSS)
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'transparent', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 'var(--ds-space-2xl) var(--ds-space-xl) 160px', scrollbarWidth: 'none' }}>
        <div style={{ maxWidth: 'var(--ds-content-width)', width: '100%', margin: '0 auto' }}>
          {showBack
            ? <div id="qa" className="card-renderer" onClick={handleCardClick}>
                <div ref={cardContentRef} className="card card-content" dangerouslySetInnerHTML={{ __html:
                  sanitizeCardHtml(hasVisibleContent(cardData.backHtml) ? cardData.backHtml : (cardData.backField || cardData.backHtml || ''))
                }} />
                {CARD_BG_OVERRIDE}
              </div>
            : <div id="qa" className="card-renderer" onClick={handleCardClick}>
                <div ref={cardContentRef} className="card card-content" dangerouslySetInnerHTML={{ __html:
                  sanitizeCardHtml(hasVisibleContent(cardData.frontHtml) ? cardData.frontHtml : (cardData.frontField || cardData.frontHtml || ''))
                }} />
                {CARD_BG_OVERRIDE}
              </div>
          }
          {(state.mode === 'mc_active' || state.mode === 'mc_result') && state.mcOptions && (
            <MCOptions
              options={state.mcOptions}
              selected={state.mcSelected}
              isResult={state.mode === 'mc_result'}
              onSelect={handleMCSelect}
            />
          )}
        </div>
      </div>

      {/* Knowledge Graph term popup */}
      {kgPopup && (
        <TermPopup
          term={kgPopup.term}
          mode="overlay"
          x={kgPopup.x}
          y={kgPopup.y}
          onClose={() => { setKgPopup(null); setKgDefinition(null); }}
          onTermClick={(t) => {
            setKgDefinition(null);
            window.ankiBridge?.addMessage('getTermDefinition', { term: t });
            setKgPopup({ ...kgPopup, term: t });
          }}
          definition={kgDefinition?.definition || null}
          sourceCount={kgDefinition?.sourceCount || 0}
          generatedBy={kgDefinition?.generatedBy || 'llm'}
          connectedTerms={kgDefinition?.connectedTerms || []}
          cardRefs={kgDefinition?.cardRefs || null}
          cardCount={kgDefinition?.sourceCount || 0}
          loading={!kgDefinition}
          error={kgDefinition?.error || null}
        />
      )}

    </div>
  );
}
