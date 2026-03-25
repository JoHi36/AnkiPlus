"""Research via backend /research endpoint (replaces direct OpenRouter calls)."""
import json

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)


def search_via_openrouter(query: str, api_key: str = '',
                          model: str = 'perplexity/sonar') -> dict:
    """Research via backend /research endpoint.

    Args:
        query: The search query.
        api_key: Unused (kept for backward compat).
        model: Model identifier (e.g. 'perplexity/sonar').

    Returns:
        dict with 'answer', 'citations', 'usage', 'error'.
    """
    try:
        from ..config import get_backend_url, get_auth_token
    except ImportError:
        from config import get_backend_url, get_auth_token

    backend_url = get_backend_url()
    auth_token = get_auth_token()

    if not backend_url or not auth_token:
        return {'answer': '', 'citations': [], 'usage': None,
                'error': 'Nicht authentifiziert. Bitte melde dich an.'}

    import requests
    headers = {
        'Authorization': 'Bearer %s' % auth_token,
        'Content-Type': 'application/json',
    }
    try:
        resp = requests.post('%s/research' % backend_url.rstrip('/'),
                             json={'query': query, 'model': model},
                             headers=headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        return {
            'answer': data.get('answer', ''),
            'citations': data.get('citations', []),
            'usage': None,
            'error': None,
        }
    except Exception as e:
        logger.warning("Backend research error: %s", e)
        return {'answer': '', 'citations': [], 'usage': None, 'error': str(e)}
