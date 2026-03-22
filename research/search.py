"""Multi-tool search orchestrator — selects best source for the query."""
import re
import requests

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

DEFINITION_KEYWORDS = {
    'was ist', 'what is', 'definition', 'bedeutung', 'meaning',
    'erkläre', 'explain', 'überblick', 'overview', 'zusammenfassung',
    'wer war', 'who was', 'geschichte von', 'history of',
}


def _is_medical_query(query: str) -> bool:
    q_lower = query.lower()
    return any(kw in q_lower for kw in MEDICAL_KEYWORDS)


def _is_definition_query(query: str) -> bool:
    q_lower = query.lower()
    return any(kw in q_lower for kw in DEFINITION_KEYWORDS)


def _convert_citations(text: str) -> str:
    """Convert Perplexity [1], [2] citations to [[WEB:1]], [[WEB:2]] format.

    Also adds spaces between adjacent citations so ReactMarkdown
    doesn't interpret ][ as nested link syntax.
    """
    converted = re.sub(r'\[(\d+)\]', r'[[WEB:\1]]', text)
    # Add space between adjacent markers: ]][[WEB → ]] [[WEB
    converted = converted.replace(']][[WEB:', ']] [[WEB:')
    return converted


def _sources_from_citations(citations: list) -> list:
    """Convert citation dicts (url + title) to Source objects."""
    from urllib.parse import urlparse
    sources = []
    for cite in citations:
        try:
            url = cite.get('url', '') if isinstance(cite, dict) else str(cite)
            title = cite.get('title', '') if isinstance(cite, dict) else ''
            parsed = urlparse(url)
            domain = parsed.netloc.replace('www.', '')
            sources.append(Source(
                title=title or domain,
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


def _sources_from_wikipedia(articles: list) -> list:
    return [
        Source(
            title=a.get('title', ''),
            url=a.get('url', ''),
            domain=a.get('domain', 'de.wikipedia.org'),
            favicon_letter='W',
            snippet=a.get('snippet', ''),
        )
        for a in articles
    ]


def _summarize_pubmed_de(snippets: list, query: str) -> str:
    """Summarize PubMed abstracts in German via Gemini."""
    try:
        try:
            from ..config import get_config, is_backend_mode, get_backend_url, get_auth_token
            from ..ai.auth import get_auth_headers
        except ImportError:
            from config import get_config, is_backend_mode, get_backend_url, get_auth_token
            from ai.auth import get_auth_headers

        config = get_config() or {}
        use_backend = is_backend_mode() and get_auth_token()
        api_key_cfg = config.get("api_key", "").strip()

        if not use_backend and not api_key_cfg:
            logger.warning("_summarize_pubmed_de: no API key, using raw snippets")
            combined = '\n\n'.join(f'[{i+1}] {s}' for i, s in enumerate(snippets))
            return _convert_citations(combined)

        combined = '\n\n'.join(f'[{i+1}] {s}' for i, s in enumerate(snippets))
        prompt = (
            f'Frage: {query}\n\n'
            f'Studienergebnisse:\n{combined}\n\n'
            'Fasse die relevanten Ergebnisse in 2-4 Sätzen auf Deutsch zusammen. '
            'Zitiere mit [1], [2] etc. Antworte direkt ohne Einleitung.'
        )

        if use_backend:
            url = f"{get_backend_url()}/chat"
            payload = {
                "message": prompt,
                "model": "gemini-2.5-flash",
                "mode": "compact",
                "history": [],
                "stream": False,
            }
            headers = get_auth_headers()
            response = requests.post(url, json=payload, headers=headers, timeout=20)
        else:
            model = "gemini-2.5-flash"
            url = (
                f"https://generativelanguage.googleapis.com/v1beta/models/"
                f"{model}:generateContent?key={api_key_cfg}"
            )
            payload = {
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.3, "maxOutputTokens": 400},
            }
            headers = {"Content-Type": "application/json"}
            response = requests.post(url, json=payload, headers=headers, timeout=20)

        if response.status_code == 200:
            data = response.json()
            # Backend format: {"response": "..."} or {"text": "..."}
            # Direct Gemini format: candidates[0].content.parts[0].text
            text = (
                data.get('response')
                or data.get('text')
                or (
                    data.get('candidates', [{}])[0]
                    .get('content', {})
                    .get('parts', [{}])[0]
                    .get('text', '')
                )
            )
            if text:
                return _convert_citations(text)
            logger.warning("_summarize_pubmed_de: empty text in response")
        else:
            logger.warning("_summarize_pubmed_de: HTTP %s", response.status_code)

    except Exception:
        logger.exception("PubMed Gemini summarization failed")

    # Fallback: return raw snippets with citation markers
    combined = '\n\n'.join(f'[{i+1}] {s}' for i, s in enumerate(snippets))
    return _convert_citations(combined)


def search(query: str, api_key: str = '', enabled_sources: dict = None) -> ResearchResult:
    """Run the best search tool for the given query."""
    if enabled_sources is None:
        enabled_sources = {'pubmed': True, 'wikipedia': True}

    # 1. Try PubMed for medical queries (if enabled)
    if enabled_sources.get('pubmed', True) and _is_medical_query(query):
        try:
            from .pubmed import search_pubmed
            pm_result = search_pubmed(query)
            if pm_result['articles']:
                # Build answer from abstracts — summarize in German via Gemini
                snippets = [a.get('snippet', '') for a in pm_result['articles'] if a.get('snippet')]
                answer = _summarize_pubmed_de(snippets, query) if snippets else ''
                return ResearchResult(
                    sources=_sources_from_pubmed(pm_result['articles']),
                    answer=answer,
                    query=query,
                    tool_used='pubmed',
                )
        except Exception:
            logger.exception("PubMed search failed, falling back")

    # 2. Wikipedia for definition queries (if enabled)
    if enabled_sources.get('wikipedia', True) and _is_definition_query(query):
        try:
            from .wikipedia import search_wikipedia
            wiki_result = search_wikipedia(query)
            if wiki_result['articles']:
                articles = wiki_result['articles']
                parts = []
                for i, a in enumerate(articles):
                    extract = a.get('extract', a.get('snippet', ''))
                    if extract:
                        parts.append(f'[[WEB:{i+1}]] {extract}')
                answer = '\n\n'.join(parts)
                return ResearchResult(
                    sources=_sources_from_wikipedia(articles),
                    answer=answer,
                    query=query,
                    tool_used='wikipedia',
                )
        except Exception:
            logger.exception("Wikipedia search failed, falling back")

    # Default: Perplexity Sonar via OpenRouter
    if not api_key:
        return ResearchResult(query=query,
                              error='Kein OpenRouter API-Key konfiguriert. '
                                    'Gehe zu openrouter.ai um einen zu erstellen.')

    try:
        from .openrouter import search_via_openrouter
        result = search_via_openrouter(query, api_key, model='perplexity/sonar')

        if result.get('error'):
            return ResearchResult(query=query, tool_used='perplexity/sonar',
                                  error=result['error'])

        answer = _convert_citations(result.get('answer', ''))
        return ResearchResult(
            sources=_sources_from_citations(result.get('citations', [])),
            answer=answer,
            query=query,
            tool_used='perplexity/sonar',
        )
    except Exception as e:
        logger.exception("OpenRouter search failed")
        return ResearchResult(query=query, error=str(e))
