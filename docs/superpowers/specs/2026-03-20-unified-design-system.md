# AnkiPlus Unified Design System — Spec

## Problem

The app renders UI across 5 contexts (React/Tailwind, Custom Reviewer HTML/CSS/JS, Plusi inline HTML in Python, Qt/QSS, Shared TypeScript components). Colors, fonts, spacing, and component styles are defined redundantly — with actual value discrepancies (e.g., `#161616` vs `#1A1A1A` for backgrounds, teal vs blue for success). Components like ChatInput, ThoughtStream, and the Plusi Mascot exist in 2-3 separate implementations with no shared styling.

## Solution

A single `design-system.css` file defines all tokens as CSS custom properties. Tailwind references these variables (not hardcoded hex values). All web contexts (React, Reviewer, Plusi) inherit the same variables. Qt/QSS syncs a small subset manually. Duplicated components share `.ds-*` CSS classes across React and native HTML.

### Core Principle: Material = Function

Instead of a traditional elevation model (darker = deeper, lighter = higher), the system uses two materials:

- **Frosted Glass** — for all interactive/action elements (input docks, search fields, chat input). Dark, translucent, with `backdrop-filter: blur()` and a subtle border. Visually prominent through material, not brightness.
- **Borderless** — for all content (card display, deck lists, session lists). Transparent on canvas, only a 1px border for structure. No background color, no visual weight.

This removes the need for a "Surface" elevation token entirely.

---

## 1. Background Tokens

### Dark Mode

| Token | Value | Role | Where |
|-------|-------|------|-------|
| `--ds-bg-deep` | `#141416` | Deepest layer | Chat panel background, Plusi diary background |
| `--ds-bg-canvas` | `#1C1C1E` | Main working surface | Reviewer, Deck Browser, Overview |
| `--ds-bg-frosted` | `#161618` | Frosted glass material | Input Dock, Search field, Chat input |
| `--ds-bg-overlay` | `#3A3A3C` | Floating ephemeral elements | Tooltips, popovers, context menus |

### Light Mode

| Token | Value | Role |
|-------|-------|------|
| `--ds-bg-deep` | `#ECECF0` | Chat panel, Plusi diary |
| `--ds-bg-canvas` | `#FFFFFF` | Main surface |
| `--ds-bg-frosted` | `#F9F9FB` | Input Dock, Search, Chat input |
| `--ds-bg-overlay` | `#E5E5EA` | Tooltips, popovers |

### Frosted Glass CSS Pattern

```css
.ds-frosted {
  background: var(--ds-bg-frosted);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--ds-border-medium);
  box-shadow: var(--ds-shadow-md);
  border-radius: var(--ds-radius-lg);
}
```

### Borderless Content CSS Pattern

```css
.ds-borderless {
  background: var(--ds-bg-canvas);
  border: 1px solid var(--ds-border-subtle);
  border-radius: var(--ds-radius-lg);
}
```

---

## 2. Text Tokens

### Dark Mode

| Token | Value | Use |
|-------|-------|-----|
| `--ds-text-primary` | `rgba(255, 255, 255, 0.92)` | Headlines, body, card content |
| `--ds-text-secondary` | `rgba(255, 255, 255, 0.55)` | Sub-deck names, descriptions |
| `--ds-text-tertiary` | `rgba(255, 255, 255, 0.35)` | Inactive tabs, timestamps |
| `--ds-text-placeholder` | `rgba(255, 255, 255, 0.30)` | Input placeholders |
| `--ds-text-muted` | `rgba(255, 255, 255, 0.18)` | Keyboard hints (SPACE, ENTER) |

### Light Mode

| Token | Value |
|-------|-------|
| `--ds-text-primary` | `rgba(0, 0, 0, 0.85)` |
| `--ds-text-secondary` | `rgba(60, 60, 67, 0.60)` |
| `--ds-text-tertiary` | `rgba(60, 60, 67, 0.30)` |
| `--ds-text-placeholder` | `rgba(60, 60, 67, 0.25)` |
| `--ds-text-muted` | `rgba(60, 60, 67, 0.18)` |

---

## 3. Semantic Colors

Colors adapt between modes for optimal contrast (Apple HIG values).

| Token | Dark | Light | Use |
|-------|------|-------|-----|
| `--ds-accent` | `#0A84FF` | `#007AFF` | Primary actions, links, Easy rating |
| `--ds-green` | `#30D158` | `#34C759` | Success, Good rating, Review stats |
| `--ds-yellow` | `#FFD60A` | `#FF9F0A` | Warning, Hard rating, Learning stats |
| `--ds-red` | `#FF453A` | `#FF3B30` | Error, Again rating |
| `--ds-purple` | `#BF5AF2` | `#AF52DE` | Plusi, deep mode |

### Stats Colors (with reduced opacity for softer appearance)

| Token | Dark | Light |
|-------|------|-------|
| `--ds-stat-new` | `rgba(10, 132, 255, 0.85)` | `rgba(0, 122, 255, 0.85)` |
| `--ds-stat-learning` | `rgba(255, 159, 10, 0.85)` | `rgba(255, 159, 10, 0.85)` |
| `--ds-stat-review` | `rgba(48, 209, 88, 0.85)` | `rgba(52, 199, 89, 0.85)` |

### Rating Colors (aliases for clarity)

```css
--ds-rate-again: var(--ds-red);
--ds-rate-hard:  var(--ds-yellow);
--ds-rate-good:  var(--ds-green);
--ds-rate-easy:  var(--ds-accent);
```

---

## 4. Borders

Only two levels, always 1px, always white/black opacity.

| Token | Dark | Light |
|-------|------|-------|
| `--ds-border-subtle` | `rgba(255, 255, 255, 0.06)` | `rgba(0, 0, 0, 0.04)` |
| `--ds-border-medium` | `rgba(255, 255, 255, 0.12)` | `rgba(0, 0, 0, 0.10)` |

---

## 5. Typography

### Font Families

| Token | Stack | Use |
|-------|-------|-----|
| `--ds-font-sans` | `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif` | All UI text |
| `--ds-font-brand` | `"Space Grotesk", "Segoe UI", system-ui, sans-serif` | Plusi voice, Logo ".plus", section titles |
| `--ds-font-mono` | `"SF Mono", "Cascadia Code", ui-monospace, monospace` | Code, keyboard hints, stats |

### Font Usage Rules

- **SF Pro** (via system font stack): All standard UI — body text, labels, buttons, inputs
- **Space Grotesk**: Exclusively for brand moments and Plusi's personality
  - Logo: "Anki" in `--ds-font-sans` weight 700, ".plus" in `--ds-font-brand` weight 500, colored `--ds-accent`
  - Plusi chat messages: `--ds-font-brand`
  - Plusi diary entries: `--ds-font-brand`
  - Plusi name label: `--ds-font-brand` weight 600
  - Section headlines (optional): `--ds-font-brand` weight 600

### Type Scale

| Token | Size | Use |
|-------|------|-----|
| `--ds-text-xs` | `11px` | Keyboard hints, micro-labels |
| `--ds-text-sm` | `12px` | Action buttons, timestamps, tab labels |
| `--ds-text-base` | `13px` | Descriptions, secondary body |
| `--ds-text-md` | `14px` | Card content body |
| `--ds-text-lg` | `15px` | **Chat messages (AI, User, Plusi), Input text** |
| `--ds-text-xl` | `18px` | Section headlines |
| `--ds-text-2xl` | `20px` | Logo, major headlines |

**Chat body text is 15px** — this matches Apple's primary reading size and ensures comfortable reading for extended study sessions.

---

## 6. Spacing

Base-4 scale.

| Token | Value |
|-------|-------|
| `--ds-space-xs` | `4px` |
| `--ds-space-sm` | `8px` |
| `--ds-space-md` | `12px` |
| `--ds-space-lg` | `16px` |
| `--ds-space-xl` | `24px` |
| `--ds-space-2xl` | `32px` |

---

## 7. Border Radius

| Token | Value | Use |
|-------|-------|-----|
| `--ds-radius-sm` | `8px` | Pills, badges, tabs |
| `--ds-radius-md` | `12px` | Buttons, MC options |
| `--ds-radius-lg` | `16px` | Cards, docks, containers |
| `--ds-radius-xl` | `22px` | Page-level surfaces |

---

## 8. Shadows

Three levels. Use sparingly — the Material = Function principle handles most depth.

| Token | Value |
|-------|-------|
| `--ds-shadow-sm` | `0 2px 8px rgba(0, 0, 0, 0.2)` |
| `--ds-shadow-md` | `0 4px 24px rgba(0, 0, 0, 0.35)` |
| `--ds-shadow-lg` | `0 8px 40px rgba(0, 0, 0, 0.5)` |

Light mode uses reduced opacity: `0.06`, `0.10`, `0.15`.

---

## 9. Animation

| Token | Value |
|-------|-------|
| `--ds-ease` | `cubic-bezier(0.16, 1, 0.3, 1)` |
| `--ds-duration` | `200ms` |

---

## 10. Component Classes (`.ds-*`)

These CSS classes are defined in `design-system.css` and used by both React components and native HTML. They solve the duplication problem — one class, one look, everywhere.

### `.ds-frosted` — Frosted Glass Container

Used for: Input Dock (Session), Search field (Deck Browser), Chat Input.

```css
.ds-frosted {
  background: var(--ds-bg-frosted);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--ds-border-medium);
  box-shadow: var(--ds-shadow-md);
  border-radius: var(--ds-radius-lg);
}
```

### `.ds-input-dock` — The Complete Input Dock

Used for: Session dock, Chat input area.

```css
.ds-input-dock {
  /* Inherits .ds-frosted */
}
.ds-input-dock textarea {
  background: transparent;
  border: none;
  color: var(--ds-text-primary);
  font-size: var(--ds-text-lg);
  font-family: var(--ds-font-sans);
  padding: var(--ds-space-md) var(--ds-space-lg);
  width: 100%;
  resize: none;
}
.ds-input-dock textarea::placeholder {
  color: var(--ds-text-placeholder);
}
.ds-input-dock .ds-actions {
  display: flex;
  justify-content: center;
  border-top: 1px solid var(--ds-border-subtle);
}
.ds-input-dock .ds-action {
  background: transparent;
  border: none;
  color: var(--ds-text-secondary);
  font-size: var(--ds-text-sm);
  font-weight: 500;
  padding: 11px var(--ds-space-lg);
  cursor: pointer;
  transition: color var(--ds-duration) var(--ds-ease);
}
.ds-input-dock .ds-action:hover {
  color: var(--ds-text-primary);
}
.ds-input-dock .ds-send {
  background: var(--ds-accent);
  border: none;
  border-radius: 50%;
  width: 30px;
  height: 30px;
  color: white;
  cursor: pointer;
}
```

### `.ds-thought-step` — AI Reasoning Step

Used for: ThoughtStream in React and Reviewer.

```css
.ds-thought-step {
  display: flex;
  align-items: flex-start;
  gap: var(--ds-space-sm);
  padding: var(--ds-space-sm) 0;
}
.ds-thought-step .ds-step-icon {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
}
.ds-thought-step .ds-step-text {
  font-size: var(--ds-text-base);
  color: var(--ds-text-secondary);
  line-height: 1.5;
}
.ds-thought-step.active .ds-step-text {
  color: var(--ds-text-primary);
}
```

### `.ds-mc-option` — Multiple Choice Option

Used for: MC grid in Reviewer and React MultipleChoiceCard.

```css
.ds-mc-option {
  background: transparent;
  border: none;
  border-radius: var(--ds-radius-md);
  padding: var(--ds-space-md) 14px;
  cursor: pointer;
  transition: background var(--ds-duration) var(--ds-ease);
}
.ds-mc-option:hover {
  background: rgba(255, 255, 255, 0.04);
}
.ds-mc-option.correct {
  background: rgba(48, 209, 88, 0.08);
  color: var(--ds-green);
}
.ds-mc-option.wrong {
  background: rgba(255, 69, 58, 0.05);
  color: var(--ds-red);
  text-decoration: line-through;
}
```

### `.ds-review-result` — Quiz Feedback

Used for: ReviewResult in React and Reviewer dock.

```css
.ds-review-result {
  padding: var(--ds-space-md) var(--ds-space-lg);
  font-size: var(--ds-text-base);
  line-height: 1.6;
}
.ds-review-result.correct {
  color: var(--ds-green);
}
.ds-review-result.wrong {
  color: var(--ds-red);
}
```

### `.ds-tab-bar` — Segmented Control

Used for: Top bar tabs (Stapel / Session / Statistik).

```css
.ds-tab-bar {
  display: flex;
  background: rgba(255, 255, 255, 0.04);
  border-radius: var(--ds-radius-sm);
  padding: 2px;
  gap: 1px;
}
.ds-tab {
  font-size: var(--ds-text-sm);
  font-weight: 500;
  color: var(--ds-text-tertiary);
  padding: 4px 14px;
  border-radius: 6px;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all var(--ds-duration) var(--ds-ease);
}
.ds-tab.active {
  background: rgba(255, 255, 255, 0.08);
  color: var(--ds-text-primary);
  font-weight: 600;
}
```

### `.ds-kbd` — Keyboard Hint

```css
.ds-kbd {
  font-family: var(--ds-font-mono);
  font-size: 10px;
  color: var(--ds-text-muted);
}
```

---

## 11. Architecture — How Tokens Flow

### Source of Truth

`shared/styles/design-system.css` — the single file defining all `:root` variables and `.ds-*` component classes.

### Tailwind Integration

One shared preset replaces all separate Tailwind configs:

```js
// shared/config/tailwind.preset.js
export default {
  theme: {
    extend: {
      colors: {
        'deep':       'var(--ds-bg-deep)',
        'canvas':     'var(--ds-bg-canvas)',
        'frosted':    'var(--ds-bg-frosted)',
        'overlay':    'var(--ds-bg-overlay)',
        'accent':     'var(--ds-accent)',
        'success':    'var(--ds-green)',
        'warning':    'var(--ds-yellow)',
        'error':      'var(--ds-red)',
        'purple':     'var(--ds-purple)',
      },
      textColor: {
        'primary':    'var(--ds-text-primary)',
        'secondary':  'var(--ds-text-secondary)',
        'tertiary':   'var(--ds-text-tertiary)',
        'muted':      'var(--ds-text-muted)',
      },
      borderColor: {
        'subtle':     'var(--ds-border-subtle)',
        'medium':     'var(--ds-border-medium)',
      },
      fontFamily: {
        'sans':  'var(--ds-font-sans)',
        'brand': 'var(--ds-font-brand)',
        'mono':  'var(--ds-font-mono)',
      },
      borderRadius: {
        'sm': '8px',
        'md': '12px',
        'lg': '16px',
        'xl': '22px',
      },
      fontSize: {
        'xs':   '11px',
        'sm':   '12px',
        'base': '13px',
        'md':   '14px',
        'lg':   '15px',
        'xl':   '18px',
        '2xl':  '20px',
      },
    },
  },
};
```

Both `frontend/tailwind.config.js` and `custom_reviewer/tailwind.config.js` extend this preset.

### Context Integration

| Context | How it gets tokens |
|---------|-------------------|
| **React Frontend** | `design-system.css` imported in `index.css`. Tailwind preset references CSS vars. |
| **Custom Reviewer** | `design-system.css` tokens injected into `styles.css`. Uses `.ds-*` classes + Tailwind utilities. |
| **Plusi Dock/Panel** | `design-system.css` injected into the webview. Replaces all hardcoded inline values with `var(--ds-*)`. |
| **Qt/QSS** | Small Python dict (`ui/tokens_qt.py`) with ~10 key values manually synced. Qt only styles containers — the actual content is in webviews that use CSS vars. |

### Theme Switching

```css
/* Dark (default) */
:root { --ds-bg-canvas: #1C1C1E; /* ... */ }

/* Light */
[data-theme="light"] { --ds-bg-canvas: #FFFFFF; /* ... */ }
```

Theme is toggled by setting `data-theme="light"` on the `<html>` element. All contexts respond automatically.

---

## 12. Design Rules

1. **No component may define its own colors** — use tokens
2. **No borders on child elements inside a container** — use separators
3. **Separators are always 1px, always `--ds-border-subtle`**
4. **Material = Function**: Frosted Glass for action, Borderless for content
5. **Buttons inside containers**: transparent background, text-color only, hover changes color not background
6. **Border-radius is consistent per tier**: sm for pills, md for buttons, lg for containers, xl for page surfaces
7. **Chat body text is 15px** (`--ds-text-lg`)
8. **Space Grotesk is exclusively for Plusi and brand** — never for standard UI text
9. **Light mode semantic colors use Apple's adjusted values** — not the same hex as dark mode
