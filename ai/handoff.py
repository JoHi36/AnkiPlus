"""Handoff protocol — agents signal continuation to other agents."""

import re
from dataclasses import dataclass
from typing import Optional, List, Tuple

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)


@dataclass
class HandoffRequest:
    """A request from one agent to hand off to another."""
    to: str          # Target agent name ('research')
    reason: str      # Why (shown to user AND used as context)
    query: str       # What to search/ask (passed to target agent)


# Regex patterns for handoff signal at end of response
# Very flexible: works with or without colons, newlines or spaces between fields
_HANDOFF_PATTERN = re.compile(
    r'HANDOFF:?\s*(\w+)\s+'
    r'REASON:?\s*(.+?)\s+'
    r'QUERY:?\s*(.+?)\s*$',
    re.DOTALL
)


def parse_handoff(agent_output: str) -> Tuple[str, Optional[HandoffRequest]]:
    """Parse agent output for a HANDOFF signal.

    Returns:
        Tuple of (clean_output, handoff_request):
        - clean_output: The agent text with HANDOFF lines stripped
        - handoff_request: HandoffRequest if found, None otherwise
    """
    if not agent_output or 'HANDOFF:' not in agent_output:
        return agent_output, None

    match = _HANDOFF_PATTERN.search(agent_output)
    if not match:
        return agent_output, None

    target = match.group(1).strip().lower()
    reason = match.group(2).strip()
    query = match.group(3).strip()

    # Strip the handoff signal from the visible output
    clean = agent_output[:match.start()].rstrip()

    logger.info("Handoff parsed: to=%s, reason=%s, query=%s",
                target, reason[:50], query[:50])

    return clean, HandoffRequest(to=target, reason=reason, query=query)


def validate_handoff(
    request: HandoffRequest,
    current_agent: str,
    chain_history: List[str],
    config: dict,
) -> bool:
    """Validate a handoff request.

    Args:
        request: The handoff request to validate
        current_agent: Name of the agent that made the request
        chain_history: List of agent names already in the chain
        config: Full config dict (for checking agent enabled status)

    Returns:
        True if handoff is approved, False otherwise
    """
    try:
        from .agents import get_agent
    except ImportError:
        from agents import get_agent

    # Check: current agent exists
    agent_def = get_agent(current_agent)
    if not agent_def:
        logger.warning("Handoff rejected: agent '%s' not found", current_agent)
        return False

    # Check: target in allowed list
    if request.to not in agent_def.can_handoff_to:
        logger.warning(
            "Handoff rejected: %s cannot hand off to %s (allowed: %s)",
            current_agent, request.to, agent_def.can_handoff_to)
        return False

    # Check: target agent exists and is enabled
    target_def = get_agent(request.to)
    if not target_def:
        logger.warning("Handoff rejected: target agent '%s' not found",
                       request.to)
        return False

    if not target_def.is_default and not config.get(target_def.enabled_key, False):
        logger.warning("Handoff rejected: target agent '%s' is disabled",
                       request.to)
        return False

    # Check: no cycles
    if request.to in chain_history:
        logger.warning(
            "Handoff rejected: cycle detected — %s already in chain %s",
            request.to, chain_history)
        return False

    # Check: depth limit
    max_depth = config.get('max_chain_depth', 2)
    if len(chain_history) >= max_depth:
        logger.warning(
            "Handoff rejected: max chain depth %d reached (history: %s)",
            max_depth, chain_history)
        return False

    logger.info("Handoff approved: %s -> %s", current_agent, request.to)
    return True
