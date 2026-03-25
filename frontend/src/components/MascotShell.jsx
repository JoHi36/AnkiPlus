import React, { useState, useEffect, useRef, useCallback } from 'react';
import MascotCharacter from './MascotCharacter';

const EVENT_REACTIONS = {
  card_correct:  { text: 'Richtig! \u2728', mood: 'happy' },
  card_wrong:    { text: 'n\u00e4chstes mal \ud83d\udcaa', mood: 'empathy' },
  streak_5:     { text: 'Super, 5 richtig! \ud83d\udd25', mood: 'happy' },
  streak_10:    { text: '10er streak!! du bist on fire \ud83d\udd25\ud83d\udd25', mood: 'excited' },
};

/** Max pupil displacement in SVG units */
const PUPIL_MAX_OFFSET = 2;
/** Mouse proximity threshold in px */
const PROXIMITY_RADIUS = 120;
/** Spring-back cubic-bezier with overshoot */
const SPRING_CURVE = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

export default function MascotShell({ mood = 'neutral', onEvent, enabled = true }) {
  const [eventBubble, setEventBubble] = useState(null);
  const [tapKey, setTapKey] = useState(0);
  const [overrideMood, setOverrideMood] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const eventTimerRef = useRef(null);
  const dockRef = useRef(null);
  const charRef = useRef(null);
  const moodTimerRef = useRef(null);

  // Tap tracking
  const tapTimesRef = useRef([]);

  // Drag state
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0 });
  const dragPosRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef(null);
  const lerpPosRef = useRef({ x: 0, y: 0 });

  // Proximity tracking
  const isNearRef = useRef(false);

  // Auto-dismiss event bubble after 4s
  useEffect(() => {
    if (eventBubble) {
      eventTimerRef.current = setTimeout(() => setEventBubble(null), 4000);
      return () => clearTimeout(eventTimerRef.current);
    }
  }, [eventBubble]);

  // Expose triggerEvent for parent
  useEffect(() => {
    if (onEvent) {
      onEvent.current = (eventType) => {
        const reaction = EVENT_REACTIONS[eventType];
        if (reaction) {
          setEventBubble(reaction);
        }
      };
    }
  }, [onEvent]);

  // Cleanup mood override timer
  useEffect(() => {
    return () => {
      if (moodTimerRef.current) clearTimeout(moodTimerRef.current);
    };
  }, []);

  // ─── Eye tracking + proximity awareness ───────────────────────────
  useEffect(() => {
    if (!enabled) return;

    const handleMouseMove = (e) => {
      if (!dockRef.current || !charRef.current || isDragging) return;

      const rect = dockRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < PROXIMITY_RADIUS) {
        // Proximity: widen eyes
        if (!isNearRef.current) {
          isNearRef.current = true;
          charRef.current.setEyeScale(1.15);
        }

        // Eye tracking: shift pupils toward cursor
        const factor = Math.min(1, (PROXIMITY_RADIUS - dist) / PROXIMITY_RADIUS);
        const angle = Math.atan2(dy, dx);
        const offsetX = Math.cos(angle) * PUPIL_MAX_OFFSET * factor;
        const offsetY = Math.sin(angle) * PUPIL_MAX_OFFSET * factor;
        charRef.current.setPupilOffset(offsetX, offsetY);
      } else {
        // Outside range: reset
        if (isNearRef.current) {
          isNearRef.current = false;
          charRef.current.setEyeScale(1);
          charRef.current.setPupilOffset(0, 0);
        }
      }
    };

    document.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, [enabled, isDragging]);

  // ─── Tap handling with personality ────────────────────────────────
  const setTempMood = useCallback((newMood, durationMs) => {
    if (moodTimerRef.current) clearTimeout(moodTimerRef.current);
    setOverrideMood(newMood);
    moodTimerRef.current = setTimeout(() => {
      setOverrideMood(null);
      moodTimerRef.current = null;
    }, durationMs);
  }, []);

  const handleTap = useCallback(() => {
    if (isDragging) return;

    setTapKey((k) => k + 1);
    setEventBubble(null);

    const now = Date.now();
    tapTimesRef.current.push(now);
    // Keep only taps from last 3s
    tapTimesRef.current = tapTimesRef.current.filter((t) => now - t < 3000);

    const recentTaps = tapTimesRef.current;
    const tapsIn2s = recentTaps.filter((t) => now - t < 2000).length;
    const tapsIn3s = recentTaps.length;

    if (tapsIn3s >= 5) {
      setTempMood('frustrated', 4000);
    } else if (tapsIn2s >= 3) {
      setTempMood('annoyed', 3000);
    }
  }, [isDragging, setTempMood]);

  // ─── Drag & Drop with spring physics ─────────────────────────────
  const handlePointerDown = useCallback(
    (e) => {
      if (e.button !== 0) return; // left click only
      e.preventDefault();

      const rect = dockRef.current.getBoundingClientRect();
      dragStartRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
      };
      lerpPosRef.current = { x: 0, y: 0 };
      dragPosRef.current = { x: 0, y: 0 };

      setIsDragging(true);
      setOverrideMood('surprised');

      // Apply drag styles immediately
      const dock = dockRef.current;
      dock.style.transition = 'none';
      dock.style.animationPlayState = 'paused';

      const onMove = (ev) => {
        dragPosRef.current = {
          x: ev.clientX - dragStartRef.current.mouseX,
          y: ev.clientY - dragStartRef.current.mouseY,
        };
      };

      const lerpLoop = () => {
        const lerp = 0.3;
        lerpPosRef.current.x += (dragPosRef.current.x - lerpPosRef.current.x) * lerp;
        lerpPosRef.current.y += (dragPosRef.current.y - lerpPosRef.current.y) * lerp;
        dock.style.transform = `translate(${lerpPosRef.current.x}px, ${lerpPosRef.current.y}px)`;
        rafRef.current = requestAnimationFrame(lerpLoop);
      };
      rafRef.current = requestAnimationFrame(lerpLoop);

      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);

        // Spring back with overshoot
        dock.style.transition = `transform 0.6s ${SPRING_CURVE}`;
        dock.style.transform = 'translate(0, 0)';

        const onTransitionEnd = () => {
          dock.removeEventListener('transitionend', onTransitionEnd);
          dock.style.transition = '';
          dock.style.transform = '';
          dock.style.animationPlayState = '';
          setIsDragging(false);
          setOverrideMood(null);
        };
        dock.addEventListener('transitionend', onTransitionEnd, { once: true });

        // Safety fallback if transitionend doesn't fire
        setTimeout(() => {
          dock.style.transition = '';
          dock.style.transform = '';
          dock.style.animationPlayState = '';
          setIsDragging(false);
          setOverrideMood(null);
        }, 800);
      };

      document.addEventListener('pointermove', onMove, { passive: true });
      document.addEventListener('pointerup', onUp);
    },
    []
  );

  // Distinguish tap from drag: only fire tap if pointer didn't move much
  const pointerStartRef = useRef({ x: 0, y: 0, time: 0 });

  const handlePointerDownWrapper = useCallback(
    (e) => {
      pointerStartRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
      handlePointerDown(e);
    },
    [handlePointerDown]
  );

  const handleClick = useCallback(
    (e) => {
      const { x, y, time } = pointerStartRef.current;
      const dx = Math.abs(e.clientX - x);
      const dy = Math.abs(e.clientY - y);
      const dt = Date.now() - time;
      // Only count as tap if pointer moved less than 5px and duration < 300ms
      if (dx < 5 && dy < 5 && dt < 300) {
        handleTap();
      }
    },
    [handleTap]
  );

  if (!enabled) return null;

  const effectiveMood = overrideMood || (eventBubble ? eventBubble.mood : mood);
  const animClass = isDragging
    ? ''
    : mood === 'happy' || mood === 'excited'
      ? 'plusi-dock-bounce'
      : mood === 'empathy'
        ? 'plusi-dock-droop'
        : 'plusi-dock-float';

  return (
    <>
      <style>{DOCK_CSS}</style>
      <div
        className={`plusi-dock ${animClass}`}
        ref={dockRef}
      >
        <div
          className="plusi-dock-char"
          onPointerDown={handlePointerDownWrapper}
          onClick={handleClick}
          title="Plusi"
          style={{ touchAction: 'none' }}
        >
          <MascotCharacter
            ref={charRef}
            mood={effectiveMood}
            size={48}
            tapKey={tapKey}
          />
        </div>

        {!isDragging && eventBubble && (
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
    will-change: transform;
  }

  .plusi-dock-float  { animation: pd-float 3.5s ease-in-out infinite; }
  .plusi-dock-bounce { animation: pd-bounce 0.55s ease-in-out infinite alternate; }
  .plusi-dock-droop  { animation: pd-droop 4s ease-in-out infinite; }

  @keyframes pd-float  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
  @keyframes pd-bounce { 0%{transform:translateY(0)} 100%{transform:translateY(-6px)} }
  @keyframes pd-droop  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(2px)} }

  .plusi-dock-char {
    cursor: grab;
    flex-shrink: 0;
    width: 48px;
    user-select: none;
    -webkit-user-select: none;
  }
  .plusi-dock-char:active {
    cursor: grabbing;
  }

  .plusi-dock-bubble {
    background: var(--ds-bg-frosted);
    border: 1px solid var(--ds-border-medium);
    border-radius: 10px;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    box-shadow: var(--ds-shadow-md);
    animation: pd-card-in 0.25s cubic-bezier(0.34,1.1,0.64,1);
    align-self: center;
    padding: 6px 11px;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 12.5px;
    color: var(--ds-text-primary);
    line-height: 1.45;
    background: color-mix(in srgb, var(--ds-accent) 5%, var(--ds-bg-frosted));
  }

  @keyframes pd-card-in {
    0% { opacity: 0; transform: translateX(-4px) scale(0.96); }
    100% { opacity: 1; transform: translateX(0) scale(1); }
  }
`;
