# ai/rrf.py
"""Reciprocal Rank Fusion -- mathematically optimal merging of ranked search results.

Combines SQL keyword search and semantic embedding search into a single
unified ranking. Uses tier-aware k-values so that:
  - Precise AND queries from user's direct terms rank highest
  - Broad OR queries rank lower
  - Secondary queries from Router's resolved_intent rank lowest
  - Cards found by multiple searches get a natural multi-source boost

Reference: Cormack, Clarke and Buettcher (2009) -- RRF for information retrieval.
"""

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

# k-values: lower = more weight (steeper contribution curve)
# k-values: lower = more weight (steeper contribution curve)
K_PRECISE_PRIMARY = 50    # AND queries from user's direct terms
K_BROAD_PRIMARY = 70      # OR queries from user's direct terms
K_SEMANTIC_PRIMARY = 60   # Embedding search from user's query
K_PRECISE_SECONDARY = 90  # AND queries from Router intent
K_BROAD_SECONDARY = 110   # OR queries from Router intent
K_SEMANTIC_SECONDARY = 120  # Embedding search from Router intent

# Confidence thresholds -- tune with real data after deployment
CONFIDENCE_HIGH = 0.025
CONFIDENCE_LOW = 0.012


def _get_k(query_type, tier):
    """Return the k-value for a given query type and tier."""
    if query_type == 'precise' and tier == 'primary':
        return K_PRECISE_PRIMARY
    elif query_type == 'broad' and tier == 'primary':
        return K_BROAD_PRIMARY
    elif query_type == 'semantic' and tier == 'primary':
        return K_SEMANTIC_PRIMARY
    elif query_type == 'precise' and tier == 'secondary':
        return K_PRECISE_SECONDARY
    elif query_type == 'broad' and tier == 'secondary':
        return K_BROAD_SECONDARY
    else:
        return K_SEMANTIC_SECONDARY


def compute_rrf(sql_results, semantic_results):
    """Compute weighted RRF score for each note.

    Args:
        sql_results: dict of note_id -> {rank: int, query_type: str, tier: str}
        semantic_results: dict of note_id -> {rank: int, tier: str}

    Returns:
        Sorted list of (note_id, rrf_score) tuples, descending by score.
    """
    scores = {}
    all_note_ids = set(sql_results.keys()) | set(semantic_results.keys())

    for note_id in all_note_ids:
        score = 0.0

        if note_id in sql_results:
            sql = sql_results[note_id]
            k = _get_k(sql['query_type'], sql['tier'])
            score += 1.0 / (k + sql['rank'])

        if note_id in semantic_results:
            sem = semantic_results[note_id]
            k = _get_k('semantic', sem['tier'])
            score += 1.0 / (k + sem['rank'])

        scores[note_id] = score

    return sorted(scores.items(), key=lambda x: x[1], reverse=True)


def check_confidence(rrf_results):
    """Determine retrieval confidence from RRF scores.

    Args:
        rrf_results: sorted list of (note_id, rrf_score) from compute_rrf().

    Returns:
        'high': strong match, answer from cards
        'medium': partial match, answer from cards with caveat
        'low': weak match, trigger Perplexity web search
    """
    if not rrf_results:
        return 'low'

    top_score = rrf_results[0][1]

    if top_score >= CONFIDENCE_HIGH:
        return 'high'
    elif top_score >= CONFIDENCE_LOW:
        return 'medium'
    else:
        return 'low'
