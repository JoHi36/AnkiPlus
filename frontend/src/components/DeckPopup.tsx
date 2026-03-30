import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';

/**
 * DeckPopup — tooltip-style widget appearing below the TopBar,
 * centered under an anchor element (default: topbar-session-tab).
 * Canvas-colored, solid — NOT frosted glass (Ein-Glas-Regel).
 * Arrow points upward toward the anchor.
 */

interface DeckPopupProps {
  deckName: string | null;
  cardCount?: number;
  onStartLearning?: () => void;
  anchorId?: string;
}

const ARROW_SIZE = 7;
const POPUP_MIN_W = 240;
const EDGE_PAD = 12;

const POPUP_STYLE: React.CSSProperties = {
  position: 'fixed',
  background: 'var(--ds-bg-canvas)',
  border: '1px solid var(--ds-border-subtle)',
  borderRadius: 10,
  boxShadow: 'var(--ds-shadow-lg)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 14px',
  whiteSpace: 'nowrap',
  fontFamily: 'var(--ds-font-sans)',
  minWidth: POPUP_MIN_W,
  zIndex: 9999,
};

const STAR_STYLE: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--ds-text-tertiary)',
  flexShrink: 0,
};

const DECK_NAME_STYLE: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--ds-text-secondary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  maxWidth: 200,
};

const COUNT_STYLE: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--ds-text-muted)',
  background: 'var(--ds-bg-overlay)',
  padding: '2px 7px',
  borderRadius: 5,
  fontVariantNumeric: 'tabular-nums',
};

const DIVIDER_STYLE: React.CSSProperties = {
  width: 1,
  height: 13,
  background: 'var(--ds-border-subtle)',
  flexShrink: 0,
};

const LEARN_BTN_STYLE: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--ds-accent)',
  fontWeight: 600,
  cursor: 'pointer',
  background: 'none',
  border: 'none',
  padding: 0,
  fontFamily: 'inherit',
  lineHeight: 1,
  flexShrink: 0,
};

export default function DeckPopup({
  deckName,
  cardCount,
  onStartLearning,
  anchorId = 'topbar-session-tab',
}: DeckPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; arrowLeft: number } | null>(null);
  const [animIn, setAnimIn] = useState(false);

  const measure = () => {
    const anchor = document.getElementById(anchorId);
    const popup = popupRef.current;
    if (!anchor) return;

    const anchorRect = anchor.getBoundingClientRect();
    const vw = window.innerWidth;

    // Popup width: use rendered width if available, else fall back to min
    const popupW = popup ? popup.offsetWidth : POPUP_MIN_W;

    // Center under anchor
    let left = anchorRect.left + anchorRect.width / 2 - popupW / 2;

    // Clamp to viewport
    if (left + popupW > vw - EDGE_PAD) left = vw - popupW - EDGE_PAD;
    if (left < EDGE_PAD) left = EDGE_PAD;

    // Top: just below anchor with 4px gap + arrow height
    const top = anchorRect.bottom + 4 + ARROW_SIZE;

    // Arrow x: center of anchor relative to popup left
    const arrowLeft = Math.max(
      16,
      Math.min(popupW - 16, anchorRect.left + anchorRect.width / 2 - left)
    );

    setPos({ left, top, arrowLeft });
  };

  useEffect(() => {
    if (!deckName) return;

    // Initial position measurement
    measure();

    // Trigger enter animation on next frame
    const raf = requestAnimationFrame(() => setAnimIn(true));

    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      cancelAnimationFrame(raf);
    };
  }, [deckName, anchorId]);

  // Re-measure once popup renders (so we have actual width)
  useEffect(() => {
    if (pos !== null) measure();
  }, [deckName]);

  if (!deckName) return null;

  const portal = (
    <>
      <div
        ref={popupRef}
        style={{
          ...POPUP_STYLE,
          ...(pos
            ? { left: pos.left, top: pos.top }
            : { left: -9999, top: -9999 }),
          opacity: animIn ? 1 : 0,
          transform: animIn ? 'translateY(0)' : 'translateY(-6px)',
          transition: 'opacity 0.18s ease-out, transform 0.18s ease-out',
        }}
      >
        {/* Upward-pointing arrow — fill matches canvas bg, stroke matches border */}
        {pos && (
          <svg
            width={ARROW_SIZE * 2}
            height={ARROW_SIZE}
            viewBox={`0 0 ${ARROW_SIZE * 2} ${ARROW_SIZE}`}
            style={{
              position: 'absolute',
              top: -(ARROW_SIZE),
              left: pos.arrowLeft - ARROW_SIZE,
              overflow: 'visible',
              zIndex: 1,
            }}
          >
            {/* Border arrow (slightly larger, behind) */}
            <polygon
              points={`-0.5,${ARROW_SIZE + 0.5} ${ARROW_SIZE},${-0.5} ${ARROW_SIZE * 2 + 0.5},${ARROW_SIZE + 0.5}`}
              fill="var(--ds-border-subtle)"
            />
            {/* Fill arrow (covers the popup's top border under it) */}
            <polygon
              points={`1,${ARROW_SIZE} ${ARROW_SIZE},0 ${ARROW_SIZE * 2 - 1},${ARROW_SIZE}`}
              fill="var(--ds-bg-canvas)"
            />
          </svg>
        )}

        <span style={STAR_STYLE}>✦</span>
        <span style={DECK_NAME_STYLE}>{deckName}</span>
        {cardCount != null && <span style={COUNT_STYLE}>{cardCount}</span>}
        <span style={DIVIDER_STYLE} />
        <button style={LEARN_BTN_STYLE} onClick={onStartLearning}>
          Lernen →
        </button>
      </div>
    </>
  );

  return ReactDOM.createPortal(portal, document.body);
}
