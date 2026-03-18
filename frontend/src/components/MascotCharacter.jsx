// frontend/src/components/MascotCharacter.jsx
import React, { useRef, useEffect, useState } from 'react';

const MOODS = {
  neutral:   { bodyClass: 'mascot-float',    eyeClass: 'mascot-eye-normal',   pupilClass: 'mascot-pupil-wander', mouthClass: 'mascot-mouth-d',    colorClass: 'mascot-blue' },
  happy:     { bodyClass: 'mascot-bounce',   eyeClass: 'mascot-eye-normal',   pupilClass: 'mascot-pupil-up',    mouthClass: 'mascot-mouth-wide', colorClass: 'mascot-blue' },
  blush:     { bodyClass: 'mascot-wiggle',   eyeClass: 'mascot-eye-squint',   pupilClass: 'mascot-pupil-down',  mouthClass: 'mascot-mouth-tiny', colorClass: 'mascot-blush' },
  sleepy:    { bodyClass: 'mascot-sway',     eyeClass: 'mascot-eye-shut',     pupilClass: '',                   mouthClass: 'mascot-mouth-tiny', colorClass: 'mascot-grey' },
  thinking:  { bodyClass: 'mascot-tilt',     eyeClass: 'mascot-eye-normal',   pupilClass: 'mascot-pupil-think', mouthClass: 'mascot-mouth-d',    colorClass: 'mascot-blue' },
  surprised: { bodyClass: 'mascot-pop-once', eyeClass: 'mascot-eye-wide',     pupilClass: 'mascot-pupil-wide',  mouthClass: 'mascot-mouth-o',    colorClass: 'mascot-blue' },
  excited:   { bodyClass: 'mascot-dance',    eyeClass: 'mascot-eye-normal',   pupilClass: 'mascot-pupil-orbit', mouthClass: 'mascot-mouth-wide', colorClass: 'mascot-purple' },
  empathy:   { bodyClass: 'mascot-droop',    eyeClass: 'mascot-eye-heavy',    pupilClass: 'mascot-pupil-down',  mouthClass: 'mascot-mouth-sad',  colorClass: 'mascot-dark' },
};

const TRACK_RADIUS = 180;
const PUPIL_MAX = 1.3;
const TAP_KEYFRAMES = ['mascot-tap-pop', 'mascot-tap-shake', 'mascot-tap-squish'];

// Glow filter for active (companion-mode on) state
const ACTIVE_GLOW = 'drop-shadow(0 0 4px rgba(0,122,255,.95)) drop-shadow(0 0 10px rgba(0,122,255,.5))';

export default function MascotCharacter({ mood = 'neutral', size = 52, tapKey = 0, active = false, isThinking = false, isReplying = false }) {
  const m = MOODS[mood] || MOODS.neutral;
  const bodyRef = useRef(null);
  const prevTapKey = useRef(tapKey);
  const [pupilOffset, setPupilOffset] = useState(null);
  const [tapAnim, setTapAnim] = useState(null);

  // Mouth override: isThinking → neutral, isReplying → smile
  const mouthClass = isReplying
    ? 'mascot-mouth-smile'
    : isThinking
      ? 'mascot-mouth-d'
      : m.mouthClass;

  // Eye tracking
  useEffect(() => {
    const onMove = (e) => {
      if (!bodyRef.current) return;
      const rect = bodyRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < TRACK_RADIUS && dist > 0) {
        const ratio = Math.min(1, (TRACK_RADIUS - dist) / TRACK_RADIUS);
        const scale = PUPIL_MAX * ratio;
        setPupilOffset({ x: (dx / dist) * scale, y: (dy / dist) * scale });
      } else {
        setPupilOffset(null);
      }
    };
    document.addEventListener('mousemove', onMove, { passive: true });
    return () => document.removeEventListener('mousemove', onMove);
  }, []);

  // Tap reaction
  useEffect(() => {
    if (tapKey === prevTapKey.current) return;
    prevTapKey.current = tapKey;
    const anim = TAP_KEYFRAMES[tapKey % TAP_KEYFRAMES.length];
    setTapAnim(anim);
    const t = setTimeout(() => setTapAnim(null), 550);
    return () => clearTimeout(t);
  }, [tapKey]);

  const bodyAnim = tapAnim || m.bodyClass;

  const pupilStyle = pupilOffset && m.pupilClass
    ? { transform: `translate(${pupilOffset.x}px, ${pupilOffset.y}px)`, animation: 'none' }
    : undefined;

  return (
    <>
      <style>{MASCOT_CSS}</style>
      <div
        ref={bodyRef}
        className={`mascot-body ${bodyAnim} ${m.colorClass}`}
        style={{
          width: size,
          height: size,
          position: 'relative',
          filter: active ? ACTIVE_GLOW : 'none',
          transition: 'filter 0.4s ease',
        }}
      >
        <div className="mascot-ph" />
        <div className="mascot-pv" />
        <div className="mascot-face">
          <div className="mascot-eyes-row">
            <div className={`mascot-eye ${m.eyeClass}`}>
              {m.pupilClass && (
                <div
                  className={pupilOffset ? 'mascot-pupil' : `mascot-pupil ${m.pupilClass}`}
                  style={pupilStyle}
                />
              )}
            </div>
            <div className={`mascot-eye ${m.eyeClass}`} style={{ animationDelay: '0.3s' }}>
              {m.pupilClass && (
                <div
                  className={pupilOffset ? 'mascot-pupil' : `mascot-pupil ${m.pupilClass}`}
                  style={pupilStyle}
                />
              )}
            </div>
          </div>
          <div className={`mascot-mouth ${mouthClass}`} />
        </div>
      </div>
      <div className={`mascot-shadow ${m.bodyClass}`} />
    </>
  );
}

const MASCOT_CSS = `
  .mascot-body { position: relative; transition: opacity 0.3s; }

  /* ── Plus bars ── */
  .mascot-ph { position: absolute; height: 38.5%; border-radius: 3px; top: 30.7%; left: 0; width: 100%; }
  .mascot-pv { position: absolute; width: 38.5%; border-radius: 3px; top: 0; left: 30.7%; height: 100%; }

  /* ── Colors ── */
  .mascot-blue   .mascot-ph, .mascot-blue   .mascot-pv { background: #007AFF; }
  .mascot-grey   .mascot-ph, .mascot-grey   .mascot-pv { background: #4b5563; }
  .mascot-purple .mascot-ph, .mascot-purple .mascot-pv { background: #7c3aed; }
  .mascot-dark   .mascot-ph, .mascot-dark   .mascot-pv { background: #1d4ed8; filter: brightness(0.75); }
  .mascot-blush  .mascot-ph { background: linear-gradient(to bottom, #ef4444 0%, #007AFF 100%); }
  .mascot-blush  .mascot-pv { background: linear-gradient(to bottom, #ef4444 0%, #dc2626 30%, #007AFF 100%); }

  /* ── Face ── */
  .mascot-face {
    position: absolute; top: 30.7%; left: 30.7%;
    width: 38.5%; height: 38.5%; z-index: 3;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  }
  .mascot-eyes-row { display: flex; gap: 5px; }

  /* ── Eyes ── */
  .mascot-eye {
    width: 5px; height: 6px; background: white; border-radius: 50%;
    position: relative; overflow: hidden; flex-shrink: 0;
    transition: height 0.3s, border-radius 0.3s;
  }
  .mascot-eye-squint { height: 4px !important; }
  .mascot-eye-shut   { height: 2px !important; border-radius: 2px !important; background: #d1d5db !important; }
  .mascot-eye-wide   { height: 8px !important; width: 6px !important; }
  .mascot-eye-heavy  { height: 5px !important; }
  .mascot-eye-normal { animation: mascot-blink 5s ease-in-out infinite; }
  @keyframes mascot-blink { 0%,85%,100%{transform:scaleY(1)} 91%{transform:scaleY(0.05)} }

  /* ── Pupils ── */
  .mascot-pupil {
    position: absolute; width: 2.5px; height: 2.5px;
    background: #002a6e; border-radius: 50%; top: 1.5px; left: 1px;
    transition: transform 0.6s cubic-bezier(0.25,0.46,0.45,0.94);
  }
  .mascot-pupil-wander { animation: p-wander 6s ease-in-out infinite; }
  .mascot-pupil-up     { transform: translate(0,-1px); }
  .mascot-pupil-down   { transform: translate(0,1.5px); }
  .mascot-pupil-wide   { width: 3px; height: 3px; top: 2px; left: 1.5px; }
  .mascot-pupil-orbit  { animation: p-orbit 0.9s linear infinite; }

  /* Natural thinking eye movement — irregular 9s loop, not mechanical ping-pong */
  .mascot-pupil-think  { animation: mascot-eye-natural 9s ease-in-out infinite; }

  @keyframes p-wander { 0%,100%{transform:translate(0,0)} 25%{transform:translate(1px,0)} 50%{transform:translate(0,1px)} 75%{transform:translate(-1px,0)} }
  @keyframes p-orbit  { 0%{transform:translate(0,-1px)} 25%{transform:translate(1px,0)} 50%{transform:translate(0,1px)} 75%{transform:translate(-1px,0)} 100%{transform:translate(0,-1px)} }
  @keyframes mascot-eye-natural {
    0%   { transform: translate(0px, 0px); }
    8%   { transform: translate(-1.2px, -1.4px); }
    16%  { transform: translate(-1.2px, -1.4px); }
    24%  { transform: translate(1.3px, -1.2px);  }
    30%  { transform: translate(1.3px, -1.2px);  }
    38%  { transform: translate(0px, -1.5px);    }
    44%  { transform: translate(0px, -1.5px);    }
    52%  { transform: translate(-0.8px, -0.5px); }
    58%  { transform: translate(0px, 0px);       }
    72%  { transform: translate(0px, 0px);       }
    80%  { transform: translate(1px, -1.3px);    }
    86%  { transform: translate(-1.2px, -1.0px); }
    92%  { transform: translate(0px, -1.4px);    }
    100% { transform: translate(0px, 0px);       }
  }

  /* ── Mouths ── */
  .mascot-mouth { transition: all 0.3s; }
  .mascot-mouth-d     { width: 10px; height: 5px; background: #003a80; border-radius: 0 0 7px 7px; margin-top: 2px; }
  .mascot-mouth-smile { width: 11px; height: 5px; background: #003a80; border-radius: 0 0 8px 8px; margin-top: 1px; }
  .mascot-mouth-wide  { width: 13px; height: 7px; background: #003a80; border-radius: 0 0 9px 9px; margin-top: 2px; }
  .mascot-mouth-o     { width: 9px;  height: 8px; background: #002a6e; border-radius: 50%;          margin-top: 1px; }
  .mascot-mouth-tiny  { width: 6px;  height: 4px; background: #003a80; border-radius: 50%;          margin-top: 2px; }
  .mascot-mouth-sad   { width: 10px; height: 5px; background: #1e3a8a; border-radius: 7px 7px 0 0;  margin-top: 4px; }

  /* ── Body animations ── */
  .mascot-float    { animation: m-float 3.5s ease-in-out infinite; }
  .mascot-bounce   { animation: m-bounce 0.55s ease-in-out infinite alternate; }
  .mascot-wiggle   { animation: m-wiggle 1.2s ease-in-out infinite; }
  .mascot-sway     { animation: m-sway 5s ease-in-out infinite; }
  .mascot-tilt     { animation: m-tilt 3s ease-in-out infinite; }
  .mascot-pop-once { animation: m-pop-once 8s ease-in-out infinite; }
  .mascot-dance    { animation: m-dance 0.9s ease-in-out infinite; }
  .mascot-droop    { animation: m-droop 4s ease-in-out infinite; }

  /* ── Tap reactions (one-shot) ── */
  .mascot-tap-pop    { animation: m-tap-pop 0.5s cubic-bezier(0.36,0.07,0.19,0.97) both; }
  .mascot-tap-shake  { animation: m-tap-shake 0.45s ease both; }
  .mascot-tap-squish { animation: m-tap-squish 0.5s ease both; }

  @keyframes m-tap-pop    { 0%{transform:scale(1)} 30%{transform:scale(1.25) translateY(-6px)} 60%{transform:scale(0.92) translateY(-3px)} 80%{transform:scale(1.06) translateY(-5px)} 100%{transform:scale(1) translateY(0)} }
  @keyframes m-tap-shake  { 0%,100%{transform:rotate(0deg)} 20%{transform:rotate(-10deg)} 40%{transform:rotate(10deg)} 60%{transform:rotate(-8deg)} 80%{transform:rotate(8deg)} }
  @keyframes m-tap-squish { 0%{transform:scale(1,1)} 25%{transform:scale(1.3,0.75) translateY(4px)} 55%{transform:scale(0.85,1.2) translateY(-8px)} 75%{transform:scale(1.08,0.95) translateY(-4px)} 100%{transform:scale(1,1)} }

  @keyframes m-float    { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
  @keyframes m-bounce   { 0%{transform:translateY(0) scale(1,1)} 100%{transform:translateY(-9px) scale(1.04,0.97)} }
  @keyframes m-wiggle   { 0%,100%{transform:rotate(-4deg)} 50%{transform:rotate(4deg)} }
  @keyframes m-sway     { 0%,100%{transform:rotate(-5deg) translateY(0)} 50%{transform:rotate(5deg) translateY(-2px)} }
  @keyframes m-tilt     { 0%,100%{transform:rotate(-3deg) translateY(-2px)} 50%{transform:rotate(3deg) translateY(-5px)} }
  @keyframes m-pop-once { 0%{transform:scale(1) translateY(0)} 5%{transform:scale(1.13) translateY(-7px)} 10%{transform:scale(0.96) translateY(-11px)} 15%{transform:scale(1.02) translateY(-9px)} 20%{transform:scale(1) translateY(-8px)} 60%{transform:scale(1) translateY(-12px)} 100%{transform:scale(1) translateY(-8px)} }
  @keyframes m-dance    { 0%{transform:rotate(0deg) translateY(0)} 25%{transform:rotate(10deg) translateY(-8px) scale(1.05)} 50%{transform:rotate(0deg) translateY(-12px)} 75%{transform:rotate(-10deg) translateY(-8px) scale(1.05)} 100%{transform:rotate(0deg) translateY(0)} }
  @keyframes m-droop    { 0%,100%{transform:translateY(0) rotate(-1deg)} 50%{transform:translateY(3px) rotate(1deg)} }

  /* ── Shadow ── */
  .mascot-shadow { width: 32px; height: 4px; background: #007AFF15; border-radius: 50%; margin: 4px auto 0; }
  .mascot-shadow.mascot-float    { animation: s-float 3.5s ease-in-out infinite; }
  .mascot-shadow.mascot-bounce   { animation: s-bounce 0.55s ease-in-out infinite alternate; }
  .mascot-shadow.mascot-pop-once { animation: s-float 8s ease-in-out infinite; }
  @keyframes s-float  { 0%,100%{width:32px;opacity:.4} 50%{width:24px;opacity:.2} }
  @keyframes s-bounce { 0%{width:32px;opacity:.4} 100%{width:26px;opacity:.2} }
`;
