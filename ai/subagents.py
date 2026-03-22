"""DEPRECATED — backward-compat wrapper around ai.agents.

All agent definitions and logic now live in ai/agents.py.
This module re-exports the old names (SubagentDefinition, SUBAGENT_REGISTRY, etc.)
so existing consumers continue to work without modification.

Do NOT add new code here — use ai/agents.py instead.
"""
from typing import Callable

try:
    from .agents import (
        AgentDefinition as SubagentDefinition,
        AGENT_REGISTRY,
        register_agent,
        get_non_default_agents,
        get_router_subagent_prompt,
        get_main_model_subagent_prompt,
        lazy_load_run_fn,
        get_registry_for_frontend as _agents_get_registry_for_frontend,
        RADAR_ICON_SVG,
    )
except ImportError:
    from agents import (
        AgentDefinition as SubagentDefinition,
        AGENT_REGISTRY,
        register_agent,
        get_non_default_agents,
        get_router_subagent_prompt,
        get_main_model_subagent_prompt,
        lazy_load_run_fn,
        get_registry_for_frontend as _agents_get_registry_for_frontend,
        RADAR_ICON_SVG,
    )

# ── Backward-compat aliases ──

# SUBAGENT_REGISTRY is the same object as AGENT_REGISTRY —
# consumers only ever look up agents by name, so having the default
# agent (Tutor) present does not break anything.
SUBAGENT_REGISTRY = AGENT_REGISTRY


def register_subagent(definition: SubagentDefinition):
    """Register an agent. Delegates to agents.register_agent()."""
    register_agent(definition)


def get_enabled_subagents(config: dict) -> list:
    """Return enabled NON-default agents (matches old behavior)."""
    return get_non_default_agents(config)


def get_registry_for_frontend(config: dict) -> list[dict]:
    """Return enabled non-default agents as dicts for JSON serialization.

    The old subagents.py only returned Plusi/Research — never the default
    agent (Tutor). The new agents.get_registry_for_frontend() returns ALL
    enabled agents including the default. This wrapper filters to match
    the old behavior.
    """
    return [
        entry for entry in _agents_get_registry_for_frontend(config)
        if not entry.get('isDefault', False)
    ]
