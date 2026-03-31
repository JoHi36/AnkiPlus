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

# --- Built-in Triggers ---
for t in [
    ('card_question_shown', 'Karte verdeckt', 'trigger', 'Karte wird zum ersten Mal gezeigt'),
    ('card_answer_shown', 'Antwort zeigen', 'trigger', 'Karte wurde aufgedeckt'),
    ('chat', 'Chat', 'trigger', 'Nachricht im Chat'),
    ('mention_plusi', '@Plusi', 'trigger', 'Direkte Erwähnung von Plusi'),
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
