"""Router — the brain of the agentic platform.

Three-level routing decides which agent handles each user message:
  Level 1: Explicit signals (0ms) — @mentions, lock mode
  Level 2: State-based heuristics (0ms) — keyword patterns
  Level 3: LLM routing (~300ms) — Gemini Flash for ambiguous messages
  Default: Tutor (if nothing matches)
"""

import re
from dataclasses import dataclass
from typing import Optional

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# RoutingResult
# ---------------------------------------------------------------------------

@dataclass
class RoutingResult:
    """Result of routing a user message to an agent."""
    agent: str                              # 'tutor', 'research', 'help', 'plusi'
    method: str                             # 'lock', 'mention', 'heuristic', 'llm', 'default'
    clean_message: Optional[str] = None     # Message with @mention stripped
    reasoning: str = ''                     # Why this agent was chosen (for UI/debug)


# ---------------------------------------------------------------------------
# Level 1 — Explicit signals (0ms, no LLM)
# ---------------------------------------------------------------------------

def _check_lock_mode(session_context: dict) -> Optional[RoutingResult]:
    """If user has locked to a specific agent, route there."""
    locked = session_context.get('locked_agent')
    if locked:
        return RoutingResult(agent=locked, method='lock')
    return None


def _detect_agent_mention(user_message: str, config: dict) -> Optional[RoutingResult]:
    """Detect @Name or @Label patterns at start of message."""
    try:
        from ..ai.agents import get_enabled_agents
    except ImportError:
        from ai.agents import get_enabled_agents

    enabled = get_enabled_agents(config)
    for agent in enabled:
        if agent.is_default:
            continue  # Don't match @Tutor
        # Match @name or @label at start of message
        patterns = [agent.name, agent.label]
        for pattern in patterns:
            regex = re.compile(r'^@' + re.escape(pattern) + r'\b\s*', re.IGNORECASE)
            match = regex.match(user_message)
            if match:
                clean = user_message[match.end():].strip()
                return RoutingResult(
                    agent=agent.name,
                    method='mention',
                    clean_message=clean or user_message,
                    reasoning='@%s mention detected' % agent.label,
                )
    return None


# ---------------------------------------------------------------------------
# Level 2 — State-based heuristics (0ms, no LLM)
# ---------------------------------------------------------------------------

# Help agent keyword patterns (settings, app navigation)
_HELP_PATTERNS = [
    'dark mode', 'light mode', 'einstellung', 'settings',
    'wie komme ich', 'wo finde ich', 'wie funktioniert die app',
    'theme ändern', 'design ändern',
]


def _check_heuristics(user_message: str, session_context: dict, config: dict) -> Optional[RoutingResult]:
    """Keyword-based routing for clear-cut cases."""
    msg_lower = user_message.lower().strip()

    # Help agent patterns (settings, app navigation)
    if config.get('help_enabled') and any(p in msg_lower for p in _HELP_PATTERNS):
        return RoutingResult(
            agent='help',
            method='heuristic',
            reasoning='App/settings keyword detected',
        )

    # Note: Plusi heuristic is deliberately NOT here.
    # Emotional messages often contain factual questions too.
    # Plusi routing should only happen via @mention or LLM routing.

    return None


# ---------------------------------------------------------------------------
# Level 3 — LLM routing (~300ms)
# ---------------------------------------------------------------------------

_LLM_TIMEOUT_SECONDS = 5


def _llm_route(user_message: str, session_context: dict, config: dict) -> RoutingResult:
    """Use Gemini Flash to classify ambiguous messages.

    Returns RoutingResult — always succeeds (defaults to tutor on failure).
    """
    try:
        import requests as _requests
    except ImportError:
        return RoutingResult(agent='tutor', method='default',
                             reasoning='requests module not available')

    # Only attempt if we have an API key
    api_key = config.get('api_key', '')
    if not api_key:
        return RoutingResult(agent='tutor', method='default',
                             reasoning='No API key for LLM routing')

    router_model = config.get('router_model', 'gemini-2.5-flash')

    # Build agent descriptions for the prompt
    try:
        from ..ai.agents import get_non_default_agents
    except ImportError:
        from ai.agents import get_non_default_agents

    enabled = get_non_default_agents(config)
    if not enabled:
        return RoutingResult(agent='tutor', method='default',
                             reasoning='No non-default agents enabled')

    agent_descriptions = '\n'.join(
        '- %s: %s' % (a.name, a.router_hint) for a in enabled if a.router_hint
    )

    mode = session_context.get('mode', 'free_chat')
    deck_name = session_context.get('deck_name', '')
    has_card = session_context.get('has_card', False)

    prompt = (
        'Du bist der Router eines agentischen Lernsystems.\n'
        'Entscheide welcher Agent diese Nachricht bearbeiten soll.\n'
        '\n'
        'Verfügbare Agenten:\n'
        '- tutor: Default. Beantwortet Lernfragen basierend auf Anki-Karten. '
        'Wähle tutor wenn unklar.\n'
        '%s\n'
        '\n'
        'Aktueller Kontext:\n'
        '- Modus: %s\n'
        '- Deck: %s\n'
        '- Karte aktiv: %s\n'
        '\n'
        'Regeln:\n'
        '1. Tutor ist der Default. Wähle einen anderen Agent NUR wenn klar ist, '
        'dass die Anfrage NICHT ins Lerngebiet fällt.\n'
        '2. Research NUR wenn User explizit nach Quellen/Papers fragt.\n'
        '3. Help NUR für App-Bedienung und Einstellungen.\n'
        '4. Plusi NUR für persönliche/emotionale Interaktion ohne Fachfrage.\n'
        '5. Im Zweifel: tutor.\n'
        '\n'
        'Antworte mit EXAKT einer Zeile:\n'
        'AGENT: <name>\n'
        '\n'
        'Nachricht: "%s"'
    ) % (
        agent_descriptions,
        mode,
        deck_name or 'keins',
        'ja' if has_card else 'nein',
        user_message[:500],
    )

    try:
        url = (
            'https://generativelanguage.googleapis.com/v1beta/models/'
            '%s:generateContent?key=%s' % (router_model, api_key)
        )
        data = {
            'contents': [{'role': 'user', 'parts': [{'text': prompt}]}],
            'generationConfig': {
                'temperature': 0.0,
                'maxOutputTokens': 50,
            },
        }
        response = _requests.post(
            url,
            json=data,
            headers={'Content-Type': 'application/json'},
            timeout=_LLM_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        result = response.json()

        # Parse response
        text = ''
        if 'candidates' in result and result['candidates']:
            parts = result['candidates'][0].get('content', {}).get('parts', [])
            if parts:
                text = parts[0].get('text', '').strip()

        # Extract agent name from "AGENT: <name>" format
        match = re.search(r'AGENT:\s*(\w+)', text, re.IGNORECASE)
        if match:
            agent_name = match.group(1).lower()
            # Validate agent exists and is enabled
            try:
                from ..ai.agents import get_agent
            except ImportError:
                from ai.agents import get_agent

            agent = get_agent(agent_name)
            if agent and (agent.is_default or config.get(agent.enabled_key, False)):
                return RoutingResult(
                    agent=agent_name,
                    method='llm',
                    reasoning='LLM routed to %s' % agent_name,
                )

        # LLM response didn't parse -> default to tutor
        logger.warning("Router LLM response unparseable: %s", text[:100])
        return RoutingResult(agent='tutor', method='default',
                             reasoning='LLM response unparseable')

    except Exception as e:
        logger.warning("Router LLM call failed: %s", e)
        return RoutingResult(agent='tutor', method='default',
                             reasoning='LLM routing failed: %s' % e)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def route_message(user_message: str, session_context: dict, config: dict) -> RoutingResult:
    """Route a user message to the appropriate agent.

    Three-level routing:
      Level 1: Explicit signals (0ms, no LLM) -- @mentions, lock mode
      Level 2: State-based heuristics (0ms, no LLM) -- keyword patterns
      Level 3: LLM routing (~300ms) -- Gemini Flash for ambiguous messages

    Default: Tutor (if nothing matches)

    Args:
        user_message: The original user message.
        session_context: Dict with keys:
            - locked_agent: str or None (if user locked to an agent)
            - mode: str ('card_session', 'free_chat', 'deck_browser')
            - deck_name: str
            - has_card: bool
        config: The full config dict.

    Returns:
        RoutingResult with agent name, routing method, and optional metadata.
    """
    # Level 1: Lock mode
    result = _check_lock_mode(session_context)
    if result:
        return result

    # Level 1: @mention
    result = _detect_agent_mention(user_message, config)
    if result:
        return result

    # Level 2: Heuristics
    result = _check_heuristics(user_message, session_context, config)
    if result:
        return result

    # Level 3: LLM routing (only for non-trivial cases)
    # Skip LLM routing if only Tutor is enabled (no other agents to route to)
    try:
        from ..ai.agents import get_non_default_agents
    except ImportError:
        from ai.agents import get_non_default_agents

    if get_non_default_agents(config):
        result = _llm_route(user_message, session_context, config)
        if result.agent != 'tutor':
            return result
        # LLM said tutor -> fall through to default

    # Default: Tutor
    return RoutingResult(agent='tutor', method='default')
