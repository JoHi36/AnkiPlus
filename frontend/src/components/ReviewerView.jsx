import React, { useState, useEffect, useCallback } from 'react';
import ChatInput from './ChatInput';

/**
 * ReviewerView — Card reviewer as React component.
 * Step 1: FLIP mode only. Shows card front, flips to show back, rates.
 * Uses ChatInput (the shared component) for the dock.
 */
export default function ReviewerView({
  cardData,       // {cardId, frontHtml, backHtml, deckName, isQuestion}
  onFlip,         // () => void — show answer
  onRate,         // (ease: number) => void — rate and advance
}) {
  const [showBack, setShowBack] = useState(false);
  const [selectedRating, setSelectedRating] = useState(3); // default Good

  // Reset when new card arrives
  useEffect(() => {
    if (cardData?.isQuestion) {
      setShowBack(false);
      setSelectedRating(3);
    }
  }, [cardData?.cardId, cardData?.isQuestion]);

  // When answer is shown, reveal back
  useEffect(() => {
    if (cardData && !cardData.isQuestion) {
      setShowBack(true);
    }
  }, [cardData?.isQuestion]);

  // Keyboard shortcuts — ReviewerView OWNS Space/Enter/1-4 in review
  useEffect(() => {
    const handler = (e) => {
      // Don't capture if typing in textarea/input
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;

      if (e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        if (!showBack) {
          onFlip?.();
        } else {
          onRate?.(selectedRating);
        }
      }

      // 1-4 for rating when answer shown
      if (showBack && ['1','2','3','4'].includes(e.key)) {
        setSelectedRating(parseInt(e.key));
      }
    };
    window.addEventListener('keydown', handler, true); // capture phase
    return () => window.removeEventListener('keydown', handler, true);
  }, [showBack, selectedRating, onFlip, onRate]);

  if (!cardData) {
    return (
      <div style={{
        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--ds-text-muted)', fontSize: 14,
      }}>
        Warte auf Karte...
      </div>
    );
  }

  const RATING_LABELS = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };
  const RATING_COLORS = {
    1: 'var(--ds-red)', 2: 'var(--ds-yellow)',
    3: 'var(--ds-green)', 4: 'var(--ds-accent)',
  };

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: 'var(--ds-bg-canvas)', overflow: 'hidden',
    }}>
      {/* Card content */}
      <div style={{
        flex: 1, overflowY: 'auto', overflowX: 'hidden',
        padding: '40px 24px 160px',
        scrollbarWidth: 'none',
      }}>
        <div style={{ maxWidth: 720, width: '100%', margin: '0 auto' }}>
          {/* Show front OR back — Anki's answer() includes the question already */}
          {showBack
            ? <div dangerouslySetInnerHTML={{ __html: cardData.backHtml || '' }} />
            : <div dangerouslySetInnerHTML={{ __html: cardData.frontHtml || '' }} />
          }
        </div>
      </div>

      {/* Dock — reuses ChatInput with different actions */}
      <div style={{
        position: 'sticky', bottom: 0,
        padding: '0 20px 20px',
        display: 'flex', justifyContent: 'center',
      }}>
        <div style={{ maxWidth: 520, width: '100%' }}>
          <ChatInput
            onSend={() => {}} // not used in flip mode
            isLoading={false}
            onStop={() => {}}
            cardContext={null}
            isPremium={true}
            hideInput={!showBack} // hide textarea when question shown, show when answer (for follow-up)
            placeholder={showBack ? 'Nachfragen...' : 'Antwort eingeben...'}
            actionPrimary={showBack
              ? {
                  label: `${RATING_LABELS[selectedRating]}`,
                  shortcut: 'SPACE',
                  onClick: () => onRate?.(selectedRating),
                }
              : {
                  label: 'Show Answer',
                  shortcut: 'SPACE',
                  onClick: () => onFlip?.(),
                }
            }
            actionSecondary={showBack
              ? {
                  label: 'Nachfragen',
                  shortcut: '↵',
                  onClick: () => {}, // TODO: open chat with context
                }
              : {
                  label: 'Multiple Choice',
                  shortcut: '↵',
                  onClick: () => {}, // TODO: MC mode
                }
            }
          />
        </div>
      </div>
    </div>
  );
}
