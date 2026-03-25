"""Tests for ai/term_extractor.py — local term extraction (no LLM)."""

try:
    from ai.term_extractor import TermExtractor, compute_collocations
except ImportError:
    import sys
    import os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
    from ai.term_extractor import TermExtractor, compute_collocations


class TestTermExtractor:
    """Test suite for TermExtractor (Implementation A: local, no LLM)."""

    def setup_method(self):
        self.extractor = TermExtractor()

    # ------------------------------------------------------------------ #
    # test_extracts_single_word_terms                                      #
    # ------------------------------------------------------------------ #

    def test_extracts_single_word_terms(self):
        """Known medical terms are returned as single-word results."""
        result = self.extractor.extract("Myokardinfarkt entsteht durch Ischämie")
        assert "Myokardinfarkt" in result
        assert "Ischämie" in result

    # ------------------------------------------------------------------ #
    # test_filters_stopwords                                               #
    # ------------------------------------------------------------------ #

    def test_filters_stopwords_german(self):
        """Common German stopwords are not returned."""
        result = self.extractor.extract("Das ist eine Methode der Medizin")
        # 'Das', 'ist', 'eine', 'der' are stopwords
        lower = [t.lower() for t in result]
        for sw in ("das", "ist", "eine", "der"):
            assert sw not in lower, f"Stopword '{sw}' should be filtered"

    def test_filters_stopwords_english(self):
        """Common English stopwords are not returned."""
        result = self.extractor.extract("The heart pumps blood through the body")
        lower = [t.lower() for t in result]
        for sw in ("the", "through"):
            assert sw not in lower, f"Stopword '{sw}' should be filtered"

    # ------------------------------------------------------------------ #
    # test_filters_short_words                                             #
    # ------------------------------------------------------------------ #

    def test_filters_short_words(self):
        """Words shorter than 3 chars are removed."""
        result = self.extractor.extract("Es ist so zu sagen")
        lower = [t.lower() for t in result]
        # 'Es', 'zu' are short stopwords anyway, but non-stopword 2-char
        # words like 'pH' are excluded unless they are known abbreviations
        for t in result:
            if t not in ("ATP", "GFR", "DNA", "RNA"):
                assert len(t) >= 3, f"Short token '{t}' should be filtered"

    def test_keeps_known_abbreviations(self):
        """Medical abbreviations ATP, GFR, DNA, RNA, mRNA are kept despite being short."""
        result = self.extractor.extract("ATP wird durch GFR und DNA reguliert")
        # At minimum ATP and DNA should survive (they are valid medical abbreviations)
        assert "ATP" in result
        assert "DNA" in result

    # ------------------------------------------------------------------ #
    # test_detects_hyphen_compounds                                        #
    # ------------------------------------------------------------------ #

    def test_detects_hyphen_compounds(self):
        """Hyphen/slash compounds are extracted as single terms."""
        text = "Na/K-ATPase und Acetyl-CoA sowie Henderson-Hasselbalch"
        result = self.extractor.extract(text)
        assert "Na/K-ATPase" in result, f"Na/K-ATPase not in {result}"
        assert "Acetyl-CoA" in result, f"Acetyl-CoA not in {result}"
        assert "Henderson-Hasselbalch" in result, f"Henderson-Hasselbalch not in {result}"

    def test_hyphen_compound_not_split(self):
        """Compounds should not also appear split into parts."""
        result = self.extractor.extract("Acetyl-CoA ist wichtig")
        # The full compound should be present; individual halves should not
        assert "Acetyl-CoA" in result
        # 'CoA' or 'Acetyl' alone should not appear (they were merged)
        assert "Acetyl" not in result
        assert "CoA" not in result

    # ------------------------------------------------------------------ #
    # test_detects_uppercase_chains                                        #
    # ------------------------------------------------------------------ #

    def test_detects_uppercase_chains(self):
        """Consecutive capitalized words (not stopwords) are grouped."""
        result = self.extractor.extract("Der Plexus brachialis versorgt die Obere Extremität")
        assert "Plexus brachialis" in result, f"Expected 'Plexus brachialis' in {result}"
        assert "Obere Extremität" in result, f"Expected 'Obere Extremität' in {result}"

    def test_uppercase_chain_stops_at_stopword(self):
        """A stopword within a chain breaks it into separate segments."""
        result = self.extractor.extract("Nervus vagus und Nervus phrenicus")
        assert "Nervus vagus" in result
        assert "Nervus phrenicus" in result
        # 'und' is a stopword so should not be part of any chain
        for t in result:
            assert "und" not in t.lower()

    # ------------------------------------------------------------------ #
    # test_strips_html                                                     #
    # ------------------------------------------------------------------ #

    def test_strips_html(self):
        """HTML tags are removed before extraction."""
        result = self.extractor.extract("<b>Myokardinfarkt</b> entsteht durch <i>Ischämie</i>")
        assert "Myokardinfarkt" in result
        assert "Ischämie" in result
        # No HTML fragments in results
        for term in result:
            assert "<" not in term and ">" not in term

    def test_strips_html_entities(self):
        """HTML entities are stripped/ignored."""
        result = self.extractor.extract("Herz &amp; Kreislauf: Myokardinfarkt")
        assert "Myokardinfarkt" in result
        for term in result:
            assert "&amp;" not in term

    # ------------------------------------------------------------------ #
    # test_empty_input                                                     #
    # ------------------------------------------------------------------ #

    def test_empty_string_returns_empty_list(self):
        """Empty string returns empty list."""
        assert self.extractor.extract("") == []

    def test_none_returns_empty_list(self):
        """None returns empty list."""
        assert self.extractor.extract(None) == []

    def test_whitespace_only_returns_empty_list(self):
        """Whitespace-only string returns empty list."""
        assert self.extractor.extract("   \t\n  ") == []

    # ------------------------------------------------------------------ #
    # test_returns_unique_terms                                            #
    # ------------------------------------------------------------------ #

    def test_returns_unique_terms(self):
        """Duplicate terms appear only once in the result."""
        result = self.extractor.extract("Myokardinfarkt Myokardinfarkt Ischämie Ischämie")
        assert result.count("Myokardinfarkt") == 1
        assert result.count("Ischämie") == 1

    def test_case_insensitive_dedup(self):
        """Same term in different cases is deduplicated (keep first-seen casing)."""
        result = self.extractor.extract("Ischämie ischämie ISCHÄMIE")
        # All three should collapse to exactly one entry
        lower_results = [t.lower() for t in result]
        assert lower_results.count("ischämie") == 1

    # ------------------------------------------------------------------ #
    # test_is_definition_heuristic                                         #
    # ------------------------------------------------------------------ #

    def test_is_definition_term_in_question(self):
        """Term in question → is_definition_card returns True."""
        assert self.extractor.is_definition_card(
            "Myokardinfarkt",
            "Was ist ein Myokardinfarkt?",
            "Ein Myokardinfarkt ist eine Nekrose des Myokards."
        ) is True

    def test_is_definition_what_is_pattern_english(self):
        """'What is' + term in question → True."""
        assert self.extractor.is_definition_card(
            "Ischemia",
            "What is Ischemia?",
            "Ischemia is a restriction in blood supply."
        ) is True

    def test_is_definition_define_pattern(self):
        """'Define' + term in question → True."""
        assert self.extractor.is_definition_card(
            "Apoptosis",
            "Define Apoptosis",
            "Programmed cell death."
        ) is True

    def test_is_definition_term_not_in_question(self):
        """Term absent from question → False."""
        assert self.extractor.is_definition_card(
            "Apoptosis",
            "What are the stages of mitosis?",
            "Prophase, Metaphase, Anaphase, Telophase"
        ) is False

    def test_is_definition_case_insensitive(self):
        """Check is case-insensitive."""
        assert self.extractor.is_definition_card(
            "ATP",
            "was ist atp?",
            "Adenosintriphosphat"
        ) is True

    # ------------------------------------------------------------------ #
    # set_collocations                                                     #
    # ------------------------------------------------------------------ #

    def test_set_collocations_merges_adjacent(self):
        """Adjacent tokens matching a collocation pair are merged."""
        extractor = TermExtractor()
        extractor.set_collocations({("Renale", "Hypertonie")})
        result = extractor.extract("Renale Hypertonie ist gefährlich")
        assert "Renale Hypertonie" in result
        # Should not also appear as two separate terms
        assert "Renale" not in result
        assert "Hypertonie" not in result


class TestPMICollocation:
    """Test suite for the compute_collocations() PMI function."""

    def test_detects_frequent_bigrams(self):
        """Bigrams with high frequency and PMI are returned as collocations."""
        texts = [
            "Osteogenesis imperfecta ist eine Erbkrankheit",
            "Bei Osteogenesis imperfecta ist Kollagen betroffen",
            "Typ I Osteogenesis imperfecta ist häufig",
            "Osteogenesis imperfecta betrifft Knochen",
            "Kollagen ist ein Protein",
            "Knochen bestehen aus Kollagen",
        ]
        collocations = compute_collocations(texts, min_count=3, pmi_threshold=2.0)
        assert ("Osteogenesis", "imperfecta") in collocations

    def test_ignores_rare_bigrams(self):
        """Bigrams appearing fewer than min_count times are not returned."""
        texts = ["Seltenes Wortpaar hier", "Anderer Text komplett"]
        collocations = compute_collocations(texts, min_count=3, pmi_threshold=2.0)
        assert len(collocations) == 0

    def test_extractor_uses_collocations(self):
        """TermExtractor merges adjacent tokens when they match a collocation."""
        extractor = TermExtractor()
        extractor.set_collocations({("Osteogenesis", "imperfecta")})
        terms = extractor.extract("Osteogenesis imperfecta ist eine Erkrankung")
        assert "Osteogenesis imperfecta" in terms
        assert "Osteogenesis" not in terms  # merged into compound

