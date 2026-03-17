# Mascot Companion Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an animated Plus-sign mascot to the AnkiPlus panel that reacts to learning events, supports Companion Mode (separate AI chat with own history), and can be toggled as a Beta feature in Settings.

**Architecture:** `MascotShell` wraps either `MascotCharacter` (CSS) or a future Lottie source. A `useMascot` hook owns mood state and event-driven transitions. A `useCompanion` hook manages the companion AI call, history, and stream parsing. Python adds a `companionChat` message handler that runs the AI with a companion-specific system prompt.

**Tech Stack:** React 18, CSS animations, Tailwind, existing bridge message-queue pattern (`window.ankiBridge.addMessage`), existing Python QThread AI pattern (`AIRequestThread` in `widget.py`).

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `config.py` | Modify | Add `mascot_enabled: false` to `DEFAULT_CONFIG` |
| `widget.py` | Modify | Add `companionChat` message handler + `_handle_companion_chat()` |
| `frontend/src/hooks/useMascot.js` | Create | Mood state, event triggers, 30s fallback timer |
| `frontend/src/hooks/useCompanion.js` | Create | Companion AI call, history (last 10), stream + mood-prefix parsing |
| `frontend/src/components/MascotCharacter.jsx` | Create | Pure CSS animated Plus character, accepts `mood` prop |
| `frontend/src/components/MascotShell.jsx` | Create | Wrapper — renders MascotCharacter, click handler, Lottie-ready interface |
| `frontend/src/components/SpeechBubble.jsx` | Create | Auto-dismissing floating bubble with length-based duration |
| `frontend/src/App.jsx` | Modify | Mount MascotShell + SpeechBubble, pass app events to useMascot, wire companion mode |
| `frontend/src/components/ChatInput.jsx` (shared) | Modify | Accept `companionMode` prop, apply indigo tint when active |
| `frontend/src/components/SettingsModal.jsx` | Modify | Add Beta section with mascot toggle in Allgemein tab |
| `frontend/src/hooks/useAnki.js` | Modify | Add `companionChat` bridge wrapper method |

---

## Task 1: Config flag + Settings toggle

**Files:**
- Modify: `config.py` (line ~13 DEFAULT_CONFIG)
- Modify: `widget.py` (saveSettings handler, ~line 244)
- Modify: `frontend/src/components/SettingsModal.jsx`

### Backend

- [ ] **Step 1: Add `mascot_enabled` to DEFAULT_CONFIG**

In `config.py`, add to `DEFAULT_CONFIG`:

```python
DEFAULT_CONFIG = {
    # ... existing keys ...
    "mascot_enabled": False,  # Beta: Mascot Companion
}
```

- [ ] **Step 2: Expose via getCurrentConfig**

The existing `getCurrentConfig` bridge method already returns the whole config dict — no change needed. Verify by searching:

```bash
grep -n "getCurrentConfig" widget.py
```

Expected: a handler that sends the config back to JS. If it already sends the full `get_config()` dict, `mascot_enabled` will be included automatically.

- [ ] **Step 3: Handle `saveMascotEnabled` message in widget.py**

In `_handle_js_message`, add a new branch after the `saveSettings` block:

```python
elif msg_type == 'saveMascotEnabled':
    enabled = bool(data) if isinstance(data, bool) else False
    update_config(mascot_enabled=enabled)
    self.config = get_config(force_reload=True)
    payload = {"type": "mascotEnabledSaved", "data": {"enabled": enabled}}
    self.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
```

- [ ] **Step 4: Update `update_config` in config.py to accept `mascot_enabled`**

Find the `update_config` function and add the parameter:

```python
def update_config(api_key=None, model_provider=None, model_name=None,
                  mascot_enabled=None, **kwargs):
    config = get_config()
    if mascot_enabled is not None:
        config['mascot_enabled'] = mascot_enabled
    # ... rest of existing logic unchanged ...
```

### Frontend

- [ ] **Step 5: Add mascot toggle to SettingsModal — Allgemein tab**

In `SettingsModal.jsx`, find the "Allgemein" tab section. Add a state variable and toggle UI:

```jsx
// State (add near other general settings state, ~line 33)
const [mascotEnabled, setMascotEnabled] = useState(false);

// Load in loadSettings() (where theme is loaded):
const mascotVal = config.mascot_enabled ?? false;
setMascotEnabled(mascotVal);

// Toggle handler:
const handleMascotToggle = (val) => {
  setMascotEnabled(val);
  if (window.ankiBridge) {
    window.ankiBridge.addMessage('saveMascotEnabled', val);
  }
};
```

UI in the Allgemein tab (after the theme section):

```jsx
{/* Beta Features */}
<div className="mt-6">
  <div className="flex items-center gap-2 mb-3">
    <span className="text-xs font-semibold uppercase tracking-wider text-orange-400">Beta</span>
  </div>
  <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
    <div>
      <p className="text-sm font-medium text-white">Mascot Companion</p>
      <p className="text-xs text-white/50 mt-0.5">Animiertes Maskottchen mit eigenem Charakter</p>
    </div>
    <button
      onClick={() => handleMascotToggle(!mascotEnabled)}
      className={`w-11 h-6 rounded-full transition-colors relative ${mascotEnabled ? 'bg-blue-500' : 'bg-white/20'}`}
    >
      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${mascotEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  </div>
</div>
```

- [ ] **Step 6: Build and verify toggle**

```bash
cd frontend && npm run build
```

Restart Anki, open Settings → Allgemein. Toggle should appear under Beta. Toggle on/off and check that config.json gets `mascot_enabled: true/false`.

- [ ] **Step 7: Commit**

```bash
git add config.py widget.py frontend/src/components/SettingsModal.jsx
git commit -m "feat(mascot): add mascot_enabled config flag + settings beta toggle"
```

---

## Task 2: MascotCharacter CSS component

**Files:**
- Create: `frontend/src/components/MascotCharacter.jsx`

This is the pure visual component. All 8 moods defined as CSS classes. No state, no side effects — purely driven by the `mood` prop.

- [ ] **Step 1: Create MascotCharacter.jsx**

```jsx
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
  @keyframes s-bounce { 0%{width:32px;opacity:.4} 100%{width:26px;opacity:.25} }
`;
```

- [ ] **Step 2: Preview in browser dev mode**

In the dev mock or a quick test file, render:

```jsx
import MascotCharacter from './components/MascotCharacter';
// Render each mood for 3s to check all animations:
['neutral','happy','blush','sleepy','thinking','surprised','excited','empathy']
  .map(m => <MascotCharacter key={m} mood={m} />)
```

Run `cd frontend && npm run dev` and verify all 8 moods animate correctly.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/MascotCharacter.jsx
git commit -m "feat(mascot): add CSS MascotCharacter component with 8 mood states"
```

---

## Task 3: MascotShell + SpeechBubble

**Files:**
- Create: `frontend/src/components/MascotShell.jsx`
- Create: `frontend/src/components/SpeechBubble.jsx`

- [ ] **Step 1: Create SpeechBubble.jsx**

```jsx
// frontend/src/components/SpeechBubble.jsx
import React, { useEffect, useState } from 'react';

const MAX_BUBBLE_CHARS = 80;

// Trim to first sentence if over limit, append ellipsis indicator
function trimText(text) {
  if (text.length <= MAX_BUBBLE_CHARS) return text;
  const firstSentence = text.match(/^[^.!?]+[.!?]/)?.[0] ?? text.slice(0, MAX_BUBBLE_CHARS);
  return firstSentence.length <= MAX_BUBBLE_CHARS ? firstSentence : firstSentence.slice(0, MAX_BUBBLE_CHARS) + '…';
}

// Duration: clamp(2500ms, charCount * 50ms, 6000ms)
function calcDuration(text) {
  return Math.min(Math.max(text.length * 50, 2500), 6000);
}

export default function SpeechBubble({ text, onDismiss }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!text) return;
    const display = trimText(text);
    setVisible(true);
    const duration = calcDuration(display);
    const hideTimer = setTimeout(() => setVisible(false), duration);
    const dismissTimer = setTimeout(() => onDismiss?.(), duration + 300); // after fade-out
    return () => { clearTimeout(hideTimer); clearTimeout(dismissTimer); };
  }, [text]);

  if (!text) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '100%',
        left: '50%',
        transform: 'translateX(-50%)',
        marginBottom: 8,
        transition: 'opacity 0.2s, transform 0.2s',
        opacity: visible ? 1 : 0,
        pointerEvents: 'none',
        zIndex: 50,
      }}
    >
      <div style={{
        background: 'rgba(30,30,50,0.95)',
        border: '1px solid rgba(108,99,255,0.3)',
        borderRadius: '12px 12px 12px 4px',
        padding: '8px 12px',
        fontSize: 12,
        color: '#c0c0ff',
        maxWidth: 200,
        lineHeight: 1.4,
        whiteSpace: 'pre-wrap',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      }}>
        {trimText(text)}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create MascotShell.jsx**

```jsx
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
```

- [ ] **Step 3: Build + visual check in dev mode**

```bash
cd frontend && npm run dev
```

Add `<MascotShell mood="happy" bubbleText="Hallo!" enabled={true} active={false} />` temporarily to App.jsx render to verify bubble appears and dismisses after ~4s.

Remove the temporary test code before committing.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/MascotShell.jsx frontend/src/components/SpeechBubble.jsx
git commit -m "feat(mascot): add MascotShell wrapper and SpeechBubble component"
```

---

## Task 4: useMascot hook + mount in App.jsx

**Files:**
- Create: `frontend/src/hooks/useMascot.js`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Create useMascot.js**

```js
// frontend/src/hooks/useMascot.js
import { useState, useRef, useCallback } from 'react';

const MOOD_PRIORITY = { event: 1, ai: 2 };  // ai overrides event

export function useMascot() {
  const [mood, setMoodState] = useState('neutral');
  const eventMoodRef = useRef('neutral');
  const fallbackTimerRef = useRef(null);

  // Set an event-driven mood (lower priority — overridden by AI mood)
  const setEventMood = useCallback((newMood) => {
    eventMoodRef.current = newMood;
    setMoodState(newMood);
  }, []);

  // Set an AI-driven mood (higher priority — falls back after 30s)
  const setAiMood = useCallback((newMood) => {
    setMoodState(newMood);
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    fallbackTimerRef.current = setTimeout(() => {
      setMoodState(eventMoodRef.current || 'neutral');
    }, 30000);
  }, []);

  // Reset to neutral (e.g., when companion mode exits)
  const resetMood = useCallback(() => {
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    setMoodState(eventMoodRef.current || 'neutral');
  }, []);

  return { mood, setEventMood, setAiMood, resetMood };
}
```

- [ ] **Step 2: Mount MascotShell in App.jsx**

In `AppInner` in `frontend/src/App.jsx`:

```jsx
// Add imports at top
import MascotShell from './components/MascotShell';
import { useMascot } from './hooks/useMascot';

// Inside AppInner, after existing hooks:
const { mood, setEventMood, setAiMood, resetMood } = useMascot();
const [mascotEnabled, setMascotEnabled] = useState(false);
const [companionMode, setCompanionMode] = useState(false);
const [bubbleText, setBubbleText] = useState(null);
```

Load `mascot_enabled` from config when bridge is ready (add to the existing config loading effect):

```jsx
// In the effect that loads config (where theme/aiTools are loaded):
const mascotVal = config?.mascot_enabled ?? false;
setMascotEnabled(mascotVal);
```

Handle `mascotEnabledSaved` in the `ankiReceive` handler:

```jsx
case 'mascotEnabledSaved':
  setMascotEnabled(payload.data.enabled);
  break;
```

- [ ] **Step 3: Wire app events to useMascot**

The existing `reviewResult` event (emitted from `custom_reviewer/__init__.py`, handled in `App.jsx`) carries the `ease` value. Find the existing `reviewResult` block in `App.jsx` — search for `case 'reviewResult':` or `reviewResult` in the ankiReceive handler. Add mood logic **inside that existing block**:

```jsx
// Inside the existing reviewResult handler — add after existing logic:
// ease: 1=Again, 2=Hard, 3=Good, 4=Easy
const ease = payload.data?.ease ?? payload.ease;
if (ease >= 3) {
  setEventMood('happy');
} else if (ease === 1) {
  // Track consecutive wrong answers
  setConsecutiveWrong(prev => {
    const next = prev + 1;
    if (next >= 3) setEventMood('empathy');
    return next;
  });
}
// Reset consecutive wrong counter on a correct answer
if (ease >= 3) setConsecutiveWrong(0);
```

Add the counter state near the other mascot state declarations:

```jsx
const [consecutiveWrong, setConsecutiveWrong] = useState(0);
```

**Note:** Streak tracking (5+ correct → `excited`) is not implemented in the current codebase and is out of scope for this iteration. It is listed in the spec's event table but requires a separate counter system. Skip it here; the `happy` mood on correct answers is sufficient for launch.

Also add a 10-minute idle timer:

```jsx
// After existing state declarations:
const idleTimerRef = useRef(null);
const resetIdleTimer = useCallback(() => {
  if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
  idleTimerRef.current = setTimeout(() => setEventMood('sleepy'), 10 * 60 * 1000);
}, [setEventMood]);

// In a useEffect that fires on any user interaction:
useEffect(() => {
  window.addEventListener('mousedown', resetIdleTimer);
  window.addEventListener('keydown', resetIdleTimer);
  resetIdleTimer();
  return () => {
    window.removeEventListener('mousedown', resetIdleTimer);
    window.removeEventListener('keydown', resetIdleTimer);
  };
}, [resetIdleTimer]);
```

- [ ] **Step 4: Render MascotShell in App.jsx**

Place `MascotShell` in the bottom-left of the panel layout. Find the main return JSX in `AppInner` and add the mascot as an absolutely-positioned element:

```jsx
{/* Mascot — bottom-left, above input */}
{mascotEnabled && (
  <div style={{ position: 'absolute', bottom: 72, left: 12, zIndex: 40 }}>
    <MascotShell
      mood={mood}
      bubbleText={bubbleText}
      onBubbleDismiss={() => setBubbleText(null)}
      active={companionMode}
      onClick={() => {
        setCompanionMode(prev => {
          if (!prev) {
            setAiMood('happy');
            setBubbleText('Hey! 👋 Was gibt\'s?');
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

- [ ] **Step 5: Build + test in Anki**

```bash
cd frontend && npm run build
```

Restart Anki. Enable mascot in Settings → Beta. Mascot should appear bottom-left, floating with `neutral` mood. Click it → greeting bubble appears.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useMascot.js frontend/src/App.jsx
git commit -m "feat(mascot): mount MascotShell in App, wire event-driven moods and idle timer"
```

---

## Task 5: Companion mode — ChatInput tint

**Files:**
- Modify: `frontend/src/components/ChatInput.jsx` (the shared one, find via the re-export)

The re-export at `frontend/src/components/ChatInput.jsx` points to `@shared/components/ChatInput`. Find the real file:

```bash
find . -path "*/shared/components/ChatInput*" | head -5
```

- [ ] **Step 1: Locate the real ChatInput**

```bash
grep -r "ChatInput" frontend/src --include="*.jsx" --include="*.js" -l
```

Find which file exports the actual component and open it.

- [ ] **Step 2: Add `companionMode` prop**

In the real ChatInput component, accept and apply the prop:

```jsx
// Add to props destructuring:
export default function ChatInput({ ..., companionMode = false, ... }) {

// Find the input/textarea element and add a conditional class or style:
className={`... ${companionMode ? 'ring-2 ring-indigo-500 bg-indigo-950/30' : ''}`}

// And a visual label above or inside the input when active:
{companionMode && (
  <div className="text-[10px] text-indigo-400 px-3 pt-1 font-medium tracking-wide">
    Companion-Modus
  </div>
)}
```

- [ ] **Step 3: Pass `companionMode` from App.jsx**

In `App.jsx`, find where `<ChatInput>` is rendered and add the prop:

```jsx
<ChatInput
  // ... existing props ...
  companionMode={companionMode}
/>
```

- [ ] **Step 4: Handle Escape — exit companion mode, not panel**

In `App.jsx`, find the existing global `keydown` handler (around line 1270) where `Escape` calls `handleClose()`. Add a guard at the top of that handler so Escape exits companion mode first when it is active:

```jsx
// At the top of the existing Escape keydown handler:
if (e.key === 'Escape' && companionMode) {
  e.stopPropagation();
  setCompanionMode(false);
  resetMood();
  return;
}
// ... existing Escape → handleClose() logic continues below ...
```

This intercepts Escape before it reaches the panel-close logic.

- [ ] **Step 5: Build + verify**

```bash
cd frontend && npm run build
```

Enable mascot, click it, verify the input field gets the indigo tint and "Companion-Modus" label. Press Escape — companion mode should deactivate (tint gone, mood returns to neutral). Press Escape again — panel should close as before.

- [ ] **Step 6: Commit**

The real ChatInput lives somewhere under `frontend/src/` — `frontend/src/components/ChatInput.jsx` is a re-export pointing to `@shared/components/ChatInput`. Find it:

```bash
grep -r "export default function ChatInput" frontend/src --include="*.jsx" -l
```

Expected result: a path like `frontend/src/shared/components/ChatInput.jsx` or similar. Use that path in the commit:

```bash
git add frontend/src/App.jsx <path-found-above>
git commit -m "feat(mascot): companion mode tint on ChatInput, Escape exits companion mode"
```

---

## Task 6: useCompanion hook + bridge method

**Files:**
- Create: `frontend/src/hooks/useCompanion.js`
- Modify: `frontend/src/hooks/useAnki.js`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Create useCompanion.js**

```js
// frontend/src/hooks/useCompanion.js
import { useState, useRef, useCallback } from 'react';

const MAX_HISTORY = 10;
const MOOD_REGEX = /^\{"mood":"([a-z]+)"\}\n?/;
const COMPANION_SYSTEM_PROMPT = `Du bist ein freundlicher, nahbarer Begleiter in einer Lernapp namens AnkiPlus.
Du sprichst informell, bist emotional unterstützend, leicht witzig, nie herablassend.
Du antwortest immer auf Deutsch oder Englisch, je nachdem wie der Nutzer schreibt.
Antworte sehr kurz — maximal 2-3 Sätze.
Beginne JEDE Antwort mit einer JSON-Zeile im exakten Format: {"mood":"<key>"}
Erlaubte mood-Werte: neutral, happy, blush, sleepy, thinking, surprised, excited, empathy
Wähle den mood passend zum Inhalt deiner Antwort.`;

export function useCompanion({ bridge, onMood, onBubble }) {
  const [isLoading, setIsLoading] = useState(false);
  const historyRef = useRef([]); // [{role:'user'|'assistant', content:string}]

  const send = useCallback((text, surfaceContext = '') => {
    if (!bridge || !text.trim()) return;

    const contextNote = surfaceContext ? `[Kontext: ${surfaceContext}]\n` : '';
    const fullText = contextNote + text;

    // Add to history
    historyRef.current = [
      ...historyRef.current.slice(-(MAX_HISTORY - 1) * 2), // keep last N exchanges (2 messages each)
      { role: 'user', content: fullText },
    ];

    setIsLoading(true);
    onMood?.('thinking');

    // Send via bridge
    if (window.ankiBridge) {
      window.ankiBridge.addMessage('companionChat', {
        systemPrompt: COMPANION_SYSTEM_PROMPT,
        history: historyRef.current.slice(0, -1), // all but the last (current) message
        message: fullText,
      });
    }
  }, [bridge, onMood]);

  const bufferRef = useRef(''); // accumulates stream chunks for mood-prefix parsing

  // Called from App.jsx when ankiReceive gets companionChunk
  const handleChunk = useCallback((chunk, done) => {
    bufferRef.current += chunk;

    const match = bufferRef.current.match(MOOD_REGEX);
    if (match) {
      const moodKey = match[1];
      onMood?.(moodKey);
      const textAfterMood = bufferRef.current.replace(MOOD_REGEX, '');
      if (textAfterMood) onBubble?.(textAfterMood);
    }

    if (done) {
      // Store assistant reply in history (without mood prefix)
      const text = bufferRef.current.replace(MOOD_REGEX, '').trim();
      if (text) {
        historyRef.current = [...historyRef.current, { role: 'assistant', content: text }];
        // Keep history bounded — drop oldest exchange (2 messages) when over limit
        if (historyRef.current.length > MAX_HISTORY * 2) {
          historyRef.current = historyRef.current.slice(-MAX_HISTORY * 2);
        }
      }
      bufferRef.current = '';
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

- [ ] **Step 2: Add `companionChat` to useAnki.js**

In `frontend/src/hooks/useAnki.js`, inside `bridgeWrapper`, add:

```js
companionChat: (systemPrompt, history, message) => {
  if (window.ankiBridge) {
    window.ankiBridge.addMessage('companionChat', { systemPrompt, history, message });
  }
},
```

- [ ] **Step 3: Wire useCompanion in App.jsx**

```jsx
// Import
import { useCompanion } from './hooks/useCompanion';

// Inside AppInner, after useMascot:
const { send: sendToCompanion, handleChunk: handleCompanionChunk } = useCompanion({
  bridge,
  onMood: setAiMood,
  onBubble: setBubbleText,
});
```

In the `ankiReceive` handler, add cases:

```jsx
case 'companionChunk':
  handleCompanionChunk(payload.chunk, payload.done);
  break;
```

In the chat submit handler (where `bridge.sendMessage` is called), intercept when `companionMode` is true:

```jsx
const handleSend = (text) => {
  if (companionMode) {
    // Build surface context from current card state
    const ctx = currentCardContext
      ? `Nutzer lernt gerade Karten.`
      : '';
    sendToCompanion(text, ctx);
    return; // don't send to main chat
  }
  // ... existing main chat send logic ...
};
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useCompanion.js frontend/src/hooks/useAnki.js frontend/src/App.jsx
git commit -m "feat(mascot): add useCompanion hook and wire companion mode chat interception"
```

---

## Task 7: Python backend — companionChat handler

**Files:**
- Modify: `widget.py`

The companion AI call mirrors the existing `handle_message_from_ui` pattern but uses the companion system prompt and sends back `companionChunk` / `companionDone` type messages instead of `bot`.

- [ ] **Step 1: Add `companionChat` branch to `_handle_js_message`**

In `widget.py`, in `_handle_js_message`, add after the existing message handlers:

```python
elif msg_type == 'companionChat':
    if isinstance(data, dict):
        system_prompt = data.get('systemPrompt', '')
        history = data.get('history', [])
        message = data.get('message', '')
        self._handle_companion_chat(system_prompt, history, message)
```

- [ ] **Step 2: Check `get_response` signature before writing CompanionThread**

```bash
grep -n "def get_response" ai_handler.py
```

Note the exact parameter names. The existing `AIRequestThread` in `handle_message_from_ui` (widget.py ~line 758) shows the exact call pattern — read those ~50 lines now so you know the call signature before writing `CompanionThread`.

- [ ] **Step 3: Add `_handle_companion_chat` method to ChatbotWidget**

Add this method to `ChatbotWidget` in `widget.py`. The `CompanionThread` uses `get_response` with the system prompt injected as the first history entry (role `system`):

```python
def _handle_companion_chat(self, system_prompt: str, history: list, message: str):
    """Runs companion AI call in a background thread, streams companionChunk events to JS."""
    try:
        from .ai_handler import get_ai_handler
    except ImportError:
        from ai_handler import get_ai_handler

    ai = get_ai_handler(widget=self)
    if not ai.is_configured():
        payload = {"type": "companionChunk", "chunk": "Ich kann gerade nicht antworten.", "done": True}
        self.web_view.page().runJavaScript(f"window.ankiReceive({json.dumps(payload)});")
        return

    widget_ref = self

    class CompanionThread(QThread):
        chunk_signal = pyqtSignal(str, bool)  # chunk, done

        def __init__(self, ai_handler, system_prompt, prior_history, message):
            super().__init__()
            self.ai_handler = ai_handler
            self.system_prompt = system_prompt
            self.prior_history = prior_history or []
            self.message = message
            self._cancelled = False

        def cancel(self):
            self._cancelled = True

        def run(self):
            try:
                # Build history: system prompt first, then prior exchanges
                full_history = []
                if self.system_prompt:
                    full_history.append({"role": "system", "content": self.system_prompt})
                full_history.extend(self.prior_history)

                def on_chunk(chunk, done):
                    if not self._cancelled:
                        self.chunk_signal.emit(chunk, done)

                # Use the same get_response call pattern as AIRequestThread in handle_message_from_ui.
                # Pass history=full_history and callback=on_chunk.
                # If the signature differs from what you see below, match it exactly to
                # what AIRequestThread uses in handle_message_from_ui.
                self.ai_handler.get_response(
                    self.message,
                    history=full_history,
                    callback=on_chunk,
                    mode='compact',  # remove this argument if get_response doesn't accept 'mode'
                )
            except Exception as e:
                self.chunk_signal.emit(f"Fehler: {e}", True)

    thread = CompanionThread(ai, system_prompt, history, message)

    def on_chunk(chunk, done):
        payload = {"type": "companionChunk", "chunk": chunk, "done": done}
        widget_ref.web_view.page().runJavaScript(
            f"window.ankiReceive({json.dumps(payload)});"
        )

    thread.chunk_signal.connect(on_chunk)
    self._companion_thread = thread
    thread.start()
```

- [ ] **Step 4: Build and test end-to-end**

```bash
cd frontend && npm run build
```

Restart Anki. Enable mascot, click it, type a message in companion mode. Expected:
1. Input tint is active
2. Mascot switches to `thinking` mood
3. Response streams as a speech bubble
4. Mood changes per the `{"mood":"..."}` prefix
5. After 30s with no new message, mood returns to `neutral` (or last event mood)

- [ ] **Step 5: Commit**

```bash
git add widget.py
git commit -m "feat(mascot): add companionChat handler to Python backend"
```

---

## Done

All tasks complete when:
- [ ] Mascot is hidden when `mascot_enabled = false`
- [ ] Toggle in Settings persists across Anki restarts
- [ ] All 8 moods animate correctly
- [ ] Event-driven moods fire on card right/wrong (3+ consecutive wrong → empathy) and idle (10min → sleepy)
- [ ] Clicking mascot activates companion mode (input tint, greeting bubble)
- [ ] Companion messages go to separate AI call (not main chat)
- [ ] Mood prefix `{"mood":"..."}` is parsed and applied
- [ ] History is bounded to 10 exchanges (oldest dropped)
- [ ] Speech bubble auto-dismisses with length-based timing
- [ ] Clicking mascot again or pressing Escape exits companion mode
