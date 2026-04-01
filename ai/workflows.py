"""Workflow and Slot dataclasses for agent workflow definitions."""
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional


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
    mode: str = 'on'        # 'locked' | 'on' | 'off'
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
