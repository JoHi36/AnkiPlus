"""OpenRouter unified API client — single key for all LLM providers."""
import json
import urllib.request
import urllib.error

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)

OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'


def search_via_openrouter(query: str, api_key: str,
                          model: str = 'perplexity/sonar') -> dict:
    """Call any model via OpenRouter's unified API.

    Args:
        query: The search query.
        api_key: OpenRouter API key (sk-or-...).
        model: Model identifier (e.g. 'perplexity/sonar', 'perplexity/sonar-pro').

    Returns:
        dict with 'answer', 'citations', 'usage', 'error'.
    """
    if not api_key:
        return {'answer': '', 'citations': [], 'usage': None,
                'error': 'Kein OpenRouter API-Key konfiguriert. Gehe zu openrouter.ai um einen zu erstellen.'}

    payload = json.dumps({
        'model': model,
        'messages': [
            {'role': 'system',
             'content': 'Be precise and academic. Cite your sources with [1], [2] etc. '
                        'Answer in the same language as the question.'},
            {'role': 'user', 'content': query},
        ],
    }).encode('utf-8')

    req = urllib.request.Request(
        OPENROUTER_URL,
        data=payload,
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://ankiplus.app',
            'X-Title': 'AnkiPlus Research Agent',
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode('utf-8'))

        answer = data.get('choices', [{}])[0].get('message', {}).get('content', '')
        citations = data.get('citations', [])

        # Extract usage for cost tracking
        usage = data.get('usage', {})
        cost_info = {
            'prompt_tokens': usage.get('prompt_tokens', 0),
            'completion_tokens': usage.get('completion_tokens', 0),
            'total_tokens': usage.get('total_tokens', 0),
            'model': model,
        }

        logger.info("OpenRouter [%s]: %d prompt + %d completion tokens",
                     model, cost_info['prompt_tokens'], cost_info['completion_tokens'])

        return {'answer': answer, 'citations': citations, 'usage': cost_info, 'error': None}

    except urllib.error.HTTPError as e:
        body = ''
        try:
            body = e.read().decode('utf-8', errors='replace')[:200]
        except Exception:
            pass
        logger.warning("OpenRouter HTTP %d for [%s]: %s", e.code, model, body)
        if e.code == 401:
            return {'answer': '', 'citations': [], 'usage': None,
                    'error': 'OpenRouter API-Key ungültig. Prüfe deinen Key auf openrouter.ai.'}
        if e.code == 402:
            return {'answer': '', 'citations': [], 'usage': None,
                    'error': 'OpenRouter Guthaben aufgebraucht. Lade Credits auf openrouter.ai nach.'}
        return {'answer': '', 'citations': [], 'usage': None, 'error': f'OpenRouter Fehler ({e.code})'}
    except urllib.error.URLError as e:
        logger.warning("OpenRouter connection error: %s", e)
        return {'answer': '', 'citations': [], 'usage': None, 'error': f'Verbindungsfehler: {e}'}
    except Exception as e:
        logger.exception("OpenRouter error")
        return {'answer': '', 'citations': [], 'usage': None, 'error': str(e)}
