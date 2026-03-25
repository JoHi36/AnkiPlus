# Sidebar Tab-Bar Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move agent menus (PlusiMenu, ResearchMenu, StandardSubMenu) from the chat panel into the existing Settings Sidebar via a vertical icon tab-bar, then remove the old AgentStudio.

**Architecture:** The existing `SettingsSidebar` becomes a tabbed container. A new `SidebarTabBar` component (44px vertical icon strip) sits to its left inside the same fixed overlay. The first tab shows the current settings content unchanged. Additional tabs show each registered agent's submenu. The old `AgentStudio`, `activeView`-based agent navigation, and ⌘. shortcut are removed.

**Tech Stack:** React 18, CSS custom properties (`var(--ds-*)`), framer-motion-free CSS transitions, subagentRegistry.

**Design Decisions (from brainstorming):**
- Tab bar: 44px vertical icon strip, left side of sidebar
- Background: `--ds-bg-deep` for both strip and content, separated by `--ds-border-subtle` border
- Active indicator: background-pill that slides between tabs (`cubic-bezier(0.25, 1, 0.5, 1)`)
- Active icon gets agent color, inactive icons are `rgba(255,255,255,0.25)`
- First tab icon: Sliders (Lucide `SlidersHorizontal`)
- Agent icons: real SVGs from registry (Plusi = brand cross, Tutor = graduation cap, etc.)
- Content transition: old tab hides instantly (`display: none`), new tab fades in (300ms slide-up)
- Sidebar width increases by 44px when tabs are present: `--ds-settings-width` changes from `280px` to `324px`
- Settings content stays 100% unchanged — no "Allgemein" label added
- Note: `dangerouslySetInnerHTML` for agent SVG icons is an existing pattern from `AgentCard.jsx`. The SVG data comes from the Python agent registry (trusted internal source), not user input.

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| **Create** | `frontend/src/components/SidebarTabBar.jsx` | Vertical icon strip with pill animation |
| **Create** | `frontend/src/components/SidebarShell.jsx` | Wraps tab bar + content area, manages active tab state |
| **Modify** | `frontend/src/components/SettingsSidebar.jsx` | Remove outer wrapper (now provided by SidebarShell) |
| **Modify** | `frontend/src/App.jsx` | Replace `<SettingsSidebar />` with `<SidebarShell />`, remove AgentStudio activeView branches, remove ⌘. shortcut, update width var |
| **Modify** | `shared/styles/design-system.css` | Add `--ds-sidebar-tab-width: 44px`, update `--ds-settings-width` to `324px` |
| **Modify** | `frontend/src/components/PlusiMenu.jsx` | Remove back-button header, adapt to sidebar context (no `onNavigateBack` prop needed) |
| **Modify** | `frontend/src/components/ResearchMenu.jsx` | Remove back-button header, adapt to sidebar context |
| **Modify** | `frontend/src/components/StandardSubMenu.jsx` | Remove back-button header, adapt to sidebar context |
| **Delete** | `frontend/src/components/AgentStudio.jsx` | No longer needed |
| **Delete** | `frontend/src/components/SystemIntelligenceBox.jsx` | Moves into individual agent tabs or removed |

---

## Task 1: Add CSS tokens for sidebar tab bar

**Files:**
- Modify: `shared/styles/design-system.css:113`

- [ ] **Step 1: Add tab-bar width token and update settings width**

In `design-system.css`, find line 113 (`--ds-settings-width: 280px;`) and update:

```css
  --ds-sidebar-tab-width: 44px;
  --ds-settings-width: 324px;                                      /* 280px content + 44px tab bar */
```

- [ ] **Step 2: Verify no hardcoded 280px references**

Search for hardcoded `280` in frontend CSS/JSX. If found, replace with `var(--ds-settings-width)`.

- [ ] **Step 3: Commit**

```bash
git add shared/styles/design-system.css
git commit -m "feat(tokens): add sidebar tab bar width token, update settings width"
```

---

## Task 2: Create SidebarTabBar component

**Files:**
- Create: `frontend/src/components/SidebarTabBar.jsx`

- [ ] **Step 1: Create the component**

The SidebarTabBar renders a 44px vertical icon strip with:
- Settings tab (Lucide SlidersHorizontal icon) at top
- Divider line
- Agent tabs below (using real SVG icons from the agent registry)
- A background pill that animates between tabs on click

For agent SVG icons, use the same `dangerouslySetInnerHTML` pattern from `AgentCard.jsx` — the SVG data comes from the Python agent registry (trusted internal source).

Key behaviors:
- `activeTab` prop controls which tab is highlighted
- `onTabChange(tabId)` callback for clicks
- `agents` prop is the filtered list of agents with submenus
- Pill position computed via `getBoundingClientRect()` relative to strip
- Pill transition: `top 0.4s cubic-bezier(0.25, 1, 0.5, 1), background 0.4s ease`
- Active icon gets agent color, inactive = `rgba(255,255,255,0.25)`
- Press animation: `scale(0.92)` on mouseDown

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/SidebarTabBar.jsx
git commit -m "feat(sidebar): create SidebarTabBar component with pill animation"
```

---

## Task 3: Create SidebarShell component

**Files:**
- Create: `frontend/src/components/SidebarShell.jsx`

- [ ] **Step 1: Create the component**

SidebarShell wraps the tab bar + content area. It manages `activeTab` state and renders the correct content panel.

Key behaviors:
- State: `activeTab` — `'__settings__'` (default) or an agent name string
- Loads agent list from `getRegistry()`, filtered to agents with `submenuComponent`, `toolsConfigurable`, or `name === 'plusi'`
- Sorts: default agents first, then alphabetical by label
- Listens to `agentRegistryUpdated` event for registry changes
- Routes content: `__settings__` → `<SettingsSidebar />`, `plusi` → `<PlusiMenu />`, agents with `submenuComponent === 'researchMenu'` → `<ResearchMenu />`, others → `<StandardSubMenu />`
- Content transition: uses `key={activeTab}` to force remount, with CSS `@keyframes sidebarContentIn` (opacity 0→1, translateY 6px→0, 300ms)
- Layout: `display: flex, height: 100%` — tab bar left, content right

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/SidebarShell.jsx
git commit -m "feat(sidebar): create SidebarShell with tab routing and content animation"
```

---

## Task 4: Adapt SettingsSidebar for shell context

**Files:**
- Modify: `frontend/src/components/SettingsSidebar.jsx`

- [ ] **Step 1: Verify compatibility**

The component currently has a root div with `h-full overflow-y-auto` and explicit `background: var(--ds-bg-deep)`, `padding: 16px 14px`. This will correctly fill the shell's flex child container. **No changes needed** — the component already works as a child of a flex column.

- [ ] **Step 2: Commit (skip if no changes)**

---

## Task 5: Adapt PlusiMenu for sidebar context

**Files:**
- Modify: `frontend/src/components/PlusiMenu.jsx`

- [ ] **Step 1: Verify back-button situation**

PlusiMenu currently doesn't render a visible back button (removed in earlier refactor). The `onNavigateBack` prop is accepted but not critical. No changes needed — `onNavigateBack` just won't be passed from `SidebarShell`.

- [ ] **Step 2: Verify PlusiMenu fills sidebar space**

Check that root div uses `flex: 1` and `flexDirection: 'column'` — it does.

- [ ] **Step 3: Commit (if changes made)**

---

## Task 6: Adapt ResearchMenu for sidebar context

**Files:**
- Modify: `frontend/src/components/ResearchMenu.jsx:144-158`

- [ ] **Step 1: Remove the back-button header**

The ResearchMenu has a header section (lines ~144-158) with a BackArrow button and centered "Research Agent" title. Remove this header — the tab bar now provides navigation.

Replace with a simpler agent title showing the agent icon + name + description, same style as the Tutor tab in the mockup.

- [ ] **Step 2: Make `onNavigateBack` optional**

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ResearchMenu.jsx
git commit -m "refactor(research-menu): remove back button, adapt for sidebar tabs"
```

---

## Task 7: Adapt StandardSubMenu for sidebar context

**Files:**
- Modify: `frontend/src/components/StandardSubMenu.jsx:136-184`

- [ ] **Step 1: Remove the back-button header**

Replace the header section (lines ~136-184) with a simpler agent header: agent label + description, no back arrow.

- [ ] **Step 2: Make `onNavigateBack` optional**

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/StandardSubMenu.jsx
git commit -m "refactor(standard-submenu): remove back button, adapt for sidebar tabs"
```

---

## Task 8: Wire SidebarShell into App.jsx

**Files:**
- Modify: `frontend/src/App.jsx`

This is the largest task — it connects the new shell and removes old agent navigation.

- [ ] **Step 1: Import SidebarShell, remove AgentStudio import**

Replace `import AgentStudio from './components/AgentStudio'` with `import SidebarShell from './components/SidebarShell'`.

- [ ] **Step 2: Replace SettingsSidebar with SidebarShell in settingsPanel**

Find lines 2329-2343 (the `settingsPanel` const). Replace `<SettingsSidebar />` with `<SidebarShell bridge={bridge} />`.

- [ ] **Step 3: Remove ⌘. shortcut**

Find lines ~1914-1924 (the `useEffect` with `⌘.` handler). Remove the entire `useEffect` block.

- [ ] **Step 4: Remove AgentStudio/submenu rendering from chat panel**

Find lines ~2641-2663 where `activeView === 'agentStudio'` branches render agent menus. Remove all four branches (`agentStudio`, `plusiMenu`, `researchMenu`, `subMenu:*`). The chat panel now ONLY renders chat content.

- [ ] **Step 5: Remove `isInSubmenu` logic**

Find line 2323: `const isInSubmenu = ...` — remove this and all references to `isInSubmenu`:
- ContextSurface visibility guard
- ChatInput `hideInput` logic
- ChatInput secondary action label toggle ('Chat' vs 'Agent Studio')
- `onOpenAgentStudio` prop from ChatInput

- [ ] **Step 6: Clean up activeView values**

Update the comment at line 191:
```jsx
const [activeView, setActiveView] = useState('chat'); // 'chat' | 'deckBrowser' | 'overview' | 'freeChat' | 'review' | 'statistik'
```

- [ ] **Step 7: Build and verify**

```bash
cd frontend && npm run build
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(sidebar): wire SidebarShell into App, remove AgentStudio from chat panel"
```

---

## Task 9: Delete old AgentStudio files

**Files:**
- Delete: `frontend/src/components/AgentStudio.jsx`
- Delete: `frontend/src/components/SystemIntelligenceBox.jsx`

- [ ] **Step 1: Verify no remaining imports**

```bash
grep -r "AgentStudio\|SystemIntelligenceBox" frontend/src/
```

Remove any remaining references.

- [ ] **Step 2: Delete files**

```bash
rm frontend/src/components/AgentStudio.jsx
rm frontend/src/components/SystemIntelligenceBox.jsx
```

- [ ] **Step 3: Build to verify nothing breaks**

```bash
cd frontend && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove AgentStudio and SystemIntelligenceBox (replaced by sidebar tabs)"
```

---

## Task 10: Clean up AgentCard (optional)

**Files:**
- Evaluate: `frontend/src/components/AgentCard.jsx`

- [ ] **Step 1: Check if AgentCard is still used**

```bash
grep -r "AgentCard" frontend/src/
```

If only used in the deleted AgentStudio, delete it. If used elsewhere, keep it.

- [ ] **Step 2: Delete if unused**

```bash
rm frontend/src/components/AgentCard.jsx
rm frontend/src/components/AgentWidgetSlot.jsx
```

- [ ] **Step 3: Build and commit**

```bash
cd frontend && npm run build
git add -A
git commit -m "chore: remove unused AgentCard and AgentWidgetSlot components"
```

---

## Task 11: Final build and smoke test

- [ ] **Step 1: Full build**

```bash
cd frontend && npm run build
```

- [ ] **Step 2: Test in browser dev mode**

```bash
cd frontend && npm run dev
```

Open `localhost:3000`. Verify:
- Sidebar opens via TopBar plus button
- Tab bar shows: Sliders icon, divider, then agent icons
- Clicking tabs switches content with smooth pill animation
- Settings content is unchanged (Plan, Theme, Shortcuts, Logout)
- Agent tabs show their respective menus
- Content transition: old hides instantly, new fades in
- No "Agent Studio" or ⌘. shortcut remaining
- Chat panel only shows chat, no agent menus

- [ ] **Step 3: Commit final state**

```bash
git add -A
git commit -m "feat(sidebar): complete tab-bar migration — agents in sidebar, AgentStudio removed"
```
