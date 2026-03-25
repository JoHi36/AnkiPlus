# Plusi Character System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace two separate Plusi rendering pipelines with one unified Vanilla JS renderer, add new emotions, and create a living animation system.

**Architecture:** A single IIFE module (`shared/plusi-renderer.js`) renders Plusi everywhere. Mood data is embedded in the renderer. A state machine picks random sub-animations per mood for organic movement. React wraps the renderer thinly; dock.py injects it as a `<script>` tag.

**Tech Stack:** Vanilla JS (IIFE), SVG, CSS animations, React wrapper, Python injection

**Spec:** `docs/superpowers/specs/2026-03-21-plusi-character-system-design.md`

---

## File Structure

```
shared/
├── plusi-renderer.js       ← NEW: Central renderer (IIFE, exposes window.createPlusi)
│                             Mood data defined directly in JS (no separate JSON needed)
├── plusi-showroom.html     ← NEW: Dev preview page
└── assets/
    └── plusi-faces.json    ← DELETE after migration

frontend/src/
├── components/
│   ├── MascotCharacter.jsx ← MODIFY: Strip to thin wrapper (~30 lines)
│   ├── PlusiWidget.jsx     ← MODIFY: Remove MOOD_FACES/COLORS/META, use renderer
│   └── MascotShell.jsx     ← MODIFY: Use renderer via MascotCharacter
└── hooks/
    └── useMascot.js        ← MODIFY: Remove animation refs, keep mood priority

plusi/
├── dock.py                 ← MODIFY: Inject renderer instead of custom HTML/CSS/JS
├── panel.py                ← MODIFY: Replace MOOD_COLORS + get_faces_dict() with renderer
└── agent.py                ← MODIFY: Update VALID_MOODS + PLUSI_SYSTEM_PROMPT

ui/
├── custom_screens.py       ← VERIFY: Uses get_plusi_dock_injection(), no changes needed
├── widget.py               ← VERIFY: Imports dock functions, no API change
└── custom_reviewer/__init__.py ← VERIFY: _inject_plusi_dock, no changes needed

tests/
└── test_plusi_renderer.py  ← NEW: Unit tests for mood data and renderer logic
```

**Note on plusi-moods.json:** The spec mentions a separate JSON file, but to avoid two sources of truth with no automated sync, mood data is defined directly inside `plusi-renderer.js` as a `const MOODS = { ... }` object. The tests validate the embedded data. This is simpler and eliminates desync risk.

---

## Task 1: Create Mood Data Tests

Mood data will be defined directly in `plusi-renderer.js` (Task 2). These tests validate the renderer file contains all required moods with correct structure by parsing the JS source.

**Files:**
- Create: `tests/test_plusi_renderer.py`
- Read: `shared/assets/plusi-faces.json` (reference for migration)
- Read: `frontend/src/components/PlusiWidget.jsx` (MOOD_COLORS, MOOD_META to migrate)
- Read: `frontend/src/components/MascotCharacter.jsx` (MOODS mapping to migrate)
- Read: `plusi/dock.py` (MOODS mapping to migrate)

- [ ] **Step 1: Write test for mood data completeness**

Create `tests/test_plusi_renderer.py`:

```python
"""Tests for Plusi character system mood data and renderer."""
import json
import os
import re
import unittest

RENDERER_PATH = os.path.join(os.path.dirname(__file__), '..', 'shared', 'plusi-renderer.js')

EXPECTED_MOODS = {
    'neutral', 'curious', 'thinking', 'annoyed', 'empathy',
    'happy', 'excited', 'surprised', 'flustered', 'proud', 'sleepy',
}
EXPECTED_ACTIVITIES = {'sleeping', 'reflecting', 'reading'}
ALL_STATES = EXPECTED_MOODS | EXPECTED_ACTIVITIES

REQUIRED_BODY_MOVES = {
    'float', 'hop', 'tilt', 'wiggle', 'droop', 'bounce',
    'spin', 'squish', 'pop', 'sway', 'puff-up', 'peek',
}


class TestPlusiRendererContent(unittest.TestCase):
    """Validate that plusi-renderer.js exists, is an IIFE, and contains
    all required mood definitions and body moves."""

    @classmethod
    def setUpClass(cls):
        with open(RENDERER_PATH, 'r', encoding='utf-8') as f:
            cls.js = f.read()

    def test_file_is_iife(self):
        self.assertTrue(self.js.strip().startswith('(function'),
                        "Renderer must be an IIFE")

    def test_exposes_create_plusi(self):
        self.assertIn('window.createPlusi', self.js)

    def test_exposes_get_plusi_color(self):
        self.assertIn('window.getPlusiColor', self.js)

    def test_all_moods_present(self):
        for mood in ALL_STATES:
            self.assertIn(f"'{mood}'", self.js,
                          f"Mood '{mood}' not found in renderer")

    def test_blush_removed(self):
        self.assertNotIn("'blush'", self.js,
                         "blush should be replaced by flustered")

    def test_all_body_moves_defined(self):
        for move in REQUIRED_BODY_MOVES:
            self.assertIn(move, self.js,
                          f"Body move '{move}' not in renderer")

    def test_unknown_mood_falls_back_to_neutral(self):
        # Verify fallback pattern exists
        self.assertIn('MOODS.neutral', self.js,
                      "Renderer must fall back to MOODS.neutral for unknown moods")


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -m pytest tests/test_plusi_renderer.py -v`
Expected: FAIL — `plusi-renderer.js` does not exist yet

- [ ] **Step 3: Commit test file**

```bash
git add tests/test_plusi_renderer.py
git commit -m "test(plusi): add tests for unified renderer mood data and structure"
```

---

## Task 2: Create plusi-renderer.js — SVG Builder + Static Mode

**Files:**
- Create: `shared/plusi-renderer.js`
- Read: `shared/assets/plusi-faces.json` (SVG reference for face migration)
- Read: `frontend/src/components/MascotCharacter.jsx` (body shape reference)

- [ ] **Step 1: Create renderer IIFE with mood data, SVG builder, and static API**

Read these source files first to understand what to migrate:
- `shared/assets/plusi-faces.json` — current SVG face strings per mood
- `frontend/src/components/MascotCharacter.jsx` — body shape (3 rects), mood mapping
- `frontend/src/components/PlusiWidget.jsx` — MOOD_COLORS, MOOD_META, MOOD_FACES

Create `shared/plusi-renderer.js` as an IIFE that:
1. Defines `const MOODS = { ... }` with all 14 states (face SVG, body move palettes, colors, labels, accessoires). Migrate and improve face SVG from plusi-faces.json. Design new faces for flustered, proud, sleeping, reflecting per spec.
2. Implements `buildSVG(moodName, size, integrity)` — creates the plus-cross body shape (3 rects with rounded corners) + face group from mood's SVG parts + accessoire group for activities.
3. Implements `applyColorIntegrity(hex, integrity)` — converts hex to HSL, scales saturation by `0.3 + (integrity * 0.7)`.
4. Implements static-only `createPlusi()` API: renders SVG into container, supports `setMood()` (with crossfade), `setIntegrity()`, `getMood()`, `destroy()`. `tap()` is a placeholder.
5. Implements `getPlusiColor(mood, integrity)` utility.
6. Exposes `window.createPlusi` and `window.getPlusiColor`.
7. Uses fallback: `MOODS[mood] || MOODS.neutral` for unknown moods (backward compat for persisted "blush").

**Note on face data:** Face SVG parts use safe DOM construction (createElementNS) or trusted internal SVG strings. The face data is hardcoded in the IIFE, not user-supplied.

- [ ] **Step 2: Run tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -m pytest tests/test_plusi_renderer.py -v`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add shared/plusi-renderer.js
git commit -m "feat(plusi): create renderer with SVG builder, mood data, and static API"
```

---

## Task 3: Add Animation Engine to Renderer

**Files:**
- Modify: `shared/plusi-renderer.js`

- [ ] **Step 1: Add CSS keyframe definitions for 12 body moves**

Add `ANIMATION_CSS` constant with keyframes for: plusi-float, plusi-hop, plusi-tilt, plusi-wiggle, plusi-droop, plusi-bounce, plusi-spin, plusi-squish, plusi-pop, plusi-sway, plusi-puff-up, plusi-peek. Inject via `ensureCSS()` (once per document, using `textContent` on a style element).

- [ ] **Step 2: Add animation state machine**

Add `createAnimationEngine(element, moodData, state)` where `state` is a **mutable object** `{ integrity: 0.7 }` shared with the public API. This avoids the closure-capture bug — `setIntegrity()` updates `state.integrity`, and the engine reads it on each loop iteration.

Engine loop: pick weighted random move → play CSS animation → sync face micro-expression → random pause → repeat. Independent blink timer runs in parallel (3–7s random interval).

- [ ] **Step 3: Update createPlusi to support `animated: true`**

When `animated: true`:
- Create shared `state = { integrity }` object
- Pass `state` to animation engine (not the raw value)
- `setIntegrity()` updates `state.integrity`
- `setMood()` stops old engine, crossfades SVG, starts new engine with same `state`
- `tap()` picks random tap animation (pop/wiggle/squish), plays once
- Call `ensureCSS()` on first animated creation

- [ ] **Step 4: Run tests and verify**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -m pytest tests/test_plusi_renderer.py -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add shared/plusi-renderer.js
git commit -m "feat(plusi): add animation engine with weighted random state machine"
```

---

## Task 4: Create Showroom Page

**Files:**
- Create: `shared/plusi-showroom.html`
- Read: `shared/plusi-renderer.js`

- [ ] **Step 1: Create the showroom HTML page**

Create `shared/plusi-showroom.html` — a standalone page that loads the renderer and displays all 14 states in a grid. Features:

- Dark background matching the app theme (`#141416`)
- Grid of 14 cards, each containing a Plusi instance with mood label
- Controls bar at top:
  - Integrity slider (0–1, default 0.7)
  - Size selector: 24px / 48px / 64px / 100px buttons
  - Animated/Static toggle
- Each Plusi card is clickable to trigger `tap()` reaction
- Click a card label to expand to 200px inspector view

The page loads `plusi-renderer.js` via a relative `<script>` tag (no build step). Uses `createPlusi()` API directly.

```html
<!DOCTYPE html>
<html lang="en" style="background: #141416; color: #e5e5ea;">
<head>
  <meta charset="UTF-8">
  <title>Plusi Showroom</title>
  <style>
    /* ... showroom-specific layout styles ... */
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 24px; }
    .controls { display: flex; gap: 16px; align-items: center; margin-bottom: 24px; /* ... */ }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 16px; }
    .card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
            border-radius: 12px; padding: 16px; text-align: center; cursor: pointer; }
    .card:hover { border-color: rgba(255,255,255,0.2); }
    .card-label { font-size: 12px; margin-top: 8px; color: rgba(255,255,255,0.5); }
    .card-type { font-size: 10px; color: rgba(139,92,246,0.7); }
  </style>
</head>
<body>
  <h1 style="font-size: 18px; margin-bottom: 4px;">Plusi Showroom</h1>
  <p style="font-size: 13px; color: rgba(255,255,255,0.4); margin-bottom: 20px;">
    Click any Plusi to tap. Use controls to adjust size, integrity, and animation mode.
  </p>
  <div class="controls" id="controls"><!-- built by JS --></div>
  <div class="grid" id="grid"><!-- built by JS --></div>

  <script src="plusi-renderer.js"></script>
  <script>
    // Build controls and grid using createPlusi() API
    // Read all mood names from the renderer
    // Create one card per mood/activity
    // Wire up integrity slider, size buttons, animated toggle
  </script>
</body>
</html>
```

Implement the JS that:
1. Reads mood list (hardcoded array matching plusi-moods.json keys)
2. Creates a card + Plusi instance per mood
3. Wires integrity slider to call `setIntegrity()` on all instances
4. Wires size buttons to destroy and recreate all instances at new size
5. Wires animated toggle to destroy and recreate with `animated: true/false`
6. Wires card click to call `.tap()` on that instance

- [ ] **Step 2: Test manually**

Run: `open "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/shared/plusi-showroom.html"`
Expected: Browser opens, shows 14 Plusi cards with animations. Controls work.

- [ ] **Step 3: Commit**

```bash
git add shared/plusi-showroom.html
git commit -m "feat(plusi): add showroom page for visual development"
```

---

## Task 5: Integrate Renderer into React (MascotCharacter.jsx)

**Files:**
- Modify: `frontend/src/components/MascotCharacter.jsx` (strip to ~30 lines)
- Modify: `frontend/vite.config.js:10-16` (verify @shared alias works for .js)
- Read: `frontend/src/hooks/useMascot.js` (understand mood flow)

- [ ] **Step 1: Verify Vite alias resolves the renderer**

Check that the existing `@shared` alias in `vite.config.js` line 12 can import `.js` files. It should — the alias maps `@shared` to `../shared/`, and Vite resolves JS files through aliases by default.

- [ ] **Step 2: Rewrite MascotCharacter.jsx as thin wrapper**

Strip `MascotCharacter.jsx` from ~240 lines to ~40 lines. Remove:
- `MOODS` mapping (lines 4-13) — now in renderer
- `MASCOT_CSS` constant (lines 118-232) — now in renderer
- All CSS keyframe definitions — now in renderer
- SVG body rendering — now in renderer

Keep:
- Eye-tracking mouse logic (lines 37-56) — optional enhancement, call renderer API
- Props interface (`mood`, `size`, `tapKey`, `active`)

New content:

```jsx
import { useRef, useEffect } from 'react';
import '@shared/plusi-renderer.js'; // side-effect import, exposes window.createPlusi

// Note: isThinking and isReplying props are intentionally dropped.
// The old component used them for animation overrides — the new renderer
// handles all animation internally via the mood prop. Callers that pass
// isThinking should instead pass mood='thinking'.
export default function MascotCharacter({ mood = 'neutral', size = 52, tapKey = 0, active = false, integrity = 0.7 }) {
  const containerRef = useRef(null);
  const plusiRef = useRef(null);
  const prevTapRef = useRef(tapKey);

  // Create renderer on mount
  useEffect(() => {
    if (!containerRef.current) return;
    plusiRef.current = window.createPlusi(containerRef.current, {
      mood, size, animated: true, integrity
    });
    return () => {
      if (plusiRef.current) plusiRef.current.destroy();
    };
  }, [size]); // recreate only if size changes

  // Mood updates
  useEffect(() => {
    if (plusiRef.current) plusiRef.current.setMood(mood);
  }, [mood]);

  // Integrity updates
  useEffect(() => {
    if (plusiRef.current) plusiRef.current.setIntegrity(integrity);
  }, [integrity]);

  // Tap reactions
  useEffect(() => {
    if (tapKey !== prevTapRef.current) {
      prevTapRef.current = tapKey;
      if (plusiRef.current) plusiRef.current.tap();
    }
  }, [tapKey]);

  // Active glow
  const glowStyle = active ? { filter: 'drop-shadow(0 0 6px rgba(10,132,255,0.5))' } : {};

  return <div ref={containerRef} style={{ display: 'inline-block', ...glowStyle }} />;
}
```

- [ ] **Step 3: Verify MascotShell.jsx still works**

Read `MascotShell.jsx` — it imports `MascotCharacter` and passes `mood`, `size`, `tapKey`, `active` props (lines 76-81). The new wrapper accepts the same props, so MascotShell should work without changes.

If MascotShell passes any props not in the new wrapper's interface, update accordingly.

- [ ] **Step 4: Build and verify**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build`
Expected: Build succeeds. `plusi-renderer.js` is bundled into `web/` output.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/MascotCharacter.jsx
git commit -m "refactor(plusi): replace MascotCharacter with thin renderer wrapper"
```

---

## Task 6: Integrate Renderer into PlusiWidget.jsx (Static Mode)

**Files:**
- Modify: `frontend/src/components/PlusiWidget.jsx:5-86` (remove MOOD_COLORS, MOOD_META, MOOD_FACES, PlusiIcon)

- [ ] **Step 1: Read current PlusiWidget.jsx**

Understand how `MOOD_COLORS` (lines 5-17), `MOOD_META` (lines 19-31), and `MOOD_FACES`/`PlusiIcon` (lines 41-99) are used in the component.

- [ ] **Step 2: Replace inline mood dictionaries with renderer calls**

Remove `MOOD_COLORS`, `MOOD_META`, `MOOD_FACES`, and `PlusiIcon` function.

Replace with renderer calls:
- Color: `window.getPlusiColor(mood, integrity)` — returns hex string for card border/background
- Icon: `createPlusi(container, { mood, size: 24, animated: false, integrity })` — static SVG
- Label: Read from embedded mood data (add `window.getPlusiLabel(mood)` to renderer if needed, or keep labels in a small local map since they're UI-specific German strings)

- [ ] **Step 3: Build and verify**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/PlusiWidget.jsx
git commit -m "refactor(plusi): use unified renderer for PlusiWidget static icons"
```

---

## Task 7: Integrate Renderer into dock.py (Python Injection)

**Files:**
- Modify: `plusi/dock.py:25-29, 189-201, 349-361` (replace custom HTML/CSS/JS with renderer injection)

- [ ] **Step 1: Read current dock.py injection**

Understand the current flow:
- `get_faces_dict()` (lines 25-29) loads plusi-faces.json
- `PLUSI_CSS` / `PLUSI_HTML` / `PLUSI_JS` contain the entire dock UI (lines ~30-350)
- `get_plusi_dock_injection()` (lines 349-361) assembles it all
- `_plusiSetMood()` JS function is the API called by Python

- [ ] **Step 2: Replace dock injection with renderer**

Modify `get_plusi_dock_injection()` to:
1. Read `shared/plusi-renderer.js` content
2. Inject it as an inline `<script>` block
3. Add a small init script that calls `createPlusi()` on a container div
4. Keep the same external API: `_plusiSetMood()` calls `plusi.setMood()`, `_plusiShowBubble()` stays
5. Keep the event bubble system (card_correct etc.) — it calls `setMood()` on the renderer

```python
def get_plusi_dock_injection():
    if not is_plusi_enabled():
        return ''

    mood = get_persisted_mood()

    # Read renderer source
    renderer_path = os.path.join(os.path.dirname(__file__), '..', 'shared', 'plusi-renderer.js')
    with open(renderer_path, 'r', encoding='utf-8') as f:
        renderer_js = f.read()

    # Minimal container HTML
    html = '<div id="plusi-dock" style="position:fixed; bottom:28px; left:28px; z-index:9999;"></div>'

    # Init script
    init_js = f"""
    var _plusiInstance = null;
    window.addEventListener('DOMContentLoaded', function() {{
        _plusiInstance = createPlusi(document.getElementById('plusi-dock'), {{
            mood: '{mood}', size: 48, animated: true, integrity: 0.7
        }});
    }});
    window._plusiSetMood = function(mood) {{
        if (_plusiInstance) _plusiInstance.setMood(mood);
    }};
    window._plusiSetIntegrity = function(val) {{
        if (_plusiInstance) _plusiInstance.setIntegrity(val);
    }};
    """

    return f'{html}\\n<script>{renderer_js}\\n{init_js}</script>'
```

Remove `PLUSI_CSS`, `PLUSI_HTML`, `PLUSI_JS` constants, `get_faces_dict()`, and the `_FACES_PATH` variable. The bubble system needs to be preserved — either keep it as a small separate JS block or migrate it into the renderer.

- [ ] **Step 3: Verify callers of get_plusi_dock_injection()**

Check these files still work with the new injection format:
- `ui/custom_screens.py` — calls `get_plusi_dock_injection()` to inject into deck browser/overview
- `custom_reviewer/__init__.py` — `_inject_plusi_dock` calls `get_plusi_dock_injection()`
- `ui/widget.py` — imports dock functions

The return value is still an HTML string, so callers should work without changes. Verify by reading each file's usage.

- [ ] **Step 4: Cache the renderer content**

Add caching so the renderer file is read only once (same pattern as custom_reviewer HTML caching):

```python
_renderer_cache = None

def _get_renderer_js():
    global _renderer_cache
    if _renderer_cache is None:
        renderer_path = os.path.join(os.path.dirname(__file__), '..', 'shared', 'plusi-renderer.js')
        with open(renderer_path, 'r', encoding='utf-8') as f:
            _renderer_cache = f.read()
    return _renderer_cache
```

- [ ] **Step 5: Commit**

```bash
git add plusi/dock.py
git commit -m "refactor(plusi): inject unified renderer in dock instead of custom HTML/CSS/JS"
```

---

## Task 8: Integrate Renderer into panel.py

**Files:**
- Modify: `plusi/panel.py` (replace MOOD_COLORS, remove get_faces_dict import)

- [ ] **Step 1: Read panel.py to understand current usage**

Read `plusi/panel.py` — find `MOOD_COLORS` dict and any `get_faces_dict()` imports. Understand how the panel renders Plusi visuals.

- [ ] **Step 2: Update MOOD_COLORS**

Replace the old `MOOD_COLORS` dictionary with the new mood set. Add flustered, proud, sleeping, reflecting. Remove blush. Use the same hex values as defined in the renderer's MOODS object.

Alternatively, if the panel injects HTML into a webview, inject the renderer and use `getPlusiColor()` instead of a hardcoded dict.

- [ ] **Step 3: Remove get_faces_dict() dependency**

If panel.py imports `get_faces_dict` from dock.py, replace with renderer injection (same pattern as dock.py Task 7) or remove the face rendering code if the panel now uses the unified renderer.

- [ ] **Step 4: Commit**

```bash
git add plusi/panel.py
git commit -m "refactor(plusi): update panel.py to use unified renderer mood set"
```

---

## Task 9: Update Mood Set in Agent + System Prompt

**Files:**
- Modify: `plusi/agent.py:32-178` (PLUSI_SYSTEM_PROMPT, VALID_MOODS)

- [ ] **Step 1: Write test for updated mood validation**

Add to `tests/test_plusi_renderer.py`:

```python
class TestPlusiAgentMoods(unittest.TestCase):

    def test_valid_moods_matches_moods_json(self):
        import sys
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
        # Import VALID_MOODS
        # Can't import directly due to Anki dependencies, so read the file
        agent_path = os.path.join(os.path.dirname(__file__), '..', 'plusi', 'agent.py')
        with open(agent_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Extract VALID_MOODS set from source
        import re
        match = re.search(r'VALID_MOODS\s*=\s*\{([^}]+)\}', content)
        self.assertIsNotNone(match, "VALID_MOODS not found in agent.py")
        mood_strings = re.findall(r'"(\w[\w-]*)"', match.group(1))
        agent_moods = set(mood_strings)

        # Should match JSON
        self.assertEqual(agent_moods, ALL_STATES,
                         f"VALID_MOODS mismatch. Missing: {ALL_STATES - agent_moods}, Extra: {agent_moods - ALL_STATES}")

    def test_system_prompt_lists_all_moods(self):
        agent_path = os.path.join(os.path.dirname(__file__), '..', 'plusi', 'agent.py')
        with open(agent_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Find Moods: section (may span multiple lines until next blank line or next section)
        match = re.search(r'Moods:\s*([\s\S]*?)(?:\n\n|\nfriendship)', content)
        self.assertIsNotNone(match, "Moods section not found in system prompt")
        moods_text = match.group(1).replace('\n', ' ')
        prompt_moods = set(m.strip() for m in moods_text.split(',') if m.strip())
        self.assertEqual(prompt_moods, ALL_STATES,
                         f"System prompt moods mismatch. Missing: {ALL_STATES - prompt_moods}")

    def test_blush_not_in_valid_moods(self):
        agent_path = os.path.join(os.path.dirname(__file__), '..', 'plusi', 'agent.py')
        with open(agent_path, 'r', encoding='utf-8') as f:
            content = f.read()
        self.assertNotIn('"blush"', content,
                         "blush should be replaced by flustered")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -m pytest tests/test_plusi_renderer.py::TestPlusiAgentMoods -v`
Expected: FAIL — VALID_MOODS still has old set, blush still present

- [ ] **Step 3: Update VALID_MOODS**

In `plusi/agent.py` line 177-178, replace:

```python
VALID_MOODS = {"neutral", "happy", "blush", "sleepy", "thinking", "surprised",
               "excited", "empathy", "annoyed", "curious", "reading"}
```

With:

```python
VALID_MOODS = {"neutral", "happy", "flustered", "sleepy", "thinking", "surprised",
               "excited", "empathy", "annoyed", "curious", "proud",
               "sleeping", "reflecting", "reading"}
```

- [ ] **Step 4: Update PLUSI_SYSTEM_PROMPT mood list**

In `plusi/agent.py` line 160-161, replace the Moods line:

```
Moods: neutral, happy, blush, sleepy, thinking, surprised, excited,
empathy, annoyed, curious
```

With:

```
Moods: neutral, happy, flustered, sleepy, thinking, surprised, excited,
empathy, annoyed, curious, proud, sleeping, reflecting, reading
```

Also add brief descriptions of new moods so the AI knows when to use them:
- `flustered` — ertappt, verlegen (ersetzt "blush")
- `proud` — Muster gefunden, selbstzufrieden
- `sleeping` — schlafe gerade (autonome Aktion)
- `reflecting` — denke autonom nach (autonome Aktion)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 -m pytest tests/test_plusi_renderer.py -v`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add plusi/agent.py tests/test_plusi_renderer.py
git commit -m "feat(plusi): update mood set — add flustered, proud, sleeping, reflecting; remove blush"
```

---

## Task 10: Cleanup — Remove Old Face Data and Duplicated Code

**Files:**
- Delete: `shared/assets/plusi-faces.json`
- Modify: `plusi/dock.py` — remove `get_faces_dict()`, `_FACES_PATH` if still present
- Modify: `frontend/src/hooks/useMascot.js` — verify clean integration

- [ ] **Step 1: Delete old face data**

Remove `shared/assets/plusi-faces.json` — all data has been migrated to `plusi-moods.json`.

- [ ] **Step 2: Verify no remaining references to plusi-faces.json**

Search codebase for `plusi-faces` or `plusi_faces` — ensure no file still imports or references the old JSON.

Run: Search for `plusi-faces` and `plusi_faces` in all files.

Fix any remaining references.

- [ ] **Step 3: Verify useMascot.js integration**

Read `frontend/src/hooks/useMascot.js`. The hook manages mood priority (AI > event > neutral). It should continue to work as-is — it sets mood state, and the React wrapper calls `plusi.setMood()` when mood changes. No changes needed unless there are animation-related refs that should be removed.

- [ ] **Step 4: Run full test suite**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -v`
Expected: All tests PASS (including existing tests)

- [ ] **Step 5: Build frontend and verify**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build`
Expected: Build succeeds without warnings about missing files.

- [ ] **Step 6: Commit**

```bash
git rm shared/assets/plusi-faces.json
git commit -m "refactor(plusi): remove old face data file, migrated to renderer"
```

---

## Task 11: Final Verification

- [ ] **Step 1: Open showroom and verify all 14 states**

Run: `open "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/shared/plusi-showroom.html"`

Verify:
- All 14 Plusi states render correctly
- Animations are smooth and varied (no exact loop repetition)
- Integrity slider changes color saturation and animation energy
- Size selector works at all sizes (24, 48, 64, 100)
- Static mode shows correct faces without animation
- Tap triggers reactions
- Activities show accessoires (sleep cap, book, thought bubble)

- [ ] **Step 2: Run all tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -v`
Expected: All PASS

- [ ] **Step 3: Build frontend**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build`
Expected: Clean build
