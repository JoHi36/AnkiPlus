# Plusi Character System — Unified Renderer & Animation Engine

**Date:** 2026-03-21
**Status:** Design approved

## Problem

Plusi's visual representation is split across two independent render pipelines:
- `MascotCharacter.jsx` (React, ~200 lines CSS animations)
- `dock.py` (Python-injected HTML/CSS/JS, ~100 lines)

Both render the same character but define body shape, animations, mood-to-animation mappings, and colors independently. Changes must be made in two places. Additionally, current animations are short loops (3–5s) that feel mechanical when a mood persists for minutes.

## Solution

A single Vanilla JS renderer (`shared/plusi-renderer.js`) that renders Plusi in every context. React wraps it thinly; dock.py injects it as a `<script>` tag. Both call the same API.

## Emotion Set

### Layer 1: Moods (11)

| Mood | Face | Body | Status |
|------|------|------|--------|
| neutral | Normal eyes, blinking, gentle smile | float (dominant) | Keep |
| curious | Asymmetric eyes (one squinting), asymmetric mouth | tilt (dominant) | Keep |
| thinking | Normal eyes, irregular pupil movement, neutral mouth | float slow (dominant) | Rework — lighter than reflecting activity, no thought bubble |
| annoyed | Heavy lids, flat horizontal mouth | float minimal (dominant) | Keep |
| empathy | Heavy soft lids, sad smile | droop (dominant) | Keep |
| happy | Slightly closed relaxed eyes, subtle smile | float light (dominant) | Rework — not "Yay!", a content smirk |
| excited | Wide glowing eyes, slightly open mouth | bounce (dominant) | Rework — nerdy-intense, not childish |
| surprised | Round wide eyes, O mouth | pop once → neutral | Rework — flash state, brief |
| flustered | Small eyes with sideways glance, tiny crooked mouth | wiggle short | New (replaces blush) — Plusi's way of saying "ähm" |
| proud | Half-closed satisfied eyes, crooked grin | puff-up (dominant) | New — pattern-hunger satisfied, self-content |
| sleepy | Almost-shut slits, slightly open mouth | sway (dominant) | Rework — mood version, no sleep cap (that's the activity) |

### Layer 2: Activities (3)

Activities are autonomous actions. Each has a **mandatory accessoire** that visually distinguishes it from the corresponding mood.

| Activity | Face | Body | Accessoire |
|----------|------|------|------------|
| sleeping | Closed eyes, slightly open mouth | sway minimal | Sleep cap + Zzz particles rising |
| reflecting | Half-closed eyes, slowly circling pupils | float very slow | Thought bubble with "..." |
| reading | Slightly narrowed focused eyes, L→R scanning pupils | tilt light | Small book |

### Layer 3: Integrity Modifier

Not a mood — a continuous modifier (0–1) applied over everything:

- **Color saturation:** 30% (low) → 100% (high). Optional glow/shimmer above 0.8.
- **Animation amplitude:** 50% (low) → 130% (high). CSS scale/translate values multiplied by factor.
- **Variation breadth:** Low integrity = dominant move plays more often (monotonous). High integrity = rare moves appear more frequently (surprising, lively).
- **Timing:** Pauses between sub-animations are longer at low integrity (sluggish), shorter at high (energetic).

## Renderer Architecture

### File Structure

```
shared/
├── plusi-renderer.js    ← Central renderer (body + face + animation engine + accessoires)
└── plusi-moods.json     ← All mood definitions (face, moves, colors, accessoires)
```

**Replaces:**
- `shared/assets/plusi-faces.json` (migrated into plusi-moods.json)
- ~200 lines CSS animations in MascotCharacter.jsx
- ~100 lines HTML/CSS/JS rendering in dock.py
- MOOD_COLORS in PlusiWidget.jsx

### API

```js
const plusi = createPlusi(containerElement, {
  mood:      'neutral',   // 11 moods + 3 activities
  size:      48,          // px — scales SVG viewBox
  animated:  true,        // false = static SVG, no JS loop
  integrity: 0.7,         // 0–1 → color, amplitude, timing
});

// Live updates (no re-render needed)
plusi.setMood('curious');       // smooth transition
plusi.setIntegrity(0.3);        // color + animation adapts
plusi.tap();                    // tap reaction (pop/shake/squish)
plusi.destroy();                // cleanup, stops animation loop
```

### Module Format & Build Integration

The renderer must work in two fundamentally different loading contexts:

**Format:** IIFE (Immediately Invoked Function Expression) that exposes `window.createPlusi`. This is the simplest format that works everywhere — React imports it as a side-effect script, and dock.py injects it as a `<script>` tag. Mood data from `plusi-moods.json` is baked into the renderer at build time (Vite plugin or build script) to avoid runtime JSON loading.

**Build pipeline:** `shared/plusi-renderer.js` lives outside `frontend/src/`. Two integration paths:
- **React:** Vite alias (`@plusi` → `../shared/plusi-renderer.js`) so it can be imported. Vite bundles it into the React build output.
- **dock.py:** Reads the raw source file from `shared/plusi-renderer.js` at runtime and injects it as an inline `<script>` block (same pattern as current dock injection). Mood data is embedded in the file, so no separate JSON load needed.

**Color export:** The renderer exposes `getPlusiColor(mood, integrity)` so surrounding UI (PlusiWidget card border, background tint) can get the correct mood color without duplicating the color mapping.

### Consumer Integration

**React (MascotCharacter.jsx):** Becomes a thin wrapper. Calls `createPlusi()` in `useEffect`, forwards props as `setMood()` / `setIntegrity()` calls. Eye-tracking (mouse follow) remains in the wrapper as an optional enhancement.

**React mood state (useMascot.js):** The hook continues to manage mood priority logic (AI mood > event mood > neutral) and auto-revert timers. It does NOT manage animations — it only decides which mood is active, then calls `plusi.setMood()`. The renderer handles all visual transitions internally.

**Anki injection (dock.py):** Injects `plusi-renderer.js` as an inline `<script>` block. Creates Plusi instance in inline JS. Python updates via `runJavaScript("plusi.setMood('curious')")`.

**Static contexts (PlusiWidget.jsx header, chat icons):** Calls `createPlusi()` with `animated: false`. Renders a single SVG with correct face + color. No timer, no requestAnimationFrame. Integrity still affects color saturation. The `MOOD_FACES` and `MOOD_COLORS` dictionaries currently in PlusiWidget.jsx are removed — the renderer is the single source.

### Mood Data Format (plusi-moods.json)

Each mood defines:
- **face:** eyes, pupils, mouth, lids configuration (references to SVG building blocks)
- **body.moves:** Array of `{ name, weight, duration: [min, max] }` — weighted sub-animation palette
- **body.pause:** `[min, max]` seconds between sub-animations
- **color:** Base hex color
- **accessoire:** `null` or `{ type, particles }` for activities

### Animation Engine

Lives inside `plusi-renderer.js`. Core loop:

1. Load mood's move palette
2. Pick next move via weighted random selection
3. Pick random duration from move's `[min, max]` range
4. Play CSS animation (applied as class or inline keyframe)
5. Sync face: micro-expressions react to body move (hop → eyes widen, squish → blink, etc.)
6. Random pause from mood's pause range
7. Repeat

**Independent systems running in parallel:**
- Blink timer: random interval 3–7 seconds
- Eye tracking: optional, only when mouse is within radius (React contexts)

**Mood transitions:**
- Current sub-animation plays out (doesn't cut)
- Color: CSS transition crossfade (300ms)
- Face: opacity crossfade (old face fades out, new face fades in, 200ms). Not shape morphing — crossfade is simpler and looks clean at 48px.
- New mood palette loads, next dice roll uses new moves
- Accessoires: fade in/out for activities

### Body Movement Library

12 reusable CSS animations, shared across all moods:

| Move | Description | Typical use |
|------|-------------|-------------|
| float | Gentle up/down hover | neutral, thinking, empathy |
| hop | Small upward jump | neutral (variation), curious, excited |
| tilt | Side lean/head tilt | curious, reading, proud |
| wiggle | Quick left-right shake | flustered |
| droop | Sink downward | empathy, sleepy |
| bounce | Springy up/down | excited |
| spin | Small rotation (±15°) | neutral/curious (rare variation) |
| squish | Compress + stretch vertically | organic idle variation |
| pop | Quick scale-up burst | surprised (one-shot) |
| sway | Slow side-to-side rock | sleepy, sleeping |
| puff-up | Slight inflate + hold | proud |
| peek | Lean to side, looking around corner | neutral/curious (variation) |

### Face System

The current faces (`plusi-faces.json`) are simple SVG elements — basic ellipses for eyes and paths for mouths. The new system redesigns faces to be more expressive and alive.

**Face building blocks** (all defined as SVG elements in `plusi-moods.json`):

| Part | Variants | Description |
|------|----------|-------------|
| Eyes (sclera) | normal, wide, narrow, squint, closed, half-shut | White ellipses, shape defines the emotion |
| Pupils | centered, wandering, focused, scanning, circling, up, sideways | Dark circles inside eyes, position/movement defines attention |
| Eyelids | none, light, heavy, one-squint | Overlays that partially cover eyes, convey energy/mood |
| Mouth | smile, smirk, flat, open, tiny, crooked, sad-curve | Paths with varying curvature |
| Extras | blush-circles, sweat-drop | Optional per-mood additions |

**Face animations** (independent of body, run in parallel):

| Animation | Description | Trigger |
|-----------|-------------|---------|
| Blink | Both eyes close briefly (100ms) | Random timer, 3–7s interval |
| Pupil wander | Pupils drift slowly in random directions | Idle state within mood |
| Pupil scan | Pupils move left→right rhythmically | `reading` activity |
| Pupil circle | Pupils trace slow circles | `reflecting` activity |
| Pupil snap | Pupils quickly lock onto a direction | Body `peek` or `tilt` move |
| Lid droop | Eyelids gradually get heavier | Low energy moods, body `droop` |
| Mouth twitch | Tiny mouth movement | Occasional idle variation |
| Eye widen | Eyes briefly enlarge | Body `hop` or `pop` move |

**Design principles for faces:**
- Faces must read clearly at 24px (static) and 48px (animated). Avoid fine details that disappear at small sizes.
- Each mood's face should be identifiable even without body animation — if you screenshot any mood, you should be able to tell which one it is from the face alone.
- Expressions should feel like Plusi's character: subtle, dry, never over-the-top. `happy` is a smirk, not a grin. `excited` is wide eyes, not a cartoon face.

### Face-Body Synchronization

When a body move plays, the face reacts with micro-expressions:

- **hop** → eyes widen briefly
- **peek** → pupils shift in lean direction
- **squish** → eyes close briefly (blink)
- **droop** → eyelids get heavier
- **spin** → pupils follow rotation direction
- **puff-up** → mouth becomes satisfied grin
- **pop** → eyes go wide, then relax

### Static Mode (`animated: false`)

- No JS state machine, no animation loop, no timers
- Renders a single SVG element: body shape + face for current mood
- Integrity affects color saturation only
- Accessoires are shown (book for reading, etc.)
- Minimal footprint — pure SVG, suitable for inline use at any size

## Migration Plan

### Files to Create
- `shared/plusi-renderer.js` — central renderer
- `shared/plusi-moods.json` — mood definitions

### Files to Modify
- `frontend/src/components/MascotCharacter.jsx` — strip to thin wrapper
- `frontend/src/components/PlusiWidget.jsx` — use renderer (static mode); remove `MOOD_FACES`, `MOOD_COLORS`, `MOOD_META` dictionaries
- `frontend/src/components/MascotShell.jsx` — use renderer
- `frontend/src/hooks/useMascot.js` — keep mood priority logic, remove animation concerns, call `plusi.setMood()`
- `plusi/dock.py` — inject renderer instead of custom HTML/CSS/JS
- `plusi/agent.py` — update `VALID_MOODS` AND `PLUSI_SYSTEM_PROMPT` mood list (add flustered, proud, sleeping, reflecting; remove blush)
- `plusi/storage.py` — if mood validation exists there
- `ui/custom_screens.py` — uses `get_plusi_dock_injection()`, must work with new renderer injection
- `custom_reviewer/__init__.py` — `_inject_plusi_dock` calls `get_plusi_dock_injection()`, needs update
- `ui/widget.py` — imports dock functions, update if API changes

### Files to Remove
- `shared/assets/plusi-faces.json` — migrated into plusi-moods.json

### Data to Migrate
- Face SVG definitions from plusi-faces.json → plusi-moods.json face configs
- `MOOD_FACES` JSX dictionary from PlusiWidget.jsx → plusi-moods.json
- `MOOD_COLORS` from PlusiWidget.jsx → plusi-moods.json color field
- `MOOD_META` (German labels) from PlusiWidget.jsx → plusi-moods.json label field
- Animation keyframes from MascotCharacter.jsx → plusi-renderer.js movement library
- Mood-to-animation mapping from dock.py → plusi-moods.json body.moves

### Backward Compatibility
If a user has a now-removed mood persisted in storage (e.g., `blush`), the renderer falls back to `neutral` gracefully. The renderer always checks `MOODS[mood] || MOODS.neutral`.

## Preview / Showroom Page

A standalone HTML page (`shared/plusi-showroom.html`) that loads the renderer and displays all states. Used during development to visually verify every mood, activity, and modifier combination.

**Features:**
- **Grid of all 14 states** (11 moods + 3 activities), each rendered as an animated Plusi at 64px
- **Integrity slider** (0–1) that applies to all instances simultaneously — immediately see how drained vs. vibrant looks across all moods
- **Size control** — switch between 24px (icon), 48px (dock), 64px (default), 100px (large) to verify scaling
- **Animated/Static toggle** — see both versions side by side
- **Tap test** — click any Plusi to trigger tap reaction
- **Individual mood inspector** — click a mood card to expand it to full size with details: which sub-animations are in the palette, current face state, integrity effect visualization

**How to open:**
```bash
# From project root — opens in default browser
open shared/plusi-showroom.html
```

The showroom loads `plusi-renderer.js` directly (no build step needed). Any change to the renderer or mood data is visible on browser refresh.

**Why this matters:** Without a showroom, validating visual changes requires restarting Anki or running the full React dev server. The showroom provides instant visual feedback during face/animation development.

## Design Decisions

**Why Vanilla JS, not a framework-specific component?**
The renderer must work in two fundamentally different contexts: React (chatbot panel) and raw Anki webviews (reviewer, deck browser). A Vanilla JS module is the only approach that serves both without duplication.

**Why a state machine instead of long CSS keyframes?**
Long keyframes (20–30s) would reduce repetition but are still predictable. A state machine with weighted random selection produces genuinely unpredictable sequences that feel alive. The cost is ~50 lines of JS loop logic.

**Why moods and activities in the same system?**
Activities (sleeping, reflecting, reading) use the same rendering pipeline — they just have an additional accessoire. Keeping them in the same system means one API, one data format, one renderer. The `type: "activity"` flag in the mood definition is the only distinction.

**Why integrity as a modifier, not separate moods?**
"Drained" and "cozy" are not emotions — they are the same emotions at different intensity levels. A continuous modifier produces natural gradations without combinatorial explosion (14 moods × discrete integrity levels).
