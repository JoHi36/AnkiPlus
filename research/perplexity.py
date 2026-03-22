"""Perplexity Sonar API client."""
import json
import urllib.request
import urllib.error

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)

SONAR_URL = 'https://api.perplexity.ai/chat/completions'
SONAR_MODEL = 'sonar'


def search_perplexity(query: str, api_key: str) -> dict:
    """Call Perplexity Sonar API.

    Returns dict with 'answer', 'citations', 'error'.
    """
    if not api_key:
        return {'answer': '', 'citations': [], 'error': 'No Perplexity API key configured'}

    payload = json.dumps({
        'model': SONAR_MODEL,
        'messages': [
            {'role': 'system', 'content': 'You are a research tool for a learning app. Answer the question directly in 2-5 sentences. No introductions, no meta-commentary about yourself. Every factual claim must have a citation: [1], [2] etc. If no reliable source exists, say so explicitly. Answer in the same language as the question.'},
            {'role': 'user', 'content': query},
        ],
    }).encode('utf-8')

    req = urllib.request.Request(
        SONAR_URL,
        data=payload,
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode('utf-8'))

        answer = data.get('choices', [{}])[0].get('message', {}).get('content', '')
        citations = data.get('citations', [])
        return {'answer': answer, 'citations': citations, 'error': None}

    except urllib.error.URLError as e:
        logger.warning("Perplexity API error for query: %s — %s", query[:50], e)
        return {'answer': '', 'citations': [], 'error': str(e)}
    except Exception as e:
        logger.exception("Perplexity API error")
        return {'answer': '', 'citations': [], 'error': str(e)}
