"""Router — the brain of the agentic platform.

Three-level routing decides which agent handles each user message:
  Level 1: Explicit signals (0ms) — @mentions, lock mode
  Level 2: State-based heuristics (0ms) — keyword patterns
  Level 3: LLM routing (~300ms) — Gemini Flash for ambiguous messages
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


def _recover_partial_json(text: str) -> dict:
    """Extract key fields from truncated/malformed JSON using regex."""
    result = {}
    # Extract simple string fields
    for key in ('agent', 'reasoning', 'retrieval_mode', 'response_length',
                'max_sources', 'search_scope'):
        m = re.search(r'"%s"\s*:\s*"([^"]*)"' % key, text)
        if m:
            result[key] = m.group(1)
    # Extract boolean fields
    m = re.search(r'"search_needed"\s*:\s*(true|false)', text, re.IGNORECASE)
    if m:
        result['search_needed'] = m.group(1).lower() == 'true'
    # Extract array fields
    for key in ('precise_queries', 'broad_queries', 'embedding_queries'):
        m = re.search(r'"%s"\s*:\s*\[([^\]]*)\]' % key, text)
        if m:
            items = re.findall(r'"([^"]*)"', m.group(1))
            if items:
                result[key] = items
    # Default to tutor with search if nothing was recovered
    result.setdefault('agent', 'tutor')
    result.setdefault('search_needed', True)
    result.setdefault('retrieval_mode', 'both')
    result.setdefault('search_scope', 'current_deck')
    logger.info("Unified router: recovered from truncated JSON: %s", result.get('agent'))
    return result


def unified_route(user_message: str, session_context: dict, config: dict,
                  card_context=None, chat_history=None) -> UnifiedRoutingResult:
    """Level 3: Unified LLM routing — agent selection + search strategy in one call."""
    if _requests is None:
        return UnifiedRoutingResult(agent='tutor', method='default',
                                    reasoning='requests module not available',
                                    search_needed=True, retrieval_mode='both',
                                    search_scope='current_deck')

    api_key = config.get('api_key', '')
    if not api_key:
        return UnifiedRoutingResult(agent='tutor', method='default',
                                    reasoning='No API key',
                                    search_needed=True, retrieval_mode='both',
                                    search_scope='current_deck')

    router_model = config.get('router_model', 'gemini-2.5-flash')

    # Build agent descriptions
    try:
        from ..ai.agents import get_non_default_agents
    except ImportError:
        from ai.agents import get_non_default_agents

    enabled = get_non_default_agents(config)
    agent_descriptions = '\n'.join(
        '- %s: %s' % (a.name, a.router_hint) for a in enabled if a.router_hint
    )

    # Build card context string
    card_str = 'Keine Karte aktiv.'
    if card_context and card_context.get('cardId'):
        q = card_context.get('question') or card_context.get('frontField') or ''
        a = card_context.get('answer') or ''
        q_clean = re.sub(r'<[^>]+>', ' ', q).strip()[:500]
        a_clean = re.sub(r'<[^>]+>', ' ', a).strip()[:500]
        deck = card_context.get('deckName', '')
        tags = ', '.join(card_context.get('tags', [])) or 'keine'
        card_str = (
            'Aktuelle Karte:\n'
            '- Frage: %s\n'
            '- Antwort: %s\n'
            '- Deck: %s\n'
            '- Tags: %s'
        ) % (q_clean or 'LEER', a_clean or 'LEER', deck or 'unbekannt', tags)

    # Build chat history string (last 4 messages)
    history_str = 'Kein Chatverlauf.'
    if chat_history:
        recent = chat_history[-4:]
        lines = []
        for msg in recent:
            role = msg.get('role', 'user')
            text = (msg.get('content') or msg.get('text') or '')[:200]
            if text:
                lines.append('%s: %s' % (role, text))
        if lines:
            history_str = 'Letzter Chatverlauf:\n' + '\n'.join(lines)

    mode = session_context.get('mode', 'free_chat')
    deck_name = session_context.get('deck_name', '')

    # Build compact card hint (just keywords, not full content)
    card_hint = ''
    if card_context and card_context.get('cardId'):
        q = card_context.get('frontField') or card_context.get('question') or ''
        q_clean = re.sub(r'<[^>]+>', ' ', q).strip()[:200]
        deck = card_context.get('deckName', '')
        if q_clean:
            card_hint = 'Karte: %s (Deck: %s)' % (q_clean, deck)

    prompt = '''Route diese Nachricht zum richtigen Agent. Antworte NUR mit einem JSON-Objekt.

Agenten: tutor (Default, Lernfragen), %s
Regeln: tutor im Zweifel. Andere NUR wenn eindeutig kein Lernthema.

%sModus: %s
Nachricht: "%s"

Antwort-Schema:
{"agent":"tutor","search_needed":true,"precise_queries":["keyword1 keyword2"],"broad_queries":["keyword1 OR keyword2"],"search_scope":"current_deck","response_length":"medium"}''' % (
        agent_descriptions or 'research (externe Quellen), help (App-Hilfe), plusi (persoenlich)',
        (card_hint + '\n') if card_hint else '',
        mode,
        user_message[:300],
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
                'maxOutputTokens': 512,
                'responseMimeType': 'application/json',
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

        text = ''
        if 'candidates' in result and result['candidates']:
            parts = result['candidates'][0].get('content', {}).get('parts', [])
            if parts:
                text = parts[0].get('text', '').strip()

        if not text:
            logger.warning("Unified router: empty LLM response")
            return UnifiedRoutingResult(agent='tutor', method='default',
                                        reasoning='Empty LLM response',
                                        search_needed=True, retrieval_mode='both',
                                        search_scope='current_deck')

        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            # Robust recovery: extract fields from truncated JSON
            logger.warning("Unified router: JSON parse failed, attempting recovery from: %s", text[:120])
            parsed = _recover_partial_json(text)
        agent = parsed.get('agent', 'tutor').lower()

        # Validate agent
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
            retrieval_mode=parsed.get('retrieval_mode') or 'both',
            response_length=parsed.get('response_length') or 'medium',
            max_sources=parsed.get('max_sources') or 'medium',
            search_scope=parsed.get('search_scope') or 'current_deck',
            precise_queries=parsed.get('precise_queries'),
            broad_queries=parsed.get('broad_queries'),
            embedding_queries=parsed.get('embedding_queries'),
        )

    except Exception as e:
        logger.warning("Unified router LLM call failed: %s", e)
        return UnifiedRoutingResult(agent='tutor', method='default',
                                    reasoning='LLM routing failed: %s' % e,
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
      Level 3: Unified LLM routing (~300ms) -- Gemini Flash for ambiguous messages
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
