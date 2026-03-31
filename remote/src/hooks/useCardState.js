import { useState, useEffect, useRef } from 'react';

export default function useCardState(messages, consumeMessages) {
  const [card, setCard] = useState(null);
  const [phase, setPhase] = useState('waiting');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [mcOptions, setMcOptions] = useState(null);
  const [deckList, setDeckList] = useState([]);
  const [cardKey, setCardKey] = useState(0);
  const prevCardId = useRef(null);

  useEffect(() => {
    if (!messages.length) return;
    const batch = consumeMessages();

    for (const msg of batch) {
      switch (msg.type) {
        case 'card_state': {
          const newCardId = msg.card_id;
          if (newCardId !== prevCardId.current) {
            setCardKey(k => k + 1);
            prevCardId.current = newCardId;
          }
          setCard({
            id: newCardId,
            frontHtml: msg.front_html,
            backHtml: msg.back_html,
            deck: msg.deck,
          });
          setPhase(msg.phase);
          setProgress(msg.progress || { current: 0, total: 0 });
          setMcOptions(msg.mc_options || null);
          break;
        }
        case 'mc_options':
          setMcOptions(msg.options);
          break;
        case 'mc_clear':
          setMcOptions(null);
          break;
        case 'deck_list':
          setDeckList(msg.decks || []);
          break;
        default:
          break;
      }
    }
  }, [messages, consumeMessages]);

  return { card, phase, progress, mcOptions, deckList, cardKey };
}
