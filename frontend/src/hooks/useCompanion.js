// frontend/src/hooks/useCompanion.js
import { useState, useRef, useCallback } from 'react';

const MAX_HISTORY = 10;
const MOOD_REGEX = /^\{"mood":"([a-z]+)"\}\n?/;
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
- Der Rest nach der JSON-Zeile ist deine eigentliche Nachricht`;

export function useCompanion({ onMood, onBubble }) {
  const [isLoading, setIsLoading] = useState(false);
  const historyRef = useRef([]); // [{role:'user'|'assistant', content:string}]
  const bufferRef = useRef(''); // accumulates stream chunks for mood-prefix parsing

  const send = useCallback((text, surfaceContext = '') => {
    if (!text.trim()) return;

    const contextNote = surfaceContext ? `[Kontext: ${surfaceContext}]\n` : '';
    const fullText = contextNote + text;

    // Add to history (keep last MAX_HISTORY exchanges = MAX_HISTORY*2 messages)
    historyRef.current = [
      ...historyRef.current.slice(-(MAX_HISTORY - 1) * 2),
      { role: 'user', content: fullText },
    ];

    setIsLoading(true);
    onMood?.('thinking');

    if (window.ankiBridge) {
      window.ankiBridge.addMessage('companionChat', {
        systemPrompt: COMPANION_SYSTEM_PROMPT,
        history: historyRef.current.slice(0, -1), // all but the current message
        message: fullText,
      });
    }
  }, [onMood]);

  // Called from App.jsx when ankiReceive gets companionChunk
  const handleChunk = useCallback((chunk, done) => {
    bufferRef.current += chunk;

    const match = bufferRef.current.match(MOOD_REGEX);
    if (match) {
      const moodKey = match[1];
      onMood?.(moodKey);
      const textAfterMood = bufferRef.current.replace(MOOD_REGEX, '');
      if (textAfterMood) onBubble?.(textAfterMood);
    }

    if (done) {
      // Store assistant reply in history (without mood prefix)
      const text = bufferRef.current.replace(MOOD_REGEX, '').trim();
      if (text) {
        historyRef.current = [...historyRef.current, { role: 'assistant', content: text }];
        // Keep history bounded
        if (historyRef.current.length > MAX_HISTORY * 2) {
          historyRef.current = historyRef.current.slice(-MAX_HISTORY * 2);
        }
      }
      bufferRef.current = '';
      setIsLoading(false);
    }
  }, [onMood, onBubble]);

  const clearHistory = useCallback(() => {
    historyRef.current = [];
    bufferRef.current = '';
  }, []);

  return { send, handleChunk, isLoading, clearHistory };
}
