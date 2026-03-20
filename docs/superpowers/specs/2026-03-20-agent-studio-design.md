# Agent Studio — Menu Redesign

**Date:** 2026-03-20
**Status:** Design approved
**Mockups:** `.superpowers/brainstorm/33472-1774026552/`

## Summary

Restructure the AnkiPlus settings system by separating Agent settings from Account settings. Agent settings move out of the popup dialog (`ProfileDialog` / `settings.html`) and become an in-place view called **Agent Studio** that replaces the chat area. Account settings remain in the existing popup (to be repositioned later).

## Goals

1. Agent settings live where the agents live — in the chat panel
2. Zero additional UI clutter — no new buttons, icons, or headers beyond what's necessary
3. Consistent, predictable navigation via keyboard shortcuts (future remote-control ready)
4. Manual control over insight extraction instead of automatic triggers

---

## 1. Agent Studio — In-Place View

### Layout

The Agent Studio replaces the chat message area when activated. It is **not** an overlay or popup — the chat content is hidden and the studio content is shown in its place.

**Structure (top to bottom):**

```
┌─────────────────────────────────┐
│        Agent Studio             │  ← Centered header (16px, semibold)
│                                 │
│  SEMANTISCHE SUCHE              │  ← Section title (uppercase, 10px)
│  ┌─────────────────────────┐    │
│  │ 🔍 Karten-Embeddings    │    │  ← Progress bar, status badge, count
│  │ ████████████████░ 8303  │    │
│  │ Beschreibungstext       │    │
│  └─────────────────────────┘    │
│                                 │
│  AGENT TOOLS                    │
│  ┌─────────────────────────┐    │
│  │ 🔍 Kartensuche    [ON]  │    │
│  │ 🖼️ Bilder         [ON]  │    │
│  │ 📊 Diagramme      [ON]  │    │
│  │ 📈 Statistiken    [ON]  │    │
│  │ 🧬 Moleküle Beta  [ON]  │    │
│  └─────────────────────────┘    │
│                                 │
│  SUBAGENTEN                     │
│  ┌─────────────────────────┐    │
│  │ [Plusi SVG] Plusi  [ON] │    │  ← Toggle row
│  │─────────────────────────│    │  ← Divider line (no extra container)
│  │ Sub-Agent-Menü        › │    │  ← Entire lower area is one clickable button
│  └─────────────────────────┘    │
│                                 │
│  ┌─────────────────────────┐    │
│  │ Stelle eine Frage...    │    │  ← Same ChatInput component as chat
│  └─────────────────────────┘    │
│  Weiter SPACE │ Agent Studio ↵  │  ← Action buttons (persistent)
└─────────────────────────────────┘
```

### Visual Design

- Uses the existing design system tokens from `shared/styles/design-system.css`
- Background: `var(--ds-bg-deep)` (same as chat panel)
- Cards: `var(--ds-bg-canvas)` with `var(--ds-border-subtle)` borders, `border-radius: 12px`
- Section titles: 10px uppercase, `var(--ds-text-tertiary)`, letter-spacing 0.8px
- Tool rows: 13px label, 11px description, toggle switches (36x20px, accent blue when on)
- Plusi icon: The real SVG from `PlusiWidget.jsx` (cross shape with elliptical eyes)
- No back button in header — navigation lives in the action buttons below

### Components

**New component:** `AgentStudio.jsx` in `frontend/src/components/`
- Receives `bridge`, tool settings, embedding status, Plusi config as props
- Reuses toggle switch styling from `settings.html`
- Emits bridge messages for tool toggles: `bridge.saveAITools()`
- "Sub-Agent-Menü" click triggers navigation to Plusi sub-menu

**Modified:** `App.jsx`
- New state: `activeView: 'chat' | 'agentStudio' | 'plusiMenu'`
- Conditional rendering: chat messages vs AgentStudio vs PlusiMenu
- State preservation: chat messages, scroll position, and input draft are kept in state when switching views

---

## 2. Navigation & Shortcuts

### State Machine

```
                    Enter                    Enter
    ┌──────────┐ ──────────► ┌──────────────┐ ──────────► ┌─────────────┐
    │   Chat   │             │ Agent Studio  │             │ Plusi-Menü  │
    │ (default)│ ◄────────── │              │ ◄────────── │             │
    └──────────┘   Space     └──────────────┘    Enter    └─────────────┘
         ▲                                                       │
         └───────────────────── Space ───────────────────────────┘
```

### Shortcut Mapping

| Context | Enter (↵) | Space |
|---------|-----------|-------|
| Chat (input not focused) | Open Agent Studio | Next card (Weiter) |
| Chat (input focused) | Send message (shortcut hint hidden) | Types space character |
| Agent Studio | Navigate to Plusi-Menü | Close → Chat |
| Plusi-Menü | Navigate to Agent Studio | Close → Chat |

### Entry Points

| Trigger | From | Destination |
|---------|------|-------------|
| Enter (↵) action button | Chat | Agent Studio |
| `Cmd+.` keyboard shortcut | Anywhere | Toggle Agent Studio |
| Plusi Dock tap | Anywhere | Plusi-Menü (direct) |

### Action Buttons (Bottom Bar)

The two action buttons have **consistent labels** but their behavior is view-aware:

- **Left:** `Weiter SPACE` — in Chat: next card. In Agent Studio / Plusi-Menü: close view → return to Chat.
- **Right:** `Agent Studio ↵` — in Chat: open Agent Studio. In Agent Studio: navigate to Plusi-Menü. In Plusi-Menü: navigate back to Agent Studio.

The labels stay the same to maintain visual consistency and remote-control readiness. The behavior routing happens in App.jsx based on `activeView`.

When the chat input is focused, the `↵` shortcut hint on the right button is hidden (since Enter sends the message). The button itself remains visible and clickable.

### InsightsDashboard Viewing

The InsightsDashboard (empty-state widget) is shown automatically when the chat has no messages (as before). It is **not** accessed via a button or shortcut — it is simply the default content area when there are no chat messages. The previous "Erkenntnisse ↵" toggle button is removed.

### ChatInput Behavior Across Views

The ChatInput component is rendered in all three views (Chat, Agent Studio, Plusi-Menü). Its behavior:

- **If user types text and hits Enter:** Always sends a chat message and switches back to Chat view (if not already there). This ensures the input always "just works" regardless of which view is active.
- **If input is empty and Enter key is pressed:** Triggers the view-specific action (open Agent Studio / navigate to Plusi-Menü / navigate back).
- **Space key:** Only triggers the action button when the textarea is not focused (same logic as current implementation).

### `Cmd+.` Registration

Register `Cmd+.` as a global keyboard shortcut in `App.jsx`'s top-level `keydown` event handler (not in ChatInput). It toggles between Chat and Agent Studio. Note: test for conflicts with macOS system shortcuts — if `Cmd+.` conflicts, fall back to `Cmd+Shift+.`.

### Plusi Dock Tap Across Views

If the user taps the Plusi Dock icon while already in Agent Studio, it navigates to Plusi-Menü. If already in Plusi-Menü, it's a no-op. From Chat, it opens Plusi-Menü directly (skipping Agent Studio).

### Embedding Status Data

The embedding progress data (count, total, status) is fetched via the existing `bridge.getEmbeddingStatus()` method (already used in `settings.html`'s `renderEmbeddingStatus()`). AgentStudio polls this on mount and listens for updates via `ankiReceive` events.

---

## 3. Plusi Sub-Menu

When the user navigates into the Plusi sub-menu (via "Sub-Agent-Menü" or Plusi Dock tap), the Agent Studio content is replaced with Plusi-specific settings:

- Tagebuch (diary) viewer
- Stimmung & Freundschaft display
- Future: additional Plusi configuration

**Header:** "Plusi" centered (same style as Agent Studio header)

**Navigation:** Enter returns to Agent Studio, Space closes to Chat.

**Component:** `PlusiMenu.jsx` — new component, details to be designed in a follow-up spec.

---

## 4. Erkenntnisse Extrahieren (Insight Extraction)

### Change: Manual Instead of Automatic

Currently, insight extraction is triggered automatically when the user advances to the next card after chatting. This changes to a **manual trigger** — the user decides when to extract.

### UI: Sparkles Button

A subtle inline button appears below the chat messages when **3 or more messages** exist in the current session.

**States:**

1. **Idle:** Ultra-subtle (opacity ~0.15). Sparkles icon (Lucide 4-point star SVG from `settings.html`) + "Erkenntnisse extrahieren" text.

2. **Hover:** Colors activate — icon and text turn blue (`#0a84ff`, opacity ~0.45). Subtle radial glow behind. Tiny sparkle particles float (blue/white, 2px dots, `sparkle-float` animation).

3. **Extracting (after tap):** Shimmer bar appears above the text (180px wide, 3px height). Gradient: blue-dominant with subtle purple accent (`rgba(10,132,255,0.12) → rgba(168,85,247,0.18) → rgba(10,132,255,0.12)`). Scan glow sweeps left-to-right. Icon pulses. Floating particles.

4. **Done:** Button disappears. New insights are added to the InsightsDashboard.

### Two Flows After Tap

**Flow A — Stay and watch:**
- User taps "Erkenntnisse extrahieren"
- Loading animation plays
- When done, the view transitions to the empty state (InsightsDashboard)
- New insights appear with "neu" label

**Flow B — Continue learning:**
- User taps "Erkenntnisse extrahieren"
- Loading animation starts
- User presses Space (Weiter) → advances to next card
- Extraction continues in background
- New insights appear silently in the InsightsDashboard on the next card's empty state

### InsightsDashboard "Neu" Marking

The existing `InsightsDashboard.jsx` component gets a small addition:
- Newly extracted insights have a **blue bullet** (instead of grey) and a small "neu" label (9px, `rgba(10,132,255,0.35)`) inline after the text
- The "neu" marking is shown **once** — cleared when the InsightsDashboard component mounts with new insights (i.e., the user sees the empty state). The "seen" flag is stored in React state per card session (via `useCardSession`), so it resets naturally per card but persists across view switches within the same card.
- The widget layout, stats, charts, and styling remain **completely unchanged**

### Animation Specs

All animations use CSS keyframes consistent with `ThoughtStream.tsx`:

```css
/* Sparkle particles floating */
@keyframes sparkle-float {
  0%, 100% { transform: scale(0) rotate(0deg); opacity: 0; }
  15% { transform: scale(1) rotate(45deg); opacity: 1; }
  50% { transform: scale(0.8) rotate(90deg); opacity: 0.6; }
  100% { transform: scale(0) rotate(180deg); opacity: 0; }
}

/* Shimmer bar sweep */
@keyframes shimmer-sweep {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

/* Scan glow left-to-right */
@keyframes scan-left-right {
  0% { left: -40%; }
  100% { left: 100%; }
}

/* Icon pulse during loading */
@keyframes star-pulse {
  0%, 100% { opacity: 0.5; transform: scale(1); }
  50% { opacity: 0.8; transform: scale(1.1); }
}
```

---

## 5. Removals & Cleanup

### Lernkarte Pill

Remove `FloatingSectionPill` from `ContextSurface.jsx`. The pill at the top of the chat panel showing "Lernkarte" is no longer needed.

### ProfileDialog / settings.html — Agent Tab

Remove the "Agent" tab from the settings popup. The popup keeps only account-related content:
- Konto (auth, subscription tier, quota)
- Erscheinungsbild (theme selector)
- Weiteres (Anki settings link, copy logs)

The tab bar (`Konto | Agent`) is removed since only one section remains.

---

## 6. State Preservation

When switching between Chat ↔ Agent Studio ↔ Plusi-Menü:
- Chat messages array remains in React state (not cleared)
- Scroll position is saved and restored via `scrollTop` ref
- Input draft (text in ChatInput) is preserved
- Transition animation: fade (~200ms) between views

---

## 7. Files to Create / Modify

### New Files
- `frontend/src/components/AgentStudio.jsx` — Main Agent Studio view
- `frontend/src/components/PlusiMenu.jsx` — Plusi sub-menu view (placeholder for follow-up spec)
- `frontend/src/components/ExtractInsightsButton.jsx` — Sparkles extraction trigger with animations

### Modified Files
- `frontend/src/App.jsx` — View state management (`activeView`), shortcut handling, conditional rendering
- `frontend/src/components/InsightsDashboard.jsx` — Add "neu" marking for new insights
- `frontend/src/components/ContextSurface.jsx` — Remove `FloatingSectionPill`
- `shared/components/ChatInput.tsx` — Hide Enter shortcut hint when input focused
- `settings.html` — Remove Agent tab, remove tab bar
- `ui/settings.py` — Remove Agent-tab-related bridge methods if any become unused
- `frontend/src/hooks/useAnki.js` — No changes needed (existing bridge methods suffice)

---

## 8. Out of Scope

- Account settings repositioning (kept in existing popup for now)
- Plusi sub-menu detailed design (follow-up spec)
- ChatInput context-specific behavior in Agent Studio (future: AI plugin generation, reminders)
- Multiple sub-agents support (current UI implies it but only Plusi exists)
- Onboarding hint for `Cmd+.` shortcut
