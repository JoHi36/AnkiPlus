import { useState, useEffect, useRef, useCallback } from 'react';

const POLL_INTERVAL = 500;
const RECONNECT_DELAY = 3000;
const TOKEN_KEY = 'ankiplus-remote-token';

export default function useRemoteSocket(relayUrl) {
  const [connected, setConnected] = useState(false);
  const [peerConnected, setPeerConnected] = useState(false);
  const [needsPairing, setNeedsPairing] = useState(false);
  const [messages, setMessages] = useState([]);
  const [ankiState, setAnkiState] = useState('idle');
  const tokenRef = useRef(localStorage.getItem(TOKEN_KEY));
  const pollRef = useRef(null);

  const post = useCallback(async (payload) => {
    try {
      const resp = await fetch(relayUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return await resp.json();
    } catch {
      return null;
    }
  }, [relayUrl]);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      const token = tokenRef.current;
      if (!token) return;
      const resp = await post({ action: 'poll', session_token: token });
      if (resp?.ok && resp.messages?.length) {
        for (const msg of resp.messages) {
          if (msg.type === 'peer_connected') setPeerConnected(true);
          else if (msg.type === 'peer_disconnected') setPeerConnected(false);
          else if (msg.type === 'anki_state') setAnkiState(msg.state);
          else setMessages(prev => [...prev, msg]);
        }
      } else if (resp?.error === 'Invalid session') {
        localStorage.removeItem(TOKEN_KEY);
        tokenRef.current = null;
        setConnected(false);
        setNeedsPairing(true);
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      }
    }, POLL_INTERVAL);
  }, [post]);

  useEffect(() => {
    if (!relayUrl) return;
    let active = true;

    async function tryConnect() {
      const storedToken = localStorage.getItem(TOKEN_KEY);

      if (storedToken) {
        const resp = await post({ action: 'reconnect', session_token: storedToken });
        if (resp?.ok && active) {
          tokenRef.current = storedToken;
          setConnected(true);
          setPeerConnected(resp.peer_connected || false);
          setNeedsPairing(false);
          startPolling();
          return;
        }
      }

      const params = new URLSearchParams(window.location.search);
      const pairCode = params.get('pair');
      if (pairCode && active) {
        const resp = await post({ action: 'join_pair', pair_code: pairCode });
        if (resp?.ok && resp.session_token) {
          localStorage.setItem(TOKEN_KEY, resp.session_token);
          tokenRef.current = resp.session_token;
          setConnected(true);
          setPeerConnected(true);
          setNeedsPairing(false);
          window.history.replaceState({}, '', window.location.pathname);
          startPolling();
          return;
        }
      }

      if (active) setNeedsPairing(true);
    }

    tryConnect();

    return () => {
      active = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [relayUrl, post, startPolling]);

  const consumeMessages = useCallback(() => {
    const current = [...messages];
    setMessages([]);
    return current;
  }, [messages]);

  const send = useCallback((message) => {
    const token = tokenRef.current;
    if (!token) return;
    post({ action: 'send', session_token: token, message });
  }, [post]);

  return { connected, peerConnected, needsPairing, send, messages, consumeMessages, ankiState };
}
