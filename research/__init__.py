"""Research Agent — web search sub-agent."""
try:
    from ..utils.logging import get_logger
    from ..config import get_config
except ImportError:
    from utils.logging import get_logger
    from config import get_config

logger = get_logger(__name__)


def run_research(situation: str = '', emit_step=None, memory=None, **kwargs) -> dict:
    """Entry point called by the sub-agent system."""
    from .search import search

    query = situation or kwargs.get('query', '')

    config = get_config()
    api_key = config.get('openrouter_api_key', '')
    enabled_sources = config.get('research_sources', {'pubmed': True, 'wikipedia': True})

    logger.info("Research Agent searching: %s", query[:80])
    result = search(query, api_key=api_key, enabled_sources=enabled_sources)

    if result.error:
        logger.warning("Research Agent error: %s", result.error)
    else:
        logger.info("Research Agent found %d sources via %s",
                     len(result.sources), result.tool_used)

    return result.to_dict()
