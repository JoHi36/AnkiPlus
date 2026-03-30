"""RAG Query Analyzer — determines HOW to search, not WHO answers.

Extracted from router.py. Calls the backend /router endpoint but only uses
the RAG-relevant fields (search_needed, resolved_intent, retrieval_mode,
search_scope). The agent field from the backend response is ignored.
"""

import re
from dataclasses import dataclass

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

_LLM_TIMEOUT_SECONDS = 10


@dataclass
class RagAnalysis:
    """RAG pipeline parameters — how to search the user's cards and web."""
    search_needed: bool = True
    resolved_intent: str = ''
    retrieval_mode: str = 'both'
    search_scope: str = 'current_deck'
    response_length: str = 'medium'


# Backwards compat alias
UnifiedRoutingResult = RagAnalysis


def analyze_query(user_message, card_context=None, chat_history=None,
                  config=None, auth_token=None) -> RagAnalysis:
    """Analyze a user query for RAG parameters via backend LLM call.

    Calls the backend /router endpoint and extracts only RAG-relevant fields.
    The agent field from the response is intentionally ignored.

    Args:
        user_message: The user's question.
        card_context: Optional card data dict (cardId, question, deckName).
        chat_history: Optional list of recent message dicts.
        config: Optional config dict (unused currently, reserved).
        auth_token: Optional override for auth token.

    Returns:
        RagAnalysis with search parameters.
    """
    _default = RagAnalysis()

    if _requests is None:
        return _default

    backend_url = get_backend_url()
    _token = auth_token or get_auth_token()
    if not backend_url or not _token:
        return _default

    compact_card = {}
    if card_context and card_context.get('cardId'):
        q = card_context.get('frontField') or card_context.get('question') or ''
        q_clean = re.sub(r'<[^>]+>', ' ', q).strip()[:500]
        compact_card = {
            'question': q_clean,
            'deckName': card_context.get('deckName', ''),
        }

    last_assistant = ''
    if chat_history:
        for msg in reversed(chat_history):
            if msg.get('role') == 'assistant':
                last_assistant = (msg.get('content') or msg.get('text') or '')[:300]
                break

    try:
        url = '%s/router' % backend_url.rstrip('/')
        payload = {
            'message': (user_message or '')[:500],
            'cardContext': compact_card,
            'lastAssistantMessage': last_assistant,
        }
        response = _requests.post(
            url,
            json=payload,
            headers={
                'Content-Type': 'application/json',
                'Authorization': 'Bearer %s' % _token,
            },
            timeout=_LLM_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        parsed = response.json()

        return RagAnalysis(
            search_needed=parsed.get('search_needed', True),
            resolved_intent=parsed.get('resolved_intent') or '',
            retrieval_mode=parsed.get('retrieval_mode') or 'both',
            search_scope=parsed.get('search_scope') or 'current_deck',
            response_length=parsed.get('response_length') or 'medium',
        )

    except Exception as e:
        logger.warning("RAG analyze_query failed: %s", e)
        return _default
