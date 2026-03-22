"""Agent registry — single source of truth for all agents.

Replaces ai/subagents.py as the primary agent registry.
Architecture: router-orchestrated agent platform with AgentDefinition dataclass.
"""
from dataclasses import dataclass, field
from typing import Optional, Callable, List

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# AgentDefinition
# ---------------------------------------------------------------------------

@dataclass
class AgentDefinition:
    """Extended agent definition — replaces SubagentDefinition."""

    # Identity
    name: str                          # 'tutor', 'research', 'help', 'plusi'
    label: str                         # 'Tutor', 'Research Agent', 'Help', 'Plusi'
    description: str                   # One-line for UI/router

    # Visual
    color: str = ''                    # Hex color or 'transparent'
    icon_type: str = 'svg'             # 'svg', 'emote', 'none'
    icon_svg: str = ''                 # SVG markup (or empty)
    badge_logo: str = ''               # 'anki', 'perplexity', '' etc.

    # Configuration
    enabled_key: str = ''              # Config key: 'tutor_enabled'
    is_default: bool = False           # True only for Tutor

    # Execution
    run_module: str = ''               # 'ai.tutor', 'research', 'plusi.agent'
    run_function: str = ''             # 'run_tutor', 'run_research'

    # Tools (list of tool names this agent owns)
    tools: List[str] = field(default_factory=list)

    # Context sources the Router should include
    context_sources: List[str] = field(default_factory=list)
    # Valid values: 'card', 'card_review', 'insights', 'rag',
    #              'session', 'deck_info', 'memory', 'agent_state'

    # Routing
    router_hint: str = ''
    can_handoff_to: List[str] = field(default_factory=list)

    # Lifecycle
    on_finished: Optional[Callable] = None
    loading_hint_template: str = '{label} arbeitet...'

    # Backward compat (from SubagentDefinition)
    pipeline_label: str = ''           # Shown in ThoughtStream done-step
    main_model_hint: str = ''          # Instruction for tutor (legacy, will be removed later)
    extra_kwargs: dict = field(default_factory=dict)

    # Limits
    max_history: int = 20


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

AGENT_REGISTRY: dict[str, AgentDefinition] = {}


def register_agent(definition: AgentDefinition):
    """Register an agent definition."""
    AGENT_REGISTRY[definition.name] = definition
    logger.info("Registered agent: %s", definition.name)


def get_agent(name: str) -> Optional[AgentDefinition]:
    """Look up an agent by name. Returns None if not found."""
    return AGENT_REGISTRY.get(name)


def get_default_agent() -> AgentDefinition:
    """Return the default agent (Tutor). Raises if none registered."""
    for agent in AGENT_REGISTRY.values():
        if agent.is_default:
            return agent
    raise RuntimeError("No default agent registered")


def get_enabled_agents(config: dict) -> List[AgentDefinition]:
    """Return agents whose config key is enabled (or who are the default)."""
    return [a for a in AGENT_REGISTRY.values()
            if a.is_default or config.get(a.enabled_key, False)]


def get_non_default_agents(config: dict) -> List[AgentDefinition]:
    """Return enabled agents that are NOT the default."""
    return [a for a in AGENT_REGISTRY.values()
            if not a.is_default and config.get(a.enabled_key, False)]


def get_registry_for_frontend(config: dict) -> List[dict]:
    """Return enabled agents as dicts for JSON serialization to frontend."""
    enabled = get_enabled_agents(config)
    return [
        {
            'name': a.name,
            'label': a.label,
            'description': a.description,
            'color': a.color,
            'enabled': True,
            'isDefault': a.is_default,
            'pipelineLabel': a.pipeline_label,
            'iconType': a.icon_type,
            'iconSvg': a.icon_svg,
            'badgeLogo': a.badge_logo,
            'loadingHintTemplate': a.loading_hint_template,
            'tools': a.tools,
            'canHandoffTo': a.can_handoff_to,
        }
        for a in enabled
    ]


def lazy_load_run_fn(agent: AgentDefinition) -> Callable:
    """Import and return the agent's run function on first use."""
    import importlib
    try:
        mod = importlib.import_module(f'..{agent.run_module}', package=__package__)
    except (ImportError, ValueError):
        mod = importlib.import_module(agent.run_module)
    return getattr(mod, agent.run_function)


# ---------------------------------------------------------------------------
# Backward-compat wrappers (same signatures as subagents.py)
# ---------------------------------------------------------------------------

def get_router_subagent_prompt(config: dict) -> str:
    """Auto-generate router prompt section from enabled non-default agents.

    Uses router_hint -- tells the router WHEN to delegate to an agent.
    """
    enabled = get_non_default_agents(config)
    if not enabled:
        return ""
    lines = [
        "SUBAGENT DELEGATION (retrieval_mode='subagent:<name>'):\n"
        "Use subagents ONLY when the message fits EXCLUSIVELY into one agent's domain. "
        "If the message contains ANY factual question component, do NOT delegate — use normal search instead. "
        "When delegating, set search_needed=false."
    ]
    for a in enabled:
        lines.append(f"  - subagent:{a.name} -- {a.label}: {a.router_hint}")
    return "\n".join(lines)


def get_main_model_subagent_prompt(config: dict) -> str:
    """Auto-generate subagent section for the main model's system prompt.

    Uses main_model_hint -- tells the main model HOW to interact with agents.
    Only includes agents that have a main_model_hint defined.
    """
    enabled = get_non_default_agents(config)
    hints = [a for a in enabled if a.main_model_hint]
    if not hints:
        return ""
    lines = ["Available subagents:"]
    for a in hints:
        lines.append(f"  - {a.label}: {a.main_model_hint}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# SVG Constants
# ---------------------------------------------------------------------------

RADAR_ICON_SVG = (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    '<circle cx="12" cy="12" r="10"/>'
    '<line x1="12" y1="12" x2="12" y2="2"/>'
    '<path d="M12 12 L16.24 7.76" stroke-width="2.5"/>'
    '<circle cx="12" cy="12" r="6" opacity="0.4"/>'
    '<circle cx="12" cy="12" r="2" fill="#00D084" stroke="none"/>'
    '</svg>'
)

LIFEBUOY_ICON_SVG = (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    '<circle cx="12" cy="12" r="10"/>'
    '<circle cx="12" cy="12" r="4"/>'
    '<line x1="4.93" y1="4.93" x2="9.17" y2="9.17"/>'
    '<line x1="14.83" y1="14.83" x2="19.07" y2="19.07"/>'
    '<line x1="14.83" y1="9.17" x2="19.07" y2="4.93"/>'
    '<line x1="4.93" y1="19.07" x2="9.17" y2="14.83"/>'
    '</svg>'
)


# ---------------------------------------------------------------------------
# Plusi on-finished callback
# ---------------------------------------------------------------------------

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
            from ..plusi.panel import (
                notify_new_diary_entry,
                update_panel_mood,
                update_panel_friendship,
            )
        except ImportError:
            from plusi.panel import (
                notify_new_diary_entry,
                update_panel_mood,
                update_panel_friendship,
            )
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


# ===========================================================================
# Agent Registrations
# ===========================================================================

# ── Tutor (default) ──

register_agent(AgentDefinition(
    # Identity
    name='tutor',
    label='Tutor',
    description='KI-Tutor fuer kartenbasiertes Lernen mit RAG und Tools',
    # Visual
    color='transparent',
    icon_type='none',
    icon_svg='',
    badge_logo='anki',
    # Configuration
    enabled_key='tutor_enabled',
    is_default=True,
    # Execution (Phase 3 placeholder — ai/tutor.py does not exist yet)
    run_module='ai.tutor',
    run_function='run_tutor',
    # Tools
    tools=[
        'search_deck',
        'show_card',
        'show_card_media',
        'create_mermaid_diagram',
        'get_learning_stats',
        'compact',
    ],
    # Context
    context_sources=[
        'card', 'card_review', 'insights', 'rag',
        'session', 'deck_info', 'memory',
    ],
    # Routing
    can_handoff_to=['research'],
    # Labels
    pipeline_label='Tutor',
    loading_hint_template='Suche in deinen Karten...',
))


# ── Research Agent ──

register_agent(AgentDefinition(
    # Identity
    name='research',
    label='Research Agent',
    description='Searches the internet for cited, high-quality sources',
    # Visual
    color='#00D084',
    icon_type='svg',
    icon_svg=RADAR_ICON_SVG,
    badge_logo='',
    # Configuration
    enabled_key='research_enabled',
    # Execution
    run_module='research',
    run_function='run_research',
    # Tools
    tools=['search_pubmed', 'search_wikipedia', 'search_perplexity'],
    # Context
    context_sources=['session', 'deck_info', 'memory'],
    # Routing
    router_hint=(
        'Delegate ONLY when: (1) user explicitly asks for internet sources/research, OR '
        '(2) question clearly requires current/external information that cannot exist in flashcards '
        '(e.g. latest guidelines, recent news, specific URLs). '
        'Do NOT delegate when: question can be answered from flashcards, is about the user\'s '
        'learning material, is casual conversation, or is a general knowledge question the AI knows.'
    ),
    main_model_hint=(
        'Use search_web tool ONLY when: (1) user explicitly asks for sources/citations from the internet, '
        '(2) your own knowledge is clearly insufficient AND the user\'s cards don\'t cover the topic, '
        '(3) user asks about very recent or time-sensitive information. '
        'Do NOT use when: LERNMATERIAL contains relevant cards, your knowledge is sufficient, '
        'or the question is about the user\'s own cards/deck.'
    ),
    can_handoff_to=['tutor'],
    # Labels
    pipeline_label='Research',
    loading_hint_template='Durchsuche Quellen zu {query}...',
))


# ── Help Agent (NEW) ──

register_agent(AgentDefinition(
    # Identity
    name='help',
    label='Help',
    description='Hilft bei App-Funktionen, Einstellungen und Bedienung',
    # Visual
    color='#FF9500',
    icon_type='svg',
    icon_svg=LIFEBUOY_ICON_SVG,
    badge_logo='',
    # Configuration
    enabled_key='help_enabled',
    # Execution (Phase 3 placeholder — ai/help_agent.py does not exist yet)
    run_module='ai.help_agent',
    run_function='run_help',
    # Tools
    tools=['change_theme', 'change_setting', 'navigate_to', 'explain_feature'],
    # Context
    context_sources=['memory'],
    # Routing
    router_hint=(
        'Wenn der User nach App-Funktionen fragt, Einstellungen ändern möchte, '
        'oder Hilfe zur Bedienung braucht. Nicht für Lernfragen.'
    ),
    can_handoff_to=['tutor'],
    # Labels
    pipeline_label='Help',
    loading_hint_template='Schaue nach...',
))


# ── Plusi ──

register_agent(AgentDefinition(
    # Identity
    name='plusi',
    label='Plusi',
    description='Persoenlicher Lernbegleiter mit Charakter und Gedaechtnis',
    # Visual
    color='#0A84FF',
    icon_type='emote',
    icon_svg='',
    badge_logo='',
    # Configuration
    enabled_key='mascot_enabled',
    # Execution
    run_module='plusi.agent',
    run_function='run_plusi',
    # Tools
    tools=['diary_write', 'reflect', 'mood_update'],
    # Context
    context_sources=['memory', 'agent_state'],
    # Routing
    router_hint=(
        'Delegate ONLY when: (1) user explicitly says "Plusi" or "@Plusi", OR '
        '(2) message is PURELY casual/emotional with NO factual question component '
        '(e.g. "ich bin müde", "das nervt", "hey"). '
        'Do NOT delegate when: user asks ANY factual question (even if frustrated), '
        'wants card explanations, wants a quiz, or combines emotion with a learning question. '
        'If unsure, do NOT delegate — the main model can spawn Plusi via tool if needed.'
    ),
    main_model_hint=(
        'Use spawn_plusi tool ONLY when: (1) user explicitly mentions Plusi by name, '
        '(2) the interaction is purely emotional/personal with no factual question, '
        '(3) user is celebrating or frustrated and a personal reaction fits better than a factual answer. '
        'Do NOT spawn Plusi when: the user asks "explain X", "what is Y", wants a quiz, '
        'or any question that needs RAG/card context. A frustrated user asking "I don\'t understand enzymes" '
        'needs an explanation, not Plusi.'
    ),
    can_handoff_to=['tutor'],
    on_finished=_plusi_on_finished,
    # Labels
    pipeline_label='Plusi',
    loading_hint_template='Plusi denkt nach...',
))
