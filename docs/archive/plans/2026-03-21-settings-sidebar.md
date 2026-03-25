# Settings Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a left-side settings sidebar toggled by a "+" brand icon in the top-bar, showing subscription status, token usage, theme toggle, and quick actions. Delete obsolete ProfileDialog.

**Architecture:** The sidebar is a QDockWidget on the left side (same pattern as Plusi panel) containing a QWebEngineView with inline HTML/CSS/JS. The "+" toggle button lives in the custom_screens top-bar (HTML injected into Anki's webviews). Communication between the top-bar button and the Python sidebar uses the existing `_apAction` command system. The sidebar bridge uses QWebChannel for JS-to-Python calls.

**Tech Stack:** Python/PyQt6 (QDockWidget, QWebEngineView, QWebChannel), inline HTML/CSS/JS, existing bridge/command system

**Spec:** `docs/superpowers/specs/2026-03-21-settings-sidebar-design.md`

---

## File Structure

### New Files
- `ui/settings_sidebar.py` — SettingsSidebar QDockWidget with inline HTML/CSS/JS, SidebarBridge (QWebChannel), toggle/create functions

### Modified Files
- `ui/custom_screens.py` — Add "+" toggle button to `_top_bar()` left side, add `toggle-sidebar` command handler
- `ui/setup.py` — Export `toggle_settings_sidebar()` wrapper
- `frontend/src/App.jsx` — Remove ProfileDialog import, state, usage
- `frontend/src/components/ContextSurface.jsx` — Remove `onOpenSettings` prop

### Deleted Files
- `frontend/src/components/ProfileDialog.jsx` — Obsolete settings modal

---

## Task 1: Create Settings Sidebar Widget

**Files:**
- Create: `ui/settings_sidebar.py`

- [ ] **Step 1: Create the settings sidebar module**

Create `ui/settings_sidebar.py` following the Plusi panel pattern (`plusi/panel.py`). The module contains:

1. **`SidebarBridge(QObject)`** — QWebChannel bridge with `@pyqtSlot` methods:
   - `getStatus() -> str` — returns JSON with tier, theme, planName, price, isAuthenticated
   - `setTheme(theme: str)` — updates config and applies global theme
   - `openNativeSettings()` — opens existing SettingsWindow via `ui.setup.show_settings()`
   - `copyLogs()` — copies debug info (platform, python version, tier, backend_url) to clipboard
   - `logout()` — clears auth tokens in config, hides sidebar
   - `closeSidebar()` — hides sidebar

2. **`_build_sidebar_html() -> str`** — generates complete HTML document with:
   - Status card at top (no header/branding) — tier-colored (free=gray, tier1=blue, tier2=purple)
   - Plan name, price, token bar with percentage
   - "Upgrade →" / "Abo verwalten →" link
   - Theme toggle: System / Dunkel / Hell (pill-style segmented control)
   - Divider
   - Action rows: Anki-Einstellungen (gear icon + chevron), Logs kopieren (copy icon + "Debug-Info")
   - Divider
   - Abmelden button (red, only shown when authenticated)
   - QWebChannel JS setup: connects to `sidebarBridge`, calls `loadStatus()` on init
   - `updateTokens(used, limit)` function callable from Python via `runJavaScript()`
   - `setTheme(theme)` updates active button and calls bridge

3. **Module-level functions:**
   - `_create_sidebar()` — creates QDockWidget (240px fixed width, left side, no title bar, `bg_deep` background), QWebEngineView, QWebChannel with SidebarBridge, starts hidden
   - `toggle_settings_sidebar()` — creates on first call, toggles visibility, refreshes status on open, rotates "+" button in top-bar via `mw.web.page().runJavaScript()`
   - `is_sidebar_visible() -> bool`

Key details:
- Sidebar width: 240px (constant `SIDEBAR_WIDTH`)
- Background: `tokens['bg_deep']` from `ui/tokens_qt.py` (matches chat panel)
- QDockWidget features: only `DockWidgetClosable` (not movable/floatable)
- On toggle open: run `loadStatus();` in sidebar webview to refresh data
- On toggle: run JS on `mw.web` to rotate the "+" button: `document.getElementById('ap-sidebar-toggle').style.transform = 'rotate(45deg)'` or `'rotate(0deg)'`
- Use `mw.web.page().runJavaScript()` (not `.eval()`) for the rotation JS

- [ ] **Step 2: Verify file syntax**

Run: `python3 -c "import ast; ast.parse(open('ui/settings_sidebar.py').read()); print('OK')"`

- [ ] **Step 3: Commit**

```bash
git add ui/settings_sidebar.py
git commit -m "feat: create settings sidebar widget with status card, theme toggle, actions"
```

---

## Task 2: Add "+" Toggle Button to Top Bar

**Files:**
- Modify: `ui/custom_screens.py`

- [ ] **Step 1: Read `ui/custom_screens.py` lines 360-470**

Understand the `_top_bar()` function and the `_apAction` command dispatch system.

- [ ] **Step 2: Add "+" button to `left_html` in `_top_bar()`**

In `_top_bar()` (line ~360), define the "+" button HTML before the tab logic:

```python
    # "+" toggle button for settings sidebar
    plus_btn = (
        '<button id="ap-sidebar-toggle" '
        'onclick="window._apAction={type:\'cmd\',cmd:\'toggle-sidebar\'}" '
        'style="background:none;border:none;cursor:pointer;padding:4px;margin-right:8px;'
        'transition:transform 0.2s ease;display:flex;align-items:center;">'
        '<svg width="14" height="14" viewBox="0 0 14 14" fill="none">'
        '<rect x="5" y="0" width="4" height="14" rx="2" fill="#0a84ff" opacity="0.6"/>'
        '<rect x="0" y="5" width="14" height="4" rx="2" fill="#0a84ff" opacity="0.6"/>'
        '</svg>'
        '</button>'
    )
```

Then prepend `plus_btn` to every `left_html` assignment:
- Stapel view (line ~382): `left_html = f'{plus_btn}<span ...>Heute: {total_due} Karten</span>'`
- Other views (line ~401): `left_html = f'{plus_btn}{deck_part}'`
- Empty case: `left_html = plus_btn`

- [ ] **Step 3: Add `toggle-sidebar` command handler**

Find where `_apAction` commands like `'settings'` are dispatched. Add handling for `'toggle-sidebar'`:

```python
elif cmd == 'toggle-sidebar':
    try:
        from .settings_sidebar import toggle_settings_sidebar
    except ImportError:
        from ui.settings_sidebar import toggle_settings_sidebar
    toggle_settings_sidebar()
```

- [ ] **Step 4: Commit**

```bash
git add ui/custom_screens.py
git commit -m "feat: add + toggle button to top bar, wire toggle-sidebar command"
```

---

## Task 3: Wire Sidebar into Setup

**Files:**
- Modify: `ui/setup.py`

- [ ] **Step 1: Add sidebar toggle wrapper to `ui/setup.py`**

Add at the end of `ui/setup.py`:

```python
def toggle_settings_sidebar():
    """Toggle the settings sidebar."""
    try:
        from .settings_sidebar import toggle_settings_sidebar as _toggle
    except ImportError:
        from ui.settings_sidebar import toggle_settings_sidebar as _toggle
    _toggle()
```

- [ ] **Step 2: Commit**

```bash
git add ui/setup.py
git commit -m "feat: export toggle_settings_sidebar from setup module"
```

---

## Task 4: Delete ProfileDialog & Clean Up References

**Files:**
- Delete: `frontend/src/components/ProfileDialog.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/ContextSurface.jsx`

- [ ] **Step 1: Delete ProfileDialog.jsx**

```bash
rm frontend/src/components/ProfileDialog.jsx
```

- [ ] **Step 2: Clean up App.jsx**

Remove from `App.jsx`:
1. Import: `import ProfileDialog from './components/ProfileDialog';` (line 17)
2. State: `const [showProfile, setShowProfile] = useState(false);` (line 80)
3. Handler functions: `handleOpenSettings` / `handleCloseSettings` (around lines 1726-1732)
4. Props: all `onOpenSettings={() => setShowProfile(true)}` references (lines ~2007, 2373)
5. JSX: `<ProfileDialog isOpen={showProfile} onClose={...} />` block (lines ~2419-2421)

For any component that received `onOpenSettings` as a prop, remove that prop entirely.

- [ ] **Step 3: Clean up ContextSurface.jsx**

Remove the `onOpenSettings` prop from the component signature and the "Profil" button that uses it. Keep all other functionality intact.

- [ ] **Step 4: Build frontend**

Run: `cd frontend && npm run build`
Expected: Build succeeds without errors

- [ ] **Step 5: Commit**

```bash
git add -u frontend/src/components/ProfileDialog.jsx frontend/src/App.jsx frontend/src/components/ContextSurface.jsx
git commit -m "fix: delete obsolete ProfileDialog, clean up references"
```

---

## Task 5: Integration Verification

- [ ] **Step 1: Verify Python syntax**

```bash
python3 -c "import ast; ast.parse(open('ui/settings_sidebar.py').read()); print('OK')"
```

- [ ] **Step 2: Build frontend**

Run: `cd frontend && npm run build`
Expected: Success

- [ ] **Step 3: Verify no broken ProfileDialog references**

```bash
grep -r "ProfileDialog" frontend/src/ --include="*.jsx" --include="*.js"
```
Expected: No results

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: settings sidebar implementation complete"
```
