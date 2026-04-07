"""HTTP client for Knowledge Graph queries via Cloud Functions.

All Neo4j access is proxied through authenticated Cloud Functions —
no Neo4j driver needed in the Anki Python client.
Includes a TTL cache (60s) for repeated queries within the same session.
Returns empty results gracefully on network errors.
"""

import json
import time
import requests

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)

CACHE_TTL_S = 60
QUERY_TIMEOUT_S = 10

# Simple TTL cache: {cache_key: (timestamp, result)}
_cache = {}


def _cache_key(query_type, params):
    """Generate a deterministic cache key from query type + params."""
    # Exclude embedding from cache key (too large, and vector searches
    # are unique per query anyway)
    filtered = {k: v for k, v in params.items() if k != 'embedding'}
    return f"{query_type}:{json.dumps(filtered, sort_keys=True)}"


def _get_cached(key):
    """Return cached result if still valid, else None."""
    entry = _cache.get(key)
    if entry and (time.time() - entry[0]) < CACHE_TTL_S:
        return entry[1]
    return None


def _set_cached(key, result):
    """Store result in cache."""
    _cache[key] = (time.time(), result)


def _query(query_type, params):
    """Execute a KG query via Cloud Function.

    Args:
        query_type: Query type string.
        params: Dict of query parameters.

    Returns:
        Query result (list/dict), or empty list on error.
    """
    try:
        from ..ai.auth import get_auth_headers
        from ..config import get_backend_url
    except ImportError:
        from ai.auth import get_auth_headers
        from config import get_backend_url

    backend_url = get_backend_url()
    if not backend_url:
        return []

    endpoint = f"{backend_url}/kg/query"

    try:
        headers = get_auth_headers()
    except Exception as e:
        logger.warning("kg_client: auth failed: %s", e)
        return []

    try:
        response = requests.post(
            endpoint,
            json={"query_type": query_type, "params": params},
            headers=headers,
            timeout=QUERY_TIMEOUT_S,
        )
        if response.ok:
            data = response.json()
            return data.get("result", [])
        else:
            logger.warning("kg_client: %s returned HTTP %d", query_type, response.status_code)
            return []
    except Exception as e:
        err_name = type(e).__name__
        if err_name in ('ConnectionError', 'OSError'):
            logger.debug("kg_client: offline, returning empty for %s", query_type)
        elif err_name == 'Timeout':
            logger.warning("kg_client: timeout for %s", query_type)
        else:
            logger.error("kg_client: unexpected error for %s: %s", query_type, e)
        return []


def vector_search_cards(embedding, top_k=10):
    """Search cards by embedding vector via Neo4j ANN index.

    Args:
        embedding: List of floats (3072-dim query embedding).
        top_k: Number of results to return.

    Returns:
        List of dicts with keys: content_hash, text, score.
    """
    # Vector searches are unique per query, don't cache
    return _query("vector_search_cards", {"embedding": embedding, "top_k": top_k})


def vector_search_terms(embedding, top_k=10):
    """Search terms by embedding vector via Neo4j ANN index.

    Args:
        embedding: List of floats (768-dim query embedding).
        top_k: Number of results to return.

    Returns:
        List of dicts with keys: term, score.
    """
    return _query("vector_search_terms", {"embedding": embedding, "top_k": top_k})


def get_related_cards(content_hash, limit=10):
    """Get cards related via shared terms in the knowledge graph.

    Args:
        content_hash: SHA256[:16] of the source card.
        limit: Max results.

    Returns:
        List of dicts with keys: content_hash, text, shared_terms.
    """
    key = _cache_key("get_related_cards", {"content_hash": content_hash, "limit": limit})
    cached = _get_cached(key)
    if cached is not None:
        return cached

    result = _query("get_related_cards", {"content_hash": content_hash, "limit": limit})
    _set_cached(key, result)
    return result


def get_card_terms(content_hash):
    """Get terms linked to a card.

    Args:
        content_hash: SHA256[:16] of the card.

    Returns:
        List of term name strings.
    """
    key = _cache_key("get_card_terms", {"content_hash": content_hash})
    cached = _get_cached(key)
    if cached is not None:
        return cached

    result = _query("get_card_terms", {"content_hash": content_hash})
    _set_cached(key, result)
    return result


def get_term_expansions(term, max_terms=5):
    """Get co-occurring terms via CO_OCCURS edges.

    Args:
        term: Term name string.
        max_terms: Max results.

    Returns:
        List of dicts with keys: term, weight.
    """
    key = _cache_key("get_term_expansions", {"term": term, "max_terms": max_terms})
    cached = _get_cached(key)
    if cached is not None:
        return cached

    result = _query("get_term_expansions", {"term": term, "max_terms": max_terms})
    _set_cached(key, result)
    return result


def get_weak_terms(limit=10):
    """Get terms the user struggles with but hasn't mastered.

    Returns:
        List of dicts with keys: term, struggle_count.
    """
    key = _cache_key("get_weak_terms", {"limit": limit})
    cached = _get_cached(key)
    if cached is not None:
        return cached

    result = _query("get_weak_terms", {"limit": limit})
    _set_cached(key, result)
    return result


def exact_term_lookup(query):
    """Case-insensitive exact term match in Neo4j.

    Args:
        query: Search string.

    Returns:
        Canonical term name string, or None if not found.
    """
    key = _cache_key("exact_term_lookup", {"query": query})
    cached = _get_cached(key)
    if cached is not None:
        return cached

    result = _query("exact_term_lookup", {"query": query})
    # Result is a string or null
    _set_cached(key, result)
    return result


def load_term_embeddings():
    """Load all term embeddings from Neo4j.

    Returns:
        Dict of {term: embedding_list} for terms with embeddings.
    """
    key = _cache_key("get_all_term_embeddings", {})
    cached = _get_cached(key)
    if cached is not None:
        return cached

    result = _query("get_all_term_embeddings", {})
    if isinstance(result, list):
        term_dict = {item["term"]: item["embedding"] for item in result if item.get("term")}
        _set_cached(key, term_dict)
        return term_dict
    _set_cached(key, {})
    return {}


def get_kg_metrics():
    """Get aggregated KG metrics for the current user.

    Returns:
        Dict with keys: totalCards, reviewedCards, avgEase, avgInterval.
    """
    key = _cache_key("get_kg_metrics", {})
    cached = _get_cached(key)
    if cached is not None:
        return cached

    result = _query("get_kg_metrics", {})
    if isinstance(result, dict):
        _set_cached(key, result)
        return result
    # Fallback for empty/error
    fallback = {"totalCards": 0, "reviewedCards": 0, "avgEase": 0, "avgInterval": 0}
    _set_cached(key, fallback)
    return fallback


def clear_cache():
    """Clear the in-memory TTL cache."""
    global _cache
    _cache = {}
