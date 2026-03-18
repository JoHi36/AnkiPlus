// frontend/src/components/CompanionCard.jsx
import React from 'react';

/**
 * CompanionCard — Apple Glass card shown to the right of Plusi in the dock strip.
 *
 * Props:
 *   isThinking: bool  — show animated thinking dots (compact pill width)
 *   text: string|null — reply text to display (full width)
 *   visible: bool     — if false, renders nothing (companion mode off)
 *
 * Width behaviour:
 *   - Thinking: card constrained to ~60px (just the 3 dots + padding)
 *   - Reply:    card expands via max-width transition to fill remaining dock space
 *   Both states use flex:1 so the dock can control overall sizing.
 */
export default function CompanionCard({ isThinking, text, visible }) {
  if (!visible) return null;
  if (!isThinking && !text) return null;

  return (
    <>
      <style>{CARD_CSS}</style>
      <div
        className="companion-card"
        style={{
          maxWidth: isThinking ? '60px' : '360px',
          transition: 'max-width 0.38s cubic-bezier(0.34,1.1,0.64,1)',
          overflow: 'hidden',
        }}
      >
        {isThinking ? (
          <div className="companion-think">
            <span className="companion-dot" style={{ animationDelay: '0s' }} />
            <span className="companion-dot" style={{ animationDelay: '0.22s' }} />
            <span className="companion-dot" style={{ animationDelay: '0.44s' }} />
          </div>
        ) : (
          <div className="companion-text" key={text}>
            {text}
          </div>
        )}
      </div>
    </>
  );
}

const CARD_CSS = `
  /* ── Apple Glass base ── */
  .companion-card {
    position: relative;
    border-radius: 12px;
    background: linear-gradient(135deg,
      rgba(0,55,120,.62) 0%,
      rgba(0,30,72,.74) 55%,
      rgba(0,18,52,.80) 100%);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
  }

  /* Diagonal gradient border: bright top-left + bottom-right, dark sides */
  .companion-card::before {
    content: '';
    position: absolute; inset: 0; border-radius: 12px; padding: 1px;
    background: linear-gradient(135deg,
      rgba(255,255,255,.62) 0%,
      rgba(255,255,255,.12) 35%,
      rgba(255,255,255,.02) 55%,
      rgba(255,255,255,.10) 78%,
      rgba(255,255,255,.38) 100%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: destination-out;
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask-composite: exclude;
    pointer-events: none;
  }

  /* Top specular sheen */
  .companion-card::after {
    content: '';
    position: absolute; top: 0; left: 0; right: 0; height: 45%;
    border-radius: 12px 12px 0 0;
    background: linear-gradient(180deg, rgba(255,255,255,.055) 0%, transparent 100%);
    pointer-events: none;
  }

  /* ── Thinking dots ── */
  .companion-think {
    display: flex; align-items: center; gap: 5px;
    padding: 10px 13px;
    position: relative; z-index: 1;
  }

  .companion-dot {
    width: 5px; height: 5px; border-radius: 50%;
    background: rgba(120,190,255,.75);
    animation: companion-dot-bounce 1.1s ease-in-out infinite;
    flex-shrink: 0;
  }

  @keyframes companion-dot-bounce {
    0%,80%,100% { transform: translateY(0); opacity: .45; }
    40%          { transform: translateY(-4px); opacity: 1; }
  }

  /* ── Reply text ── */
  .companion-text {
    padding: 9px 13px;
    font-size: 12.5px;
    line-height: 1.45;
    color: rgba(205,228,255,.9);
    max-height: 56px;   /* 2 lines — no scroll, no overflow indicator */
    overflow: hidden;
    position: relative; z-index: 1;
    animation: companion-text-in 0.35s ease;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  }

  @keyframes companion-text-in {
    from { opacity: 0; transform: translateY(2px); }
    to   { opacity: 1; transform: translateY(0); }
  }
`;
