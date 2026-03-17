// frontend/src/components/MascotShell.jsx
import React from 'react';
import MascotCharacter from './MascotCharacter';
import SpeechBubble from './SpeechBubble';

/**
 * MascotShell — wrapper that owns click handling and speech bubble.
 * Swap MascotCharacter for a Lottie source here in future without changing callers.
 *
 * Props:
 *   mood: string — current mood key
 *   bubbleText: string | null — text to show in speech bubble (clears after display)
 *   onBubbleDismiss: fn — called when bubble auto-dismisses
 *   active: bool — companion mode is on (show ring)
 *   onClick: fn — called on mascot click
 *   enabled: bool — if false, renders nothing
 */
export default function MascotShell({ mood = 'neutral', bubbleText, onBubbleDismiss, active, onClick, enabled }) {
  if (!enabled) return null;

  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        cursor: 'pointer',
        userSelect: 'none',
        padding: '4px',
        borderRadius: 12,
        transition: 'box-shadow 0.2s',
        boxShadow: active ? '0 0 0 2px #6366f1, 0 0 12px rgba(99,102,241,0.4)' : 'none',
      }}
      title={active ? 'Companion-Modus aktiv (klicken zum Beenden)' : 'Companion-Modus starten'}
    >
      <SpeechBubble text={bubbleText} onDismiss={onBubbleDismiss} />
      <MascotCharacter mood={mood} size={48} />
    </div>
  );
}
