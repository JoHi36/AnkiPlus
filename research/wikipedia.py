"""Wikipedia MediaWiki API client — free, no key needed."""
import json
import urllib.request
import urllib.error
import urllib.parse
from html import unescape
import re

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)


def _strip_html(text):
    """Remove HTML tags from MediaWiki extract."""
    return unescape(re.sub(r'<[^>]+>', '', text))


def search_wikipedia(query: str, lang: str = 'de') -> dict:
    """Search Wikipedia and return extracts + thumbnails.

    Returns dict with 'articles' list and 'error'.
    Each article: title, url, domain, favicon_letter, snippet, extract, thumbnail.
    """
    api = f'https://{lang}.wikipedia.org/w/api.php'

    # Step 1: Search for matching pages
    search_params = urllib.parse.urlencode({
        'action': 'query', 'list': 'search', 'srsearch': query,
        'srlimit': 3, 'format': 'json', 'utf8': 1,
    })

    try:
        with urllib.request.urlopen(f'{api}?{search_params}', timeout=8) as resp:
            data = json.loads(resp.read().decode('utf-8'))

        results = data.get('query', {}).get('search', [])
        if not results:
            return {'articles': [], 'error': None}

        page_ids = [str(r['pageid']) for r in results]

        # Step 2: Get extracts + thumbnails for found pages
        extract_params = urllib.parse.urlencode({
            'action': 'query', 'pageids': '|'.join(page_ids),
            'prop': 'extracts|pageimages', 'exintro': True,
            'explaintext': True, 'exlimit': len(page_ids),
            'piprop': 'thumbnail', 'pithumbsize': 200,
            'format': 'json', 'utf8': 1,
        })

        with urllib.request.urlopen(f'{api}?{extract_params}', timeout=8) as resp:
            detail_data = json.loads(resp.read().decode('utf-8'))

        pages = detail_data.get('query', {}).get('pages', {})
        articles = []
        for pid in page_ids:
            page = pages.get(pid, {})
            title = page.get('title', '')
            extract = page.get('extract', '')
            thumbnail = page.get('thumbnail', {}).get('source', '')

            if not title or not extract:
                continue

            # Truncate to first 2 sentences for snippet
            sentences = extract.split('. ')
            snippet = '. '.join(sentences[:2])
            if len(sentences) > 2:
                snippet += '.'

            articles.append({
                'title': title,
                'url': f'https://{lang}.wikipedia.org/wiki/{urllib.parse.quote(title.replace(" ", "_"))}',
                'domain': f'{lang}.wikipedia.org',
                'favicon_letter': 'W',
                'snippet': snippet,
                'extract': extract,
                'thumbnail': thumbnail,
            })

        return {'articles': articles, 'error': None}

    except urllib.error.URLError as e:
        logger.warning("Wikipedia API error: %s", e)
        return {'articles': [], 'error': str(e)}
    except Exception as e:
        logger.exception("Wikipedia search error")
        return {'articles': [], 'error': str(e)}
