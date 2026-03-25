import React, { useState, useEffect, useRef, useCallback } from 'react';
import MascotCharacter from './MascotCharacter';

const EVENT_REACTIONS = {
  card_correct:  { text: 'Richtig! ✨', mood: 'happy' },
  card_wrong:    { text: 'nächstes mal 💪', mood: 'empathy' },
  streak_5:     { text: 'Super, 5 richtig! 🔥', mood: 'happy' },
  streak_10:    { text: '10er streak!! du bist on fire 🔥🔥', mood: 'excited' },
};

/** Max pupil displacement in SVG units */
const PUPIL_MAX_OFFSET = 2;
/** Mouse proximity threshold in px */
const PROXIMITY_RADIUS = 120;
/** Min pointer movement before drag starts (px) */
const DRAG_THRESHOLD = 8;
/** Spring-back cubic-bezier with overshoot */
const SPRING_CURVE = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
/** Shake detection: direction changes needed to trigger dizzy */
const SHAKE_THRESHOLD = 6;
/** Shake detection window (ms) */
const SHAKE_WINDOW = 1000;

export default function MascotShell({ mood = 'neutral', onEvent, enabled = true }) {
  const [eventBubble, setEventBubble] = useState(null);
  const [tapKey, setTapKey] = useState(0);
  const [overrideMood, setOverrideMood] = useState(null);

  const eventTimerRef = useRef(null);
  const dockRef = useRef(null);
  const charRef = useRef(null);
  const moodTimerRef = useRef(null);

  // Tap tracking
  const tapTimesRef = useRef([]);

  // Drag state (all ref-based to avoid re-renders during drag)
  const dragStateRef = useRef({
    active: false,        // currently dragging
    pending: false,       // pointer is down, waiting to see if it's a drag
    startX: 0,            // pointer start position
    startY: 0,
    startTime: 0,
    targetX: 0,           // target position (mouse)
    targetY: 0,
    lerpX: 0,             // lerped position (actual visual)
    lerpY: 0,
    placed: false,        // Plusi was placed at a custom position
    placedX: 0,           // custom position offset from home
    placedY: 0,
    // Shake detection
    velocities: [],       // recent velocity samples { vx, vy, t }
    lastMoveX: 0,
    lastMoveY: 0,
    dirChanges: [],       // timestamps of direction changes
  });
  const rafRef = useRef(null);

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
        if (reaction) setEventBubble(reaction);
      };
    }
  }, [onEvent]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (moodTimerRef.current) clearTimeout(moodTimerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ─── Eye tracking + proximity awareness ───────────────────────────
  useEffect(() => {
    if (!enabled) return;

    const handleMouseMove = (e) => {
      if (!dockRef.current || !charRef.current) return;
      if (dragStateRef.current.active || dragStateRef.current.pending) return;

      const rect = dockRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < PROXIMITY_RADIUS) {
        if (!isNearRef.current) {
          isNearRef.current = true;
          charRef.current?.setEyeScale?.(1.15);
        }
        const factor = Math.min(1, (PROXIMITY_RADIUS - dist) / PROXIMITY_RADIUS);
        const angle = Math.atan2(dy, dx);
        charRef.current?.setPupilOffset?.(
          Math.cos(angle) * PUPIL_MAX_OFFSET * factor,
          Math.sin(angle) * PUPIL_MAX_OFFSET * factor,
        );
      } else if (isNearRef.current) {
        isNearRef.current = false;
        charRef.current?.setEyeScale?.(1);
        charRef.current?.setPupilOffset?.(0, 0);
      }
    };

    document.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, [enabled]);

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
    const ds = dragStateRef.current;

    // If Plusi is placed elsewhere, tap returns it home
    if (ds.placed) {
      ds.placed = false;
      ds.placedX = 0;
      ds.placedY = 0;
      const dock = dockRef.current;
      if (dock) {
        dock.style.transition = `transform 0.6s ${SPRING_CURVE}`;
        dock.style.transform = 'translate(0, 0)';
        const cleanup = () => {
          dock.style.transition = '';
          dock.style.transform = '';
          dock.style.animationPlayState = '';
        };
        dock.addEventListener('transitionend', cleanup, { once: true });
        setTimeout(cleanup, 700);
      }
      setTempMood('happy', 2000);
      return;
    }

    setTapKey((k) => k + 1);
    setEventBubble(null);

    const now = Date.now();
    tapTimesRef.current.push(now);
    tapTimesRef.current = tapTimesRef.current.filter((t) => now - t < 3000);

    const tapsIn2s = tapTimesRef.current.filter((t) => now - t < 2000).length;
    const tapsIn3s = tapTimesRef.current.length;

    if (tapsIn3s >= 5) {
      setTempMood('frustrated', 4000);
    } else if (tapsIn2s >= 3) {
      setTempMood('annoyed', 3000);
    }
  }, [setTempMood]);

  // ─── Drag & Drop with physics ───────────────────────────────────
  const handlePointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();

    const ds = dragStateRef.current;
    ds.pending = true;
    ds.active = false;
    ds.startX = e.clientX;
    ds.startY = e.clientY;
    ds.startTime = Date.now();
    ds.targetX = 0;
    ds.targetY = 0;
    ds.lerpX = ds.placed ? ds.placedX : 0;
    ds.lerpY = ds.placed ? ds.placedY : 0;
    ds.velocities = [];
    ds.dirChanges = [];
    ds.lastMoveX = 0;
    ds.lastMoveY = 0;

    const dock = dockRef.current;

    const startDrag = () => {
      ds.active = true;
      ds.pending = false;
      setOverrideMood('surprised');

      dock.style.transition = 'none';
      dock.style.animationPlayState = 'paused';

      // Start lerp loop
      const lerpLoop = () => {
        const lerp = 0.25;
        ds.lerpX += (ds.targetX - ds.lerpX) * lerp;
        ds.lerpY += (ds.targetY - ds.lerpY) * lerp;
        dock.style.transform = `translate(${ds.lerpX}px, ${ds.lerpY}px)`;
        rafRef.current = requestAnimationFrame(lerpLoop);
      };
      rafRef.current = requestAnimationFrame(lerpLoop);
    };

    const onMove = (ev) => {
      const moveX = ev.clientX - ds.startX + (ds.placed ? ds.placedX : 0);
      const moveY = ev.clientY - ds.startY + (ds.placed ? ds.placedY : 0);

      if (!ds.active && ds.pending) {
        const dist = Math.sqrt(
          Math.pow(ev.clientX - ds.startX, 2) +
          Math.pow(ev.clientY - ds.startY, 2)
        );
        if (dist > DRAG_THRESHOLD) {
          startDrag();
        } else {
          return;
        }
      }

      ds.targetX = moveX;
      ds.targetY = moveY;

      // Shake detection: track direction changes
      const now = Date.now();
      const dvx = moveX - ds.lastMoveX;
      const dvy = moveY - ds.lastMoveY;

      if (ds.velocities.length > 0) {
        const last = ds.velocities[ds.velocities.length - 1];
        // Direction change = sign flip in either axis
        if ((dvx * last.vx < 0 && Math.abs(dvx) > 3) ||
            (dvy * last.vy < 0 && Math.abs(dvy) > 3)) {
          ds.dirChanges.push(now);
        }
      }

      ds.velocities.push({ vx: dvx, vy: dvy, t: now });
      ds.lastMoveX = moveX;
      ds.lastMoveY = moveY;

      // Clean old entries
      ds.dirChanges = ds.dirChanges.filter(t => now - t < SHAKE_WINDOW);
      ds.velocities = ds.velocities.filter(v => now - v.t < 500);
    };

    const onUp = (ev) => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      const wasDragging = ds.active;
      ds.active = false;
      ds.pending = false;

      if (!wasDragging) {
        // It was a tap, not a drag
        handleTap();
        return;
      }

      // Check if shaken → dizzy mood
      const shaken = ds.dirChanges.length >= SHAKE_THRESHOLD;

      // Place Plusi at the drop position (use lerped pos for smoothness)
      const finalX = ds.lerpX;
      const finalY = ds.lerpY;
      const isNearHome = Math.sqrt(finalX * finalX + finalY * finalY) < 30;

      if (isNearHome) {
        // Snap back to home
        dock.style.transition = `transform 0.5s ${SPRING_CURVE}`;
        dock.style.transform = 'translate(0, 0)';
        ds.placed = false;
        ds.placedX = 0;
        ds.placedY = 0;
      } else {
        // Stay at drop position
        dock.style.transition = `transform 0.3s ${SPRING_CURVE}`;
        dock.style.transform = `translate(${finalX}px, ${finalY}px)`;
        ds.placed = true;
        ds.placedX = finalX;
        ds.placedY = finalY;
      }

      const cleanup = () => {
        dock.style.transition = '';
        if (!ds.placed) {
          dock.style.transform = '';
        }
        dock.style.animationPlayState = ds.placed ? 'paused' : '';
      };
      dock.addEventListener('transitionend', cleanup, { once: true });
      setTimeout(cleanup, 600);

      // Mood reaction
      if (shaken) {
        setTempMood('worried', 5000);
      } else {
        setOverrideMood(null);
      }
    };

    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerup', onUp);
  }, [handleTap, setTempMood]);

  if (!enabled) return null;

  const effectiveMood = overrideMood || (eventBubble ? eventBubble.mood : mood);
  const animClass = dragStateRef.current.active || dragStateRef.current.placed
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
          onPointerDown={handlePointerDown}
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

        {!dragStateRef.current.active && eventBubble && (
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
