# Lid-Lift Transition: SearchBar → Agent Canvas

**Date:** 2026-03-29
**Status:** Approved
**Mockup:** `.superpowers/brainstorm/25685-1774810631/content/lid-lift-v6.html`

## Summary

The SearchBar on the Stapelansicht (deck browser) transforms into the ChatInput via a signature "Lid-Lift" animation. The bar tilts backward in 3D like a lid being opened, revealing a Cockpit element underneath, then drops down to become the ChatInput. A burst of blue sparks fires at the moment of separation. This is the app's signature transition — the moment the user enters the agentic workspace.

## Design Decisions

### Ein-Glas-Regel

Two glass elements coexist on screen after the transition, but with distinct roles:
- **Cockpit (top):** Status display — which deck is selected, card count, Enter to start learning. Read-only with one action.
- **ChatInput (bottom):** Active input — typing, agent chips, send. The primary interaction point.

Both have equal visual prominence (same glass material, same border weight). This works because they serve different cognitive functions (read vs. write) and don't compete for attention.

### Trigger

- **SPACE** key or click on the SearchBar (focus trigger, not submit)
- Animation starts immediately (no debounce, no anticipation delay)
- The SearchBar's `SPACE` badge indicates this affordance

### Why Lid-Lift

Three approaches were prototyped and compared:
- **A) Lid-Lift** — 3D tilt reveals cockpit underneath. Chosen for the "something was hidden and is now revealed" feeling.
- **B) Pressure Pop** — horizontal compression then explosion. Satisfying but less narratively clear.
- **C) Fold** — paper-fold effect. Interesting but felt gimmicky.

Lid-Lift won because it creates a causal story: the bar was covering something, you lift it, something appears.

## Animation Specification

### Phase 1: Lid Tilt (0–80ms)

The SearchBar tilts backward in 3D perspective.

```
transform-origin: center bottom
rotateX: 0° → -8° → -18° → -24°
top: 50px → 48px → 46px → 45px
```

The `SPACE` badge fades out immediately (100ms fade).

### Phase 2: Spark Burst (20ms delay)

12 blue spark particles fire radially from the top edge of the bar (the separation point). Each spark:
- Size: 3–5px with `box-shadow` glow
- Colors: mix of `rgba(10,132,255)` and `rgba(100,170,255)`
- Duration: 360–470ms each, staggered by 10–20ms
- Easing: `cubic-bezier(0.2, 0, 0, 1)` — fast start, gentle fade
- Travel distance: 35–70px outward in all directions
- Fade: opacity 1 → 0, scale 1 → 0.1

A soft elliptical glow (120×60px, `rgba(10,132,255, 0.25)`) flashes at the burst origin over 400ms.

### Phase 3: Cockpit Emerge (20ms delay)

The Cockpit starts hidden behind the bar (same position, lower z-index, `brightness(0.2)`).

```
Duration: 400ms
Easing: cubic-bezier(0.34, 1.56, 0.64, 1) — spring with overshoot

brightness: 0.2 → 0.5 → 0.8 → 1.0 → 1.05 (overshoot) → 1.0
scaleY: 0.5 → 0.84 → 1.0 → 1.03 (overshoot) → 1.0
scaleX: 0.88 → 0.95 → 1.0 → 1.012 (overshoot) → 1.0
top: 56px → 38px → 17px → 14px (overshoot) → 18px
opacity: 0 → 0.88 → 1.0
```

The brightness ramp creates the "emerging from shadow" effect — the cockpit materializes, not just fades in.

### Phase 4: Bar Drop (0ms delay, 360ms duration)

The bar snaps flat and drops to become the ChatInput.

```
Easing: cubic-bezier(0.16, 1, 0.3, 1) — fast departure, soft landing

rotateX: -24° → -14° → -5° → 0°  (snaps flat by ~115px)
top: 45px → 72px → 175px → 330px → 415px → 426px
width: 420px → 444px → 486px → 515px → 520px
height: 48px → 50px (subtle)
```

The placeholder text ("Erkläre die Nernst-Gleichung...") stays visible throughout. No text swap — the bar IS the input, it just moved.

Soft overshoot at landing: width briefly hits 521px then settles at 520px, top hits 427px then settles at 426px.

### Phase 5: Snake Border Ignition (400ms delay)

After the bar lands, the snake border fades in over 250ms. In the real implementation, this uses the existing `ds-input-dock` snake border animation (identical to the Session view ChatInput).

### Phase 6: Sidebar Slide (80ms delay, 300ms duration)

The sidebar slides in from the right simultaneously.

```
Easing: cubic-bezier(0.16, 1, 0.3, 1)
transform: translateX(100%) → translateX(0)
```

### Phase 7: Canvas Placeholder (250ms delay, 200ms fade)

The empty agent canvas placeholder (sparkle icon + "Frag mich etwas über diesen Stapel") fades in after the main animation settles.

### Deck Content Fade-Out (0ms delay, 220ms)

The existing deck browser content (title, graph nodes) fades out immediately on trigger.

## Cockpit States

### With Deck Selected
```
[📚] [Biochemie → Enzyme] [127] [|] [Lernen ↵]
```
- Deck icon + deck path
- Card count badge
- "Lernen ↵" action — pressing Enter starts a learning session

### Without Deck Selected
```
[Keine Auswahl] [ESC]
```
- Neutral text indicating no deck is selected
- ESC badge — pressing Escape returns to Stapelansicht

## Reverse Animation

### Empty Canvas (no messages sent)

Full reverse morph on ESC:
- ChatInput rises back to SearchBar position
- Cockpit sinks and darkens back into shadow
- Sidebar slides out
- Deck content fades back in
- SearchBar regains its SPACE badge

This is the "oops, didn't mean to" undo. Everything rewinds.

### With Conversation (messages exist)

Normal view transition (no morph):
- Standard slide/fade to Stapelansicht
- SearchBar appears fresh in its default position
- Conversation is preserved for when user returns

## Sidebar Behavior

### Consistent Across Views

The sidebar panel is the same component in Stapelansicht and Session. It shares:
- Width (user-resizable, persisted across views)
- Slide-in/out animation
- Position (right edge)

### View Transition Rules

| From | To | Animation |
|------|-----|-----------|
| Panel open → Panel open | Content swap, no slide animation |
| Panel open → Panel closed | Slide-out first, then view transition |
| Panel closed → Panel open | View transition first, then slide-in |

This matches the existing Session view behavior where opening/closing the chat sidebar is animated consistently.

## Input Position

The ChatInput sits at the **bottom of the full viewport**, not inside the sidebar. It spans the available width (minus sidebar), centered with `max-width` constraint.

```
position: fixed
bottom: 24px
left: calc(settings-offset + space-lg)
right: space-lg  (or sidebar-width + space when sidebar open)
max-width: var(--ds-content-width)
margin: 0 auto
```

This is the same positioning logic as the current unified ChatInput in `App.jsx` (lines 2882–2898), just with the Stapelansicht as an additional position state.

## Implementation Notes

### Component Changes

**DeckSearchBar** → Remove entirely. Replace with the unified ChatInput in its "deck browser" position state.

**ChatInput** → Add a new position state for `activeView === 'deckBrowser'` that places it centered at the top. On focus/SPACE, trigger the lid-lift animation to move it to the bottom position.

**New: CockpitBar** → Small component showing deck selection status. Rendered above the canvas when in agent view.

### Animation Technology

Use **framer-motion** `layout` animations for the bar movement (position + size interpolation). The 3D tilt (rotateX) uses CSS keyframes since framer-motion's layout animations don't handle 3D transforms. The spark burst is pure CSS keyframes.

### Keyboard Routing

Add SPACE as a trigger in `GlobalShortcutFilter` for the deck browser state. ESC already exists for closing panels — extend it to handle the reverse morph when canvas is empty.

### State Machine

```
deckBrowser (SearchBar visible, top-center)
  → SPACE/click → agentCanvas (ChatInput bottom, Cockpit top, Sidebar right)
    → ESC (no messages) → deckBrowser (reverse morph)
    → ESC (has messages) → deckBrowser (normal transition)
    → type + send → agentCanvas with conversation
```
