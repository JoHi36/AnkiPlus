# Workflow-Based Deep Insights — Design Spec

**Date:** 2026-03-25
**Status:** Draft
**Scope:** Agent menu redesign in Settings Sidebar + Workflow schema for agent registry

## Problem

The current agent menu system (StandardSubMenu, PlusiMenu, ResearchMenu) shows flat tool lists per agent. This doesn't communicate:
- When and why agents activate (triggers)
- What agents can do in different contexts (workflows)
- Where agent output goes (outputs)
- Which capabilities are fixed vs. configurable

Agents are evolving beyond chat — Plusi has an autonomous timer loop, Research will power vocabulary lookups, an Exams agent is planned. The current UI can't represent this.

## Vision

A **universal Workflow system** where every agent's behavior is described as composable Workflows. Each Workflow bundles Triggers + Tools + Outputs. The Deep Insights UI renders this 1:1 from the registry — what you define in code is what the user sees.

## Schema

### Unified Capability Registry

Today only tools have a registry (`ai/tools.py`). Workflows reference triggers and outputs that don't exist in any registry yet. To resolve this, the existing `ToolRegistry` is extended into a **unified capability registry** that covers all three categories:

```python
@dataclass
class CapabilityDefinition:
    name: str                    # 'search_deck', 'timer', 'chat_response'
    label: str                   # Display name
    category: Literal['trigger', 'tool', 'output']
    description: str = ''       # One-liner for UI
    # Tool-specific (ignored for triggers/outputs)
    execute_fn: Optional[Callable] = None
    schema: Optional[dict] = None
    # ... existing ToolDefinition fields for tools ...
```

Triggers and outputs are registered the same way as tools, but with `category='trigger'` / `category='output'` and no `execute_fn`. This gives every `Slot.ref` a guaranteed label and description lookup.

### Slot

A reference to a registered capability with a mode override.

```python
@dataclass
class Slot:
    ref: str                                        # Key in capability registry
    mode: Literal['locked', 'on', 'off'] = 'on'    # locked = mandatory, on/off = user default
```

```typescript
interface Slot {
  ref: string;
  mode: 'locked' | 'on' | 'off';  // default: 'on' (set by Python serialization)
}
```

- `ref` points to the unified capability registry — label, description come from there (no duplication)
- `mode` is the single field controlling both locked-ness and default state
- `locked` = always active, user sees lock icon, no toggle
- `on` = active by default, user can toggle off
- `off` = inactive by default, user can toggle on

### Workflow

A named bundle of capabilities available in a specific context.

```python
@dataclass
class Workflow:
    name: str                                        # 'quiz', 'explain', 'autonomous'
    label: str                                       # 'Quiz & Abfrage'
    description: str                                 # One-liner for UI
    triggers: list[Slot]
    tools: list[Slot]
    outputs: list[Slot]
    mode: Literal['locked', 'on', 'off'] = 'on'    # Same pattern as Slot
    status: Literal['active', 'soon'] = 'active'
    context_prompt: str = ''                         # Additional prompt when active
```

```typescript
interface Workflow {
  name: string;
  label: string;
  description: string;
  triggers: Slot[];
  tools: Slot[];
  outputs: Slot[];
  mode: 'locked' | 'on' | 'off';
  status: 'active' | 'soon';
  contextPrompt?: string;
}
```

- `mode` at workflow level: `locked` = always on (no toggle), `on`/`off` = user-toggleable
- `status: 'soon'` = grayed out in UI with "SOON" badge, not activatable
- `context_prompt` is injected into the system prompt when the workflow is active — appended after the agent's base prompt in `ai/system_prompt.py`, stacked in workflow definition order when multiple workflows are active

### AgentDefinition Extension

```python
@dataclass
class AgentDefinition:
    # ... existing fields ...
    workflows: list[Workflow] = field(default_factory=list)

    @property
    def tools(self) -> list[str]:
        """Backward compatibility — collects all unique non-off tool refs from active workflows."""
        seen = set()
        result = []
        for wf in self.workflows:
            if wf.mode != 'off':
                for slot in wf.tools:
                    if slot.mode != 'off' and slot.ref not in seen:
                        seen.add(slot.ref)
                        result.append(slot.ref)
        return result
```

The flat `tools: List[str]` becomes a computed property deriving from workflows. Existing code that reads `agent.tools` continues to work.

## UI Design

### Layout: Ansatz C — Compact + Expandable

Each agent tab in the Settings Sidebar shows workflows as compact rows that expand on tap.

**Collapsed state** (one line per workflow):
- Workflow label (left)
- Lock icon (if `mode: 'locked'`)
- Colored dots preview: orange = triggers, blue = tools, green = outputs (right)
- Chevron (right)
- Description below label in muted text

**Expanded state:**
- Workflow label + toggle (or lock icon)
- Description
- Three sections: Trigger · Tools · Output
- Each section: category label (left, colored) + chip row (right, wrapping)

**Disabled workflow** (`mode: 'off'`):
- Dimmed appearance, toggle in OFF position
- Chips not shown (collapsed only)

**Soon workflow** (`status: 'soon'`):
- Fully dimmed, "SOON" badge next to label
- Toggle disabled

### Chip States

Every chip (trigger, tool, or output) has one of three visual states:

| Mode | Visual | Interaction |
|------|--------|-------------|
| `locked` | Normal color + lock icon | No toggle, always visible |
| `on` | Normal color, no icon | Tap to toggle off |
| `off` | Dimmed + strikethrough | Tap to toggle on |

Chip colors by category (use design tokens only, no hardcoded hex):
- **Trigger**: `var(--ds-yellow)` text, `var(--ds-yellow-10)` background
- **Tool**: `var(--ds-accent)` text, `var(--ds-accent-10)` background
- **Output**: `var(--ds-green)` text, `var(--ds-green-10)` background

### Inner Tab Bar

**Dynamic** — only shown for agents that have both a "Speziell" tab AND workflows:
- Plusi: "Persönlichkeit" | "Deep Insights"
- Research: "Quellen" | "Deep Insights"
- Tutor: Deep Insights only (tool toggles are now part of workflow chips)
- Help: Deep Insights only (tool toggles are now part of workflow chips)

The inner tab bar uses the same segmented control style as the existing sidebar, colored with the agent's accent color.

### Language

- Technical/cool terms in English: Trigger, Tools, Workflows, Deep Insights, Agent, Output, Locked, Soon
- Everything else in German: descriptions, labels, section headers

## Component Architecture

### New Components

| Component | Purpose |
|-----------|---------|
| `WorkflowList` | Renders all workflows of an agent (collapsed/expanded state management) |
| `WorkflowCard` | Single workflow: header + description + slot sections |
| `SlotChips` | Renders one category (Trigger/Tools/Outputs) as colored chip row with label |
| `SlotChip` | Single chip with mode visualization (locked/on/off), tap to toggle |

### Modified Components

| Component | Change |
|-----------|--------|
| `SidebarShell` | Add inner tab bar logic when agent has workflows |
| `subagentRegistry.ts` | Add `Workflow` and `Slot` interfaces, add `workflows` to `SubagentConfig` |
| `ai/agents.py` | Add `Workflow` and `Slot` dataclasses, add `workflows` to `AgentDefinition` |
| `StandardSubMenu` | Fully replaced by `WorkflowList` — tool toggles now live inside workflow chips |

### Unchanged Components

| Component | Reason |
|-----------|--------|
| `SidebarTabBar` | Outer tab bar (agent selection) stays as-is |
| `AgentHeader` | Agent header (name, badge, power toggle) stays as-is |
| `PlusiMenu` | Stays as "Speziell" tab content |
| `ResearchMenu` | Stays as "Speziell" tab content |
| `SettingsSidebar` | Settings tab unrelated to agent workflows |

## Data Flow

### Registration (Python → Frontend)

1. Agent definitions in `ai/agents.py` include `workflows: list[Workflow]`
2. `get_registry_for_frontend(config)` serializes workflows with current user toggle states
3. Frontend receives via `subagent_registry` message
4. `setRegistry()` stores workflows in the registry map
5. `SidebarShell` reads workflows from registry, renders `WorkflowList`

### User Configuration (Frontend → Python)

1. User taps a `SlotChip` or `WorkflowCard` toggle
2. Component calls `bridge.addMessage('saveWorkflowConfig', { agent, workflow, slot?, mode })`
3. Python `@pyqtSlot(str)` method `saveWorkflowConfig(json_str)` in `ui/bridge.py`
4. Saves to `config.json` under nested key structure:
   ```json
   {
     "workflow_config": {
       "tutor": {
         "explain": {
           "_enabled": true,
           "search_image": "off",
           "get_learning_stats": "on"
         }
       }
     }
   }
   ```
   - `_enabled` controls the workflow toggle (only for non-locked workflows)
   - Each slot key stores its current mode (only for non-locked slots)
   - Locked items and default-state items are omitted (stored only when user changes them)
5. Config update broadcast back to frontend

### Tool Resolution (Runtime)

1. Agent is triggered (chat, timer, UI event, etc.)
2. Collect all active workflows matching the trigger
3. Merge tool sets from matching workflows (union of non-off slots)
4. Stack context prompts from matching workflows
5. Agent runs once with merged capabilities

**Note:** The exact execution model (merge vs. priority vs. parallel) is intentionally left open. The schema supports all approaches — this decision comes later when more workflows exist and patterns emerge.

## Example: Tutor Agent Workflows

```python
tutor = AgentDefinition(
    name='tutor',
    label='Tutor',
    # ... existing fields ...
    workflows=[
        Workflow(
            name='quiz',
            label='Quiz & Abfrage',
            description='Testet dein Wissen mit Fragen und Multiple Choice bevor du die Antwort siehst',
            mode='locked',
            triggers=[
                Slot(ref='card_question_shown', mode='locked'),
            ],
            tools=[
                Slot(ref='ask_question', mode='locked'),
                Slot(ref='multiple_choice', mode='on'),
            ],
            outputs=[
                Slot(ref='chat_response', mode='locked'),
                Slot(ref='mc_widget', mode='on'),
            ],
            context_prompt='Die Karte ist verdeckt. Stelle eine Frage oder generiere Multiple Choice.',
        ),
        Workflow(
            name='explain',
            label='Erklären & Vertiefen',
            description='Erklärt Konzepte, zeigt Zusammenhänge und vertieft nach dem Aufdecken der Karte',
            mode='on',
            triggers=[
                Slot(ref='card_answer_shown', mode='locked'),
                Slot(ref='chat', mode='on'),
            ],
            tools=[
                Slot(ref='search_deck', mode='locked'),
                Slot(ref='search_image', mode='on'),
                Slot(ref='create_mermaid_diagram', mode='on'),
                Slot(ref='get_learning_stats', mode='on'),
                Slot(ref='compact', mode='on'),
            ],
            outputs=[
                Slot(ref='chat_response', mode='locked'),
                Slot(ref='widget', mode='on'),
            ],
        ),
        Workflow(
            name='free_chat',
            label='Freies Gespräch',
            description='Alle Tools verfügbar für offene Fragen ohne Kartenbezug',
            mode='on',
            triggers=[
                Slot(ref='chat', mode='locked'),
            ],
            tools=[
                Slot(ref='search_deck', mode='locked'),
                Slot(ref='search_image', mode='on'),
                Slot(ref='create_mermaid_diagram', mode='on'),
                Slot(ref='get_learning_stats', mode='on'),
                Slot(ref='show_card', mode='on'),
                Slot(ref='compact', mode='on'),
            ],
            outputs=[
                Slot(ref='chat_response', mode='locked'),
                Slot(ref='widget', mode='on'),
            ],
        ),
        Workflow(
            name='exam',
            label='Prüfungsmodus',
            description='Simuliert Prüfungsbedingungen mit Zeitlimit und Auswertung',
            status='soon',
            mode='off',
            triggers=[],
            tools=[],
            outputs=[],
        ),
    ],
)
```

## Example: Plusi Agent Workflows

```python
plusi = AgentDefinition(
    name='plusi',
    label='Plusi',
    # ... existing fields ...
    workflows=[
        Workflow(
            name='autonomous',
            label='Autonomes Denken',
            description='Plusi denkt eigenständig nach, reflektiert und entwickelt sich weiter',
            mode='locked',
            triggers=[
                Slot(ref='timer', mode='locked'),
                Slot(ref='mention_plusi', mode='on'),
                Slot(ref='mood_event', mode='on'),
            ],
            tools=[
                Slot(ref='reflect', mode='locked'),
                Slot(ref='research', mode='on'),
                Slot(ref='sleep', mode='on'),
                Slot(ref='do_nothing', mode='on'),
            ],
            outputs=[
                Slot(ref='emotion', mode='locked'),
                Slot(ref='memory', mode='locked'),
                Slot(ref='diary_write', mode='on'),
                Slot(ref='set_timer', mode='on'),
            ],
        ),
        Workflow(
            name='chat_companion',
            label='Chat-Begleitung',
            description='Reagiert auf Chat-Nachrichten mit Persönlichkeit und Humor',
            mode='locked',
            triggers=[
                Slot(ref='mention_plusi', mode='locked'),
                Slot(ref='chat', mode='on'),
            ],
            tools=[
                Slot(ref='respond', mode='locked'),
                Slot(ref='humor', mode='on'),
            ],
            outputs=[
                Slot(ref='chat_response', mode='locked'),
                Slot(ref='emotion', mode='on'),
            ],
        ),
    ],
)
```

## Component Viewer

All new components are documented in the Component Viewer under a new **"Agenten"** section:

- `WorkflowCard` — all variants: expanded, collapsed, locked, toggleable, disabled, soon
- `SlotChip` — all modes: locked, on, off × all categories: trigger (orange), tool (blue), output (green)
- `SlotChips` — row layout with label, wrapping behavior
- `WorkflowList` — multiple workflows, mixed states
- Inner Tab Bar — with and without Speziell tab

## Design System Tokens

All colors use existing `var(--ds-*)` tokens. New semantic mappings:

| Usage | Token |
|-------|-------|
| Trigger chip bg | `var(--ds-yellow-10)` |
| Trigger chip text | `var(--ds-yellow)` |
| Tool chip bg | `var(--ds-accent-10)` |
| Tool chip text | `var(--ds-accent)` |
| Output chip bg | `var(--ds-green-10)` |
| Output chip text | `var(--ds-green)` |
| Lock icon | Category color at 35% opacity |
| Disabled chip | Category color at 35% opacity + strikethrough |
| Workflow card bg | `var(--ds-hover-tint)` |
| Workflow card border | `var(--ds-border-subtle)` |

No hardcoded hex values in implementation. If tint tokens (`--ds-yellow-10` etc.) don't exist yet, add them to `design-system.css`.

## Out of Scope

- **Execution model**: How triggers resolve when multiple workflows match — decided later
- **Pipeline workflows**: Sequential tool execution (Perplexity → PubMed → Synthese) — later extension
- **Agent overview page**: Full-page view of all agents with their registrations — separate spec
- **Workflow creation UI**: Users can't create workflows yet — developer-defined only
- **Backward compatibility migration**: Moving existing tool configs to workflow-based configs
