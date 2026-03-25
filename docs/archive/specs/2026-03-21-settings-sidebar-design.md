# Settings Sidebar — Design Spec

## Goal

Add a slim left-side settings sidebar to the Anki addon, toggled by a branded "+" button in the top-left toolbar area. The sidebar shows subscription status, token usage, theme toggle, and quick actions. Delete the obsolete ProfileDialog.

## Trigger & Position

### Button
- **Position:** Top-left of the Anki main window, replacing/alongside the "Heute: X Karten" text
- **Icon:** The ANKI+ brand "+" symbol in accent blue (`#0A84FF`, 60% opacity)
- **Toggle Animation:** "+" rotates 45° to become "×" when sidebar is open (CSS `transform: rotate(45deg)`, 200ms ease)
- **The card count text** shifts right when the sidebar slides out

### Sidebar
- **Side:** Left
- **Width:** 240px fixed
- **Background:** `var(--ds-bg-deep)` (`#141416` dark / `#ECECF0` light) — same as chat panel, visually distinct from the main Anki window
- **Slide animation:** Slides in from left, 200ms ease
- **Implementation:** QDockWidget on the left side (same pattern as the Plusi panel)

## Content Structure

Top to bottom, no header/branding:

### 1. Status Card (top, full width, no border-radius at top)

Fills the top of the sidebar. Tier-colored:
- **Free:** Gray tones — `rgba(255,255,255,0.04)` gradient, white/20% border
- **Student (tier1):** Blue tones — `rgba(10,132,255,0.07)` gradient, blue/10% border
- **Exam Pro (tier2):** Purple tones — `rgba(168,85,247,0.07)` gradient, purple/10% border

Content:
- Label: "DEIN PLAN" (10px uppercase, tier-colored)
- Plan name: "Starter" / "Student" / "Exam Pro" (18px semibold)
- Price: "Kostenlos" / "4,99€ / Monat" / "14,99€ / Monat" (11px, right-aligned)
- Token usage bar: "Heute: 8.2K / 20K" with 3px progress bar
- Percentage + "Setzt sich täglich zurück" (9px, subtle)
- Action link: "Upgrade →" (free) / "Abo verwalten →" (paid) — opens landing page in browser

### 2. Erscheinungsbild (Theme Toggle)

- Section label: "ERSCHEINUNGSBILD" (10px uppercase, 15% opacity)
- Pill toggle: System | Dunkel | Hell
- Active state: `rgba(255,255,255,0.08)` background, bold text
- Inactive: 30% opacity text
- Calls bridge method to update theme in config

### 3. Divider

1px line, `rgba(255,255,255,0.04)`

### 4. Actions

Simple list rows with icon + text:

- **Anki-Einstellungen** — gear icon, chevron right. Opens the existing SettingsWindow (native Qt dialog)
- **Logs kopieren** — copy icon, "Debug-Info" subtitle. Copies debug logs to clipboard

### 5. Divider

### 6. Abmelden (bottom)

- Red text: `rgba(255,59,48,0.6)` — Apple HIG red, subtle
- Only visible when user is authenticated
- Calls logout bridge method, clears auth tokens

## Data Flow

### Token Usage
- On sidebar open: fetch current quota from backend (`GET /user/quota`) or use cached `tokenInfo` from last chat response
- Display normalized tokens (daily used / daily limit)
- Update after each chat request via the `[DONE]` event token data

### Theme Toggle
- Read current theme from config on open
- On toggle: call `bridge.saveSettings()` with new theme value
- Theme applies immediately via `global_theme.py`

### Logout
- Call `bridge.logout()` → clears auth tokens from config
- Sidebar closes, UI reflects logged-out state

## Cleanup: Delete ProfileDialog

Remove these files/references:
- `frontend/src/components/ProfileDialog.jsx` — delete file
- All `ProfileDialog` imports and state in `App.jsx` (`showProfile`, `setShowProfile`, `onOpenSettings`)
- The "Profil" button in `ContextSurface.jsx` that opens ProfileDialog

## Implementation Notes

### Qt Side
- New QDockWidget on `Qt.LeftDockWidgetArea` in `ui/setup.py`
- Uses a QWebEngineView loading a React component (same pattern as chat panel)
- OR: Pure HTML/CSS/JS injected via `setHtml()` (simpler, similar to Plusi panel)
- Toggle via the "+" button which is a native Qt widget in the toolbar area

### React Side (if using React)
- New `SettingsSidebar.jsx` component
- Receives tier, quota, theme via bridge
- Emits theme changes, logout, open-settings via bridge messages

### Bridge Methods Needed
- `getQuotaStatus()` — returns `{ tier, daily: { used, limit }, weekly: { used, limit } }`
- `setTheme(theme)` — "dark" | "light" | "system"
- `openNativeSettings()` — opens the existing SettingsWindow
- `copyLogs()` — copies debug info to clipboard
- `logout()` — already exists

## Out of Scope
- Detailed weekly/monthly usage charts (landing page only)
- Settings sub-pages within the sidebar
- Agent Studio settings (already in Agent Studio)
- Embedding management
- API key management (stays in SettingsWindow)
