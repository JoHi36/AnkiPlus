"""
Tutor Agent — the default learning assistant.

Explains card content, searches decks, creates diagrams.
Delegates to the existing RAG pipeline in handler.py.

The Tutor is a wrapper that gives the existing RAG pipeline
a standard agent interface (emit_step, memory). The actual
RAG logic remains in handler.py — this is a deliberate choice
to avoid a risky refactor of 500+ lines of working code.

When the RAG pipeline is eventually extracted into its own module,
this agent will call it directly instead of going through the handler.
"""

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)


def run_tutor(situation, emit_step=None, memory=None,
              rag_context=None, card_context=None,
              memory_context=None, **kwargs):
    """
    Tutor agent entry point.

    Currently a thin wrapper: the actual Tutor logic runs through
    handler.get_response_with_rag() which handles the full RAG pipeline
    (routing, retrieval, generation, handoff). This function is called
    by the handler when the router selects 'tutor' as a non-default
    dispatch, but the primary Tutor path still goes through the
    handler's inline code.

    This file exists to:
    1. Give Tutor a proper agent identity (ai/tutor.py)
    2. Establish the standard agent signature (emit_step, memory)
    3. Serve as the future home of extracted RAG logic

    Args:
        situation: The user's message
        emit_step: Callback for pipeline visualization (step_name, status)
        memory: AgentMemory instance for persistent state
        rag_context: Pre-fetched RAG context (if available)
        card_context: Current card context (frontField, backField, etc.)
        memory_context: Shared memory context string
        **kwargs: Additional agent-specific parameters

    Returns:
        dict with 'text', optionally 'citations', 'sources'
    """
    if emit_step:
        emit_step("Verarbeite Anfrage...", "active")

    # Track usage in memory
    if memory:
        try:
            count = memory.get('total_queries', 0)
            memory.set('total_queries', count + 1)
        except Exception:
            pass

    # For now, return a signal that the handler should use its inline
    # RAG pipeline. This is a transitional pattern.
    #
    # When the handler dispatches to 'tutor' via lazy_load_run_fn(),
    # it currently falls through to the inline RAG code because Tutor
    # was not loadable. With this file, Tutor IS loadable, so we need
    # to tell the handler "use your RAG pipeline for this."
    #
    # We return a special sentinel that handler.py checks.
    return {
        '_use_rag_pipeline': True,
        'situation': situation,
        'card_context': card_context,
        'rag_context': rag_context,
        'memory_context': memory_context,
    }
