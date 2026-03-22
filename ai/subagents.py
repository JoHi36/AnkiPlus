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
    description: str           # General description (for UI/settings)
    color: str                 # Hex color for pipeline: '#A78BFA'
    enabled_key: str           # Config key: 'mascot_enabled'
    pipeline_label: str        # Shown in router done-step: 'Plusi'
    run_module: str            # Module path for lazy import: 'plusi.agent'
    run_function: str          # Function name: 'run_plusi'
    router_hint: str           # When router should delegate (router-specific instruction)
    main_model_hint: str = ''  # Instruction for the main model (e.g., how to use spawn_plusi tool)
    on_finished: Optional[Callable] = None
    extra_kwargs: dict = field(default_factory=dict)
    icon_type: str = 'svg'
    icon_svg: str = ''
    loading_hint_template: str = ''

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
    """Auto-generate router prompt section from enabled subagents.

    Uses router_hint — tells the router WHEN to delegate to a subagent.
    """
    enabled = get_enabled_subagents(config)
    if not enabled:
        return ""
    lines = ["Available subagents (use retrieval_mode 'subagent:<name>' ONLY when "
             "exclusively this agent's function is needed, no search required):"]
    for s in enabled:
        lines.append(f"  - subagent:{s.name} -- {s.label}: {s.router_hint}")
    return "\n".join(lines)

def get_main_model_subagent_prompt(config: dict) -> str:
    """Auto-generate subagent section for the main model's system prompt.

    Uses main_model_hint — tells the main model HOW to interact with subagents.
    Only includes agents that have a main_model_hint defined.
    """
    enabled = get_enabled_subagents(config)
    hints = [s for s in enabled if s.main_model_hint]
    if not hints:
        return ""
    lines = ["Available subagents:"]
    for s in hints:
        lines.append(f"  - {s.label}: {s.main_model_hint}")
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
             'enabled': True, 'pipelineLabel': a.pipeline_label,
             'iconType': a.icon_type, 'iconSvg': a.icon_svg,
             'loadingHintTemplate': a.loading_hint_template}
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
    color='#0A84FF',
    enabled_key='mascot_enabled',
    pipeline_label='Plusi',
    run_module='plusi.agent',
    run_function='run_plusi',
    router_hint='Use when user wants casual conversation, emotional support, or explicitly addresses Plusi. NOT when the question also requires card search or factual answers.',
    main_model_hint='Use the spawn_plusi tool when the user explicitly addresses Plusi or wants personal/emotional interaction. Do NOT spawn Plusi for factual questions.',
    on_finished=_plusi_on_finished,
    icon_type='emote',
    loading_hint_template='Plusi denkt nach...',
))


# ── Research Agent Registration ──

RADAR_ICON_SVG = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
                  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
                  '<circle cx="12" cy="12" r="10"/>'
                  '<line x1="12" y1="12" x2="12" y2="2"/>'
                  '<path d="M12 12 L16.24 7.76" stroke-width="2.5"/>'
                  '<circle cx="12" cy="12" r="6" opacity="0.4"/>'
                  '<circle cx="12" cy="12" r="2" fill="#00D084" stroke="none"/>'
                  '</svg>')

register_subagent(SubagentDefinition(
    name='research',
    label='Research Agent',
    description='Searches the internet for cited, high-quality sources',
    color='#00D084',
    enabled_key='research_enabled',
    pipeline_label='Research',
    run_module='research',
    run_function='run_research',
    router_hint='Use when the user asks a question that cannot be adequately '
                'answered from deck cards alone and requires external or '
                'current information. NOT for casual conversation or card-specific questions.',
    main_model_hint='Use search_web tool when your knowledge is insufficient '
                    'to answer the question or the user explicitly asks for '
                    'sources/research from the internet.',
    icon_type='svg',
    icon_svg=RADAR_ICON_SVG,
    loading_hint_template='Durchsuche Quellen zu {query}...',
))
