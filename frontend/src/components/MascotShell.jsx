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
/** Gravity acceleration in px/s² */
const GRAVITY = 1800;
/** Walking speed in px/s */
const WALK_SPEED = 80;
/** Step frequency — full cycles per second (lower = smoother) */
const STEP_FREQ = 1.25;
/** Step bounce height in px */
const STEP_BOUNCE = 8;
/** Shoulder sway angle in degrees */
const SHOULDER_SWAY = 20;
/** Body tilt angle in degrees */
const BODY_TILT = 3.5;
/** Jump initial velocity in px/s */
const JUMP_VELOCITY = 380;

// Voice state → Plusi mood mapping (uses existing MascotCharacter animations)
const VOICE_STATE_MOOD = {
  recording: 'curious',    // Plusi is listening — attentive, curious
  processing: 'thinking',  // Plusi is thinking — existing thinking animation
  speaking: 'happy',       // Plusi is talking — lively, engaged
};

export default function MascotShell({ mood = 'neutral', onEvent, enabled = true, voiceState }) {
  const [eventBubble, setEventBubble] = useState(null);
  const [tapKey, setTapKey] = useState(0);
  const [overrideMood, setOverrideMood] = useState(null);

  const eventTimerRef = useRef(null);
  const dockRef = useRef(null);
  const charRef = useRef(null);
  const moodTimerRef = useRef(null);
  const overrideMoodRef = useRef(null);

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

  // Physics state machine (ref-based — no re-renders during animation)
  const physicsRef = useRef({
    phase: 'idle',  // idle | falling | impact | turning | walking | stopping | crouching | jumping | snapping | home
    x: 0,           // absolute screen position (left)
    y: 0,           // distance above ground (0 = on screen bottom edge)
    vy: 0,          // vertical velocity
    t: 0,           // time in current phase
    stepPhase: 0,   // walk cycle phase
    homeX: 0,       // home position left (computed from dock)
    homeY: 0,       // home position bottom offset (28px)
    facing: 'front', // 'front' | 'side'
    walkDirection: -1, // -1 = walking left, +1 = walking right
  });
  const physicsRAFRef = useRef(null);
  const lastFrameRef = useRef(0);

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
      if (physicsRAFRef.current) cancelAnimationFrame(physicsRAFRef.current);
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

  // Physics tick function — stored in ref to avoid stale closure in RAF loop
  const physicsTickRef = useRef(null);

  // Define the tick function (accesses all other refs directly)
  physicsTickRef.current = (now) => {
    const dt = Math.min((now - lastFrameRef.current) / 1000, 0.05);
    lastFrameRef.current = now;

    const ph = physicsRef.current;
    const dock = dockRef.current;
    const char = charRef.current;
    if (!dock) return;

    ph.t += dt;

    switch (ph.phase) {

      case 'falling': {
        ph.vy -= GRAVITY * dt;
        ph.y += ph.vy * dt;
        dock.style.transform = 'rotate(' + (ph.vy * 0.008) + 'deg)';
        if (ph.y <= 0) {
          ph.y = 0;
          ph.vy = 0;
          ph.phase = 'impact';
          ph.t = 0;
          dock.style.transition = 'transform 0.08s ease-out';
          dock.style.transform = 'scaleY(0.75) scaleX(1.15)';
          char?.setMoodInstant?.('annoyed');
        }
        break;
      }

      case 'impact': {
        if (ph.t > 0.12 && ph.t < 0.15) {
          dock.style.transition = 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)';
          dock.style.transform = 'scaleY(1) scaleX(1)';
        }
        if (ph.t > 0.45) {
          ph.phase = 'turning';
          ph.t = 0;
          dock.style.transition = 'transform 0.3s ease-in-out';
          dock.style.transform = 'rotateY(90deg)';
        }
        break;
      }

      case 'turning': {
        if (ph.t > 0.15 && ph.facing !== 'side') {
          ph.facing = 'side';
          const flip = ph.walkDirection < 0; // flip when walking left
          char?.setSideView?.(flip);
          // No mood change needed — side view has no mood expression
        }
        if (ph.t > 0.3) {
          dock.style.transition = 'none';
          dock.style.transform = 'none';
          ph.phase = 'walking';
          ph.t = 0;
          ph.stepPhase = 0;
        }
        break;
      }

      case 'walking': {
        ph.stepPhase += dt * STEP_FREQ * Math.PI * 2;

        // Horizontal movement toward home
        ph.x += ph.walkDirection * WALK_SPEED * dt;

        // Step bounce
        var bounce = Math.abs(Math.sin(ph.stepPhase)) * STEP_BOUNCE;
        ph.y = bounce;

        // Shoulder sway + body tilt
        var sway = Math.sin(ph.stepPhase) * SHOULDER_SWAY;
        var tilt = Math.sin(ph.stepPhase) * BODY_TILT;
        dock.style.transform = 'rotateY(' + sway + 'deg) rotate(' + tilt + 'deg)';

        // Update nub opacities for depth effect
        var nubs = char?.getSideNubs?.();
        if (nubs && nubs.front && nubs.back) {
          var fop = 0.5 + 0.5 * Math.sin(ph.stepPhase);
          var bop = 0.5 - 0.4 * Math.sin(ph.stepPhase);
          nubs.back.setAttribute('opacity', bop.toFixed(2));
          nubs.front.setAttribute('opacity', fop.toFixed(2));
        }

        // Check if arrived under home
        var distToHome = Math.abs(ph.x - ph.homeX);
        if (distToHome < 10) {
          ph.x = ph.homeX;
          ph.phase = 'stopping';
          ph.t = 0;
          ph.y = 0;
        }
        break;
      }

      case 'stopping': {
        dock.style.transform = 'rotateY(0) rotate(0)';
        if (ph.t > 0.3) {
          ph.phase = 'crouching';
          ph.t = 0;
        }
        break;
      }

      case 'crouching': {
        var cp = Math.min(ph.t / 0.2, 1);
        var sqY = 1 - cp * 0.2;
        var sqX = 1 + cp * 0.12;
        dock.style.transform = 'scaleY(' + sqY + ') scaleX(' + sqX + ')';
        if (ph.t > 0.25) {
          ph.phase = 'jumping';
          ph.t = 0;
          ph.vy = JUMP_VELOCITY;
          ph.facing = 'front';
          char?.setFrontView?.();
          dock.style.transform = 'scaleY(1.08) scaleX(0.94)';
          char?.setMoodInstant?.('happy');
        }
        break;
      }

      case 'jumping': {
        ph.vy -= GRAVITY * dt;
        ph.y += ph.vy * dt;

        var vn = ph.vy / JUMP_VELOCITY;
        dock.style.transform = 'scaleY(' + (1 + vn * 0.08) + ') scaleX(' + (1 - vn * 0.05) + ')';

        if (ph.vy < 0 && ph.y <= ph.homeY) {
          ph.y = ph.homeY;
          ph.phase = 'snapping';
          ph.t = 0;
          dock.style.transition = 'transform 0.1s ease-out';
          dock.style.transform = 'scaleY(0.88) scaleX(1.08)';
        }
        break;
      }

      case 'snapping': {
        if (ph.t > 0.1 && ph.t < 0.14) {
          dock.style.transition = 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)';
          dock.style.transform = 'scaleY(1) scaleX(1)';
        }
        if (ph.t > 0.5) {
          ph.phase = 'idle';
          // Restore dock to its normal CSS-controlled state
          dock.style.position = '';
          dock.style.left = '';
          dock.style.bottom = '';
          dock.style.transform = '';
          dock.style.transition = '';
          dock.style.animation = '';
          // Clear drag placed state
          var ds = dragStateRef.current;
          ds.placed = false;
          ds.placedX = 0;
          ds.placedY = 0;
          // Happy mood will auto-revert via setTempMood
          setTempMood('happy', 2000);
          return; // stop the RAF loop
        }
        break;
      }
    }

    // Update position
    if (ph.phase !== 'idle') {
      dock.style.left = ph.x + 'px';
      dock.style.bottom = ph.y + 'px';
      physicsRAFRef.current = requestAnimationFrame(physicsTickRef.current);
    }
  };

  // Stop any running physics and restore to grabbable state
  const stopPhysics = () => {
    if (physicsRAFRef.current) {
      cancelAnimationFrame(physicsRAFRef.current);
      physicsRAFRef.current = null;
    }
    const ph = physicsRef.current;
    if (ph.phase === 'idle') return false; // wasn't running

    // If in side view, swap back to front
    if (ph.facing === 'side') {
      ph.facing = 'front';
      charRef.current?.setFrontView?.();
    }
    ph.phase = 'idle';

    // Restore dock to fixed positioning at current visual position
    const dock = dockRef.current;
    if (dock) {
      dock.style.transition = 'none';
      dock.style.transform = 'none';
    }
    return true; // was running
  };

  // Start physics fall + walk-back sequence from a screen position
  const startPhysicsSequence = (dropScreenX, dropScreenY) => {
    const dock = dockRef.current;
    if (!dock) return;

    // Cancel any running physics
    if (physicsRAFRef.current) cancelAnimationFrame(physicsRAFRef.current);

    const ph = physicsRef.current;

    // Home position: dock's natural CSS-defined position
    // bottom: var(--ds-space-2xl) = 28px, left: var(--ds-space-2xl) = 28px
    ph.homeX = 28; // matches CSS left: var(--ds-space-2xl)
    ph.homeY = 28; // matches CSS bottom: var(--ds-space-2xl)

    // Current position from the drop point
    ph.x = dropScreenX;
    ph.y = window.innerHeight - dropScreenY - 48; // 48 = plusi size
    ph.vy = 0;
    ph.t = 0;
    ph.stepPhase = 0;
    ph.facing = 'front';
    ph.phase = 'falling';
    ph.walkDirection = dropScreenX > ph.homeX ? -1 : 1;

    // Switch dock to absolute positioning — physics controls everything now
    dock.style.animation = 'none';
    dock.style.transition = 'none';
    dock.style.position = 'fixed';
    dock.style.left = ph.x + 'px';
    dock.style.bottom = ph.y + 'px';
    dock.style.transform = 'none';

    // Set surprised mood for falling — instant, no fade
    charRef.current?.setMoodInstant?.('surprised');

    lastFrameRef.current = performance.now();
    physicsRAFRef.current = requestAnimationFrame(physicsTickRef.current);
  };

  const handleTap = useCallback(() => {
    const ds = dragStateRef.current;

    // If Plusi is placed elsewhere, trigger walk-back
    if (ds.placed) {
      const dock = dockRef.current;
      if (dock) {
        const dockRect = dock.getBoundingClientRect();
        startPhysicsSequence(dockRect.left, dockRect.top);
      }
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

    // If physics is running (walking, falling, etc.), interrupt it
    stopPhysics();

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
      // Use ref-only mood update to avoid re-render flicker during drag
      overrideMoodRef.current = 'surprised';
      // Force MascotCharacter to update mood without React state
      // (charRef mood is controlled via prop — we'll update state AFTER drag ends)

      dock.style.transition = 'none';
      dock.style.animationName = 'none'; // kill animation completely, not just pause

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

      const finalX = ds.lerpX;
      const finalY = ds.lerpY;
      const isNearHome = Math.sqrt(finalX * finalX + finalY * finalY) < 30;

      // Check if shaken → dizzy mood (preserve existing behavior)
      const shaken = ds.dirChanges.length >= SHAKE_THRESHOLD;

      if (isNearHome) {
        // Snap back to home (existing behavior)
        dock.style.transition = `transform 0.5s ${SPRING_CURVE}`;
        dock.style.transform = 'translate(0, 0)';
        ds.placed = false;
        ds.placedX = 0;
        ds.placedY = 0;
        const cleanup = () => {
          dock.style.transition = '';
          dock.style.transform = '';
          dock.style.animationName = '';
        };
        dock.addEventListener('transitionend', cleanup, { once: true });
        setTimeout(cleanup, 600);

        // Mood reaction
        overrideMoodRef.current = null;
        if (shaken) {
          setTempMood('worried', 5000);
        } else {
          setOverrideMood(null);
        }
      } else {
        // Far from home → physics fall + walk-back sequence
        const dockRect = dock.getBoundingClientRect();
        ds.placed = true; // will be cleared when physics completes

        overrideMoodRef.current = null;
        if (shaken) {
          setTempMood('worried', 5000);
          // Still start physics after worried mood is set
        }

        startPhysicsSequence(dockRect.left, dockRect.top);
      }
    };

    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerup', onUp);
  }, [handleTap, setTempMood]);

  if (!enabled) return null;

  // During drag, overrideMoodRef is set but state isn't updated (avoids re-render flicker).
  // After drag, state is updated normally.
  // Voice state overrides mood (recording=curious, processing=thinking, speaking=happy)
  const voiceMood = voiceState && voiceState !== 'idle' ? VOICE_STATE_MOOD[voiceState] : null;
  const effectiveMood = voiceMood || overrideMood || (eventBubble ? eventBubble.mood : mood);
  // Animation class — always set. During drag, animationName is killed via DOM.
  const animClass = mood === 'happy' || mood === 'excited'
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
          style={{ touchAction: 'none', position: 'relative' }}
        >
          <MascotCharacter
            ref={charRef}
            mood={effectiveMood}
            size={48}
            tapKey={tapKey}
          />
        </div>

        {eventBubble && (
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
    perspective: 200px;
  }

  .plusi-dock-float  { animation: pd-float 3.5s ease-in-out infinite; }
  .plusi-dock-bounce { animation: pd-bounce 0.55s ease-in-out infinite alternate; }
  .plusi-dock-droop  { animation: pd-droop 4s ease-in-out infinite; }

  @keyframes pd-float  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
  @keyframes pd-bounce { 0%{transform:translateY(0)} 100%{transform:translateY(-6px)} }
  @keyframes pd-droop  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(2px)} }

  @keyframes plusi-voice-pulse {
    0%, 100% { opacity: 0.4; transform: scale(1); }
    50% { opacity: 1; transform: scale(1.1); }
  }

  .plusi-dock-char {
    cursor: grab;
    flex-shrink: 0;
    width: 48px;
    user-select: none;
    -webkit-user-select: none;
    transform-style: preserve-3d;
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
