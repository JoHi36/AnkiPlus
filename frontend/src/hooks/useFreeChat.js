// frontend/src/hooks/useFreeChat.js
import { useState, useRef, useCallback } from 'react';

/**
 * useFreeChat — card-independent chat hook for the Stapel overlay.
 *
 * Does NOT touch setSessions, currentSessionId, or any card context.
 * All state is RAM-only (cleared on app restart).
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

  const setIsLoadingWithCallback = useCallback((value) => {
    setIsLoading(value);
    if (onLoadingChange) onLoadingChange(value);
  }, [onLoadingChange]);

  // Exposed: set isCancelling before calling bridge.cancelRequest()
  const startCancel = useCallback(() => {
    isCancellingRef.current = true;
  }, []);

  const handleSend = useCallback((text, mode = 'compact') => {
    if (!text?.trim() || isLoading) return;

    // Add user message immediately
    setMessages(prev => [...prev, { from: 'user', text, id: Date.now() }]);
    setIsLoadingWithCallback(true);
    setStreamingMessage('');

    // Send to Python — no card context (null)
    if (bridge?.sendMessage) {
      bridge.sendMessage(JSON.stringify({ text, mode, cardContext: null, isFreeChat: true }));
    }
  }, [bridge, isLoading, setIsLoadingWithCallback]);

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
        setMessages(msgs => [
          ...msgs,
          { from: 'bot', text: botText, id: Date.now(), citations: payload.citations || {} }
        ]);
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
    startCancel,
    resetMessages: () => setMessages([]),
  };
}
