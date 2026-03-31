import { useState, useEffect, useRef, useCallback } from 'react';

const POLL_INTERVAL = 500;
const RECONNECT_DELAY = 3000;

export default function useRemoteSocket(relayUrl, chatId, initData) {
  const [connected, setConnected] = useState(false);
  const [peerConnected, setPeerConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const pollRef = useRef(null);

  const post = useCallback(async (payload) => {
    try {
      const resp = await fetch(relayUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, chat_id: chatId, client: 'miniapp', init_data: initData }),
      });
      return await resp.json();
    } catch {
      return null;
    }
  }, [relayUrl, chatId, initData]);

  useEffect(() => {
    if (!relayUrl || !chatId) return;
    let active = true;

    async function register() {
      const resp = await post({ action: 'register' });
      if (resp?.ok && active) {
        setConnected(true);
        setPeerConnected(resp.peer_connected || false);
        startPolling();
      } else if (active) {
        setTimeout(register, RECONNECT_DELAY);
      }
    }

    function startPolling() {
      pollRef.current = setInterval(async () => {
        if (!active) return;
        const resp = await post({ action: 'poll' });
        if (resp?.ok && resp.messages?.length) {
          for (const msg of resp.messages) {
            if (msg.type === 'peer_connected') setPeerConnected(true);
            else if (msg.type === 'peer_disconnected') setPeerConnected(false);
            else setMessages(prev => [...prev, msg]);
          }
        }
      }, POLL_INTERVAL);
    }

    register();

    return () => {
      active = false;
      if (pollRef.current) clearInterval(pollRef.current);
      post({ action: 'disconnect' });
      setConnected(false);
    };
  }, [relayUrl, chatId, post]);

  const consumeMessages = useCallback(() => {
    const current = [...messages];
    setMessages([]);
    return current;
  }, [messages]);

  const send = useCallback((message) => {
    post({ action: 'send', message });
  }, [post]);

  return { connected, peerConnected, send, messages, consumeMessages };
}
