# Agent Studio Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current category-based Agent Studio with a registry-driven, agent-centric card system featuring a System-Intelligenz box and auto-generated sub-menus.

**Architecture:** Extend Python `AgentDefinition` and `ToolDefinition` with UI fields, push all agents (including disabled) + tool metadata to the frontend via bridge, render agent cards automatically from registry data. Each agent gets a uniform card with custom widget slot, tool chips, and sub-menu link.

**Tech Stack:** Python (dataclasses, PyQt6 bridge), React 18, inline styles following design-system.css tokens.

**Spec:** `docs/superpowers/specs/2026-03-23-agent-studio-redesign.md`

---

## File Structure

### Python (Backend)

| File | Action | Responsibility |
|------|--------|----------------|
| `ai/tools.py` | Modify | Add UI fields to `ToolDefinition`, add `get_tools_for_frontend()` |
| `ai/agents.py` | Modify | Add `widget_type`, `submenu_label`, `submenu_component`, `tools_configurable` to `AgentDefinition`; update registrations; return ALL agents from `get_registry_for_frontend()` |
| `config.py` | Modify | Add `system_quality` default |
| `ui/bridge.py` | Modify | Add `saveSystemQuality()` and `getToolRegistry()` slots |
| `ui/widget.py` | Modify | Handle new bridge messages in `_handle_js_message()` |

### Frontend (React)

| File | Action | Responsibility |
|------|--------|----------------|
| `shared/config/agentRegistry.ts` | Modify | Extend `SubagentConfig` with new fields, add tool registry |
| `shared/config/agentRegistry.js` | Delete | Replaced by unified `.ts` |
| `frontend/src/components/AgentStudio.jsx` | Rewrite | Render `SystemIntelligenceBox` + `AgentCard` list from registry |
| `frontend/src/components/SystemIntelligenceBox.jsx` | Create | Golden top-level box with Standard/Deep PRO toggle |
| `frontend/src/components/AgentCard.jsx` | Create | Single agent card: header, widget slot, tool chips, sub-menu link |
| `frontend/src/components/AgentWidgetSlot.jsx` | Create | Switches on `widgetType`, renders mini-widgets |
| `frontend/src/components/StandardSubMenu.jsx` | Create | Auto-generated sub-menu with tool toggles |
| `frontend/src/components/PlusiMenu.jsx` | Modify | Add `agent` prop to signature |
| `frontend/src/components/ResearchMenu.jsx` | Modify | Add `agent` prop to signature |
| `frontend/src/App.jsx` | Modify | Add `subMenu:*` routing, update PlusiMenu/ResearchMenu props |

### Tests

| File | Action |
|------|--------|
| `tests/test_agents.py` | Create — test new AgentDefinition fields, get_registry_for_frontend returns all agents |
| `tests/test_tools.py` | Create — test ToolDefinition UI fields, get_tools_for_frontend |

---

## Tool → Agent Mapping

Current LEARNING_TOOLS + CONTENT_TOOLS are reassigned to the Tutor agent:

| Current UI Label | Config Key | Python Tool Name | New Agent |
|-----------------|------------|-----------------|-----------|
| Kartensuche | `cards` | `search_deck`, `show_card` | Tutor |
| Statistiken | `stats` | `get_learning_stats` | Tutor |
| Zusammenfassen | `compact` | `compact` | Tutor |
| Bilder | `images` | `show_card_media`, `search_image` | Tutor |
| Diagramme | `diagrams` | `create_mermaid_diagram` | Tutor |
| Moleküle | `molecules` | *(placeholder)* | Tutor |
| Perplexity | `research` | `search_web` / `search_perplexity` | Research |
| PubMed | — | `search_pubmed` | Research |
| Wikipedia | — | `search_wikipedia` | Research |
| Theme ändern | — | `change_theme` | Help |
| Einstellung | — | `change_setting` | Help |
| Navigieren | — | `navigate_to` | Help |
| Erklären | — | `explain_feature` | Help |
| Tagebuch | — | `diary_write` | Plusi |
| Reflektieren | — | `reflect` | Plusi |
| Stimmung | — | `mood_update` | Plusi |

---

## Task 1: Extend Python ToolDefinition with UI Fields

**Files:**
- Modify: `ai/tools.py` — add UI fields to `ToolDefinition` dataclass
- Create: `tests/test_tools_ui.py`

- [ ] **Step 1: Write test for new UI fields**

```python
# tests/test_tools_ui.py
import sys, types
# Mock aqt before any addon imports
aqt_mock = types.ModuleType('aqt')
aqt_mock.mw = None
sys.modules['aqt'] = aqt_mock

def test_tool_definition_has_ui_fields():
    from ai.tools import ToolDefinition
    t = ToolDefinition(
        name='test_tool',
        description='Test',
        schema={'name': 'test_tool', 'description': 'test'},
        execute_fn=lambda **kw: {},
        label='Test Tool',
        ui_description='A test tool for testing',
        category='learning',
        default_enabled=True,
        configurable=False,
    )
    assert t.label == 'Test Tool'
    assert t.ui_description == 'A test tool for testing'
    assert t.category == 'learning'
    assert t.configurable is False

def test_tool_definition_ui_defaults():
    from ai.tools import ToolDefinition
    t = ToolDefinition(
        name='minimal',
        description='Min',
        schema={'name': 'minimal', 'description': 'min'},
        execute_fn=lambda **kw: {},
    )
    assert t.label == ''
    assert t.ui_description == ''
    assert t.category == ''
    assert t.default_enabled is True
    assert t.configurable is True
```

- [ ] **Step 2: Run test — expect FAIL** (fields don't exist yet)

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python -m pytest tests/test_tools_ui.py -v`

- [ ] **Step 3: Add UI fields to ToolDefinition**

In `ai/tools.py`, add to `ToolDefinition` dataclass:

```python
    # UI fields for Agent Studio
    label: str = ''                # Display name (auto-generated from name if empty)
    ui_description: str = ''       # One-line description for Agent Studio
    category: str = ''             # 'learning', 'content', 'navigation'
    default_enabled: bool = True
    configurable: bool = True      # Can user toggle this in sub-menu?
```

- [ ] **Step 4: Add `get_tools_for_frontend()` to ToolRegistry**

```python
def get_tools_for_frontend(self, tool_names: list, config: dict) -> list:
    """Return UI-relevant tool data for given tool names."""
    ai_tools = config.get('ai_tools', {})
    result = []
    for name in tool_names:
        t = self._tools.get(name)
        if not t:
            # Tool not in registry — create placeholder entry
            result.append({
                'name': name,
                'label': name.replace('_', ' ').title(),
                'description': '',
                'category': '',
                'configurable': False,
                'configKey': '',
                'enabled': True,
            })
            continue
        enabled = ai_tools.get(t.config_key, t.default_enabled) if t.config_key else t.default_enabled
        result.append({
            'name': t.name,
            'label': t.label or t.name.replace('_', ' ').title(),
            'description': t.ui_description,
            'category': t.category,
            'configurable': t.configurable,
            'configKey': t.config_key or '',
            'enabled': enabled,
        })
    return result
```

- [ ] **Step 5: Add UI metadata to existing tool registrations**

Update each `register_tool()` call in `ai/tools.py` to include UI fields. Example for `search_deck`:

```python
label='Kartensuche',
ui_description='Karten aus dem Deck suchen',
category='learning',
configurable=True,
```

Full mapping:
- `search_deck`: label='Kartensuche', ui_description='Karten aus dem Deck suchen', category='learning'
- `show_card`: label='Karte anzeigen', ui_description='Einzelne Karte im Chat anzeigen', category='learning'
- `show_card_media`: label='Bilder', ui_description='Bilder aus Karten und Internet', category='content'
- `search_image`: label='Bildsuche', ui_description='Bilder im Internet suchen', category='content'
- `create_mermaid_diagram`: label='Diagramme', ui_description='Mermaid-Diagramme erstellen', category='content'
- `get_learning_stats`: label='Statistiken', ui_description='Streak, Heatmap, Deck-Überblick', category='learning'
- `compact`: label='Zusammenfassen', ui_description='Chat-Erkenntnisse extrahieren', category='learning'
- `search_web`: label='Websuche', ui_description='Internet nach Quellen durchsuchen', category='research'
- `spawn_plusi`: label='Plusi rufen', ui_description='Plusi-Begleiter aktivieren', category='meta', configurable=False

- [ ] **Step 6: Run tests — expect PASS**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python -m pytest tests/test_tools_ui.py -v`

- [ ] **Step 7: Commit**

```bash
git add ai/tools.py tests/test_tools_ui.py
git commit -m "feat(tools): add UI fields to ToolDefinition for Agent Studio"
```

---

## Task 2: Extend AgentDefinition + Return All Agents

**Files:**
- Modify: `ai/agents.py` — add new fields, update registrations, fix `get_registry_for_frontend()`
- Modify: `config.py` — add `system_quality` default
- Create: `tests/test_agents_ui.py`

- [ ] **Step 1: Write test for new fields + all-agents return**

```python
# tests/test_agents_ui.py
import sys, types
aqt_mock = types.ModuleType('aqt')
aqt_mock.mw = None
sys.modules['aqt'] = aqt_mock

def test_agent_definition_has_ui_fields():
    from ai.agents import AgentDefinition
    a = AgentDefinition(
        name='test', label='Test', description='test agent',
        widget_type='embeddings',
        submenu_label='Test konfigurieren',
        submenu_component='TestMenu',
        tools_configurable=False,
    )
    assert a.widget_type == 'embeddings'
    assert a.submenu_label == 'Test konfigurieren'
    assert a.submenu_component == 'TestMenu'
    assert a.tools_configurable is False

def test_agent_definition_ui_defaults():
    from ai.agents import AgentDefinition
    a = AgentDefinition(name='min', label='Min', description='minimal')
    assert a.widget_type == ''
    assert a.submenu_label == ''
    assert a.submenu_component == ''
    assert a.tools_configurable is True

def test_get_registry_returns_all_agents():
    from ai.agents import get_registry_for_frontend
    # With empty config — disabled agents should still appear
    config = {}
    result = get_registry_for_frontend(config)
    names = [a['name'] for a in result]
    # Should contain all registered agents, not just enabled ones
    assert 'tutor' in names  # always enabled (is_default)
    # Others should appear with enabled=False when their config key is missing
    for agent in result:
        if agent['name'] != 'tutor':
            # Disabled agents should have enabled field
            assert 'enabled' in agent
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Add new fields to AgentDefinition**

In `ai/agents.py`, add to the dataclass:

```python
    # Agent Studio UI
    widget_type: str = ''           # 'embeddings', 'budget', '' (empty = no widget)
    submenu_label: str = ''         # 'Tutor konfigurieren' (auto-generated if empty)
    submenu_component: str = ''     # 'PlusiMenu', 'ResearchMenu', '' (empty = standard)
    tools_configurable: bool = True # Whether tools can be toggled in sub-menu
```

- [ ] **Step 4: Update `get_registry_for_frontend()` to return ALL agents**

Replace the current function body:

```python
def get_registry_for_frontend(config: dict) -> List[dict]:
    """Return ALL registered agents as dicts for JSON serialization to frontend."""
    result = []
    for a in AGENT_REGISTRY.values():
        is_enabled = a.is_default or config.get(a.enabled_key, False)
        submenu_label = a.submenu_label or f'{a.label} konfigurieren'
        result.append({
            'name': a.name,
            'label': a.label,
            'description': a.description,
            'color': a.color,
            'enabled': is_enabled,
            'isDefault': a.is_default,
            'pipelineLabel': a.pipeline_label,
            'iconType': a.icon_type,
            'iconSvg': a.icon_svg,
            'badgeLogo': a.badge_logo,
            'loadingHintTemplate': a.loading_hint_template,
            'tools': a.tools,
            'canHandoffTo': a.can_handoff_to,
            # New fields
            'widgetType': a.widget_type,
            'submenuLabel': submenu_label,
            'submenuComponent': a.submenu_component,
            'toolsConfigurable': a.tools_configurable,
        })
    return result
```

- [ ] **Step 5: Update agent registrations with new UI fields**

```python
# Tutor
register_agent(AgentDefinition(
    ...existing fields...
    widget_type='embeddings',
    submenu_label='Tutor konfigurieren',
    submenu_component='',  # uses StandardSubMenu
    tools_configurable=True,
    # Also add search_image to tools list (currently missing):
    # tools=[..., 'search_image'],
))

# Research
register_agent(AgentDefinition(
    ...existing fields...
    widget_type='',
    submenu_label='Quellen konfigurieren',
    submenu_component='researchMenu',
    tools_configurable=True,
))

# Help
register_agent(AgentDefinition(
    ...existing fields...
    widget_type='',
    submenu_label='Help konfigurieren',
    submenu_component='',  # uses StandardSubMenu
    tools_configurable=True,
))

# Plusi
register_agent(AgentDefinition(
    ...existing fields...
    widget_type='budget',
    submenu_label='Persönlichkeit & Tagebuch',
    submenu_component='plusiMenu',
    tools_configurable=False,
))
```

- [ ] **Step 6: Add `system_quality` default to config.py**

In `config.py`, add to the defaults dict:

```python
'system_quality': 'standard',  # 'standard' | 'deep'
```

- [ ] **Step 7: Run tests — expect PASS**

- [ ] **Step 8: Commit**

```bash
git add ai/agents.py config.py tests/test_agents_ui.py
git commit -m "feat(agents): add Agent Studio UI fields and return all agents to frontend"
```

---

## Task 3: Add Bridge Methods

**Files:**
- Modify: `ui/bridge.py` — add `saveSystemQuality()` and `getToolRegistry()` slots
- Modify: `ui/widget.py` — handle new messages in `_handle_js_message()`

- [ ] **Step 1: Add `saveSystemQuality` slot to bridge.py**

```python
@pyqtSlot(str, result=str)
def saveSystemQuality(self, quality):
    """Save system quality mode (standard/deep)."""
    try:
        from ..config import get_config, save_config
        config = get_config()
        if quality in ('standard', 'deep'):
            config['system_quality'] = quality
            save_config(config)
            return json.dumps({"success": True})
        return json.dumps({"error": "Invalid quality value"})
    except Exception as e:
        logger.exception("saveSystemQuality error: %s", e)
        return json.dumps({"error": str(e)})
```

- [ ] **Step 2: Add `getToolRegistry` message handler in widget.py**

In `_handle_js_message()`, add a new case:

```python
elif msg_type == 'getToolRegistry':
    try:
        try:
            from ..ai.tools import registry as tool_registry
        except ImportError:
            from ai.tools import registry as tool_registry
        config = get_config()
        # Gather all tool names across all agents
        all_tools = set()
        for agent in AGENT_REGISTRY.values():
            all_tools.update(agent.tools)
        tools_data = tool_registry.get_tools_for_frontend(list(all_tools), config)
        payload = json.dumps(tools_data)
        self.web_view.page().runJavaScript(
            f"window.ankiReceive({{type:'ankiToolRegistryLoaded', data:{payload}}});"
        )
    except Exception as e:
        logger.exception("getToolRegistry error: %s", e)
```

- [ ] **Step 3: Add `saveSystemQuality` message handler in widget.py**

```python
elif msg_type == 'saveSystemQuality':
    quality = data.get('quality', 'standard') if isinstance(data, dict) else data
    self.bridge.saveSystemQuality(quality)
```

- [ ] **Step 4: Commit**

```bash
git add ui/bridge.py ui/widget.py
git commit -m "feat(bridge): add saveSystemQuality and getToolRegistry bridge methods"
```

---

## Task 4: Unify Frontend Registry

**Files:**
- Modify: `shared/config/subagentRegistry.ts` — extend interface, add tool registry
- Delete: `shared/config/agentRegistry.js`
- Modify: `frontend/src/components/AgentStudio.jsx` — update import

- [ ] **Step 1: Extend SubagentConfig in subagentRegistry.ts**

Add new fields to the interface:

```typescript
export interface SubagentConfig {
    name: string;
    label: string;
    color: string;
    enabled: boolean;
    pipelineLabel: string;
    isDefault?: boolean;
    iconType?: 'svg' | 'emote';
    iconSvg?: string;
    description?: string;
    tools?: string[];
    loadingHintTemplate?: string;
    canHandoffTo?: string[];
    // NEW: Agent Studio UI fields
    widgetType?: string;
    submenuLabel?: string;
    submenuComponent?: string;
    toolsConfigurable?: boolean;
}
```

- [ ] **Step 2: Add tool registry to subagentRegistry.ts**

```typescript
export interface ToolConfig {
    name: string;
    label: string;
    description: string;
    category: string;
    configurable: boolean;
    configKey: string;
    enabled: boolean;
}

let toolRegistry: Map<string, ToolConfig> = new Map();

export function getToolRegistry(): Map<string, ToolConfig> {
    return toolRegistry;
}

export function setToolRegistry(tools: ToolConfig[]): void {
    toolRegistry = new Map(tools.map(t => [t.name, t]));
}
```

- [ ] **Step 3: Merge missing functions from agentRegistry.js into subagentRegistry.ts**

Before deleting `agentRegistry.js`, merge any functions it has that `subagentRegistry.ts` lacks:
- `getDefaultAgent()`, `getNonDefaultAgents()` — add to `subagentRegistry.ts`
- Label-matching in `getDirectCallPattern()` — update the existing function in `subagentRegistry.ts` to also match labels (not just names)
- `agentRegistryUpdated` custom event — add `window.dispatchEvent(new Event('agentRegistryUpdated'))` to `setRegistry()` in `subagentRegistry.ts`

- [ ] **Step 4: Delete agentRegistry.js**

```bash
rm shared/config/agentRegistry.js
```

- [ ] **Step 5: Update AgentStudio.jsx import**

Change:
```javascript
import { getRegistry } from '@shared/config/agentRegistry';
```
To:
```javascript
import { getRegistry, getToolRegistry } from '@shared/config/subagentRegistry';
```

Note: `@shared` alias resolves to `shared/` — verify in `vite.config.js` or `tsconfig.json`.

- [ ] **Step 5: Commit**

```bash
git add shared/config/subagentRegistry.ts frontend/src/components/AgentStudio.jsx
git rm shared/config/agentRegistry.js
git commit -m "refactor: unify frontend agent registries into single subagentRegistry.ts"
```

---

## Task 5: Create SystemIntelligenceBox Component

**Files:**
- Create: `frontend/src/components/SystemIntelligenceBox.jsx`

- [ ] **Step 1: Create the component**

```jsx
// frontend/src/components/SystemIntelligenceBox.jsx
import React, { useState, useEffect } from 'react';

export default function SystemIntelligenceBox({ bridge, initialQuality = 'standard' }) {
    const [quality, setQuality] = useState(initialQuality);

    const handleChange = (newQuality) => {
        setQuality(newQuality);
        window.ankiBridge?.addMessage('saveSystemQuality', { quality: newQuality });
    };

    // ... render with styles from spec section 3
    // Uses inline styles with var(--ds-*) tokens
    // Golden gradient border via ::before pseudo (use wrapper div approach)
    // Concentric circles SVG icon with pulse animation
    // Segmented control: Standard / Deep PRO
}
```

Full implementation should match the mockup from `agent-studio-flat.html` — the System-Intelligenz box with:
- Golden gradient border (1px, via CSS mask technique or solid border fallback)
- Node icon: 30px circle, concentric circles SVG, subtle outer ring pulse
- Title: "System-Intelligenz" / subtitle: "Routing, Analyse & Modellwahl"
- Segmented control: Standard (schnell & sparsam) / Deep PRO (max. Qualität)
- All colors via `var(--ds-*)` tokens — gold uses `var(--ds-yellow)`

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/SystemIntelligenceBox.jsx
git commit -m "feat(ui): create SystemIntelligenceBox component"
```

---

## Task 6: Create AgentCard + AgentWidgetSlot Components

**Files:**
- Create: `frontend/src/components/AgentCard.jsx`
- Create: `frontend/src/components/AgentWidgetSlot.jsx`

- [ ] **Step 1: Create AgentWidgetSlot**

Switches on `widgetType` prop:
- `'embeddings'` → renders compact embeddings bar (label + progress bar + badge)
- `'budget'` → renders current Plusi token budget display
- `''` or undefined → renders nothing

```jsx
// frontend/src/components/AgentWidgetSlot.jsx
import React, { useState, useEffect } from 'react';

export default function AgentWidgetSlot({ widgetType, bridge, agentColor }) {
    if (!widgetType) return null;

    switch (widgetType) {
        case 'embeddings': return <EmbeddingsWidget bridge={bridge} />;
        case 'budget': return <BudgetWidget bridge={bridge} color={agentColor} />;
        default: return null;
    }
}

function EmbeddingsWidget({ bridge }) {
    const [embedding, setEmbedding] = useState({ embeddedCards: 0, totalCards: 0, isRunning: false });
    // Poll embedding status via bridge (same logic as current AgentStudio)
    // Render: label "Embeddings" + thin progress bar + "Fertig" badge
}

function BudgetWidget({ bridge, color }) {
    // Read current budget from config, display as compact indicator
    // e.g., "Budget: Sparsam" or a mini segmented display
}
```

- [ ] **Step 2: Create AgentCard**

Renders one agent card from registry data. Structure:
1. Header: icon + name + optional badge + toggle
2. AgentWidgetSlot (if enabled + has widget_type)
3. Tool chips (if enabled)
4. Separator + sub-menu link (if enabled)

When disabled: only header, opacity 0.4.

```jsx
// frontend/src/components/AgentCard.jsx
import React from 'react';
import AgentWidgetSlot from './AgentWidgetSlot';
import { getToolRegistry } from '@shared/config/subagentRegistry';

function AgentIcon({ agent, size = 18 }) {
    // Same logic as current AgentStudio's AgentIcon
    // Plusi: inline SVG mascot, others: parse iconSvg
}

export default function AgentCard({
    agent,
    enabled,
    onToggle,
    onOpenSubmenu,
    bridge,
}) {
    const toolRegistry = getToolRegistry();
    const tools = (agent.tools || []).map(name => toolRegistry.get(name)).filter(Boolean);

    return (
        <div style={{
            background: 'var(--ds-bg-canvas)',
            border: '1px solid var(--ds-border-subtle)',
            borderRadius: 10,
            overflow: 'hidden',
            opacity: enabled ? 1 : 0.4,
            transition: 'opacity 0.2s',
        }}>
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px' }}>
                <AgentIcon agent={agent} size={18} />
                <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--ds-text-primary)' }}>
                    {agent.label}
                    {agent.isDefault && <span style={badgeStyle}>Standard</span>}
                </span>
                <Toggle on={enabled} locked={agent.isDefault} onChange={onToggle} />
            </div>

            {/* Content — only when enabled */}
            {enabled && (
                <>
                    {/* Custom widget slot */}
                    <div style={{ padding: '0 12px 8px' }}>
                        <AgentWidgetSlot
                            widgetType={agent.widgetType}
                            bridge={bridge}
                            agentColor={agent.color}
                        />
                        {/* Tool chips */}
                        {tools.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: agent.widgetType ? 6 : 0 }}>
                                {tools.map(tool => (
                                    <span key={tool.name} style={{
                                        fontSize: 9,
                                        fontFamily: 'var(--ds-font-mono)',
                                        padding: '2px 7px',
                                        borderRadius: 5,
                                        background: tool.enabled
                                            ? 'var(--ds-bg-overlay)' : 'var(--ds-bg-canvas)',
                                        color: tool.enabled
                                            ? 'var(--ds-text-secondary)' : 'var(--ds-text-muted)',
                                    }}>
                                        {tool.label}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Sub-menu link */}
                    <div
                        onClick={onOpenSubmenu}
                        style={{
                            borderTop: '1px solid var(--ds-border-subtle)',
                            padding: '7px 12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: 'pointer',
                        }}
                    >
                        <span style={{ fontSize: 11, fontWeight: 500, color: `${agent.color}80` }}>
                            {agent.submenuLabel}
                        </span>
                        <svg width={12} height={12} viewBox="0 0 24 24" fill="none"
                            stroke="var(--ds-text-muted)" strokeWidth={2} strokeLinecap="round">
                            <polyline points="9 18 15 12 9 6" />
                        </svg>
                    </div>
                </>
            )}
        </div>
    );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/AgentCard.jsx frontend/src/components/AgentWidgetSlot.jsx
git commit -m "feat(ui): create AgentCard and AgentWidgetSlot components"
```

---

## Task 7: Create StandardSubMenu Component

**Files:**
- Create: `frontend/src/components/StandardSubMenu.jsx`

- [ ] **Step 1: Create StandardSubMenu**

Auto-generated sub-menu for agents without a custom component. Shows:
- Back button → returns to Agent Studio
- Agent header (icon, name, description)
- Tool list with toggles (if `toolsConfigurable`)
- Each tool: toggle + name + description

```jsx
// frontend/src/components/StandardSubMenu.jsx
import React, { useState, useEffect } from 'react';
import { getToolRegistry } from '@shared/config/subagentRegistry';

export default function StandardSubMenu({ agent, bridge, onNavigateBack }) {
    const [toolStates, setToolStates] = useState({});
    const toolRegistry = getToolRegistry();
    const tools = (agent.tools || []).map(name => toolRegistry.get(name)).filter(Boolean);

    // Load tool states from config on mount
    useEffect(() => {
        if (!bridge) return;
        const onToolsLoaded = (e) => {
            const data = e.detail?.data || e.detail;
            if (data) setToolStates(data);
        };
        window.addEventListener('ankiAiToolsLoaded', onToolsLoaded);
        bridge.getAITools?.();
        return () => window.removeEventListener('ankiAiToolsLoaded', onToolsLoaded);
    }, [bridge]);

    const handleToggle = (configKey) => {
        const updated = { ...toolStates, [configKey]: !toolStates[configKey] };
        setToolStates(updated);
        if (bridge?.saveAITools) {
            bridge.saveAITools(JSON.stringify(updated));
        }
    };

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 20px 140px', overflowY: 'auto' }}>
            {/* Back + Title */}
            {/* Agent info header */}
            {/* Tool list with toggles */}
            {tools.map(tool => (
                <ToolRow
                    key={tool.name}
                    tool={tool}
                    enabled={!!toolStates[tool.configKey]}
                    configurable={agent.toolsConfigurable && tool.configurable}
                    onToggle={() => handleToggle(tool.configKey)}
                    agentColor={agent.color}
                />
            ))}
        </div>
    );
}
```

Note: The `tool.configKey` needs to come from the tool registry data. The `get_tools_for_frontend()` method should include the config key in its output. Update Task 1's implementation to also include `config_key` in the frontend data.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/StandardSubMenu.jsx
git commit -m "feat(ui): create StandardSubMenu with auto-generated tool toggles"
```

---

## Task 8: Rewrite AgentStudio.jsx

**Files:**
- Modify: `frontend/src/components/AgentStudio.jsx` — complete rewrite

- [ ] **Step 1: Rewrite AgentStudio**

Delete ALL existing content. The new AgentStudio is simple — it renders:
1. `SystemIntelligenceBox`
2. "AGENTEN" section label
3. List of `AgentCard` components, one per registered agent

```jsx
// frontend/src/components/AgentStudio.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { getRegistry, setToolRegistry } from '@shared/config/subagentRegistry';
import SystemIntelligenceBox from './SystemIntelligenceBox';
import AgentCard from './AgentCard';

export default function AgentStudio({ bridge, onNavigateToSubmenu }) {
    const [agents, setAgents] = useState([]);
    const [agentStates, setAgentStates] = useState({});

    // Read agents from registry
    useEffect(() => {
        const refresh = () => {
            const reg = getRegistry();
            const list = [...reg.values()];
            setAgents(list);
            const states = {};
            list.forEach(a => { states[a.name] = a.enabled; });
            setAgentStates(states);
        };
        refresh();
        window.addEventListener('agentRegistryUpdated', refresh);
        return () => window.removeEventListener('agentRegistryUpdated', refresh);
    }, []);

    // Load tool registry
    useEffect(() => {
        if (!bridge) return;
        const onToolsLoaded = (e) => {
            const data = e.detail?.data || e.detail;
            if (data) setToolRegistry(data);
        };
        window.addEventListener('ankiToolRegistryLoaded', onToolsLoaded);
        window.ankiBridge?.addMessage('getToolRegistry', null);
        return () => window.removeEventListener('ankiToolRegistryLoaded', onToolsLoaded);
    }, [bridge]);

    // Load config for agent states + system quality
    useEffect(() => {
        if (!bridge) return;
        const onConfig = (e) => {
            const data = e.detail?.data || e.detail;
            if (data) {
                setAgentStates(prev => ({
                    ...prev,
                    plusi: data.mascot_enabled ?? prev.plusi,
                    research: data.research_enabled ?? prev.research,
                    help: data.help_enabled ?? prev.help,
                }));
            }
        };
        window.addEventListener('ankiConfigLoaded', onConfig);
        bridge.getCurrentConfig?.();
        return () => window.removeEventListener('ankiConfigLoaded', onConfig);
    }, [bridge]);

    const handleToggleAgent = useCallback((agentName) => {
        setAgentStates(prev => {
            const next = !prev[agentName];
            if (agentName === 'plusi') bridge?.saveMascotEnabled?.(next);
            else window.ankiBridge?.addMessage('saveSubagentEnabled', { name: agentName, enabled: next });
            return { ...prev, [agentName]: next };
        });
    }, [bridge]);

    const handleOpenSubmenu = useCallback((agent) => {
        const view = agent.submenuComponent || `subMenu:${agent.name}`;
        onNavigateToSubmenu(view);
    }, [onNavigateToSubmenu]);

    // Sort: default agent first, then by name
    const sorted = [...agents].sort((a, b) => {
        if (a.isDefault) return -1;
        if (b.isDefault) return 1;
        return a.label.localeCompare(b.label);
    });

    return (
        <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            padding: '0 12px', overflow: 'hidden',
        }}>
            <SystemIntelligenceBox bridge={bridge} />

            <div style={{
                fontSize: 9, fontWeight: 600, letterSpacing: '0.8px',
                color: 'var(--ds-text-muted)', textTransform: 'uppercase',
                padding: '0 4px', marginBottom: 6,
            }}>
                Agenten
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                {sorted.map(agent => (
                    <AgentCard
                        key={agent.name}
                        agent={agent}
                        enabled={agent.isDefault || !!agentStates[agent.name]}
                        onToggle={() => handleToggleAgent(agent.name)}
                        onOpenSubmenu={() => handleOpenSubmenu(agent)}
                        bridge={bridge}
                    />
                ))}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/AgentStudio.jsx
git commit -m "feat(ui): rewrite AgentStudio with registry-driven agent cards"
```

---

## Task 9: Update App.jsx Routing + Sub-Menu Props

**Files:**
- Modify: `frontend/src/App.jsx` — add `subMenu:*` routing, pass `agent` prop to custom sub-menus
- Modify: `frontend/src/components/PlusiMenu.jsx` — accept `agent` prop
- Modify: `frontend/src/components/ResearchMenu.jsx` — accept `agent` prop

- [ ] **Step 1: Update App.jsx view switching**

In the `activeView` conditional rendering section (~line 2118), update:

```jsx
// Replace existing agentStudio/plusiMenu/researchMenu conditions:

{activeView === 'agentStudio' ? (
    <AgentStudio
        bridge={bridge}
        onNavigateToSubmenu={(view) => setActiveView(view)}
    />
) : activeView === 'plusiMenu' ? (
    <PlusiMenu
        agent={[...getRegistry().values()].find(a => a.name === 'plusi')}
        bridge={bridge}
        onNavigateBack={() => setActiveView('agentStudio')}
    />
) : activeView === 'researchMenu' ? (
    <ResearchMenu
        agent={[...getRegistry().values()].find(a => a.name === 'research')}
        bridge={bridge}
        onNavigateBack={() => setActiveView('agentStudio')}
    />
) : activeView.startsWith('subMenu:') ? (
    <StandardSubMenu
        agent={[...getRegistry().values()].find(a => a.name === activeView.split(':')[1])}
        bridge={bridge}
        onNavigateBack={() => setActiveView('agentStudio')}
    />
) : (
    // ... existing chat view
)}
```

Add import for `StandardSubMenu`:
```javascript
import StandardSubMenu from './components/StandardSubMenu';
```

Remove old imports:
- Remove `import { getRegistry } from '@shared/config/agentRegistry'` if still referenced (now comes from subagentRegistry)

- [ ] **Step 2: Update AgentStudio props in App.jsx**

Remove old `onNavigateToPlusi` and `onNavigateToResearch` props — replaced by single `onNavigateToSubmenu`.

- [ ] **Step 3: Update PlusiMenu signature**

In `frontend/src/components/PlusiMenu.jsx`, add `agent` to destructured props:

```jsx
export default function PlusiMenu({ agent, bridge, onNavigateBack }) {
    // agent prop is available but not required for PlusiMenu's current functionality
    // ... rest unchanged
```

- [ ] **Step 4: Update ResearchMenu signature**

Same pattern:

```jsx
export default function ResearchMenu({ agent, bridge, onNavigateBack }) {
    // ... rest unchanged
```

- [ ] **Step 5: Update ChatInput actionbar in App.jsx**

The secondary button label logic (~line 2506) needs to handle `subMenu:*` views:

```jsx
label: activeView.startsWith('subMenu:') || activeView === 'plusiMenu' || activeView === 'researchMenu'
    ? 'Chat'
    : (activeView === 'agentStudio' ? 'Chat' : 'Agent Studio'),
```

And the primary button for sub-menu views should navigate back:

```jsx
// For any sub-menu view (custom or standard), primary = "Zurück"
const isInSubmenu = activeView === 'plusiMenu' || activeView === 'researchMenu' || activeView.startsWith('subMenu:');

actionPrimary: {
    label: isInSubmenu ? 'Zurück' : ...,
    onClick: isInSubmenu ? () => setActiveView('agentStudio') : ...,
}
```

- [ ] **Step 6: Update hideInput logic**

The textarea should be hidden in ALL sub-menu views, not just plusiMenu:

```jsx
hideInput={isInSubmenu || activeView === 'agentStudio'}
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/PlusiMenu.jsx frontend/src/components/ResearchMenu.jsx
git commit -m "feat(routing): add dynamic sub-menu routing and unified sub-menu props"
```

---

## Task 10: Build Frontend + Smoke Test

**Files:**
- No new files — build and verify

- [ ] **Step 1: Build frontend**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend"
npm run build
```

Expected: Build succeeds, outputs to `web/`.

- [ ] **Step 2: Fix any build errors**

Common issues:
- Missing imports (StandardSubMenu, SystemIntelligenceBox)
- TypeScript type mismatches in subagentRegistry.ts
- Deleted agentRegistry.js still referenced somewhere

- [ ] **Step 3: Run Python tests**

```bash
cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main"
python -m pytest tests/ -v
```

- [ ] **Step 4: Commit build output**

```bash
git add web/
git commit -m "build: rebuild frontend with new Agent Studio"
```

- [ ] **Step 5: Manual smoke test in Anki**

Restart Anki and verify:
- Agent Studio opens with System-Intelligenz box + 4 agent cards
- Toggles work (disable Plusi → card collapses to header only)
- Tool chips display correctly per agent
- Sub-menu links navigate correctly
- "Zurück" returns to Agent Studio
- Standard/Deep PRO toggle persists
