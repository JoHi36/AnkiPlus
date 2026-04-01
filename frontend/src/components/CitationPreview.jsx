import React, { useEffect, useState } from 'react';
import CardPreview from '../../../shared/components/CardPreview.jsx';

/**
 * CitationPreview — Product wrapper that loads card data via the Anki bridge
 * and renders a CardPreview popup.
 *
 * Props:
 *   cardId  — Anki card ID (number or string)
 *   onClose — Called after popup closes (or on silent error)
 */

const FETCH_TIMEOUT_MS = 5000;

export default function CitationPreview({ cardId, onClose }) {
  const [cardData, setCardData] = useState(null);

  useEffect(() => {
    if (!cardId) {
      onClose?.();
      return;
    }

    let settled = false;

    // 5-second timeout fallback
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        onClose?.();
      }
    }, FETCH_TIMEOUT_MS);

    // Register callback in the bridge callback registry
    const callbackKey = `cardPreview_${cardId}_${Date.now()}`;
    window[callbackKey] = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      delete window[callbackKey];

      try {
        const parsed = typeof result === 'string' ? JSON.parse(result) : result;
        if (parsed && (parsed.frontHtml || parsed.front)) {
          setCardData(parsed);
        } else {
          onClose?.();
        }
      } catch {
        onClose?.();
      }
    };

    // Request card details via bridge
    window.ankiBridge?.addMessage('getCardDetails', {
      cardId,
      callback: callbackKey,
    });

    return () => {
      settled = true;
      clearTimeout(timer);
      if (window[callbackKey]) delete window[callbackKey];
    };
  }, [cardId, onClose]);

  if (!cardData) return null;

  return (
    <CardPreview
      front={cardData.frontHtml || cardData.front || ''}
      back={cardData.backHtml || cardData.back || ''}
      deckName={cardData.deckName || cardData.deck_name || ''}
      onClose={onClose}
    />
  );
}
