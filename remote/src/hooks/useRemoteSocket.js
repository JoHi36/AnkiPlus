import { useState, useEffect, useRef, useCallback } from 'react';
import { pwaLog } from '../utils/pwaLogger';

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
      pwaLog('relay', `POST ${payload.action}`);
      const resp = await fetch(relayUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      pwaLog('relay', `${payload.action} → ${resp.status} ok=${data?.ok} ${data?.error || ''}`);
      return data;
    } catch (err) {
      pwaLog('relay', `${payload.action} FAILED: ${err.message}`);
      return null;
    }
  }, [relayUrl]);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pwaLog('poll', 'polling started');
    pollRef.current = setInterval(async () => {
      const token = tokenRef.current;
      if (!token) return;
      const resp = await post({ action: 'poll', session_token: token });
      if (resp?.ok && resp.messages?.length) {
        for (const msg of resp.messages) {
          pwaLog('poll', `msg: ${msg.type}`);
          if (msg.type === 'peer_connected') setPeerConnected(true);
          else if (msg.type === 'peer_disconnected') setPeerConnected(false);
          else if (msg.type === 'anki_state') setAnkiState(msg.state);
          else setMessages(prev => [...prev, msg]);
        }
      } else if (resp?.error === 'Invalid session') {
        pwaLog('poll', 'session invalid — clearing token');
        localStorage.removeItem(TOKEN_KEY);
        tokenRef.current = null;
        setConnected(false);
        setNeedsPairing(true);
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      }
    }, POLL_INTERVAL);
  }, [post]);

  useEffect(() => {
    if (!relayUrl) { pwaLog('socket', 'no relayUrl — skipping'); return; }
    let active = true;

    async function tryConnect() {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      const params = new URLSearchParams(window.location.search);
      const pairCode = params.get('pair');
      const urlToken = params.get('token');

      pwaLog('connect', `storedToken=${storedToken ? storedToken.substring(0, 8) + '...' : 'none'} pairCode=${pairCode || 'none'} urlToken=${urlToken ? 'yes' : 'none'}`);

      // Try stored token
      if (storedToken) {
        pwaLog('connect', 'trying stored token reconnect...');
        const resp = await post({ action: 'reconnect', session_token: storedToken });
        if (resp?.ok && active) {
          pwaLog('connect', `stored token OK — peer=${resp.peer_connected}`);
          tokenRef.current = storedToken;
          setConnected(true);
          setPeerConnected(resp.peer_connected || false);
          setNeedsPairing(false);
          startPolling();
          return;
        }
        pwaLog('connect', `stored token FAILED — ${resp?.error || 'no response'}`);
      }

      // Direct token from URL
      if (urlToken && active) {
        pwaLog('connect', 'trying URL token reconnect...');
        const resp = await post({ action: 'reconnect', session_token: urlToken });
        if (resp?.ok) {
          pwaLog('connect', 'URL token OK');
          localStorage.setItem(TOKEN_KEY, urlToken);
          tokenRef.current = urlToken;
          setConnected(true);
          setPeerConnected(resp.peer_connected || false);
          setNeedsPairing(false);
          window.history.replaceState({}, '', window.location.pathname);
          startPolling();
          return;
        }
        pwaLog('connect', `URL token FAILED — ${resp?.error || 'no response'}`);
      }

      // Pair code from QR scan
      if (pairCode && active) {
        pwaLog('connect', `trying join_pair code=${pairCode}...`);
        const resp = await post({ action: 'join_pair', pair_code: pairCode });
        pwaLog('connect', `join_pair result: ok=${resp?.ok} token=${resp?.session_token ? 'yes' : 'no'} error=${resp?.error || 'none'}`);
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

      pwaLog('connect', 'all methods failed → needsPairing=true');
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
