// frontend/src/hooks/useFreeChat.js
import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * useFreeChat — card-independent chat hook for the Stapel overlay.
 *
 * Does NOT touch setSessions, currentSessionId, or any card context.
 * Messages are persisted to SQLite via saveDeckMessage / loadDeckMessages bridge calls.
 *
 * @param {object} bridge  — the Python bridge object
 * @param {function} onLoadingChange — called with (bool) when isLoading changes
 * @param {function} onCancelComplete — called when a cancel-ack payload is received
 */
export function useFreeChat({ bridge, onLoadingChange, onCancelComplete }) {
  const [messages, setMessages] = useState([]);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const isCancellingRef = useRef(false);
  const deckIdRef = useRef(null);          // current deck for persistence
  const messagesLoadedRef = useRef(false); // prevent double-loading

  const setIsLoadingWithCallback = useCallback((value) => {
    setIsLoading(value);
    if (onLoadingChange) onLoadingChange(value);
  }, [onLoadingChange]);

  // ── Persistence helpers ──────────────────────────────────────────
  const _saveDeckMsg = useCallback((message) => {
    const deckId = deckIdRef.current;
    if (!deckId) return;
    window.ankiBridge?.addMessage('saveDeckMessage', JSON.stringify({
      deckId,
      message: {
        id: String(message.id),
        text: message.text,
        sender: message.from === 'bot' ? 'assistant' : (message.from || 'user'),
        created_at: message.createdAt || new Date().toISOString(),
        source: 'tutor',
        steps: message.steps ? JSON.stringify(message.steps) : null,
        citations: message.citations ? JSON.stringify(message.citations) : null,
      },
    }));
  }, []);

  const loadForDeck = useCallback((deckId) => {
    if (!deckId) return;
    deckIdRef.current = deckId;
    // Only load from DB if we don't already have messages for this deck
    if (!messagesLoadedRef.current) {
      window.ankiBridge?.addMessage('loadDeckMessages', String(deckId));
    }
  }, []);

  // Handle deckMessagesLoaded event (called from App.jsx ankiReceive)
  const handleDeckMessagesLoaded = useCallback((payload) => {
    if (messagesLoadedRef.current) return; // already loaded
    const msgs = (payload.messages || []).map(m => ({
      id: m.id || `db-${Date.now()}-${Math.random()}`,
      text: m.text,
      from: m.sender === 'assistant' ? 'bot' : (m.sender || 'user'),
      createdAt: m.created_at,
      citations: m.citations ? (typeof m.citations === 'string' ? JSON.parse(m.citations) : m.citations) : {},
    }));
    if (msgs.length > 0) {
      setMessages(msgs);
    }
    messagesLoadedRef.current = true;
  }, []);

  // Exposed: set isCancelling before calling bridge.cancelRequest()
  const startCancel = useCallback(() => {
    isCancellingRef.current = true;
  }, []);

  const handleSend = useCallback((text, mode = 'compact') => {
    if (!text?.trim() || isLoading) return;

    // Add user message immediately
    const userMsg = { from: 'user', text, id: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    _saveDeckMsg(userMsg);
    setIsLoadingWithCallback(true);
    setStreamingMessage('');

    // Send to Python — no card context (null)
    if (bridge?.sendMessage) {
      bridge.sendMessage(JSON.stringify({ text, mode, cardContext: null, isFreeChat: true }));
    }
  }, [bridge, isLoading, setIsLoadingWithCallback, _saveDeckMsg]);

  // NOTE: streamingMessage intentionally omitted from deps — read via setStreamingMessage(prev=>) instead
  const handleAnkiReceive = useCallback((payload) => {
    // Drop section-related payloads — free chat has no concept of sections
    if (payload.type === 'sectionTitleGenerated') return;

    if (payload.type === 'loading') {
      setIsLoadingWithCallback(payload.loading ?? true);
      return;
    }

    if (payload.type === 'streaming') {
      setStreamingMessage(prev => prev + (payload.chunk || payload.message || ''));
      return;
    }

    if (payload.type === 'bot') {
      if (isCancellingRef.current) {
        // This is the cancel-ack — close without adding message
        isCancellingRef.current = false;
        setStreamingMessage('');
        setIsLoadingWithCallback(false);
        if (onCancelComplete) onCancelComplete();
        return;
      }
      // Normal bot response — use functional updater to read accumulated streamingMessage
      // without a stale closure
      setStreamingMessage(prev => {
        const botText = prev || payload.message || '';
        const botMsg = { from: 'bot', text: botText, id: Date.now(), citations: payload.citations || {} };
        setMessages(msgs => [...msgs, botMsg]);
        _saveDeckMsg(botMsg);
        return ''; // clear streaming
      });
      setIsLoadingWithCallback(false);
      return;
    }

    if (payload.type === 'error') {
      setMessages(prev => [
        ...prev,
        { from: 'bot', text: `Fehler: ${payload.message}`, id: Date.now(), isError: true }
      ]);
      setStreamingMessage('');
      setIsLoadingWithCallback(false);
      return;
    }

    // All other payload types (ai_state, rag_sources, etc.) — silently ignore
  }, [setIsLoadingWithCallback, onCancelComplete]);  // streamingMessage intentionally omitted

  return {
    messages,
    streamingMessage,
    isLoading,
    handleSend,
    handleAnkiReceive,
    handleDeckMessagesLoaded,
    startCancel,
    loadForDeck,
    setMessages,
    resetMessages: useCallback(() => { setMessages([]); messagesLoadedRef.current = false; }, []),
  };
}
