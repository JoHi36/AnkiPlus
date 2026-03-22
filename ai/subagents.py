"""Subagent registry — single source of truth for all subagents."""
from dataclasses import dataclass, field
from typing import Optional, Callable

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)

@dataclass
class SubagentDefinition:
    name: str                  # Unique ID: 'plusi'
    label: str                 # Display name: 'Plusi'
    description: str           # For router prompt
    color: str                 # Hex color for pipeline: '#A78BFA'
    enabled_key: str           # Config key: 'mascot_enabled'
    pipeline_label: str        # Shown in router done-step: 'Plusi'
    run_module: str            # Module path for lazy import: 'plusi.agent'
    run_function: str          # Function name: 'run_plusi'
    router_hint: str           # When router should delegate
    on_finished: Optional[Callable] = None
    extra_kwargs: dict = field(default_factory=dict)

SUBAGENT_REGISTRY: dict[str, SubagentDefinition] = {}

def register_subagent(definition: SubagentDefinition):
    """Register a subagent definition."""
    SUBAGENT_REGISTRY[definition.name] = definition
    logger.info("Registered subagent: %s", definition.name)

def get_enabled_subagents(config: dict) -> list[SubagentDefinition]:
    """Return only subagents whose config key is enabled."""
    return [s for s in SUBAGENT_REGISTRY.values()
            if config.get(s.enabled_key, False)]

def get_router_subagent_prompt(config: dict) -> str:
    """Auto-generate router prompt section from enabled subagents."""
    enabled = get_enabled_subagents(config)
    if not enabled:
        return ""
    lines = ["Available subagents (use retrieval_mode 'subagent:<name>' ONLY when "
             "exclusively this agent's function is needed, no search required):"]
    for s in enabled:
        lines.append(f"  - subagent:{s.name} -- {s.label}: {s.description}. {s.router_hint}")
    return "\n".join(lines)

def lazy_load_run_fn(agent: SubagentDefinition) -> Callable:
    """Import and return the agent's run function on first use."""
    import importlib
    try:
        mod = importlib.import_module(f'..{agent.run_module}', package=__package__)
    except (ImportError, ValueError):
        mod = importlib.import_module(agent.run_module)
    return getattr(mod, agent.run_function)

def get_registry_for_frontend(config: dict) -> list[dict]:
    """Return enabled subagents as dicts for JSON serialization to frontend."""
    enabled = get_enabled_subagents(config)
    return [{'name': a.name, 'label': a.label, 'color': a.color,
             'enabled': True, 'pipelineLabel': a.pipeline_label}
            for a in enabled]


# ── Plusi Registration ──

def _plusi_on_finished(widget, agent_name, result):
    """Plusi-specific main-thread side effects after run_plusi completes."""
    mood = result.get('mood', 'neutral')
    friendship = result.get('friendship', {})
    try:
        try:
            from ..plusi.dock import sync_mood
        except ImportError:
            from plusi.dock import sync_mood
        sync_mood(mood)
    except Exception as e:
        logger.error("plusi dock sync error: %s", e)
    try:
        widget._sync_plusi_integrity()
    except Exception as e:
        logger.error("plusi integrity sync error: %s", e)
    try:
        try:
            from ..plusi.panel import notify_new_diary_entry, update_panel_mood, update_panel_friendship
        except ImportError:
            from plusi.panel import notify_new_diary_entry, update_panel_mood, update_panel_friendship
        if result.get('diary'):
            notify_new_diary_entry()
        update_panel_mood(mood)
        if friendship:
            update_panel_friendship(friendship)
    except Exception as e:
        logger.error("plusi panel notify error: %s", e)
    try:
        try:
            from .. import check_and_trigger_reflect
        except ImportError:
            pass
        else:
            check_and_trigger_reflect()
    except Exception:
        pass

register_subagent(SubagentDefinition(
    name='plusi',
    label='Plusi',
    description='Persoenlicher Lernbegleiter mit Charakter und Gedaechtnis',
    color='#A78BFA',
    enabled_key='mascot_enabled',
    pipeline_label='Plusi',
    run_module='plusi.agent',
    run_function='run_plusi',
    router_hint='Use when user wants casual conversation, emotional support, or explicitly addresses Plusi.',
    on_finished=_plusi_on_finished,
))
