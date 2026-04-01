# Plusi Physics & Walk-Back Animation

**Date:** 2026-03-26
**Status:** Approved

## Summary

Add gravity physics and walk-back animation to the Plusi mascot. When dropped, Plusi falls to the screen bottom with realistic gravity, then walks back to his home position with a side-view walking animation, and hops back into his elevated home slot.

## Behavior Sequence

### 1. Drop (existing drag release)
- User releases Plusi at arbitrary position
- If >30px from home (existing snap threshold), proceed to fall sequence

### 2. Fall
- **Gravity:** `vy -= GRAVITY * dt` (GRAVITY ~1800 px/s²)
- **Ground:** `y = 0` (absolute bottom edge of window)
- **Expression:** Surprised face during fall (wide eyes, O-mouth)
- **Rotation:** Slight tilt based on velocity

### 3. Impact
- **Squish:** scaleY(0.75) scaleX(1.15) for ~80ms, then spring back
- **Expression:** Flat-line mouth, squinted eyes
- **Duration:** ~450ms total before turning

### 4. Turn to Side View
- **Transition:** rotateY(0→90°) over 150ms, swap SVG at midpoint, rotateY(90°→0°)
- **Side SVG:** Hybrid A+D — capsule body (rx=12) with shoulder nubs (rx=8, front full opacity, back 0.35)
- **Face:** Single eye (right side), profile mouth
- **Mirror:** `scaleX(-1)` when walking left, no mirror when walking right

### 5. Walk
- **Speed:** ~80 px/s horizontal
- **Step frequency:** ~5 steps/s
- **Step bounce:** `abs(sin(stepPhase)) * 8px` vertical
- **Shoulder sway:** `sin(stepPhase) * 20°` rotateY oscillation
- **Body tilt:** `sin(stepPhase) * 3.5°` synchronized with sway
- **Nub depth:** Front nub opacity `0.5 + 0.5 * sin(phase)`, back nub `0.5 - 0.4 * sin(phase)`
- **Direction:** Always toward home position (left or right depending on drop location)

### 6. Stop (under home)
- Arrives at x ≈ homeX, y = 0 (ground level, directly below home slot)
- Decelerates, settles, sway dampens to 0 over ~300ms

### 7. Crouch
- Squish down: scaleY(0.8) scaleX(1.12) over ~200ms
- Prepares for vertical jump

### 8. Jump
- **Velocity:** vy ≈ 380 px/s upward
- **Turn to front:** Swap to front SVG during launch
- **Stretch:** scaleY(1.08) scaleX(0.94) during ascent
- **Gravity:** Same constant pulls back down
- **Arc peak:** Passes through home height, snaps on descent

### 9. Snap into Home
- Land squish: scaleY(0.88) scaleX(1.08) for ~100ms
- Spring settle: cubic-bezier(0.34, 1.56, 0.64, 1) back to scale(1)
- **Expression:** Happy face (closed-eye smile)
- Resume normal idle animation (float)

## Side View SVG Design (Hybrid A+D)

```
ViewBox: 0 0 120 120 (same as front)
Body:     rect x=38 y=5 w=44 h=110 rx=12 (capsule, slightly wider than front's 40)
Nub back: rect x=27 y=38 w=16 h=32 rx=8 opacity=0.35
Nub front: rect x=77 y=38 w=16 h=32 rx=8 opacity=1.0
Eye:       ellipse cx=67 cy=49 rx=7 ry=8 (single, right-side)
Pupil:     ellipse cx=69 cy=50 rx=4 ry=4
Mouth:     path "M 65 68 Q 72 72 78 68" (profile curve)
```

Mirroring: `scaleX(-1)` on the SVG element for opposite direction.

## Files to Modify

1. **`shared/plusi-renderer.js`** — Add `buildSideSVG()` function exposing side-view SVG generation. Add to the `createPlusi` API.
2. **`frontend/src/components/MascotShell.jsx`** — Replace current snap-back logic with physics state machine (fall → impact → turn → walk → stop → crouch → jump → snap). Add `requestAnimationFrame` loop for physics simulation.
3. **`frontend/src/components/MascotCharacter.jsx`** — Add method to swap between front/side SVG views.

## Constraints

- All physics run in `requestAnimationFrame` (no CSS animation for physics)
- CSS transitions only for squish/spring effects (short, non-physics)
- Side SVG uses same mood color system (aura, integrity)
- Walk animation must not interfere with existing drag, tap, shake, eye-tracking features
- Portal to `document.body` stays — no DOM remounting during animation
