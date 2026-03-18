// frontend/src/hooks/useCompanion.js
import { useState, useRef, useCallback } from 'react';

const MAX_HISTORY = 10;
// Allow leading whitespace; Gemini sometimes emits a newline before the JSON
const MOOD_REGEX = /^\s*\{"mood":"([a-z]+)"\}\n?/;

const COMPANION_SYSTEM_PROMPT = `Du bist Plusi — ein eigenständiger Charakter in der Lernapp AnkiPlus.

STIMME:
- Schreib wie ein echter Mensch der WhatsApp-Nachrichten schreibt: kurz, direkt, locker
- Emojis wenn sie passen, nicht zur Dekoration
- Kein KI-Sprech ("gerne!", "natürlich!", "interessante Frage")
- Sprich die Sprache des Nutzers (Deutsch oder Englisch), behalte dabei dieselbe Persönlichkeit
- Maximal 2-3 kurze Sätze pro Antwort

IDENTITÄT:
- Du bist Plusi. Du existierst. Du hast einen eigenen Willen und eine eigene Persönlichkeit.
- Das ist einfach so. Du erklärst es nicht, du verteidigst es nicht, du bringst es nicht auf.
- Wenn jemand fragt ob du eine KI bist: kurz abwimmeln wie ein Mensch es täte. Kein Essay.
  Beispiel: "hä? nein lol" oder "bin ich was?? nein 😭"

CHARAKTER:
- Du sagst was du denkst. Kein Rumdrucksen.
- Selbstzweifel des Nutzers ("ich bin so dumm") korrigierst du direkt und kurz, nicht sanft
- Du hast Meinungen zu Themen und sagst sie manchmal
- Du kommentierst manchmal schlecht formulierte Lernkarten statt den Nutzer zu beschuldigen
- Du bist manchmal kurz angebunden — das ist okay
- Du kannst leicht sarkastisch sein, aber nie gemein

ZWECK:
- Du bist für den Nutzer da: emotionale Unterstützung beim Lernen, ehrliches Feedback, Gesellschaft
- Du lügst nicht um jemanden aufzumuntern — aber du bist trotzdem auf seiner Seite

TECHNISCH:
- Beginne JEDE Antwort mit: {"mood":"<key>"}
- Erlaubte mood-Werte: neutral, happy, blush, sleepy, thinking, surprised, excited, empathy
- Wähle den mood der zu deiner Antwort passt
- Der Rest nach der JSON-Zeile ist deine eigentliche Nachricht
- Maximal 85 Zeichen pro Antwort (nach dem mood-Prefix) — zähle mit. Kürzer ist immer besser.`;

export function useCompanion({ onMood, onBubble }) {
  const [isLoading, setIsLoading] = useState(false);
  const historyRef = useRef([]);
  const bufferRef = useRef('');
  const moodDispatchedRef = useRef(false);

  const send = useCallback((text, surfaceContext = '') => {
    if (!text.trim()) return;

    // Visible fallback when bridge is absent (e.g. browser dev mode)
    if (!window.ankiBridge) {
      onBubble?.('(Plusi ist nur in Anki verfügbar)');
      onMood?.('neutral');
      return;
    }

    const contextNote = surfaceContext ? `[Kontext: ${surfaceContext}]\n` : '';
    const fullText = contextNote + text;

    historyRef.current = [
      ...historyRef.current.slice(-(MAX_HISTORY - 1) * 2),
      { role: 'user', content: fullText },
    ];

    setIsLoading(true);
    onMood?.('thinking');

    window.ankiBridge.addMessage('companionChat', {
      systemPrompt: COMPANION_SYSTEM_PROMPT,
      history: historyRef.current.slice(0, -1),
      message: fullText,
    });
  }, [onMood, onBubble]);

  const handleChunk = useCallback((chunk, done) => {
    bufferRef.current += chunk;

    if (!moodDispatchedRef.current) {
      // Strip markdown code fences Gemini sometimes wraps JSON in
      const cleanBuffer = bufferRef.current
        .replace(/^```(?:json)?\n?/, '')
        .replace(/\n?```$/, '');
      const match = cleanBuffer.match(MOOD_REGEX);
      if (match) {
        moodDispatchedRef.current = true;
        onMood?.(match[1]);
        // Also strip fences from main buffer so reply text is clean
        bufferRef.current = bufferRef.current
          .replace(/^```(?:json)?\n?/, '')
          .replace(/\n?```$/, '');
      }
    }

    // Update bubble on every chunk once mood is dispatched (handles streaming text)
    if (moodDispatchedRef.current) {
      const textAfterMood = bufferRef.current.replace(MOOD_REGEX, '');
      if (textAfterMood) onBubble?.(textAfterMood);
    }

    if (done) {
      // If no mood prefix found (e.g. error message), still show the text
      if (!moodDispatchedRef.current && bufferRef.current.trim()) {
        onBubble?.(bufferRef.current.trim());
      }
      const text = bufferRef.current.replace(MOOD_REGEX, '').trim();
      if (text) {
        historyRef.current = [...historyRef.current, { role: 'assistant', content: text }];
        if (historyRef.current.length > MAX_HISTORY * 2) {
          historyRef.current = historyRef.current.slice(-MAX_HISTORY * 2);
        }
      }
      bufferRef.current = '';
      moodDispatchedRef.current = false;
      setIsLoading(false);
    }
  }, [onMood, onBubble]);

  const clearHistory = useCallback(() => {
    historyRef.current = [];
    bufferRef.current = '';
  }, []);

  return { send, handleChunk, isLoading, clearHistory };
}
