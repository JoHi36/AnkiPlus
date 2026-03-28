"""Router — the brain of the agentic platform.

Three-level routing decides which agent handles each user message:
  Level 1: Explicit signals (0ms) — @mentions, lock mode
  Level 2: State-based heuristics (0ms) — keyword patterns
  Level 3: Backend /router call (~300ms) — LLM routing via backend
  Default: Tutor (if nothing matches)
"""

import re
import json
from dataclasses import dataclass
from typing import Optional

try:
    import requests as _requests
except ImportError:
    _requests = None

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

try:
    from ..config import get_backend_url, get_auth_token
except ImportError:
    from config import get_backend_url, get_auth_token

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# UnifiedRoutingResult
# ---------------------------------------------------------------------------

@dataclass
class UnifiedRoutingResult:
    """Result of routing a user message — agent decision + optional search strategy."""
    agent: str                              # 'tutor', 'research', 'help', 'plusi'
    method: str                             # 'lock', 'mention', 'heuristic', 'llm', 'default'
    clean_message: Optional[str] = None     # Message with @mention stripped
    reasoning: str = ''                     # Why this agent was chosen
    # Search strategy (populated when agent='tutor' and method='llm')
    search_needed: Optional[bool] = None
    resolved_intent: Optional[str] = None   # Router's interpretation of user's question
    retrieval_mode: Optional[str] = None    # 'sql', 'semantic', 'both'
    response_length: Optional[str] = None   # 'short', 'medium', 'long'
    max_sources: Optional[str] = None       # 'low', 'medium', 'high'
    search_scope: Optional[str] = None      # 'current_deck', 'collection'
    precise_queries: Optional[list] = None
    broad_queries: Optional[list] = None
    embedding_queries: Optional[list] = None

# Backwards-compatible alias
RoutingResult = UnifiedRoutingResult


# ---------------------------------------------------------------------------
# Level 1 — Explicit signals (0ms, no LLM)
# ---------------------------------------------------------------------------

def _check_lock_mode(session_context: dict) -> Optional[UnifiedRoutingResult]:
    """If user has locked to a specific agent, route there."""
    locked = session_context.get('locked_agent')
    if locked:
        return UnifiedRoutingResult(agent=locked, method='lock')
    return None


def _detect_agent_mention(user_message: str, config: dict) -> Optional[UnifiedRoutingResult]:
    """Detect @Name or @Label patterns at start of message."""
    try:
        from ..ai.agents import get_enabled_agents
    except ImportError:
        from ai.agents import get_enabled_agents

    enabled = get_enabled_agents(config)
    for agent in enabled:
        # Match @name or @label at start of message
        patterns = [agent.name, agent.label]
        for pattern in patterns:
            regex = re.compile(r'^@' + re.escape(pattern) + r'\b\s*', re.IGNORECASE)
            match = regex.match(user_message)
            if match:
                clean = user_message[match.end():].strip()
                return UnifiedRoutingResult(
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


def _check_heuristics(user_message: str, session_context: dict, config: dict) -> Optional[UnifiedRoutingResult]:
    """Keyword-based routing for clear-cut cases."""
    msg_lower = user_message.lower().strip()

    # Help agent patterns (settings, app navigation)
    if config.get('help_enabled') and any(p in msg_lower for p in _HELP_PATTERNS):
        return UnifiedRoutingResult(
            agent='help',
            method='heuristic',
            reasoning='App/settings keyword detected',
        )

    # Plusi: direct name mention at start of message (not embedded in a question)
    if re.match(r'^(?:hey\s+)?plusi\b', msg_lower):
        return UnifiedRoutingResult(
            agent='plusi',
            method='heuristic',
            reasoning='Plusi name at start of message',
        )

    return None


# ---------------------------------------------------------------------------
# Level 3 — Unified LLM routing (~300ms)
# ---------------------------------------------------------------------------

_LLM_TIMEOUT_SECONDS = 10


def unified_route(user_message: str, session_context: dict, config: dict,
                  card_context=None, chat_history=None) -> UnifiedRoutingResult:
    """Level 3: Backend /router call — agent selection + search strategy."""
    if _requests is None:
        return UnifiedRoutingResult(agent='tutor', method='default',
                                    reasoning='requests module not available',
                                    search_needed=True, retrieval_mode='both',
                                    search_scope='current_deck')

    backend_url = get_backend_url()
    auth_token = get_auth_token()
    if not backend_url or not auth_token:
        return UnifiedRoutingResult(agent='tutor', method='default',
                                    reasoning='No backend URL or auth token',
                                    search_needed=True, retrieval_mode='both',
                                    search_scope='current_deck')

    # Build compact card context for backend
    compact_card = {}
    if card_context and card_context.get('cardId'):
        q = card_context.get('frontField') or card_context.get('question') or ''
        q_clean = re.sub(r'<[^>]+>', ' ', q).strip()[:500]
        compact_card = {
            'question': q_clean,
            'deckName': card_context.get('deckName', ''),
        }

    # Extract last assistant message from chat history
    last_assistant = ''
    if chat_history:
        for msg in reversed(chat_history):
            if msg.get('role') == 'assistant':
                last_assistant = (msg.get('content') or msg.get('text') or '')[:300]
                break

    try:
        url = '%s/router' % backend_url.rstrip('/')
        payload = {
            'message': user_message[:500],
            'cardContext': compact_card,
            'lastAssistantMessage': last_assistant,
        }
        response = _requests.post(
            url,
            json=payload,
            headers={
                'Content-Type': 'application/json',
                'Authorization': 'Bearer %s' % auth_token,
            },
            timeout=_LLM_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        parsed = response.json()

        agent = parsed.get('agent', 'tutor').lower()

        # Validate agent exists in registry
        try:
            from ..ai.agents import get_agent
        except ImportError:
            from ai.agents import get_agent

        agent_def = get_agent(agent)
        if not agent_def:
            agent = 'tutor'

        # For tutor, default search_needed to True if not explicitly set
        search_needed = parsed.get('search_needed')
        if search_needed is None and agent == 'tutor':
            search_needed = True

        return UnifiedRoutingResult(
            agent=agent,
            method='llm',
            reasoning=parsed.get('reasoning', ''),
            search_needed=search_needed,
            resolved_intent=parsed.get('resolved_intent'),
            # Backend v2 returns only agent/search_needed/resolved_intent.
            # Legacy fields kept for backwards compat with old backend versions.
            retrieval_mode=parsed.get('retrieval_mode') or 'both',
            response_length=parsed.get('response_length') or 'medium',
            max_sources=parsed.get('max_sources') or 'medium',
            search_scope=parsed.get('search_scope') or 'collection',
            precise_queries=parsed.get('precise_queries'),
            broad_queries=parsed.get('broad_queries'),
            embedding_queries=parsed.get('embedding_queries'),
        )

    except Exception as e:
        logger.warning("Backend /router call failed: %s", e)
        return UnifiedRoutingResult(agent='tutor', method='default',
                                    reasoning='Backend routing failed: %s' % e,
                                    search_needed=True, retrieval_mode='both',
                                    search_scope='current_deck')


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def route_message(user_message: str, session_context: dict, config: dict,
                  card_context=None, chat_history=None) -> UnifiedRoutingResult:
    """Route a user message to the appropriate agent.

    Three-level routing:
      Level 1: Explicit signals (0ms, no LLM) -- @mentions, lock mode
      Level 2: State-based heuristics (0ms, no LLM) -- keyword patterns
      Level 3: Backend /router call (~300ms) -- LLM routing via backend
        Decides agent selection AND search strategy in one call.

    Default: Tutor (if nothing matches)

    Args:
        user_message: The original user message.
        session_context: Dict with keys:
            - locked_agent: str or None (if user locked to an agent)
            - mode: str ('card_session', 'free_chat', 'deck_browser')
            - deck_name: str
            - has_card: bool
        config: The full config dict.
        card_context: Optional card data dict (cardId, question, answer, deckName, tags).
        chat_history: Optional list of recent message dicts (role, content).

    Returns:
        UnifiedRoutingResult with agent name, routing method, and optional search strategy.
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

    # Level 3: Unified LLM routing (agent + search strategy)
    try:
        from ..ai.agents import get_non_default_agents
    except ImportError:
        from ai.agents import get_non_default_agents

    if get_non_default_agents(config):
        result = unified_route(user_message, session_context, config,
                               card_context=card_context,
                               chat_history=chat_history)
        return result

    # Default: Tutor (no non-default agents enabled)
    return UnifiedRoutingResult(agent='tutor', method='default',
                                search_needed=True, retrieval_mode='both',
                                search_scope='current_deck')
