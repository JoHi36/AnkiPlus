# ai/kg_enrichment.py
"""KG Query Enrichment -- generates search queries from Knowledge Graph term expansion.

Two-tier architecture:
  Tier 1 (Primary): Terms from user's direct query -> KG expansion -> queries
  Tier 2 (Secondary): NEW terms from Router's resolved_intent -> additional queries

The KG replaces the LLM Router for query generation. It knows the actual
vocabulary of the user's cards and generates deterministic, testable queries.
"""
import re

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

_STOPWORDS = frozenset({
    'und', 'oder', 'der', 'die', 'das', 'ein', 'eine', 'ist', 'sind',
    'hat', 'haben', 'wird', 'werden', 'kann', 'koennen', 'bei', 'von',
    'mit', 'auf', 'fuer', 'aus', 'nach', 'ueber', 'sich', 'dem', 'den',
    'des', 'einer', 'einem', 'eines', 'nicht', 'auch', 'noch', 'aber',
    'wenn', 'dass', 'wie', 'was', 'wer', 'wem', 'wen', 'welche',
    'the', 'and', 'for', 'with', 'from', 'this', 'that', 'which',
    'are', 'was', 'were', 'been', 'have', 'has', 'had', 'does', 'did',
    'will', 'would', 'could', 'should', 'may', 'might', 'can',
    'meinst', 'genau', 'erklaere', 'erklaer', 'kannst', 'bitte', 'lang',
})

_KEEP_ABBREVIATIONS = frozenset({
    'ATP', 'ADP', 'AMP', 'DNA', 'RNA', 'mRNA', 'tRNA', 'rRNA',
    'GIP', 'GLP', 'CCK', 'LDL', 'HDL', 'VLDL', 'HbA', 'EKG',
    'EEG', 'MRI', 'UCP', 'BMI', 'CRP', 'TSH', 'LH', 'FSH',
    'NAD', 'FAD', 'CoA', 'IgG', 'IgA', 'IgM', 'IgE',
})


def extract_query_terms(text):
    """Extract candidate terms from text for KG lookup.

    Returns list of candidate term strings, deduplicated, ordered by position.
    """
    if not text or not text.strip():
        return []

    clean = re.sub(r'[^\w\s\-/]', ' ', text)
    clean = re.sub(r'\s+', ' ', clean).strip()

    tokens = clean.split()
    terms = []
    seen = set()

    for token in tokens:
        if token in _KEEP_ABBREVIATIONS:
            if token.lower() not in seen:
                seen.add(token.lower())
                terms.append(token)
            continue

        if len(token) < 3:
            continue
        if token.lower() in _STOPWORDS:
            continue
        if token.isdigit():
            continue

        if token.lower() not in seen:
            seen.add(token.lower())
            terms.append(token)

    return terms


def _kg_lookup_terms(candidate_terms, db=None):
    """Look up candidate terms in KG via exact match.

    Returns (found_terms, unmatched_terms).
    """
    try:
        try:
            from ..storage.kg_store import exact_term_lookup
        except ImportError:
            from storage.kg_store import exact_term_lookup
    except ImportError:
        return [], list(candidate_terms)

    found = []
    unmatched = []

    for term in candidate_terms:
        canonical = exact_term_lookup(term, db=db)
        if canonical:
            found.append(canonical)
        else:
            unmatched.append(term)

    return found, unmatched


def _build_queries(terms, expansions):
    """Build SQL queries from terms and their KG expansions.

    Returns (precise_queries, broad_queries).
    """
    if not terms:
        return [], []

    all_terms = list(terms)
    for term in terms:
        for expanded, weight in expansions.get(term, []):
            if expanded.lower() not in {t.lower() for t in all_terms}:
                all_terms.append(expanded)

    # PRECISE: original terms as AND
    precise = []
    if len(terms) >= 1:
        precise.append(' '.join('"%s"' % t for t in terms))

    # PRECISE: top expansions + context term
    for term in terms:
        exps = expansions.get(term, [])
        if exps:
            top_exp = [e[0] for e in exps[:2]]
            context = [t for t in terms if t.lower() != term.lower()]
            if context:
                precise.append(' '.join('"%s"' % t for t in top_exp + context[:1]))
            else:
                precise.append(' '.join('"%s"' % t for t in top_exp))

    # Deduplicate precise
    seen_p = set()
    unique_precise = []
    for q in precise:
        norm = q.lower()
        if norm not in seen_p:
            seen_p.add(norm)
            unique_precise.append(q)
    precise = unique_precise[:3]

    # BROAD: all terms as OR
    unique_all = []
    seen_lower = set()
    for t in all_terms:
        if t.lower() not in seen_lower:
            seen_lower.add(t.lower())
            unique_all.append(t)
    broad = []
    if unique_all:
        broad = [' OR '.join('"%s"' % t for t in unique_all[:6])]

    return precise, broad


def _build_embedding_query(original_text, found_terms, expansions):
    """Build enriched embedding query by appending expansion terms."""
    expansion_terms = []
    for term in found_terms:
        for expanded, weight in expansions.get(term, []):
            if expanded.lower() not in original_text.lower():
                expansion_terms.append(expanded)

    if expansion_terms:
        return original_text + ' ' + ' '.join(expansion_terms[:8])
    return original_text


def enrich_query(user_message, resolved_intent=None, db=None, kg_term_index=None,
                 embed_fn=None):
    """Main enrichment entry point.

    Args:
        user_message: Original user question.
        resolved_intent: Optional Router-provided intent description.
        db: Optional SQLite DB connection (for testing).
        kg_term_index: Dict of {term: normalized_vector} for fuzzy matching.
        embed_fn: Optional callable for embedding unmatched terms.

    Returns:
        Dict with tier1_terms, tier2_terms, kg_terms_found, expansions,
        precise_primary, broad_primary, precise_secondary, broad_secondary,
        embedding_primary, embedding_secondary, unmatched_terms.
    """
    try:
        try:
            from ..storage.kg_store import get_term_expansions
        except ImportError:
            from storage.kg_store import get_term_expansions
    except ImportError:
        get_term_expansions = lambda term, max_terms=5, db=None: []

    # TIER 1: user's direct query
    tier1_candidates = extract_query_terms(user_message)
    tier1_found, tier1_unmatched = _kg_lookup_terms(tier1_candidates, db=db)

    expansions = {}
    for term in tier1_found:
        expansions[term] = get_term_expansions(term, max_terms=5, db=db)

    tier1_query_terms = tier1_found if tier1_found else tier1_candidates
    precise_primary, broad_primary = _build_queries(tier1_query_terms, expansions)
    embedding_primary = _build_embedding_query(user_message, tier1_found, expansions)

    # TIER 2: resolved_intent (new terms only)
    tier2_terms = []
    precise_secondary = []
    broad_secondary = []
    embedding_secondary = ''

    if resolved_intent:
        tier2_candidates = extract_query_terms(resolved_intent)

        tier1_lower = {t.lower() for t in tier1_candidates}
        tier1_found_lower = {t.lower() for t in tier1_found}
        expansion_lower = set()
        for exps in expansions.values():
            for expanded, _ in exps:
                expansion_lower.add(expanded.lower())
        all_tier1_lower = tier1_lower | tier1_found_lower | expansion_lower

        tier2_new = [t for t in tier2_candidates if t.lower() not in all_tier1_lower]

        if tier2_new:
            tier2_found, tier2_unmatched_extra = _kg_lookup_terms(tier2_new, db=db)
            tier1_unmatched.extend(tier2_unmatched_extra)

            tier2_expansions = {}
            for term in tier2_found:
                tier2_expansions[term] = get_term_expansions(term, max_terms=5, db=db)
            expansions.update(tier2_expansions)

            tier2_query_terms = tier2_found if tier2_found else tier2_new
            precise_secondary, broad_secondary = _build_queries(tier2_query_terms, tier2_expansions)
            embedding_secondary = _build_embedding_query(resolved_intent, tier2_found, tier2_expansions)
            tier2_terms = tier2_query_terms

    return {
        'tier1_terms': tier1_query_terms,
        'tier2_terms': tier2_terms,
        'kg_terms_found': tier1_found,
        'expansions': expansions,
        'precise_primary': precise_primary,
        'broad_primary': broad_primary,
        'precise_secondary': precise_secondary,
        'broad_secondary': broad_secondary,
        'embedding_primary': embedding_primary,
        'embedding_secondary': embedding_secondary,
        'unmatched_terms': tier1_unmatched,
    }
