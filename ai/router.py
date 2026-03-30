"""Router — DEPRECATED. Agent routing removed (agent-kanal-paradigma).

RAG query analysis moved to ai/rag_analyzer.py.
This file kept for backwards compatibility only.
"""

# Re-export for any code that still imports from router
try:
    from ..ai.rag_analyzer import RagAnalysis as UnifiedRoutingResult, analyze_query
except ImportError:
    try:
        from ai.rag_analyzer import RagAnalysis as UnifiedRoutingResult, analyze_query
    except ImportError:
        from rag_analyzer import RagAnalysis as UnifiedRoutingResult, analyze_query

RoutingResult = UnifiedRoutingResult


def route_message(user_message, session_context=None, config=None,
                  card_context=None, chat_history=None):
    """DEPRECATED — calls analyze_query() and wraps result."""
    return analyze_query(
        user_message=user_message,
        card_context=card_context,
        chat_history=chat_history,
    )
