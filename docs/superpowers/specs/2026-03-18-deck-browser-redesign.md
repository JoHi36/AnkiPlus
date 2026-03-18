# Deck Browser Redesign — Design Spec

**Date:** 2026-03-18
**Status:** Approved

---

## Overview

Redesign the native Anki deck browser (rendered in `custom_screens.py` via `webview_will_set_content`) to feel like a coherent Anki.plus product page: a wordmark header, a prominent pill search bar, and a clean in-place chat transformation. All changes are vanilla HTML/CSS/JS — no React involved.

---

## 1. Wordmark

**Placement:** Centered above the search bar, like a product logo above a search field (analogous to Google's homepage).

**Design:**
- `Anki` — system font (SF Pro Display / -apple-system), 46px, font-weight 700, letter-spacing −1.8px, `rgba(255,255,255,0.92)`
- `.plus` — same font, 46px, font-weight 300, letter-spacing −1px, `rgba(255,255,255,0.22)` (TLD/domain aesthetic)
- `[Badge]` — inline to the right of the wordmark, baseline-aligned, border-radius 7px (rectangular), font-size 10px, font-weight 700, letter-spacing 0.07em

**Badge states:**
- **Free:** `background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); color: rgba(255,255,255,0.28)` — nearly invisible, clickable as upgrade trigger
- **Pro:** `background: rgba(10,132,255,0.1); border: 1px solid rgba(10,132,255,0.22); color: rgba(10,132,255,0.72)` — calm blue, no glow

Badge click → opens upgrade/profile dialog (existing mechanism).

---

## 2. Search Bar (Pill)

**Container:** Same width as the deck card rows below it (`max-width` matching the deck list).

**Shape:** `border-radius: 50px` (full pill), height `~46px`.

**Layout (left to right):**
1. Left padding ~20px
2. `✦` sparkle icon — `rgba(100,130,255,0.65)`, font-size 14px
3. Textarea / input — flex-grows, font-size 14px, `rgba(255,255,255,0.85)`, placeholder `rgba(255,255,255,0.22)`
4. Right padding ~10px to container edge
5. Send button — 30×30px circle, `background: #0a84ff`, **ArrowRight icon** (not ArrowUp), white, stroke-width 2.5, 14px

**Send button behavior:**
- Hidden (`opacity: 0`, `scale: 0.75`, `pointer-events: none`) when input is empty
- Visible (`opacity: 1`, `scale: 1`) when input has text
- Transition: 150ms ease

**Focus state:**
- `border-color: rgba(10,132,255,0.25)`
- Snake border animation activates: `conic-gradient` rotating at 4s linear infinite, blue tones, same implementation as `ChatInput.tsx` and the reviewer dock

**Hint line** (centered, below the pill, 8px gap, font-size 10px, `rgba(255,255,255,0.15)`):
- **Unfocused:** "Fokussieren ⌘K" — monospace kbd tag
- **Focused:** "Senden Enter" — monospace kbd tag
- Switches on `focus`/`blur` events, no delay

**Rotating placeholder:** On load, the placeholder text rotates through a set of example questions every ~3s with a fade transition. Example strings:
- "Stelle eine Frage…"
- "Was ist ein Aktionspotential?"
- "Erkläre die Nernst-Gleichung"
- "Welche Muskeln rotieren den Oberarm?"
- "Zusammenfassung Biochemie?"

**Keyboard:** `⌘K` (or `Ctrl+K`) focuses the search bar from anywhere on the page.

---

## 3. Chat Message Style

**Trigger:** User types in search bar and hits Enter (or clicks send button).

**Transformation:** Deck content fades out and slides down, chat overlay fades in over it. Header stays visible (`top: 48px`). Overlay background `#111111`.

**Message layout — no bubbles, no frames:**

```
Du
Was ist ein Aktionspotential?        ← medium-weight title, no container

[AI response as flowing prose]       ← regular weight, line-height 1.7,
                                       max-width 720px, no frame/bubble
```

- **"Du" label:** 10px, uppercase, letter-spacing 0.08em, `rgba(255,255,255,0.3)`, margin-bottom 6px
- **Question text:** 18–20px, font-weight 600, `rgba(255,255,255,0.88)`, margin-bottom 20px
- **AI prose:** 15px, font-weight 400, `rgba(255,255,255,0.75)`, line-height 1.7, no background, no border
- **Streaming:** text appears character-by-character inline, no loading skeleton

**Follow-up dock:** Same floating dock as current implementation (textarea + close/reset action row), already implemented in `_CHAT_HTML`/`_CHAT_JS`.

---

## 4. Background & Transition

- Deck canvas background: `#1A1A1A` (dot grid pattern, existing)
- Chat overlay background: `#111111`, `position: fixed`, `top: 48px`, `inset: 0` otherwise
- Overlay fades in: `opacity 0→1`, duration 250ms ease
- Deck content slides out: `opacity 1→0` + `translateY(0→60px)`, duration 250ms ease
- Return (ESC / close button): reverse — deck slides back in, overlay fades out

---

## 5. Scope & Files

All changes are confined to `custom_screens.py`:

| Constant / Method | Change |
|---|---|
| `_PAGE_CSS` | Add wordmark styles, pill search bar styles, snake border `@property` + `@keyframes`, hint styles |
| `_SEARCHBAR_HTML` | New constant: wordmark + pill search bar + hint line HTML |
| `_CHAT_JS` | Update message rendering to Style B (Du label + title + prose) |
| `_deck_browser_html()` | Insert `_SEARCHBAR_HTML` above deck content |

No changes to React frontend, `bridge.py`, `widget.py`, or any other file.

---

## 6. Out of Scope

- Animated deck list entries (not requested)
- Dark mode toggle (already dark)
- Mobile/responsive layout (Anki desktop only)
- Persistent chat history across sessions (existing behavior unchanged)
