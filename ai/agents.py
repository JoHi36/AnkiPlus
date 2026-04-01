"""Agent registry — single source of truth for all agents.

Replaces ai/subagents.py as the primary agent registry.
Architecture: router-orchestrated agent platform with AgentDefinition dataclass.
"""
from dataclasses import dataclass, field
from typing import Optional, Callable, List

try:
    from .workflows import Workflow, Slot
except ImportError:
    from ai.workflows import Workflow, Slot

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

    # Channel binding (agent-kanal-paradigma)
    channel: str = ''                  # 'stapel', 'session', 'plusi', 'reviewer-inline'
    uses_rag: bool = False             # Whether this agent calls analyze_query()

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

    # Agent Studio UI
    widget_type: str = ''           # 'embeddings', 'budget', '' (empty = no widget)
    submenu_label: str = ''         # 'Tutor konfigurieren' (auto-generated if empty)
    submenu_component: str = ''     # 'PlusiMenu', 'ResearchMenu', '' (empty = standard)
    tools_configurable: bool = True # Whether tools can be toggled in sub-menu

    # Lifecycle
    on_finished: Optional[Callable] = None
    loading_hint_template: str = '{label} arbeitet...'

    # Backward compat (from SubagentDefinition)
    pipeline_label: str = ''           # Shown in ThoughtStream done-step
    reasoning_steps: list = field(default_factory=list)  # Steps shown in ThoughtStream
    main_model_hint: str = ''          # Instruction for tutor (legacy, will be removed later)
    extra_kwargs: dict = field(default_factory=dict)

    # Limits
    max_history: int = 20

    # Model configuration
    premium_model: str = ''
    fast_model: str = ''
    fallback_model: str = ''

    # Workflows (new — parallel to tools, replaces tools as source of truth later)
    workflows: list = field(default_factory=list)

    @property
    def active_tools(self) -> list:
        """Collects unique non-off tool refs from active (non-off) workflows."""
        seen = set()
        result = []
        for wf in self.workflows:
            if wf.mode != 'off':
                for slot in wf.tools:
                    if slot.mode != 'off' and slot.ref not in seen:
                        seen.add(slot.ref)
                        result.append(slot.ref)
        return result


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
    """Return ALL registered agents as dicts for JSON serialization to frontend."""
    try:
        from .capabilities import capability_registry as cap_reg
    except ImportError:
        from ai.capabilities import capability_registry as cap_reg
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
            'reasoningSteps': a.reasoning_steps,
            'iconType': a.icon_type,
            'iconSvg': a.icon_svg,
            'badgeLogo': a.badge_logo,
            'loadingHintTemplate': a.loading_hint_template,
            'tools': a.tools,
            'channel': a.channel,
            # New fields
            'widgetType': a.widget_type,
            'submenuLabel': submenu_label,
            'submenuComponent': a.submenu_component,
            'toolsConfigurable': a.tools_configurable,
            # Model slots
            'premiumModel': a.premium_model,
            'fastModel': a.fast_model,
            'fallbackModel': a.fallback_model,
            # Workflows
            'workflows': [wf.to_dict(cap_reg) for wf in a.workflows],
        })
    return result


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

# — Tutor: Graduation cap
TUTOR_ICON_SVG = (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
    '<path d="M12 3L2 9l10 6 10-6-10-6z"/>'
    '<path d="M6 12v5c0 1.66 2.69 3 6 3s6-1.34 6-3v-5"/>'
    '<path d="M20 9v7"/>'
    '</svg>'
)

# — Research: Globe with search
RESEARCH_ICON_SVG = (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
    '<circle cx="11" cy="11" r="8"/>'
    '<path d="M11 3a15 15 0 0 1 4 8 15 15 0 0 1-4 8"/>'
    '<path d="M11 3a15 15 0 0 0-4 8 15 15 0 0 0 4 8"/>'
    '<path d="M3 11h16"/>'
    '<line x1="21" y1="21" x2="16.65" y2="16.65" stroke-width="2"/>'
    '</svg>'
)

# — Help: Question mark circle
HELP_ICON_SVG = (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
    '<circle cx="12" cy="12" r="10"/>'
    '<path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>'
    '<circle cx="12" cy="17" r="0.5" fill="currentColor" stroke="none"/>'
    '</svg>'
)

# — Auto: Sparkles (router decides)
AUTO_ICON_SVG = (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
    '<path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z"/>'
    '</svg>'
)

# Backward compat aliases
RADAR_ICON_SVG = RESEARCH_ICON_SVG
LIFEBUOY_ICON_SVG = HELP_ICON_SVG


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
    color='#8E8E93',
    icon_type='svg',
    icon_svg=TUTOR_ICON_SVG,
    badge_logo='anki',
    # Configuration
    enabled_key='tutor_enabled',
    is_default=True,
    # Channel
    channel='session',
    uses_rag=True,
    # Execution
    run_module='ai.tutor',
    run_function='run_tutor',
    # Tools
    tools=[
        'search_deck',
        'show_card',
        'show_card_media',
        'search_image',
        'create_mermaid_diagram',
        'get_learning_stats',
    ],
    # Context
    context_sources=[
        'card', 'card_review', 'insights', 'rag',
        'session', 'deck_info', 'memory',
    ],
    # Labels
    pipeline_label='Tutor',
    reasoning_steps=[
        {'id': 'sql_search', 'label': 'Keyword-Suche'},
        {'id': 'semantic_search', 'label': 'Semantische Suche'},
        {'id': 'merge', 'label': 'Zusammenführung'},
        {'id': 'web_search', 'label': 'Web-Recherche'},
    ],
    loading_hint_template='Suche in deinen Karten...',
    # Agent Studio UI
    widget_type='embeddings',
    submenu_label='Tutor konfigurieren',
    submenu_component='',
    tools_configurable=True,
    # Model slots
    premium_model='gemini-3-flash-preview',
    fast_model='gemini-2.5-flash',
    fallback_model='gemini-2.5-flash',
    # Workflows (quiz moved to Prüfer agent)
    workflows=[
        Workflow(
            name='explain',
            label='Erklären & Vertiefen',
            description='Erklärt Konzepte, zeigt Zusammenhänge und vertieft nach dem Aufdecken der Karte',
            mode='on',
            triggers=[Slot(ref='card_answer_shown', mode='locked'), Slot(ref='chat', mode='on')],
            tools=[
                Slot(ref='search_deck', mode='locked'),
                Slot(ref='search_image', mode='on'),
                Slot(ref='create_mermaid_diagram', mode='on'),
                Slot(ref='get_learning_stats', mode='on'),
            ],
            outputs=[Slot(ref='chat_response', mode='locked'), Slot(ref='widget', mode='on')],
        ),
        Workflow(
            name='exam',
            label='Prüfungsmodus',
            description='Simuliert Prüfungsbedingungen mit Zeitlimit und Auswertung',
            status='soon',
            mode='off',
            triggers=[], tools=[], outputs=[],
        ),
    ],
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
    icon_svg=RESEARCH_ICON_SVG,
    badge_logo='',
    # Configuration
    enabled_key='research_enabled',
    # Channel
    channel='stapel',
    uses_rag=False,  # Stapel pipeline (SearchCardsThread) has its own search, doesn't use analyze_query()
    # Execution
    # Note: run_research() is the legacy chat path. The primary Research
    # pipeline is SearchCardsThread in ui/widget.py (agent-kanal-paradigma).
    run_module='research',
    run_function='run_research',
    # Tools
    tools=['search_pubmed', 'search_wikipedia', 'search_perplexity'],
    # Context
    context_sources=['session', 'deck_info', 'memory'],
    # Routing
    main_model_hint='',
    # Labels
    pipeline_label='Research',
    reasoning_steps=[
        {'id': 'web_search', 'label': 'Web-Recherche'},
        {'id': 'summarize', 'label': 'Zusammenfassung'},
    ],
    loading_hint_template='Durchsuche Quellen zu {query}...',
    # Agent Studio UI
    widget_type='',
    submenu_label='Quellen konfigurieren',
    submenu_component='researchMenu',
    tools_configurable=True,
    # Workflows
    workflows=[
        Workflow(
            name='web_research',
            label='Web-Recherche',
            description='Recherchiert über Perplexity, PubMed und Wikipedia',
            mode='locked',
            triggers=[Slot(ref='router', mode='locked')],
            tools=[
                Slot(ref='search_perplexity', mode='locked'),
                Slot(ref='search_pubmed', mode='on'),
                Slot(ref='search_wikipedia', mode='on'),
            ],
            outputs=[Slot(ref='chat_response', mode='locked'), Slot(ref='widget', mode='on')],
        ),
        Workflow(
            name='vocab_definition',
            label='Wort-Definition',
            description='Definiert Fachbegriffe bei Klick auf ein Wort',
            status='soon',
            mode='off',
            triggers=[], tools=[], outputs=[],
        ),
    ],
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
    icon_svg=HELP_ICON_SVG,
    badge_logo='',
    # Configuration
    enabled_key='help_enabled',
    # Channel
    channel='plusi',
    uses_rag=False,
    # Execution
    run_module='ai.help_agent',
    run_function='run_help',
    # Tools
    tools=['change_theme', 'change_setting', 'navigate_to', 'explain_feature'],
    # Context
    context_sources=['memory'],
    # Labels
    pipeline_label='Help',
    loading_hint_template='Schaue nach...',
    # Agent Studio UI
    widget_type='',
    submenu_label='Help konfigurieren',
    submenu_component='',
    tools_configurable=True,
    # Model slots
    premium_model='gemini-2.5-flash',
    fast_model='gemini-2.5-flash',
    fallback_model='gemini-2.5-flash',
    # Workflows
    workflows=[
        Workflow(
            name='app_help',
            label='App-Hilfe',
            description='Beantwortet Fragen zur App und hilft bei Einstellungen',
            mode='locked',
            triggers=[Slot(ref='chat', mode='locked')],
            tools=[
                Slot(ref='change_theme', mode='locked'),
                Slot(ref='change_setting', mode='locked'),
                Slot(ref='navigate_to', mode='locked'),
                Slot(ref='explain_feature', mode='locked'),
            ],
            outputs=[Slot(ref='chat_response', mode='locked')],
        ),
    ],
))


# ---------------------------------------------------------------------------
# Prufer -- Reviewer Inline Channel
# ---------------------------------------------------------------------------

_PRUFER_ICON = ''.join([
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" ',
    'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">',
    '<path d="M9 11l3 3L22 4"/>',
    '<path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    '</svg>',
])

register_agent(AgentDefinition(
    name='prufer',
    label='Prufer',
    description='Bewertet Antworten und generiert Multiple-Choice-Fragen',
    # Visual
    color='#AF52DE',
    icon_type='svg',
    icon_svg=_PRUFER_ICON,
    # Channel binding
    channel='reviewer-inline',
    uses_rag=False,
    # Configuration
    enabled_key='prufer_enabled',
    is_default=False,
    # Execution
    run_module='ai.prufer',
    run_function='run_prufer',
    # Tools (future -- for now evaluation is prompt-based)
    tools=[],
    context_sources=[],
    # UI
    pipeline_label='Prufer',
    loading_hint_template='Prufer bewertet...',
    # Model -- uses default model from handler
    premium_model='',
    fast_model='',
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
    # Channel
    channel='plusi',
    uses_rag=False,
    # Execution
    run_module='plusi.agent',
    run_function='run_plusi',
    # Tools
    tools=['diary_write', 'reflect', 'mood_update'],
    # Context
    context_sources=['memory', 'agent_state'],
    # Routing
    main_model_hint=(
        'Use spawn_plusi tool ONLY when: (1) user explicitly mentions Plusi by name, '
        '(2) the interaction is purely emotional/personal with no factual question, '
        '(3) user is celebrating or frustrated and a personal reaction fits better than a factual answer. '
        'Do NOT spawn Plusi when: the user asks "explain X", "what is Y", wants a quiz, '
        'or any question that needs RAG/card context. A frustrated user asking "I don\'t understand enzymes" '
        'needs an explanation, not Plusi.'
    ),
    on_finished=_plusi_on_finished,
    # Labels
    pipeline_label='Plusi',
    loading_hint_template='Plusi denkt nach...',
    # Agent Studio UI
    widget_type='budget',
    submenu_label='Persönlichkeit & Tagebuch',
    submenu_component='plusiMenu',
    tools_configurable=False,
    # Model slots
    premium_model='claude-sonnet',
    fast_model='gemini-2.5-flash',
    fallback_model='gemini-2.5-flash',
    # Workflows (Plusi)
    workflows=[
        Workflow(
            name='autonomous',
            label='Autonomes Denken',
            description='Plusi denkt eigenständig nach, reflektiert und entwickelt sich weiter',
            mode='locked',
            triggers=[Slot(ref='timer', mode='locked'), Slot(ref='mood_event', mode='on')],
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
            triggers=[Slot(ref='chat', mode='on')],
            tools=[Slot(ref='respond', mode='locked'), Slot(ref='humor', mode='on')],
            outputs=[Slot(ref='chat_response', mode='locked'), Slot(ref='emotion', mode='on')],
        ),
    ],
))


# ── Definition Agent ──

register_agent(AgentDefinition(
    name='definition',
    label='Definition',
    description='Generiert Definitionen fuer Fachbegriffe aus Karteninhalt',
    color='#8E8E93',
    icon_type='none',
    channel='reviewer-term',
    uses_rag=False,
    run_module='ai.definition',
    run_function='run_definition',
    tools=[],
    context_sources=['card', 'memory'],
    is_default=False,
    enabled_key='definition_enabled',
    premium_model='gemini-2.5-flash',
    fast_model='gemini-2.5-flash',
    fallback_model='gemini-2.5-flash',
))
