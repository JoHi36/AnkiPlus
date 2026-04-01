# Lid-Lift Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the DeckSearchBar with a signature "Lid-Lift" animation that transforms the SearchBar into the ChatInput, revealing a CockpitBar underneath.

**Architecture:** The existing unified ChatInput gets a new position state (`deckBrowser` top-center). On SPACE/click, CSS keyframe animations drive the 3D lid-tilt + drop, while a new CockpitBar component spring-animates into place. A new `agentCanvas` view state replaces the current `chat` transition from deck browser. The sidebar becomes a shared, consistently-animated panel across all views.

**Tech Stack:** React 18, CSS keyframes, framer-motion (layout animations), existing design system tokens

**Spec:** `docs/superpowers/specs/2026-03-29-lid-lift-transition-design.md`
**Mockup:** `.superpowers/brainstorm/25685-1774810631/content/lid-lift-v6.html`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `frontend/src/components/CockpitBar.tsx` | Deck status pill (top center), two states: with/without deck |
| Create | `frontend/src/components/SparkBurst.tsx` | 12-particle radial burst + glow, reusable animation component |
| Create | `frontend/src/components/LidLiftTransition.tsx` | Orchestrator: coordinates bar position, cockpit, sparks, sidebar timing |
| Create | `frontend/src/hooks/useLidLift.ts` | State machine: `idle` → `animating` → `open`, handles trigger + reverse |
| Create | `frontend/src/components/__tests__/useLidLift.test.ts` | Tests for the state machine hook |
| Modify | `frontend/src/App.jsx` | Wire up new view state, remove DeckSearchBar usage, add LidLiftTransition |
| Modify | `frontend/src/components/ChatInput.tsx` | Add `deckBrowser` position variant (top-center, SPACE badge) |
| Delete | `frontend/src/components/DeckSearchBar.jsx` | Replaced by ChatInput in deckBrowser position |

---

### Task 1: Create the useLidLift state machine hook

**Files:**
- Create: `frontend/src/hooks/useLidLift.ts`
- Create: `frontend/src/components/__tests__/useLidLift.test.ts`

- [ ] **Step 1: Write failing tests for the state machine**

```ts
// frontend/src/components/__tests__/useLidLift.test.ts
import { renderHook, act } from '@testing-library/react';
import { useLidLift } from '../../hooks/useLidLift';

describe('useLidLift', () => {
  it('starts in idle state', () => {
    const { result } = renderHook(() => useLidLift());
    expect(result.current.state).toBe('idle');
    expect(result.current.isOpen).toBe(false);
  });

  it('transitions to animating then open on trigger', () => {
    const { result } = renderHook(() => useLidLift());
    act(() => result.current.trigger());
    expect(result.current.state).toBe('animating');
    // After animation duration, should be open
    act(() => result.current.onAnimationComplete());
    expect(result.current.state).toBe('open');
    expect(result.current.isOpen).toBe(true);
  });

  it('reverse morphs from open to idle when no messages', () => {
    const { result } = renderHook(() => useLidLift());
    act(() => result.current.trigger());
    act(() => result.current.onAnimationComplete());
    expect(result.current.state).toBe('open');

    act(() => result.current.close(false)); // false = no messages
    expect(result.current.state).toBe('reversing');
    act(() => result.current.onAnimationComplete());
    expect(result.current.state).toBe('idle');
  });

  it('cuts to idle when closing with messages (no reverse morph)', () => {
    const { result } = renderHook(() => useLidLift());
    act(() => result.current.trigger());
    act(() => result.current.onAnimationComplete());

    act(() => result.current.close(true)); // true = has messages
    expect(result.current.state).toBe('idle');
  });

  it('does not trigger when already animating', () => {
    const { result } = renderHook(() => useLidLift());
    act(() => result.current.trigger());
    expect(result.current.state).toBe('animating');
    act(() => result.current.trigger()); // should be ignored
    expect(result.current.state).toBe('animating');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx jest --testPathPattern="useLidLift" --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the hook**

```ts
// frontend/src/hooks/useLidLift.ts
import { useState, useCallback } from 'react';

type LidLiftState = 'idle' | 'animating' | 'open' | 'reversing';

export function useLidLift() {
  const [state, setState] = useState<LidLiftState>('idle');

  const trigger = useCallback(() => {
    setState(prev => {
      if (prev !== 'idle') return prev;
      return 'animating';
    });
  }, []);

  const close = useCallback((hasMessages: boolean) => {
    setState(prev => {
      if (prev !== 'open') return prev;
      return hasMessages ? 'idle' : 'reversing';
    });
  }, []);

  const onAnimationComplete = useCallback(() => {
    setState(prev => {
      if (prev === 'animating') return 'open';
      if (prev === 'reversing') return 'idle';
      return prev;
    });
  }, []);

  return {
    state,
    isOpen: state === 'open',
    isAnimating: state === 'animating' || state === 'reversing',
    isReversing: state === 'reversing',
    trigger,
    close,
    onAnimationComplete,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx jest --testPathPattern="useLidLift" --no-coverage`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useLidLift.ts frontend/src/components/__tests__/useLidLift.test.ts
git commit -m "feat: add useLidLift state machine hook with tests"
```

---

### Task 2: Create the SparkBurst component

**Files:**
- Create: `frontend/src/components/SparkBurst.tsx`

- [ ] **Step 1: Create the spark burst component**

This is a pure CSS animation component — 12 particles that fire radially on mount, plus a glow flash.

```tsx
// frontend/src/components/SparkBurst.tsx
import React, { useEffect, useState } from 'react';

const SPARK_COUNT = 12;

// Pre-computed trajectories for each spark (dx, dy in px)
const TRAJECTORIES = [
  { dx: -45, dy: -28 }, { dx: 48, dy: -24 }, { dx: -30, dy: -40 },
  { dx: 32, dy: -38 }, { dx: -55, dy: -10 }, { dx: 58, dy: -8 },
  { dx: -18, dy: -48 }, { dx: 20, dy: -45 }, { dx: -40, dy: 12 },
  { dx: 42, dy: 10 },  { dx: -8, dy: -52 },  { dx: 5, dy: 18 },
];

const SIZES = [5, 4, 4, 5, 3.5, 3.5, 4, 4, 3, 3, 3.5, 3];
const DURATIONS = [450, 420, 400, 470, 400, 440, 380, 430, 360, 450, 400, 420];
const DELAYS = [20, 20, 30, 20, 30, 20, 30, 20, 40, 30, 20, 30];

const BURST_STYLE: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: 0,
  transform: 'translateX(-50%)',
  zIndex: 15,
  pointerEvents: 'none',
};

const GLOW_STYLE: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: 0,
  transform: 'translate(-50%, -50%)',
  width: 120,
  height: 60,
  borderRadius: '50%',
  background: 'radial-gradient(ellipse, rgba(10,132,255,0.25) 0%, transparent 70%)',
  pointerEvents: 'none',
  zIndex: 13,
};

interface SparkBurstProps {
  active: boolean;
}

export default function SparkBurst({ active }: SparkBurstProps) {
  const [key, setKey] = useState(0);

  // Re-mount particles on each activation to restart animations
  useEffect(() => {
    if (active) setKey(k => k + 1);
  }, [active]);

  if (!active) return null;

  return (
    <>
      <div style={GLOW_STYLE} key={`glow-${key}`} className="spark-glow" />
      <div style={BURST_STYLE} key={`burst-${key}`}>
        {TRAJECTORIES.map((t, i) => {
          const size = SIZES[i];
          const isLight = i % 3 === 2;
          const color = isLight ? 'rgba(100,170,255,0.9)' : 'rgba(10,132,255,1)';
          const shadow = isLight
            ? '0 0 4px 1px rgba(100,170,255,0.4)'
            : '0 0 6px 2px rgba(10,132,255,0.5)';
          return (
            <div
              key={i}
              className="spark-particle"
              style={{
                position: 'absolute',
                width: size,
                height: size,
                borderRadius: '50%',
                background: color,
                boxShadow: shadow,
                opacity: 0,
                '--spark-dx': `${t.dx}px`,
                '--spark-dy': `${t.dy}px`,
                '--spark-dur': `${DURATIONS[i]}ms`,
                '--spark-delay': `${DELAYS[i]}ms`,
                animation: `sparkFly var(--spark-dur) cubic-bezier(0.2,0,0,1) var(--spark-delay) forwards`,
              } as React.CSSProperties}
            />
          );
        })}
      </div>
      <style>{`
        @keyframes sparkFly {
          0%   { opacity: 0; transform: translate(0, 0) scale(1); }
          10%  { opacity: 1; }
          50%  { opacity: 0.5; transform: translate(calc(var(--spark-dx) * 0.6), calc(var(--spark-dy) * 0.6)) scale(0.5); }
          100% { opacity: 0; transform: translate(var(--spark-dx), var(--spark-dy)) scale(0.1); }
        }
        @keyframes sparkGlowFlash {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.3); }
          15%  { opacity: 1; transform: translate(-50%, -50%) scale(0.8); }
          35%  { opacity: 0.7; transform: translate(-50%, -50%) scale(1); }
          60%  { opacity: 0.3; transform: translate(-50%, -50%) scale(1.1); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(1.2); }
        }
        .spark-glow {
          animation: sparkGlowFlash 0.4s ease-out 0.02s forwards;
        }
      `}</style>
    </>
  );
}
```

- [ ] **Step 2: Verify no build errors**

Run: `cd frontend && npx tsc --noEmit --pretty`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/SparkBurst.tsx
git commit -m "feat: add SparkBurst particle animation component"
```

---

### Task 3: Create the CockpitBar component

**Files:**
- Create: `frontend/src/components/CockpitBar.tsx`

- [ ] **Step 1: Create the cockpit bar component**

```tsx
// frontend/src/components/CockpitBar.tsx
import React from 'react';

interface CockpitBarProps {
  deckName?: string | null;
  cardCount?: number;
  onStartLearning?: () => void;
  onClose?: () => void;
  animationState: 'hidden' | 'emerging' | 'visible' | 'reversing';
}

const COCKPIT_STYLE: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: 18,
  transform: 'translateX(-50%)',
  height: 44,
  borderRadius: 14,
  display: 'flex',
  alignItems: 'center',
  padding: '0 18px',
  gap: 10,
  zIndex: 7,
  whiteSpace: 'nowrap',
};

const COUNT_STYLE: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--ds-text-muted)',
  background: 'var(--ds-bg-overlay)',
  padding: '2px 8px',
  borderRadius: 5,
};

const DIVIDER_STYLE: React.CSSProperties = {
  width: 1,
  height: 13,
  background: 'var(--ds-border-subtle)',
};

const LEARN_STYLE: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--ds-accent)',
  fontWeight: 500,
  cursor: 'pointer',
  background: 'none',
  border: 'none',
  padding: 0,
  fontFamily: 'inherit',
};

const ESC_STYLE: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--ds-text-muted)',
  background: 'var(--ds-bg-overlay)',
  padding: '2px 7px',
  borderRadius: 5,
  fontWeight: 500,
};

export default function CockpitBar({
  deckName,
  cardCount,
  onStartLearning,
  onClose,
  animationState,
}: CockpitBarProps) {
  if (animationState === 'hidden') return null;

  const animClass =
    animationState === 'emerging' ? 'cockpit-emerge' :
    animationState === 'reversing' ? 'cockpit-reverse' :
    '';

  return (
    <>
      <div
        className={`ds-frosted ${animClass}`}
        style={{
          ...COCKPIT_STYLE,
          opacity: animationState === 'visible' ? 1 : undefined,
        }}
      >
        {deckName ? (
          <>
            <span style={{ fontSize: 12, color: 'var(--ds-text-tertiary)' }}>📚</span>
            <span style={{ fontSize: 13, color: 'var(--ds-text-secondary)', fontWeight: 500 }}>
              {deckName}
            </span>
            {cardCount != null && <span style={COUNT_STYLE}>{cardCount}</span>}
            <span style={DIVIDER_STYLE} />
            <button style={LEARN_STYLE} onClick={onStartLearning}>
              Lernen ↵
            </button>
          </>
        ) : (
          <>
            <span style={{ fontSize: 13, color: 'var(--ds-text-tertiary)', fontWeight: 500 }}>
              Keine Auswahl
            </span>
            <kbd style={ESC_STYLE} onClick={onClose}>ESC</kbd>
          </>
        )}
      </div>
      <style>{`
        .cockpit-emerge {
          opacity: 0;
          filter: brightness(0.2);
          transform: translateX(-50%) scaleX(0.88) scaleY(0.5);
          animation: cockpitEmerge 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.02s forwards;
        }
        .cockpit-reverse {
          animation: cockpitReverse 0.35s cubic-bezier(0.4, 0, 1, 1) forwards;
        }
        @keyframes cockpitEmerge {
          0%   { opacity: 0;    top: 56px; transform: translateX(-50%) scaleX(0.88) scaleY(0.5); filter: brightness(0.2); }
          20%  { opacity: 0.7;  top: 50px; transform: translateX(-50%) scaleX(0.91) scaleY(0.64); filter: brightness(0.5); }
          36%  { opacity: 0.88; top: 38px; transform: translateX(-50%) scaleX(0.95) scaleY(0.84); filter: brightness(0.8); }
          52%  { opacity: 0.98; top: 22px; transform: translateX(-50%) scaleX(0.99) scaleY(0.98); filter: brightness(0.97); }
          60%  { opacity: 1;    top: 17px; transform: translateX(-50%) scaleX(1.0) scaleY(1.0); filter: brightness(1); }
          68%  { opacity: 1;    top: 14px; transform: translateX(-50%) scaleX(1.012) scaleY(1.03); filter: brightness(1.05); }
          84%  { opacity: 1;    top: 18px; transform: translateX(-50%) scaleX(1.002) scaleY(1.004); filter: brightness(1.0); }
          100% { opacity: 1;    top: 18px; transform: translateX(-50%) scaleX(1) scaleY(1); filter: brightness(1); }
        }
        @keyframes cockpitReverse {
          0%   { opacity: 1; top: 18px; transform: translateX(-50%) scaleX(1) scaleY(1); filter: brightness(1); }
          40%  { opacity: 0.7; top: 30px; transform: translateX(-50%) scaleX(0.95) scaleY(0.8); filter: brightness(0.6); }
          70%  { opacity: 0.3; top: 45px; transform: translateX(-50%) scaleX(0.90) scaleY(0.6); filter: brightness(0.3); }
          100% { opacity: 0;   top: 56px; transform: translateX(-50%) scaleX(0.88) scaleY(0.5); filter: brightness(0.2); }
        }
      `}</style>
    </>
  );
}
```

- [ ] **Step 2: Verify no build errors**

Run: `cd frontend && npx tsc --noEmit --pretty`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/CockpitBar.tsx
git commit -m "feat: add CockpitBar component with emerge/reverse animations"
```

---

### Task 4: Add lid-lift CSS keyframes to the design system

**Files:**
- Modify: `frontend/src/index.css` (append keyframes at end)

The lid-tilt and lid-drop animations are CSS keyframes applied to the ChatInput wrapper when the lid-lift is triggered. These go in `index.css` since they're app-level animations (not design system primitives).

- [ ] **Step 1: Add keyframes**

Append to `frontend/src/index.css`:

```css
/* ── Lid-Lift Animation — SearchBar → ChatInput ── */
@keyframes lidDrop {
  0%   { top: 50px; width: 420px; transform: translateX(-50%) rotateX(0deg); transform-origin: center bottom; }
  8%   { top: 48px; width: 420px; transform: translateX(-50%) rotateX(-8deg); transform-origin: center bottom; }
  14%  { top: 46px; width: 420px; transform: translateX(-50%) rotateX(-18deg); transform-origin: center bottom; }
  20%  { top: 45px; width: 420px; transform: translateX(-50%) rotateX(-24deg); transform-origin: center bottom; }
  26%  { top: 52px; width: 420px; transform: translateX(-50%) rotateX(-14deg); transform-origin: center center; }
  32%  { top: 72px; width: 428px; transform: translateX(-50%) rotateX(-5deg); }
  38%  { top: 115px; width: 444px; transform: translateX(-50%) rotateX(-1deg); }
  44%  { top: 175px; width: 464px; transform: translateX(-50%) rotateX(0deg); }
  52%  { top: 255px; width: 486px; transform: translateX(-50%); }
  60%  { top: 330px; width: 504px; transform: translateX(-50%); }
  68%  { top: 385px; width: 515px; transform: translateX(-50%); }
  76%  { top: 415px; width: 520px; transform: translateX(-50%); }
  84%  { top: 425px; width: 521px; transform: translateX(-50%); }
  92%  { top: 427px; width: 520px; transform: translateX(-50%); }
  100% { top: 426px; width: 520px; height: 50px; transform: translateX(-50%); }
}

@keyframes lidReverse {
  0%   { top: 426px; width: 520px; height: 50px; transform: translateX(-50%); }
  15%  { top: 380px; width: 510px; transform: translateX(-50%); }
  30%  { top: 280px; width: 490px; transform: translateX(-50%); }
  45%  { top: 180px; width: 465px; transform: translateX(-50%); }
  60%  { top: 100px; width: 440px; transform: translateX(-50%) rotateX(-5deg); }
  75%  { top: 60px; width: 425px; transform: translateX(-50%) rotateX(-10deg); transform-origin: center bottom; }
  90%  { top: 52px; width: 420px; transform: translateX(-50%) rotateX(-3deg); transform-origin: center bottom; }
  100% { top: 50px; width: 420px; transform: translateX(-50%) rotateX(0deg); transform-origin: center bottom; }
}

.lid-drop {
  animation: lidDrop 0.36s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.lid-reverse {
  animation: lidReverse 0.36s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
```

- [ ] **Step 2: Verify build works**

Run: `cd frontend && npm run build:dev 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat: add lid-lift and lid-reverse CSS keyframes"
```

---

### Task 5: Wire up the LidLiftTransition orchestrator in App.jsx

**Files:**
- Create: `frontend/src/components/LidLiftTransition.tsx`
- Modify: `frontend/src/App.jsx` — remove DeckSearchBar usage, add new `agentCanvas` view state, wire LidLiftTransition

This is the integration task. It connects the hook, CockpitBar, SparkBurst, and ChatInput position changes into App.jsx.

- [ ] **Step 1: Create the LidLiftTransition orchestrator**

```tsx
// frontend/src/components/LidLiftTransition.tsx
import React, { useEffect } from 'react';
import CockpitBar from './CockpitBar';
import SparkBurst from './SparkBurst';

interface LidLiftTransitionProps {
  state: 'idle' | 'animating' | 'open' | 'reversing';
  onAnimationComplete: () => void;
  deckName?: string | null;
  cardCount?: number;
  onStartLearning?: () => void;
  onClose?: () => void;
}

export default function LidLiftTransition({
  state,
  onAnimationComplete,
  deckName,
  cardCount,
  onStartLearning,
  onClose,
}: LidLiftTransitionProps) {
  // Fire onAnimationComplete after the animation duration
  useEffect(() => {
    if (state === 'animating' || state === 'reversing') {
      const timer = setTimeout(onAnimationComplete, 450);
      return () => clearTimeout(timer);
    }
  }, [state, onAnimationComplete]);

  const cockpitState =
    state === 'idle' ? 'hidden' as const :
    state === 'animating' ? 'emerging' as const :
    state === 'reversing' ? 'reversing' as const :
    'visible' as const;

  return (
    <>
      <SparkBurst active={state === 'animating'} />
      <CockpitBar
        animationState={cockpitState}
        deckName={deckName}
        cardCount={cardCount}
        onStartLearning={onStartLearning}
        onClose={onClose}
      />
    </>
  );
}
```

- [ ] **Step 2: Modify App.jsx — add state and remove DeckSearchBar**

In `App.jsx`, add the following changes:

1. Add import for new components and hook:
```js
import { useLidLift } from './hooks/useLidLift';
import LidLiftTransition from './components/LidLiftTransition';
```

2. Remove DeckSearchBar import:
```js
// DELETE: import DeckSearchBar from './components/DeckSearchBar';
```

3. Add the hook instance near other state declarations (~line 230):
```js
const lidLift = useLidLift();
```

4. In the deckBrowser render block (~line 2258), remove the DeckSearchBar block:
```jsx
// DELETE the entire block:
// {activeView === 'deckBrowser' && viewMode === 'graph' && (smartSearch.hasResults || ...) && (
//   <div ...><DeckSearchBar ... /></div>
// )}
```

5. Add LidLiftTransition to the deckBrowser view, inside the stage container:
```jsx
{activeView === 'deckBrowser' && (
  <LidLiftTransition
    state={lidLift.state}
    onAnimationComplete={lidLift.onAnimationComplete}
    deckName={overviewData?.deckName || null}
    cardCount={overviewData?.totalCards}
    onStartLearning={() => executeAction('deck.study', { deckId: overviewData?.deckId })}
    onClose={() => lidLift.close(false)}
  />
)}
```

6. In the unified ChatInput section (~line 2862), add a new position branch for `deckBrowser`:
```js
// Before the existing else block for "Normal chat mode":
} else if (activeView === 'deckBrowser') {
  // Deck browser — SearchBar mode (top center) or agent canvas (bottom)
  topSlot = undefined;
  hideInput = false;
  placeholder = 'Stelle eine Frage...';
  onSend = (text) => {
    lidLift.trigger();
    handleSend(text);
  };
  actionPrimary = {
    label: 'Öffnen', shortcut: 'SPACE',
    onClick: () => lidLift.trigger(),
  };
  actionSecondary = {
    label: 'Senden', shortcut: '↵',
    onClick: () => {},
  };
}
```

7. In the position styles section (~line 2886), add the deckBrowser position:
```js
const isDeckBrowserIdle = activeView === 'deckBrowser' && lidLift.state === 'idle';
const isDeckBrowserOpen = activeView === 'deckBrowser' && lidLift.isOpen;

const posStyle = isReviewSidebar
  ? { /* existing sidebar position */ }
  : isDeckBrowserIdle
    ? { left: `calc(${sOff} + 50% - 210px)`, right: `calc(50% - 210px)`, top: '50px', bottom: 'auto' }
    : { left: `calc(${sOff} + var(--ds-space-lg))`, right: 'var(--ds-space-lg)', bottom: isReview ? 'var(--ds-space-xl)' : 'var(--ds-space-lg)' };
```

8. Add the lid-drop CSS class when animating:
```jsx
<div ref={dockPulseRef} className={lidLift.state === 'animating' ? 'lid-drop' : lidLift.state === 'reversing' ? 'lid-reverse' : ''} style={{
  position: 'fixed', zIndex: 60,
  ...posStyle,
  // ...
```

- [ ] **Step 3: Verify build works**

Run: `cd frontend && npm run build:dev 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Test manually in browser**

Run: `cd frontend && npm run dev`
Open: `http://localhost:3000/?view=deckBrowser`
Test: Click the input bar or press SPACE — verify the lid-lift animation plays, cockpit appears, sparks fire.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/LidLiftTransition.tsx frontend/src/App.jsx
git commit -m "feat: wire up lid-lift transition in App.jsx, replace DeckSearchBar"
```

---

### Task 6: Delete DeckSearchBar

**Files:**
- Delete: `frontend/src/components/DeckSearchBar.jsx`

- [ ] **Step 1: Verify no remaining imports**

Run: `cd frontend && grep -r "DeckSearchBar" src/ --include="*.jsx" --include="*.tsx" --include="*.ts"`
Expected: No results (all references removed in Task 5)

- [ ] **Step 2: Delete the file**

```bash
rm frontend/src/components/DeckSearchBar.jsx
```

- [ ] **Step 3: Verify build still works**

Run: `cd frontend && npm run build:dev 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove DeckSearchBar, replaced by lid-lift ChatInput"
```

---

### Task 7: Add SPACE trigger to keyboard routing

**Files:**
- Modify: `frontend/src/App.jsx` — add SPACE keydown listener for deckBrowser state

- [ ] **Step 1: Add SPACE key handler**

In App.jsx, add an effect that listens for SPACE when in deckBrowser idle state and no text input is focused:

```js
// Near other keyboard effects in App.jsx
useEffect(() => {
  const handleKeyDown = (e) => {
    if (activeView !== 'deckBrowser' || lidLift.state !== 'idle') return;
    if (e.code === 'Space' && document.activeElement?.tagName !== 'TEXTAREA' && document.activeElement?.tagName !== 'INPUT') {
      e.preventDefault();
      lidLift.trigger();
    }
    if (e.key === 'Escape' && lidLift.isOpen) {
      e.preventDefault();
      const hasMessages = chatHook.messages.length > 0;
      lidLift.close(hasMessages);
      if (hasMessages) {
        // Normal view transition back
      }
    }
  };
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [activeView, lidLift.state, lidLift.isOpen, chatHook.messages.length]);
```

Note: This uses a window-level keydown listener instead of `GlobalShortcutFilter` because the SPACE trigger is React-only state (no Qt involvement needed). The Python shortcut filter is for Qt-level keyboard routing — this is purely frontend.

- [ ] **Step 2: Test manually**

Run: `cd frontend && npm run dev`
Open: `http://localhost:3000/?view=deckBrowser`
Test:
1. Press SPACE → lid-lift animation triggers
2. Press ESC (no messages) → reverse morph back to idle
3. Type in input, send, then ESC → normal transition (no reverse morph)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: add SPACE/ESC keyboard triggers for lid-lift transition"
```

---

### Task 8: Visual polish and manual testing

**Files:**
- Modify: `frontend/src/components/SparkBurst.tsx` (if adjustments needed)
- Modify: `frontend/src/components/CockpitBar.tsx` (if adjustments needed)

- [ ] **Step 1: Full build**

Run: `cd frontend && npm run build`
Expected: Production build succeeds

- [ ] **Step 2: Run all existing tests**

Run: `cd frontend && npm test -- --watchAll=false`
Expected: All tests pass (existing 107+ tests unbroken)

Run: `cd .. && python3 run_tests.py`
Expected: All Python tests pass (481+ tests)

- [ ] **Step 3: Manual testing checklist**

Test in `npm run dev`:
- [ ] Deck browser loads with ChatInput at top center, SPACE badge visible
- [ ] Click on ChatInput → lid-lift animation plays
- [ ] SPACE key → same animation
- [ ] Cockpit appears with shadow-emerge effect
- [ ] Blue spark burst fires at separation point
- [ ] Glow flash at burst origin
- [ ] ChatInput lands at bottom, snake border ignites
- [ ] Sidebar slides in from right
- [ ] ESC with no messages → full reverse morph
- [ ] ESC with messages → normal transition
- [ ] Cockpit shows "Keine Auswahl" + ESC when no deck selected
- [ ] Cockpit shows deck name + card count when deck selected
- [ ] Animation works in both dark and light mode
- [ ] No console errors during animation

- [ ] **Step 4: Commit any polish fixes**

```bash
git add -A
git commit -m "fix: lid-lift visual polish from manual testing"
```
