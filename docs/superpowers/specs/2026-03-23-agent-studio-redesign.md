# Agent Studio Redesign — Design Spec

**Date**: 2026-03-23
**Status**: Approved
**Scope**: Agent Studio main view, agent card system, tool registry separation, sub-menu architecture

---

## 1. Overview

The Agent Studio is rebuilt around an **agent-centric, registry-driven card system**. Every agent registered via `register_agent()` automatically gets a card in the Agent Studio. The layout is flat (no scrolling, no accordion) — all active agents are always visible.

### Design Goals
- **Agent-centric**: Agents are the primary structure, not tool categories
- **Registry-driven**: New agents auto-generate cards — no manual UI work required
- **Hierarchy visible**: System-Intelligenz box visually sits above the agents, communicating the Router → Agents → Tools architecture
- **Clean & professional**: No gimmicks, no blinking — elegance through structure and spacing
- **No scrolling** (for 4 agents): Everything fits in the sidebar viewport (~720px). If more agents are registered, minimal scroll is acceptable as fallback — but the system is optimized for 4-5 visible agents

---

## 2. Page Structure

```
┌─────────────────────────────────┐
│         Agent Studio            │  Title (centered, 15px semibold)
├─────────────────────────────────┤
│  ◎ System-Intelligenz           │  Golden gradient border, pulse node
│  Routing, Analyse & Modellwahl  │
│  [Standard]  [Deep PRO]        │  Segmented control
├─────────────────────────────────┤
│  AGENTEN                        │  Section label (uppercase, muted)
│                                 │
│  ┌─ Agent Card (active) ───────┐│
│  │ Icon  Name           [ON]  ││  Header
│  │ [Custom Widget Slot]        ││  Optional, agent-specific
│  │ [Tool][Tool][Tool]          ││  Chips (informational)
│  │─────────────────────────────││  Separator
│  │ Sub-Menü Label         →    ││  Opens sub-menu view
│  └─────────────────────────────┘│
│                                 │
│  ┌─ Agent Card (disabled) ─────┐│
│  │ Icon  Name          [OFF]  ││  Only header, dimmed
│  └─────────────────────────────┘│
│                                 │
├─────────────────────────────────┤
│  Weiter SPACE  │  Chat ↵       │  Action bar
└─────────────────────────────────┘
```

---

## 3. System-Intelligenz Box

The single overriding element at the top. Visually distinct from all agent cards below — communicates that it controls the entire system.

### Visual Treatment
- **Border**: `linear-gradient(160deg, rgba(255,214,10,0.25), rgba(255,214,10,0.03) 60%, rgba(255,214,10,0.15))` applied as a 1px gradient border via mask technique
- **Background**: `rgba(255,214,10,0.015)`
- **Subtle glow**: `radial-gradient` in top-right corner
- **Node icon**: 30px circle with `border: 1.5px solid rgba(255,214,10,0.25)`, concentric-circles SVG inside, outer ring pulses via `@keyframes nodeRing` (4s ease-in-out infinite, very subtle)
- **Border radius**: 12px

### Content
- **Title**: "System-Intelligenz" (13px, semibold)
- **Subtitle**: "Routing, Analyse & Modellwahl" (10px, muted)
- **Segmented Control**: Two options
  - "Standard" — subtitle "Schnell & sparsam" (active state: white bg 8%, white text)
  - "Deep PRO" — subtitle "Max. Qualität", PRO badge (active state: gold bg 12%, gold text)

### Behavior
- Toggles between standard and pro quality mode
- Standard: all agents use fast/cheap models (e.g., Gemini Flash)
- Pro: Router + Tutor use better model, rest stays on Flash
- Persisted in `config.json` as `system_quality: 'standard' | 'deep'` via new `saveSystemQuality()` bridge method (see 6.4)
- Does **not** override manually selected model — it sets the default tier. If user has explicitly chosen a model in settings, that takes precedence

---

## 4. Agent Card System

### 4.1 Uniform Structure

Every agent card follows the same layout. Rendered automatically from the agent registry.

#### When agent is **enabled**:

| Section | Content | Source |
|---------|---------|--------|
| **Header** | Agent icon (20px) + name (12px semibold) + optional badge + toggle | `AgentDefinition.icon_svg`, `.label`, `.is_default`, `.enabled_key` |
| **Custom Widget Slot** | Optional mini-widget, agent-specific | `AgentDefinition.widget_type` (new field) |
| **Tool Chips** | Horizontal flow of compact chips, read-only | `AgentDefinition.tools` → resolved via Tool Registry |
| **Separator** | 1px line `rgba(255,255,255,0.05)` | — |
| **Sub-Menü Link** | Colored label + chevron, opens sub-menu | `AgentDefinition.submenu_label`, `.submenu_component` |

#### When agent is **disabled**:
- Only the header row is visible
- Entire card is dimmed (`opacity: 0.4`)
- No tool chips, no widget, no sub-menu link

### 4.2 Visual Specs

- **Card background**: `rgba(255,255,255,0.025)`
- **Card border**: `1px solid rgba(255,255,255,0.06)`, hover: `rgba(255,255,255,0.1)`
- **Card border-radius**: 10px
- **Card spacing**: 6px gap between cards
- **Header padding**: 9px 12px
- **Body padding**: 0 12px 8px
- **Sub-menu area padding**: 7px 12px

### 4.3 Tool Chips

- **Read-only** — not clickable on the main page
- Whether tools are toggleable is determined per-agent in the sub-menu
- **Active chip**: `background: rgba(255,255,255,0.06)`, `color: rgba(255,255,255,0.5)`
- **Inactive chip**: `background: rgba(255,255,255,0.02)`, `color: rgba(255,255,255,0.14)`
- **Font**: 9px, monospace (SF Mono / ui-monospace)
- **Padding**: 2px 7px, border-radius 5px
- **Layout**: `flex-wrap: wrap`, gap 4px

### 4.4 Custom Widget Slots

Each agent can optionally inject a mini-widget between the header and tool chips.

| Agent | `widget_type` | Widget Content |
|-------|---------------|----------------|
| Tutor | `'embeddings'` | Embeddings progress bar (label + bar + badge) |
| Plusi | `'budget'` | Current token budget display |
| Research | `''` (none) | — |
| Help | `''` (none) | — |

Widget types are rendered by a `<AgentWidgetSlot type={agent.widgetType} />` component that switches on type. New widget types can be added by extending this component.

### 4.5 Sub-Menü Link

- **Label**: Agent-colored at 50% opacity (e.g., `rgba(142,142,147,0.5)` for Tutor)
- **Chevron**: `rgba(255,255,255,0.3)`, hover brightens to 0.5
- **Hover**: Entire area gets `background: rgba(255,255,255,0.025)`
- Clicking navigates to the sub-menu view (`setActiveView(agent.submenuView)`)

---

## 5. Sub-Menü Architecture

### 5.1 Standard Sub-Menü (Auto-Generated)

When an agent has **no custom sub-menu component** (`submenu_component` is empty), the system renders a **Standard Sub-Menü** automatically.

The Standard Sub-Menü shows:
- **Back navigation** to Agent Studio
- **Agent header** (icon, name, description)
- **Tool list**: All tools registered to this agent (resolved via Tool Registry), each with:
  - Toggle (on/off) — only if `tool.configurable` is true
  - Tool name (formatted from snake_case, or `tool.label` if set)
  - Tool description (from `tool.ui_description`)

**Tool state persistence**: Uses the existing `getAITools`/`saveAITools` bridge methods and the `ai_tools` config dictionary. Each tool's `config_key` maps to a key in this dictionary (e.g., `config_key='card_search'` → `ai_tools.card_search: true/false`). This is the same system the current AgentStudio uses — no change needed to the persistence layer.

This means any externally registered agent immediately gets a functional configuration panel.

### 5.2 Custom Sub-Menü (Override)

When `submenu_component` is set (e.g., `'PlusiMenu'`, `'ResearchMenu'`), that React component is rendered instead of the standard sub-menu.

**Custom sub-menu component signature** (unified):

```typescript
interface SubMenuProps {
    agent: AgentConfig;
    bridge: any;
    onNavigateBack: () => void;
}
```

Existing custom sub-menus need minor signature updates:
- **PlusiMenu**: Currently `({ bridge, onNavigateBack })` — add `agent` prop
- **ResearchMenu**: Currently `({ bridge, onNavigateBack })` — add `agent` prop

Existing custom sub-menus:
- **PlusiMenu**: Personality grid, diary stream, budget slider, autonomy settings
- **ResearchMenu**: Source toggles (Perplexity, PubMed, Wikipedia) with descriptions

### 5.3 Resolution Logic

```
if agent.submenu_component:
    render CustomComponent(agent, bridge)
else:
    render StandardSubMenu(agent, bridge, toolRegistry)
```

---

## 6. Architecture Changes

### 6.1 Extend Existing Tool Registry

A tool registry already exists in `ai/tools.py` with `ToolDefinition` (execution-oriented: `schema`, `execute_fn`, `config_key`, `display_type`, `timeout_seconds`) and a `ToolRegistry` class. We **extend** this existing registry with UI-facing fields rather than creating a separate file.

**Extend `ToolDefinition` in `ai/tools.py`:**

```python
@dataclass
class ToolDefinition:
    # ... existing execution fields (schema, execute_fn, etc.) ...

    # NEW: UI-facing fields for Agent Studio
    label: str = ''             # 'Kartensuche' — display name (auto-generated from name if empty)
    ui_description: str = ''    # 'Karten aus dem Deck suchen'
    category: str = ''          # 'learning', 'content', 'navigation'
    default_enabled: bool = True
    configurable: bool = True   # Can user toggle this in sub-menu?
```

**New method on `ToolRegistry`:**

```python
def get_tools_for_frontend(self, tool_names: list[str]) -> list[dict]:
    """Return UI-relevant tool data for the given tool names."""
    return [
        {
            'name': t.name,
            'label': t.label or format_tool_name(t.name),
            'description': t.ui_description,
            'category': t.category,
            'configurable': t.configurable,
            'enabled': config.get(t.config_key, t.default_enabled) if t.config_key else t.default_enabled,
        }
        for name in tool_names
        if (t := self.get(name))
    ]
```

Tools remain bound to agents by name via `AgentDefinition.tools: list[str]`.

**Frontend mirror**: `shared/config/toolRegistry.ts` — populated from Python via new bridge method `getToolRegistry()`.

### 6.2 AgentDefinition Extensions

New fields added to `AgentDefinition` in `ai/agents.py`:

```python
@dataclass
class AgentDefinition:
    # ... existing fields ...

    # NEW: Agent Studio UI
    widget_type: str = ''           # 'embeddings', 'budget', '' (empty = no widget)
    submenu_label: str = ''         # 'Tutor konfigurieren' (auto-generated if empty)
    submenu_component: str = ''     # 'PlusiMenu', 'ResearchMenu', '' (empty = standard)
    tools_configurable: bool = True # Whether tools can be toggled in sub-menu
```

If `submenu_label` is empty, it auto-generates as `f'{agent.label} konfigurieren'`.

### 6.3 Frontend Registry Unification

Currently two parallel registries exist:
- `shared/config/subagentRegistry.ts` — TypeScript, used by `App.jsx`, `useChat.js`, `ChatMessage.jsx`
- `shared/config/agentRegistry.js` — JavaScript, used only by `AgentStudio.jsx`

**Action**: Unify into a single `shared/config/agentRegistry.ts` (TypeScript). Delete `agentRegistry.js`. Update all imports.

Extended `SubagentConfig` interface:

```typescript
interface AgentConfig {
    // ... existing fields (name, label, color, enabled, etc.) ...
    widgetType?: string;
    submenuLabel?: string;
    submenuComponent?: string;
    toolsConfigurable?: boolean;
}
```

### 6.4 Bridge Extension

**`get_registry_for_frontend()`** in `ai/agents.py` is modified:
1. Returns **ALL registered agents** (not just enabled ones) — disabled agents need their dimmed header row with toggle
2. Includes the new fields (`widgetType`, `submenuLabel`, `submenuComponent`, `toolsConfigurable`)

**New bridge method**: `getToolRegistry()` — returns all registered tools as JSON for the frontend.

**New bridge method**: `saveSystemQuality(quality: str)` — persists `system_quality` ('standard' | 'deep') to `config.json`. This is a new `@pyqtSlot(str)` in `ui/bridge.py`.

### 6.5 Existing Code Cleanup

The hardcoded `AGENT_SUBMENU_MAP` in `AgentStudio.jsx` (lines 181-184) is **deleted** — its logic is replaced by `submenu_component` from the registry data.

The existing `LEARNING_TOOLS` and `CONTENT_TOOLS` arrays in `AgentStudio.jsx` are **deleted** — tools now come from the tool registry, bound to agents.

---

## 7. Component Structure

### New Components

| Component | Purpose |
|-----------|---------|
| `AgentCard.jsx` | Single agent card, renders from registry data |
| `AgentWidgetSlot.jsx` | Switches on `widgetType`, renders appropriate mini-widget |
| `StandardSubMenu.jsx` | Auto-generated sub-menu with tool toggles |
| `ToolChips.jsx` | Horizontal chip layout for tool names |
| `SystemIntelligenceBox.jsx` | The golden top-level box with segmented control |

### Modified Components

| Component | Changes |
|-----------|---------|
| `AgentStudio.jsx` | Rewritten — renders `SystemIntelligenceBox` + `AgentCard` list from registry |
| `App.jsx` | Sub-menu routing updated to support dynamic `submenu_component` resolution |

### Unchanged Components

| Component | Reason |
|-----------|--------|
| `PlusiMenu.jsx` | Remains as custom sub-menu for Plusi |
| `ResearchMenu.jsx` | Remains as custom sub-menu for Research |

---

## 8. Navigation

Same two-level navigation as today, but sub-menu resolution becomes dynamic.

**activeView values**:
- Existing: `'chat'`, `'agentStudio'`, `'plusiMenu'`, `'researchMenu'`
- New pattern for standard sub-menus: `'subMenu:<agentName>'` (e.g., `'subMenu:help'`, `'subMenu:tutor'`)
- Custom sub-menus keep their existing values (e.g., `'plusiMenu'`, `'researchMenu'`)

```
Agent Studio (activeView='agentStudio')
  └─ Click sub-menu link
       ├─ Has submenu_component? → setActiveView(agent.submenuComponent)
       │   e.g., 'plusiMenu', 'researchMenu'
       └─ No submenu_component? → setActiveView('subMenu:' + agent.name)
           e.g., 'subMenu:help', 'subMenu:tutor'
```

**App.jsx routing**: Parse `activeView` — if it starts with `'subMenu:'`, extract agent name and render `<StandardSubMenu agent={...} />`. Otherwise match against known custom component names.

Back navigation from any sub-menu returns to Agent Studio.

---

## 9. Design System Tokens

All colors use `var(--ds-*)` tokens. Agent colors are already defined per-agent in the registry and applied dynamically via inline styles (same pattern as current ChatInput).

No new CSS custom properties needed — agent colors come from the registry data.

The System-Intelligenz box uses gold (`#FFD60A` / `var(--ds-yellow)`) which is already in the design system.

---

## 10. Disabled Agent Behavior

When an agent's toggle is OFF:
- Only the header row (icon + name + toggle) is visible
- Card opacity: 0.4
- No custom widget, no tool chips, no sub-menu link
- Card is not hoverable

When toggled back ON:
- Full card renders with smooth transition
- Sub-menu becomes accessible

---

## 11. Data Flow

```
Python: register_agent() + register_tool()
         ↓
Bridge: getAgentRegistry() → JSON with new fields
Bridge: getToolRegistry() → JSON with all tools
         ↓
Frontend: setRegistry(agents), setToolRegistry(tools)
         ↓
AgentStudio: maps over registry → renders AgentCard per agent
         ↓
AgentCard: reads agent.tools → resolves via toolRegistry → renders chips
         ↓
Sub-menu click → resolves submenu_component or falls back to StandardSubMenu
```

---

## 12. Out of Scope

- @-Mention dropdown redesign (separate task)
- Header agent indicator (separate task)
- Agent-switch animations (separate task)
- Light mode testing (must work but not primary focus of this spec)
- Tool configuration fields in StandardSubMenu (basic toggles first, config fields in follow-up)
