"""
Citation Validator — post-processing negative selection.

After the model generates a response with [N] citations, this module
checks each citation against its source using keyword overlap.
Invalid citations (sentence has no meaningful overlap with source) are
flagged for removal by the frontend.

Runs in the background after msg_done — no latency impact on the user.
"""
import re
from typing import List, Dict, Optional

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger
logger = get_logger(__name__)

# German + English stopwords (not content-bearing)
_STOPWORDS = frozenset({
    'der', 'die', 'das', 'ein', 'eine', 'und', 'oder', 'ist', 'sind',
    'wird', 'werden', 'hat', 'haben', 'bei', 'mit', 'von', 'für', 'auf',
    'als', 'auch', 'nach', 'über', 'aus', 'zum', 'zur', 'durch', 'des',
    'dem', 'den', 'im', 'in', 'an', 'am', 'es', 'er', 'sie', 'sich',
    'nicht', 'kann', 'können', 'sowie', 'bzw', 'wie', 'was', 'wenn',
    'einer', 'eines', 'einem', 'einen', 'diese', 'dieser', 'diesem',
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'could', 'should', 'may', 'might', 'must', 'shall',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'and', 'or', 'but', 'not', 'this', 'that', 'it', 'its',
})

# Minimum keyword overlap ratio to consider a citation valid
# 0.10 = at least 1 meaningful word overlap per 10 content words (conservative)
MIN_OVERLAP_RATIO = 0.10


def _extract_content_words(text: str) -> set:
    """Extract meaningful content words from text (lowercase, no stopwords)."""
    if not text:
        return set()
    # Remove special characters, keep alphanumeric + umlauts
    clean = re.sub(r'[^\w\säöüÄÖÜß]', ' ', text.lower())
    words = clean.split()
    # Filter: no stopwords, min 3 chars
    return {w for w in words if w not in _STOPWORDS and len(w) >= 3}


def _extract_sentences_with_citations(text: str) -> List[Dict]:
    """Extract sentences that contain [N] citations.

    Returns list of {index: int, sentence: str} for each unique [N] found.
    """
    if not text:
        return []

    results = []
    seen_indices = set()

    # Split into sentences (rough split on . ! ? followed by space/newline)
    sentences = re.split(r'(?<=[.!?])\s+', text)

    for sentence in sentences:
        # Find all [N] in this sentence
        matches = re.findall(r'\[(\d+)\]', sentence)
        for m in matches:
            idx = int(m)
            if idx not in seen_indices:
                seen_indices.add(idx)
                results.append({'index': idx, 'sentence': sentence})

    return results


def validate_citations(
    response_text: str,
    citations: List[Dict],
    context_lines: Optional[List[str]] = None,
) -> List[int]:
    """Validate citations in a model response via keyword overlap.

    For each [N] in the response text, checks if the citing sentence
    shares meaningful keywords with the source. If overlap is too low,
    the citation is flagged as invalid.

    Args:
        response_text: The model's response text containing [N] markers.
        citations: List of citation dicts from CitationBuilder.build().
        context_lines: Optional list of context string lines (the [N] ... format
                       sent to the model). If provided, used as source text.

    Returns:
        List of invalid citation indices that should be removed.
    """
    if not response_text or not citations:
        return []

    # Build source text lookup: index → text
    source_texts = {}

    # Prefer context_lines (what the model actually saw)
    if context_lines:
        for line in context_lines:
            match = re.match(r'^\[(\d+)\]\s*(.*)', line)
            if match:
                idx = int(match.group(1))
                source_texts[idx] = match.group(2)

    # Fallback: use citation front/back fields
    for cit in citations:
        idx = cit.get('index')
        if idx and idx not in source_texts:
            parts = []
            if cit.get('front'):
                parts.append(cit['front'])
            if cit.get('back'):
                parts.append(cit['back'])
            if parts:
                source_texts[idx] = ' '.join(parts)

    # Build set of current-card indices (always valid, skip validation)
    current_card_indices = set()
    for cit in citations:
        if cit.get('isCurrentCard'):
            current_card_indices.add(cit.get('index'))

    # Extract sentences with citations
    cited_sentences = _extract_sentences_with_citations(response_text)
    if not cited_sentences:
        return []

    invalid = []

    for entry in cited_sentences:
        idx = entry['index']
        sentence = entry['sentence']

        # Skip current card — always valid
        if idx in current_card_indices:
            logger.debug("Citation [%d] skipped (current card)", idx)
            continue

        source = source_texts.get(idx, '')
        if not source:
            # No source text available — can't validate, keep citation
            continue

        # Compare keyword overlap
        sentence_words = _extract_content_words(sentence)
        source_words = _extract_content_words(source)

        if not sentence_words or not source_words:
            continue

        overlap = sentence_words & source_words
        # Ratio relative to the smaller set (more generous)
        min_size = min(len(sentence_words), len(source_words))
        ratio = len(overlap) / min_size if min_size > 0 else 0

        if ratio < MIN_OVERLAP_RATIO:
            logger.info("Citation [%d] INVALID (overlap=%.2f, words=%s): sentence='%s' source='%s'",
                        idx, ratio,
                        overlap if overlap else '{}',
                        sentence[:80], source[:80])
            invalid.append(idx)
        else:
            logger.debug("Citation [%d] valid (overlap=%.2f, %d words): %s",
                         idx, ratio, len(overlap),
                         ', '.join(sorted(overlap)[:5]))

    if invalid:
        logger.info("Citation validation: %d/%d citations invalid → %s",
                    len(invalid), len(cited_sentences), invalid)

    return invalid
