"""
TermExtractor — Implementation A: local, no LLM.

Extracts technical/medical terms from card text using pure heuristics:
  1. Strip HTML
  2. Detect hyphen/slash compounds (Na/K-ATPase, Acetyl-CoA)
  3. Group consecutive capitalized tokens (Plexus brachialis)
  4. Filter stopwords and short non-abbreviation tokens
  5. Merge collocations (optional, set via set_collocations())
  6. Deduplicate
"""

import re
from typing import List, Optional, Set, Tuple

try:
    from ..utils.logging import get_logger
except ImportError:
    from utils.logging import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Known short medical abbreviations that must be preserved (< 3 chars)
# ---------------------------------------------------------------------------
_KEEP_ABBREVIATIONS: frozenset[str] = frozenset({
    "ATP", "ADP", "AMP", "GTP", "GDP", "GMP",
    "GFR", "DNA", "RNA", "mRNA", "tRNA", "rRNA",
    "LDL", "HDL", "TG", "pH", "IQ",
    "EKG", "EEG", "CT", "MR", "MRI",
    "HB", "Hb", "WBC", "RBC",
    "IM", "IV", "SC",
    "CO", "NO",
    "IL",
})

# ---------------------------------------------------------------------------
# Stopword list — German + English (~600 words)
# ---------------------------------------------------------------------------
_STOPWORDS: frozenset[str] = frozenset({
    # ---- German ----
    "der", "die", "das", "dem", "den", "des", "ein", "eine", "einen",
    "einem", "eines", "einer",
    "ist", "sind", "war", "waren", "wird", "werden", "wurde", "wurden",
    "hat", "haben", "hatte", "hatten", "hatte", "sein", "sein", "bin",
    "bist", "sei", "wäre", "wären",
    "mit", "von", "zu", "auf", "in", "an", "für", "und", "oder",
    "aber", "als", "wenn", "nicht", "auch", "aus", "bei", "nach",
    "über", "unter", "vor", "durch", "zwischen", "wie", "was", "wer",
    "wo", "noch", "nur", "sehr", "schon", "hier", "dort", "dann",
    "so", "nun", "da", "ob", "ja", "nein", "man", "kann", "muss",
    "soll", "darf", "mehr", "bis", "ohne", "gegen",
    "diese", "dieser", "dieses", "diesen", "diesem", "diesen",
    "welche", "welcher", "welches", "welchem", "welchen",
    "alle", "jede", "jeder", "jedes", "jedem", "jeden",
    "keine", "kein", "keiner", "keines", "keinem", "keinen",
    "einige", "einiger", "einiges", "einigem", "einigen",
    "bei", "beim", "zum", "zur", "im", "am", "um",
    "sich", "ihr", "ihre", "ihrem", "ihren", "ihres", "ihrer",
    "er", "es", "wir", "sie", "ihr", "mich", "dich", "ihn",
    "uns", "euch", "ihm", "ihnen",
    "mein", "meine", "meinem", "meinen", "meines", "meiner",
    "dein", "deine", "deinem", "deinen", "deines", "deiner",
    "sein", "seine", "seinem", "seinen", "seines", "seiner",
    "unser", "unsere", "unserem", "unseren", "unseres", "unserer",
    "euer", "eure", "eurem", "euren", "eures", "eurer",
    "werden", "wurde", "würde", "worden", "geworden",
    "haben", "hatte", "hätte", "gehabt",
    "sein", "war", "wäre", "gewesen",
    "können", "könnte", "konnte",
    "müssen", "müsste", "musste",
    "dürfen", "dürfte", "durfte",
    "sollen", "sollte",
    "wollen", "wollte",
    "mögen", "möchte", "mochte",
    "lassen", "ließ", "gelassen",
    "gehen", "ging", "gegangen",
    "kommen", "kam", "gekommen",
    "machen", "machte", "gemacht",
    "geben", "gab", "gegeben",
    "sehen", "sah", "gesehen",
    "stehen", "stand", "gestanden",
    "liegen", "lag", "gelegen",
    "auch", "schon", "noch", "erst", "bereits", "immer", "nie",
    "manchmal", "oft", "selten", "meist", "meistens",
    "viele", "vielen", "viele", "wenige", "wenigen",
    "andere", "anderen", "anderer", "anderes",
    "beide", "beiden",
    "jetzt", "heute", "gestern", "morgen", "früher", "später",
    "oben", "unten", "links", "rechts", "vorne", "hinten",
    "groß", "große", "großen", "großer", "großes",
    "klein", "kleine", "kleinen", "kleiner", "kleines",
    "gut", "gute", "guten", "guter", "gutes",
    "schlecht", "schlechte", "schlechten",
    "neu", "neue", "neuen", "neuer", "neues",
    "alt", "alte", "alten", "alter", "altes",
    "lang", "lange", "langen",
    "kurz", "kurze", "kurzen",
    "hoch", "hohe", "hohen",
    "niedrig", "niedrige", "niedrigen",
    "wichtig", "wichtige", "wichtigen",
    "richtig", "richtige", "richtigen",
    "gleich", "gleiche", "gleichen",
    "verschieden", "verschiedene", "verschiedenen",
    "bestimmte", "bestimmten", "bestimmter",
    "sowie", "beziehungsweise", "bzw", "bspw", "z.b", "d.h",
    "etc", "usw", "sog", "ggf",
    "einem", "einer",
    # ---- English ----
    "the", "a", "an", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "shall", "should", "can", "could", "may", "might",
    "must", "ought", "need",
    "i", "me", "my", "myself", "we", "our", "ours", "ourselves",
    "you", "your", "yours", "yourself", "yourselves",
    "he", "him", "his", "himself", "she", "her", "hers", "herself",
    "it", "its", "itself", "they", "them", "their", "theirs",
    "themselves", "what", "which", "who", "whom", "this", "that",
    "these", "those",
    "am", "as", "at", "by", "for", "from", "in", "into", "of",
    "off", "on", "onto", "out", "over", "past", "to", "up", "with",
    "and", "but", "or", "nor", "not", "so", "yet", "both", "either",
    "neither", "each", "few", "more", "most", "other", "some", "such",
    "no", "only", "same", "than", "too", "very", "just", "because",
    "if", "then", "when", "where", "while", "how", "all", "any",
    "before", "after", "above", "below", "between", "through",
    "during", "without", "within", "along", "following", "across",
    "behind", "beyond", "plus", "except", "up", "down",
    "also", "well", "thus", "hence", "therefore", "however",
    "although", "though", "even", "about", "around",
    "there", "here", "now", "then", "often", "always", "never",
    "sometimes", "already", "still", "again", "whether",
})

# Regex: compound with hyphen or slash between word-characters
_COMPOUND_RE = re.compile(
    r'\b[\w]+(?:[/\-][\w]+)+\b'
)

# HTML tag and entity stripping
_HTML_TAG_RE = re.compile(r'<[^>]+>')
_HTML_ENTITY_RE = re.compile(r'&[a-zA-Z#\d]+;')


def _strip_html(text: str) -> str:
    """Remove HTML tags and entities, collapse whitespace."""
    text = _HTML_TAG_RE.sub(' ', text)
    text = _HTML_ENTITY_RE.sub(' ', text)
    return re.sub(r'\s+', ' ', text).strip()


def _is_stopword(token: str) -> bool:
    return token.lower() in _STOPWORDS


def _should_keep(token: str) -> bool:
    """Return True if token should be included in results."""
    # Always keep known abbreviations regardless of length
    if token in _KEEP_ABBREVIATIONS or token.upper() in _KEEP_ABBREVIATIONS:
        return True
    # Filter by minimum length (< 3 chars removed)
    if len(token) < 3:
        return False
    # Filter stopwords
    if _is_stopword(token):
        return False
    return True


class TermExtractor:
    """
    Local (no-LLM) technical/medical term extractor.

    Processes plain or HTML card text and returns a deduplicated list of
    candidate terms using regex-based heuristics.
    """

    def __init__(self):
        self._collocations: Set[Tuple[str, str]] = set()

    # ------------------------------------------------------------------ #
    # Public API                                                           #
    # ------------------------------------------------------------------ #

    def extract(self, card_text: str) -> list[str]:
        """Return list of unique technical terms found in card_text."""
        if not card_text or not card_text.strip():
            return []

        try:
            return self._extract(card_text)
        except Exception:
            logger.exception("TermExtractor.extract failed")
            return []

    def is_definition_card(self, term: str, question: str, answer: str) -> bool:
        """
        Return True if this card likely defines the given term.

        Heuristic:
        - term appears in question (case-insensitive), OR
        - question contains a definition pattern ('Was ist', 'What is',
          'Define', etc.) AND the term appears in question or answer
        """
        if not term or not question:
            return False

        q_lower = question.lower()
        t_lower = term.lower()

        # Direct presence of term in question
        if t_lower in q_lower:
            return True

        # Pattern-based: definition pattern present AND term in answer
        _DEF_PATTERNS = (
            "was ist", "was sind",
            "what is", "what are",
            "define", "definition",
            "erkläre", "erklären", "erklärung",
            "beschreibe", "beschreiben",
        )
        has_def_pattern = any(p in q_lower for p in _DEF_PATTERNS)
        if has_def_pattern and answer and t_lower in answer.lower():
            return True

        return False

    def set_collocations(self, pairs: set) -> None:
        """Set pre-computed PMI collocation pairs for multi-word merging."""
        self._collocations = set(pairs)

    # ------------------------------------------------------------------ #
    # Internal implementation                                              #
    # ------------------------------------------------------------------ #

    def _extract(self, card_text: str) -> list[str]:
        # Step 1: strip HTML
        text = _strip_html(card_text)

        # Step 2: extract compounds BEFORE tokenizing (they vanish from the
        # token stream so they are not double-counted)
        compounds = _COMPOUND_RE.findall(text)
        # Remove compound occurrences from text so they don't re-appear
        for c in compounds:
            text = text.replace(c, ' ')

        # Step 3: split text into segments on sentence-boundary punctuation
        # (colon, semicolon, period, exclamation, question mark) so that
        # uppercase chains do not bleed across logical boundaries.
        segments = re.split(r'[;:.!?]+', text)

        all_tokens: list[str] = []
        all_chains: list[str] = []

        for segment in segments:
            # Tokenize each segment (split on whitespace and minor punctuation)
            tokens = re.split(r'[\s,()\[\]{}"\']+', segment)
            tokens = [t for t in tokens if t]

            # Detect head-capitalized chains within this segment
            chains = self._extract_uppercase_chains(tokens)
            all_chains.extend(chains)

            # Track which positions were consumed by chains
            consumed = self._consumed_by_chains(tokens, chains)

            # Collect surviving singles from this segment
            for i, t in enumerate(tokens):
                if i not in consumed:
                    all_tokens.append(t)

        # Step 4: filter singles by stopwords / length
        singles = [t for t in all_tokens if _should_keep(t)]

        # Step 5: combine compounds + chains + singles
        all_terms: list[str] = []
        all_terms.extend(compounds)
        all_terms.extend(all_chains)
        all_terms.extend(singles)

        # Step 6: apply collocations (merge adjacent surviving tokens)
        if self._collocations:
            # Rebuild a flat token list for collocation scanning
            flat_tokens = re.split(r'[\s,;:.!?()\[\]{}"\']+', _strip_html(card_text))
            flat_tokens = [t for t in flat_tokens if t]
            all_terms = self._apply_collocations(all_terms, flat_tokens)

        # Step 7: deduplicate (preserve order, case-insensitive)
        return self._deduplicate(all_terms)

    def _extract_uppercase_chains(self, tokens: list[str]) -> list[str]:
        """
        Walk tokens, group into chains that represent multi-word proper names.

        Rules:
        - Chain head: capitalized, non-stopword, has letters.
        - Chain continuation (two types allowed, up to 3 tokens total):
          a) Another capitalized non-stopword token (standard).
          b) Exactly ONE lowercase non-stopword, non-verb token that looks
             like a Latin/Greek anatomical qualifier (e.g. 'brachialis',
             'vagus', 'phrenicus').  May not follow type (b) with another.
        - Chain must be >= 2 tokens.
        """
        chains: list[str] = []
        i = 0
        while i < len(tokens):
            tok = tokens[i]
            if not self._is_chain_head(tok):
                i += 1
                continue

            chain = [tok]
            j = i + 1
            used_lowercase_slot = False

            while j < len(tokens) and len(chain) < 3:
                next_tok = tokens[j]
                # Never continue if this token is a case-variant of one already in chain
                if any(c.lower() == next_tok.lower() for c in chain):
                    break
                if self._is_chain_head(next_tok):
                    # Uppercase non-stopword: always continue
                    chain.append(next_tok)
                    j += 1
                elif (
                    not used_lowercase_slot
                    and self._is_latin_qualifier(next_tok, chain)
                ):
                    # Lowercase Latin qualifier: consume it (once)
                    chain.append(next_tok)
                    j += 1
                    used_lowercase_slot = True
                else:
                    break

            if len(chain) >= 2:
                chains.append(' '.join(chain))
                i = j
            else:
                i += 1
        return chains

    def _is_chain_head(self, token: str) -> bool:
        """True if token can START or continue (uppercase part of) a chain."""
        if not token:
            return False
        if not token[0].isupper():
            return False
        if _is_stopword(token):
            return False
        if not any(c.isalpha() for c in token):
            return False
        return True

    # Suffixes that disqualify a lowercase token as a Latin/Greek qualifier.
    # Order matters: longer suffixes first to avoid partial matches.
    _VERB_SUFFIXES = (
        # German verb/noun inflection
        "ierung", "ieren", "ierte", "iert",
        "ierung", "ungen",
        # German endings that are almost never Latin qualifiers
        "ung", "heit", "keit", "schaft", "nis", "ling",
        # German umlauted stems (medical German words, not Latin)
        "ämie", "öse", "üse",
        # Adjectival/verbal endings shared by German but NOT Latin anatomy
        "lich", "isch",
    )
    _VERB_ENDINGS = ("ent", "end", "ten", "ste", "tet", "gen", "hen",
                     "hen", "ben", "fen", "chen", "nnen")

    def _is_latin_qualifier(self, token: str, chain_so_far: Optional[List[str]] = None) -> bool:
        """
        Heuristic: True if a lowercase token looks like a Latin/Greek
        anatomical qualifier rather than a German word.

        Criteria:
        - non-stopword
        - >= 5 chars (Latin anatomical terms are rarely shorter)
        - all-alpha
        - does NOT end in common German verb/noun suffixes
        - is NOT a case-variant of any token already in the chain
        """
        if not token:
            return False
        if _is_stopword(token):
            return False
        if len(token) < 5:
            return False
        if not token.isalpha():
            return False
        t_lower = token.lower()

        # Reject if it is a case-variant of a word already in the chain
        if chain_so_far:
            for existing in chain_so_far:
                if existing.lower() == t_lower:
                    return False

        # Reject common German suffixes
        for suf in self._VERB_SUFFIXES:
            if t_lower.endswith(suf):
                return False
        for ending in self._VERB_ENDINGS:
            if t_lower.endswith(ending) and len(t_lower) - len(ending) >= 3:
                return False

        # Latin anatomical qualifiers tend to end in typical Latin endings:
        # -alis, -aris, -icus, -inus, -eus, -osus, -atus, -ilis, -anis,
        # -ius, -us, -is (and accusative -em, -um)
        _LATIN_ENDINGS = (
            "alis", "aris", "icus", "inus", "eus", "osus", "atus",
            "ilis", "anis", "ius", "uus",
            "agus", "enus", "anus", "amus",
            "us", "is", "um", "em",
        )
        for end in _LATIN_ENDINGS:
            if t_lower.endswith(end):
                return True

        return False

    def _consumed_by_chains(
        self, tokens: list[str], chains: list[str]
    ) -> set[int]:
        """
        Return the set of token indices that were consumed by chains.
        This is a best-effort O(n*m) pass; chains are short so acceptable.
        """
        consumed: set[int] = set()
        for chain in chains:
            parts = chain.split(' ')
            n = len(parts)
            for start in range(len(tokens) - n + 1):
                if tokens[start:start + n] == parts:
                    for k in range(start, start + n):
                        consumed.add(k)
                    break  # consume first occurrence only
        return consumed

    def _apply_collocations(
        self, terms: list[str], original_tokens: list[str]
    ) -> list[str]:
        """
        Scan original_tokens for adjacent pairs matching a collocation.
        Replace the pair with the merged form in the results list.
        Remove the individual tokens from results if they were merged.
        """
        merged_pairs: list[str] = []
        used_singles: set[str] = set()

        i = 0
        while i < len(original_tokens) - 1:
            pair = (original_tokens[i], original_tokens[i + 1])
            if pair in self._collocations:
                merged = f"{pair[0]} {pair[1]}"
                merged_pairs.append(merged)
                used_singles.add(pair[0])
                used_singles.add(pair[1])
                i += 2
            else:
                i += 1

        if not merged_pairs:
            return terms

        # Keep terms that were not consumed by a collocation merge
        result = [t for t in terms if t not in used_singles]
        result.extend(merged_pairs)
        return result

    @staticmethod
    def _deduplicate(terms: list[str]) -> list[str]:
        """Remove duplicates, case-insensitive, preserving first-seen casing."""
        seen: set[str] = set()
        result: list[str] = []
        for t in terms:
            key = t.lower()
            if key not in seen:
                seen.add(key)
                result.append(t)
        return result
