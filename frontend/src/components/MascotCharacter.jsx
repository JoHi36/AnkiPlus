import { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import '@shared/plusi-renderer.js';

// isThinking and isReplying props are intentionally dropped.
// The old component used them for animation overrides — the new renderer
// handles all animation internally via the mood prop.
const MascotCharacter = forwardRef(function MascotCharacter(
  { mood = 'neutral', size = 52, tapKey = 0, active = false, integrity = 0.7 },
  ref
) {
  const containerRef = useRef(null);
  const plusiRef = useRef(null);
  const prevTapRef = useRef(tapKey);
  const basePupilsRef = useRef([]);
  const sideRef = useRef(null); // tracks createPlusiSide instance when in side view

  function cachePupilBases() {
    if (!containerRef.current) return;
    const pupils = containerRef.current.querySelectorAll(
      '.plusi-face ellipse[fill="#1a1a1a"]'
    );
    basePupilsRef.current = Array.from(pupils).map((el) => ({
      el,
      cx: parseFloat(el.getAttribute('cx')),
      cy: parseFloat(el.getAttribute('cy')),
    }));
    // Add smooth transition for pupil tracking
    pupils.forEach((el) => {
      el.style.transition = 'cx 0.15s ease-out, cy 0.15s ease-out';
    });
  }

  useEffect(() => {
    if (!containerRef.current) return;
    plusiRef.current = window.createPlusi(containerRef.current, {
      mood, size, animated: true, integrity
    });
    // Cache bases after initial render
    requestAnimationFrame(() => cachePupilBases());
    return () => {
      if (plusiRef.current) plusiRef.current.destroy();
    };
  }, [size]);

  useEffect(() => {
    if (plusiRef.current) {
      plusiRef.current.setMood(mood);
      // Re-cache after mood transition (250ms crossfade + buffer)
      setTimeout(() => cachePupilBases(), 350);
    }
  }, [mood]);

  useEffect(() => {
    if (plusiRef.current) plusiRef.current.setIntegrity(integrity);
  }, [integrity]);

  useEffect(() => {
    if (tapKey !== prevTapRef.current) {
      prevTapRef.current = tapKey;
      if (plusiRef.current) plusiRef.current.tap();
      // Re-cache after tap animation settles
      setTimeout(() => cachePupilBases(), 1600);
    }
  }, [tapKey]);

  // Expose imperative methods to parent via ref
  useImperativeHandle(ref, () => ({
    setPupilOffset(dx, dy) {
      basePupilsRef.current.forEach(({ el, cx, cy }) => {
        el.setAttribute('cx', String(cx + dx));
        el.setAttribute('cy', String(cy + dy));
      });
    },
    setEyeScale(scale) {
      if (!containerRef.current) return;
      const eyes = containerRef.current.querySelectorAll(
        '.plusi-face ellipse[fill="white"]'
      );
      eyes.forEach((el) => {
        el.style.transition = 'transform 0.3s ease';
        el.style.transformOrigin = `${el.getAttribute('cx')}px ${el.getAttribute('cy')}px`;
        el.style.transform = scale !== 1 ? `scale(${scale})` : '';
      });
    },
    getContainer() {
      return containerRef.current;
    },
    setSideView(flip) {
      // Destroy front-view animation engine
      if (plusiRef.current) {
        plusiRef.current.destroy();
        plusiRef.current = null;
      }
      // Render static side SVG
      if (containerRef.current) {
        sideRef.current = window.createPlusiSide(containerRef.current, {
          size, integrity, flip
        });
      }
    },
    setFrontView() {
      // Destroy side view
      if (sideRef.current) {
        sideRef.current.destroy();
        sideRef.current = null;
      }
      // Recreate front view with animation
      if (containerRef.current) {
        plusiRef.current = window.createPlusi(containerRef.current, {
          mood, size, animated: true, integrity
        });
        requestAnimationFrame(() => cachePupilBases());
      }
    },
    getSideNubs() {
      if (sideRef.current) return sideRef.current.getNubs();
      return null;
    },
    /** Swap mood without crossfade — for physics animation */
    setMoodInstant(newMood) {
      if (plusiRef.current) plusiRef.current.setMoodInstant(newMood);
    },
  }));

  const glowStyle = active ? { filter: 'drop-shadow(0 0 6px var(--ds-accent-50))' } : {};

  return <div ref={containerRef} style={{ display: 'inline-block', ...glowStyle }} />;
});

export default MascotCharacter;
