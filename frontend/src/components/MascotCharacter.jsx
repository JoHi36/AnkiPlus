// frontend/src/components/MascotCharacter.jsx
import React from 'react';

const MOODS = {
  neutral:   { bodyClass: 'mascot-float',    eyeClass: 'mascot-eye-normal',   pupilClass: 'mascot-pupil-wander', mouthClass: 'mascot-mouth-d',    colorClass: 'mascot-blue' },
  happy:     { bodyClass: 'mascot-bounce',   eyeClass: 'mascot-eye-normal',   pupilClass: 'mascot-pupil-up',    mouthClass: 'mascot-mouth-wide', colorClass: 'mascot-blue' },
  blush:     { bodyClass: 'mascot-wiggle',   eyeClass: 'mascot-eye-squint',   pupilClass: 'mascot-pupil-down',  mouthClass: 'mascot-mouth-tiny', colorClass: 'mascot-blush' },
  sleepy:    { bodyClass: 'mascot-sway',     eyeClass: 'mascot-eye-shut',     pupilClass: '',                   mouthClass: 'mascot-mouth-tiny', colorClass: 'mascot-grey' },
  thinking:  { bodyClass: 'mascot-tilt',     eyeClass: 'mascot-eye-normal',   pupilClass: 'mascot-pupil-dart',  mouthClass: 'mascot-mouth-d',    colorClass: 'mascot-blue' },
  surprised: { bodyClass: 'mascot-pop-once', eyeClass: 'mascot-eye-wide',     pupilClass: 'mascot-pupil-wide',  mouthClass: 'mascot-mouth-o',    colorClass: 'mascot-blue' },
  excited:   { bodyClass: 'mascot-dance',    eyeClass: 'mascot-eye-normal',   pupilClass: 'mascot-pupil-orbit', mouthClass: 'mascot-mouth-wide', colorClass: 'mascot-purple' },
  empathy:   { bodyClass: 'mascot-droop',    eyeClass: 'mascot-eye-heavy',    pupilClass: 'mascot-pupil-down',  mouthClass: 'mascot-mouth-sad',  colorClass: 'mascot-dark' },
};

export default function MascotCharacter({ mood = 'neutral', size = 52 }) {
  const m = MOODS[mood] || MOODS.neutral;

  return (
    <>
      <style>{MASCOT_CSS}</style>
      <div
        className={`mascot-body ${m.bodyClass} ${m.colorClass}`}
        style={{ width: size, height: size, position: 'relative' }}
      >
        {/* Horizontal bar — color applied via parent class selector in CSS */}
        <div className="mascot-ph" />
        {/* Vertical bar */}
        <div className="mascot-pv" />
        {/* Face */}
        <div className="mascot-face">
          <div className="mascot-eyes-row">
            <div className={`mascot-eye ${m.eyeClass}`}>
              {m.pupilClass && <div className={`mascot-pupil ${m.pupilClass}`} />}
            </div>
            <div className={`mascot-eye ${m.eyeClass}`} style={{ animationDelay: '0.3s' }}>
              {m.pupilClass && <div className={`mascot-pupil ${m.pupilClass}`} />}
            </div>
          </div>
          <div className={`mascot-mouth ${m.mouthClass}`} />
        </div>
      </div>
      {/* Shadow */}
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
    transition: transform 0.3s;
  }
  .mascot-pupil-wander { animation: p-wander 6s ease-in-out infinite; }
  .mascot-pupil-up     { transform: translate(0,-1px); }
  .mascot-pupil-down   { transform: translate(0,1.5px); }
  .mascot-pupil-dart   { animation: p-dart 1.5s ease-in-out infinite; }
  .mascot-pupil-wide   { width: 3px; height: 3px; top: 2px; left: 1.5px; }
  .mascot-pupil-orbit  { animation: p-orbit 0.9s linear infinite; }
  @keyframes p-wander { 0%,100%{transform:translate(0,0)} 25%{transform:translate(1px,0)} 50%{transform:translate(0,1px)} 75%{transform:translate(-1px,0)} }
  @keyframes p-dart   { 0%,100%{transform:translate(-1px,0)} 50%{transform:translate(1.5px,0)} }
  @keyframes p-orbit  { 0%{transform:translate(0,-1px)} 25%{transform:translate(1px,0)} 50%{transform:translate(0,1px)} 75%{transform:translate(-1px,0)} 100%{transform:translate(0,-1px)} }

  /* ── Mouths ── */
  .mascot-mouth { transition: all 0.3s; }
  .mascot-mouth-d    { width: 10px; height: 5px; background: #003a80; border-radius: 0 0 7px 7px; margin-top: 2px; }
  .mascot-mouth-wide { width: 13px; height: 7px; background: #003a80; border-radius: 0 0 9px 9px; margin-top: 2px; }
  .mascot-mouth-o    { width: 9px;  height: 8px; background: #002a6e; border-radius: 50%;          margin-top: 1px; }
  .mascot-mouth-tiny { width: 6px;  height: 4px; background: #003a80; border-radius: 50%;          margin-top: 2px; }
  .mascot-mouth-sad  { width: 10px; height: 5px; background: #1e3a8a; border-radius: 7px 7px 0 0;  margin-top: 4px; }

  /* ── Body animations ── */
  .mascot-float    { animation: m-float 3.5s ease-in-out infinite; }
  .mascot-bounce   { animation: m-bounce 0.55s ease-in-out infinite alternate; }
  .mascot-wiggle   { animation: m-wiggle 1.2s ease-in-out infinite; }
  .mascot-sway     { animation: m-sway 5s ease-in-out infinite; }
  .mascot-tilt     { animation: m-tilt 3s ease-in-out infinite; }
  .mascot-pop-once { animation: m-pop-once 8s ease-in-out infinite; }
  .mascot-dance    { animation: m-dance 0.9s ease-in-out infinite; }
  .mascot-droop    { animation: m-droop 4s ease-in-out infinite; }

  @keyframes m-float    { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
  @keyframes m-bounce   { 0%{transform:translateY(0) scale(1,1)} 100%{transform:translateY(-9px) scale(1.04,0.97)} }
  @keyframes m-wiggle   { 0%,100%{transform:rotate(-4deg)} 50%{transform:rotate(4deg)} }
  @keyframes m-sway     { 0%,100%{transform:rotate(-5deg) translateY(0)} 50%{transform:rotate(5deg) translateY(-2px)} }
  @keyframes m-tilt     { 0%,100%{transform:rotate(-3deg) translateY(-2px)} 50%{transform:rotate(3deg) translateY(-5px)} }
  @keyframes m-pop-once {
    0%{transform:scale(1) translateY(0)} 5%{transform:scale(1.13) translateY(-7px)}
    10%{transform:scale(0.96) translateY(-11px)} 15%{transform:scale(1.02) translateY(-9px)}
    20%{transform:scale(1) translateY(-8px)} 60%{transform:scale(1) translateY(-12px)}
    100%{transform:scale(1) translateY(-8px)}
  }
  @keyframes m-dance {
    0%{transform:rotate(0deg) translateY(0)} 25%{transform:rotate(10deg) translateY(-8px) scale(1.05)}
    50%{transform:rotate(0deg) translateY(-12px)} 75%{transform:rotate(-10deg) translateY(-8px) scale(1.05)}
    100%{transform:rotate(0deg) translateY(0)}
  }
  @keyframes m-droop { 0%,100%{transform:translateY(0) rotate(-1deg)} 50%{transform:translateY(3px) rotate(1deg)} }

  /* ── Shadow ── */
  .mascot-shadow {
    width: 32px; height: 4px; background: #007AFF15; border-radius: 50%;
    margin: 4px auto 0;
  }
  .mascot-shadow.mascot-float    { animation: s-float 3.5s ease-in-out infinite; }
  .mascot-shadow.mascot-bounce   { animation: s-bounce 0.55s ease-in-out infinite alternate; }
  .mascot-shadow.mascot-pop-once { animation: s-float 8s ease-in-out infinite; }
  @keyframes s-float  { 0%,100%{width:32px;opacity:.4} 50%{width:24px;opacity:.2} }
  @keyframes s-bounce { 0%{width:32px;opacity:.4} 100%{width:26px;opacity:.2} }
`;
