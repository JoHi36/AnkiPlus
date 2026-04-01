# Workflow Deep Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Workflow-based Deep Insights tab to each agent in the Settings Sidebar, backed by a unified capability registry and Workflow/Slot schema.

**Architecture:** Extend the Python agent registry with `Workflow` and `Slot` dataclasses. Register triggers and outputs alongside tools in a unified capability registry. Build four new React components (`WorkflowList`, `WorkflowCard`, `SlotChips`, `SlotChip`) that render workflows 1:1 from the registry. Wire up persistence via a new `saveWorkflowConfig` bridge method.

**Tech Stack:** Python 3.9+ dataclasses, React 18, Tailwind CSS + design tokens (`var(--ds-*)`), PyQt6 bridge

**Spec:** `docs/superpowers/specs/2026-03-25-workflow-deep-insights-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `ai/capabilities.py` | `CapabilityDefinition` dataclass + `CapabilityRegistry` class for triggers, tools, outputs |
| `ai/workflows.py` | `Slot` and `Workflow` dataclasses |
| `tests/test_workflows.py` | Unit tests for Workflow, Slot, CapabilityRegistry, AgentDefinition.tools property |
| `frontend/src/components/WorkflowList.jsx` | Renders all workflows of an agent, manages expanded/collapsed state |
| `frontend/src/components/WorkflowCard.jsx` | Single workflow card: header, description, slot sections |
| `frontend/src/components/SlotChips.jsx` | One category row (Trigger/Tools/Output) with label + chip list |
| `frontend/src/components/SlotChip.jsx` | Single chip with mode visualization and toggle interaction |

### Modified Files

| File | Change |
|------|--------|
| `ai/agents.py` (lines 21-79) | Add `workflows: list` field to `AgentDefinition`, add `active_tools` property (parallel to existing `tools` field — migration to single source later) |
| `ai/agents.py` (lines 119-150) | Extend `get_registry_for_frontend()` to serialize workflows with user config overrides |
| `ai/agents.py` (lines 308-507) | Add `workflows=[...]` to all 4 agent registrations |
| `ai/tools.py` (lines 81-112) | Add `category` field to `ToolDefinition`, default `'tool'` |
| `shared/config/subagentRegistry.ts` (lines 6-35) | Add `Slot`, `Workflow` interfaces, add `workflows` to `SubagentConfig` |
| `shared/styles/design-system.css` | Add `--ds-yellow-10`, `--ds-green-10` tint tokens if missing |
| `frontend/src/components/SidebarShell.jsx` (lines 61-96) | Add inner tab bar logic, route to `WorkflowList` for Deep Insights |
| `ui/widget.py` (line 609) | Add `saveWorkflowConfig` to message handler dict + handler method |

---

### Task 1: Capability Registry (Python)

**Files:**
- Create: `ai/capabilities.py`
- Create: `tests/test_workflows.py`

- [ ] **Step 1: Write failing test for CapabilityDefinition and registry**

```python
# tests/test_workflows.py
import unittest

class TestCapabilityRegistry(unittest.TestCase):
    def setUp(self):
        from ai.capabilities import CapabilityRegistry
        self.reg = CapabilityRegistry()

    def test_register_and_get_trigger(self):
        from ai.capabilities import CapabilityDefinition
        cap = CapabilityDefinition(name='timer', label='Timer', category='trigger', description='Scheduled trigger')
        self.reg.register(cap)
        result = self.reg.get('timer')
        self.assertIsNotNone(result)
        self.assertEqual(result.label, 'Timer')
        self.assertEqual(result.category, 'trigger')

    def test_register_and_get_output(self):
        from ai.capabilities import CapabilityDefinition
        cap = CapabilityDefinition(name='emotion', label='Emotion', category='output', description='Mood update')
        self.reg.register(cap)
        result = self.reg.get('emotion')
        self.assertEqual(result.category, 'output')

    def test_get_unknown_returns_none(self):
        self.assertIsNone(self.reg.get('nonexistent'))

    def test_list_by_category(self):
        from ai.capabilities import CapabilityDefinition
        self.reg.register(CapabilityDefinition(name='timer', label='Timer', category='trigger'))
        self.reg.register(CapabilityDefinition(name='chat', label='Chat', category='trigger'))
        self.reg.register(CapabilityDefinition(name='emotion', label='Emotion', category='output'))
        triggers = self.reg.list_by_category('trigger')
        self.assertEqual(len(triggers), 2)
        outputs = self.reg.list_by_category('output')
        self.assertEqual(len(outputs), 1)

    def test_get_for_frontend(self):
        from ai.capabilities import CapabilityDefinition
        self.reg.register(CapabilityDefinition(name='timer', label='Timer', category='trigger', description='Scheduled'))
        result = self.reg.get_for_frontend(['timer'])
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['name'], 'timer')
        self.assertEqual(result[0]['label'], 'Timer')
        self.assertEqual(result[0]['category'], 'trigger')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -k TestCapabilityRegistry -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'ai.capabilities'`

- [ ] **Step 3: Implement CapabilityDefinition and CapabilityRegistry**

```python
# ai/capabilities.py
"""Unified capability registry for triggers, tools, and outputs."""
from dataclasses import dataclass, field
from typing import Optional, Callable, List, Dict, Any

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)


@dataclass
class CapabilityDefinition:
    name: str
    label: str
    category: str  # 'trigger' | 'tool' | 'output'
    description: str = ''
    execute_fn: Optional[Callable] = None
    schema: Optional[Dict[str, Any]] = None


class CapabilityRegistry:
    def __init__(self):
        self._capabilities: Dict[str, CapabilityDefinition] = {}

    def register(self, cap: CapabilityDefinition):
        self._capabilities[cap.name] = cap
        logger.debug("Registered capability %s (%s)", cap.name, cap.category)

    def get(self, name: str) -> Optional[CapabilityDefinition]:
        return self._capabilities.get(name)

    def list_by_category(self, category: str) -> List[CapabilityDefinition]:
        return [c for c in self._capabilities.values() if c.category == category]

    def get_for_frontend(self, names: List[str]) -> List[Dict[str, Any]]:
        result = []
        for name in names:
            cap = self._capabilities.get(name)
            if cap:
                result.append({
                    'name': cap.name,
                    'label': cap.label,
                    'category': cap.category,
                    'description': cap.description,
                })
        return result


# Global registry instance
capability_registry = CapabilityRegistry()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -k TestCapabilityRegistry -v`
Expected: PASS — all 5 tests

- [ ] **Step 5: Register initial triggers and outputs**

Add to `ai/capabilities.py` after the global instance:

```python
# --- Built-in Triggers ---
for t in [
    ('card_question_shown', 'Karte verdeckt', 'trigger', 'Karte wird zum ersten Mal gezeigt'),
    ('card_answer_shown', 'Antwort zeigen', 'trigger', 'Karte wurde aufgedeckt'),
    ('chat', 'Chat', 'trigger', 'Nachricht im Chat'),
    ('mention_plusi', '@Plusi', 'trigger', 'Direkte Erwähnung von Plusi'),
    ('mention_research', '@Research', 'trigger', 'Direkte Erwähnung von Research'),
    ('timer', 'Timer', 'trigger', 'Zeitgesteuerter Auslöser'),
    ('mood_event', 'Mood-Event', 'trigger', 'Stimmungsänderung erkannt'),
    ('router', 'Router', 'trigger', 'Automatische Weiterleitung'),
]:
    capability_registry.register(CapabilityDefinition(name=t[0], label=t[1], category=t[2], description=t[3]))

# --- Built-in Outputs ---
for o in [
    ('chat_response', 'Chat', 'output', 'Antwort im Chat-Fenster'),
    ('widget', 'Widget', 'output', 'Interaktives Widget im Chat'),
    ('mc_widget', 'MC Quiz', 'output', 'Multiple-Choice-Widget'),
    ('emotion', 'Emotion', 'output', 'Stimmungs-Update'),
    ('memory', 'Gedächtnis', 'output', 'Langzeitgedächtnis-Eintrag'),
    ('diary_write', 'Diary', 'output', 'Tagebuch-Eintrag'),
    ('set_timer', 'Timer setzen', 'output', 'Nächsten Timer planen'),
]:
    capability_registry.register(CapabilityDefinition(name=o[0], label=o[1], category=o[2], description=o[3]))
```

- [ ] **Step 6: Commit**

```bash
git add ai/capabilities.py tests/test_workflows.py
git commit -m "feat: add unified capability registry for triggers, tools, outputs"
```

---

### Task 2: Workflow & Slot Dataclasses (Python)

**Files:**
- Create: `ai/workflows.py`
- Modify: `tests/test_workflows.py`

- [ ] **Step 1: Write failing tests for Slot and Workflow**

Append to `tests/test_workflows.py`:

```python
class TestWorkflowSchema(unittest.TestCase):
    def test_slot_defaults(self):
        from ai.workflows import Slot
        s = Slot(ref='search_deck')
        self.assertEqual(s.mode, 'on')

    def test_slot_locked(self):
        from ai.workflows import Slot
        s = Slot(ref='timer', mode='locked')
        self.assertEqual(s.mode, 'locked')

    def test_workflow_defaults(self):
        from ai.workflows import Workflow, Slot
        wf = Workflow(
            name='quiz',
            label='Quiz & Abfrage',
            description='Test',
            triggers=[Slot(ref='card_question_shown', mode='locked')],
            tools=[Slot(ref='ask_question')],
            outputs=[Slot(ref='chat_response')],
        )
        self.assertEqual(wf.mode, 'on')
        self.assertEqual(wf.status, 'active')
        self.assertEqual(wf.context_prompt, '')

    def test_workflow_soon_status(self):
        from ai.workflows import Workflow
        wf = Workflow(name='exam', label='Exam', description='', triggers=[], tools=[], outputs=[], status='soon', mode='off')
        self.assertEqual(wf.status, 'soon')
        self.assertEqual(wf.mode, 'off')

    def test_workflow_to_dict(self):
        from ai.workflows import Workflow, Slot
        wf = Workflow(
            name='quiz', label='Quiz', description='Desc',
            triggers=[Slot(ref='chat', mode='locked')],
            tools=[Slot(ref='search_deck')],
            outputs=[Slot(ref='widget', mode='off')],
        )
        d = wf.to_dict()
        self.assertEqual(d['name'], 'quiz')
        self.assertEqual(len(d['triggers']), 1)
        self.assertEqual(d['triggers'][0]['ref'], 'chat')
        self.assertEqual(d['triggers'][0]['mode'], 'locked')
        self.assertEqual(d['tools'][0]['mode'], 'on')
        self.assertEqual(d['outputs'][0]['mode'], 'off')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -k TestWorkflowSchema -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'ai.workflows'`

- [ ] **Step 3: Implement Slot and Workflow**

```python
# ai/workflows.py
"""Workflow and Slot dataclasses for agent workflow definitions."""
from dataclasses import dataclass, field
from typing import List, Dict, Any


@dataclass
class Slot:
    ref: str
    mode: str = 'on'  # 'locked' | 'on' | 'off'

    def to_dict(self, capability_registry=None) -> Dict[str, Any]:
        d = {'ref': self.ref, 'mode': self.mode}
        if capability_registry:
            cap = capability_registry.get(self.ref)
            if cap:
                d['label'] = cap.label
                d['description'] = cap.description
        return d


@dataclass
class Workflow:
    name: str
    label: str
    description: str
    triggers: List[Slot] = field(default_factory=list)
    tools: List[Slot] = field(default_factory=list)
    outputs: List[Slot] = field(default_factory=list)
    mode: str = 'on'       # 'locked' | 'on' | 'off'
    status: str = 'active'  # 'active' | 'soon'
    context_prompt: str = ''

    def to_dict(self, capability_registry=None) -> Dict[str, Any]:
        return {
            'name': self.name,
            'label': self.label,
            'description': self.description,
            'triggers': [s.to_dict(capability_registry) for s in self.triggers],
            'tools': [s.to_dict(capability_registry) for s in self.tools],
            'outputs': [s.to_dict(capability_registry) for s in self.outputs],
            'mode': self.mode,
            'status': self.status,
            'contextPrompt': self.context_prompt,
        }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -k TestWorkflowSchema -v`
Expected: PASS — all 5 tests

- [ ] **Step 5: Commit**

```bash
git add ai/workflows.py tests/test_workflows.py
git commit -m "feat: add Workflow and Slot dataclasses with serialization"
```

---

### Task 3: Extend AgentDefinition with Workflows (Python)

**Files:**
- Modify: `ai/agents.py` (lines 21-79 for dataclass, lines 119-150 for frontend serialization)
- Modify: `tests/test_workflows.py`

- [ ] **Step 1: Write failing test for AgentDefinition.tools backward compat**

Append to `tests/test_workflows.py`:

```python
class TestAgentWorkflowIntegration(unittest.TestCase):
    def test_tools_property_collects_from_workflows(self):
        from ai.agents import AgentDefinition
        from ai.workflows import Workflow, Slot
        agent = AgentDefinition(
            name='test', label='Test', description='', color='#fff',
            enabled_key='test_enabled', is_default=False,
            run_module='', run_function='',
            tools=[],  # Will be overridden by property
            context_sources=[], router_hint='', can_handoff_to=[],
            widget_type='', submenu_label='', submenu_component='',
            tools_configurable=True, premium_model='', fast_model='', fallback_model='',
            workflows=[
                Workflow(name='wf1', label='WF1', description='',
                    tools=[Slot(ref='tool_a'), Slot(ref='tool_b', mode='off')]),
                Workflow(name='wf2', label='WF2', description='', mode='off',
                    tools=[Slot(ref='tool_c')]),
                Workflow(name='wf3', label='WF3', description='',
                    tools=[Slot(ref='tool_a'), Slot(ref='tool_d', mode='locked')]),
            ],
        )
        # wf1: tool_a (on), tool_b (off → excluded)
        # wf2: off workflow → excluded entirely
        # wf3: tool_a (dedup), tool_d (locked → included)
        tools = agent.active_tools
        self.assertEqual(tools, ['tool_a', 'tool_d'])

    def test_tools_property_empty_when_no_workflows(self):
        from ai.agents import AgentDefinition
        agent = AgentDefinition(
            name='test', label='Test', description='', color='#fff',
            enabled_key='test_enabled', is_default=False,
            run_module='', run_function='',
            tools=[],
            context_sources=[], router_hint='', can_handoff_to=[],
            widget_type='', submenu_label='', submenu_component='',
            tools_configurable=True, premium_model='', fast_model='', fallback_model='',
        )
        self.assertEqual(agent.active_tools, [])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -k TestAgentWorkflowIntegration -v`
Expected: FAIL — `AgentDefinition` has no `workflows` field or `active_tools` property

- [ ] **Step 3: Add workflows field and active_tools property to AgentDefinition**

In `ai/agents.py`, add import at top:
```python
from ai.workflows import Workflow, Slot
```

Add field to AgentDefinition dataclass (after `fallback_model` field, ~line 79):
```python
    workflows: list = field(default_factory=list)

    @property
    def active_tools(self) -> list:
        """Collects unique non-off tool refs from active workflows."""
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

- [ ] **Step 4: Extend get_registry_for_frontend to serialize workflows**

In `ai/agents.py`, `get_registry_for_frontend()` (~line 119-150), add workflows serialization to the dict being built for each agent. After existing fields, add:

```python
from ai.capabilities import capability_registry as cap_reg
# ...
            'workflows': [wf.to_dict(cap_reg) for wf in agent.workflows],
```

Also apply user config overrides: read `workflow_config` from config, merge modes for non-locked slots/workflows before serializing. For each non-locked workflow, check `config.get('workflow_config', {}).get(agent.name, {}).get(wf.name, {})` and override modes accordingly.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -k TestAgentWorkflowIntegration -v`
Expected: PASS — both tests

- [ ] **Step 6: Commit**

```bash
git add ai/agents.py tests/test_workflows.py
git commit -m "feat: extend AgentDefinition with workflows field and active_tools property"
```

---

### Task 4: Register Workflows on Existing Agents (Python)

**Files:**
- Modify: `ai/agents.py` (lines 308-507, agent registrations)

- [ ] **Step 1: Add workflows to Tutor agent registration**

At `ai/agents.py` ~line 308, add `workflows=[...]` to the Tutor `register_agent()` call using the exact definitions from the spec (see spec lines 259-336 for Tutor workflows: quiz, explain, free_chat, exam).

- [ ] **Step 2: Add workflows to Plusi agent registration**

At ~line 457, add `workflows=[...]` using spec lines 341-389 (autonomous, chat_companion).

- [ ] **Step 3: Add workflows to Research agent registration**

At ~line 363, add workflows:
- "Web-Recherche" (mode='locked', triggers: [@Research, router], tools: [search_perplexity, search_pubmed, search_wikipedia], outputs: [chat_response, widget])
- "Wort-Definition" (status='soon', mode='off', empty slots)

- [ ] **Step 4: Add workflows to Help agent registration**

At ~line 415, add workflows:
- "App-Hilfe" (mode='locked', triggers: [@Help, chat], tools: [change_theme, change_setting, navigate_to, explain_feature], outputs: [chat_response])

- [ ] **Step 5: Run existing agent tests to verify nothing breaks**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -v`
Expected: All existing tests PASS

- [ ] **Step 6: Commit**

```bash
git add ai/agents.py
git commit -m "feat: register workflows on all 4 agents (tutor, research, plusi, help)"
```

---

### Task 5: Message Handler for Workflow Config (Python)

**Files:**
- Modify: `ui/widget.py` (line 609) — add to message handler dict + handler method
- Note: This uses the message queue pattern (like `saveSubagentEnabled`), NOT a `@pyqtSlot` in bridge.py

- [ ] **Step 1: Add saveWorkflowConfig to message handler in widget.py**

In `ui/widget.py`, add to the handler dict (~line 609):
```python
'saveWorkflowConfig': self._msg_save_workflow_config,
```

- [ ] **Step 2: Implement _msg_save_workflow_config handler**

```python
def _msg_save_workflow_config(self, data):
    """Save workflow or slot mode change to config."""
    agent_name = data.get('agent')
    workflow_name = data.get('workflow')
    slot_ref = data.get('slot')  # None if toggling whole workflow
    mode = data.get('mode')

    config = get_config()
    wf_config = config.get('workflow_config', {})
    agent_wf = wf_config.setdefault(agent_name, {})
    wf = agent_wf.setdefault(workflow_name, {})

    if slot_ref:
        wf[slot_ref] = mode
    else:
        wf['_enabled'] = (mode != 'off')

    # Note: verify update_config accepts arbitrary kwargs. If not, use the same
    # pattern as _msg_save_ai_tools: get_config() → mutate → save_config(config).
    update_config(workflow_config=wf_config)
    logger.info("Saved workflow config: %s/%s/%s = %s", agent_name, workflow_name, slot_ref or '_enabled', mode)
```

- [ ] **Step 3: Run full test suite to verify no regressions**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -v`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add ui/bridge.py ui/widget.py
git commit -m "feat: add saveWorkflowConfig bridge method for workflow persistence"
```

---

### Task 6: TypeScript Registry Interfaces

**Files:**
- Modify: `shared/config/subagentRegistry.ts` (lines 6-35)

- [ ] **Step 1: Add Slot and Workflow interfaces**

Add before the `SubagentConfig` interface:

```typescript
export interface Slot {
  ref: string;
  mode: 'locked' | 'on' | 'off';
}

export interface WorkflowDefinition {
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

- [ ] **Step 2: Add workflows to SubagentConfig**

Add to `SubagentConfig` interface:
```typescript
  workflows?: WorkflowDefinition[];
```

- [ ] **Step 3: Commit**

```bash
git add shared/config/subagentRegistry.ts
git commit -m "feat: add Slot and Workflow TypeScript interfaces to subagentRegistry"
```

---

### Task 7: Design System Tokens

**Files:**
- Modify: `shared/styles/design-system.css`

- [ ] **Step 1: Check which tint tokens already exist**

Search `design-system.css` for `--ds-yellow-10`, `--ds-green-10`, `--ds-accent-10`.

- [ ] **Step 2: Skip if tokens already exist (likely — they use `color-mix()`)**

The tokens likely already exist as `color-mix(in srgb, var(--ds-accent) 10%, transparent)`. If so, this task is done — do NOT replace `color-mix()` with hardcoded `rgba()`. Only add tokens if they are genuinely missing.

- [ ] **Step 3: Commit**

```bash
git add shared/styles/design-system.css
git commit -m "feat: add category tint tokens for workflow chip colors"
```

---

### Task 8: SlotChip Component

**Files:**
- Create: `frontend/src/components/SlotChip.jsx`

- [ ] **Step 1: Implement SlotChip**

```jsx
// frontend/src/components/SlotChip.jsx
import React from 'react';

const CATEGORY_STYLES = {
  trigger: { color: 'var(--ds-yellow)', bg: 'var(--ds-yellow-10)' },
  tool:    { color: 'var(--ds-accent)', bg: 'var(--ds-accent-10)' },
  output:  { color: 'var(--ds-green)',  bg: 'var(--ds-green-10)'  },
};

const LockIcon = ({ color }) => (
  <svg width="7" height="7" viewBox="0 0 16 16" style={{ opacity: 0.35, flexShrink: 0 }}>
    <rect x="2" y="7" width="12" height="8" rx="2" fill={color} />
    <path d="M5 7V5a3 3 0 016 0v2" stroke={color} fill="none" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export default function SlotChip({ label, mode, category, onToggle }) {
  const styles = CATEGORY_STYLES[category] || CATEGORY_STYLES.tool;
  const isOff = mode === 'off';
  const isLocked = mode === 'locked';
  const canToggle = !isLocked && typeof onToggle === 'function';

  return (
    <button
      onClick={canToggle ? onToggle : undefined}
      disabled={isLocked}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        background: isOff ? 'transparent' : styles.bg,
        border: isOff ? `1px solid ${styles.bg}` : `1px solid transparent`,
        borderRadius: '6px',
        padding: '3px 8px',
        fontSize: '10px',
        color: styles.color,
        opacity: isOff ? 0.35 : 1,
        textDecoration: isOff ? 'line-through' : 'none',
        cursor: canToggle ? 'pointer' : 'default',
        transition: 'opacity 0.15s, background 0.15s',
      }}
    >
      <span>{label}</span>
      {isLocked && <LockIcon color={styles.color} />}
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/SlotChip.jsx
git commit -m "feat: add SlotChip component with locked/on/off modes"
```

---

### Task 9: SlotChips Component

**Files:**
- Create: `frontend/src/components/SlotChips.jsx`

- [ ] **Step 1: Implement SlotChips**

```jsx
// frontend/src/components/SlotChips.jsx
import React from 'react';
import SlotChip from './SlotChip';

const CATEGORY_LABELS = {
  trigger: { label: 'Trigger', color: 'var(--ds-yellow)' },
  tool:    { label: 'Tools',   color: 'var(--ds-accent)' },
  output:  { label: 'Output',  color: 'var(--ds-green)'  },
};

export default function SlotChips({ slots, category, onSlotToggle }) {
  const cat = CATEGORY_LABELS[category] || CATEGORY_LABELS.tool;
  if (!slots || slots.length === 0) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '7px' }}>
      <div style={{
        fontSize: '9px',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: cat.color,
        opacity: 0.5,
        minWidth: '46px',
        paddingTop: '4px',
      }}>
        {cat.label}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
        {slots.map(slot => (
          <SlotChip
            key={slot.ref}
            label={slot.label || slot.ref}
            mode={slot.mode}
            category={category}
            onToggle={() => onSlotToggle?.(slot.ref, slot.mode === 'off' ? 'on' : 'off')}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/SlotChips.jsx
git commit -m "feat: add SlotChips component for category-labeled chip rows"
```

---

### Task 10: WorkflowCard Component

**Files:**
- Create: `frontend/src/components/WorkflowCard.jsx`

- [ ] **Step 1: Implement WorkflowCard**

Component that renders a single workflow in collapsed or expanded state. Props: `workflow`, `expanded`, `onToggleExpand`, `onToggleWorkflow`, `onSlotToggle`, `capabilityRegistry`.

Collapsed: label + lock icon + colored dots + chevron + description.
Expanded: label + toggle + description + SlotChips for triggers/tools/outputs.
Soon: dimmed + "SOON" badge, no toggle.

Follow the exact mockup from the spec — use `var(--ds-*)` tokens exclusively.

Toggle component: reuse the iOS-style toggle from `StandardSubMenu.jsx` (lines 4-37) or extract as shared.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/WorkflowCard.jsx
git commit -m "feat: add WorkflowCard component with collapsed/expanded/locked/soon states"
```

---

### Task 11: WorkflowList Component

**Files:**
- Create: `frontend/src/components/WorkflowList.jsx`

- [ ] **Step 1: Implement WorkflowList**

```jsx
// frontend/src/components/WorkflowList.jsx
import React, { useState } from 'react';
import WorkflowCard from './WorkflowCard';

export default function WorkflowList({ agent, bridge }) {
  const [expandedWorkflow, setExpandedWorkflow] = useState(null);
  const workflows = agent?.workflows || [];

  const handleToggleWorkflow = (workflowName, newMode) => {
    bridge?.addMessage?.('saveWorkflowConfig', {
      agent: agent.name,
      workflow: workflowName,
      mode: newMode,
    });
  };

  const handleSlotToggle = (workflowName, slotRef, newMode) => {
    bridge?.addMessage?.('saveWorkflowConfig', {
      agent: agent.name,
      workflow: workflowName,
      slot: slotRef,
      mode: newMode,
    });
  };

  if (workflows.length === 0) {
    return (
      <div style={{ padding: '16px', color: 'var(--ds-text-muted)', fontSize: '13px' }}>
        Keine Workflows konfiguriert.
      </div>
    );
  }

  return (
    <div>
      <div style={{
        fontSize: '10px',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--ds-text-muted)',
        marginBottom: '8px',
        padding: '0 4px',
      }}>
        Workflows
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {workflows.map(wf => (
          <WorkflowCard
            key={wf.name}
            workflow={wf}
            expanded={expandedWorkflow === wf.name}
            onToggleExpand={() => setExpandedWorkflow(
              expandedWorkflow === wf.name ? null : wf.name
            )}
            onToggleWorkflow={(newMode) => handleToggleWorkflow(wf.name, newMode)}
            onSlotToggle={(slotRef, newMode) => handleSlotToggle(wf.name, slotRef, newMode)}
                      />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/WorkflowList.jsx
git commit -m "feat: add WorkflowList component with expand/collapse and bridge persistence"
```

---

### Task 12: Wire Up SidebarShell with Inner Tab Bar

**Files:**
- Modify: `frontend/src/components/SidebarShell.jsx` (lines 61-96)

- [ ] **Step 1: Add inner tab state and Deep Insights routing**

In `SidebarShell.jsx`:

1. Add state: `const [innerTab, setInnerTab] = useState('insights');`
2. Reset innerTab to `'insights'` when activeTab changes.
3. Determine if agent needs inner tabs: `const hasSpecialTab = ['plusi', 'research'].includes(activeTab);`
4. If `hasSpecialTab`, render a segmented control above the content:
   - Tab 1: Speziell label (Persönlichkeit / Quellen)
   - Tab 2: "Deep Insights"
5. Route content:
   - If `innerTab === 'special'` AND agent is plusi → `<PlusiMenu>`
   - If `innerTab === 'special'` AND agent is research → `<ResearchMenu>`
   - Else → `<WorkflowList agent={agent} bridge={bridge}  />`
6. For agents WITHOUT special tab (tutor, help): render `<WorkflowList>` directly, no inner tabs.

- [ ] **Step 2: No separate capability registry needed on frontend**

Labels are inlined into each Slot's serialized dict by `Slot.to_dict(capability_registry)` on the Python side. The frontend reads `slot.label` directly — no separate capability lookup needed.

- [ ] **Step 3: Test in browser with `npm run dev`**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run dev`
Open: `http://localhost:3000`
Verify: Settings sidebar shows Deep Insights tab for each agent with workflow cards.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/SidebarShell.jsx
git commit -m "feat: wire WorkflowList into SidebarShell with inner tab bar for Plusi/Research"
```

---

### Task 13: Component Viewer — Agenten Section

**Files:**
- Modify: `frontend/src/ComponentViewer.jsx`

- [ ] **Step 1: Add "Agenten" section to Component Viewer**

Add a new section showing all workflow component variants:

1. **SlotChip** — 3×3 matrix: modes (locked, on, off) × categories (trigger, tool, output)
2. **SlotChips** — Row with mixed modes per category
3. **WorkflowCard** — Variants: expanded, collapsed, locked, toggleable, disabled (off), soon
4. **WorkflowList** — Full example with Tutor's 4 workflows
5. **Inner Tab Bar** — With and without Speziell tab

- [ ] **Step 2: Test Component Viewer**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run dev`
Open: `http://localhost:3000/?view=components`
Verify: "Agenten" section visible with all variants rendered correctly in dark and light mode.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/ComponentViewer.jsx
git commit -m "feat: add Agenten section to Component Viewer with all workflow component variants"
```

---

### Task 14: Build & Integration Test

**Files:**
- No new files

- [ ] **Step 1: Run Python tests**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main" && python3 run_tests.py -v`
Expected: All tests PASS

- [ ] **Step 2: Build frontend**

Run: `cd "/Users/johanneshinkel/Library/Application Support/Anki2/addons21/AnkiPlus_main/frontend" && npm run build`
Expected: Build succeeds, output in `web/`

- [ ] **Step 3: Manual verification checklist**

- [ ] Sidebar opens, all 4 agent tabs visible
- [ ] Tutor: Deep Insights shows 4 workflows (Quiz locked, Erklären on, Freies Gespräch on, Prüfungsmodus soon)
- [ ] Plusi: Inner tab bar shows "Persönlichkeit" | "Deep Insights"
- [ ] Research: Inner tab bar shows "Quellen" | "Deep Insights"
- [ ] Help: Deep Insights directly, no inner tabs
- [ ] Expanding a workflow shows Trigger/Tools/Output chips
- [ ] Locked chips show lock icon, no toggle
- [ ] Tapping a non-locked chip toggles it (on ↔ off)
- [ ] Tapping workflow toggle saves via bridge
- [ ] Component Viewer shows all variants under "Agenten"
- [ ] Dark mode: all colors correct via design tokens
- [ ] Light mode: all colors correct via design tokens

- [ ] **Step 4: Commit build output**

```bash
git add web/
git commit -m "build: frontend with workflow deep insights"
```
