import React, { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import useRemoteSocket from './hooks/useRemoteSocket';
import useCardState from './hooks/useCardState';
import ConnectingScreen from './components/ConnectingScreen';
import PairingScreen from './components/PairingScreen';
import DeckPicker from './components/DeckPicker';
import QuestionScreen from './components/QuestionScreen';
import AnswerScreen from './components/AnswerScreen';
import MCScreen from './components/MCScreen';

const RELAY_URL = 'https://europe-west1-ankiplus-b0ffb.cloudfunctions.net/api/relay';

const SLIDE_VARIANTS = {
  enter: { x: '100%', opacity: 0 },
  center: { x: 0, opacity: 1 },
  exit: { x: '-100%', opacity: 0 },
};

const SLIDE_TRANSITION = { duration: 0.25, ease: [0.25, 1, 0.5, 1] };

const CONTAINER_STYLE = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',
  overflow: 'hidden',
};

const MODE_TOGGLE_STYLE = {
  display: 'flex',
  gap: 'var(--ds-space-xs)',
  padding: 'var(--ds-space-xs)',
  borderRadius: 'var(--ds-radius-full)',
  background: 'var(--ds-bg-canvas)',
  border: '1px solid var(--ds-border)',
  margin: 'var(--ds-space-sm) var(--ds-space-lg)',
};

const MODE_BTN = {
  flex: 1,
  padding: 'var(--ds-space-xs) var(--ds-space-md)',
  borderRadius: 'var(--ds-radius-full)',
  border: 'none',
  cursor: 'pointer',
  fontSize: 'var(--ds-text-sm)',
  fontWeight: 500,
  transition: 'all 0.2s',
};

export default function App() {
  const [mode, setMode] = useState(() => localStorage.getItem('remote-mode') || 'duo');
  const { connected, peerConnected, needsPairing, send, messages, consumeMessages } = useRemoteSocket(RELAY_URL);
  const { card, phase, progress, mcOptions, deckList, cardKey } = useCardState(messages, consumeMessages);
  const [view, setView] = useState('remote');

  useEffect(() => {
    localStorage.setItem('remote-mode', mode);
    send({ type: 'set_mode', mode });
  }, [mode, send]);

  useEffect(() => {
    if (view === 'decks') send({ type: 'get_decks' });
  }, [view, send]);

  const handleFlip = useCallback(() => send({ type: 'flip' }), [send]);
  const handleRate = useCallback((ease) => send({ type: 'rate', ease }), [send]);
  const handleMCSelect = useCallback((optionId) => send({ type: 'mc_select', option_id: optionId }), [send]);
  const handleOpenDeck = useCallback((deckId) => {
    send({ type: 'open_deck', deck_id: deckId });
    setView('remote');
  }, [send]);

  if (needsPairing) {
    return (
      <div style={CONTAINER_STYLE}>
        <PairingScreen />
      </div>
    );
  }

  if (!connected || !peerConnected || !card) {
    return (
      <div style={CONTAINER_STYLE}>
        <ConnectingScreen peerConnected={peerConnected} />
      </div>
    );
  }

  if (view === 'decks') {
    return (
      <div style={CONTAINER_STYLE}>
        <DeckPicker decks={deckList} onOpenDeck={handleOpenDeck} />
        <motion.button
          style={{ ...MODE_BTN, background: 'var(--ds-bg-canvas)', color: 'var(--ds-text-secondary)',
                   margin: 'var(--ds-space-md)', border: '1px solid var(--ds-border)' }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setView('remote')}
        >
          Zurück
        </motion.button>
      </div>
    );
  }

  return (
    <div style={CONTAINER_STYLE}>
      <div style={MODE_TOGGLE_STYLE}>
        {['duo', 'solo'].map(m => (
          <button key={m} style={{
            ...MODE_BTN,
            background: mode === m ? 'var(--ds-accent-10)' : 'transparent',
            color: mode === m ? 'var(--ds-accent)' : 'var(--ds-text-tertiary)',
          }} onClick={() => setMode(m)}>
            {m === 'duo' ? 'Duo' : 'Solo'}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={`${cardKey}-${phase}`}
            variants={SLIDE_VARIANTS}
            initial="enter"
            animate="center"
            exit="exit"
            transition={SLIDE_TRANSITION}
            style={{ position: 'absolute', inset: 0 }}
          >
            {mcOptions && phase === 'question' ? (
              <MCScreen card={card} progress={progress} mcOptions={mcOptions}
                        onSelect={handleMCSelect} onRate={handleRate} />
            ) : phase === 'question' ? (
              <QuestionScreen card={card} progress={progress} mode={mode} onFlip={handleFlip} />
            ) : phase === 'answer' ? (
              <AnswerScreen card={card} progress={progress} mode={mode} onRate={handleRate} />
            ) : (
              <ConnectingScreen peerConnected={false} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <motion.button
        style={{ ...MODE_BTN, background: 'transparent', color: 'var(--ds-text-tertiary)',
                 margin: 'var(--ds-space-xs) var(--ds-space-lg) var(--ds-space-md)',
                 border: 'none', fontSize: 'var(--ds-text-xs)' }}
        whileTap={{ scale: 0.97 }}
        onClick={() => setView('decks')}
      >
        Deck wechseln
      </motion.button>
    </div>
  );
}
