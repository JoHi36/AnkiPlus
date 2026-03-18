// frontend/src/components/MascotShell.jsx
import React, { useState, useCallback } from 'react';
import MascotCharacter from './MascotCharacter';
import CompanionCard from './CompanionCard';

/**
 * MascotShell — the fixed-position dock strip containing Plusi + CompanionCard.
 *
 * Renders itself at position:fixed bottom-left, spanning to the right.
 * Both Plusi and the CompanionCard share the dock row.
 *
 * Props:
 *   mood: string          — current mood key
 *   active: bool          — companion mode on (blue glow on Plusi)
 *   isThinking: bool      — show thinking dots in CompanionCard
 *   replyText: string|null — reply text to show in CompanionCard
 *   onClick: fn           — called on Plusi click
 *   enabled: bool         — if false, renders nothing
 */
export default function MascotShell({ mood = 'neutral', active, isThinking, replyText, onClick, enabled }) {
  const [tapKey, setTapKey] = useState(0);

  const handleClick = useCallback(() => {
    setTapKey(k => k + 1);
    onClick?.();
  }, [onClick]);

  if (!enabled) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 104,       // just above the chat input bar
        left: 12,
        right: 16,
        zIndex: 60,
        display: 'flex',
        alignItems: 'flex-start',  // card top-aligns with Plusi's top
        gap: 9,
        pointerEvents: 'none',  // clicks pass through the empty dock area
      }}
    >
      {/* Plusi — clickable */}
      <div
        onClick={handleClick}
        style={{ pointerEvents: 'auto', cursor: 'pointer', userSelect: 'none' }}
        title={active ? 'Companion-Modus aktiv (klicken zum Beenden)' : 'Companion-Modus starten'}
      >
        <MascotCharacter
          mood={mood}
          size={48}
          tapKey={tapKey}
          active={active}
          isThinking={isThinking}
          isReplying={!isThinking && !!replyText}
        />
      </div>

      {/* CompanionCard — display only, no pointer events */}
      <CompanionCard
        isThinking={isThinking}
        text={replyText}
        visible={active}
      />
    </div>
  );
}
