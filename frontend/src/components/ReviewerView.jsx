import React from 'react';

/**
 * ReviewerView — Pure display component for the card viewer.
 * State machine lives in useReviewerState hook (used by App.jsx).
 * ChatInput lives at App level (unified, animated between positions).
 *
 * This component only renders: card HTML + MC options.
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

export default function ReviewerView({ cardData, reviewer }) {
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
        <div style={{ maxWidth: 'var(--ds-dock-width)', width: '100%', margin: '0 auto' }}>
          {showBack
            ? <div className="card-renderer">
                <div className="card-content" dangerouslySetInnerHTML={{ __html:
                  sanitizeCardHtml(hasVisibleContent(cardData.backHtml) ? cardData.backHtml : (cardData.backField || cardData.backHtml || ''))
                }} />
                {CARD_BG_OVERRIDE}
              </div>
            : <div className="card-renderer">
                <div className="card-content" dangerouslySetInnerHTML={{ __html:
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
    </div>
  );
}
