import { useState, useCallback, useRef } from 'react';

const DEMO_CARDS = [
  {
    id: 'demo-1',
    frontHtml: '<div style="text-align:center;padding:24px"><h2>Was ist die Funktion des Hippocampus?</h2></div>',
    backHtml: '<div style="text-align:center;padding:24px"><p>Der Hippocampus ist zentral für die <b>Gedächtniskonsolidierung</b> — er überführt Kurzzeit- in Langzeitgedächtnis.</p></div>',
    deck: 'Neuroanatomie',
  },
  {
    id: 'demo-2',
    frontHtml: '<div style="text-align:center;padding:24px"><h2>Welches Enzym spaltet Laktose?</h2></div>',
    backHtml: '<div style="text-align:center;padding:24px"><p><b>Laktase</b> (β-Galaktosidase) spaltet Laktose in Glukose und Galaktose.</p></div>',
    deck: 'Biochemie',
  },
  {
    id: 'demo-3',
    frontHtml: '<div style="text-align:center;padding:24px"><h2>Nenne die 3 Schichten der Arterienwand.</h2></div>',
    backHtml: '<div style="text-align:center;padding:24px"><p><b>Tunica intima</b> (innen), <b>Tunica media</b> (Muskelschicht), <b>Tunica adventitia</b> (außen).</p></div>',
    deck: 'Histologie',
  },
];

const DEMO_MC_OPTIONS = [
  { id: 'mc-a', text: 'Gedächtniskonsolidierung' },
  { id: 'mc-b', text: 'Motorische Koordination' },
  { id: 'mc-c', text: 'Visuelles Verarbeiten' },
  { id: 'mc-d', text: 'Sprachproduktion' },
];

const DEMO_DECKS = [
  { id: 1, name: 'Neuroanatomie', count: 142 },
  { id: 2, name: 'Biochemie', count: 89 },
  { id: 3, name: 'Histologie', count: 67 },
  { id: 4, name: 'Pharmakologie', count: 203 },
  { id: 5, name: 'Physiologie', count: 156 },
];

export function isDemoMode() {
  return new URLSearchParams(window.location.search).has('demo');
}

export default function useDemoMode() {
  const cardIndex = useRef(0);
  const [card, setCard] = useState(DEMO_CARDS[0]);
  const [phase, setPhase] = useState('question');
  const [cardKey, setCardKey] = useState(0);
  const [showMC, setShowMC] = useState(false);

  const progress = { current: cardIndex.current + 1, total: DEMO_CARDS.length * 5 };

  const nextCard = useCallback(() => {
    cardIndex.current = (cardIndex.current + 1) % DEMO_CARDS.length;
    const next = DEMO_CARDS[cardIndex.current];
    setCard(next);
    setPhase('question');
    setCardKey(k => k + 1);
    setShowMC(cardIndex.current === 0);
  }, []);

  const handleFlip = useCallback(() => {
    setPhase('answer');
  }, []);

  const handleRate = useCallback(() => {
    nextCard();
  }, [nextCard]);

  const handleMCSelect = useCallback(() => {
    // MC select just shows rating after a beat (handled by MCScreen)
  }, []);

  const send = useCallback((msg) => {
    if (msg.type === 'flip') handleFlip();
    else if (msg.type === 'rate') handleRate();
    else if (msg.type === 'mc_select') handleMCSelect();
    else if (msg.type === 'switch_tab') { /* Tab switch — no-op in demo */ }
    else if (msg.type === 'request_mc') { setShowMC(true); setPhase('question'); }
    else if (msg.type === 'chat_message') { /* Chat send — no-op in demo */ }
  }, [handleFlip, handleRate, handleMCSelect]);

  return {
    card,
    phase,
    progress,
    cardKey,
    mcOptions: showMC ? DEMO_MC_OPTIONS : null,
    deckList: DEMO_DECKS,
    ankiState: 'reviewing',
    send,
  };
}
