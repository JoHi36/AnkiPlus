import React, { useState, useCallback } from 'react';
import useRemoteSocket from './hooks/useRemoteSocket';
import useCardState from './hooks/useCardState';
import useDemoMode, { isDemoMode } from './hooks/useDemoMode';
import MockupViewer from './components/MockupViewer';
import ConnectingScreen from './components/ConnectingScreen';
import PairingScreen from './components/PairingScreen';
import RemoteDock from './components/RemoteDock';
import { copyPwaLogs } from './utils/pwaLogger';

const RELAY_URL = import.meta.env.VITE_RELAY_URL || 'https://europe-west1-ankiplus-b0ffb.cloudfunctions.net/api/relay';
const DEMO = isDemoMode();
const MOCKUP = new URLSearchParams(window.location.search).has('mockup');

const CONTAINER_STYLE = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',
  overflow: 'hidden',
};

const LOG_BTN_STYLE = {
  position: 'fixed',
  bottom: 8,
  right: 8,
  zIndex: 9999,
  padding: '4px 10px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(0,0,0,0.3)',
  color: 'rgba(255,255,255,0.3)',
  fontSize: 10,
  fontFamily: 'monospace',
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
};

function LogCopyButton() {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    const ok = copyPwaLogs();
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, []);
  return (
    <button style={LOG_BTN_STYLE} onClick={handleCopy}>
      {copied ? 'Copied' : 'Logs'}
    </button>
  );
}

export default function App() {
  if (MOCKUP) return <MockupViewer />;

  const remote = useRemoteSocket(DEMO ? null : RELAY_URL);
  const demo = useDemoMode();

  const connected = DEMO ? true : remote.connected;
  const peerConnected = DEMO ? true : remote.peerConnected;
  const needsPairing = DEMO ? false : remote.needsPairing;
  const sendRemote = DEMO ? demo.send : remote.send;

  const cardState = useCardState(
    DEMO ? [] : remote.messages,
    DEMO ? (() => []) : remote.consumeMessages,
  );

  const card = DEMO ? demo.card : cardState.card;
  const phase = DEMO ? demo.phase : cardState.phase;
  const progress = DEMO ? demo.progress : cardState.progress;
  const mcOptions = DEMO ? demo.mcOptions : cardState.mcOptions;

  if (needsPairing) {
    return (
      <div style={CONTAINER_STYLE}>
        <PairingScreen />
        <LogCopyButton />
      </div>
    );
  }

  if (!connected || !peerConnected) {
    return (
      <div style={CONTAINER_STYLE}>
        <ConnectingScreen peerConnected={peerConnected} />
        <LogCopyButton />
      </div>
    );
  }

  return (
    <>
      <RemoteDock
        phase={card ? phase : 'idle'}
        card={card}
        mcOptions={mcOptions}
        progress={progress}
        send={sendRemote}
      />
      <LogCopyButton />
    </>
  );
}
