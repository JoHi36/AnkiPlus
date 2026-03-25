import React, { useState, useEffect, useRef } from 'react';
import MascotCharacter from './MascotCharacter';

const EVENT_REACTIONS = {
  card_correct:  { text: 'Richtig! ✨', mood: 'happy' },
  card_wrong:    { text: 'nächstes mal 💪', mood: 'empathy' },
  streak_5:     { text: 'Super, 5 richtig! 🔥', mood: 'happy' },
  streak_10:    { text: '10er streak!! du bist on fire 🔥🔥', mood: 'excited' },
};

export default function MascotShell({ mood = 'neutral', onPlusiAsk, onEvent, enabled = true }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [eventBubble, setEventBubble] = useState(null);
  const [tapKey, setTapKey] = useState(0);
  const eventTimerRef = useRef(null);
  const menuRef = useRef(null);

  // Auto-dismiss event bubble after 4s
  useEffect(() => {
    if (eventBubble) {
      eventTimerRef.current = setTimeout(() => setEventBubble(null), 4000);
      return () => clearTimeout(eventTimerRef.current);
    }
  }, [eventBubble]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  // Expose triggerEvent for parent
  useEffect(() => {
    if (onEvent) {
      onEvent.current = (eventType) => {
        const reaction = EVENT_REACTIONS[eventType];
        if (reaction && !menuOpen) {
          setEventBubble(reaction);
        }
      };
    }
  }, [onEvent, menuOpen]);

  if (!enabled) return null;

  const handleClick = () => {
    setTapKey(k => k + 1);
    setMenuOpen(prev => !prev);
    setEventBubble(null);
  };

  const handlePlusiAsk = () => {
    setMenuOpen(false);
    onPlusiAsk?.();
  };

  const animClass = mood === 'happy' || mood === 'excited' ? 'plusi-dock-bounce'
    : mood === 'empathy' ? 'plusi-dock-droop'
    : 'plusi-dock-float';

  return (
    <>
      <style>{DOCK_CSS}</style>
      <div className={`plusi-dock ${animClass}`} ref={menuRef}>
        <div
          className="plusi-dock-char"
          onClick={handleClick}
          title={menuOpen ? 'Menü schließen' : 'Plusi-Menü'}
        >
          <MascotCharacter
            mood={eventBubble ? eventBubble.mood : mood}
            size={48}
            tapKey={tapKey}
            active={menuOpen}
          />
        </div>

        {menuOpen && (
          <div className="plusi-dock-menu">
            <div className="plusi-menu-item plusi-menu-accent" onClick={handlePlusiAsk}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <span>Plusi fragen</span>
            </div>
          </div>
        )}

        {!menuOpen && eventBubble && (
          <div className="plusi-dock-bubble">
            {eventBubble.text}
          </div>
        )}
      </div>
    </>
  );
}

const DOCK_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600&display=swap');

  .plusi-dock {
    position: fixed;
    bottom: var(--ds-space-2xl);
    left: var(--ds-space-2xl);
    z-index: 80;
    display: flex;
    align-items: flex-end;
    gap: 12px;
  }

  .plusi-dock-float  { animation: pd-float 3.5s ease-in-out infinite; }
  .plusi-dock-bounce { animation: pd-bounce 0.55s ease-in-out infinite alternate; }
  .plusi-dock-droop  { animation: pd-droop 4s ease-in-out infinite; }

  @keyframes pd-float  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
  @keyframes pd-bounce { 0%{transform:translateY(0)} 100%{transform:translateY(-6px)} }
  @keyframes pd-droop  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(2px)} }

  .plusi-dock-char {
    cursor: pointer;
    flex-shrink: 0;
    width: 48px;
  }

  .plusi-dock-menu,
  .plusi-dock-bubble {
    background: var(--ds-bg-frosted);
    border: 1px solid var(--ds-border-medium);
    border-radius: 10px;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    box-shadow: var(--ds-shadow-md);
    animation: pd-card-in 0.25s cubic-bezier(0.34,1.1,0.64,1);
    align-self: center;
  }
  @keyframes pd-card-in {
    0% { opacity: 0; transform: translateX(-4px) scale(0.96); }
    100% { opacity: 1; transform: translateX(0) scale(1); }
  }

  .plusi-dock-menu {
    padding: 3px;
    min-width: 130px;
  }

  .plusi-menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 7px;
    cursor: pointer;
    transition: background 0.15s;
    font-size: 12.5px;
    color: var(--ds-text-primary);
    font-family: -apple-system, sans-serif;
  }
  .plusi-menu-item:hover { background: var(--ds-hover-tint); }
  .plusi-menu-item svg { opacity: 0.4; flex-shrink: 0; }
  .plusi-menu-accent { color: var(--ds-accent); font-weight: 500; }
  .plusi-menu-accent svg { opacity: 0.65; color: var(--ds-accent); }

  .plusi-menu-sep {
    height: 1px;
    margin: 2px 6px;
    background: radial-gradient(ellipse at center, var(--ds-hover-tint) 0%, transparent 75%);
  }

  .plusi-dock-bubble {
    padding: 6px 11px;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 12.5px;
    color: var(--ds-text-primary);
    line-height: 1.45;
    background: color-mix(in srgb, var(--ds-accent) 5%, var(--ds-bg-frosted));
  }
`;
