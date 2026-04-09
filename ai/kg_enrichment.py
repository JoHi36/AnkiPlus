# ai/kg_enrichment.py
"""KG Query Enrichment -- generates search queries from Knowledge Graph term expansion.

Strategy: Embedding-first, then Graph edges on top.
  1. Extract terms from query
  2. Embed terms → find semantically similar KG terms (always, not just for typos)
  3. Expand ALL found terms (original + embedding-similar) via Graph edges
  4. Generate SQL + Embedding queries from the combined term set

Two-tier architecture:
  Tier 1 (Primary): Terms from user's direct query
  Tier 2 (Secondary): NEW terms from Router's resolved_intent
"""
import re
import math

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

# Minimal universal stopwords — only the absolute basics (function words).
# Domain filtering is handled dynamically by KG presence check, not by this list.
# A term NOT in the KG is demoted to embedding-only (not used for SQL queries).
_STOPWORDS = frozenset({
    # German function words (determiners, pronouns, prepositions, conjunctions)
    'und', 'oder', 'der', 'die', 'das', 'ein', 'eine', 'ist', 'sind',
    'hat', 'haben', 'wird', 'werden', 'kann', 'bei', 'von', 'mit',
    'auf', 'aus', 'nach', 'sich', 'dem', 'den', 'des', 'einer',
    'einem', 'eines', 'nicht', 'auch', 'noch', 'aber', 'wenn', 'dass',
    'wie', 'was', 'wer', 'wem', 'wen', 'welche', 'welcher', 'welches',
    'mein', 'dein', 'sein', 'ihr', 'unser', 'euer',
    # English function words
    'the', 'and', 'for', 'with', 'from', 'this', 'that', 'which',
    'are', 'was', 'were', 'been', 'have', 'has', 'had', 'does', 'did',
    'will', 'would', 'could', 'should', 'may', 'might', 'can',
    'not', 'but', 'its', 'his', 'her', 'our', 'their', 'who', 'whom',
})

_KEEP_ABBREVIATIONS = frozenset({
    'ATP', 'ADP', 'AMP', 'DNA', 'RNA', 'mRNA', 'tRNA', 'rRNA',
    'GIP', 'GLP', 'CCK', 'LDL', 'HDL', 'VLDL', 'HbA', 'EKG',
    'EEG', 'MRI', 'UCP', 'BMI', 'CRP', 'TSH', 'LH', 'FSH',
    'NAD', 'FAD', 'CoA', 'IgG', 'IgA', 'IgM', 'IgE',
})

# Embedding similarity thresholds
EMB_SIMILARITY_MIN = 0.75   # Minimum to consider a KG term related (was 0.55 — too noisy)
EMB_EXPANSION_TOP_K = 8     # Max embedding-similar terms per input term (raised back: threshold 0.75 filters noise)
STEM_OVERLAP_MIN = 4         # Min shared prefix to consider a morphological variant
MAX_PRECISE_QUERIES = 5      # Max individual SQL queries (was 8 — too noisy)

# Latin/German compound-term prefixes: "Plexus brachialis", "Nervus vagus", etc.
# These tokens NEVER appear alone in medical context — always followed by a specifier.
_COMPOUND_PREFIXES = frozenset({
    'plexus', 'nervus', 'musculus', 'arteria', 'vena', 'ligamentum',
    'foramen', 'nucleus', 'ganglion', 'truncus', 'ramus', 'sulcus',
    'gyrus', 'fasciculus', 'tractus', 'ductus', 'canalis', 'fossa',
    'glandula', 'cornu', 'lamina', 'tunica',
})


def extract_query_terms(text):
    """Extract candidate terms from text for KG lookup.

    Handles multi-word medical terms:
    - Latin compound terms: "Plexus brachialis", "Nervus vagus" (prefix + specifier)
    - Consecutive capitalized words: "Braunes Fettgewebe", "Nernst-Gleichung"

    Returns list of candidate term strings, deduplicated, ordered by position.
    """
    if not text or not text.strip():
        return []

    clean = re.sub(r'[^\w\s\-/]', ' ', text)
    clean = re.sub(r'\s+', ' ', clean).strip()

    tokens = clean.split()
    terms = []
    seen = set()
    i = 0

    while i < len(tokens):
        token = tokens[i]

        # Check for abbreviations first
        if token in _KEEP_ABBREVIATIONS:
            if token.lower() not in seen:
                seen.add(token.lower())
                terms.append(token)
            i += 1
            continue

        # Skip short, stopword, digit tokens
        if len(token) < 3 or token.lower() in _STOPWORDS or token.isdigit():
            i += 1
            continue

        # Multi-word detection: Latin compound prefixes (e.g. "Plexus brachialis")
        if token.lower() in _COMPOUND_PREFIXES:
            compound = _try_compound(tokens, i)
            if compound and compound.lower() not in seen:
                seen.add(compound.lower())
                terms.append(compound)
                # Skip all tokens consumed by the compound
                i += len(compound.split())
                continue

        # Multi-word detection: consecutive capitalized words in mid-sentence
        # "Nernst-Gleichung" is one hyphenated token (already handled).
        # "Braunes Fettgewebe" = two capitalized words in a row.
        if token[0].isupper() and i + 1 < len(tokens):
            compound = _try_capitalized_compound(tokens, i)
            if compound and compound.lower() not in seen:
                seen.add(compound.lower())
                terms.append(compound)
                i += len(compound.split())
                continue

        # Single token
        if token.lower() not in seen:
            seen.add(token.lower())
            terms.append(token)
        i += 1

    return terms


def _try_compound(tokens, start):
    """Try to build a Latin compound term starting at tokens[start].

    E.g. "Plexus" + "brachialis" → "Plexus brachialis"
    Only consumes following words that look like Latin specifiers:
    - Lowercase words (brachialis, cervicalis, inferior, superior)
    - Words that are themselves compound prefixes (Plexus hypogastricus)
    Stops at German nouns (capitalized non-Latin), stopwords, abbreviations.
    """
    parts = [tokens[start]]
    j = start + 1
    while j < len(tokens):
        next_tok = tokens[j]
        # Stop at stopwords, abbreviations, or very short tokens
        if next_tok.lower() in _STOPWORDS or next_tok in _KEEP_ABBREVIATIONS:
            break
        if len(next_tok) < 3:
            break
        # Latin specifiers are typically lowercase: "brachialis", "cervicalis"
        if next_tok[0].islower():
            parts.append(next_tok)
            j += 1
        # Also allow another compound prefix: "Plexus hypogastricus"
        elif next_tok.lower() in _COMPOUND_PREFIXES:
            parts.append(next_tok)
            j += 1
        else:
            # Capitalized non-Latin word (German noun like "Funktion") — stop
            break
        # Max 3-word compounds (e.g. "Plexus hypogastricus inferior")
        if len(parts) >= 3:
            break

    if len(parts) >= 2:
        return ' '.join(parts)
    return None


def _try_capitalized_compound(tokens, start):
    """Try to build a compound from consecutive capitalized words.

    E.g. "Braunes" + "Fettgewebe" → "Braunes Fettgewebe"
    Only triggers when at least the second word is also capitalized and not a stopword.
    """
    # Don't start compounds from sentence-initial position (index 0) unless
    # the next word is also capitalized — sentence-initial caps are unreliable.
    next_idx = start + 1
    if next_idx >= len(tokens):
        return None

    next_tok = tokens[next_idx]
    # Next token must be capitalized, non-stopword, and >= 3 chars
    if (not next_tok[0].isupper() or next_tok.lower() in _STOPWORDS
            or len(next_tok) < 3 or next_tok in _KEEP_ABBREVIATIONS):
        return None

    parts = [tokens[start], next_tok]
    j = next_idx + 1
    while j < len(tokens) and len(parts) < 3:
        tok = tokens[j]
        if tok[0].isupper() and tok.lower() not in _STOPWORDS and len(tok) >= 3:
            parts.append(tok)
            j += 1
        else:
            break

    return ' '.join(parts)


def _shares_stem(a, b):
    """Check if two lowercased terms share a common stem of ≥ STEM_OVERLAP_MIN chars.

    Catches: dünndarm/dünndarms, darm/darmdrehung/darmtätigkeit, fett/fettgewebe.
    Skips: very short shared prefixes (≤3 chars) which are coincidental.
    """
    # Check prefix overlap
    min_len = min(len(a), len(b))
    shared = 0
    for i in range(min_len):
        if a[i] == b[i]:
            shared += 1
        else:
            break
    if shared >= STEM_OVERLAP_MIN:
        return True

    # Check if one contains the other
    if a in b or b in a:
        return True

    # Check suffix overlap (e.g., "darm" shared between "dünndarm" and "dickdarm")
    for stem_len in range(STEM_OVERLAP_MIN, min_len + 1):
        if a[-stem_len:] == b[-stem_len:]:
            return True
        # Also check if a term's suffix appears in the other term
        if len(a) >= stem_len and a[-stem_len:] in b:
            return True
        if len(b) >= stem_len and b[-stem_len:] in a:
            return True

    return False


def _embedding_expand_terms(terms, kg_term_index, term_embeddings, sentence_embedding=None):
    """Find semantically similar KG terms via embedding similarity.

    Uses TWO strategies:
    1. Sentence-level: embed the full question → find nearest KG terms (best for synonyms)
    2. Term-level: embed individual terms → find morphological variants (fallback)

    Args:
        terms: List of query term strings (from extract_query_terms).
        kg_term_index: Dict of {kg_term: normalized_vector}.
        term_embeddings: Dict of {query_term: embedding_vector} from batch embed.
        sentence_embedding: Embedding of the full user question (preferred for expansion).

    Returns:
        Dict of {'_sentence': [(kg_term, score), ...]} for sentence-level matches,
        plus per-term matches for individual terms.
    """
    if not kg_term_index:
        return {}

    result = {}
    terms_lower = {t.lower() for t in terms}

    # Strategy 1: Sentence-level embedding → best for finding synonyms
    # "Wie lang ist der Dünndarm?" → finds Jejunum, Ileum, Duodenum
    if sentence_embedding:
        norm = math.sqrt(sum(v * v for v in sentence_embedding))
        if norm > 0:
            normed = [v / norm for v in sentence_embedding]
            scored = []
            for kg_term, kg_vec in kg_term_index.items():
                # Skip terms that are already in the query
                if kg_term.lower() in terms_lower:
                    continue
                # Skip morphological variants — terms sharing a stem with query terms.
                # Filters: "Dünndarms", "Dünndarmkonvolut", "Darmdrehung", "Darmtätigkeit"
                # when query has "dünndarm" (shared stem "darm" ≥ 4 chars)
                kg_lower = kg_term.lower()
                is_morph_variant = False
                for t in terms_lower:
                    if _shares_stem(kg_lower, t):
                        is_morph_variant = True
                        break
                if is_morph_variant:
                    continue

                score = sum(a * b for a, b in zip(normed, kg_vec))
                if score >= EMB_SIMILARITY_MIN:
                    scored.append((kg_term, score))

            scored.sort(key=lambda x: x[1], reverse=True)
            if scored:
                result['_sentence'] = scored[:EMB_EXPANSION_TOP_K * 2]
                logger.info("Sentence expansion -> %s",
                            [(t, round(s, 2)) for t, s in scored[:8]])

    # Strategy 2: Term-level embedding → finds morphological variants + typo matches
    for term in terms:
        emb = term_embeddings.get(term)
        if not emb:
            continue

        norm = math.sqrt(sum(v * v for v in emb))
        if norm == 0:
            continue
        normed = [v / norm for v in emb]

        scored = []
        for kg_term, kg_vec in kg_term_index.items():
            if kg_term.lower() == term.lower():
                continue
            # Skip terms already found by sentence expansion
            if '_sentence' in result and any(kg_term == t for t, _ in result['_sentence']):
                continue
            score = sum(a * b for a, b in zip(normed, kg_vec))
            if score >= 0.75:  # Higher threshold for term-level (morphological only)
                scored.append((kg_term, score))

        scored.sort(key=lambda x: x[1], reverse=True)
        if scored:
            result[term] = scored[:3]  # Fewer results for term-level

    return result


def _get_edge_expansions(terms, db=None):
    """Get graph edge expansions for a list of terms.

    Performs case-insensitive lookup: normalizes each term to its canonical
    KG form before querying edges (e.g. "dünndarm" → "Dünndarm").

    Returns dict of {original_term: [(connected_term, weight), ...]}
    """
    try:
        try:
            from ..storage.kg_store import get_term_expansions, exact_term_lookup
        except ImportError:
            from storage.kg_store import get_term_expansions, exact_term_lookup
    except ImportError:
        return {}

    expansions = {}
    for term in terms:
        # Try exact match first, then case-insensitive canonical lookup
        edges = get_term_expansions(term, max_terms=5, db=db)
        if not edges:
            canonical = exact_term_lookup(term, db=db)
            if canonical and canonical != term:
                edges = get_term_expansions(canonical, max_terms=5, db=db)
        if edges:
            expansions[term] = edges
    return expansions


def _build_queries(terms, expansions, original_terms=None):
    """Build SQL queries from terms and their expansions.

    Priority order for precise queries:
      1. Original query terms (highest — user's own words)
      2. Edge-expanded terms from originals (high co-occurrence = high card relevance)
      3. Sentence-embedding expansion terms (new vocabulary / synonyms)
      4. Edge-expanded terms from embedding-found terms (lowest priority)

    Args:
        terms: All query terms (original + embedding-found).
        expansions: Dict of {source: [(term, weight/score), ...]}.
        original_terms: The user's original extracted terms (before expansion).

    Returns (precise_queries, broad_queries).
    """
    if not terms:
        return [], []

    if original_terms is None:
        original_terms = terms

    original_lower = {t.lower() for t in original_terms}

    # --- Build priority-ordered list for precise queries ---
    precise_candidates = []  # (term, priority) — lower priority number = more important
    seen_lower = set()

    def _add(term, priority):
        if term.lower() not in seen_lower:
            seen_lower.add(term.lower())
            precise_candidates.append((term, priority))

    # Priority 1: Original query terms
    for term in original_terms:
        _add(term, 1)

    # Priority 2: Edge-expanded terms from ORIGINAL terms
    for term in original_terms:
        for expanded, weight in expansions.get(term, []):
            # Edge expansions have weight > 1 (scaled by 0.1 from raw weight)
            # Sentence expansions have weight < 1 (cosine similarity)
            if weight >= 2.0:  # Edge expansion (raw weight * 0.1 >= 2.0 means raw >= 20, was 1.0)
                _add(expanded, 2)

    # Priority 3: Sentence-embedding expansion terms (from _sentence key)
    for expanded, score in expansions.get('_sentence', []):
        _add(expanded, 3)

    # Priority 3b: Edge-expanded terms from originals with lower weight
    for term in original_terms:
        for expanded, weight in expansions.get(term, []):
            if weight < 1.0:  # Low-weight edge or sentence-level
                _add(expanded, 3)

    # Priority 4: Edge-expanded terms from embedding-found terms (not originals)
    for term in terms:
        if term.lower() in original_lower:
            continue
        for expanded, weight in expansions.get(term, []):
            _add(expanded, 4)

    # Sort by priority, take top MAX_PRECISE_QUERIES
    precise_candidates.sort(key=lambda x: x[1])
    precise = ['"%s"' % t for t, _ in precise_candidates[:MAX_PRECISE_QUERIES]]

    # BROAD: all unique terms as OR (up to 8)
    all_terms = list(terms)
    for exps in expansions.values():
        for t, _ in exps:
            if t.lower() not in {at.lower() for at in all_terms}:
                all_terms.append(t)

    unique_all = []
    seen_broad = set()
    for t in all_terms:
        if t.lower() not in seen_broad:
            seen_broad.add(t.lower())
            unique_all.append(t)
    broad = []
    if unique_all:
        broad = [' OR '.join('"%s"' % t for t in unique_all[:8])]

    return precise, broad


def _build_embedding_query(original_text, all_expansion_terms):
    """Build embedding query — use ONLY the original text, no expansion noise.

    Expansion terms are useful for SQL keyword search but pollute the embedding
    vector, causing semantic search to drift away from the user's actual intent.
    """
    return original_text


def _filter_by_kg_presence(candidates, db=None):
    """Split candidates into KG-present terms and non-KG terms.

    Terms in the KG are domain-relevant → used for SQL + Embedding queries.
    Terms NOT in the KG are generic (verbs, adjectives) → only for Embedding.

    This replaces language-specific stopword lists with a universal approach.
    """
    try:
        try:
            from ..storage.kg_store import exact_term_lookup
        except ImportError:
            from storage.kg_store import exact_term_lookup
    except ImportError:
        return candidates, []  # Can't check — keep all

    kg_terms = []
    non_kg_terms = []
    for term in candidates:
        canonical = exact_term_lookup(term, db=db)
        if canonical:
            kg_terms.append(canonical)
        else:
            non_kg_terms.append(term)

    if non_kg_terms:
        logger.debug("KG filter: domain=%s, generic=%s", kg_terms, non_kg_terms)

    return kg_terms, non_kg_terms


def _process_tier(candidates, kg_term_index, term_embeddings, sentence_embedding=None, db=None):
    """Process one tier of terms: KG filter → embedding expand → edge expand → combine.

    Returns:
        (query_terms, all_expansions)
        query_terms: list of terms for SQL queries (KG-present only + expansions)
        all_expansions: dict of {term: [(expanded, weight/score), ...]}
            Edge expansions use weight >= 1.0 (raw_weight * 0.1, so raw >= 10).
            Embedding expansions use score < 1.0 (cosine similarity 0.55-0.99).
    """
    # Step 0: KG-based filter — only domain terms get SQL queries
    # Non-KG terms (verbs, adjectives) contribute only to embedding queries.
    kg_candidates, non_kg_candidates = _filter_by_kg_presence(candidates, db=db)

    # Use KG terms for SQL, but ALL candidates for embedding expansion
    sql_candidates = kg_candidates if kg_candidates else candidates  # fallback if no KG matches

    # Step 1: Edge-based expansion on SQL-candidate terms first (highest value)
    edge_expansions_original = _get_edge_expansions(sql_candidates, db=db)

    # Step 2: Embedding-based expansion (sentence + term level)
    emb_expansions = _embedding_expand_terms(
        candidates, kg_term_index, term_embeddings,
        sentence_embedding=sentence_embedding)

    # Collect all terms found via embedding similarity
    emb_found_terms = set()
    for key, matches in emb_expansions.items():
        for kg_term, score in matches:
            emb_found_terms.add(kg_term)

    # Step 3: Edge-based expansion on embedding-found terms (lower priority)
    emb_terms_for_edges = [t for t in emb_found_terms
                           if t.lower() not in {c.lower() for c in candidates}]
    edge_expansions_emb = _get_edge_expansions(emb_terms_for_edges, db=db) if emb_terms_for_edges else {}

    # Step 4: Combine all expansions with clear weight separation
    # Edge weights: raw_weight * 0.1 (typical 0.5-3.4, always distinguishable from cosine)
    # Embedding scores: cosine similarity (0.55-0.99)
    all_expansions = {}

    # Add edge expansions from originals first (highest priority)
    for term, edges in edge_expansions_original.items():
        all_expansions[term] = [(t, w * 0.1) for t, w in edges]

    # Add embedding expansions (sentence-level kept under '_sentence' key)
    for term, matches in emb_expansions.items():
        if term in all_expansions:
            existing_lower = {t.lower() for t, _ in all_expansions[term]}
            for kg_term, score in matches:
                if kg_term.lower() not in existing_lower:
                    all_expansions[term].append((kg_term, score))
        else:
            all_expansions[term] = [(t, score) for t, score in matches]

    # Add edge expansions from embedding-found terms (lowest priority)
    for term, edges in edge_expansions_emb.items():
        if term in all_expansions:
            existing_lower = {t.lower() for t, _ in all_expansions[term]}
            for edge_term, weight in edges:
                if edge_term.lower() not in existing_lower:
                    all_expansions[term].append((edge_term, weight * 0.1))
        else:
            all_expansions[term] = [(t, w * 0.1) for t, w in edges]

    # Query terms for SQL = KG-present candidates + embedding-found KG terms
    # Non-KG candidates are excluded from SQL queries (they're generic words).
    query_terms = list(sql_candidates)
    for t in emb_found_terms:
        if t.lower() not in {q.lower() for q in query_terms}:
            query_terms.append(t)

    return query_terms, all_expansions


def enrich_query(user_message, resolved_intent=None, db=None, kg_term_index=None,
                 term_embeddings=None, sentence_embeddings=None,
                 associated_terms=None, associated_term_embeddings=None):
    """Main enrichment entry point. Embedding-first, then graph edges.

    Args:
        user_message: Original user question.
        resolved_intent: Optional Router-provided intent description.
        db: Optional SQLite DB connection (for testing).
        kg_term_index: Dict of {term: normalized_vector} for embedding similarity.
        term_embeddings: Dict of {query_term: embedding_vector} from batch embed call.
        sentence_embeddings: Dict of {text: embedding_vector} for full-sentence embeddings.
            Keys: user_message and optionally resolved_intent.
        associated_terms: List of LLM-curated domain terms from the router
            (e.g. ['indirekte Kalorimetrie', 'Energieumsatz', ...]). These
            are the most reliable signal for the precise query lane because
            the router LLM has already done domain reasoning on them.
        associated_term_embeddings: Dict of {associated_term: embedding_vector}
            so each router term can be cosine-matched against kg_term_index
            to find the actual KG term in the user's collection (handles
            morphology, synonyms, compound terms).

    Returns:
        Dict with all query data for the retrieval pipeline.
    """
    kg_term_index = kg_term_index or {}
    term_embeddings = term_embeddings or {}
    sentence_embeddings = sentence_embeddings or {}
    associated_terms = associated_terms or []
    associated_term_embeddings = associated_term_embeddings or {}

    # TIER 1: user's direct query
    tier1_candidates = extract_query_terms(user_message)
    primary_sentence_emb = sentence_embeddings.get(user_message)
    tier1_query_terms, tier1_expansions = _process_tier(
        tier1_candidates, kg_term_index, term_embeddings,
        sentence_embedding=primary_sentence_emb, db=db)

    # Collect all expansion terms for embedding query enrichment
    tier1_all_expanded = []
    for exps in tier1_expansions.values():
        for t, _ in exps:
            if t not in tier1_all_expanded:
                tier1_all_expanded.append(t)

    precise_primary, broad_primary = _build_queries(
        tier1_query_terms, tier1_expansions, original_terms=tier1_candidates)
    embedding_primary = _build_embedding_query(user_message, tier1_all_expanded)

    # TIER 2: resolved_intent (new terms only)
    tier2_terms = []
    precise_secondary = []
    broad_secondary = []
    embedding_secondary = ''

    if resolved_intent:
        tier2_candidates = extract_query_terms(resolved_intent)

        # Deduplicate: only NEW terms not already in Tier 1
        tier1_lower = {t.lower() for t in tier1_candidates}
        tier1_query_lower = {t.lower() for t in tier1_query_terms}
        tier1_exp_lower = {t.lower() for t in tier1_all_expanded}
        all_tier1_lower = tier1_lower | tier1_query_lower | tier1_exp_lower

        tier2_new = [t for t in tier2_candidates if t.lower() not in all_tier1_lower]

        if tier2_new:
            secondary_sentence_emb = sentence_embeddings.get(resolved_intent)
            tier2_query_terms, tier2_expansions = _process_tier(
                tier2_new, kg_term_index, term_embeddings,
                sentence_embedding=secondary_sentence_emb, db=db)
            tier1_expansions.update(tier2_expansions)

            tier2_all_expanded = []
            for exps in tier2_expansions.values():
                for t, _ in exps:
                    if t not in tier2_all_expanded:
                        tier2_all_expanded.append(t)

            precise_secondary, broad_secondary = _build_queries(
                tier2_query_terms, tier2_expansions, original_terms=tier2_new)
            embedding_secondary = _build_embedding_query(resolved_intent, tier2_all_expanded)
            tier2_terms = tier2_query_terms

    # ── TIER ROUTER: LLM-curated associated_terms → semantic KG match ────
    # The router's LLM has already done domain reasoning and given us
    # high-quality candidate terms. Embed-match each one against the user's
    # KG term index to find the actual canonical form in the collection
    # (handles German morphology, compound terms, and synonyms).
    # Result becomes the PRIMARY precise query lane — these beat anything
    # tier1/tier2 produces via word-splitting.
    router_kg_terms = []
    if associated_terms and kg_term_index:
        seen_router = set()

        # Step 1: Case-insensitive exact match against kg_term_index.
        # Catches "indirekte Kalorimetrie" → "indirekte Kalorimetrie" and
        # restores the canonical casing from the KG.
        kg_keys_lower = {k.lower(): k for k in kg_term_index.keys()}
        for t in associated_terms:
            canonical = kg_keys_lower.get((t or '').lower())
            if canonical and canonical.lower() not in seen_router:
                seen_router.add(canonical.lower())
                router_kg_terms.append(canonical)

        # Step 2: Embedding similarity against kg_term_index.
        # Catches "Energieumsatz" (LLM) → "Gesamtenergieumsatz",
        # "Ruheenergieumsatz" (KG variants). Also catches stem variants
        # ("Kalorimetrie" → "indirekte Kalorimetrie") that exact match
        # would miss.
        if associated_term_embeddings:
            router_expansions = _embedding_expand_terms(
                associated_terms,
                kg_term_index,
                associated_term_embeddings,
                sentence_embedding=None,
            )
            for t in associated_terms:
                for kg_t, _score in router_expansions.get(t, []):
                    if kg_t.lower() not in seen_router:
                        seen_router.add(kg_t.lower())
                        router_kg_terms.append(kg_t)

        if router_kg_terms:
            logger.info(
                "KG enrich: router associated_terms → %d KG matches (first %d): %s",
                len(router_kg_terms), min(8, len(router_kg_terms)),
                router_kg_terms[:8],
            )

    # If the router path produced any matches, promote them to the top of
    # precise_primary. They're already-validated domain terms; existing
    # tier1/tier2 queries (which may contain stopword decompositions when
    # the KG filter fell through) come second and are capped.
    if router_kg_terms:
        router_precise = ['"%s"' % t for t in router_kg_terms[:MAX_PRECISE_QUERIES]]
        existing_set_lower = {q.lower() for q in router_precise}
        tier_rest = [q for q in precise_primary if q.lower() not in existing_set_lower]
        precise_primary = (router_precise + tier_rest)[:MAX_PRECISE_QUERIES]

    # Metadata for logging/UI
    kg_terms_found = [t for t in tier1_query_terms if t not in tier1_candidates]

    return {
        'tier1_terms': tier1_query_terms,
        'tier2_terms': tier2_terms,
        'kg_terms_found': kg_terms_found,
        'router_kg_terms': router_kg_terms,
        'expansions': tier1_expansions,
        'precise_primary': precise_primary,
        'broad_primary': broad_primary,
        'precise_secondary': precise_secondary,
        'broad_secondary': broad_secondary,
        'embedding_primary': embedding_primary,
        'embedding_secondary': embedding_secondary,
        'unmatched_terms': [],  # No longer relevant — embedding handles everything
    }
