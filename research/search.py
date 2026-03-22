"""Multi-tool search orchestrator — selects best source for the query."""
import re

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

from .types import Source, ResearchResult

logger = get_logger(__name__)

MEDICAL_KEYWORDS = {
    'pubmed', 'studie', 'study', 'clinical', 'klinisch', 'pathologie',
    'diagnose', 'therapie', 'symptom', 'medication', 'pharma', 'enzyme',
    'protein', 'genom', 'mutation', 'trial', 'meta-analysis', 'review',
    'lancet', 'nejm', 'bmj', 'jama',
}


def _is_medical_query(query: str) -> bool:
    q_lower = query.lower()
    return any(kw in q_lower for kw in MEDICAL_KEYWORDS)


def _convert_citations(text: str) -> str:
    """Convert Perplexity [1], [2] citations to [[WEB:1]], [[WEB:2]] format."""
    return re.sub(r'\[(\d+)\]', r'[[WEB:\1]]', text)


def _sources_from_perplexity(citations: list) -> list:
    """Convert Perplexity citation URLs to Source objects."""
    from urllib.parse import urlparse
    sources = []
    for url in citations:
        try:
            parsed = urlparse(url)
            domain = parsed.netloc.replace('www.', '')
            sources.append(Source(
                title=domain,
                url=url,
                domain=domain,
                favicon_letter=domain[0].upper() if domain else '?',
            ))
        except Exception:
            continue
    return sources


def _sources_from_pubmed(articles: list) -> list:
    return [
        Source(
            title=a.get('title', ''),
            url=a.get('url', ''),
            domain='pubmed.ncbi.nlm.nih.gov',
            favicon_letter='P',
            snippet=a.get('snippet', ''),
        )
        for a in articles
    ]


def search(query: str, api_key: str = '') -> ResearchResult:
    """Run the best search tool for the given query."""
    # Try PubMed for medical queries
    if _is_medical_query(query):
        try:
            from .pubmed import search_pubmed
            pm_result = search_pubmed(query)
            if pm_result['articles']:
                # Build answer from abstracts
                snippets = [a.get('snippet', '') for a in pm_result['articles'] if a.get('snippet')]
                answer = '\n\n'.join(f'[{i+1}] {s}' for i, s in enumerate(snippets)) if snippets else ''
                answer = _convert_citations(answer) if answer else ''
                return ResearchResult(
                    sources=_sources_from_pubmed(pm_result['articles']),
                    answer=answer,
                    query=query,
                    tool_used='pubmed',
                )
        except Exception:
            logger.exception("PubMed search failed, falling back to Perplexity")

    # Default: Perplexity Sonar
    if not api_key:
        return ResearchResult(query=query, error='No Perplexity API key configured')

    try:
        from .perplexity import search_perplexity
        px_result = search_perplexity(query, api_key)

        if px_result.get('error'):
            return ResearchResult(query=query, tool_used='perplexity', error=px_result['error'])

        answer = _convert_citations(px_result.get('answer', ''))
        return ResearchResult(
            sources=_sources_from_perplexity(px_result.get('citations', [])),
            answer=answer,
            query=query,
            tool_used='perplexity',
        )
    except Exception as e:
        logger.exception("Perplexity search failed")
        return ResearchResult(query=query, error=str(e))
