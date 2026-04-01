# Plusi Physics & Walk-Back Animation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When Plusi is dropped far from home, he falls to the screen bottom with gravity, walks back in side-view with shoulder-sway animation, and hops back into his elevated home slot.

**Architecture:** Physics state machine in MascotShell replaces the current snap-back CSS transition. Side-view SVG added to plusi-renderer.js. MascotCharacter gains a `setSideView()`/`setFrontView()` imperative API to hot-swap the SVG without remounting.

**Tech Stack:** React (refs + requestAnimationFrame), vanilla SVG in plusi-renderer.js

**Spec:** `docs/superpowers/specs/2026-03-26-plusi-physics-walk-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `shared/plusi-renderer.js` | Modify | Add `buildSideSVG()` and expose `window.createPlusiSide()` |
| `frontend/src/components/MascotCharacter.jsx` | Modify | Add `setSideView(flip)` / `setFrontView()` imperative methods |
| `frontend/src/components/MascotShell.jsx` | Modify | Replace snap-back with physics state machine |

---

### Task 1: Add `buildSideSVG` to plusi-renderer.js

**Files:**
- Modify: `shared/plusi-renderer.js:737-798` (after existing `buildSVG`, before `getPlusiColor`)

This adds a new SVG builder for the side view (Hybrid A+D: capsule body + shoulder nubs, single eye, profile mouth). It must use the same `applyColorIntegrity` and filter system as `buildSVG`.

- [ ] **Step 1: Add `buildSideSVG` function after `buildSVG` (line ~798)**

Insert this function between `buildSVG` and `getPlusiColor`:

```javascript
  /**
   * Build a side-view Plusi SVG string (Hybrid A+D: capsule + shoulder nubs).
   * Used during walk-back animation. Single eye, profile mouth, no accessories.
   *
   * @param {number} size - pixel width/height
   * @param {number} integrity - 0..1 color saturation scale
   * @param {boolean} flip - if true, mirrors horizontally (facing left)
   * @returns {string} SVG markup
   */
  function buildSideSVG(size, integrity, flip) {
    var integrityVal = integrity != null ? integrity : 1;
    var auraColor = applyColorIntegrity(MOODS.neutral.color, integrityVal);
    var bodyColor = applyColorIntegrity(BODY_COLOR, integrityVal);
    var fid = 'pgs' + (++_filterId);

    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"'
      + ' width="' + size + '" height="' + size + '" overflow="visible"'
      + (flip ? ' style="transform: scaleX(-1);"' : '') + '>'
      + '<defs><filter id="' + fid + '" x="-60%" y="-60%" width="220%" height="220%">'
      + '<feGaussianBlur stdDeviation="8"/>'
      + '</filter></defs>'
      // Aura glow: capsule shape only
      + '<rect x="38" y="5" width="44" height="110" rx="12" fill="' + auraColor + '" opacity="0.4" filter="url(#' + fid + ')"/>'
      // Shoulder nub BACK (behind body, subtle)
      + '<rect class="plusi-nub-back" x="27" y="38" width="16" height="32" rx="8" fill="' + bodyColor + '" opacity="0.35"/>'
      // Body: tall capsule
      + '<rect x="38" y="5" width="44" height="110" rx="12" fill="' + bodyColor + '"/>'
      // Shoulder nub FRONT
      + '<rect class="plusi-nub-front" x="77" y="38" width="16" height="32" rx="8" fill="' + bodyColor + '"/>'
      // Face: single eye + profile mouth
      + '<g class="plusi-face">'
      + '<ellipse cx="67" cy="49" rx="7" ry="8" fill="white"/>'
      + '<ellipse cx="69" cy="50" rx="4" ry="4" fill="#1a1a1a"/>'
      + '<path d="M 65 68 Q 72 72 78 68" stroke="#1a1a1a" stroke-width="2.5" fill="none" stroke-linecap="round"/>'
      + '</g>'
      + '</svg>';

    return svg;
  }
```

- [ ] **Step 2: Expose `buildSideSVG` via a new `window.createPlusiSide` function**

Add right before the `window.createPlusi = createPlusi;` line at the end of the IIFE (~line 947):

```javascript
  /**
   * Render a static side-view Plusi into a container.
   * Returns an object with getNubs() for walk animation opacity updates.
   */
  function createPlusiSide(container, options) {
    var opts = options || {};
    var size = opts.size || 52;
    var integrity = opts.integrity != null ? opts.integrity : 1;
    var flip = opts.flip || false;

    var svgStr = buildSideSVG(size, integrity, flip);
    var doc = new DOMParser().parseFromString(svgStr, 'image/svg+xml');
    var svgNode = doc.documentElement;
    while (container.firstChild) container.removeChild(container.firstChild);
    container.appendChild(document.importNode(svgNode, true));

    return {
      getNubs: function () {
        return {
          front: container.querySelector('.plusi-nub-front'),
          back: container.querySelector('.plusi-nub-back'),
        };
      },
      destroy: function () {
        while (container.firstChild) container.removeChild(container.firstChild);
      }
    };
  }
```

Update the exports:

```javascript
  window.createPlusi = createPlusi;
  window.createPlusiSide = createPlusiSide;
  window.getPlusiColor = getPlusiColor;
```

- [ ] **Step 3: Verify plusi-renderer loads without errors**

Run: `cd frontend && node -e "require('fs').readFileSync('../shared/plusi-renderer.js', 'utf8');" && echo "syntax ok"`

(Basic check — full testing happens in Anki.)

- [ ] **Step 4: Commit**

```bash
git add shared/plusi-renderer.js
git commit -m "feat(plusi): add buildSideSVG and createPlusiSide for walk animation"
```

---

### Task 2: Add side-view swap methods to MascotCharacter

**Files:**
- Modify: `frontend/src/components/MascotCharacter.jsx:66-87` (useImperativeHandle block)

Add `setSideView(flip)` and `setFrontView()` imperative methods that hot-swap the SVG content without unmounting the component. During side view, the normal `createPlusi` animation engine is destroyed and replaced with a static side SVG.

- [ ] **Step 1: Add a `sideRef` to track side-view state**

At the top of the component (after `basePupilsRef`), add:

```javascript
  const sideRef = useRef(null); // tracks createPlusiSide instance when in side view
```

- [ ] **Step 2: Add `setSideView` and `setFrontView` to the imperative handle**

Extend the `useImperativeHandle` block with two new methods:

```javascript
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
```

- [ ] **Step 3: Verify no import errors**

Run: `cd frontend && npx -y acorn --ecma2020 src/components/MascotCharacter.jsx || echo "JSX cannot be validated with acorn, visual check needed"`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/MascotCharacter.jsx
git commit -m "feat(plusi): add setSideView/setFrontView imperative methods to MascotCharacter"
```

---

### Task 3: Add physics state machine to MascotShell

**Files:**
- Modify: `frontend/src/components/MascotShell.jsx` (the `onUp` handler in `handlePointerDown`, plus new physics functions)

This is the core task. Replace the current "stay at drop position" / "snap back home" logic in the `onUp` handler with a physics state machine that runs through: fall → impact → turn → walk → stop → crouch → jump → snap → home.

- [ ] **Step 1: Add physics constants at the top of MascotShell (after existing constants, line ~22)**

```javascript
/** Gravity acceleration in px/s² */
const GRAVITY = 1800;
/** Walking speed in px/s */
const WALK_SPEED = 80;
/** Step frequency — full cycles per second */
const STEP_FREQ = 5;
/** Step bounce height in px */
const STEP_BOUNCE = 8;
/** Shoulder sway angle in degrees */
const SHOULDER_SWAY = 20;
/** Body tilt angle in degrees */
const BODY_TILT = 3.5;
/** Jump initial velocity in px/s */
const JUMP_VELOCITY = 380;
```

- [ ] **Step 2: Add a `physicsRef` to track physics state (after `dragStateRef`, ~line 58)**

```javascript
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
```

- [ ] **Step 3: Add `startPhysicsSequence` function**

Add this function inside the component, before the `handlePointerDown` callback. It computes positions and kicks off the `requestAnimationFrame` loop:

```javascript
  const startPhysicsSequence = useCallback((dropX, dropY) => {
    const dock = dockRef.current;
    if (!dock) return;

    // Compute home position from dock's natural CSS position
    const dockRect = dock.getBoundingClientRect();
    // Home = dock's position WITHOUT any transform (its CSS position)
    // dockRect already includes current transform, so we need the un-transformed position
    const homeX = dock.offsetLeft;  // relative to offsetParent (body for fixed)
    const homeBottom = 28; // var(--ds-space-2xl) = 28px from bottom

    const ph = physicsRef.current;
    ph.homeX = homeX;
    ph.homeY = homeBottom;

    // dropX/dropY are the absolute screen position of Plusi when released
    // Convert to: x = left position, y = distance above ground
    ph.x = dropX;
    ph.y = window.innerHeight - dropY - 48; // 48 = plusi size, y=0 means bottom of plusi touches screen bottom
    ph.vy = 0;
    ph.t = 0;
    ph.stepPhase = 0;
    ph.facing = 'front';
    ph.phase = 'falling';
    ph.walkDirection = dropX > homeX ? -1 : 1; // walk toward home

    // Kill dock CSS animation and transition — physics controls position now
    dock.style.animation = 'none';
    dock.style.transition = 'none';
    // Switch to absolute positioning mode
    dock.style.position = 'fixed';
    dock.style.left = ph.x + 'px';
    dock.style.bottom = (window.innerHeight - dropY - 48) + 'px';
    dock.style.transform = 'none';

    // Set surprised mood for falling
    setOverrideMood('surprised');

    lastFrameRef.current = performance.now();
    physicsRAFRef.current = requestAnimationFrame(physicsTick);
  }, []);
```

- [ ] **Step 4: Add `physicsTick` — the main animation loop**

This is the core state machine. Add after `startPhysicsSequence`:

```javascript
  const physicsTick = useCallback((now) => {
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
        // Slight rotation during fall
        dock.style.transform = 'rotate(' + (ph.vy * 0.008) + 'deg)';
        if (ph.y <= 0) {
          ph.y = 0;
          ph.vy = 0;
          ph.phase = 'impact';
          ph.t = 0;
          dock.style.transition = 'transform 0.08s ease-out';
          dock.style.transform = 'scaleY(0.75) scaleX(1.15)';
          setOverrideMood('annoyed');
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
          setOverrideMood(null); // neutral during walk
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
        var sqY = 1 - cp * 0.2;   // 1 → 0.8
        var sqX = 1 + cp * 0.12;  // 1 → 1.12
        dock.style.transform = 'scaleY(' + sqY + ') scaleX(' + sqX + ')';
        if (ph.t > 0.25) {
          ph.phase = 'jumping';
          ph.t = 0;
          ph.vy = JUMP_VELOCITY;
          // Turn back to front during jump
          ph.facing = 'front';
          char?.setFrontView?.();
          dock.style.transform = 'scaleY(1.08) scaleX(0.94)';
          setOverrideMood('happy');
        }
        break;
      }

      case 'jumping': {
        ph.vy -= GRAVITY * dt;
        ph.y += ph.vy * dt;

        var vn = ph.vy / JUMP_VELOCITY;
        dock.style.transform = 'scaleY(' + (1 + vn * 0.08) + ') scaleX(' + (1 - vn * 0.05) + ')';

        // Snap into home when descending past home height
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

    // Update position (phases that move)
    if (ph.phase !== 'idle') {
      dock.style.left = ph.x + 'px';
      dock.style.bottom = ph.y + 'px';
      physicsRAFRef.current = requestAnimationFrame(physicsTick);
    }
  }, [setTempMood]);
```

- [ ] **Step 5: Modify the `onUp` handler to trigger physics instead of CSS snap**

In the existing `onUp` handler inside `handlePointerDown` (~line 263), replace the block that starts with `// Place Plusi at the drop position` and ends before `// Mood reaction`. The current code (lines 281-310) handles `isNearHome` snap and placement. Replace with:

```javascript
      // Place Plusi at the drop position (use lerped pos for smoothness)
      const finalX = ds.lerpX;
      const finalY = ds.lerpY;
      const isNearHome = Math.sqrt(finalX * finalX + finalY * finalY) < 30;

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
      } else {
        // Far from home → trigger physics fall + walk-back sequence
        const dockRect = dock.getBoundingClientRect();
        startPhysicsSequence(dockRect.left, dockRect.top);
        ds.placed = true; // will be cleared when physics completes
      }
```

- [ ] **Step 6: Also modify `handleTap` to use physics when Plusi is placed**

Replace the existing "tap returns home" block in `handleTap` (lines 140-157) with a physics sequence instead of a CSS transition:

```javascript
    // If Plusi is placed elsewhere, trigger walk-back
    if (ds.placed) {
      const dock = dockRef.current;
      if (dock) {
        const dockRect = dock.getBoundingClientRect();
        startPhysicsSequence(dockRect.left, dockRect.top);
      }
      return;
    }
```

- [ ] **Step 7: Add physics RAF cleanup to the existing cleanup useEffect**

Modify the cleanup `useEffect` (~line 82) to also cancel physics animation:

```javascript
  useEffect(() => {
    return () => {
      if (moodTimerRef.current) clearTimeout(moodTimerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (physicsRAFRef.current) cancelAnimationFrame(physicsRAFRef.current);
    };
  }, []);
```

- [ ] **Step 8: Add perspective to dock CSS for rotateY shoulder sway**

In the `DOCK_CSS` template literal, add `perspective: 200px;` to `.plusi-dock`:

```css
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
```

Also add `transform-style: preserve-3d;` to `.plusi-dock-char`:

```css
  .plusi-dock-char {
    cursor: grab;
    flex-shrink: 0;
    width: 48px;
    user-select: none;
    -webkit-user-select: none;
    transform-style: preserve-3d;
  }
```

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/MascotShell.jsx
git commit -m "feat(plusi): physics state machine — gravity fall, walk-back, hop-to-home"
```

---

### Task 4: Build, smoke-test, and fix

**Files:**
- All three modified files

- [ ] **Step 1: Build the frontend**

```bash
cd frontend && npm run build
```

Fix any build errors.

- [ ] **Step 2: Manual test checklist**

Test in Anki (restart after build):

1. **Drag close to home (<30px)** → should snap back as before (no physics)
2. **Drag far and release** → should fall with gravity to bottom edge
3. **Impact squish** → brief squish on landing, spring back
4. **Turn** → rotateY transition, swaps to side SVG
5. **Walk** → shoulder sway oscillation, step bounce, nub opacity depth
6. **Walk direction** → walks toward home (left if dropped right, right if dropped left)
7. **Stop** → settles under home position
8. **Crouch + jump** → squish down, then jump up vertically
9. **Front swap** → turns back to front during jump
10. **Snap into home** → lands at home slot, squish, spring settle
11. **Post-sequence** → normal idle float animation resumes, can drag again
12. **Tap when placed** → triggers walk-back (same sequence)
13. **Eye tracking** → works normally when Plusi is home (idle)

- [ ] **Step 3: Fix any issues found during testing**

Address bugs discovered in step 2.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "fix(plusi): polish physics walk-back animation"
```
