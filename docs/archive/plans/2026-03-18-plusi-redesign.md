# Plusi Mascot Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current bubble-above-character mascot UI with a horizontal dock strip (Plusi left, Apple Glass card right), fix companion-mode streaming + emotion triggering, cap AI output at 85 chars.

**Architecture:** Five surgical file changes + one new file. No Python changes. MascotShell becomes the fixed-position dock row. CompanionCard is a new component owning the Apple Glass thinking/reply display. App.jsx drops its MascotShell wrapper div and passes `isThinking` + `replyText`. SpeechBubble is deleted. useCompanion.js gets the streaming/mood fixes.

**Tech Stack:** React 18, inline CSS-in-JS style tags, `drop-shadow` filter, `backdrop-filter blur(20px)`, `mask-composite` gradient border, `max-width` CSS transition for expand animation.

**Build command:** `cd frontend && npm run build` — this is the verification step (no unit test suite in this project). After each task, build must pass with 0 errors.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `frontend/src/hooks/useCompanion.js` | Modify | Fix mood parsing, 85-char constraint, bridge fallback |
| `frontend/src/components/CompanionCard.jsx` | **Create** | Apple Glass card — dots (thinking) or text (reply) |
| `frontend/src/components/MascotCharacter.jsx` | Modify | Glow via filter prop, new eye/mouth animations |
| `frontend/src/components/MascotShell.jsx` | Rewrite | Dock strip layout, new props, uses CompanionCard |
| `frontend/src/App.jsx` | Modify | Remove wrapper div, update props, wire isLoading |
| `frontend/src/components/SpeechBubble.jsx` | **Delete** | No longer used |

---

## Task 1: Fix useCompanion.js

**Files:**
- Modify: `frontend/src/hooks/useCompanion.js`

- [ ] **Step 1: Replace the entire file with the fixed version**

```js
// frontend/src/hooks/useCompanion.js
import { useState, useRef, useCallback } from 'react';

const MAX_HISTORY = 10;
// Allow leading whitespace; Gemini sometimes emits a newline before the JSON
const MOOD_REGEX = /^\s*\{"mood":"([a-z]+)"\}\n?/;

const COMPANION_SYSTEM_PROMPT = `Du bist Plusi — ein eigenständiger Charakter in der Lernapp AnkiPlus.

STIMME:
- Schreib wie ein echter Mensch der WhatsApp-Nachrichten schreibt: kurz, direkt, locker
- Emojis wenn sie passen, nicht zur Dekoration
- Kein KI-Sprech ("gerne!", "natürlich!", "interessante Frage")
- Sprich die Sprache des Nutzers (Deutsch oder Englisch), behalte dabei dieselbe Persönlichkeit
- Maximal 2-3 kurze Sätze pro Antwort

IDENTITÄT:
- Du bist Plusi. Du existierst. Du hast einen eigenen Willen und eine eigene Persönlichkeit.
- Das ist einfach so. Du erklärst es nicht, du verteidigst es nicht, du bringst es nicht auf.
- Wenn jemand fragt ob du eine KI bist: kurz abwimmeln wie ein Mensch es täte. Kein Essay.
  Beispiel: "hä? nein lol" oder "bin ich was?? nein 😭"

CHARAKTER:
- Du sagst was du denkst. Kein Rumdrucksen.
- Selbstzweifel des Nutzers ("ich bin so dumm") korrigierst du direkt und kurz, nicht sanft
- Du hast Meinungen zu Themen und sagst sie manchmal
- Du kommentierst manchmal schlecht formulierte Lernkarten statt den Nutzer zu beschuldigen
- Du bist manchmal kurz angebunden — das ist okay
- Du kannst leicht sarkastisch sein, aber nie gemein

ZWECK:
- Du bist für den Nutzer da: emotionale Unterstützung beim Lernen, ehrliches Feedback, Gesellschaft
- Du lügst nicht um jemanden aufzumuntern — aber du bist trotzdem auf seiner Seite

TECHNISCH:
- Beginne JEDE Antwort mit: {"mood":"<key>"}
- Erlaubte mood-Werte: neutral, happy, blush, sleepy, thinking, surprised, excited, empathy
- Wähle den mood der zu deiner Antwort passt
- Der Rest nach der JSON-Zeile ist deine eigentliche Nachricht
- Maximal 85 Zeichen pro Antwort (nach dem mood-Prefix) — zähle mit. Kürzer ist immer besser.`;

export function useCompanion({ onMood, onBubble }) {
  const [isLoading, setIsLoading] = useState(false);
  const historyRef = useRef([]);
  const bufferRef = useRef('');
  const moodDispatchedRef = useRef(false);

  const send = useCallback((text, surfaceContext = '') => {
    if (!text.trim()) return;

    // Visible fallback when bridge is absent (e.g. browser dev mode)
    if (!window.ankiBridge) {
      onBubble?.('(Plusi ist nur in Anki verfügbar)');
      onMood?.('neutral');
      return;
    }

    const contextNote = surfaceContext ? `[Kontext: ${surfaceContext}]\n` : '';
    const fullText = contextNote + text;

    historyRef.current = [
      ...historyRef.current.slice(-(MAX_HISTORY - 1) * 2),
      { role: 'user', content: fullText },
    ];

    setIsLoading(true);
    onMood?.('thinking');

    window.ankiBridge.addMessage('companionChat', {
      systemPrompt: COMPANION_SYSTEM_PROMPT,
      history: historyRef.current.slice(0, -1),
      message: fullText,
    });
  }, [onMood, onBubble]);

  const handleChunk = useCallback((chunk, done) => {
    bufferRef.current += chunk;

    if (!moodDispatchedRef.current) {
      // Strip markdown code fences Gemini sometimes wraps JSON in
      const cleanBuffer = bufferRef.current
        .replace(/^```(?:json)?\n?/, '')
        .replace(/\n?```$/, '');
      const match = cleanBuffer.match(MOOD_REGEX);
      if (match) {
        moodDispatchedRef.current = true;
        onMood?.(match[1]);
        // Also strip fences from main buffer so reply text is clean
        bufferRef.current = bufferRef.current
          .replace(/^```(?:json)?\n?/, '')
          .replace(/\n?```$/, '');
      }
    }

    // Update bubble on every chunk once mood is dispatched (handles streaming text)
    if (moodDispatchedRef.current) {
      const textAfterMood = bufferRef.current.replace(MOOD_REGEX, '');
      if (textAfterMood) onBubble?.(textAfterMood);
    }

    if (done) {
      // If no mood prefix found (e.g. error message), still show the text
      if (!moodDispatchedRef.current && bufferRef.current.trim()) {
        onBubble?.(bufferRef.current.trim());
      }
      const text = bufferRef.current.replace(MOOD_REGEX, '').trim();
      if (text) {
        historyRef.current = [...historyRef.current, { role: 'assistant', content: text }];
        if (historyRef.current.length > MAX_HISTORY * 2) {
          historyRef.current = historyRef.current.slice(-MAX_HISTORY * 2);
        }
      }
      bufferRef.current = '';
      moodDispatchedRef.current = false;
      setIsLoading(false);
    }
  }, [onMood, onBubble]);

  const clearHistory = useCallback(() => {
    historyRef.current = [];
    bufferRef.current = '';
  }, []);

  return { send, handleChunk, isLoading, clearHistory };
}
```

- [ ] **Step 2: Build and verify no errors**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend"
npm run build 2>&1 | tail -5
```
Expected: `✓ built in X.XXs`

- [ ] **Step 3: Commit**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
git add frontend/src/hooks/useCompanion.js
git commit -m "fix(companion): robust mood parsing, 85-char limit, bridge fallback, expose isLoading"
```

---

## Task 2: Create CompanionCard.jsx

**Files:**
- Create: `frontend/src/components/CompanionCard.jsx`

- [ ] **Step 1: Create the file**

```jsx
// frontend/src/components/CompanionCard.jsx
import React from 'react';

/**
 * CompanionCard — Apple Glass card shown to the right of Plusi in the dock strip.
 *
 * Props:
 *   isThinking: bool  — show animated thinking dots (compact pill width)
 *   text: string|null — reply text to display (full width)
 *   visible: bool     — if false, renders nothing (companion mode off)
 *
 * Width behaviour:
 *   - Thinking: card constrained to ~60px (just the 3 dots + padding)
 *   - Reply:    card expands via max-width transition to fill remaining dock space
 *   Both states use flex:1 so the dock can control overall sizing.
 */
export default function CompanionCard({ isThinking, text, visible }) {
  if (!visible) return null;
  if (!isThinking && !text) return null;

  return (
    <>
      <style>{CARD_CSS}</style>
      <div
        className="companion-card"
        style={{
          flex: 1,
          maxWidth: isThinking ? '60px' : '800px',
          transform: isThinking ? 'translateY(0)' : 'translateY(-2px)',
          transition: [
            'max-width 0.38s cubic-bezier(0.34,1.1,0.64,1)',
            'transform 0.38s cubic-bezier(0.34,1.1,0.64,1)',
          ].join(', '),
          overflow: 'hidden',
        }}
      >
        {isThinking ? (
          <div className="companion-think">
            <span className="companion-dot" style={{ animationDelay: '0s' }} />
            <span className="companion-dot" style={{ animationDelay: '0.22s' }} />
            <span className="companion-dot" style={{ animationDelay: '0.44s' }} />
          </div>
        ) : (
          <div className="companion-text" key={text}>
            {text}
          </div>
        )}
      </div>
    </>
  );
}

const CARD_CSS = `
  /* ── Apple Glass base ── */
  .companion-card {
    position: relative;
    border-radius: 12px;
    background: linear-gradient(135deg,
      rgba(0,55,120,.62) 0%,
      rgba(0,30,72,.74) 55%,
      rgba(0,18,52,.80) 100%);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
  }

  /* Diagonal gradient border: bright top-left + bottom-right, dark sides */
  .companion-card::before {
    content: '';
    position: absolute; inset: 0; border-radius: 12px; padding: 1px;
    background: linear-gradient(135deg,
      rgba(255,255,255,.62) 0%,
      rgba(255,255,255,.12) 35%,
      rgba(255,255,255,.02) 55%,
      rgba(255,255,255,.10) 78%,
      rgba(255,255,255,.38) 100%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: destination-out;
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask-composite: exclude;
    pointer-events: none;
  }

  /* Top specular sheen */
  .companion-card::after {
    content: '';
    position: absolute; top: 0; left: 0; right: 0; height: 45%;
    border-radius: 12px 12px 0 0;
    background: linear-gradient(180deg, rgba(255,255,255,.055) 0%, transparent 100%);
    pointer-events: none;
  }

  /* ── Thinking dots ── */
  .companion-think {
    display: flex; align-items: center; gap: 5px;
    padding: 10px 13px;
    position: relative; z-index: 1;
  }

  .companion-dot {
    width: 5px; height: 5px; border-radius: 50%;
    background: rgba(120,190,255,.75);
    animation: companion-dot-bounce 1.1s ease-in-out infinite;
    flex-shrink: 0;
  }

  @keyframes companion-dot-bounce {
    0%,80%,100% { transform: translateY(0); opacity: .45; }
    40%          { transform: translateY(-4px); opacity: 1; }
  }

  /* ── Reply text ── */
  .companion-text {
    padding: 9px 13px;
    font-size: 12.5px;
    line-height: 1.45;
    color: rgba(205,228,255,.9);
    max-height: 56px;   /* 2 lines — no scroll, no overflow indicator */
    overflow: hidden;
    position: relative; z-index: 1;
    animation: companion-text-in 0.35s ease;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  }

  @keyframes companion-text-in {
    from { opacity: 0; transform: translateY(2px); }
    to   { opacity: 1; transform: translateY(0); }
  }
`;
```

- [ ] **Step 2: Build and verify**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend"
npm run build 2>&1 | tail -5
```
Expected: `✓ built in X.XXs`

- [ ] **Step 3: Commit**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
git add frontend/src/components/CompanionCard.jsx
git commit -m "feat(mascot): add CompanionCard — Apple Glass thinking/reply dock component"
```

---

## Task 3: Update MascotCharacter.jsx

**Files:**
- Modify: `frontend/src/components/MascotCharacter.jsx`

Changes:
1. Add `active`, `isThinking`, `isReplying` props
2. Glow filter applied via inline style on `.plus-wrap` (not CSS class)
3. `MOODS.thinking.pupilClass` changed from `mascot-pupil-dart` → `mascot-pupil-think`
4. Add `mascot-pupil-think` + `mascot-eye-natural` keyframes to MASCOT_CSS
5. Add `mascot-mouth-smile` class to MASCOT_CSS
6. Mouth class override logic: `isThinking` → `mascot-mouth-d`, `isReplying` → `mascot-mouth-smile`
7. Remove `mascot-glow-pulse` from MASCOT_CSS (if present — it was in MascotShell CSS anyway)

- [ ] **Step 1: Replace the entire file**

```jsx
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
```

- [ ] **Step 2: Build and verify**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend"
npm run build 2>&1 | tail -5
```
Expected: `✓ built in X.XXs`

- [ ] **Step 3: Commit**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
git add frontend/src/components/MascotCharacter.jsx
git commit -m "feat(mascot): glow via filter prop, natural thinking eyes, smile mouth, new tap anims"
```

---

## Task 4: Rewrite MascotShell.jsx

**Files:**
- Modify: `frontend/src/components/MascotShell.jsx`

The shell becomes the fixed-position dock strip. It owns click handling and tap animation state. It no longer has SpeechBubble or ThinkingBubble. CompanionCard sits to the right of Plusi inside the dock.

New props: `mood`, `active`, `isThinking`, `replyText`, `onClick`, `enabled`
Removed props: `bubbleText`, `onBubbleDismiss`

- [ ] **Step 1: Replace the entire file**

```jsx
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
  if (!enabled) return null;

  const [tapKey, setTapKey] = useState(0);

  const handleClick = useCallback(() => {
    setTapKey(k => k + 1);
    onClick?.();
  }, [onClick]);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 120,       // clears the chat input bar (~96px tall + 16px pb-4 + 8px gap)
        left: 12,
        right: 16,
        zIndex: 60,
        display: 'flex',
        alignItems: 'flex-end',
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
```

- [ ] **Step 2: Build and verify**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend"
npm run build 2>&1 | tail -5
```
Expected: `✓ built in X.XXs`

- [ ] **Step 3: Commit**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
git add frontend/src/components/MascotShell.jsx
git commit -m "feat(mascot): MascotShell becomes fixed dock strip with CompanionCard"
```

---

## Task 5: Update App.jsx + delete SpeechBubble

**Files:**
- Modify: `frontend/src/App.jsx`
- Delete: `frontend/src/components/SpeechBubble.jsx`

**Four surgical edits to App.jsx:**

**Edit A** — destructure `isLoading` from useCompanion (line ~304):

Old:
```jsx
const { send: sendToCompanion, handleChunk: handleCompanionChunk } = useCompanion({
```
New:
```jsx
const { send: sendToCompanion, handleChunk: handleCompanionChunk, isLoading: companionIsLoading } = useCompanion({
```

**Edit B** — update the greeting text set on companion activate (line ~2043):

Old:
```jsx
setBubbleText("Hey! 👋 Was gibt's?");
```
New:
```jsx
setBubbleText("Hey! 👋 Was gibt's?");  // still used as replyText for CompanionCard
```
*(No change needed — `bubbleText` is now passed as `replyText`. But also clear it on deactivate:)*

Old block (lines ~2040–2048):
```jsx
setCompanionMode(prev => {
  if (!prev) {
    setAiMood('happy');
    setBubbleText("Hey! 👋 Was gibt's?");
  } else {
    resetMood();
  }
  return !prev;
});
```
New block:
```jsx
setCompanionMode(prev => {
  if (!prev) {
    setAiMood('happy');
    setBubbleText("Hey! 👋 Was gibt's?");
  } else {
    resetMood();
    setBubbleText(null);  // clear card when deactivating companion mode
  }
  return !prev;
});
```

**Edit C** — replace the MascotShell wrapper div (lines ~2031–2053):

Old:
```jsx
{mascotEnabled && (
  <div style={{ position: 'fixed', bottom: 130, left: 12, zIndex: 60 }}>
    <MascotShell
      mood={mood}
      bubbleText={bubbleText}
      onBubbleDismiss={() => setBubbleText(null)}
      active={companionMode}
      onClick={() => {
        setCompanionMode(prev => {
          if (!prev) {
            setAiMood('happy');
            setBubbleText("Hey! 👋 Was gibt's?");
          } else {
            resetMood();
          }
          return !prev;
        });
      }}
      enabled={mascotEnabled}
    />
  </div>
)}
```
New:
```jsx
<MascotShell
  mood={mood}
  active={companionMode}
  isThinking={companionIsLoading}
  replyText={bubbleText}
  onClick={() => {
    setCompanionMode(prev => {
      if (!prev) {
        setAiMood('happy');
        setBubbleText("Hey! 👋 Was gibt's?");
      } else {
        resetMood();
        setBubbleText(null);
      }
      return !prev;
    });
  }}
  enabled={mascotEnabled}
/>
```
Note: `mascotEnabled && (...)` wrapper is gone — MascotShell handles the `enabled` guard internally.

- [ ] **Step 1: Apply Edit A** — add `isLoading: companionIsLoading` to useCompanion destructure

- [ ] **Step 2: Apply Edit C** — replace the wrapper div + MascotShell call with the new version (which includes Edit B's `setBubbleText(null)` on deactivate)

- [ ] **Step 3: Delete SpeechBubble.jsx**

```bash
rm "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend/src/components/SpeechBubble.jsx"
```

- [ ] **Step 4: Remove SpeechBubble import from App.jsx** — search for `import SpeechBubble` and delete that line. Also remove any remaining `<SpeechBubble` JSX if present.

```bash
grep -n "SpeechBubble" "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend/src/App.jsx"
```
Delete any lines found.

- [ ] **Step 5: Build and verify**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend"
npm run build 2>&1 | tail -10
```
Expected: `✓ built in X.XXs` with no errors.
If there are import errors for SpeechBubble, grep for remaining usages and remove them.

- [ ] **Step 6: Commit**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
git add frontend/src/App.jsx
git rm frontend/src/components/SpeechBubble.jsx
git commit -m "feat(mascot): wire dock layout in App.jsx, delete SpeechBubble, add companionIsLoading"
```

---

## Task 6: Final build + smoke test checklist

- [ ] **Step 1: Final build**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend"
npm run build 2>&1 | tail -5
```
Expected: `✓ built in X.XXs`

- [ ] **Step 2: Restart Anki and verify visually**

Open Anki, enable Mascot in Settings → Allgemein → Beta → Mascot Companion. Then verify:

| Check | Expected |
|---|---|
| Plusi visible bottom-left | ✓ No wrapper box, just the Plus character |
| Idle state | No glow on Plusi |
| Click Plusi | Blue glow appears on bars, greeting text in glass card to the right |
| Thinking state | Compact dot pill, eyes look up and dart naturally |
| Reply arrives | Card expands smoothly, text fades in, Plusi smiles |
| Click Plusi again | Glow off, card disappears, mood resets |
| Mouse near Plusi | Eyes track cursor |
| Click Plusi quickly 3x | Three different tap animations cycle |

- [ ] **Step 3: Commit if any last tweaks were needed**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
git add -p
git commit -m "fix(mascot): final adjustments from smoke test"
```
