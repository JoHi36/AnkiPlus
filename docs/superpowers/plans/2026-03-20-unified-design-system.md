# Unified Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate all styling across 5 rendering contexts (React, Custom Reviewer, Plusi, Qt, Shared Components) into a single CSS-variable-based design system with dark + light mode support.

**Architecture:** One CSS file (`shared/styles/design-system.css`) defines all tokens and `.ds-*` component classes. One Tailwind preset references these CSS variables. All web contexts inherit the same variables. Qt gets a small Python dict of solid-hex approximations. Theme switching via `data-theme` attribute on `<html>`.

**Tech Stack:** CSS Custom Properties, Tailwind CSS preset, DaisyUI, Python/Qt QSS

**Spec:** `docs/superpowers/specs/2026-03-20-unified-design-system.md`

---

## File Map

### New Files
- `shared/config/tailwind.preset.js` — Shared Tailwind preset referencing CSS vars
- `ui/tokens_qt.py` — Qt/QSS color dictionary (dark + light)
- `shared/assets/plusi-faces.json` — Plusi mascot SVG face definitions (shared source of truth)

### Modified Files
- `shared/styles/design-system.css` — Rewrite: new tokens, light mode block, `.ds-*` component classes
- `shared/styles/theme.css` — Delete or gut (replaced by design-system.css)
- `shared/config/tailwind.shared.js` — Delete (replaced by tailwind.preset.js)
- `frontend/tailwind.config.js` — Simplify to extend preset only
- `frontend/src/index.css` — Import design-system.css, remove hardcoded colors
- `custom_reviewer/tailwind.config.js` — Simplify to extend preset only
- `custom_reviewer/styles.css` — Rebuild after design-system.css update (via Tailwind build)
- `custom_reviewer/interactions.js` — Replace hardcoded hex/rgba with CSS var references
- `plusi/dock.py` — Replace hardcoded inline CSS with `var(--ds-*)` references
- `plusi/panel.py` — Replace hardcoded inline CSS with `var(--ds-*)` references
- `ui/global_theme.py` — Import from tokens_qt.py, replace hardcoded hex values
- `ui/theme.py` — Import from tokens_qt.py, remove duplicate color dicts
- `frontend/src/components/MascotCharacter.jsx` — Import faces from shared JSON

---

## Task 1: Rewrite design-system.css (source of truth)

**Files:**
- Modify: `shared/styles/design-system.css`

This is the foundation — everything else depends on this file being correct.

- [ ] **Step 1: Read the current file**

Read `shared/styles/design-system.css` to understand the full current content.

- [ ] **Step 2: Rewrite with new tokens + light mode + component classes**

Replace the entire file with the spec content. The file must contain:
1. Dark mode `:root` block with all tokens (bg-deep, bg-canvas, bg-frosted, bg-overlay, text hierarchy, borders, semantic colors, interaction tints, rating aliases via `var()`, spacing, radius, typography incl. `--ds-font-brand`, shadows, animation)
2. `[data-theme="light"]` block with all light-mode overrides (copy from spec Section 11)
3. All `.ds-*` component classes from spec Section 10 (`.ds-frosted`, `.ds-input-dock`, `.ds-thought-step`, `.ds-mc-option`, `.ds-review-result`, `.ds-tab-bar`, `.ds-kbd`, `.ds-borderless`)

Key changes from old file:
- `--ds-bg-page` → `--ds-bg-canvas` (#1C1C1E)
- `--ds-bg-inset` → `--ds-bg-frosted` (#161618)
- `--ds-bg-elevated` → removed
- `--ds-bg-overlay` value changes to #3A3A3C
- New: `--ds-bg-deep` (#141416)
- New: `--ds-font-brand` (Space Grotesk stack)
- New: `--ds-hover-tint`, `--ds-active-tint`, `--ds-green-tint`, `--ds-red-tint`
- Rating aliases use `var()` not hardcoded hex

- [ ] **Step 3: Verify the file parses as valid CSS**

Run: `cd frontend && npx postcss ../shared/styles/design-system.css --no-map 2>&1 | head -5`

If postcss isn't available, simply open the file in a browser devtools console to verify no syntax errors.

- [ ] **Step 4: Commit**

```bash
git add shared/styles/design-system.css
git commit -m "feat(design-system): rewrite tokens with new naming, light mode, and component classes"
```

---

## Task 2: Delete theme.css and create Tailwind preset

**Files:**
- Delete: `shared/styles/theme.css`
- Delete: `shared/config/tailwind.shared.js`
- Create: `shared/config/tailwind.preset.js`

- [ ] **Step 1: Read current files**

Read `shared/styles/theme.css` and `shared/config/tailwind.shared.js` to confirm they are fully superseded.

- [ ] **Step 2: Delete theme.css**

The file defined `--anki-bg`, `--anki-surface`, etc. — all replaced by design-system.css tokens.

- [ ] **Step 3: Delete tailwind.shared.js**

Replaced by the new preset.

- [ ] **Step 4: Create tailwind.preset.js**

Write `shared/config/tailwind.preset.js` with the exact content from spec Section 11 "Tailwind Integration". This preset:
- Maps all colors to `var(--ds-*)` references
- Maps textColor, borderColor, fontFamily, borderRadius, fontSize to CSS vars
- Does NOT include DaisyUI (each consumer config adds that)

- [ ] **Step 5: Commit**

```bash
git add -A shared/styles/theme.css shared/config/tailwind.shared.js shared/config/tailwind.preset.js
git commit -m "feat(design-system): replace theme.css and tailwind.shared.js with unified preset"
```

---

## Task 3: Update frontend Tailwind config

**Files:**
- Modify: `frontend/tailwind.config.js`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Read current files**

Read both files to see current color definitions and imports.

- [ ] **Step 2: Simplify frontend/tailwind.config.js**

Replace the entire config. The new config:
- Imports the preset from `../shared/config/tailwind.preset.js`
- Keeps only: `content` paths, DaisyUI plugin + theme config
- Removes ALL hardcoded color/font/radius/fontSize definitions (they come from preset)
- DaisyUI theme should map to CSS vars too: `"base-100": "var(--ds-bg-canvas)"`, etc.

- [ ] **Step 3: Update frontend/src/index.css**

- Add `@import '../../shared/styles/design-system.css';` at the top (before Tailwind directives)
- Remove all hardcoded `#161616` background colors
- Remove any color definitions that duplicate design-system.css

- [ ] **Step 4: Test frontend build**

Run: `cd frontend && npm run build`

Expected: Build succeeds. Check `web/` output exists.

- [ ] **Step 5: Commit**

```bash
git add frontend/tailwind.config.js frontend/src/index.css
git commit -m "feat(frontend): use shared design system preset, remove hardcoded colors"
```

---

## Task 4: Update custom reviewer Tailwind config

**Files:**
- Modify: `custom_reviewer/tailwind.config.js`

- [ ] **Step 1: Read current config**

Read `custom_reviewer/tailwind.config.js`.

- [ ] **Step 2: Simplify to extend preset**

Replace the config. The new config:
- Imports preset from `../shared/config/tailwind.preset.js`
- Keeps only: `content` paths (template.html, interactions.js), `safelist`, DaisyUI plugin + theme
- Removes ALL hardcoded color/font definitions

- [ ] **Step 3: Rebuild reviewer CSS**

Run: `cd custom_reviewer && npx tailwindcss -i ./input.css -o ./styles.css` (or whatever the build command is — check `package.json` scripts).

If no build script exists, the reviewer CSS may need to be manually updated to reference new token names. Check `custom_reviewer/styles.css` for old token names (`--ds-bg-page`, `--ds-bg-inset`, `--ds-bg-elevated`) and replace them.

- [ ] **Step 4: Commit**

```bash
git add custom_reviewer/tailwind.config.js custom_reviewer/styles.css
git commit -m "feat(reviewer): use shared design system preset"
```

---

## Task 5: Update custom reviewer interactions.js

**Files:**
- Modify: `custom_reviewer/interactions.js`

- [ ] **Step 1: Search for hardcoded colors**

Grep for hex codes and rgba values:
- `#30d158`, `#ffd60a`, `#ff453a`, `#0a84ff` (rating colors)
- `rgba(255,255,255,` (border/text opacity values)
- `rgb(48,209,88)`, `rgb(255,159,10)`, `rgb(255,69,58)` (colorMap values)

- [ ] **Step 2: Replace rating colors with CSS variable reads**

Where JS sets `element.style.color = '#30d158'`, replace with:
```js
element.style.color = 'var(--ds-green)'
```

For the `colorMap` object, replace hardcoded RGB with var references.

For `rgba()` values used for borders/backgrounds in inline styles, replace with var references where possible. Where JS computes dynamic opacity, keep the computation but use the base color from a CSS var.

- [ ] **Step 3: Verify reviewer still works**

Build frontend (`npm run build` in `frontend/`), restart Anki, test card review flow:
- Show question → show answer → rate
- MC mode → select option → see result
- ThoughtStream display during evaluation

- [ ] **Step 4: Commit**

```bash
git add custom_reviewer/interactions.js
git commit -m "feat(reviewer): replace hardcoded colors with CSS variable references"
```

---

## Task 6: Create Qt token file and update global theme

**Files:**
- Create: `ui/tokens_qt.py`
- Modify: `ui/global_theme.py`
- Modify: `ui/theme.py`

- [ ] **Step 1: Create ui/tokens_qt.py**

Create the file with two dicts (`DARK_TOKENS` and `LIGHT_TOKENS`) containing the 10 key-value pairs from spec Section 11 "Qt/QSS Token Subset". Include a docstring explaining these are solid-hex approximations of the CSS opacity-based values and must be manually synced with `design-system.css`.

```python
"""
Qt/QSS design system tokens.

Solid-hex approximations of the CSS opacity-based tokens in
shared/styles/design-system.css. Qt/QSS does not support rgba()
or CSS variables, so these are pre-computed against the expected
background color.

Keep in sync with design-system.css when token values change.
"""

DARK_TOKENS = {
    "bg_deep": "#141416",
    "bg_canvas": "#1C1C1E",
    "bg_overlay": "#3A3A3C",
    "text_primary": "#EAEAEB",
    "text_secondary": "#8C8C8C",
    "accent": "#0A84FF",
    "border_subtle": "#1F1F21",
    "border_medium": "#2E2E30",
    "green": "#30D158",
    "red": "#FF453A",
}

LIGHT_TOKENS = {
    "bg_deep": "#ECECF0",
    "bg_canvas": "#FFFFFF",
    "bg_overlay": "#E5E5EA",
    "text_primary": "#1A1A1A",
    "text_secondary": "#6C6C70",
    "accent": "#007AFF",
    "border_subtle": "#E0E0E0",
    "border_medium": "#C8C8CC",
    "green": "#34C759",
    "red": "#FF3B30",
}


def get_tokens(theme="dark"):
    return DARK_TOKENS if theme == "dark" else LIGHT_TOKENS
```

- [ ] **Step 2: Read ui/global_theme.py**

Read the file to find all hardcoded `#1A1A1A` and other color values in the QSS stylesheet string.

- [ ] **Step 3: Update global_theme.py to import from tokens_qt.py**

Add `from .tokens_qt import get_tokens` at the top.

Replace hardcoded hex values in the stylesheet with f-string references to the token dict:
```python
tokens = get_tokens("dark")
stylesheet = f"""
    QMainWindow {{ background-color: {tokens['bg_canvas']}; }}
    ...
"""
```

This is a large file (~967 lines). Focus only on replacing color values — do not restructure the file.

- [ ] **Step 4: Update ui/theme.py**

Read and update `ui/theme.py`:
- Import from tokens_qt.py
- Replace the `DARK_THEME` and `LIGHT_THEME` dicts to use token values
- Keep any non-color utility functions as-is

- [ ] **Step 5: Commit**

```bash
git add ui/tokens_qt.py ui/global_theme.py ui/theme.py
git commit -m "feat(qt): centralize colors in tokens_qt.py, update global theme"
```

---

## Task 7: Update Plusi dock.py to use CSS variables

**Files:**
- Modify: `plusi/dock.py`

- [ ] **Step 1: Read the file**

Read `plusi/dock.py` to find all inline CSS with hardcoded colors.

- [ ] **Step 2: Ensure design-system.css is available in Plusi's webview**

The Plusi dock is injected into webviews (reviewer, deck browser) that already load design-system.css. Verify this by checking how the dock HTML is injected. If design-system.css tokens are available in the host webview, the dock's inline CSS can reference `var(--ds-*)` directly.

If the dock runs in its own isolated webview, add an import/injection of the design-system.css tokens.

- [ ] **Step 3: Replace hardcoded colors in PLUSI_CSS**

In the `PLUSI_CSS` constant:
- `#1A1A1A` → `var(--ds-bg-canvas)`
- `rgba(26,26,26,0.9)` → `var(--ds-bg-frosted)` (or keep rgba with var base)
- `rgba(255,255,255,X)` text/border values → corresponding `var(--ds-text-*)` or `var(--ds-border-*)` tokens

Keep Plusi-specific mood colors (the `#818cf8`, `#6ee7b7`, etc.) as-is — these are character-specific, not part of the design system.

- [ ] **Step 4: Commit**

```bash
git add plusi/dock.py
git commit -m "feat(plusi): replace hardcoded CSS colors with design system variables in dock"
```

---

## Task 8: Update Plusi panel.py to use CSS variables

**Files:**
- Modify: `plusi/panel.py`

- [ ] **Step 1: Read the file**

Read `plusi/panel.py` to find all inline CSS with hardcoded colors.

- [ ] **Step 2: Replace hardcoded colors in PANEL_CSS**

Same approach as dock.py:
- Background colors → `var(--ds-bg-*)` tokens
- Text opacity values → `var(--ds-text-*)` tokens
- Border values → `var(--ds-border-*)` tokens
- Keep Plusi-specific tag colors (`#6ee7b7`, `#a78bfa`, `#fbbf24`) as-is

- [ ] **Step 3: Commit**

```bash
git add plusi/panel.py
git commit -m "feat(plusi): replace hardcoded CSS colors with design system variables in panel"
```

---

## Task 9: Extract Plusi mascot faces to shared JSON

**Files:**
- Create: `shared/assets/plusi-faces.json`
- Modify: `plusi/dock.py`
- Modify: `plusi/panel.py`
- Modify: `frontend/src/components/MascotCharacter.jsx`

- [ ] **Step 1: Read all three files to find face definitions**

Read the FACES dict in `plusi/dock.py`, the equivalent in `plusi/panel.py`, and the face SVG paths in `MascotCharacter.jsx`.

- [ ] **Step 2: Create shared/assets/plusi-faces.json**

Extract the 12 mood states into a single JSON file. Structure:
```json
{
  "neutral": { "eyes": "<svg path>", "mouth": "<svg path>" },
  "happy": { ... },
  ...
}
```

Match the exact SVG paths from the current implementations.

- [ ] **Step 3: Update plusi/dock.py to load from JSON**

Replace the `FACES` dict with a JSON load:
```python
import json, os
_faces_path = os.path.join(os.path.dirname(__file__), '..', 'shared', 'assets', 'plusi-faces.json')
with open(_faces_path) as f:
    FACES = json.load(f)
```

- [ ] **Step 4: Update plusi/panel.py to load from JSON**

Same approach as dock.py.

- [ ] **Step 5: Update MascotCharacter.jsx to import from JSON**

```jsx
import faces from '../../../shared/assets/plusi-faces.json';
```

Replace the inline face definitions with references to the imported JSON.

- [ ] **Step 6: Verify mascot renders correctly**

Build frontend (`npm run build`), check that the mascot SVG still renders in the chat panel. Test in Anki for dock + panel.

- [ ] **Step 7: Commit**

```bash
git add shared/assets/plusi-faces.json plusi/dock.py plusi/panel.py frontend/src/components/MascotCharacter.jsx
git commit -m "feat(plusi): extract mascot face definitions to shared JSON"
```

---

## Task 10: Verify and build everything

**Files:** None new — verification only.

- [ ] **Step 1: Build frontend**

```bash
cd frontend && npm run build
```

Expected: No errors. `web/` directory updated.

- [ ] **Step 2: Build reviewer CSS (if applicable)**

Check if `custom_reviewer/` has a build step. If yes, run it. If not (CSS is hand-edited), verify the file references new token names.

- [ ] **Step 3: Check for any remaining old token references**

```bash
grep -r "ds-bg-page\|ds-bg-inset\|ds-bg-elevated" --include="*.css" --include="*.js" --include="*.jsx" --include="*.tsx" --include="*.py" .
```

Expected: No results. If any remain, fix them.

- [ ] **Step 4: Check for remaining hardcoded #1A1A1A / #161616 / #151515**

```bash
grep -rn "#1A1A1A\|#161616\|#151515\|#222224" --include="*.css" --include="*.js" --include="*.jsx" --include="*.py" . | grep -v node_modules | grep -v ".superpowers" | grep -v "docs/"
```

Expected: No results outside of comments or Plusi mood-specific colors.

- [ ] **Step 5: Test in Anki**

Restart Anki and verify:
1. Deck Browser loads with correct dark background
2. Reviewer shows card with correct colors
3. Input dock has frosted glass appearance
4. Chat panel has deeper background than main canvas
5. Plusi mascot renders correctly
6. Stats colors (blue/orange/green) display correctly
7. Tab bar (Stapel/Session/Statistik) looks correct

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: verify unified design system integration across all contexts"
```

---

## Task Order & Dependencies

```
Task 1 (design-system.css) ─── foundation, everything depends on this
  ├── Task 2 (preset + delete old) ─── depends on Task 1
  │     ├── Task 3 (frontend tailwind) ─── depends on Task 2
  │     └── Task 4 (reviewer tailwind) ─── depends on Task 2
  ├── Task 5 (reviewer interactions.js) ─── depends on Task 1
  ├── Task 6 (Qt tokens) ─── depends on Task 1
  ├── Task 7 (Plusi dock) ─── depends on Task 1
  ├── Task 8 (Plusi panel) ─── depends on Task 1
  └── Task 9 (Mascot JSON) ─── independent, can run anytime
Task 10 (verification) ─── depends on all above
```

Tasks 3-9 can be parallelized after Tasks 1+2 are complete.
