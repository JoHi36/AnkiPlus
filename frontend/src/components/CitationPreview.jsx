import React, { useEffect, useState, useCallback } from 'react';
import CardPreview from '../../../shared/components/CardPreview.jsx';

/**
 * CitationPreview — Loads card data via the Anki bridge and renders CardPreview popup.
 *
 * Listens for `cardDetails` events from ankiReceive (the bridge's message queue system).
 * The bridge sends card details as: ankiReceive({type: 'cardDetails', ...cardData})
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

    // Timeout fallback
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        onClose?.();
      }
    }, FETCH_TIMEOUT_MS);

    // Listen for cardDetails events from ankiReceive
    const origReceive = window.ankiReceive;
    const handleReceive = (payload) => {
      // Call original handler first
      if (origReceive) origReceive(payload);

      if (settled) return;
      if (!payload || payload.type !== 'cardDetails') return;

      // Check if this cardDetails matches our requested cardId
      const data = payload.data || payload;
      const responseCardId = data.cardId || data.card_id;

      // Accept if cardId matches OR if no cardId in response (single-card mode)
      if (responseCardId && String(responseCardId) !== String(cardId)) return;

      settled = true;
      clearTimeout(timer);

      if (data && (data.frontHtml || data.front || data.fields)) {
        setCardData(data);
      } else {
        onClose?.();
      }
    };

    window.ankiReceive = handleReceive;

    // Request card details via bridge
    window.ankiBridge?.addMessage('getCardDetails', {
      cardId: String(cardId),
    });

    return () => {
      settled = true;
      clearTimeout(timer);
      // Restore original handler
      if (window.ankiReceive === handleReceive) {
        window.ankiReceive = origReceive;
      }
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
