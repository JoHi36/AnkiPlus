"""PubMed E-utilities API client — free, no key required."""
import json
import urllib.parse
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)

ESEARCH_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi'
ESUMMARY_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi'
EFETCH_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi'
MAX_RESULTS = 5


def _fetch_abstracts(id_list: list) -> dict:
    """Fetch abstracts for given PMIDs via efetch (returns XML)."""
    if not id_list:
        return {}
    params = urllib.parse.urlencode({
        'db': 'pubmed', 'id': ','.join(id_list), 'rettype': 'abstract', 'retmode': 'xml',
    })
    url = f'{EFETCH_URL}?{params}'
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            xml_data = resp.read().decode('utf-8')
        root = ET.fromstring(xml_data)
        abstracts = {}
        for article in root.findall('.//PubmedArticle'):
            pmid_el = article.find('.//PMID')
            abstract_el = article.find('.//AbstractText')
            if pmid_el is not None and abstract_el is not None:
                abstracts[pmid_el.text] = abstract_el.text or ''
        return abstracts
    except Exception:
        logger.exception("Failed to fetch PubMed abstracts")
        return {}


def search_pubmed(query: str) -> dict:
    """Search PubMed and return article summaries with abstracts.

    Returns dict with 'articles' (list) and 'error' (str or None).
    """
    try:
        # Step 1: Search for article IDs
        search_params = urllib.parse.urlencode({
            'db': 'pubmed', 'term': query, 'retmax': MAX_RESULTS,
            'retmode': 'json', 'sort': 'relevance',
        })
        search_url = f'{ESEARCH_URL}?{search_params}'
        with urllib.request.urlopen(search_url, timeout=10) as resp:
            search_data = json.loads(resp.read().decode('utf-8'))
        id_list = search_data.get('esearchresult', {}).get('idlist', [])

        if not id_list:
            return {'articles': [], 'error': None}

        # Step 2: Get article summaries
        summary_params = urllib.parse.urlencode({
            'db': 'pubmed', 'id': ','.join(id_list), 'retmode': 'json',
        })
        summary_url = f'{ESUMMARY_URL}?{summary_params}'
        with urllib.request.urlopen(summary_url, timeout=10) as resp:
            summary_data = json.loads(resp.read().decode('utf-8'))
        results = summary_data.get('result', {})

        # Step 3: Fetch abstracts
        abstracts = _fetch_abstracts(id_list)

        articles = []
        for pmid in id_list:
            info = results.get(pmid, {})
            if not isinstance(info, dict):
                continue
            title = info.get('title', '')
            source = info.get('source', '')
            abstract = abstracts.get(pmid, '')
            articles.append({
                'title': title,
                'url': f'https://pubmed.ncbi.nlm.nih.gov/{pmid}/',
                'domain': 'pubmed.ncbi.nlm.nih.gov',
                'favicon_letter': 'P',
                'snippet': abstract[:300] if abstract else source,
                'pmid': pmid,
            })
        return {'articles': articles, 'error': None}

    except urllib.error.URLError as e:
        logger.warning("PubMed API error: %s", e)
        return {'articles': [], 'error': f'PubMed error: {e}'}
    except Exception as e:
        logger.exception("PubMed API error")
        return {'articles': [], 'error': str(e)}
