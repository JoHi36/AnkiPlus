import { useRef, useEffect } from 'react';
import '@shared/plusi-renderer.js';

// isThinking and isReplying props are intentionally dropped.
// The old component used them for animation overrides — the new renderer
// handles all animation internally via the mood prop.
export default function MascotCharacter({ mood = 'neutral', size = 52, tapKey = 0, active = false, integrity = 0.7 }) {
  const containerRef = useRef(null);
  const plusiRef = useRef(null);
  const prevTapRef = useRef(tapKey);

  useEffect(() => {
    if (!containerRef.current) return;
    plusiRef.current = window.createPlusi(containerRef.current, {
      mood, size, animated: true, integrity
    });
    return () => {
      if (plusiRef.current) plusiRef.current.destroy();
    };
  }, [size]);

  useEffect(() => {
    if (plusiRef.current) plusiRef.current.setMood(mood);
  }, [mood]);

  useEffect(() => {
    if (plusiRef.current) plusiRef.current.setIntegrity(integrity);
  }, [integrity]);

  useEffect(() => {
    if (tapKey !== prevTapRef.current) {
      prevTapRef.current = tapKey;
      if (plusiRef.current) plusiRef.current.tap();
    }
  }, [tapKey]);

  const glowStyle = active ? { filter: 'drop-shadow(0 0 6px rgba(10,132,255,0.5))' } : {};

  return <div ref={containerRef} style={{ display: 'inline-block', ...glowStyle }} />;
}
