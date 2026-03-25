# Plusi Mascot Redesign — Design Spec

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this spec.

**Goal:** Redesign Plusi's visual presentation and fix companion-mode reliability — replacing the current box/bubble approach with a cohesive dock strip (Plusi left, Apple Glass card right), fixing streaming + emotion triggering, and capping output at 85 chars.

**Architecture:** MascotShell and MascotCharacter are updated in-place. The old `SpeechBubble` component (positioned above the character) is deleted and its usage removed from App.jsx. The old `ThinkingBubble` inner function inside MascotShell is deleted. A new `CompanionCard` component (new file) replaces both, living in a dock row to the right of Plusi. App.jsx's existing fixed-position wrapper div for MascotShell is removed; the dock row is instead rendered inside `MascotShell` itself and positioned relative to the chat input. `useCompanion.js` gets a tighter system prompt with the 85-char constraint and a more robust mood-prefix parser.

**Tech Stack:** React 18, inline CSS / CSS-in-JS style tags, `drop-shadow` filter, `backdrop-filter`, `mask-composite` gradient border trick, JS-driven width transition (not CSS `auto` → `flex:1`).

---

## Layout — the critical change

**Current:** App.jsx wraps MascotShell in:
```jsx
<div style={{ position: 'fixed', bottom: 130, left: 12, zIndex: 60 }}>
  <MascotShell ... />
</div>
```
MascotShell renders: `SpeechBubble` above + `MascotCharacter` below.

**New:** Remove that wrapper div from App.jsx entirely. MascotShell itself becomes the dock strip:

```jsx
// MascotShell renders (position:fixed, full-width dock row):
<div style={{
  position: 'fixed',
  bottom: 76,          // sits just above the chat input bar (which is ~72px tall)
  left: 12,
  right: 16,
  zIndex: 60,
  display: 'flex',
  alignItems: 'flex-end',
  gap: 9,
  pointerEvents: 'none',  // clicks pass through empty space
}}>
  <div style={{ pointerEvents: 'auto' }}>  {/* Plusi is clickable */}
    <MascotCharacter ... />
  </div>
  <CompanionCard ... />   {/* thinking dots OR reply text */}
</div>
```

The dock spans from Plusi's left edge to near the right edge. CompanionCard has `pointerEvents: 'none'` (display only, no interaction).

---

## Visual Design Reference

### Glow states on Plusi
- **Idle / companion-mode off:** no filter (`filter: none`) on `.plus-wrap` — no glow, no box-shadow anywhere
- **Companion-mode active:** apply via inline `style` on the `.plus-wrap` div:
  ```css
  filter: drop-shadow(0 0 4px rgba(0,122,255,.95)) drop-shadow(0 0 10px rgba(0,122,255,.5));
  ```
  This makes the blue bars themselves glow, not any container.
- MascotShell container (`mascot-glow-pulse`, `box-shadow`) is completely removed.

### Apple Glass Card CSS
```css
/* Card base */
.companion-card {
  position: relative;
  border-radius: 12px;
  background: linear-gradient(135deg,
    rgba(0,55,120,.62) 0%,
    rgba(0,30,72,.74) 55%,
    rgba(0,18,52,.80) 100%);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  overflow: hidden;
}

/* Diagonal gradient border — top-left/bottom-right bright, sides dark */
.companion-card::before {
  content: '';
  position: absolute; inset: 0; border-radius: 12px; padding: 1px;
  background: linear-gradient(135deg,
    rgba(255,255,255,.62) 0%,
    rgba(255,255,255,.12) 35%,
    rgba(255,255,255,.02) 55%,
    rgba(255,255,255,.10) 78%,
    rgba(255,255,255,.38) 100%);
  /* Both prefixed and unprefixed for Chromium/QWebEngineView compat */
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
```

### Sync float animation — Plusi and Card move together
```css
@keyframes float-sync { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
```
Apply `animation: float-sync 3.5s ease-in-out infinite` to both:
- `.plus-wrap` inside MascotCharacter
- `.companion-card` inside CompanionCard

When card is in reply state, also apply `transform: translateY(-2px)` as a base offset (handled via JS state, added on top of the float animation via `style`).

### Eye animation — thinking state
New CSS class `mascot-pupil-think` replaces `mascot-pupil-dart` for the `thinking` mood in `MOODS` map:

```css
/* Irregular 9s loop — not a mechanical ping-pong */
@keyframes mascot-eye-natural {
  0%   { transform: translate(0px, 0px); }
  8%   { transform: translate(-1.2px, -1.4px); }
  16%  { transform: translate(-1.2px, -1.4px); }  /* hold */
  24%  { transform: translate(1.3px, -1.2px);  }
  30%  { transform: translate(1.3px, -1.2px);  }  /* hold */
  38%  { transform: translate(0px, -1.5px);    }
  44%  { transform: translate(0px, -1.5px);    }  /* hold */
  52%  { transform: translate(-0.8px, -0.5px); }
  58%  { transform: translate(0px, 0px);       }
  72%  { transform: translate(0px, 0px);       }  /* long pause */
  80%  { transform: translate(1px, -1.3px);    }
  86%  { transform: translate(-1.2px, -1.0px); }
  92%  { transform: translate(0px, -1.4px);    }
  100% { transform: translate(0px, 0px);       }
}

.mascot-pupil-think {
  animation: mascot-eye-natural 9s ease-in-out infinite;
}
```

In `MOODS.thinking`, change `pupilClass: 'mascot-pupil-dart'` → `pupilClass: 'mascot-pupil-think'`.

The existing `transition: transform 0.6s cubic-bezier(0.25,0.46,0.45,0.94)` on `.mascot-pupil` ensures smooth entry/exit when the animation starts/stops.

### Mouth states
Add a new CSS class to MASCOT_CSS:
```css
.mascot-mouth-smile { width: 11px; height: 5px; background: #003a80; border-radius: 0 0 8px 8px; margin-top: 1px; }
```

In `MOODS` map, change `thinking` and `neutral` to use `mascot-mouth-d` (existing), reply/happy states use `mascot-mouth-smile` — but actually the mouth is mood-driven, so this is fine as-is. The `isReplying` flag in MascotCharacter overrides the mouth class regardless of mood:
- `isThinking=true` → force `mascot-mouth-d`
- `isReplying=true` → force `mascot-mouth-smile`
- otherwise → use `m.mouthClass` from MOODS map

---

## CompanionCard component (new file)

**File:** `frontend/src/components/CompanionCard.jsx`

```jsx
// Props:
//   isThinking: bool — show dots
//   text: string | null — show reply text (ignored when isThinking)
//   visible: bool — if false, render nothing (companion mode off)

// Width transition technique:
// Cannot CSS-transition from auto to flex:1.
// Solution: use a JS-measured ref width.
//   - When isThinking: width = 'auto', measured by content (3 dots + padding)
//   - When isReplying: width = cardRef.current.parentElement.offsetWidth - plusWidth - gap
//     applied as explicit px value, so CSS transition works.
// Use useEffect to apply width on state change, transition via inline style.

const TRANSITION = 'width 0.38s cubic-bezier(0.34,1.1,0.64,1), transform 0.38s cubic-bezier(0.34,1.1,0.64,1)';
```

**Thinking dots CSS (inside CompanionCard's injected `<style>`):**
```css
@keyframes companion-dot-bounce {
  0%,80%,100% { transform: translateY(0); opacity: .45; }
  40%          { transform: translateY(-4px); opacity: 1; }
}
.companion-dot {
  width: 5px; height: 5px; border-radius: 50%;
  background: rgba(120,190,255,.75);
  animation: companion-dot-bounce 1.1s ease-in-out infinite;
}
```

Three dots with `animationDelay: 0s / 0.22s / 0.44s`.

**Reply text CSS:**
```css
@keyframes companion-text-in { from{opacity:0;transform:translateY(2px)} to{opacity:1;transform:translateY(0)} }
.companion-text {
  font-size: 12.5px; line-height: 1.45; color: rgba(205,228,255,.9);
  padding: 9px 13px;
  max-height: 56px;   /* 2 lines × ~18px + 18px padding — no scroll */
  overflow: hidden;
  animation: companion-text-in 0.35s ease;
}
```

`overflow: hidden` with no scrollbar, no scroll action. Text that exceeds 2 lines is clipped (the AI is instructed to stay within 85 chars so this should not happen in practice).

---

## Component Changes

### `MascotShell.jsx` — rewrite
- **Remove:** `SpeechBubble` import and usage, `ThinkingBubble` inner function, all `mascot-glow-pulse` CSS, `box-shadow` in container style, the `SHELL_CSS` style tag
- **Remove:** `bubbleText`, `onBubbleDismiss` props (no longer needed — CompanionCard owns display)
- **Add:** `CompanionCard` import
- **Add:** props `isThinking: bool`, `replyText: string | null`
- **Add:** `tapKey` state + click handler (existing tap reaction logic, keep it)
- **Change:** container becomes the dock strip (see Layout section above)
- **Change:** `active` prop now only passed to `MascotCharacter` for glow filter — no longer controls container styling

New prop signature:
```jsx
MascotShell({ mood, active, isThinking, replyText, onClick, enabled })
```

### `MascotCharacter.jsx`
- **Add:** `active` prop (bool) → controls `filter` on `.plus-wrap` via inline style: `filter: active ? 'drop-shadow(...)' : 'none'`
- **Add:** `isThinking` prop (bool) → when true: override mouth class with `mascot-mouth-d`, eye animation already handled by `mascot-pupil-think` in MOODS.thinking
- **Add:** `isReplying` prop (bool) → when true: override mouth class with `mascot-mouth-smile`
- **Change:** `MOODS.thinking.pupilClass`: `'mascot-pupil-dart'` → `'mascot-pupil-think'`
- **Add:** `mascot-pupil-think` and `mascot-eye-natural` to `MASCOT_CSS`
- **Add:** `mascot-mouth-smile` to `MASCOT_CSS`
- **Remove:** `mascot-glow-pulse` from `MASCOT_CSS` (if present)
- Keep: eye tracking (mouse follow), tap reactions, all existing animations

### `SpeechBubble.jsx` — delete this file
Remove the import and JSX from App.jsx as well.

### `frontend/src/components/CompanionCard.jsx` — new file
See CompanionCard section above.

### `App.jsx`
- **Remove:** the `<div style={{ position: 'fixed', bottom: 130, left: 12, zIndex: 60 }}>` wrapper around `<MascotShell>`
- **Remove:** `bubbleText` state passed to MascotShell (SpeechBubble is gone)
- **Remove:** `onBubbleDismiss` handler passed to MascotShell
- **Keep:** `bubbleText` state — rename to `companionReplyText` for clarity, pass as `replyText` to MascotShell
- **Add:** pass `isThinking={companionHook.isLoading}` to MascotShell
- **Change:** MascotShell call site:
  ```jsx
  <MascotShell
    mood={mood}
    active={companionMode}
    isThinking={companionIsLoading}
    replyText={companionReplyText}
    onClick={handleMascotClick}
    enabled={mascotEnabled}
  />
  ```
  (No wrapper div — MascotShell positions itself via `position:fixed`)

### `useCompanion.js`
- **Update** `COMPANION_SYSTEM_PROMPT` — add to the TECHNISCH section:
  ```
  - Maximal 85 Zeichen pro Antwort — zähle mit. Kürzer ist immer besser.
  ```
- **Update** `handleChunk` — make mood-prefix matching robust against Gemini markdown wrapping:
  ```js
  // Strip markdown code fences if present before matching mood prefix
  const cleanBuffer = bufferRef.current
    .replace(/^```(?:json)?\n?/, '')
    .replace(/\n?```$/, '');
  const match = cleanBuffer.match(MOOD_REGEX);
  ```
- **Update** `MOOD_REGEX` — allow leading whitespace:
  ```js
  const MOOD_REGEX = /^\s*\{"mood":"([a-z]+)"\}\n?/;
  ```
- **Update** silent bridge guard — replace with visible fallback:
  ```js
  if (!window.ankiBridge) {
    onBubble?.('(Plusi ist nur in Anki verfügbar)');
    setIsLoading(false);
    onMood?.('neutral');
    return;
  }
  ```

---

## File Summary

| File | Action |
|---|---|
| `frontend/src/components/MascotShell.jsx` | Rewrite — becomes the dock strip, removes bubbles, uses CompanionCard |
| `frontend/src/components/MascotCharacter.jsx` | Update — glow via filter prop, new thinking/replying props, eye+mouth changes |
| `frontend/src/components/CompanionCard.jsx` | **New** — Apple Glass card with dots (thinking) or text (reply) |
| `frontend/src/components/SpeechBubble.jsx` | **Delete** — no longer used |
| `frontend/src/hooks/useCompanion.js` | Update — 85-char constraint, markdown fence strip, MOOD_REGEX whitespace fix, bridge fallback |
| `frontend/src/App.jsx` | Update — remove MascotShell wrapper div, update prop names, remove SpeechBubble wiring |
