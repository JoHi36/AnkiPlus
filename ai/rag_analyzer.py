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
    # Query fields — resolved by backend router from card context + chat history
    precise_queries: list = None
    broad_queries: list = None
    embedding_queries: list = None
    associated_terms: list = None  # Domain terms from router (synonyms, related concepts)


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

    # ── [CARD-FLOW 4/5] rag_analyzer received card_context ─────────────────
    # What analyze_query got from handler.get_response_with_rag. Gap between
    # CARD-FLOW 3 and 4 means handler.py did something to the context between
    # the handler log and the analyze_query call (unlikely — they are one
    # statement apart — but logged for completeness).
    if card_context:
        logger.info(
            "[CARD-FLOW 4/5] analyze_query received: cardId=%s noteId=%s deckName=%r keys=%s",
            card_context.get('cardId') if isinstance(card_context, dict) else None,
            card_context.get('noteId') if isinstance(card_context, dict) else None,
            (card_context.get('deckName') if isinstance(card_context, dict) else '') or '',
            sorted(card_context.keys()) if isinstance(card_context, dict) else type(card_context).__name__,
        )
    else:
        logger.warning("[CARD-FLOW 4/5] analyze_query received: card_context=None")

    compact_card = {}
    if card_context and card_context.get('cardId'):
        q = card_context.get('frontField') or card_context.get('question') or ''
        q_clean = re.sub(r'<[^>]+>', ' ', q).strip()[:500]
        compact_card = {
            # cardId + noteId MUST be forwarded to the backend. The /router
            # handler in functions/src/handlers/router.ts gates its cardHint
            # assembly on `cardContext.cardId` — without it, the LLM prompt
            # contains no card content and the router returns a junk
            # "Erklärung des Inhalts der aktuellen Lernkarte" paraphrase.
            'cardId': card_context.get('cardId'),
            'noteId': card_context.get('noteId'),
            'question': q_clean,
            'deckName': card_context.get('deckName', ''),
        }

    last_assistant = ''
    if chat_history:
        for msg in reversed(chat_history):
            if msg.get('role') == 'assistant':
                last_assistant = (msg.get('content') or msg.get('text') or '')[:300]
                break

    # ═══════════════════════════════════════════════════════════════════════
    # [RAG-STATE 1/7] ROUTER — request
    # ═══════════════════════════════════════════════════════════════════════
    logger.info("═════════ [RAG-STATE 1/7] ROUTER CALL ═════════")
    logger.info("[RAG-STATE 1/7] user_message    : %r", (user_message or '')[:200])
    logger.info("[RAG-STATE 1/7] card.question   : %r", compact_card.get('question', '')[:200])
    logger.info("[RAG-STATE 1/7] card.deckName   : %r", compact_card.get('deckName', ''))
    logger.info("[RAG-STATE 1/7] lastAssistant   : %r", last_assistant[:120])

    try:
        url = '%s/router' % backend_url.rstrip('/')
        payload = {
            'message': (user_message or '')[:500],
            'cardContext': compact_card,
            'lastAssistantMessage': last_assistant,
        }

        # ── [CARD-FLOW 5/5] HTTP payload leaving for /router ───────────────
        # LAST checkpoint before the wire. Compare to CARD-FLOW 4:
        # - if cardId was present in CARD-FLOW 4 but compact_card.keys()
        #   does NOT include cardId here → the transformation dropped it.
        #   That transformation is the compact_card = {...} block right above.
        # - Compare this log to the backend [ROUTER 1/5] entry: the keys
        #   in payload['cardContext'] here MUST match what router.ts sees.
        logger.info(
            "[CARD-FLOW 5/5] → POST %s  cardContext.keys=%s cardContext.cardId=%s "
            "message_preview=%r lastAssistant_len=%d",
            url,
            sorted(compact_card.keys()) if compact_card else [],
            compact_card.get('cardId') if isinstance(compact_card, dict) else None,
            (user_message or '')[:120],
            len(last_assistant),
        )

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

        # ═══════════════════════════════════════════════════════════════════
        # [RAG-STATE 1/7] ROUTER — response
        # ═══════════════════════════════════════════════════════════════════
        logger.info("[RAG-STATE 1/7] ← response keys    : %s", sorted(parsed.keys()))
        logger.info("[RAG-STATE 1/7] ← search_needed    : %s", parsed.get('search_needed'))
        logger.info("[RAG-STATE 1/7] ← resolved_intent  : %r", (parsed.get('resolved_intent') or '')[:200])
        logger.info("[RAG-STATE 1/7] ← retrieval_mode   : %s", parsed.get('retrieval_mode'))
        logger.info("[RAG-STATE 1/7] ← search_scope     : %s", parsed.get('search_scope'))
        logger.info("[RAG-STATE 1/7] ← precise_queries  : %s", parsed.get('precise_queries'))
        logger.info("[RAG-STATE 1/7] ← broad_queries    : %s", parsed.get('broad_queries'))
        logger.info("[RAG-STATE 1/7] ← embedding_queries: %s", parsed.get('embedding_queries'))
        logger.info("[RAG-STATE 1/7] ← associated_terms : %s", parsed.get('associated_terms'))
        logger.info("[RAG-STATE 1/7] ← reasoning        : %r", (parsed.get('reasoning') or '')[:200])
        # Diagnostic: does the router treat 'die Karte' / pronouns as literal strings?
        _precise = parsed.get('precise_queries') or []
        _fillers = {'komm', 'man', 'mir', 'die', 'das', 'der', 'ein', 'eine', 'karte', 'erklär', 'erkläre'}
        _filler_hits = [q for q in _precise if isinstance(q, str) and q.strip().lower() in _fillers]
        if _filler_hits:
            logger.warning(
                "[RAG-STATE 1/7] ⚠️  ROUTER RETURNED FILLER-WORD QUERIES: %s — "
                "router failed to resolve meta-reference to current card",
                _filler_hits,
            )

        return RagAnalysis(
            search_needed=parsed.get('search_needed', True),
            resolved_intent=parsed.get('resolved_intent') or '',
            retrieval_mode=parsed.get('retrieval_mode') or 'both',
            search_scope=parsed.get('search_scope') or 'current_deck',
            response_length=parsed.get('response_length') or 'medium',
            precise_queries=parsed.get('precise_queries'),
            broad_queries=parsed.get('broad_queries'),
            embedding_queries=parsed.get('embedding_queries'),
            associated_terms=parsed.get('associated_terms'),
        )

    except Exception as e:
        logger.warning("[RAG-STATE 1/7] ⚠️  Router call failed: %s → using default RagAnalysis", e)
        return _default
